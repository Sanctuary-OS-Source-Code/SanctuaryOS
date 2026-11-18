import React from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLexicon } from "../../LexiconContext";
import {
  SidePanel,
  HoverTooltip,
  ActionButton,
  SidePanelHeroCard,
  StatBox,
  UniversalGroup,
  VAULT_CHIP_CLASS,
} from "../../shared";
import { useStore } from "../../store";

import { formatByteSize, type ModVersionBinaryGroup } from "./versionPoolGrouping";

export function ModVersionHistorySidePanel({
  group,
  groups,
  parentTitle,
  isOpen,
  onClose,
  onActivateVersion,
  onActivateBatchVersions,
  onResetToAutoSwap,
  onDeleteVersion,
  onRefresh,
  runRadarSweep,
  setStatus,
}: {
  group?: ModVersionBinaryGroup | null;
  groups?: ModVersionBinaryGroup[];
  parentTitle?: string;
  isOpen: boolean;
  onClose: () => void;
  onActivateVersion: (relPath: string, dnaHash: string) => void;
  onActivateBatchVersions?: (targets: { rel_path: string; dna_hash: string }[]) => void;
  onResetToAutoSwap?: (relPaths: string[]) => void;
  onDeleteVersion: (relPath: string, dnaHash: string) => void;
  onRefresh?: () => Promise<void> | void;
  runRadarSweep?: (silent?: boolean, skipSync?: boolean) => void;
  setStatus?: (msg: string) => void;
}) {
  const { t } = useLexicon();
  const resolvedGroups = React.useMemo(() => {
    if (Array.isArray(groups) && groups.length > 0) return groups;
    if (group) return [group];
    return [];
  }, [group, groups]);

  const [selectedSubKey, setSelectedSubKey] = React.useState<string | null>(null);
  const [isBusy, setIsBusy] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen) {
      setSelectedSubKey(null);
    } else if (
      selectedSubKey &&
      !resolvedGroups.some((g) => g.key === selectedSubKey)
    ) {
      setSelectedSubKey(null);
    }
  }, [isOpen, resolvedGroups, selectedSubKey]);

  const handleBatchActivate = React.useCallback(
    async (targets: { rel_path: string; dna_hash: string }[]) => {
      if (!targets || targets.length === 0 || isBusy) return;
      if (onActivateBatchVersions) {
        onActivateBatchVersions(targets);
        return;
      }
      setIsBusy(true);
      try {
        let vaultPath = useStore.getState().vaultPath;
        if (!vaultPath) {
          const cfg: any = await invoke("get_saved_coordinates");
          vaultPath = cfg?.vault_path || "";
        }
        if (!vaultPath) return;
        await invoke("activate_archived_mod_versions_batch", {
          vaultPath,
          targets,
        });
        if (onRefresh) await onRefresh();
        if (runRadarSweep) runRadarSweep(true, true);
        if (setStatus) {
          setStatus(
            t(
              "version_pool_toast_family_switched",
              "Switched {Mod} family to selected revision."
            )
          );
        }
      } catch (e) {
        console.warn("Batch version activation failed:", e);
      } finally {
        setIsBusy(false);
      }
    },
    [isBusy, onActivateBatchVersions, onRefresh, runRadarSweep, setStatus, t]
  );

  const handleResetAutoSwap = React.useCallback(
    async (relPaths: string[]) => {
      if (isBusy) return;
      if (onResetToAutoSwap) {
        onResetToAutoSwap(relPaths);
        return;
      }
      setIsBusy(true);
      try {
        let vaultPath = useStore.getState().vaultPath;
        if (!vaultPath) {
          const cfg: any = await invoke("get_saved_coordinates");
          vaultPath = cfg?.vault_path || "";
        }
        if (!vaultPath) return;
        const targetGameVersion = String(
          useStore.getState().selectedVersion || ""
        );
        await invoke("reset_mod_versions_to_auto", {
          vaultPath,
          relPaths,
          targetGameVersion,
        });
        if (onRefresh) await onRefresh();
        if (runRadarSweep) runRadarSweep(true, true);
        if (setStatus) {
          setStatus(
            t(
              "version_pool_toast_auto_swap",
              "Reset {Mod} version routing to automatic game-version matching."
            )
          );
        }
      } catch (e) {
        console.warn("Reset to auto-swap failed:", e);
      } finally {
        setIsBusy(false);
      }
    },
    [isBusy, onResetToAutoSwap, onRefresh, runRadarSweep, setStatus, t]
  );

  if (!isOpen || resolvedGroups.length === 0) return null;

  const isMultiModule = resolvedGroups.length > 1;
  const activeGroup = isMultiModule
    ? resolvedGroups.find((g) => g.key === selectedSubKey) || null
    : resolvedGroups[0];

  const renderSingleGroupTimeline = (
    targetGroup: ModVersionBinaryGroup,
    onClosePanel: () => void,
    backdropZ: string,
    panelZ: string
  ) => {
    const olderCount = targetGroup.versions.filter((v: any) => !v.is_active).length;
    const isTargetPinned = Boolean(
      targetGroup.isPinned ||
        targetGroup.versions.some((v: any) => Boolean(v.is_pinned))
    );
    const isOldRevisionLinked =
      targetGroup.versions.length > 1 && !Boolean(targetGroup.versions[0]?.is_active);

    return (
      <SidePanel
        isOpen={true}
        onClose={onClosePanel}
        backdropZ={backdropZ}
        panelZ={panelZ}
        title={targetGroup.displayTitle}
        subtitle={`${targetGroup.typeLabel} • ${targetGroup.versions.length} ${
          targetGroup.versions.length === 1
            ? t("revision", "Revision")
            : t("revisions", "Revisions")
        }`}
        icon={
          targetGroup.isScript
            ? t("icon_terminal", "terminal")
            : t("icon_history", "history")
        }
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[720px]"
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={
              targetGroup.isScript
                ? t("icon_terminal", "terminal")
                : t("icon_deployed_code", "deployed_code")
            }
            overline={targetGroup.typeLabel}
            title={targetGroup.displayTitle}
            badge={
              isTargetPinned
                ? t("version_pool_badge_manual_pin", "Manual Override")
                : t("version_pool_badge_auto_swap", "Auto-Swap")
            }
            badgeIcon={
              isTargetPinned
                ? t("icon_push_pin", "push_pin")
                : t("icon_autorenew", "autorenew")
            }
            variant="accent"
          >
            <div className="flex flex-col gap-2.5 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <StatBox
                  label={t("revisions", "Revisions")}
                  value={targetGroup.versions.length}
                  icon={t("icon_inventory_2", "inventory_2")}
                  iconColorClass="text-[var(--accent)]"
                />
                <StatBox
                  label={t("version_pool_older_versions", "Legacy Versions")}
                  value={olderCount}
                  icon={t("icon_history", "history")}
                  iconColorClass="text-[var(--warning)]"
                />
                <StatBox
                  label={t("version_pool_reclaimable_space", "Reclaimable Space")}
                  value={formatByteSize(targetGroup.reclaimableBytes)}
                  icon={t("icon_cleaning_services", "cleaning_services")}
                  iconColorClass="text-[var(--success)]"
                />
              </div>
              {(isTargetPinned || isOldRevisionLinked) && (
                <div className="flex items-center justify-end pt-1">
                  <ActionButton
                    variant="accent"
                    icon={t("icon_autorenew", "autorenew")}
                    label={t("version_pool_btn_auto_swap", "Auto-Swap Versions")}
                    disabled={isBusy}
                    onClick={() => handleResetAutoSwap([targetGroup.relPath])}
                  />
                </div>
              )}
            </div>
          </SidePanelHeroCard>

          <UniversalGroup
            title={`${t("revisions", "Revisions")} (${
              targetGroup.versions.length
            })`}
            icon={t("icon_history", "history")}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {targetGroup.versions.map((item: any, idx: number) => {
                const compatStr =
                  Array.isArray(item.compatible_versions) &&
                  item.compatible_versions.length > 0
                    ? item.compatible_versions.join(", ")
                    : t("any", "Any");
                const verLabel = item.mod_version
                  ? `${t("version", "Version")} ${item.mod_version}`
                  : `${t("revision", "Revision")} #${
                      targetGroup.versions.length - idx
                    }`;
                const recordedDate = item.recorded_at
                  ? new Date(Number(item.recorded_at) * 1000).toLocaleDateString()
                  : t("source_local", "Local");
                const ageLabel =
                  idx === 0
                    ? t("version_pool_newest", "Newest")
                    : idx === targetGroup.versions.length - 1 &&
                        targetGroup.versions.length > 1
                      ? t("version_pool_oldest", "Oldest")
                      : null;
                const innerGhostClass = !item.is_active
                  ? "opacity-50 grayscale group-hover/vercard:opacity-100 group-hover/vercard:grayscale-0 transition-all duration-300"
                  : "";

                return (
                  <div
                    key={`${item.rel_path}-${item.dna_hash}-${idx}`}
                    className={`relative group/vercard flex flex-col justify-between gap-3 p-3.5 glass-panel rounded-2xl border transition-all ${
                      item.is_active
                        ? "border-[color-mix(in_srgb,var(--success)_55%,rgba(255,255,255,0.28))] shadow-[0_0_24px_color-mix(in_srgb,var(--success)_14%,transparent)]"
                        : "!border-dashed border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:!border-solid hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
                    }`}
                  >
                    {!item.is_active && (
                      <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-black/20 group-hover/vercard:bg-transparent transition-colors duration-300" />
                    )}
                    {/* Top Row: Liquid Glass Icon Well + Title & Subtitle */}
                    <div
                      className={`relative z-10 flex items-center gap-3 min-w-0 ${innerGhostClass}`}
                    >
                      <div
                        className={`w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 ${
                          item.is_active
                            ? "text-[var(--success)]"
                            : "text-[var(--accent)]"
                        }`}
                      >
                        <span className="material-symbols-outlined !text-[20px]">
                          {item.is_active
                            ? t("icon_verified_user", "verified_user")
                            : t("icon_history", "history")}
                        </span>
                      </div>

                      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <span className="text-sm font-black text-[var(--text)] tracking-tight leading-snug truncate">
                          {verLabel}
                        </span>
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--subtext)] min-w-0">
                          {ageLabel && (
                            <>
                              <span className="text-[var(--accent)] shrink-0">
                                {ageLabel}
                              </span>
                              <span className="opacity-40 shrink-0">•</span>
                            </>
                          )}
                          <span className="opacity-85 shrink-0">
                            {recordedDate}
                          </span>
                          <span className="opacity-40 shrink-0">•</span>
                          <span className="opacity-85 shrink-0">
                            {formatByteSize(item.size_bytes || 0)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Status & Action Bar */}
                    <div className="relative z-10 pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                      <div
                        className={`flex items-center gap-1.5 min-w-0 flex-wrap ${innerGhostClass}`}
                      >
                        {item.is_active && (
                          <span className={VAULT_CHIP_CLASS}>
                            <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--success)]">
                              {t("icon_check_circle", "check_circle")}
                            </span>
                            <span>
                              {t("version_pool_badge_linked", "Linked")}
                            </span>
                          </span>
                        )}
                        <span className={VAULT_CHIP_CLASS}>
                          <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--accent)]">
                            {t("icon_sports_esports", "sports_esports")}
                          </span>
                          <span>{compatStr}</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                        {!item.is_active && (
                          <button
                            type="button"
                            onClick={() =>
                              onActivateVersion(
                                targetGroup.relPath,
                                item.dna_hash
                              )
                            }
                            className="relative group/actionbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--success)_40%,transparent)] hover:border-[var(--success)] text-[var(--success)] flex items-center justify-center transition-all cursor-pointer shrink-0"
                          >
                            <span className="material-symbols-outlined !text-[15px]">
                              {t("icon_check", "check")}
                            </span>
                            <HoverTooltip
                              className="z-[100] !right-0 !translate-x-0 !left-auto"
                              title={t(
                                "version_pool_btn_use_version",
                                "Link Version"
                              )}
                              icon={t("icon_check", "check")}
                            />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            onDeleteVersion(targetGroup.relPath, item.dna_hash)
                          }
                          className="relative group/actionbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] hover:border-[var(--danger)] text-[var(--danger)] flex items-center justify-center transition-all cursor-pointer shrink-0"
                        >
                          <span className="material-symbols-outlined !text-[15px]">
                            {t("icon_delete", "delete")}
                          </span>
                          <HoverTooltip
                            className="z-[100] !right-0 !translate-x-0 !left-auto"
                            title={t("delete", "Delete")}
                            icon={t("icon_delete", "delete")}
                            variant="danger"
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </UniversalGroup>
        </div>
      </SidePanel>
    );
  };

  if (!isMultiModule && activeGroup) {
    return renderSingleGroupTimeline(
      activeGroup,
      onClose,
      "z-[120010]",
      "z-[120011]"
    );
  }

  const suiteTitle =
    parentTitle ||
    t("version_pool_title", "{Mod} Version History");
  const totalSuiteOlder = resolvedGroups.reduce(
    (acc, g) => acc + g.versions.filter((v: any) => !v.is_active).length,
    0
  );
  const totalSuiteReclaimable = resolvedGroups.reduce(
    (acc, g) => acc + g.reclaimableBytes,
    0
  );
  const anySuitePinned = resolvedGroups.some(
    (g) => Boolean(g.isPinned) || g.versions.some((v: any) => Boolean(v.is_pinned))
  );
  const maxSuiteRevs = Math.max(
    1,
    ...resolvedGroups.map((g) => g.versions.length)
  );
  const familyRevisions = Array.from({ length: maxSuiteRevs }, (_, stepIdx) => {
    const revNum = maxSuiteRevs - stepIdx;
    const targets: { rel_path: string; dna_hash: string; item: any; group: ModVersionBinaryGroup }[] = [];
    for (const g of resolvedGroups) {
      const picked = g.versions[Math.min(stepIdx, g.versions.length - 1)];
      if (picked) {
        targets.push({
          rel_path: g.relPath,
          dna_hash: picked.dna_hash,
          item: picked,
          group: g,
        });
      }
    }
    const activeCount = targets.filter((x) => Boolean(x.item?.is_active)).length;
    const isAllActive = targets.length > 0 && activeCount === targets.length;
    const totalSize = targets.reduce(
      (acc, x) => acc + (Number(x.item?.size_bytes) || 0),
      0
    );
    const latestEpoch = Math.max(
      0,
      ...targets.map((x) => Number(x.item?.recorded_at) || 0)
    );
    const compatSet = new Set<string>();
    targets.forEach((x) => {
      if (Array.isArray(x.item?.compatible_versions)) {
        x.item.compatible_versions.forEach((cv: string) => {
          if (cv && String(cv).trim()) compatSet.add(String(cv).trim());
        });
      }
    });
    const compatStr =
      compatSet.size > 0 ? Array.from(compatSet).join(", ") : t("any", "Any");

    return {
      stepIdx,
      revNum,
      targets,
      activeCount,
      isAllActive,
      totalSize,
      latestEpoch,
      compatStr,
    };
  });

  const anyOldSuiteRevisionLinked =
    familyRevisions.length > 1 && !Boolean(familyRevisions[0]?.isAllActive);

  return (
    <>
      <SidePanel
        isOpen={isOpen}
        onClose={onClose}
        backdropZ="z-[120010]"
        panelZ="z-[120011]"
        title={suiteTitle}
        subtitle={`${resolvedGroups.length} ${t(
          "badge_modules_count",
          "Modules"
        )} • ${
          maxSuiteRevs === 1
            ? `${t("revision", "Revision")} #1`
            : `${maxSuiteRevs} ${t("revisions", "Revisions")}`
        }`}
        icon={t("icon_account_tree", "account_tree")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[760px]"
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_account_tree", "account_tree")}
            overline={t("version_pool_title", "{Mod} Version History")}
            title={suiteTitle}
            badge={
              anySuitePinned
                ? t("version_pool_badge_manual_pin", "Manual Override")
                : t("version_pool_badge_auto_swap", "Auto-Swap")
            }
            badgeIcon={
              anySuitePinned
                ? t("icon_push_pin", "push_pin")
                : t("icon_autorenew", "autorenew")
            }
            variant="accent"
          >
            <div className="flex flex-col gap-2.5 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <StatBox
                  label={t("badge_modules_count", "Modules")}
                  value={resolvedGroups.length}
                  icon={t("icon_account_tree", "account_tree")}
                  iconColorClass="text-[var(--accent)]"
                />
                <StatBox
                  label={t("version_pool_older_versions", "Legacy Versions")}
                  value={totalSuiteOlder}
                  icon={t("icon_history", "history")}
                  iconColorClass="text-[var(--warning)]"
                />
                <StatBox
                  label={t("version_pool_reclaimable_space", "Reclaimable Space")}
                  value={formatByteSize(totalSuiteReclaimable)}
                  icon={t("icon_cleaning_services", "cleaning_services")}
                  iconColorClass="text-[var(--success)]"
                />
              </div>

              {(anySuitePinned || anyOldSuiteRevisionLinked) && (
                <div className="flex items-center justify-end pt-1">
                  <ActionButton
                    variant="accent"
                    icon={t("icon_autorenew", "autorenew")}
                    label={t("version_pool_btn_auto_swap", "Auto-Swap Versions")}
                    disabled={isBusy}
                    onClick={() =>
                      handleResetAutoSwap(resolvedGroups.map((g) => g.relPath))
                    }
                  />
                </div>
              )}
            </div>
          </SidePanelHeroCard>

          {familyRevisions.length > 1 && (
            <UniversalGroup
              title={`${t("version_pool_family_rollback", "Family Rollback")} (${
                familyRevisions.length
              })`}
              icon={t("icon_history", "history")}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {familyRevisions.map((fRev) => {
                  const ageLabel =
                    fRev.stepIdx === 0
                      ? t("version_pool_newest", "Newest")
                      : fRev.stepIdx === familyRevisions.length - 1 &&
                          familyRevisions.length > 1
                        ? t("version_pool_oldest", "Oldest")
                        : null;
                  const recordedDate = fRev.latestEpoch
                    ? new Date(fRev.latestEpoch * 1000).toLocaleDateString()
                    : t("source_local", "Local");
                  const innerGhostClass = !fRev.isAllActive
                    ? "opacity-50 grayscale group-hover/vercard:opacity-100 group-hover/vercard:grayscale-0 transition-all duration-300"
                    : "";

                  return (
                    <div
                      key={`family-rev-${fRev.revNum}`}
                      className={`relative group/vercard flex flex-col justify-between gap-3 p-3.5 glass-panel rounded-2xl border transition-all ${
                        fRev.isAllActive
                          ? "border-[color-mix(in_srgb,var(--success)_55%,rgba(255,255,255,0.28))] shadow-[0_0_24px_color-mix(in_srgb,var(--success)_14%,transparent)]"
                          : "!border-dashed border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:!border-solid hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
                      }`}
                    >
                      {!fRev.isAllActive && (
                        <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-black/20 group-hover/vercard:bg-transparent transition-colors duration-300" />
                      )}

                      <div
                        className={`relative z-10 flex items-center gap-3 min-w-0 ${innerGhostClass}`}
                      >
                        <div
                          className={`w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 ${
                            fRev.isAllActive
                              ? "text-[var(--success)]"
                              : "text-[var(--accent)]"
                          }`}
                        >
                          <span className="material-symbols-outlined !text-[20px]">
                            {fRev.isAllActive
                              ? t("icon_verified_user", "verified_user")
                              : t("icon_history", "history")}
                          </span>
                        </div>

                        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                          <span className="text-sm font-black text-[var(--text)] tracking-tight leading-snug truncate">
                            {`${t(
                              "version_pool_family_revision",
                              "Family Revision"
                            )} #${fRev.revNum}`}
                          </span>
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--subtext)] min-w-0">
                            {ageLabel && (
                              <>
                                <span className="text-[var(--accent)] shrink-0">
                                  {ageLabel}
                                </span>
                                <span className="opacity-40 shrink-0">•</span>
                              </>
                            )}
                            <span className="opacity-85 shrink-0">
                              {recordedDate}
                            </span>
                            <span className="opacity-40 shrink-0">•</span>
                            <span className="opacity-85 shrink-0">
                              {formatByteSize(fRev.totalSize)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="relative z-10 pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                        <div
                          className={`flex items-center gap-1.5 min-w-0 flex-wrap ${innerGhostClass}`}
                        >
                          {fRev.isAllActive ? (
                            <span className={VAULT_CHIP_CLASS}>
                              <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--success)]">
                                {t("icon_check_circle", "check_circle")}
                              </span>
                              <span>
                                {t("version_pool_badge_linked", "Linked")}
                              </span>
                            </span>
                          ) : fRev.activeCount > 0 ? (
                            <span className={VAULT_CHIP_CLASS}>
                              <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--warning)]">
                                {t("icon_timelapse", "timelapse")}
                              </span>
                              <span>
                                {`${fRev.activeCount}/${fRev.targets.length} ${t(
                                  "version_pool_badge_linked",
                                  "Linked"
                                )}`}
                              </span>
                            </span>
                          ) : null}
                          <span className={VAULT_CHIP_CLASS}>
                            <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--accent)]">
                              {t("icon_sports_esports", "sports_esports")}
                            </span>
                            <span>{fRev.compatStr}</span>
                          </span>
                        </div>

                        {!fRev.isAllActive && (
                          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                handleBatchActivate(
                                  fRev.targets.map((x) => ({
                                    rel_path: x.rel_path,
                                    dna_hash: x.dna_hash,
                                  }))
                                )
                              }
                              className="relative group/actionbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--success)_40%,transparent)] hover:border-[var(--success)] text-[var(--success)] flex items-center justify-center transition-all cursor-pointer shrink-0"
                            >
                              <span className="material-symbols-outlined !text-[15px]">
                                {t("icon_check", "check")}
                              </span>
                              <HoverTooltip
                                className="z-[100] !right-0 !translate-x-0 !left-auto"
                                title={t(
                                  "version_pool_btn_use_version",
                                  "Link Version"
                                )}
                                icon={t("icon_check", "check")}
                              />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </UniversalGroup>
          )}

          <UniversalGroup
            title={`${t("badge_modules_count", "Modules")} (${
              resolvedGroups.length
            })`}
            icon={t("icon_account_tree", "account_tree")}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {resolvedGroups.map((g) => {
                const activeVer = g.activeVersion || g.versions[0];
                const compatStr =
                  Array.isArray(activeVer?.compatible_versions) &&
                  activeVer.compatible_versions.length > 0
                    ? activeVer.compatible_versions.join(", ")
                    : t("any", "Any");
                const isLinked = Boolean(activeVer?.is_active);
                const activeIdx = g.versions.findIndex((v: any) => v.is_active);
                const activeRevNum =
                  activeIdx >= 0 ? g.versions.length - activeIdx : g.versions.length;

                return (
                  <div
                    key={g.key}
                    onClick={() => setSelectedSubKey(g.key)}
                    className="flex flex-col justify-between gap-3 p-3.5 glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] transition-all cursor-pointer group"
                  >
                    {/* Top Row: Liquid Glass Icon Well + Title & Subtitle */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                        <span className="material-symbols-outlined !text-[20px]">
                          {g.isScript
                            ? t("icon_terminal", "terminal")
                            : t("icon_deployed_code", "deployed_code")}
                        </span>
                      </div>

                      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <span className="text-sm font-black text-[var(--text)] tracking-tight leading-snug truncate group-hover:text-[var(--accent)] transition-colors">
                          {g.displayTitle}
                        </span>
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--subtext)] min-w-0">
                          <span className="opacity-85 shrink-0">
                            {g.typeLabel}
                          </span>
                          <span className="opacity-40 shrink-0">•</span>
                          <span className="text-[var(--accent)] shrink-0">
                            {`${t("revision", "Revision")} #${activeRevNum}/${
                              g.versions.length
                            }`}
                          </span>
                          <span className="opacity-40 shrink-0">•</span>
                          <span className="opacity-85 shrink-0">
                            {formatByteSize(g.totalBytes)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Status & Action Bar */}
                    <div className="relative z-10 pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                        {isLinked && (
                          <span className={VAULT_CHIP_CLASS}>
                            <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--success)]">
                              {t("icon_check_circle", "check_circle")}
                            </span>
                            <span>
                              {t("version_pool_badge_linked", "Linked")}
                            </span>
                          </span>
                        )}
                        <span className={VAULT_CHIP_CLASS}>
                          <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--accent)]">
                            {t("icon_sports_esports", "sports_esports")}
                          </span>
                          <span>{compatStr}</span>
                        </span>
                      </div>

                      <div className="relative group/actionbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] group-hover:border-[var(--accent)] text-[var(--subtext)] group-hover:text-[var(--accent)] flex items-center justify-center transition-all shrink-0 ml-auto">
                        <span className="material-symbols-outlined !text-[15px]">
                          {t("icon_open_in_new", "open_in_new")}
                        </span>
                        <HoverTooltip
                          className="z-[100] !right-0 !translate-x-0 !left-auto"
                          title={t(
                            "version_pool_view_versions",
                            "View Versions"
                          )}
                          icon={t("icon_history", "history")}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </UniversalGroup>
        </div>
      </SidePanel>

      {activeGroup &&
        renderSingleGroupTimeline(
          activeGroup,
          () => setSelectedSubKey(null),
          "z-[120012]",
          "z-[120013]"
        )}
    </>
  );
}
