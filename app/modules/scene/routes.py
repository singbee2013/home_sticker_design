from __future__ import annotations
from typing import List
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from app.deps import get_db
from app.modules.auth.deps import get_current_user, require_permission
from app.modules.auth.models import User
from app.modules.auth.service import log_audit
from app.common.storage import get_storage
from .schemas import SceneCategoryCreate, SceneCategoryOut, SceneImageOut, SceneGenerateRequest
from . import service

router = APIRouter()


@router.get("/tree")
def get_tree(db: Session = Depends(get_db), _: User = Depends(require_permission("scenes.manage"))):
    return service.build_scene_tree(db)


@router.get("/prompt-presets")
def prompt_presets(_: User = Depends(require_permission("scenes.manage"))):
    return {"presets": service.prompt_preset_options()}


@router.get("/recent-images")
def recent_scene_images(limit: int = 200, db: Session = Depends(get_db), _: User = Depends(require_permission("scenes.manage"))):
    return {"items": service.list_recent_scene_images(db, limit)}


@router.delete("/images/{image_id}")
def delete_scene_image(image_id: int, db: Session = Depends(get_db), user: User = Depends(require_permission("history.delete"))):
    if not service.delete_scene_image(db, image_id):
        raise HTTPException(status_code=404, detail="Not found")
    log_audit(db, user, action="delete", module="history", target=f"scene_image:{image_id}")
    return {"ok": True}


@router.post("/categories", response_model=SceneCategoryOut)
def create_category(req: SceneCategoryCreate, db: Session = Depends(get_db), _: User = Depends(require_permission("scenes.manage"))):
    return service.create_scene_category(db, name=req.name, parent_id=req.parent_id,
                                         description=req.description, sort_order=req.sort_order)


@router.post("/{category_id}/generate", response_model=SceneImageOut)
def generate_scene(
    category_id: int,
    req: SceneGenerateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("scenes.manage")),
):
    try:
        out = service.generate_scene_with_ai(
            db,
            category_id,
            req.prompt,
            req.mode,
            user.username,
            provider_name=req.provider,
        )
        log_audit(db, user, action="generate", module="scenes", target=f"scene_image:{out.id}", detail=(req.prompt or "")[:120])
        return out
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/{category_id}/images", response_model=List[SceneImageOut])
def list_images(category_id: int, db: Session = Depends(get_db), _: User = Depends(require_permission("scenes.manage"))):
    return service.list_scene_images(db, category_id)


@router.post("/{category_id}/images", response_model=SceneImageOut)
def upload_image(category_id: int, file: UploadFile = File(...),
                 title: str = Form(None), db: Session = Depends(get_db),
                 user: User = Depends(require_permission("scenes.manage"))):
    storage = get_storage()
    path = storage.save(file.file, f"scenes/{category_id}", file.filename)
    out = service.create_scene_image(
        db, category_id, path, title=title, created_by=user.username,
        prompt_used=None, source_kind="upload",
    )
    log_audit(db, user, action="upload", module="scenes", target=f"scene_image:{out.id}", detail=(title or file.filename or "")[:120])
    return out

