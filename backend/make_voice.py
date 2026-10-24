"""Regenerate the pre-made voice lines in frontend/public/assets/voice/ with Gemini TTS.

Run from the repo root:  python -m backend.make_voice [name ...]   (needs AGENT_PLATFORM_API_KEY or GEMINI_API_KEY in .env, and `pip install lameenc`)
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
    # Whispered from the pit on the home screen, before the traveler has met 小俑.
    "home": "两千两百年了……今天，会有人带我出去看看吗？",
    # Prologue: the traveler spots the warrior that moved.
    "wake": "嘘！别喊！我在坑里站了两千两百年，外面啥样都没见过……你带我出去转转呗？",
    "wake_talk": "会！还会背秦律呢。走不走嘛？",
    "wake_go": "好嘞！等我拍拍土……走！",
    "opening": "原来你是这个样子！我叫小俑，今天跟你出门。你去哪我去哪，我都记小本本上。",
    # 再游一次: the traveler comes back to the pit for 小俑 (fallback when no memory line is written).
    "again": "又是你！我在坑里一直等着呢。走，接着带我出去逛！",
    # 小俑's reaction after the traveler shows it each stop (the traveler's line is text only).
    # Keep polyphones out (行 长 了 得 当 朝 …): the TTS read 行家 as xíngjiā, and the transcript check
    # can't hear that, since it writes the right character either way. 肉夹馍 stays: the joke needs it.
    "zhonglou": "才六百岁？小娃娃嘛！你来敲，我捂耳朵。",
    "huiminjie": "我是泥做的，不能吃……我点菜，你替我吃！辣子可别碰！",
    "bingmayong": "糟了，他们也想溜出来！找出偷偷动的那个，把它按回去。",
    "chengqiang": "比我年轻一千五百多岁！我坐车筐里，你骑！",
    "datang": "我那会儿晚上可没这么亮！你顶灯笼，我给你喊号子。",
    # 小俑问你: asked on each stop's result screen.
    "q_bingmayong": "外面的人咋都不穿铠甲？不打仗了？",
    "q_chengqiang": "那些人举着棍子对自己笑，是在施法吗？",
    "q_zhonglou": "现在钟不响了，大家咋知道起床？",
    "q_huiminjie": "肉夹馍，到底是肉夹馍，还是馍夹肉？",
    "q_datang": "这么亮，晚上谁睡觉啊？",
    # 小俑's reply to each answer (a_<stop>_<answer index>); the trip moves on once it ends.
    "a_bingmayong_0": "太平好！那我这身铠甲……改成睡衣吧。",
    "a_bingmayong_1": "洗衣机？那是啥兵器？我记小本本上了！",
    "a_chengqiang_0": "自拍杆……我也想要一根！",
    "a_chengqiang_1": "我就知道！回去教给老战友。",
    "a_zhonglou_0": "会发光的竹简，还会喊人起床？厉害！",
    "a_zhonglou_1": "那我也不起了，明天睡到晌午！",
    "a_huiminjie_0": "古汉语？那我熟啊，早该听懂的！",
    "a_huiminjie_1": "有道理！可我是泥做的，只能闻闻。",
    "a_datang_0": "那我今天也是游客啦！头一回当游客。",
    "a_datang_1": "难怪钟楼的钟退休了！",
    "dayanta": "大雁塔到了！谢谢你带我出来开眼。天亮前我要回坑里站好，临走前，有啥想对我说的？我记小本本上。",
}
OUT = Path(__file__).resolve().parent.parent / "frontend" / "public" / "assets" / "voice"
TRIES = 5
CHECK_MODEL = "gemini-3.5-flash"
CHECK_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{CHECK_MODEL}:generateContent"


def _norm(s: str) -> str:
    # The transcriber writes 俑 as its homophone 勇, and 啦/喽 as 了; those are not reading errors.
    s = "".join(ch for ch in s if ch.isalnum())
    for a, b in (("勇", "俑"), ("啦", "了"), ("喽", "了")):
        s = s.replace(a, b)
    return s


async def transcribe(pcm: bytes) -> str:
    # Same Agent Platform key as the TTS when it is set, so the check doesn't hit the AI Studio rate limit.
    agent_key = os.getenv("AGENT_PLATFORM_API_KEY", "")
    url = ai.agent_platform_url(CHECK_MODEL) if agent_key else CHECK_URL
    key = agent_key or os.environ["GEMINI_API_KEY"]
    resp = await ai._http().post(url, headers={"x-goog-api-key": key}, json={
        "contents": [{"role": "user", "parts": [
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
            if "429" in str(exc):  # rate limit: give the per-minute quota time to refill
                await asyncio.sleep(40)
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
