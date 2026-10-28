import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { openPath } from "@tauri-apps/plugin-opener";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { useTooltipStore } from "../store/tooltipStore";
import { useLexicon } from "../LexiconContext";
import {
  SidePanel,
  StatBox,
  ActionButton,
  DashboardStatTile,
  PanelHeaderGroup,
  PanelHeaderButton,
  VAULT_CHIP_CLASS,
} from "../shared";
import {
  TimeCapsuleSnapshotDossier,
  parseBackupSignatureFallback,
} from "../side-panels/TimeCapsuleSidePanels";

export function BackupRestoreModals({
  isBackingUp,
  isRestoring,
  backupType,
  restoreType,
  t: propT,
}: any) {
  const { t: lexT } = useLexicon();
  const t = propT || lexT;

  const backupProgress = useStore((state) => state.backupProgress);
  const selectedVersion = useStore((state) => state.selectedVersion);
  const backupList = useStore((state) => state.backupList);

  const confirmDialog = useModalStore((state) => state.confirmDialog);
  const setConfirmDialog = useModalStore((state) => state.setConfirmDialog);
  const showDefconAlert = useModalStore((state) => state.showDefconAlert);
  const setShowDefconAlert = useModalStore((state) => state.setShowDefconAlert);
  const completedBackups = useModalStore((state) => state.completedBackups);
  const setCompletedBackups = useModalStore(
    (state) => state.setCompletedBackups
  );
  const isDefconBackupSession = useModalStore(
    (state) => state.isDefconBackupSession
  );
  const setIsDefconBackupSession = useModalStore(
    (state) => state.setIsDefconBackupSession
  );

  const [selectedCompletedIdx, setSelectedCompletedIdx] = useState(0);
  const [activeLocation, setActiveLocation] = useState("");

  useEffect(() => {
    if (completedBackups.length > 0) {
      setSelectedCompletedIdx(completedBackups.length - 1);
    } else {
      setSelectedCompletedIdx(0);
    }
  }, [completedBackups.length]);

  const isDefconPrompt = Boolean(confirmDialog?.isDefcon);
  const isBusy = Boolean(isBackingUp || isRestoring);
  const isPostSummary =
    !isDefconPrompt &&
    !isBusy &&
    (completedBackups.length > 0 || showDefconAlert);

  const isOpen = isDefconPrompt || isBusy || isPostSummary;
  const isLocked = isDefconPrompt || isBusy;

  // Apply OS-wide Malware-style lockdown while Defcon Prompt or Active Backup/Restore is running
  useEffect(() => {
    if (!isLocked || typeof document === "undefined") {
      useTooltipStore.getState().clearTooltip();
      return;
    }

    window.dispatchEvent(
      new CustomEvent("sa-close-popovers", { detail: "backup-lockdown" })
    );
    try {
      useModalStore.getState().setIsSideBrowserOpen(false);
    } catch (_) {}

    document.body.classList.add("sa-malware-lockdown");
    const osShell = document.getElementById("sanctuary-os-shell");
    if (osShell) {
      osShell.setAttribute("inert", "");
    }

    const blockKeys = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" ||
        e.key === "F5" ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r")
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener("keydown", blockKeys, true);
    return () => {
      window.removeEventListener("keydown", blockKeys, true);
      const otherLockdown = document.querySelector(
        '[data-sa-malware-active="true"]'
      );
      if (!otherLockdown) {
        document.body.classList.remove("sa-malware-lockdown");
        if (osShell) {
          osShell.removeAttribute("inert");
        }
      }
      useTooltipStore.getState().clearTooltip();
    };
  }, [isLocked]);

  if (!isOpen) return null;

  const handleCloseSummary = () => {
    if (isLocked) return;
    setCompletedBackups([]);
    setShowDefconAlert(false);
    setIsDefconBackupSession(false);
  };

  const handleDefconCancel = () => {
    if (confirmDialog?.cancelAction) {
      confirmDialog.cancelAction();
    } else {
      setConfirmDialog(null);
    }
  };

  const handleDefconConfirm = () => {
    if (typeof confirmDialog?.action === "function") {
      confirmDialog.action();
    } else {
      setConfirmDialog(null);
    }
  };

  const isEngineBackup = backupType === "engine";
  const isEngineRestore = restoreType === "engine";
  const isEngineMode = isBackingUp ? isEngineBackup : isEngineRestore;
  const isDangerTheme =
    isDefconPrompt ||
    ((isBackingUp || isPostSummary) &&
      (isDefconBackupSession || showDefconAlert));

  const categoryLabel = isEngineMode
    ? t("engine_full", "Engine Core")
    : t("world_state", "World State");

  const activeTitle = isDefconPrompt
    ? confirmDialog?.title || t("tile_global_alert", "Global Alert")
    : isBusy
      ? isBackingUp
        ? isEngineBackup
          ? t("overlay_sealing_engine", "Sealing Engine Core")
          : t("overlay_sealing_world", "Sealing World State")
        : isEngineRestore
          ? t("overlay_restoring_engine", "Restoring Engine Core")
          : t("overlay_restoring_world", "Restoring World State")
      : t("tc_complete_title", "Snapshot Complete");

  const activeSubtitle = isDefconPrompt
    ? t("defcon_panel_subtitle", "Emergency Pre-Patch Protection")
    : isBusy
      ? categoryLabel
      : t(
          "tc_complete_subtitle",
          "Point-in-time backup verified and indexed"
        );

  const activeIcon = isDefconPrompt
    ? t("icon_warning_amber", "warning")
    : isBusy
      ? isBackingUp
        ? t("icon_archive", "archive")
        : t("icon_unarchive", "unarchive")
      : t("icon_verified", "verified");

  const activeIconColorClass = isDefconPrompt
    ? "text-[var(--danger)]"
    : isBusy
      ? isDangerTheme
        ? "text-[var(--danger)]"
        : "text-[var(--accent)]"
      : "text-[var(--success)]";

  const rawPct = backupProgress
    ? Math.round(
        ((backupProgress.current || 0) / (backupProgress.total || 100)) * 100
      )
    : 0;
  const pct = Math.min(100, Math.max(0, rawPct));

  const cleanVersion = selectedVersion
    ? String(selectedVersion).replace(/^v\.?/i, "").trim()
    : "";

  const versionDisplay = cleanVersion
    ? `${t("tc_version_prefix", "v.")}${cleanVersion}`
    : categoryLabel;

  const filesDisplay = backupProgress?.files_total
    ? `${Number(backupProgress.files_done || 0).toLocaleString()} / ${Number(
        backupProgress.files_total
      ).toLocaleString()}`
    : `${pct}%`;

  const lockDesc = isBackingUp
    ? isEngineBackup
      ? t(
          "overlay_sealing_engine_desc",
          "Sanctuary OS is temporarily locked while the Engine Core is sealed."
        )
      : t(
          "overlay_sealing_world_desc",
          "Sanctuary OS is temporarily locked while your World State is sealed."
        )
    : isEngineRestore
      ? t(
          "overlay_restoring_engine_desc",
          "Sanctuary OS is temporarily locked while the Engine Core is restored."
        )
      : t(
          "overlay_restoring_world_desc",
          "Sanctuary OS is temporarily locked while your World State is restored."
        );

  // Determine the snapshot to inspect in Post-Backup Summary mode
  const fallbackLatestBackup =
    completedBackups.length === 0 && Array.isArray(backupList) && backupList[0]
      ? typeof backupList[0] === "string"
        ? backupList[0]
        : backupList[0].name
      : null;

  const activeCompletedBackup =
    completedBackups[selectedCompletedIdx] ||
    completedBackups[0] ||
    fallbackLatestBackup;

  const handleOpenActiveFolder = async () => {
    if (!activeLocation) return;
    try {
      await openPath(activeLocation);
    } catch (e) {
      console.error(e);
    }
  };

  const portalRoot =
    (typeof document !== "undefined" &&
      document.getElementById("sa-portals")) ||
    (typeof document !== "undefined" ? document.body : null);

  const lockShieldOverlay = isLocked ? (
    <div
      data-sa-malware-active="true"
      className="fixed inset-0 z-[59998] pointer-events-auto select-none cursor-passkey-locked"
      onMouseMove={(e) => {
        useTooltipStore.getState().setTooltip({
          title: isDefconPrompt
            ? t(
                "defcon_lockdown_cursor_tooltip",
                "Emergency Patch Alert Active"
              )
            : isRestoring
              ? t(
                  "restore_lockdown_cursor_tooltip",
                  "Snapshot Restore In Progress"
                )
              : t(
                  "backup_lockdown_cursor_tooltip",
                  "Snapshot Operation In Progress"
                ),
          subtitle: isDefconPrompt
            ? t(
                "defcon_lockdown_cursor_sub",
                "Choose Skip or Backup in the side panel to continue."
              )
            : t(
                "backup_lockdown_cursor_sub",
                "Please wait for the active backup or restore to finish."
              ),
          variant: isDefconPrompt || isDangerTheme ? "danger" : "accent",
          icon: t("icon_block", "block"),
          x: e.clientX,
          y: e.clientY - 14,
          align: "center",
          vAlign: "top",
        });
      }}
      onMouseLeave={() => {
        useTooltipStore.getState().clearTooltip();
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    />
  ) : null;

  return (
    <>
      {lockShieldOverlay &&
        (portalRoot
          ? createPortal(lockShieldOverlay, portalRoot)
          : lockShieldOverlay)}

      <SidePanel
        isOpen={isOpen}
        onClose={handleCloseSummary}
        hideCloseButton={isLocked}
        passthroughBackdrop={isLocked}
        noBackdropDim={isLocked}
        backdropZ="z-[60000]"
        panelZ="z-[60001]"
        panelClass="sa-malware-lockdown-panel"
        widthClass="w-[90vw] md:w-[840px]"
        isResizable={!isLocked}
        defaultWidth={840}
        title={activeTitle}
        subtitle={activeSubtitle}
        icon={activeIcon}
        iconColorClass={activeIconColorClass}
        headerActions={
          isPostSummary && activeLocation ? (
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon={t("icon_folder_open", "folder_open")}
                tooltip={t("tc_open_in_explorer", "Open in Explorer")}
                onClick={handleOpenActiveFolder}
              />
            </PanelHeaderGroup>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-4 mt-2 pb-6">
          {/* STATE 1: DEFCON LOCKED PROMPT */}
          {isDefconPrompt && (
            <>
              {/* Urgent Alert Hero Card */}
              <div
                className="glass-panel rounded-2xl p-6 border flex flex-col gap-4 relative overflow-hidden"
                style={{
                  borderColor:
                    "color-mix(in srgb, var(--danger) 42%, transparent)",
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--danger)] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined !text-[22px] animate-pulse">
                        {t("icon_warning_amber", "warning")}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 min-w-0">
                      <span className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--danger)]">
                        {confirmDialog?.badgeLabel ||
                          t("urgent_alert", "Urgent Alert")}
                      </span>
                      <h3 className="text-lg md:text-xl font-black tracking-tight text-[var(--text)] m-0 leading-snug">
                        {confirmDialog?.title ||
                          t("tile_global_alert", "Global Alert")}
                      </h3>
                    </div>
                  </div>

                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--danger)]">
                      {t("icon_shield", "shield")}
                    </span>
                    {t("defcon_patch_detected", "Patch Detected")}
                  </span>
                </div>

                <div className="rounded-xl p-4 bg-[color-mix(in_srgb,var(--danger)_6%,transparent)] border border-[color-mix(in_srgb,var(--danger)_22%,transparent)]">
                  <p className="text-sm font-semibold text-[var(--text)] leading-relaxed whitespace-pre-line m-0">
                    {confirmDialog?.message}
                  </p>
                </div>
              </div>

              {/* Emergency Backup Scope Card */}
              <div className="glass-panel rounded-2xl p-5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3.5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined !text-[18px]">
                        {t("icon_archive", "archive")}
                      </span>
                    </div>
                    <span className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                      {t("defcon_card_scope_title", "Emergency Backup Scope")}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={VAULT_CHIP_CLASS}>
                      <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--accent)]">
                        {t("icon_public", "public")}
                      </span>
                      {t("world_state", "World State")}
                    </span>
                    <span className={VAULT_CHIP_CLASS}>
                      <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--danger)]">
                        {t("icon_settings", "settings")}
                      </span>
                      {t("engine_full", "Engine Core")}
                    </span>
                  </div>
                </div>

                <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                  {t(
                    "defcon_card_scope_desc",
                    "Hardlink deduplication copies only modified files since your last snapshot while preserving a complete standalone point-in-time backup."
                  )}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <StatBox
                    icon={t("icon_public", "public")}
                    iconColorClass="text-[var(--accent)]"
                    label={t("game_version", "Game Version")}
                    value={<span className="font-mono">{versionDisplay}</span>}
                  />
                  <StatBox
                    icon={t("icon_link", "link")}
                    iconColorClass="text-[var(--success)]"
                    label={t("defcon_stat_storage_mode", "Storage Mode")}
                    value={t("defcon_stat_delta_only", "Changed Files Only")}
                  />
                </div>
              </div>

              {/* Action Buttons (Unlocks OS when Skip is clicked, or runs Backup when Backup is clicked) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <ActionButton
                  variant="glass"
                  icon={t("icon_close", "close")}
                  label={
                    confirmDialog?.cancelText || t("defcon_btn_skip", "Skip")
                  }
                  onClick={handleDefconCancel}
                  className="w-full !py-3.5 justify-center"
                />
                <ActionButton
                  variant="danger"
                  icon={t("icon_shield", "shield")}
                  label={
                    confirmDialog?.confirmText ||
                    t("defcon_btn_backup", "Backup")
                  }
                  onClick={handleDefconConfirm}
                  className="w-full !py-3.5 justify-center"
                />
              </div>
            </>
          )}

          {/* STATE 2: ACTIVE BACKUP OR RESTORE PROGRESS (LOCKED) */}
          {!isDefconPrompt && isBusy && (
            <>
              <div
                className="glass-panel rounded-2xl p-5 border flex flex-col gap-5"
                style={{
                  borderColor: isDangerTheme
                    ? "color-mix(in srgb, var(--danger) 38%, transparent)"
                    : "color-mix(in srgb, var(--accent) 32%, transparent)",
                }}
              >
                {/* Header & Live Percentage */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 ${
                        isDangerTheme
                          ? "text-[var(--danger)]"
                          : "text-[var(--accent)]"
                      }`}
                    >
                      <span className="material-symbols-outlined !text-[22px] animate-pulse">
                        {activeIcon}
                      </span>
                    </div>

                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span
                        className={`text-[10px] font-black uppercase tracking-[0.18em] ${
                          isDangerTheme
                            ? "text-[var(--danger)]"
                            : "text-[var(--accent)]"
                        }`}
                      >
                        {categoryLabel}
                      </span>
                      <h3 className="text-lg md:text-xl font-black tracking-tight text-[var(--text)] leading-tight m-0 truncate">
                        {activeTitle}
                      </h3>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    <span
                      className={`text-2xl md:text-3xl font-black font-mono tracking-tight leading-none ${
                        isDangerTheme
                          ? "text-[var(--danger)]"
                          : "text-[var(--accent)]"
                      }`}
                    >
                      {pct}%
                    </span>
                  </div>
                </div>

                {/* 2-Column Telemetry StatBoxes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <StatBox
                    icon={
                      isEngineMode
                        ? t("icon_settings", "settings")
                        : t("icon_public", "public")
                    }
                    iconColorClass={
                      isDangerTheme
                        ? "text-[var(--danger)]"
                        : "text-[var(--accent)]"
                    }
                    label={t("game_version", "Game Version")}
                    value={<span className="font-mono">{versionDisplay}</span>}
                  />
                  <StatBox
                    icon={t("icon_folder", "folder")}
                    iconColorClass={
                      isDangerTheme
                        ? "text-[var(--danger)]"
                        : "text-[var(--accent)]"
                    }
                    label={t("modal_files", "Files")}
                    value={<span className="font-mono">{filesDisplay}</span>}
                  />
                </div>

                {/* Progress Track & Live File Stream */}
                <div className="w-full rounded-2xl p-4 bg-[color-mix(in_srgb,var(--text)_4%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3">
                  <div className="w-full h-2.5 rounded-full bg-[color-mix(in_srgb,var(--text)_8%,transparent)] overflow-hidden border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                    <div
                      className="h-full transition-all duration-300 rounded-full relative overflow-hidden"
                      style={{
                        width: `${Math.max(4, pct)}%`,
                        background: isDangerTheme
                          ? "linear-gradient(90deg, color-mix(in srgb, var(--danger) 75%, white), var(--danger))"
                          : "linear-gradient(90deg, color-mix(in srgb, var(--accent) 75%, white), var(--accent))",
                        boxShadow: isDangerTheme
                          ? "0 0 12px color-mix(in srgb, var(--danger) 55%, transparent)"
                          : "0 0 12px color-mix(in srgb, var(--accent) 55%, transparent)",
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3 text-[11px] font-mono text-[var(--subtext)]">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span
                        className={`material-symbols-outlined !text-[14px] shrink-0 ${
                          isDangerTheme
                            ? "text-[var(--danger)]"
                            : "text-[var(--accent)]"
                        }`}
                      >
                        {t("icon_folder_open", "folder_open")}
                      </span>
                      <span className="truncate">
                        {backupProgress?.current_file ||
                          backupProgress?.action ||
                          t("defcon_stand_by", "Stand by...")}
                      </span>
                    </div>
                  </div>
                </div>

                <p className="text-[11px] font-medium text-[var(--subtext)] opacity-80 leading-relaxed m-0 text-center">
                  {lockDesc}
                </p>
              </div>
            </>
          )}

          {/* STATE 3: POST-BACKUP SUMMARY & DIFFS (UNLOCKED, STAYS OPEN UNTIL CLOSED) */}
          {isPostSummary && (
            <>
              {/* If multiple snapshots were created in this session (e.g., Defcon World State + Engine Core), show a DashboardStatTile switcher */}
              {completedBackups.length > 1 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {completedBackups.map((bName, idx) => {
                    const sig = parseBackupSignatureFallback(bName, t);
                    const isEng = sig.isEngine;
                    const label = isEng
                      ? t("engine_full", "Engine Core")
                      : t("world_state", "World State");
                    return (
                      <DashboardStatTile
                        key={bName}
                        variant="filter"
                        className="!w-full"
                        icon={
                          isEng
                            ? t("icon_settings", "settings")
                            : t("icon_public", "public")
                        }
                        label={label}
                        number={sig.version || bName}
                        isActive={selectedCompletedIdx === idx}
                        onClick={() => setSelectedCompletedIdx(idx)}
                      />
                    );
                  })}
                </div>
              )}

              <TimeCapsuleSnapshotDossier
                selectedBackup={activeCompletedBackup}
                isPostBackupSummary={true}
                onClosePanel={handleCloseSummary}
                onLocationChange={setActiveLocation}
              />
            </>
          )}
        </div>
      </SidePanel>
    </>
  );
}
