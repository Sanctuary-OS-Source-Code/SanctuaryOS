import { createContext, useContext, useState, useEffect, useLayoutEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { mkdir, writeTextFile, readDir, readTextFile, readFile, remove, exists } from '@tauri-apps/plugin-fs';
import { supabase } from './supabase';
import { createClient } from '@supabase/supabase-js';
import { isDesktop } from './utils/envUtils';
import { isRootDomain } from './utils/routingUtils';

import { useStore } from './store';

export const DEFAULT_CORE_THEMES: any = {
  // Flagship Premium Dark — Smoked Obsidian Liquid Glass
  architect: {
    name: "Architect", bg: "#040812", sidebar: "#040812", sidebartext: "#f8fafc", accent: "#38bdf8",
    text: "#f8fafc", subtext: "#94a3b8", success: "#10b981", warning: "#f59e0b", danger: "#ef4444",
    panelTint: "#060d1f", headerText: "#ffffff", fontFamily: "Inter, sans-serif", fontSizeBase: "16px",
    glassOpacity: "0.14", glassBlur: "40px", glassSaturation: "185%", glassRefraction: "100%", glassBezel: "100%",
    glassBorderOpacity: "0.16", glassSpecular: "0.26", glassShadow: "0.44", radius: "1.25rem", shadowColor: "rgba(0,0,0,0.45)",
    bgGradient: "transparent",
    bgImage: "/themes/architect.png",
    animated: true, ambientOrb: false, ambientNoise: false,
    volumetricOrbs: [],
    fontSizeHeader: "1.875rem", fontSizeSubheader: "1.5rem", fontSizeTitle: "1.25rem", fontSizeSubtitle: "1.125rem",
    fontSizeText: "1rem", fontSizeSubtext: "0.75rem", fontSizeSidebar: "10px", sidebarWidth: "260px"
  },
  // Flagship Premium Light — Alabaster Crystal Quartz
  radiant: {
    name: "Radiant", bg: "#f4f6fb", sidebar: "#f8faff", sidebartext: "#0f172a", accent: "#6366f1",
    text: "#0f172a", subtext: "#475569", success: "#059669", warning: "#d97706", danger: "#dc2626",
    panelTint: "#f8faff", headerText: "#0f172a", fontFamily: "Inter, sans-serif", fontSizeBase: "16px",
    glassOpacity: "0.22", glassBlur: "42px", glassSaturation: "175%", glassRefraction: "95%", glassBezel: "95%",
    glassBorderOpacity: "0.48", glassSpecular: "0.54", glassShadow: "0.16", radius: "1.25rem", shadowColor: "rgba(15,23,42,0.08)",
    bgGradient: "transparent",
    bgImage: "/themes/radiant.png",
    animated: true, ambientOrb: false, ambientNoise: false,
    volumetricOrbs: [],
    fontSizeHeader: "1.875rem", fontSizeSubheader: "1.5rem", fontSizeTitle: "1.25rem", fontSizeSubtitle: "1.125rem",
    fontSizeText: "1rem", fontSizeSubtext: "0.75rem", fontSizeSidebar: "10px", sidebarWidth: "260px"
  },
  // Official Partner Community Light Theme — The Sims 4 ("Plumbob Crystal" — Light Mint & Emerald Quartz)
  sims4: {
    name: "Plumbob Crystal", badge: "The Sims 4", bg: "#eefbf5", sidebar: "#f4fdf9", sidebartext: "#0f2922", accent: "#10b981",
    text: "#0f2922", subtext: "#3d6356", success: "#059669", warning: "#d97706", danger: "#e11d48",
    panelTint: "#f4fdf9", headerText: "#0f2922", fontFamily: "Inter, sans-serif", fontSizeBase: "16px",
    glassOpacity: "0.22", glassBlur: "40px", glassSaturation: "175%", glassRefraction: "95%", glassBezel: "95%",
    glassBorderOpacity: "0.48", glassSpecular: "0.54", glassShadow: "0.16", radius: "1.5rem", shadowColor: "rgba(6,78,59,0.08)",
    bgGradient: "transparent",
    bgImage: "/themes/sims4.png",
    animated: true, ambientOrb: false, ambientNoise: false,
    volumetricOrbs: [],
    fontSizeHeader: "1.875rem", fontSizeSubheader: "1.5rem", fontSizeTitle: "1.25rem", fontSizeSubtitle: "1.125rem",
    fontSizeText: "1rem", fontSizeSubtext: "0.75rem", fontSizeSidebar: "10px", sidebarWidth: "260px"
  },
  // Official Partner Community Dark Theme — The Sims 4 ("Plumbob Nocturne" — Deep Emerald & Obsidian Crystal)
  sims4_dark: {
    name: "Plumbob Nocturne", badge: "The Sims 4", bg: "#020a06", sidebar: "#030e09", sidebartext: "#ecfdf5", accent: "#10b981",
    text: "#ecfdf5", subtext: "#86b3a0", success: "#10b981", warning: "#f59e0b", danger: "#f43f5e",
    panelTint: "#051910", headerText: "#ecfdf5", fontFamily: "Inter, sans-serif", fontSizeBase: "16px",
    glassOpacity: "0.15", glassBlur: "40px", glassSaturation: "195%", glassRefraction: "105%", glassBezel: "100%",
    glassBorderOpacity: "0.16", glassSpecular: "0.26", glassShadow: "0.44", radius: "1.5rem", shadowColor: "rgba(0,0,0,0.48)",
    bgGradient: "transparent",
    bgImage: "/themes/sims4_dark.png",
    animated: true, ambientOrb: false, ambientNoise: false,
    volumetricOrbs: [],
    fontSizeHeader: "1.875rem", fontSizeSubheader: "1.5rem", fontSizeTitle: "1.25rem", fontSizeSubtitle: "1.125rem",
    fontSizeText: "1rem", fontSizeSubtext: "0.75rem", fontSizeSidebar: "10px", sidebarWidth: "260px"
  },
  // Midnight Boreal Crystal
  aurora: {
    name: "Aurora", bg: "#030712", sidebar: "#030712", sidebartext: "#f8fafc", accent: "#06b6d4",
    text: "#f8fafc", subtext: "#94a3b8", success: "#10b981", warning: "#f59e0b", danger: "#ef4444",
    panelTint: "#061326", headerText: "#ffffff", fontFamily: "Inter, sans-serif", fontSizeBase: "16px",
    glassOpacity: "0.14", glassBlur: "40px", glassSaturation: "195%", glassRefraction: "110%", glassBezel: "105%",
    glassBorderOpacity: "0.16", glassSpecular: "0.26", glassShadow: "0.42", radius: "1.5rem", shadowColor: "rgba(0,0,0,0.45)",
    bgGradient: "transparent",
    bgImage: "/themes/aurora.png",
    animated: true, ambientOrb: false, ambientNoise: false,
    volumetricOrbs: [],
    fontSizeHeader: "1.875rem", fontSizeSubheader: "1.5rem", fontSizeTitle: "1.25rem", fontSizeSubtitle: "1.125rem",
    fontSizeText: "1rem", fontSizeSubtext: "0.75rem", fontSizeSidebar: "10px", sidebarWidth: "260px"
  },
  // Tactical Stealth Matrix
  bunker: {
    name: "Bunker", bg: "#020604", sidebar: "#020604", sidebartext: "#ecfdf5", accent: "#10b981",
    text: "#ecfdf5", subtext: "#7aa892", success: "#10b981", warning: "#f59e0b", danger: "#f43f5e",
    panelTint: "#05120b", headerText: "#ecfdf5", fontFamily: "'JetBrains Mono', monospace", fontSizeBase: "16px",
    glassOpacity: "0.20", glassBlur: "34px", glassSaturation: "165%", glassRefraction: "75%", glassBezel: "85%",
    glassBorderOpacity: "0.18", glassSpecular: "0.22", glassShadow: "0.52", radius: "0.875rem", shadowColor: "rgba(0,0,0,0.52)",
    bgGradient: "transparent",
    bgImage: "/themes/bunker.png",
    animated: true, ambientOrb: false, ambientNoise: false, scanlines: true,
    volumetricOrbs: [],
    fontSizeHeader: "1.875rem", fontSizeSubheader: "1.5rem", fontSizeTitle: "1.25rem", fontSizeSubtitle: "1.125rem",
    fontSizeText: "1rem", fontSizeSubtext: "0.75rem", fontSizeSidebar: "10px", sidebarWidth: "260px"
  },
  // Cyberpunk Neon Outrun
  synthwave: {
    name: "Miami Vice", bg: "#090214", sidebar: "#090214", sidebartext: "#fdf2f8", accent: "#f43f5e",
    text: "#fdf2f8", subtext: "#c4a3d4", success: "#10b981", warning: "#facc15", danger: "#fb7185",
    panelTint: "#160729", headerText: "#ffffff", fontFamily: "Inter, sans-serif", fontSizeBase: "16px",
    glassOpacity: "0.15", glassBlur: "38px", glassSaturation: "205%", glassRefraction: "115%", glassBezel: "105%",
    glassBorderOpacity: "0.18", glassSpecular: "0.28", glassShadow: "0.46", radius: "1.25rem", shadowColor: "rgba(0,0,0,0.48)",
    bgGradient: "transparent",
    bgImage: "/themes/synthwave.png",
    animated: true, ambientOrb: false, ambientNoise: false,
    volumetricOrbs: [],
    fontSizeHeader: "1.875rem", fontSizeSubheader: "1.5rem", fontSizeTitle: "1.25rem", fontSizeSubtitle: "1.125rem",
    fontSizeText: "1rem", fontSizeSubtext: "0.75rem", fontSizeSidebar: "10px", sidebarWidth: "260px"
  },
  // Vampire Nocturne Obsidian
  dracula: {
    name: "Dracula", bg: "#12101b", sidebar: "#12101b", sidebartext: "#f8f8f2", accent: "#c084fc",
    text: "#f8fafc", subtext: "#a5b4fc", success: "#34d399", warning: "#fbbf24", danger: "#f87171",
    panelTint: "#18122b", headerText: "#f8f8f2", fontFamily: "Inter, sans-serif", fontSizeBase: "16px",
    glassOpacity: "0.15", glassBlur: "38px", glassSaturation: "190%", glassRefraction: "105%", glassBezel: "100%",
    glassBorderOpacity: "0.18", glassSpecular: "0.26", glassShadow: "0.46", radius: "1.25rem", shadowColor: "rgba(0,0,0,0.48)",
    bgGradient: "transparent",
    bgImage: "/themes/dracula.png",
    animated: true, ambientOrb: false, ambientNoise: false,
    volumetricOrbs: [],
    fontSizeHeader: "1.875rem", fontSizeSubheader: "1.5rem", fontSizeTitle: "1.25rem", fontSizeSubtitle: "1.125rem",
    fontSizeText: "1rem", fontSizeSubtext: "0.75rem", fontSizeSidebar: "10px", sidebarWidth: "260px"
  },
  // Pure Window-Pane Optical Crystal (OS Desktop Passthrough)
  true_glass: {
    name: "True Glass", bg: "transparent", sidebar: "#050b16", sidebartext: "#f8fafc", accent: "#7dd3fc",
    text: "#ffffff", subtext: "#cbd5e1", success: "#34d399", warning: "#fbbf24", danger: "#f87171",
    panelTint: "#081224", headerText: "#ffffff", fontFamily: "Inter, sans-serif", fontSizeBase: "16px",
    glassOpacity: "0.08", glassBlur: "46px", glassSaturation: "205%", glassRefraction: "135%", glassBezel: "115%",
    glassBorderOpacity: "0.22", glassSpecular: "0.34", glassShadow: "0.38", radius: "1.5rem", shadowColor: "rgba(0,0,0,0.36)",
    bgGradient: "transparent",
    bgImage: "",
    transparentWindow: true,
    animated: true, ambientOrb: false, ambientNoise: false,
    volumetricOrbs: [],
    fontSizeHeader: "1.875rem", fontSizeSubheader: "1.5rem", fontSizeTitle: "1.25rem", fontSizeSubtitle: "1.125rem",
    fontSizeText: "1rem", fontSizeSubtext: "0.75rem", fontSizeSidebar: "10px", sidebarWidth: "260px"
  }
};

const parseHexToRgb = (hexStr: string, fallback: [number, number, number]): [number, number, number] => {
  if (!hexStr || hexStr === 'transparent') return fallback;
  const clean = hexStr.replace('#', '').trim();
  if (clean.length === 6) {
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return [r, g, b];
  } else if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return [r, g, b];
  }
  return fallback;
};

