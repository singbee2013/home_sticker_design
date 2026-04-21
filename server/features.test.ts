import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  STYLE_PRESETS, PRESET_TEMPLATES, CATEGORY_LABELS, CATEGORY_CODES,
  CATEGORY_SIZES, TEMPLATE_SCENE_PROMPTS, OUTPUT_MODE_LABELS,
  shouldUseDronePhotorealPipeline,
  generateProductCode, type TemplateCategory,
} from "@shared/types";
import type { TrpcContext } from "./_core/context";

// Mock the image generation module
vi.mock("./_core/imageGeneration", () => ({
  generateImage: vi.fn().mockResolvedValue({
    url: "https://example.com/generated-image.png",
  }),
  generateCompositeImage: vi.fn().mockResolvedValue({
    url: "https://example.com/generated-mockup.png",
  }),
}));

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: "A geometric pattern with blue and gold colors, featuring intricate tessellation." } }],
  }),
}));

// Mock the storage module
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({
    key: "test-key",
    url: "https://example.com/uploaded.png",
  }),
}));

// Mock the db module
vi.mock("./db", () => ({
  getTemplates: vi.fn().mockResolvedValue([]),
  getTemplateById: vi.fn().mockResolvedValue(null),
  createTemplate: vi.fn().mockResolvedValue({ id: 1 }),
  getTemplateCount: vi.fn().mockResolvedValue(0),
  deleteTemplate: vi.fn().mockResolvedValue(undefined),
  createPattern: vi.fn().mockResolvedValue({ id: 1 }),
  updatePattern: vi.fn().mockResolvedValue(undefined),
  getPatternsByUser: vi.fn().mockResolvedValue([]),
  getPatternById: vi.fn().mockResolvedValue(null),
  getPatternsByTask: vi.fn().mockResolvedValue([]),
  getPatternCount: vi.fn().mockResolvedValue(0),
  createMockup: vi.fn().mockResolvedValue({ id: 1 }),
  getMockupsByUser: vi.fn().mockResolvedValue([]),
  getMockupsByPattern: vi.fn().mockResolvedValue([]),
  createGenerateTask: vi.fn().mockResolvedValue({ id: 1 }),
  updateGenerateTask: vi.fn().mockResolvedValue(undefined),
  getGenerateTasksByUser: vi.fn().mockResolvedValue([]),
  getGenerateTaskById: vi.fn().mockResolvedValue(null),
  upsertUser: vi.fn().mockResolvedValue(undefined),
  getUserByOpenId: vi.fn().mockResolvedValue(undefined),
  createProductVideo: vi.fn().mockResolvedValue({ id: 1 }),
  updateProductVideo: vi.fn().mockResolvedValue(undefined),
  getProductVideosByUser: vi.fn().mockResolvedValue([]),
  getProductVideoById: vi.fn().mockResolvedValue(null),
  getProductVideosByPattern: vi.fn().mockResolvedValue([]),
}));

// Import after mocks
import { appRouter } from "./routers";
import * as db from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-001",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ========== 1. 11 大产品类目验证 ==========

describe("11 Product Categories", () => {
  const expectedCategories: TemplateCategory[] = [
    "wallpaper", "kitchen", "floor", "wall_sticker", "bathroom",
    "toilet", "window", "fridge", "ps5", "macbook", "drone",
  ];

  it("has exactly 11 categories in CATEGORY_LABELS", () => {
    const keys = Object.keys(CATEGORY_LABELS);
    expect(keys).toHaveLength(11);
    for (const cat of expectedCategories) {
      expect(CATEGORY_LABELS[cat]).toBeTruthy();
    }
  });

  it("has category codes for all 11 categories", () => {
    for (const cat of expectedCategories) {
      expect(CATEGORY_CODES[cat]).toBeTruthy();
      expect(CATEGORY_CODES[cat].length).toBeLessThanOrEqual(2);
    }
  });

  it("has sizes defined for all 11 categories", () => {
    for (const cat of expectedCategories) {
      const sizes = CATEGORY_SIZES[cat];
      expect(Array.isArray(sizes)).toBe(true);
      expect(sizes.length).toBeGreaterThanOrEqual(2);
      for (const size of sizes) {
        expect(size.id).toBeTruthy();
        expect(size.label).toBeTruthy();
        expect(size.widthCm).toBeGreaterThan(0);
        expect(size.heightCm).toBeGreaterThan(0);
        expect(size.outputWidthPx).toBeGreaterThan(0);
        expect(size.outputHeightPx).toBeGreaterThan(0);
      }
    }
  });

  it("has scene prompts for all 11 categories", () => {
    for (const cat of expectedCategories) {
      expect(TEMPLATE_SCENE_PROMPTS[cat]).toBeTruthy();
      expect(TEMPLATE_SCENE_PROMPTS[cat].length).toBeGreaterThan(20);
    }
  });

  it("detects drone photoreal pipeline vs flat pattern prompts", () => {
    expect(shouldUseDronePhotorealPipeline("drone", "大疆Mini 4 Pro 自然光 高清实拍 机臂展开")).toBe(true);
    expect(shouldUseDronePhotorealPipeline("wallpaper", "实拍")).toBe(false);
    expect(shouldUseDronePhotorealPipeline("drone", "迷彩几何纹样 平铺")).toBe(false);
  });

  it("returns all categories via config API", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const categories = await caller.config.categories();
    expect(categories).toHaveLength(11);
    for (const cat of categories) {
      expect(cat.id).toBeTruthy();
      expect(cat.name).toBeTruthy();
      expect(Array.isArray(cat.sizes)).toBe(true);
    }
  });

  it("returns sizes for a specific category via config API", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const sizes = await caller.config.sizes({ category: "wallpaper" });
    expect(sizes.length).toBeGreaterThanOrEqual(2);
    expect(sizes[0]).toHaveProperty("id");
    expect(sizes[0]).toHaveProperty("label");
  });
});

