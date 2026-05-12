from __future__ import annotations
import io
import uuid
from typing import List

from sqlalchemy.orm import Session

from app.common.storage import get_storage
from .models import SceneCategory, SceneImage

SCENE_PROMPT_PRESETS: list[str] = [
    "北欧风客厅沙发背景墙，午后自然光，木地板，留白适合墙贴展示",
    "现代轻奢卧室床头墙面，柔和台灯，织物纹理真实",
    "美式复古客厅壁炉旁墙面，暖色调，节日氛围低调",
    "日式榻榻米房间一角，障子窗透光，极简留白",
    "儿童房书桌墙面，明亮柔和色彩，安全温馨",
    "开放式厨房瓷砖墙面特写，干净高光与阴影",
    "飘窗阳光角落，纱帘透光，适合窗户贴膜示意",
    "摩洛哥纹样抱枕旁的石膏墙面，民族风陈列桌角",
    "跨境电商常用：极简白墙工作室拍摄角落",
    "数码配件纯白净棚顶柔光，真实阴影商品摄影白底图",
    "美国中产家庭客厅电视墙，中性色系真实软装",
    "欧洲公寓小户型玄关走廊墙面纵深感",
    "东南亚热带绿植阳台一角，自然光影",
    "中东现代公寓大理石玄关墙面冷色调",
    "拉美明亮客厅瓷砖地面与墙角衔接真实透视",
]


def create_scene_category(db: Session, name: str, parent_id: int | None = None,
                          description: str | None = None, sort_order: int = 0) -> SceneCategory:
    level = 0
    path = ""
    if parent_id:
        p = db.query(SceneCategory).get(parent_id)
        if p:
            level = p.level + 1
            path = f"{p.path}/{p.id}" if p.path else f"/{p.id}"
    sc = SceneCategory(name=name, description=description, parent_id=parent_id,
                       level=level, path=path, sort_order=sort_order)
    db.add(sc)
    db.commit()
    db.refresh(sc)
    sc.path = f"{path}/{sc.id}" if path else f"/{sc.id}"
    db.commit()
    return sc


def build_scene_tree(db: Session) -> List[dict]:
    cats = db.query(SceneCategory).filter(SceneCategory.is_deleted == False).order_by(SceneCategory.sort_order).all()
    lookup = {c.id: {"id": c.id, "name": c.name, "parent_id": c.parent_id, "level": c.level, "children": []} for c in cats}
    roots = []
    for c in cats:
        node = lookup[c.id]
        if c.parent_id and c.parent_id in lookup:
            lookup[c.parent_id]["children"].append(node)
        else:
            roots.append(node)
    return roots


def list_scene_images(db: Session, category_id: int) -> List[SceneImage]:
    return (
        db.query(SceneImage)
        .filter(SceneImage.scene_category_id == category_id, SceneImage.is_deleted == False)
        .order_by(SceneImage.id.desc())
        .all()
    )


def create_scene_image(
    db: Session,
    category_id: int,
    file_path: str,
    title: str | None = None,
    created_by: str | None = None,
    prompt_used: str | None = None,
    source_kind: str = "upload",
) -> SceneImage:
    img = SceneImage(
        scene_category_id=category_id,
        file_path=file_path,
        title=title,
        created_by=created_by,
        prompt_used=prompt_used,
        source_kind=source_kind,
    )
    db.add(img)
    db.commit()
    db.refresh(img)
    return img


def get_scene_image(db: Session, image_id: int) -> SceneImage | None:
    return db.query(SceneImage).filter(SceneImage.id == image_id, SceneImage.is_deleted == False).first()


def delete_scene_image(db: Session, image_id: int) -> bool:
    img = get_scene_image(db, image_id)
    if not img:
        return False
    storage = get_storage()
    try:
        storage.delete(img.file_path)
    except Exception:
        pass
    img.is_deleted = True
    db.commit()
    return True


def generate_scene_with_ai(
    db: Session,
    category_id: int,
    prompt: str,
    mode: str,
    created_by: str | None,
    provider_name: str | None = None,
) -> SceneImage:
    cat = db.query(SceneCategory).filter(SceneCategory.id == category_id, SceneCategory.is_deleted == False).first()
    if not cat:
        raise ValueError("Scene category not found")

    from app.modules.ai_engine import service as ai_service

    provider = ai_service.get_provider(provider_name)
    if not hasattr(provider, "generate_scene_photoreal"):
        raise ValueError(f"Provider '{provider.name}' does not support scene generation")
    img_bytes = provider.generate_scene_photoreal(prompt.strip(), mode=mode)
    storage = get_storage()
    fname = f"ai_{uuid.uuid4().hex}.png"
    path = storage.save(io.BytesIO(img_bytes), f"scenes/{category_id}", fname)
    full_prompt = prompt.strip()
    return create_scene_image(
        db,
        category_id,
        path,
        title=full_prompt[:240] if full_prompt else None,
        created_by=created_by,
        prompt_used=full_prompt,
        source_kind="ai",
    )


def prompt_preset_options() -> list[str]:
    return list(SCENE_PROMPT_PRESETS)


def list_recent_scene_images(db: Session, limit: int = 200) -> list[dict]:
    rows = (
        db.query(SceneImage)
        .filter(SceneImage.is_deleted == False)
        .order_by(SceneImage.id.desc())
        .limit(min(limit, 500))
        .all()
    )
    cats = {
        c.id: c.name
        for c in db.query(SceneCategory).filter(SceneCategory.is_deleted == False).all()
    }
    out: list[dict] = []
    for r in rows:
        out.append(
            {
                "id": r.id,
                "scene_category_id": r.scene_category_id,
                "category_name": cats.get(r.scene_category_id),
                "file_path": r.file_path,
                "prompt_used": r.prompt_used,
                "source_kind": r.source_kind,
                "title": r.title,
            }
        )
    return out


def ensure_default_scene_categories(db: Session) -> None:
    exists = db.query(SceneCategory).filter(SceneCategory.is_deleted == False).first()
    if exists:
        return
    defaults = ["客厅场景", "卧室场景", "厨房场景", "儿童房场景"]
    for idx, name in enumerate(defaults):
        create_scene_category(db, name=name, sort_order=idx)

