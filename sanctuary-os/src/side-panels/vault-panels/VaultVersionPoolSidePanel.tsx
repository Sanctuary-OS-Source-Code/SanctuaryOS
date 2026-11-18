import React from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLexicon } from "../../LexiconContext";
import {
  SidePanel,
  HoverTooltip,
  ActionButton,
  ActionPill,
  SidePanelHeroCard,
  StatBox,
  UniversalGroup,
  EmptyState,
  VAULT_CHIP_CLASS,
  InlineFilterGroup,
} from "../../shared";
import { useStore } from "../../store";

import {
  formatByteSize,
  normalizeVersionPoolSearch,
  groupModVersionPoolItems,
  groupBinaryGroupsIntoFamilies,
} from "./versionPoolGrouping";
import { ModVersionHistorySidePanel } from "./ModVersionHistorySidePanel";

export function VaultVersionPoolSidePanel({
  isOpen,
  onClose,
  runRadarSweep,
  setStatus,
  displayModList = [],
}: any) {
  const { t } = useLexicon();
  const [poolStatus, setPoolStatus] = React.useState<any>({
    enabled: true,
    total_bytes: 0,
    reclaimable_bytes: 0,
    total_versions: 0,
    older_versions: 0,
    items: [],
  });
  const [isLoading, setIsLoading] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const deferredSearchQuery = React.useDeferredValue(searchQuery);
  const [typeFilter, setTypeFilter] = React.useState<"ALL" | "SCRIPT" | "PACKAGE">("ALL");
  const [versionCountFilter, setVersionCountFilter] = React.useState<"ALL" | "MULTI">("ALL");
  const [visibleCount, setVisibleCount] = React.useState(40);
  const [selectedFamilyKey, setSelectedFamilyKey] = React.useState<string | null>(null);

  const loadPoolStatus = React.useCallback(async () => {
    setIsLoading(true);
    try {
      let vaultPath = useStore.getState().vaultPath;
      if (!vaultPath) {
        const cfg: any = await invoke("get_saved_coordinates");
        vaultPath = cfg?.vault_path || "";
      }
      if (vaultPath) {
        const res: any = await invoke("get_mod_version_pool_status", { vaultPath });
        if (res) setPoolStatus(res);
      }
    } catch (e) {
      console.warn("Failed to load mod version pool status:", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (isOpen) {
      setVisibleCount(40);
      loadPoolStatus();
    } else {
      setSelectedFamilyKey(null);
    }
  }, [isOpen, loadPoolStatus]);

  React.useEffect(() => {
    setVisibleCount(40);
  }, [deferredSearchQuery, typeFilter, versionCountFilter]);

  const handleToggleAutoArchive = async () => {
    const nextVal = !poolStatus.enabled;
    setPoolStatus((prev: any) => ({ ...prev, enabled: nextVal }));
    localStorage.setItem("sanctuary_archive_mod_versions", nextVal ? "true" : "false");
    try {
      let vaultPath = useStore.getState().vaultPath;
      if (!vaultPath) {
        const cfg: any = await invoke("get_saved_coordinates");
        vaultPath = cfg?.vault_path || "";
      }
      if (vaultPath) {
        await invoke("set_mod_version_archiving_enabled", {
          vaultPath,
          enabled: nextVal,
        });
      }
    } catch {}
  };

  const handlePruneVersions = async (keepActiveOnly: boolean) => {
    try {
      let vaultPath = useStore.getState().vaultPath;
      if (!vaultPath) {
        const cfg: any = await invoke("get_saved_coordinates");
        vaultPath = cfg?.vault_path || "";
      }
      if (!vaultPath) return;
      await invoke("prune_archived_mod_versions", {
        vaultPath,
        keepActiveOnly,
      });
      await loadPoolStatus();
      if (setStatus) {
        setStatus(t("version_pool_prune_older", "Purge Legacy Versions"));
      }
    } catch {}
  };

  const handleResetAllAutoSwap = async () => {
    try {
      let vaultPath = useStore.getState().vaultPath;
      if (!vaultPath) {
        const cfg: any = await invoke("get_saved_coordinates");
        vaultPath = cfg?.vault_path || "";
      }
      if (!vaultPath) return;
      const targetGameVersion = String(useStore.getState().selectedVersion || "");
      await invoke("reset_mod_versions_to_auto", {
        vaultPath,
        relPaths: null,
        targetGameVersion,
      });
      await loadPoolStatus();
      if (runRadarSweep) runRadarSweep(true, true);
      if (setStatus) {
        setStatus(
          t(
            "version_pool_toast_auto_swap",
            "Reset {Mod} version routing to automatic game-version matching."
          )
        );
      }
    } catch {}
  };

  const handleDeleteVersion = async (relPath: string, dnaHash: string) => {
    try {
      let vaultPath = useStore.getState().vaultPath;
      if (!vaultPath) {
        const cfg: any = await invoke("get_saved_coordinates");
        vaultPath = cfg?.vault_path || "";
      }
      if (!vaultPath) return;
      await invoke("delete_archived_mod_version", {
        vaultPath,
        relPath,
        dnaHash,
      });
      await loadPoolStatus();
    } catch {}
  };

  const handleActivateVersion = async (relPath: string, dnaHash: string) => {
    try {
      let vaultPath = useStore.getState().vaultPath;
      if (!vaultPath) {
        const cfg: any = await invoke("get_saved_coordinates");
        vaultPath = cfg?.vault_path || "";
      }
      if (!vaultPath) return;
      await invoke("activate_archived_mod_version", {
        vaultPath,
        relPath,
        dnaHash,
      });
      await loadPoolStatus();
      if (runRadarSweep) runRadarSweep(true, true);
    } catch {}
  };

  const allGroups = React.useMemo(
    () => groupModVersionPoolItems(poolStatus.items, t),
    [poolStatus.items, t]
  );

  const allFamilies = React.useMemo(
    () => groupBinaryGroupsIntoFamilies(allGroups, displayModList, t),
    [allGroups, displayModList, t]
  );

  const anyVaultPinned = React.useMemo(
    () => allFamilies.some((f) => f.isPinned),
    [allFamilies]
  );

  const filteredFamilies = React.useMemo(() => {
    const qNorm = normalizeVersionPoolSearch(deferredSearchQuery);
    const qTokens = qNorm ? qNorm.split(" ").filter(Boolean) : [];

    return allFamilies.filter((fam) => {
      if (typeFilter === "SCRIPT" && !fam.isScript) return false;
      if (typeFilter === "PACKAGE" && !fam.hasPackage) return false;
      if (versionCountFilter === "MULTI" && fam.maxModuleVersions < 2) return false;
      if (qTokens.length > 0) {
        for (const tok of qTokens) {
          if (!fam.searchIndex.includes(tok)) return false;
        }
      }
      return true;
    });
  }, [allFamilies, deferredSearchQuery, typeFilter, versionCountFilter]);

  const visibleFamilies = React.useMemo(
    () => filteredFamilies.slice(0, visibleCount),
    [filteredFamilies, visibleCount]
  );

  const selectedFamily = React.useMemo(
    () =>
      selectedFamilyKey
        ? allFamilies.find((f) => f.key === selectedFamilyKey) || null
        : null,
    [allFamilies, selectedFamilyKey]
  );

  if (!isOpen) return null;

  const hasActiveFilters =
    typeFilter !== "ALL" || versionCountFilter !== "ALL" || searchQuery.trim() !== "";

  return (
    <>
      <SidePanel
        isOpen={isOpen}
        onClose={onClose}
        backdropZ="z-[115000]"
        panelZ="z-[115001]"
        title={t("version_pool_title", "{Mod} Version History")}
        subtitle={t(
          "version_pool_subtitle",
          "Manage {mod} version history and automatic game version swapping"
        )}
        icon={t("icon_history", "history")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[760px]"
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_history", "history")}
            overline={t("version_pool_title", "{Mod} Version History")}
            title={t(
              "version_pool_subtitle",
              "Manage {mod} version history and automatic game version swapping"
            )}
            badge={`${allFamilies.length} ${t("term_mods", "{Mods}")}`}
            badgeIcon={t("icon_inventory_2", "inventory_2")}
            variant="accent"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
              <StatBox
                label={t("term_mods", "{Mods}")}
                value={allFamilies.length}
                icon={t("icon_inventory_2", "inventory_2")}
                iconColorClass="text-[var(--accent)]"
              />
              <StatBox
                label={t("version_pool_older_versions", "Legacy Versions")}
                value={poolStatus.older_versions || 0}
                icon={t("icon_history", "history")}
                iconColorClass="text-[var(--warning)]"
              />
              <StatBox
                label={t("version_pool_reclaimable_space", "Reclaimable Space")}
                value={formatByteSize(poolStatus.reclaimable_bytes || 0)}
                icon={t("icon_cleaning_services", "cleaning_services")}
                iconColorClass="text-[var(--success)]"
              />
            </div>
          </SidePanelHeroCard>

          <UniversalGroup
            title={t("settings", "Settings")}
            icon={t("icon_tune", "tune")}
          >
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-xs font-black text-[var(--text)]">
                    {t("version_pool_auto_archive", "Version History System")}
                  </span>
                  <span className="text-[11px] font-medium text-[var(--subtext)]">
                    {t(
                      "version_pool_auto_archive_desc",
                      "When enabled, keeps multiple {mod} versions for rollback and auto-swapping. When disabled, keeps only one version."
                    )}
                  </span>
                </div>
                <ActionButton
                  variant="glass"
                  icon={
                    poolStatus.enabled
                      ? t("icon_check_circle", "check_circle")
                      : t("icon_block", "block")
                  }
                  label={
                    poolStatus.enabled
                      ? t("enabled", "Enabled")
                      : t("disabled", "Disabled")
                  }
                  onClick={handleToggleAutoArchive}
                  className={
                    poolStatus.enabled
                      ? "shrink-0 !text-[var(--success)] !border-[color-mix(in_srgb,var(--success)_40%,transparent)]"
                      : "shrink-0 !text-[var(--subtext)]"
                  }
                />
              </div>

              {!poolStatus.enabled && (poolStatus.older_versions || 0) > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)]">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className="material-symbols-outlined !text-[18px] text-[var(--warning)] shrink-0 mt-0.5">
                      {t("icon_warning", "warning")}
                    </span>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-xs font-bold text-[var(--text)] leading-snug">
                        {t(
                          "version_pool_disabled_legacy_warning",
                          "Version History System is disabled, but legacy versions are still stored. Purge legacy versions to keep only one version per {mod}."
                        )}
                      </span>
                      <span className="text-[11px] font-semibold text-[var(--warning)]">
                        {`${poolStatus.older_versions || 0} ${t(
                          "version_pool_older_versions",
                          "Legacy Versions"
                        )} • ${formatByteSize(poolStatus.reclaimable_bytes || 0)}`}
                      </span>
                    </div>
                  </div>
                  <ActionButton
                    variant="glass"
                    icon={t("icon_cleaning_services", "cleaning_services")}
                    label={t("version_pool_prune_older", "Purge Legacy Versions")}
                    onClick={() => handlePruneVersions(true)}
                    className="shrink-0 !text-[var(--warning)] !border-[color-mix(in_srgb,var(--warning)_45%,transparent)]"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <ActionButton
                  variant={anyVaultPinned ? "accent" : "glass"}
                  icon={t("icon_autorenew", "autorenew")}
                  label={t("version_pool_btn_auto_swap", "Auto-Swap Versions")}
                  disabled={!poolStatus.total_versions}
                  onClick={handleResetAllAutoSwap}
                  className="w-full"
                />
                <ActionButton
                  variant="glass"
                  icon={t("icon_cleaning_services", "cleaning_services")}
                  label={`${t("version_pool_prune_older", "Purge Legacy Versions")} (${formatByteSize(
                    poolStatus.reclaimable_bytes || 0
                  )})`}
                  disabled={!poolStatus.older_versions}
                  onClick={() => handlePruneVersions(true)}
                  className="w-full !text-[var(--danger)] !border-[color-mix(in_srgb,var(--danger)_35%,transparent)]"
                />
              </div>
            </div>
          </UniversalGroup>

          <UniversalGroup
            title={`${t("term_mods", "{Mods}")} (${filteredFamilies.length})`}
            icon={t("icon_inventory_2", "inventory_2")}
          >
            <div className="flex flex-col gap-3">
              <ActionPill
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                searchPlaceholder={t("search_ph", "Search {mods}...")}
                primaryPopover={{
                  icon: t("icon_tune", "tune"),
                  label: t("filters", "Filters"),
                  content: (
                    <div className="flex flex-col gap-4 w-[300px] p-2">
                      <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-2">
                          {t("filter_category", "Filter Category")}
                        </span>
                        <InlineFilterGroup
                          value={typeFilter}
                          onChange={(v) => setTypeFilter(v as any)}
                          options={[
                            { id: "ALL", label: t("filter_all", "All") },
                            { id: "SCRIPT", label: t("type_script", "Script") },
                            { id: "PACKAGE", label: t("type_package", "Module") },
                          ]}
                        />
                      </div>

                      <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-2">
                          {t("revisions", "Revisions")}
                        </span>
                        <InlineFilterGroup
                          value={versionCountFilter}
                          onChange={(v) => setVersionCountFilter(v as any)}
                          options={[
                            { id: "ALL", label: t("filter_all", "All") },
                            {
                              id: "MULTI",
                              label: t("version_pool_filter_multi", "2+ Versions"),
                            },
                          ]}
                        />
                      </div>
                    </div>
                  ),
                }}
                actions={
                  hasActiveFilters
                    ? [
                        {
                          id: "clear_filters",
                          icon: t("icon_close", "close"),
                          label: t("clear", "Clear"),
                          onClick: () => {
                            setSearchQuery("");
                            setTypeFilter("ALL");
                            setVersionCountFilter("ALL");
                          },
                        },
                      ]
                    : undefined
                }
              />

              {!isLoading && filteredFamilies.length === 0 ? (
                <EmptyState
                  icon={t("icon_history", "history")}
                  title={t("version_pool_empty_title", "No Archived {Mod} Versions")}
                  subtitle={t(
                    "version_pool_empty_desc",
                    "Archived {mod} versions appear here when {mods} are updated or synced."
                  )}
                />
              ) : (
                <div className="max-h-[460px] overflow-y-auto custom-scrollbar pr-1 flex flex-col gap-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {visibleFamilies.map((fam) => {
                      return (
                        <div
                          key={fam.key}
                          onClick={() => setSelectedFamilyKey(fam.key)}
                          className="flex flex-col justify-between gap-3 p-3.5 glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] transition-all cursor-pointer group/vcard"
                        >
                          {/* Top Row: Liquid Glass Icon Well + Title & Subtitle */}
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                              <span className="material-symbols-outlined !text-[20px]">
                                {fam.isMultiModule
                                  ? t("icon_account_tree", "account_tree")
                                  : fam.isScript
                                    ? t("icon_terminal", "terminal")
                                    : t("icon_deployed_code", "deployed_code")}
                              </span>
                            </div>

                            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                              <span className="text-sm font-black text-[var(--text)] group-hover/vcard:text-[var(--accent)] transition-colors tracking-tight leading-snug truncate">
                                {fam.displayTitle}
                              </span>
                              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--subtext)] min-w-0">
                                <span className="opacity-85 shrink-0">{fam.typeLabel}</span>
                                <span className="opacity-40 shrink-0">•</span>
                                <span className="text-[var(--accent)] shrink-0">
                                  {fam.maxModuleVersions === 1
                                    ? `${t("revision", "Revision")} #1`
                                    : `${fam.maxModuleVersions} ${t("revisions", "Revisions")}`}
                                </span>
                                <span className="opacity-40 shrink-0">•</span>
                                <span className="opacity-85 shrink-0">
                                  {formatByteSize(fam.totalBytes)}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Bottom Status & Action Bar */}
                          <div className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                              {fam.isAllLinked && (
                                <span className={VAULT_CHIP_CLASS}>
                                  <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--success)]">
                                    {t("icon_check_circle", "check_circle")}
                                  </span>
                                  <span>{t("version_pool_badge_linked", "Linked")}</span>
                                </span>
                              )}
                              {fam.isPinned && (
                                <span className={VAULT_CHIP_CLASS}>
                                  <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--warning)]">
                                    {t("icon_push_pin", "push_pin")}
                                  </span>
                                  <span>
                                    {t("version_pool_badge_manual_pin", "Manual Override")}
                                  </span>
                                </span>
                              )}
                              <span className={VAULT_CHIP_CLASS}>
                                <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--accent)]">
                                  {t("icon_sports_esports", "sports_esports")}
                                </span>
                                <span>{fam.compatLabel}</span>
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedFamilyKey(fam.key);
                                }}
                                className="relative group/actionbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] group-hover/vcard:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] group-hover/vcard:text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer shrink-0"
                              >
                                <span className="material-symbols-outlined !text-[15px]">
                                  {t("icon_history", "history")}
                                </span>
                                <HoverTooltip
                                  className="z-[100] !right-0 !translate-x-0 !left-auto"
                                  title={t("version_pool_view_versions", "Inspect Versions")}
                                  icon={t("icon_history", "history")}
                                />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {filteredFamilies.length > visibleCount && (
                    <ActionButton
                      variant="glass"
                      icon={t("icon_expand_more", "expand_more")}
                      label={`${t("next", "Next")} (${
                        filteredFamilies.length - visibleCount
                      })`}
                      onClick={() => setVisibleCount((prev) => prev + 40)}
                      className="w-full justify-center"
                    />
                  )}
                </div>
              )}
            </div>
          </UniversalGroup>
        </div>
      </SidePanel>

      <ModVersionHistorySidePanel
        groups={selectedFamily?.groups || []}
        parentTitle={selectedFamily?.displayTitle}
        isOpen={Boolean(selectedFamily)}
        onClose={() => setSelectedFamilyKey(null)}
        onActivateVersion={handleActivateVersion}
        onDeleteVersion={handleDeleteVersion}
        onRefresh={loadPoolStatus}
        runRadarSweep={runRadarSweep}
        setStatus={setStatus}
      />
    </>
  );
}

