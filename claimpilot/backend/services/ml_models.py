# services/ml_models.py
# ---------------------------------------------------------------------------
# Singleton model loader — both trained models are loaded ONCE at server
# startup and held as module-level references.  All other modules import from
# here; they must never call load_models() themselves.
#
# Design contract:
#   • If a model file is missing or broken, its reference stays None.
#   • Calling code checks models_ready() / individual refs before using them.
#   • No exceptions propagate out of load_models(); startup is always clean.
# ---------------------------------------------------------------------------

import os

# ---------------------------------------------------------------------------
# Resolved paths — both .pt and .pkl live in backend/models/
# ---------------------------------------------------------------------------

_BASE_DIR   = os.path.dirname(os.path.dirname(__file__))   # …/backend/
_MODELS_DIR = os.path.join(_BASE_DIR, "models")

YOLO_MODEL_PATH = os.path.join(_MODELS_DIR, "damage_yolo.pt")
RF_MODEL_PATH   = os.path.join(_MODELS_DIR, "cost_regressor.pkl")

# ---------------------------------------------------------------------------
# Module-level singletons (None until load_models() succeeds for each)
# ---------------------------------------------------------------------------

yolo_model = None   # ultralytics.YOLO instance
rf_bundle  = None   # dict with keys: "model", "encoders", "feature_cols"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def load_models() -> None:
    """
    Load both trained models from disk.  Called ONCE inside main.py's
    on_startup() handler so the models are warm before the first request.

    Failures are printed as warnings — the server remains healthy and the
    damage route will automatically fall back to Groq LLM inference.
    """
    _load_yolo()
    _load_rf()


def models_ready() -> bool:
    """Return True only when both models loaded successfully."""
    return yolo_model is not None and rf_bundle is not None


# ---------------------------------------------------------------------------
# Internal loaders
# ---------------------------------------------------------------------------

def _load_yolo() -> None:
    """Attempt to load the YOLOv8-seg model; set yolo_model on success."""
    global yolo_model

    if not os.path.isfile(YOLO_MODEL_PATH):
        print(
            f"[ml_models] WARNING: damage_yolo.pt not found at {YOLO_MODEL_PATH} — "
            "YOLO primary path disabled, will use Groq fallback."
        )
        return

    try:
        # ultralytics is an optional dependency; guard the import so a missing
        # package produces a clean warning rather than an import-time crash.
        from ultralytics import YOLO  # type: ignore

        yolo_model = YOLO(YOLO_MODEL_PATH)
        print(f"[ml_models] YOLO loaded ✓  ({YOLO_MODEL_PATH})")

    except ImportError:
        print(
            "[ml_models] WARNING: 'ultralytics' package not installed — "
            "YOLO primary path disabled.  Run: pip install ultralytics"
        )
    except Exception as exc:
        print(
            f"[ml_models] WARNING: Failed to load YOLO model: {exc} — "
            "will use Groq fallback."
        )


def _load_rf() -> None:
    """Attempt to load the RF regressor bundle; set rf_bundle on success."""
    global rf_bundle

    if not os.path.isfile(RF_MODEL_PATH):
        print(
            f"[ml_models] WARNING: cost_regressor.pkl not found at {RF_MODEL_PATH} — "
            "RF primary path disabled, will use Groq fallback."
        )
        return

    try:
        import joblib  # type: ignore

        bundle = joblib.load(RF_MODEL_PATH)

        # Validate expected structure before accepting the bundle
        required_keys = {"model", "encoders", "feature_cols"}
        missing = required_keys - set(bundle.keys())
        if missing:
            print(
                f"[ml_models] WARNING: cost_regressor.pkl is missing keys {missing} — "
                "RF primary path disabled."
            )
            return

        rf_bundle = bundle
        print(f"[ml_models] RF regressor loaded ✓  ({RF_MODEL_PATH})")

    except ImportError:
        print(
            "[ml_models] WARNING: 'joblib' package not installed — "
            "RF primary path disabled.  Run: pip install joblib"
        )
    except Exception as exc:
        print(
            f"[ml_models] WARNING: Failed to load RF model: {exc} — "
            "will use Groq fallback."
        )
