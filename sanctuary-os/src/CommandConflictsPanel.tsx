import React, { useMemo, useState } from "react";
import { SidePanel, formatDisplayName, CustomDropdown } from "./shared";
import { useLexicon } from "./LexiconContext";
import { tauriBridge } from "./lib/tauri-bridge";

interface CommandConflictsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeMods: any[];
  allow_write: boolean;
  vaultPath: string;
  onRefreshMods: () => void;
  toggleInActiveSet: (targetName: string, excludeBroken?: boolean, forceRemove?: boolean) => void;
  setBlueprintLoadOrder: (updates: string | {name: string, prefix: string}[], prefix?: string) => void;
}

export default function CommandConflictsPanel({
  isOpen, onClose, activeMods, allow_write, vaultPath, onRefreshMods, toggleInActiveSet, setBlueprintLoadOrder
}: CommandConflictsPanelProps) {
  const { t } = useLexicon();
  const [ignoredConflicts, setIgnoredConflicts] = useState<Set<string>>(new Set());

  const activeConflicts = useMemo(() => {
    const conflicts: any[] = [];
    activeMods.forEach((mod: any) => {
      if (mod.conflicts && Array.isArray(mod.conflicts)) {
        mod.conflicts.forEach((c: any) => {
          const enemyActive = activeMods.find((em: any) => {
            if (em.isFallback) return false;
            if (c.enemy_id && String(em.dbId) === String(c.enemy_id)) return true;
            if (c.enemy_name) {
               const targetClean = String(c.enemy_name).toUpperCase();
               const cleanN = String(em.name || '').toUpperCase();
               const cleanDisp = String(em.displayName || '').toUpperCase();
               if (cleanN.includes(targetClean) || cleanDisp.includes(targetClean)) return true;
            }
            return false;
          });

          if (enemyActive && mod.name && enemyActive.name && mod.name !== enemyActive.name) {
            const pairId = [mod.name, enemyActive.name].sort().join("::");
            if (!conflicts.find((ac: any) => ac.pairId === pairId)) {
              conflicts.push({ pairId, modA: mod, modB: enemyActive, conflict: c });
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
             const cleanN = String(em.name || '').toUpperCase();
             const cleanDisp = String(em.displayName || '').toUpperCase();
             const targetClean = String(lc.modA).toUpperCase();
             return cleanN.includes(targetClean) || cleanDisp.includes(targetClean) || targetClean.includes(cleanN);
          });
          const modBMatch = activeMods.find((em: any) => {
             if (em.isFallback) return false;
             const cleanN = String(em.name || '').toUpperCase();
             const cleanDisp = String(em.displayName || '').toUpperCase();
             const targetClean = String(lc.modB).toUpperCase();
             return cleanN.includes(targetClean) || cleanDisp.includes(targetClean) || targetClean.includes(cleanN);
          });

          if (modAMatch && modBMatch && modAMatch.name !== modBMatch.name) {
            const pairId = [modAMatch.name, modBMatch.name].sort().join("::");
            if (!conflicts.find((ac: any) => ac.pairId === pairId)) {
              conflicts.push({ pairId, modA: modAMatch, modB: modBMatch, conflict: { severity_rank: lc.severity_rank, resolution_note: lc.resolution_note || "Local Scan Detects Tuning Overlap" } });
            }
          }
        });
      }
    } catch(e) {}

    return conflicts.filter((ac: any) => {
      if (ac.conflict.severity_rank !== 3) return true;
      const prefixA = (ac.modA._originalSetName || ac.modA.name)?.split(/[/\\]/).slice(0, -1).join('/') || "";
      const prefixB = (ac.modB._originalSetName || ac.modB.name)?.split(/[/\\]/).slice(0, -1).join('/') || "";
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
        <CustomDropdown disableTint={true}
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
            { id: "", label: t("bp_priority_default") || "Default Priority" },
            { id: "!Sanctuary", label: t("bp_priority_sanctuary") || "High Priority (!Sanctuary)" },
            { id: "!Sanctuary2", label: t("bp_priority_sanctuary2") || "Highest Priority (!Sanctuary2)" },
            { id: "!Sanctuary3", label: t("bp_priority_sanctuary3") || "Absolute Priority (!Sanctuary3)" }
          ]}
        />
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("dashboard_stat_conflicts") || "CONFLICTS"}
      subtitle={t("bp_load_order_conflicts") || "Load Order Conflicts"}
      icon={t("ui_icon_crisis") || "crisis_alert"}
      iconColorClass="text-amber-500"
      widthClass="w-[500px]"
    >
      <div className="flex-1 min-h-0 flex flex-col gap-6 w-full">
        <div className="p-8 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 flex items-center justify-between theme-glass-panel rounded-3xl mt-2 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 to-transparent pointer-events-none" />
          <h3 className="text-xs font-black text-[var(--subtext)] uppercase tracking-widest relative z-10">{t("bp_load_order_conflicts") || "Load Order Conflicts"}</h3>
          <span className="text-amber-400 bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] border border-amber-500/30 px-4 py-1.5 rounded-full text-[10px] font-black shadow-inner flex items-center gap-2 relative z-10">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            {t("bp_conflicts_detected")?.replace("{0}", String(activeConflicts.length)) || `${activeConflicts.length} Conflicts`}
          </span>
        </div>
        
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col gap-6">
          {activeConflicts.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center opacity-50 space-y-4 py-12">
              <span className="material-symbols-outlined !text-6xl theme-text-success drop-shadow-sm">{t("ui_icon_shield") || "shield"}</span>
              <p className="text-[10px] font-black tracking-widest uppercase text-center">{t("bp_no_conflicts_detected") || "No Conflicts Detected"}</p>
            </div>
          ) : (
            activeConflicts.map((ac) => {
              const isIgnored = ignoredConflicts.has(ac.pairId);
              const isTier4 = ac.conflict.severity_rank === 4;
              
              const prefixA = (ac.modA._originalSetName || ac.modA.name)?.split(/[/\\]/).slice(0, -1).join('/') || "";
              const prefixB = (ac.modB._originalSetName || ac.modB.name)?.split(/[/\\]/).slice(0, -1).join('/') || "";
              const isWinnerA = prefixA.toLowerCase() === "sanctuary";
              const isWinnerB = prefixB.toLowerCase() === "sanctuary";
              
              const borderClass = isTier4 ? "border-red-500/30" : "border-amber-500/30";
              const bgClass = isTier4 ? "bg-red-500/5 hover:bg-red-500/10" : "bg-amber-500/5 hover:bg-amber-500/10";
              const shadowClass = isTier4 ? "hover:shadow-[0_0_30px_rgba(239,68,68,0.2)]" : "hover:shadow-[0_0_30px_rgba(245,158,11,0.2)]";
              const textClass = isTier4 ? "text-red-500" : "text-amber-500";
              const iconName = isTier4 ? (t("ui_icon_crisis") || "crisis_alert") : (t("ui_icon_tune") || "tune");

              return (
                <div 
                  key={ac.pairId} 
                  className={`relative group shrink-0 w-full rounded-[2rem] overflow-hidden transition-all duration-500 border ${
                    isIgnored 
                      ? 'opacity-50 grayscale border-white/5 bg-black/40' 
                      : `${borderClass} ${bgClass} shadow-lg ${shadowClass}`
                  }`}
                >
                  <div className="relative p-5 z-10 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`material-symbols-outlined !text-2xl ${textClass}`}>{iconName}</span>
                        <span className={`text-[10px] font-black uppercase tracking-widest ${textClass}`}>
                          {isTier4 ? (t("bp_fatal_override_clash") || "FATAL CLASH") : (t("bp_data_override_conflict") || "OVERRIDE CONFLICT")}
                        </span>
                      </div>
                      <button 
                        onClick={() => {
                          const newSet = new Set(ignoredConflicts);
                          if (isIgnored) newSet.delete(ac.pairId);
                          else newSet.add(ac.pairId);
                          setIgnoredConflicts(newSet);
                        }}
                        className={`text-[9px] font-black px-4 py-1.5 rounded-full uppercase transition-all active:scale-95 flex items-center gap-2 ${
                          isIgnored 
                            ? 'bg-white/10 text-white hover:bg-white/20' 
                            : 'bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_15%,transparent)]'
                        }`}
                      >
                        <span className="material-symbols-outlined !text-[14px]">{isIgnored ? "visibility" : "visibility_off"}</span>
                        {isIgnored ? (t("bp_restore_alert") || "RESTORE") : (t("bp_ignore_alert") || "IGNORE")}
                      </button>
                    </div>
                    
                    <div className={`grid grid-cols-2 gap-4 ${isIgnored ? 'opacity-30' : ''}`}>
                      {/* Mod A */}
                      <div className={`theme-glass-inner rounded-2xl p-4 border border-white/5 flex flex-col transition-all shadow-inner relative overflow-hidden group/card hover:border-white/10 ${isWinnerA && !isTier4 ? 'ring-2 ring-[var(--success)]/50 bg-[var(--success)]/5' : ''}`}>
                        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity" />
                        <div className="relative z-10 flex flex-col">
                          <span className="text-xs font-black text-[var(--text)] uppercase break-words mb-1">
                            {formatDisplayName(ac.modA.name)}
                          </span>
                          <span className="text-[10px] font-mono text-cyan-400 mb-1 tracking-widest opacity-80">{ac.modA.version || "v.Local"}</span>
                          <div className="mt-1">
                            {ac.conflict.severity_rank === 4 ? (
                              allow_write && toggleInActiveSet && (
                                <button 
                                  onClick={() => toggleInActiveSet(ac.modA._originalSetName || ac.modA.name, true, true)}
                                  className="mt-2 w-full py-2 rounded-xl bg-red-500/10 border border-red-500/30 hover:border-red-500 hover:bg-red-500/20 text-red-400 text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
                                >
                                  <span className="material-symbols-outlined !text-sm">{t("ui_icon_delete") || "delete"}</span>
                                  {t("bp_yeet_artifact") || "YEET ARTIFACT"}
                                </button>
                              )
                            ) : ac.conflict.severity_rank === 3 ? (
                              isWinnerA ? (
                                  <div className="mt-2 w-full py-2 rounded-xl bg-[var(--success)]/20 border border-[var(--success)]/50 text-[var(--success)] text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(var(--success-rgb),0.3)]">
                                    <span className="material-symbols-outlined !text-sm">{t("ui_icon_star") || "star"}</span>
                                    {t("bp_winning_artifact")}
                                  </div>
                                ) : isWinnerB ? (
                                  <div className="mt-2 w-full py-2 rounded-xl bg-white/5 border border-white/10 text-white/40 text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
                                    <span className="material-symbols-outlined !text-sm">block</span>
                                    {t("bp_overridden_by_winner")}
                                  </div>
                                ) : (
                                  allow_write && setBlueprintLoadOrder && (
                                    <button 
                                      onClick={() => setBlueprintLoadOrder([
                                        { name: ac.modA._originalSetName || ac.modA.name, prefix: "Sanctuary" },
                                        { name: ac.modB._originalSetName || ac.modB.name, prefix: "" }
                                      ])}
                                      className="mt-2 w-full py-2 rounded-xl bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_25%,transparent)] hover:border-[var(--success)] text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
                                    >
                                      <span className="material-symbols-outlined !text-sm">{t("ui_icon_check_circle") || "check_circle"}</span>
                                      {t("bp_select_winning_artifact")}
                                    </button>
                                  )
                                )
                            ) : (
                              <>
                                {getPriorityDrop(ac.modA)}
                                {allow_write && toggleInActiveSet && (
                                  <button 
                                    onClick={() => toggleInActiveSet(ac.modA._originalSetName || ac.modA.name, true, true)}
                                    className="mt-2 w-full py-2 rounded-xl bg-red-500/10 border border-red-500/30 hover:border-red-500 hover:bg-red-500/20 text-red-400 text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
                                  >
                                    <span className="material-symbols-outlined !text-sm">{t("ui_icon_delete") || "delete"}</span>
                                    {t("bp_yeet_artifact") || "YEET ARTIFACT"}
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {/* Mod B */}
                      <div className={`theme-glass-inner rounded-2xl p-4 border border-white/5 flex flex-col transition-all shadow-inner relative overflow-hidden group/card hover:border-white/10 ${isWinnerB && !isTier4 ? 'ring-2 ring-[var(--success)]/50 bg-[var(--success)]/5' : ''}`}>
                        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity" />
                        <div className="relative z-10 flex flex-col">
                          <span className="text-xs font-black text-[var(--text)] uppercase break-words mb-1">
                            {formatDisplayName(ac.modB.name)}
                          </span>
                          <span className="text-[10px] font-mono text-cyan-400 mb-1 tracking-widest opacity-80">{ac.modB.version || "v.Local"}</span>
                          <div className="mt-1">
                            {ac.conflict.severity_rank === 4 ? (
                              allow_write && toggleInActiveSet && (
                                <button 
                                  onClick={() => toggleInActiveSet(ac.modB._originalSetName || ac.modB.name, true, true)}
                                  className="mt-2 w-full py-2 rounded-xl bg-red-500/10 border border-red-500/30 hover:border-red-500 hover:bg-red-500/20 text-red-400 text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
                                >
                                  <span className="material-symbols-outlined !text-sm">{t("ui_icon_delete") || "delete"}</span>
                                  {t("bp_yeet_artifact") || "YEET ARTIFACT"}
                                </button>
                              )
                            ) : ac.conflict.severity_rank === 3 ? (
                              isWinnerB ? (
                                  <div className="mt-2 w-full py-2 rounded-xl bg-[var(--success)]/20 border border-[var(--success)]/50 text-[var(--success)] text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(var(--success-rgb),0.3)]">
                                    <span className="material-symbols-outlined !text-sm">{t("ui_icon_star") || "star"}</span>
                                    {t("bp_winning_artifact")}
                                  </div>
                                ) : isWinnerA ? (
                                  <div className="mt-2 w-full py-2 rounded-xl bg-white/5 border border-white/10 text-white/40 text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
                                    <span className="material-symbols-outlined !text-sm">block</span>
                                    {t("bp_overridden_by_winner")}
                                  </div>
                                ) : (
                                  allow_write && setBlueprintLoadOrder && (
                                    <button 
                                      onClick={() => setBlueprintLoadOrder([
                                        { name: ac.modB._originalSetName || ac.modB.name, prefix: "Sanctuary" },
                                        { name: ac.modA._originalSetName || ac.modA.name, prefix: "" }
                                      ])}
                                      className="mt-2 w-full py-2 rounded-xl bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_25%,transparent)] hover:border-[var(--success)] text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
                                    >
                                      <span className="material-symbols-outlined !text-sm">{t("ui_icon_check_circle") || "check_circle"}</span>
                                      {t("bp_select_winning_artifact")}
                                    </button>
                                  )
                                )
                            ) : (
                              <>
                                {getPriorityDrop(ac.modB)}
                                {allow_write && toggleInActiveSet && (
                                  <button 
                                    onClick={() => toggleInActiveSet(ac.modB._originalSetName || ac.modB.name, true, true)}
                                    className="mt-2 w-full py-2 rounded-xl bg-red-500/10 border border-red-500/30 hover:border-red-500 hover:bg-red-500/20 text-red-400 text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
                                  >
                                    <span className="material-symbols-outlined !text-sm">{t("ui_icon_delete") || "delete"}</span>
                                    {t("bp_yeet_artifact") || "YEET ARTIFACT"}
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {ac.conflict.resolution_note && (
                      <div className="p-4 theme-glass-inner rounded-xl border-l-2 border-l-amber-500 text-xs font-bold text-amber-500/80">
                        " {ac.conflict.resolution_note} "
                      </div>
                    )}
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

