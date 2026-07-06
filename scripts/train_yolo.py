#!/usr/bin/env python3
"""Train YOLOv8 card detector.

Requirements: pip install ultralytics

Dataset structure:
  datasets/pokemon-cards/
    images/train/   — real photos of cards (not official scans)
    images/val/     — validation photos
    labels/train/   — YOLO .txt per image, same stem
    labels/val/

Label format per .txt:
  0 0.5 0.5 0.3 0.4
  ──── class_id (0 = card)
       ──────────── x_center y_center width height (normalized 0–1)

Usage:
  python scripts/train_yolo.py [--epochs 50] [--batch 16]

Output: runs/train/exp/weights/best.pt
"""

import argparse
from ultralytics import YOLO

parser = argparse.ArgumentParser()
parser.add_argument("--epochs", type=int, default=50)
parser.add_argument("--batch", type=int, default=16)
parser.add_argument("--imgsz", type=int, default=640)
args = parser.parse_args()

model = YOLO("yolov8n.pt")  # pretrained nano
model.train(
    data="scripts/card-dataset.yaml",
    epochs=args.epochs,
    batch=args.batch,
    imgsz=args.imgsz,
    device="cpu",  # change to "0" for GPU
    project="yolo-training",
    name="pokemon-cards",
)
