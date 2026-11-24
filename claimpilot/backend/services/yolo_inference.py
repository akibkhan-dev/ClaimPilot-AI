# services/yolo_inference.py
# ---------------------------------------------------------------------------
# YOLO damage inference — runs the YOLOv8-seg model on an uploaded image and
# converts segmentation masks into a structured severity + area result.
#
# Called ONLY from routes/damage.py.  The YOLO model object is imported from
# services/ml_models.py (loaded once at startup, never reloaded here).
# ---------------------------------------------------------------------------

import io
import logging
import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Severity thresholds (damage area as % of total image pixels)
# Tune these values against your training data if needed.
# ---------------------------------------------------------------------------

AREA_THRESHOLDS = {
    "minor":    (0.0,  5.0),    # damage area < 5 %  → minor
    "moderate": (5.0,  20.0),   # 5 % – 20 %         → moderate
    "severe":   (20.0, 100.0),  # > 20 %              → severe
}

# Minimum YOLO detection confidence to trust the result.
# This model outputs raw scores in the 0.001–0.015 range (confirmed via diagnostic).
# Threshold set to 0.01 to accept the top detections while filtering noise.
MIN_CONFIDENCE_THRESHOLD = 0.01


def _area_to_severity(damage_area_pct: float) -> str:
    """Map a damage-area percentage to a severity label."""
    if damage_area_pct < AREA_THRESHOLDS["moderate"][0]:
        return "minor"
    if damage_area_pct < AREA_THRESHOLDS["severe"][0]:
        return "moderate"
    return "severe"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def run_yolo(image_bytes: bytes) -> dict | None:
    """
    Run the YOLOv8-seg model on the supplied image bytes.

    Primary output:
        {
            "damage_area_pct": float,   # % of image area covered by masks
            "severity":        str,     # "minor" | "moderate" | "severe"
            "confidence":      float,   # top-detection confidence (0–1)
            "damaged_part":    str,     # class label or generic "detected region"
        }

    Returns None (triggering Groq fallback) when:
        • The model object is not loaded (ml_models.yolo_model is None).
        • No masks are detected in the image.
        • Top-detection confidence is below MIN_CONFIDENCE_THRESHOLD.
        • Any exception occurs during inference.
    """
    # ── Import guard: model singleton ────────────────────────────────────────
    from services import ml_models
    if ml_models.yolo_model is None:
        print("[yolo_inference] Model not loaded — skipping YOLO path.")
        return None

    try:
        from PIL import Image  # pulled in as ultralytics transitive dep

        # Decode bytes → PIL Image (YOLO accepts PIL Images directly)
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_w, img_h = image.size
        total_pixels  = img_w * img_h
        print(f"[yolo_inference] Image size: {img_w}x{img_h} ({total_pixels} px)")

        # ── Run inference ─────────────────────────────────────────────────
        # Pass conf= so YOLO's internal NMS uses the same threshold we check below.
        # Without this, YOLO defaults to conf=0.25 internally and silently drops
        # all boxes before they reach our code — which is why we saw 0 detections.
        results = ml_models.yolo_model(image, verbose=False, conf=MIN_CONFIDENCE_THRESHOLD)

        if not results or len(results) == 0:
            print("[yolo_inference] No results returned by YOLO model.")
            return None

        result = results[0]  # single-image batch → take first element

        # ── Extract detection confidence ──────────────────────────────────
        boxes = result.boxes
        if boxes is None or len(boxes) == 0:
            print("[yolo_inference] No boxes detected — triggering fallback.")
            return None

        num_boxes = len(boxes)
        top_conf  = float(boxes.conf.max().item())
        print(f"[yolo_inference] Detected {num_boxes} box(es), top confidence: {top_conf:.4f}")

        if top_conf < MIN_CONFIDENCE_THRESHOLD:
            print(
                f"[yolo_inference] Top confidence {top_conf:.3f} below threshold "
                f"{MIN_CONFIDENCE_THRESHOLD:.2f} — triggering fallback."
            )
            return None

        # ── Extract damaged_part label ────────────────────────────────────
        # If the model has named classes, use the label of the best detection.
        # Otherwise fall back to a generic description.
        try:
            best_cls_idx  = int(boxes.cls[boxes.conf.argmax()].item())
            class_names   = result.names          # dict {int: str} from YOLO
            damaged_part  = class_names.get(best_cls_idx, "detected region")
            print(f"[yolo_inference] Best class idx={best_cls_idx} → '{damaged_part}'")
        except Exception as e:
            damaged_part = "detected region"
            print(f"[yolo_inference] Could not resolve class name: {e}")

        # ── Compute damage area from segmentation masks ───────────────────
        masks = result.masks
        damage_area_pct = 0.0

        if masks is not None and masks.data is not None:
            # masks.data shape: (N, H, W) — binary 0/1 per-pixel masks
            mask_union    = masks.data.any(dim=0).cpu().numpy()   # boolean H×W
            masked_pixels = int(mask_union.sum())
            damage_area_pct = (masked_pixels / total_pixels) * 100.0
            print(f"[yolo_inference] Mask area: {masked_pixels} px = {damage_area_pct:.2f}%")
        else:
            # Segmentation masks absent (detection-only model?):
            # Rough fallback — estimate area from bounding-box coverage.
            print("[yolo_inference] No segmentation masks — estimating area from bboxes.")
            total_bbox_area = 0.0
            for box in boxes.xyxy:
                x1, y1, x2, y2 = box.tolist()
                total_bbox_area += (x2 - x1) * (y2 - y1)
            damage_area_pct = min((total_bbox_area / total_pixels) * 100.0, 100.0)
            print(f"[yolo_inference] BBox area estimate: {damage_area_pct:.2f}%")

        severity = _area_to_severity(damage_area_pct)

        print(
            f"[yolo_inference] Detection OK — area={damage_area_pct:.1f}%, "
            f"severity={severity}, conf={top_conf:.3f}"
        )

        return {
            "damage_area_pct": round(damage_area_pct, 2),
            "severity":        severity,
            "confidence":      round(top_conf, 4),
            "damaged_part":    damaged_part,
        }

    except Exception as exc:
        print(f"[yolo_inference] Inference failed: {exc} — triggering Groq fallback.")
        return None
