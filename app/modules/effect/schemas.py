from __future__ import annotations
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime


class EffectCategoryCreate(BaseModel):
    name: str
    description: Optional[str] = None
    parent_id: Optional[int] = None
    sort_order: int = 0


class EffectCategoryOut(BaseModel):
    id: int
    name: str
    parent_id: Optional[int] = None
    level: int = 0
    children: List[EffectCategoryOut] = []
    class Config:
        from_attributes = True


class EffectImageOut(BaseModel):
    id: int
    effect_category_id: int
    source_image_id: Optional[int] = None
    title: Optional[str] = None
    prompt_used: Optional[str] = None
    file_path: str
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

