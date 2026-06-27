import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useLexicon } from "./LexiconContext";
import { ViewHeader, isVersionMatch, SidePanel, getHighestVersion } from "./shared";
import { useStore } from "./store";
import MasonFeed from "./MasonFeed";

import BlueprintSwapSidePanel from "./BlueprintSwapSidePanel";
import CommandIncompatiblePanel from "./CommandIncompatiblePanel";
import CommandConflictsPanel from "./CommandConflictsPanel";
import CommandRadarSweepPanel from "./CommandRadarSweepPanel";

function DashboardStatTile({ icon, number, label, colorClass, onClick }: any) {
  return (
    <div onClick={onClick} className={`flex-1 flex flex-col justify-center items-start gap-1 p-6 rounded-3xl border border-white/10 backdrop-blur-[3px] ${colorClass} transition-all cursor-pointer shadow-lg relative overflow-hidden group hover:-translate-y-1 hover:shadow-xl`}>
       <div className="absolute inset-0 bg-current opacity-0 group-hover:opacity-[0.15] transition-opacity duration-300" />
       <div className="flex items-center gap-3 w-full relative z-10">
           <span className="text-3xl opacity-50 grayscale group-hover:opacity-100 group-hover:grayscale-0 group-hover:scale-110 transition-all drop-shadow-md">{icon}</span>
           <span className={`text-4xl lg:text-5xl font-black drop-shadow-lg tracking-tighter`}>{number}</span>
       </div>
       <span className="text-[9px] uppercase tracking-[0.2em] font-bold text-[var(--subtext)] opacity-60 mt-2">{label}</span>
    </div>
  );
}

