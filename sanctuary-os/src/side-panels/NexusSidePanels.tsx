import { useState, useMemo, useEffect } from "react";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import {
  CustomDropdown,
  SidePanel,
  SidePanelHeroCard,
  SidePanelTitleInput,
  UniversalGroup,
  StatBox,
  DashboardStatTile,
  ActionButton,
  PanelHeaderGroup,
  PanelHeaderButton,
  HoverTooltip,
  getNormalizedArtifactName,
  ActionPill,
  VAULT_CHIP_CLASS,
} from "../shared";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { isDesktop } from "../utils/envUtils";
import { DynamicThemePreviewBanner } from "../chameleon-components/ThemeCard";
import { importThemeWithAssets, getLuminance } from "../chameleon-components/ChameleonShared";

export function MarketUploadPanel({
  uploadState,
  setUploadState,
  marketTab,
  availableLanguages,
  submitUpload,
  backdropZ = "z-[15000]",
  panelZ = "z-[15001]",
}: any) {
  const { t } = useLexicon();
  if (!uploadState.isOpen) return null;
  return (
    <>
      <SidePanel
        isOpen={true}
        onClose={() => setUploadState((s: any) => ({ ...s, isOpen: false }))}
        widthClass="w-[90vw] md:w-[680px]"
        backdropZ={backdropZ}
        panelZ={panelZ}
        icon={t("icon_cloud_upload", "cloud_upload")}
        iconColorClass="text-[var(--accent)]"
        title={
          marketTab === "LEXICONS"
            ? t("upload_lexicon_title", "Upload {Lexicon}")
            : marketTab === "TEMPLATES"
              ? t("upload_template_title", "Upload Template")
              : t("upload_chameleon_title", "Upload {Chameleon}")
        }
        subtitle={t("auto_upload_new_asset", "Upload your custom creation")}
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={
                uploadState.editId
                  ? t("icon_save", "save")
                  : t("icon_cloud_upload", "cloud_upload")
              }
              tooltip={
                uploadState.editId
                  ? t("upload_btn_update", "Update")
                  : t("upload_submit", "Submit")
              }
              onClick={submitUpload}
              disabled={
                !uploadState.name ||
                (uploadState.language === "add_new" && !uploadState.newLanguage)
              }
              variant="accent"
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_cloud_upload", "cloud_upload")}
            overline={marketTab}
            title={
              marketTab === "LEXICONS"
                ? t("upload_lexicon_title", "Upload {Lexicon}")
                : marketTab === "TEMPLATES"
                  ? t("upload_template_title", "Upload Template")
                  : t("upload_chameleon_title", "Upload {Chameleon}")
            }
            description={t("auto_upload_new_asset", "Upload your custom creation")}
            badge={`v${uploadState.version || "1.0.0"}`}
            badgeIcon={t("icon_new_releases", "new_releases")}
            variant="accent"
          />

          <SidePanelTitleInput
            value={uploadState.name}
            onChange={(val) => setUploadState((s: any) => ({ ...s, name: val }))}
            label={
              marketTab === "LEXICONS"
                ? t("upload_lexicon_name", "{Lexicon} Name")
                : marketTab === "TEMPLATES"
                  ? t("upload_template_name", "Template Name")
                  : t("upload_chameleon_name", "{Chameleon} Name")
            }
            placeholder={
              marketTab === "LEXICONS"
                ? t("upload_lexicon_name", "{Lexicon} Name")
                : marketTab === "TEMPLATES"
                  ? t("upload_template_name", "Template Name")
                  : t("upload_chameleon_name", "{Chameleon} Name")
            }
          />

          <UniversalGroup
            title={t("upload_desc", "Asset Configuration")}
            icon={t("icon_edit_note", "edit_note")}
          >
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                {t("upload_file", "File")}
              </label>
              <div className="flex items-center gap-3">
                <div
                  className={`flex-1 glass-surface rounded-xl px-4 py-3 text-sm font-bold truncate transition-all ${
                    uploadState.fileName
                      ? "border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)]"
                      : "text-[var(--subtext)] opacity-60 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] border-dashed"
                  }`}
                >
                  {uploadState.fileName ||
                    t("no_file_selected", "No file selected")}
                </div>
                <ActionButton
                  variant="glass"
                  icon={t("icon_upload_file", "upload_file")}
                  label={
                    uploadState.fileName
                      ? t("ui_btn_replace", "Replace")
                      : t("btn_import", "Import")
                  }
                  onClick={async () => {
                    try {
                      if (marketTab === "CHAMELEONS" || marketTab === "chameleons") {
                        const res = await importThemeWithAssets({
                          t,
                          pushStatus: useStore.getState().pushStatus,
                        });
                        if (!res) return;
                        if (res.imageOnlyDataUrl) {
                          setUploadState((s: any) => ({
                            ...s,
                            fileContent: {
                              ...(s.fileContent || {}),
                              bgImage: res.imageOnlyDataUrl,
                            },
                          }));
                          return;
                        }
                        if (res.theme) {
                          const imported = res.theme;
                          const newVersion =
                            imported.version || imported._meta_version || uploadState.version || "1.0.0";
                          const mode =
                            getLuminance(imported.bg || "#050914") < 0.5 ? "Dark" : "Light";
                          setUploadState((s: any) => ({
                            ...s,
                            fileContent: imported,
                            fileName: `${imported.name || s.name || "Theme"}.json`,
                            name: s.name || imported.name || "Custom Theme",
                            version: String(newVersion),
                            themeMode: mode,
                          }));
                        }
                        return;
                      }

                      const filters = [{ name: "JSON", extensions: ["json"] }];
                      const vaultPath = useStore.getState().vaultPath;
                      const defaultPath = vaultPath
                        ? `${vaultPath}/Data`
                        : undefined;
                      const selected = await open({ filters, defaultPath });
                      if (!selected) return;
                      const content = await readTextFile(selected as string);
                      let parsed;
                      try {
                        parsed = JSON.parse(content);
                      } catch {
                        parsed = content;
                      }
                      let newVersion = "1.0.0";
                      if (parsed.version) newVersion = parsed.version;
                      else if (parsed._meta_version)
                        newVersion = parsed._meta_version;
                      setUploadState((s: any) => ({
                        ...s,
                        fileContent: parsed,
                        fileName: selected as string,
                        name: s.name || parsed.name || parsed._meta_name || "Unknown",
                        version: newVersion,
                      }));
                    } catch (err: any) {
                      useStore
                        .getState()
                        .pushStatus(
                          `${t("alert_import_failed", "Import failed:")} ${err.message || err}`
                        );
                    }
                  }}
                />
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex flex-col gap-1.5 flex-1">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                  {marketTab === "LEXICONS"
                    ? t("upload_lexicon_name", "{Lexicon} Name")
                    : marketTab === "TEMPLATES"
                      ? t("upload_template_name", "Template Name")
                      : t("upload_chameleon_name", "{Chameleon} Name")}
                </label>
                <input
                  type="text"
                  value={uploadState.name}
                  onChange={(e) =>
                    setUploadState((s: any) => ({ ...s, name: e.target.value }))
                  }
                  className="w-full glass-surface rounded-xl px-4 py-3 text-sm font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)] transition-all text-[var(--text)]"
                />
              </div>
              <div className="flex flex-col gap-1.5 w-32 shrink-0">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                  {t("label_version", "Version")}
                </label>
                <input
                  type="text"
                  value={uploadState.version}
                  onChange={(e) =>
                    setUploadState((s: any) => ({
                      ...s,
                      version: e.target.value,
                    }))
                  }
                  className="w-full glass-surface rounded-xl px-4 py-3 text-sm font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)] transition-all text-[var(--text)] text-center"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                {t("upload_desc", "Description")}
              </label>
              <textarea
                value={uploadState.description}
                onChange={(e) =>
                  setUploadState((s: any) => ({
                    ...s,
                    description: e.target.value,
                  }))
                }
                className="w-full glass-surface rounded-xl px-4 py-3 text-sm font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)] transition-all min-h-[100px] text-[var(--text)]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                {t("whats_new", "What's New")}
              </label>
              <textarea
                value={uploadState.releaseNotes || ""}
                onChange={(e) =>
                  setUploadState((s: any) => ({
                    ...s,
                    releaseNotes: e.target.value,
                  }))
                }
                placeholder={t("update_panel_no_notes", "Release notes...")}
                className="w-full glass-surface rounded-xl px-4 py-3 text-sm font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)] transition-all min-h-[80px] text-[var(--text)]"
              />
            </div>

            {marketTab === "LEXICONS" && (
              <>
                <div className="flex flex-col gap-1.5 relative z-[60]">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                    {t("tab_lexicons", "Language")}
                  </label>
                  <CustomDropdown
                    disableTint={true}
                    value={uploadState.language}
                    onChange={(val: string[]) =>
                      setUploadState((s: any) => ({ ...s, language: val[0] }))
                    }
                    options={[
                      ...(uploadState.language &&
                      uploadState.language !== "add_new" &&
                      !availableLanguages.includes(uploadState.language)
                        ? [
                            {
                              id: uploadState.language,
                              label: uploadState.language.toUpperCase(),
                            },
                          ]
                        : []),
                      ...availableLanguages.map((l: any) => ({
                        id: l,
                        label: l,
                      })),
                      {
                        id: "add_new",
                        label: t("upload_add_language", "Add New {Lexicon}..."),
                      },
                    ]}
                  />
                </div>
                {uploadState.language === "add_new" && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                      {t("upload_new_language", "New {Lexicon} Name")}
                    </label>
                    <input
                      type="text"
                      value={uploadState.newLanguage}
                      onChange={(e) =>
                        setUploadState((s: any) => ({
                          ...s,
                          newLanguage: e.target.value,
                        }))
                      }
                      className="w-full glass-surface rounded-xl px-4 py-3 text-sm font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)] transition-all text-[var(--text)]"
                      placeholder={t("ph_language", "Language name...")}
                    />
                  </div>
                )}
                <div className="flex flex-col gap-1.5 relative z-[50]">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                    {t("filter_type", "Type")}
                  </label>
                  <CustomDropdown
                    disableTint={true}
                    value={uploadState.lexiconType}
                    onChange={(val: string[]) =>
                      setUploadState((s: any) => ({
                        ...s,
                        lexiconType: val[0],
                      }))
                    }
                    options={[
                      { id: "Theme", label: t("chameleon", "Theme") },
                      { id: "Default", label: t("type_default", "Default") },
                    ]}
                  />
                </div>
              </>
            )}

            {marketTab === "CHAMELEONS" && (
              <>
                <div className="flex flex-col gap-1.5 relative z-[60]">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                    {t("filter_mode", "Mode")}
                  </label>
                  <CustomDropdown
                    disableTint={true}
                    value={uploadState.themeMode}
                    onChange={(val: string[]) =>
                      setUploadState((s: any) => ({ ...s, themeMode: val[0] }))
                    }
                    options={[
                      { id: "Dark", label: t("mode_dark", "Dark") },
                      { id: "Light", label: t("mode_light", "Light") },
                    ]}
                  />
                </div>

                <div className="flex flex-col gap-2.5 pt-2">
                  <div className="flex items-center justify-between px-1">
                    <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest">
                      {t("chameleon_dynamic_preview_badge", "Nexus Card Preview")}
                    </label>
                    <div className="flex items-center gap-2">
                      {uploadState.fileContent?.previewImage && (
                        <button
                          type="button"
                          onClick={() =>
                            setUploadState((s: any) => ({
                              ...s,
                              fileContent: {
                                ...(s.fileContent || {}),
                                previewImage: undefined,
                              },
                            }))
                          }
                          className="text-[9px] font-black uppercase tracking-widest text-[var(--danger)] hover:underline"
                        >
                          {t("forge_bg_remove", "Use Dynamic Preview")}
                        </button>
                      )}
                      <label className="cursor-pointer px-2.5 py-1 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[9px] font-black uppercase tracking-widest text-[var(--accent)] hover:border-[var(--accent)] transition-all">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              setUploadState((s: any) => ({
                                ...s,
                                fileContent: {
                                  ...(s.fileContent || {}),
                                  previewImage: ev.target?.result as string,
                                },
                              }));
                            };
                            reader.readAsDataURL(file);
                          }}
                        />
                        {t("forge_preview_banner_title", "Upload Custom Image")}
                      </label>
                    </div>
                  </div>

                  <div className="rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                    <DynamicThemePreviewBanner
                      data={{
                        ...(typeof uploadState.fileContent === "object" &&
                        uploadState.fileContent
                          ? uploadState.fileContent
                          : {}),
                        name:
                          uploadState.name ||
                          uploadState.fileContent?.name ||
                          "Chameleon",
                      }}
                      heightClass="h-36"
                    />
                  </div>
                  <p className="text-[10px] text-[var(--subtext)] opacity-75 px-1 m-0">
                    {t(
                      "forge_preview_banner_desc",
                      "If no custom image is uploaded, Sanctuary uses this Dynamic OS Preview Card automatically on The Nexus."
                    )}
                  </p>
                </div>
              </>
            )}
          </UniversalGroup>
        </div>
      </SidePanel>
    </>
  );
}

