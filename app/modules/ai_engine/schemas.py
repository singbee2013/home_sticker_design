from __future__ import annotations
from typing import Optional
from pydantic import BaseModel
from datetime import datetime


class Text2ImgRequest(BaseModel):
    prompt: str
    style_id: Optional[int] = None
    category_id: Optional[int] = None
    provider: Optional[str] = None
    width: int = 1024
    height: int = 1024


class Img2ImgRequest(BaseModel):
    prompt: Optional[str] = ""
    style_id: Optional[int] = None
    category_id: Optional[int] = None
    provider: Optional[str] = None
    width: int = 1024
    height: int = 1024


class TaskOut(BaseModel):
    id: int
    task_type: str
    provider: str
    prompt: Optional[str] = None
    status: str
    result_path: Optional[str] = None
    material_number: Optional[str] = None
    error_message: Optional[str] = None
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None
    style_name: Optional[str] = None
    category_name: Optional[str] = None

    class Config:
        from_attributes = True

