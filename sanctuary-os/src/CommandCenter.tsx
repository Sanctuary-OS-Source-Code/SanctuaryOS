import React, { useState, useEffect } from "react";
import { isDesktop } from "./utils/envUtils";
import { invoke } from "@tauri-apps/api/core";
import { useLexicon } from "./LexiconContext";
import { DashboardStatTile, ViewHeader, getExtensionRegex, HoverTooltip, stripMarkdown } from "./shared";
import { useStore } from "./store";
import { useModalStore } from "./store/modalStore";
import MasonFeed from "./MasonFeed";
import { dispatchSanctuaryNotification } from "./utils/notificationHelper";

import CommandAlertsPanel from "./side-panels/CommandAlertsPanel";
import { AuditLogViewer } from "./side-panels/SAAuditLogViewer";
import { groupUpdateMods } from './side-panels/CommandCenterSidePanels';
import { evaluateModIssues, groupBrokenMods } from "./side-panels/CommandIncompatiblePanel";
import MasonPostViewer from "./side-panels/MasonPostViewer";
import { CommandScreenStats, CommandScreenSectionHeading, CommandScreenQuickLink } from "./hub-components/SharedCommandScreenLayout";
import { SanctuaryAlertsSidePanel } from "./side-panels/SanctuaryAlertsSidePanel";
import { CommunitySupportSidePanel } from "./side-panels/CommunitySupportSidePanel";
import { extractDispatchMetadata, formatDispatchCategory } from "./components/universal/DispatchPollAndMeta";
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
  const ignoredGlobal = useStore((state) => state.ignoredGlobal);

  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const { setShowUpdatesModal, setIsConflictRadarOpen, setIsBlueprintSwapOpen } = useModalStore();
  const [hasSymlinkPerms, setHasSymlinkPerms] = useState<boolean | null>(null);

  const [isAuditLogsOpen, setIsAuditLogsOpen] = useState(false);
  const [isSupportPanelOpen, setIsSupportPanelOpen] = useState(false);
  const isAlertsOpen = useStore((state) => state.isAlertsOpen);
  const setIsAlertsOpen = useStore((state) => state.setIsAlertsOpen);
  const [alertsPanelMode, setAlertsPanelMode] = useState<"critical" | "alert" | null>(null);
  const [viewingPost, setViewingPost] = useState<any>(null);
  const [urgentBroadcast, setUrgentBroadcast] = useState<any>(null);
  const [dismissedBroadcastId, setDismissedBroadcastId] = useState(localStorage.getItem('sanctuary_dismissed_alert_id'));
  const [nexusCount, setNexusCount] = useState<number | "-">("-");
  const [ticketCount, setTicketCount] = useState<number | "-">("-");

  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);
  const workspaces = useStore((state) => state.workspaces);

  const checkPerms = () => {
    invoke<boolean>("check_symlink_permissions")
      .then(res => setHasSymlinkPerms(res))
      .catch(() => setHasSymlinkPerms(false));
  };

  useEffect(() => {
    checkPerms();
    if (activeWorkspaceId === 'default_workspace' || !workspaces || workspaces.length === 0) return;

    import('./supabase').then(async ({ supabase }) => {
      if (!navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true") return;

      const fetchUrgent = async () => {
        const { data } = await supabase.from('system_broadcasts').select('*').eq('is_active', true).eq('is_pinned', true).or('target_audience.ilike.%All%,target_audience.eq.Citizens,target_audience.ilike."Citizens,%",target_audience.ilike."%,Citizens,%",target_audience.ilike."%,Citizens"').order('created_at', { ascending: false }).limit(1);
        if (data && data.length > 0) {
          setUrgentBroadcast((prev: any) => {
            if (!prev || prev.id !== data[0].id) {
              if (localStorage.getItem("sanctuary_dismissed_alert_id") !== String(data[0].id)) {
                dispatchSanctuaryNotification({
                  uniqueId: `urgent_broadcast:${data[0].id}`,
                  category: 'alert_banner',
                  title: data[0].title || t('notify_alert_banner', 'Urgent Global Alert'),
                  body: data[0].message || data[0].content || '',
                  data: { broadcastId: data[0].id, type: 'urgent_broadcast' },
                });
              }
            }
            return data[0];
          });
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
        let errors = [];
        if (assetsRes.error) errors.push(assetsRes.error);
        if (modsRes.error) errors.push(modsRes.error);
        if (bpRes.error) errors.push(bpRes.error);

        if (errors.length > 0) {
          setNexusCount(errors[0].message as any);
        } else {
          if (assetsRes.count != null) total += assetsRes.count;
          if (modsRes.count != null) total += modsRes.count;
          if (bpRes.count != null) total += bpRes.count;
          setNexusCount(total);
        }

        fetchUrgent();
      } catch (err: any) {
        console.error("Failed to fetch total nexus count", err);
        setNexusCount(err.message || "EXCEPTION THROWN");
      }

      supabase.auth.getSession().then(({ data }) => {
        if (data.session?.user?.id) {
          supabase.from('sanctuary_tickets').select('id', { count: 'exact', head: true }).eq('author_id', data.session.user.id).then(({ count }) => {
            if (count !== null) setTicketCount(count);
          });
        }
      });
    });
  }, [activeWorkspaceId, workspaces]);

  useEffect(() => {
    if (hasSymlinkPerms === true || hasSymlinkPerms === null) return;
    const interval = setInterval(checkPerms, 3000);
    return () => clearInterval(interval);
  }, [hasSymlinkPerms]);

  const cachedStoreBrokenCounts = useStore((state) => state.activeBrokenCounts);
  const activeBlueprintMods = React.useMemo(() => {
    if (!activePlaySet) return [];
    const safeMods = Array.isArray(activePlaySet.mods) ? activePlaySet.mods : [];
    const safeList = Array.isArray(modList) ? modList : [];

    const exactMatchMap = new Map();
    const baseMatchMap = new Map();

    // Build O(1) lookup maps once (including virtual folder flavors)
    const flatMods = safeList.flatMap((m: any) => (Array.isArray(m?.flavors) ? [...m.flavors, m] : [m]));
    for (const m of flatMods) {
      if (!m?.name) continue;
      const exactKey = m.name.toLowerCase().replace(/\\/g, '/');
      exactMatchMap.set(exactKey, m);

      const baseKey = m.name.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), '').toLowerCase();
      if (baseKey) {
        if (!baseMatchMap.has(baseKey)) {
          baseMatchMap.set(baseKey, m);
        }
      }
    }

    const netUpdated = Array.isArray(networkUpdates?.updated) ? networkUpdates.updated : [];
    const netBroken = Array.isArray(networkUpdates?.broken) ? networkUpdates.broken : [];
    const netObsolete = Array.isArray(networkUpdates?.obsolete) ? networkUpdates.obsolete : [];

    const enrichWithNetState = (matched: any) => {
      let res = matched;
      const upd = netUpdated.find((u: any) => (u.hash && u.hash === res.hash) || (u.name && u.name === res.name));
      if (upd && !res.hasUpdate) {
        res = {
          ...res,
          hasUpdate: true,
          newVersion: upd.newVersion || res.newVersion,
          newGameVersion: upd.newGameVersion || res.newGameVersion,
          download_url: upd.download_url || res.download_url,
        };
      }
      if (netBroken.some((b: any) => (b.hash && b.hash === res.hash) || (b.name && b.name === res.name)) && res.status !== 'broken') {
        res = { ...res, status: 'broken' };
      } else if (netObsolete.some((b: any) => (b.hash && b.hash === res.hash) || (b.name && b.name === res.name)) && res.status !== 'obsolete') {
        res = { ...res, status: 'obsolete' };
      }
      return res;
    };

    return safeMods.map((rawMod: any) => {
      const modName = typeof rawMod === 'string' ? rawMod : String(rawMod?.name || rawMod?.path || '');
      const cleanModName = modName.replace(/^(sanctuary[/\\])+/i, '');
      const modNameLow = cleanModName.toLowerCase().replace(/\\/g, '/');

      const exactMatch = exactMatchMap.get(modNameLow);
      if (exactMatch) return { ...enrichWithNetState(exactMatch), _originalSetName: modName };

      const mBase = modName.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), '').toLowerCase();

      const baseMatch = mBase ? baseMatchMap.get(mBase) : undefined;
      if (baseMatch) return { ...enrichWithNetState(baseMatch), _originalSetName: modName };

      return { id: `missing-${modName}`, name: modName, isFallback: true, color: 'theme-border-danger', physical_path: null, hash: 'vlocal' };
    });
  }, [activePlaySet, modList, activeGameSchema, networkUpdates]);

  const activeUpdates = React.useMemo(() => {
    const hasLoadedMods = Array.isArray(modList) && modList.length > 0;
    if (!hasLoadedMods && Array.isArray(networkUpdates?.updated) && networkUpdates.updated.length > 0 && activePlaySet) {
      const safeModNames = new Set(
        (Array.isArray(activePlaySet.mods) ? activePlaySet.mods : []).map((rm: any) => {
          const n = typeof rm === 'string' ? rm : String(rm?.name || rm?.path || '');
          return n.replace(/^(sanctuary[/\\])+/i, '').toLowerCase().replace(/\\/g, '/');
        })
      );
      const matchedCachedUpdates = networkUpdates.updated.filter((u: any) => {
        if (!u?.name) return false;
        const cleanU = String(u.name).replace(/^(sanctuary[/\\])+/i, '').toLowerCase().replace(/\\/g, '/');
        return safeModNames.has(cleanU);
      });
      return groupUpdateMods(matchedCachedUpdates);
    }
    const rawUpdates = activeBlueprintMods
      .filter((m: any) => m.hasUpdate)
      .map((m: any) => ({
        ...m,
        dbId: m.dbId,
      }));
    return groupUpdateMods(rawUpdates);
  }, [activeBlueprintMods, modList, networkUpdates, activePlaySet]);
  const activeBrokenCounts = React.useMemo(() => {
    const hasLoadedMods = Array.isArray(modList) && modList.length > 0;
    if (!hasLoadedMods && cachedStoreBrokenCounts && (cachedStoreBrokenCounts.broken > 0 || cachedStoreBrokenCounts.unstable > 0)) {
      return cachedStoreBrokenCounts;
    }
    const evaluated = activeBlueprintMods
      .map((mod: any) =>
        evaluateModIssues(mod, {
          activeMods: activeBlueprintMods,
          selectedVersion,
          ownedDLC,
          maskedDLC,
          t,
          activeGameSchema,
        })
      )
      .filter(Boolean);

    const grouped = groupBrokenMods(evaluated);
    return grouped.reduce(
      (acc: { broken: number; unstable: number }, m: any) => {
        if (m._alert_type === "red") acc.broken += 1;
        else if (m._alert_type === "amber") acc.unstable += 1;
        return acc;
      },
      { broken: 0, unstable: 0 }
    );
  }, [activeBlueprintMods, modList, cachedStoreBrokenCounts, selectedVersion, ownedDLC, maskedDLC, t, activeGameSchema]);

  const [radarCacheTick, setRadarCacheTick] = React.useState(0);
  React.useEffect(() => {
    const handleRadarCacheUpdate = () => setRadarCacheTick((c) => c + 1);
    window.addEventListener("sanctuary-radar-cache-updated", handleRadarCacheUpdate);
    return () => window.removeEventListener("sanctuary-radar-cache-updated", handleRadarCacheUpdate);
  }, []);

  const activeConflictCount = React.useMemo(() => {
    let tier3Count = 0;
    let tier4Count = 0;
    let total = 0;

    try {
      const scopeKey = activeSetName || activePlaySet?.name || "";
      const cachedRaw = scopeKey ? localStorage.getItem(`sanctuary_radar_cache_${scopeKey}`) : null;
      if (cachedRaw) {
        const parsedCache = JSON.parse(cachedRaw);
        const fatalList = Array.isArray(parsedCache?.fatal) ? parsedCache.fatal : [];
        const tuningList = Array.isArray(parsedCache?.tuning) ? parsedCache.tuning : [];
        const cloneList = Array.isArray(parsedCache?.clone) ? parsedCache.clone : [];
        tier4Count = fatalList.filter((c: any) => !ignoredGlobal.includes(c.mod_pair)).length;
        tier3Count =
          tuningList.filter((c: any) => !ignoredGlobal.includes(c.mod_pair)).length +
          cloneList.filter((c: any) => !ignoredGlobal.includes(c.mod_pair)).length;
        total = tier4Count + tier3Count;
      }
      const stored = null;
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
  }, [activeBlueprintMods, ignoredGlobal, activeSetName, radarCacheTick]);

  React.useEffect(() => {
    if (Array.isArray(modList) && modList.length > 0) {
      useStore.getState().setActiveConflictCount(activeConflictCount);
    }
  }, [activeConflictCount.total, activeConflictCount.tier3, activeConflictCount.tier4, modList]);

  React.useEffect(() => {
    if (Array.isArray(modList) && modList.length > 0) {
      useStore.getState().setActiveBrokenCounts(activeBrokenCounts);
    }
  }, [activeBrokenCounts.broken, activeBrokenCounts.unstable, modList]);

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

  useEffect(() => {
    const handleOpenUrgent = () => {
      if (urgentBroadcast) {
        setViewingPost(urgentBroadcast);
      }
    };

    const handleOpenMalware = () => {
      setAlertsPanelMode("critical");
      setIsAlertsOpen(true);
    };

    window.addEventListener('open_urgent_broadcast', handleOpenUrgent);
    window.addEventListener('open_malware_alert', handleOpenMalware);

    return () => {
      window.removeEventListener('open_urgent_broadcast', handleOpenUrgent);
      window.removeEventListener('open_malware_alert', handleOpenMalware);
    };
  }, [urgentBroadcast]);

  return (
    <div className="flex flex-col pb-24 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <ViewHeader title={t("center_title", "Dashboard")} subtitle={t("center_subtitle", "System status & active deployment overview")} icon={t("icon_desktop_windows", "desktop_windows")} iconColorClass="text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]" />
      


      {(() => {
        const showCritical = (radarTier4Count + radarBrokenCount) > 0;
        const showAlerts = (radarTier3Count + radarUnstableCount) > 0;
        const showUrgentBroadcast = Boolean(
          urgentBroadcast &&
          dismissedBroadcastId !== String(urgentBroadcast.id) &&
          localStorage.getItem("sanctuary_notify_alert_banner") !== "false"
        );

        const systemTiles: React.ReactNode[] = [];

        if (hasSymlinkPerms === false && isDesktop()) {
          systemTiles.push(
            <div key="perms" className="relative group/perms flex-1 flex min-w-0 w-full h-full">
              <HoverTooltip
                variant="warning"
                title={t("perm_restricted", "Permissions Restricted")}
                subtitle={t("perm_hover_desc", "Application lacks sufficient permissions to manage your {Vault}. Enable Windows Developer Mode or run as Administrator.") || t("perm_desc", "Sanctuary OS lacks sufficient clearance to manage your {Vault}.")}
                className="group-hover/perms:flex z-[1000] w-full"
                vAlign="bottom"
              />
              <DashboardStatTile
                icon={<span className="material-symbols-outlined ">{t("icon_warning", "warning")}</span>}
                number="!"
                label={t("perm_restricted", "Permissions Restricted")}
                disableBgStrip={true}
                colorClass="!bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] !border-[color-mix(in_srgb,var(--warning)_30%,transparent)] !text-[var(--warning)] animate-pulse w-full"
                onClick={() => invoke("open_developer_settings")}
              />
            </div>
          );
        }

        if (showUrgentBroadcast) {
          const broadcastMeta = extractDispatchMetadata(urgentBroadcast);
          const broadcastAlertType = formatDispatchCategory(broadcastMeta.alertOrDispatchType, t);
          systemTiles.push(
            <div key="broadcast" className="relative group/broadcast flex-1 flex min-w-0 w-full h-full">
              <HoverTooltip
                variant="danger"
                title={urgentBroadcast.title || t("tile_global_alert", "Global Alert")}
                subtitle={stripMarkdown(broadcastMeta.cleanContent || urgentBroadcast.message || urgentBroadcast.content)}
                className="group-hover/broadcast:flex z-[1000] w-full"
                vAlign="bottom"
              />
              <DashboardStatTile
                icon={<span className="material-symbols-outlined ">{urgentBroadcast.icon || t("icon_campaign", "campaign")}</span>}
                number={broadcastAlertType}
                label={t("tile_global_alert", "Global Alert")}
                disableBgStrip={true}
                colorClass="!bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] !border-[color-mix(in_srgb,var(--danger)_40%,transparent)] !text-[var(--danger)] shadow-[0_0_20px_color-mix(in_srgb,var(--danger)_15%,transparent)] animate-pulse w-full"
                onClick={() => setViewingPost({ ...urgentBroadcast, content: urgentBroadcast.message || urgentBroadcast.content, mason_id: 'system', masons: { name: `${useStore.getState().activeGameSchema?.display_name || useStore.getState().activeGameSchema?.name || "Wayfinders"} Team` }, views: 0, likes: 0, replies: 0 })}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  localStorage.setItem("sanctuary_dismissed_alert_id", String(urgentBroadcast.id));
                  setDismissedBroadcastId(String(urgentBroadcast.id));
                }}
                className="absolute top-3.5 right-3.5 w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--danger)_42%,transparent)] text-[var(--danger)] hover:border-[color-mix(in_srgb,var(--danger)_65%,transparent)] flex items-center justify-center opacity-0 group-hover/broadcast:opacity-100 transition-all duration-300 z-20 hover:scale-105 cursor-pointer"
              >
                <HoverTooltip title={t("dismiss_alert", "Dismiss Alert")} variant="danger" vAlign="bottom" />
                <span className="material-symbols-outlined !text-[15px]">{t("icon_close", "close")}</span>
              </button>
            </div>
          );
        }

        if (activeGameSchema?.features?.has_cc !== false && showCritical) {
          systemTiles.push(
            <div key="critical" className="relative group/critical flex-1 flex min-w-0 w-full h-full">
              <HoverTooltip
                variant="danger"
                title={t("crit_fail", "critical failures") || "Critical Failures"}
                subtitle={t("radar_fatal_desc", "These {mods} overwrite the same core game files and cannot be used together. One must be removed.") || "Severe conflict detected. Click to view full diagnostic sweep."}
                className="group-hover/critical:flex z-[1000] w-full"
                vAlign="bottom"
              />
              <DashboardStatTile
                icon={<span className="material-symbols-outlined ">{t("icon_gpp_bad", "gpp_bad")}</span>}
                number={radarTier4Count + radarBrokenCount}
                label={t("crit_fail", "critical failures") || "Critical Failures"}
                disableBgStrip={true}
                colorClass="!bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] !border-[color-mix(in_srgb,var(--danger)_30%,transparent)] !text-[var(--danger)] shadow-[0_0_15px_color-mix(in_srgb,var(--danger)_10%,transparent)] animate-pulse w-full"
                onClick={() => setAlertsPanelMode('critical')}
              />
            </div>
          );
        }

        if (activeGameSchema?.features?.has_cc !== false && showAlerts) {
          systemTiles.push(
            <div key="alerts" className="relative group/alerts flex-1 flex min-w-0 w-full h-full">
              <HoverTooltip
                variant="warning"
                title={t("system_alerts_title", "System Alerts") || "System Alerts"}
                subtitle={t("radar_tuning_desc", "These {mods} edit the same features. One {mod} will override the changes of the other based on load order.") || "Potential issues detected. Click to view full diagnostic sweep."}
                className="group-hover/alerts:flex z-[1000] w-full"
                vAlign="bottom"
              />
              <DashboardStatTile
                icon={<span className="material-symbols-outlined ">{t("icon_warning_amber", "warning_amber")}</span>}
                number={radarTier3Count + radarUnstableCount}
                label={t("system_alerts_title", "System Alerts") || "System Alerts"}
                disableBgStrip={true}
                colorClass="!bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] !border-[color-mix(in_srgb,var(--warning)_30%,transparent)] !text-[var(--warning)] shadow-[0_0_15px_color-mix(in_srgb,var(--warning)_10%,transparent)] w-full"
                onClick={() => setAlertsPanelMode('alert')}
              />
            </div>
          );
        }

        if (activeGameSchema?.features?.has_cc !== false && radarUpdatesCount > 0) {
          systemTiles.push(
            <div key="updates" className="relative group/updates flex-1 flex min-w-0 w-full h-full">
              <HoverTooltip
                variant="accent"
                title={t("updates_avail", "Updates Available") || "Updates Available"}
                subtitle={t("updates_det", "{Mod} Updates Detected") || "Artifact Updates Detected"}
                className="group-hover/updates:flex z-[1000] w-full"
                vAlign="bottom"
              />
              <DashboardStatTile
                icon={<span className="material-symbols-outlined ">{t("icon_update", "update")}</span>}
                number={radarUpdatesCount}
                label={t("updates_avail", "Updates Available") || "Updates Available"}
                disableBgStrip={true}
                colorClass="!bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] !border-[color-mix(in_srgb,var(--accent)_30%,transparent)] !text-[var(--accent)] shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_10%,transparent)] w-full"
                onClick={() => setShowUpdatesModal(true)}
              />
            </div>
          );
        }

        if (hasSymlinkPerms !== false && radarState === 'optimal') {
          systemTiles.push(
            <DashboardStatTile
              key="stable"
              icon={<span className="material-symbols-outlined ">{t("icon_check_circle", "check_circle")}</span>}
              number={activeGameSchema?.features?.has_cc === false ? "-" : "0"}
              label={activeGameSchema?.features?.has_cc === false ? t("radar_title", "Conflict Scanner") : t("sys_stable", "System Stable")}
              disableBgStrip={true}
              colorClass="!bg-[color-mix(in_srgb,var(--success)_10%,transparent)] !border-[color-mix(in_srgb,var(--success)_20%,transparent)] !text-[var(--success)]"
              onClick={() => setIsConflictRadarOpen(true)}
            />
          );
        }

        const normalStatsElements = [
          isDesktop() && (
            <DashboardStatTile
              key="vault"
              icon={<span className="material-symbols-outlined ">{t("icon_account_balance", "account_balance")}</span>}
              number={activeGameSchema?.features?.has_cc === false ? "-" : (modList?.length || 0)}
              label={t("vault_title", "Your {Vault}")}
              colorClass="text-[var(--accent)]"
              onClick={() => { if (activeGameSchema?.features?.has_cc !== false) { if (setView) setView("vault"); if (setFilterStatus) setFilterStatus("ALL"); } }}
            />
          ),
          <DashboardStatTile
            key="nexus"
            icon={<span className="material-symbols-outlined ">{t("icon_hub", "hub")}</span>}
            number={nexusCount}
            label={t("market_title", "The {Nexus}")}
            colorClass="text-[var(--text)]"
            onClick={() => { if (setView) setView("nexus"); }}
          />,
          isDesktop() && (
            <DashboardStatTile
              key="blueprints"
              icon={<span className="material-symbols-outlined ">{t("icon_map", "map")}</span>}
              number={activeGameSchema?.features?.has_cc === false ? "-" : (playSets?.length || 0)}
              label={t("stat_blueprints", "Active {Blueprint}")}
              colorClass="text-[var(--accent)]"
              onClick={() => { if (activeGameSchema?.features?.has_cc !== false) setIsBlueprintSwapOpen(true); }}
            />
          ),
          <div key="support" className="relative group/ticket flex-1 flex min-w-0">
            {!session && (
              <HoverTooltip
                variant="danger"
                title={localStorage.getItem("sanctuary_blacklisted") === "true" ? t("alert_comm_banned", "Communications Restricted") : t("alert_guest_mode_uploads", "Guest Mode Active:\nUploads are disabled.")}
                subtitle={localStorage.getItem("sanctuary_blacklisted") === "true" ? t("alert_comm_banned_desc", "Your account has been restricted from posting or submitting content.") : t("alert_guest_mode_desc", "Guest mode is active. Login or register to access full features.")}
                className="group-hover/ticket:flex z-[1000] w-full"
                vAlign="bottom"
              />
            )}
            <DashboardStatTile
              icon={<span className="material-symbols-outlined ">{t("icon_local_activity", "local_activity")}</span>}
              number={ticketCount}
              label={t("sidebar_support", "Sanctuary Support")}
              colorClass="text-[var(--text)]"
              onClick={() => { if (setIsCitizenTicketsOpen) setIsCitizenTicketsOpen(true); }}
              disabled={!session}
            />
          </div>
        ];

        if (systemTiles.length > 1) {
          return (
            <>
              <div className="mb-4">
                <CommandScreenStats>
                  {systemTiles}
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
            {systemTiles}
            {normalStatsElements}
          </CommandScreenStats>
        );
      })()}

      {/* Main Content Area: Feed and Quick Actions */}
      <div className="flex flex-col xl:flex-row gap-8 xl:gap-10 mt-10 md:mt-12 relative z-20">

        {/* Left Column: Feed & Alerts */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">



          <CommandScreenSectionHeading title={t("feed_title", "Community Feed") || "Comm-Link Feed"} icon={t("icon_satellite_alt", "satellite_alt")} />
          <MasonFeed onOpenMasonProfile={handleOpenMasonProfile} noCardWrapper={true} gridCols="grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3" />
        </div>

        {/* Right Column: Quick Actions */}
        <div className="w-full lg:w-[420px] shrink-0 flex flex-col gap-4">
          <CommandScreenSectionHeading title={t("quick_actions", "Quick Actions")} icon={t("icon_bolt", "bolt")} />

          <div className="flex flex-col gap-4">
            {!!urgentBroadcast && (
              <CommandScreenQuickLink
                icon={t("icon_priority_high", "priority_high")}
                title={t("title_sanctuary_alerts", "Sanctuary Alerts") || "Sanctuary Alerts"}
                subtitle={t("urgent_alert_active", "Urgent Alert Active") || "URGENT SYSTEM BROADCAST"}
                onClick={() => setIsAlertsOpen(true)}
                textColorClass="text-[var(--danger)]"
                hoverTextColorClass="group-hover:text-red-400"
                iconShadowClass="drop-shadow-[0_0_8px_currentColor]"
                iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)]"
                isAlert={true}
              />
            )}

            {activeGameSchema?.features?.has_cc !== false && isDesktop() && (
              <CommandScreenQuickLink
                icon={t("icon_radar", "radar")}
                title={(t("btn_radar", "Conflict Scan")).replace(/^[^\w]*/, '').trim()}
                subtitle={t("btn_radar_desc", "Scan And Sync Your {Vault} ")}
                onClick={() => runRadarSweep(false)}
                textColorClass="text-[color-mix(in_srgb,var(--success)_80%,transparent)]"
                hoverTextColorClass="group-hover:text-emerald-400"
                iconShadowClass="drop-shadow-md"
                iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--success)_30%,transparent)]"
              />
            )}

            {activeGameSchema?.features?.has_cc !== false && isDesktop() && (
              <CommandScreenQuickLink
                icon={shelterActive ? t("icon_lock", "lock") : t("icon_lock_open", "lock_open")}
                title={shelterActive ? ((t("btn_reclaim", "Reclaim {Vault}")).replace(/^[^\w]*/, '').trim()) : ((t("btn_lockdown", "Lockdown {Vault}")).replace(/^[^\w]*/, '').trim())}
                subtitle={shelterActive ? t("btn_bunker_unlock_desc", "Disable Defensive Process") : t("btn_bunker_lock_desc", "Execute Defensive Process")}
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
                  title={localStorage.getItem("sanctuary_blacklisted") === "true" ? t("alert_comm_banned", "Communications Restricted") : t("alert_guest_mode_uploads", "Guest Mode Active:\nUploads are disabled.")}
                  subtitle={localStorage.getItem("sanctuary_blacklisted") === "true" ? t("alert_comm_banned_desc", "Your account has been restricted from posting or submitting content.") : t("alert_guest_mode_desc", "Guest mode is active. Login or register to access full features.")}
                  className="group-hover/supportdesk:flex z-[1000]"
                />
              )}
              <div className={!session ? 'opacity-50 cursor-not-allowed' : ''}>
                <CommandScreenQuickLink
                  icon={t("icon_local_activity", "local_activity")}
                  title={t("support_title", "Submit A Ticket")}
                  subtitle={t("btn_submit_ticket_desc", "Open Sanctuary Support System")}
                  onClick={() => { if (setIsSupportDeskOpen && session) setIsSupportDeskOpen(true); }}
                  textColorClass="text-[color-mix(in_srgb,var(--accent)_80%,transparent)]"
                  hoverTextColorClass="group-hover:text-purple-400"
                  iconShadowClass="drop-shadow-md"
                  iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
                />
              </div>
            </div>

            <CommandScreenQuickLink
              icon={t("icon_history", "history")}
              title={t("audit_logs", "Audit Logs")}
              subtitle={t("audit_logs_desc", "System modification history")}
              onClick={() => setIsAuditLogsOpen(true)}
              textColorClass="text-[color-mix(in_srgb,var(--accent)_80%,transparent)]"
              hoverTextColorClass="group-hover:text-blue-400"
              iconShadowClass="drop-shadow-md"
              iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
            />

            {!urgentBroadcast && (
              <CommandScreenQuickLink
                icon={t("icon_warning_off", "warning_off")}
                title={t("title_sanctuary_alerts", "Sanctuary Alerts")}
                subtitle={t("alert_empty", "SYSTEM BROADCASTS")}
                onClick={() => setIsAlertsOpen(true)}
                textColorClass="text-[color-mix(in_srgb,var(--warning)_80%,transparent)]"
                hoverTextColorClass="group-hover:text-amber-400"
                iconShadowClass="drop-shadow-md"
                iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--warning)_30%,transparent)]"
              />
            )}

            <CommandScreenQuickLink
              icon={t("icon_volunteer_activism", "volunteer_activism")}
              title={t("cmd_quick_support_title", "Support & Perks (0% Fee)")}
              subtitle={t("cmd_quick_support_desc", "Support this community & unlock Global Daily Dev Builds")}
              onClick={() => setIsSupportPanelOpen(true)}
              textColorClass="text-[color-mix(in_srgb,var(--success)_85%,transparent)]"
              hoverTextColorClass="group-hover:text-emerald-400"
              iconShadowClass="drop-shadow-md"
              iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--success)_35%,transparent)]"
            />

          </div>
        </div>
      </div>

      <CommunitySupportSidePanel
        isOpen={isSupportPanelOpen}
        onClose={() => setIsSupportPanelOpen(false)}
        onNavigateSettings={() => {
          setIsSupportPanelOpen(false);
          localStorage.setItem("sanctuary_settings_tab", "SUPPORTER");
          if (setView) setView("settings");
          setTimeout(() => {
            window.dispatchEvent(
              new CustomEvent("navigateSettings", {
                detail: { tab: "SUPPORTER" },
              }),
            );
          }, 50);
        }}
      />

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
        tableName="system_broadcasts"
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




