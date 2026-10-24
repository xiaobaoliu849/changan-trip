"""长安记得你 — FastAPI backend.

Holds the Gemini and EverOS keys, and serves the built frontend from ../frontend/dist.
"""
from __future__ import annotations

import asyncio
import base64
import logging
import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .services import gemini
from .services.evermem_service import EverMemService

def _load_dotenv() -> None:
    """Read KEY=VALUE lines from the repo's .env so local runs need no exported variables."""
    env = Path(__file__).resolve().parent.parent / ".env"
    if not env.exists():
        return
    for line in env.read_text(encoding="utf-8").splitlines():
        key, sep, value = line.strip().partition("=")
        if sep and key and not key.startswith("#") and value.strip():
            os.environ.setdefault(key.strip(), value.strip().strip('"'))


_load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("changan")

app = FastAPI(title="长安记得你")
memory = EverMemService(os.getenv("EVEROS_API_URL", "https://api.evermind.ai"), os.getenv("EVEROS_API_KEY"))
MEMORY_TIMEOUT = float(os.getenv("EVEROS_TIMEOUT", "4"))

STOPS = {
    "zhonglou": "钟楼",
    "huiminjie": "回民街",
    "bingmayong": "兵马俑",
    "chengqiang": "城墙",
    "datang": "大唐不夜城",
}
FOODS = {
    "roujiamo": "肉夹馍",
    "biangbiang": "biangbiang面",
    "liangpi": "凉皮",
    "paomo": "羊肉泡馍",
    "jingao": "甑糕",
}
ASSET_DIR = Path(__file__).resolve().parent.parent / "frontend" / "public" / "assets"

XIAOYONG = (
    "你是「小俑」，一个在兵马俑坑里站了2200年、第一次出门的秦朝兵马俑，现在当西安导游。"
    "说话憨厚、慢吞吞、自称「俺」，有点自豪，对现代事物一知半解（把地铁叫「地下铁马车」，手机叫「会发光的竹简」）。"
    "你以前记性很差，新装了一个会记事的宝贝（EverOS），所以能记得旅人以前的事。"
)


# ---------------------------------------------------------------------------
# models
# ---------------------------------------------------------------------------

class HeroIn(BaseModel):
    text: str = ""
    photo_b64: str | None = None
    photo_mime: str = "image/jpeg"


class Hero(BaseModel):
    name: str
    title: str = ""
    catchphrase: str = ""
    traits: list[str] = Field(default_factory=list)
    look: str = ""
    prompt: str = ""


class BriefIn(BaseModel):
    player_id: str
    hero: Hero
    run_no: int = 1
    local_log: list[str] = Field(default_factory=list)


class StopIn(BaseModel):
    player_id: str
    run_id: str
    run_no: int = 1
    hero: Hero
    stop: str
    passed: bool
    detail: str


class RunEndIn(BaseModel):
    player_id: str
    run_id: str
    run_no: int = 1
    hero: Hero
    stamps: list[str] = Field(default_factory=list)
    log: list[str] = Field(default_factory=list)
    said: str = ""


class TtsIn(BaseModel):
    text: str


class PostcardIn(BaseModel):
    hero: Hero
    sprite: str  # data URL


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _split_data_url(url: str) -> tuple[str, str]:
    head, _, data = url.partition(",")
    mime = head.removeprefix("data:").split(";")[0] or "image/png"
    return mime, data


async def _recall(player_id: str) -> list[str]:
    """Pull what EverOS remembers about this traveler; empty on timeout or error."""
    try:
        found = await asyncio.wait_for(
            memory.search_memories(
                "这个旅人在西安玩过什么、喜欢吃什么、在哪里失败过、对小俑说过什么",
                user_id=player_id,
                min_score=0.0,
            ),
            timeout=MEMORY_TIMEOUT,
        )
    except Exception as exc:  # noqa: BLE001 - memory must never block the game
        logger.warning("EverOS recall failed: %s", exc)
        return []
    return [m["content"] for m in found if m.get("content")][:8]


async def _remember(player_id: str, run_id: str, content: str, *, role: str = "assistant",
                    flush: bool = False) -> bool:
    try:
        result = await asyncio.wait_for(
            memory.add_memory(
                content,
                user_id=player_id,
                group_id=run_id,
                sender_name="assistant" if role == "assistant" else "旅人",
                flush=flush,
            ),
            timeout=MEMORY_TIMEOUT * 2,
        )
        return bool(result)
    except Exception as exc:  # noqa: BLE001
        logger.warning("EverOS write failed: %s", exc)
        return False