export function computeGlassOpticalVars(currentTheme: any): Record<string, string> {

  const parseUnitOrPercent = (val: any, fallbackDecimal: number): number => {
    if (val === undefined || val === null || val === '') return fallbackDecimal;
    const str = String(val).trim();
    if (str.endsWith('%')) {
      const p = parseFloat(str);
      return isNaN(p) ? fallbackDecimal : Math.max(0, Math.min(1, p / 100));
    }
    const n = parseFloat(str);
    if (isNaN(n)) return fallbackDecimal;
    return n > 1 ? Math.max(0, Math.min(1, n / 100)) : Math.max(0, Math.min(1, n));
  };

  const rawBg = currentTheme.bg && currentTheme.bg !== 'transparent' ? currentTheme.bg : '#0a0d14';
  const [bgR, bgG, bgB] = parseHexToRgb(rawBg, [10, 13, 20]);
  const [sbR, sbG, sbB] = parseHexToRgb(currentTheme.sidebar || rawBg, [bgR, bgG, bgB]);
  const [txtR, txtG, txtB] = parseHexToRgb(currentTheme.text || '#ffffff', [255, 255, 255]);
  const [subR, subG, subB] = parseHexToRgb(currentTheme.subtext || '#94a3b8', [148, 163, 184]);
  const [accR, accG, accB] = parseHexToRgb(currentTheme.accent || '#38bdf8', [56, 189, 248]);
  const [sucR, sucG, sucB] = parseHexToRgb(currentTheme.success || '#10b981', [16, 185, 129]);
  const [wrnR, wrnG, wrnB] = parseHexToRgb(currentTheme.warning || '#f59e0b', [245, 158, 11]);
  const [dngR, dngG, dngB] = parseHexToRgb(currentTheme.danger || '#ef4444', [239, 68, 68]);
  const [tr, tg, tb] = parseHexToRgb(currentTheme.panelTint || '#ffffff', [255, 255, 255]);

  const rawOpacity = parseUnitOrPercent(currentTheme.glassOpacity, 0.20);
  const surfaceOpacity = Number((rawOpacity * 0.72).toFixed(4));
  const borderOpacity = parseUnitOrPercent(currentTheme.glassBorderOpacity, 0.14);
  const specularOpacity = parseUnitOrPercent(currentTheme.glassSpecular, 0.25);
  const shadowOpacity = parseUnitOrPercent(currentTheme.glassShadow, 0.40);
  const glassSaturation = currentTheme.glassSaturation || '185%';
  const rawBlurPx = Math.max(0, Math.min(80, parseFloat(String(currentTheme.glassBlur ?? '32')) || 32));
  const liveBlurPx = rawBlurPx <= 0 ? 0 : Math.max(4, Math.min(22, Math.round(rawBlurPx * 0.32)));
  const liveSurfaceBlurPx = rawBlurPx <= 0 ? 0 : Math.max(3, Math.min(16, Math.round(rawBlurPx * 0.22)));
  const liveDrawerBlurPx = rawBlurPx <= 0 ? 0 : Math.max(8, Math.min(28, Math.round(rawBlurPx * 0.48)));

  const yiq = ((bgR * 299) + (bgG * 587) + (bgB * 114)) / 1000;
  const isLight = yiq >= 128;

  const vars: Record<string, string> = {
    '--bg-rgb': `${bgR}, ${bgG}, ${bgB}`,
    '--sidebar-rgb': `${sbR}, ${sbG}, ${sbB}`,
    '--text-rgb': `${txtR}, ${txtG}, ${txtB}`,
    '--subtext-rgb': `${subR}, ${subG}, ${subB}`,
    '--accent-rgb': `${accR}, ${accG}, ${accB}`,
    '--success-rgb': `${sucR}, ${sucG}, ${sucB}`,
    '--warning-rgb': `${wrnR}, ${wrnG}, ${wrnB}`,
    '--danger-rgb': `${dngR}, ${dngG}, ${dngB}`,
    '--panelTint-rgb': `${tr}, ${tg}, ${tb}`,
    '--panelTint-rgb-spaces': `${tr} ${tg} ${tb}`,
    '--glassOpacityDecimal': rawOpacity.toString(),
    '--glassOpacitySurfaceDecimal': surfaceOpacity.toString(),
    '--glassOpacitySurfacePercent': `${surfaceOpacity * 100}%`,
    '--glass-panel-bg': `rgba(${tr}, ${tg}, ${tb}, ${rawOpacity})`,
    '--glass-surface-bg': `rgba(${tr}, ${tg}, ${tb}, ${surfaceOpacity})`,
    '--glassSaturation': glassSaturation,
    '--glass-live-blur': `${liveBlurPx}px`,
    '--glass-live-surface-blur': `${liveSurfaceBlurPx}px`,
    '--glass-live-drawer-blur': `${liveDrawerBlurPx}px`,
    '--glassBorderOpacityDecimal': borderOpacity.toString(),
    '--glassBorderOpacitySurfaceDecimal': Number((borderOpacity * 0.70).toFixed(4)).toString(),
    '--glassSpecularDecimal': specularOpacity.toString(),
    '--glassShadowDecimal': shadowOpacity.toString(),
  };

  if (isLight) {
    // 3D Convex Liquid Glass Optical Model for Light Themes:
    // Crisp Alabaster-Quartz with visible slate-accent perimeter hairline & bright 3D white inner bevel
    const lightPanelAlpha = Math.max(0.10, Math.min(0.48, rawOpacity * 0.74));
    const lightSurfaceAlpha = Math.max(0.06, Math.min(0.38, lightPanelAlpha * 0.72));
    const lightShadowScale = Math.max(0.11, Math.min(0.32, shadowOpacity * 0.72));
    const lightSpecTop = Math.max(0.58, Math.min(0.94, specularOpacity * 1.55));

    const lBrdR = Math.round(txtR * 0.72 + accR * 0.28);
    const lBrdG = Math.round(txtG * 0.72 + accG * 0.28);
    const lBrdB = Math.round(txtB * 0.72 + accB * 0.28);

    const nestedLightR = Math.round(tr * 0.88 + txtR * 0.08 + accR * 0.04);
    const nestedLightG = Math.round(tg * 0.88 + txtG * 0.08 + accG * 0.04);
    const nestedLightB = Math.round(tb * 0.88 + txtB * 0.08 + accB * 0.04);

    vars['--glass-base-fill'] = `rgba(${tr}, ${tg}, ${tb}, ${lightPanelAlpha.toFixed(3)})`;
    vars['--glass-surface-fill'] = `rgba(${tr}, ${tg}, ${tb}, ${lightSurfaceAlpha.toFixed(3)})`;
    vars['--glass-meniscus-top'] = `radial-gradient(125% 90% at 50% -18%, rgba(255, 255, 255, ${(lightSpecTop * 0.64).toFixed(3)}) 0%, rgba(255, 255, 255, ${(lightSpecTop * 0.18).toFixed(3)}) 42%, rgba(255, 255, 255, 0) 68%)`;
    vars['--glass-sheen'] = `linear-gradient(135deg, rgba(255, 255, 255, ${(lightSpecTop * 0.50).toFixed(3)}) 0%, rgba(255, 255, 255, ${(lightSpecTop * 0.16).toFixed(3)}) 28%, rgba(${accR}, ${accG}, ${accB}, 0.03) 56%, rgba(${lBrdR}, ${lBrdG}, ${lBrdB}, 0.04) 100%)`;
    vars['--glass-surface-sheen'] = `linear-gradient(135deg, rgba(255, 255, 255, ${(lightSpecTop * 0.42).toFixed(3)}) 0%, rgba(255, 255, 255, 0.12) 28%, transparent 56%, rgba(${lBrdR}, ${lBrdG}, ${lBrdB}, 0.035) 100%)`;
    vars['--glass-fresnel-rim'] = `linear-gradient(135deg, rgba(255, 255, 255, 0.88) 0%, rgba(${accR}, ${accG}, ${accB}, 0.22) 28%, rgba(${lBrdR}, ${lBrdG}, ${lBrdB}, 0.12) 50%, rgba(${accR}, ${accG}, ${accB}, 0.18) 72%, rgba(255, 255, 255, 0.72) 100%)`;

    // Crisp 4-sided wet-quartz rim (bright specular top-left catchlight + distinct slate bottom-right refraction edge)
    vars['--glass-border-top'] = `rgba(255, 255, 255, 0.86)`;
    vars['--glass-border-left'] = `rgba(255, 255, 255, 0.68)`;
    vars['--glass-border-right'] = `rgba(${lBrdR}, ${lBrdG}, ${lBrdB}, 0.16)`;
    vars['--glass-border-bottom'] = `rgba(${lBrdR}, ${lBrdG}, ${lBrdB}, 0.22)`;
    vars['--glass-surface-border'] = `rgba(${lBrdR}, ${lBrdG}, ${lBrdB}, 0.15)`;

    // Sculpted 3D Pure-White Inner Specular Bevel + Bottom-Right Thickness Crease (Light Theme)
    vars['--glass-inset-highlight'] = `inset 0 1.5px 0.5px 0 rgba(255, 255, 255, 0.95), inset 1.5px 0 0.5px 0 rgba(255, 255, 255, 0.74), inset 0 -1.5px 2px 0 rgba(${txtR}, ${txtG}, ${txtB}, 0.10), inset -1px 0 1.5px 0 rgba(${txtR}, ${txtG}, ${txtB}, 0.08)`;
    vars['--glass-surface-inset-highlight'] = `inset 0 1.5px 0.5px 0 rgba(255, 255, 255, 0.90), inset 1.5px 0 0.5px 0 rgba(255, 255, 255, 0.68), inset 0 -1px 1.5px 0 rgba(${txtR}, ${txtG}, ${txtB}, 0.09)`;

    // Pure soft ambient elevation shadows
    vars['--glass-outer-shadow'] = `0 18px 38px -8px rgba(15, 23, 42, ${(lightShadowScale * 1.45).toFixed(3)}), 0 6px 14px -3px rgba(15, 23, 42, ${(lightShadowScale * 0.88).toFixed(3)})`;
    vars['--glass-surface-outer-shadow'] = `0 6px 14px -3px rgba(15, 23, 42, ${(lightShadowScale * 0.74).toFixed(3)})`;

    // Nested Glass inside Cards / SidePanels / Modals (Raised 3D quartz pills with slate-tinted contrast)
    vars['--glass-nested-panel-bg'] = `rgba(${nestedLightR}, ${nestedLightG}, ${nestedLightB}, ${Math.max(0.18, Math.min(0.46, lightPanelAlpha * 0.85)).toFixed(3)})`;
    vars['--glass-nested-surface-bg'] = `rgba(${nestedLightR}, ${nestedLightG}, ${nestedLightB}, ${Math.max(0.12, Math.min(0.36, lightSurfaceAlpha * 0.88)).toFixed(3)})`;
    vars['--glass-nested-sheen'] = `linear-gradient(145deg, rgba(255, 255, 255, ${(lightSpecTop * 0.54).toFixed(3)}) 0%, rgba(255, 255, 255, 0.14) 32%, transparent 60%, rgba(${accR}, ${accG}, ${accB}, 0.05) 100%)`;
    vars['--glass-nested-shadow'] = `0 10px 24px -6px rgba(${txtR}, ${txtG}, ${txtB}, ${(lightShadowScale * 0.85).toFixed(3)}), 0 3px 8px -2px rgba(${txtR}, ${txtG}, ${txtB}, ${(lightShadowScale * 0.52).toFixed(3)})`;

    // Chrome & Containers (Sidebar, SidePanel Drawer, Floating Pills, Card Banner/Icon)
    vars['--glass-sidebar-bg'] = `rgba(${sbR}, ${sbG}, ${sbB}, ${Math.max(0.18, Math.min(0.50, lightPanelAlpha + 0.04)).toFixed(3)})`;
    vars['--glass-sidebar-sheen'] = `linear-gradient(145deg, rgba(255, 255, 255, ${(lightSpecTop * 0.48).toFixed(3)}) 0%, rgba(255, 255, 255, 0.12) 28%, transparent 58%, rgba(${lBrdR}, ${lBrdG}, ${lBrdB}, 0.04) 100%)`;
    vars['--glass-sidebar-shadow'] = `0 22px 48px -10px rgba(${txtR}, ${txtG}, ${txtB}, ${(lightShadowScale * 1.15).toFixed(3)}), 0 6px 18px -4px rgba(${txtR}, ${txtG}, ${txtB}, ${(lightShadowScale * 0.72).toFixed(3)}), inset 0 1.5px 0 0 rgba(255, 255, 255, ${(lightSpecTop * 0.92).toFixed(3)}), inset 1.5px 0 0 0 rgba(255, 255, 255, ${(lightSpecTop * 0.72).toFixed(3)})`;
    vars['--glass-drawer-bg'] = `rgba(${nestedLightR}, ${nestedLightG}, ${nestedLightB}, ${Math.max(0.22, Math.min(0.52, lightPanelAlpha + 0.06)).toFixed(3)})`;
    vars['--glass-drawer-sheen'] = `linear-gradient(145deg, rgba(255, 255, 255, ${(lightSpecTop * 0.46).toFixed(3)}) 0%, rgba(255, 255, 255, 0.10) 28%, transparent 58%, rgba(${lBrdR}, ${lBrdG}, ${lBrdB}, 0.04) 100%)`;
    vars['--glass-drawer-shadow'] = `-20px 0 50px rgba(${txtR}, ${txtG}, ${txtB}, ${(lightShadowScale * 1.18).toFixed(3)}), 0 20px 50px rgba(${txtR}, ${txtG}, ${txtB}, ${(lightShadowScale * 0.85).toFixed(3)})`;
    vars['--glass-portal-bg'] = `rgba(${nestedLightR}, ${nestedLightG}, ${nestedLightB}, ${Math.max(0.28, Math.min(0.60, lightPanelAlpha + 0.08)).toFixed(3)})`;
    vars['--glass-portal-sheen'] = `linear-gradient(145deg, rgba(255, 255, 255, ${(lightSpecTop * 0.58).toFixed(3)}) 0%, rgba(255, 255, 255, 0.14) 28%, transparent 58%, rgba(255, 255, 255, 0.22) 100%)`;
    vars['--glass-portal-shadow'] = `0 18px 40px -8px rgba(${txtR}, ${txtG}, ${txtB}, ${(lightShadowScale * 1.25).toFixed(3)}), 0 6px 16px -4px rgba(${txtR}, ${txtG}, ${txtB}, ${(lightShadowScale * 0.80).toFixed(3)})`;
    const ddLightR = Math.round(sbR * 0.55 + tr * 0.45);
    const ddLightG = Math.round(sbG * 0.55 + tg * 0.45);
    const ddLightB = Math.round(sbB * 0.55 + tb * 0.45);
    const ddLightAlpha = Math.max(0.84, Math.min(0.95, 0.78 + lightPanelAlpha * 0.35));
    vars['--glass-dropdown-bg'] = `rgba(${ddLightR}, ${ddLightG}, ${ddLightB}, ${ddLightAlpha.toFixed(3)})`;
    vars['--glass-dropdown-gradient'] = `linear-gradient(145deg, rgba(255, 255, 255, ${(lightSpecTop * 0.65).toFixed(3)}) 0%, rgba(255, 255, 255, 0.18) 35%, rgba(255, 255, 255, 0) 68%, rgba(${accR}, ${accG}, ${accB}, 0.05) 100%)`;
    vars['--glass-dropdown-border-top'] = `rgba(255, 255, 255, ${(lightSpecTop * 0.88).toFixed(3)})`;
    vars['--glass-dropdown-border-left'] = `rgba(255, 255, 255, ${(lightSpecTop * 0.68).toFixed(3)})`;
    vars['--glass-dropdown-border-right'] = `rgba(${lBrdR}, ${lBrdG}, ${lBrdB}, ${Math.max(0.10, Math.min(0.24, borderOpacity * 0.95)).toFixed(3)})`;
    vars['--glass-dropdown-border-bottom'] = `rgba(${lBrdR}, ${lBrdG}, ${lBrdB}, ${Math.max(0.14, Math.min(0.28, borderOpacity * 1.15)).toFixed(3)})`;
    vars['--glass-dropdown-shadow'] = `0 20px 44px -8px rgba(${txtR}, ${txtG}, ${txtB}, ${(lightShadowScale * 1.40).toFixed(3)}), 0 6px 16px -3px rgba(${txtR}, ${txtG}, ${txtB}, ${(lightShadowScale * 0.85).toFixed(3)}), inset 0 1.5px 0.5px 0 rgba(255, 255, 255, ${(lightSpecTop * 0.92).toFixed(3)}), inset 1.5px 0 0.5px 0 rgba(255, 255, 255, ${(lightSpecTop * 0.68).toFixed(3)})`;
    vars['--glass-dropdown-input-bg'] = `rgba(${tr}, ${tg}, ${tb}, ${Math.max(0.22, Math.min(0.55, lightSurfaceAlpha * 0.90)).toFixed(3)})`;
    vars['--glass-dropdown-input-border'] = `rgba(${lBrdR}, ${lBrdG}, ${lBrdB}, ${Math.max(0.10, Math.min(0.24, borderOpacity * 0.90)).toFixed(3)})`;
    vars['--glass-dropdown-item-hover'] = `rgba(${txtR}, ${txtG}, ${txtB}, 0.055)`;
    vars['--glass-dropdown-item-active'] = `rgba(${accR}, ${accG}, ${accB}, 0.10)`;
    vars['--glass-dropdown-item-active-border'] = `rgba(${lBrdR}, ${lBrdG}, ${lBrdB}, 0.24)`;
    vars['--glass-backdrop-dim'] = `rgba(${txtR}, ${txtG}, ${txtB}, 0.08)`;
    vars['--glass-card-banner-bg'] = `transparent`;
    vars['--glass-card-icon-bg'] = `rgba(${tr}, ${tg}, ${tb}, ${Math.max(0.24, Math.min(0.58, lightSurfaceAlpha + 0.08)).toFixed(3)})`;
    vars['--glass-card-icon-border'] = `rgba(255, 255, 255, ${(lightSpecTop * 0.82).toFixed(3)})`;
    vars['--glass-card-icon-shadow'] = `0 8px 18px -4px rgba(${txtR}, ${txtG}, ${txtB}, ${(lightShadowScale * 0.72).toFixed(3)}), inset 0 1.5px 0.5px 0 rgba(255, 255, 255, ${(lightSpecTop * 0.92).toFixed(3)}), inset 1.5px 0 0.5px 0 rgba(255, 255, 255, ${(lightSpecTop * 0.65).toFixed(3)}), inset 0 -1px 1.5px 0 rgba(${txtR}, ${txtG}, ${txtB}, 0.06)`;
    const navLightR = Math.round(tr * 0.86 + accR * 0.14);
    const navLightG = Math.round(tg * 0.86 + accG * 0.14);
    const navLightB = Math.round(tb * 0.86 + accB * 0.14);
    vars['--glass-nav-active-bg'] = `rgba(${navLightR}, ${navLightG}, ${navLightB}, ${Math.max(0.32, Math.min(0.68, lightPanelAlpha + 0.10)).toFixed(3)})`;
    vars['--glass-nav-active-sheen'] = `linear-gradient(135deg, rgba(255, 255, 255, ${(lightSpecTop * 0.62).toFixed(3)}) 0%, rgba(255, 255, 255, 0.12) 52%, rgba(${accR}, ${accG}, ${accB}, 0.06) 100%)`;
    vars['--glass-nav-active-border-top'] = `rgba(255, 255, 255, ${(lightSpecTop * 0.90).toFixed(3)})`;
    vars['--glass-nav-active-border-left'] = `rgba(255, 255, 255, ${(lightSpecTop * 0.72).toFixed(3)})`;
    vars['--glass-nav-active-border-right'] = `rgba(${lBrdR}, ${lBrdG}, ${lBrdB}, ${Math.max(0.08, Math.min(0.20, borderOpacity * 0.80)).toFixed(3)})`;
    vars['--glass-nav-active-border-bottom'] = `rgba(${lBrdR}, ${lBrdG}, ${lBrdB}, ${Math.max(0.11, Math.min(0.24, borderOpacity * 0.95)).toFixed(3)})`;
    vars['--glass-nav-active-shadow'] = `0 6px 14px -2px rgba(${txtR}, ${txtG}, ${txtB}, ${(lightShadowScale * 0.60).toFixed(3)}), inset 0 1.5px 0.5px 0 rgba(255, 255, 255, ${(lightSpecTop * 0.88).toFixed(3)}), inset 1.5px 0 0.5px 0 rgba(255, 255, 255, ${(lightSpecTop * 0.58).toFixed(3)}), inset 0 -1px 1.5px 0 rgba(${txtR}, ${txtG}, ${txtB}, 0.05)`;
  } else {
    // 3D Liquid Glass Optical Model for Dark Themes:
    // Rich smoked-obsidian crystal infused with subtle chromatic accent specular rims & icon wells
    const tintYiq = ((tr * 299) + (tg * 587) + (tb * 114)) / 1000;
    const isBrightTint = tintYiq >= 160;
    const darkPanelAlpha = currentTheme.bg === 'transparent'
      ? Math.max(0.06, Math.min(0.45, rawOpacity))
      : rawOpacity <= 0.22
        ? Math.max(0.06, Math.min(0.14, 0.04 + rawOpacity * 0.45))
        : Math.max(0.14, Math.min(0.52, 0.14 + (rawOpacity - 0.22) * 0.62));
    const darkSurfaceAlpha = Math.max(0.04, Number((darkPanelAlpha * 0.70).toFixed(3)));

    const baseR = isBrightTint ? Math.max(10, Math.min(22, bgR + 8)) : Math.round(tr * 0.78 + accR * 0.08);
    const baseG = isBrightTint ? Math.max(14, Math.min(28, bgG + 11)) : Math.round(tg * 0.78 + accG * 0.08);
    const baseB = isBrightTint ? Math.max(22, Math.min(38, bgB + 18)) : Math.round(tb * 0.78 + accB * 0.08);

    const dRimR = Math.round(255 * 0.72 + accR * 0.28);
    const dRimG = Math.round(255 * 0.72 + accG * 0.28);
    const dRimB = Math.round(255 * 0.72 + accB * 0.28);

    const specScale = Math.max(0.6, Math.min(2.2, specularOpacity / 0.24));
    const sheenTop = Math.max(0.12, Math.min(0.25, 0.17 * specScale));
    const sheenMid = Math.max(0.03, Math.min(0.07, 0.045 * specScale));
    const sheenBottom = Math.max(0.04, Math.min(0.10, 0.06 * specScale));
    const surfaceSheenTop = Math.max(0.09, sheenTop * 0.75);

    const topBorderAlpha = Math.max(0.34, Math.min(0.66, borderOpacity * 2.45));
    const leftBorderAlpha = Math.max(0.22, Math.min(0.46, borderOpacity * 1.65));
    const rightBorderAlpha = Math.max(0.10, Math.min(0.24, borderOpacity * 0.85));
    const bottomBorderAlpha = Math.max(0.14, Math.min(0.32, borderOpacity * 1.15));
    const outerShadowMain = Math.max(0.30, Math.min(0.66, shadowOpacity * 1.12));
    const outerShadowAmbient = Math.max(0.18, Math.min(0.44, shadowOpacity * 0.68));

    const fresnelTopLeft = Math.max(0.44, Math.min(0.78, 0.58 * specScale));
    const fresnelBottomRight = Math.max(0.22, Math.min(0.46, 0.32 * specScale));

    vars['--glass-base-fill'] = isBrightTint
      ? `rgba(255, 255, 255, ${(darkPanelAlpha * 0.62).toFixed(3)})`
      : `rgba(${baseR}, ${baseG}, ${baseB}, ${darkPanelAlpha.toFixed(3)})`;
    vars['--glass-surface-fill'] = isBrightTint
      ? `rgba(255, 255, 255, ${(darkSurfaceAlpha * 0.65).toFixed(3)})`
      : `rgba(${baseR}, ${baseG}, ${baseB}, ${darkSurfaceAlpha.toFixed(3)})`;
    vars['--glass-meniscus-top'] = `radial-gradient(120% 85% at 50% -20%, rgba(${dRimR}, ${dRimG}, ${dRimB}, 0.10) 0%, transparent 65%)`;
    vars['--glass-sheen'] = `linear-gradient(135deg, rgba(${dRimR}, ${dRimG}, ${dRimB}, ${sheenTop.toFixed(3)}) 0%, rgba(255, 255, 255, ${sheenMid.toFixed(3)}) 30%, rgba(255, 255, 255, 0.008) 56%, rgba(${accR}, ${accG}, ${accB}, ${(sheenBottom * 0.85).toFixed(3)}) 100%)`;
    vars['--glass-surface-sheen'] = `linear-gradient(135deg, rgba(${dRimR}, ${dRimG}, ${dRimB}, ${surfaceSheenTop.toFixed(3)}) 0%, rgba(255, 255, 255, 0.03) 32%, rgba(255, 255, 255, 0) 60%, rgba(${accR}, ${accG}, ${accB}, ${(sheenBottom * 0.65).toFixed(3)}) 100%)`;
    vars['--glass-fresnel-rim'] = `linear-gradient(135deg, rgba(${dRimR}, ${dRimG}, ${dRimB}, ${fresnelTopLeft.toFixed(3)}) 0%, rgba(${accR}, ${accG}, ${accB}, 0.20) 28%, rgba(255, 255, 255, 0.04) 52%, rgba(${accR}, ${accG}, ${accB}, 0.14) 76%, rgba(${dRimR}, ${dRimG}, ${dRimB}, ${fresnelBottomRight.toFixed(3)}) 100%)`;

    vars['--glass-border-top'] = `rgba(${dRimR}, ${dRimG}, ${dRimB}, ${Math.min(0.28, topBorderAlpha * 0.54).toFixed(3)})`;
    vars['--glass-border-left'] = `rgba(${dRimR}, ${dRimG}, ${dRimB}, ${Math.min(0.20, leftBorderAlpha * 0.48).toFixed(3)})`;
    vars['--glass-border-right'] = `rgba(255, 255, 255, ${Math.min(0.08, rightBorderAlpha * 0.44).toFixed(3)})`;
    vars['--glass-border-bottom'] = `rgba(255, 255, 255, ${Math.min(0.11, bottomBorderAlpha * 0.46).toFixed(3)})`;
    vars['--glass-surface-border'] = `rgba(${dRimR}, ${dRimG}, ${dRimB}, ${Math.max(0.09, Math.min(0.16, borderOpacity * 0.70)).toFixed(3)})`;

    // Sculpted 3D Liquid Glass Inner Specular Bevel (Dark Theme)
    const specTop = Math.max(0.22, Math.min(0.42, specularOpacity * 1.15));
    const specLeft = Math.max(0.14, Math.min(0.28, specularOpacity * 0.78));
    const specBottom = Math.max(0.06, Math.min(0.14, specularOpacity * 0.42));
    const specRight = Math.max(0.04, Math.min(0.10, specularOpacity * 0.28));
    vars['--glass-inset-highlight'] = `inset 0 1.5px 0.5px 0 rgba(${dRimR}, ${dRimG}, ${dRimB}, ${specTop.toFixed(3)}), inset 1.5px 0 0.5px 0 rgba(${dRimR}, ${dRimG}, ${dRimB}, ${specLeft.toFixed(3)}), inset 0 -1.5px 2px 0 rgba(0, 0, 0, 0.42), inset 0 -1px 0 0 rgba(255, 255, 255, ${specBottom.toFixed(3)}), inset -1px 0 0 0 rgba(255, 255, 255, ${specRight.toFixed(3)})`;
    vars['--glass-surface-inset-highlight'] = `inset 0 1.5px 0.5px 0 rgba(${dRimR}, ${dRimG}, ${dRimB}, ${(specTop * 0.82).toFixed(3)}), inset 1.5px 0 0.5px 0 rgba(${dRimR}, ${dRimG}, ${dRimB}, ${(specLeft * 0.72).toFixed(3)}), inset 0 -1px 1.5px 0 rgba(0, 0, 0, 0.34)`;

    vars['--glass-outer-shadow'] = `0 20px 44px -10px rgba(0, 0, 0, ${outerShadowMain.toFixed(3)}), 0 8px 20px -4px rgba(0, 0, 0, ${outerShadowAmbient.toFixed(3)})`;
    vars['--glass-surface-outer-shadow'] = `0 8px 18px -4px rgba(0, 0, 0, ${(outerShadowAmbient * 0.78).toFixed(3)})`;

    const nestedTintR = isBrightTint ? Math.round(dRimR * 0.78 + baseR * 0.22) : Math.round(tr * 0.65 + accR * 0.35);
    const nestedTintG = isBrightTint ? Math.round(dRimG * 0.78 + baseG * 0.22) : Math.round(tg * 0.65 + accG * 0.35);
    const nestedTintB = isBrightTint ? Math.round(dRimB * 0.78 + baseB * 0.22) : Math.round(tb * 0.65 + accB * 0.35);
    const nestedPanelAlpha = Math.max(0.035, Math.min(0.14, 0.025 + darkPanelAlpha * 0.24));
    const nestedSurfaceAlpha = Math.max(0.025, Math.min(0.11, 0.018 + darkSurfaceAlpha * 0.24));
    vars['--glass-nested-panel-bg'] = `rgba(${nestedTintR}, ${nestedTintG}, ${nestedTintB}, ${nestedPanelAlpha.toFixed(3)})`;
    vars['--glass-nested-surface-bg'] = `rgba(${nestedTintR}, ${nestedTintG}, ${nestedTintB}, ${nestedSurfaceAlpha.toFixed(3)})`;
    vars['--glass-nested-sheen'] = `linear-gradient(145deg, rgba(${dRimR}, ${dRimG}, ${dRimB}, ${(sheenTop * 0.88).toFixed(3)}) 0%, rgba(${dRimR}, ${dRimG}, ${dRimB}, ${(sheenMid * 0.85).toFixed(3)}) 32%, transparent 60%, rgba(${accR}, ${accG}, ${accB}, ${(sheenBottom * 0.75).toFixed(3)}) 100%)`;
    vars['--glass-nested-shadow'] = `0 10px 24px -6px rgba(0, 0, 0, ${(outerShadowAmbient * 0.90).toFixed(3)}), 0 4px 10px -2px rgba(0, 0, 0, ${(outerShadowAmbient * 0.55).toFixed(3)})`;

    const sbGlassR = Math.max(6, Math.min(36, Math.round(sbR * 0.84 + accR * 0.08 + 4)));
    const sbGlassG = Math.max(8, Math.min(42, Math.round(sbG * 0.84 + accG * 0.08 + 6)));
    const sbGlassB = Math.max(12, Math.min(54, Math.round(sbB * 0.84 + accB * 0.08 + 10)));
    vars['--glass-sidebar-bg'] = `rgba(${sbGlassR}, ${sbGlassG}, ${sbGlassB}, ${Math.max(0.14, Math.min(0.46, darkPanelAlpha + 0.04)).toFixed(3)})`;
    vars['--glass-sidebar-sheen'] = `linear-gradient(145deg, rgba(${dRimR}, ${dRimG}, ${dRimB}, ${(sheenTop * 0.78).toFixed(3)}) 0%, rgba(${dRimR}, ${dRimG}, ${dRimB}, ${(sheenMid * 0.78).toFixed(3)}) 32%, transparent 60%, rgba(${accR}, ${accG}, ${accB}, ${(sheenBottom * 0.75).toFixed(3)}) 100%)`;
    vars['--glass-sidebar-shadow'] = `0 24px 52px -10px rgba(0, 0, 0, ${(outerShadowMain * 1.15).toFixed(3)}), 0 8px 22px -4px rgba(0, 0, 0, ${outerShadowAmbient.toFixed(3)}), inset 0 1.5px 0.5px 0 rgba(${dRimR}, ${dRimG}, ${dRimB}, ${specTop.toFixed(3)}), inset 1.5px 0 0.5px 0 rgba(${dRimR}, ${dRimG}, ${dRimB}, ${specLeft.toFixed(3)}), inset 0 -1px 0.5px 0 rgba(${dRimR}, ${dRimG}, ${dRimB}, ${specBottom.toFixed(3)})`;
    vars['--glass-drawer-bg'] = `rgba(${baseR}, ${baseG}, ${baseB}, ${Math.max(0.22, Math.min(0.56, darkPanelAlpha + 0.12)).toFixed(3)})`;
    vars['--glass-drawer-sheen'] = `linear-gradient(145deg, rgba(${dRimR}, ${dRimG}, ${dRimB}, ${(sheenTop * 0.78).toFixed(3)}) 0%, rgba(${dRimR}, ${dRimG}, ${dRimB}, ${(sheenMid * 0.78).toFixed(3)}) 32%, transparent 60%, rgba(${accR}, ${accG}, ${accB}, ${(sheenBottom * 0.75).toFixed(3)}) 100%)`;
    vars['--glass-drawer-shadow'] = `-24px 0 60px rgba(0, 0, 0, ${(outerShadowMain * 1.12).toFixed(3)}), 0 24px 60px rgba(0, 0, 0, ${(outerShadowMain * 0.90).toFixed(3)})`;
    vars['--glass-portal-bg'] = `rgba(${baseR}, ${baseG}, ${baseB}, ${Math.max(0.30, Math.min(0.64, darkPanelAlpha + 0.22)).toFixed(3)})`;
    vars['--glass-portal-sheen'] = `linear-gradient(145deg, rgba(${dRimR}, ${dRimG}, ${dRimB}, ${(sheenTop * 0.82).toFixed(3)}) 0%, rgba(${dRimR}, ${dRimG}, ${dRimB}, ${(sheenMid * 0.85).toFixed(3)}) 32%, transparent 60%, rgba(${accR}, ${accG}, ${accB}, ${(sheenBottom * 0.80).toFixed(3)}) 100%)`;
    vars['--glass-portal-shadow'] = `0 20px 42px -6px rgba(0, 0, 0, ${(outerShadowMain * 1.15).toFixed(3)}), 0 8px 18px -2px rgba(0, 0, 0, ${outerShadowAmbient.toFixed(3)})`;
    const ddDarkR = Math.round(sbGlassR * 0.55 + baseR * 0.45);
    const ddDarkG = Math.round(sbGlassG * 0.55 + baseG * 0.45);
    const ddDarkB = Math.round(sbGlassB * 0.55 + baseB * 0.45);
    const ddDarkAlpha = Math.max(0.82, Math.min(0.94, 0.74 + darkPanelAlpha * 0.45));
    vars['--glass-dropdown-bg'] = `rgba(${ddDarkR}, ${ddDarkG}, ${ddDarkB}, ${ddDarkAlpha.toFixed(3)})`;
    vars['--glass-dropdown-gradient'] = `linear-gradient(145deg, rgba(${dRimR}, ${dRimG}, ${dRimB}, ${(sheenTop * 0.85).toFixed(3)}) 0%, rgba(${dRimR}, ${dRimG}, ${dRimB}, ${(sheenMid * 0.72).toFixed(3)}) 34%, transparent 64%, rgba(${accR}, ${accG}, ${accB}, ${(sheenBottom * 0.75).toFixed(3)}) 100%)`;
    vars['--glass-dropdown-border-top'] = `rgba(${dRimR}, ${dRimG}, ${dRimB}, ${Math.min(0.32, topBorderAlpha * 0.58).toFixed(3)})`;
    vars['--glass-dropdown-border-left'] = `rgba(${dRimR}, ${dRimG}, ${dRimB}, ${Math.min(0.24, leftBorderAlpha * 0.52).toFixed(3)})`;
    vars['--glass-dropdown-border-right'] = `rgba(${dRimR}, ${dRimG}, ${dRimB}, ${Math.min(0.12, rightBorderAlpha * 0.50).toFixed(3)})`;
    vars['--glass-dropdown-border-bottom'] = `rgba(${dRimR}, ${dRimG}, ${dRimB}, ${Math.min(0.15, bottomBorderAlpha * 0.52).toFixed(3)})`;
    vars['--glass-dropdown-shadow'] = `0 22px 48px -10px rgba(0, 0, 0, ${(outerShadowMain * 1.22).toFixed(3)}), 0 8px 20px -4px rgba(0, 0, 0, ${(outerShadowAmbient * 1.05).toFixed(3)}), inset 0 1.5px 0.5px 0 rgba(${dRimR}, ${dRimG}, ${dRimB}, ${specTop.toFixed(3)}), inset 1.5px 0 0.5px 0 rgba(${dRimR}, ${dRimG}, ${dRimB}, ${specLeft.toFixed(3)})`;
    vars['--glass-dropdown-input-bg'] = `rgba(${nestedTintR}, ${nestedTintG}, ${nestedTintB}, ${Math.max(0.03, nestedSurfaceAlpha * 0.90).toFixed(3)})`;
    vars['--glass-dropdown-input-border'] = `rgba(${dRimR}, ${dRimG}, ${dRimB}, ${Math.max(0.09, Math.min(0.18, borderOpacity * 0.72)).toFixed(3)})`;
    vars['--glass-dropdown-item-hover'] = `rgba(${txtR}, ${txtG}, ${txtB}, 0.055)`;
    vars['--glass-dropdown-item-active'] = `linear-gradient(135deg, rgba(${accR}, ${accG}, ${accB}, 0.16) 0%, rgba(${dRimR}, ${dRimG}, ${dRimB}, 0.05) 65%, rgba(${accR}, ${accG}, ${accB}, 0.02) 100%)`;
    vars['--glass-dropdown-item-active-border'] = `rgba(${dRimR}, ${dRimG}, ${dRimB}, ${Math.min(0.28, topBorderAlpha * 0.54).toFixed(3)})`;
    vars['--glass-backdrop-dim'] = `rgba(0, 0, 0, 0.22)`;
    vars['--glass-card-banner-bg'] = `transparent`;
    vars['--glass-card-icon-bg'] = `rgba(${nestedTintR}, ${nestedTintG}, ${nestedTintB}, ${Math.max(0.04, Math.min(0.14, nestedSurfaceAlpha * 1.25)).toFixed(3)})`;
    vars['--glass-card-icon-border'] = `rgba(${dRimR}, ${dRimG}, ${dRimB}, ${Math.max(0.16, Math.min(0.28, borderOpacity * 1.05)).toFixed(3)})`;
    vars['--glass-card-icon-shadow'] = `0 8px 20px -4px rgba(0, 0, 0, ${(outerShadowAmbient * 0.95).toFixed(3)}), inset 0 1.5px 0.5px 0 rgba(${dRimR}, ${dRimG}, ${dRimB}, ${specTop.toFixed(3)}), inset 1.5px 0 0.5px 0 rgba(${dRimR}, ${dRimG}, ${dRimB}, ${specLeft.toFixed(3)}), inset 0 -1px 1.5px 0 rgba(0, 0, 0, 0.32)`;
    const navDarkR = Math.round(baseR * 0.84 + accR * 0.16);
    const navDarkG = Math.round(baseG * 0.84 + accG * 0.16);
    const navDarkB = Math.round(baseB * 0.84 + accB * 0.16);
    vars['--glass-nav-active-bg'] = `rgba(${navDarkR}, ${navDarkG}, ${navDarkB}, ${Math.max(0.055, Math.min(0.15, 0.035 + darkPanelAlpha * 0.24)).toFixed(3)})`;
    vars['--glass-nav-active-sheen'] = `linear-gradient(135deg, rgba(${dRimR}, ${dRimG}, ${dRimB}, ${(sheenTop * 0.72).toFixed(3)}) 0%, rgba(${dRimR}, ${dRimG}, ${dRimB}, ${(sheenMid * 0.45).toFixed(3)}) 52%, rgba(${accR}, ${accG}, ${accB}, ${(sheenBottom * 0.55).toFixed(3)}) 100%)`;
    vars['--glass-nav-active-border-top'] = `rgba(${dRimR}, ${dRimG}, ${dRimB}, ${Math.min(0.28, topBorderAlpha * 0.54).toFixed(3)})`;
    vars['--glass-nav-active-border-left'] = `rgba(${dRimR}, ${dRimG}, ${dRimB}, ${Math.min(0.20, leftBorderAlpha * 0.48).toFixed(3)})`;
    vars['--glass-nav-active-border-right'] = `rgba(${dRimR}, ${dRimG}, ${dRimB}, ${Math.min(0.08, rightBorderAlpha * 0.44).toFixed(3)})`;
    vars['--glass-nav-active-border-bottom'] = `rgba(${dRimR}, ${dRimG}, ${dRimB}, ${Math.min(0.11, bottomBorderAlpha * 0.46).toFixed(3)})`;
    vars['--glass-nav-active-shadow'] = `0 8px 20px -4px rgba(0, 0, 0, ${(outerShadowAmbient * 0.90).toFixed(3)}), inset 0 1.5px 0.5px 0 rgba(${dRimR}, ${dRimG}, ${dRimB}, ${specTop.toFixed(3)}), inset 1.5px 0 0.5px 0 rgba(${dRimR}, ${dRimG}, ${dRimB}, ${specLeft.toFixed(3)})`;
  }

  return vars;
}

