import { createContext, useContext, useState, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { mkdir, writeTextFile, writeFile, readDir, readTextFile, readFile, remove, exists } from '@tauri-apps/plugin-fs';
import { supabaseAuth } from './supabase';
import { createClient } from '@supabase/supabase-js';
import { isDesktop, isLinuxDesktop } from './utils/envUtils';
import { isRootDomain } from './utils/routingUtils';
import coreThemesJson from './data/core_themes.json';
import spokeThemesFallbackJson from './data/spoke_themes_fallback.json';
import { postDevCoreAssetSync } from './utils/devAssetSync';

import { useStore } from './store';

export const CORE_THEMES_CACHE_KEY = 'sanctuary_cached_core_themes_v1';
export const SPOKE_THEMES_CACHE_KEY = 'sanctuary_cached_spoke_themes_v1';
export const DEFAULT_CORE_THEMES: Record<string, any> = coreThemesJson as Record<string, any>;

const readCachedCoreThemes = (): Record<string, any> => {
  try {
    const raw = localStorage.getItem(CORE_THEMES_CACHE_KEY);
    if (!raw) return { ...DEFAULT_CORE_THEMES };
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return { ...DEFAULT_CORE_THEMES, ...parsed };
    }
  } catch { }
  return { ...DEFAULT_CORE_THEMES };
};

