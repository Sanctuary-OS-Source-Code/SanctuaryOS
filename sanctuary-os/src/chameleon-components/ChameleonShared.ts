import { isDesktop } from "../utils/envUtils";
import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import { writeTextFile, writeFile, readTextFile, readFile, exists } from "@tauri-apps/plugin-fs";

export const getLuminance = (hex: string) => {
  const cleanHex = (hex || '#000000').replace('#', '').padEnd(6, '0').slice(0, 6);
  const r = parseInt(cleanHex.slice(0, 2), 16) || 0;
  const g = parseInt(cleanHex.slice(2, 4), 16) || 0;
  const b = parseInt(cleanHex.slice(4, 6), 16) || 0;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};

export const hexToRgb = (hex: string) => {
  const cleanHex = (hex || '#000000').replace('#', '').padEnd(6, '0').slice(0, 6);
  return {
    r: parseInt(cleanHex.slice(0, 2), 16) || 0,
    g: parseInt(cleanHex.slice(2, 4), 16) || 0,
    b: parseInt(cleanHex.slice(4, 6), 16) || 0,
  };
};
export const HexToRGB = hexToRgb;

export const rgbToHex = (r: number, g: number, b: number) => {
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};
export const RGBToHex = rgbToHex;

export const PRESET_COLORS = [
  '#38bdf8', '#0284c7', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e',
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6',
  '#06b6d4', '#f8fafc', '#cbd5e1', '#94a3b8', '#475569', '#1e293b', '#0f172a', '#050914',
];

export const SEMANTIC_SHADES: Record<string, string[]> = {
  success: [
    '#10b981', '#22c55e', '#34d399', '#059669', '#4ade80', '#16a34a', '#047857', '#6ee7b7',
    '#15803d', '#0d9488', '#14b8a6', '#2dd4bf', '#84cc16', '#65a30d', '#a3e635', '#bbf7d0',
  ],
  warning: [
    '#f59e0b', '#fbbf24', '#eab308', '#facc15', '#d97706', '#ca8a04', '#b45309', '#fde047',
    '#f97316', '#fb923c', '#ea580c', '#fdba74', '#fcd34d', '#fde68a', '#ff9f1c', '#ffb703',
  ],
  danger: [
    '#ef4444', '#f43f5e', '#dc2626', '#e11d48', '#f87171', '#fb7185', '#b91c1c', '#be123c',
    '#991b1b', '#9f1239', '#fca5a5', '#fda4af', '#ff2a55', '#ff4d4d', '#e63946', '#d90429',
  ],
};

export const sanitizeSemanticStatusColor = (key: string, hex: string): string => {
  const shades = SEMANTIC_SHADES[key];
  if (!shades) return hex;
  const fallback = shades[0];
  if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return fallback;
  const lower = hex.trim().toLowerCase();
  if (shades.some((s) => s.toLowerCase() === lower)) return hex;

  const { r, g, b } = hexToRgb(lower);
  if (key === 'success') {
    // Must be predominantly green
    if (g > r * 1.15 && g >= b * 0.9 && g >= 80) return hex;
    return fallback;
  }
  if (key === 'warning') {
    // Must be predominantly yellow/amber/orange (high R and moderate-to-high G, low B)
    if (r >= 160 && g >= 80 && r >= g * 0.9 && b < g * 0.75) return hex;
    return fallback;
  }
  if (key === 'danger') {
    // Must be predominantly red/crimson/rose
    if (r >= 150 && r > g * 1.35 && g < 180) return hex;
    return fallback;
  }
  return fallback;
};

export interface WallpaperOpticalMetrics {
  avgLuminance: number;
  contrastStdDev: number;
  edgeComplexity: number;
  avgSaturation: number;
  dominantRgb: { r: number; g: number; b: number };
  vibrantRgb: { r: number; g: number; b: number } | null;
  isPassthrough: boolean;
  hasWallpaper: boolean;
}

const rgbToHsl = (r: number, g: number, b: number) => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      case bn:
        h = (rn - gn) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h, s, l };
};

const extractColorsFromCssString = (cssStr?: string): Array<{ r: number; g: number; b: number }> => {
  if (!cssStr || typeof cssStr !== 'string') return [];
  const results: Array<{ r: number; g: number; b: number }> = [];
  const hexMatches = cssStr.match(/#[0-9a-fA-F]{3,6}\b/g) || [];
  for (const hm of hexMatches) {
    const clean = hm.replace('#', '');
    const full =
      clean.length === 3
        ? clean
            .split('')
            .map((c) => c + c)
            .join('')
        : clean.slice(0, 6);
    results.push(hexToRgb(`#${full}`));
  }
  const rgbMatches = cssStr.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/gi) || [];
  for (const rm of rgbMatches) {
    const nums = rm.match(/\d+/g);
    if (nums && nums.length >= 3) {
      results.push({
        r: Math.min(255, parseInt(nums[0], 10) || 0),
        g: Math.min(255, parseInt(nums[1], 10) || 0),
        b: Math.min(255, parseInt(nums[2], 10) || 0),
      });
    }
  }
  return results;
};

