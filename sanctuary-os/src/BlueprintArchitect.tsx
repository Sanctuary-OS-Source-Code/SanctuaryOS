import { useState, useMemo } from "react";
import { formatDisplayName, ViewHeader, CustomDropdown } from "./shared";
import { useLexicon } from "./LexiconContext";
import { tauriBridge } from "./lib/tauri-bridge";

export default function BlueprintArchitect({ isOpen, onClose, playSet, modList, toggleInActiveSet, allow_write, onCloudUpload, vaultPath, onRefreshMods }: any) {
  const { t } = useLexicon();
  const [ignoredConflicts, setIgnoredConflicts] = useState<Set<string>>(new Set());
  const [ignoredBroken, setIgnoredBroken] = useState<Set<string>>(new Set());



  const activeMods = useMemo(() => {
    const safeMods = Array.isArray(playSet?.mods) ? playSet.mods : [];
    const safeList = Array.isArray(modList) ? modList : [];
    return safeMods.map((modName: string) => {
      return safeList.find((m: any) => {
        if (m.name === modName) return true;
        const mBase = m.name?.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, '');
        const targetBase = typeof modName === 'string' ? modName.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, '') : '';
        return mBase && targetBase && mBase === targetBase;
      }) || { name: modName, isFallback: true };
    });
  }, [playSet?.mods, modList]);

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
               const cleanN = em.name?.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, "").toUpperCase();
               if (cleanN === targetClean || String(em.displayName || '').toUpperCase() === targetClean) return true;
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
    return conflicts;
  }, [activeMods]);

  const brokenMods = useMemo(() => {
    return activeMods.filter((mod: any) => {
      if (mod.isFallback) return false;
      return (typeof mod.status === 'string' && mod.status.toLowerCase() === 'broken') || mod.compliance_tier === 3 || mod.compliance_tier === 4;
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
      <div className="w-full mt-3">
        <CustomDropdown
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

  if (!isOpen || !playSet) return null;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-6 lg:p-12 animate-in fade-in duration-500">
      <div className="absolute inset-0 bg-[var(--bg)]/40 backdrop-blur-2xl" onClick={onClose} />
      <div className="relative w-full h-full max-w-[90vw] border border-white/10 rounded-[4rem] shadow-[0_0_100px_rgba(0,0,0,1)] overflow-hidden flex flex-col animate-in zoom-in-95" onClick={(e) => e.stopPropagation()} style={{ backgroundColor: 'var(--sidebar)' }}>
        
        <div className="p-10 border-b border-white/5 bg-black/20 shrink-0">
          <ViewHeader title={t("bp_title")} subtitle={`${t("bp_subtitle")}${playSet.name} (${activeMods.length} Artifacts)`}>
            <div className="flex items-center gap-6">
                {!allow_write && (
                  <div className="px-6 py-3 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3">
                    <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-[10px] font-black theme-text-danger uppercase tracking-widest">{t("bp_read_only_mode")}</span>
                  </div>
                )}
               {allow_write && (
                 <button 
                   onClick={() => onCloudUpload(playSet.name)} 
                   className="px-6 py-3 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center gap-3 hover:bg-blue-500/20 transition-all group"
                 >
                   <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest group-hover:text-blue-300">{t("bp_btn_cloud")}</span>
                 </button>
               )}
              <button onClick={onClose} className="px-10 py-5 theme-bg-success text-[var(--bg)] font-black rounded-3xl shadow-lg hover:opacity-90 transition-all uppercase text-xs tracking-widest">
                {allow_write ? t("bp_btn_finalize") : t("bp_btn_exit_preview")}
              </button>
              <button onClick={onClose} className="w-14 h-14 rounded-2xl theme-glass-panel flex items-center justify-center text-[var(--text)] hover:theme-bg-danger transition-all">{t("ui_icon_close")}</button>
            </div>
          </ViewHeader>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* LEFT SIDE: LOAD ORDER CONFLICTS */}
          <div className="w-1/2 flex flex-col bg-black/40 border-r border-white/5">
            <div className="p-8 border-b border-white/5 shrink-0 flex items-center justify-between">
              <h3 className="text-xs font-black text-[var(--text)]/40 uppercase tracking-widest">{t("bp_load_order_conflicts")}</h3>
              <span className="theme-bg-warning text-[var(--bg)] px-3 py-1 rounded-full text-[10px] font-black">{t("bp_conflicts_detected").replace("{0}", String(activeConflicts.length))}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-6">
              {activeConflicts.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center opacity-20 italic space-y-4">
                  <span className="text-5xl sanctuary-icon">{t("ui_icon_shield")}</span>
                  <p>{t("bp_no_conflicts_detected")}</p>
                </div>
              ) : (
                activeConflicts.map((ac) => {
                  const isIgnored = ignoredConflicts.has(ac.pairId);
                  return (
                    <div key={ac.pairId} className={`p-6 rounded-2xl border transition-all ${isIgnored ? 'opacity-50 grayscale border-white/10 bg-black/20' : 'theme-panel-warning border-[var(--warning)]/50 shadow-[0_0_20px_rgba(var(--warning-rgb),0.1)]'}`}>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xl sanctuary-icon text-[var(--warning)]">{t("ui_icon_warning")}</span>
                          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--warning)]">
                            {ac.conflict.severity_rank === 4 ? t("bp_fatal_override_clash") : t("bp_data_override_conflict")}
                          </span>
                        </div>
                        <button 
                          onClick={() => {
                            const newSet = new Set(ignoredConflicts);
                            if (isIgnored) newSet.delete(ac.pairId);
                            else newSet.add(ac.pairId);
                            setIgnoredConflicts(newSet);
                          }}
                          className="text-[9px] font-bold text-[var(--subtext)] uppercase hover:text-[var(--text)] transition-colors"
                        >
                          {isIgnored ? t("bp_restore_conflict") : t("bp_ignore_conflict")}
                        </button>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 items-stretch">
                        <div className="bg-black/40 rounded-xl p-4 border border-white/5 flex flex-col">
                          <span className="text-[11px] font-bold text-[var(--text)] uppercase truncate mb-1">
                            {formatDisplayName(ac.modA.name)}
                          </span>
                          <span className="text-[9px] font-mono text-[var(--subtext)] opacity-60 mb-3">{ac.modA.version || "v.Local"}</span>
                          {getPriorityDrop(ac.modA)}
                          {allow_write && (
                            <button 
                              onClick={() => toggleInActiveSet(ac.modA.name)}
                              className="mt-4 w-full py-2 bg-red-500/20 text-red-400 font-black rounded-lg text-[9px] uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all"
                            >
                              {t("bp_yeet_artifact")}
                            </button>
                          )}
                        </div>
                        
                        <div className="bg-black/40 rounded-xl p-4 border border-white/5 flex flex-col">
                          <span className="text-[11px] font-bold text-[var(--text)] uppercase truncate mb-1">
                            {formatDisplayName(ac.modB.name)}
                          </span>
                          <span className="text-[9px] font-mono text-[var(--subtext)] opacity-60 mb-3">{ac.modB.version || "v.Local"}</span>
                          {getPriorityDrop(ac.modB)}
                          {allow_write && (
                            <button 
                              onClick={() => toggleInActiveSet(ac.modB.name)}
                              className="mt-4 w-full py-2 bg-red-500/20 text-red-400 font-black rounded-lg text-[9px] uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all"
                            >
                              {t("bp_yeet_artifact")}
                            </button>
                          )}
                        </div>
                      </div>
                      
                      {ac.conflict.resolution_note && (
                        <div className="mt-4 p-3 bg-black/40 rounded-lg border border-[var(--warning)]/20 text-[10px] text-[var(--warning)]/80 italic">
                          " {ac.conflict.resolution_note} "
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
          
          {/* RIGHT SIDE: BROKEN/COMPATIBILITY ALERTS */}
          <div className="w-1/2 flex flex-col bg-black/10">
            <div className="p-8 border-b border-white/5 shrink-0 flex items-center justify-between">
              <h3 className="text-xs font-black text-[var(--text)]/40 uppercase tracking-widest">{t("bp_compatibility_scanner")}</h3>
              <span className="theme-bg-danger text-[var(--bg)] px-3 py-1 rounded-full text-[10px] font-black">{t("bp_alerts_detected").replace("{0}", String(brokenMods.length))}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-4">
              {brokenMods.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center opacity-20 italic space-y-4">
                  <span className="text-5xl sanctuary-icon theme-text-success">{t("ui_icon_success")}</span>
                  <p>{t("bp_no_broken_mods_detected")}</p>
                </div>
              ) : (
                <>
                  {allow_write && (
                    <div className="mb-6 p-6 theme-panel-danger border rounded-2xl flex flex-col gap-4 shadow-xl">
                      <div className="flex items-center gap-4">
                        <span className="text-3xl sanctuary-icon theme-text-danger">{t("ui_icon_warning")}</span>
                        <div className="flex flex-col gap-1">
                          <h4 className="text-sm font-black theme-text-danger uppercase tracking-widest">{t("bp_compromised_artifacts")}</h4>
                          <p className="text-[10px] font-bold text-[var(--subtext)] opacity-80 uppercase tracking-widest">{t("bp_compromised_desc").replace("{0}", String(brokenMods.length))}</p>
                        </div>
                      </div>
                      <button onClick={() => {
                        brokenMods.forEach((m: any) => toggleInActiveSet(m.name));
                      }} className="w-full py-3 theme-bg-danger text-[var(--text)] text-[10px] font-black uppercase tracking-widest rounded-xl hover:opacity-90 shadow-lg transition-all">
                        {t("bp_purge_compromised").replace("{0}", String(brokenMods.length))}
                      </button>
                    </div>
                  )}

                  {brokenMods.map((mod: any) => {
                    const isIgnored = ignoredBroken.has(mod.name);
                    return (
                      <div key={mod.name} className={`p-5 rounded-2xl border transition-all flex items-center gap-4 ${isIgnored ? 'opacity-50 grayscale border-white/10 bg-black/20' : 'theme-panel-danger border-[var(--danger)]/50'}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start mb-1">
                            <span className="text-[11px] font-bold text-[var(--text)] uppercase truncate">
                              {formatDisplayName(mod.name)}
                            </span>
                            <button 
                              onClick={() => {
                                const newSet = new Set(ignoredBroken);
                                if (isIgnored) newSet.delete(mod.name);
                                else newSet.add(mod.name);
                                setIgnoredBroken(newSet);
                              }}
                              className="text-[9px] font-bold text-[var(--subtext)] uppercase hover:text-[var(--text)] transition-colors shrink-0 ml-4"
                            >
                              {isIgnored ? t("bp_restore_alert") : t("bp_ignore_alert")}
                            </button>
                          </div>
                          <span className="text-[9px] font-mono text-[var(--subtext)] opacity-60 uppercase tracking-widest">
                            {t("bp_status_broken_noncompliant")}
                          </span>
                        </div>
                        
                        {allow_write && !isIgnored && (
                          <button 
                            onClick={() => toggleInActiveSet(mod.name)}
                            className="shrink-0 w-10 h-10 bg-red-500/20 text-red-400 rounded-xl flex items-center justify-center font-black hover:bg-red-500 hover:text-white transition-all sanctuary-icon"
                            title={t("bp_yeet_artifact")}
                          >
                            {t("ui_icon_close")}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}