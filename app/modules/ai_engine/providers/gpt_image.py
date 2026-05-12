"""GPT Image provider — supports both OpenAI public API and Azure AI Foundry.

Azure AI Foundry / Azure OpenAI gpt-image-1 (a.k.a. gpt-image-2 deployment)
authentication priority:
  1. Entra ID (DefaultAzureCredential)  ← recommended for production
  2. AZURE_OPENAI_API_KEY               ← fallback
  3. OPENAI_API_KEY                     ← public OpenAI endpoint

Required env / config (see config/settings.yaml → ai.gpt_image):
  AZURE_OPENAI_ENDPOINT     e.g. https://my-resource.openai.azure.com
                            or   https://my-project.services.ai.azure.com
  AZURE_OPENAI_DEPLOYMENT   e.g. gpt-image-1   (your deployment name)
  AZURE_OPENAI_API_VERSION  e.g. 2025-04-01-preview   (optional)
  AZURE_OPENAI_USE_ENTRA_ID true|false                (optional, default: auto)
"""
from __future__ import annotations

import base64
import os
import time
from typing import Optional

import httpx

from app.config import get_settings
from . import AIProvider

# Token cache (avoid acquiring a new Entra token on every call)
_TOKEN_CACHE: dict = {"value": None, "expires_at": 0.0}
_AZURE_SCOPE = "https://cognitiveservices.azure.com/.default"


def _get_entra_token() -> str:
    """Acquire (and cache) an Azure AD access token via DefaultAzureCredential."""
    now = time.time()
    if _TOKEN_CACHE["value"] and _TOKEN_CACHE["expires_at"] - now > 60:
        return _TOKEN_CACHE["value"]
    try:
        from azure.identity import DefaultAzureCredential
    except ImportError as e:
        raise RuntimeError(
            "Entra ID auth requires `azure-identity`. Install it: "
            "pip install azure-identity"
        ) from e
    cred = DefaultAzureCredential(exclude_interactive_browser_credential=False)
    token = cred.get_token(_AZURE_SCOPE)
    _TOKEN_CACHE["value"] = token.token
    _TOKEN_CACHE["expires_at"] = float(token.expires_on)
    return token.token


