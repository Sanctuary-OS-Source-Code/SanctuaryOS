import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { useLexicon } from "./LexiconContext";
import { DashboardStatTile, ViewHeader, isVersionMatch, SidePanel, getHighestVersion, handleOpenUrl, getExtensionRegex, HoverTooltip, ActionButton } from "./shared";
import { usePlaySetLogic } from "./hooks/usePlaySetLogic";
import { useStore } from "./store";
import { useModalStore } from "./store/modalStore";
import MasonFeed from "./MasonFeed";

import CommandIncompatiblePanel from "./side-panels/CommandIncompatiblePanel";
import CommandConflictsPanel from "./side-panels/CommandConflictsPanel";
import CommandRadarSweepPanel from "./side-panels/CommandRadarSweepPanel";
import { AuditLogViewer } from "./side-panels/SAAuditLogViewer";
import { SanctuaryAlertsSidePanel } from './side-panels/SanctuaryAlertsSidePanel';
import { UpdatesSidePanel } from './side-panels/CommandCenterSidePanels';
import MasonPostViewer from "./side-panels/MasonPostViewer";
import { CommandScreenStats, CommandScreenSectionHeading, CommandScreenQuickLink } from "./hub-components/SharedCommandScreenLayout";

export default function CommandCenter({
  isScanning, modsPath, isConfigured, toggleInActiveSet,
  modList, quarantineList, shelterContents, shelterActive, runRadarSweep, runSanitization, massIngestToCloud, triggerShelter, setView, setFilterStatus, setShowBrokenModal, setShowQuarantineModal, handleOpenMasonProfile, networkUpdates, setIsSupportDeskOpen, setIsCitizenTicketsOpen, equipPlaySet
}: any) {
  const { t } = useLexicon();
  const ownedDLC = useStore((state) => state.ownedDLC);
  const maskedDLC = useStore((state) => state.maskedDLC);
  const selectedVersion = useStore((state) => state.selectedVersion);
  const playSets = useStore((state) => state.playSets);
  const activeSetName = useStore((state) => state.activeSetName);
  const activePlaySetIndex = React.useMemo(() => playSets ? playSets.findIndex((ps: any) => ps.name === activeSetName) : -1, [playSets, activeSetName]);
  const activePlaySet = activePlaySetIndex !== -1 ? playSets[activePlaySetIndex] : null;
  const session = useStore((state) => state.session);
  const userRole = useStore((state) => state.userRole);
  const setPlaySets = useStore((state) => state.setPlaySets);
  const ignoredGlobal = useStore((state) => state.ignoredGlobal);

  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const status = useStore((state) => state.status);
  const { showUpdatesModal, setShowUpdatesModal, showIncompatiblePanel, setShowIncompatiblePanel, showConflictsPanel, setShowConflictsPanel, isConflictRadarOpen, setIsConflictRadarOpen, isBlueprintSwapOpen, setIsBlueprintSwapOpen } = useModalStore();
  const [hasSymlinkPerms, setHasSymlinkPerms] = useState<boolean | null>(null);

  const [isAuditLogsOpen, setIsAuditLogsOpen] = useState(false);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [viewingPost, setViewingPost] = useState<any>(null);
  const [urgentBroadcast, setUrgentBroadcast] = useState<any>(null);

  const [nexusCount, setNexusCount] = useState<number | "-">("-");
  const [ticketCount, setTicketCount] = useState<number | "-">("-");

  const checkPerms = () => {
    invoke<boolean>("check_symlink_permissions")
      .then(res => setHasSymlinkPerms(res))
      .catch(() => setHasSymlinkPerms(false));
  };

  useEffect(() => {
    checkPerms();
    import('./supabase').then(async ({ supabase }) => {
      if (!navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true") return;

      const fetchUrgent = async () => {
        const { data } = await supabase.from('system_broadcasts').select('*').eq('is_active', true).eq('is_pinned', true).or('target_audience.ilike.%All%,target_audience.eq.Citizens,target_audience.ilike."Citizens,%",target_audience.ilike."%,Citizens,%",target_audience.ilike."%,Citizens"').order('created_at', { ascending: false }).limit(1);
        if (data && data.length > 0) {
          const dismissedId = localStorage.getItem('sanctuary_dismissed_alert_id');
          if (dismissedId !== String(data[0].id)) {
            setUrgentBroadcast(data[0]);
          }
        }
      };

      try {
        const [assetsRes, modsRes, bpRes] = await Promise.all([
          supabase.from('nexus_assets').select('id', { count: 'exact', head: true }),
          supabase.from('mods').select('id', { count: 'exact', head: true }),
          supabase.from('blueprints').select('id', { count: 'exact', head: true })
        ]);

        let total = 0;
        if (assetsRes.count !== null) total += assetsRes.count;
        if (modsRes.count !== null) total += modsRes.count;
        if (bpRes.count !== null) total += bpRes.count;

        setNexusCount(total);
        fetchUrgent();
      } catch (err) {
        console.error("Failed to fetch total nexus count", err);
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

    const exactMatchMap = new Map();
    const baseMatchMap = new Map();

    // Build O(1) lookup maps once
    for (const m of safeList) {
      if (!m.name) continue;
      const exactKey = m.name.toLowerCase().replace(/\\/g, '/');
      exactMatchMap.set(exactKey, m);

      const baseKey = m.name.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), '').toLowerCase();
      if (baseKey) {
        // Only map the first occurrence to match the behavior of .find()
        if (!baseMatchMap.has(baseKey)) {
          baseMatchMap.set(baseKey, m);
        }
      }
    }

    return safeMods.map((rawMod: any) => {
      const modName = typeof rawMod === 'string' ? rawMod : String(rawMod?.name || rawMod?.path || '');
      const cleanModName = modName.replace(/^(sanctuary[/\\])+/i, '');
      const modNameLow = cleanModName.toLowerCase().replace(/\\/g, '/');

      const exactMatch = exactMatchMap.get(modNameLow);
      if (exactMatch) return { ...exactMatch, _originalSetName: modName };

      const mBase = modName.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), '').toLowerCase();

      const baseMatch = mBase ? baseMatchMap.get(mBase) : undefined;
      if (baseMatch) return { ...baseMatch, _originalSetName: modName };

      return { id: `missing-${modName}`, name: modName, isFallback: true, color: 'theme-border-danger', physical_path: null, hash: 'vlocal' };
    });
  }, [activePlaySet, modList, activeGameSchema]);

  const activeUpdates = React.useMemo(() => {
    const rawUpdates = activeBlueprintMods.filter((m: any) => m.hasUpdate).map((m: any) => ({
      ...m,
      dbId: m.dbId,
    }));
    return Object.values(rawUpdates.reduce((acc: any, update: any) => {
      const key = update.dbId || update.displayName || update.name;
      if (!acc[key]) acc[key] = update;
      return acc;
    }, {}));
  }, [activeBlueprintMods]);
  const { applyConflictOverride } = usePlaySetLogic();
  const activeBrokenCounts = React.useMemo(() => {
    const activeModNamesSet = new Set<string>();
    activeBlueprintMods.forEach((am: any) => {
      const name = (am._originalSetName || am.name);
      if (name) activeModNamesSet.add(String(name).toLowerCase());
    });

    return activeBlueprintMods.reduce((acc: { broken: number, unstable: number }, m: any) => {
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
          hasMissingDeps = rawDeps.some((req: string) => !activeModNamesSet.has(req.toLowerCase()));
        }
      }

      if (isBroken || isMismatch || hasMissingDLC || hasMissingDeps) {
        acc.broken += 1;
      } else if (isUnstable) {
        acc.unstable += 1;
      }

      return acc;
    }, { broken: 0, unstable: 0 }) || { broken: 0, unstable: 0 };
  }, [activeBlueprintMods, selectedVersion, ownedDLC, maskedDLC]);

  const activeConflictCount = React.useMemo(() => {
    let tier3Count = 0;
    let tier4Count = 0;
    let total = 0;

    try {
      const stored = localStorage.getItem("sanctuary_local_conflicts");
      if (stored) {
        const localConflicts = JSON.parse(stored);

        localConflicts.forEach((lc: any) => {
          if (ignoredGlobal.includes(lc.mod_pair)) return;

          const modAMatch = activeBlueprintMods.find((em: any) => {
            if (em.isFallback) return false;
            const cleanN = String(em.name || '').toUpperCase();
            const cleanDisp = String(em.displayName || '').toUpperCase();
            const targetClean = String(lc.modA || lc.mod_a || '').toUpperCase();
            return cleanN.includes(targetClean) || cleanDisp.includes(targetClean) || targetClean.includes(cleanN);
          });
          const modBMatch = activeBlueprintMods.find((em: any) => {
            if (em.isFallback) return false;
            const cleanN = String(em.name || '').toUpperCase();
            const cleanDisp = String(em.displayName || '').toUpperCase();
            const targetClean = String(lc.modB || lc.mod_b || '').toUpperCase();
            return cleanN.includes(targetClean) || cleanDisp.includes(targetClean) || targetClean.includes(cleanN);
          });

          if (modAMatch && modBMatch) {
            total++;
            if (lc.severity_rank == 4) tier4Count++;
            else tier3Count++;
          }
        });
      }
    } catch (e) { }

    return { total, tier3: tier3Count, tier4: tier4Count };
  }, [activeBlueprintMods, ignoredGlobal]);

  React.useEffect(() => {
    useStore.getState().setActiveConflictCount(activeConflictCount);
  }, [activeConflictCount]);

  React.useEffect(() => {
    useStore.getState().setActiveBrokenCounts(activeBrokenCounts);
  }, [activeBrokenCounts]);

  const radarUpdatesCount = activeUpdates.length || 0;
  const radarTier4Count = activeConflictCount.tier4 || 0;
  const radarTier3Count = activeConflictCount.tier3 || 0;
  const radarBrokenCount = activeBrokenCounts.broken || 0;
  const radarUnstableCount = activeBrokenCounts.unstable || 0;

  let radarState = "optimal";
  if (radarTier4Count > 0 || radarBrokenCount > 0) {
    radarState = "critical";
  } else if (radarTier3Count > 0 || radarUnstableCount > 0) {
    radarState = "warning";
  } else if (radarUpdatesCount > 0) {
    radarState = "update";
  }

  return (
    <div className="flex flex-col gap-8 pb-24 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <ViewHeader title={t("center_title")} subtitle={t("center_subtitle")} icon={t("icon_desktop_windows")} iconColorClass="text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]" />

      <CommandScreenStats>
        <DashboardStatTile
          icon={<span className="material-symbols-outlined ">{radarState === 'optimal' ? t("icon_check_circle") : t("icon_warning")}</span>}
          number={
            activeGameSchema?.features?.has_cc === false ? "-" :
            ((radarTier4Count + radarTier3Count + radarBrokenCount + radarUnstableCount) > 0
              ? (radarTier4Count + radarTier3Count + radarBrokenCount + radarUnstableCount)
              : (radarUpdatesCount > 0 ? radarUpdatesCount : 0))
          }
          label={
            activeGameSchema?.features?.has_cc === false ? t("radar_title") :
            (radarState === 'critical' ? (t("crit_fail")) :
              radarState === 'warning' ? (t("action_rec")) :
                radarState === 'update' ? (t("updates_avail")) :
                  (t("sys_stable")))
          }
          colorClass={
            radarState === 'critical' ? "border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] hover:border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] transition-colors duration-300" :
              radarState === 'warning' ? "border-[color-mix(in_srgb,var(--warning)_30%,transparent)] text-[var(--warning)] hover:border-[var(--warning)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] transition-colors duration-300" :
                radarState === 'update' ? "border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] transition-colors duration-300" :
                  "border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] hover:border-[var(--success)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] transition-colors duration-300"
          }
          onClick={() => setIsConflictRadarOpen(true)}
        />
        <DashboardStatTile
          icon={<span className="material-symbols-outlined ">{t("icon_account_balance")}</span>}
          number={activeGameSchema?.features?.has_cc === false ? "-" : (modList?.length || 0)}
          label={t("vault_title")}
          colorClass="text-[var(--accent)]"
          onClick={() => { if (activeGameSchema?.features?.has_cc !== false) { if (setView) setView("vault"); if (setFilterStatus) setFilterStatus("ALL"); } }}
        />
        <DashboardStatTile
          icon={<span className="material-symbols-outlined ">{t("icon_hub")}</span>}
          number={nexusCount}
          label={t("market_title")}
          colorClass="text-[var(--text)]"
          onClick={() => { if (setView) setView("nexus"); }}
        />
        <DashboardStatTile
          icon={<span className="material-symbols-outlined ">{t("icon_map")}</span>}
          number={activeGameSchema?.features?.has_cc === false ? "-" : (playSets?.length || 0)}
          label={t("stat_blueprints")}
          colorClass="text-[var(--accent)]"
          onClick={() => { if (activeGameSchema?.features?.has_cc !== false) setIsBlueprintSwapOpen(true); }}
        />
        <div className="relative group/ticket flex-1 flex min-w-[200px] xl:min-w-[250px]">
          {!session && (
            <HoverTooltip
              variant="danger"
              title={localStorage.getItem("sanctuary_blacklisted") === "true" ? t("alert_comm_banned") : t("alert_guest_mode_uploads")}
              subtitle={localStorage.getItem("sanctuary_blacklisted") === "true" ? t("alert_comm_banned_desc") : t("alert_guest_mode_desc")}
              className="group-hover/ticket:flex z-[1000] w-full"
            />
          )}
          <DashboardStatTile
            icon={<span className="material-symbols-outlined ">{t("icon_local_activity")}</span>}
            number={ticketCount}
            label={t("sidebar_support")}
            colorClass="text-[var(--text)]"
            onClick={() => { if (setIsCitizenTicketsOpen) setIsCitizenTicketsOpen(true); }}
            disabled={!session}
          />
        </div>
      </CommandScreenStats>

      {/* Main Content Area: Feed and Quick Actions */}
      <div className="flex flex-col xl:flex-row gap-6 mt-8 relative z-20">

        {/* Left Column: Feed & Alerts */}
        <div className="flex-1 min-w-0 flex flex-col gap-6">

          {/* CRITICAL SYSTEM ALERTS */}
          {(urgentBroadcast && localStorage.getItem("sanctuary_notify_alert_banner") !== "false" || hasSymlinkPerms === false || radarState !== 'optimal') && (
            <div className="flex flex-col gap-3 w-full">

              {urgentBroadcast && localStorage.getItem("sanctuary_notify_alert_banner") !== "false" && (
                <div onClick={() => setViewingPost({ ...urgentBroadcast, content: urgentBroadcast.message || urgentBroadcast.content, mason_id: 'system', views: 0, likes: 0, replies: 0 })} className="relative w-full rounded-2xl p-4 md:px-6 overflow-hidden flex flex-col md:flex-row md:items-center gap-4 cursor-pointer hover:brightness-110 transition-all group z-20 shadow-md border glass-surface" style={{ backgroundColor: 'color-mix(in srgb, var(--danger) 8%, transparent)', borderColor: 'color-mix(in srgb, var(--danger) 30%, transparent)' }}>
                  <div className="absolute top-0 left-0 w-[400px] h-[400px] rounded-full blur-[80px] opacity-20 pointer-events-none -translate-x-1/2 -translate-y-1/2 bg-[var(--danger)] group-hover:opacity-30 transition-opacity duration-500" />

                  <div className="flex items-center gap-4 relative z-10">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 relative bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)]">
                      <div className="absolute inset-0 rounded-full animate-ping opacity-20 bg-[var(--danger)]" />
                      <span className="material-symbols-outlined !text-[28px] drop-shadow-md text-[var(--danger)]">{t("icon_warning_amber")}</span>
                    </div>

                    <div className="flex flex-col">
                      <h3 className="text-[10px] font-black capitalize tracking-[0.2em] text-[var(--danger)]">{t("urgent_alert")}</h3>
                      <p className="text-sm font-bold text-[var(--text)] tracking-wide group-hover:text-[var(--danger)] transition-colors line-clamp-1">{urgentBroadcast.title}</p>
                    </div>
                  </div>

                  <div className="flex items-center md:ml-auto relative z-10">
                    <button onClick={(e) => { e.stopPropagation(); localStorage.setItem('sanctuary_dismissed_alert_id', String(urgentBroadcast.id)); setUrgentBroadcast(null); }} className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--danger)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] transition-all active:scale-95 group/close" >
                      <span className="material-symbols-outlined !text-[20px] group-hover/close:rotate-90 transition-transform duration-300">close</span>
                    </button>
                  </div>
                </div>
              )}

              {hasSymlinkPerms === false && (
                <div className="relative w-full rounded-2xl p-4 md:px-6 overflow-hidden flex flex-col md:flex-row md:items-center gap-4 cursor-default z-20 shadow-md border glass-surface" style={{ backgroundColor: 'color-mix(in srgb, var(--warning) 8%, transparent)', borderColor: 'color-mix(in srgb, var(--warning) 30%, transparent)' }}>
                  <div className="absolute top-0 left-0 w-[400px] h-[400px] rounded-full blur-[80px] opacity-20 pointer-events-none -translate-x-1/2 -translate-y-1/2 bg-[var(--warning)]" />

                  <div className="flex items-center gap-4 relative z-10">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 relative bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] border border-[color-mix(in_srgb,var(--warning)_40%,transparent)]">
                      <span className="material-symbols-outlined !text-[28px] drop-shadow-md text-[var(--warning)]">{t("icon_warning_amber")}</span>
                    </div>

                    <div className="flex flex-col">
                      <h3 className="text-[10px] font-black capitalize tracking-[0.2em] text-[var(--warning)]">{t("perm_restricted")}</h3>
                      <p className="text-sm font-bold text-[var(--text)] tracking-wide line-clamp-1">{t("perm_desc")}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 md:ml-auto relative z-10">
                    <button onClick={() => invoke("open_developer_settings")} className="h-9 px-4 rounded-full border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] text-[var(--warning)] transition-all flex items-center gap-2 shadow-sm font-black capitalize tracking-widest text-[10px]">
                      <span className="material-symbols-outlined !text-[16px]">{t("icon_settings")}</span>
                      <span>{t("perm_btn_dev")}</span>
                    </button>
                    <button onClick={checkPerms} className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--warning)] hover:bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] transition-all shadow-sm group/refresh" >
                      <span className="material-symbols-outlined !text-[18px] group-hover/refresh:rotate-180 transition-transform duration-500">{t("icon_refresh")}</span>
                    </button>
                  </div>
                </div>
              )}

              {radarState !== 'optimal' && (() => {
                const alertVar = radarState === 'critical' ? 'var(--danger)' : radarState === 'warning' ? 'var(--warning)' : 'var(--accent)';
                const alertIcon = radarState === 'critical' ? 'gpp_bad' : radarState === 'warning' ? 'gpp_maybe' : 'update';

                return (
                  <div className="relative w-full rounded-2xl p-4 md:px-6 overflow-hidden flex flex-col md:flex-row md:items-center gap-4 z-20 shadow-md border group/radar glass-surface" style={{ backgroundColor: `color-mix(in srgb, ${alertVar} 8%, transparent)`, borderColor: `color-mix(in srgb, ${alertVar} 30%, transparent)` }}>
                    <div className="absolute top-0 left-0 w-[400px] h-[400px] rounded-full blur-[80px] opacity-20 pointer-events-none -translate-x-1/2 -translate-y-1/2 transition-opacity duration-500 group-hover/radar:opacity-30" style={{ backgroundColor: alertVar }} />

                    <div className="flex items-center gap-4 relative z-10">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 relative" style={{ backgroundColor: `color-mix(in srgb, ${alertVar} 15%, transparent)`, border: `1px solid color-mix(in srgb, ${alertVar} 40%, transparent)` }}>
                        {radarState === 'critical' && <div className="absolute inset-0 rounded-full animate-ping opacity-20" style={{ backgroundColor: alertVar }} />}
                        <span className="material-symbols-outlined !text-[28px] drop-shadow-md" style={{ color: alertVar }}>{t(`ui_icon_${alertIcon}`) || alertIcon}</span>
                      </div>

                      <div className="flex flex-col">
                        <h3 className="text-[10px] font-black capitalize tracking-[0.2em]" style={{ color: alertVar }}>
                          {radarState === 'critical' ? t("action_fatal") : radarState === 'warning' ? t("action_incompatibilities") : t("attention_required")}
                        </h3>
                        <p className="text-sm font-bold text-[var(--text)] tracking-wide line-clamp-1">
                          {radarState === 'critical' ? t("critical_action_short") : radarState === 'warning' ? t("action_rec") : t("update_suggested")}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 md:ml-auto relative z-10 shrink-0">
                      {activeUpdates.length > 0 && (
                        <button onClick={() => setShowUpdatesModal(true)} title={`${activeUpdates.length} ${t("updates_modal_title")}`} className="h-10 px-4 rounded-xl border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] transition-all flex items-center justify-center gap-2 shadow-sm font-black text-sm">
                          <span className="material-symbols-outlined !text-[18px]">{t("icon_update")}</span>
                          <span>{activeUpdates.length}</span>
                        </button>
                      )}

                      {(radarBrokenCount + radarUnstableCount) > 0 && (
                        <button onClick={() => setShowIncompatiblePanel(true)} title={`${radarBrokenCount} ${t("status_broken")} / ${radarUnstableCount} ${t("label_unstable")}`} className="h-10 px-4 rounded-xl border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] text-[var(--danger)] transition-all flex items-center justify-center gap-3 shadow-sm font-black text-sm">
                          {radarBrokenCount > 0 && (
                            <div className="flex items-center gap-1.5">
                              <span className="material-symbols-outlined !text-[18px]">gpp_bad</span>
                              <span>{radarBrokenCount}</span>
                            </div>
                          )}
                          {radarBrokenCount > 0 && radarUnstableCount > 0 && <div className="w-[1px] h-4 bg-[var(--danger)] opacity-30" />}
                          {radarUnstableCount > 0 && (
                            <div className="flex items-center gap-1.5 opacity-80">
                              <span className="material-symbols-outlined !text-[18px]">gpp_maybe</span>
                              <span>{radarUnstableCount}</span>
                            </div>
                          )}
                        </button>
                      )}

                      {activeConflictCount.total > 0 && (
                        <button onClick={() => setShowConflictsPanel(true)} title={`${activeConflictCount.tier4} ${t("stat_tier4")} / ${activeConflictCount.tier3} ${t("stat_tier3")}`} className="h-10 px-4 rounded-xl border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] text-[var(--warning)] transition-all flex items-center justify-center gap-3 shadow-sm font-black text-sm">
                          {activeConflictCount.tier4 > 0 && (
                            <div className="flex items-center gap-1.5 text-[var(--danger)]">
                              <span className="material-symbols-outlined !text-[18px]">gpp_bad</span>
                              <span>{activeConflictCount.tier4}</span>
                            </div>
                          )}
                          {activeConflictCount.tier4 > 0 && activeConflictCount.tier3 > 0 && <div className="w-[1px] h-4 bg-[var(--warning)] opacity-30" />}
                          {activeConflictCount.tier3 > 0 && (
                            <div className="flex items-center gap-1.5">
                              <span className="material-symbols-outlined !text-[18px]">{t("icon_warning_amber")}</span>
                              <span>{activeConflictCount.tier3}</span>
                            </div>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl glass-panel text-[var(--accent)] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined !text-[20px]">satellite_alt</span>
            </div>
            <h2 className="text-lg font-black capitalize tracking-widest text-[var(--text)]">Comm-Link Feed</h2>
          </div>
          <MasonFeed onOpenMasonProfile={handleOpenMasonProfile} noCardWrapper={true} gridCols="grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3" />
        </div>

        {/* Right Column: Quick Actions */}
        <div className="w-full lg:w-[420px] shrink-0 flex flex-col gap-6">
          <CommandScreenSectionHeading title={t("quick_actions")} icon={t("icon_bolt")} />

          <div className="flex flex-col gap-4">
            {activeGameSchema?.features?.has_cc !== false && (
              <CommandScreenQuickLink
                icon={t("icon_radar")}
                title={(t("btn_radar")).replace(/^[^\w]*/, '').trim()}
                subtitle={t("btn_radar_desc")}
                onClick={() => runRadarSweep(false)}
                textColorClass="text-[color-mix(in_srgb,var(--success)_80%,transparent)]"
                hoverTextColorClass="group-hover:text-emerald-400"
                iconShadowClass="drop-shadow-md"
                iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--success)_30%,transparent)]"
              />
            )}

            {activeGameSchema?.features?.has_cc !== false && (
              <CommandScreenQuickLink
                icon={shelterActive ? t("icon_lock") : t("icon_lock_open")}
                title={shelterActive ? ((t("btn_reclaim")).replace(/^[^\w]*/, '').trim()) : ((t("btn_lockdown")).replace(/^[^\w]*/, '').trim())}
                subtitle={shelterActive ? t("btn_bunker_unlock_desc") : t("btn_bunker_lock_desc")}
                onClick={() => triggerShelter(!shelterActive)}
                textColorClass="text-[color-mix(in_srgb,var(--accent)_80%,transparent)]"
                hoverTextColorClass="group-hover:text-cyan-400"
                iconShadowClass="drop-shadow-md"
                iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
              />
            )}

            <div className="relative group/supportdesk w-full">
              {!session && (
                <HoverTooltip
                  variant="danger"
                  title={localStorage.getItem("sanctuary_blacklisted") === "true" ? t("alert_comm_banned") : t("alert_guest_mode_uploads")}
                  subtitle={localStorage.getItem("sanctuary_blacklisted") === "true" ? t("alert_comm_banned_desc") : t("alert_guest_mode_desc")}
                  className="group-hover/supportdesk:flex z-[1000]"
                />
              )}
              <div className={!session ? 'opacity-50 cursor-not-allowed' : ''}>
                <CommandScreenQuickLink
                  icon={t("icon_local_activity")}
                  title={t("support_title")}
                  subtitle={t("btn_submit_ticket_desc")}
                  onClick={() => { if (setIsSupportDeskOpen && session) setIsSupportDeskOpen(true); }}
                  textColorClass="text-[color-mix(in_srgb,var(--accent)_80%,transparent)]"
                  hoverTextColorClass="group-hover:text-purple-400"
                  iconShadowClass="drop-shadow-md"
                  iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
                />
              </div>
            </div>

            <CommandScreenQuickLink
              icon="history"
              title={t("audit_title")}
              subtitle={t("audit_logs_desc")}
              onClick={() => setIsAuditLogsOpen(true)}
              textColorClass="text-[color-mix(in_srgb,var(--accent)_80%,transparent)]"
              hoverTextColorClass="group-hover:text-blue-400"
              iconShadowClass="drop-shadow-md"
              iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
            />

            {!urgentBroadcast && (
              <CommandScreenQuickLink
                icon="warning_off"
                title={t("title_sanctuary_alerts") || "Sanctuary Alerts"}
                subtitle={t("alert_empty") || "SYSTEM BROADCASTS"}
                onClick={() => setIsAlertsOpen(true)}
                textColorClass="text-[color-mix(in_srgb,var(--warning)_80%,transparent)]"
                hoverTextColorClass="group-hover:text-amber-400"
                iconShadowClass="drop-shadow-md"
                iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--warning)_30%,transparent)]"
              />
            )}
          </div>
        </div>
      </div>

      <AuditLogViewer
        isSidePanel={true}
        isOpen={isAuditLogsOpen}
        onClose={() => setIsAuditLogsOpen(false)}
        hideEditIdentity={true}
      />

      <SanctuaryAlertsSidePanel
        isOpen={isAlertsOpen}
        onClose={() => setIsAlertsOpen(false)}
        audience="Citizens"
      />

      {viewingPost && <MasonPostViewer post={viewingPost} onClose={() => setViewingPost(null)} userId={session?.user?.id || null} />}
    </div>
  );
}
