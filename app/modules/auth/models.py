"""Auth models."""
from __future__ import annotations

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Table, Text
from sqlalchemy.orm import relationship

from app.database import Base
from app.common.base_model import IDMixin, TimestampMixin, SoftDeleteMixin

# Many-to-many: user <-> role
user_roles = Table(
    "user_roles",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id")),
    Column("role_id", Integer, ForeignKey("roles.id")),
)


class User(IDMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "users"

    username = Column(String(100), unique=True, nullable=False, index=True)
    email = Column(String(200), unique=True, nullable=True)
    phone = Column(String(50), unique=True, nullable=True)
    hashed_password = Column(String(200), nullable=False)
    is_active = Column(Boolean, default=False, comment="Needs admin approval")
    is_superadmin = Column(Boolean, default=False)
    language = Column(String(10), default="zh")

    roles = relationship("Role", secondary=user_roles, back_populates="users")


class Role(IDMixin, TimestampMixin, Base):
    __tablename__ = "roles"

    name = Column(String(100), unique=True, nullable=False)
    description = Column(String(500), nullable=True)
    permissions = Column(String(2000), nullable=True, comment="Comma-separated permission codes")

    users = relationship("User", secondary=user_roles, back_populates="roles")


class AuditLog(IDMixin, TimestampMixin, Base):
    __tablename__ = "audit_logs"

    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    username = Column(String(100), nullable=True, index=True)
    action = Column(String(80), nullable=False, index=True)
    module = Column(String(80), nullable=False, index=True)
    target = Column(String(200), nullable=True)
    detail = Column(Text, nullable=True)