// ========== 2. 14种设计风格验证 ==========

describe("14 Design Styles", () => {
  it("has at least 12 style presets", () => {
    expect(STYLE_PRESETS.length).toBeGreaterThanOrEqual(12);
  });

  it("each style has all required fields", () => {
    for (const style of STYLE_PRESETS) {
      expect(style.id).toBeTruthy();
      expect(style.name).toBeTruthy();
      expect(style.nameEn).toBeTruthy();
      expect(style.description).toBeTruthy();
      expect(style.promptHint).toBeTruthy();
      expect(style.promptHint.length).toBeGreaterThan(10);
    }
  });

  it("includes all required style categories", () => {
    const styleIds = STYLE_PRESETS.map((s) => s.id);
    const requiredStyles = [
      "european_modern", "european_classic", "nordic_minimal",
      "middle_east_geometric", "southeast_asia_tropical", "kids_cartoon",
      "chinese_traditional", "art_deco", "boho_ethnic",
      "african_tribal", "indian_mandala", "japanese_zen",
    ];
    for (const id of requiredStyles) {
      expect(styleIds).toContain(id);
    }
  });

  it("returns all styles via API", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const styles = await caller.style.list();
    expect(styles).toHaveLength(STYLE_PRESETS.length);
    expect(styles[0]).toHaveProperty("promptHint");
  });
});

// ========== 3. 产品编号生成 ==========

describe("Product Code Generation", () => {
  it("generates correct format: DA-{CODE}-{DATE}-{SEQ}", () => {
    const code = generateProductCode("wallpaper", 1);
    expect(code).toMatch(/^DA-WP-\d{8}-001$/);
  });

  it("uses correct category codes", () => {
    const testCases: [TemplateCategory, string][] = [
      ["wallpaper", "WP"], ["kitchen", "KT"], ["floor", "FL"],
      ["wall_sticker", "WS"], ["bathroom", "BR"], ["window", "WD"],
      ["fridge", "FG"], ["ps5", "P5"], ["macbook", "MB"], ["drone", "DJ"],
    ];
    for (const [cat, expectedCode] of testCases) {
      const result = generateProductCode(cat, 1);
      expect(result).toContain(`DA-${expectedCode}-`);
    }
  });

  it("pads sequence numbers correctly", () => {
    expect(generateProductCode("wallpaper", 1)).toMatch(/-001$/);
    expect(generateProductCode("wallpaper", 42)).toMatch(/-042$/);
    expect(generateProductCode("wallpaper", 999)).toMatch(/-999$/);
  });

  it("includes today's date", () => {
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const code = generateProductCode("ps5", 5);
    expect(code).toContain(dateStr);
  });
});

// ========== 4. 输出模式 ==========

describe("Output Modes", () => {
  it("has 3 output modes defined", () => {
    expect(Object.keys(OUTPUT_MODE_LABELS)).toHaveLength(3);
    expect(OUTPUT_MODE_LABELS.pattern_only).toBeTruthy();
    expect(OUTPUT_MODE_LABELS.mockup_only).toBeTruthy();
    expect(OUTPUT_MODE_LABELS.both).toBeTruthy();
  });
});

// ========== 5. 模板管理 ==========

