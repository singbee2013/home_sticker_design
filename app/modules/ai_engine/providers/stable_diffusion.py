"""Stable Diffusion API provider."""
from __future__ import annotations
import os, httpx, base64
from . import AIProvider


class StableDiffusionProvider(AIProvider):
    name = "stable_diffusion"

    def __init__(self):
        self.api_key = os.getenv("SD_API_KEY", "")
        self.base_url = os.getenv("SD_API_URL", "https://api.stability.ai/v1")

    def text_to_image(self, prompt: str, style_hint: str = "",
                      width: int = 1024, height: int = 1024, **kwargs) -> bytes:
        full_prompt = f"{style_hint} {prompt}".strip() if style_hint else prompt
        resp = httpx.post(
            f"{self.base_url}/generation/stable-diffusion-xl-1024-v1-0/text-to-image",
            headers={"Authorization": f"Bearer {self.api_key}", "Accept": "application/json"},
            json={"text_prompts": [{"text": full_prompt}], "width": width, "height": height, "samples": 1},
            timeout=120,
        )
        resp.raise_for_status()
        return base64.b64decode(resp.json()["artifacts"][0]["base64"])

    def image_to_image(self, image_data: bytes, prompt: str = "",
                       style_hint: str = "", width: int = 1024, height: int = 1024, **kwargs) -> bytes:
        full_prompt = f"{style_hint} {prompt}".strip() if style_hint else prompt
        resp = httpx.post(
            f"{self.base_url}/generation/stable-diffusion-xl-1024-v1-0/image-to-image",
            headers={"Authorization": f"Bearer {self.api_key}", "Accept": "application/json"},
            files={"init_image": ("ref.png", image_data, "image/png")},
            data={"text_prompts[0][text]": full_prompt, "init_image_mode": "IMAGE_STRENGTH", "image_strength": 0.35},
            timeout=120,
        )
        resp.raise_for_status()
        return base64.b64decode(resp.json()["artifacts"][0]["base64"])

