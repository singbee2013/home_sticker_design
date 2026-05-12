from __future__ import annotations
from typing import Optional, List
from pydantic import BaseModel, model_validator


class NumberingRuleCreate(BaseModel):
    category_code: Optional[str] = None
    category_id: Optional[int] = None
    prefix: str
    padding: int = 3
    description: Optional[str] = None

    @model_validator(mode="after")
    def need_target(self):
        if not self.category_code and self.category_id is None:
            raise ValueError("Provide category_code or category_id")
        return self


class NumberingRuleUpdate(BaseModel):
    prefix: Optional[str] = None
    padding: Optional[int] = None
    category_code: Optional[str] = None
    category_id: Optional[int] = None
    description: Optional[str] = None


class NumberingRuleOut(BaseModel):
    id: int
    category_code: str
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    prefix: str
    current_seq: int
    padding: int
    description: Optional[str] = None

    class Config:
        from_attributes = True


class DerivativeCreate(BaseModel):
    suffix: str
    label: str
    description: Optional[str] = None


class DerivativeOut(BaseModel):
    id: int
    suffix: str
    label: str

    class Config:
        from_attributes = True


class GeneratedNumber(BaseModel):
    base_number: str
    derivatives: dict[str, str]
