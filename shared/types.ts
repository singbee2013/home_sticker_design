/**
 * Unified type exports
 * Import shared types from this single entry point.
 */

export type * from "../drizzle/schema";
export * from "./_core/errors";

/** 产品模板分类 - 11 大类目（含马桶贴） */
export type TemplateCategory =
  | "wallpaper"
  | "kitchen"
  | "floor"
  | "wall_sticker"
  | "bathroom"
  | "toilet"
  | "window"
  | "fridge"
  | "ps5"
  | "macbook"
  | "drone";

/** 模板分类中文名映射 */
export const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  wallpaper: "墙纸",
  kitchen: "厨房贴",
  floor: "地板贴",
  wall_sticker: "墙贴",
  bathroom: "卫生间贴",
  toilet: "马桶贴",
  window: "窗贴",
  fridge: "冰箱贴",
  ps5: "游戏机贴",
  macbook: "笔记本贴",
  drone: "无人机贴",
};

/** 类目缩写（用于产品编号） */
export const CATEGORY_CODES: Record<TemplateCategory, string> = {
  wallpaper: "WP",
  kitchen: "KT",
  floor: "FL",
  wall_sticker: "WS",
  bathroom: "BR",
  toilet: "TL",
  window: "WD",
  fridge: "FG",
  ps5: "P5",
  macbook: "MB",
  drone: "DJ",
};

/** 目标市场 */
export type TargetMarket =
  | "north_america"
  | "europe"
  | "southeast_asia"
  | "middle_east"
  | "south_america"
  | "global";

export const TARGET_MARKET_LABELS: Record<TargetMarket, string> = {
  north_america: "北美",
  europe: "欧洲",
  southeast_asia: "东南亚",
  middle_east: "中东",
  south_america: "南美",
  global: "全球通用",
};

/** 场景拍摄视角 */
export type SceneAngle =
  | "front"
  | "side_45"
  | "overhead"
  | "closeup"
  | "wide_room"
  | "lifestyle";

export const SCENE_ANGLE_LABELS: Record<SceneAngle, string> = {
  front: "正面",
  side_45: "45° 侧视",
  overhead: "俯视",
  closeup: "局部特写",
  wide_room: "全景空间",
  lifestyle: "生活场景",
};

/** 视频类型 */
export type VideoType = "tutorial" | "showcase" | "selling_points";

export const VIDEO_TYPE_LABELS: Record<VideoType, string> = {
  tutorial: "使用教程",
  showcase: "场景展示",
  selling_points: "卖点宣传",
};

/** 按目标市场推荐的卖点关键词（用于视频文案提示） */
export const VIDEO_SELLING_POINTS: Record<TargetMarket, string[]> = {
  north_america: ["easy peel-and-stick", "removable without residue", "washable", "kid-safe materials"],
  europe: ["eco-friendly inks", "CE compliant", "minimalist aesthetic", "premium matte finish"],
  southeast_asia: ["humidity resistant", "vibrant colors", "tropical durability", "easy DIY install"],
  middle_east: ["heat resistant", "rich patterns", "luxury finish", "family-friendly"],
  south_america: ["bold designs", "affordable refresh", "rental-friendly", "quick installation"],
  global: ["waterproof", "removable", "no bubbles", "high-resolution print"],
};

/** 无缝处理模式（后处理 / 预览） */
export type SeamlessMode = "ai_enhance" | "tile_2x2" | "tile_3x3";

export const SEAMLESS_MODE_LABELS: Record<SeamlessMode, string> = {
  ai_enhance: "AI 增强无缝",
  tile_2x2: "2×2 平铺预览",
  tile_3x3: "3×3 平铺预览",
};

/** 产品尺寸规格 */
export interface ProductSize {
  id: string;
  label: string;
  widthCm: number;
  heightCm: number;
  /** 平铺图输出像素宽 */
  outputWidthPx: number;
  /** 平铺图输出像素高 */
  outputHeightPx: number;
}

