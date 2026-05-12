"""Abstract base class for all AI image providers."""
from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Optional
from pathlib import Path


class AIProvider(ABC):
    """Every AI provider must implement these two methods."""

    name: str = "base"

    @abstractmethod
    def text_to_image(self, prompt: str, style_hint: str = "",
                      width: int = 1024, height: int = 1024,
                      **kwargs) -> bytes:
        """Generate image bytes from a text prompt."""
        ...

    @abstractmethod
    def image_to_image(self, image_data: bytes, prompt: str = "",
                       style_hint: str = "",
                       width: int = 1024, height: int = 1024,
                       **kwargs) -> bytes:
        """Generate a variation from a reference image."""
        ...

