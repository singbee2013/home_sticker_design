from __future__ import annotations
from typing import List
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from app.common.background_jobs import spawn_daemon_thread
from app.deps import get_db
from app.modules.auth.deps import require_permission
from app.modules.auth.models import User
from app.modules.auth.service import log_audit
from .schemas import Text2ImgRequest, Img2ImgRequest, TaskOut
from . import service

router = APIRouter()


@router.get("/providers")
def providers():
    names = service.list_providers()
    default = service.get_effective_default_provider()
    if default not in names and names:
        default = names[0]
    if default in names:
        ordered = [default] + [n for n in names if n != default]
    else:
        ordered = list(names)
    return {"providers": ordered, "default_provider": default}


@router.post("/text2img", response_model=TaskOut)
def text2img(req: Text2ImgRequest,
             db: Session = Depends(get_db), user: User = Depends(require_permission("ai.generate"))):
    task = service.create_task(db, "text2img", req.prompt, provider_name=req.provider,
                               style_id=req.style_id, category_id=req.category_id,
                               width=req.width, height=req.height, created_by=user.username)
    spawn_daemon_thread(_run_task, (task.id, None), name=f"ai-task-{task.id}")
    log_audit(db, user, action="generate", module="ai", target=f"task:{task.id}", detail=f"text2img:{req.prompt[:120]}")
    return service.task_to_out(db, task)


@router.post("/img2img", response_model=TaskOut)
async def img2img(
                  file: UploadFile = File(...),
                  prompt: str = Form(""),
                  style_id: int | None = Form(None),
                  category_id: int | None = Form(None),
                  provider: str | None = Form(None),
                  width: int = Form(1024),
                  height: int = Form(1024),
                  db: Session = Depends(get_db), user: User = Depends(require_permission("ai.generate"))):
    ref_bytes = await file.read()
    task = service.create_task(db, "img2img", prompt, provider_name=provider,
                               style_id=style_id, category_id=category_id,
                               width=width, height=height,
                               created_by=user.username)
    spawn_daemon_thread(_run_task, (task.id, ref_bytes), name=f"ai-task-{task.id}")
    log_audit(db, user, action="generate", module="ai", target=f"task:{task.id}", detail=f"img2img:{prompt[:120]}")
    return service.task_to_out(db, task)


@router.get("/tasks", response_model=List[TaskOut])
def list_tasks(db: Session = Depends(get_db), user: User = Depends(require_permission("ai.generate"))):
    tasks = service.list_tasks(db, created_by=None if user.is_superadmin else user.username)
    return service.tasks_to_out(db, tasks)


@router.get("/tasks/{task_id}", response_model=TaskOut)
def get_task(task_id: int, db: Session = Depends(get_db), _: User = Depends(require_permission("ai.generate"))):
    task = db.query(service.GenerationTask).filter(
        service.GenerationTask.id == task_id,
        service.GenerationTask.is_deleted == False,  # noqa: E712
    ).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return service.task_to_out(db, task)


@router.delete("/tasks/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db), user: User = Depends(require_permission("history.delete"))):
    removed = service.soft_delete_task(db, task_id, created_by=None if user.is_superadmin else user.username)
    if not removed:
        raise HTTPException(status_code=404, detail="Task not found")
    log_audit(db, user, action="delete", module="history", target=f"ai_task:{task_id}")
    return {"ok": True}


def _run_task(task_id: int, ref_bytes: bytes | None):
    """Background task runner."""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        task = db.query(service.GenerationTask).get(task_id)
        if task:
            service.execute_task(db, task, ref_bytes)
    finally:
        db.close()

