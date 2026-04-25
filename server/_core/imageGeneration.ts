/**
 * Image generation with provider fallback:
 *   1) Gemini 2.5 Flash Image (preferred when GEMINI_API_KEY configured)
 *   2) Silicon Flow (Kolors / FLUX) fallback
 *
 * Reference-image style matching strategy:
 *   1. Use Silicon Flow's Qwen2-VL (vision model, accessible from China) to analyze
 *      the reference image and extract a detailed SD-style prompt
 *   2. Pass the reference image URL directly to Kolors via image_prompt (IP-Adapter)
 *      for direct visual style conditioning (scale=0.6)
 *   3. Combine both for maximum style fidelity
 */
import type { ImageGenProvider } from "@shared/types";
import { ENV } from "./env";
import { storagePut } from "../storage";
import { siliconFlowQueue, withRetry } from "./apiQueue";
import { logger } from "./logger";

export type GenerateImageOptions = {
  prompt: string;
  originalImages?: Array<{
    url?: string;
    b64Json?: string;
    mimeType?: string;
  }>;
  /** IP-Adapter style strength: 0.0–1.0 (derived from user similarity % / 100) */
  ipAdapterScale?: number;
  /**
   * "scene"  → photorealism mode: max inference steps, very high guidance,
   *             anti-AI negative prompt, no texture-art suffix injected.
   * "pattern" (default) → hand-crafted texture mode.
   */
  mode?: "pattern" | "scene";
  /**
   * When true: no user text/style was provided — reference image is the ONLY
   * creative dimension.  Triggers stricter background-color control in prompts.
   */
  pureReferenceMode?: boolean;
  /**
   * Appended to Kolors `negative_prompt` (e.g. drone topology constraints).
   * Ignored by FLUX text-only path.
   */
  additionalNegativePrompt?: string;
  /**
   * Skip FLUX for subjects that need hard negatives (e.g. quadcopter arm count).
   */
  forceKolors?: boolean;
  /**
   * Skip Qwen-VL style extraction for this request.
   * Useful when the reference image is an exact product photo identity to preserve.
   */
  skipReferenceStyleAnalysis?: boolean;
  /** Optional per-request guidance override. */
  overrideGuidanceScale?: number;
  /** Optional per-request inference-step override (Kolors 1~50). */
  overrideInferenceSteps?: number;
  /**
   * Optional precomputed style descriptors from reference image.
   * If provided, generateImage will reuse this text and skip repeated VL calls.
   */
  referenceStyleDescriptors?: string;
  /**
   * Which upstream generates the image.
   * `auto` (default): try Gemini when configured, then Silicon Flow.
   */
  provider?: ImageGenProvider;
};

export type GenerateImageResponse = {
  url?: string;
};

function hasConfiguredKey(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim();
  if (!v) return false;
  // Common placeholders pasted during setup
  if (
    v === "__YOUR_SILICONFLOW_KEY__" ||
    v === "__OPENAI_KEY__" ||
    v === "替换成你的新key" ||
    v.includes("YOUR_") ||
    v.includes("replace")
  ) {
    return false;
  }
  return true;
}

const HAS_GEMINI_KEY = hasConfiguredKey(ENV.geminiApiKey);
const HAS_OPENAI_KEY = hasConfiguredKey(ENV.openaiApiKey);
const HAS_SILICONFLOW_KEY = hasConfiguredKey(ENV.siliconflowApiKey);

// Kolors: supports IP-Adapter, used for reference-based pattern generation
const KOLORS_MODEL = "Kwai-Kolors/Kolors";
// FLUX.1-dev: dramatically sharper output, used for text-only pattern generation
const FLUX_MODEL = "black-forest-labs/FLUX.1-dev";

// Keep for backward compat
const IMAGE_MODEL = KOLORS_MODEL;

/** Unwrap fetch/undici AggregateError chains for actionable UI messages */
function collectErrorMessages(err: unknown, depth = 0, seen = new Set<unknown>()): string[] {
  if (err == null || depth > 8) return [];
  if (seen.has(err)) return [];
  seen.add(err);
  const out: string[] = [];

  if (typeof AggregateError !== "undefined" && err instanceof AggregateError) {
    for (const sub of err.errors) out.push(...collectErrorMessages(sub, depth + 1, seen));
    if (err.message) out.push(err.message);
  } else if (err instanceof Error) {
    if (err.message) out.push(err.message);
    const c = (err as Error & { cause?: unknown }).cause;
    if (c !== undefined) out.push(...collectErrorMessages(c, depth + 1, seen));
  } else {
    out.push(String(err));
  }
  return out;
}