const readOfflineSpokeThemesFallback = (workspacesList: any[], wsId: string): Record<string, any> => {
  const result: Record<string, any> = {};
  try {
    const rawCached = localStorage.getItem(SPOKE_THEMES_CACHE_KEY);
    if (rawCached) {
      const parsed = JSON.parse(rawCached);
      if (parsed && typeof parsed === 'object') {
        Object.assign(result, parsed);
      }
    }
  } catch { }

  const candidateSchemaKeys = new Set<string>();
  if (wsId && wsId !== 'default' && wsId !== 'default_workspace') {
    candidateSchemaKeys.add(String(wsId).trim().toLowerCase());
  }
  for (const ws of Array.isArray(workspacesList) ? workspacesList : []) {
    if (!ws || ws.id === 'default_workspace') continue;
    if (ws.schema_id) candidateSchemaKeys.add(String(ws.schema_id).trim().toLowerCase());
    if (ws.id) candidateSchemaKeys.add(String(ws.id).trim().toLowerCase());
  }
  for (const key of candidateSchemaKeys) {
    const pack = (spokeThemesFallbackJson as Record<string, any>)[key];
    if (pack && typeof pack === 'object') {
      for (const [themeId, themeVal] of Object.entries(pack)) {
        if (!result[themeId] && !DEFAULT_CORE_THEMES[themeId]) {
          result[themeId] = { ...(themeVal as any), id: themeId };
        }
      }
    }
  }
  return result;
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
    // Sheer, crystal-clear quartz lens with a delicate 1px top-left catchlight (never a thick white border)
    const lightPanelAlpha = Math.max(0.08, Math.min(0.32, rawOpacity * 0.65));
    const lightSurfaceAlpha = Math.max(0.05, Math.min(0.24, lightPanelAlpha * 0.72));
    const lightShadowScale = Math.max(0.10, Math.min(0.28, shadowOpacity * 0.75));
    const lightSpecTop = Math.max(0.20, Math.min(0.34, specularOpacity * 0.85));

    const lBrdR = Math.round(txtR * 0.75 + accR * 0.25);
    const lBrdG = Math.round(txtG * 0.75 + accG * 0.25);
    const lBrdB = Math.round(txtB * 0.75 + accB * 0.25);

    const nestedLightR = Math.round(tr * 0.92 + txtR * 0.05 + accR * 0.03);
    const nestedLightG = Math.round(tg * 0.92 + txtG * 0.05 + accG * 0.03);
    const nestedLightB = Math.round(tb * 0.92 + txtB * 0.05 + accB * 0.03);

    vars['--glass-base-fill'] = `rgba(${tr}, ${tg}, ${tb}, ${lightPanelAlpha.toFixed(3)})`;
    vars['--glass-surface-fill'] = `rgba(${tr}, ${tg}, ${tb}, ${lightSurfaceAlpha.toFixed(3)})`;
    vars['--glass-meniscus-top'] = `radial-gradient(125% 90% at 50% -18%, rgba(255, 255, 255, ${(lightSpecTop * 0.35).toFixed(3)}) 0%, rgba(255, 255, 255, 0) 65%)`;
    vars['--glass-sheen'] = `linear-gradient(135deg, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0.05) 32%, transparent 62%)`;
    vars['--glass-surface-sheen'] = `linear-gradient(135deg, rgba(255, 255, 255, 0.18) 0%, rgba(255, 255, 255, 0.03) 34%, transparent 65%)`;
    vars['--glass-fresnel-rim'] = `linear-gradient(135deg, rgba(255, 255, 255, ${(lightSpecTop * 0.75).toFixed(3)}) 0%, rgba(${accR}, ${accG}, ${accB}, 0.08) 28%, rgba(${lBrdR}, ${lBrdG}, ${lBrdB}, 0.06) 50%, rgba(${accR}, ${accG}, ${accB}, 0.06) 72%, rgba(255, 255, 255, ${(lightSpecTop * 0.55).toFixed(3)}) 100%)`;

    // Delicate 1px crystal rim (subtle top-left catchlight, never a thick white border)
    vars['--glass-border-top'] = `rgba(255, 255, 255, 0.34)`;
    vars['--glass-border-left'] = `rgba(255, 255, 255, 0.22)`;
    vars['--glass-border-right'] = `rgba(${lBrdR}, ${lBrdG}, ${lBrdB}, 0.07)`;
    vars['--glass-border-bottom'] = `rgba(${lBrdR}, ${lBrdG}, ${lBrdB}, 0.10)`;
    vars['--glass-surface-border'] = `rgba(${lBrdR}, ${lBrdG}, ${lBrdB}, 0.08)`;

    // Subtle 1px top-left inner catchlight only
    vars['--glass-inset-highlight'] = `inset 0 1px 0.5px 0 rgba(255, 255, 255, 0.38), inset 1px 0 0.5px 0 rgba(255, 255, 255, 0.20)`;
    vars['--glass-surface-inset-highlight'] = `inset 0 1px 0.5px 0 rgba(255, 255, 255, 0.26), inset 1px 0 0.5px 0 rgba(255, 255, 255, 0.14)`;
    vars['--glass-text-shadow'] = `0 1px 1.5px rgba(255, 255, 255, 0.72)`;

    // Pure soft ambient elevation shadows
    vars['--glass-outer-shadow'] = `0 16px 34px -8px rgba(15, 23, 42, ${(lightShadowScale * 1.25).toFixed(3)}), 0 4px 12px -3px rgba(15, 23, 42, ${(lightShadowScale * 0.72).toFixed(3)})`;
    vars['--glass-surface-outer-shadow'] = `0 0 #0000`;

    const isLinux = isLinuxDesktop();

    vars['--glass-linux-panel-bg'] = `rgba(${nestedLightR}, ${nestedLightG}, ${nestedLightB}, ${Math.max(0.78, Math.min(0.88, lightPanelAlpha + 0.58)).toFixed(3)})`;
    vars['--glass-linux-surface-bg'] = `rgba(255, 255, 255, 0.58)`;

    // Nested Glass inside Cards / SidePanels / Modals (Sheer neutral frosted glass, never solid colored paint)
    vars['--glass-nested-panel-bg'] = isLinux
      ? `rgba(255, 255, 255, 0.46)`
      : `rgba(255, 255, 255, 0.22)`;
    vars['--glass-nested-surface-bg'] = isLinux
      ? `rgba(255, 255, 255, 0.34)`
      : `rgba(255, 255, 255, 0.16)`;
    vars['--glass-nested-sheen'] = `none`;
    vars['--glass-nested-shadow'] = `0 6px 16px -6px rgba(${txtR}, ${txtG}, ${txtB}, ${(lightShadowScale * 0.55).toFixed(3)})`;

    // Chrome & Containers (Sidebar, SidePanel Drawer, Floating Pills, Card Banner/Icon)
    vars['--glass-sidebar-bg'] = `rgba(${sbR}, ${sbG}, ${sbB}, ${(isLinux ? Math.max(0.82, Math.min(0.92, lightPanelAlpha + 0.60)) : Math.max(0.14, Math.min(0.42, lightPanelAlpha + 0.02))).toFixed(3)})`;
    vars['--glass-sidebar-sheen'] = `none`;
    vars['--glass-sidebar-shadow'] = `0 20px 44px -10px rgba(${txtR}, ${txtG}, ${txtB}, ${(lightShadowScale * 1.05).toFixed(3)}), 0 6px 16px -4px rgba(${txtR}, ${txtG}, ${txtB}, ${(lightShadowScale * 0.65).toFixed(3)}), inset 0 1px 0 0 rgba(255, 255, 255, 0.24)`;
    vars['--glass-drawer-bg'] = `rgba(${nestedLightR}, ${nestedLightG}, ${nestedLightB}, ${(isLinux ? Math.max(0.90, Math.min(0.96, lightPanelAlpha + 0.68)) : Math.max(0.20, Math.min(0.48, lightPanelAlpha + 0.05))).toFixed(3)})`;
    vars['--glass-drawer-sheen'] = `none`;
    vars['--glass-drawer-shadow'] = `-20px 0 50px rgba(${txtR}, ${txtG}, ${txtB}, ${(lightShadowScale * 1.10).toFixed(3)}), 0 20px 50px rgba(${txtR}, ${txtG}, ${txtB}, ${(lightShadowScale * 0.78).toFixed(3)})`;
    vars['--glass-portal-bg'] = `rgba(${nestedLightR}, ${nestedLightG}, ${nestedLightB}, ${(isLinux ? Math.max(0.86, Math.min(0.94, lightPanelAlpha + 0.64)) : Math.max(0.24, Math.min(0.54, lightPanelAlpha + 0.06))).toFixed(3)})`;
    vars['--glass-portal-sheen'] = `none`;
    vars['--glass-portal-shadow'] = `0 18px 40px -8px rgba(${txtR}, ${txtG}, ${txtB}, ${(lightShadowScale * 1.15).toFixed(3)}), 0 6px 16px -4px rgba(${txtR}, ${txtG}, ${txtB}, ${(lightShadowScale * 0.72).toFixed(3)})`;
    const ddLightR = Math.round(sbR * 0.55 + tr * 0.45);
    const ddLightG = Math.round(sbG * 0.55 + tg * 0.45);
    const ddLightB = Math.round(sbB * 0.55 + tb * 0.45);
    const ddLightAlpha = Math.max(0.86, Math.min(0.94, 0.82 + lightPanelAlpha * 0.22));
    vars['--glass-dropdown-bg'] = `rgba(${ddLightR}, ${ddLightG}, ${ddLightB}, ${ddLightAlpha.toFixed(3)})`;
    vars['--glass-dropdown-gradient'] = `none`;
    vars['--glass-dropdown-border-top'] = `rgba(255, 255, 255, 0.28)`;
    vars['--glass-dropdown-border-left'] = `rgba(255, 255, 255, 0.18)`;
    vars['--glass-dropdown-border-right'] = `rgba(${lBrdR}, ${lBrdG}, ${lBrdB}, 0.08)`;
    vars['--glass-dropdown-border-bottom'] = `rgba(${lBrdR}, ${lBrdG}, ${lBrdB}, 0.10)`;
    vars['--glass-dropdown-shadow'] = `0 22px 48px -8px rgba(${txtR}, ${txtG}, ${txtB}, ${(lightShadowScale * 1.32).toFixed(3)}), 0 8px 20px -3px rgba(${txtR}, ${txtG}, ${txtB}, ${(lightShadowScale * 0.80).toFixed(3)}), inset 0 1px 0 0 rgba(255, 255, 255, 0.24)`;
    vars['--glass-dropdown-input-bg'] = `rgba(255, 255, 255, 0.22)`;
    vars['--glass-dropdown-input-border'] = `rgba(${lBrdR}, ${lBrdG}, ${lBrdB}, 0.08)`;
    vars['--glass-dropdown-item-hover'] = `rgba(${txtR}, ${txtG}, ${txtB}, 0.05)`;
    vars['--glass-dropdown-item-active'] = `rgba(${accR}, ${accG}, ${accB}, 0.08)`;
    vars['--glass-dropdown-item-active-border'] = `rgba(${accR}, ${accG}, ${accB}, 0.28)`;
    vars['--glass-backdrop-dim'] = `rgba(${txtR}, ${txtG}, ${txtB}, 0.08)`;
    vars['--glass-card-banner-bg'] = `transparent`;
    vars['--glass-card-icon-bg'] = `rgba(255, 255, 255, 0.18)`;
    vars['--glass-card-icon-border'] = `rgba(${lBrdR}, ${lBrdG}, ${lBrdB}, 0.08)`;
    vars['--glass-card-icon-shadow'] = `inset 0 1px 0 0 rgba(255, 255, 255, 0.22)`;
    const navLightR = Math.round(tr * 0.90 + accR * 0.10);
    const navLightG = Math.round(tg * 0.90 + accG * 0.10);
    const navLightB = Math.round(tb * 0.90 + accB * 0.10);
    vars['--glass-nav-active-bg'] = `rgba(${navLightR}, ${navLightG}, ${navLightB}, 0.26)`;
    vars['--glass-nav-active-sheen'] = `none`;
    vars['--glass-nav-active-border-top'] = `rgba(255, 255, 255, 0.24)`;
    vars['--glass-nav-active-border-left'] = `rgba(255, 255, 255, 0.16)`;
    vars['--glass-nav-active-border-right'] = `rgba(${lBrdR}, ${lBrdG}, ${lBrdB}, 0.07)`;
    vars['--glass-nav-active-border-bottom'] = `rgba(${lBrdR}, ${lBrdG}, ${lBrdB}, 0.09)`;
    vars['--glass-nav-active-shadow'] = `inset 0 1px 0 0 rgba(255, 255, 255, 0.22)`;
  } else {
    // 3D Liquid Glass Optical Model for Dark Themes:
    // Pure see-through smoked crystal with delicate 1px directional catchlights (zero solid borders or opaque paint)
    const tintYiq = ((tr * 299) + (tg * 587) + (tb * 114)) / 1000;
    const isBrightTint = tintYiq >= 160;
    const darkPanelAlpha = currentTheme.bg === 'transparent'
      ? Math.max(0.05, Math.min(0.36, rawOpacity))
      : rawOpacity <= 0.22
        ? Math.max(0.05, Math.min(0.12, 0.03 + rawOpacity * 0.40))
        : Math.max(0.12, Math.min(0.42, 0.12 + (rawOpacity - 0.22) * 0.55));
    const darkSurfaceAlpha = Math.max(0.03, Number((darkPanelAlpha * 0.65).toFixed(3)));

    const baseR = isBrightTint ? Math.max(10, Math.min(22, bgR + 8)) : Math.round(tr * 0.85 + accR * 0.05);
    const baseG = isBrightTint ? Math.max(14, Math.min(28, bgG + 11)) : Math.round(tg * 0.85 + accG * 0.05);
    const baseB = isBrightTint ? Math.max(22, Math.min(38, bgB + 18)) : Math.round(tb * 0.85 + accB * 0.05);

    const dRimR = Math.round(255 * 0.88 + accR * 0.12);
    const dRimG = Math.round(255 * 0.88 + accG * 0.12);
    const dRimB = Math.round(255 * 0.88 + accB * 0.12);

    const topBorderAlpha = Math.max(0.14, Math.min(0.22, borderOpacity * 0.65));
    const leftBorderAlpha = Math.max(0.10, Math.min(0.15, borderOpacity * 0.46));
    const rightBorderAlpha = Math.max(0.04, Math.min(0.06, borderOpacity * 0.22));
    const bottomBorderAlpha = Math.max(0.05, Math.min(0.08, borderOpacity * 0.28));
    const outerShadowMain = Math.max(0.28, Math.min(0.58, shadowOpacity * 1.04));
    const outerShadowAmbient = Math.max(0.16, Math.min(0.38, shadowOpacity * 0.64));

    vars['--glass-base-fill'] = isBrightTint
      ? `rgba(255, 255, 255, ${(darkPanelAlpha * 0.50).toFixed(3)})`
      : `rgba(${baseR}, ${baseG}, ${baseB}, ${darkPanelAlpha.toFixed(3)})`;
    vars['--glass-surface-fill'] = isBrightTint
      ? `rgba(255, 255, 255, ${(darkSurfaceAlpha * 0.50).toFixed(3)})`
      : `rgba(${baseR}, ${baseG}, ${baseB}, ${darkSurfaceAlpha.toFixed(3)})`;
    vars['--glass-meniscus-top'] = `radial-gradient(125% 90% at 50% -18%, rgba(${dRimR}, ${dRimG}, ${dRimB}, 0.08) 0%, transparent 65%)`;
    vars['--glass-sheen'] = `linear-gradient(135deg, rgba(255, 255, 255, 0.085) 0%, rgba(255, 255, 255, 0.018) 32%, transparent 62%)`;
    vars['--glass-surface-sheen'] = `linear-gradient(135deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.015) 34%, transparent 64%)`;
    vars['--glass-fresnel-rim'] = `linear-gradient(135deg, rgba(${dRimR}, ${dRimG}, ${dRimB}, 0.26) 0%, rgba(255, 255, 255, 0.05) 50%, rgba(${dRimR}, ${dRimG}, ${dRimB}, 0.12) 100%)`;

    vars['--glass-border-top'] = `rgba(${dRimR}, ${dRimG}, ${dRimB}, ${topBorderAlpha.toFixed(3)})`;
    vars['--glass-border-left'] = `rgba(${dRimR}, ${dRimG}, ${dRimB}, ${leftBorderAlpha.toFixed(3)})`;
    vars['--glass-border-right'] = `rgba(255, 255, 255, ${rightBorderAlpha.toFixed(3)})`;
    vars['--glass-border-bottom'] = `rgba(255, 255, 255, ${bottomBorderAlpha.toFixed(3)})`;
    vars['--glass-surface-border'] = `rgba(255, 255, 255, 0.075)`;

    // Delicate 1px top-left inner catchlight (Dark Theme — zero 4-sided solid inset box)
    const specTop = Math.max(0.18, Math.min(0.28, specularOpacity * 0.68));
    const specLeft = Math.max(0.10, Math.min(0.16, specularOpacity * 0.40));
    vars['--glass-inset-highlight'] = `inset 0 1px 0.5px 0 rgba(${dRimR}, ${dRimG}, ${dRimB}, ${specTop.toFixed(3)}), inset 1px 0 0.5px 0 rgba(${dRimR}, ${dRimG}, ${dRimB}, ${specLeft.toFixed(3)})`;
    vars['--glass-surface-inset-highlight'] = `inset 0 1px 0.5px 0 rgba(255, 255, 255, 0.14), inset 1px 0 0.5px 0 rgba(255, 255, 255, 0.08)`;
    vars['--glass-text-shadow'] = `0 1px 2.5px rgba(0, 0, 0, 0.68), 0 0 8px rgba(0, 0, 0, 0.26)`;

    vars['--glass-outer-shadow'] = `0 18px 40px -10px rgba(0, 0, 0, ${outerShadowMain.toFixed(3)}), 0 6px 16px -4px rgba(0, 0, 0, ${outerShadowAmbient.toFixed(3)})`;
    vars['--glass-surface-outer-shadow'] = `0 0 #0000`;

    const isLinux = isLinuxDesktop();
    const linuxCardR = Math.max(8, Math.min(36, Math.round(bgR * 0.32 + baseR * 0.56 + accR * 0.08 + 2)));
    const linuxCardG = Math.max(12, Math.min(44, Math.round(bgG * 0.32 + baseG * 0.56 + accG * 0.08 + 4)));
    const linuxCardB = Math.max(22, Math.min(62, Math.round(bgB * 0.32 + baseB * 0.56 + accB * 0.10 + 8)));

    vars['--glass-linux-panel-bg'] = `rgba(${linuxCardR}, ${linuxCardG}, ${linuxCardB}, ${Math.max(0.74, Math.min(0.84, darkPanelAlpha + 0.66)).toFixed(3)})`;
    vars['--glass-linux-surface-bg'] = `rgba(${linuxCardR}, ${linuxCardG}, ${linuxCardB}, ${Math.max(0.58, Math.min(0.72, darkSurfaceAlpha + 0.52)).toFixed(3)})`;

    // Pure neutral ultra-sheer glass for nested surfaces inside cards/sidebars (never solid accent paint)
    vars['--glass-nested-panel-bg'] = isLinux
      ? `rgba(255, 255, 255, 0.055)`
      : `rgba(255, 255, 255, 0.032)`;
    vars['--glass-nested-surface-bg'] = isLinux
      ? `rgba(255, 255, 255, 0.042)`
      : `rgba(255, 255, 255, 0.024)`;
    vars['--glass-nested-sheen'] = `none`;
    vars['--glass-nested-shadow'] = `0 8px 20px -6px rgba(0, 0, 0, ${(outerShadowAmbient * 0.65).toFixed(3)})`;

    const sbGlassR = Math.max(6, Math.min(36, Math.round(sbR * 0.88 + accR * 0.04 + 2)));
    const sbGlassG = Math.max(8, Math.min(42, Math.round(sbG * 0.88 + accG * 0.04 + 3)));
    const sbGlassB = Math.max(12, Math.min(54, Math.round(sbB * 0.88 + accB * 0.04 + 6)));
    vars['--glass-sidebar-bg'] = `rgba(${sbGlassR}, ${sbGlassG}, ${sbGlassB}, ${(isLinux ? Math.max(0.82, Math.min(0.90, darkPanelAlpha + 0.72)) : Math.max(0.12, Math.min(0.38, darkPanelAlpha + 0.02))).toFixed(3)})`;
    vars['--glass-sidebar-sheen'] = `none`;
    vars['--glass-sidebar-shadow'] = `0 22px 48px -10px rgba(0, 0, 0, ${(outerShadowMain * 1.08).toFixed(3)}), 0 8px 20px -4px rgba(0, 0, 0, ${outerShadowAmbient.toFixed(3)}), inset 0 1px 0 0 rgba(${dRimR}, ${dRimG}, ${dRimB}, ${specTop.toFixed(3)})`;
    vars['--glass-drawer-bg'] = `rgba(${linuxCardR}, ${linuxCardG}, ${linuxCardB}, ${(isLinux ? Math.max(0.90, Math.min(0.96, darkPanelAlpha + 0.80)) : Math.max(0.18, Math.min(0.48, darkPanelAlpha + 0.08))).toFixed(3)})`;
    vars['--glass-drawer-sheen'] = `none`;
    vars['--glass-drawer-shadow'] = `-24px 0 60px rgba(0, 0, 0, ${(outerShadowMain * 1.08).toFixed(3)}), 0 24px 60px rgba(0, 0, 0, ${(outerShadowMain * 0.85).toFixed(3)})`;
    vars['--glass-portal-bg'] = `rgba(${linuxCardR}, ${linuxCardG}, ${linuxCardB}, ${(isLinux ? Math.max(0.86, Math.min(0.94, darkPanelAlpha + 0.76)) : Math.max(0.24, Math.min(0.56, darkPanelAlpha + 0.16))).toFixed(3)})`;
    vars['--glass-portal-sheen'] = `none`;
    vars['--glass-portal-shadow'] = `0 20px 42px -6px rgba(0, 0, 0, ${(outerShadowMain * 1.10).toFixed(3)}), 0 8px 18px -2px rgba(0, 0, 0, ${outerShadowAmbient.toFixed(3)})`;
    const ddDarkR = Math.round(sbGlassR * 0.55 + baseR * 0.45);
    const ddDarkG = Math.round(sbGlassG * 0.55 + baseG * 0.45);
    const ddDarkB = Math.round(sbGlassB * 0.55 + baseB * 0.45);
    const ddDarkAlpha = Math.max(0.84, Math.min(0.92, 0.80 + darkPanelAlpha * 0.25));
    vars['--glass-dropdown-bg'] = `rgba(${ddDarkR}, ${ddDarkG}, ${ddDarkB}, ${ddDarkAlpha.toFixed(3)})`;
    vars['--glass-dropdown-gradient'] = `none`;
    vars['--glass-dropdown-border-top'] = `rgba(${dRimR}, ${dRimG}, ${dRimB}, 0.14)`;
    vars['--glass-dropdown-border-left'] = `rgba(${dRimR}, ${dRimG}, ${dRimB}, 0.10)`;
    vars['--glass-dropdown-border-right'] = `rgba(255, 255, 255, 0.05)`;
    vars['--glass-dropdown-border-bottom'] = `rgba(255, 255, 255, 0.07)`;
    vars['--glass-dropdown-shadow'] = `0 24px 52px -8px rgba(0, 0, 0, ${(outerShadowMain * 1.20).toFixed(3)}), 0 10px 24px -4px rgba(0, 0, 0, ${(outerShadowAmbient * 1.05).toFixed(3)}), inset 0 1px 0 0 rgba(${dRimR}, ${dRimG}, ${dRimB}, 0.12)`;
    vars['--glass-dropdown-input-bg'] = `rgba(255, 255, 255, 0.04)`;
    vars['--glass-dropdown-input-border'] = `rgba(255, 255, 255, 0.08)`;
    vars['--glass-dropdown-item-hover'] = `rgba(255, 255, 255, 0.05)`;
    vars['--glass-dropdown-item-active'] = `rgba(${accR}, ${accG}, ${accB}, 0.09)`;
    vars['--glass-dropdown-item-active-border'] = `rgba(${accR}, ${accG}, ${accB}, 0.32)`;
    vars['--glass-backdrop-dim'] = `rgba(0, 0, 0, 0.22)`;
    vars['--glass-card-banner-bg'] = `transparent`;
    vars['--glass-card-icon-bg'] = `rgba(255, 255, 255, 0.032)`;
    vars['--glass-card-icon-border'] = `rgba(255, 255, 255, 0.07)`;
    vars['--glass-card-icon-shadow'] = `inset 0 1px 0 0 rgba(255, 255, 255, 0.09)`;
    vars['--glass-nav-active-bg'] = `rgba(255, 255, 255, 0.055)`;
    vars['--glass-nav-active-sheen'] = `none`;
    vars['--glass-nav-active-border-top'] = `rgba(${dRimR}, ${dRimG}, ${dRimB}, 0.14)`;
    vars['--glass-nav-active-border-left'] = `rgba(${dRimR}, ${dRimG}, ${dRimB}, 0.10)`;
    vars['--glass-nav-active-border-right'] = `rgba(255, 255, 255, 0.04)`;
    vars['--glass-nav-active-border-bottom'] = `rgba(255, 255, 255, 0.06)`;
    vars['--glass-nav-active-shadow'] = `inset 0 1px 0 0 rgba(${dRimR}, ${dRimG}, ${dRimB}, 0.10)`;
  }

  return vars;
}

