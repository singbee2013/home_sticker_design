from sqlalchemy import Column, String, Text, Boolean, Integer
from app.database import Base
from app.common.base_model import IDMixin, TimestampMixin, SoftDeleteMixin


class StyleTemplate(IDMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "style_templates"
    name = Column(String(200), nullable=False, unique=True)
    name_en = Column(String(200), nullable=True)
    prompt_snippet = Column(Text, nullable=True, comment="Prompt fragment injected into AI generation")
    preview_image = Column(String(500), nullable=True)
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)

