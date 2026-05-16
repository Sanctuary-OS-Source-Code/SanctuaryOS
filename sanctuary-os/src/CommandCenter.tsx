import { useState } from "react";
import { useLexicon } from "./LexiconContext";
import { ViewHeader, StatTile } from "./shared";
import MasonFeed from "./MasonFeed";

export default function CommandCenter({
  modList, quarantineList, shelterContents, shelterActive, runRadarSweep, runSanitization, massIngestToCloud, triggerShelter, setView, setFilterStatus, setShowBrokenModal, setShowQuarantineModal, handleOpenMasonProfile, networkUpdates, activePlaySet, playSets
}: any) {
  const { t } = useLexicon();
  const [showUpdatesModal, setShowUpdatesModal] = useState(false);
  
  const activeBlueprintMods = activePlaySet ? modList?.filter((m: any) => {
    return activePlaySet.mods.includes(m.name) || activePlaySet.mods.some((modName: string) => {
      const mBase = m.name.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, '');
      const targetBase = modName.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, '');
      return mBase && targetBase && mBase === targetBase;
    });
  }) : [];

  const activeBrokenCount = activePlaySet ? activeBlueprintMods.filter((m: any) => typeof m?.status === 'string' && m.status.toLowerCase() === 'broken' && m.compliance_tier !== 1 && m.compliance_tier !== 2).length : 0;

  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <ViewHeader title={t("cmd_center_title") || "COMMAND CENTER"} subtitle={t("cmd_center_subtitle") || "ACTIVE DEPLOYMENT HUB"} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatTile label={`${t("dashboard_stat_collection") || "YOUR COLLECTION"} (${shelterContents?.length || 0} ${t("dashboard_stat_secured") || "SECURED"})`} value={modList?.length || 0} icon={t("ui_icon_collection") || ""} color="theme-panel-info" onClick={() => { if(setView) setView("vault"); if(setFilterStatus) setFilterStatus("ALL"); }} />
        <StatTile label={t("dashboard_stat_verified") || "VERIFIED SAFE"} value={modList?.filter((m: any) => m?.status === (t("status_verified") || "Verified") && m.compliance_tier !== 1 && m.compliance_tier !== 2).length || 0} icon={t("ui_icon_verified") || ""} color="theme-panel-info" accent="theme-text-info" onClick={() => { if(setView) setView("vault"); if(setFilterStatus) setFilterStatus("VERIFIED"); }} />
        <StatTile label={t("dashboard_stat_updates") || "UPDATES AVAILABLE"} value={networkUpdates?.updated?.length || 0} icon={t("ui_icon_refresh") || ""} color="theme-panel-info" accent="theme-text-info" onClick={() => setShowUpdatesModal(true)} />
        <StatTile label={t("dashboard_stat_blueprints") || "BLUEPRINTS"} value={playSets?.length || 0} icon={t("ui_icon_blueprints") || ""} color="theme-panel-info" accent="theme-text-info" onClick={() => { if(setView) setView("playsets"); }} />
      </div>

      {((networkUpdates?.updated?.length || 0) > 0 || activeBrokenCount > 0) && (
        <div className="theme-glass-panel border-2 border-[var(--warning)]/50 rounded-[2rem] p-6 shadow-[0_0_20px_rgba(var(--warning-rgb),0.1)]">
          <div className="flex items-center gap-4 mb-4">
            <span className="w-10 h-10 rounded-full theme-bg-warning text-[var(--bg)] flex items-center justify-center font-black text-xl shadow-[0_0_15px_rgba(var(--warning-rgb),0.5)] animate-pulse">!</span>
            <div>
              <h3 className="text-xl font-black uppercase text-[var(--warning)] tracking-widest">Citizen Action Suggested</h3>
              <p className="text-[10px] font-bold text-[var(--subtext)] uppercase tracking-widest opacity-80">Attention required for active blueprint parameters</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <div onClick={() => { if(setView) setView("playsets"); }} className={`cursor-pointer bg-black/40 border border-white/5 rounded-xl p-4 flex flex-col items-center justify-center gap-2 ${activeBrokenCount > 0 ? 'hover:border-red-500/50 transition-colors' : 'opacity-30'}`}>
              <span className="text-2xl opacity-80 theme-text-danger">{t("ui_icon_broken") || "⚠️"}</span>
              <span className="text-xl font-black text-[var(--text)]">{activeBrokenCount}</span>
              <span className="text-[9px] uppercase font-bold text-[var(--subtext)] tracking-widest text-center">Incompatible / Broken</span>
            </div>
            <div onClick={() => setShowUpdatesModal(true)} className={`cursor-pointer bg-black/40 border border-white/5 rounded-xl p-4 flex flex-col items-center justify-center gap-2 ${(networkUpdates?.updated?.length || 0) > 0 ? 'hover:theme-border-warning transition-colors' : 'opacity-30'}`}>
              <span className="text-2xl opacity-80 theme-text-warning">{t("ui_icon_refresh") || "🔄"}</span>
              <span className="text-xl font-black text-[var(--text)]">{networkUpdates?.updated?.length || 0}</span>
              <span className="text-[9px] uppercase font-bold text-[var(--subtext)] tracking-widest text-center">Updates Available</span>
            </div>
            <div onClick={() => { if(setView) setView("playsets"); }} className="cursor-pointer bg-black/40 border border-white/5 rounded-xl p-4 flex flex-col items-center justify-center gap-2 hover:theme-border-info transition-colors">
              <span className="text-2xl theme-text-info">{t("ui_icon_conflict") || "⚔️"}</span>
              <span className="text-[10px] font-black text-[var(--text)] uppercase tracking-widest text-center mt-2">Scan Now</span>
              <span className="text-[9px] uppercase font-bold text-[var(--subtext)] tracking-widest text-center">Load Order Conflicts</span>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col lg:grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <MasonFeed onOpenMasonProfile={handleOpenMasonProfile} />
        </div>

        <div className="flex-1 bg-white/5 backdrop-blur-md border border-white/10 p-8 rounded-3xl flex flex-col gap-4 min-w-[300px]">
          <h3 className="text-xl font-bold text-[var(--text)] mb-2">{t("dashboard_quick_actions") || "Quick Actions"}</h3>
          
          <button onClick={() => runRadarSweep(false)} className="w-full py-4 rounded-2xl theme-glass-inner border border-white/5 hover:border-white/20 hover:theme-border-accent text-[var(--text)] text-xs uppercase font-black tracking-widest transition-all duration-300 hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-3">{t("dashboard_btn_radar") || " RADAR SWEEP"}</button>
          <button onClick={() => triggerShelter(!shelterActive)} className={`w-full py-4 rounded-2xl theme-glass-inner border border-white/5 hover:border-white/20 hover:theme-border-accent text-[var(--text)] text-xs uppercase font-black tracking-widest flex items-center justify-center gap-3 transition-all duration-300 hover:scale-[1.02] active:scale-95 ${shelterActive ? 'theme-text-danger' : 'theme-text-success'}`}>{shelterActive ? (t("dashboard_btn_reclaim") || " RECLAIM BUNKER") : (t("dashboard_btn_lockdown") || " LOCKDOWN BUNKER")}</button>
        </div>
      </div>

      {showUpdatesModal && (
        <div className="fixed inset-0 z-[9999] bg-[var(--bg)]/40 backdrop-blur-2xl flex items-center justify-center p-8 animate-in fade-in duration-300">
          <div className="theme-glass-panel border-2 theme-border-warning p-8 rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col gap-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-2xl font-black uppercase tracking-widest flex items-center gap-3"><span className="text-3xl">{t("ui_icon_refresh") || "🔄"}</span> UPDATES AVAILABLE</h2>
            <div className="bg-black/20 p-4 rounded-xl max-h-[40vh] overflow-y-auto custom-scrollbar flex flex-col gap-2">
              {networkUpdates?.updated && networkUpdates.updated.length > 0 ? networkUpdates.updated.map((update: any) => (
                  <div key={update.hash || update.name} className="theme-glass-inner p-4 rounded-xl flex items-center justify-between border border-white/5">
                    <div className="flex flex-col overflow-hidden">
                      <span className="text-[10px] font-black uppercase text-[var(--text)] truncate">{update.displayName || update.name}</span>
                      <span className="text-[8px] font-bold text-[var(--subtext)] opacity-60">Version {update.version}</span>
                    </div>
                  </div>
              )) : (
                  <div className="text-[10px] font-black uppercase text-[var(--subtext)] opacity-40 text-center py-4 border border-dashed border-white/10 rounded-xl">NO UPDATES DETECTED</div>
              )}
            </div>
            <div className="flex justify-end gap-4 mt-4">
              <button onClick={() => setShowUpdatesModal(false)} className="px-8 h-12 theme-btn-standard text-[var(--text)] font-black text-xs tracking-widest rounded-2xl transition-colors">CLOSE</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
