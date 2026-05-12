from __future__ import annotations
from typing import List

from fastapi import APIRouter, Depends, UploadFile, File, Form, BackgroundTasks, HTTPException
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.deps import get_db
from app.modules.auth.deps import get_current_user, require_permission
from app.modules.auth.models import User
from app.modules.auth.service import log_audit

from .schemas import SuiteOut
from . import service

router = APIRouter()


def _run_suite_generation(
    suite_id: int,
    img_bytes: bytes,
    texture_bytes: bytes | None = None,
    provider_name: str | None = None,
    output_count: int | None = None,
    main_image_count: int | None = None,
    detail_image_count: int | None = None,
    scene_category_id: int | None = None,
    precise_attach_enabled: bool = False,
    keep_pattern_scale: bool = True,
    pattern_scale_percent: int = 100,
    product_width_cm: float | None = None,
    product_height_cm: float | None = None,
    tile_width_cm: float | None = None,
    tile_height_cm: float | None = None,
    target_surface_width_cm: float | None = None,
    target_surface_height_cm: float | None = None,
    generation_mode: str = "balanced",
    strict_attach_mode: bool = False,
) -> None:
    db = SessionLocal()
    suite_row = None
    try:
        suite_row = db.query(service.PlatformSuite).filter(service.PlatformSuite.id == suite_id).first()
        if not suite_row:
            return
        suite_row.status = "processing"
        suite_row.error_message = None
        db.commit()
        service.generate_suite_images(
            db,
            suite_row,
            img_bytes,
            texture_bytes=texture_bytes,
            provider_name=provider_name,
            output_count=output_count,
            main_image_count=main_image_count,
            detail_image_count=detail_image_count,
            scene_category_id=scene_category_id,
            precise_attach_enabled=precise_attach_enabled,
            keep_pattern_scale=keep_pattern_scale,
            pattern_scale_percent=pattern_scale_percent,
            product_width_cm=product_width_cm,
            product_height_cm=product_height_cm,
            tile_width_cm=tile_width_cm,
            tile_height_cm=tile_height_cm,
            target_surface_width_cm=target_surface_width_cm,
            target_surface_height_cm=target_surface_height_cm,
            generation_mode=generation_mode,
            strict_attach_mode=strict_attach_mode,
        )
    except Exception as e:
        db.rollback()
        suite_row = db.query(service.PlatformSuite).filter(service.PlatformSuite.id == suite_id).first()
        if suite_row:
            suite_row.status = "failed"
            suite_row.error_message = str(e)[:800]
            db.commit()
    finally:
        db.close()


@router.get("/platforms")
def list_platforms():
    return service.list_platforms()


@router.post("/", response_model=SuiteOut)
async def create_suite(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    texture_file: UploadFile | None = File(None),
    platform_code: str = Form("amazon"),
    material_number: str | None = Form(None),
    title: str | None = Form(None),
    product_description: str | None = Form(None),
    dimensions_spec: str | None = Form(None),
    provider: str | None = Form(None),
    output_count: int | None = Form(None),
    main_image_count: int | None = Form(None),
    detail_image_count: int | None = Form(None),
    scene_category_id: int | None = Form(None),
    precise_attach_enabled: bool = Form(False),
    keep_pattern_scale: bool = Form(True),
    pattern_scale_percent: int = Form(100),
    product_width_cm: float | None = Form(None),
    product_height_cm: float | None = Form(None),
    tile_width_cm: float | None = Form(None),
    tile_height_cm: float | None = Form(None),
    target_surface_width_cm: float | None = Form(None),
    target_surface_height_cm: float | None = Form(None),
    generation_mode: str = Form("balanced"),
    strict_attach_mode: bool = Form(False),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("suites.manage")),
):
    img_bytes = await file.read()
    texture_bytes = await texture_file.read() if texture_file else None
    suite = service.create_suite(
        db,
        platform_code,
        created_by=user.username,
        material_number=material_number,
        title=title,
        product_description=product_description,
        dimensions_spec=dimensions_spec,
    )
    suite.status = "pending"
    db.commit()
    db.refresh(suite)
    background_tasks.add_task(
        _run_suite_generation,
        suite.id,
        img_bytes,
        texture_bytes,
        provider,
        output_count,
        main_image_count,
        detail_image_count,
        scene_category_id,
        precise_attach_enabled,
        keep_pattern_scale,
        pattern_scale_percent,
        product_width_cm,
        product_height_cm,
        tile_width_cm,
        tile_height_cm,
        target_surface_width_cm,
        target_surface_height_cm,
        generation_mode,
        strict_attach_mode,
    )
    log_audit(db, user, action="generate", module="suites", target=f"suite:{suite.id}", detail=(title or platform_code or "")[:120])
    return suite


@router.get("/", response_model=List[SuiteOut])
def list_suites(
    platform_code: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("suites.manage")),
):
    return service.list_suites(db, platform_code)


@router.get("/{suite_id}", response_model=SuiteOut)
def get_suite(suite_id: int, db: Session = Depends(get_db), _: User = Depends(require_permission("suites.manage"))):
    s = db.query(service.PlatformSuite).filter(service.PlatformSuite.id == suite_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Not found")
    return s


@router.delete("/{suite_id}")
def delete_suite(suite_id: int, db: Session = Depends(get_db), user: User = Depends(require_permission("history.delete"))):
    if not service.delete_suite(db, suite_id):
        raise HTTPException(status_code=404, detail="Not found")
    log_audit(db, user, action="delete", module="history", target=f"suite:{suite_id}")
    return {"ok": True}


@router.delete("/images/{image_id}")
def delete_suite_image(image_id: int, db: Session = Depends(get_db), user: User = Depends(require_permission("history.delete"))):
    if not service.delete_suite_image(db, image_id):
        raise HTTPException(status_code=404, detail="Not found")
    log_audit(db, user, action="delete", module="history", target=f"suite_image:{image_id}")
    return {"ok": True}