function normalizeUpstreamError(err: unknown, provider: string): Error {
  const parts = Array.from(new Set(collectErrorMessages(err))).filter(Boolean);
  const joined = parts.join(" → ");
  const lower = joined.toLowerCase();

  logger.warn(`[${provider}] upstream request failed`, { detail: joined.slice(0, 500) });

  if (joined.includes("请求超时")) {
    return new Error(`${provider} ${parts.find((p) => p.includes("请求超时")) ?? joined}`);
  }

  const looksLikeTransport =
    lower.includes("fetch failed") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("etimedout") ||
    lower.includes("eai_again") ||
    lower.includes("ecert") ||
    lower.includes("certificate") ||
    lower.includes("unable to verify") ||
    lower.includes("ssl") ||
    lower.includes("socket hang up") ||
    lower.includes("network error");

  if (looksLikeTransport) {
    const hint = joined.length > 280 ? `${joined.slice(0, 280)}…` : joined;
    return new Error(
      `${provider} 连接失败：${hint}。请确认运行服务的机器能访问 ${ENV.siliconflowApiBase}，核对 SILICONFLOW_API_KEY 后重启进程；若需换接入点可在 .env 设置 SILICONFLOW_API_BASE。`,
    );
  }

  return err instanceof Error ? err : new Error(joined || String(err));
}

/** Abortable fetch — avoids infinite spinner when upstream hangs without TCP reset */
async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs = 50000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      throw new Error(`请求超时（>${Math.round(timeoutMs / 1000)}s）`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch a remote image and return base64 */
async function fetchImageAsBase64(imageUrl: string): Promise<{ data: string; mimeType: string }> {
  const resp = await fetchWithTimeout(imageUrl, {}, 30000);
  if (!resp.ok) throw new Error(`Failed to fetch image (${resp.status}): ${imageUrl}`);
  const mimeType = resp.headers.get("content-type") ?? "image/png";
  const buf = await resp.arrayBuffer();
  return { data: Buffer.from(buf).toString("base64"), mimeType };
}

/**
 * Generate image with Gemini 2.5 Flash Image (supports optional reference image).
 * Returns base64 image bytes directly.
 */
async function generateWithGeminiFlashImage(
  prompt: string,
  referenceImageUrl?: string
): Promise<{ data: string; mimeType: string }> {
  if (!HAS_GEMINI_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  if (referenceImageUrl) {
    const ref = await fetchImageAsBase64(referenceImageUrl);
    parts.push({
      inline_data: {
        mime_type: ref.mimeType || "image/png",
        data: ref.data,
      },
    });
  }

  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${ENV.geminiImageModel}:generateContent?key=${encodeURIComponent(ENV.geminiApiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      }),
    },
    70000
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Gemini image generation failed (${response.status}): ${detail}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inline_data?: { data?: string; mime_type?: string };
          inlineData?: { data?: string; mimeType?: string };
        }>;
      };
    }>;
  };

  const partsOut = data.candidates?.[0]?.content?.parts ?? [];
  for (const p of partsOut) {
      const snake = p.inline_data;
      const camel = p.inlineData;
      if (snake?.data || camel?.data) {
      return {
          data: snake?.data ?? camel?.data ?? "",
          mimeType: snake?.mime_type ?? camel?.mimeType ?? "image/png",
      };
    }
  }

  throw new Error("Gemini returned no image bytes");
}

async function parseOpenAIImagePayload(data: unknown): Promise<{ data: string; mimeType: string }> {
  const d = data as {
    data?: Array<{ b64_json?: string; url?: string }>;
    error?: { message?: string };
  };
  if (d.error?.message) {
    throw new Error(`OpenAI Images: ${d.error.message}`);
  }
  const first = d.data?.[0];
  if (!first) throw new Error("OpenAI returned no image");
  if (first.b64_json) {
    return { data: first.b64_json, mimeType: "image/png" };
  }
  if (first.url) {
    return fetchImageAsBase64(first.url);
  }
  throw new Error("OpenAI returned neither b64_json nor url");
}

/**
 * OpenAI Image API — text-to-image (`generations`) or reference-guided (`edits`).
 */
async function generateWithOpenAIImage(
  prompt: string,
  referenceImageUrl?: string
): Promise<{ data: string; mimeType: string }> {
  if (!HAS_OPENAI_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
  const model = ENV.openaiImageModel;

  if (referenceImageUrl) {
    const refBuf = await downloadImage(referenceImageUrl);
    const form = new FormData();
    form.append("model", model);
    form.append("prompt", prompt);
    form.append(
      "image[]",
      new Blob([new Uint8Array(refBuf)], { type: "image/png" }),
      "reference.png",
    );

    const response = await fetchWithTimeout("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ENV.openaiApiKey}`,
      },
      body: form,
    }, 120000);

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`OpenAI image edit failed (${response.status}): ${detail}`);
    }
    const json = await response.json();
    return parseOpenAIImagePayload(json);
  }

  const response = await fetchWithTimeout("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ENV.openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, prompt }),
  }, 120000);

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`OpenAI image generation failed (${response.status}): ${detail}`);
  }
  const json = await response.json();
  return parseOpenAIImagePayload(json);
}

