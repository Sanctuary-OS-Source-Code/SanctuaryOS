import { createContext, useContext, useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { mkdir, writeTextFile, readDir, readTextFile, remove, exists } from '@tauri-apps/plugin-fs';
import { supabase } from './supabase';
import { createClient } from '@supabase/supabase-js';
import { isDesktop } from './utils/envUtils';

import { useStore } from './store';

export const DEFAULT_CORE_THEMES: any = {
  // Flagship Premium Dark — Smoked Obsidian Liquid Glass
  architect: {
    name: "Architect", bg: "#000000", sidebar: "#000000", sidebartext: "#f8fafc", accent: "#38bdf8",
    text: "#f8fafc", subtext: "#94a3b8", success: "#10b981", warning: "#f59e0b", danger: "#ef4444",
    panelTint: "#050914", headerText: "#ffffff", fontFamily: "Inter, sans-serif", fontSizeBase: "16px",
    glassOpacity: "0.10", glassBlur: "36px", glassSaturation: "185%", glassBorderOpacity: "0.14",
    glassSpecular: "0.24", glassShadow: "0.42", radius: "1.25rem", shadowColor: "rgba(0,0,0,0.45)",
    bgGradient: "transparent",
    bgImage: "/themes/architect.png",
    animated: true, ambientOrb: false, ambientNoise: false,
    volumetricOrbs: [],
    fontSizeHeader: "1.875rem", fontSizeSubheader: "1.5rem", fontSizeTitle: "1.25rem", fontSizeSubtitle: "1.125rem",
    fontSizeText: "1rem", fontSizeSubtext: "0.75rem", fontSizeSidebar: "10px", sidebarWidth: "260px"
  },
  // Flagship Premium Light — Alabaster Crystal Quartz
  radiant: {
    name: "Radiant", bg: "#f1f5f9", sidebar: "#f8fafc", sidebartext: "#0f172a", accent: "#0284c7",
    text: "#0f172a", subtext: "#475569", success: "#059669", warning: "#d97706", danger: "#dc2626",
    panelTint: "#ffffff", headerText: "#0f172a", fontFamily: "Inter, sans-serif", fontSizeBase: "16px",
    glassOpacity: "0.18", glassBlur: "34px", glassSaturation: "185%", glassBorderOpacity: "0.46",
    glassSpecular: "0.52", glassShadow: "0.16", radius: "1.25rem", shadowColor: "rgba(15,23,42,0.08)",
    bgGradient: "transparent",
    bgImage: "/themes/radiant.png",
    animated: true, ambientOrb: false, ambientNoise: false,
    volumetricOrbs: [],
    fontSizeHeader: "1.875rem", fontSizeSubheader: "1.5rem", fontSizeTitle: "1.25rem", fontSizeSubtitle: "1.125rem",
    fontSizeText: "1rem", fontSizeSubtext: "0.75rem", fontSizeSidebar: "10px", sidebarWidth: "260px"
  },
  // Official Partner Community Light Theme — The Sims 4 ("Plumbob Crystal" — Light Mint & Emerald Quartz)
  sims4: {
    name: "Plumbob Crystal", badge: "The Sims 4", bg: "#eefbf5", sidebar: "#f4fdf9", sidebartext: "#064e3b", accent: "#10b981",
    text: "#064e3b", subtext: "#047857", success: "#059669", warning: "#d97706", danger: "#e11d48",
    panelTint: "#ffffff", headerText: "#064e3b", fontFamily: "Inter, sans-serif", fontSizeBase: "16px",
    glassOpacity: "0.18", glassBlur: "32px", glassSaturation: "190%", glassBorderOpacity: "0.48",
    glassSpecular: "0.54", glassShadow: "0.16", radius: "1.5rem", shadowColor: "rgba(6,78,59,0.08)",
    bgGradient: "transparent",
    bgImage: "/themes/sims4.png",
    animated: true, ambientOrb: false, ambientNoise: false,
    volumetricOrbs: [],
    fontSizeHeader: "1.875rem", fontSizeSubheader: "1.5rem", fontSizeTitle: "1.25rem", fontSizeSubtitle: "1.125rem",
    fontSizeText: "1rem", fontSizeSubtext: "0.75rem", fontSizeSidebar: "10px", sidebarWidth: "260px"
  },
  // Official Partner Community Dark Theme — The Sims 4 ("Plumbob Nocturne" — Deep Emerald & Obsidian Crystal)
  sims4_dark: {
    name: "Plumbob Nocturne", badge: "The Sims 4", bg: "#020a06", sidebar: "#030e09", sidebartext: "#ecfdf5", accent: "#22c55e",
    text: "#ecfdf5", subtext: "#6ee7b7", success: "#10b981", warning: "#f59e0b", danger: "#f43f5e",
    panelTint: "#05160e", headerText: "#ecfdf5", fontFamily: "Inter, sans-serif", fontSizeBase: "16px",
    glassOpacity: "0.12", glassBlur: "36px", glassSaturation: "195%", glassBorderOpacity: "0.16",
    glassSpecular: "0.26", glassShadow: "0.44", radius: "1.5rem", shadowColor: "rgba(0,0,0,0.48)",
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
    panelTint: "#060e1e", headerText: "#ffffff", fontFamily: "Inter, sans-serif", fontSizeBase: "16px",
    glassOpacity: "0.10", glassBlur: "36px", glassSaturation: "195%", glassBorderOpacity: "0.14",
    glassSpecular: "0.26", glassShadow: "0.42", radius: "1.5rem", shadowColor: "rgba(0,0,0,0.45)",
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
    text: "#ecfdf5", subtext: "#6ee7b7", success: "#10b981", warning: "#f59e0b", danger: "#f43f5e",
    panelTint: "#050d08", headerText: "#ecfdf5", fontFamily: "'JetBrains Mono', monospace", fontSizeBase: "16px",
    glassOpacity: "0.14", glassBlur: "28px", glassSaturation: "180%", glassBorderOpacity: "0.16",
    glassSpecular: "0.24", glassShadow: "0.48", radius: "0.875rem", shadowColor: "rgba(0,0,0,0.50)",
    bgGradient: "transparent",
    bgImage: "/themes/bunker.png",
    animated: true, ambientOrb: false, ambientNoise: false,
    volumetricOrbs: [],
    fontSizeHeader: "1.875rem", fontSizeSubheader: "1.5rem", fontSizeTitle: "1.25rem", fontSizeSubtitle: "1.125rem",
    fontSizeText: "1rem", fontSizeSubtext: "0.75rem", fontSizeSidebar: "10px", sidebarWidth: "260px"
  },
  // Cyberpunk Neon Outrun
  synthwave: {
    name: "Miami Vice", bg: "#090214", sidebar: "#090214", sidebartext: "#fdf2f8", accent: "#f43f5e",
    text: "#fdf2f8", subtext: "#d8b4e2", success: "#10b981", warning: "#facc15", danger: "#fb7185",
    panelTint: "#120622", headerText: "#ffffff", fontFamily: "Inter, sans-serif", fontSizeBase: "16px",
    glassOpacity: "0.12", glassBlur: "34px", glassSaturation: "205%", glassBorderOpacity: "0.16",
    glassSpecular: "0.28", glassShadow: "0.46", radius: "1.25rem", shadowColor: "rgba(0,0,0,0.48)",
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
    panelTint: "#161224", headerText: "#f8f8f2", fontFamily: "Inter, sans-serif", fontSizeBase: "16px",
    glassOpacity: "0.12", glassBlur: "34px", glassSaturation: "190%", glassBorderOpacity: "0.16",
    glassSpecular: "0.26", glassShadow: "0.46", radius: "1.25rem", shadowColor: "rgba(0,0,0,0.48)",
    bgGradient: "transparent",
    bgImage: "/themes/dracula.png",
    animated: true, ambientOrb: false, ambientNoise: false,
    volumetricOrbs: [],
    fontSizeHeader: "1.875rem", fontSizeSubheader: "1.5rem", fontSizeTitle: "1.25rem", fontSizeSubtitle: "1.125rem",
    fontSizeText: "1rem", fontSizeSubtext: "0.75rem", fontSizeSidebar: "10px", sidebarWidth: "260px"
  },
  // Pure Window-Pane Optical Crystal
  true_glass: {
    name: "True Glass", bg: "#000000", sidebar: "#000000", sidebartext: "#f8fafc", accent: "#38bdf8",
    text: "#ffffff", subtext: "#cbd5e1", success: "#34d399", warning: "#fbbf24", danger: "#f87171",
    panelTint: "#040812", headerText: "#ffffff", fontFamily: "Inter, sans-serif", fontSizeBase: "16px",
    glassOpacity: "0.06", glassBlur: "40px", glassSaturation: "200%", glassBorderOpacity: "0.20",
    glassSpecular: "0.32", glassShadow: "0.38", radius: "1.5rem", shadowColor: "rgba(0,0,0,0.36)",
    bgGradient: "transparent",
    bgImage: "/themes/architect.png",
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
    // Clear, glossy water-droplet quartz with curved 3D meniscus cushion
    const lightPanelAlpha = Math.max(0.08, Math.min(0.62, rawOpacity * 0.78));
    const lightSurfaceAlpha = Math.max(0.05, Math.min(0.48, lightPanelAlpha * 0.72));
    const lightShadowScale = Math.max(0.06, Math.min(0.24, shadowOpacity * 0.50));
    const lightBorderTop = Math.max(0.55, Math.min(0.96, borderOpacity * 1.75));
    const lightSpecTop = Math.max(0.58, Math.min(0.96, specularOpacity * 1.65));

    vars['--glass-base-fill'] = `rgba(${tr}, ${tg}, ${tb}, ${lightPanelAlpha.toFixed(3)})`;
    vars['--glass-surface-fill'] = `rgba(${tr}, ${tg}, ${tb}, ${lightSurfaceAlpha.toFixed(3)})`;
    vars['--glass-meniscus-top'] = `radial-gradient(125% 90% at 50% -18%, rgba(255, 255, 255, ${(lightSpecTop * 0.62).toFixed(3)}) 0%, rgba(255, 255, 255, ${(lightSpecTop * 0.18).toFixed(3)}) 42%, rgba(255, 255, 255, 0) 68%)`;
    vars['--glass-sheen'] = `linear-gradient(135deg, rgba(255, 255, 255, ${(lightSpecTop * 0.52).toFixed(3)}) 0%, rgba(255, 255, 255, ${(lightSpecTop * 0.16).toFixed(3)}) 26%, rgba(255, 255, 255, 0) 54%, rgba(255, 255, 255, ${(lightSpecTop * 0.24).toFixed(3)}) 100%)`;
    vars['--glass-surface-sheen'] = `linear-gradient(135deg, rgba(255, 255, 255, ${(lightSpecTop * 0.38).toFixed(3)}) 0%, rgba(255, 255, 255, 0.10) 28%, transparent 56%, rgba(255, 255, 255, ${(lightSpecTop * 0.18).toFixed(3)}) 100%)`;
    vars['--glass-fresnel-rim'] = `linear-gradient(135deg, rgba(255, 255, 255, 0.82) 0%, rgba(255, 255, 255, 0.28) 28%, rgba(255, 255, 255, 0.06) 50%, rgba(255, 255, 255, 0.24) 72%, rgba(255, 255, 255, 0.68) 100%)`;

    // Crisp 4-sided wet-quartz rim (delicate hairline so WebGL2 3D meniscus shines through)
    vars['--glass-border-top'] = `rgba(255, 255, 255, ${(lightBorderTop * 0.62).toFixed(3)})`;
    vars['--glass-border-left'] = `rgba(255, 255, 255, ${(lightBorderTop * 0.46).toFixed(3)})`;
    vars['--glass-border-right'] = `rgba(15, 23, 42, 0.08)`;
    vars['--glass-border-bottom'] = `rgba(15, 23, 42, 0.11)`;
    vars['--glass-surface-border'] = `rgba(255, 255, 255, ${(lightBorderTop * 0.38).toFixed(3)})`;

    // Delicate 1px 3D Specular Bevel (Light Theme — No Heavy White Inner Fog)
    vars['--glass-inset-highlight'] = `inset 0 1px 0 0 rgba(255, 255, 255, ${(lightSpecTop * 0.72).toFixed(3)}), inset 1px 0 0 0 rgba(255, 255, 255, ${(lightSpecTop * 0.46).toFixed(3)}), inset 0 -1px 0 0 rgba(15, 23, 42, 0.06), inset -1px 0 0 0 rgba(15, 23, 42, 0.04)`;
    vars['--glass-surface-inset-highlight'] = `inset 0 1px 0 0 rgba(255, 255, 255, ${(lightSpecTop * 0.58).toFixed(3)}), inset 1px 0 0 0 rgba(255, 255, 255, ${(lightSpecTop * 0.36).toFixed(3)})`;

    // Pure soft ambient elevation shadows
    vars['--glass-outer-shadow'] = `0 18px 38px -8px rgba(15, 23, 42, ${(lightShadowScale * 1.35).toFixed(3)}), 0 6px 14px -3px rgba(15, 23, 42, ${(lightShadowScale * 0.75).toFixed(3)})`;
    vars['--glass-surface-outer-shadow'] = `0 6px 14px -3px rgba(15, 23, 42, ${(lightShadowScale * 0.65).toFixed(3)})`;

    // Nested Glass inside SidePanels / Modals
    vars['--glass-nested-panel-bg'] = `rgba(255, 255, 255, 0.34)`;
    vars['--glass-nested-surface-bg'] = `rgba(255, 255, 255, 0.24)`;
    vars['--glass-nested-sheen'] = `linear-gradient(145deg, rgba(255, 255, 255, 0.42) 0%, rgba(255, 255, 255, 0.10) 32%, transparent 60%, rgba(255, 255, 255, 0.18) 100%)`;
    vars['--glass-nested-shadow'] = `0 10px 24px -6px rgba(15, 23, 42, 0.08), 0 3px 8px -2px rgba(15, 23, 42, 0.04)`;

    // Chrome & Containers (Sidebar, SidePanel Drawer, Floating Pills, Card Banner/Icon)
    vars['--glass-sidebar-bg'] = `rgba(${sbR}, ${sbG}, ${sbB}, ${Math.max(0.14, Math.min(0.54, lightPanelAlpha + 0.02)).toFixed(3)})`;
    vars['--glass-sidebar-sheen'] = `linear-gradient(145deg, rgba(255, 255, 255, 0.38) 0%, rgba(255, 255, 255, 0.08) 28%, transparent 58%, rgba(255, 255, 255, 0.14) 100%)`;
    vars['--glass-sidebar-shadow'] = `0 22px 48px -10px rgba(15, 23, 42, 0.14), 0 6px 18px -4px rgba(15, 23, 42, 0.08), inset 0 1px 0 0 rgba(255, 255, 255, 0.68), inset 1px 0 0 0 rgba(255, 255, 255, 0.44)`;
    vars['--glass-drawer-bg'] = `rgba(255, 255, 255, ${Math.max(0.20, Math.min(0.58, lightPanelAlpha + 0.04)).toFixed(3)})`;
    vars['--glass-drawer-sheen'] = `linear-gradient(145deg, rgba(255, 255, 255, 0.36) 0%, rgba(255, 255, 255, 0.06) 28%, transparent 58%, rgba(255, 255, 255, 0.14) 100%)`;
    vars['--glass-drawer-shadow'] = `-20px 0 50px rgba(15, 23, 42, 0.12), 0 20px 50px rgba(15, 23, 42, 0.10)`;
    vars['--glass-portal-bg'] = `rgba(255, 255, 255, ${Math.max(0.22, Math.min(0.62, lightPanelAlpha + 0.06)).toFixed(3)})`;
    vars['--glass-portal-sheen'] = `linear-gradient(145deg, rgba(255, 255, 255, 0.44) 0%, rgba(255, 255, 255, 0.10) 28%, transparent 58%, rgba(255, 255, 255, 0.18) 100%)`;
    vars['--glass-portal-shadow'] = `0 18px 40px -8px rgba(15, 23, 42, 0.15), 0 6px 16px -4px rgba(15, 23, 42, 0.09)`;
    const ddLightR = sbR;
    const ddLightG = sbG;
    const ddLightB = sbB;
    vars['--glass-dropdown-bg'] = `rgba(${ddLightR}, ${ddLightG}, ${ddLightB}, ${Math.max(0.86, Math.min(0.95, 0.82 + rawOpacity * 0.45)).toFixed(3)})`;
    vars['--glass-dropdown-gradient'] = `linear-gradient(145deg, rgba(255, 255, 255, 0.42) 0%, rgba(255, 255, 255, 0.10) 35%, rgba(255, 255, 255, 0) 68%, rgba(255, 255, 255, 0.16) 100%)`;
    vars['--glass-dropdown-border-top'] = `rgba(${txtR}, ${txtG}, ${txtB}, 0.14)`;
    vars['--glass-dropdown-border-left'] = `rgba(${txtR}, ${txtG}, ${txtB}, 0.12)`;
    vars['--glass-dropdown-border-right'] = `rgba(${txtR}, ${txtG}, ${txtB}, 0.10)`;
    vars['--glass-dropdown-border-bottom'] = `rgba(${txtR}, ${txtG}, ${txtB}, 0.12)`;
    vars['--glass-dropdown-shadow'] = `0 20px 44px -8px rgba(15, 23, 42, 0.18), 0 6px 16px -3px rgba(15, 23, 42, 0.10), inset 0 1px 0 0 rgba(255, 255, 255, 0.75)`;
    vars['--glass-dropdown-input-bg'] = `rgba(${txtR}, ${txtG}, ${txtB}, 0.04)`;
    vars['--glass-dropdown-input-border'] = `rgba(${txtR}, ${txtG}, ${txtB}, 0.11)`;
    vars['--glass-dropdown-item-hover'] = `rgba(${txtR}, ${txtG}, ${txtB}, 0.05)`;
    vars['--glass-dropdown-item-active'] = `rgba(${accR}, ${accG}, ${accB}, 0.12)`;
    vars['--glass-dropdown-item-active-border'] = `rgba(${accR}, ${accG}, ${accB}, 0.32)`;
    vars['--glass-backdrop-dim'] = `rgba(15, 23, 42, 0.06)`;
    vars['--glass-card-banner-bg'] = `transparent`;
    vars['--glass-card-icon-bg'] = `rgba(255, 255, 255, 0.30)`;
    vars['--glass-card-icon-border'] = `rgba(255, 255, 255, 0.68)`;
    vars['--glass-card-icon-shadow'] = `0 8px 18px -4px rgba(15, 23, 42, 0.08), inset 0 1.5px 0.5px 0 rgba(255, 255, 255, 0.82), inset 1.5px 0 0.5px 0 rgba(255, 255, 255, 0.48), inset 0 -1.5px 3px 0 rgba(255, 255, 255, 0.32)`;
    vars['--glass-nav-active-bg'] = `rgba(255, 255, 255, 0.34)`;
    vars['--glass-nav-active-shadow'] = `0 6px 14px -2px rgba(15, 23, 42, 0.06), inset 0 1.5px 0.5px 0 rgba(255, 255, 255, 0.78), inset 1.5px 0 0.5px 0 rgba(255, 255, 255, 0.44), inset 0 -1.5px 3px 0 rgba(255, 255, 255, 0.28)`;
  } else {
    // 3D Liquid Glass Optical Model for Dark Themes:
    // Crystal-clear frosted optical glass body with neutral luminance sheen,
    // crisp 3D Fresnel specular edge catchlights, and zero murky/neon color blotches
    const tintYiq = ((tr * 299) + (tg * 587) + (tb * 114)) / 1000;
    const isBrightTint = tintYiq >= 160;
    const darkPanelAlpha = currentTheme.bg === 'transparent'
      ? Math.max(0.05, Math.min(0.45, rawOpacity))
      : rawOpacity <= 0.22
        ? Math.max(0.05, Math.min(0.11, 0.03 + rawOpacity * 0.42))
        : Math.max(0.11, Math.min(0.50, 0.11 + (rawOpacity - 0.22) * 0.62));
    const darkSurfaceAlpha = Math.max(0.035, Number((darkPanelAlpha * 0.68).toFixed(3)));

    const baseR = isBrightTint ? Math.max(10, Math.min(20, bgR + 8)) : Math.round(tr * 0.85);
    const baseG = isBrightTint ? Math.max(14, Math.min(26, bgG + 11)) : Math.round(tg * 0.85);
    const baseB = isBrightTint ? Math.max(22, Math.min(36, bgB + 18)) : Math.round(tb * 0.85);

    const specScale = Math.max(0.6, Math.min(2.2, specularOpacity / 0.24));
    const sheenTop = Math.max(0.11, Math.min(0.24, 0.16 * specScale));
    const sheenMid = Math.max(0.025, Math.min(0.065, 0.04 * specScale));
    const sheenBottom = Math.max(0.035, Math.min(0.095, 0.055 * specScale));
    const surfaceSheenTop = Math.max(0.08, sheenTop * 0.72);

    const topBorderAlpha = Math.max(0.32, Math.min(0.62, borderOpacity * 2.40));
    const leftBorderAlpha = Math.max(0.20, Math.min(0.44, borderOpacity * 1.60));
    const rightBorderAlpha = Math.max(0.10, Math.min(0.24, borderOpacity * 0.85));
    const bottomBorderAlpha = Math.max(0.14, Math.min(0.32, borderOpacity * 1.15));
    const outerShadowMain = Math.max(0.28, Math.min(0.64, shadowOpacity * 1.10));
    const outerShadowAmbient = Math.max(0.16, Math.min(0.42, shadowOpacity * 0.65));

    const fresnelTopLeft = Math.max(0.42, Math.min(0.76, 0.56 * specScale));
    const fresnelBottomRight = Math.max(0.20, Math.min(0.44, 0.30 * specScale));

    vars['--glass-base-fill'] = isBrightTint
      ? `rgba(255, 255, 255, ${(darkPanelAlpha * 0.62).toFixed(3)})`
      : `rgba(${baseR}, ${baseG}, ${baseB}, ${darkPanelAlpha.toFixed(3)})`;
    vars['--glass-surface-fill'] = isBrightTint
      ? `rgba(255, 255, 255, ${(darkSurfaceAlpha * 0.65).toFixed(3)})`
      : `rgba(${baseR}, ${baseG}, ${baseB}, ${darkSurfaceAlpha.toFixed(3)})`;
    vars['--glass-meniscus-top'] = `none`;
    vars['--glass-sheen'] = `linear-gradient(135deg, rgba(255, 255, 255, ${sheenTop.toFixed(3)}) 0%, rgba(255, 255, 255, ${sheenMid.toFixed(3)}) 30%, rgba(255, 255, 255, 0.008) 56%, rgba(255, 255, 255, ${sheenBottom.toFixed(3)}) 100%)`;
    vars['--glass-surface-sheen'] = `linear-gradient(135deg, rgba(255, 255, 255, ${surfaceSheenTop.toFixed(3)}) 0%, rgba(255, 255, 255, 0.03) 32%, rgba(255, 255, 255, 0) 60%, rgba(255, 255, 255, ${(sheenBottom * 0.78).toFixed(3)}) 100%)`;
    vars['--glass-fresnel-rim'] = `linear-gradient(135deg, rgba(255, 255, 255, ${fresnelTopLeft.toFixed(3)}) 0%, rgba(255, 255, 255, 0.18) 28%, rgba(255, 255, 255, 0.04) 52%, rgba(255, 255, 255, 0.12) 76%, rgba(255, 255, 255, ${fresnelBottomRight.toFixed(3)}) 100%)`;

    vars['--glass-border-top'] = `rgba(255, 255, 255, ${Math.min(0.24, topBorderAlpha * 0.48).toFixed(3)})`;
    vars['--glass-border-left'] = `rgba(255, 255, 255, ${Math.min(0.16, leftBorderAlpha * 0.45).toFixed(3)})`;
    vars['--glass-border-right'] = `rgba(255, 255, 255, ${Math.min(0.07, rightBorderAlpha * 0.42).toFixed(3)})`;
    vars['--glass-border-bottom'] = `rgba(255, 255, 255, ${Math.min(0.10, bottomBorderAlpha * 0.44).toFixed(3)})`;
    vars['--glass-surface-border'] = `rgba(255, 255, 255, ${Math.max(0.06, Math.min(0.12, borderOpacity * 0.58)).toFixed(3)})`;

    // Delicate 3D Liquid Glass Inner Specular Bevel (Dark Theme — No Heavy White Outlines)
    const specTop = Math.max(0.14, Math.min(0.28, specularOpacity * 0.82));
    const specLeft = Math.max(0.09, Math.min(0.18, specularOpacity * 0.54));
    const specBottom = Math.max(0.04, Math.min(0.10, specularOpacity * 0.32));
    const specRight = Math.max(0.03, Math.min(0.07, specularOpacity * 0.22));
    vars['--glass-inset-highlight'] = `inset 0 1px 0 0 rgba(255, 255, 255, ${specTop.toFixed(3)}), inset 1px 0 0 0 rgba(255, 255, 255, ${specLeft.toFixed(3)}), inset 0 -1px 0 0 rgba(255, 255, 255, ${specBottom.toFixed(3)}), inset -1px 0 0 0 rgba(255, 255, 255, ${specRight.toFixed(3)})`;
    vars['--glass-surface-inset-highlight'] = `inset 0 1px 0 0 rgba(255, 255, 255, ${(specTop * 0.68).toFixed(3)}), inset 1px 0 0 0 rgba(255, 255, 255, ${(specLeft * 0.62).toFixed(3)})`;

    vars['--glass-outer-shadow'] = `0 20px 44px -10px rgba(0, 0, 0, ${outerShadowMain.toFixed(3)}), 0 8px 20px -4px rgba(0, 0, 0, ${outerShadowAmbient.toFixed(3)})`;
    vars['--glass-surface-outer-shadow'] = `0 8px 18px -4px rgba(0, 0, 0, ${(outerShadowAmbient * 0.78).toFixed(3)})`;

    vars['--glass-nested-panel-bg'] = `rgba(255, 255, 255, 0.042)`;
    vars['--glass-nested-surface-bg'] = `rgba(255, 255, 255, 0.030)`;
    vars['--glass-nested-sheen'] = `linear-gradient(145deg, rgba(255, 255, 255, 0.11) 0%, rgba(255, 255, 255, 0.03) 32%, rgba(255, 255, 255, 0) 60%, rgba(255, 255, 255, 0.035) 100%)`;
    vars['--glass-nested-shadow'] = `0 10px 24px -6px rgba(0, 0, 0, 0.30), 0 4px 10px -2px rgba(0, 0, 0, 0.18)`;

    const sbGlassR = Math.max(8, Math.min(18, sbR + 8));
    const sbGlassG = Math.max(12, Math.min(24, sbG + 12));
    const sbGlassB = Math.max(22, Math.min(38, sbB + 22));
    vars['--glass-sidebar-bg'] = `rgba(${sbGlassR}, ${sbGlassG}, ${sbGlassB}, ${Math.max(0.10, Math.min(0.42, darkPanelAlpha + 0.02)).toFixed(3)})`;
    vars['--glass-sidebar-sheen'] = `linear-gradient(145deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.035) 32%, rgba(255, 255, 255, 0) 60%, rgba(255, 255, 255, 0.04) 100%)`;
    vars['--glass-sidebar-shadow'] = `0 24px 52px -10px rgba(0, 0, 0, 0.62), 0 8px 22px -4px rgba(0, 0, 0, 0.38), inset 0 1.5px 0.5px 0 rgba(255, 255, 255, ${specTop.toFixed(3)}), inset 1.5px 0 0.5px 0 rgba(255, 255, 255, ${specLeft.toFixed(3)}), inset 0 -1px 0.5px 0 rgba(255, 255, 255, ${specBottom.toFixed(3)})`;
    vars['--glass-drawer-bg'] = `rgba(${baseR}, ${baseG}, ${baseB}, ${Math.max(0.18, Math.min(0.52, darkPanelAlpha + 0.10)).toFixed(3)})`;
    vars['--glass-drawer-sheen'] = `linear-gradient(145deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.035) 32%, rgba(255, 255, 255, 0) 60%, rgba(255, 255, 255, 0.04) 100%)`;
    vars['--glass-drawer-shadow'] = `-24px 0 60px rgba(0, 0, 0, 0.58), 0 24px 60px rgba(0, 0, 0, 0.46)`;
    vars['--glass-portal-bg'] = `rgba(${baseR}, ${baseG}, ${baseB}, ${Math.max(0.28, Math.min(0.62, darkPanelAlpha + 0.22)).toFixed(3)})`;
    vars['--glass-portal-sheen'] = `linear-gradient(145deg, rgba(255, 255, 255, 0.13) 0%, rgba(255, 255, 255, 0.038) 32%, rgba(255, 255, 255, 0) 60%, rgba(255, 255, 255, 0.045) 100%)`;
    vars['--glass-portal-shadow'] = `0 20px 42px -6px rgba(0, 0, 0, 0.62), 0 8px 18px -2px rgba(0, 0, 0, 0.40)`;
    const ddDarkR = isBrightTint ? Math.max(10, Math.min(20, bgR + 11)) : Math.max(6, Math.min(28, baseR + 2));
    const ddDarkG = isBrightTint ? Math.max(16, Math.min(28, bgG + 17)) : Math.max(6, Math.min(28, baseG + 2));
    const ddDarkB = isBrightTint ? Math.max(30, Math.min(46, bgB + 32)) : Math.max(10, Math.min(38, baseB + 4));
    const ddDarkAlpha = Math.max(0.84, Math.min(0.94, 0.80 + rawOpacity * 0.50));
    vars['--glass-dropdown-bg'] = `rgba(${ddDarkR}, ${ddDarkG}, ${ddDarkB}, ${ddDarkAlpha.toFixed(3)})`;
    vars['--glass-dropdown-gradient'] = `linear-gradient(145deg, rgba(255, 255, 255, 0.065) 0%, rgba(255, 255, 255, 0.015) 34%, rgba(255, 255, 255, 0) 64%, rgba(255, 255, 255, 0.02) 100%)`;
    vars['--glass-dropdown-border-top'] = `rgba(${txtR}, ${txtG}, ${txtB}, ${Math.max(0.16, Math.min(0.28, borderOpacity * 1.35)).toFixed(3)})`;
    vars['--glass-dropdown-border-left'] = `rgba(${txtR}, ${txtG}, ${txtB}, ${Math.max(0.13, Math.min(0.22, borderOpacity * 1.10)).toFixed(3)})`;
    vars['--glass-dropdown-border-right'] = `rgba(${txtR}, ${txtG}, ${txtB}, ${Math.max(0.09, Math.min(0.16, borderOpacity * 0.80)).toFixed(3)})`;
    vars['--glass-dropdown-border-bottom'] = `rgba(${txtR}, ${txtG}, ${txtB}, ${Math.max(0.11, Math.min(0.18, borderOpacity * 0.95)).toFixed(3)})`;
    vars['--glass-dropdown-shadow'] = `0 22px 48px -10px rgba(0, 0, 0, 0.72), 0 8px 20px -4px rgba(0, 0, 0, 0.48), inset 0 1px 0 0 rgba(255, 255, 255, 0.12), inset 1px 0 0 0 rgba(255, 255, 255, 0.06)`;
    vars['--glass-dropdown-input-bg'] = `rgba(255, 255, 255, 0.035)`;
    vars['--glass-dropdown-input-border'] = `rgba(${txtR}, ${txtG}, ${txtB}, 0.12)`;
    vars['--glass-dropdown-item-hover'] = `rgba(${txtR}, ${txtG}, ${txtB}, 0.055)`;
    vars['--glass-dropdown-item-active'] = `linear-gradient(135deg, rgba(${accR}, ${accG}, ${accB}, 0.18) 0%, rgba(${accR}, ${accG}, ${accB}, 0.06) 65%, rgba(${accR}, ${accG}, ${accB}, 0.02) 100%)`;
    vars['--glass-dropdown-item-active-border'] = `rgba(${accR}, ${accG}, ${accB}, 0.36)`;
    vars['--glass-backdrop-dim'] = `rgba(0, 0, 0, 0.20)`;
    vars['--glass-card-banner-bg'] = `transparent`;
    vars['--glass-card-icon-bg'] = `rgba(255, 255, 255, 0.055)`;
    vars['--glass-card-icon-border'] = `rgba(255, 255, 255, ${Math.max(0.10, Math.min(0.18, borderOpacity * 0.75)).toFixed(3)})`;
    vars['--glass-card-icon-shadow'] = `0 8px 20px -4px rgba(0, 0, 0, 0.36), inset 0 1px 0 0 rgba(255, 255, 255, 0.18), inset 1px 0 0 0 rgba(255, 255, 255, 0.10)`;
    vars['--glass-nav-active-bg'] = `rgba(255, 255, 255, 0.065)`;
    vars['--glass-nav-active-shadow'] = `0 8px 20px -4px rgba(0, 0, 0, 0.34), inset 0 1px 0 0 rgba(255, 255, 255, 0.20), inset 1px 0 0 0 rgba(255, 255, 255, 0.10)`;
  }

  return vars;
}

const refractedWallpaperCache = new Map<string, { bodyUrl: string; rimUrl: string }>();

export function generateRefractedWallpaperPair(
  bgImage: string,
  blurPx: number,
  saturation: string,
  fallbackBg: string,
  vw: number,
  vh: number
): Promise<{ bodyUrl: string; rimUrl: string }> {
  const isMobileViewport = vw <= 768;
  const viewportAspect = vw / Math.max(1, vh);
  const aspectBucket = Math.round(viewportAspect * 100) / 100;
  const satPct = Math.max(80, Math.min(280, Math.round(parseFloat(String(saturation || '185')) || 185)));
  const effectiveSat = Math.max(110, Math.min(132, Math.round(122 * (satPct / 185))));
  const cleanBlur = Math.max(0, Math.min(80, Math.round(blurPx || 36)));
  const cacheKey = `${bgImage}::${cleanBlur}::${effectiveSat}::${fallbackBg}::${aspectBucket}::${isMobileViewport ? 'm' : 'd'}::v29`;
  const cached = refractedWallpaperCache.get(cacheKey);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const nw = img.naturalWidth || 1920;
        const nh = img.naturalHeight || 1080;
        const imgAspect = nw / nh;
        const targetAspect = viewportAspect > 0.2 ? viewportAspect : (16 / 9);

        // Match SystemBackground's `object-fit: cover; object-position: center` crop
        let sx = 0;
        let sy = 0;
        let sw = nw;
        let sh = nh;
        if (imgAspect > targetAspect) {
          sw = nh * targetAspect;
          sx = (nw - sw) * 0.5;
        } else if (imgAspect < targetAspect) {
          sh = nw / targetAspect;
          sy = (nh - sh) * 0.5;
        }

        const W = isMobileViewport ? Math.max(480, Math.min(640, Math.round(vw))) : 1280;
        const H = Math.max(270, Math.round(W / targetAspect));
        const scaledBlur = cleanBlur <= 0
          ? 0
          : isMobileViewport
            ? Math.max(10, Math.min(20, Math.round(cleanBlur * 0.45)))
            : Math.max(16, Math.min(28, Math.round(cleanBlur * 0.62)));
        const pad = Math.max(64, scaledBlur * 3);

        const padCanvas = document.createElement('canvas');
        padCanvas.width = W + pad * 2;
        padCanvas.height = H + pad * 2;
        const padCtx = padCanvas.getContext('2d');
        if (!padCtx) {
          const fallback = `url("${bgImage}")`;
          resolve({ bodyUrl: fallback, rimUrl: fallback });
          return;
        }

        padCtx.fillStyle = fallbackBg;
        padCtx.fillRect(0, 0, padCanvas.width, padCanvas.height);

        // Draw clamped border strips and corners from the cropped source rectangle so Gaussian blur has zero edge vignette
        padCtx.drawImage(img, sx, sy, sw, 1, pad, 0, W, pad);
        padCtx.drawImage(img, sx, sy + sh - 1, sw, 1, pad, pad + H, W, pad);
        padCtx.drawImage(img, sx, sy, 1, sh, 0, pad, pad, H);
        padCtx.drawImage(img, sx + sw - 1, sy, 1, sh, pad + W, pad, pad, H);
        padCtx.drawImage(img, sx, sy, 1, 1, 0, 0, pad, pad);
        padCtx.drawImage(img, sx + sw - 1, sy, 1, 1, pad + W, 0, pad, pad);
        padCtx.drawImage(img, sx, sy + sh - 1, 1, 1, 0, pad + H, pad, pad);
        padCtx.drawImage(img, sx + sw - 1, sy + sh - 1, 1, 1, pad + W, pad + H, pad, pad);
        // Center cropped image
        padCtx.drawImage(img, sx, sy, sw, sh, pad, pad, W, H);

        const outCanvas = document.createElement('canvas');
        outCanvas.width = W;
        outCanvas.height = H;
        const outCtx = outCanvas.getContext('2d');
        if (!outCtx) {
          const fallback = `url("${bgImage}")`;
          resolve({ bodyUrl: fallback, rimUrl: fallback });
          return;
        }

        const [fbR, fbG, fbB] = parseHexToRgb(fallbackBg, [10, 13, 20]);
        outCtx.fillStyle = `rgb(${fbR}, ${fbG}, ${fbB})`;
        outCtx.fillRect(0, 0, W, H);
        outCtx.imageSmoothingEnabled = true;
        outCtx.imageSmoothingQuality = 'high';

        // True Optical Frosted Liquid Glass Refraction:
        // Clean, uniform Gaussian blur + subtle optical magnification (1.012x) and natural color preservation
        // without artificial neon saturation spikes or radioactive blue contrast blotches
        const bodyMag = 1.012;
        const bmw = padCanvas.width * bodyMag;
        const bmh = padCanvas.height * bodyMag;
        const bmx = -pad - (bmw - padCanvas.width) * 0.5;
        const bmy = -pad - (bmh - padCanvas.height) * 0.5;

        outCtx.globalCompositeOperation = 'source-over';
        outCtx.globalAlpha = 1.0;
        outCtx.filter = scaledBlur > 0
          ? `blur(${scaledBlur}px) saturate(${effectiveSat}%) brightness(1.06)`
          : `saturate(${effectiveSat}%) brightness(1.04)`;
        outCtx.drawImage(padCanvas, 0, 0, padCanvas.width, padCanvas.height, bmx, bmy, bmw, bmh);

        // Soft neutral frosted luminance veil so cards over dark wallpaper areas still look like frosted crystal
        outCtx.filter = 'none';
        const frostGrad = outCtx.createLinearGradient(0, 0, W, H);
        frostGrad.addColorStop(0, 'rgba(255, 255, 255, 0.048)');
        frostGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.026)');
        frostGrad.addColorStop(1, 'rgba(255, 255, 255, 0.040)');
        outCtx.fillStyle = frostGrad;
        outCtx.fillRect(0, 0, W, H);

        const bodyUrl = `url("${outCanvas.toDataURL('image/jpeg', 0.92)}")`;
        const pair = { bodyUrl, rimUrl: bodyUrl };
        refractedWallpaperCache.set(cacheKey, pair);
        resolve(pair);
      } catch {
        const fallback = `url("${bgImage}")`;
        resolve({ bodyUrl: fallback, rimUrl: fallback });
      }
    };
    img.onerror = () => {
      const fallback = `url("${bgImage}")`;
      resolve({ bodyUrl: fallback, rimUrl: fallback });
    };
    img.src = bgImage;
  });
}

