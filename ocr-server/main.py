"""OCR + vision server for Pokemon TCG card recognition.

Usage: python main.py
POST /identify  — multipart "file", returns {"text", "card_detected", "card_number"}
POST /health    — returns {"ok": true}
"""

import json
import logging
import os
import urllib.request
from urllib.parse import quote

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException, UploadFile
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


def get_reader() -> easyocr.Reader:
    global _reader  # noqa: PLW0603
    if _reader is None:
        _log.info("Loading EasyOCR…")
        _reader = easyocr.Reader(["en"])
    return _reader


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
    # sharpen
    kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
    sharpened = cv2.filter2D(denoised, -1, kernel)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    return clahe.apply(sharpened)


# ponytail: simple card detection via largest quadrilateral contour.
# Fails on cluttered backgrounds; upgrade to a CNN detector when needed.
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
            # ponytail: skip tiny crops — likely a false positive contour
            if warped.shape[0] < 100 or warped.shape[1] < 100:
                continue
            return warped
    return None


def _four_point_transform(img: np.ndarray, pts: np.ndarray) -> np.ndarray:
    # ponytail: sort by y→x order. More robust than sum/diff which can alias two points.
    # order: top-left, top-right, bottom-right, bottom-left
    by_y = pts[np.argsort(pts[:, 1])]
    top = by_y[:2]
    bottom = by_y[2:]
    top = top[np.argsort(top[:, 0])]  # left then right
    bottom = bottom[np.argsort(bottom[:, 0])]  # left then right
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


def _encode(img: np.ndarray, fmt: str = ".jpg") -> bytes:
    ok, buf = cv2.imencode(fmt, img)
    if not ok:
        raise HTTPException(500, "Image encoding failed")
    return buf.tobytes()


# ── Template matching (Phase 3) ──
# ponytail: in-memory cache, reset on restart. SQLite if memory grows.

# ponytail: PTCG API v2 blocks Python-urllib UA
_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
_template_cache: dict[str, dict] = {}
PTCG = "https://api.pokemontcg.io/v2"


def _ptcg_search(name_hint: str, number_hint: str) -> list[dict]:
    q = f"name:{quote(name_hint)}"
    if number_hint:
        q += f" number:{quote(number_hint)}"
    url = f"{PTCG}/cards?q={q}&pageSize=20&select=id,name,set,number,images"
    req = urllib.request.Request(url, headers={"User-Agent": _UA})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
    except Exception:
        return []
    return [
        {
            "id": c["id"],
            "name": c["name"],
            "set_name": c["set"]["name"],
            "number": c["number"],
            "image_url": c["images"]["large"],
        }
        for c in data.get("data", [])
    ]


def _download_img(url: str) -> np.ndarray | None:
    req = urllib.request.Request(url, headers={"User-Agent": _UA})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            buf = r.read()
        arr = np.frombuffer(buf, dtype=np.uint8)
        return cv2.imdecode(arr, cv2.IMREAD_COLOR)
    except Exception:
        return None


def _match_template(crop: np.ndarray, candidates: list[dict]) -> dict | None:
    """Return the candidate card whose image best matches the crop."""
    crop_gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    best_score, best_card = -1.0, None

    for c in candidates:
        cid = c["id"]
        if cid not in _template_cache:
            img = _download_img(c["image_url"])
            if img is None:
                continue
            _template_cache[cid] = {**c, "img": img}

        cached = _template_cache[cid]
        template = cv2.cvtColor(cached["img"], cv2.COLOR_BGR2GRAY)
        h, w = crop_gray.shape
        resized = cv2.resize(template, (w, h))
        result = cv2.matchTemplate(crop_gray, resized, cv2.TM_CCOEFF_NORMED)
        score = float(result[0, 0])

        if score > best_score:
            best_score, best_card = score, c

    # ponytail: low threshold — crop is already aligned, any match above noise works
    return best_card if best_score > 0.3 else None


# ── Endpoints ──


@app.post("/identify")
async def identify(file: UploadFile) -> dict:
    """Detect card region then OCR it for better accuracy."""
    import base64

    reader = get_reader()
    data = await file.read()
    _log.info("identify %s (%d bytes)", file.filename, len(data))
    img = _load(data)
    card_img = detect_card(img)

    if card_img is None:
        # Fallback: OCR full image
        processed = preprocess(img)
        results = reader.readtext(processed)
        text = " ".join(r[1] for r in results if r[2] > 0.3)
        return {
            "text": text.strip(),
            "card_detected": False,
            "card_number": "",
            "parsed_name": text.strip(),
            "parsed_set_name": "",
            "image": base64.b64encode(_encode(img)).decode(),
        }

    # OCR on card region only
    processed = preprocess(card_img)
    results = reader.readtext(processed)
    text = " ".join(r[1] for r in results if r[2] > 0.3)

    # ponytail: naive card number parse, e.g. "123/162"
    card_num = ""
    name_part = text.strip()
    set_part = ""
    for token in text.split():
        if "/" in token and token.split("/")[0].isdigit():
            card_num = token
            idx = text.index(token)
            name_part = text[:idx].strip()
            set_part = text[idx + len(token) :].strip()
            break

    # Phase 3: template matching fallback when OCR didn't find a number
    match = None
    if not card_num and name_part:
        candidates = _ptcg_search(name_part, "")
        if candidates:
            match = _match_template(card_img, candidates)
            if match:
                _log.info("template matched: %s #%s", match["name"], match["number"])

    if match:
        name_part = match["name"]
        card_num = match["number"]
        set_part = match["set_name"]

    return {
        "text": text.strip(),
        "card_detected": True,
        "card_number": card_num,
        "parsed_name": name_part,
        "parsed_set_name": set_part,
        "image": base64.b64encode(_encode(card_img)).decode(),
    }


@app.get("/health")
async def health() -> dict:
    return {"ok": True, "loaded": _reader is not None}


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("OCR_PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
