from sqlalchemy import Column, String, Text, Integer, ForeignKey
from app.database import Base
from app.common.base_model import IDMixin, TimestampMixin, SoftDeleteMixin, CreatorMixin
from app.common.tree_model import TreeMixin


class SceneCategory(IDMixin, TimestampMixin, SoftDeleteMixin, TreeMixin, Base):
    __tablename__ = "scene_categories"
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)


class SceneImage(IDMixin, TimestampMixin, SoftDeleteMixin, CreatorMixin, Base):
    __tablename__ = "scene_images"
    scene_category_id = Column(Integer, ForeignKey("scene_categories.id"), nullable=False, index=True)
    title = Column(String(300), nullable=True)
    file_path = Column(String(500), nullable=False)
    thumbnail_path = Column(String(500), nullable=True)
    prompt_used = Column(Text, nullable=True, comment="Full instruction used for AI-generated scenes")
    source_kind = Column(String(20), default="upload", comment="upload | ai")

