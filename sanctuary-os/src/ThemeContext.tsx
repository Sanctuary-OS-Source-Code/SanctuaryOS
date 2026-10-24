import { createContext, useContext, useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { mkdir, writeTextFile, readDir, readTextFile, remove, exists } from '@tauri-apps/plugin-fs';
import { supabase } from './supabase';
import { createClient } from '@supabase/supabase-js';
import { isDesktop } from './utils/envUtils';

import { useStore } from './store';

const DEFAULT_CORE_THEMES: any = {
  // Flagship Premium Dark
  architect: {
    name: "Architect", bg: "#000000", sidebar: "#000000", sidebartext: "#f8fafc", accent: "#38bdf8",
    text: "#ffffff", subtext: "#94a3b8", success: "#10b981", warning: "#f59e0b", danger: "#ef4444",
    panelTint: "#ffffff", headerText: "#ffffff", fontFamily: "Inter, sans-serif", fontSizeBase: "16px",
    glassOpacity: "10%", glassBlur: "36px", radius: "1.25rem", shadowColor: "rgba(0,0,0,0.3)",
    bgGradient: "transparent",
    bgImage: "/themes/architect.png",
    animated: true, ambientOrb: false, ambientNoise: true,
    volumetricOrbs: [],
    fontSizeHeader: "1.875rem", fontSizeSubheader: "1.5rem", fontSizeTitle: "1.25rem", fontSizeSubtitle: "1.125rem",
    fontSizeText: "1rem", fontSizeSubtext: "0.75rem", fontSizeSidebar: "10px", sidebarWidth: "260px"
  },
  // Flagship Premium Light
  radiant: {
    name: "Radiant", bg: "#fdfdfd", sidebar: "#fdfdfd", sidebartext: "#0f172a", accent: "#ec4899",
    text: "#020617", subtext: "#475569", success: "#10b981", warning: "#f59e0b", danger: "#ef4444",
    panelTint: "#ffffff", headerText: "#020617", fontFamily: "Inter, sans-serif", fontSizeBase: "16px",
    glassOpacity: "30%", glassBlur: "48px", radius: "1rem", shadowColor: "rgba(0,0,0,0.06)",
    bgGradient: "transparent",
    bgImage: "/themes/radiant.png",
    animated: true, ambientOrb: false, ambientNoise: true,
    volumetricOrbs: [],
    fontSizeHeader: "1.875rem", fontSizeSubheader: "1.5rem", fontSizeTitle: "1.25rem", fontSizeSubtitle: "1.125rem",
    fontSizeText: "1rem", fontSizeSubtext: "0.75rem", fontSizeSidebar: "10px", sidebarWidth: "260px"
  },
  // Personality Themes
  aurora: {
    name: "Aurora", bg: "#000000", sidebar: "#000000", sidebartext: "#f8fafc", accent: "#06b6d4",
    text: "#f8fafc", subtext: "#94a3b8", success: "#10b981", warning: "#f59e0b", danger: "#ef4444",
    panelTint: "#0a0a0a", headerText: "#ffffff", fontFamily: "Inter, sans-serif", fontSizeBase: "16px",
    glassOpacity: "10%", glassBlur: "48px", radius: "1.5rem", shadowColor: "rgba(0,0,0,0.8)",
    bgGradient: "transparent",
    bgImage: "/themes/aurora.png",
    animated: true, ambientOrb: false, ambientNoise: true,
    volumetricOrbs: [],
    fontSizeHeader: "1.875rem", fontSizeSubheader: "1.5rem", fontSizeTitle: "1.25rem", fontSizeSubtitle: "1.125rem",
    fontSizeText: "1rem", fontSizeSubtext: "0.75rem", fontSizeSidebar: "10px", sidebarWidth: "260px"
  },
  bunker: {
    name: "Bunker", bg: "#020602", sidebar: "#020602", sidebartext: "#00ff41", accent: "#00ff41",
    text: "#00ff41", subtext: "#008f11", success: "#0ce471", warning: "#ffea00", danger: "#ff003c",
    panelTint: "#050a05", headerText: "#00ff41", fontFamily: "'Space Mono', monospace", fontSizeBase: "16px",
    glassOpacity: "5%", glassBlur: "16px", radius: "0rem", shadowColor: "rgba(0,255,65,0.15)",
    bgGradient: "transparent",
    bgImage: "/themes/bunker.png",
    animated: true, ambientOrb: false, ambientNoise: true, scanlines: true,
    volumetricOrbs: [],
    fontSizeHeader: "1.875rem", fontSizeSubheader: "1.5rem", fontSizeTitle: "1.25rem", fontSizeSubtitle: "1.125rem",
    fontSizeText: "1rem", fontSizeSubtext: "0.75rem", fontSizeSidebar: "10px", sidebarWidth: "260px"
  },
  synthwave: {
    name: "Miami Vice", bg: "#050110", sidebar: "#050110", sidebartext: "#fdf2f8", accent: "#f92aad",
    text: "#fdf2f8", subtext: "#d8b4e2", success: "#0ce471", warning: "#f9df6d", danger: "#fe4450",
    panelTint: "#1a0b2e", headerText: "#ffffff", fontFamily: "Inter, sans-serif", fontSizeBase: "16px",
    glassOpacity: "20%", glassBlur: "32px", radius: "1rem", shadowColor: "rgba(0,0,0,0.6)",
    bgGradient: "transparent",
    bgImage: "/themes/synthwave.png",
    animated: true, ambientOrb: false, ambientNoise: true,
    volumetricOrbs: [],
    fontSizeHeader: "1.875rem", fontSizeSubheader: "1.5rem", fontSizeTitle: "1.25rem", fontSizeSubtitle: "1.125rem",
    fontSizeText: "1rem", fontSizeSubtext: "0.75rem", fontSizeSidebar: "10px", sidebarWidth: "260px"
  },
  dracula: {
    name: "Dracula", bg: "#282a36", sidebar: "#282a36", sidebartext: "#f8f8f2", accent: "#bd93f9",
    text: "#f8f8f2", subtext: "#6272a4", success: "#50fa7b", warning: "#f1fa8c", danger: "#ff5555",
    panelTint: "#282a36", headerText: "#f8f8f2", fontFamily: "Inter, sans-serif", fontSizeBase: "16px",
    glassOpacity: "0.25", glassBlur: "32px", radius: "1rem", shadowColor: "rgba(0,0,0,0.6)",
    bgGradient: "transparent",
    bgImage: "/themes/dracula.png",
    panelBackground: "linear-gradient(135deg, rgba(189,147,249,0.15) 0%, rgba(255,121,198,0.05) 100%)",
    panelBorder: "1px solid rgba(189, 147, 249, 0.4)",
    panelShadow: "0 16px 32px rgba(0, 0, 0, 0.5), 0 0 30px rgba(189, 147, 249, 0.15)",
    panelInnerShadow: "inset 0 1px 2px rgba(189, 147, 249, 0.3), inset 0 0 15px rgba(255, 121, 198, 0.1)",
    animated: true, ambientOrb: false, ambientNoise: true,
    fontSizeHeader: "1.875rem", fontSizeSubheader: "1.5rem", fontSizeTitle: "1.25rem", fontSizeSubtitle: "1.125rem",
    fontSizeText: "1rem", fontSizeSubtext: "0.75rem", fontSizeSidebar: "10px", sidebarWidth: "260px"
  },
  true_glass: {
    name: "True Glass", bg: "transparent", sidebar: "transparent", sidebartext: "#f8fafc", accent: "#ffffff",
    text: "#ffffff", subtext: "#94a3b8", success: "#10b981", warning: "#f59e0b", danger: "#ef4444",
    panelTint: "#ffffff", headerText: "#ffffff", fontFamily: "Inter, sans-serif", fontSizeBase: "16px",
    glassOpacity: "0.05", glassBlur: "16px", radius: "1rem", shadowColor: "rgba(0,0,0,0.15)",
    bgGradient: "transparent",
    bgImage: "",
    animated: true, ambientOrb: false, ambientNoise: false,
    volumetricOrbs: [],
    fontSizeHeader: "1.875rem", fontSizeSubheader: "1.5rem", fontSizeTitle: "1.25rem", fontSizeSubtitle: "1.125rem",
    fontSizeText: "1rem", fontSizeSubtext: "0.75rem", fontSizeSidebar: "10px", sidebarWidth: "260px"
  }
};

export function computeGlassOpticalVars(currentTheme: any): Record<string, string> {
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
    '--glassBorderOpacityDecimal': borderOpacity.toString(),
    '--glassBorderOpacitySurfaceDecimal': Number((borderOpacity * 0.70).toFixed(4)).toString(),
    '--glassSpecularDecimal': specularOpacity.toString(),
    '--glassShadowDecimal': shadowOpacity.toString(),
  };

  if (isLight) {
    // 3D Crystal Quartz Optical Model for Light Themes:
    // Genuinely translucent (14%–22% base tint) with soft, borderless-feeling edges (zero dark 1px rings!)
    const lightPanelAlpha = Math.max(0.12, Math.min(0.28, rawOpacity * 0.55));
    const lightSurfaceAlpha = Math.max(0.08, Math.min(0.20, surfaceOpacity * 0.45));
    const lightShadowScale = Math.max(0.05, Math.min(0.14, shadowOpacity * 0.18));

    vars['--glass-base-fill'] = `rgba(${tr}, ${tg}, ${tb}, ${lightPanelAlpha.toFixed(3)})`;
    vars['--glass-surface-fill'] = `rgba(${tr}, ${tg}, ${tb}, ${lightSurfaceAlpha.toFixed(3)})`;
    vars['--glass-sheen'] = `linear-gradient(135deg, rgba(255, 255, 255, 0.42) 0%, rgba(255, 255, 255, 0.08) 38%, transparent 68%, rgba(${accR}, ${accG}, ${accB}, 0.04) 100%)`;
    vars['--glass-surface-sheen'] = `linear-gradient(135deg, rgba(255, 255, 255, 0.30) 0%, rgba(255, 255, 255, 0.04) 45%, transparent 75%)`;

    // Delicate, semi-translucent white glass bevel (never a solid white or dark outline)
    vars['--glass-border-top'] = `rgba(255, 255, 255, 0.50)`;
    vars['--glass-border-left'] = `rgba(255, 255, 255, 0.38)`;
    vars['--glass-border-right'] = `rgba(255, 255, 255, 0.22)`;
    vars['--glass-border-bottom'] = `rgba(255, 255, 255, 0.18)`;
    vars['--glass-surface-border'] = `rgba(255, 255, 255, 0.26)`;

    // 3-sided 3D Liquid Glass Specular Bevel (Light Theme)
    vars['--glass-inset-highlight'] = `inset 0 1.5px 1px 0 rgba(255, 255, 255, 0.62), inset 1px 0 1px 0 rgba(255, 255, 255, 0.34), inset 0 -1px 1px 0 rgba(255, 255, 255, 0.16)`;
    vars['--glass-surface-inset-highlight'] = `inset 0 1px 1px 0 rgba(255, 255, 255, 0.44), inset 1px 0 1px 0 rgba(255, 255, 255, 0.22)`;

    // Pure soft ambient elevation shadows (NO 0 0 0 1px dark slate ring!)
    vars['--glass-outer-shadow'] = `0 16px 36px -8px rgba(15, 23, 42, ${lightShadowScale.toFixed(3)}), 0 4px 12px -2px rgba(15, 23, 42, ${(lightShadowScale * 0.50).toFixed(3)})`;
    vars['--glass-surface-outer-shadow'] = `0 6px 14px -3px rgba(15, 23, 42, ${(lightShadowScale * 0.45).toFixed(3)})`;

    // Nested Glass inside SidePanels / Modals
    vars['--glass-nested-panel-bg'] = `rgba(255, 255, 255, 0.30)`;
    vars['--glass-nested-surface-bg'] = `rgba(255, 255, 255, 0.22)`;
    vars['--glass-nested-sheen'] = `linear-gradient(135deg, rgba(255, 255, 255, 0.42) 0%, rgba(255, 255, 255, 0.05) 55%, rgba(255, 255, 255, 0.15) 100%)`;
    vars['--glass-nested-shadow'] = `0 8px 22px -6px rgba(15, 23, 42, 0.07), 0 2px 6px -1px rgba(15, 23, 42, 0.04), inset 0 1.5px 1px 0 rgba(255, 255, 255, 0.58)`;

    // Chrome & Containers (Sidebar, SidePanel Drawer, Floating Pills, Card Banner/Icon)
    vars['--glass-sidebar-bg'] = `rgba(${sbR}, ${sbG}, ${sbB}, ${Math.max(0.18, Math.min(0.32, rawOpacity * 0.62)).toFixed(3)})`;
    vars['--glass-sidebar-sheen'] = `linear-gradient(135deg, rgba(255, 255, 255, 0.48) 0%, rgba(255, 255, 255, 0.08) 38%, rgba(${accR}, ${accG}, ${accB}, 0.06) 72%, rgba(255, 255, 255, 0.16) 100%)`;
    vars['--glass-sidebar-shadow'] = `0 22px 48px -10px rgba(15, 23, 42, 0.12), 0 6px 18px -4px rgba(15, 23, 42, 0.07), inset 0 1.5px 1px 0 rgba(255, 255, 255, 0.68), inset 1.5px 0 1px 0 rgba(255, 255, 255, 0.42), inset -1px 0 1px 0 rgba(${accR}, ${accG}, ${accB}, 0.12), inset 0 -1.5px 1px 0 rgba(255, 255, 255, 0.22)`;
    vars['--glass-drawer-bg'] = `rgba(255, 255, 255, ${Math.max(0.24, Math.min(0.42, rawOpacity * 0.72)).toFixed(3)})`;
    vars['--glass-drawer-sheen'] = `linear-gradient(135deg, rgba(255, 255, 255, 0.46) 0%, rgba(255, 255, 255, 0.06) 50%, rgba(${accR}, ${accG}, ${accB}, 0.05) 100%)`;
    vars['--glass-drawer-shadow'] = `-20px 0 50px rgba(15, 23, 42, 0.12), 0 20px 50px rgba(15, 23, 42, 0.10), inset 0 1.5px 1px 0 rgba(255, 255, 255, 0.65), inset 1.5px 0 1px 0 rgba(255, 255, 255, 0.40)`;
    vars['--glass-portal-bg'] = `rgba(255, 255, 255, 0.36)`;
    vars['--glass-portal-sheen'] = `linear-gradient(165deg, rgba(255, 255, 255, 0.52) 0%, rgba(255, 255, 255, 0.10) 42%, rgba(${accR}, ${accG}, ${accB}, 0.07) 100%)`;
    vars['--glass-portal-shadow'] = `0 18px 40px -8px rgba(15, 23, 42, 0.15), 0 6px 16px -4px rgba(15, 23, 42, 0.09), inset 0 1.5px 1px 0 rgba(255, 255, 255, 0.70), inset 1px 0 1px 0 rgba(255, 255, 255, 0.40), inset 0 -1.5px 1.5px 0 rgba(${accR}, ${accG}, ${accB}, 0.12)`;
    vars['--glass-backdrop-dim'] = `rgba(15, 23, 42, 0.06)`;
    vars['--glass-card-banner-bg'] = `linear-gradient(180deg, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0.04) 70%, rgba(15, 23, 42, 0.03) 100%)`;
    vars['--glass-card-icon-bg'] = `rgba(255, 255, 255, 0.34)`;
    vars['--glass-card-icon-border'] = `rgba(255, 255, 255, 0.48)`;
    vars['--glass-card-icon-shadow'] = `0 8px 18px -4px rgba(15, 23, 42, 0.08), inset 0 1.5px 1px 0 rgba(255, 255, 255, 0.62)`;
    vars['--glass-nav-active-bg'] = `rgba(255, 255, 255, 0.38)`;
    vars['--glass-nav-active-shadow'] = `0 4px 12px -2px rgba(15, 23, 42, 0.05), inset 0 1px 0 0 rgba(255, 255, 255, 0.48)`;
  } else {
    // 3D Liquid Glass Optical Model for Dark Themes:
    // Sheer smoked optical crystal base (8%–18% tint so ~86% of refracted background shines through)
    const tintYiq = ((tr * 299) + (tg * 587) + (tb * 114)) / 1000;
    const isBrightTint = tintYiq >= 160;
    const darkPanelAlpha = currentTheme.bg === 'transparent'
      ? Math.max(0.05, Math.min(0.16, rawOpacity))
      : Math.max(0.08, Math.min(0.18, 0.05 + rawOpacity * 0.38));
    const darkSurfaceAlpha = Math.max(0.06, Number((darkPanelAlpha * 0.68).toFixed(3)));

    const baseR = isBrightTint ? Math.max(4, bgR) : tr;
    const baseG = isBrightTint ? Math.max(8, bgG) : tg;
    const baseB = isBrightTint ? Math.max(14, bgB) : tb;

    const sheenEdgeAlpha = Math.max(0.09, Math.min(0.15, rawOpacity * 0.82));
    const surfaceSheenEdgeAlpha = Math.max(0.065, sheenEdgeAlpha * 0.75);

    const topBorderAlpha = Math.max(0.18, Math.min(0.28, borderOpacity * 1.45));
    const leftBorderAlpha = Math.max(0.12, Math.min(0.20, borderOpacity * 1.05));
    const rightBorderAlpha = Math.max(0.06, Math.min(0.11, borderOpacity * 0.55));
    const bottomBorderAlpha = Math.max(0.05, Math.min(0.09, borderOpacity * 0.45));
    const outerShadowMain = Math.min(0.58, shadowOpacity * 1.05);
    const outerShadowAmbient = Math.min(0.36, shadowOpacity * 0.60);

    vars['--glass-base-fill'] = `rgba(${baseR}, ${baseG}, ${baseB}, ${darkPanelAlpha.toFixed(3)})`;
    vars['--glass-surface-fill'] = `rgba(${baseR}, ${baseG}, ${baseB}, ${darkSurfaceAlpha.toFixed(3)})`;

    // Single-layer 3D Liquid Glass Specular Sheen (MUST be 1 gradient layer so 4-layer background-size matches 1:1!)
    vars['--glass-sheen'] = `linear-gradient(125deg, rgba(255, 255, 255, ${sheenEdgeAlpha.toFixed(3)}) 0%, rgba(255, 255, 255, 0.025) 32%, rgba(${accR}, ${accG}, ${accB}, 0.075) 68%, rgba(${baseR}, ${baseG}, ${baseB}, 0.14) 100%)`;
    vars['--glass-surface-sheen'] = `linear-gradient(135deg, rgba(255, 255, 255, ${surfaceSheenEdgeAlpha.toFixed(3)}) 0%, rgba(255, 255, 255, 0.015) 42%, transparent 72%)`;

    // Luminous 3D crystal borders (bright top-left light source, soft bottom-right rim)
    vars['--glass-border-top'] = `rgba(255, 255, 255, ${topBorderAlpha.toFixed(3)})`;
    vars['--glass-border-left'] = `rgba(255, 255, 255, ${leftBorderAlpha.toFixed(3)})`;
    vars['--glass-border-right'] = `rgba(255, 255, 255, ${rightBorderAlpha.toFixed(3)})`;
    vars['--glass-border-bottom'] = `rgba(255, 255, 255, ${bottomBorderAlpha.toFixed(3)})`;
    vars['--glass-surface-border'] = `rgba(255, 255, 255, ${Math.min(0.14, borderOpacity * 0.75).toFixed(3)})`;

    // 3-sided 3D Liquid Glass Curved Specular Rim (top catchlight + left bevel + bottom internal reflection)
    const specTop = Math.max(0.18, Math.min(0.28, specularOpacity * 0.78));
    const specLeft = Math.max(0.09, Math.min(0.15, specularOpacity * 0.38));
    const specBottom = Math.max(0.04, Math.min(0.07, specularOpacity * 0.18));
    vars['--glass-inset-highlight'] = `inset 0 1.5px 1px 0 rgba(255, 255, 255, ${specTop.toFixed(3)}), inset 1px 0 1px 0 rgba(255, 255, 255, ${specLeft.toFixed(3)}), inset 0 -1px 1px 0 rgba(255, 255, 255, ${specBottom.toFixed(3)})`;
    vars['--glass-surface-inset-highlight'] = `inset 0 1px 1px 0 rgba(255, 255, 255, ${(specTop * 0.72).toFixed(3)}), inset 1px 0 1px 0 rgba(255, 255, 255, ${(specLeft * 0.72).toFixed(3)})`;

    // Deep External 3D Elevation Shadow
    vars['--glass-outer-shadow'] = `0 18px 40px -10px rgba(0, 0, 0, ${outerShadowMain.toFixed(3)}), 0 6px 16px -4px rgba(0, 0, 0, ${outerShadowAmbient.toFixed(3)})`;
    vars['--glass-surface-outer-shadow'] = `0 6px 16px -4px rgba(0, 0, 0, ${(outerShadowAmbient * 0.70).toFixed(3)})`;

    // Nested Glass inside SidePanels / Modals (Sheer luminous Liquid Glass!)
    vars['--glass-nested-panel-bg'] = `rgba(255, 255, 255, 0.055)`;
    vars['--glass-nested-surface-bg'] = `rgba(255, 255, 255, 0.045)`;
    vars['--glass-nested-sheen'] = `linear-gradient(135deg, rgba(255, 255, 255, 0.10) 0%, rgba(255, 255, 255, 0.018) 45%, rgba(255, 255, 255, 0.03) 100%)`;
    vars['--glass-nested-shadow'] = `0 12px 28px -6px rgba(0, 0, 0, 0.34), 0 4px 10px -2px rgba(0, 0, 0, 0.20), inset 0 1.5px 1px 0 rgba(255, 255, 255, 0.22), inset 1px 0 1px 0 rgba(255, 255, 255, 0.10)`;

    // Chrome & Containers (Sidebar, SidePanel Drawer, Floating Pills, Card Banner/Icon)
    const drawerTintR = isBrightTint ? baseR : tr;
    const drawerTintG = isBrightTint ? baseG : tg;
    const drawerTintB = isBrightTint ? baseB : tb;
    vars['--glass-sidebar-bg'] = `rgba(${Math.max(6, sbR)}, ${Math.max(10, sbG)}, ${Math.max(18, sbB)}, 0.24)`;
    vars['--glass-sidebar-sheen'] = `linear-gradient(135deg, rgba(255, 255, 255, 0.13) 0%, rgba(255, 255, 255, 0.025) 32%, rgba(${accR}, ${accG}, ${accB}, 0.055) 68%, rgba(255, 255, 255, 0.06) 100%)`;
    vars['--glass-sidebar-shadow'] = `0 24px 52px -10px rgba(0, 0, 0, 0.62), 0 8px 22px -4px rgba(0, 0, 0, 0.38), inset 0 1.5px 1px 0 rgba(255, 255, 255, 0.32), inset 1.5px 0 1px 0 rgba(255, 255, 255, 0.16), inset -1px 0 1px 0 rgba(${accR}, ${accG}, ${accB}, 0.10), inset 0 -1.5px 1px 0 rgba(255, 255, 255, 0.08)`;
    vars['--glass-drawer-bg'] = `rgba(${drawerTintR}, ${drawerTintG}, ${drawerTintB}, ${Math.max(0.14, Math.min(0.22, darkPanelAlpha + 0.02)).toFixed(3)})`;
    vars['--glass-drawer-sheen'] = `linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.02) 44%, transparent 68%, rgba(${accR}, ${accG}, ${accB}, 0.04) 100%)`;
    vars['--glass-drawer-shadow'] = `-24px 0 60px rgba(0, 0, 0, 0.52), 0 24px 60px rgba(0, 0, 0, 0.42), inset 0 1.5px 1px 0 rgba(255, 255, 255, 0.28), inset 1.5px 0 1px 0 rgba(255, 255, 255, 0.14), inset 0 -1px 1px 0 rgba(255, 255, 255, 0.06)`;
    vars['--glass-portal-bg'] = `rgba(${Math.max(8, drawerTintR)}, ${Math.max(13, drawerTintG)}, ${Math.max(24, drawerTintB)}, 0.36)`;
    vars['--glass-portal-sheen'] = `linear-gradient(165deg, rgba(255, 255, 255, 0.18) 0%, rgba(255, 255, 255, 0.04) 38%, rgba(8, 13, 24, 0.18) 68%, rgba(${accR}, ${accG}, ${accB}, 0.085) 100%)`;
    vars['--glass-portal-shadow'] = `0 18px 38px -6px rgba(0, 0, 0, 0.62), 0 6px 14px -2px rgba(0, 0, 0, 0.40), inset 0 1.5px 1px 0 rgba(255, 255, 255, 0.36), inset 1px 0 1px 0 rgba(255, 255, 255, 0.18), inset 0 -1.5px 1.5px 0 rgba(${accR}, ${accG}, ${accB}, 0.12)`;
    vars['--glass-backdrop-dim'] = `rgba(0, 0, 0, 0.22)`;
    vars['--glass-card-banner-bg'] = `linear-gradient(180deg, rgba(255, 255, 255, 0.045) 0%, rgba(255, 255, 255, 0.008) 65%, rgba(0, 0, 0, 0.08) 100%)`;
    vars['--glass-card-icon-bg'] = `rgba(255, 255, 255, 0.07)`;
    vars['--glass-card-icon-border'] = `rgba(255, 255, 255, ${Math.min(0.22, borderOpacity * 1.05).toFixed(3)})`;
    vars['--glass-card-icon-shadow'] = `0 8px 20px -4px rgba(0, 0, 0, 0.34), inset 0 1.5px 1px 0 rgba(255, 255, 255, 0.24), inset 1px 0 1px 0 rgba(255, 255, 255, 0.12)`;
    vars['--glass-nav-active-bg'] = `rgba(255, 255, 255, 0.065)`;
    vars['--glass-nav-active-shadow'] = `0 8px 20px -4px rgba(0, 0, 0, 0.32), inset 0 1.5px 1px 0 rgba(255, 255, 255, 0.24), inset 1px 0 1px 0 rgba(255, 255, 255, 0.10), inset 0 -1px 1px 0 rgba(255, 255, 255, 0.04)`;
  }

  return vars;
}

