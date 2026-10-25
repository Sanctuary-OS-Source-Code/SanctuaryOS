import React, { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import {
  SidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  StatBox,
  CustomDropdown,
  EmptyState,
  LoadingScreen,
  ActionButton,
  formatOverviewMetric,
  PanelHeaderGroup,
  PanelHeaderButton,
  compareVersions,
} from "./shared";
import pkg from "../package.json";
import { UniversalCard } from "./components/universal/UniversalCard";
import {
  DynamicThemePreviewBanner,
  DynamicLexiconPreviewBanner,
  DynamicBlueprintPreviewBanner,
  DynamicTemplatePreviewBanner,
} from "./chameleon-components/ThemeCard";
import {
  ElevatedHubLayout,
  HubOverviewLanding,
  HubOverviewSection,
  SidePanelTitleInput,
} from "./components/layouts/ElevatedHubLayout";

const VAULT_CHIP_CLASS =
  "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

export function MasonNexus({
  masonProfile,
  isVerifiedMason = true,
}: {
  masonProfile: any;
  isVerifiedMason?: boolean;
}) {
  const { t } = useLexicon();
  const session = useStore((state) => state.session);
  const selectedVersion = useStore((state) => state.selectedVersion);
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [availableLanguages, setAvailableLanguages] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<
    "overview" | "lexicon" | "chameleon" | "workbench_template" | "blueprint"
  >("overview");
  const [blueprints, setBlueprints] = useState<any[]>([]);
  const [flags, setFlags] = useState<any[]>([]);
  const [bpFlags, setBpFlags] = useState<any[]>([]);
  const [latestGameVersion, setLatestGameVersion] = useState<string>("");

  const invalidateNexusCache = () => {
    if (typeof window !== "undefined" && (window as any).__sanctuaryCache?.nexus) {
      (window as any).__sanctuaryCache.nexus.lastHomeFetch = 0;
      (window as any).__sanctuaryCache.nexus.lastAssetFetch = 0;
      (window as any).__sanctuaryCache.nexus.recentFeed = [];
    }
  };

  const [uploadState, setUploadState] = useState({
    isOpen: false,
    editId: null as string | null,
    assetType: "lexicon",
    isHidden: false,
    fileContent: null as any,
    fileName: "",
    name: "",
    version: "1.0.0",
    description: "",
    releaseNotes: "",
    language: "English",
    newLanguage: "",
    lexiconType: "Theme",
    themeMode: "Dark",
  });

  useEffect(() => {
    fetchAssets();
  }, [masonProfile]);

  const fetchAssets = async () => {
    setLoading(true);
    const [
      { data: assetsData },
      { data: bpData },
      { data: flagsData },
      { data: bpFlagsData },
      { data: gvData },
    ] = await Promise.all([
      supabase
        .from("nexus_assets")
        .select("*")
        .or(`author_id.eq.${masonProfile.id},author.ilike.${masonProfile.name}`)
        .order("created_at", { ascending: false }),
      supabase
        .from("blueprints")
        .select("*")
        .eq("mason_id", masonProfile.id)
        .order("created_at", { ascending: false }),
      supabase.from("nexus_reports").select("*").order("created_at", { ascending: false }),
      supabase.from("blueprint_reports").select("*").order("created_at", { ascending: false }),
      supabase.from("game_versions").select("version").order("created_at", { ascending: false }),
    ]);

    if (assetsData) {
      setAssets(assetsData);
      const dbLangs = assetsData?.map((d) => d.language).filter(Boolean) || [];
      const commonLangs = [
        "English",
        "Spanish",
        "French",
        "German",
        "Italian",
        "Portuguese",
        "Russian",
        "Japanese",
        "Korean",
        "Chinese",
      ];
      setAvailableLanguages(Array.from(new Set([...commonLangs, ...dbLangs])) as string[]);
    }
    if (bpData) setBlueprints(bpData);
    if (flagsData) {
      const myAssetIds = assetsData?.map((a) => a.id) || [];
      setFlags(flagsData.filter((f: any) => myAssetIds.includes(f.asset_id)));
    }
    if (bpFlagsData) {
      const myBpIds = bpData?.map((b) => b.id) || [];
      setBpFlags(bpFlagsData.filter((f: any) => myBpIds.includes(f.blueprint_id)));
    }
    if (gvData && gvData.length > 0) {
      let highestVer = "";
      for (const row of gvData) {
        const v = String(row.version || "").trim();
        if (!v || v.toUpperCase() === "ALL" || v.toUpperCase() === "ANY") continue;
        if (!highestVer || compareVersions(v.replace(/^v/i, ""), highestVer.replace(/^v/i, "")) > 0) {
          highestVer = v;
        }
      }
      setLatestGameVersion(highestVer);
    }
    setLoading(false);
  };

  const handleEditAsset = (asset: any, isBp: boolean = false) => {
    let parsedContent = null;
    if (!isBp && asset.json_data) {
      parsedContent =
        typeof asset.json_data === "string" ? JSON.parse(asset.json_data) : asset.json_data;
    }
    let v = asset.version || "1.0.0";
    if (!isBp && asset.asset_type === "workbench_template") {
      if (parsedContent?.template_version) v = parsedContent.template_version;
      else if (parsedContent?.version) v = parsedContent.version;
    }
    setUploadState({
      isOpen: true,
      editId: asset.id,
      assetType: isBp ? "blueprint" : asset.asset_type,
      isHidden: asset.is_public === false,
      fileContent: parsedContent,
      fileName: asset.name,
      name: asset.name,
      version: v,
      description: asset.description || "",
      releaseNotes: asset.release_notes || "",
      language:
        asset.language || (availableLanguages.length > 0 ? availableLanguages[0] : "English"),
      newLanguage: "",
      lexiconType: asset.lexicon_type || "Theme",
      themeMode: asset.theme_mode || "Dark",
    });
  };

  const submitUpload = async () => {
    try {
      if (uploadState.assetType === "blueprint") {
        const bpPayload = { name: uploadState.name };
        if (uploadState.editId) {
          const { error } = await supabase
            .from("blueprints")
            .update(bpPayload)
            .eq("id", uploadState.editId);
          if (error) throw error;
          useStore
            .getState()
            .pushStatus(t("upload_blueprint_title", "Update {Blueprint}") + " successful.", "success");
        }
        setUploadState((s) => ({ ...s, isOpen: false }));
        invalidateNexusCache();
        fetchAssets();
        return;
      }

      const finalLanguage =
        uploadState.language === "add_new" ? uploadState.newLanguage : uploadState.language;
      const finalContent = {
        ...uploadState.fileContent,
        os_version: pkg.version || "0.5.8",
      };
      if (uploadState.assetType === "workbench_template") {
        if (finalContent.template_version !== undefined)
          finalContent.template_version = uploadState.version;
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
        language: uploadState.assetType === "lexicon" ? finalLanguage : null,
        lexicon_type: uploadState.assetType === "lexicon" ? uploadState.lexiconType : null,
        theme_mode: uploadState.assetType === "chameleon" ? uploadState.themeMode : null,
      };

      if (uploadState.editId) {
        const { error } = await supabase
          .from("nexus_assets")
          .update(payload)
          .eq("id", uploadState.editId);
        if (error) throw error;
        useStore
          .getState()
          .pushStatus(t("saved_success", "Updated listing successfully."), "success");
        setUploadState((s) => ({ ...s, isOpen: false }));
        invalidateNexusCache();
        fetchAssets();
      } else {
        const { error } = await supabase.from("nexus_assets").insert([
          {
            ...payload,
            author: masonProfile.name,
            author_id: session?.user?.id || masonProfile.id,
            downloads: 0,
          },
        ]);
        if (error) throw error;
        useStore
          .getState()
          .pushStatus(t("upload_success", "Published successfully."), "success");
        setUploadState((s) => ({ ...s, isOpen: false }));
        invalidateNexusCache();
        fetchAssets();
      }
    } catch (err: any) {
      console.error("SUPABASE ERROR:", err);
      useStore
        .getState()
        .pushStatus(
          `${t("alert_error", "Error:")} ${err.message} ${err.details ? `(${err.details})` : ""}`,
          "error"
        );
    }
  };

  if (loading) return <LoadingScreen title={t("market_fetching", "Fetching Nexus Assets...")} />;

  const getTabAssets = (tabId: string) => {
    if (tabId === "overview") return [...assets, ...blueprints];
    if (tabId === "blueprint") return blueprints;
    return assets.filter((a) => a.asset_type === tabId);
  };

  const getFilteredAssets = (tabAssets: any[]) => {
    return tabAssets.filter((a) => {
      const matchSearch =
        a.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (a.description || "").toLowerCase().includes(searchQuery.toLowerCase());
      return matchSearch;
    });
  };

  const tabs = [
    {
      id: "overview",
      label: t("overview", "Overview"),
      icon: t("icon_dashboard", "dashboard"),
      number: formatOverviewMetric(getFilteredAssets(getTabAssets("overview")), "created_at"),
    },
    {
      id: "lexicon",
      label: t("tab_lexicons", "Lexicons"),
      icon: t("icon_translate", "translate"),
      number: getFilteredAssets(getTabAssets("lexicon")).length,
    },
    {
      id: "chameleon",
      label: t("tab_chameleons", "Chameleons"),
      icon: t("icon_palette", "palette"),
      number: getFilteredAssets(getTabAssets("chameleon")).length,
    },
    {
      id: "workbench_template",
      label: t("tab_templates", "Templates"),
      icon: t("icon_draw", "draw"),
      number: getFilteredAssets(getTabAssets("workbench_template")).length,
    },
    {
      id: "blueprint",
      label: t("tab_blueprints", "{Blueprints}"),
      icon: t("icon_account_tree", "account_tree"),
      number: getFilteredAssets(getTabAssets("blueprint")).length,
    },
  ];

  const currentTabAssets = getTabAssets(activeTab);
  const filteredAssets = getFilteredAssets(currentTabAssets);

  const isAssetFlagged = (asset: any, isBp: boolean = false) => {
    if (!asset) return false;
    if (isBp) {
      return (
        bpFlags.some((f) => f.blueprint_id === asset.id) ||
        flags.some((f) => f.asset_id === asset.id) ||
        (typeof asset.compliance_tier === "number" && asset.compliance_tier > 0)
      );
    }
    return flags.some((f) => f.asset_id === asset.id);
  };

  const isAssetOutdated = (asset: any, isBp: boolean = false) => {
    if (!asset) return false;
    let parsedJson: any = null;
    if (asset.json_data) {
      try {
        const raw =
          typeof asset.json_data === "string" ? JSON.parse(asset.json_data) : asset.json_data;
        parsedJson = Array.isArray(raw) ? raw[0] : raw;
      } catch {}
    }

    const effectiveLatestGameVer =
      latestGameVersion ||
      (selectedVersion && selectedVersion !== "All" && selectedVersion !== "ANY"
        ? selectedVersion
        : "");
    const targetGameVer =
      asset.game_version || parsedJson?.game_version || parsedJson?.target_game_version;
    if (
      effectiveLatestGameVer &&
      targetGameVer &&
      String(targetGameVer).toUpperCase() !== "ALL" &&
      String(targetGameVer).toUpperCase() !== "ANY"
    ) {
      const cleanLatest = String(effectiveLatestGameVer).replace(/^v/i, "").trim();
      const cleanTarget = String(targetGameVer).replace(/^v/i, "").trim();
      if (cleanLatest && cleanTarget && compareVersions(cleanLatest, cleanTarget) > 0) {
        return true;
      }
    }

    const currentOsVer = String(pkg.version || "0.5.8").replace(/^v/i, "").trim();
    const targetOsVer =
      asset.os_version ||
      parsedJson?.os_version ||
      parsedJson?._meta_os_version ||
      parsedJson?.target_os_version ||
      parsedJson?.min_os_version;
    if (targetOsVer && currentOsVer) {
      const cleanTargetOs = String(targetOsVer).replace(/^v/i, "").trim();
      if (cleanTargetOs && compareVersions(currentOsVer, cleanTargetOs) > 0) {
        return true;
      }
    }

    if (
      !isBp &&
      asset.asset_type === "workbench_template" &&
      parsedJson?.schema_version &&
      compareVersions("1.0", String(parsedJson.schema_version).replace(/^v/i, "").trim()) > 0
    ) {
      return true;
    }

    return false;
  };

  const renderAssetCard = (asset: any, isBp: boolean = false) => {
    const isHidden = asset.is_public === false;
    const displayAssetType = isBp ? "blueprint" : asset.asset_type;
    const isFlagged = isAssetFlagged(asset, isBp);
    const isOutdated = isAssetOutdated(asset, isBp);

    const statusIcon = isFlagged
      ? t("icon_flag", "flag")
      : isOutdated
        ? t("icon_update", "update")
        : isHidden
          ? t("icon_visibility_off", "visibility_off")
          : t("icon_verified", "verified");
    const statusIconColor = isFlagged
      ? "text-[var(--danger)]"
      : isOutdated || isHidden
        ? "text-[var(--warning)]"
        : "text-[var(--success)]";
    const statusLabel = isFlagged
      ? t("flagged", "Flagged")
      : isOutdated
        ? t("status_outdated", "Outdated")
        : isHidden
          ? t("reply_hidden", "Hidden")
          : t("status_active", "Published");

    const typeIcon =
      displayAssetType === "chameleon"
        ? t("icon_palette", "palette")
        : displayAssetType === "workbench_template"
          ? t("icon_draw", "draw")
          : displayAssetType === "blueprint"
            ? t("icon_account_tree", "account_tree")
            : t("icon_translate", "translate");

    const typeLabel =
      displayAssetType === "chameleon"
        ? t("chameleon", "Theme")
        : displayAssetType === "workbench_template"
          ? t("workbench_template", "Template")
          : displayAssetType === "blueprint"
            ? t("blueprint", "{Blueprint}")
            : t("lex_lexicon", "Lexicon");

    const authorName =
      asset.author || masonProfile?.name || t("unknown_mason", "Unknown {Mason}");

    const previewBanner =
      displayAssetType === "chameleon" ? (
        <DynamicThemePreviewBanner
          data={{
            ...asset,
            ...(typeof asset.json_data === "object" ? asset.json_data : {}),
            name: asset.name,
            previewImage: asset.image_url || asset.json_data?.previewImage,
          }}
          heightClass="h-full"
        />
      ) : displayAssetType === "workbench_template" ? (
        <DynamicTemplatePreviewBanner data={asset} heightClass="h-full" />
      ) : displayAssetType === "blueprint" ? (
        <DynamicBlueprintPreviewBanner data={asset} heightClass="h-full" />
      ) : (
        <DynamicLexiconPreviewBanner data={asset} heightClass="h-full" />
      );

    return (
      <UniversalCard
        key={asset.id}
        onClick={() => handleEditAsset(asset, isBp)}
        layout="vertical"
        title={asset.name || (t("market_untitled", "Untitled") as string)}
        subtitle={`${t("by_prefix", "By")} ${authorName}`}
        icon={typeIcon}
        customIcon={previewBanner}
        imageOverlay={
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
            <div className={VAULT_CHIP_CLASS}>
              <span className={`material-symbols-outlined !text-[12px] ${statusIconColor}`}>
                {statusIcon}
              </span>
              <span>{statusLabel}</span>
            </div>
          </div>
        }
        badges={
          <>
            {(isFlagged || isOutdated) && isHidden && (
              <div className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                  {t("icon_visibility_off", "visibility_off")}
                </span>
                <span>{t("reply_hidden", "Hidden")}</span>
              </div>
            )}
            {isFlagged && isOutdated && (
              <div className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                  {t("icon_update", "update")}
                </span>
                <span>{t("status_outdated", "Outdated")}</span>
              </div>
            )}
            <div className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {typeIcon}
              </span>
              <span>{typeLabel}</span>
            </div>
            {asset.version && (
              <div className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                  {t("icon_history", "history")}
                </span>
                <span>{`${t("auto_v", "v")}${String(asset.version).replace(/^v/i, "")}`}</span>
              </div>
            )}
            {(asset.language || asset.theme_mode) && (
              <div className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                  {asset.theme_mode
                    ? t("icon_contrast", "contrast")
                    : t("icon_language", "language")}
                </span>
                <span>{asset.theme_mode || asset.language}</span>
              </div>
            )}
          </>
        }
        footer={
          <div className="flex items-center justify-between w-full text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
            <span className="flex items-center gap-1.5 opacity-75">
              <span className="material-symbols-outlined !text-[13px] text-[var(--subtext)]">
                {t("icon_download", "download")}
              </span>
              <span>{asset.downloads || 0}</span>
            </span>
            <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
              {t("edit", "Edit")} <span className="text-base leading-none">&rarr;</span>
            </span>
          </div>
        }
      >
        <p className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed line-clamp-2">
          {!isBp
            ? asset.description || t("no_desc", "No description provided.")
            : t("blueprint", "{Blueprint}")}
        </p>
      </UniversalCard>
    );
  };

  const renderLanding = () => {
    const recentAssets = [...assets]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);
    const recentBlueprints = [...blueprints]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);

    const recentCombined = [
      ...recentAssets.slice(0, 2).map((a) => ({ item: a, isBp: false })),
      ...recentBlueprints.slice(0, 2).map((a) => ({ item: a, isBp: true })),
    ];
    const anomalyItems = [
      ...assets
        .filter((a) => isAssetFlagged(a, false) || isAssetOutdated(a, false))
        .map((a) => ({ item: a, isBp: false })),
      ...blueprints
        .filter((b) => isAssetFlagged(b, true) || isAssetOutdated(b, true))
        .map((b) => ({ item: b, isBp: true })),
    ].slice(0, 4);

    return (
      <HubOverviewLanding>
        <HubOverviewSection
          icon={t("icon_schedule", "schedule")}
          iconColorClass="text-[var(--accent)]"
          title={t("chameleons_overview_recent", "Recent")}
          isEmpty={recentCombined.length === 0}
          emptyIcon={t("icon_storefront", "storefront")}
          emptyTitle={t("market_no_assets", "No Assets Found")}
        >
          {recentCombined.map(({ item, isBp }) => renderAssetCard(item, isBp))}
        </HubOverviewSection>

        <HubOverviewSection
          icon={t("icon_warning", "warning")}
          iconColorClass="text-[var(--warning)]"
          title={t("chameleons_overview_anomalies", "Anomalies")}
          isEmpty={anomalyItems.length === 0}
          emptyIcon={t("icon_check_circle", "check_circle")}
          emptyTitle={t("no_issues", "No issues detected")}
        >
          {anomalyItems.map(({ item, isBp }) => renderAssetCard(item, isBp))}
        </HubOverviewSection>
      </HubOverviewLanding>
    );
  };

  const renderList = () => {
    return (
      <div className="flex flex-col gap-10 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {filteredAssets.length === 0 ? (
          <EmptyState
            icon={t("icon_storefront", "storefront")}
            title={t("market_no_assets", "No Assets Found")}
            className="col-span-full py-16"
          />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
            {filteredAssets.map((asset) => {
              const isBp = activeTab === "blueprint";
              return renderAssetCard(asset, isBp);
            })}
          </div>
        )}
      </div>
    );
  };

  const panelTitle = uploadState.editId
    ? uploadState.assetType === "blueprint"
      ? t("upload_blueprint_title", "Update {Blueprint}")
      : t("upload_update_existing", "Update Asset")
    : uploadState.assetType === "lexicon"
      ? t("upload_lexicon_title", "Upload {Lexicon}")
      : uploadState.assetType === "workbench_template"
        ? t("upload_template_title", "Upload Template")
        : t("upload_chameleon_title", "Upload {Chameleon}");

  return (
    <ElevatedHubLayout
      headerTitle={t("tab_nexus", "{Nexus}")}
      headerIcon={t("icon_hub", "hub")}
      search={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder={t("market_search", "Search...") as string}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as any)}
      hideSearch={activeTab === "overview"}
      actions={
        isVerifiedMason && activeTab !== "overview" && activeTab !== "blueprint"
          ? [
              {
                id: "add_new",
                icon: (
                  <span className="material-symbols-outlined !text-[20px]">
                    {t("icon_add", "add")}
                  </span>
                ),
                label: t("badge_new", "New"),
                onClick: () =>
                  setUploadState({
                    isOpen: true,
                    editId: null,
                    assetType: activeTab,
                    isHidden: false,
                    name: "",
                    version: "1.0.0",
                    description: "",
                    releaseNotes: "",
                    fileContent: null,
                    fileName: "",
                    language: availableLanguages.length > 0 ? availableLanguages[0] : "English",
                    newLanguage: "",
                    lexiconType: "Theme",
                    themeMode: "Dark",
                  }),
              },
            ]
          : undefined
      }
    >
      {activeTab === "overview" ? renderLanding() : renderList()}

      <SidePanel
        isOpen={uploadState.isOpen}
        onClose={() => setUploadState((s) => ({ ...s, isOpen: false }))}
        title={panelTitle}
        subtitle={uploadState.name || t("btn_draft", "Draft")}
        icon={
          uploadState.assetType === "blueprint"
            ? t("icon_account_tree", "account_tree")
            : t("icon_cloud_upload", "cloud_upload")
        }
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[680px]"
        headerActions={
          isVerifiedMason ? (
            <PanelHeaderGroup>
              {uploadState.editId && uploadState.assetType !== "blueprint" && (
                <PanelHeaderButton
                  icon={
                    uploadState.isHidden
                      ? t("icon_visibility", "visibility")
                      : t("icon_visibility_off", "visibility_off")
                  }
                  tooltip={
                    uploadState.isHidden
                      ? t("btn_show_asset", "Publish Asset")
                      : t("btn_hide_asset", "Hide Asset")
                  }
                  onClick={async () => {
                    const newIsPublic = uploadState.isHidden;
                    const { error } = await supabase
                      .from("nexus_assets")
                      .update({ is_public: newIsPublic })
                      .eq("id", uploadState.editId);
                    if (error) {
                      useStore
                        .getState()
                        .pushStatus(
                          `${t("alert_error", "Error:")} ${error.message} ${
                            error.details ? `(${error.details})` : ""
                          }`,
                          "error"
                        );
                    } else {
                      useStore
                        .getState()
                        .pushStatus(
                          newIsPublic
                            ? t("btn_show_asset", "Publish Asset")
                            : t("btn_hide_asset", "Hide Asset"),
                          "success"
                        );
                      setUploadState((s) => ({ ...s, isHidden: !newIsPublic }));
                      invalidateNexusCache();
                      fetchAssets();
                    }
                  }}
                />
              )}
              <PanelHeaderButton
                icon={t("icon_cloud_upload", "cloud_upload")}
                tooltip={
                  uploadState.editId
                    ? uploadState.isHidden
                      ? t("upload_btn_relink", "Relink")
                      : t("upload_btn_update", "Update")
                    : t("upload_btn_publish", "Publish")
                }
                onClick={submitUpload}
                disabled={
                  !uploadState.name ||
                  (uploadState.language === "add_new" && !uploadState.newLanguage)
                }
                variant="accent"
              />
            </PanelHeaderGroup>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={
              uploadState.assetType === "blueprint"
                ? t("icon_account_tree", "account_tree")
                : t("icon_cloud_upload", "cloud_upload")
            }
            overline={uploadState.assetType}
            title={uploadState.name || panelTitle}
            description={t(
              "upload_desc",
              "Configure asset metadata, version telemetry, and release notes for Nexus publication."
            )}
            badge={`v${uploadState.version || "1.0.0"}`}
            variant={uploadState.isHidden ? "warning" : "accent"}
          />

          <SidePanelTitleInput
            label={
              uploadState.assetType === "lexicon"
                ? t("upload_lexicon_name", "{Lexicon} Name")
                : uploadState.assetType === "workbench_template"
                  ? t("upload_template_name", "Template Name")
                  : uploadState.assetType === "blueprint"
                    ? t("upload_blueprint_name", "{Blueprint} Name")
                    : t("upload_chameleon_name", "{Chameleon} Name")
            }
            value={uploadState.name}
            onChange={(val) => setUploadState((s) => ({ ...s, name: val }))}
            placeholder={
              uploadState.assetType === "lexicon"
                ? t("upload_lexicon_name", "{Lexicon} Name")
                : uploadState.assetType === "workbench_template"
                  ? t("upload_template_name", "Template Name")
                  : uploadState.assetType === "blueprint"
                    ? t("upload_blueprint_name", "{Blueprint} Name")
                    : t("upload_chameleon_name", "{Chameleon} Name")
            }
          />

          {uploadState.assetType !== "blueprint" && (
            <UniversalGroup
              title={t("upload_desc", "Asset Configuration")}
              icon={t("icon_edit_note", "edit_note")}
            >
              <div className="flex flex-col gap-4">
                {uploadState.assetType !== "workbench_template" && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest ml-1">
                      {t("upload_file", "File")}
                    </label>
                    <div className="glass-surface rounded-xl px-4 py-3 text-sm font-bold text-[var(--text)] truncate opacity-80 border border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                      {uploadState.fileName || t("no_file_selected", "No file selected")}
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest ml-1">
                    {t("label_version", "Version")}
                  </label>
                  <input
                    type="text"
                    value={uploadState.version}
                    onChange={(e) => setUploadState((s) => ({ ...s, version: e.target.value }))}
                    className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent border border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest ml-1">
                    {t("upload_desc", "Description")}
                  </label>
                  <textarea
                    value={uploadState.description}
                    onChange={(e) => setUploadState((s) => ({ ...s, description: e.target.value }))}
                    className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent min-h-[120px] custom-scrollbar resize-none border border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest ml-1 flex items-center gap-1.5">
                    <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                      {t("icon_campaign", "campaign")}
                    </span>
                    {t("whats_new", "What's New")}
                  </label>
                  <textarea
                    value={uploadState.releaseNotes || ""}
                    onChange={(e) =>
                      setUploadState((s) => ({ ...s, releaseNotes: e.target.value }))
                    }
                    placeholder={t("update_panel_no_notes", "Release notes...")}
                    className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent min-h-[96px] custom-scrollbar resize-none border border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                  />
                </div>

                {uploadState.assetType === "lexicon" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5 relative z-[60]">
                      <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest ml-1">
                        {t("tab_lexicons", "Language")}
                      </label>
                      <CustomDropdown
                        disableTint={true}
                        value={uploadState.language}
                        onChange={(val: string[]) =>
                          setUploadState((s) => ({ ...s, language: val[0] }))
                        }
                        options={[
                          ...availableLanguages.map((l) => ({ id: l, label: l })),
                          { id: "add_new", label: t("upload_add_language", "Add New {Lexicon}...") },
                        ]}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5 relative z-[50]">
                      <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest ml-1">
                        {t("filter_type", "Type")}
                      </label>
                      <CustomDropdown
                        disableTint={true}
                        value={uploadState.lexiconType}
                        onChange={(val: string[]) =>
                          setUploadState((s) => ({ ...s, lexiconType: val[0] }))
                        }
                        options={[
                          { id: "Theme", label: t("chameleon", "Theme") },
                          { id: "Default", label: t("type_default", "Default") },
                        ]}
                      />
                    </div>
                    {uploadState.language === "add_new" && (
                      <div className="flex flex-col gap-1.5 sm:col-span-2">
                        <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest ml-1">
                          {t("upload_new_language", "New {Lexicon} Name")}
                        </label>
                        <input
                          type="text"
                          value={uploadState.newLanguage}
                          onChange={(e) =>
                            setUploadState((s) => ({ ...s, newLanguage: e.target.value }))
                          }
                          className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent border border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                          placeholder={t("ph_language", "Language...")}
                        />
                      </div>
                    )}
                  </div>
                )}

                {uploadState.assetType === "chameleon" && (
                  <div className="flex flex-col gap-1.5 relative z-[60]">
                    <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest ml-1">
                      {t("filter_mode", "Mode")}
                    </label>
                    <CustomDropdown
                      disableTint={true}
                      value={uploadState.themeMode}
                      onChange={(val: string[]) =>
                        setUploadState((s) => ({ ...s, themeMode: val[0] }))
                      }
                      options={[
                        { id: "Dark", label: t("mode_dark", "Dark") },
                        { id: "Light", label: t("mode_light", "Light") },
                      ]}
                    />
                  </div>
                )}
              </div>
            </UniversalGroup>
          )}

          {uploadState.assetType === "workbench_template" && uploadState.fileContent && (
            <UniversalGroup
              title={t("auto_detected_architecture", "Detected Architecture")}
              icon={t("icon_info", "info")}
            >
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {uploadState.fileContent.template_id && (
                    <StatBox
                      label={t("auto_template_id", "Template ID")}
                      value={uploadState.fileContent.template_id}
                      icon={t("icon_tag", "tag")}
                      iconColorClass="text-[var(--accent)]"
                    />
                  )}
                  {uploadState.fileContent.schema_version && (
                    <StatBox
                      label={t("auto_schema", "Schema")}
                      value={`${t("auto_v", "v")}${uploadState.fileContent.schema_version}`}
                      icon={t("icon_schema", "schema")}
                      iconColorClass="text-[var(--accent)]"
                    />
                  )}
                  {uploadState.version && (
                    <StatBox
                      label={t("label_version", "Version")}
                      value={uploadState.version}
                      icon={t("icon_new_releases", "new_releases")}
                      iconColorClass="text-[var(--accent)]"
                    />
                  )}
                  {uploadState.fileContent.mod_author && (
                    <StatBox
                      label={t("auto_mod_author", "{Mod} Author")}
                      value={uploadState.fileContent.mod_author}
                      icon={t("icon_person", "person")}
                      iconColorClass="text-[var(--accent)]"
                    />
                  )}
                  {uploadState.fileContent.parser_type && (
                    <StatBox
                      label={t("auto_parser", "Parser")}
                      value={uploadState.fileContent.parser_type}
                      icon={t("icon_code", "code")}
                      iconColorClass="text-[var(--accent)]"
                    />
                  )}
                  {uploadState.fileContent.write_scope && (
                    <StatBox
                      label={t("workbench_write_scope", "Write Scope")}
                      value={uploadState.fileContent.write_scope}
                      icon={t("icon_edit", "edit")}
                      iconColorClass="text-[var(--accent)]"
                    />
                  )}
                </div>
                {uploadState.fileContent.supported_mod_versions &&
                  Array.isArray(uploadState.fileContent.supported_mod_versions) &&
                  uploadState.fileContent.supported_mod_versions.length > 0 && (
                    <div className="flex flex-col gap-2 pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("auto_supported_versions", "Supported Versions")}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {uploadState.fileContent.supported_mod_versions.map((v: string) => (
                          <span
                            key={v}
                            className="px-2 py-0.5 rounded-md bg-transparent border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[9px] font-black text-[var(--accent)]"
                          >
                            {v}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            </UniversalGroup>
          )}
        </div>
      </SidePanel>
    </ElevatedHubLayout>
  );
}
