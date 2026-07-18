import React from "react";
import { SidePanel } from "../shared";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { useTheme } from "../ThemeContext";

export default function CommandRadarSweepPanel({
  isOpen, onClose, status, runRadarSweep, isScanning, networkUpdates, tier3Count = 0, tier4Count = 0, brokenCount = 0, unstableCount = 0,
  onOpenUpdates, onOpenConflicts, onOpenIncompatible, onOpenHotSwap
}: any) {
  const { t, registry } = useLexicon();
  const { customThemes, CORE_THEMES } = useTheme();
  const { modList, playSets, activeSetName } = useStore();
  
  const activeSet = React.useMemo(() => playSets.find((ps: any) => ps.name === activeSetName) || null, [playSets, activeSetName]);
  
  const relevantMods = React.useMemo(() => {
    if (!activeSet || !activeSet.mods) return modList || [];
    return (modList || []).filter((m: any) => activeSet.mods.includes(m.name));
  }, [modList, activeSet]);

  const verifiedCount = React.useMemo(() => relevantMods.filter((m: any) => m.status === t("verified") || String(m.status).toLowerCase() === 'verified').length, [relevantMods, t]);
  const unverifiedCount = React.useMemo(() => relevantMods.filter((m: any) => m.status === t("unverified") || String(m.status).toLowerCase() === 'unverified' || !m.status).length, [relevantMods, t]);
  const lexiconCount = React.useMemo(() => Object.keys(registry || {}).length + 3, [registry]);
  const chameleonCount = React.useMemo(() => Object.keys(customThemes || {}).length + Object.keys(CORE_THEMES || {}).length, [customThemes, CORE_THEMES]);
  
  const [localLastScan, setLocalLastScan] = React.useState<number | null>(() => {
    const saved = localStorage.getItem("sanctuary_last_radar_scan");
    return saved ? parseInt(saved, 10) : null;
  });

  React.useEffect(() => {
    if (isScanning) {
    } else if (isOpen && localLastScan === null) {
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
  if (tier4Count > 0 || brokenCount > 0) {
    radarState = "critical";
  } else if (tier3Count > 0 || unstableCount > 0) {
    radarState = "warning";
  } else if (updatesCount > 0) {
    radarState = "update";
  }

  const isUpdate = radarState === "update";
  const colorCls = radarState === "critical" ? "red" : radarState === "warning" ? "amber" : radarState === "update" ? "blue" : "emerald";

  const c_iconColor = isUpdate ? "text-[var(--accent)]" : `text-${colorCls}-500`;
  const c_panelBorder = isUpdate ? "border-[color-mix(in_srgb,var(--accent)_20%,transparent)]" : `border-${colorCls}-500/20`;
  const c_bgGradient = isUpdate ? "from-[color-mix(in_srgb,var(--accent)_10%,transparent)]" : `from-${colorCls}-500/10`;
  const c_ringBorder = isUpdate ? "border-[color-mix(in_srgb,var(--accent)_30%,transparent)]" : `border-${colorCls}-500/30`;
  const c_ringBg = isUpdate ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]" : `bg-${colorCls}-500/10`;
  const c_ringShadow = isUpdate ? "shadow-[0_0_30px_color-mix(in_srgb,var(--accent)_20%,transparent)]" : `shadow-[0_0_30px_rgba(var(--${colorCls}-rgb),0.2)]`;
  const c_ringIcon = isUpdate ? "text-[color-mix(in_srgb,var(--accent)_80%,transparent)]" : `text-${colorCls}-400`;
  const c_titleText = isUpdate ? "text-[var(--accent)]" : `text-${colorCls}-500`;
  const c_subText = isUpdate ? "text-[color-mix(in_srgb,var(--accent)_80%,transparent)]" : `text-${colorCls}-500/80`;
  const c_btnClass = isUpdate
    ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[color-mix(in_srgb,var(--accent)_80%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_10%,transparent)] hover:shadow-[0_0_25px_color-mix(in_srgb,var(--accent)_20%,transparent)]"
    : `bg-${colorCls}-500/10 border-${colorCls}-500/30 text-${colorCls}-400 hover:bg-${colorCls}-500/20 hover:border-${colorCls}-500/50 shadow-[0_0_15px_rgba(var(--${colorCls}-rgb),0.1)] hover:shadow-[0_0_25px_rgba(var(--${colorCls}-rgb),0.2)]`;

  const topTitle = t("optimal");
  let subtext = t("sys_stable");
  if (radarState === "critical") {
    subtext = `${t("crit_fail")}`;
  } else if (radarState === "warning") {
    subtext = `${t("sys_comp")}`;
  } else if (radarState === "update") {
    subtext = `${t("updates_det")}`;
  }

  const breakdownText = `${updatesCount} ${t("updates_modal_title")} • ${tier3Count + tier4Count} ${t("tab_matrix")} • ${brokenCount + unstableCount} ${t("citizen_action_incompatible")}`;

  const bottomText = radarState === "critical"
    ? (t("crash_likely"))
    : radarState === "optimal"
    ? (t("no_crash"))
    : (t("sys_sub_stable"));

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("btn_radar")}
      subtitle={t("system_core")}
      icon={t("icon_radar")}
      iconColorClass={c_iconColor}
      widthClass="w-[625px]"
    >
      <div className="flex-1 min-h-0 flex flex-col gap-6 w-full p-4 overflow-y-auto custom-scrollbar">
        
        <div className={`theme-glass-panel rounded-[var(--radius)] p-8 py-10 relative overflow-hidden group border ${c_panelBorder} shadow-xl flex flex-col justify-center shrink-0`}>
          <div className={`absolute inset-0 bg-gradient-to-br ${c_bgGradient} via-transparent to-transparent opacity-50`} />
          <div className="relative z-10 flex flex-col items-center text-center">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center border ${c_ringBorder} ${c_ringBg} mb-6 ${c_ringShadow} ${isScanning ? 'animate-pulse' : ''}`}>
               <span className={`material-symbols-outlined !text-4xl ${c_ringIcon} ${isScanning ? 'animate-spin' : ''}`}>{t("icon_radar")}</span>
            </div>
            <h3 className={`text-xl font-black uppercase tracking-tighter ${c_titleText} mb-1 flex flex-col gap-1`}>
              {isScanning ? (t("scanning")) : topTitle}
              {!isScanning && <span className="text-sm opacity-80">{subtext}</span>}
            </h3>
            <span className={`text-[10px] font-bold uppercase tracking-widest ${c_subText} mt-3`}>
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


        <div className="flex flex-col gap-8">

          <div className="flex flex-col gap-3">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60 ml-2">{t("citizen_action_required")}</h4>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={onOpenUpdates} className={`theme-glass-inner p-4 rounded-2xl border flex flex-col items-center justify-center text-center gap-1 cursor-pointer hover:scale-[1.02] active:scale-95 transition-all ${updatesCount > 0 ? '!border-[color-mix(in_srgb,var(--accent)_30%,transparent)] !bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:!bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:bg-white/5'}`}>
                 <span className={`material-symbols-outlined !text-lg opacity-50 ${updatesCount > 0 ? 'theme-text-accent' : ''}`}>{t("icon_update")}</span>
                 <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60">{t("updates_modal_title")}</span>
                 <span className="text-sm font-black uppercase text-[var(--text)]">{updatesCount}</span>
              </button>
              <button onClick={onOpenIncompatible} className={`theme-glass-inner p-4 rounded-2xl border flex flex-col items-center justify-center text-center gap-1 cursor-pointer hover:scale-[1.02] active:scale-95 transition-all ${(brokenCount + unstableCount) > 0 ? (brokenCount > 0 ? '!border-[color-mix(in_srgb,var(--danger)_30%,transparent)] !bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:!bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] shadow-[0_0_20px_color-mix(in_srgb,var(--danger)_15%,transparent)]' : '!border-[color-mix(in_srgb,var(--warning)_30%,transparent)] !bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] hover:!bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] shadow-[0_0_20px_color-mix(in_srgb,var(--warning)_15%,transparent)]') : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:bg-white/5'}`}>
                 <span className={`material-symbols-outlined !text-lg opacity-50 ${(brokenCount + unstableCount) > 0 ? (brokenCount > 0 ? 'theme-text-danger' : 'theme-text-warning') : ''}`}>{brokenCount > 0 ? "gpp_bad" : (unstableCount > 0 ? "gpp_maybe" : "warning_amber")}</span>
                 <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60">
                   {brokenCount > 0 && unstableCount > 0 ? `${t("status_broken")} / ${t("label_unstable")}` : brokenCount > 0 ? (t("status_broken")) : (unstableCount > 0 ? (t("label_unstable")) : (t("citizen_action_incompatible")))}
                 </span>
                 <span className="text-sm font-black uppercase text-[var(--text)]">
                   {brokenCount > 0 && unstableCount > 0 ? `${brokenCount} / ${unstableCount}` : brokenCount + unstableCount}
                 </span>
              </button>
              <button onClick={onOpenConflicts} className={`theme-glass-inner p-4 rounded-2xl border flex flex-col items-center justify-center text-center gap-1 col-span-2 cursor-pointer hover:scale-[1.02] active:scale-95 transition-all ${(tier4Count + tier3Count) > 0 ? (tier4Count > 0 ? '!border-[color-mix(in_srgb,var(--danger)_30%,transparent)] !bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:!bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] shadow-[0_0_20px_color-mix(in_srgb,var(--danger)_15%,transparent)]' : '!border-[color-mix(in_srgb,var(--warning)_30%,transparent)] !bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] hover:!bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] shadow-[0_0_20px_color-mix(in_srgb,var(--warning)_15%,transparent)]') : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:bg-white/5'}`}>
                 <span className={`material-symbols-outlined !text-lg opacity-50 ${(tier4Count + tier3Count) > 0 ? (tier4Count > 0 ? 'theme-text-danger' : 'theme-text-warning') : ''}`}>{tier4Count > 0 ? "crisis_alert" : (tier3Count > 0 ? "tune" : "radar")}</span>
                 <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60">
                   {tier4Count > 0 && tier3Count > 0 ? `${t("stat_tier4")} / ${t("stat_tier3")}` : tier4Count > 0 ? (t("stat_tier4")) : (tier3Count > 0 ? (t("stat_tier3")) : (t("tab_matrix")))}
                 </span>
                 <span className="text-sm font-black uppercase text-[var(--text)]">
                   {tier4Count > 0 && tier3Count > 0 ? `${tier4Count} / ${tier3Count}` : tier4Count + tier3Count}
                 </span>
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60 ml-2">{t("domain_core")}</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="theme-glass-inner p-4 rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] flex flex-col items-center justify-center text-center gap-1">
                 <span className="material-symbols-outlined !text-lg opacity-50">{t("icon_schedule")}</span>
                 <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60">{t("stat_last_scan")}</span>
                 <span className="text-sm font-black uppercase text-[var(--text)]">
                    {localLastScan ? new Date(localLastScan).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (status?.last_scan ? new Date(status.last_scan * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "N/A")}
                 </span>
              </div>
              <button onClick={onOpenHotSwap} className="theme-glass-inner p-4 rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] flex flex-col items-center justify-center text-center gap-1 cursor-pointer hover:scale-[1.02] hover:bg-white/5 active:scale-95 transition-all">
                 <span className="material-symbols-outlined !text-lg opacity-50">{t("icon_map")}</span>
                 <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60">{t("stat_blueprints")}</span>
                 <span className="text-sm font-black uppercase text-[var(--text)]">{playSets?.length || 0}</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60 ml-2">{t("domain_vault")}</h4>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => { onClose(); useStore.getState().setView("vault"); window.dispatchEvent(new CustomEvent('navigateVault', { detail: { filterStatus: 'ALL' } })); }} className="theme-glass-inner p-4 rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] flex flex-col items-center justify-center text-center gap-1 col-span-2 cursor-pointer hover:scale-[1.02] hover:bg-white/5 active:scale-95 transition-all">
                 <span className="material-symbols-outlined !text-lg opacity-50">{t("icon_inventory_2")}</span>
                 <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60">{t("vault_title")}</span>
                 <span className="text-sm font-black uppercase text-[var(--text)]">{relevantMods.length}</span>
              </button>
              <button onClick={() => { onClose(); useStore.getState().setView("vault"); window.dispatchEvent(new CustomEvent('navigateVault', { detail: { filterStatus: 'VERIFIED' } })); }} className="theme-glass-inner p-4 rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] flex flex-col items-center justify-center text-center gap-1 cursor-pointer hover:scale-[1.02] hover:bg-white/5 active:scale-95 transition-all">
                 <span className="material-symbols-outlined !text-lg opacity-50 theme-text-success">{t("icon_verified_user")}</span>
                 <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60">{t("verified")}</span>
                 <span className="text-sm font-black uppercase text-[var(--text)]">{verifiedCount}</span>
              </button>
              <button onClick={() => { onClose(); useStore.getState().setView("vault"); window.dispatchEvent(new CustomEvent('navigateVault', { detail: { filterStatus: 'UNVERIFIED' } })); }} className="theme-glass-inner p-4 rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] flex flex-col items-center justify-center text-center gap-1 cursor-pointer hover:scale-[1.02] hover:bg-white/5 active:scale-95 transition-all">
                 <span className="material-symbols-outlined !text-lg opacity-50 theme-text-warning">{t("icon_help")}</span>
                 <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60">{t("unverified")}</span>
                 <span className="text-sm font-black uppercase text-[var(--text)]">{unverifiedCount}</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60 ml-2">{t("domain_ext")}</h4>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => { onClose(); localStorage.setItem("sanctuary_settings_tab", "LEXICON"); useStore.getState().setView("settings"); window.dispatchEvent(new CustomEvent('navigateSettings', { detail: { tab: 'LEXICON' } })); }} className="theme-glass-inner p-4 rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] flex flex-col items-center justify-center text-center gap-1 cursor-pointer hover:scale-[1.02] hover:bg-white/5 active:scale-95 transition-all">
                 <span className="material-symbols-outlined !text-lg opacity-50">{t("icon_language")}</span>
                 <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60">{t("tab_lexicons")}</span>
                 <span className="text-sm font-black uppercase text-[var(--text)]">{lexiconCount}</span>
              </button>
              <button onClick={() => { onClose(); localStorage.setItem("sanctuary_settings_tab", "CHAMELEON"); useStore.getState().setView("settings"); window.dispatchEvent(new CustomEvent('navigateSettings', { detail: { tab: 'CHAMELEON' } })); }} className="theme-glass-inner p-4 rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] flex flex-col items-center justify-center text-center gap-1 cursor-pointer hover:scale-[1.02] hover:bg-white/5 active:scale-95 transition-all">
                 <span className="material-symbols-outlined !text-lg opacity-50">{t("icon_palette")}</span>
                 <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60">{t("type_theme")}</span>
                 <span className="text-sm font-black uppercase text-[var(--text)]">{chameleonCount}</span>
              </button>
            </div>
          </div>
        </div>

        <button 
          onClick={() => { if(!isScanning && runRadarSweep) runRadarSweep(); }}
          disabled={isScanning}
          className={`mt-4 w-full p-5 rounded-2xl flex items-center justify-center gap-3 font-black text-xs uppercase tracking-widest transition-all border ${
            isScanning 
              ? 'bg-white/5 border-white/10 text-[var(--subtext)] opacity-50 cursor-not-allowed' 
              : c_btnClass
          }`}
        >
          <span className={`material-symbols-outlined !text-lg ${isScanning ? 'animate-spin' : ''}`}>{t("icon_radar")}</span>
          {isScanning ? (t("scanning")) : (t("btn_radar"))}
        </button>

      </div>
    </SidePanel>
  );
}
