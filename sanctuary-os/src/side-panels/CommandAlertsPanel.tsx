import { useState, useMemo, useEffect } from "react";
import {
  CustomDropdown,
  SidePanel,
  EmptyState,
  PanelHeaderGroup,
  PanelHeaderButton,
  HoverTooltip,
  ActionPill,
  InlineFilterGroup,
  SidePanelHeroCard,
  DashboardStatTile,
  SidePanelFilterBar,
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
  resolveActiveBlueprintMods,
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
  const networkUpdates = useStore((state: any) => state.networkUpdates);
  const ignoredGlobal = useStore((state: any) => state.ignoredGlobal);
  const showImages = useStore((state: any) => state.showImages);
  const playSets = useStore((state: any) => state.playSets);
  const [selectedBpName, setSelectedBpName] = useState<string>("");
  const [ignoredConflicts, setIgnoredConflicts] = useState<Set<string>>(new Set());
  const [ignoredBroken, setIgnoredBroken] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"all" | "broken" | "conflicts">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [radarCacheTick, setRadarCacheTick] = useState(0);

  const effectivePlaySet = useMemo(() => {
    if (selectedBpName === "ALL_VAULT") {
      return {
        name: t("filter_all_vault_scope", "All {Vault}"),
        mods: (Array.isArray(modList) ? modList : []).map((m: any) => m.name).filter(Boolean),
      };
    }
    if (selectedBpName && Array.isArray(playSets)) {
      const found = playSets.find(
        (ps: any) => String(ps?.name || "").toLowerCase() === selectedBpName.toLowerCase()
      );
      if (found) return found;
    }
    return playSet;
  }, [selectedBpName, playSets, playSet, modList, t]);

  useEffect(() => {
    const handleRadarCacheUpdate = () => setRadarCacheTick((c) => c + 1);
    window.addEventListener("sanctuary-radar-cache-updated", handleRadarCacheUpdate);
    return () =>
      window.removeEventListener("sanctuary-radar-cache-updated", handleRadarCacheUpdate);
  }, []);

  const activeMods = useMemo(() => {
    if (!isOpen) return [];
    return resolveActiveBlueprintMods(
      effectivePlaySet?.mods,
      modList,
      activeGameSchema,
      networkUpdates
    );
  }, [isOpen, effectivePlaySet?.mods, modList, activeGameSchema, networkUpdates]);

  const activeConflicts = useMemo(() => {
    if (!isOpen) return [];
    const allResolved = resolveBlueprintConflicts(
      effectivePlaySet?.name,
      activeMods,
      ignoredGlobal,
      t,
      activeGameSchema
    );
    return allResolved.filter((c) =>
      mode === "critical"
        ? Number(c.conflict?.severity_rank) === 4
        : Number(c.conflict?.severity_rank) !== 4
    );
  }, [isOpen, effectivePlaySet?.name, activeMods, ignoredGlobal, mode, t, activeGameSchema, radarCacheTick]);

  const allBrokenMods = useMemo(() => {
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

  const brokenMods = useMemo(
    () =>
      allBrokenMods.filter((m: any) =>
        mode === "critical" ? m._alert_type === "red" : m._alert_type === "amber"
      ),
    [allBrokenMods, mode]
  );

  const allGroupedBrokenMods = useMemo(() => groupBrokenMods(allBrokenMods), [allBrokenMods]);
  const allGroupedRedMods = useMemo(
    () => allGroupedBrokenMods.filter((m: any) => m._alert_type === "red"),
    [allGroupedBrokenMods]
  );
  const allGroupedAmberMods = useMemo(
    () => allGroupedBrokenMods.filter((m: any) => m._alert_type === "amber"),
    [allGroupedBrokenMods]
  );

  useEffect(() => {
    if (isOpen) {
      setActiveTab("all");
      setCategoryFilter("all");
      setSearchQuery("");
    }
  }, [isOpen, mode]);

  const { applyConflictOverride } = usePlaySetLogic();

  const schemaPriorityOptions = useMemo(() => {
    const tiers = activeGameSchema?.load_order?.priority_tiers;
    if (Array.isArray(tiers) && tiers.length > 0) {
      return tiers.map((pt: any) => ({
        id: pt.folder ? `!${pt.folder.replace(/^!/, "")}` : "",
        rawFolder: pt.folder || "",
        label:
          pt.label ||
          (pt.folder ? pt.folder : t("bp_priority_default", "Standard Priority")),
      }));
    }
    return [];
  }, [activeGameSchema, t]);

  const getPriorityDrop = (modData: any) => {
    if (!modData || modData.isFallback || !allow_write || schemaPriorityOptions.length === 0) {
      return null;
    }
    let currentPriority = "";
    if (modData.path) {
      const firstPart = modData.path.split(/[/\\]/)[0];
      const matchedOpt = schemaPriorityOptions.find(
        (opt) =>
          opt.id &&
          (opt.id.toLowerCase() === firstPart.toLowerCase() ||
            opt.rawFolder.toLowerCase() === firstPart.toLowerCase())
      );
      if (matchedOpt) {
        currentPriority = matchedOpt.id;
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
          options={schemaPriorityOptions.map((o) => ({ id: o.id, label: o.label }))}
        />
      </div>
    );
  };

  const groupedBrokenMods = useMemo(() => groupBrokenMods(brokenMods), [brokenMods]);

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
        allow_write && allBrokenMods.length > 0 ? (
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_remove_circle_outline", "remove_circle_outline")}
              tooltip={`${t("btn_remove", "{Remove}")} ${allGroupedRedMods.length + allGroupedAmberMods.length} ${t("term_mods", "{Mods}")}`}
              tooltipSubtitle={`${t("bp_purge_unstable", "{Remove} {0} Unstable").replace(/^.*\{0\}\s*/, `${allGroupedAmberMods.length} `)}\n${t("bp_purge_corrupted", "{Remove} {0} Corrupted").replace(/^.*\{0\}\s*/, `${allGroupedRedMods.length} `)}`}
              variant={allGroupedRedMods.length > 0 ? "danger" : "warning"}
              onClick={() => {
                allBrokenMods.forEach((m: any) =>
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
          overline={
            isCriticalMode
              ? t("action_required", "Critical Action Required")
              : t("system_alerts_title", "System Alerts")
          }
          title={effectivePlaySet?.name || t("active", "Active")}
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
          <SidePanelFilterBar className="sm:grid-cols-3 gap-2.5">
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
          </SidePanelFilterBar>
        )}

        <ActionPill
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          searchPlaceholder={t("nav_search", "Search...")}
          primaryPopover={{
            icon: t("icon_tune", "tune"),
            label: t("filters", "Filters"),
            content: (
              <div className="flex flex-col gap-4 w-[280px] p-3">
                {Array.isArray(playSets) && playSets.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 px-1">
                      {t("filter_blueprint_scope", "{Blueprint} Scope")}
                    </span>
                    <InlineFilterGroup
                      value={selectedBpName || playSet?.name || ""}
                      onChange={(v: string) => setSelectedBpName(v)}
                      options={[
                        {
                          id: "ALL_VAULT",
                          label: t("filter_all_vault_scope", "All {Vault}"),
                        },
                        ...playSets.map((ps: any) => ({
                          id: String(ps?.name || "Blueprint"),
                          label: String(ps?.name || "Blueprint"),
                        })),
                      ]}
                    />
                  </div>
                )}

                {activeTab !== "conflicts" && (
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
                )}
              </div>
            ),
          }}
        />

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
            headerAction={
              allow_write && toggleInActiveSet ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    filteredGroupedBrokenMods.forEach((mod: any) => {
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
                    isCriticalMode
                      ? "text-[var(--danger)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]"
                      : "text-[var(--warning)] hover:border-[color-mix(in_srgb,var(--warning)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--warning)_10%,transparent)]"
                  } flex items-center justify-center transition-all cursor-pointer shrink-0`}
                >
                  <span className="material-symbols-outlined !text-[15px]">
                    {t("icon_remove_circle_outline", "remove_circle_outline")}
                  </span>
                  <HoverTooltip
                    className="z-[100] !right-0 !translate-x-0 !left-auto"
                    title={(isCriticalMode
                      ? t("bp_purge_corrupted", "{Remove} {0} Corrupted")
                      : t("bp_purge_unstable", "{Remove} {0} Unstable")
                    ).replace("{0}", String(filteredGroupedBrokenMods.length))}
                    icon={t("icon_remove_circle_outline", "remove_circle_outline")}
                    variant={isCriticalMode ? "danger" : "warning"}
                  />
                </button>
              ) : undefined
            }
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
