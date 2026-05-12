from sqlalchemy import Column, String, Integer, Text
from app.database import Base
from app.common.base_model import IDMixin, TimestampMixin, SoftDeleteMixin, CreatorMixin


class VideoTask(IDMixin, TimestampMixin, SoftDeleteMixin, CreatorMixin, Base):
    __tablename__ = "video_tasks"
    title = Column(String(300), nullable=True)
    source_image_ids = Column(Text, nullable=True, comment="Comma-separated image IDs or paths")
    duration = Column(Integer, default=10)
    width = Column(Integer, default=1080)
    height = Column(Integer, default=1920)
    fps = Column(Integer, default=30)
    status = Column(String(20), default="pending")
    result_path = Column(String(500), nullable=True)
    error_message = Column(Text, nullable=True)