const GLASS_OPTICS_REV = "rev_74";

const BUILTIN_WALLPAPER_BAR_PALETTES: Record<string, { topHex: string; bottomHex: string }> = {
  '/themes/architect.png': { topHex: '#1d2737', bottomHex: '#0e2244' },
  '/themes/aurora.png': { topHex: '#0c353d', bottomHex: '#0e2229' },
  '/themes/bunker.png': { topHex: '#365345', bottomHex: '#192e21' },
  '/themes/dracula.png': { topHex: '#211632', bottomHex: '#262646' },
  '/themes/radiant.png': { topHex: '#dfe5f2', bottomHex: '#d8deec' },
  '/themes/synthwave.png': { topHex: '#141236', bottomHex: '#291d48' },
};

const rgbToHex = (r: number, g: number, b: number): string => {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;
};

export function harmonizeBarColorWithTheme(
  rawR: number,
  rawG: number,
  rawB: number,
  themeObj: any,
  isBottom = false
): string {
  const [bgR, bgG, bgB] = parseHexToRgb(themeObj?.bg || '#0d1526', [13, 21, 38]);
  const [sbR, sbG, sbB] = parseHexToRgb(themeObj?.sidebar || themeObj?.bg || '#0f192d', [bgR, bgG, bgB]);
  const [ptR, ptG, ptB] = parseHexToRgb(themeObj?.panelTint || themeObj?.sidebar || '#16243d', [sbR, sbG, sbB]);
  const [accR, accG, accB] = parseHexToRgb(themeObj?.accent || '#38bdf8', [56, 189, 248]);
  const [txtR, txtG, txtB] = parseHexToRgb(themeObj?.text || '#ffffff', [255, 255, 255]);

  const bgYiq = (bgR * 299 + bgG * 587 + bgB * 114) / 1000;
  const txtYiq = (txtR * 299 + txtG * 587 + txtB * 114) / 1000;
  const isLight = bgYiq >= 128 || txtYiq < 115;

  const anchorR = isBottom ? sbR * 0.55 + ptR * 0.25 + accR * 0.20 : ptR * 0.55 + sbR * 0.25 + accR * 0.20;
  const anchorG = isBottom ? sbG * 0.55 + ptG * 0.25 + accG * 0.20 : ptG * 0.55 + sbG * 0.25 + accG * 0.20;
  const anchorB = isBottom ? sbB * 0.55 + ptB * 0.25 + accB * 0.20 : ptB * 0.55 + sbB * 0.25 + accB * 0.20;

  let r = rawR;
  let g = rawG;
  let b = rawB;
  const lum = (r * 299 + g * 587 + b * 114) / 1000;

  if (!isLight) {
    // Prevent near-black (#000000) bars on dark themes by lifting into the theme's chromatic surface/accent harmony
    const minLum = 22;
    if (lum < minLum) {
      const liftR = Math.max(16, anchorR * 0.72 + accR * 0.28);
      const liftG = Math.max(20, anchorG * 0.72 + accG * 0.28);
      const liftB = Math.max(30, anchorB * 0.72 + accB * 0.28);
      const mix = Math.min(0.65, Math.max(0.28, (minLum - lum) / minLum));
      r = r * (1 - mix) + liftR * mix;
      g = g * (1 - mix) + liftG * mix;
      b = b * (1 - mix) + liftB * mix;
    }
  } else {
    // Prevent stark pure-white (#ffffff) bars on light themes by toning into the theme's atmospheric tint
    const maxLum = 230;
    if (lum > maxLum) {
      const toneR = Math.min(232, anchorR * 0.78 + accR * 0.22);
      const toneG = Math.min(236, anchorG * 0.78 + accG * 0.22);
      const toneB = Math.min(244, anchorB * 0.78 + accB * 0.22);
      const mix = Math.min(0.65, Math.max(0.28, (lum - maxLum) / (255 - maxLum)));
      r = r * (1 - mix) + toneR * mix;
      g = g * (1 - mix) + toneG * mix;
      b = b * (1 - mix) + toneB * mix;
    }
  }

  return rgbToHex(r, g, b);
}