const GLASS_OPTICS_REV = "rev_50";

export function applyThemeCssVarsToRoot(themeObj: any): 'light' | 'dark' {
  if (!themeObj || typeof document === 'undefined') return 'dark';
  const root = document.documentElement;
  Object.entries(themeObj).forEach(([key, val]) => {
    if (key !== 'name' && val !== undefined && val !== null) {
      let finalVal = String(val);
      if (key === 'glassOpacity' && finalVal.endsWith('%')) {
        finalVal = (parseFloat(finalVal) / 100).toString();
      }
      if (key !== 'bgGradient') {
        if (key === 'glassOpacity') {
          const parsedVal = parseFloat(finalVal);
          if (!String(finalVal).endsWith('%') && parsedVal <= 1.0) {
            finalVal = `${parsedVal * 100}%`;
          }
          root.style.setProperty(`--glassOpacityPercent`, finalVal);
          root.style.setProperty(`--${key}`, finalVal);
        } else {
          root.style.setProperty(`--${key}`, finalVal);
        }
      }
    }
  });

  const opticalVars = computeGlassOpticalVars(themeObj);
  Object.entries(opticalVars).forEach(([k, v]) => {
    root.style.setProperty(k, v);
  });
  const resolvedTextCase = themeObj.textCase || 'capitalize';
  root.style.setProperty('--textCase', resolvedTextCase);
  root.setAttribute('data-text-case', resolvedTextCase);

  const canUsePassthrough =
    isDesktop() ||
    (typeof window !== 'undefined' && window.location.search.includes('lab_overlay=1'));
  const isTransparentPassthrough =
    canUsePassthrough &&
    !themeObj.bgImage &&
    (themeObj.bg === 'transparent' || Boolean(themeObj.transparentWindow));
  const fallbackThemeColor =
    themeObj.bg && themeObj.bg !== '#000000' && themeObj.bg !== 'transparent'
      ? themeObj.bg
      : themeObj.panelTint && themeObj.panelTint !== '#000000' && themeObj.panelTint !== 'transparent'
        ? themeObj.panelTint
        : themeObj.sidebar && themeObj.sidebar !== '#000000' && themeObj.sidebar !== 'transparent'
          ? themeObj.sidebar
          : '#040812';
  const safeBg = isTransparentPassthrough ? 'transparent' : fallbackThemeColor;
  root.style.setProperty('--bg', safeBg);
  root.style.backgroundColor = (themeObj.bgImage && !isDesktop()) ? 'transparent' : safeBg;
  const bootBgImg = themeObj.bgImage ? `url("${themeObj.bgImage}")` : 'none';
  root.style.setProperty('--boot-bg-image', bootBgImg);
  root.style.backgroundImage = bootBgImg;

  if (themeObj.bgImage) {
    root.style.setProperty('--bgGradient', `url("${themeObj.bgImage}")`);
  } else if (themeObj.bgGradient && themeObj.bgGradient !== 'transparent' && themeObj.bgGradient !== 'none' && themeObj.bgGradient !== themeObj.bg) {
    root.style.setProperty('--bgGradient', themeObj.bgGradient);
  } else {
    root.style.setProperty('--bgGradient', 'none');
  }

  const [bgR, bgG, bgB] = (opticalVars['--bg-rgb'] || '10, 13, 20')
    .split(',')
    .map((s) => parseInt(s.trim(), 10));
  const yiq = (bgR * 299 + bgG * 587 + bgB * 114) / 1000;
  const colorScheme: 'light' | 'dark' = yiq >= 128 ? 'light' : 'dark';
  root.style.colorScheme = colorScheme;
  if (document.body) {
    document.body.style.backgroundColor = themeObj.bgImage ? 'transparent' : safeBg;
    document.body.style.colorScheme = colorScheme;
  }
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeObj.bgImage && !isDesktop()) {
    if (themeColorMeta) {
      themeColorMeta.remove();
    }
  } else if (themeColorMeta) {
    themeColorMeta.setAttribute('content', fallbackThemeColor);
  }
  const colorSchemeMeta = document.querySelector('meta[name="color-scheme"]');
  if (colorSchemeMeta) {
    colorSchemeMeta.setAttribute('content', colorScheme);
  }
  const rootMount = document.getElementById('root');
  if (rootMount) {
    rootMount.style.backgroundColor = 'transparent';
  }
  return colorScheme;
}

