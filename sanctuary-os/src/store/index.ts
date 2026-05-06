import { create } from 'zustand';

interface GlobalState {
  view: string;
  setView: (view: string) => void;
  status: string;
  setStatus: (status: string) => void;
  userRole: string;
  setUserRole: (role: string) => void;
  isConfigured: boolean;
  setIsConfigured: (isConfigured: boolean) => void;
  livePath: string;
  setLivePath: (livePath: string) => void;
  modsPath: string;
  setModsPath: (modsPath: string) => void;
  vaultPath: string;
  setVaultPath: (vaultPath: string) => void;
  modList: any[];
  setModList: (modList: any[] | ((prev: any[]) => any[])) => void;
  playSets: any[];
  setPlaySets: (playSets: any[] | ((prev: any[]) => any[])) => void;
  activeSetName: string | null;
  setActiveSetName: (activeSetName: string | null) => void;
  activePlaySetIndex: number;
  setActivePlaySetIndex: (index: number) => void;
  quarantineList: string[];
  setQuarantineList: (list: string[]) => void;
  shelterContents: string[];
  setShelterContents: (list: string[]) => void;
  shelterActive: boolean;
  setShelterActive: (active: boolean) => void;
  backupList: string[];
  setBackupList: (list: string[]) => void;
  anarchyRules: { highlander: boolean, family: boolean, dependencies: boolean, intercept: boolean };
  setAnarchyRules: (rules: any) => void;
  ownedDLC: string[];
  setOwnedDLC: (dlcs: string[]) => void;
  maskedDLC: string[];
  setMaskedDLC: (dlcs: string[]) => void;
  selectedVersion: string;
  setSelectedVersion: (version: string) => void;
  networkUpdates: { broken: any[], obsolete: any[], updated: any[] };
  setNetworkUpdates: (updates: any) => void;
  scanProgress: { current: number, total: number, message: string };
  setScanProgress: (progress: any) => void;
  defconLevel: number;
  setDefconLevel: (level: number) => void;
  isPatchDetected: boolean;
  setIsPatchDetected: (detected: boolean) => void;
  showDefconAlert: boolean;
  setShowDefconAlert: (show: boolean) => void;
  backupProgress: any;
  setBackupProgress: (progress: any) => void;
}

export const useStore = create<GlobalState>((set) => ({
  view: 'dashboard',
  setView: (view) => set({ view }),
  status: 'STANDING BY',
  setStatus: (status) => set({ status }),
  userRole: 'citizen',
  setUserRole: (userRole) => set({ userRole }),
  isConfigured: false,
  setIsConfigured: (isConfigured) => set({ isConfigured }),
  livePath: '',
  setLivePath: (livePath) => set({ livePath }),
  modsPath: '',
  setModsPath: (modsPath) => set({ modsPath }),
  vaultPath: '',
  setVaultPath: (vaultPath) => set({ vaultPath }),
  modList: [],
  setModList: (modList) => set((state) => ({ modList: typeof modList === 'function' ? modList(state.modList) : modList })),
  playSets: [],
  setPlaySets: (playSets) => set((state) => ({ playSets: typeof playSets === 'function' ? playSets(state.playSets) : playSets })),
  activeSetName: null,
  setActiveSetName: (activeSetName) => set({ activeSetName }),
  activePlaySetIndex: 0,
  setActivePlaySetIndex: (activePlaySetIndex) => set({ activePlaySetIndex }),
  quarantineList: [],
  setQuarantineList: (quarantineList) => set({ quarantineList }),
  shelterContents: [],
  setShelterContents: (shelterContents) => set({ shelterContents }),
  shelterActive: false,
  setShelterActive: (shelterActive) => set({ shelterActive }),
  backupList: [],
  setBackupList: (backupList) => set({ backupList }),
  anarchyRules: { highlander: true, family: true, dependencies: true, intercept: true },
  setAnarchyRules: (anarchyRules) => set({ anarchyRules }),
  ownedDLC: [],
  setOwnedDLC: (ownedDLC) => set({ ownedDLC }),
  maskedDLC: [],
  setMaskedDLC: (maskedDLC) => set({ maskedDLC }),
  selectedVersion: '1.123.66',
  setSelectedVersion: (selectedVersion) => set({ selectedVersion }),
  networkUpdates: { broken: [], obsolete: [], updated: [] },
  setNetworkUpdates: (networkUpdates) => set({ networkUpdates }),
  scanProgress: { current: 0, total: 0, message: '' },
  setScanProgress: (scanProgress) => set({ scanProgress }),
  defconLevel: 5,
  setDefconLevel: (defconLevel) => set({ defconLevel }),
  isPatchDetected: false,
  setIsPatchDetected: (isPatchDetected) => set({ isPatchDetected }),
  showDefconAlert: false,
  setShowDefconAlert: (showDefconAlert) => set({ showDefconAlert }),
  backupProgress: null,
  setBackupProgress: (backupProgress) => set({ backupProgress })
}));