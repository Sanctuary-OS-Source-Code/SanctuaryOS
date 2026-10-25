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
      glassBorderOpacity: '0.22',
      glassSpecular: '0.34',
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
