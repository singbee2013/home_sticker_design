from __future__ import annotations
import io
import uuid
from typing import List

from PIL import Image
from sqlalchemy.orm import Session

from app.common.precise_attach import (
    build_precise_attach_hint,
    prepare_material_with_repeat_target,
    prepare_material_for_precise_attach,
)
from app.common.storage import get_storage, static_file_exists
from app.modules.scene.models import SceneImage
from .models import EffectCategory, EffectImage


def _provider_retry_chain(provider_name: str | None, available: list[str]) -> list[str]:
    order: list[str] = []
    for n in [provider_name, "gemini", "wanxiang", "siliconflow"]:
        if n and n in available and n not in order:
            order.append(n)
    return order


def create_effect_category(db: Session, name: str, parent_id: int | None = None,
                           description: str | None = None, sort_order: int = 0) -> EffectCategory:
    level = 0
    path = ""
    if parent_id:
        p = db.query(EffectCategory).get(parent_id)
        if p:
            level = p.level + 1
            path = f"{p.path}/{p.id}" if p.path else f"/{p.id}"
    ec = EffectCategory(name=name, description=description, parent_id=parent_id,
                        level=level, path=path, sort_order=sort_order)
    db.add(ec)
    db.commit()
    db.refresh(ec)
    ec.path = f"{path}/{ec.id}" if path else f"/{ec.id}"
    db.commit()
    return ec


def build_effect_tree(db: Session) -> List[dict]:
    cats = db.query(EffectCategory).filter(EffectCategory.is_deleted == False).order_by(EffectCategory.sort_order).all()
    lookup = {c.id: {"id": c.id, "name": c.name, "parent_id": c.parent_id, "level": c.level, "children": []} for c in cats}
    roots = []
    for c in cats:
        node = lookup[c.id]
        if c.parent_id and c.parent_id in lookup:
            lookup[c.parent_id]["children"].append(node)
        else:
            roots.append(node)
    return roots


def list_effect_images(db: Session, category_id: int) -> List[EffectImage]:
    return (
        db.query(EffectImage)
        .filter(EffectImage.effect_category_id == category_id, EffectImage.is_deleted == False)
        .order_by(EffectImage.id.desc())
        .all()
    )


def create_effect_image(db: Session, category_id: int, file_path: str,
                        title: str | None = None, source_image_id: int | None = None,
                        created_by: str | None = None,
                        prompt_used: str | None = None) -> EffectImage:
    img = EffectImage(effect_category_id=category_id, file_path=file_path,
                      title=title, source_image_id=source_image_id, created_by=created_by,
                      prompt_used=prompt_used)
    db.add(img)
    db.commit()
    db.refresh(img)
    return img


def get_effect_image(db: Session, image_id: int) -> EffectImage | None:
    return db.query(EffectImage).filter(EffectImage.id == image_id, EffectImage.is_deleted == False).first()


def delete_effect_image(db: Session, image_id: int) -> bool:
    img = get_effect_image(db, image_id)
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


