import React from "react";
import { SidePanel } from "./shared";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import { useTheme } from "./ThemeContext";

export default function CommandRadarSweepPanel({
  isOpen, onClose, status, runRadarSweep, isScanning, networkUpdates, tier3Count = 0, tier4Count = 0, incompatibleCount = 0
}: any) {
  const { t, registry } = useLexicon();
  const { customThemes, CORE_THEMES } = useTheme();
  const { modList, playSets, activeSetName } = useStore();
  
  const activeSet = React.useMemo(() => playSets.find((ps: any) => ps.name === activeSetName) || null, [playSets, activeSetName]);
  
  const relevantMods = React.useMemo(() => {
    if (!activeSet || !activeSet.mods) return modList || [];
    return (modList || []).filter((m: any) => activeSet.mods.includes(m.name));
  }, [modList, activeSet]);

  const verifiedCount = React.useMemo(() => relevantMods.filter((m: any) => m.status === t("status_verified") || String(m.status).toLowerCase() === 'verified').length, [relevantMods, t]);
  const unverifiedCount = React.useMemo(() => relevantMods.filter((m: any) => m.status === t("status_unverified") || String(m.status).toLowerCase() === 'unverified' || !m.status).length, [relevantMods, t]);
  const lexiconCount = React.useMemo(() => Object.keys(registry || {}).length + 3, [registry]);
  const chameleonCount = React.useMemo(() => Object.keys(customThemes || {}).length + Object.keys(CORE_THEMES || {}).length, [customThemes, CORE_THEMES]);
  
  const [localLastScan, setLocalLastScan] = React.useState<number | null>(() => {
    const saved = localStorage.getItem("sanctuary_last_radar_scan");
    return saved ? parseInt(saved, 10) : null;
  });

  React.useEffect(() => {
    if (isScanning) {
       // When it starts scanning, we wait for it to stop
    } else if (isOpen && localLastScan === null) {
       // Initial state
    }
  }, [isScanning]);

  const previousIsScanning = React.useRef(isScanning);
  React.useEffect(() => {
    if (previousIsScanning.current === true && isScanning === false) {
      const now = Date.now();
      setLocalLastScan(now);
      localStorage.setItem("sanctuary_last_radar_scan", String(now));
    }
    previousIsScanning.current = isScanning;
  }, [isScanning]);

  if (!isOpen) return null;

  const updatesCount = networkUpdates?.updated?.length || 0;
  let radarState = "optimal";
  if (tier4Count > 0) {
    radarState = "critical";
  } else if (tier3Count > 0 || incompatibleCount > 0 || updatesCount > 0) {
    radarState = "warning";
  }

  const colorCls = radarState === "critical" ? "red" : radarState === "warning" ? "amber" : "emerald";

  const topTitle = t("radar_sweep_complete") || "RADAR SWEEP COMPLETE";
  let subtext = t("radar_sys_stable") || "System Stable";
  if (radarState === "critical") {
    subtext = `${t("radar_crit_fail") || "critical failures detected."}`;
  } else if (radarState === "warning") {
    if (updatesCount > 0 && tier3Count === 0 && incompatibleCount === 0) {
      subtext = `${t("radar_updates_det") || "artifact updates detected."}`;
    } else {
      subtext = `${t("radar_sys_comp") || "system stability compromised."}`;
    }
  }

  const breakdownText = `${updatesCount} ${t("cmd_citizen_action_updates") || "updates"} • ${tier3Count + tier4Count} ${t("dashboard_stat_conflicts") || "conflict"} • ${incompatibleCount} ${t("cmd_citizen_action_incompatible") || "incompatible"}`;

  const bottomText = radarState === "critical"
    ? (t("radar_crash_likely") || "Game Crash Likely")
    : radarState === "optimal"
    ? (t("radar_no_crash") || "No Game Crashing / Glitching loadouts")
    : (t("radar_sys_sub_stable") || "Vault scan finished. Review recommended actions below.");

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("dashboard_btn_radar") || "RADAR SWEEP"}
      subtitle={t("cmd_system_core") || "System Core & Sub-Systems"}
      icon={t("ui_icon_radar3") || "satellite_alt"}
      iconColorClass={`text-${colorCls}-500`}
      widthClass="w-[450px]"
    >
      <div className="flex-1 min-h-0 flex flex-col gap-6 w-full p-4 overflow-y-auto custom-scrollbar">
        
        {/* Main Status Card */}
        <div className={`theme-glass-panel rounded-[2rem] p-8 relative overflow-hidden group border border-${colorCls}-500/20 shadow-xl`}>
          <div className={`absolute inset-0 bg-gradient-to-br from-${colorCls}-500/10 via-transparent to-transparent opacity-50`} />
          <div className="relative z-10 flex flex-col items-center text-center">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center border border-${colorCls}-500/30 bg-${colorCls}-500/10 mb-6 shadow-[0_0_30px_rgba(var(--${colorCls}-rgb),0.2)] ${isScanning ? 'animate-pulse' : ''}`}>
               <span className={`material-symbols-outlined !text-4xl text-${colorCls}-400 ${isScanning ? 'animate-spin' : ''}`}>{t("ui_icon_radar3") || "satellite_alt"}</span>
            </div>
            <h3 className={`text-xl font-black uppercase tracking-tighter text-${colorCls}-500 mb-1 flex flex-col gap-1`}>
              {isScanning ? (t("cmd_scanning") || "SCANNING...") : topTitle}
              {!isScanning && <span className="text-sm opacity-80">{subtext}</span>}
            </h3>
            <span className={`text-[10px] font-bold uppercase tracking-widest text-${colorCls}-500/80 mt-3`}>
              {breakdownText}
            </span>
            {radarState === "critical" ? (
              <div className="mt-4 px-4 py-1.5 bg-red-500/20 border border-red-500/50 rounded-xl animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.4)]">
                <span className="text-xs font-black uppercase tracking-[0.2em] text-red-400 drop-shadow-md">
                  {bottomText}
                </span>
              </div>
            ) : (
              <span className={`text-xs font-bold mt-2 opacity-70`}>
                {bottomText}
              </span>
            )}
          </div>
        </div>

        {/* Domains */}
        <div className="flex flex-col gap-8">
          {/* Core Status */}
          <div className="flex flex-col gap-3">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60 ml-2">{t("radar_domain_core") || "Core Status"}</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="theme-glass-inner p-4 rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] flex flex-col items-center justify-center text-center gap-1">
                 <span className="material-symbols-outlined !text-lg opacity-50">{t("ui_icon_time") || "schedule"}</span>
                 <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60">{t("dashboard_stat_last_scan") || "LAST SWEEP"}</span>
                 <span className="text-sm font-black uppercase text-[var(--text)]">
                    {localLastScan ? new Date(localLastScan).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (status?.last_scan ? new Date(status.last_scan * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "N/A")}
                 </span>
              </div>
              <div className="theme-glass-inner p-4 rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] flex flex-col items-center justify-center text-center gap-1">
                 <span className="material-symbols-outlined !text-lg opacity-50">{t("ui_icon_update") || "update"}</span>
                 <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60">{t("cmd_citizen_action_updates") || "UPDATES"}</span>
                 <span className="text-sm font-black uppercase text-[var(--text)]">{updatesCount}</span>
              </div>
              <div className="theme-glass-inner p-4 rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] flex flex-col items-center justify-center text-center gap-1 col-span-2">
                 <span className="material-symbols-outlined !text-lg opacity-50">{t("ui_icon_map") || "map"}</span>
                 <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60">{t("dashboard_stat_blueprints") || "ACTIVE BLUEPRINTS"}</span>
                 <span className="text-sm font-black uppercase text-[var(--text)]">{playSets?.length || 0}</span>
              </div>
            </div>
          </div>

          {/* Vault Integrity */}
          <div className="flex flex-col gap-3">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60 ml-2">{t("radar_domain_vault") || "Vault Integrity"}</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="theme-glass-inner p-4 rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] flex flex-col items-center justify-center text-center gap-1 col-span-2">
                 <span className="material-symbols-outlined !text-lg opacity-50">{t("ui_icon_architect") || "architect"}</span>
                 <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60">{t("dashboard_stat_collection") || "TOTAL ARTIFACTS"}</span>
                 <span className="text-sm font-black uppercase text-[var(--text)]">{relevantMods.length}</span>
              </div>
              <div className="theme-glass-inner p-4 rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] flex flex-col items-center justify-center text-center gap-1">
                 <span className="material-symbols-outlined !text-lg opacity-50 theme-text-success">verified</span>
                 <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60">{t("status_verified") || "VERIFIED"}</span>
                 <span className="text-sm font-black uppercase text-[var(--text)]">{verifiedCount}</span>
              </div>
              <div className="theme-glass-inner p-4 rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] flex flex-col items-center justify-center text-center gap-1">
                 <span className="material-symbols-outlined !text-lg opacity-50 theme-text-warning">help</span>
                 <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60">{t("status_unverified") || "UNVERIFIED"}</span>
                 <span className="text-sm font-black uppercase text-[var(--text)]">{unverifiedCount}</span>
              </div>
            </div>
          </div>

          {/* Extensions */}
          <div className="flex flex-col gap-3">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60 ml-2">{t("radar_domain_ext") || "Extensions"}</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="theme-glass-inner p-4 rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] flex flex-col items-center justify-center text-center gap-1">
                 <span className="material-symbols-outlined !text-lg opacity-50">{t("ui_icon_language") || "translate"}</span>
                 <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60">{t("settings_tab_lexicon") || "LEXICONS"}</span>
                 <span className="text-sm font-black uppercase text-[var(--text)]">{lexiconCount}</span>
              </div>
              <div className="theme-glass-inner p-4 rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] flex flex-col items-center justify-center text-center gap-1">
                 <span className="material-symbols-outlined !text-lg opacity-50">{t("ui_icon_theme") || "palette"}</span>
                 <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60">{t("settings_tab_chameleon") || "CHAMELEONS"}</span>
                 <span className="text-sm font-black uppercase text-[var(--text)]">{chameleonCount}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Manual Trigger */}
        <button 
          onClick={() => { if(!isScanning && runRadarSweep) runRadarSweep(); }}
          disabled={isScanning}
          className={`mt-4 w-full p-5 rounded-2xl flex items-center justify-center gap-3 font-black text-xs uppercase tracking-widest transition-all border ${
            isScanning 
              ? 'bg-white/5 border-white/10 text-[var(--subtext)] opacity-50 cursor-not-allowed' 
              : `bg-${colorCls}-500/10 border-${colorCls}-500/30 text-${colorCls}-400 hover:bg-${colorCls}-500/20 hover:border-${colorCls}-500/50 shadow-[0_0_15px_rgba(var(--${colorCls}-rgb),0.1)] hover:shadow-[0_0_25px_rgba(var(--${colorCls}-rgb),0.2)]`
          }`}
        >
          <span className={`material-symbols-outlined !text-lg ${isScanning ? 'animate-spin' : ''}`}>{t("ui_icon_radar") || "sync"}</span>
          {isScanning ? (t("cmd_scanning") || "SCANNING...") : (t("dashboard_btn_radar") || "INITIATE SWEEP")}
        </button>

      </div>
    </SidePanel>
  );
}
