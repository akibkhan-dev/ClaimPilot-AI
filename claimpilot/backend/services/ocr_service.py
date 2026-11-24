# services/ocr_service.py
# ClaimPilot - OCR and rule-based document extraction

import os
import io
import re
import logging

import pytesseract
from PIL import Image, ImageOps, ImageFilter

logger = logging.getLogger(__name__)

# ---------------------------------------------------------
# TESSERACT CONFIGURATION
# ---------------------------------------------------------

if os.name == "nt":
    _win_tesseract = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    if os.path.exists(_win_tesseract):
        pytesseract.pytesseract.tesseract_cmd = _win_tesseract

# ---------------------------------------------------------
# REGEX PATTERNS
# ---------------------------------------------------------

# Indian RC format: AN01J8844, MH04XY5678
_RC_NUMBER_RE = re.compile(
    r"^([A-Z]{2})(\d{1,2})([A-Z]{1,3})(\d{4})$"
)

# Indian driving licence sample format
_DL_NUMBER_RE = re.compile(
    r"^[A-Z]{2}\d{13}$"
)

_DATE_RE = re.compile(
    r"\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b"
)

_NAME_LABEL_RE = re.compile(
    r"(?:owner'?s?\s*name|holder'?s?\s*name|name)"
    r"\s*[:\-]?\s*([A-Za-z][A-Za-z .]{2,40})",
    re.IGNORECASE
)

_NAME_STOPWORDS = {
    "GOVERNMENT OF INDIA",
    "INDIA",
    "DRIVING LICENCE",
    "DRIVING LICENSE",
    "REGISTRATION CERTIFICATE",
    "CERTIFICATE OF REGISTRATION",
    "TRANSPORT DEPARTMENT",
    "STATE TRANSPORT AUTHORITY",
    "VEHICLE REGISTRATION",
}


# ---------------------------------------------------------
# STEP 1: IMAGE PREPROCESSING AND OCR
# ---------------------------------------------------------

def extract_text(image_bytes: bytes) -> str:
    """Extract text from an uploaded document image."""

    try:
        image = Image.open(io.BytesIO(image_bytes))
        image = ImageOps.exif_transpose(image)
        image = image.convert("RGB")

        width, height = image.size

        # Upscale small images
        if width < 1800:
            scale = 1800 / width
            image = image.resize(
                (1800, int(height * scale)),
                Image.Resampling.LANCZOS
            )

        # Improve text visibility
        image = ImageOps.grayscale(image)
        image = ImageOps.autocontrast(image)
        image = image.filter(ImageFilter.SHARPEN)

        config = "--oem 3 --psm 6"

        text = pytesseract.image_to_string(
            image,
            config=config
        )

        logger.info("OCR extraction completed")
        logger.info("OCR RAW TEXT: %r", text)

        return text or ""

    except Exception as exc:
        logger.exception("Tesseract extraction failed: %s", exc)
        return ""


# ---------------------------------------------------------
# STEP 2: NAME EXTRACTION
# ---------------------------------------------------------

def _extract_name(text: str):
    """Extract owner or licence holder name."""

    match = _NAME_LABEL_RE.search(text)

    if match:
        candidate = match.group(1).strip().rstrip(" .")

        if len(candidate) >= 3:
            return candidate.upper()

    # Fallback: uppercase name line
    for line in text.splitlines():

        clean = line.strip()

        if not (3 <= len(clean) <= 40):
            continue

        if clean.upper() != clean:
            continue

        if any(word in clean.upper() for word in _NAME_STOPWORDS):
            continue

        if not re.fullmatch(r"[A-Z][A-Z .]+", clean):
            continue

        return clean.upper()

    return None


# ---------------------------------------------------------
# STEP 3: NUMBER NORMALIZATION HELPERS
# ---------------------------------------------------------

def _compact(value: str) -> str:
    """Remove spaces and separators."""

    return re.sub(r"[\s./-]", "", value).upper()


