# services/ocr_service.py
# ---------------------------------------------------------------------------
# Traditional OCR + rule-based field extraction for Module B (document
# verification), matching the brief's "OCR plus rule checks" requirement.
#
# This is the PRIMARY extraction path — it needs no API key and runs fully
# locally via Tesseract. The Groq vision LLM (services/groq_client.py) is
# used afterwards purely as a cross-check / enhancement layer; document
# verification must keep working even if the LLM call fails or no API key
# is configured.
# ---------------------------------------------------------------------------

import io
import re
import logging

import pytesseract
from PIL import Image

logger = logging.getLogger(__name__)

pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'


# ---------------------------------------------------------------------------
# Step 1 — raw OCR text extraction
# ---------------------------------------------------------------------------

def extract_text(image_bytes: bytes) -> str:
    """
    Run Tesseract OCR on the uploaded image and return the raw extracted
    text. Returns "" (not None) on failure so downstream code can treat
    "no text found" and "OCR crashed" the same way.
    """
    try:
        image = Image.open(io.BytesIO(image_bytes))
        # Convert to grayscale — noticeably improves Tesseract accuracy on
        # photographed (not scanned) ID documents.
        image = image.convert("L")
        text = pytesseract.image_to_string(image)
        return text or ""
    except Exception as exc:
        logger.warning("[ocr_service] Tesseract extraction failed: %s", exc)
        return ""


# ---------------------------------------------------------------------------
# Step 2 — rule-based field extraction from raw OCR text
# ---------------------------------------------------------------------------

# Matches Indian vehicle registration numbers (RC book) and driving licence
# numbers. Both follow a broadly similar "state code + digits + alnum serial"
# shape, so one tolerant pattern covers both for a hackathon-grade check.
_ID_NUMBER_RE = re.compile(
    r"\b[A-Z]{2}[\s-]?\d{1,2}[\s-]?[A-Z]{0,3}[\s-]?\d{4,13}\b"
)

# dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy (2- or 4-digit year)
_DATE_RE = re.compile(
    r"\b(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})\b"
)

_NAME_LABEL_RE = re.compile(
    r"(?:name|holder'?s?\s*name)\s*[:\-]?\s*([A-Za-z][A-Za-z .]{2,40})",
    re.IGNORECASE,
)

# Lines that are clearly document boilerplate, not a person's name — skip
# these when falling back to the "first ALL-CAPS line" heuristic.
_NAME_STOPWORDS = {
    "GOVERNMENT OF INDIA", "INDIA", "DRIVING LICENCE", "DRIVING LICENSE",
    "REGISTRATION CERTIFICATE", "FORM", "TRANSPORT DEPARTMENT",
    "UNION OF INDIA", "CERTIFICATE OF REGISTRATION",
}


def _extract_name(text: str) -> str | None:
    # Preferred: an explicit "Name:" label.
    m = _NAME_LABEL_RE.search(text)
    if m:
        candidate = m.group(1).strip().rstrip(".")
        if len(candidate) >= 3:
            return candidate

    # Fallback: first ALL-CAPS line of plausible length that isn't
    # boilerplate. Common on RC books / DLs where the name has no label
    # OCR could pick up cleanly.
    for line in text.splitlines():
        clean = line.strip()
        if not (3 <= len(clean) <= 40):
            continue
        if clean.upper() != clean:
            continue
        if any(word in clean.upper() for word in _NAME_STOPWORDS):
            continue
        if not re.match(r"^[A-Z][A-Z .]+$", clean):
            continue
        return clean.title()

    return None


def _extract_id_number(text: str) -> str | None:
    m = _ID_NUMBER_RE.search(text.replace("\n", " "))
    return m.group(0).strip() if m else None


def _extract_expiry_date(text: str) -> str | None:
    # Prefer a date that appears near a "valid"/"expiry" keyword.
    for line in text.splitlines():
        if re.search(r"valid|expiry|exp\b", line, re.IGNORECASE):
            m = _DATE_RE.search(line)
            if m:
                return m.group(1)
    # Fallback: last date found anywhere in the document (RC/DL usually
    # print issue date first, expiry date later).
    dates = _DATE_RE.findall(text)
    return dates[-1] if dates else None


def rule_extract(text: str) -> dict:
    """
    Apply regex rule-checks to raw OCR text and return the same field
    shape used by the LLM path, so both can be merged uniformly.
    """
    name = _extract_name(text)
    id_number = _extract_id_number(text)
    expiry_date = _extract_expiry_date(text)

    missing = []
    if not name:
        missing.append("name")
    if not id_number:
        missing.append("id_number")

    return {
        "fields_found": {
            "name": name,
            "id_number": id_number,
            "expiry_date": expiry_date,
        },
        "is_complete": bool(name and id_number),
        "missing_fields": missing,
    }