/** 各类目对应的产品尺寸 */
export const CATEGORY_SIZES: Record<TemplateCategory, ProductSize[]> = {
  wallpaper: [
    { id: "wp_53x1000", label: "53cm × 10m (标准卷)", widthCm: 53, heightCm: 1000, outputWidthPx: 2120, outputHeightPx: 4000 },
    { id: "wp_70x1000", label: "70cm × 10m (宽幅卷)", widthCm: 70, heightCm: 1000, outputWidthPx: 2800, outputHeightPx: 4000 },
    { id: "wp_106x1000", label: "106cm × 10m (超宽卷)", widthCm: 106, heightCm: 1000, outputWidthPx: 4240, outputHeightPx: 4000 },
  ],
  kitchen: [
    { id: "kt_60x300", label: "60cm × 300cm", widthCm: 60, heightCm: 300, outputWidthPx: 2400, outputHeightPx: 4000 },
    { id: "kt_60x500", label: "60cm × 500cm", widthCm: 60, heightCm: 500, outputWidthPx: 2400, outputHeightPx: 4000 },
    { id: "kt_90x300", label: "90cm × 300cm", widthCm: 90, heightCm: 300, outputWidthPx: 3600, outputHeightPx: 4000 },
  ],
  floor: [
    { id: "fl_30x30", label: "30cm × 30cm", widthCm: 30, heightCm: 30, outputWidthPx: 3000, outputHeightPx: 3000 },
    { id: "fl_45x45", label: "45cm × 45cm", widthCm: 45, heightCm: 45, outputWidthPx: 3000, outputHeightPx: 3000 },
    { id: "fl_60x60", label: "60cm × 60cm", widthCm: 60, heightCm: 60, outputWidthPx: 3000, outputHeightPx: 3000 },
  ],
  wall_sticker: [
    { id: "ws_45x100", label: "45cm × 100cm", widthCm: 45, heightCm: 100, outputWidthPx: 1800, outputHeightPx: 4000 },
    { id: "ws_60x200", label: "60cm × 200cm", widthCm: 60, heightCm: 200, outputWidthPx: 2400, outputHeightPx: 4000 },
    { id: "ws_90x300", label: "90cm × 300cm", widthCm: 90, heightCm: 300, outputWidthPx: 3600, outputHeightPx: 4000 },
  ],
  bathroom: [
    { id: "br_30x60", label: "30cm × 60cm", widthCm: 30, heightCm: 60, outputWidthPx: 2000, outputHeightPx: 4000 },
    { id: "br_20x20", label: "20cm × 20cm (马赛克)", widthCm: 20, heightCm: 20, outputWidthPx: 3000, outputHeightPx: 3000 },
    { id: "br_30x30", label: "30cm × 30cm", widthCm: 30, heightCm: 30, outputWidthPx: 3000, outputHeightPx: 3000 },
  ],
  toilet: [
    { id: "tl_40x50", label: "40cm × 50cm (盖板)", widthCm: 40, heightCm: 50, outputWidthPx: 2000, outputHeightPx: 2500 },
    { id: "tl_45x55", label: "45cm × 55cm (加长盖板)", widthCm: 45, heightCm: 55, outputWidthPx: 2250, outputHeightPx: 2750 },
    { id: "tl_38x45", label: "38cm × 45cm (标准)", widthCm: 38, heightCm: 45, outputWidthPx: 1900, outputHeightPx: 2250 },
  ],
  window: [
    { id: "wd_45x200", label: "45cm × 200cm", widthCm: 45, heightCm: 200, outputWidthPx: 1800, outputHeightPx: 4000 },
    { id: "wd_60x200", label: "60cm × 200cm", widthCm: 60, heightCm: 200, outputWidthPx: 2400, outputHeightPx: 4000 },
    { id: "wd_90x200", label: "90cm × 200cm", widthCm: 90, heightCm: 200, outputWidthPx: 3600, outputHeightPx: 4000 },
  ],
  fridge: [
    { id: "fg_60x150", label: "60cm × 150cm (单门)", widthCm: 60, heightCm: 150, outputWidthPx: 2400, outputHeightPx: 4000 },
    { id: "fg_60x180", label: "60cm × 180cm (双门)", widthCm: 60, heightCm: 180, outputWidthPx: 2400, outputHeightPx: 4000 },
    { id: "fg_90x180", label: "90cm × 180cm (对开门)", widthCm: 90, heightCm: 180, outputWidthPx: 3600, outputHeightPx: 4000 },
  ],
  ps5: [
    { id: "p5_39x15", label: "39×15 cm 塔式主机侧板（PS5 / Xbox Series X 等）", widthCm: 39, heightCm: 15, outputWidthPx: 3900, outputHeightPx: 1500 },
    { id: "p5_30x7", label: "30×7 cm 扁机身侧/顶（Xbox Series S 等）", widthCm: 30, heightCm: 7, outputWidthPx: 3600, outputHeightPx: 1200 },
    { id: "p5_26x11", label: "26×11 cm 掌机正面（Switch / OLED / Lite）", widthCm: 26, heightCm: 11, outputWidthPx: 3120, outputHeightPx: 1320 },
    { id: "p5_16x10", label: "16×10 cm 手柄", widthCm: 16, heightCm: 10, outputWidthPx: 3200, outputHeightPx: 2000 },
    { id: "p5_full", label: "主机侧板通用（同 39×15 档）", widthCm: 39, heightCm: 15, outputWidthPx: 3900, outputHeightPx: 1500 },
  ],
  macbook: [
    { id: "mb_30x21", label: "30×21 cm（≈13 英寸 MacBook Air/Pro）", widthCm: 30, heightCm: 21, outputWidthPx: 3000, outputHeightPx: 2100 },
    { id: "mb_31x22", label: "31×22 cm（≈14 英寸 MacBook Pro / 轻薄本）", widthCm: 31, heightCm: 22, outputWidthPx: 3100, outputHeightPx: 2200 },
    { id: "mb_33x23", label: "33×23 cm（≈15 英寸 MacBook / 全能本）", widthCm: 33, heightCm: 23, outputWidthPx: 3300, outputHeightPx: 2300 },
    { id: "mb_34x24", label: "34×24 cm（主流 15 英寸 Windows 本）", widthCm: 34, heightCm: 24, outputWidthPx: 3400, outputHeightPx: 2400 },
    { id: "mb_36x25", label: "36×25 cm（≈16 英寸 MacBook Pro）", widthCm: 36, heightCm: 25, outputWidthPx: 3600, outputHeightPx: 2500 },
  ],
  drone: [
    { id: "dj_20x15", label: "20×15 cm（DJI Mini 2 / 3 / 4 Pro 等小折叠机顶壳）", widthCm: 20, heightCm: 15, outputWidthPx: 3000, outputHeightPx: 2250 },
    { id: "dj_25x18", label: "25×18 cm（DJI Air 2S / Air 3 等）", widthCm: 25, heightCm: 18, outputWidthPx: 3000, outputHeightPx: 2160 },
    { id: "dj_28x19", label: "28×19 cm（Autel EVO / 相近尺寸折叠机）", widthCm: 28, heightCm: 19, outputWidthPx: 3360, outputHeightPx: 2280 },
    { id: "dj_30x20", label: "30×20 cm（DJI Mavic 3 / 3 Pro / Cine 等）", widthCm: 30, heightCm: 20, outputWidthPx: 3000, outputHeightPx: 2000 },
  ],
};