/**
 * Photo refinement pass for existing images.
 * Uses image-editing upstreams (OpenAI Images edits / Gemini Flash Image with reference)
 * to improve realism while keeping composition and decal geometry intact.
 */
export async function refinePhotoComposite(options: {
  baseImageUrl: string;
  prompt: string;
  provider?: ImageGenProvider;
}): Promise<{ url: string }> {
  const provider: ImageGenProvider = options.provider ?? "auto";

  const putResult = async (img: { data: string; mimeType: string }) => {
    const buffer = Buffer.from(img.data, "base64");
    const normalizedMime = img.mimeType || "image/png";
    const ext = normalizedMime.includes("jpeg") ? "jpg" : "png";
    const { url } = await storagePut(`refined/${Date.now()}.${ext}`, buffer, normalizedMime);
    return { url };
  };

  // Prefer OpenAI edits when configured: strongest at "keep composition, refine realism".
  if (provider === "openai" || provider === "auto") {
    if (HAS_OPENAI_KEY) {
      try {
        const out = await generateWithOpenAIImage(options.prompt, options.baseImageUrl);
        return putResult(out);
      } catch (err) {
        if (provider === "openai") throw err;
        logger.warn("[Refine] OpenAI edit failed, fallback", { message: (err as Error).message.slice(0, 200) });
      }
    } else if (provider === "openai") {
      throw new Error("OPENAI_API_KEY is not configured.");
    }
  }

  // Gemini reference-guided generation as fallback (best-effort).
  if (provider === "gemini" || provider === "auto") {
    if (!HAS_GEMINI_KEY) {
      if (provider === "gemini") throw new Error("GEMINI_API_KEY is not configured.");
    } else {
      const out = await generateWithGeminiFlashImage(options.prompt, options.baseImageUrl);
      return putResult(out);
    }
  }

  // Last-resort: SiliconFlow image_prompt (may drift, but better than nothing).
  if (!HAS_SILICONFLOW_KEY) {
    throw new Error("No refine provider configured (need OPENAI_API_KEY, GEMINI_API_KEY, or SILICONFLOW_API_KEY).");
  }
  const generatedUrl = await generateWithKolors(
    options.prompt,
    options.baseImageUrl,
    0.70,
    "scene",
    undefined,
    8.8,
    30,
  );
  const buffer = await downloadImage(generatedUrl);
  const { url } = await storagePut(`refined/${Date.now()}.png`, buffer, "image/png");
  return { url };
}

/**
 * Use Silicon Flow's Qwen2-VL (vision language model) to analyze the reference
 * image and extract a structured SD-style prompt for accurate style replication.
 * This model is accessible from Chinese servers (no GFW restrictions).
 */
