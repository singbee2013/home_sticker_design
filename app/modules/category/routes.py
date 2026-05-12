from __future__ import annotations
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.deps import get_db
from app.modules.auth.deps import get_current_user
from app.modules.auth.models import User
from .schemas import CategoryCreate, CategoryUpdate, CategoryOut
from . import service

router = APIRouter()


@router.get("/tree")
def get_tree(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    service.ensure_default_categories(db)
    return service.build_tree(db)


@router.get("/", response_model=List[CategoryOut])
def list_cats(parent_id: int | None = None, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return service.list_categories(db, parent_id)


@router.post("/", response_model=CategoryOut)
def create(req: CategoryCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.create_category(db, name=req.name, code=req.code, description=req.description,
                                   parent_id=req.parent_id, sort_order=req.sort_order, created_by=user.username)


@router.put("/{cat_id}", response_model=CategoryOut)
def update(cat_id: int, req: CategoryUpdate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    cat = service.get_category(db, cat_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Not found")
    return service.update_category(db, cat, **req.model_dump(exclude_unset=True))


@router.delete("/{cat_id}")
def delete(cat_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    cat = service.get_category(db, cat_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Not found")
    service.delete_category(db, cat)
    return {"ok": True}

