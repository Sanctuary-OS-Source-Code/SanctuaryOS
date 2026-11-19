let cachedNoiseDataUrl: string | null = null;

/**
 * Generates and caches a tiny (96x96) static subtle monochrome noise PNG data URL once per session.
 * Replaces live full-screen SVG <feTurbulence> + mix-blend-overlay compositing that caused frame drops.
 */
export function getStaticNoiseDataUrl(): string {
  if (cachedNoiseDataUrl !== null) return cachedNoiseDataUrl;
  if (typeof document === "undefined") return "";

  try {
    const size = 96;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      cachedNoiseDataUrl = "";
      return "";
    }

    const img = ctx.createImageData(size, size);
    const data = img.data;
    // Fast deterministic LCG so every render produces crisp static grain without CPU allocation storms
    let seed = 0x5f3759df;
    for (let i = 0; i < data.length; i += 4) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const lum = (seed >>> 24) & 0xff;
      const alpha = (seed >>> 20) & 0x0f; // Max alpha ~15/255 (~0.06) so no blend mode is needed
      data[i] = lum;
      data[i + 1] = lum;
      data[i + 2] = lum;
      data[i + 3] = alpha;
    }
    ctx.putImageData(img, 0, 0);
    cachedNoiseDataUrl = canvas.toDataURL("image/png");
    return cachedNoiseDataUrl;
  } catch {
    cachedNoiseDataUrl = "";
    return "";
  }
}