async function analyzeStyleWithQwenVL(imageUrl: string): Promise<string> {
  if (!HAS_SILICONFLOW_KEY) return "";

  try {
    return await siliconFlowQueue.add(async () => {
      const res = await fetchWithTimeout(`${ENV.siliconflowApiBase}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ENV.siliconflowApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "Qwen/Qwen3-VL-8B-Instruct",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: { url: imageUrl },
                },
                {
                  type: "text",
                  text: `Analyze this decorative pattern image for AI image generation replication.
Output ONLY a comma-separated list of precise visual descriptors. Cover ALL six points below IN ORDER:

1. BACKGROUND (MOST CRITICAL — always first): exact background color/tone
   e.g. "pure white background", "warm cream background", "light beige background",
        "deep navy background", "soft grey background", "transparent/no background"

2. ART MEDIUM: exact technique
   e.g. "delicate hand-painted watercolor", "ink pen line art", "gouache painting",
        "digital flat illustration", "linocut print"

3. LINE & STROKE: weight, softness, character
   e.g. "thin soft translucent brushstrokes", "fine crisp ink outlines",
        "thick impasto brushstrokes", "no outlines flat color shapes"

4. COMPOSITION & SPACING: layout density
   e.g. "sparse airy layout with generous white space", "dense all-over repeat pattern",
        "scattered small motifs on open ground", "tightly packed floral pattern"

5. COLOR PALETTE: exact colors of motifs AND background
   e.g. "blush pink and peach flowers, sage green leaves, pure white background",
        "muted dusty rose and eucalyptus green on cream"

6. MOTIFS & MOOD: what is depicted and the overall feel
   e.g. "wild botanical flowers and foliage, delicate romantic feminine style",
        "geometric diamonds, bold graphic modern style"

Example output for a light floral watercolor:
"pure white background, delicate hand-painted watercolor illustration, thin soft translucent brushstrokes with wet-on-wet edges, sparse airy botanical layout with generous white space, blush pink peach flowers sage green botanical leaves on white, wild meadow florals delicate romantic feminine style"

Example output for a dark botanical:
"deep navy blue background, gouache painting technique, thick opaque brushstrokes, dense all-over pattern, bright coral and gold botanical motifs on dark navy, tropical jungle leaves bold vibrant style"

Output ONLY the comma-separated descriptors starting with the background. NO explanation.`,
                },
              ],
            },
          ],
          max_tokens: 350,
          temperature: 0.1,
        }),
      }, 45000);

      if (!res.ok) {
        const err = await res.text().catch(() => "");
        logger.warn("[ImageGen] Qwen2-VL analysis failed", { status: res.status, detail: err.slice(0, 100) });
        return "";
      }

      const data = (await res.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      const description = data.choices?.[0]?.message?.content?.trim() ?? "";
      logger.debug("[ImageGen] Style analysis result", { preview: description.slice(0, 150) });
      return description;
    });
  } catch (e) {
    logger.warn("[ImageGen] Qwen2-VL request error", { message: (e as Error).message });
    return "";
  }
}

/**
 * Generate image via Silicon Flow Kolors.
 * When referenceImageUrl is provided, uses IP-Adapter (image_prompt) for
 * direct visual style conditioning alongside the text prompt.
 */
const NEGATIVE_PATTERN = [
  "blurry, low quality, noisy, artifacts, compression artifacts",
  "smooth, glossy, plastic, airbrushed, over-processed, digital art, CGI, 3D render",
  "flat colors, gradient mesh, vector art, clip art",
  // Prevent visible tiling guides that users often report as "lines"
  "grid lines, seam lines, stitch lines, border lines, panel divider lines, tile boundaries, checkerboard",
  "soft focus, out of focus, unfocused, hazy, foggy",
  "text, watermark, logo, signature, border, frame",
  "ugly, deformed, distorted, disfigured",
].join(", ");

/**
 * Derive background-specific negative terms from the Qwen-VL description.
 *
 * IP-Adapter CLIP embeddings encode the reference image's global color tone —
 * even a "white background" reference can be re-coloured to dark/teal if the
 * image contains many coloured motifs.  By explicitly forbidding the opposite
 * background colours in the negative prompt, the text decoder can override
 * the IP-Adapter's unintended colour bleeding.
 */
function buildBackgroundNegative(vlDescription: string): string {
  const d = vlDescription.toLowerCase();

  // Light/white/cream backgrounds → block all dark and coloured backgrounds
  if (
    d.includes("white background") || d.includes("cream background") ||
    d.includes("ivory background") || d.includes("off-white background") ||
    d.includes("light background") || d.includes("light beige") ||
    d.includes("pale background") || d.includes("light grey background")
  ) {
    return [
      "dark background", "black background", "teal background", "green background",
      "blue background", "grey background", "navy background", "brown background",
      "colored background", "tinted background", "dark tones overall",
    ].join(", ");
  }

  // Dark backgrounds → block light backgrounds
  if (
    d.includes("dark background") || d.includes("navy background") ||
    d.includes("black background") || d.includes("deep background")
  ) {
    return "white background, light background, bright background, pale background";
  }

  // Specific color backgrounds — block the opposite spectrum
  if (d.includes("blue background") || d.includes("teal background")) {
    return "red background, green background, white background, dark background";
  }
  if (d.includes("green background") || d.includes("sage background")) {
    return "white background, dark background, pink background, blue background";
  }

  return "";
}

/**
 * Extract the background descriptor (first comma-separated term from VL output).
 * We rely on the VL prompt instructing the model to put background first.
 */
function extractBackgroundTerm(vlDescription: string): string {
  return vlDescription.split(",")[0]?.trim() ?? "";
}

// For scene/room images: reject all AI-art tells and demand photographic realism
const NEGATIVE_SCENE = [
  "illustration, painting, drawing, sketch, anime, cartoon, vector art, clip art",
  "3D render, CGI, Blender, Unreal Engine, digital art, concept art, matte painting",
  "AI art style, midjourney, stable diffusion aesthetic, unrealistic proportions",
  "oversaturated, HDR, tone-mapped, lens flare, vignette, fake bokeh",
  "plastic surfaces, toy-like, miniature effect, tilt-shift",
  "text, watermark, logo, HUD, overlay, border",
  "ugly, deformed, bad anatomy, extra objects",
  "blurry, out of focus, noisy, grainy, low resolution",
].join(", ");

async function generateWithKolors(
  prompt: string,
  referenceImageUrl?: string,
  ipAdapterScale = 0.6,
  mode: "pattern" | "scene" = "pattern",
  additionalNegativePrompt?: string,
  overrideGuidanceScale?: number,
  overrideInferenceSteps?: number
): Promise<string> {
  const isScene = mode === "scene";

  /**
   * Three-tier adaptive guidance_scale:
   *
   * Tier 1 — Pure reference (ipAdapterScale ≥ 0.98):
   *   guidance = 5.0.
   *   Key insight: Qwen-VL ACCURATELY describes the reference (background color,
   *   style, composition). Text and IP-Adapter now point in the SAME direction.
   *   Raising guidance from 2.0 → 5.0 makes them reinforce each other rather
   *   than cancel out, producing sharper, more faithful output.
   *   (guidance=2.0 was causing blurry/incoherent results at max IP scale)
   *
   * Tier 2 — Mixed (reference + user text, ipAdapterScale 0.70–0.97):
   *   guidance linear 4.5 → 5.5.
   *   Reference leads visually (IP-Adapter 0.85), text guides creative direction.
   *   Floor raised to 4.5 to maintain generation quality.
   *
   * Tier 3 — Text only (no reference):
   *   guidance = 8.5 / 9.0 (unchanged baseline)
   */
  const baseGuidance = isScene ? 9.0 : 8.5;
  let guidance_scale: number;
  if (!referenceImageUrl) {
    guidance_scale = baseGuidance;
  } else if (ipAdapterScale >= 0.90) {
    // Tier 1 (pure reference): VL analysis accurately describes reference.
    // Text and IP-Adapter point in same direction → 5.5 reinforces both.
    // Previous value of 5.0 is raised slightly to give background-color text more authority.
    guidance_scale = 5.5;
  } else {
    // Tier 2 linear: scale 0.70 → 5.5,  scale 0.85 → 5.0,  scale 0.89 → 4.8
    const minG = 4.8;
    const maxG = 5.5;
    guidance_scale = maxG - (maxG - minG) * ((ipAdapterScale - 0.70) / (0.89 - 0.70));
    guidance_scale = Math.max(minG, Math.min(maxG, guidance_scale));
  }

  if (overrideGuidanceScale !== undefined) {
    guidance_scale = overrideGuidanceScale;
  }

  const negativePrompt = [
    isScene ? NEGATIVE_SCENE : NEGATIVE_PATTERN,
    additionalNegativePrompt,
  ].filter(Boolean).join(", ");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: Record<string, any> = {
    model: IMAGE_MODEL,
    prompt,
    negative_prompt: negativePrompt,
    image_size: "1024x1024",
    // Kolors model hard limit: num_inference_steps ≤ 50
    num_inference_steps: Math.max(1, Math.min(50, overrideInferenceSteps ?? 50)),
    guidance_scale,
    n: 1,
  };

  // IP-Adapter: directly conditions generation on reference image's visual style
  if (referenceImageUrl) {
    body.image_prompt = {
      image_url: referenceImageUrl,
      scale: ipAdapterScale, // 0~1: how strongly to follow reference style
    };
  }

  const doRequest = () =>
    siliconFlowQueue.add(() =>
      withRetry(
        async () => {
          let res: Response;
          try {
            res = await fetchWithTimeout(`${ENV.siliconflowApiBase}/images/generations`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${ENV.siliconflowApiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(body),
            }, 55000);
          } catch (err) {
            throw normalizeUpstreamError(err, "SiliconFlow");
          }

          if (!res.ok) {
            const detail = await res.text().catch(() => "");
            // 429 = rate limited → retryable; 400/422 → param error, not retryable
            throw Object.assign(
              new Error(`Silicon Flow generation failed (${res.status}): ${detail}`),
              { status: res.status, detail }
            );
          }

          const data = (await res.json()) as { images: Array<{ url: string }> };
          const imgUrl = data.images?.[0]?.url;
          if (!imgUrl) throw new Error("Silicon Flow returned no image URL");
          return imgUrl;
        },
        {
          maxTries: 3,
          baseMs: 3000,
          retryIf: (err) => (err as { status?: number }).status === 429,
        }
      )
    );

  try {
    return await doRequest();
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    // If image_prompt rejected (bad param), retry without it
    if (referenceImageUrl && (status === 400 || status === 422)) {
      logger.warn("[ImageGen] image_prompt rejected, retrying text-only", { detail: (err as Error).message.slice(0, 200) });
      return generateWithKolors(prompt, undefined, ipAdapterScale, mode, additionalNegativePrompt);
    }
    throw err;
  }
}

/**
 * Generate image via FLUX.1-dev — no IP-Adapter, but dramatically sharper
 * and more detailed than Kolors. Used for text-only pattern/texture generation.
 */
async function generateWithFlux(
  prompt: string,
  mode: "pattern" | "scene" = "pattern"
): Promise<string> {
  // FLUX does not use negative prompts natively; we embed soft-negatives at end of prompt
  const softNeg = mode === "scene"
    ? "Not illustration, not 3D render, not CGI, not watermark"
    : "Not blurry, not low quality, not flat vector art, not watermark";

  const fullPrompt = `${prompt}. ${softNeg}`;

  const body = {
    model: FLUX_MODEL,
    prompt: fullPrompt,
    image_size: "1024x1024",
    num_inference_steps: 28,
    guidance_scale: 3.5,
    n: 1,
  };

  return siliconFlowQueue.add(() =>
    withRetry(async () => {
      let res: Response;
      try {
        res = await fetchWithTimeout(`${ENV.siliconflowApiBase}/images/generations`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ENV.siliconflowApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }, 55000);
      } catch (err) {
        throw normalizeUpstreamError(err, "SiliconFlow");
      }

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw Object.assign(
          new Error(`FLUX generation failed (${res.status}): ${detail}`),
          { status: res.status }
        );
      }

      const data = (await res.json()) as { images: Array<{ url: string }> };
      const imgUrl = data.images?.[0]?.url;
      if (!imgUrl) throw new Error("FLUX returned no image URL");
      return imgUrl;
    }, { maxTries: 3, baseMs: 3000, retryIf: (e) => (e as { status?: number }).status === 429 })
  );
}

/**
 * Analyze a scene/room image with Qwen-VL to get a photorealistic room description.
 * Different from pattern analysis — focuses on room type, furniture, lighting, materials.
 */
async function analyzeSceneWithQwenVL(imageUrl: string): Promise<string> {
  if (!HAS_SILICONFLOW_KEY) return "";
  try {
    return await siliconFlowQueue.add(async () => {
      const res = await fetchWithTimeout(`${ENV.siliconflowApiBase}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ENV.siliconflowApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "Qwen/Qwen3-VL-8B-Instruct",
          messages: [{
            role: "user",
            content: [
              { type: "image_url", image_url: { url: imageUrl } },
              {
                type: "text",
                text: `Describe this interior scene for photorealistic image generation.
Output ONLY a comma-separated list covering ALL of the following in order:

1. ROOM TYPE: e.g. "modern living room", "Scandinavian bedroom", "contemporary kitchen"
2. DOMINANT SURFACE: the largest flat surface visible, e.g. "large feature wall", "floor", "kitchen backsplash"
3. KEY FURNITURE: 2-3 main furniture items, e.g. "linen sofa with throw pillows, wooden coffee table"
4. LIGHTING: e.g. "warm afternoon sunlight from left window", "soft overhead ambient lighting"
5. COLOR SCHEME: wall/floor/furniture base colors, e.g. "neutral warm whites, light oak wood tones, soft grey accents"
6. ATMOSPHERE: e.g. "cozy Scandinavian minimalist", "luxury contemporary", "bright airy bohemian"

Example output: "modern minimalist living room, large empty feature wall center-frame, linen sofa walnut side table, warm diffused afternoon light, warm white walls light oak floor neutral grey accents, clean serene contemporary atmosphere"

Output ONLY the comma-separated descriptors. NO explanation.`,
              },
            ],
          }],
          max_tokens: 250,
          temperature: 0.1,
        }),
      }, 45000);

      if (!res.ok) return "";
      const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
      return data.choices?.[0]?.message?.content?.trim() ?? "";
    });
  } catch {
    return "";
  }
}