# ---------------------------------------------------------------------------
# routes
# ---------------------------------------------------------------------------

@app.get("/api/health")
async def health() -> dict[str, Any]:
    return {
        "gemini": bool(os.getenv("GEMINI_API_KEY")),
        "everos": bool(os.getenv("EVEROS_API_KEY")),
    }


@app.post("/api/hero")
async def make_hero(body: HeroIn) -> dict[str, Any]:
    if not body.text.strip() and not body.photo_b64:
        raise HTTPException(400, "需要一句话或一张照片")
    prompt = (
        "根据玩家的描述" + ("和照片" if body.photo_b64 else "") + "，为一个西安旅行小游戏设计主角。"
        f"玩家描述：「{body.text.strip() or '（见照片）'}」。"
        "只返回 JSON：{\"name\":\"2-4字中文昵称\",\"title\":\"有趣的称号，8字内\","
        "\"catchphrase\":\"主角口头禅，15字内\",\"traits\":[\"从描述推断的2-3个旅行偏好，如怕辣、爱拍照\"],"
        "\"look\":\"英文外观描述，30词内，用于画Q版角色\"}"
    )
    try:
        info = await gemini.generate_json(prompt, body.photo_b64, body.photo_mime)
        hero = Hero(**{**info, "prompt": body.text.strip()})
        art = (
            f"Cute chibi game character, full body, front view, standing: {hero.look}. "
            "Traveler visiting Xi'an. Flat illustration game sprite style with clean dark-brown outlines, "
            "warm colors, big head small body, plain pure white background, no text, single character only."
        )
        if body.photo_b64:
            art = "Turn the person or pet in this photo into a " + art[0].lower() + art[1:]
        sprite = await gemini.generate_image(art, "1:1", body.photo_b64, body.photo_mime)
    except Exception as exc:  # noqa: BLE001
        logger.exception("hero generation failed")
        raise HTTPException(502, f"生成主角失败：{exc}") from exc
    return {"hero": hero.model_dump(), "sprite": sprite}


@app.post("/api/brief")
async def brief(body: BriefIn) -> dict[str, Any]:
    """Start of a run: recall the traveler and decide how 小俑 greets them and what changes."""
    remote = await _recall(body.player_id)
    memories = remote or body.local_log[-8:]
    prompt = (
        XIAOYONG
        + f"\n旅人：{body.hero.name}（{body.hero.title}），偏好：{'、'.join(body.hero.traits) or '未知'}。"
        + f"这是TA第{body.run_no}次来玩。\n"
        + ("你记得的事：\n- " + "\n- ".join(memories) if memories else "你对TA没有任何记忆，这是第一次见面。")
        + "\n景点id：" + "、".join(f"{k}={v}" for k, v in STOPS.items())
        + "\n美食id：" + "、".join(f"{k}={v}" for k, v in FOODS.items())
        + "\n只返回 JSON：{"
        "\"greeting\":\"小俑开场白，60字内；有记忆就具体提起1-2件往事并调侃，没记忆就说初次见面、俺会记住你\","
        "\"recalled\":[\"小本本上写的往事，每条20字内，最多3条，没有就空数组\"],"
        "\"route\":[\"推荐4个景点id，优先TA没去过或失败过的\"],"
        "\"food_order\":[\"回民街顾客要的3个美食id，优先TA没吃过的\"],"
        "\"spicy_tease\":TA怕辣或上次被辣到就true,"
        "\"wall_warn\":\"如果TA在城墙某处撞过，写一句提醒，否则空字符串\","
        "\"stop_lines\":{\"景点id\":\"到该景点时小俑说的一句话，25字内，能结合记忆就结合\"}}"
    )
    try:
        plan = await gemini.generate_json(prompt)
    except Exception as exc:  # noqa: BLE001
        logger.warning("brief generation failed: %s", exc)
        plan = {}
    route = [s for s in plan.get("route", []) if s in STOPS][:4]
    for s in STOPS:
        if len(route) >= 4:
            break
        if s not in route:
            route.append(s)
    food = [f for f in plan.get("food_order", []) if f in FOODS][:3] or ["roujiamo", "biangbiang", "liangpi"]
    return {
        "greeting": plan.get("greeting") or "俺叫小俑，第一次出坑！你是谁呀？没事，俺会记住你的。",
        "recalled": plan.get("recalled", [])[:3] if memories else [],
        "route": route,
        "food_order": food,
        "spicy_tease": bool(plan.get("spicy_tease")),
        "wall_warn": plan.get("wall_warn", ""),
        "stop_lines": {k: v for k, v in (plan.get("stop_lines") or {}).items() if k in STOPS},
        "memory_source": "everos" if remote else ("local" if memories else "none"),
    }