/**
 * 生成页「游戏机贴 / 笔记本贴 / 无人机贴」共用：说明「产品摄影」与「平面贴膜稿」如何随描述切换。
 * （无人机在后端另有 `shouldUseDronePhotorealPipeline` 等逻辑；游戏机/笔记本的实拍优化可逐步对齐，此处先统一用户预期。）
 */
export const DEVICE_SKIN_GENERATION_MODE_HINT_ZH = [
  "若写出「实拍、自然光、产品图/商品图、棚拍、高清」等，或具体到机身外观（游戏机外壳与接口、笔记本 A 面/铰链/转轴、无人机机臂/桨叶/云台与折叠状态等），系统会按「产品外观摄影」方向优化生图。",
  "若以「图案、纹样、无缝、平铺」为主，则更偏向「平面贴膜设计稿」。无人机类目在摄影方向下还会强化四旋翼机臂数量与对称结构等约束。",
].join("\n");

/** 设备类贴纸：主流系列参考（文案/UI；真机尺寸以厂商规格为准） */
export const DEVICE_SKIN_CATEGORIES = ["ps5", "macbook", "drone"] as const;
export type DeviceSkinCategory = (typeof DEVICE_SKIN_CATEGORIES)[number];

export function isDeviceSkinCategory(cat: string): cat is DeviceSkinCategory {
  return (DEVICE_SKIN_CATEGORIES as readonly string[]).includes(cat);
}

export const DEVICE_MODEL_REFERENCE: Record<
  DeviceSkinCategory,
  { title: string; lines: string[]; promptFidelity: string }
> = {
  ps5: {
    title: "游戏机常见系列（贴纸按侧板/掌机面通用规格设计）",
    lines: [
      "Sony：PlayStation 5（光驱 / 数字 / Slim 各款）、PlayStation 4 / Pro / Slim、PlayStation 3（各改版请以实物为准）",
      "Nintendo：Switch 2、Switch OLED、Switch（续航版）、Switch Lite",
      "Microsoft：Xbox Series X、Xbox Series S、Xbox One X、Xbox One S",
      "其他：Valve Steam Deck / Steam Deck OLED、ASUS ROG Ally、Lenovo Legion Go 等掌机",
    ],
    promptFidelity:
      "If the user names a console model, render ONLY that exact model family with correct silhouette and proportions; do not substitute PlayStation for Xbox or Switch. Keep the same chassis shape across all images in a batch.",
  },
  macbook: {
    title: "笔记本常见系列",
    lines: [
      "Apple：MacBook Air（M 系列各代）、MacBook Pro 14\" / 16\"（M Pro / Max 各代）",
      "Microsoft：Surface Laptop、Surface Pro（按代与尺寸查阅官网）",
      "Windows：Dell XPS、Lenovo ThinkPad / Yoga、HP Spectre / Envy、ASUS Zenbook / ROG 等 13–16 英寸机型",
    ],
    promptFidelity:
      "If the user names a laptop model, match that line's typical lid proportions and hinge layout; do not show a different screen-size class. Same lid geometry and camera angle across batch outputs—vary only the skin graphic.",
  },
  drone: {
    title: "无人机常见系列（多品牌）",
    lines: [
      "DJI：Mini 2 / Mini 3 / Mini 3 Pro / Mini 4 Pro、Air 2S / Air 3 / Air 3S、Mavic 3 / 3 Pro / 3 Cine、Mavic 4 系列、Avata / Avata 2、Neo、Inspire 系列（机身规格另查）",
      "Autel：EVO II、EVO Nano 系列",
      "Skydio、Parrot、FIMI 等（请以具体型号与官网尺寸为准）",
    ],
    promptFidelity:
      "If the user names a drone model (e.g. DJI Mini 4 Pro), render ONLY that model with accurate top-shell layout, arm folding geometry, and camera gimbal pod; include only factory-correct accessories visible in frame—no extra or missing propellers or batteries. Same model, framing, and lens height across batch—vary only decal artwork.",
  },
};