export function generateRefractedWallpaperDataUrl(
  bgImage: string,
  blurPx: number,
  saturation: string,
  fallbackBg: string,
  vw: number,
  vh: number
): Promise<string> {
  return generateRefractedWallpaperPair(bgImage, blurPx, saturation, fallbackBg, vw, vh).then((p) => p.bodyUrl);
}

const GLASS_OPTICS_REV = "rev_44";

const ThemeContext = createContext<any>(null);

export const ThemeProvider = ({ children }: any) => {
  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);
  const workspaces = useStore((state) => state.workspaces) || [];
  const wsId = activeWorkspaceId || localStorage.getItem('sanctuary_last_active_workspace') || 'default';

  const [useGlobalThemeState, setUseGlobalThemeState] = useState(() => localStorage.getItem('sanctuary_use_global_theme') === 'true');
  const [CORE_THEMES, setCoreThemes] = useState<any>(DEFAULT_CORE_THEMES);
  const [gameThemes, setGameThemes] = useState<any>({});
  const [customThemes, setCustomThemes] = useState(() => JSON.parse(localStorage.getItem(`sanctuary_${wsId}_custom_themes`) || "{}"));
  const [devThemes, setDevThemes] = useState(() => JSON.parse(localStorage.getItem(`sanctuary_${wsId}_dev_themes`) || "{}"));
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
    setCustomThemes(JSON.parse(localStorage.getItem(`sanctuary_${wsId}_custom_themes`) || "{}"));
    setDevThemes(JSON.parse(localStorage.getItem(`sanctuary_${wsId}_dev_themes`) || "{}"));
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

  const mergedCoreThemes = { ...CORE_THEMES, ...DEFAULT_CORE_THEMES };
  const allThemes = { ...mergedCoreThemes, ...gameThemes, ...devThemes, ...customThemes };
  const resolvedThemeId = activeThemeIdState === 'theme_1788994757269' ? 'sims4_dark' : activeThemeIdState;
  const currentThemeRaw = allThemes[resolvedThemeId] || DEFAULT_CORE_THEMES.architect;
  const currentTheme = { ...currentThemeRaw };

  // Migrate stale auto-forked custom themes that were created from the old navy #091326 / #081121 defaults
  useEffect(() => {
    const legacyTints = new Set(['#091326', '#081121', '#1a0628', '#151126', '#0e1116', '#211d1a', '#061524', '#081020']);
    let hasChanges = false;
    const nextCustoms: Record<string, any> = { ...customThemes };

    Object.entries(nextCustoms).forEach(([id, th]: [string, any]) => {
      if (!th || typeof th !== 'object') return;
      const tint = String(th.panelTint || '').toLowerCase();
      if (id.startsWith('custom_') && legacyTints.has(tint)) {
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
        };
        hasChanges = true;
      }
    });

    if (hasChanges) {
      setCustomThemes(nextCustoms);
      localStorage.setItem(`sanctuary_${wsId}_custom_themes`, JSON.stringify(nextCustoms));
      Object.entries(nextCustoms).forEach(([id, th]) => {
        saveThemeToVault(id, th, false);
      });
    }
  }, [wsId, customThemes]);

  useEffect(() => {
    const scanVault = async () => {
      try {
        if (!isDesktop()) return;
        const config: any = await invoke('get_saved_coordinates');
        if (!config?.vault_path) return;

        const themesDir = `${config.vault_path}\\Data\\Themes`;
        const devThemesDir = `${config.vault_path}\\Data\\Dev\\Themes`;

        let updatedCustoms = { ...customThemes };
        let updatedDevs = { ...devThemes };
        let hasCustomUpdates = false;
        let hasDevUpdates = false;

        if (await exists(themesDir)) {
          const entries = await readDir(themesDir);
          for (const entry of entries) {
            if (entry.name && entry.name.endsWith('.json')) {
              const themeId = entry.name.replace('.json', '');
              if (!updatedCustoms[themeId] && !CORE_THEMES[themeId]) {
                const content = await readTextFile(`${themesDir}\\${entry.name}`);
                updatedCustoms[themeId] = JSON.parse(content);
                hasCustomUpdates = true;
              }
            }
          }
        }

        if (await exists(devThemesDir)) {
          const entries = await readDir(devThemesDir);
          for (const entry of entries) {
            if (entry.name && entry.name.endsWith('.json')) {
              const themeId = entry.name.replace('.json', '');
              if (!updatedDevs[themeId]) {
                const content = await readTextFile(`${devThemesDir}\\${entry.name}`);
                updatedDevs[themeId] = JSON.parse(content);
                hasDevUpdates = true;
              }
            }
          }
        }

        if (hasCustomUpdates) {
          setCustomThemes(updatedCustoms);
          localStorage.setItem(`sanctuary_${wsId}_custom_themes`, JSON.stringify(updatedCustoms));
        }
        if (hasDevUpdates) {
          setDevThemes(updatedDevs);
          localStorage.setItem(`sanctuary_${wsId}_dev_themes`, JSON.stringify(updatedDevs));
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
      localStorage.setItem(`sanctuary_${wsId}_custom_themes`, JSON.stringify(rest));
      if (activeThemeIdState === "Radiant") setActiveThemeId("radiant");
    } else if (activeThemeIdState === "Radiant") {
      setActiveThemeId("radiant");
    }
  }, [customThemes, activeThemeIdState, wsId]);

  useEffect(() => {
    const root = document.documentElement;
    Object.entries(currentTheme).forEach(([key, val]) => {
      if (key !== 'name') {
        let finalVal = val as string;

        // Ensure glassOpacity is a decimal!
        if (key === 'glassOpacity' && typeof finalVal === 'string' && finalVal.endsWith('%')) {
          finalVal = (parseFloat(finalVal) / 100).toString();
        }
        if (key !== 'bgGradient') {
          if (key === 'glassOpacity') {
            let parsedVal = parseFloat(finalVal);
            // Legacy support: if value is a decimal like 0.04, convert it to 4% so color-mix doesn't break
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

    const opticalVars = computeGlassOpticalVars(currentTheme);
    Object.entries(opticalVars).forEach(([k, v]) => {
      root.style.setProperty(k, v);
    });

    const rawBg = currentTheme.bg && currentTheme.bg !== 'transparent' ? currentTheme.bg : '#0a0d14';
    const blurPx = parseFloat(String(currentTheme.glassBlur || '28px')) || 28;
    const saturation = opticalVars['--glassSaturation'] || '185%';

    let isCancelled = false;

    const applyRefractedWallpaper = () => {
      const vw = window.innerWidth || 1920;
      const vh = window.innerHeight || 1080;
      root.style.setProperty('--sanctuary-vw', `${vw}px`);
      root.style.setProperty('--sanctuary-vh', `${vh}px`);

      if (currentTheme.bgImage) {
        root.style.setProperty(`--bgGradient`, `url("${currentTheme.bgImage}")`);
        root.style.setProperty(`--glassBgImage`, `none`);
        root.style.setProperty(`--glassBgImageSurface`, `none`);
        root.style.setProperty(`--glassBeforeDisplay`, `none`);
        root.style.setProperty(`--glassFilter`, `none`);
        root.style.setProperty(`--glassFilterSurface`, `none`);

        const cleanBlur = Math.max(0, Math.min(80, Math.round(blurPx || 32)));
        generateRefractedWallpaperPair(currentTheme.bgImage, cleanBlur, saturation, rawBg, vw, vh).then(({ bodyUrl, rimUrl }) => {
          if (!isCancelled) {
            root.style.setProperty(`--glass-refracted-wallpaper`, bodyUrl);
            root.style.setProperty(`--glass-rim-wallpaper`, rimUrl);
          }
        });
      } else if (currentTheme.bgGradient && currentTheme.bgGradient !== 'transparent' && currentTheme.bgGradient !== 'none' && currentTheme.bgGradient !== currentTheme.bg) {
        root.style.setProperty(`--bgGradient`, currentTheme.bgGradient);
        root.style.setProperty(`--glass-refracted-wallpaper`, currentTheme.bgGradient);
        root.style.setProperty(`--glass-rim-wallpaper`, currentTheme.bgGradient);
        root.style.setProperty(`--glassBgImage`, `none`);
        root.style.setProperty(`--glassBgImageSurface`, `none`);
        root.style.setProperty(`--glassBeforeDisplay`, `none`);
        root.style.setProperty(`--glassFilter`, `none`);
        root.style.setProperty(`--glassFilterSurface`, `none`);
      } else {
        root.style.setProperty(`--bgGradient`, `none`);
        root.style.setProperty(`--glass-refracted-wallpaper`, `none`);
        root.style.setProperty(`--glass-rim-wallpaper`, `none`);
        root.style.setProperty(`--glassBgImage`, `none`);
        root.style.setProperty(`--glassBgImageSurface`, `none`);
        root.style.setProperty(`--glassBeforeDisplay`, `none`);
        root.style.setProperty(`--glassFilter`, `none`);
        root.style.setProperty(`--glassFilterSurface`, `none`);
      }
    };

    applyRefractedWallpaper();

    const [bgR, bgG, bgB] = (opticalVars['--bg-rgb'] || '10, 13, 20').split(',').map((s) => parseInt(s.trim(), 10));
    const yiq = ((bgR * 299) + (bgG * 587) + (bgB * 114)) / 1000;
    const isLight = yiq >= 128;
    const scheme = isLight ? 'light' : 'dark';
    root.style.colorScheme = scheme;

    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', rawBg);
    }
    const colorSchemeMeta = document.querySelector('meta[name="color-scheme"]');
    if (colorSchemeMeta) {
      colorSchemeMeta.setAttribute('content', scheme);
    }

    import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
      getCurrentWindow().setTheme(scheme).catch(() => { });
    }).catch(() => { });

    const handleResizeWallpaper = () => {
      applyRefractedWallpaper();
    };
    window.addEventListener('resize', handleResizeWallpaper, { passive: true });

    return () => {
      isCancelled = true;
      window.removeEventListener('resize', handleResizeWallpaper);
    };
  }, [activeThemeIdState, JSON.stringify(currentTheme), GLASS_OPTICS_REV]);

  const saveThemeToVault = (id: string, json: any, isDev: boolean = false) => {
    (async () => {
      try {
        if (!isDesktop()) return;
        const config: any = await invoke('get_saved_coordinates');
        if (config?.vault_path) {
          const dir = isDev ? `${config.vault_path}\\Data\\Dev\\Themes` : `${config.vault_path}\\Data\\Themes`;
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
      localStorage.setItem(`sanctuary_${wsId}_dev_themes`, JSON.stringify(updated));
      saveThemeToVault(id, updatedTheme, true);
    } else if (CORE_THEMES[id]) {
      const currentTheme = CORE_THEMES[id];
      const newId = `custom_${id}_${Date.now()}`;
      const newTheme = { ...currentTheme, ...updates, name: `${currentTheme.name} (Edited)` };
      const newCustoms = { ...customThemes, [newId]: newTheme };
      setCustomThemes(newCustoms);
      setActiveThemeId(newId);
      localStorage.setItem(`sanctuary_${wsId}_custom_themes`, JSON.stringify(newCustoms));
      saveThemeToVault(newId, newTheme, false);
    } else {
      const currentTheme = customThemes[id];
      if (!currentTheme) return;
      const updatedTheme = { ...currentTheme, ...updates };
      const updated = { ...customThemes, [id]: updatedTheme };
      setCustomThemes(updated);
      localStorage.setItem(`sanctuary_${wsId}_custom_themes`, JSON.stringify(updated));
      saveThemeToVault(id, updatedTheme, false);
    }
  };

  const updateActiveTheme = (updates: any) => {
    if (activeThemeIdState?.startsWith('dev_')) {
      const updatedTheme = { ...currentTheme, ...updates };
      const updated = { ...devThemes, [activeThemeIdState]: updatedTheme };
      setDevThemes(updated);
      localStorage.setItem(`sanctuary_${wsId}_dev_themes`, JSON.stringify(updated));
      saveThemeToVault(activeThemeIdState, updatedTheme, true);
    } else if (CORE_THEMES[activeThemeIdState]) {
      const newId = `custom_${activeThemeIdState}_${Date.now()}`;
      const newTheme = { ...currentTheme, ...updates, name: `${currentTheme.name} (Edited)` };
      const newCustoms = { ...customThemes, [newId]: newTheme };
      setCustomThemes(newCustoms);
      setActiveThemeId(newId);
      localStorage.setItem(`sanctuary_${wsId}_custom_themes`, JSON.stringify(newCustoms));
      saveThemeToVault(newId, newTheme, false);
    } else {
      const updatedTheme = { ...currentTheme, ...updates };
      const updated = { ...customThemes, [activeThemeIdState]: updatedTheme };
      setCustomThemes(updated);
      localStorage.setItem(`sanctuary_${wsId}_custom_themes`, JSON.stringify(updated));
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
    localStorage.setItem(`sanctuary_${wsId}_custom_themes`, JSON.stringify(updated));
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
    localStorage.setItem(`sanctuary_${wsId}_dev_themes`, JSON.stringify(updated));
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
    localStorage.setItem(`sanctuary_${wsId}_custom_themes`, JSON.stringify(updatedCustoms));
    saveThemeToVault(newId, newTheme, false);
  };

  const deleteTheme = (id: string) => {
    if (CORE_THEMES[id]) return;
    const isDev = id.startsWith('dev_');
    if (!isDev) {
      const { [id]: _, ...rest } = customThemes;
      setCustomThemes(rest);
      localStorage.setItem(`sanctuary_${wsId}_custom_themes`, JSON.stringify(rest));
      if (activeThemeIdState === id) setActiveThemeId('architect');
    } else if (id.startsWith('dev_')) {
      const { [id]: _, ...rest } = devThemes;
      setDevThemes(rest);
      localStorage.setItem(`sanctuary_${wsId}_dev_themes`, JSON.stringify(rest));
      if (activeThemeIdState === id) setActiveThemeId('architect');
    }

    (async () => {
      try {
        if (!isDesktop()) return;
        const config: any = await invoke('get_saved_coordinates');
        if (config?.vault_path) {
          const dir = isDev ? `${config.vault_path}\\Data\\Dev\\Themes` : `${config.vault_path}\\Data\\Themes`;
          const filePath = `${dir}\\${id}.json`;
          if (await exists(filePath)) await remove(filePath);
        }
      } catch (err) { console.error("Failed to delete theme from vault:", err); }
    })();
  };

  const renameTheme = (id: string, newName: string) => {
    if (CORE_THEMES[id]) return;
    const isDev = id.startsWith('dev_');
    if (isDev) {
      if (!devThemes[id]) return;
      const updatedTheme = { ...devThemes[id], name: newName };
      const updated = { ...devThemes, [id]: updatedTheme };
      setDevThemes(updated);
      localStorage.setItem(`sanctuary_${wsId}_dev_themes`, JSON.stringify(updated));
      saveThemeToVault(id, updatedTheme, true);
    } else {
      if (!customThemes[id]) return;
      const updatedTheme = { ...customThemes[id], name: newName };
      const updated = { ...customThemes, [id]: updatedTheme };
      setCustomThemes(updated);
      localStorage.setItem(`sanctuary_${wsId}_custom_themes`, JSON.stringify(updated));
      saveThemeToVault(id, updatedTheme, false);
    }
  };

  return (
    <ThemeContext.Provider value={{
      activeThemeId: activeThemeIdState, setActiveThemeId, currentTheme, CORE_THEMES: mergedCoreThemes, setCoreThemes, customThemes, devThemes, gameThemes,
      updateActiveTheme, updateTheme, renameTheme, createNewTheme, createNewDevTheme, exportDevThemeToCustom, deleteTheme,
      useGlobalTheme: useGlobalThemeState, setUseGlobalTheme,
      importTheme: (json: any) => {
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
