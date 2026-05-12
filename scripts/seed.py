"""Seed initial data — categories, styles, scenes, effects, numbering rules."""
from __future__ import annotations
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal, Base, engine
from app.modules.auth.service import ensure_superadmin
from app.modules.category.service import create_category
from app.modules.style.service import create_style
from app.modules.scene.service import create_scene_category
from app.modules.effect.service import create_effect_category
from app.modules.numbering.service import get_or_create_rule, create_derivative

# Ensure tables
Base.metadata.create_all(bind=engine)
db = SessionLocal()

# ===== Admin =====
ensure_superadmin(db)
print("✅ Admin user ensured (admin / admin123)")

# ===== Categories =====
CATEGORIES = [
    ("家居装饰类贴纸", "QZ"),
    ("3C 数码类贴纸", "3C"),
    ("交通工具类贴纸", "JT"),
    ("沐浴清洁类产品", "MY"),
]
for name, code in CATEGORIES:
    try:
        create_category(db, name=name, code=code)
    except Exception:
        db.rollback()
print("✅ Categories seeded")

# ===== Styles =====
STYLES = [
    ("北欧简约风", "Nordic minimalist style, clean lines, muted colors"),
    ("现代轻奢风", "Modern luxury style, elegant, gold accents"),
    ("复古美式风", "Vintage American style, retro colors, classic patterns"),
    ("田园小清新风", "Pastoral fresh style, floral, soft pastel"),
    ("日系和风", "Japanese Wa style, zen, traditional patterns"),
    ("国潮中国风", "Chinese Guochao style, traditional Chinese elements, bold colors"),
    ("摩洛哥民族风", "Moroccan ethnic style, geometric, vibrant tiles"),
    ("INS 网红风", "Instagram trendy style, aesthetic, modern"),
    ("工业极简风", "Industrial minimalist, concrete, metal, raw"),
    ("卡通童趣风", "Cartoon playful style, cute characters, bright colors"),
    ("科技未来风", "Sci-fi futuristic style, neon, tech elements"),
    ("轻奢鎏金风", "Light luxury gilt style, gold leaf, premium"),
    ("水墨国风", "Chinese ink painting style, brush strokes, monochrome"),
    ("波西米亚风", "Bohemian style, free-spirited, colorful textiles"),
    ("低饱和高级风", "Desaturated premium style, muted tones, sophisticated"),
]
for name, prompt in STYLES:
    try:
        create_style(db, name=name, prompt_snippet=prompt)
    except Exception:
        db.rollback()
print("✅ Styles seeded")

# ===== Scene categories =====
SCENES = {
    "家居场景": ["墙纸/墙贴场景", "厨房贴场景", "窗贴场景", "马桶贴/浴室贴场景",
                "冰箱贴/家电贴场景", "柜门贴/改色膜场景", "地板贴场景", "楼梯贴场景", "全屋整体场景"],
    "3C 数码场景": ["游戏机设备场景", "笔记本/平板场景", "无人机设备场景", "吹风机/美容家电场景",
                   "充电头/数码配件场景", "相机/摄影设备场景", "手写笔/配件场景", "信用卡/饰品场景",
                   "电子烟/小电器场景", "通用 3C 白底场景"],
    "交通工具场景": ["汽车车身/内饰场景", "摩托车外观场景", "自行车场景", "电动车/滑板车场景"],
    "沐浴清洁类场景": ["浴室使用场景", "洗漱台场景", "沐浴产品展示场景"],
}
for parent_name, children in SCENES.items():
    try:
        p = create_scene_category(db, name=parent_name)
        for child in children:
            try:
                create_scene_category(db, name=child, parent_id=p.id)
            except Exception:
                db.rollback()
    except Exception:
        db.rollback()
print("✅ Scene categories seeded")

# ===== Effect categories =====
EFFECTS = ["家居装饰效果图", "3C 数码效果图", "交通工具效果图", "沐浴清洁类效果图"]
for name in EFFECTS:
    try:
        create_effect_category(db, name=name)
    except Exception:
        db.rollback()
print("✅ Effect categories seeded")

# ===== Numbering rules =====
RULES = [("QZ", "QZ"), ("CF", "CF"), ("3C", "3C"), ("MY", "MY")]
for code, prefix in RULES:
    get_or_create_rule(db, code, prefix)

DERIVS = [("_Effect", "效果图"), ("_AMZ", "亚马逊"), ("_FB", "Facebook"),
          ("_Temu", "Temu"), ("_SHEIN", "SHEIN"), ("_TTS", "TikTok Shop")]
for suffix, label in DERIVS:
    try:
        create_derivative(db, suffix, label)
    except Exception:
        db.rollback()
print("✅ Numbering rules & derivatives seeded")

db.close()
print("\n🎉 All seed data loaded successfully!")

