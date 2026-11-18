import { TitleBar } from "./TitleBar";
import { openUrl } from "@tauri-apps/plugin-opener";
import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
} from "react";
import { useShallow } from "zustand/react/shallow";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

import { useModalStore } from "./store/modalStore";
import { useAppActions } from "./hooks/useAppActions";
import { useModFiltering } from "./hooks/useModFiltering";
import { useBackupLogic } from "./hooks/useBackupLogic";
import { useDefconRadar } from "./hooks/useDefconRadar";
import { useLaunchLogic } from "./hooks/useLaunchLogic";
import { usePlaySetLogic } from "./hooks/usePlaySetLogic";
import { useRadarLogic } from "./hooks/useRadarLogic";
import { useModActions } from "./hooks/useModActions";
import { useVaultIntake } from "./hooks/useVaultIntake";
import { useCloudService } from "./hooks/useCloudService";
import { useStore } from "./store";
import { isPlaceholderWorkspaceKey } from "./utils/workspaceConfigMatch";
import { useGlobalListeners } from "./hooks/useGlobalListeners";
import { supabase, supabaseAuth } from "./supabase";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { check } from "@tauri-apps/plugin-updater";
import {
  ModData,
  deriveHumanReadableVersion,
  getExtensionRegex,
  sanitizeVaultModList,
} from "./shared";
import { useLexicon } from "./LexiconContext";
import { isDesktop, isLinuxDesktop } from "./utils/envUtils";
import { Sidebar } from "./Sidebar";
import { fetchMfaSecurityState } from "./utils/passkeyUtils";
import { useTooltipStore } from "./store/tooltipStore";
import { useTheme } from "./ThemeContext";
import { SystemBackground } from "./SystemBackground";
import { useLabMilestoneNotifications } from "./components/LabVerificationGate";

