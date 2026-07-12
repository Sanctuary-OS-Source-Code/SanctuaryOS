import React, { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import { DashboardStatTile, ViewHeader, SidePanel, CustomDropdown, GameVersionMultiSelect,
  CustomComplianceDropdown, CustomDatePicker, StatTile,
  HubTabButton, ModSearchDropdown, EmptyState,
  standardButtonClass, standardPrimaryButtonClass, standardSuccessButtonClass,
  standardDangerButtonClass, standardAccentGlassButtonClass,
  extractPostImage, stripMarkdown, isVersionMatch, deriveHumanReadableVersion, getHighestVersion } from "./shared";
import { ArtifactCard, VaultCard } from "./Cards";
import { CustomMasonDropdown, CustomStatusDropdown } from "./ArchitectHub";
import { MasonStatusDropdown } from "./MasonHub";
import { logArchitectAction } from "./lib/audit";

import MasonPostViewer from "./side-panels/MasonPostViewer";


export function MasonNexus({ masonProfile }: { masonProfile: any }) {
  const { t } = useLexicon();
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [availableLanguages, setAvailableLanguages] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  const [activeTab, setActiveTab] = useState("published");
  const [uploadState, setUploadState] = useState({
    isOpen: false,
    editId: null as string | null,
    assetType: 'lexicon',
    fileContent: null as any,
    fileName: '',
    name: '',
    version: '1.0.0',
    description: '',
    releaseNotes: '',
    language: 'English',
    newLanguage: '',
    lexiconType: 'Theme',
    themeMode: 'Dark'
  });

  useEffect(() => {
    fetchAssets();
  }, [masonProfile]);

  const fetchAssets = async () => {
    setLoading(true);
    const { data } = await supabase.from('nexus_assets').select('*').ilike('author', masonProfile.name).order('created_at', { ascending: false });
    if (data) {
      setAssets(data);
      const dbLangs = data?.map(d => d.language).filter(Boolean) || [];
      const commonLangs = ["English", "Spanish", "French", "German", "Italian", "Portuguese", "Russian", "Japanese", "Korean", "Chinese"];
      setAvailableLanguages(Array.from(new Set([...commonLangs, ...dbLangs])) as string[]);
    }
    setLoading(false);
  };

  const handleEditAsset = (asset: any) => {
    setUploadState({
      isOpen: true,
      editId: asset.id,
      assetType: asset.asset_type,
      fileContent: typeof asset.json_data === 'string' ? JSON.parse(asset.json_data) : asset.json_data,
      fileName: asset.name,
      name: asset.name,
      version: asset.version || '1.0.0',
      description: asset.description || '',
      releaseNotes: asset.release_notes || '',
      language: asset.language || (availableLanguages.length > 0 ? availableLanguages[0] : 'English'),
      newLanguage: '',
      lexiconType: asset.lexicon_type || 'Theme',
      themeMode: asset.theme_mode || 'Dark'
    });
  };

  const submitUpload = async () => {
    try {
      const finalLanguage = uploadState.language === 'add_new' ? uploadState.newLanguage : uploadState.language;
      const finalContent = { ...uploadState.fileContent, version: uploadState.version, _meta_version: uploadState.version };
      const payload = {
        name: uploadState.name,
        version: uploadState.version,
        description: uploadState.description,
        release_notes: uploadState.releaseNotes,
        json_data: finalContent,
        language: uploadState.assetType === 'lexicon' ? finalLanguage : null,
        lexicon_type: uploadState.assetType === 'lexicon' ? uploadState.lexiconType : null,
        theme_mode: uploadState.assetType === 'chameleon' ? uploadState.themeMode : null
      };

      if (uploadState.editId) {
        const { error } = await supabase.from('nexus_assets').update(payload).eq('id', uploadState.editId);
        if (error) throw error;
        useStore.getState().pushStatus(`Updated listing successfully.`, "success");
        setUploadState(s => ({ ...s, isOpen: false }));
        fetchAssets();
      }
    } catch (err: any) {
      useStore.getState().pushStatus(`Error updating asset: ${err.message}`, "error");
    }
  };

  if (loading) return <div className="p-8 text-center theme-text-accent animate-pulse font-black tracking-widest uppercase">{t("market_fetching")}</div>;

  const filteredAssets = assets.filter(a => {
    const matchCat = activeCategory === 'all' || a.asset_type === activeCategory;
    const matchSearch = a.name.toLowerCase().includes(searchQuery.toLowerCase()) || (a.description || "").toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className="flex flex-col w-full relative h-full pb-20">
      <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-white/5 w-full">
        <h2 className="text-xl font-black text-[var(--text)] uppercase tracking-widest flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("icon_hub")}</span>
          </div>
          <span className="truncate">{t("mason_market_title")}</span>
        </h2>
          <div className="flex items-center gap-3 relative flex-1 max-w-2xl ml-auto justify-end">
            <div className="relative flex-1 h-12 min-w-[250px] max-w-[450px]">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 !text-sm">{t("icon_search")}</span>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t("market_search")}
              className="w-full theme-glass-panel rounded-2xl pl-10 pr-10 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] hover:text-[var(--text)] transition-colors">
                <span className="material-symbols-outlined text-sm">{t("icon_close")}</span>
              </button>
            )}
          </div>
            <div className="flex items-center gap-3">
              <div className="flex items-stretch overflow-hidden theme-glass-panel rounded-xl border border-white/5 shadow-inner h-12 shrink-0 divide-x divide-white/5">
                <button onClick={() => setActiveCategory("all")} className={`h-full px-5 rounded-none flex items-center justify-center text-[10px] font-black uppercase tracking-widest transition-all ${activeCategory === 'all' ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5'}`}>{t("market_filter_all")}</button>
                <button onClick={() => setActiveCategory("lexicon")} className={`h-full px-5 rounded-none flex items-center justify-center text-[10px] font-black uppercase tracking-widest transition-all ${activeCategory === 'lexicon' ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5'}`}>{t("filter_lexicons")}</button>
                <button onClick={() => setActiveCategory("chameleon")} className={`h-full px-5 rounded-none flex items-center justify-center text-[10px] font-black uppercase tracking-widest transition-all ${activeCategory === 'chameleon' ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5'}`}>{t("filter_chameleons")}</button>
                <button onClick={() => setActiveCategory("workbench_template")} className={`h-full px-5 rounded-none flex items-center justify-center text-[10px] font-black uppercase tracking-widest transition-all ${activeCategory === 'workbench_template' ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5'}`}>{t("tab_templates")}</button>
              </div>
              {activeCategory !== 'all' && (
                <button onClick={() => setUploadState({ isOpen: true, editId: null, assetType: activeCategory, name: '', version: '1.0.0', description: '', releaseNotes: '', fileContent: null, fileName: '', language: availableLanguages.length > 0 ? availableLanguages[0] : 'English', newLanguage: '', lexiconType: 'Theme', themeMode: 'Dark' })} className="h-12 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-105 shadow-lg font-black uppercase tracking-widest text-[10px] group">
                  <span className="material-symbols-outlined !text-[16px] group-hover:-translate-y-0.5 transition-transform">add</span> {t("ui_tab_new")}
                </button>
              )}
            </div>
        </div>
      </div>

      <div className="p-6 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-10">
        {filteredAssets.length === 0 ? (
          <EmptyState icon={t("ui_icon_storefront") || "storefront"} title={t("market_no_assets")} className="col-span-full py-16" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredAssets.map(asset => (
              <div key={asset.id} onClick={() => handleEditAsset(asset)} className="theme-glass-panel rounded-[var(--radius)] flex flex-col group cursor-pointer border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 overflow-hidden relative">

                <div className="p-5 flex flex-col items-center justify-center relative bg-gradient-to-br from-[var(--accent)]/10 to-transparent group-hover:from-[var(--accent)]/15 transition-colors duration-500 h-36 shrink-0">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--accent)]/10 rounded-full blur-[30px] pointer-events-none mix-blend-screen" />
                  <span className="material-symbols-outlined !text-[72px] opacity-60 group-hover:opacity-100 theme-text-accent transition-all duration-500 drop-shadow-lg group-hover:scale-110 relative z-10">
                    {asset.asset_type === 'chameleon' ? 'palette' : asset.asset_type === 'workbench_template' ? 'draw' : 'translate'}
                  </span>
                  <div className="absolute top-4 right-4 text-[9px] font-black px-3 py-1 bg-[var(--bg)]/50 backdrop-blur-md text-[var(--accent)] rounded-lg uppercase tracking-widest border border-[var(--accent)]/20 shadow-lg z-20">
                    {asset.asset_type === 'chameleon' ? 'THEME' : asset.asset_type === 'workbench_template' ? 'TEMPLATE' : 'LEXICON'}
                  </div>
                </div>

                <div className="relative h-px bg-[color-mix(in_srgb,var(--text)_5%,transparent)] w-full flex items-center justify-center z-20" />

                <div className="flex flex-col p-5 w-full flex-1 relative bg-gradient-to-tr from-[var(--bg)]/5 to-transparent group-hover:from-[var(--accent)]/5 transition-colors duration-500">
                  <span className="text-xl font-black text-[var(--text)] uppercase tracking-tighter truncate leading-tight group-hover:theme-text-accent transition-colors block w-full mb-2 relative z-10">
                    {asset.name || "Untitled"}
                  </span>

                  <p className="text-xs font-bold text-[var(--subtext)] leading-relaxed line-clamp-2 opacity-80 group-hover:opacity-100 transition-opacity flex-1 relative z-10">
                    {asset.description || "No description provided."}
                  </p>
                </div>

                <div className="p-4 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-white/5 flex gap-2 relative z-10 items-center justify-between">
                  <span className="text-[10px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest flex items-center gap-1.5"><span className="material-symbols-outlined !text-[14px] normal-case">{t("icon_download")}</span> {asset.downloads || 0}</span>
                  <button className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 shrink-0">
                    {t("emote_edit")} <span className="text-lg leading-none">&rarr;</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <SidePanel
        isOpen={uploadState.isOpen}
        onClose={() => setUploadState(s => ({ ...s, isOpen: false }))}
        title={uploadState.editId 
          ? (t("upload_update_existing"))
          : uploadState.assetType === 'lexicon'
            ? (t("upload_lexicon_title"))
            : uploadState.assetType === 'workbench_template'
              ? (t("upload_template_title"))
              : (t("upload_chameleon_title"))}
        subtitle={uploadState.name || "Draft"}
        icon="cloud_upload"
        footer={
          <div className="flex justify-center items-center gap-4 w-full">
            <button
              type="button"
              onClick={() => setUploadState(s => ({ ...s, isOpen: false }))}
              className={standardButtonClass}
            >
              {t("lineage_cancel")}
            </button>
            <button
              onClick={submitUpload}
              disabled={!uploadState.name || (uploadState.language === 'add_new' && !uploadState.newLanguage)}
              className={standardAccentGlassButtonClass}
            >
              {uploadState.editId ? (t("upload_btn_update")) : (t("upload_btn_publish"))}
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2 animate-in slide-in-from-top-2">
            <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("upload_file")}</label>
            <div className="flex items-center gap-4">
              <div className="flex-1 theme-glass-inner rounded-xl px-4 py-3 text-sm font-bold text-[var(--text)] truncate opacity-70 border-l-4 border-l-[var(--accent)]">
                {uploadState.fileName || "No file selected"}
              </div>
              <button onClick={async () => {
                const filters = [{ name: 'JSON', extensions: ['json'] }];
                const vaultPath = useStore.getState().vaultPath;
                const defaultPath = vaultPath ? `${vaultPath}/Data` : undefined;
                const selected = await open({ filters, defaultPath });
                if (!selected) return;
                const content = await readTextFile(selected as string);
                let parsed;
                try { parsed = JSON.parse(content); } catch { parsed = content; }
                let newVersion = '1.0.0';
                if (parsed.version) newVersion = parsed.version;
                else if (parsed._meta_version) newVersion = parsed._meta_version;
                setUploadState(s => ({ ...s, fileContent: parsed, fileName: selected as string, version: newVersion }));
              }} className={standardAccentGlassButtonClass}>
                {t("ui_btn_replace")}
              </button>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex flex-col gap-2 flex-1">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">
                {uploadState.assetType === 'lexicon'
                  ? (t("upload_lexicon_name"))
                  : uploadState.assetType === 'workbench_template'
                    ? (t("upload_template_name"))
                    : (t("upload_chameleon_name"))}
              </label>
              <input
                type="text"
                value={uploadState.name}
                onChange={e => setUploadState(s => ({ ...s, name: e.target.value }))}
                className="w-full theme-glass-inner rounded-xl px-5 py-4 text-sm font-bold focus:outline-none focus:theme-border-accent transition-all text-[var(--text)]"
              />
            </div>
            <div className="flex flex-col gap-2 w-32 shrink-0">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">VERSION</label>
              <input
                type="text"
                value={uploadState.version}
                onChange={e => setUploadState(s => ({ ...s, version: e.target.value }))}
                className="w-full theme-glass-inner rounded-xl px-5 py-4 text-sm font-bold focus:outline-none focus:theme-border-accent transition-all text-[var(--text)] text-center"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("upload_desc")}</label>
            <textarea
              value={uploadState.description}
              onChange={e => setUploadState(s => ({ ...s, description: e.target.value }))}
              className="w-full theme-glass-inner rounded-xl px-5 py-4 text-sm focus:outline-none focus:theme-border-accent transition-all min-h-[150px] text-[var(--text)] custom-scrollbar resize-none"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2 flex items-center gap-2">
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">campaign</span>
              {t("whats_new")}
            </label>
            <textarea
              value={uploadState.releaseNotes || ""}
              onChange={e => setUploadState(s => ({ ...s, releaseNotes: e.target.value }))}
              placeholder={t("update_panel_no_notes")}
              className="w-full theme-glass-inner rounded-xl px-5 py-4 text-sm focus:outline-none focus:theme-border-accent transition-all min-h-[100px] text-[var(--text)] custom-scrollbar resize-none"
            />
          </div>

          {uploadState.assetType === 'lexicon' && (
            <>
              <div className="flex flex-col gap-2 relative z-[60]">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("tab_lexicons")}</label>
                <CustomDropdown disableTint={true}
                  value={uploadState.language}
                  onChange={(val: string[]) => setUploadState(s => ({ ...s, language: val[0] }))}

                  options={[
                    ...availableLanguages.map(l => ({ id: l, label: l })),
                    { id: "add_new", label: t("upload_add_language") }
                  ]}
                />
              </div>
              {uploadState.language === 'add_new' && (
                <div className="flex flex-col gap-2 animate-in slide-in-from-top-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("upload_new_language")}</label>
                  <input
                    type="text"
                    value={uploadState.newLanguage}
                    onChange={e => setUploadState(s => ({ ...s, newLanguage: e.target.value }))}
                    className="w-full theme-glass-inner rounded-xl px-5 py-4 text-sm font-bold focus:outline-none focus:theme-border-accent transition-all border-l-4 border-l-[var(--accent)] text-[var(--text)]"
                    placeholder={t("ph_language")}
                  />
                </div>
              )}
              <div className="flex flex-col gap-2 relative z-[50]">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("filter_type")}</label>
                <CustomDropdown disableTint={true}
                  value={uploadState.lexiconType}
                  onChange={(val: string[]) => setUploadState(s => ({ ...s, lexiconType: val[0] }))}

                  options={[
                    { id: "Theme", label: t("type_theme") },
                    { id: "Default", label: t("type_default") }
                  ]}
                />
              </div>
            </>
          )}

          {uploadState.assetType === 'chameleon' && (
            <div className="flex flex-col gap-2 relative z-[60]">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("filter_mode")}</label>
              <CustomDropdown disableTint={true}
                value={uploadState.themeMode}
                onChange={(val: string[]) => setUploadState(s => ({ ...s, themeMode: val[0] }))}

                options={[
                  { id: "Dark", label: t("mode_dark") },
                  { id: "Light", label: t("mode_light") }
                ]}
              />
            </div>
          )}
        </div>
      </SidePanel>
    </div>
  );
}
