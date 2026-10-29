import { create } from 'zustand';

interface ModalState {
  syncCode: string;
  setSyncCode: (val: string) => void;
  snapshotModal: boolean;
  setSnapshotModal: (val: boolean) => void;
  snapshotName: string;
  setSnapshotName: (val: string) => void;
  bulkModal: boolean;
  setBulkModal: (val: boolean) => void;
  bulkName: string;
  setBulkName: (val: string) => void;
  isBulkMode: boolean;
  setIsBulkMode: (val: boolean) => void;
  selectedMods: string[];
  setSelectedMods: (val: string[] | ((prev: string[]) => string[])) => void;
  renameModal: any;
  setRenameModal: (val: any) => void;
  renameTarget: string | null;
  setRenameTarget: (val: string | null) => void;
  nameInput: string;
  setNameInput: (val: string) => void;
  localFolderModal: boolean;
  setLocalFolderModal: (val: boolean) => void;
  localFolderType: string;
  setLocalFolderType: (val: string) => void;
  localFolderName: string;
  yeetConfirmPending: any;
  setYeetConfirmPending: (val: any) => void;
  dnaMatchQueue: any[];
  setDnaMatchQueue: (val: any[] | ((prev: any[]) => any[])) => void;
  edgeOverrideQueue: any[];
  setEdgeOverrideQueue: (val: any[] | ((prev: any[]) => any[])) => void;
  scoutQueue: any[];
  setScoutQueue: (val: any[] | ((prev: any[]) => any[])) => void;
  isScoutPanelOpen: boolean;
  setIsScoutPanelOpen: (val: boolean) => void;
  setLocalFolderName: (val: string) => void;
  pendingImportSet: any;
  setPendingImportSet: (val: any) => void;
  missingImportMods: any[] | null;
  setMissingImportMods: (val: any[] | null) => void;
  dnaMatches: any[];
  setDnaMatches: (val: any[]) => void;
  isDnaModalOpen: boolean;
  setIsDnaModalOpen: (val: boolean) => void;
  isBackingUp: boolean;
  setIsBackingUp: (val: boolean) => void;
  backupType: 'world' | 'engine' | null;
  setBackupType: (val: 'world' | 'engine' | null) => void;
  completedBackups: string[];
  setCompletedBackups: (val: string[] | ((prev: string[]) => string[])) => void;
  isDefconBackupSession: boolean;
  setIsDefconBackupSession: (val: boolean) => void;
  isRestoring: boolean;
  setIsRestoring: (val: boolean) => void;
  restoreType: 'world' | 'engine' | null;
  setRestoreType: (val: 'world' | 'engine' | null) => void;
  ingestProgress: any;
  setIngestProgress: (val: any) => void;
  isScanning: boolean;
  setIsScanning: (val: boolean) => void;
  isSilentScanning: boolean;
  setIsSilentScanning: (val: boolean) => void;
  showDefconAlert: boolean;
  setShowDefconAlert: (val: boolean) => void;
  showQuarantineModal: boolean;
  setShowQuarantineModal: (val: boolean) => void;
  showBrokenModal: boolean;
  setShowBrokenModal: (val: boolean) => void;
  droppedFiles: any[];
  setDroppedFiles: (val: any[]) => void;
  dropzoneState: string;
  setDropzoneState: (val: string) => void;
  isDragging: boolean;
  setIsDragging: (val: boolean) => void;
  isDropzoneOpen: boolean;
  setIsDropzoneOpen: (val: boolean) => void;
  confirmDialog: any;
  setConfirmDialog: (val: any) => void;
  updatePayload: any;
  setUpdatePayload: (val: any) => void;
  isUpdatePanelOpen: boolean;
  setIsUpdatePanelOpen: (val: boolean) => void;
  isNexusUpdatesPanelOpen: boolean;
  setIsNexusUpdatesPanelOpen: (val: boolean) => void;
  nexusPreviewAsset: { id: string, type: string } | null;
  setNexusPreviewAsset: (asset: { id: string, type: string } | null) => void;
  isSideBrowserOpen: boolean;
  setIsSideBrowserOpen: (val: boolean) => void;
  isSupportPanelOpen: boolean;
  setIsSupportPanelOpen: (val: boolean) => void;
  isConflictRadarOpen: boolean;
  setIsConflictRadarOpen: (val: boolean) => void;
  isBlueprintSwapOpen: boolean;
  setIsBlueprintSwapOpen: (val: boolean) => void;
  showConflictsPanel: boolean;
  setShowConflictsPanel: (val: boolean) => void;
  showIncompatiblePanel: boolean;
  setShowIncompatiblePanel: (val: boolean) => void;
  showUpdatesModal: boolean;
  setShowUpdatesModal: (val: boolean) => void;
  
  // Browser Features
  sideBrowserUrl: string; // Legacy/Active Tab URL
  sideBrowserTrigger: number;
  setSideBrowserUrl: (val: string) => void;
  
  browserTabs: { id: string, url: string, title?: string, sleeping?: boolean }[];
  setBrowserTabs: (val: { id: string, url: string, title?: string, sleeping?: boolean }[] | ((prev: any[]) => any[])) => void;
  
  activeBrowserTabId: string | null;
  setActiveBrowserTabId: (val: string | null) => void;
  