export const sampleWallpaperOpticalMetrics = async (themeObj: any): Promise<WallpaperOpticalMetrics> => {
  const isPassthrough =
    !themeObj?.bgImage &&
    (themeObj?.bg === 'transparent' || Boolean(themeObj?.transparentWindow));

  const fallbackBgHex =
    themeObj?.bg && themeObj.bg !== 'transparent' ? String(themeObj.bg) : '#050914';
  const baseRgb = hexToRgb(fallbackBgHex);
  const baseLum = getLuminance(fallbackBgHex);
  const baseHsl = rgbToHsl(baseRgb.r, baseRgb.g, baseRgb.b);

  if (isPassthrough) {
    return {
      avgLuminance: 0.18,
      contrastStdDev: 0.22,
      edgeComplexity: 0.28,
      avgSaturation: 0.42,
      dominantRgb: { r: 8, g: 14, b: 26 },
      vibrantRgb: null,
      isPassthrough: true,
      hasWallpaper: false,
    };
  }

  const rawBgImage = typeof themeObj?.bgImage === 'string' ? themeObj.bgImage.trim() : '';
  if (rawBgImage && rawBgImage !== 'none' && typeof document !== 'undefined') {
    const sampled = await new Promise<WallpaperOpticalMetrics | null>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const timeoutId = window.setTimeout(() => resolve(null), 2500);

      img.onload = () => {
        window.clearTimeout(timeoutId);
        try {
          const w = 64;
          const h = 36;
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          const { data } = ctx.getImageData(0, 0, w, h);
          const totalPixels = w * h;
          const lums = new Float32Array(totalPixels);

          let sumLum = 0;
          let sumSat = 0;
          let sumR = 0;
          let sumG = 0;
          let sumB = 0;
          let weightSum = 0;

          let bestVibScore = 0;
          let vibrantRgb: { r: number; g: number; b: number } | null = null;

          for (let i = 0; i < totalPixels; i++) {
            const idx = i * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            lums[i] = lum;
            sumLum += lum;

            const { s, l } = rgbToHsl(r, g, b);
            sumSat += s;

            // Weight mid-to-deep atmospheric pixels higher for surface tinting
            const atmosphereWeight = 1 - Math.abs(l - 0.35);
            sumR += r * atmosphereWeight;
            sumG += g * atmosphereWeight;
            sumB += b * atmosphereWeight;
            weightSum += atmosphereWeight;

            // Track most vibrant chromatic accent candidate in the wallpaper
            const vibScore = s * (1 - Math.abs(l - 0.55) * 1.4);
            if (vibScore > bestVibScore && s > 0.28) {
              bestVibScore = vibScore;
              vibrantRgb = { r, g, b };
            }
          }

          const avgLuminance = sumLum / totalPixels;
          const avgSaturation = sumSat / totalPixels;

          let varianceSum = 0;
          for (let i = 0; i < totalPixels; i++) {
            const diff = lums[i] - avgLuminance;
            varianceSum += diff * diff;
          }
          const contrastStdDev = Math.sqrt(varianceSum / totalPixels);

          // Compute spatial edge complexity (horizontal + vertical local gradients)
          let edgeSum = 0;
          let edgeCount = 0;
          for (let y = 0; y < h - 1; y++) {
            for (let x = 0; x < w - 1; x++) {
              const idx = y * w + x;
              const gx = Math.abs(lums[idx] - lums[idx + 1]);
              const gy = Math.abs(lums[idx] - lums[idx + w]);
              edgeSum += gx + gy;
              edgeCount++;
            }
          }
          const rawEdge = edgeCount > 0 ? edgeSum / edgeCount : 0;
          const edgeComplexity = Math.max(0, Math.min(1, rawEdge * 6.5));

          const domR = weightSum > 0 ? Math.round(sumR / weightSum) : baseRgb.r;
          const domG = weightSum > 0 ? Math.round(sumG / weightSum) : baseRgb.g;
          const domB = weightSum > 0 ? Math.round(sumB / weightSum) : baseRgb.b;

          resolve({
            avgLuminance,
            contrastStdDev,
            edgeComplexity,
            avgSaturation,
            dominantRgb: { r: domR, g: domG, b: domB },
            vibrantRgb,
            isPassthrough: false,
            hasWallpaper: true,
          });
        } catch {
          resolve(null);
        }
      };

      img.onerror = () => {
        window.clearTimeout(timeoutId);
        resolve(null);
      };

      img.src = rawBgImage;
    });

    if (sampled) return sampled;
  }

  // Fallback for Gradient Only or Solid Canvas (no wallpaper image)
  const gradColors = extractColorsFromCssString(themeObj?.bgGradient);
  const allColors = gradColors.length > 0 ? [...gradColors, baseRgb] : [baseRgb];
  const lums = allColors.map((c) => (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255);
  const avgLuminance = lums.reduce((a, b) => a + b, 0) / lums.length;
  const variance =
    lums.reduce((acc, l) => acc + (l - avgLuminance) * (l - avgLuminance), 0) / lums.length;
  const contrastStdDev = Math.sqrt(variance);
  const sats = allColors.map((c) => rgbToHsl(c.r, c.g, c.b).s);
  const avgSaturation = sats.reduce((a, b) => a + b, 0) / sats.length;

  return {
    avgLuminance: isNaN(avgLuminance) ? baseLum : avgLuminance,
    contrastStdDev: isNaN(contrastStdDev) ? 0.08 : contrastStdDev,
    edgeComplexity: gradColors.length > 1 ? 0.18 : 0.08,
    avgSaturation: isNaN(avgSaturation) ? baseHsl.s : avgSaturation,
    dominantRgb: allColors[0] || baseRgb,
    vibrantRgb: gradColors.length > 0 ? gradColors[0] : null,
    isPassthrough: false,
    hasWallpaper: false,
  };
};

const clampNum = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));
const roundToStep = (val: number, step: number) => Math.round(val / step) * step;

