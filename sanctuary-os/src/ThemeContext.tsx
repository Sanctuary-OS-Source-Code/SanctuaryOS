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
  const [activeThemeId, setActiveThemeId] = useState(() => localStorage.getItem("sanctuary_active_theme") || "architect");

  const allThemes = { ...customThemes, ...CORE_THEMES };
  const currentThemeRaw = customThemes[activeThemeId] || CORE_THEMES[activeThemeId] || CORE_THEMES.architect;
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
        const dirExists = await exists(themesDir);
        if (!dirExists) return;

        const entries = await readDir(themesDir);
        let updatedThemes = { ...customThemes };
        let hasUpdates = false;

        for (const entry of entries) {
          if (entry.name && entry.name.endsWith('.json')) {
            const themeId = entry.name.replace('.json', '');
            if (!updatedThemes[themeId] && !CORE_THEMES[themeId]) {
              const content = await readTextFile(`${themesDir}\\${entry.name}`);
              updatedThemes[themeId] = JSON.parse(content);
              hasUpdates = true;
            }
          }
        }

        if (hasUpdates) {
          setCustomThemes(updatedThemes);
          localStorage.setItem("sanctuary_custom_themes", JSON.stringify(updatedThemes));
        }
      } catch (err) {
        console.error("Failed to scan vault themes:", err);
      }
    };
    scanVault();
  }, []);

  // Force-purge the corrupted legacy Radiant theme
  useEffect(() => {
    if (customThemes["Radiant"]) {
      const { Radiant, ...rest } = customThemes;
      setCustomThemes(rest);
      localStorage.setItem("sanctuary_custom_themes", JSON.stringify(rest));
      if (activeThemeId === "Radiant") {
        setActiveThemeId("radiant");
      }
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

  const updateActiveTheme = (updates: any) => {
    if (CORE_THEMES[activeThemeId]) {
      const newId = `custom_${activeThemeId}_${Date.now()}`;
      const newTheme = { ...currentTheme, ...updates, name: `${currentTheme.name} (Edited)` };
      const newCustoms = { ...customThemes, [newId]: newTheme };
      setCustomThemes(newCustoms);
      setActiveThemeId(newId);
      localStorage.setItem("sanctuary_custom_themes", JSON.stringify(newCustoms));
      saveThemeToVault(newId, newTheme);
    } else {
      const updatedTheme = { ...currentTheme, ...updates };
      const updated = { ...customThemes, [activeThemeId]: updatedTheme };
      setCustomThemes(updated);
      localStorage.setItem("sanctuary_custom_themes", JSON.stringify(updated));
      saveThemeToVault(activeThemeId, updatedTheme);
    }
  };

  const saveThemeToVault = (id: string, json: any) => {
    (async () => {
      try {
        const config: any = await invoke('get_saved_coordinates');
        if (config?.vault_path) {
          const themesDir = `${config.vault_path}\\Data\\Themes`;
          await mkdir(themesDir, { recursive: true });
          await writeTextFile(`${themesDir}\\${id}.json`, JSON.stringify(json, null, 2));
        }
      } catch (err) { console.error("Failed to save theme to vault:", err); }
    })();
  };

  const createNewTheme = () => {
    const id = `signature_${Date.now()}`;
    const newTheme = {
      name: "NEW SIGNATURE",
      bg: "#0f172a", sidebar: "#0f172a", sidebartext: "#ffffff", accent: "#ffffff",
      text: "#ffffff", subtext: "#666666",
      success: "#00ff41", warning: "#ffea00", danger: "#ff003c",
      panelTint: "#ffffff", headerText: "#ffffff", fontFamily: "Inter, sans-serif", fontSizeBase: "16px", glassOpacity: "3%", glassBlur: "16px", radius: "1.5rem", bgGradient: "none"
    };
    const updated = { ...customThemes, [id]: newTheme };
    setCustomThemes(updated);
    setActiveThemeId(id);
    localStorage.setItem("sanctuary_custom_themes", JSON.stringify(updated));
  };

  const deleteTheme = (id: string) => {
    if (CORE_THEMES[id]) return;
    const { [id]: removed, ...remaining } = customThemes;
    setCustomThemes(remaining);
    localStorage.setItem("sanctuary_custom_themes", JSON.stringify(remaining));
    if (activeThemeId === id) setActiveThemeId("architect");

    (async () => {
      try {
        const config: any = await invoke('get_saved_coordinates');
        if (config?.vault_path) {
          const filePath = `${config.vault_path}\\Data\\Themes\\${id}.json`;
          const fileExists = await exists(filePath);
          if (fileExists) await remove(filePath);
        }
      } catch (err) { console.error("Failed to delete theme from vault:", err); }
    })();
  };

  const renameTheme = (id: string, newName: string) => {
    if (CORE_THEMES[id] || !customThemes[id]) return;
    const updatedTheme = { ...customThemes[id], name: newName };
    const updated = { ...customThemes, [id]: updatedTheme };
    setCustomThemes(updated);
    localStorage.setItem("sanctuary_custom_themes", JSON.stringify(updated));
    saveThemeToVault(id, updatedTheme);
  };

  return (
    <ThemeContext.Provider value={{
      activeThemeId, setActiveThemeId, currentTheme, CORE_THEMES, customThemes, updateActiveTheme, renameTheme, createNewTheme, deleteTheme, importTheme: (json: any) => {
        const id = `import_${Date.now()}`;
        setCustomThemes((prev: any) => ({ ...prev, [id]: json }));
        setActiveThemeId(id);
        saveThemeToVault(id, json);
      }
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
