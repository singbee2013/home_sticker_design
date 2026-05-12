from __future__ import annotations
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from app.modules.auth.deps import get_current_user
from app.modules.auth.models import User
from .schemas import BatchDownloadRequest
from . import service

router = APIRouter()


@router.post("/batch")
def batch_download(req: BatchDownloadRequest, _: User = Depends(get_current_user)):
    buf = service.create_zip(req.file_paths)
    return StreamingResponse(buf, media_type="application/zip",
                             headers={"Content-Disposition": "attachment; filename=batch_download.zip"})

