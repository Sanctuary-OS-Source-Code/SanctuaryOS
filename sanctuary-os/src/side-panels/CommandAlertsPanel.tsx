import { useState, useMemo, useEffect } from "react";
import {
  CustomDropdown,
  SidePanel,
  getExtensionRegex,
  EmptyState,
  PanelHeaderGroup,
  PanelHeaderButton,
  ActionPill,
  InlineFilterGroup,
  SidePanelHeroCard,
  DashboardStatTile,
  UniversalGroup,
} from "../shared";
import { useStore } from "../store";
import { useLexicon } from "../LexiconContext";
import { tauriBridge } from "../lib/tauri-bridge";
import { usePlaySetLogic } from "../hooks/usePlaySetLogic";
import {
  evaluateModIssues,
  groupBrokenMods,
  renderGroupedIncompatibleSections,
  resolveBlueprintConflicts,
  ConflictComparisonCard,
} from "./CommandIncompatiblePanel";

export default function CommandAlertsPanel({
  isOpen,
  onClose,
  playSet,
  modList,
  toggleInActiveSet,
  allow_write,
  vaultPath,
  onRefreshMods,
  mode = "critical",
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
  const [activeTab, setActiveTab] = useState<"all" | "broken" | "conflicts">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [radarCacheTick, setRadarCacheTick] = useState(0);

  useEffect(() => {
    const handleRadarCacheUpdate = () => setRadarCacheTick((c) => c + 1);
    window.addEventListener("sanctuary-radar-cache-updated", handleRadarCacheUpdate);
    return () =>
      window.removeEventListener("sanctuary-radar-cache-updated", handleRadarCacheUpdate);
  }, []);

  const extRegex = useMemo(() => getExtensionRegex(activeGameSchema), [activeGameSchema]);
  const activeMods = useMemo(() => {
    const safeMods = Array.isArray(playSet?.mods) ? playSet.mods : [];
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
      const modName = typeof rawMod === "string" ? rawMod : String(rawMod?.name || rawMod?.path || "");
      const cleanModName = modName.replace(/^(sanctuary[/\\])+/i, "");
      const modNameLow = cleanModName.toLowerCase().replace(/\\/g, "/");

      const exactMatch = exactMatchMap.get(modNameLow);
      if (exactMatch) return { ...exactMatch, _originalSetName: modName };

      const mBase = modName.split(/[\\/]/).pop()?.replace(extRegex, "").toLowerCase();
      const baseMatch = mBase ? baseMatchMap.get(mBase) : undefined;

      if (baseMatch) return { ...baseMatch, _originalSetName: modName };

      return { name: modName, isFallback: true, _originalSetName: modName };
    });
  }, [playSet?.mods, modList, extRegex]);

  const activeConflicts = useMemo(() => {
    const allResolved = resolveBlueprintConflicts(
      playSet?.name,
      activeMods,
      ignoredGlobal,
      t
    );
    return allResolved.filter((c) =>
      mode === "critical"
        ? Number(c.conflict?.severity_rank) === 4
        : Number(c.conflict?.severity_rank) !== 4
    );
  }, [playSet?.name, activeMods, ignoredGlobal, mode, t, radarCacheTick]);

  const brokenMods = useMemo(() => {
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
      })
      .filter((m: any) =>
        mode === "critical" ? m._alert_type === "red" : m._alert_type === "amber"
      );
  }, [activeMods, selectedVersion, ownedDLC, maskedDLC, t, mode, activeGameSchema]);

  useEffect(() => {
    if (isOpen) {
      setActiveTab("all");
      setCategoryFilter("all");
      setSearchQuery("");
    }
  }, [isOpen, mode]);

  const redMods = useMemo(
    () => brokenMods.filter((m: any) => m._alert_type === "red"),
    [brokenMods]
  );
  const amberMods = useMemo(
    () => brokenMods.filter((m: any) => m._alert_type === "amber"),
    [brokenMods]
  );

  const { applyConflictOverride } = usePlaySetLogic();

  const getPriorityDrop = (modData: any) => {
    if (!modData || modData.isFallback || !allow_write) return null;
    let currentPriority = "";
    if (modData.path) {
      const firstPart = modData.path.split(/[/\\]/)[0];
      if (["!Sanctuary", "!Sanctuary2", "!Sanctuary3"].includes(firstPart)) {
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
            { id: "!Sanctuary", label: t("bp_priority_sanctuary", "Priority 1") },
            { id: "!Sanctuary2", label: t("bp_priority_sanctuary2", "Priority 2") },
            { id: "!Sanctuary3", label: t("bp_priority_sanctuary3", "Priority 3") },
          ]}
        />
      </div>
    );
  };

  const groupedBrokenMods = useMemo(() => groupBrokenMods(brokenMods), [brokenMods]);
  const groupedRedMods = useMemo(
    () => groupedBrokenMods.filter((m) => m._alert_type === "red"),
    [groupedBrokenMods]
  );
  const groupedAmberMods = useMemo(
    () => groupedBrokenMods.filter((m) => m._alert_type === "amber"),
    [groupedBrokenMods]
  );

  const filteredGroupedBrokenMods = useMemo(() => {
    if (activeTab === "conflicts") return [];
    const q = searchQuery.trim().toLowerCase();
    return groupedBrokenMods.filter((mod: any) => {
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
  }, [groupedBrokenMods, searchQuery, categoryFilter, activeTab]);

  const filteredConflicts = useMemo(() => {
    if (activeTab === "broken") return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return activeConflicts;
    return activeConflicts.filter((ac) => {
      const nameA = String(ac.modA?.displayName || ac.modA?.name || "").toLowerCase();
      const nameB = String(ac.modB?.displayName || ac.modB?.name || "").toLowerCase();
      const note = String(ac.conflict?.resolution_note || "").toLowerCase();
      return nameA.includes(q) || nameB.includes(q) || note.includes(q);
    });
  }, [activeConflicts, searchQuery, activeTab]);

  const totalIssues = groupedBrokenMods.length + activeConflicts.length;

  if (!playSet) return null;

  const isCriticalMode = mode === "critical";
  const heroIcon = isCriticalMode ? t("icon_gpp_bad", "gpp_bad") : t("icon_gpp_maybe", "gpp_maybe");
  const accentColorClass = isCriticalMode ? "text-[var(--danger)]" : "text-[var(--warning)]";

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={
        isCriticalMode
          ? t("action_required", "Critical Action Required")
          : t("system_alerts_title", "System Alerts")
      }
      subtitle={`${totalIssues} ${t("term_mods", "Items")} • ${activeMods.length} ${t("active", "Active")}`}
      icon={heroIcon}
      iconColorClass={accentColorClass}
      widthClass="w-[90vw] md:w-[760px]"
      headerActions={
        allow_write && groupedBrokenMods.length > 0 ? (
          <PanelHeaderGroup>
            {groupedRedMods.length > 0 && (
              <PanelHeaderButton
                icon={t("icon_delete_sweep", "delete_sweep")}
                tooltip={t("bp_purge_corrupted", "Purge {0} Corrupted").replace(
                  "{0}",
                  String(groupedRedMods.length)
                )}
                variant="danger"
                onClick={() => {
                  redMods.forEach((m: any) =>
                    toggleInActiveSet(m._originalSetName || m.name, true, true)
                  );
                }}
              />
            )}
            {groupedAmberMods.length > 0 && (
              <PanelHeaderButton
                icon={t("icon_delete_sweep", "delete_sweep")}
                tooltip={t("bp_purge_unstable", "Purge {0} Unstable").replace(
                  "{0}",
                  String(groupedAmberMods.length)
                )}
                variant="default"
                onClick={() => {
                  amberMods.forEach((m: any) =>
                    toggleInActiveSet(m._originalSetName || m.name, true, true)
                  );
                }}
              />
            )}
          </PanelHeaderGroup>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={heroIcon}
          overline={
            isCriticalMode
              ? t("action_required", "Critical Action Required")
              : t("system_alerts_title", "System Alerts")
          }
          title={playSet?.name || t("active", "Active")}
          description={`${activeMods.length} ${t("term_mods", "Items")} ${t("active", "Active")}`}
          badge={
            totalIssues === 0
              ? t("bp_no_conflicts_detected", "All Clear")
              : `${totalIssues} ${t("term_mods", "Items")}`
          }
          badgeIcon={heroIcon}
          variant={
            totalIssues === 0
              ? "success"
              : isCriticalMode
                ? "danger"
                : "warning"
          }
        />

        {totalIssues > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={heroIcon}
              label={t("filter_all", "All")}
              number={totalIssues}
              colorClass={accentColorClass}
              isActive={activeTab === "all"}
              onClick={() => setActiveTab("all")}
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_gpp_bad", "gpp_bad")}
              label={t("citizen_action_incompatible", "Incompatible")}
              number={groupedBrokenMods.length}
              colorClass={accentColorClass}
              isActive={activeTab === "broken"}
              onClick={() =>
                setActiveTab(activeTab === "broken" ? "all" : "broken")
              }
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_crisis_alert", "crisis_alert")}
              label={t("tab_matrix", "Conflicts")}
              number={activeConflicts.length}
              colorClass={accentColorClass}
              isActive={activeTab === "conflicts"}
              onClick={() =>
                setActiveTab(activeTab === "conflicts" ? "all" : "conflicts")
              }
            />
          </div>
        )}

        {totalIssues > 0 && (
          <ActionPill
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchPlaceholder={t("nav_search", "Search...")}
            primaryPopover={
              activeTab !== "conflicts"
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
        )}

        {/* Conflicts Section */}
        {filteredConflicts.length > 0 && (
          <UniversalGroup
            title={`${t("bp_load_order_conflicts", "Conflicts Detected")} (${filteredConflicts.length})`}
            icon={t("icon_crisis_alert", "crisis_alert")}
          >
            <div className="flex flex-col gap-3 w-full">
              {filteredConflicts.map((ac) => (
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

        {/* Incompatible Mods Section */}
        {filteredGroupedBrokenMods.length === 0 && filteredConflicts.length === 0 ? (
          <EmptyState
            icon={t("icon_check_circle", "check_circle")}
            title={t("bp_no_broken_mods_detected", "All active {mods} passed compliance checks.")}
          />
        ) : filteredGroupedBrokenMods.length > 0 ? (
          <UniversalGroup
            title={`${t("citizen_action_incompatible", "Incompatible")} (${filteredGroupedBrokenMods.length})`}
            icon={heroIcon}
          >
            {renderGroupedIncompatibleSections({
              groupedBrokenMods: filteredGroupedBrokenMods,
              ignoredBroken,
              setIgnoredBroken,
              toggleInActiveSet,
              allow_write,
              t,
              activeGameSchema,
            })}
          </UniversalGroup>
        ) : null}
      </div>
    </SidePanel>
  );
}
