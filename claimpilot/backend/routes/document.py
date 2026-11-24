# Module B endpoints — handles insurance document upload and verification requests
#
# Pipeline (matches the brief's "OCR plus rule checks on claim forms, RC
# book, driving licence"):
#   1. PRIMARY  — Tesseract OCR extracts raw text, then regex rule-checks
#                 pull out name / id_number / expiry_date. Runs fully
#                 locally, no API key required.
#   2. ENHANCE  — Groq vision LLM independently reads the same image and
#                 extracts the same fields. Used to fill gaps OCR missed
#                 and to cross-verify the OCR result.
#   3. MERGE    — OCR value wins when present (it's the rule-based source
#                 of truth); LLM fills in anything OCR couldn't find.
#                 If verification still ends up empty from both, that
#                 (and only that) is reported as "fallback".

from fastapi import APIRouter, UploadFile, File
from services import groq_client, ocr_service

router = APIRouter()

# ---------------------------------------------------------------------------
# Prompt constants
# ---------------------------------------------------------------------------

DOCUMENT_VISION_PROMPT = """You are a document-verification assistant for a motor insurance claim.
Look at this photo of a document (RC book, driving licence, or claim form) and \
respond with ONLY a JSON object, no other text, in exactly this format:

{
  "document_type_guess": "<e.g. 'driving licence', 'RC book', 'unclear'>",
  "fields_found": {
    "name": "<value or null>",
    "id_number": "<value or null>",
    "expiry_date": "<value or null>"
  },
  "is_complete": <true or false>,
  "missing_fields": ["<field name>", ...]
}

If the image is unreadable or not a document, set is_complete to false and \
explain in missing_fields as ["image_unreadable"]."""


# Fields required for a document to count as verified. expiry_date is still
# extracted and shown when found, but isn't required to gate verification —
# many RC books / older DLs don't carry a clean printed expiry.
REQUIRED_FIELDS = ("name", "id_number")


def _normalize(value):
    if not value:
        return None
    v = value.strip()
    return v if v else None


def _names_roughly_match(a, b):
    """None = not applicable (one side missing), else bool match result."""
    if not a or not b:
        return None
    na = a.lower().strip().split()
    nb = b.lower().strip().split()
    shorter, longer = (na, nb) if len(na) <= len(nb) else (nb, na)
    return all(word in longer for word in shorter)


def _guess_document_type(ocr_text):
    upper = ocr_text.upper()
    if "DRIVING" in upper and "LICEN" in upper:
        return "driving licence"
    if "REGISTRATION" in upper and ("CERTIFICATE" in upper or "VEHICLE" in upper):
        return "RC book"
    if "CLAIM FORM" in upper or "INSURANCE CLAIM" in upper:
        return "claim form"
    return "unclear"


# ---------------------------------------------------------------------------
# POST /api/verify-document
# ---------------------------------------------------------------------------

@router.post("/verify-document")
async def verify_document(file: UploadFile = File(...)):
    """
    Module B — Document verification pipeline (OCR + rule checks, LLM
    cross-check).

    Accepts a photo of an insurance document (RC book, driving licence,
    claim form) and returns:
      - Detected document type
      - Extracted key fields (name, id_number, expiry_date)
      - Completeness flag and list of any missing required fields
      - Which extraction method(s) contributed, and whether OCR and the
        LLM agreed on the name (useful signal for judges/demo)
    """
    try:
        # ── Step 1: Read uploaded file ────────────────────────────────────
        image_bytes  = await file.read()
        content_type = file.content_type or "image/jpeg"

        # ── Step 2a: PRIMARY — OCR + regex rule checks ─────────────────────
        ocr_text   = ocr_service.extract_text(image_bytes)
        ocr_result = ocr_service.rule_extract(ocr_text)
        ocr_fields = ocr_result["fields_found"]
        ocr_used   = bool(ocr_text.strip())

        # ── Step 2b: ENHANCEMENT — Groq vision LLM cross-check ─────────────
        vision_raw = groq_client.analyze_image(image_bytes, content_type, DOCUMENT_VISION_PROMPT)
        llm_used   = vision_raw is not None

        llm_fields = {"name": None, "id_number": None, "expiry_date": None}
        llm_doc_type_guess = None
        if llm_used:
            raw_fields = vision_raw.get("fields_found", {})
            if not isinstance(raw_fields, dict):
                raw_fields = {}
            llm_fields = {
                "name":        _normalize(raw_fields.get("name")),
                "id_number":   _normalize(raw_fields.get("id_number")),
                "expiry_date": _normalize(raw_fields.get("expiry_date")),
            }
            llm_doc_type_guess = vision_raw.get("document_type_guess")

        # ── Step 3: MERGE — OCR (rule-based) wins, LLM fills gaps ──────────
        merged_fields = {
            key: ocr_fields.get(key) or llm_fields.get(key)
            for key in ("name", "id_number", "expiry_date")
        }

        missing_fields = [f for f in REQUIRED_FIELDS if not merged_fields.get(f)]
        is_complete    = len(missing_fields) == 0

        document_type_guess = (
            llm_doc_type_guess
            if llm_doc_type_guess and llm_doc_type_guess != "unclear"
            else _guess_document_type(ocr_text)
        )

        if ocr_used and llm_used:
            source = "ocr+llm"
        elif ocr_used:
            source = "ocr_only"
        elif llm_used:
            source = "llm_only"
        else:
            source = "fallback"
            missing_fields = list(dict.fromkeys(missing_fields + ["extraction_failed"]))

        # ── Step 4: Return structured response ───────────────────────────
        return {
            "document_type_guess": document_type_guess,
            "fields_found":        merged_fields,
            "is_complete":         is_complete,
            "missing_fields":      missing_fields,
            "source":              source,
            # Extra transparency fields — safe additions, existing frontend
            # code only reads the keys above and ignores unknown ones.
            "verification_detail": {
                "ocr_fields":           ocr_fields,
                "llm_fields":           llm_fields if llm_used else None,
                "name_cross_verified":  _names_roughly_match(ocr_fields.get("name"), llm_fields.get("name")),
            },
        }

    except Exception as exc:
        # Never let a bad upload crash the live demo — return a graceful error
        print(f"[document.py] Unhandled exception in /verify-document: {exc}")
        return {
            "error":               "Could not process the uploaded document image.",
            "detail":              str(exc),
            "document_type_guess": None,
            "fields_found":        {"name": None, "id_number": None, "expiry_date": None},
            "is_complete":         False,
            "missing_fields":      ["server_error"],
            "source":              "error",
        }