export function resolveThemeDominantBarColors(themeObj: any): { topHex: string; bottomHex: string } {
  if (
    typeof themeObj?.topBarHex === 'string' &&
    /^#[0-9a-fA-F]{6}$/.test(themeObj.topBarHex.trim()) &&
    typeof themeObj?.bottomBarHex === 'string' &&
    /^#[0-9a-fA-F]{6}$/.test(themeObj.bottomBarHex.trim())
  ) {
    return { topHex: themeObj.topBarHex.trim(), bottomHex: themeObj.bottomBarHex.trim() };
  }
  const bgImg = typeof themeObj?.bgImage === 'string' ? themeObj.bgImage.trim().split('?')[0] : '';
  if (bgImg && BUILTIN_WALLPAPER_BAR_PALETTES[bgImg]) {
    return BUILTIN_WALLPAPER_BAR_PALETTES[bgImg];
  }

  const [bgR, bgG, bgB] = parseHexToRgb(themeObj?.bg || '#0d1526', [13, 21, 38]);
  const [sbR, sbG, sbB] = parseHexToRgb(themeObj?.sidebar || themeObj?.bg || '#0f192d', [bgR, bgG, bgB]);
  const [ptR, ptG, ptB] = parseHexToRgb(themeObj?.panelTint || themeObj?.sidebar || '#16243d', [sbR, sbG, sbB]);
  const [accR, accG, accB] = parseHexToRgb(themeObj?.accent || '#38bdf8', [56, 189, 248]);

  let orbTopR = ptR;
  let orbTopG = ptG;
  let orbTopB = ptB;
  let orbBotR = sbR;
  let orbBotG = sbG;
  let orbBotB = sbB;

  if (Array.isArray(themeObj?.volumetricOrbs) && themeObj.volumetricOrbs.length > 0) {
    const firstOrb = themeObj.volumetricOrbs[0];
    const lastOrb = themeObj.volumetricOrbs[themeObj.volumetricOrbs.length - 1];
    if (firstOrb?.color) {
      [orbTopR, orbTopG, orbTopB] = parseHexToRgb(firstOrb.color, [ptR, ptG, ptB]);
    }
    if (lastOrb?.color) {
      [orbBotR, orbBotG, orbBotB] = parseHexToRgb(lastOrb.color, [sbR, sbG, sbB]);
    }
  }

  const rawTopR = bgR * 0.42 + ptR * 0.30 + orbTopR * 0.16 + accR * 0.12;
  const rawTopG = bgG * 0.42 + ptG * 0.30 + orbTopG * 0.16 + accG * 0.12;
  const rawTopB = bgB * 0.42 + ptB * 0.30 + orbTopB * 0.16 + accB * 0.12;

  const rawBotR = bgR * 0.44 + sbR * 0.30 + orbBotR * 0.14 + accR * 0.12;
  const rawBotG = bgG * 0.44 + sbG * 0.30 + orbBotG * 0.14 + accG * 0.12;
  const rawBotB = bgB * 0.44 + sbB * 0.30 + orbBotB * 0.14 + accB * 0.12;

  return {
    topHex: harmonizeBarColorWithTheme(rawTopR, rawTopG, rawTopB, themeObj, false),
    bottomHex: harmonizeBarColorWithTheme(rawBotR, rawBotG, rawBotB, themeObj, true),
  };
}

let cachedEdgeToEdgeSupport: { topEdgeToEdge: boolean; bottomEdgeToEdge: boolean } | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener(
    'resize',
    () => {
      cachedEdgeToEdgeSupport = null;
    },
    { passive: true }
  );
}

function measureMobileEdgeToEdgeSupport(): { topEdgeToEdge: boolean; bottomEdgeToEdge: boolean } {
  if (typeof window === 'undefined' || typeof document === 'undefined' || isDesktop()) {
    return { topEdgeToEdge: false, bottomEdgeToEdge: false };
  }
  if (cachedEdgeToEdgeSupport) {
    return cachedEdgeToEdgeSupport;
  }
  const ua = navigator.userAgent || '';
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isMobileViewport =
    isIos ||
    /Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua) ||
    window.innerWidth < 768;
  if (!isMobileViewport) {
    cachedEdgeToEdgeSupport = { topEdgeToEdge: false, bottomEdgeToEdge: false };
    return cachedEdgeToEdgeSupport;
  }
  const isIosStandalone =
    isIos &&
    Boolean(
      (window.navigator as any)?.standalone === true ||
        window.matchMedia?.('(display-mode: standalone)')?.matches
    );

  let probe = document.getElementById('sa-safe-area-probe');
  if (!probe && document.documentElement) {
    probe = document.createElement('div');
    probe.id = 'sa-safe-area-probe';
    probe.style.cssText =
      'position:fixed;top:0;left:0;width:0;height:0;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);pointer-events:none;visibility:hidden;z-index:-1;';
    document.documentElement.appendChild(probe);
  }
  let safeTop = 0;
  let safeBottom = 0;
  if (probe) {
    const cs = window.getComputedStyle(probe);
    safeTop = parseFloat(cs.paddingTop || '0') || 0;
    safeBottom = parseFloat(cs.paddingBottom || '0') || 0;
  }

  cachedEdgeToEdgeSupport = {
    topEdgeToEdge: isIosStandalone || safeTop > 2,
    bottomEdgeToEdge: isIosStandalone || safeBottom > 2,
  };
  return cachedEdgeToEdgeSupport;
}