import { useAppEdgeAndNetworkSync } from "./hooks/useAppEdgeAndNetworkSync";
import { useAppNotificationsAndBoot } from "./hooks/useAppNotificationsAndBoot";
import { useAppLabAndWorkbenchActions } from "./hooks/useAppLabAndWorkbenchActions";
import { AppMainViewportRouter, AppGlobalOverlays } from "./components/app-shell/AppMainViewportRouter";

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
    // PREFETCH ELEVATED HUBS DATA (deferred off initial critical commit)
    const prefetchHubs = async () => {
      if (
        (typeof navigator !== "undefined" && !navigator.onLine) ||
        localStorage.getItem("sanctuary_local_only") === "true"
      ) {
        return;
      }
      const authClient = supabaseAuth || supabase;
      const { data: { session } } = await authClient.auth.getSession();
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

      // 2. Prefetch Support Tickets from Hub DB
      if (now - cache.support.lastFetch > CACHE_TTL) {
        try {
          const { data } = await authClient.from('keeper_tickets').select('*').eq('author_id', session.user.id).order('created_at', { ascending: false });
          if (data) {
            cache.support.tickets = data;
            cache.support.lastFetch = now;
          }
        } catch (e) { }
      }
    };
    const idleTimer = window.setTimeout(() => {
      prefetchHubs();
    }, 1200);

    const interval = setInterval(() => {
      setSubtitleIndex(Math.floor(Math.random() * 12) + 1);
    }, 15000);
    return () => {
      window.clearTimeout(idleTimer);
      clearInterval(interval);
    };
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
      alias: alias || t("unknown", "Unknown"),
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

  useEffect(() => {
    if (!session?.user?.id) return;
    const warmTimer = setTimeout(() => {
      fetchMfaSecurityState().catch(() => {});
    }, 300);
    return () => clearTimeout(warmTimer);
  }, [session?.user?.id]);




  const [forceSweepCounter, setForceSweepCounter] = useState(0);
  const checkNetworkUpdatesRef = useRef<any>(null);
  const runRadarSweepRef = useRef<any>(null);
  const setMalwareAlertRef = useRef<any>(null);

  const { runRadarSweep, fetchVault, malwareAlert, setMalwareAlert } = useRadarLogic((...args: any[]) => checkNetworkUpdatesRef.current?.(...args));

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
      if (!isDesktop()) return;
      try {
        const {
          syncUpdateChannelNotification,
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
        await syncUpdateChannelNotification({
          currentVersion: currentVer,
          checkTauriStableUpdater: isDesktop() ? () => check() : undefined,
        });
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

    const handleCancelDrag = () => {
      if (!localIsDragging && !useModalStore.getState().isDragging) return;
      localIsDragging = false;
      const state = useModalStore.getState();
      if (state.isDragging) {
        state.setIsDragging(false);
      }
      window.removeEventListener("mousemove", handleCancelDrag);
    };

    if (isDesktop()) {
      unlistenPromise = getCurrentWebview().onDragDropEvent((event) => {
        if (event.payload.type === "enter" || event.payload.type === "over") {
          if (!localIsDragging) {
            localIsDragging = true;
            useModalStore.getState().setIsDragging(true);
            window.addEventListener("mousemove", handleCancelDrag);
          }
        } else if (event.payload.type === "leave") {
          if (localIsDragging) {
            localIsDragging = false;
            useModalStore.getState().setIsDragging(false);
            window.removeEventListener("mousemove", handleCancelDrag);
          }
        } else if (event.payload.type === "drop") {
          localIsDragging = false;
          useModalStore.getState().setIsDragging(false);
          window.removeEventListener("mousemove", handleCancelDrag);
          const paths = event.payload.paths as string[];
          if (paths && paths.length > 0) {
            dropQueue.push(...paths);
            if (dropTimeout) clearTimeout(dropTimeout);
            dropTimeout = setTimeout(processDropQueue, 150);
          }
        }
      });
    }

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
  const pendingWorkspaceSetupId = useStore((state) => state.pendingWorkspaceSetupId);
  const setPendingWorkspaceSetupId = useStore((state) => state.setPendingWorkspaceSetupId);
  const isWorkspaceSetupOverlayOpen = Boolean(
    isDesktop() &&
      !isConfigured &&
      pendingWorkspaceSetupId &&
      !isPlaceholderWorkspaceKey(pendingWorkspaceSetupId) &&
      view !== "landing" &&
      view !== "settings" &&
      view !== "KeepersCore"
  );
  const setLivePath = useStore((state) => state.setLivePath);
  const modsPath = useStore((state) => state.modsPath);
  const setModsPath = useStore((state) => state.setModsPath);
  const vaultPath = useStore((state) => state.vaultPath);
  const setVaultPath = useStore((state) => state.setVaultPath);
  const quarantineList = useStore((state) => state.quarantineList);
  const shelterContents = useStore((state) => state.shelterContents);
  const shelterActive = useStore((state) => state.shelterActive);
  const setShelterActive = useStore((state) => state.setShelterActive);
  const backupList = useStore((state) => state.backupList);
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
  const logWatcherRef = useRef<any>(null);
  useEffect(() => {
    logWatcherRef.current = logWatcher;
  }, [logWatcher]);
  useEffect(() => {
    return () => {
      if (logWatcherRef.current) {
        clearInterval(logWatcherRef.current);
        logWatcherRef.current = null;
      }
    };
  }, []);
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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => isLinuxDesktop());
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

  useEffect(() => {
    const handleTourPanelControl = (e: Event) => {
      const detail = (e as CustomEvent)?.detail || {};
      const { panel, open } = detail;
      if (panel === "notifications") {
        setIsNotificationSidebarOpen(Boolean(open));
      } else if (panel === "citizen_tickets") {
        setIsCitizenTicketsOpen(Boolean(open));
      } else if (panel === "mod_dossier") {
        if (open) {
          const list = useStore.getState().modList || [];
          const defaultExtRaw =
            useStore.getState().activeGameSchema?.extensions?.supported?.[0] || ".mod";
          const defaultExt = defaultExtRaw.startsWith(".")
            ? defaultExtRaw
            : `.${defaultExtRaw}`;
          const sampleMod =
            list.find((m: any) => !m.isVirtual && m.name) ||
            list[0] || {
              name: `Sanctuary_Core_Module${defaultExt}`,
              displayName: "Sanctuary Core Module",
              author: "Sanctuary Foundry",
              version: "1.0.0",
              status: "verified",
              hash: "preview_hash",
            };
          setActiveDossier(sampleMod);
        } else {
          setActiveDossier(null);
          setEditMode(false);
          setIsEditingMeta(false);
          setIsCorrectingMeta(false);
        }
      }
    };
    window.addEventListener("sanctuary-tour-panel-control", handleTourPanelControl);
    return () =>
      window.removeEventListener("sanctuary-tour-panel-control", handleTourPanelControl);
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
    setStatus(t("status_syncing_metadata", "Syncing metadata to the Network..."));
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
          status_reason:
            extraOverrides?.status_reason !== undefined
              ? extraOverrides.status_reason
              : metaStatusMsgInput?.trim() || undefined,
          requiredDLC:
            extraOverrides?.requiredDLC !== undefined
              ? extraOverrides.requiredDLC
              : fetchedManifest?.atomic_logic?.required_dlc || (activeDossier as any).requiredDLC,
          ...(extraOverrides || {}),
          is_user_dossier: true,
          updated_at_local: Date.now(),
        };

        for (const h of familyHashes) {
          localOvr[h] = {
            ...(localOvr[h] || {}),
            ...(h === activeDossier.hash
              ? overrides
              : localOvr[h]?.is_user_dossier
                ? {
                    manifest_url: localOvr[h].manifest_url || cleanManifestUrl || undefined,
                  }
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
            const hasMatchingFlavor = m.flavors.some((f: any) => f.hash === activeDossier.hash);
            const updatedFlavors = m.flavors.map((f: any) => f.hash === activeDossier.hash ? { ...f, ...overrides, isLocalOverride: true } : f);
            if (hasMatchingFlavor) {
              return {
                ...m,
                author: overrides.author || m.author,
                version: overrides.version || m.version,
                url: overrides.url || m.url,
                image_url: overrides.image_url !== undefined ? overrides.image_url : m.image_url,
                description: overrides.description !== undefined ? overrides.description : m.description,
                category_override: overrides.category_override || m.category_override,
                compatible_versions: overrides.compatible_versions || m.compatible_versions,
                requiredDLC: overrides.requiredDLC || m.requiredDLC,
                ...(overrides.status !== undefined ? { status: overrides.status } : {}),
                ...(overrides.status_reason !== undefined
                  ? { status_reason: overrides.status_reason }
                  : {}),
                isLocalOverride: true,
                flavors: updatedFlavors,
              };
            }
            return { ...m, flavors: updatedFlavors };
          }
          return m;
        }));
      }

      setStatus(`${t("icon_check_circle", "check_circle")} ${t("status_overrides_saved", "Local overrides saved successfully.")}`);
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

      setStatus(`${t("icon_check_circle", "check_circle")} ${t("status_overrides_reset", "Local overrides reset to database defaults.")}`);
      setIsEditingMeta(false);
      setEditMode(false);
      setIsCorrectingMeta(false);
      runRadarSweep(true);
    } catch (err: any) {
      console.error(err);
      setStatus(`Error: ${err.message || err}`);
    }
  };

  useEffect(() => {
    const handleResetAllLocalOverrides = () => {
      if (isDesktop()) {
        runRadarSweep(true);
      }
    };
    window.addEventListener("sanctuary_reset_all_local_overrides", handleResetAllLocalOverrides);
    return () => window.removeEventListener("sanctuary_reset_all_local_overrides", handleResetAllLocalOverrides);
  }, []);
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
  const [isMasonProfilePanelOpen, setIsMasonProfilePanelOpen] = useState(false);

  const networkUpdates = useStore((state) => state.networkUpdates);
  const setNetworkUpdates = useStore((state) => state.setNetworkUpdates);
  const tier2Hashes = useStore((state) => state.tier2Hashes);
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
    isRestoring,
    ingestProgress,
    setIngestProgress,
    isScanning,
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
    isUpdatePanelOpen,
    isNexusUpdatesPanelOpen,
    isSupportPanelOpen,
  } = useModalStore(
    useShallow((s) => ({
      snapshotModal: s.snapshotModal,
      setSnapshotModal: s.setSnapshotModal,
      snapshotName: s.snapshotName,
      setSnapshotName: s.setSnapshotName,
      bulkModal: s.bulkModal,
      setBulkModal: s.setBulkModal,
      bulkName: s.bulkName,
      setBulkName: s.setBulkName,
      isBulkMode: s.isBulkMode,
      setIsBulkMode: s.setIsBulkMode,
      selectedMods: s.selectedMods,
      setSelectedMods: s.setSelectedMods,
      renameModal: s.renameModal,
      setRenameModal: s.setRenameModal,
      renameTarget: s.renameTarget,
      setRenameTarget: s.setRenameTarget,
      nameInput: s.nameInput,
      setNameInput: s.setNameInput,
      localFolderModal: s.localFolderModal,
      setLocalFolderModal: s.setLocalFolderModal,
      localFolderType: s.localFolderType,
      setLocalFolderType: s.setLocalFolderType,
      localFolderName: s.localFolderName,
      setLocalFolderName: s.setLocalFolderName,
      missingImportMods: s.missingImportMods,
      setMissingImportMods: s.setMissingImportMods,
      pendingImportSet: s.pendingImportSet,
      setPendingImportSet: s.setPendingImportSet,
      syncCode: s.syncCode,
      setSyncCode: s.setSyncCode,
      confirmDialog: s.confirmDialog,
      setConfirmDialog: s.setConfirmDialog,
      isDropzoneOpen: s.isDropzoneOpen,
      setIsDropzoneOpen: s.setIsDropzoneOpen,
      isDragging: s.isDragging,
      setIsDragging: s.setIsDragging,
      dropzoneState: s.dropzoneState,
      setDropzoneState: s.setDropzoneState,
      droppedFiles: s.droppedFiles,
      setDroppedFiles: s.setDroppedFiles,
      showBrokenModal: s.showBrokenModal,
      setShowBrokenModal: s.setShowBrokenModal,
      showQuarantineModal: s.showQuarantineModal,
      setShowQuarantineModal: s.setShowQuarantineModal,
      isBackingUp: s.isBackingUp,
      isRestoring: s.isRestoring,
      ingestProgress: s.ingestProgress,
      setIngestProgress: s.setIngestProgress,
      isScanning: s.isScanning,
      showDefconAlert: s.showDefconAlert,
      setShowDefconAlert: s.setShowDefconAlert,
      yeetConfirmPending: s.yeetConfirmPending,
      setYeetConfirmPending: s.setYeetConfirmPending,
      dnaMatchQueue: s.dnaMatchQueue,
      setDnaMatchQueue: s.setDnaMatchQueue,
      edgeOverrideQueue: s.edgeOverrideQueue,
      setEdgeOverrideQueue: s.setEdgeOverrideQueue,
      scoutQueue: s.scoutQueue,
      setScoutQueue: s.setScoutQueue,
      isUpdatePanelOpen: s.isUpdatePanelOpen,
      isNexusUpdatesPanelOpen: s.isNexusUpdatesPanelOpen,
      isSupportPanelOpen: s.isSupportPanelOpen,
    }))
  );

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

  runRadarSweepRef.current = runRadarSweep;
  setMalwareAlertRef.current = setMalwareAlert;
  const handleDroppedFilesRef = useRef(handleDroppedFiles);
  handleDroppedFilesRef.current = handleDroppedFiles;
  const {
    ignoredHashesRef,
    fetchCloudLabQueue,
    checkNetworkUpdates,
  } = useAppEdgeAndNetworkSync({
    insertingHashes,
    t,
    setModList,
    vaultPath,
    setLabQueue,
    setNetworkUpdates,
    setDnaMatchQueue,
    setEdgeOverrideQueue,
    runRadarSweepRef,
    setMalwareAlertRef,
    handleDroppedFilesRef,
  });
  checkNetworkUpdatesRef.current = checkNetworkUpdates;
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
  const anarchyRules = useStore((state) => state.anarchyRules);
  const setAnarchyRules = useStore((state) => state.setAnarchyRules);
  const [masonProfileAboveDossier, setMasonProfileAboveDossier] = useState(true);
  const handleOpenMasonProfile = async (masonId: string, postId?: string) => {
    if (!masonId) {
      useStore.getState().pushStatus(t("alert_error_mason_profile_missing", "Error: {Mason} Profile ID is missing."), "error");
      return;
    }
    const { data: mVer } = await supabase.from("masons").select("is_verified").eq("id", masonId).maybeSingle();
    if (!mVer || !mVer.is_verified) {
      useStore.getState().pushStatus(t("mason_profile_verified_only_desc", "Public {Mason} Profiles are exclusively available for Verified {Masons}."), "info");
      return;
    }
    setMasonProfileAboveDossier(true);
    setActiveMasonProfileId(masonId);
    setActiveMasonPostId(postId || null);
    setIsMasonProfilePanelOpen(true);
  };

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
    const handleRefresh = () => runRadarSweep(true);
    window.addEventListener("refreshVault", handleRefresh);
    return () => {
      window.removeEventListener("refreshVault", handleRefresh);
    };
  }, []);

  useEffect(() => {
    if (!isDesktop()) return;
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    listen("download_intercepted", (event: any) => {
      if (cancelled) return;
      useModalStore.getState().setDownloadsQueue((prev: string[]) => {
        if (!prev.includes(event.payload.path)) {
          return [...prev, event.payload.path];
        }
        return prev;
      });
    }).then((handler) => {
      if (cancelled) handler();
      else unlisten = handler;
    });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
      invoke("stop_downloads_watch").catch(console.warn);
    };
  }, []);

  useEffect(() => {
    if (!isDesktop() || !activeGameSchema?.extensions?.supported) return;
    invoke("start_downloads_watch", {
      extensions: activeGameSchema.extensions.supported,
    }).catch(console.warn);
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
    const st = useStore.getState();
    const fileEditNames: string[] = [];
    if (st.cwUnsavedEdits && typeof st.cwUnsavedEdits === "object") {
      Object.entries(st.cwUnsavedEdits).forEach(([k, val]) => {
        if (val && typeof val === "object" && Object.keys(val).length > 0) {
          const name = k.split(/[\\/]/).pop();
          if (name && !fileEditNames.includes(name)) fileEditNames.push(name);
        }
      });
    }
    if (Array.isArray(st.ideOpenFiles)) {
      st.ideOpenFiles.forEach((f: any) => {
        if (f?.content !== f?.originalContent && f?.name && !fileEditNames.includes(f.name)) {
          fileEditNames.push(f.name);
        }
      });
    }

    const postEditNames: string[] = [];
    const fallbackDraftTitle = t("draft_untitled", "Draft");
    if (st.masonHubDrafts && typeof st.masonHubDrafts === "object") {
      Object.entries(st.masonHubDrafts).forEach(([k, d]: [string, any]) => {
        const name = (d?.title || `${fallbackDraftTitle} ${k}`) + ".masonhub";
        if (!postEditNames.includes(name)) postEditNames.push(name);
      });
    }
    if (st.wayfinderDrafts && typeof st.wayfinderDrafts === "object") {
      Object.entries(st.wayfinderDrafts).forEach(([k, d]: [string, any]) => {
        const name = (d?.title || `${fallbackDraftTitle} ${k}`) + ".wayfinder";
        if (!postEditNames.includes(name)) postEditNames.push(name);
      });
    }

    if (fileEditNames.length > 0) {
      setTimeout(() => {
        if (fileEditNames.length === 1) {
          useStore.getState().setStatus(
            t("status_cached_session_single", "{name} has cached changes from your last session.")
              .replace("{name}", fileEditNames[0])
          );
        } else {
          useStore.getState().setStatus(
            t("status_cached_session_multi", "{names} have cached changes from your last session.")
              .replace("{names}", fileEditNames.join(", "))
          );
        }
      }, 8000);
    }

    if (postEditNames.length > 0) {
      setTimeout(() => {
        if (postEditNames.length === 1) {
          useStore.getState().setStatus(
            t("status_cached_session_single", "{name} has cached changes from your last session.")
              .replace("{name}", postEditNames[0])
          );
        } else {
          useStore.getState().setStatus(
            t("status_cached_session_multi", "{names} have cached changes from your last session.")
              .replace("{names}", postEditNames.join(", "))
          );
        }
      }, 10000);
    }
  }, [activeWorkspaceId]);
  const { toggleInActiveSet, deletePlaySet, renamePlaySet, importPlaySet, finalizeImport, equipPlaySet } = usePlaySetLogic();
  const { handleSmartSearch, triggerShelter, restoreMod, purgeMod } = useModActions(openUrl, fetchVault, runRadarSweep, activeSetName, equipPlaySet, setShelterActive);
  useAppNotificationsAndBoot({
    t,
    activeWorkspaceId,
    isGameDatabasesSynced,
    setUserRole,
    setOsRole,
    playSets,
    setStatus,
    session,
    runRadarSweep,
    setView,
    playsetsLoaded,
    setPlaysetsLoaded,
    setIsConfigured,
    setPendingWorkspaceSetupId,
    setLivePath,
    setModsPath,
    setVaultPath,
    setIsNotificationSidebarOpen,
    setUnreadNotificationCount,
    prevUnreadRef,
    isInitialLoadRef,
    setOwnedDLC,
    setMaskedDLC,
    fetchCloudLabQueue,
  });

  async function registerConflict(
    modAHash: string,
    modBId: string,
    severity: number = 3,
  ) {
    setStatus(t("status_conflict_resolving", "Resolving conflict identities..."));
    try {
      const { data: verData, error: verErr } = await supabase
        .from("mod_versions")
        .select("mod_id")
        .eq("dna_hash", modAHash)
        .single();
      if (verErr || !verData) throw new Error(t("status_error_primary_sync", "ERROR: Primary {Mod} must be synced to Cloud first."));
      const { error } = await supabase
        .from("logical_conflicts")
        .insert([
          {
            mod_a_id: verData.mod_id,
            mod_b_id: modBId,
            severity_rank: severity,
            resolution_note: t("status_architect_flagged", "Moderator flagged via Network Hub"),
          },
        ]);
      if (error) throw error;
      setStatus(t("status_conflict_registered", "Conflict Registered Globally."));
      alert(t("alert_conflict_success", "Conflict successfully locked into the network!"));
    } catch (err: any) {
      setStatus(`${t("status_conflict_failed", "Conflict Registration Failed:")}${err.message}`);
      alert(`${t("alert_conflict_failed", "Failed to register conflict:")}${err.message}`);
    }
  }
  async function designateTwin(primaryHash: string, twinHash: string) {
    setStatus(t("status_twins_linking", "LINKING TWINS: Forcing permanent connection..."));
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
              name: localA?.name || t("unknown", "Unknown"),
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
              name: localB?.name || t("unknown", "Unknown"),
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
      setStatus(t("status_twins_synced", "Twins Synchronized."));
      runRadarSweep(true);
    } catch (err: any) {
      setStatus(`${t("status_twins_failed", "Twin Link Failed:")}${err.message}`);
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
    if (error) setStatus(`${t("status_network_error", "Network Error:")}${error.message}`);
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
      setStatus(t("status_sync_bond", "Syncing Network Bond..."));
      let { data: childVer } = await supabase
        .from("mod_versions")
        .select("mod_id")
        .eq("dna_hash", childHash)
        .maybeSingle();
      let childModId = childVer?.mod_id;
      if (parentId !== null && !childModId) {
        const { data: newC } = await supabase
          .from("mods")
          .insert([{ name: t("status_new_mod", "New {Mod}"), status: "unverified" }])
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
      setStatus(t("status_link_updated", "Link Updated."));
      runRadarSweep(true);
    } catch (err: any) {
      setStatus(`${t("status_link_failed", "Link Failed:")}${err.message}`);
    }
  }
  async function sendToLabQueue(mod: ModData) {
    setStatus(`${t("status_uploading_dna", "Uploading Hash:")}${mod.displayName || mod.name}...`);
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
        `${t("status_dna_secured_prefix", "Hash Secured:")}${mod.displayName || mod.name}${t("status_dna_secured_suffix", "is now in the Lab.")}`,
      );
      const labMod = {
        ...mod,
        status: t("status_dd_review", "Under Review"),
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
        `${t("status_cloud_rejection", "Cloud Rejection:")}${err.message || t("status_unknown_db_failure", "Unknown Database Failure")}`,
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
      setStatus(t("status_blueprint_exists", "A {Blueprint} with that name already exists!"));
      return;
    }
    const updatedSets = [...playSets, { name: setName, mods: [], modHashes: {}, ignoredGhosts: [] }];
    setPlaySets(updatedSets);

    setActivePlaySetIndex(updatedSets.length - 1);
    setStatus(
      `${t("status_blueprint_created_prefix", "{Blueprint}[")}${setName}${t("status_blueprint_drafted_suffix", "] created.")}`,
    );
    setIsDraftingSet(false);
    setDraftSetName("");
  }
  const displayModList = useMemo(
    () => sanitizeVaultModList(modList, activeGameSchema, t),
    [modList, activeGameSchema, t],
  );



  const { handleQuickLaunch } = useLaunchLogic(
    askCustom,
    triggerPrePatchSnapshot,
    equipPlaySet,
    triggerFullEngineBackup,
  );

  useDefconRadar(t, askCustom, triggerPrePatchSnapshot, triggerFullEngineBackup);
  useGlobalListeners(fetchBackups, askCustom, t, triggerPrePatchSnapshot, triggerFullEngineBackup, ignoredHashesRef);
  useLabMilestoneNotifications();

  const {
    executeHotSwap,
    openWorkbench,
    saveWorkbenchChanges,
    submitLabReport,
    concludeTest,
    runLabSimulation,
    runProvingRun,
  } = useAppLabAndWorkbenchActions({
    t,
    setMetaAllowWriteInput,
    setStatus,
    session,
    modList,
    setModList,
    activeGameSchema,
    fetchVault,
    view,
    shelterActive,
    setShelterActive,
    activeDossier,
    setActiveDossier,
    setLabQueue,
    activeLabMod,
    setActiveLabMod,
    setTestErrorFound,
    testErrorFound,
    setLogWatcher,
    logWatcher,
    logWatcherRef,
    setTestLogSnippet,
    testLogSnippet,
    setIsSubmittingReport,
    setEditMode,
    setConfigContent,
    configContent,
    setIsEditingMeta,
    setIsCorrectingMeta,
    setMetaNameInput,
    setMetaAuthorInput,
    setMetaUrlInput,
    setMetaImageInput,
    setMetaDescInput,
    setMetaStatusMsgInput,
    setMetaStatusInput,
    setMetaVersionInput,
    setMetaManifestUrlInput,
    setMetaIsPaidInput,
    setMetaIsEarlyAccessInput,
    selectedVersion,
    associatedMods,
    setAssociatedMods,
    conflictTarget,
    setConflictTarget,
    setIsLoadingAssociated,
    setLabConflicts,
    setMasonProfileAboveDossier,
    equipPlaySet,
    toggleInActiveSet,
    displayModList,
  });
  const {
    searchQuery, setSearchQuery,
    filterStatus, setFilterStatus,
    equipFilter, setEquipFilter,
    activeCategory, setActiveCategory,
    activeSubType, setActiveSubType,
    exclusiveSlotFilter, setExclusiveSlotFilter,
    expandedFolder, setExpandedFolder,
    filteredMods
  } = useModFiltering(displayModList, playSets, activeSetName || '', activeGameSchema, t, view === "vault");
  const visibleMods = filteredMods;
  const isGlobalConfigLoaded = useStore((state) => state.isGlobalConfigLoaded);

  // Apply Malware-style OS lockdown while Preparing Workspace SidePanel is active
  useEffect(() => {
    const isPreparingLocked = !isGlobalConfigLoaded;
    if (!isPreparingLocked || typeof document === "undefined") {
      const otherLockdown = document.querySelector('[data-sa-malware-active="true"]');
      if (!otherLockdown) {
        document.body.classList.remove("sa-malware-lockdown");
        const osShell = document.getElementById("sanctuary-os-shell");
        if (osShell) osShell.removeAttribute("inert");
      }
      useTooltipStore.getState().clearTooltip();
      return;
    }

    document.body.classList.add("sa-malware-lockdown");
    const osShell = document.getElementById("sanctuary-os-shell");
    if (osShell) {
      osShell.setAttribute("inert", "");
    }

    const blockKeys = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" ||
        e.key === "F5" ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r")
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener("keydown", blockKeys, true);
    return () => {
      window.removeEventListener("keydown", blockKeys, true);
      const otherLockdown = document.querySelector('[data-sa-malware-active="true"]');
      if (!otherLockdown) {
        document.body.classList.remove("sa-malware-lockdown");
        if (osShell) {
          osShell.removeAttribute("inert");
        }
      }
      useTooltipStore.getState().clearTooltip();
    };
  }, [isGlobalConfigLoaded]);

  return (
    <div
      className={`flex flex-col ${isDesktop() ? 'h-screen w-screen overflow-hidden' : 'h-full min-h-[100lvh] w-full overflow-hidden max-md:h-auto max-md:min-h-[100dvh] max-md:overflow-visible'} relative ${currentTheme?.animated !== false ? 'animated-fluid-bg' : ''}`}
      style={{ color: "var(--text)" } as React.CSSProperties}
    >
      <SystemBackground />

      <div
        id="sanctuary-os-shell"
        className={`relative z-10 flex flex-col h-full w-full overflow-hidden py-0 pl-6 pr-0 gap-6 ${
          isDesktop()
            ? ""
            : "max-md:h-auto max-md:min-h-[100dvh] max-md:overflow-visible max-md:p-0 max-md:gap-0"
        }`}
      >
        <TitleBar
          isSidebarCollapsed={isSidebarCollapsed}
          setIsSidebarCollapsed={setIsSidebarCollapsed}
          subtitleIndex={subtitleIndex}
          unreadNotificationCount={unreadNotificationCount}
          setIsNotificationSidebarOpen={setIsNotificationSidebarOpen}
          onTriggerShelter={triggerShelter}
        />

        <div
          className={`flex-1 flex flex-row min-h-0 relative gap-6 ${
            isDesktop() ? "overflow-hidden" : "max-md:gap-0 max-md:overflow-visible"
          }`}
        >
          <Sidebar
            isSidebarCollapsed={isSidebarCollapsed}
            setIsSidebarCollapsed={setIsSidebarCollapsed}
            subtitleIndex={subtitleIndex}
            isNotificationSidebarOpen={isNotificationSidebarOpen}
            setIsNotificationSidebarOpen={setIsNotificationSidebarOpen}
            unreadNotificationCount={unreadNotificationCount}
            handleQuickLaunch={handleQuickLaunch}
          />
          <AppMainViewportRouter
            currentTheme={currentTheme}
            t={t}
            activeWorkspaceId={activeWorkspaceId}
            triggerPrePatchSnapshot={triggerPrePatchSnapshot}
            triggerFullEngineBackup={triggerFullEngineBackup}
            restoreGameBackup={restoreGameBackup}
            fetchBackups={fetchBackups}
            deleteBackup={deleteBackup}
            subtitleIndex={subtitleIndex}
            getBackupSignature={getBackupSignature}
            backupProgress={backupProgress}
            userRole={userRole}
            osRole={osRole}
            setMetaAllowWriteInput={setMetaAllowWriteInput}
            metaAllowWriteInput={metaAllowWriteInput}
            playSets={playSets}
            setPlaySets={setPlaySets}
            activeSetName={activeSetName}
            setActiveSetName={setActiveSetName}
            statusLog={statusLog}
            setStatus={setStatus}
            clearStatusLog={clearStatusLog}
            session={session}
            modList={modList}
            activeGameSchema={activeGameSchema}
            runRadarSweep={runRadarSweep}
            malwareAlert={malwareAlert}
            setMalwareAlert={setMalwareAlert}
            handleDroppedFiles={handleDroppedFiles}
            view={view}
            setView={setView}
            isConfigured={isConfigured}
            isWorkspaceSetupOverlayOpen={isWorkspaceSetupOverlayOpen}
            modsPath={modsPath}
            vaultPath={vaultPath}
            quarantineList={quarantineList}
            shelterContents={shelterContents}
            shelterActive={shelterActive}
            backupList={backupList}
            isNotificationSidebarOpen={isNotificationSidebarOpen}
            setIsNotificationSidebarOpen={setIsNotificationSidebarOpen}
            setGlobalViewingPost={setGlobalViewingPost}
            globalViewingPost={globalViewingPost}
            unreadNotificationCount={unreadNotificationCount}
            setActiveDossier={setActiveDossier}
            activeDossier={activeDossier}
            labQueue={labQueue}
            activeLabMod={activeLabMod}
            setActiveLabMod={setActiveLabMod}
            activeSandboxMod={activeSandboxMod}
            setActiveSandboxMod={setActiveSandboxMod}
            testErrorFound={testErrorFound}
            testLogSnippet={testLogSnippet}
            isSubmittingReport={isSubmittingReport}
            labSearchQuery={labSearchQuery}
            setLabSearchQuery={setLabSearchQuery}
            labVerificationQueue={labVerificationQueue}
            setEditMode={setEditMode}
            editMode={editMode}
            configContent={configContent}
            setConfigContent={setConfigContent}
            activePlaySetIndex={activePlaySetIndex}
            setActivePlaySetIndex={setActivePlaySetIndex}
            setIsEditingMeta={setIsEditingMeta}
            isEditingMeta={isEditingMeta}
            setIsCorrectingMeta={setIsCorrectingMeta}
            isCorrectingMeta={isCorrectingMeta}
            setMetaNameInput={setMetaNameInput}
            metaNameInput={metaNameInput}
            setMetaAuthorInput={setMetaAuthorInput}
            metaAuthorInput={metaAuthorInput}
            setMetaUrlInput={setMetaUrlInput}
            metaUrlInput={metaUrlInput}
            setMetaImageInput={setMetaImageInput}
            metaImageInput={metaImageInput}
            setMetaDescInput={setMetaDescInput}
            metaDescInput={metaDescInput}
            metaStatusMsgInput={metaStatusMsgInput}
            setMetaStatusMsgInput={setMetaStatusMsgInput}
            metaStatusInput={metaStatusInput}
            setMetaStatusInput={setMetaStatusInput}
            setMetaVersionInput={setMetaVersionInput}
            metaVersionInput={metaVersionInput}
            metaManifestUrlInput={metaManifestUrlInput}
            setMetaManifestUrlInput={setMetaManifestUrlInput}
            metaIsPaidInput={metaIsPaidInput}
            setMetaIsPaidInput={setMetaIsPaidInput}
            metaIsEarlyAccessInput={metaIsEarlyAccessInput}
            setMetaIsEarlyAccessInput={setMetaIsEarlyAccessInput}
            globalSearchQuery={globalSearchQuery}
            setGlobalSearchQuery={setGlobalSearchQuery}
            cloudSearchResults={cloudSearchResults}
            isSearchingCloud={isSearchingCloud}
            isDraftingSet={isDraftingSet}
            setIsDraftingSet={setIsDraftingSet}
            draftSetName={draftSetName}
            setDraftSetName={setDraftSetName}
            isSidebarCollapsed={isSidebarCollapsed}
            setIsCitizenTicketsOpen={setIsCitizenTicketsOpen}
            isCitizenTicketsOpen={isCitizenTicketsOpen}
            selectedVersion={selectedVersion}
            setSelectedVersion={setSelectedVersion}
            ownedDLC={ownedDLC}
            maskedDLC={maskedDLC}
            metaRequiredDLC={metaRequiredDLC}
            setMetaRequiredDLC={setMetaRequiredDLC}
            setDrawerConfirmHash={setDrawerConfirmHash}
            drawerConfirmHash={drawerConfirmHash}
            associatedMods={associatedMods}
            saveLocalMetadata={saveLocalMetadata}
            resetLocalMetadata={resetLocalMetadata}
            setConflictTarget={setConflictTarget}
            conflictTarget={conflictTarget}
            isLoadingAssociated={isLoadingAssociated}
            labConflicts={labConflicts}
            setLabConflicts={setLabConflicts}
            activeMasonProfileId={activeMasonProfileId}
            activeMasonPostId={activeMasonPostId}
            isMasonProfilePanelOpen={isMasonProfilePanelOpen}
            setIsMasonProfilePanelOpen={setIsMasonProfilePanelOpen}
            networkUpdates={networkUpdates}
            massIngestToCloud={massIngestToCloud}
            syncBlueprintByCode={syncBlueprintByCode}
            uploadBlueprintToCloud={uploadBlueprintToCloud}
            snapshotModal={snapshotModal}
            setSnapshotModal={setSnapshotModal}
            snapshotName={snapshotName}
            setSnapshotName={setSnapshotName}
            bulkModal={bulkModal}
            setBulkModal={setBulkModal}
            bulkName={bulkName}
            setBulkName={setBulkName}
            isBulkMode={isBulkMode}
            setIsBulkMode={setIsBulkMode}
            selectedMods={selectedMods}
            setSelectedMods={setSelectedMods}
            renameModal={renameModal}
            setRenameModal={setRenameModal}
            renameTarget={renameTarget}
            setRenameTarget={setRenameTarget}
            nameInput={nameInput}
            setNameInput={setNameInput}
            localFolderModal={localFolderModal}
            setLocalFolderModal={setLocalFolderModal}
            localFolderType={localFolderType}
            setLocalFolderType={setLocalFolderType}
            localFolderName={localFolderName}
            setLocalFolderName={setLocalFolderName}
            missingImportMods={missingImportMods}
            setMissingImportMods={setMissingImportMods}
            pendingImportSet={pendingImportSet}
            setPendingImportSet={setPendingImportSet}
            syncCode={syncCode}
            setSyncCode={setSyncCode}
            confirmDialog={confirmDialog}
            setConfirmDialog={setConfirmDialog}
            isDropzoneOpen={isDropzoneOpen}
            setIsDropzoneOpen={setIsDropzoneOpen}
            isDragging={isDragging}
            setIsDragging={setIsDragging}
            dropzoneState={dropzoneState}
            setDropzoneState={setDropzoneState}
            droppedFiles={droppedFiles}
            setDroppedFiles={setDroppedFiles}
            showBrokenModal={showBrokenModal}
            setShowBrokenModal={setShowBrokenModal}
            showQuarantineModal={showQuarantineModal}
            setShowQuarantineModal={setShowQuarantineModal}
            isBackingUp={isBackingUp}
            isRestoring={isRestoring}
            ingestProgress={ingestProgress}
            isScanning={isScanning}
            showDefconAlert={showDefconAlert}
            setShowDefconAlert={setShowDefconAlert}
            yeetConfirmPending={yeetConfirmPending}
            setYeetConfirmPending={setYeetConfirmPending}
            dnaMatchQueue={dnaMatchQueue}
            setDnaMatchQueue={setDnaMatchQueue}
            edgeOverrideQueue={edgeOverrideQueue}
            setEdgeOverrideQueue={setEdgeOverrideQueue}
            scoutQueue={scoutQueue}
            setScoutQueue={setScoutQueue}
            isUpdatePanelOpen={isUpdatePanelOpen}
            isNexusUpdatesPanelOpen={isNexusUpdatesPanelOpen}
            isSupportPanelOpen={isSupportPanelOpen}
            createLocalFolder={createLocalFolder}
            executeBulkDraft={executeBulkDraft}
            executeSnapshot={executeSnapshot}
            exportPlaySet={exportPlaySet}
            executeRename={executeRename}
            confirmRename={confirmRename}
            ignoredHashesRef={ignoredHashesRef}
            anarchyRules={anarchyRules}
            setAnarchyRules={setAnarchyRules}
            masonProfileAboveDossier={masonProfileAboveDossier}
            setMasonProfileAboveDossier={setMasonProfileAboveDossier}
            handleOpenMasonProfile={handleOpenMasonProfile}
            toggleInActiveSet={toggleInActiveSet}
            equipPlaySet={equipPlaySet}
            renamePlaySet={renamePlaySet}
            deletePlaySet={deletePlaySet}
            importPlaySet={importPlaySet}
            finalizeImport={finalizeImport}
            triggerShelter={triggerShelter}
            restoreMod={restoreMod}
            purgeMod={purgeMod}
            handleSmartSearch={handleSmartSearch}
            registerConflict={registerConflict}
            designateTwin={designateTwin}
            searchGlobalNetwork={searchGlobalNetwork}
            establishBond={establishBond}
            sendToLabQueue={sendToLabQueue}
            finalizeDraftSet={finalizeDraftSet}
            displayModList={displayModList}
            handleQuickLaunch={handleQuickLaunch}
            executeHotSwap={executeHotSwap}
            openWorkbench={openWorkbench}
            saveWorkbenchChanges={saveWorkbenchChanges}
            submitLabReport={submitLabReport}
            concludeTest={concludeTest}
            runLabSimulation={runLabSimulation}
            runProvingRun={runProvingRun}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            setFilterStatus={setFilterStatus}
            filterStatus={filterStatus}
            equipFilter={equipFilter}
            setEquipFilter={setEquipFilter}
            activeCategory={activeCategory}
            setActiveCategory={setActiveCategory}
            activeSubType={activeSubType}
            setActiveSubType={setActiveSubType}
            exclusiveSlotFilter={exclusiveSlotFilter}
            setExclusiveSlotFilter={setExclusiveSlotFilter}
            expandedFolder={expandedFolder}
            setExpandedFolder={setExpandedFolder}
            visibleMods={visibleMods}
            isGlobalConfigLoaded={isGlobalConfigLoaded}
          />
        </div>
      </div>

      <AppGlobalOverlays
        view={view}
        setView={setView}
        subtitleIndex={subtitleIndex}
        isGlobalConfigLoaded={isGlobalConfigLoaded}
        t={t}
        currentTheme={currentTheme}
      />
    </div>
  );
}
export default App;





