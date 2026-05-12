from sqlalchemy import Column, String, Text
from app.database import Base
from app.common.base_model import IDMixin, TimestampMixin, SoftDeleteMixin, CreatorMixin
from app.common.tree_model import TreeMixin


class Category(IDMixin, TimestampMixin, SoftDeleteMixin, CreatorMixin, TreeMixin, Base):
    __tablename__ = "categories"
    name = Column(String(200), nullable=False)
    code = Column(String(50), nullable=True, unique=True)
    description = Column(Text, nullable=True)
    icon = Column(String(500), nullable=True)

