import { useState, useMemo, useEffect } from "react";
import {
  CustomDropdown,
  SidePanel,
  SidePanelHeroCard,
  SidePanelTitleInput,
  UniversalGroup,
  getExtensionRegex,
  EmptyState,
  PanelHeaderGroup,
  PanelHeaderButton,
  HoverTooltip,
  ActionPill,
  InlineFilterGroup,
  DashboardStatTile,
  SidePanelFilterBar,
  handleOpenUrl,
  filterBlueprintModArtifacts,
  stripPriorityTierPrefix,
} from "./shared";
import { useStore } from "./store";
import { useLexicon } from "./LexiconContext";
import { tauriBridge } from "./lib/tauri-bridge";
import { useConflictOverride } from "./hooks/usePlaySetLogic";
import {
  evaluateModIssues,
  groupBrokenMods,
  renderGroupedIncompatibleSections,
  resolveBlueprintConflicts,
  ConflictComparisonCard,
} from "./side-panels/CommandIncompatiblePanel";
import { groupUpdateMods, UpdateModCard } from "./side-panels/CommandCenterSidePanels";

export default function BlueprintArchitect({
  isOpen,
  onClose,
  playSet,
  modList,
  toggleInActiveSet,
  allow_write,
  vaultPath,
  onRefreshMods,
  renamePlaySet,
  initialTab,
}: any) {
  const { t } = useLexicon();
  const ownedDLC = useStore((state: any) => state.ownedDLC);
  const maskedDLC = useStore((state: any) => state.maskedDLC);
  const selectedVersion = useStore((state: any) => state.selectedVersion);
  const activeGameSchema = useStore((state: any) => state.activeGameSchema);
  const ignoredGlobal = useStore((state: any) => state.ignoredGlobal);
  const showImages = useStore((state: any) => state.showImages);

  const [ignoredConflicts, setIgnoredConflicts] = useState<Set<string>>(new Set());
  const [ignoredBroken, setIgnoredBroken] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"updates" | "alerts" | "critical">("critical");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [nameInput, setNameInput] = useState("");
  const [radarCacheTick, setRadarCacheTick] = useState(0);

  useEffect(() => {
    const handleRadarCacheUpdate = () => setRadarCacheTick((c) => c + 1);
    window.addEventListener("sanctuary-radar-cache-updated", handleRadarCacheUpdate);
    return () =>
      window.removeEventListener("sanctuary-radar-cache-updated", handleRadarCacheUpdate);
  }, []);

  useEffect(() => {
    if (playSet?.name) {
      setNameInput(playSet.name);
    }
  }, [playSet?.name, isOpen]);

  const extRegex = useMemo(() => getExtensionRegex(activeGameSchema), [activeGameSchema]);
  const activeMods = useMemo(() => {
    if (!isOpen) return [];
    const safeMods = filterBlueprintModArtifacts(playSet?.mods, activeGameSchema);
    const safeList = Array.isArray(modList) ? modList : [];

    const exactMatchMap = new Map();
    const baseMatchMap = new Map();

    for (const m of safeList) {
      if (!m.name) continue;
      const exactKey = m.name.toLowerCase().replace(/\\/g, "/");
      exactMatchMap.set(exactKey, m);

      const baseKey = m.name.split(/[\\/]/).pop()?.replace(extRegex, "").toLowerCase();
      if (baseKey && !baseMatchMap.has(baseKey)) {
        baseMatchMap.set(baseKey, m);
      }
    }

    return safeMods.map((rawMod: any) => {
      const modName =
        typeof rawMod === "string" ? rawMod : String(rawMod?.name || rawMod?.path || "");
      const cleanModName = stripPriorityTierPrefix(modName, activeGameSchema);
      const modNameLow = cleanModName.toLowerCase().replace(/\\/g, "/");

      const exactMatch = exactMatchMap.get(modNameLow);
      if (exactMatch) return { ...exactMatch, _originalSetName: modName };

      const mBase = modName.split(/[\\/]/).pop()?.replace(extRegex, "").toLowerCase();
      const baseMatch = mBase ? baseMatchMap.get(mBase) : undefined;

      if (baseMatch) return { ...baseMatch, _originalSetName: modName };

      return { name: modName, isFallback: true, _originalSetName: modName };
    });
  }, [isOpen, playSet?.mods, modList, extRegex, activeGameSchema]);

  const activeConflicts = useMemo(() => {
    if (!isOpen) return [];
    return resolveBlueprintConflicts(playSet?.name, activeMods, ignoredGlobal, t);
  }, [isOpen, playSet?.name, activeMods, ignoredGlobal, t, radarCacheTick]);

  const rawUpdates = useMemo(() => {
    if (!isOpen) return [];
    return activeMods.filter((m: any) => !m.isFallback && Boolean(m.hasUpdate && m.newVersion));
  }, [isOpen, activeMods]);

  const groupedUpdates = useMemo(() => groupUpdateMods(rawUpdates), [rawUpdates]);

  const rawBrokenMods = useMemo(() => {
    if (!isOpen) return [];
    return activeMods
      .map((mod: any) =>
        evaluateModIssues(mod, {
          activeMods,
          selectedVersion,
          ownedDLC,
          maskedDLC,
          t,
          activeGameSchema,
        })
      )
      .filter(Boolean)
      .sort((a: any, b: any) => {
        if (a._alert_type === "red" && b._alert_type === "amber") return -1;
        if (a._alert_type === "amber" && b._alert_type === "red") return 1;
        return 0;
      });
  }, [isOpen, activeMods, selectedVersion, ownedDLC, maskedDLC, t, activeGameSchema]);

  const groupedBrokenMods = useMemo(() => groupBrokenMods(rawBrokenMods), [rawBrokenMods]);

  const groupedRedMods = useMemo(
    () => groupedBrokenMods.filter((m: any) => m._alert_type === "red"),
    [groupedBrokenMods]
  );
  const groupedAmberMods = useMemo(
    () => groupedBrokenMods.filter((m: any) => m._alert_type === "amber"),
    [groupedBrokenMods]
  );

  const criticalConflicts = useMemo(
    () => activeConflicts.filter((c: any) => c.conflict.severity_rank == 4),
    [activeConflicts]
  );
  const warningConflicts = useMemo(
    () => activeConflicts.filter((c: any) => c.conflict.severity_rank != 4),
    [activeConflicts]
  );

  const updatesCount = groupedUpdates.length;
  const alertsCount = groupedAmberMods.length + warningConflicts.length;
  const criticalCount = groupedRedMods.length + criticalConflicts.length;
  const totalAllIssues = updatesCount + alertsCount + criticalCount;

  useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
      setCategoryFilter("all");
      if (initialTab && ["updates", "alerts", "critical"].includes(initialTab)) {
        setActiveTab(initialTab);
      } else if (criticalCount > 0) {
        setActiveTab("critical");
      } else if (alertsCount > 0) {
        setActiveTab("alerts");
      } else if (updatesCount > 0) {
        setActiveTab("updates");
      } else {
        setActiveTab("critical");
      }
    }
  }, [isOpen, initialTab, criticalCount, alertsCount, updatesCount]);

  const applyConflictOverride = useConflictOverride();

  const schemaPriorityTiers = useMemo(
    () =>
      Array.isArray(activeGameSchema?.load_order?.priority_tiers)
        ? activeGameSchema.load_order.priority_tiers
        : [],
    [activeGameSchema]
  );

  const getPriorityDrop = (modData: any) => {
    if (!modData || modData.isFallback || !allow_write || schemaPriorityTiers.length === 0) {
      return null;
    }
    let currentPriority = "";
    if (modData.path) {
      const firstPart = modData.path.split(/[/\\]/)[0];
      if (schemaPriorityTiers.includes(firstPart)) {
        currentPriority = firstPart;
      }
    }
    return (
      <div className="w-full mt-2">
        <CustomDropdown
          disableTint={true}
          value={currentPriority}
          onChange={async (newPrio: string) => {
            try {
              await tauriBridge.moveModToPriorityFolder(vaultPath, modData.name, newPrio);
              if (onRefreshMods) onRefreshMods();
            } catch (e) {
              console.error("Failed to move mod priority", e);
            }
          }}
          options={[
            { id: "", label: t("bp_priority_default", "Standard Priority") },
            ...schemaPriorityTiers.map((folder: string, idx: number) => ({
              id: folder,
              label: `${t("priority_tier", "Priority")} ${idx + 1} (${folder})`,
            })),
          ]}
        />
      </div>
    );
  };

  const filteredUpdates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return groupedUpdates;
    return groupedUpdates.filter((u: any) => {
      const title = String(u._groupedTitle || u.displayName || u.name || "").toLowerCase();
      const author = String(u.author || "").toLowerCase();
      return title.includes(q) || author.includes(q);
    });
  }, [groupedUpdates, searchQuery]);

  const currentTabBrokenMods = activeTab === "critical" ? groupedRedMods : groupedAmberMods;
  const currentTabConflicts = activeTab === "critical" ? criticalConflicts : warningConflicts;

  const filteredBrokenMods = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return currentTabBrokenMods.filter((mod: any) => {
      const cats: string[] = Array.isArray(mod._categories)
        ? mod._categories
        : [mod._alert_category];

      if (categoryFilter === "corrupted") {
        if (!cats.includes("corrupted")) return false;
      } else if (categoryFilter === "version_mismatch") {
        if (!cats.includes("version_mismatch")) return false;
      } else if (categoryFilter === "missing_reqs") {
        if (!cats.includes("missing_dlc") && !cats.includes("missing_deps")) {
          return false;
        }
      } else if (categoryFilter === "unstable") {
        if (!cats.includes("unstable") && mod._alert_type !== "amber") return false;
      }

      if (!q) return true;
      const title = String(mod._groupedTitle || mod.displayName || mod.name || "").toLowerCase();
      const author = String(mod.author || "").toLowerCase();
      const reason = String(mod._alert_reason || "").toLowerCase();
      return title.includes(q) || author.includes(q) || reason.includes(q);
    });
  }, [currentTabBrokenMods, searchQuery, categoryFilter]);

  const filteredConflicts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return currentTabConflicts;
    return currentTabConflicts.filter((ac: any) => {
      const nameA = String(ac.modA?.displayName || ac.modA?.name || "").toLowerCase();
      const nameB = String(ac.modB?.displayName || ac.modB?.name || "").toLowerCase();
      const note = String(ac.conflict?.resolution_note || "").toLowerCase();
      return nameA.includes(q) || nameB.includes(q) || note.includes(q);
    });
  }, [currentTabConflicts, searchQuery]);

  if (!playSet) return null;

  const rawRedMods = rawBrokenMods.filter((m: any) => m._alert_type === "red");
  const rawAmberMods = rawBrokenMods.filter((m: any) => m._alert_type === "amber");

  const heroVariant: "danger" | "warning" | "accent" | "success" =
    criticalCount > 0
      ? "danger"
      : alertsCount > 0
        ? "warning"
        : updatesCount > 0
          ? "accent"
          : "success";

  const heroIcon =
    criticalCount > 0
      ? t("icon_gpp_bad", "gpp_bad")
      : alertsCount > 0
        ? t("icon_gpp_maybe", "gpp_maybe")
        : updatesCount > 0
          ? t("icon_update", "update")
          : t("icon_verified_user", "verified_user");

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("bp_title", "{Blueprint} Alerts")}
      subtitle={`${playSet.name} • ${activeMods.length} ${t("term_mods", "Items")}`}
      icon={heroIcon}
      iconColorClass={
        criticalCount > 0
          ? "text-[var(--danger)]"
          : alertsCount > 0
            ? "text-[var(--warning)]"
            : "text-[var(--accent)]"
      }
      widthClass="w-[90vw] md:w-[760px]"
      headerActions={
        allow_write && (rawRedMods.length > 0 || rawAmberMods.length > 0) ? (
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_remove_circle_outline", "remove_circle_outline")}
              tooltip={`${t("btn_remove", "{Remove}")} ${groupedRedMods.length + groupedAmberMods.length} ${t("term_mods", "{Mods}")}`}
              tooltipSubtitle={`${t("bp_purge_unstable", "{Remove} {0} Unstable").replace(/^.*\{0\}\s*/, `${groupedAmberMods.length} `)}\n${t("bp_purge_corrupted", "{Remove} {0} Corrupted").replace(/^.*\{0\}\s*/, `${groupedRedMods.length} `)}`}
              variant={groupedRedMods.length > 0 ? "danger" : "warning"}
              onClick={() => {
                [...rawRedMods, ...rawAmberMods].forEach((m: any) =>
                  toggleInActiveSet(m._originalSetName || m.name, true, true)
                );
              }}
            />
          </PanelHeaderGroup>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={heroIcon}
          overline={t("bp_title", "{Blueprint} Alerts")}
          title={playSet.name}
          description={`${activeMods.length} ${t("term_mods", "Items")} ${t("active", "Active")}`}
          badge={
            totalAllIssues === 0
              ? t("bp_no_conflicts_detected", "All Clear")
              : `${totalAllIssues} ${t("term_mods", "Items")}`
          }
          badgeIcon={heroIcon}
          variant={heroVariant}
        />

        {renamePlaySet && (
          <SidePanelTitleInput
            label={t("term_blueprint", "{Blueprint}")}
            value={nameInput}
            onChange={setNameInput}
            onBlur={() => {
              if (nameInput.trim() && nameInput.trim() !== playSet.name) {
                renamePlaySet(playSet.name, nameInput.trim());
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && nameInput.trim() && nameInput.trim() !== playSet.name) {
                renamePlaySet(playSet.name, nameInput.trim());
              }
            }}
            placeholder={t("draft_placeholder", "{Blueprint} Name...")}
          />
        )}

        {/* 3-Tab Switcher: Updates / Alerts / Critical Alerts */}
        <SidePanelFilterBar className="sm:grid-cols-3 gap-2.5">
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            icon={t("icon_update", "update")}
            label={t("updates_modal_title", "Updates")}
            number={updatesCount}
            colorClass="text-[var(--accent)]"
            isActive={activeTab === "updates"}
            onClick={() => {
              setActiveTab("updates");
              setCategoryFilter("all");
            }}
          />
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            icon={t("icon_gpp_maybe", "gpp_maybe")}
            label={t("system_alerts_title", "Alerts")}
            number={alertsCount}
            colorClass="text-[var(--warning)]"
            isActive={activeTab === "alerts"}
            onClick={() => {
              setActiveTab("alerts");
              setCategoryFilter("all");
            }}
          />
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            icon={t("icon_gpp_bad", "gpp_bad")}
            label={t("critical_alerts", "Critical Alerts")}
            number={criticalCount}
            colorClass="text-[var(--danger)]"
            isActive={activeTab === "critical"}
            onClick={() => {
              setActiveTab("critical");
              setCategoryFilter("all");
            }}
          />
        </SidePanelFilterBar>

        {/* Search & Filter Bar */}
        <ActionPill
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          searchPlaceholder={t("nav_search", "Search...")}
          primaryPopover={
            activeTab !== "updates"
              ? {
                  icon: t("icon_tune", "tune"),
                  label: t("filters", "Filters"),
                  content: (
                    <div className="flex flex-col gap-4 w-[280px] p-3">
                      <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 px-1">
                          {t("status", "Status")}
                        </span>
                        <InlineFilterGroup
                          value={categoryFilter}
                          onChange={(v: string) => setCategoryFilter(v)}
                          options={[
                            { id: "all", label: t("filter_all", "All") },
                            { id: "corrupted", label: t("status_corrupted", "Corrupted") },
                            {
                              id: "version_mismatch",
                              label: t("modal_version_mismatch", "Version Mismatch"),
                            },
                            {
                              id: "missing_reqs",
                              label: t("badge_missing_dep", "Missing Dependency"),
                            },
                            { id: "unstable", label: t("label_unstable", "Unstable") },
                          ]}
                        />
                      </div>
                    </div>
                  ),
                }
              : undefined
          }
        />

        {/* Tab 1: Updates */}
        {activeTab === "updates" && (
          <>
            {filteredUpdates.length > 0 ? (
              <UniversalGroup
                title={`${t("updates_avail", "Updates Available")} (${filteredUpdates.length})`}
                icon={t("icon_update", "update")}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                  {filteredUpdates.map((update: any) => (
                    <UpdateModCard
                      key={update._groupedTitle || update.hash || update.name}
                      update={update}
                      handleOpenUrl={handleOpenUrl}
                      t={t}
                      activeGameSchema={activeGameSchema}
                    />
                  ))}
                </div>
              </UniversalGroup>
            ) : (
              <EmptyState
                icon={t("icon_check_circle", "check_circle")}
                title={t("no_updates", "All Mods Up to Date")}
              />
            )}
          </>
        )}

        {/* Tab 2 & 3: Alerts / Critical Alerts */}
        {activeTab !== "updates" && (
          <>
            {filteredConflicts.length > 0 && (
              <UniversalGroup
                title={`${t("bp_load_order_conflicts", "Conflicts Detected")} (${filteredConflicts.length})`}
                icon={t("icon_crisis_alert", "crisis_alert")}
              >
                <div className="flex flex-col gap-3 w-full">
                  {filteredConflicts.map((ac: any) => (
                    <ConflictComparisonCard
                      key={ac.pairId}
                      ac={ac}
                      ignoredConflicts={ignoredConflicts}
                      setIgnoredConflicts={setIgnoredConflicts}
                      showImages={showImages}
                      allow_write={allow_write}
                      toggleInActiveSet={toggleInActiveSet}
                      applyConflictOverride={applyConflictOverride}
                      scopeName={playSet?.name}
                      getPriorityDrop={getPriorityDrop}
                      activeGameSchema={activeGameSchema}
                      t={t}
                    />
                  ))}
                </div>
              </UniversalGroup>
            )}

            {filteredBrokenMods.length === 0 && filteredConflicts.length === 0 ? (
              <EmptyState
                icon={t("icon_check_circle", "check_circle")}
                title={t(
                  "bp_no_broken_mods_detected",
                  "All active {mods} passed compliance checks."
                )}
              />
            ) : filteredBrokenMods.length > 0 ? (
              <UniversalGroup
                title={`${
                  activeTab === "critical"
                    ? t("critical_alerts", "Critical Alerts")
                    : t("system_alerts_title", "Alerts")
                } (${filteredBrokenMods.length})`}
                icon={
                  activeTab === "critical"
                    ? t("icon_gpp_bad", "gpp_bad")
                    : t("icon_gpp_maybe", "gpp_maybe")
                }
                headerAction={
                  allow_write && toggleInActiveSet ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        filteredBrokenMods.forEach((mod: any) => {
                          const members: any[] =
                            Array.isArray(mod._groupedMods) && mod._groupedMods.length > 0
                              ? mod._groupedMods
                              : [mod];
                          members.forEach((m: any) => {
                            toggleInActiveSet(m._originalSetName || m.name, true, true);
                          });
                        });
                      }}
                      className={`relative group/subaction w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] ${
                        activeTab === "critical"
                          ? "text-[var(--danger)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]"
                          : "text-[var(--warning)] hover:border-[color-mix(in_srgb,var(--warning)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--warning)_10%,transparent)]"
                      } flex items-center justify-center transition-all cursor-pointer shrink-0`}
                    >
                      <span className="material-symbols-outlined !text-[15px]">
                        {t("icon_remove_circle_outline", "remove_circle_outline")}
                      </span>
                      <HoverTooltip
                        className="z-[100] !right-0 !translate-x-0 !left-auto"
                        title={(activeTab === "critical"
                          ? t("bp_purge_corrupted", "{Remove} {0} Corrupted")
                          : t("bp_purge_unstable", "{Remove} {0} Unstable")
                        ).replace("{0}", String(filteredBrokenMods.length))}
                        icon={t("icon_remove_circle_outline", "remove_circle_outline")}
                        variant={activeTab === "critical" ? "danger" : "warning"}
                      />
                    </button>
                  ) : undefined
                }
              >
                {renderGroupedIncompatibleSections({
                  groupedBrokenMods: filteredBrokenMods,
                  ignoredBroken,
                  setIgnoredBroken,
                  toggleInActiveSet,
                  allow_write,
                  t,
                  activeGameSchema,
                })}
              </UniversalGroup>
            ) : null}
          </>
        )}
      </div>
    </SidePanel>
  );
}
