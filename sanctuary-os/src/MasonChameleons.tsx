import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CustomDropdown, SidePanel, HoverTooltip } from './shared';
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { useLexicon } from './LexiconContext';
import { useTheme } from './ThemeContext';
import { useStore } from './store';
import { MarketUploadPanel } from "./side-panels/NexusSidePanels";
import { standardButtonClass, standardPrimaryButtonClass, standardAccentGlassButtonClass } from './shared';

const HexToRGB = (hex: string) => {
  const cleanHex = (hex || '#000000').replace('#', '').padEnd(6, '0').slice(0, 6);
  const r = parseInt(cleanHex.slice(0, 2), 16) || 0;
  const g = parseInt(cleanHex.slice(2, 4), 16) || 0;
  const b = parseInt(cleanHex.slice(4, 6), 16) || 0;
  return { r, g, b };
}

const RGBToHex = (r: number, g: number, b: number) => {
  return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1).toUpperCase()}`;
}

const PRESET_COLORS = [
  '#000000', '#1a1a1a', '#2a2a2a', '#3a3a3a', '#555555', '#888888',
  '#f5f5f5', '#e0e0e0', '#cccccc', '#ffffff', '#ffcc00', '#4cd964',
  '#5ac8fa', '#007aff', '#5856d6', '#ff2d55', '#ff3b30', '#ff9500',
  '#ff4444', '#00c851', '#33b5e5', '#ffbb33', '#00ffff', '#ff00ff'
];

const SEMANTIC_SHADES: Record<string, string[]> = {
  success: [
    '#052e16', '#14532d', '#166534', '#15803d', '#16a34a', '#22c55e', '#4ade80', '#86efac',
    '#022c22', '#064e3b', '#065f46', '#047857', '#059669', '#10b981', '#34d399', '#6ee7b7'
  ],
  warning: [
    '#451a03', '#713f12', '#854d0e', '#a16207', '#ca8a04', '#eab308', '#facc15', '#fde047',
    '#422006', '#78350f', '#92400e', '#b45309', '#d97706', '#f59e0b', '#fbbf24', '#fcd34d'
  ],
  danger: [
    '#450a0a', '#7f1d1d', '#991b1b', '#b91c1c', '#dc2626', '#ef4444', '#f87171', '#fca5a5',
    '#4c0519', '#881337', '#9f1239', '#be123c', '#e11d48', '#f43f5e', '#fb7185', '#fda4af'
  ]
};



function CreateThemePanel({ isOpen, onClose, onSelect, CORE_THEMES, customThemes }: any) {
  const { t } = useLexicon();
  if (!isOpen) return null;
  return createPortal(
    <>
      <div className="fixed inset-0 z-[15000] bg-black/0 backdrop-blur-[3px] animate-in fade-in" onClick={onClose} />
      <div className="fixed top-10 right-0 bottom-10 w-[450px] max-w-[100vw] theme-glass-panel !border-y-0 !border-r-0 border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_0_100px_rgba(0,0,0,0.8)] flex flex-col z-[15001] animate-in slide-in-from-right duration-500 overflow-hidden backdrop-blur-[3px] rounded-tl-[3rem] rounded-bl-[3rem]" onClick={e => e.stopPropagation()}>
        <button type="button" onClick={onClose} className="absolute top-8 right-8 z-50 w-10 h-10 theme-glass-panel hover:theme-bg-danger text-[var(--text)] hover:text-white rounded-full flex items-center justify-center transition-all shadow-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
          <span className="material-symbols-outlined !text-[24px]">{t("icon_close")}</span>
        </button>
        <div className="px-8 pt-10 pb-6 relative flex-shrink-0 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
          <h3 className="text-2xl font-black text-[var(--text)] uppercase">Select Base Theme</h3>
          <p className="text-[10px] font-black text-[var(--subtext)] opacity-80 uppercase tracking-widest mt-1">Choose a blueprint to start your new signature</p>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-4">
          <button onClick={() => onSelect(null)} className="w-full p-4 rounded-2xl border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-[1.02] transition-all flex items-center gap-4 group text-left">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined text-[var(--accent)]">add</span>
            </div>
            <div>
              <h4 className="text-sm font-black text-[var(--accent)] uppercase tracking-widest">Blank Signature</h4>
              <p className="text-[10px] font-bold text-[var(--subtext)] opacity-80">Start completely from scratch</p>
            </div>
          </button>

          <h4 className="text-[10px] font-black text-[var(--subtext)] opacity-80 uppercase tracking-widest mt-4 ml-2">Core Architectures</h4>
          {Object.entries(CORE_THEMES).map(([id, theme]: any) => (
            <button key={id} onClick={() => onSelect(theme)} className="w-full p-4 rounded-2xl theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] hover:scale-[1.02] transition-all flex items-center gap-4 text-left">
              <div className="w-12 h-12 rounded-xl shrink-0" style={{ backgroundColor: theme.bg || '#000', border: `1px solid ${theme.accent || '#fff'}` }} />
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-black text-[var(--text)] uppercase tracking-widest truncate">{theme.name}</h4>
                <p className="text-[10px] font-bold text-[var(--subtext)] opacity-80 truncate">Core OS Theme</p>
              </div>
            </button>
          ))}

          <h4 className="text-[10px] font-black text-[var(--subtext)] opacity-80 uppercase tracking-widest mt-4 ml-2">Your Personal Themes</h4>
          {Object.entries(customThemes).map(([id, theme]: any) => (
            <button key={id} onClick={() => onSelect(theme)} className="w-full p-4 rounded-2xl theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] hover:scale-[1.02] transition-all flex items-center gap-4 text-left">
              <div className="w-12 h-12 rounded-xl shrink-0" style={{ backgroundColor: theme.bg || '#000', border: `1px solid ${theme.accent || '#fff'}` }} />
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-black text-[var(--text)] uppercase tracking-widest truncate">{theme.name}</h4>
                <p className="text-[10px] font-bold text-[var(--subtext)] opacity-80 truncate">Custom Theme</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>, document.body
  );
}

export function MasonChameleons({ masonProfile }: { masonProfile: any }) {
  const { t } = useLexicon();
  const { currentTheme: osTheme, activeThemeId, setActiveThemeId, CORE_THEMES, customThemes, devThemes, updateActiveTheme, updateTheme, renameTheme, createNewDevTheme, exportDevThemeToCustom, createNewTheme, importTheme, deleteTheme } = useTheme();
  const setView = useStore((state: any) => state.setView);
  const setMarketTab = useStore((state: any) => state.setMarketTab);

  const [editingThemeId, setEditingThemeId] = useState<string | null>(null);
  const [livePreview, setLivePreview] = useState(false);
  const [originalThemeId, setOriginalThemeId] = useState(activeThemeId);
  const [searchQuery, setSearchQuery] = useState("");

  const allThemes = { ...customThemes, ...devThemes, ...CORE_THEMES };
  const currentTheme = (editingThemeId && allThemes[editingThemeId]) ? allThemes[editingThemeId] : osTheme;

  const handleUpdateTheme = (updates: any) => {
    if (editingThemeId) {
      updateTheme(editingThemeId, updates);
    }
  };
  const [newThemeName, setNewThemeName] = useState("");
  const [activeColorPicker, setActiveColorPicker] = useState<string | null>(null);

  const colorPickerRefs = useRef<any>({});
  const [favColors, setFavColors] = useState<string[]>(() => JSON.parse(localStorage.getItem("sanctuary_fav_colors") || '[]'));

  const toggleFavColor = (color: string) => {
    let updated;
    if (favColors.includes(color)) updated = favColors.filter(c => c !== color);
    else updated = [...favColors, color].slice(-12);
    setFavColors(updated);
    localStorage.setItem("sanctuary_fav_colors", JSON.stringify(updated));
  };

  const handleExportTheme = async (e: React.MouseEvent, themeObj: any) => {
    e.stopPropagation();
    try {
      const vaultPath = useStore.getState().vaultPath;
      const defaultPath = vaultPath ? `${vaultPath}\\Data\\Themes\\${themeObj.name}.json` : `${themeObj.name}.json`;
      const path = await save({ defaultPath, filters: [{ name: 'JSON', extensions: ['json'] }] });
      if (path) await writeTextFile(path, JSON.stringify(themeObj, null, 2));
    } catch (err) { useStore.getState().pushStatus(`${t("alert_export_failed")}${err}`); }
  };

  const handleImportTheme = async () => {
    try {
      const selected = await open({ filters: [{ name: 'Theme', extensions: ['json'] }] });
      if (!selected) return;
      const content = await readTextFile(selected as string);
      importTheme(JSON.parse(content));
    } catch (err) { useStore.getState().pushStatus(`${t("alert_import_failed")}${err}`); }
  };

  // Re-ordered themeKeys to place traffic lights at the end!
  const themeKeys = ['bg', 'sidebar', 'sidebartext', 'accent', 'text', 'subtext', 'panelTint', 'headerText', 'success', 'warning', 'danger'];

  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | false>(false);
  const [uploadState, setUploadState] = useState({
    isOpen: false, editId: null as string | null, assetType: 'chameleon', isHidden: false,
    fileContent: null as any, fileName: '', name: '', version: '1.0.0', description: '', releaseNotes: '',
    language: 'English', newLanguage: '', lexiconType: 'Theme', themeMode: 'Dark'
  });

  const publishThemeToNexus = () => {
    const bgHex = (currentTheme.bg || '#000000').replace('#', '');
    let themeMode = 'Dark';
    if (bgHex.length === 6) {
      const r = parseInt(bgHex.substring(0, 2), 16);
      const g = parseInt(bgHex.substring(2, 4), 16);
      const b = parseInt(bgHex.substring(4, 6), 16);
      const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
      themeMode = yiq >= 128 ? 'Light' : 'Dark';
    }

    setUploadState({
      isOpen: true, editId: null, assetType: 'chameleon', isHidden: false,
      fileContent: currentTheme, fileName: currentTheme.name + '.json', name: currentTheme.name, version: '1.0.0',
      description: '', releaseNotes: '', language: 'English', newLanguage: '', lexiconType: 'Theme', themeMode
    });
  };

  const submitUpload = async () => {
    try {
      const payload = {
        name: uploadState.name, version: uploadState.version, description: uploadState.description, release_notes: uploadState.releaseNotes,
        json_data: uploadState.fileContent, asset_type: 'chameleon', is_public: true, theme_mode: uploadState.themeMode, author: masonProfile.name, downloads: 0
      };
      // Use dynamic import for supabase since it's not at the top level
      const { supabase } = await import('./supabase');
      const { error } = await supabase.from('nexus_assets').insert([payload]);
      if (error) throw error;
      useStore.getState().pushStatus(`Theme published successfully.`, "success");
      setUploadState(s => ({ ...s, isOpen: false }));
    } catch (err: any) {
      useStore.getState().pushStatus(`Error: ${err.message}`, "error");
    }
  };

  return (
    <div className="flex flex-col w-full h-[calc(100vh-180px)] xl:h-[calc(100vh-140px)] relative transition-all duration-500">
      {/* HEADER - NOW FULL WIDTH WITHOUT BACKGROUND */}
      <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] w-full z-10">
        <h2 className="text-xl font-black text-[var(--text)] uppercase tracking-widest flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">palette</span>
          </div>
          <span className="truncate">{t("forge_title") || "MATRIX FORGE"}</span>        </h2>
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
          <button onClick={() => setIsCreatePanelOpen(true)} className="h-12 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-105 shadow-lg font-black uppercase tracking-widest text-[10px] group">
            <span className="material-symbols-outlined !text-[16px] group-hover:scale-110 transition-transform duration-500">add</span>
            {t("ui_btn_create") || "CREATE"}
          </button>
        </div>
      </div>

      {/* CARDS GRID FOR THEMES */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6 w-full">

          {/* CUSTOM THEMES */}
          {Object.entries(customThemes).filter(([id, theme]: any) => !searchQuery || theme.name.toLowerCase().includes(searchQuery.toLowerCase())).map(([id, theme]: any) => (
            <div key={id} onClick={() => { setEditingThemeId(id); setOriginalThemeId(activeThemeId); if (livePreview) setActiveThemeId(id); }} className="w-full text-left p-6 rounded-[var(--radius)] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_20px_40px_rgba(0,0,0,0.3)] flex flex-col gap-4 relative group group-hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] cursor-pointer border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]">
              <div className="absolute inset-0 rounded-[var(--radius)] bg-gradient-to-br from-[var(--accent)]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              
              <div className="w-14 h-14 rounded-2xl shrink-0 overflow-hidden relative border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_0_15px_color-mix(in_srgb,var(--text)_10%,transparent)] group-hover:border-[var(--accent)]/50 transition-colors z-10">
                <div className="absolute inset-0" style={{ backgroundColor: theme.bg || '#000' }} />
                <div className="absolute top-0 left-0 bottom-0 w-4" style={{ backgroundColor: theme.sidebar || '#000' }} />
                <div className="absolute top-2 right-2 w-3 h-3 rounded-full" style={{ backgroundColor: theme.accent || '#fff' }} />
              </div>
              
              <div className="flex flex-col gap-1 z-10 pr-10 text-left">
                <span className="text-sm font-black text-[var(--text)] tracking-wider truncate block">{theme.name}</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtext)] opacity-60 block">{t("ui_personal_theme") || "Personal Theme"}</span>
              </div>
              
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirmDelete === id) { deleteTheme(id); setConfirmDelete(false); }
                  else { setConfirmDelete(id); }
                }}
                onMouseLeave={() => setConfirmDelete(false)}
                className={`absolute top-6 right-6 w-8 h-8 rounded-full flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 backdrop-blur-xl z-20 ${confirmDelete === id ? 'bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border border-[var(--danger)] text-[var(--danger)] shadow-[0_0_20px_color-mix(in_srgb,var(--danger)_40%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_25%,transparent)] hover:scale-110' : 'bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:scale-110'}`}
              >
                <span className="material-symbols-outlined !text-[14px]">{confirmDelete === id ? 'warning' : 'delete'}</span>
              </button>
            </div>
          ))}

          {/* DEV THEMES */}
          {Object.entries(devThemes).filter(([id, theme]: any) => !searchQuery || theme.name.toLowerCase().includes(searchQuery.toLowerCase())).map(([id, theme]: any) => (
            <div key={id} onClick={() => { setEditingThemeId(id); setOriginalThemeId(activeThemeId); if (livePreview) setActiveThemeId(id); }} className="w-full text-left p-6 rounded-[var(--radius)] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_20px_40px_rgba(0,0,0,0.3)] flex flex-col gap-4 relative group bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] cursor-pointer border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)]">
              <div className="absolute inset-0 rounded-[var(--radius)] bg-gradient-to-br from-[var(--accent)]/15 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              
              <div className="w-14 h-14 rounded-2xl shrink-0 overflow-hidden relative border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_20%,transparent)] group-hover:border-[var(--accent)]/60 transition-colors z-10">
                <div className="absolute inset-0" style={{ backgroundColor: theme.bg || '#000' }} />
                <div className="absolute top-0 left-0 bottom-0 w-4" style={{ backgroundColor: theme.sidebar || '#000' }} />
                <div className="absolute top-2 right-2 w-3 h-3 rounded-full" style={{ backgroundColor: theme.accent || '#fff' }} />
              </div>
              
              <div className="flex flex-col gap-1 z-10 pr-10 text-left">
                <span className="text-sm font-black text-[var(--text)] tracking-wider truncate block">{theme.name}</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--accent)] opacity-80 block">{t("ui_active_workspace") || "Active Workspace"}</span>
              </div>
              
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirmDelete === id) { deleteTheme(id); setConfirmDelete(false); }
                  else { setConfirmDelete(id); }
                }}
                onMouseLeave={() => setConfirmDelete(false)}
                className={`absolute top-6 right-6 w-8 h-8 rounded-full flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 backdrop-blur-xl z-20 ${confirmDelete === id ? 'bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border border-[var(--danger)] text-[var(--danger)] shadow-[0_0_20px_color-mix(in_srgb,var(--danger)_40%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_25%,transparent)] hover:scale-110' : 'bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:scale-110'}`}
              >
                <span className="material-symbols-outlined !text-[14px]">{confirmDelete === id ? 'warning' : 'delete'}</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      <SidePanel
        isOpen={!!editingThemeId}
        onClose={() => { setEditingThemeId(null); setActiveThemeId(originalThemeId); }}
        title={t("ui_theme_editor") || "THEME EDITOR"}
        subtitle={typeof editingThemeId === 'string' && editingThemeId.startsWith('dev_') ? (t("ui_dev_matrix") || "DEVELOPMENT MATRIX") : (t("ui_system_theme") || "SYSTEM THEME")}
        icon="palette"
        iconColorClass="theme-text-accent"
        isResizable={true}
        defaultWidth={1400}
        headerActions={
          typeof editingThemeId === 'string' && editingThemeId.startsWith('dev_') ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center overflow-hidden theme-glass-panel rounded-2xl divide-x divide-[color-mix(in_srgb,var(--text)_10%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner backdrop-blur-md">
                <div className="relative group flex">
                  <button onClick={() => {
                    if (livePreview) setActiveThemeId(originalThemeId);
                    else setActiveThemeId(editingThemeId);
                    setLivePreview(!livePreview);
                  }} className={`h-12 px-4 flex items-center justify-center gap-2 transition-all shrink-0 ${livePreview ? 'text-[var(--success)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)]' : 'text-[color-mix(in_srgb,var(--text)_50%,transparent)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>
                    <span className="material-symbols-outlined !text-[18px]">{livePreview ? 'visibility' : 'visibility_off'}</span>
                    <span className="text-[10px] font-black uppercase tracking-widest">{livePreview ? (t("ui_os_preview_on") || "OS PREVIEW: ON") : (t("ui_os_preview_off") || "OS PREVIEW: OFF")}</span>
                  </button>
                </div>
                <div className="relative group flex">
                  <button onClick={() => {
                    setActiveThemeId(originalThemeId);
                    useStore.getState().pushStatus(t("ui_theme_reset") || "OS Theme Reset", "success");
                  }} className="h-12 px-4 flex items-center justify-center gap-2 text-[color-mix(in_srgb,var(--text)_50%,transparent)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all shrink-0">
                    <span className="material-symbols-outlined !text-[18px]">refresh</span>
                    <span className="text-[10px] font-black uppercase tracking-widest">{t("ui_btn_reset") || "RESET"}</span>
                  </button>
                </div>
                <div className="relative group flex">
                  <button onClick={() => {
                    setActiveThemeId(editingThemeId);
                    setOriginalThemeId(editingThemeId);
                    setEditingThemeId(null);
                    useStore.getState().pushStatus(t("ui_theme_applied") || "Theme Applied", "success");
                  }} className="h-12 px-4 flex items-center justify-center gap-2 text-[color-mix(in_srgb,var(--text)_50%,transparent)] hover:text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)] transition-all shrink-0">
                    <span className="material-symbols-outlined !text-[18px]">check_circle</span>
                    <span className="text-[10px] font-black uppercase tracking-widest">{t("ui_btn_apply") || "APPLY THEME"}</span>
                  </button>
                </div>
              </div>
            </div>
          ) : undefined
        }
        footer={
          typeof editingThemeId === 'string' && editingThemeId.startsWith('dev_') ? (
            <>
              <button onClick={publishThemeToNexus} className={standardAccentGlassButtonClass}>
                <span className="material-symbols-outlined !text-[18px]">cloud_upload</span>
                {t("btn_publish") || "PUBLISH TO NEXUS"}
              </button>
              <button onClick={() => {
                exportDevThemeToCustom(editingThemeId);
                useStore.getState().pushStatus(t("ui_saved_personal") || "Saved to Personal Themes", "success");
              }} className={standardButtonClass}>
                <span className="material-symbols-outlined !text-[18px]">save</span>
                {t("ui_export_theme") || "SAVE TO VAULT"}
              </button>
            </>
          ) : undefined
        }
      >

        <div className="flex-1 flex w-full h-full overflow-hidden">
          {/* LEFT PANE: Control Dashboard */}
          <div className="flex-1 flex flex-col h-full border-r border-[color-mix(in_srgb,var(--text)_5%,transparent)] overflow-hidden">

            {/* SECONDARY HEADER: Editable Title */}
            <div className="flex gap-6 px-6 py-4 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-transparent shrink-0">
              <div className="flex-1 flex flex-col justify-start pt-1">
                <input
                  type="text"
                  value={currentTheme.name || ""}
                  onChange={(e) => typeof editingThemeId === 'string' && editingThemeId.startsWith('dev_') ? renameTheme(editingThemeId, e.target.value) : null}
                  className="w-full bg-transparent border-b border-transparent hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] focus:theme-border-accent outline-none text-3xl font-black text-[var(--text)] uppercase tracking-widest transition-colors py-1"
                  placeholder="THEME NAME"
                  disabled={typeof editingThemeId !== 'string' || !editingThemeId.startsWith('dev_')}
                />
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-60 mt-2 ml-1">{t("ui_use_dashboard") || "Use the dashboard below to construct your signature."}</p>
              </div>
            </div>

            {/* DASHBOARD SCROLL AREA */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-10 pb-32">

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-10">
                {themeKeys.map(key => (
                  <div key={key} className="flex flex-col gap-3 group">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] ml-1 text-[var(--subtext)] opacity-60 group-hover:text-[var(--text)] transition-colors">{t(`color_${key}`) || key.toUpperCase()}</label>
                    <div className="relative">
                      <div
                        className="flex items-center gap-4 cursor-pointer hover:scale-[1.02] active:scale-95 transition-all w-max"
                        onClick={() => setActiveColorPicker(activeColorPicker === key ? null : key)}
                      >
                        <div
                          ref={(el) => { colorPickerRefs.current[key] = el; }}
                          className="w-[4.5rem] h-12 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl overflow-hidden shrink-0 shadow-inner"
                          style={{ backgroundColor: currentTheme[key] }}
                        />
                        <code
                          className="text-xs font-black uppercase tracking-widest opacity-60 group-hover:opacity-100 transition-opacity"
                          style={{ color: currentTheme.text }}
                        >
                          {currentTheme[key]?.toUpperCase() || '#000000'}
                        </code>
                      </div>

                      {activeColorPicker === key && createPortal(
                        <>
                          <div className="fixed inset-0 z-[50000]" onClick={() => setActiveColorPicker(null)} />
                          <div className="fixed z-[50001] p-8 theme-glass-panel backdrop-blur-3xl rounded-[var(--radius)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_20px_50px_rgba(0,0,0,0.5)] w-[26rem] animate-in fade-in zoom-in-95 duration-200"
                            style={{
                              top: Math.min(colorPickerRefs.current[key]?.getBoundingClientRect().bottom + 12, window.innerHeight - 350),
                              left: Math.min(colorPickerRefs.current[key]?.getBoundingClientRect().left, window.innerWidth - 450),
                            }}>
                            <div className="flex gap-4 mb-8">
                              {!(key === 'success' || key === 'warning' || key === 'danger') ? (
                                <input
                                  type="text"
                                  value={currentTheme[key]}
                                  onChange={(e) => handleUpdateTheme({ [key]: e.target.value })}
                                  className="flex-1 theme-glass-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl px-5 py-4 text-xs font-black text-[var(--text)] uppercase tracking-widest outline-none focus:theme-border-accent transition-colors shadow-inner"
                                />
                              ) : (
                                <div className="flex-1 theme-glass-panel border border-[var(--warning)]/40 rounded-2xl shadow-lg shadow-[var(--warning)]/10 flex items-center justify-center text-center relative overflow-hidden">
                                  <div className="absolute inset-0 bg-[var(--warning)] opacity-10 pointer-events-none" />
                                  <span className="relative z-10 text-[var(--warning)] px-5 py-4 text-[10px] font-black uppercase tracking-[0.2em] drop-shadow-sm">
                                    {t("color_restricted") || "SEMANTIC LOCK ACTIVE"}
                                  </span>
                                </div>
                              )}
                              {!(key === 'success' || key === 'warning' || key === 'danger') && (
                                <div className="w-12 h-12 rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shrink-0 shadow-inner flex items-center justify-center cursor-pointer hover:scale-110 transition-transform group/fav" style={{ backgroundColor: currentTheme[key] }} onClick={() => toggleFavColor(currentTheme[key])}>
                                  {favColors.includes(currentTheme[key]) ? <span className="text-yellow-500 text-2xl drop-shadow-md">★</span> : <span className="opacity-0 group-hover/fav:opacity-50 text-white font-black text-2xl material-symbols-outlined">{t("icon_add")}</span>}
                                </div>
                              )}
                            </div>
                            <div className="grid grid-cols-8 gap-3 mb-6">
                              {(SEMANTIC_SHADES[key] || PRESET_COLORS).map(color => (
                                <button
                                  key={color}
                                  onClick={() => handleUpdateTheme({ [key]: color })}
                                  className={`w-7 h-7 rounded-full border hover:scale-125 transition-all shadow-sm ${currentTheme[key]?.toLowerCase() === color ? 'theme-border-accent scale-110 shadow-[0_0_15px_var(--accent)]' : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)]'}`}
                                  style={{ backgroundColor: color }}
                                />
                              ))}
                            </div>
                            {favColors.length > 0 && !(key === 'success' || key === 'warning' || key === 'danger') && (
                              <div className="mb-8 pt-6 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] mb-4">{t("color_favs") || "FAVORITES"}</h4>
                                <div className="flex flex-wrap gap-3">
                                  {favColors.map(color => (
                                    <button
                                      key={color}
                                      onClick={() => handleUpdateTheme({ [key]: color })}
                                      className={`w-7 h-7 rounded-xl border hover:scale-125 transition-all shadow-sm ${currentTheme[key]?.toLowerCase() === color.toLowerCase() ? 'theme-border-accent scale-110 shadow-[0_0_15px_var(--accent)]' : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)]'}`}
                                      style={{ backgroundColor: color }}
                                    />
                                  ))}
                                </div>
                              </div>
                            )}
                            {!(key === 'success' || key === 'warning' || key === 'danger') && (
                              <div className="flex flex-col gap-4 pt-6 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                                <div className="flex items-center gap-4">
                                  <span className="text-xs font-black opacity-50 w-3 text-center text-red-500">{t("color_r") || "R"}</span>
                                  <input
                                    type="range" min="0" max="255"
                                    value={HexToRGB(currentTheme[key]).r}
                                    onChange={(e) => handleUpdateTheme({ [key]: RGBToHex(parseInt(e.target.value), HexToRGB(currentTheme[key]).g, HexToRGB(currentTheme[key]).b) })}
                                    className="flex-1 h-3 bg-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-red-500 [&::-webkit-slider-thumb]:rounded-full cursor-pointer shadow-inner"
                                  />
                                </div>
                                <div className="flex items-center gap-4">
                                  <span className="text-xs font-black opacity-50 w-3 text-center text-green-500">{t("color_g") || "G"}</span>
                                  <input
                                    type="range" min="0" max="255"
                                    value={HexToRGB(currentTheme[key]).g}
                                    onChange={(e) => handleUpdateTheme({ [key]: RGBToHex(HexToRGB(currentTheme[key]).r, parseInt(e.target.value), HexToRGB(currentTheme[key]).b) })}
                                    className="flex-1 h-3 bg-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-green-500 [&::-webkit-slider-thumb]:rounded-full cursor-pointer shadow-inner"
                                  />
                                </div>
                                <div className="flex items-center gap-4">
                                  <span className="text-xs font-black opacity-50 w-3 text-center text-blue-500">{t("color_b") || "B"}</span>
                                  <input
                                    type="range" min="0" max="255"
                                    value={HexToRGB(currentTheme[key]).b}
                                    onChange={(e) => handleUpdateTheme({ [key]: RGBToHex(HexToRGB(currentTheme[key]).r, HexToRGB(currentTheme[key]).g, parseInt(e.target.value)) })}
                                    className="flex-1 h-3 bg-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full cursor-pointer shadow-inner"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </>, document.body
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-14 mb-8 flex items-center gap-4 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-4">
                <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">tune</span>
                <h2 className="text-[14px] font-black uppercase tracking-[0.15em] text-[var(--text)]">{t("forge_typography") || "Typography"}</h2>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                <div className="flex flex-col gap-4">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] ml-1 text-[var(--subtext)] opacity-60">{t("forge_font_family") || "Primary Font"}</label>
                  <div className="flex flex-wrap gap-3">
                    {["Inter, sans-serif", "'Space Mono', monospace", "'Orbitron', sans-serif", "'Fira Code', monospace", "'Rajdhani', sans-serif", "'Share Tech Mono', monospace", "'VT323', monospace", "Courier New, monospace"].map(font => (
                      <button
                        key={font}
                        onClick={() => handleUpdateTheme({ fontFamily: font })}
                        className={`px-5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${currentTheme.fontFamily === font || (!currentTheme.fontFamily && font.includes('Inter')) ? 'theme-glass-panel border-[var(--accent)] theme-text-accent shadow-[0_0_30px_rgba(var(--accent-rgb),0.5)] scale-105' : 'theme-glass-panel hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner'}`}
                        style={{
                          fontFamily: font,
                          backgroundColor: (currentTheme.fontFamily === font || (!currentTheme.fontFamily && font.includes('Inter'))) ? "color-mix(in srgb, var(--accent) 15%, transparent)" : undefined
                        }}
                      >
                        {font.split(',')[0].replace("'", "").replace("'", "")}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-6">
                  {[
                    { key: 'fontSizeHeader', label: t('forge_font_header') || 'Headers', def: '1.875', max: 4 },
                    { key: 'fontSizeSubheader', label: t('forge_font_subheader') || 'Sub Headers', def: '1.5', max: 3 },
                    { key: 'fontSizeTitle', label: t('forge_font_title') || 'Titles', def: '1.25', max: 2.5 },
                    { key: 'fontSizeSubtitle', label: t('forge_font_subtitle') || 'Sub Titles', def: '1.125', max: 2 },
                    { key: 'fontSizeText', label: t('forge_font_text') || 'Text', def: '1', max: 2 },
                    { key: 'fontSizeSubtext', label: t('forge_font_subtext') || 'Sub Text', def: '0.75', max: 1.5 },
                    { key: 'fontSizeSidebar', label: t('forge_font_sidebar') || 'Side Bar Font', def: '10', max: 20, isPx: true },
                    { key: 'sidebarWidth', label: t('forge_sidebar_width') || 'Side Bar Width', def: '288', max: 500, min: 200, isPx: true }
                  ].map(cfg => (
                    <div key={cfg.key} className="flex flex-col gap-3">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] ml-1 text-[var(--subtext)] opacity-80 flex justify-between">
                        <span>{cfg.label}</span>
                        <span className="theme-text-accent">{currentTheme[cfg.key] || (cfg.isPx ? `${cfg.def}px` : `${cfg.def}rem`)}</span>
                      </label>
                      <input
                        type="range" min={cfg.min !== undefined ? cfg.min : (cfg.isPx ? 6 : 0.5)} max={cfg.max} step={cfg.isPx ? 1 : 0.125}
                        value={parseFloat(currentTheme[cfg.key] || cfg.def) || parseFloat(cfg.def)}
                        onChange={(e) => handleUpdateTheme({ [cfg.key]: cfg.isPx ? `${e.target.value}px` : `${e.target.value}rem` })}
                        className="w-full sanctuary-slider"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-14 mb-8 flex items-center gap-4 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-4">
                <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">tune</span>
                <h2 className="text-[14px] font-black uppercase tracking-[0.15em] text-[var(--text)]">{t("forge_glass") || "Glass & Material"}</h2>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                <div className="flex flex-col gap-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] ml-1 text-[var(--subtext)] opacity-80 flex justify-between">
                    <span>{t("forge_glass_opacity") || "Panel Opacity"}</span>
                    <span className="theme-text-accent">{currentTheme.glassOpacity || "3%"}</span>
                  </label>
                  <input
                    type="range" min="0" max="100" step="1"
                    value={parseFloat(currentTheme.glassOpacity || '3')}
                    onChange={(e) => handleUpdateTheme({ glassOpacity: `${e.target.value}%` })}
                    className="w-full sanctuary-slider"
                  />
                </div>

                <div className="flex flex-col gap-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] ml-1 text-[var(--subtext)] opacity-80 flex justify-between">
                    <span>{t("forge_glass_blur") || "Frosted Blur"}</span>
                    <span className="theme-text-accent">{currentTheme.glassBlur || "16px"}</span>
                  </label>
                  <input
                    type="range" min="0" max="64" step="1"
                    value={parseInt(currentTheme.glassBlur || "16") || 16}
                    onChange={(e) => handleUpdateTheme({ glassBlur: `${e.target.value}px` })}
                    className="w-full sanctuary-slider"
                  />
                </div>
              </div>

              <div className="mt-14 mb-8 flex items-center gap-4 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-4">
                <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">tune</span>
                <h2 className="text-[14px] font-black uppercase tracking-[0.15em] text-[var(--text)]">{t("forge_geometry") || "Shape Geometry"}</h2>
              </div>

              <div className="flex flex-col gap-3">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] ml-1 text-[var(--subtext)] opacity-80 flex justify-between">
                  <span>{t("forge_radius") || "Border Radius"}</span>
                  <span className="theme-text-accent">{currentTheme.radius || "1.5rem"}</span>
                </label>
                <input
                  type="range" min="0" max="4" step="0.125"
                  value={parseFloat(currentTheme.radius || "1.5") || 1.5}
                  onChange={(e) => handleUpdateTheme({ radius: `${e.target.value}rem` })}
                  className="w-full sanctuary-slider"
                />
              </div>

              <div className="mt-14 mb-8 flex items-center gap-4 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-4">
                <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">tune</span>
                <h2 className="text-[14px] font-black uppercase tracking-[0.15em] text-[var(--text)]">{t("forge_background") || "Background Override"}</h2>
              </div>

              <div className="flex flex-col gap-6">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] ml-1 text-[var(--subtext)] opacity-80">{t("forge_bg_selector") || "Gradient Preset"}</label>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {[
                    { id: 'none', label: 'Solid' },
                    { id: 'linear-gradient(to bottom right, #171520, #241b2f)', label: 'Miami Neon' },
                    { id: 'radial-gradient(circle at center, #1e1b4b, #000000)', label: 'Abyssal Void' },
                    { id: 'linear-gradient(135deg, rgba(2,0,36,1) 0%, rgba(9,9,121,1) 35%, rgba(0,212,255,1) 100%)', label: 'Ocean Matrix' },
                    { id: 'radial-gradient(circle at top right, #3f3f46, #000000)', label: 'Slate Glow' },
                    { id: 'linear-gradient(to top, #3b82f620, transparent)', label: 'Data Stream' }
                  ].map(preset => (
                    <button
                      key={preset.id}
                      onClick={() => handleUpdateTheme({ bgGradient: preset.id })}
                      className={`aspect-video rounded-xl border transition-all flex flex-col items-center justify-center gap-2 p-2 relative overflow-hidden group shadow-lg ${currentTheme.bgGradient === preset.id || (!currentTheme.bgGradient && preset.id === 'none') ? 'border-[var(--accent)] shadow-[0_0_20px_rgba(var(--accent-rgb),0.4)] scale-[1.02]' : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)]'}`}
                      style={{
                        backgroundColor: (currentTheme.bgGradient === preset.id || (!currentTheme.bgGradient && preset.id === 'none')) ? "color-mix(in srgb, var(--accent) 15%, transparent)" : undefined
                      }}
                    >
                      <div className="absolute inset-0 opacity-40 group-hover:opacity-100 transition-opacity" style={{ background: preset.id === 'none' ? currentTheme.bg : preset.id }} />
                      <span className={`relative z-10 text-[9px] font-black uppercase tracking-widest drop-shadow-md text-center ${(currentTheme.bgGradient === preset.id || (!currentTheme.bgGradient && preset.id === 'none')) ? 'theme-text-accent text-shadow-[0_0_10px_var(--accent)]' : 'text-white'}`}>{preset.label}</span>
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  value={currentTheme.bgGradient || "none"}
                  onChange={(e) => handleUpdateTheme({ bgGradient: e.target.value })}
                  className="w-full theme-glass-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-5 py-4 text-[10px] font-mono text-[var(--text)] uppercase tracking-widest outline-none focus:theme-border-accent transition-all shadow-inner"
                  placeholder={t("ui_bg_gradient_ph") || "linear-gradient(to bottom, #000, #111)"}
                />
              </div>
            </div>
          </div>

          {/* RIGHT PANE: Sandbox Preview */}
          <div className="w-[400px] xl:w-[480px] shrink-0 h-full border-l border-[color-mix(in_srgb,var(--text)_5%,transparent)] relative flex flex-col theme-glass-panel !rounded-none overflow-hidden z-0" style={{
            backgroundColor: `color-mix(in srgb, ${currentTheme.bg} 15%, transparent)`,
            '--bg': currentTheme.bg,
            '--text': currentTheme.text,
            '--subtext': currentTheme.subtext,
            '--accent': currentTheme.accent,
            '--accent-rgb': `${HexToRGB(currentTheme.accent).r}, ${HexToRGB(currentTheme.accent).g}, ${HexToRGB(currentTheme.accent).b}`,
            '--sidebar': currentTheme.sidebar,
            '--sidebartext': currentTheme.sidebartext,
            '--success': currentTheme.success,
            '--warning': currentTheme.warning,
            '--danger': currentTheme.danger,
            '--panelTint': currentTheme.panelTint,
            '--headerText': currentTheme.headerText,
            '--radius': currentTheme.radius,
            '--bgGradient': currentTheme.bgGradient || currentTheme.bg,
            fontFamily: currentTheme.fontFamily || 'Inter, sans-serif'
          } as React.CSSProperties}>

            <div className="absolute inset-0 flex z-10">
              {/* Fake Content Area */}
              <div className="flex-1 flex flex-col p-8 gap-10 overflow-y-auto custom-scrollbar pt-10 pb-32">

                {/* Header Section */}
                <div className="flex flex-col gap-3">
                  <h1 style={{ fontSize: `${currentTheme.fontSizeHeader || '1.875'}rem`, color: currentTheme.headerText || currentTheme.text, fontWeight: '900', lineHeight: 1.1 }}>
                    {t("forge_preview") || "Sandbox"}
                  </h1>
                  <p style={{ fontSize: `${currentTheme.fontSizeText || '1'}rem`, color: currentTheme.subtext, opacity: 0.8 }}>
                    {t("forge_preview_desc") || "Test your typography, glass, and semantic colors live."}
                  </p>
                </div>

                {/* Fake Glass Panel */}
                <div className="p-8 flex flex-col gap-4 border" style={{
                  backgroundColor: `color-mix(in srgb, ${currentTheme.panelTint || '#ffffff'} ${currentTheme.glassOpacity || '3%'}, transparent)`,
                  backdropFilter: `blur(${currentTheme.glassBlur || '16px'})`,
                  WebkitBackdropFilter: `blur(${currentTheme.glassBlur || '16px'})`,
                  borderRadius: currentTheme.radius || '1.5rem',
                  borderColor: `color-mix(in srgb, ${currentTheme.text} 10%, transparent)`,
                  boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
                }}>
                  <h2 style={{ fontSize: `${currentTheme.fontSizeTitle || '1.25'}rem`, color: currentTheme.text, fontWeight: '800' }}>
                    {t("ui_forge_glass") || "Holographic Glass"}
                  </h2>
                  <p style={{ fontSize: `${currentTheme.fontSizeSubtext || '0.75'}rem`, color: currentTheme.subtext, lineHeight: 1.5 }}>
                    {t("ui_forge_glass_desc") || "This hologram reflects your active structural geometry, optical tint, and plasma blur settings."}
                  </p>

                  <button className="px-6 py-3 mt-4 w-max text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 border flex items-center justify-center gap-2 group" style={{
                    color: currentTheme.accent,
                    backgroundColor: `color-mix(in srgb, ${currentTheme.accent} 15%, transparent)`,
                    borderColor: `color-mix(in srgb, ${currentTheme.accent} 30%, transparent)`,
                    borderRadius: `calc(${currentTheme.radius || '1.5rem'} * 0.5)`,
                    boxShadow: `0 10px 30px rgba(0,0,0,0.3)`
                  }}>
                    <span className="material-symbols-outlined !text-[16px] group-hover:scale-110 transition-transform duration-500">add</span>
                    {t("ui_btn_create") || "CREATE"}
                  </button>
                </div>

                {/* Semantic Alerts */}
                <div className="flex flex-col gap-4">
                  <h3 style={{ fontSize: `${currentTheme.fontSizeSubtitle || '1.125'}rem`, color: currentTheme.text, fontWeight: '700' }}>
                    {t("forge_semantic") || "Semantic Colors"}
                  </h3>

                  {['success', 'warning', 'danger'].map((sem) => (
                    <div key={sem} className="p-5 border flex items-center gap-4" style={{
                      backgroundColor: `color-mix(in srgb, ${currentTheme[sem]} 10%, transparent)`,
                      borderColor: `color-mix(in srgb, ${currentTheme[sem]} 30%, transparent)`,
                      borderRadius: `calc(${currentTheme.radius || '1.5rem'} * 0.75)`,
                      color: currentTheme[sem],
                      boxShadow: `inset 0 0 20px color-mix(in srgb, ${currentTheme[sem]} 5%, transparent)`
                    }}>
                      <span className="material-symbols-outlined !text-[22px]">
                        {sem === 'success' ? 'check_circle' : sem === 'warning' ? 'warning' : 'error'}
                      </span>
                      <span className="text-xs font-black uppercase tracking-widest">{t(`color_${sem}`) || sem} Status</span>
                    </div>
                  ))}
                </div>

              </div>
            </div>
          </div>
        </div>
      </SidePanel>

      <MarketUploadPanel
        uploadState={uploadState}
        setUploadState={setUploadState}
        marketTab={'CHAMELEONS'}
        availableLanguages={[]}
        submitUpload={submitUpload}
        backdropZ="z-[50000]"
        panelZ="z-[50001]"
      />
      <CreateThemePanel isOpen={isCreatePanelOpen} onClose={() => setIsCreatePanelOpen(false)} onSelect={(t: any) => { setIsCreatePanelOpen(false); createNewDevTheme(t); }} CORE_THEMES={CORE_THEMES} customThemes={customThemes} />
    </div>
  );
}