/** Download image from URL and return buffer */
async function downloadImage(imageUrl: string): Promise<Buffer> {
  const resp = await fetchWithTimeout(imageUrl, {}, 60000);
  if (!resp.ok) throw new Error(`Failed to download generated image (${resp.status})`);
  return Buffer.from(await resp.arrayBuffer());
}

/** Ensure we have a public HTTP URL for the reference image (upload b64 to OSS if needed) */
async function ensurePublicUrl(ref: {
  url?: string;
  b64Json?: string;
  mimeType?: string;
}): Promise<string | undefined> {
  if (ref.url) return ref.url;
  if (ref.b64Json) {
    try {
      const buf = Buffer.from(ref.b64Json, "base64");
      const { url } = await storagePut(
        `refs/${Date.now()}.${ref.mimeType?.split("/")[1] ?? "png"}`,
        buf,
        ref.mimeType ?? "image/png"
      );
      return url;
    } catch (e) {
      logger.warn("[ImageGen] Failed to upload reference image", { message: (e as Error).message });
    }
  }
  return undefined;
}

export async function generateImage(
  options: GenerateImageOptions
): Promise<GenerateImageResponse> {
  if (!HAS_GEMINI_KEY && !HAS_SILICONFLOW_KEY && !HAS_OPENAI_KEY) {
    throw new Error(
      "No image provider configured. Set GEMINI_API_KEY, SILICONFLOW_API_KEY, and/or OPENAI_API_KEY.",
    );
  }

  let finalPrompt = options.prompt;
  let referenceUrl: string | undefined;
  let backgroundNegative = "";

  if (options.originalImages && options.originalImages.length > 0) {
    const ref = options.originalImages[0];

    // Step 1: Get a public URL for the reference image
    referenceUrl = await ensurePublicUrl(ref);

    // Step 2: Optionally use Qwen3-VL to extract visual style including background color
    if (referenceUrl && !options.skipReferenceStyleAnalysis) {
      const ipScale = options.ipAdapterScale ?? 0.6;
      const pureRef = options.pureReferenceMode || ipScale >= 0.90;
      const precomputed = options.referenceStyleDescriptors?.trim();
      const styleDescriptors = precomputed || await analyzeStyleWithQwenVL(referenceUrl);

      if (styleDescriptors) {
        const bgTerm = extractBackgroundTerm(styleDescriptors);
        backgroundNegative = buildBackgroundNegative(styleDescriptors);

        if (pureRef) {
          const body = options.prompt ? `${styleDescriptors}, ${options.prompt}` : styleDescriptors;
          finalPrompt = bgTerm
            ? `${bgTerm}, ${body}, ${bgTerm}`.replace(/,\s*,/g, ",")
            : body;
        } else {
          finalPrompt = `${styleDescriptors}, ${options.prompt}`.replace(/,\s*$/, "");
        }
        logger.debug("[ImageGen] Prompt built", {
          tier: pureRef ? 1 : 2, ipScale,
          bgTerm, bgNeg: backgroundNegative.slice(0, 80),
          preview: finalPrompt.slice(0, 200),
        });
      }
    }
  }

  const provider: ImageGenProvider = options.provider ?? "auto";

  const putGeminiResult = async (geminiImage: { data: string; mimeType: string }) => {
    const buffer = Buffer.from(geminiImage.data, "base64");
    const normalizedMime = geminiImage.mimeType || "image/png";
    const ext = normalizedMime.includes("jpeg") ? "jpg" : "png";
    const { url } = await storagePut(`generated/${Date.now()}.${ext}`, buffer, normalizedMime);
    return { url };
  };

  const finishSiliconFlow = async (): Promise<GenerateImageResponse> => {
    if (!HAS_SILICONFLOW_KEY) {
      throw new Error("SILICONFLOW_API_KEY is not configured.");
    }
    const ipScale = options.ipAdapterScale ?? 0.6;
    const mode = options.mode ?? "pattern";
    const kolorsExtraNeg =
      [backgroundNegative, options.additionalNegativePrompt].filter(Boolean).join(", ") || undefined;
    let generatedUrl: string;

    if (referenceUrl) {
      generatedUrl = await generateWithKolors(
        finalPrompt,
        referenceUrl,
        ipScale,
        mode,
        kolorsExtraNeg,
        options.overrideGuidanceScale,
        options.overrideInferenceSteps,
      );
    } else if (options.forceKolors) {
      generatedUrl = await generateWithKolors(
        finalPrompt,
        undefined,
        ipScale,
        mode,
        kolorsExtraNeg,
        options.overrideGuidanceScale ?? (mode === "scene" ? 9.0 : undefined),
        options.overrideInferenceSteps,
      );
    } else {
      try {
        generatedUrl = await generateWithFlux(finalPrompt, mode);
      } catch (fluxErr) {
        const msg = (fluxErr as Error)?.message ?? String(fluxErr);
        const status = (fluxErr as { status?: number }).status;
        const noFlux =
          status === 403 ||
          status === 404 ||
          status === 400 ||
          /model.*not.*available|disabled|not found|FLUX generation failed/i.test(msg);
        if (!noFlux) throw fluxErr;
        logger.warn("[ImageGen] FLUX text-to-image unavailable, using Kolors", {
          status,
          preview: msg.slice(0, 200),
        });
        generatedUrl = await generateWithKolors(
          finalPrompt,
          undefined,
          ipScale,
          mode,
          kolorsExtraNeg,
          options.overrideGuidanceScale,
          options.overrideInferenceSteps,
        );
      }
    }

    const buffer = await downloadImage(generatedUrl);
    const { url } = await storagePut(`generated/${Date.now()}.png`, buffer, "image/png");
    return { url };
  };

  if (provider === "gemini") {
    if (!HAS_GEMINI_KEY) {
      throw new Error("GEMINI_API_KEY is not configured.");
    }
    const geminiImage = await generateWithGeminiFlashImage(finalPrompt, referenceUrl);
    return putGeminiResult(geminiImage);
  }

  if (provider === "openai") {
    const openaiImage = await generateWithOpenAIImage(finalPrompt, referenceUrl);
    return putGeminiResult(openaiImage);
  }

  if (provider === "siliconflow") {
    return finishSiliconFlow();
  }

  // auto — Gemini first, then Silicon Flow
  if (HAS_GEMINI_KEY) {
    try {
      const geminiImage = await generateWithGeminiFlashImage(finalPrompt, referenceUrl);
      return putGeminiResult(geminiImage);
    } catch (err) {
      logger.warn("[ImageGen] Gemini image generation failed, fallback to SiliconFlow", {
        message: (err as Error).message.slice(0, 300),
      });
    }
  }

  if (!HAS_SILICONFLOW_KEY) {
    throw new Error(
      "Gemini image generation failed (or not configured) and SILICONFLOW_API_KEY is not configured.",
    );
  }
  return finishSiliconFlow();
}

