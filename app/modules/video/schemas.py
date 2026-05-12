from __future__ import annotations
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime


class VideoCreate(BaseModel):
    title: Optional[str] = None
    image_paths: List[str] = []
    duration: int = 10
    width: int = 1080
    height: int = 1920


class VideoOut(BaseModel):
    id: int
    title: Optional[str] = None
    duration: int
    status: str
    result_path: Optional[str] = None
    error_message: Optional[str] = None
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

