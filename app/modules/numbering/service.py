from __future__ import annotations
from typing import List, Dict
from sqlalchemy.orm import Session

from app.modules.category.models import Category
from .models import NumberingRule, NumberingDerivative
from .schemas import NumberingRuleCreate, NumberingRuleUpdate


def resolve_rule_codes(db: Session, req: NumberingRuleCreate) -> tuple[str, int | None]:
    if req.category_id is not None:
        cat = db.query(Category).filter(Category.id == req.category_id, Category.is_deleted == False).first()
        if not cat:
            raise ValueError("产品类目不存在")
        if cat.parent_id is None:
            raise ValueError("编号请绑定到二级类目（子类目）")
        code = (cat.code or "").strip() or f"AUTO_{cat.id}"
        return code, cat.id
    cc = (req.category_code or "").strip()
    if not cc:
        raise ValueError("请提供 category_code 或 category_id")
    return cc, None


def upsert_rule_from_create(db: Session, req: NumberingRuleCreate) -> NumberingRule:
    code, cat_id = resolve_rule_codes(db, req)
    q = db.query(NumberingRule).filter(NumberingRule.is_deleted == False)
    if cat_id is not None:
        rule = q.filter(NumberingRule.category_id == cat_id).first()
    else:
        rule = q.filter(NumberingRule.category_code == code).first()
    if rule:
        rule.prefix = req.prefix
        rule.padding = req.padding
        rule.description = req.description
        rule.category_code = code
        if cat_id is not None:
            rule.category_id = cat_id
        db.commit()
        db.refresh(rule)
        return rule
    rule = NumberingRule(
        category_code=code,
        category_id=cat_id,
        prefix=req.prefix,
        padding=req.padding,
        description=req.description,
        current_seq=0,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


def get_or_create_rule(db: Session, category_code: str, prefix: str, padding: int = 3) -> NumberingRule:
    return upsert_rule_from_create(
        db,
        NumberingRuleCreate(category_code=category_code, prefix=prefix, padding=padding),
    )


def generate_next_number(db: Session, category_code: str) -> dict:
    rule = db.query(NumberingRule).filter(
        NumberingRule.category_code == category_code,
        NumberingRule.is_deleted == False,
    ).first()
    if not rule:
        raise ValueError(f"No numbering rule for '{category_code}'")
    rule.current_seq += 1
    db.commit()
    base = f"{rule.prefix}_{str(rule.current_seq).zfill(rule.padding)}"
    derivs = db.query(NumberingDerivative).all()
    return {
        "base_number": base,
        "derivatives": {d.label: f"{base}{d.suffix}" for d in derivs},
    }


def generate_next_number_by_category_id(db: Session, category_id: int) -> dict:
    rule = db.query(NumberingRule).filter(
        NumberingRule.category_id == category_id,
        NumberingRule.is_deleted == False,
    ).first()
    if not rule:
        raise ValueError(f"No numbering rule for category id {category_id}")
    rule.current_seq += 1
    db.commit()
    base = f"{rule.prefix}_{str(rule.current_seq).zfill(rule.padding)}"
    derivs = db.query(NumberingDerivative).all()
    return {
        "base_number": base,
        "derivatives": {d.label: f"{base}{d.suffix}" for d in derivs},
    }


def list_rules(db: Session) -> List[NumberingRule]:
    return db.query(NumberingRule).filter(NumberingRule.is_deleted == False).all()


def list_derivatives(db: Session) -> List[NumberingDerivative]:
    return db.query(NumberingDerivative).all()


def create_derivative(db: Session, suffix: str, label: str, description: str | None = None) -> NumberingDerivative:
    d = NumberingDerivative(suffix=suffix, label=label, description=description)
    db.add(d)
    db.commit()
    db.refresh(d)
    return d


def update_rule(db: Session, rule: NumberingRule, **kwargs) -> NumberingRule:
    for k, v in kwargs.items():
        if v is not None and hasattr(rule, k):
            setattr(rule, k, v)
    db.commit()
    db.refresh(rule)
    return rule


def update_rule_from_schema(db: Session, rule: NumberingRule, req: NumberingRuleUpdate) -> NumberingRule:
    data = req.model_dump(exclude_unset=True)
    if "category_id" in data:
        cid = data["category_id"]
        if cid is None:
            rule.category_id = None
        else:
            cat = db.query(Category).filter(Category.id == cid, Category.is_deleted == False).first()
            if not cat or cat.parent_id is None:
                raise ValueError("无效的二级类目")
            data["category_code"] = (cat.code or "").strip() or f"AUTO_{cat.id}"
            rule.category_id = cid
    for k in ("prefix", "padding", "category_code", "description"):
        if k in data and data[k] is not None:
            setattr(rule, k, data[k])
    db.commit()
    db.refresh(rule)
    return rule


def delete_rule(db: Session, rule: NumberingRule) -> None:
    rule.is_deleted = True
    db.commit()
