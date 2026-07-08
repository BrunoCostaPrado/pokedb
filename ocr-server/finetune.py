"""Validate + prepare training data for EasyOCR fine-tuning.

Usage:
    python finetune.py                  # validate OCR accuracy on training images
    python finetune.py --crops          # extract text crops for fine-tuning
"""

import argparse
import json
import logging
import sys
from pathlib import Path

import cv2
import easyocr
import numpy as np

logging.basicConfig(level=logging.INFO, format="%(message)s")
_log = logging.getLogger("finetune")

TRAINING_DIR = Path(__file__).resolve().parent / "training-data"
INDEX_PATH = TRAINING_DIR / "_templates.json"
CROPS_DIR = TRAINING_DIR.parent / "training-crops"

_POKEMON_CHARS = (
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/-.&',!?★♂♀ "
)


def _preprocess(img: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    denoised = cv2.fastNlMeansDenoising(gray, h=30)
    kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
    sharpened = cv2.filter2D(denoised, -1, kernel)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    return clahe.apply(sharpened)


def load_index() -> dict[str, dict]:
    if not INDEX_PATH.exists():
        _log.error("_templates.json not found at %s", INDEX_PATH)
        _log.error("Run `pnpm import-set SET --images` first")
        sys.exit(1)
    with open(INDEX_PATH) as f:
        return json.load(f)


def validate() -> None:
    """Run OCR on each training image and compare with expected text."""
    index = load_index()
    reader = easyocr.Reader(["en"])
    total = len(index)
    name_ok = num_ok = 0
    errors: list[dict] = []

    keys = sorted(index.keys())
    for i, key in enumerate(keys, 1):
        meta = index[key]
        img_path = TRAINING_DIR / f"{key}.jpg"
        if not img_path.exists():
            _log.warning("  [%d/%d] %s — image missing", i, total, key)
            continue

        img = cv2.imread(str(img_path))
        if img is None:
            _log.warning("  [%d/%d] %s — corrupt image", i, total, key)
            continue

        processed = _preprocess(img)
        results = reader.readtext(processed, allowlist=_POKEMON_CHARS)
        text = " ".join(r[1] for r in results if r[2] > 0.3)

        # check if expected name appears in OCR text
        expected_name = meta["name"].lower()
        expected_num = meta["number"]
        text_lower = text.lower()

        name_match = expected_name in text_lower
        num_match = expected_num in text
        if "/" in expected_num:
            num_match = num_match or expected_num.split("/")[0] in text

        if name_match:
            name_ok += 1
        if num_match:
            num_ok += 1

        if not name_match or not num_match:
            errors.append(
                {
                    "key": key,
                    "expected_name": meta["name"],
                    "expected_num": meta["number"],
                    "got": text.strip(),
                    "name_ok": name_match,
                    "num_ok": num_match,
                }
            )

        _log.info(
            "  [%d/%d] %s — %sname %snum  '%s'",
            i,
            total,
            key,
            "+" if name_match else "✗",
            "+" if num_match else "✗",
            text.strip()[:60],
        )

    _log.info("")
    _log.info("=== Validation Report ===")
    _log.info("Cards:  %d", total)
    _log.info("Name:   %d/%d (%.0f%%)", name_ok, total, 100 * name_ok / total)
    _log.info("Number: %d/%d (%.0f%%)", num_ok, total, 100 * num_ok / total)

    if errors:
        _log.info("")
        _log.info("=== Errors (%d) ===", len(errors))
        for e in errors:
            _log.info(
                "  %s: want name='%s' num=%s, got '%s'",
                e["key"],
                e["expected_name"],
                e["expected_num"],
                e["got"],
            )


def extract_crops() -> None:
    """Detect text regions, assign labels, save to training-crops/."""
    index = load_index()
    reader = easyocr.Reader(["en"])

    label_map: dict[int, str] = {}  # path -> label text
    crop_count = 0

    for key, meta in sorted(index.items()):
        img_path = TRAINING_DIR / f"{key}.jpg"
        if not img_path.exists():
            continue

        img = cv2.imread(str(img_path))
        if img is None:
            continue

        results = reader.readtext(img, allowlist=_POKEMON_CHARS)
        for bbox, text, conf in results:
            if conf < 0.5 or not text.strip():
                continue
            pts = np.array(bbox, dtype=np.int32)
            x, y, w, h = cv2.boundingRect(pts)
            # skip tiny or huge boxes
            if w < 10 or h < 10 or w > img.shape[1] * 0.9:
                continue

            crop = img[y : y + h, x : x + w]
            # assign label heuristically
            label = _assign_label(text.strip(), meta)
            out_dir = CROPS_DIR / key
            out_dir.mkdir(parents=True, exist_ok=True)
            crop_path = out_dir / f"{label}_{crop_count}.jpg"
            cv2.imwrite(str(crop_path), crop)

            with open(out_dir / "metadata.jsonl", "a") as mf:
                mf.write(
                    json.dumps(
                        {
                            "file": crop_path.name,
                            "text": text.strip(),
                            "label": label,
                            "confidence": round(conf, 3),
                            "bbox": [x, y, w, h],
                        }
                    )
                    + "\n"
                )
            crop_count += 1

    _log.info("Extracted %d crops to %s", crop_count, CROPS_DIR)
    _log.info("EasyOCR training: clone https://github.com/JaidedAI/EasyOCR")
    _log.info("  then copy crops/ into EasyOCR/trainer/ and follow trainer/README.md")


def _assign_label(text: str, meta: dict) -> str:
    """Heuristic: classify detected text as name/number/set/unknown."""
    t = text.strip().lower()
    if "/" in text and text.replace("/", "").replace(" ", "").isdigit():
        return "number"
    if t == meta["name"].lower():
        return "name"
    if t == meta["set_name"].lower():
        return "set"
    # partial: text is a substring of name
    if len(t) > 3 and t in meta["name"].lower():
        return "name_partial"
    if len(t) > 3 and t in meta["set_name"].lower():
        return "set_partial"
    return "unknown"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="EasyOCR fine-tuning prep")
    parser.add_argument("--crops", action="store_true", help="extract text crops")
    args = parser.parse_args()

    if args.crops:
        extract_crops()
    else:
        validate()
