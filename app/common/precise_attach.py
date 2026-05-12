from __future__ import annotations

import io

from PIL import Image


def _clamp_float(v: float | None, lo: float, hi: float) -> float | None:
    if v is None:
        return None
    return max(lo, min(float(v), hi))


def prepare_material_for_precise_attach(
    material_bytes: bytes,
    pattern_scale_percent: int = 100,
    keep_pattern_scale: bool = True,
) -> bytes:
    """Reduce visible motif size by tiling first, then downsampling to original size."""
    if not keep_pattern_scale:
        return material_bytes
    scale = max(25, min(int(pattern_scale_percent or 100), 100))
    if scale >= 100:
        return material_bytes
    repeats = max(1, min(6, round(100 / scale)))
    try:
        src = Image.open(io.BytesIO(material_bytes)).convert("RGBA")
        tiled = Image.new("RGBA", (src.width * repeats, src.height * repeats))
        for y in range(repeats):
            for x in range(repeats):
                tiled.paste(src, (x * src.width, y * src.height))
        out = tiled.resize(src.size, Image.LANCZOS)
        buf = io.BytesIO()
        out.save(buf, format="PNG")
        return buf.getvalue()
    except Exception:
        return material_bytes


def prepare_material_with_repeat_target(
    material_bytes: bytes,
    repeats_x: float | None = None,
    repeats_y: float | None = None,
    keep_pattern_scale: bool = True,
) -> bytes:
    """Build a tiled sample so the model sees expected repeat density."""
    if not keep_pattern_scale:
        return material_bytes
    rx = max(1, min(8, int(round(repeats_x or 1))))
    ry = max(1, min(8, int(round(repeats_y or 1))))
    if rx == 1 and ry == 1:
        return material_bytes
    try:
        src = Image.open(io.BytesIO(material_bytes)).convert("RGBA")
        tiled = Image.new("RGBA", (src.width * rx, src.height * ry))
        for y in range(ry):
            for x in range(rx):
                tiled.paste(src, (x * src.width, y * src.height))
        out = tiled.resize(src.size, Image.LANCZOS)
        buf = io.BytesIO()
        out.save(buf, format="PNG")
        return buf.getvalue()
    except Exception:
        return material_bytes


def build_precise_attach_hint(
    *,
    keep_pattern_scale: bool = True,
    pattern_scale_percent: int = 100,
    product_width_cm: float | None = None,
    product_height_cm: float | None = None,
    tile_width_cm: float | None = None,
    tile_height_cm: float | None = None,
    target_surface_width_cm: float | None = None,
    target_surface_height_cm: float | None = None,
    target_surface_type: str = "wall",
) -> str:
    parts: list[str] = []
    surface = (target_surface_type or "wall").strip().lower()
    if surface not in {"wall", "floor", "window", "backsplash", "ceiling", "auto"}:
        surface = "wall"
    if surface != "auto":
        parts.append(
            f"Target surface type is {surface}. Choose the largest visible {surface} plane in the scene."
        )
    if keep_pattern_scale:
        parts.append(
            "Keep original motif scale from the uploaded material. "
            "Never stretch one tile to fill a large wall/surface. Prefer repeating tiles."
        )
    safe_scale = max(25, min(pattern_scale_percent or 100, 100))
    if keep_pattern_scale and safe_scale < 100:
        parts.append(f"Render motifs at about {safe_scale}% of original artwork scale.")

    pw = _clamp_float(product_width_cm, 0.1, 10000)
    ph = _clamp_float(product_height_cm, 0.1, 10000)
    tw = _clamp_float(tile_width_cm, 0.1, 10000)
    th = _clamp_float(tile_height_cm, 0.1, 10000)
    sw = _clamp_float(target_surface_width_cm, 0.1, 10000)
    sh = _clamp_float(target_surface_height_cm, 0.1, 10000)

    if pw and ph:
        parts.append(f"Treat uploaded artwork as finished product size {pw:g}cm x {ph:g}cm.")
    if tw and th:
        parts.append(f"One visible motif repeat should be around {tw:g}cm x {th:g}cm.")
    if sw and sh:
        parts.append(
            f"Assume target surface around {sw:g}cm x {sh:g}cm and preserve real-world scale relation."
        )
        if tw and th:
            rx = max(1.0, sw / tw)
            ry = max(1.0, sh / th)
            parts.append(f"Expected visible repeats roughly {rx:.1f} across and {ry:.1f} down.")
    parts.append(
        "Never output a single sticker patch, framed art, centered poster, isolated square, or floating decal."
    )
    parts.append(
        "Preserve existing wall decorations and furniture: keep frames/paintings/lamps/plants visible, "
        "and apply wallpaper only to exposed wall regions with correct occlusion."
    )
    return " ".join(parts).strip()