const refractedWallpaperCache = new Map<string, string>();

function generateRefractedWallpaperDataUrl(
  bgImage: string,
  blurPx: number,
  saturation: string,
  fallbackBg: string,
  viewportAspect: number
): Promise<string> {
  const aspectBucket = Math.round(viewportAspect * 100) / 100;
  const cacheKey = `${bgImage}::${blurPx}::${saturation}::${fallbackBg}::${aspectBucket}::v3`;
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

        // Match SystemBackground's `object-fit: cover; object-position: center` crop exactly
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

        const W = 1280;
        const H = Math.max(1, Math.round(W / targetAspect));
        const scaleRatio = W / 1920;
        const scaledBlur = Math.max(12, Math.min(24, Math.round(blurPx * scaleRatio * 0.68)));
        const pad = Math.max(48, scaledBlur * 3);

        const padCanvas = document.createElement('canvas');
        padCanvas.width = W + pad * 2;
        padCanvas.height = H + pad * 2;
        const padCtx = padCanvas.getContext('2d');
        if (!padCtx) {
          resolve(`url("${bgImage}")`);
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
          resolve(`url("${bgImage}")`);
          return;
        }

        outCtx.fillStyle = fallbackBg;
        outCtx.fillRect(0, 0, W, H);
        outCtx.filter = `blur(${scaledBlur}px) saturate(135%)`;
        outCtx.drawImage(padCanvas, -pad, -pad, padCanvas.width, padCanvas.height);

        const dataUrl = `url("${outCanvas.toDataURL('image/jpeg', 0.92)}")`;
        refractedWallpaperCache.set(cacheKey, dataUrl);
        resolve(dataUrl);
      } catch {
        resolve(`url("${bgImage}")`);
      }
    };
    img.onerror = () => {
      resolve(`url("${bgImage}")`);
    };
    img.src = bgImage;
  });
}

