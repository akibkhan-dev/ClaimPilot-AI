# Module A endpoints — handles vehicle damage image upload and cost estimation requests
#
# ESTIMATION PIPELINE
# ===================
#
# PRIMARY PATH (trained models):
#   image → YOLOv8-seg → damage area % + severity
#         → RandomForestRegressor (+ optional vehicle metadata) → estimated cost INR
#   estimation_source: "trained_model"
#
# FALLBACK PATH (Groq LLM — used when primary fails):
#   image → Groq vision model → severity + damaged_part
#         → cost_mapping.get_cost_estimate() → estimated cost INR
#   estimation_source: "groq_llm"  or  "fallback_table"
#   (cost_mapping internally falls back to fallback_table if Groq text also fails)
#
# The fallback is triggered automatically when:
#   • Either trained model failed to load at startup
#   • YOLO returns no detections or low-confidence result
#   • RF prediction returns None (unseen labels, bad output, exception)
#   • Any exception in the primary path
#
# All existing response fields are preserved so the frontend is unaffected.
# The new "estimation_source" field identifies which path produced the result.

from fastapi import APIRouter, UploadFile, File, Form
from typing import Optional
from services import groq_client, cost_mapping, yolo_inference, rf_inference

router = APIRouter()

# ---------------------------------------------------------------------------
# Prompt constants (Groq fallback path — unchanged from original)
# ---------------------------------------------------------------------------

DAMAGE_VISION_PROMPT = """You are an auto-insurance damage assessor. Look at this photo of a damaged \
vehicle and respond with ONLY a JSON object, no other text, in exactly this format:

{
  "severity": "minor" | "moderate" | "severe",
  "confidence": <number between 0 and 1>,
  "damaged_part": "<short description, e.g. 'front bumper'>",
  "reasoning": "<one short sentence>"
}

If the image does not clearly show vehicle damage, set severity to "unclear" \
and confidence below 0.4."""

FALLBACK_VISION_RESULT = {
    "severity":     "moderate",
    "confidence":   0.5,
    "damaged_part": "unknown",
    "reasoning":    "Fallback estimate — AI call unavailable, using default midpoint.",
}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _run_primary_path(
    image_bytes: bytes,
    brand: Optional[str],
    vehicle_model: Optional[str],
    color: Optional[str],
    vehicle_type: Optional[str],
    fuel: Optional[str],
    year: Optional[int],
) -> dict | None:
    """
    Attempt the trained-model primary path.

    Step 1 — YOLO inference on the image.
    Step 2 — RF regression using YOLO severity + any supplied vehicle metadata.
             If metadata is absent, RF is skipped and this function returns None
             (triggering the Groq fallback), unless you switch to Option B/C.

    Returns a fully-populated result dict on success, or None to signal fallback.
    """
    # ── Step 1: YOLO ─────────────────────────────────────────────────────────
    yolo_result = yolo_inference.run_yolo(image_bytes)
    if yolo_result is None:
        # YOLO returned no usable result → trigger fallback
        return None

    severity     = yolo_result["severity"]
    confidence   = yolo_result["confidence"]
    damaged_part = yolo_result["damaged_part"]
    damage_area  = yolo_result["damage_area_pct"]

    # ── Step 2: RF regression ─────────────────────────────────────────────────
    # Vehicle metadata is optional (passed as form fields by the caller).
    # If any required metadata field is missing, we skip RF and fall back to Groq.
    rf_result = None
    if all(v is not None for v in [brand, vehicle_model, color, vehicle_type, fuel, year]):
        rf_result = rf_inference.run_rf(
            severity     = severity,
            brand        = brand,
            model        = vehicle_model,
            color        = color,
            vehicle_type = vehicle_type,
            fuel         = fuel,
            year         = year,
        )

    if rf_result is None:
        # RF unavailable or skipped → trigger Groq fallback
        return None

    # ── Primary path succeeded ────────────────────────────────────────────────
    return {
        "severity":                severity,
        "confidence":              confidence,
        "damaged_part":            damaged_part,
        "reasoning":               (
            f"YOLO detected {damage_area:.1f}% image area damaged "
            f"(severity: {severity})."
        ),
        "estimated_cost_min_inr":  rf_result["estimated_cost_min_inr"],
        "estimated_cost_max_inr":  rf_result["estimated_cost_max_inr"],
        "cost_reasoning":          (
            f"RandomForest estimate: ₹{rf_result['estimated_cost_inr']:,} "
            f"(±15% range shown)."
        ),
        "estimation_source":       "trained_model",
        # Confidence adjustment is applied by the caller
    }


