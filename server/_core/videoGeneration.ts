/**
 * Runway Gen-3 Alpha Turbo — Image-to-Video generation
 *
 * Docs: https://docs.dev.runwayml.com/
 * Model: gen3a_turbo  (faster, cost-effective, great for product showcase)
 *
 * Flow:
 *   1. POST /v1/image_to_video  → returns { id }
 *   2. Poll GET /v1/tasks/{id}  until status === "SUCCEEDED" | "FAILED"
 *   3. Return output[0] (video URL, hosted by Runway ~24 h)
 */

import { ENV } from "./env";

const RUNWAY_BASE = "https://api.dev.runwayml.com/v1";
const RUNWAY_VERSION = "2024-11-06";
const POLL_INTERVAL_MS = 5_000;
const MAX_POLLS = 72; // 6 minutes max

export type RunwayTaskStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";

export interface RunwayTask {
  id: string;
  status: RunwayTaskStatus;
  output?: string[];
  failure?: string;
  failureCode?: string;
}

function runwayHeaders(): Record<string, string> {
  if (!ENV.runwayApiKey) throw new Error("RUNWAY_API_KEY is not configured");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${ENV.runwayApiKey}`,
    "X-Runway-Version": RUNWAY_VERSION,
  };
}

/** Submit an image-to-video task and return the task id immediately. */
export async function submitImageToVideo(options: {
  promptImage: string;   // Public URL of the input image
  promptText?: string;   // Optional motion guidance
  duration?: 5 | 10;    // seconds, default 10
  ratio?: "1280:768" | "768:1280" | "1104:832" | "832:1104" | "960:960";
}): Promise<string> {
  const body = {
    model: "gen3a_turbo",
    promptImage: options.promptImage,
    promptText: options.promptText ?? "",
    duration: options.duration ?? 10,
    ratio: options.ratio ?? "1280:768",
  };

  const res = await fetch(`${RUNWAY_BASE}/image_to_video`, {
    method: "POST",
    headers: runwayHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Runway submit failed (${res.status}): ${detail}`);
  }

  const data = (await res.json()) as { id: string };
  return data.id;
}

/** Poll until the task reaches a terminal state, then return it. */
export async function pollTask(taskId: string): Promise<RunwayTask> {
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const res = await fetch(`${RUNWAY_BASE}/tasks/${taskId}`, {
      headers: runwayHeaders(),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Runway poll failed (${res.status}): ${detail}`);
    }

    const task = (await res.json()) as RunwayTask;

    if (task.status === "SUCCEEDED" || task.status === "FAILED" || task.status === "CANCELLED") {
      return task;
    }
  }

  throw new Error("Runway task timed out after 6 minutes");
}

/** Cancel a running task (best-effort). */
export async function cancelTask(taskId: string): Promise<void> {
  await fetch(`${RUNWAY_BASE}/tasks/${taskId}/cancel`, {
    method: "POST",
    headers: runwayHeaders(),
  }).catch(() => {});
}

/**
 * Full generate-and-wait helper.
 * Submits the task, polls, and returns the final video URL.
 */
export async function generateVideo(options: {
  promptImage: string;
  promptText?: string;
  duration?: 5 | 10;
  ratio?: "1280:768" | "768:1280" | "1104:832" | "832:1104" | "960:960";
}): Promise<{ videoUrl: string; taskId: string }> {
  const taskId = await submitImageToVideo(options);
  const task = await pollTask(taskId);

  if (task.status !== "SUCCEEDED" || !task.output?.[0]) {
    throw new Error(
      `Video generation failed: ${task.failure ?? task.failureCode ?? "unknown error"}`
    );
  }

  return { videoUrl: task.output[0], taskId };
}
