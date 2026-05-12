"""Auth schemas."""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    username: str
    password: str


class UserCreate(BaseModel):
    username: str
    password: str
    email: str
    phone: str


class UserOut(BaseModel):
    id: int
    username: str
    email: Optional[str] = None
    phone: Optional[str] = None
    is_active: bool
    is_superadmin: bool
    language: str
    permissions: List[str] = []
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    email: Optional[str] = None
    phone: Optional[str] = None
    language: Optional[str] = None
    is_active: Optional[bool] = None


class RoleCreate(BaseModel):
    name: str
    description: Optional[str] = None
    permissions: Optional[str] = None


class RoleOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    permissions: Optional[str] = None

    class Config:
        from_attributes = True


class UserPermissionUpdate(BaseModel):
    permissions: List[str] = []


class AuditLogOut(BaseModel):
    id: int
    user_id: Optional[int] = None
    username: Optional[str] = None
    action: str
    module: str
    target: Optional[str] = None
    detail: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

