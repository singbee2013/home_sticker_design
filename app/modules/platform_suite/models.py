from sqlalchemy import Column, String, Integer, Text, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base
from app.common.base_model import IDMixin, TimestampMixin, SoftDeleteMixin, CreatorMixin


class PlatformSuite(IDMixin, TimestampMixin, SoftDeleteMixin, CreatorMixin, Base):
    __tablename__ = "platform_suites"
    platform_code = Column(String(50), nullable=False, index=True)
    source_image_id = Column(Integer, nullable=True, comment="Original AI-generated image task ID")
    material_number = Column(String(100), nullable=True)
    title = Column(String(300), nullable=True)
    product_description = Column(Text, nullable=True, comment="Listing copy for AI-guided renders")
    dimensions_spec = Column(Text, nullable=True, comment="Human-readable dimensions / specs")
    error_message = Column(Text, nullable=True)
    status = Column(String(20), default="pending")
    images = relationship("SuiteImage", back_populates="suite", lazy="joined")


class SuiteImage(IDMixin, TimestampMixin, Base):
    __tablename__ = "suite_images"
    suite_id = Column(Integer, ForeignKey("platform_suites.id"), nullable=False, index=True)
    image_type = Column(String(30), nullable=False, comment="main|secondary|detail")
    file_path = Column(String(500), nullable=False)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    sort_order = Column(Integer, default=0)
    suite = relationship("PlatformSuite", back_populates="images")

