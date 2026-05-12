from __future__ import annotations
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime


class SuiteImageOut(BaseModel):
    id: int
    image_type: str
    file_path: str
    width: Optional[int] = None
    height: Optional[int] = None
    sort_order: int = 0
    class Config:
        from_attributes = True


class SuiteCreate(BaseModel):
    platform_code: str
    source_image_id: Optional[int] = None
    material_number: Optional[str] = None
    title: Optional[str] = None


class SuiteOut(BaseModel):
    id: int
    platform_code: str
    material_number: Optional[str] = None
    title: Optional[str] = None
    product_description: Optional[str] = None
    dimensions_spec: Optional[str] = None
    error_message: Optional[str] = None
    status: str
    images: List[SuiteImageOut] = []
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

