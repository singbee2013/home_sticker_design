"""Main entrypoint — FastAPI + Vue3 SPA single-process server."""
from app.logging_setup import setup_logging

setup_logging()

from app.factory import create_app, mount_spa
from app.database import SessionLocal
from app.modules.auth.service import ensure_superadmin
from app.modules.category.service import ensure_default_categories
from app.modules.style.service import ensure_default_styles
from app.modules.scene.service import ensure_default_scene_categories
from app.modules.effect.service import ensure_default_effect_categories

app = create_app()

# Default admin
db = SessionLocal()
try:
    ensure_superadmin(db)
    ensure_default_categories(db)
    ensure_default_styles(db)
    ensure_default_scene_categories(db)
    ensure_default_effect_categories(db)
finally:
    db.close()

# Vue3 SPA catch-all (must be the LAST route registered)
mounted = mount_spa(app)
if not mounted:
    print("[main] WARNING: web/dist not found — run `npm --prefix web run build` first.")

if __name__ == "__main__":
    import uvicorn
    from app.config import get_settings
    s = get_settings()
    uvicorn.run("main:app", host=s.HOST, port=s.PORT, reload=False)
