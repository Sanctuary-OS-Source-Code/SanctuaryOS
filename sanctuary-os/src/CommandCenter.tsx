import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { useLexicon } from "./LexiconContext";
import { DashboardStatTile, ViewHeader, isVersionMatch, SidePanel, getHighestVersion, handleOpenUrl, getExtensionRegex, HoverTooltip, ActionButton } from "./shared";
import { usePlaySetLogic } from "./hooks/usePlaySetLogic";
import { useStore } from "./store";
import { useModalStore } from "./store/modalStore";
import MasonFeed from "./MasonFeed";

import CommandAlertsPanel from "./side-panels/CommandAlertsPanel";
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
  const [alertsPanelMode, setAlertsPanelMode] = useState<"critical" | "alert" | null>(null);
  const [viewingPost, setViewingPost] = useState<any>(null);
  const [urgentBroadcast, setUrgentBroadcast] = useState<any>(null);
  const [dismissedBroadcastId, setDismissedBroadcastId] = useState(localStorage.getItem('sanctuary_dismissed_alert_id'));
  
  const [dismissedCritical, setDismissedCritical] = useState<string | null>(localStorage.getItem('sanctuary_dismiss_critical'));
  const [dismissedAlerts, setDismissedAlerts] = useState<string | null>(localStorage.getItem('sanctuary_dismiss_alerts'));

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
          setUrgentBroadcast(data[0]);
        } else {
          setUrgentBroadcast(null);
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
    <div className="flex flex-col pb-24 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <ViewHeader title={t("center_title")} subtitle={t("center_subtitle")} icon={t("icon_desktop_windows")} iconColorClass="text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]" />

      {(() => {
        const currentCritical = String(radarTier4Count + radarBrokenCount);
        const currentAlerts = String(radarTier3Count + radarUnstableCount);
        const showCritical = (radarTier4Count + radarBrokenCount) > 0;
        const showAlerts = (radarTier3Count + radarUnstableCount) > 0;

        const hasCriticalOrAlerts = hasSymlinkPerms === false || 
          (activeGameSchema?.features?.has_cc !== false && (showCritical || showAlerts)) ||
          (urgentBroadcast && localStorage.getItem("sanctuary_notify_alert_banner") !== "false");

        const updatesOrStableElements = [];
        if (activeGameSchema?.features?.has_cc !== false && radarUpdatesCount > 0) {
          updatesOrStableElements.push(
            <div key="updates" className="relative group/updates flex-1 flex min-w-0 w-full h-full">
              <HoverTooltip
                variant="accent"
                title={t("updates_avail") || "Updates Available"}
                subtitle={t("updates_det") || "Artifact updates detected."}
                className="group-hover/updates:flex z-[1000] w-full"
              />
              <DashboardStatTile
                icon={<span className="material-symbols-outlined ">{t("icon_update")}</span>}
                number={radarUpdatesCount}
                label={t("updates_avail") || "Updates Available"}
                disableBgStrip={true}
                colorClass="!bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] !border-[color-mix(in_srgb,var(--accent)_30%,transparent)] !text-[var(--accent)] shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_10%,transparent)] w-full"
                onClick={() => setShowUpdatesModal(true)}
              />
            </div>
          );
        }
        if (hasSymlinkPerms !== false && radarState === 'optimal') {
          updatesOrStableElements.push(
            <DashboardStatTile
              key="stable"
              icon={<span className="material-symbols-outlined ">{t("icon_check_circle")}</span>}
              number={activeGameSchema?.features?.has_cc === false ? "-" : "0"}
              label={activeGameSchema?.features?.has_cc === false ? t("radar_title") : t("sys_stable")}
              disableBgStrip={true}
              colorClass="!bg-[color-mix(in_srgb,var(--success)_10%,transparent)] !border-[color-mix(in_srgb,var(--success)_20%,transparent)] !text-[var(--success)]"
              onClick={() => setIsConflictRadarOpen(true)}
            />
          );
        }

        const normalStatsElements = [
          <DashboardStatTile
            key="vault"
            icon={<span className="material-symbols-outlined ">{t("icon_account_balance")}</span>}
            number={activeGameSchema?.features?.has_cc === false ? "-" : (modList?.length || 0)}
            label={t("vault_title")}
            colorClass="text-[var(--accent)]"
            onClick={() => { if (activeGameSchema?.features?.has_cc !== false) { if (setView) setView("vault"); if (setFilterStatus) setFilterStatus("ALL"); } }}
          />,
          <DashboardStatTile
            key="nexus"
            icon={<span className="material-symbols-outlined ">{t("icon_hub")}</span>}
            number={nexusCount}
            label={t("market_title")}
            colorClass="text-[var(--text)]"
            onClick={() => { if (setView) setView("nexus"); }}
          />,
          <DashboardStatTile
            key="blueprints"
            icon={<span className="material-symbols-outlined ">{t("icon_map")}</span>}
            number={activeGameSchema?.features?.has_cc === false ? "-" : (playSets?.length || 0)}
            label={t("stat_blueprints")}
            colorClass="text-[var(--accent)]"
            onClick={() => { if (activeGameSchema?.features?.has_cc !== false) setIsBlueprintSwapOpen(true); }}
          />,
          <div key="support" className="relative group/ticket flex-1 flex min-w-0">
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
        ];

        if (hasCriticalOrAlerts) {
          return (
            <>
              <div className="mb-4">
                <CommandScreenStats>
                  {hasSymlinkPerms === false && (
                    <div key="perms" className="relative group/perms flex-1 flex min-w-0 w-full h-full">
                      <HoverTooltip
                        variant="warning"
                        title={t("perm_restricted")}
                        subtitle={t("perm_hover_desc") || t("perm_desc")}
                        className="group-hover/perms:flex z-[1000] w-full"
                      />
                      <DashboardStatTile
                        icon={<span className="material-symbols-outlined ">warning</span>}
                        number="!"
                        label={t("perm_restricted")}
                        disableBgStrip={true}
                        colorClass="!bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] !border-[color-mix(in_srgb,var(--warning)_30%,transparent)] !text-[var(--warning)] animate-pulse w-full"
                        onClick={() => invoke("open_developer_settings")}
                      />
                    </div>
                  )}
                  {urgentBroadcast && dismissedBroadcastId !== String(urgentBroadcast.id) && (
                    <div key="broadcast" className="relative group/broadcast flex-1 flex min-w-0 w-full h-full">
                      <HoverTooltip
                        variant="danger"
                        title={urgentBroadcast.title || 'SYSTEM BROADCAST'}
                        subtitle={urgentBroadcast.message || urgentBroadcast.content}
                        className="group-hover/broadcast:flex z-[1000] w-full"
                      />
                      <DashboardStatTile
                        icon={<span className="material-symbols-outlined ">{urgentBroadcast.icon || 'campaign'}</span>}
                        number="!"
                        label={urgentBroadcast.title || 'SYSTEM BROADCAST'}
                        disableBgStrip={true}
                        colorClass="!bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] !border-[color-mix(in_srgb,var(--danger)_40%,transparent)] !text-[var(--danger)] shadow-[0_0_20px_color-mix(in_srgb,var(--danger)_15%,transparent)] animate-pulse w-full"
                        onClick={() => setViewingPost({ ...urgentBroadcast, content: urgentBroadcast.message || urgentBroadcast.content, mason_id: 'system', views: 0, likes: 0, replies: 0 })}
                      />
                      <button 
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          localStorage.setItem("sanctuary_dismissed_alert_id", String(urgentBroadcast.id)); 
                          setDismissedBroadcastId(String(urgentBroadcast.id));
                        }}
                        className="absolute top-4 right-4 w-8 h-8 rounded-[10px] bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] flex items-center justify-center opacity-0 group-hover/broadcast:opacity-100 transition-all duration-300 z-20 hover:scale-110 hover:shadow-[0_0_15px_color-mix(in_srgb,var(--danger)_30%,transparent)] backdrop-blur-md cursor-pointer shadow-md"
                      >
                        <HoverTooltip title="Dismiss Alert" variant="danger" />
                        <span className="material-symbols-outlined !text-[16px]">{t("icon_close") || "close"}</span>
                      </button>
                    </div>
                  )}
                  {activeGameSchema?.features?.has_cc !== false && showCritical && (
                    <div key="critical" className="relative group/critical flex-1 flex min-w-0 w-full h-full">
                      <HoverTooltip
                        variant="danger"
                        title={t("critical_failures_detected") || "Critical Failures"}
                        subtitle={t("radar_fatal_desc") || "Severe conflict detected. Click to view full diagnostic sweep."}
                        className="group-hover/critical:flex z-[1000] w-full"
                      />
                      <DashboardStatTile
                        icon={<span className="material-symbols-outlined ">gpp_bad</span>}
                        number={radarTier4Count + radarBrokenCount}
                        label={t("critical_failures_detected") || "Critical Failures"}
                        disableBgStrip={true}
                        colorClass="!bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] !border-[color-mix(in_srgb,var(--danger)_30%,transparent)] !text-[var(--danger)] shadow-[0_0_15px_color-mix(in_srgb,var(--danger)_10%,transparent)] animate-pulse w-full"
                        onClick={() => setAlertsPanelMode('critical')}
                      />
                    </div>
                  )}
                  {activeGameSchema?.features?.has_cc !== false && showAlerts && (
                    <div key="alerts" className="relative group/alerts flex-1 flex min-w-0 w-full h-full">
                      <HoverTooltip
                        variant="warning"
                        title={t("system_alerts_title") || "System Alerts"}
                        subtitle={t("radar_tuning_desc") || "Potential issues detected. Click to view full diagnostic sweep."}
                        className="group-hover/alerts:flex z-[1000] w-full"
                      />
                      <DashboardStatTile
                        icon={<span className="material-symbols-outlined ">{t("icon_warning_amber")}</span>}
                        number={radarTier3Count + radarUnstableCount}
                        label={t("system_alerts_title") || "System Alerts"}
                        disableBgStrip={true}
                        colorClass="!bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] !border-[color-mix(in_srgb,var(--warning)_30%,transparent)] !text-[var(--warning)] shadow-[0_0_15px_color-mix(in_srgb,var(--warning)_10%,transparent)] w-full"
                        onClick={() => setAlertsPanelMode('alert')}
                      />
                    </div>
                  )}
                  {updatesOrStableElements}
                </CommandScreenStats>
              </div>
              <CommandScreenStats>
                {normalStatsElements}
              </CommandScreenStats>
            </>
          );
        }

        return (
          <CommandScreenStats>
            {updatesOrStableElements}
            {normalStatsElements}
          </CommandScreenStats>
        );
      })()}

      {/* Main Content Area: Feed and Quick Actions */}
      <div className="flex flex-col xl:flex-row gap-6 mt-8 relative z-20">

        {/* Left Column: Feed & Alerts */}
        <div className="flex-1 min-w-0 flex flex-col gap-6">



          <CommandScreenSectionHeading title={t("feed_title") || "Comm-Link Feed"} icon="satellite_alt" />
          <MasonFeed onOpenMasonProfile={handleOpenMasonProfile} noCardWrapper={true} gridCols="grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3" />
        </div>

        {/* Right Column: Quick Actions */}
        <div className="w-full lg:w-[420px] shrink-0 flex flex-col gap-6">
          <CommandScreenSectionHeading title={t("quick_actions")} icon={t("icon_bolt")} />

          <div className="flex flex-col gap-4">
            {(urgentBroadcast || (radarTier4Count + radarBrokenCount) > 0 || (radarTier3Count + radarUnstableCount) > 0 || hasSymlinkPerms === false) ? (
              <CommandScreenQuickLink 
                icon="priority_high"
                title={t("title_sanctuary_alerts") || "Sanctuary Alerts"}
                subtitle={urgentBroadcast ? (t("urgent_alert_active") || "URGENT SYSTEM BROADCAST") : (t("title_system_alerts") || "SYSTEM ALERTS ACTIVE")}
                onClick={() => setIsAlertsOpen(true)}
                textColorClass="text-[var(--danger)]"
                hoverTextColorClass="group-hover:text-red-400"
                iconShadowClass="drop-shadow-[0_0_8px_currentColor]"
                iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)]"
                isAlert={true}
              />
            ) : (
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

      <CommandAlertsPanel
        isOpen={alertsPanelMode !== null}
        onClose={() => setAlertsPanelMode(null)}
        mode={alertsPanelMode || 'critical'}
        playSet={activePlaySet}
        modList={modList}
        allow_write={hasSymlinkPerms !== false}
        vaultPath={modsPath}
        toggleInActiveSet={toggleInActiveSet}
      />
    </div>
  );
}




