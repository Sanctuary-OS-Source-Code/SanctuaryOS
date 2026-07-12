import React, { useMemo, useState } from "react";
import { SidePanel, formatDisplayName, CustomDropdown } from "../shared";
import { useLexicon } from "../LexiconContext";
import { tauriBridge } from "../lib/tauri-bridge";

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
  setBlueprintLoadOrder: (
    updates: string | { name: string; prefix: string }[],
    prefix?: string,
  ) => void;
}

export default function CommandConflictsPanel({
  isOpen,
  onClose,
  activeMods,
  allow_write,
  vaultPath,
  onRefreshMods,
  toggleInActiveSet,
  setBlueprintLoadOrder,
}: CommandConflictsPanelProps) {
  const { t } = useLexicon();
  const [ignoredConflicts, setIgnoredConflicts] = useState<Set<string>>(
    new Set(),
  );

  const activeConflicts = useMemo(() => {
    const conflicts: any[] = [];
    activeMods.forEach((mod: any) => {
      if (mod.conflicts && Array.isArray(mod.conflicts)) {
        mod.conflicts.forEach((c: any) => {
          const enemyActive = activeMods.find((em: any) => {
            if (em.isFallback) return false;
            if (c.enemy_id && String(em.dbId) === String(c.enemy_id))
              return true;
            if (c.enemy_name) {
              const targetClean = String(c.enemy_name).toUpperCase();
              const cleanN = String(em.name || "").toUpperCase();
              const cleanDisp = String(em.displayName || "").toUpperCase();
              if (
                cleanN.includes(targetClean) ||
                cleanDisp.includes(targetClean)
              )
                return true;
            }
            return false;
          });

          if (
            enemyActive &&
            mod.name &&
            enemyActive.name &&
            mod.name !== enemyActive.name
          ) {
            const pairId = [mod.name, enemyActive.name].sort().join("::");
            if (!conflicts.find((ac: any) => ac.pairId === pairId)) {
              conflicts.push({
                pairId,
                modA: mod,
                modB: enemyActive,
                conflict: c,
              });
            }
          }
        });
      }
    });

    try {
      const stored = localStorage.getItem("sanctuary_local_conflicts");
      if (stored) {
        const localConflicts = JSON.parse(stored);
        localConflicts.forEach((lc: any) => {
          const modAMatch = activeMods.find((em: any) => {
            if (em.isFallback) return false;
            const cleanN = String(em.name || "").toUpperCase();
            const cleanDisp = String(em.displayName || "").toUpperCase();
            const targetClean = String(lc.modA).toUpperCase();
            return (
              cleanN.includes(targetClean) ||
              cleanDisp.includes(targetClean) ||
              targetClean.includes(cleanN)
            );
          });
          const modBMatch = activeMods.find((em: any) => {
            if (em.isFallback) return false;
            const cleanN = String(em.name || "").toUpperCase();
            const cleanDisp = String(em.displayName || "").toUpperCase();
            const targetClean = String(lc.modB).toUpperCase();
            return (
              cleanN.includes(targetClean) ||
              cleanDisp.includes(targetClean) ||
              targetClean.includes(cleanN)
            );
          });

          if (modAMatch && modBMatch && modAMatch.name !== modBMatch.name) {
            const pairId = [modAMatch.name, modBMatch.name].sort().join("::");
            if (!conflicts.find((ac: any) => ac.pairId === pairId)) {
              conflicts.push({
                pairId,
                modA: modAMatch,
                modB: modBMatch,
                conflict: {
                  severity_rank: lc.severity_rank,
                  resolution_note:
                    lc.resolution_note || "Local Scan Detects Tuning Overlap",
                },
              });
            }
          }
        });
      }
    } catch (e) { }

    return conflicts.filter((ac: any) => {
      if (ac.conflict.severity_rank !== 3) return true;
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
      return !isWinnerA && !isWinnerB;
    });
  }, [activeMods]);

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

  if (!isOpen) return null;

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
        <div className="px-1 py-2 shrink-0 flex items-center justify-between relative">
          <h3 className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-[0.2em] opacity-80">
            {t("bp_load_order_conflicts")}
          </h3>
          <div className="flex items-center gap-2">
            {tier4Count > 0 && (
              <span className="text-red-400 bg-red-500/10 border border-red-500/30 px-3 py-1 rounded-full text-[9px] font-black shadow-inner flex items-center gap-1.5">
                {tier4Count} {t("stat_tier4")}
              </span>
            )}
            {tier3Count > 0 && (
              <span className="text-amber-400 bg-amber-500/10 border border-amber-500/30 px-3 py-1 rounded-full text-[9px] font-black shadow-inner flex items-center gap-1.5">
                {tier3Count} {t("stat_tier3")}
              </span>
            )}
            {activeConflicts.length === 0 && (
              <span className="text-[var(--subtext)] opacity-50 px-3 py-1 text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5">
                {t("bp_no_conflicts_detected")}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 pb-24">
          {activeConflicts.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center opacity-50 space-y-4 py-12">
              <span className="material-symbols-outlined !text-6xl theme-text-success drop-shadow-sm">
                {t("icon_security")}
              </span>
              <p className="text-[10px] font-black tracking-widest uppercase text-center">
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
                ? "border-red-500/30"
                : "border-amber-500/30";
              const bgClass = isTier4
                ? "bg-red-500/5 hover:bg-red-500/10"
                : "bg-amber-500/5 hover:bg-amber-500/10";
              const shadowClass = isTier4
                ? "hover:shadow-[0_0_30px_rgba(239,68,68,0.2)]"
                : "hover:shadow-[0_0_30px_rgba(245,158,11,0.2)]";
              const textClass = isTier4 ? "text-red-500" : "text-amber-500";
              const iconName = isTier4
                ? t("icon_crisis_alert")
                : t("icon_tune");

              return (
                <div
                  key={ac.pairId}
                  className={`w-full rounded-[var(--radius)] border transition-all duration-500 relative overflow-hidden group/alert shrink-0 ${isIgnored
                    ? "opacity-50 grayscale border-white/5 bg-black/20"
                    : `${borderClass} ${bgClass} shadow-lg ${shadowClass}`
                    }`}
                >

                  <div className="relative p-6 z-10 flex flex-col gap-5 w-full">
                    <div className="flex justify-between items-start w-full">
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-12 h-12 rounded-[1.25rem] flex items-center justify-center shrink-0 border transition-all duration-500 shadow-inner ${isIgnored
                            ? "border-white/10 bg-black/50"
                            : `${isTier4 ? "border-red-500/50 bg-red-500/10 shadow-[0_0_20px_rgba(239,68,68,0.2)]" : "border-amber-500/50 bg-amber-500/10 shadow-[0_0_20px_rgba(245,158,11,0.2)]"}`
                            }`}
                        >
                          <span
                            className={`material-symbols-outlined !text-[24px] ${isIgnored ? "text-[var(--text)] opacity-30" : textClass}`}
                          >
                            {iconName}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span
                            className={`text-xs font-black uppercase tracking-widest ${textClass}`}
                          >
                            {isTier4
                              ? t("fatal_conflict")
                              : t("tier3_conflict")}
                          </span>
                          <span className="text-[9px] font-mono text-[var(--subtext)] opacity-60 uppercase tracking-widest mt-1">
                            {ac.conflict.resolution_note ||
                              "Local Scan Detects Tuning Overlap"}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          const newSet = new Set(ignoredConflicts);
                          if (isIgnored) newSet.delete(ac.pairId);
                          else newSet.add(ac.pairId);
                          setIgnoredConflicts(newSet);
                        }}
                        className="text-[9px] font-black bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] px-4 py-1.5 rounded-full uppercase transition-all active:scale-95 shrink-0 ml-4 flex items-center gap-2"
                      >
                        <span className="material-symbols-outlined !text-[12px]">
                          {isIgnored ? "visibility" : "visibility_off"}
                        </span>
                        {isIgnored
                          ? t("bp_restore_alert")
                          : t("bp_ignore_alert")}
                      </button>
                    </div>

                    <div
                      className={`flex flex-col gap-3 w-full mt-2 ${isIgnored ? "opacity-30" : ""}`}
                    >
                      <div
                        className={`flex-1 flex flex-col p-4 rounded-[1.25rem] border transition-all shadow-inner relative overflow-hidden group/card hover:border-white/20 ${isWinnerA && !isTier4 ? "border-[var(--success)]/50 bg-[var(--success)]/10 shadow-[0_0_15px_rgba(var(--success-rgb),0.1)]" : "bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border-[color-mix(in_srgb,var(--text)_10%,transparent)]"}`}
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity" />

                        <div className="flex flex-col gap-1.5 relative z-10 w-full mb-3">
                          <span
                            className={`text-[11px] font-black uppercase leading-tight ${isWinnerA && !isTier4 ? "text-[var(--success)]" : "text-[var(--text)]"}`}
                          >
                            {formatDisplayName(ac.modA.name)}
                          </span>
                          <span className="text-[9px] font-mono text-cyan-400 tracking-widest opacity-80 bg-cyan-400/10 px-2 py-0.5 rounded-md border border-cyan-400/20 w-fit">
                            {ac.modA.version || "v.Local"}
                          </span>
                        </div>

                        <div className="relative z-10 flex items-center gap-2 w-full mt-auto">
                          {ac.conflict.severity_rank === 4 ? (
                            allow_write &&
                            toggleInActiveSet && (
                              <button
                                onClick={() =>
                                  toggleInActiveSet(
                                    ac.modA._originalSetName || ac.modA.name,
                                    true,
                                    true,
                                  )
                                }
                                className="w-full py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 hover:border-red-500 hover:bg-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
                              >
                                <span className="material-symbols-outlined !text-[14px]">
                                  {t("icon_delete")}
                                </span>
                                {t("bp_yeet_artifact")}
                              </button>
                            )
                          ) : ac.conflict.severity_rank === 3 ? (
                            isWinnerA ? (
                              <div className="w-full py-2.5 rounded-xl bg-[var(--success)]/20 border border-[var(--success)]/50 text-[var(--success)] text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(var(--success-rgb),0.3)]">
                                <span className="material-symbols-outlined !text-[14px]">
                                  {t("icon_star")}
                                </span>
                                {t("bp_winning_artifact")}
                              </div>
                            ) : isWinnerB ? (
                              <div className="w-full py-2.5 rounded-xl bg-white/5 border border-white/10 text-[var(--subtext)] opacity-60 text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
                                <span className="material-symbols-outlined !text-[12px]">
                                  {t("icon_block")}
                                </span>
                                {t("bp_overridden_by_winner")}
                              </div>
                            ) : (
                              allow_write &&
                              setBlueprintLoadOrder && (
                                <button
                                  onClick={() =>
                                    setBlueprintLoadOrder([
                                      {
                                        name:
                                          ac.modA._originalSetName ||
                                          ac.modA.name,
                                        prefix: "Sanctuary",
                                      },
                                      {
                                        name:
                                          ac.modB._originalSetName ||
                                          ac.modB.name,
                                        prefix: "",
                                      },
                                    ])
                                  }
                                  className="w-full py-2.5 rounded-xl bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border border-[color-mix(in_srgb,var(--success)_20%,transparent)] text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] hover:border-[var(--success)] text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
                                >
                                  <span className="material-symbols-outlined !text-[14px]">
                                    {t("icon_check_circle")}
                                  </span>
                                  {t("bp_select_winning_artifact")}
                                </button>
                              )
                            )
                          ) : (
                            <div className="w-full flex gap-2">
                              <div className="flex-1">
                                {getPriorityDrop(ac.modA)}
                              </div>
                              {allow_write && toggleInActiveSet && (
                                <button
                                  onClick={() =>
                                    toggleInActiveSet(
                                      ac.modA._originalSetName || ac.modA.name,
                                      true,
                                      true,
                                    )
                                  }
                                  className="w-10 h-10 shrink-0 rounded-xl bg-red-500/10 border border-red-500/30 hover:border-red-500 hover:bg-red-500/20 text-red-400 transition-all active:scale-95 flex items-center justify-center"
                                  title={
                                    t("bp_yeet_artifact")
                                  }
                                >
                                  <span className="material-symbols-outlined !text-[16px]">
                                    {t("icon_delete")}
                                  </span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div
                        className={`flex-1 flex flex-col p-4 rounded-[1.25rem] border transition-all shadow-inner relative overflow-hidden group/card hover:border-white/20 ${isWinnerB && !isTier4 ? "border-[var(--success)]/50 bg-[var(--success)]/10 shadow-[0_0_15px_rgba(var(--success-rgb),0.1)]" : "bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border-[color-mix(in_srgb,var(--text)_10%,transparent)]"}`}
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity" />

                        <div className="flex flex-col gap-1.5 relative z-10 w-full mb-3">
                          <span
                            className={`text-[11px] font-black uppercase leading-tight ${isWinnerB && !isTier4 ? "text-[var(--success)]" : "text-[var(--text)]"}`}
                          >
                            {formatDisplayName(ac.modB.name)}
                          </span>
                          <span className="text-[9px] font-mono text-cyan-400 tracking-widest opacity-80 bg-cyan-400/10 px-2 py-0.5 rounded-md border border-cyan-400/20 w-fit">
                            {ac.modB.version || "v.Local"}
                          </span>
                        </div>

                        <div className="relative z-10 flex items-center gap-2 w-full mt-auto">
                          {ac.conflict.severity_rank === 4 ? (
                            allow_write &&
                            toggleInActiveSet && (
                              <button
                                onClick={() =>
                                  toggleInActiveSet(
                                    ac.modB._originalSetName || ac.modB.name,
                                    true,
                                    true,
                                  )
                                }
                                className="w-full py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 hover:border-red-500 hover:bg-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
                              >
                                <span className="material-symbols-outlined !text-[14px]">
                                  {t("icon_delete")}
                                </span>
                                {t("bp_yeet_artifact")}
                              </button>
                            )
                          ) : ac.conflict.severity_rank === 3 ? (
                            isWinnerB ? (
                              <div className="w-full py-2.5 rounded-xl bg-[var(--success)]/20 border border-[var(--success)]/50 text-[var(--success)] text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(var(--success-rgb),0.3)]">
                                <span className="material-symbols-outlined !text-[14px]">
                                  {t("icon_star")}
                                </span>
                                {t("bp_winning_artifact")}
                              </div>
                            ) : isWinnerA ? (
                              <div className="w-full py-2.5 rounded-xl bg-white/5 border border-white/10 text-[var(--subtext)] opacity-60 text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
                                <span className="material-symbols-outlined !text-[12px]">
                                  {t("icon_block")}
                                </span>
                                {t("bp_overridden_by_winner")}
                              </div>
                            ) : (
                              allow_write &&
                              setBlueprintLoadOrder && (
                                <button
                                  onClick={() =>
                                    setBlueprintLoadOrder([
                                      {
                                        name:
                                          ac.modB._originalSetName ||
                                          ac.modB.name,
                                        prefix: "Sanctuary",
                                      },
                                      {
                                        name:
                                          ac.modA._originalSetName ||
                                          ac.modA.name,
                                        prefix: "",
                                      },
                                    ])
                                  }
                                  className="w-full py-2.5 rounded-xl bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border border-[color-mix(in_srgb,var(--success)_20%,transparent)] text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] hover:border-[var(--success)] text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
                                >
                                  <span className="material-symbols-outlined !text-[14px]">
                                    {t("icon_check_circle")}
                                  </span>
                                  {t("bp_select_winning_artifact")}
                                </button>
                              )
                            )
                          ) : (
                            <div className="w-full flex gap-2">
                              <div className="flex-1">
                                {getPriorityDrop(ac.modB)}
                              </div>
                              {allow_write && toggleInActiveSet && (
                                <button
                                  onClick={() =>
                                    toggleInActiveSet(
                                      ac.modB._originalSetName || ac.modB.name,
                                      true,
                                      true,
                                    )
                                  }
                                  className="w-10 h-10 shrink-0 rounded-xl bg-red-500/10 border border-red-500/30 hover:border-red-500 hover:bg-red-500/20 text-red-400 transition-all active:scale-95 flex items-center justify-center"
                                  title={
                                    t("bp_yeet_artifact")
                                  }
                                >
                                  <span className="material-symbols-outlined !text-[16px]">
                                    {t("icon_delete")}
                                  </span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </SidePanel>
  );
}
