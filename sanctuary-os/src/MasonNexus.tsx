import React, { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import {
  DashboardStatTile, ViewHeader, SidePanel, CustomDropdown, GameVersionMultiSelect,
  CustomComplianceDropdown, CustomDatePicker,
  HubTabButton, ModSearchDropdown, EmptyState,
  standardButtonClass, standardPrimaryButtonClass, standardSuccessButtonClass,
  standardDangerButtonClass, standardAccentGlassButtonClass,
  extractPostImage, stripMarkdown, isVersionMatch, deriveHumanReadableVersion, getHighestVersion, LoadingScreen, ActionButton, SearchBar, ScreenUtilityBar, FilterPopover, formatOverviewMetric
} from "./shared";
import { ArtifactCard, VaultCard } from "./Cards";
import { UniversalCard } from "./components/universal/UniversalCard";
import { CustomMasonDropdown, CustomStatusDropdown } from "./ArchitectHub";
import { MasonStatusDropdown } from "./MasonHub";
import { logArchitectAction } from "./lib/audit";

import { ElevatedHubLayout } from "./components/layouts/ElevatedHubLayout";
export function MasonNexus({ masonProfile }: { masonProfile: any }) {
  const { t } = useLexicon();
  const session = useStore((state) => state.session);
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [availableLanguages, setAvailableLanguages] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [activeTab, setActiveTab] = useState<"overview" | "active" | "inactive">("overview");

  const [uploadState, setUploadState] = useState({
    isOpen: false,
    editId: null as string | null,
    assetType: 'lexicon',
    isHidden: false,
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
    const { data } = await supabase.from('nexus_assets').select('*').or(`author_id.eq.${masonProfile.id},author.ilike.${masonProfile.name}`).order('created_at', { ascending: false });
    if (data) {
      setAssets(data);
      const dbLangs = data?.map(d => d.language).filter(Boolean) || [];
      const commonLangs = ["English", "Spanish", "French", "German", "Italian", "Portuguese", "Russian", "Japanese", "Korean", "Chinese"];
      setAvailableLanguages(Array.from(new Set([...commonLangs, ...dbLangs])) as string[]);
    }
    setLoading(false);
  };

  const handleEditAsset = (asset: any) => {
    let parsedContent = typeof asset.json_data === 'string' ? JSON.parse(asset.json_data) : asset.json_data;
    let v = asset.version || '1.0.0';
    if (asset.asset_type === 'workbench_template') {
      if (parsedContent.template_version) v = parsedContent.template_version;
      else if (parsedContent.version) v = parsedContent.version;
    }
    setUploadState({
      isOpen: true,
      editId: asset.id,
      assetType: asset.asset_type,
      isHidden: asset.is_public === false,
      fileContent: parsedContent,
      fileName: asset.name,
      name: asset.name,
      version: v,
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
      const finalContent = { ...uploadState.fileContent };
      if (uploadState.assetType === 'workbench_template') {
        if (finalContent.template_version !== undefined) finalContent.template_version = uploadState.version;
        else finalContent.version = uploadState.version;
      } else {
        finalContent.version = uploadState.version;
        finalContent._meta_version = uploadState.version;
      }
      const payload = {
        name: uploadState.name,
        version: uploadState.version,
        description: uploadState.description,
        release_notes: uploadState.releaseNotes,
        json_data: finalContent,
        asset_type: uploadState.assetType,
        is_public: true,
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
      } else {
        const { error } = await supabase.from('nexus_assets').insert([{ ...payload, author: masonProfile.name, author_id: session?.user?.id || masonProfile.id, downloads: 0 }]);
        if (error) throw error;
        useStore.getState().pushStatus(`Asset published successfully.`, "success");
        setUploadState(s => ({ ...s, isOpen: false }));
        fetchAssets();
      }
    } catch (err: any) {
      console.error("SUPABASE ERROR:", err);
      useStore.getState().pushStatus(`Error: ${err.message} ${err.details ? `(${err.details})` : ''}`, "error");
    }
  };

  if (loading) return <LoadingScreen title={t("market_fetching")} />;

  const getTabAssets = (tabId: string) => {
    return assets.filter(a => {
      const isHidden = a.is_public === false;
      if (tabId === "active") return !isHidden;
      if (tabId === "inactive") return isHidden;
      return true; // overview shows all
    });
  };

  const getFilteredAssets = (tabAssets: any[]) => {
    return tabAssets.filter(a => {
      const displayAssetType = a.asset_type;
      const matchCat = activeCategory === 'all' || displayAssetType === activeCategory;
      const matchSearch = a.name.toLowerCase().includes(searchQuery.toLowerCase()) || (a.description || "").toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  };

  const tabs = [
    {
      id: "overview",
      label: t("landing_overview") || "Overview",
      icon: "dashboard",
      number: formatOverviewMetric(getFilteredAssets(getTabAssets("overview")), 'created_at')
    },
    {
      id: "active",
      label: t("status_active") || "Active",
      icon: "check_circle",
      number: getFilteredAssets(getTabAssets("active")).length
    },
    {
      id: "inactive",
      label: t("status_inactive") || "Inactive",
      icon: "block",
      number: getFilteredAssets(getTabAssets("inactive")).length
    }
  ];

  const currentTabAssets = getTabAssets(activeTab);
  const filteredAssets = getFilteredAssets(currentTabAssets);

  const renderLanding = () => {
    const activeAssets = getFilteredAssets(getTabAssets("active")).slice(0, 5);
    const inactiveAssets = getFilteredAssets(getTabAssets("inactive")).slice(0, 5);

    const renderAssetCard = (asset: any) => {
      const isHidden = asset.is_public === false;
      const displayAssetType = asset.asset_type;
      return (
        <UniversalCard
          key={asset.id}
          onClick={() => handleEditAsset(asset)}
          layout="horizontal"
          title={asset.name || "Untitled"}
          statusColor={isHidden ? "border-[color-mix(in_srgb,var(--danger)_50%,transparent)]" : "border-[color-mix(in_srgb,var(--success)_50%,transparent)]"}
          badges={[
            <span key="badge" className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[8px] font-black capitalize tracking-widest shadow-inner shrink-0 ${isHidden ? 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)]' : 'bg-[color-mix(in_srgb,var(--success)_10%,transparent)] text-[var(--success)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)]'}`}>
              {isHidden ? (t("status_inactive")) : (t("status_active"))}
            </span>,
            <span key="type-badge" className="px-2 py-0.5 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)] rounded-md text-[8px] capitalize tracking-widest border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-inner shrink-0 font-black">
              {displayAssetType === 'chameleon' ? 'THEME' : displayAssetType === 'workbench_template' ? 'TEMPLATE' : 'LEXICON'}
            </span>
          ]}
          icon={displayAssetType === 'chameleon' ? 'palette' : displayAssetType === 'workbench_template' ? 'draw' : 'translate'}
          footer={
            <div className="flex justify-between items-center w-full">
              <span className="text-[10px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest flex items-center gap-1.5"><span className="material-symbols-outlined !text-[14px] normal-case">{t("icon_download")}</span> {asset.downloads || 0}</span>
              <button className="text-[9px] font-black text-[var(--text)] group-hover:text-[var(--accent)] capitalize tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 shrink-0">
                {t("mason_edit_listing")} <span className="material-symbols-outlined !text-[14px]">arrow_forward</span>
              </button>
            </div>
          }
        >
          <div className="flex-1 mt-1">
            <p className="text-[11px] font-mono text-[var(--subtext)] opacity-70 leading-relaxed whitespace-pre-wrap break-words line-clamp-2">
              {asset.description || "No description provided."}
            </p>
          </div>
        </UniversalCard>
      );
    };

    return (
      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between gap-4 border-b border-black/5 dark:border-white/5 pb-4">
            <h3 className="text-sm font-black text-[var(--text)] capitalize tracking-[0.2em] flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--success)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined !text-[24px] text-[var(--success)] opacity-90 drop-shadow-lg">check_circle</span>
              </div>
              {t("status_active") || "Active Assets"}
            </h3>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-6">
            {activeAssets.length > 0 ? activeAssets.map(renderAssetCard) : (
              <EmptyState icon="storefront" title={t("market_no_assets")} className="py-8" />
            )}
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between gap-4 border-b border-black/5 dark:border-white/5 pb-4">
            <h3 className="text-sm font-black text-[var(--text)] capitalize tracking-[0.2em] flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined !text-[24px] text-[var(--danger)] opacity-90 drop-shadow-lg">block</span>
              </div>
              {t("status_inactive") || "Inactive Assets"}
            </h3>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-6">
            {inactiveAssets.length > 0 ? inactiveAssets.map(renderAssetCard) : (
              <EmptyState icon="storefront" title={t("market_no_assets")} className="py-8" />
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderList = () => {
    return (
      <div className="flex flex-col gap-10 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {filteredAssets.length === 0 ? (
          <EmptyState icon={t("ui_icon_storefront")} title={t("market_no_assets")} className="col-span-full py-16" />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-6">
            {filteredAssets.map(asset => {
              const isHidden = asset.is_public === false;
              const displayAssetType = asset.asset_type;
              return (
                <UniversalCard
                  key={asset.id}
                  onClick={() => handleEditAsset(asset)}
                  layout="horizontal"
                  title={asset.name || "Untitled"}
                  statusColor={isHidden ? "border-[color-mix(in_srgb,var(--danger)_50%,transparent)]" : "border-[color-mix(in_srgb,var(--success)_50%,transparent)]"}
                  badges={[
                    <span key="badge" className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[8px] font-black capitalize tracking-widest shadow-inner shrink-0 ${isHidden ? 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)]' : 'bg-[color-mix(in_srgb,var(--success)_10%,transparent)] text-[var(--success)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)]'}`}>
                      {isHidden ? (t("status_inactive")) : (t("status_active"))}
                    </span>,
                    <span key="type-badge" className="px-2 py-0.5 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)] rounded-md text-[8px] capitalize tracking-widest border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-inner shrink-0 font-black">
                      {displayAssetType === 'chameleon' ? 'THEME' : displayAssetType === 'workbench_template' ? 'TEMPLATE' : 'LEXICON'}
                    </span>
                  ]}
                  icon={displayAssetType === 'chameleon' ? 'palette' : displayAssetType === 'workbench_template' ? 'draw' : 'translate'}
                  footer={
                    <div className="flex justify-start items-center w-full">
                      <span className="text-[10px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest flex items-center gap-1.5"><span className="material-symbols-outlined !text-[14px] normal-case">{t("icon_download")}</span> {asset.downloads || 0}</span>
                      <button className="text-[9px] font-black text-[var(--text)] group-hover:text-[var(--accent)] capitalize tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 shrink-0">
                        {t("mason_edit_listing")} <span className="material-symbols-outlined !text-[14px]">arrow_forward</span>
                      </button>
                    </div>
                  }
                >
                  <div className="flex-1 mt-1">
                    <p className="text-[11px] font-mono text-[var(--subtext)] opacity-70 leading-relaxed whitespace-pre-wrap break-words line-clamp-2">
                      {asset.description || "No description provided."}
                    </p>
                  </div>
                </UniversalCard>
              )
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <ElevatedHubLayout
      headerTitle={t("tab_nexus") || "Nexus"}
      headerIcon="hub"
      search={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder={(t("market_search")) as string}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as any)}
      headerActions={
        <div className="flex items-center gap-2">
          <FilterPopover icon="tune" label={t("hub_filters") || "Filters"}>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black tracking-widest text-[var(--subtext)] capitalize">
                  {t("filter_category")}
                </label>
                <CustomDropdown
                  disableTint={true}
                  value={activeCategory}
                  options={[
                    { id: 'all', label: t("ql_all") },
                    { id: 'lexicon', label: t("stat_lexicons") },
                    { id: 'chameleon', label: t("tab_chameleons") },
                    { id: 'workbench_template', label: t("ql_templates") }
                  ]}
                  onChange={(val: string[]) => setActiveCategory(val[0])}
                />
              </div>
              {activeCategory !== 'all' && (
                <div className="pt-4 flex justify-center border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] mt-2 md:hidden">
                  <ActionButton
                    icon="add"
                    label={t("ui_tab_new")}
                    onClick={() => setUploadState({ isOpen: true, editId: null, assetType: activeCategory, isHidden: false, name: '', version: '1.0.0', description: '', releaseNotes: '', fileContent: null, fileName: '', language: availableLanguages.length > 0 ? availableLanguages[0] : 'English', newLanguage: '', lexiconType: 'Theme', themeMode: 'Dark' })}
                    className="w-full h-10 px-6 font-black capitalize tracking-widest text-[10px] !w-auto"
                  />
                </div>
              )}
            </div>
          </FilterPopover>
          {activeCategory !== 'all' && (
            <ActionButton
              icon="add"
              label={t("ui_tab_new")}
              iconOnly={true}
              className="hidden md:flex shrink-0 h-10 w-10 px-0"
              onClick={() => setUploadState({ isOpen: true, editId: null, assetType: activeCategory, isHidden: false, name: '', version: '1.0.0', description: '', releaseNotes: '', fileContent: null, fileName: '', language: availableLanguages.length > 0 ? availableLanguages[0] : 'English', newLanguage: '', lexiconType: 'Theme', themeMode: 'Dark' })}
            />
          )}
        </div>
      }
    >
      {activeTab === 'overview' ? renderLanding() : renderList()}
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
            {uploadState.editId && !uploadState.isHidden ? (
              <ActionButton
                type="button"
                onClick={async (e) => {
                  if (e.currentTarget.textContent === "ARE YOU SURE?") {
                    const { error } = await supabase.from('nexus_assets').update({ is_public: false }).eq('id', uploadState.editId);
                    if (error) {
                      console.error("SUPABASE HIDE ERROR:", error);
                      if (error.details) console.error("DETAILS:", error.details);
                      if (error.hint) console.error("HINT:", error.hint);
                      useStore.getState().pushStatus(`Failed to hide asset: ${error.message} ${error.details ? `(${error.details})` : ''}`, "error");
                    } else {
                      useStore.getState().pushStatus("Asset removed from public view.", "success");
                      setUploadState(s => ({ ...s, isOpen: false }));
                      fetchAssets();
                    }
                  } else {
                    e.currentTarget.textContent = "ARE YOU SURE?";
                    e.currentTarget.classList.add("!bg-[color-mix(in_srgb,var(--danger)_20%,transparent)]", "!text-[var(--danger)]", "!border-[color-mix(in_srgb,var(--danger)_50%,transparent)]");
                    setTimeout(() => {
                      if (e.currentTarget) {
                        e.currentTarget.textContent = t("btn_remove_asset");
                        e.currentTarget.classList.remove("!bg-[color-mix(in_srgb,var(--danger)_20%,transparent)]", "!text-[var(--danger)]", "!border-[color-mix(in_srgb,var(--danger)_50%,transparent)]");
                      }
                    }, 3000);
                  }
                }} label={t("btn_remove_asset")}
              >

              </ActionButton>
            ) : (
              <ActionButton
                type="button"
                onClick={() => setUploadState(s => ({ ...s, isOpen: false }))} label={t("nav_cancel")}
              >

              </ActionButton>
            )}
            <ActionButton
              onClick={submitUpload}
              disabled={!uploadState.name || (uploadState.language === 'add_new' && !uploadState.newLanguage)} label={uploadState.editId ? (uploadState.isHidden ? (t("upload_btn_relink")) : (t("upload_btn_update"))) : (t("upload_btn_publish"))}
            >

            </ActionButton>
          </div>
        }
      >
        <div className="flex flex-col gap-6">
          {uploadState.assetType !== 'workbench_template' && (
            <div className="flex flex-col gap-2 animate-in slide-in-from-top-2">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("upload_file")}</label>
              <div className="flex items-center gap-4">
                <div className="flex-1 glass-surface rounded-xl px-4 py-3 text-sm font-bold text-[var(--text)] truncate opacity-70">
                  {uploadState.fileName || "No file selected"}
                </div>
                {/* Replace button removed per OS flow restrictions */}
              </div>
            </div>
          )}

          <div className="flex gap-4">
            <div className="flex flex-col gap-2 flex-1">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">
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
                className="w-full glass-surface rounded-xl px-5 py-4 text-sm font-bold focus:outline-none focus:theme-border-accent transition-all text-[var(--text)]"
              />
            </div>
            <div className="flex flex-col gap-2 w-32 shrink-0">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("label_version")}</label>
              <input
                type="text"
                value={uploadState.version}
                onChange={e => setUploadState(s => ({ ...s, version: e.target.value }))}
                className="w-full glass-surface rounded-xl px-5 py-4 text-sm font-bold focus:outline-none focus:theme-border-accent transition-all text-[var(--text)] text-center"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("upload_desc")}</label>
            <textarea
              value={uploadState.description}
              onChange={e => setUploadState(s => ({ ...s, description: e.target.value }))}
              className="w-full glass-surface rounded-xl px-5 py-4 text-sm focus:outline-none focus:theme-border-accent transition-all min-h-[150px] text-[var(--text)] custom-scrollbar resize-none"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2 flex items-center gap-2">
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">campaign</span>
              {t("whats_new")}
            </label>
            <textarea
              value={uploadState.releaseNotes || ""}
              onChange={e => setUploadState(s => ({ ...s, releaseNotes: e.target.value }))}
              placeholder={t("update_panel_no_notes")}
              className="w-full glass-surface rounded-xl px-5 py-4 text-sm focus:outline-none focus:theme-border-accent transition-all min-h-[100px] text-[var(--text)] custom-scrollbar resize-none"
            />
          </div>

          {uploadState.assetType === 'workbench_template' && uploadState.fileContent && (
            <div className="flex flex-col gap-4 p-5 rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] mt-2">
              <h4 className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)] flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined !text-[14px]">{t("icon_info")}</span>
                {t("auto_detected_architecture")}
              </h4>
              <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-[10px] font-mono">
                {uploadState.fileContent.template_id && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[var(--subtext)] opacity-60">{t("auto_template_id")}</span>
                    <span className="text-[var(--text)] font-black truncate">{uploadState.fileContent.template_id}</span>
                  </div>
                )}
                {uploadState.fileContent.schema_version && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[var(--subtext)] opacity-60">{t("auto_schema")}</span>
                    <span className="text-[var(--text)] font-black">{t("auto_v")}{uploadState.fileContent.schema_version}</span>
                  </div>
                )}
                {uploadState.version && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[var(--subtext)] opacity-60">{t("update_version")}</span>
                    <span className="text-[var(--text)] font-black">{uploadState.version}</span>
                  </div>
                )}
                {uploadState.fileContent.mod_author && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[var(--subtext)] opacity-60">{t("auto_mod_author")}</span>
                    <span className="text-[var(--text)] font-black truncate">{uploadState.fileContent.mod_author}</span>
                  </div>
                )}
                {uploadState.fileContent.parser_type && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[var(--subtext)] opacity-60">{t("auto_parser")}</span>
                    <span className="text-[var(--text)] font-black capitalize">{uploadState.fileContent.parser_type}</span>
                  </div>
                )}
                {uploadState.fileContent.write_scope && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[var(--subtext)] opacity-60">{t("auto_write_scope")}</span>
                    <span className="text-[var(--text)] font-black capitalize truncate">{uploadState.fileContent.write_scope}</span>
                  </div>
                )}
              </div>
              {uploadState.fileContent.supported_mod_versions && Array.isArray(uploadState.fileContent.supported_mod_versions) && uploadState.fileContent.supported_mod_versions.length > 0 && (
                <div className="flex flex-col gap-2 mt-1 pt-3 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                  <span className="text-[var(--subtext)] opacity-60 text-[9px] font-mono">{t("auto_supported_versions")}</span>
                  <div className="flex flex-wrap gap-2">
                    {uploadState.fileContent.supported_mod_versions.map((v: string) => (
                      <span key={v} className="px-2 py-1 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-md text-[9px] font-black text-[var(--text)]">{v}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {uploadState.assetType === 'lexicon' && (
            <>
              <div className="flex flex-col gap-2 relative z-[60]">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("tab_lexicons")}</label>
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
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("upload_new_language")}</label>
                  <input
                    type="text"
                    value={uploadState.newLanguage}
                    onChange={e => setUploadState(s => ({ ...s, newLanguage: e.target.value }))}
                    className="w-full glass-surface rounded-xl px-5 py-4 text-sm font-bold focus:outline-none focus:theme-border-accent transition-all border-l-4 border-l-[var(--accent)] text-[var(--text)]"
                    placeholder={t("ph_language")}
                  />
                </div>
              )}
              <div className="flex flex-col gap-2 relative z-[50]">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("filter_type")}</label>
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
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("filter_mode")}</label>
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
          )
        </div>
      </SidePanel>
    </ElevatedHubLayout>
  );
}


