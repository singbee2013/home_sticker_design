"""File storage abstraction — local or S3-compatible."""
from __future__ import annotations

import os
import shutil
import uuid
from pathlib import Path
from typing import BinaryIO

from app.config import get_settings


class StorageBackend:
    def save(self, file: BinaryIO, folder: str, filename: str | None = None) -> str:
        raise NotImplementedError

    def get_url(self, path: str) -> str:
        raise NotImplementedError

    def read_bytes(self, path: str) -> bytes:
        raise NotImplementedError

    def delete(self, path: str) -> None:
        raise NotImplementedError


class LocalStorage(StorageBackend):
    def __init__(self) -> None:
        s = get_settings()
        self.root = Path(s.STORAGE_LOCAL_PATH)
        self.base_url = s.STORAGE_BASE_URL

    def save(self, file: BinaryIO, folder: str, filename: str | None = None) -> str:
        if filename is None:
            filename = f"{uuid.uuid4().hex}.png"
        dest_dir = self.root / folder
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / filename
        with open(dest, "wb") as f:
            shutil.copyfileobj(file, f)
        return f"{folder}/{filename}"

    def get_url(self, path: str) -> str:
        return f"{self.base_url}/{path}"

    def read_bytes(self, path: str) -> bytes:
        full = self.root / path
        if not full.is_file():
            raise FileNotFoundError(path)
        return full.read_bytes()

    def delete(self, path: str) -> None:
        full = self.root / path
        if full.exists():
            full.unlink()


def get_storage() -> StorageBackend:
    s = get_settings()
    if s.STORAGE_TYPE == "local":
        return LocalStorage()
    # Future: return S3Storage()
    return LocalStorage()

