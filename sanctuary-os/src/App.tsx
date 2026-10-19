import { YeetConfirmAlert } from "./side-panels/YeetConfirmAlert";
import { DefconAlert } from "./DefconAlert";
import { TitleBar } from "./TitleBar";
import { openUrl } from "@tauri-apps/plugin-opener";
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import { ErrorBoundary } from "./ErrorBoundary";
import { AppModals } from "./AppModals";

import { useModalStore } from "./store/modalStore";
import { useAppActions } from "./hooks/useAppActions";
import { readTextFile, writeTextFile, exists, mkdir } from '@tauri-apps/plugin-fs';
import { appDataDir } from "@tauri-apps/api/path";
import { useModFiltering } from "./hooks/useModFiltering";
import { useBackupLogic } from "./hooks/useBackupLogic";
import { useDefconRadar } from "./hooks/useDefconRadar";
import { useLaunchLogic } from "./hooks/useLaunchLogic";
import { usePlaySetLogic } from "./hooks/usePlaySetLogic";
import { useRadarLogic } from "./hooks/useRadarLogic";
import { useModActions } from "./hooks/useModActions";
import { useVaultIntake } from "./hooks/useVaultIntake";
import { useCloudService } from "./hooks/useCloudService";
import { useStore, syncMasterSchemas, syncGameDatabases, getSafeSchema } from "./store";
import { useGlobalListeners } from "./hooks/useGlobalListeners";
import { open, save } from "@tauri-apps/plugin-dialog";
import { supabase, supabaseAuth, getActiveGameClient, isStandaloneFork, RESOLVED_SANCTUARY_CONFIG } from "./supabase";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import ArchitectHub from "./ArchitectHub";
import GlobalFeed from "./GlobalFeed";
import Settings from "./SettingsTab";
import { ModData, ViewHeader, deriveHumanReadableVersion, isVersionMatch, loadDLCMap, getFileLabel, isSupportedExtension, formatDisplayName, getExtensionRegex, PixelSnapper } from "./shared";
import { ModCard } from "./ModCard";
import ModDossier from "./ModDossier";
import BlueprintArchitect from "./BlueprintArchitect";
import Nexus from "./Nexus";
import { DbpfScout } from "./DbpfScout";
import { useLexicon } from "./LexiconContext";
import { WorkspaceLanding } from "./WorkspaceLanding";
import WebLandingPage from "./WebLandingPage";
import { isDesktop } from "./utils/envUtils";
import { isRootDomain, getSubdomain } from "./utils/routingUtils";
import { Sidebar } from "./Sidebar";
import { MobileBottomNav } from "./MobileBottomNav";
import NotificationSidebar from "./side-panels/NotificationSidebar";
import CitizenTicketsSidePanel from "./side-panels/CitizenTicketsSidePanel";
import { NexusUpdatesChecker } from "./NexusUpdatesChecker";
import MasonHub from "./MasonHub";
import MasonProfile from "./MasonProfile";
import MasonPostViewer from "./side-panels/MasonPostViewer";
import SupportHub from "./SupportHub";
import CommandCenter from "./CommandCenter";
import Blueprints from "./Blueprints";
import StagingPayloadEditor from "./components/StagingPayloadEditor";
import { DevBuildClearanceGate } from "./components/DevBuildClearanceGate";
import Vault from "./Vault";
import Lab from "./Lab";
import { scrubLogUserData, buildFormattedLabReportText } from "./utils/logScrubber";
import { matchExceptionRules } from "./components/KnownErrorDiagnosisBanner";
import { isUnrelatedGameBugLog, getExceptionRules } from "./components/KnownExceptionRules";
import TimeCapsule from "./TimeCapsule";
import Oversight from "./Oversight";
import WayfinderHub from "./WayfinderHub";
import KeepersCore from "./KeepersCore";
import { UpdateSidePanel } from './side-panels/UpdateSidePanel';
import { NexusUpdatesSidePanel } from './side-panels/NexusUpdatesSidePanel';
import CitizensWorkbench from "./CitizensWorkbench";
import { ContextMenu } from "./ContextMenu";
import { GlobalTooltip } from "./GlobalTooltip";
import { useTheme } from "./ThemeContext";
import { SystemBackground } from "./SystemBackground";
import {
  dispatchSanctuaryNotification,
  getNotificationMode,
  mapDbNotificationTypeToCategory,
  seedInitialDeliveredNotifications,
  hasDeliveredNotification,
} from "./utils/notificationHelper";
const setupBtnStyle: React.CSSProperties = {
  padding: "12px",
  backgroundColor: "rgba(255,255,255,0.05)",
  color: "white",
  border: "none",
  borderRadius: "4px",
  cursor: "pointer",
};

function App() {
  if (!window.__sanctuaryCache) {
    window.__sanctuaryCache = {} as any;
  }
  if (!window.__sanctuaryCache!.nexus) {
    window.__sanctuaryCache!.nexus = {
      homeStats: null,
      recentFeed: [],
      lastHomeFetch: 0,
      nexusItems: null,
      lastNexusFetch: 0,
      assetResultsMap: {},
      lastAssetFetch: 0,
    };
  }
  if (!window.__sanctuaryCache!.globalFeed) {
    window.__sanctuaryCache!.globalFeed = {
      posts: [],
      overviewStats: null,
      lastFetch: 0,
    };
  }
  if (!window.__sanctuaryCache!.support) {
    window.__sanctuaryCache!.support = {
      tickets: [],
      lastFetch: 0,
    };
  }

  const { currentTheme } = useTheme();
  const insertingHashes = useRef<Set<string>>(new Set());
  const { t } = useLexicon();
  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);
  const isGameDatabasesSynced = useStore((state) => state.isGameDatabasesSynced);
  const detectGameVersion = useStore((state) => state.detectGameVersion);
  const { fetchBackups, restoreGameBackup, deleteBackup, triggerFullEngineBackup, triggerPrePatchSnapshot } = useBackupLogic(() => detectGameVersion());
  const [subtitleIndex, setSubtitleIndex] = useState(Math.floor(Math.random() * 12) + 1);

  useEffect(() => {
    // Prevent cache bleeding: clear global caches when switching workspaces
    if (window.__sanctuaryCache) {
      if (window.__sanctuaryCache!.globalFeed) {
        window.__sanctuaryCache!.globalFeed.lastFetch = 0;
        window.__sanctuaryCache!.globalFeed.posts = [];
      }
      if (window.__sanctuaryCache!.support) {
        window.__sanctuaryCache!.support.lastFetch = 0;
        window.__sanctuaryCache!.support.tickets = [];
      }
      if (window.__sanctuaryCache!.nexus) {
        window.__sanctuaryCache!.nexus.lastHomeFetch = 0;
        window.__sanctuaryCache!.nexus.lastNexusFetch = 0;
        window.__sanctuaryCache!.nexus.lastAssetFetch = 0;
        window.__sanctuaryCache!.nexus.homeStats = null;
        window.__sanctuaryCache!.nexus.recentFeed = [];
        window.__sanctuaryCache!.nexus.nexusItems = null;
        window.__sanctuaryCache!.nexus.assetResultsMap = {};
      }
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    // PREFETCH ELEVATED HUBS DATA
    const prefetchHubs = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const CACHE_TTL = 5 * 60 * 1000;
      const now = performance.now();
      const cache = window.__sanctuaryCache!;

      // 1. Prefetch Global Feed
      if (now - cache.globalFeed.lastFetch > CACHE_TTL) {
        try {
          const { data } = await supabase.from('mason_posts').select('*, masons(*), likes:mason_post_likes(count), views:mason_post_views(count), comments:mason_post_comments(count)').order('created_at', { ascending: false }).limit(100);
          if (data) {
            cache.globalFeed.posts = data;
            cache.globalFeed.lastFetch = now;
          }
        } catch (e) { }
      }

      // 2. Prefetch Support Tickets
      if (now - cache.support.lastFetch > CACHE_TTL) {
        try {
          const { data } = await supabase.from('keeper_tickets').select('*').eq('author_id', session.user.id).order('created_at', { ascending: false });
          if (data) {
            cache.support.tickets = data;
            cache.support.lastFetch = now;
          }
        } catch (e) { }
      }
    };
    prefetchHubs();

    const interval = setInterval(() => {
      setSubtitleIndex(Math.floor(Math.random() * 12) + 1);
    }, 15000);
    return () => clearInterval(interval);
  }, []);
  const getBackupSignature = (filename: string) => {
    const cleanName = filename.replace(".tar.zst", "");
    const isEngine = filename.toLowerCase().includes("engine");
    if (cleanName.includes("--")) {
      const parts = cleanName.split("--");
      return {
        alias: parts[0].replace(/_/g, " "),
        version: `v.${parts[1]}`,
        timestamp: parts[2] || "0",
        isEngine,
      };
    }
    const parts = cleanName.split("_");
    const versionPart = parts.find((p) => p.includes(".")) || "LEGACY";
    const versionIndex = parts.indexOf(versionPart);
    const alias =
      versionIndex > 0 ? parts.slice(0, versionIndex).join(" ") : parts[0];
    return {
      alias: alias || t("vlocal"),
      version:
        versionPart === "LEGACY"
          ? isEngine
            ? "v.CORE"
            : "v.LEGACY"
          : `v.${versionPart}`,
      timestamp: parts[parts.length - 1] || "0",
      isEngine,
    };
  };
  const backupProgress = useStore((state) => state.backupProgress);
  const setBackupProgress = useStore((state) => state.setBackupProgress);
  const isPatchDetected = useStore((state) => state.isPatchDetected);
  const defconLevel = useStore((state) => state.defconLevel);
  const userRole = useStore((state) => state.userRole);
  const setUserRole = useStore((state) => state.setUserRole);
  const osRole = useStore((state) => state.osRole);
  const setOsRole = useStore((state) => state.setOsRole);
  const [metaAllowWriteInput, setMetaAllowWriteInput] = useState(false);
  const playSets = useStore((state) => state.playSets);
  const setPlaySets = useStore((state) => state.setPlaySets);
  const activeSetName = useStore((state) => state.activeSetName);
  const setActiveSetName = useStore((state) => state.setActiveSetName);
  const statusLog = useStore((state) => state.statusLog);
  const setStatus = useStore((state) => state.setStatus);
  const clearStatusLog = useStore((state) => state.clearStatusLog);
  const session = useStore((state) => state.session);

  const modList = useStore((state) => state.modList);
  const setModList = useStore((state) => state.setModList);
  const activeGameSchema = useStore((state) => state.activeGameSchema);

  useEffect(() => {
    if (activeGameSchema && isDesktop()) {
      invoke('update_active_game_schema', { schema: activeGameSchema }).catch(console.error);
    }
  }, [activeGameSchema]);




  const [forceSweepCounter, setForceSweepCounter] = useState(0);

  const { runRadarSweep, fetchVault, malwareAlert, setMalwareAlert } = useRadarLogic(checkNetworkUpdates);

  const { handleDroppedFiles } = useVaultIntake(runRadarSweep);



  useEffect(() => {
    const handleForceSweep = () => setForceSweepCounter(c => c + 1);
    window.addEventListener('force-radar-sweep', handleForceSweep);
    return () => window.removeEventListener('force-radar-sweep', handleForceSweep);
  }, []);

  useEffect(() => {
    if (forceSweepCounter > 0) {
      runRadarSweep(true);
    }
  }, [forceSweepCounter]);

  useEffect(() => {
    async function checkForUpdates() {
      try {
        const {
          checkSupporterDevBuildUpdate,
          checkStableGitHubReleaseUpdate,
          isTargetVersionNewer,
        } = await import("./utils/supporterManager");
        const pkgMod: any = await import("../package.json");
        const pkgVer = pkgMod?.default?.version || pkgMod?.version || "0.5.8";
        let currentVer = pkgVer;
        if (isDesktop() && !/dev/i.test(pkgVer)) {
          try {
            const { getVersion } = await import("@tauri-apps/api/app");
            const tauriVer = await getVersion();
            if (tauriVer && isTargetVersionNewer(pkgVer, tauriVer, false)) {
              currentVer = tauriVer;
            }
          } catch {
            // fallback
          }
        }
        const devUpdate = await checkSupporterDevBuildUpdate(currentVer);
        if (devUpdate && devUpdate.isDevChannelActive && devUpdate.updateAvailable) {
          setUpdatePayload({
            version: devUpdate.version,
            date: devUpdate.date,
            body: devUpdate.notes,
            isDevChannel: true,
            isExternalDownload: true,
            downloadAndInstall: async () => {
              await openUrl(devUpdate.downloadUrl);
            },
          } as any);
          return;
        }
        if (isDesktop()) {
          try {
            const update = await check();
            if (update && isTargetVersionNewer(currentVer, update.version, false)) {
              setUpdatePayload(update);
              return;
            }
          } catch {
            // Fallback to live GitHub Releases API check below
          }
          const stableFallback = await checkStableGitHubReleaseUpdate(currentVer);
          if (stableFallback && stableFallback.updateAvailable) {
            setUpdatePayload({
              version: stableFallback.version,
              date: stableFallback.date,
              body: stableFallback.notes,
              isExternalDownload: true,
              downloadAndInstall: async () => {
                await openUrl(stableFallback.downloadUrl);
              },
            } as any);
          }
        }
      } catch (e) {
      }
    }
    checkForUpdates();

    let localIsDragging = false;
    let dropQueue: string[] = [];
    let dropTimeout: any = null;

    const processDropQueue = async () => {
      const paths = [...dropQueue];
      dropQueue = [];

      useModalStore.getState().setDroppedFiles(paths);
      setIsDropzoneOpen(true);
      setDropzoneState("ingesting");
      setIngestProgress({ active: true, current: 0, total: paths.length });

      const startTime = Date.now();
      const hasMalware = await handleDroppedFiles(paths);

      const elapsed = Date.now() - startTime;
      if (elapsed < 1500) {
        await new Promise(r => setTimeout(r, 1500 - elapsed));
      }

      setIsDropzoneOpen(false);
      setDropzoneState("awaiting");

      if (!hasMalware) {
        setTimeout(() => {
          useModalStore.getState().setDroppedFiles([]);
        }, 0);
      }

      setIngestProgress({ active: false, current: 0, total: 0 });
    };

    let unlistenPromise: Promise<() => void> | null = null;

    if (isDesktop()) {
      unlistenPromise = getCurrentWebview().onDragDropEvent((event) => {
        if (event.payload.type === "enter" || event.payload.type === "over") {
          if (!localIsDragging) {
            localIsDragging = true;
            useModalStore.getState().setIsDragging(true);
          }
        } else if (event.payload.type === "leave") {
          if (localIsDragging) {
            localIsDragging = false;
            useModalStore.getState().setIsDragging(false);
          }
        } else if (event.payload.type === "drop") {
          localIsDragging = false;
          useModalStore.getState().setIsDragging(false);
          const paths = event.payload.paths as string[];
          if (paths && paths.length > 0) {
            dropQueue.push(...paths);
            if (dropTimeout) clearTimeout(dropTimeout);
            dropTimeout = setTimeout(processDropQueue, 150);
          }
        }
      });
    }

    const handleCancelDrag = () => {
      const state = useModalStore.getState();
      if (state.isDragging) {
        state.setIsDragging(false);
      }
    };
    window.addEventListener("mousemove", handleCancelDrag);
    window.addEventListener("mousedown", handleCancelDrag);
    window.addEventListener("keydown", handleCancelDrag);

    const handleNativeSearch = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'f' || e.key.toLowerCase() === 'g')) {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", handleNativeSearch, { capture: true });

    return () => {
      if (unlistenPromise) unlistenPromise.then((unlisten) => unlisten());
      window.removeEventListener("mousemove", handleCancelDrag);
      window.removeEventListener("mousedown", handleCancelDrag);
      window.removeEventListener("keydown", handleCancelDrag);
      window.removeEventListener("keydown", handleNativeSearch, { capture: true });
    };
  }, []);

  const view = useStore((state) => state.view);
  const setView = useStore((state) => state.setView);
  const playsetsLoaded = useStore((state) => state.playsetsLoaded);
  const setPlaysetsLoaded = useStore((state) => state.setPlaysetsLoaded);

  const isConfigured = useStore((state) => state.isConfigured);
  const setIsConfigured = useStore((state) => state.setIsConfigured);
  const livePath = useStore((state) => state.livePath);
  const setLivePath = useStore((state) => state.setLivePath);
  const modsPath = useStore((state) => state.modsPath);
  const setModsPath = useStore((state) => state.setModsPath);
  const vaultPath = useStore((state) => state.vaultPath);
  const setVaultPath = useStore((state) => state.setVaultPath);
  const quarantineList = useStore((state) => state.quarantineList);
  const setQuarantineList = useStore((state) => state.setQuarantineList);
  const shelterContents = useStore((state) => state.shelterContents);
  const setShelterContents = useStore((state) => state.setShelterContents);
  const shelterActive = useStore((state) => state.shelterActive);
  const setShelterActive = useStore((state) => state.setShelterActive);

  const setScanProgress = useStore((state) => state.setScanProgress);
  const backupList = useStore((state) => state.backupList);
  const setBackupList = useStore((state) => state.setBackupList);
  const [isNotificationSidebarOpen, setIsNotificationSidebarOpen] = useState(false);
  const [globalViewingPost, setGlobalViewingPost] = useState<any>(null);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const prevUnreadRef = useRef<number>(0);
  const isInitialLoadRef = useRef<boolean>(true);
  const [activeDossier, setActiveDossier] = useState<ModData | null>(null);
  const [labQueue, setLabQueue] = useState<ModData[]>([]);
  const [activeLabMod, setActiveLabMod] = useState<ModData | null>(null);
  const [activeSandboxMod, setActiveSandboxMod] = useState<ModData | null>(null);
  const [testErrorFound, setTestErrorFound] = useState(false);
  const [logWatcher, setLogWatcher] = useState<any>(null);
  const [testLogSnippet, setTestLogSnippet] = useState<string>("");
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [labSearchQuery, setLabSearchQuery] = useState("");
  const [labVerificationQueue, setLabVerificationQueue] = useState<any[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [configContent, setConfigContent] = useState("");
  const activePlaySetIndex = useStore((state) => state.activePlaySetIndex);
  const setActivePlaySetIndex = useStore(
    (state) => state.setActivePlaySetIndex,
  );
  const [isEditingMeta, setIsEditingMeta] = useState(false);
  const [isCorrectingMeta, setIsCorrectingMeta] = useState(false);
  const [metaNameInput, setMetaNameInput] = useState("");
  const [metaAuthorInput, setMetaAuthorInput] = useState("");
  const [metaUrlInput, setMetaUrlInput] = useState("");
  const [metaImageInput, setMetaImageInput] = useState("");
  const [metaDescInput, setMetaDescInput] = useState("");
  const [metaStatusMsgInput, setMetaStatusMsgInput] = useState("");
  const [metaStatusInput, setMetaStatusInput] = useState("unverified");
  const [metaVersionInput, setMetaVersionInput] = useState("");
  const [metaManifestUrlInput, setMetaManifestUrlInput] = useState("");
  const [metaIsPaidInput, setMetaIsPaidInput] = useState(false);
  const [metaIsEarlyAccessInput, setMetaIsEarlyAccessInput] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [cloudSearchResults, setCloudSearchResults] = useState<any[]>([]);
  const [isSearchingCloud, setIsSearchingCloud] = useState(false);
  const [isDraftingSet, setIsDraftingSet] = useState(false);
  const [draftSetName, setDraftSetName] = useState("");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isBugModalOpen, setIsBugModalOpen] = useState(false);
  const [isCitizenTicketsOpen, setIsCitizenTicketsOpen] = useState(false);

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-width', isSidebarCollapsed ? '80px' : 'var(--sidebarWidth, 288px)');
  }, [isSidebarCollapsed]);

  useEffect(() => {
    const handleOpenSupport = () => {
      useModalStore.getState().setIsSupportPanelOpen(true);
      window.dispatchEvent(new Event("force-resize-update"));
    };
    document.addEventListener("open-support-modal", handleOpenSupport);
    return () => document.removeEventListener("open-support-modal", handleOpenSupport);
  }, []);

  const selectedVersion = useStore((state) => state.selectedVersion);
  const setSelectedVersion = useStore((state) => state.setSelectedVersion);

  const ownedDLC = useStore((state) => state.ownedDLC);
  const setOwnedDLC = useStore((state) => state.setOwnedDLC);
  const maskedDLC = useStore((state) => state.maskedDLC);
  const setMaskedDLC = useStore((state) => state.setMaskedDLC);
  const [metaRequiredDLC, setMetaRequiredDLC] = useState<string[]>([]);
  const [drawerConfirmHash, setDrawerConfirmHash] = useState<string | null>(
    null,
  );


  const [associatedMods, setAssociatedMods] = useState<any[]>([]);

  useEffect(() => {
    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SANCTUARY_NOTIFICATION_CLICK') {
        setIsNotificationSidebarOpen(true);
      }
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
    }
    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      }
    };
  }, []);

  useEffect(() => {
    if (!session?.user?.id) return;

    const getTitleForDbType = (dbType?: string) => {
      switch (dbType) {
        case 'reply':
          return t('ui.replies', 'Comm-Link Reply');
        case 'support_reply':
          return t('notify_support', 'Support Alert');
        case 'new_post':
          return t('btn_new_posts', 'Comm-Link Post');
        case 'system_broadcast':
        default:
          return t('notify_system_dispatch', 'System Dispatch');
      }
    };

    const fetchUnread = async () => {
      if (session?.user?.id) {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        const { data } = await supabase.rpc('secure_fetch_notifications', { p_token: token });

        if (data && Array.isArray(data)) {
          // On the very first boot on this device, seed existing notification IDs so historical backlog isn't spammed
          seedInitialDeliveredNotifications(data.map((n: any) => `notif:${n.id}`));

          const enabledUnread = data.filter((n: any) => {
            if (n.is_read) return false;
            const cat = mapDbNotificationTypeToCategory(n.type);
            return getNotificationMode(cat) !== 'NONE';
          });

          const gameUnread = enabledUnread.length;

          for (const notif of enabledUnread) {
            const uniqueId = `notif:${notif.id}`;
            if (!hasDeliveredNotification(uniqueId)) {
              const cat = mapDbNotificationTypeToCategory(notif.type);
              dispatchSanctuaryNotification({
                uniqueId,
                category: cat,
                title: getTitleForDbType(notif.type),
                body: notif.message || '',
                onInApp: () => {
                  setStatus(`notifications_active ${t('tab_notifs', 'Notifications')}`);
                  window.dispatchEvent(new Event('new_notification_arrived'));
                },
                data: {
                  notificationId: notif.id,
                  referenceId: notif.reference_id,
                  type: notif.type,
                },
              });
            }
          }

          prevUnreadRef.current = gameUnread;
          isInitialLoadRef.current = false;
          setUnreadNotificationCount(gameUnread);
        } else {
          setUnreadNotificationCount(0);
        }
      }
    };

    let interval: any = null;
    let realtimeChannel: any = null;

    const setupNetworkFeatures = async () => {
      if (session) {
        fetchUnread();
        if (!interval) {
          interval = setInterval(fetchUnread, 30000);
        }
        if (!realtimeChannel && navigator.onLine && localStorage.getItem('sanctuary_local_only') !== 'true') {
          realtimeChannel = supabase
            .channel(`sanctuary_user_notifs_${session.user.id}`)
            .on(
              'postgres_changes',
              {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${session.user.id}`,
              },
              () => {
                fetchUnread();
              }
            )
            .on(
              'postgres_changes',
              {
                event: 'INSERT',
                schema: 'public',
                table: 'system_broadcasts',
              },
              (payload: any) => {
                const row = payload?.new;
                if (row?.id && row?.is_active) {
                  const isUrgent = Boolean(row.is_pinned);
                  dispatchSanctuaryNotification({
                    uniqueId: isUrgent ? `urgent_broadcast:${row.id}` : `broadcast:${row.id}`,
                    category: isUrgent ? 'alert_banner' : 'system_dispatch',
                    title: row.title || t('notify_system_dispatch', 'System Dispatch'),
                    body: row.message || row.content || '',
                    data: { broadcastId: row.id, type: 'system_broadcast' },
                  });
                }
                fetchUnread();
              }
            )
            .subscribe();
        }
      }
    };

    setupNetworkFeatures();

    const handleOnline = () => {
      if (localStorage.getItem("sanctuary_local_only") !== "true") {
        fetchUnread();
        setupNetworkFeatures();
      }
    };

    window.addEventListener('refresh_notifications', fetchUnread);
    window.addEventListener('online', handleOnline);

    return () => {
      if (interval) clearInterval(interval);
      if (realtimeChannel && typeof realtimeChannel.unsubscribe === 'function') {
        try {
          realtimeChannel.unsubscribe();
        } catch (e) {}
      }
      window.removeEventListener('refresh_notifications', fetchUnread);
      window.removeEventListener('online', handleOnline);
    };
  }, [session?.user?.id, activeWorkspaceId]);

  useEffect(() => {
    if (!activeWorkspaceId) return;

    let isMounted = true;
    const loadFsPlaysets = async () => {
      try {
        let loadedSets: any[] = [];

        if (isDesktop()) {
          const filePath = await appDataDir();
          if (!(await exists(filePath))) {
            await mkdir(filePath, { recursive: true });
          }
          const fullPath = `${filePath}\\sanctuary_${activeWorkspaceId}_playsets.json`;

          if (await exists(fullPath)) {
            const contents = await readTextFile(fullPath);
            loadedSets = JSON.parse(contents);
          } else {
            const cached = localStorage.getItem(`sanctuary_${activeWorkspaceId}_playsets`);
            if (cached) {
              loadedSets = JSON.parse(cached);
              await writeTextFile(fullPath, JSON.stringify(loadedSets));
            }
          }
        } else {
          const cached = localStorage.getItem(`sanctuary_${activeWorkspaceId}_playsets`);
          if (cached) {
            loadedSets = JSON.parse(cached);
          }
        }

        if (isMounted) {
          const store = useStore.getState();
          store.setPlaySets(loadedSets);

          if (store.activeSetName) {
            const foundIdx = loadedSets.findIndex((s: any) => s.name === store.activeSetName);
            if (foundIdx !== -1) {
              store.setActivePlaySetIndex(foundIdx);
            }
          } else if (loadedSets.length > 0) {
            store.setActiveSetName(loadedSets[0].name);
            store.setActivePlaySetIndex(0);
          }

          setPlaysetsLoaded(true);
        }
      } catch (err) {
        console.error("Failed to load playsets from FS", err);
        if (isMounted) setPlaysetsLoaded(true);
      }
    };

    loadFsPlaysets();
    return () => { isMounted = false; };
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (!playsetsLoaded || !activeWorkspaceId) return;
    const saveFsPlaysets = async () => {
      try {
        if (isDesktop()) {
          const filePath = await appDataDir();
          if (!(await exists(filePath))) {
            await mkdir(filePath, { recursive: true });
          }
          const fullPath = `${filePath}\\sanctuary_${activeWorkspaceId}_playsets.json`;
          await writeTextFile(fullPath, JSON.stringify(playSets));
        } else {
          try {
            localStorage.setItem(`sanctuary_${activeWorkspaceId}_playsets`, JSON.stringify(playSets));
          } catch (e) {
            console.warn("localStorage quota exceeded for playsets.");
          }
        }
      } catch (err) {
        console.error("Failed to save playsets to FS", err);
      }
    };
    const debounceTimeout = setTimeout(saveFsPlaysets, 300);
    return () => clearTimeout(debounceTimeout);
  }, [playSets, playsetsLoaded, activeWorkspaceId]);

  useEffect(() => {
    if (!activeDossier) {
      setMetaManifestUrlInput("");
      return;
    }
    try {
      const localOvr = JSON.parse(localStorage.getItem("sanctuary_local_overrides") || "{}");
      const edgeLogic = JSON.parse(localStorage.getItem("sanctuary_edge_logic") || "{}");
      const h = activeDossier.hash;
      const existingUrl =
        (activeDossier as any).manifest_url ||
        (h && localOvr[h]?.manifest_url) ||
        (h && edgeLogic[h]?.manifest_url) ||
        "";
      setMetaManifestUrlInput(existingUrl);
    } catch (e) {
      setMetaManifestUrlInput((activeDossier as any).manifest_url || "");
    }
  }, [activeDossier]);

  const saveLocalMetadata = async (extraOverrides?: any) => {
    if (!activeDossier) return;
    setStatus(t("status_syncing_metadata"));
    try {
      const localOvr = JSON.parse(localStorage.getItem("sanctuary_local_overrides") || "{}");
      const edgeLogic = JSON.parse(localStorage.getItem("sanctuary_edge_logic") || "{}");
      const cleanManifestUrl = (extraOverrides?.manifest_url ?? metaManifestUrlInput ?? "").trim();

      if (activeDossier.hash) {
        const familyHashes = Array.from(
          new Set(
            [
              activeDossier.hash,
              ...(Array.isArray(activeDossier.flavors)
                ? activeDossier.flavors.map((f: any) => f.hash)
                : []),
            ].filter(Boolean),
          ),
        );

        let fetchedManifest: any = null;
        if (cleanManifestUrl && /^https?:\/\//i.test(cleanManifestUrl)) {
          const artifactId =
            metaNameInput.trim() ||
            activeDossier.displayName ||
            activeDossier.name ||
            activeDossier.hash;
          const masonId = metaAuthorInput.trim() || activeDossier.author || "Local";
          if (isDesktop() && vaultPath) {
            try {
              await invoke("register_edge_override", {
                vaultPath,
                overrideData: {
                  artifact_id: artifactId,
                  mason_id: masonId,
                  game_id: activeWorkspaceId || "",
                  manifest_url: cleanManifestUrl,
                  target_hash: activeDossier.hash,
                  archive_hashes: familyHashes.filter((h) => h !== activeDossier.hash),
                },
              });
              fetchedManifest = await invoke("fetch_and_sync_edge_manifest", {
                vaultPath,
                artifactId,
              });
            } catch (err) {
              console.warn("Edge manifest Tauri sync fallback to fetch:", err);
            }
          }
          if (!fetchedManifest) {
            try {
              const resp = await fetch(cleanManifestUrl);
              if (resp.ok) fetchedManifest = await resp.json();
            } catch (fetchErr) {
              console.warn("Direct edge manifest fetch failed:", fetchErr);
            }
          }
          if (fetchedManifest) {
            if (fetchedManifest.payload?.sha256) familyHashes.push(fetchedManifest.payload.sha256);
            if (Array.isArray(fetchedManifest.previous_hashes)) {
              fetchedManifest.previous_hashes.forEach((ph: string) => {
                if (ph && !familyHashes.includes(ph)) familyHashes.push(ph);
              });
            }
          }
        }

        const overrides = {
          displayName: metaNameInput.trim() || fetchedManifest?.artifact?.name || activeDossier.displayName,
          author: metaAuthorInput.trim() || fetchedManifest?.artifact?.author || undefined,
          image_url: metaImageInput.trim() === "" ? "" : metaImageInput.trim(),
          imageUrl: metaImageInput.trim() === "" ? "" : metaImageInput.trim(),
          url: metaUrlInput?.trim() || fetchedManifest?.payload?.download_url || undefined,
          manifest_url: cleanManifestUrl || undefined,
          version: metaVersionInput?.trim() || fetchedManifest?.artifact?.version || undefined,
          description: metaDescInput?.trim() || undefined,
          allow_write: metaAllowWriteInput || false,
          is_paid: metaIsPaidInput || false,
          is_early_access: metaIsEarlyAccessInput || false,
          requiredDLC: fetchedManifest?.atomic_logic?.required_dlc || extraOverrides?.requiredDLC || (activeDossier as any).requiredDLC,
          ...(extraOverrides || {}),
        };

        for (const h of familyHashes) {
          localOvr[h] = {
            ...(localOvr[h] || {}),
            ...(h === activeDossier.hash
              ? overrides
              : {
                  manifest_url: cleanManifestUrl || undefined,
                  author: overrides.author,
                  version: overrides.version,
                  url: overrides.url,
                  requiredDLC: overrides.requiredDLC,
                }),
          };
          if (fetchedManifest?.atomic_logic) {
            edgeLogic[h] = {
              ...fetchedManifest.atomic_logic,
              manifest_url: cleanManifestUrl,
              artifact_id: fetchedManifest.artifact?.id || overrides.displayName,
              version: fetchedManifest.artifact?.version,
              game_version: fetchedManifest.artifact?.game_version,
              download_url: fetchedManifest.payload?.download_url,
              sha256: fetchedManifest.payload?.sha256,
              changelog: fetchedManifest.changelog || [],
            };
          } else if (!cleanManifestUrl && edgeLogic[h]) {
            delete edgeLogic[h];
          }
        }

        localStorage.setItem("sanctuary_local_overrides", JSON.stringify(localOvr));
        localStorage.setItem("sanctuary_edge_logic", JSON.stringify(edgeLogic));

        const updatedDossier = { ...activeDossier, ...overrides, isLocalOverride: true };
        setActiveDossier(updatedDossier);

        setModList((prevList: any[]) => prevList.map(m => {
          if (m.hash === activeDossier.hash) return { ...m, ...overrides, isLocalOverride: true };
          if (m.flavors) {
            const updatedFlavors = m.flavors.map((f: any) => f.hash === activeDossier.hash ? { ...f, ...overrides, isLocalOverride: true } : f);
            return { ...m, flavors: updatedFlavors };
          }
          return m;
        }));
      }

      setStatus(`${t("icon_check_circle")} ${t("status_overrides_saved")}`);
      setIsEditingMeta(false);
      setEditMode(false);
      runRadarSweep(true);
    } catch (err: any) {
      console.error(err);
      setStatus(`Error: ${err.message || err}`);
    }
  };

  const resetLocalMetadata = async () => {
    if (!activeDossier) return;

    try {
      const localOvr = JSON.parse(localStorage.getItem("sanctuary_local_overrides") || "{}");
      const edgeLogic = JSON.parse(localStorage.getItem("sanctuary_edge_logic") || "{}");
      if (activeDossier.hash && (localOvr[activeDossier.hash] || edgeLogic[activeDossier.hash])) {
        delete localOvr[activeDossier.hash];
        delete edgeLogic[activeDossier.hash];
        localStorage.setItem("sanctuary_local_overrides", JSON.stringify(localOvr));
        localStorage.setItem("sanctuary_edge_logic", JSON.stringify(edgeLogic));

        const originalMod = modList.find((m: any) => m.hash === activeDossier.hash && !m.isLocalOverride) ||
          modList.find((m: any) => m.hash === activeDossier.hash);

        if (originalMod) {
          setActiveDossier(originalMod);

          setMetaNameInput(originalMod.displayName || originalMod.name || "");
          setMetaAuthorInput(originalMod.author || "");
          setMetaUrlInput(originalMod.url || "");
          setMetaManifestUrlInput("");
          setMetaImageInput(originalMod.image_url || originalMod.imageUrl || "");
          setMetaDescInput(originalMod.description || "");
          setMetaVersionInput(originalMod.version || "");
          setMetaAllowWriteInput(originalMod.allow_write || false);
        } else {
          setActiveDossier(null);
        }
      }

      setStatus(`${t("icon_check_circle")} ${t("status_overrides_reset")}`);
      setIsEditingMeta(false);
      setEditMode(false);
      setIsCorrectingMeta(false);
      runRadarSweep(true);
    } catch (err: any) {
      console.error(err);
      setStatus(`Error: ${err.message || err}`);
    }
  };


  const handleUpdateMod = (mod: any) => { };

  const [conflictTarget, setConflictTarget] = useState<any | null>(null);
  const [isLoadingAssociated, setIsLoadingAssociated] = useState(false);

  const askCustom = (
    message: string,
    isAlert?: boolean,
    confirmText?: string,
    cancelText?: string,
    isDefcon?: boolean,
    title?: string,
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmDialog({
        message,
        isAlert,
        confirmText,
        cancelText,
        isDefcon,
        title,
        action: () => {
          setConfirmDialog(null);
          resolve(true);
        },
        cancelAction: () => {
          setConfirmDialog(null);
          resolve(false);
        },
      });
    });
  };
  const [labConflicts, setLabConflicts] = useState<any[]>([]);
  const [activeMasonProfileId, setActiveMasonProfileId] = useState<
    string | null
  >(null);
  const [activeMasonPostId, setActiveMasonPostId] = useState<string | null>(
    null,
  );

  const networkUpdates = useStore((state) => state.networkUpdates);
  const setNetworkUpdates = useStore((state) => state.setNetworkUpdates);
  const [tier2Hashes, setTier2Hashes] = useState<string[]>([]);
  const { uploadBlueprintToCloud, syncBlueprintByCode, massIngestToCloud } = useCloudService(activeMasonProfileId, tier2Hashes);

  const {
    snapshotModal,
    setSnapshotModal,
    snapshotName,
    setSnapshotName,
    bulkModal,
    setBulkModal,
    bulkName,
    setBulkName,
    isBulkMode,
    setIsBulkMode,
    selectedMods,
    setSelectedMods,
    renameModal,
    setRenameModal,
    renameTarget,
    setRenameTarget,
    nameInput,
    setNameInput,
    localFolderModal,
    setLocalFolderModal,
    localFolderType,
    setLocalFolderType,
    localFolderName,
    setLocalFolderName,
    missingImportMods,
    setMissingImportMods,
    pendingImportSet,
    setPendingImportSet,
    syncCode,
    setSyncCode,
    confirmDialog,
    setConfirmDialog,
    isDropzoneOpen,
    setIsDropzoneOpen,
    isDragging,
    setIsDragging,
    dropzoneState,
    setDropzoneState,
    droppedFiles,
    setDroppedFiles,
    showBrokenModal,
    setShowBrokenModal,
    showQuarantineModal,
    setShowQuarantineModal,
    isBackingUp,
    setIsBackingUp,
    isRestoring,
    setIsRestoring,
    ingestProgress,
    setIngestProgress,
    isScanning,
    setIsScanning,
    showDefconAlert,
    setShowDefconAlert,
    yeetConfirmPending,
    setYeetConfirmPending,
    dnaMatchQueue,
    setDnaMatchQueue,
    edgeOverrideQueue,
    setEdgeOverrideQueue,
    scoutQueue,
    setScoutQueue,
    setUpdatePayload
  } = useModalStore();

  const {
    createLocalFolder,
    executeBulkDraft,
    executeSnapshot,
    exportPlaySet,
    executeRename,
    confirmRename,
  } = useAppActions(
    runRadarSweep,
    activeMasonProfileId,
    tier2Hashes,
    fetchBackups,
  );

  const ignoredHashesRef = useRef<Set<string>>(new Set());
  const networkCheckIdRef = useRef<number>(0);
  useEffect(() => {
    let unlisten: any;
    if (isDesktop()) {
      if (isDesktop()) {
        listen("dna_match_detected", (event: any) => {
          const { hash, path } = event.payload;
          if (hash && ignoredHashesRef.current.has(hash)) {
            return;
          }
          if (!hash && ignoredHashesRef.current.has(path)) {
            return;
          }
          setDnaMatchQueue((prev: any[]) => {
            const isDuplicate = prev.some((m) => (hash ? m.hash === hash : m.path === path));
            if (isDuplicate) return prev;
            return [...prev, event.payload];
          });
        }).then((handler) => { unlisten = handler; });

        listen("edge_override_detected", (event: any) => {
          setEdgeOverrideQueue((prev: any[]) => [...prev, event.payload]);
          try {
            const payload = event.payload || {};
            const data = payload.override_json ? JSON.parse(payload.override_json) : {};
            const targetHash = (data.target_hash || "").toLowerCase();
            const archiveHashes = (Array.isArray(data.archive_hashes) ? data.archive_hashes : []).map((h: string) =>
              String(h).toLowerCase(),
            );
            const allCandidateHashes = [targetHash, ...archiveHashes].filter(Boolean);
            const currentMods = useStore.getState().modList || [];
            const matchedMod = currentMods.find((m: any) => {
              const mh = (m.hash || "").toLowerCase();
              if (mh && allCandidateHashes.includes(mh)) return true;
              if (Array.isArray(m.flavors)) {
                return m.flavors.some((f: any) => f.hash && allCandidateHashes.includes(String(f.hash).toLowerCase()));
              }
              return false;
            });
            const resolvedHash = matchedMod?.hash || data.target_hash || "";
            setDnaMatchQueue((prev: any[]) => {
              const isDuplicate = prev.some(
                (m) => m.reason === "EDGE_OVERRIDE" && m.override_json === payload.override_json,
              );
              if (isDuplicate) return prev;
              return [
                ...prev,
                {
                  ...payload,
                  reason: "EDGE_OVERRIDE",
                  hash: resolvedHash,
                  matched_mod_name: matchedMod?.displayName || matchedMod?.name || data.artifact_id || "",
                },
              ];
            });
          } catch (e) {
            console.error("Failed to parse edge_override_detected payload", e);
          }
        });
      }
    }

    let unlistenMalware: () => void;
    let isMounted = true;
    if (isDesktop()) {
      listen("malware_detected", async (event: any) => {
        const debounceKey = `${event.payload.hash}`;
        if (!event.payload.hash || insertingHashes.current.has(debounceKey)) return;
        insertingHashes.current.add(debounceKey);
        setTimeout(() => insertingHashes.current.delete(debounceKey), 2000);

        if (localStorage.getItem("sanctuary_share_malware_reports") === "true") {
          try {
            const { data: existing } = await supabase.from('malware_reports')
              .select('id')
              .eq('detected_hash', event.payload.hash)
              .limit(1)
              .maybeSingle();

            if (!existing) {
              const { error } = await supabase.from('malware_reports').insert({
                artifact_name: event.payload.displayName || event.payload.name || event.payload.filename || 'Unknown',
                detected_hash: event.payload.hash || 'unknown-hash',
                signature: event.payload.matched_signature || 'Malware DNA Match',
                status: 'pending',
                original_exists: event.payload.original_exists,
                original_shredded: event.payload.original_shredded
              });
              if (error) console.error("Malware Report Insert Error (listen):", error);
            }
          } catch (e) {
            console.error("Malware Report Insert Exception (listen):", e);
          }
        }

        setMalwareAlert((prev: any[]) => {
          if (!prev) return [event.payload];
          if (prev.some((m) => {
            const mOrig = m.original_path || m.path || '';
            const pOrig = event.payload.original_path || event.payload.path || '';
            return (event.payload.hash ? m.hash === event.payload.hash && mOrig === pOrig : m.path === event.payload.path);
          })) return prev;
          return [...prev, event.payload];
        });
      }).then(unlisten => {
        if (!isMounted) unlisten();
        else unlistenMalware = unlisten;
      });
    }

    return () => {
      isMounted = false;
      if (unlisten) unlisten();
      if (unlistenMalware) unlistenMalware();
    };
  }, []);
  useEffect(() => {
    if (
      modList.length > 0 &&
      vaultPath &&
      modList.some((m: any) => m.isSynced !== undefined)
    ) {
      const timer = setTimeout(() => {
        try {
          const content = JSON.stringify(modList);
          invoke("save_master_cache", {
            vaultPath,
            content,
          }).catch((e) => console.error("Cache Save Failed", e));
        } catch (err) {
          console.error("JSON Stringify Failed for Cache!", err);
        }
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [modList, vaultPath]);
  const [anarchyRules, setAnarchyRules] = useState(() => {
    const saved = localStorage.getItem("sanctuary_anarchy");
    const parsed = saved ? JSON.parse(saved) : {};
    return {
      highlander: parsed.highlander ?? true,
      family: parsed.family ?? true,
      dependencies: parsed.dependencies ?? true,
      intercept: parsed.intercept ?? true,
    };
  });
  useEffect(() => {
    localStorage.setItem("sanctuary_anarchy", JSON.stringify(anarchyRules));
  }, [anarchyRules]);
  const handleOpenMasonProfile = (masonId: string, postId?: string) => {
    if (!masonId) {
      alert(t("alert_error_mason_profile_missing"));
      return;
    }
    setActiveMasonProfileId(masonId);
    setActiveMasonPostId(postId || null);
    setView("MasonProfile");
  };
  const openRenameUI = (fileName: string) => {
    setRenameTarget(fileName);
    setNameInput(fileName.replace(".tar.zst", ""));
  };

  const didInitDLC = useRef(false);
  useEffect(() => {
    if (didInitDLC.current) return;
    didInitDLC.current = true;
    const bootDLCProtocol = async () => {
      try {
        await loadDLCMap();
        if (!isDesktop()) {
          const webSubdomain = getSubdomain() || (isStandaloneFork ? RESOLVED_SANCTUARY_CONFIG.standaloneWorkspace.id : null);

          if (webSubdomain) {
            try {
              // Await schema and game databases sync before setting activeWorkspaceId
              // This ensures UI doesn't mount and query before Core OS credentials load.
              await Promise.all([
                syncMasterSchemas(webSubdomain),
                syncGameDatabases()
              ]);
            } catch (e) {
              console.warn("Sync failed on boot", e);
            }

            // Essential for web to prevent bleeding from past workspaces
            useStore.getState().hydrateWorkspaceState(webSubdomain);
            useStore.setState({ activeWorkspaceId: webSubdomain });

            setIsConfigured(true);
          } else {
            // Root domain on web -> Show Hub
            useStore.getState().hydrateWorkspaceState("default_workspace");
            useStore.setState({ activeWorkspaceId: "default_workspace" });
            setIsConfigured(false);
          }
          return;
        }
        const config: any = await invoke("get_saved_coordinates");
        const globalConfig: any = await invoke("get_global_config");
        const activeWorkspace = (globalConfig.workspaces || []).find((w: any) => w.id === globalConfig.active_workspace_id);
        const schemaId = activeWorkspace?.schema_id || globalConfig.active_workspace_id || 'default_schema';

        // Load cached schema instantly so UI can render
        const cachedSchema = localStorage.getItem(`sanctuary_master_schema_${schemaId}`);
        if (cachedSchema) {
          useStore.getState().setActiveGameSchema(getSafeSchema(JSON.parse(cachedSchema), schemaId));
        }

        // Fetch the live database nodes from Core OS to get the correct Game Database URLs!
        // We MUST await this before mounting the UI or syncing spoke schemas, otherwise the Game Spokes will fallback to unconfigured-spoke.
        await syncGameDatabases().catch(console.warn);

        // Sync master schemas after spoke database URLs are ready
        syncMasterSchemas(schemaId).catch(console.warn);

        // Do not blindly overwrite sanctuary_last_active_workspace with globalConfig here!
        // globalConfig might have 'default_workspace' if the rust config is empty, which destroys the user's selection.

        let initialModList = useStore.getState().modList;

        try {
          if (globalConfig.active_workspace_id) {
            const cacheStr = await invoke<string>("load_master_cache", { vaultPath: config.vault_path });
            const parsedCache = JSON.parse(cacheStr);
            if (Array.isArray(parsedCache) && parsedCache.length > 0) {
              initialModList = parsedCache;
              setStatus(`${t("status_offline_cache_prefix")} ${parsedCache.length} ${t("status_offline_cache_suffix")}`);
            }
          }
        } catch (e) {
          console.error("Failed to load master cache during boot:", e);
        }

        if (config.live_path && config.mods_path && config.vault_path) {
          setIsConfigured(true);
        }

        let resolvedWorkspaceId = globalConfig.active_workspace_id;
        if (!resolvedWorkspaceId || resolvedWorkspaceId === 'default_workspace') {
          resolvedWorkspaceId = localStorage.getItem("sanctuary_last_active_workspace") || localStorage.getItem("sanctuary_active_workspace");
        }
        if (!resolvedWorkspaceId || resolvedWorkspaceId === 'default_workspace') {
          const w = useStore.getState().workspaces;
          if (w && w.length > 0) {
            const sims4 = w.find(ws => ws.id === 'sims4');
            resolvedWorkspaceId = sims4 ? sims4.id : w[0].id;
          }
          else resolvedWorkspaceId = 'default_workspace';
        }

        useStore.setState((state) => ({
          // Only fallback to local workspaces if syncGameDatabases failed to populate them
          workspaces: state.workspaces?.length > 0 ? state.workspaces : (globalConfig.workspaces || []),
          activeWorkspaceId: resolvedWorkspaceId,
          modList: initialModList,
          isGlobalConfigLoaded: true
        }));

        if (resolvedWorkspaceId) {
          useStore.getState().hydrateWorkspaceState(resolvedWorkspaceId);
          localStorage.setItem('sanctuary_last_active_workspace', resolvedWorkspaceId);
        }

        if (resolvedWorkspaceId) {
          const physicalDLC = await invoke<string[]>("scan_installed_dlc", {
            livePath: config.live_path,
          });
          setOwnedDLC(physicalDLC);
          if (config.launch_args) {
            const maskMatch = config.launch_args.match(/-disablepack:([\w,]+)/i);
            if (maskMatch?.[1]) {
              const masked = maskMatch[1]
                .split(",")
                .map((s: string) => s.trim().toUpperCase());
              setMaskedDLC(masked);
            }
          }
        }
      } catch (err) {
        console.error("DLC Protocol Sync Failed:", err);
      }
    };
    bootDLCProtocol();
  }, []);

  useEffect(() => {
    detectGameVersion();
  }, [isConfigured]);
  useEffect(() => {
    if (view === "lab") {
      const fetchLabQueue = async () => {
        if (!navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true") return;
        const { data } = await supabase
          .from("homestead_lab_logs")
          .select("*");
        if (data) setLabVerificationQueue(data);
      };
      fetchLabQueue();
    }
  }, [view]);
  useEffect(() => {
    const unlisten = isDesktop() ? listen("vault_changed", () => fetchBackups()) : Promise.resolve(() => { });
    const handleRefresh = () => runRadarSweep(true);
    window.addEventListener("refreshVault", handleRefresh);
    return () => {
      unlisten.then((f) => f());
      window.removeEventListener("refreshVault", handleRefresh);
    };
  }, []);

  useEffect(() => {
    let unlisten: any;

    if (!activeGameSchema?.extensions?.supported) return;

    if (isDesktop()) {
      // Start the Rust downloads watcher
      if (isDesktop()) {
        invoke("start_downloads_watch", {
          extensions: activeGameSchema.extensions.supported
        }).catch(console.warn);

        listen("download_intercepted", (event: any) => {
          useModalStore.getState().setDownloadsQueue((prev: string[]) => {
            if (!prev.includes(event.payload.path)) {
              return [...prev, event.payload.path];
            }
            return prev;
          });
        }).then((handler) => {
          unlisten = handler;
        });
      }
    }

    return () => {
      if (unlisten) unlisten();
      if (isDesktop()) if (isDesktop()) invoke("stop_downloads_watch").catch(console.warn);
    };
  }, [activeGameSchema]);
  useEffect(() => {
    fetchBackups();
  }, [activeWorkspaceId, vaultPath]);
  useEffect(() => {
    document.body.style.overflow =
      activeDossier ||
        snapshotModal ||
        confirmDialog ||
        bulkModal ||
        renameModal ||
        renameTarget ||
        localFolderModal ||
        missingImportMods ||
        dnaMatchQueue.length > 0
        ? "hidden"
        : "unset";
  }, [
    activeDossier,
    snapshotModal,
    confirmDialog,
    bulkModal,
    renameModal,
    renameTarget,
    localFolderModal,
    missingImportMods,
    dnaMatchQueue,
  ]);
  useEffect(() => {
    let fileEditNames: string[] = [];
    const cwEdits = localStorage.getItem("sanctuary_cw_unsaved_edits");
    if (cwEdits) {
      try {
        const parsed = JSON.parse(cwEdits);
        Object.keys(parsed).forEach(k => {
          if (Object.keys(parsed[k]).length > 0) {
            const name = k.split(/[\\/]/).pop();
            if (name && !fileEditNames.includes(name)) fileEditNames.push(name);
          }
        });
      } catch (e) { }
    }

    const ideEdits = localStorage.getItem("sanctuary_ide_open_files");
    if (ideEdits) {
      try {
        const parsed = JSON.parse(ideEdits);
        if (Array.isArray(parsed)) {
          parsed.forEach((f: any) => {
            if (f.content !== f.originalContent && !fileEditNames.includes(f.name)) {
              fileEditNames.push(f.name);
            }
          });
        }
      } catch (e) { }
    }

    let postEditNames: string[] = [];

    const masonHubDrafts = localStorage.getItem("sanctuary_mason_hub_drafts");
    if (masonHubDrafts) {
      try {
        const parsed = JSON.parse(masonHubDrafts);
        Object.keys(parsed).forEach(k => {
          const name = (parsed[k].title || `Draft ${k}`) + ".masonhub";
          if (!postEditNames.includes(name)) postEditNames.push(name);
        });
      } catch (e) { }
    }

    const wayfinderDrafts = localStorage.getItem("sanctuary_wayfinder_drafts");
    if (wayfinderDrafts) {
      try {
        const parsed = JSON.parse(wayfinderDrafts);
        Object.keys(parsed).forEach(k => {
          const name = (parsed[k].title || `Draft ${k}`) + ".wayfinder";
          if (!postEditNames.includes(name)) postEditNames.push(name);
        });
      } catch (e) { }
    }

    if (fileEditNames.length > 0) {
      setTimeout(() => {
        if (fileEditNames.length === 1) {
          useStore.getState().setStatus(`${fileEditNames[0]} has cached changes from your last session.`);
        } else if (fileEditNames.length <= 3) {
          useStore.getState().setStatus(`${fileEditNames.join(", ")} have cached changes from your last session.`);
        } else {
          useStore.getState().setStatus(`${fileEditNames.slice(0, 2).join(", ")} and ${fileEditNames.length - 2} other files have cached changes from your last session.`);
        }
      }, 8000);
    }

    if (postEditNames.length > 0) {
      setTimeout(() => {
        if (postEditNames.length === 1) {
          useStore.getState().setStatus(`${postEditNames[0]} has cached changes from your last session.`);
        } else if (postEditNames.length <= 3) {
          useStore.getState().setStatus(`${postEditNames.join(", ")} have cached changes from your last session.`);
        } else {
          useStore.getState().setStatus(`${postEditNames.slice(0, 2).join(", ")} and ${postEditNames.length - 2} other drafts have cached changes from your last session.`);
        }
      }, 10000);
    }
  }, []);
  const { toggleInActiveSet, deletePlaySet, renamePlaySet, importPlaySet, finalizeImport, equipPlaySet, getMissingStrings, ignoreMissingString, purgeMissingString } = usePlaySetLogic();
  const { handleSmartSearch, runSanitization, triggerShelter, restoreMod, purgeMod } = useModActions(openUrl, fetchVault, runRadarSweep, activeSetName, equipPlaySet, setShelterActive);
  async function fetchCloudLabQueue() {
    try {
      if (!navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true") return;
      const { data, error } = await supabase
        .from("mod_versions")
        .select(`dna_hash, mods!inner ( name, status )`)
        .eq("mods.status", "under_review");
      if (error) throw error;
      if (data) {
        const cloudQueue = data.map((dbMod: any) => ({
          name: dbMod.mods.name,
          hash: dbMod.dna_hash,
          status: t("status_dd_review"),
          color: "var(--warning)",
          displayName: dbMod.mods.name,
          isSynced: true,
        }));
        setLabQueue(cloudQueue);
      }
    } catch (err) {
      console.error("Failed to fetch cloud lab queue", err);
    }
  }
  useEffect(() => {
    async function fetchUserRole() {
      if (!isGameDatabasesSynced) return;
      if (!navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true") return;

      if (session?.user) {
        let currentOsRole = "citizen";
        try {
          const { data: osData, error: osError } = await supabaseAuth
            .from("profiles")
            .select("role")
            .eq("id", session.user.id)
            .maybeSingle();

          if (!osError && osData && osData.role) {
            currentOsRole = osData.role.toLowerCase();
          }
        } catch (e) { console.error(e); }

        setOsRole(currentOsRole);

        let newRole = "citizen";
        try {
          const gameClient = getActiveGameClient();
          if (gameClient) {
            const syncRes: any = await supabase.rpc("secure_sync_spoke_profile", {
              p_token: session.access_token
            });

            if (syncRes?.data && !syncRes.data.error && syncRes.data.role) {
              newRole = syncRes.data.role.toLowerCase();
            } else {
              const { data: gameData, error: gameError } = await gameClient
                .from("profiles")
                .select("role")
                .eq("id", session.user.id)
                .maybeSingle();

              if (!gameError && gameData && gameData.role) {
                newRole = gameData.role.toLowerCase();
              }
            }
          }
        } catch (e: any) {
          console.error(e);
        }
        if (isStandaloneFork && (newRole === "wayfinder" || currentOsRole === "wayfinder")) {
          currentOsRole = "keeper";
        }
        setOsRole(currentOsRole);
        setUserRole(newRole);

        const currentView = useStore.getState().view;
        const elevatedHubs = ["MasonHub", "ArchitectHub", "Oversight", "WayfinderHub", "KeepersCore", "SADefcon"];
        if (elevatedHubs.includes(currentView)) {
          if (currentView === "MasonHub" && !session) setView("dashboard");
          else if (currentView === "ArchitectHub" && !["architect", "oversight", "wayfinder", "admin"].includes(newRole)) setView("dashboard");
          else if (currentView === "Oversight" && !["oversight", "wayfinder", "admin"].includes(newRole)) setView("dashboard");
          else if (currentView === "WayfinderHub" && !["wayfinder", "admin"].includes(newRole)) setView("dashboard");
          else if (currentView === "KeepersCore" && !["core_dev", "admin", "keeper"].includes(currentOsRole)) setView("dashboard");
          else if (currentView === "SADefcon" && !["keeper", "admin"].includes(currentOsRole)) setView("dashboard");
        }
      }
    }
    fetchUserRole();
  }, [activeWorkspaceId, session, isGameDatabasesSynced]);

  const didInitBoot = useRef(false);
  useEffect(() => {
    if (didInitBoot.current) return;
    didInitBoot.current = true;

    const handleOnlineRoleFetch = () => {
      if (localStorage.getItem("sanctuary_local_only") !== "true") {
        window.location.reload();
      }
    };

    window.addEventListener('online', handleOnlineRoleFetch);

    async function boot() {
      if (!isDesktop()) {
        useStore.setState({ isGlobalConfigLoaded: true });
        setIsConfigured(true);
        return;
      }
      try {
        localStorage.removeItem("sanctuary_cloud_cache");
        const config: any = await invoke("get_saved_coordinates");

        if (config.live_path && config.mods_path && config.vault_path) {
          setIsConfigured(true);
          setLivePath(config.live_path);
          setModsPath(config.mods_path);
          setVaultPath(config.vault_path);

          const currentSchema = useStore.getState().activeGameSchema;
          if (currentSchema) {
            await invoke('update_active_game_schema', { schema: currentSchema }).catch(console.error);
          }

          runRadarSweep(false);
          fetchCloudLabQueue();
          invoke("initialize_vault_watch").catch(console.warn);
          const docsBase = config.mods_path.replace(/[\\/]Mods[\\/]?$/i, "");
          invoke("initialize_airgap_watch", {
            docsPath: docsBase,
            vaultPath: config.vault_path,
          }).catch(console.warn);

          invoke("initialize_settings_watch", {
            modsPath: config.mods_path,
            vaultPath: config.vault_path,
          }).catch(console.warn);
        }
      } catch (e) {
        setStatus(t("status_boot_failure"));
      }
    }

    boot();
    return () => { window.removeEventListener('online', handleOnlineRoleFetch); };
  }, []);


  async function checkNetworkUpdates(currentModList: ModData[]) {
    const currentCheckId = ++networkCheckIdRef.current;
    try {
      const syncedMods = currentModList.filter(
        (m) => !m.isVirtual,
      );
      if (syncedMods.length === 0) return;
      const broken: any[] = [];
      const obsolete: any[] = [];
      const updated: any[] = [];
      let cloudData: any[] = [];
      let hasError = false;
      const BATCH_SIZE = 40;
      for (let i = 0; i < syncedMods.length; i += BATCH_SIZE) {
        const batch = syncedMods.slice(i, i + BATCH_SIZE);
        const batchIds = batch.map(m => m.dbId).filter(Boolean);
        const batchNames = batch.filter(m => !m.dbId).map(m => m.name);

        if (batchIds.length > 0) {
          const { data, error } = await supabase.from("mods").select("id, name, status, folder_structure, mod_versions(version_label, dna_hash, game_version, download_url)").in("id", batchIds).order("created_at", { referencedTable: "mod_versions", ascending: false }).limit(1, { referencedTable: "mod_versions" });
          if (error) { console.error(error); hasError = true; }
          if (data) cloudData = [...cloudData, ...data];
        }
        if (batchNames.length > 0) {
          const { data, error } = await supabase.from("mods").select("id, name, status, folder_structure, mod_versions(version_label, dna_hash, game_version, download_url)").in("name", batchNames).order("created_at", { referencedTable: "mod_versions", ascending: false }).limit(1, { referencedTable: "mod_versions" });
          if (error) { console.error(error); hasError = true; }
          if (data) cloudData = [...cloudData, ...data];
        }
      }

      // --- DECENTRALIZED STATIC EDGE MANIFEST POLLING ---
      const edgeBindings = new Map<string, { artifactId?: string; hashes: Set<string>; masonId?: string }>();
      let localOvrMap: Record<string, any> = {};
      let edgeLogicMap: Record<string, any> = {};
      try {
        localOvrMap = JSON.parse(localStorage.getItem("sanctuary_local_overrides") || "{}");
      } catch (e) {}
      try {
        edgeLogicMap = JSON.parse(localStorage.getItem("sanctuary_edge_logic") || "{}");
      } catch (e) {}

      const addEdgeBinding = (url: string | undefined, hash?: string, artifactId?: string, masonId?: string) => {
        if (!url || !/^https?:\/\//i.test(url.trim())) return;
        const cleanUrl = url.trim();
        if (!edgeBindings.has(cleanUrl)) {
          edgeBindings.set(cleanUrl, { artifactId, hashes: new Set<string>(), masonId });
        }
        const entry = edgeBindings.get(cleanUrl)!;
        if (artifactId && !entry.artifactId) entry.artifactId = artifactId;
        if (masonId && !entry.masonId) entry.masonId = masonId;
        if (hash) entry.hashes.add(hash);
      };

      const currentVaultPath = useStore.getState().vaultPath || vaultPath;
      if (isDesktop() && currentVaultPath) {
        try {
          const sqliteRows = await invoke<any[]>("get_all_edge_manifests", { vaultPath: currentVaultPath });
          for (const row of sqliteRows || []) {
            addEdgeBinding(row.manifest_url, row.target_hash, row.artifact_id, row.mason_id);
            if (Array.isArray(row.archive_hashes)) {
              row.archive_hashes.forEach((ah: string) => addEdgeBinding(row.manifest_url, ah, row.artifact_id, row.mason_id));
            }
          }
        } catch (e) {}
      }

      Object.entries(localOvrMap).forEach(([h, ovr]: [string, any]) => {
        if (ovr?.manifest_url) addEdgeBinding(ovr.manifest_url, h, ovr.displayName, ovr.author);
      });
      syncedMods.forEach((m: any) => {
        if (m.manifest_url && m.hash) addEdgeBinding(m.manifest_url, m.hash, m.displayName || m.name, m.author);
      });

      if (hasError && cloudData.length === 0 && edgeBindings.size === 0) {
        console.warn("Network check encountered errors and returned no data. Aborting to prevent wiping cached updates.");
        return;
      }

      let debugLog = "";

      if (edgeBindings.size > 0 && navigator.onLine) {
        let edgeLogicDirty = false;
        let localOvrDirty = false;

        for (const [manifestUrl, binding] of edgeBindings.entries()) {
          try {
            let manifest: any = null;
            if (isDesktop() && currentVaultPath && binding.artifactId) {
              try {
                manifest = await invoke<any>("fetch_and_sync_edge_manifest", {
                  vaultPath: currentVaultPath,
                  artifactId: binding.artifactId,
                });
              } catch (e) {}
            }
            if (!manifest) {
              const resp = await fetch(manifestUrl);
              if (resp.ok) manifest = await resp.json();
            }
            if (!manifest || !manifest.artifact) continue;

            const allFamilyHashes = new Set<string>([
              ...Array.from(binding.hashes),
              manifest.payload?.sha256,
              ...(Array.isArray(manifest.previous_hashes) ? manifest.previous_hashes : []),
              ...(Array.isArray(manifest.atomic_logic?.flavors) ? manifest.atomic_logic.flavors : []),
            ].filter(Boolean));

            const lowerFamilyHashes = new Set<string>(Array.from(allFamilyHashes).map((h) => h.toLowerCase()));
            const matchedLocalMods = syncedMods.filter(
              (m: any) =>
                (m.hash && lowerFamilyHashes.has(String(m.hash).toLowerCase())) ||
                m.manifest_url === manifestUrl ||
                (m.hash && localOvrMap[m.hash]?.manifest_url === manifestUrl),
            );

            matchedLocalMods.forEach((m: any) => {
              if (m.hash) allFamilyHashes.add(m.hash);
            });

            for (const famHash of allFamilyHashes) {
              if (manifest.atomic_logic) {
                edgeLogicMap[famHash] = {
                  ...manifest.atomic_logic,
                  manifest_url: manifestUrl,
                  artifact_id: manifest.artifact?.id || binding.artifactId,
                  version: manifest.artifact?.version,
                  game_version: manifest.artifact?.game_version,
                  download_url: manifest.payload?.download_url,
                  sha256: manifest.payload?.sha256,
                  changelog: manifest.changelog || [],
                };
                edgeLogicDirty = true;
              }
              if (localOvrMap[famHash]) {
                localOvrMap[famHash] = {
                  ...localOvrMap[famHash],
                  manifest_url: manifestUrl,
                  requiredDLC: manifest.atomic_logic?.required_dlc || localOvrMap[famHash].requiredDLC,
                };
                localOvrDirty = true;
              }
            }

            if (matchedLocalMods.length > 0) {
              const latestSha = String(manifest.payload?.sha256 || "").toLowerCase().trim();
              const cleanEdgeVer = String(manifest.artifact?.version || "").toLowerCase().replace(/^v/, "").trim();

              for (const localMod of matchedLocalMods) {
                const localHash = String(localMod.hash || "").toLowerCase().trim();
                const cleanLocalVer = String(localMod.version || "").toLowerCase().replace(/^v/, "").trim();

                const hashDiffers = !!(latestSha && localHash && latestSha !== localHash);
                const versionDiffers = !!(
                  cleanEdgeVer &&
                  cleanLocalVer &&
                  cleanLocalVer !== "local" &&
                  cleanLocalVer !== ".local" &&
                  cleanEdgeVer !== cleanLocalVer
                );

                if (hashDiffers || versionDiffers) {
                  if (!updated.some((u) => u.hash === localMod.hash && u.name === localMod.name)) {
                    updated.push({
                      ...localMod,
                      newVersion: manifest.artifact?.version || "Update",
                      newGameVersion: manifest.artifact?.game_version,
                      download_url: manifest.payload?.download_url || manifestUrl,
                      edge_changelog: manifest.changelog || [],
                      is_edge_update: true,
                    });
                  }
                }
              }
            }
          } catch (edgeErr) {
            console.warn("Edge manifest poll failed for", manifestUrl, edgeErr);
          }
        }

        if (edgeLogicDirty) {
          localStorage.setItem("sanctuary_edge_logic", JSON.stringify(edgeLogicMap));
        }
        if (localOvrDirty) {
          localStorage.setItem("sanctuary_local_overrides", JSON.stringify(localOvrMap));
        }
      }
      // ---------------------------------------------------

      cloudData.forEach((cloudMod) => {
        const localMods = syncedMods.filter((m) => String(m.dbId) === String(cloudMod.id) || m.name === cloudMod.name);
        if (localMods.length === 0) return;

        if (cloudMod.status === "broken") broken.push(...localMods);
        else if (cloudMod.status === "obsolete") obsolete.push(...localMods);
        else {
          const latestData =
            cloudMod.mod_versions && cloudMod.mod_versions.length > 0
              ? cloudMod.mod_versions[0]
              : null;

          if (!latestData) return;

          const anyHashMatch = localMods.some(m => m.hash && latestData.dna_hash && m.hash.toLowerCase() === latestData.dna_hash.toLowerCase());
          const hashMismatch = latestData.dna_hash ? !anyHashMatch : false;

          const primaryMod = localMods.find(m => m.version && m.version !== "v.Local") || localMods[0];

          const cleanLocalVer = String(primaryMod.version || "").toLowerCase().replace(/^v/, '').trim();
          const cleanCloudVer = String(latestData.version_label || "").toLowerCase().replace(/^v/, '').trim();

          const isExactVersionMatch = primaryMod.version && primaryMod.version !== "v.Local" && cleanLocalVer === cleanCloudVer;
          const versionMismatch = primaryMod.version && primaryMod.version !== "v.Local" && cleanLocalVer !== cleanCloudVer;

          debugLog += `Mod: ${primaryMod.name} | anyHashMatch: ${anyHashMatch} | cloudHash: ${latestData.dna_hash} | hashMismatch: ${hashMismatch} | isExactVersionMatch: ${isExactVersionMatch}\n`;

          const needsUpdate = !isExactVersionMatch && (hashMismatch || versionMismatch);

          if (needsUpdate) {
            localMods.forEach(m => {
              updated.push({
                ...m,
                newVersion: latestData.version_label,
                newGameVersion: latestData.game_version,
                download_url: latestData.download_url
              });
            });
          }
        }
      });

      try {
        localStorage.setItem("network_updates_debug", debugLog);
      } catch (e) { }

      if (networkCheckIdRef.current !== currentCheckId) {
        console.warn("checkNetworkUpdates superseded by a newer sweep. Aborting stale state update.");
        return;
      }

      setNetworkUpdates({ broken, obsolete, updated });

      setModList((prevList: any[]) => {
        let changed = false;
        const newList = prevList.map(m => {
          let needsUpdate = false;
          let newMod = { ...m };

          if (broken.some(b => (b.hash && b.hash === m.hash) || b.name === m.name)) {
            if (newMod.status !== 'broken') {
              newMod.status = 'broken';
              needsUpdate = true;
            }
          } else if (obsolete.some(b => (b.hash && b.hash === m.hash) || b.name === m.name)) {
            if (newMod.status !== 'obsolete') {
              newMod.status = 'obsolete';
              needsUpdate = true;
            }
          }

          const update = updated.find(u => (u.hash && u.hash === m.hash) || u.name === m.name);
          if (update) {
            if (!newMod.hasUpdate || newMod.newVersion !== update.newVersion) {
              newMod.hasUpdate = true;
              newMod.newVersion = update.newVersion;
              newMod.newGameVersion = update.newGameVersion;
              newMod.download_url = update.download_url;
              needsUpdate = true;
            }
          } else if (newMod.hasUpdate) {
            delete newMod.hasUpdate;
            delete newMod.newVersion;
            delete newMod.newGameVersion;
            delete newMod.download_url;
            needsUpdate = true;
          }

          if (needsUpdate) {
            changed = true;
            return newMod;
          }
          return m;
        });
        return changed ? newList : prevList;
      });
    } catch (err) {
      console.error("Update check failed", err);
    }
  }

  async function registerConflict(
    modAHash: string,
    modBId: string,
    severity: number = 3,
  ) {
    setStatus(t("status_conflict_resolving"));
    try {
      const { data: verData, error: verErr } = await supabase
        .from("mod_versions")
        .select("mod_id")
        .eq("dna_hash", modAHash)
        .single();
      if (verErr || !verData) throw new Error(t("status_error_primary_sync"));
      const { error } = await supabase
        .from("logical_conflicts")
        .insert([
          {
            mod_a_id: verData.mod_id,
            mod_b_id: modBId,
            severity_rank: severity,
            resolution_note: t("status_architect_flagged"),
          },
        ]);
      if (error) throw error;
      setStatus(t("status_conflict_registered"));
      alert(t("alert_conflict_success"));
    } catch (err: any) {
      setStatus(`${t("status_conflict_failed")}${err.message}`);
      alert(`${t("alert_conflict_failed")}${err.message}`);
    }
  }
  async function designateTwin(primaryHash: string, twinHash: string) {
    setStatus(t("status_twins_linking"));
    try {
      const { data: verA } = await supabase
        .from("mod_versions")
        .select("mod_id")
        .eq("dna_hash", primaryHash)
        .maybeSingle();
      const { data: verB } = await supabase
        .from("mod_versions")
        .select("mod_id")
        .eq("dna_hash", twinHash)
        .maybeSingle();
      let modAId = verA?.mod_id;
      let modBId = verB?.mod_id;
      if (!modAId) {
        const localA = modList.find((m) => m.hash === primaryHash);
        const { data: newA } = await supabase
          .from("mods")
          .insert([
            {
              name: localA?.name || t("vlocal"),
              status: "unverified",
            },
          ])
          .select()
          .single();
        modAId = newA.id;
        await supabase
          .from("mod_versions")
          .upsert(
            [
              {
                mod_id: modAId,
                dna_hash: primaryHash,
                version_label: "v.System",
                game_version: selectedVersion,
              },
            ],
            { onConflict: "dna_hash" },
          );
      }
      if (!modBId) {
        const localB = modList.find((m) => m.hash === twinHash);
        const { data: newB } = await supabase
          .from("mods")
          .insert([
            {
              name: localB?.name || t("vlocal"),
              status: "unverified",
            },
          ])
          .select()
          .single();
        modBId = newB.id;
        await supabase
          .from("mod_versions")
          .upsert(
            [
              {
                mod_id: modBId,
                dna_hash: twinHash,
                version_label: "v.System",
                game_version: selectedVersion,
              },
            ],
            { onConflict: "dna_hash" },
          );
      }
      const { error } = await supabase.from("mod_relationships").upsert(
        [
          { parent_id: modAId, child_id: modBId, relationship_type: "twin" },
          { parent_id: modBId, child_id: modAId, relationship_type: "twin" },
        ],
        { onConflict: "parent_id, child_id" },
      );
      if (error) throw error;
      setStatus(t("status_twins_synced"));
      runRadarSweep(true);
    } catch (err: any) {
      setStatus(`${t("status_twins_failed")}${err.message}`);
    }
  }

  async function searchGlobalNetwork() {
    if (!globalSearchQuery.trim()) return;
    setIsSearchingCloud(true);
    const { data, error } = await supabase
      .from("mod_versions")
      .select("*")
      .ilike("name", `%${globalSearchQuery}%`)
      .limit(20);
    if (error) setStatus(`${t("status_network_error")}${error.message}`);
    else if (data) setCloudSearchResults(data);
    setIsSearchingCloud(false);
  }
  async function establishBond(
    parentId: string | null,
    childHash: string,
    isRequired: boolean,
    parentName?: string,
    relType: string = "addon",
  ) {
    if (!activeDossier) return;
    try {
      setStatus(t("status_sync_bond"));
      let { data: childVer } = await supabase
        .from("mod_versions")
        .select("mod_id")
        .eq("dna_hash", childHash)
        .maybeSingle();
      let childModId = childVer?.mod_id;
      if (parentId !== null && !childModId) {
        const { data: newC } = await supabase
          .from("mods")
          .insert([{ name: t("status_new_mod"), status: "unverified" }])
          .select()
          .single();
        childModId = newC.id;
        await supabase
          .from("mod_versions")
          .insert([
            {
              mod_id: childModId,
              dna_hash: childHash,
              version_label: "v.System",
              game_version: selectedVersion,
            },
          ]);
      }
      if (parentId === null) {
        if (childModId) {
          await supabase
            .from("mod_relationships")
            .delete()
            .eq("child_id", childModId);
          await supabase
            .from("mod_dependencies")
            .delete()
            .eq("child_id", childModId);
        }
      } else if (childModId) {
        if (isRequired) {
          await supabase
            .from("mod_dependencies")
            .upsert(
              { parent_id: parentId, child_id: childModId },
              { onConflict: "parent_id, child_id" },
            );
        } else {
          await supabase
            .from("mod_relationships")
            .upsert(
              {
                parent_id: parentId,
                child_id: childModId,
                relationship_type: relType,
              },
              { onConflict: "parent_id, child_id" },
            );
        }
      }
      const newRequirements =
        parentId === null
          ? []
          : isRequired
            ? [...(activeDossier.requirements || []), String(parentId)]
            : activeDossier.requirements;
      const newBondedTo =
        parentId === null
          ? null
          : !isRequired
            ? parentName
            : activeDossier.bondedTo;
      const updatedMod = {
        ...activeDossier,
        requirements: newRequirements,
        bondedTo: newBondedTo,
      } as ModData;
      setActiveDossier(updatedMod);
      setModList((prev) =>
        prev.map((m) => (m.hash === childHash ? updatedMod : m)),
      );
      setStatus(t("status_link_updated"));
      runRadarSweep(true);
    } catch (err: any) {
      setStatus(`${t("status_link_failed")}${err.message}`);
    }
  }
  async function establishFlavors(primaryHash: string, targets: any[]) {
    if (!activeDossier || !targets || targets.length === 0) return;
    setStatus(
      `${t("status_resolving_dna_prefix")}${targets.length}${t("status_resolving_dna_suffix")}`,
    );
    try {
      let pId = activeDossier.dbId;
      if (!pId) {
        setStatus(t("status_error_primary_sync"));
        return;
      }
      let resolvedHashes: string[] = [];
      const needsResolving = targets
        .filter((t) => !t.hash && t.id)
        .map((t) => t.id);
      const alreadyHasHash = targets.filter((t) => t.hash).map((t) => t.hash);
      if (needsResolving.length > 0) {
        const { data: cloudVersions, error: vErr } = await supabase
          .from("mod_versions")
          .select("dna_hash")
          .in("mod_id", needsResolving);
        if (vErr) throw vErr;
        if (cloudVersions)
          resolvedHashes = cloudVersions.map((v) => v.dna_hash);
      }
      const finalHashSquad = [
        ...new Set([primaryHash, ...alreadyHasHash, ...resolvedHashes]),
      ];
      if (finalHashSquad.length <= 1) {
        setStatus(t("status_error_dna_resolve"));
        return;
      }
      let groupId = activeDossier.flavorGroupId;
      let groupName =
        activeDossier.flavorGroupName ||
        `${activeDossier.displayName} ${t("status_exclusives")}`;
      if (!groupId) {
        const { data: newG, error: gErr } = await supabase
          .from("flavor_groups")
          .upsert({ name: groupName }, { onConflict: "name" })
          .select()
          .single();
        if (gErr) throw gErr;
        groupId = newG.id;
      }
      const upsertPayload = finalHashSquad.map((hash) => ({
        group_id: groupId,
        mod_hash: hash,
      }));
      const { data: result, error: bindErr } = await supabase
        .from("flavor_group_members")
        .upsert(upsertPayload, { onConflict: "group_id, mod_hash" })
        .select();
      if (bindErr) throw bindErr;
      const updatedDossier = {
        ...activeDossier,
        flavorGroupId: String(groupId),
        flavorGroupName: groupName,
      } as ModData;
      setActiveDossier(updatedDossier);
      setModList((prev) =>
        prev.map((m) => {
          if (finalHashSquad.includes(m.hash)) {
            return {
              ...m,
              flavorGroupId: String(groupId),
              flavorGroupName: groupName,
            } as ModData;
          }
          return m;
        }),
      );
      setStatus(
        `${t("status_success_members_prefix")}${result?.length}${t("status_success_members_suffix")}`,
      );
      runRadarSweep(true);
    } catch (err: any) {
      setStatus(`${t("status_link_failed")}${err.message}`);
    }
  }
  async function severFlavor(modHash: string) {
    setStatus(t("status_severing"));
    try {
      await supabase
        .from("flavor_group_members")
        .delete()
        .eq("mod_hash", modHash);
      const updatedMod = {
        ...activeDossier,
        flavorGroupId: null,
        flavorGroupName: null,
      } as ModData;
      setActiveDossier(updatedMod);
      setModList((prev) =>
        prev.map((m) =>
          m.hash === modHash
            ? ({ ...m, flavorGroupId: null, flavorGroupName: null } as ModData)
            : m,
        ),
      );
      setStatus(t("status_severed"));
      runRadarSweep(true);
    } catch (err: any) {
      setStatus(`${t("status_unlink_failed")}${err.message}`);
    }
  }
  async function sendToLabQueue(mod: ModData) {
    setStatus(`${t("status_uploading_dna")}${mod.displayName || mod.name}...`);
    try {
      const { data: existingVer, error: searchError } = await supabase
        .from("mod_versions")
        .select("mod_id")
        .eq("dna_hash", mod.hash)
        .maybeSingle();
      if (searchError) throw searchError;
      let targetModId = existingVer?.mod_id;
      if (!targetModId) {
        const cleanName = mod.name.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), '');
        const searchPattern = (cleanName || mod.name).replace(/[_ ]/g, '%');
        const { data: existingMods } = await supabase
          .from("mods")
          .select("id")
          .ilike("name", searchPattern)
          .limit(1);
        const existingMod = existingMods?.[0];

        if (existingMod) {
          targetModId = existingMod.id;
        } else {
          const { data: modData, error: modError } = await supabase
            .from("mods")
            .insert([
              {
                name: cleanName || mod.name,
                status: "under_review",
                description: "System Discovered Artifact",
              },
            ])
            .select()
            .single();
          if (modError) throw modError;
          targetModId = modData.id;
        }
        const { error: verError } = await supabase
          .from("mod_versions")
          .insert([
            {
              mod_id: targetModId,
              version_label: deriveHumanReadableVersion(mod.name, mod.hash),
              game_version: selectedVersion,
              dna_hash: mod.hash,
            },
          ]);
        if (verError) throw verError;
      } else {
        await supabase
          .from("mods")
          .update({ status: "under_review" })
          .eq("id", targetModId);
      }
      setStatus(
        `${t("status_dna_secured_prefix")}${mod.displayName || mod.name}${t("status_dna_secured_suffix")}`,
      );
      const labMod = {
        ...mod,
        status: t("status_dd_review"),
        color: "var(--warning)",
        isSynced: true,
      };
      setLabQueue((prev) => {
        if (prev.some((m) => m.hash === labMod.hash)) return prev;
        return [...prev, labMod];
      });
      setModList((prev) => prev.map((m) => (m.hash === mod.hash ? labMod : m)));
      setActiveDossier(null);
    } catch (err: any) {
      setStatus(
        `${t("status_cloud_rejection")}${err.message || t("status_unknown_db_failure")}`,
      );
    }
  }
  function finalizeDraftSet() {
    const setName = draftSetName.trim();
    if (!setName) {
      setIsDraftingSet(false);
      return;
    }
    if (playSets.some((s) => s.name.toLowerCase() === setName.toLowerCase())) {
      setStatus(t("status_blueprint_exists"));
      return;
    }
    const updatedSets = [...playSets, { name: setName, mods: [], modHashes: {}, ignoredGhosts: [] }];
    setPlaySets(updatedSets);

    setActivePlaySetIndex(updatedSets.length - 1);
    setStatus(
      `${t("status_blueprint_created_prefix")}${setName}${t("status_blueprint_drafted_suffix")}`,
    );
    setIsDraftingSet(false);
    setDraftSetName("");
  }
  const displayModList = modList;



  const { handleQuickLaunch } = useLaunchLogic(askCustom, triggerPrePatchSnapshot, equipPlaySet);

  useDefconRadar(t, askCustom, triggerPrePatchSnapshot, triggerFullEngineBackup);
  useGlobalListeners(fetchBackups, askCustom, t, triggerPrePatchSnapshot, triggerFullEngineBackup);

  async function executeHotSwap() {
    if (!activeLabMod) return;
    try {
      if (!shelterActive) {
        setStatus(t("status_auto_isolate"));
        await invoke("evacuate_to_shelter");
        setShelterActive(true);
        fetchVault();
      }
      setStatus(t("status_injecting"));
      await invoke("move_to_lab", { filename: activeLabMod.physical_path || activeLabMod.name });
      const config: any = await invoke("get_saved_coordinates");
      const dPath = config.mods_path.split(/[\\/]Mods/i)[0];
      setStatus(t("status_purging_logs"));
      await invoke("airgap_saves", { docsPath: dPath, enable: true });
      await invoke("clear_old_logs", { docsPath: dPath });
      try {
        const currentRules = getExceptionRules(activeGameSchema);
        await invoke("update_active_game_schema", {
          schema: { ...(activeGameSchema || {}), exception_rules: currentRules },
        });
      } catch {}
      setStatus(t("status_igniting"));
      await invoke("launch_game", { livePath: config.live_path, modsPath: config.mods_path });
      setTestErrorFound(false);
      setTestLogSnippet("");
      const interval = setInterval(async () => {
        const res = await invoke<string>("scan_game_logs", { docsPath: dPath });
        if (res !== "Clean" && !isUnrelatedGameBugLog(res, useStore.getState().activeGameSchema)) {
          setTestErrorFound(true);
          setTestLogSnippet(res);
          setStatus(`${t("status_fatal_error")} ${res.substring(0, 50)}...`);
          clearInterval(interval);
          setLogWatcher(null);
        }
      }, 5000);
      setLogWatcher(interval);
    } catch (err) {
      setStatus(`${t("status_lab_error")} ${typeof err === "string" ? t(err) : t((err as any)?.message || String(err))}`);
    }
  }
  async function openWorkbench(modPath: string) {
    try {
      const content = await invoke<string>("read_config_file", {
        path: modPath,
      });
      setConfigContent(content);
      setEditMode(true);
    } catch (err) {
      setStatus(t("status_no_editable"));
    }
  }
  async function saveWorkbenchChanges() {
    if (!activeDossier) return;
    setStatus(t("status_committing"));
    try {
      const configPath = activeDossier.name.replace(/\.[^/.]+$/, ".cfg");
      const config: any = await invoke("get_saved_coordinates");
      const fullPath = `${config.mods_path}/${configPath}`;
      const msg = await invoke<string>("save_config_file", {
        path: fullPath,
        content: configContent,
      });
      setStatus(`${t("icon_check_circle")} ${msg}`);
      setEditMode(false);
    } catch (err) {
      setStatus(`${t("status_save_failure")}${err}`);
    }
  }
  async function ensureSpokeModVersion(targetMod: any, desiredStatus = "under_review"): Promise<{ modId: string; versionId: string }> {
    const modHash = targetMod.hash || targetMod.id || targetMod.name;
    const { data: existingVer, error: searchError } = await supabase
      .from("mod_versions")
      .select("id, mod_id")
      .eq("dna_hash", modHash)
      .limit(1)
      .maybeSingle();
    if (searchError) throw searchError;

    if (existingVer?.id && existingVer?.mod_id) {
      return { modId: existingVer.mod_id, versionId: existingVer.id };
    }

    const rawName = targetMod.name || targetMod.displayName || "Unknown Artifact";
    const cleanName = rawName.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), "") || rawName;
    const searchPattern = cleanName.replace(/[_ ]/g, "%");

    const { data: existingMods } = await supabase
      .from("mods")
      .select("id")
      .ilike("name", searchPattern)
      .limit(1);

    let targetModId = existingMods?.[0]?.id;
    if (!targetModId) {
      const { data: modData, error: modError } = await supabase
        .from("mods")
        .insert([
          {
            name: cleanName,
            status: desiredStatus,
            description: "Homestead Lab Diagnostic Artifact",
          },
        ])
        .select("id")
        .single();
      if (modError) throw modError;
      targetModId = modData.id;
    }

    const { data: createdVer, error: verError } = await supabase
      .from("mod_versions")
      .insert([
        {
          mod_id: targetModId,
          version_label: deriveHumanReadableVersion(rawName, modHash),
          game_version: selectedVersion || "Local",
          dna_hash: modHash,
        },
      ])
      .select("id")
      .single();
    if (verError) throw verError;

    return { modId: targetModId, versionId: createdVer.id };
  }

  async function submitLabReport(reportOverride?: any): Promise<boolean> {
    if (!session) {
      alert(t("alert_guest_mode_uploads"));
      return false;
    }
    const targetMod = reportOverride?.mod || activeLabMod;
    const rawSnippet = reportOverride?.logSnippet || testLogSnippet || "";
    const targetSnippet = scrubLogUserData(rawSnippet);
    if (!targetMod) return false;
    if (targetMod.compliance_tier === 1 || targetMod.compliance_tier === 2) {
      alert(t("alert_nsfw_no_lab_reports"));
      return false;
    }
    setIsSubmittingReport(true);
    setStatus(t("status_submitting_report"));
    let ok = false;
    try {
      const { modId, versionId } = await ensureSpokeModVersion(targetMod, "under_review");
      await supabase
        .from("mods")
        .update({ status: "under_review" })
        .eq("id", modId);

      const stagedDepsList = (reportOverride?.stagedExtras || []).map((m: any) => m.name).filter(Boolean);
      const conflictExtrasList = (reportOverride?.conflictExtras || []).map((m: any) => m.name).filter(Boolean);
      const hasContextPayload = Boolean(
        reportOverride?.conflictTarget ||
          stagedDepsList.length > 0 ||
          conflictExtrasList.length > 0
      );

      const notePayload = hasContextPayload
        ? JSON.stringify({
            conflictTarget: reportOverride?.conflictTarget?.name,
            dependencies: stagedDepsList,
            conflictExtras: conflictExtrasList,
          })
        : t("status_report_automated");

      const currentExceptionRules = useStore.getState().exceptionRules || [];
      const matchedRules = matchExceptionRules(targetSnippet, currentExceptionRules);
      const formattedReportLog = buildFormattedLabReportText({
        reportNumber: reportOverride?.reportNumber || 1,
        date: reportOverride?.time
          ? new Date(reportOverride.time).toLocaleString()
          : new Date().toLocaleString(),
        gameVersion: selectedVersion || "Local",
        targetMod,
        conflictTarget: reportOverride?.conflictTarget,
        stagedExtras: reportOverride?.stagedExtras,
        conflictExtras: reportOverride?.conflictExtras,
        missingDeps: reportOverride?.missingDeps,
        linkedFiles: reportOverride?.linkedFiles,
        matchedRules,
        rawLogText: targetSnippet,
        errorFound: true,
        verified: false,
        activeGameSchema,
        modList,
      });

      const { error } = await supabase.from("homestead_lab_logs").insert([
        {
          mod_id: modId,
          version_id: versionId,
          mod_version_id: versionId,
          log_snippet: targetSnippet,
          log_text: formattedReportLog,
          status: "pending",
          tester_note: notePayload,
        },
      ]);
      if (error) throw error;
      setStatus(t("status_report_secured"));
      useStore.getState().pushStatus(t("status_report_secured"), "success");
      ok = true;
    } catch (err: any) {
      const errMsg = `${t("status_report_failed")}${err?.message || String(err)}`;
      setStatus(errMsg);
      useStore.getState().pushStatus(errMsg, "error");
    }
    setIsSubmittingReport(false);
    return ok;
  }
  async function concludeTest(
    labContext?: any,
    targetModOverride?: any,
    errorFoundOverride?: boolean,
  ): Promise<boolean> {
    const targetMod = targetModOverride || activeLabMod;
    if (!targetMod) return false;
    const isError = errorFoundOverride !== undefined ? errorFoundOverride : testErrorFound;
    setStatus(t("status_evaluating"));
    if (logWatcher) {
      clearInterval(logWatcher);
      setLogWatcher(null);
    }
    try {
      const config: any = await invoke("get_saved_coordinates");
      const dPath = config.mods_path.split(/[\\/]Mods/i)[0];
      await invoke("stop_lab_verification_session");
      await invoke("airgap_saves", { docsPath: dPath, enable: false });
    } catch (e) { }
    try {
      const finalStatus = isError ? "broken" : "verified";
      const spokeModStatus = isError ? "under_review" : "verified";
      const uiStatus = isError
        ? t("status_broken")
        : t("verified");
      const uiColor = isError ? "var(--danger)" : "var(--success)";
      try {
        const { modId } = await ensureSpokeModVersion(targetMod, spokeModStatus);
        await supabase
          .from("mods")
          .update({ status: spokeModStatus })
          .eq("id", modId);
      } catch (dbErr) {
        console.warn("Could not sync concluded test to Spoke DB:", dbErr);
      }
      if (isError && targetMod.name) {
        try {
          toggleInActiveSet(targetMod.name, true, true);
        } catch (e) { }
      }
      if (shelterActive) {
        setStatus(t("status_restoring_bunker_full"));
        const lastSet = localStorage.getItem(`sanctuary_${useStore.getState().activeWorkspaceId || "default"}_active_set`);
        if (lastSet) {
          await equipPlaySet(lastSet);
        } else {
          const config: any = await invoke("get_saved_coordinates");
          await invoke("deploy_playset_bulk", { mods: [], modsPath: config.mods_path, vaultPath: config.vault_path });
        }
        setShelterActive(false);
      }
      setLabQueue((prev) => prev.filter((m) => m.hash !== targetMod.hash));
      setModList((prev) =>
        prev.map((m) =>
          m.hash === targetMod.hash
            ? { ...m, status: uiStatus, color: uiColor, isSynced: true }
            : m,
        ),
      );
      setActiveLabMod(null);
      setTestErrorFound(false);
      setTestLogSnippet("");
      setStatus(
        `${t("status_artifact_secured_prefix")}${finalStatus.toUpperCase()}`,
      );
      return true;
    } catch (err: any) {
      setStatus(`${t("status_teardown_error")}${err.message}`);
      return false;
    }
  }
  const fetchLabAssociated = async (mod: ModData) => {
    setIsLoadingAssociated(true);
    try {
      let modId = mod.dbId;
      if (!modId) {
        if (mod.hash) {
          const { data: mvInDb } = await supabase
            .from("mod_versions")
            .select("mod_id, mods!inner(file_extension)")
            .eq("dna_hash", mod.hash)
            .maybeSingle();
          if (mvInDb) {
            const isLocalScript = mod.name?.toLowerCase().includes("script");
            const isDBScript = (mvInDb.mods as any)?.file_extension?.toLowerCase().includes("script");
            if (!!isLocalScript === !!isDBScript) {
              modId = mvInDb.mod_id;
            }
          }
        }
      }
      if (!modId) {
        const cleanMod = (mod.name || "").split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), '');
        const { data: modsInDb } = await supabase
          .from("mods")
          .select("id, file_extension")
          .ilike("name", `%${cleanMod}%`);

        if (modsInDb && modsInDb.length > 0) {
          const isScript = mod.name?.toLowerCase().includes("script");
          const exactMatch = modsInDb.find((m: any) => isScript ? m.file_extension?.toLowerCase().includes("script") : !m.file_extension?.toLowerCase().includes("script"));
          modId = exactMatch ? exactMatch.id : modsInDb[0].id;
        }
      }

      if (modId) {
        const { data: modInDb } = await supabase
          .from("mods")
          .select("id")
          .eq("id", modId)
          .single();

        if (modInDb) {
          const { data: deps } = await supabase
            .from("mod_dependencies")
            .select("parent_id")
            .eq("child_id", modInDb.id);
          const { data: twins } = await supabase
            .from("mod_relationships")
            .select("child_id")
            .eq("parent_id", modInDb.id)
            .eq("relationship_type", "twin");
          const { data: twinParents } = await supabase
            .from("mod_relationships")
            .select("parent_id")
            .eq("child_id", modInDb.id)
            .eq("relationship_type", "twin");
          const { data: addonParents } = await supabase
            .from("mod_relationships")
            .select("parent_id")
            .eq("child_id", modInDb.id)
            .eq("relationship_type", "addon");

          const relatedIds = [
            ...(deps?.map((d) => String(d.parent_id)) || []),
            ...(twins?.map((t) => String(t.child_id)) || []),
            ...(twinParents?.map((t) => String(t.parent_id)) || []),
            ...(addonParents?.map((a) => String(a.parent_id)) || []),
          ];
          if (relatedIds.length > 0) {
            const { data: relatedMods, error } = await supabase
              .from("mods")
              .select("id, name, master_author, file_extension")
              .in("id", relatedIds);
            if (error) console.error("Error fetching associated mods:", error);
            setAssociatedMods(relatedMods || []);
          } else {
            setAssociatedMods([]);
          }
        } else {
          setAssociatedMods([]);
        }
      } else {
        setAssociatedMods([]);
      }
    } catch (err) {
      console.error("Lab Association Failed:", err);
    }
    setIsLoadingAssociated(false);
  };
  useEffect(() => {
    if (view === "lab" && activeLabMod) {
      fetchLabAssociated(activeLabMod);
      setConflictTarget(null);
      setLabConflicts([]);
    }
  }, [activeLabMod, view]);
  const runLabSimulation = async () => {
    if (!activeLabMod || !conflictTarget) return;
    setIsLoadingAssociated(true);
    const { data } = await supabase
      .from("logical_conflicts")
      .select("*")
      .or(
        `and(mod_a.eq."${activeLabMod.name}",mod_b.eq."${conflictTarget.name}"),and(mod_a.eq."${conflictTarget.name}",mod_b.eq."${activeLabMod.name}")`,
      );
    setLabConflicts(data || []);
    setIsLoadingAssociated(false);
  };
  const runProvingRun = async (extraDeployNames: string[] = [], customToolPath?: string) => {
    if (!activeLabMod) return;
    try {
      setStatus(t("status_diagnostic_run"));

      let depPaths: string[] = [];
      let modAId = activeLabMod.dbId;
      if (!modAId) {
        const { data: verA } = await supabase.from("mod_versions").select("mod_id").eq("dna_hash", activeLabMod.hash).maybeSingle();
        modAId = verA?.mod_id;
      }
      if (!modAId) {
        const cleanModA = (activeLabMod.name || "").split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), '');
        const { data: modA } = await supabase.from("mods").select("id").ilike("name", cleanModA || "").maybeSingle();
        modAId = modA?.id;
      }

      let modBId = conflictTarget?.dbId;
      if (conflictTarget && !modBId) {
        const { data: verB } = await supabase.from("mod_versions").select("mod_id").eq("dna_hash", conflictTarget.hash).maybeSingle();
        modBId = verB?.mod_id;
      }
      if (conflictTarget && !modBId) {
        const cleanModB = (conflictTarget.name || "").split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), '');
        const { data: modB } = await supabase.from("mods").select("id").ilike("name", cleanModB || "").maybeSingle();
        modBId = modB?.id;
      }
      const ids = [modAId, modBId].filter(Boolean);

      if (ids.length > 0) {
        const orQuery = ids.map(id => `child_id.eq.${id}`).join(',');

        const { data: depLinks } = await supabase.from('mod_dependencies').select('parent_id, child_id').or(orQuery);
        const { data: addonLinks } = await supabase.from('mod_relationships').select("parent_id").or(orQuery).eq('relationship_type', 'addon');

        let allIds = new Set<string>();
        if (depLinks) depLinks.forEach((l: any) => allIds.add(l.parent_id));
        if (addonLinks) addonLinks.forEach((l: any) => allIds.add(l.parent_id));

        if (allIds.size > 0) {
          const { data: depMods } = await supabase.from('mods').select("name").in('id', Array.from(allIds));
          if (depMods) depPaths = depMods.map((m: any) => m.name);
        }
      }

      const config: any = await invoke("get_saved_coordinates");
      await invoke("evacuate_to_shelter");

      const rawDeploySet = new Set([
        ...(activeLabMod.isVirtual && activeLabMod.flavors ? activeLabMod.flavors.map((f: any) => f.name) : [activeLabMod.name]),
        ...(conflictTarget ? (conflictTarget.isVirtual && conflictTarget.flavors ? conflictTarget.flavors.map((f: any) => f.name) : [conflictTarget.name]) : []),
        ...depPaths,
        ...associatedMods.map((m: any) => m.name),
        ...extraDeployNames
      ]);

      const normalizeLookup = (s: string) =>
        (s || "")
          .split(/[\\/]/)
          .pop()
          ?.replace(getExtensionRegex(activeGameSchema), "")
          .replace(/[^a-z0-9]/gi, "")
          .toLowerCase() || "";

      const deployPaths = Array.from(rawDeploySet)
        .map((modName: string) => {
          const targetNorm = normalizeLookup(modName);
          const modObj = modList.find((m: any) => {
            if (m.isVirtual) return false;
            if (m.name === modName || m.displayName === modName) return true;
            const mNorm = normalizeLookup(m.name);
            return mNorm && targetNorm && mNorm === targetNorm;
          });
          return modObj ? (modObj.physical_path || modObj.name) : modName;
        })
        .filter(Boolean);

      const primaryPath = activeLabMod.physical_path || activeLabMod.name;
      const additionalMods = deployPaths.filter((p) => p !== primaryPath);

      const linkedFiles = await invoke<string[]>("deploy_mod_for_lab_test", {
        modPathOrName: primaryPath,
        dnaHash: activeLabMod.hash || null,
        additionalMods,
        isSandbox: false,
        modsPath: config.mods_path,
        vaultPath: config.vault_path || "",
      });

      setShelterActive(true);
      fetchVault();

      const dPath = config.mods_path.split(/[\\/]Mods/i)[0];
      setStatus(t("status_purging_logs"));
      await invoke("airgap_saves", { docsPath: dPath, enable: true });
      await invoke("clear_old_logs", { docsPath: dPath });

      try {
        await invoke("start_lab_verification_session", {
          dnaHash: activeLabMod?.hash || activeLabMod?.name || "lab_session",
          modName: activeLabMod.displayName || activeLabMod.name || "Unknown",
          docsPath: dPath,
          vaultPath: config.vault_path || "",
          linkedFiles,
        });
      } catch (e) {}

      if (customToolPath && customToolPath.trim()) {
        setStatus(t("status_external_tool_launched"));
        await invoke("launch_external_tool", {
          toolPath: customToolPath.trim(),
          docsPath: dPath,
          enforceAirgap: true,
        });
      } else {
        setStatus(t("status_igniting"));
        await invoke("launch_game", { livePath: config.live_path, modsPath: config.mods_path });
      }

      setTestErrorFound(false);
      setTestLogSnippet("");
      const interval = setInterval(async () => {
        const res = await invoke<string>("scan_game_logs", { docsPath: dPath });
        if (res !== "Clean") {
          const scrubbedRes = scrubLogUserData(res);
          setTestErrorFound(true);
          setTestLogSnippet(scrubbedRes);
          setStatus(`${t("status_fatal_error")} ${scrubbedRes.substring(0, 50)}...`);
          clearInterval(interval);
          setLogWatcher(null);
          // Do NOT disable save airgap while the game/tool is still running!
          // Airgap remains engaged until concludeTest() or repopulate_from_shelter().
        }
      }, 5000);
      setLogWatcher(interval as any);
    } catch (err) {
      setStatus(`${t("status_lab_error")} ${typeof err === "string" ? t(err) : t((err as any)?.message || String(err))}`);
    }
  };

  const {
    searchQuery, setSearchQuery,
    filterStatus, setFilterStatus,
    equipFilter, setEquipFilter,
    activeCategory, setActiveCategory,
    activeSubType, setActiveSubType,
    expandedFolder, setExpandedFolder,
    filteredMods
  } = useModFiltering(displayModList, playSets, activeSetName || '', activeGameSchema, t);
  const visibleMods = filteredMods;
  const isGlobalConfigLoaded = useStore((state) => state.isGlobalConfigLoaded);

  return (
    <div
      className={`flex flex-col ${isDesktop() ? 'h-screen w-screen' : 'h-full min-h-[100dvh] w-full'} overflow-hidden relative ${currentTheme?.animated !== false ? 'animated-fluid-bg' : ''}`}
      style={{ color: "var(--text)" } as React.CSSProperties}
    >
      <SystemBackground />

      <div className="relative z-10 flex flex-col h-full w-full overflow-hidden py-6 pl-6 pr-0 gap-6 max-md:p-0 max-md:gap-0">
        {!(!isDesktop() && isRootDomain()) && (
          <TitleBar
            isSidebarCollapsed={isSidebarCollapsed}
            setIsSidebarCollapsed={setIsSidebarCollapsed}
            subtitleIndex={subtitleIndex}
          />
        )}

        <div className="flex-1 flex flex-row min-h-0 relative gap-6 max-md:gap-0">
          <Sidebar
            isSidebarCollapsed={isSidebarCollapsed}
            setIsSidebarCollapsed={setIsSidebarCollapsed}
            subtitleIndex={subtitleIndex}
            isNotificationSidebarOpen={isNotificationSidebarOpen}
            setIsNotificationSidebarOpen={setIsNotificationSidebarOpen}
            unreadNotificationCount={unreadNotificationCount}
            handleQuickLaunch={handleQuickLaunch}
          />
          <main id="sanctuary-main-scroll" className="flex-1 relative overflow-y-auto overflow-x-hidden px-6 pb-4 pt-[70px] max-md:px-4 max-md:pt-[94px] max-md:pb-[100px] custom-scrollbar" style={{ flexGrow: 1, width: '100%' }}>
            <div className="relative z-10 w-full min-h-full pb-[100px] max-md:pb-[40px]">
              {isGlobalConfigLoaded && (
                <>
                  {(view === "landing" || ((!isConfigured || (!isDesktop() && isRootDomain())) && view !== "settings" && view !== "KeepersCore")) ? (
                    <WebLandingPage />
                  ) : (
                    <>
                      {(view === "dashboard" || view === "BlueprintArchitect") && (
                        <div style={{ width: '100%', height: '100%' }}>
                          <ErrorBoundary moduleName="Command Center">
                            <CommandCenter
                              key={activeWorkspaceId || 'no-workspace'}
                              isScanning={isScanning}
                              runRadarSweep={runRadarSweep}
                              modList={modList}
                              quarantineList={quarantineList}
                              isConfigured={isConfigured}
                              modsPath={modsPath}
                              vaultPath={vaultPath}
                              triggerShelter={triggerShelter}
                              shelterActive={shelterActive}
                              shelterContents={shelterContents}
                              setShowQuarantineModal={setShowQuarantineModal}
                              setShowBrokenModal={setShowBrokenModal}
                              handleOpenMasonProfile={handleOpenMasonProfile}
                              massIngestToCloud={massIngestToCloud}
                              networkUpdates={networkUpdates}
                              toggleInActiveSet={toggleInActiveSet}
                              setView={setView}
                              setFilterStatus={setFilterStatus}
                              setIsSupportDeskOpen={() => useModalStore.getState().setIsSupportPanelOpen(true)}
                              setIsCitizenTicketsOpen={setIsCitizenTicketsOpen}
                              equipPlaySet={equipPlaySet}
                            />
                          </ErrorBoundary>
                        </div>
                      )}

                      {view === "nexus" && (
                        <Nexus
                          key={activeWorkspaceId || 'no-workspace'}
                          ownedHashes={modList.map((m) => m.hash).filter((h) => !!h)}
                          onSetStatus={setStatus}
                          onOpenMasonProfile={handleOpenMasonProfile}
                          onOpenDossier={setActiveDossier}
                          syncBlueprintByCode={syncBlueprintByCode}
                        />
                      )}
                      {view === "vault" && (
                        <ErrorBoundary moduleName="Vault">
                          <Vault
                            view={view}
                            setView={setView}
                            statusLog={statusLog}
                            isScanning={isScanning}
                            isBulkMode={isBulkMode} setIsBulkMode={setIsBulkMode}
                            selectedMods={selectedMods} setSelectedMods={setSelectedMods}
                            setConfirmDialog={setConfirmDialog} setStatus={setStatus}
                            runRadarSweep={runRadarSweep} setIsDropzoneOpen={setIsDropzoneOpen}
                            setLocalFolderModal={setLocalFolderModal} playSets={playSets}
                            equipFilter={equipFilter} setEquipFilter={setEquipFilter}
                            searchQuery={searchQuery} setSearchQuery={setSearchQuery}
                            filterStatus={filterStatus} setFilterStatus={setFilterStatus}
                            activeCategory={activeCategory} setActiveCategory={setActiveCategory}
                            activeSubType={activeSubType} setActiveSubType={setActiveSubType}
                            visibleMods={visibleMods} displayModList={displayModList}
                            activePlaySetIndex={activePlaySetIndex}
                            setActivePlaySetIndex={setActivePlaySetIndex}
                            toggleInActiveSet={toggleInActiveSet}
                            openUrl={openUrl} setLocalFolderName={setLocalFolderName} setLocalFolderType={setLocalFolderType}
                            executeHotSwap={executeHotSwap} equipPlaySet={equipPlaySet} setMetaNameInput={setMetaNameInput} setMetaAuthorInput={setMetaAuthorInput}
                            setMetaVersionInput={setMetaVersionInput} setMetaUrlInput={setMetaUrlInput} setActiveDossier={setActiveDossier} setDrawerConfirmHash={setDrawerConfirmHash}
                            quarantineList={quarantineList} restoreMod={restoreMod} purgeMod={purgeMod}
                            ownedDLC={ownedDLC} maskedDLC={maskedDLC} setMetaDescInput={setMetaDescInput}
                            setMetaImageInput={setMetaImageInput} setMetaAllowWriteInput={setMetaAllowWriteInput}
                            expandedFolder={expandedFolder} setExpandedFolder={setExpandedFolder}
                            drawerConfirmHash={drawerConfirmHash} modList={modList} anarchyRules={anarchyRules}
                            setBulkModal={setBulkModal}
                          />
                        </ErrorBoundary>
                      )}
                      {view === "playsets" && (
                        <ErrorBoundary moduleName="Blueprints">
                          {isDesktop() ? (
                            <Blueprints
                              playSets={playSets}
                              setPlaySets={setPlaySets}
                              activeSetName={activeSetName}
                              setActiveSetName={setActiveSetName}
                              equipPlaySet={equipPlaySet}
                              isDraftingSet={isDraftingSet}
                              setIsDraftingSet={setIsDraftingSet}
                              draftSetName={draftSetName}
                              setDraftSetName={setDraftSetName}
                              finalizeDraftSet={finalizeDraftSet}
                              renamePlaySet={renamePlaySet}
                              deletePlaySet={deletePlaySet}
                              exportPlaySet={exportPlaySet}
                              importPlaySet={importPlaySet}
                              uploadBlueprintToCloud={uploadBlueprintToCloud}
                              syncBlueprintByCode={syncBlueprintByCode}
                              setView={setView}
                              setSnapshotModal={setSnapshotModal}
                              globalSearchQuery={globalSearchQuery}
                              setGlobalSearchQuery={setGlobalSearchQuery}
                              isSearchingCloud={isSearchingCloud}
                              searchGlobalNetwork={searchGlobalNetwork}
                              cloudSearchResults={cloudSearchResults}
                              syncCode={syncCode}
                              setSyncCode={setSyncCode}
                              modList={modList}
                              activePlaySetIndex={activePlaySetIndex}
                              setActivePlaySetIndex={setActivePlaySetIndex}
                              toggleInActiveSet={toggleInActiveSet}
                              getMissingStrings={getMissingStrings}
                              ignoreMissingString={ignoreMissingString}
                              purgeMissingString={purgeMissingString}
                            />
                          ) : (
                            <StagingPayloadEditor
                              onSetStatus={setStatus}
                              onOpenDossier={setActiveDossier}
                              onBrowseMods={() => {
                                setView("nexus");
                                useStore.getState().setMarketTab("MODS");
                              }}
                              onBrowseBlueprints={() => {
                                setView("nexus");
                                useStore.getState().setMarketTab("BLUEPRINTS");
                              }}
                            />
                          )}
                        </ErrorBoundary>
                      )}
                      {view === "GlobalFeed" && (
                        <ErrorBoundary moduleName="Global Feed">
                          <GlobalFeed
                            key={activeWorkspaceId || 'no-workspace'}
                            onOpenMasonProfile={handleOpenMasonProfile}
                          />
                        </ErrorBoundary>
                      )}

                      {view === "BlueprintArchitect" && playSets[activePlaySetIndex] && (
                        <ErrorBoundary moduleName="Blueprint Architect">
                          <BlueprintArchitect
                            isOpen={true}
                            onClose={() => setView("dashboard")}
                            playSet={playSets[activePlaySetIndex]}
                            modList={modList}
                            toggleInActiveSet={toggleInActiveSet}
                            globalSearchQuery={globalSearchQuery}
                            setGlobalSearchQuery={setGlobalSearchQuery}
                            onSearchNetwork={searchGlobalNetwork}
                            cloudResults={cloudSearchResults}
                            isSearching={isSearchingCloud}
                            allow_write={true}
                            onCloudUpload={uploadBlueprintToCloud}
                            vaultPath={vaultPath}
                            onRefreshMods={runRadarSweep}
                            displayModList={displayModList}
                          />
                        </ErrorBoundary>
                      )}
                      {view === "lab" && (
                        <ErrorBoundary moduleName="Homestead Lab">
                          <Lab
                            onOpenDossier={setActiveDossier}
                            executeHotSwap={runProvingRun}
                            shelterActive={shelterActive}
                            labSearchQuery={labSearchQuery}
                            setLabSearchQuery={setLabSearchQuery}
                            labVerificationQueue={labVerificationQueue}
                            labQueue={labQueue}
                            activeLabMod={activeLabMod}
                            setActiveLabMod={setActiveLabMod}
                            testErrorFound={testErrorFound}
                            testLogSnippet={testLogSnippet}
                            isSubmittingReport={isSubmittingReport}
                            submitLabReport={submitLabReport}
                            concludeTest={concludeTest}
                            openWorkbench={openWorkbench}
                            userRole={userRole}
                            modList={modList}
                            setConflictTarget={setConflictTarget}
                            conflictTarget={conflictTarget}
                            runLabSimulation={runLabSimulation}
                            isLoadingAssociated={isLoadingAssociated}
                            associatedMods={associatedMods}
                            runProvingRun={runProvingRun}
                            labConflicts={labConflicts}
                            setLabConflicts={setLabConflicts}
                          />
                        </ErrorBoundary>
                      )}
                      {view === "backups" && (
                        <TimeCapsule
                          selectedVersion={selectedVersion}
                          setSelectedVersion={setSelectedVersion}
                          triggerPrePatchSnapshot={triggerPrePatchSnapshot}
                          isBackingUp={isBackingUp}
                          backupProgress={backupProgress}
                          triggerFullEngineBackup={triggerFullEngineBackup}
                          backupList={backupList}
                          getBackupSignature={getBackupSignature}
                          restoreGameBackup={restoreGameBackup}
                          renameGameBackup={async (oldName: string, newName: string) => {
                            try {
                              await invoke("rename_backup", { oldName, newName });
                              fetchBackups();
                            } catch (err) {
                              alert(err);
                            }
                          }}
                          deleteBackup={deleteBackup}
                        />
                      )}
                      {view === "MasonHub" &&
                        !!session && <MasonHub key={activeWorkspaceId || 'no-workspace'} sandboxMod={activeSandboxMod} clearSandboxMod={() => setActiveSandboxMod(null)} vaultPath={vaultPath} handleOpenMasonProfile={handleOpenMasonProfile} />}
                      {view === "ArchitectHub" &&
                        ["architect", "oversight", "wayfinder", "admin"].includes(
                          userRole,
                        ) && (
                          <ErrorBoundary moduleName="Architect Hub">
                            <ArchitectHub key={activeWorkspaceId || 'no-workspace'} userRole={userRole} equipPlaySet={equipPlaySet} modList={modList} setStatus={setStatus} />
                          </ErrorBoundary>
                        )}
                      {view === "Oversight" &&
                        ["oversight", "wayfinder", "admin"].includes(userRole) && (
                          <ErrorBoundary moduleName="Oversight">
                            <Oversight key={activeWorkspaceId || 'no-workspace'} />
                          </ErrorBoundary>
                        )}
                      {view === "WayfinderHub" &&
                        ["wayfinder", "admin"].includes(userRole) && (
                          <ErrorBoundary moduleName="Wayfinder Hub">
                            <WayfinderHub key={activeWorkspaceId || 'no-workspace'} onOpenMasonProfile={handleOpenMasonProfile} />
                          </ErrorBoundary>
                        )}
                      {view === "KeepersCore" &&
                        ["core_dev", "admin", "keeper"].includes(osRole) && (
                          <ErrorBoundary moduleName="Keepers Core">
                            <KeepersCore />
                          </ErrorBoundary>
                        )}
                      {view === "DbpfScout" && <DbpfScout key={activeWorkspaceId || 'no-workspace'} />}
                      {view === "CitizensWorkbench" && <CitizensWorkbench key={activeWorkspaceId || 'no-workspace'} onOpenMasonProfile={handleOpenMasonProfile} />}
                      {view === "settings" && (
                        <ErrorBoundary moduleName="Settings">
                          <Settings
                            anarchyRules={anarchyRules}
                            setAnarchyRules={setAnarchyRules}
                          />
                        </ErrorBoundary>
                      )}
                      {view === "MasonProfile" && activeMasonProfileId && (
                        <ErrorBoundary moduleName="Mason Profile">
                          <MasonProfile
                            masonId={activeMasonProfileId}
                            initialPostId={activeMasonPostId}
                            onModClick={(mod: any) => setActiveDossier(mod)}
                          />
                        </ErrorBoundary>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </main>
          {activeDossier && (
            <ErrorBoundary moduleName="ModDossier">
              <ModDossier
                mod={activeDossier}
                modList={modList}
                ownedDLC={ownedDLC}
                maskedDLC={maskedDLC}
                activePlaySet={playSets[activePlaySetIndex]}
                onToggleInActiveSet={toggleInActiveSet}
                onShowYeetAlert={(casualties: string[], onConfirm: () => void) =>
                  setYeetConfirmPending({ casualties, onConfirm })
                }
                onClose={() => {
                  setActiveDossier(null);
                  setEditMode(false);
                  setIsEditingMeta(false);
                  setIsCorrectingMeta(false);
                }}
                isEditingMeta={isEditingMeta}
                setIsEditingMeta={setIsEditingMeta}
                isCorrecting={isCorrectingMeta}
                setIsCorrecting={setIsCorrectingMeta}
                editMode={editMode}
                setEditMode={setEditMode}
                configContent={configContent}
                setConfigContent={setConfigContent}
                metaInputs={{
                  name: metaNameInput,
                  author: metaAuthorInput,
                  url: metaUrlInput,
                  manifest_url: metaManifestUrlInput,
                  image: metaImageInput,
                  desc: metaDescInput,
                  statusMsg: metaStatusMsgInput,
                  status: metaStatusInput,
                  version: metaVersionInput,
                  requiredDLC: metaRequiredDLC,
                  allow_write: metaAllowWriteInput,
                  is_paid: metaIsPaidInput,
                  is_early_access: metaIsEarlyAccessInput,
                }}
                setMetaInputs={{
                  name: setMetaNameInput,
                  author: setMetaAuthorInput,
                  url: setMetaUrlInput,
                  manifest_url: setMetaManifestUrlInput,
                  image: setMetaImageInput,
                  desc: setMetaDescInput,
                  statusMsg: setMetaStatusMsgInput,
                  status: setMetaStatusInput,
                  version: setMetaVersionInput,
                  requiredDLC: setMetaRequiredDLC,
                  allow_write: setMetaAllowWriteInput,
                  is_paid: setMetaIsPaidInput,
                  is_early_access: setMetaIsEarlyAccessInput,
                }}
                onSendToLab={sendToLabQueue}
                onSyncToNetwork={(mod: any) => {
                  setActiveDossier(null);
                  setActiveSandboxMod(mod);
                  setView("MasonHub");
                }}
                onDesignateTwin={designateTwin}
                onEstablishBond={establishBond}
                onRegisterConflict={registerConflict}
                onEstablishFlavor={establishFlavors}
                onSeverFlavor={severFlavor}
                onSmartSearch={handleSmartSearch}
                onOpenWorkbench={openWorkbench}
                onSaveWorkbench={saveWorkbenchChanges}
                onSaveMetadata={saveLocalMetadata}
                onResetMetadata={resetLocalMetadata}
                onOpenMasonProfile={handleOpenMasonProfile}
                onSecureShred={async (filename: string) => {
                  try {
                    await invoke("purge_quarantined_file", {
                      filename: filename.split("/").pop() || filename,
                    });
                    setStatus(`${t("icon_check_circle")} ${t("status_file_shredded")}`);
                    runRadarSweep();
                  } catch (err: any) {
                    setStatus(` Error: ${err}`);
                  }
                }}
              />
            </ErrorBoundary>
          )}
          <AppModals
            isSidebarCollapsed={isSidebarCollapsed}
            isNotificationSidebarOpen={isNotificationSidebarOpen}
            setIsNotificationSidebarOpen={setIsNotificationSidebarOpen}
            unreadNotificationCount={unreadNotificationCount}
            malwareAlert={malwareAlert}
            setMalwareAlert={setMalwareAlert}
            snapshotModal={snapshotModal}
            setSnapshotModal={setSnapshotModal}
            snapshotName={snapshotName}
            setSnapshotName={setSnapshotName}
            executeSnapshot={executeSnapshot}
            playSets={playSets}
            activePlaySetIndex={activePlaySetIndex}
            toggleInActiveSet={toggleInActiveSet}
            bulkModal={bulkModal}
            setBulkModal={setBulkModal}
            bulkName={bulkName}
            setBulkName={setBulkName}
            executeBulkDraft={executeBulkDraft}
            selectedMods={selectedMods}
            renameModal={renameModal}
            setRenameModal={setRenameModal}
            executeRename={executeRename}
            renameTarget={renameTarget}
            setRenameTarget={setRenameTarget}
            nameInput={nameInput}
            setNameInput={setNameInput}
            confirmRename={confirmRename}
            localFolderModal={localFolderModal}
            equipPlaySet={equipPlaySet}
            setLocalFolderModal={setLocalFolderModal}
            localFolderType={localFolderType}
            setLocalFolderType={setLocalFolderType}
            localFolderName={localFolderName}
            setLocalFolderName={setLocalFolderName}
            createLocalFolder={createLocalFolder}
            missingImportMods={missingImportMods}
            pendingImportSet={pendingImportSet}
            setMissingImportMods={setMissingImportMods}
            setPendingImportSet={setPendingImportSet}
            finalizeImport={finalizeImport}
            setIsDropzoneOpen={setIsDropzoneOpen}
            confirmDialog={confirmDialog}
            resolveDisplayName={(modName: string) => {
              if (modName.startsWith("FOLDER ")) {
                const id = modName.replace("FOLDER ", "");
                const ls = JSON.parse(localStorage.getItem(`sanctuary_${useStore.getState().activeWorkspaceId}_playsets`) || "[]").find((s: any) => s.id === id);
                if (ls) return ls.name;
              }
              if (modName.startsWith("SET ")) {
                const id = modName.replace("SET ", "");
                const ps = playSets.find((s: any) => s.id === id);
                if (ps) return ps.name;
              }
              const found = modList.find((m: any) => m.name === modName);
              return found ? (found.displayName || found.name) : modName.replace(/_/g, " ").replace(/\.[^/.]+$/, "");
            }}
            setConfirmDialog={setConfirmDialog}
            isBulkMode={isBulkMode}
            openBulk={setBulkModal}
            openLocalFolder={setLocalFolderModal}
            isDropzoneOpen={isDropzoneOpen}
            isDragging={isDragging}
            dropzoneState={dropzoneState}
            droppedFiles={droppedFiles}
            setDropzoneState={setDropzoneState}
            setDroppedFiles={setDroppedFiles}
            setIsDragging={setIsDragging}
            handleDroppedFiles={handleDroppedFiles}
            runRadarSweep={runRadarSweep}
            showBrokenModal={showBrokenModal}
            setShowBrokenModal={setShowBrokenModal}
            modList={modList}
            showQuarantineModal={showQuarantineModal}
            setShowQuarantineModal={setShowQuarantineModal}
            quarantineList={quarantineList}
            restoreMod={restoreMod}
            purgeMod={purgeMod}
            scoutQueue={scoutQueue}
            setScoutQueue={setScoutQueue}
            onOpenScoutDossier={(mod: any) => {
              const defaultName = (mod.displayName || mod.name || "").split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), '').replace(/_/g, ' ') || "";
              setMetaNameInput(defaultName);
              setMetaAuthorInput(mod.author || "");
              setMetaVersionInput(mod.version || "");
              setMetaDescInput(mod.description || "");
              setMetaImageInput(mod.image_url || mod.imageUrl || "");
              setMetaAllowWriteInput(mod.allow_write || false);
              setMetaIsPaidInput(mod.is_paid || false);
              setMetaIsEarlyAccessInput(mod.is_early_access || false);
              setActiveDossier(mod);
              setIsEditingMeta(true);
              setEditMode(true);
              setIsCorrectingMeta(true);
              useModalStore.getState().setIsSideBrowserOpen(false);
            }}
            isBackingUp={isBackingUp}
            isRestoring={isRestoring}
            ingestProgress={ingestProgress}
            isScanning={isScanning}
            showDefconAlert={showDefconAlert}
            setShowDefconAlert={setShowDefconAlert}
            triggerFullEngineBackup={triggerFullEngineBackup}
            triggerPrePatchSnapshot={triggerPrePatchSnapshot}
            yeetConfirmPending={yeetConfirmPending}
            setYeetConfirmPending={setYeetConfirmPending}
            dnaMatchQueue={dnaMatchQueue}
            setDnaMatchQueue={setDnaMatchQueue}
            edgeOverrideQueue={edgeOverrideQueue}
            setEdgeOverrideQueue={setEdgeOverrideQueue}
            ignoredHashesRef={ignoredHashesRef}
            setStatus={setStatus}
            statusLog={statusLog}
            clearStatusLog={clearStatusLog}
          />
          {isNotificationSidebarOpen && (
            <NotificationSidebar
              onClose={() => setIsNotificationSidebarOpen(false)}
              onOpenPost={setGlobalViewingPost}
            />
          )}
          <NexusUpdatesChecker />
          {globalViewingPost && (
            <MasonPostViewer
              post={globalViewingPost}
              onClose={() => setGlobalViewingPost(null)}
              userId={session?.user?.id}
            />
          )}

          <CitizenTicketsSidePanel isOpen={isCitizenTicketsOpen} onClose={() => setIsCitizenTicketsOpen(false)} userId={session?.user?.id} />
          <DevBuildClearanceGate />
          <UpdateSidePanel />
          <NexusUpdatesSidePanel />
          <SupportHub />
          <ContextMenu />
          <GlobalTooltip />
          <PixelSnapper />
        </div>
      </div>

      {!isDesktop() && <MobileBottomNav view={view} setView={setView} />}

      {!isGlobalConfigLoaded && (
        <div className="fixed inset-0 z-[9999999] flex flex-col items-center justify-center backdrop-blur-md animate-in fade-in duration-500 p-8" style={{ backgroundColor: `color-mix(in srgb, var(--bg) 50%, transparent)` }}>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full blur-[120px] pointer-events-none mix-blend-screen"
            style={{ backgroundColor: `color-mix(in srgb, var(--accent) 10%, transparent)` }} />

          <div className="relative w-full max-w-lg glass-panel backdrop-blur-2xl border rounded-2xl p-12 flex flex-col gap-8 items-center justify-center shadow-2xl"
            style={{
              borderColor: `color-mix(in srgb, var(--accent) 20%, transparent)`,
              boxShadow: `0 40px 100px color-mix(in srgb, var(--accent) 20%, transparent), inset 0 1px 1px color-mix(in srgb, var(--text) 5%, transparent)`
            }}>
            <div className="absolute inset-0 rounded-[inherit] animate-pulse pointer-events-none" style={{ backgroundColor: `color-mix(in srgb, var(--accent) 5%, transparent)` }} />
            <div className="absolute top-0 left-0 w-full h-1 opacity-80" style={{ background: `linear-gradient(to right, transparent, color-mix(in srgb, var(--accent) 50%, transparent), transparent)` }} />
            <div className="absolute bottom-0 left-0 w-full h-1 opacity-80" style={{ background: `linear-gradient(to right, transparent, color-mix(in srgb, var(--accent) 20%, transparent), transparent)` }} />

            <div className="flex flex-col items-center gap-6 relative z-10 text-center">
              <div className="relative w-24 h-24 rounded-full flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: `color-mix(in srgb, var(--accent) 5%, transparent)`,
                  borderColor: `color-mix(in srgb, var(--accent) 30%, transparent)`,
                  borderWidth: '1px',
                  boxShadow: `0 0 30px color-mix(in srgb, var(--accent) 10%, transparent), inset 0 0 20px color-mix(in srgb, var(--accent) 5%, transparent)`
                }}>
                <div className="absolute inset-0 rounded-[inherit]  border animate-ping opacity-30" style={{ borderColor: `color-mix(in srgb, var(--accent) 20%, transparent)` }} />
                <span className="material-symbols-outlined animate-spin"
                  style={{ color: 'var(--accent)', filter: `drop-shadow(0 0 15px var(--accent))` }}>sync</span>
              </div>

              <div>
                <h2 className="text-xl font-black capitalize tracking-widest text-[var(--text)] mb-2">
                  {t("status_syncing")}
                </h2>
                <p className="text-sm font-medium text-[var(--subtext)] tracking-wider">
                  {t("status_establishing_connection")}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* 
        Global SVG Noise Texture (Top Level)
        Moved here to sit on top of the entire DOM. This prevents it from being blurred by glass panels
        (which causes CRT fuzzy artifacts) and prevents its mix-blend-mode from breaking backdrop-filter
        for the rest of the application.
      */}
      {currentTheme.ambientNoise !== false && (
        <div
          className="fixed inset-0 w-full h-full opacity-[0.06] mix-blend-overlay pointer-events-none z-[9999] transform-gpu"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'repeat'
          }}
        />
      )}

    </div>
  );
}
export default App;





