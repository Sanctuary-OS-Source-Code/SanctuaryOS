import React from "react";
import { SidePanel } from "../shared";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { useTheme } from "../ThemeContext";
import { UniversalCard } from "../components/universal/UniversalCard";

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

  const updatesCount = React.useMemo(() => {
    const rawUpdates = relevantMods.filter((m: any) => m.hasUpdate).map((m: any) => ({
      ...m,
      dbId: m.dbId,
    }));
    return Object.keys(rawUpdates.reduce((acc: any, update: any) => {
      const key = update.dbId || update.displayName || update.name;
      if (!acc[key]) acc[key] = true;
      return acc;
    }, {})).length;
  }, [relevantMods]);
  let radarState = "optimal";
  if (tier4Count > 0 || brokenCount > 0) {
    radarState = "critical";
  } else if (tier3Count > 0 || unstableCount > 0) {
    radarState = "warning";
  } else if (updatesCount > 0) {
    radarState = "update";
  }

  const themeVar = radarState === "critical" ? "--danger" : radarState === "warning" ? "--warning" : radarState === "update" ? "--accent" : "--success";

  const c_iconColor = `text-[var(${themeVar})]`;
  const c_panelBorder = `border-[color-mix(in_srgb,var(${themeVar})_20%,transparent)]`;
  const c_bgGradient = `from-[color-mix(in_srgb,var(${themeVar})_10%,transparent)]`;
  const c_ringBorder = `border-[color-mix(in_srgb,var(${themeVar})_30%,transparent)]`;
  const c_ringBg = `bg-[color-mix(in_srgb,var(${themeVar})_10%,transparent)]`;
  const c_ringShadow = `shadow-md`;
  const c_ringIcon = `text-[color-mix(in_srgb,var(${themeVar})_80%,transparent)]`;
  const c_titleText = `text-[var(${themeVar})]`;
  const c_subText = `text-[color-mix(in_srgb,var(${themeVar})_80%,transparent)]`;
  const c_btnClass = `bg-[color-mix(in_srgb,var(${themeVar})_10%,transparent)] border-[color-mix(in_srgb,var(${themeVar})_30%,transparent)] text-[color-mix(in_srgb,var(${themeVar})_80%,transparent)] hover:bg-[color-mix(in_srgb,var(${themeVar})_20%,transparent)] hover:border-[color-mix(in_srgb,var(${themeVar})_50%,transparent)] shadow-md hover:shadow-md`;

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
        noPadding={true}
        backdropZ="z-[140001]"
        panelZ="z-[140002]"
      >
        <div className="flex flex-col gap-6 w-full p-8 pb-12">
          
          <div className={`glass-panel rounded-[var(--radius)] p-8 py-10 relative overflow-hidden group border ${c_panelBorder} shadow-xl flex flex-col justify-center shrink-0`}>
            <div className={`absolute inset-0 bg-gradient-to-br ${c_bgGradient} via-transparent to-transparent opacity-50`} />
            <div className="relative z-10 flex flex-col items-center text-center">
              <button 
                onClick={() => { if(!isScanning && runRadarSweep) runRadarSweep(); }}
                disabled={isScanning}
                className={`w-20 h-20 rounded-full flex items-center justify-center border ${c_ringBorder} ${c_ringBg} mb-6 ${c_ringShadow} ${isScanning ? 'animate-pulse opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-105 active:scale-95 hover:shadow-[0_0_40px_rgba(var(--accent-rgb),0.3)] transition-all group/radarbtn'}`}
              >
                 <span className={`material-symbols-outlined !text-4xl ${c_ringIcon} ${isScanning ? 'animate-spin' : 'group-hover/radarbtn:scale-110 transition-transform'}`}>{t("icon_radar")}</span>
              </button>
            <h3 className={`text-xl font-black uppercase tracking-tighter ${c_titleText} mb-1 flex flex-col gap-1`}>
              {isScanning ? (t("scanning")) : topTitle}
              {!isScanning && <span className="text-sm opacity-80">{subtext}</span>}
            </h3>
            <span className={`text-[10px] font-bold uppercase tracking-widest ${c_subText} mt-3`}>
              {breakdownText}
            </span>
            {radarState === "critical" ? (
              <div className="mt-4 px-4 py-1.5 bg-red-500/20 border border-red-500/50 rounded-xl animate-pulse shadow-md">
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
              <UniversalCard
                layout="stat"
                onClick={onOpenUpdates}
                isActive={updatesCount > 0}
                icon={t("icon_update")}
                subtitle={t("updates_modal_title")}
                title={updatesCount}
              />
              <UniversalCard
                layout="stat"
                onClick={onOpenIncompatible}
                customIcon={<span className={`material-symbols-outlined !text-[22px] transition-colors ${(brokenCount + unstableCount) > 0 ? (brokenCount > 0 ? 'text-red-500' : 'text-orange-500') : 'opacity-50 group-hover:opacity-80'}`}>{brokenCount > 0 ? "gpp_bad" : (unstableCount > 0 ? "gpp_maybe" : "warning_amber")}</span>}
                statusColor={(brokenCount + unstableCount) > 0 ? (brokenCount > 0 ? 'border-red-500/[30%] bg-red-500/10' : 'border-orange-500/[30%] bg-orange-500/10') : undefined}
                subtitle={brokenCount > 0 && unstableCount > 0 ? `${t("status_broken")} / ${t("label_unstable")}` : brokenCount > 0 ? (t("status_broken")) : (unstableCount > 0 ? (t("label_unstable")) : (t("citizen_action_incompatible")))}
                title={brokenCount > 0 && unstableCount > 0 ? `${brokenCount} / ${unstableCount}` : brokenCount + unstableCount}
              />
              <UniversalCard
                layout="stat"
                className="col-span-2"
                onClick={onOpenConflicts}
                customIcon={<span className={`material-symbols-outlined !text-[22px] transition-colors ${(tier4Count + tier3Count) > 0 ? (tier4Count > 0 ? 'text-red-500' : 'text-orange-500') : 'opacity-50 group-hover:opacity-80'}`}>{tier4Count > 0 ? "crisis_alert" : (tier3Count > 0 ? "tune" : "radar")}</span>}
                statusColor={(tier4Count + tier3Count) > 0 ? (tier4Count > 0 ? 'border-red-500/[30%] bg-red-500/10' : 'border-orange-500/[30%] bg-orange-500/10') : undefined}
                subtitle={tier4Count > 0 && tier3Count > 0 ? `${t("stat_tier4")} / ${t("stat_tier3")}` : tier4Count > 0 ? (t("stat_tier4")) : (tier3Count > 0 ? (t("stat_tier3")) : (t("tab_matrix")))}
                title={tier4Count > 0 && tier3Count > 0 ? `${tier4Count} / ${tier3Count}` : tier4Count + tier3Count}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60 ml-2">{t("domain_core")}</h4>
            <div className="grid grid-cols-2 gap-3">
              <UniversalCard
                layout="stat"
                icon={t("icon_schedule")}
                subtitle={t("stat_last_scan")}
                title={localLastScan ? new Date(localLastScan).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (status?.last_scan ? new Date(status.last_scan * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "N/A")}
              />
              <UniversalCard
                layout="stat"
                onClick={onOpenHotSwap}
                icon={t("icon_map")}
                subtitle={t("stat_blueprints")}
                title={playSets?.length || 0}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60 ml-2">{t("domain_vault")}</h4>
            <div className="grid grid-cols-2 gap-3">
              <UniversalCard
                layout="stat"
                className="col-span-2"
                onClick={() => { onClose(); useStore.getState().setView("vault"); window.dispatchEvent(new CustomEvent('navigateVault', { detail: { filterStatus: 'ALL' } })); }}
                icon={t("icon_inventory_2")}
                subtitle={t("vault_title")}
                title={relevantMods.length}
              />
              <UniversalCard
                layout="stat"
                onClick={() => { onClose(); useStore.getState().setView("vault"); window.dispatchEvent(new CustomEvent('navigateVault', { detail: { filterStatus: 'VERIFIED' } })); }}
                customIcon={<span className="material-symbols-outlined !text-[22px] transition-colors theme-text-success">{t("icon_verified_user")}</span>}
                subtitle={t("verified")}
                title={verifiedCount}
              />
              <UniversalCard
                layout="stat"
                onClick={() => { onClose(); useStore.getState().setView("vault"); window.dispatchEvent(new CustomEvent('navigateVault', { detail: { filterStatus: 'UNVERIFIED' } })); }}
                customIcon={<span className="material-symbols-outlined !text-[22px] transition-colors theme-text-warning">{t("icon_help")}</span>}
                subtitle={t("unverified")}
                title={unverifiedCount}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60 ml-2">{t("domain_ext")}</h4>
            <div className="grid grid-cols-2 gap-3">
              <UniversalCard
                layout="stat"
                onClick={() => { onClose(); localStorage.setItem("sanctuary_settings_tab", "LEXICON"); useStore.getState().setView("settings"); window.dispatchEvent(new CustomEvent('navigateSettings', { detail: { tab: 'LEXICON' } })); }}
                icon={t("icon_language")}
                subtitle={t("tab_lexicons")}
                title={lexiconCount}
              />
              <UniversalCard
                layout="stat"
                onClick={() => { onClose(); localStorage.setItem("sanctuary_settings_tab", "CHAMELEON"); useStore.getState().setView("settings"); window.dispatchEvent(new CustomEvent('navigateSettings', { detail: { tab: 'CHAMELEON' } })); }}
                icon={t("icon_palette")}
                subtitle={t("type_theme")}
                title={chameleonCount}
              />
            </div>
          </div>
        </div>

        </div>
      </SidePanel>
  );
}
