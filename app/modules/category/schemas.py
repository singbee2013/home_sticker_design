from __future__ import annotations
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime


class CategoryCreate(BaseModel):
    name: str
    code: Optional[str] = None
    description: Optional[str] = None
    parent_id: Optional[int] = None
    sort_order: int = 0


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None


class CategoryOut(BaseModel):
    id: int
    name: str
    code: Optional[str] = None
    description: Optional[str] = None
    parent_id: Optional[int] = None
    level: int = 0
    sort_order: int = 0
    created_at: Optional[datetime] = None
    children: List[CategoryOut] = []

    class Config:
        from_attributes = True