describe("Template Management", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("lists templates via public procedure", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const templates = await caller.template.list();
    expect(Array.isArray(templates)).toBe(true);
  });

  it("lists templates filtered by category", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await caller.template.list({ category: "ps5" });
    expect(db.getTemplates).toHaveBeenCalledWith("ps5", undefined, undefined);
  });

  it("initializes preset templates when database is empty", async () => {
    vi.mocked(db.getTemplateCount).mockResolvedValueOnce(0);
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.template.initPresets();
    expect(result.initialized).toBe(true);
    expect(db.createTemplate).toHaveBeenCalledTimes(PRESET_TEMPLATES.length);
  });

  it("skips initialization when templates already exist", async () => {
    vi.mocked(db.getTemplateCount).mockResolvedValueOnce(4);
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.template.initPresets();
    expect(result.initialized).toBe(false);
    expect(db.createTemplate).not.toHaveBeenCalled();
  });

  it("AI generates scene templates for any category", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.template.aiGenerate({
      category: "ps5",
      count: 2,
    });
    expect(result.generated).toBe(2);
    expect(result.templates).toHaveLength(2);
    expect(result.templates[0]).toHaveProperty("imageUrl");
  });

  it("AI generates templates with custom prompt", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.template.aiGenerate({
      category: "macbook",
      count: 1,
      customPrompt: "白色桌面，简约风格",
    });
    expect(result.generated).toBe(1);
  });

  it("uploads custom template with base64 image", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.template.uploadCustom({
      name: "自定义冰箱模板",
      category: "fridge",
      description: "法式对开门冰箱",
      imageBase64: "iVBORw0KGgoAAAANSUhEUg==",
    });
    expect(result).toHaveProperty("id");
    expect(db.createTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "自定义冰箱模板",
        category: "fridge",
        isPreset: 0,
        userId: 1,
      })
    );
  });

  it("deletes a template", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.template.delete({ id: 1 });
    expect(result.success).toBe(true);
    expect(db.deleteTemplate).toHaveBeenCalledWith(1);
  });
});

// ========== 6. 图案生成 ==========

describe("Pattern Generation", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("generates a single pattern with product code", async () => {
    vi.mocked(db.createPattern).mockResolvedValueOnce({ id: 42 });
    vi.mocked(db.getPatternCount).mockResolvedValueOnce(100);
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.pattern.generate({
      prompt: "蓝色海洋波浪纹理",
      style: "nordic_minimal",
      category: "wallpaper",
      sizeId: "wp_53x1000",
    });

    expect(result.id).toBe(42);
    expect(result.status).toBe("completed");
    expect(result.imageUrl).toBeTruthy();
    expect(result.productCode).toMatch(/^DA-WP-/);
    expect(db.createPattern).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        prompt: "蓝色海洋波浪纹理",
        style: "nordic_minimal",
        status: "generating",
        targetCategory: "wallpaper",
        targetSizeId: "wp_53x1000",
      })
    );
  });

  it("generates pattern for PS5 category", async () => {
    vi.mocked(db.createPattern).mockResolvedValueOnce({ id: 50 });
    vi.mocked(db.getPatternCount).mockResolvedValueOnce(200);
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.pattern.generate({
      prompt: "赛博朋克风格",
      category: "ps5",
    });

    expect(result.productCode).toMatch(/^DA-P5-/);
  });

  it("generates pattern for drone category", async () => {
    vi.mocked(db.createPattern).mockResolvedValueOnce({ id: 51 });
    vi.mocked(db.getPatternCount).mockResolvedValueOnce(300);
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.pattern.generate({
      prompt: "迷彩图案",
      category: "drone",
    });

    expect(result.productCode).toMatch(/^DA-DJ-/);
  });

  it("rejects unauthenticated pattern generation", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.pattern.generate({ prompt: "test" })).rejects.toThrow();
  });

  it("creates a batch generation task with default 20 count", async () => {
    vi.mocked(db.createGenerateTask).mockResolvedValueOnce({ id: 10 });
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.pattern.batchGenerate({
      prompt: "金色几何菱形图案",
      style: "art_deco",
      count: 20,
      outputMode: "both",
      category: "wallpaper",
    });

    expect(result.taskId).toBe(10);
    expect(db.createGenerateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        prompt: "金色几何菱形图案",
        style: "art_deco",
        targetCount: 20,
        status: "running",
        outputMode: "both",
        targetCategory: "wallpaper",
      })
    );
  });

  it("creates batch task with template IDs", async () => {
    vi.mocked(db.createGenerateTask).mockResolvedValueOnce({ id: 11 });
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.pattern.batchGenerate({
      prompt: "热带植物",
      count: 10,
      templateIds: [1, 2, 3],
      outputMode: "mockup_only",
    });

    expect(result.taskId).toBe(11);
    expect(db.createGenerateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        templateIds: [1, 2, 3],
        outputMode: "mockup_only",
      })
    );
  });

  it("generates patterns from reference image", async () => {
    vi.mocked(db.createPattern).mockResolvedValue({ id: 60 });
    vi.mocked(db.getPatternCount).mockResolvedValueOnce(50);
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.pattern.generateFromReference({
      referenceImageBase64: "iVBORw0KGgoAAAANSUhEUg==",
      prompt: "类似风格但更鲜艳",
      style: "middle_east_geometric",
      category: "floor",
      count: 3,
    });

    expect(result.referenceUrl).toBeTruthy();
    expect(result.generated).toBe(3);
    expect(result.patterns).toHaveLength(3);
    expect(result.patterns[0]).toHaveProperty("productCode");
  });

  it("lists patterns for authenticated user", async () => {
    const mockPatterns = [
      { id: 1, prompt: "test", status: "completed", imageUrl: "url1", productCode: "DA-WP-20260311-001" },
      { id: 2, prompt: "test2", status: "completed", imageUrl: "url2", productCode: "DA-KT-20260311-002" },
    ];
    vi.mocked(db.getPatternsByUser).mockResolvedValueOnce(mockPatterns as any);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const patterns = await caller.pattern.list();

    expect(patterns).toHaveLength(2);
    expect(db.getPatternsByUser).toHaveBeenCalledWith(1, 50, 0);
  });
});