export default function CommandCenter({
  status, isScanning, scanProgress, modsPath, isConfigured, toggleInActiveSet,
  modList, quarantineList, shelterContents, shelterActive, runRadarSweep, runSanitization, massIngestToCloud, triggerShelter, setView, setFilterStatus, setShowBrokenModal, setShowQuarantineModal, handleOpenMasonProfile, networkUpdates, setIsSupportDeskOpen, setIsConflictRadarOpen, setIsCitizenTicketsOpen
}: any) {
  const { t } = useLexicon();
  const { ownedDLC, maskedDLC, selectedVersion, playSets, activePlaySetIndex, session, userRole, setPlaySets } = useStore();
  const activePlaySet = playSets ? playSets[activePlaySetIndex] : null;
  const [showUpdatesModal, setShowUpdatesModal] = useState(false);
  const [hasSymlinkPerms, setHasSymlinkPerms] = useState<boolean | null>(null);

  const [showIncompatiblePanel, setShowIncompatiblePanel] = useState(false);
  const [showConflictsPanel, setShowConflictsPanel] = useState(false);
  const [showRadarSweepPanel, setShowRadarSweepPanel] = useState(false);

  const [isBlueprintSwapOpen, setIsBlueprintSwapOpen] = useState(false);
  const [marketplaceCount, setMarketplaceCount] = useState<number | "-">("-");
  const [ticketCount, setTicketCount] = useState<number | "-">("-");

  const checkPerms = () => {
    invoke<boolean>("check_symlink_permissions")
      .then(res => setHasSymlinkPerms(res))
      .catch(() => setHasSymlinkPerms(false)); 
  };

  useEffect(() => {
    checkPerms();
    import('./supabase').then(async ({ supabase }) => {
      try {
        const [assetsRes, modsRes, bpRes] = await Promise.all([
          supabase.from('marketplace_assets').select('id', { count: 'exact', head: true }),
          supabase.from('mods').select('id', { count: 'exact', head: true }),
          supabase.from('blueprints').select('id', { count: 'exact', head: true })
        ]);
        
        let total = 0;
        if (assetsRes.count !== null) total += assetsRes.count;
        if (modsRes.count !== null) total += modsRes.count;
        if (bpRes.count !== null) total += bpRes.count;
        
        setMarketplaceCount(total);
      } catch (err) {
        console.error("Failed to fetch total marketplace count", err);
      }
      
      supabase.auth.getSession().then(({ data }) => {
        if (data.session?.user?.id) {
          supabase.from('sanctuary_tickets').select('id', { count: 'exact', head: true }).eq('author_id', data.session.user.id).then(({ count }) => {
            if (count !== null) setTicketCount(count);
          });
        }
      });
    });
  }, []);

  useEffect(() => {
    if (hasSymlinkPerms === true || hasSymlinkPerms === null) return;
    const interval = setInterval(checkPerms, 3000);
    return () => clearInterval(interval);
  }, [hasSymlinkPerms]);
  
  const activeBlueprintMods = React.useMemo(() => {
    if (!activePlaySet) return [];
    const safeMods = Array.isArray(activePlaySet.mods) ? activePlaySet.mods : [];
    const safeList = Array.isArray(modList) ? modList : [];
    
    return safeMods.map((modName: string) => {
      const modNameLow = modName.toLowerCase().replace(/\\/g, '/');
      const exactMatch = safeList.find((m: any) => m.name && m.name.toLowerCase().replace(/\\/g, '/') === modNameLow);
      if (exactMatch) return { ...exactMatch, _originalSetName: modName };
      
      const mBase = modName.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, '').toLowerCase();
      const baseMatch = safeList.find((m: any) => {
         const tb = m.name?.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, '').toLowerCase();
         return mBase && tb && mBase === tb;
      });
      if (baseMatch) return { ...baseMatch, _originalSetName: modName };
      
      return { id: `missing-${modName}`, name: modName, isFallback: true, color: 'theme-border-danger', physical_path: null, hash: 'unknown' };
    });
  }, [activePlaySet, modList]);

  const activeUpdates = React.useMemo(() => {
    if (!networkUpdates?.updated) return [];
    return networkUpdates.updated.filter((u: any) => 
      activeBlueprintMods.some((m: any) => {
        if (m.dbId && u.dbId && String(m.dbId) === String(u.dbId)) return true;
        if (m.hash && u.hash && m.hash !== 'unknown' && m.hash === u.hash) return true;
        
        const mName = String(m.name || "").toLowerCase().replace(/\\/g, '/');
        const uName = String(u.name || "").toLowerCase().replace(/\\/g, '/');
        const oName = String(m._originalSetName || "").toLowerCase().replace(/\\/g, '/');
        
        if (mName && uName && (mName === uName || mName.includes(uName) || uName.includes(mName))) return true;
        if (oName && uName && (oName === uName || oName.includes(uName) || uName.includes(oName))) return true;

        return false;
      })
    ).filter((u: any, index: number, self: any[]) => 
      index === self.findIndex((t) => (
        (t.dbId && u.dbId && t.dbId === u.dbId) || 
        (t.hash && u.hash && t.hash === u.hash) || 
        (t.name === u.name)
      ))
    );
  }, [networkUpdates, activeBlueprintMods]);

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

  const activeBrokenCounts = activeBlueprintMods.reduce((acc: { broken: number, unstable: number }, m: any) => {
    if (!m || m.isFallback) return acc;
      let isBroken = typeof m.status === 'string' && m.status.toLowerCase() === 'broken';
      if (isBroken && m.compatible_versions && m.compatible_versions.length > 0 && selectedVersion) {
         if (selectedVersion !== getHighestVersion(m.compatible_versions)) {
            isBroken = false;
         }
      }
      const isUnstable = typeof m.status === 'string' && m.status.toLowerCase() === 'unstable';
      const isMismatch = m.isGhosted === true && m.ghostReason === "VERSION_MISMATCH" || (m.compatible_versions && m.compatible_versions.length > 0 && selectedVersion && !isVersionMatch(m.compatible_versions, selectedVersion));
      
      let hasMissingDLC = false;
      if (m.requiredDLC) {
         let rawDLC: string[] = [];
         if (typeof m.requiredDLC === 'string') {
           rawDLC = m.requiredDLC.split(',').map((s: string) => s.trim());
         } else if (Array.isArray(m.requiredDLC)) {
           rawDLC = [...m.requiredDLC];
         }
         const activeDLC = ownedDLC.filter((d: string) => !maskedDLC.includes(d));
         hasMissingDLC = rawDLC.some((req: string) => {
             const cleanReq = req.toUpperCase().trim();
             if (cleanReq === 'BASE') return false;
             return !activeDLC.some((owned: string) => owned.toUpperCase() === cleanReq);
         });
      }

      let hasMissingDeps = false;
      if (m.dependencies) {
         let rawDeps: string[] = [];
         if (typeof m.dependencies === 'string') {
           rawDeps = m.dependencies.split(',').map((s: string) => s.trim());
         } else if (Array.isArray(m.dependencies)) {
           rawDeps = [...m.dependencies];
         }
         if (rawDeps.length > 0) {
            const activeModNames = activeBlueprintMods.map((am: any) => (am._originalSetName || am.name)?.toLowerCase());
            hasMissingDeps = rawDeps.some((req: string) => !activeModNames.includes(req.toLowerCase()));
         }
      }

      if (isBroken || isMismatch || hasMissingDLC || hasMissingDeps) {
        acc.broken += 1;
      } else if (isUnstable) {
        acc.unstable += 1;
      }
    return acc;
  }, { broken: 0, unstable: 0 }) || { broken: 0, unstable: 0 };

  const activeConflictCount = React.useMemo(() => {
    const conflicts: any[] = [];
    activeBlueprintMods.forEach((mod: any) => {
      if (mod.conflicts && Array.isArray(mod.conflicts)) {
        mod.conflicts.forEach((c: any) => {
          const enemyActive = activeBlueprintMods.find((em: any) => {
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
          const modAMatch = activeBlueprintMods.find((em: any) => {
             if (em.isFallback) return false;
             const cleanN = String(em.name || '').toUpperCase();
             const cleanDisp = String(em.displayName || '').toUpperCase();
             const targetClean = String(lc.modA || lc.mod_a).toUpperCase();
             return cleanN.includes(targetClean) || cleanDisp.includes(targetClean) || targetClean.includes(cleanN);
          });
          const modBMatch = activeBlueprintMods.find((em: any) => {
             if (em.isFallback) return false;
             const cleanN = String(em.name || '').toUpperCase();
             const cleanDisp = String(em.displayName || '').toUpperCase();
             const targetClean = String(lc.modB || lc.mod_b).toUpperCase();
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

      const unresolvedConflicts = conflicts.filter((ac: any) => {
        if (ac.conflict.severity_rank !== 3) return true;
        const prefixA = (ac.modA._originalSetName || ac.modA.name)?.split(/[/\\]/).slice(0, -1).join('/') || "";
        const prefixB = (ac.modB._originalSetName || ac.modB.name)?.split(/[/\\]/).slice(0, -1).join('/') || "";
        const isWinnerA = prefixA.toLowerCase() === "sanctuary";
        const isWinnerB = prefixB.toLowerCase() === "sanctuary";
        return !isWinnerA && !isWinnerB;
      });

      const tier4Count = unresolvedConflicts.filter((c: any) => c.conflict.severity_rank === 4).length;
      const tier3Count = unresolvedConflicts.filter((c: any) => c.conflict.severity_rank !== 4).length;
  
      return { total: unresolvedConflicts.length, tier3: tier3Count, tier4: tier4Count };
  }, [activeBlueprintMods]);

  const radarUpdatesCount = activeUpdates.length || 0;
  const radarTier4Count = activeConflictCount.tier4 || 0;
  const radarTier3Count = activeConflictCount.tier3 || 0;
  const radarBrokenCount = activeBrokenCounts.broken || 0;
  const radarUnstableCount = activeBrokenCounts.unstable || 0;
  
  let radarState = "optimal"; // optimal, update, warning, critical
  if (radarTier4Count > 0 || radarBrokenCount > 0) {
    radarState = "critical";
  } else if (radarTier3Count > 0 || radarUnstableCount > 0) {
    radarState = "warning";
  } else if (radarUpdatesCount > 0) {
    radarState = "update";
  }

  return (
    <div className="flex flex-col gap-8 pb-24 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <ViewHeader title={t("cmd_center_title")} subtitle={t("cmd_center_subtitle")} icon={t("ui_icon_pc")} iconColorClass="text-[var(--accent)] border-[var(--accent)]/30" />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 w-full">
        <DashboardStatTile 
           icon={<span className="material-symbols-outlined !text-4xl">{t("ui_icon_radar3")}</span>} 
           number={
             (radarTier4Count + radarTier3Count + radarBrokenCount + radarUnstableCount) > 0 
               ? (radarTier4Count + radarTier3Count + radarBrokenCount + radarUnstableCount)
               : (radarUpdatesCount > 0 ? radarUpdatesCount : 0)
           }
           label={
             radarState === 'critical' ? (t("radar_crit_fail")) : 
             radarState === 'warning' ? (t("radar_action_rec")) : 
             radarState === 'update' ? (t("radar_updates_avail")) :
             (t("radar_sys_stable"))
           }
           colorClass={
             radarState === 'critical' ? "border-red-500/30 text-red-500 hover:border-red-500 bg-red-500/10 hover:bg-red-500/20" :
             radarState === 'warning' ? "border-amber-500/30 text-amber-500 hover:border-amber-500 bg-amber-500/10 hover:bg-amber-500/20" :
             radarState === 'update' ? "border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]" :
             "border-emerald-500/30 text-emerald-500 hover:border-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20"
           }
           onClick={() => setShowRadarSweepPanel(true)} 
        />
        <DashboardStatTile 
           icon={<span className="material-symbols-outlined !text-4xl">{t("ui_icon_architect")}</span>} 
           number={modList?.length || 0} 
           label={t("dashboard_stat_vault")} 
           colorClass="border-teal-500/30 text-teal-500 hover:border-teal-500 bg-teal-500/10 hover:bg-teal-500/20" 
           onClick={() => { if(setView) setView("vault"); if(setFilterStatus) setFilterStatus("ALL"); }} 
        />
        <DashboardStatTile 
           icon={<span className="material-symbols-outlined !text-4xl">{t("ui_icon_hub")}</span>} 
           number={marketplaceCount} 
           label={t("sidebar_marketplace")} 
           colorClass="border-cyan-500/30 text-cyan-500 hover:border-cyan-500 bg-cyan-500/10 hover:bg-cyan-500/20" 
           onClick={() => { if(setView) setView("marketplace"); }} 
        />
        <DashboardStatTile 
           icon={<span className="material-symbols-outlined !text-4xl">{t("ui_icon_map")}</span>} 
           number={playSets?.length || 0} 
           label={t("dashboard_stat_blueprints")} 
           colorClass="border-blue-500/30 text-blue-500 hover:border-blue-500 bg-blue-500/10 hover:bg-blue-500/20" 
           onClick={() => setIsBlueprintSwapOpen(true)} 
        />
        <DashboardStatTile 
           icon={<span className="material-symbols-outlined !text-4xl">{t("ui_icon_local_activity")}</span>} 
           number={ticketCount} 
           label={t("sidebar_support")} 
           colorClass="border-purple-500/30 text-purple-500 hover:border-purple-500 bg-purple-500/10 hover:bg-purple-500/20" 
           onClick={() => { if(setIsCitizenTicketsOpen) setIsCitizenTicketsOpen(true); }} 
        />
      </div>

      {hasSymlinkPerms === false && (
        <div className="w-full rounded-[2rem] border border-[var(--danger)]/50 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden animate-in fade-in zoom-in-95 duration-500 shadow-[0_0_30px_rgba(var(--danger-rgb),0.1)]" style={{ background: 'linear-gradient(90deg, rgba(var(--danger-rgb),0.05) 0%, rgba(var(--bg-rgb),1) 100%)' }}>
          <div className="absolute left-0 top-0 bottom-0 w-2 bg-[var(--danger)] opacity-80" />
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 w-full z-10 pl-2">
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 rounded-2xl bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] flex items-center justify-center shadow-[0_0_30px_rgba(var(--danger-rgb),0.2)] animate-pulse shrink-0">
                <span className="material-symbols-outlined !text-[32px]">{t("ui_icon_warning")}</span>
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="text-xl font-black uppercase text-[var(--danger)] tracking-widest leading-none drop-shadow-md">{t("cmd_perm_restricted")}</h3>
                <p className="text-xs font-bold text-[var(--subtext)] tracking-wide">{t("cmd_perm_desc")}</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] mt-1">{t("cmd_perm_dev_mode_rec")} - {t("cmd_perm_dev_mode_nav")}</p>
              </div>
            </div>
            
            <div className="flex flex-col gap-2 shrink-0 w-full md:w-auto items-end mt-4 md:mt-0">
              <div className="flex items-stretch gap-3 w-full h-[56px]">
                <button onClick={() => invoke("open_developer_settings")} className="flex-1 md:flex-none px-8 flex items-center justify-center bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_50%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] shadow-[0_0_15px_color-mix(in_srgb,var(--danger)_30%,transparent)] rounded-xl text-[10px] font-black uppercase tracking-widest transition-all text-center backdrop-blur-[3px]">
                  {t("cmd_perm_btn_dev")}
                </button>
                <button onClick={checkPerms} className="px-6 flex items-center justify-center bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_50%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] shadow-[0_0_15px_color-mix(in_srgb,var(--danger)_30%,transparent)] rounded-xl text-xl transition-all backdrop-blur-[3px]">
                  <span className="material-symbols-outlined">{t("ui_icon_refresh")}</span>
                </button>
              </div>
              <p className="text-[9px] text-[var(--subtext)] font-bold tracking-widest text-right mt-1">{t("cmd_perm_admin_rec")} - {t("cmd_perm_admin")}</p>
            </div>
          </div>
        </div>
      )}

      {radarState !== 'optimal' && (() => {
        const alertVar = radarState === 'critical' ? 'var(--danger)' : radarState === 'warning' ? 'var(--warning)' : 'var(--accent)';
        const alertVarRgb = radarState === 'critical' ? 'var(--danger-rgb)' : radarState === 'warning' ? 'var(--warning-rgb)' : 'var(--accent-rgb)';
        const alertIcon = radarState === 'critical' ? 'gpp_bad' : radarState === 'warning' ? 'gpp_maybe' : 'update';
        
        return (
          <div className="w-full rounded-[2rem] border p-6 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden transition-all duration-500" style={{ borderColor: `color-mix(in srgb, ${alertVar} 30%, transparent)`, borderLeftWidth: '8px', borderLeftColor: alertVar, background: `linear-gradient(90deg, rgba(${alertVarRgb},0.05) 0%, rgba(var(--bg-rgb),1) 100%)` }}>
            
            <div className="flex items-center gap-6 z-10 pl-2">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center animate-pulse shrink-0" style={{ backgroundColor: `color-mix(in srgb, ${alertVar} 15%, transparent)`, borderColor: `color-mix(in srgb, ${alertVar} 30%, transparent)`, color: alertVar, borderWidth: '1px', boxShadow: `0 0 30px rgba(${alertVarRgb}, 0.2)` }}>
                <span className="material-symbols-outlined !text-[32px]">{t(`ui_icon_${alertIcon}`) || alertIcon}</span>
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="text-xl font-black uppercase tracking-widest" style={{ color: alertVar }}>
                   {radarState === 'critical' ? (t("cmd_critical_action_short")) :
                    radarState === 'warning' ? (t("cmd_action_suggested")) :
                    (t("cmd_update_suggested"))}
                </h3>
                <p className="text-[10px] font-bold text-[var(--subtext)] uppercase tracking-[0.2em] opacity-80">
                  {radarState === 'critical' ? (t("cmd_action_fatal")) :
                   radarState === 'warning' ? (t("cmd_action_incompatibilities")) :
                   (t("cmd_attention_required"))}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-4 z-10 flex-wrap">
               <button onClick={() => { if(activeUpdates.length > 0) setShowUpdatesModal(true); }} disabled={!(activeUpdates.length > 0)} className={`px-6 py-3 rounded-xl flex items-center gap-3 font-black text-[10px] uppercase tracking-widest transition-all border whitespace-nowrap ${activeUpdates.length > 0 ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_50%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_30%,transparent)]' : 'bg-white/5 border-white/10 text-[var(--subtext)] opacity-50 cursor-not-allowed'}`}>
                 <span className="material-symbols-outlined !text-sm">{t("ui_icon_update")}</span> {activeUpdates.length} {t("cmd_citizen_action_updates")}
               </button>
               <button onClick={() => { if((radarBrokenCount + radarUnstableCount) > 0) setShowIncompatiblePanel(true); }} disabled={(radarBrokenCount + radarUnstableCount) === 0} className={`px-6 py-3 rounded-xl flex items-center gap-3 font-black text-[10px] uppercase tracking-widest transition-all border whitespace-nowrap ${(radarBrokenCount + radarUnstableCount) > 0 ? (radarBrokenCount > 0 ? 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border-[color-mix(in_srgb,var(--danger)_50%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] shadow-[0_0_15px_color-mix(in_srgb,var(--danger)_30%,transparent)]' : 'bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border-[color-mix(in_srgb,var(--warning)_50%,transparent)] text-[var(--warning)] hover:bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] shadow-[0_0_15px_color-mix(in_srgb,var(--warning)_30%,transparent)]') : 'bg-white/5 border-white/10 text-[var(--subtext)] opacity-50 cursor-not-allowed'}`}>
                 <span className="material-symbols-outlined !text-sm">{radarBrokenCount > 0 ? "gpp_bad" : (radarUnstableCount > 0 ? "gpp_maybe" : "warning_amber")}</span> {radarBrokenCount > 0 && radarUnstableCount > 0 ? `${radarBrokenCount} ${t("label_corrupted")} / ${radarUnstableCount} ${t("label_unstable")}` : radarBrokenCount > 0 ? `${radarBrokenCount} ${t("label_corrupted")}` : radarUnstableCount > 0 ? `${radarUnstableCount} ${t("label_unstable")}` : `0 ${t("cmd_citizen_action_incompatible")}`}
               </button>
               <button onClick={() => { if(activeConflictCount.total > 0) setShowConflictsPanel(true); }} disabled={activeConflictCount.total === 0} className={`px-6 py-3 rounded-xl flex items-center gap-3 font-black text-[10px] uppercase tracking-widest transition-all border whitespace-nowrap ${activeConflictCount.total > 0 ? (activeConflictCount.tier4 > 0 ? 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border-[color-mix(in_srgb,var(--danger)_50%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] shadow-[0_0_15px_color-mix(in_srgb,var(--danger)_30%,transparent)]' : 'bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border-[color-mix(in_srgb,var(--warning)_50%,transparent)] text-[var(--warning)] hover:bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] shadow-[0_0_15px_color-mix(in_srgb,var(--warning)_30%,transparent)]') : 'bg-white/5 border-white/10 text-[var(--subtext)] opacity-50 cursor-not-allowed'}`}>
                 <span className="material-symbols-outlined !text-sm">{activeConflictCount.tier4 > 0 ? "crisis_alert" : (activeConflictCount.tier3 > 0 ? "tune" : "radar")}</span> 
                  {activeConflictCount.total > 0 ? (
                    activeConflictCount.tier4 > 0 && activeConflictCount.tier3 > 0 ?
                      `${activeConflictCount.tier4} ${t("hub_stat_tier4")} / ${activeConflictCount.tier3} ${t("hub_stat_tier3")}` :
                    activeConflictCount.tier4 > 0 ? 
                      `${activeConflictCount.tier4} ${t("hub_stat_tier4")}` : 
                      `${activeConflictCount.tier3} ${t("hub_stat_tier3")}`
                  ) : (
                    `${activeConflictCount.total} ${t("cmd_citizen_action_conflicts")}`
                  )}
               </button>
            </div>
          </div>
        );
      })()}

      <div className="flex flex-col lg:flex-row gap-8 w-full">
        <div className="flex-1 flex flex-col gap-6 min-w-0">
           <div className="flex items-center gap-3 mb-6 mt-2">
             <div className="w-12 h-12 rounded-xl theme-glass-inner flex items-center justify-center border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.15)] shrink-0">
               <span className="material-symbols-outlined !text-2xl text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.6)]">{t("ui_icon_broadcast")}</span>
             </div>
             <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] truncate">{t("sidebar_commlink")}</h2>
           </div>
           
           <div className="w-full">
             {session && localStorage.getItem("sanctuary_blacklisted") !== "true" && (
                <MasonFeed onOpenMasonProfile={handleOpenMasonProfile} noCardWrapper={true} gridCols="grid-cols-1 lg:grid-cols-2" />
             )}
             {(!session || localStorage.getItem("sanctuary_blacklisted") === "true") && (
                <div className="w-full p-8 theme-glass-panel border border-white/5 rounded-[2rem] flex flex-col items-center justify-center gap-4 opacity-50 text-center">
                   <span className="material-symbols-outlined !text-4xl">{t("ui_icon_satellite_alt")}</span>
                   <p className="text-sm font-bold uppercase">{t("cmd_login_commlink")}</p>
                </div>
             )}
           </div>
        </div>
         <div className="w-full lg:w-[420px] shrink-0 flex flex-col gap-6">
           <div className="flex items-center gap-3 mb-6 mt-2">
             <div className="w-12 h-12 rounded-xl theme-glass-inner flex items-center justify-center border border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.15)] shrink-0">
               <span className="material-symbols-outlined !text-2xl text-amber-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]">{t("ui_icon_bolt")}</span>
             </div>
             <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] shrink-0">{t("cmd_quick_actions")}</h2>
           </div>

           <div className="flex flex-col gap-4">
             <button onClick={() => runRadarSweep(false)} className="w-full p-6 theme-glass-panel border border-white/5 rounded-[1.5rem] hover:bg-white/5 transition-all text-left group relative overflow-hidden">
               <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 group-hover:-translate-x-full duration-1000 transition-all ease-in-out" />
               <div className="flex items-center gap-5">
                 <div className="w-12 h-12 rounded-xl theme-glass-inner border border-emerald-500/20 flex items-center justify-center shrink-0">
                   <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]">
                     {t("ui_icon_radar3")}
                   </span>
                 </div>
                 <div className="flex flex-col gap-1">
                   <span className="text-xs font-black uppercase tracking-widest text-[var(--text)]">{(t("dashboard_btn_radar")).replace(/^[^\w]*/, '').trim()}</span>
                   <span className="text-[9px] uppercase font-bold text-emerald-500/80 tracking-widest group-hover:text-emerald-400 transition-colors flex items-center gap-2 mt-1">
                     <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span> {t("dashboard_btn_radar_desc")}
                   </span>
                 </div>
               </div>
             </button>

             <button onClick={() => triggerShelter(!shelterActive)} className="w-full p-6 theme-glass-panel border border-white/5 rounded-[1.5rem] hover:bg-white/5 transition-all text-left group relative overflow-hidden">
               <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 group-hover:-translate-x-full duration-1000 transition-all ease-in-out" />
               <div className="flex items-center gap-5">
                 <div className="w-12 h-12 rounded-xl theme-glass-inner border border-cyan-500/20 flex items-center justify-center shrink-0">
                   <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]">
                     {shelterActive ? (t("ui_icon_lock")) : (t("ui_icon_lock_open"))}
                   </span>
                 </div>
                 <div className="flex flex-col gap-1">
                   <span className="text-xs font-black uppercase tracking-widest text-[var(--text)]">{shelterActive ? ((t("dashboard_btn_reclaim")).replace(/^[^\w]*/, '').trim()) : ((t("dashboard_btn_lockdown")).replace(/^[^\w]*/, '').trim())}</span>
                   <span className="text-[9px] uppercase font-bold text-cyan-500/80 tracking-widest group-hover:text-cyan-400 transition-colors flex items-center gap-2 mt-1">
                     <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.8)]"></span> {shelterActive ? (t("dashboard_btn_bunker_unlock_desc")) : (t("dashboard_btn_bunker_lock_desc"))}
                   </span>
                 </div>
               </div>
             </button>

             <button onClick={() => { if(setIsSupportDeskOpen) setIsSupportDeskOpen(true); }} className="w-full p-6 theme-glass-panel border border-white/5 rounded-[1.5rem] hover:bg-white/5 transition-all text-left group relative overflow-hidden">
               <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 group-hover:-translate-x-full duration-1000 transition-all ease-in-out" />
               <div className="flex items-center gap-5">
                 <div className="w-12 h-12 rounded-xl theme-glass-inner border border-rose-500/20 flex items-center justify-center shrink-0">
                   <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 drop-shadow-[0_0_8px_rgba(244,63,94,0.5)]">
                     {t("ui_icon_local_activity")}
                   </span>
                 </div>
                 <div className="flex flex-col gap-1">
                   <span className="text-xs font-black uppercase tracking-widest text-[var(--text)]">{t("dashboard_btn_submit_ticket")}</span>
                   <span className="text-[9px] uppercase font-bold text-purple-500/80 tracking-widest group-hover:text-purple-400 transition-colors flex items-center gap-2 mt-1">
                     <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]"></span> {t("dashboard_btn_submit_ticket_desc")}
                   </span>
                 </div>
               </div>
             </button>
           </div>
         </div>
      </div>

      <SidePanel
        isOpen={showUpdatesModal}
        onClose={() => setShowUpdatesModal(false)}
        title={t("cmd_updates_modal_title")}
        subtitle={t("cmd_system_core")}
        icon={t("ui_icon_update")}
        iconColorClass="text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
        widthClass="w-[550px]"
      >
        <div className="flex flex-col gap-3">
          {activeUpdates.length > 0 ? activeUpdates.map((update: any) => (
              <div key={update.hash || update.name} className="relative shrink-0 group w-full rounded-[2rem] overflow-hidden transition-all duration-500 border flex items-center border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] shadow-lg hover:shadow-[0_0_30px_rgba(var(--accent-rgb),0.2)]">
                <div className="relative p-6 z-10 flex items-center gap-5 w-full">
                  <div className="w-12 h-12 rounded-[1.25rem] flex items-center justify-center shrink-0 border transition-all duration-500 shadow-inner border-[color-mix(in_srgb,var(--accent)_50%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)]">
                    <span className="material-symbols-outlined !text-[24px] text-[var(--accent)]">{t("ui_icon_update")}</span>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex flex-col overflow-hidden">
                        <span className="text-sm font-black uppercase tracking-tight text-[var(--text)] truncate">{update.displayName || update.name}</span>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className="text-[10px] font-bold tracking-widest text-[var(--subtext)] opacity-80 flex items-center">
                             <span className="opacity-50 mr-1">{t("auto_v")}</span>{update.version} <span className="opacity-40 mx-2 text-[8px]">- </span> <span className="theme-text-accent font-black">{t("auto_v")}{update.newVersion}</span>
                          </span>
                          {update.newGameVersion && (
                            <span className="px-2 py-0.5 rounded-md bg-white/5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[8px] font-black uppercase tracking-widest text-[var(--text)] opacity-80 flex items-center gap-1 shadow-sm">
                              <span className="material-symbols-outlined !text-[10px] opacity-70">{t("ui_icon_sports_esports")}</span>
                              {update.newGameVersion}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="shrink-0 ml-4">
                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); openUrl(update.download_url || update.url || `https://www.google.com/search?q=Sims+4+${encodeURIComponent(update.displayName || (update.name || '').split('/').pop() || "")}`); }} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-[0_0_15px_rgba(var(--accent-rgb),0.1)] hover:shadow-[0_0_25px_rgba(var(--accent-rgb),0.2)] flex items-center gap-2 theme-bg-accent/10 border theme-border-accent/30 theme-text-accent hover:theme-bg-accent/20 hover:theme-border-accent/50 backdrop-blur-md active:scale-95`}>
                      {update.download_url || update.url ? (t("dossier_btn_download")) : (t("dossier_btn_search_web"))} <span className="material-symbols-outlined !text-[14px] opacity-70">{update.download_url || update.url ? (t("ui_icon_import")) : (t("ui_icon_search"))}</span>
                    </button>
                  </div>
                </div>
              </div>
          )) : (
          <div className="w-full theme-glass-inner rounded-[1.5rem] p-6 text-center text-[var(--subtext)] opacity-60 text-[10px] font-black uppercase tracking-widest">
            {t("cmd_no_updates")}<br/>
            <span className="opacity-50 text-[8px]">{t("cmd_optimal")}</span>
          </div>
          )}
          <div className="h-32 shrink-0 pointer-events-none" />
        </div>
      </SidePanel>

      {isBlueprintSwapOpen && (
        <BlueprintSwapSidePanel 
           isOpen={isBlueprintSwapOpen} 
           onClose={() => setIsBlueprintSwapOpen(false)} 
        />
      )}

      {showIncompatiblePanel && (
        <CommandIncompatiblePanel
          isOpen={showIncompatiblePanel}
          onClose={() => setShowIncompatiblePanel(false)}
          activeMods={activeBlueprintMods}
          allow_write={!activePlaySet?.read_only}
          toggleInActiveSet={toggleInActiveSet}
        />
      )}

      {showConflictsPanel && (
        <CommandConflictsPanel
          isOpen={showConflictsPanel}
          onClose={() => setShowConflictsPanel(false)}
          activeMods={activeBlueprintMods}
          allow_write={!activePlaySet?.read_only}
          toggleInActiveSet={toggleInActiveSet}
          setBlueprintLoadOrder={setBlueprintLoadOrder}
          vaultPath={modsPath}
          onRefreshMods={runRadarSweep}
        />
      )}

      {showRadarSweepPanel && (
        <CommandRadarSweepPanel
          isOpen={showRadarSweepPanel}
          onClose={() => setShowRadarSweepPanel(false)}
          status={status}
          runRadarSweep={runRadarSweep}
          isScanning={isScanning}
          networkUpdates={{ updated: activeUpdates }}
          tier3Count={activeConflictCount.tier3}
          tier4Count={activeConflictCount.tier4}
          brokenCount={radarBrokenCount}
          unstableCount={radarUnstableCount}
          onOpenUpdates={() => setShowUpdatesModal(true)}
          onOpenConflicts={() => setShowConflictsPanel(true)}
          onOpenIncompatible={() => setShowIncompatiblePanel(true)}
          onOpenHotSwap={() => setIsBlueprintSwapOpen(true)}
        />
      )}

    </div>
  );
}
