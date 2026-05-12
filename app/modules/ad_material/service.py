"""Ad material service — generate ad images per channel specs."""
from __future__ import annotations
import io
from typing import List
from PIL import Image
from sqlalchemy.orm import Session
from app.common.precise_attach import prepare_material_for_precise_attach
from app.config import get_settings
from app.common.storage import get_storage
from .models import AdMaterial


def get_ad_channels() -> dict:
    return get_settings().ad_specs.get("ad_channels", {})


def generate_ad_images(db: Session, source_image_bytes: bytes, channel_code: str,
                       created_by: str | None = None, material_number: str | None = None,
                       precise_attach_enabled: bool = False,
                       keep_pattern_scale: bool = True,
                       pattern_scale_percent: int = 100) -> List[AdMaterial]:
    channels = get_ad_channels()
    spec = channels.get(channel_code)
    if not spec:
        raise ValueError(f"Unknown ad channel: {channel_code}")

    storage = get_storage()
    src = source_image_bytes
    if precise_attach_enabled:
        src = prepare_material_for_precise_attach(
            source_image_bytes,
            pattern_scale_percent=pattern_scale_percent,
            keep_pattern_scale=keep_pattern_scale,
        )
    results = []
    for size_spec in spec.get("sizes", []):
        w, h = size_spec["width"], size_spec["height"]
        img = Image.open(io.BytesIO(src)).resize((w, h), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        path = storage.save(buf, f"ads/{channel_code}", f"{material_number or 'ad'}_{size_spec['name']}.png")
        ad = AdMaterial(channel_code=channel_code, size_name=size_spec["name"],
                        width=w, height=h, file_path=path, status="done",
                        created_by=created_by, material_number=material_number)
        db.add(ad)
        results.append(ad)
    db.commit()
    for r in results:
        db.refresh(r)
    return results


def list_ads(db: Session, channel_code: str | None = None, skip: int = 0, limit: int = 50):
    q = db.query(AdMaterial).filter(AdMaterial.is_deleted == False)
    if channel_code:
        q = q.filter(AdMaterial.channel_code == channel_code)
    return q.order_by(AdMaterial.id.desc()).offset(skip).limit(limit).all()

