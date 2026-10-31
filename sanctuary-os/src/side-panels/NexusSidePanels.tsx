import { useState, useMemo, useEffect } from "react";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import {
  CustomDropdown,
  SidePanel,
  SidePanelHeroCard,
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
  formatDisplayName,
  getExtensionRegex,
  getModFallbackUrl,
  getModIcon,
  handleOpenUrl,
  EmptyState,
  openModDossier,
} from "../shared";
import {
  formatCleanModTitle,
  formatAddonModuleName,
  normalizeModGroupTitle,
  extractValidCreator,
  isKnownCreatorName,
} from "./CommandIncompatiblePanel";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { isDesktop } from "../utils/envUtils";
import { DynamicThemePreviewBanner } from "../chameleon-components/ThemeCard";
import { importThemeWithAssets, getLuminance } from "../chameleon-components/ChameleonShared";
import enDefault from "../lexicons/en-default.json";
import { deepCompare } from "../lib/MasonValidation";

export function NexusFlagResolutionCard({
  activeFlags = [],
  isHidden = false,
  isOutdated = false,
  assetType = "lexicon",
  fileContent = null,
  complianceViolations = [],
  onRemoveViolationArtifact,
  onResubmit,
  disabled = false,
  isModerationView = false,
}: {
  activeFlags?: any[];
  isHidden?: boolean;
  isOutdated?: boolean;
  assetType?: string;
  fileContent?: any;
  complianceViolations?: BlueprintComplianceViolation[];
  onRemoveViolationArtifact?: (v: BlueprintComplianceViolation) => void;
  onResubmit?: () => void;
  disabled?: boolean;
  isModerationView?: boolean;
}) {
  const { t } = useLexicon();
  const [isViolationsPanelOpen, setIsViolationsPanelOpen] = useState(false);
  const [violationSearch, setViolationSearch] = useState("");
  const [violationReasonFilter, setViolationReasonFilter] = useState<string>("ALL");
  const [visibleViolationCount, setVisibleViolationCount] = useState(60);

  const lexiconParity = useMemo(() => {
    if (assetType !== "lexicon" || !fileContent || typeof fileContent !== "object") return null;
    try {
      return deepCompare(enDefault, fileContent, true);
    } catch {
      return null;
    }
  }, [assetType, fileContent]);

  const hasFlags = activeFlags.length > 0;
  const hasViolations = Array.isArray(complianceViolations) && complianceViolations.length > 0;

  const filteredViolations = useMemo(() => {
    if (!hasViolations) return [];
    let list = complianceViolations;
    if (violationReasonFilter !== "ALL") {
      list = list.filter((v) => {
        if (violationReasonFilter === "TIER") return /^Tier\s+[1-5]/i.test(v.reason);
        return v.reason.toLowerCase() === violationReasonFilter.toLowerCase();
      });
    }
    if (violationSearch.trim()) {
      const q = violationSearch.trim().toLowerCase();
      list = list.filter(
        (v) =>
          v.cleanName.toLowerCase().includes(q) ||
          v.name.toLowerCase().includes(q) ||
          (v.author && v.author.toLowerCase().includes(q)) ||
          v.reason.toLowerCase().includes(q)
      );
    }
    return list;
  }, [hasViolations, complianceViolations, violationReasonFilter, violationSearch]);

  if (!hasFlags && !hasViolations && !isHidden && !isOutdated) return null;

  const handleOpenViolationDossier = (v: BlueprintComplianceViolation) => {
    const state = useStore.getState();
    const allVaultMods = Array.isArray(state.modList) ? state.modList : [];
    const activeSchema = state.activeGameSchema;
    const normTarget = getNormalizedArtifactName(v.cleanName || v.name);
    const matchedLocal = allVaultMods.find((m: any) => {
      if (!m || m.isVirtual) return false;
      if (v.hash && m.hash && String(m.hash) === String(v.hash)) return true;
      if (v.modId && m.dbId && String(m.dbId) === String(v.modId)) return true;
      const mFile = String(m.name || "").split(/[\\/]/).pop() || "";
      if (mFile && mFile.toLowerCase() === v.cleanName.toLowerCase()) return true;
      if (normTarget && getNormalizedArtifactName(mFile) === normTarget) return true;
      return false;
    });

    const cleanTitle =
      formatCleanModTitle(
        formatDisplayName(v.cleanName || v.name, undefined, activeSchema)
      ) || v.cleanName;

    openModDossier({
      ...(matchedLocal || {}),
      id: v.modId || matchedLocal?.dbId || matchedLocal?.id || v.hash || v.name,
      dbId: v.modId || matchedLocal?.dbId,
      hash: v.hash || matchedLocal?.hash,
      name: matchedLocal?.name || v.name,
      displayName: matchedLocal?.displayName || cleanTitle,
      author: v.author || matchedLocal?.author,
      status: v.status || matchedLocal?.status || "unknown",
      compliance_tier:
        typeof v.tier === "number" && v.tier >= 0
          ? v.tier
          : typeof matchedLocal?.compliance_tier === "number"
            ? matchedLocal.compliance_tier
            : 0,
      isNexusView: !matchedLocal,
    });
  };

  const renderViolationCard = (v: BlueprintComplianceViolation, vIdx: number) => {
    const activeSchema = useStore.getState().activeGameSchema;
    const isScript = /\.ts4script$/i.test(v.cleanName || v.name);
    const typeLabel = isScript
      ? t("type_script", "Script")
      : t("type_package", "Package");
    const displayTitle =
      formatCleanModTitle(formatDisplayName(v.cleanName, undefined, activeSchema)) || v.cleanName;
    const isDangerReason =
      v.reason === "Corrupted" || /^Tier\s+[2-5]/i.test(v.reason);
    const hasAuthor =
      v.author &&
      String(v.author).trim() !== "" &&
      String(v.author).toLowerCase() !== t("unknown", "Unknown").toLowerCase() &&
      String(v.author).toLowerCase() !== "unknown";

    return (
      <div
        key={`${v.hash || v.name}_${vIdx}`}
        onClick={() => handleOpenViolationDossier(v)}
        className="flex flex-col justify-between gap-3 p-3.5 glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] transition-all group/item cursor-pointer"
      >
        {/* Top Row: Icon Well + Title/Subtitle Identity */}
        <div className="flex items-center gap-3 min-w-0 w-full">
          <div
            className={`w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 ${
              isDangerReason ? "text-[var(--danger)]" : "text-[var(--warning)]"
            }`}
          >
            <span className="material-symbols-outlined !text-[20px]">
              {isDangerReason
                ? t("icon_gpp_bad", "gpp_bad")
                : t("icon_warning_amber", "warning_amber")}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            <div className="relative group/blktitle flex items-center min-w-0 w-fit max-w-full">
              <span className="text-sm font-black text-[var(--text)] group-hover/item:text-[var(--accent)] transition-colors tracking-tight leading-snug truncate">
                {displayTitle}
              </span>
              <HoverTooltip
                className="z-[200]"
                title={displayTitle}
                icon={t("icon_gpp_bad", "gpp_bad")}
                variant="danger"
              />
            </div>
            <span className="text-[11px] font-semibold text-[var(--subtext)] opacity-85 truncate">
              {hasAuthor ? `${v.author} • ${typeLabel}` : typeLabel}
            </span>
          </div>
        </div>

        {/* Bottom Footer Row: Compliance Badge on Left | Open Dossier + Remove Buttons on Right */}
        <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
          <span className={VAULT_CHIP_CLASS}>
            <span
              className={`material-symbols-outlined !text-[12px] ${
                isDangerReason ? "text-[var(--danger)]" : "text-[var(--warning)]"
              }`}
            >
              {isDangerReason
                ? t("icon_gpp_bad", "gpp_bad")
                : t("icon_shield", "shield")}
            </span>
            <span>{v.reason}</span>
          </span>

          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            <div className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] group-hover/item:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--subtext)] group-hover/item:text-[var(--accent)] flex items-center justify-center transition-all">
              <span className="material-symbols-outlined !text-[14px]">
                {t("icon_open_in_new", "open_in_new")}
              </span>
            </div>

            {onRemoveViolationArtifact && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveViolationArtifact(v);
                }}
                className="relative group/rmbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center transition-all cursor-pointer shrink-0"
              >
                <span className="material-symbols-outlined !text-[15px]">
                  {t("icon_delete", "delete")}
                </span>
                <HoverTooltip
                  className="z-[200] !right-0 !translate-x-0 !left-auto"
                  title={t("remove", "Remove")}
                  icon={t("icon_delete", "delete")}
                  variant="danger"
                />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const whyText =
    assetType === "blueprint" && (hasViolations || hasFlags)
      ? t(
          "nexus_flag_tier0_desc",
          "Only verified Tier 0 {mods} are permitted in {Nexus} {Blueprints}. Remove Tier 1–5 or unknown {mods} below and re-upload to restore your {Blueprint} listing."
        )
      : isHidden && hasFlags
        ? t(
            "flag_res_why_hidden_report",
            "Flagged by Community / Architect Review and temporarily hidden from public {Nexus} listings until an updated revision is submitted."
          )
        : hasFlags
          ? t(
              "flag_res_why_citizen_report",
              "Flagged by a {Citizen} report in {Nexus}. Review the reported issue below, apply the needed fixes, and resubmit to clear the flag."
            )
          : isOutdated
            ? t(
                "flag_res_why_outdated",
                "Flagged because the target game or OS version is behind the current release baseline."
              )
            : t("flag_res_why_hidden_only", "Currently hidden from public {Nexus} listings.");

  const inlinePreviewViolations = hasViolations ? complianceViolations.slice(0, 4) : [];

  return (
    <>
      <UniversalGroup
        title={t("flag_res_dossier_title", "Flag & Resolution Dossier")}
        icon={t("icon_flag", "flag")}
        headerColorClass="text-[var(--danger)]"
      >
        <div className="glass-panel rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col gap-4">
          {/* Header Callout + Telemetry Chips */}
          <div className="flex flex-col gap-3 pb-3.5 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--danger)]">
                <span className="material-symbols-outlined !text-[20px]">
                  {t("icon_report_problem", "report_problem")}
                </span>
              </div>
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                    {assetType === "blueprint" && hasViolations
                      ? t("nexus_flag_title", "{Nexus} Compliance Flag")
                      : t("flag_res_why_title", "Why This Item Was Flagged")}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {hasViolations && (
                      <div className={VAULT_CHIP_CLASS}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                          {t("icon_gpp_bad", "gpp_bad")}
                        </span>
                        <span>
                          {complianceViolations.length.toLocaleString()} {t("flagged", "Flagged")}
                        </span>
                      </div>
                    )}
                    {hasFlags && (
                      <div className={VAULT_CHIP_CLASS}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                          {t("icon_flag", "flag")}
                        </span>
                        <span>
                          {activeFlags.length} {t("flag_res_reports_count", "Active Report(s)")}
                        </span>
                      </div>
                    )}
                    {isHidden && (
                      <div className={VAULT_CHIP_CLASS}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                          {t("icon_visibility_off", "visibility_off")}
                        </span>
                        <span>{t("reply_hidden", "Hidden")}</span>
                      </div>
                    )}
                    {isOutdated && (
                      <div className={VAULT_CHIP_CLASS}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                          {t("icon_update", "update")}
                        </span>
                        <span>{t("status_outdated", "Outdated")}</span>
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-xs font-semibold text-[var(--subtext)] leading-relaxed">
                  {whyText}
                </p>
              </div>
            </div>
          </div>

          {/* Reported Issue / Diagnostic Summary */}
          {hasFlags && (
            <div className="flex flex-col gap-2">
              {activeFlags.map((flag: any, idx: number) => {
                const rawReason = String(flag.reason || flag.description || "");
                const isAutoAuditReport = /^Nexus Compliance Audit:/i.test(rawReason);
                const cleanReasonText =
                  isAutoAuditReport && hasViolations
                    ? t(
                        "flag_res_bp_audit_summary",
                        "Automated Tier 0 Compliance Audit — Only verified Tier 0 {mods} with Stable status are permitted in {Nexus} {Blueprints}."
                      )
                    : rawReason
                      ? rawReason.replace(/\s+\?\s+/g, " — ")
                      : t(
                          "flag_res_default_issue_desc",
                          "Reported for missing keys, broken formatting, or version incompatibility."
                        );

                return (
                  <div
                    key={flag.id || idx}
                    className="p-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-wider text-[var(--subtext)]">
                      <span className="flex items-center gap-1.5 truncate">
                        <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                          {isAutoAuditReport
                            ? t("icon_shield", "shield")
                            : t("icon_person", "person")}
                        </span>
                        <span>
                          {t("by_prefix", "By")}{" "}
                          {flag.reporter_name || t("anonymous", "Anonymous")}
                        </span>
                      </span>
                      {flag.created_at && (
                        <span className="opacity-75 shrink-0">
                          {new Date(flag.created_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-bold text-[var(--text)] leading-relaxed">
                      {cleanReasonText}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Flagged Artifacts Preview (First 4 + SidePanel Button for Rest) */}
          {hasViolations && (
            <div className="flex flex-col gap-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)]">
                    {t("nexus_flag_title", "{Nexus} Compliance Flag")} (
                    {complianceViolations.length.toLocaleString()})
                  </span>
                  {complianceViolations.length > 4 && (
                    <span className="text-[10px] font-bold text-[var(--subtext)] opacity-75">
                      •{" "}
                      {t("flag_res_showing_preview_count", "Showing {0} of {1}")
                        .replace("{0}", String(inlinePreviewViolations.length))
                        .replace("{1}", complianceViolations.length.toLocaleString())}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-bold text-[var(--accent)] flex items-center gap-1">
                  <span className="material-symbols-outlined !text-[13px]">
                    {t("icon_touch_app", "touch_app")}
                  </span>
                  {t("flag_res_inspect_dossier_hint", "Click any {mod} to open its Dossier")}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                {inlinePreviewViolations.map((v, vIdx) => renderViolationCard(v, vIdx))}
              </div>

              {complianceViolations.length > 4 && (
                <ActionButton
                  variant="glass"
                  icon={t("icon_list_alt", "list_alt")}
                  label={`${t("flag_res_view_all_flagged", "View All Flagged {Mods}")} (${complianceViolations.length.toLocaleString()})`}
                  onClick={() => {
                    setVisibleViolationCount(36);
                    setIsViolationsPanelOpen(true);
                  }}
                  className="w-full justify-center"
                />
              )}
            </div>
          )}

          {lexiconParity && (lexiconParity.missing > 0 || lexiconParity.deprecated > 0) && (
            <div className="flex items-center gap-2.5 p-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-xs font-bold text-[var(--text)] leading-snug">
              <span className="material-symbols-outlined !text-[16px] text-[var(--warning)] shrink-0">
                {t("icon_fact_check", "fact_check")}
              </span>
              <span className="break-words">
                {t("flag_res_lexicon_parity_prefix", "Automated {Lexicon} Check:")}{" "}
                {lexiconParity.missing.toLocaleString()} {t("flag_res_missing_keys", "missing keys")} •{" "}
                {lexiconParity.deprecated.toLocaleString()} {t("flag_res_deprecated_keys", "deprecated keys")}
              </span>
            </div>
          )}

          {/* Resolution Steps & Action (shown to creators or when onResubmit is provided) */}
          {!isModerationView && (
            <div className="pt-3.5 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined !text-[16px] text-[var(--success)]">
                  {t("icon_task_alt", "task_alt")}
                </span>
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)]">
                  {t("flag_res_how_title", "How to Resolve & Resubmit")}
                </span>
              </div>

              <div className="flex flex-col gap-2 text-xs font-semibold text-[var(--subtext)]">
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[10px] font-black text-[var(--accent)] flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </span>
                  <span className="leading-relaxed">
                    {assetType === "blueprint" && hasViolations
                      ? t(
                          "flag_res_bp_step_1",
                          "Click any flagged {mod} below to open its Dossier and inspect its current verification status or safety tier."
                        )
                      : t(
                          "flag_res_step1_nexus",
                          "Fix the reported issue in your local editor or use Replace below to attach your updated file."
                        )}
                  </span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[10px] font-black text-[var(--accent)] flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </span>
                  <span className="leading-relaxed">
                    {assetType === "blueprint" && hasViolations
                      ? t(
                          "flag_res_bp_step_2",
                          "Verify those {mods} in your {Vault} / {Lab}, or let Sanctuary automatically strip non-compliant {mods} from this {Blueprint}."
                        )
                      : t(
                          "flag_res_step2_nexus",
                          "Increment the Revision number (e.g. 1.0.1 → 1.0.2) and describe your fix in What's New."
                        )}
                  </span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[10px] font-black text-[var(--accent)] flex items-center justify-center shrink-0 mt-0.5">
                    3
                  </span>
                  <span className="leading-relaxed">
                    {assetType === "blueprint" && hasViolations
                      ? t(
                          "flag_res_bp_step_3",
                          "Click Remove Non-Compliant & Re-Upload below to publish the sanitized {Blueprint} and clear the {Nexus} flag."
                        )
                      : t(
                          "flag_res_step3_nexus",
                          "Click Resolve & Resubmit below to publish the updated build, restore public visibility, and clear the active flag."
                        )}
                  </span>
                </div>
              </div>

              {onResubmit && (
                <div className="pt-1">
                  <ActionButton
                    variant="primary"
                    icon={t("icon_published_with_changes", "published_with_changes")}
                    label={
                      assetType === "blueprint" && hasViolations
                        ? t("btn_sanitize_reupload", "Remove Non-Compliant & Re-Upload")
                        : t("flag_res_btn_resubmit", "Resolve & Resubmit Fix")
                    }
                    onClick={onResubmit}
                    disabled={disabled}
                    className="w-full justify-center"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </UniversalGroup>

      {/* Stacked SidePanel for Inspecting All Flagged Artifacts */}
      {hasViolations && (
        <SidePanel
          isOpen={isViolationsPanelOpen}
          onClose={() => setIsViolationsPanelOpen(false)}
          title={t("flag_res_flagged_panel_title", "Flagged {Mods} Inspector")}
          subtitle={t(
            "flag_res_flagged_panel_sub",
            "Non-Tier-0 or Unverified {Mods} Detected in {Blueprint}"
          )}
          icon={t("icon_gpp_bad", "gpp_bad")}
          iconColorClass="text-[var(--danger)]"
          widthClass="w-[92vw] md:w-[680px]"
          backdropZ="z-[70000]"
          panelZ="z-[70001]"
        >
          <div className="flex flex-col gap-4 mt-2 pb-10">
            <SidePanelHeroCard
              icon={t("icon_gpp_bad", "gpp_bad")}
              overline={t("nexus_flag_title", "{Nexus} Compliance Flag")}
              title={`${complianceViolations.length.toLocaleString()} ${t("flagged", "Flagged")} ${t("mods", "{Mods}")}`}
              description={t(
                "nexus_flag_tier0_desc",
                "Only verified Tier 0 {mods} are permitted in {Nexus} {Blueprints}. Remove Tier 1–5 or unknown {mods} below and re-upload to restore your {Blueprint} listing."
              )}
              variant="danger"
            >
              {onResubmit && (
                <div className="flex items-center justify-end pt-1">
                  <ActionButton
                    variant="primary"
                    icon={t("icon_published_with_changes", "published_with_changes")}
                    label={t("btn_sanitize_reupload", "Remove Non-Compliant & Re-Upload")}
                    onClick={() => {
                      setIsViolationsPanelOpen(false);
                      onResubmit();
                    }}
                    disabled={disabled}
                  />
                </div>
              )}
            </SidePanelHeroCard>

            <ActionPill
              searchQuery={violationSearch}
              setSearchQuery={(val: string) => {
                setViolationSearch(val);
                setVisibleViolationCount(36);
              }}
              searchPlaceholder={t("search_ph", "Search {mods}...")}
              primaryPopover={{
                icon: t("icon_tune", "tune"),
                label:
                  violationReasonFilter !== "ALL"
                    ? `${t("filters", "Filters")} (1)`
                    : t("filters", "Filters"),
                content: (
                  <div className="flex flex-col w-[320px] p-3.5 max-w-[calc(100vw-40px)] gap-2">
                    <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-1 px-1 flex items-center gap-2">
                      {t("filter_status", "Filter Status")}
                      <div className="h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex-1" />
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {[
                        { id: "ALL", label: t("all", "All") },
                        { id: "Unknown", label: t("unknown", "Unknown") },
                        { id: "Unverified", label: t("unverified", "Unverified") },
                        { id: "Corrupted", label: t("status_corrupted", "Corrupted") },
                        { id: "Unstable", label: t("status_unstable", "Unstable") },
                        { id: "Under Review", label: t("status_under_review", "Under Review") },
                        { id: "TIER", label: `${t("stat_tier", "Tier")} 1–5` },
                      ].map((opt) => {
                        const active = violationReasonFilter === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setViolationReasonFilter(opt.id);
                              setVisibleViolationCount(36);
                            }}
                            className={`sa-dropdown-item flex items-center justify-between gap-2 px-3 py-1.5 text-[11px] capitalize tracking-wide text-left cursor-pointer ${
                              active ? "is-selected font-bold" : "font-semibold"
                            }`}
                          >
                            <span className="truncate">{opt.label}</span>
                            {active && (
                              <span className="material-symbols-outlined !text-[14px] text-[var(--accent)] shrink-0">
                                {t("icon_check", "check")}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ),
              }}
            />

            <div className="flex items-center justify-between px-1 text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
              <span>
                {filteredViolations.length.toLocaleString()} {t("mods", "{Mods}")}
              </span>
              <span className="text-[var(--accent)] flex items-center gap-1">
                <span className="material-symbols-outlined !text-[13px]">
                  {t("icon_touch_app", "touch_app")}
                </span>
                {t("flag_res_inspect_dossier_hint", "Click any {mod} to open its Dossier")}
              </span>
            </div>

            {filteredViolations.length === 0 ? (
              <EmptyState
                icon={t("icon_search_off", "search_off")}
                title={t("empty_title", "No matching {mods} found")}
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                {filteredViolations
                  .slice(0, visibleViolationCount)
                  .map((v, vIdx) => renderViolationCard(v, vIdx))}
              </div>
            )}

            {filteredViolations.length > visibleViolationCount && (
              <ActionButton
                variant="glass"
                icon={t("icon_expand_more", "expand_more")}
                label={`${t("load_more_artifacts", "Load More Artifacts")} (${(
                  filteredViolations.length - visibleViolationCount
                ).toLocaleString()})`}
                onClick={() => setVisibleViolationCount((prev) => prev + 60)}
                className="w-full justify-center"
              />
            )}
          </div>
        </SidePanel>
      )}
    </>
  );
}

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

const GENERIC_BLUEPRINT_DIRS = new Set([
  "mods",
  "packages",
  "package",
  "scripts",
  "script",
  "overrides",
  "override",
  "cas",
  "buildbuy",
  "build_buy",
  "build-buy",
  "gameplay",
  "tuning",
  "clothing",
  "hair",
  "furniture",
  "sanctuary",
  "sanctuary2",
  "sanctuary3",
  "!_core",
  "z_overrides",
]);

function extractSpecificSubfolder(rawPath: string, activeGameSchema?: any): string | null {
  if (!rawPath || (!rawPath.includes("/") && !rawPath.includes("\\"))) return null;
  const schemaTiers = Array.isArray(activeGameSchema?.load_order?.priority_tiers)
    ? activeGameSchema.load_order.priority_tiers
    : [];
  const tierFolders = new Set<string>(
    schemaTiers.map((pt: any) => String(pt?.folder || "").toLowerCase()).filter(Boolean)
  );
  const segs = rawPath
    .replace(/\\/g, "/")
    .split("/")
    .slice(0, -1)
    .map((s) => s.trim())
    .filter(Boolean);
  for (let i = segs.length - 1; i >= 0; i--) {
    const seg = segs[i];
    const low = seg.toLowerCase();
    if (low.startsWith("!")) continue;
    if (GENERIC_BLUEPRINT_DIRS.has(low) || tierFolders.has(low)) continue;
    return seg;
  }
  return null;
}

interface VaultLookupCacheEntry {
  localByHash: Map<string, any>;
  localByExact: Map<string, any>;
  localByFile: Map<string, any>;
  localByBase: Map<string, any>;
  virtualByFamilyId: Map<string, any>;
  parentByDbId: Map<string, any>;
}

const vaultLookupWeakCache = new WeakMap<any[], VaultLookupCacheEntry>();
let cachedNexusItemsRef: any[] | null = null;
let cachedNexusParentByHash = new Map<string, any>();
let cachedNexusParentByNorm = new Map<string, any>();

function getOrBuildVaultLookup(allVaultMods: any[], extRegex: RegExp): VaultLookupCacheEntry {
  const existing = vaultLookupWeakCache.get(allVaultMods);
  if (existing) return existing;

  const localByHash = new Map<string, any>();
  const localByExact = new Map<string, any>();
  const localByFile = new Map<string, any>();
  const localByBase = new Map<string, any>();
  const virtualByFamilyId = new Map<string, any>();
  const parentByDbId = new Map<string, any>();

  for (const vm of allVaultMods) {
    if (!vm) continue;
    if (vm.isVirtual) {
      if (vm.dbId) virtualByFamilyId.set(String(vm.dbId).split("@")[0], vm);
      if (vm.baseFamilyId) virtualByFamilyId.set(String(vm.baseFamilyId).split("@")[0], vm);
      if (vm.familyId) virtualByFamilyId.set(String(vm.familyId).split("@")[0], vm);
      if (vm.setId) virtualByFamilyId.set(`set_${vm.setId}`, vm);
      if (Array.isArray(vm.flavors)) {
        for (const fl of vm.flavors) {
          if (!fl) continue;
          if (fl.hash && !localByHash.has(fl.hash)) localByHash.set(fl.hash, fl);
          if (fl.name) {
            const rawLow = String(fl.name).toLowerCase();
            localByExact.set(rawLow, fl);
            const fPart = (String(fl.name).split(/[\\/]/).pop() || String(fl.name)).toLowerCase();
            if (!localByFile.has(fPart)) localByFile.set(fPart, fl);
            const bPart = fPart.replace(extRegex, "").toLowerCase();
            if (bPart && !localByBase.has(bPart)) localByBase.set(bPart, fl);
          }
        }
      }
      continue;
    }
    if (vm.dbId) parentByDbId.set(String(vm.dbId), vm);
    if (vm.hash) localByHash.set(vm.hash, vm);
    if (vm.name) {
      const rawLow = String(vm.name).toLowerCase();
      localByExact.set(rawLow, vm);
      const fPart = (String(vm.name).split(/[\\/]/).pop() || String(vm.name)).toLowerCase();
      if (!localByFile.has(fPart)) localByFile.set(fPart, vm);
      const bPart = fPart.replace(extRegex, "").toLowerCase();
      if (bPart && !localByBase.has(bPart)) localByBase.set(bPart, vm);
    }
  }

  const built: VaultLookupCacheEntry = {
    localByHash,
    localByExact,
    localByFile,
    localByBase,
    virtualByFamilyId,
    parentByDbId,
  };
  vaultLookupWeakCache.set(allVaultMods, built);
  return built;
}

function getOrBuildNexusParentLookup() {
  try {
    const nexusItems: any[] = (window as any).__sanctuaryCache?.nexus?.nexusItems || [];
    if (nexusItems === cachedNexusItemsRef) {
      return {
        nexusParentByHash: cachedNexusParentByHash,
        nexusParentByNorm: cachedNexusParentByNorm,
      };
    }
    const nexusParentByHash = new Map<string, any>();
    const nexusParentByNorm = new Map<string, any>();
    for (const ni of nexusItems) {
      if (!ni) continue;
      if ((ni.isParent || ni.isVirtual || ni.isCollection) && Array.isArray(ni.flavors)) {
        for (const fl of ni.flavors) {
          if (!fl) continue;
          if (fl.hash) nexusParentByHash.set(String(fl.hash), ni);
          if (Array.isArray(fl.mod_versions)) {
            for (const mv of fl.mod_versions) {
              if (mv?.dna_hash) nexusParentByHash.set(String(mv.dna_hash), ni);
            }
          }
          const fn = getNormalizedArtifactName(fl.name || "");
          if (fn && !nexusParentByNorm.has(fn)) nexusParentByNorm.set(fn, ni);
        }
      } else {
        if (ni.hash) nexusParentByHash.set(String(ni.hash), ni);
        if (Array.isArray(ni.mod_versions)) {
          for (const mv of ni.mod_versions) {
            if (mv?.dna_hash) nexusParentByHash.set(String(mv.dna_hash), ni);
          }
        }
      }
    }
    cachedNexusItemsRef = nexusItems;
    cachedNexusParentByHash = nexusParentByHash;
    cachedNexusParentByNorm = nexusParentByNorm;
    return { nexusParentByHash, nexusParentByNorm };
  } catch {
    return {
      nexusParentByHash: cachedNexusParentByHash,
      nexusParentByNorm: cachedNexusParentByNorm,
    };
  }
}

export interface BlueprintComplianceViolation {
  name: string;
  cleanName: string;
  hash: string;
  reason: string;
  tier: number | null;
  modId?: string;
  author?: string;
  status?: string;
}

export interface BlueprintComplianceAuditResult {
  blueprintId: any;
  isCompliant: boolean;
  violations: BlueprintComplianceViolation[];
  compliantArtifacts: any[];
  totalRawCount?: number;
}

export async function auditBlueprintsTier0Compliance(
  supabaseClient: any,
  blueprints: any[],
  options: { autoFlagInDb?: boolean; existingPendingReportBpIds?: Set<any> } = {}
): Promise<
  Map<any, BlueprintComplianceAuditResult> &
    Record<string, BlueprintComplianceAuditResult>
> {
  const results = new Map<any, BlueprintComplianceAuditResult>() as Map<
    any,
    BlueprintComplianceAuditResult
  > &
    Record<string, BlueprintComplianceAuditResult>;
  if (!Array.isArray(blueprints) || blueprints.length === 0) return results;

  const allHashesSet = new Set<string>();
  for (const bp of blueprints) {
    const rawArts =
      bp?.artifacts || bp?.json_data?.artifacts || bp?.originalBlueprint?.artifacts || [];
    if (!Array.isArray(rawArts)) continue;
    for (const art of rawArts) {
      const h = typeof art === "object" && art?.hash ? String(art.hash).trim() : "";
      if (h) allHashesSet.add(h);
    }
  }

  const verifiedHashMap = new Map<
    string,
    { id: string; name: string; author: string; complianceTier: number; status: string }
  >();
  const allHashes = Array.from(allHashesSet);
  const chunkSize = 200;

  if (allHashes.length > 0) {
    const promises = [];
    for (let i = 0; i < allHashes.length; i += chunkSize) {
      const chunk = allHashes.slice(i, i + chunkSize);
      promises.push(
        supabaseClient
          .from("mod_versions")
          .select("dna_hash, mods(id, name, master_author, compliance_tier, status)")
          .in("dna_hash", chunk)
      );
    }
    const responses = await Promise.all(promises);
    for (const res of responses) {
      if (!res?.error && Array.isArray(res?.data)) {
        for (const row of res.data) {
          const dbMod = Array.isArray(row.mods) ? row.mods[0] : row.mods;
          if (row.dna_hash && dbMod?.id) {
            verifiedHashMap.set(String(row.dna_hash), {
              id: String(dbMod.id),
              name: String(dbMod.name || ""),
              author: String(dbMod.master_author || ""),
              complianceTier:
                typeof dbMod.compliance_tier === "number" ? dbMod.compliance_tier : -1,
              status: String(dbMod.status || ""),
            });
          }
        }
      }
    }
  }

  for (const bp of blueprints) {
    if (!bp) continue;
    const rawArts =
      bp.artifacts || bp.json_data?.artifacts || bp.originalBlueprint?.artifacts || [];
    const violations: BlueprintComplianceViolation[] = [];
    const compliantArtifacts: any[] = [];

    if (Array.isArray(rawArts)) {
      for (const art of rawArts) {
        const rawName =
          typeof art === "string" ? art : String(art?.name || art?.path || "");
        if (
          !rawName ||
          rawName.startsWith("FOLDER_") ||
          rawName.startsWith("SET_") ||
          rawName.startsWith("LOCAL_SET_")
        ) {
          continue;
        }
        const cleanName = rawName.split(/[\\/]/).pop() || rawName;
        const hash = typeof art === "object" && art?.hash ? String(art.hash).trim() : "";
        const artAuthor =
          typeof art === "object" && art?.author && String(art.author).toLowerCase() !== "unknown"
            ? String(art.author)
            : "";
        const verified = hash ? verifiedHashMap.get(hash) : undefined;
        const rawStatus = verified ? verified.status.toLowerCase().trim() : "";
        const isVerifiedStable =
          rawStatus === "stable" || rawStatus === "verified" || rawStatus === "approved";

        if (!hash || !verified) {
          violations.push({
            name: rawName,
            cleanName,
            hash,
            reason: "Unknown",
            tier: null,
            author: artAuthor || undefined,
          });
        } else if (verified.complianceTier !== 0) {
          violations.push({
            name: rawName,
            cleanName: verified.name || cleanName,
            hash,
            modId: verified.id,
            author: verified.author || artAuthor || undefined,
            status: verified.status,
            reason: `Tier ${verified.complianceTier}`,
            tier: verified.complianceTier,
          });
        } else if (!isVerifiedStable) {
          const reasonLabel =
            rawStatus === "unknown" || rawStatus === ""
              ? "Unknown"
              : rawStatus === "unverified"
                ? "Unverified"
                : rawStatus === "broken" || rawStatus === "corrupted"
                  ? "Corrupted"
                  : rawStatus === "unstable"
                    ? "Unstable"
                    : rawStatus === "under_review" || rawStatus === "under review"
                      ? "Under Review"
                      : "Unverified";
          violations.push({
            name: rawName,
            cleanName: verified.name || cleanName,
            hash,
            modId: verified.id,
            author: verified.author || artAuthor || undefined,
            status: verified.status,
            reason: reasonLabel,
            tier: verified.complianceTier,
          });
        } else {
          compliantArtifacts.push(art);
        }
      }
    }

    const isCompliant = violations.length === 0;
    const auditEntry: BlueprintComplianceAuditResult = {
      blueprintId: bp.id,
      isCompliant,
      violations,
      compliantArtifacts,
      totalRawCount: violations.length + compliantArtifacts.length,
    };
    results.set(bp.id, auditEntry);
    if (bp.id !== undefined && bp.id !== null) {
      results[String(bp.id)] = auditEntry;
    }

    if (options.autoFlagInDb && !isCompliant && bp.id) {
      const alreadyFlagged = options.existingPendingReportBpIds?.has(bp.id);
      if (!alreadyFlagged) {
        try {
          const { data: existingRows } = await supabaseClient
            .from("blueprint_reports")
            .select("id")
            .eq("blueprint_id", bp.id)
            .eq("status", "pending")
            .limit(1);

          if (!existingRows || existingRows.length === 0) {
            const reasonText = `Nexus Compliance Audit: Blueprint contains ${violations.length.toLocaleString()} non-Tier-0 or unverified artifact(s). Only verified Tier 0 artifacts with Stable status are permitted in Nexus Blueprints. Review and re-upload when compliant.`;

            await supabaseClient.from("blueprint_reports").insert([
              {
                blueprint_id: bp.id,
                reporter_name: "Sanctuary OS Automated Compliance",
                reason: reasonText,
                status: "pending",
              },
            ]);
          }

          if (bp.compliance_tier === 0 || bp.is_market_listed === true) {
            await supabaseClient
              .from("blueprints")
              .update({ compliance_tier: 1, is_market_listed: false })
              .eq("id", bp.id);
          }
        } catch (err) {
          console.warn("Automated blueprint compliance flag error:", err);
        }
      }
    }
  }

  return results;
}

export function groupBlueprintArtifactsByFamily(
  rawArtifacts: any[],
  options: {
    modList?: any[];
    activeGameSchema?: any;
    localVaultHashes?: Set<string>;
    cloudEnrichmentMap?: Map<string, any>;
  } = {}
): any[] {
  if (!Array.isArray(rawArtifacts) || rawArtifacts.length === 0) return [];

  const allVaultMods = Array.isArray(options.modList) ? options.modList : [];
  const activeGameSchema = options.activeGameSchema;
  const extRegex = getExtensionRegex(activeGameSchema);
  const localVaultHashes = options.localVaultHashes || new Set<string>();
  const cloudEnrichmentMap = options.cloudEnrichmentMap;

  const {
    localByHash,
    localByExact,
    localByFile,
    localByBase,
    virtualByFamilyId,
    parentByDbId,
  } = getOrBuildVaultLookup(allVaultMods, extRegex);

  const { nexusParentByHash, nexusParentByNorm } = getOrBuildNexusParentLookup();

  // Pre-scan counts for multi-module suites and shared folders
  let mcCount = 0;
  const subfolderCounts = new Map<string, number>();

  for (const item of rawArtifacts) {
    const rawStr = typeof item === "string" ? item : String(item?.name || item?.path || item?.id || "");
    if (!rawStr) continue;
    const filePart = rawStr.split(/[\\/]/).pop() || rawStr;
    const label = formatDisplayName(filePart, undefined, activeGameSchema).trim();
    if (
      /^mc[\s_-](cmd|command|career|cas|cheats|cleaner|clubs|control|dresser|gedcom|occult|population|pregnancy|tuner|woohoo)\b/i.test(
        label
      ) ||
      /\bmc\s*(cmd|command)\s*center\b/i.test(label)
    ) {
      mcCount++;
    }
    const sub = extractSpecificSubfolder(rawStr, activeGameSchema);
    if (sub) {
      const subKey = sub.toLowerCase();
      subfolderCounts.set(subKey, (subfolderCounts.get(subKey) || 0) + 1);
    }
  }

  const grouped = new Map<string, any>();

  for (let idx = 0; idx < rawArtifacts.length; idx++) {
    const rawItem = rawArtifacts[idx];
    const rawObj = typeof rawItem === "string" ? { name: rawItem } : rawItem || {};
    const rawPath = String(rawObj.name || rawObj.path || rawObj.id || "").trim();
    if (!rawPath) continue;

    const filePart = rawPath.split(/[\\/]/).pop() || rawPath;
    const fileLower = filePart.toLowerCase();
    const baseLower = fileLower.replace(extRegex, "");
    const normArtifactKey = getNormalizedArtifactName(filePart);

    const matchedLocal =
      (rawObj.hash && localByHash.get(rawObj.hash)) ||
      localByExact.get(rawPath.toLowerCase()) ||
      localByFile.get(fileLower) ||
      (baseLower ? localByBase.get(baseLower) : undefined);

    const cloudInfo = rawObj.hash ? cloudEnrichmentMap?.get(String(rawObj.hash)) : undefined;
    const nexusParent =
      (rawObj.hash && nexusParentByHash.get(String(rawObj.hash))) ||
      (normArtifactKey ? nexusParentByNorm.get(normArtifactKey) : undefined);

    const famIdRaw = String(
      cloudInfo?.familyId ||
        rawObj.baseFamilyId ||
        rawObj.familyId ||
        matchedLocal?.baseFamilyId ||
        matchedLocal?.familyId ||
        (nexusParent && (nexusParent.isParent || nexusParent.isVirtual) ? nexusParent.id : "") ||
        ""
    ).split("@")[0];

    const hasRealFamily = Boolean(
      famIdRaw &&
        famIdRaw !== "null" &&
        famIdRaw !== "undefined" &&
        !famIdRaw.startsWith("local_")
    );

    const familyParent =
      cloudInfo?.parentMod ||
      (hasRealFamily
        ? parentByDbId.get(famIdRaw) || virtualByFamilyId.get(famIdRaw) || nexusParent
        : null);

    const collectionObj =
      cloudInfo?.collection ||
      (nexusParent?.isCollection ? nexusParent : null) ||
      (matchedLocal?.setId ? virtualByFamilyId.get(`set_${matchedLocal.setId}`) : null);

    const resolvedAuthor = extractValidCreator(
      rawObj,
      cloudInfo?.dbMod,
      cloudInfo?.parentMod,
      collectionObj,
      matchedLocal,
      familyParent,
      nexusParent
    );

    const isOwned = Boolean(
      (rawObj.hash && localVaultHashes.has(rawObj.hash)) || matchedLocal
    );

    const cleanFileDisplay = formatDisplayName(filePart, undefined, activeGameSchema).trim();
    const cleanModuleTitle = formatCleanModTitle(cleanFileDisplay) || cleanFileDisplay;

    const modEntry: any = {
      ...(familyParent && !familyParent.isVirtual ? familyParent : {}),
      ...(matchedLocal || {}),
      ...(cloudInfo?.dbMod || {}),
      ...rawObj,
      id: rawObj.id || cloudInfo?.dbMod?.id || matchedLocal?.dbId || rawObj.hash || `${filePart}_${idx}`,
      dbId: cloudInfo?.dbMod?.id || matchedLocal?.dbId || rawObj.dbId,
      hash: rawObj.hash || matchedLocal?.hash,
      name: rawPath,
      displayName: cleanModuleTitle,
      _cleanFilePart: filePart,
      _cleanModuleTitle: cleanModuleTitle,
      _isOwned: isOwned,
      author: resolvedAuthor || undefined,
      master_author: resolvedAuthor || undefined,
      url:
        rawObj.url ||
        cloudInfo?.downloadUrl ||
        cloudInfo?.dbMod?.url ||
        cloudInfo?.parentMod?.url ||
        collectionObj?.url ||
        matchedLocal?.url ||
        familyParent?.url ||
        nexusParent?.url,
      image_url:
        rawObj.image_url ||
        cloudInfo?.dbMod?.image_url ||
        cloudInfo?.parentMod?.image_url ||
        collectionObj?.image_url ||
        matchedLocal?.image_url ||
        matchedLocal?.imageUrl ||
        familyParent?.image_url ||
        nexusParent?.image_url,
      version:
        rawObj.version ||
        cloudInfo?.versionLabel ||
        matchedLocal?.version,
      is_paid: Boolean(
        rawObj.is_paid ||
          cloudInfo?.dbMod?.is_paid ||
          cloudInfo?.parentMod?.is_paid ||
          nexusParent?.is_paid
      ),
      is_early_access: Boolean(
        rawObj.is_early_access ||
          cloudInfo?.dbMod?.is_early_access ||
          cloudInfo?.parentMod?.is_early_access ||
          nexusParent?.is_early_access
      ),
      load_order_index:
        typeof rawObj.load_order_index === "number" ? rawObj.load_order_index : idx,
      priority_tier: rawObj.priority_tier,
      load_rules: rawObj.load_rules,
    };

    const isMc =
      mcCount >= 1 &&
      (/^mc[\s_-](cmd|command|career|cas|cheats|cleaner|clubs|control|dresser|gedcom|occult|population|pregnancy|tuner|woohoo)\b/i.test(
        cleanFileDisplay
      ) ||
        /\bmc\s*(cmd|command)\s*center\b/i.test(cleanFileDisplay));

    const twinNormalized =
      formatCleanModTitle(normalizeModGroupTitle(cleanFileDisplay)) || cleanModuleTitle;
    const subFolder = extractSpecificSubfolder(rawPath, activeGameSchema);
    const hasSharedSubfolder = Boolean(
      subFolder && (subfolderCounts.get(subFolder.toLowerCase()) || 0) > 1
    );

    let groupKey: string;
    let displayTitle = twinNormalized;
    let isCollectionGroup = false;

    if (isMc) {
      groupKey = "__suite_mc_command_center__";
      displayTitle = "MC Command Center";
      if (!modEntry.author) {
        modEntry.author = "Deaderpool";
        modEntry.master_author = "Deaderpool";
      }
    } else if (collectionObj && (collectionObj.id || collectionObj.name)) {
      const colId = String(collectionObj.id || collectionObj.name).toLowerCase();
      groupKey = `__collection_${colId}__`;
      const rawColTitle = formatDisplayName(collectionObj.name || twinNormalized, undefined, activeGameSchema).trim();
      displayTitle = formatCleanModTitle(rawColTitle) || rawColTitle;
      isCollectionGroup = true;
    } else if (hasRealFamily) {
      groupKey = `__family_${famIdRaw}__`;
      const canonicalParentTitle = familyParent
        ? formatDisplayName(familyParent.displayName || familyParent.name || "", undefined, activeGameSchema).trim()
        : "";
      const normParent = normalizeModGroupTitle(canonicalParentTitle) || canonicalParentTitle;
      displayTitle = formatCleanModTitle(normParent) || twinNormalized;
    } else if (modEntry.flavorGroupId) {
      groupKey = `__flavor_${modEntry.flavorGroupId}__`;
      const fgTitle = formatDisplayName(modEntry.flavorGroupName || twinNormalized, undefined, activeGameSchema).trim();
      displayTitle = formatCleanModTitle(fgTitle) || twinNormalized;
    } else if (hasSharedSubfolder && subFolder) {
      groupKey = `__folder_${subFolder.toLowerCase()}__`;
      const folderClean = formatDisplayName(subFolder, undefined, activeGameSchema).trim();
      displayTitle =
        formatCleanModTitle(normalizeModGroupTitle(folderClean) || folderClean) ||
        twinNormalized;
    } else {
      groupKey = twinNormalized.toLowerCase();
      displayTitle = twinNormalized;
    }

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        ...modEntry,
        name: displayTitle,
        displayName: displayTitle,
        _groupedTitle: displayTitle,
        _rawFirstPath: rawPath,
        _moduleCount: 1,
        _groupedMods: [modEntry],
        _seenFileKeys: new Set<string>([`${modEntry.hash || ""}::${fileLower}`]),
        _ownedCount: isOwned ? 1 : 0,
        _allOwned: isOwned,
        isCollection: isCollectionGroup || Boolean(modEntry.isCollection),
        isParent: false,
      });
    } else {
      const existing = grouped.get(groupKey);
      const dedupFileKey = `${modEntry.hash || ""}::${fileLower}`;
      const sameFileNameAlready = existing._groupedMods.some(
        (gm: any) => String(gm._cleanFilePart || "").toLowerCase() === fileLower
      );
      if (!existing._seenFileKeys.has(dedupFileKey) && !sameFileNameAlready) {
        existing._seenFileKeys.add(dedupFileKey);
        existing._groupedMods.push(modEntry);
        existing._moduleCount = existing._groupedMods.length;
        existing.isParent = existing._groupedMods.length > 1;
        if (isOwned) existing._ownedCount = (existing._ownedCount || 0) + 1;
        existing._allOwned = existing._ownedCount === existing._groupedMods.length;
      }

      if (hasRealFamily && String(modEntry.dbId) === famIdRaw) {
        existing._groupedTitle = twinNormalized;
        existing.displayName = twinNormalized;
      }
      if (!isKnownCreatorName(existing.author) && isKnownCreatorName(modEntry.author)) {
        existing.author = modEntry.author;
        existing.master_author = modEntry.author;
      }
      if (!existing.url && modEntry.url) existing.url = modEntry.url;
      if (!existing.image_url && modEntry.image_url) existing.image_url = modEntry.image_url;
      if (!existing.version && modEntry.version) existing.version = modEntry.version;
      if (modEntry.is_paid) existing.is_paid = true;
      if (modEntry.is_early_access) existing.is_early_access = true;
    }
  }

  // Second pass: merge prefix-based Addons/Modules into their parent mod card in O(N log N)
  const entries = Array.from(grouped.values());
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const tStr = String(e._groupedTitle || "").trim();
    e._cleanTitle = tStr;
    e._lowerTitle = tStr.toLowerCase();
  }
  entries.sort((a, b) => (a._lowerTitle < b._lowerTitle ? -1 : a._lowerTitle > b._lowerTitle ? 1 : 0));

  const mergedOut = new Set<number>();

  for (let i = 0; i < entries.length; i++) {
    if (mergedOut.has(i)) continue;
    const parent = entries[i];
    const pTitle: string = parent._cleanTitle;
    if (pTitle.length < 4) continue;
    const pLower: string = parent._lowerTitle;

    for (let j = i + 1; j < entries.length; j++) {
      if (mergedOut.has(j)) continue;
      const candidate = entries[j];
      const cLower: string = candidate._lowerTitle;
      if (!cLower.startsWith(pLower)) break;

      const cTitle: string = candidate._cleanTitle;
      const isPrefixAddon =
        cLower.length > pLower.length &&
        /^(\s*[-:–_(\[]|\s+(addon|add-on|module|modules|pack|part|pt|script|scripts|tuning|strings|override|overrides)\b)/i.test(
          cTitle.slice(pTitle.length)
        );

      if (isPrefixAddon) {
        mergedOut.add(j);
        for (const cm of candidate._groupedMods || [candidate]) {
          const fLow = String(cm._cleanFilePart || cm.name || "").toLowerCase();
          const alreadyIn = parent._groupedMods.some(
            (gm: any) => String(gm._cleanFilePart || gm.name || "").toLowerCase() === fLow
          );
          if (!alreadyIn) {
            parent._groupedMods.push(cm);
            if (cm._isOwned) parent._ownedCount = (parent._ownedCount || 0) + 1;
          }
        }
        parent._moduleCount = parent._groupedMods.length;
        parent.isParent = parent._groupedMods.length > 1;
        parent._allOwned = parent._ownedCount === parent._groupedMods.length;
        if (!isKnownCreatorName(parent.author) && isKnownCreatorName(candidate.author)) {
          parent.author = candidate.author;
          parent.master_author = candidate.author;
        }
        if (!parent.url && candidate.url) parent.url = candidate.url;
        if (!parent.image_url && candidate.image_url) parent.image_url = candidate.image_url;
        if (candidate.is_paid) parent.is_paid = true;
        if (candidate.is_early_access) parent.is_early_access = true;
      }
    }
  }

  // Third pass: group ungrouped items that share an explicit pack tag suffix like "(MAX20)" or "[QICC] SetName"
  const remaining = entries.filter((_, idx) => !mergedOut.has(idx));
  const packTagBuckets = new Map<string, { label: string; indices: number[] }>();

  remaining.forEach((entry, idx) => {
    if ((entry._groupedMods?.length || 1) > 1) return;
    const title = String(entry._groupedTitle || "").trim();
    // Match trailing pack tag e.g. "Armchair Provence (MAX20)" -> "MAX20"
    const suffixMatch = title.match(/\(([A-Za-z0-9][A-Za-z0-9\s_-]{2,22})\)$/);
    if (suffixMatch) {
      const tag = suffixMatch[1].trim();
      if (!/^(v\d|ep\d|gp\d|sp\d|fp\d|base|hq|nonhq|alt|mesh|addon|script)/i.test(tag)) {
        const key = `suffix_${tag.toLowerCase()}`;
        if (!packTagBuckets.has(key)) {
          packTagBuckets.set(key, { label: formatCleanModTitle(tag), indices: [] });
        }
        packTagBuckets.get(key)!.indices.push(idx);
        return;
      }
    }
    // Match leading bracketed creator/pack + 2 words e.g. "[QICC] Lively Living Room ..."
    const bracketMatch = title.match(/^(\[[^\]]{2,20}\]\s+[A-Za-z0-9']+(?:\s+[A-Za-z0-9']+){1,2})\b/);
    if (bracketMatch) {
      const prefix = bracketMatch[1].trim();
      const key = `bprefix_${prefix.toLowerCase()}`;
      if (!packTagBuckets.has(key)) {
        packTagBuckets.set(key, { label: formatCleanModTitle(prefix), indices: [] });
      }
      packTagBuckets.get(key)!.indices.push(idx);
    }
  });

  const bucketMergedIndices = new Set<number>();
  const finalResult: any[] = [];

  packTagBuckets.forEach((bucket) => {
    if (bucket.indices.length < 2) return;
    const firstIdx = bucket.indices[0];
    const baseEntry = { ...remaining[firstIdx] };
    const combinedMods: any[] = [];
    let ownedCount = 0;

    bucket.indices.forEach((bIdx) => {
      bucketMergedIndices.add(bIdx);
      const item = remaining[bIdx];
      for (const gm of item._groupedMods || [item]) {
        combinedMods.push(gm);
        if (gm._isOwned) ownedCount++;
      }
      if (!isKnownCreatorName(baseEntry.author) && isKnownCreatorName(item.author)) {
        baseEntry.author = item.author;
        baseEntry.master_author = item.author;
      }
      if (item.is_paid) baseEntry.is_paid = true;
      if (item.is_early_access) baseEntry.is_early_access = true;
    });

    baseEntry._groupedTitle = bucket.label;
    baseEntry.displayName = bucket.label;
    baseEntry.name = bucket.label;
    baseEntry._groupedMods = combinedMods;
    baseEntry._moduleCount = combinedMods.length;
    baseEntry._ownedCount = ownedCount;
    baseEntry._allOwned = ownedCount === combinedMods.length;
    baseEntry.isParent = true;
    finalResult.push(baseEntry);
  });

  remaining.forEach((entry, idx) => {
    if (!bucketMergedIndices.has(idx)) {
      finalResult.push(entry);
    }
  });

  return finalResult;
}

export function BlueprintInspectorModCard({
  mod,
  onOpenDossier,
  activeGameSchema,
  t,
  showLoadOrderChip = false,
}: {
  mod: any;
  onOpenDossier?: (mod: any) => void;
  activeGameSchema?: any;
  t: (key: string, fallback?: string) => string;
  showLoadOrderChip?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const showImages = useStore((state: any) => state.showImages);

  const groupedMods: any[] =
    Array.isArray(mod._groupedMods) && mod._groupedMods.length > 0
      ? mod._groupedMods
      : [mod];

  const rawTitle =
    mod._groupedTitle ||
    formatDisplayName(mod.displayName || mod.name || "", undefined, activeGameSchema);
  const title = formatCleanModTitle(rawTitle) || rawTitle;

  const image =
    showImages &&
    (mod.image_url || mod.imageUrl) &&
    String(mod.image_url || mod.imageUrl) !== "null" &&
    String(mod.image_url || mod.imageUrl).trim() !== ""
      ? mod.image_url || mod.imageUrl
      : undefined;

  const modIcon = getModIcon(mod, activeGameSchema, t);
  const validCreator = extractValidCreator(mod, ...groupedMods);

  const hasScriptFile = groupedMods.some((gm) =>
    /\.ts4script$/i.test(String(gm?._cleanFilePart || gm?.name || ""))
  );
  const typeLabel = mod.isCollection
    ? t("collection", "Collection")
    : groupedMods.length > 1
      ? t("suite_label", "Suite")
      : hasScriptFile
        ? t("type_script", "Script")
        : t("type_package", "Package");

  const hasRealVersion = Boolean(
    mod.version &&
      String(mod.version).trim() !== "" &&
      String(mod.version).toLowerCase() !== "v.local" &&
      String(mod.version).toLowerCase() !== "vlocal" &&
      String(mod.version).toLowerCase() !== "local" &&
      String(mod.version).toLowerCase() !== "unknown"
  );
  const cleanVer = hasRealVersion
    ? String(mod.version).replace(/^v\.?/i, "").trim()
    : null;

  const ownedCount =
    typeof mod._ownedCount === "number"
      ? mod._ownedCount
      : groupedMods.filter((gm) => gm._isOwned).length;
  const allOwned = ownedCount >= groupedMods.length && groupedMods.length > 0;

  const targetUrl = getModFallbackUrl(
    title || mod._cleanFilePart || mod.name || "",
    mod.hash,
    activeGameSchema,
    { url: mod.url, author: validCreator || undefined }
  );

  const seqNum =
    typeof mod.load_order_index === "number" ? mod.load_order_index + 1 : null;

  return (
    <div
      onClick={() => {
        if (!onOpenDossier && groupedMods.length > 1) {
          setIsExpanded((prev) => !prev);
          return;
        }
        onOpenDossier?.({
          ...mod,
          name: mod._rawFirstPath || mod.name,
          displayName: title,
          flavors: groupedMods.length > 1 ? groupedMods : undefined,
          isParent: groupedMods.length > 1,
          isVirtual: groupedMods.length > 1 ? true : mod.isVirtual,
          isNexusView: true,
        });
      }}
      className={`glass-panel rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] flex flex-col justify-between gap-3 transition-all duration-200 cursor-pointer group relative ${
        isExpanded && groupedMods.length > 1 ? "md:col-span-2" : ""
      }`}
    >
      {/* Top Tier: Icon Well + Clean Title + Creator & Module Metadata */}
      <div className="flex items-center gap-3 min-w-0 w-full">
        {image ? (
          <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
            <img src={image} alt={title} className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)]">
            <span className="material-symbols-outlined !text-[20px]">{modIcon}</span>
          </div>
        )}

        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <div className="relative group/modtitle flex items-center min-w-0 w-fit max-w-full">
            <span className="text-sm font-black text-[var(--text)] tracking-tight leading-snug truncate group-hover:text-[var(--accent)] transition-colors">
              {title}
            </span>
            <HoverTooltip className="z-[100]" title={title} icon={modIcon} />
          </div>

          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--subtext)] min-w-0">
            {validCreator && (
              <>
                <span className="truncate opacity-85">
                  {formatCleanModTitle(validCreator)}
                </span>
                <span className="opacity-40 shrink-0">•</span>
              </>
            )}
            <span className="opacity-85 shrink-0">{typeLabel}</span>
            {groupedMods.length > 1 && (
              <>
                <span className="opacity-40 shrink-0">•</span>
                <span className="opacity-85 shrink-0">
                  {groupedMods.length} {t("badge_modules_count", "Modules")}
                </span>
              </>
            )}
            {cleanVer && (
              <>
                <span className="opacity-40 shrink-0">•</span>
                <span className="font-mono text-[10px] font-bold text-[var(--subtext)] opacity-85 shrink-0">
                  v{cleanVer}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Row: Status Badges on Left | Compact Action Buttons on Right */}
      <div className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          {showLoadOrderChip && seqNum !== null && (
            <span className={`${VAULT_CHIP_CLASS} tabular-nums`}>
              <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--accent)]">
                {t("icon_tag", "tag")}
              </span>
              <span>#{String(seqNum).padStart(3, "0")}</span>
            </span>
          )}

          {allOwned ? (
            <span className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--success)]">
                {t("icon_check_circle", "check_circle")}
              </span>
              <span>{t("status_in_vault", "In {Vault}")}</span>
            </span>
          ) : ownedCount > 0 ? (
            <span className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--warning)]">
                {t("icon_timelapse", "timelapse")}
              </span>
              <span>
                {ownedCount}/{groupedMods.length} {t("status_in_vault", "In {Vault}")}
              </span>
            </span>
          ) : (
            <span className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--accent)]">
                {t("icon_download", "download")}
              </span>
              <span>{t("sig_queue_badge_missing", "Acquire")}</span>
            </span>
          )}

          {mod.is_early_access && (
            <span className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--accent)]">
                {t("icon_science", "science")}
              </span>
              <span>{t("badge_early_access", "Early Access")}</span>
            </span>
          )}

          {mod.is_paid && (
            <span className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--warning)]">
                {t("icon_monetization_on", "monetization_on")}
              </span>
              <span>{t("badge_paid", "Paid")}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          {groupedMods.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded((prev) => !prev);
              }}
              className={`relative group/actionbtn w-7 h-7 rounded-lg glass-surface border flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                isExpanded
                  ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)]"
                  : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)]"
              }`}
            >
              <span className="material-symbols-outlined !text-[15px]">
                {t("icon_account_tree", "account_tree")}
              </span>
              <HoverTooltip
                className="z-[100] !right-0 !translate-x-0 !left-auto"
                title={`${groupedMods.length} ${t("badge_modules_count", "Modules")}`}
                icon={t("icon_account_tree", "account_tree")}
              />
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenUrl(targetUrl);
            }}
            className="relative group/actionbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined !text-[14px]">
              {t("icon_open_in_new", "open_in_new")}
            </span>
            <HoverTooltip
              className="z-[100] !right-0 !translate-x-0 !left-auto"
              title={t("import_intel", "Open Creator Page")}
              icon={t("icon_open_in_new", "open_in_new")}
            />
          </button>
        </div>
      </div>

      {/* Recessed Linked Modules Tray */}
      {isExpanded && groupedMods.length > 1 && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] animate-in fade-in slide-in-from-top-1 duration-200"
        >
          <div className="max-h-[210px] overflow-y-auto custom-scrollbar pr-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {groupedMods.map((gm: any, gIdx: number) => {
                const gmName =
                  gm._cleanModuleTitle ||
                  formatAddonModuleName(gm, activeGameSchema) ||
                  formatCleanModTitle(
                    formatDisplayName(
                      gm._cleanFilePart || gm.displayName || gm.name || "",
                      undefined,
                      activeGameSchema
                    )
                  );
                const gmIsScript = /\.ts4script$/i.test(
                  String(gm?._cleanFilePart || gm?.name || "")
                );
                const gmOwned = Boolean(gm._isOwned);

                return (
                  <div
                    key={`${gm.hash || gm.name || gIdx}-${gIdx}`}
                    onClick={() =>
                      onOpenDossier?.({
                        ...gm,
                        name: gm.name,
                        displayName: gmName,
                        isNexusView: true,
                      })
                    }
                    className="glass-surface rounded-lg px-3 py-2 border border-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)] flex items-center justify-between gap-2 transition-all cursor-pointer group/gm"
                  >
                    <div className="relative group/gmtitle flex items-center gap-2 min-w-0 flex-1">
                      <span className="material-symbols-outlined !text-[14px] text-[var(--accent)] shrink-0">
                        {gmIsScript
                          ? t("icon_terminal", "terminal")
                          : t("icon_deployed_code", "deployed_code")}
                      </span>
                      <span className="text-xs font-bold text-[var(--text)] group-hover/gm:text-[var(--accent)] transition-colors truncate">
                        {gmName}
                      </span>
                      <HoverTooltip
                        className="z-[100]"
                        title={gmName}
                        icon={
                          gmIsScript
                            ? t("icon_terminal", "terminal")
                            : t("icon_deployed_code", "deployed_code")
                        }
                      />
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] font-semibold text-[var(--subtext)] opacity-70">
                        {gmIsScript
                          ? t("type_script", "Script")
                          : t("type_package", "Package")}
                      </span>
                      <span
                        className={`material-symbols-outlined !text-[13px] ${
                          gmOwned
                            ? "text-[var(--success)]"
                            : "text-[var(--subtext)] opacity-45"
                        }`}
                      >
                        {gmOwned
                          ? t("icon_check_circle", "check_circle")
                          : t("icon_download", "download")}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function MarketBlueprintPanel({
  selectedBlueprint,
  setSelectedBlueprint,
  onOpenDossier,
  syncBlueprintByCode,
  onDownloadSuccess,
  backdropZ = "z-[15000]",
  panelZ = "z-[15001]",
}: any) {
  const { t } = useLexicon();

  const [enrichedBlueprint, setEnrichedBlueprint] = useState(selectedBlueprint);
  const [cloudEnrichmentMap, setCloudEnrichmentMap] = useState<Map<string, any>>(
    () => new Map()
  );
  const [visibleCount, setVisibleCount] = useState(40);
  const [filterTab, setFilterTab] = useState<"ALL" | "MISSING" | "IN_VAULT">("ALL");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "PACKAGE" | "SCRIPT" | "SUITE">("ALL");
  const [accessFilter, setAccessFilter] = useState<"ALL" | "FREE" | "EARLY_ACCESS" | "PAID">("ALL");
  const [creatorFilter, setCreatorFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<
    "default" | "name_asc" | "creator_asc" | "modules_desc" | "load_order"
  >("default");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const modList = useStore((state) => state.modList);
  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const playSets = useStore((state) => state.playSets) || [];

  const localVaultHashes = useMemo(() => {
    const hashes = new Set<string>();
    (modList || []).forEach((m: any) => {
      if (m?.hash) hashes.add(m.hash);
      if (Array.isArray(m?.flavors)) {
        m.flavors.forEach((fl: any) => {
          if (fl?.hash) hashes.add(fl.hash);
        });
      }
    });
    return hashes;
  }, [modList]);

  const allGroupedFamilies = useMemo(() => {
    const rawArtifacts =
      enrichedBlueprint?.json_data?.artifacts ||
      enrichedBlueprint?.artifacts ||
      enrichedBlueprint?.originalBlueprint?.artifacts ||
      [];
    const grouped = groupBlueprintArtifactsByFamily(rawArtifacts, {
      modList,
      activeGameSchema,
      localVaultHashes,
      cloudEnrichmentMap,
    });
    return grouped.sort((a: any, b: any) => {
      const aPremium = a.is_paid || a.is_early_access ? 1 : 0;
      const bPremium = b.is_paid || b.is_early_access ? 1 : 0;
      if (aPremium !== bPremium) return bPremium - aPremium;
      return String(a._groupedTitle || a.name || "").localeCompare(
        String(b._groupedTitle || b.name || "")
      );
    });
  }, [enrichedBlueprint, modList, activeGameSchema, localVaultHashes, cloudEnrichmentMap]);

  const missingFamiliesCount = useMemo(
    () => allGroupedFamilies.filter((f: any) => !f._allOwned).length,
    [allGroupedFamilies]
  );

  const availableCreators = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of allGroupedFamilies) {
      const c = extractValidCreator(f, ...(Array.isArray(f._groupedMods) ? f._groupedMods : []));
      if (c) {
        const clean = formatCleanModTitle(c) || c;
        counts.set(clean, (counts.get(clean) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ id: name, label: `${name} (${count})` }));
  }, [allGroupedFamilies]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filterTab !== "ALL") count++;
    if (typeFilter !== "ALL") count++;
    if (accessFilter !== "ALL") count++;
    if (creatorFilter !== "ALL") count++;
    if (sortBy !== "default") count++;
    return count;
  }, [filterTab, typeFilter, accessFilter, creatorFilter, sortBy]);

  const resetAllFilters = () => {
    setFilterTab("ALL");
    setTypeFilter("ALL");
    setAccessFilter("ALL");
    setCreatorFilter("ALL");
    setSortBy("default");
    setVisibleCount(40);
  };

  const displayArtifacts = useMemo(() => {
    let filtered = allGroupedFamilies;
    if (filterTab === "MISSING") {
      filtered = filtered.filter((f: any) => !f._allOwned);
    } else if (filterTab === "IN_VAULT") {
      filtered = filtered.filter((f: any) => Boolean(f._allOwned));
    }

    if (typeFilter !== "ALL") {
      filtered = filtered.filter((f: any) => {
        const gMods = Array.isArray(f._groupedMods) && f._groupedMods.length > 0 ? f._groupedMods : [f];
        const hasScript = gMods.some((gm: any) =>
          /\.ts4script$/i.test(String(gm?._cleanFilePart || gm?.name || ""))
        );
        const isSuite = Boolean(f.isCollection || gMods.length > 1);
        if (typeFilter === "SUITE") return isSuite;
        if (typeFilter === "SCRIPT") return hasScript;
        if (typeFilter === "PACKAGE") return !hasScript && !isSuite;
        return true;
      });
    }

    if (accessFilter !== "ALL") {
      filtered = filtered.filter((f: any) => {
        if (accessFilter === "PAID") return Boolean(f.is_paid);
        if (accessFilter === "EARLY_ACCESS") return Boolean(f.is_early_access);
        if (accessFilter === "FREE") return !f.is_paid && !f.is_early_access;
        return true;
      });
    }

    if (creatorFilter !== "ALL") {
      filtered = filtered.filter((f: any) => {
        const c = extractValidCreator(f, ...(Array.isArray(f._groupedMods) ? f._groupedMods : []));
        const clean = c ? formatCleanModTitle(c) || c : "";
        return clean.toLowerCase() === creatorFilter.toLowerCase();
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter((f: any) => {
        if (String(f._groupedTitle || f.name || "").toLowerCase().includes(q)) {
          return true;
        }
        if (String(f.author || "").toLowerCase().includes(q)) {
          return true;
        }
        if (Array.isArray(f._groupedMods)) {
          return f._groupedMods.some(
            (gm: any) =>
              String(gm._cleanModuleTitle || "").toLowerCase().includes(q) ||
              String(gm._cleanFilePart || gm.name || "").toLowerCase().includes(q) ||
              String(gm.author || "").toLowerCase().includes(q)
          );
        }
        return false;
      });
    }

    if (sortBy !== "default") {
      filtered = [...filtered].sort((a: any, b: any) => {
        if (sortBy === "name_asc") {
          return String(a._groupedTitle || a.name || "").localeCompare(
            String(b._groupedTitle || b.name || "")
          );
        }
        if (sortBy === "creator_asc") {
          const ca =
            extractValidCreator(a, ...(Array.isArray(a._groupedMods) ? a._groupedMods : [])) ||
            "zzzz";
          const cb =
            extractValidCreator(b, ...(Array.isArray(b._groupedMods) ? b._groupedMods : [])) ||
            "zzzz";
          const cmp = ca.localeCompare(cb);
          if (cmp !== 0) return cmp;
          return String(a._groupedTitle || a.name || "").localeCompare(
            String(b._groupedTitle || b.name || "")
          );
        }
        if (sortBy === "modules_desc") {
          const ma = Number(a._moduleCount || a._groupedMods?.length || 1);
          const mb = Number(b._moduleCount || b._groupedMods?.length || 1);
          if (mb !== ma) return mb - ma;
          return String(a._groupedTitle || a.name || "").localeCompare(
            String(b._groupedTitle || b.name || "")
          );
        }
        if (sortBy === "load_order") {
          const la = typeof a.load_order_index === "number" ? a.load_order_index : 999999;
          const lb = typeof b.load_order_index === "number" ? b.load_order_index : 999999;
          return la - lb;
        }
        return 0;
      });
    }

    return filtered;
  }, [
    allGroupedFamilies,
    filterTab,
    typeFilter,
    accessFilter,
    creatorFilter,
    searchQuery,
    sortBy,
  ]);

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
      setCloudEnrichmentMap(new Map());
      return;
    }

    let cancelled = false;
    let enrichTimer: ReturnType<typeof setTimeout> | null = null;

    const processBlueprint = (bp: any) => {
      let parsedJson = bp.json_data;
      if (typeof parsedJson === "string") {
        try {
          parsedJson = JSON.parse(parsedJson);
        } catch {
          parsedJson = {};
        }
      }
      parsedJson = parsedJson || {};
      parsedJson.artifacts =
        parsedJson.artifacts ||
        bp.artifacts ||
        selectedBlueprint.originalBlueprint?.artifacts ||
        selectedBlueprint.artifacts ||
        [];

      if (!cancelled) {
        setEnrichedBlueprint({
          ...selectedBlueprint,
          ...bp,
          master_author: selectedBlueprint.master_author || bp.master_author,
          author: selectedBlueprint.author || bp.author,
          json_data: parsedJson,
        });
        setVisibleCount(40);
      }

      const fetchCloudMetadataAndFamilies = async () => {
        const artifacts = parsedJson.artifacts || [];
        const hashes: string[] = Array.from(
          new Set(artifacts.map((a: any) => a?.hash).filter(Boolean))
        );
        if (hashes.length === 0) return;

        const chunkSize = 200;
        const verPromises = [];
        for (let i = 0; i < hashes.length; i += chunkSize) {
          const chunk = hashes.slice(i, i + chunkSize);
          verPromises.push(
            supabase
              .from("mod_versions")
              .select(
                "dna_hash, version_label, download_url, mods(id, name, master_author, category_override, image_url, url, is_paid, is_early_access)"
              )
              .in("dna_hash", chunk)
          );
        }

        const verResults = await Promise.all(verPromises);
        if (cancelled) return;

        const hashRows: any[] = [];
        const modIdsSet = new Set<string>();
        const modsById = new Map<string, any>();

        verResults.forEach(({ data, error }) => {
          if (!error && Array.isArray(data)) {
            data.forEach((d: any) => {
              const dbMod = Array.isArray(d.mods) ? d.mods[0] : d.mods;
              if (dbMod?.id) {
                modIdsSet.add(String(dbMod.id));
                modsById.set(String(dbMod.id), dbMod);
              }
              hashRows.push({
                dna_hash: d.dna_hash,
                versionLabel: d.version_label,
                downloadUrl: d.download_url,
                dbMod,
              });
            });
          }
        });

        const modIds = Array.from(modIdsSet);
        const childToParentId = new Map<string, string>();
        const modToCollection = new Map<string, any>();

        if (modIds.length > 0) {
          const relPromises = [];
          const colPromises = [];
          for (let i = 0; i < modIds.length; i += chunkSize) {
            const idChunk = modIds.slice(i, i + chunkSize);
            relPromises.push(
              supabase
                .from("mod_relationships")
                .select("child_id, parent_id, relationship_type")
                .in("child_id", idChunk)
                .in("relationship_type", ["twin", "addon", "flavor", "set_item", "beta"])
            );
            colPromises.push(
              supabase
                .from("collection_members")
                .select("mod_id, set_id, collections(id, name, creator_name, image_url, url)")
                .in("mod_id", idChunk)
            );
          }

          const [relResults, colResults] = await Promise.all([
            Promise.all(relPromises),
            Promise.all(colPromises),
          ]);
          if (cancelled) return;

          const missingParentIds = new Set<string>();
          relResults.forEach(({ data }) => {
            if (Array.isArray(data)) {
              data.forEach((r: any) => {
                if (r.child_id && r.parent_id) {
                  const pId = String(r.parent_id);
                  childToParentId.set(String(r.child_id), pId);
                  if (!modsById.has(pId)) missingParentIds.add(pId);
                }
              });
            }
          });

          colResults.forEach(({ data }) => {
            if (Array.isArray(data)) {
              data.forEach((c: any) => {
                const col = Array.isArray(c.collections) ? c.collections[0] : c.collections;
                if (c.mod_id && col) {
                  modToCollection.set(String(c.mod_id), col);
                }
              });
            }
          });

          if (missingParentIds.size > 0) {
            const parentChunk = Array.from(missingParentIds);
            const { data: pMods } = await supabase
              .from("mods")
              .select("id, name, master_author, category_override, image_url, url, is_paid, is_early_access")
              .in("id", parentChunk.slice(0, 200));
            if (Array.isArray(pMods)) {
              pMods.forEach((pm: any) => {
                if (pm?.id) modsById.set(String(pm.id), pm);
              });
            }
          }
        }

        if (cancelled) return;

        const nextMap = new Map<string, any>();
        let anyPaid = false;
        let anyEarlyAccess = false;

        hashRows.forEach((row) => {
          const modId = row.dbMod?.id ? String(row.dbMod.id) : null;
          const parentId = modId ? childToParentId.get(modId) || modId : null;
          const parentMod = parentId ? modsById.get(parentId) : null;
          const collection = modId ? modToCollection.get(modId) : null;

          if (row.dbMod?.is_paid || parentMod?.is_paid) anyPaid = true;
          if (row.dbMod?.is_early_access || parentMod?.is_early_access) {
            anyEarlyAccess = true;
          }

          nextMap.set(String(row.dna_hash), {
            dbMod: row.dbMod,
            parentMod,
            familyId: parentId,
            collection,
            versionLabel: row.versionLabel,
            downloadUrl: row.downloadUrl,
          });
        });

        setCloudEnrichmentMap(nextMap);
        if (anyPaid || anyEarlyAccess) {
          setEnrichedBlueprint((prev: any) =>
            prev
              ? {
                  ...prev,
                  is_paid: prev.is_paid || anyPaid,
                  is_early_access: prev.is_early_access || anyEarlyAccess,
                }
              : null
          );
        }
      };

      if (enrichTimer) clearTimeout(enrichTimer);
      enrichTimer = setTimeout(() => {
        if (!cancelled) fetchCloudMetadataAndFamilies();
      }, 60);
    };

    if (
      selectedBlueprint.json_data === undefined &&
      !selectedBlueprint.originalBlueprint?.artifacts &&
      !selectedBlueprint.artifacts
    ) {
      supabase
        .from("blueprints")
        .select("*")
        .eq("id", selectedBlueprint.id)
        .single()
        .then(({ data }) => {
          if (cancelled) return;
          if (data) {
            processBlueprint(data);
          } else {
            processBlueprint(selectedBlueprint);
          }
        });
    } else {
      processBlueprint(selectedBlueprint);
      if (selectedBlueprint.json_data === undefined && selectedBlueprint.id) {
        supabase
          .from("blueprints")
          .select("*")
          .eq("id", selectedBlueprint.id)
          .single()
          .then(({ data }) => {
            if (!cancelled && data) {
              processBlueprint(data);
            }
          });
      }
    }

    return () => {
      cancelled = true;
      if (enrichTimer) clearTimeout(enrichTimer);
    };
  }, [selectedBlueprint]);

  if (!enrichedBlueprint) return null;

  return (
    <>
      <SidePanel
        isOpen={true}
        onClose={() => setSelectedBlueprint(null)}
        widthClass="w-[90vw] md:w-[760px]"
        backdropZ={backdropZ}
        panelZ={panelZ}
        icon={t("icon_map", "map")}
        iconColorClass="text-[var(--accent)]"
        title={t("blueprint_inspector", "Blueprint Inspector")}
        subtitle={t("blueprint_desc", "{Mod} metadata and Asset repository")}
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
            badge={`${allGroupedFamilies.length} ${t("term_mods", "{Mods}")}`}
            badgeIcon={t("icon_inventory_2", "inventory_2")}
            variant={enrichedBlueprint.is_paid ? "warning" : "accent"}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {enrichedBlueprint.is_early_access && (
                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--accent)]">
                      {t("icon_science", "science")}
                    </span>
                    {t("badge_early_access", "Early Access")}
                  </span>
                )}
                {enrichedBlueprint.is_paid && (
                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--warning)]">
                      {t("icon_monetization_on", "monetization_on")}
                    </span>
                    {t("badge_paid", "Paid")}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 ml-auto">
                {!isDesktop() ? (
                  <ActionButton
                    variant="accent"
                    icon={t("icon_phonelink", "phonelink")}
                    label={t("staging_btn_stage_blueprint", "Stage {Blueprint} to PC")}
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
                  />
                ) : (
                  <ActionButton
                    variant="accent"
                    icon={
                      isSyncing
                        ? t("icon_sync", "sync")
                        : t("icon_download", "download")
                    }
                    label={
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
                  />
                )}
              </div>
            </div>
          </SidePanelHeroCard>

          <UniversalGroup
            title={t("tab_metadata", "Metadata & Telemetry")}
            icon={t("icon_analytics", "analytics")}
          >
            <div className="grid grid-cols-2 gap-3">
              <StatBox
                label={t("role_creator", "Creator")}
                value={
                  enrichedBlueprint.creator_name ||
                  enrichedBlueprint.master_author ||
                  enrichedBlueprint.author ||
                  t("role_citizen", "{Citizen}")
                }
                icon={t("icon_person", "person")}
                iconColorClass="text-[var(--accent)]"
              />
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
          </UniversalGroup>

          <div className="grid grid-cols-2 gap-3">
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_inventory_2", "inventory_2")}
              label={t("filter_all", "Global")}
              value={allGroupedFamilies.length}
              isActive={filterTab === "ALL"}
              onClick={() => {
                setFilterTab("ALL");
                setVisibleCount(40);
              }}
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_rule", "rule")}
              label={t("filter_missing", "Missing Only")}
              value={missingFamiliesCount}
              isActive={filterTab === "MISSING"}
              onClick={() => {
                setFilterTab("MISSING");
                setVisibleCount(40);
              }}
            />
          </div>

          <ActionPill
            searchQuery={searchQuery}
            setSearchQuery={(val: string) => {
              setSearchQuery(val);
              setVisibleCount(40);
            }}
            searchPlaceholder={t("search_ph", "Search {mods}...")}
            primaryPopover={{
              icon: t("icon_tune", "tune"),
              label:
                activeFiltersCount > 0
                  ? `${t("filters", "Filters")} (${activeFiltersCount})`
                  : t("filters", "Filters"),
              content: (
                <div className="flex flex-col w-[450px] p-3.5 max-w-[calc(100vw-40px)] gap-3">
                  {/* Sort By */}
                  <div className="flex flex-col w-full">
                    <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-1.5 px-1 flex items-center gap-2">
                      {t("sort_by", "Sort By")}
                      <div className="h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex-1" />
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {[
                        { id: "default", label: t("sort_default", "Default") },
                        { id: "name_asc", label: t("sort_name", "Name (A-Z)") },
                        { id: "creator_asc", label: t("sort_author", "{Mason} (A-Z)") },
                        { id: "modules_desc", label: t("sort_modules_desc", "Most Modules") },
                        { id: "load_order", label: t("sort_load_order", "Load Order") },
                      ].map((opt) => {
                        const active = sortBy === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setSortBy(opt.id as any);
                              setVisibleCount(40);
                            }}
                            className={`sa-dropdown-item flex items-center justify-between gap-2.5 px-3 py-1.5 text-[11px] capitalize tracking-wide text-left cursor-pointer ${
                              active ? "is-selected font-bold" : "font-semibold"
                            }`}
                          >
                            <span className="truncate">{opt.label}</span>
                            {active && (
                              <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
                                {t("icon_check", "check")}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Vault Status */}
                  <div className="flex flex-col w-full">
                    <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-1.5 px-1 flex items-center gap-2">
                      {t("filter_status", "Filter Status")}
                      <div className="h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex-1" />
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {[
                        { id: "ALL", label: t("filter_all", "Global") },
                        { id: "MISSING", label: t("filter_missing", "Missing Only") },
                        { id: "IN_VAULT", label: t("status_in_vault", "In {Vault}") },
                      ].map((opt) => {
                        const active = filterTab === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setFilterTab(opt.id as any);
                              setVisibleCount(40);
                            }}
                            className={`sa-dropdown-item flex items-center justify-between gap-2 px-3 py-1.5 text-[11px] capitalize tracking-wide text-left cursor-pointer ${
                              active ? "is-selected font-bold" : "font-semibold"
                            }`}
                          >
                            <span className="truncate">{opt.label}</span>
                            {active && (
                              <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
                                {t("icon_check", "check")}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Module Type */}
                  <div className="flex flex-col w-full">
                    <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-1.5 px-1 flex items-center gap-2">
                      {t("filter_type", "Type")}
                      <div className="h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex-1" />
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {[
                        { id: "ALL", label: t("filter_all_types", "All Types") },
                        { id: "PACKAGE", label: t("type_package", "Package") },
                        { id: "SCRIPT", label: t("type_script", "Script") },
                        { id: "SUITE", label: t("suite_label", "Suite") },
                      ].map((opt) => {
                        const active = typeFilter === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setTypeFilter(opt.id as any);
                              setVisibleCount(40);
                            }}
                            className={`sa-dropdown-item flex items-center justify-between gap-2.5 px-3 py-1.5 text-[11px] capitalize tracking-wide text-left cursor-pointer ${
                              active ? "is-selected font-bold" : "font-semibold"
                            }`}
                          >
                            <span className="truncate">{opt.label}</span>
                            {active && (
                              <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
                                {t("icon_check", "check")}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Access Tier */}
                  <div className="flex flex-col w-full">
                    <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-1.5 px-1 flex items-center gap-2">
                      {t("filter_access_tier", "Access Tier")}
                      <div className="h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex-1" />
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {[
                        { id: "ALL", label: t("filter_all", "All") },
                        { id: "FREE", label: t("standard_artifacts", "Standard {Mods}") },
                        { id: "EARLY_ACCESS", label: t("badge_early_access", "Early Access") },
                        { id: "PAID", label: t("badge_paid", "Paid") },
                      ].map((opt) => {
                        const active = accessFilter === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setAccessFilter(opt.id as any);
                              setVisibleCount(40);
                            }}
                            className={`sa-dropdown-item flex items-center justify-between gap-2.5 px-3 py-1.5 text-[11px] capitalize tracking-wide text-left cursor-pointer ${
                              active ? "is-selected font-bold" : "font-semibold"
                            }`}
                          >
                            <span className="truncate">{opt.label}</span>
                            {active && (
                              <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
                                {t("icon_check", "check")}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Creator Dropdown */}
                  {availableCreators.length > 0 && (
                    <div className="flex flex-col w-full">
                      <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-2 px-1 flex items-center gap-2">
                        {t("role_creator", "Creator")}
                        <div className="h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex-1" />
                      </div>
                      <div className="h-10 w-full relative z-[60]">
                        <CustomDropdown
                          disableTint={true}
                          flat={true}
                          variant="pill"
                          value={creatorFilter}
                          onChange={(val: string[]) => {
                            setCreatorFilter(val[0] || "ALL");
                            setVisibleCount(40);
                          }}
                          options={[
                            { id: "ALL", label: t("filter_all_creators", "All {Masons}") },
                            ...availableCreators,
                          ]}
                        />
                      </div>
                    </div>
                  )}

                  {activeFiltersCount > 0 && (
                    <div className="pt-2 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex justify-end">
                      <ActionButton
                        variant="glass"
                        icon={t("icon_restart_alt", "restart_alt")}
                        label={t("clear", "Clear")}
                        onClick={resetAllFilters}
                      />
                    </div>
                  )}
                </div>
              ),
            }}
          />

          {activeFiltersCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {filterTab !== "ALL" && (
                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {t("icon_filter_alt", "filter_alt")}
                    </span>
                    <span>
                      {filterTab === "MISSING"
                        ? t("filter_missing", "Missing Only")
                        : t("status_in_vault", "In {Vault}")}
                    </span>
                  </span>
                )}
                {typeFilter !== "ALL" && (
                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {t("icon_category", "category")}
                    </span>
                    <span>
                      {typeFilter === "PACKAGE"
                        ? t("type_package", "Package")
                        : typeFilter === "SCRIPT"
                          ? t("type_script", "Script")
                          : t("suite_label", "Suite")}
                    </span>
                  </span>
                )}
                {accessFilter !== "ALL" && (
                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                      {t("icon_workspace_premium", "workspace_premium")}
                    </span>
                    <span>
                      {accessFilter === "PAID"
                        ? t("badge_paid", "Paid")
                        : accessFilter === "EARLY_ACCESS"
                          ? t("badge_early_access", "Early Access")
                          : t("standard_artifacts", "Standard {Mods}")}
                    </span>
                  </span>
                )}
                {creatorFilter !== "ALL" && (
                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {t("icon_person", "person")}
                    </span>
                    <span>{creatorFilter}</span>
                  </span>
                )}
                {sortBy !== "default" && (
                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {t("icon_sort", "sort")}
                    </span>
                    <span>
                      {sortBy === "name_asc"
                        ? t("sort_name", "Name (A-Z)")
                        : sortBy === "creator_asc"
                          ? t("sort_author", "{Mason} (A-Z)")
                          : sortBy === "modules_desc"
                            ? t("sort_modules_desc", "Most Modules")
                            : t("sort_load_order", "Load Order")}
                    </span>
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={resetAllFilters}
                className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)] hover:underline cursor-pointer"
              >
                {t("clear", "Clear")}
              </button>
            </div>
          )}

          {premiumMods.length > 0 && (
            <UniversalGroup
              title={`${t("premium_artifacts", "Premium {Mods}")} (${premiumMods.length})`}
              icon={t("icon_workspace_premium", "workspace_premium")}
              headerColorClass="text-[var(--warning)]"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {premiumMods.map((mod: any, i: number) => (
                  <BlueprintInspectorModCard
                    key={`${mod.hash || mod.name}_${i}`}
                    mod={mod}
                    onOpenDossier={onOpenDossier}
                    activeGameSchema={activeGameSchema}
                    t={t}
                    showLoadOrderChip={sortBy === "load_order"}
                  />
                ))}
              </div>
            </UniversalGroup>
          )}

          {standardMods.length > 0 && (
            <UniversalGroup
              title={`${t("standard_artifacts", "Standard {Mods}")} (${standardMods.length})`}
              icon={t("icon_inventory_2", "inventory_2")}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {standardMods.map((mod: any, i: number) => (
                  <BlueprintInspectorModCard
                    key={`${mod.hash || mod.name}_${i}`}
                    mod={mod}
                    onOpenDossier={onOpenDossier}
                    activeGameSchema={activeGameSchema}
                    t={t}
                    showLoadOrderChip={sortBy === "load_order"}
                  />
                ))}
              </div>
            </UniversalGroup>
          )}

          {displayArtifacts.length === 0 && (
            <EmptyState
              icon={t("icon_inventory_2", "inventory_2")}
              title={t("empty_title", "No matching {mods} found")}
              subtitle={t(
                "empty_desc",
                "Everything in this {Blueprint} is already in Your {Vault} or filtered out."
              )}
            />
          )}

          {displayArtifacts.length > visibleCount && (
            <ActionButton
              variant="glass"
              icon={t("icon_expand_more", "expand_more")}
              label={`${t("load_more_artifacts", "Load More Artifacts")} (${displayArtifacts.length - visibleCount})`}
              onClick={() => setVisibleCount((prev: number) => prev + 80)}
              className="w-full"
            />
          )}
        </div>
      </SidePanel>
    </>
  );
}