/**
 * 用户在「无人机贴」类目下描述「实拍 / 产品图 / 机臂 / 自然光」等时，走产品摄影管线（与平面无缝纹样管线分离），
 * 减少文生图把机身画成抽象纹样或旋翼数量错误的问题。
 */
export function shouldUseDronePhotorealPipeline(category: string, userPrompt: string): boolean {
  if (category !== "drone") return false;
  const p = userPrompt.trim();
  if (!p) return false;
  if (
    /\b(realistic\s*photo|product\s*photo|studio\s*shot|catalog(ue)?\s*photo|e-?commerce\s*photo|dslr|raw\s*photo|packshot|hero\s*shot|photorealistic)\b/i.test(p)
  ) {
    return true;
  }
  if (
    /实拍|高清|摄影|照片|自然光|棚拍|白底图|商品图|产品图|机臂|展开|折叠|俯拍|侧视|仰视|微距|各角度|多角度|完整机器|全套配件|超近景|近景|实拍图/i.test(p)
  ) {
    return true;
  }
  if (/(DJI|大疆|Mini\s*\d|Mavic|Air\s*\d|Autel)/i.test(p) && /(实拍|摄影|图|照|光|角度|镜头)/i.test(p)) {
    return true;
  }
  if (
    /\b(Mini\s*4\s*Pro|Mini\s*3\s*Pro)\b/i.test(p) &&
    /(机臂|螺旋桨|桨叶|云台|折叠|展开|起落架|避障|配件)/i.test(p)
  ) {
    return true;
  }
  return false;
}

/** Kolors negative_prompt 追加，专门压「多/少机臂、畸形旋翼」 */
export const DRONE_PHOTOREAL_NEGATIVE_EXTRA = [
  "wrong number of rotor arms",
  "three armed drone",
  "five armed drone",
  "six armed drone",
  "missing drone arm",
  "extra drone arm",
  "duplicate arm",
  "asymmetric boom length",
  "merged rotor booms",
  "fantasy hinge layout",
  "incorrect propeller count",
  "single giant propeller",
  "toy drone proportions",
  "fictional UAV body",
  "wrong gimbal placement",
  "camera pod on top incorrectly",
  "hexacopter",
  "octocopter",
  "bicopter with two arms",
].join(", ");

/** 英文硬约束：四旋翼拓扑 + 与用户brief一致的折叠状态 */
export const DRONE_PHOTOREAL_PHYSICAL_LOCK = [
  "PHYSICAL LOCK: output is ONE real consumer folding camera quadcopter exactly as named in the user brief — not a flat skin swatch, not seamless wallpaper tile.",
  "TOPOLOGY LOCK: exactly FOUR main rotor booms in symmetric X or H layout when unfolded; exactly one motor per boom tip; paired propellers with plausible CW/CCW pairing.",
  "FORBIDDEN: 3, 5, 6+ main booms; merged double-booms; missing boom when unfolded; random asymmetric span.",
  "GIMBAL: single camera+gimbal pod suspended under the forward fuselage typical of DJI Mini / Mavic style — not floating above the shell.",
  "Follow the user brief for folded transport mode vs flight-ready extended arms; all four booms must match that state simultaneously.",
].join(" ");

export function getDroneModelLockClause(userPrompt: string): string {
  if (/Mini\s*4\s*Pro/i.test(userPrompt)) {
    return "MODEL LOCK DJI Mini 4 Pro: sub-250g compact shell, four short folding arms, obstacle-sensing openings on front corners as on retail product photos — do not upscale to Mavic-sized chassis.";
  }
  if (/Mini\s*3\s*Pro/i.test(userPrompt)) {
    return "MODEL LOCK DJI Mini 3 Pro: distinguish from Mini 4 Pro sensor layout; still exactly four folding arms.";
  }
  if (/Mavic\s*3(\s*Pro|\s*Cine)?/i.test(userPrompt)) {
    return "MODEL LOCK DJI Mavic 3 family: larger triple-camera gimbal housing, four arms — not Mini-series compact toy look.";
  }
  if (/Air\s*3S?/i.test(userPrompt)) {
    return "MODEL LOCK DJI Air 3 / Air 3S class: twin-camera gimbal stack, four arms, mid-size body — not Mini 4 silhouette.";
  }
  return "";
}

/** 产品摄影类目要求（替换「平面贴膜纹样」文案，避免与实拍需求冲突） */
export const DRONE_PHOTOREAL_CATREQ =
  "professional true product photograph for e-commerce UAV listing, faithful industrial design to the named model, documentary capture, not illustration";