export function applyDominantSystemBarColors(
  topHex: string,
  bottomHex: string,
  isPassthrough = false,
  desktopFallbackBg?: string
): void {
  if (typeof document === 'undefined') return;
  const { topEdgeToEdge, bottomEdgeToEdge } = measureMobileEdgeToEdgeSupport();
  const root = document.documentElement;
  root.style.setProperty('--sa-top-bar-blend', topHex);
  root.style.setProperty('--sa-bottom-bar-blend', bottomHex);
  root.setAttribute('data-sa-top-e2e', topEdgeToEdge ? 'true' : 'false');
  root.setAttribute('data-sa-bottom-e2e', bottomEdgeToEdge ? 'true' : 'false');

  if (isDesktop()) {
    const deskBg = isPassthrough ? 'transparent' : desktopFallbackBg || topHex;
    root.style.backgroundColor = deskBg;
    if (document.body) {
      document.body.style.backgroundColor = deskBg;
    }
    return;
  }

  let themeColorMeta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
  if (topEdgeToEdge) {
    if (themeColorMeta) {
      themeColorMeta.remove();
    }
  } else {
    if (!themeColorMeta && document.head) {
      themeColorMeta = document.createElement('meta');
      themeColorMeta.name = 'theme-color';
      document.head.appendChild(themeColorMeta);
    }
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', topHex);
    }
  }

  const resolvedBottomBg = bottomEdgeToEdge ? 'transparent' : bottomHex;
  root.style.backgroundColor = resolvedBottomBg;
  if (document.body) {
    document.body.style.backgroundColor = resolvedBottomBg;
  }
}

const ALLOWED_THEME_TOKEN_KEYS = new Set<string>([
  ...Object.keys(DEFAULT_CORE_THEMES.architect),
  'id',
  'name',
  'badge',
  'badgeKey',
  'theme_mode',
  'textCase',
  'transparentWindow',
  'scanlines',
  'bgImage',
  'bgThumb',
  'bgRemoteUrl',
  'bgImageFile',
  'previewImage',
  'previewImageFile',
  'bgGradient',
  'topBarHex',
  'bottomBarHex',
]);

function isPrivateOrLoopbackHostname(hostname: string): boolean {
  const host = String(hostname || '').trim().toLowerCase();
  if (!host) return true;
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.lan')
  ) {
    return true;
  }
  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, aStr, bStr] = ipv4Match;
    const a = Number(aStr);
    const b = Number(bStr);
    if (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 192 && b === 168) ||
      (a === 172 && b >= 16 && b <= 31)
    ) {
      return true;
    }
  }
  return false;
}

export function sanitizeThemeBgImageUrl(rawInput: unknown): string {
  if (typeof rawInput !== 'string') return '';
  const trimmed = rawInput.trim().replace(/[\r\n\0]/g, '');
  if (!trimmed || trimmed === 'none' || trimmed === 'transparent') return '';

  // Allow bundled relative theme wallpapers (/themes/...)
  if (/^\/themes\/[A-Za-z0-9._/?=&-]+$/.test(trimmed) && !trimmed.includes('..')) {
    return trimmed;
  }

  // Allow raster base64 data URIs (block SVG to prevent embedded script payloads)
  if (/^data:image\/(?:png|jpeg|jpg|webp|gif|avif);base64,[A-Za-z0-9+/=\s]+$/i.test(trimmed)) {
    return trimmed.replace(/\s+/g, '');
  }

  // Allow Tauri local asset protocol
  if (/^asset:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+$/i.test(trimmed)) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    // Allow Tauri v2 Windows/macOS asset bridge (asset.localhost)
    if (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      host === 'asset.localhost'
    ) {
      return parsed.toString();
    }
    // Block all non-HTTPS schemes (especially http: LAN SSRF beacons) and private/loopback IPs
    if (parsed.protocol !== 'https:' || isPrivateOrLoopbackHostname(host)) {
      return '';
    }
    return parsed.toString();
  } catch {
    return '';
  }
}