const hslToRgb = (h: number, s: number, l: number): { r: number; g: number; b: number } => {
  const hn = ((h % 1) + 1) % 1;
  const sn = clampNum(s, 0, 1);
  const ln = clampNum(l, 0, 1);
  if (sn === 0) {
    const v = Math.round(ln * 255);
    return { r: v, g: v, b: v };
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q;
  return {
    r: Math.round(hue2rgb(p, q, hn + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, hn) * 255),
    b: Math.round(hue2rgb(p, q, hn - 1 / 3) * 255),
  };
};

export const ensureLegibleAccent = (
  rawAccentHex: string | undefined,
  isLight: boolean,
  metrics?: WallpaperOpticalMetrics
): string => {
  const fallback = isLight ? '#2563eb' : '#38bdf8';
  const cleanHex =
    rawAccentHex && typeof rawAccentHex === 'string' && rawAccentHex.trim().startsWith('#')
      ? rawAccentHex.trim()
      : fallback;
  const rgb = hexToRgb(cleanHex);
  const lum = getLuminance(cleanHex);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

  const pickWallpaperHue = (): number => {
    if (metrics?.vibrantRgb) {
      const vh = rgbToHsl(metrics.vibrantRgb.r, metrics.vibrantRgb.g, metrics.vibrantRgb.b);
      if (vh.s >= 0.14) return vh.h;
    }
    if (metrics?.dominantRgb) {
      const dh = rgbToHsl(metrics.dominantRgb.r, metrics.dominantRgb.g, metrics.dominantRgb.b);
      if (dh.s >= 0.12) return dh.h;
    }
    return 212 / 360; // Sapphire blue default
  };

  if (isLight) {
    // On Light quartz glass, white/pale silver accents (lum > 0.52 or low saturation) vanish against light cards
    if (lum > 0.52 || hsl.l > 0.62 || (hsl.s < 0.16 && lum > 0.35) || lum < 0.04) {
      const targetHue = hsl.s >= 0.2 ? hsl.h : pickWallpaperHue();
      const targetSat = clampNum(Math.max(hsl.s, 0.74), 0.68, 0.9);
      const targetLight = 0.44;
      const adj = hslToRgb(targetHue, targetSat, targetLight);
      return rgbToHex(adj.r, adj.g, adj.b);
    }
    return cleanHex;
  } else {
    // On Dark obsidian glass, near-black accents or flat pure-white accents lose chromatic distinction
    if (lum < 0.2 || hsl.l < 0.42 || (hsl.s < 0.1 && hsl.l > 0.9)) {
      const targetHue = hsl.s >= 0.18 ? hsl.h : pickWallpaperHue();
      const targetSat = clampNum(Math.max(hsl.s, 0.8), 0.7, 0.94);
      const targetLight = 0.62;
      const adj = hslToRgb(targetHue, targetSat, targetLight);
      return rgbToHex(adj.r, adj.g, adj.b);
    }
    return cleanHex;
  }
};

export const computeHarmonizedGlassOptics = (
  themeObj: any,
  metrics: WallpaperOpticalMetrics,
  targetIsLight?: boolean
): {
  glassOpacity: string;
  glassBlur: string;
  glassSaturation: string;
  glassRefraction: string;
  glassBezel: string;
  glassBorderOpacity: string;
  glassSpecular: string;
  glassShadow: string;
} => {
  if (metrics.isPassthrough) {
    return {
      glassOpacity: '0.08',
      glassBlur: '28px',
      glassSaturation: '195%',
      glassRefraction: '130%',
      glassBezel: '115%',
      glassBorderOpacity: '0.26',
      glassSpecular: '0.36',
      glassShadow: '0.44',
    };
  }

  const bgHex = themeObj?.bg && themeObj.bg !== 'transparent' ? String(themeObj.bg) : '#050914';
  const bgLum = getLuminance(bgHex);
  const isLight = typeof targetIsLight === 'boolean' ? targetIsLight : bgLum >= 0.5;
  const wpLum = metrics.hasWallpaper ? metrics.avgLuminance : bgLum;

  const busyScore = clampNum(
    metrics.edgeComplexity * 0.65 + Math.min(1, metrics.contrastStdDev * 3.2) * 0.35,
    0,
    1
  );
  const hasScanlines = Boolean(themeObj?.scanlines);
  const radiusRem = parseFloat(String(themeObj?.radius || '1.25')) || 1.25;

  if (isLight) {
    // Light / Alabaster / Quartz mode: sheer refractive crystal with crisp slate border & shadow separation
    const darkWallpaperBoost = Math.max(0, 0.55 - wpLum) * 14;
    const opacityPct = Math.round(clampNum(13 + busyScore * 5 + darkWallpaperBoost, 12, 20));
    const blurPx = Math.round(clampNum(30 + busyScore * 12, 28, 44));
    const satPct = roundToStep(
      clampNum(185 - metrics.avgSaturation * 30 + busyScore * 10, 155, 200),
      5
    );
    const refractPct = roundToStep(
      clampNum((metrics.hasWallpaper ? 105 : 85) + busyScore * 20, 85, 130),
      5
    );
    const bezelPct = roundToStep(
      clampNum(95 + (radiusRem - 1.0) * 18 + busyScore * 10, 90, 115),
      5
    );
    const borderPct = Math.round(clampNum(28 + busyScore * 8, 26, 38));
    const specularPct = Math.round(clampNum(36 + busyScore * 8, 34, 46));
    const shadowPct = Math.round(clampNum(28 + busyScore * 8 + wpLum * 6, 24, 38));

    return {
      glassOpacity: (opacityPct / 100).toFixed(2),
      glassBlur: `${blurPx}px`,
      glassSaturation: `${satPct}%`,
      glassRefraction: `${refractPct}%`,
      glassBezel: `${bezelPct}%`,
      glassBorderOpacity: (borderPct / 100).toFixed(2),
      glassSpecular: (specularPct / 100).toFixed(2),
      glassShadow: (shadowPct / 100).toFixed(2),
    };
  }

  // Dark / Obsidian / Cyber mode optics tuned to wallpaper brightness, edges, contrast & saturation
  // When a Dark theme sits over a bright wallpaper (e.g. Alabaster Dawn), boost smoked glass density so white text pops
  const brightWallpaperBoost = Math.max(0, wpLum - 0.22) * 20;
  const scanlineAdjust = hasScanlines ? 5 : 0;
  const opacityPct = Math.round(
    clampNum(9 + busyScore * 7 + brightWallpaperBoost + scanlineAdjust, 8, 26)
  );
  const blurPx = Math.round(
    clampNum(
      (metrics.hasWallpaper ? 32 : 26) +
        busyScore * 12 +
        (wpLum > 0.5 ? 6 : 0) -
        (hasScanlines ? 6 : 0),
      22,
      48
    )
  );
  const satPct = roundToStep(
    clampNum(200 - metrics.avgSaturation * 40 + (metrics.hasWallpaper ? 10 : -15), 155, 215),
    5
  );
  const refractPct = roundToStep(
    clampNum(
      (metrics.hasWallpaper ? 105 : 85) +
        metrics.contrastStdDev * 90 -
        (hasScanlines ? 25 : 0),
      75,
      145
    ),
    5
  );
  const bezelPct = roundToStep(
    clampNum(95 + (radiusRem - 1.0) * 22 + (refractPct - 100) * 0.25, 85, 125),
    5
  );
  const borderPct = Math.round(
    clampNum(15 + busyScore * 6 + brightWallpaperBoost * 0.35, 14, 26)
  );
  const specularPct = Math.round(
    clampNum(24 + busyScore * 8 + metrics.contrastStdDev * 16, 22, 36)
  );
  const shadowPct = Math.round(
    clampNum(42 + busyScore * 8 + (wpLum > 0.45 ? 8 : 0), 38, 58)
  );

  return {
    glassOpacity: (opacityPct / 100).toFixed(2),
    glassBlur: `${blurPx}px`,
    glassSaturation: `${satPct}%`,
    glassRefraction: `${refractPct}%`,
    glassBezel: `${bezelPct}%`,
    glassBorderOpacity: (borderPct / 100).toFixed(2),
    glassSpecular: (specularPct / 100).toFixed(2),
    glassShadow: (shadowPct / 100).toFixed(2),
  };
};

export const analyzeAndHarmonizeTheme = async (
  themeObj: any,
  opts?: { glassOnly?: boolean; targetMode?: 'dark' | 'light' }
): Promise<Record<string, any>> => {
  const metrics = await sampleWallpaperOpticalMetrics(themeObj);

  const bgHex =
    themeObj?.bg && themeObj.bg !== 'transparent' ? String(themeObj.bg) : '#050914';
  const bgLum = getLuminance(bgHex);
  const isLight =
    !metrics.isPassthrough &&
    (opts?.targetMode ? opts.targetMode === 'light' : bgLum >= 0.5);

  const glassOptics = computeHarmonizedGlassOptics(themeObj, metrics, isLight);
  const harmonizedAccent = ensureLegibleAccent(themeObj?.accent, isLight, metrics);
  const accentRgb = hexToRgb(harmonizedAccent);
  const dom = metrics.dominantRgb;

  if (opts?.glassOnly) {
    // Tune glass optics + subtle panelTint harmonization without overwriting palette colors
    const tintHex = isLight
      ? rgbToHex(
          Math.round(clampNum(228 + dom.r * 0.05 + accentRgb.r * 0.02, 224, 242)),
          Math.round(clampNum(233 + dom.g * 0.05 + accentRgb.g * 0.02, 228, 245)),
          Math.round(clampNum(242 + dom.b * 0.04 + accentRgb.b * 0.03, 236, 250))
        )
      : rgbToHex(
          Math.round(clampNum(dom.r * 0.18 + accentRgb.r * 0.06 + 4, 4, 30)),
          Math.round(clampNum(dom.g * 0.18 + accentRgb.g * 0.06 + 7, 6, 34)),
          Math.round(clampNum(dom.b * 0.22 + accentRgb.b * 0.08 + 14, 10, 44))
        );
    return {
      ...glassOptics,
      panelTint: tintHex,
    };
  }

  if (isLight) {
    const harmonizedBg = rgbToHex(
      Math.round(clampNum(232 + dom.r * 0.05, 228, 245)),
      Math.round(clampNum(236 + dom.g * 0.05, 232, 247)),
      Math.round(clampNum(243 + dom.b * 0.04, 238, 251))
    );
    const sidebarHex = rgbToHex(
      Math.round(clampNum(226 + dom.r * 0.06 + accentRgb.r * 0.02, 222, 242)),
      Math.round(clampNum(232 + dom.g * 0.05 + accentRgb.g * 0.02, 226, 245)),
      Math.round(clampNum(241 + dom.b * 0.04 + accentRgb.b * 0.03, 234, 250))
    );
    const panelTintHex = rgbToHex(
      Math.round(clampNum(230 + dom.r * 0.05 + accentRgb.r * 0.02, 226, 244)),
      Math.round(clampNum(235 + dom.g * 0.05 + accentRgb.g * 0.02, 230, 246)),
      Math.round(clampNum(244 + dom.b * 0.04 + accentRgb.b * 0.03, 238, 251))
    );
    return {
      ...glassOptics,
      ...(themeObj?.bg === 'transparent' && !opts?.targetMode ? {} : { bg: harmonizedBg }),
      accent: harmonizedAccent,
      sidebar: sidebarHex,
      sidebartext: '#0f172a',
      text: '#0f172a',
      subtext: '#475569',
      headerText: '#0f172a',
      panelTint: panelTintHex,
      shadowColor: 'rgba(15,23,42,0.14)',
    };
  } else {
    const harmonizedBg =
      themeObj?.bg === 'transparent' && !opts?.targetMode
        ? 'transparent'
        : rgbToHex(
            Math.round(clampNum(dom.r * 0.1 + 4, 4, 16)),
            Math.round(clampNum(dom.g * 0.11 + 6, 6, 20)),
            Math.round(clampNum(dom.b * 0.14 + 12, 10, 28))
          );
    const sidebarHex = rgbToHex(
      Math.round(clampNum(dom.r * 0.14 + accentRgb.r * 0.04 + 5, 5, 22)),
      Math.round(clampNum(dom.g * 0.14 + accentRgb.g * 0.04 + 8, 7, 26)),
      Math.round(clampNum(dom.b * 0.18 + accentRgb.b * 0.06 + 14, 12, 36))
    );
    const tintHex = rgbToHex(
      Math.round(clampNum(dom.r * 0.18 + accentRgb.r * 0.06 + 6, 6, 28)),
      Math.round(clampNum(dom.g * 0.18 + accentRgb.g * 0.06 + 10, 9, 34)),
      Math.round(clampNum(dom.b * 0.22 + accentRgb.b * 0.08 + 18, 14, 44))
    );
    const subtextHex = rgbToHex(
      Math.round(clampNum(146 + dom.r * 0.06 + accentRgb.r * 0.04, 144, 172)),
      Math.round(clampNum(160 + dom.g * 0.06 + accentRgb.g * 0.04, 156, 184)),
      Math.round(clampNum(180 + dom.b * 0.06 + accentRgb.b * 0.04, 174, 202))
    );
    return {
      ...glassOptics,
      bg: harmonizedBg,
      accent: harmonizedAccent,
      sidebar: sidebarHex,
      sidebartext: '#f8fafc',
      text: '#f8fafc',
      subtext: subtextHex,
      headerText: '#ffffff',
      panelTint: tintHex,
      shadowColor: 'rgba(0,0,0,0.48)',
    };
  }
};

export const autoHarmonizeThemeColors = (themeOrBgHex: any, accentHex?: string) => {
  const isThemeObj = typeof themeOrBgHex === 'object' && themeOrBgHex !== null;
  const bgHex = typeof themeOrBgHex === 'string' ? themeOrBgHex : (themeOrBgHex?.bg || '#060b14');
  const resolvedAccent = accentHex || (isThemeObj ? themeOrBgHex?.accent : undefined);
  const lum = getLuminance(bgHex === 'transparent' ? '#060b14' : bgHex || '#060b14');
  const { r, g, b } = hexToRgb(bgHex === 'transparent' ? '#060b14' : bgHex || '#060b14');
  const isLight = lum >= 0.5;

  const fallbackMetrics: WallpaperOpticalMetrics = {
    avgLuminance: lum,
    contrastStdDev: 0.14,
    edgeComplexity: isThemeObj && themeOrBgHex?.bgImage ? 0.26 : 0.1,
    avgSaturation: 0.38,
    dominantRgb: { r, g, b },
    vibrantRgb: null,
    isPassthrough: Boolean(
      isThemeObj &&
        !themeOrBgHex?.bgImage &&
        (themeOrBgHex?.bg === 'transparent' || themeOrBgHex?.transparentWindow)
    ),
    hasWallpaper: Boolean(isThemeObj && themeOrBgHex?.bgImage),
  };
  const optics = isThemeObj
    ? computeHarmonizedGlassOptics(themeOrBgHex, fallbackMetrics, isLight)
    : {};
  const safeAccent = ensureLegibleAccent(resolvedAccent, isLight, fallbackMetrics);

  if (isLight) {
    const sidebarHex = rgbToHex(Math.max(222, r - 6), Math.max(226, g - 4), Math.max(234, b - 2));
    return {
      ...optics,
      accent: safeAccent,
      text: '#0f172a',
      subtext: '#475569',
      headerText: '#0f172a',
      sidebar: sidebarHex,
      sidebartext: '#0f172a',
      panelTint: '#e6ecf5',
    };
  } else {
    const sidebarHex = rgbToHex(Math.min(255, r + 4), Math.min(255, g + 6), Math.min(255, b + 10));
    const tintHex = rgbToHex(Math.min(255, r + 10), Math.min(255, g + 14), Math.min(255, b + 22));
    return {
      ...optics,
      accent: safeAccent,
      text: '#f8fafc',
      subtext: '#94a3b8',
      headerText: '#ffffff',
      sidebar: sidebarHex,
      sidebartext: '#f8fafc',
      panelTint: tintHex,
    };
  }
};

export interface GlassMaterialPreset {
  id: string;
  labelKey: string;
  fallbackLabel: string;
  descKey: string;
  fallbackDesc: string;
  iconKey: string;
  fallbackIcon: string;
  values: {
    glassOpacity: string;
    glassBlur: string;
    glassSaturation: string;
    glassRefraction: string;
    glassBezel: string;
    glassBorderOpacity: string;
    glassSpecular: string;
    glassShadow: string;
  };
}

export const GLASS_MATERIAL_PRESETS: GlassMaterialPreset[] = [
  {
    id: 'sapphire',
    labelKey: 'forge_preset_sapphire',
    fallbackLabel: 'Smoked Sapphire',
    descKey: 'forge_preset_sapphire_desc',
    fallbackDesc: 'Balanced 3D refractive crystal',
    iconKey: 'icon_diamond',
    fallbackIcon: 'diamond',
    values: {
      glassOpacity: '0.10',
      glassBlur: '36px',
      glassSaturation: '185%',
      glassRefraction: '100%',
      glassBezel: '100%',
      glassBorderOpacity: '0.14',
      glassSpecular: '0.24',
      glassShadow: '0.42',
    },
  },
  {
    id: 'crystal',
    labelKey: 'forge_preset_crystal',
    fallbackLabel: 'Pure Crystal',
    descKey: 'forge_preset_crystal_desc',
    fallbackDesc: 'Ultra-sheer window-pane clarity',
    iconKey: 'icon_auto_awesome',
    fallbackIcon: 'auto_awesome',
    values: {
      glassOpacity: '0.06',
      glassBlur: '40px',
      glassSaturation: '200%',
      glassRefraction: '135%',
      glassBezel: '115%',
      glassBorderOpacity: '0.20',
      glassSpecular: '0.32',
      glassShadow: '0.38',
    },
  },
  {
    id: 'cyber',
    labelKey: 'forge_preset_cyber',
    fallbackLabel: 'Neon Cyberglass',
    descKey: 'forge_preset_cyber_desc',
    fallbackDesc: 'Hyper-saturated electric rim glow',
    iconKey: 'icon_bolt',
    fallbackIcon: 'bolt',
    values: {
      glassOpacity: '0.12',
      glassBlur: '32px',
      glassSaturation: '215%',
      glassRefraction: '150%',
      glassBezel: '125%',
      glassBorderOpacity: '0.22',
      glassSpecular: '0.36',
      glassShadow: '0.48',
    },
  },
  {
    id: 'quartz',
    labelKey: 'forge_preset_quartz',
    fallbackLabel: 'Frosted Quartz',
    descKey: 'forge_preset_quartz_desc',
    fallbackDesc: 'Deep diffusion & soft satin bevel',
    iconKey: 'icon_blur_on',
    fallbackIcon: 'blur_on',
    values: {
      glassOpacity: '0.18',
      glassBlur: '48px',
      glassSaturation: '185%',
      glassRefraction: '75%',
      glassBezel: '90%',
      glassBorderOpacity: '0.24',
      glassSpecular: '0.36',
      glassShadow: '0.38',
    },
  },
  {
    id: 'obsidian',
    labelKey: 'forge_preset_obsidian',
    fallbackLabel: 'Obsidian Mirror',
    descKey: 'forge_preset_obsidian_desc',
    fallbackDesc: 'High-contrast smoked dark glass',
    iconKey: 'icon_dark_mode',
    fallbackIcon: 'dark_mode',
    values: {
      glassOpacity: '0.24',
      glassBlur: '32px',
      glassSaturation: '175%',
      glassRefraction: '115%',
      glassBezel: '105%',
      glassBorderOpacity: '0.20',
      glassSpecular: '0.30',
      glassShadow: '0.58',
    },
  },
  {
    id: 'matte',
    labelKey: 'forge_preset_matte',
    fallbackLabel: 'Tactical Stealth',
    descKey: 'forge_preset_matte_desc',
    fallbackDesc: 'Low-glare matte carbon finish',
    iconKey: 'icon_shield',
    fallbackIcon: 'shield',
    values: {
      glassOpacity: '0.36',
      glassBlur: '22px',
      glassSaturation: '140%',
      glassRefraction: '40%',
      glassBezel: '65%',
      glassBorderOpacity: '0.16',
      glassSpecular: '0.16',
      glassShadow: '0.64',
    },
  },
];

export interface CuratedColorPalette {
  id: string;
  labelKey: string;
  fallbackLabel: string;
  colors: {
    bg: string;
    sidebar: string;
    sidebartext: string;
    accent: string;
    text: string;
    subtext: string;
    headerText: string;
    panelTint: string;
    success: string;
    warning: string;
    danger: string;
  };
  suggestedWallpaper?: string;
}

export const CURATED_COLOR_PALETTES: CuratedColorPalette[] = [
  {
    id: 'architect',
    labelKey: 'forge_palette_architect',
    fallbackLabel: 'Sanctuary Sapphire',
    suggestedWallpaper: '/themes/architect.png',
    colors: {
      bg: '#000000',
      sidebar: '#000000',
      sidebartext: '#f8fafc',
      accent: '#38bdf8',
      text: '#f8fafc',
      subtext: '#94a3b8',
      headerText: '#ffffff',
      panelTint: '#050914',
      success: '#10b981',
      warning: '#f59e0b',
      danger: '#ef4444',
    },
  },
  {
    id: 'sims',
    labelKey: 'forge_palette_sims',
    fallbackLabel: 'Plumbob Emerald',
    suggestedWallpaper: '/themes/sims4.png',
    colors: {
      bg: '#eefbf5',
      sidebar: '#f4fdf9',
      sidebartext: '#0f2922',
      accent: '#10b981',
      text: '#0f2922',
      subtext: '#3d6356',
      headerText: '#0f2922',
      panelTint: '#ffffff',
      success: '#059669',
      warning: '#d97706',
      danger: '#e11d48',
    },
  },
  {
    id: 'aurora',
    labelKey: 'forge_palette_aurora',
    fallbackLabel: 'Arctic Aurora',
    suggestedWallpaper: '/themes/aurora.png',
    colors: {
      bg: '#030712',
      sidebar: '#030712',
      sidebartext: '#f8fafc',
      accent: '#06b6d4',
      text: '#f8fafc',
      subtext: '#94a3b8',
      headerText: '#ffffff',
      panelTint: '#060e1e',
      success: '#10b981',
      warning: '#f59e0b',
      danger: '#ef4444',
    },
  },
  {
    id: 'synth',
    labelKey: 'forge_palette_synth',
    fallbackLabel: 'Synthwave Outrun',
    suggestedWallpaper: '/themes/synthwave.png',
    colors: {
      bg: '#090214',
      sidebar: '#090214',
      sidebartext: '#fdf2f8',
      accent: '#f43f5e',
      text: '#fdf2f8',
      subtext: '#c4a3d4',
      headerText: '#ffffff',
      panelTint: '#120622',
      success: '#10b981',
      warning: '#facc15',
      danger: '#fb7185',
    },
  },
  {
    id: 'nocturne',
    labelKey: 'forge_palette_nocturne',
    fallbackLabel: 'Vampire Nocturne',
    suggestedWallpaper: '/themes/dracula.png',
    colors: {
      bg: '#12101b',
      sidebar: '#12101b',
      sidebartext: '#f8fafc',
      accent: '#c084fc',
      text: '#f8fafc',
      subtext: '#a5b4fc',
      headerText: '#ffffff',
      panelTint: '#161224',
      success: '#34d399',
      warning: '#fbbf24',
      danger: '#f87171',
    },
  },
  {
    id: 'alabaster',
    labelKey: 'forge_palette_alabaster',
    fallbackLabel: 'Radiant Alabaster',
    suggestedWallpaper: '/themes/radiant.png',
    colors: {
      bg: '#f4f6fb',
      sidebar: '#f8faff',
      sidebartext: '#0f172a',
      accent: '#6366f1',
      text: '#0f172a',
      subtext: '#475569',
      headerText: '#0f172a',
      panelTint: '#ffffff',
      success: '#059669',
      warning: '#d97706',
      danger: '#dc2626',
    },
  },
  {
    id: 'solar',
    labelKey: 'forge_palette_solar',
    fallbackLabel: 'Solar Amber',
    suggestedWallpaper: '/themes/bunker.png',
    colors: {
      bg: '#0c0a06',
      sidebar: '#141008',
      sidebartext: '#fef3c7',
      accent: '#f59e0b',
      text: '#fffbeb',
      subtext: '#d4b475',
      headerText: '#ffffff',
      panelTint: '#1c1508',
      success: '#10b981',
      warning: '#f59e0b',
      danger: '#ef4444',
    },
  },
  {
    id: 'sakura',
    labelKey: 'forge_palette_sakura',
    fallbackLabel: 'Cyber Sakura',
    suggestedWallpaper: '/themes/radiant.png',
    colors: {
      bg: '#140812',
      sidebar: '#1f0c1c',
      sidebartext: '#fdf2f8',
      accent: '#ec4899',
      text: '#fdf2f8',
      subtext: '#e2a8c8',
      headerText: '#ffffff',
      panelTint: '#260e22',
      success: '#34d399',
      warning: '#fbbf24',
      danger: '#fb7185',
    },
  },
];

export const BUILTIN_WALLPAPERS = [
  { id: 'architect', path: '/themes/architect.png', labelKey: 'forge_wp_architect', fallbackLabel: 'Sanctuary Spire' },
  { id: 'sims4', path: '/themes/sims4.png', labelKey: 'forge_wp_sims4', fallbackLabel: 'Plumbob Prism' },
  { id: 'sims4_dark', path: '/themes/sims4_dark.png', labelKey: 'forge_wp_sims4_dark', fallbackLabel: 'Plumbob Nocturne' },
  { id: 'aurora', path: '/themes/aurora.png', labelKey: 'forge_wp_aurora', fallbackLabel: 'Northern Aurora' },
  { id: 'radiant', path: '/themes/radiant.png', labelKey: 'forge_wp_radiant', fallbackLabel: 'Alabaster Dawn' },
  { id: 'synthwave', path: '/themes/synthwave.png', labelKey: 'forge_wp_synthwave', fallbackLabel: 'Neon Grid' },
  { id: 'dracula', path: '/themes/dracula.png', labelKey: 'forge_wp_dracula', fallbackLabel: 'Crimson Citadel' },
  { id: 'bunker', path: '/themes/bunker.png', labelKey: 'forge_wp_bunker', fallbackLabel: 'Tactical Vault' },
  { id: 'none', path: '', labelKey: 'forge_bg_none', fallbackLabel: 'Gradient Only' },
];

export const FONT_OPTIONS = [
  { labelKey: "font_inter_label", fallbackLabel: "Inter (Standard UI)", value: "Inter, sans-serif", descKey: "font_inter_desc", fallbackDesc: "Clean, high-legibility geometric sans-serif" },
  { labelKey: "font_jetbrains_label", fallbackLabel: "JetBrains Mono", value: "'JetBrains Mono', monospace", descKey: "font_jetbrains_desc", fallbackDesc: "Precision developer monospace" },
  { labelKey: "font_space_label", fallbackLabel: "Space Mono", value: "'Space Mono', monospace", descKey: "font_space_desc", fallbackDesc: "Retro-futuristic tactical terminal" },
  { labelKey: "font_rajdhani_label", fallbackLabel: "Rajdhani", value: "'Rajdhani', sans-serif", descKey: "font_rajdhani_desc", fallbackDesc: "Squared sci-fi display typography" },
  { labelKey: "font_orbitron_label", fallbackLabel: "Orbitron", value: "'Orbitron', sans-serif", descKey: "font_orbitron_desc", fallbackDesc: "High-tech geometric cyber display" },
  { labelKey: "font_firacode_label", fallbackLabel: "Fira Code", value: "'Fira Code', monospace", descKey: "font_firacode_desc", fallbackDesc: "Technical ligature code monospace" },
  { labelKey: "font_playfair_label", fallbackLabel: "Playfair Display", value: "'Playfair Display', serif", descKey: "font_playfair_desc", fallbackDesc: "High-contrast editorial serif" },
  { labelKey: "font_system_label", fallbackLabel: "System Native", value: "system-ui, sans-serif", descKey: "font_system_desc", fallbackDesc: "OS native UI font stack" }
];

export function isCustomThemeImage(src?: string | null): boolean {
  if (!src || typeof src !== "string") return false;
  const trimmed = src.trim();
  if (!trimmed || trimmed === "none") return false;
  if (BUILTIN_WALLPAPERS.some((w) => w.path === trimmed)) return false;
  if (trimmed.startsWith("/themes/")) return false;
  return true;
}

export async function extractImageBytes(
  src: string
): Promise<{ bytes: Uint8Array; ext: string; mime: string } | null> {
  try {
    if (src.startsWith("data:image/")) {
      const match = src.match(/^data:(image\/([a-zA-Z0-9+.-]+));base64,(.+)$/);
      if (!match) return null;
      const mime = match[1];
      let ext = match[2].toLowerCase();
      if (ext === "jpeg") ext = "jpg";
      else if (ext === "svg+xml") ext = "svg";
      else if (!["webp", "png", "jpg", "gif"].includes(ext)) ext = "webp";

      const binaryStr = atob(match[3]);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      return { bytes, ext, mime };
    }

    const res = await fetch(src);
    if (!res.ok) return null;
    const blob = await res.blob();
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const mime = blob.type || "image/webp";
    let ext = "webp";
    if (mime.includes("png") || /\.png($|\?)/i.test(src)) ext = "png";
    else if (mime.includes("jpeg") || mime.includes("jpg") || /\.jpe?g($|\?)/i.test(src)) ext = "jpg";
    return { bytes, ext, mime };
  } catch {
    return null;
  }
}

export function compressImageBytesToDataUrl(
  bytes: Uint8Array,
  mime: string,
  maxW = 1920,
  maxH = 1080
): Promise<string> {
  return new Promise((resolve) => {
    try {
      const blob = new Blob([bytes as unknown as BlobPart], { type: mime || "image/webp" });
      const objUrl = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          let width = img.width || maxW;
          let height = img.height || maxH;
          if (width > height) {
            if (width > maxW) {
              height = Math.round(height * (maxW / width));
              width = maxW;
            }
          } else {
            if (height > maxH) {
              width = Math.round(width * (maxH / height));
              height = maxH;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL("image/webp", 0.82);
            URL.revokeObjectURL(objUrl);
            resolve(dataUrl);
            return;
          }
        } catch {
          // fallback below
        }
        URL.revokeObjectURL(objUrl);
        resolve(bytesToBase64DataUrl(bytes, mime));
      };
      img.onerror = () => {
        URL.revokeObjectURL(objUrl);
        resolve(bytesToBase64DataUrl(bytes, mime));
      };
      img.src = objUrl;
    } catch {
      resolve(bytesToBase64DataUrl(bytes, mime));
    }
  });
}