/** Expose one-time style extraction for multi-image tasks */
export async function getReferenceStyleDescriptors(imageUrl: string): Promise<string> {
  return analyzeStyleWithQwenVL(imageUrl);
}

/**
 * Generate a photorealistic product mockup by compositing a pattern onto a scene.
 *
 * Key fixes vs the old `generateImage({ originalImages: [scene, pattern] })` approach:
 *  1. PATTERN is now the IP-Adapter reference (style conditioning target)
 *  2. SCENE is analyzed by Qwen-VL and described in text → natural room context
 *  3. mode="scene" → photorealism negative prompts (no painting/3D render artefacts)
 *  4. guidance_scale is fixed at 8.5 (not lowered by ipAdapterScale)
 */
export async function generateCompositeImage(options: {
  sceneImageUrl: string;
  patternImageUrl: string;
  categoryLabel: string;
}): Promise<{ url: string }> {
  if (!HAS_GEMINI_KEY && !HAS_SILICONFLOW_KEY) {
    throw new Error("No image provider configured. Set GEMINI_API_KEY or SILICONFLOW_API_KEY.");
  }

  // Analyze both images in parallel
  const [sceneDesc, patternDesc] = await Promise.all([
    analyzeSceneWithQwenVL(options.sceneImageUrl),
    analyzeStyleWithQwenVL(options.patternImageUrl),
  ]);

  // Build a photorealistic composite prompt
  // Structure: [scene context] + [surface/product integration] + [pattern description] + [quality]
  const sceneCtx = sceneDesc || `${options.categoryLabel} interior scene`;
  const patternCtx = patternDesc
    ? `the decorative surface features: ${patternDesc}`
    : `a decorative pattern applied seamlessly to the surface`;

  // For ecommerce listing mockups, users expect "as-photographed" realism:
  // - decal/wallpaper should lie FLAT on the wall (no perspective warp)
  // - foreground objects should naturally occlude the wall decal
  // - lighting/shadows should match the scene
  const compositePrompt = [
    sceneCtx,
    patternCtx,
    "apply the design onto the wall as a real physical decal/wallpaper that is perfectly flat and front-facing",
    "NO perspective distortion, NO warping, NO skewing, keep the design geometry unchanged (straight lines stay straight)",
    "foreground objects (shelves, utensils, plants, appliances) naturally sit in front of the wall and occlude the decal where they overlap",
    "the decal follows the wall material and lighting with subtle contact shadow and realistic surface integration (not floating)",
    "photorealistic interior photography, professionally styled, DSLR quality, natural lighting, realistic depth of field",
    "high detail, sharp focus, looks completely real and camera-captured, no CGI, no illustration",
  ].join(", ");

  logger.debug("[Composite] Generating mockup", {
    sceneDesc: sceneDesc.slice(0, 80),
    patternDesc: patternDesc.slice(0, 80),
    prompt: compositePrompt.slice(0, 150),
  });

  // Prefer Gemini for scene mockups; fallback to Kolors when needed.
  if (HAS_GEMINI_KEY) {
    try {
      const geminiImage = await generateWithGeminiFlashImage(compositePrompt, options.patternImageUrl);
      const buffer = Buffer.from(geminiImage.data, "base64");
      const normalizedMime = geminiImage.mimeType || "image/png";
      const ext = normalizedMime.includes("jpeg") ? "jpg" : "png";
      const { url } = await storagePut(`mockups/${Date.now()}.${ext}`, buffer, normalizedMime);
      return { url };
    } catch (err) {
      logger.warn("[Composite] Gemini mockup generation failed, fallback to Kolors", {
        message: (err as Error).message.slice(0, 300),
      });
    }
  }

  if (!HAS_SILICONFLOW_KEY) {
    throw new Error("Gemini mockup generation failed and SILICONFLOW_API_KEY is not configured.");
  }

  // Use pattern as IP-Adapter reference (preserves pattern style)
  // Override guidance_scale=8.5 for scene photorealism (bypass ipAdapterScale reduction)
  const generatedUrl = await generateWithKolors(
    compositePrompt,
    options.patternImageUrl,
    0.65,     // moderate IP-Adapter scale: strong enough to show pattern, text drives scene
    "scene",  // anti-AI-artefact negative prompts
    undefined,
    8.5       // fixed high guidance for photorealism regardless of ipAdapterScale
  );

  const buffer = await downloadImage(generatedUrl);
  const { url } = await storagePut(`mockups/${Date.now()}.png`, buffer, "image/png");
  return { url };
}
