import {
  SidePanel,
  getModIcon,
  PanelHeaderGroup,
  PanelHeaderButton,
  ActionButton,
  SidePanelFilterBar,
  StatBox,
  HoverTooltip,
} from "../../shared";
import { DashboardStatTile } from "../../hub-components/SharedCommandScreenLayout";
import { SidePanelHeroCard, UniversalGroup } from "../layouts/ElevatedHubLayout";
import { VAULT_CHIP_CLASS } from "../../shared-components/constants";
import { LabVerificationGate } from "../LabVerificationGate";
import { KnownErrorDiagnosisBanner, matchExceptionRules } from "../KnownExceptionRules";
import {
  scrubLogUserData,
  formatHumanReadableLogText,
  extractCleanRealLogContent,
  resolveLabReportNumber,
  buildFormattedLabReportText,
  extractReportLoadoutFromLogAndContext,
  getCleanModBaseName,
  getModExtensionLabel,
  getModVersionLabel,
  resolveRealReportMod,
} from "../../utils/logScrubber";
import { resolveDefaultRealLogName, parseLabTimestamp } from "./labHelpers";

export function LabSidePanelsAndModals({
  activeLabMod,
  setActiveLabMod,
  modList,
  onOpenDossier,
  shelterActive,
  setConflictTarget,
  testErrorFound,
  isSubmittingReport,
  submitLabReport,
  t,
  activeGameSchema,
  selectedVersion,
  linkedTool,
  testSaveStatus,
  showTestSaveModal,
  setShowTestSaveModal,
  isConfiguringSave,
  setSaveModalFeedback,
  saveModalFeedback,
  setPendingLaunchAfterSaveSetup,
  copiedLogState,
  setCopiedLogState,
  refreshAirgapStatus,
  labSessionStatus,
  setStagedExtras,
  setConflictExtras,
  missingDeps,
  showTestPanel,
  setShowTestPanel,
  setActiveTab,
  selectedReport,
  setSelectedReport,
  isEndingTest,
  secureCardState,
  submitCardState,
  setSubmitCardState,
  downloadCardState,
  reportLogViewTab,
  setReportLogViewTab,
  liveRealLogs,
  exceptionRules,
  lastConcludingReport,
  handleLaunchExternalToolStandalone,
  handleExportLogs,
  handleSelectSandboxSave,
  handleCopyLiveSaveForLab,
  handleImportSaveFilesFromDisk,
  handleRestoreLiveSavesFromVaultMirror,
  handleResetForFreshSave,
  getModName,
  handleConcludeTest,
  reportsToList,
  isModKnownCloudTier0ForLabReport,
  crashAutopsy,
}: any) {
  return (
    <>
      {selectedReport &&
        (() => {
          const isError = selectedReport.errorFound;
          const reportNum = resolveLabReportNumber(selectedReport, reportsToList);
          const rawLogData = scrubLogUserData(selectedReport.logSnippet || "");
          const matchedRules = matchExceptionRules(rawLogData, exceptionRules || []);
          const resolvedLoadout = extractReportLoadoutFromLogAndContext({
            targetMod: selectedReport.mod,
            logText: rawLogData,
            explicitDependencies: selectedReport.stagedExtras,
            explicitConflictTarget: selectedReport.conflictTarget,
            explicitConflictExtras: selectedReport.conflictExtras,
            linkedFiles: selectedReport.linkedFiles || labSessionStatus?.linked_files || [],
            modList,
            activeGameSchema,
          });
          const reportStagedDeps = resolvedLoadout.dependencies;
          const resolvedConflictTarget = resolvedLoadout.conflictTarget;
          const resolvedConflictExtras = resolvedLoadout.conflictExtras;
          const resolvedTargetMod = resolveRealReportMod(
            selectedReport.mod,
            reportStagedDeps,
            modList
          );
          const reportConflicts = [
            ...(resolvedConflictTarget ? [resolvedConflictTarget] : []),
            ...(resolvedConflictExtras || []),
          ];

          const formattedLabReportText = buildFormattedLabReportText({
            reportNumber: reportNum,
            date: selectedReport.time
              ? parseLabTimestamp(selectedReport.time).toLocaleString()
              : new Date().toLocaleString(),
            gameVersion: selectedVersion || "Local",
            targetMod: resolvedTargetMod,
            conflictTarget: resolvedConflictTarget,
            stagedExtras: reportStagedDeps,
            conflictExtras: resolvedConflictExtras,
            missingDeps: selectedReport.missingDeps || missingDeps,
            linkedFiles: selectedReport.linkedFiles || labSessionStatus?.linked_files || [],
            matchedRules,
            rawLogText: rawLogData,
            errorFound: Boolean(isError),
            verified: Boolean(selectedReport.verified),
            activeGameSchema,
            modList,
          });

          const realLogDisplayContent = formatHumanReadableLogText(
            liveRealLogs.length > 0
              ? liveRealLogs
                .map(
                  (l: any) =>
                    `// === FILE: ${l.fileName || l.file_name} ===\n${scrubLogUserData(l.content)}`
                )
                .join("\n\n")
              : extractCleanRealLogContent(rawLogData)
          );

          const hasRealLogContent = Boolean(
            liveRealLogs.length > 0 || rawLogData.trim().length > 0
          );

          const canSecureReport = Boolean(
            selectedReport.isConcluding ||
            shelterActive ||
            lastConcludingReport?.id === selectedReport.id ||
            secureCardState !== "idle"
          );

          const realLogFileName =
            liveRealLogs[0]?.fileName ||
            liveRealLogs[0]?.file_name ||
            resolveDefaultRealLogName(activeGameSchema);

          const activeLogTextToCopy =
            reportLogViewTab === "REAL_LOG"
              ? realLogDisplayContent || ""
              : formattedLabReportText || formatHumanReadableLogText(rawLogData) || "";

          const reportAllInvolvedMods = [
            resolvedTargetMod,
            ...(reportStagedDeps || []),
            ...(reportConflicts || []),
          ].filter(Boolean);
          const isReportRestrictedFromCloud =
            reportAllInvolvedMods.length === 0 ||
            reportAllInvolvedMods.some((m: any) => !isModKnownCloudTier0ForLabReport(m));

          return (
            <SidePanel
              isOpen={true}
              onClose={() => setSelectedReport(null)}
              title={<span className="normal-case font-mono">{`Lab_Report_${reportNum}`}</span>}
              subtitle={`${isError ? t("fatal_collision", "Fatal Collision") : t("successful_injection", "Successful Injection")} • ${t("tab_lab_reports", "Lab Reports")}`}
              icon={isError ? t("icon_warning", "warning") : t("icon_science", "science")}
              iconColorClass={
                isError ? "text-[var(--danger)]" : "text-[var(--success)]"
              }
              widthClass="w-[90vw] md:w-[820px]"
              headerActions={
                <PanelHeaderGroup>
                  {isError && submitLabReport && !isReportRestrictedFromCloud && (
                    <PanelHeaderButton
                      icon={
                        submitCardState === "done"
                          ? t("icon_check_circle", "check_circle")
                          : submitCardState === "working"
                            ? t("icon_sync", "sync")
                            : t("icon_send", "send")
                      }
                      variant={submitCardState === "done" ? "success" : "warning"}
                      disabled={
                        isSubmittingReport ||
                        submitCardState === "working" ||
                        submitCardState === "done"
                      }
                      tooltip={
                        submitCardState === "done"
                          ? (t("lab_action_submit_diag_done_title", "Submitted To Architect Lab") as string)
                          : (t("lab_action_submit_diag_title", "Submit To Diagnostics") as string)
                      }
                      onClick={async () => {
                        if (submitCardState === "working" || submitCardState === "done") return;
                        setSubmitCardState("working");
                        const ok = await submitLabReport({
                          ...selectedReport,
                          stagedExtras: reportStagedDeps,
                          conflictTarget: resolvedConflictTarget,
                          conflictExtras: resolvedConflictExtras,
                        });
                        setSubmitCardState(ok ? "done" : "error");
                      }}
                    />
                  )}
                  <PanelHeaderButton
                    icon={
                      downloadCardState === "done"
                        ? t("icon_check_circle", "check_circle")
                        : t("icon_download", "download")
                    }
                    variant={downloadCardState === "done" ? "success" : "accent"}
                    tooltip={
                      downloadCardState === "done"
                        ? (t("lab_action_download_done_title", "Report Saved Locally") as string)
                        : (t("lab_action_download_title", "Download Report") as string)
                    }
                    onClick={handleExportLogs}
                  />
                </PanelHeaderGroup>
              }
            >
              <div className="flex flex-col gap-4 mt-2 w-full pb-8">
                <SidePanelHeroCard
                  title={getCleanModBaseName(resolvedTargetMod)}
                  subtitle={`${getModExtensionLabel(
                    resolvedTargetMod,
                    activeGameSchema,
                    modList,
                    reportStagedDeps
                  )} • v${getModVersionLabel(resolvedTargetMod, modList, reportStagedDeps)}`}
                  label={t("subject_isolation", "Subject Isolation")}
                  icon={isError ? t("icon_warning", "warning") : t("icon_check_circle", "check_circle")}
                  variant={isError ? "danger" : "success"}
                  badges={[
                    {
                      icon: isError ? t("icon_warning", "warning") : t("icon_check_circle", "check_circle"),
                      label: isError ? t("fatal_collision", "Fatal Collision") : t("successful_injection", "Successful Injection"),
                      colorClass: isError
                        ? "text-[var(--danger)]"
                        : "text-[var(--success)]",
                    },
                  ]}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
                    <StatBox
                      icon={t("icon_sell", "sell")}
                      iconColorClass="text-[var(--accent)]"
                      label={t("game_version", "Game Version")}
                      value={selectedVersion || t("unknown", "Unknown")}
                    />
                    <StatBox
                      icon={t("icon_memory", "memory")}
                      iconColorClass="text-[var(--accent)]"
                      label={t("mod_version", "{Mod} Version")}
                      value={getModVersionLabel(resolvedTargetMod, modList, reportStagedDeps)}
                    />
                    <StatBox
                      icon={t("icon_schedule", "schedule")}
                      iconColorClass="text-[var(--accent)]"
                      label={t("date_created", "Time")}
                      tooltipSubtitle={parseLabTimestamp(selectedReport.time).toLocaleString()}
                      value={
                        <span className="text-xs md:text-sm font-black tracking-tight">
                          {parseLabTimestamp(selectedReport.time).toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}{" "}
                          &bull;{" "}
                          {parseLabTimestamp(selectedReport.time).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      }
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 pt-1 ml-auto w-full">
                    {resolvedTargetMod && onOpenDossier && (
                      <ActionButton
                        variant="glass"
                        icon={t("icon_deployed_code", "deployed_code")}
                        label={t("inspect", "Inspect")}
                        onClick={() => onOpenDossier(resolvedTargetMod)}
                      />
                    )}
                    {resolvedTargetMod && (
                      <ActionButton
                        variant="glass"
                        icon={t("icon_science", "science")}
                        label={t("tab_env_builder", "Environment Builder")}
                        onClick={() => {
                          if (setActiveLabMod) setActiveLabMod(resolvedTargetMod);
                          setStagedExtras(Array.isArray(reportStagedDeps) ? reportStagedDeps : []);
                          if (setConflictTarget) setConflictTarget(resolvedConflictTarget || null);
                          setConflictExtras(
                            Array.isArray(resolvedConflictExtras) ? resolvedConflictExtras : []
                          );
                          setSelectedReport(null);
                          setActiveTab("BUILDER");
                        }}
                      />
                    )}
                    <ActionButton
                      variant={downloadCardState === "done" ? "success" : "accent"}
                      icon={
                        downloadCardState === "done"
                          ? t("icon_check_circle", "check_circle")
                          : t("icon_download", "download")
                      }
                      label={
                        downloadCardState === "done"
                          ? t("lab_action_download_done_title", "Report Saved Locally")
                          : t("lab_action_download_title", "Download Report")
                      }
                      onClick={handleExportLogs}
                    />
                  </div>
                </SidePanelHeroCard>
                {Array.isArray(crashAutopsy?.suspects) && crashAutopsy.suspects.length > 0 && (
                  <UniversalGroup
                    title={t("lab_crash_autopsy_title", "Crash Autopsy — Suspected {Mods}")}
                    icon={t("icon_troubleshoot", "troubleshoot")}
                    headerColorClass="text-[var(--danger)]"
                  >
                    <div className="flex flex-col gap-2">
                      {crashAutopsy.suspects.map((suspect: any, sIdx: number) => (
                        <div
                          key={`${suspect.mod_name}_${sIdx}`}
                          className="glass-surface rounded-xl p-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2"
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-xs font-black text-[var(--text)] truncate">
                              {suspect.mod_name}
                            </span>
                            <div className="flex items-center gap-1.5 ml-auto shrink-0">
                              <span className={`${VAULT_CHIP_CLASS} font-mono`}>
                                <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                                  {t("icon_radar", "radar")}
                                </span>
                                <span className="text-[var(--danger)]">
                                  {suspect.confidence_score}%
                                </span>
                              </span>
                              {onOpenDossier && (
                                <button
                                  type="button"
                                  onClick={() => onOpenDossier(suspect.mod_name)}
                                  className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--accent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer"
                                >
                                  <span className="material-symbols-outlined !text-[14px]">
                                    {t("icon_open_in_new", "open_in_new")}
                                  </span>
                                </button>
                              )}
                            </div>
                          </div>
                          {Array.isArray(suspect.matched_tokens) && suspect.matched_tokens.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {suspect.matched_tokens.map((tok: string) => (
                                <span key={tok} className={`${VAULT_CHIP_CLASS} font-mono`}>
                                  <span className="text-[var(--subtext)]">{tok}</span>
                                </span>
                              ))}
                            </div>
                          )}
                          {suspect.line_excerpt && (
                            <p className="text-[11px] font-mono text-[var(--subtext)] opacity-85 truncate m-0">
                              {suspect.line_excerpt}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </UniversalGroup>
                )}
                {canSecureReport && (
                  <button
                    type="button"
                    onClick={handleConcludeTest}
                    disabled={secureCardState === "working" || secureCardState === "done"}
                    className={`text-left glass-panel rounded-2xl p-3.5 border transition-all flex items-start gap-3 group cursor-pointer shadow-sm disabled:cursor-default ${secureCardState === "done"
                      ? "sa-glass-pill-active"
                      : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)]"
                      }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] ${secureCardState === "done"
                        ? "text-[var(--success)]"
                        : isError
                          ? "text-[var(--danger)]"
                          : "text-[var(--success)]"
                        }`}
                    >
                      <span
                        className={`material-symbols-outlined !text-[18px] ${secureCardState === "working" ? "animate-spin" : ""
                          }`}
                      >
                        {secureCardState === "done"
                          ? t("icon_check_circle", "check_circle")
                          : secureCardState === "working"
                            ? t("icon_sync", "sync")
                            : isError
                              ? t("icon_shield", "shield")
                              : t("icon_verified_user", "verified_user")}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text)]">
                          {secureCardState === "done"
                            ? isError
                              ? t("lab_action_secure_broken_done_title", "Removed From {Blueprint} & Secured")
                              : t("lab_action_secure_verified_done_title", "{Mod} Verified & Secured")
                            : secureCardState === "working"
                              ? t("lab_action_securing_title", "Securing Sandbox...")
                              : isError
                                ? t("lab_action_secure_broken_title", "Secure Corrupted Artifact")
                                : t("lab_action_secure_verified_title", "Secure Verified Artifact")}
                        </span>
                        <span
                          className={`material-symbols-outlined !text-[15px] transition-all ${secureCardState === "done"
                            ? "text-[var(--success)] opacity-100"
                            : "text-[var(--subtext)] group-hover:text-[var(--accent)] group-hover:translate-x-0.5"
                            }`}
                        >
                          {secureCardState === "done"
                            ? t("icon_check_circle", "check_circle")
                            : t("icon_arrow_forward", "arrow_forward")}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--subtext)] leading-snug">
                        {secureCardState === "done"
                          ? isError
                            ? t("lab_action_secure_broken_done_desc", "Live saves restored and corrupted {mod} unequipped from active {Blueprint}.")
                            : t(
                              "lab_action_secure_verified_done_desc",
                              "Sandbox closed, live saves restored, and mod signed off as verified."
                            )
                          : isError
                            ? t("lab_action_secure_broken_desc", "Conclude test, mark {mod} as broken, and restore your live {blueprint} & saves")
                            : t("lab_action_secure_verified_desc", "Conclude test, mark {mod} as verified, and restore your live {blueprint} & saves")}
                      </p>
                    </div>
                  </button>
                )}

                {/* Dependencies & Conflicts Loaded for Test — Command Center Alerts Panel Card Layout */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <UniversalGroup
                    title={`${t("lab_report_deps_loaded_title", "Dependencies Loaded for Test")} (${reportStagedDeps.length})`}
                    icon={t("icon_extension", "extension")}
                  >
                    {reportStagedDeps.length > 0 ? (
                      <div className="flex flex-col gap-3">
                        {reportStagedDeps.map((m: any) => {
                          const depTitle = getCleanModBaseName(m);
                          const depExt = getModExtensionLabel(m, activeGameSchema, modList, reportStagedDeps);
                          const depVer = getModVersionLabel(m, modList, reportStagedDeps);
                          const depIcon = getModIcon(m, activeGameSchema, t);
                          return (
                            <div
                              key={m.hash || m.name}
                              onClick={() => onOpenDossier?.(m)}
                              className="glass-panel rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)] flex flex-col justify-between gap-2.5 transition-all duration-200 cursor-pointer relative"
                            >
                              <div className="flex items-start gap-3 min-w-0 w-full">
                                <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                                  <span className="material-symbols-outlined !text-[20px]">
                                    {depIcon}
                                  </span>
                                </div>
                                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                  <div className="relative group/modtitle flex items-center min-w-0 w-fit max-w-full">
                                    <span className="text-sm font-black text-[var(--text)] tracking-tight leading-snug truncate">
                                      {depTitle}
                                    </span>
                                    <HoverTooltip
                                      className="z-[100]"
                                      onlyWhenTruncated={true}
                                      title={depTitle}
                                      icon={depIcon}
                                    />
                                  </div>
                                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--subtext)] min-w-0 flex-wrap">
                                    {m.author && String(m.author).toLowerCase() !== "unknown" ? (
                                      <span className="truncate opacity-90">{m.author}</span>
                                    ) : (
                                      <span className="opacity-85 shrink-0">{depExt}</span>
                                    )}
                                    <span className="opacity-40 shrink-0">&bull;</span>
                                    <span className="font-mono text-[10px] font-bold text-[var(--subtext)] opacity-85 shrink-0">
                                      v{depVer}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                                <span className={VAULT_CHIP_CLASS}>
                                  <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--accent)]">
                                    {t("icon_extension", "extension")}
                                  </span>
                                  <span>{depExt}</span>
                                </span>

                                {onOpenDossier && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onOpenDossier(m);
                                    }}
                                    aria-label={t("inspect", "Inspect")}
                                    className="relative group/actionbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer shrink-0 ml-auto"
                                  >
                                    <span className="material-symbols-outlined !text-[15px]">
                                      {t("icon_deployed_code", "deployed_code")}
                                    </span>
                                    <HoverTooltip
                                      className="z-[100] !right-0 !translate-x-0 !left-auto"
                                      title={t("inspect", "Inspect")}
                                      icon={t("icon_deployed_code", "deployed_code")}
                                    />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="w-full rounded-xl px-3.5 py-3 bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border border-dashed border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between">
                        <span className="text-xs font-semibold text-[var(--subtext)] opacity-70">
                          {t("lab_report_none_loaded", "None Loaded")}
                        </span>
                      </div>
                    )}
                  </UniversalGroup>

                  <UniversalGroup
                    title={`${t("lab_report_conflicts_loaded_title", "Conflicts Loaded for Test")} (${reportConflicts.length})`}
                    icon={t("icon_warning", "warning")}
                  >
                    {reportConflicts.length > 0 ? (
                      <div className="flex flex-col gap-3">
                        {reportConflicts.map((m: any, cIdx: number) => {
                          const isPrimaryConflict = resolvedConflictTarget && m === resolvedConflictTarget;
                          const cTitle = getCleanModBaseName(m);
                          const cExt = getModExtensionLabel(m, activeGameSchema, modList);
                          const cVer = getModVersionLabel(m, modList);
                          const cIcon = getModIcon(m, activeGameSchema, t);
                          return (
                            <div
                              key={`${m.hash || m.name}_${cIdx}`}
                              onClick={() => onOpenDossier?.(m)}
                              className="glass-panel rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)] flex flex-col justify-between gap-2.5 transition-all duration-200 cursor-pointer relative"
                            >
                              <div className="flex items-start gap-3 min-w-0 w-full">
                                <div
                                  className={`w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 ${
                                    isPrimaryConflict ? "text-[var(--danger)]" : "text-[var(--warning)]"
                                  }`}
                                >
                                  <span className="material-symbols-outlined !text-[20px]">
                                    {cIcon}
                                  </span>
                                </div>
                                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                  <div className="relative group/modtitle flex items-center min-w-0 w-fit max-w-full">
                                    <span className="text-sm font-black text-[var(--text)] tracking-tight leading-snug truncate">
                                      {cTitle}
                                    </span>
                                    <HoverTooltip
                                      className="z-[100]"
                                      onlyWhenTruncated={true}
                                      title={cTitle}
                                      icon={cIcon}
                                    />
                                  </div>
                                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--subtext)] min-w-0 flex-wrap">
                                    {m.author && String(m.author).toLowerCase() !== "unknown" ? (
                                      <span className="truncate opacity-90">{m.author}</span>
                                    ) : (
                                      <span className="opacity-85 shrink-0">{cExt}</span>
                                    )}
                                    <span className="opacity-40 shrink-0">&bull;</span>
                                    <span className="font-mono text-[10px] font-bold text-[var(--subtext)] opacity-85 shrink-0">
                                      v{cVer}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                                <span className={VAULT_CHIP_CLASS}>
                                  <span
                                    className={`material-symbols-outlined !text-[12px] shrink-0 ${
                                      isPrimaryConflict ? "text-[var(--danger)]" : "text-[var(--warning)]"
                                    }`}
                                  >
                                    {t("icon_warning", "warning")}
                                  </span>
                                  <span>{cExt}</span>
                                </span>

                                {onOpenDossier && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onOpenDossier(m);
                                    }}
                                    aria-label={t("inspect", "Inspect")}
                                    className="relative group/actionbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer shrink-0 ml-auto"
                                  >
                                    <span className="material-symbols-outlined !text-[15px]">
                                      {t("icon_deployed_code", "deployed_code")}
                                    </span>
                                    <HoverTooltip
                                      className="z-[100] !right-0 !translate-x-0 !left-auto"
                                      title={t("inspect", "Inspect")}
                                      icon={t("icon_deployed_code", "deployed_code")}
                                    />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="w-full rounded-xl px-3.5 py-3 bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border border-dashed border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between">
                        <span className="text-xs font-semibold text-[var(--subtext)] opacity-70">
                          {t("lab_report_none_loaded", "None Loaded")}
                        </span>
                      </div>
                    )}
                  </UniversalGroup>
                </div>

                {/* Community Known Error Diagnosis & Spoke Rules */}
                {(isError || rawLogData) && (
                  <KnownErrorDiagnosisBanner
                    logText={rawLogData}
                    canEdit={false}
                    reportFailed={Boolean(isError)}
                  />
                )}

                {/* 2-Column StatTile Log Switcher */}
                {hasRealLogContent && (
                  <SidePanelFilterBar className="sm:grid-cols-2 gap-3">
                    <DashboardStatTile
                      variant="filter"
                      className="!w-full"
                      icon={
                        <span className="material-symbols-outlined">
                          {t("icon_description", "description")}
                        </span>
                      }
                      label={t("lab_report_tab_lab_log", "Lab Report Log")}
                      number={`Lab_Report_${reportNum}.txt`}
                      isActive={reportLogViewTab === "LAB_REPORT"}
                      onClick={() => setReportLogViewTab("LAB_REPORT")}
                    />
                    <DashboardStatTile
                      variant="filter"
                      className="!w-full"
                      icon={
                        <span className="material-symbols-outlined">
                          {t("icon_terminal", "terminal")}
                        </span>
                      }
                      label={t("lab_report_tab_real_log", "Real Game Log (Scrubbed)")}
                      number={realLogFileName}
                      isActive={reportLogViewTab === "REAL_LOG"}
                      onClick={() => setReportLogViewTab("REAL_LOG")}
                    />
                  </SidePanelFilterBar>
                )}

                {/* Log Terminal Card */}
                <div className="flex-1 min-h-[420px] glass-panel backdrop-blur-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl overflow-hidden shadow-inner relative flex flex-col">
                  <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[var(--accent)] !text-[16px]">
                        {reportLogViewTab === "REAL_LOG"
                          ? t("icon_terminal", "terminal")
                          : t("icon_description", "description")}
                      </span>
                      <span className="text-xs font-black font-mono text-[var(--text)]">
                        {reportLogViewTab === "REAL_LOG"
                          ? realLogFileName
                          : `Lab_Report_${reportNum}.txt`}
                      </span>
                    </div>

                    <div className="flex items-center justify-end gap-2 flex-wrap ml-auto">
                      <span className={VAULT_CHIP_CLASS}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                          {t("icon_verified_user", "verified_user")}
                        </span>
                        <span>{t("lab_report_pii_scrubbed_badge", "User Data Scrubbed")}</span>
                      </span>

                      <PanelHeaderGroup>
                        <PanelHeaderButton
                          icon={
                            copiedLogState
                              ? t("icon_check", "check")
                              : t("icon_content_copy", "content_copy")
                          }
                          label={
                            copiedLogState
                              ? t("copied", "Copied")
                              : t("lab_report_copy_btn", "Copy Log")
                          }
                          variant={copiedLogState ? "success" : "default"}
                          onClick={() => {
                            if (!activeLogTextToCopy) return;
                            navigator.clipboard?.writeText(activeLogTextToCopy);
                            setCopiedLogState(true);
                            setTimeout(() => setCopiedLogState(false), 1800);
                          }}
                        />
                      </PanelHeaderGroup>
                    </div>
                  </div>

                  <pre className="p-5 font-mono text-[12px] text-[var(--text)] whitespace-pre-wrap break-words leading-relaxed flex-1 overflow-y-auto custom-scrollbar opacity-90">
                    {reportLogViewTab === "REAL_LOG"
                      ? realLogDisplayContent || t("no_logs", "No logs available for this session. System reports standard exit code.")
                      : formattedLabReportText || formatHumanReadableLogText(rawLogData) || t("no_logs", "No logs available for this session. System reports standard exit code.")}
                  </pre>
                </div>
              </div>
            </SidePanel>
          );
        })()}

      {showTestPanel && (
        <SidePanel
          isOpen={showTestPanel}
          onClose={() => setShowTestPanel(false)}
          title={t("test_underway_title", "Experiment Underway")}
          subtitle={t("test_underway_desc", "Monitoring simulation for anomalies...")}
          icon={t("icon_science", "science")}
          iconColorClass="text-[var(--accent)]"
          headerActions={
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon={
                  isEndingTest
                    ? t("icon_sync", "sync")
                    : labSessionStatus?.stage === "VERIFIED"
                      ? t("icon_verified", "verified")
                      : testErrorFound || labSessionStatus?.stage === "FAILED"
                        ? t("icon_report", "report")
                        : t("icon_restore", "restore")
                }
                disabled={isEndingTest}
                tooltip={
                  isEndingTest
                    ? t("lab_btn_ending_test", "Closing Game & Restoring...")
                    : labSessionStatus?.stage === "VERIFIED" ||
                        testErrorFound ||
                        labSessionStatus?.stage === "FAILED"
                      ? t("btn_conclude_experiment", "Conclude Experiment")
                      : t("lab_btn_restore_saves", "Restore Live Saves")
                }
                onClick={async () => {
                  const ok = await handleConcludeTest();
                  if (ok) setShowTestPanel(false);
                }}
                variant={
                  labSessionStatus?.stage === "VERIFIED"
                    ? "success"
                    : testErrorFound || labSessionStatus?.stage === "FAILED"
                      ? "danger"
                      : "default"
                }
              />
            </PanelHeaderGroup>
          }
        >
          <div className="flex flex-col items-center justify-start gap-4 opacity-95 p-2 w-full">
            <SidePanelHeroCard
              title={getCleanModBaseName(activeLabMod)}
              subtitle={
                isEndingTest
                  ? t(
                      "lab_status_closing_and_restoring",
                      "Closing sandbox & restoring live saves..."
                    )
                  : labSessionStatus?.stage === "VERIFIED"
                    ? t(
                        "lab_banner_save_verified_end_now",
                        "Save Verified — Safe to Close Game & End Test"
                      )
                    : labSessionStatus?.stage === "AWAITING_SAVE"
                      ? t(
                          "lab_banner_timer_up_save_now",
                          "Timer Complete — Save Your Game Now to Finish"
                        )
                      : t("test_running_wait", "Sandbox monitoring is active...")
              }
              label={t("monitoring_subject", "Monitoring Subject")}
              icon={t("icon_radar", "radar")}
              variant="accent"
              badges={[
                {
                  icon: t("icon_shield_lock", "shield_lock"),
                  label: t("lab_badge_saves_airgapped", "Saves Airgapped (Sandbox Active)"),
                  colorClass: "text-[var(--success)]",
                },
              ]}
            >
              <div className="flex flex-wrap items-center justify-end gap-2 pt-1 ml-auto w-full">
                {linkedTool && (
                  <ActionButton
                    variant="glass"
                    icon={t("icon_launch", "launch")}
                    label={`${t("lab_btn_launch_tool", "Launch Tool (Isolated)")} (${linkedTool.name})`}
                    disabled={isEndingTest}
                    onClick={handleLaunchExternalToolStandalone}
                  />
                )}
                <ActionButton
                  variant={
                    labSessionStatus?.stage === "VERIFIED"
                      ? "success"
                      : testErrorFound || labSessionStatus?.stage === "FAILED"
                        ? "danger"
                        : "glass"
                  }
                  icon={
                    isEndingTest
                      ? t("icon_sync", "sync")
                      : labSessionStatus?.stage === "VERIFIED"
                        ? t("icon_verified", "verified")
                        : testErrorFound || labSessionStatus?.stage === "FAILED"
                          ? t("icon_report", "report")
                          : t("icon_stop_circle", "stop_circle")
                  }
                  label={
                    isEndingTest
                      ? t("lab_btn_ending_test", "Closing Game & Restoring...")
                      : labSessionStatus?.stage === "VERIFIED" ||
                          testErrorFound ||
                          labSessionStatus?.stage === "FAILED"
                        ? t("btn_conclude_experiment", "Conclude Experiment")
                        : t("lab_btn_stop_timed_test", "Abort Timed Test")
                  }
                  disabled={isEndingTest}
                  onClick={async () => {
                    const ok = await handleConcludeTest();
                    if (ok) setShowTestPanel(false);
                  }}
                />
              </div>
            </SidePanelHeroCard>

            <div className="w-full text-left">
              <LabVerificationGate
                dnaHash={activeLabMod?.hash}
                modName={activeLabMod?.name || getModName(activeLabMod)}
                physicalPath={activeLabMod?.physical_path || activeLabMod?.name}
                roleContext="lab"
                isGateRequired={true}
                externalStatus={labSessionStatus}
              />
            </div>
          </div>
        </SidePanel>
      )}

      {/* Dedicated Lab Test Save Setup & Switcher SidePanel */}
      {showTestSaveModal && (
        <SidePanel
          isOpen={showTestSaveModal}
          onClose={() => {
            setShowTestSaveModal(false);
            setSaveModalFeedback(null);
            setPendingLaunchAfterSaveSetup(null);
          }}
          title={t("lab_test_save_modal_title", "Lab Test Save Configuration")}
          subtitle={t(
            "lab_test_save_modal_subtitle",
            "Manage the isolated save file that is only active when the {Lab} is running"
          )}
          icon={t("icon_save", "save")}
          iconColorClass="text-[var(--accent)]"
          widthClass="w-[92vw] md:w-[820px]"
          headerActions={
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon={t("icon_refresh", "refresh")}
                tooltip={t("refresh", "Refresh")}
                onClick={() => refreshAirgapStatus()}
              />
            </PanelHeaderGroup>
          }
        >
          <div className="flex flex-col gap-5 mt-3 w-full pb-12">
            {/* Inline Action Feedback Banner */}
            {saveModalFeedback && (
              <div
                className={`glass-surface rounded-2xl p-4 border flex items-center justify-between gap-3 ${
                  saveModalFeedback.tone === "error"
                    ? "border-[color-mix(in_srgb,var(--danger)_45%,transparent)]"
                    : "border-[color-mix(in_srgb,var(--success)_45%,transparent)]"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span
                    className={`material-symbols-outlined !text-[20px] shrink-0 ${
                      saveModalFeedback.tone === "error"
                        ? "text-[var(--danger)]"
                        : "text-[var(--success)]"
                    }`}
                  >
                    {saveModalFeedback.tone === "error"
                      ? t("icon_error", "error")
                      : t("icon_check_circle", "check_circle")}
                  </span>
                  <span className="text-xs font-bold text-[var(--text)] leading-relaxed break-words">
                    {saveModalFeedback.text}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSaveModalFeedback(null)}
                  className="p-1 rounded-lg text-[var(--subtext)] hover:text-[var(--text)] transition-colors cursor-pointer shrink-0"
                  aria-label={t("close", "Close")}
                >
                  <span className="material-symbols-outlined !text-[16px]">
                    {t("icon_close", "close")}
                  </span>
                </button>
              </div>
            )}

            {/* Game-Running Lock Safeguard Notice */}
            {testSaveStatus?.game_running && (
              <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="material-symbols-outlined !text-[20px] text-[var(--warning)] shrink-0">
                    {t("icon_warning", "warning")}
                  </span>
                  <span className="text-xs font-bold text-[var(--text)] leading-relaxed">
                    {t(
                      "lab_err_game_running_saves_locked",
                      "Close the running game first so your live saves can be unlocked and restored safely."
                    )}
                  </span>
                </div>
                <ActionButton
                  variant="glass"
                  icon={t("icon_refresh", "refresh")}
                  label={t("refresh", "Refresh")}
                  onClick={() => refreshAirgapStatus()}
                />
              </div>
            )}

            {/* Instant 1-Click Vault / Time Capsule Save Recovery Banner when Live Saves are Empty */}
            {(testSaveStatus?.available_live_saves?.length || 0) === 0 &&
              (testSaveStatus?.vault_mirror_saves?.length || 0) > 0 && (
                <div className="glass-panel rounded-2xl p-4 border border-[color-mix(in_srgb,var(--success)_42%,transparent)] flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <span className="material-symbols-outlined !text-[22px] text-[var(--success)] shrink-0 mt-0.5">
                      {t("icon_restore", "restore")}
                    </span>
                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                      <span className="text-xs font-black text-[var(--text)]">
                        {`${t(
                          "lab_test_save_recovery_ready_title",
                          "Clean Save Backup Found in {Vault}"
                        )} (${testSaveStatus?.vault_mirror_saves?.length || 0})`}
                      </span>
                      <span className="text-[11px] font-medium text-[var(--subtext)] leading-relaxed">
                        {t(
                          "lab_test_save_recovery_ready_desc",
                          "Restore all verified save slots and companion data back into your live game storage and {Lab} sandbox in one click."
                        )}
                      </span>
                    </div>
                  </div>
                  <ActionButton
                    variant="success"
                    icon={t("icon_restore", "restore")}
                    label={`${t(
                      "lab_test_save_btn_restore_mirror",
                      "Restore Live Saves From {Vault} Backup"
                    )} (${testSaveStatus?.vault_mirror_saves?.length || 0})`}
                    disabled={isConfiguringSave || Boolean(testSaveStatus?.game_running)}
                    onClick={handleRestoreLiveSavesFromVaultMirror}
                  />
                </div>
              )}

            {/* Current Status Banner */}
            <SidePanelHeroCard
              title={
                testSaveStatus?.active_test_save
                  ? testSaveStatus.active_test_save.file_name
                  : t("lab_test_save_none_badge", "Clean Sandbox (Create Save In-Game)")
              }
              subtitle={t(
                "lab_test_save_active_sub",
                "Mounts a disposable test copy and rewinds to this clean airgapped save after every {Lab} run"
              )}
              label={t("lab_test_save_current_label", "Active Lab Test Save")}
              icon={
                testSaveStatus?.has_test_save
                  ? t("icon_verified_user", "verified_user")
                  : t("icon_save", "save")
              }
              variant={testSaveStatus?.has_test_save ? "success" : "warning"}
              badges={[
                {
                  icon: testSaveStatus?.has_test_save
                    ? t("icon_check_circle", "check_circle")
                    : t("icon_science", "science"),
                  label: testSaveStatus?.has_test_save
                    ? t("lab_test_save_active_badge", "Isolated Test Save Ready")
                    : t("lab_test_save_none_badge", "Clean Sandbox (Create Save In-Game)"),
                  colorClass: testSaveStatus?.has_test_save
                    ? "text-[var(--success)]"
                    : "text-[var(--warning)]",
                },
              ]}
            />

            {/* Option A: Switch Between Existing Sandbox Saves — Command Center Alerts Panel Card Layout */}
            {testSaveStatus?.sandbox_saves && testSaveStatus.sandbox_saves.length > 0 && (
              <UniversalGroup
                title={`${t("lab_test_save_sandbox_group_title", "{Lab} Sandbox Save Slots")} (${testSaveStatus.sandbox_saves.length})`}
                icon={t("icon_folder_special", "folder_special")}
              >
                <p className="text-xs font-semibold text-[var(--subtext)] leading-relaxed">
                  {t(
                    "lab_test_save_sandbox_group_desc",
                    "Saves sealed inside your {Lab} sandbox. Each test mounts a disposable working copy for save verification and automatically rewinds to this untouched baseline afterward."
                  )}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {testSaveStatus.sandbox_saves.map((saveItem: any) => {
                    const isCurrentActive =
                      testSaveStatus.active_test_save?.file_name?.toLowerCase() ===
                      saveItem.file_name.toLowerCase();
                    const formattedDate = saveItem.modified_epoch
                      ? new Date(saveItem.modified_epoch * 1000).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      : "";
                    return (
                      <div
                        key={`sandbox_${saveItem.file_name}`}
                        onClick={() => {
                          if (!isConfiguringSave && !testSaveStatus?.game_running && !isCurrentActive) {
                            handleSelectSandboxSave(saveItem.file_name);
                          }
                        }}
                        className={`glass-panel rounded-2xl p-3.5 border flex flex-col justify-between gap-2.5 transition-all duration-200 ${
                          isCurrentActive
                            ? "sa-glass-pill-active"
                            : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)] cursor-pointer"
                        }`}
                      >
                        <div className="flex items-start gap-3 min-w-0 w-full">
                          <div
                            className={`w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 ${
                              isCurrentActive ? "text-[var(--success)]" : "text-[var(--accent)]"
                            }`}
                          >
                            <span className="material-symbols-outlined !text-[20px]">
                              {isCurrentActive
                                ? t("icon_verified_user", "verified_user")
                                : t("icon_save", "save")}
                            </span>
                          </div>

                          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                            <div className="relative group/modtitle flex items-center min-w-0 w-fit max-w-full">
                              <span className="text-sm font-black font-mono text-[var(--text)] tracking-tight leading-snug truncate">
                                {saveItem.file_name}
                              </span>
                              <HoverTooltip
                                className="z-[100]"
                                onlyWhenTruncated={true}
                                title={saveItem.file_name}
                                icon={t("icon_save", "save")}
                              />
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--subtext)] min-w-0 flex-wrap">
                              <span className="font-mono text-[10px] font-bold opacity-90 shrink-0">
                                {(saveItem.size_kb / 1024).toFixed(1)} MB
                              </span>
                              {formattedDate && (
                                <>
                                  <span className="opacity-40 shrink-0">&bull;</span>
                                  <span className="truncate opacity-85">{formattedDate}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                          <span className={VAULT_CHIP_CLASS}>
                            <span
                              className={`material-symbols-outlined !text-[12px] shrink-0 ${
                                isCurrentActive ? "text-[var(--success)]" : "text-[var(--accent)]"
                              }`}
                            >
                              {isCurrentActive
                                ? t("icon_check_circle", "check_circle")
                                : t("icon_science", "science")}
                            </span>
                            <span>
                              {isCurrentActive
                                ? t("lab_test_save_btn_active", "Active Test Save")
                                : t("lab_test_save_sandbox_chip", "{Lab} Sandbox")}
                            </span>
                          </span>

                          <button
                            type="button"
                            disabled={
                              isConfiguringSave ||
                              Boolean(testSaveStatus?.game_running) ||
                              isCurrentActive
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectSandboxSave(saveItem.file_name);
                            }}
                            className={`px-2.5 py-1 rounded-lg glass-surface border text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shrink-0 ml-auto ${
                              isCurrentActive
                                ? "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)] cursor-default"
                                : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--text)] hover:text-[var(--accent)] cursor-pointer"
                            }`}
                          >
                            <span className="material-symbols-outlined !text-[14px]">
                              {isCurrentActive
                                ? t("icon_check", "check")
                                : t("icon_swap_horiz", "swap_horiz")}
                            </span>
                            <span>
                              {isCurrentActive
                                ? t("active", "Active")
                                : t("lab_test_save_btn_use_this", "Set as Test Save")}
                            </span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </UniversalGroup>
            )}

            {/* Option B: Import Save Files From Anywhere on Disk */}
            <UniversalGroup
              title={t("lab_test_save_import_group_title", "Import Save Files From Disk")}
              icon={t("icon_upload_file", "upload_file")}
            >
              <p className="text-xs font-semibold text-[var(--subtext)] leading-relaxed">
                {t(
                  "lab_test_save_import_group_desc",
                  "Select save files from any backup or folder on your drive. Import to both Live & {Lab} Saves to restore normal play saves while setting your active {Lab} test save, or import into the {Lab} sandbox only."
                )}
              </p>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-1 ml-auto w-full">
                <ActionButton
                  variant="glass"
                  icon={t("icon_science", "science")}
                  label={t(
                    "lab_test_save_btn_import_sandbox_only",
                    "Import to {Lab} Sandbox Only"
                  )}
                  disabled={isConfiguringSave || Boolean(testSaveStatus?.game_running)}
                  onClick={() => handleImportSaveFilesFromDisk("import_external_save")}
                />

                <ActionButton
                  variant="accent"
                  icon={t("icon_upload_file", "upload_file")}
                  label={t(
                    "lab_test_save_btn_import_live_and_lab",
                    "Import to Live & {Lab} Saves"
                  )}
                  disabled={isConfiguringSave || Boolean(testSaveStatus?.game_running)}
                  onClick={() => handleImportSaveFilesFromDisk("import_to_live_saves")}
                />
              </div>
            </UniversalGroup>

            {/* Option C: Pick / Copy From Existing Live Save Files — Command Center Alerts Panel Card Layout */}
            <UniversalGroup
              title={`${t("lab_test_save_option_copy_title", "Select or Change From Existing Saves")}${
                testSaveStatus?.available_live_saves?.length
                  ? ` (${testSaveStatus.available_live_saves.length})`
                  : ""
              }`}
              icon={t("icon_swap_horiz", "swap_horiz")}
            >
              <p className="text-xs font-semibold text-[var(--subtext)] leading-relaxed">
                {t(
                  "lab_test_save_option_copy_desc",
                  "Copy one of your existing save files as your {Lab} test baseline. During testing, in-game saves write to a disposable copy that is verified and automatically replaced by your clean airgapped baseline afterward."
                )}
              </p>

              {testSaveStatus?.available_live_saves &&
              testSaveStatus.available_live_saves.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {testSaveStatus.available_live_saves.map((saveItem: any) => {
                    const isCurrentActive =
                      testSaveStatus.active_test_save?.file_name?.toLowerCase() ===
                      saveItem.file_name.toLowerCase();
                    const formattedDate = saveItem.modified_epoch
                      ? new Date(saveItem.modified_epoch * 1000).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      : "";
                    return (
                      <div
                        key={saveItem.file_name}
                        onClick={() => {
                          if (!isConfiguringSave && !testSaveStatus?.game_running) {
                            handleCopyLiveSaveForLab(saveItem.file_name);
                          }
                        }}
                        className={`glass-panel rounded-2xl p-3.5 border flex flex-col justify-between gap-2.5 transition-all duration-200 ${
                          isCurrentActive
                            ? "sa-glass-pill-active"
                            : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)] cursor-pointer"
                        }`}
                      >
                        <div className="flex items-start gap-3 min-w-0 w-full">
                          <div
                            className={`w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 ${
                              isCurrentActive ? "text-[var(--success)]" : "text-[var(--accent)]"
                            }`}
                          >
                            <span className="material-symbols-outlined !text-[20px]">
                              {isCurrentActive
                                ? t("icon_verified_user", "verified_user")
                                : t("icon_save", "save")}
                            </span>
                          </div>

                          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                            <div className="relative group/modtitle flex items-center min-w-0 w-fit max-w-full">
                              <span className="text-sm font-black font-mono text-[var(--text)] tracking-tight leading-snug truncate">
                                {saveItem.file_name}
                              </span>
                              <HoverTooltip
                                className="z-[100]"
                                onlyWhenTruncated={true}
                                title={saveItem.file_name}
                                icon={t("icon_save", "save")}
                              />
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--subtext)] min-w-0 flex-wrap">
                              <span className="font-mono text-[10px] font-bold opacity-90 shrink-0">
                                {(saveItem.size_kb / 1024).toFixed(1)} MB
                              </span>
                              {formattedDate && (
                                <>
                                  <span className="opacity-40 shrink-0">&bull;</span>
                                  <span className="truncate opacity-85">{formattedDate}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                          <span className={VAULT_CHIP_CLASS}>
                            <span
                              className={`material-symbols-outlined !text-[12px] shrink-0 ${
                                isCurrentActive ? "text-[var(--success)]" : "text-[var(--subtext)]"
                              }`}
                            >
                              {isCurrentActive
                                ? t("icon_check_circle", "check_circle")
                                : t("icon_folder", "folder")}
                            </span>
                            <span>
                              {isCurrentActive
                                ? t("lab_test_save_btn_active", "Active Test Save")
                                : t("lab_test_save_live_chip", "Live Save")}
                            </span>
                          </span>

                          <button
                            type="button"
                            disabled={isConfiguringSave || Boolean(testSaveStatus?.game_running)}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyLiveSaveForLab(saveItem.file_name);
                            }}
                            className={`px-2.5 py-1 rounded-lg glass-surface border text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ml-auto ${
                              isCurrentActive
                                ? "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]"
                                : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--text)] hover:text-[var(--accent)]"
                            }`}
                          >
                            <span className="material-symbols-outlined !text-[14px]">
                              {isCurrentActive
                                ? t("icon_check", "check")
                                : t("icon_content_copy", "content_copy")}
                            </span>
                            <span>
                              {isCurrentActive
                                ? t("active", "Active")
                                : t("lab_test_save_btn_use_this", "Set as Test Save")}
                            </span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="glass-surface rounded-xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col items-center gap-3 text-center">
                  <span className="text-xs font-bold text-[var(--subtext)]">
                    {t(
                      "lab_test_save_no_live_saves",
                      "No existing save files found in your game saves folder. Import saves from disk above or create a new test save below."
                    )}
                  </span>
                  {(testSaveStatus?.vault_mirror_saves?.length || 0) > 0 && (
                    <ActionButton
                      variant="success"
                      icon={t("icon_restore", "restore")}
                      label={`${t(
                        "lab_test_save_btn_restore_mirror",
                        "Restore Live Saves From {Vault} Backup"
                      )} (${testSaveStatus?.vault_mirror_saves?.length || 0})`}
                      disabled={isConfiguringSave || Boolean(testSaveStatus?.game_running)}
                      onClick={handleRestoreLiveSavesFromVaultMirror}
                    />
                  )}
                </div>
              )}

              {(testSaveStatus?.available_live_saves?.length || 0) > 0 &&
                (testSaveStatus?.vault_mirror_saves?.length || 0) > 0 && (
                  <div className="flex items-center justify-between gap-3 pt-1 flex-wrap">
                    <span className="text-[11px] font-bold text-[var(--subtext)]">
                      {`${t(
                        "lab_test_save_mirror_count_label",
                        "Protected {Vault} Save Mirror Slots:"
                      )} ${testSaveStatus?.vault_mirror_saves?.length || 0}`}
                    </span>
                    <ActionButton
                      variant="glass"
                      icon={t("icon_restore", "restore")}
                      label={t(
                        "lab_test_save_btn_restore_mirror",
                        "Restore Live Saves From {Vault} Backup"
                      )}
                      disabled={isConfiguringSave || Boolean(testSaveStatus?.game_running)}
                      onClick={handleRestoreLiveSavesFromVaultMirror}
                    />
                  </div>
                )}
            </UniversalGroup>

            {/* Option D: Create a Fresh Test Save In-Game */}
            <UniversalGroup
              title={t("lab_test_save_option_fresh_title", "Create New Test Save In-Game")}
              icon={t("icon_add_circle", "add_circle")}
            >
              <p className="text-xs font-semibold text-[var(--subtext)] leading-relaxed">
                {t(
                  "lab_test_save_option_fresh_desc",
                  "Starts the Lab with an empty saves folder so you can start a new game and save it as your dedicated testing world. Your normal saves remain untouched."
                )}
              </p>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-1 ml-auto w-full">
                <ActionButton
                  variant="glass"
                  icon={t("icon_save", "save")}
                  label={t(
                    "lab_test_save_btn_use_fresh",
                    "Use Clean Sandbox (Create Save In-Game)"
                  )}
                  disabled={isConfiguringSave || Boolean(testSaveStatus?.game_running)}
                  onClick={() => handleResetForFreshSave(false)}
                />

                <ActionButton
                  variant="success"
                  icon={t("icon_launch", "rocket_launch")}
                  label={t(
                    "lab_test_save_btn_launch_create",
                    "Launch Game Now to Create Test Save"
                  )}
                  disabled={isConfiguringSave || Boolean(testSaveStatus?.game_running)}
                  onClick={() => handleResetForFreshSave(true)}
                />
              </div>
            </UniversalGroup>
          </div>
        </SidePanel>
      )}
    </>
  );
}
