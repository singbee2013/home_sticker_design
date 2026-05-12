"""Plugin registry — auto-discover and register modules."""
from __future__ import annotations

import importlib
import logging
from typing import List

from fastapi import FastAPI

from app.config import get_settings

logger = logging.getLogger(__name__)


def register_all_modules(app: FastAPI) -> None:
    """Import each enabled module's ``register_routes(app)`` function."""
    settings = get_settings()
    for module_name in settings.MODULES:
        try:
            mod = importlib.import_module(f"app.modules.{module_name}")
            if hasattr(mod, "register_routes"):
                mod.register_routes(app)
        except Exception as exc:
            logger.exception(
                "Failed to load module '%s' — routes from this module will be missing",
                module_name,
            )

