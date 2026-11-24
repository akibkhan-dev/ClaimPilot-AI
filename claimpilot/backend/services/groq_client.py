# Groq API wrapper — initializes the Groq client and provides helper functions for LLM calls

import os
import base64
import json
import re
from groq import Groq
from dotenv import load_dotenv

# Load .env file so GROQ_API_KEY is available when running locally
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

# ---------------------------------------------------------------------------
# Client initialisation — lazy so a missing key doesn't crash on import
# ---------------------------------------------------------------------------

VISION_MODEL = "qwen/qwen3.6-27b"
TEXT_MODEL    = "openai/gpt-oss-120b"

_client: Groq | None = None

def _get_client() -> Groq | None:
    """
    Return the shared Groq client, initialising it on first use.
    Returns None (and logs a warning) if GROQ_API_KEY is not set,
    so the server starts cleanly and routes fall back gracefully.
    """
    global _client
    if _client is not None:
        return _client
    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        print("[groq_client] WARNING: GROQ_API_KEY is not set. "
              "AI calls will return None and routes will use fallbacks.")
        return None
    _client = Groq(api_key=api_key)
    return _client


# ---------------------------------------------------------------------------
# Internal helper
# ---------------------------------------------------------------------------

def _parse_json_response(raw_text: str) -> dict | None:
    """
    Strip <think>...</think> reasoning blocks (used by thinking-mode
    models like qwen3.6-27b) and optional markdown code fences, then
    parse the remaining text as JSON.
    Returns the parsed dict, or None if parsing fails.
    """
    text = raw_text.strip()

    # Strip <think>...</think> reasoning block, if present anywhere.
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()

    # Strip ```json ... ``` or ``` ... ``` fences, anchored or not.
    fenced = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1).strip()

    # Last-resort fallback: grab the first {...} block in the text.
    if not text.startswith("{"):
        brace_match = re.search(r"\{.*\}", text, re.DOTALL)
        if brace_match:
            text = brace_match.group(0)

    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        print(f"[groq_client] JSON parse error: {exc}")
        print(f"[groq_client] Raw response was: {raw_text!r}")
        return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def analyze_image(image_bytes: bytes, content_type: str, prompt: str) -> dict | None:
    """
    Send an image + text prompt to the Llama 4 Scout vision model.

    Args:
        image_bytes:  Raw bytes of the uploaded image.
        content_type: MIME type, e.g. "image/jpeg" or "image/png".
        prompt:       Text instruction for the model.

    Returns:
        Parsed dict from the model's JSON response, or None on error.
    """
    encoded = base64.b64encode(image_bytes).decode("utf-8")
    data_url = f"data:{content_type};base64,{encoded}"

    client = _get_client()
    if client is None:
        return None

    try:
        response = client.chat.completions.create(
            model=VISION_MODEL,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": prompt,
                        },
                        {
                            "type": "image_url",
                            "image_url": {"url": data_url},
                        },
                    ],
                }
            ],
            temperature=0.2,
            max_tokens=3000,
        )

        raw_text = response.choices[0].message.content
        return _parse_json_response(raw_text)

    except Exception as exc:
        print(f"[groq_client] analyze_image exception: {exc}")
        return None


def analyze_text(prompt: str) -> dict | None:
    """
    Send a plain text prompt to the text-only reasoning model.

    Args:
        prompt: Full instruction string for the model.

    Returns:
        Parsed dict from the model's JSON response, or None on error.
    """
    client = _get_client()
    if client is None:
        return None

    try:
        response = client.chat.completions.create(
            model=TEXT_MODEL,
            messages=[
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
            temperature=0.2,
            max_tokens=500,
        )

        raw_text = response.choices[0].message.content
        return _parse_json_response(raw_text)

    except Exception as exc:
        print(f"[groq_client] analyze_text exception: {exc}")
        return None
