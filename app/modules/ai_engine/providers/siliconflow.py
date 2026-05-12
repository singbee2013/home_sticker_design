"""SiliconFlow image provider (OpenAI-compatible Images API)."""
from __future__ import annotations

import base64
import os

import httpx

from app.config import get_settings
from . import AIProvider


class SiliconFlowProvider(AIProvider):
    name = "siliconflow"

    def __init__(self) -> None:
        cfg = get_settings().ai_provider_config("siliconflow")
        self.api_key = os.getenv("SILICONFLOW_API_KEY", cfg.get("api_key", "")).strip()
        self.base_url = os.getenv(
            "SILICONFLOW_API_URL",
            cfg.get("api_url", "https://api.siliconflow.cn/v1"),
        ).rstrip("/")
        self.model = os.getenv(
            "SILICONFLOW_MODEL",
            cfg.get("model", "Kwai-Kolors/Kolors"),
        )

    def _headers(self) -> dict:
        if not self.api_key:
            raise RuntimeError("SILICONFLOW_API_KEY is not set.")
        return {"Authorization": f"Bearer {self.api_key}"}

    @staticmethod
    def _decode(resp_json: dict) -> bytes:
        item = (resp_json.get("data") or [{}])[0]
        b64 = item.get("b64_json")
        if b64:
            return base64.b64decode(b64)
        url = item.get("url")
        if url:
            r = httpx.get(url, timeout=60)
            r.raise_for_status()
            return r.content
        raise RuntimeError(f"Unexpected SiliconFlow image response: {resp_json}")

    @staticmethod
    def _format_error(resp: httpx.Response) -> str:
        try:
            body = resp.json()
        except Exception:
            body = resp.text
        return f"{resp.status_code} {resp.reason_phrase} | {str(body)[:500]}"

    def text_to_image(
        self,
        prompt: str,
        style_hint: str = "",
        width: int = 1024,
        height: int = 1024,
        **kwargs,
    ) -> bytes:
        full_prompt = f"{style_hint} {prompt}".strip() if style_hint else prompt
        payload = {
            "model": self.model,
            "prompt": full_prompt,
            "size": f"{width}x{height}",
            "n": 1,
            "response_format": "b64_json",
        }
        resp = httpx.post(
            f"{self.base_url}/images/generations",
            headers=self._headers(),
            json=payload,
            timeout=180,
        )
        if resp.status_code >= 400:
            raise RuntimeError(f"SiliconFlow text2img failed: {self._format_error(resp)}")
        return self._decode(resp.json())

    def image_to_image(
        self,
        image_data: bytes,
        prompt: str = "",
        style_hint: str = "",
        width: int = 1024,
        height: int = 1024,
        **kwargs,
    ) -> bytes:
        full_prompt = f"{style_hint} {prompt}".strip() if style_hint else prompt
        files = {"image": ("ref.png", image_data, "image/png")}
        data = {
            "model": self.model,
            "prompt": full_prompt,
            "size": f"{width}x{height}",
            "n": "1",
            "response_format": "b64_json",
        }
        resp = httpx.post(
            f"{self.base_url}/images/edits",
            headers=self._headers(),
            files=files,
            data=data,
            timeout=180,
        )
        if resp.status_code >= 400:
            raise RuntimeError(f"SiliconFlow img2img failed: {self._format_error(resp)}")
        return self._decode(resp.json())

    def generate_scene_photoreal(
        self,
        prompt: str,
        mode: str = "lifestyle",
        width: int = 1024,
        height: int = 1024,
        **kwargs,
    ) -> bytes:
        scene_hint = (
            "Photorealistic interior lifestyle scene, natural light, no text."
            if (mode or "lifestyle") != "studio_white"
            else "Professional studio white background product scene, soft shadow, no text."
        )
        return self.text_to_image(f"{scene_hint} {prompt}".strip(), width=width, height=height)

    def listing_image_from_product(self, product_png: bytes, instruction: str, **kwargs) -> bytes:
        return self.image_to_image(product_png, prompt=instruction or "ecommerce listing style")

    def composite_product_on_scene(
        self,
        product_png: bytes,
        scene_png: bytes,
        placement_hint: str = "auto",
        **kwargs,
    ) -> bytes:
        prompt = (
            "Keep the scene realistic and place product sticker artwork naturally on a plausible surface. "
            f"Placement hint: {placement_hint or 'auto'}."
        )
        # SiliconFlow edits API currently supports one reference image per request in this integration.
        # We use the scene as base image for a best-effort composite prompt.
        return self.image_to_image(scene_png, prompt=prompt)
