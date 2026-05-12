"""Reusable SQLAlchemy mixins."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String, func


class IDMixin:
    id = Column(Integer, primary_key=True, autoincrement=True)


class TimestampMixin:
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)


class SoftDeleteMixin:
    is_deleted = Column(Boolean, default=False, nullable=False)


class CreatorMixin:
    created_by = Column(String(100), nullable=True)