// ========== 7. 效果图合成 ==========

describe("Mockup Generation", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("generates a mockup from pattern and template", async () => {
    vi.mocked(db.getPatternById).mockResolvedValueOnce({
      id: 1, imageUrl: "https://example.com/pattern.png", status: "completed",
      userId: 1, prompt: "test", style: null, taskId: null, productCode: "DA-WP-20260311-001",
      createdAt: new Date(),
    } as any);
    vi.mocked(db.getTemplateById).mockResolvedValueOnce({
      id: 1, sceneImageUrl: "https://example.com/scene.png", category: "wallpaper",
      overlayConfig: { points: [], tileScale: 0.3 },
    } as any);
    vi.mocked(db.createMockup).mockResolvedValueOnce({ id: 5 });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.mockup.generate({ patternId: 1, templateId: 1 });

    expect(result.id).toBe(5);
    expect(result.imageUrl).toBeTruthy();
    expect(result.productCode).toBe("DA-WP-20260311-001");
  });

  it("throws error when pattern does not exist", async () => {
    vi.mocked(db.getPatternById).mockResolvedValueOnce(null as any);
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.mockup.generate({ patternId: 999, templateId: 1 })).rejects.toThrow("图案不存在");
  });

  it("batch generates mockups for multiple templates", async () => {
    vi.mocked(db.getPatternById).mockResolvedValueOnce({
      id: 1, imageUrl: "https://example.com/pattern.png", status: "completed",
      productCode: "DA-FL-20260311-001",
    } as any);
    vi.mocked(db.getTemplateById).mockResolvedValue({
      id: 1, sceneImageUrl: "https://example.com/scene.png", category: "floor",
    } as any);
    vi.mocked(db.createMockup).mockResolvedValue({ id: 10 });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const results = await caller.mockup.batchGenerate({
      patternId: 1,
      templateIds: [1, 2, 3],
    });

    expect(results).toHaveLength(3);
    expect(results[0]).toHaveProperty("mockupId");
    expect(results[0]).toHaveProperty("imageUrl");
  });

  it("lists mockups for authenticated user", async () => {
    vi.mocked(db.getMockupsByUser).mockResolvedValueOnce([
      { id: 1, imageUrl: "url1", patternId: 1, templateId: 1, productCode: "DA-WP-20260311-001" },
    ] as any);
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const mockups = await caller.mockup.list();
    expect(mockups).toHaveLength(1);
  });

  it("lists mockups by pattern", async () => {
    vi.mocked(db.getMockupsByPattern).mockResolvedValueOnce([
      { id: 1, imageUrl: "url1" },
      { id: 2, imageUrl: "url2" },
    ] as any);
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const mockups = await caller.mockup.byPattern({ patternId: 1 });
    expect(mockups).toHaveLength(2);
  });
});

// ========== 8. 任务管理 ==========