export const DRONE_PHOTOREAL_QUALITY_SUFFIX = [
  "mirrorless camera product shot, tack-sharp plastic and magnesium shell texture",
  "lighting exactly as user described, no CGI, no toy-like gloss",
  "no on-image text, no watermark, no UI overlay",
].join(", ");

/** 风格预设 */
export interface StylePreset {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  promptHint: string;
  /** 特别适合展示的目标市场（首页标签用，可选） */
  recommendedMarkets?: readonly TargetMarket[];
}

/** 预设风格列表 - 12种 */
export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "european_modern",
    name: "欧美现代",
    nameEn: "European Modern",
    description: "简洁线条、几何图形、中性色调",
    promptHint: "modern European style, clean geometric lines, neutral tones, minimalist elegant pattern",
  },
  {
    id: "european_classic",
    name: "欧式古典",
    nameEn: "European Classic",
    description: "大马士革花纹、洛可可卷草、金色浮雕",
    promptHint: "classic European Damask pattern, Rococo scrollwork, gold embossed ornamental, baroque luxury wallpaper design",
  },
  {
    id: "nordic_minimal",
    name: "北欧简约",
    nameEn: "Nordic Minimal",
    description: "自然元素、柔和色彩、简约图案",
    promptHint: "Scandinavian Nordic minimalist style, soft pastel colors, nature-inspired organic shapes, clean simple pattern",
    recommendedMarkets: ["europe", "north_america"],
  },
  {
    id: "middle_east_geometric",
    name: "中东几何",
    nameEn: "Middle Eastern Geometric",
    description: "复杂几何、对称图案、丰富色彩",
    promptHint: "Middle Eastern Islamic geometric pattern, intricate symmetrical arabesque, rich jewel tones, ornate tessellation",
    recommendedMarkets: ["middle_east", "global"],
  },
  {
    id: "southeast_asia_tropical",
    name: "东南亚热带",
    nameEn: "Southeast Asian Tropical",
    description: "热带植物、鲜艳色彩、自然纹理",
    promptHint: "Southeast Asian tropical style, lush tropical leaves and flowers, vibrant green and gold colors, exotic botanical pattern",
    recommendedMarkets: ["southeast_asia", "global"],
  },
  {
    id: "kids_cartoon",
    name: "儿童卡通",
    nameEn: "Kids Cartoon",
    description: "可爱卡通、明亮色彩、趣味图案",
    promptHint: "cute children cartoon style, playful colorful characters, bright cheerful colors, whimsical fun pattern",
  },
  {
    id: "chinese_traditional",
    name: "中式传统",
    nameEn: "Chinese Traditional",
    description: "传统花纹、祥云纹样、红金配色",
    promptHint: "traditional Chinese style pattern, auspicious cloud motifs, red and gold colors, elegant oriental design",
  },
  {
    id: "art_deco",
    name: "装饰艺术",
    nameEn: "Art Deco",
    description: "几何对称、金属质感、奢华风格",
    promptHint: "Art Deco style, bold geometric symmetry, gold and black metallic accents, luxurious glamorous pattern",
  },
  {
    id: "boho_ethnic",
    name: "波西米亚",
    nameEn: "Bohemian Ethnic",
    description: "民族风、手绘质感、大地色系",
    promptHint: "Bohemian ethnic style, hand-drawn tribal motifs, earthy warm tones, eclectic boho pattern",
  },
  {
    id: "african_tribal",
    name: "非洲部落",
    nameEn: "African Tribal",
    description: "大胆几何、泥土色调、原始纹样",
    promptHint: "African tribal pattern, bold geometric shapes, mud cloth inspired, earthy brown and ochre tones, Kente cloth motifs",
  },
  {
    id: "indian_mandala",
    name: "印度曼陀罗",
    nameEn: "Indian Mandala",
    description: "曼陀罗花纹、佩斯利、浓郁色彩",
    promptHint: "Indian mandala pattern, intricate paisley motifs, rich saffron and deep red colors, ornate henna-inspired design",
  },
  {
    id: "japanese_zen",
    name: "日式和风",
    nameEn: "Japanese Zen",
    description: "和风波浪、樱花、极简禅意",
    promptHint: "Japanese Zen style, seigaiha wave pattern, cherry blossom sakura, indigo and white, minimalist wabi-sabi aesthetic",
  },
  {
    id: "thai_lotus",
    name: "泰式莲花",
    nameEn: "Thai Lotus",
    description: "莲花纹样、金色装饰、佛教元素",
    promptHint: "Thai traditional pattern, lotus flower motifs, gold leaf ornamental, Buddhist inspired, royal Thai decorative design",
  },
  {
    id: "moroccan_tile",
    name: "摩洛哥瓷砖",
    nameEn: "Moroccan Tile",
    description: "马赛克拼花、蓝白配色、几何花纹",
    promptHint: "Moroccan zellige tile pattern, blue and white mosaic, intricate geometric floral, Mediterranean ceramic design",
  },
];

