# Severity-to-cost logic — maps AI-detected damage severity levels to estimated repair cost ranges
# Primary path: Groq LLM reasoning via analyze_text()
# Fallback path: static FALLBACK_COST_TABLE (used only when Groq fails or returns bad data)

from services import groq_client

# ---------------------------------------------------------------------------
# Safety-net fallback table (INR) — used ONLY if the Groq call fails
# ---------------------------------------------------------------------------

FALLBACK_COST_TABLE: dict[str, tuple[int, int]] = {
    "minor":    (3_000,  8_000),
    "moderate": (15_000, 25_000),
    "severe":   (40_000, 70_000),
}

# ---------------------------------------------------------------------------
# Primary: LLM-powered cost estimation
# ---------------------------------------------------------------------------

def get_cost_estimate(severity: str, damaged_part: str) -> dict:
    """
    Estimate realistic Indian car repair costs for the given severity and part.

    First tries the Groq text-reasoning model for a context-aware estimate.
    Falls back to FALLBACK_COST_TABLE only when the API call fails, returns
    unparseable JSON, or returns logically inconsistent values (min <= 0 or
    max <= min).

    Args:
        severity:     One of "minor", "moderate", "severe".
        damaged_part: Human-readable part name, e.g. "front bumper", "door panel".

    Returns:
        dict with keys:
            estimated_cost_min_inr  (int)
            estimated_cost_max_inr  (int)
            cost_reasoning          (str)
            source                  "groq_llm" | "fallback_table"
    """
    prompt = f"""You are an expert Indian automotive repair cost estimator.

A car has sustained {severity} damage to its {damaged_part}.

Estimate a realistic repair cost range in Indian Rupees (INR) for a standard
mid-segment car (e.g. Maruti Swift, Hyundai i20, Honda City).

Respond ONLY with valid JSON — no explanation, no markdown fences — in this exact format:
{{
  "estimated_cost_min_inr": <integer>,
  "estimated_cost_max_inr": <integer>,
  "cost_reasoning": "<one short sentence explaining the estimate>"
}}
"""

    result = groq_client.analyze_text(prompt)

    # Validate the response before trusting it
    if _is_valid_cost_result(result):
        return {
            "estimated_cost_min_inr": int(result["estimated_cost_min_inr"]),
            "estimated_cost_max_inr": int(result["estimated_cost_max_inr"]),
            "cost_reasoning":         str(result.get("cost_reasoning", "")),
            "source":                 "groq_llm",
        }

    # --- Fallback path ---
    print(
        f"[cost_mapping] Groq call failed or returned bad data for "
        f"severity={severity!r}, part={damaged_part!r}. Using fallback table."
    )
    fallback_key = severity.lower() if severity.lower() in FALLBACK_COST_TABLE else "moderate"
    min_cost, max_cost = FALLBACK_COST_TABLE[fallback_key]

    return {
        "estimated_cost_min_inr": min_cost,
        "estimated_cost_max_inr": max_cost,
        "cost_reasoning":         f"Fallback estimate for {severity} {damaged_part} damage.",
        "source":                 "fallback_table",
    }


# ---------------------------------------------------------------------------
# Confidence adjustment — key differentiator: never overclaim certainty
# ---------------------------------------------------------------------------

def apply_confidence_adjustment(result: dict) -> dict:
    """
    Widen the cost range and flag for manual review when model confidence is low.

    This is our key differentiator: we never overclaim confidence. When the AI
    is unsure (confidence < 0.7), we widen the estimate range honestly (×0.7
    on the low end, ×1.3 on the high end) and flag the claim for human review.

    Args:
        result: dict containing at minimum:
                    "confidence"            (float, 0.0–1.0)
                    "estimated_cost_min_inr" (int/float)
                    "estimated_cost_max_inr" (int/float)

    Returns:
        The same dict, mutated in-place, with:
            - Possibly adjusted estimated_cost_min_inr / estimated_cost_max_inr
            - "manual_review_recommended" key set to True or False
    """
    confidence = float(result.get("confidence", 1.0))

    if confidence < 0.7:
        result["estimated_cost_min_inr"] = int(result["estimated_cost_min_inr"] * 0.7)
        result["estimated_cost_max_inr"] = int(result["estimated_cost_max_inr"] * 1.3)
        result["manual_review_recommended"] = True
    else:
        result["manual_review_recommended"] = False

    return result


# ---------------------------------------------------------------------------
# Internal helper
# ---------------------------------------------------------------------------

def _is_valid_cost_result(result) -> bool:
    """Return True only if the Groq response has the expected keys and sane values."""
    if not isinstance(result, dict):
        return False
    try:
        min_cost = float(result["estimated_cost_min_inr"])
        max_cost = float(result["estimated_cost_max_inr"])
        return min_cost > 0 and max_cost > min_cost
    except (KeyError, TypeError, ValueError):
        return False
