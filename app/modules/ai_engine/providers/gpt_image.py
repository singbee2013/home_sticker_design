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

GPTsAPI gpt-image-2-plus (text-to-image proxy):
  OPENAI_API_KEY            Bearer token from gptsapi.net
  OPENAI_BASE_URL           https://api.gptsapi.net/v1  (auto-enables GPTsAPI mode)
  GPT_IMAGE_GPTSAPI_TEXT_TO_IMAGE_URL  (optional override)
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

        # GPTsAPI proxy: gpt-image-2-plus text-to-image (see user curl example)
        default_gptsapi_url = (
            "https://api.gptsapi.net/api/v3/openai/gpt-image-2-plus/text-to-image"
        )
        self.gptsapi_text_to_image_url: str = os.getenv(
            "GPT_IMAGE_GPTSAPI_TEXT_TO_IMAGE_URL",
            cfg.get("gptsapi_text_to_image_url", default_gptsapi_url),
        ).strip()
        self.gptsapi_image_to_image_url: str = os.getenv(
            "GPT_IMAGE_GPTSAPI_IMAGE_TO_IMAGE_URL",
            cfg.get("gptsapi_image_to_image_url", "").strip(),
        )
        mode = os.getenv("GPT_IMAGE_API_MODE", cfg.get("api_mode", "")).strip().lower()
        if mode in ("gptsapi", "gptsapi_v3", "gpt-image-2-plus"):
            self.use_gptsapi_v3 = True
        elif "gptsapi.net" in self.openai_base_url and self.openai_api_key:
            self.use_gptsapi_v3 = True
        else:
            self.use_gptsapi_v3 = bool(cfg.get("use_gptsapi_v3", False)) and bool(self.openai_api_key)

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
    def _aspect_ratio(width: int, height: int) -> str:
        """Map pixel size to GPTsAPI ``aspect_ratio`` (1:1, 3:2, 2:3, 16:9, 9:16)."""
        w, h = max(int(width), 1), max(int(height), 1)
        r = w / h
        if abs(r - 1.0) < 0.12:
            return "1:1"
        if r >= 1.5:
            return "16:9"
        if r >= 1.15:
            return "3:2"
        if r <= 0.67:
            return "9:16"
        if r <= 0.85:
            return "2:3"
        return "1:1"

    def _use_gptsapi(self) -> bool:
        return bool(self.use_gptsapi_v3 and self.openai_api_key and self.gptsapi_text_to_image_url)

    _GPTSAPI_PENDING = frozenset(
        {"created", "processing", "pending", "queued", "running", "in_progress", "starting"}
    )
    _GPTSAPI_DONE = frozenset(
        {"succeeded", "success", "completed", "done", "finished", "complete"}
    )
    _GPTSAPI_FAILED = frozenset({"failed", "error", "cancelled", "canceled"})

    @classmethod
    def _gptsapi_job_payload(cls, resp_json: dict) -> dict:
        data = resp_json.get("data")
        return data if isinstance(data, dict) else resp_json

    @classmethod
    def _gptsapi_job_status(cls, resp_json: dict) -> str:
        job = cls._gptsapi_job_payload(resp_json)
        status = job.get("status") or resp_json.get("status") or ""
        return str(status).lower()

    @classmethod
    def _gptsapi_poll_url(cls, resp_json: dict) -> Optional[str]:
        for node in (resp_json, cls._gptsapi_job_payload(resp_json)):
            if not isinstance(node, dict):
                continue
            urls = node.get("urls")
            if isinstance(urls, dict):
                get_url = urls.get("get")
                if isinstance(get_url, str) and get_url.strip():
                    return get_url.strip()
        return None

    @classmethod
    def _gptsapi_outputs(cls, resp_json: dict) -> list:
        job = cls._gptsapi_job_payload(resp_json)
        outputs = job.get("outputs")
        if isinstance(outputs, list) and outputs:
            return outputs
        outputs = resp_json.get("outputs")
        return outputs if isinstance(outputs, list) else []

    @classmethod
    def _gptsapi_has_image_output(cls, resp_json: dict) -> bool:
        try:
            cls._decode_gptsapi_output_item(cls._gptsapi_outputs(resp_json)[0])
            return True
        except (IndexError, RuntimeError, ValueError):
            pass
        for key in ("image", "b64_json", "base64", "output", "url"):
            val = resp_json.get(key)
            if isinstance(val, str) and val.strip():
                return True
        data = resp_json.get("data")
        if isinstance(data, list) and data:
            return True
        return False

    @classmethod
    def _gptsapi_needs_poll(cls, resp_json: dict) -> bool:
        if cls._gptsapi_has_image_output(resp_json):
            return False
        status = cls._gptsapi_job_status(resp_json)
        if status in cls._GPTSAPI_FAILED:
            raise RuntimeError(f"GPTsAPI job failed: status={status} body={str(resp_json)[:400]}")
        if status in cls._GPTSAPI_PENDING:
            return bool(cls._gptsapi_poll_url(resp_json))
        poll_url = cls._gptsapi_poll_url(resp_json)
        return bool(poll_url) and not cls._gptsapi_outputs(resp_json)

    @staticmethod
    def _decode_gptsapi_output_item(item) -> bytes:
        if isinstance(item, str) and item.strip():
            raw = item.strip()
            if raw.startswith("http://") or raw.startswith("https://"):
                r = httpx.get(raw, timeout=120)
                r.raise_for_status()
                return r.content
            if raw.startswith("data:"):
                raw = raw.split(",", 1)[-1]
            return base64.b64decode(raw)
        if not isinstance(item, dict):
            raise RuntimeError(f"Unexpected GPTsAPI output item: {item!r}")
        for key in ("url", "image", "b64_json", "base64", "output"):
            val = item.get(key)
            if isinstance(val, str) and val.strip():
                return GPTImageProvider._decode_gptsapi_output_item(val)
        raise RuntimeError(f"Unexpected GPTsAPI output item: {item!r}")

    @classmethod
    def _decode_gptsapi_v3(cls, resp_json: dict) -> bytes:
        """Decode GPTsAPI / gpt-image-2-plus JSON (sync or completed async job)."""
        if not isinstance(resp_json, dict):
            raise RuntimeError(f"Unexpected GPTsAPI response: {resp_json!r}")

        outputs = cls._gptsapi_outputs(resp_json)
        if outputs:
            return cls._decode_gptsapi_output_item(outputs[0])

        for key in ("image", "b64_json", "base64", "output"):
            val = resp_json.get(key)
            if isinstance(val, str) and val.strip():
                return cls._decode_gptsapi_output_item(val)

        data = resp_json.get("data")
        if isinstance(data, list) and data:
            item = data[0]
            if isinstance(item, dict):
                if item.get("b64_json"):
                    return base64.b64decode(item["b64_json"])
                if item.get("url"):
                    return cls._decode_gptsapi_output_item(item["url"])
                if item.get("image"):
                    return cls._decode_gptsapi_output_item(item["image"])

        output = resp_json.get("output")
        if isinstance(output, dict):
            for key in ("image", "b64_json", "url"):
                if output.get(key):
                    return cls._decode_gptsapi_output_item(output[key])

        raise RuntimeError(f"Unexpected GPTsAPI image response: {str(resp_json)[:500]}")

    def _poll_gptsapi_v3(self, get_url: str, headers: dict) -> dict:
        max_wait = int(os.getenv("GPT_IMAGE_GPTSAPI_POLL_MAX_SEC", "180"))
        interval = float(os.getenv("GPT_IMAGE_GPTSAPI_POLL_INTERVAL", "2"))
        deadline = time.time() + max_wait
        last: dict = {}
        while time.time() < deadline:
            resp = httpx.get(get_url, headers=headers, timeout=60)
            try:
                resp.raise_for_status()
            except httpx.HTTPStatusError as exc:
                raise RuntimeError(
                    f"GPTsAPI poll failed: {self._format_http_error(exc)}"
                ) from exc
            last = resp.json()
            status = self._gptsapi_job_status(last)
            if status in self._GPTSAPI_FAILED:
                raise RuntimeError(f"GPTsAPI job failed: status={status} body={str(last)[:400]}")
            if status in self._GPTSAPI_DONE or self._gptsapi_has_image_output(last):
                return last
            time.sleep(interval)
        raise RuntimeError(
            f"GPTsAPI job timed out after {max_wait}s (last status={self._gptsapi_job_status(last)}): "
            f"{str(last)[:400]}"
        )

    def _resolve_gptsapi_v3(self, resp_json: dict, headers: dict) -> bytes:
        if self._gptsapi_needs_poll(resp_json):
            get_url = self._gptsapi_poll_url(resp_json)
            if not get_url:
                raise RuntimeError(f"GPTsAPI async job missing poll URL: {str(resp_json)[:400]}")
            resp_json = self._poll_gptsapi_v3(get_url, headers)
        return self._decode_gptsapi_v3(resp_json)

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

        if self._use_gptsapi():
            body = {
                "prompt": full_prompt,
                "aspect_ratio": kwargs.get("aspect_ratio") or self._aspect_ratio(width, height),
                "output_format": kwargs.get("output_format") or "png",
            }
            headers = {
                "Authorization": f"Bearer {self.openai_api_key}",
                "Content-Type": "application/json",
            }
            resp = httpx.post(
                self.gptsapi_text_to_image_url,
                headers=headers,
                json=body,
                timeout=180,
            )
            try:
                resp.raise_for_status()
            except httpx.HTTPStatusError as exc:
                raise RuntimeError(
                    f"GPT-Image-2-Plus (GPTsAPI) text2img failed: {self._format_http_error(exc)}"
                ) from exc
            return self._resolve_gptsapi_v3(resp.json(), headers)

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

        if self._use_gptsapi():
            img_url = self.gptsapi_image_to_image_url or self.gptsapi_text_to_image_url.replace(
                "text-to-image", "image-to-image"
            )
            body = {
                "prompt": full_prompt,
                "aspect_ratio": kwargs.get("aspect_ratio") or self._aspect_ratio(width, height),
                "output_format": kwargs.get("output_format") or "png",
            }
            headers = {"Authorization": f"Bearer {self.openai_api_key}"}
            # Try multipart if proxy supports reference image; else JSON-only.
            files = {"image": ("ref.png", image_data, "image/png")}
            data = {k: str(v) for k, v in body.items()}
            resp = httpx.post(img_url, headers=headers, files=files, data=data, timeout=180)
            if resp.status_code >= 400:
                resp = httpx.post(
                    img_url,
                    headers={**headers, "Content-Type": "application/json"},
                    json=body,
                    timeout=180,
                )
            try:
                resp.raise_for_status()
            except httpx.HTTPStatusError as exc:
                raise RuntimeError(
                    f"GPT-Image-2-Plus (GPTsAPI) img2img failed: {self._format_http_error(exc)}"
                ) from exc
            poll_headers = {"Authorization": f"Bearer {self.openai_api_key}"}
            return self._resolve_gptsapi_v3(resp.json(), poll_headers)

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