export function MarketReportPanel({
  reportState,
  setReportState,
  handleReportSubmit,
}: any) {
  const { t } = useLexicon();
  if (!reportState.isOpen) return null;
  return (
    <>
      <SidePanel
        isOpen={true}
        onClose={() =>
          setReportState({
            isOpen: false,
            assetId: null,
            assetType: null,
            reason: "",
          })
        }
        widthClass="w-[90vw] md:w-[680px]"
        backdropZ="z-[65000]"
        panelZ="z-[65001]"
        icon={t("icon_flag", "flag")}
        iconColorClass="text-[var(--danger)]"
        title={t("report_title", "Report Content")}
        subtitle={t("report_desc", "Please provide detailed information about why this asset should be removed from the {Nexus}. False reports may result in account termination.")}
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_flag", "flag")}
              tooltip={t("report_submit", "Submit Report")}
              onClick={() =>
                handleReportSubmit({ preventDefault: () => {} } as any)
              }
              variant="danger"
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_flag", "flag")}
            overline={t("action_required", "Action Required")}
            title={t("report_content", "Report Content")}
            description={t("report_desc", "Please provide detailed information about why this asset should be removed from the {Nexus}. False reports may result in account termination.")}
            badge={reportState.assetType || t("unknown", "Unknown")}
            badgeIcon={t("icon_warning", "warning")}
            variant="danger"
          >
            <div className="grid grid-cols-2 gap-3 pt-1">
              <StatBox
                label={t("target_asset", "Target Asset")}
                value={reportState.assetId || t("unknown", "Unknown")}
                icon={t("icon_target", "target")}
                iconColorClass="text-[var(--accent)]"
              />
              <StatBox
                label={t("asset_type", "Asset Type")}
                value={reportState.assetType || t("unknown", "Unknown")}
                icon={t("icon_category", "category")}
                iconColorClass="text-[var(--accent)]"
              />
            </div>
          </SidePanelHeroCard>

          <UniversalGroup
            title={t("reason", "Reason")}
            icon={t("icon_description", "description")}
          >
            <textarea
              required
              value={reportState.reason}
              placeholder={t("report_placeholder", "Describe the issue...")}
              onChange={(e) =>
                setReportState({ ...reportState, reason: e.target.value })
              }
              className="w-full h-44 glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] resize-none focus:outline-none focus:border-[var(--accent)] transition-all"
            />
          </UniversalGroup>
        </div>
      </SidePanel>
    </>
  );
}