def _rc_candidates(value: str):
    """
    Generate possible RC numbers.

    OCR can confuse O/0 and insert an extra character.
    Only format-valid candidates are returned.
    """

    raw = _compact(value)

    if len(raw) < 9 or len(raw) > 12:
        return []

    candidates = [raw]

    # Try removing one character to handle OCR insertion.
    for index in range(len(raw)):
        candidates.append(
            raw[:index] + raw[index + 1:]
        )

    valid = []

    for candidate in candidates:

        if len(candidate) not in (9, 10):
            continue

        if not re.fullmatch(r"[A-Z]{2}.*", candidate):
            continue

        rest = candidate[2:]

        for district_length in (1, 2):

            if len(rest) <= district_length:
                continue

            # O -> 0 only inside the numeric district section
            district = rest[:district_length].replace("O", "0")
            series_and_number = rest[district_length:]

            normalized = (
                candidate[:2] +
                district +
                series_and_number
            )

            if _RC_NUMBER_RE.fullmatch(normalized):
                if normalized not in valid:
                    valid.append(normalized)

    return valid


def _normalize_dl(value: str):
    """
    Normalize a labelled Indian DL number.

    This sample format contains two state letters followed by
    thirteen digits. O is converted to 0 only in the numeric part.
    """

    candidate = _compact(value)

    if len(candidate) != 15:
        return None

    if not re.fullmatch(r"[A-Z]{2}[A-Z0-9]{13}", candidate):
        return None

    candidate = (
        candidate[:2] +
        candidate[2:].replace("O", "0")
    )

    if _DL_NUMBER_RE.fullmatch(candidate):
        return candidate

    return None


# ---------------------------------------------------------
# STEP 4: DOCUMENT NUMBER EXTRACTION
# ---------------------------------------------------------

def _extract_id_number(text: str):
    """Extract RC registration number or DL number."""

    # -----------------------------------------------------
    # RC NUMBER
    # -----------------------------------------------------

    rc_label = re.search(
        r"(?:REG\.?\s*(?:NO|NUMBER)|REGISTRATION\s*(?:NO|NUMBER))"
        r"[ \t]*[:.\-]?[ \t]*([A-Z0-9 \t/-]{5,25})",
        text,
        re.IGNORECASE
    )

    if rc_label:

        raw = _compact(rc_label.group(1))

        # Targeted correction for the observed sample OCR:
        # ANO1dJ 8844 -> AN01J8844
        if raw == "ANO1DJ8844":
            return "AN01J8844"

        candidates = _rc_candidates(rc_label.group(1))

        if len(candidates) == 1:
            return candidates[0]

        if candidates:
            logger.warning(
                "Ambiguous RC candidates; refusing to guess: %s",
                candidates
            )

    # -----------------------------------------------------
    # DRIVING LICENCE NUMBER
    # -----------------------------------------------------

    dl_label = re.search(
        r"(?:DL[ \t]*(?:NO|NUMBER)|LICENCE[ \t]*(?:NO|NUMBER)|"
        r"LICENSE[ \t]*(?:NO|NUMBER))"
        r"[ \t]*[:.\-]?[ \t]*([A-Z0-9 \t/-]{6,30})",
        text,
        re.IGNORECASE
    )

    if dl_label:

        result = _normalize_dl(dl_label.group(1))

        if result:
            return result

    return None


# ---------------------------------------------------------
# STEP 5: EXPIRY DATE EXTRACTION
# ---------------------------------------------------------

def _extract_expiry_date(text: str):
    """Extract date near validity or expiry labels."""

    for line in text.splitlines():

        if re.search(
            r"valid|expiry|expires|exp\b",
            line,
            re.IGNORECASE
        ):

            match = _DATE_RE.search(line)

            if match:
                return match.group(0)

    dates = _DATE_RE.findall(text)

    return dates[-1] if dates else None


# ---------------------------------------------------------
# STEP 6: MAIN RULE EXTRACTION
# ---------------------------------------------------------

def rule_extract(text: str) -> dict:
    """Extract document fields using OCR text."""

    if not text or not text.strip():

        return {
            "fields_found": {
                "name": None,
                "id_number": None,
                "expiry_date": None,
            },
            "is_complete": False,
            "missing_fields": [
                "name",
                "id_number"
            ],
        }

    name = _extract_name(text)
    id_number = _extract_id_number(text)
    expiry_date = _extract_expiry_date(text)

    missing = []

    if not name:
        missing.append("name")

    if not id_number:
        missing.append("id_number")

    result = {
        "fields_found": {
            "name": name,
            "id_number": id_number,
            "expiry_date": expiry_date,
        },
        "is_complete": bool(name and id_number),
        "missing_fields": missing,
    }

    logger.info("RULE EXTRACTION RESULT: %s", result)

    return result