function bytesToBase64DataUrl(bytes: Uint8Array, mime = "image/webp"): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

function guessImageMime(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/webp";
}

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function exportThemeWithAssets(
  themeObj: any,
  opts?: {
    vaultPath?: string;
    t?: (key: string, fallback: string) => string;
    pushStatus?: (msg: string, type?: any) => void;
  }
): Promise<boolean> {
  const t = opts?.t || ((_k: string, fb: string) => fb);
  try {
    const rawName = String(themeObj?.name || "theme").trim();
    const safeName = rawName.replace(/[<>:"/\\|?*]+/g, "_").trim() || "theme";
    const hasCustomBg = isCustomThemeImage(themeObj?.bgImage);
    const hasCustomPreview = isCustomThemeImage(themeObj?.previewImage);

    if (isDesktop()) {
      let resolvedVaultPath = opts?.vaultPath;
      if (!resolvedVaultPath) {
        try {
          const coords: any = await invoke("get_saved_coordinates");
          resolvedVaultPath = coords?.vault_path;
        } catch {}
      }
      const defaultPath = resolvedVaultPath
        ? `${resolvedVaultPath}\\Data\\Themes\\${safeName}.json`
        : `${safeName}.json`;
      const savePath = await save({
        defaultPath,
        filters: [{ name: "Sanctuary Theme (.json)", extensions: ["json"] }],
      });
      if (!savePath) return false;

      const normalized = String(savePath);
      const sep = normalized.includes("\\") ? "\\" : "/";
      const lastSepIdx = Math.max(normalized.lastIndexOf("\\"), normalized.lastIndexOf("/"));
      const dirPath = lastSepIdx >= 0 ? normalized.slice(0, lastSepIdx) : "";
      const fileName = lastSepIdx >= 0 ? normalized.slice(lastSepIdx + 1) : normalized;
      const baseName = fileName.replace(/\.json$/i, "") || safeName;

      const jsonPayload: any = { ...themeObj };
      let exportedImages = 0;

      if (hasCustomBg) {
        const extracted = await extractImageBytes(themeObj.bgImage);
        if (extracted) {
          const imgFileName = `${baseName}.${extracted.ext}`;
          const imgFullPath = dirPath ? `${dirPath}${sep}${imgFileName}` : imgFileName;
          await writeFile(imgFullPath, extracted.bytes);
          jsonPayload.bgImageFile = imgFileName;
          if (!String(themeObj.bgImage).startsWith("http://") && !String(themeObj.bgImage).startsWith("https://")) {
            jsonPayload.bgImage = await compressImageBytesToDataUrl(extracted.bytes, extracted.mime, 1920, 1080);
          }
          exportedImages++;
        }
      }

      if (hasCustomPreview) {
        const extracted = await extractImageBytes(themeObj.previewImage);
        if (extracted) {
          const prevFileName = `${baseName}_preview.${extracted.ext}`;
          const prevFullPath = dirPath ? `${dirPath}${sep}${prevFileName}` : prevFileName;
          await writeFile(prevFullPath, extracted.bytes);
          jsonPayload.previewImageFile = prevFileName;
          if (!String(themeObj.previewImage).startsWith("http://") && !String(themeObj.previewImage).startsWith("https://")) {
            jsonPayload.previewImage = await compressImageBytesToDataUrl(extracted.bytes, extracted.mime, 1280, 720);
          }
          exportedImages++;
        }
      }

      await writeTextFile(normalized, JSON.stringify(jsonPayload, null, 2));
      opts?.pushStatus?.(
        exportedImages > 0
          ? t("forge_status_exported_with_image", "{Chameleon} JSON & image exported.")
          : t("forge_status_exported_json", "{Chameleon} JSON exported."),
        "success"
      );
      return true;
    } else {
      const jsonPayload: any = { ...themeObj };
      let exportedImages = 0;

      if (hasCustomBg) {
        const extracted = await extractImageBytes(themeObj.bgImage);
        if (extracted) {
          const imgFileName = `${safeName}.${extracted.ext}`;
          triggerBrowserDownload(
            new Blob([extracted.bytes as unknown as BlobPart], { type: extracted.mime }),
            imgFileName
          );
          jsonPayload.bgImageFile = imgFileName;
          if (!String(themeObj.bgImage).startsWith("http://") && !String(themeObj.bgImage).startsWith("https://")) {
            jsonPayload.bgImage = await compressImageBytesToDataUrl(extracted.bytes, extracted.mime, 1920, 1080);
          }
          exportedImages++;
        }
      }

      if (hasCustomPreview) {
        const extracted = await extractImageBytes(themeObj.previewImage);
        if (extracted) {
          const prevFileName = `${safeName}_preview.${extracted.ext}`;
          triggerBrowserDownload(
            new Blob([extracted.bytes as unknown as BlobPart], { type: extracted.mime }),
            prevFileName
          );
          jsonPayload.previewImageFile = prevFileName;
          if (!String(themeObj.previewImage).startsWith("http://") && !String(themeObj.previewImage).startsWith("https://")) {
            jsonPayload.previewImage = await compressImageBytesToDataUrl(extracted.bytes, extracted.mime, 1280, 720);
          }
          exportedImages++;
        }
      }

      triggerBrowserDownload(
        new Blob([JSON.stringify(jsonPayload, null, 2)], { type: "application/json" }),
        `${safeName}.json`
      );
      opts?.pushStatus?.(
        exportedImages > 0
          ? t("forge_status_exported_with_image", "{Chameleon} JSON & image exported.")
          : t("forge_status_exported_json", "{Chameleon} JSON exported."),
        "success"
      );
      return true;
    }
  } catch (err) {
    opts?.pushStatus?.(`${t("alert_export_failed", "Export failed: ")}${err}`, "error");
    return false;
  }
}

function isRelativeImageFilename(val: any): val is string {
  if (!val || typeof val !== "string") return false;
  const trimmed = val.trim();
  if (!trimmed || trimmed === "none") return false;
  if (trimmed.startsWith("data:") || trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("blob:") || trimmed.startsWith("/")) {
    return false;
  }
  return /\.(webp|png|jpe?g|gif)$/i.test(trimmed);
}

export async function importThemeWithAssets(opts?: {
  t?: (key: string, fallback: string) => string;
  pushStatus?: (msg: string, type?: any) => void;
}): Promise<{ theme?: any; imageOnlyDataUrl?: string; loadedCompanionImage?: boolean } | null> {
  const t = opts?.t || ((_k: string, fb: string) => fb);
  try {
    if (isDesktop()) {
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: "Sanctuary Theme & Image (.json, .webp, .png, .jpg)",
            extensions: ["json", "webp", "png", "jpg", "jpeg"],
          },
        ],
      });
      if (!selected) return null;

      const paths = Array.isArray(selected) ? selected.map(String) : [String(selected)];
      const jsonPath = paths.find((p) => /\.json$/i.test(p));
      const imagePaths = paths.filter((p) => /\.(webp|png|jpe?g|gif)$/i.test(p));

      if (!jsonPath && imagePaths.length > 0) {
        const bytes = await readFile(imagePaths[0]);
        const dataUrl = await compressImageBytesToDataUrl(bytes, guessImageMime(imagePaths[0]), 1920, 1080);
        opts?.pushStatus?.(
          t("forge_status_imported_image", "{Chameleon} wallpaper image imported."),
          "success"
        );
        return { imageOnlyDataUrl: dataUrl };
      }

      if (!jsonPath) return null;

      const content = await readTextFile(jsonPath);
      const parsed = JSON.parse(content);

      const sep = jsonPath.includes("\\") ? "\\" : "/";
      const lastSepIdx = Math.max(jsonPath.lastIndexOf("\\"), jsonPath.lastIndexOf("/"));
      const dirPath = lastSepIdx >= 0 ? jsonPath.slice(0, lastSepIdx) : "";
      const fileName = lastSepIdx >= 0 ? jsonPath.slice(lastSepIdx + 1) : jsonPath;
      const baseName = fileName.replace(/\.json$/i, "");

      let loadedCompanionImage = false;

      // 1. Resolve Wallpaper (bgImage) from co-selected image OR companion image in the same folder
      const explicitBgPath = imagePaths.find((p) => !/_preview\.(webp|png|jpe?g|gif)$/i.test(p));
      const explicitPreviewPath = imagePaths.find((p) => /_preview\.(webp|png|jpe?g|gif)$/i.test(p));

      if (explicitBgPath) {
        const bytes = await readFile(explicitBgPath);
        parsed.bgImage = await compressImageBytesToDataUrl(bytes, guessImageMime(explicitBgPath), 1920, 1080);
        loadedCompanionImage = true;
      } else if (dirPath && (!parsed.bgImage || isRelativeImageFilename(parsed.bgImage) || parsed.bgImageFile)) {
        const bgCandidates = Array.from(
          new Set(
            [
              isRelativeImageFilename(parsed.bgImageFile) ? parsed.bgImageFile : null,
              isRelativeImageFilename(parsed.bgImage) ? parsed.bgImage : null,
              `${baseName}.webp`,
              `${baseName}.png`,
              `${baseName}.jpg`,
              `${baseName}.jpeg`,
              `${baseName}_wallpaper.webp`,
              `${baseName}_wallpaper.png`,
            ].filter(Boolean) as string[]
          )
        );

        for (const cand of bgCandidates) {
          const candPath = `${dirPath}${sep}${cand}`;
          try {
            if (await exists(candPath)) {
              const bytes = await readFile(candPath);
              parsed.bgImage = await compressImageBytesToDataUrl(bytes, guessImageMime(cand), 1920, 1080);
              loadedCompanionImage = true;
              break;
            }
          } catch {
            // ignore and try next candidate
          }
        }
      }

      if (isRelativeImageFilename(parsed.bgImage)) {
        parsed.bgImage = null;
      }
      delete parsed.bgImageFile;

      // 2. Resolve Preview Banner (previewImage) from co-selected image OR companion file in the same folder
      if (explicitPreviewPath) {
        const bytes = await readFile(explicitPreviewPath);
        parsed.previewImage = await compressImageBytesToDataUrl(bytes, guessImageMime(explicitPreviewPath), 1280, 720);
        loadedCompanionImage = true;
      } else if (dirPath && (!parsed.previewImage || isRelativeImageFilename(parsed.previewImage) || parsed.previewImageFile)) {
        const previewCandidates = Array.from(
          new Set(
            [
              isRelativeImageFilename(parsed.previewImageFile) ? parsed.previewImageFile : null,
              isRelativeImageFilename(parsed.previewImage) ? parsed.previewImage : null,
              `${baseName}_preview.webp`,
              `${baseName}_preview.png`,
              `${baseName}_preview.jpg`,
              `${baseName}_preview.jpeg`,
            ].filter(Boolean) as string[]
          )
        );

        for (const cand of previewCandidates) {
          const candPath = `${dirPath}${sep}${cand}`;
          try {
            if (await exists(candPath)) {
              const bytes = await readFile(candPath);
              parsed.previewImage = await compressImageBytesToDataUrl(bytes, guessImageMime(cand), 1280, 720);
              loadedCompanionImage = true;
              break;
            }
          } catch {
            // ignore and try next candidate
          }
        }
      }

      if (isRelativeImageFilename(parsed.previewImage)) {
        delete parsed.previewImage;
      }
      delete parsed.previewImageFile;

      opts?.pushStatus?.(
        loadedCompanionImage || isCustomThemeImage(parsed.bgImage)
          ? t("forge_status_imported_with_image", "{Chameleon} JSON & image imported.")
          : t("forge_status_imported_json", "{Chameleon} JSON imported."),
        "success"
      );

      return { theme: parsed, loadedCompanionImage: loadedCompanionImage || isCustomThemeImage(parsed.bgImage) };
    } else {
      // Browser fallback with multi-file input (.json + optional image)
      return await new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = true;
        input.accept = ".json,image/webp,image/png,image/jpeg";
        input.onchange = async () => {
          try {
            const files = Array.from(input.files || []);
            if (files.length === 0) {
              resolve(null);
              return;
            }
            const jsonFile = files.find((f) => /\.json$/i.test(f.name));
            const imageFiles = files.filter((f) => /\.(webp|png|jpe?g|gif)$/i.test(f.name));

            if (!jsonFile && imageFiles.length > 0) {
              const buf = await imageFiles[0].arrayBuffer();
              const dataUrl = await compressImageBytesToDataUrl(
                new Uint8Array(buf),
                imageFiles[0].type || guessImageMime(imageFiles[0].name),
                1920,
                1080
              );
              opts?.pushStatus?.(
                t("forge_status_imported_image", "{Chameleon} wallpaper image imported."),
                "success"
              );
              resolve({ imageOnlyDataUrl: dataUrl });
              return;
            }

            if (!jsonFile) {
              resolve(null);
              return;
            }

            const text = await jsonFile.text();
            const parsed = JSON.parse(text);
            let loadedCompanionImage = false;

            const bgFile = imageFiles.find((f) => !/_preview\.(webp|png|jpe?g|gif)$/i.test(f.name));
            const previewFile = imageFiles.find((f) => /_preview\.(webp|png|jpe?g|gif)$/i.test(f.name));

            if (bgFile) {
              const buf = await bgFile.arrayBuffer();
              parsed.bgImage = await compressImageBytesToDataUrl(
                new Uint8Array(buf),
                bgFile.type || guessImageMime(bgFile.name),
                1920,
                1080
              );
              loadedCompanionImage = true;
            }
            if (previewFile) {
              const buf = await previewFile.arrayBuffer();
              parsed.previewImage = await compressImageBytesToDataUrl(
                new Uint8Array(buf),
                previewFile.type || guessImageMime(previewFile.name),
                1280,
                720
              );
              loadedCompanionImage = true;
            }

            if (isRelativeImageFilename(parsed.bgImage)) parsed.bgImage = null;
            if (isRelativeImageFilename(parsed.previewImage)) delete parsed.previewImage;
            delete parsed.bgImageFile;
            delete parsed.previewImageFile;

            opts?.pushStatus?.(
              loadedCompanionImage || isCustomThemeImage(parsed.bgImage)
                ? t("forge_status_imported_with_image", "{Chameleon} JSON & image imported.")
                : t("forge_status_imported_json", "{Chameleon} JSON imported."),
              "success"
            );
            resolve({ theme: parsed, loadedCompanionImage: loadedCompanionImage || isCustomThemeImage(parsed.bgImage) });
          } catch (err) {
            opts?.pushStatus?.(`${t("alert_import_failed", "Import failed: ")}${err}`, "error");
            resolve(null);
          }
        };
        input.click();
      });
    }
  } catch (err) {
    opts?.pushStatus?.(`${t("alert_import_failed", "Import failed: ")}${err}`, "error");
    return null;
  }
}

