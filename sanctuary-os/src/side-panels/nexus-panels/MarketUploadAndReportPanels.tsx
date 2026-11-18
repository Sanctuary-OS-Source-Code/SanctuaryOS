import { useState, useMemo, useEffect } from "react";
import { supabase } from "../../supabase";
import { useLexicon } from "../../LexiconContext";
import { CustomDropdown, CustomComplianceDropdown, SidePanel, SidePanelHeroCard, UniversalGroup, StatBox, ActionButton, PanelHeaderGroup, PanelHeaderButton } from "../../shared";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { useStore } from "../../store";
import { DynamicThemePreviewBanner } from "../../chameleon-components/ThemeCard";
import { importThemeWithAssets, getLuminance } from "../../chameleon-components/ChameleonShared";
import { NexusFlagResolutionCard } from "./NexusFlagResolutionCard";

export function MarketUploadPanel({
  uploadState,
  setUploadState,
  marketTab,
  availableLanguages,
  submitUpload,
  flags = [],
  backdropZ = "z-[15000]",
  panelZ = "z-[15001]",
}: any) {
  const { t } = useLexicon();
  const [fetchedFlags, setFetchedFlags] = useState<any[]>([]);

  useEffect(() => {
    if (!uploadState.isOpen || !uploadState.editId) {
      setFetchedFlags([]);
      return;
    }
    let mounted = true;
    supabase
      .from("nexus_reports")
      .select("*")
      .eq("asset_id", uploadState.editId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (mounted && data) {
          setFetchedFlags(data);
        }
      });
    return () => {
      mounted = false;
    };
  }, [uploadState.isOpen, uploadState.editId]);

  const activeFlags = useMemo(() => {
    if (!uploadState.editId) return [];
    const combined = [
      ...(Array.isArray(flags) ? flags.filter((f: any) => f.asset_id === uploadState.editId) : []),
      ...fetchedFlags,
    ];
    const unique = Array.from(new Map(combined.map((item) => [item.id, item])).values());
    return unique.filter(
      (f: any) =>
        f.status !== "dismissed" &&
        (f.status === "pending" || uploadState.isHidden || f.status !== "creator_resolved")
    );
  }, [flags, fetchedFlags, uploadState.editId, uploadState.isHidden]);

  if (!uploadState.isOpen) return null;

  const isEdit = Boolean(uploadState.editId);
  const isFlagged = activeFlags.length > 0;
  const resolvedTitle =
    marketTab === "LEXICONS"
      ? isEdit
        ? t("upload_edit_lexicon_title", "Update {Lexicon}")
        : t("upload_lexicon_title", "Upload {Lexicon}")
      : marketTab === "TEMPLATES"
        ? isEdit
          ? t("upload_edit_template_title", "Update Template")
          : t("upload_template_title", "Upload Template")
        : isEdit
          ? t("upload_edit_chameleon_title", "Update {Chameleon}")
          : t("upload_chameleon_title", "Upload {Chameleon}");

  const resolvedSubtitle = isFlagged
    ? t("flag_res_subtitle_flagged", "Flagged Item — Review & Resubmit")
    : isEdit
      ? t("upload_edit_asset_sub", "Update your published creation")
      : t("auto_upload_new_asset", "Upload your custom creation");

  return (
    <>
      <SidePanel
        isOpen={true}
        onClose={() => setUploadState((s: any) => ({ ...s, isOpen: false }))}
        widthClass="w-[90vw] md:w-[680px]"
        backdropZ={backdropZ}
        panelZ={panelZ}
        icon={isFlagged ? t("icon_flag", "flag") : t("icon_cloud_upload", "cloud_upload")}
        iconColorClass={isFlagged ? "text-[var(--danger)]" : "text-[var(--accent)]"}
        title={resolvedTitle}
        subtitle={resolvedSubtitle}
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={
                isFlagged
                  ? t("icon_published_with_changes", "published_with_changes")
                  : uploadState.editId
                    ? t("icon_save", "save")
                    : t("icon_cloud_upload", "cloud_upload")
              }
              tooltip={
                isFlagged
                  ? t("flag_res_btn_resubmit", "Resolve & Resubmit Fix")
                  : uploadState.editId
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
            icon={isFlagged ? t("icon_flag", "flag") : t("icon_cloud_upload", "cloud_upload")}
            overline={
              marketTab === "LEXICONS"
                ? t("term_lexicons", "Lexicons")
                : marketTab === "TEMPLATES"
                  ? t("tab_templates", "Templates")
                  : t("term_chameleons", "Chameleons")
            }
            title={uploadState.name || resolvedTitle}
            description={resolvedSubtitle}
            badge={`v${uploadState.version || "1.0.0"}`}
            badgeIcon={t("icon_new_releases", "new_releases")}
            variant={isFlagged ? "danger" : "accent"}
          />

          <NexusFlagResolutionCard
            activeFlags={activeFlags}
            isHidden={Boolean(uploadState.isHidden)}
            assetType={
              marketTab === "LEXICONS"
                ? "lexicon"
                : marketTab === "TEMPLATES"
                  ? "workbench_template"
                  : "chameleon"
            }
            fileContent={uploadState.fileContent}
            onResubmit={submitUpload}
            disabled={
              !uploadState.name ||
              (uploadState.language === "add_new" && !uploadState.newLanguage)
            }
          />

          <UniversalGroup
            title={t("upload_config_group", "Asset Configuration")}
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
                    {t("language", "Language")}
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
                        label: t("upload_add_language", "Add New Language..."),
                      },
                    ]}
                  />
                </div>
                {uploadState.language === "add_new" && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                      {t("upload_new_language", "New Language Name")}
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
                      { id: "Theme", label: t("lexicon_type_thematic", "Thematic") },
                      { id: "Default", label: t("lexicon_type_standard", "Standard") },
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
  backdropZ = "z-[65000]",
  panelZ = "z-[65001]",
}: any) {
  const { t } = useLexicon();
  if (!reportState.isOpen) return null;
  const isModComplianceFlag = reportState.assetType === "mod";
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
            complianceTier: 1,
          })
        }
        widthClass="w-[90vw] md:w-[680px]"
        backdropZ={backdropZ}
        panelZ={panelZ}
        icon={t("icon_flag", "flag")}
        iconColorClass="text-[var(--danger)]"
        title={
          isModComplianceFlag
            ? t("flag_title", "Flag {Mod} for Compliance")
            : t("report_title", "Report Content")
        }
        subtitle={
          isModComplianceFlag
            ? t(
                "flag_compliance_route_desc",
                "Flagging a {Mod} routes it to Oversight Compliance as Pending for safety and classification review."
              )
            : t(
                "report_desc",
                "Please provide detailed information about why this asset should be removed from the {Nexus}. False reports may result in account termination."
              )
        }
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_flag", "flag")}
              tooltip={t("report_submit", "Submit Report")}
              disabled={!String(reportState.reason || "").trim()}
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
            title={
              isModComplianceFlag
                ? t("flag_title", "Flag {Mod} for Compliance")
                : t("report_content", "Report Content")
            }
            description={
              isModComplianceFlag
                ? t(
                    "flag_compliance_route_desc",
                    "Flagging a {Mod} routes it to Oversight Compliance as Pending for safety and classification review."
                  )
                : t(
                    "report_desc",
                    "Please provide detailed information about why this asset should be removed from the {Nexus}. False reports may result in account termination."
                  )
            }
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

          {isModComplianceFlag && (
            <UniversalGroup
              title={t("assign_tier", "Compliance Classification")}
              icon={t("icon_policy", "policy")}
            >
              <CustomComplianceDropdown
                value={Math.min(4, Math.max(1, Number(reportState.complianceTier || 1)))}
                onChange={(val: number) =>
                  setReportState({
                    ...reportState,
                    complianceTier: Math.min(4, Math.max(1, Number(val || 1))),
                  })
                }
                minTier={1}
                maxTier={4}
              />
            </UniversalGroup>
          )}

          <UniversalGroup
            title={t("reason", "Reason")}
            icon={t("icon_description", "description")}
          >
            <textarea
              value={reportState.reason}
              placeholder={t("report_placeholder", "Describe the issue...")}
              onChange={(e) =>
                setReportState({ ...reportState, reason: e.target.value })
              }
              className="w-full h-44 glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] resize-none focus:outline-none focus:border-[var(--accent)] transition-all"
            />
            <div className="flex flex-wrap items-center justify-end gap-2.5 w-full">
              <ActionButton
                variant="glass"
                label={t("cancel", "Cancel")}
                onClick={() =>
                  setReportState({
                    isOpen: false,
                    assetId: null,
                    assetType: null,
                    reason: "",
                    complianceTier: 1,
                  })
                }
              />
              <ActionButton
                variant="danger"
                icon={t("icon_flag", "flag")}
                label={t("report_submit", "Submit Report")}
                disabled={!String(reportState.reason || "").trim()}
                onClick={() =>
                  handleReportSubmit({ preventDefault: () => {} } as any)
                }
              />
            </div>
          </UniversalGroup>
        </div>
      </SidePanel>
    </>
  );
}

