"""Midjourney API provider (via third-party proxy)."""
from __future__ import annotations
import os, httpx, base64, time
from . import AIProvider


class MidjourneyProvider(AIProvider):
    name = "midjourney"

    def __init__(self):
        self.api_key = os.getenv("MJ_API_KEY", "")
        self.base_url = os.getenv("MJ_API_URL", "https://api.example.com/mj")

    def text_to_image(self, prompt: str, style_hint: str = "",
                      width: int = 1024, height: int = 1024, **kwargs) -> bytes:
        full_prompt = f"{style_hint} {prompt}".strip() if style_hint else prompt
        resp = httpx.post(
            f"{self.base_url}/imagine",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={"prompt": full_prompt},
            timeout=180,
        )
        resp.raise_for_status()
        data = resp.json()
        image_url = data.get("imageUrl") or data.get("url", "")
        img_resp = httpx.get(image_url, timeout=60)
        return img_resp.content

    def image_to_image(self, image_data: bytes, prompt: str = "",
                       style_hint: str = "", width: int = 1024, height: int = 1024, **kwargs) -> bytes:
        full_prompt = f"{style_hint} {prompt}".strip() if style_hint else prompt
        resp = httpx.post(
            f"{self.base_url}/blend",
            headers={"Authorization": f"Bearer {self.api_key}"},
            files={"image": ("ref.png", image_data, "image/png")},
            data={"prompt": full_prompt},
            timeout=180,
        )
        resp.raise_for_status()
        data = resp.json()
        image_url = data.get("imageUrl") or data.get("url", "")
        img_resp = httpx.get(image_url, timeout=60)
        return img_resp.content

