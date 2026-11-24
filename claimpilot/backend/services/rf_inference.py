# services/rf_inference.py
# ---------------------------------------------------------------------------
# RandomForest cost regression — predicts repair cost (INR) from vehicle
# metadata + YOLO-derived severity.
#
# The RF bundle is imported from services/ml_models.py (loaded at startup).
# This module is pure inference: no I/O, no model loading, no side effects.
# ---------------------------------------------------------------------------

import logging
import numpy as np

logger = logging.getLogger(__name__)

# Cost range is expressed as ±% around the point estimate.
# Mirrors the spirit of the existing FALLBACK_COST_TABLE range widths.
COST_RANGE_PCT = 0.15   # ±15 %


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _safe_encode(encoder, value: str) -> int:
    """
    Label-encode a categorical value.

    If the value was not seen during training, return -1 (unknown class).
    RandomForest handles -1 gracefully — it simply routes the sample to
    the average leaf, which is the correct thing to do for unseen labels.
    """
    try:
        return int(encoder.transform([value])[0])
    except (ValueError, KeyError):
        logger.debug(
            "[rf_inference] Unseen label %r for encoder %s — using -1.",
            value,
            getattr(encoder, "classes_", "?"),
        )
        return -1


def _build_feature_row(bundle: dict, severity: str, brand: str, model: str,
                       color: str, vehicle_type: str, fuel: str,
                       year: int) -> np.ndarray | None:
    """
    Encode categorical fields and assemble the feature vector in the exact
    column order the RF was trained on (bundle["feature_cols"]).

    Handles both plain column names ('brand') and _enc-suffixed names
    ('brand_enc') — whichever convention the saved model uses.

    Returns a (1, n_features) numpy array, or None on error.
    """
    encoders     = bundle["encoders"]       # dict[field_name -> LabelEncoder]
    feature_cols = bundle["feature_cols"]   # list[str] — training column order

    print(f"[rf_inference] feature_cols from bundle: {feature_cols}")
    print(f"[rf_inference] encoders keys: {list(encoders.keys())}")

    # Resolve encoder keys dynamically — the bundle may use plain names ('brand')
    # or suffixed names ('brand_enc'). Try both when looking up the encoder.
    def resolve_encoder(field: str):
        """Return the LabelEncoder for a field regardless of name suffix."""
        if field in encoders:
            return encoders[field]
        # Try stripping _enc suffix (e.g. 'brand_enc' → 'brand')
        stripped = field.removesuffix("_enc")
        if stripped in encoders:
            return encoders[stripped]
        # Try adding _enc suffix (e.g. 'brand' → 'brand_enc')
        suffixed = field + "_enc"
        if suffixed in encoders:
            return encoders[suffixed]
        return None

    # Build lookup dict keyed by every column name that appears in feature_cols
    encoded = {}
    # Raw value mappings (categorical fields)
    categorical = {
        "severity": severity,
        "brand":    brand,
        "model":    model,
        "color":    color,
        "type":     vehicle_type,
        "fuel":     fuel,
    }

    for col in feature_cols:
        # Numeric passthrough
        if col == "year" or col.lower() == "year":
            encoded[col] = int(year)
            continue

        # Find which categorical this column corresponds to
        col_base = col.removesuffix("_enc")   # 'brand_enc' → 'brand'
        if col_base in categorical:
            enc = resolve_encoder(col_base)
            if enc is not None:
                encoded[col] = _safe_encode(enc, categorical[col_base])
            else:
                print(f"[rf_inference] No encoder found for column '{col}' — using -1.")
                encoded[col] = -1
        else:
            print(f"[rf_inference] Unrecognised feature_col '{col}' — using -1.")
            encoded[col] = -1

    try:
        row = [encoded[col] for col in feature_cols]
        print(f"[rf_inference] Feature row assembled: {dict(zip(feature_cols, row))}")
    except KeyError as exc:
        print(f"[rf_inference] feature_cols references unknown key {exc} — cannot build feature vector.")
        return None

    return np.array([row], dtype=float)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def run_rf(
    severity: str,
    brand: str,
    model: str,
    color: str,
    vehicle_type: str,
    fuel: str,
    year: int,
) -> dict | None:
    """
    Predict repair cost (INR) using the RandomForestRegressor.

    Args:
        severity:     "minor" | "moderate" | "severe"  (from YOLO inference)
        brand:        Vehicle brand, e.g. "Maruti"
        model:        Vehicle model, e.g. "Swift"
        color:        Colour string, e.g. "White"
        vehicle_type: Body type, e.g. "Hatchback"
        fuel:         Fuel type, e.g. "Petrol"
        year:         Manufacture year, e.g. 2019

    Returns:
        {
            "estimated_cost_inr":     int,   # RF point estimate
            "estimated_cost_min_inr": int,   # point × (1 − COST_RANGE_PCT)
            "estimated_cost_max_inr": int,   # point × (1 + COST_RANGE_PCT)
        }
        or None if the bundle isn't loaded or inference fails.
    """
    # ── Import guard: model singleton ────────────────────────────────────────
    from services import ml_models
    if ml_bundle := ml_models.rf_bundle:
        bundle = ml_bundle
    else:
        logger.debug("[rf_inference] RF bundle not loaded — skipping RF path.")
        return None

    try:
        feature_row = _build_feature_row(
            bundle, severity, brand, model, color, vehicle_type, fuel, year
        )
        if feature_row is None:
            return None

        # Predict returns a 1-element array
        predicted_cost = float(bundle["model"].predict(feature_row)[0])

        if predicted_cost <= 0:
            logger.warning(
                "[rf_inference] RF predicted non-positive cost (%.2f) — "
                "rejecting result, triggering fallback.",
                predicted_cost,
            )
            return None

        cost_min = int(predicted_cost * (1 - COST_RANGE_PCT))
        cost_max = int(predicted_cost * (1 + COST_RANGE_PCT))

        logger.info(
            "[rf_inference] RF prediction OK — ₹%d  (range ₹%d – ₹%d)",
            int(predicted_cost),
            cost_min,
            cost_max,
        )

        return {
            "estimated_cost_inr":     int(predicted_cost),
            "estimated_cost_min_inr": cost_min,
            "estimated_cost_max_inr": cost_max,
        }

    except Exception as exc:
        logger.warning(
            "[rf_inference] Prediction failed: %s — triggering Groq fallback.", exc
        )
        return None
