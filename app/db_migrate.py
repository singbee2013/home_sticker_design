"""Lightweight SQLite column migrations (create_all does not ALTER tables)."""
from __future__ import annotations

from sqlalchemy import Engine, text


def apply_sqlite_migrations(engine: Engine) -> None:
    if "sqlite" not in str(engine.url):
        return

    def cols(table: str) -> set[str]:
        with engine.connect() as conn:
            rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
            return {r[1] for r in rows}

    def alter(table: str, ddl: str) -> None:
        with engine.begin() as conn:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {ddl}"))

    try:
        c_gt = cols("generation_tasks")
        if "is_deleted" not in c_gt:
            alter("generation_tasks", "is_deleted BOOLEAN DEFAULT 0 NOT NULL")
    except Exception:
        pass

    try:
        c_si = cols("scene_images")
        if "prompt_used" not in c_si:
            alter("scene_images", "prompt_used TEXT")
        if "source_kind" not in c_si:
            alter("scene_images", "source_kind VARCHAR(20) DEFAULT 'upload'")
    except Exception:
        pass

    try:
        c_ei = cols("effect_images")
        if "prompt_used" not in c_ei:
            alter("effect_images", "prompt_used TEXT")
    except Exception:
        pass

    try:
        c_nr = cols("numbering_rules")
        if "category_id" not in c_nr:
            alter("numbering_rules", "category_id INTEGER")
    except Exception:
        pass

    try:
        c_ps = cols("platform_suites")
        if "product_description" not in c_ps:
            alter("platform_suites", "product_description TEXT")
        if "dimensions_spec" not in c_ps:
            alter("platform_suites", "dimensions_spec TEXT")
        if "error_message" not in c_ps:
            alter("platform_suites", "error_message TEXT")
    except Exception:
        pass
