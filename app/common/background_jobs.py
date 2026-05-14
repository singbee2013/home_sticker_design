"""Run long synchronous jobs off the ASGI event loop.

FastAPI/Starlette ``BackgroundTasks`` invoke sync callables on the same asyncio
event loop after the response is sent — a minutes-long AI job blocks **all**
HTTP traffic (including ``/api/health``), which triggers external watchdogs and
Nginx 502. Use a daemon thread instead.
"""
from __future__ import annotations

import threading
from typing import Any, Callable, Tuple


def spawn_daemon_thread(target: Callable[..., Any], args: Tuple[Any, ...] = (), *, name: str | None = None) -> None:
    t = threading.Thread(target=target, args=args, daemon=True, name=name)
    t.start()
