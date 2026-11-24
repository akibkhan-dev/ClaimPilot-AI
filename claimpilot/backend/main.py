# FastAPI app entrypoint — registers all routers and starts the application server

import os
import json
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm import Session

from database.db import get_db
from database.models import create_tables, Claim
from routes.damage import router as damage_router
from routes.document import router as document_router
from routes.fraud import router as fraud_router

# ---------------------------------------------------------------------------
# App instance
# ---------------------------------------------------------------------------

app = FastAPI(title="ClaimPilot AI")

# ---------------------------------------------------------------------------
# CORS — permissive for hackathon demo
# ---------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Startup: initialise DB tables AND load trained ML models
# ---------------------------------------------------------------------------

@app.on_event("startup")
def on_startup():
    """
    Run once when the server starts:
      1. Create DB tables (unchanged).
      2. Load the YOLOv8-seg and RandomForest models into memory so they are
         warm before the first request.  If either model file is absent or
         broken, load_models() logs a warning and leaves the reference as None;
         the damage route will fall back to Groq LLM inference automatically.
    """
    create_tables()
    print("[main.py] Database tables initialised.")

    # Primary ML models for Module A (damage estimation)
    from services import ml_models
    ml_models.load_models()

# ---------------------------------------------------------------------------
# Routers — all three modules under /api
# ---------------------------------------------------------------------------

app.include_router(damage_router,   prefix="/api")   # Module A
app.include_router(document_router, prefix="/api")   # Module B
app.include_router(fraud_router,    prefix="/api")   # Module C

# ---------------------------------------------------------------------------
# GET /api/health — quick sanity check for judges / CI
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health_check():
    """
    Return server status and configuration summary.
    Includes yolo_ready / rf_ready flags so you can confirm model loading
    without restarting the server.
    """
    from services import ml_models
    api_key = os.environ.get("GROQ_API_KEY", "")
    return {
        "status":           "ok",
        "groq_configured":  bool(api_key),
        "vision_model":     "meta-llama/llama-4-scout-17b-16e-instruct",
        # Trained model readiness (Module A primary path)
        "yolo_ready":       ml_models.yolo_model is not None,
        "rf_ready":         ml_models.rf_bundle  is not None,
    }

# ---------------------------------------------------------------------------
# GET /api/claims — debug / demo: show last 20 claims in the DB
# ---------------------------------------------------------------------------

@app.get("/api/claims")
def list_claims(db: Session = Depends(get_db)):
    """
    Return the 20 most recent claims in the database.
    Useful during a live demo to show judges the stored data.
    Converts flag_reasons from JSON string back to a Python list.
    """
    rows = (
        db.query(Claim)
        .order_by(Claim.created_at.desc())
        .limit(20)
        .all()
    )

    result = []
    for row in rows:
        # Deserialise flag_reasons JSON string → list, or empty list if NULL
        try:
            flag_list = json.loads(row.flag_reasons) if row.flag_reasons else []
        except (json.JSONDecodeError, TypeError):
            flag_list = []

        result.append({
            "id":                   row.id,
            "claim_id":             row.claim_id,
            "car_number":           row.car_number,
            "severity":             row.severity,
            "damaged_part":         row.damaged_part,
            "claimed_amount":       row.claimed_amount,
            "estimated_cost_min":   row.estimated_cost_min,
            "estimated_cost_max":   row.estimated_cost_max,
            "is_flagged":           row.is_flagged,
            "flag_reasons":         flag_list,
            "created_at":           str(row.created_at),
        })

    return result

# ---------------------------------------------------------------------------
# Static files — serve the built React frontend
# ---------------------------------------------------------------------------

FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
FRONTEND_INDEX = os.path.join(FRONTEND_DIST, "index.html")

try:
    if os.path.isdir(FRONTEND_DIST):
        app.mount("/static", StaticFiles(directory=FRONTEND_DIST), name="static")
except Exception as exc:
    print(f"[main.py] Could not mount static files: {exc}")

# ---------------------------------------------------------------------------
# Catch-all GET "/" — serve React index.html or a helpful JSON fallback
# ---------------------------------------------------------------------------

@app.get("/")
def serve_frontend():
    """
    Serve the React SPA entry point.
    If the frontend hasn't been built yet (npm run build), return a helpful
    JSON message instead of crashing.
    """
    try:
        if os.path.isfile(FRONTEND_INDEX):
            return FileResponse(FRONTEND_INDEX)
        raise FileNotFoundError("index.html not found")
    except Exception:
        return JSONResponse(content={
            "message": (
                "ClaimPilot AI backend running. "
                "Frontend not built yet — run npm run build in the frontend folder."
            )
        })
