/**
 * Silicon Flow — Wan2.1-I2V Image-to-Video Generation
 *
 * Docs: https://docs.siliconflow.com/en/api-reference/videos/videos_submit
 *
 * Flow:
 *   1. POST /v1/video/submit  → { requestId }
 *   2. POST /v1/video/status  → poll until status === "Succeed" | "Failed"
 *   3. Download video from results.videos[0].url (expires in 1h)
 *   4. Upload to OSS for permanent storage
 *   5. Return permanent OSS URL
 *
 * Duration: Wan2.1-I2V generates ~5 second clips per request.
 *   5s  → 1 clip
 *   10s → 2 clips
 *   20s → 4 clips
 */

import { ENV } from "./env";
import { storagePut } from "../storage";
import { nanoid } from "nanoid";

const POLL_INTERVAL_MS = 5_000;
const MAX_POLLS = 120; // 10 minutes max

// Best available model — fall back to stable if 2.2 is not yet on CN endpoint
const I2V_MODEL = "Wan-AI/Wan2.1-I2V-14B-720P";

export type WanTaskStatus = "InQueue" | "InProgress" | "Succeed" | "Failed";

export interface WanTaskResult {
  status: WanTaskStatus;
  reason?: string;
  results?: {
    videos?: { url: string }[];
    timings?: { inference: number };
    seed?: number;
  };
}

function sfHeaders(): Record<string, string> {
  if (!ENV.siliconflowApiKey) throw new Error("SILICONFLOW_API_KEY is not configured");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${ENV.siliconflowApiKey}`,
  };
}

/** Convert a public image URL to base64 data URI */
async function imageUrlToBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image for video (${res.status}): ${url}`);
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const buf = await res.arrayBuffer();
  const b64 = Buffer.from(buf).toString("base64");
  return `data:${contentType};base64,${b64}`;
}

/** Submit an image-to-video task and return the requestId */
async function submitI2VTask(options: {
  imageBase64: string; // data:image/xxx;base64,...
  prompt: string;
  negativePrompt?: string;
  imageSize: "1280x720" | "720x1280" | "960x960";
}): Promise<string> {
  const body = {
    model: I2V_MODEL,
    prompt: options.prompt,
    negative_prompt: options.negativePrompt ?? "blurry, low quality, distorted, watermark, text overlay, logo",
    image_size: options.imageSize,
    image: options.imageBase64,
  };

  const res = await fetch(`${ENV.siliconflowApiBase}/video/submit`, {
    method: "POST",
    headers: sfHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Wan video submit failed (${res.status}): ${detail}`);
  }

  const data = (await res.json()) as { requestId: string };
  if (!data.requestId) throw new Error("Wan video submit returned no requestId");
  return data.requestId;
}

/** Poll until the task reaches a terminal state */
async function pollTask(requestId: string): Promise<WanTaskResult> {
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const res = await fetch(`${ENV.siliconflowApiBase}/video/status`, {
      method: "POST",
      headers: sfHeaders(),
      body: JSON.stringify({ requestId }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Wan video status failed (${res.status}): ${detail}`);
    }

    const task = (await res.json()) as WanTaskResult;

    if (task.status === "Succeed" || task.status === "Failed") {
      return task;
    }
  }
  throw new Error("Wan video task timed out after 10 minutes");
}

/** Download a video URL and upload to OSS, returning a permanent URL */
async function downloadAndUploadToOSS(videoUrl: string): Promise<string> {
  const res = await fetch(videoUrl);
  if (!res.ok) throw new Error(`Failed to download video from Silicon Flow (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  const key = `videos/${Date.now()}-${nanoid(8)}.mp4`;
  const { url } = await storagePut(key, buf, "video/mp4");
  return url;
}

/**
 * Generate a single ~5s video clip from an image.
 * Returns the permanent OSS URL.
 */
async function generateOneClip(options: {
  imageBase64: string;
  prompt: string;
  negativePrompt?: string;
  imageSize: "1280x720" | "720x1280" | "960x960";
}): Promise<string> {
  const requestId = await submitI2VTask(options);
  const task = await pollTask(requestId);

  if (task.status !== "Succeed" || !task.results?.videos?.[0]?.url) {
    throw new Error(`Wan video generation failed: ${task.reason ?? "unknown error"}`);
  }

  // Download from Silicon Flow (expires in 1h) and re-upload to OSS
  return downloadAndUploadToOSS(task.results.videos[0].url);
}

/**
 * Main export: generates one or more clips based on desired duration.
 * Returns an array of permanent OSS video URLs.
 *
 * Duration mapping:
 *   5s  → 1 clip
 *   10s → 2 clips
 *   20s → 4 clips
 */
export async function generateVideoClips(options: {
  sourceImageUrl: string;
  prompt: string;
  secondClipPrompt?: string; // used for clip 2+ (texture close-up style)
  negativePrompt?: string;
  ratio: "16:9" | "9:16" | "1:1";
  duration: 5 | 10 | 20;
}): Promise<string[]> {
  const imageSizeMap: Record<string, "1280x720" | "720x1280" | "960x960"> = {
    "16:9": "1280x720",
    "9:16": "720x1280",
    "1:1":  "960x960",
  };
  const imageSize = imageSizeMap[options.ratio] ?? "1280x720";

  // Fetch the source image once as base64
  const imageBase64 = await imageUrlToBase64(options.sourceImageUrl);

  const clipCount = options.duration === 5 ? 1 : options.duration === 10 ? 2 : 4;
  const clips: string[] = [];

  for (let i = 0; i < clipCount; i++) {
    // Clips after the first use the alternate "detail/texture" prompt if provided
    const prompt = i === 0 ? options.prompt : (options.secondClipPrompt ?? options.prompt);
    const url = await generateOneClip({ imageBase64, prompt, negativePrompt: options.negativePrompt, imageSize });
    clips.push(url);
  }

  return clips;
}
