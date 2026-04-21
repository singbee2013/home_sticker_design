/**
 * Download utilities.
 *
 * All image fetching goes through /api/image-proxy so that OSS/CDN CORS
 * restrictions never block the browser canvas from reading the pixels.
 *
 * downloadImageWithPicker  — shows native OS "Save As" dialog (Chrome/Edge 86+),
 *                            falls back to auto-download on other browsers.
 * downloadImageAs1200px    — legacy alias kept for backward compat.
 * batchDownloadAs1200px    — batch version.
 */

/** Proxy an image URL through the backend to sidestep CORS */
function proxyUrl(imageUrl: string): string {
  return `/api/image-proxy?url=${encodeURIComponent(imageUrl)}`;
}

/**
 * Fetch an image (via proxy) into a 1200×1200 canvas and return a PNG Blob.
 */
async function imageUrlToBlob(imageUrl: string, size = 1200): Promise<Blob> {
  const img = new Image();
  // Use proxied URL — the proxy endpoint sets Access-Control-Allow-Origin: *
  img.crossOrigin = "anonymous";

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load image via proxy: ${imageUrl}`));
    img.src = proxyUrl(imageUrl);
  });

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);

  const scale = Math.max(size / img.naturalWidth, size / img.naturalHeight);
  const sw = img.naturalWidth * scale;
  const sh = img.naturalHeight * scale;
  ctx.drawImage(img, (size - sw) / 2, (size - sh) / 2, sw, sh);

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
      "image/png"
    )
  );
}

/**
 * Download with native OS "Save As" dialog (File System Access API).
 * Falls back to automatic <a download> on unsupported browsers.
 */
export async function downloadImageWithPicker(
  imageUrl: string,
  suggestedFilename: string,
  size = 1200
): Promise<void> {
  const filename = suggestedFilename.endsWith(".png")
    ? suggestedFilename
    : `${suggestedFilename}.png`;

  const blob = await imageUrlToBlob(imageUrl, size);

  // Chrome 86+ / Edge 86+: show native save-file dialog
  if ("showSaveFilePicker" in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: "PNG 图片", accept: { "image/png": [".png"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err: any) {
      if (err?.name === "AbortError") return; // user cancelled
      console.warn("[download] showSaveFilePicker failed, falling back:", err);
    }
  }

  // Fallback: trigger <a download> (saves to Downloads folder automatically)
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** @deprecated use downloadImageWithPicker */
export async function downloadImageAs1200px(imageUrl: string, filename: string): Promise<void> {
  return downloadImageWithPicker(imageUrl, filename, 1200);
}

/**
 * Batch-download images one by one with a short inter-file delay.
 */
export async function batchDownloadAs1200px(
  items: { url: string; filename: string }[],
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  for (let i = 0; i < items.length; i++) {
    await downloadImageWithPicker(items[i].url, items[i].filename, 1200);
    onProgress?.(i + 1, items.length);
    if (i < items.length - 1) await new Promise((r) => setTimeout(r, 400));
  }
}
