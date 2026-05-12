"""Auth module — user & permission system."""
from __future__ import annotations

from fastapi import FastAPI
from .routes import router
from app.database import SessionLocal
from .service import ensure_superadmin


def register_routes(app: FastAPI) -> None:
    db = SessionLocal()
    try:
        ensure_superadmin(db)
    finally:
        db.close()
    app.include_router(router, prefix="/api/auth", tags=["auth"])

