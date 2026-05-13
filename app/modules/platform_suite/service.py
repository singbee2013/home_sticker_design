"""Platform suite — AI-guided listing assets + resize to platform specs."""
from __future__ import annotations

import io
import logging
import os
import re
import uuid
from typing import List

from PIL import Image, ImageDraw, ImageFont
from sqlalchemy.orm import Session

from app.common.precise_attach import (
    build_precise_attach_hint,
    prepare_material_for_precise_attach,
    prepare_material_with_repeat_target,
)
from app.common.roll_product_spec import (
    ROLL_CORE_AI_PROMPT_EN,
    ROLL_CORE_HERO_SCALE_EN,
    ROLL_CORE_PATTERN_DIRECTION_EN,
)
from app.config import get_settings
from app.common.storage import get_storage
from .models import PlatformSuite, SuiteImage
from app.modules.scene.models import SceneImage

_log = logging.getLogger(__name__)


def _provider_retry_chain(requested: str | None, available: list[str]) -> list[str]:
    order: list[str] = []
    for name in [requested, "gemini", "wanxiang", "siliconflow"]:
        if name and name in available and name not in order:
            order.append(name)
    return order


def _listing_image_with_retry(ai_service, provider_chain: list[str], source_bytes: bytes, instruction: str, allow_text: bool):
    last_err = ""
    for pname in provider_chain:
        prov = ai_service.get_provider(pname)
        if not hasattr(prov, "listing_image_from_product"):
            continue
        try:
            raw = prov.listing_image_from_product(source_bytes, instruction, allow_text=allow_text)
            return raw, pname
        except Exception as e:
            last_err = f"{pname}: {e}"
            continue
    raise RuntimeError(last_err or "All listing providers failed")


def _composite_with_retry(ai_service, provider_chain: list[str], material_bytes: bytes, scene_bytes: bytes, hint: str):
    last_err = ""
    for pname in provider_chain:
        prov = ai_service.get_provider(pname)
        if not hasattr(prov, "composite_product_on_scene"):
            continue
        try:
            raw = prov.composite_product_on_scene(material_bytes, scene_bytes, placement_hint=hint)
            return raw, pname
        except Exception as e:
            last_err = f"{pname}: {e}"
            continue
    raise RuntimeError(last_err or "All providers failed for scene composite")


def get_platform_spec(platform_code: str) -> dict:
    platforms = get_settings().platforms
    spec = platforms.get(platform_code)
    if not spec:
        raise ValueError(f"Unknown platform: {platform_code}. Available: {list(platforms.keys())}")
    return spec


def list_platforms() -> dict:
    return get_settings().platforms


def create_suite(
    db: Session,
    platform_code: str,
    created_by: str | None = None,
    source_image_id: int | None = None,
    material_number: str | None = None,
    title: str | None = None,
    product_description: str | None = None,
    dimensions_spec: str | None = None,
) -> PlatformSuite:
    suite = PlatformSuite(
        platform_code=platform_code,
        created_by=created_by,
        source_image_id=source_image_id,
        material_number=material_number,
        title=title,
        product_description=product_description,
        dimensions_spec=dimensions_spec,
        status="pending",
    )
    db.add(suite)
    db.commit()
    db.refresh(suite)
    return suite


def _pil_format(spec_fmt: str) -> str:
    f = (spec_fmt or "PNG").upper()
    return "JPEG" if f == "JPEG" else "PNG"


