import React, { useState, useEffect } from "react";
import { useLexicon } from "./LexiconContext";
import { supabase } from "./supabase";
import {
  stripMarkdown,
  compareVersions,
  SidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  StatBox,
  PanelHeaderGroup,
  PanelHeaderButton,
  getModFallbackUrl,
  handleOpenUrl,
} from "./shared";
import { VAULT_CHIP_CLASS } from "./Cards";
import { useTheme } from "./ThemeContext";
import { useStore } from "./store";
import { useModalStore } from "./store/modalStore";
import { isDesktop } from "./utils/envUtils";
import { readTextFile, writeTextFile, mkdir, exists, readDir } from "@tauri-apps/plugin-fs";
import {
  DynamicThemePreviewBanner,
  DynamicLexiconPreviewBanner,
  DynamicBlueprintPreviewBanner,
  DynamicTemplatePreviewBanner,
} from "./chameleon-components/ThemeCard";

export default function AssetPreviewSidebar({
  assetType,
  assetId,
  onClose,
  onFlag,
}: {
  assetType: string;
  assetId: string;
  onClose: () => void;
  onFlag?: (assetId: string, assetType: string) => void;
}) {
  const { t, importLexicon, registry } = useLexicon();
  const { importTheme, CORE_THEMES, customThemes } = useTheme();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [installedTemplates, setInstalledTemplates] = useState<Record<string, string>>({});
  const session = useStore((state) => state.session);
  const vaultPath = useStore((state) => state.vaultPath);
  const stagingDraftItems = useModalStore((state) => state.stagingDraftItems);
  const toggleModInStagingDraft = useModalStore((state) => state.toggleModInStagingDraft);
  const stageBlueprintToDraft = useModalStore((state) => state.stageBlueprintToDraft);

  useEffect(() => {
    const fetchLocalTemplates = async () => {
      try {
        if (!vaultPath) return;
        const templatesDir = `${vaultPath}\\Templates`;
        if (await exists(templatesDir)) {
          const files = await readDir(templatesDir);
          const map: Record<string, string> = {};
          for (const file of files) {
            if (file.name?.endsWith("_template.json")) {
              try {
                const content = await readTextFile(`${templatesDir}\\${file.name}`);
                const parsed = JSON.parse(content);
                const d = Array.isArray(parsed) ? parsed[0] : parsed;
                if (d.name) {
                  map[d.name] = d.version || "1.0.0";
                }
              } catch {}
            }
          }
          setInstalledTemplates(map);
        }
      } catch {}
    };
    fetchLocalTemplates();
  }, [vaultPath]);

  const isInstalled = (asset: any) => {
    if (!asset) return false;
    if (assetType === "chameleon") {
      return Object.values({ ...CORE_THEMES, ...customThemes }).some(
        (th: any) => th.name === asset.name
      );
    } else if (assetType === "workbench_template") {
      return !!installedTemplates[asset.name];
    } else if (assetType === "lexicon") {
      return !!registry?.[asset.name];
    }
    return false;
  };

  const getLocalVersion = (asset: any) => {
    if (!asset) return null;
    if (assetType === "chameleon") {
      const theme = Object.values({ ...CORE_THEMES, ...customThemes }).find(
        (th: any) => th.name === asset.name
      ) as any;
      return theme?.version || "1.0.0";
    } else if (assetType === "workbench_template") {
      return installedTemplates[asset.name];
    } else if (assetType === "lexicon") {
      const lex = registry?.[asset.name];
      return lex?._meta_version || "1.0.0";
    }
    return null;
  };

  const getAssetDisplayVersion = (asset: any) => {
    let version = asset.version || "1.0.0";
    if (assetType === "workbench_template" && asset.json_data) {
      try {
        const parsedRaw =
          typeof asset.json_data === "string" ? JSON.parse(asset.json_data) : data.json_data;
        const parsed = Array.isArray(parsedRaw) ? parsedRaw[0] : parsedRaw;
        if (parsed && parsed.template_version) {
          version = parsed.template_version;
        }
      } catch (e) {}
    }
    return version;
  };

  const isOutdated = (asset: any) => {
    if (!isInstalled(asset)) return false;
    const localVersion = getLocalVersion(asset);
    return compareVersions(getAssetDisplayVersion(asset), localVersion) > 0;
  };

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError("");
      try {
        if (assetType === "mod") {
          const { data: mData, error: mErr } = await supabase
            .from("mods")
            .select("*")
            .eq("id", assetId)
            .single();
          if (mErr) throw mErr;
          if (
            Number(mData?.compliance_tier || 0) >= 1 ||
            String(mData?.status || "").toLowerCase() === "unverified"
          ) {
            throw new Error(
              t(
                "err_asset_restricted",
                "This {mod} is restricted or unverified and cannot be previewed on the public network."
              )
            );
          }
          setData(mData);
        } else if (assetType === "blueprint") {
          const { data: bData, error: bErr } = await supabase
            .from("blueprints")
            .select("*")
            .eq("id", assetId)
            .single();
          if (bErr) throw bErr;
          if (Number(bData?.compliance_tier || 0) >= 1) {
            throw new Error(
              t(
                "err_asset_restricted",
                "This {mod} is restricted or unverified and cannot be previewed on the public network."
              )
            );
          }
          setData(bData);
        } else if (
          assetType === "lexicon" ||
          assetType === "chameleon" ||
          assetType === "workbench_template"
        ) {
          const { data: mData, error: mErr } = await supabase
            .from("nexus_assets")
            .select("*")
            .eq("id", assetId)
            .single();
          if (mErr) throw mErr;
          setData(mData);
        } else {
          setError(`Unsupported asset type: ${assetType}`);
        }
      } catch (err: any) {
        setError(err.message);
      }
      setLoading(false);
    }
    fetchData();
  }, [assetType, assetId]);

  const panelIcon =
    assetType === "chameleon"
      ? t("icon_palette", "palette")
      : assetType === "lexicon"
        ? t("icon_translate", "translate")
        : assetType === "blueprint"
          ? t("icon_map", "map")
          : assetType === "workbench_template"
            ? t("icon_edit", "edit")
            : t("icon_extension", "extension");

  const panelTitle =
    assetType === "chameleon"
      ? t("chameleon_inspector", "Chameleon Inspector")
      : assetType === "lexicon"
        ? t("lexicon_inspector", "Lexicon Inspector")
        : assetType === "workbench_template"
          ? t("template_inspector", "Template Inspector")
          : t("asset_inspector", "Asset Inspector");

  const panelSubtitle =
    assetType === "chameleon"
      ? t("chameleon_desc", "Community Theme")
      : assetType === "lexicon"
        ? t("lexicon_desc", "Community Language Pack")
        : assetType === "workbench_template"
          ? t("template_desc", "Community Template")
          : t("asset_desc", "Community Asset");

  return (
    <SidePanel
      isOpen={true}
      onClose={onClose}
      title={panelTitle}
      subtitle={panelSubtitle}
      icon={panelIcon}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[680px]"
      backdropZ="z-[70000]"
      panelZ="z-[70001]"
      coverImage={data?.image_url || data?.thumbnail_url}
      headerActions={
        data
          ? (() => {
              const assetStagingId = `asset_${assetType}_${data.id || assetId}`;
              const isAssetStaged = stagingDraftItems.some(
                (item: any) => String(item.id || "").toLowerCase() === assetStagingId.toLowerCase()
              );
              return (
                <PanelHeaderGroup>
                  {session?.user &&
                    session?.user?.user_metadata?.username !== data.author &&
                    onFlag && (
                      <PanelHeaderButton
                        icon={t("icon_flag", "flag")}
                        tooltip={t("feed_btn_flag", "Report")}
                        onClick={() => onFlag(assetId, assetType)}
                        variant="danger"
                      />
                    )}
                  {!isDesktop() && (
                    <PanelHeaderButton
                      icon={
                        isAssetStaged
                          ? t("icon_playlist_add_check", "playlist_add_check")
                          : t("icon_playlist_add", "playlist_add")
                      }
                      tooltip={
                        assetType === "blueprint"
                          ? t("staging_btn_stage_blueprint", "Stage {Blueprint} to PC")
                          : isAssetStaged
                            ? t("staging_btn_unstage_mod", "Remove from Staging")
                            : t("staging_btn_stage_mod", "Stage to PC")
                      }
                      onClick={(e?: React.MouseEvent) => {
                        e?.stopPropagation();
                        if (assetType === "blueprint") {
                          stageBlueprintToDraft(data);
                          useStore
                            .getState()
                            .pushStatus(
                              t(
                                "status_staging_blueprint_loaded",
                                "Blueprint loaded into Payload Editor."
                              )
                            );
                          onClose();
                          useStore.getState().setView("playsets");
                        } else {
                          toggleModInStagingDraft({
                            ...data,
                            asset_type: assetType,
                            asset_id: data.id || assetId,
                          });
                          useStore
                            .getState()
                            .pushStatus(
                              isAssetStaged
                                ? t("status_staging_item_removed", "Removed from Remote Staging Queue.")
                                : t("status_staging_item_added", "Added to Remote Staging Queue.")
                            );
                        }
                      }}
                      variant={isAssetStaged ? "accent" : "default"}
                    />
                  )}
                  <PanelHeaderButton
                    icon={
                      assetType === "mod"
                        ? data.url
                          ? t("icon_download", "download")
                          : t("icon_search", "search")
                        : assetType === "blueprint"
                          ? t("icon_download", "download")
                          : isInstalled(data)
                            ? isOutdated(data)
                              ? t("icon_update", "update")
                              : t("icon_check_circle", "check_circle")
                            : t("icon_download", "download")
                    }
                    tooltip={
                      assetType === "mod"
                        ? data.url
                          ? t("btn_download", "Download")
                          : t("btn_search_web", "Search Web")
                        : assetType === "blueprint"
                          ? t("update_panel_install", "Install")
                          : isInstalled(data)
                            ? isOutdated(data)
                              ? t("btn_update", "Update")
                              : t("btn_reinstall", "Reinstall")
                            : t("update_panel_install", "Install")
                    }
                    onClick={async (e?: React.MouseEvent) => {
                      e?.stopPropagation();
                      if (assetType === "mod") {
                        const targetUrl = getModFallbackUrl(
                          data.displayName || data.name || "",
                          data.hash || "",
                          useStore.getState().activeGameSchema,
                          { url: data.url }
                        );
                        handleOpenUrl(targetUrl);
                        return;
                      }
                      if (assetType === "blueprint") {
                        navigator.clipboard.writeText(data.json_data?.code || "").catch(() => {});
                        useStore
                          .getState()
                          .pushStatus("Copied Uplink Code: " + (data.json_data?.code || ""));
                      } else if (
                        assetType === "lexicon" ||
                        assetType === "chameleon" ||
                        assetType === "workbench_template"
                      ) {
                        if (assetType === "lexicon") {
                          const parsedData =
                            typeof data.json_data === "string"
                              ? JSON.parse(data.json_data)
                              : data.json_data;
                          importLexicon(
                            {
                              ...parsedData,
                              _meta_language: data.language || "Custom",
                              _meta_version: data.version || "1.0.0",
                            },
                            data.name
                          );
                          useStore
                            .getState()
                            .pushStatus(`Successfully Installed Lexicon: ${data.name}`);
                        } else if (assetType === "chameleon") {
                          const parsedTheme =
                            typeof data.json_data === "string"
                              ? JSON.parse(data.json_data)
                              : data.json_data || {};
                          importTheme({
                            ...parsedTheme,
                            name: data.name || parsedTheme.name || "Chameleon",
                            version: data.version || parsedTheme.version || "1.0.0",
                            author: data.author || parsedTheme.author || "Citizen",
                            _meta_version: data.version || parsedTheme._meta_version || "1.0.0",
                          });
                          useStore
                            .getState()
                            .pushStatus(`Successfully Installed Chameleon: ${data.name}`);
                        } else if (assetType === "workbench_template") {
                          try {
                            if (!vaultPath) throw new Error("Vault path not configured.");

                            const parsed =
                              typeof data.json_data === "string"
                                ? JSON.parse(data.json_data)
                                : data.json_data;
                            const displayData = Array.isArray(parsed) ? parsed[0] : parsed;
                            const templateId = displayData?.template_id || "vlocal";

                            const templatesDir = `${vaultPath}\\Templates`;
                            if (!(await exists(templatesDir))) {
                              await mkdir(templatesDir, { recursive: true });
                            }

                            await writeTextFile(
                              `${templatesDir}\\${templateId}_template.json`,
                              JSON.stringify(parsed, null, 2)
                            );
                            useStore
                              .getState()
                              .pushStatus(`Successfully Installed Template: ${data.name}`);
                          } catch (err: any) {
                            useStore
                              .getState()
                              .pushStatus(`Failed to install template: ${err.message}`);
                          }
                        }

                        try {
                          await supabase.rpc("increment_asset_downloads", { asset_id: assetId });
                        } catch (e) {
                          console.error("Could not increment downloads", e);
                        }
                      }
                    }}
                    variant={
                      assetType === "blueprint"
                        ? isInstalled(data)
                          ? "primary"
                          : "success"
                        : isInstalled(data)
                          ? isOutdated(data)
                            ? "primary"
                            : "glass"
                          : "success"
                    }
                  />
                </PanelHeaderGroup>
              );
            })()
          : undefined
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8 break-words">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <span className="text-xs font-black capitalize tracking-widest text-[var(--subtext)] animate-pulse">
              {t("loading", "Loading...")}
            </span>
          </div>
        ) : error ? (
          <SidePanelHeroCard
            icon={t("icon_error", "error")}
            overline={panelTitle}
            title={t("status_error", "Error")}
            description={error}
            variant="danger"
          />
        ) : data ? (
          <>
            <SidePanelHeroCard
              icon={panelIcon}
              overline={assetType === "workbench_template" ? "template" : assetType}
              title={(data.displayName || (data.name || "").split("/").pop() || "")
                .replace(/_/g, " ")
                .replace(/\.[^/.]+$/, "")}
              description={panelSubtitle}
              badge={`v${getAssetDisplayVersion(data) || "1.0.0"}`}
              badgeIcon={t("icon_new_releases", "new_releases")}
              variant="accent"
            >
              <div className="flex flex-col gap-3 mt-1">
                {(data.is_early_access || data.is_paid) && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {data.is_early_access && (
                      <span className={VAULT_CHIP_CLASS}>
                        <span className="material-symbols-outlined !text-[12px] text-purple-400">
                          {t("icon_science", "science")}
                        </span>
                        {t("badge_early_access", "Early Access")}
                      </span>
                    )}
                    {data.is_paid && (
                      <span className={VAULT_CHIP_CLASS}>
                        <span className="material-symbols-outlined !text-[12px] text-amber-400">
                          {t("icon_monetization_on", "monetization_on")}
                        </span>
                        {t("badge_paid", "Paid")}
                      </span>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <StatBox
                    label={t("author", "Author")}
                    value={data.author || data.master_author || "Citizen"}
                    icon={t("icon_person", "person")}
                    iconColorClass="text-[var(--accent)]"
                  />
                  <StatBox
                    label={t("label_version", "Version")}
                    value={getAssetDisplayVersion(data) || "1.0.0"}
                    icon={t("icon_new_releases", "new_releases")}
                    iconColorClass="text-[var(--accent)]"
                  />
                  <StatBox
                    label={t("sort_downloads", "Downloads")}
                    value={data.downloads?.toLocaleString() || "0"}
                    icon={t("icon_download", "download")}
                    iconColorClass="text-[var(--accent)]"
                  />
                  <StatBox
                    label={t("created_date", "Published")}
                    value={
                      data.created_at
                        ? new Date(data.created_at).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "—"
                    }
                    icon={t("icon_calendar_today", "calendar_today")}
                    iconColorClass="text-[var(--accent)]"
                  />
                </div>
              </div>
            </SidePanelHeroCard>

            {assetType === "chameleon" && data.json_data && (
              <div className="rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_12%,transparent)] shadow-xl">
                <DynamicThemePreviewBanner
                  data={{
                    ...data,
                    ...(typeof data.json_data === "string"
                      ? JSON.parse(data.json_data)
                      : data.json_data),
                    name: data.name,
                    previewImage: data.image_url || data.json_data?.previewImage,
                  }}
                  heightClass="h-44"
                />
              </div>
            )}

            {assetType === "lexicon" && (
              <div className="rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_12%,transparent)] shadow-xl">
                <DynamicLexiconPreviewBanner data={data} heightClass="h-40" />
              </div>
            )}

            {assetType === "blueprint" && (
              <div className="rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_12%,transparent)] shadow-xl">
                <DynamicBlueprintPreviewBanner data={data} heightClass="h-40" />
              </div>
            )}

            {assetType === "workbench_template" && (
              <div className="rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_12%,transparent)] shadow-xl">
                <DynamicTemplatePreviewBanner data={data} heightClass="h-40" />
              </div>
            )}

            <UniversalGroup
              title={t("upload_desc", "Description")}
              icon={t("icon_description", "description")}
            >
              <div className="text-sm text-[var(--text)] leading-relaxed font-medium px-1 py-0.5">
                {data.description
                  ? stripMarkdown(data.description)
                  : t("no_desc_sub", "No specific local description provided for this sub-{mod}.")}
              </div>
            </UniversalGroup>

            {assetType === "workbench_template" &&
              data.json_data &&
              (() => {
                const parsedRaw =
                  typeof data.json_data === "string"
                    ? JSON.parse(data.json_data)
                    : data.json_data;
                const parsed = Array.isArray(parsedRaw) ? parsedRaw[0] : parsedRaw;
                return (
                  <UniversalGroup
                    title={t("auto_template_architecture", "Template Architecture")}
                    icon={t("icon_architecture", "architecture")}
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {parsed.template_id && (
                        <StatBox
                          label={t("auto_template_id", "Template ID")}
                          value={parsed.template_id}
                          icon={t("icon_tag", "tag")}
                          iconColorClass="text-[var(--accent)]"
                        />
                      )}
                      {parsed.target_file && (
                        <StatBox
                          label={t("upload_target_file", "Target File")}
                          value={parsed.target_file}
                          icon={t("icon_description", "description")}
                          iconColorClass="text-[var(--accent)]"
                        />
                      )}
                      {parsed.schema_version && (
                        <StatBox
                          label={t("auto_schema", "Schema")}
                          value={`${t("auto_v", "v")}${parsed.schema_version}`}
                          icon={t("icon_schema", "schema")}
                          iconColorClass="text-[var(--accent)]"
                        />
                      )}
                      {parsed.template_version && (
                        <StatBox
                          label={t("label_version", "Version")}
                          value={parsed.template_version}
                          icon={t("icon_new_releases", "new_releases")}
                          iconColorClass="text-[var(--accent)]"
                        />
                      )}
                      {parsed.mod_author && (
                        <StatBox
                          label={t("auto_mod_author", "{Mod} Author")}
                          value={parsed.mod_author}
                          icon={t("icon_person", "person")}
                          iconColorClass="text-[var(--accent)]"
                        />
                      )}
                      {parsed.parser_type && (
                        <StatBox
                          label={t("auto_parser", "Parser")}
                          value={parsed.parser_type}
                          icon={t("icon_code", "code")}
                          iconColorClass="text-[var(--accent)]"
                        />
                      )}
                      {parsed.supported_mod_versions &&
                        Array.isArray(parsed.supported_mod_versions) &&
                        parsed.supported_mod_versions.length > 0 && (
                          <StatBox
                            label={t("auto_supported_versions", "Supported Versions")}
                            value={parsed.supported_mod_versions.join(", ")}
                            icon={t("icon_verified", "verified")}
                            iconColorClass="text-[var(--success)]"
                            className="sm:col-span-2"
                          />
                        )}
                    </div>
                  </UniversalGroup>
                );
              })()}

            {(data.changelog ||
              data.release_notes ||
              (data.json_data && (data.json_data.changelog || data.json_data.release_notes))) && (
              <UniversalGroup
                title={t("whats_new", "What's New")}
                icon={t("icon_new_releases", "new_releases")}
              >
                <div className="text-sm text-[var(--text)] leading-relaxed font-medium px-1 py-0.5">
                  {stripMarkdown(
                    data.changelog ||
                      data.release_notes ||
                      data.json_data?.changelog ||
                      data.json_data?.release_notes
                  )}
                </div>
              </UniversalGroup>
            )}
          </>
        ) : null}
      </div>
    </SidePanel>
  );
}
