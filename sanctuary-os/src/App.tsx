import { YeetConfirmAlert } from "./side-panels/YeetConfirmAlert";
import { DefconAlert } from "./DefconAlert";
import { TitleBar } from "./TitleBar";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import { ErrorBoundary } from "./ErrorBoundary";
import { AppModals } from "./AppModals";

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
import { useStore, syncMasterSchemas } from "./store";
import { useGlobalListeners } from "./hooks/useGlobalListeners";
import { open, save } from "@tauri-apps/plugin-dialog";
import { supabase, supabaseAuth, getActiveGameClient } from "./supabase";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import ArchitectHub from "./ArchitectHub";
import GlobalFeed from "./GlobalFeed";
import Settings from "./SettingsTab";
import { ModData, ViewHeader, deriveHumanReadableVersion, isVersionMatch, loadDLCMap, getFileLabel, isSupportedExtension, formatDisplayName, getExtensionRegex } from "./shared";
import { ModCard } from "./ModCard";
import ModDossier from "./ModDossier";
import BlueprintArchitect from "./BlueprintArchitect";
import Nexus from "./Nexus";
import { DbpfScout } from "./DbpfScout";
import { useLexicon } from "./LexiconContext";
import { WorkspaceLanding } from "./WorkspaceLanding";
import { Sidebar } from "./Sidebar";
import NotificationSidebar from "./side-panels/NotificationSidebar";
import SupportDeskSidePanel from "./side-panels/SupportDeskSidePanel";
import CitizenTicketsSidePanel from "./side-panels/CitizenTicketsSidePanel";
import { NexusUpdatesChecker } from "./NexusUpdatesChecker";
import MasonHub from "./MasonHub";
import MasonProfile from "./MasonProfile";
import MasonPostViewer from "./side-panels/MasonPostViewer";
import CommandCenter from "./CommandCenter";
import Blueprints from "./Blueprints";
import Vault from "./Vault";
import Lab from "./Lab";
import TimeCapsule from "./TimeCapsule";
import Oversight from "./Oversight";
import WayfinderHub from "./WayfinderHub";
import KeepersCore from "./KeepersCore";
import { UpdateSidePanel } from './side-panels/UpdateSidePanel';
import CitizensWorkbench from "./CitizensWorkbench";
import { ContextMenu } from "./ContextMenu";

const setupBtnStyle: React.CSSProperties = {
  padding: "12px",
  backgroundColor: "rgba(255,255,255,0.05)",
  color: "white",
  border: "none",
  borderRadius: "4px",
  cursor: "pointer",
};

