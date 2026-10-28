import { useEffect, useMemo, useState } from "react";
import {
  SidePanel,
  CustomDropdown,
  EmptyState,
  ActionPill,
  InlineFilterGroup,
  SidePanelHeroCard,
  DashboardStatTile,
  UniversalGroup,
} from "../shared";
import { useLexicon } from "../LexiconContext";
import { tauriBridge } from "../lib/tauri-bridge";
import { useStore } from "../store";
import {
  resolveBlueprintConflicts,
  ConflictComparisonCard,
} from "./CommandIncompatiblePanel";

interface CommandConflictsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeMods: any[];
  allow_write: boolean;
  vaultPath: string;
  onRefreshMods: () => void;
  toggleInActiveSet: (
    targetName: string,
    excludeBroken?: boolean,
    forceRemove?: boolean
  ) => void;
  applyConflictOverride: (
    winnerName: string,
    modPair: string,
    currentScopeName: string
  ) => void;
  activeSetName?: string;
}

export default function CommandConflictsPanel({
  isOpen,
  onClose,
  activeMods,
  allow_write,
  vaultPath,
  onRefreshMods,
  toggleInActiveSet,
  applyConflictOverride,
  activeSetName,
}: CommandConflictsPanelProps) {
  const { t } = useLexicon();
  const ignoredGlobal = useStore((state) => state.ignoredGlobal);
  const showImages = useStore((state: any) => state.showImages);
  const [ignoredConflicts, setIgnoredConflicts] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [radarCacheTick, setRadarCacheTick] = useState(0);

  useEffect(() => {
    const handleRadarCacheUpdate = () => setRadarCacheTick((c) => c + 1);
    window.addEventListener("sanctuary-radar-cache-updated", handleRadarCacheUpdate);
    return () =>
      window.removeEventListener("sanctuary-radar-cache-updated", handleRadarCacheUpdate);
  }, []);

  const activeConflicts = useMemo(() => {
    return resolveBlueprintConflicts(activeSetName, activeMods, ignoredGlobal, t);
  }, [activeSetName, activeMods, ignoredGlobal, t, radarCacheTick]);

  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const schemaPriorityOptions = useMemo(() => {
    const tiers = activeGameSchema?.load_order?.priority_tiers;
    if (Array.isArray(tiers) && tiers.length > 0) {
      return tiers.map((pt: any) => ({
        id: pt.folder ? `!${pt.folder.replace(/^!/, "")}` : "",
        rawFolder: pt.folder || "",
        label: pt.label || (pt.folder ? pt.folder : t("bp_priority_default", "Standard Priority")),
      }));
    }
    return [
      { id: "", rawFolder: "", label: t("bp_priority_default", "Standard Priority") },
      { id: "!Sanctuary", rawFolder: "Sanctuary", label: t("bp_priority_sanctuary", "Priority 1") },
      {
        id: "!Sanctuary2",
        rawFolder: "Sanctuary2",
        label: t("bp_priority_sanctuary2", "Priority 2"),
      },
      {
        id: "!Sanctuary3",
        rawFolder: "Sanctuary3",
        label: t("bp_priority_sanctuary3", "Priority 3"),
      },
    ];
  }, [activeGameSchema, t]);

  const getPriorityDrop = (modData: any) => {
    if (!modData || modData.isFallback || !allow_write) return null;
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

  const tier4Count = activeConflicts.filter((c: any) => c.conflict.severity_rank === 4).length;
  const tier3Count = activeConflicts.length - tier4Count;

  const filteredConflicts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeConflicts.filter((ac) => {
      if (severityFilter === "fatal" && ac.conflict?.severity_rank !== 4) return false;
      if (severityFilter === "overlap" && ac.conflict?.severity_rank === 4) return false;
      if (!q) return true;
      const nameA = String(ac.modA?.displayName || ac.modA?.name || "").toLowerCase();
      const nameB = String(ac.modB?.displayName || ac.modB?.name || "").toLowerCase();
      const note = String(ac.conflict?.resolution_note || "").toLowerCase();
      return nameA.includes(q) || nameB.includes(q) || note.includes(q);
    });
  }, [activeConflicts, searchQuery, severityFilter]);

  const headerIconColorClass =
    tier4Count > 0 ? "text-[var(--danger)]" : "text-[var(--warning)]";
  const headerIcon =
    tier4Count > 0 ? t("icon_crisis_alert", "crisis_alert") : t("icon_tune", "tune");

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("tab_matrix", "Conflicts")}
      subtitle={t("bp_load_order_conflicts", "Load Order & Tuning Conflicts")}
      icon={headerIcon}
      iconColorClass={headerIconColorClass}
      widthClass="w-[90vw] md:w-[760px]"
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={headerIcon}
          overline={t("tab_matrix", "Conflicts")}
          title={activeSetName || t("bp_load_order_conflicts", "Load Order & Tuning Conflicts")}
          description={
            tier4Count > 0
              ? t("conflict_sev4_desc", "Fatal Collision — Cannot be installed together")
              : t(
                  "conflict_sev3_desc",
                  "Tuning Overlap — Load order override or minor feature overlap"
                )
          }
          badge={`${activeConflicts.length} ${t("term_mods", "Items")}`}
          badgeIcon={headerIcon}
          variant={
            tier4Count > 0 ? "danger" : activeConflicts.length > 0 ? "warning" : "success"
          }
        />

        {activeConflicts.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={headerIcon}
              label={t("filter_all", "All")}
              number={activeConflicts.length}
              colorClass={headerIconColorClass}
              isActive={severityFilter === "all"}
              onClick={() => setSeverityFilter("all")}
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_crisis_alert", "crisis_alert")}
              label={t("fatal_conflict", "Fatal Conflict")}
              number={tier4Count}
              colorClass="text-[var(--danger)]"
              isActive={severityFilter === "fatal"}
              onClick={() =>
                setSeverityFilter(severityFilter === "fatal" ? "all" : "fatal")
              }
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_tune", "tune")}
              label={t("tier3_conflict", "Tuning Overlap")}
              number={tier3Count}
              colorClass="text-[var(--warning)]"
              isActive={severityFilter === "overlap"}
              onClick={() =>
                setSeverityFilter(severityFilter === "overlap" ? "all" : "overlap")
              }
            />
          </div>
        )}

        {activeConflicts.length > 0 && (
          <ActionPill
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchPlaceholder={t("nav_search", "Search...")}
            primaryPopover={{
              icon: t("icon_tune", "tune"),
              label: t("filters", "Filters"),
              content: (
                <div className="flex flex-col gap-4 w-[280px] p-3">
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 px-1">
                      {t("status", "Status")}
                    </span>
                    <InlineFilterGroup
                      value={severityFilter}
                      onChange={(v: string) => setSeverityFilter(v)}
                      options={[
                        { id: "all", label: t("filter_all", "All") },
                        { id: "fatal", label: t("fatal_conflict", "Fatal Conflict") },
                        { id: "overlap", label: t("tier3_conflict", "Tuning Overlap") },
                      ]}
                    />
                  </div>
                </div>
              ),
            }}
          />
        )}

        {filteredConflicts.length === 0 ? (
          <EmptyState
            icon={t("icon_security", "security")}
            title={t("bp_no_conflicts_detected", "No Conflicts Detected")}
          />
        ) : (
          <UniversalGroup
            title={`${t("bp_load_order_conflicts", "Conflicts Detected")} (${filteredConflicts.length})`}
            icon={headerIcon}
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
                  scopeName={activeSetName}
                  getPriorityDrop={getPriorityDrop}
                  activeGameSchema={activeGameSchema}
                  t={t}
                />
              ))}
            </div>
          </UniversalGroup>
        )}
      </div>
    </SidePanel>
  );
}
