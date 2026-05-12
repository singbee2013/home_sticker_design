"""SQLAlchemy engine, session factory, and declarative Base."""
from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import get_settings

settings = get_settings()

# Ensure data directory exists for SQLite
_db_url = settings.DATABASE_URL
_is_sqlite = "sqlite" in _db_url
if _db_url.startswith("sqlite"):
    _db_path = _db_url.replace("sqlite:///", "")
    Path(_db_path).parent.mkdir(parents=True, exist_ok=True)

_sqlite_connect_args = {"check_same_thread": False, "timeout": 30.0}

engine = create_engine(
    _db_url,
    connect_args=_sqlite_connect_args if _is_sqlite else {},
    echo=settings.DEBUG,
    pool_pre_ping=True,
)


@event.listens_for(engine, "connect")
def _sqlite_setup(dbapi_conn, connection_record):
    """WAL + busy timeout — avoids 'database is locked' crashes under concurrent AI tasks."""
    if not _is_sqlite:
        return
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA busy_timeout=30000")
    cur.execute("PRAGMA synchronous=NORMAL")
    cur.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass

