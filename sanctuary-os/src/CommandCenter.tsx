import React, { useState, useEffect, Suspense } from "react";
import { useShallow } from "zustand/react/shallow";
import { isDesktop } from "./utils/envUtils";
import { invoke } from "@tauri-apps/api/core";
import { useLexicon } from "./LexiconContext";
import { DashboardStatTile, ViewHeader, HoverTooltip, PanelHeaderGroup, PanelHeaderButton, VAULT_CHIP_CLASS, stripMarkdown, isSupportedExtension, stripPriorityTierPrefix, compareVersions } from "./shared";
import { UniversalCard } from "./components/universal/UniversalCard";
import { formatSanctuaryDate } from "./utils/dateUtils";
import {
  LiquidGlassAlertCard,
  useBlueprintPatchReadiness,
  navigateToBlueprintsTab,
  PatchReadinessSimulatorInfoCard,
  BlueprintPatchReadinessCard,
  BlueprintPatchReadinessSidePanel,
} from "./components/BlueprintPatchReadiness";
import { useStore } from "./store";
import { useModalStore } from "./store/modalStore";
import MasonFeed from "./MasonFeed";
import { dispatchSanctuaryNotification } from "./utils/notificationHelper";

import { fetchEncryptedVaultCompanionSnapshots, syncDesktopCompanionRadarSnapshot, VaultCompanionSnapshot, VaultCompanionArtifact } from "./utils/stagingCrypto";
import { groupUpdateMods } from './side-panels/CommandCenterSidePanels';
import {
  extractQueueTokens,
  isSystemCardIgnored,
  ignoreSystemCard,
  restoreIgnoredSystemCard,
  useIgnoredSystemCards,
} from "./side-panels/SystemQueuesSidePanel";
import { evaluateModIssues, groupBrokenMods, resolveActiveBlueprintMods, resolveBlueprintConflicts } from "./side-panels/CommandIncompatiblePanel";
import {
  CommandScreenStats,
  CommandScreenBody,
  CommandScreenMain,
  CommandScreenSidebar,
  CommandScreenSectionHeading,
  CommandScreenQuickLink,
  CommandScreenMetricTile,
} from "./hub-components/SharedCommandScreenLayout";
import { extractDispatchMetadata, formatDispatchCategory } from "./components/universal/DispatchPollAndMeta";

const CommandAlertsPanel = React.lazy(() => import("./side-panels/CommandAlertsPanel"));
const VaultCompanionRadarSidePanel = React.lazy(() => import("./side-panels/VaultCompanionRadarSidePanel"));
const AuditLogViewer = React.lazy(() => import("./side-panels/SAAuditLogViewer").then((m) => ({ default: m.AuditLogViewer })));
const MasonPostViewer = React.lazy(() => import("./side-panels/MasonPostViewer"));
const CommunitySupportSidePanel = React.lazy(() => import("./side-panels/CommunitySupportSidePanel").then((m) => ({ default: m.CommunitySupportSidePanel })));
const TicketDossierSidePanel = React.lazy(() => import("./side-panels/TicketDossierSidePanel"));
export default function CommandCenter({
  isScanning, modsPath, isConfigured, toggleInActiveSet,
  modList, quarantineList, shelterContents, shelterActive, runRadarSweep, runSanitization, massIngestToCloud, triggerShelter, setView, setFilterStatus, setShowBrokenModal, setShowQuarantineModal, handleOpenMasonProfile, networkUpdates, setIsSupportDeskOpen, setIsCitizenTicketsOpen, equipPlaySet, onOpenDossier
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
  const nexusUpdatesCount = useStore((state) => state.nexusUpdatesCount);
  const backupList = useStore((state) => state.backupList);
  const isPatchDetected = useStore((state) => state.isPatchDetected);
  const cwUnsavedEdits = useStore((state) => state.cwUnsavedEdits);
  const statusLog = useStore((state) => state.statusLog);
  const {
    setShowUpdatesModal,
    setIsConflictRadarOpen,
    setIsBlueprintSwapOpen,
    updatePayload,
    setIsUpdatePanelOpen,
    dnaMatchQueue,
    setIsDnaModalOpen,
    volatileSignatureQueue,
    volatileSignatureQueues,
    setVolatileSignatureQueue,
    setActiveSignatureQueueIndex,
    setIsSignatureQueueOpen,
    stagingDraftItems,
    stagingDraftRemovedItems,
    scoutQueue,
    setIsScoutPanelOpen,
    setIsNexusUpdatesPanelOpen,
    pendingPasskeyHandshakes,
    setIsPasskeyHandshakePanelOpen,
    setIsQueuesPanelOpen,
    setIsSystemStatusOpen,
    setIsLogExpanded,
    useInternalBrowser,
    browserTabs,
    setIsSideBrowserOpen,
    modalSetShowQuarantineModal,
  } = useModalStore(
    useShallow((s) => ({
      setShowUpdatesModal: s.setShowUpdatesModal,
      setIsConflictRadarOpen: s.setIsConflictRadarOpen,
      setIsBlueprintSwapOpen: s.setIsBlueprintSwapOpen,
      updatePayload: s.updatePayload,
      setIsUpdatePanelOpen: s.setIsUpdatePanelOpen,
      dnaMatchQueue: s.dnaMatchQueue,
      setIsDnaModalOpen: s.setIsDnaModalOpen,
      volatileSignatureQueue: s.volatileSignatureQueue,
      volatileSignatureQueues: s.volatileSignatureQueues,
      setVolatileSignatureQueue: s.setVolatileSignatureQueue,
      setActiveSignatureQueueIndex: s.setActiveSignatureQueueIndex,
      setIsSignatureQueueOpen: s.setIsSignatureQueueOpen,
      stagingDraftItems: s.stagingDraftItems,
      stagingDraftRemovedItems: s.stagingDraftRemovedItems,
      scoutQueue: s.scoutQueue,
      setIsScoutPanelOpen: s.setIsScoutPanelOpen,
      setIsNexusUpdatesPanelOpen: s.setIsNexusUpdatesPanelOpen,
      pendingPasskeyHandshakes: s.pendingPasskeyHandshakes,
      setIsPasskeyHandshakePanelOpen: s.setIsPasskeyHandshakePanelOpen,
      setIsQueuesPanelOpen: s.setIsQueuesPanelOpen,
      setIsSystemStatusOpen: s.setIsSystemStatusOpen,
      setIsLogExpanded: s.setIsLogExpanded,
      useInternalBrowser: s.useInternalBrowser,
      browserTabs: s.browserTabs,
      setIsSideBrowserOpen: s.setIsSideBrowserOpen,
      modalSetShowQuarantineModal: s.setShowQuarantineModal,
    }))
  );
  const [hasSymlinkPerms, setHasSymlinkPerms] = useState<boolean | null>(null);

  const [isAuditLogsOpen, setIsAuditLogsOpen] = useState(false);
  const [isSupportPanelOpen, setIsSupportPanelOpen] = useState(false);
  const setIsAlertsOpen = useStore((state) => state.setIsAlertsOpen);
  const [alertsPanelMode, setAlertsPanelMode] = useState<"critical" | "alert" | null>(null);
  const [viewingPost, setViewingPost] = useState<any>(null);
  const [urgentBroadcast, setUrgentBroadcast] = useState<any>(null);
  const [dismissedBroadcastId, setDismissedBroadcastId] = useState(localStorage.getItem('sanctuary_dismissed_alert_id'));
  const [nexusCount, setNexusCount] = useState<number | "-">(() => {
    const hs = (window as any).__sanctuaryCache?.nexus?.homeStats;
    if (hs && typeof hs.artifacts === "number") {
      return (hs.artifacts || 0) + (hs.blueprints || 0) + (hs.lexicons || 0) + (hs.chameleons || 0) + (hs.templates || 0);
    }
    return "-";
  });
  const [ticketCount, setTicketCount] = useState<number | "-">("-");
  const [openCitizenTickets, setOpenCitizenTickets] = useState<any[]>([]);
  const [selectedCitizenTicket, setSelectedCitizenTicket] = useState<any | null>(null);
  const [patchReadinessDrawerBp, setPatchReadinessDrawerBp] = useState<string | null>(null);
  const patchReadiness = useBlueprintPatchReadiness();

  useEffect(() => {
    const preloadTimer = setTimeout(() => {
      import("./Blueprints").catch(() => {});
    }, 350);
    return () => clearTimeout(preloadTimer);
  }, []);
  const [companionSnapshots, setCompanionSnapshots] = useState<VaultCompanionSnapshot[]>([]);
  const [isCompanionRadarOpen, setIsCompanionRadarOpen] = useState(false);
  const [companionRadarInitialFilter, setCompanionRadarInitialFilter] = useState<
    "ISSUES" | "CRITICAL" | "ALERTS" | "UPDATES" | "ALL"
  >("ISSUES");

  useEffect(() => {
    if (isDesktop() || !session?.user?.id) return;
    let cancelled = false;
    fetchEncryptedVaultCompanionSnapshots(session).then((snaps) => {
      if (!cancelled) setCompanionSnapshots(snaps);
    });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const activeCompanionSnapshot = React.useMemo(
    () => (companionSnapshots.length > 0 ? companionSnapshots[0] : null),
    [companionSnapshots]
  );

  const enrichedCompanionArtifacts = React.useMemo(() => {
    if (!activeCompanionSnapshot?.artifacts) return [];
    return activeCompanionSnapshot.artifacts.map((art: VaultCompanionArtifact) => {
      const rawStatus = String(art.status || "stable").toLowerCase();
      const isBroken =
        art.alertType === "critical" ||
        rawStatus.includes("broken") ||
        rawStatus.includes("corrupt") ||
        rawStatus.includes("obsolete");
      const isAlert =
        art.alertType === "alert" ||
        (!isBroken && rawStatus.includes("unstable"));
      const cleanLocalVer = String(art.version || "")
        .toLowerCase()
        .replace(/^v/, "")
        .trim();
      const cleanLatestVer = String(art.newVersion || "")
        .toLowerCase()
        .replace(/^v/, "")
        .trim();
      const verCmp =
        cleanLatestVer && cleanLocalVer
          ? compareVersions(cleanLatestVer, cleanLocalVer)
          : 0;
      const hasUpdate = Boolean(
        art.hasUpdate && (!cleanLocalVer || !cleanLatestVer || verCmp > 0)
      );
      return {
        ...art,
        newVersion:
          art.newVersion &&
          (!cleanLocalVer || compareVersions(art.newVersion, cleanLocalVer) > 0)
            ? art.newVersion
            : undefined,
        isBroken,
        alertType: isBroken ? "critical" : isAlert ? "alert" : undefined,
        hasUpdate,
        needsAttention: isBroken || isAlert || hasUpdate,
      };
    });
  }, [activeCompanionSnapshot]);

  const companionCriticalCount = React.useMemo(
    () =>
      activeCompanionSnapshot?.criticalCount ??
      enrichedCompanionArtifacts.filter((a) => a.isBroken).length,
    [activeCompanionSnapshot, enrichedCompanionArtifacts]
  );
  const companionAlertsCount = React.useMemo(
    () =>
      activeCompanionSnapshot?.alertsCount ??
      enrichedCompanionArtifacts.filter((a) => a.alertType === "alert").length,
    [activeCompanionSnapshot, enrichedCompanionArtifacts]
  );
  const companionUpdatesCount = React.useMemo(
    () =>
      activeCompanionSnapshot?.updatesCount ??
      enrichedCompanionArtifacts.filter((a) => a.hasUpdate).length,
    [activeCompanionSnapshot, enrichedCompanionArtifacts]
  );
  const companionVaultCount = React.useMemo(
    () => activeCompanionSnapshot?.vaultCount ?? enrichedCompanionArtifacts.length,
    [activeCompanionSnapshot, enrichedCompanionArtifacts]
  );

  const vaultItemCount = React.useMemo(() => {
    if (!Array.isArray(modList) || modList.length === 0) return 0;
    const virtualFolderIds = new Set<string>();
    modList.forEach((v: any) => {
      if (!v?.isVirtual || !v.dbId) return;
      const dbIdStr = String(v.dbId);
      if (dbIdStr === "undefined" || dbIdStr === "null") return;
      if (
        (v.hash?.startsWith("local_set_") || v.name?.startsWith("LOCAL_SET_")) &&
        !dbIdStr.startsWith("f_") &&
        !dbIdStr.startsWith("local_")
      ) {
        return;
      }
      virtualFolderIds.add(dbIdStr);
    });
    let count = 0;
    for (let i = 0; i < modList.length; i++) {
      const mod = modList[i];
      if (!mod) continue;
      if (mod.isVirtual && (mod.hash?.startsWith("local_set_") || mod.name?.startsWith("LOCAL_SET_"))) {
        const dbIdStr = String(mod.dbId || "");
        if (!dbIdStr.startsWith("f_") && !dbIdStr.startsWith("local_")) continue;
      }
      if (!mod.isVirtual && mod.name) {
        if (!isSupportedExtension(mod.name, activeGameSchema)) continue;
        if (activeGameSchema?.extensions?.vault_visible) {
          const isVaultVisible = activeGameSchema.extensions.vault_visible.some((ext: string) =>
            mod.name.toLowerCase().endsWith(ext.toLowerCase())
          );
          if (!isVaultVisible) continue;
        }
      }
      const modNameUpper = String(mod.displayName || mod.meta_name || mod.name || mod.title || "").toUpperCase().trim();
      const baseModName = modNameUpper.split(/[\\/]/).pop()?.replace(/\.[^/.]+$/, "") || modNameUpper;
      if (baseModName === "FILTERS") continue;
      if (!mod.isVirtual) {
        const folderExists =
          (mod.familyId && virtualFolderIds.has(String(mod.familyId))) ||
          (mod.setId && virtualFolderIds.has(String(mod.setId)));
        if (folderExists) continue;
      }
      count++;
    }
    return count;
  }, [modList, activeGameSchema]);

  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);
  const workspaces = useStore((state) => state.workspaces);
  const ignoredSystemCards = useIgnoredSystemCards(activeWorkspaceId);

  useEffect(() => {
    if (isDesktop() && isConfigured && !shelterActive && ignoredSystemCards.vault_lockdown) {
      restoreIgnoredSystemCard(activeWorkspaceId, "vault_lockdown");
    }
  }, [isConfigured, shelterActive, activeWorkspaceId, ignoredSystemCards.vault_lockdown]);

  const checkPerms = () => {
    invoke<boolean>("check_symlink_permissions")
      .then(res => setHasSymlinkPerms(res))
      .catch(() => setHasSymlinkPerms(false));
  };

  useEffect(() => {
    checkPerms();
    if (activeWorkspaceId === 'default_workspace' || !workspaces || workspaces.length === 0) return;

    let cancelled = false;

    const refreshCommandStats = () => {
      import('./supabase').then(async ({ supabase, supabaseAuth }) => {
        if (cancelled || !navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true") return;

        const fetchUrgent = async () => {
          const { data } = await supabase.from('system_broadcasts').select('*').eq('is_active', true).eq('is_pinned', true).or('target_audience.ilike.%All%,target_audience.eq.Citizens,target_audience.ilike."Citizens,%",target_audience.ilike."%,Citizens,%",target_audience.ilike."%,Citizens"').order('created_at', { ascending: false }).limit(1);
          if (cancelled) return;
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
            supabase
              .from('nexus_assets')
              .select('id', { count: 'exact', head: true })
              .in('asset_type', ['lexicon', 'chameleon', 'workbench_template'])
              .or('is_public.eq.true,is_public.is.null'),
            supabase
              .from('mods')
              .select('id', { count: 'exact', head: true })
              .eq('compliance_tier', 0)
              .in('status', ['stable', 'verified', 'unstable', 'corrupted', 'pending']),
            supabase
              .from('blueprints')
              .select('id', { count: 'exact', head: true })
              .eq('is_public', true)
              .eq('is_market_listed', true)
              .eq('compliance_tier', 0)
          ]);

          if (!cancelled) {
            let total = 0;
            let anySucceeded = false;
            if (!assetsRes.error && typeof assetsRes.count === 'number') {
              total += assetsRes.count;
              anySucceeded = true;
            }
            if (!modsRes.error && typeof modsRes.count === 'number') {
              total += modsRes.count;
              anySucceeded = true;
            }
            if (!bpRes.error && typeof bpRes.count === 'number') {
              total += bpRes.count;
              anySucceeded = true;
            }

            if (assetsRes.error || modsRes.error || bpRes.error) {
              console.warn("Partial or failed Nexus stat count query:", {
                nexus_assets: assetsRes.error,
                mods: modsRes.error,
                blueprints: bpRes.error,
              });
            }

            setNexusCount(anySucceeded ? total : "-");
          }

          fetchUrgent();
        } catch (err: any) {
          console.warn("Failed to fetch total nexus count", err);
          if (!cancelled) setNexusCount("-");
        }

        try {
          const uid =
            session?.user?.id ||
            (await supabaseAuth.auth.getSession()).data.session?.user?.id;
          if (!uid) {
            if (!cancelled) {
              setTicketCount("-");
              setOpenCitizenTickets([]);
            }
            return;
          }
          const { data: ticketRows, error } = await supabase
            .from('sanctuary_tickets')
            .select('*')
            .eq('author_id', uid)
            .order('created_at', { ascending: false })
            .limit(40);
          if (!cancelled) {
            if (!error && Array.isArray(ticketRows)) {
              const normalized = ticketRows.map((tk: any) => ({
                ...tk,
                table_name: 'sanctuary_tickets',
              }));
              setTicketCount(normalized.length);
              const openOnly = normalized.filter((tk: any) => {
                const st = String(tk?.status || 'open').toLowerCase();
                return st !== 'resolved' && st !== 'rejected' && st !== 'closed';
              });
              setOpenCitizenTickets(openOnly.slice(0, 5));
              if ((window as any).__sanctuaryCache?.support) {
                const cacheKey = `spokeTickets_${activeWorkspaceId || "default"}_${uid}`;
                (window as any).__sanctuaryCache.support[cacheKey] = normalized;
                (window as any).__sanctuaryCache.support[`${cacheKey}_lastFetch`] = performance.now();
              }
            } else {
              setTicketCount(0);
              setOpenCitizenTickets([]);
            }
          }
        } catch {
          if (!cancelled) {
            setTicketCount("-");
            setOpenCitizenTickets([]);
          }
        }
      });
    };

    refreshCommandStats();
    window.addEventListener('sanctuary-games-updated', refreshCommandStats);
    window.addEventListener('sanctuary-tickets-updated', refreshCommandStats);
    return () => {
      cancelled = true;
      window.removeEventListener('sanctuary-games-updated', refreshCommandStats);
      window.removeEventListener('sanctuary-tickets-updated', refreshCommandStats);
    };
  }, [activeWorkspaceId, workspaces, session?.user?.id]);

  useEffect(() => {
    if (hasSymlinkPerms === true || hasSymlinkPerms === null) return;
    const interval = setInterval(checkPerms, 3000);
    return () => clearInterval(interval);
  }, [hasSymlinkPerms]);

  const cachedStoreBrokenCounts = useStore((state) => state.activeBrokenCounts);
  const cachedStoreConflictCount = useStore((state) => state.activeConflictCount);
  const activeBlueprintMods = React.useMemo(() => {
    if (!activePlaySet) return [];
    return resolveActiveBlueprintMods(
      activePlaySet.mods,
      modList,
      activeGameSchema,
      networkUpdates
    );
  }, [activePlaySet, modList, activeGameSchema, networkUpdates]);

  const activeUpdates = React.useMemo(() => {
    const hasLoadedMods = Array.isArray(modList) && modList.length > 0;
    if (!hasLoadedMods && Array.isArray(networkUpdates?.updated) && networkUpdates.updated.length > 0 && activePlaySet) {
      const safeModNames = new Set(
        (Array.isArray(activePlaySet.mods) ? activePlaySet.mods : []).map((rm: any) => {
          const n = typeof rm === 'string' ? rm : String(rm?.name || rm?.path || '');
          return stripPriorityTierPrefix(n, activeGameSchema).toLowerCase().replace(/\\/g, '/');
        })
      );
      const matchedCachedUpdates = networkUpdates.updated.filter((u: any) => {
        if (!u?.name) return false;
        const cleanU = stripPriorityTierPrefix(String(u.name), activeGameSchema).toLowerCase().replace(/\\/g, '/');
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
  }, [activeBlueprintMods, modList, networkUpdates, activePlaySet, activeGameSchema]);
  const groupedBrokenAndAlertMods = React.useMemo(() => {
    const hasLoadedMods = Array.isArray(modList) && modList.length > 0;
    if (!hasLoadedMods) return [];
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
    return groupBrokenMods(evaluated);
  }, [activeBlueprintMods, modList, selectedVersion, ownedDLC, maskedDLC, t, activeGameSchema]);

  const activeBrokenCounts = React.useMemo(() => {
    const hasLoadedMods = Array.isArray(modList) && modList.length > 0;
    if (!hasLoadedMods && cachedStoreBrokenCounts && (cachedStoreBrokenCounts.broken > 0 || cachedStoreBrokenCounts.unstable > 0)) {
      return cachedStoreBrokenCounts;
    }
    return groupedBrokenAndAlertMods.reduce(
      (acc: { broken: number; unstable: number }, m: any) => {
        if (m._alert_type === "red") acc.broken += 1;
        else if (m._alert_type === "amber") acc.unstable += 1;
        return acc;
      },
      { broken: 0, unstable: 0 }
    );
  }, [groupedBrokenAndAlertMods, modList, cachedStoreBrokenCounts]);

  const [radarCacheTick, setRadarCacheTick] = React.useState(0);
  React.useEffect(() => {
    const handleRadarCacheUpdate = () => setRadarCacheTick((c) => c + 1);
    window.addEventListener("sanctuary-radar-cache-updated", handleRadarCacheUpdate);
    return () => window.removeEventListener("sanctuary-radar-cache-updated", handleRadarCacheUpdate);
  }, []);

  const resolvedActiveConflicts = React.useMemo(() => {
    const hasLoadedMods = Array.isArray(modList) && modList.length > 0;
    if (!hasLoadedMods || !activePlaySet) return [];
    const scopeKey = activeSetName || activePlaySet?.name || "";
    return resolveBlueprintConflicts(
      scopeKey,
      activeBlueprintMods,
      ignoredGlobal,
      t,
      activeGameSchema
    );
  }, [
    modList,
    activePlaySet,
    activeSetName,
    activeBlueprintMods,
    ignoredGlobal,
    t,
    activeGameSchema,
    radarCacheTick,
  ]);

  const activeConflictCount = React.useMemo(() => {
    const hasLoadedMods = Array.isArray(modList) && modList.length > 0;
    if (
      !hasLoadedMods &&
      cachedStoreConflictCount &&
      (cachedStoreConflictCount.tier4 > 0 || cachedStoreConflictCount.tier3 > 0)
    ) {
      return cachedStoreConflictCount;
    }
    let tier3Count = 0;
    let tier4Count = 0;
    for (let i = 0; i < resolvedActiveConflicts.length; i++) {
      if (Number(resolvedActiveConflicts[i]?.conflict?.severity_rank) === 4) {
        tier4Count += 1;
      } else {
        tier3Count += 1;
      }
    }
    return {
      total: tier4Count + tier3Count,
      tier3: tier3Count,
      tier4: tier4Count,
    };
  }, [resolvedActiveConflicts, modList, cachedStoreConflictCount]);

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

  // Automatically sync exact Desktop Command Center telemetry to encrypted Zero-Knowledge Cloud Companion
  useEffect(() => {
    if (!isDesktop() || !session?.user?.id || !Array.isArray(modList) || modList.length === 0 || vaultItemCount === 0) {
      return;
    }
    const timer = setTimeout(() => {
      const brokenItems = groupedBrokenAndAlertMods.filter((m: any) => m._alert_type === "red");
      const unstableItems = groupedBrokenAndAlertMods.filter((m: any) => m._alert_type === "amber");

      const fatalConflictItems: any[] = [];
      const tuningConflictItems: any[] = [];
      resolvedActiveConflicts.forEach((rc: any, idx: number) => {
        const nameA = String(rc.modA?.displayName || rc.modA?.name || rc.pairId || `${idx + 1}`);
        const nameB = String(rc.modB?.displayName || rc.modB?.name || "");
        const isFatal = Number(rc.conflict?.severity_rank) === 4;
        const conflictEntry = {
          hash: `conflict_${isFatal ? "fatal" : "tuning"}_${idx}_${nameA}`,
          name: nameA,
          displayName: nameB ? `${nameA} ↔ ${nameB}` : nameA,
          status: isFatal ? "broken" : "unstable",
          _issue_label: isFatal
            ? t("fatal_conflict", "Fatal Conflict")
            : t("tier3_conflict", "Tuning Overlap"),
        };
        if (isFatal) fatalConflictItems.push(conflictEntry);
        else tuningConflictItems.push(conflictEntry);
      });

      const criticalItems = [...brokenItems, ...fatalConflictItems];
      const alertItems = [...unstableItems, ...tuningConflictItems];

      syncDesktopCompanionRadarSnapshot(
        modList,
        session,
        activeSetName || activePlaySet?.name,
        selectedVersion,
        {
          vaultCount: vaultItemCount,
          criticalCount: radarTier4Count + radarBrokenCount,
          alertsCount: radarTier3Count + radarUnstableCount,
          updatesCount: radarUpdatesCount,
          blueprintsCount: playSets?.length || 0,
          criticalItems,
          alertItems,
          updateItems: activeUpdates,
          playSets: Array.isArray(playSets) ? playSets : [],
        }
      ).catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
  }, [
    session?.user?.id,
    vaultItemCount,
    radarTier4Count,
    radarBrokenCount,
    radarTier3Count,
    radarUnstableCount,
    radarUpdatesCount,
    activeSetName,
    selectedVersion,
    playSets?.length,
    resolvedActiveConflicts,
  ]);

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

    const handleOpenCcPanel = (e: Event) => {
      const panel = (e as CustomEvent)?.detail?.panel;
      if (panel === "critical") {
        if (isDesktop()) {
          setAlertsPanelMode("critical");
        } else {
          setCompanionRadarInitialFilter("CRITICAL");
          setIsCompanionRadarOpen(true);
        }
      } else if (panel === "alert") {
        if (isDesktop()) {
          setAlertsPanelMode("alert");
        } else {
          setCompanionRadarInitialFilter("ALERTS");
          setIsCompanionRadarOpen(true);
        }
      } else if (panel === "audit_logs") {
        setIsAuditLogsOpen(true);
      } else if (panel === "support_perks") {
        setIsSupportPanelOpen(true);
      } else if (panel === "broadcasts") {
        setIsAlertsOpen(true);
      }
    };

    window.addEventListener('open_urgent_broadcast', handleOpenUrgent);
    window.addEventListener('open_malware_alert', handleOpenMalware);
    window.addEventListener('sanctuary-open-cc-panel', handleOpenCcPanel);

    return () => {
      window.removeEventListener('open_urgent_broadcast', handleOpenUrgent);
      window.removeEventListener('open_malware_alert', handleOpenMalware);
      window.removeEventListener('sanctuary-open-cc-panel', handleOpenCcPanel);
    };
  }, [urgentBroadcast, setIsAlertsOpen]);

  const schemaFeatures = activeGameSchema?.features || {
    has_cc: true,
    has_saves: true,
  };
  const hasCcSupport = schemaFeatures.has_cc !== false;
  const hasSavesSupport = schemaFeatures.has_saves !== false;

  const quarantineCount = Array.isArray(quarantineList)
    ? quarantineList.length
    : 0;
  const dnaCount = Array.isArray(dnaMatchQueue) ? dnaMatchQueue.length : 0;
  const totalCloudQueues =
    Array.isArray(volatileSignatureQueues) && volatileSignatureQueues.length > 0
      ? volatileSignatureQueues.length
      : volatileSignatureQueue
        ? 1
        : 0;
  const sigQueueCount =
    Array.isArray(volatileSignatureQueues) && volatileSignatureQueues.length > 0
      ? volatileSignatureQueues.filter((q: any) => !q?.isCompletedLocally).length
      : volatileSignatureQueue && !(volatileSignatureQueue as any)?.isCompletedLocally
        ? 1
        : 0;
  const hasStagingDraft =
    (Array.isArray(stagingDraftItems) &&
      stagingDraftItems.length > 0 &&
      stagingDraftItems.length <= 200) ||
    (Array.isArray(stagingDraftRemovedItems) &&
      stagingDraftRemovedItems.length > 0);
  const blueprintQueueCount = sigQueueCount + (hasStagingDraft ? 1 : 0);
  const scoutCount = Array.isArray(scoutQueue) ? scoutQueue.length : 0;
  const nexusAssetUpdatesCount = nexusUpdatesCount || 0;
  const hasAppUpdate = isDesktop() && Boolean(updatePayload);
  const passkeyHandshakeCount = Array.isArray(pendingPasskeyHandshakes)
    ? pendingPasskeyHandshakes.length
    : 0;

  const backupCount = Array.isArray(backupList) ? backupList.length : 0;
  const unsavedWorkbenchCount = cwUnsavedEdits
    ? Object.keys(cwUnsavedEdits).length
    : 0;
  const statusLogCount = Array.isArray(statusLog) ? statusLog.length : 0;
  const openBrowserTabCount = Array.isArray(browserTabs)
    ? browserTabs.length
    : 0;

  const jumpToPatchReadinessTool = () => {
    setPatchReadinessDrawerBp(null);
    navigateToBlueprintsTab("READINESS", { setView });
  };

  const openSignatureQueueDrawer = () => {
    if (sigQueueCount > 0 || totalCloudQueues > 0) {
      if (
        Array.isArray(volatileSignatureQueues) &&
        volatileSignatureQueues.length > 0
      ) {
        const firstPendingIdx = volatileSignatureQueues.findIndex(
          (q: any) => !q?.isCompletedLocally
        );
        const targetIdx = firstPendingIdx >= 0 ? firstPendingIdx : 0;
        setActiveSignatureQueueIndex(targetIdx);
        setVolatileSignatureQueue(volatileSignatureQueues[targetIdx]);
      }
      setIsSignatureQueueOpen(true);
    } else {
      setIsSignatureQueueOpen(true);
    }
  };

  const openQuarantineDrawer = () => {
    if (setShowQuarantineModal) {
      setShowQuarantineModal(true);
    } else if (modalSetShowQuarantineModal) {
      modalSetShowQuarantineModal(true);
    } else if (setView) {
      setView("vault");
    }
  };

  const activeQueueCards = (() => {
    const cards: {
      id: string;
      icon: string;
      accentVar: string;
      iconColorClass: string;
      actionVariant: "glass" | "accent" | "warning" | "danger" | "success";
      overline: string;
      title: string;
      description: string;
      badgeLabel: string;
      badgeIcon: string;
      actionLabel: string;
      actionIcon: string;
      ignoreTokens?: string[];
      ignoreCount?: number;
      isIgnored: boolean;
      onClick: () => void;
    }[] = [];

    if (passkeyHandshakeCount > 0 && pendingPasskeyHandshakes[0]?.payload) {
      const activeReq = pendingPasskeyHandshakes[0];
      const tokens = extractQueueTokens(pendingPasskeyHandshakes, "pk");
      cards.push({
        id: "passkey_handshake",
        icon: t("icon_phonelink_lock", "phonelink_lock"),
        accentVar: "var(--warning)",
        iconColorClass: "text-[var(--warning)]",
        actionVariant: "warning",
        overline: `${activeReq.payload.requestingDevice} • ${activeReq.payload.targetScope}`,
        title: t(
          "passkey_handshake_approve_banner_title",
          "Approve Rig Passkey Handshake"
        ),
        description: t(
          "passkey_handshake_approve_banner_desc",
          "Confirm the 6-digit code shown on your other rig and authenticate with your FIDO2 Passkey right now to authorize elevated access."
        ),
        badgeLabel: String(activeReq.payload.handshakeCode || ""),
        badgeIcon: t("icon_passkey", "passkey"),
        actionLabel: t("open", "Open"),
        actionIcon: t("icon_open_in_new", "open_in_new"),
        ignoreTokens: tokens,
        isIgnored: isSystemCardIgnored(ignoredSystemCards.passkey_handshake, tokens),
        onClick: () => setIsPasskeyHandshakePanelOpen(true),
      });
    }

    if (hasAppUpdate) {
      const rawVer = String(updatePayload?.version || "")
        .replace(/^v/i, "")
        .trim();
      const isDev = Boolean(updatePayload?.isDevChannel || /dev/i.test(rawVer));
      const tokens = [`ver:${rawVer || "latest"}`];
      cards.push({
        id: "os_update",
        icon: t("icon_system_update_alt", "system_update_alt"),
        accentVar: "var(--accent)",
        iconColorClass: "text-[var(--accent)]",
        actionVariant: "accent",
        overline: rawVer ? `v${rawVer}` : t("updates_ready", "Updates Ready"),
        title: isDev
          ? t("sys_stat_dev_update_available", "Dev Build Available")
          : t("card_update_available", "Update Available"),
        description: t(
          "sys_stat_click_to_update",
          "Click to view release notes and install update"
        ),
        badgeLabel: t("updates_ready", "Updates Ready"),
        badgeIcon: t("icon_download", "download"),
        actionLabel: t("open", "Open"),
        actionIcon: t("icon_system_update_alt", "system_update_alt"),
        ignoreTokens: tokens,
        isIgnored: isSystemCardIgnored(ignoredSystemCards.os_update, tokens),
        onClick: () => setIsUpdatePanelOpen(true),
      });
    }

    if (quarantineCount > 0) {
      const tokens = extractQueueTokens(quarantineList, "quar");
      cards.push({
        id: "quarantine",
        icon: t("icon_warning_amber", "warning_amber"),
        accentVar: "var(--danger)",
        iconColorClass: "text-[var(--danger)]",
        actionVariant: "danger",
        overline: `${quarantineCount} ${t("status_quarantined", "Quarantined")}`,
        title: t("malware_alert_title", "Malware Detected"),
        description: t(
          "malware_and_manifests_subtitle",
          "Active malware quarantine, Spoke & Core heuristics, and incoming Threat Manifests."
        ),
        badgeLabel: `${quarantineCount}`,
        badgeIcon: t("icon_gpp_bad", "gpp_bad"),
        actionLabel: t("inspect", "Inspect"),
        actionIcon: t("icon_shield", "shield"),
        ignoreTokens: tokens,
        isIgnored: isSystemCardIgnored(ignoredSystemCards.quarantine, tokens),
        onClick: openQuarantineDrawer,
      });
    }

    if (dnaCount > 0) {
      const tokens = extractQueueTokens(dnaMatchQueue, "dna");
      cards.push({
        id: "dna_match",
        icon: t("icon_difference", "difference"),
        accentVar: "var(--warning)",
        iconColorClass: "text-[var(--warning)]",
        actionVariant: "warning",
        overline: `${dnaCount} ${t("term_mods", "{Mods}")}`,
        title: t("overlay_dna_match_title", "DNA Match & Collision Queue"),
        description: t(
          "overlay_dna_match_desc",
          "Resolve duplicate artifacts, settings collisions, and Edge overrides."
        ),
        badgeLabel: `${dnaCount}`,
        badgeIcon: t("icon_difference", "difference"),
        actionLabel: t("inspect", "Inspect"),
        actionIcon: t("icon_difference", "difference"),
        ignoreTokens: tokens,
        isIgnored: isSystemCardIgnored(ignoredSystemCards.dna_match, tokens),
        onClick: () => setIsDnaModalOpen(true),
      });
    }

    if (blueprintQueueCount > 0 || totalCloudQueues > 0) {
      const isAllCompletedLocally =
        blueprintQueueCount === 0 && totalCloudQueues > 0;
      const tokens = [
        ...extractQueueTokens(
          Array.isArray(volatileSignatureQueues) &&
            volatileSignatureQueues.length > 0
            ? volatileSignatureQueues
            : volatileSignatureQueue
              ? [volatileSignatureQueue]
              : [],
          "sig"
        ),
        ...(hasStagingDraft ? ["sig:local_draft"] : []),
      ];
      cards.push({
        id: "signature_queue",
        icon: t("icon_phonelink_ring", "phonelink_ring"),
        accentVar: isAllCompletedLocally ? "var(--accent)" : "var(--success)",
        iconColorClass: isAllCompletedLocally
          ? "text-[var(--accent)]"
          : "text-[var(--success)]",
        actionVariant: isAllCompletedLocally ? "accent" : "success",
        overline: isAllCompletedLocally
          ? t(
              "sig_queue_badge_completed_local",
              "Completed Here • Pending on Other Systems"
            )
          : `${blueprintQueueCount} ${t("playsets_title", "{Blueprints}")}`,
        title: t("sig_queue_title", "Signature Queue"),
        description: t(
          "sig_queue_subtitle",
          "Volatile In-Memory Resolution • Awaiting {Citizen}'s Signature"
        ),
        badgeLabel: isAllCompletedLocally
          ? t("sig_queue_badge_completed_short", "Completed on Rig")
          : `${blueprintQueueCount}`,
        badgeIcon: isAllCompletedLocally
          ? t("icon_task_alt", "task_alt")
          : t("icon_draw", "draw"),
        actionLabel: t("open", "Open"),
        actionIcon: t("icon_draw", "draw"),
        ignoreTokens: tokens,
        isIgnored: isSystemCardIgnored(ignoredSystemCards.signature_queue, tokens),
        onClick: openSignatureQueueDrawer,
      });
    }

    if (nexusAssetUpdatesCount > 0) {
      cards.push({
        id: "nexus_updates",
        icon: t("icon_cloud_download", "cloud_download"),
        accentVar: "var(--accent)",
        iconColorClass: "text-[var(--accent)]",
        actionVariant: "accent",
        overline: `${nexusAssetUpdatesCount} ${t("updates_ready", "Updates Ready")}`,
        title: t("nexus_updates_title", "Nexus Updates"),
        description: t(
          "nexus_updates_subtitle",
          "Available updates for your installed Nexus assets."
        ),
        badgeLabel: `${nexusAssetUpdatesCount}`,
        badgeIcon: t("icon_new_releases", "new_releases"),
        actionLabel: t("open", "Open"),
        actionIcon: t("icon_cloud_download", "cloud_download"),
        ignoreCount: nexusAssetUpdatesCount,
        isIgnored: isSystemCardIgnored(
          ignoredSystemCards.nexus_updates,
          undefined,
          nexusAssetUpdatesCount
        ),
        onClick: () => setIsNexusUpdatesPanelOpen(true),
      });
    }

    if (scoutCount > 0) {
      const tokens = extractQueueTokens(scoutQueue, "scout");
      cards.push({
        id: "scout_queue",
        icon: t("icon_biotech", "biotech"),
        accentVar: "var(--warning)",
        iconColorClass: "text-[var(--warning)]",
        actionVariant: "warning",
        overline: `${scoutCount} ${t("term_mods", "{Mods}")}`,
        title: t("queue_title", "Unidentified Files"),
        description: t("queue_desc", "Unidentified {mods} detected."),
        badgeLabel: `${scoutCount}`,
        badgeIcon: t("icon_biotech", "biotech"),
        actionLabel: t("inspect", "Inspect"),
        actionIcon: t("icon_biotech", "biotech"),
        ignoreTokens: tokens,
        isIgnored: isSystemCardIgnored(ignoredSystemCards.scout_queue, tokens),
        onClick: () => setIsScoutPanelOpen(true),
      });
    }

    if (isDesktop() && hasCcSupport && shelterActive) {
      const tokens = ["shelter:active"];
      cards.push({
        id: "vault_lockdown",
        icon: t("icon_lock", "lock"),
        accentVar: "var(--warning)",
        iconColorClass: "text-[var(--warning)]",
        actionVariant: "warning",
        overline: t("active", "Active"),
        title: t("btn_lockdown", "Lockdown {Vault}").replace(/^[^\w]*/, "").trim(),
        description: t(
          "cmd_lockdown_active_desc",
          "Your {Vault} is currently air-gapped to protect {mods} during a game patch. Click to reclaim."
        ),
        badgeLabel: t("active", "Active"),
        badgeIcon: t("icon_shield_lock", "shield_lock"),
        actionLabel: t("btn_reclaim", "Reclaim {Vault}").replace(/^[^\w]*/, "").trim(),
        actionIcon: t("icon_lock_open", "lock_open"),
        ignoreTokens: tokens,
        isIgnored: isSystemCardIgnored(ignoredSystemCards.vault_lockdown, tokens),
        onClick: () => triggerShelter(false),
      });
    }

    return cards;
  })();

  const visibleQueueCards = activeQueueCards.filter((q) => !q.isIgnored);
  const ignoredQueueCardCount = activeQueueCards.length - visibleQueueCards.length;

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
                icon={t("icon_warning", "warning")}
                title={t("perm_restricted", "Permissions Restricted")}
                subtitle={t("perm_hover_desc", "Click to permanently unlock cross-drive Symlink permissions via 1-click Windows UAC (no Admin mode needed on future launches).") || t("perm_desc", "Sanctuary OS lacks sufficient clearance to manage your {Vault}.")}
                className="group-hover/perms:flex z-[1000] w-full"
                vAlign="bottom"
              />
              <DashboardStatTile
                icon={<span className="material-symbols-outlined ">{t("icon_warning", "warning")}</span>}
                number="!"
                label={t("perm_restricted", "Permissions Restricted")}
                disableBgStrip={true}
                colorClass="!bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] !border-[color-mix(in_srgb,var(--warning)_30%,transparent)] !text-[var(--warning)] animate-pulse w-full"
                onClick={async () => {
                  try {
                    await invoke("open_developer_settings");
                  } finally {
                    checkPerms();
                  }
                }}
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
                icon={urgentBroadcast.icon || t("icon_campaign", "campaign")}
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
                icon={t("icon_gpp_bad", "gpp_bad")}
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
                icon={t("icon_warning_amber", "warning_amber")}
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
                icon={t("icon_update", "update")}
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

        if (!isDesktop()) {
          if (companionCriticalCount > 0) {
            systemTiles.push(
              <DashboardStatTile
                key="mobile_radar_critical"
                icon={<span className="material-symbols-outlined ">{t("icon_gpp_bad", "gpp_bad")}</span>}
                number={companionCriticalCount}
                label={t("crit_fail", "critical failures") || "Critical Failures"}
                disableBgStrip={true}
                colorClass="!bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] !border-[color-mix(in_srgb,var(--danger)_30%,transparent)] !text-[var(--danger)] shadow-[0_0_15px_color-mix(in_srgb,var(--danger)_10%,transparent)] animate-pulse w-full"
                onClick={() => {
                  setCompanionRadarInitialFilter("CRITICAL");
                  setIsCompanionRadarOpen(true);
                }}
              />
            );
          }
          if (companionAlertsCount > 0) {
            systemTiles.push(
              <DashboardStatTile
                key="mobile_radar_alerts"
                icon={<span className="material-symbols-outlined ">{t("icon_warning_amber", "warning_amber")}</span>}
                number={companionAlertsCount}
                label={t("system_alerts_title", "System Alerts") || "System Alerts"}
                disableBgStrip={true}
                colorClass="!bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] !border-[color-mix(in_srgb,var(--warning)_30%,transparent)] !text-[var(--warning)] shadow-[0_0_15px_color-mix(in_srgb,var(--warning)_10%,transparent)] w-full"
                onClick={() => {
                  setCompanionRadarInitialFilter("ALERTS");
                  setIsCompanionRadarOpen(true);
                }}
              />
            );
          }
          if (companionUpdatesCount > 0) {
            systemTiles.push(
              <DashboardStatTile
                key="mobile_radar_updates"
                icon={<span className="material-symbols-outlined ">{t("icon_update", "update")}</span>}
                number={companionUpdatesCount}
                label={t("updates_avail", "Updates Available") || "Updates Available"}
                disableBgStrip={true}
                colorClass="!bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] !border-[color-mix(in_srgb,var(--accent)_30%,transparent)] !text-[var(--accent)] shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_10%,transparent)] w-full"
                onClick={() => {
                  setCompanionRadarInitialFilter("UPDATES");
                  setIsCompanionRadarOpen(true);
                }}
              />
            );
          }
          if (companionCriticalCount === 0 && companionAlertsCount === 0 && companionUpdatesCount === 0) {
            systemTiles.push(
              <DashboardStatTile
                key="mobile_radar_stable"
                icon={<span className="material-symbols-outlined ">{t("icon_check_circle", "check_circle")}</span>}
                number="0"
                label={t("sys_stable", "System Stable")}
                disableBgStrip={true}
                colorClass="!bg-[color-mix(in_srgb,var(--success)_10%,transparent)] !border-[color-mix(in_srgb,var(--success)_20%,transparent)] !text-[var(--success)]"
                onClick={() => {
                  setCompanionRadarInitialFilter("ALL");
                  setIsCompanionRadarOpen(true);
                }}
              />
            );
          }
        } else if (hasSymlinkPerms !== false && radarState === 'optimal') {
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
          isDesktop() ? (
            <DashboardStatTile
              key="vault"
              icon={<span className="material-symbols-outlined ">{t("icon_account_balance", "account_balance")}</span>}
              number={activeGameSchema?.features?.has_cc === false ? "-" : vaultItemCount}
              label={t("vault_title", "Your {Vault}")}
              colorClass="text-[var(--text)]"
              onClick={() => { if (activeGameSchema?.features?.has_cc !== false) { if (setView) setView("vault"); if (setFilterStatus) setFilterStatus("ALL"); } }}
            />
          ) : activeCompanionSnapshot ? (
            <DashboardStatTile
              key="mobile_vault"
              icon={<span className="material-symbols-outlined ">{t("icon_account_balance", "account_balance")}</span>}
              number={companionVaultCount}
              label={t("vault_title", "Your {Vault}")}
              colorClass="text-[var(--text)]"
              onClick={() => {
                setCompanionRadarInitialFilter("ALL");
                setIsCompanionRadarOpen(true);
              }}
            />
          ) : null,
          <DashboardStatTile
            key="nexus"
            icon={<span className="material-symbols-outlined ">{t("icon_hub", "hub")}</span>}
            number={nexusCount}
            label={t("market_title", "The {Nexus}")}
            colorClass="text-[var(--text)]"
            onClick={() => { if (setView) setView("nexus"); }}
          />,
          isDesktop() ? (
            <DashboardStatTile
              key="blueprints"
              icon={<span className="material-symbols-outlined ">{t("icon_map", "map")}</span>}
              number={activeGameSchema?.features?.has_cc === false ? "-" : (playSets?.length || 0)}
              label={t("playsets_title", "{Blueprints}")}
              colorClass="text-[var(--text)]"
              onClick={() => { if (activeGameSchema?.features?.has_cc !== false) setIsBlueprintSwapOpen(true); }}
            />
          ) : activeCompanionSnapshot ? (
            <DashboardStatTile
              key="mobile_blueprints"
              icon={<span className="material-symbols-outlined ">{t("icon_map", "map")}</span>}
              number={activeCompanionSnapshot.blueprintsCount ?? activeCompanionSnapshot.desktopBlueprints?.length ?? 0}
              label={t("playsets_title", "{Blueprints}")}
              colorClass="text-[var(--text)]"
              onClick={() => {
                setIsBlueprintSwapOpen(true);
              }}
            />
          ) : null,
          <div key="support" className="relative group/ticket flex-1 flex min-w-0">
            {!session && (
              <HoverTooltip
                variant="danger"
                icon={t("icon_local_activity", "local_activity")}
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

      {/* Main Content Area: Feed, Queues, Workspace Modules & Operations Sidebar */}
      <div className="mt-10 md:mt-12 relative z-20">
        <CommandScreenBody>
          <CommandScreenMain>
            {/* 1. Active System Queues & Telemetry (Alert Cards — Auto-Hides When Clear or Ignored) */}
            {visibleQueueCards.length > 0 && (
              <div className="flex flex-col gap-4">
                <CommandScreenSectionHeading
                  title={t("system_queues_title", "System Queues & Updates")}
                  subtitle={t(
                    "system_queues_subtitle",
                    "Pending updates, file verification queues, and quick system utilities."
                  )}
                  icon={t("icon_layers", "layers")}
                  iconColorClass="text-[var(--warning)]"
                  onJump={() => setIsQueuesPanelOpen(true)}
                  rightSlot={
                    <PanelHeaderGroup>
                      {ignoredQueueCardCount > 0 && (
                        <PanelHeaderButton
                          icon={t("icon_visibility", "visibility")}
                          tooltip={`${t("btn_restore", "Restore")} (${ignoredQueueCardCount})`}
                          onClick={() =>
                            restoreIgnoredSystemCard(activeWorkspaceId)
                          }
                        />
                      )}
                      <PanelHeaderButton
                        icon={t("icon_arrow_forward", "arrow_forward")}
                        tooltip={`${t("system_queues_title", "System Queues & Updates")} (${activeQueueCards.length})`}
                        onClick={() => setIsQueuesPanelOpen(true)}
                      />
                    </PanelHeaderGroup>
                  }
                />
                <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6 w-full">
                  {visibleQueueCards.slice(0, 6).map((q) => (
                    <LiquidGlassAlertCard
                      key={q.id}
                      isAlertCard={true}
                      icon={q.icon}
                      accentVar={q.accentVar}
                      iconColorClass={q.iconColorClass}
                      badgeIcon={q.badgeIcon}
                      badgeLabel={q.badgeLabel}
                      overline={q.overline}
                      title={q.title}
                      description={q.description}
                      actionLabel={q.actionLabel}
                      actionIcon={q.actionIcon}
                      actionVariant={q.actionVariant}
                      onAction={q.onClick}
                      ignoreLabel={t("btn_ignore", "Ignore")}
                      ignoreIcon={t("icon_visibility_off", "visibility_off")}
                      onIgnore={() =>
                        ignoreSystemCard(activeWorkspaceId, q.id, {
                          tokens: q.ignoreTokens,
                          count: q.ignoreCount,
                        })
                      }
                      onClick={q.onClick}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 2. Community Dispatches / Comm-Link Feed (Tailored to Followed Masons) */}
            <div className="flex flex-col gap-4">
              <CommandScreenSectionHeading
                title={t("feed_title", "Community Feed")}
                subtitle={t(
                  "cmd_feed_sub",
                  "Latest {Mason} {dispatches}, release notes, and community updates"
                )}
                icon={t("icon_satellite_alt", "satellite_alt")}
                onJump={
                  localStorage.getItem("sanctuary_blacklisted") !== "true" && setView
                    ? () => setView("GlobalFeed")
                    : undefined
                }
                jumpTooltip={t("feed_title", "Community Feed")}
              />
              <MasonFeed
                onOpenMasonProfile={handleOpenMasonProfile}
                noCardWrapper={true}
                noBottomPad={true}
                maxItems={3}
                gridCols="grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3"
              />
            </div>

            {/* 3. Blueprint Patch Readiness Simulator (Non-Destructive Target Game Version Health) */}
            {hasCcSupport && isDesktop() && (
              <div className="flex flex-col gap-4">
                <CommandScreenSectionHeading
                  title={t("patch_sim_title", "{Blueprint} Patch Readiness")}
                  subtitle={t(
                    "patch_sim_cmd_sub",
                    "Simulate {Blueprint} health on upcoming or past game versions before updating"
                  )}
                  icon={t(
                    "icon_published_with_changes",
                    "published_with_changes"
                  )}
                  onJump={setView ? jumpToPatchReadinessTool : undefined}
                  jumpTooltip={t("patch_sim_tab_title", "Patch Readiness")}
                />

                <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6 w-full">
                  <PatchReadinessSimulatorInfoCard readiness={patchReadiness} />

                  {patchReadiness.blueprintReports.slice(0, 5).map((rep) => (
                    <BlueprintPatchReadinessCard
                      key={rep.blueprintName}
                      report={rep}
                      targetVersion={patchReadiness.targetVersion}
                      onInspect={(bpName) => setPatchReadinessDrawerBp(bpName)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 4. Spoke Support Tickets — Alert Info Card + Up to 5 Open Citizen Tickets */}
            <div className="flex flex-col gap-4">
              <CommandScreenSectionHeading
                title={t("sidebar_support", "Sanctuary Support")}
                subtitle={t(
                  "cmd_spoke_tickets_sub",
                  "Your active Spoke support tickets, bug reports, and direct staff replies"
                )}
                icon={t("icon_local_activity", "local_activity")}
                onJump={
                  session && setIsCitizenTicketsOpen
                    ? () => setIsCitizenTicketsOpen(true)
                    : undefined
                }
                jumpTooltip={t("support_tickets", "Support Tickets")}
              />
              <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6 w-full">
                <LiquidGlassAlertCard
                  icon={t("icon_support_agent", "support_agent")}
                  accentVar={
                    openCitizenTickets.length > 0
                      ? "var(--accent)"
                      : "var(--success)"
                  }
                  iconColorClass={
                    openCitizenTickets.length > 0
                      ? "text-[var(--accent)]"
                      : "text-[var(--success)]"
                  }
                  badgeIcon={t(
                    "icon_confirmation_number",
                    "confirmation_number"
                  )}
                  badgeLabel={
                    !session
                      ? t("auto_guest_mode_active_45", "Guest Mode Active")
                      : `${openCitizenTickets.length} ${t(
                          "ticket_status_open",
                          "Open"
                        )}`
                  }
                  overline={t("sidebar_support", "Sanctuary Support")}
                  title={
                    openCitizenTickets.length > 0
                      ? t("cmd_open_tickets_card_title", "Open Support Tickets")
                      : t("support_title", "Submit A Ticket")
                  }
                  description={t(
                    "cmd_support_info_desc",
                    "Need help with a broken {mod}, catalog mismatch, or OS issue? Open a Spoke ticket or click any active ticket to view staff replies in-drawer."
                  )}
                  actionLabel={t("support_title", "Submit A Ticket")}
                  actionIcon={t("icon_add_circle", "add_circle")}
                  onAction={() => {
                    if (session && setIsSupportDeskOpen) {
                      setIsSupportDeskOpen(true);
                    }
                  }}
                  secondaryActionIcon={
                    session && setIsCitizenTicketsOpen
                      ? t("icon_inbox", "inbox")
                      : undefined
                  }
                  secondaryActionTooltip={t(
                    "support_tickets",
                    "Support Tickets"
                  )}
                  onSecondaryAction={
                    session && setIsCitizenTicketsOpen
                      ? () => setIsCitizenTicketsOpen(true)
                      : undefined
                  }
                />

                {openCitizenTickets.slice(0, 5).map((ticket) => {
                  const st = String(ticket.status || "open").toLowerCase();
                  const isEscalated = st === "escalated";
                  const isPending =
                    st === "pending" || st === "investigating" || st === "claimed";
                  const statusIconColor = isEscalated
                    ? "text-[var(--danger)]"
                    : isPending
                      ? "text-[var(--warning)]"
                      : "text-[var(--accent)]";
                  const statusIcon = isEscalated
                    ? t("icon_priority_high", "priority_high")
                    : isPending
                      ? t("icon_schedule", "schedule")
                      : t("icon_confirmation_number", "confirmation_number");
                  const statusLabel = isEscalated
                    ? t("ticket_status_escalated", "Escalated")
                    : isPending
                      ? t("ticket_status_pending", "Pending")
                      : t("ticket_status_open", "Open");
                  const replyCount = Array.isArray(ticket.metadata?.replies)
                    ? ticket.metadata.replies.length
                    : 0;

                  return (
                    <UniversalCard
                      key={ticket.id}
                      layout="vertical"
                      icon={t(
                        "icon_confirmation_number",
                        "confirmation_number"
                      )}
                      statusColor={
                        isEscalated
                          ? "danger"
                          : isPending
                            ? "warning"
                            : "accent"
                      }
                      imageOverlay={
                        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[80%] z-30 pointer-events-none">
                          <span className={VAULT_CHIP_CLASS}>
                            <span
                              className={`material-symbols-outlined !text-[12px] ${statusIconColor}`}
                            >
                              {statusIcon}
                            </span>
                            <span>{statusLabel}</span>
                          </span>
                          {ticket.metadata?.expedited_support && (
                            <span className={VAULT_CHIP_CLASS}>
                              <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                                {t("icon_bolt", "bolt")}
                              </span>
                              <span>
                                {t(
                                  "supporter_badge_expedited_support",
                                  "Expedited Support"
                                )}
                              </span>
                            </span>
                          )}
                        </div>
                      }
                      title={ticket.title}
                      subtitle={`#${String(ticket.id || "").slice(0, 8)} • ${formatSanctuaryDate(
                        ticket.created_at
                      )}`}
                      onClick={() => setSelectedCitizenTicket(ticket)}
                      badges={
                        <>
                          <span className={VAULT_CHIP_CLASS}>
                            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                              {t("icon_local_activity", "local_activity")}
                            </span>
                            <span>
                              {String(
                                ticket.ticket_type ||
                                  t("support_tickets", "Support Tickets")
                              ).replace(/_/g, " ")}
                            </span>
                          </span>
                          {replyCount > 0 && (
                            <span className={VAULT_CHIP_CLASS}>
                              <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                                {t("icon_forum", "forum")}
                              </span>
                              <span>{`${replyCount} ${t("replies", "Replies")}`}</span>
                            </span>
                          )}
                        </>
                      }
                      footer={
                        <span className="text-[10px] font-black text-[var(--accent)] flex items-center gap-1">
                          {t("inspect", "Inspect")}
                          <span className="material-symbols-outlined !text-[12px]">
                            {t("icon_arrow_forward", "arrow_forward")}
                          </span>
                        </span>
                      }
                    >
                      <p className="text-xs text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed m-0">
                        {stripMarkdown(ticket.description || "")}
                      </p>
                    </UniversalCard>
                  );
                })}
              </div>
            </div>
          </CommandScreenMain>

          {/* Right Column: Command Operations & 2x3 Rig Telemetry */}
          <CommandScreenSidebar
            title={t("quick_actions", "Quick Actions")}
            icon={t("icon_bolt", "bolt")}
            metricsTitle={t("sys_telemetry_title", "System Telemetry")}
            metricsIcon={t("icon_monitoring", "monitoring")}
            metrics={
              <>
                <CommandScreenMetricTile
                  icon={t("icon_memory", "memory")}
                  value={
                    selectedVersion
                      ? String(selectedVersion).startsWith("v")
                        ? selectedVersion
                        : `v${selectedVersion}`
                      : t("auto", "Auto")
                  }
                  label={t("game_version", "Game Version")}
                  onClick={() => setIsSystemStatusOpen(true)}
                />
                <CommandScreenMetricTile
                  icon={t("icon_terminal", "terminal")}
                  value={statusLogCount}
                  label={t("cmd_metric_system_logs", "System Logs")}
                  onClick={() => setIsLogExpanded(true)}
                />
                <CommandScreenMetricTile
                  icon={t("icon_phonelink_ring", "phonelink_ring")}
                  value={blueprintQueueCount}
                  label={t("sig_queue_title", "Signature Queue")}
                  valueColorClass={
                    blueprintQueueCount > 0
                      ? "text-[var(--success)]"
                      : "theme-text-accent"
                  }
                  onClick={openSignatureQueueDrawer}
                />
                <CommandScreenMetricTile
                  icon={t("icon_biotech", "biotech")}
                  value={hasCcSupport ? scoutCount : "-"}
                  label={t("cmd_metric_unknown_dna", "Unknown DNA")}
                  valueColorClass={
                    scoutCount > 0 ? "text-[var(--warning)]" : "theme-text-accent"
                  }
                  onClick={() => {
                    if (hasCcSupport) setIsScoutPanelOpen(true);
                  }}
                />
                <CommandScreenMetricTile
                  icon={t("icon_history", "history")}
                  value={isDesktop() && hasSavesSupport ? backupCount : "-"}
                  label={t("term_backups", "{Backups}")}
                  valueColorClass={
                    isPatchDetected
                      ? "text-[var(--warning)]"
                      : "theme-text-accent"
                  }
                  onClick={() => {
                    if (isDesktop() && hasSavesSupport && setView) {
                      setView("backups");
                    }
                  }}
                />
                <CommandScreenMetricTile
                  icon={t("icon_design_services", "design_services")}
                  value={
                    isDesktop() && hasCcSupport ? unsavedWorkbenchCount : "-"
                  }
                  label={t("title_sidebar", "Workbench")}
                  valueColorClass={
                    unsavedWorkbenchCount > 0
                      ? "text-[var(--warning)]"
                      : "theme-text-accent"
                  }
                  onClick={() => {
                    if (isDesktop() && hasCcSupport && setView) {
                      setView("CitizensWorkbench");
                    }
                  }}
                />
              </>
            }
          >
            <CommandScreenQuickLink
              icon={
                urgentBroadcast
                  ? t("icon_priority_high", "priority_high")
                  : t("icon_campaign", "campaign")
              }
              title={t("title_sanctuary_alerts", "Sanctuary Alerts")}
              subtitle={
                urgentBroadcast
                  ? t("urgent_alert_active", "Urgent Alert Active")
                  : t("view_active_advisories", "View Platform Advisories")
              }
              isAlert={Boolean(urgentBroadcast)}
              onClick={() => setIsAlertsOpen(true)}
            />

            {hasCcSupport && (
              <CommandScreenQuickLink
                icon={t("icon_radar", "radar")}
                title={t("btn_radar", "Conflict Scan").replace(/^[^\w]*/, "").trim()}
                subtitle={
                  isDesktop()
                    ? isScanning
                      ? t("loading", "Loading")
                      : t("btn_radar_desc", "Scan And Sync Your {Vault}")
                    : t("cmd_companion_radar_sub", "Inspect Synced Desktop {Vault}")
                }
                isActive={Boolean(isScanning)}
                onClick={() => {
                  if (isDesktop()) {
                    runRadarSweep(false);
                  } else {
                    setCompanionRadarInitialFilter("ALL");
                    setIsCompanionRadarOpen(true);
                  }
                }}
                iconColorClass="text-[color-mix(in_srgb,var(--success)_85%,transparent)]"
              />
            )}

            {hasCcSupport && isDesktop() && (
              <CommandScreenQuickLink
                icon={
                  shelterActive
                    ? t("icon_lock", "lock")
                    : t("icon_lock_open", "lock_open")
                }
                title={
                  shelterActive
                    ? t("btn_reclaim", "Reclaim {Vault}")
                        .replace(/^[^\w]*/, "")
                        .trim()
                    : t("btn_lockdown", "Lockdown {Vault}")
                        .replace(/^[^\w]*/, "")
                        .trim()
                }
                subtitle={
                  shelterActive
                    ? t("btn_bunker_unlock_desc", "Disable Defensive Process")
                    : t("btn_bunker_lock_desc", "Execute Defensive Process")
                }
                isActive={Boolean(shelterActive)}
                onClick={() => triggerShelter(!shelterActive)}
              />
            )}

            {isDesktop() ? (
              <CommandScreenQuickLink
                icon={t("icon_public", "public")}
                title={t("sidebar_web_browser", "Sanctuary Browser")}
                subtitle={
                  openBrowserTabCount > 0
                    ? `${openBrowserTabCount} ${t("active", "Active")} • ${
                        useInternalBrowser
                          ? t("cmd_browser_integrated", "Integrated Intake Ready")
                          : t("open", "Open")
                      }`
                    : t(
                        "cmd_browser_quick_sub",
                        "Browse & Auto-Stage {Mods} Into {Vault}"
                      )
                }
                onClick={() => setIsSideBrowserOpen(true)}
              />
            ) : (
              <CommandScreenQuickLink
                icon={t("icon_phonelink_ring", "phonelink_ring")}
                title={t("sig_queue_title", "Signature Queue")}
                subtitle={t("blueprint_tab_pipeline", "Personal Rig Pipeline")}
                onClick={openSignatureQueueDrawer}
              />
            )}

            <div className="relative group/supportdesk w-full">
              {!session && (
                <HoverTooltip
                  variant="danger"
                  title={
                    localStorage.getItem("sanctuary_blacklisted") === "true"
                      ? t("alert_comm_banned", "Communications Restricted")
                      : t(
                          "alert_guest_mode_uploads",
                          "Guest Mode Active:\nUploads are disabled."
                        )
                  }
                  subtitle={
                    localStorage.getItem("sanctuary_blacklisted") === "true"
                      ? t(
                          "alert_comm_banned_desc",
                          "Your account has been restricted from posting or submitting content."
                        )
                      : t(
                          "alert_guest_mode_desc",
                          "Guest mode is active. Login or register to access full features."
                        )
                  }
                  className="group-hover/supportdesk:flex z-[1000]"
                />
              )}
              <div className={!session ? "opacity-50 cursor-not-allowed" : ""}>
                <CommandScreenQuickLink
                  icon={t("icon_local_activity", "local_activity")}
                  title={t("support_title", "Submit A Ticket")}
                  subtitle={t(
                    "btn_submit_ticket_desc",
                    "Open Sanctuary Support System"
                  )}
                  onClick={() => {
                    if (setIsSupportDeskOpen && session) setIsSupportDeskOpen(true);
                  }}
                />
              </div>
            </div>

            <CommandScreenQuickLink
              icon={t("icon_history", "history")}
              title={t("audit_logs", "Audit Logs")}
              subtitle={t("audit_logs_desc", "System modification history")}
              onClick={() => setIsAuditLogsOpen(true)}
            />

            <CommandScreenQuickLink
              icon={t("icon_volunteer_activism", "volunteer_activism")}
              title={t("cmd_quick_support_title", "Support & Perks (0% Fee)")}
              subtitle={t(
                "cmd_quick_support_desc",
                "Support this community & unlock Global Daily Dev Builds"
              )}
              onClick={() => setIsSupportPanelOpen(true)}
              iconColorClass="text-[color-mix(in_srgb,var(--success)_85%,transparent)]"
            />
          </CommandScreenSidebar>
        </CommandScreenBody>
      </div>

      <Suspense fallback={null}>
        {isSupportPanelOpen && (
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
        )}

        {isAuditLogsOpen && (
          <AuditLogViewer
            isSidePanel={true}
            isOpen={isAuditLogsOpen}
            onClose={() => setIsAuditLogsOpen(false)}
            hideEditIdentity={true}
          />
        )}

        {viewingPost && <MasonPostViewer post={viewingPost} onClose={() => setViewingPost(null)} userId={session?.user?.id || null} />}

        {alertsPanelMode !== null && (
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
        )}

        {patchReadinessDrawerBp !== null && (
          <BlueprintPatchReadinessSidePanel
            isOpen={patchReadinessDrawerBp !== null}
            onClose={() => setPatchReadinessDrawerBp(null)}
            initialBlueprintName={patchReadinessDrawerBp || undefined}
            readiness={patchReadiness}
            onOpenFullTool={jumpToPatchReadinessTool}
            onTriggerShelter={triggerShelter}
            onNavigateView={setView}
          />
        )}

        {selectedCitizenTicket && (
          <TicketDossierSidePanel
            isOpen={Boolean(selectedCitizenTicket)}
            onClose={() => setSelectedCitizenTicket(null)}
            ticket={selectedCitizenTicket}
            tableName="sanctuary_tickets"
            canReply={true}
            onReplyAdded={(newMetadata?: any) => {
              if (newMetadata) {
                setSelectedCitizenTicket((prev: any) =>
                  prev ? { ...prev, metadata: newMetadata } : null
                );
              }
              window.dispatchEvent(new Event("sanctuary-tickets-updated"));
            }}
          />
        )}

        {!isDesktop() && isCompanionRadarOpen && (
          <VaultCompanionRadarSidePanel
            isOpen={isCompanionRadarOpen}
            onClose={() => setIsCompanionRadarOpen(false)}
            snapshot={activeCompanionSnapshot}
            enrichedArtifacts={enrichedCompanionArtifacts}
            initialFilter={companionRadarInitialFilter}
            onOpenDossier={onOpenDossier}
            onNavigateToBlueprints={() => {
              if (setView) setView("playsets");
            }}
          />
        )}
      </Suspense>
    </div>
  );
}




