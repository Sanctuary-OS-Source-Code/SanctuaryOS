import { YeetConfirmAlert } from "./YeetConfirmAlert";
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
import { useCloudService } from "./hooks/useCloudService";
import { useStore } from "./store";
import { useGlobalListeners } from "./hooks/useGlobalListeners";
import { open, save } from "@tauri-apps/plugin-dialog";
import { supabase } from "./supabase";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import ArchitectHub from "./ArchitectHub";
import GlobalFeed from "./GlobalFeed";
import Settings from "./SettingsTab";
import { ModData, ViewHeader, deriveHumanReadableVersion, isVersionMatch, loadDLCMap } from "./shared";
import { ModCard } from "./ModCard";
import ModDossier from "./ModDossier";
import BlueprintArchitect from "./BlueprintArchitect";
import Marketplace from "./Marketplace";
import { DbpfScout } from "./DbpfScout";
import { useLexicon } from "./LexiconContext";
import NotificationSidebar from "./NotificationSidebar";
import SupportDeskSidePanel from "./SupportDeskSidePanel";

import CitizenTicketsSidePanel from "./CitizenTicketsSidePanel";
import MasonHub from "./MasonHub";
import MasonProfile from "./MasonProfile";
import MasonPostViewer from "./MasonPostViewer";
import CommandCenter from "./CommandCenter";
import Blueprints from "./Blueprints";
import Collection from "./Collection";
import Lab from "./Lab";
import TimeCapsule from "./TimeCapsule";
import SeniorArchitect from "./SeniorArchitect";
import WayfinderHub from "./WayfinderHub";
import { UpdateSidePanel } from "./UpdateSidePanel";
import CitizensWorkbench from "./CitizensWorkbench";

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
  const [subtitleIndex, setSubtitleIndex] = useState(Math.floor(Math.random() * 10) + 1);

  useEffect(() => {
    const interval = setInterval(() => {
      setSubtitleIndex(Math.floor(Math.random() * 10) + 1);
    }, 15000); // Rotate subtitle every 15 seconds
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
      alias: alias || t("backups_unknown") || "Unknown",
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

  const [forceSweepCounter, setForceSweepCounter] = useState(0);


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
        // console.error("Update check failed", e);
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
          // Give React two animation frames to paint the INGESTING UI before we block IPC
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setTimeout(async () => {
                 const startTime = Date.now();
                 const hasMalware = await handleDroppedFiles(paths);
                 
                 // Enforce minimum 1.5s loading screen so it doesn't just flash instantly
                 const elapsed = Date.now() - startTime;
                 if (elapsed < 1500) {
                   await new Promise(r => setTimeout(r, 1500 - elapsed));
                 }
                 
                 isProcessingDrop = false;
                 setIsDropzoneOpen(false);
                 setDropzoneState("awaiting");
                 
                 // We don't want to clear dropped files if there's a malware alert
                 // because the malware alert needs the original dropped path to shred it.
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

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
      window.removeEventListener("mousemove", handleCancelDrag);
      window.removeEventListener("mousedown", handleCancelDrag);
      window.removeEventListener("keydown", handleCancelDrag);
    };
  }, []);
  const handleDroppedFiles = async (paths: string[]): Promise<boolean> => {
    setDropzoneState("ingesting");
    setStatus(
      `${t("status_mass_ingestion_prefix")}${paths.length}${t("status_mass_ingestion_suffix")}`,
    );
    let hasMalware = false;
    try {
      let needsSweep = false;
      for (let i = 0; i < paths.length; i++) {
        setIngestProgress({ active: true, current: i + 1, total: paths.length });
        try {
          await invoke("ingest_dropped_file", { path: paths[i], forceReplace: false });
          needsSweep = true;
        } catch (err) {
          if (err === "DNA_MATCH") {
            // Conflict detected. Do nothing, event handles it
          } else if (err === "MALWARE") {
            hasMalware = true;
          } else {
            setStatus(`${t("status_link_failed")}${err}`);
          }
        }
      }
      setStatus(t("status_ingest_success"));
      if (needsSweep) {
        runRadarSweep(true, true); 
      }
      return hasMalware;
    } catch (err) {
      setStatus(`${t("status_link_failed")}${err}`);
      return hasMalware;
    }
  }
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
  const [searchQuery, setSearchQuery] = useState("");
  const [isNotificationSidebarOpen, setIsNotificationSidebarOpen] = useState(false);
  const [globalViewingPost, setGlobalViewingPost] = useState<any>(null);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [equipFilter, setEquipFilter] = useState("ALL");
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
    document.documentElement.style.setProperty('--sidebar-width', isSidebarCollapsed ? '80px' : '288px');
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

  const [activeCategory, setActiveCategory] = useState("ALL");
  const [activeSubType, setActiveSubType] = useState("ALL");
  const [expandedFolder, setExpandedFolder] = useState<string | null>(null);

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
    
    const channel = supabase.channel('notifs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${session.user.id}` }, () => {
         fetchUnread();
      })
      .subscribe();
      
    window.addEventListener('refresh_notifications', fetchUnread);
    const interval = setInterval(fetchUnread, 30000);
      
    return () => { 
      clearInterval(interval);
      supabase.removeChannel(channel); 
      window.removeEventListener('refresh_notifications', fetchUnread);
    };
  }, [session?.user?.id]);

  const saveLocalMetadata = async (extraOverrides?: any) => {
    if (!activeDossier) return;
    setStatus(t("status_syncing_metadata"));
    try {
      const localOvr = JSON.parse(localStorage.getItem("sanctuary_local_overrides") || "{}");
      if (activeDossier.hash) {
        // Only store fields if they differ or are explicitly set
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
        
        // Optimistic UI update instead of full radar sweep lag
        setModList((prevList: any[]) => prevList.map(m => {
          if (m.hash === activeDossier.hash) return { ...m, ...overrides, isLocalOverride: true };
          if (m.flavors) {
             const updatedFlavors = m.flavors.map((f: any) => f.hash === activeDossier.hash ? { ...f, ...overrides, isLocalOverride: true } : f);
             return { ...m, flavors: updatedFlavors };
          }
          return m;
        }));
      }
      
      setStatus(`${t("ui_icon_success")} Local overrides saved successfully.`);
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
        
        // Find the original database or file system mod to restore
        const originalMod = modList.find((m: any) => m.hash === activeDossier.hash && !m.isLocalOverride) ||
                            modList.find((m: any) => m.hash === activeDossier.hash);
                            
        if (originalMod) {
          setActiveDossier(originalMod);
          
          // Reset inputs
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
      
      setStatus(`${t("ui_icon_success")} Local overrides reset to database defaults.`);
      setIsEditingMeta(false);
      setEditMode(false);
      setIsCorrectingMeta(false);
      runRadarSweep(true);
    } catch (err: any) {
      console.error(err);
      setStatus(`Error: ${err.message || err}`);
    }
  };


  const handleUpdateMod = (mod: any) => {};

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
  const [malwareAlert, setMalwareAlert] = useState<any[]>([]);
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
      console.log("[DNA_MATCH] Received event:", event);
      const { hash, path } = event.payload;
      if (hash && ignoredHashesRef.current.has(hash)) {
        console.log("[DNA_MATCH] Ignored due to hash");
        return;
      }
      if (!hash && ignoredHashesRef.current.has(path)) {
        console.log("[DNA_MATCH] Ignored due to path");
        return;
      }
      setDnaMatchQueue((prev: any[]) => {
        const isDuplicate = prev.some((m) => (hash ? m.hash === hash : m.path === path));
        console.log("[DNA_MATCH] Updating queue. Is duplicate:", isDuplicate, "Current length:", prev.length);
        if (isDuplicate) return prev;
        return [...prev, event.payload];
      });
    }).then((handler) => { unlisten = handler; });
    
    let unlistenMalware: () => void;
    let isMounted = true;
    listen("malware_detected", async (event: any) => {
      const origPath = event.payload.original_path || event.payload.path || '';
      const debounceKey = `${event.payload.hash}-${origPath}`;
      if (!event.payload.hash || insertingHashes.current.has(debounceKey)) return;
      insertingHashes.current.add(debounceKey);
      setTimeout(() => insertingHashes.current.delete(debounceKey), 2000);

      if (localStorage.getItem("sanctuary_share_malware_reports") === "true") {
        try {
          const { data: session } = await supabase.auth.getSession();
          const citizen_id = session?.session?.user?.id || null;
          
          const { data: existing } = await supabase.from('malware_reports')
            .select('id')
            .eq('detected_hash', event.payload.hash)
            .eq('original_path', event.payload.original_path || event.payload.path || '')
            .eq('citizen_id', citizen_id)
            .maybeSingle();

          if (!existing) {
            const { error } = await supabase.from('malware_reports').insert({
              artifact_name: event.payload.displayName || event.payload.name || event.payload.filename || 'Unknown',
              detected_hash: event.payload.hash || 'unknown-hash',
              signature: event.payload.matched_signature || 'Malware DNA Match',
              status: 'pending',
              citizen_id,
              original_exists: event.payload.original_exists,
              original_shredded: event.payload.original_shredded,
              original_path: origPath,
              quarantine_path: event.payload.quarantine_path
            });
            if (error) console.error("Malware Report Insert Error (listen):", error);
          }
        } catch(e) {
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
      } catch (err) {
        console.error("DLC Protocol Sync Failed:", err);
      }
    };
    bootDLCProtocol();
  }, []);
  const detectGameVersion = async () => {
    if (!isConfigured) return;
    try {
      const config: any = await invoke("get_saved_coordinates");
      if (!config.live_path) return;
      
      const rawRipped = await invoke<string>("rip_game_version", {
        livePath: config.live_path,
      });
      const cleanVersion = rawRipped.replace(/[^0-9.]/g, "");
      setSelectedVersion(cleanVersion);
      setStatus(`${t("status_standing_by")} |  v${cleanVersion}`);
    } catch (err) {
      console.warn("Version detection failed:", err);
    }
  };

  useEffect(() => {
    detectGameVersion();
  }, [isConfigured]);
  useEffect(() => {
    if (view === "lab") {
      const fetchLabQueue = async () => {
        const { data } = await supabase
          .from("solder_lab_logs")
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
    
    // Check for cached unsaved edits
    let editNames: string[] = [];
    const cwEdits = localStorage.getItem("sanctuary_cw_unsaved_edits");
    if (cwEdits) {
      try {
        const parsed = JSON.parse(cwEdits);
        Object.keys(parsed).forEach(k => {
          if (Object.keys(parsed[k]).length > 0) {
             const name = k.split(/[\\/]/).pop();
             if (name && !editNames.includes(name)) editNames.push(name);
          }
        });
      } catch (e) {}
    }

    const ideEdits = localStorage.getItem("sanctuary_ide_open_files");
    if (ideEdits) {
      try {
        const parsed = JSON.parse(ideEdits);
        if (Array.isArray(parsed)) {
           parsed.forEach((f: any) => {
              if (f.content !== f.originalContent && !editNames.includes(f.name)) {
                 editNames.push(f.name);
              }
           });
        }
      } catch(e) {}
    }

    if (editNames.length > 0) {
       setTimeout(() => {
         if (editNames.length === 1) {
            useStore.getState().setStatus(`${editNames[0]} has cached changes from your last session.`);
         } else if (editNames.length <= 3) {
            useStore.getState().setStatus(`${editNames.join(", ")} have cached changes from your last session.`);
         } else {
            useStore.getState().setStatus(`${editNames.slice(0, 2).join(", ")} and ${editNames.length - 2} other files have cached changes from your last session.`);
         }
       }, 2000); // Small delay so it appears after the cache load message
    }
  }, []);


  const toggleInActiveSet = (targetName: string, excludeBroken: boolean = true, forceRemove: boolean = false, forceActive: boolean = false) => {
    setPlaySets((prevSets) => {
      const currentSet = prevSets[activePlaySetIndex];
      if (!currentSet) return prevSets;
      const currentRules = anarchyRules || {
        highlander: true,
        family: true,
        dependencies: true,
        intercept: true,
      };
      let newMods = new Set(currentSet.mods);

      const byDbId = new Map();
      const byHash = new Map();
      const byName = new Map();
      const namesAndDisplayNames: { name: string, displayNameUpper: string, displayNameSpaced: string, orig: any }[] = [];

      modList.forEach((ml: any) => {
         byName.set(ml.name, ml);
         if (!ml.isVirtual) {
            if (ml.dbId) byDbId.set(String(ml.dbId), ml);
            if (ml.hash) byHash.set(ml.hash, ml);
            const dn = ml.displayName || "";
            namesAndDisplayNames.push({
               name: ml.name || "",
               displayNameUpper: dn.toUpperCase(),
               displayNameSpaced: dn.toUpperCase().replace(/_/g, " "),
               orig: ml
            });
         }
      });
      
      const checkGhosted = (mObj: any) => {
        if (mObj.isGhosted) return true;
        let rDLC = mObj.requiredDLC || [];
        if (typeof rDLC === 'string') rDLC = rDLC.split(',').map((s: string) => s.trim()).filter(Boolean);
        if (rDLC.some((dlc: string) => {
           const baseCode = dlc.split(' ')[0].toUpperCase();
           return !ownedDLC.includes(baseCode) || maskedDLC.includes(baseCode);
        })) return true;
        if (mObj.requirements) {
           const hasMissing = mObj.requirements.some((req: any) => {
               const reqId = typeof req === 'string' ? req : req.id || req.dbId;
               const reqName = typeof req === 'string' ? req : req.name;
               const reqBaseName = reqName?.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, "").toUpperCase();
               const isReqNumeric = !isNaN(Number(reqName));
               let match = null;
               if (reqId) {
                   match = byDbId.get(String(reqId)) || byHash.get(reqId);
                   if (!match) match = displayModList.find(m => m.interchangeableIds?.includes(String(reqId)));
               }
               if (!match && !isReqNumeric && reqBaseName) {
                   match = namesAndDisplayNames.find(n => n.displayNameUpper.includes(reqBaseName) || n.displayNameSpaced.includes(reqBaseName.replace(/_/g, " ")))?.orig;
               }
               return !match;
           });
           if (hasMissing) return true;
        }
        if (mObj.conflicts) {
           const hasFatal = mObj.conflicts.some((c: any) => {
              if (c.severity_rank === 4 && currentRules.intercept !== false) {
                 const matchStr = Array.from(newMods as Set<string>).find((n: string) => {
                    const mData = byName.get(n);
                    if (c.enemy_id && String(mData?.dbId) === String(c.enemy_id)) return true;
                    if (c.enemy_name) {
                       const targetClean = c.enemy_name.toUpperCase();
                       const cleanN = n.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, "").toUpperCase();
                       if (cleanN === targetClean || mData?.displayName?.toUpperCase() === targetClean) return true;
                    }
                    return false;
                 });
                 return !!matchStr;
              }
              return false;
           });
           if (hasFatal) return true;
        }
        return false;
      };

      const targetMod = byName.get(targetName) || displayModList.find((m: any) => m.name === targetName);
      if (!targetMod) {
         if (forceRemove && newMods.has(targetName)) {
            newMods.delete(targetName);
            const updatedSets = [...prevSets];
            updatedSets[activePlaySetIndex] = { ...currentSet, mods: Array.from(newMods) };
            localStorage.setItem("sanctuary_playsets", JSON.stringify(updatedSets));
            window.dispatchEvent(new Event("storage"));
            return updatedSets;
         }
         return prevSets;
      }
      const kids = targetMod.isVirtual
        ? modList.filter(
            (m) =>
              (String(m.familyId) === String(targetMod.dbId) ||
                String(m.setId) === String(targetMod.dbId)) &&
              !m.isVirtual
          )
        : [];
      const isActuallyFlavorFolder =
        targetMod.isVirtual && kids.some((k) => k.flavorGroupId != null);
      let isEquipping = targetMod.isVirtual
        ? !kids.some((k) => newMods.has(k.name))
        : !newMods.has(targetName);
      if (forceRemove) isEquipping = false;
      if (forceActive) isEquipping = true;
      const deepDelete = (nameToDelete: string) => {
        if (!newMods.has(nameToDelete)) return;
        newMods.delete(nameToDelete);
        if (currentRules.dependencies !== false) {
          const mData = byName.get(nameToDelete);
          if (mData) {
            Array.from(newMods as Set<string>).forEach((depName: string) => {
               const dep = byName.get(depName);
               if (!dep || !dep.requirements) return;
               const dependsOnDeleted = dep.requirements.some((r: any) => {
                  const reqId = typeof r === 'string' ? r : r.id || r.dbId;
                  const reqName = typeof r === 'string' ? r : r.name;
                  const reqBaseName = reqName?.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, "").toUpperCase();
                  const isReqNumeric = !isNaN(Number(reqName));
                  return (reqId && String(mData.dbId) === String(reqId)) ||
                         (reqId && mData.hash === reqId) ||
                         (!isReqNumeric && reqBaseName && mData.displayName && (mData.displayName.toUpperCase().includes(reqBaseName) || mData.displayName.toUpperCase().replace(/_/g, " ").includes(reqBaseName.replace(/_/g, " "))));
               });
               if (dependsOnDeleted) {
                  const isStillSatisfied = dep.requirements.every((r: any) => {
                      const reqId = typeof r === 'string' ? r : r.id || r.dbId;
                      const reqName = typeof r === 'string' ? r : r.name;
                      const reqBaseName = reqName?.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, "").toUpperCase();
                      const isReqNumeric = !isNaN(Number(reqName));
                      
                      return Array.from(newMods as Set<string>).some((n: string) => {
                         const equipped = byName.get(n);
                         return equipped && (
                           String(equipped.dbId) === String(reqId) ||
                           (reqId && equipped.interchangeableIds && equipped.interchangeableIds.includes(String(reqId))) ||
                           (!isReqNumeric && reqBaseName && equipped.displayName && equipped.displayName.toUpperCase().includes(reqBaseName))
                         );
                      });
                  });
                  if (!isStillSatisfied) deepDelete(depName);
               }
            });
          }
        }
      };
      const applyConflicts = (modObj: any) => {
        if (currentRules.highlander !== false) {
          Array.from(newMods as Set<string>).forEach((mName: string) => {
             const m = byName.get(mName);
             if (m && m.name !== modObj.name) {
                 const isFlavorRival = m.flavorGroupId && String(m.flavorGroupId) === String(modObj.flavorGroupId) && m.relationshipType !== "twin" && modObj.relationshipType !== "twin";
                 const isBetaRival = modObj.relationshipType !== 'beta' && m.relationshipType === 'beta' && (String(m.familyId) === String(modObj.familyId) || String(m.dbId) === String(modObj.familyId || modObj.dbId));
                 
                 if (isFlavorRival || isBetaRival) {
                     deepDelete(m.name);
                 }
             }
          });
        }
        if (modObj.conflicts && currentRules.intercept !== false) {
           modObj.conflicts.forEach((c: any) => {
              if (c.severity_rank === 4 && currentRules.intercept !== false) {
                 const matchStr = Array.from(newMods as Set<string>).find((n: string) => {
                    const mData = byName.get(n);
                    if (c.enemy_id && String(mData?.dbId) === String(c.enemy_id)) return true;
                    if (c.enemy_name) {
                       const targetClean = c.enemy_name.toUpperCase();
                       const cleanN = n.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, "").toUpperCase();
                       if (cleanN === targetClean || mData?.displayName?.toUpperCase() === targetClean) return true;
                    }
                    return false;
                 });
                 if (matchStr) {
                    deepDelete(matchStr);
                 }
              }
           });
        }
      };
      
      const addWithFamily = (modObj: any) => {
        if (!modObj || !modObj.name) return;
        if (excludeBroken && (modObj.status === t("status_broken") || modObj.status?.includes("BROKEN") || checkGhosted(modObj))) {
          setStatus(t("cmd_critical_action"));
          return;
        }
        
        newMods.add(modObj.name);
        applyConflicts(modObj);
        const anchor = modObj.familyId || modObj.dbId;
        if (anchor && currentRules.family !== false) {
          modList.forEach((m) => {
            if (
              (String(m.familyId) === String(anchor) ||
                String(m.dbId) === String(anchor)) &&
              m.name &&
              !m.isVirtual
            ) {
              const objV = modObj.version;
              const mV = m.version;
              const sharesVersion = !objV || !mV || objV === "v.Local" || mV === "v.Local" || objV === mV;
              if (!sharesVersion) return;

              const isRival =
                m.flavorGroupId &&
                String(m.flavorGroupId) === String(modObj.flavorGroupId) &&
                m.name !== modObj.name;
              if (
                !isRival &&
                (m.relationshipType === "twin" ||
                  m.relationshipType === "beta" ||
                  m.relationshipType === "core" ||
                  !m.relationshipType)
              ) {
                if (!(excludeBroken && (m.status === t("status_broken") || m.status?.includes("BROKEN") || checkGhosted(m)))) {
                  applyConflicts(m);
                  newMods.add(m.name);
                }
              }
            }
          });
        }
      };
      if (isEquipping) {
        if (targetMod.isVirtual) {
          let validKids = kids;
          if (excludeBroken) {
            validKids = kids.filter((k) => {
              if (k.status === t("status_broken") || k.status?.includes("BROKEN") || checkGhosted(k)) {
                return false;
              }
              return true;
            });
          }
          if (isActuallyFlavorFolder) {
            const coreFiles = validKids.filter((k) => k.flavorGroupId == null);
            const flavorFiles = validKids.filter((k) => k.flavorGroupId != null);
            coreFiles.forEach((k) => addWithFamily(k));
            const groups = new Map<string, any[]>();
            flavorFiles.forEach((f) => {
              const gid = String(f.flavorGroupId);
              if (!groups.has(gid)) groups.set(gid, []);
              groups.get(gid)!.push(f);
            });
            groups.forEach((groupKids) => {
              if (
                !groupKids.some((f) => newMods.has(f.name)) &&
                groupKids.length > 0
              ) {
                const sortedKids = [...groupKids].sort((a: any, b: any) => {
                  const getRank = (m: any) => {
                    if (m.relationshipType === 'core') return 1;
                    if (m.relationshipType === 'twin') return 2;
                    if (m.relationshipType === 'beta') return 3;
                    if (!m.relationshipType) return 4;
                    return 5;
                  };
                  return getRank(a) - getRank(b);
                });
                addWithFamily(sortedKids[0]);
              }
            });
          } else {
            validKids.forEach((k) => addWithFamily(k));
          }
        } else {
          addWithFamily(targetMod);
        }
        if (currentRules.dependencies !== false) {
          let checkAgain = true;
          while (checkAgain) {
            checkAgain = false;
            const snapshot = Array.from(newMods);
            for (const name of snapshot) {
              if (!newMods.has(name)) continue;
              const mData = byName.get(name as string);
              if (mData?.requirements) {
                for (const req of mData.requirements) {
                  const reqId = typeof req === 'string' ? req : req.id || req.dbId;
                  const reqName = typeof req === 'string' ? req : req.name;
                  const reqBaseName = reqName?.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, "").toUpperCase();
                  const isReqNumeric = !isNaN(Number(reqName));
                  
                  const alreadySatisfied = Array.from(newMods as Set<string>).some((n: string) => {
                    const equipped = byName.get(n);
                    return equipped && (
                      String(equipped.dbId) === String(reqId) ||
                      (reqId && equipped.interchangeableIds && equipped.interchangeableIds.includes(String(reqId))) ||
                      (!isReqNumeric && reqBaseName && equipped.displayName && equipped.displayName.toUpperCase().includes(reqBaseName))
                    );
                  });
                  if (!alreadySatisfied) {
                    let provider = null;
                    if (reqId) {
                        provider = byDbId.get(String(reqId)) || byHash.get(reqId);
                        if (!provider) provider = displayModList.find((m: any) => m.interchangeableIds?.includes(String(reqId)));
                    }
                    if (!provider && !isReqNumeric && reqBaseName) {
                        provider = namesAndDisplayNames.find(n => n.displayNameUpper.includes(reqBaseName))?.orig;
                    }
                    if (provider) {
                      const beforeSize = newMods.size;
                      addWithFamily(provider);
                      if (newMods.size > beforeSize) {
                        checkAgain = true;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      } else {
        const familyAnchor = targetMod.familyId || targetMod.dbId;
        const isMaster =
          targetMod.dbId && String(targetMod.dbId) === String(familyAnchor);
        if (
          targetMod.isVirtual ||
          (currentRules.family !== false &&
            (isMaster ||
              targetMod.relationshipType === "core"))
        ) {
          modList
            .filter(
              (m) =>
                (String(m.familyId) === String(familyAnchor) ||
                  String(m.dbId) === String(familyAnchor) ||
                  String(m.setId) === String(targetMod.dbId)) &&
                m.name &&
                !m.isVirtual,
            )
            .forEach((m) => deepDelete(m.name));
        } else {
          deepDelete(targetName);
        }
      }
      const updatedSets = [...prevSets];
      updatedSets[activePlaySetIndex] = {
        ...currentSet,
        mods: Array.from(newMods),
      };
      localStorage.setItem("sanctuary_playsets", JSON.stringify(updatedSets));
      window.dispatchEvent(new Event("storage"));
      return updatedSets;
    });
  };
  function deletePlaySet(setName: string) {
    const updatedSets = playSets.filter((s) => s.name !== setName);
    setPlaySets(updatedSets);
    localStorage.setItem("sanctuary_playsets", JSON.stringify(updatedSets));
    if (activeSetName === setName) {
      setActiveSetName(null);
      localStorage.removeItem("sanctuary_active_set");
    }
    setStatus(
      `${t("status_removed_manifest_prefix")}${setName}${t("status_removed_manifest_suffix")}`,
    );
  }
  async function fetchCloudLabQueue() {
    try {
      const { data, error } = await supabase
        .from("mod_versions")
        .select(`dna_hash, mods!inner ( name, status )`)
        .eq("mods.status", "under_review");
      if (error) throw error;
      if (data) {
        const cloudQueue = data.map((dbMod: any) => ({
          name: dbMod.mods.name,
          hash: dbMod.dna_hash,
          status: t("status_under_review"),
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
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        const { data, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", session.user.id)
          .single();
        if (!error && data) {
          setUserRole(data.role.toLowerCase());
        }
      }
    }
    async function boot() {
      try {
        localStorage.removeItem("sanctuary_cloud_cache"); // Force fetch fresh data from Supabase
        const config: any = await invoke("get_saved_coordinates");
        if (config.live_path && config.mods_path && config.vault_path) {
          setIsConfigured(true);
          setLivePath(config.live_path);
          setModsPath(config.mods_path);
          setVaultPath(config.vault_path);
          const savedSets = localStorage.getItem("sanctuary_playsets");
          const savedActive = localStorage.getItem("sanctuary_active_set");
          if (savedSets) {
            try {
              const parsedSets = JSON.parse(savedSets);
              const sanitizedSets = parsedSets.map((set: any) => ({
                name: set.name,
                mods: (set.mods || []).map((m: any) =>
                  typeof m === "string" ? m : m.name,
                ),
              }));
              setPlaySets(sanitizedSets);
            } catch (e) {}
          }
          if (savedActive) setActiveSetName(savedActive);
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
  }, []);
  async function equipPlaySet(setName: string) {
    const targetSet = playSets.find((s) => s.name === setName);
    if (!targetSet) return;
    setStatus(
      `${t("status_deploying_prefix")}${setName}${t("status_deploying_suffix")}`,
    );
    try {
      const config: any = await invoke("get_saved_coordinates");
        let deployPayload: any[] = [];
        const dbIdToPathMap = new Map<string, string>();
        
        const buildPathMap = (nodes: any[], currentPath: string) => {
            for (const node of nodes) {
                if (node.node_type === "folder" || node.type === "folder") {
                    const nextPath = currentPath ? `${currentPath}/${node.name}` : node.name;
                    if (node.children) buildPathMap(node.children, nextPath);
                } else if (node.node_type === "file" || node.type === "file") {
                    const mappedId = node.assignedModId || node.assigned_mod_id;
                    if (mappedId) {
                        dbIdToPathMap.set(mappedId, currentPath);
                    }
                }
            }
        };

        targetSet.mods.forEach((modName: string) => {
            let modObj = modList.find((m: any) => {
              if (m.name === modName) return true;
              const mBase = m.name.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, '');
              const targetBase = modName.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, '');
              return mBase && targetBase && mBase === targetBase;
            });
            
            let parsedStructure = modObj?.folder_structure;
            if (typeof parsedStructure === 'string') {
                 try { parsedStructure = JSON.parse(parsedStructure); } catch (e) {}
            }
            if (Array.isArray(parsedStructure) && parsedStructure.length > 0) {
                 buildPathMap(parsedStructure, "");
            }
        });

        targetSet.mods.forEach((modName: string) => {
            let modObj = modList.find((m: any) => {
              if (m.name === modName) return true;
              const mBase = m.name.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, '');
              const targetBase = modName.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, '');
              return mBase && targetBase && mBase === targetBase;
            });
            
            const flatFileName = modName.split(/[\\/]/).pop() || modName;
            let targetPath = flatFileName;
            
            if (modObj?.dbId && dbIdToPathMap.has(modObj.dbId)) {
                const folderPath = dbIdToPathMap.get(modObj.dbId);
                if (folderPath) {
                    targetPath = `${folderPath}/${flatFileName}`;
                }
            }
            
            deployPayload.push({ path: modName, allow_write: modObj?.allow_write || false, target_path: targetPath });
        });

        // Pass 1.5: Inject orphan config files from the Vault into the deployment payload
        modList.forEach(m => {
            if (m.name.match(/\.(cfg|ini|json|xml|log|txt)$/i)) {
                if (!deployPayload.some(dp => dp.path === m.name)) {
                    const flatFileName = m.name.split(/[\\/]/).pop() || m.name;
                    const prefixMatch = flatFileName.match(/^([a-zA-Z0-9]+)[_ -]/);
                    const prefix = prefixMatch ? prefixMatch[1].toLowerCase() : flatFileName.split('.')[0].toLowerCase();
                    
                    const matchingMod = deployPayload.find(other => {
                        if (!other.target_path && !other.folder_structure) return false;
                        if (other.target_path && other.target_path.match(/\.(cfg|ini|json|xml|log|txt)$/i)) return false;
                        const otherFlat = other.path.split(/[\\/]/).pop() || other.path;
                        return otherFlat.toLowerCase().startsWith(prefix);
                    });

                    if (matchingMod) {
                        let folderName = "";
                        if (matchingMod.target_path && matchingMod.target_path.includes('/')) {
                            folderName = matchingMod.target_path.split('/')[0];
                        } else if (matchingMod.folder_structure && Array.isArray(matchingMod.folder_structure) && matchingMod.folder_structure.length > 0) {
                            folderName = matchingMod.folder_structure[0].name;
                        }
                        
                        if (folderName) {
                            deployPayload.push({ path: m.name, allow_write: true, target_path: `${folderName}/${flatFileName}` });
                        } else {
                            deployPayload.push({ path: m.name, allow_write: true, target_path: flatFileName });
                        }
                    }
                }
            }
        });

        // Pass 2: Automatically map config files that are ALREADY in the payload
        deployPayload.forEach(dp => {
           if (dp.target_path && dp.target_path.match(/\.(cfg|ini|json|xml|log|txt)$/i)) {
               const flatFileName = dp.path.split(/[\\/]/).pop() || dp.path;
               const prefixMatch = flatFileName.match(/^([a-zA-Z0-9]+)[_ -]/);
               const prefix = prefixMatch ? prefixMatch[1].toLowerCase() : flatFileName.split('.')[0].toLowerCase();
               
               const matchingMod = deployPayload.find(other => {
                  if (other === dp || (!other.target_path && !other.folder_structure)) return false;
                  if (other.target_path && other.target_path.match(/\.(cfg|ini|json|xml|log|txt)$/i)) return false;
                  const otherFlat = other.path.split(/[\\/]/).pop() || other.path;
                  return otherFlat.toLowerCase().startsWith(prefix);
               });

               if (matchingMod) {
                   let folderName = "";
                   if (matchingMod.target_path && matchingMod.target_path.includes('/')) {
                       folderName = matchingMod.target_path.split('/')[0];
                   } else if (matchingMod.folder_structure && Array.isArray(matchingMod.folder_structure) && matchingMod.folder_structure.length > 0) {
                       folderName = matchingMod.folder_structure[0].name;
                   }
                   
                   if (folderName) {
                       dp.target_path = `${folderName}/${flatFileName}`;
                   }
               }
           }
        });

        const msg = await invoke("deploy_playset_bulk", {
        mods: deployPayload,
        modsPath: config.mods_path,
        vaultPath: config.vault_path,
      });
      setActiveSetName(setName);
      localStorage.setItem("sanctuary_active_set", setName);
      setStatus(`${t("ui_icon_success")} ${t("backend_deployed_prefix")} ${msg as string} ${t("backend_deployed_suffix")}`);
    } catch (err) {
      setStatus(`${t("status_deploy_failed")} ${typeof err === "string" ? t(err) : t((err as any)?.message || String(err))}`);
    }
  }
  async function fetchBackups() {
    try {
      const config: any = await invoke("get_saved_coordinates");
      const list = await invoke<string[]>("get_backups", {
        vaultPath: config.vault_path,
      });
      setBackupList(list);
    } catch (err) {
      console.error("Failed to load backups", err);
    }
  }
  async function restoreGameBackup(filename: string) {
    setStatus(`${t("status_restoring_prefix")}${filename}...`);
    setIsRestoring(true);
    try {
      const config: any = await invoke("get_saved_coordinates");
      const dPath = config.mods_path.split(/[\\/]Mods/i)[0];
      const msg = await invoke("restore_game_data", {
        docsPath: dPath,
        livePath: config.live_path,
        backupName: filename,
      });
      setStatus(msg as string);
    } catch (err) {
      setStatus(`${t("status_restore_failure")}${err}`);
    } finally {
      setIsRestoring(false);
      detectGameVersion();
    }
  }
  async function fetchVault() {
    const qList = await invoke<string[]>("get_quarantine_list");
    setQuarantineList(qList);
    const sList = await invoke<string[]>("get_shelter_list");
    setShelterContents(sList);
  }
  async function runRadarSweep(isSilent: boolean = false, quickScan: boolean = false) {
    if (isScanning) return;
    if (!isSilent) {
      setIsScanning(true);
      setScanProgress({
        current: 5,
        total: 100,
        message: t("scan_interrogating_dna"),
      });
    }
    try {
      const config: any = await invoke("get_saved_coordinates");
      let currentOwnedDLC = ownedDLC;
      let currentMaskedDLC = maskedDLC;
      if (!quickScan) {
        try {
          const physicalDLC = await invoke<string[]>("scan_installed_dlc", {
            livePath: config.live_path,
          });
          setOwnedDLC(physicalDLC);
          currentOwnedDLC = physicalDLC;
          
          if (config.launch_args) {
            const maskMatch = config.launch_args.match(/-disablepack:([\w,]+)/i);
            if (maskMatch?.[1]) {
              const masked = maskMatch[1]
                .split(",")
                .map((s: string) => s.trim().toUpperCase());
              setMaskedDLC(masked);
              currentMaskedDLC = masked;
            }
          }
        } catch (e) {
          console.error("DLC scan failed during sweep", e);
        }

        try {
          const { data: malwareData } = await supabase
            .from("mod_versions")
            .select("dna_hash, mods!inner(compliance_tier)")
            .eq("mods.compliance_tier", 3);
          if (malwareData && malwareData.length > 0) {
            const malwareHashes = malwareData.map((d: any) => d.dna_hash).filter(Boolean);
            await invoke("sync_security_definitions", { malware: malwareHashes, tier2: [] });
          }
        } catch (err) {
          console.error("Malware sync failed", err);
        }
      }

      const rawLocalMods = await invoke<any[]>("scan_bunker", {
        vaultPath: config.vault_path,
        shelterActive: true,
      });

      let sandboxMods: any[] = [];
      try {
        sandboxMods = await invoke<any[]>("scan_sandbox", { vaultPath: config.vault_path });
      } catch (e) {
        console.error("Failed to scan sandbox:", e);
      }

      const allLocalMods = [...rawLocalMods, ...sandboxMods];

      const evasionDetected = allLocalMods.some(m => m.status === "☣️ EVASION DETECTED");
      if (evasionDetected) {
        try {
          const hwid = await invoke<string>("get_hardware_id");
          const { data: sessionData } = await supabase.auth.getSession();
          if (sessionData?.session?.user) {
            await supabase.from('profiles').update({ is_banned: true, hardware_id: hwid, blacklist_reason: "Malware Evasion" }).eq('id', sessionData.session.user.id);
          } else {
            await supabase.from('profiles').update({ is_banned: true, blacklist_reason: "Malware Evasion" }).eq('hardware_id', hwid);
          }
          localStorage.setItem("sanctuary_blacklisted", "true");
        } catch(err) {
          console.error("Evasion ban failed", err);
        }
      }

      if (!allLocalMods || allLocalMods.length === 0) {
        setModList([]);
      if (!isSilent) setIsScanning(false);
        return;
      }
      const uniqueMap = new Map();
      allLocalMods.forEach((m) => {
        if (m.hash) uniqueMap.set(m.hash, m);
        else uniqueMap.set(m.name, m);
      });
      const localMods = Array.from(uniqueMap.values());
      const initialList = localMods.map((m) => ({
        name: m.name,
        hash: m.hash,
        status: t("status_identifying"),
        color: "var(--text-secondary)",
        displayName: m.name,
        isSynced: false,
      }));
      setModList((prev) => {
        if (prev.length > 0) {
          const prevByHash = new Map(
            prev.filter((p) => p.hash).map((p) => [p.hash, p]),
          );
          const prevByName = new Map(
            prev.filter((p) => p.name).map((p) => [p.name, p]),
          );
          const cachedVirtuals = prev.filter((p) => p.isVirtual);
          const updatedPhysical = initialList.map((m) => {
            const existing = prevByHash.get(m.hash) || prevByName.get(m.name);
            return existing || m;
          });
          return [...cachedVirtuals, ...updatedPhysical];
        }
        return initialList;
      });
      const hashes = localMods.map((m) => m.hash).filter((h) => !!h);
      let allCloudData: any[] = [];
      const isOfflineMode = !session || localStorage.getItem("sanctuary_blacklisted") === "true";
      if (!isOfflineMode) {
        const promises = [];
        for (let i = 0; i < hashes.length; i += 200) {
          const chunk = hashes.slice(i, i + 200);
          promises.push((async () => {
            let { data, error } = await supabase
              .from("mod_versions")
              .select("dna_hash, version_label, game_version, download_url, mods (id, name, status, requiredDLC, category_override, sub_type, image_url, url, master_author, allow_write, compliance_tier, mason_id, created_at, updated_at, folder_structure, masons(name))")
              .in("dna_hash", chunk);
            
            if (error) {
              console.warn("Schema mismatch detected, falling back to safe query...");
              const fallback = await supabase
                .from("mod_versions")
                .select("dna_hash, version_label, game_version, download_url, mods (id, name, status, requiredDLC, category_override, sub_type, image_url, url, master_author, allow_write, mason_id, created_at, updated_at, folder_structure, masons(name))")
                .in("dna_hash", chunk);
              data = fallback.data as any;
            }
            return data || [];
          })());
        }
        const results = await Promise.all(promises);
        allCloudData = results.flat();
      }
      const getDbMod = (sig: any) =>
        Array.isArray(sig?.mods) ? sig.mods[0] : sig?.mods;
      const identifiedIds = allCloudData
        .map((c) => getDbMod(c)?.id)
        .filter(Boolean);
      let allRels: any[] = [],
        allDeps: any[] = [],
        parentNameMap: Record<string, any> = {};
      let flavorData: any[] = [],
        flavorGroupNames: Record<string, string> = {};
      let setMembership: any[] = [],
        ccSetsMetadata: any[] = [],
        globalConflicts: any[] = [];
      try {
        if (!isOfflineMode) {
          const { data: members } = await supabase
          .from("cc_set_members")
          .select("set_id, mod_id");
        const { data: sets } = await supabase.from("cc_sets").select("*");
        const { data: rawConflicts } = await supabase.from("logical_conflicts").select("*");
        setMembership = members || [];
        ccSetsMetadata = sets || [];
        globalConflicts = rawConflicts || [];
        if (hashes.length > 0) {
          const fPromises = [];
          for (let i = 0; i < hashes.length; i += 200) {
            const chunk = hashes.slice(i, i + 200);
            fPromises.push(
              supabase
                .from("flavor_group_members")
                .select("group_id, mod_hash")
                .in("mod_hash", chunk)
                .then((r) => r.data || [])
            );
          }
          const fResults = await Promise.all(fPromises);
          flavorData = fResults.flat();
          const uniqueGroupIds = [
            ...new Set(flavorData.map((f) => f.group_id)),
          ];
          if (uniqueGroupIds.length > 0) {
            const gPromises = [];
            const pPromises = [];
            for (let i = 0; i < uniqueGroupIds.length; i += 200) {
              const chunk = uniqueGroupIds.slice(i, i + 200);
              gPromises.push(
                supabase
                  .from("flavor_groups")
                  .select("id, name")
                  .in("id", chunk)
                  .then((r) => r.data || [])
              );
              pPromises.push(
                supabase
                  .from("mods")
                  .select("id, name, master_author, image_url, url")
                  .in("id", chunk)
                  .then((r) => r.data || [])
              );
            }
            const gResults = await Promise.all(gPromises);
            const pResults = await Promise.all(pPromises);

            gResults.flat().forEach((g) => {
              flavorGroupNames[String(g.id)] = g.name;
            });
            pResults.flat().forEach((pm) => {
              parentNameMap[String(pm.id)] = {
                name: pm.name,
                author: pm.master_author || "Unknown",
                image_url: pm.image_url,
                url: pm.url,
              };
            });
          }
        }
        }
      } catch (err) {
        console.error("Bridge Error:", err);
      }
      if (identifiedIds.length > 0 && !isOfflineMode) {
        const relChildPromises = [];
        const relParentPromises = [];
        const depChildPromises = [];
        const depParentPromises = [];

        for (let i = 0; i < identifiedIds.length; i += 200) {
          const chunk = identifiedIds.slice(i, i + 200);
          relChildPromises.push(
            supabase
              .from("mod_relationships")
              .select("*")
              .in("child_id", chunk)
              .then((r) => r.data || [])
          );
          relParentPromises.push(
            supabase
              .from("mod_relationships")
              .select("*")
              .in("parent_id", chunk)
              .then((r) => r.data || [])
          );
          depChildPromises.push(
            supabase
              .from("mod_dependencies")
              .select("*")
              .in("child_id", chunk)
              .then((r) => r.data || [])
          );
          depParentPromises.push(
            supabase
              .from("mod_dependencies")
              .select("*")
              .in("parent_id", chunk)
              .then((r) => r.data || [])
          );
        }
        
        const [rC, rP, dC, dP] = await Promise.all([
          Promise.all(relChildPromises),
          Promise.all(relParentPromises),
          Promise.all(depChildPromises),
          Promise.all(depParentPromises)
        ]);
        
        allRels = [...rC.flat(), ...rP.flat()];
        allDeps = [...dC.flat(), ...dP.flat()];
        const pIds = [
          ...new Set([
            ...allRels.map((r) => String(r.parent_id)),
            ...allRels.map((r) => String(r.child_id)),
            ...allDeps.map((d) => String(d.parent_id)),
            ...allDeps.map((d) => String(d.child_id)),
          ]),
        ];
        if (pIds.length > 0) {
          const pPromises = [];
          for (let i = 0; i < pIds.length; i += 200) {
            const chunk = pIds.slice(i, i + 200);
            pPromises.push(
              supabase
                .from("mods")
                .select("id, name, master_author, image_url, url")
                .in("id", chunk)
                .then((r) => r.data || [])
            );
          }
          const pResults = await Promise.all(pPromises);
          pResults.flat().forEach((pm) => {
            parentNameMap[String(pm.id)] = {
              name: pm.name,
              author: pm.master_author || "Unknown",
              image_url: pm.image_url,
              url: pm.url,
            };
          });
        }
      }
      const cloudMap = new Map();
      allCloudData.forEach(c => cloudMap.set(String(c.dna_hash), c));
      const setRelMap = new Map();
      setMembership.forEach(sm => setRelMap.set(String(sm.mod_id), sm));
      const flavorMap = new Map();
      flavorData.forEach(f => flavorMap.set(String(f.mod_hash), f));
      
      const dbVersionMap = new Map<string, string[]>();
      allCloudData.forEach(c => {
          const dbM = getDbMod(c);
          const dbId = dbM?.id ? String(dbM.id) : null;
          const v = c.game_version || dbM?.compatible_versions;
          if (dbId && v) {
              const vArr = typeof v === 'string' ? v.split(',').map((s: string) => s.trim()) : v;
              const existing = dbVersionMap.get(dbId) || [];
              dbVersionMap.set(dbId, Array.from(new Set([...existing, ...vArr])));
          }
      });
      
      const parentRelMap = new Map();
      const childRelMap = new Map();
      allRels.forEach(r => {
         const cid = String(r.child_id);
         const pid = String(r.parent_id);
         if (!parentRelMap.has(cid)) parentRelMap.set(cid, []);
         parentRelMap.get(cid).push(r);
         if (!childRelMap.has(pid)) childRelMap.set(pid, []);
         childRelMap.get(pid).push(r);
      });
      
      const depsMap = new Map();
      allDeps.forEach(d => {
         const cid = String(d.child_id);
         if (!depsMap.has(cid)) depsMap.set(cid, []);
         depsMap.get(cid).push(d);
      });

      const dirMap = new Map();
      const bossVersionMap = new Map();
      
      localMods.forEach(m => {
        const cm = cloudMap.get(String(m.hash));
        const dbM = getDbMod(cm);
        const f = flavorMap.get(String(m.hash));
        
        const dbId = dbM?.id ? String(dbM.id) : null;
        const myParentRels = dbId ? (parentRelMap.get(dbId) || []) : [];
        const myChildRels = dbId ? (childRelMap.get(dbId) || []) : [];
        
        const twinRel = myParentRels.find((r: any) => r.relationship_type === "twin");
        const addonRel = myParentRels.find((r: any) => r.relationship_type === "addon");
        const childTwinRel = myChildRels.find((r: any) => r.relationship_type === "twin");
        
        let bId = dbId || (f ? String(f.group_id) : null);
        if (addonRel) {
            bId = String(addonRel.parent_id);
        } else if (twinRel) {
            bId = String(twinRel.parent_id) < String(twinRel.child_id) ? String(twinRel.parent_id) : String(twinRel.child_id);
        } else if (childTwinRel) {
            bId = String(childTwinRel.parent_id) < String(childTwinRel.child_id) ? String(childTwinRel.parent_id) : String(childTwinRel.child_id);
        }

        // NEW: The "Bossception" Root Tracer (Loop 1)
        let isTracingBoss1 = true;
        let safetyTraceCount1 = 0;
        
        while (isTracingBoss1 && bId && safetyTraceCount1 < 5) {
            const nextLevelRels = parentRelMap.get(bId) || [];
            const nextAddonRel = nextLevelRels.find((r: any) => r.relationship_type === "addon");
            const nextTwinRel = nextLevelRels.find((r: any) => r.relationship_type === "twin");
            
            let upperBossId = null;
            if (nextAddonRel) {
                upperBossId = String(nextAddonRel.parent_id);
            } else if (nextTwinRel) {
                upperBossId = String(nextTwinRel.parent_id) < String(nextTwinRel.child_id) ? String(nextTwinRel.parent_id) : String(nextTwinRel.child_id);
            }

            if (upperBossId && upperBossId !== bId) {
                bId = upperBossId; // Climb one rung up the ladder
                safetyTraceCount1++;
            } else {
                isTracingBoss1 = false; // We hit the absolute Core
            }
        }

        // Build bossVersionMap to resolve specific versions for a Boss Family globally
        if (bId && cm && cm.version_label && !cm.version_label.includes(',')) {
           const existing = bossVersionMap.get(bId);
           if (!existing || cm.version_label.localeCompare(existing, undefined, { numeric: true, sensitivity: 'base' }) > 0) {
               bossVersionMap.set(bId, cm.version_label);
           }
        }

        // Keep dirMap purely for unpublished configuration files that need a Boss
        if (bId || cm) {
            const dir = m.name.substring(0, Math.max(m.name.lastIndexOf("\\"), m.name.lastIndexOf("/")));
            if (dir && dir.length > 0) {
                const existing = dirMap.get(dir);
                const isTwinGroup = myParentRels.some((r: any) => r.relationship_type === "twin") || myChildRels.some((r: any) => r.relationship_type === "twin");
                
                if (!existing || bId === dbId) {
                    let shouldSet = true;
                    let nextBossId: string | null = bId;
                    if (existing && existing.bossId === bId) {
                        if (!existing.isTwinGroup && isTwinGroup) {
                            existing.isTwinGroup = true; // Mutate existing immediately to upgrade directory status
                        }
                        // NEW RULE: If the directory already secured a version label, and this file has NONE, DO NOT overwrite!
                        if (existing.cloudMatch?.version_label && !cm?.version_label) {
                            shouldSet = false;
                        } 
                        else if (existing.cloudMatch?.version_label && cm?.version_label && cm.version_label.localeCompare(existing.cloudMatch.version_label, undefined, { numeric: true, sensitivity: 'base' }) >= 0) {
                            shouldSet = false; // Keep the LOWER version of the same Boss
                        }
                    } else if (existing && existing.bossId !== bId) {
                        // Multiple different bosses in this directory means it is a MIXED directory.
                        // It should not act as a catch-all Directory Boss for unidentified files.
                        nextBossId = null;
                    } else if (existing && existing.isTwinGroup && !isTwinGroup) {
                        shouldSet = false; // Never overwrite a Twin Group Boss with a Standalone Boss!
                    }
                    if (shouldSet) {
                        dirMap.set(dir, { bossId: nextBossId, cloudMatch: cm, dbMod: dbM, isTwinGroup: existing?.isTwinGroup || isTwinGroup });
                    }
                }
            }
        }
      });

      const physicalMods = localMods.map((mod) => {
        const cloudMatch = cloudMap.get(String(mod.hash));
        const dbMod = getDbMod(cloudMatch);
        const dbId = dbMod?.id ? String(dbMod.id) : null;
        
        const mySetRel = dbId ? setRelMap.get(dbId) : undefined;
        const myFlavor = flavorMap.get(String(mod.hash));
        
        const myParentRels = dbId ? (parentRelMap.get(dbId) || []) : [];
        const myChildRels = dbId ? (childRelMap.get(dbId) || []) : [];
        
        const twinRel = myParentRels.find((r: any) => r.relationship_type === "twin");
        const betaRel = myParentRels.find((r: any) => r.relationship_type === "beta");
        const addonRel = myParentRels.find((r: any) => r.relationship_type === "addon");
        const setItemRel = myParentRels.find((r: any) => r.relationship_type === "set_item");
        
        const childTwinRel = myChildRels.find((r: any) => r.relationship_type === "twin");
        const childBetaRel = myChildRels.find((r: any) => r.relationship_type === "beta");
        
        const invisibleRivalIds = myChildRels
          .filter((r: any) => r.relationship_type === "rival")
          .map((r: any) => String(r.child_id));
          
        const myDeps = dbId ? (depsMap.get(dbId) || []).map((d: any) => ({
            id: String(d.parent_id),
            name: parentNameMap[String(d.parent_id)]?.name || String(d.parent_id),
            url: parentNameMap[String(d.parent_id)]?.url || null
        })) : [];

        let rawDLC = dbMod?.requiredDLC || [];
        if (typeof rawDLC === 'string') rawDLC = rawDLC.split(',').map((s: string) => s.trim()).filter(Boolean);
        const isDlcMissing = rawDLC.some(
          (dlc: string) => {
            const baseCode = dlc.split(' ')[0].toUpperCase();
            return !currentOwnedDLC.includes(baseCode) || currentMaskedDLC.includes(baseCode);
          }
        );
        let myBossId = dbId;
        let myRelType = null;
        if (addonRel) {
          myBossId = String(addonRel.parent_id);
          myRelType = "addon";
        } else if (setItemRel) {
          myBossId = String(setItemRel.parent_id);
          myRelType = "set_item";
        } else if (twinRel) {
          myBossId = String(twinRel.parent_id) < String(twinRel.child_id) ? String(twinRel.parent_id) : String(twinRel.child_id);
          myRelType = "twin";
        } else if (betaRel) {
          myBossId = String(betaRel.parent_id) < String(betaRel.child_id) ? String(betaRel.parent_id) : String(betaRel.child_id);
          myRelType = "beta";
        } else if (childTwinRel) {
          myBossId = String(childTwinRel.parent_id) < String(childTwinRel.child_id) ? String(childTwinRel.parent_id) : String(childTwinRel.child_id);
          myRelType = "twin";
        } else if (childBetaRel) {
          myBossId = String(childBetaRel.parent_id) < String(childBetaRel.child_id) ? String(childBetaRel.parent_id) : String(childBetaRel.child_id);
          myRelType = "core";
        } else if (myFlavor) {
          myBossId = String(myFlavor.group_id);
        }

        // NEW: The "Bossception" Root Tracer (Loop 2)
        // If an addon is linked to a Master Addon (Nested Relationships), trace up the tree to find the Ultimate Core Boss.
        let isTracingBoss2 = true;
        let safetyTraceCount2 = 0;
        
        while (isTracingBoss2 && myBossId && safetyTraceCount2 < 5) {
            const nextLevelRels = parentRelMap.get(myBossId) || [];
            const nextAddonRel = nextLevelRels.find((r: any) => r.relationship_type === "addon");
            const nextTwinRel = nextLevelRels.find((r: any) => r.relationship_type === "twin");
            
            let upperBossId = null;
            if (nextAddonRel) {
                upperBossId = String(nextAddonRel.parent_id);
            } else if (nextTwinRel) {
                upperBossId = String(nextTwinRel.parent_id) < String(nextTwinRel.child_id) ? String(nextTwinRel.parent_id) : String(nextTwinRel.child_id);
            }

            if (upperBossId && upperBossId !== myBossId) {
                myBossId = upperBossId; // Climb one rung up the ladder
                safetyTraceCount2++;
            } else {
                isTracingBoss2 = false; // We hit the absolute Core
            }
        }
        
        const originalDir = mod.name.substring(0, Math.max(mod.name.lastIndexOf("\\"), mod.name.lastIndexOf("/")));
        let dirData = null;
        let currentDir = originalDir;

        while (currentDir && currentDir.length > 0) {
             const data = dirMap.get(currentDir);
             if (data) {
                 dirData = data;
                 break;
             }
             const lastSlash = Math.max(currentDir.lastIndexOf("\\"), currentDir.lastIndexOf("/"));
             if (lastSlash > 0) {
                 currentDir = currentDir.substring(0, lastSlash);
             } else {
                 break;
             }
        }
        
        const hasOwnTwins = myParentRels.some((r: any) => r.relationship_type === "twin") || 
                            myChildRels.some((r: any) => r.relationship_type === "twin");
                            
        // Group unidentified standalone mods in the closest parent directory under the Directory Boss.
        // Explicitly block verified mods (which have a dbId/myBossId) from being absorbed against their will.
        if (!myBossId && !hasOwnTwins && dirData && dirData.bossId) {
            myBossId = dirData.bossId;
        }
        
        let effectiveCloudMatch = cloudMatch;
        let effectiveDbMod = dbMod;
        
        // Only override metadata for UNPUBLISHED files (e.g. config files) from dirData
        if (!dbId && dirData && myBossId === dirData.bossId) {
            effectiveCloudMatch = dirData.cloudMatch;
            effectiveDbMod = dirData.dbMod || dbMod;
        }

        let unifiedVersion = null;

        // FALLBACK: If it still has no version (or wasn't an orphan), fall back to dirMap/global map
        if (!unifiedVersion && myBossId) {
            const isDirBossValid = dirData && (dirData.bossId === myBossId || myParentRels.some((r: any) => String(r.parent_id) === String(dirData.bossId)));
            if (isDirBossValid && dirData.cloudMatch?.version_label) {
                unifiedVersion = dirData.cloudMatch.version_label;
            } else if (!effectiveCloudMatch?.version_label) {
                unifiedVersion = bossVersionMap.get(myBossId);
            }
        }

        let finalVersion = effectiveCloudMatch?.version_label || "v.Local";
        if (unifiedVersion) {
            finalVersion = unifiedVersion; // Strictly force all files to match the local boss version
        }

        const compVerRaw = effectiveCloudMatch?.game_version || effectiveDbMod?.compatible_versions || [];
        const compVerArray = Array.isArray(compVerRaw) ? compVerRaw : (typeof compVerRaw === 'string' ? compVerRaw.split(',').map((s: string) => s.trim()) : []);
        // NEW: Game Version Mismatch Severing
        // If there is zero overlap between this file's versions and its Boss's versions, sever the relationship
        if (myBossId && myBossId !== dbId && myBossId !== `local_${mod.hash}`) {
            const myVersionsRaw = effectiveCloudMatch?.game_version || effectiveDbMod?.compatible_versions;
            if (myVersionsRaw) {
                const myVArr = typeof myVersionsRaw === 'string' ? myVersionsRaw.split(',').map((s:string) => s.trim()) : myVersionsRaw;
                const bossVArr = dbVersionMap.get(myBossId);
                if (bossVArr && myVArr.length > 0 && bossVArr.length > 0) {
                    let hasOverlap = false;
                    if (myVArr.some((v:string) => ['unknown', 'any', 'all', ''].includes(v.toLowerCase())) || 
                        bossVArr.some((v:string) => ['unknown', 'any', 'all', ''].includes(v.toLowerCase()))) {
                        hasOverlap = true;
                    } else {
                        hasOverlap = myVArr.some((mv: string) => isVersionMatch(bossVArr, mv)) || bossVArr.some((bv: string) => isVersionMatch(myVArr, bv));
                    }
                    if (!hasOverlap) {
                        myBossId = dbId;
                        myRelType = null;
                    }
                }
            }
        }

        let isVersionMismatch = false;
        if (selectedVersion && compVerArray.length > 0) {
            isVersionMismatch = !compVerArray.some((v: string) => v === selectedVersion);
        }

        return {
          ...mod,
          physical_path: mod.name,
          dbId,
          hasChildren: myChildRels.length > 0,
          setId: mySetRel ? String(mySetRel.set_id) : null,
          flavorGroupId: myFlavor ? String(myFlavor.group_id) : null,
          flavorGroupName: myFlavor
            ? flavorGroupNames[String(myFlavor.group_id)]
            : null,
          created_at: effectiveCloudMatch?.created_at || effectiveDbMod?.created_at || mod.created_at || null,
          updated_at: effectiveCloudMatch?.updated_at || effectiveDbMod?.updated_at || mod.updated_at || null,
          requiredDLC: rawDLC,
          category_override: effectiveDbMod?.category_override,
          sub_type: effectiveDbMod?.sub_type,
          image_url: effectiveDbMod?.image_url,
          folder_structure: effectiveDbMod?.folder_structure,
          url: effectiveCloudMatch?.download_url || effectiveDbMod?.url || mod.url || null,
          author:
            (Array.isArray(effectiveDbMod?.masons)
              ? effectiveDbMod.masons[0]?.name
              : effectiveDbMod?.masons?.name) ||
            effectiveDbMod?.master_author ||
            mod.author,
          version: finalVersion,
          compatible_versions: effectiveCloudMatch?.game_version || effectiveDbMod?.compatible_versions || [],
          familyId: myBossId || dbId ? `${myBossId || dbId}` : `local_${mod.hash}`,
          baseFamilyId: myBossId || dbId ? myBossId : `local_${mod.hash}`,
          relationshipType: myRelType,
          invisibleRivals:
            invisibleRivalIds.length > 0 ? invisibleRivalIds : undefined,
          requirements: myDeps.length > 0 || myParentRels.some((r: any) => r.relationship_type === "addon")
            ? [
                ...myDeps,
                ...myParentRels.filter((r: any) => r.relationship_type === "addon").map((r: any) => ({
                  id: String(r.parent_id),
                  name: parentNameMap[String(r.parent_id)]?.name || String(r.parent_id),
                  url: parentNameMap[String(r.parent_id)]?.url || null
                }))
              ]
            : undefined,
          twins:
            myParentRels.some((r: any) => r.relationship_type === "twin") || myChildRels.some((r: any) => r.relationship_type === "twin")
              ? [
                  ...myParentRels.filter((r: any) => r.relationship_type === "twin").map((r: any) => ({
                    id: String(r.parent_id),
                    name: parentNameMap[String(r.parent_id)]?.name || String(r.parent_id),
                    url: parentNameMap[String(r.parent_id)]?.url || null
                  })),
                  ...myChildRels.filter((r: any) => r.relationship_type === "twin").map((r: any) => ({
                    id: String(r.child_id),
                    name: parentNameMap[String(r.child_id)]?.name || String(r.child_id),
                    url: parentNameMap[String(r.child_id)]?.url || null
                  })),
                ]
              : undefined,
          interchangeableIds: [
            ...myParentRels.filter((r: any) => r.relationship_type === "beta" || r.relationship_type === "twin").map((r: any) => String(r.parent_id)),
            ...myChildRels.filter((r: any) => r.relationship_type === "beta" || r.relationship_type === "twin").map((r: any) => String(r.child_id))
          ],
          displayName: (() => {
            const rawName = mod.name.split(/[\\/]/).pop() || "";
            const match = rawName.match(/\.(package|ts4script)$/i);
            let base = rawName.replace(/\.(package|ts4script)$/i, "").replace(/_/g, " ");
            return base.toUpperCase();
          })(),
          allow_write: dbMod?.allow_write || false,
          compliance_tier: dbMod?.compliance_tier || 0,
          mason_id: dbMod?.mason_id || null,
          status: dbMod
            ? dbMod.status === "verified"
              ? t("status_verified")
              : dbMod.status === "unverified"
                ? t("status_unverified")
                : dbMod.status
            : mod.status?.includes("EXPLICIT LOCAL") ? "🚫 EXPLICIT LOCAL" : t("status_local_only"),
          isSynced: !!dbMod,
          isVirtual: false,
          isGhosted: isDlcMissing || isVersionMismatch,
          ghostReason: isDlcMissing ? "MISSING_DLC" : (isVersionMismatch ? "VERSION_MISMATCH" : null),
        };
      });

      const unidentified = physicalMods.filter(
        (m) => !m.isSynced && !m.status?.includes("EXPLICIT LOCAL") && !m.name.toLowerCase().includes("customchallenge") && !m.name.toLowerCase().includes("sandbox") && !m.name.match(/\.(cfg|ini|json|xml|log|txt)$/i)
      );
      if (unidentified.length > 0 && !isSilent) {
        setScoutQueue(unidentified);
      }
      const virtualCards: any[] = [];
      ccSetsMetadata.forEach((set) => {
        const setMembers = physicalMods.filter(
          (m) => String(m.setId) === String(set.id),
        );
        if (setMembers.length > 0) {
          const verifiedCount = setMembers.filter((m) => m.status === (t("status_verified"))).length;
          const isAllVerified = verifiedCount === setMembers.length;
          const isNoneVerified = verifiedCount === 0;
          const isAnyBroken = setMembers.some((m) => typeof m.status === 'string' && m.status.toLowerCase().includes("broken"));
          
          let folderStatus = "";
          if (isAnyBroken) {
            folderStatus = "broken";
          } else if (isAllVerified) {
            folderStatus = t("status_verified");
          } else if (isNoneVerified) {
            folderStatus = t("status_unverified");
          } else {
            folderStatus = t("status_mixed");
          }

          virtualCards.push({
            hash: "set_" + set.id,
            name: "SET_" + set.id,
            dbId: String(set.id),
            displayName: set.name.toUpperCase(),
            author: set.creator_name || "Unknown Architect",
            status: folderStatus,
            color: "var(--accent)",
            isSynced: true,
            isVirtual: true,
            isParent: true,
            isCCSet: true,
            url: set.url || null,
            image_url: set.image_url,
            flavors: setMembers,
            isGhosted: setMembers.some(m => m.isGhosted)
          });
        }
      });
      const uniqueFamilyGroups = [
        ...new Set(physicalMods.map((m) => m.familyId).filter(Boolean)),
      ];
      uniqueFamilyGroups.forEach((fId) => {
        const familyMembers = physicalMods.filter(
          (m) => String(m.familyId) === String(fId)
        );
        const baseFId = fId.split('@')[0];
        const isFlavorFolder = !!flavorGroupNames[String(baseFId)] && !parentNameMap[String(baseFId)];
        
        if (familyMembers.length <= 1 && !isFlavorFolder) return;
        
        const isTwinGroup = familyMembers.some(
          (m) => m.relationshipType === "twin" || m.relationshipType === "beta"
        );
        const pData = parentNameMap[String(baseFId)] || {
          name: isFlavorFolder
            ? flavorGroupNames[String(baseFId)]
            : familyMembers[0].displayName,
          author: familyMembers[0].author,
        };
          const safeName = pData.name || t("status_unknown_folder") || "Unknown Folder";
          const verifiedCount = familyMembers.filter((m) => m.status === (t("status_verified"))).length;
          const isAllVerified = verifiedCount === familyMembers.length;
          const isNoneVerified = verifiedCount === 0;
          const isAnyBroken = familyMembers.some((m) => typeof m.status === 'string' && m.status.toLowerCase().includes("broken"));
          
          let folderStatus = "";
          if (isAnyBroken) {
            folderStatus = "broken";
          } else if (isAllVerified) {
            folderStatus = t("status_verified");
          } else if (isNoneVerified) {
            folderStatus = t("status_unverified");
          } else {
            folderStatus = t("status_mixed");
          }

          const myParentRels = allRels.filter((r) => String(r.child_id) === String(baseFId));
          const myChildRels = allRels.filter((r) => String(r.parent_id) === String(baseFId));
          const folderDeps = [
            ...allDeps.filter((d) => String(d.child_id) === String(baseFId)).map((d) => ({
              id: String(d.parent_id),
              name: parentNameMap[String(d.parent_id)]?.name || String(d.parent_id),
              url: parentNameMap[String(d.parent_id)]?.url || null
            })),
            ...myParentRels.filter((r) => r.relationship_type === "addon").map((r) => ({
              id: String(r.parent_id),
              name: parentNameMap[String(r.parent_id)]?.name || String(r.parent_id),
              url: parentNameMap[String(r.parent_id)]?.url || null
            }))
          ];
            
          const folderTwins = myParentRels.some((r) => r.relationship_type === "twin") || myChildRels.some((r) => r.relationship_type === "twin")
            ? [
                ...myParentRels.filter((r) => r.relationship_type === "twin").map((r) => ({
                  id: String(r.parent_id),
                  name: parentNameMap[String(r.parent_id)]?.name || String(r.parent_id),
                  url: parentNameMap[String(r.parent_id)]?.url || null
                })),
                ...myChildRels.filter((r) => r.relationship_type === "twin").map((r) => ({
                  id: String(r.child_id),
                  name: parentNameMap[String(r.child_id)]?.name || String(r.child_id),
                  url: parentNameMap[String(r.child_id)]?.url || null
                })),
              ]
            : undefined;

          virtualCards.push({
            hash: "virtual_" + fId,
            name: "FOLDER_" + fId,
            dbId: String(fId),
            baseFamilyId: String(baseFId),
            displayName: safeName.toUpperCase(),
            author: pData.author,
            status: folderStatus,
            color: isFlavorFolder ? "var(--warning)" : "var(--accent)",
            isSynced: true,
            isVirtual: true,
            isParent: true,
            isFlavorFolder: isFlavorFolder,
            twins: folderTwins,
            requirements: folderDeps.length > 0 ? folderDeps : undefined,
            flavors: [...familyMembers].sort((a, b) => {
              if (a.relationshipType === "beta" && b.relationshipType !== "beta") return 1;
              if (a.relationshipType !== "beta" && b.relationshipType === "beta") return -1;
              return 0;
            }),
          });
      });
      const localOvr = JSON.parse(
        localStorage.getItem("sanctuary_local_overrides") || "{}",
      );
      const localSts = JSON.parse(
        localStorage.getItem("sanctuary_local_sets") || "[]",
      );
      let overriddenMods = physicalMods.map((m: any) =>
        localOvr[m.hash]
          ? { ...m, ...localOvr[m.hash], isLocalOverride: true }
          : m,
      );
      const localVirtualCards: any[] = [];
      localSts.forEach((set: any) => {
        const setMembers = overriddenMods.filter((m: any) =>
          set.items.includes(m.hash),
        );
        if (setMembers.length > 0) {
          const isSet = !!set.isCCSet;
          const verifiedCount = setMembers.filter((m: any) => m.status === (t("status_verified"))).length;
          const isAllVerified = verifiedCount === setMembers.length;
          const isNoneVerified = verifiedCount === 0;
          const isAnyBroken = setMembers.some((m: any) => typeof m.status === 'string' && m.status.toLowerCase().includes("broken"));
          
          let folderStatus = "";
          if (isAnyBroken) {
            folderStatus = "broken";
          } else if (isAllVerified) {
            folderStatus = t("status_verified");
          } else if (isNoneVerified) {
            folderStatus = t("status_unverified");
          } else {
            folderStatus = t("status_mixed");
          }

          localVirtualCards.push({
            hash: "local_set_" + set.id,
            name: "LOCAL_SET_" + set.id,
            dbId: String(set.id),
            displayName: set.name.toUpperCase(),
            author: "Local Override",
            status: folderStatus,
            color: isSet ? "var(--accent)" : "var(--success)",
            isSynced: false,
            isVirtual: true,
            isParent: true,
            isCCSet: isSet,
            url: set.url || null,
            isLocalOverride: true,
            image_url: "",
            flavors: setMembers,
          });
        }
      });
      localSts.forEach((set: any) => {
        overriddenMods = overriddenMods.map((m: any) =>
          set.items.includes(m.hash)
            ? { ...m, setId: set.id, familyId: set.id }
            : m,
        );
      });
      const rawMasterList = [
        ...virtualCards.map((m: any) => localOvr[m.hash] ? { ...m, ...localOvr[m.hash], isLocalOverride: true } : m),
        ...localVirtualCards.map((m: any) => localOvr[m.hash] ? { ...m, ...localOvr[m.hash], isLocalOverride: true } : m),
        ...overriddenMods,
      ];

      const masterList = rawMasterList.map((m: any) => {
        if (!m.name) return m;
        const cleanName = m.name.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, "").toUpperCase() || "";
        const cleanDisplayName = m.displayName?.toUpperCase() || "";

        const myConflicts = globalConflicts.filter((c: any) => {
           if (c.mod_a_id && c.mod_a_id === m.dbId) return true;
           if (c.mod_b_id && c.mod_b_id === m.dbId) return true;
           const cModA = c.mod_a ? c.mod_a.toUpperCase() : "";
           const cModB = c.mod_b ? c.mod_b.toUpperCase() : "";
           if (cModA && (cModA === cleanName || cModA === cleanDisplayName)) return true;
           if (cModB && (cModB === cleanName || cModB === cleanDisplayName)) return true;
           return false;
        }).map((c: any) => {
           const isModA = c.mod_a_id === m.dbId || (c.mod_a && c.mod_a.toUpperCase() === cleanName) || (c.mod_a && c.mod_a.toUpperCase() === cleanDisplayName);
           const enemyId = isModA ? c.mod_b_id : c.mod_a_id;
           const enemyLegacyName = isModA ? c.mod_b : c.mod_a;
           return {
              id: c.id,
              enemy_id: enemyId,
              enemy_name: enemyLegacyName,
              severity_rank: c.severity_rank,
              resolution_note: c.resolution_note
           };
        });
        return { ...m, conflicts: myConflicts.length > 0 ? myConflicts : undefined };
      });

      const detectedMalware = masterList.filter((m: any) => (m.compliance_tier === 3 || (typeof m.status === 'string' && m.status.includes("QUARANTINED"))) && !m.isVirtual && !m.isLocalOverride);
      if (detectedMalware.length > 0) {
        if (localStorage.getItem("sanctuary_share_malware_reports") === "true") {
          try {
            const { data: session } = await supabase.auth.getSession();
            const citizen_id = session?.session?.user?.id || null;
            const { data: existingReports } = await supabase.from('malware_reports').select('detected_hash, original_path').eq('citizen_id', citizen_id);

            const insertPayloads = detectedMalware
              .filter((m: any) => !existingReports?.some(r => r.detected_hash === m.hash && r.original_path === (m.original_path || m.path || '')))
              .map((m: any) => ({
                artifact_name: m.displayName || m.name || 'Unknown',
                detected_hash: m.hash || 'unknown-hash',
                signature: 'Radar Sweep Detection',
                status: 'pending',
                citizen_id,
                original_exists: m.original_exists,
                original_shredded: m.original_shredded,
                original_path: m.original_path || m.path || '',
                quarantine_path: m.quarantine_path
              }));

            if (insertPayloads.length > 0) {
              const { error } = await supabase.from('malware_reports').insert(insertPayloads);
              if (error) console.error("Malware Report Insert Error (sweep):", error);
            }
          } catch(e) {
            console.error("Malware Report Insert Exception (sweep):", e);
          }
        }

        setMalwareAlert((prev: any[]) => {
          if (!prev) return detectedMalware;
          const newAlerts = detectedMalware.filter((m: any) => !prev.some((p: any) => p.hash === m.hash || p.dbId === m.dbId));
          return [...prev, ...newAlerts];
        });
      }

      setModList(masterList);
      setScanProgress({ current: 100, total: 100, message: t("status_done") });
      if (!isSilent) setStatus(t("status_radar_done"));
      try {
        const config: any = await invoke("get_saved_coordinates");
        if (config.vault_path) {
          invoke("save_master_cache", {
            vaultPath: config.vault_path,
            content: JSON.stringify(masterList),
          });
        }
      } catch (cacheErr) {
        console.warn("Cache save failed:", cacheErr);
      }
      checkNetworkUpdates(masterList);
    } catch (err) {
      console.error("RADAR CRASH:", err);
    } finally {
      if (!isSilent) setIsScanning(false);
    }
  }
  async function checkNetworkUpdates(currentModList: ModData[]) {
    try {
      const syncedMods = currentModList.filter(
        (m) => m.isSynced && !m.isVirtual,
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
      } catch (e) {}
      setNetworkUpdates({ broken, obsolete, updated });
    } catch (err) {
      console.error("Update check failed", err);
    }
  }

  const renamePlaySet = (oldName: string, newName: string) => {
    setPlaySets((prev: any[]) => {
      const copy = [...prev];
      const target = copy.find(s => s.name === oldName);
      if (target) {
        target.name = newName;
      }
      localStorage.setItem("sanctuary_playsets", JSON.stringify(copy));
      return copy;
    });
    if (activeSetName === oldName) {
      setActiveSetName(newName);
      localStorage.setItem("sanctuary_active_set", newName);
    }
  };

  async function importPlaySet() {
    try {
      const selected = await open({
        filters: [{ name: "Sanctuary Profile", extensions: ["json"] }],
      });
      if (!selected) return;
      const content = await invoke<string>("read_blueprint", {
        path: selected as string,
      });
      const parsed = JSON.parse(content);
      if (!parsed.sanctuary_profile) {
        alert(t("status_invalid_profile"));
        return;
      }
      const missing: any[] = [];
      const availableMods: string[] = [];
      parsed.mods.forEach((importedMod: any) => {
        const found = modList.find((m: any) => {
          if (m.hash && importedMod.hash && m.hash === importedMod.hash) return true;
          if (m.name === importedMod.name) return true;
          const mBase = m.name.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, '');
          const targetBase = typeof importedMod === 'string' ? importedMod.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, '') : (importedMod.name || importedMod.path || '').split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, '');
          return mBase && targetBase && mBase === targetBase;
        });
        if (found) availableMods.push(found.name);
        else missing.push(importedMod);
      });
      let newName = parsed.name;
      let counter = 1;
      while(
        playSets.some((s) => s.name.toLowerCase() === newName.toLowerCase())
      ) {
        newName = `${parsed.name} (${counter})`;
        counter++;
      }
      const readySet = { name: newName, mods: availableMods };
      if (missing.length > 0) {
        setPendingImportSet(readySet);
        setMissingImportMods(missing);
      } else {
        finalizeImport(readySet);
      }
    } catch (err) {
      setStatus(`${t("log_icon_fatal")} ${t("status_import_failed")}${err}`);
    }
  }
  function finalizeImport(setToAdd: any) {
    if (!setToAdd) return;
    const updatedSets = [...playSets, setToAdd];
    setPlaySets(updatedSets);
    localStorage.setItem("sanctuary_playsets", JSON.stringify(updatedSets));
    setStatus(
      `${t("ui_icon_success")} ${t("status_profile_imported")}${setToAdd.name}`,
    );
    setMissingImportMods(null);
    setPendingImportSet(null);
  }
  function handleSmartSearch(mod: ModData) {
    if (!mod) return;
    const cleanName = (mod.displayName || mod.name)
      .replace(".package", "")
      .replace(".ts4script", "");
    const targetUrl =
      mod.url && mod.url.trim() !== ""
        ? mod.url.startsWith("http")
          ? mod.url
          : `https://${mod.url}`
        : `https://www.bing.com/search?q=${encodeURIComponent(`Sims 4 mod ${cleanName}`)}`;
    openUrl(targetUrl);
    setStatus(`${t("status_intel_request")}${cleanName}`);
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
              name: localA?.name || t("backups_unknown") || "Unknown",
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
              name: localB?.name || t("backups_unknown") || "Unknown",
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
  async function runSanitization() {
    try {
      setStatus(t("status_sanitizing"));
      const config: any = await invoke("get_saved_coordinates");
      const msg = await invoke<string>("sanitize_vault", {
        vaultPath: config.vault_path,
      });
      setStatus(`${t("ui_icon_success")} ${t("backend_sanitize_prefix")} ${msg} ${t("backend_sanitize_suffix")}`);
      await runRadarSweep(false);
    } catch (err) {
      setStatus(`${t("status_sanitize_error")}${err}`);
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
        const cleanName = mod.name.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, '');
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
        status: t("status_under_review"),
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
    localStorage.setItem("sanctuary_playsets", JSON.stringify(updatedSets));
    setActivePlaySetIndex(updatedSets.length - 1);
    setStatus(
      `${t("status_blueprint_drafted_prefix")}${setName}${t("status_blueprint_drafted_suffix")}`,
    );
    setIsDraftingSet(false);
    setDraftSetName("");
  }
  const displayModList = modList;
  

  async function triggerShelter(active: boolean) {
    setStatus(active ? t("status_evacuating") : t("status_restoring_bunker"));
    try {
      if (active) {
        let msg = await invoke("wipe_symlinks");
        setStatus(t(msg as string) || (msg as string));
      } else {
        if (activeSetName) await equipPlaySet(activeSetName);
        setStatus(t("status_bunker_reclaimed"));
      }
      setShelterActive(active);
    } catch (err) {
      setStatus(`${t("status_shelter_error")}${err}`);
    }
  }
  const deleteBackup = async (fileName: string) => {
    try {
      await invoke("delete_backup", { fileName });
      fetchBackups();
    } catch (err) {
      alert(`${t("alert_deletion_failed")}${err}`);
    }
  };
  const triggerFullEngineBackup = async () => {
    const config: any = await invoke("get_saved_coordinates");
    useModalStore.getState().setBackupType('engine');
    setIsBackingUp(true);
    try {
      await invoke("backup_engine_full", {
        livePath: config.live_path,
        version: selectedVersion,
      });
      fetchBackups();
    } catch (err) {
      alert(`${t("alert_backup_failed")}${err}`);
    } finally {
      setIsBackingUp(false);
    }
  };
  async function restoreMod(filename: string) {
    await invoke("restore_quarantined_file", { filename });
    fetchVault();
    runRadarSweep(false);
  }
  function purgeMod(filename: string) {
    setConfirmDialog({
      message: `${t("confirm_delete_file_prefix")}${filename}${t("confirm_delete_file_suffix")}`,
      action: async () => {
        setConfirmDialog(null);
        await invoke("purge_quarantined_file", { filename });
        fetchVault();
      },
    });
  }
  const triggerPrePatchSnapshot = async () => {
    const config: any = await invoke("get_saved_coordinates");
    const docsBase = config.mods_path.replace(/[\\/]Mods[\\/]?$/i, "");
    setStatus(`${t("log_icon_backups")} Executing Pre-Patch Snapshot...`);
    useModalStore.getState().setBackupType('world');
    setIsBackingUp(true);
    try {
      await invoke("backup_universe", {
        docsPath: docsBase,
        version: selectedVersion,
      });
      fetchBackups();
      setStatus(`${t("ui_icon_success")} Pre-Patch Snapshot Secured.`);
    } catch (err) {
      console.error(err);
      alert(`${t("alert_backup_failed")}${err}`);
    } finally {
      setIsBackingUp(false);
    }
  };
  useGlobalListeners(fetchBackups, askCustom, t, triggerPrePatchSnapshot, triggerFullEngineBackup);
  const handleQuickLaunch = async () => {
      const config: any = await invoke("get_saved_coordinates");
    if (isPatchDetected || defconLevel < 5) {
      const pref = Number(config.backup_preference || 0);
      if (pref === 2) {
        const confirmLoneWolf = await askCustom(
          t("defcon_lonewolf_warning"),
          false,
          t("defcon_btn_launch_danger"),
          t("playsets_btn_cancel"),
          true,
          "DEFCON 1 INTERCEPT!",
        );
        if (!confirmLoneWolf) return;
      } else if (pref === 1) {
        const hasBackedUp = localStorage.getItem(
          "sanctuary_defcon_backup_done",
        );
        if (hasBackedUp) {
          const confirm = await askCustom(
            t("defcon_prompt_already_backed_up"),
            false,
            t("defcon_btn_launch_danger"),
            t("playsets_btn_cancel"),
            true,
            "DEFCON 1 INTERCEPT!",
          );
          if (!confirm) return;
        } else {
          const confirmAlert = await askCustom(
            t("defcon_prompt_intercept_launch"),
            false,
            t("defcon_btn_backup_launch"),
            t("defcon_btn_launch_danger"),
            true,
            "DEFCON 1 INTERCEPT!",
          );
          if (confirmAlert) {
            setStatus(
              `${t("log_icon_fatal")} Intercept: Forcing emergency backup before ignition...`,
            );
            await triggerPrePatchSnapshot();
            localStorage.setItem("sanctuary_defcon_backup_done", "true");
          } else {
            const proceedAnyway = await askCustom(
              t("defcon_prompt_confirm_danger"),
              false,
              t("defcon_btn_launch_danger"),
              t("playsets_btn_cancel"),
              true,
              "CONFIRM DANGER",
            );
            if (!proceedAnyway) return;
          }
        }
      } else {
        const hasBackedUp = localStorage.getItem(
          "sanctuary_defcon_backup_done",
        );
        if (hasBackedUp) {
          const confirm = await askCustom(
            t("defcon_prompt_already_backed_up"),
            false,
            t("defcon_btn_launch_danger"),
            t("playsets_btn_cancel"),
            true,
            "DEFCON 1 INTERCEPT!",
          );
          if (!confirm) return;
        } else {
          const confirm = await askCustom(
            t("defcon_launch_intercept"),
            false,
            t("defcon_btn_launch_danger"),
            t("playsets_btn_cancel"),
            true,
            "DEFCON 1 INTERCEPT!",
          );
          if (!confirm) return;
          setStatus(
            `${t("log_icon_fatal")} Intercept: Forcing emergency backup before ignition...`,
          );
          await triggerPrePatchSnapshot();
          localStorage.setItem("sanctuary_defcon_backup_done", "true");
        }
      }
    }
    try {
      const config: any = await invoke("get_saved_coordinates");
      const msg = await invoke("launch_game", {
        livePath: config.live_path,
        modsPath: config.mods_path,
      });
      setStatus(t(msg as string) || (msg as string));
    } catch (err) {
      setStatus(`${t("status_launch_failed")}: ${t(err as string) || err}`);
    }
  };
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
      const configPath = activeDossier.name.replace(".package", ".cfg");
      const config: any = await invoke("get_saved_coordinates");
      const fullPath = `${config.mods_path}/${configPath}`;
      const msg = await invoke<string>("save_config_file", {
        path: fullPath,
        content: configContent,
      });
      setStatus(`${t("ui_icon_success")} ${msg}`);
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
      const { error } = await supabase.from("solder_lab_logs").insert([
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
      const finalStatus = testErrorFound ? "broken" : "verified";
      const uiStatus = testErrorFound
        ? t("status_broken")
        : t("status_verified");
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
           await supabase.from("solder_lab_logs").insert([{
             mod_id: verData.mod_id,
             version_id: verData.id,
             log_snippet: testLogSnippet,
             tester_note: labContext ? JSON.stringify(labContext) : t("status_report_automated"),
           }]);
        }
      }
      if (shelterActive) {
        setStatus(t("status_restoring_bunker_full"));
        const lastSet = localStorage.getItem("sanctuary_active_set");
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
        const cleanMod = (mod.name || "").split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, '');
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
      setStatus(t("status_proving_run"));
      
      let depPaths: string[] = [];
      let modAId = activeLabMod.dbId;
      if (!modAId) {
        const { data: verA } = await supabase.from("mod_versions").select("mod_id").eq("dna_hash", activeLabMod.hash).maybeSingle();
        modAId = verA?.mod_id;
      }
      if (!modAId) {
        const cleanModA = (activeLabMod.name || "").split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, '');
        const { data: modA } = await supabase.from("mods").select("id").ilike("name", cleanModA || "").maybeSingle();
        modAId = modA?.id;
      }

      let modBId = conflictTarget?.dbId;
      if (conflictTarget && !modBId) {
        const { data: verB } = await supabase.from("mod_versions").select("mod_id").eq("dna_hash", conflictTarget.hash).maybeSingle();
        modBId = verB?.mod_id;
      }
      if (conflictTarget && !modBId) {
        const cleanModB = (conflictTarget.name || "").split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, '');
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
        ...(activeLabMod.isVirtual && activeLabMod.flavors ? activeLabMod.flavors.map((f:any) => f.name) : [activeLabMod.name]),
        ...(conflictTarget ? (conflictTarget.isVirtual && conflictTarget.flavors ? conflictTarget.flavors.map((f:any) => f.name) : [conflictTarget.name]) : []),
        ...depPaths,
        ...associatedMods.map((m: any) => m.name),
        ...extraDeployNames
      ]);
      
      const deployMods = Array.from(rawDeploySet).map((modName: string) => {
        const modObj = modList.find((m: any) => {
          if (m.isVirtual) return false;
          if (m.name === modName || m.displayName === modName) return true;
          const mBase = m.name.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, '').toLowerCase();
          const targetBase = modName.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, '').toLowerCase();
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
      setLogWatcher(interval as any); 
    } catch (err) {
      setStatus(`${t("status_lab_error")} ${typeof err === "string" ? t(err) : t((err as any)?.message || String(err))}`);
    }
  };
  async function pickLivePath() {
    const s = await open({ directory: true });
    if (s) setLivePath(s as string);
  }
  async function pickModsPath() {
    const s = await open({ directory: true });
    if (s) setModsPath(s as string);
  }
  async function pickVaultPath() {
    const s = await open({ directory: true });
    if (s) setVaultPath(s as string);
  }
  async function lockCoordinates() {
    if (!livePath || !modsPath || !vaultPath) {
      alert(t("alert_select_paths"));
      return;
    }
    await invoke("save_coordinates", { livePath, modsPath, vaultPath });
    setIsConfigured(true);
  }
  const filteredMods = displayModList.filter((mod) => {
    if (!mod) return false;
    if (!mod.isVirtual && mod.name) {
      const ext = mod.name.split('.').pop()?.toLowerCase();
      if (ext !== 'package' && ext !== 'ts4script') {
        return false;
      }
    }
    const checkMatch = (m: any) => {
      const name = (m.displayName || m.name || "").toLowerCase();
      const author = (m.author || "").toLowerCase();
      const matchesSearch =
        name.includes(searchQuery.toLowerCase()) ||
        author.includes(searchQuery.toLowerCase());
      const activeSetMods =
        playSets.find((s) => s.name === activeSetName)?.mods || [];
      const isActuallyEquipped = activeSetMods.includes(m.name);
      const matchesEquip =
        equipFilter === "ALL" ||
        equipFilter === "ARCHIVES" ||
        (equipFilter === "EQUIPPED" && isActuallyEquipped) ||
        (equipFilter === "UNEQUIPPED" && !isActuallyEquipped);
      const modType = (m.category_override || m.type || "NONE").toUpperCase();
      const matchesCategory =
        activeCategory === "ALL" || modType === activeCategory.toUpperCase();
      const subType = (m.sub_type || "").toUpperCase();
      const matchesSubType =
        activeSubType === "ALL" || subType === activeSubType.toUpperCase();
      const rawStatus = (m.status || "").toLowerCase();
      const strVerified = (t("status_verified")).toLowerCase();
      const strReview = (t("status_under_review")).toLowerCase();
      const strUnverified = (t("status_unverified")).toLowerCase();
      const strLocal = (t("status_local_only")).toLowerCase();
      let matchesStatus = false;
      if (filterStatus === "ALL") {
        matchesStatus = true;
      } else if (filterStatus === "VERIFIED") {
        matchesStatus =
          rawStatus.includes(strVerified) && !rawStatus.includes(strUnverified);
      } else if (filterStatus === "REVIEW") {
        matchesStatus = rawStatus.includes(strReview);
      } else if (filterStatus === "UNVERIFIED") {
        matchesStatus =
          rawStatus.includes(strUnverified) || rawStatus.includes(strLocal);
      }
      return (
        matchesSearch &&
        matchesEquip &&
        matchesStatus &&
        matchesCategory &&
        matchesSubType
      );
    };
    if (mod.isVirtual) {
      return (mod.flavors || []).some((f: any) => checkMatch(f));
    }
    return checkMatch(mod);
  });
  const visibleMods = filteredMods;
  if (!isConfigured) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0a0d14] font-sans relative overflow-hidden">
        
        {/* Balanced Ambient Background */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none z-0" style={{ backgroundImage: 'linear-gradient(rgba(255, 255, 255, 1) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 1) 1px, transparent 1px)', backgroundSize: '50px 50px' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full theme-bg-accent opacity-[0.06] blur-[120px] pointer-events-none z-0 mix-blend-screen" />

        {/* Premium Glass Modal */}
        <div className="relative z-10 w-full max-w-[420px] bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-3xl p-10 shadow-[0_40px_100px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.1)] flex flex-col group">
          
          <div className="flex flex-col items-center justify-center text-center mb-10">
            <div className="w-16 h-16 mb-4 relative flex items-center justify-center">
              <div className="absolute inset-0 theme-bg-accent opacity-20 blur-xl rounded-full" />
              <img src="/icon.png" alt="" className="w-12 h-12 object-contain relative z-10 drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]" />
            </div>
            <h1 className="text-3xl font-black uppercase tracking-widest text-white drop-shadow-md">
              {t("setup_title")}
            </h1>
            <p className="text-[9px] font-bold uppercase tracking-[0.3em] theme-text-accent opacity-80 mt-2">
              {t("status_cartographer_init")}
            </p>
          </div>

          <div className="flex flex-col gap-4 w-full relative z-20">
            <button 
              onClick={async () => {
                try {
                  const paths: any = await invoke("auto_detect_paths");
                  if (paths) {
                    if (paths.live_path) useStore.getState().setLivePath(paths.live_path);
                    if (paths.mods_path) useStore.getState().setModsPath(paths.mods_path);
                    if (paths.vault_path) useStore.getState().setVaultPath(paths.vault_path);
                    setStatus(t("status_autodetect_success"));
                  }
                } catch(e) {
                  console.error(e);
                  setStatus(t("status_autodetect_failed"));
                }
              }} 
              className="w-full bg-white/[0.03] backdrop-blur-md border border-white/10 px-6 py-4 rounded-xl text-[10px] font-black text-white/60 hover:text-white hover:bg-white/10 hover:border-white/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3 uppercase tracking-widest mb-4 shadow-sm"
            >
              <span>{t("ui_icon_cloud")} {t("auto_auto_detect_paths")}</span>
            </button>

            <button onClick={pickLivePath} className="w-full bg-black/20 backdrop-blur-md border border-white/10 px-6 py-4 rounded-xl text-[10px] font-bold text-white hover:bg-white/5 focus:outline-none focus:border-[var(--accent)] transition-all flex items-center justify-between group shadow-sm">
              <span className="uppercase tracking-widest">{livePath ? t("setup_btn_bin_locked") : t("setup_btn_bin")}</span>
              <div className={`w-2 h-2 rounded-full ${livePath ? 'theme-bg-success shadow-[0_0_10px_var(--success)]' : 'theme-bg-warning animate-pulse'}`} />
            </button>
            <button onClick={pickModsPath} className="w-full bg-black/20 backdrop-blur-md border border-white/10 px-6 py-4 rounded-xl text-[10px] font-bold text-white hover:bg-white/5 focus:outline-none focus:border-[var(--accent)] transition-all flex items-center justify-between group shadow-sm">
              <span className="uppercase tracking-widest">{modsPath ? t("setup_btn_mods_locked") : t("setup_btn_mods")}</span>
              <div className={`w-2 h-2 rounded-full ${modsPath ? 'theme-bg-success shadow-[0_0_10px_var(--success)]' : 'theme-bg-warning animate-pulse'}`} />
            </button>
            <button onClick={pickVaultPath} className="w-full bg-black/20 backdrop-blur-md border border-white/10 px-6 py-4 rounded-xl text-[10px] font-bold text-white hover:bg-white/5 focus:outline-none focus:border-[var(--accent)] transition-all flex items-center justify-between group shadow-sm">
              <span className="uppercase tracking-widest">{vaultPath ? t("setup_btn_vault_locked") : t("setup_btn_vault")}</span>
              <div className={`w-2 h-2 rounded-full ${vaultPath ? 'theme-bg-success shadow-[0_0_10px_var(--success)]' : 'theme-bg-warning animate-pulse'}`} />
            </button>

            <button
              onClick={lockCoordinates}
              disabled={!livePath || !modsPath || !vaultPath}
              className="w-full mt-2 py-4 rounded-xl font-black text-[11px] uppercase tracking-[0.2em] transition-all bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] backdrop-blur-md border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] theme-text-accent hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_20%,transparent)] active:scale-[0.98] disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
            >
              {t("setup_btn_lock")}
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div
      className="flex h-screen w-screen font-sans overflow-hidden"
      style={{ backgroundColor: "var(--bg)", color: "var(--text)", "--sidebar-width": isSidebarCollapsed ? "80px" : "288px" } as React.CSSProperties}
    >
      <TitleBar />
      <nav 
        className={`${isSidebarCollapsed ? 'min-w-[80px] w-[80px]' : 'min-w-[288px] w-[288px]'} flex-shrink-0 h-full flex flex-col backdrop-blur-2xl border-r border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-[4px_0_30px_rgba(0,0,0,0.1)] relative z-20 transition-all duration-500`}
        style={{ backgroundColor: "var(--sidebar)", color: "var(--sidebartext)" }}
      >
        <div 
          className={`p-6 flex items-center gap-4 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] cursor-pointer hover:bg-white/5 transition-colors ${isSidebarCollapsed ? 'justify-center px-0' : ''}`}
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        >
          <img 
            src="/icon.png" 
            alt={t("auto_sanctuary_os")} 
            className="w-10 h-10 shrink-0 drop-shadow-[0_0_15px_rgba(255,255,255,0.15)] hover:scale-110 hover:drop-shadow-[0_0_20px_rgba(255,255,255,0.3)] transition-all duration-300"
          />
          {!isSidebarCollapsed && (
            <div className="overflow-hidden whitespace-normal flex flex-col justify-center mt-1">
              <h1 className="text-[17px] font-black tracking-[0.15em] uppercase text-left bg-gradient-to-r from-[var(--text)] to-[var(--accent)] bg-clip-text text-transparent">
                {t("sidebar_app_title")}
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                 <div className="w-1 h-1 rounded-sm theme-bg-accent animate-pulse shadow-[0_0_8px_var(--accent)]" />
                 <p key={subtitleIndex} className="text-[9px] uppercase tracking-[0.1em] text-[var(--subtext)] font-bold text-left animate-in fade-in slide-in-from-left-2 duration-700 mt-0.5 leading-tight">
                   {t(`sidebar_app_subtitle_${subtitleIndex}`)}
                 </p>
              </div>
            </div>
          )}
        </div>
        <div className="flex-1 py-6 px-4 space-y-1 overflow-y-auto overflow-x-hidden accent-scrollbar">
          <NavButton
            active={view === "dashboard"}
            onClick={() => setView("dashboard")}
            icon={t("ui_icon_pc")}
            label={t("sidebar_cmd_center")}
            isCollapsed={isSidebarCollapsed}
            isAccent={true}
          />
          <NavButton
            active={view === "vault"}
            onClick={() => setView("vault")}
            icon={t("ui_icon_architect")}
            label={t("sidebar_collection")}
            isCollapsed={isSidebarCollapsed}
            isAccent={true}
          />
          {session && localStorage.getItem("sanctuary_blacklisted") !== "true" && (
            <NavButton
              active={view === "marketplace"}
              onClick={() => setView("marketplace")}
              icon={t("ui_icon_hub")}
              label={t("sidebar_marketplace")}
              isCollapsed={isSidebarCollapsed}
              isAccent={true}
            />
          )}
          <NavButton
            active={view === "playsets"}
            onClick={() => setView("playsets")}
            icon={t("ui_icon_playsets")}
            label={t("playsets_title")}
            isCollapsed={isSidebarCollapsed}
            isAccent={true}
          />
          {session && localStorage.getItem("sanctuary_blacklisted") !== "true" && (
            <NavButton
              active={view === "GlobalFeed"}
              onClick={() => setView("GlobalFeed")}
              icon={t("ui_icon_broadcast")}
              label={t("sidebar_commlink")}
              isCollapsed={isSidebarCollapsed}
              isAccent={true}
            />
          )}
          <NavButton
            active={view === "DbpfScout"}
            onClick={() => setView("DbpfScout")}
            icon={t("ui_icon_radar")}
            label={t("sidebar_radar")}
            isCollapsed={isSidebarCollapsed}
            isAccent={true}
          />
          <NavButton
            active={view === "lab"}
            onClick={() => setView("lab")}
            icon={t("ui_icon_lab")}
            label={t("sidebar_lab")}
            isCollapsed={isSidebarCollapsed}
            isAccent={true}
          />
          <NavButton
            active={view === "CitizensWorkbench"}
            onClick={() => setView("CitizensWorkbench")}
            icon={t("ui_icon_design_services")}
            label={t("workbench_title_sidebar")}
            isCollapsed={isSidebarCollapsed}
            isAccent={true}
          />
          <NavButton
            active={view === "backups"}
            onClick={() => setView("backups")}
            icon={t("ui_icon_backups")}
            label={t("sidebar_time_capsule")}
            isCollapsed={isSidebarCollapsed}
            isAccent={true}
          />
          {session && ["mason", "wayfinder", "admin"].includes(userRole) && (
            <div className={`my-4 border-t border-white/5 pt-4 ${isSidebarCollapsed ? 'px-0' : ''}`}>
              {!isSidebarCollapsed && (
                <p className="px-3 text-[10px] font-semibold text-[var(--subtext)] opacity-60 uppercase tracking-widest mb-2 text-left truncate">
                  {t("sidebar_creator_tools")}
                </p>
              )}
              <NavButton
                active={view === "MasonHub"}
                onClick={() => setView("MasonHub")}
                icon={t("ui_icon_mason")}
                label={t("sidebar_mason_hub")}
                isCollapsed={isSidebarCollapsed}
                isAccent={true}
              />
            </div>
          )}
          {session && ["architect", "wayfinder", "admin"].includes(userRole) && (
            <div className={`my-4 border-t border-white/5 pt-4 ${isSidebarCollapsed ? 'px-0' : ''}`}>
              {!isSidebarCollapsed && (
                <p className="px-3 text-[10px] font-semibold text-[var(--subtext)] opacity-60 uppercase tracking-widest mb-2 text-left truncate">
                  {t("sidebar_architect_tools")}
                </p>
              )}
              <NavButton
                active={view === "ArchitectHub"}
                onClick={() => setView("ArchitectHub")}
                icon={t("ui_icon_analytics")}
                label={t("sidebar_architect_hub")}
                isCollapsed={isSidebarCollapsed}
                isAccent={true}
              />
            </div>
          )}
          {session && ["senior_architect", "wayfinder", "admin"].includes(userRole) && (
            <div className={`my-4 border-t border-white/5 pt-4 ${isSidebarCollapsed ? 'px-0' : ''}`}>
              {!isSidebarCollapsed && (
                <p className="px-3 text-[10px] font-semibold text-[var(--subtext)] opacity-60 uppercase tracking-widest mb-2 text-left truncate">
                  {t("sidebar_senior_architect")}
                </p>
              )}
              <NavButton
                active={view === "SeniorArchitect"}
                onClick={() => setView("SeniorArchitect")}
                icon={t("ui_icon_shield")}
                label={t("sidebar_oversight")}
                isCollapsed={isSidebarCollapsed}
                isAccent={true}
              />
            </div>
          )}
          {/* Wayfinder Tools (Only for wayfinder/admin) */}
          {session && (userRole === "wayfinder" || userRole === "admin") && (
            <div className={`my-4 border-t border-white/5 pt-4 ${isSidebarCollapsed ? 'px-0' : ''}`}>
              {!isSidebarCollapsed && (
                <p className="px-3 text-[10px] font-semibold text-[var(--subtext)] opacity-60 uppercase tracking-widest mb-2 text-left truncate">
                  {t("sidebar_wayfinder_tools")}
                </p>
              )}
              <NavButton
                active={view === "WayfinderHub"}
                onClick={() => setView("WayfinderHub")}
                icon={t("ui_icon_terminal")}
                label={t("sidebar_wayfinder_hub")}
                isCollapsed={isSidebarCollapsed}
                isAccent={true}
              />
            </div>
          )}
          {!session && (
            <div className="my-4 border-t border-white/5 pt-4">
              <NavButton
                onClick={() => {
                  localStorage.setItem("sanctuary_show_login", "true");
                  window.location.reload();
                }}
                icon={t("ui_icon_key")}
                label={t("sidebar_signin")}
                isCollapsed={isSidebarCollapsed}
                isAccent={true}
              />
            </div>
          )}
        </div>
        <div className="p-4 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] flex flex-col gap-2 relative">
          <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent opacity-10" />
          {session && (
            <NavButton
              active={isNotificationSidebarOpen}
              onClick={() => setIsNotificationSidebarOpen(true)}
              icon={
                <>
                  {t("auto_notifications")}
                  {unreadNotificationCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse border border-[var(--bg)]" />
                  )}
                </>
              }
              label={t("notif_title")}
              isCollapsed={isSidebarCollapsed}
              isAccent={true}
            />
          )}
          <NavButton
            active={view === "settings"}
            onClick={() => setView("settings")}
            icon={t("ui_icon_settings")}
            label={t("sidebar_settings")}
            isCollapsed={isSidebarCollapsed}
            isAccent={true}
          />
          <div className="relative group/nav mt-2">
            <button
              onClick={handleQuickLaunch}
              className={`w-full py-3 rounded-xl font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 shadow-xl backdrop-blur-md border ${isPatchDetected || defconLevel < 5 ? "text-[var(--danger)] border-[var(--danger)]/30 shadow-[0_0_20px_rgba(var(--danger-rgb),0.2)] hover:shadow-[0_0_30px_rgba(var(--danger-rgb),0.4)] hover:bg-black/20" : "text-[var(--success)] border-[var(--success)]/30 shadow-[0_0_20px_rgba(var(--success-rgb),0.2)] hover:shadow-[0_0_30px_rgba(var(--success-rgb),0.4)] hover:bg-black/20"}`}
              style={isPatchDetected || defconLevel < 5 ? { backgroundColor: 'rgba(var(--danger-rgb), 0.15)' } : { backgroundColor: 'rgba(var(--success-rgb), 0.15)' }}
            >
              {isSidebarCollapsed ? <span className="material-symbols-outlined !text-xl drop-shadow-md">{t("ui_icon_rocket_launch")}</span> : <><span className="material-symbols-outlined !text-xl drop-shadow-md">{t("ui_icon_rocket_launch")}</span> {t("sidebar_quick_launch")}</>}
            </button>
            {isSidebarCollapsed && (
              <div className="absolute left-full top-1/2 -translate-y-1/2 ml-4 px-4 py-2 bg-[var(--sidebar)] border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-[var(--text)] whitespace-nowrap shadow-[0_10px_30px_rgba(0,0,0,0.5)] opacity-0 invisible group-hover/nav:opacity-100 group-hover/nav:visible transition-all duration-300 z-[1000] pointer-events-none">
                {t("sidebar_quick_launch")}
              </div>
            )}
          </div>
        </div>
      </nav>
      <main className="flex-1 h-full relative overflow-y-auto p-12 pt-[90px] custom-scrollbar">
        <div className="absolute top-0 left-1/4 w-96 h-96 theme-bg-accent opacity-10 rounded-full blur-[120px] pointer-events-none z-0" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 theme-bg-accent opacity-10 rounded-full blur-[120px] pointer-events-none z-0" />
        <div className="relative z-10 w-full h-full">
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

          {view === "marketplace" && (
            <Marketplace
              ownedHashes={modList.map((m) => m.hash).filter((h) => !!h)}
              onSetStatus={setStatus}
              onOpenMasonProfile={handleOpenMasonProfile}
              onOpenDossier={setActiveDossier}
            />
          )}
          {view === "vault" && (
            <ErrorBoundary moduleName="Collection">
              <Collection 
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
            <ErrorBoundary moduleName="Solder Lab">
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
            ["architect", "senior_architect", "wayfinder", "admin"].includes(
                userRole,
              ) && (
                <ErrorBoundary moduleName="Architect Hub">
                  <ArchitectHub userRole={userRole} equipPlaySet={equipPlaySet} modList={modList} setStatus={setStatus} />
                </ErrorBoundary>
              )}
          {view === "SeniorArchitect" &&
            ["senior_architect", "wayfinder", "admin"].includes(userRole) && (
              <ErrorBoundary moduleName="Senior Architect">
                <SeniorArchitect />
              </ErrorBoundary>
            )}
          {view === "WayfinderHub" &&
            ["wayfinder", "admin"].includes(userRole) && (
              <ErrorBoundary moduleName="Wayfinder Hub">
                <WayfinderHub onOpenMasonProfile={handleOpenMasonProfile} />
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
                onModClick={(mod) => setActiveDossier(mod)}
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
              setStatus(`${t("ui_icon_success")} ${t("status_file_shredded")}`);
              runRadarSweep();
            } catch (err: any) {
              setStatus(` Error: ${err}`);
            }
          }}
        />
        </ErrorBoundary>
      )}
      <AppModals
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
          const defaultName = (mod.displayName || mod.name || "").split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, '').replace(/_/g, ' ') || "";
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
    </div>
  );
}
function NavButton({
  id,
  label,
  icon,
  activeTab,
  setTab,
  active,
  onClick,
  isCollapsed,
  isAccent
}: any) {
  const isActive = active !== undefined ? active : activeTab === id;
  const handleClick = () => {
    if (onClick) onClick();
    else if (setTab && id) setTab(id);
  };
  return (
    <div className="relative group/nav">
      <button
        onClick={handleClick}
        className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all duration-500 group relative overflow-hidden
          ${
            isActive
              ? (isAccent ? "theme-bg-accent/10 theme-text-accent shadow-[0_0_20px_rgba(var(--accent-rgb),0.15)] border border-[var(--accent)]/30 backdrop-blur-md" : "bg-white/10 text-[var(--sidebartext)] shadow-lg border border-white/10")
              : (isAccent ? "text-[var(--sidebartext)] opacity-70 hover:opacity-100 hover:theme-bg-accent/5 hover:theme-text-accent border border-transparent" : "text-[var(--sidebartext)] opacity-60 hover:bg-white/5 hover:text-gray-300 border border-transparent")
          } ${isCollapsed ? 'justify-center px-0' : ''}`}
      >
        {isActive && <div className="absolute inset-y-0 left-0 w-1 theme-bg-accent shadow-[0_0_10px_var(--accent)] rounded-r-full animate-in fade-in slide-in-from-left-2 duration-300" />}
        <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/5 to-white/0 -translate-x-[150%] group-hover:translate-x-[150%] transition-transform duration-1000 ease-in-out pointer-events-none" />
        <span
          className={`material-symbols-outlined !text-[22px] transition-all duration-500 shrink-0 relative z-10 ${isActive ? "scale-110 drop-shadow-md" : "group-hover:scale-110 group-hover:drop-shadow-sm"}`}
        >
          {icon}
        </span>
        {!isCollapsed && (
          <span className="text-[11px] font-black uppercase tracking-[0.15em] truncate leading-none pt-0.5 relative z-10">
            {label}
          </span>
        )}
      </button>
      {isCollapsed && (
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-4 px-4 py-2 bg-[var(--sidebar)] border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-[var(--text)] whitespace-nowrap shadow-[0_10px_30px_rgba(0,0,0,0.5)] opacity-0 invisible group-hover/nav:opacity-100 group-hover/nav:visible transition-all duration-300 z-[1000] pointer-events-none backdrop-blur-xl">
          {label}
        </div>
      )}
    </div>
  );
}

export default App;