  browserBookmarks: { url: string, title: string }[];
  setBrowserBookmarks: (val: { url: string, title: string }[] | ((prev: any[]) => any[])) => void;
  
  browserHistory: { url: string, title: string, timestamp: number }[];
  setBrowserHistory: (val: { url: string, title: string, timestamp: number }[] | ((prev: any[]) => any[])) => void;
  
  maxActiveWebviews: number;
  setMaxActiveWebviews: (val: number) => void;
  
  useInternalBrowser: boolean;
  setUseInternalBrowser: (val: boolean) => void;
  
  downloadsQueue: string[];
  setDownloadsQueue: (val: string[] | ((prev: string[]) => string[])) => void;

  // Remote Staging Draft (PWA / Web Payload Editor — Held in Local Device Memory until Sent or Discarded)
  stagingDraftMode: "mod_queue" | "blueprint";
  setStagingDraftMode: (val: "mod_queue" | "blueprint") => void;
  stagingDraftName: string;
  setStagingDraftName: (val: string) => void;
  stagingDraftCode: string;
  setStagingDraftCode: (val: string) => void;
  stagingDraftNotes: string;
  setStagingDraftNotes: (val: string) => void;
  stagingDraftAutoEquip: boolean;
  setStagingDraftAutoEquip: (val: boolean) => void;
  stagingDraftStrategy: "alphabetical" | "numeric_prefix" | "loadorder_txt";
  setStagingDraftStrategy: (val: "alphabetical" | "numeric_prefix" | "loadorder_txt") => void;
  stagingDraftItems: any[];
  setStagingDraftItems: (val: any[] | ((prev: any[]) => any[])) => void;
  stagingDraftLastSavedAt: string | null;
  savedLocalDrafts: any[];
  saveCurrentDraftLocally: (customName?: string) => void;
  loadSavedLocalDraft: (draftId: string) => void;
  deleteSavedLocalDraft: (draftId: string) => void;
  toggleModInStagingDraft: (mod: any) => boolean;
  stageBlueprintToDraft: (blueprint: any) => void;
  clearStagingDraft: () => void;

  // Volatile Desktop Signature Queue (RAM Only — Zero Disk Footprint)
  volatileSignatureQueue: any | null;
  setVolatileSignatureQueue: (val: any | null | ((prev: any | null) => any | null)) => void;
  isSignatureQueueOpen: boolean;
  setIsSignatureQueueOpen: (val: boolean) => void;
}

const LOCAL_STAGING_DRAFT_KEY = "sanctuary_local_staging_draft";
const SAVED_LOCAL_DRAFTS_KEY = "sanctuary_saved_local_blueprints";