export function MarketBlueprintPanel({
  selectedBlueprint,
  setSelectedBlueprint,
  onOpenDossier,
  cleanModName,
  syncBlueprintByCode,
  onDownloadSuccess,
}: any) {
  const { t } = useLexicon();

  const [enrichedBlueprint, setEnrichedBlueprint] = useState(selectedBlueprint);
  const [visibleCount, setVisibleCount] = useState(100);
  const [filterTab, setFilterTab] = useState<"ALL" | "MISSING">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const modList = useStore((state) => state.modList);
  const playSets = useStore((state) => state.playSets) || [];

  const localVaultHashes = useMemo(() => {
    const hashes = new Set<string>();
    modList.forEach((m: any) => {
      if (m.hash) hashes.add(m.hash);
    });
    return hashes;
  }, [modList]);

  const displayArtifacts = useMemo(() => {
    const artifacts = enrichedBlueprint?.json_data?.artifacts || [];
    let filtered = artifacts;

    const seenNames = new Set<string>();
    filtered = filtered.filter((a: any) => {
      const norm = getNormalizedArtifactName(a.name || a.id);
      if (seenNames.has(norm)) return false;
      seenNames.add(norm);
      return true;
    });

    if (filterTab === "MISSING") {
      filtered = filtered.filter((m: any) => !localVaultHashes.has(m.hash));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (m: any) =>
          (m.name || "").toLowerCase().includes(q) ||
          (m.author || "").toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [enrichedBlueprint, filterTab, localVaultHashes, searchQuery]);

  const visibleArtifacts = useMemo(
    () => displayArtifacts.slice(0, visibleCount),
    [displayArtifacts, visibleCount]
  );
  const premiumMods = useMemo(
    () => visibleArtifacts.filter((m: any) => m.is_paid || m.is_early_access),
    [visibleArtifacts]
  );
  const standardMods = useMemo(
    () => visibleArtifacts.filter((m: any) => !m.is_paid && !m.is_early_access),
    [visibleArtifacts]
  );

  useEffect(() => {
    if (!selectedBlueprint) {
      setEnrichedBlueprint(null);
      return;
    }

    const processBlueprint = (bp: any) => {
      let parsedJson = bp.json_data;
      if (typeof parsedJson === "string") {
        try {
          parsedJson = JSON.parse(parsedJson);
        } catch (e) {
          parsedJson = {};
        }
      }
      parsedJson = parsedJson || {};

      parsedJson.artifacts = parsedJson.artifacts || bp.artifacts || [];

      setEnrichedBlueprint({
        ...selectedBlueprint,
        ...bp,
        master_author: selectedBlueprint.master_author || bp.master_author,
        author: selectedBlueprint.author || bp.author,
        json_data: parsedJson,
      });
      setVisibleCount(100);

      const fetchPremiumStatus = async () => {
        const artifacts = parsedJson.artifacts || [];
        const hashes = artifacts.map((a: any) => a.hash).filter(Boolean);
        if (hashes.length === 0) {
          let finalArtifacts = artifacts;
          finalArtifacts = [...finalArtifacts].sort((a: any, b: any) => {
            const aPremium = a.is_paid || a.is_early_access ? 1 : 0;
            const bPremium = b.is_paid || b.is_early_access ? 1 : 0;
            if (aPremium !== bPremium) return bPremium - aPremium;
            return (a.name || "").localeCompare(b.name || "");
          });
          setEnrichedBlueprint((prev: any) =>
            prev
              ? {
                  ...prev,
                  is_paid: bp.is_paid || finalArtifacts.some((a: any) => a.is_paid),
                  is_early_access:
                    bp.is_early_access ||
                    finalArtifacts.some((a: any) => a.is_early_access),
                  json_data: { ...parsedJson, artifacts: finalArtifacts },
                }
              : null
          );
          return;
        }

        const premiumMap: Record<string, any> = {};
        const chunkSize = 40;
        const promises = [];

        for (let i = 0; i < hashes.length; i += chunkSize) {
          const chunk = hashes.slice(i, i + chunkSize);
          promises.push(
            supabase
              .from("mod_versions")
              .select("dna_hash, mods(is_paid, is_early_access)")
              .in("dna_hash", chunk)
          );
        }

        const results = await Promise.all(promises);
        results.forEach(({ data, error }) => {
          if (!error && data) {
            data.forEach((d: any) => {
              if (d.mods && (d.mods.is_paid || d.mods.is_early_access)) {
                premiumMap[d.dna_hash] = {
                  hash: d.dna_hash,
                  is_paid: d.mods.is_paid,
                  is_early_access: d.mods.is_early_access,
                };
              }
            });
          }
        });

        let finalArtifacts = artifacts;

        if (Object.keys(premiumMap).length > 0) {
          finalArtifacts = artifacts.map((a: any) => {
            if (a.hash && premiumMap[a.hash]) {
              const p = premiumMap[a.hash];
              if (!a.is_paid && p.is_paid) {
                a.is_paid = true;
              }
              if (!a.is_early_access && p.is_early_access) {
                a.is_early_access = true;
              }
            }
            return a;
          });
        }

        finalArtifacts = [...finalArtifacts].sort((a: any, b: any) => {
          const aPremium = a.is_paid || a.is_early_access ? 1 : 0;
          const bPremium = b.is_paid || b.is_early_access ? 1 : 0;
          if (aPremium !== bPremium) return bPremium - aPremium;
          return (a.name || "").localeCompare(b.name || "");
        });

        setEnrichedBlueprint((prev: any) =>
          prev
            ? {
                ...prev,
                is_paid: bp.is_paid || finalArtifacts.some((a: any) => a.is_paid),
                is_early_access:
                  bp.is_early_access ||
                  finalArtifacts.some((a: any) => a.is_early_access),
                json_data: { ...parsedJson, artifacts: finalArtifacts },
              }
            : null
        );
      };

      fetchPremiumStatus();
    };

    if (selectedBlueprint.json_data === undefined) {
      supabase
        .from("blueprints")
        .select("*")
        .eq("id", selectedBlueprint.id)
        .single()
        .then(({ data }) => {
          if (data) {
            processBlueprint(data);
          } else {
            processBlueprint(selectedBlueprint);
          }
        });
    } else {
      processBlueprint(selectedBlueprint);
    }
  }, [selectedBlueprint]);

  if (!enrichedBlueprint) return null;

  const renderMod = (mod: any, i: number) => {
    const cleaned = cleanModName(mod.name || mod.id);
    return (
      <div
        key={`${mod.hash || mod.name}_${i}`}
        onClick={() => onOpenDossier?.({ ...mod, isNexusView: true })}
        className="group relative flex flex-col justify-between p-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] transition-all duration-300 cursor-pointer overflow-hidden min-h-[104px]"
      >
        <HoverTooltip title={mod.name} />
        <div className="flex justify-between items-start gap-2 relative z-10">
          <div
            className="w-9 h-9 rounded-xl glass-surface border flex items-center justify-center shrink-0 text-[var(--accent)]"
            style={{
              borderColor: "color-mix(in srgb, var(--accent) 25%, var(--border))",
            }}
          >
            <span className="material-symbols-rounded !text-[16px]">
              {cleaned.ext === "PACKAGE"
                ? t("icon_inventory_2", "inventory_2")
                : cleaned.ext === "TS4SCRIPT"
                  ? t("icon_code", "code")
                  : t("icon_insert_drive_file", "insert_drive_file")}
            </span>
          </div>
          <div className="flex gap-1.5 flex-wrap justify-end">
            {mod.is_early_access && (
              <span
                className={VAULT_CHIP_CLASS}
                style={{
                  color: "var(--accent)",
                  borderColor: "color-mix(in srgb, var(--accent) 35%, var(--border))",
                }}
              >
                <span className="material-symbols-rounded !text-[12px] shrink-0">
                  {t("icon_science", "science")}
                </span>
                <span>{t("badge_early_access", "Early Access")}</span>
                <HoverTooltip title={t("badge_early_access", "Early Access")} />
              </span>
            )}
            {mod.is_paid && (
              <span
                className={VAULT_CHIP_CLASS}
                style={{
                  color: "var(--warning)",
                  borderColor: "color-mix(in srgb, var(--warning) 35%, var(--border))",
                }}
              >
                <span className="material-symbols-rounded !text-[12px] shrink-0">
                  {t("icon_monetization_on", "monetization_on")}
                </span>
                <span>{t("badge_paid", "Paid")}</span>
                <HoverTooltip title={t("badge_paid", "Paid")} variant="warning" />
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col justify-end relative z-10 mt-2">
          <span className="text-[11px] font-black text-[var(--text)] truncate group-hover:text-[var(--accent)] transition-colors leading-tight mb-1">
            {cleaned.name}
          </span>
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold text-[var(--subtext)] opacity-70 tracking-wider">
              {cleaned.ext}
            </span>
            {mod.author && (
              <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 truncate max-w-[90px] text-right">
                {mod.author}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <SidePanel
        isOpen={true}
        onClose={() => setSelectedBlueprint(null)}
        widthClass="w-[90vw] md:w-[760px]"
        backdropZ="z-[15000]"
        panelZ="z-[15001]"
        icon={t("icon_map", "map")}
        iconColorClass="text-[var(--accent)]"
        title={t("blueprint_inspector", "Blueprint Inspector")}
        subtitle={t("blueprint_desc", "{Mod} metadata and Asset repository")}
        headerActions={
          <PanelHeaderGroup>
            {!isDesktop() && (
              <PanelHeaderButton
                icon={t("icon_phonelink", "phonelink")}
                tooltip={t("staging_btn_stage_blueprint", "Stage {Blueprint} to PC")}
                onClick={() => {
                  useModalStore
                    .getState()
                    .stageBlueprintToDraft(enrichedBlueprint);
                  useStore
                    .getState()
                    .pushStatus(
                      t(
                        "status_staging_blueprint_loaded",
                        "Blueprint loaded into Payload Editor."
                      )
                    );
                  setSelectedBlueprint(null);
                  useStore.getState().setView("playsets");
                }}
                variant="default"
              />
            )}
            {isDesktop() && (
              <PanelHeaderButton
                icon={
                  isSyncing
                    ? t("icon_sync", "sync")
                    : t("icon_download", "download")
                }
                tooltip={
                  playSets.some(
                    (p: any) =>
                      p.code &&
                      selectedBlueprint?.json_data?.code &&
                      p.code === selectedBlueprint.json_data.code
                  )
                    ? t("btn_install_copy", "Install Copy")
                    : t("update_panel_install", "Install")
                }
                onClick={async () => {
                  if (
                    playSets.some(
                      (p: any) =>
                        p.code &&
                        selectedBlueprint?.json_data?.code &&
                        p.code === selectedBlueprint.json_data.code
                    )
                  ) {
                    setIsSyncing(true);
                    await syncBlueprintByCode(selectedBlueprint.json_data.code);
                    setIsSyncing(false);
                  } else {
                    onDownloadSuccess?.();
                  }
                  setSelectedBlueprint(null);
                }}
                variant="accent"
                spinIcon={isSyncing}
              />
            )}
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_map", "map")}
            overline={
              enrichedBlueprint.creator_name ||
              enrichedBlueprint.master_author ||
              enrichedBlueprint.author ||
              t("role_citizen", "{Citizen}")
            }
            title={enrichedBlueprint.name}
            description={t("blueprint_desc", "{Mod} metadata and Asset repository")}
            badge={
              enrichedBlueprint.is_paid
                ? t("badge_premium", "Premium")
                : `${displayArtifacts.length}`
            }
            badgeIcon={
              enrichedBlueprint.is_paid
                ? t("icon_monetization_on", "monetization_on")
                : t("icon_inventory_2", "inventory_2")
            }
            variant={enrichedBlueprint.is_paid ? "warning" : "accent"}
          >
            <div className="grid grid-cols-3 gap-3 pt-1">
              <StatBox
                label={t("blueprint_version_label", "Game Version")}
                value={
                  enrichedBlueprint.game_version ||
                  enrichedBlueprint.json_data?.game_version ||
                  t("unknown", "UNKNOWN")
                }
                icon={t("icon_sell", "sell")}
                iconColorClass="text-[var(--accent)]"
              />
              <StatBox
                label={t("sort_downloads", "Downloads")}
                value={enrichedBlueprint.downloads || 0}
                icon={t("icon_download", "download")}
                iconColorClass="text-[var(--accent)]"
              />
              <StatBox
                label={t("created_date", "Published")}
                value={new Date(
                  enrichedBlueprint.created_at
                ).toLocaleDateString()}
                icon={t("icon_calendar_today", "calendar_today")}
                iconColorClass="text-[var(--accent)]"
              />
            </div>
          </SidePanelHeroCard>

          <div className="grid grid-cols-2 gap-3">
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_inventory_2", "inventory_2")}
              label={t("filter_all", "Global")}
              value={displayArtifacts.length}
              isActive={filterTab === "ALL"}
              onClick={() => setFilterTab("ALL")}
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_rule", "rule")}
              label={t("filter_missing", "Missing Only")}
              isActive={filterTab === "MISSING"}
              onClick={() => setFilterTab("MISSING")}
            />
          </div>

          <ActionPill
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchPlaceholder={t("search_ph", "Search {mods}...")}
          />

          {premiumMods.length > 0 && (
            <UniversalGroup
              title={`${t("premium_artifacts", "Premium {Mods}")} (${premiumMods.length})`}
              icon={t("icon_workspace_premium", "workspace_premium")}
              headerColorClass="text-[var(--warning)]"
            >
              <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3.5">
                {premiumMods.map((mod: any, i: number) => renderMod(mod, i))}
              </div>
            </UniversalGroup>
          )}

          {standardMods.length > 0 && (
            <UniversalGroup
              title={`${t("standard_artifacts", "Standard {Mods}")} (${standardMods.length})`}
              icon={t("icon_inventory_2", "inventory_2")}
            >
              <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3.5">
                {standardMods.map((mod: any, i: number) => renderMod(mod, i))}
              </div>
            </UniversalGroup>
          )}

          {displayArtifacts.length > visibleCount && (
            <ActionButton
              variant="glass"
              icon={t("icon_expand_more", "expand_more")}
              label={`${t("load_more_artifacts", "Load More Artifacts")} (${displayArtifacts.length - visibleCount})`}
              onClick={() => setVisibleCount((prev: number) => prev + 100)}
              className="w-full"
            />
          )}
        </div>
      </SidePanel>
    </>
  );
}
