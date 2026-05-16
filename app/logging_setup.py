"""Application logging — console + rotating files under LOG_DIR."""
from __future__ import annotations

import logging
import os
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

from app.config import PROJECT_ROOT

_CONFIGURED = False


def log_directory() -> Path:
    raw = os.getenv("LOG_DIR", "").strip()
    if raw:
        return Path(raw).expanduser().resolve()
    return (PROJECT_ROOT / "logs").resolve()


def setup_logging() -> Path:
    """Configure root + uvicorn loggers. Safe to call multiple times."""
    global _CONFIGURED
    log_root = log_directory()
    backend_dir = log_root / "backend"
    backend_dir.mkdir(parents=True, exist_ok=True)
    app_log = backend_dir / "app.log"
    access_log = backend_dir / "access.log"

    if _CONFIGURED:
        return log_root

    level_name = os.getenv("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    fmt = logging.Formatter(
        "%(asctime)s %(levelname)s [%(name)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    root = logging.getLogger()
    root.setLevel(level)
    if not any(isinstance(h, RotatingFileHandler) for h in root.handlers):
        fh = RotatingFileHandler(
            app_log,
            maxBytes=int(os.getenv("LOG_MAX_BYTES", str(20 * 1024 * 1024))),
            backupCount=int(os.getenv("LOG_BACKUP_COUNT", "5")),
            encoding="utf-8",
        )
        fh.setFormatter(fmt)
        root.addHandler(fh)

    if not any(isinstance(h, logging.StreamHandler) for h in root.handlers):
        sh = logging.StreamHandler(sys.stdout)
        sh.setFormatter(fmt)
        root.addHandler(sh)

    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        lg = logging.getLogger(name)
        lg.setLevel(level)
        if name == "uvicorn.access":
            if not any(isinstance(h, RotatingFileHandler) for h in lg.handlers):
                ah = RotatingFileHandler(
                    access_log,
                    maxBytes=int(os.getenv("LOG_MAX_BYTES", str(20 * 1024 * 1024))),
                    backupCount=int(os.getenv("LOG_BACKUP_COUNT", "5")),
                    encoding="utf-8",
                )
                ah.setFormatter(fmt)
                lg.addHandler(ah)
        elif not lg.handlers:
            lg.propagate = True

    _CONFIGURED = True
    logging.getLogger(__name__).info("logging initialized log_root=%s", log_root)
    return log_root
