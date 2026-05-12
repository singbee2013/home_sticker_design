"""Mock AI provider — generates a deterministic placeholder PNG locally.

Use this when no real AI API key is configured. The image embeds the prompt text
so users can verify the full upload/generate/store/display pipeline works
end-to-end without any external dependency.
"""
from __future__ import annotations

import hashlib
import io
import textwrap
from typing import Tuple

from PIL import Image, ImageDraw, ImageFont

from . import AIProvider


def _color_from_text(text: str) -> Tuple[int, int, int]:
    h = hashlib.md5(text.encode("utf-8")).digest()
    return (h[0], h[1], h[2])


def _render(prompt: str, style_hint: str, width: int, height: int, tag: str) -> bytes:
    width = max(64, min(width, 4096))
    height = max(64, min(height, 4096))
    bg = _color_from_text(prompt + style_hint)
    fg = (255 - bg[0], 255 - bg[1], 255 - bg[2])

    img = Image.new("RGB", (width, height), bg)
    draw = ImageDraw.Draw(img)

    # Soft diagonal stripes for visual interest
    step = max(20, width // 24)
    for i in range(-height, width, step):
        draw.line([(i, 0), (i + height, height)], fill=fg, width=2)

    # Centered text panel
    panel_h = max(120, height // 4)
    panel_box = (0, (height - panel_h) // 2, width, (height + panel_h) // 2)
    draw.rectangle(panel_box, fill=(255, 255, 255))

    try:
        font_big = ImageFont.truetype("/System/Library/Fonts/PingFang.ttc", max(24, width // 28))
        font_small = ImageFont.truetype("/System/Library/Fonts/PingFang.ttc", max(14, width // 60))
    except Exception:
        font_big = ImageFont.load_default()
        font_small = ImageFont.load_default()

    title = f"[MOCK · {tag}] {width}×{height}"
    body = "\n".join(textwrap.wrap(prompt or "(empty prompt)", width=28)[:4])
    style_line = f"style: {style_hint[:60]}" if style_hint else ""

    draw.text((20, panel_box[1] + 12), title, fill=(20, 20, 20), font=font_big)
    draw.text((20, panel_box[1] + 12 + max(28, width // 24)), body, fill=(40, 40, 40), font=font_small)
    if style_line:
        draw.text((20, panel_box[3] - max(20, width // 50)), style_line, fill=(100, 100, 100), font=font_small)

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


class MockProvider(AIProvider):
    """Always-available offline provider for local development and demos."""

    name = "mock"

    def text_to_image(self, prompt: str, style_hint: str = "",
                      width: int = 1024, height: int = 1024, **kwargs) -> bytes:
        return _render(prompt, style_hint, width, height, "text2img")

    def image_to_image(self, image_data: bytes, prompt: str = "",
                       style_hint: str = "", width: int = 1024, height: int = 1024,
                       **kwargs) -> bytes:
        # Try to honour the reference image's size if it loads cleanly
        try:
            ref = Image.open(io.BytesIO(image_data))
            width, height = ref.size
        except Exception:
            pass
        return _render(prompt or "(img2img variant)", style_hint, width, height, "img2img")
