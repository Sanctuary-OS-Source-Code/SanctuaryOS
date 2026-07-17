import { createContext, useContext, useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { mkdir, writeTextFile, readDir, readTextFile, remove, exists } from '@tauri-apps/plugin-fs';

const CORE_THEMES: any = {
  architect: {
    name: "Architect", bg: "#02040a", sidebar: "#060913", sidebartext: "#fafafa", accent: "#38bdf8",
    text: "#fafafa", subtext: "#a1a1aa", success: "#30d158", warning: "#ffd60a", danger: "#ff453a",
    panelTint: "#ffffff", headerText: "#ffffff", fontFamily: "Inter, sans-serif", fontSizeBase: "16px",
    glassOpacity: "6%", glassBlur: "16px", radius: "1.25rem", bgGradient: "#02040a",
    fontSizeHeader: "1.875rem", fontSizeSubheader: "1.5rem", fontSizeTitle: "1.25rem", fontSizeSubtitle: "1.125rem",
    fontSizeText: "1rem", fontSizeSubtext: "0.75rem", fontSizeSidebar: "10px", sidebarWidth: "260px"
  },
  radiant: {
    name: "Radiant", bg: "#ffffff", sidebar: "#ffffff", sidebartext: "#1d1d1f", accent: "#007aff",
    text: "#1d1d1f", subtext: "#86868b", success: "#34c759", warning: "#ffcc00", danger: "#ff3b30",
    panelTint: "#ffffff", headerText: "#000000", fontFamily: "Inter, sans-serif", fontSizeBase: "16px",
    glassOpacity: "0%", glassBlur: "32px", radius: "1.5rem", bgGradient: "linear-gradient(135deg, #e0e7ff 0%, #f8fafc 50%, #fce7f3 100%)",
    fontSizeHeader: "1.875rem", fontSizeSubheader: "1.5rem", fontSizeTitle: "1.25rem", fontSizeSubtitle: "1.125rem",
    fontSizeText: "1rem", fontSizeSubtext: "0.75rem", fontSizeSidebar: "10px", sidebarWidth: "260px"
  },
  aurora: {
    name: "Aurora", bg: "#020617", sidebar: "#060913", sidebartext: "#fafafa", accent: "#38bdf8",
    text: "#fafafa", subtext: "#a1a1aa", success: "#30d158", warning: "#ffd60a", danger: "#ff453a",
    panelTint: "#ffffff", headerText: "#ffffff", fontFamily: "Inter, sans-serif", fontSizeBase: "16px",
    glassOpacity: "4%", glassBlur: "24px", radius: "1.25rem", bgGradient: "radial-gradient(ellipse at 0% 0%, #1e1b4b 0%, #1e1b4b00 60%), radial-gradient(ellipse at 100% 100%, #064e3b 0%, #064e3b00 60%), #020617",
    fontSizeHeader: "1.875rem", fontSizeSubheader: "1.5rem", fontSizeTitle: "1.25rem", fontSizeSubtitle: "1.125rem",
    fontSizeText: "1rem", fontSizeSubtext: "0.75rem", fontSizeSidebar: "10px", sidebarWidth: "260px"
  }, bunker: {
    name: "Bunker", bg: "#051005", sidebar: "#0a1f0a", sidebartext: "#00ff41", accent: "#00ff41",
    text: "#00ff41", subtext: "#008f11", success: "#0ce471", warning: "#ffea00", danger: "#ff003c",
    panelTint: "#00ff41", headerText: "#00ff41", fontFamily: "'Space Mono', monospace", fontSizeBase: "16px",
    glassOpacity: "4%", glassBlur: "24px", radius: "0rem", bgGradient: "radial-gradient(circle at center, #0a1f0a 0%, #000000 100%)",
    fontSizeHeader: "1.875rem", fontSizeSubheader: "1.5rem", fontSizeTitle: "1.25rem", fontSizeSubtitle: "1.125rem",
    fontSizeText: "1rem", fontSizeSubtext: "0.75rem", fontSizeSidebar: "10px", sidebarWidth: "260px"
  },
  dracula: {
    name: "Dracula", bg: "#191a21", sidebar: "#282a36", sidebartext: "#f8f8f2", accent: "#bd93f9",
    text: "#f8f8f2", subtext: "#6272a4", success: "#50fa7b", warning: "#f1fa8c", danger: "#ff5555",
    panelTint: "#bd93f9", headerText: "#ffffff", fontFamily: "Inter, sans-serif", fontSizeBase: "16px",
    glassOpacity: "5%", glassBlur: "20px", radius: "1rem", bgGradient: "linear-gradient(135deg, #282a36 0%, #191a21 100%)",
    fontSizeHeader: "1.875rem", fontSizeSubheader: "1.5rem", fontSizeTitle: "1.25rem", fontSizeSubtitle: "1.125rem",
    fontSizeText: "1rem", fontSizeSubtext: "0.75rem", fontSizeSidebar: "10px", sidebarWidth: "260px"
  },
  synthwave: {
    name: "Miami Vice", bg: "#0b032d", sidebar: "#1a0b40", sidebartext: "#fdf2f8", accent: "#f92aad",
    text: "#fdf2f8", subtext: "#a1a1aa", success: "#0ce471", warning: "#f9df6d", danger: "#fe4450",
    panelTint: "#f92aad", headerText: "#ffffff", fontFamily: "Inter, sans-serif", fontSizeBase: "16px",
    glassOpacity: "8%", glassBlur: "32px", radius: "2rem", bgGradient: "linear-gradient(135deg, #2d0b54 0%, #0b032d 100%)",
    fontSizeHeader: "1.875rem", fontSizeSubheader: "1.5rem", fontSizeTitle: "1.25rem", fontSizeSubtitle: "1.125rem",
    fontSizeText: "1rem", fontSizeSubtext: "0.75rem", fontSizeSidebar: "10px", sidebarWidth: "260px"
  },
};

const ThemeContext = createContext<any>(null);

export const ThemeProvider = ({ children }: any) => {
  const [customThemes, setCustomThemes] = useState(() => JSON.parse(localStorage.getItem("sanctuary_custom_themes") || "{}"));
  const [devThemes, setDevThemes] = useState(() => JSON.parse(localStorage.getItem("sanctuary_dev_themes") || "{}"));
  const [activeThemeId, setActiveThemeId] = useState(() => localStorage.getItem("sanctuary_active_theme") || "architect");

  const allThemes = { ...customThemes, ...devThemes, ...CORE_THEMES };
  const currentThemeRaw = allThemes[activeThemeId] || CORE_THEMES.architect;
  const currentTheme = { ...currentThemeRaw };
  if (currentTheme.name === "Architect" && currentTheme.bgGradient && currentTheme.bgGradient.includes("linear-gradient")) {
    currentTheme.bgGradient = "#02040a";
  }

  useEffect(() => {
    const scanVault = async () => {
      try {
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
          localStorage.setItem("sanctuary_custom_themes", JSON.stringify(updatedCustoms));
        }
        if (hasDevUpdates) {
          setDevThemes(updatedDevs);
          localStorage.setItem("sanctuary_dev_themes", JSON.stringify(updatedDevs));
        }
      } catch (err) {
        console.error("Failed to scan vault themes:", err);
      }
    };
    scanVault();
  }, []);

  useEffect(() => {
    if (customThemes["Radiant"]) {
      const { Radiant, ...rest } = customThemes;
      setCustomThemes(rest);
      localStorage.setItem("sanctuary_custom_themes", JSON.stringify(rest));
      if (activeThemeId === "Radiant") setActiveThemeId("radiant");
    } else if (activeThemeId === "Radiant") {
      setActiveThemeId("radiant");
    }
  }, [customThemes, activeThemeId]);

  useEffect(() => {
    const root = document.documentElement;
    Object.entries(currentTheme).forEach(([key, val]) => {
      if (key !== 'name') {
        if (key === 'bgGradient' && (val === 'none' || !val)) {
          root.style.setProperty(`--bgGradient`, currentTheme.bg);
        } else {
          root.style.setProperty(`--${key}`, val as string);
        }
      }
    });
    localStorage.setItem("sanctuary_active_theme", activeThemeId);

    const bgHex = (currentTheme.bg || '#000000').replace('#', '');
    if (bgHex.length === 6) {
      const r = parseInt(bgHex.substring(0, 2), 16);
      const g = parseInt(bgHex.substring(2, 4), 16);
      const b = parseInt(bgHex.substring(4, 6), 16);
      const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
      const isLight = yiq >= 128;
      import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
        getCurrentWindow().setTheme(isLight ? 'light' : 'dark').catch(() => { });
      }).catch(() => { });
    }
  }, [activeThemeId, currentTheme]);

  const saveThemeToVault = (id: string, json: any, isDev: boolean = false) => {
    (async () => {
      try {
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
      localStorage.setItem("sanctuary_dev_themes", JSON.stringify(updated));
      saveThemeToVault(id, updatedTheme, true);
    } else if (CORE_THEMES[id]) {
      const currentTheme = CORE_THEMES[id];
      const newId = `custom_${id}_${Date.now()}`;
      const newTheme = { ...currentTheme, ...updates, name: `${currentTheme.name} (Edited)` };
      const newCustoms = { ...customThemes, [newId]: newTheme };
      setCustomThemes(newCustoms);
      setActiveThemeId(newId);
      localStorage.setItem("sanctuary_custom_themes", JSON.stringify(newCustoms));
      saveThemeToVault(newId, newTheme, false);
    } else {
      const currentTheme = customThemes[id];
      if (!currentTheme) return;
      const updatedTheme = { ...currentTheme, ...updates };
      const updated = { ...customThemes, [id]: updatedTheme };
      setCustomThemes(updated);
      localStorage.setItem("sanctuary_custom_themes", JSON.stringify(updated));
      saveThemeToVault(id, updatedTheme, false);
    }
  };

  const updateActiveTheme = (updates: any) => {
    if (activeThemeId?.startsWith('dev_')) {
      const updatedTheme = { ...currentTheme, ...updates };
      const updated = { ...devThemes, [activeThemeId]: updatedTheme };
      setDevThemes(updated);
      localStorage.setItem("sanctuary_dev_themes", JSON.stringify(updated));
      saveThemeToVault(activeThemeId, updatedTheme, true);
    } else if (CORE_THEMES[activeThemeId]) {
      const newId = `custom_${activeThemeId}_${Date.now()}`;
      const newTheme = { ...currentTheme, ...updates, name: `${currentTheme.name} (Edited)` };
      const newCustoms = { ...customThemes, [newId]: newTheme };
      setCustomThemes(newCustoms);
      setActiveThemeId(newId);
      localStorage.setItem("sanctuary_custom_themes", JSON.stringify(newCustoms));
      saveThemeToVault(newId, newTheme, false);
    } else {
      const updatedTheme = { ...currentTheme, ...updates };
      const updated = { ...customThemes, [activeThemeId]: updatedTheme };
      setCustomThemes(updated);
      localStorage.setItem("sanctuary_custom_themes", JSON.stringify(updated));
      saveThemeToVault(activeThemeId, updatedTheme, false);
    }
  };

  const createNewTheme = () => {
    const id = `signature_${Date.now()}`;
    const newTheme = {
      name: "NEW SIGNATURE", bg: "#0f172a", sidebar: "#0f172a", sidebartext: "#ffffff", accent: "#ffffff",
      text: "#ffffff", subtext: "#666666", success: "#00ff41", warning: "#ffea00", danger: "#ff003c",
      panelTint: "#ffffff", headerText: "#ffffff", fontFamily: "Inter, sans-serif", fontSizeBase: "16px", glassOpacity: "3%", glassBlur: "16px", radius: "1.5rem", bgGradient: "none"
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
      panelTint: "#ffffff", headerText: "#ffffff", fontFamily: "Inter, sans-serif", fontSizeBase: "16px", glassOpacity: "3%", glassBlur: "16px", radius: "1.5rem", bgGradient: "none"
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
    if (isDev) {
      const { [id]: removed, ...remaining } = devThemes;
      setDevThemes(remaining);
      localStorage.setItem("sanctuary_dev_themes", JSON.stringify(remaining));
    } else {
      const { [id]: removed, ...remaining } = customThemes;
      setCustomThemes(remaining);
      localStorage.setItem("sanctuary_custom_themes", JSON.stringify(remaining));
    }
    
    if (activeThemeId === id) setActiveThemeId("architect");

    (async () => {
      try {
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
      activeThemeId, setActiveThemeId, currentTheme, CORE_THEMES, customThemes, devThemes, 
      updateActiveTheme, updateTheme, renameTheme, createNewTheme, createNewDevTheme, exportDevThemeToCustom, deleteTheme, 
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
