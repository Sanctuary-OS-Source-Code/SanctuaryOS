import { useLexicon } from "./LexiconContext";
import { ViewHeader, StatTile } from "./shared";
import MasonFeed from "./MasonFeed";

export default function CommandCenter({
  modList, quarantineList, shelterContents, shelterActive, runRadarSweep, runSanitization, massIngestToCloud, triggerShelter, setView, setFilterStatus, setShowBrokenModal, setShowQuarantineModal, handleOpenMasonProfile, networkUpdates
}: any) {
  const { t } = useLexicon();
  
  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <ViewHeader title={t("cmd_center_title") || "COMMAND CENTER"} subtitle={t("cmd_center_subtitle") || "ACTIVE DEPLOYMENT HUB"} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatTile label={`${t("dashboard_stat_collection") || "YOUR COLLECTION"} (${shelterContents?.length || 0} ${t("dashboard_stat_secured") || "SECURED"})`} value={modList?.length || 0} icon={t("ui_icon_collection") || ""} color="border-white/20" onClick={() => { if(setView) setView("vault"); if(setFilterStatus) setFilterStatus("ALL"); }} />
        <StatTile label={t("dashboard_stat_verified") || "VERIFIED SAFE"} value={modList?.filter((m: any) => m?.status === (t("status_verified") || "Verified") && m.compliance_tier !== 1 && m.compliance_tier !== 2).length || 0} icon={t("ui_icon_verified") || ""} color="theme-panel-success" accent="theme-text-success" onClick={() => { if(setView) setView("vault"); if(setFilterStatus) setFilterStatus("VERIFIED"); }} />
        <StatTile label={t("dashboard_stat_broken") || "BROKEN"} value={(modList?.filter((m: any) => typeof m?.status === 'string' && m.status.toLowerCase() === 'broken' && m.compliance_tier !== 1 && m.compliance_tier !== 2).length || 0)} icon={t("ui_icon_warning") || ""} color="theme-panel-warning" accent="theme-text-warning" onClick={() => { if(setShowBrokenModal) setShowBrokenModal(true); }} />
        <StatTile label={t("dashboard_stat_quarantine") || "QUARANTINED"} value={quarantineList?.length || 0} icon={t("ui_icon_broken") || ""} color="theme-panel-danger" accent="theme-text-danger" onClick={() => { if(setShowQuarantineModal) setShowQuarantineModal(true); }} />
      </div>

      <div className="flex flex-col lg:grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <MasonFeed onOpenMasonProfile={handleOpenMasonProfile} />
        </div>

        <div className="flex-1 bg-white/5 backdrop-blur-md border border-white/10 p-8 rounded-3xl flex flex-col gap-4 min-w-[300px]">
          <h3 className="text-xl font-bold text-[var(--text)] mb-2">{t("dashboard_quick_actions") || "Quick Actions"}</h3>
          
          <button onClick={() => runRadarSweep(false)} className="w-full py-4 rounded-2xl theme-glass-inner border border-white/5 hover:border-white/20 hover:theme-border-accent text-[var(--text)] text-xs uppercase font-black tracking-widest transition-all duration-300 hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-3">{t("dashboard_btn_radar") || " RADAR SWEEP"}</button>
          <button onClick={() => triggerShelter(!shelterActive)} className={`w-full py-4 rounded-2xl theme-glass-inner border border-white/5 hover:border-white/20 hover:theme-border-accent text-[var(--text)] text-xs uppercase font-black tracking-widest flex items-center justify-center gap-3 transition-all duration-300 hover:scale-[1.02] active:scale-95 ${shelterActive ? 'theme-text-danger' : 'theme-text-success'}`}>{shelterActive ? (t("dashboard_btn_reclaim") || " RECLAIM BUNKER") : (t("dashboard_btn_lockdown") || " LOCKDOWN BUNKER")}</button>
            
          <h3 className="text-xl font-bold text-[var(--text)] mb-2 mt-6 uppercase tracking-widest">Updates Available</h3>
          <div className="flex flex-col gap-2 max-h-[30vh] overflow-y-auto custom-scrollbar pr-2">
            {networkUpdates && networkUpdates.length > 0 ? networkUpdates.map((update: any) => (
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
        </div>
      </div>          
    </div>
  );
}