/** AI生成场景模板的提示词模板 */
export const TEMPLATE_SCENE_PROMPTS: Record<TemplateCategory, string> = {
  wallpaper: [
    "A real photograph of a bright Scandinavian living room, large empty white plaster accent wall as the dominant backdrop,",
    "afternoon sunlight streaming through floor-to-ceiling linen curtains casting soft volumetric rays,",
    "light oak herringbone parquet floor, low-profile cream sofa with chunky knit throw, single potted fiddle-leaf fig tree,",
    "shot on Canon EOS R5 with 24mm f/2.8 lens, ISO 200, 1/100s, shallow depth of field with crisp wall in focus,",
    "Architectural Digest editorial photography, warm 5500K lighting, ultra-sharp and hyperrealistic,",
    "no text, no watermarks, photographic quality, not digital art, not 3D render",
  ].join(" "),

  kitchen: [
    "A real photograph of a luxury modern kitchen interior, clean subway-tile backsplash wall behind quartz countertop fully filling the background,",
    "matte white shaker cabinets, brushed brass hardware, integrated appliances, fresh herbs on the windowsill,",
    "warm under-cabinet LED strip lighting, late-morning soft natural light from the window,",
    "Sony A7R IV 35mm f/2.8 lens, ISO 400, perfectly sharp backsplash tiles, shallow depth of field,",
    "ELLE Decor magazine interior photography style, not CGI, not 3D render, hyperrealistic photograph,",
    "no text, no logos, professional interior editorial quality",
  ].join(" "),

  floor: [
    "A real photograph of an elegant minimalist room viewed from a low wide angle, vast expanse of clean concrete floor dominating the frame,",
    "polished microcement floor, floor-to-ceiling glass walls letting in soft diffused daylight,",
    "single Barcelona chair in soft grey, slim floor lamp, small succulent in white planter,",
    "Fujifilm GFX 100S 23mm tilt-shift lens perspective-corrected, f/5.6 ISO 100, extremely sharp floor tiles,",
    "luxury residential interior photography, AD100 design sensibility, not digital art, true photograph,",
    "no text, no watermarks",
  ].join(" "),

  wall_sticker: [
    "A real photograph of a cozy hygge bedroom, large empty warm-white matte wall section spanning the full width of the frame,",
    "natural linen bedding, rounded nightstand, muted terracotta and sage accent cushions,",
    "golden hour glow filtering through sheer muslin curtains creating soft warm gradients on the wall,",
    "Canon EOS R5 50mm f/1.8 lens, ISO 320, wall completely in focus, slight bokeh on foreground elements,",
    "interior lifestyle photograph, Kinfolk magazine aesthetic, hyper-detailed wall surface texture visible,",
    "not 3D render, not illustration, photographic realism",
  ].join(" "),

  bathroom: [
    "A real photograph of a high-end spa bathroom, large-format porcelain wall tiles covering the full back wall clearly visible,",
    "freestanding oval soaking tub, brushed nickel fixtures, natural pebble bath mat, folded white Turkish towels,",
    "diffused natural light from frosted skylight creating even shadowless illumination,",
    "Leica Q2 28mm lens f/4, ISO 200, tiles razor-sharp and highly detailed, clean white grout lines,",
    "Dwell magazine bathroom editorial photography, not CGI, authentic photograph, photorealistic,",
    "no text, no watermarks",
  ].join(" "),

  toilet: [
    "A real close-up product photograph of a modern white ceramic toilet, lid closed, tank and seat perfectly smooth and clean,",
    "set in a bright minimalist bathroom with white hex floor tiles, potted orchid on the tank lid,",
    "soft directional studio lighting eliminating shadows, slight specular highlight showing ceramic surface quality,",
    "Canon 100mm macro lens f/8 ISO 100, product photography studio setup, clean white background wall,",
    "commercial product photography for e-commerce, extremely sharp ceramic surface, not 3D render, true photo",
  ].join(" "),

  window: [
    "A real photograph of a sunlit reading nook, large casement window taking up 60% of the frame, clear glass panes facing a lush green garden,",
    "warm afternoon light backlighting the scene, dust particles softly visible in the air, white painted wooden frame,",
    "built-in window seat with linen cushion, stack of hardcover books, trailing pothos plant,",
    "Nikon Z9 35mm f/2 lens, ISO 250, window glass in perfect focus, slightly soft foreground elements,",
    "real interior photograph, not 3D render, photographic quality, Kinfolk magazine aesthetics,",
    "no text, no watermarks",
  ].join(" "),

  fridge: [
    "A real photograph of a premium stainless-steel French-door refrigerator as the hero subject, front panels smooth and clean, occupying center frame,",
    "set in a bright transitional kitchen, white marble countertops flanking both sides, pendant lights above island,",
    "studio-quality even lighting with subtle specular reflections on the refrigerator door panels,",
    "Canon EOS 5D Mark IV 50mm f/5.6 ISO 100, product-in-situ photography, razor-sharp front surface,",
    "Samsung or LG appliance catalog photography style, not 3D render, true photograph,",
    "no text, no logos on the appliance",
  ].join(" "),

  ps5: [
    "A real studio product photograph of exactly the game console model described in the creative brief (do not substitute a different brand or generation),",
    "hero surface facing camera with manufacturer-accurate curves and port layout, neutral matte desk, soft controlled studio lighting,",
    "90mm macro f/8, ISO 100, tack-sharp plastic or shell texture, catalog-quality e-commerce shot,",
    "not 3D render, not illustration, no on-screen UI, no fictional ports, no text or watermarks",
  ].join(" "),

  macbook: [
    "A real studio photograph of exactly the laptop model described in the creative brief (lid closed or as specified), top case facing camera,",
    "flat-lay or slight 3/4 angle per brief, aluminum or finish matching that product line, minimal desk props that do not hide the lid,",
    "soft diffused daylight, razor-sharp lid surface, no wrong screen-size bezel proportions,",
    "not 3D render, not illustration, no Apple-style logo unless naturally present on that model, no text overlays",
  ].join(" "),

  drone: [
    "A real studio product photograph of exactly the UAV model named in the creative brief (e.g. DJI Mini 4 Pro), folded arms unless brief says otherwise,",
    "top shell and gimbal pod geometry matching that model, propellers correct in number and placement, only factory-plausible accessories in frame,",
    "clean seamless backdrop, dual softbox lighting, 100mm macro f/8 ISO 100, commercial drone catalog look,",
    "not 3D render, not illustration, no extra batteries or props not matching that SKU, no motion blur",
  ].join(" "),
};

