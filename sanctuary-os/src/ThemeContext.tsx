import { createContext, useContext, useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { mkdir, writeTextFile, readDir, readTextFile, remove, exists } from '@tauri-apps/plugin-fs';

const CORE_THEMES: any = {
  architect: { name: "Architect", bg: "#030712", sidebar: "#030712", sidebartext: "#f3f4f6", accent: "#0ea5e9", text: "#f3f4f6", subtext: "#9ca3af", success: "#10b981", warning: "#f59e0b", danger: "#ef4444" },
  bunker: { name: "Bunker", bg: "#000000", sidebar: "#050505", sidebartext: "#e0ffe0", accent: "#00ff41", text: "#e0ffe0", subtext: "#00cc33", success: "#00ff41", warning: "#ffcc00", danger: "#ff003c" },
  dracula: { name: "Dracula", bg: "#282a36", sidebar: "#191a21", sidebartext: "#f8f8f2", accent: "#ff79c6", text: "#f8f8f2", subtext: "#6272a4", success: "#50fa7b", warning: "#f1fa8c", danger: "#ff5555" },
  Radiant: { name: "Radiant Room", bg: "#f8fafc", sidebar: "#C8CCD0", sidebartext: "#0f172a", accent: "#616161", text: "#0f172a", subtext: "#475569", success: "#16a34a", warning: "#d97706", danger: "#dc2626" },
  synthwave: { name: "Miami Vice", bg: "#171520", sidebar: "#241b2f", sidebartext: "#ffffff", accent: "#f92aad", text: "#ffffff", subtext: "#8b8198", success: "#0ce471", warning: "#f9df6d", danger: "#fe4450" }
};

const ThemeContext = createContext<any>(null);

export const ThemeProvider = ({ children }: any) => {
  const [customThemes, setCustomThemes] = useState(() => JSON.parse(localStorage.getItem("sanctuary_custom_themes") || "{}"));
  const [activeThemeId, setActiveThemeId] = useState(() => localStorage.getItem("sanctuary_active_theme") || "architect");

  const allThemes = { ...CORE_THEMES, ...customThemes };
  const currentTheme = allThemes[activeThemeId] || CORE_THEMES.architect;

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

  useEffect(() => {
    const root = document.documentElement;
    Object.entries(currentTheme).forEach(([key, val]) => {
      if (key !== 'name') root.style.setProperty(`--${key}`, val as string);
    });
    localStorage.setItem("sanctuary_active_theme", activeThemeId);
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
      success: "#00ff41", warning: "#ffea00", danger: "#ff003c" 
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

    // Background Vault Delete
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
    <ThemeContext.Provider value={{ activeThemeId, setActiveThemeId, currentTheme, CORE_THEMES, customThemes, updateActiveTheme, renameTheme, createNewTheme, deleteTheme, importTheme: (json: any) => {
      const id = `import_${Date.now()}`;
      setCustomThemes((prev: any) => ({ ...prev, [id]: json }));
      setActiveThemeId(id);
      saveThemeToVault(id, json);
    }}}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
