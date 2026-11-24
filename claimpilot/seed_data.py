# Seed script — populates the SQLite database with sample insurance claims for testing
#
# Strategy: CLEAR-AND-REINSERT on every run.
# Reason: Hackathon demo — we want a clean, predictable dataset each time.
# One claim (CLM-2024-003 / MH02AB1234) is intentionally reusable for a live
# duplicate-check demo moment: submit it again via /api/fraud-check to trigger
# the duplicate flag in real time.

import sys
import os
import json

# ── Make sure Python finds the backend package ──────────────────────────────
BACKEND_DIR = os.path.join(os.path.dirname(__file__), "backend")
sys.path.insert(0, BACKEND_DIR)

from database.db import SessionLocal
from database.models import Claim, create_tables

# ── Sample claims ────────────────────────────────────────────────────────────
# flag_reasons text uses the exact wording from routes/fraud.py so /api/claims
# returns consistent messages whether the claim was seeded or submitted live.

SAMPLE_CLAIMS = [
    {
        "claim_id":           "CLM-2024-001",
        "car_number":         "KA03CD5678",
        "severity":           "minor",
        "damaged_part":       "rear bumper",
        "claimed_amount":     6500.0,
        "estimated_cost_min": 3000.0,
        "estimated_cost_max": 8000.0,
        "is_flagged":         False,
        "flag_reasons":       None,
        # Clean claim — amount within estimated range, no duplicate
    },
    {
        "claim_id":           "CLM-2024-002",
        "car_number":         "DL01EF9012",
        "severity":           "moderate",
        "damaged_part":       "door panel",
        "claimed_amount":     38000.0,
        "estimated_cost_min": 15000.0,
        "estimated_cost_max": 25000.0,
        "is_flagged":         True,
        "flag_reasons":       json.dumps([
            "Claimed amount \u20b938,000 is significantly higher than the "
            "estimated range \u20b915,000\u2013\u20b925,000 for 'moderate' damage."
        ]),
        # Flagged: over-claim (38 000 > 25 000 * 1.3 = 32 500)
    },
    {
        # ★ DEMO CLAIM — use this claim_id or car_number in the live demo
        # to trigger the duplicate flag instantly
        "claim_id":           "CLM-2024-003",
        "car_number":         "MH02AB1234",
        "severity":           "severe",
        "damaged_part":       "front hood",
        "claimed_amount":     55000.0,
        "estimated_cost_min": 40000.0,
        "estimated_cost_max": 70000.0,
        "is_flagged":         False,
        "flag_reasons":       None,
        # Clean claim — use as duplicate trigger in live demo
    },
    {
        "claim_id":           "CLM-2024-004",
        "car_number":         "TN09GH3456",
        "severity":           "moderate",
        "damaged_part":       "windshield",
        "claimed_amount":     22000.0,
        "estimated_cost_min": 15000.0,
        "estimated_cost_max": 25000.0,
        "is_flagged":         False,
        "flag_reasons":       None,
        # Clean claim — amount comfortably inside estimated range
    },
    {
        "claim_id":           "CLM-2024-005",
        "car_number":         "MH12JK7890",
        "severity":           "severe",
        "damaged_part":       "engine compartment",
        "claimed_amount":     120000.0,
        "estimated_cost_min": 40000.0,
        "estimated_cost_max": 70000.0,
        "is_flagged":         True,
        "flag_reasons":       json.dumps([
            "Claimed amount \u20b91,20,000 is significantly higher than the "
            "estimated range \u20b940,000\u2013\u20b970,000 for 'severe' damage."
        ]),
        # Flagged: extreme over-claim (1,20,000 > 70,000 * 1.3 = 91,000)
    },
]


def seed():
    """Clear the claims table and insert fresh sample data."""
    create_tables()
    db = SessionLocal()

    try:
        # ── Wipe existing rows ────────────────────────────────────────────
        deleted = db.query(Claim).delete()
        db.commit()
        if deleted:
            print(f"[seed] Cleared {deleted} existing claim(s) from DB.")

        # ── Insert sample claims ──────────────────────────────────────────
        inserted = []
        for data in SAMPLE_CLAIMS:
            claim = Claim(**data)
            db.add(claim)
            inserted.append(claim)

        db.commit()

        # Refresh to populate auto-set fields (id, created_at)
        for claim in inserted:
            db.refresh(claim)

        # ── Print summary ─────────────────────────────────────────────────
        print(f"\n[seed] Inserted {len(inserted)} claims:\n")
        print(f"  {'ID':<6}  {'Claim ID':<16}  {'Car Number':<14}  "
              f"{'Severity':<10}  {'Flagged':<8}  {'Claimed (INR)'}")
        print("  " + "-" * 75)

        for c in inserted:
            flag_marker = "[FLAG]" if c.is_flagged else "[OK]  "
            print(
                f"  {c.id:<6}  {c.claim_id:<16}  {c.car_number:<14}  "
                f"{c.severity:<10}  {flag_marker:<8}  INR {c.claimed_amount:,.0f}"
            )

        print(
            "\n[seed] Done. Re-submit CLM-2024-003 (car: MH02AB1234) via "
            "/api/fraud-check to demo the duplicate-flag live.\n"
        )

    except Exception as exc:
        db.rollback()
        print(f"[seed] ERROR: {exc}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
