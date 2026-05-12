"""Batch download service — ZIP packaging."""
from __future__ import annotations
import io, zipfile
from pathlib import Path
from typing import List
from app.config import get_settings


def create_zip(file_paths: List[str]) -> io.BytesIO:
    storage_root = Path(get_settings().STORAGE_LOCAL_PATH)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in file_paths:
            full = storage_root / p
            if full.exists():
                zf.write(full, arcname=full.name)
    buf.seek(0)
    return buf

