from __future__ import annotations
from typing import List, Optional
from sqlalchemy.orm import Session
from .models import Category


def create_category(db: Session, name: str, code: str | None = None,
                    description: str | None = None, parent_id: int | None = None,
                    sort_order: int = 0, created_by: str | None = None) -> Category:
    level = 0
    path = ""
    if parent_id:
        parent = db.query(Category).get(parent_id)
        if parent:
            level = parent.level + 1
            path = f"{parent.path}/{parent.id}" if parent.path else f"/{parent.id}"
    cat = Category(name=name, code=code, description=description,
                   parent_id=parent_id, level=level, path=path,
                   sort_order=sort_order, created_by=created_by)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    # update path to include self
    cat.path = f"{path}/{cat.id}" if path else f"/{cat.id}"
    db.commit()
    return cat


def get_category(db: Session, cat_id: int) -> Category | None:
    return db.query(Category).filter(Category.id == cat_id, Category.is_deleted == False).first()


def list_categories(db: Session, parent_id: int | None = None) -> List[Category]:
    q = db.query(Category).filter(Category.is_deleted == False)
    if parent_id is not None:
        q = q.filter(Category.parent_id == parent_id)
    else:
        q = q.filter(Category.parent_id == None)
    return q.order_by(Category.sort_order).all()


def build_tree(db: Session) -> List[dict]:
    all_cats = db.query(Category).filter(Category.is_deleted == False).order_by(Category.sort_order).all()
    lookup = {c.id: {**{k: getattr(c, k) for k in ["id", "name", "code", "description", "parent_id", "level", "sort_order", "created_at"]}, "children": []} for c in all_cats}
    roots = []
    for c in all_cats:
        node = lookup[c.id]
        if c.parent_id and c.parent_id in lookup:
            lookup[c.parent_id]["children"].append(node)
        else:
            roots.append(node)
    return roots


def update_category(db: Session, cat: Category, **kwargs) -> Category:
    for k, v in kwargs.items():
        if v is not None and hasattr(cat, k):
            setattr(cat, k, v)
    db.commit()
    db.refresh(cat)
    return cat


def delete_category(db: Session, cat: Category) -> None:
    cat.is_deleted = True
    db.commit()


def ensure_default_categories(db: Session) -> None:
    """Bootstrap minimal category tree for first-time deployments."""
    exists = db.query(Category).filter(Category.is_deleted == False).first()
    if not exists:
        roots = [
            ("家居装饰类贴纸", "GZ", "家居装饰相关"),
            ("3C 数码类贴纸", "3C", "3C产品相关"),
            ("交通工具类贴纸", "JT", "交通工具相关"),
            ("沐浴清洁类产品", "MY", "沐浴清洁相关"),
        ]
        for idx, (name, code, desc) in enumerate(roots):
            create_category(
                db,
                name=name,
                code=code,
                description=desc,
                parent_id=None,
                sort_order=idx,
                created_by="system",
            )
    ensure_default_secondary_categories(db)


def ensure_default_secondary_categories(db: Session) -> None:
    """Ensure each root category has visible secondary categories."""
    roots = (
        db.query(Category)
        .filter(Category.is_deleted == False, Category.parent_id == None)
        .order_by(Category.sort_order.asc(), Category.id.asc())
        .all()
    )
    defaults = {
        "GZ": ["客厅背景墙", "卧室背景墙", "儿童房墙面", "厨房防油贴"],
        "3C": ["手机壳装饰", "笔记本外壳", "平板贴膜", "游戏设备外观"],
        "JT": ["汽车内饰", "摩托车外观", "自行车场景", "电动车车贴"],
        "MY": ["浴室墙面", "洗漱台场景", "淋浴产品展示", "防滑地贴"],
    }
    for root in roots:
        has_child = (
            db.query(Category)
            .filter(
                Category.is_deleted == False,
                Category.parent_id == root.id,
            )
            .first()
        )
        if has_child:
            continue
        code = (root.code or f"AUTO_{root.id}").upper()
        names = defaults.get(code, [f"{root.name}子类A", f"{root.name}子类B"])
        for idx, nm in enumerate(names):
            child_code = f"{code}_S{idx+1:02d}"
            create_category(
                db,
                name=nm,
                code=child_code,
                description=f"{root.name} · {nm}",
                parent_id=root.id,
                sort_order=idx,
                created_by="system",
            )

