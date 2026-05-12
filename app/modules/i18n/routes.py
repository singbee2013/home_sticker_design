from fastapi import APIRouter
from . import service

router = APIRouter()


@router.get("/languages")
def languages():
    return {"languages": service.available_languages()}


@router.get("/translations/{lang}")
def translations(lang: str = "zh"):
    return service.get_all_translations(lang)

