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
    glassOpacity: "5%", glassBlur: "24px", radius: "1.25rem", shadowColor: "rgba(0,0,0,0.3)",
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
              fetchedThemes[row.id] = { ...row.theme_data, id: row.id, name: row.name };
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
    const fetchGameThemes = async () => {
      try {
        const fetchedGameThemes: Record<string, any> = {};

        for (const ws of workspaces) {
          if (ws.id === 'default_workspace' || !ws.supabase_url || !ws.supabase_anon_key) continue;
          
          try {
            const client = createClient(ws.supabase_url, ws.supabase_anon_key, { auth: { persistSession: false } });
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

    if (currentTheme.bgImage) {
      root.style.setProperty(`--bgGradient`, `url("${currentTheme.bgImage}")`);
      root.style.setProperty(`--glassBgImage`, `url("${currentTheme.bgImage}")`);
      root.style.setProperty(`--glassFilter`, `blur(var(--glassBlur, 24px)) saturate(140%)`);
      root.style.setProperty(`--glassFilterSurface`, `blur(calc(var(--glassBlur, 24px) * 0.7)) saturate(120%)`);
    } else if (currentTheme.bgGradient && currentTheme.bgGradient !== 'transparent' && currentTheme.bgGradient !== 'none' && currentTheme.bgGradient !== currentTheme.bg) {
      root.style.setProperty(`--bgGradient`, currentTheme.bgGradient);
      // For CSS gradients, Chromium breaks background-attachment: fixed. 
      // But gradients are already smooth, so we don't need to blur them!
      // We just use 'none' and let the native gradient shine through.
      root.style.setProperty(`--glassBgImage`, `none`);
      root.style.setProperty(`--glassFilter`, `none`);
      root.style.setProperty(`--glassFilterSurface`, `none`);
    } else {
      root.style.setProperty(`--bgGradient`, `none`);
      root.style.setProperty(`--glassBgImage`, `none`);
      root.style.setProperty(`--glassFilter`, `none`);
      root.style.setProperty(`--glassFilterSurface`, `none`);
    }

    const bgHex = (currentTheme.bg || '#000000').replace('#', '');
    if (bgHex.length === 6) {
      const r = parseInt(bgHex.substring(0, 2), 16);
      const g = parseInt(bgHex.substring(2, 4), 16);
      const b = parseInt(bgHex.substring(4, 6), 16);
      root.style.setProperty('--bg-rgb', `${r}, ${g}, ${b}`);
    }

    const tintHex = (currentTheme.panelTint || '#ffffff').replace('#', '');
    if (tintHex.length === 6) {
      const tr = parseInt(tintHex.substring(0, 2), 16);
      const tg = parseInt(tintHex.substring(2, 4), 16);
      const tb = parseInt(tintHex.substring(4, 6), 16);
      root.style.setProperty('--panelTint-rgb', `${tr}, ${tg}, ${tb}`);
      root.style.setProperty('--panelTint-rgb-spaces', `${tr} ${tg} ${tb}`);

      // Calculate opacity
      let finalOpacityStr = String(currentTheme.glassOpacity || "0.35");
      if (finalOpacityStr.endsWith('%')) {
        finalOpacityStr = (parseFloat(finalOpacityStr) / 100).toString();
      }
      let rawOpacity = parseFloat(finalOpacityStr);

      // Pre-compute the exact CSS strings to bypass ALL CSS minifier and browser parsing bugs
      root.style.setProperty('--glass-panel-bg', `rgba(${tr}, ${tg}, ${tb}, ${rawOpacity})`);
      root.style.setProperty('--glass-surface-bg', `rgba(${tr}, ${tg}, ${tb}, ${rawOpacity * 0.7})`);
    }

    const textHex = (currentTheme.text || '#ffffff').replace('#', '');
    if (textHex.length === 6) {
      const tr = parseInt(textHex.substring(0, 2), 16);
      const tg = parseInt(textHex.substring(2, 4), 16);
      const tb = parseInt(textHex.substring(4, 6), 16);
      root.style.setProperty('--text-rgb', `${tr}, ${tg}, ${tb}`);
    }

    // Provide bulletproof decimal values for App.css rgba() injection
    let finalOpacityStr = String(currentTheme.glassOpacity || "0.35");
    if (finalOpacityStr.endsWith('%')) {
      finalOpacityStr = (parseFloat(finalOpacityStr) / 100).toString();
    }
    let rawOpacity = parseFloat(finalOpacityStr);

    root.style.setProperty('--glassOpacityDecimal', rawOpacity.toString());
    root.style.setProperty('--glassOpacitySurfaceDecimal', (rawOpacity * 0.7).toString());
    root.style.setProperty('--glassOpacitySurfacePercent', `${rawOpacity * 0.7 * 100}%`);

    const yiq = (((parseInt(bgHex.substring(0, 2), 16) || 0) * 299) + ((parseInt(bgHex.substring(2, 4), 16) || 0) * 587) + ((parseInt(bgHex.substring(4, 6), 16) || 0) * 114)) / 1000;
    const isLight = yiq >= 128;
    import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
      getCurrentWindow().setTheme(isLight ? 'light' : 'dark').catch(() => { });
    }).catch(() => { });
  }, [activeThemeIdState, currentTheme]);

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
    setActiveThemeId(id);
    localStorage.setItem("sanctuary_dev_themes", JSON.stringify(updated));
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
