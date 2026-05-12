from sqlalchemy import Column, String, Integer, Text, ForeignKey
from app.database import Base
from app.common.base_model import IDMixin, TimestampMixin, SoftDeleteMixin


class NumberingRule(IDMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "numbering_rules"
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True, index=True,
                         comment="When set, rule binds to product secondary category")
    category_code = Column(String(50), unique=True, nullable=False, comment="e.g. QZ, CF, 3C, MY")
    prefix = Column(String(50), nullable=False)
    current_seq = Column(Integer, default=0)
    padding = Column(Integer, default=3, comment="Zero-padding width")
    description = Column(String(300), nullable=True)


class NumberingDerivative(IDMixin, TimestampMixin, Base):
    __tablename__ = "numbering_derivatives"
    suffix = Column(String(50), nullable=False, comment="e.g. _Effect, _AMZ, _FB")
    label = Column(String(100), nullable=False, comment="Display name")
    description = Column(String(300), nullable=True)