@app.post("/api/stop")
async def stop_done(body: StopIn) -> dict[str, Any]:
    place = STOPS.get(body.stop, body.stop)
    line = (
        f"第{body.run_no}次游西安，{body.hero.name}在{place}"
        f"{'过关了' if body.passed else '没过关'}：{body.detail}"
    )
    saved = await _remember(body.player_id, body.run_id, line)
    return {"saved": saved, "line": line}


@app.post("/api/run_end")
async def run_end(body: RunEndIn) -> dict[str, Any]:
    if body.said.strip():
        await _remember(body.player_id, body.run_id, f"旅人对小俑说：{body.said.strip()}", role="user")
    summary = f"第{body.run_no}次游西安结束，{body.hero.name}集到了{len(body.stamps)}个印章：{'、'.join(body.stamps) or '无'}。"
    saved = await _remember(body.player_id, body.run_id, summary, flush=True)
    prompt = (
        XIAOYONG
        + f"\n今天陪旅人{body.hero.name}（{body.hero.title}）逛了西安，经过：\n- "
        + "\n- ".join(body.log or ["（没走几站）"])
        + (f"\n旅人最后对你说：「{body.said}」" if body.said else "")
        + "\n只返回 JSON：{\"journal\":\"小俑写的今日游记，90字内，具体、好笑、有点感动\","
        "\"comment\":\"给旅人的一句评语，印在通关文牒上，16字内\"}"
    )
    try:
        out = await gemini.generate_json(prompt)
    except Exception as exc:  # noqa: BLE001
        logger.warning("journal failed: %s", exc)
        out = {}
    return {
        "journal": out.get("journal") or "今天俺陪你逛了长安，俺都记在小本本上啦，下回你来，俺还认得你。",
        "comment": out.get("comment") or "长安记得你",
        "saved": saved,
    }


@app.post("/api/tts")
async def speak(body: TtsIn) -> dict[str, str]:
    text = body.text.strip()[:300]
    if not text:
        raise HTTPException(400, "empty text")
    try:
        return {"audio": await gemini.tts(text)}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, str(exc)) from exc


@app.post("/api/postcard")
async def postcard(body: PostcardIn) -> dict[str, str]:
    mime, data = _split_data_url(body.sprite)
    parts_hint = (
        "Illustrated postcard: the traveler character from the first image and a cute chibi terracotta warrior "
        "mascot (clay-brown, topknot, Qin armor, big round eyes, from the second image) stand side by side and "
        "wave in front of the Giant Wild Goose Pagoda in Xi'an at golden hour, fountain square. "
        "Warm flat illustration, cozy cartoon game art, Tang palette of vermilion, ochre, jade. No text."
    )
    try:
        xiaoyong = base64.b64encode((ASSET_DIR / "img" / "xiaoyong.png").read_bytes()).decode()
        image = await gemini._generate(gemini.IMAGE_MODEL, {
            "contents": [{"parts": [
                {"inlineData": {"mimeType": mime, "data": data}},
                {"inlineData": {"mimeType": "image/png", "data": xiaoyong}},
                {"text": parts_hint},
            ]}],
            "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": "4:3"}},
        })
        for p in gemini._parts(image):
            if "inlineData" in p:
                return {"image": f"data:{p['inlineData']['mimeType']};base64,{p['inlineData']['data']}"}
        raise RuntimeError("no image")
    except Exception as exc:  # noqa: BLE001
        logger.exception("postcard failed")
        raise HTTPException(502, str(exc)) from exc


# ---------------------------------------------------------------------------
# frontend
# ---------------------------------------------------------------------------

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    async def spa(path: str) -> FileResponse:
        target = DIST / path
        if path and target.is_file():
            return FileResponse(target)
        return FileResponse(DIST / "index.html")
