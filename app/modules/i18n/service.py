"""i18n service — load YAML translation files, provide t() helper."""
from __future__ import annotations
from pathlib import Path
from functools import lru_cache
from typing import Dict
import yaml

I18N_DIR = Path(__file__).resolve().parent.parent.parent.parent / "config" / "i18n"
_cache: Dict[str, Dict[str, str]] = {}


def _load_lang(lang: str) -> Dict[str, str]:
    if lang not in _cache:
        path = I18N_DIR / f"{lang}.yaml"
        if path.exists():
            with open(path, "r", encoding="utf-8") as f:
                _cache[lang] = yaml.safe_load(f) or {}
        else:
            _cache[lang] = {}
    return _cache[lang]


def t(key: str, lang: str = "zh") -> str:
    translations = _load_lang(lang)
    return translations.get(key, key)


def get_all_translations(lang: str = "zh") -> Dict[str, str]:
    return _load_lang(lang)


def available_languages() -> list[str]:
    return [p.stem for p in I18N_DIR.glob("*.yaml")]


class Translator:
    def __init__(self, lang: str = "zh"):
        self.lang = lang

    def __call__(self, key: str) -> str:
        return t(key, self.lang)


def get_translator(lang: str = "zh") -> Translator:
    return Translator(lang)

