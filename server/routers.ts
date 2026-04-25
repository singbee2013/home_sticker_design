import { COOKIE_NAME } from "@shared/const";
import {
  STYLE_PRESETS, PRESET_TEMPLATES, CATEGORY_LABELS, CATEGORY_SIZES,
  TEMPLATE_SCENE_PROMPTS, BATCH_COUNT_OPTIONS,
  DEVICE_MODEL_REFERENCE, isDeviceSkinCategory,
  shouldUseDronePhotorealPipeline,
  AMAZON_LISTING_SLOT_POOL, type AmazonListingSlot,
  DRONE_PHOTOREAL_NEGATIVE_EXTRA,
  DRONE_PHOTOREAL_PHYSICAL_LOCK,
  DRONE_PHOTOREAL_CATREQ,
  DRONE_PHOTOREAL_QUALITY_SUFFIX,
  getDroneModelLockClause,
  generateProductCode, type TemplateCategory, type OutputMode,
  IMAGE_GEN_PROVIDERS, type ImageGenProvider,
} from "@shared/types";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { hashPassword, verifyPassword, createSessionCookie } from "./_core/authUtils";
import {
  getUserByEmail,
  getUserByPhone,
  upsertUser,
  getDb,
  saveSmsCode,
  verifySmsCode,
  saveEmailResetCode,
  verifyEmailResetCode,
  updateUserPasswordByEmail,
} from "./db";
import { sendSmsCode, generateSmsCode } from "./_core/sms";
import { nanoid as _nanoid } from "nanoid";
import { z } from "zod";
import {
  generateImage,
  generateCompositeImage,
  type GenerateImageOptions,
} from "./_core/imageGeneration";
import { generateVideo } from "./_core/videoGeneration";
import { generateVideoClips } from "./_core/wanVideoGeneration";
import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";
import sharp from "sharp";
import {
  getTemplates, getTemplateById, createTemplate, getTemplateCount, deleteTemplate,
  createPattern, updatePattern, deletePattern, getPatternsByUser, getPatternById, getPatternsByTask,
  markStuckGeneratingPatternsFailed,
  createMockup, getMockupsByUser, getMockupsByPattern, deleteMockup,
  createGenerateTask, updateGenerateTask, getGenerateTasksByUser, getGenerateTaskById,
  getPatternCount,
  createProductVideo, updateProductVideo, getProductVideosByUser, getProductVideoById,
  getFavoritesByUser, getFavorite, addFavorite, removeFavorite,
} from "./db";

const allCategories = ["wallpaper", "kitchen", "floor", "wall_sticker", "bathroom", "toilet", "window", "fridge", "ps5", "macbook", "drone"] as const;

/** Category-specific technical requirements for prompt building */
const CATEGORY_PROMPT_REQUIREMENTS: Record<string, string> = {
  wallpaper: "seamless tileable wallpaper pattern, suitable for large wall surfaces, repeat unit clearly defined, elegant interior decor style, 53cm width roll format",
  kitchen: "seamless tileable kitchen backsplash sticker pattern, water-resistant appearance, clean and bright colors, food-safe aesthetic, suitable for tile or cabinet surfaces",
  floor: "seamless tileable floor sticker pattern, non-slip textured appearance, durable and wear-resistant look, square tile format, realistic floor material aesthetic",
  wall_sticker: "decorative wall sticker design, single scene or motif, clear edges suitable for cutting, vibrant and eye-catching, suitable for bedroom or living room accent wall",
  bathroom: "seamless tileable bathroom sticker pattern, water-resistant aesthetic, fresh and clean color palette, suitable for bathroom tiles or walls",
  toilet: "decorative toilet lid sticker, fits rectangular cover shape, stylish and humorous or elegant design, smooth surface look",
  window: "window frosted film sticker pattern, semi-transparent aesthetic, geometric or floral motif, privacy-friendly design, light-diffusing appearance",
  fridge: "full-coverage refrigerator sticker wrap design, fits tall vertical surface, bold and colorful or minimalist kitchen aesthetic",
  ps5: "flat decorative skin wrap artwork for game consoles: honor the exact console named in the user prompt (Sony / Nintendo / Microsoft / handheld PC); do not swap for a different silhouette; seamless 2D graphic pattern suitable for printing on vinyl",
  macbook: "flat decorative skin wrap artwork for laptops: honor the exact laptop line named in the user prompt; lid-shaped composition; do not change bezel or hinge layout vs that model; seamless 2D graphic pattern for vinyl printing",
  drone: "flat decorative skin wrap artwork for camera drones: honor the exact UAV model named in the user prompt (DJI / Autel / etc.); top-shell layout and gimbal pod must match that model; no invented accessories; seamless 2D graphic pattern for vinyl printing",
};

// Universal texture/quality suffix appended to every generation prompt.
// These terms push diffusion models toward hand-crafted, high-fidelity output
// and prevent the AI from defaulting to the over-smooth "digital illustration" look.
const TEXTURE_QUALITY_SUFFIX = [
  "hand-painted texture with visible individual brushstrokes",
  "natural paper grain and organic surface imperfections",
  "rich authentic material depth and tactile feel",
  "ultra-sharp crisp fine details",
  "masterpiece quality, highly detailed 8K",
  "professional surface pattern design",
  "accurate color fidelity, true-to-life pigment colors",
  "seamless tileable repeat pattern",
  "no text, no watermark, no border",
].join(", ");

function buildCategoryPrompt(
  userPrompt: string,
  category: string,
  styleHint: string,
  options?: { photorealDetectionPrompt?: string }
): string {
  const stylePart = styleHint ? `${styleHint} style, ` : "";
  const detectPrompt = options?.photorealDetectionPrompt ?? userPrompt;

  // 无人机 + 实拍/产品图描述：与「平面无缝纹样」目标冲突，改走产品摄影提示 + Kolors scene + 负面拓扑约束
  if (category === "drone" && shouldUseDronePhotorealPipeline(category, detectPrompt)) {
    const fidelity = `${DEVICE_MODEL_REFERENCE.drone.promptFidelity} `;
    const modelLock = getDroneModelLockClause(detectPrompt);
    return `${stylePart}${fidelity}${DRONE_PHOTOREAL_PHYSICAL_LOCK} ${modelLock} ${userPrompt}, ${DRONE_PHOTOREAL_CATREQ}, ${DRONE_PHOTOREAL_QUALITY_SUFFIX}`;
  }

  const catReq = CATEGORY_PROMPT_REQUIREMENTS[category] || "seamless decorative pattern for home decor";
  const fidelity =
    isDeviceSkinCategory(category) ? `${DEVICE_MODEL_REFERENCE[category].promptFidelity} ` : "";
  return `${stylePart}${fidelity}${userPrompt}, ${catReq}, ${TEXTURE_QUALITY_SUFFIX}`;
}

function dronePhotorealGenOptions(category: string, baseUserPrompt: string) {
  if (category !== "drone" || !shouldUseDronePhotorealPipeline(category, baseUserPrompt)) return {};
  return {
    mode: "scene" as const,
    forceKolors: true,
    additionalNegativePrompt: DRONE_PHOTOREAL_NEGATIVE_EXTRA,
  };
}

const AMAZON_FEATURE_MAP = {
  waterproof: "waterproof surface",
  moistureproof: "moisture resistant finish",
  selfAdhesive: "self-adhesive backing",
  easyApply: "easy bubble-free application",
} as const;

function buildAmazonListingBackgroundPrompt(options: {
  slot: AmazonListingSlot;
  category: TemplateCategory;
  productTitle?: string;
  brandName?: string;
  sizeSpec?: string;
  featureFlags: {
    waterproof: boolean;
    moistureproof: boolean;
    selfAdhesive: boolean;
    easyApply: boolean;
  };
}): string {
  const categoryLabel = CATEGORY_LABELS[options.category];
  const productName = (options.productTitle || `${categoryLabel} 产品`).trim();
  const brand = options.brandName?.trim() ? `${options.brandName.trim()} ` : "";
  const features = (Object.entries(options.featureFlags) as Array<[keyof typeof AMAZON_FEATURE_MAP, boolean]>)
    .filter(([, enabled]) => enabled)
    .map(([key]) => AMAZON_FEATURE_MAP[key]);
  const featureSentence = features.length > 0
    ? `Scene should visually support product claims: ${features.join(", ")}.`
    : "Scene should support practical home-use benefits and clean premium finish.";
  const sizeSentence = options.sizeSpec?.trim()
    ? `Leave clean negative space for size annotation ${options.sizeSpec.trim()}.`
    : "Dimension requirement: add clean measurement annotation without clutter.";

  const common = [
    `Photorealistic Amazon ecommerce background scene for ${brand}${productName}.`,
    "Generate only the background environment; do not include any hero product in frame.",
    "No foreground product object, no duplicate item, no floating stickers, no watermark.",
  ];

  switch (options.slot) {
    case "main":
      return [
        ...common,
        "Pure white studio background (#FFFFFF), subtle ground shadow only, centered composition space for product cutout.",
      ].join(" ");
    case "dimension":
      return [
        ...common,
        sizeSentence,
        "Keep white or very light neutral background with enough empty margins.",
      ].join(" ");
    case "detail_1":
    case "detail_2":
    case "detail_3":
      return [
        ...common,
        "Close-up friendly neutral background for material detail presentation and edge finishing callouts.",
        featureSentence,
      ].join(" ");
    case "feature_waterproof":
      return [...common, "Realistic kitchen or bathroom context with water droplets and wipe-clean cues; leave center area for product placement."].join(" ");
    case "feature_moistureproof":
      return [...common, "Humid environment cues (soft steam/damp air) in clean interior scene; leave center area clear for product placement."].join(" ");
    case "feature_adhesive_easy_apply":
      return [...common, "Simple installation context with one hand gesture hint and clean surface; reserve central focus area for product."].join(" ");
    case "feature_install_steps":
      return [...common, "Three-zone background layout suitable for peel-align-press storytelling; no product objects in scene."].join(" ");
    case "feature_material_closeup":
      return [...common, "Close-up texture-friendly neutral background emphasizing durability and premium finish."].join(" ");
    case "feature_after_install":
      return [...common, "Before/after split-friendly interior background composition with clear left and right zones."].join(" ");
    case "lifestyle_1":
    case "lifestyle_2":
    case "lifestyle_3":
    case "lifestyle_4":
    default:
      return [
        ...common,
        "Lifestyle conversion background: realistic home interior context, tasteful styling and natural lighting, leave hero area unobstructed.",
        featureSentence,
      ].join(" ");
  }
}

