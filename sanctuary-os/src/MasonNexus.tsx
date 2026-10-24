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
  extractPostImage, stripMarkdown, isVersionMatch, deriveHumanReadableVersion, getHighestVersion, LoadingScreen, ActionButton, formatOverviewMetric, PanelHeaderGroup, PanelHeaderButton
} from "./shared";
import { ArtifactCard, VaultCard } from "./Cards";
import { UniversalCard } from "./components/universal/UniversalCard";
import { CustomMasonDropdown, CustomStatusDropdown } from "./ArchitectHub";
import { MasonStatusDropdown } from "./MasonHub";
import { logArchitectAction } from "./lib/audit";

import { ElevatedHubLayout, HubOverviewLanding, HubOverviewSection, SidePanelTitleInput } from "./components/layouts/ElevatedHubLayout";
export function MasonNexus({ masonProfile, isVerifiedMason = true }: { masonProfile: any, isVerifiedMason?: boolean }) {
  const { t } = useLexicon();
  const session = useStore((state) => state.session);
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [availableLanguages, setAvailableLanguages] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [activeTab, setActiveTab] = useState<"overview" | "lexicon" | "chameleon" | "workbench_template" | "blueprint">("overview");
  const [blueprints, setBlueprints] = useState<any[]>([]);
  const [flags, setFlags] = useState<any[]>([]);

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
    const { data: assetsData } = await supabase.from('nexus_assets').select('*').or(`author_id.eq.${masonProfile.id},author.ilike.${masonProfile.name}`).order('created_at', { ascending: false });
    const { data: bpData } = await supabase.from('blueprints').select('*').eq('mason_id', masonProfile.id).order('created_at', { ascending: false });
    const { data: flagsData } = await supabase.from('nexus_reports').select('*').order('created_at', { ascending: false });

    if (assetsData) {
      setAssets(assetsData);
      const dbLangs = assetsData?.map(d => d.language).filter(Boolean) || [];
      const commonLangs = ["English", "Spanish", "French", "German", "Italian", "Portuguese", "Russian", "Japanese", "Korean", "Chinese"];
      setAvailableLanguages(Array.from(new Set([...commonLangs, ...dbLangs])) as string[]);
    }
    if (bpData) setBlueprints(bpData);
    if (flagsData) {
      // filter flags to only those affecting our assets
      const myAssetIds = assetsData?.map(a => a.id) || [];
      setFlags(flagsData.filter((f: any) => myAssetIds.includes(f.asset_id)));
    }
    setLoading(false);
  };

  const handleEditAsset = (asset: any, isBp: boolean = false) => {
    let parsedContent = null;
    if (!isBp && asset.json_data) {
      parsedContent = typeof asset.json_data === 'string' ? JSON.parse(asset.json_data) : asset.json_data;
    }
    let v = asset.version || '1.0.0';
    if (!isBp && asset.asset_type === 'workbench_template') {
      if (parsedContent?.template_version) v = parsedContent.template_version;
      else if (parsedContent?.version) v = parsedContent.version;
    }
    setUploadState({
      isOpen: true,
      editId: asset.id,
      assetType: isBp ? 'blueprint' : asset.asset_type,
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
      if (uploadState.assetType === 'blueprint') {
        const bpPayload = { name: uploadState.name };
        if (uploadState.editId) {
          const { error } = await supabase.from('blueprints').update(bpPayload).eq('id', uploadState.editId);
          if (error) throw error;
          useStore.getState().pushStatus(t("upload_blueprint_title") + " successful.", "success");
        }
        setUploadState(s => ({ ...s, isOpen: false }));
        fetchAssets();
        return;
      }

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
    if (tabId === "overview") return [...assets, ...blueprints];
    if (tabId === "blueprint") return blueprints;
    return assets.filter(a => a.asset_type === tabId);
  };

  const getFilteredAssets = (tabAssets: any[], isBlueprintTab: boolean = false) => {
    return tabAssets.filter(a => {
      const matchSearch = a.name?.toLowerCase().includes(searchQuery.toLowerCase()) || (a.description || "").toLowerCase().includes(searchQuery.toLowerCase());
      return matchSearch;
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
      id: "lexicon",
      label: t("tab_lexicons") || "Lexicons",
      icon: "translate",
      number: getFilteredAssets(getTabAssets("lexicon")).length
    },
    {
      id: "chameleon",
      label: t("tab_chameleons") || "Chameleons",
      icon: "palette",
      number: getFilteredAssets(getTabAssets("chameleon")).length
    },
    {
      id: "workbench_template",
      label: t("tab_templates") || "Templates",
      icon: "draw",
      number: getFilteredAssets(getTabAssets("workbench_template")).length
    },
    {
      id: "blueprint",
      label: t("tab_blueprints") || "Blueprints",
      icon: "account_tree",
      number: getFilteredAssets(getTabAssets("blueprint"), true).length
    }
  ];

  const currentTabAssets = getTabAssets(activeTab);
  const filteredAssets = getFilteredAssets(currentTabAssets, activeTab === 'blueprint');

  const renderLanding = () => {
    const recentAssets = [...assets].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5);
    const recentBlueprints = [...blueprints].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5);

    const renderAssetCard = (asset: any, isBp: boolean = false) => {
      const isHidden = asset.is_public === false;
      const displayAssetType = isBp ? 'blueprint' : asset.asset_type;

      const flagForAsset = flags.find(f => f.asset_id === asset.id);

      return (
        <UniversalCard
          key={asset.id}
          onClick={() => handleEditAsset(asset, isBp)}
          layout="horizontal"
          title={asset.name || (t("market_untitled") as string)}
          statusColor={flagForAsset ? "border-[color-mix(in_srgb,var(--danger)_50%,transparent)]" : "border-[color-mix(in_srgb,var(--success)_50%,transparent)]"}
          badges={[
            flagForAsset ? (
              <div key="badge-flag" className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">{t("icon_flag", "flag")}</span>
                <span>{(t("flagged") as string).toUpperCase()}</span>
              </div>
            ) : null,
            isHidden ? (
              <div key="badge-hidden" className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">{t("icon_visibility_off", "visibility_off")}</span>
                <span>{(t("status_tag_hidden") || "HIDDEN").toUpperCase()}</span>
              </div>
            ) : null,
            <div key="type-badge" className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {displayAssetType === 'chameleon' ? t("icon_palette", "palette") : displayAssetType === 'workbench_template' ? t("icon_draw", "draw") : displayAssetType === 'blueprint' ? t("icon_account_tree", "account_tree") : t("icon_translate", "translate")}
              </span>
              <span>
                {displayAssetType === 'chameleon' ? (t("lex_theme") as string).toUpperCase() : displayAssetType === 'workbench_template' ? (t("lex_template") as string).toUpperCase() : displayAssetType === 'blueprint' ? (t("lex_blueprint") as string).toUpperCase() : (t("lex_lexicon") as string).toUpperCase()}
              </span>
            </div>
          ]}
          icon={displayAssetType === 'chameleon' ? 'palette' : displayAssetType === 'workbench_template' ? 'draw' : displayAssetType === 'blueprint' ? 'account_tree' : 'translate'}
          footer={
            <div className="flex justify-between items-center w-full">
              <span className="text-[10px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest flex items-center gap-1.5"><span className="material-symbols-outlined !text-[14px] normal-case">{t("icon_download")}</span> {asset.downloads || 0}</span>

            </div>
          }
        >
          <div className="flex-1 mt-1">
            <p className="text-[11px] font-mono text-[var(--subtext)] opacity-70 leading-relaxed whitespace-pre-wrap break-words line-clamp-2">
              {!isBp ? (asset.description || t("market_no_desc")) : t("lex_blueprint")}
            </p>
          </div>
        </UniversalCard>
      );
    };

    return (
      <HubOverviewLanding>
        <HubOverviewSection
          icon="schedule"
          iconColorClass="text-[var(--success)]"
          title={t("recent_assets") || "Recent Assets"}
          isEmpty={recentAssets.length === 0}
          emptyIcon="storefront"
          emptyTitle={t("market_no_assets") || "No Assets Found"}
        >
          {recentAssets.map(a => renderAssetCard(a, false))}
        </HubOverviewSection>

        <HubOverviewSection
          icon="account_tree"
          iconColorClass="text-[var(--info)]"
          title={t("recent_blueprints") || "Recent Blueprints"}
          isEmpty={recentBlueprints.length === 0}
          emptyIcon="account_tree"
          emptyTitle={t("market_no_blueprints") || "No Blueprints Found"}
        >
          {recentBlueprints.map(a => renderAssetCard(a, true))}
        </HubOverviewSection>
      </HubOverviewLanding>
    );
  };

  const renderList = () => {
    return (
      <div className="flex flex-col gap-10 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {filteredAssets.length === 0 ? (
          <EmptyState icon={t("ui_icon_storefront") || "storefront"} title={t("market_no_assets") || "No Assets Found"} className="col-span-full py-16" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            {filteredAssets.map(asset => {
              const isHidden = asset.is_public === false;
              const isBp = activeTab === 'blueprint';
              const displayAssetType = isBp ? 'blueprint' : asset.asset_type;

              const flagForAsset = flags.find(f => f.asset_id === asset.id);

              return (
                <UniversalCard
                  key={asset.id}
                  onClick={() => isBp ? null : handleEditAsset(asset)}
                  layout="horizontal"
                  title={asset.name || (t("market_untitled") || "Untitled")}
                  statusColor={flagForAsset ? "border-[color-mix(in_srgb,var(--danger)_50%,transparent)]" : "border-[color-mix(in_srgb,var(--success)_50%,transparent)]"}
                  badges={[
                    flagForAsset ? (
                      <div key="badge-flag" className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                        <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">{t("icon_flag", "flag")}</span>
                        <span>{t("flagged") || "Flagged"}</span>
                      </div>
                    ) : null,
                    isHidden ? (
                      <div key="badge-hidden" className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                        <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">{t("icon_visibility_off", "visibility_off")}</span>
                        <span>{(t("status_tag_hidden") || "HIDDEN").toUpperCase()}</span>
                      </div>
                    ) : null,
                    <div key="type-badge" className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                      <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                        {displayAssetType === 'chameleon' ? t("icon_palette", "palette") : displayAssetType === 'workbench_template' ? t("icon_draw", "draw") : displayAssetType === 'blueprint' ? t("icon_account_tree", "account_tree") : t("icon_translate", "translate")}
                      </span>
                      <span>
                        {displayAssetType === 'chameleon' ? (t("lex_theme") || 'THEME').toUpperCase() : displayAssetType === 'workbench_template' ? (t("lex_template") || 'TEMPLATE').toUpperCase() : displayAssetType === 'blueprint' ? (t("lex_blueprint") || 'BLUEPRINT').toUpperCase() : (t("lex_lexicon") || 'LEXICON').toUpperCase()}
                      </span>
                    </div>
                  ]}
                  icon={displayAssetType === 'chameleon' ? 'palette' : displayAssetType === 'workbench_template' ? 'draw' : displayAssetType === 'blueprint' ? 'account_tree' : 'translate'}
                  footer={
                    <div className="flex justify-start items-center w-full">
                      <span className="text-[10px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest flex items-center gap-1.5"><span className="material-symbols-outlined !text-[14px] normal-case">{t("icon_download") || "download"}</span> {asset.downloads || 0}</span>
                    </div>
                  }
                >
                  <div className="flex-1 mt-1">
                    <p className="text-[11px] font-mono text-[var(--subtext)] opacity-70 leading-relaxed whitespace-pre-wrap break-words line-clamp-2">
                      {asset.description || (t("market_no_desc") || "No description provided.")}
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
      searchPlaceholder={(t("market_search") || "Search...") as string}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as any)}
      hideSearch={activeTab === 'overview'}
      actions={
        isVerifiedMason && activeTab !== 'overview' && activeTab !== 'blueprint' ? [
          {
            id: 'add_new',
            icon: <span className="material-symbols-outlined !text-[20px]">add</span>,
            label: t("ui_tab_new") || "New",
            onClick: () => setUploadState({ isOpen: true, editId: null, assetType: activeTab, isHidden: false, name: '', version: '1.0.0', description: '', releaseNotes: '', fileContent: null, fileName: '', language: availableLanguages.length > 0 ? availableLanguages[0] : 'English', newLanguage: '', lexiconType: 'Theme', themeMode: 'Dark' })
          }
        ] : undefined
      }
    >
      {activeTab === 'overview' ? renderLanding() : renderList()}
      <SidePanel
        isOpen={uploadState.isOpen}
        onClose={() => setUploadState(s => ({ ...s, isOpen: false }))}
        title={uploadState.editId
          ? (uploadState.assetType === 'blueprint' ? (t("upload_blueprint_title") || "Upload Blueprint") : (t("upload_update_existing") || "Update Asset"))
          : uploadState.assetType === 'lexicon'
            ? (t("upload_lexicon_title") || "Upload Lexicon")
            : uploadState.assetType === 'workbench_template'
              ? (t("upload_template_title") || "Upload Template")
              : (t("upload_chameleon_title") || "Upload Chameleon")}
        subtitle={uploadState.name || (t("status_draft") || "Draft")}
        icon={uploadState.assetType === 'blueprint' ? "account_tree" : "cloud_upload"}
        headerActions={
          isVerifiedMason ? (
            <PanelHeaderGroup>
              {uploadState.editId && uploadState.assetType !== 'blueprint' && (
                <PanelHeaderButton
                  icon={uploadState.isHidden ? "visibility" : "visibility_off"}
                  tooltip={uploadState.isHidden ? t("btn_show_asset") || "Publish Asset" : t("btn_hide_asset") || "Hide Asset"}
                  onClick={async () => {
                    const newIsPublic = uploadState.isHidden;
                    const { error } = await supabase.from('nexus_assets').update({ is_public: newIsPublic }).eq('id', uploadState.editId);
                    if (error) {
                      useStore.getState().pushStatus(`Failed to update asset visibility: ${error.message} ${error.details ? `(${error.details})` : ''}`, "error");
                    } else {
                      useStore.getState().pushStatus(newIsPublic ? "Asset is now public." : "Asset is now hidden.", "success");
                      setUploadState(s => ({ ...s, isHidden: !newIsPublic }));
                      fetchAssets();
                    }
                  }}
                />
              )}
              <PanelHeaderButton
                icon="cloud_upload"
                tooltip={uploadState.editId ? (uploadState.isHidden ? (t("upload_btn_relink") || "Relink") : (t("upload_btn_update") || "Update")) : (t("upload_btn_publish") || "Publish")}
                onClick={submitUpload}
                disabled={!uploadState.name || (uploadState.language === 'add_new' && !uploadState.newLanguage)}
                variant="accent"
              />
            </PanelHeaderGroup>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-6">
          <SidePanelTitleInput
            value={uploadState.name}
            onChange={(val) => setUploadState(s => ({ ...s, name: val }))}
            placeholder={
              uploadState.assetType === 'lexicon'
                ? (t("upload_lexicon_name") || "Lexicon Name")
                : uploadState.assetType === 'workbench_template'
                  ? (t("upload_template_name") || "Template Name")
                  : uploadState.assetType === 'blueprint'
                    ? (t("upload_blueprint_name") || "Blueprint Name")
                    : (t("upload_chameleon_name") || "Chameleon Name")
            }
          />

          {uploadState.assetType !== 'workbench_template' && uploadState.assetType !== 'blueprint' && (
            <div className="flex flex-col gap-2 animate-in slide-in-from-top-2">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("upload_file") || "File"}</label>
              <div className="flex items-center gap-4">
                <div className="flex-1 glass-surface rounded-xl px-5 py-3 text-sm font-bold text-[var(--text)] truncate opacity-70">
                  {uploadState.fileName || (t("no_file_selected") || "No file selected")}
                </div>
              </div>
            </div>
          )}

          {uploadState.assetType !== 'blueprint' && (
            <>
              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("label_version") || "Version"}</label>
                <input
                  type="text"
                  value={uploadState.version}
                  onChange={e => setUploadState(s => ({ ...s, version: e.target.value }))}
                  className="w-full glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("upload_desc") || "Description"}</label>
                <textarea
                  value={uploadState.description}
                  onChange={e => setUploadState(s => ({ ...s, description: e.target.value }))}
                  className="w-full glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent min-h-[150px] custom-scrollbar resize-none"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2 flex items-center gap-2">
                  <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">campaign</span>
                  {t("whats_new") || "What's New"}
                </label>
                <textarea
                  value={uploadState.releaseNotes || ""}
                  onChange={e => setUploadState(s => ({ ...s, releaseNotes: e.target.value }))}
                  placeholder={t("update_panel_no_notes") || "Release notes..."}
                  className="w-full glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent min-h-[100px] custom-scrollbar resize-none"
                />
              </div>

              {uploadState.assetType === 'workbench_template' && uploadState.fileContent && (
                <div className="flex flex-col gap-4 p-5 rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] mt-2">
                  <h4 className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)] flex items-center gap-2 mb-1">
                    <span className="material-symbols-outlined !text-[14px]">{t("icon_info") || "info"}</span>
                    {t("auto_detected_architecture") || "Detected Architecture"}
                  </h4>
                  <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-[10px] font-mono">
                    {uploadState.fileContent.template_id && (
                      <div className="flex flex-col gap-1">
                        <span className="text-[var(--subtext)] opacity-60">{t("auto_template_id") || "Template ID"}</span>
                        <span className="text-[var(--text)] font-black truncate">{uploadState.fileContent.template_id}</span>
                      </div>
                    )}
                    {uploadState.fileContent.schema_version && (
                      <div className="flex flex-col gap-1">
                        <span className="text-[var(--subtext)] opacity-60">{t("auto_schema") || "Schema"}</span>
                        <span className="text-[var(--text)] font-black">{t("auto_v") || "v"}{uploadState.fileContent.schema_version}</span>
                      </div>
                    )}
                    {uploadState.version && (
                      <div className="flex flex-col gap-1">
                        <span className="text-[var(--subtext)] opacity-60">{t("update_version") || "Version"}</span>
                        <span className="text-[var(--text)] font-black">{uploadState.version}</span>
                      </div>
                    )}
                    {uploadState.fileContent.mod_author && (
                      <div className="flex flex-col gap-1">
                        <span className="text-[var(--subtext)] opacity-60">{t("auto_mod_author") || "Author"}</span>
                        <span className="text-[var(--text)] font-black truncate">{uploadState.fileContent.mod_author}</span>
                      </div>
                    )}
                    {uploadState.fileContent.parser_type && (
                      <div className="flex flex-col gap-1">
                        <span className="text-[var(--subtext)] opacity-60">{t("auto_parser") || "Parser"}</span>
                        <span className="text-[var(--text)] font-black capitalize">{uploadState.fileContent.parser_type}</span>
                      </div>
                    )}
                    {uploadState.fileContent.write_scope && (
                      <div className="flex flex-col gap-1">
                        <span className="text-[var(--subtext)] opacity-60">{t("auto_write_scope") || "Write Scope"}</span>
                        <span className="text-[var(--text)] font-black capitalize truncate">{uploadState.fileContent.write_scope}</span>
                      </div>
                    )}
                  </div>
                  {uploadState.fileContent.supported_mod_versions && Array.isArray(uploadState.fileContent.supported_mod_versions) && uploadState.fileContent.supported_mod_versions.length > 0 && (
                    <div className="flex flex-col gap-2 mt-1 pt-3 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                      <span className="text-[var(--subtext)] opacity-60 text-[9px] font-mono">{t("auto_supported_versions") || "Supported Versions"}</span>
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
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("tab_lexicons") || "Lexicons"}</label>
                    <CustomDropdown disableTint={true}
                      value={uploadState.language}
                      onChange={(val: string[]) => setUploadState(s => ({ ...s, language: val[0] }))}
                      options={[
                        ...availableLanguages.map(l => ({ id: l, label: l })),
                        { id: "add_new", label: t("upload_add_language") || "Add New Language" }
                      ]}
                    />
                  </div>
                  {uploadState.language === 'add_new' && (
                    <div className="flex flex-col gap-2 animate-in slide-in-from-top-2">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("upload_new_language") || "New Language"}</label>
                      <input
                        type="text"
                        value={uploadState.newLanguage}
                        onChange={e => setUploadState(s => ({ ...s, newLanguage: e.target.value }))}
                        className="w-full glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent"
                        placeholder={t("ph_language") || "Language..."}
                      />
                    </div>
                  )}
                  <div className="flex flex-col gap-2 relative z-[50]">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("filter_type") || "Type"}</label>
                    <CustomDropdown disableTint={true}
                      value={uploadState.lexiconType}
                      onChange={(val: string[]) => setUploadState(s => ({ ...s, lexiconType: val[0] }))}
                      options={[
                        { id: "Theme", label: t("type_theme") || "Theme" },
                        { id: "Default", label: t("type_default") || "Default" }
                      ]}
                    />
                  </div>
                </>
              )}

              {uploadState.assetType === 'chameleon' && (
                <div className="flex flex-col gap-2 relative z-[60]">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("filter_mode") || "Mode"}</label>
                  <CustomDropdown disableTint={true}
                    value={uploadState.themeMode}
                    onChange={(val: string[]) => setUploadState(s => ({ ...s, themeMode: val[0] }))}
                    options={[
                      { id: "Dark", label: t("mode_dark") || "Dark" },
                      { id: "Light", label: t("mode_light") || "Light" }
                    ]}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </SidePanel>
    </ElevatedHubLayout>
  );
}


