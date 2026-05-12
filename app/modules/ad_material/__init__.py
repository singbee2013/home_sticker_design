from fastapi import FastAPI
from .routes import router

def register_routes(app: FastAPI) -> None:
    app.include_router(router, prefix="/api/ad-material", tags=["ad_material"])

