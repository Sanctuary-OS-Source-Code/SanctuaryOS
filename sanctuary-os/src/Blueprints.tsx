import { useState } from "react";
import { useLexicon } from "./LexiconContext";
import { ViewHeader, isVersionMatch } from "./shared";
import BlueprintMatrix from "./BlueprintMatrix";
import BlueprintArchitect from "./BlueprintArchitect";
import { useStore } from "./store";

export default function Blueprints({
  playSets, setPlaySets, activeSetName, equipPlaySet, deletePlaySet, syncCode, setSyncCode, uploadBlueprintToCloud, syncBlueprintByCode, renamePlaySet,
  importPlaySet, setSnapshotModal, activePlaySetIndex, setActivePlaySetIndex, setView, exportPlaySet,
  setIsDraftingSet, isDraftingSet, draftSetName, setDraftSetName, finalizeDraftSet,
  toggleInActiveSet, globalSearchQuery, setGlobalSearchQuery, onSearchNetwork, cloudResults, isSearching, vaultPath, onRefreshMods
}: any) {
  const { t } = useLexicon();
  const { ownedDLC, maskedDLC, selectedVersion, modList } = useStore();
  
  const getBlueprintAlertCount = (set: any) => {
    if (!set || !set.mods || !Array.isArray(set.mods)) return 0;
    
    const activeMods = set.mods.map((modName: string) => {
      const exactMatch = modList.find((m: any) => m.name === modName);
      if (exactMatch) return { ...exactMatch, _originalSetName: modName };
      const fallbackMatch = modList.find((m: any) => {
        const mBase = m.name?.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, '');
        const targetBase = typeof modName === 'string' ? modName.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, '') : '';
        const mExt = m.name?.split('.').pop()?.toLowerCase();
        const targetExt = typeof modName === 'string' ? modName.split('.').pop()?.toLowerCase() : '';
        return mBase && targetBase && mBase === targetBase && mExt === targetExt;
      });
      if (fallbackMatch) return { ...fallbackMatch, _originalSetName: modName };
      return { name: modName, isFallback: true, _originalSetName: modName };
    });

    let res = { total: 0, tier4: 0, tier3: 0, incompatible: 0 };
    for (const mod of activeMods) {
       if (mod.isFallback) continue;
       
       let isBroken = false;
       let isMismatch = false;
       let isMissingDLC = false;
       
       if (typeof mod.status === 'string' && mod.status.toLowerCase() === 'broken') isBroken = true;
       if (mod.compatible_versions && selectedVersion && !isVersionMatch(mod.compatible_versions, selectedVersion)) isMismatch = true;
       if (mod.requiredDLC) {
           let rawDLC: string[] = [];
           if (typeof mod.requiredDLC === 'string') rawDLC = mod.requiredDLC.split(',').map((s: string) => s.trim());
           else if (Array.isArray(mod.requiredDLC)) rawDLC = [...mod.requiredDLC];
           const activeDLC = ownedDLC.filter((d: string) => !maskedDLC.includes(d));
           const missing = rawDLC.filter(req => {
               const cleanReq = req.toUpperCase().trim();
               return !activeDLC.includes(cleanReq);
           });
           if (missing.length > 0) isMissingDLC = true;
       }
       
       let hasAlert = false;
       if (isBroken || isMismatch || isMissingDLC) {
          res.incompatible++;
          hasAlert = true;
       }
       
       if (mod.conflicts && Array.isArray(mod.conflicts)) {
           for (const c of mod.conflicts) {
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
                  hasAlert = true;
                  if (c.severity_rank === 4) res.tier4++;
                  else if (c.severity_rank === 3) res.tier3++;
                  else res.incompatible++;
              }
           }
       }
       
       if (mod.compliance_tier === 4) {
          res.tier4++;
          hasAlert = true;
       } else if (mod.compliance_tier === 3) {
          res.tier3++;
          hasAlert = true;
       }
       
       if (hasAlert) res.total++;
    }

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
              if (lc.severity_rank === 4) res.tier4++;
              else if (lc.severity_rank === 3) res.tier3++;
              else res.incompatible++;
              
              res.total++; // Tally each local conflict as 1 alert
          }
        });
      }
    } catch(e) {}

    return res;
  };

  const [isMatrixOpen, setIsMatrixOpen] = useState(false);
  const [matrixPlaySet, setMatrixPlaySet] = useState<any>(null);
  const [editingSetName, setEditingSetName] = useState<string | null>(null);
  const [newSetName, setNewSetName] = useState<string>("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [isArchitectOpen, setIsArchitectOpen] = useState(false);

  const handleOpenMatrix = (setName: string) => {
    const targetSet = playSets.find((s: any) => s.name === setName);
    if (targetSet) {
      setMatrixPlaySet(targetSet);
      setIsMatrixOpen(true);
    }
  };
  
  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700 h-full">
      <ViewHeader title={t("playsets_title")} subtitle={t("playsets_subtitle")} icon={t("ui_icon_playsets") || "map"} iconColorClass="text-[var(--accent)] border-[var(--accent)]/30">
        <div className="flex flex-wrap gap-4 items-center justify-end">
          
          <div className="flex items-center theme-glass-inner rounded-2xl p-1 border border-white/5 shadow-inner">
             <input 
               type="text" 
               placeholder={t("playsets_uplink_code") || "ENTER UPLINK CODE"} 
               value={syncCode || ""} 
               onChange={(e) => setSyncCode && setSyncCode(e.target.value)}
               className="h-12 px-5 bg-transparent text-[var(--text)] font-bold text-sm outline-none placeholder-[var(--subtext)] w-48"
             />
             <div className="w-px h-6 bg-white/10 mx-2" />
             <button 
               onClick={() => syncCode && syncBlueprintByCode && syncBlueprintByCode(syncCode)}
               className="h-12 px-6 rounded-xl theme-glass-inner text-[var(--accent)] hover:bg-white/10 text-[10px] font-black uppercase tracking-widest shadow-md transition-all flex items-center justify-center shrink-0 border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:border-[var(--accent)]"
             >
                {t("playsets_btn_sync")}
             </button>
          </div>

          <div className="flex items-center theme-glass-inner rounded-2xl p-1 border border-white/5 shadow-inner">
            <button 
              onClick={importPlaySet} 
              className="h-12 px-6 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all hover:bg-white/10 flex items-center justify-center gap-2 text-[var(--text)] shrink-0 group"
            >
              <span className="material-symbols-outlined !text-[18px] text-[var(--accent)] group-hover:scale-110 transition-transform drop-shadow-md">{t("ui_icon_import") || "download"}</span> {t("playsets_btn_import")}
            </button>
            
            <div className="w-px h-6 bg-white/10 mx-2" />
            
            <button 
              onClick={() => {
                 if (activeSetName) {
                    const currentSet = playSets.find((s: any) => s.name === activeSetName);
                    if (currentSet) {
                       const newName = `${currentSet.name} Snapshot`;
                       const updatedSets = [...playSets, { ...currentSet, name: newName }];
                       if (setPlaySets) {
                           setPlaySets(updatedSets);
                           localStorage.setItem("sanctuary_playsets", JSON.stringify(updatedSets));
                       }
                    }
                 }
              }} 
              className="h-12 px-6 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all hover:bg-white/10 flex items-center justify-center gap-2 text-[var(--text)] shrink-0 group"
            >
              <span className="material-symbols-outlined !text-[18px] text-[var(--subtext)] group-hover:scale-110 transition-transform drop-shadow-md">{t("ui_icon_snapshot") || "camera"}</span> {t("playsets_btn_snapshot")}
            </button>
          </div>
        </div>
      </ViewHeader>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {isDraftingSet ? (
          <div className="theme-glass-panel border-[color-mix(in_srgb,var(--accent)_30%,transparent)] p-8 rounded-[3rem] flex flex-col gap-4 animate-in zoom-in-95 shadow-[0_0_30px_rgba(var(--accent-rgb),0.1)] h-full min-h-[18rem] justify-center relative overflow-hidden bg-[color-mix(in_srgb,var(--accent)_5%,transparent)]">
            <div className="absolute inset-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_10%,transparent)] to-transparent pointer-events-none" />
            <input 
              autoFocus 
              type="text" 
              value={draftSetName} 
              onChange={(e) => setDraftSetName && setDraftSetName(e.target.value)} 
              className="w-full bg-black/40 border border-white/10 rounded-2xl p-5 text-xl text-[var(--text)] font-black outline-none text-center shadow-inner focus:border-[var(--accent)] transition-all z-10" 
              placeholder={t("playsets_draft_placeholder")} 
            />
            <div className="flex gap-3 mt-4 z-10">
              <button onClick={finalizeDraftSet} className="flex-1 py-4 bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] backdrop-blur-md font-black uppercase tracking-widest text-[10px] rounded-xl hover:scale-105 hover:bg-[color-mix(in_srgb,var(--success)_25%,transparent)] hover:border-[color-mix(in_srgb,var(--success)_50%,transparent)] transition-all shadow-[0_0_20px_rgba(var(--success-rgb),0.2)]">{t("playsets_btn_save")}</button>
              <button onClick={() => setIsDraftingSet && setIsDraftingSet(false)} className="flex-1 py-4 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)] font-black uppercase tracking-widest text-[10px] rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:scale-105 transition-all">{t("playsets_btn_cancel")}</button>
            </div>
          </div>
        ) : (
          <div 
            onClick={() => setIsDraftingSet && setIsDraftingSet(true)} 
            className="group cursor-pointer theme-glass-panel border-dashed border-2 border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)]/50 hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] rounded-[3rem] flex flex-col items-center justify-center h-full min-h-[18rem] transition-all shadow-xl hover:shadow-[0_0_30px_rgba(var(--accent-rgb),0.2)]"
          >
            <div className="w-20 h-20 rounded-[2rem] theme-glass-inner flex items-center justify-center mb-6 group-hover:scale-110 transition-all group-hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.3)] border border-white/5 group-hover:border-[var(--accent)]/30 group-hover:bg-[var(--accent)] group-hover:text-[var(--bg)]">
              <span className="material-symbols-outlined !text-4xl text-[var(--subtext)] opacity-60 group-hover:text-[var(--bg)] group-hover:opacity-100 transition-colors drop-shadow-md">{t("ui_icon_add") || "add"}</span>
            </div>
            <p className="text-xs font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest group-hover:text-[var(--accent)] group-hover:opacity-100 transition-colors">
              {t("playsets_draft_new")}
            </p>
          </div>
        )}

        {(playSets || []).map((set: any, idx: number) => (
          <div key={set.name} className={`theme-glass-panel p-8 rounded-[3rem] flex flex-col transition-all h-full min-h-[18rem] shadow-2xl relative overflow-hidden group/card ${activeSetName === set.name ? 'border-[color-mix(in_srgb,var(--success)_30%,transparent)] shadow-[0_0_40px_rgba(var(--success-rgb),0.1)] bg-[color-mix(in_srgb,var(--success)_2%,transparent)]' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_15%,transparent)] hover:shadow-[0_0_30px_rgba(255,255,255,0.02)] hover:bg-black/5'}`}>
            <div className={`absolute inset-0 bg-gradient-to-br pointer-events-none transition-opacity duration-500 opacity-0 group-hover/card:opacity-100 ${activeSetName === set.name ? 'from-[color-mix(in_srgb,var(--success)_5%,transparent)] to-transparent' : 'from-white/5 to-transparent'}`} />
            <div className="mb-8 relative group/title z-10 flex flex-col items-start gap-1">
              <div className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border mb-3 flex items-center gap-1.5 ${activeSetName === set.name ? 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)] text-[var(--success)] border-[color-mix(in_srgb,var(--success)_30%,transparent)] shadow-[0_0_15px_rgba(var(--success-rgb),0.2)]' : 'bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)] border-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}>
                <span className="material-symbols-outlined !text-[12px]">{activeSetName === set.name ? "check_circle" : "map"}</span>
                {activeSetName === set.name ? t("playsets_btn_deployed") : t("playsets_title")}
              </div>
              {editingSetName === set.name ? (
                <input
                  autoFocus
                  value={newSetName}
                  onChange={(e) => setNewSetName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (renamePlaySet && newSetName.trim() !== "" && newSetName !== set.name) {
                        renamePlaySet(set.name, newSetName.trim());
                      }
                      setEditingSetName(null);
                    } else if (e.key === 'Escape') {
                      setEditingSetName(null);
                    }
                  }}
                  onBlur={() => {
                    if (renamePlaySet && newSetName.trim() !== "" && newSetName !== set.name) {
                      renamePlaySet(set.name, newSetName.trim());
                    }
                    setEditingSetName(null);
                  }}
                  className="w-full bg-transparent border-b-2 border-[var(--accent)] px-0 py-0 text-3xl font-black text-[var(--text)] tracking-tighter outline-none mb-1 drop-shadow-md"
                />
              ) : (
                <div 
                  className="flex items-center gap-3 cursor-pointer w-full group/editbtn"
                  onClick={() => {
                    setNewSetName(set.name);
                    setEditingSetName(set.name);
                  }}
                >
                  <h3 className="text-3xl font-black text-[var(--text)] tracking-tighter truncate leading-none hover:text-[var(--accent)] transition-colors drop-shadow-md">{set.name}</h3>
                  <span className="material-symbols-outlined !text-lg opacity-0 group-hover/editbtn:opacity-100 transition-opacity text-[var(--subtext)] hover:text-[var(--text)] drop-shadow-md ml-auto shrink-0">{t("ui_icon_edit") || "edit"}</span>
                </div>
              )}
              <div className="flex items-center gap-2 mt-3">
                <p className="text-[10px] font-black text-[var(--subtext)] opacity-80 tracking-widest uppercase flex items-center gap-2 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] px-2 py-1 rounded-md border border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                  <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_extension") || "extension"}</span> {(set.mods || []).filter((modName: string) => !modName.startsWith("FOLDER_") && !modName.startsWith("SET_") && !modName.startsWith("LOCAL_SET_")).length} {t("playsets_artifacts_linked")}
                </p>
              </div>
            </div>
            
            <div className="flex flex-col gap-3 mt-auto relative z-10">
              <button 
                onClick={() => equipPlaySet && equipPlaySet(set.name)} 
                className={`w-full py-4 rounded-xl font-black text-[11px] tracking-widest uppercase transition-all flex items-center justify-center gap-3 ${activeSetName === set.name ? 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] backdrop-blur-md shadow-[0_0_20px_rgba(var(--success-rgb),0.2)]' : 'theme-glass-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-md'}`}
              >
                {activeSetName === set.name ? <span className="material-symbols-outlined !text-[18px]">{t("ui_icon_verified") || "verified"}</span> : <span className="material-symbols-outlined !text-[18px]">{t("ui_icon_check_circle") || "check_circle"}</span>}
                {activeSetName === set.name ? t("playsets_btn_deployed") : t("playsets_btn_equip")}
              </button>
              
              <div className="grid grid-cols-2 gap-3 mt-2">
                {(() => {
                  const alertStatus = getBlueprintAlertCount(set);
                  const hasAlerts = alertStatus && alertStatus.total > 0;
                  
                  let alertBtnClass = 'border-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_15%,transparent)]';
                  let alertLabel = t("bp_alert");
                  
                  if (hasAlerts) {
                      if (alertStatus.tier4 > 0) {
                          alertBtnClass = '!border-red-500/30 !text-red-500 !bg-red-500/10 hover:!bg-red-500/20 hover:!border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]';
                          alertLabel = `ALERTS (${alertStatus.total})`;
                      } else if (alertStatus.incompatible > 0) {
                          alertBtnClass = '!border-orange-500/30 !text-orange-500 !bg-orange-500/10 hover:!bg-orange-500/20 hover:!border-orange-500/50 shadow-[0_0_15px_rgba(249,115,22,0.2)]';
                          alertLabel = `ALERTS (${alertStatus.total})`;
                      } else if (alertStatus.tier3 > 0) {
                          alertBtnClass = '!border-amber-500/30 !text-amber-500 !bg-amber-500/10 hover:!bg-amber-500/20 hover:!border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)]';
                          alertLabel = `ALERTS (${alertStatus.total})`;
                      } else {
                          alertBtnClass = '!border-amber-500/30 !text-amber-500 !bg-amber-500/10 hover:!bg-amber-500/20 hover:!border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)]';
                          alertLabel = `ALERTS (${alertStatus.total})`;
                      }
                  }

                  return (
                    <button 
                      onClick={() => { if(setActivePlaySetIndex) setActivePlaySetIndex(idx); setIsArchitectOpen(true); }} 
                      className={`py-3.5 px-4 theme-glass-inner border rounded-xl transition-all flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] ${alertBtnClass}`}
                    >
                      <span className="material-symbols-outlined !text-[16px] drop-shadow-md">{t("ui_icon_warning") || "warning"}</span> {alertLabel}
                    </button>
                  );
                })()}
                <button 
                  onClick={() => handleOpenMatrix(set.name)} 
                  className="py-3.5 px-4 theme-glass-inner border border-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)] rounded-xl hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_15%,transparent)] transition-all flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest hover:scale-[1.02]"
                >
                  <span className="material-symbols-outlined !text-[16px] drop-shadow-md">{t("ui_icon_cloud") || "cloud"}</span> {t("playsets_action_uplink")}
                </button>
                <button 
                  onClick={() => exportPlaySet && exportPlaySet(set.name)} 
                  className="py-3.5 px-4 theme-glass-inner border border-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)] rounded-xl hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_15%,transparent)] transition-all flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest hover:scale-[1.02]"
                >
                  <span className="material-symbols-outlined !text-[16px] drop-shadow-md">{t("ui_icon_export") || "upload"}</span> {t("playsets_action_export")}
                </button>
                <button 
                  onClick={() => {
                    if (deleteConfirm === set.name) {
                      deletePlaySet && deletePlaySet(set.name);
                      setDeleteConfirm(null);
                    } else {
                      setDeleteConfirm(set.name);
                      setTimeout(() => setDeleteConfirm(null), 3000);
                    }
                  }} 
                  className={`py-3.5 px-4 transition-all flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest rounded-xl border hover:scale-[1.02] ${deleteConfirm === set.name ? "backdrop-blur-md bg-[color-mix(in_srgb,var(--danger)_25%,transparent)] border-[color-mix(in_srgb,var(--danger)_50%,transparent)] shadow-[0_10px_30px_rgba(var(--danger-rgb),0.3)] scale-[1.05] text-[var(--danger)]" : "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)]"}`}
                >
                  <span className="material-symbols-outlined !text-[16px] drop-shadow-md">{deleteConfirm === set.name ? "warning" : t("ui_icon_trash") || "delete"}</span> {deleteConfirm === set.name ? t("ui_btn_confirm") || "CONFIRM" : t("playsets_action_delete")}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <BlueprintMatrix 
        isOpen={isMatrixOpen} 
        onClose={() => setIsMatrixOpen(false)} 
        playSet={matrixPlaySet} 
        modList={modList} 
        onUpload={async (isPublic: boolean, isLocked: boolean, allowedMods: any[], isMarketListed: boolean) => {
          if (uploadBlueprintToCloud && matrixPlaySet) {
            return await uploadBlueprintToCloud(matrixPlaySet.name, isPublic, isLocked, allowedMods, isMarketListed);
          }
          return undefined;
        }} 
      />

      <BlueprintArchitect
        isOpen={isArchitectOpen}
        onClose={() => setIsArchitectOpen(false)}
        playSet={playSets[activePlaySetIndex]}
        modList={modList}
        toggleInActiveSet={toggleInActiveSet}
        allow_write={true}
        vaultPath={vaultPath}
        onRefreshMods={onRefreshMods}
        renamePlaySet={renamePlaySet}
      />

    </div>
  );
}