/** 预设模板数据 */
export interface PresetTemplateData {
  name: string;
  category: TemplateCategory;
  description: string;
  sceneImageUrl: string;
  thumbnailUrl: string;
  overlayConfig: {
    points: { x: number; y: number }[];
    tileScale: number;
  };
  targetMarket?: TargetMarket;
  sceneAngle?: SceneAngle;
}

export const PRESET_TEMPLATES: PresetTemplateData[] = [
  {
    name: "现代客厅墙面",
    category: "wallpaper",
    description: "简约现代风格客厅，大面积空白墙面适合展示墙纸效果",
    sceneImageUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310519663418396668/jiTT4zabB2XkjgbKJ8wgUx/template_wallpaper_livingroom-2wQzK6XLaXa7mDg5aK5yLf.png",
    thumbnailUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310519663418396668/jiTT4zabB2XkjgbKJ8wgUx/template_wallpaper_livingroom-4SLCjtbbYQApu2HUJojznw.webp",
    overlayConfig: { points: [{ x: 0.08, y: 0.0 }, { x: 0.95, y: 0.0 }, { x: 0.95, y: 0.62 }, { x: 0.08, y: 0.62 }], tileScale: 0.3 },
  },
  {
    name: "厨房操作台背景",
    category: "kitchen",
    description: "现代厨房操作台上方空白墙面，适合展示厨房贴纸效果",
    sceneImageUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310519663418396668/jiTT4zabB2XkjgbKJ8wgUx/template_kitchen_backsplash-XjpRHpL7ZfUDzmJALbWQAH.png",
    thumbnailUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310519663418396668/jiTT4zabB2XkjgbKJ8wgUx/template_kitchen_backsplash-jNMNNDKWZDzsiamoiMxAdd.webp",
    overlayConfig: { points: [{ x: 0.05, y: 0.15 }, { x: 0.85, y: 0.15 }, { x: 0.85, y: 0.55 }, { x: 0.05, y: 0.55 }], tileScale: 0.25 },
  },
  {
    name: "现代房间地面",
    category: "floor",
    description: "宽敞现代房间，大面积地面适合展示地板贴效果",
    sceneImageUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310519663418396668/jiTT4zabB2XkjgbKJ8wgUx/template_floor_room-iGn7QocRJE5RFvyrUUqxDG.png",
    thumbnailUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310519663418396668/jiTT4zabB2XkjgbKJ8wgUx/template_floor_room-CCHU65R3iQPezeUagf3grX.webp",
    overlayConfig: { points: [{ x: 0.0, y: 0.25 }, { x: 1.0, y: 0.25 }, { x: 1.0, y: 1.0 }, { x: 0.0, y: 1.0 }], tileScale: 0.2 },
  },
  {
    name: "儿童房墙面",
    category: "wall_sticker",
    description: "温馨儿童房间，空白墙面适合展示墙贴效果",
    sceneImageUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310519663418396668/jiTT4zabB2XkjgbKJ8wgUx/template_wall_sticker_bedroom-kiaNSSiaAy59fHEDLLubt8.png",
    thumbnailUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310519663418396668/jiTT4zabB2XkjgbKJ8wgUx/template_wall_sticker_bedroom-PRM3MUcignuNqZMnqBYk5G.webp",
    overlayConfig: { points: [{ x: 0.18, y: 0.0 }, { x: 0.72, y: 0.0 }, { x: 0.72, y: 0.75 }, { x: 0.18, y: 0.75 }], tileScale: 0.35 },
  },
];