export function encodeCssUrlValue(safeUrl: string): string {
  if (!safeUrl) return 'none';
  const escaped = safeUrl
    .replace(/\\/g, '%5C')
    .replace(/"/g, '%22')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/[\r\n]/g, '');
  return `url("${escaped}")`;
}

export function isSafeNonImageCssTokenValue(rawVal: unknown): boolean {
  if (rawVal === null || rawVal === undefined) return false;
  if (typeof rawVal === 'boolean' || typeof rawVal === 'number') return true;
  if (typeof rawVal !== 'string') return false;
  if (rawVal.length > 512) return false;
  // Reject url(...), CSS statement/block terminators, escapes, HTML tags, and legacy expressions
  if (/(?:url\s*\(|@import|expression\s*\(|javascript:|;[^{}]*|[{}<>\\]|\/\*|\*\/)/i.test(rawVal)) {
    return false;
  }
  return true;
}

export function sanitizeThemeObject<T extends Record<string, any>>(rawTheme: T): T {
  if (!rawTheme || typeof rawTheme !== 'object') return {} as T;
  const clean: Record<string, any> = {};
  for (const [key, val] of Object.entries(rawTheme)) {
    if (!ALLOWED_THEME_TOKEN_KEYS.has(key) || !/^[a-zA-Z0-9_-]+$/.test(key)) {
      continue;
    }
    if (val === undefined || val === null) continue;
    if (
      key === 'name' ||
      key === 'id' ||
      key === 'badge' ||
      key === 'badgeKey' ||
      key === 'bgImageFile' ||
      key === 'previewImageFile'
    ) {
      clean[key] = String(val).slice(0, 160);
      continue;
    }
    if (
      key === 'bgImage' ||
      key === 'bgThumb' ||
      key === 'bgRemoteUrl' ||
      key === 'previewImage'
    ) {
      const sanitizedUrl = sanitizeThemeBgImageUrl(val);
      if (sanitizedUrl || key === 'bgImage') {
        clean[key] = sanitizedUrl;
      }
      continue;
    }
    if (isSafeNonImageCssTokenValue(val)) {
      clean[key] = val;
    }
  }
  return clean as T;
}

export function applyThemeCssVarsToRoot(themeObj: any): 'light' | 'dark' {
  if (!themeObj || typeof document === 'undefined') return 'dark';
  const root = document.documentElement;
  const safeTheme = sanitizeThemeObject(themeObj);
  Object.entries(safeTheme).forEach(([key, val]) => {
    if (
      key !== 'name' &&
      key !== 'id' &&
      key !== 'badge' &&
      key !== 'badgeKey' &&
      key !== 'bgImage' &&
      key !== 'bgThumb' &&
      key !== 'bgRemoteUrl' &&
      key !== 'bgImageFile' &&
      key !== 'previewImage' &&
      key !== 'previewImageFile' &&
      key !== 'bgGradient' &&
      /^[a-z0-9-]+$/i.test(key) &&
      val !== undefined &&
      val !== null
    ) {
      let finalVal = String(val);
      if (!isSafeNonImageCssTokenValue(finalVal)) return;
      if (key === 'glassOpacity' && finalVal.endsWith('%')) {
        finalVal = (parseFloat(finalVal) / 100).toString();
      }
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
  });

  const opticalVars = computeGlassOpticalVars(safeTheme);
  Object.entries(opticalVars).forEach(([k, v]) => {
    if (isSafeNonImageCssTokenValue(v)) {
      root.style.setProperty(k, v);
    }
  });
  const allowedTextCases = new Set(['capitalize', 'uppercase', 'lowercase', 'none']);
  const resolvedTextCase = allowedTextCases.has(String(safeTheme.textCase || '').toLowerCase())
    ? String(safeTheme.textCase).toLowerCase()
    : 'capitalize';
  root.style.setProperty('--textCase', resolvedTextCase);
  root.setAttribute('data-text-case', resolvedTextCase);

  const rawBgImage = sanitizeThemeBgImageUrl(safeTheme.bgImage);
  const canUsePassthrough =
    isDesktop() ||
    (typeof window !== 'undefined' && window.location.search.includes('lab_overlay=1'));
  const isTransparentPassthrough =
    canUsePassthrough &&
    !rawBgImage &&
    (safeTheme.bg === 'transparent' || Boolean(safeTheme.transparentWindow));
  const fallbackThemeColor =
    safeTheme.bg && safeTheme.bg !== '#000000' && safeTheme.bg !== 'transparent'
      ? safeTheme.bg
      : safeTheme.panelTint && safeTheme.panelTint !== '#000000' && safeTheme.panelTint !== 'transparent'
        ? safeTheme.panelTint
        : safeTheme.sidebar && safeTheme.sidebar !== '#000000' && safeTheme.sidebar !== 'transparent'
          ? safeTheme.sidebar
          : '#040812';
  const safeBg = isTransparentPassthrough ? 'transparent' : fallbackThemeColor;
  const { topHex, bottomHex } = resolveThemeDominantBarColors(safeTheme);
  root.style.setProperty('--bg', safeBg);
  const resolvedBgImage =
    rawBgImage.startsWith('/themes/') && !rawBgImage.includes('?')
      ? `${rawBgImage}?v=liquid_v22`
      : rawBgImage;
  const bootBgImg = resolvedBgImage ? encodeCssUrlValue(resolvedBgImage) : 'none';
  root.style.setProperty('--boot-bg-image', bootBgImg);
  root.style.backgroundImage = bootBgImg;

  if (resolvedBgImage) {
    root.style.setProperty('--bgGradient', bootBgImg);
  } else if (
    safeTheme.bgGradient &&
    safeTheme.bgGradient !== 'transparent' &&
    safeTheme.bgGradient !== 'none' &&
    safeTheme.bgGradient !== safeTheme.bg &&
    isSafeNonImageCssTokenValue(safeTheme.bgGradient)
  ) {
    root.style.setProperty('--bgGradient', safeTheme.bgGradient);
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
    document.body.style.colorScheme = colorScheme;
  }
  applyDominantSystemBarColors(topHex, bottomHex, isTransparentPassthrough, safeBg);
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
    let targetMap: Record<string, any> = map || {};
    if (isDesktop() && targetMap && typeof targetMap === 'object') {
      const compact: Record<string, any> = {};
      for (const [k, th] of Object.entries(targetMap)) {
        if (
          th &&
          typeof th === 'object' &&
          typeof th.bgImageFile === 'string' &&
          th.bgImageFile.trim() !== '' &&
          typeof th.bgImage === 'string' &&
          th.bgImage.startsWith('data:image/') &&
          th.bgImage.length > 16384
        ) {
          compact[k] = {
            ...th,
            bgImage: typeof th.bgRemoteUrl === 'string' ? th.bgRemoteUrl : '',
          };
        } else {
          compact[k] = th;
        }
      }
      targetMap = compact;
    }
    const serialized = JSON.stringify(targetMap);
    localStorage.setItem(`sanctuary_global_${suffix}`, serialized);
    localStorage.setItem(`sanctuary_${wsId}_${suffix}`, serialized);
  } catch {}
}

export const ThemeProvider = ({ children }: any) => {
  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);
  const workspaces = useStore((state) => state.workspaces) || [];
  const osRole = useStore((state) => state.osRole);
  const isWebHubRoot = !isDesktop() && isRootDomain();
  const wsId = isWebHubRoot
    ? 'default_workspace'
    : (activeWorkspaceId || localStorage.getItem('sanctuary_last_active_workspace') || 'default');

  const [useGlobalThemeState, setUseGlobalThemeState] = useState(() => localStorage.getItem('sanctuary_use_global_theme') === 'true');
  const [CORE_THEMES, setCoreThemes] = useState<any>(() => readCachedCoreThemes());
  const [gameThemes, setGameThemes] = useState<any>(() => readOfflineSpokeThemesFallback(workspaces, wsId));
  const [customThemes, setCustomThemes] = useState(() => readSharedThemeMap(wsId, 'custom_themes'));
  const [devThemes, setDevThemes] = useState(() => readSharedThemeMap(wsId, 'dev_themes'));
  const [activeThemeIdState, setActiveThemeIdState] = useState(() => {
    if (localStorage.getItem('sanctuary_use_global_theme') === 'true') {
      return localStorage.getItem('sanctuary_global_theme') || "architect";
    }
    return localStorage.getItem(`sanctuary_${wsId}_active_theme`) || "architect";
  });
  const [previewThemeState, setPreviewThemeState] = useState<{
    id: string;
    name: string;
    data: any;
  } | null>(null);

  const setUseGlobalTheme = useCallback((val: boolean) => {
    setUseGlobalThemeState(val);
    localStorage.setItem('sanctuary_use_global_theme', String(val));
    if (val) {
      setActiveThemeIdState(localStorage.getItem('sanctuary_global_theme') || "architect");
    } else {
      setActiveThemeIdState(localStorage.getItem(`sanctuary_${wsId}_active_theme`) || "architect");
    }
  }, [wsId]);

  const setActiveThemeId = useCallback((id: string) => {
    setPreviewThemeState(null);
    (window as any).__sanctuaryPreviewTheme = null;
    setActiveThemeIdState(id);
    if (useGlobalThemeState) {
      localStorage.setItem('sanctuary_global_theme', id);
    } else {
      localStorage.setItem(`sanctuary_${wsId}_active_theme`, id);
    }
  }, [useGlobalThemeState, wsId]);

  useEffect(() => {
    const nextCustoms = readSharedThemeMap(wsId, 'custom_themes');
    const nextDevs = readSharedThemeMap(wsId, 'dev_themes');
    setCustomThemes((prev) => (JSON.stringify(prev) === JSON.stringify(nextCustoms) ? prev : nextCustoms));
    setDevThemes((prev) => (JSON.stringify(prev) === JSON.stringify(nextDevs) ? prev : nextDevs));
    if (!useGlobalThemeState) {
      const nextId = localStorage.getItem(`sanctuary_${wsId}_active_theme`) || "architect";
      setActiveThemeIdState((prev) => (prev === nextId ? prev : nextId));
    }
  }, [wsId, useGlobalThemeState]);

  useEffect(() => {
    const fetchCoreThemes = async () => {
      try {
        if (!navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true") return;

        // Pull Core OS Themes from Keepers Core Hub for ALL users; src/data/core_themes.json is strictly offline fallback.
        const { data, error } = await supabaseAuth.from('sanctuary_themes').select('*');
        if (error) throw error;
        if (data && data.length > 0) {
          const fetchedThemes: Record<string, any> = { ...DEFAULT_CORE_THEMES };
          const cloudIds = new Set<string>();
          data.forEach((row: any) => {
            if (!row?.id || row.id === 'theme_1788994757269') return;
            cloudIds.add(row.id);
            const isBuiltinCore = Boolean(DEFAULT_CORE_THEMES[row.id]);
            const sanitized = sanitizeThemeObject(row.theme_data || {});
            fetchedThemes[row.id] = {
              ...(isBuiltinCore ? DEFAULT_CORE_THEMES[row.id] : {}),
              ...sanitized,
              id: row.id,
              name: row.name || DEFAULT_CORE_THEMES[row.id]?.name || row.id,
              ...(isBuiltinCore ? {} : { badgeKey: "badge_community_defaults" }),
            };
          });

          try {
            localStorage.setItem(CORE_THEMES_CACHE_KEY, JSON.stringify(fetchedThemes));
          } catch { }
          setCoreThemes(fetchedThemes);

          if (import.meta.env.DEV) {
            const isKeeper = useStore.getState().osRole === 'keeper';
            if (isKeeper) {
              for (const [coreId, coreData] of Object.entries(DEFAULT_CORE_THEMES)) {
                if (!cloudIds.has(coreId)) {
                  await supabaseAuth.from('sanctuary_themes').upsert({
                    id: coreId,
                    name: coreData?.name || coreId,
                    version: 1,
                    theme_data: coreData,
                    updated_at: new Date().toISOString(),
                  } as any);
                }
              }
            }
            const diskCoreMap: Record<string, any> = {};
            for (const coreId of Object.keys(DEFAULT_CORE_THEMES)) {
              if (fetchedThemes[coreId]) {
                const { id: _omitId, badgeKey: _omitBadgeKey, ...cleanTheme } = fetchedThemes[coreId];
                diskCoreMap[coreId] = cleanTheme;
              }
            }
            if (Object.keys(diskCoreMap).length > 0) {
              await postDevCoreAssetSync({
                kind: 'core_themes',
                content: diskCoreMap,
              });
            }
          }
        }
      } catch (err) {
        console.error("Failed to fetch Core Hub themes", err);
      }
    };
    fetchCoreThemes();
  }, [osRole]);

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
        if (!navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true") {
          setGameThemes(readOfflineSpokeThemesFallback(workspaces, wsId));
          return;
        }

        const isKeeper = osRole === 'keeper';
        const fetchedGameThemes: Record<string, any> = {};
        const queriedUrls = new Set<string>();
        const keepersOnlyUrls = new Set<string>();
        const targets: Array<{ url: string; anonKey: string; suffix: string; badge: string; schemaKey: string }> = [];

        // 1. Collect registered Spoke databases from Core Hub (`supabaseAuth`)
        try {
          const { data: publicGames } = await supabaseAuth
            .from('sanctuary_games')
            .select('id, name, schema_id, supabase_url, supabase_anon_key, icon, is_active, is_keepers_only')
            .eq('is_active', true);
          if (Array.isArray(publicGames)) {
            for (const game of publicGames) {
              if (!isValidHttpUrl(game.supabase_url) || !game.supabase_anon_key) continue;
              const cleanUrl = game.supabase_url.trim().replace(/\/+$/, '');
              if (game.is_keepers_only === true && !isKeeper) {
                keepersOnlyUrls.add(cleanUrl);
                continue;
              }
              if (queriedUrls.has(cleanUrl)) continue;
              queriedUrls.add(cleanUrl);
              targets.push({
                url: cleanUrl,
                anonKey: game.supabase_anon_key,
                suffix: String(game.id || game.name || 'game'),
                badge: game.name || 'Community',
                schemaKey: String(game.schema_id || '').trim().toLowerCase(),
              });
            }
          }
        } catch (err) {
          console.warn('Failed to fetch Spoke databases from Core Hub', err);
        }

        // 2. Collect user Workspace Spoke overrides (respecting Keepers-only visibility)
        for (const ws of workspaces) {
          if (ws.id === 'default_workspace' || !isValidHttpUrl(ws.supabase_url) || !ws.supabase_anon_key) continue;
          if (ws.is_keepers_only === true && !isKeeper) continue;
          const cleanUrl = ws.supabase_url.trim().replace(/\/+$/, '');
          if (keepersOnlyUrls.has(cleanUrl) && !isKeeper) continue;
          if (queriedUrls.has(cleanUrl)) continue;
          queriedUrls.add(cleanUrl);
          targets.push({
            url: cleanUrl,
            anonKey: ws.supabase_anon_key,
            suffix: String(ws.id || 'ws'),
            badge: ws.name || ws.display_name || 'Community',
            schemaKey: String(ws.schema_id || ws.id || '').trim().toLowerCase(),
          });
        }

        // Parallelize all Spoke theme queries with Promise.allSettled (NO dev auto-sync for Spokes)
        const settled = await Promise.allSettled(
          targets.map(async (target) => {
            const client = getReadOnlyThemeClient(target.url, target.anonKey, target.suffix);
            const { data, error } = await client.from('sanctuary_themes').select('*');
            if (error || !Array.isArray(data)) return { badge: target.badge, schemaKey: target.schemaKey, rows: [] };
            return { badge: target.badge, schemaKey: target.schemaKey, rows: data };
          })
        );

        for (const res of settled) {
          if (res.status !== 'fulfilled') continue;
          const { badge, schemaKey, rows } = res.value;
          if (rows.length === 0 && schemaKey && (spokeThemesFallbackJson as Record<string, any>)[schemaKey]) {
            for (const [fId, fTheme] of Object.entries((spokeThemesFallbackJson as Record<string, any>)[schemaKey])) {
              if (!DEFAULT_CORE_THEMES[fId]) {
                fetchedGameThemes[fId] = { ...(fTheme as any), id: fId, badge: (fTheme as any)?.badge || badge };
              }
            }
            continue;
          }
          for (const row of rows) {
            if (!row?.id || row.id === 'theme_1788994757269') continue;
            if (!DEFAULT_CORE_THEMES[row.id]) {
              const sanitized = sanitizeThemeObject(row.theme_data || {});
              fetchedGameThemes[row.id] = {
                ...sanitized,
                id: row.id,
                name: row.name,
                badge: sanitized.badge || badge,
              };
            }
          }
        }

        if (Object.keys(fetchedGameThemes).length > 0) {
          try {
            localStorage.setItem(SPOKE_THEMES_CACHE_KEY, JSON.stringify(fetchedGameThemes));
          } catch { }
          setGameThemes(fetchedGameThemes);
        } else {
          setGameThemes(readOfflineSpokeThemesFallback(workspaces, wsId));
        }
      } catch (err) {
        console.error("Failed to fetch game themes", err);
        setGameThemes(readOfflineSpokeThemesFallback(workspaces, wsId));
      }
    };
    fetchGameThemes();
  }, [wsId, workspaces, osRole]);

  const mergedCoreThemes = useMemo(() => ({ ...DEFAULT_CORE_THEMES, ...CORE_THEMES }), [CORE_THEMES]);
  const allThemes = useMemo(
    () => ({ ...mergedCoreThemes, ...gameThemes, ...devThemes, ...customThemes }),
    [mergedCoreThemes, gameThemes, devThemes, customThemes]
  );
  const resolvedThemeId = activeThemeIdState;
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

  // Sanitize semantic status channels and legacy true_glass custom themes
  useEffect(() => {
    let hasChanges = false;
    const nextCustoms: Record<string, any> = { ...customThemes };

    Object.entries(nextCustoms).forEach(([id, th]: [string, any]) => {
      if (!th || typeof th !== 'object') return;
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

          if (
            companionFile &&
            !companionFile.includes('/') &&
            !companionFile.includes('\\') &&
            !companionFile.includes('..')
          ) {
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
                if (rawBgImg.startsWith('https://') && !parsedTheme.bgRemoteUrl) {
                  parsedTheme.bgRemoteUrl = rawBgImg;
                }
                parsedTheme.bgImageFile = companionFile;
                parsedTheme.bgImage = `data:${mime};base64,${btoa(binary)}`;
              } catch {
                // ignore companion read error
              }
            }
          }
          return parsedTheme;
        };

        const needsDiskWallpaperHydration = (entryObj: any) => {
          if (!entryObj || typeof entryObj !== 'object') return true;
          if (!entryObj.bgImageFile) return false;
          const bg = typeof entryObj.bgImage === 'string' ? entryObj.bgImage.trim() : '';
          return !bg || bg.startsWith('https://');
        };

        for (const candidateDir of [themesDir, legacySpokeThemesDir].filter(Boolean)) {
          if (await exists(candidateDir)) {
            const entries = await readDir(candidateDir);
            for (const entry of entries) {
              if (entry.name && entry.name.endsWith('.json')) {
                const themeId = entry.name.replace('.json', '');
                if ((!updatedCustoms[themeId] || needsDiskWallpaperHydration(updatedCustoms[themeId])) && !CORE_THEMES[themeId]) {
                  const content = await readTextFile(`${candidateDir}\\${entry.name}`);
                  const resolved = await resolveCompanionWallpaper(candidateDir, JSON.parse(content));
                  updatedCustoms[themeId] = updatedCustoms[themeId]
                    ? { ...updatedCustoms[themeId], ...resolved }
                    : resolved;
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
                if (!updatedDevs[themeId] || needsDiskWallpaperHydration(updatedDevs[themeId])) {
                  const content = await readTextFile(`${candidateDevDir}\\${entry.name}`);
                  const resolved = await resolveCompanionWallpaper(candidateDevDir, JSON.parse(content));
                  updatedDevs[themeId] = updatedDevs[themeId]
                    ? { ...updatedDevs[themeId], ...resolved }
                    : resolved;
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
    const effectiveTheme = previewThemeState?.data || currentTheme;
    if (previewThemeState?.data) {
      (window as any).__sanctuaryPreviewTheme = previewThemeState.data;
    }
    const colorScheme = applyThemeCssVarsToRoot(effectiveTheme);
    (window as any).__sanctuaryRebuildWebGLGlass?.();
    (window as any).__sanctuaryRenderWebGLGlass?.(true);

    if (isDesktop()) {
      import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
        getCurrentWindow().setTheme(colorScheme).catch(() => { });
      }).catch(() => { });
    }
  }, [activeThemeIdState, currentTheme, previewThemeState, GLASS_OPTICS_REV]);

  const startThemePreview = useCallback((id: string, name: string, rawThemeData: any) => {
    let parsed = rawThemeData;
    if (typeof rawThemeData === 'string') {
      try {
        parsed = JSON.parse(rawThemeData);
      } catch {
        parsed = {};
      }
    }
    if (parsed && typeof parsed.json_data === 'string') {
      try {
        parsed = { ...parsed, ...JSON.parse(parsed.json_data) };
      } catch {}
    } else if (parsed && parsed.json_data && typeof parsed.json_data === 'object') {
      parsed = { ...parsed, ...parsed.json_data };
    }
    const sanitizedParsed = sanitizeThemeObject(parsed || {});
    const [bgR, bgG, bgB] = parseHexToRgb(sanitizedParsed?.bg || '#040812', [4, 8, 18]);
    const isLight =
      String(sanitizedParsed?.theme_mode || '').toLowerCase() === 'light' ||
      (bgR * 299 + bgG * 587 + bgB * 114) / 1000 >= 128;
    const baseCore = isLight ? DEFAULT_CORE_THEMES.radiant : DEFAULT_CORE_THEMES.architect;
    const { bgImage: _defaultBgImg, name: _defaultName, ...opticalDefaults } = baseCore;
    const normalized = {
      ...(sanitizedParsed?.bg || sanitizedParsed?.accent ? opticalDefaults : baseCore),
      ...sanitizedParsed,
      name: name || sanitizedParsed?.name || 'Preview',
      success: sanitizeSemanticChannel('success', sanitizedParsed?.success || baseCore.success),
      warning: sanitizeSemanticChannel('warning', sanitizedParsed?.warning || baseCore.warning),
      danger: sanitizeSemanticChannel('danger', sanitizedParsed?.danger || baseCore.danger),
      textCase: sanitizedParsed?.textCase || 'capitalize',
    };
    (window as any).__sanctuaryPreviewTheme = normalized;
    setPreviewThemeState({ id: String(id), name: String(name || normalized.name), data: normalized });
  }, []);

  const stopThemePreview = useCallback(() => {
    (window as any).__sanctuaryPreviewTheme = null;
    setPreviewThemeState(null);
    applyThemeCssVarsToRoot(currentTheme);
    (window as any).__sanctuaryRebuildWebGLGlass?.();
    (window as any).__sanctuaryRenderWebGLGlass?.(true);
  }, [currentTheme]);

  const saveThemeToVault = useCallback((id: string, json: any, isDev: boolean = false) => {
    (async () => {
      try {
        if (!isDesktop()) return;
        const safeId = String(id || '').replace(/[^a-zA-Z0-9_-]/g, '');
        if (!safeId) return;
        const { masterVault } = await resolveVaultThemeRoots();
        if (!masterVault) return;
        const dir = isDev ? `${masterVault}\\Data\\Dev\\Themes` : `${masterVault}\\Data\\Themes`;
        await mkdir(dir, { recursive: true });

        const diskJson: Record<string, any> = { ...(json || {}) };
        const rawBg = typeof diskJson.bgImage === 'string' ? diskJson.bgImage.trim() : '';

        if (rawBg.startsWith('data:image/')) {
          const match = rawBg.match(/^data:(image\/(webp|png|jpeg|jpg|gif|avif));base64,([A-Za-z0-9+/=]+)$/i);
          if (match) {
            let ext = match[2].toLowerCase();
            if (ext === 'jpeg') ext = 'jpg';
            else if (!['webp', 'png', 'jpg'].includes(ext)) ext = 'webp';
            const binStr = atob(match[3]);
            const bytes = new Uint8Array(binStr.length);
            for (let i = 0; i < binStr.length; i++) {
              bytes[i] = binStr.charCodeAt(i);
            }
            const companionName = `${safeId}.${ext}`;
            await writeFile(`${dir}\\${companionName}`, bytes);
            diskJson.bgImageFile = companionName;
            diskJson.bgImage = typeof diskJson.bgRemoteUrl === 'string' ? diskJson.bgRemoteUrl : '';
            await writeTextFile(`${dir}\\${safeId}.json`, JSON.stringify(diskJson, null, 2));

            if (isDev) {
              setDevThemes((prev: Record<string, any>) => {
                if (!prev[safeId]) return prev;
                const next = { ...prev, [safeId]: { ...prev[safeId], bgImageFile: companionName } };
                writeSharedThemeMap(wsId, 'dev_themes', next);
                return next;
              });
            } else {
              setCustomThemes((prev: Record<string, any>) => {
                if (!prev[safeId]) return prev;
                const next = { ...prev, [safeId]: { ...prev[safeId], bgImageFile: companionName } };
                writeSharedThemeMap(wsId, 'custom_themes', next);
                return next;
              });
            }
            return;
          }
        } else if (rawBg.startsWith('https://')) {
          // Save metadata immediately first so offline or slow network never blocks persistence
          await writeTextFile(`${dir}\\${safeId}.json`, JSON.stringify(diskJson, null, 2));
          const safeRemote = sanitizeThemeBgImageUrl(rawBg);
          if (safeRemote) {
            try {
              const resp = await fetch(safeRemote);
              if (resp.ok) {
                const buf = await resp.arrayBuffer();
                if (buf.byteLength > 0 && buf.byteLength <= 4 * 1024 * 1024) {
                  const bytes = new Uint8Array(buf);
                  const ct = (resp.headers.get('content-type') || '').toLowerCase();
                  let ext = 'webp';
                  if (ct.includes('png') || /\.png($|\?)/i.test(safeRemote)) ext = 'png';
                  else if (ct.includes('jpeg') || ct.includes('jpg') || /\.jpe?g($|\?)/i.test(safeRemote)) ext = 'jpg';
                  const mime = ext === 'png' ? 'image/png' : ext === 'jpg' ? 'image/jpeg' : 'image/webp';
                  const companionName = `${safeId}.${ext}`;
                  await writeFile(`${dir}\\${companionName}`, bytes);

                  diskJson.bgImageFile = companionName;
                  diskJson.bgRemoteUrl = safeRemote;
                  diskJson.bgImage = safeRemote;
                  await writeTextFile(`${dir}\\${safeId}.json`, JSON.stringify(diskJson, null, 2));

                  let binary = '';
                  const chunkSize = 0x8000;
                  for (let i = 0; i < bytes.length; i += chunkSize) {
                    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
                  }
                  const localDataUrl = `data:${mime};base64,${btoa(binary)}`;
                  if (isDev) {
                    setDevThemes((prev: Record<string, any>) => {
                      if (!prev[safeId]) return prev;
                      const next = {
                        ...prev,
                        [safeId]: {
                          ...prev[safeId],
                          bgImage: localDataUrl,
                          bgImageFile: companionName,
                          bgRemoteUrl: safeRemote,
                        },
                      };
                      writeSharedThemeMap(wsId, 'dev_themes', next);
                      return next;
                    });
                  } else {
                    setCustomThemes((prev: Record<string, any>) => {
                      if (!prev[safeId]) return prev;
                      const next = {
                        ...prev,
                        [safeId]: {
                          ...prev[safeId],
                          bgImage: localDataUrl,
                          bgImageFile: companionName,
                          bgRemoteUrl: safeRemote,
                        },
                      };
                      writeSharedThemeMap(wsId, 'custom_themes', next);
                      return next;
                    });
                  }
                }
              }
            } catch {
              // Network unavailable; remote URL remains intact in diskJson
            }
          }
          return;
        }

        await writeTextFile(`${dir}\\${safeId}.json`, JSON.stringify(diskJson, null, 2));
      } catch (err) {
        console.error("Failed to save theme to vault:", err);
      }
    })();
  }, [wsId]);


  const updateTheme = useCallback((id: string, updates: any) => {
    if (id?.startsWith('dev_')) {
      const targetTheme = devThemes[id];
      if (!targetTheme) return;
      const updatedTheme = { ...targetTheme, ...updates };
      const updated = { ...devThemes, [id]: updatedTheme };
      setDevThemes(updated);
      writeSharedThemeMap(wsId, 'dev_themes', updated);
      saveThemeToVault(id, updatedTheme, true);
    } else if (CORE_THEMES[id]) {
      const targetTheme = CORE_THEMES[id];
      const newId = `custom_${id}_${Date.now()}`;
      const newTheme = { ...targetTheme, ...updates, name: `${targetTheme.name} (Edited)` };
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
  }, [devThemes, CORE_THEMES, customThemes, allThemes, currentTheme, wsId, saveThemeToVault, setActiveThemeId]);

  const updateActiveTheme = useCallback((updates: any) => {
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
  }, [activeThemeIdState, currentTheme, devThemes, CORE_THEMES, customThemes, wsId, saveThemeToVault, setActiveThemeId]);

  const createNewTheme = useCallback(() => {
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
  }, [customThemes, setActiveThemeId, wsId, saveThemeToVault]);

  const createNewDevTheme = useCallback((baseTheme: any = null) => {
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
  }, [devThemes, wsId, saveThemeToVault]);

  const exportDevThemeToCustom = useCallback((id: string) => {
    if (!id?.startsWith('dev_')) return;
    const themeToCopy = devThemes[id];
    if (!themeToCopy) return;

    const newId = `custom_${Date.now()}`;
    const newTheme = { ...themeToCopy, name: themeToCopy.name };
    const updatedCustoms = { ...customThemes, [newId]: newTheme };
    setCustomThemes(updatedCustoms);
    writeSharedThemeMap(wsId, 'custom_themes', updatedCustoms);
    saveThemeToVault(newId, newTheme, false);
  }, [devThemes, customThemes, wsId, saveThemeToVault]);

  const deleteTheme = useCallback((id: string) => {
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
          for (const candidateName of [`${id}.json`, `${id}.webp`, `${id}.png`, `${id}.jpg`]) {
            const filePath = `${dir}\\${candidateName}`;
            if (await exists(filePath)) await remove(filePath);
          }
        }
      } catch (err) { console.error("Failed to delete theme from vault:", err); }
    })();
  }, [CORE_THEMES, customThemes, devThemes, wsId, activeThemeIdState, setActiveThemeId]);

  const renameTheme = useCallback((id: string, newName: string) => {
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
  }, [CORE_THEMES, customThemes, devThemes, wsId, setActiveThemeId, saveThemeToVault]);

  const importTheme = useCallback((rawJson: any) => {
    setPreviewThemeState(null);
    (window as any).__sanctuaryPreviewTheme = null;
    let json = rawJson;
    if (typeof rawJson === 'string') {
      try {
        json = JSON.parse(rawJson);
      } catch {
        return;
      }
    }
    if (!json || typeof json !== 'object') return;
    const sanitizedJson = sanitizeThemeObject(json);
    if (Object.keys(sanitizedJson).length === 0) return;
    const targetName = String(sanitizedJson.name || '').trim().toLowerCase();
    const existingEntry = targetName
      ? Object.entries(customThemes).find(
          ([, th]: [string, any]) =>
            th && String(th.name || '').trim().toLowerCase() === targetName
        )
      : undefined;
    const id = existingEntry ? existingEntry[0] : `import_${Date.now()}`;
    const nextCustoms = { ...customThemes, [id]: sanitizedJson };
    setCustomThemes(nextCustoms);
    writeSharedThemeMap(wsId, 'custom_themes', nextCustoms);
    setActiveThemeId(id);
    saveThemeToVault(id, sanitizedJson, false);
  }, [customThemes, wsId, setActiveThemeId, saveThemeToVault]);

  const themeContextValue = useMemo(() => ({
    activeThemeId: activeThemeIdState,
    setActiveThemeId,
    currentTheme,
    CORE_THEMES: mergedCoreThemes,
    setCoreThemes,
    customThemes,
    devThemes,
    gameThemes,
    updateActiveTheme,
    updateTheme,
    renameTheme,
    createNewTheme,
    createNewDevTheme,
    exportDevThemeToCustom,
    deleteTheme,
    useGlobalTheme: useGlobalThemeState,
    setUseGlobalTheme,
    previewThemeId: previewThemeState?.id || null,
    previewThemeName: previewThemeState?.name || null,
    startThemePreview,
    stopThemePreview,
    importTheme,
  }), [
    activeThemeIdState,
    setActiveThemeId,
    currentTheme,
    mergedCoreThemes,
    customThemes,
    devThemes,
    gameThemes,
    updateActiveTheme,
    updateTheme,
    renameTheme,
    createNewTheme,
    createNewDevTheme,
    exportDevThemeToCustom,
    deleteTheme,
    useGlobalThemeState,
    setUseGlobalTheme,
    previewThemeState?.id,
    previewThemeState?.name,
    startThemePreview,
    stopThemePreview,
    importTheme,
  ]);

  return (
    <ThemeContext.Provider value={themeContextValue}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
