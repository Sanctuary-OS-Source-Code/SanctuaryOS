
import { YeetConfirmAlert } from "./YeetConfirmAlert";
import { DefconAlert } from "./DefconAlert";
import { ToastProvider } from "./Toast";
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
import { ModData, ViewHeader } from "./shared";
import { ModCard } from "./ModCard";
import ModDossier from "./ModDossier";
import BlueprintArchitect from "./BlueprintArchitect";
import Marketplace from "./Marketplace";
import { DbpfScout } from "./DbpfScout";
import { useLexicon } from "./LexiconContext";
import MasonHub from "./MasonHub";
import MasonProfile from "./MasonProfile";
import CommandCenter from "./CommandCenter";
import Blueprints from "./Blueprints";
import Collection from "./Collection";
import Lab from "./Lab";
import TimeCapsule from "./TimeCapsule";
import SeniorArchitect from "./SeniorArchitect";

const setupBtnStyle: React.CSSProperties = {
  padding: "12px",
  backgroundColor: "rgba(255,255,255,0.05)",
  color: "white",
  border: "none",
  borderRadius: "4px",
  cursor: "pointer",
};

function App() {
  const { t } = useLexicon();
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
      alias: alias || t("backups_unknown"),
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
  const setStatus = useStore((state) => state.setStatus);
  const session = useStore((state) => state.session);

  const modList = useStore((state) => state.modList);
  const setModList = useStore((state) => state.setModList);

  useEffect(() => {
    async function checkForUpdates() {
      try {
        const update = await check();
        if (update) {
          setConfirmDialog({
            message: `Sanctuary OS ${update.version} is available!\n\nWould you like to download and install this update now?`,
            confirmText: "UPDATE",
            action: async () => {
              setConfirmDialog(null);
              setStatus("DOWNLOADING UPDATE...");
              try {
                await update.downloadAndInstall();
                setStatus("RESTARTING...");
                await relaunch();
              } catch (e) {
                setStatus("UPDATE FAILED: " + e);
              }
            },
            cancelText: "SKIP",
            cancelAction: () => setConfirmDialog(null)
          });
        }
      } catch (e) {
        // console.error("Update check failed", e);
      }
    }
    checkForUpdates();

    let isProcessingDrop = false;
    const unlistenPromise = getCurrentWebview().onDragDropEvent((event) => {
      if (isProcessingDrop) return;
      
      if (event.payload.type === "enter" || event.payload.type === "over") {
        setIsDragging(true);
      } else if (event.payload.type === "leave") {
        setIsDragging(false);
      } else if (event.payload.type === "drop") {
        setIsDragging(false);
        const paths = event.payload.paths;
        if (paths && paths.length > 0) {
          isProcessingDrop = true;
          setIsDropzoneOpen(true);
          setDropzoneState("ingesting");
          setIngestProgress({ active: true, current: 0, total: paths.length });
          // Give React two animation frames to paint the INGESTING UI before we block IPC
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setTimeout(async () => {
                 const startTime = Date.now();
                 await handleDroppedFiles(paths);
                 
                 // Enforce minimum 1.5s loading screen so it doesn't just flash instantly
                 const elapsed = Date.now() - startTime;
                 if (elapsed < 1500) {
                   await new Promise(r => setTimeout(r, 1500 - elapsed));
                 }
                 
                 isProcessingDrop = false;
                 setIsDropzoneOpen(false);
                 setDropzoneState("awaiting");
                 setDroppedFiles([]);
                 setIngestProgress({ active: false, current: 0, total: 0 });
              }, 50);
            });
          });
        }
      }
    });
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);
  async function handleDroppedFiles(paths: string[]) {
    setDropzoneState("ingesting");
    setStatus(
      `${t("status_mass_ingestion_prefix")}${paths.length}${t("status_mass_ingestion_suffix")}`,
    );
    try {
      for (let i = 0; i < paths.length; i++) {
        setIngestProgress({ active: true, current: i + 1, total: paths.length });
        try {
          await invoke("ingest_dropped_file", { path: paths[i], forceReplace: false });
        } catch (err) {
          if (err !== "DNA_MATCH") {
            setStatus(`${t("status_link_failed")}${err}`);
          }
        }
      }
      setStatus(t("status_ingest_success"));
      runRadarSweep(true); 
    } catch (err) {
      setStatus(`${t("status_link_failed")}${err}`);
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
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [equipFilter, setEquipFilter] = useState("ALL");
  const [activeDossier, setActiveDossier] = useState<ModData | null>(null);
  const [labQueue, setLabQueue] = useState<ModData[]>([]);
  const [activeLabMod, setActiveLabMod] = useState<ModData | null>(null);
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
  const [isBlueprintModalOpen, setIsBlueprintModalOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [cloudSearchResults, setCloudSearchResults] = useState<any[]>([]);
  const [isSearchingCloud, setIsSearchingCloud] = useState(false);
  const [isDraftingSet, setIsDraftingSet] = useState(false);
  const [draftSetName, setDraftSetName] = useState("");

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

  const saveLocalMetadata = async () => {
    if (!activeDossier || !metaNameInput.trim()) return;
    setStatus("Syncing metadata to the Network...");
    try {
      let { data: existingMod } = await supabase
        .from("mods")
        .select("id")
        .eq("name", metaNameInput.trim())
        .single();
        
      if (!existingMod) {
        const { data: newMod, error: insertError } = await supabase
          .from("mods")
          .insert([{ 
            name: metaNameInput.trim(), 
            master_author: metaAuthorInput.trim() || null,
            image_url: metaImageInput.trim() || null,
            status: "unverified" 
          }])
          .select()
          .single();
        if (insertError) throw insertError;
        existingMod = newMod;
      }
      
      if (existingMod && activeDossier.hash) {
        await supabase.from("mod_versions").upsert(
          [
            {
              mod_id: existingMod.id,
              dna_hash: activeDossier.hash,
              version_label: metaVersionInput || "v.1.0",
            },
          ],
          { onConflict: "dna_hash" },
        );
      }
      setStatus(`✓ Artifact metadata submitted to registry.`);
      setIsEditingMeta(false);
      setEditMode(false);
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
      if (ignoredHashesRef.current.has(event.payload.hash)) return;
      setDnaMatchQueue((prev: any[]) => {
        if (prev.some((m) => m.hash === event.payload.hash)) return prev;
        return [...prev, event.payload];
      });
    }).then((handler) => { unlisten = handler; });
    return () => { if (unlisten) unlisten(); };
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
      alert("Error: Mason Profile ID is missing.");
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
    return () => {
      unlisten.then((f) => f());
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
      isBlueprintModalOpen ||
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
    isBlueprintModalOpen,
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
            `${t("status_offline_cache_prefix")}${parsedCache.length}${t("status_offline_cache_suffix")}`,
          );
        }
      } catch (e) {
        console.error("Failed to load cache", e);
        localStorage.removeItem("sanctuary_cache_v9");
      }
    }
  }, []);


  const toggleInActiveSet = (targetName: string, excludeBroken: boolean = false) => {
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
      const targetMod = modList.find((m) => m.name === targetName);
      if (!targetMod) return prevSets;
      const kids = targetMod.isVirtual
        ? modList.filter(
            (m) =>
              (String(m.familyId) === String(targetMod.dbId) ||
                String(m.setId) === String(targetMod.dbId)) &&
              !m.isVirtual,
          )
        : [];
      const isActuallyFlavorFolder =
        targetMod.isVirtual && kids.some((k) => k.flavorGroupId != null);
      let isEquipping = targetMod.isVirtual
        ? !kids.some((k) => newMods.has(k.name))
        : !newMods.has(targetName);
      const deepDelete = (nameToDelete: string) => {
        if (!newMods.has(nameToDelete)) return;
        newMods.delete(nameToDelete);
        if (currentRules.dependencies !== false) {
          const mData = modList.find((m) => m.name === nameToDelete);
          if (mData) {
            modList
              .filter(
                (m) =>
                  m.requirements?.some((r: any) => {
                    const reqId = typeof r === 'string' ? r : r.id || r.dbId;
                    const reqName = typeof r === 'string' ? r : r.name;
                    const reqBaseName = reqName?.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, "").toUpperCase();
                    const isReqNumeric = !isNaN(Number(reqName));
                    return (reqId && String(mData.dbId) === String(reqId)) ||
                           (reqId && mData.hash === reqId) ||
                           (!isReqNumeric && reqBaseName && mData.displayName && (mData.displayName.toUpperCase().includes(reqBaseName) || mData.displayName.toUpperCase().replace(/_/g, " ").includes(reqBaseName.replace(/_/g, " "))));
                  }) && newMods.has(m.name),
              )
              .forEach((dep) => deepDelete(dep.name));
          }
        }
      };
      const addWithFamily = (modObj: any) => {
        if (!modObj || !modObj.name) return;
        if (excludeBroken && (modObj.status === t("status_broken") || modObj.status?.includes("BROKEN"))) return;
        if (modObj.flavorGroupId && currentRules.highlander !== false) {
          modList
            .filter(
              (m) =>
                String(m.flavorGroupId) === String(modObj.flavorGroupId) &&
                m.name !== modObj.name,
            )
            .forEach((rival) => deepDelete(rival.name));
        }
        newMods.add(modObj.name);
        const anchor = modObj.familyId || modObj.dbId;
        if (anchor && currentRules.family !== false) {
          modList.forEach((m) => {
            if (
              (String(m.familyId) === String(anchor) ||
                String(m.dbId) === String(anchor)) &&
              m.name &&
              !m.isVirtual
            ) {
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
                if (!(excludeBroken && (m.status === t("status_broken") || m.status?.includes("BROKEN")))) {
                  newMods.add(m.name);
                }
              }
            }
          });
        }
      };
      if (isEquipping) {
        if (targetMod.isVirtual) {
          if (isActuallyFlavorFolder) {
            const coreFiles = kids.filter((k) => k.flavorGroupId == null);
            const flavorFiles = kids.filter((k) => k.flavorGroupId != null);
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
                addWithFamily(groupKids[0]);
              }
            });
          } else {
            kids.forEach((k) => addWithFamily(k));
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
              const mData = modList.find((m) => m.name === name);
              if (mData?.requirements) {
                for (const req of mData.requirements) {
                  const reqId = typeof req === 'string' ? req : req.id || req.dbId;
                  const reqName = typeof req === 'string' ? req : req.name;
                  const reqBaseName = reqName?.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, "").toUpperCase();
                  const isReqNumeric = !isNaN(Number(reqName));
                  
                  const alreadySatisfied = Array.from(newMods).some((n) => {
                    const equipped = modList.find((m: any) => m.name === n);
                    return equipped && (
                      String(equipped.dbId) === String(reqId) ||
                      (!isReqNumeric && reqBaseName && equipped.displayName && equipped.displayName.toUpperCase().includes(reqBaseName))
                    );
                  });
                  if (!alreadySatisfied) {
                    const provider = modList.find(
                      (m) => !m.isVirtual && (
                        String(m.dbId) === String(reqId) ||
                        (!isReqNumeric && reqBaseName && m.displayName && m.displayName.toUpperCase().includes(reqBaseName))
                      )
                    );
                    if (provider) {
                      addWithFamily(provider);
                      checkAgain = true;
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
              targetMod.relationshipType === "twin" ||
              targetMod.relationshipType === "core" ||
              targetMod.relationshipType === "beta"))
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
      return updatedSets;
    });
  };
  function deletePlaySet(setName: string) {
    setConfirmDialog({
      message: `${t("confirm_delete_playset_prefix")}${setName}${t("confirm_delete_playset_suffix")}`,
      action: () => {
        setConfirmDialog(null);
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
      },
    });
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
                    `${t("status_offline_cache_prefix")}${parsed.length}${t("status_offline_cache_suffix")}`,
                  );
                }
              } catch (e) {
                console.error("Cache Load Error", e);
              }
              runRadarSweep(true);
            })
            .catch(() => runRadarSweep(false));
          fetchCloudLabQueue();
          invoke("initialize_vault_watch").catch(console.warn);
          const docsBase = config.mods_path.replace(/[\\/]Mods[\\/]?$/i, "");
          invoke("initialize_airgap_watch", {
            docsPath: docsBase,
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
      targetSet.mods.forEach((modName: string) => {
        const modObj = modList.find((m: any) => {
          if (m.name === modName) return true;
          const mBase = m.name.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, '');
          const targetBase = modName.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, '');
          return mBase && targetBase && mBase === targetBase;
        });
        if (modObj && modObj.isVirtual && modObj.flavors) {
           modObj.flavors.forEach((f: any) => {
             deployPayload.push({ path: f.name, allow_write: modObj.allow_write || false });
           });
        } else {
           deployPayload.push({ path: modObj ? modObj.name : modName, allow_write: modObj?.allow_write || false });
        }
      });
      const msg = await invoke("deploy_playset_bulk", {
        mods: deployPayload,
        modsPath: config.mods_path,
        vaultPath: config.vault_path,
      });
      setActiveSetName(setName);
      localStorage.setItem("sanctuary_active_set", setName);
      setStatus(`${t("ui_icon_success")} ${msg as string}`);
    } catch (err) {
      setStatus(`${t("status_deploy_failed")}${err}`);
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
  function restoreGameBackup(filename: string) {
    const isEngine = filename.includes("Engine");
    const warning = isEngine
      ? t("confirm_restore_engine")
      : t("confirm_restore_game");
    setConfirmDialog({
      message: warning,
      action: async () => {
        setConfirmDialog(null);
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
      },
    });
  }
  async function fetchVault() {
    const qList = await invoke<string[]>("get_quarantine_list");
    setQuarantineList(qList);
    const sList = await invoke<string[]>("get_shelter_list");
    setShelterContents(sList);
  }
  async function runRadarSweep(isSilent: boolean = false) {
    if (isScanning) return;
    setIsScanning(true);
    setScanProgress({
      current: 5,
      total: 100,
      message: t("scan_interrogating_dna"),
    });
    try {
      const config: any = await invoke("get_saved_coordinates");

      try {
        const { data: malwareData } = await supabase
          .from("mod_versions")
          .select("dna_hash, mods!inner(status)")
          .in("mods.status", ["quarantined", "blacklisted", "malware"]);
        if (malwareData && malwareData.length > 0) {
          const malwareHashes = malwareData.map((d: any) => d.dna_hash).filter(Boolean);
          await invoke("sync_security_definitions", { malware: malwareHashes, tier2: [] });
        }
      } catch (err) {
        console.error("Malware sync failed", err);
      }

      const rawLocalMods = await invoke<any[]>("scan_bunker", {
        vaultPath: config.vault_path,
        shelterActive: true,
      });
      if (!rawLocalMods || rawLocalMods.length === 0) {
        setModList([]);
        setIsScanning(false);
        return;
      }
      const uniqueMap = new Map();
      rawLocalMods.forEach((m) => {
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
      for (let i = 0; i < hashes.length; i += 50) {
        const chunk = hashes.slice(i, i + 50);
        let { data, error } = await supabase
          .from("mod_versions")
          .select(
            "dna_hash, version_label, mods (id, name, status, requiredDLC, category_override, sub_type, image_url, master_author, allow_write, mason_id, masons(name))",
          )
          .in("dna_hash", chunk);
        if (error) {
          console.warn(
            "Schema mismatch detected, falling back to safe query...",
          );
          const fallback = await supabase
            .from("mod_versions")
            .select(
              "dna_hash, version_label, mods (id, name, status, requiredDLC, category_override, sub_type, image_url, master_author, mason_id, masons(name))",
            )
            .in("dna_hash", chunk);
          data = fallback.data as any;
        }
        if (data) allCloudData = [...allCloudData, ...data];
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
        ccSetsMetadata: any[] = [];
      try {
        const { data: members } = await supabase
          .from("cc_set_members")
          .select("set_id, mod_id");
        const { data: sets } = await supabase.from("cc_sets").select("*");
        setMembership = members || [];
        ccSetsMetadata = sets || [];
        if (hashes.length > 0) {
          for (let i = 0; i < hashes.length; i += 50) {
            const chunk = hashes.slice(i, i + 50);
            const { data: fData } = await supabase
              .from("flavor_group_members")
              .select("group_id, mod_hash")
              .in("mod_hash", chunk);
            if (fData) flavorData = [...flavorData, ...fData];
          }
          const uniqueGroupIds = [
            ...new Set(flavorData.map((f) => f.group_id)),
          ];
          if (uniqueGroupIds.length > 0) {
            for (let i = 0; i < uniqueGroupIds.length; i += 50) {
              const chunk = uniqueGroupIds.slice(i, i + 50);
              const { data: gData } = await supabase
                .from("flavor_groups")
                .select("id, name")
                .in("id", chunk);
              if (gData)
                gData.forEach((g) => {
                  flavorGroupNames[String(g.id)] = g.name;
                });
              const { data: pMods } = await supabase
                .from("mods")
                .select("id, name, master_author, image_url")
                .in("id", chunk);
              if (pMods)
                pMods.forEach((pm) => {
                  parentNameMap[String(pm.id)] = {
                    name: pm.name,
                    author: pm.master_author || "Unknown",
                    image_url: pm.image_url,
                  };
                });
            }
          }
        }
      } catch (err) {
        console.error("Bridge Error:", err);
      }
      if (identifiedIds.length > 0) {
        for (let i = 0; i < identifiedIds.length; i += 50) {
          const chunk = identifiedIds.slice(i, i + 50);
          const { data: relsChild } = await supabase
            .from("mod_relationships")
            .select("*")
            .in("child_id", chunk);
          const { data: relsParent } = await supabase
            .from("mod_relationships")
            .select("*")
            .in("parent_id", chunk);
          if (relsChild) allRels = [...allRels, ...relsChild];
          if (relsParent) allRels = [...allRels, ...relsParent];
          const { data: depsChild } = await supabase
            .from("mod_dependencies")
            .select("*")
            .in("child_id", chunk);
          const { data: depsParent } = await supabase
            .from("mod_dependencies")
            .select("*")
            .in("parent_id", chunk);
          if (depsChild) allDeps = [...allDeps, ...depsChild];
          if (depsParent) allDeps = [...allDeps, ...depsParent];
        }
        const pIds = [
          ...new Set([
            ...allRels.map((r) => String(r.parent_id)),
            ...allRels.map((r) => String(r.child_id)),
            ...allDeps.map((d) => String(d.parent_id)),
            ...allDeps.map((d) => String(d.child_id)),
          ]),
        ];
        if (pIds.length > 0) {
          for (let i = 0; i < pIds.length; i += 50) {
            const chunk = pIds.slice(i, i + 50);
            const { data: pMods } = await supabase
              .from("mods")
              .select("id, name, master_author, image_url")
              .in("id", chunk);
            if (pMods)
              pMods.forEach((pm) => {
                parentNameMap[String(pm.id)] = {
                  name: pm.name,
                  author: pm.master_author || "Unknown",
                  image_url: pm.image_url,
                };
              });
          }
        }
      }
      const cloudMap = new Map();
      allCloudData.forEach(c => cloudMap.set(String(c.dna_hash), c));
      const setRelMap = new Map();
      setMembership.forEach(sm => setRelMap.set(String(sm.mod_id), sm));
      const flavorMap = new Map();
      flavorData.forEach(f => flavorMap.set(String(f.mod_hash), f));
      
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
        
        const invisibleRivalIds = myChildRels
          .filter((r: any) => r.relationship_type === "rival")
          .map((r: any) => String(r.child_id));
          
        const myDeps = dbId ? (depsMap.get(dbId) || []).map((d: any) => ({
            id: String(d.parent_id),
            name: parentNameMap[String(d.parent_id)]?.name || String(d.parent_id)
        })) : [];

        const isDlcMissing = (dbMod?.requiredDLC || []).some(
          (dlc: string) => !ownedDLC.includes(dlc) || maskedDLC.includes(dlc),
        );
        let myBossId = dbId;
        let myRelType = null;
        if (addonRel) {
          myBossId = String(addonRel.parent_id);
          myRelType = "addon";
        } else if (twinRel) {
          myBossId = String(twinRel.parent_id) < String(twinRel.child_id) ? String(twinRel.parent_id) : String(twinRel.child_id);
          myRelType = "twin";
        } else if (betaRel) {
          myBossId = String(betaRel.parent_id) < String(betaRel.child_id) ? String(betaRel.parent_id) : String(betaRel.child_id);
          myRelType = "beta";
        } else if (myFlavor) {
          myBossId = String(myFlavor.group_id);
        }
        return {
          ...mod,
          physical_path: mod.name,
          dbId,
          setId: mySetRel ? String(mySetRel.set_id) : null,
          flavorGroupId: myFlavor ? String(myFlavor.group_id) : null,
          flavorGroupName: myFlavor
            ? flavorGroupNames[String(myFlavor.group_id)]
            : null,
          category_override: dbMod?.category_override,
          sub_type: dbMod?.sub_type,
          image_url: dbMod?.image_url,
          author:
            (Array.isArray(dbMod?.masons)
              ? dbMod.masons[0]?.name
              : dbMod?.masons?.name) ||
            dbMod?.master_author ||
            mod.author,
          version: cloudMatch?.version_label || "v.Local",
          familyId: myBossId,
          relationshipType: myRelType,
          invisibleRivals:
            invisibleRivalIds.length > 0 ? invisibleRivalIds : undefined,
          requirements: myDeps.length > 0 || myParentRels.some((r: any) => r.relationship_type === "addon")
            ? [
                ...myDeps,
                ...myParentRels.filter((r: any) => r.relationship_type === "addon").map((r: any) => ({
                  id: String(r.parent_id),
                  name: parentNameMap[String(r.parent_id)]?.name || String(r.parent_id)
                }))
              ]
            : undefined,
          twins:
            myParentRels.some((r: any) => r.relationship_type === "twin") || myChildRels.some((r: any) => r.relationship_type === "twin")
              ? [
                  ...myParentRels.filter((r: any) => r.relationship_type === "twin").map((r: any) => ({
                    id: String(r.parent_id),
                    name: parentNameMap[String(r.parent_id)]?.name || String(r.parent_id)
                  })),
                  ...myChildRels.filter((r: any) => r.relationship_type === "twin").map((r: any) => ({
                    id: String(r.child_id),
                    name: parentNameMap[String(r.child_id)]?.name || String(r.child_id)
                  })),
                ]
              : undefined,
          displayName: mod.name
            .split(/[\\/]/)
            .pop()
            ?.replace(/\.(package|ts4script)$/i, "")
            .toUpperCase(),
          allow_write: dbMod?.allow_write || false,
          mason_id: dbMod?.mason_id || null,
          status: dbMod
            ? dbMod.status === "verified"
              ? t("status_verified")
              : t("status_unverified")
            : mod.status?.includes("EXPLICIT LOCAL") ? "🚫 EXPLICIT LOCAL" : t("status_local_only"),
          isSynced: !!dbMod,
          isVirtual: false,
          isGhosted: isDlcMissing,
          ghostReason: isDlcMissing ? "MISSING_DLC" : null,
        };
      });

      const unidentified = physicalMods.filter(
        (m) => !m.isSynced && !m.status?.includes("EXPLICIT LOCAL") && !m.name.toLowerCase().includes("customchallenge")
      );
      if (unidentified.length > 0 && !isSilent) {
        setScoutQueue(unidentified);
      }
      const virtualCards: any[] = [];
      ccSetsMetadata.forEach((set) => {
        const setMembers = physicalMods.filter(
          (m) => String(m.setId) === String(set.id),
        );
        if (setMembers.length > 0)
          virtualCards.push({
            hash: "set_" + set.id,
            name: "SET_" + set.id,
            dbId: String(set.id),
            displayName: set.name.toUpperCase(),
            author: set.creator_name || "Unknown Architect",
            status: t("status_cc_set"),
            color: "var(--accent)",
            isSynced: true,
            isVirtual: true,
            isParent: true,
            isCCSet: true,
            image_url: set.image_url,
            flavors: setMembers,
          });
      });
      const uniqueFamilyIds = [
        ...new Set(physicalMods.map((m) => m.familyId).filter(Boolean)),
      ];
      uniqueFamilyIds.forEach((fId) => {
        const familyMembers = physicalMods.filter(
          (m) => String(m.familyId) === String(fId),
        );
        if (familyMembers.length > 1) {
          const isFlavorFolder = !!flavorGroupNames[String(fId)] && !parentNameMap[String(fId)];
          const isTwinGroup = familyMembers.some(
            (m) =>
              m.relationshipType === "twin" || m.relationshipType === "beta",
          );
          const pData = parentNameMap[String(fId)] || {
            name: isFlavorFolder
              ? flavorGroupNames[String(fId)]
              : familyMembers[0].displayName,
            author: familyMembers[0].author,
          };
          const safeName = pData.name || t("status_unknown_folder");
          const isAllVerified = familyMembers.every((m) => m.status === t("status_verified"));
          const isAnyBroken = familyMembers.some((m) => m.status === t("status_broken") || m.status?.includes("BROKEN"));
          
          let folderStatus = isFlavorFolder
            ? t("status_exclusives")
            : isTwinGroup
              ? t("status_twin_bond")
              : t("status_collection");
              
          if (isAnyBroken) {
            folderStatus = "BROKEN ARTIFACTS DETECTED";
          } else if (isAllVerified) {
            folderStatus = t("status_verified");
          }

          const myParentRels = allRels.filter((r) => String(r.child_id) === String(fId));
          const myChildRels = allRels.filter((r) => String(r.parent_id) === String(fId));
          const folderDeps = [
            ...allDeps.filter((d) => String(d.child_id) === String(fId)).map((d) => ({
              id: String(d.parent_id),
              name: parentNameMap[String(d.parent_id)]?.name || String(d.parent_id)
            })),
            ...myParentRels.filter((r) => r.relationship_type === "addon").map((r) => ({
              id: String(r.parent_id),
              name: parentNameMap[String(r.parent_id)]?.name || String(r.parent_id)
            }))
          ];
            
          const folderTwins = myParentRels.some((r) => r.relationship_type === "twin") || myChildRels.some((r) => r.relationship_type === "twin")
            ? [
                ...myParentRels.filter((r) => r.relationship_type === "twin").map((r) => ({
                  id: String(r.parent_id),
                  name: parentNameMap[String(r.parent_id)]?.name || String(r.parent_id)
                })),
                ...myChildRels.filter((r) => r.relationship_type === "twin").map((r) => ({
                  id: String(r.child_id),
                  name: parentNameMap[String(r.child_id)]?.name || String(r.child_id)
                })),
              ]
            : undefined;

          virtualCards.push({
            hash: "virtual_" + fId,
            name: "FOLDER_" + fId,
            dbId: String(fId),
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
            flavors: familyMembers,
          });
        }
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
          localVirtualCards.push({
            hash: "local_set_" + set.id,
            name: "LOCAL_SET_" + set.id,
            dbId: String(set.id),
            displayName: set.name.toUpperCase(),
            author: "Local Override",
            status: isSet ? t("status_cc_set") : t("status_local_folder"),
            color: isSet ? "var(--accent)" : "var(--success)",
            isSynced: false,
            isVirtual: true,
            isParent: true,
            isCCSet: isSet,
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
      const masterList = [
        ...virtualCards,
        ...localVirtualCards,
        ...overriddenMods,
      ];
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
      setIsScanning(false);
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
      const { data: cloudData, error } = await supabase
        .from("mods")
        .select("name, status, mod_versions(version_label)");
      if (error || !cloudData) throw error;
      cloudData.forEach((cloudMod) => {
        const localMod = syncedMods.find((m) => m.name === cloudMod.name);
        if (!localMod) return;
        if (cloudMod.status === "broken") broken.push(localMod);
        else if (cloudMod.status === "obsolete") obsolete.push(localMod);
        else {
          const latestVersion =
            cloudMod.mod_versions && cloudMod.mod_versions.length > 0
              ? cloudMod.mod_versions[0].version_label
              : null;
          if (
            latestVersion &&
            localMod.version &&
            localMod.version !== latestVersion &&
            localMod.version !== "v.Local"
          ) {
            updated.push({ ...localMod, newVersion: latestVersion });
          }
        }
      });
      setNetworkUpdates({ broken, obsolete, updated });
    } catch (err) {
      console.error("Update check failed", err);
    }
  }

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
      while (
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
              name: localA?.name || t("backups_unknown"),
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
              name: localB?.name || t("backups_unknown"),
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
      setStatus(`${t("ui_icon_success")} ${msg}`);
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
        const { data: modData, error: modError } = await supabase
          .from("mods")
          .insert([
            {
              name: mod.name,
              status: "under_review",
              description: "System Discovered Artifact",
            },
          ])
          .select()
          .single();
        if (modError) throw modError;
        targetModId = modData.id;
        const { error: verError } = await supabase
          .from("mod_versions")
          .insert([
            {
              mod_id: targetModId,
              version_label: "v.System",
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
        setStatus(msg as string);
      } else {
        if (activeSetName) await equipPlaySet(activeSetName);
        setStatus("BUNKER RECLAIMED");
      }
      setShelterActive(active);
    } catch (err) {
      setStatus(`${t("status_shelter_error")}${err}`);
    }
  }
  const deleteBackup = (fileName: string) => {
    setConfirmDialog({
      message: `${t("confirm_incinerate_prefix")}${fileName}${t("confirm_incinerate_suffix")}`,
      action: async () => {
        setConfirmDialog(null);
        try {
          await invoke("delete_backup", { fileName });
          fetchBackups();
        } catch (err) {
          alert(`${t("alert_deletion_failed")}${err}`);
        }
      },
    });
  };
  const triggerFullEngineBackup = async () => {
    const config: any = await invoke("get_saved_coordinates");
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
    const docsBase = config.mods_path.replace(/[\\/]Mods[\\/]?$/, "");
    setStatus(`${t("log_icon_backups")} Executing Pre-Patch Snapshot...`);
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
      setStatus(msg as string);
    } catch (err) {
      setStatus(err as string);
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
      setStatus(`${t("status_lab_error")}${err}`);
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
    if (!activeLabMod) return;
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
  async function concludeTest() {
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
        .select("mod_id")
        .eq("dna_hash", activeLabMod.hash)
        .single();
      if (verData) {
        await supabase
          .from("mods")
          .update({ status: finalStatus })
          .eq("id", verData.mod_id);
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
  const runProvingRun = async () => {
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
        const { data: addonLinks } = await supabase.from('mod_relationships').select('parent_id').or(orQuery).eq('relationship_type', 'addon');
        
        let allIds = new Set<string>();
        if (depLinks) depLinks.forEach((l: any) => allIds.add(l.parent_id));
        if (addonLinks) addonLinks.forEach((l: any) => allIds.add(l.parent_id));
        
        if (allIds.size > 0) {
          const { data: depMods } = await supabase.from('mods').select('name').in('id', Array.from(allIds));
          if (depMods) depPaths = depMods.map((m: any) => m.name);
        }
      }
      
      const config: any = await invoke("get_saved_coordinates");
      await invoke("evacuate_to_shelter");
      
      const rawDeploySet = new Set([
        ...(activeLabMod.isVirtual && activeLabMod.flavors ? activeLabMod.flavors.map((f:any) => f.name) : [activeLabMod.name]),
        ...(conflictTarget ? (conflictTarget.isVirtual && conflictTarget.flavors ? conflictTarget.flavors.map((f:any) => f.name) : [conflictTarget.name]) : []),
        ...depPaths,
        ...associatedMods.map((m: any) => m.name)
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
      setStatus(`${t("status_lab_error")}${err}`);
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
        (equipFilter === "EQUIPPED" && isActuallyEquipped) ||
        (equipFilter === "UNEQUIPPED" && !isActuallyEquipped);
      const modType = (m.category_override || m.type || "NONE").toUpperCase();
      const matchesCategory =
        activeCategory === "ALL" || modType === activeCategory.toUpperCase();
      const subType = (m.sub_type || "").toUpperCase();
      const matchesSubType =
        activeSubType === "ALL" || subType === activeSubType.toUpperCase();
      const rawStatus = (m.status || "").toLowerCase();
      const strVerified = t("status_verified").toLowerCase();
      const strReview = t("status_under_review").toLowerCase();
      const strUnverified = t("status_unverified").toLowerCase();
      const strLocal = t("status_local_only").toLowerCase();
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
  const visibleMods = filteredMods.slice(0, 100);
  if (!isConfigured) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[var(--bg)] font-sans relative overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-[40vw] h-[40vw] rounded-full theme-bg-accent opacity-10 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-[30vw] h-[30vw] rounded-full theme-bg-warning opacity-5 blur-[120px] pointer-events-none" />

        <div className="relative w-full max-w-md theme-glass-panel rounded-[3rem] p-10 shadow-[0_0_50px_rgba(0,0,0,0.5)] z-10 flex flex-col items-center">
          <h1 className="text-3xl font-black uppercase tracking-tighter text-[var(--text)] mb-2 text-center">
            {t("setup_title")}
          </h1>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtext)] mb-8 text-center opacity-60">
            Cartographer Initialization
          </p>

          <div className="flex flex-col gap-4 w-full">
            <button 
              onClick={async () => {
                try {
                  const paths: any = await invoke("auto_detect_paths");
                  if (paths) {
                    if (paths.live_path) useStore.getState().setLivePath(paths.live_path);
                    if (paths.mods_path) useStore.getState().setModsPath(paths.mods_path);
                    if (paths.vault_path) useStore.getState().setVaultPath(paths.vault_path);
                    setStatus("Paths auto-detected successfully.");
                  }
                } catch(e) {
                  console.error(e);
                  setStatus("Auto-detect failed.");
                }
              }} 
              className="w-full theme-glass-inner border border-white/5 px-6 py-4 rounded-2xl text-[10px] font-black theme-text-accent focus:outline-none transition-all hover:bg-white/5 flex items-center justify-center gap-3 uppercase tracking-widest mb-4 shadow-sm"
            >
              <span>{t("ui_icon_cloud")} Auto-Detect Paths</span>
            </button>

            <button onClick={pickLivePath} className="w-full theme-glass-inner border border-white/10 px-6 py-4 rounded-2xl text-xs font-bold text-[var(--text)] focus:outline-none focus:theme-border-accent transition-all hover:bg-white/5 flex items-center justify-between group shadow-sm">
              <span className="uppercase tracking-widest text-[10px]">{livePath ? t("setup_btn_bin_locked") : t("setup_btn_bin")}</span>
              <div className={`w-2 h-2 rounded-full ${livePath ? 'theme-bg-success' : 'theme-bg-warning animate-pulse'}`} style={livePath ? {boxShadow: '0 0 10px var(--success)'} : {}} />
            </button>
            <button onClick={pickModsPath} className="w-full theme-glass-inner border border-white/10 px-6 py-4 rounded-2xl text-xs font-bold text-[var(--text)] focus:outline-none focus:theme-border-accent transition-all hover:bg-white/5 flex items-center justify-between group shadow-sm">
              <span className="uppercase tracking-widest text-[10px]">{modsPath ? t("setup_btn_mods_locked") : t("setup_btn_mods")}</span>
              <div className={`w-2 h-2 rounded-full ${modsPath ? 'theme-bg-success' : 'theme-bg-warning animate-pulse'}`} style={modsPath ? {boxShadow: '0 0 10px var(--success)'} : {}} />
            </button>
            <button onClick={pickVaultPath} className="w-full theme-glass-inner border border-white/10 px-6 py-4 rounded-2xl text-xs font-bold text-[var(--text)] focus:outline-none focus:theme-border-accent transition-all hover:bg-white/5 flex items-center justify-between group shadow-sm">
              <span className="uppercase tracking-widest text-[10px]">{vaultPath ? t("setup_btn_vault_locked") : t("setup_btn_vault")}</span>
              <div className={`w-2 h-2 rounded-full ${vaultPath ? 'theme-bg-success' : 'theme-bg-warning animate-pulse'}`} style={vaultPath ? {boxShadow: '0 0 10px var(--success)'} : {}} />
            </button>

            <button
              onClick={lockCoordinates}
              className="w-full mt-4 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all theme-bg-accent text-[var(--bg)] hover:scale-[1.02] active:scale-95 shadow-lg flex items-center justify-center gap-3 disabled:opacity-50"
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
      className="flex h-screen w-screen font-sans overflow-hidden pt-10"
      style={{ backgroundColor: "var(--bg)", color: "var(--text)" }}
    >
      <TitleBar />
      <ToastProvider />
      <nav className="w-64 shrink-0 h-full flex flex-col bg-black/20 backdrop-blur-xl border-r border-white/10 shadow-2xl relative z-20">
        <div className="p-6 flex items-center gap-3 border-b border-white/5">
          <img 
            src="/icon.png" 
            alt="Sanctuary OS" 
            className="w-10 h-10 drop-shadow-[0_0_15px_rgba(255,255,255,0.15)] hover:scale-110 hover:drop-shadow-[0_0_20px_rgba(255,255,255,0.3)] transition-all duration-300"
          />
          <div>
            <h1 className="text-xl font-bold tracking-wider uppercase text-left">
              {t("sidebar_app_title")}
            </h1>
            <p className="text-[10px] uppercase tracking-widest theme-text-accent font-semibold text-left">
              {t("sidebar_app_subtitle")}
            </p>
          </div>
        </div>
        <div className="flex-1 py-6 px-4 space-y-1 overflow-y-auto custom-scrollbar">
          <NavButton
            active={view === "dashboard"}
            onClick={() => setView("dashboard")}
            icon={t("ui_icon_dashboard")}
            label={t("sidebar_cmd_center")}
          />
          <NavButton
            active={view === "vault"}
            onClick={() => setView("vault")}
            icon={t("ui_icon_vault")}
            label={t("sidebar_collection")}
          />
          <NavButton
            active={view === "marketplace"}
            onClick={() => setView("marketplace")}
            icon={t("ui_icon_marketplace")}
            label={t("sidebar_marketplace")}
          />
          <NavButton
            active={view === "playsets"}
            onClick={() => setView("playsets")}
            icon={t("ui_icon_playsets")}
            label={t("playsets_title")}
          />
          <NavButton
            active={view === "global_feed"}
            onClick={() => setView("global_feed")}
            icon={"📡"}
            label={"COMM-LINK"}
          />
          <NavButton
            active={view === "DbpfScout"}
            onClick={() => setView("DbpfScout")}
            icon={t("ui_icon_radar")}
            label={t("sidebar_radar")}
          />
          <NavButton
            active={view === "lab"}
            onClick={() => setView("lab")}
            icon={t("ui_icon_lab")}
            label={t("sidebar_lab")}
          />
          <NavButton
            active={view === "backups"}
            onClick={() => setView("backups")}
            icon={t("ui_icon_backups")}
            label={t("sidebar_time_capsule")}
          />
          {session && ["mason", "wayfinder", "admin"].includes(userRole) && (
            <div className="my-4 border-t border-white/5 pt-4">
              <p className="px-3 text-[10px] font-semibold text-[var(--subtext)] opacity-60 uppercase tracking-widest mb-2 text-left">
                {t("sidebar_creator_tools")}
              </p>
              <NavButton
                active={view === "MasonHub"}
                onClick={() => setView("MasonHub")}
                icon={t("ui_icon_mason")}
                label={t("sidebar_mason_hub")}
              />
            </div>
          )}
          {session && ["architect", "wayfinder", "admin"].includes(userRole) && (
            <div className="my-4 border-t border-white/5 pt-4">
              <p className="px-3 text-[10px] font-semibold text-[var(--subtext)] opacity-60 uppercase tracking-widest mb-2 text-left">
                {t("sidebar_architect_tools")}
              </p>
              <NavButton
                active={view === "ArchitectHub"}
                onClick={() => setView("ArchitectHub")}
                icon={t("ui_icon_architect")}
                label={t("sidebar_architect_hub")}
              />
            </div>
          )}
          {session && ["senior_architect", "wayfinder", "admin"].includes(userRole) && (
            <div className="my-4 border-t border-white/5 pt-4">
              <p className="px-3 text-[10px] font-semibold text-[var(--subtext)] opacity-60 uppercase tracking-widest mb-2 text-left">
                Senior Architect
              </p>
              <NavButton
                active={view === "SeniorArchitect"}
                onClick={() => setView("SeniorArchitect")}
                icon={"👁️"}
                label={"Oversight"}
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
                icon={"🔑"}
                label={"SIGN IN / SIGN UP"}
              />
            </div>
          )}
        </div>
        <div className="p-4 border-t border-white/5 flex flex-col gap-2">
          <NavButton
            active={view === "settings"}
            onClick={() => setView("settings")}
            icon={t("ui_icon_settings")}
            label={t("sidebar_settings")}
          />
          <NavButton
            active={false}
            onClick={() => openUrl("https://discord.gg/kTJb9q3GDW")}
            icon={"💬"}
            label={"Discord"}
          />
          <button
            onClick={handleQuickLaunch}
            className={`w-full mt-2 py-3 rounded-xl border font-bold hover:scale-[1.02] active:scale-95 transition-all shadow-lg ${isPatchDetected || defconLevel < 5 ? "bg-amber-500 text-black border-amber-600" : "bg-[var(--success)] !text-black border-none"}`}
          >
            {t("sidebar_quick_launch")}
          </button>
        </div>
      </nav>
      <main className="flex-1 h-full relative overflow-y-auto p-12 pt-10 custom-scrollbar">
        <div className="absolute top-0 left-1/4 w-96 h-96 theme-bg-accent opacity-10 rounded-full blur-[120px] pointer-events-none z-0" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 theme-bg-accent opacity-10 rounded-full blur-[120px] pointer-events-none z-0" />
        <div className="relative z-10 w-full h-full">
          {view === "dashboard" && (
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
                setView={setView}
                setFilterStatus={setFilterStatus}
              />
            </ErrorBoundary>
          )}

          {view === "marketplace" && (
            <Marketplace
              ownedHashes={modList.map((m) => m.hash).filter((h) => !!h)}
              onSetStatus={setStatus}
              onOpenMasonProfile={handleOpenMasonProfile}
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
                setMetaVersionInput={setMetaVersionInput} setActiveDossier={setActiveDossier} setDrawerConfirmHash={setDrawerConfirmHash}
                quarantineList={quarantineList} restoreMod={restoreMod} purgeMod={purgeMod}
                ownedDLC={ownedDLC} maskedDLC={maskedDLC} setMetaDescInput={setMetaDescInput}
                setMetaImageInput={setMetaImageInput} setMetaAllowWriteInput={setMetaAllowWriteInput}
                expandedFolder={expandedFolder} setExpandedFolder={setExpandedFolder}
                drawerConfirmHash={drawerConfirmHash} modList={modList}
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
                openRenameUI={openRenameUI}
                deletePlaySet={deletePlaySet}
                exportPlaySet={exportPlaySet}
                importPlaySet={importPlaySet}
                uploadBlueprintToCloud={uploadBlueprintToCloud}
                syncBlueprintByCode={syncBlueprintByCode}
                isBlueprintModalOpen={isBlueprintModalOpen}
                setIsBlueprintModalOpen={setIsBlueprintModalOpen}
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
              openRenameUI={openRenameUI}
              deleteBackup={deleteBackup}
            />
          )}
          {view === "global_feed" && (
            <ErrorBoundary moduleName="Global Feed">
              <GlobalFeed onOpenMasonProfile={handleOpenMasonProfile} />
            </ErrorBoundary>
          )}
          {view === "MasonHub" &&
            ["mason", "wayfinder", "admin"].includes(userRole) && <MasonHub />}
          {view === "ArchitectHub" &&
            ["architect", "wayfinder", "admin"].includes(userRole) && (
              <ErrorBoundary moduleName="Architect Hub">
                <ArchitectHub userRole={userRole} equipPlaySet={equipPlaySet} modList={modList} />
              </ErrorBoundary>
            )}
          {view === "SeniorArchitect" &&
            ["senior_architect", "wayfinder", "admin"].includes(userRole) && (
              <ErrorBoundary moduleName="Senior Architect">
                <SeniorArchitect />
              </ErrorBoundary>
            )}
          {view === "DbpfScout" && <DbpfScout />}
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
          onDesignateTwin={designateTwin}
          onEstablishBond={establishBond}
          onRegisterConflict={registerConflict}
          onEstablishFlavor={establishFlavors}
          onSeverFlavor={severFlavor}
          onSmartSearch={handleSmartSearch}
          onOpenWorkbench={openWorkbench}
          onSaveWorkbench={saveWorkbenchChanges}
          onSaveMetadata={saveLocalMetadata}
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
      )}
      <BlueprintArchitect
        isOpen={isBlueprintModalOpen}
        onClose={() => setIsBlueprintModalOpen(false)}
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

      <AppModals
        snapshotModal={snapshotModal}
        setSnapshotModal={setSnapshotModal}
        snapshotName={snapshotName}
        setSnapshotName={setSnapshotName}
        executeSnapshot={executeSnapshot}
        playSets={playSets}
        activePlaySetIndex={activePlaySetIndex}
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
      />
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
}: any) {
  const isActive = active !== undefined ? active : activeTab === id;
  const handleClick = () => {
    if (onClick) onClick();
    else if (setTab && id) setTab(id);
  };
  return (
    <button
      onClick={handleClick}
      className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all duration-300 group
        ${
          isActive
            ? "bg-white/10 text-[var(--text)] shadow-lg border border-white/10"
            : "text-[var(--subtext)] opacity-60 hover:bg-white/5 hover:text-gray-300 border border-transparent"
        }`}
    >
      <span
        className={`text-xl transition-transform duration-300 shrink-0 ${isActive ? "scale-110" : "group-hover:scale-110"}`}
      >
        {icon}
      </span>
      <span className="text-xs font-black uppercase tracking-wider truncate leading-none pt-0.5">
        {label}
      </span>
    </button>
  );
}

export default App;
