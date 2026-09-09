import { SearchBar, ScreenUtilityBar } from "./shared";
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { SidePanel } from './shared';
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile, readFile } from "@tauri-apps/plugin-fs";
import { useLexicon } from './LexiconContext';
import { useTheme } from './ThemeContext';
import { useStore } from './store';
import { MarketUploadPanel } from "./side-panels/NexusSidePanels";
import { standardButtonClass, standardAccentGlassButtonClass, ActionButton } from './shared';
import { CommandScreenSectionHeading } from './hub-components/SharedCommandScreenLayout';
import { ElevatedHubLayout } from './components/layouts/ElevatedHubLayout';

import { ThemeCard } from './chameleon-components/ThemeCard';
import { ChameleonControlDashboard } from './chameleon-components/ChameleonControlDashboard';
import { ChameleonSandboxPreview } from './chameleon-components/ChameleonSandboxPreview';
import { PanelHeaderGroup, PanelHeaderButton } from './shared';

function CreateThemePanel({ isOpen, onClose, onSelect, CORE_THEMES, customThemes }: any) {
  const { t } = useLexicon();
  return (
    <>
      <SidePanel
        isOpen={isOpen}
        onClose={onClose}
        widthClass="w-[800px] max-w-[95vw]"
        backdropZ="z-[15000]"
        panelZ="z-[15001]"
        title={t("theme_select_base")}
        subtitle={t("theme_choose_blueprint")}
        icon="palette"
      >
        <div className="flex flex-col gap-6">
          <button onClick={() => onSelect(null)} className="w-full p-4 rounded-2xl border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-[1.01] transition-all flex items-center gap-4 group text-left shadow-sm">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined text-[var(--accent)]">add</span>
            </div>
            <div>
              <h4 className="text-sm font-black text-[var(--accent)] capitalize tracking-widest">{t("theme_blank")}</h4>
              <p className="text-[10px] font-bold text-[var(--subtext)] opacity-80">{t("theme_scratch_desc")}</p>
            </div>
          </button>

          <div>
            <h4 className="text-[10px] font-black text-[var(--subtext)] opacity-80 capitalize tracking-widest mb-3 ml-2">{t("theme_core_arch")}</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(CORE_THEMES).map(([id, theme]: any) => (
                <button key={id} onClick={() => onSelect(theme)} className="w-full p-4 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] hover:scale-[1.02] transition-all flex items-center gap-4 text-left shadow-sm hover:shadow-md">
                  <div className="w-12 h-12 rounded-xl shrink-0" style={{ backgroundColor: theme.bg || '#000', border: `1px solid ${theme.accent || '#fff'}` }} />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-black text-[var(--text)] capitalize tracking-widest truncate">{theme.name}</h4>
                    <p className="text-[10px] font-bold text-[var(--subtext)] opacity-80 truncate">{t("theme_core_os")}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-[10px] font-black text-[var(--subtext)] opacity-80 capitalize tracking-widest mb-3 ml-2">{t("theme_personal")}</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(customThemes).map(([id, theme]: any) => (
                <button key={id} onClick={() => onSelect(theme)} className="w-full p-4 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] hover:scale-[1.02] transition-all flex items-center gap-4 text-left shadow-sm hover:shadow-md">
                  <div className="w-12 h-12 rounded-xl shrink-0" style={{ backgroundColor: theme.bg || '#000', border: `1px solid ${theme.accent || '#fff'}` }} />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-black text-[var(--text)] capitalize tracking-widest truncate">{theme.name}</h4>
                    <p className="text-[10px] font-bold text-[var(--subtext)] opacity-80 truncate">{t("theme_custom")}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </SidePanel>
    </>
  );
}
export function MasonChameleons({ masonProfile }: { masonProfile: any }) {
  const { t } = useLexicon();
  const session = useStore((state) => state.session);
  const { currentTheme: osTheme, activeThemeId, setActiveThemeId, CORE_THEMES, customThemes, devThemes, updateTheme, renameTheme, createNewDevTheme, exportDevThemeToCustom, importTheme, deleteTheme } = useTheme();

  const [editingThemeId, setEditingThemeId] = useState<string | null>(null);
  const [livePreview, setLivePreview] = useState(false);
  const [originalThemeId, setOriginalThemeId] = useState(activeThemeId);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<'overview' | 'local' | 'published'>('overview');
  const [publishedThemes, setPublishedThemes] = useState<any[]>([]);

  useEffect(() => {
    const fetchPublished = async () => {
      if (!masonProfile?.id) return;
      const { supabase } = await import('./supabase');
      const { data } = await supabase.from('nexus_assets')
        .select('*')
        .eq('asset_type', 'chameleon')
        .or(`mason_id.eq.${masonProfile.id},author.eq.${masonProfile.name}`);
      if (data) setPublishedThemes(data);
    };
    fetchPublished();
  }, [masonProfile?.id]);

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
      const { supabase } = await import('./supabase');
      let finalContent = { ...uploadState.fileContent };

      if (finalContent.bgImage && finalContent.bgImage.includes('asset.localhost')) {
        try {
          let localPath = finalContent.bgImage.replace(/^https?:\/\/asset\.localhost\//, '');
          localPath = decodeURIComponent(localPath);
          const fileData = await readFile(localPath);
          const ext = localPath.split('.').pop() || 'jpg';
          const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;

          useStore.getState().pushStatus('Uploading background image to cloud...');
          const { error: uploadError } = await supabase.storage
            .from('backgrounds')
            .upload(fileName, fileData, {
              contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
              upsert: true
            });

          if (uploadError) {
            console.error('Image Upload Error:', uploadError);
            throw new Error('Failed to upload background image.');
          }

          const { data: publicUrlData } = supabase.storage.from('backgrounds').getPublicUrl(fileName);
          finalContent.bgImage = publicUrlData.publicUrl;
        } catch (e: any) {
          console.error('Local Image Processing Error:', e);
          throw new Error('Failed to process and upload local background image: ' + e.message);
        }
      }

      let payload = {
        name: uploadState.name, version: uploadState.version, description: uploadState.description, release_notes: uploadState.releaseNotes,
        json_data: finalContent, asset_type: 'chameleon', is_public: true, theme_mode: uploadState.themeMode, author: masonProfile.name, mason_id: masonProfile.id, author_id: session?.user?.id || masonProfile.id, downloads: 0
      };

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

  const unpublishedCustomThemes = Object.entries(customThemes).filter(([id, theme]: any) => 
    !publishedThemes.some(pt => pt.name === theme.name)
  );

  const tabs = [
    {
      id: "overview",
      label: t("landing_overview") || "Overview",
      icon: "dashboard",
    },
    {
      id: "local",
      label: t("chameleon_local") || "Local",
      icon: "palette",
      number: unpublishedCustomThemes.length + Object.keys(devThemes).length
    },
    {
      id: "published",
      label: t("chameleon_published") || "Published",
      icon: "cloud",
      number: publishedThemes.length
    }
  ];

  const renderLanding = () => {
    return (
      <div className="flex flex-col gap-10 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[var(--accent)]">palette</span>
            <h3 className="text-sm font-black capitalize tracking-widest text-[var(--text)]">{t("theme_personal") || "Custom Themes"}</h3>
            <div className="flex-1 h-px bg-gradient-to-r from-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent"></div>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6">
            {Object.entries(customThemes).slice(0, 4).map(([id, theme]: any) => (
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
          </div>
        </div>
      </div>
    );
  };

  const renderList = () => {
    if (activeTab === 'published') {
      return (
        <div className="flex flex-col gap-10 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6 w-full">
            {publishedThemes.filter(pt => !searchQuery || pt.name.toLowerCase().includes(searchQuery.toLowerCase())).map((pt: any) => {
              const themeData = typeof pt.json_data === 'string' ? JSON.parse(pt.json_data) : pt.json_data;
              return (
                <ThemeCard
                  key={pt.id}
                  id={pt.id}
                  theme={themeData}
                  isDev={false}
                  onClick={() => openEditor(pt.id)}
                  onDelete={() => {}}
                  confirmDelete={confirmDelete}
                  setConfirmDelete={setConfirmDelete}
                  isCloud={true}
                />
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-10 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6 w-full">
          {unpublishedCustomThemes.filter(([id, theme]: any) => !searchQuery || theme.name.toLowerCase().includes(searchQuery.toLowerCase())).map(([id, theme]: any) => (
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
    );
  };

  return (
    <ElevatedHubLayout
      headerTitle={t("tab_chameleons") || "Chameleons"}
      headerIcon="palette"
      search={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder={(t("ui_search_chameleons") as string) || "Search Themes..."}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as any)}
      headerActions={
        <div className="flex items-center gap-2">
          <ActionButton onClick={() => setIsCreatePanelOpen(true)} iconOnly={true} icon="add" label={t("auto_create")} />
        </div>
      }
    >
      <div className="h-full flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-10">
        {activeTab === 'overview' ? renderLanding() : renderList()}
      </div>

      <SidePanel
        isOpen={!!editingThemeId}
        onClose={() => { setEditingThemeId(null); setActiveThemeId(originalThemeId); }}
        title={t("ui_theme_editor")}
        subtitle={typeof editingThemeId === 'string' && editingThemeId.startsWith('dev_') ? (t("ui_dev_matrix")) : (t("ui_system_theme"))}
        icon="palette"
        iconColorClass="theme-text-accent"
        isResizable={true}
        defaultWidth={1400}
        headerActions={
          typeof editingThemeId === 'string' && editingThemeId.startsWith('dev_') ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center glass-panel rounded-2xl divide-x divide-[color-mix(in_srgb,var(--text)_10%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner backdrop-blur-md">
                <div className="relative group flex">
                  <button onClick={() => {
                    if (livePreview) setActiveThemeId(originalThemeId);
                    else setActiveThemeId(editingThemeId);
                    setLivePreview(!livePreview);
                  }} className={`h-12 px-4 flex items-center justify-center gap-2 transition-all shrink-0 ${livePreview ? 'text-[var(--success)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)]' : 'text-[color-mix(in_srgb,var(--text)_50%,transparent)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>
                    <span className="material-symbols-outlined !text-[18px]">{livePreview ? 'visibility' : 'visibility_off'}</span>
                    <span className="text-[10px] font-black capitalize tracking-widest">{livePreview ? (t("ui_os_preview_on")) : (t("ui_os_preview_off"))}</span>
                  </button>
                </div>
                <div className="relative group flex">
                  <button onClick={() => {
                    setActiveThemeId(originalThemeId);
                    useStore.getState().pushStatus(t("ui_theme_reset"), "success");
                  }} className="h-12 px-4 flex items-center justify-center gap-2 text-[color-mix(in_srgb,var(--text)_50%,transparent)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all shrink-0">
                    <span className="material-symbols-outlined !text-[18px]">refresh</span>
                    <span className="text-[10px] font-black capitalize tracking-widest">{t("btn_reset")}</span>
                  </button>
                </div>
                <div className="relative group flex">
                  <button onClick={() => {
                    setActiveThemeId(editingThemeId);
                    setOriginalThemeId(editingThemeId);
                    setEditingThemeId(null);
                    useStore.getState().pushStatus(t("ui_theme_applied"), "success");
                  }} className="h-12 px-4 flex items-center justify-center gap-2 text-[color-mix(in_srgb,var(--text)_50%,transparent)] hover:text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)] transition-all shrink-0">
                    <span className="material-symbols-outlined !text-[18px]">check_circle</span>
                    <span className="text-[10px] font-black capitalize tracking-widest">{t("ui_btn_apply")}</span>
                  </button>
                </div>
              </div>
              <PanelHeaderGroup>
                <PanelHeaderButton
                  icon="cloud_upload"
                  tooltip={t("btn_publish")}
                  onClick={publishThemeToNexus}
                  variant="primary"
                />
                <PanelHeaderButton
                  icon="save"
                  tooltip={t("ui_export_theme")}
                  onClick={() => {
                    exportDevThemeToCustom(editingThemeId);
                    useStore.getState().pushStatus(t("ui_saved_personal"), "success");
                  }}
                  variant="primary"
                />
              </PanelHeaderGroup>
            </div>
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
    </ElevatedHubLayout>
  );
}


