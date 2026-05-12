from fastapi import FastAPI
from .service import get_translator
from .routes import router

def register_routes(app: FastAPI) -> None:
    app.include_router(router, prefix="/api/i18n", tags=["i18n"])

