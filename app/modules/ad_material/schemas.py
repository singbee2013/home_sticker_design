from __future__ import annotations
from typing import Optional
from pydantic import BaseModel
from datetime import datetime


class AdMaterialCreate(BaseModel):
    channel_code: str
    size_name: Optional[str] = None
    material_number: Optional[str] = None


class AdMaterialOut(BaseModel):
    id: int
    channel_code: str
    size_name: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    material_number: Optional[str] = None
    file_path: Optional[str] = None
    status: str
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

