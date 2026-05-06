import { createContext, useContext, useState, useEffect } from 'react';

const CORE_THEMES: any = {
  architect: { name: "Architect", bg: "#0f172a", sidebar: "#1e293b", accent: "#38bdf8", text: "#f1f5f9", subtext: "#94a3b8", success: "#22c55e", warning: "#f59e0b", danger: "#ef4444" },
  bunker: { name: "Bunker", bg: "#000000", sidebar: "#0d0d0d", accent: "#00ff41", text: "#ffffff", subtext: "#ffffff", success: "#00ff41", warning: "#ffea00", danger: "#ff003c" },
  clean: { name: "Clean Room", bg: "#E3E3E3", sidebar: "#8C8C8C", accent: "#8C8C8C", text: "#000000", subtext: "#000000", success: "#00ff41", warning: "#ffea00", danger: "#ff003c" },
  dracula: { name: "Dracula", bg: "#1e1e24", sidebar: "#282a36", accent: "#bd93f9", text: "#f8f8f2", subtext: "#6272a4", success: "#50fa7b", warning: "#ffb86c", danger: "#ff5555" },
  synthwave: { name: "Miami Vice", bg: "#2b213a", sidebar: "#241b2f", accent: "#ff7edb", text: "#f9f8fe", subtext: "#8b8198", success: "#0ce471", warning: "#f9df6d", danger: "#fe4450" }
};

const ThemeContext = createContext<any>(null);

export const ThemeProvider = ({ children }: any) => {
  const [customThemes, setCustomThemes] = useState(() => JSON.parse(localStorage.getItem("sanctuary_custom_themes") || "{}"));
  const [activeThemeId, setActiveThemeId] = useState(() => localStorage.getItem("sanctuary_active_theme") || "architect");

  const allThemes = { ...CORE_THEMES, ...customThemes };
  const currentTheme = allThemes[activeThemeId] || CORE_THEMES.architect;

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
    } else {
      const updated = { ...customThemes, [activeThemeId]: { ...currentTheme, ...updates } };
      setCustomThemes(updated);
      localStorage.setItem("sanctuary_custom_themes", JSON.stringify(updated));
    }
  };

  const createNewTheme = () => {
    const id = `signature_${Date.now()}`;
    const newTheme = { 
      name: "NEW SIGNATURE", 
      bg: "#0f172a", sidebar: "#0d0d0d", accent: "#ffffff", 
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
  };

  return (
    <ThemeContext.Provider value={{ activeThemeId, setActiveThemeId, currentTheme, CORE_THEMES, customThemes, updateActiveTheme, createNewTheme, deleteTheme, importTheme: (json: any) => {
      const id = `import_${Date.now()}`;
      setCustomThemes((prev: any) => ({ ...prev, [id]: json }));
      setActiveThemeId(id);
    }}}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);