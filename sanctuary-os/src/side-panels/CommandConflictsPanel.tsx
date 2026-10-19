import React, { useMemo, useState } from "react";
import {
  SidePanel,
  formatDisplayName,
  HoverTooltip,
  CustomDropdown,
  EmptyState,
  ActionPill,
  InlineFilterGroup,
  getModIcon,
} from "../shared";
import { UniversalCard } from "../components/universal/UniversalCard";
import { UniversalGroup } from "../components/universal/UniversalLayout";
import { useLexicon } from "../LexiconContext";
import { tauriBridge } from "../lib/tauri-bridge";
import { useStore } from "../store";

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

  const activeConflicts = useMemo(() => {
    const conflicts: any[] = [];
    try {
      const stored = null;
      if (stored) {
        const localConflicts = JSON.parse(stored);

        const uppercaseActiveMods = activeMods
          .map((em: any) => {
            if (em.isFallback) return null;
            return {
              em,
              cleanN: String(em.name || "").toUpperCase(),
              cleanDisp: String(em.displayName || "").toUpperCase(),
            };
          })
          .filter(Boolean);

        const giantActiveString = uppercaseActiveMods
          .map((m: any) => m.cleanN + " | " + m.cleanDisp)
          .join(" | ");

        localConflicts.forEach((lc: any) => {
          if (ignoredGlobal.includes(lc.mod_pair)) return;

          const targetCleanA = String(lc.modA || lc.mod_a || "").toUpperCase();
          const targetCleanB = String(lc.modB || lc.mod_b || "").toUpperCase();

          const aMightMatch =
            giantActiveString.includes(targetCleanA) ||
            uppercaseActiveMods.some((item: any) => targetCleanA.includes(item.cleanN));
          if (!aMightMatch) return;

          const bMightMatch =
            giantActiveString.includes(targetCleanB) ||
            uppercaseActiveMods.some((item: any) => targetCleanB.includes(item.cleanN));
          if (!bMightMatch) return;

          const modAMatchItem = uppercaseActiveMods.find((item: any) => {
            return (
              item.cleanN.includes(targetCleanA) ||
              item.cleanDisp.includes(targetCleanA) ||
              targetCleanA.includes(item.cleanN)
            );
          });

          const modBMatchItem = uppercaseActiveMods.find((item: any) => {
            return (
              item.cleanN.includes(targetCleanB) ||
              item.cleanDisp.includes(targetCleanB) ||
              targetCleanB.includes(item.cleanN)
            );
          });

          const modAMatch = modAMatchItem?.em;
          const modBMatch = modBMatchItem?.em;

          if (modAMatch && modBMatch) {
            conflicts.push({
              pairId: lc.mod_pair,
              modA: modAMatch,
              modB: modBMatch,
              conflict: {
                severity_rank: lc.severity_rank,
                resolution_note: lc.resolution_note || t("tier3_conflict", "Tuning Overlap"),
              },
            });
          }
        });
      }
    } catch (e) {}

    return conflicts;
  }, [activeMods, ignoredGlobal, t]);

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
      widthClass="w-full md:w-[760px]"
    >
      <div className="flex flex-col gap-6 relative z-10 w-full pb-12">
        {activeConflicts.length > 0 && (
          <ActionPill
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchPlaceholder={t("ui_placeholder_search", "Search...")}
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
          <div className="glass-panel rounded-3xl p-10">
            <EmptyState
              icon={t("icon_security", "security")}
              title={t("bp_no_conflicts_detected", "No Conflicts Detected")}
            />
          </div>
        ) : (
          <UniversalGroup
            title={`${t("bp_load_order_conflicts", "Conflicts Detected")} (${filteredConflicts.length})`}
            icon={headerIcon}
          >
            <div className="flex flex-col gap-4">
              {filteredConflicts.map((ac) => {
                const isIgnored = ignoredConflicts.has(ac.pairId);
                const isTier4 = ac.conflict.severity_rank === 4;

                const prefixA =
                  (ac.modA._originalSetName || ac.modA.name)
                    ?.split(/[/\\]/)
                    .slice(0, -1)
                    .join("/") || "";
                const prefixB =
                  (ac.modB._originalSetName || ac.modB.name)
                    ?.split(/[/\\]/)
                    .slice(0, -1)
                    .join("/") || "";
                const isWinnerA = prefixA.toLowerCase() === "sanctuary";
                const isWinnerB = prefixB.toLowerCase() === "sanctuary";

                const iconName = isTier4
                  ? t("icon_crisis_alert", "crisis_alert")
                  : t("icon_tune", "tune");
                const badgeBg = isTier4
                  ? "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)]"
                  : "bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border-[color-mix(in_srgb,var(--warning)_30%,transparent)] text-[var(--warning)]";

                const imageA =
                  showImages &&
                  (ac.modA.image_url || ac.modA.imageUrl) &&
                  String(ac.modA.image_url || ac.modA.imageUrl) !== "null"
                    ? ac.modA.image_url || ac.modA.imageUrl
                    : undefined;
                const imageB =
                  showImages &&
                  (ac.modB.image_url || ac.modB.imageUrl) &&
                  String(ac.modB.image_url || ac.modB.imageUrl) !== "null"
                    ? ac.modB.image_url || ac.modB.imageUrl
                    : undefined;

                return (
                  <UniversalCard
                    key={ac.pairId}
                    layout="horizontal"
                    isGhosted={isIgnored}
                    icon={iconName}
                    title={
                      ac.conflict.resolution_note || t("tier3_conflict", "Tuning Overlap")
                    }
                    badges={
                      <div
                        className={`glass-surface border px-2 py-0.5 rounded-[max(0px,calc(var(--radius)-8px))] shadow-sm flex items-center gap-1.5 ${badgeBg}`}
                      >
                        <span className="text-[8px] font-black uppercase tracking-widest">
                          {isTier4
                            ? t("fatal_conflict", "Fatal Conflict")
                            : t("tier3_conflict", "Tuning Overlap")}
                        </span>
                      </div>
                    }
                    actions={
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          const newSet = new Set(ignoredConflicts);
                          if (isIgnored) newSet.delete(ac.pairId);
                          else newSet.add(ac.pairId);
                          setIgnoredConflicts(newSet);
                        }}
                        className="relative group/actionbtn w-8 h-8 rounded-[max(0px,calc(var(--radius)-4px))] backdrop-blur-md border flex items-center justify-center transition-all shadow-sm hover:shadow-md hover:scale-105 cursor-pointer bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
                      >
                        <span className="material-symbols-outlined !text-[16px]">
                          {isIgnored
                            ? t("icon_visibility", "visibility")
                            : t("icon_visibility_off", "visibility_off")}
                        </span>
                        <HoverTooltip
                          title={
                            isIgnored
                              ? t("bp_restore_alert", "Restore Alert")
                              : t("btn_ignore", "Ignore")
                          }
                          icon={
                            isIgnored
                              ? t("icon_visibility", "visibility")
                              : t("icon_visibility_off", "visibility_off")
                          }
                        />
                      </button>
                    }
                  >
                    <div
                      className={`grid grid-cols-1 sm:grid-cols-2 gap-3 w-full ${
                        isIgnored ? "pointer-events-none" : ""
                      }`}
                    >
                      <UniversalCard
                        layout="compact"
                        isActive={isWinnerA && !isTier4}
                        image={imageA}
                        icon={!imageA ? getModIcon(ac.modA, activeGameSchema, t) : undefined}
                        title={formatDisplayName(ac.modA.displayName || ac.modA.name)}
                        subtitle={ac.modA.author || t("unknown_mason", "Unknown Creator")}
                        actions={
                          <div className="flex items-center gap-1.5">
                            {ac.conflict.severity_rank === 4 ? (
                              allow_write &&
                              toggleInActiveSet && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    toggleInActiveSet(
                                      ac.modA._originalSetName || ac.modA.name,
                                      true,
                                      true
                                    )
                                  }
                                  className="relative w-8 h-8 rounded-[max(0px,calc(var(--radius)-4px))] backdrop-blur-md border flex items-center justify-center transition-all shadow-sm hover:scale-105 cursor-pointer bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)]"
                                >
                                  <span className="material-symbols-outlined !text-[16px]">
                                    {t("icon_delete", "delete")}
                                  </span>
                                  <HoverTooltip
                                    title={t("btn_remove", "Remove")}
                                    icon={t("icon_delete", "delete")}
                                    variant="danger"
                                  />
                                </button>
                              )
                            ) : ac.conflict.severity_rank === 3 ? (
                              isWinnerA ? (
                                <div className="glass-surface border px-2 py-0.5 rounded-[max(0px,calc(var(--radius)-8px))] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)]">
                                  <span className="text-[8px] font-black uppercase tracking-widest">
                                    {t("bp_winning_artifact", "Winning Override")}
                                  </span>
                                </div>
                              ) : isWinnerB ? (
                                <div className="glass-surface border px-2 py-0.5 rounded-[max(0px,calc(var(--radius)-8px))] bg-slate-500/[10%] border-slate-500/[30%] text-slate-400">
                                  <span className="text-[8px] font-black uppercase tracking-widest">
                                    {t("bp_overridden_by_winner", "Overridden")}
                                  </span>
                                </div>
                              ) : (
                                applyConflictOverride &&
                                activeSetName && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      applyConflictOverride(
                                        ac.modA._originalSetName || ac.modA.name,
                                        ac.pairId,
                                        activeSetName
                                      )
                                    }
                                    className="relative w-8 h-8 rounded-[max(0px,calc(var(--radius)-4px))] backdrop-blur-md border flex items-center justify-center transition-all shadow-sm hover:scale-105 cursor-pointer bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)]"
                                  >
                                    <span className="material-symbols-outlined !text-[16px]">
                                      {t("icon_check_circle", "check_circle")}
                                    </span>
                                    <HoverTooltip
                                      title={t("bp_select_winning_artifact", "Select Winner")}
                                      icon={t("icon_check_circle", "check_circle")}
                                      variant="accent"
                                    />
                                  </button>
                                )
                              )
                            ) : (
                              <div className="flex items-center gap-2">
                                <div className="w-28">{getPriorityDrop(ac.modA)}</div>
                              </div>
                            )}
                          </div>
                        }
                      />

                      <UniversalCard
                        layout="compact"
                        isActive={isWinnerB && !isTier4}
                        image={imageB}
                        icon={!imageB ? getModIcon(ac.modB, activeGameSchema, t) : undefined}
                        title={formatDisplayName(ac.modB.displayName || ac.modB.name)}
                        subtitle={ac.modB.author || t("unknown_mason", "Unknown Creator")}
                        actions={
                          <div className="flex items-center gap-1.5">
                            {ac.conflict.severity_rank === 4 ? (
                              allow_write &&
                              toggleInActiveSet && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    toggleInActiveSet(
                                      ac.modB._originalSetName || ac.modB.name,
                                      true,
                                      true
                                    )
                                  }
                                  className="relative w-8 h-8 rounded-[max(0px,calc(var(--radius)-4px))] backdrop-blur-md border flex items-center justify-center transition-all shadow-sm hover:scale-105 cursor-pointer bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)]"
                                >
                                  <span className="material-symbols-outlined !text-[16px]">
                                    {t("icon_delete", "delete")}
                                  </span>
                                  <HoverTooltip
                                    title={t("btn_remove", "Remove")}
                                    icon={t("icon_delete", "delete")}
                                    variant="danger"
                                  />
                                </button>
                              )
                            ) : ac.conflict.severity_rank === 3 ? (
                              isWinnerB ? (
                                <div className="glass-surface border px-2 py-0.5 rounded-[max(0px,calc(var(--radius)-8px))] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)]">
                                  <span className="text-[8px] font-black uppercase tracking-widest">
                                    {t("bp_winning_artifact", "Winning Override")}
                                  </span>
                                </div>
                              ) : isWinnerA ? (
                                <div className="glass-surface border px-2 py-0.5 rounded-[max(0px,calc(var(--radius)-8px))] bg-slate-500/[10%] border-slate-500/[30%] text-slate-400">
                                  <span className="text-[8px] font-black uppercase tracking-widest">
                                    {t("bp_overridden_by_winner", "Overridden")}
                                  </span>
                                </div>
                              ) : (
                                applyConflictOverride &&
                                activeSetName && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      applyConflictOverride(
                                        ac.modB._originalSetName || ac.modB.name,
                                        ac.pairId,
                                        activeSetName
                                      )
                                    }
                                    className="relative w-8 h-8 rounded-[max(0px,calc(var(--radius)-4px))] backdrop-blur-md border flex items-center justify-center transition-all shadow-sm hover:scale-105 cursor-pointer bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)]"
                                  >
                                    <span className="material-symbols-outlined !text-[16px]">
                                      {t("icon_check_circle", "check_circle")}
                                    </span>
                                    <HoverTooltip
                                      title={t("bp_select_winning_artifact", "Select Winner")}
                                      icon={t("icon_check_circle", "check_circle")}
                                      variant="accent"
                                    />
                                  </button>
                                )
                              )
                            ) : (
                              <div className="flex items-center gap-2">
                                <div className="w-28">{getPriorityDrop(ac.modB)}</div>
                              </div>
                            )}
                          </div>
                        }
                      />
                    </div>
                  </UniversalCard>
                );
              })}
            </div>
          </UniversalGroup>
        )}
      </div>
    </SidePanel>
  );
}
