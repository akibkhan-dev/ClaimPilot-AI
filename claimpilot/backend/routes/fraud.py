# Module C endpoints — handles fraud detection and flagging requests for claims

import json
from fastapi import APIRouter, Form, Depends
from sqlalchemy.orm import Session
from sqlalchemy import or_
from database.db import get_db
from database.models import Claim

router = APIRouter()


# ---------------------------------------------------------------------------
# POST /api/fraud-check
# ---------------------------------------------------------------------------

@router.post("/fraud-check")
async def fraud_check(
    claim_id:           str   = Form(...),
    car_number:         str   = Form(...),
    severity:           str   = Form(...),
    damaged_part:       str   = Form(""),
    claimed_amount_inr: float = Form(...),
    cost_min_inr:       float = Form(...),
    cost_max_inr:       float = Form(...),
    db: Session = Depends(get_db),
):
    """
    Module C — Fraud detection pipeline.

    Runs two rule-based checks against the submitted claim data:
      1. Duplicate check — claim_id or car_number already in the DB
      2. Cost mismatch — claimed amount exceeds estimated range by > 30 %

    Saves new (non-duplicate) claims to the database with the fraud verdict.
    """
    try:
        flags:    list[str] = []
        is_duplicate        = False
        existing            = None

        # ── Step 1: Duplicate check ───────────────────────────────────────
        existing = (
            db.query(Claim)
            .filter(
                or_(
                    Claim.claim_id   == claim_id,
                    Claim.car_number == car_number,
                )
            )
            .first()
        )

        if existing:
            is_duplicate = True
            flags.append(
                f"Duplicate claim detected — claim_id or car_number already exists "
                f"(filed on {existing.created_at})."
            )

        # ── Step 2: Cost mismatch check ───────────────────────────────────
        TOLERANCE = 1.3
        if claimed_amount_inr > cost_max_inr * TOLERANCE:
            flags.append(
                f"Claimed amount \u20b9{claimed_amount_inr:,.0f} is significantly higher than the "
                f"estimated range \u20b9{cost_min_inr:,.0f}\u2013\u20b9{cost_max_inr:,.0f} "
                f"for '{severity}' damage."
            )

        # ── Step 3: Determine fraud verdict ───────────────────────────────
        is_flagged = len(flags) > 0
        status     = (
            "\U0001f6a9 Flagged for review"
            if is_flagged
            else "\u2705 No fraud indicators found"
        )

        # ── Step 4: Persist to database (skip if duplicate) ───────────────
        if not is_duplicate:
            new_claim = Claim(
                claim_id              = claim_id,
                car_number            = car_number,
                severity              = severity,
                damaged_part          = damaged_part or None,
                claimed_amount        = claimed_amount_inr,
                estimated_cost_min    = cost_min_inr,
                estimated_cost_max    = cost_max_inr,
                is_flagged            = is_flagged,
                flag_reasons          = json.dumps(flags) if flags else None,
            )
            db.add(new_claim)
            db.commit()
            db.refresh(new_claim)

        # ── Step 5: Return fraud verdict ──────────────────────────────────
        return {
            "is_flagged": is_flagged,
            "flags":      flags,
            "status":     status,
        }

    except Exception as exc:
        # Roll back any partial DB write before returning the error response
        db.rollback()
        print(f"[fraud.py] Unhandled exception in /fraud-check: {exc}")
        return {
            "error":      "Fraud check could not be completed.",
            "detail":     str(exc),
            "is_flagged": None,
            "flags":      [],
            "status":     "error",
        }
