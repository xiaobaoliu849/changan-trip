"""Draw the falling food sprites for the 回民街 mini-game into frontend/public/assets/img/food_*.png.

Run from the repo root:  python -m backend.make_food [id ...]   (needs OPENAI_NEXT_API_KEY in .env, and Pillow)
Each dish is generated on white, cut out, trimmed and given a white sticker outline so it reads
against the dark night-market background. Keep the ids in sync with FOODS in frontend/src/api.ts.
"""
from __future__ import annotations

import asyncio
import base64
import io
import logging
import sys

from PIL import Image, ImageDraw, ImageFilter

from . import main  # noqa: F401 - loads .env
from .main import ASSET_DIR
from .services import ai

STYLE = (
    "A single game item icon in a cute cartoon illustration style: thick dark-brown outlines, warm cel shading, "
    "rich appetizing colors, slightly top-down three-quarter view, centered, filling most of the frame. "
    "Plain pure white background, no shadow on the ground, no text, no labels, no hands, nothing else in the picture. "
)

# Each prompt leans on what tells the dish apart at a glance, and the vessels differ on purpose
# (handheld bun, plate, wide bowl, deep bowl, leaf) so the three noodle/soup dishes don't blur together.
DISHES = {
    "roujiamo": (
        "Xi'an roujiamo (肉夹馍): a round golden-brown baiji flatbread with a toasted darker ring around the edge "
        "and a swirl pattern on top, sliced open on one side like a clamshell and stuffed so full of glistening "
        "chopped braised pork belly that the meat spills out, with a few bits of green pepper. "
        "The lower half is wrapped in a small brown paper sleeve."
    ),
    "biangbiang": (
        "Xi'an biangbiang noodles (油泼面): a big wide white bowl with a blue rim holding extremely wide, flat, "
        "belt-like hand-pulled noodles, each as wide as a belt, topped with a heap of bright red chili flakes, "
        "minced garlic and green scallion with sizzling oil, and a few green bok choy leaves. "
        "A pair of wooden chopsticks lifts one long wide noodle ribbon high out of the bowl."
    ),
    "liangpi": (
        "Xi'an liangpi cold skin noodles (凉皮): on a shallow round white plate, glossy translucent pale-yellow "
        "wide flat cold noodles, drenched in bright red chili oil, topped with fresh green julienned cucumber "
        "shreds and a few spongy tan gluten cubes."
    ),
    "paomo": (
        "Xi'an yangrou paomo (羊肉泡馍): a large deep blue-and-white porcelain bowl of cloudy creamy mutton soup, "
        "full of small torn cubes of flatbread, thin slices of mutton, clear glass noodles, chopped green cilantro "
        "and scallion. Beside the bowl sits a tiny dish of pickled sweet garlic cloves."
    ),
    "jingao": (
        "Xi'an jingao steamed sticky rice cake (甑糕): a thick square slice of glossy white glutinous rice cake "
        "layered with deep red-purple jujube dates and dark red kidney beans, the dates shiny and sticky, "
        "served on a green reed leaf."
    ),
}

WORK = 512  # cut-out and outline are done at this size
OUT = 192  # sprites draw at ~64 px, so this stays sharp on 3x screens
OUTLINE = 10  # px at WORK size


def cut_out(raw: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(raw)).convert("RGBA")
    img.thumbnail((WORK, WORK), Image.LANCZOS)
    # Flood-fill the near-white background from a 1 px white frame, so whites inside the dish stay.
    near_white = img.convert("L").point(lambda v: 255 if v > 232 else 0)
    w, h = near_white.size
    framed = Image.new("L", (w + 2, h + 2), 255)
    framed.paste(near_white, (1, 1))
    ImageDraw.floodfill(framed, (0, 0), 128)
    bg = framed.crop((1, 1, w + 1, h + 1)).point(lambda v: 255 if v == 128 else 0)
    alpha = Image.eval(bg, lambda v: 255 - v).filter(ImageFilter.MinFilter(3))  # drop the pale fringe
    img.putalpha(alpha)
    img = img.crop(alpha.getbbox())

    # White sticker outline: grow the alpha and lay the dish over it.
    pad = OUTLINE + 2
    canvas = Image.new("RGBA", (img.width + 2 * pad, img.height + 2 * pad), (0, 0, 0, 0))
    canvas.paste(img, (pad, pad), img)
    grown = canvas.getchannel("A")
    for _ in range(OUTLINE // 2):
        grown = grown.filter(ImageFilter.MaxFilter(5))
    grown = grown.filter(ImageFilter.GaussianBlur(1)).point(lambda v: 255 if v > 100 else v * 2)
    sticker = Image.new("RGBA", canvas.size, (255, 255, 255, 0))
    sticker.putalpha(grown)
    sticker.alpha_composite(canvas)
    sticker.thumbnail((OUT, OUT), Image.LANCZOS)
    return sticker


async def make(dish: str) -> None:
    url = await ai.generate_image(STYLE + DISHES[dish])
    raw = base64.b64decode(url.split(",", 1)[1])
    path = ASSET_DIR / "img" / f"food_{dish}.png"
    cut_out(raw).save(path, optimize=True)
    logging.info("wrote %s", path.relative_to(ASSET_DIR.parent.parent.parent))


async def run(names: list[str]) -> None:
    results = await asyncio.gather(*(make(n) for n in names), return_exceptions=True)
    for name, res in zip(names, results):
        if isinstance(res, Exception):
            logging.error("%s failed: %s", name, res)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    asked = sys.argv[1:] or list(DISHES)
    unknown = [n for n in asked if n not in DISHES]
    if unknown:
        sys.exit(f"unknown dish: {', '.join(unknown)} (choose from {', '.join(DISHES)})")
    asyncio.run(run(asked))