function App() {
  const insertingHashes = useRef<Set<string>>(new Set());
  const { t } = useLexicon();
  const detectGameVersion = useStore((state) => state.detectGameVersion);
  const { fetchBackups, restoreGameBackup, deleteBackup, triggerFullEngineBackup, triggerPrePatchSnapshot } = useBackupLogic(() => detectGameVersion());
  const [subtitleIndex, setSubtitleIndex] = useState(Math.floor(Math.random() * 12) + 1);

  useEffect(() => {
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
      alias: alias || t("vlocal") || "Unknown",
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
  const [metaAllowWriteInput, setMetaAllowWriteInput] = useState(false);
  const playSets = useStore((state) => state.playSets);
  const setPlaySets = useStore((state) => state.setPlaySets);
  const activeSetName = useStore((state) => state.activeSetName);
  const setActiveSetName = useStore((state) => state.setActiveSetName);
  const status = useStore((state) => state.status);
  const statusLog = useStore((state) => state.statusLog);
  const setStatus = useStore((state) => state.setStatus);
  const clearStatusLog = useStore((state) => state.clearStatusLog);
  const session = useStore((state) => state.session);

  const modList = useStore((state) => state.modList);
  const setModList = useStore((state) => state.setModList);
  const activeGameSchema = useStore((state) => state.activeGameSchema);

  useEffect(() => {
    if (activeGameSchema) {
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
        const update = await check();
        if (update) {
          setUpdatePayload(update);
        }
      } catch (e) {
      }
    }
    checkForUpdates();

    let isProcessingDrop = false;
    let localIsDragging = false;
    const unlistenPromise = getCurrentWebview().onDragDropEvent((event) => {
      if (isProcessingDrop) return;

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
        const paths = event.payload.paths;
        if (paths && paths.length > 0) {
          isProcessingDrop = true;
          useModalStore.getState().setDroppedFiles(paths);
          setIsDropzoneOpen(true);
          setDropzoneState("ingesting");
          setIngestProgress({ active: true, current: 0, total: paths.length });
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setTimeout(async () => {
                const startTime = Date.now();
                const hasMalware = await handleDroppedFiles(paths);

                const elapsed = Date.now() - startTime;
                if (elapsed < 1500) {
                  await new Promise(r => setTimeout(r, 1500 - elapsed));
                }

                isProcessingDrop = false;
                setIsDropzoneOpen(false);
                setDropzoneState("awaiting");

                if (!hasMalware) {
                  setTimeout(() => {
                    useModalStore.getState().setDroppedFiles([]);
                  }, 0);
                }

                setIngestProgress({ active: false, current: 0, total: 0 });
              }, 50);
            });
          });
        }
      }
    });

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
      unlistenPromise.then((unlisten) => unlisten());
      window.removeEventListener("mousemove", handleCancelDrag);
      window.removeEventListener("mousedown", handleCancelDrag);
      window.removeEventListener("keydown", handleCancelDrag);
      window.removeEventListener("keydown", handleNativeSearch, { capture: true });
    };
  }, []);

  const view = useStore((state) => state.view);
  const setView = useStore((state) => state.setView);

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
  const scanProgress = useStore((state) => state.scanProgress);
  const setScanProgress = useStore((state) => state.setScanProgress);
  const backupList = useStore((state) => state.backupList);
  const setBackupList = useStore((state) => state.setBackupList);
  const [isNotificationSidebarOpen, setIsNotificationSidebarOpen] = useState(false);
  const [globalViewingPost, setGlobalViewingPost] = useState<any>(null);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
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
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [cloudSearchResults, setCloudSearchResults] = useState<any[]>([]);
  const [isSearchingCloud, setIsSearchingCloud] = useState(false);
  const [isDraftingSet, setIsDraftingSet] = useState(false);
  const [draftSetName, setDraftSetName] = useState("");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isBugModalOpen, setIsBugModalOpen] = useState(false);
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);

  const [isCitizenTicketsOpen, setIsCitizenTicketsOpen] = useState(false);

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-width', isSidebarCollapsed ? '80px' : 'var(--sidebarWidth, 288px)');
  }, [isSidebarCollapsed]);

  useEffect(() => {
    const handleOpenSupport = () => {
      setIsSupportModalOpen(true);
    };
    document.addEventListener("open-support-modal", handleOpenSupport);
    return () => document.removeEventListener("open-support-modal", handleOpenSupport);
  }, []);

  const selectedVersion = useStore((state) => state.selectedVersion);
  const setSelectedVersion = useStore((state) => state.setSelectedVersion);


  const [metaVersionInput, setMetaVersionInput] = useState("");
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
    if (!session?.user?.id) return;
    const fetchUnread = async () => {
      if (!navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true") return;
      const { data } = await supabase
        .from('notifications')
        .select('is_read')
        .eq('user_id', session.user.id);

      if (data) {
        const unreadCount = data.filter(n => !n.is_read).length;
        setUnreadNotificationCount(unreadCount);
      }
    };
    fetchUnread();

    let channel: any = null;
    let interval: any = null;

    const setupNetworkFeatures = () => {
      if (navigator.onLine && localStorage.getItem("sanctuary_local_only") !== "true") {
        if (!channel) {
          channel = supabase.channel('notifs')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${session.user.id}` }, () => {
              fetchUnread();
            })
            .subscribe();
        }
        if (!interval) {
          interval = setInterval(fetchUnread, 30000);
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
      if (channel) supabase.removeChannel(channel);
      window.removeEventListener('refresh_notifications', fetchUnread);
      window.removeEventListener('online', handleOnline);
    };
  }, [session?.user?.id]);

  const saveLocalMetadata = async (extraOverrides?: any) => {
    if (!activeDossier) return;
    setStatus(t("status_syncing_metadata"));
    try {
      const localOvr = JSON.parse(localStorage.getItem("sanctuary_local_overrides") || "{}");
      if (activeDossier.hash) {
        const overrides = {
          displayName: metaNameInput.trim(),
          author: metaAuthorInput.trim() || undefined,
          image_url: metaImageInput.trim() === "" ? "" : metaImageInput.trim(),
          imageUrl: metaImageInput.trim() === "" ? "" : metaImageInput.trim(),
          url: metaUrlInput?.trim() || undefined,
          version: metaVersionInput?.trim() || undefined,
          description: metaDescInput?.trim() || undefined,
          allow_write: metaAllowWriteInput || false,
          ...(extraOverrides || {})
        };
        localOvr[activeDossier.hash] = overrides;
        localStorage.setItem("sanctuary_local_overrides", JSON.stringify(localOvr));

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
      if (activeDossier.hash && localOvr[activeDossier.hash]) {
        delete localOvr[activeDossier.hash];
        localStorage.setItem("sanctuary_local_overrides", JSON.stringify(localOvr));

        const originalMod = modList.find((m: any) => m.hash === activeDossier.hash && !m.isLocalOverride) ||
          modList.find((m: any) => m.hash === activeDossier.hash);

        if (originalMod) {
          setActiveDossier(originalMod);

          setMetaNameInput(originalMod.displayName || originalMod.name || "");
          setMetaAuthorInput(originalMod.author || "");
          setMetaUrlInput(originalMod.url || "");
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
  useEffect(() => {
    let unlisten: any;
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

    let unlistenMalware: () => void;
    let isMounted = true;
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
      invoke("save_master_cache", {
        vaultPath,
        content: JSON.stringify(modList),
      }).catch((e) => console.error("Cache Save Failed", e));
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

  useEffect(() => {
    const bootDLCProtocol = async () => {
      try {
        await loadDLCMap();
        const config: any = await invoke("get_saved_coordinates");
        const globalConfig: any = await invoke("get_global_config");
        
        // Wait for schema sync before letting the app render!
        const activeWorkspace = (globalConfig.workspaces || []).find((w: any) => w.id === globalConfig.active_workspace_id);
        const schemaId = activeWorkspace?.schema_id || 'sims4';
        await syncMasterSchemas(schemaId);

        if (globalConfig.active_workspace_id) {
          useStore.getState().hydrateWorkspaceState(globalConfig.active_workspace_id);
        }

        useStore.setState({ 
          workspaces: globalConfig.workspaces || [], 
          activeWorkspaceId: globalConfig.active_workspace_id,
          isGlobalConfigLoaded: true 
        });

        if (globalConfig.active_workspace_id) {
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
    const unlisten = listen("vault_changed", () => fetchBackups());
    const handleRefresh = () => runRadarSweep(true);
    window.addEventListener("refreshVault", handleRefresh);
    return () => {
      unlisten.then((f) => f());
      window.removeEventListener("refreshVault", handleRefresh);
    };
  }, []);
  useEffect(() => {
    let unlisten: any;
    listen("scan-progress", (event: any) =>
      setScanProgress(event.payload),
    ).then((handler) => {
      unlisten = handler;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, []);
  useEffect(() => {
    let unlisten: any;
    listen("backup-progress", (event: any) =>
      setBackupProgress(event.payload),
    ).then((handler) => {
      unlisten = handler;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, []);
  useEffect(() => {
    fetchBackups();
  }, []);
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
    const cache = localStorage.getItem("sanctuary_cache_v9");
    if (cache) {
      try {
        const parsedCache = JSON.parse(cache);
        if (Array.isArray(parsedCache) && parsedCache.length > 0) {
          setModList(parsedCache);
          setStatus(
            `${t("status_offline_cache_prefix")} ${parsedCache.length} ${t("status_offline_cache_suffix")}`,
          );
        }
      } catch (e) {
        console.error("Failed to load cache", e);
        localStorage.removeItem("sanctuary_cache_v9");
      }
    }

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
      }, 2000);
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
      }, 2500);
    }
  }, []);
  const { toggleInActiveSet, deletePlaySet, renamePlaySet, importPlaySet, finalizeImport, equipPlaySet } = usePlaySetLogic();
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
      if (!navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true") return;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        let isGlobalDev = false;
        try {
          const { data: osData, error: osError } = await supabaseAuth
            .from("profiles")
            .select("role")
            .eq("id", session.user.id)
            .maybeSingle();
            
          if (!osError && osData && (osData.role?.toLowerCase() === "dev" || osData.role?.toLowerCase() === "admin")) {
            isGlobalDev = true;
            setUserRole("admin"); 
          }
        } catch (e) { console.error(e); }

        if (!isGlobalDev) {
          try {
            const gameClient = getActiveGameClient();
            const { data: gameData, error: gameError } = await gameClient
              .from("profiles")
              .select("role")
              .eq("id", session.user.id)
              .maybeSingle();

            if (!gameError && gameData && gameData.role) {
              setUserRole(gameData.role.toLowerCase());
            } else {
              setUserRole("citizen");
            }
          } catch (e) {
            console.error("Game profile fetch failed", e);
            setUserRole("citizen");
          }
        }
        }
      }
    const handleOnlineRoleFetch = () => {
      if (localStorage.getItem("sanctuary_local_only") !== "true") {
        window.location.reload();
      }
    };

    window.addEventListener('online', handleOnlineRoleFetch);

    async function boot() {
      try {
        localStorage.removeItem("sanctuary_cloud_cache");
        const config: any = await invoke("get_saved_coordinates");
        if (config.live_path && config.mods_path && config.vault_path) {
          setIsConfigured(true);
          setLivePath(config.live_path);
          setModsPath(config.mods_path);
          setVaultPath(config.vault_path);
          
          invoke<string>("load_master_cache", { vaultPath: config.vault_path })
            .then((cacheStr) => {
              try {
                const parsed = JSON.parse(cacheStr);
                if (Array.isArray(parsed) && parsed.length > 0) {
                  setModList(parsed);
                  setStatus(
                    `${t("status_offline_cache_prefix")} ${parsed.length} ${t("status_offline_cache_suffix")}`,
                  );
                }
              } catch (e) {
                console.error("Cache Load Error", e);
              }
              runRadarSweep(false);
            })
            .catch(() => runRadarSweep(false));
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
    fetchUserRole();
    boot();
    return () => { window.removeEventListener('online', handleOnlineRoleFetch); };
  }, []);


  async function checkNetworkUpdates(currentModList: ModData[]) {
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

      if (hasError && cloudData.length === 0) {
        console.warn("Network check encountered errors and returned no data. Aborting to prevent wiping cached updates.");
        return;
      }

      let debugLog = "";
      cloudData.forEach((cloudMod) => {
        const localMod = syncedMods.find((m) => String(m.dbId) === String(cloudMod.id) || m.name === cloudMod.name);
        if (!localMod) return;
        if (cloudMod.status === "broken") broken.push(localMod);
        else if (cloudMod.status === "obsolete") obsolete.push(localMod);
        else {
          const latestData =
            cloudMod.mod_versions && cloudMod.mod_versions.length > 0
              ? cloudMod.mod_versions[0]
              : null;

          if (!latestData) return;

          const hashMismatch = localMod.hash && latestData.dna_hash && localMod.hash.toLowerCase() !== latestData.dna_hash.toLowerCase();
          const versionMismatch = localMod.version && localMod.version !== latestData.version_label && localMod.version !== "v.Local";

          debugLog += `Mod: ${localMod.name} | localHash: ${localMod.hash} | cloudHash: ${latestData.dna_hash} | hashMismatch: ${hashMismatch}\n`;

          if (hashMismatch || versionMismatch) {
            updated.push({
              ...localMod,
              newVersion: latestData.version_label,
              newGameVersion: latestData.game_version,
              download_url: latestData.download_url
            });
          }
        }
      });

      try {
        localStorage.setItem("network_updates_debug", debugLog);
      } catch (e) { }
      setNetworkUpdates({ broken, obsolete, updated });
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
              name: localA?.name || t("vlocal") || "Unknown",
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
              name: localB?.name || t("vlocal") || "Unknown",
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
        `${t("status_cloud_rejection")}${err.message || t("status_unknown_db_failure") || "Unknown Database Failure"}`,
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
    const updatedSets = [...playSets, { name: setName, mods: [] }];
    setPlaySets(updatedSets);
    localStorage.setItem(`sanctuary_${useStore.getState().activeWorkspaceId || "default"}_playsets`, JSON.stringify(updatedSets));
    setActivePlaySetIndex(updatedSets.length - 1);
    setStatus(
      `${t("status_blueprint_created_prefix")}${setName}${t("status_blueprint_drafted_suffix")}`,
    );
    setIsDraftingSet(false);
    setDraftSetName("");
  }
  const displayModList = modList;




  const { handleQuickLaunch } = useLaunchLogic(askCustom, triggerPrePatchSnapshot);

  useDefconRadar(t, askCustom, triggerPrePatchSnapshot, triggerFullEngineBackup);

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
      await invoke("clear_old_logs", { docsPath: dPath });
      setStatus(t("status_igniting"));
      await invoke("launch_game", { livePath: config.live_path, modsPath: config.mods_path });
      setTestErrorFound(false);
      setTestLogSnippet("");
      const interval = setInterval(async () => {
        const res = await invoke<string>("scan_game_logs", { docsPath: dPath });
        if (res !== "Clean") {
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
  async function submitLabReport() {
    if (!session) {
      alert(t("alert_guest_mode_uploads"));
      return;
    }
    if (!activeLabMod) return;
    if (activeLabMod.compliance_tier === 1 || activeLabMod.compliance_tier === 2) {
      alert(t("alert_nsfw_no_lab_reports"));
      return;
    }
    setIsSubmittingReport(true);
    setStatus(t("status_submitting_report"));
    try {
      const { data: verData } = await supabase
        .from("mod_versions")
        .select("id, mod_id")
        .eq("dna_hash", activeLabMod.hash)
        .single();
      if (!verData) throw new Error(t("status_missing_mod_msg"));
      const { error } = await supabase.from("homestead_lab_logs").insert([
        {
          mod_id: verData.mod_id,
          version_id: verData.id,
          log_snippet: testLogSnippet,
          tester_note: t("status_report_automated"),
        },
      ]);
      if (error) throw error;
      setStatus(t("status_report_secured"));
    } catch (err: any) {
      setStatus(`${t("status_report_failed")}${err.message}`);
    }
    setIsSubmittingReport(false);
  }
  async function concludeTest(labContext?: any) {
    if (!activeLabMod) return;
    setStatus(t("status_evaluating"));
    if (logWatcher) {
      clearInterval(logWatcher);
      setLogWatcher(null);
    }
    try {
      const config: any = await invoke("get_saved_coordinates");
      const dPath = config.mods_path.split(/[\\/]Mods/i)[0];
      await invoke("airgap_saves", { docsPath: dPath, enable: false });
    } catch(e) {}
    try {
      const finalStatus = testErrorFound ? "broken" : "verified";
      const uiStatus = testErrorFound
        ? t("status_broken")
        : t("verified");
      const uiColor = testErrorFound ? "var(--danger)" : "var(--success)";
      const { data: verData } = await supabase
        .from("mod_versions")
        .select("id, mod_id")
        .eq("dna_hash", activeLabMod.hash)
        .single();
      if (verData) {
        await supabase
          .from("mods")
          .update({ status: finalStatus })
          .eq("id", verData.mod_id);

        if (testErrorFound) {
          await supabase.from("homestead_lab_logs").insert([{
            mod_id: verData.mod_id,
            version_id: verData.id,
            log_snippet: testLogSnippet,
            tester_note: labContext ? JSON.stringify(labContext) : t("status_report_automated"),
          }]);
        }
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
      setLabQueue((prev) => prev.filter((m) => m.hash !== activeLabMod.hash));
      setModList((prev) =>
        prev.map((m) =>
          m.hash === activeLabMod.hash
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
    } catch (err: any) {
      setStatus(`${t("status_teardown_error")}${err.message}`);
    }
  }
  const fetchLabAssociated = async (mod: ModData) => {
    setIsLoadingAssociated(true);
    try {
      let modId = mod.dbId;
      if (!modId) {
        const { data: verData } = await supabase
          .from("mod_versions")
          .select("mod_id")
          .eq("dna_hash", mod.hash)
          .single();
        modId = verData?.mod_id;
      }
      if (!modId) {
        const cleanMod = (mod.name || "").split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), '');
        const { data: modInDb } = await supabase
          .from("mods")
          .select("id")
          .ilike("name", cleanMod || "")
          .maybeSingle();
        modId = modInDb?.id;
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
          const { data: addonParents } = await supabase
            .from("mod_relationships")
            .select("parent_id")
            .eq("child_id", modInDb.id)
            .eq("relationship_type", "addon");

          const relatedIds = [
            ...(deps?.map((d) => String(d.parent_id)) || []),
            ...(twins?.map((t) => String(t.child_id)) || []),
            ...(addonParents?.map((a) => String(a.parent_id)) || []),
          ];
          if (relatedIds.length > 0) {
            const { data: relatedMods } = await supabase
              .from("mods")
              .select("name, master_author")
              .in("id", relatedIds);
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
  const runProvingRun = async (extraDeployNames: string[] = []) => {
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

      const deployMods = Array.from(rawDeploySet).map((modName: string) => {
        const modObj = modList.find((m: any) => {
          if (m.isVirtual) return false;
          if (m.name === modName || m.displayName === modName) return true;
          const mBase = m.name.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), '').toLowerCase();
          const targetBase = modName.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), '').toLowerCase();
          return mBase && targetBase && mBase === targetBase;
        });
        return { path: modObj ? modObj.name : modName, allow_write: true };
      });

      await invoke("deploy_playset_bulk", {
        mods: deployMods,
        modsPath: config.mods_path,
        vaultPath: config.vault_path,
      });

      setShelterActive(true);
      fetchVault();

      const dPath = config.mods_path.split(/[\\/]Mods/i)[0];
      setStatus(t("status_purging_logs"));
      await invoke("airgap_saves", { docsPath: dPath, enable: true });
      await invoke("clear_old_logs", { docsPath: dPath });

      setStatus(t("status_igniting"));
      await invoke("launch_game", { livePath: config.live_path, modsPath: config.mods_path });

      setTestErrorFound(false);
      setTestLogSnippet("");
      const interval = setInterval(async () => {
        const res = await invoke<string>("scan_game_logs", { docsPath: dPath });
        if (res !== "Clean") {
          setTestErrorFound(true);
          setTestLogSnippet(res);
          setStatus(`${t("status_fatal_error")} ${res.substring(0, 50)}...`);
          clearInterval(interval);
          setLogWatcher(null);
          await invoke("airgap_saves", { docsPath: dPath, enable: false });
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
  if (!isConfigured) return <WorkspaceLanding />;
  if (!isGlobalConfigLoaded) return (
    <div className="flex h-screen w-screen items-center justify-center text-[var(--text)] font-black uppercase tracking-widest text-xs" style={{ background: "var(--bgGradient)" } as any}>
      <span className="material-symbols-outlined animate-spin mr-2">sync</span>
      {t("status_syncing") || "SYNCING SYSTEM..."}
    </div>
  );

  return (
    <div
      className="flex flex-col h-screen w-screen overflow-hidden"
      style={{ background: "var(--bgGradient)", color: "var(--text)" } as React.CSSProperties}
    >
      <TitleBar
        isSidebarCollapsed={isSidebarCollapsed}
        setIsSidebarCollapsed={setIsSidebarCollapsed}
        subtitleIndex={subtitleIndex}
      />

      <div className="flex-1 flex flex-row min-h-0 relative">
        <Sidebar
          isSidebarCollapsed={isSidebarCollapsed}
          setIsSidebarCollapsed={setIsSidebarCollapsed}
          subtitleIndex={subtitleIndex}
          isNotificationSidebarOpen={isNotificationSidebarOpen}
          setIsNotificationSidebarOpen={setIsNotificationSidebarOpen}
          unreadNotificationCount={unreadNotificationCount}
          handleQuickLaunch={handleQuickLaunch}
        />
        <main className="flex-1 relative overflow-y-auto p-12 pt-[90px] custom-scrollbar">
          <div className="relative z-10 w-full h-full pb-[40px]">
            {(view === "dashboard" || view === "BlueprintArchitect") && (
              <ErrorBoundary moduleName="Command Center">
                <CommandCenter
                  status={status}
                  isScanning={isScanning}
                  runRadarSweep={runRadarSweep}
                  scanProgress={scanProgress}
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
                  setIsSupportDeskOpen={setIsSupportModalOpen}

                  setIsCitizenTicketsOpen={setIsCitizenTicketsOpen}
                />
              </ErrorBoundary>
            )}

            {view === "nexus" && (
              <Nexus
                ownedHashes={modList.map((m) => m.hash).filter((h) => !!h)}
                onSetStatus={setStatus}
                onOpenMasonProfile={handleOpenMasonProfile}
                onOpenDossier={setActiveDossier}
              />
            )}
            {view === "vault" && (
              <ErrorBoundary moduleName="Vault">
                <Vault
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
                />
              </ErrorBoundary>
            )}
            {view === "GlobalFeed" && (
              <ErrorBoundary moduleName="Global Feed">
                <GlobalFeed
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
                />
              </ErrorBoundary>
            )}
            {view === "lab" && (
              <ErrorBoundary moduleName="Homestead Lab">
                <Lab
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
              ["mason", "wayfinder", "admin"].includes(userRole) && <MasonHub sandboxMod={activeSandboxMod} clearSandboxMod={() => setActiveSandboxMod(null)} vaultPath={vaultPath} handleOpenMasonProfile={handleOpenMasonProfile} />}
            {view === "ArchitectHub" &&
              ["architect", "oversight", "wayfinder", "admin"].includes(
                userRole,
              ) && (
                <ErrorBoundary moduleName="Architect Hub">
                  <ArchitectHub userRole={userRole} equipPlaySet={equipPlaySet} modList={modList} setStatus={setStatus} />
                </ErrorBoundary>
              )}
            {view === "Oversight" &&
              ["oversight", "wayfinder", "admin"].includes(userRole) && (
                <ErrorBoundary moduleName="Oversight">
                  <Oversight />
                </ErrorBoundary>
              )}
            {view === "WayfinderHub" &&
              ["wayfinder", "admin"].includes(userRole) && (
                <ErrorBoundary moduleName="Wayfinder Hub">
                  <WayfinderHub onOpenMasonProfile={handleOpenMasonProfile} />
                </ErrorBoundary>
              )}
            {view === "KeepersCore" &&
              ["core_dev", "admin"].includes(userRole) && (
                <ErrorBoundary moduleName="Keepers Core">
                  <KeepersCore />
                </ErrorBoundary>
              )}
            {view === "DbpfScout" && <DbpfScout />}
            {view === "CitizensWorkbench" && <CitizensWorkbench onOpenMasonProfile={handleOpenMasonProfile} />}
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
                image: metaImageInput,
                desc: metaDescInput,
                statusMsg: metaStatusMsgInput,
                status: metaStatusInput,
                version: metaVersionInput,
                requiredDLC: metaRequiredDLC,
                allow_write: metaAllowWriteInput,
              }}
              setMetaInputs={{
                name: setMetaNameInput,
                author: setMetaAuthorInput,
                url: setMetaUrlInput,
                image: setMetaImageInput,
                desc: setMetaDescInput,
                statusMsg: setMetaStatusMsgInput,
                status: setMetaStatusInput,
                version: setMetaVersionInput,
                requiredDLC: setMetaRequiredDLC,
                allow_write: setMetaAllowWriteInput,
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
            setActiveDossier(mod);
            setIsEditingMeta(true);
            setEditMode(true);
            setIsCorrectingMeta(true);
          }}
          isBackingUp={isBackingUp}
          isRestoring={isRestoring}
          ingestProgress={ingestProgress}
          isScanning={isScanning}
          scanProgress={scanProgress}
          status={status}
          showDefconAlert={showDefconAlert}
          setShowDefconAlert={setShowDefconAlert}
          triggerFullEngineBackup={triggerFullEngineBackup}
          triggerPrePatchSnapshot={triggerPrePatchSnapshot}
          yeetConfirmPending={yeetConfirmPending}
          setYeetConfirmPending={setYeetConfirmPending}
          dnaMatchQueue={dnaMatchQueue}
          setDnaMatchQueue={setDnaMatchQueue}
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
        <SupportDeskSidePanel isOpen={isSupportModalOpen} onClose={() => setIsSupportModalOpen(false)} />

        <CitizenTicketsSidePanel isOpen={isCitizenTicketsOpen} onClose={() => setIsCitizenTicketsOpen(false)} userId={session?.user?.id} />
        <UpdateSidePanel />
        <ContextMenu />
      </div>
    </div>
  );
}
export default App;