export async function uploadThemeAssetsToCloud(
  rawTheme: any,
  supabaseClient: any,
  opts?: { bucketName?: string }
): Promise<{ themeData: any; bannerUrl: string | null }> {
  let parsed: any = rawTheme;
  if (typeof rawTheme === "string") {
    try {
      parsed = JSON.parse(rawTheme);
    } catch {
      parsed = {};
    }
  }
  const themeData: any = { ...(parsed || {}) };
  delete themeData.bgImageFile;
  delete themeData.previewImageFile;

  const bucket = opts?.bucketName || "backgrounds";

  const uploadSingleAsset = async (
    imgSource: string,
    prefix: string,
    maxW: number,
    maxH: number
  ): Promise<string> => {
    const trimmed = String(imgSource || "").trim();
    if (!trimmed || trimmed === "none") return trimmed;
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("/themes/")) {
      return trimmed;
    }

    const extracted = await extractImageBytes(trimmed);
    if (!extracted) return trimmed;

    // Compress to WebP before uploading to Supabase Storage
    const compressedDataUrl = await compressImageBytesToDataUrl(
      extracted.bytes,
      extracted.mime,
      maxW,
      maxH
    );
    const webpExtracted = (await extractImageBytes(compressedDataUrl)) || extracted;

    if (supabaseClient?.storage) {
      try {
        const rand = Math.random().toString(36).substring(2, 8);
        const storagePath = `themes/${prefix}_${Date.now()}_${rand}.${webpExtracted.ext}`;
        const { error: uploadError } = await supabaseClient.storage
          .from(bucket)
          .upload(storagePath, webpExtracted.bytes, {
            contentType: webpExtracted.mime,
            upsert: true,
          });

        if (!uploadError) {
          const { data: publicUrlData } = supabaseClient.storage
            .from(bucket)
            .getPublicUrl(storagePath);
          if (publicUrlData?.publicUrl) {
            return publicUrlData.publicUrl;
          }
        }
      } catch {
        // Fall back to compact WebP data URL if storage bucket is unavailable on custom spoke DB
      }
    }

    // Fallback: compact WebP data URL so the wallpaper still works in JSONB
    return await compressImageBytesToDataUrl(extracted.bytes, extracted.mime, 1280, 720);
  };

  if (isCustomThemeImage(themeData.bgImage)) {
    themeData.bgImage = await uploadSingleAsset(themeData.bgImage, "bg", 1920, 1080);
  }

  if (isCustomThemeImage(themeData.previewImage)) {
    themeData.previewImage = await uploadSingleAsset(themeData.previewImage, "preview", 1280, 720);
  }

  const bannerUrl =
    themeData.previewImage && String(themeData.previewImage).startsWith("http")
      ? themeData.previewImage
      : themeData.bgImage && String(themeData.bgImage).startsWith("http")
        ? themeData.bgImage
        : null;

  return { themeData, bannerUrl };
}
