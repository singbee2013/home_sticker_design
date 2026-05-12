"""Video generation service using moviepy."""
from __future__ import annotations
import os, tempfile
from typing import List
from pathlib import Path
from sqlalchemy.orm import Session
from app.common.storage import get_storage
from app.config import get_settings
from .models import VideoTask


def create_video_task(db: Session, image_paths: List[str], duration: int = 10,
                      width: int = 1080, height: int = 1920,
                      title: str | None = None, created_by: str | None = None) -> VideoTask:
    task = VideoTask(
        title=title, source_image_ids=",".join(image_paths),
        duration=duration, width=width, height=height,
        created_by=created_by,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def execute_video_task(db: Session, task: VideoTask) -> VideoTask:
    """Build a slideshow video from images using moviepy."""
    try:
        task.status = "processing"
        db.commit()

        from moviepy.editor import ImageClip, concatenate_videoclips

        image_paths = [p.strip() for p in (task.source_image_ids or "").split(",") if p.strip()]
        storage_root = Path(get_settings().STORAGE_LOCAL_PATH)

        if not image_paths:
            raise ValueError("No images provided")

        clip_duration = max(1, task.duration // len(image_paths))
        clips = []
        for p in image_paths:
            full = storage_root / p
            if full.exists():
                clip = ImageClip(str(full), duration=clip_duration).resize((task.width, task.height))
                clips.append(clip)

        if not clips:
            raise ValueError("No valid images found")

        video = concatenate_videoclips(clips, method="compose")
        storage = get_storage()
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
            video.write_videofile(tmp.name, fps=task.fps, logger=None)
            tmp.seek(0)
            path = storage.save(open(tmp.name, "rb"), "videos", f"video_{task.id}.mp4")
        os.unlink(tmp.name)

        task.result_path = path
        task.status = "done"
    except Exception as e:
        task.status = "failed"
        task.error_message = str(e)[:1000]
    db.commit()
    db.refresh(task)
    return task


def list_video_tasks(db: Session, created_by: str | None = None, skip: int = 0, limit: int = 50):
    q = db.query(VideoTask).filter(VideoTask.is_deleted == False)
    if created_by:
        q = q.filter(VideoTask.created_by == created_by)
    return q.order_by(VideoTask.id.desc()).offset(skip).limit(limit).all()

