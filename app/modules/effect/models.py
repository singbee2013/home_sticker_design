from sqlalchemy import Column, String, Text, Integer, ForeignKey
from app.database import Base
from app.common.base_model import IDMixin, TimestampMixin, SoftDeleteMixin, CreatorMixin
from app.common.tree_model import TreeMixin


class EffectCategory(IDMixin, TimestampMixin, SoftDeleteMixin, TreeMixin, Base):
    __tablename__ = "effect_categories"
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)


class EffectImage(IDMixin, TimestampMixin, SoftDeleteMixin, CreatorMixin, Base):
    __tablename__ = "effect_images"
    effect_category_id = Column(Integer, ForeignKey("effect_categories.id"), nullable=False, index=True)
    source_image_id = Column(Integer, nullable=True, comment="Original material image ID")
    title = Column(String(300), nullable=True)
    file_path = Column(String(500), nullable=False)
    prompt_used = Column(Text, nullable=True)

