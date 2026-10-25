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

export const themeKeys = [
  'bg',
  'sidebar',
  'sidebartext',
  'accent',
  'text',
  'subtext',
  'headerText',
  'success',
  'warning',
  'danger',
];

export const PRESET_COLORS = [
  '#38bdf8', '#0284c7', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e',
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6',
  '#06b6d4', '#f8fafc', '#cbd5e1', '#94a3b8', '#475569', '#1e293b', '#0f172a', '#050914',
];

export const SEMANTIC_SHADES: Record<string, string[]> = {
  success: ['#10b981', '#22c55e', '#34d399', '#059669', '#4ade80', '#14b8a6', '#84cc16', '#6ee7b7'],
  warning: ['#f59e0b', '#fbbf24', '#eab308', '#facc15', '#d97706', '#f97316', '#fb923c', '#fde047'],
  danger: ['#f43f5e', '#ef4444', '#fb7185', '#f87171', '#e11d48', '#dc2626', '#ec4899', '#fda4af'],
};

export const autoHarmonizeThemeColors = (themeOrBgHex: any, accentHex?: string) => {
  const bgHex = typeof themeOrBgHex === 'string' ? themeOrBgHex : (themeOrBgHex?.bg || '#060b14');
  const resolvedAccent = accentHex || (typeof themeOrBgHex === 'object' ? themeOrBgHex?.accent : undefined);
  const lum = getLuminance(bgHex || '#060b14');
  const { r, g, b } = hexToRgb(bgHex || '#060b14');
  const isLight = lum >= 0.5;

  if (isLight) {
    const sidebarHex = rgbToHex(Math.min(255, r + 6), Math.min(255, g + 6), Math.min(255, b + 6));
    return {
      text: '#0f172a',
      subtext: '#475569',
      headerText: '#0f172a',
      sidebar: sidebarHex,
      sidebartext: '#0f172a',
      panelTint: '#ffffff',
      ...(resolvedAccent ? {} : { accent: '#0284c7' }),
    };
  } else {
    const sidebarHex = rgbToHex(Math.min(255, r + 4), Math.min(255, g + 6), Math.min(255, b + 10));
    const tintHex = rgbToHex(Math.min(255, r + 10), Math.min(255, g + 14), Math.min(255, b + 22));
    return {
      text: '#f8fafc',
      subtext: '#94a3b8',
      headerText: '#ffffff',
      sidebar: sidebarHex,
      sidebartext: '#f8fafc',
      panelTint: tintHex,
      ...(resolvedAccent ? {} : { accent: '#38bdf8' }),
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
      panelTint: '#ffffff',
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
      sidebartext: '#064e3b',
      accent: '#10b981',
      text: '#064e3b',
      subtext: '#047857',
      headerText: '#064e3b',
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
      panelTint: '#ffffff',
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
      subtext: '#d8b4e2',
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
      bg: '#f1f5f9',
      sidebar: '#f8fafc',
      sidebartext: '#0f172a',
      accent: '#0284c7',
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
      subtext: '#fcd34d',
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
      subtext: '#f9a8d4',
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
          jsonPayload.bgImage = imgFileName;
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
          jsonPayload.previewImage = prevFileName;
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
          jsonPayload.bgImage = imgFileName;
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
          jsonPayload.previewImage = prevFileName;
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
        loadedCompanionImage
          ? t("forge_status_imported_with_image", "{Chameleon} JSON & image imported.")
          : t("forge_status_imported_json", "{Chameleon} JSON imported."),
        "success"
      );

      return { theme: parsed, loadedCompanionImage };
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
              loadedCompanionImage
                ? t("forge_status_imported_with_image", "{Chameleon} JSON & image imported.")
                : t("forge_status_imported_json", "{Chameleon} JSON imported."),
              "success"
            );
            resolve({ theme: parsed, loadedCompanionImage });
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
