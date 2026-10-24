"""Thin async wrapper over the OpenAI Next gateway (OpenAI-compatible) for JSON text and images,
plus 小俑's voice: Gemini TTS when Google is reachable, Microsoft Edge neural TTS otherwise.
"""
from __future__ import annotations

import base64
import io
import json
import logging
import os
import wave
from typing import Any

import edge_tts
import httpx

logger = logging.getLogger(__name__)

BASE = os.getenv("OPENAI_NEXT_BASE_URL", "https://api.openai-next.com/v1").rstrip("/")
TEXT_MODEL = os.getenv("AI_TEXT_MODEL", "claude-sonnet-5-5")
# Used when TEXT_MODEL fails (the gateway sometimes 502s for a while). Text-only prompts.
# Chosen because it sticks to the real memories; deepseek-v4-flash / qwen3.5-plus invented past events.
TEXT_FALLBACK_MODEL = os.getenv("AI_TEXT_FALLBACK_MODEL", "gpt-5.6-terra")
IMAGE_MODEL = os.getenv("AI_IMAGE_MODEL", "gpt-image-2")
IMAGE_QUALITY = os.getenv("AI_IMAGE_QUALITY", "low")  # low ≈ 25 s, default ≈ 35-80 s
# 小俑's voice, per the Gemini 3.8 TTS guide (ai.google.dev/gemini-api/docs/speech-generation):
# POST /v1beta/interactions, ``text`` is read strictly verbatim, and delivery goes in the separate
# speech_metadata.style annotation, which is never spoken. Character comes from the voice itself, so
# never put character notes or "用…语气说：" in the text. Flash-Lite is the guide's pick for read-aloud.
GEMINI_TTS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions"
GEMINI_TTS_MODEL = os.getenv("GEMINI_TTS_MODEL", "gemini-3.8-flash-lite-tts")
GEMINI_TTS_VOICE = os.getenv("GEMINI_TTS_VOICE", "Gacrux")
GEMINI_TTS_STYLE = os.getenv("GEMINI_TTS_STYLE", "slow, warm and honest, a little proud, like a kind old soldier")
GEMINI_TTS_TIMEOUT = float(os.getenv("GEMINI_TTS_TIMEOUT", "25"))
# Players and the server are in mainland China, where Google is unreachable, so live lines use Edge TTS.
# Gemini is used ahead of time for the pre-made clips (backend/make_voice.py). Set LIVE_TTS=gemini
# only on a server that can reach Google.
LIVE_TTS = os.getenv("LIVE_TTS", "edge")
# Fallback when Google is unreachable: style lives only in these parameters, never in the text.
TTS_VOICE = os.getenv("TTS_VOICE", "zh-CN-YunjianNeural")
TTS_RATE = os.getenv("TTS_RATE", "-18%")
TTS_PITCH = os.getenv("TTS_PITCH", "-10Hz")
SIZES = {"1:1": "1024x1024", "4:3": "1536x1024", "3:4": "1024x1536"}

_client: httpx.AsyncClient | None = None


def _http() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        # Image edits are usually ~35 s but the upstream occasionally takes minutes.
        _client = httpx.AsyncClient(timeout=httpx.Timeout(300.0, connect=15.0))
    return _client


def _headers() -> dict[str, str]:
    key = os.getenv("OPENAI_NEXT_API_KEY", "")
    if not key:
        raise RuntimeError("OPENAI_NEXT_API_KEY is not set")
    return {"Authorization": f"Bearer {key}"}


def configured() -> bool:
    return bool(os.getenv("OPENAI_NEXT_API_KEY"))


async def _post(url: str, *, retry_timeout: bool = True, **kw: Any) -> httpx.Response:
    """POST with one retry on 5xx (and on timeout unless slow): the gateway's upstreams are occasionally overloaded."""
    for attempt in (1, 2):
        try:
            resp = await _http().post(url, headers=_headers(), **kw)
        except httpx.TimeoutException:
            if attempt == 2 or not retry_timeout:
                raise RuntimeError(f"{url.rsplit('/', 1)[-1]} timed out") from None
            continue
        if resp.status_code < 500 or attempt == 2:
            return resp
        logger.warning("%s %s, retrying", url, resp.status_code)
    raise AssertionError("unreachable")


def _check(resp: httpx.Response, what: str) -> None:
    if resp.status_code != 200:
        raise RuntimeError(f"{what} {resp.status_code}: {resp.text[:300]}")


def _strip_fence(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1].rsplit("```", 1)[0]
    return text.strip()


async def _chat_json(model: str, content: list[dict[str, Any]]) -> dict[str, Any]:
    resp = await _post(f"{BASE}/chat/completions", timeout=60.0, json={
        "model": model,
        "messages": [{"role": "user", "content": content}],
        "response_format": {"type": "json_object"},
        "temperature": 1.0,
        "max_tokens": 1200,
    })
    _check(resp, model)
    # 小俑 says 我, never 俺: the voices misread 俺, and the model sometimes slips into it anyway.
    text = _strip_fence(resp.json()["choices"][0]["message"]["content"]).replace("俺", "我")
    return json.loads(text)


async def generate_json(prompt: str, image_b64: str | None = None, mime: str = "image/jpeg") -> dict[str, Any]:
    content: list[dict[str, Any]] = []
    if image_b64:
        content.append({"type": "image_url", "image_url": {"url": f"data:{mime};base64,{image_b64}"}})
    content.append({"type": "text", "text": prompt})
    try:
        return await _chat_json(TEXT_MODEL, content)
    except Exception as exc:  # noqa: BLE001
        if image_b64 or not TEXT_FALLBACK_MODEL:
            raise
        logger.warning("%s failed (%s), trying %s", TEXT_MODEL, str(exc)[:80], TEXT_FALLBACK_MODEL)
        return await _chat_json(TEXT_FALLBACK_MODEL, content)


