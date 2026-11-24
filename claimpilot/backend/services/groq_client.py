import os
import base64
import json
import re
import logging

import httpx
from groq import Groq
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Load environment variables
BASE_DIR = os.path.dirname(
    os.path.dirname(os.path.abspath(__file__))
)
load_dotenv(os.path.join(BASE_DIR, ".env"))

# Groq model configuration
VISION_MODEL = "qwen/qwen3.8-27b"
TEXT_MODEL = "openai/gpt-oss-120b"

_client = None


def _get_client():
    """Initialize Groq client lazily."""

    global _client

    if _client is not None:
        return _client

    api_key = os.getenv("GROQ_API_KEY", "").strip()

    if not api_key:
        logger.warning("GROQ_API_KEY is not configured.")
        return None

    try:
        http_client = httpx.Client(timeout=30.0)
        _client = Groq(api_key=api_key, http_client=http_client)
        return _client

    except Exception:
        logger.exception("Groq client initialization failed.")
        return None


def _parse_json_response(raw_text):
    """Extract and parse JSON from an LLM response."""

    if not raw_text:
        return None

    text = raw_text.strip()

    # Remove thinking blocks
    text = re.sub(
        r"<think>.*?</think>",
        "",
        text,
        flags=re.DOTALL
    ).strip()

    # Remove Markdown code fences
    fenced = re.search(
        r"```(?:json)?\s*(.*?)\s*```",
        text,
        flags=re.DOTALL | re.IGNORECASE
    )

    if fenced:
        text = fenced.group(1).strip()

    # Extract JSON object if additional text exists
    if not text.startswith("{"):
        match = re.search(r"\{.*\}", text, re.DOTALL)

        if match:
            text = match.group(0)

    try:
        result = json.loads(text)

        if isinstance(result, dict):
            return result

        return None

    except json.JSONDecodeError:
        logger.warning("Groq returned invalid JSON.")
        logger.debug("Raw response: %r", raw_text)
        return None


def analyze_image(image_bytes, content_type, prompt):
    """Analyze an uploaded document using Groq vision."""

    try:
        client = _get_client()

        if client is None:
            return None

        if not image_bytes:
            logger.warning("Empty image received.")
            return None

        encoded = base64.b64encode(
            image_bytes
        ).decode("utf-8")

        data_url = f"data:{content_type};base64,{encoded}"

        response = client.chat.completions.create(
            model=VISION_MODEL,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": prompt
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": data_url
                            }
                        }
                    ]
                }
            ],
            temperature=0.2,
            max_tokens=3000,
            response_format={
                "type": "json_object"
            }
        )

        raw_text = response.choices[0].message.content

        return _parse_json_response(raw_text)

    except Exception:
        logger.exception("Groq image analysis failed.")
        return None


def analyze_text(prompt):
    """Analyze text using Groq language model."""

    try:
        client = _get_client()

        if client is None:
            return None

        response = client.chat.completions.create(
            model=TEXT_MODEL,
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.2,
            max_tokens=500
        )

        raw_text = response.choices[0].message.content

        return _parse_json_response(raw_text)

    except Exception:
        logger.exception("Groq text analysis failed.")
        return None