/** 批量生成数量选项 */
export const BATCH_COUNT_OPTIONS = [1, 5, 10, 20, 50, 100] as const;

/** Amazon 列表图数量（默认 10，可扩展到 15） */
export const AMAZON_LISTING_COUNT_OPTIONS = [8, 10, 12, 15] as const;

/** Amazon 图集固定槽位（按转化路径排序） */
export const AMAZON_LISTING_SLOT_POOL = [
  "main",
  "lifestyle_1",
  "lifestyle_2",
  "lifestyle_3",
  "dimension",
  "detail_1",
  "detail_2",
  "feature_waterproof",
  "feature_moistureproof",
  "feature_adhesive_easy_apply",
  "lifestyle_4",
  "detail_3",
  "feature_install_steps",
  "feature_material_closeup",
  "feature_after_install",
] as const;

export type AmazonListingSlot = (typeof AMAZON_LISTING_SLOT_POOL)[number];

/** 生成产品编号 */
export function generateProductCode(category: TemplateCategory, sequence: number): string {
  const code = CATEGORY_CODES[category] || "XX";
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const seqStr = String(sequence).padStart(3, "0");
  return `DA-${code}-${dateStr}-${seqStr}`;
}

/** 输出模式 */
export type OutputMode = "pattern_only" | "mockup_only" | "both";

export const OUTPUT_MODE_LABELS: Record<OutputMode, string> = {
  pattern_only: "仅平铺纹样图",
  mockup_only: "仅场景效果图",
  both: "平铺图 + 效果图",
};

/** 文生图 / 参考图生图 选用的上游模型 */
export const IMAGE_GEN_PROVIDERS = ["auto", "gemini", "openai", "siliconflow"] as const;
export type ImageGenProvider = (typeof IMAGE_GEN_PROVIDERS)[number];

export const IMAGE_GEN_PROVIDER_LABELS: Record<ImageGenProvider, string> = {
  auto: "自动（Gemini 优先，失败再用 SiliconFlow）",
  gemini: "Gemini（Nano Banana / Flash Image）",
  openai: "ChatGPT Images / OpenAI（gpt-image-2）",
  siliconflow: "SiliconFlow（FLUX / Kolors）",
};

const MARKET_STYLE_HINT: Record<TargetMarket, string> = {
  north_america: "warm contemporary North American interior styling",
  europe: "refined European interior design, understated elegance",
  southeast_asia: "bright airy tropical-modern interior common in Southeast Asia",
  middle_east: "luxurious Middle Eastern residential interior with rich textures",
  south_america: "vibrant Latin American home interior with natural light",
  global: "globally appealing modern neutral interior",
};

const ANGLE_CAMERA_HINT: Record<SceneAngle, string> = {
  front: "straight-on eye-level camera, centered composition",
  side_45: "45-degree oblique camera angle showing depth",
  overhead: "top-down bird's eye view",
  closeup: "tight close-up on the product surface area",
  wide_room: "wide establishing shot of the full room",
  lifestyle: "lifestyle editorial shot with natural human-scale context",
};

/** 组装 AI 场景图提示词（类目 + 市场 + 视角） */
export function buildScenePrompt(
  category: TemplateCategory,
  targetMarket: TargetMarket,
  sceneAngle: SceneAngle
): string {
  const scene = TEMPLATE_SCENE_PROMPTS[category];
  const marketName = TARGET_MARKET_LABELS[targetMarket];
  const angleName = SCENE_ANGLE_LABELS[sceneAngle];
  return [
    scene,
    `Target market: ${marketName} (${MARKET_STYLE_HINT[targetMarket]}).`,
    `Camera / framing: ${angleName} — ${ANGLE_CAMERA_HINT[sceneAngle]}.`,
    "Photorealistic, professional interior or product photography, high detail, no text overlays.",
  ].join(" ");
}

/** 组装产品视频创意 brief 提示词 */
export function buildVideoPrompt(
  videoType: VideoType,
  category: TemplateCategory,
  targetMarket: TargetMarket,
  customKeywords?: string
): string {
  const cat = CATEGORY_LABELS[category];
  const market = TARGET_MARKET_LABELS[targetMarket];
  const typeLabel = VIDEO_TYPE_LABELS[videoType];
  const hints = (VIDEO_SELLING_POINTS[targetMarket] ?? []).join(", ");
  const extra = customKeywords?.trim() ? ` Additional focus: ${customKeywords.trim()}.` : "";
  return [
    `Create a marketing creative brief for a ${typeLabel} video about a ${cat} home decor sticker product.`,
    `Audience: ${market} market. Emphasize: ${hints}.${extra}`,
    "Tone: professional e-commerce / social ad, clear lighting, 10–30 seconds, no on-screen text unless subtle brand-safe.",
  ].join(" ");
}
