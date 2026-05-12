from __future__ import annotations
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime


class SceneCategoryCreate(BaseModel):
    name: str
    description: Optional[str] = None
    parent_id: Optional[int] = None
    sort_order: int = 0


class SceneCategoryOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    parent_id: Optional[int] = None
    level: int = 0
    sort_order: int = 0
    children: List[SceneCategoryOut] = []
    class Config:
        from_attributes = True


class SceneImageOut(BaseModel):
    id: int
    scene_category_id: int
    title: Optional[str] = None
    file_path: str
    prompt_used: Optional[str] = None
    source_kind: Optional[str] = None
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True


class SceneGenerateRequest(BaseModel):
    prompt: str
    mode: str = "lifestyle"
    provider: str | None = None

