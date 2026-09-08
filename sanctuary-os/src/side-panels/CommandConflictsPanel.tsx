import React, { useMemo, useState, useEffect } from "react";
import { SidePanel, formatDisplayName, HoverTooltip, CustomDropdown } from "../shared";
import { UniversalCard } from "../components/universal/UniversalCard";
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
    forceRemove?: boolean,
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
  const [ignoredConflicts, setIgnoredConflicts] = useState<Set<string>>(
    new Set(),
  );

  const activeConflicts = useMemo(() => {
    const conflicts: any[] = [];
    try {
      const stored = null;
      if (stored) {
        const localConflicts = JSON.parse(stored);
        
        const uppercaseActiveMods = activeMods.map((em: any) => {
          if (em.isFallback) return null;
          return {
            em,
            cleanN: String(em.name || "").toUpperCase(),
            cleanDisp: String(em.displayName || "").toUpperCase()
          };
        }).filter(Boolean);

        const giantActiveString = uppercaseActiveMods.map((m: any) => m.cleanN + " | " + m.cleanDisp).join(" | ");

        localConflicts.forEach((lc: any) => {
          if (ignoredGlobal.includes(lc.mod_pair)) return;

          const targetCleanA = String(lc.modA || lc.mod_a || '').toUpperCase();
          const targetCleanB = String(lc.modB || lc.mod_b || '').toUpperCase();

          // Fast rejection: if the target isn't found in any active mod name/display name, 
          // AND no active mod name is found within the target, skip it.
          const aMightMatch = giantActiveString.includes(targetCleanA) || uppercaseActiveMods.some((item: any) => targetCleanA.includes(item.cleanN));
          if (!aMightMatch) return;

          const bMightMatch = giantActiveString.includes(targetCleanB) || uppercaseActiveMods.some((item: any) => targetCleanB.includes(item.cleanN));
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
                resolution_note: lc.resolution_note || "Local Scan Detects Tuning Overlap",
              },
            });
          }
        });
      }
    } catch (e) { }

    return conflicts;
  }, [activeMods, ignoredGlobal]);

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
              await tauriBridge.moveModToPriorityFolder(
                vaultPath,
                modData.name,
                newPrio,
              );
              if (onRefreshMods) onRefreshMods();
            } catch (e) {
              console.error("Failed to move mod priority", e);
            }
          }}
          options={[
            { id: "", label: t("bp_priority_default") },
            {
              id: "!Sanctuary",
              label: t("bp_priority_sanctuary"),
            },
            {
              id: "!Sanctuary2",
              label:
                t("bp_priority_sanctuary2"),
            },
            {
              id: "!Sanctuary3",
              label:
                t("bp_priority_sanctuary3"),
            },
          ]}
        />
      </div>
    );
  };
  const tier4Count = activeConflicts.filter((c: any) => c.conflict.severity_rank === 4).length;
  const tier3Count = activeConflicts.length - tier4Count;

  const headerIconColorClass = tier4Count > 0 ? "text-red-500" : "text-amber-500";
  const headerIcon = tier4Count > 0 ? (t("icon_crisis_alert")) : (t("icon_tune"));

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("tab_matrix")}
      subtitle={t("bp_load_order_conflicts")}
      icon={headerIcon}
      iconColorClass={headerIconColorClass}
      widthClass="w-[550px]"
    >
      <div className="flex flex-col gap-4 w-full">
        <div className="px-1 py-2 shrink-0 flex items-center justify-between w-full relative border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] mb-4">
          <h3 className="text-[10px] font-black text-[var(--subtext)] capitalize tracking-[0.2em] opacity-80">
            {t("bp_load_order_conflicts")}
          </h3>
          <div className="flex items-center gap-3 text-[10px] font-mono text-[var(--subtext)] opacity-60 capitalize tracking-widest">
            <span>{activeConflicts.length} {t("items")}</span>
            {(tier4Count > 0 || tier3Count > 0) && <span className="opacity-50">•</span>}
            {tier4Count > 0 && <span className="text-red-400 font-bold">{tier4Count} {t("bp_pill_fatal")}</span>}
            {(tier4Count > 0 && tier3Count > 0) && <span className="opacity-30">|</span>}
            {tier3Count > 0 && <span className="text-amber-400 font-bold">{tier3Count} {t("bp_pill_overlaps")}</span>}
            {activeConflicts.length === 0 && <span className="text-[var(--success)]">• {t("bp_no_conflicts_detected")}</span>}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 pb-24">
          {activeConflicts.length === 0 ? (
            <div className="col-span-1 flex flex-col items-center justify-center opacity-50 space-y-4 py-12">
              <span className="material-symbols-outlined !text-6xl theme-text-success drop-shadow-sm">
                {t("icon_security")}
              </span>
              <p className="text-[10px] font-black tracking-widest capitalize text-center">
                {t("bp_no_conflicts_detected")}
              </p>
            </div>
          ) : (
            activeConflicts.map((ac) => {
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

              const borderClass = isTier4
                ? "border-[color-mix(in_srgb,var(--danger)_30%,transparent)]"
                : "border-[color-mix(in_srgb,var(--warning)_30%,transparent)]";
              const bgClass = isTier4
                ? "bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]"
                : "bg-[color-mix(in_srgb,var(--warning)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--warning)_10%,transparent)]";
              const shadowClass = isTier4
                ? "hover:shadow-md"
                : "hover:shadow-md";
              const textClass = isTier4 ? "text-red-500" : "text-amber-500";
              const iconName = isTier4
                ? t("icon_crisis_alert")
                : t("icon_tune");

              return (
                <UniversalCard
                  layout="vertical"
                  key={ac.pairId}
                  statusColor={isIgnored ? "border-[color-mix(in_srgb,var(--text)_5%,transparent)]" : borderClass}
                  className={isIgnored ? "opacity-50 grayscale bg-black/20" : `${bgClass} shadow-lg ${shadowClass}`}
                  title={
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-2">
                        <span className={`material-symbols-outlined !text-[18px] ${isIgnored ? "text-[var(--text)] opacity-30" : textClass}`}>
                          {iconName}
                        </span>
                        <span className={`text-[11px] font-black capitalize tracking-widest ${isIgnored ? "text-[var(--text)] opacity-30" : textClass}`}>
                          {isTier4 ? t("fatal_conflict") : t("tier3_conflict")}
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          const newSet = new Set(ignoredConflicts);
                          if (isIgnored) newSet.delete(ac.pairId);
                          else newSet.add(ac.pairId);
                          setIgnoredConflicts(newSet);
                        }}
                        className="w-8 h-8 rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] transition-all active:scale-95 flex items-center justify-center shrink-0 group relative"
                      >
                        <span className="material-symbols-outlined !text-[16px]">
                          {isIgnored ? "visibility" : "visibility_off"}
                        </span>
                        <HoverTooltip title={isIgnored ? t("bp_restore_alert") : t("btn_ignore")} variant="default" />
                      </button>
                    </div>
                  }
                  subtitle={
                    <span className="text-[9px] font-mono text-[var(--subtext)] opacity-60 capitalize tracking-widest mt-0.5 text-left w-full block">
                      {ac.conflict.resolution_note || "Local Scan Detects Tuning Overlap"}
                    </span>
                  }
                >
                    <div
                      className={`flex flex-col gap-3 w-full mt-2 ${isIgnored ? "opacity-30" : ""}`}
                    >
                      <UniversalCard
                        layout="compact"
                        statusColor={isWinnerA && !isTier4 ? "border-[color-mix(in_srgb,var(--success)_50%,transparent)]" : "border-[color-mix(in_srgb,var(--text)_10%,transparent)]"}
                        className={isWinnerA && !isTier4 ? "bg-[color-mix(in_srgb,var(--success)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)]" : "glass-surface hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)]"}
                        title={<span className={`truncate ${isWinnerA && !isTier4 ? "text-[var(--success)]" : "text-[var(--text)]"}`}>{formatDisplayName(ac.modA.name)}</span>}
                        subtitle={
                          <span className="text-[9px] font-mono text-cyan-400 tracking-widest opacity-80 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-2 py-0.5 rounded border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] w-fit">
                            {ac.modA.version || "v.Local"}
                          </span>
                        }
                        actions={
                          <div className="flex items-center gap-2">
                            {ac.conflict.severity_rank === 4 ? (
                              allow_write && toggleInActiveSet && (
                                <button
                                  onClick={() => toggleInActiveSet(ac.modA._originalSetName || ac.modA.name, true, true)}
                                  className="w-8 h-8 rounded-lg bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:border-red-500 hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] text-red-400 transition-all active:scale-95 flex items-center justify-center group relative"
                                >
                                  <span className="material-symbols-outlined !text-[16px]">{t("icon_delete")}</span>
                                  <HoverTooltip title={t("bp_yeet_artifact")} variant="danger" />
                                </button>
                              )
                            ) : ac.conflict.severity_rank === 3 ? (
                              isWinnerA ? (
                                <div className="h-8 w-8 rounded-lg bg-[color-mix(in_srgb,var(--success)_20%,transparent)] border border-[color-mix(in_srgb,var(--success)_50%,transparent)] text-[var(--success)] flex items-center justify-center shadow-[0_0_10px_rgba(var(--success-rgb),0.3)] group relative">
                                  <span className="material-symbols-outlined !text-[16px]">{t("icon_star")}</span>
                                  <HoverTooltip title={t("bp_winning_artifact")} variant="default" />
                                </div>
                              ) : isWinnerB ? (
                                <div className="h-8 w-8 rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] opacity-60 flex items-center justify-center group relative">
                                  <span className="material-symbols-outlined !text-[16px]">{t("icon_block")}</span>
                                  <HoverTooltip title={t("bp_overridden_by_winner")} variant="default" />
                                </div>
                              ) : (
                                applyConflictOverride && activeSetName && (
                                  <button
                                    onClick={() => applyConflictOverride(ac.modA._originalSetName || ac.modA.name, ac.pairId, activeSetName)}
                                    className="h-8 w-8 rounded-lg bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border border-[color-mix(in_srgb,var(--success)_20%,transparent)] text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] hover:border-[var(--success)] transition-all active:scale-95 flex items-center justify-center group relative"
                                  >
                                    <span className="material-symbols-outlined !text-[16px]">{t("icon_check_circle")}</span>
                                    <HoverTooltip title={t("bp_select_winning_artifact")} variant="default" />
                                  </button>
                                )
                              )
                            ) : (
                              <div className="flex items-center gap-2">
                                <div className="w-32">{getPriorityDrop(ac.modA)}</div>
                                {allow_write && toggleInActiveSet && (
                                  <button
                                    onClick={() => toggleInActiveSet(ac.modA._originalSetName || ac.modA.name, true, true)}
                                    className="w-8 h-8 rounded-lg bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:border-red-500 hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] text-red-400 transition-all active:scale-95 flex items-center justify-center group relative"
                                  >
                                    <span className="material-symbols-outlined !text-[16px]">{t("icon_delete")}</span>
                                    <HoverTooltip title={t("bp_yeet_artifact")} variant="danger" />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        }
                      />

                      <UniversalCard
                        layout="compact"
                        statusColor={isWinnerB && !isTier4 ? "border-[color-mix(in_srgb,var(--success)_50%,transparent)]" : "border-[color-mix(in_srgb,var(--text)_10%,transparent)]"}
                        className={isWinnerB && !isTier4 ? "bg-[color-mix(in_srgb,var(--success)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)]" : "glass-surface hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)]"}
                        title={<span className={`truncate ${isWinnerB && !isTier4 ? "text-[var(--success)]" : "text-[var(--text)]"}`}>{formatDisplayName(ac.modB.name)}</span>}
                        subtitle={
                          <span className="text-[9px] font-mono text-cyan-400 tracking-widest opacity-80 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-2 py-0.5 rounded border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] w-fit">
                            {ac.modB.version || "v.Local"}
                          </span>
                        }
                        actions={
                          <div className="flex items-center gap-2">
                            {ac.conflict.severity_rank === 4 ? (
                              allow_write && toggleInActiveSet && (
                                <button
                                  onClick={() => toggleInActiveSet(ac.modB._originalSetName || ac.modB.name, true, true)}
                                  className="w-8 h-8 rounded-lg bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:border-red-500 hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] text-red-400 transition-all active:scale-95 flex items-center justify-center group relative"
                                >
                                  <span className="material-symbols-outlined !text-[16px]">{t("icon_delete")}</span>
                                  <HoverTooltip title={t("bp_yeet_artifact")} variant="danger" />
                                </button>
                              )
                            ) : ac.conflict.severity_rank === 3 ? (
                              isWinnerB ? (
                                <div className="h-8 w-8 rounded-lg bg-[color-mix(in_srgb,var(--success)_20%,transparent)] border border-[color-mix(in_srgb,var(--success)_50%,transparent)] text-[var(--success)] flex items-center justify-center shadow-[0_0_10px_rgba(var(--success-rgb),0.3)] group relative">
                                  <span className="material-symbols-outlined !text-[16px]">{t("icon_star")}</span>
                                  <HoverTooltip title={t("bp_winning_artifact")} variant="default" />
                                </div>
                              ) : isWinnerA ? (
                                <div className="h-8 w-8 rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] opacity-60 flex items-center justify-center group relative">
                                  <span className="material-symbols-outlined !text-[16px]">{t("icon_block")}</span>
                                  <HoverTooltip title={t("bp_overridden_by_winner")} variant="default" />
                                </div>
                              ) : (
                                applyConflictOverride && activeSetName && (
                                  <button
                                    onClick={() => applyConflictOverride(ac.modB._originalSetName || ac.modB.name, ac.pairId, activeSetName)}
                                    className="h-8 w-8 rounded-lg bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border border-[color-mix(in_srgb,var(--success)_20%,transparent)] text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] hover:border-[var(--success)] transition-all active:scale-95 flex items-center justify-center group relative"
                                  >
                                    <span className="material-symbols-outlined !text-[16px]">{t("icon_check_circle")}</span>
                                    <HoverTooltip title={t("bp_select_winning_artifact")} variant="default" />
                                  </button>
                                )
                              )
                            ) : (
                              <div className="flex items-center gap-2">
                                <div className="w-32">{getPriorityDrop(ac.modB)}</div>
                                {allow_write && toggleInActiveSet && (
                                  <button
                                    onClick={() => toggleInActiveSet(ac.modB._originalSetName || ac.modB.name, true, true)}
                                    className="w-8 h-8 rounded-lg bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:border-red-500 hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] text-red-400 transition-all active:scale-95 flex items-center justify-center group relative"
                                  >
                                    <span className="material-symbols-outlined !text-[16px]">{t("icon_delete")}</span>
                                    <HoverTooltip title={t("bp_yeet_artifact")} variant="danger" />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        }
                      />
                    </div>
                </UniversalCard>
              );
            })
          )}
        </div>
      </div>
    </SidePanel>
  );
}