const ThemeContext = createContext<any>(null);

async function resolveVaultThemeRoots(): Promise<{ masterVault: string; spokeVault: string }> {
  const [globalConfig, coords]: [any, any] = await Promise.all([
    invoke('get_global_config').catch(() => null),
    invoke('get_saved_coordinates').catch(() => null),
  ]);
  const spokeVault = String(coords?.vault_path || '').trim().replace(/[\\/]+$/, '');
  let masterVault = String(globalConfig?.vault_path || '').trim().replace(/[\\/]+$/, '');
  if (!masterVault && spokeVault) {
    const lastSep = Math.max(spokeVault.lastIndexOf('\\'), spokeVault.lastIndexOf('/'));
    masterVault = lastSep > 0 ? spokeVault.slice(0, lastSep) : spokeVault;
  }
  return { masterVault: masterVault || spokeVault, spokeVault };
}

function readSharedThemeMap(wsId: string, suffix: 'custom_themes' | 'dev_themes'): Record<string, any> {
  try {
    const globalRaw = JSON.parse(localStorage.getItem(`sanctuary_global_${suffix}`) || '{}');
    const wsRaw = JSON.parse(localStorage.getItem(`sanctuary_${wsId}_${suffix}`) || '{}');
    return { ...(typeof wsRaw === 'object' && wsRaw ? wsRaw : {}), ...(typeof globalRaw === 'object' && globalRaw ? globalRaw : {}) };
  } catch {
    return {};
  }
}