async def _to_data_url(item: dict[str, Any]) -> str:
    if item.get("b64_json"):
        return "data:image/png;base64," + item["b64_json"]
    # Some upstreams return only a URL; inline it so the browser never hits a foreign host.
    resp = await _http().get(item["url"])
    _check(resp, "image download")
    mime = resp.headers.get("content-type", "image/png").split(";")[0]
    return f"data:{mime};base64," + base64.b64encode(resp.content).decode()


async def generate_image(prompt: str, aspect: str = "1:1",
                         refs: list[tuple[str, str]] | None = None) -> str:
    """Return a data URL. ``refs`` is a list of (base64, mime) reference images to edit from."""
    size = SIZES.get(aspect, "1024x1024")
    if refs:
        files = [("image[]", (f"ref{i}.{mime.split('/')[-1]}", base64.b64decode(b64), mime))
                 for i, (b64, mime) in enumerate(refs)]
        resp = await _post(f"{BASE}/images/edits", retry_timeout=False, files=files, data={
            "model": IMAGE_MODEL, "prompt": prompt, "size": size, "quality": IMAGE_QUALITY,
        })
    else:
        resp = await _post(f"{BASE}/images/generations", retry_timeout=False, json={
            "model": IMAGE_MODEL, "prompt": prompt, "size": size, "quality": IMAGE_QUALITY,
        })
    _check(resp, IMAGE_MODEL)
    data = resp.json().get("data") or []
    if not data:
        raise RuntimeError("image model returned no image")
    return await _to_data_url(data[0])


def agent_platform_url(model: str) -> str:
    return f"https://aiplatform.googleapis.com/v1/publishers/google/models/{model}:generateContent"


async def _agent_platform_pcm(text: str, key: str) -> bytes:
    # Same model, voice and style, but on Google Agent Platform (Vertex AI): it has a far higher rate
    # limit than the AI Studio key. Agent Platform takes TTS through generateContent, not Interactions.
    resp = await _http().post(
        agent_platform_url(GEMINI_TTS_MODEL),
        headers={"x-goog-api-key": key},
        timeout=GEMINI_TTS_TIMEOUT,
        json={
            "contents": [{"role": "user", "parts": [{"text": text, "speech_metadata": {"style": GEMINI_TTS_STYLE}}]}],
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": GEMINI_TTS_VOICE}}},
            },
        },
    )
    _check(resp, GEMINI_TTS_MODEL)
    parts = resp.json()["candidates"][0]["content"]["parts"]
    audio = [p["inlineData"]["data"] for p in parts if "inlineData" in p]
    if not audio:
        raise RuntimeError("Gemini returned no audio")
    return base64.b64decode(audio[-1])


async def gemini_pcm(text: str) -> bytes:
    """Speak exactly ``text`` with Gemini TTS; return raw 24 kHz mono 16-bit PCM."""
    if agent_key := os.getenv("AGENT_PLATFORM_API_KEY", ""):
        raw = await _agent_platform_pcm(text, agent_key)
        if raw[:4] == b"RIFF":
            with wave.open(io.BytesIO(raw)) as w:
                raw = w.readframes(w.getnframes())
        return raw
    key = os.getenv("GEMINI_API_KEY", "")
    if not key:
        raise RuntimeError("GEMINI_API_KEY is not set")
    resp = await _http().post(
        GEMINI_TTS_URL,
        headers={"x-goog-api-key": key},
        timeout=GEMINI_TTS_TIMEOUT,
        json={
            "model": GEMINI_TTS_MODEL,
            "input": [{"type": "user_input", "content": [{
                "type": "text",
                "text": text,
                "annotations": [{"type": "speech_metadata", "style": GEMINI_TTS_STYLE}],
            }]}],
            "response_format": {"type": "audio"},
            "generation_config": {"speech_config": [{"voice": GEMINI_TTS_VOICE}]},
        },
    )
    _check(resp, GEMINI_TTS_MODEL)
    audio = [c for step in resp.json().get("steps", []) if step.get("type") == "model_output"
             for c in step.get("content", []) if c.get("type") == "audio"]
    if not audio:
        raise RuntimeError("Gemini returned no audio")
    raw = base64.b64decode(audio[-1]["data"])
    if raw[:4] == b"RIFF":  # unary requests return a full WAV
        with wave.open(io.BytesIO(raw)) as w:
            raw = w.readframes(w.getnframes())
    return raw


def pcm_to_wav(pcm: bytes) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(24000)
        w.writeframes(pcm)
    return buf.getvalue()


async def edge_mp3(text: str) -> bytes:
    """Speak exactly ``text`` with Edge neural TTS; return MP3 bytes."""
    audio = bytearray()
    async for chunk in edge_tts.Communicate(text, TTS_VOICE, rate=TTS_RATE, pitch=TTS_PITCH).stream():
        if chunk["type"] == "audio":
            audio += chunk["data"]
    if not audio:
        raise RuntimeError("TTS returned no audio")
    return bytes(audio)


async def tts(text: str) -> str:
    """Speak ``text`` in 小俑's voice; return an audio data URL."""
    if LIVE_TTS == "gemini":
        try:
            return "data:audio/wav;base64," + base64.b64encode(pcm_to_wav(await gemini_pcm(text))).decode()
        except Exception as exc:  # noqa: BLE001 - Google may be unreachable from China
            logger.warning("Gemini TTS failed, using Edge TTS: %s", exc)
    return "data:audio/mpeg;base64," + base64.b64encode(await edge_mp3(text)).decode()
