"""OCR + vision server for Pokemon TCG card recognition.

Usage: python main.py
POST /identify  — multipart "file", returns {"text", "card_detected", "card_number"}
GET  /health    — returns {"ok": true}
"""

import logging
import lzma
import os
import pickle
from pathlib import Path

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
import easyocr


logging.basicConfig(level=logging.INFO)
_log = logging.getLogger(__name__)

app = FastAPI(title="pokedb-ocr")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_reader: easyocr.Reader | None = None
_card_ref = None

# ponytail: restrict to chars found on Pokemon cards — eliminates noise.
_POKEMON_CHARS = (
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/-.&',!?★♂♀ "
)


def get_reader() -> easyocr.Reader:
    global _reader  # noqa: PLW0603
    if _reader is None:
        _log.info("Loading EasyOCR…")
        _reader = easyocr.Reader(["en"])
    return _reader


# ── Card Reference (pre-built master set from pokemon-card-recognizer) ──


def load_card_ref() -> None:
    """Load master card reference pickle (lzma-compressed)."""
    global _card_ref
    p = (
        Path(__file__).resolve().parent
        / "venv"
        / "Lib"
        / "site-packages"
        / "pokemon_card_recognizer"
        / "reference"
        / "data"
        / "ref_build"
        / "master.pkl"
    )
    try:
        with open(p, "rb") as f:
            _card_ref = pickle.loads(lzma.decompress(f.read()))
        _log.info(
            "card reference loaded: %s (%d cards)", _card_ref.name, len(_card_ref.cards)
        )
    except Exception as e:
        _log.warning("failed to load card reference: %s", e)


def _classify_shared_words(
    ref_mat: np.ndarray, v: np.ndarray
) -> tuple[int, np.ndarray]:
    """Best matching card by shared word count."""
    scores = ((ref_mat > 0) & (v > 0)).sum(axis=1)
    prob = scores / (ref_mat > 0).sum(axis=1)
    return int(scores.argmax()), prob


# ── Image helpers ──


def _load(buf: bytes) -> np.ndarray:
    arr = np.frombuffer(buf, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(400, "Could not decode image")
    return img


# ponytail: simple preprocessing pipeline. cv2.fastNlMeansDenoising is
# expensive for large images; downsample first if latency matters.
def preprocess(img: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    denoised = cv2.fastNlMeansDenoising(gray, h=30)
    kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
    sharpened = cv2.filter2D(denoised, -1, kernel)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    return clahe.apply(sharpened)


# ponytail: simple card detection via largest quadrilateral contour.
def detect_card(img: np.ndarray) -> np.ndarray | None:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 30, 150)
    dilated = cv2.dilate(edges, None, iterations=3)
    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    contours = sorted(contours, key=cv2.contourArea, reverse=True)
    for c in contours:
        peri = cv2.arcLength(c, True)
        for eps in (0.02, 0.03, 0.04):
            approx = cv2.approxPolyDP(c, eps * peri, True)
            if len(approx) != 4:
                continue
            warped = _four_point_transform(img, approx.reshape(4, 2).astype(np.float32))
            if warped.shape[0] < 100 or warped.shape[1] < 100:
                continue
            return warped
    return None


def _four_point_transform(img: np.ndarray, pts: np.ndarray) -> np.ndarray:
    by_y = pts[np.argsort(pts[:, 1])]
    top = by_y[:2]
    bottom = by_y[2:]
    top = top[np.argsort(top[:, 0])]
    bottom = bottom[np.argsort(bottom[:, 0])]
    rect = np.array([top[0], top[1], bottom[1], bottom[0]], dtype=np.float32)

    w = int(
        max(
            np.linalg.norm(rect[1] - rect[0]),
            np.linalg.norm(rect[2] - rect[3]),
        )
    )
    h = int(
        max(
            np.linalg.norm(rect[3] - rect[0]),
            np.linalg.norm(rect[2] - rect[1]),
        )
    )
    dst = np.array([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]], dtype=np.float32)
    M = cv2.getPerspectiveTransform(rect, dst)
    return cv2.warpPerspective(img, M, (w, h))


# ── Endpoints ──


def _ocr_one(reader: easyocr.Reader, data: bytes, filename: str) -> dict:
    """Run OCR on a single image, classify against card reference."""
    _log.info("ocr %s (%d bytes)", filename, len(data))
    img = _load(data)
    card_img = detect_card(img)

    # OCR the relevant image region
    source = card_img if card_img is not None else img
    processed = preprocess(source)
    results = reader.readtext(processed, allowlist=_POKEMON_CHARS)
    text = " ".join(r[1] for r in results if r[2] > 0.3).strip()

    # Classify against card reference
    parsed_name = text
    card_number = ""
    parsed_set = ""
    card_set_id = ""
    image_url = ""
    card_detected = False

    if _card_ref is not None and text:
        words = [w.lower() for w in text.split() if len(w) > 1]
        v = _card_ref.vocab.vect(words, method="encapsulation_match")
        if v.sum() > 0:
            idx, probs = _classify_shared_words(_card_ref.ref_mat, v)
            conf = float(probs[idx])
            if conf > 0.05:
                card = _card_ref.cards[idx]
                parsed_name = card.name
                card_number = str(card.number)
                parsed_set = card.set.name
                card_set_id = card.set.id
                # ponytail: Limitless CDN URL pattern
                image_url = f"https://www.limitlesstcg.com/cards/en/{card_set_id}/{card_number}.png"
                card_detected = True
                _log.info(
                    "classified %s #%s (%s) conf=%.3f",
                    parsed_name,
                    card_number,
                    parsed_set,
                    conf,
                )

    return {
        "text": text,
        "card_detected": card_detected,
        "card_number": card_number,
        "parsed_name": parsed_name,
        "parsed_set_name": parsed_set,
        "card_set_id": card_set_id if card_detected else "",
        "image_url": image_url if card_detected else "",
    }


@app.post("/identify")
async def identify(request: Request) -> list[dict]:
    """OCR one or more images. Returns list of results."""
    form = await request.form()
    file_list = form.getlist("files")
    if not file_list:
        single = form.get("file")
        if single:
            file_list = [single]
    reader = get_reader()
    results = []
    for f in file_list:
        data = await f.read()
        results.append(_ocr_one(reader, data, f.filename or ""))
    return results


@app.get("/health")
async def health() -> dict:
    return {
        "ok": True,
        "loaded": _reader is not None,
        "card_ref": _card_ref is not None,
    }


if __name__ == "__main__":
    load_card_ref()
    import uvicorn

    port = int(os.environ.get("OCR_PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
