import { useState, useMemo } from "react";
import { useLexicon } from "../../LexiconContext";
import { SidePanel, SidePanelHeroCard, UniversalGroup, ActionButton, HoverTooltip, getNormalizedArtifactName, ActionPill, VAULT_CHIP_CLASS, formatDisplayName, EmptyState, openModDossier, isScriptExtension } from "../../shared";
import { formatCleanModTitle } from "../CommandIncompatiblePanel";
import { useStore } from "../../store";
import enDefault from "../../lexicons/en-default.json";
import { deepCompare } from "../../lib/MasonValidation";
import type { BlueprintComplianceViolation } from "./blueprintComplianceAndInspector";

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
    const isScript = isScriptExtension(v.cleanName || v.name, activeSchema);
    const typeLabel = isScript
      ? t("type_script", "Script")
      : t("type_package", "Module");
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
          "Only verified Tier 0 {mods} are permitted in {Nexus} {Blueprints}. Remove Tier 1–6 or unknown {mods} below and re-upload to restore your {Blueprint} listing."
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
                "Only verified Tier 0 {mods} are permitted in {Nexus} {Blueprints}. Remove Tier 1–6 or unknown {mods} below and re-upload to restore your {Blueprint} listing."
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

