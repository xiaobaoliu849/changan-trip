"""Generate the background music in frontend/public/assets/music/ with Gemini Lyria.

Run from the repo root:  python -m backend.make_music [name ...]   (needs GEMINI_API_KEY in .env)
Like the voice clips, music is made once here and shipped as static files, so players in
mainland China never call Google. Bump MUSIC_VERSION in frontend/src/media.ts after regenerating.
"""
from __future__ import annotations

import asyncio
import base64
import logging
import os
import sys
from pathlib import Path

from . import main  # noqa: F401 - loads .env
from .services import ai

MODEL = os.getenv("MUSIC_MODEL", "lyria-3.5")
URL = "https://generativelanguage.googleapis.com/v1beta/interactions"
OUT = Path(__file__).resolve().parent.parent / "frontend" / "public" / "assets" / "music"
LOOP = (
    "Instrumental only, absolutely no vocals, no singing, no humming, no spoken words. "
    "Seamless loop: steady energy from start to end, no intro build-up, no fade-out, no big ending. "
    "Mixed as background music for a cute casual mobile game, leaving room for a character's voice."
)
TRACKS = {
    # English prompts for these two came back as Western folk / polka, so they are written in Chinese.
    "town": (
        "一段 90 秒的纯器乐中国民乐，逛古都西安的轻快俏皮小调。只用中国传统民族乐器："
        "古筝和琵琶弹主旋律，竹笛吹副旋律，木鱼、梆子和小堂鼓打轻快节奏。"
        "五声音阶（宫调式），100 BPM，欢快、温暖、可爱，像庙会和老街。"
        "不要吉他、不要手风琴、不要钢琴、不要西洋乐器，不要拉丁或爵士风格。"
        "全程纯器乐，绝对没有人声、哼唱或说话。整段能量平稳，不要前奏铺垫、不要渐弱、不要收尾大和弦，方便循环播放。"
    ),
    "game": (
        "一段 90 秒的纯器乐中国民乐小游戏战斗曲，节奏紧凑欢快。只用中国传统民族乐器："
        "琵琶快速轮指和扫弦、古筝刮奏、竹笛吹出抓耳的主题，大堂鼓、小锣和钹打出有冲劲的节奏。"
        "五声音阶，132 BPM，热闹、有点紧张又好玩，像舞狮和庙会杂耍。"
        "不要手风琴、不要吉他、不要钢琴、不要西洋乐器，不要波尔卡或电子风格。"
        "全程纯器乐，绝对没有人声、哼唱或说话。整段能量平稳，不要前奏铺垫、不要渐弱、不要收尾大和弦，方便循环播放。"
    ),
    "finale": (
        "A 90-second warm, gentle and slightly nostalgic Chinese piece for the end of a happy day in Xi'an "
        "at sunset by the Giant Wild Goose Pagoda. Erhu and guzheng melody over soft strings and light "
        "percussion, 80 BPM, heartfelt and hopeful. " + LOOP
    ),
}


async def generate(name: str, prompt: str) -> None:
    resp = await ai._http().post(URL, headers={"x-goog-api-key": os.environ["GEMINI_API_KEY"]},
                                 timeout=300, json={"model": MODEL, "input": prompt})
    ai._check(resp, MODEL)
    data = resp.json()
    audio = [c for s in data.get("steps", []) if s.get("type") == "model_output"
             for c in s.get("content", []) if c.get("type") == "audio"]
    text = " ".join(c.get("text", "") for s in data.get("steps", []) if s.get("type") == "model_output"
                    for c in s.get("content", []) if c.get("type") == "text")
    if not audio:
        raise RuntimeError(f"{name}: no audio in response")
    raw = base64.b64decode(audio[-1]["data"])
    (OUT / f"bgm_{name}.mp3").write_bytes(raw)
    print(f"bgm_{name}.mp3  {len(raw) // 1024} KB  structure: {text[:160]!r}")


async def run(names: list[str]) -> None:
    logging.getLogger("httpx").setLevel(logging.WARNING)
    OUT.mkdir(parents=True, exist_ok=True)
    await asyncio.gather(*(generate(n, p) for n, p in TRACKS.items() if not names or n in names))


if __name__ == "__main__":
    asyncio.run(run(sys.argv[1:]))