describe("Task Management", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("lists tasks for authenticated user", async () => {
    vi.mocked(db.getGenerateTasksByUser).mockResolvedValueOnce([
      { id: 1, prompt: "test", status: "completed", targetCount: 20, completedCount: 20 },
    ] as any);
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const tasks = await caller.task.list();
    expect(tasks).toHaveLength(1);
  });

  it("gets task detail with patterns", async () => {
    vi.mocked(db.getGenerateTaskById).mockResolvedValueOnce({
      id: 1, prompt: "test", status: "completed", targetCount: 5,
    } as any);
    vi.mocked(db.getPatternsByTask).mockResolvedValueOnce([
      { id: 1, imageUrl: "url1", productCode: "DA-WP-20260311-001" },
      { id: 2, imageUrl: "url2", productCode: "DA-WP-20260311-002" },
    ] as any);
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const task = await caller.task.getById({ id: 1 });
    expect(task).toBeTruthy();
    expect(task!.patterns).toHaveLength(2);
  });

  it("returns null for non-existent task", async () => {
    vi.mocked(db.getGenerateTaskById).mockResolvedValueOnce(null as any);
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const task = await caller.task.getById({ id: 999 });
    expect(task).toBeNull();
  });
});

// ========== 9. 参考素材上传 ==========

describe("Reference Image Upload", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("uploads reference image and returns URL", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.reference.upload({
      imageBase64: "iVBORw0KGgoAAAANSUhEUg==",
    });
    expect(result.url).toBeTruthy();
  });
});

// ========== 10. 预设模板数据完整性 ==========

describe("Preset Templates Data", () => {
  it("has correct number of preset templates", () => {
    expect(PRESET_TEMPLATES.length).toBeGreaterThanOrEqual(4);
  });

  it("each preset has required fields", () => {
    for (const preset of PRESET_TEMPLATES) {
      expect(preset.name).toBeTruthy();
      expect(preset.category).toBeTruthy();
      expect(preset.sceneImageUrl).toMatch(/^https:\/\//);
      expect(preset.thumbnailUrl).toMatch(/^https:\/\//);
      expect(preset.overlayConfig).toBeTruthy();
      expect(preset.overlayConfig.points).toHaveLength(4);
      expect(typeof preset.overlayConfig.tileScale).toBe("number");
    }
  });

  it("covers basic product categories", () => {
    const categories = PRESET_TEMPLATES.map((t) => t.category);
    expect(categories).toContain("wallpaper");
    expect(categories).toContain("kitchen");
    expect(categories).toContain("floor");
    expect(categories).toContain("wall_sticker");
  });
});

// ========== 11. 多尺寸规格验证 ==========

describe("Product Size Specifications", () => {
  it("wallpaper has standard roll sizes", () => {
    const sizes = CATEGORY_SIZES.wallpaper;
    expect(sizes.length).toBeGreaterThanOrEqual(3);
    const ids = sizes.map(s => s.id);
    expect(ids).toContain("wp_53x1000");
  });

  it("PS5 has panel and controller sizes", () => {
    const sizes = CATEGORY_SIZES.ps5;
    expect(sizes.length).toBeGreaterThanOrEqual(2);
    const ids = sizes.map(s => s.id);
    expect(ids).toContain("p5_39x15");
    expect(ids).toContain("p5_16x10");
  });

  it("MacBook has multiple screen sizes", () => {
    const sizes = CATEGORY_SIZES.macbook;
    expect(sizes.length).toBeGreaterThanOrEqual(3);
    const labels = sizes.map(s => s.label);
    expect(labels.some(l => l.includes("13"))).toBe(true);
    expect(labels.some(l => l.includes("15"))).toBe(true);
    expect(labels.some(l => l.includes("16"))).toBe(true);
  });

  it("drone has Mini, Air, and Mavic sizes", () => {
    const sizes = CATEGORY_SIZES.drone;
    expect(sizes.length).toBeGreaterThanOrEqual(3);
    const labels = sizes.map(s => s.label);
    expect(labels.some(l => l.includes("Mini"))).toBe(true);
    expect(labels.some(l => l.includes("Air"))).toBe(true);
    expect(labels.some(l => l.includes("Mavic"))).toBe(true);
  });

  it("all sizes have valid pixel dimensions", () => {
    for (const [cat, sizes] of Object.entries(CATEGORY_SIZES)) {
      for (const size of sizes) {
        expect(size.outputWidthPx).toBeGreaterThanOrEqual(1000);
        expect(size.outputHeightPx).toBeGreaterThanOrEqual(1000);
      }
    }
  });
});
