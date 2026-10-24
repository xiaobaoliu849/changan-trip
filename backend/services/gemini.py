"""Thin async wrapper over the Gemini REST API: JSON text, images and TTS."""
from __future__ import annotations

import base64
import io
import json
import logging
import os
import wave
from typing import Any

import httpx

logger = logging.getLogger(__name__)

BASE = "https://generativelanguage.googleapis.com/v1beta/models"
TEXT_MODEL = os.getenv("GEMINI_TEXT_MODEL", "gemini-3.5-flash")
IMAGE_MODEL = os.getenv("GEMINI_IMAGE_MODEL", "gemini-3.1-flash-image")
TTS_MODEL = os.getenv("GEMINI_TTS_MODEL", "gemini-3.8-flash-tts")
TTS_VOICE = os.getenv("GEMINI_TTS_VOICE", "Puck")
# Style prefix that gives 小俑 his voice; matches the pre-generated intros.
TTS_STYLE = "用憨厚、慢吞吞、有点自豪的老爷爷语气说："

_client: httpx.AsyncClient | None = None


def _http() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=90.0)
    return _client


def _key() -> str:
    key = os.getenv("GEMINI_API_KEY", "")
    if not key:
        raise RuntimeError("GEMINI_API_KEY is not set")
    return key


async def _generate(model: str, body: dict[str, Any]) -> dict[str, Any]:
    resp = await _http().post(
        f"{BASE}/{model}:generateContent",
        headers={"x-goog-api-key": _key(), "Content-Type": "application/json"},
        json=body,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Gemini {model} {resp.status_code}: {resp.text[:300]}")
    return resp.json()


def _parts(data: dict[str, Any]) -> list[dict[str, Any]]:
    try:
        return data["candidates"][0]["content"]["parts"]
    except (KeyError, IndexError):
        return []


async def generate_json(prompt: str, image_b64: str | None = None, mime: str = "image/jpeg") -> dict[str, Any]:
    parts: list[dict[str, Any]] = []
    if image_b64:
        parts.append({"inlineData": {"mimeType": mime, "data": image_b64}})
    parts.append({"text": prompt})
    data = await _generate(TEXT_MODEL, {
        "contents": [{"parts": parts}],
        # Minimal thinking keeps a brief at ~1.5 s instead of ~13 s.
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 1.0,
            "thinkingConfig": {"thinkingLevel": "minimal"},
        },
    })
    text = "".join(p.get("text", "") for p in _parts(data))
    return json.loads(text)


async def generate_image(prompt: str, aspect: str = "1:1", ref_b64: str | None = None,
                         ref_mime: str = "image/jpeg") -> str:
    """Return a data URL for the generated image."""
    parts: list[dict[str, Any]] = []
    if ref_b64:
        parts.append({"inlineData": {"mimeType": ref_mime, "data": ref_b64}})
    parts.append({"text": prompt})
    data = await _generate(IMAGE_MODEL, {
        "contents": [{"parts": parts}],
        "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": aspect}},
    })
    for p in _parts(data):
        if "inlineData" in p:
            return f"data:{p['inlineData']['mimeType']};base64,{p['inlineData']['data']}"
    raise RuntimeError("Gemini returned no image")


async def tts(text: str) -> str:
    """Speak ``text`` in 小俑's voice; return a WAV data URL."""
    data = await _generate(TTS_MODEL, {
        "contents": [{"parts": [{"text": TTS_STYLE + text}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": TTS_VOICE}}},
        },
    })
    for p in _parts(data):
        if "inlineData" in p:
            raw = base64.b64decode(p["inlineData"]["data"])
            if raw[:4] != b"RIFF":
                # Streaming-style raw PCM: 24 kHz mono 16-bit.
                buf = io.BytesIO()
                with wave.open(buf, "wb") as w:
                    w.setnchannels(1)
                    w.setsampwidth(2)
                    w.setframerate(24000)
                    w.writeframes(raw)
                raw = buf.getvalue()
            return "data:audio/wav;base64," + base64.b64encode(raw).decode()
    raise RuntimeError("Gemini returned no audio")
