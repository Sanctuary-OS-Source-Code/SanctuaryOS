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
  scoutQueue: any[];
  setScoutQueue: (val: any[] | ((prev: any[]) => any[])) => void;
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
  isRestoring: boolean;
  setIsRestoring: (val: boolean) => void;
  ingestProgress: any;
  setIngestProgress: (val: any) => void;
  isScanning: boolean;
  setIsScanning: (val: boolean) => void;
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
}

export const useModalStore = create<ModalState>((set) => ({
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
  scoutQueue: [],
  setScoutQueue: (scoutQueue) => set((state) => ({ scoutQueue: typeof scoutQueue === 'function' ? scoutQueue(state.scoutQueue) : scoutQueue })),
  dnaMatches: [],
  setDnaMatches: (dnaMatches) => set({ dnaMatches }),
  isDnaModalOpen: false,
  setIsDnaModalOpen: (isDnaModalOpen) => set({ isDnaModalOpen }),
  isBackingUp: false,
  setIsBackingUp: (isBackingUp) => set({ isBackingUp }),
  isRestoring: false,
  setIsRestoring: (isRestoring) => set({ isRestoring }),
  ingestProgress: null,
  setIngestProgress: (ingestProgress) => set({ ingestProgress }),
  isScanning: false,
  setIsScanning: (isScanning) => set({ isScanning }),
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
}));
