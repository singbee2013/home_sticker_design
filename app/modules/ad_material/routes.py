from __future__ import annotations
from typing import List
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form
from sqlalchemy.orm import Session
from app.deps import get_db
from app.modules.auth.deps import get_current_user, require_permission
from app.modules.auth.models import User
from app.modules.auth.service import log_audit
from .schemas import AdMaterialOut
from . import service

router = APIRouter()


@router.get("/channels")
def list_channels():
    return service.get_ad_channels()


@router.post("/generate", response_model=List[AdMaterialOut])
async def generate(channel_code: str, file: UploadFile = File(...),
                   material_number: str | None = None,
                   precise_attach_enabled: bool = Form(False),
                   keep_pattern_scale: bool = Form(True),
                   pattern_scale_percent: int = Form(100),
                   db: Session = Depends(get_db), user: User = Depends(require_permission("ads.manage"))):
    img_bytes = await file.read()
    out = service.generate_ad_images(db, img_bytes, channel_code,
                                      created_by=user.username, material_number=material_number,
                                      precise_attach_enabled=precise_attach_enabled,
                                      keep_pattern_scale=keep_pattern_scale,
                                      pattern_scale_percent=pattern_scale_percent)
    log_audit(db, user, action="generate", module="ads", target=channel_code, detail=(material_number or "")[:120])
    return out


@router.get("/", response_model=List[AdMaterialOut])
def list_ads(channel_code: str | None = None, db: Session = Depends(get_db),
             _: User = Depends(require_permission("ads.manage"))):
    return service.list_ads(db, channel_code)