def _run_groq_fallback(image_bytes: bytes, content_type: str) -> dict:
    """
    Groq LLM fallback path — identical to the original pipeline in damage.py.

    Runs Groq vision for severity, then cost_mapping for cost (which itself
    falls back to fallback_table if the Groq text call fails).

    Always returns a populated result dict (never raises).
    """
    # ── Groq vision ───────────────────────────────────────────────────────────
    vision_raw = groq_client.analyze_image(image_bytes, content_type, DAMAGE_VISION_PROMPT)

    if vision_raw and "severity" in vision_raw:
        result = {
            "severity":     vision_raw.get("severity",     "moderate"),
            "confidence":   vision_raw.get("confidence",   0.5),
            "damaged_part": vision_raw.get("damaged_part", "unknown"),
            "reasoning":    vision_raw.get("reasoning",    ""),
            "vision_source": "groq_vision",
        }
    else:
        result = {**FALLBACK_VISION_RESULT, "vision_source": "fallback"}

    severity     = result["severity"]
    damaged_part = result["damaged_part"]

    # ── cost_mapping (Groq text → fallback_table if needed) ──────────────────
    cost_data = cost_mapping.get_cost_estimate(severity, damaged_part)

    result["estimated_cost_min_inr"] = cost_data["estimated_cost_min_inr"]
    result["estimated_cost_max_inr"] = cost_data["estimated_cost_max_inr"]
    result["cost_reasoning"]         = cost_data["cost_reasoning"]

    # estimation_source mirrors cost_mapping's own source label
    result["estimation_source"] = cost_data["source"]   # "groq_llm" | "fallback_table"

    return result


# ---------------------------------------------------------------------------
# POST /api/analyze-damage
# ---------------------------------------------------------------------------

@router.post("/analyze-damage")
async def analyze_damage(
    file:         UploadFile   = File(...),
    # Optional vehicle metadata — used by the RF regressor (primary path).
    # If any of these are omitted, the RF step is skipped and the request
    # falls back to Groq LLM inference automatically.
    brand:        Optional[str] = Form(None),
    vehicle_model: Optional[str] = Form(None, alias="model"),
    color:        Optional[str] = Form(None),
    vehicle_type: Optional[str] = Form(None, alias="type"),
    fuel:         Optional[str] = Form(None),
    year:         Optional[int] = Form(None),
):
    """
    Module A — Damage cost estimation pipeline.

    Accepts a vehicle damage photo and optional vehicle metadata fields.
    Returns severity, estimated repair cost range (INR), and which estimation
    path was used (estimation_source).

    Primary path  → YOLOv8-seg + RandomForestRegressor  (estimation_source: "trained_model")
    Fallback path → Groq vision + cost_mapping           (estimation_source: "groq_llm" | "fallback_table")
    """
    try:
        # ── Step 1: Read uploaded file ────────────────────────────────────────
        image_bytes  = await file.read()
        content_type = file.content_type or "image/jpeg"

        # ── Step 2: Try PRIMARY path (trained models) ─────────────────────────
        # Returns None if YOLO or RF fails/is unavailable → we fall through.
        result = _run_primary_path(
            image_bytes,
            brand=brand,
            vehicle_model=vehicle_model,
            color=color,
            vehicle_type=vehicle_type,
            fuel=fuel,
            year=year,
        )

        if result is None:
            # ── Step 3: FALLBACK path (Groq LLM) ─────────────────────────────
            print("[damage.py] Primary path unavailable — using Groq fallback.")
            result = _run_groq_fallback(image_bytes, content_type)

        # ── Step 4: Confidence adjustment (applies to both paths) ─────────────
        result = cost_mapping.apply_confidence_adjustment(result)

        # ── Step 5: Return structured response ────────────────────────────────
        return {
            "severity":                  result["severity"],
            "confidence":                result["confidence"],
            "damaged_part":              result["damaged_part"],
            "reasoning":                 result["reasoning"],
            "estimated_cost_min_inr":    result["estimated_cost_min_inr"],
            "estimated_cost_max_inr":    result["estimated_cost_max_inr"],
            "cost_reasoning":            result["cost_reasoning"],
            "manual_review_recommended": result["manual_review_recommended"],
            # Existing source fields — kept for backward compatibility
            "vision_source":             result.get("vision_source", "trained_model"),
            "cost_source":               result.get("estimation_source", result.get("cost_source", "unknown")),
            # New field: overall estimation path used
            "estimation_source":         result.get("estimation_source", "unknown"),
        }

    except Exception as exc:
        # Never let a bad upload crash the live demo — return a graceful error
        print(f"[damage.py] Unhandled exception in /analyze-damage: {exc}")
        return {
            "error":                     "Could not process the uploaded image.",
            "detail":                    str(exc),
            "severity":                  None,
            "confidence":                None,
            "damaged_part":              None,
            "reasoning":                 None,
            "estimated_cost_min_inr":    None,
            "estimated_cost_max_inr":    None,
            "cost_reasoning":            None,
            "manual_review_recommended": None,
            "vision_source":             "error",
            "cost_source":               "error",
            "estimation_source":         "error",
        }
