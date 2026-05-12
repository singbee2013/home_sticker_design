from __future__ import annotations
from typing import List
from sqlalchemy.orm import Session

from app.config import PROJECT_ROOT
from .models import StyleTemplate

# Original bootstrap presets (replaced by _CANONICAL_STYLES for product UI).
_LEGACY_BOOTSTRAP_STYLE_NAMES = frozenset({"极简", "手绘", "现代", "卡通", "复古"})
_LEGACY_MARKER = PROJECT_ROOT / "data" / ".legacy_style_presets_retired"


def create_style(db: Session, name: str, name_en: str | None = None,
                 prompt_snippet: str | None = None, sort_order: int = 0,
                 is_active: bool = True) -> StyleTemplate:
    s = StyleTemplate(
        name=name,
        name_en=name_en,
        prompt_snippet=prompt_snippet,
        sort_order=sort_order,
        is_active=is_active,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


def list_styles(db: Session, active_only: bool = True) -> List[StyleTemplate]:
    q = db.query(StyleTemplate).filter(StyleTemplate.is_deleted == False)
    if active_only:
        q = q.filter(StyleTemplate.is_active == True)
    return q.order_by(StyleTemplate.sort_order, StyleTemplate.id).all()


def get_style(db: Session, style_id: int) -> StyleTemplate | None:
    return db.query(StyleTemplate).filter(StyleTemplate.id == style_id, StyleTemplate.is_deleted == False).first()


def update_style(db: Session, style: StyleTemplate, **kwargs) -> StyleTemplate:
    for k, v in kwargs.items():
        if v is not None and hasattr(style, k):
            setattr(style, k, v)
    db.commit()
    db.refresh(style)
    return style


def delete_style(db: Session, style: StyleTemplate) -> None:
    style.is_deleted = True
    db.commit()


_CANONICAL_STYLES: list[tuple[str, str, str]] = [
    ("北欧简约风", "Nordic minimalist", "Nordic minimalist interior-inspired palette, clean geometry, soft neutrals, airy whitespace"),
    ("现代轻奢风", "modern luxury", "modern luxury decor mood, refined metallics, subtle marble textures, elegant contrast"),
    ("复古美式风", "vintage American", "vintage American classic decor, warm wood tones, cozy traditional motifs"),
    ("田园小清新风", "pastoral fresh", "pastoral cottage freshness, delicate florals, light greens and creams"),
    ("日系和风", "Japanese washitsu", "Japanese wabi-sabi calm, subtle textures, natural muted tones, restrained composition"),
    ("国潮中国风", "neo-Chinese trend", "modern Chinese neo-traditional graphic vibe, ink motifs with bold contemporary colors"),
    ("摩洛哥民族风", "Moroccan ethnic", "Moroccan ethnic tile geometry, ornate borders, terracotta and jewel accents"),
    ("INS 网红风", "Instagram trendy", "Instagram-ready lifestyle aesthetic, punchy pastels, playful trendy composition"),
    ("工业极简风", "industrial minimal", "industrial minimal loft mood, concrete and metal textures, monochrome structure"),
    ("卡通童趣风", "cartoon playful", "playful cartoon sticker style, rounded shapes, cheerful saturated colors"),
    ("科技未来风", "sci-fi futuristic", "sci-fi futuristic holographic gradients, sleek neon accents, high-tech glow"),
    ("轻奢鎏金风", "luxury gold foil", "quiet luxury with subtle gold foil highlights, premium editorial mood"),
    ("水墨国风", "Chinese ink wash", "Chinese ink wash painting atmosphere, soft gradients, artistic brush texture"),
    ("波西米亚风", "Bohemian eclectic", "Bohemian eclectic pattern mix, macrame motifs, warm earth tones"),
    ("低饱和高级风", "muted editorial premium", "low-saturation premium editorial palette, understated sophistication"),
]


def ensure_canonical_style_presets(db: Session) -> None:
    """Ensure product default style names exist; safe to run on every startup."""
    for idx, (name, name_en, snippet) in enumerate(_CANONICAL_STYLES):
        exists = (
            db.query(StyleTemplate)
            .filter(StyleTemplate.name == name, StyleTemplate.is_deleted == False)
            .first()
        )
        if exists:
            continue
        db.add(
            StyleTemplate(
                name=name,
                name_en=name_en,
                prompt_snippet=snippet,
                sort_order=idx,
                is_active=True,
            )
        )
    db.commit()


def deactivate_legacy_bootstrap_styles_once(db: Session) -> None:
    """One-time: hide old default five styles after canonical presets exist (marker file)."""
    try:
        _LEGACY_MARKER.parent.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass
    if _LEGACY_MARKER.exists():
        return
    for name in _LEGACY_BOOTSTRAP_STYLE_NAMES:
        row = (
            db.query(StyleTemplate)
            .filter(StyleTemplate.name == name, StyleTemplate.is_deleted == False)
            .first()
        )
        if row and row.is_active:
            row.is_active = False
    db.commit()
    try:
        _LEGACY_MARKER.write_text("1", encoding="utf-8")
    except OSError:
        pass


def ensure_default_styles(db: Session) -> None:
    """Merge canonical presets without overwriting admin edits; retire legacy bootstrap once."""
    ensure_canonical_style_presets(db)
    deactivate_legacy_bootstrap_styles_once(db)