def composite_material_with_scenes(
    db: Session,
    effect_category_id: int,
    material_bytes: bytes,
    scene_ids: list[int],
    placement_hint: str,
    created_by: str | None,
    provider_name: str | None = None,
    product_size_note: str = "",
    coverage_percent: int = 35,
    fill_target_surface: bool = True,
    pattern_scale_percent: int = 100,
    keep_pattern_scale: bool = True,
    product_width_cm: float | None = None,
    product_height_cm: float | None = None,
    tile_width_cm: float | None = None,
    tile_height_cm: float | None = None,
    target_surface_width_cm: float | None = None,
    target_surface_height_cm: float | None = None,
    target_surface_type: str = "wall",
) -> List[EffectImage]:
    cat = db.query(EffectCategory).filter(
        EffectCategory.id == effect_category_id,
        EffectCategory.is_deleted == False,
    ).first()
    if not cat:
        raise ValueError("Effect category not found")

    seen: set[int] = set()
    ordered: list[int] = []
    for sid in scene_ids:
        if sid not in seen:
            seen.add(sid)
            ordered.append(sid)
        if len(ordered) >= 10:
            break

    from app.modules.ai_engine import service as ai_service
    from app.common.roll_product_spec import ROLL_CORE_AI_PROMPT_EN, ROLL_CORE_PATTERN_DIRECTION_EN

    avail = ai_service.list_providers()
    provider_chain = _provider_retry_chain(provider_name, avail)
    if not provider_chain:
        raise ValueError("No available provider for scene compositing")
    storage = get_storage()
    results: list[EffectImage] = []
    hint = placement_hint.strip() or "auto"
    size_note = (product_size_note or "").strip()
    coverage = max(10, min(coverage_percent or 35, 100))
    safe_pattern_scale = max(25, min(pattern_scale_percent or 100, 100))
    material_for_composite = prepare_material_for_precise_attach(
        material_bytes,
        pattern_scale_percent=safe_pattern_scale,
        keep_pattern_scale=keep_pattern_scale,
    )
    # If user provides real motif size, convert to expected repeat counts.
    # Default wall estimate 250x250cm when target area size is not given.
    est_surface_w = float(target_surface_width_cm or 250)
    est_surface_h = float(target_surface_height_cm or 250)
    motif_w = float(tile_width_cm or product_width_cm or 0)
    motif_h = float(tile_height_cm or product_height_cm or 0)
    repeats_x = est_surface_w / motif_w if motif_w > 0 else None
    repeats_y = est_surface_h / motif_h if motif_h > 0 else None
    material_for_composite = prepare_material_with_repeat_target(
        material_for_composite,
        repeats_x=repeats_x,
        repeats_y=repeats_y,
        keep_pattern_scale=keep_pattern_scale,
    )
    precise_hint = build_precise_attach_hint(
        keep_pattern_scale=keep_pattern_scale,
        pattern_scale_percent=safe_pattern_scale,
        product_width_cm=product_width_cm,
        product_height_cm=product_height_cm,
        tile_width_cm=tile_width_cm,
        tile_height_cm=tile_height_cm,
        target_surface_width_cm=target_surface_width_cm,
        target_surface_height_cm=target_surface_height_cm,
        target_surface_type=target_surface_type,
    )

    for sid in ordered:
        scene_row = db.query(SceneImage).filter(
            SceneImage.id == sid,
            SceneImage.is_deleted == False,
        ).first()
        if not scene_row:
            continue
        scene_bytes = storage.read_bytes(scene_row.file_path)
        if fill_target_surface:
            composed_hint = (
                f"{hint}. Target-surface coverage constraints: identify one dominant large target surface, "
                "prefer the largest visible plane that matches requested surface type, "
                "and cover that entire selected surface edge-to-edge with repeated seamless pattern tiles. "
                "Pattern should touch all four boundaries of that surface (allowing occlusion by furniture). "
                "Do NOT render a single patch, sticker, framed poster, canvas painting, decal, or one-sheet overlay. "
                "Keep perspective and lighting realistic while preserving repeated tile structure. "
                "Do not erase or paint over existing wall frames/posters/art; keep them visible with proper occlusion."
            )
            if repeats_x and repeats_y:
                composed_hint += (
                    f" For physical scale, repeat motif approximately {repeats_x:.1f} times across and "
                    f"{repeats_y:.1f} times down the target wall."
                )
        else:
            composed_hint = (
                f"{hint}. Strict sizing constraints: the product graphic must fully fit inside one plausible target area, "
                f"occupying about {coverage}% of that target area. Do not overscale, do not crop the product edges."
            )
        if precise_hint:
            composed_hint += f" {precise_hint}"
        cat_name = (cat.name or "").lower()
        long_roll = (product_height_cm or 0) >= 180
        if "卷" in (cat.name or "") or "roll" in cat_name or "卷材" in (cat.name or "") or long_roll:
            composed_hint += f" Rolled stock tube ends (if visible): {ROLL_CORE_AI_PROMPT_EN} {ROLL_CORE_PATTERN_DIRECTION_EN}"
        if size_note:
            composed_hint += (
                f" Product size note: {size_note}. Respect this size relationship to surrounding objects."
            )
        out_bytes = b""
        used_provider = ""
        last_err = ""
        for pname in provider_chain:
            p = ai_service.get_provider(pname)
            if not hasattr(p, "composite_product_on_scene"):
                continue
            try:
                out_bytes = p.composite_product_on_scene(
                    material_for_composite,
                    scene_bytes,
                    placement_hint=composed_hint,
                )
                used_provider = pname
                break
            except RuntimeError as e:
                last_err = f"{pname}: {e}"
                continue
        if not out_bytes:
            raise RuntimeError(last_err or "All providers failed for effect composite")
        # Keep canvas dimension aligned with original scene for predictable preview/output.
        try:
            scene_img = Image.open(io.BytesIO(scene_bytes))
            out_img = Image.open(io.BytesIO(out_bytes)).convert("RGBA")
            if out_img.size != scene_img.size:
                out_img = out_img.resize(scene_img.size, Image.LANCZOS)
                buf = io.BytesIO()
                out_img.save(buf, format="PNG")
                out_bytes = buf.getvalue()
        except Exception:
            pass
        fname = f"composite_{uuid.uuid4().hex}.png"
        path = storage.save(io.BytesIO(out_bytes), f"effects/{effect_category_id}", fname)
        caption = (
            f"印刷素材合成 · 场景图 ID {sid}"
            + (f" · {hint}" if hint != "auto" else "")
            + (f" · provider={used_provider}" if used_provider else "")
        )
        img = create_effect_image(
            db,
            effect_category_id,
            path,
            title=caption[:300],
            created_by=created_by,
            prompt_used=caption,
        )
        results.append(img)
    if not results:
        raise ValueError("No valid scene images processed")
    return results


def ensure_default_effect_categories(db: Session) -> None:
    any_cat = db.query(EffectCategory).filter(EffectCategory.is_deleted == False).first()
    if not any_cat:
        defaults = ["光影增强", "质感增强", "背景融合", "风格迁移"]
        for idx, name in enumerate(defaults):
            create_effect_category(db, name=name, sort_order=idx)
    composite = db.query(EffectCategory).filter(
        EffectCategory.name == "合成效果图",
        EffectCategory.is_deleted == False,
    ).first()
    if not composite:
        create_effect_category(db, name="合成效果图", sort_order=99)


def list_recent_effect_images(db: Session, limit: int = 200) -> list[dict]:
    rows = (
        db.query(EffectImage)
        .filter(EffectImage.is_deleted == False)
        .order_by(EffectImage.id.desc())
        .limit(min(limit, 500))
        .all()
    )
    cats = {
        c.id: c.name
        for c in db.query(EffectCategory).filter(EffectCategory.is_deleted == False).all()
    }
    out: list[dict] = []
    for r in rows:
        out.append(
            {
                "id": r.id,
                "effect_category_id": r.effect_category_id,
                "category_name": cats.get(r.effect_category_id),
                "file_path": r.file_path,
                "file_exists": static_file_exists(r.file_path),
                "prompt_used": r.prompt_used,
                "title": r.title,
                "created_by": r.created_by,
            }
        )
    return out

