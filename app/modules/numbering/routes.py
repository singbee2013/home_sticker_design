from __future__ import annotations
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.deps import get_db
from app.modules.auth.deps import get_current_user
from app.modules.auth.models import User
from app.modules.category.models import Category

from .schemas import (
    NumberingRuleCreate,
    NumberingRuleUpdate,
    NumberingRuleOut,
    DerivativeCreate,
    DerivativeOut,
    GeneratedNumber,
)
from . import service

router = APIRouter()


@router.get("/rules", response_model=List[NumberingRuleOut])
def list_rules(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    rules = service.list_rules(db)
    ids = [r.category_id for r in rules if r.category_id]
    names: dict[int, str] = {}
    if ids:
        for c in db.query(Category).filter(Category.id.in_(ids)):
            names[c.id] = c.name
    out: list[NumberingRuleOut] = []
    for r in rules:
        out.append(
            NumberingRuleOut.model_validate(r).model_copy(update={"category_name": names.get(r.category_id)})
        )
    return out


@router.post("/rules", response_model=NumberingRuleOut)
def create_rule(req: NumberingRuleCreate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    try:
        rule = service.upsert_rule_from_create(db, req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return NumberingRuleOut.model_validate(rule)


@router.put("/rules/{rule_id}", response_model=NumberingRuleOut)
def update_rule(rule_id: int, req: NumberingRuleUpdate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    rule = db.query(service.NumberingRule).filter(service.NumberingRule.id == rule_id).first()
    if not rule or rule.is_deleted:
        raise HTTPException(status_code=404, detail="Not found")
    try:
        rule = service.update_rule_from_schema(db, rule, req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return NumberingRuleOut.model_validate(rule)


@router.delete("/rules/{rule_id}")
def delete_rule(rule_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    rule = db.query(service.NumberingRule).filter(service.NumberingRule.id == rule_id).first()
    if not rule or rule.is_deleted:
        raise HTTPException(status_code=404, detail="Not found")
    service.delete_rule(db, rule)
    return {"ok": True}


@router.post("/generate/{category_code}", response_model=GeneratedNumber)
def generate(category_code: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    try:
        data = service.generate_next_number(db, category_code)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return GeneratedNumber(**data)


@router.post("/generate/by-category/{category_id}", response_model=GeneratedNumber)
def generate_by_category(category_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    try:
        data = service.generate_next_number_by_category_id(db, category_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return GeneratedNumber(**data)


@router.get("/derivatives", response_model=List[DerivativeOut])
def list_derivs(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return service.list_derivatives(db)


@router.post("/derivatives", response_model=DerivativeOut)
def create_deriv(req: DerivativeCreate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return service.create_derivative(db, req.suffix, req.label, req.description)
