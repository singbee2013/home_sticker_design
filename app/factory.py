"""FastAPI application factory."""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import get_settings
from app.database import Base, engine
from app.db_migrate import apply_sqlite_migrations
from app.plugin import register_all_modules


def _import_all_models():
    """Import all models so Base.metadata knows about them."""
    from app.modules.auth import models as _1
    from app.modules.category import models as _2
    from app.modules.style import models as _3
    from app.modules.scene import models as _4
    from app.modules.effect import models as _5
    from app.modules.numbering import models as _6
    from app.modules.ai_engine import models as _7
    from app.modules.platform_suite import models as _8
    from app.modules.ad_material import models as _9
    from app.modules.video import models as _10


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(title=settings.APP_NAME, version=settings.VERSION, debug=settings.DEBUG)

    @application.api_route("/api/health", methods=["GET", "HEAD"])
    async def _health_probe(req: Request):
        """Cheap liveness probe — no DB; use for Docker/nginx/upstream checks."""
        h = {"Cache-Control": "no-store"}
        if req.method == "HEAD":
            return Response(status_code=200, headers=h)
        return JSONResponse({"status": "ok"}, headers=h)

    _import_all_models()

    # Create all tables
    Base.metadata.create_all(bind=engine)
    apply_sqlite_migrations(engine)

    # CORS — allow Vue dev server (Vite default 5173) and same-origin
    application.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173",
                       "http://localhost:8080", "http://127.0.0.1:8080"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Static files (uploads / generated)
    application.mount("/static", StaticFiles(directory=settings.STORAGE_LOCAL_PATH), name="static")

    # Register all API modules
    register_all_modules(application)

    return application


_SPA_INDEX_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
}


def mount_spa(application: FastAPI) -> bool:
    """Mount the built Vue3 SPA from ``web/dist`` (no-op if not built).

    Implementation note: we hook into the 404 exception handler instead of
    registering a `{full_path:path}` route. A catch-all route would shadow
    FastAPI's automatic trailing-slash redirect (e.g. /api/styles → /api/styles/),
    causing real API endpoints to appear as 404.
    """
    web_dist = Path(__file__).resolve().parent.parent / "web" / "dist"
    if not web_dist.exists():
        return False

    assets_dir = web_dist / "assets"
    if assets_dir.exists():
        application.mount("/assets", StaticFiles(directory=assets_dir), name="spa-assets")

    index_html = web_dist / "index.html"
    reserved_prefixes = ("/api/", "/static/", "/assets/", "/docs", "/redoc",
                         "/openapi.json")

    @application.get("/")
    async def _spa_index_root():
        """Serve SPA shell; disable caching so browsers always fetch fresh chunk URLs."""
        return FileResponse(index_html, headers=dict(_SPA_INDEX_HEADERS))

    @application.head("/")
    async def _spa_index_root_head():
        """Some proxies/CDNs probe with HEAD; mirror cache headers without a body."""
        return Response(status_code=200, headers=dict(_SPA_INDEX_HEADERS), media_type="text/html")

    @application.exception_handler(StarletteHTTPException)
    async def _spa_404_fallback(request, exc: StarletteHTTPException):
        # Only intercept 404s on GET/HEAD that don't target API/static/etc.
        path = request.url.path
        if (
            exc.status_code == 404
            and request.method in ("GET", "HEAD")
            and not any(path.startswith(p) for p in reserved_prefixes)
        ):
            # Serve a real file (favicon, manifest, etc.) when present
            rel = path.lstrip("/")
            if rel:
                candidate = web_dist / rel
                if candidate.is_file():
                    # FileResponse handles HEAD (no body) with correct headers.
                    return FileResponse(candidate, headers=dict(_SPA_INDEX_HEADERS))
            if request.method == "HEAD":
                return Response(
                    status_code=200,
                    media_type="text/html",
                    headers=dict(_SPA_INDEX_HEADERS),
                )
            return FileResponse(index_html, headers=dict(_SPA_INDEX_HEADERS))
        # Default behaviour for everything else
        return JSONResponse({"detail": exc.detail}, status_code=exc.status_code,
                            headers=getattr(exc, "headers", None))

    return True