// ────────────────────────────────────────────────
// Video prompt builder — converts structured config to Runway-optimized text
// ────────────────────────────────────────────────
type VideoCharacter = "none" | "hand_female" | "model_female" | "model_male" | "couple" | "family";
type VideoScene = "living_room" | "bedroom" | "kitchen" | "scandinavian" | "japanese" | "luxury" | "studio" | "outdoor";
type VideoCamera = "push_in" | "orbit" | "pan" | "tilt" | "zoom_detail" | "static";
type VideoLighting = "morning" | "golden" | "natural" | "studio" | "dramatic";

const CHARACTER_PROMPTS: Record<VideoCharacter, string> = {
  none: "product-only showcase with no people, elegant minimalist presentation",
  hand_female: "a woman's elegantly manicured hand gently caresses the surface",
  model_female: "stylish woman in fashionable casual outfit, naturally interacting with the home decor",
  model_male: "modern male homeowner appreciating the design, casual sophisticated style",
  couple: "young couple in their cozy modern home, warm lifestyle atmosphere",
  family: "warm family home environment, welcoming and inviting atmosphere",
};

const SCENE_PROMPTS: Record<VideoScene, string> = {
  living_room: "cozy modern living room, warm ambient lighting, comfortable furnishings",
  bedroom: "serene minimalist bedroom, soft diffused lighting, peaceful atmosphere",
  kitchen: "bright contemporary kitchen, natural window light, clean modern aesthetic",
  scandinavian: "Scandinavian minimalist interior, white walls, natural wood textures, hygge warmth",
  japanese: "Japanese wabi-sabi inspired interior, tatami tones, serene soft natural light",
  luxury: "luxury modern interior, high-end marble and brass finishes, sophisticated upscale ambience",
  studio: "clean professional white studio, even commercial lighting, product photography aesthetic",
  outdoor: "outdoor garden terrace, lush greenery background, warm golden afternoon light",
};

const CAMERA_PROMPTS: Record<VideoCamera, string> = {
  push_in: "slow cinematic dolly push-in, gradually revealing surface texture and fine details",
  orbit: "smooth slow orbital camera movement, 360-degree elegant product showcase",
  pan: "smooth horizontal camera pan through the beautifully styled space",
  tilt: "slow upward tilt from floor-level detail rising to full product view",
  zoom_detail: "begins wide then slow deliberate zoom into surface texture and pattern detail",
  static: "steady static camera, subtle natural ambient motion, soft curtain sway",
};

const LIGHTING_PROMPTS: Record<VideoLighting, string> = {
  morning: "soft morning sunlight filtering through sheer curtains, warm golden-white tones",
  golden: "warm golden hour light, beautiful long shadows, romantic late afternoon glow",
  natural: "clean balanced natural daylight, diffused soft shadows, true-to-life colors",
  studio: "professional even studio illumination, no harsh shadows, commercial product quality",
  dramatic: "dramatic artistic side lighting, moody atmosphere, strong shadow contrast",
};

