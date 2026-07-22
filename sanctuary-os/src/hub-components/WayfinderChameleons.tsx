import { useState, useEffect } from 'react';
import { SidePanel, EmptyState } from '../shared';
import { useLexicon } from '../LexiconContext';
import { useStore } from '../store';
import { supabase } from '../supabase';
import { useTheme } from '../ThemeContext';

import { ThemeCard } from '../chameleon-components/ThemeCard';
import { ChameleonControlDashboard } from '../chameleon-components/ChameleonControlDashboard';
import { ChameleonSandboxPreview } from '../chameleon-components/ChameleonSandboxPreview';
import { standardButtonClass } from '../shared';

export function WayfinderChameleons({ isKeepers = false }: { isKeepers?: boolean }) {
  const { t } = useLexicon();
  const pushStatus = useStore((state: any) => state.pushStatus);
  const { activeThemeId, setActiveThemeId, setCoreThemes } = useTheme();

  const [cloudThemes, setCloudThemes] = useState<Record<string, any>>({});
  const [editingThemeId, setEditingThemeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // When editing, we work on a copy so we can discard if we close without saving
  const [activeEditingTheme, setActiveEditingTheme] = useState<any>(null);
  const [originalThemeId, setOriginalThemeId] = useState<string | null>(null);
  const [livePreview, setLivePreview] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    fetchThemes();
  }, []);

  const fetchThemes = async () => {
    setLoading(true);
    try {
      const client = isKeepers ? (await import('../supabase')).supabase : (await import('../supabase')).getActiveGameClient();
      const { data, error } = await client.from('sanctuary_themes').select('*');
      if (error) throw error;

      const themesMap: Record<string, any> = {};
      data?.forEach((row: any) => {
        themesMap[row.id] = { ...row.theme_data, id: row.id };
      });
      setCloudThemes(themesMap);
    } catch (err: any) {
      console.error(err);
      pushStatus(`Failed to fetch themes: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateTheme = (updates: any) => {
    setHasChanges(true);
    setActiveEditingTheme((prev: any) => ({ ...prev, ...updates }));
    
    if (editingThemeId) {
      setCoreThemes((prevCore: any) => {
        const baseTheme = prevCore[editingThemeId] || activeEditingTheme;
        return {
          ...prevCore,
          [editingThemeId]: { ...baseTheme, ...updates }
        };
      });
    }
  };

  const saveToCloud = async () => {
    if (!editingThemeId || !activeEditingTheme) return;
    setIsSaving(true);
    try {
      const payload = {
        id: editingThemeId,
        name: activeEditingTheme.name || editingThemeId,
        theme_data: activeEditingTheme,
        updated_at: new Date().toISOString()
      };

      const client = isKeepers ? (await import('../supabase')).supabase : (await import('../supabase')).getActiveGameClient();
      const { error } = await client.from('sanctuary_themes').upsert(payload);
      if (error) throw error;

      pushStatus("Master Theme saved to cloud.", "success");
      setHasChanges(false);
      setCloudThemes(prev => ({ ...prev, [editingThemeId]: activeEditingTheme }));
    } catch (err: any) {
      console.error(err);
      pushStatus(`Error saving: ${err.message}`, "error");
    } finally {
      setIsSaving(false);
    }
  };

  const openEditor = (id: string) => {
    setEditingThemeId(id);
    setActiveEditingTheme(cloudThemes[id]);
    setOriginalThemeId(activeThemeId);
    setHasChanges(false);
    if (livePreview) {
      setCoreThemes((prev: any) => ({ ...prev, [id]: cloudThemes[id] }));
      setActiveThemeId(id);
    }
  };

  const closeEditor = () => {
    setEditingThemeId(null);
    setActiveEditingTheme(null);
    setHasChanges(false);
    if (originalThemeId) {
      setActiveThemeId(originalThemeId);
    }
  };

  const renameTheme = (id: string, newName: string) => {
    setHasChanges(true);
    setActiveEditingTheme((prev: any) => ({ ...prev, name: newName }));
  };

  const createNewTheme = () => {
    const id = `theme_${Date.now()}`;
    const newTheme = {
      name: "NEW SIGNATURE", bg: "#0f172a", sidebar: "#0f172a", sidebartext: "#ffffff", accent: "#ffffff",
      text: "#ffffff", subtext: "#666666", success: "#00ff41", warning: "#ffea00", danger: "#ff003c",
      panelTint: "#ffffff", headerText: "#ffffff", fontFamily: "Inter, sans-serif", fontSizeBase: "16px", glassOpacity: "3%", glassBlur: "16px", radius: "1.5rem", bgGradient: "none"
    };
    setEditingThemeId(id);
    setActiveEditingTheme(newTheme);
    setOriginalThemeId(activeThemeId);
    setHasChanges(true);
    if (livePreview) {
      setCoreThemes((prev: any) => ({ ...prev, [id]: newTheme }));
      setActiveThemeId(id);
    }
  };

  return (
    <div className="flex flex-col w-full h-full relative transition-all duration-500">
      <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] w-full z-10">
        <h2 className="text-xl font-black text-[var(--text)] uppercase tracking-widest flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">cloud_sync</span>
          </div>
          <span className="truncate">{isKeepers ? (t("keepers_master_themes") || "SANCTUARY THEMES") : (t("wf_master_themes") || "COMMUNITY THEMES")} ({Object.keys(cloudThemes).length})</span>
        </h2>
        <div className="flex items-center gap-3 flex-1 justify-end">
          <div className="relative flex-1 max-w-[300px]">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 !text-sm">{t("icon_search") || "search"}</span>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t("ui_search_chameleons") || "Search Themes..."}
              className="w-full theme-glass-panel rounded-2xl pl-10 pr-10 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[var(--accent)]/50 placeholder:opacity-40"
            />
          </div>
          <button onClick={createNewTheme} className="h-12 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-105 shadow-lg font-black uppercase tracking-widest text-[10px] group">
            <span className="material-symbols-outlined !text-[16px] group-hover:scale-110 transition-transform duration-500">add</span>
            {t("auto_create") || "CREATE"}
          </button>
          <button onClick={fetchThemes} className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center shrink-0 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors">
            <span className={`material-symbols-outlined !text-[20px] text-[var(--text)] opacity-80 ${loading ? 'animate-spin' : ''}`}>refresh</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 relative">
        {loading && Object.keys(cloudThemes).length === 0 ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-12 h-12 border-4 border-[color-mix(in_srgb,var(--accent)_30%,transparent)] border-t-[var(--accent)] rounded-full animate-spin" />
          </div>
        ) : Object.keys(cloudThemes).length === 0 ? (
          <EmptyState icon="palette" title="No Cloud Themes" className="py-20" />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6 w-full">
            {Object.entries(cloudThemes).filter(([id, theme]: any) => !searchQuery || theme.name?.toLowerCase().includes(searchQuery.toLowerCase())).map(([id, theme]: any) => (
              <ThemeCard
                key={id}
                id={id}
                theme={theme}
                isCloud={true}
                onClick={() => openEditor(id)}
              />
            ))}
          </div>
        )}
      </div>

      <SidePanel
        isOpen={!!editingThemeId}
        onClose={closeEditor}
        title={t("ui_theme_editor") || "THEME EDITOR"}
        subtitle={t("wf_master_theme_edit") || "CLOUD MASTER SYNC"}
        icon="cloud"
        iconColorClass="theme-text-accent"
        isResizable={true}
        defaultWidth={1400}
        headerActions={
          <div className="flex items-center gap-2">
            <div className="flex items-center overflow-hidden theme-glass-panel rounded-2xl divide-x divide-[color-mix(in_srgb,var(--text)_10%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner backdrop-blur-md">
              <div className="relative group flex">
                <button onClick={() => {
                  if (livePreview) {
                    if (originalThemeId) setActiveThemeId(originalThemeId);
                  } else {
                    if (editingThemeId) {
                      if (activeEditingTheme) {
                        setCoreThemes((prev: any) => ({ ...prev, [editingThemeId]: activeEditingTheme }));
                      }
                      setActiveThemeId(editingThemeId);
                    }
                  }
                  setLivePreview(!livePreview);
                }} className={`h-12 px-4 flex items-center justify-center gap-2 transition-all shrink-0 ${livePreview ? 'text-[var(--success)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)]' : 'text-[color-mix(in_srgb,var(--text)_50%,transparent)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>
                  <span className="material-symbols-outlined !text-[18px]">{livePreview ? 'visibility' : 'visibility_off'}</span>
                  <span className="text-[10px] font-black uppercase tracking-widest">{livePreview ? (t("ui_os_preview_on") || "OS PREVIEW: ON") : (t("ui_os_preview_off") || "OS PREVIEW: OFF")}</span>
                </button>
              </div>
              <div className="relative group flex">
                <button onClick={() => {
                  if (originalThemeId) setActiveThemeId(originalThemeId);
                  pushStatus(t("ui_theme_reset") || "OS Theme Reset", "success");
                }} className="h-12 px-4 flex items-center justify-center gap-2 text-[color-mix(in_srgb,var(--text)_50%,transparent)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all shrink-0">
                  <span className="material-symbols-outlined !text-[18px]">refresh</span>
                  <span className="text-[10px] font-black uppercase tracking-widest">{t("btn_reset") || "RESET"}</span>
                </button>
              </div>
              <div className="relative group flex">
                <button onClick={() => {
                  if (editingThemeId) {
                    setActiveThemeId(editingThemeId);
                    setOriginalThemeId(editingThemeId);
                    setEditingThemeId(null);
                    pushStatus(t("ui_theme_applied") || "Theme Applied", "success");
                  }
                }} className="h-12 px-4 flex items-center justify-center gap-2 text-[color-mix(in_srgb,var(--text)_50%,transparent)] hover:text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)] transition-all shrink-0">
                  <span className="material-symbols-outlined !text-[18px]">check_circle</span>
                  <span className="text-[10px] font-black uppercase tracking-widest">{t("ui_btn_apply") || "APPLY THEME"}</span>
                </button>
              </div>
            </div>
          </div>
        }
        footer={
          <>
            <button onClick={saveToCloud} disabled={isSaving || !hasChanges} className={
              hasChanges 
                ? standardButtonClass.replace('bg-[color-mix(in_srgb,var(--text)_5%,transparent)]', 'bg-[color-mix(in_srgb,var(--warning)_15%,transparent)]').replace('border-[color-mix(in_srgb,var(--text)_10%,transparent)]', 'border-[color-mix(in_srgb,var(--warning)_50%,transparent)] text-[var(--warning)] shadow-[0_0_20px_color-mix(in_srgb,var(--warning)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--warning)_25%,transparent)] hover:shadow-[0_5px_20px_rgba(245,158,11,0.4)]')
                : standardButtonClass
            }>
              <span className={`material-symbols-outlined !text-[18px] ${isSaving ? 'animate-spin' : ''}`}>
                {isSaving ? 'sync' : 'cloud_upload'}
              </span>
              {t("btn_publish") || "SAVE TO CLOUD"}
            </button>
          </>
        }
      >
        {activeEditingTheme && (
          <div className="flex-1 flex w-full h-full overflow-hidden">
            <ChameleonControlDashboard
              currentTheme={activeEditingTheme}
              handleUpdateTheme={handleUpdateTheme}
              editingThemeId={editingThemeId}
              renameTheme={renameTheme}
            />
            <ChameleonSandboxPreview
              currentTheme={activeEditingTheme}
            />
          </div>
        )}
      </SidePanel>
    </div>
  );
}