function writeSharedThemeMap(wsId: string, suffix: 'custom_themes' | 'dev_themes', map: Record<string, any>) {
  try {
    const serialized = JSON.stringify(map || {});
    localStorage.setItem(`sanctuary_global_${suffix}`, serialized);
    localStorage.setItem(`sanctuary_${wsId}_${suffix}`, serialized);
  } catch {}
}

export const ThemeProvider = ({ children }: any) => {
  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);
  const workspaces = useStore((state) => state.workspaces) || [];
  const isWebHubRoot = !isDesktop() && isRootDomain();
  const wsId = isWebHubRoot
    ? 'default_workspace'
    : (activeWorkspaceId || localStorage.getItem('sanctuary_last_active_workspace') || 'default');

  const [useGlobalThemeState, setUseGlobalThemeState] = useState(() => localStorage.getItem('sanctuary_use_global_theme') === 'true');
  const [CORE_THEMES, setCoreThemes] = useState<any>(DEFAULT_CORE_THEMES);
  const [gameThemes, setGameThemes] = useState<any>({});
  const [customThemes, setCustomThemes] = useState(() => readSharedThemeMap(wsId, 'custom_themes'));
  const [devThemes, setDevThemes] = useState(() => readSharedThemeMap(wsId, 'dev_themes'));
  const [activeThemeIdState, setActiveThemeIdState] = useState(() => {
    if (localStorage.getItem('sanctuary_use_global_theme') === 'true') {
      return localStorage.getItem('sanctuary_global_theme') || "architect";
    }
    return localStorage.getItem(`sanctuary_${wsId}_active_theme`) || "architect";
  });

  const setUseGlobalTheme = (val: boolean) => {
    setUseGlobalThemeState(val);
    localStorage.setItem('sanctuary_use_global_theme', String(val));
    if (val) {
      setActiveThemeIdState(localStorage.getItem('sanctuary_global_theme') || "architect");
    } else {
      setActiveThemeIdState(localStorage.getItem(`sanctuary_${wsId}_active_theme`) || "architect");
    }
  };

  const setActiveThemeId = (id: string) => {
    setActiveThemeIdState(id);
    if (useGlobalThemeState) {
      localStorage.setItem('sanctuary_global_theme', id);
    } else {
      localStorage.setItem(`sanctuary_${wsId}_active_theme`, id);
    }
  };

  useEffect(() => {
    setCustomThemes(readSharedThemeMap(wsId, 'custom_themes'));
    setDevThemes(readSharedThemeMap(wsId, 'dev_themes'));
    if (!useGlobalThemeState) {
      setActiveThemeIdState(localStorage.getItem(`sanctuary_${wsId}_active_theme`) || "architect");
    }
  }, [wsId, useGlobalThemeState]);

  useEffect(() => {
    const fetchCoreThemes = async () => {
      try {
        const { data, error } = await supabase.from('sanctuary_themes').select('*');
        if (error) throw error;
        if (data && data.length > 0) {
          const fetchedThemes: any = { ...DEFAULT_CORE_THEMES };
          data.forEach((row: any) => {
            // ONLY load from cloud if it's NOT a built-in core theme.
            // This protects the premium local aesthetic from being ruined by old database strings.
            if (!DEFAULT_CORE_THEMES[row.id]) {
              fetchedThemes[row.id] = { ...row.theme_data, id: row.id, name: row.name, badgeKey: "badge_community_defaults" };
            }
          });
          setCoreThemes(fetchedThemes);
        }
      } catch (err) {
        console.error("Failed to fetch cloud themes", err);
      }
    };
    fetchCoreThemes();
  }, []);

  useEffect(() => {
    const isValidHttpUrl = (raw?: string) => {
      if (!raw || typeof raw !== "string") return false;
      const trimmed = raw.trim();
      if (!/^https?:\/\//i.test(trimmed)) return false;
      try {
        const u = new URL(trimmed);
        return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.includes(".");
      } catch {
        return false;
      }
    };

    const getReadOnlyThemeClient = (url: string, anonKey: string, keySuffix: string) => {
      const cleanUrl = url.trim().replace(/\/+$/, "");
      const w = window as any;
      if (!w.__sanctuaryThemeClients) w.__sanctuaryThemeClients = new Map();
      const cacheKey = `${cleanUrl}::${anonKey.slice(0, 16)}`;
      if (w.__sanctuaryThemeClients.has(cacheKey)) {
        return w.__sanctuaryThemeClients.get(cacheKey);
      }
      const client = createClient(cleanUrl, anonKey.trim(), {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storageKey: `sb-theme-ro-${keySuffix}`,
        },
      });
      w.__sanctuaryThemeClients.set(cacheKey, client);
      return client;
    };

    const fetchGameThemes = async () => {
      try {
        const fetchedGameThemes: Record<string, any> = {};
        const queriedUrls = new Set<string>();

        // 1. Fetch Community Defaults from public Spoke databases
        try {
          const { data: publicGames } = await supabase.from('sanctuary_games').select('id, name, schema_id, supabase_url, supabase_anon_key, icon, is_active').eq('is_active', true);
          if (publicGames) {
            for (const game of publicGames) {
              if (!isValidHttpUrl(game.supabase_url) || !game.supabase_anon_key) continue;
              const cleanUrl = game.supabase_url.trim().replace(/\/+$/, "");
              if (queriedUrls.has(cleanUrl)) continue;
              queriedUrls.add(cleanUrl);
              try {
                const client = getReadOnlyThemeClient(cleanUrl, game.supabase_anon_key, String(game.id || game.name || "game"));
                const { data } = await client.from('sanctuary_themes').select('*');
                if (data && data.length > 0) {
                  data.forEach((row: any) => {
                    if (row.id === 'theme_1788994757269') return; // Handled by built-in sims4_dark ("Plumbob Nocturne")
                    if (!DEFAULT_CORE_THEMES[row.id]) {
                      fetchedGameThemes[row.id] = { ...row.theme_data, id: row.id, name: row.name, badge: game.name || "Community" };
                    }
                  });
                }
              } catch (err) {
                console.warn(`Failed to fetch community themes for ${game.name}`, err);
              }
            }
          }
        } catch (err) {
          console.warn('Failed to fetch public game databases', err);
        }

        // 2. Fetch from Workspaces (User specific overrides)
        for (const ws of workspaces) {
          if (ws.id === 'default_workspace' || !isValidHttpUrl(ws.supabase_url) || !ws.supabase_anon_key) continue;
          const cleanUrl = ws.supabase_url.trim().replace(/\/+$/, "");
          if (queriedUrls.has(cleanUrl)) continue;
          queriedUrls.add(cleanUrl);
          
          try {
            const client = getReadOnlyThemeClient(cleanUrl, ws.supabase_anon_key, String(ws.id || "ws"));
            const { data, error } = await client.from('sanctuary_themes').select('*');
            
            if (!error && data && data.length > 0) {
              data.forEach((row: any) => {
                if (row.id === 'theme_1788994757269') return; // Handled by built-in sims4_dark ("Plumbob Nocturne")
                if (!DEFAULT_CORE_THEMES[row.id]) {
                  fetchedGameThemes[row.id] = { ...row.theme_data, id: row.id, name: row.name, badge: ws.name || ws.display_name || "Community" };
                }
              });
            }
          } catch (err) {
            console.warn(`Failed to fetch themes from workspace ${ws.id}`, err);
          }
        }
        
        setGameThemes(fetchedGameThemes);
      } catch (err) {
        console.error("Failed to fetch game themes", err);
        setGameThemes({});
      }
    };
    fetchGameThemes();
  }, [wsId, workspaces]);

  const mergedCoreThemes = useMemo(() => ({ ...CORE_THEMES, ...DEFAULT_CORE_THEMES }), [CORE_THEMES]);
  const allThemes = useMemo(
    () => ({ ...mergedCoreThemes, ...gameThemes, ...devThemes, ...customThemes }),
    [mergedCoreThemes, gameThemes, devThemes, customThemes]
  );
  const resolvedThemeId = activeThemeIdState === 'theme_1788994757269' ? 'sims4_dark' : activeThemeIdState;
  const currentThemeRaw = allThemes[resolvedThemeId] || DEFAULT_CORE_THEMES.architect;

  const sanitizeSemanticChannel = (key: 'success' | 'warning' | 'danger', hex: string) => {
    const defaults = { success: '#10b981', warning: '#f59e0b', danger: '#ef4444' };
    if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return defaults[key];
    const [r, g, b] = parseHexToRgb(hex, [0, 0, 0]);
    if (key === 'success') {
      return g > r * 1.15 && g >= b * 0.9 && g >= 80 ? hex : defaults.success;
    }
    if (key === 'warning') {
      return r >= 160 && g >= 80 && r >= g * 0.9 && b < g * 0.75 ? hex : defaults.warning;
    }
    if (key === 'danger') {
      return r >= 150 && r > g * 1.35 && g < 180 ? hex : defaults.danger;
    }
    return defaults[key];
  };

  const currentTheme = useMemo(
    () => ({
      ...currentThemeRaw,
      success: sanitizeSemanticChannel('success', currentThemeRaw.success),
      warning: sanitizeSemanticChannel('warning', currentThemeRaw.warning),
      danger: sanitizeSemanticChannel('danger', currentThemeRaw.danger),
      textCase: currentThemeRaw.textCase || 'capitalize',
    }),
    [currentThemeRaw]
  );

  // Migrate stale auto-forked custom themes that were created from the old navy #091326 / #081121 defaults
  useEffect(() => {
    const legacyTints = new Set([
      '#091326', '#081121', '#1a0628', '#151126', '#0e1116', '#211d1a', '#061524', '#081020',
      '#050914', '#05160e', '#060e1e', '#050d08', '#120622', '#161224', '#040812',
    ]);
    let hasChanges = false;
    const nextCustoms: Record<string, any> = { ...customThemes };

    Object.entries(nextCustoms).forEach(([id, th]: [string, any]) => {
      if (!th || typeof th !== 'object') return;
      const tint = String(th.panelTint || '').toLowerCase();
      const cleanSuccess = sanitizeSemanticChannel('success', th.success);
      const cleanWarning = sanitizeSemanticChannel('warning', th.warning);
      const cleanDanger = sanitizeSemanticChannel('danger', th.danger);
      const hasSemanticDrift =
        (th.success && th.success !== cleanSuccess) ||
        (th.warning && th.warning !== cleanWarning) ||
        (th.danger && th.danger !== cleanDanger);

      if (id.startsWith('custom_true_glass_') && th.bgImage === '/themes/architect.png' && th.bg === '#000000') {
        nextCustoms[id] = {
          ...th,
          bg: 'transparent',
          sidebar: '#050b16',
          panelTint: '#081224',
          bgImage: '',
          bgGradient: 'transparent',
          transparentWindow: true,
          success: cleanSuccess,
          warning: cleanWarning,
          danger: cleanDanger,
        };
        hasChanges = true;
      } else if (id.startsWith('custom_') && legacyTints.has(tint)) {
        const baseMatch = id.match(/^custom_([a-z0-9]+)_/i);
        const baseId = baseMatch ? baseMatch[1] : 'architect';
        const baseCore = DEFAULT_CORE_THEMES[baseId] || DEFAULT_CORE_THEMES.architect;
        nextCustoms[id] = {
          ...th,
          bg: baseCore.bg,
          sidebar: baseCore.sidebar,
          panelTint: baseCore.panelTint,
          glassOpacity: baseCore.glassOpacity,
          glassBlur: baseCore.glassBlur,
          glassSaturation: baseCore.glassSaturation,
          glassBorderOpacity: baseCore.glassBorderOpacity,
          glassSpecular: baseCore.glassSpecular,
          glassShadow: baseCore.glassShadow,
          success: cleanSuccess,
          warning: cleanWarning,
          danger: cleanDanger,
        };
        hasChanges = true;
      } else if (hasSemanticDrift) {
        nextCustoms[id] = {
          ...th,
          success: cleanSuccess,
          warning: cleanWarning,
          danger: cleanDanger,
        };
        hasChanges = true;
      }
    });

    if (hasChanges) {
      setCustomThemes(nextCustoms);
      writeSharedThemeMap(wsId, 'custom_themes', nextCustoms);
      Object.entries(nextCustoms).forEach(([id, th]) => {
        saveThemeToVault(id, th, false);
      });
    }
  }, [wsId, customThemes]);

  useEffect(() => {
    const scanVault = async () => {
      try {
        if (!isDesktop()) return;
        const { masterVault, spokeVault } = await resolveVaultThemeRoots();
        if (!masterVault) return;

        const themesDir = `${masterVault}\\Data\\Themes`;
        const devThemesDir = `${masterVault}\\Data\\Dev\\Themes`;
        const legacySpokeThemesDir =
          spokeVault && spokeVault.toLowerCase() !== masterVault.toLowerCase()
            ? `${spokeVault}\\Data\\Themes`
            : '';
        const legacySpokeDevThemesDir =
          spokeVault && spokeVault.toLowerCase() !== masterVault.toLowerCase()
            ? `${spokeVault}\\Data\\Dev\\Themes`
            : '';

        let updatedCustoms = { ...customThemes };
        let updatedDevs = { ...devThemes };
        let hasCustomUpdates = false;
        let hasDevUpdates = false;

        const resolveCompanionWallpaper = async (dirPath: string, parsedTheme: any) => {
          if (!parsedTheme || typeof parsedTheme !== 'object') return parsedTheme;
          const rawBgImg = typeof parsedTheme.bgImage === 'string' ? parsedTheme.bgImage.trim() : '';
          const companionFile =
            typeof parsedTheme.bgImageFile === 'string' && parsedTheme.bgImageFile.trim()
              ? parsedTheme.bgImageFile.trim()
              : rawBgImg &&
                  !rawBgImg.startsWith('data:') &&
                  !rawBgImg.startsWith('http://') &&
                  !rawBgImg.startsWith('https://') &&
                  !rawBgImg.startsWith('blob:') &&
                  !rawBgImg.startsWith('/themes/') &&
                  !rawBgImg.includes('/') &&
                  !rawBgImg.includes('\\')
                ? rawBgImg
                : '';

          if (companionFile && (!rawBgImg.startsWith('data:') && !rawBgImg.startsWith('http'))) {
            const candidatePath = `${dirPath}\\${companionFile}`;
            if (await exists(candidatePath)) {
              try {
                const rawBytes = await readFile(candidatePath);
                const bytes = rawBytes instanceof Uint8Array ? rawBytes : new Uint8Array(rawBytes);
                let binary = '';
                const chunkSize = 0x8000;
                for (let i = 0; i < bytes.length; i += chunkSize) {
                  binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
                }
                const ext = companionFile.split('.').pop()?.toLowerCase() || 'webp';
                const mime = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/webp';
                parsedTheme.bgImage = `data:${mime};base64,${btoa(binary)}`;
              } catch {
                // ignore companion read error
              }
            }
          }
          return parsedTheme;
        };

        for (const candidateDir of [themesDir, legacySpokeThemesDir].filter(Boolean)) {
          if (await exists(candidateDir)) {
            const entries = await readDir(candidateDir);
            for (const entry of entries) {
              if (entry.name && entry.name.endsWith('.json')) {
                const themeId = entry.name.replace('.json', '');
                if (!updatedCustoms[themeId] && !CORE_THEMES[themeId]) {
                  const content = await readTextFile(`${candidateDir}\\${entry.name}`);
                  const resolved = await resolveCompanionWallpaper(candidateDir, JSON.parse(content));
                  updatedCustoms[themeId] = resolved;
                  hasCustomUpdates = true;
                  if (candidateDir !== themesDir) {
                    await mkdir(themesDir, { recursive: true }).catch(() => {});
                    await writeTextFile(`${themesDir}\\${entry.name}`, JSON.stringify(resolved, null, 2)).catch(() => {});
                  }
                }
              }
            }
          }
        }

        for (const candidateDevDir of [devThemesDir, legacySpokeDevThemesDir].filter(Boolean)) {
          if (await exists(candidateDevDir)) {
            const entries = await readDir(candidateDevDir);
            for (const entry of entries) {
              if (entry.name && entry.name.endsWith('.json')) {
                const themeId = entry.name.replace('.json', '');
                if (!updatedDevs[themeId]) {
                  const content = await readTextFile(`${candidateDevDir}\\${entry.name}`);
                  const resolved = await resolveCompanionWallpaper(candidateDevDir, JSON.parse(content));
                  updatedDevs[themeId] = resolved;
                  hasDevUpdates = true;
                  if (candidateDevDir !== devThemesDir) {
                    await mkdir(devThemesDir, { recursive: true }).catch(() => {});
                    await writeTextFile(`${devThemesDir}\\${entry.name}`, JSON.stringify(resolved, null, 2)).catch(() => {});
                  }
                }
              }
            }
          }
        }

        if (hasCustomUpdates) {
          setCustomThemes(updatedCustoms);
          writeSharedThemeMap(wsId, 'custom_themes', updatedCustoms);
        }
        if (hasDevUpdates) {
          setDevThemes(updatedDevs);
          writeSharedThemeMap(wsId, 'dev_themes', updatedDevs);
        }
      } catch (err) {
        console.error("Failed to scan vault themes:", err);
      }
    };
    scanVault();
  }, [wsId]);

  useEffect(() => {
    if (customThemes["Radiant"]) {
      const { Radiant, ...rest } = customThemes;
      setCustomThemes(rest);
      writeSharedThemeMap(wsId, 'custom_themes', rest);
      if (activeThemeIdState === "Radiant") setActiveThemeId("radiant");
    } else if (activeThemeIdState === "Radiant") {
      setActiveThemeId("radiant");
    }
  }, [customThemes, activeThemeIdState, wsId]);

  useLayoutEffect(() => {
    const colorScheme = applyThemeCssVarsToRoot(currentTheme);
    (window as any).__sanctuaryRenderWebGLGlass?.(true);

    if (isDesktop()) {
      import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
        getCurrentWindow().setTheme(colorScheme).catch(() => { });
      }).catch(() => { });
    }
  }, [activeThemeIdState, currentTheme, GLASS_OPTICS_REV]);

  const saveThemeToVault = (id: string, json: any, isDev: boolean = false) => {
    (async () => {
      try {
        if (!isDesktop()) return;
        const { masterVault } = await resolveVaultThemeRoots();
        if (masterVault) {
          const dir = isDev ? `${masterVault}\\Data\\Dev\\Themes` : `${masterVault}\\Data\\Themes`;
          await mkdir(dir, { recursive: true });
          await writeTextFile(`${dir}\\${id}.json`, JSON.stringify(json, null, 2));
        }
      } catch (err) { console.error("Failed to save theme to vault:", err); }
    })();
  };


  const updateTheme = (id: string, updates: any) => {
    if (id?.startsWith('dev_')) {
      const currentTheme = devThemes[id];
      if (!currentTheme) return;
      const updatedTheme = { ...currentTheme, ...updates };
      const updated = { ...devThemes, [id]: updatedTheme };
      setDevThemes(updated);
      writeSharedThemeMap(wsId, 'dev_themes', updated);
      saveThemeToVault(id, updatedTheme, true);
    } else if (CORE_THEMES[id]) {
      const currentTheme = CORE_THEMES[id];
      const newId = `custom_${id}_${Date.now()}`;
      const newTheme = { ...currentTheme, ...updates, name: `${currentTheme.name} (Edited)` };
      const newCustoms = { ...customThemes, [newId]: newTheme };
      setCustomThemes(newCustoms);
      setActiveThemeId(newId);
      writeSharedThemeMap(wsId, 'custom_themes', newCustoms);
      saveThemeToVault(newId, newTheme, false);
    } else {
      const baseTheme = customThemes[id] || allThemes[id] || currentTheme;
      if (!baseTheme) return;
      const updatedTheme = { ...baseTheme, ...updates };
      const updated = { ...customThemes, [id]: updatedTheme };
      setCustomThemes(updated);
      writeSharedThemeMap(wsId, 'custom_themes', updated);
      saveThemeToVault(id, updatedTheme, false);
    }
  };

  const updateActiveTheme = (updates: any) => {
    if (activeThemeIdState?.startsWith('dev_')) {
      const updatedTheme = { ...currentTheme, ...updates };
      const updated = { ...devThemes, [activeThemeIdState]: updatedTheme };
      setDevThemes(updated);
      writeSharedThemeMap(wsId, 'dev_themes', updated);
      saveThemeToVault(activeThemeIdState, updatedTheme, true);
    } else if (CORE_THEMES[activeThemeIdState]) {
      const newId = `custom_${activeThemeIdState}_${Date.now()}`;
      const newTheme = { ...currentTheme, ...updates, name: `${currentTheme.name} (Edited)` };
      const newCustoms = { ...customThemes, [newId]: newTheme };
      setCustomThemes(newCustoms);
      setActiveThemeId(newId);
      writeSharedThemeMap(wsId, 'custom_themes', newCustoms);
      saveThemeToVault(newId, newTheme, false);
    } else {
      const updatedTheme = { ...currentTheme, ...updates };
      const updated = { ...customThemes, [activeThemeIdState]: updatedTheme };
      setCustomThemes(updated);
      writeSharedThemeMap(wsId, 'custom_themes', updated);
      saveThemeToVault(activeThemeIdState, updatedTheme, false);
    }
  };

  const createNewTheme = () => {
    const id = `signature_${Date.now()}`;
    const newTheme = {
      ...DEFAULT_CORE_THEMES.architect,
      name: "New Signature",
    };
    const updated = { ...customThemes, [id]: newTheme };
    setCustomThemes(updated);
    setActiveThemeId(id);
    writeSharedThemeMap(wsId, 'custom_themes', updated);
    saveThemeToVault(id, newTheme, false);
    return id;
  };

  const createNewDevTheme = (baseTheme: any = null) => {
    const id = `dev_${Date.now()}`;
    const newTheme = baseTheme
      ? { ...baseTheme, name: `${baseTheme.name} (Copy)` }
      : {
          ...DEFAULT_CORE_THEMES.architect,
          name: "New Signature",
        };
    const updated = { ...devThemes, [id]: newTheme };
    setDevThemes(updated);
    writeSharedThemeMap(wsId, 'dev_themes', updated);
    saveThemeToVault(id, newTheme, true);
    return id;
  };

  const exportDevThemeToCustom = (id: string) => {
    if (!id?.startsWith('dev_')) return;
    const themeToCopy = devThemes[id];
    if (!themeToCopy) return;

    const newId = `custom_${Date.now()}`;
    const newTheme = { ...themeToCopy, name: themeToCopy.name };
    const updatedCustoms = { ...customThemes, [newId]: newTheme };
    setCustomThemes(updatedCustoms);
    writeSharedThemeMap(wsId, 'custom_themes', updatedCustoms);
    saveThemeToVault(newId, newTheme, false);
  };

  const deleteTheme = (id: string) => {
    if (CORE_THEMES[id]) return;
    const isDev = id.startsWith('dev_');
    if (!isDev) {
      const { [id]: _, ...rest } = customThemes;
      setCustomThemes(rest);
      writeSharedThemeMap(wsId, 'custom_themes', rest);
      if (activeThemeIdState === id) setActiveThemeId('architect');
    } else if (id.startsWith('dev_')) {
      const { [id]: _, ...rest } = devThemes;
      setDevThemes(rest);
      writeSharedThemeMap(wsId, 'dev_themes', rest);
      if (activeThemeIdState === id) setActiveThemeId('architect');
    }

    (async () => {
      try {
        if (!isDesktop()) return;
        const { masterVault, spokeVault } = await resolveVaultThemeRoots();
        for (const base of [masterVault, spokeVault].filter(Boolean)) {
          const dir = isDev ? `${base}\\Data\\Dev\\Themes` : `${base}\\Data\\Themes`;
          const filePath = `${dir}\\${id}.json`;
          if (await exists(filePath)) await remove(filePath);
        }
      } catch (err) { console.error("Failed to delete theme from vault:", err); }
    })();
  };

  const renameTheme = (id: string, newName: string) => {
    if (CORE_THEMES[id]) {
      const baseTheme = CORE_THEMES[id];
      const newId = `custom_${id}_${Date.now()}`;
      const forkedTheme = { ...baseTheme, name: newName };
      const updated = { ...customThemes, [newId]: forkedTheme };
      setCustomThemes(updated);
      setActiveThemeId(newId);
      writeSharedThemeMap(wsId, 'custom_themes', updated);
      saveThemeToVault(newId, forkedTheme, false);
      return;
    }
    const isDev = id.startsWith('dev_');
    if (isDev) {
      if (!devThemes[id]) return;
      const updatedTheme = { ...devThemes[id], name: newName };
      const updated = { ...devThemes, [id]: updatedTheme };
      setDevThemes(updated);
      writeSharedThemeMap(wsId, 'dev_themes', updated);
      saveThemeToVault(id, updatedTheme, true);
    } else {
      if (!customThemes[id]) return;
      const updatedTheme = { ...customThemes[id], name: newName };
      const updated = { ...customThemes, [id]: updatedTheme };
      setCustomThemes(updated);
      writeSharedThemeMap(wsId, 'custom_themes', updated);
      saveThemeToVault(id, updatedTheme, false);
    }
  };

  return (
    <ThemeContext.Provider value={{
      activeThemeId: activeThemeIdState, setActiveThemeId, currentTheme, CORE_THEMES: mergedCoreThemes, setCoreThemes, customThemes, devThemes, gameThemes,
      updateActiveTheme, updateTheme, renameTheme, createNewTheme, createNewDevTheme, exportDevThemeToCustom, deleteTheme,
      useGlobalTheme: useGlobalThemeState, setUseGlobalTheme,
      importTheme: (rawJson: any) => {
        let json = rawJson;
        if (typeof rawJson === 'string') {
          try {
            json = JSON.parse(rawJson);
          } catch {
            return;
          }
        }
        if (!json || typeof json !== 'object') return;
        const id = `import_${Date.now()}`;
        const nextCustoms = { ...customThemes, [id]: json };
        setCustomThemes(nextCustoms);
        localStorage.setItem(`sanctuary_${wsId}_custom_themes`, JSON.stringify(nextCustoms));
        setActiveThemeId(id);
        saveThemeToVault(id, json, false);
      }
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
