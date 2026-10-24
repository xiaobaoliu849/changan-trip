"""Regenerate the pre-made voice lines in frontend/public/assets/voice/ with Gemini TTS.

Run from the repo root:  python -m backend.make_voice [name ...]   (needs GEMINI_API_KEY in .env and `pip install lameenc`)
Uses the same call as the live game (style in speech_metadata, never in the text), and each clip
is still transcribed back and regenerated until it says exactly its line. Keep LINES in sync with the matching text in frontend/src/App.tsx.
"""
from __future__ import annotations

import asyncio
import base64
import difflib
import logging
import os
import sys
from pathlib import Path

import lameenc

from . import main  # noqa: F401 - loads .env
from .services import ai

LINES = {
    "opening": "我叫小俑，第一次出坑！你是谁呀？没事，我会记住你的。",
    "zhonglou": "这是钟楼，六百多岁，比我年轻多了。跟着钟声敲，可别吵醒全城。",
    "huiminjie": "回民街到啦！客人点啥你就接啥，接到辣子赶紧喝水。",
    "bingmayong": "这是我老家！我那帮老战友里，总有一个偷偷动了一下。",
    "chengqiang": "城墙一圈十三点七四公里，骑上车，躲开游客和自拍杆！",
    "datang": "大唐不夜城比我那会儿还亮堂，头顶的灯笼可稳住喽。",
    "dayanta": "大雁塔到了，咱今天这趟没白走。临走前，有啥想对我说的？我记小本本上，下回你来，我还认得你。",
}
OUT = Path(__file__).resolve().parent.parent / "frontend" / "public" / "assets" / "voice"
TRIES = 5
CHECK_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent"


def _norm(s: str) -> str:
    # The transcriber writes 俑 as its homophone 勇, and 啦/喽 as 了; those are not reading errors.
    s = "".join(ch for ch in s if ch.isalnum())
    for a, b in (("勇", "俑"), ("啦", "了"), ("喽", "了")):
        s = s.replace(a, b)
    return s


async def transcribe(pcm: bytes) -> str:
    resp = await ai._http().post(CHECK_URL, headers={"x-goog-api-key": os.environ["GEMINI_API_KEY"]}, json={
        "contents": [{"parts": [
            {"inlineData": {"mimeType": "audio/wav", "data": base64.b64encode(ai.pcm_to_wav(pcm)).decode()}},
            {"text": "逐字转写这段音频里说的全部中文，数字也用汉字写，只输出转写文字，不要加任何解释。"},
        ]}],
        "generationConfig": {"temperature": 0},
    })
    ai._check(resp, "transcribe")
    return "".join(p.get("text", "") for p in resp.json()["candidates"][0]["content"]["parts"]).strip()


def to_mp3(pcm: bytes) -> bytes:
    enc = lameenc.Encoder()
    enc.set_bit_rate(64)
    enc.set_in_sample_rate(24000)
    enc.set_channels(1)
    enc.set_quality(2)
    return enc.encode(pcm) + enc.flush()


def trim_silence(pcm: bytes, threshold: int = 300, pad: int = 4800) -> bytes:
    """Cut leading/trailing silence, keeping 0.1 s of padding."""
    samples = memoryview(pcm).cast("h")
    loud = [i for i in range(0, len(samples), 240) if abs(samples[i]) > threshold]
    if not loud:
        return pcm
    start, end = max(0, loud[0] - pad), min(len(samples), loud[-1] + pad)
    return bytes(samples[start:end])


def max_secs(text: str) -> float:
    # 小俑 talks slowly, but past ~0.5 s per character the take has long dead pauses.
    return len(_norm(text)) * 0.5 + 1.5


async def best_take(text: str) -> tuple[bytes, str, float]:
    best: tuple[bytes, str, float] = (b"", "", -1.0)
    for _ in range(TRIES):
        try:
            pcm = trim_silence(await ai.gemini_pcm(text))
            heard = await transcribe(pcm)
        except Exception as exc:  # noqa: BLE001 - flaky network: just take another go
            print(f"  retry ({exc!s:.80})")
            continue
        score = difflib.SequenceMatcher(None, _norm(text), _norm(heard)).ratio()
        if len(pcm) / 48000 > max_secs(text):
            score -= 0.5
        if score > best[2]:
            best = (pcm, heard, score)
        if score == 1.0:
            break
    return best


async def main_(names: list[str]) -> None:
    logging.getLogger("httpx").setLevel(logging.WARNING)
    for name, text in LINES.items():
        if names and name not in names:
            continue
        pcm, heard, score = await best_take(text)
        if not pcm:
            print(f"[FAIL] vo_{name}.mp3 kept as is")
            continue
        (OUT / f"vo_{name}.mp3").write_bytes(to_mp3(pcm))
        flag = "OK " if score == 1.0 else f"{score:.2f}"
        print(f"[{flag}] vo_{name}.mp3  {len(pcm) / 48000:.1f}s  heard: {heard}")


if __name__ == "__main__":
    asyncio.run(main_(sys.argv[1:]))
