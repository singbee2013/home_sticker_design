from __future__ import annotations
from typing import Optional
from pydantic import BaseModel
from datetime import datetime


class StyleCreate(BaseModel):
    name: str
    name_en: Optional[str] = None
    prompt_snippet: Optional[str] = None
    sort_order: int = 0
    is_active: bool = True


class StyleUpdate(BaseModel):
    name: Optional[str] = None
    name_en: Optional[str] = None
    prompt_snippet: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class StyleOut(BaseModel):
    id: int
    name: str
    name_en: Optional[str] = None
    prompt_snippet: Optional[str] = None
    preview_image: Optional[str] = None
    sort_order: int = 0
    is_active: bool = True
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

