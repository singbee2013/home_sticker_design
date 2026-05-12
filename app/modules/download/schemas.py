from __future__ import annotations
from typing import Optional, List
from pydantic import BaseModel


class BatchDownloadRequest(BaseModel):
    file_paths: List[str] = []
    category_id: Optional[int] = None
    style_id: Optional[int] = None
    created_by: Optional[str] = None
    material_number: Optional[str] = None

