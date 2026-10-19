import React from "react";
import { SidePanel, PanelHeaderGroup, PanelHeaderButton } from "../shared";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { useTheme } from "../ThemeContext";
import { UniversalCard } from "../components/universal/UniversalCard";
import { UniversalGroup } from "../components/universal/UniversalLayout";

export default function CommandRadarSweepPanel({
  isOpen,
  onClose,
  status,
  runRadarSweep,
  isScanning,
  networkUpdates,
  tier3Count = 0,
  tier4Count = 0,
  brokenCount = 0,
  unstableCount = 0,
  onOpenUpdates,
  onOpenConflicts,
  onOpenIncompatible,
  onOpenHotSwap,
}: any) {
  const { t, registry } = useLexicon();
  const { customThemes, CORE_THEMES } = useTheme();
  const { modList, playSets, activeSetName } = useStore();

  const activeSet = React.useMemo(
    () => playSets.find((ps: any) => ps.name === activeSetName) || null,
    [playSets, activeSetName]
  );

  const relevantMods = React.useMemo(() => {
    if (!activeSet || !activeSet.mods) return modList || [];
    return (modList || []).filter((m: any) => activeSet.mods.includes(m.name));
  }, [modList, activeSet]);

  const stableCount = React.useMemo(
    () =>
      relevantMods.filter(
        (m: any) =>
          m.status === t("status_dd_stable", "Stable") ||
          String(m.status).toLowerCase() === "stable"
      ).length,
    [relevantMods, t]
  );
  const unverifiedCount = React.useMemo(
    () =>
      relevantMods.filter(
        (m: any) =>
          m.status === t("unverified", "Unverified") ||
          String(m.status).toLowerCase() === "unverified" ||
          !m.status
      ).length,
    [relevantMods, t]
  );
  const lexiconCount = React.useMemo(() => Object.keys(registry || {}).length + 3, [registry]);
  const chameleonCount = React.useMemo(
    () => Object.keys(customThemes || {}).length + Object.keys(CORE_THEMES || {}).length,
    [customThemes, CORE_THEMES]
  );

  const [localLastScan, setLocalLastScan] = React.useState<number | null>(() => {
    const saved = localStorage.getItem("sanctuary_last_radar_scan");
    return saved ? parseInt(saved, 10) : null;
  });

  const previousIsScanning = React.useRef(isScanning);
  React.useEffect(() => {
    if (previousIsScanning.current === true && isScanning === false) {
      const now = Date.now();
      setLocalLastScan(now);
      localStorage.setItem("sanctuary_last_radar_scan", String(now));
    }
    previousIsScanning.current = isScanning;
  }, [isScanning]);

  const updatesCount = React.useMemo(() => {
    const rawUpdates = relevantMods
      .filter((m: any) => m.hasUpdate)
      .map((m: any) => ({
        ...m,
        dbId: m.dbId,
      }));
    return Object.keys(
      rawUpdates.reduce((acc: any, update: any) => {
        const key = update.dbId || update.displayName || update.name;
        if (!acc[key]) acc[key] = true;
        return acc;
      }, {})
    ).length;
  }, [relevantMods]);

  let radarState = "optimal";
  if (tier4Count > 0 || brokenCount > 0) {
    radarState = "critical";
  } else if (tier3Count > 0 || unstableCount > 0) {
    radarState = "warning";
  } else if (updatesCount > 0) {
    radarState = "update";
  }

  const themeVar =
    radarState === "critical"
      ? "--danger"
      : radarState === "warning"
        ? "--warning"
        : radarState === "update"
          ? "--accent"
          : "--success";

  const c_iconColor = `text-[var(${themeVar})]`;
  const c_panelBorder = `border-[color-mix(in_srgb,var(${themeVar})_20%,transparent)]`;
  const c_bgGradient = `from-[color-mix(in_srgb,var(${themeVar})_10%,transparent)]`;
  const c_ringBorder = `border-[color-mix(in_srgb,var(${themeVar})_30%,transparent)]`;
  const c_ringBg = `bg-[color-mix(in_srgb,var(${themeVar})_10%,transparent)]`;
  const c_ringIcon = `text-[color-mix(in_srgb,var(${themeVar})_80%,transparent)]`;
  const c_titleText = `text-[var(${themeVar})]`;
  const c_subText = `text-[color-mix(in_srgb,var(${themeVar})_80%,transparent)]`;

  const topTitle = t("optimal", "Optimal");
  let subtext = t("sys_stable", "System Stable");
  if (radarState === "critical") {
    subtext = t("crit_fail", "Critical Failures");
  } else if (radarState === "warning") {
    subtext = t("sys_comp", "System Compromised");
  } else if (radarState === "update") {
    subtext = t("updates_det", "Updates Detected");
  }

  const breakdownText = `${updatesCount} ${t("updates_modal_title", "Updates")} • ${
    tier3Count + tier4Count
  } ${t("tab_matrix", "Conflicts")} • ${brokenCount + unstableCount} ${t(
    "citizen_action_incompatible",
    "Incompatible"
  )}`;

  const bottomText =
    radarState === "critical"
      ? t("crash_likely", "Crash Likely")
      : radarState === "optimal"
        ? t("no_crash", "No Crashes Expected")
        : t("sys_sub_stable", "Sub-Optimal Stability");

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("btn_radar", "Radar Sweep")}
      subtitle={t("system_core", "System Core & Sub-Systems")}
      icon={t("icon_radar", "radar")}
      iconColorClass={c_iconColor}
      widthClass="w-full md:w-[680px]"
      backdropZ="z-[10001]"
      panelZ="z-[10002]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={t("icon_radar", "radar")}
            tooltip={t("btn_radar", "Radar Sweep")}
            onClick={() => {
              if (!isScanning && runRadarSweep) runRadarSweep();
            }}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-6 w-full pb-12">
        {/* Centered Radar Hero Card */}
        <div
          className={`glass-panel rounded-2xl p-8 py-10 relative group border ${c_panelBorder} shadow-xl flex flex-col justify-center shrink-0`}
        >
          <div
            className={`absolute inset-0 rounded-[inherit] bg-gradient-to-br ${c_bgGradient} via-transparent to-transparent opacity-50 pointer-events-none`}
          />
          <div className="relative z-10 flex flex-col items-center text-center">
            <button
              type="button"
              onClick={() => {
                if (!isScanning && runRadarSweep) runRadarSweep();
              }}
              disabled={isScanning}
              className={`w-20 h-20 rounded-full flex items-center justify-center border ${c_ringBorder} ${c_ringBg} mb-6 shadow-md ${
                isScanning
                  ? "animate-pulse opacity-50 cursor-not-allowed"
                  : "cursor-pointer hover:scale-105 active:scale-95 hover:shadow-[0_0_40px_rgba(var(--accent-rgb),0.3)] transition-all group/radarbtn"
              }`}
            >
              <span
                className={`material-symbols-outlined !text-[28px] ${c_ringIcon} ${
                  isScanning
                    ? "animate-spin"
                    : "group-hover/radarbtn:scale-110 transition-transform"
                }`}
              >
                {t("icon_radar", "radar")}
              </span>
            </button>
            <h3
              className={`text-xl font-black capitalize tracking-tighter ${c_titleText} mb-1 flex flex-col gap-1`}
            >
              {isScanning ? t("scanning", "Scanning...") : topTitle}
              {!isScanning && <span className="text-sm opacity-80">{subtext}</span>}
            </h3>
            <span className={`text-[10px] font-bold capitalize tracking-widest ${c_subText} mt-3`}>
              {breakdownText}
            </span>
            {radarState === "critical" ? (
              <div className="mt-4 px-4 py-1.5 bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] border border-[color-mix(in_srgb,var(--danger)_50%,transparent)] rounded-xl animate-pulse shadow-md">
                <span className="text-xs font-black capitalize tracking-[0.2em] text-red-400 drop-shadow-md">
                  {bottomText}
                </span>
              </div>
            ) : (
              <span className="text-xs font-bold mt-2 opacity-70">{bottomText}</span>
            )}
          </div>
        </div>

        <UniversalGroup
          title={t("citizen_action_required", "Action Required")}
          icon={t("icon_gpp_maybe", "gpp_maybe")}
        >
          <div className="grid grid-cols-2 gap-3">
            <UniversalCard
              layout="stat"
              onClick={onOpenUpdates}
              isActive={updatesCount > 0}
              icon={t("icon_update", "update")}
              subtitle={t("updates_modal_title", "Updates")}
              title={updatesCount}
            />
            <UniversalCard
              layout="stat"
              onClick={onOpenIncompatible}
              customIcon={
                <span
                  className={`material-symbols-outlined !text-[22px] transition-colors ${
                    brokenCount + unstableCount > 0
                      ? brokenCount > 0
                        ? "text-red-500"
                        : "text-orange-500"
                      : "opacity-50 group-hover:opacity-80"
                  }`}
                >
                  {brokenCount > 0
                    ? t("icon_gpp_bad", "gpp_bad")
                    : unstableCount > 0
                      ? t("icon_gpp_maybe", "gpp_maybe")
                      : t("icon_warning_amber", "warning_amber")}
                </span>
              }
              subtitle={
                brokenCount > 0 && unstableCount > 0
                  ? `${t("status_broken", "Corrupted")} / ${t("label_unstable", "Unstable")}`
                  : brokenCount > 0
                    ? t("status_broken", "Corrupted")
                    : unstableCount > 0
                      ? t("label_unstable", "Unstable")
                      : t("citizen_action_incompatible", "Incompatible")
              }
              title={
                brokenCount > 0 && unstableCount > 0
                  ? `${brokenCount} / ${unstableCount}`
                  : brokenCount + unstableCount
              }
            />
            <UniversalCard
              layout="stat"
              className="col-span-2"
              onClick={onOpenConflicts}
              customIcon={
                <span
                  className={`material-symbols-outlined !text-[22px] transition-colors ${
                    tier4Count + tier3Count > 0
                      ? tier4Count > 0
                        ? "text-red-500"
                        : "text-orange-500"
                      : "opacity-50 group-hover:opacity-80"
                  }`}
                >
                  {tier4Count > 0
                    ? t("icon_crisis_alert", "crisis_alert")
                    : tier3Count > 0
                      ? t("icon_tune", "tune")
                      : t("icon_radar", "radar")}
                </span>
              }
              subtitle={
                tier4Count > 0 && tier3Count > 0
                  ? `${t("stat_tier4", "Fatal")} / ${t("stat_tier3", "Overlap")}`
                  : tier4Count > 0
                    ? t("stat_tier4", "Fatal")
                    : tier3Count > 0
                      ? t("stat_tier3", "Overlap")
                      : t("tab_matrix", "Conflicts")
              }
              title={
                tier4Count > 0 && tier3Count > 0
                  ? `${tier4Count} / ${tier3Count}`
                  : tier4Count + tier3Count
              }
            />
          </div>
        </UniversalGroup>

        <UniversalGroup
          title={t("domain_core", "Core Status")}
          icon={t("icon_memory", "memory")}
        >
          <div className="grid grid-cols-2 gap-3">
            <UniversalCard
              layout="stat"
              icon={t("icon_schedule", "schedule")}
              subtitle={t("stat_last_scan", "Last Sweep")}
              title={
                localLastScan
                  ? new Date(localLastScan).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : status?.last_scan
                    ? new Date(status.last_scan * 1000).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : t("status_unknown", "Unknown")
              }
            />
            <UniversalCard
              layout="stat"
              onClick={onOpenHotSwap}
              icon={t("icon_map", "map")}
              subtitle={t("stat_blueprints", "Blueprints")}
              title={playSets?.length || 0}
            />
          </div>
        </UniversalGroup>

        <UniversalGroup
          title={t("domain_vault", "Blueprint Integrity")}
          icon={t("icon_inventory_2", "inventory_2")}
        >
          <div className="grid grid-cols-2 gap-3">
            <UniversalCard
              layout="stat"
              className="col-span-2"
              onClick={() => {
                onClose();
                useStore.getState().setView("vault");
                window.dispatchEvent(
                  new CustomEvent("navigateVault", { detail: { filterStatus: "ALL" } })
                );
              }}
              icon={t("icon_inventory_2", "inventory_2")}
              subtitle={t("vault_title", "Your Vault")}
              title={relevantMods.length}
            />
            <UniversalCard
              layout="stat"
              onClick={() => {
                onClose();
                useStore.getState().setView("vault");
                window.dispatchEvent(
                  new CustomEvent("navigateVault", { detail: { filterStatus: "STABLE" } })
                );
              }}
              customIcon={
                <span className="material-symbols-outlined !text-[22px] transition-colors theme-text-success">
                  {t("icon_verified_user", "verified_user")}
                </span>
              }
              subtitle={t("status_dd_stable", "Stable")}
              title={stableCount}
            />
            <UniversalCard
              layout="stat"
              onClick={() => {
                onClose();
                useStore.getState().setView("vault");
                window.dispatchEvent(
                  new CustomEvent("navigateVault", { detail: { filterStatus: "UNVERIFIED" } })
                );
              }}
              customIcon={
                <span className="material-symbols-outlined !text-[22px] transition-colors theme-text-warning">
                  {t("icon_help", "help")}
                </span>
              }
              subtitle={t("unverified", "Unverified")}
              title={unverifiedCount}
            />
          </div>
        </UniversalGroup>

        <UniversalGroup
          title={t("domain_ext", "Extensions")}
          icon={t("icon_extension", "extension")}
        >
          <div className="grid grid-cols-2 gap-3">
            <UniversalCard
              layout="stat"
              onClick={() => {
                onClose();
                localStorage.setItem("sanctuary_settings_tab", "LEXICON");
                useStore.getState().setView("settings");
                window.dispatchEvent(
                  new CustomEvent("navigateSettings", { detail: { tab: "LEXICON" } })
                );
              }}
              icon={t("icon_language", "language")}
              subtitle={t("tab_lexicons", "Lexicons")}
              title={lexiconCount}
            />
            <UniversalCard
              layout="stat"
              onClick={() => {
                onClose();
                localStorage.setItem("sanctuary_settings_tab", "CHAMELEON");
                useStore.getState().setView("settings");
                window.dispatchEvent(
                  new CustomEvent("navigateSettings", { detail: { tab: "CHAMELEON" } })
                );
              }}
              icon={t("icon_palette", "palette")}
              subtitle={t("type_theme", "Themes")}
              title={chameleonCount}
            />
          </div>
        </UniversalGroup>
      </div>
    </SidePanel>
  );
}
