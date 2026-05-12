"""Unified cardboard tube core spec for all rolled wallpaper/sticker-style products."""

# Physical standard (locked across prompts & QA copy)
ROLL_CORE_INNER_DIAMETER_MM = 20  # 2.0 cm bore
ROLL_CORE_WALL_THICKNESS_MM = 1
ROLL_CORE_OUTER_DIAMETER_MM = ROLL_CORE_INNER_DIAMETER_MM + 2 * ROLL_CORE_WALL_THICKNESS_MM

# English prompt block — append to every roll-related hero/detail/composite instruction.
ROLL_CORE_AI_PROMPT_EN = (
    "ROLLED PRODUCT — STANDARD CARDBOARD TUBE CORE (SYSTEM LOCKED): "
    f"inner bore diameter exactly {ROLL_CORE_INNER_DIAMETER_MM} mm (= 2.0 cm); "
    f"tube wall thickness exactly {ROLL_CORE_WALL_THICKNESS_MM} mm only "
    f"(outer diameter ≈ {ROLL_CORE_OUTER_DIAMETER_MM} mm). "
    "Plain brown kraft corrugated cardboard; NO plastic end caps. "
    "The hollow MUST stay visually SMALL (coin-sized opening vs roll thickness)—never a wide toilet-paper-style mega core "
    "or thickened donut rim; wall reads razor-thin in profile."
)

ROLL_CORE_PATTERN_DIRECTION_EN = (
    "Pattern on the roll must run VERTICAL along unroll direction (do NOT lay pattern sideways)."
)

ROLL_CORE_HERO_SCALE_EN = (
    "If the roll end face is visible: verify scale—the 20 mm bore must read SMALL relative to wound roll thickness "
    "and product width (avoid enlarged hole)."
)
