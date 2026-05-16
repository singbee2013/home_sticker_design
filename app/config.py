"""Application configuration loader — reads config/settings.yaml + env vars."""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List

import yaml
from dotenv import load_dotenv

CONFIG_DIR = Path(__file__).resolve().parent.parent / "config"
PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Ensure local development picks up keys from project .env.
load_dotenv(PROJECT_ROOT / ".env", override=False)


def _load_yaml(path: Path) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _normalize_sqlite_url(url: str) -> str:
    """Resolve relative SQLite paths against project root (stable in Docker: /app/data/app.db)."""
    u = (url or "").strip()
    if not u.startswith("sqlite"):
        return u
    if u.startswith("sqlite:////"):
        return u
    path = u[len("sqlite:///") :]
    if path.startswith("./") or (path and path[0] not in "/"):
        resolved = (PROJECT_ROOT / path).resolve()
        return f"sqlite:///{resolved}"
    return u


class Settings:
    """Centralised, immutable-ish settings object."""

    def __init__(self) -> None:
        raw = _load_yaml(CONFIG_DIR / "settings.yaml")
        app = raw.get("app", {})
        self.APP_NAME: str = app.get("name", "AI Sticker System")
        self.VERSION: str = app.get("version", "1.0.0")
        self.DEBUG: bool = app.get("debug", False)
        self.HOST: str = app.get("host", "0.0.0.0")
        self.PORT: int = int(app.get("port", 8080))
        self.SECRET_KEY: str = os.getenv("SECRET_KEY", app.get("secret_key", "change-me"))
        self.ACCESS_TOKEN_EXPIRE_MINUTES: int = int(app.get("access_token_expire_minutes", 1440))

        db = raw.get("database", {})
        self.DATABASE_URL: str = _normalize_sqlite_url(
            os.getenv("DATABASE_URL", db.get("url", "sqlite:///./data/app.db"))
        )

        storage = raw.get("storage", {})
        self.STORAGE_TYPE: str = storage.get("type", "local")
        local_path = storage.get("local_path", "./static")
        if local_path.startswith("./") or (local_path and local_path[0] not in "/"):
            local_path = str((PROJECT_ROOT / local_path).resolve())
        self.STORAGE_LOCAL_PATH: str = local_path
        self.STORAGE_BASE_URL: str = storage.get("base_url", "/static")

        ai = raw.get("ai", {})
        yaml_ai_default = str(ai.get("default_provider", "gemini") or "gemini").strip()
        env_ai = os.getenv("AI_DEFAULT_PROVIDER")
        if env_ai is None or not str(env_ai).strip():
            self.AI_DEFAULT_PROVIDER: str = yaml_ai_default
        else:
            self.AI_DEFAULT_PROVIDER = str(env_ai).strip()
        self.AI_DEFAULT_RESOLUTION: int = int(ai.get("default_resolution", 1024))
        self._ai_providers: Dict[str, Any] = ai.get("providers", {}) or {}

        self.MODULES: List[str] = raw.get("modules", [])

    def ai_provider_config(self, name: str) -> Dict[str, Any]:
        """Per-provider config block from settings.yaml → ai.providers.<name>."""
        return dict(self._ai_providers.get(name, {}) or {})

    # ---- Lazy-loaded config files ----
    @property
    def platforms(self) -> Dict[str, Any]:
        return _load_yaml(CONFIG_DIR / "platforms.yaml").get("platforms", {})

    @property
    def ad_specs(self) -> Dict[str, Any]:
        return _load_yaml(CONFIG_DIR / "ad_specs.yaml")


@lru_cache()
def get_settings() -> Settings:
    return Settings()

