import { useLexicon } from "./LexiconContext";
import { ViewHeader, StatTile } from "./shared";
import MasonFeed from "./MasonFeed";

export default function CommandCenter({
  modList, quarantineList, shelterContents, shelterActive, runRadarSweep, runSanitization, massIngestToCloud, triggerShelter, setView, setFilterStatus, setShowBrokenModal, setShowQuarantineModal, handleOpenMasonProfile
}: any) {
  const { t } = useLexicon();
  
  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <ViewHeader title={t("cmd_center_title") || "COMMAND CENTER"} subtitle={t("cmd_center_subtitle") || "ACTIVE DEPLOYMENT HUB"} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatTile label={`${t("dashboard_stat_collection") || "YOUR COLLECTION"} (${shelterContents?.length || 0} ${t("dashboard_stat_secured") || "SECURED"})`} value={modList?.length || 0} icon={t("ui_icon_collection") || ""} color="border-white/20" onClick={() => { if(setView) setView("vault"); if(setFilterStatus) setFilterStatus("ALL"); }} />
        <StatTile label={t("dashboard_stat_verified") || "VERIFIED SAFE"} value={modList?.filter((m: any) => m?.status === (t("status_verified") || "Verified")).length || 0} icon={t("ui_icon_verified") || ""} color="theme-panel-success" accent="theme-text-success" onClick={() => { if(setView) setView("vault"); if(setFilterStatus) setFilterStatus("VERIFIED"); }} />
        <StatTile label={t("dashboard_stat_broken") || "BROKEN"} value={(modList?.filter((m: any) => m?.status === (t("status_broken") || "Broken")).length || 0)} icon={t("ui_icon_warning") || ""} color="theme-panel-warning" accent="theme-text-warning" onClick={() => { if(setShowBrokenModal) setShowBrokenModal(true); }} />
        <StatTile label={t("dashboard_stat_quarantine") || "QUARANTINED"} value={quarantineList?.length || 0} icon={t("ui_icon_broken") || ""} color="theme-panel-danger" accent="theme-text-danger" onClick={() => { if(setShowQuarantineModal) setShowQuarantineModal(true); }} />
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-[2]">
          <MasonFeed onOpenMasonProfile={handleOpenMasonProfile} />
        </div>

          <div className="flex-1 bg-white/5 backdrop-blur-md border border-white/10 p-8 rounded-3xl flex flex-col gap-4 min-w-[300px]">
          <h3 className="text-xl font-bold text-[var(--text)] mb-2">{t("dashboard_quick_actions") || "Quick Actions"}</h3>
          
          <button onClick={() => runRadarSweep(false)} className="w-full py-4 rounded-2xl theme-glass-inner border border-white/5 hover:border-white/20 hover:theme-border-accent text-[var(--text)] text-xs uppercase font-black tracking-widest transition-all duration-300 hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-3">{t("dashboard_btn_radar") || " RADAR SWEEP"}</button>
          <button onClick={() => triggerShelter(!shelterActive)} className={`w-full py-4 rounded-2xl theme-glass-inner border border-white/5 hover:border-white/20 hover:theme-border-accent text-[var(--text)] text-xs uppercase font-black tracking-widest flex items-center justify-center gap-3 transition-all duration-300 hover:scale-[1.02] active:scale-95 ${shelterActive ? 'theme-text-danger' : 'theme-text-success'}`}>{shelterActive ? (t("dashboard_btn_reclaim") || " RECLAIM BUNKER") : (t("dashboard_btn_lockdown") || " LOCKDOWN BUNKER")}</button>
        </div>
      </div>          
    </div>
  );
}
