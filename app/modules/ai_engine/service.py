"""AI engine service — provider registry & task orchestration."""
from __future__ import annotations

import io
import os
import traceback
from typing import Dict, Type

from sqlalchemy.orm import Session

from app.config import get_settings
from app.common.storage import get_storage
from .models import GenerationTask
from .schemas import TaskOut
from .providers import AIProvider
from .providers.mock import MockProvider
from .providers.gpt_image import GPTImageProvider
from .providers.stable_diffusion import StableDiffusionProvider
from .providers.midjourney import MidjourneyProvider
from .providers.gemini import GeminiProvider
from .providers.siliconflow import SiliconFlowProvider
from .providers.wanxiang import WanxiangProvider

# ---- Provider registry (hot-pluggable) ----
_PROVIDERS: Dict[str, Type[AIProvider]] = {}


def _register_builtin():
    for cls in [
        MockProvider,
        GPTImageProvider,
        StableDiffusionProvider,
        MidjourneyProvider,
        GeminiProvider,
        SiliconFlowProvider,
        WanxiangProvider,
    ]:
        _PROVIDERS[cls.name] = cls


_register_builtin()


def register_provider(cls: Type[AIProvider]):
    _PROVIDERS[cls.name] = cls


def get_effective_default_provider() -> str:
    """Default model for text2img/img2img when the client omits ``provider``.

    Prefer Gemini whenever it is registered (product default), so a stray
    ``AI_DEFAULT_PROVIDER=gpt_image`` on the host does not override ``settings.yaml``.

    Operators can still force another built-in with env ``DECORAI_FORCE_DEFAULT_AI_PROVIDER``
    (must match a registered ``name``).
    """
    names = list(_PROVIDERS.keys())
    forced = os.getenv("DECORAI_FORCE_DEFAULT_AI_PROVIDER", "").strip()
    if forced and forced in _PROVIDERS:
        return forced
    if "gemini" in _PROVIDERS:
        return "gemini"
    cand = (get_settings().AI_DEFAULT_PROVIDER or "").strip()
    if cand in _PROVIDERS:
        return cand
    return names[0] if names else "mock"


def get_provider(name: str | None = None) -> AIProvider:
    name = name or get_effective_default_provider()
    cls = _PROVIDERS.get(name)
    if not cls:
        raise ValueError(f"Unknown AI provider: {name}. Available: {list(_PROVIDERS.keys())}")
    return cls()


def _provider_has_credentials(name: str) -> bool:
    if name == "mock":
        return True
    if name == "gemini":
        return bool(os.getenv("GEMINI_API_KEY", "").strip())
    if name == "gpt_image":
        return bool(os.getenv("OPENAI_API_KEY", "").strip()) or bool(
            os.getenv("AZURE_OPENAI_API_KEY", "").strip()
        )
    if name == "siliconflow":
        return bool(os.getenv("SILICONFLOW_API_KEY", "").strip())
    if name == "wanxiang":
        return bool(os.getenv("DASHSCOPE_API_KEY", "").strip())
    return True


def list_providers() -> list[str]:
    """Providers that are registered and have API keys configured (excludes mock)."""
    return [n for n in _PROVIDERS.keys() if n != "mock" and _provider_has_credentials(n)]


# ---- Task execution ----

def create_task(db: Session, task_type: str, prompt: str, provider_name: str | None = None,
                style_id: int | None = None, category_id: int | None = None,
                width: int = 1024, height: int = 1024,
                created_by: str | None = None, reference_image_path: str | None = None) -> GenerationTask:
    prov = provider_name or get_effective_default_provider()
    task = GenerationTask(
        task_type=task_type, provider=prov, prompt=prompt,
        style_id=style_id, category_id=category_id,
        width=width, height=height, created_by=created_by,
        reference_image_path=reference_image_path,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def execute_task(db: Session, task: GenerationTask, ref_image_bytes: bytes | None = None) -> GenerationTask:
    """Run the AI generation synchronously (called from background thread)."""
    try:
        task.status = "processing"
        db.commit()

        provider = get_provider(task.provider)
        # Get style hint
        style_hint = ""
        if task.style_id:
            from app.modules.style.models import StyleTemplate
            style = db.query(StyleTemplate).get(task.style_id)
            if style and style.prompt_snippet:
                style_hint = style.prompt_snippet

        if task.task_type == "text2img":
            img_bytes = provider.text_to_image(task.prompt or "", style_hint=style_hint,
                                               width=task.width, height=task.height)
        else:
            if ref_image_bytes is None:
                raise ValueError("Reference image required for img2img")
            img_bytes = provider.image_to_image(ref_image_bytes, prompt=task.prompt or "",
                                                style_hint=style_hint,
                                                width=task.width, height=task.height)

        storage = get_storage()
        path = storage.save(io.BytesIO(img_bytes), "generated", f"task_{task.id}.png")
        task.result_path = path
        task.status = "done"
    except Exception as e:
        task.status = "failed"
        task.error_message = str(e)[:1000]
    db.commit()
    db.refresh(task)
    return task


def list_tasks(db: Session, created_by: str | None = None, skip: int = 0, limit: int = 50):
    q = db.query(GenerationTask).filter(GenerationTask.is_deleted == False)  # noqa: E712
    if created_by:
        q = q.filter(GenerationTask.created_by == created_by)
    return q.order_by(GenerationTask.id.desc()).offset(skip).limit(limit).all()


def soft_delete_task(db: Session, task_id: int, created_by: str | None = None) -> GenerationTask | None:
    q = db.query(GenerationTask).filter(GenerationTask.id == task_id, GenerationTask.is_deleted == False)  # noqa: E712
    if created_by:
        q = q.filter(GenerationTask.created_by == created_by)
    task = q.first()
    if not task:
        return None
    if task.result_path:
        try:
            get_storage().delete(task.result_path)
        except Exception:
            pass
    task.is_deleted = True
    task.result_path = None
    db.commit()
    db.refresh(task)
    return task


def tasks_to_out(db: Session, tasks: list[GenerationTask]) -> list[TaskOut]:
    """Attach resolved style/category labels for API responses."""
    if not tasks:
        return []
    from app.modules.style.models import StyleTemplate
    from app.modules.category.models import Category

    style_ids = {t.style_id for t in tasks if t.style_id}
    cat_ids = {t.category_id for t in tasks if t.category_id}
    style_names: dict[int, str] = {}
    cat_names: dict[int, str] = {}
    if style_ids:
        for row in db.query(StyleTemplate).filter(StyleTemplate.id.in_(style_ids)):
            style_names[row.id] = row.name
    if cat_ids:
        for row in db.query(Category).filter(Category.id.in_(cat_ids)):
            cat_names[row.id] = row.name
    out: list[TaskOut] = []
    for t in tasks:
        out.append(
            TaskOut(
                id=t.id,
                task_type=t.task_type,
                provider=t.provider,
                prompt=t.prompt,
                status=t.status,
                result_path=t.result_path,
                material_number=t.material_number,
                error_message=t.error_message,
                created_by=t.created_by,
                created_at=t.created_at,
                style_name=style_names.get(t.style_id) if t.style_id else None,
                category_name=cat_names.get(t.category_id) if t.category_id else None,
            )
        )
    return out


def task_to_out(db: Session, task: GenerationTask) -> TaskOut:
    return tasks_to_out(db, [task])[0]

