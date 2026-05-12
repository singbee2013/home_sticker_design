"""Gemini image provider (Google AI Studio / Gemini API)."""
from __future__ import annotations
import os
import base64
import time
import io

import httpx
from PIL import Image
from app.config import get_settings
from . import AIProvider


class GeminiProvider(AIProvider):
    name = "gemini"

    def __init__(self):
        cfg = get_settings().ai_provider_config("gemini")
        self.api_key = os.getenv("GEMINI_API_KEY", "").strip()
        self.base_url = os.getenv(
            "GEMINI_API_URL", cfg.get("api_url", "https://generativelanguage.googleapis.com/v1beta")
        ).rstrip("/")
        # Keep model configurable so you can switch in AI Studio quickly.
        self.model = os.getenv(
            "GEMINI_MODEL", cfg.get("model", "gemini-2.5-flash-image")
        )

    def _endpoint(self) -> str:
        if not self.api_key:
            raise RuntimeError("GEMINI_API_KEY is not set.")
        return f"{self.base_url}/models/{self.model}:generateContent?key={self.api_key}"

    @staticmethod
    def _enforce_no_text(prompt: str) -> str:
        """Prevent model from drawing visible words on generated patterns."""
        suffix = (
            " IMPORTANT: image only, no text, no letters, no words, "
            "no logos, no watermark, no signature."
        )
        return f"{prompt}{suffix}"

    @staticmethod
    def _extract_image_bytes(payload: dict) -> bytes:
        candidates = payload.get("candidates") or []
        if not candidates:
            err = payload.get("error", {})
            msg = err.get("message") if isinstance(err, dict) else str(payload)[:400]
            raise RuntimeError(f"No candidates in Gemini response: {msg}")
        parts = candidates[0].get("content", {}).get("parts", [])
        for part in parts:
            if "inlineData" in part and part["inlineData"].get("data"):
                return base64.b64decode(part["inlineData"]["data"])
        raise RuntimeError("No image in Gemini response (no inlineData in parts)")

    @staticmethod
    def _format_http_error(exc: httpx.HTTPStatusError) -> str:
        resp = exc.response
        try:
            body = resp.json()
        except Exception:
            body = resp.text
        return f"{resp.status_code} {resp.reason_phrase} | {str(body)[:500]}"

    def _post_with_retry(self, json_payload: dict, timeout: int = 120) -> httpx.Response:
        """Retry transient errors (rate limits, overload, bad gateway)."""
        attempts = 3
        retry_status = frozenset({429, 502, 503, 504})
        for idx in range(attempts):
            try:
                resp = httpx.post(self._endpoint(), json=json_payload, timeout=timeout)
            except httpx.ConnectError as exc:
                raise RuntimeError(
                    "Gemini network error: cannot reach Google API (DNS or firewall). "
                    "If you use Docker/Podman, set dns (8.8.8.8) and optional extra_hosts for "
                    "generativelanguage.googleapis.com in docker-compose.yml, then recreate the app container."
                ) from exc
            except httpx.TimeoutException as exc:
                raise RuntimeError("Gemini request timed out; try again or reduce prompt/image size.") from exc
            if resp.status_code in retry_status and idx < attempts - 1:
                time.sleep(1.5 * (idx + 1))
                continue
            try:
                resp.raise_for_status()
            except httpx.HTTPStatusError as exc:
                raise RuntimeError(f"Gemini request failed: {self._format_http_error(exc)}") from exc
            return resp
        raise RuntimeError("Gemini request failed after retries.")

    def text_to_image(self, prompt: str, style_hint: str = "",
                      width: int = 1024, height: int = 1024, **kwargs) -> bytes:
        full_prompt = f"{style_hint} {prompt}".strip() if style_hint else prompt
        full_prompt = self._enforce_no_text(full_prompt)
        resp = self._post_with_retry(
            {
                "contents": [{"parts": [{"text": f"Generate an image: {full_prompt}"}]}],
                "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]},
            },
            timeout=120,
        )
        return self._extract_image_bytes(resp.json())

    @staticmethod
    def _guess_mime(image_data: bytes) -> str:
        if len(image_data) >= 8 and image_data[:8] == b"\x89PNG\r\n\x1a\n":
            return "image/png"
        if len(image_data) >= 2 and image_data[:2] == b"\xff\xd8":
            return "image/jpeg"
        return "image/png"

    @staticmethod
    def _shrink_if_needed(image_data: bytes, max_side: int = 2048, max_bytes: int = 4 * 1024 * 1024) -> bytes:
        if len(image_data) <= max_bytes:
            return image_data
        try:
            img = Image.open(io.BytesIO(image_data))
            w, h = img.size
            scale = min(max_side / max(w, 1), max_side / max(h, 1), 1.0)
            if scale < 1.0:
                img = img.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
            if img.mode not in ("RGB", "RGBA"):
                img = img.convert("RGBA")
            buf = io.BytesIO()
            img.save(buf, format="PNG", optimize=True)
            return buf.getvalue()
        except Exception:
            return image_data

    def generate_scene_photoreal(self, prompt: str, mode: str = "lifestyle",
                                 width: int = 1024, height: int = 1024, **kwargs) -> bytes:
        """Lifestyle room set or studio white-background product scene (no seamless pattern rules)."""
        mode = (mode or "lifestyle").lower().strip()
        if mode == "studio_white":
            scene_hint = (
                "Professional e-commerce product photography on pure seamless white background, "
                "soft shadow, studio lighting, ultra sharp, catalog-ready."
            )
        else:
            scene_hint = (
                "Photorealistic interior lifestyle photograph suitable as a product mockup backdrop; "
                "natural daylight, realistic materials, depth of field; looks like a real photo."
            )
        full = (
            f"{scene_hint} Scene brief: {prompt}. "
            "No watermarks, no logos. Avoid random unreadable text overlays in the frame."
        )
        resp = self._post_with_retry(
            {
                "contents": [{"parts": [{"text": f"Generate an image: {full}"}]}],
                "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]},
            },
            timeout=120,
        )
        return self._extract_image_bytes(resp.json())

    def composite_product_on_scene(
        self,
        product_png: bytes,
        scene_png: bytes,
        placement_hint: str = "auto",
        **kwargs,
    ) -> bytes:
        """Place flat product artwork onto a real scene photorealistically (two reference images)."""
        placement = placement_hint.strip() or (
            "Automatically choose the best plausible surface (wall, floor, window, or furniture) "
            "and perspective-match the product decal/sticker."
        )
        instruction = (
            "IMAGE 1 is the PRODUCT GRAPHIC (flat sticker/decal artwork with transparency treated as print artwork). "
            "IMAGE 2 is the BACKGROUND SCENE photograph. "
            f"Composite IMAGE 1 realistically onto IMAGE 2: {placement}. "
            "Match lighting, shadows, and perspective. Final output must look like a real lifestyle photograph. "
            "No extra captions, no watermarks, no logos, no random gibberish text."
        )
        product_png = self._shrink_if_needed(product_png)
        scene_png = self._shrink_if_needed(scene_png)
        p64 = base64.b64encode(product_png).decode()
        s64 = base64.b64encode(scene_png).decode()
        pm = self._guess_mime(product_png)
        sm = self._guess_mime(scene_png)
        resp = self._post_with_retry(
            {
                "contents": [{
                    "parts": [
                        {"text": instruction},
                        {"inlineData": {"mimeType": pm, "data": p64}},
                        {"inlineData": {"mimeType": sm, "data": s64}},
                    ]
                }],
                "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]},
            },
            timeout=180,
        )
        return self._extract_image_bytes(resp.json())

    def listing_image_from_product(self, product_png: bytes, instruction: str, **kwargs) -> bytes:
        """Single-image guided ecommerce listing render."""
        product_png = self._shrink_if_needed(product_png)
        allow_text = bool(kwargs.get("allow_text", False))
        b64img = base64.b64encode(product_png).decode()
        mime = self._guess_mime(product_png)
        full = (
            f"{instruction} Keep the product truthful to the reference image. "
            "Photorealistic ecommerce photography. No watermarks, no unreadable text overlays."
        )
        if not allow_text:
            full += " No visible text, no labels, no logos."
        resp = self._post_with_retry(
            {
                "contents": [{
                    "parts": [
                        {"text": full},
                        {"inlineData": {"mimeType": mime, "data": b64img}},
                    ]
                }],
                "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]},
            },
            timeout=180,
        )
        return self._extract_image_bytes(resp.json())

    def image_to_image(self, image_data: bytes, prompt: str = "",
                       style_hint: str = "", width: int = 1024, height: int = 1024, **kwargs) -> bytes:
        full_prompt = f"{style_hint} {prompt}".strip() if style_hint else prompt
        full_prompt = self._enforce_no_text(full_prompt)
        image_data = self._shrink_if_needed(image_data)
        b64img = base64.b64encode(image_data).decode()
        resp = self._post_with_retry(
            {
                "contents": [{
                    "parts": [
                        {"text": f"Modify this image: {full_prompt}"},
                        {"inlineData": {"mimeType": "image/png", "data": b64img}},
                    ]
                }],
                "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]},
            },
            timeout=120,
        )
        return self._extract_image_bytes(resp.json())

