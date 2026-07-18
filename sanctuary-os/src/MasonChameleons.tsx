import { useState } from 'react';
import { createPortal } from 'react-dom';
import { SidePanel } from './shared';
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { useLexicon } from './LexiconContext';
import { useTheme } from './ThemeContext';
import { useStore } from './store';
import { MarketUploadPanel } from "./side-panels/NexusSidePanels";
import { standardButtonClass, standardAccentGlassButtonClass } from './shared';

import { ThemeCard } from './chameleon-components/ThemeCard';
import { ChameleonControlDashboard } from './chameleon-components/ChameleonControlDashboard';
import { ChameleonSandboxPreview } from './chameleon-components/ChameleonSandboxPreview';

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
  const { currentTheme: osTheme, activeThemeId, setActiveThemeId, CORE_THEMES, customThemes, devThemes, updateTheme, renameTheme, createNewDevTheme, exportDevThemeToCustom, importTheme, deleteTheme } = useTheme();

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
      const { supabase } = await import('./supabase');
      const { error } = await supabase.from('nexus_assets').insert([payload]);
      if (error) throw error;
      useStore.getState().pushStatus(`Theme published successfully.`, "success");
      setUploadState(s => ({ ...s, isOpen: false }));
    } catch (err: any) {
      useStore.getState().pushStatus(`Error: ${err.message}`, "error");
    }
  };

  const openEditor = (id: string) => {
    setEditingThemeId(id);
    setOriginalThemeId(activeThemeId);
    if (livePreview) setActiveThemeId(id);
  };

  return (
    <div className="flex flex-col w-full h-[calc(100vh-180px)] xl:h-[calc(100vh-140px)] relative transition-all duration-500">
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
            {t("auto_create") || "CREATE"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6 w-full">
          {Object.entries(customThemes).filter(([id, theme]: any) => !searchQuery || theme.name.toLowerCase().includes(searchQuery.toLowerCase())).map(([id, theme]: any) => (
            <ThemeCard 
              key={id} 
              id={id} 
              theme={theme} 
              isDev={false} 
              onClick={() => openEditor(id)} 
              onDelete={deleteTheme} 
              confirmDelete={confirmDelete}
              setConfirmDelete={setConfirmDelete}
            />
          ))}

          {Object.entries(devThemes).filter(([id, theme]: any) => !searchQuery || theme.name.toLowerCase().includes(searchQuery.toLowerCase())).map(([id, theme]: any) => (
            <ThemeCard 
              key={id} 
              id={id} 
              theme={theme} 
              isDev={true} 
              onClick={() => openEditor(id)} 
              onDelete={deleteTheme} 
              confirmDelete={confirmDelete}
              setConfirmDelete={setConfirmDelete}
            />
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
                    <span className="text-[10px] font-black uppercase tracking-widest">{t("btn_reset") || "RESET"}</span>
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
          <ChameleonControlDashboard 
            currentTheme={currentTheme}
            handleUpdateTheme={handleUpdateTheme}
            editingThemeId={editingThemeId}
            renameTheme={renameTheme}
          />
          <ChameleonSandboxPreview 
            currentTheme={currentTheme}
          />
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
