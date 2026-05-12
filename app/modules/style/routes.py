from __future__ import annotations
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.deps import get_db
from app.modules.auth.deps import get_current_user
from app.modules.auth.models import User
from .schemas import StyleCreate, StyleUpdate, StyleOut
from . import service

router = APIRouter()


@router.get("/", response_model=List[StyleOut])
def list_styles(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return service.list_styles(db, active_only=not include_inactive)


@router.post("/", response_model=StyleOut)
def create(req: StyleCreate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return service.create_style(db, **req.model_dump())


@router.post("/ensure-presets")
def ensure_presets(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """Merge canonical style rows + one-time legacy bootstrap retirement (idempotent)."""
    service.ensure_default_styles(db)
    return {"ok": True}


@router.put("/{style_id}", response_model=StyleOut)
def update(style_id: int, req: StyleUpdate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    s = service.get_style(db, style_id)
    if not s:
        raise HTTPException(status_code=404, detail="Not found")
    return service.update_style(db, s, **req.model_dump(exclude_unset=True))


@router.delete("/{style_id}")
def delete(style_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    s = service.get_style(db, style_id)
    if not s:
        raise HTTPException(status_code=404, detail="Not found")
    service.delete_style(db, s)
    return {"ok": True}

