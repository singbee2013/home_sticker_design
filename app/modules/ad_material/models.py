from sqlalchemy import Column, String, Integer, Text
from sqlalchemy.orm import relationship
from app.database import Base
from app.common.base_model import IDMixin, TimestampMixin, SoftDeleteMixin, CreatorMixin


class AdMaterial(IDMixin, TimestampMixin, SoftDeleteMixin, CreatorMixin, Base):
    __tablename__ = "ad_materials"
    channel_code = Column(String(50), nullable=False, index=True, comment="e.g. facebook, instagram")
    size_name = Column(String(100), nullable=True, comment="e.g. Feed, Story")
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    source_image_id = Column(Integer, nullable=True)
    material_number = Column(String(100), nullable=True)
    file_path = Column(String(500), nullable=True)
    status = Column(String(20), default="pending")