class GPTImageProvider(AIProvider):
    """GPT-Image (DALL-E successor). Works against OpenAI or Azure AI Foundry."""

    name = "gpt_image"

    def __init__(self) -> None:
        cfg = get_settings().ai_provider_config("gpt_image")  # see Settings extension below

        # Azure endpoint resolution:
        # If env var is present (even empty), honor it directly so operators can
        # explicitly disable Azure fallback via `AZURE_OPENAI_ENDPOINT=`.
        if "AZURE_OPENAI_ENDPOINT" in os.environ:
            raw_azure_endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT", "")
        else:
            raw_azure_endpoint = cfg.get("azure_endpoint", "")
        raw_azure_endpoint = raw_azure_endpoint.rstrip("/")
        self.azure_endpoint: str = self._normalize_azure_endpoint(raw_azure_endpoint)
        self.azure_deployment: str = (
            os.getenv("AZURE_OPENAI_DEPLOYMENT") or cfg.get("azure_deployment", "gpt-image-1")
        )
        self.azure_api_version: str = (
            os.getenv("AZURE_OPENAI_API_VERSION")
            or cfg.get("azure_api_version", "2025-04-01-preview")
        )

        # Auth mode
        env_use_entra = os.getenv("AZURE_OPENAI_USE_ENTRA_ID", "").lower()
        cfg_use_entra = cfg.get("use_entra_id")
        if env_use_entra in ("1", "true", "yes"):
            self.use_entra_id = True
        elif env_use_entra in ("0", "false", "no"):
            self.use_entra_id = False
        elif cfg_use_entra is not None:
            self.use_entra_id = bool(cfg_use_entra)
        else:
            self.use_entra_id = bool(self.azure_endpoint) and not os.getenv("AZURE_OPENAI_API_KEY")

        self.azure_api_key: str = os.getenv("AZURE_OPENAI_API_KEY", cfg.get("azure_api_key", ""))

        # Public OpenAI fallback
        self.openai_api_key: str = os.getenv("OPENAI_API_KEY", cfg.get("openai_api_key", ""))
        self.openai_base_url: str = os.getenv(
            "OPENAI_BASE_URL", cfg.get("openai_base_url", "https://api.openai.com/v1")
        ).rstrip("/")

        # Default model name on OpenAI public API
        self.openai_model: str = os.getenv(
            "OPENAI_IMAGE_MODEL", cfg.get("openai_model", "gpt-image-2")
        )

    # ---------- helpers ----------
    @staticmethod
    def _normalize_azure_endpoint(endpoint: str) -> str:
        """Accept resource/project endpoints with or without API suffixes.

        Users often copy endpoints ending with '/openai' or '/openai/v1'.
        Our request builder appends '/openai/deployments/...', so we must strip
        duplicated suffixes to avoid malformed URLs.
        """
        endpoint = (endpoint or "").strip().rstrip("/")
        for suffix in ("/openai/v1", "/openai"):
            if endpoint.endswith(suffix):
                endpoint = endpoint[: -len(suffix)]
                break
        return endpoint

    def _is_azure(self) -> bool:
        return bool(self.azure_endpoint)

    def _auth_headers(self) -> dict:
        if self._is_azure():
            if self.use_entra_id:
                return {"Authorization": f"Bearer {_get_entra_token()}"}
            if not self.azure_api_key:
                raise RuntimeError(
                    "Azure GPT-Image: neither Entra ID nor AZURE_OPENAI_API_KEY is configured."
                )
            return {"api-key": self.azure_api_key}
        if not self.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is not set.")
        return {"Authorization": f"Bearer {self.openai_api_key}"}

    def _url(self, action: str) -> str:
        """action ∈ {'generations', 'edits'}"""
        if self._is_azure():
            return (
                f"{self.azure_endpoint}/openai/deployments/{self.azure_deployment}"
                f"/images/{action}?api-version={self.azure_api_version}"
            )
        return f"{self.openai_base_url}/images/{action}"

    @staticmethod
    def _format_http_error(exc: httpx.HTTPStatusError) -> str:
        """Return status + concise response body for easier diagnosis."""
        resp = exc.response
        status = f"{resp.status_code} {resp.reason_phrase}"
        body = ""
        try:
            payload = resp.json()
            if isinstance(payload, dict):
                # Azure/OpenAI commonly nests useful reason in error.message
                err = payload.get("error")
                if isinstance(err, dict):
                    body = err.get("message") or str(err)
                else:
                    body = str(payload)
            else:
                body = str(payload)
        except Exception:
            body = (resp.text or "").strip()
        body = (body or "").replace("\n", " ")[:500]
        return f"{status} | {body}" if body else status

    def _size(self, width: int, height: int) -> str:
        # gpt-image-1 supports 1024x1024, 1024x1536, 1536x1024 (and "auto")
        return f"{width}x{height}"

    @staticmethod
    def _decode(resp_json: dict) -> bytes:
        item = resp_json["data"][0]
        if "b64_json" in item and item["b64_json"]:
            return base64.b64decode(item["b64_json"])
        if "url" in item and item["url"]:
            r = httpx.get(item["url"], timeout=60)
            r.raise_for_status()
            return r.content
        raise RuntimeError(f"Unexpected image response: {resp_json}")

    # ---------- public API ----------
    def text_to_image(self, prompt: str, style_hint: str = "",
                      width: int = 1024, height: int = 1024, **kwargs) -> bytes:
        full_prompt = f"{style_hint} {prompt}".strip() if style_hint else prompt
        body = {
            "prompt": full_prompt,
            "size": self._size(width, height),
            "n": 1,
        }
        if self._is_azure():
            # Azure deployment already pins the model — don't pass `model`
            body["output_format"] = "png"
        else:
            body["model"] = self.openai_model
            body["response_format"] = "b64_json"

        resp = httpx.post(self._url("generations"), headers=self._auth_headers(),
                          json=body, timeout=180)
        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise RuntimeError(f"GPT-Image text2img failed: {self._format_http_error(exc)}") from exc
        return self._decode(resp.json())

    def image_to_image(self, image_data: bytes, prompt: str = "",
                       style_hint: str = "", width: int = 1024, height: int = 1024,
                       **kwargs) -> bytes:
        full_prompt = f"{style_hint} {prompt}".strip() if style_hint else prompt
        files = {"image": ("ref.png", image_data, "image/png")}
        data = {
            "prompt": full_prompt,
            "size": self._size(width, height),
            "n": "1",
        }
        if self._is_azure():
            data["output_format"] = "png"
        else:
            data["model"] = self.openai_model
            data["response_format"] = "b64_json"

        resp = httpx.post(self._url("edits"), headers=self._auth_headers(),
                          files=files, data=data, timeout=180)
        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise RuntimeError(f"GPT-Image img2img failed: {self._format_http_error(exc)}") from exc
        return self._decode(resp.json())