def _ascii_text(v: str) -> str:
    text = (v or "").strip()
    text = re.sub(r"[^\x20-\x7E]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def resize_and_save(image_bytes: bytes, width: int, height: int, fmt: str = "PNG") -> bytes:
    img = Image.open(io.BytesIO(image_bytes))
    fmt_u = fmt.upper()
    # Always export opaque output to avoid "see-through preview" artifacts.
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    img = img.resize((width, height), Image.LANCZOS)
    opaque = Image.new("RGBA", img.size, (255, 255, 255, 255))
    opaque.alpha_composite(img)
    img = opaque.convert("RGB" if fmt_u == "JPEG" else "RGBA")
    buf = io.BytesIO()
    img.save(buf, format=fmt_u)
    return buf.getvalue()


def _blend_texture_reference(material_bytes: bytes, texture_bytes: bytes | None) -> bytes:
    if not texture_bytes:
        return material_bytes
    base = Image.open(io.BytesIO(material_bytes)).convert("RGB")
    tex = Image.open(io.BytesIO(texture_bytes)).convert("RGB")
    w, h = base.size
    tex_h = max(80, int(h * 0.28))
    tex_w = max(80, int(w * 0.28))
    tex = tex.resize((tex_w, tex_h), Image.LANCZOS)
    canvas = Image.new("RGB", (w, h), (255, 255, 255))
    canvas.paste(base, (0, 0))
    # Put texture swatch at bottom-right as a visual material reference for AI.
    x = max(8, w - tex_w - 12)
    y = max(8, h - tex_h - 12)
    canvas.paste(tex, (x, y))
    out = io.BytesIO()
    canvas.save(out, format="PNG")
    return out.getvalue()


def _extract_thickness_mm(dims_text: str) -> float | None:
    m = re.search(r"Thickness:\s*([0-9]+(?:\.[0-9]+)?)\s*mm", dims_text or "", re.I)
    if not m:
        return None
    try:
        return float(m.group(1))
    except Exception:
        return None


def _load_chart_font(size: int, prefer_bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates: list[tuple[str, int | None]] = []
    if prefer_bold:
        candidates.extend(
            [
                ("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", 0),
                ("/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttf", None),
                ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", None),
            ]
        )
    candidates.extend(
        [
            ("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", 0),
            ("/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttf", None),
            ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", None),
        ]
    )
    for path, idx in candidates:
        if not os.path.isfile(path):
            continue
        try:
            if idx is not None:
                return ImageFont.truetype(path, size=size, index=idx)
            return ImageFont.truetype(path, size=size)
        except Exception:
            continue
    return ImageFont.load_default()


def _paste_rotated_label(canvas: Image.Image, text: str, font: ImageFont.FreeTypeFont | ImageFont.ImageFont, xy: tuple[int, int], fill: tuple[int, int, int]) -> None:
    """Draw English label vertically (rotated 90° CCW) for LENGTH arrow."""
    fs = getattr(font, "size", 22) or 22
    tmp_w = max(420, int(len(text) * max(14, fs * 0.55)))
    tmp_h = max(44, fs + 14)
    tmp = Image.new("RGBA", (tmp_w, tmp_h), (0, 0, 0, 0))
    td = ImageDraw.Draw(tmp)
    td.text((4, 4), text, font=font, fill=fill + (255,))
    rot = tmp.rotate(90, expand=True)
    canvas.paste(rot, xy, rot)


def _draw_size_chart_image(
    source_image_bytes: bytes,
    out_w: int,
    out_h: int,
    product_w_cm: float,
    product_h_cm: float,
    tile_w_cm: float,
    tile_h_cm: float,
    thickness_mm: float | None,
) -> bytes:
    """Listing-oriented size diagram: large typography (cm + inch), pattern-forward layout."""
    bg = (245, 242, 235)
    canvas = Image.new("RGB", (out_w, out_h), bg)
    draw = ImageDraw.Draw(canvas)

    margin = max(14, out_w // 55)
    title_fs = max(26, min(56, out_w // 20))
    subtitle_fs = max(20, min(40, out_w // 26))
    dim_fs = max(18, min(36, out_w // 30))
    note_fs = max(15, min(28, out_w // 38))

    font_title = _load_chart_font(title_fs, True)
    font_sub = _load_chart_font(subtitle_fs, True)
    font_dim = _load_chart_font(dim_fs, True)
    font_note = _load_chart_font(note_fs, False)

    w_in = product_w_cm / 2.54
    h_in = product_h_cm / 2.54
    tile_win = tile_w_cm / 2.54
    tile_hin = tile_h_cm / 2.54

    y = margin
    draw.text((margin, y), "PRODUCT DIMENSIONS", fill=(22, 22, 22), font=font_title)
    y += title_fs + 10
    draw.text((margin, y), f"{product_w_cm:g} cm × {product_h_cm:g} cm", fill=(35, 35, 35), font=font_sub)
    y += subtitle_fs + 6
    draw.text((margin, y), f"{w_in:.2f} inch × {h_in:.2f} inch", fill=(35, 35, 35), font=font_sub)
    y += subtitle_fs + 14

    panel_bottom = out_h - margin - max(72, out_h // 10)
    swatch_col_w = max(120, int(out_w * 0.27))
    gap = max(10, margin // 2)
    chart_x1 = margin + dim_fs + max(28, dim_fs)
    chart_y1 = y
    chart_x2 = out_w - margin - swatch_col_w - gap
    chart_y2 = panel_bottom
    cw = max(40, chart_x2 - chart_x1)
    ch = max(40, chart_y2 - chart_y1)

    try:
        pat = Image.open(io.BytesIO(source_image_bytes)).convert("RGB")
        tile_px_h = max(32, int(ch / 5))
        tile_px_w = max(32, int(tile_px_h * (tile_w_cm / max(tile_h_cm, 0.01))))
        pat_r = pat.resize((tile_px_w, tile_px_h), Image.LANCZOS)
        layer = Image.new("RGB", (cw, ch), (255, 255, 255))
        for yy in range(0, ch + tile_px_h, tile_px_h):
            for xx in range(0, cw + tile_px_w, tile_px_w):
                layer.paste(pat_r, (xx, yy))
        canvas.paste(layer, (chart_x1, chart_y1))
    except Exception:
        draw.rectangle([chart_x1, chart_y1, chart_x2, chart_y2], fill=(255, 255, 255), outline=(130, 130, 130), width=2)

    frame_col = (45, 45, 45)
    lw = max(2, min(5, out_w // 400))
    draw.rectangle([chart_x1, chart_y1, chart_x2, chart_y2], outline=frame_col, width=lw)

    vert_name = "LENGTH" if product_h_cm >= product_w_cm * 1.45 else "HEIGHT"
    dim_gap = dim_fs + max(18, dim_fs // 2)
    arrow_w = max(3, dim_fs // 7)
    tip = max(10, dim_fs // 2)

    top_line_y = chart_y1 - dim_gap // 2
    draw.line([(chart_x1, top_line_y), (chart_x2, top_line_y)], fill=frame_col, width=arrow_w)
    draw.polygon(
        [(chart_x1 - tip, top_line_y), (chart_x1, top_line_y - tip // 2), (chart_x1, top_line_y + tip // 2)],
        fill=frame_col,
    )
    draw.polygon(
        [(chart_x2 + tip, top_line_y), (chart_x2, top_line_y - tip // 2), (chart_x2, top_line_y + tip // 2)],
        fill=frame_col,
    )
    w_line = f"WIDTH  {product_w_cm:g} cm   ({w_in:.2f} in)"
    bbox = draw.textbbox((0, 0), w_line, font=font_dim)
    tw = bbox[2] - bbox[0]
    draw.text((chart_x1 + max(0, (cw - tw) // 2), top_line_y - dim_fs - 8), w_line, fill=(18, 18, 18), font=font_dim)

    left_line_x = chart_x1 - dim_gap // 2
    draw.line([(left_line_x, chart_y1), (left_line_x, chart_y2)], fill=frame_col, width=arrow_w)
    draw.polygon(
        [(left_line_x, chart_y1 - tip), (left_line_x - tip // 2, chart_y1), (left_line_x + tip // 2, chart_y1)],
        fill=frame_col,
    )
    draw.polygon(
        [(left_line_x, chart_y2 + tip), (left_line_x - tip // 2, chart_y2), (left_line_x + tip // 2, chart_y2)],
        fill=frame_col,
    )
    v_line = f"{vert_name}  {product_h_cm:g} cm   ({h_in:.2f} in)"
    paste_x = max(margin, left_line_x - dim_fs - max(80, dim_fs * 4))
    paste_y = chart_y1 + max(0, (ch - dim_fs * len(v_line)) // 3)
    _paste_rotated_label(canvas, v_line, font_dim, (paste_x, paste_y), (18, 18, 18))

    if thickness_mm is not None:
        t_in = thickness_mm / 25.4
        th_txt = f"THICKNESS  {thickness_mm:g} mm   ({t_in:.3f} in)"
        draw.text((chart_x1, chart_y2 + 12), th_txt, fill=(40, 40, 40), font=font_note)

    sx0 = chart_x2 + gap
    swatch_max = min(swatch_col_w - 12, ch - title_fs)
    swatch_size = max(100, swatch_max)
    sy0 = chart_y1 + 6
    try:
        tile_img = Image.open(io.BytesIO(source_image_bytes)).convert("RGB")
        tile_img = tile_img.resize((swatch_size, swatch_size), Image.LANCZOS)
        canvas.paste(tile_img, (sx0, sy0))
        draw.rectangle([sx0, sy0, sx0 + swatch_size, sy0 + swatch_size], outline=(70, 70, 70), width=2)
    except Exception:
        pass

    ry = sy0 + swatch_size + 10
    draw.text((sx0, ry), "REPEAT UNIT", fill=(22, 22, 22), font=font_dim)
    ry += dim_fs + 4
    draw.text((sx0, ry), f"{tile_w_cm:g} × {tile_h_cm:g} cm", fill=(35, 35, 35), font=font_note)
    ry += note_fs + 4
    draw.text((sx0, ry), f"{tile_win:.2f} × {tile_hin:.2f} in", fill=(35, 35, 35), font=font_note)
    ry += note_fs + 6
    draw.text((sx0, ry), "Tiles infinitely at this unit.", fill=(90, 85, 78), font=font_note)

    band_top = panel_bottom + 10
    band_h = out_h - band_top - margin
    try:
        pat = Image.open(io.BytesIO(source_image_bytes)).convert("RGB")
        tile_h_px = max(36, min(band_h - 8, int(out_h * 0.065)))
        tile_w_px = max(36, int(tile_h_px * (tile_w_cm / max(tile_h_cm, 0.01))))
        pat = pat.resize((tile_w_px, tile_h_px), Image.LANCZOS)
        strip_w = out_w - 2 * margin
        strip = Image.new("RGB", (strip_w, tile_h_px), (255, 255, 255))
        x = 0
        while x < strip.width:
            strip.paste(pat, (x, 0))
            x += tile_w_px
        paste_y = band_top + max(0, (band_h - tile_h_px) // 2)
        canvas.paste(strip, (margin, paste_y))
        draw.rectangle([margin, paste_y, out_w - margin, paste_y + tile_h_px], outline=(120, 115, 105), width=1)
        band_txt = "ROLL / STRIP PREVIEW (pattern repeat along length)"
        bb = draw.textbbox((0, 0), band_txt, font=font_note)
        btw = bb[2] - bb[0]
        draw.text((margin + max(0, (strip_w - btw) // 2), paste_y - note_fs - 4), band_txt, fill=(55, 52, 48), font=font_note)
    except Exception:
        pass

    out = io.BytesIO()
    canvas.save(out, format="JPEG", quality=93)
    return out.getvalue()


def generate_suite_images_resize_only(db: Session, suite: PlatformSuite, source_image_bytes: bytes) -> PlatformSuite:
    """Legacy: only resize source into platform slots."""
    spec = get_platform_spec(suite.platform_code)
    storage = get_storage()
    main_w, main_h = spec["main_image_size"]
    sec_w, sec_h = spec["secondary_image_size"]
    pil_fmt = "JPEG"
    ext = "jpg"

    main_bytes = resize_and_save(source_image_bytes, main_w, main_h, pil_fmt)
    path = storage.save(io.BytesIO(main_bytes), f"suites/{suite.id}", f"main.{ext}")
    db.add(
        SuiteImage(
            suite_id=suite.id,
            image_type="main",
            file_path=path,
            width=main_w,
            height=main_h,
            sort_order=0,
        )
    )

    for i in range(spec.get("secondary_image_count", 5)):
        sec_bytes = resize_and_save(source_image_bytes, sec_w, sec_h, pil_fmt)
        path = storage.save(io.BytesIO(sec_bytes), f"suites/{suite.id}", f"secondary_{i+1}.{ext}")
        db.add(
            SuiteImage(
                suite_id=suite.id,
                image_type="secondary",
                file_path=path,
                width=sec_w,
                height=sec_h,
                sort_order=i + 1,
            )
        )

    suite.status = "done"
    suite.error_message = None
    db.commit()
    db.refresh(suite)
    return suite


def generate_suite_images_ai(
    db: Session,
    suite: PlatformSuite,
    source_image_bytes: bytes,
    texture_bytes: bytes | None = None,
    provider_name: str = "gemini",
    output_count: int | None = None,
    main_image_count: int | None = None,
    detail_image_count: int | None = None,
    scene_category_id: int | None = None,
    precise_attach_enabled: bool = False,
    keep_pattern_scale: bool = True,
    pattern_scale_percent: int = 100,
    product_width_cm: float | None = None,
    product_height_cm: float | None = None,
    tile_width_cm: float | None = None,
    tile_height_cm: float | None = None,
    target_surface_width_cm: float | None = None,
    target_surface_height_cm: float | None = None,
    generation_mode: str = "balanced",
    strict_attach_mode: bool = False,
) -> PlatformSuite:
    """Gemini variants for CTR / conversion / size / detail, resized to platform pixels."""
    from app.modules.ai_engine import service as ai_service

    available = ai_service.list_providers()
    provider_chain = _provider_retry_chain(provider_name, available)
    if not provider_chain:
        raise ValueError("No available provider for suite generation")
    spec = get_platform_spec(suite.platform_code)
    storage = get_storage()
    main_w, main_h = spec["main_image_size"]
    sec_w, sec_h = spec["secondary_image_size"]
    pil_fmt = "JPEG"
    ext = "jpg"

    desc = _ascii_text(suite.product_description or "")
    dims = _ascii_text(suite.dimensions_spec or "")
    precise_hint = ""
    source_for_ai = source_image_bytes
    source_for_ai = _blend_texture_reference(source_for_ai, texture_bytes)
    if precise_attach_enabled:
        source_for_ai = prepare_material_for_precise_attach(
            source_image_bytes,
            pattern_scale_percent=pattern_scale_percent,
            keep_pattern_scale=keep_pattern_scale,
        )
        if tile_width_cm and tile_height_cm and target_surface_width_cm and target_surface_height_cm:
            source_for_ai = prepare_material_with_repeat_target(
                source_for_ai,
                repeats_x=max(1.0, target_surface_width_cm / max(tile_width_cm, 0.1)),
                repeats_y=max(1.0, target_surface_height_cm / max(tile_height_cm, 0.1)),
                keep_pattern_scale=keep_pattern_scale,
            )
        precise_hint = build_precise_attach_hint(
            keep_pattern_scale=keep_pattern_scale,
            pattern_scale_percent=pattern_scale_percent,
            product_width_cm=product_width_cm,
            product_height_cm=product_height_cm,
            tile_width_cm=tile_width_cm,
            tile_height_cm=tile_height_cm,
            target_surface_width_cm=target_surface_width_cm,
            target_surface_height_cm=target_surface_height_cm,
        )

    default_total = 1 + int(spec.get("secondary_image_count", 5))
    requested_main = max(1, int(main_image_count or 1))
    requested_detail = max(0, int(detail_image_count or 0))
    if main_image_count is not None or detail_image_count is not None:
        main_count = requested_main
        detail_count = requested_detail
        target_total = min(max(main_count + detail_count, 1), 12)
    else:
        target_total = max(default_total, min(output_count or default_total, 12))
        main_count = max(1, min(requested_main, target_total))
        detail_count = max(0, target_total - main_count)

    mode = (generation_mode or "balanced").strip().lower()
    if mode not in {"conservative", "balanced", "aggressive"}:
        mode = "balanced"
    global_rules = (
        "ENFORCE: output must not contain Chinese characters, random symbols, gibberish words, watermarks, logos, "
        "or any decorative text overlays."
    )
    mode_rules = {
        "conservative": "Prefer clean white/neutral backgrounds and clear product readability. Minimize bold creative composition.",
        "balanced": "Balance conversion clarity and lifestyle appeal, keep composition stable and premium.",
        "aggressive": "Use stronger visual storytelling and high-contrast premium compositions while preserving readability.",
    }[mode]
    strict_rules = ""
    if strict_attach_mode:
        strict_rules = (
            "STRICT ATTACH MODE: wallpaper must be edge-to-edge seamless tiling over large visible target area; "
            "forbid single enlarged patch/decal effect; preserve existing wall decorations and furnishings with proper occlusion; "
            "do not cover paintings/frames."
        )
    roll_core_block = (
        f"{ROLL_CORE_AI_PROMPT_EN} {ROLL_CORE_PATTERN_DIRECTION_EN} {ROLL_CORE_HERO_SCALE_EN}"
    )
    chart_tile_w = float(tile_width_cm or 58)
    chart_tile_h = float(tile_height_cm or 58)
    size_chart_rules = (
        "Size chart must be production-grade for marketplace: clean white background, readable dark typography, "
        "high contrast ruler/arrow marks, and dimensions shown in BOTH cm and inch. "
        "Width and height numbers are mandatory and cannot be omitted."
    )
    if (suite.platform_code or "").lower() == "amazon":
        size_chart_rules += (
            " Follow Amazon detail-image quality bar: export-ready square composition, high legibility at thumbnail scale, "
            "clear hierarchy, no decorative clutter."
        )

    main_prompts: list[str] = [
        f"Create marketplace MAIN hero image #1. Photorealistic, premium lighting, product dominant, clean background. "
        f"STRICT no labels/badges/text. {global_rules} {mode_rules} {strict_rules} {roll_core_block} "
        f"Product story: {desc}. Dimensions context: {dims}.",
        f"Create marketplace MAIN hero image #2. Alternate angle for CTR, natural props only, product remains dominant. "
        f"STRICT no labels/badges/text. {global_rules} {mode_rules} {strict_rules} {roll_core_block} Product story: {desc}.",
        f"Create marketplace MAIN hero image #3. Strong lifestyle composition while product remains clear and central. "
        f"STRICT no labels/badges/text. Prefer a realistic interior wall application with seamless repeat across a broad area. "
        f"{global_rules} {mode_rules} {strict_rules} {roll_core_block} Product story: {desc}.",
        f"Create marketplace MAIN hero image #4. Emphasize texture quality and premium finish with realistic shadows. "
        f"STRICT no labels/badges/text. Prefer a second wall/floor application view with seamless repeat and realistic perspective. "
        f"{global_rules} {mode_rules} {strict_rules} {roll_core_block} Product story: {desc}.",
    ]
    detail_prompts: list[str] = [
        (
            "Create DETAIL size chart image for marketplace listing. "
            f"{size_chart_rules} Use ENGLISH only. Dimensions source: {dims}. "
            "Layout requirement: majority area must be measurement diagram (width/height arrows + numeric values), "
            f"show full product length strip clearly, and add one {chart_tile_w:g}cm × {chart_tile_h:g}cm repeat swatch labeled as repeat unit. "
            "Do NOT allocate large area to lifestyle room render in this size chart image. "
            f"Product story: {desc}. {global_rules} {mode_rules} {strict_rules}"
        ),
        f"Create DETAIL image showing installation/use scenario with realistic home context. "
        f"STRICT no labels/badges/text. {global_rules} {mode_rules} {strict_rules} {roll_core_block} Product story: {desc}.",
        f"Create DETAIL macro close-up image showing material texture and print fidelity. "
        f"STRICT no labels/badges/text. {global_rules} {mode_rules} {strict_rules} {roll_core_block} Product story: {desc}.",
        f"Create DETAIL image with scale reference against common objects. "
        f"STRICT no labels/badges/text. {global_rules} {mode_rules} {strict_rules} {roll_core_block} Dimensions context: {dims}.",
        f"Create DETAIL image for package composition and accessories using visual composition only. "
        f"STRICT no labels/badges/text. {global_rules} {mode_rules} {strict_rules} {roll_core_block} Product story: {desc}.",
    ]
    scene_rows: list[SceneImage] = []
    if scene_category_id:
        scene_rows = (
            db.query(SceneImage)
            .filter(SceneImage.scene_category_id == scene_category_id, SceneImage.is_deleted == False)
            .order_by(SceneImage.id.desc())
            .limit(30)
            .all()
        )

    sort_order = 0
    for i in range(main_count):
        instr = main_prompts[min(i, len(main_prompts) - 1)]
        if precise_hint:
            instr += f" Precise attach constraints: {precise_hint}"
        raw, used_provider = _listing_image_with_retry(
            ai_service, provider_chain, source_for_ai, instr, allow_text=False
        )
        img_bytes = resize_and_save(raw, main_w, main_h, pil_fmt)
        fname = f"main_{i+1}_{used_provider}_{uuid.uuid4().hex[:6]}.{ext}"
        path = storage.save(io.BytesIO(img_bytes), f"suites/{suite.id}", fname)
        db.add(
            SuiteImage(
                suite_id=suite.id,
                image_type="main",
                file_path=path,
                width=main_w,
                height=main_h,
                sort_order=sort_order,
            )
        )
        sort_order += 1

    for i in range(detail_count):
        instr = detail_prompts[min(i, len(detail_prompts) - 1)]
        if precise_hint:
            instr += f" Precise attach constraints: {precise_hint}"
        allow_text = i == 0
        if i == 0 and product_width_cm and product_height_cm and tile_width_cm and tile_height_cm:
            img_bytes = _draw_size_chart_image(
                source_image_bytes=source_for_ai,
                out_w=sec_w,
                out_h=sec_h,
                product_w_cm=product_width_cm,
                product_h_cm=product_height_cm,
                tile_w_cm=tile_width_cm,
                tile_h_cm=tile_height_cm,
                thickness_mm=_extract_thickness_mm(dims),
            )
            used_provider = "system"
            fname = f"detail_{i+1}_{used_provider}_{uuid.uuid4().hex[:6]}.{ext}"
            path = storage.save(io.BytesIO(img_bytes), f"suites/{suite.id}", fname)
            db.add(
                SuiteImage(
                    suite_id=suite.id,
                    image_type="detail",
                    file_path=path,
                    width=sec_w,
                    height=sec_h,
                    sort_order=sort_order,
                )
            )
            sort_order += 1
            continue
        # Scene category acts as direction hint; preserve autonomy by varying
        # scene composite ratio by strategy mode.
        use_scene_composite = i > 0 and bool(scene_rows) and (
            (mode == "conservative" and i % 4 == 1)
            or (mode == "balanced" and i % 2 == 1)
            or (mode == "aggressive")
        )
        if use_scene_composite:
            scene_row = scene_rows[(i - 1) % len(scene_rows)]
            try:
                scene_bytes = storage.read_bytes(scene_row.file_path)
            except FileNotFoundError:
                _log.warning(
                    "suite %s: scene image file missing (scene_image id=%s path=%s), fallback to listing-only",
                    suite.id,
                    scene_row.id,
                    scene_row.file_path,
                )
                raw, used_provider = _listing_image_with_retry(
                    ai_service, provider_chain, source_for_ai, instr, allow_text=allow_text
                )
            else:
                composite_hint = (
                    f"{instr} Render the wallpaper applied on realistic surface (wall/floor/kitchen as scene context), "
                    "not isolated product shot. Keep perspective and occlusion realistic. "
                    "Cover a substantial visible wall/floor area with seamless repeated pattern, never one enlarged patch. "
                    "Pattern repeat size must stay physically plausible for 58cm repeat unit (or provided repeat unit), "
                    "show multiple repeats across target wall."
                )
                raw, used_provider = _composite_with_retry(
                    ai_service, provider_chain, source_for_ai, scene_bytes, composite_hint
                )
        else:
            raw, used_provider = _listing_image_with_retry(
                ai_service, provider_chain, source_for_ai, instr, allow_text=allow_text
            )
        img_bytes = resize_and_save(raw, sec_w, sec_h, pil_fmt)
        fname = f"detail_{i+1}_{used_provider}_{uuid.uuid4().hex[:6]}.{ext}"
        path = storage.save(io.BytesIO(img_bytes), f"suites/{suite.id}", fname)
        db.add(
            SuiteImage(
                suite_id=suite.id,
                image_type="detail",
                file_path=path,
                width=sec_w,
                height=sec_h,
                sort_order=sort_order,
            )
        )
        sort_order += 1

    # Strictly honor requested main/detail counts; do not auto-fill extras.

    suite.status = "done"
    suite.error_message = None
    db.commit()
    db.refresh(suite)
    return suite


def generate_suite_images(
    db: Session,
    suite: PlatformSuite,
    source_image_bytes: bytes,
    texture_bytes: bytes | None = None,
    provider_name: str | None = None,
    output_count: int | None = None,
    main_image_count: int | None = None,
    detail_image_count: int | None = None,
    scene_category_id: int | None = None,
    precise_attach_enabled: bool = False,
    keep_pattern_scale: bool = True,
    pattern_scale_percent: int = 100,
    product_width_cm: float | None = None,
    product_height_cm: float | None = None,
    tile_width_cm: float | None = None,
    tile_height_cm: float | None = None,
    target_surface_width_cm: float | None = None,
    target_surface_height_cm: float | None = None,
    generation_mode: str = "balanced",
    strict_attach_mode: bool = False,
) -> PlatformSuite:
    if provider_name:
        return generate_suite_images_ai(
            db,
            suite,
            source_image_bytes,
            texture_bytes=texture_bytes,
            provider_name=provider_name,
            output_count=output_count,
            main_image_count=main_image_count,
            detail_image_count=detail_image_count,
            scene_category_id=scene_category_id,
            precise_attach_enabled=precise_attach_enabled,
            keep_pattern_scale=keep_pattern_scale,
            pattern_scale_percent=pattern_scale_percent,
            product_width_cm=product_width_cm,
            product_height_cm=product_height_cm,
            tile_width_cm=tile_width_cm,
            tile_height_cm=tile_height_cm,
            target_surface_width_cm=target_surface_width_cm,
            target_surface_height_cm=target_surface_height_cm,
            generation_mode=generation_mode,
            strict_attach_mode=strict_attach_mode,
        )
    if os.getenv("GEMINI_API_KEY", "").strip():
        return generate_suite_images_ai(
            db,
            suite,
            source_image_bytes,
            texture_bytes=texture_bytes,
            provider_name="gemini",
            output_count=output_count,
            main_image_count=main_image_count,
            detail_image_count=detail_image_count,
            scene_category_id=scene_category_id,
            precise_attach_enabled=precise_attach_enabled,
            keep_pattern_scale=keep_pattern_scale,
            pattern_scale_percent=pattern_scale_percent,
            product_width_cm=product_width_cm,
            product_height_cm=product_height_cm,
            tile_width_cm=tile_width_cm,
            tile_height_cm=tile_height_cm,
            target_surface_width_cm=target_surface_width_cm,
            target_surface_height_cm=target_surface_height_cm,
            generation_mode=generation_mode,
            strict_attach_mode=strict_attach_mode,
        )
    if os.getenv("SILICONFLOW_API_KEY", "").strip():
        return generate_suite_images_ai(
            db,
            suite,
            source_image_bytes,
            texture_bytes=texture_bytes,
            provider_name="siliconflow",
            output_count=output_count,
            main_image_count=main_image_count,
            detail_image_count=detail_image_count,
            scene_category_id=scene_category_id,
            precise_attach_enabled=precise_attach_enabled,
            keep_pattern_scale=keep_pattern_scale,
            pattern_scale_percent=pattern_scale_percent,
            product_width_cm=product_width_cm,
            product_height_cm=product_height_cm,
            tile_width_cm=tile_width_cm,
            tile_height_cm=tile_height_cm,
            target_surface_width_cm=target_surface_width_cm,
            target_surface_height_cm=target_surface_height_cm,
            generation_mode=generation_mode,
            strict_attach_mode=strict_attach_mode,
        )
    if os.getenv("DASHSCOPE_API_KEY", "").strip():
        return generate_suite_images_ai(
            db,
            suite,
            source_image_bytes,
            texture_bytes=texture_bytes,
            provider_name="wanxiang",
            output_count=output_count,
            main_image_count=main_image_count,
            detail_image_count=detail_image_count,
            scene_category_id=scene_category_id,
            precise_attach_enabled=precise_attach_enabled,
            keep_pattern_scale=keep_pattern_scale,
            pattern_scale_percent=pattern_scale_percent,
            product_width_cm=product_width_cm,
            product_height_cm=product_height_cm,
            tile_width_cm=tile_width_cm,
            tile_height_cm=tile_height_cm,
            target_surface_width_cm=target_surface_width_cm,
            target_surface_height_cm=target_surface_height_cm,
            generation_mode=generation_mode,
            strict_attach_mode=strict_attach_mode,
        )
    return generate_suite_images_resize_only(db, suite, source_image_bytes)


def list_suites(db: Session, platform_code: str | None = None, skip: int = 0, limit: int = 50):
    q = db.query(PlatformSuite).filter(PlatformSuite.is_deleted == False)  # noqa: E712
    if platform_code:
        q = q.filter(PlatformSuite.platform_code == platform_code)
    return q.order_by(PlatformSuite.id.desc()).offset(skip).limit(limit).all()


def delete_suite(db: Session, suite_id: int) -> bool:
    row = db.query(PlatformSuite).filter(PlatformSuite.id == suite_id, PlatformSuite.is_deleted == False).first()
    if not row:
        return False
    row.is_deleted = True
    db.commit()
    return True


def delete_suite_image(db: Session, image_id: int) -> bool:
    row = db.query(SuiteImage).filter(SuiteImage.id == image_id).first()
    if not row:
        return False
    db.delete(row)
    db.commit()
    return True
