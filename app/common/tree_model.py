"""Generic adjacency-list tree mixin for unlimited nesting."""
from __future__ import annotations

from sqlalchemy import Column, Integer, String, ForeignKey


class TreeMixin:
    """Add parent_id and path for hierarchical structures."""
    parent_id = Column(Integer, nullable=True, index=True)
    path = Column(String(500), nullable=True, comment="Materialized path e.g. /1/3/7")
    level = Column(Integer, default=0)
    sort_order = Column(Integer, default=0)

