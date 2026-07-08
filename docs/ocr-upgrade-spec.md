# OCR Upgrade Spec

**Goal:** Fix wrong card data inserted by current OCR pipeline.

**Root cause:** EasyOCR misreads card text on blurry/low-res captures → wrong card saved.

---

## Phase 1 — PaddleOCR swap (today)

**Files:** `ocr-server/main.py`

- Replace `easyocr` with `paddleocr` (`PaddleOCR`)
- Remove `torch` dep (paddlepaddle has its own runtime)
- Same API: `ocr(img)` returns `[(bbox, text, conf)]`
- Same `readtext` → `ocr()` call pattern
- Keep preprocessing pipeline (grayscale → denoise → CLAHE)

**Deps:** `pip install paddlepaddle paddleocr` (no GPU needed, CPU-only inference)

**Estimated effort:** 30 min

---

## Phase 2 — Sharpen preprocessing (today)

**File:** `ocr-server/main.py`

- Add sharpening kernel before CLAHE in `preprocess()`
- `kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])`
- `cv2.filter2D(denoised, -1, kernel)`

**Why:** CLAHE increases contrast but doesn't fix blur. Sharp kernel makes text edges crisper for OCR.

**Estimated effort:** 5 min

---

## Phase 3 — Template matching fallback (next session)

**File:** `ocr-server/main.py` (new endpoint or inline in `/identify`)

- When OCR confidence < threshold OR card_number empty:
  1. [Removed — pokemontcg.io is now paid. No free card image API available.]
  2. `cv2.matchTemplate` + `cv2.minMaxLoc` against card crop
  3. Return matched card's name/number/set from template data

**Dep:** 0 new (cv2 does it)

**Data:** [Removed — pokemontcg.io is now paid.]

**Cache:** Dict keyed by set ID, evict on server restart. Upgrade to SQLite if memory grows.

**Estimated effort:** 2-3h

---

## Phase 4 — YOLO detection (if phases 1-3 still fail)

**File:** New `ocr-server/train/` directory

- Label 200 images using labelme or CVAT
- `yolo train model=yolov8n.pt data=cards.yaml epochs=50`
- Export ONNX, replace `detect_card()` with YOLO inference
- 0 new pip deps (ultralytics already has onnx export)

**Estimated effort:** 3-4h (labeling) + 2-4h (Colab training)

---

## Rollback

- Phase 1: swap import, same API — no structural change
- Phase 2: one function edit
- Phase 3: additive (fallback, never replaces primary path)
- Phase 4: separate file, `detect_card()` becomes thin wrapper over model or legacy contour logic with a flag

---

## Success criteria

1. Upload same image that inserted wrong data → correct card saved
2. `/identify` returns `parsed_name`, `parsed_set_name`, `card_number` matching actual card
3. Build: `python -m py_compile main.py` passes
4. Frontend build: `pnpm lint && pnpm next build` passes
