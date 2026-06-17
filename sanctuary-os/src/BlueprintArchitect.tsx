import { useState, useMemo } from "react";
import { formatDisplayName, ViewHeader, CustomDropdown, mapDlcCode, isVersionMatch, SidePanel, standardButtonClass, standardAccentGlassButtonClass, standardDangerButtonClass } from "./shared";
import { useStore } from "./store";
import { useLexicon } from "./LexiconContext";
import { tauriBridge } from "./lib/tauri-bridge";


export default function BlueprintArchitect({ isOpen, onClose, playSet, modList, toggleInActiveSet, allow_write, vaultPath, onRefreshMods, renamePlaySet }: any) {
  const { t } = useLexicon();
  const { ownedDLC, maskedDLC, selectedVersion, playSets, activePlaySetIndex, setPlaySets } = useStore();
  const [ignoredConflicts, setIgnoredConflicts] = useState<Set<string>>(new Set());
  const [ignoredBroken, setIgnoredBroken] = useState<Set<string>>(new Set());

  const [isEditingName, setIsEditingName] = useState(false);
  const [newNameInput, setNewNameInput] = useState("");

  const activeMods = useMemo(() => {
    const safeMods = Array.isArray(playSet?.mods) ? playSet.mods : [];
    const safeList = Array.isArray(modList) ? modList : [];
    return safeMods.map((modName: string) => {
      const exactMatch = safeList.find((m: any) => m.name === modName);
      if (exactMatch) return { ...exactMatch, _originalSetName: modName };
      
      const fallbackMatch = safeList.find((m: any) => {
        const mBase = m.name?.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, '');
        const targetBase = typeof modName === 'string' ? modName.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, '') : '';
        const mExt = m.name?.split('.').pop()?.toLowerCase();
        const targetExt = typeof modName === 'string' ? modName.split('.').pop()?.toLowerCase() : '';
        return mBase && targetBase && mBase === targetBase && mExt === targetExt;
      });
      if (fallbackMatch) return { ...fallbackMatch, _originalSetName: modName };
      
      return { name: modName, isFallback: true, _originalSetName: modName };
    });
  }, [playSet?.mods, modList]);

  const renderSubtitle = () => {
    if (isEditingName) {
      return (
        <span className="flex items-center gap-2">
          {t("bp_subtitle")}
          <input
            autoFocus
            type="text"
            className="bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded px-3 py-1 outline-none text-[var(--text)] font-black uppercase text-[10px] w-64"
            value={newNameInput}
            onChange={(e) => setNewNameInput(e.target.value)}
            onKeyDown={(e) => {
               if (e.key === 'Enter') {
                 if (renamePlaySet) renamePlaySet(playSet.name, newNameInput);
                 setIsEditingName(false);
               } else if (e.key === 'Escape') {
                 setIsEditingName(false);
               }
            }}
            onBlur={() => {
              if (renamePlaySet && newNameInput.trim() !== "" && newNameInput !== playSet.name) {
                renamePlaySet(playSet.name, newNameInput);
              }
              setIsEditingName(false);
            }}
          />
        </span>
      );
    }
    return (
      <span 
        className="flex items-center gap-2 group cursor-pointer hover:text-[var(--text)] transition-colors" 
        onClick={() => { setIsEditingName(true); setNewNameInput(playSet.name); }}
      >
        {t("bp_subtitle")} {playSet.name} ({activeMods.length} {t("modcard_artifacts")})
        <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[14px] ml-1">{t("ui_icon_edit") || "✎"}</span>
      </span>
    );
  };

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
            if (!conflicts.find(ac => ac.pairId === pairId)) {
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

  const brokenMods = useMemo(() => {
    return activeMods.map((mod: any) => {
      if (mod.isFallback) return null;

      let reason = null;

      if ((typeof mod.status === 'string' && mod.status.toLowerCase() === 'broken') || mod.compliance_tier === 3 || mod.compliance_tier === 4) {
        reason = t("bp_status_broken_noncompliant") || "BROKEN / NON-COMPLIANT";
      } else {
        if (mod.compatible_versions && selectedVersion && !isVersionMatch(mod.compatible_versions, selectedVersion)) {
           reason = t("bp_status_version_mismatch");
        } else if (mod.requiredDLC) {
           let rawDLC: string[] = [];
           if (typeof mod.requiredDLC === 'string') {
             rawDLC = mod.requiredDLC.split(',').map((s: string) => s.trim());
           } else if (Array.isArray(mod.requiredDLC)) {
             rawDLC = [...mod.requiredDLC];
           }
           const activeDLC = ownedDLC.filter((d: string) => !maskedDLC.includes(d));
           const missing = rawDLC.filter(req => {
               const cleanReq = req.toUpperCase().trim();
               if (cleanReq === 'BASE') return false;
               return !activeDLC.some((owned: string) => owned.toUpperCase() === cleanReq);
           });
           if (missing.length > 0) {
              const missingNames = missing.map(m => mapDlcCode(m)).join(", ");
              reason = `${t("bp_status_missing_dlc")}${missingNames}`;
           }
        }
        
        if (!reason && mod.dependencies) {
           let rawDeps: string[] = [];
           if (typeof mod.dependencies === 'string') {
             rawDeps = mod.dependencies.split(',').map((s: string) => s.trim());
           } else if (Array.isArray(mod.dependencies)) {
             rawDeps = [...mod.dependencies];
           }
           if (rawDeps.length > 0) {
              const activeModNames = activeMods.map((m: any) => (m._originalSetName || m.name)?.toLowerCase());
              const missing = rawDeps.filter((req: string) => !activeModNames.includes(req.toLowerCase()));
              if (missing.length > 0) {
                 reason = `${t("vault_missing_deps") || "MISSING DEPENDENCIES"}: ${missing.join(", ")}`;
              }
           }
        }
      }

      if (reason) {
        return { ...mod, _alert_reason: reason };
      }
      return null;
    }).filter(Boolean);
  }, [activeMods, selectedVersion, ownedDLC, maskedDLC, t]);

  const setBlueprintLoadOrder = (updates: string | {name: string, prefix: string}[], prefix?: string) => {
    try {
      setPlaySets((prevSets: any) => {
        if (!prevSets) return prevSets;
        const currentSet = prevSets[activePlaySetIndex];
        if (!currentSet) return prevSets;
        const newMods = [...currentSet.mods];
        
        const updateList = Array.isArray(updates) ? updates : [{ name: updates, prefix: prefix || "" }];

        updateList.forEach(update => {
          if (!update || !update.name) return;
          const nameStr = String(update.name);
          const baseName = nameStr.split(/[/\\]/).pop() || nameStr;
          
          let found = false;
          for (let i = 0; i < newMods.length; i++) {
             const mLow = String(newMods[i]).toLowerCase();
             const bLow = baseName.toLowerCase();
             const tLow = nameStr.toLowerCase();
             if (mLow === bLow || mLow === tLow || mLow.endsWith(`/${bLow}`) || mLow.endsWith(`\\${bLow}`)) {
               newMods[i] = update.prefix ? `${update.prefix}/${baseName}` : baseName;
               found = true;
             }
          }
          if (!found) {
             newMods.push(update.prefix ? `${update.prefix}/${baseName}` : baseName);
          }
        });
        
        const newSets = [...prevSets];
        newSets[activePlaySetIndex] = { ...currentSet, mods: newMods };
        localStorage.setItem("sanctuary_playsets", JSON.stringify(newSets));
        window.dispatchEvent(new Event("storage"));
        return newSets;
      });
    } catch(e) {
      console.error("setBlueprintLoadOrder error:", e);
    }
  };

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
      <div className="w-full mt-3">
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
            { id: "", label: t("bp_priority_default") },
            { id: "!Sanctuary", label: t("bp_priority_sanctuary") },
            { id: "!Sanctuary2", label: t("bp_priority_sanctuary2") },
            { id: "!Sanctuary3", label: t("bp_priority_sanctuary3") }
          ]}
        />
      </div>
    );
  };

  if (!playSet) return null;

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("bp_title")}
      subtitle={renderSubtitle()}
      icon={t("ui_icon_warning") || "warning"}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[950px]"
      noScroll={true}
      noPadding={true}
      footer={
        <div className="flex justify-end gap-4 w-full">
          <button onClick={onClose} className={standardButtonClass}>
            {t("shared_cancel") || "Cancel"}
          </button>
          <button onClick={onClose} className={standardAccentGlassButtonClass}>
            <span className="material-symbols-outlined !text-[14px]">{allow_write ? "done_all" : "logout"}</span>
            {allow_write ? t("bp_btn_finalize") : t("bp_btn_exit_preview")}
          </button>
        </div>
      }
    >
      <div className="flex-1 min-h-0 flex gap-8 p-8 pb-12 w-full">
        {/* LEFT SIDE: LOAD ORDER CONFLICTS */}
        <div className="flex-1 flex flex-col relative group rounded-[3rem] overflow-hidden transition-all duration-500 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-2xl bg-[color-mix(in_srgb,var(--bg)_30%,transparent)] min-h-0">
          <div className="absolute inset-0 theme-glass-panel opacity-100" />
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500 via-transparent to-transparent opacity-5" />
          
          <div className="relative z-10 flex flex-col flex-1 min-h-0">
            {(() => {
              const tier4Count = activeConflicts.filter(c => c.conflict.severity_rank === 4).length;
              const tier3Count = activeConflicts.length - tier4Count;
              return (
                <div className="px-8 py-6 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 flex items-center justify-between">
                  <h3 className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-[0.2em] opacity-80">
                    {t("bp_load_order_conflicts")}
                  </h3>
                  <div className="flex items-center gap-2">
                    {tier4Count > 0 && (
                      <span className="text-red-400 bg-red-500/10 border border-red-500/30 px-3 py-1 rounded-full text-[9px] font-black shadow-inner flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                        {tier4Count} {t("panel_stat_tier4") || "FATAL"}
                      </span>
                    )}
                    {tier3Count > 0 && (
                      <span className="text-amber-400 bg-amber-500/10 border border-amber-500/30 px-3 py-1 rounded-full text-[9px] font-black shadow-inner flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        {tier3Count} {t("panel_stat_tier3") || "OVERRIDE"}
                      </span>
                    )}
                    {activeConflicts.length === 0 && (
                      <span className="text-[var(--subtext)] opacity-50 px-3 py-1 text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-50" />
                        {t("bp_no_conflicts_detected") || "0 Detected"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}
            
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-8 flex flex-col gap-6">
              {activeConflicts.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center opacity-50 space-y-4">
                  <span className="material-symbols-outlined !text-6xl theme-text-success drop-shadow-sm">{t("ui_icon_shield") || "shield"}</span>
                  <p className="text-[10px] font-black tracking-widest uppercase text-center">{t("bp_no_conflicts_detected")}</p>
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
                      className={`theme-glass-panel rounded-[2rem] border transition-all duration-500 relative overflow-hidden group/alert shrink-0 ${
                        isIgnored 
                          ? 'opacity-50 grayscale border-white/5 bg-black/40' 
                          : `${borderClass} ${bgClass} shadow-lg ${shadowClass}`
                      }`}
                    >
                      <div className={`absolute inset-0 transition-opacity duration-500 ${isIgnored ? 'opacity-0' : `bg-gradient-to-br ${isTier4 ? 'from-red-500/10' : 'from-amber-500/10'} to-transparent opacity-100`}`} />
                      
                      <div className="relative p-6 z-10 flex flex-col gap-5 w-full">
                        {/* HEADER */}
                        <div className="flex justify-between items-start w-full">
                          <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-[1.25rem] flex items-center justify-center shrink-0 border transition-all duration-500 shadow-inner ${
                              isIgnored ? 'border-white/10 bg-black/50' : `${isTier4 ? 'border-red-500/50 bg-red-500/10 shadow-[0_0_20px_rgba(239,68,68,0.2)]' : 'border-amber-500/50 bg-amber-500/10 shadow-[0_0_20px_rgba(245,158,11,0.2)]'}`
                            }`}>
                              <span className={`material-symbols-outlined !text-[24px] ${isIgnored ? 'text-[var(--text)] opacity-30' : textClass}`}>{iconName}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className={`text-xs font-black uppercase tracking-widest ${textClass}`}>
                                {isTier4 ? t("bp_fatal_override_clash") : t("bp_data_override_conflict")}
                              </span>
                              <span className="text-[9px] font-mono text-[var(--subtext)] opacity-60 uppercase tracking-widest mt-1">
                                {ac.conflict.resolution_note || "Local Scan Detects Tuning Overlap"}
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
                            <span className="material-symbols-outlined !text-[12px]">{isIgnored ? "visibility" : "visibility_off"}</span>
                            {isIgnored ? t("bp_restore_alert") : t("bp_ignore_alert")}
                          </button>
                        </div>
                        
                        {/* CONFLICTING ARTIFACTS LIST */}
                        <div className={`flex flex-col gap-3 w-full mt-2 ${isIgnored ? 'opacity-30' : ''}`}>
                          {/* Mod A */}
                          <div className={`flex-1 flex flex-col p-4 rounded-[1.25rem] border transition-all shadow-inner relative overflow-hidden group/card hover:border-white/20 ${isWinnerA && !isTier4 ? 'border-[var(--success)]/50 bg-[var(--success)]/10 shadow-[0_0_15px_rgba(var(--success-rgb),0.1)]' : 'bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}>
                             <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity" />
                             
                             <div className="flex flex-col gap-1.5 relative z-10 w-full mb-3">
                               <span className={`text-[11px] font-black uppercase leading-tight ${isWinnerA && !isTier4 ? 'text-[var(--success)]' : 'text-[var(--text)]'}`}>{formatDisplayName(ac.modA.name)}</span>
                               <span className="text-[9px] font-mono text-cyan-400 tracking-widest opacity-80 bg-cyan-400/10 px-2 py-0.5 rounded-md border border-cyan-400/20 w-fit">{ac.modA.version || "v.Local"}</span>
                             </div>
                             
                             <div className="relative z-10 flex items-center gap-2 w-full mt-auto">
                                {ac.conflict.severity_rank === 4 ? (
                                  allow_write && (
                                    <button 
                                      onClick={() => toggleInActiveSet(ac.modA._originalSetName || ac.modA.name, true, true)}
                                      className="w-full py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 hover:border-red-500 hover:bg-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
                                    >
                                      <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_delete") || "delete"}</span>
                                      {t("bp_yeet_artifact")}
                                    </button>
                                  )
                                ) : ac.conflict.severity_rank === 3 ? (
                                  isWinnerA ? (
                                    <div className="w-full py-2.5 rounded-xl bg-[var(--success)]/20 border border-[var(--success)]/50 text-[var(--success)] text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(var(--success-rgb),0.3)]">
                                      <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_star") || "star"}</span>
                                      {t("bp_winning_artifact")}
                                    </div>
                                  ) : isWinnerB ? (
                                    <div className="w-full py-2.5 rounded-xl bg-white/5 border border-white/10 text-[var(--subtext)] opacity-60 text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
                                      <span className="material-symbols-outlined !text-[12px]">block</span>
                                      {t("bp_overridden_by_winner")}
                                    </div>
                                  ) : (
                                    allow_write && (
                                      <button 
                                        onClick={() => setBlueprintLoadOrder([
                                          { name: ac.modA._originalSetName || ac.modA.name, prefix: "Sanctuary" },
                                          { name: ac.modB._originalSetName || ac.modB.name, prefix: "" }
                                        ])}
                                        className="w-full py-2.5 rounded-xl bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border border-[color-mix(in_srgb,var(--success)_20%,transparent)] text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] hover:border-[var(--success)] text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
                                      >
                                        <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_check_circle") || "check_circle"}</span>
                                        {t("bp_select_winning_artifact")}
                                      </button>
                                    )
                                  )
                                ) : (
                                  <div className="w-full flex gap-2">
                                    <div className="flex-1">{getPriorityDrop(ac.modA)}</div>
                                    {allow_write && (
                                      <button 
                                        onClick={() => toggleInActiveSet(ac.modA._originalSetName || ac.modA.name, true, true)}
                                        className="w-10 h-10 shrink-0 rounded-xl bg-red-500/10 border border-red-500/30 hover:border-red-500 hover:bg-red-500/20 text-red-400 transition-all active:scale-95 flex items-center justify-center"
                                        title={t("bp_yeet_artifact")}
                                      >
                                        <span className="material-symbols-outlined !text-[16px]">{t("ui_icon_delete") || "delete"}</span>
                                      </button>
                                    )}
                                  </div>
                                )}
                             </div>
                          </div>
                          
                          {/* Mod B */}
                          <div className={`flex-1 flex flex-col p-4 rounded-[1.25rem] border transition-all shadow-inner relative overflow-hidden group/card hover:border-white/20 ${isWinnerB && !isTier4 ? 'border-[var(--success)]/50 bg-[var(--success)]/10 shadow-[0_0_15px_rgba(var(--success-rgb),0.1)]' : 'bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}>
                             <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity" />
                             
                             <div className="flex flex-col gap-1.5 relative z-10 w-full mb-3">
                               <span className={`text-[11px] font-black uppercase leading-tight ${isWinnerB && !isTier4 ? 'text-[var(--success)]' : 'text-[var(--text)]'}`}>{formatDisplayName(ac.modB.name)}</span>
                               <span className="text-[9px] font-mono text-cyan-400 tracking-widest opacity-80 bg-cyan-400/10 px-2 py-0.5 rounded-md border border-cyan-400/20 w-fit">{ac.modB.version || "v.Local"}</span>
                             </div>
                             
                             <div className="relative z-10 flex items-center gap-2 w-full mt-auto">
                                {ac.conflict.severity_rank === 4 ? (
                                  allow_write && (
                                    <button 
                                      onClick={() => toggleInActiveSet(ac.modB._originalSetName || ac.modB.name, true, true)}
                                      className="w-full py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 hover:border-red-500 hover:bg-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
                                    >
                                      <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_delete") || "delete"}</span>
                                      {t("bp_yeet_artifact")}
                                    </button>
                                  )
                                ) : ac.conflict.severity_rank === 3 ? (
                                  isWinnerB ? (
                                    <div className="w-full py-2.5 rounded-xl bg-[var(--success)]/20 border border-[var(--success)]/50 text-[var(--success)] text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(var(--success-rgb),0.3)]">
                                      <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_star") || "star"}</span>
                                      {t("bp_winning_artifact")}
                                    </div>
                                  ) : isWinnerA ? (
                                    <div className="w-full py-2.5 rounded-xl bg-white/5 border border-white/10 text-[var(--subtext)] opacity-60 text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
                                      <span className="material-symbols-outlined !text-[12px]">block</span>
                                      {t("bp_overridden_by_winner")}
                                    </div>
                                  ) : (
                                    allow_write && (
                                      <button 
                                        onClick={() => setBlueprintLoadOrder([{ name: ac.modB._originalSetName || ac.modB.name, prefix: "Sanctuary" }, { name: ac.modA._originalSetName || ac.modA.name, prefix: "" }])}
                                        className="w-full py-2.5 rounded-xl bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border border-[color-mix(in_srgb,var(--success)_20%,transparent)] text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] hover:border-[var(--success)] text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
                                      >
                                        <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_check_circle") || "check_circle"}</span>
                                        {t("bp_select_winning_artifact")}
                                      </button>
                                    )
                                  )
                                ) : (
                                  <div className="w-full flex gap-2">
                                    <div className="flex-1">{getPriorityDrop(ac.modB)}</div>
                                    {allow_write && (
                                      <button 
                                        onClick={() => toggleInActiveSet(ac.modB._originalSetName || ac.modB.name, true, true)}
                                        className="w-10 h-10 shrink-0 rounded-xl bg-red-500/10 border border-red-500/30 hover:border-red-500 hover:bg-red-500/20 text-red-400 transition-all active:scale-95 flex items-center justify-center"
                                        title={t("bp_yeet_artifact")}
                                      >
                                        <span className="material-symbols-outlined !text-[16px]">{t("ui_icon_delete") || "delete"}</span>
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
        </div>
        
        {/* RIGHT SIDE: BROKEN/COMPATIBILITY ALERTS */}
        <div className="flex-1 flex flex-col relative group rounded-[3rem] overflow-hidden transition-all duration-500 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-2xl bg-[color-mix(in_srgb,var(--bg)_30%,transparent)] min-h-0">
          <div className="absolute inset-0 theme-glass-panel opacity-100" />
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500 via-transparent to-transparent opacity-5" />
          
          <div className="relative z-10 flex flex-col flex-1 min-h-0">
            <div className="px-8 py-6 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 flex items-center justify-between">
              <h3 className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-[0.2em] opacity-80">{t("bp_compatibility_scanner")}</h3>
              {brokenMods.length > 0 ? (
                <span className="text-amber-400 bg-amber-500/10 border border-amber-500/30 px-3 py-1 rounded-full text-[9px] font-black shadow-inner flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  {brokenMods.length} {t("modcard_artifacts")}
                </span>
              ) : (
                <span className="text-[var(--subtext)] opacity-50 px-3 py-1 text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-current opacity-50" />
                  0 {t("modcard_artifacts")}
                </span>
              )}
            </div>
            
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-8 flex flex-col gap-4">
              {brokenMods.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center opacity-50 space-y-4">
                  <span className="material-symbols-outlined !text-6xl theme-text-success drop-shadow-sm">{t("ui_icon_success") || "check_circle"}</span>
                  <p className="text-[10px] font-black tracking-widest uppercase text-center">{t("bp_no_broken_mods_detected")}</p>
                </div>
              ) : (
                <>
                  {allow_write && (
                    <div className="mb-8 p-8 theme-glass-panel border-l-4 border-l-amber-500 border-amber-500/30 rounded-[2rem] flex flex-col gap-6 shadow-[0_0_40px_rgba(245,158,11,0.1)] relative overflow-hidden shrink-0">
                      <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 to-transparent pointer-events-none" />
                      <div className="flex items-center gap-6 relative z-10">
                        <div className="w-16 h-16 rounded-2xl theme-glass-panel border border-amber-500/50 flex items-center justify-center shrink-0 shadow-[inset_0_0_20px_rgba(245,158,11,0.1),0_0_30px_rgba(245,158,11,0.3)]">
                          <span className="material-symbols-outlined !text-4xl text-amber-500 animate-pulse">{t("ui_icon_warning") || "warning"}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <h4 className="text-xl font-black text-amber-500 uppercase tracking-widest">{t("bp_compromised_artifacts")}</h4>
                          <p className="text-xs font-bold text-[var(--subtext)] opacity-80 uppercase tracking-widest">{t("bp_compromised_desc").replace("{0}", String(brokenMods.length))}</p>
                        </div>
                      </div>
                      <button onClick={() => {
                        brokenMods.forEach((m: any) => toggleInActiveSet(m._originalSetName || m.name, true, true));
                      }} className={`w-full py-4 rounded-xl bg-amber-500/20 text-amber-500 hover:bg-amber-500/30 border border-amber-500/50 hover:border-amber-500 text-[11px] font-black uppercase tracking-widest relative z-10 shrink-0 flex items-center justify-center gap-2 transition-all active:scale-95`}>
                        <span className="material-symbols-outlined !text-lg">{t("ui_icon_delete_sweep") || "delete_sweep"}</span>
                        {t("bp_purge_compromised")?.replace("{0}", String(brokenMods.length)) || `YEET ${brokenMods.length} ARTIFACTS`}
                      </button>
                    </div>
                  )}

                  {brokenMods.map((mod: any) => {
                    const isIgnored = ignoredBroken.has(mod.name);
                    return (
                      <div 
                        key={mod.name} 
                        className={`relative shrink-0 group w-full rounded-[2rem] overflow-hidden transition-all duration-500 border flex items-center ${
                          isIgnored 
                            ? 'opacity-50 grayscale border-white/5 bg-black/40' 
                            : 'border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 shadow-lg hover:shadow-[0_0_30px_rgba(245,158,11,0.2)]'
                        }`}
                      >
                        <div className="relative p-6 z-10 flex items-center gap-5 w-full">
                          <div className={`w-12 h-12 rounded-[1.25rem] flex items-center justify-center shrink-0 border transition-all duration-500 shadow-inner ${
                            isIgnored ? 'border-white/10 bg-black/50' : 'border-amber-500/50 bg-amber-500/10 shadow-[0_0_20px_rgba(245,158,11,0.2)]'
                          }`}>
                            <span className={`material-symbols-outlined !text-[24px] ${isIgnored ? 'text-[var(--text)] opacity-30' : 'text-amber-400'}`}>warning</span>
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start mb-1">
                              <div className="flex flex-col gap-1">
                                <span className="text-xs font-black text-[var(--text)] uppercase break-words">
                                  {formatDisplayName(mod.name)}
                                </span>
                                <span className="text-[9px] font-mono text-cyan-400 tracking-widest opacity-80 bg-cyan-400/10 px-2 py-0.5 rounded-md border border-cyan-400/20 w-fit">
                                  {mod.version || "v.Local"}
                                </span>
                              </div>
                              <button 
                                onClick={() => {
                                  const newSet = new Set(ignoredBroken);
                                  if (isIgnored) newSet.delete(mod.name);
                                  else newSet.add(mod.name);
                                  setIgnoredBroken(newSet);
                                }}
                                className="text-[9px] font-black bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] px-4 py-1.5 rounded-full uppercase transition-all active:scale-95 shrink-0 ml-4"
                              >
                                {isIgnored ? t("bp_restore_alert") : t("bp_ignore_alert")}
                              </button>
                            </div>
                            <span className="text-[9px] font-mono text-[var(--subtext)] opacity-60 uppercase tracking-widest block mt-1">
                              {mod._alert_reason}
                            </span>
                          </div>
                          
                          {allow_write && !isIgnored && (
                            <button 
                              onClick={() => toggleInActiveSet(mod._originalSetName || mod.name, true, true)}
                              className="shrink-0 w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 font-black transition-all hover:bg-amber-500/30 hover:border-amber-500/60 hover:text-amber-200 hover:shadow-[0_0_15px_rgba(245,158,11,0.4)] backdrop-blur-md active:scale-95 flex items-center justify-center"
                            >
                              <span className="material-symbols-outlined !text-lg">{t("ui_icon_close") || "close"}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </SidePanel>
  );
}