function buildVideoPrompt(config: {
  character: VideoCharacter;
  scene: VideoScene;
  camera: VideoCamera;
  lighting: VideoLighting;
  customText?: string;
  isSecondClip?: boolean;
}): string {
  const parts: string[] = [];

  if (config.isSecondClip) {
    parts.push("extreme close-up of surface texture and intricate pattern details, macro photography style");
    parts.push("slow macro zoom with beautiful shallow depth of field");
  } else {
    parts.push(CHARACTER_PROMPTS[config.character]);
    parts.push(CAMERA_PROMPTS[config.camera]);
  }

  parts.push(SCENE_PROMPTS[config.scene]);
  parts.push(LIGHTING_PROMPTS[config.lighting]);

  if (config.customText?.trim()) {
    parts.push(config.customText.trim());
  }

  parts.push(
    "cinematic 4K quality, professional commercial video production, smooth motion, high-end advertising aesthetic, no text overlay, no watermark"
  );

  return parts.join(", ");
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),

    login: publicProcedure
      .input(
        z.object({
          email: z.string().trim().toLowerCase().pipe(z.string().email()),
          password: z.string().min(1),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Avoid misleading "password wrong" when DB is not configured/available.
        const db = await getDb();
        if (!db) {
          throw new Error("服务器数据库未连接：请检查 DATABASE_URL / 数据库服务是否正常");
        }
        const user = await getUserByEmail(input.email);
        if (!user) {
          throw new Error("邮箱或密码错误");
        }
        // Common: user created via phone/OAuth and has no local password yet.
        if (!user.passwordHash) {
          throw new Error("该账号未设置邮箱密码，请点击「忘记密码」先设置密码");
        }
        const ok = await verifyPassword(input.password, user.passwordHash);
        if (!ok) throw new Error("邮箱或密码错误");
        await createSessionCookie(ctx.res, { openId: user.openId, name: user.name ?? user.email ?? "" });
        return { success: true, user } as const;
      }),

    register: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string().min(6),
        name: z.string().min(1),
        adminSecret: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const existing = await getUserByEmail(input.email);
        if (existing) throw new Error("该邮箱已注册");
        const passwordHash = await hashPassword(input.password);
        const openId = `local_${_nanoid()}`;
        await upsertUser({
          openId,
          email: input.email,
          name: input.name,
          passwordHash,
          loginMethod: "email",
          lastSignedIn: new Date(),
        });
        return { success: true } as const;
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),

    /** Step 1: send a 6-digit verification code to the phone number */
    sendSmsCode: publicProcedure
      .input(z.object({ phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入正确的手机号") }))
      .mutation(async ({ input }) => {
        const code = generateSmsCode();
        await saveSmsCode(input.phone, code, 300);
        try {
          await sendSmsCode(input.phone, code);
          return { success: true, devCode: null as string | null };
        } catch (err) {
          // Fallback for local/self-hosted deployments: return one-time code to frontend toast.
          // Set SMS_STRICT_MODE=true to disable this fallback and force real SMS delivery.
          const strictMode = process.env.SMS_STRICT_MODE === "true";
          if (!strictMode) {
            console.warn("[SMS] Provider unavailable, using fallback code:", code, err);
            return { success: true, devCode: code };
          }
          throw err;
        }
      }),

    /** Step 2: verify code and login / auto-register */
    loginWithPhone: publicProcedure
      .input(z.object({
        phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入正确的手机号"),
        code: z.string().length(6, "验证码为6位数字"),
      }))
      .mutation(async ({ ctx, input }) => {
        const valid = await verifySmsCode(input.phone, input.code);
        if (!valid) throw new Error("验证码错误或已过期，请重新获取");

        let user = await getUserByPhone(input.phone);
        if (!user) {
          // Auto-register a new user with phone
          const openId = `phone_${_nanoid()}`;
          await upsertUser({ openId, phone: input.phone, loginMethod: "phone", lastSignedIn: new Date() });
          user = await getUserByPhone(input.phone);
        } else {
          await upsertUser({ openId: user.openId, lastSignedIn: new Date() });
          user = await getUserByPhone(input.phone);
        }
        if (!user) throw new Error("登录失败，请重试");
        await createSessionCookie(ctx.res, { openId: user.openId, name: user.name ?? user.phone ?? "" });
        return { success: true, user } as const;
      }),

    /** 忘记密码：发送邮箱验证码 */
    sendEmailResetCode: publicProcedure
      .input(z.object({ email: z.string().email("请输入正确邮箱地址") }))
      .mutation(async ({ input }) => {
        const user = await getUserByEmail(input.email);
        // 安全策略：无论是否存在该邮箱都返回成功，避免邮箱枚举。
        if (!user) {
          return { success: true, devCode: null as string | null };
        }
        const code = generateSmsCode();
        await saveEmailResetCode(input.email, code, 600);

        // Self-hosted fallback: no mail provider configured yet.
        // In non-strict mode, return one-time code so users can complete reset.
        const strictMode = process.env.EMAIL_STRICT_MODE === "true";
        if (strictMode) {
          throw new Error("邮件服务未配置，请联系管理员");
        }
        return { success: true, devCode: code };
      }),

    /** 忘记密码：邮箱验证码重置密码 */
    resetPasswordWithCode: publicProcedure
      .input(z.object({
        email: z.string().email("请输入正确邮箱地址"),
        code: z.string().length(6, "验证码为6位数字"),
        newPassword: z.string().min(6, "密码至少6位"),
      }))
      .mutation(async ({ input }) => {
        const valid = await verifyEmailResetCode(input.email, input.code);
        if (!valid) throw new Error("验证码错误或已过期，请重新获取");

        const passwordHash = await hashPassword(input.newPassword);
        const updated = await updateUserPasswordByEmail(input.email, passwordHash);
        if (!updated) throw new Error("账号不存在或无法更新，请联系管理员");
        return { success: true } as const;
      }),
  }),

  // ========== 模板管理 ==========
  template: router({
    list: publicProcedure
      .input(z.object({ category: z.string().optional(), targetMarket: z.string().optional(), sceneAngle: z.string().optional() }).optional())
      .query(async ({ input }) => {
        return getTemplates(input?.category, input?.targetMarket, input?.sceneAngle);
      }),

    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return getTemplateById(input.id);
      }),

    count: publicProcedure
      .input(z.object({ category: z.string().optional() }).optional())
      .query(async ({ input }) => {
        return getTemplateCount(input?.category);
      }),

    /** 初始化预设模板 */
    initPresets: protectedProcedure.mutation(async () => {
      const count = await getTemplateCount();
      if (count > 0) return { initialized: false, message: "模板已存在" };

      for (const preset of PRESET_TEMPLATES) {
        await createTemplate({
          name: preset.name,
          category: preset.category,
          description: preset.description,
          sceneImageUrl: preset.sceneImageUrl,
          thumbnailUrl: preset.thumbnailUrl,
          overlayConfig: preset.overlayConfig,
          isPreset: 1,
        });
      }
      return { initialized: true, message: `已初始化 ${PRESET_TEMPLATES.length} 个预设模板` };
    }),

    /** AI智能生成场景模板 */
    aiGenerate: protectedProcedure
      .input(z.object({
        category: z.enum(allCategories),
        count: z.number().min(1).max(10).default(3),
        customPrompt: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const basePrompt = TEMPLATE_SCENE_PROMPTS[input.category];
        const categoryLabel = CATEGORY_LABELS[input.category];
        const results: { id: number; name: string; imageUrl: string }[] = [];

        const interiorStyles = ["modern minimalist", "Japandi", "Scandinavian", "mid-century modern", "transitional", "contemporary luxury"];
        const lightingStyles = ["warm morning light", "soft afternoon diffused light", "golden hour glow", "cool overcast daylight", "dramatic shadow play", "bright studio lighting"];
        const photoSuffix = "RAW photo, DSLR, photorealistic, hyperrealistic, ultra-detailed, 8K resolution, perfect exposure, no digital art, not AI-generated, not 3D render, not illustration, not CGI";
        const isDeviceScene = isDeviceSkinCategory(input.category);

        const errors: string[] = [];
        for (let i = 0; i < input.count; i++) {
          // Rate-limit guard: wait 3s between each request to avoid 429 IPM limit
          if (i > 0) await new Promise((r) => setTimeout(r, 3000));

          try {
            const customPart = input.customPrompt?.trim()
              ? `User notes: ${input.customPrompt.trim()}. `
              : "";
            const variation = isDeviceScene
              ? `${basePrompt} ${customPart}Keep the IDENTICAL real product model, lens angle, framing, and accessory set across every image in this batch (image ${i + 1} of ${input.count}); only vary ${lightingStyles[i % 6]} and subtle background tone—do not change hardware silhouette or swap brands. ${photoSuffix}.`
              : input.customPrompt
                ? `${basePrompt}. Additional requirement: ${input.customPrompt}. Variation ${i + 1}. ${photoSuffix}.`
                : `${basePrompt}. Variation ${i + 1} — use a ${interiorStyles[i % 6]} interior style with ${lightingStyles[i % 6]}. ${photoSuffix}.`;

            const { url } = await generateImage({ prompt: variation, mode: "scene" });
            if (!url) {
              errors.push("上游未返回图片地址");
              continue;
            }

            const name = `${categoryLabel}场景 #${Date.now().toString(36).slice(-4).toUpperCase()}`;
            const { id } = await createTemplate({
              name,
              category: input.category,
              description: input.customPrompt || `AI生成的${categoryLabel}场景模板`,
              sceneImageUrl: url,
              thumbnailUrl: url,
              overlayConfig: getDefaultOverlayConfig(input.category),
              isPreset: 0,
              userId: ctx.user.id,
            });

            results.push({ id, name, imageUrl: url });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            errors.push(msg);
            console.error(`[TemplateGen] Failed to generate template ${i + 1}:`, err);
          }
        }

        if (results.length === 0) {
          const hint =
            errors.length > 0
              ? errors[errors.length - 1]
              : "请检查 GEMINI_API_KEY / SILICONFLOW_API_KEY、账户内模型权限，以及 OSS 配置（OSS_ACCESS_KEY_* / OSS_BUCKET）。";
          throw new Error(`未能生成任何场景模板。${hint}`);
        }

        return { generated: results.length, templates: results };
      }),

    /** 上传自定义模板 */
    uploadCustom: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        category: z.enum(allCategories),
        description: z.string().optional(),
        imageBase64: z.string(),
        overlayConfig: z.object({
          points: z.array(z.object({ x: z.number(), y: z.number() })),
          tileScale: z.number(),
        }).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const buffer = Buffer.from(input.imageBase64, "base64");
        const fileKey = `templates/custom-${ctx.user.id}-${nanoid()}.png`;
        const { url } = await storagePut(fileKey, buffer, "image/png");

        const result = await createTemplate({
          name: input.name,
          category: input.category,
          description: input.description ?? null,
          sceneImageUrl: url,
          thumbnailUrl: url,
          overlayConfig: input.overlayConfig || getDefaultOverlayConfig(input.category),
          isPreset: 0,
          userId: ctx.user.id,
        });
        return result;
      }),

    /** 删除模板 */
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteTemplate(input.id);
        return { success: true };
      }),
  }),

  // ========== 图案生成 ==========
  pattern: router({
    /** 单张AI图案生成 */
    generate: protectedProcedure
      .input(z.object({
        prompt: z.string().min(1),
        style: z.string().optional(),
        category: z.enum(allCategories).optional(),
        sizeId: z.string().optional(),
        referenceImageUrl: z.string().optional(),
        targetMarket: z.string().optional(),
        generateSeamless: z.boolean().optional(),
        imageProvider: z.enum(IMAGE_GEN_PROVIDERS).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const stylePreset = STYLE_PRESETS.find(s => s.id === input.style);
        const styleHint = stylePreset?.promptHint ?? "";
        const category = input.category || "wallpaper";
        const fullPrompt = buildCategoryPrompt(input.prompt, category, styleHint);
        const dronePhotoreal = category === "drone" && shouldUseDronePhotorealPipeline(category, input.prompt);

        // Generate product code
        const patternCount = await getPatternCount();
        const productCode = generateProductCode(category as TemplateCategory, patternCount + 1);

        const { id: patternId } = await createPattern({
          userId: ctx.user.id,
          prompt: input.prompt,
          style: input.style ?? null,
          imageUrl: "",
          status: "generating",
          productCode,
          targetCategory: input.category ?? null,
          targetSizeId: input.sizeId ?? null,
          referenceImageUrl: input.referenceImageUrl ?? null,
        });

        try {
          const genOptions: GenerateImageOptions = {
            prompt: fullPrompt,
            ...dronePhotorealGenOptions(category, input.prompt),
          };
          if (input.referenceImageUrl) {
            genOptions.originalImages = [{ url: input.referenceImageUrl, mimeType: "image/png" }];
          }
          if (input.imageProvider && input.imageProvider !== "auto") {
            genOptions.provider = input.imageProvider;
          }

          const { url } = await generateImage(genOptions);
          if (!url) throw new Error("Image generation returned no URL");

          // 无人机实拍主图不是「无缝纹样」，不要再做 2x2 拼贴衍生（避免二次畸变）
          const tilePrompt = `Create a 2x2 tiled repeat of this decorative pattern, showing how it looks when seamlessly repeated in a grid. The result should demonstrate the pattern's continuity and visual harmony.`;
          let tileImageUrl: string | null = null;
          if (!dronePhotoreal) {
            try {
              const tileResult = await generateImage({
                prompt: tilePrompt,
                originalImages: [{ url, mimeType: "image/png" }],
                ...(input.imageProvider && input.imageProvider !== "auto"
                  ? { provider: input.imageProvider }
                  : {}),
              });
              tileImageUrl = tileResult.url ?? null;
            } catch {
              // Tile generation is optional, don't fail the whole operation
            }
          }

          await updatePattern(patternId, {
            imageUrl: url,
            status: "completed",
            tileImageUrl,
          });

          return { id: patternId, imageUrl: url, tileImageUrl, seamlessImageUrl: null as string | null, productCode, status: "completed" as const };
        } catch (error: any) {
          await updatePattern(patternId, { status: "failed" });
          throw error;
        }
      }),

    /** 批量生成任务 */
    batchGenerate: protectedProcedure
      .input(z.object({
        prompt: z.string().min(1),
        style: z.string().optional(),
        count: z.number().min(1).max(100).default(20),
        templateIds: z.array(z.number()).optional(),
        category: z.enum(allCategories).optional(),
        sizeId: z.string().optional(),
        outputMode: z.enum(["pattern_only", "mockup_only", "both"]).default("both"),
        referenceImageUrl: z.string().optional(),
        targetMarket: z.string().optional(),
        generateSeamless: z.boolean().optional(),
        imageProvider: z.enum(IMAGE_GEN_PROVIDERS).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id: taskId } = await createGenerateTask({
          userId: ctx.user.id,
          prompt: input.prompt,
          style: input.style ?? null,
          targetCount: input.count,
          templateIds: input.templateIds ?? [],
          status: "running",
          outputMode: input.outputMode,
          targetCategory: input.category ?? null,
          targetSizeId: input.sizeId ?? null,
          referenceImageUrl: input.referenceImageUrl ?? null,
        });

        // Start generating in background
        processBatchGeneration(taskId, ctx.user.id, input).catch(err => {
          console.error(`[BatchGen] Task ${taskId} failed:`, err);
        });

        return { taskId };
      }),

    /** 亚马逊图集：默认10张，可扩展到15张 */
    generateAmazonListingSet: protectedProcedure
      .input(z.object({
        productImageBase64: z.string().min(1),
        productTitle: z.string().optional(),
        brandName: z.string().optional(),
        category: z.enum(allCategories).default("wall_sticker"),
        count: z.number().min(8).max(15).default(10),
        sizeSpec: z.string().optional(),
        featureFlags: z.object({
          waterproof: z.boolean().default(true),
          moistureproof: z.boolean().default(true),
          selfAdhesive: z.boolean().default(true),
          easyApply: z.boolean().default(true),
        }).default({
          waterproof: true,
          moistureproof: true,
          selfAdhesive: true,
          easyApply: true,
        }),
      }))
      .mutation(async ({ ctx, input }) => {
        const buffer = Buffer.from(input.productImageBase64, "base64");
        const refKey = `listing-refs/${ctx.user.id}-${nanoid()}.png`;
        const { url: referenceUrl } = await storagePut(refKey, buffer, "image/png");

        const targetCount = Math.min(input.count, AMAZON_LISTING_SLOT_POOL.length);
        const summaryPrompt = [
          "[amazon_listing_set]",
          input.productTitle ? `title=${input.productTitle}` : "",
          input.brandName ? `brand=${input.brandName}` : "",
          `category=${input.category}`,
          `count=${targetCount}`,
          input.sizeSpec ? `size=${input.sizeSpec}` : "",
          `features=${JSON.stringify(input.featureFlags)}`,
        ].filter(Boolean).join(" ");

        const { id: taskId } = await createGenerateTask({
          userId: ctx.user.id,
          prompt: summaryPrompt,
          style: "amazon_listing_set",
          targetCount,
          templateIds: [],
          status: "running",
          outputMode: "pattern_only",
          targetCategory: input.category,
          referenceImageUrl: referenceUrl,
        });

        processAmazonListingGeneration(taskId, ctx.user.id, {
          ...input,
          referenceImageUrl: referenceUrl,
          count: targetCount,
        }).catch((err) => {
          console.error(`[AmazonListing] Task ${taskId} failed:`, err);
        });

        return { taskId, targetCount };
      }),

    /** 从参考素材生成类似图案 */
    generateFromReference: protectedProcedure
      .input(z.object({
        referenceImageBase64: z.string(),
        prompt: z.string().optional(),
        style: z.string().optional(),
        category: z.enum(allCategories).optional(),
        count: z.number().min(1).max(10).default(3),
        similarity: z.number().min(50).max(99).default(75),
        imageProvider: z.enum(IMAGE_GEN_PROVIDERS).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Upload reference image to OSS
        const buffer = Buffer.from(input.referenceImageBase64, "base64");
        const refKey = `references/${ctx.user.id}-${nanoid()}.png`;
        const { url: referenceUrl } = await storagePut(refKey, buffer, "image/png");

        const category = input.category || "wallpaper";
        const catReq = CATEGORY_PROMPT_REQUIREMENTS[category] || "seamless decorative pattern";
        const deviceFidelity = isDeviceSkinCategory(category)
          ? `${DEVICE_MODEL_REFERENCE[category].promptFidelity} `
          : "";

        /**
         * Three-tier generation logic:
         *
         * Tier 1 — Pure reference (no prompt text, no style selected):
         *   Reference image is the ONLY creative dimension.
         *   ipScale = 0.99 (max),  guidance_scale will be set to 2.0 in image gen.
         *   Text prompt = minimal (just category + quality markers).
         *
         * Tier 2 — Mixed (has text description and/or style selection):
         *   80% reference visual influence (ipScale = 0.85 default, slider 70-99%).
         *   20% text/style influence.
         *   Text prompt includes user description + style + category.
         *
         * Tier 3 — Text-only (no reference): handled in separate mutation.
         */
        const hasTextInput = !!(input.prompt?.trim() || input.style);
        let ipScale: number;
        let buildPrompt: (variantIdx: number) => string;

        if (!hasTextInput) {
          // ── Tier 1: Reference is everything ──────────────────────────────────
          // Scale 0.92 (vs 0.99) gives background-color text enough authority to
          // prevent IP-Adapter colour bleeding while keeping style fidelity high.
          ipScale = 0.92;
          buildPrompt = (i) => [
            deviceFidelity,
            catReq,
            isDeviceSkinCategory(category) && i > 0
              ? `batch image ${i + 1}: same subject silhouette and camera pose as image 1; only micro-variation in exposure or grain`
              : i > 0 ? `variation ${i + 1}, same composition` : "",
            "no text no watermark, high resolution",
          ].filter(Boolean).join(", ");
        } else {
          // ── Tier 2: Mixed (80% reference + 20% text) ─────────────────────────
          // Slider controls reference weight: default 80% (0.80 → 0.99 range).
          // Style preset is included but IP-Adapter at 0.80+ keeps it subordinate.
          ipScale = input.similarity / 100;  // 80-99%
          const styleHint = STYLE_PRESETS.find(s => s.id === input.style)?.promptHint ?? "";
          buildPrompt = (i) => [
            deviceFidelity,
            styleHint ? `${styleHint} style` : "",
            input.prompt ? input.prompt : "",
            catReq,
            isDeviceSkinCategory(category) && i > 0
              ? `batch image ${i + 1}: identical real product model vs image 1; same reference influence; vary only minor decal noise—do not change outline`
              : i > 0 ? `variation ${i + 1}, same reference style` : "",
            "no text no watermark, high resolution",
          ].filter(Boolean).join(", ");
        }

        const patternCount = await getPatternCount();
        const results: { id: number; imageUrl: string; productCode: string; seamlessImageUrl: string | null }[] = [];

        for (let i = 0; i < input.count; i++) {
          let patternId: number | undefined;
          try {
            const productCode = generateProductCode(category as TemplateCategory, patternCount + i + 1);
            const prompt = buildPrompt(i);

            const created = await createPattern({
              userId: ctx.user.id,
              prompt: input.prompt || "基于参考素材生成",
              style: input.style ?? null,
              imageUrl: "",
              status: "generating",
              productCode,
              targetCategory: input.category ?? null,
              referenceImageUrl: referenceUrl,
            });
            patternId = created.id;

            const { url } = await generateImage({
              prompt,
              originalImages: [{ url: referenceUrl, mimeType: "image/png" }],
              ipAdapterScale: ipScale,
              pureReferenceMode: !hasTextInput,
              ...(input.imageProvider && input.imageProvider !== "auto"
                ? { provider: input.imageProvider }
                : {}),
            });

            if (!url) throw new Error("No URL returned");

            await updatePattern(patternId, { imageUrl: url, status: "completed" });
            results.push({ id: patternId, imageUrl: url, productCode, seamlessImageUrl: null });
          } catch (err) {
            console.error(`[RefGen] Pattern ${i + 1} failed:`, err);
            if (patternId !== undefined) {
              await updatePattern(patternId, { status: "failed" }).catch((e) =>
                console.error(`[RefGen] Failed to mark pattern ${patternId} as failed:`, e)
              );
            }
          }
        }

        return { referenceUrl, generated: results.length, patterns: results };
      }),

    list: protectedProcedure
      .input(z.object({ limit: z.number().optional(), offset: z.number().optional() }).optional())
      .query(async ({ ctx, input }) => {
        return getPatternsByUser(ctx.user.id, input?.limit ?? 50, input?.offset ?? 0);
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return getPatternById(input.id);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const pattern = await getPatternById(input.id);
        if (!pattern) throw new Error("图案不存在");
        if (pattern.userId !== ctx.user.id) throw new Error("无权删除此图案");
        await deletePattern(input.id);
        return { success: true };
      }),

    /** 修复历史里「生成中」但无图的卡死记录（批量失败时曾未回写状态） */
    recoverStuck: protectedProcedure.mutation(async ({ ctx }) => {
      await markStuckGeneratingPatternsFailed(ctx.user.id);
      return { success: true } as const;
    }),
  }),

  // ========== 效果图合成 ==========
  mockup: router({
    generate: protectedProcedure
      .input(z.object({
        patternId: z.number(),
        templateId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const pattern = await getPatternById(input.patternId);
        if (!pattern || !pattern.imageUrl) throw new Error("图案不存在或未完成生成");

        const template = await getTemplateById(input.templateId);
        if (!template) throw new Error("模板不存在");

        const categoryLabel = CATEGORY_LABELS[template.category as TemplateCategory] || template.category;
        const { url } = await generateCompositeImage({
          sceneImageUrl: template.sceneImageUrl,
          patternImageUrl: pattern.imageUrl,
          categoryLabel,
        });

        if (!url) throw new Error("效果图生成失败");

        const productCode = pattern.productCode || undefined;
        const { id } = await createMockup({
          userId: ctx.user.id,
          patternId: input.patternId,
          templateId: input.templateId,
          imageUrl: url,
          productCode: productCode ?? null,
        });

        return { id, imageUrl: url, productCode };
      }),

    batchGenerate: protectedProcedure
      .input(z.object({
        patternId: z.number(),
        templateIds: z.array(z.number()).min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        const pattern = await getPatternById(input.patternId);
        if (!pattern || !pattern.imageUrl) throw new Error("图案不存在或未完成生成");

        const results: { templateId: number; mockupId: number; imageUrl: string; error?: string }[] = [];

        for (const templateId of input.templateIds) {
          try {
            const template = await getTemplateById(templateId);
            if (!template) {
              results.push({ templateId, mockupId: 0, imageUrl: "", error: "模板不存在" });
              continue;
            }

            const categoryLabel = CATEGORY_LABELS[template.category as TemplateCategory] || template.category;
            const { url } = await generateCompositeImage({
              sceneImageUrl: template.sceneImageUrl,
              patternImageUrl: pattern.imageUrl,
              categoryLabel,
            });

            if (!url) throw new Error("生成失败");

            const { id } = await createMockup({
              userId: ctx.user.id,
              patternId: input.patternId,
              templateId,
              imageUrl: url,
              productCode: pattern.productCode ?? null,
            });

            results.push({ templateId, mockupId: id, imageUrl: url });
          } catch (err: any) {
            results.push({ templateId, mockupId: 0, imageUrl: "", error: err.message });
          }
        }

        return results;
      }),

    list: protectedProcedure
      .input(z.object({ limit: z.number().optional(), offset: z.number().optional() }).optional())
      .query(async ({ ctx, input }) => {
        return getMockupsByUser(ctx.user.id, input?.limit ?? 50, input?.offset ?? 0);
      }),

    byPattern: protectedProcedure
      .input(z.object({ patternId: z.number() }))
      .query(async ({ input }) => {
        return getMockupsByPattern(input.patternId);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const list = await getMockupsByUser(ctx.user.id, 1000, 0);
        const own = list.find((m) => m.id === input.id);
        if (!own) throw new Error("效果图不存在或无权删除");
        await deleteMockup(input.id);
        return { success: true };
      }),
  }),

  // ========== 生成任务管理 ==========
  task: router({
    list: protectedProcedure
      .input(z.object({ limit: z.number().optional(), offset: z.number().optional() }).optional())
      .query(async ({ ctx, input }) => {
        return getGenerateTasksByUser(ctx.user.id, input?.limit ?? 20, input?.offset ?? 0);
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const task = await getGenerateTaskById(input.id);
        if (!task) return null;
        const taskPatterns = await getPatternsByTask(input.id);
        return { ...task, patterns: taskPatterns };
      }),
  }),

  // ========== 风格预设 & 配置 ==========
  style: router({
    list: publicProcedure.query(() => STYLE_PRESETS),
  }),

  config: router({
    categories: publicProcedure.query(() => {
      return Object.entries(CATEGORY_LABELS).map(([id, name]) => ({
        id,
        name,
        sizes: CATEGORY_SIZES[id as TemplateCategory] || [],
      }));
    }),
    sizes: publicProcedure
      .input(z.object({ category: z.string() }))
      .query(({ input }) => {
        return CATEGORY_SIZES[input.category as TemplateCategory] || [];
      }),
  }),

  // ========== 参考素材上传 ==========
  reference: router({
    upload: protectedProcedure
      .input(z.object({ imageBase64: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const buffer = Buffer.from(input.imageBase64, "base64");
        const fileKey = `references/${ctx.user.id}-${nanoid()}.png`;
        const { url } = await storagePut(fileKey, buffer, "image/png");
        return { url };
      }),
  }),

  // ========== 产品视频生成 ==========
  video: router({
    /** 上传参考图到OSS，返回公网URL（用于视频生成时直接上传图片）*/
    uploadRefImage: protectedProcedure
      .input(z.object({
        imageBase64: z.string(),
        mimeType: z.string().default("image/jpeg"),
      }))
      .mutation(async ({ ctx, input }) => {
        const buffer = Buffer.from(input.imageBase64, "base64");
        const ext = input.mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
        const fileKey = `video-refs/${ctx.user.id}-${nanoid()}.${ext}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType);
        return { url };
      }),

    /** 提交视频生成任务（异步，轮询状态） */
    generate: protectedProcedure
      .input(z.object({
        sourceImageUrl: z.string().url(),
        character: z.enum(["none", "hand_female", "model_female", "model_male", "couple", "family"]).default("none"),
        scene: z.enum(["living_room", "bedroom", "kitchen", "scandinavian", "japanese", "luxury", "studio", "outdoor"]).default("living_room"),
        camera: z.enum(["push_in", "orbit", "pan", "tilt", "zoom_detail", "static"]).default("push_in"),
        lighting: z.enum(["morning", "golden", "natural", "studio", "dramatic"]).default("natural"),
        ratio: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
        duration: z.union([z.literal(5), z.literal(10), z.literal(20)]).default(10),
        customText: z.string().optional(),
        category: z.enum(allCategories).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const patternCount = await getPatternCount();
        const productCode = generateProductCode((input.category || "wallpaper") as TemplateCategory, patternCount + 1);

        const prompt1 = buildVideoPrompt({
          character: input.character,
          scene: input.scene,
          camera: input.camera,
          lighting: input.lighting,
          customText: input.customText,
          isSecondClip: false,
        });

        const { id: videoId } = await createProductVideo({
          userId: ctx.user.id,
          patternId: null,
          videoType: "showcase",
          prompt: prompt1,
          targetMarket: "global",
          category: input.category ?? null,
          status: "generating",
          productCode,
        });

        // Background: generate video clips via Wan2.1-I2V (Silicon Flow)
        (async () => {
          try {
            const prompt2 = buildVideoPrompt({
              character: input.character,
              scene: input.scene,
              camera: input.camera,
              lighting: input.lighting,
              customText: input.customText,
              isSecondClip: true,
            });

            const clips = await generateVideoClips({
              sourceImageUrl: input.sourceImageUrl,
              prompt: prompt1,
              secondClipPrompt: prompt2,
              ratio: input.ratio,
              duration: input.duration,
            });

            // clips[0] → videoUrl (primary), rest stored as JSON in thumbnailUrl
            await updateProductVideo(videoId, {
              videoUrl: clips[0],
              thumbnailUrl: clips.length > 1 ? JSON.stringify(clips) : undefined,
              status: "completed",
              durationSeconds: input.duration,
            });
          } catch (err) {
            console.error(`[Video] Generation failed for video ${videoId}:`, err);
            await updateProductVideo(videoId, { status: "failed" });
          }
        })();

        return { videoId, productCode, status: "generating" as const };
      }),

    /** 查询视频状态 */
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return getProductVideoById(input.id);
      }),

    /** 列出当前用户的所有视频 */
    list: protectedProcedure
      .input(z.object({ limit: z.number().optional(), offset: z.number().optional() }).optional())
      .query(async ({ ctx, input }) => {
        return getProductVideosByUser(ctx.user.id, input?.limit ?? 20, input?.offset ?? 0);
      }),
  }),

  // ========== 收藏管理 ==========
  favorite: router({
    /** 获取当前用户所有收藏 */
    list: protectedProcedure
      .query(async ({ ctx }) => {
        return getFavoritesByUser(ctx.user.id);
      }),

    /** 切换收藏状态：已收藏则取消，未收藏则添加 */
    toggle: protectedProcedure
      .input(z.object({
        itemType: z.enum(["pattern", "mockup"]),
        itemId: z.number(),
        imageUrl: z.string(),
        label: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const existing = await getFavorite(ctx.user.id, input.itemType, input.itemId);
        if (existing) {
          await removeFavorite(ctx.user.id, input.itemType, input.itemId);
          return { action: "removed" as const };
        }
        await addFavorite({
          userId: ctx.user.id,
          itemType: input.itemType,
          itemId: input.itemId,
          imageUrl: input.imageUrl,
          label: input.label,
        });
        return { action: "added" as const };
      }),

    /** 检查单个 item 是否被收藏 */
    check: protectedProcedure
      .input(z.object({ itemType: z.enum(["pattern", "mockup"]), itemId: z.number() }))
      .query(async ({ ctx, input }) => {
        const existing = await getFavorite(ctx.user.id, input.itemType, input.itemId);
        return { favorited: !!existing };
      }),

    /** 直接删除指定收藏 */
    remove: protectedProcedure
      .input(z.object({ itemType: z.enum(["pattern", "mockup"]), itemId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await removeFavorite(ctx.user.id, input.itemType, input.itemId);
        return { ok: true };
      }),
  }),

  // ========== 无缝化后处理 ==========
  seamless: router({
    process: protectedProcedure
      .input(z.object({ patternId: z.number() }))
      .mutation(async ({ input }) => {
        const pattern = await getPatternById(input.patternId);
        if (!pattern || !pattern.imageUrl) {
          throw new Error("Pattern not found or has no image");
        }
        const seamlessPrompt = `Take this decorative pattern and create an enhanced seamless tileable version. Fix any visible seams or edges so the pattern tiles perfectly in all directions without any visible boundaries. Maintain the original design style, colors, and motifs. High resolution, professional quality.`;
        const { url } = await generateImage({
          prompt: seamlessPrompt,
          originalImages: [{ url: pattern.imageUrl, mimeType: "image/png" }],
        });
        if (!url) throw new Error("Seamless image generation returned no URL");
        await updatePattern(input.patternId, { seamlessImageUrl: url });
        return { patternId: input.patternId, seamlessImageUrl: url };
      }),
  }),
});

// ========== Helper functions ==========

function getDefaultOverlayConfig(category: TemplateCategory) {
  const configs: Record<string, any> = {
    wallpaper: { points: [{ x: 0.05, y: 0.0 }, { x: 0.95, y: 0.0 }, { x: 0.95, y: 0.65 }, { x: 0.05, y: 0.65 }], tileScale: 0.3 },
    kitchen: { points: [{ x: 0.05, y: 0.15 }, { x: 0.85, y: 0.15 }, { x: 0.85, y: 0.55 }, { x: 0.05, y: 0.55 }], tileScale: 0.25 },
    floor: { points: [{ x: 0.0, y: 0.3 }, { x: 1.0, y: 0.3 }, { x: 1.0, y: 1.0 }, { x: 0.0, y: 1.0 }], tileScale: 0.2 },
    wall_sticker: { points: [{ x: 0.15, y: 0.0 }, { x: 0.75, y: 0.0 }, { x: 0.75, y: 0.75 }, { x: 0.15, y: 0.75 }], tileScale: 0.35 },
    bathroom: { points: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.7 }, { x: 0.1, y: 0.7 }], tileScale: 0.2 },
    toilet: { points: [{ x: 0.2, y: 0.1 }, { x: 0.8, y: 0.1 }, { x: 0.8, y: 0.9 }, { x: 0.2, y: 0.9 }], tileScale: 0.3 },
    window: { points: [{ x: 0.15, y: 0.1 }, { x: 0.85, y: 0.1 }, { x: 0.85, y: 0.9 }, { x: 0.15, y: 0.9 }], tileScale: 0.3 },
    fridge: { points: [{ x: 0.2, y: 0.05 }, { x: 0.8, y: 0.05 }, { x: 0.8, y: 0.95 }, { x: 0.2, y: 0.95 }], tileScale: 0.25 },
    ps5: { points: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }], tileScale: 0.4 },
    macbook: { points: [{ x: 0.08, y: 0.08 }, { x: 0.92, y: 0.08 }, { x: 0.92, y: 0.92 }, { x: 0.08, y: 0.92 }], tileScale: 0.35 },
    drone: { points: [{ x: 0.15, y: 0.1 }, { x: 0.85, y: 0.1 }, { x: 0.85, y: 0.9 }, { x: 0.15, y: 0.9 }], tileScale: 0.4 },
  };
  return configs[category] || configs.wallpaper;
}

async function downloadRemoteImageBuffer(url: string): Promise<Buffer> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to download reference image (${resp.status})`);
  return Buffer.from(await resp.arrayBuffer());
}

function isNearWhite(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return r >= 242 && g >= 242 && b >= 242 && (max - min) <= 18;
}

async function buildWhiteBackgroundCutout(sourceBuffer: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(sourceBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  if (channels < 4) throw new Error("Unexpected image channels");
  const pxCount = width * height;
  const bgMask = new Uint8Array(pxCount);
  const queue: number[] = [];

  const trySeed = (x: number, y: number) => {
    const idx = y * width + x;
    if (bgMask[idx]) return;
    const i = idx * channels;
    if (isNearWhite(data[i], data[i + 1], data[i + 2])) {
      bgMask[idx] = 1;
      queue.push(idx);
    }
  };

  for (let x = 0; x < width; x++) {
    trySeed(x, 0);
    trySeed(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    trySeed(0, y);
    trySeed(width - 1, y);
  }

  while (queue.length > 0) {
    const idx = queue.pop() as number;
    const x = idx % width;
    const y = Math.floor(idx / width);
    const neighbors = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const nIdx = ny * width + nx;
      if (bgMask[nIdx]) continue;
      const i = nIdx * channels;
      if (isNearWhite(data[i], data[i + 1], data[i + 2])) {
        bgMask[nIdx] = 1;
        queue.push(nIdx);
      }
    }
  }

  const out = Buffer.from(data);
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let fgCount = 0;

  for (let idx = 0; idx < pxCount; idx++) {
    const i = idx * channels;
    const alpha = out[i + 3];
    const isBg = bgMask[idx] === 1;
    if (isBg) {
      out[i + 3] = 0;
      continue;
    }
    if (alpha > 0) {
      fgCount++;
      const x = idx % width;
      const y = Math.floor(idx / width);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (fgCount < 100) {
    // fallback: if segmentation failed, keep original subject
    return sharp(sourceBuffer).png().toBuffer();
  }

  const pad = 8;
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  const extractWidth = Math.min(width - left, (maxX - minX + 1) + pad * 2);
  const extractHeight = Math.min(height - top, (maxY - minY + 1) + pad * 2);

  return sharp(out, { raw: { width, height, channels: 4 } })
    .extract({ left, top, width: extractWidth, height: extractHeight })
    .png()
    .toBuffer();
}

function isWallDecalCategory(category: TemplateCategory): boolean {
  return ["wall_sticker", "wallpaper", "kitchen", "bathroom", "toilet", "window"].includes(category);
}

function getSlotPlacement(slot: AmazonListingSlot, category: TemplateCategory) {
  const wallDecal = isWallDecalCategory(category);
  if (wallDecal) {
    switch (slot) {
      case "dimension":
        return { scale: 0.28, anchor: "wallCenter" as const, decalMode: true };
      case "detail_1":
      case "detail_2":
      case "detail_3":
        return { scale: 0.34, anchor: "wallCenter" as const, decalMode: true };
      case "feature_install_steps":
        return { scale: 0.24, anchor: "wallRight" as const, decalMode: true };
      default:
        return { scale: 0.3, anchor: "wallCenter" as const, decalMode: true };
    }
  }

  switch (slot) {
    case "detail_1":
    case "detail_2":
    case "detail_3":
      return { scale: 0.66, anchor: "center" as const, decalMode: false };
    case "feature_install_steps":
      return { scale: 0.42, anchor: "rightBottom" as const, decalMode: false };
    case "feature_after_install":
      return { scale: 0.48, anchor: "center" as const, decalMode: false };
    case "dimension":
      return { scale: 0.58, anchor: "center" as const, decalMode: false };
    default:
      return { scale: 0.5, anchor: "centerBottom" as const, decalMode: false };
  }
}

async function applyAlphaMultiplier(inputPng: Buffer, alphaMultiplier: number): Promise<Buffer> {
  const { data, info } = await sharp(inputPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  for (let i = 3; i < out.length; i += info.channels) {
    out[i] = Math.max(0, Math.min(255, Math.round(out[i] * alphaMultiplier)));
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: info.channels } }).png().toBuffer();
}

async function composeProductIntoScene(
  sceneUrl: string,
  productCutoutBuffer: Buffer,
  slot: AmazonListingSlot,
  sizeSpec: string | undefined,
  category: TemplateCategory
): Promise<string> {
  const sceneBuffer = await downloadRemoteImageBuffer(sceneUrl);
  const sceneMeta = await sharp(sceneBuffer).metadata();
  const cutoutMeta = await sharp(productCutoutBuffer).metadata();
  const sceneW = sceneMeta.width ?? 1024;
  const sceneH = sceneMeta.height ?? 1024;
  const cutoutW = cutoutMeta.width ?? 1000;
  const cutoutH = cutoutMeta.height ?? 1000;
  const { scale, anchor, decalMode } = getSlotPlacement(slot, category);

  const targetW = Math.max(80, Math.round(sceneW * scale));
  const targetH = Math.max(80, Math.round(targetW * (cutoutH / cutoutW)));
  const resizedCutout = await sharp(productCutoutBuffer).resize({ width: targetW }).png().toBuffer();

  let left = Math.round((sceneW - targetW) / 2);
  let top = Math.round((sceneH - targetH) / 2);
  if (anchor === "centerBottom") top = Math.round(sceneH * 0.94 - targetH);
  if (anchor === "rightBottom") {
    left = Math.round(sceneW - targetW - sceneW * 0.06);
    top = Math.round(sceneH - targetH - sceneH * 0.08);
  }
  if (anchor === "wallCenter") {
    top = Math.round(sceneH * 0.34 - targetH / 2);
    left = Math.round((sceneW - targetW) / 2);
  }
  if (anchor === "wallRight") {
    top = Math.round(sceneH * 0.34 - targetH / 2);
    left = Math.round(sceneW * 0.62 - targetW / 2);
  }
  left = Math.max(0, Math.min(sceneW - targetW, left));
  top = Math.max(0, Math.min(sceneH - targetH, top));

  const composedCutout = decalMode
    ? await applyAlphaMultiplier(resizedCutout, 0.9)
    : resizedCutout;
  const overlays: sharp.OverlayOptions[] = [{
    input: composedCutout,
    left,
    top,
    blend: decalMode ? "multiply" : "over",
  }];
  if (slot === "dimension") {
    const label = (sizeSpec?.trim() || "尺寸示意").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const svg = `
      <svg width="${sceneW}" height="${sceneH}">
        <line x1="${left}" y1="${top + targetH + 20}" x2="${left + targetW}" y2="${top + targetH + 20}" stroke="#2f2f2f" stroke-width="3"/>
        <line x1="${left}" y1="${top + targetH + 12}" x2="${left}" y2="${top + targetH + 28}" stroke="#2f2f2f" stroke-width="3"/>
        <line x1="${left + targetW}" y1="${top + targetH + 12}" x2="${left + targetW}" y2="${top + targetH + 28}" stroke="#2f2f2f" stroke-width="3"/>
        <rect x="${Math.max(20, left + Math.round(targetW * 0.2))}" y="${top + targetH + 30}" width="${Math.max(180, Math.round(targetW * 0.6))}" height="40" rx="8" fill="rgba(255,255,255,0.92)"/>
        <text x="${left + Math.round(targetW * 0.5)}" y="${top + targetH + 57}" text-anchor="middle" font-size="24" fill="#1f1f1f" font-family="Arial, sans-serif">${label}</text>
      </svg>`;
    overlays.push({ input: Buffer.from(svg), left: 0, top: 0 });
  }

  const composed = await sharp(sceneBuffer)
    .composite(overlays)
    .jpeg({ quality: 92 })
    .toBuffer();
  const { url } = await storagePut(`generated/amazon-composed-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`, composed, "image/jpeg");
  return url;
}

async function buildAmazonMainImage(productOriginalBuffer: Buffer, productCutoutBuffer: Buffer): Promise<string> {
  const canvasSize = 1600;
  const cutout = await sharp(productCutoutBuffer)
    .resize({ width: Math.round(canvasSize * 0.84), withoutEnlargement: true })
    .png()
    .toBuffer();
  const cutoutMeta = await sharp(cutout).metadata();
  const left = Math.round((canvasSize - (cutoutMeta.width ?? 0)) / 2);
  const top = Math.round((canvasSize - (cutoutMeta.height ?? 0)) / 2);
  const whiteCanvas = await sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([{ input: cutout, left, top }])
    .jpeg({ quality: 94 })
    .toBuffer();
  const { url } = await storagePut(`generated/amazon-main-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`, whiteCanvas, "image/jpeg");
  return url;
}

function sanitizeSvgText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function composeWallpaperToScene(
  sceneUrl: string,
  productCutoutBuffer: Buffer,
  slot: AmazonListingSlot,
  sizeSpec?: string,
  sceneHintText?: string
): Promise<string> {
  const sceneBuffer = await downloadRemoteImageBuffer(sceneUrl);
  const sceneMeta = await sharp(sceneBuffer).metadata();
  const sceneW = sceneMeta.width ?? 1024;
  const sceneH = sceneMeta.height ?? 1024;

  type WallSceneType = "kitchen" | "bathroom" | "living_room" | "bedroom" | "studio";
  const detectText = `${slot} ${sceneHintText || ""}`.toLowerCase();
  const sceneType: WallSceneType = (() => {
    if (/bath|卫生间|马桶|moisture|steam|humid/.test(detectText)) return "bathroom";
    if (/kitchen|厨房|backsplash|cabinet|stove|sink/.test(detectText)) return "kitchen";
    if (/bedroom|卧室|bed|headboard/.test(detectText)) return "bedroom";
    if (/living|客厅|sofa|tv|feature wall/.test(detectText)) return "living_room";
    return "studio";
  })();

  const wallPresets: Record<
    WallSceneType,
    {
      xRatio: number;
      yRatio: number;
      wRatio: number;
      hRatio: number;
      topInsetRatio: number;
      topLiftRatio: number;
    }
  > = {
    kitchen: { xRatio: 0.14, yRatio: 0.15, wRatio: 0.72, hRatio: 0.42, topInsetRatio: 0.1, topLiftRatio: 0.02 },
    bathroom: { xRatio: 0.12, yRatio: 0.12, wRatio: 0.76, hRatio: 0.52, topInsetRatio: 0.06, topLiftRatio: 0.01 },
    living_room: { xRatio: 0.17, yRatio: 0.14, wRatio: 0.66, hRatio: 0.5, topInsetRatio: 0.08, topLiftRatio: 0.02 },
    bedroom: { xRatio: 0.18, yRatio: 0.16, wRatio: 0.64, hRatio: 0.46, topInsetRatio: 0.07, topLiftRatio: 0.02 },
    studio: { xRatio: 0.16, yRatio: 0.15, wRatio: 0.68, hRatio: 0.44, topInsetRatio: 0.08, topLiftRatio: 0.02 },
  };
  const wallPreset = wallPresets[sceneType];

  // Adaptive wall plane area by scene type.
  const wallX = Math.round(sceneW * wallPreset.xRatio);
  const wallY = Math.round(sceneH * wallPreset.yRatio);
  const wallW = Math.round(sceneW * wallPreset.wRatio);
  const wallH = Math.round(sceneH * wallPreset.hRatio);

  const tileCols = slot === "detail_1" || slot === "detail_2" || slot === "detail_3" ? 4 : 7;
  const tileW = Math.max(56, Math.round(wallW / tileCols));
  const tile = await sharp(productCutoutBuffer)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .resize({ width: tileW, withoutEnlargement: false })
    .jpeg({ quality: 92 })
    .toBuffer();
  const tileMeta = await sharp(tile).metadata();
  const tileH = tileMeta.height ?? tileW;

  // Build repeated pattern layer over wall area.
  const repeatedLayer = sharp({
    create: { width: sceneW, height: sceneH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  });
  const repeats: sharp.OverlayOptions[] = [];
  for (let y = wallY; y < wallY + wallH; y += tileH) {
    for (let x = wallX; x < wallX + wallW; x += tileW) {
      repeats.push({ input: tile, left: x, top: y });
    }
  }
  const repeatedBuffer = await repeatedLayer.composite(repeats).png().toBuffer();

  // Perspective-ish wall mask: top narrower than bottom to avoid floating-card look.
  const topInset = Math.round(wallW * wallPreset.topInsetRatio);
  const topLift = Math.round(wallH * wallPreset.topLiftRatio);
  const mX1 = wallX + topInset;
  const mY1 = wallY + topLift;
  const mX2 = wallX + wallW - topInset;
  const mY2 = wallY + topLift;
  const mX3 = wallX + wallW;
  const mY3 = wallY + wallH;
  const mX4 = wallX;
  const mY4 = wallY + wallH;
  const maskSvg = `<svg width="${sceneW}" height="${sceneH}"><polygon points="${mX1},${mY1} ${mX2},${mY2} ${mX3},${mY3} ${mX4},${mY4}" fill="white"/></svg>`;
  let maskedPattern = await sharp(repeatedBuffer)
    .composite([{ input: Buffer.from(maskSvg), blend: "dest-in" }])
    .blur(0.5)
    .png()
    .toBuffer();
  maskedPattern = await applyAlphaMultiplier(maskedPattern, 0.82);

  const overlays: sharp.OverlayOptions[] = [{ input: maskedPattern, left: 0, top: 0, blend: "multiply" }];

  if (slot === "dimension") {
    const label = sanitizeSvgText((sizeSpec?.trim() || "尺寸示意"));
    const lineY = mY4 + Math.round(sceneH * 0.03);
    const dimSvg = `
      <svg width="${sceneW}" height="${sceneH}">
        <line x1="${mX4}" y1="${lineY}" x2="${mX3}" y2="${lineY}" stroke="#2f2f2f" stroke-width="3"/>
        <line x1="${mX4}" y1="${lineY - 10}" x2="${mX4}" y2="${lineY + 10}" stroke="#2f2f2f" stroke-width="3"/>
        <line x1="${mX3}" y1="${lineY - 10}" x2="${mX3}" y2="${lineY + 10}" stroke="#2f2f2f" stroke-width="3"/>
        <rect x="${Math.round(sceneW * 0.33)}" y="${lineY + 12}" width="${Math.round(sceneW * 0.34)}" height="42" rx="8" fill="rgba(255,255,255,0.92)"/>
        <text x="${Math.round(sceneW * 0.5)}" y="${lineY + 40}" text-anchor="middle" font-size="24" fill="#1f1f1f" font-family="Arial, sans-serif">${label}</text>
      </svg>`;
    overlays.push({ input: Buffer.from(dimSvg), left: 0, top: 0 });
  }

  const composed = await sharp(sceneBuffer).composite(overlays).jpeg({ quality: 92 }).toBuffer();
  const { url } = await storagePut(`generated/amazon-wall-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`, composed, "image/jpeg");
  return url;
}

async function composeFloorToScene(
  sceneUrl: string,
  productCutoutBuffer: Buffer,
  slot: AmazonListingSlot,
  sizeSpec?: string,
  sceneHintText?: string
): Promise<string> {
  const sceneBuffer = await downloadRemoteImageBuffer(sceneUrl);
  const sceneMeta = await sharp(sceneBuffer).metadata();
  const sceneW = sceneMeta.width ?? 1024;
  const sceneH = sceneMeta.height ?? 1024;

  type FloorSceneType = "kitchen" | "bathroom" | "living_room" | "studio";
  const detectText = `${slot} ${sceneHintText || ""}`.toLowerCase();
  const sceneType: FloorSceneType = (() => {
    if (/bath|卫生间|马桶|moisture|steam|humid/.test(detectText)) return "bathroom";
    if (/kitchen|厨房|backsplash|cabinet|stove|sink/.test(detectText)) return "kitchen";
    if (/living|客厅|sofa|tv|feature wall/.test(detectText)) return "living_room";
    return "studio";
  })();

  const floorPresets: Record<
    FloorSceneType,
    { xRatio: number; yRatio: number; wRatio: number; hRatio: number; topInsetRatio: number; topLiftRatio: number }
  > = {
    kitchen: { xRatio: 0.08, yRatio: 0.48, wRatio: 0.84, hRatio: 0.5, topInsetRatio: 0.22, topLiftRatio: 0.02 },
    bathroom: { xRatio: 0.08, yRatio: 0.5, wRatio: 0.84, hRatio: 0.48, topInsetRatio: 0.24, topLiftRatio: 0.02 },
    living_room: { xRatio: 0.06, yRatio: 0.5, wRatio: 0.88, hRatio: 0.5, topInsetRatio: 0.26, topLiftRatio: 0.02 },
    studio: { xRatio: 0.08, yRatio: 0.52, wRatio: 0.84, hRatio: 0.46, topInsetRatio: 0.24, topLiftRatio: 0.02 },
  };
  const p = floorPresets[sceneType];

  const floorX = Math.round(sceneW * p.xRatio);
  const floorY = Math.round(sceneH * p.yRatio);
  const floorW = Math.round(sceneW * p.wRatio);
  const floorH = Math.round(sceneH * p.hRatio);

  const tileCols = slot === "detail_1" || slot === "detail_2" || slot === "detail_3" ? 4 : 7;
  const tileW = Math.max(56, Math.round(floorW / tileCols));
  const tile = await sharp(productCutoutBuffer)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .resize({ width: tileW, withoutEnlargement: false })
    .jpeg({ quality: 92 })
    .toBuffer();
  const tileMeta = await sharp(tile).metadata();
  const tileH = tileMeta.height ?? tileW;

  // Build repeated pattern layer over floor area.
  const repeatedLayer = sharp({
    create: { width: sceneW, height: sceneH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  });
  const repeats: sharp.OverlayOptions[] = [];
  for (let y = floorY; y < floorY + floorH; y += tileH) {
    for (let x = floorX; x < floorX + floorW; x += tileW) {
      repeats.push({ input: tile, left: x, top: y });
    }
  }
  const repeatedBuffer = await repeatedLayer.composite(repeats).png().toBuffer();

  // Perspective-ish floor mask: far edge narrower than near edge.
  const topInset = Math.round(floorW * p.topInsetRatio);
  const topLift = Math.round(floorH * p.topLiftRatio);
  const mX1 = floorX + topInset;
  const mY1 = floorY + topLift;
  const mX2 = floorX + floorW - topInset;
  const mY2 = floorY + topLift;
  const mX3 = floorX + floorW;
  const mY3 = floorY + floorH;
  const mX4 = floorX;
  const mY4 = floorY + floorH;
  const maskSvg = `<svg width="${sceneW}" height="${sceneH}"><polygon points="${mX1},${mY1} ${mX2},${mY2} ${mX3},${mY3} ${mX4},${mY4}" fill="white"/></svg>`;
  let maskedPattern = await sharp(repeatedBuffer)
    .composite([{ input: Buffer.from(maskSvg), blend: "dest-in" }])
    .blur(0.6)
    .png()
    .toBuffer();
  maskedPattern = await applyAlphaMultiplier(maskedPattern, 0.78);

  const overlays: sharp.OverlayOptions[] = [{ input: maskedPattern, left: 0, top: 0, blend: "multiply" }];

  if (slot === "dimension") {
    const label = sanitizeSvgText((sizeSpec?.trim() || "尺寸示意"));
    const lineY = mY4 - Math.round(sceneH * 0.04);
    const dimSvg = `
      <svg width="${sceneW}" height="${sceneH}">
        <line x1="${mX4 + 20}" y1="${lineY}" x2="${mX3 - 20}" y2="${lineY}" stroke="#2f2f2f" stroke-width="3"/>
        <line x1="${mX4 + 20}" y1="${lineY - 10}" x2="${mX4 + 20}" y2="${lineY + 10}" stroke="#2f2f2f" stroke-width="3"/>
        <line x1="${mX3 - 20}" y1="${lineY - 10}" x2="${mX3 - 20}" y2="${lineY + 10}" stroke="#2f2f2f" stroke-width="3"/>
        <rect x="${Math.round(sceneW * 0.33)}" y="${lineY - 52}" width="${Math.round(sceneW * 0.34)}" height="42" rx="8" fill="rgba(255,255,255,0.92)"/>
        <text x="${Math.round(sceneW * 0.5)}" y="${lineY - 24}" text-anchor="middle" font-size="24" fill="#1f1f1f" font-family="Arial, sans-serif">${label}</text>
      </svg>`;
    overlays.push({ input: Buffer.from(dimSvg), left: 0, top: 0 });
  }

  const composed = await sharp(sceneBuffer).composite(overlays).jpeg({ quality: 92 }).toBuffer();
  const { url } = await storagePut(`generated/amazon-floor-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`, composed, "image/jpeg");
  return url;
}

async function processAmazonListingGeneration(
  taskId: number,
  userId: number,
  input: {
    productTitle?: string;
    brandName?: string;
    category: TemplateCategory;
    count: number;
    sizeSpec?: string;
    referenceImageUrl: string;
    featureFlags: {
      waterproof: boolean;
      moistureproof: boolean;
      selfAdhesive: boolean;
      easyApply: boolean;
    };
  }
) {
  const slots = AMAZON_LISTING_SLOT_POOL.slice(0, Math.max(8, Math.min(input.count, AMAZON_LISTING_SLOT_POOL.length)));
  const patternCount = await getPatternCount();
  const productOriginalBuffer = await downloadRemoteImageBuffer(input.referenceImageUrl);
  const productCutoutBuffer = await buildWhiteBackgroundCutout(productOriginalBuffer);
  // Upload cutout once for AI-based compositing (perspective + lighting integration).
  const { url: cutoutUrl } = await storagePut(
    `listing-cutouts/${userId}-${Date.now()}-${Math.random().toString(36).slice(2)}.png`,
    productCutoutBuffer,
    "image/png"
  );
  let completed = 0;
  let failed = 0;

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    let patternId: number | undefined;
    try {
      const productCode = generateProductCode(input.category, patternCount + i + 1);
      const slotPrompt = buildAmazonListingBackgroundPrompt({
        slot,
        category: input.category,
        productTitle: input.productTitle,
        brandName: input.brandName,
        sizeSpec: input.sizeSpec,
        featureFlags: input.featureFlags,
      });

      const created = await createPattern({
        userId,
        prompt: `[Amazon:${slot}] ${slotPrompt}`,
        style: "amazon_listing",
        imageUrl: "",
        status: "generating",
        taskId,
        productCode,
        targetCategory: input.category,
        referenceImageUrl: input.referenceImageUrl,
      });
      patternId = created.id;

      let finalImageUrl = "";
      if (slot === "main") {
        finalImageUrl = await buildAmazonMainImage(productOriginalBuffer, productCutoutBuffer);
      } else {
        const genOptions: GenerateImageOptions = {
          prompt: slotPrompt,
          mode: "scene",
          forceKolors: true,
          overrideGuidanceScale: 7.4,
          overrideInferenceSteps: 26,
        };
        const { url: sceneUrl } = await generateImage(genOptions);
        if (!sceneUrl) throw new Error("No scene URL returned");
        // For wall/floor decor categories, use AI composite to get real perspective + lighting.
        if (isWallDecalCategory(input.category) || input.category === "floor") {
          const categoryLabel = CATEGORY_LABELS[input.category as TemplateCategory] || input.category;
          const { url } = await generateCompositeImage({
            sceneImageUrl: sceneUrl,
            patternImageUrl: cutoutUrl,
            categoryLabel,
          });
          finalImageUrl = url;

          // Add dimension overlay on top of the AI-composited result when needed.
          if (slot === "dimension") {
            const composedBuffer = await downloadRemoteImageBuffer(finalImageUrl);
            const meta = await sharp(composedBuffer).metadata();
            const w = meta.width ?? 1024;
            const h = meta.height ?? 1024;
            const label = sanitizeSvgText((input.sizeSpec?.trim() || "尺寸示意"));
            const svg = `
              <svg width="${w}" height="${h}">
                <rect x="${Math.round(w * 0.28)}" y="${Math.round(h * 0.08)}" width="${Math.round(w * 0.44)}" height="44" rx="10" fill="rgba(255,255,255,0.92)"/>
                <text x="${Math.round(w * 0.5)}" y="${Math.round(h * 0.11) + 18}" text-anchor="middle" font-size="24" fill="#1f1f1f" font-family="Arial, sans-serif">${label}</text>
              </svg>`;
            const withDim = await sharp(composedBuffer)
              .composite([{ input: Buffer.from(svg), left: 0, top: 0 }])
              .jpeg({ quality: 92 })
              .toBuffer();
            const put = await storagePut(`generated/amazon-dimension-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`, withDim, "image/jpeg");
            finalImageUrl = put.url;
          }
        } else {
          // Device skins / single-object listings: keep object overlay to preserve proportions.
          finalImageUrl = await composeProductIntoScene(sceneUrl, productCutoutBuffer, slot, input.sizeSpec, input.category);
        }
      }

      await updatePattern(patternId, { imageUrl: finalImageUrl, status: "completed" });
      completed++;
      await updateGenerateTask(taskId, { completedCount: completed, failedCount: failed });
    } catch (err) {
      failed++;
      console.error(`[AmazonListing] Slot ${slot} failed`, err);
      if (patternId !== undefined) {
        await updatePattern(patternId, { status: "failed" }).catch((e) =>
          console.error(`[AmazonListing] Failed to mark pattern ${patternId} as failed:`, e)
        );
      }
      await updateGenerateTask(taskId, { completedCount: completed, failedCount: failed });
    }
  }

  await updateGenerateTask(taskId, {
    status: failed === 0 ? "completed" : completed > 0 ? "completed" : "failed",
    completedCount: completed,
    failedCount: failed,
  });
}

// ========== Background batch generation ==========

async function processBatchGeneration(
  taskId: number,
  userId: number,
  input: {
    prompt: string;
    style?: string;
    count: number;
    templateIds?: number[];
    category?: string;
    sizeId?: string;
    outputMode?: string;
    referenceImageUrl?: string;
    imageProvider?: ImageGenProvider;
  }
) {
  const stylePreset = STYLE_PRESETS.find(s => s.id === input.style);
  const styleHint = stylePreset?.promptHint ?? "";
  const outputMode = (input.outputMode || "both") as OutputMode;
  const category = (input.category || "wallpaper") as TemplateCategory;
  let completed = 0;
  let failed = 0;

  const patternCount = await getPatternCount();

  for (let i = 0; i < input.count; i++) {
    let patternId: number | undefined;
    try {
      const productCode = generateProductCode(category, patternCount + i + 1);
      const variationSuffix =
        i > 0
          ? isDeviceSkinCategory(category)
            ? ` Batch item ${i + 1}: keep the IDENTICAL real-world product model, silhouette, camera angle, lighting, and accessory layout as item 1—change ONLY the flat skin graphic/texture/colors. Do not morph the device shape.`
            : ` Variation ${i + 1}: create a unique different design while maintaining the same style.`
          : "";
      const fullPrompt = buildCategoryPrompt(input.prompt + variationSuffix, category, styleHint, {
        photorealDetectionPrompt: input.prompt,
      });
      const dronePhotoreal = category === "drone" && shouldUseDronePhotorealPipeline(category, input.prompt);

      const created = await createPattern({
        userId,
        prompt: input.prompt,
        style: input.style ?? null,
        imageUrl: "",
        status: "generating",
        taskId,
        productCode,
        targetCategory: input.category as any ?? null,
        targetSizeId: input.sizeId ?? null,
        referenceImageUrl: input.referenceImageUrl ?? null,
      });
      patternId = created.id;

      const genOptions: GenerateImageOptions = {
        prompt: fullPrompt,
        ...dronePhotorealGenOptions(category, input.prompt),
      };
      if (input.referenceImageUrl) {
        genOptions.originalImages = [{ url: input.referenceImageUrl, mimeType: "image/png" }];
      }
      if (input.imageProvider && input.imageProvider !== "auto") {
        genOptions.provider = input.imageProvider;
      }

      const { url } = await generateImage(genOptions);
      if (!url) throw new Error("No URL returned");

      // Generate tile image if needed
      let tileImageUrl: string | null = null;
      if (!dronePhotoreal && (outputMode === "pattern_only" || outputMode === "both")) {
        try {
          const tileResult = await generateImage({
            prompt: `Create a 2x2 tiled repeat of this decorative pattern, showing seamless repetition in a grid layout.`,
            originalImages: [{ url, mimeType: "image/png" }],
            ...(input.imageProvider && input.imageProvider !== "auto"
              ? { provider: input.imageProvider }
              : {}),
          });
          tileImageUrl = tileResult.url ?? null;
        } catch { /* optional */ }
      }

      await updatePattern(patternId, { imageUrl: url, status: "completed", tileImageUrl });
      completed++;

      // Generate mockups if needed
      if ((outputMode === "mockup_only" || outputMode === "both") && input.templateIds && input.templateIds.length > 0) {
        for (const templateId of input.templateIds) {
          try {
            const template = await getTemplateById(templateId);
            if (!template) continue;

            const categoryLabel = CATEGORY_LABELS[template.category as TemplateCategory] || template.category;
            const { url: mockupUrl } = await generateCompositeImage({
              sceneImageUrl: template.sceneImageUrl,
              patternImageUrl: url,
              categoryLabel,
            });

            if (mockupUrl) {
              await createMockup({
                userId,
                patternId,
                templateId,
                imageUrl: mockupUrl,
                productCode,
              });
            }
          } catch (mockupErr) {
            console.error(`[BatchGen] Mockup failed for pattern ${patternId}, template ${templateId}:`, mockupErr);
          }
        }
      }
    } catch (err) {
      failed++;
      console.error(`[BatchGen] Pattern ${i + 1}/${input.count} failed:`, err);
      if (patternId !== undefined) {
        await updatePattern(patternId, { status: "failed" }).catch((e) =>
          console.error(`[BatchGen] Failed to mark pattern ${patternId} as failed:`, e)
        );
      }
    }

    await updateGenerateTask(taskId, { completedCount: completed, failedCount: failed });
  }

  await updateGenerateTask(taskId, {
    status: failed === input.count ? "failed" : "completed",
    completedCount: completed,
    failedCount: failed,
  });
}

export type AppRouter = typeof appRouter;
