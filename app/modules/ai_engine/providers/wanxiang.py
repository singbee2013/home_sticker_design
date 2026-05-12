"""Tongyi Wanxiang provider (DashScope text-to-image)."""
from __future__ import annotations

import base64
import os
import time

import httpx

from app.config import get_settings
from . import AIProvider


class WanxiangProvider(AIProvider):
    name = "wanxiang"

    def __init__(self) -> None:
        cfg = get_settings().ai_provider_config("wanxiang")
        self.api_key = os.getenv("DASHSCOPE_API_KEY", cfg.get("api_key", "")).strip()
        self.base_url = os.getenv(
            "DASHSCOPE_API_URL",
            cfg.get("api_url", "https://dashscope.aliyuncs.com"),
        ).rstrip("/")
        self.model = os.getenv("WANXIANG_MODEL", cfg.get("model", "wanx2.1-t2i-turbo"))

    def _headers(self) -> dict:
        if not self.api_key:
            raise RuntimeError("DASHSCOPE_API_KEY is not set.")
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "X-DashScope-Async": "enable",
        }

    @staticmethod
    def _format_error(resp: httpx.Response) -> str:
        try:
            body = resp.json()
        except Exception:
            body = resp.text
        return f"{resp.status_code} {resp.reason_phrase} | {str(body)[:500]}"

    def _submit_task(self, prompt: str, width: int, height: int) -> str:
        payload = {
            "model": self.model,
            "input": {"prompt": prompt},
            "parameters": {
                "size": f"{width}*{height}",
                "n": 1,
            },
        }
        resp = httpx.post(
            f"{self.base_url}/api/v1/services/aigc/text2image/image-synthesis",
            headers=self._headers(),
            json=payload,
            timeout=60,
        )
        if resp.status_code >= 400:
            raise RuntimeError(f"Wanxiang submit failed: {self._format_error(resp)}")
        task_id = (resp.json().get("output") or {}).get("task_id")
        if not task_id:
            raise RuntimeError(f"Wanxiang submit failed: invalid response {resp.text[:300]}")
        return task_id

    def _poll_result(self, task_id: str) -> bytes:
        headers = {"Authorization": f"Bearer {self.api_key}"}
        for _ in range(40):
            resp = httpx.get(
                f"{self.base_url}/api/v1/tasks/{task_id}",
                headers=headers,
                timeout=60,
            )
            if resp.status_code >= 400:
                raise RuntimeError(f"Wanxiang poll failed: {self._format_error(resp)}")
            data = resp.json()
            status = (data.get("output") or {}).get("task_status")
            if status == "SUCCEEDED":
                results = ((data.get("output") or {}).get("results") or [])
                if not results:
                    raise RuntimeError("Wanxiang task succeeded but no image result returned.")
                item = results[0]
                url = item.get("url")
                b64 = item.get("base64_data")
                if b64:
                    return base64.b64decode(b64)
                if not url:
                    raise RuntimeError("Wanxiang result missing image url.")
                img = httpx.get(url, timeout=60)
                img.raise_for_status()
                return img.content
            if status in ("FAILED", "CANCELED"):
                msg = ((data.get("output") or {}).get("message") or data.get("message") or "unknown")
                raise RuntimeError(f"Wanxiang task failed: {msg}")
            time.sleep(1.5)
        raise RuntimeError("Wanxiang task polling timed out.")

    def text_to_image(
        self,
        prompt: str,
        style_hint: str = "",
        width: int = 1024,
        height: int = 1024,
        **kwargs,
    ) -> bytes:
        full_prompt = f"{style_hint} {prompt}".strip() if style_hint else prompt
        task_id = self._submit_task(full_prompt, width, height)
        return self._poll_result(task_id)

    def image_to_image(
        self,
        image_data: bytes,
        prompt: str = "",
        style_hint: str = "",
        width: int = 1024,
        height: int = 1024,
        **kwargs,
    ) -> bytes:
        # Wanxiang in this project currently wired for text2img only.
        # Fall back to prompt-guided generation for compatibility.
        full_prompt = f"{style_hint} {prompt}".strip() if style_hint else prompt
        task_id = self._submit_task(full_prompt or "high-quality product pattern", width, height)
        return self._poll_result(task_id)

    def generate_scene_photoreal(
        self,
        prompt: str,
        mode: str = "lifestyle",
        width: int = 1024,
        height: int = 1024,
        **kwargs,
    ) -> bytes:
        scene_hint = (
            "photorealistic interior lifestyle room scene"
            if (mode or "lifestyle") != "studio_white"
            else "professional ecommerce studio white background"
        )
        return self.text_to_image(f"{scene_hint}, {prompt}".strip(), width=width, height=height)

    def listing_image_from_product(self, product_png: bytes, instruction: str, **kwargs) -> bytes:
        return self.text_to_image(
            f"Generate an ecommerce product listing image. {instruction}",
            width=1024,
            height=1024,
        )

    def composite_product_on_scene(
        self,
        product_png: bytes,
        scene_png: bytes,
        placement_hint: str = "auto",
        **kwargs,
    ) -> bytes:
        return self.text_to_image(
            "Generate a photorealistic scene with sticker/decal artwork naturally composited "
            f"onto a plausible surface. Placement hint: {placement_hint}.",
            width=1024,
            height=1024,
        )
