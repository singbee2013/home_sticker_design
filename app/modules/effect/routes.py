from __future__ import annotations
from typing import List
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from app.deps import get_db
from app.modules.auth.deps import get_current_user, require_permission
from app.modules.auth.models import User
from app.modules.auth.service import log_audit
from app.common.storage import get_storage
from .schemas import EffectCategoryCreate, EffectCategoryOut, EffectImageOut
from . import service

router = APIRouter()


@router.get("/tree")
def get_tree(db: Session = Depends(get_db), _: User = Depends(require_permission("effects.manage"))):
    return service.build_effect_tree(db)


@router.post("/categories", response_model=EffectCategoryOut)
def create_category(req: EffectCategoryCreate, db: Session = Depends(get_db), _: User = Depends(require_permission("effects.manage"))):
    return service.create_effect_category(db, name=req.name, parent_id=req.parent_id,
                                          description=req.description, sort_order=req.sort_order)


@router.get("/recent-images")
def recent_effect_images(limit: int = 200, db: Session = Depends(get_db), _: User = Depends(require_permission("effects.manage"))):
    return {"items": service.list_recent_effect_images(db, limit)}


@router.delete("/images/{image_id}")
def delete_effect_image(image_id: int, db: Session = Depends(get_db), user: User = Depends(require_permission("history.delete"))):
    if not service.delete_effect_image(db, image_id):
        raise HTTPException(status_code=404, detail="Not found")
    log_audit(db, user, action="delete", module="history", target=f"effect_image:{image_id}")
    return {"ok": True}


@router.post("/composite", response_model=List[EffectImageOut])
async def composite_scenes(
    file: UploadFile = File(...),
    effect_category_id: int = Form(...),
    scene_ids: str = Form(..., description="Comma-separated scene_image ids, max 10"),
    placement_hint: str = Form(""),
    product_size_note: str = Form(""),
    coverage_percent: int = Form(35),
    fill_target_surface: bool = Form(True),
    pattern_scale_percent: int = Form(100),
    keep_pattern_scale: bool = Form(True),
    product_width_cm: float | None = Form(None),
    product_height_cm: float | None = Form(None),
    tile_width_cm: float | None = Form(None),
    tile_height_cm: float | None = Form(None),
    target_surface_width_cm: float | None = Form(None),
    target_surface_height_cm: float | None = Form(None),
    target_surface_type: str = Form("wall"),
    provider: str | None = Form(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("effects.manage")),
):
    raw_ids = [int(x.strip()) for x in scene_ids.split(",") if x.strip().isdigit()]
    if not raw_ids:
        raise HTTPException(status_code=400, detail="scene_ids required")
    material = await file.read()
    try:
        out = service.composite_material_with_scenes(
            db,
            effect_category_id,
            material,
            raw_ids,
            placement_hint,
            user.username,
            provider_name=provider,
            product_size_note=product_size_note,
            coverage_percent=coverage_percent,
            fill_target_surface=fill_target_surface,
            pattern_scale_percent=pattern_scale_percent,
            keep_pattern_scale=keep_pattern_scale,
            product_width_cm=product_width_cm,
            product_height_cm=product_height_cm,
            tile_width_cm=tile_width_cm,
            tile_height_cm=tile_height_cm,
            target_surface_width_cm=target_surface_width_cm,
            target_surface_height_cm=target_surface_height_cm,
            target_surface_type=target_surface_type,
        )
        log_audit(db, user, action="generate", module="effects", target=f"category:{effect_category_id}", detail=(placement_hint or "")[:120])
        return out
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/{category_id}/images", response_model=List[EffectImageOut])
def list_images(category_id: int, db: Session = Depends(get_db), _: User = Depends(require_permission("effects.manage"))):
    return service.list_effect_images(db, category_id)


@router.post("/{category_id}/images", response_model=EffectImageOut)
def upload_image(category_id: int, file: UploadFile = File(...),
                 title: str = Form(None), db: Session = Depends(get_db),
                 user: User = Depends(require_permission("effects.manage"))):
    storage = get_storage()
    path = storage.save(file.file, f"effects/{category_id}", file.filename)
    out = service.create_effect_image(db, category_id, path, title=title, created_by=user.username)
    log_audit(db, user, action="upload", module="effects", target=f"effect_image:{out.id}", detail=(title or file.filename or "")[:120])
    return out

