import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";

vi.mock("../storage", () => ({
  storagePut: vi.fn(async (_key: string, buffer: Buffer, mimeType: string) => {
    const ext = mimeType.includes("jpeg") ? "jpg" : "png";
    const outputPath = path.resolve(
      process.cwd(),
      "server/data",
      `gemini_output_${Date.now()}.${ext}`,
    );
    await fs.writeFile(outputPath, buffer);
    return {
      key: path.basename(outputPath),
      url: outputPath,
    };
  }),
}));

import { storagePut } from "../storage";

describe("Gemini image generation (real API)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("reads local image_test.png, removes sticker, and saves output under server/data", async () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || !apiKey.trim()) {
      throw new Error("Missing GEMINI_API_KEY in test environment.");
    }

    const { generateImage } = await import("./imageGeneration");

    const inputPath = path.resolve(process.cwd(), "server/data/image_test.png");
    const inputBuffer = await fs.readFile(inputPath);
    const inputBase64 = inputBuffer.toString("base64");

    const result = await generateImage({
      prompt: "去掉图片中的贴纸",
      provider: "gemini",
      originalImages: [{ b64Json: inputBase64, mimeType: "image/png" }],
      skipReferenceStyleAnalysis: true,
    });

    expect(storagePut).toHaveBeenCalledTimes(1);
    expect(typeof result.url).toBe("string");
    expect(result.url).toContain("/server/data/gemini_output_");
    await expect(fs.stat(result.url!)).resolves.toBeTruthy();
  }, 180000);
});
