from sqlalchemy import Column, String, Text, Integer, DateTime, Boolean
from app.database import Base
from app.common.base_model import IDMixin, TimestampMixin, CreatorMixin


class GenerationTask(IDMixin, TimestampMixin, CreatorMixin, Base):
    __tablename__ = "generation_tasks"
    task_type = Column(String(20), nullable=False, comment="text2img | img2img")
    provider = Column(String(50), nullable=False)
    prompt = Column(Text, nullable=True)
    style_id = Column(Integer, nullable=True)
    category_id = Column(Integer, nullable=True)
    width = Column(Integer, default=1024)
    height = Column(Integer, default=1024)
    status = Column(String(20), default="pending", comment="pending|processing|done|failed")
    result_path = Column(String(500), nullable=True)
    error_message = Column(Text, nullable=True)
    material_number = Column(String(100), nullable=True, comment="Factory number e.g. QZ_001")
    reference_image_path = Column(String(500), nullable=True)
    is_deleted = Column(Boolean, default=False, nullable=False)