const GLASS_OPTICS_REV = "rev_14";

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
                    fetchedGameThemes[row.id] = { ...row.theme_data, id: row.id, name: row.name, badge: game.name || "Community" };
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
                fetchedGameThemes[row.id] = { ...row.theme_data, id: row.id, name: row.name, badge: ws.name || ws.display_name || "Community" };
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

  const allThemes = { ...customThemes, ...devThemes, ...gameThemes, ...CORE_THEMES };
  const currentThemeRaw = allThemes[activeThemeIdState] || CORE_THEMES.architect || DEFAULT_CORE_THEMES.architect;
  const currentTheme = { ...currentThemeRaw };

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

        const aspect = vw / Math.max(1, vh);
        const aspectBucket = Math.round(aspect * 100) / 100;
        const cacheKey = `${currentTheme.bgImage}::${blurPx}::${saturation}::${rawBg}::${aspectBucket}::v3`;
        const cached = refractedWallpaperCache.get(cacheKey);
        if (cached) {
          root.style.setProperty(`--glass-refracted-wallpaper`, cached);
        } else {
          generateRefractedWallpaperDataUrl(currentTheme.bgImage, blurPx, saturation, rawBg, aspect).then((dataUrl) => {
            if (!isCancelled) {
              root.style.setProperty(`--glass-refracted-wallpaper`, dataUrl);
            }
          });
        }
      } else if (currentTheme.bgGradient && currentTheme.bgGradient !== 'transparent' && currentTheme.bgGradient !== 'none' && currentTheme.bgGradient !== currentTheme.bg) {
        root.style.setProperty(`--bgGradient`, currentTheme.bgGradient);
        root.style.setProperty(`--glass-refracted-wallpaper`, currentTheme.bgGradient);
        root.style.setProperty(`--glassBgImage`, `none`);
        root.style.setProperty(`--glassBgImageSurface`, `none`);
        root.style.setProperty(`--glassBeforeDisplay`, `none`);
        root.style.setProperty(`--glassFilter`, `none`);
        root.style.setProperty(`--glassFilterSurface`, `none`);
      } else {
        root.style.setProperty(`--bgGradient`, `none`);
        root.style.setProperty(`--glass-refracted-wallpaper`, `none`);
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

  useEffect(() => {
    let rafId = 0;
    const SELECTOR = '.glass-panel, .glass-surface, nav.firefox-safe-glass, .sa-side-panel-window, .portal-glass-fix';

    const syncGlassViewportCoords = () => {
      rafId = 0;
      const vw = window.innerWidth || 1920;
      const vh = window.innerHeight || 1080;
      const root = document.documentElement;
      const vwStr = `${vw}px`;
      const vhStr = `${vh}px`;
      if (root.style.getPropertyValue('--sanctuary-vw') !== vwStr) {
        root.style.setProperty('--sanctuary-vw', vwStr);
      }
      if (root.style.getPropertyValue('--sanctuary-vh') !== vhStr) {
        root.style.setProperty('--sanctuary-vh', vhStr);
      }

      const nodes = document.querySelectorAll<HTMLElement>(SELECTOR);
      for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i];
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        const xStr = `${Math.round(rect.left)}px`;
        const yStr = `${Math.round(rect.top)}px`;
        if (el.style.getPropertyValue('--glass-x') !== xStr) {
          el.style.setProperty('--glass-x', xStr);
        }
        if (el.style.getPropertyValue('--glass-y') !== yStr) {
          el.style.setProperty('--glass-y', yStr);
        }
      }
    };

    const scheduleSync = () => {
      if (rafId === 0) {
        rafId = requestAnimationFrame(syncGlassViewportCoords);
      }
    };

    // Synchronous update on scroll so --glass-y updates in the exact same paint frame with zero lag
    const onScrollSync = () => {
      syncGlassViewportCoords();
    };

    syncGlassViewportCoords();
    window.addEventListener('scroll', onScrollSync, { capture: true, passive: true });
    window.addEventListener('resize', scheduleSync, { passive: true });

    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });

    return () => {
      if (rafId !== 0) cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', onScrollSync, { capture: true } as any);
      window.removeEventListener('resize', scheduleSync);
      observer.disconnect();
    };
  }, []);

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
      name: "NEW SIGNATURE", bg: "#0f172a", sidebar: "#0f172a", sidebartext: "#ffffff", accent: "#ffffff",
      text: "#ffffff", subtext: "#666666", success: "#00ff41", warning: "#ffea00", danger: "#ff003c",
      panelTint: "#ffffff", headerText: "#ffffff", fontFamily: "Inter, sans-serif", fontSizeBase: "16px", glassOpacity: "0.03", glassBlur: "16px", radius: "1.5rem", bgGradient: "none", animated: false
    };
    const updated = { ...customThemes, [id]: newTheme };
    setCustomThemes(updated);
    setActiveThemeId(id);
    localStorage.setItem("sanctuary_custom_themes", JSON.stringify(updated));
  };

  const createNewDevTheme = (baseTheme: any = null) => {
    const id = `dev_${Date.now()}`;
    const newTheme = baseTheme ? { ...baseTheme, name: `${baseTheme.name} (Copy)` } : {
      name: "NEW SIGNATURE", bg: "#0f172a", sidebar: "#0f172a", sidebartext: "#ffffff", accent: "#ffffff",
      text: "#ffffff", subtext: "#666666", success: "#00ff41", warning: "#ffea00", danger: "#ff003c",
      panelTint: "#ffffff", headerText: "#ffffff", fontFamily: "Inter, sans-serif", fontSizeBase: "16px", glassOpacity: "0.03", glassBlur: "16px", radius: "1.5rem", bgGradient: "none", animated: false
    };
    const updated = { ...devThemes, [id]: newTheme };
    setDevThemes(updated);
    localStorage.setItem("sanctuary_dev_themes", JSON.stringify(updated));
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
    localStorage.setItem("sanctuary_custom_themes", JSON.stringify(updatedCustoms));
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
      localStorage.setItem("sanctuary_dev_themes", JSON.stringify(updated));
      saveThemeToVault(id, updatedTheme, true);
    } else {
      if (!customThemes[id]) return;
      const updatedTheme = { ...customThemes[id], name: newName };
      const updated = { ...customThemes, [id]: updatedTheme };
      setCustomThemes(updated);
      localStorage.setItem("sanctuary_custom_themes", JSON.stringify(updated));
      saveThemeToVault(id, updatedTheme, false);
    }
  };

  return (
    <ThemeContext.Provider value={{
      activeThemeId: activeThemeIdState, setActiveThemeId, currentTheme, CORE_THEMES, setCoreThemes, customThemes, devThemes, gameThemes,
      updateActiveTheme, updateTheme, renameTheme, createNewTheme, createNewDevTheme, exportDevThemeToCustom, deleteTheme,
      useGlobalTheme: useGlobalThemeState, setUseGlobalTheme,
      importTheme: (json: any) => {
        const id = `import_${Date.now()}`;
        setCustomThemes((prev: any) => ({ ...prev, [id]: json }));
        setActiveThemeId(id);
        saveThemeToVault(id, json, false);
      }
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