function loadInitialStagingDraft() {
  try {
    const raw = localStorage.getItem(LOCAL_STAGING_DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function loadSavedDraftSnapshots(): any[] {
  try {
    const raw = localStorage.getItem(SAVED_LOCAL_DRAFTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistActiveStagingDraft(state: {
  stagingDraftMode: "mod_queue" | "blueprint";
  stagingDraftName: string;
  stagingDraftCode: string;
  stagingDraftNotes: string;
  stagingDraftAutoEquip: boolean;
  stagingDraftStrategy: "alphabetical" | "numeric_prefix" | "loadorder_txt";
  stagingDraftItems: any[];
}): string | null {
  try {
    const hasContent =
      (state.stagingDraftItems && state.stagingDraftItems.length > 0) ||
      !!state.stagingDraftName.trim() ||
      !!state.stagingDraftNotes.trim();
    if (!hasContent) {
      localStorage.removeItem(LOCAL_STAGING_DRAFT_KEY);
      return null;
    }
    const updatedAt = new Date().toISOString();
    localStorage.setItem(
      LOCAL_STAGING_DRAFT_KEY,
      JSON.stringify({
        ...state,
        updatedAt,
      })
    );
    return updatedAt;
  } catch {
    return null;
  }
}

function inferDefaultPriorityTier(category?: string, name?: string): string {
  const hay = `${category || ""} ${name || ""}`.toLowerCase();
  if (
    hay.includes("core") ||
    hay.includes("script") ||
    hay.includes("framework") ||
    hay.includes("library") ||
    hay.includes("injector") ||
    hay.includes("mccc") ||
    hay.includes("ui cheats")
  ) {
    return "1_Core";
  }
  if (
    hay.includes("override") ||
    hay.includes("default replacement") ||
    hay.includes("lighting") ||
    hay.includes("reshade")
  ) {
    return "4_Overrides";
  }
  if (
    hay.includes("gameplay") ||
    hay.includes("trait") ||
    hay.includes("career") ||
    hay.includes("aspiration") ||
    hay.includes("overhaul")
  ) {
    return "2_Gameplay";
  }
  return "3_Standard";
}

const initialDraft = loadInitialStagingDraft();

export const useModalStore = create<ModalState>((set, get) => ({
  syncCode: '',
  setSyncCode: (syncCode) => set({ syncCode }),
  snapshotModal: false,
  setSnapshotModal: (snapshotModal) => set({ snapshotModal }),
  snapshotName: '',
  setSnapshotName: (snapshotName) => set({ snapshotName }),
  bulkModal: false,
  setBulkModal: (bulkModal) => set({ bulkModal }),
  bulkName: '',
  setBulkName: (bulkName) => set({ bulkName }),
  isBulkMode: false,
  setIsBulkMode: (isBulkMode) => set({ isBulkMode }),
  selectedMods: [],
  setSelectedMods: (selectedMods) => set((state) => ({ 
    selectedMods: typeof selectedMods === 'function' ? selectedMods(state.selectedMods) : selectedMods 
  })),
  renameModal: null,
  setRenameModal: (renameModal) => set({ renameModal }),
  renameTarget: null,
  setRenameTarget: (renameTarget) => set({ renameTarget }),
  nameInput: '',
  setNameInput: (nameInput) => set({ nameInput }),
  localFolderModal: false,
  setLocalFolderModal: (localFolderModal) => set({ localFolderModal }),
  localFolderType: 'LOCAL_FOLDER',
  setLocalFolderType: (localFolderType) => set({ localFolderType }),
  localFolderName: '',
  setLocalFolderName: (localFolderName) => set({ localFolderName }),
  pendingImportSet: null,
  setPendingImportSet: (pendingImportSet) => set({ pendingImportSet }),
  missingImportMods: null,
  setMissingImportMods: (missingImportMods) => set({ missingImportMods }),
  yeetConfirmPending: null,
  setYeetConfirmPending: (yeetConfirmPending) => set({ yeetConfirmPending }),
  dnaMatchQueue: [],
  setDnaMatchQueue: (dnaMatchQueue) => set((state) => ({ dnaMatchQueue: typeof dnaMatchQueue === 'function' ? dnaMatchQueue(state.dnaMatchQueue) : dnaMatchQueue })),
  edgeOverrideQueue: [],
  setEdgeOverrideQueue: (edgeOverrideQueue) => set((state) => ({ edgeOverrideQueue: typeof edgeOverrideQueue === 'function' ? edgeOverrideQueue(state.edgeOverrideQueue) : edgeOverrideQueue })),
  scoutQueue: (() => {
    try {
      const wsId = localStorage.getItem("sanctuary_last_active_workspace") || localStorage.getItem("sanctuary_active_workspace") || "sims4";
      const cached = localStorage.getItem(`sanctuary_${wsId}_scout_queue`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  })(),
  setScoutQueue: (scoutQueue) => set((state) => {
    const nextQueue = typeof scoutQueue === 'function' ? scoutQueue(state.scoutQueue) : scoutQueue;
    try {
      const wsId = localStorage.getItem("sanctuary_last_active_workspace") || localStorage.getItem("sanctuary_active_workspace") || "sims4";
      if (wsId && Array.isArray(nextQueue)) {
        const lean = nextQueue.map((m: any) => ({
          name: m?.name,
          hash: m?.hash,
          displayName: m?.displayName,
          status: m?.status,
          color: m?.color,
          isSynced: m?.isSynced,
          physical_path: m?.physical_path,
          file_extension: m?.file_extension,
        }));
        localStorage.setItem(`sanctuary_${wsId}_scout_queue`, JSON.stringify(lean));
      }
    } catch {}
    return { scoutQueue: nextQueue };
  }),
  isScoutPanelOpen: false,
  setIsScoutPanelOpen: (isScoutPanelOpen) => set({ isScoutPanelOpen }),
  dnaMatches: [],
  setDnaMatches: (dnaMatches) => set({ dnaMatches }),
  isDnaModalOpen: false,
  setIsDnaModalOpen: (isDnaModalOpen) => set({ isDnaModalOpen }),
  isBackingUp: false,
  setIsBackingUp: (isBackingUp) => set({ isBackingUp }),
  backupType: null,
  setBackupType: (backupType) => set({ backupType }),
  completedBackups: [],
  setCompletedBackups: (completedBackups) => set((state) => ({
    completedBackups: typeof completedBackups === 'function' ? completedBackups(state.completedBackups) : completedBackups
  })),
  isDefconBackupSession: false,
  setIsDefconBackupSession: (isDefconBackupSession) => set({ isDefconBackupSession }),
  isRestoring: false,
  setIsRestoring: (isRestoring) => set({ isRestoring }),
  restoreType: null,
  setRestoreType: (restoreType) => set({ restoreType }),
  ingestProgress: null,
  setIngestProgress: (ingestProgress) => set({ ingestProgress }),
  isScanning: false,
  setIsScanning: (isScanning) => set({ isScanning }),
  isSilentScanning: false,
  setIsSilentScanning: (isSilentScanning) => set({ isSilentScanning }),
  showDefconAlert: false,
  setShowDefconAlert: (showDefconAlert) => set({ showDefconAlert }),
  showQuarantineModal: false,
  setShowQuarantineModal: (showQuarantineModal) => set({ showQuarantineModal }),
  showBrokenModal: false,
  setShowBrokenModal: (showBrokenModal) => set({ showBrokenModal }),
  droppedFiles: [],
  setDroppedFiles: (droppedFiles) => set({ droppedFiles }),
  dropzoneState: 'idle',
  setDropzoneState: (dropzoneState) => set({ dropzoneState }),
  isDragging: false,
  setIsDragging: (isDragging) => set({ isDragging }),
  isDropzoneOpen: false,
  setIsDropzoneOpen: (isDropzoneOpen) => set({ isDropzoneOpen }),
  confirmDialog: null,
  setConfirmDialog: (confirmDialog) => set({ confirmDialog }),
  updatePayload: null,
  setUpdatePayload: (updatePayload) => set({ updatePayload }),
  isUpdatePanelOpen: false,
  setIsUpdatePanelOpen: (isUpdatePanelOpen) => set({ isUpdatePanelOpen }),
  isNexusUpdatesPanelOpen: false,
  setIsNexusUpdatesPanelOpen: (isNexusUpdatesPanelOpen) => set({ isNexusUpdatesPanelOpen }),
  nexusPreviewAsset: null,
  setNexusPreviewAsset: (nexusPreviewAsset) => set({ nexusPreviewAsset }),
  isSideBrowserOpen: false,
  setIsSideBrowserOpen: (isSideBrowserOpen) => set({ isSideBrowserOpen }),
  isSupportPanelOpen: false,
  setIsSupportPanelOpen: (isSupportPanelOpen) => set({ isSupportPanelOpen }),
  isConflictRadarOpen: false,
  setIsConflictRadarOpen: (isConflictRadarOpen) => set({ isConflictRadarOpen }),
  isBlueprintSwapOpen: false,
  setIsBlueprintSwapOpen: (isBlueprintSwapOpen) => set({ isBlueprintSwapOpen }),
  showConflictsPanel: false,
  setShowConflictsPanel: (showConflictsPanel) => set({ showConflictsPanel }),
  showIncompatiblePanel: false,
  setShowIncompatiblePanel: (showIncompatiblePanel) => set({ showIncompatiblePanel }),
  showUpdatesModal: false,
  setShowUpdatesModal: (showUpdatesModal) => set({ showUpdatesModal }),
  
  sideBrowserUrl: '',
  sideBrowserTrigger: 0,
  setSideBrowserUrl: (sideBrowserUrl) => set((state) => ({ sideBrowserUrl, sideBrowserTrigger: (state.sideBrowserTrigger || 0) + 1 })),
  
  browserTabs: [],
  setBrowserTabs: (browserTabs) => set((state) => ({ browserTabs: typeof browserTabs === 'function' ? browserTabs(state.browserTabs) : browserTabs })),
  
  activeBrowserTabId: null,
  setActiveBrowserTabId: (activeBrowserTabId) => set({ activeBrowserTabId }),
  
  // Initialize bookmarks from localStorage
  browserBookmarks: JSON.parse(localStorage.getItem('sanctuary_bookmarks') || '[]'),
  setBrowserBookmarks: (browserBookmarks) => set((state) => {
    const newVal = typeof browserBookmarks === 'function' ? browserBookmarks(state.browserBookmarks) : browserBookmarks;
    localStorage.setItem('sanctuary_bookmarks', JSON.stringify(newVal));
    return { browserBookmarks: newVal };
  }),
  
  // Initialize history from localStorage
  browserHistory: JSON.parse(localStorage.getItem('sanctuary_history') || '[]'),
  setBrowserHistory: (browserHistory) => set((state) => {
    const newVal = typeof browserHistory === 'function' ? browserHistory(state.browserHistory) : browserHistory;
    localStorage.setItem('sanctuary_history', JSON.stringify(newVal));
    return { browserHistory: newVal };
  }),
  
  maxActiveWebviews: 3,
  setMaxActiveWebviews: (maxActiveWebviews) => set({ maxActiveWebviews }),
  
  useInternalBrowser: localStorage.getItem('sanctuary_use_internal_browser') !== 'false',
  setUseInternalBrowser: (useInternalBrowser) => {
    localStorage.setItem('sanctuary_use_internal_browser', useInternalBrowser.toString());
    set((state) => ({
      useInternalBrowser,
      isSideBrowserOpen: useInternalBrowser ? state.isSideBrowserOpen : false,
    }));
  },
  
  downloadsQueue: [],
  setDownloadsQueue: (downloadsQueue) => set((state) => ({ 
    downloadsQueue: typeof downloadsQueue === 'function' ? downloadsQueue(state.downloadsQueue) : downloadsQueue 
  })),

  stagingDraftMode:
    initialDraft?.stagingDraftMode === "mod_queue" || initialDraft?.stagingDraftMode === "blueprint"
      ? initialDraft.stagingDraftMode
      : "blueprint",
  setStagingDraftMode: (stagingDraftMode) =>
    set((state) => {
      const updatedAt = persistActiveStagingDraft({
        stagingDraftMode,
        stagingDraftName: state.stagingDraftName,
        stagingDraftCode: state.stagingDraftCode,
        stagingDraftNotes: state.stagingDraftNotes,
        stagingDraftAutoEquip: state.stagingDraftAutoEquip,
        stagingDraftStrategy: state.stagingDraftStrategy,
        stagingDraftItems: state.stagingDraftItems,
      });
      return { stagingDraftMode, stagingDraftLastSavedAt: updatedAt };
    }),
  stagingDraftName: initialDraft?.stagingDraftName || "",
  setStagingDraftName: (stagingDraftName) =>
    set((state) => {
      const updatedAt = persistActiveStagingDraft({
        stagingDraftMode: state.stagingDraftMode,
        stagingDraftName,
        stagingDraftCode: state.stagingDraftCode,
        stagingDraftNotes: state.stagingDraftNotes,
        stagingDraftAutoEquip: state.stagingDraftAutoEquip,
        stagingDraftStrategy: state.stagingDraftStrategy,
        stagingDraftItems: state.stagingDraftItems,
      });
      return { stagingDraftName, stagingDraftLastSavedAt: updatedAt };
    }),
  stagingDraftCode: initialDraft?.stagingDraftCode || "",
  setStagingDraftCode: (stagingDraftCode) =>
    set((state) => {
      const updatedAt = persistActiveStagingDraft({
        stagingDraftMode: state.stagingDraftMode,
        stagingDraftName: state.stagingDraftName,
        stagingDraftCode,
        stagingDraftNotes: state.stagingDraftNotes,
        stagingDraftAutoEquip: state.stagingDraftAutoEquip,
        stagingDraftStrategy: state.stagingDraftStrategy,
        stagingDraftItems: state.stagingDraftItems,
      });
      return { stagingDraftCode, stagingDraftLastSavedAt: updatedAt };
    }),
  stagingDraftNotes: initialDraft?.stagingDraftNotes || "",
  setStagingDraftNotes: (stagingDraftNotes) =>
    set((state) => {
      const updatedAt = persistActiveStagingDraft({
        stagingDraftMode: state.stagingDraftMode,
        stagingDraftName: state.stagingDraftName,
        stagingDraftCode: state.stagingDraftCode,
        stagingDraftNotes,
        stagingDraftAutoEquip: state.stagingDraftAutoEquip,
        stagingDraftStrategy: state.stagingDraftStrategy,
        stagingDraftItems: state.stagingDraftItems,
      });
      return { stagingDraftNotes, stagingDraftLastSavedAt: updatedAt };
    }),
  stagingDraftAutoEquip:
    typeof initialDraft?.stagingDraftAutoEquip === "boolean"
      ? initialDraft.stagingDraftAutoEquip
      : true,
  setStagingDraftAutoEquip: (stagingDraftAutoEquip) =>
    set((state) => {
      const updatedAt = persistActiveStagingDraft({
        stagingDraftMode: state.stagingDraftMode,
        stagingDraftName: state.stagingDraftName,
        stagingDraftCode: state.stagingDraftCode,
        stagingDraftNotes: state.stagingDraftNotes,
        stagingDraftAutoEquip,
        stagingDraftStrategy: state.stagingDraftStrategy,
        stagingDraftItems: state.stagingDraftItems,
      });
      return { stagingDraftAutoEquip, stagingDraftLastSavedAt: updatedAt };
    }),
  stagingDraftStrategy:
    initialDraft?.stagingDraftStrategy === "numeric_prefix" ||
    initialDraft?.stagingDraftStrategy === "loadorder_txt"
      ? initialDraft.stagingDraftStrategy
      : "alphabetical",
  setStagingDraftStrategy: (stagingDraftStrategy) =>
    set((state) => {
      const updatedAt = persistActiveStagingDraft({
        stagingDraftMode: state.stagingDraftMode,
        stagingDraftName: state.stagingDraftName,
        stagingDraftCode: state.stagingDraftCode,
        stagingDraftNotes: state.stagingDraftNotes,
        stagingDraftAutoEquip: state.stagingDraftAutoEquip,
        stagingDraftStrategy,
        stagingDraftItems: state.stagingDraftItems,
      });
      return { stagingDraftStrategy, stagingDraftLastSavedAt: updatedAt };
    }),
  stagingDraftItems: Array.isArray(initialDraft?.stagingDraftItems)
    ? initialDraft.stagingDraftItems
    : [],
  setStagingDraftItems: (stagingDraftItems) =>
    set((state) => {
      const nextItems =
        typeof stagingDraftItems === "function"
          ? stagingDraftItems(state.stagingDraftItems)
          : stagingDraftItems;
      const updatedAt = persistActiveStagingDraft({
        stagingDraftMode: state.stagingDraftMode,
        stagingDraftName: state.stagingDraftName,
        stagingDraftCode: state.stagingDraftCode,
        stagingDraftNotes: state.stagingDraftNotes,
        stagingDraftAutoEquip: state.stagingDraftAutoEquip,
        stagingDraftStrategy: state.stagingDraftStrategy,
        stagingDraftItems: nextItems,
      });
      return {
        stagingDraftItems: nextItems,
        stagingDraftLastSavedAt: updatedAt,
      };
    }),
  stagingDraftLastSavedAt: initialDraft?.updatedAt || null,
  savedLocalDrafts: loadSavedDraftSnapshots(),
  saveCurrentDraftLocally: (customName?: string) => {
    const state = get();
    const entryName =
      (customName || state.stagingDraftName || "").trim() ||
      `Blueprint (${state.stagingDraftItems.length})`;
    const entry = {
      id: `local-${Date.now().toString(36)}`,
      name: entryName,
      code:
        state.stagingDraftCode.trim() ||
        `SANC-BP-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      mode: state.stagingDraftMode,
      notes: state.stagingDraftNotes,
      autoEquip: state.stagingDraftAutoEquip,
      strategy: state.stagingDraftStrategy,
      items: state.stagingDraftItems,
      savedAt: new Date().toISOString(),
    };
    const nextSaved = [
      entry,
      ...state.savedLocalDrafts.filter(
        (d: any) => d.name.toLowerCase() !== entryName.toLowerCase()
      ),
    ].slice(0, 25);
    try {
      localStorage.setItem(SAVED_LOCAL_DRAFTS_KEY, JSON.stringify(nextSaved));
    } catch {
      // Ignore quota errors
    }
    set({ savedLocalDrafts: nextSaved });
  },
  loadSavedLocalDraft: (draftId: string) => {
    const state = get();
    const found = state.savedLocalDrafts.find((d: any) => d.id === draftId);
    if (!found) return;
    const nextState = {
      stagingDraftMode: (found.mode === "mod_queue" ? "mod_queue" : "blueprint") as
        | "mod_queue"
        | "blueprint",
      stagingDraftName: found.name || "",
      stagingDraftCode: found.code || "",
      stagingDraftNotes: found.notes || "",
      stagingDraftAutoEquip: typeof found.autoEquip === "boolean" ? found.autoEquip : true,
      stagingDraftStrategy: (found.strategy || "alphabetical") as
        | "alphabetical"
        | "numeric_prefix"
        | "loadorder_txt",
      stagingDraftItems: Array.isArray(found.items) ? found.items : [],
    };
    const updatedAt = persistActiveStagingDraft(nextState);
    set({
      ...nextState,
      stagingDraftLastSavedAt: updatedAt,
    });
  },
  deleteSavedLocalDraft: (draftId: string) => {
    const state = get();
    const nextSaved = state.savedLocalDrafts.filter((d: any) => d.id !== draftId);
    try {
      localStorage.setItem(SAVED_LOCAL_DRAFTS_KEY, JSON.stringify(nextSaved));
    } catch {
      // Ignore storage error
    }
    set({ savedLocalDrafts: nextSaved });
  },
  toggleModInStagingDraft: (mod: any) => {
    const state = get();
    const current = state.stagingDraftItems || [];

    // Support grouped parent suites / folders / collections (e.g. MC Command Center with child flavors)
    const rawFlavors =
      Array.isArray(mod?.flavors) && mod.flavors.length > 0
        ? mod.flavors
        : Array.isArray(mod?._groupedMods) && mod._groupedMods.length > 0
          ? mod._groupedMods
          : [];
    if (
      (mod?.isParent || mod?.isVirtual || mod?.isCollection || rawFlavors.length > 1) &&
      rawFlavors.length > 0 &&
      !mod._stageSingle
    ) {
      const seenChildNames = new Set<string>();
      const childMods = rawFlavors.filter((c: any) => {
        const norm = String(c?.name || c?.displayName || "").trim().toLowerCase();
        if (!norm || seenChildNames.has(norm)) return false;
        seenChildNames.add(norm);
        return true;
      });
      const isChildInDraft = (c: any) => {
        const cId = String(c.id || c.dbId || c.hash || c.name || "").toLowerCase();
        const cHash = String(c.hash || c.mod_versions?.[0]?.dna_hash || "").toLowerCase();
        const cName = String(c.name || c.displayName || "").toLowerCase();
        return current.some(
          (item: any) =>
            (cId && String(item.id || item.dbId || "").toLowerCase() === cId) ||
            (cHash && String(item.hash || item.dna_hash || "").toLowerCase() === cHash) ||
            (cName && String(item.name || item.displayName || "").toLowerCase() === cName)
        );
      };
      const allChildrenStaged = childMods.length > 0 && childMods.every(isChildInDraft);
      let nextItems = [...current];
      if (allChildrenStaged) {
        nextItems = current.filter(
          (item: any) => !childMods.some((c: any) => {
            const cId = String(c.id || c.dbId || c.hash || c.name || "").toLowerCase();
            const cHash = String(c.hash || c.mod_versions?.[0]?.dna_hash || "").toLowerCase();
            const cName = String(c.name || c.displayName || "").toLowerCase();
            return (
              (cId && String(item.id || item.dbId || "").toLowerCase() === cId) ||
              (cHash && String(item.hash || item.dna_hash || "").toLowerCase() === cHash) ||
              (cName && String(item.name || item.displayName || "").toLowerCase() === cName)
            );
          })
        );
      } else {
        childMods.forEach((c: any) => {
          if (!isChildInDraft(c)) {
            const cCategory = c.category_override || c.type || c.category || mod.category_override || mod.category || "";
            const cName = c.name || c.displayName || "Unknown Mod";
            const cId = String(c.id || c.dbId || c.hash || cName);
            const cAuthor = c.master_author || c.author || mod.master_author || mod.author || "";
            const cLatestVer = Array.isArray(c.mod_versions) && c.mod_versions[0] ? c.mod_versions[0] : null;
            nextItems.push({
              id: cId,
              dbId: c.dbId || c.id || mod.dbId || mod.id,
              name: cName,
              displayName: c.displayName || c.name || "Unknown Mod",
              hash: c.hash || cLatestVer?.dna_hash || "",
              author: cAuthor,
              master_author: cAuthor,
              url: c.url || mod.url || "",
              version: c.latest_version || c.version || cLatestVer?.version_label || mod.latest_version || mod.version || "",
              image_url: c.image_url || mod.image_url || "",
              category: cCategory,
              category_override: cCategory,
              type: cCategory,
              description: c.description || c.desc || mod.description || mod.desc || "",
              compatible_versions:
                Array.isArray(c.compatible_versions) && c.compatible_versions.length > 0
                  ? c.compatible_versions
                  : Array.isArray(mod.compatible_versions)
                    ? mod.compatible_versions
                    : [],
              created_at: c.created_at || cLatestVer?.created_at || mod.created_at || undefined,
              updated_at: c.updated_at || cLatestVer?.created_at || c.created_at || mod.updated_at || mod.created_at || undefined,
              status: c.status || mod.status || "stable",
              status_reason: c.status_reason || mod.status_reason || undefined,
              compliance_tier: c.compliance_tier ?? mod.compliance_tier ?? 0,
              is_paid: !!(c.is_paid ?? mod.is_paid),
              is_early_access: !!(c.is_early_access ?? mod.is_early_access),
              requiredDLC: Array.isArray(c.requiredDLC) && c.requiredDLC.length > 0
                ? c.requiredDLC
                : Array.isArray(mod.requiredDLC)
                  ? mod.requiredDLC
                  : [],
              priority_tier: c.priority_tier || inferDefaultPriorityTier(cCategory, cName),
              load_order_index: nextItems.length,
            });
          }
        });
      }
      const updatedAt = persistActiveStagingDraft({
        stagingDraftMode: state.stagingDraftMode,
        stagingDraftName: state.stagingDraftName,
        stagingDraftCode: state.stagingDraftCode,
        stagingDraftNotes: state.stagingDraftNotes,
        stagingDraftAutoEquip: state.stagingDraftAutoEquip,
        stagingDraftStrategy: state.stagingDraftStrategy,
        stagingDraftItems: nextItems,
      });
      set({
        stagingDraftItems: nextItems,
        stagingDraftLastSavedAt: updatedAt,
      });
      return !allChildrenStaged;
    }

    const isNexusAsset =
      mod?.asset_type === "lexicon" ||
      mod?.asset_type === "chameleon" ||
      mod?.asset_type === "workbench_template";
    const targetId = isNexusAsset
      ? `asset_${mod.asset_type}_${mod.asset_id || mod.id}`
      : String(mod.id || mod.dbId || mod.hash || mod.name || "");
    const targetHash = String(mod.hash || "");
    const targetName = String(mod.name || mod.displayName || "");
    const existsIdx = current.findIndex(
      (item: any) =>
        (targetId && item.id === targetId) ||
        (!isNexusAsset && targetHash && item.hash && item.hash === targetHash) ||
        (!isNexusAsset && targetName && item.name.toLowerCase() === targetName.toLowerCase())
    );
    if (existsIdx >= 0) {
      const nextItems = current.filter((_: any, i: number) => i !== existsIdx);
      const updatedAt = persistActiveStagingDraft({
        stagingDraftMode: state.stagingDraftMode,
        stagingDraftName: state.stagingDraftName,
        stagingDraftCode: state.stagingDraftCode,
        stagingDraftNotes: state.stagingDraftNotes,
        stagingDraftAutoEquip: state.stagingDraftAutoEquip,
        stagingDraftStrategy: state.stagingDraftStrategy,
        stagingDraftItems: nextItems,
      });
      set({
        stagingDraftItems: nextItems,
        stagingDraftLastSavedAt: updatedAt,
      });
      return false;
    }
    const category = isNexusAsset
      ? mod.asset_type === "lexicon"
        ? "Lexicon"
        : mod.asset_type === "chameleon"
          ? "Chameleon"
          : "Template"
      : mod.category_override || mod.type || mod.category || "";
    const modName = mod.name || mod.displayName || "Unknown Mod";
    const resolvedAuthor = mod.master_author || mod.author || "";
    const latestVer = Array.isArray(mod.mod_versions) && mod.mod_versions[0] ? mod.mod_versions[0] : null;
    const newItem = {
      id: targetId || targetName,
      dbId: isNexusAsset ? undefined : mod.dbId || mod.id,
      name: modName,
      displayName: mod.displayName || mod.name || "Unknown Mod",
      hash: mod.hash || latestVer?.dna_hash || "",
      author: resolvedAuthor,
      master_author: resolvedAuthor,
      url: mod.url || "",
      version: mod.latest_version || mod.version || latestVer?.version_label || "",
      image_url: mod.image_url || "",
      category,
      category_override: category,
      type: category,
      description: mod.description || mod.desc || "",
      compatible_versions: Array.isArray(mod.compatible_versions) ? mod.compatible_versions : [],
      created_at: mod.created_at || latestVer?.created_at || undefined,
      updated_at: mod.updated_at || latestVer?.created_at || mod.created_at || undefined,
      status: mod.status || "stable",
      status_reason: mod.status_reason || undefined,
      compliance_tier: mod.compliance_tier ?? 0,
      is_paid: !!mod.is_paid,
      is_early_access: !!mod.is_early_access,
      requiredDLC: Array.isArray(mod.requiredDLC) ? mod.requiredDLC : [],
      priority_tier: isNexusAsset ? "3_normal" : mod.priority_tier || inferDefaultPriorityTier(category, modName),
      load_order_index: current.length,
      ...(isNexusAsset
        ? {
            asset_type: mod.asset_type,
            asset_id: mod.asset_id || mod.id,
            language: mod.language || "",
            theme_mode: mod.theme_mode || "",
            lexicon_type: mod.lexicon_type || "",
          }
        : {}),
    };
    const nextItems = [...current, newItem];
    const updatedAt = persistActiveStagingDraft({
      stagingDraftMode: state.stagingDraftMode,
      stagingDraftName: state.stagingDraftName,
      stagingDraftCode: state.stagingDraftCode,
      stagingDraftNotes: state.stagingDraftNotes,
      stagingDraftAutoEquip: state.stagingDraftAutoEquip,
      stagingDraftStrategy: state.stagingDraftStrategy,
      stagingDraftItems: nextItems,
    });
    set({
      stagingDraftItems: nextItems,
      stagingDraftLastSavedAt: updatedAt,
    });
    return true;
  },
  stageBlueprintToDraft: (blueprint: any) => {
    let parsedJson = blueprint?.json_data;
    if (typeof parsedJson === "string") {
      try {
        parsedJson = JSON.parse(parsedJson);
      } catch {
        parsedJson = {};
      }
    }
    parsedJson = parsedJson || {};
    let rawArtifacts = parsedJson.artifacts || blueprint?.artifacts || [];
    if (typeof rawArtifacts === "string") {
      try {
        rawArtifacts = JSON.parse(rawArtifacts);
      } catch {
        rawArtifacts = [];
      }
    }
    if (!Array.isArray(rawArtifacts)) rawArtifacts = [];

    const mappedItems = rawArtifacts.map((a: any, idx: number) => {
      if (typeof a === "string") {
        return {
          id: `${a}_${idx}`,
          name: a,
          displayName: a,
          hash: "",
          author: blueprint?.author || "",
          url: "",
          version: "",
          category: "",
          is_paid: false,
          is_early_access: false,
          priority_tier: inferDefaultPriorityTier("", a),
          load_order_index: idx,
        };
      }
      const modName = a.name || a.displayName || "Unknown Mod";
      const category = a.category_override || a.category || a.type || "";
      const author = a.master_author || a.author || blueprint?.author || "";
      return {
        id: String(a.id || a.dbId || a.hash || a.name || idx),
        dbId: a.dbId || a.id,
        name: modName,
        displayName: a.displayName || a.name || "Unknown Mod",
        hash: a.hash || "",
        author,
        master_author: author,
        url: a.url || "",
        version: a.version || a.latest_version || "",
        image_url: a.image_url || "",
        category,
        category_override: category,
        type: category,
        description: a.description || a.desc || "",
        compatible_versions: Array.isArray(a.compatible_versions) ? a.compatible_versions : [],
        created_at: a.created_at || undefined,
        updated_at: a.updated_at || a.created_at || undefined,
        status: a.status || "stable",
        status_reason: a.status_reason || undefined,
        compliance_tier: a.compliance_tier ?? 0,
        is_paid: !!a.is_paid,
        is_early_access: !!a.is_early_access,
        requiredDLC: Array.isArray(a.requiredDLC) ? a.requiredDLC : [],
        priority_tier: a.priority_tier || inferDefaultPriorityTier(category, modName),
        load_order_index: typeof a.load_order_index === "number" ? a.load_order_index : idx,
      };
    });
    const nextState = {
      stagingDraftMode: "blueprint" as const,
      stagingDraftName: blueprint?.name || parsedJson?.name || "Staged Blueprint",
      stagingDraftCode: parsedJson?.code || blueprint?.code || "",
      stagingDraftNotes: blueprint?.description || parsedJson?.notes || "",
      stagingDraftAutoEquip: true,
      stagingDraftStrategy: (parsedJson?.load_order_strategy || "alphabetical") as
        | "alphabetical"
        | "numeric_prefix"
        | "loadorder_txt",
      stagingDraftItems: mappedItems,
    };
    const updatedAt = persistActiveStagingDraft(nextState);
    set({
      ...nextState,
      stagingDraftLastSavedAt: updatedAt,
    });
  },
  clearStagingDraft: () => {
    try {
      localStorage.removeItem(LOCAL_STAGING_DRAFT_KEY);
    } catch {
      // Ignore storage error
    }
    set({
      stagingDraftItems: [],
      stagingDraftName: "",
      stagingDraftCode: "",
      stagingDraftNotes: "",
      stagingDraftLastSavedAt: null,
    });
  },

  volatileSignatureQueue: null,
  setVolatileSignatureQueue: (volatileSignatureQueue) =>
    set((state) => ({
      volatileSignatureQueue:
        typeof volatileSignatureQueue === "function"
          ? volatileSignatureQueue(state.volatileSignatureQueue)
          : volatileSignatureQueue,
    })),
  isSignatureQueueOpen: false,
  setIsSignatureQueueOpen: (isSignatureQueueOpen) => set({ isSignatureQueueOpen }),
}));
