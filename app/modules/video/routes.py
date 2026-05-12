from __future__ import annotations
from typing import List
from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from sqlalchemy.orm import Session
from app.deps import get_db
from app.modules.auth.deps import get_current_user, require_permission
from app.modules.auth.models import User
from app.modules.auth.service import log_audit
from .schemas import VideoCreate, VideoOut
from . import service

router = APIRouter()


@router.post("/", response_model=VideoOut)
def create_video(req: VideoCreate, background: BackgroundTasks,
                 db: Session = Depends(get_db), user: User = Depends(require_permission("video.manage"))):
    task = service.create_video_task(db, req.image_paths, duration=req.duration,
                                     width=req.width, height=req.height,
                                     title=req.title, created_by=user.username)
    background.add_task(_run, task.id)
    log_audit(db, user, action="generate", module="video", target=f"video:{task.id}", detail=(req.title or "")[:120])
    return task


@router.get("/", response_model=List[VideoOut])
def list_videos(db: Session = Depends(get_db), user: User = Depends(require_permission("video.manage"))):
    return service.list_video_tasks(db, created_by=None if user.is_superadmin else user.username)


@router.get("/{task_id}", response_model=VideoOut)
def get_video(task_id: int, db: Session = Depends(get_db), _: User = Depends(require_permission("video.manage"))):
    from .models import VideoTask
    t = db.query(VideoTask).get(task_id)
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    return t


def _run(task_id: int):
    from app.database import SessionLocal
    from .models import VideoTask
    db = SessionLocal()
    try:
        task = db.query(VideoTask).get(task_id)
        if task:
            service.execute_video_task(db, task)
    finally:
        db.close()

