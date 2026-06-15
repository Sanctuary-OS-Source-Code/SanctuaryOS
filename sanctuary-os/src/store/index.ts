import { create } from 'zustand';

interface GlobalState {
  view: string;
  setView: (view: string) => void;
  status: string;
  setStatus: (status: string) => void;
  statusLog: { id: string, message: string, type: 'success' | 'error' | 'info' | 'warning' | 'loading', timestamp: number }[];
  pushStatus: (message: string, type?: 'success' | 'error' | 'info' | 'warning' | 'loading') => void;
  clearStatusLog: () => void;
  userRole: string;
  setUserRole: (role: string) => void;
  session: any | null;
  setSession: (session: any | null) => void;
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
  backupList: any[];
  setBackupList: (list: any[]) => void;
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
  hideIneligible: boolean;
  setHideIneligible: (hide: boolean) => void;
  marketTab: string;
  setMarketTab: (tab: string) => void;
  showImages: boolean;
  setShowImages: (show: boolean) => void;
}

export const useStore = create<GlobalState>((set) => ({
  view: 'dashboard',
  setView: (view) => set({ view }),
  status: 'STANDING BY',
  setStatus: (status) => set((state) => {
    let type: 'info' | 'error' | 'success' | 'warning' = 'info';
    if (status.toLowerCase().includes('error') || status.toLowerCase().includes('fail') || status.includes('❌')) type = 'error';
    if (status.toLowerCase().includes('success') || status.toLowerCase().includes('done') || status.includes('✅') || status.includes('ui_icon_success')) type = 'success';
    const newEntry = { id: Math.random().toString(36).substr(2, 9), message: status, type, timestamp: Date.now() };
    
    if ((window as any)._statusTimeout) clearTimeout((window as any)._statusTimeout);
    (window as any)._statusTimeout = setTimeout(() => {
      useStore.setState({ status: 'STANDING BY...' });
    }, 5000);

    return { status, statusLog: [newEntry, ...state.statusLog].slice(0, 50) };
  }),
  statusLog: [],
  pushStatus: (message, type = 'info') => set((state) => {
    let finalType = type;
    if (finalType === 'info') {
      const lower = message.toLowerCase();
      if (lower.includes('error') || lower.includes('fail') || lower.includes('blocked') || lower.includes('revoked') || lower.includes('missing')) finalType = 'error';
      else if (lower.includes('success') || lower.includes('cleared') || lower.includes('done')) finalType = 'success';
    }
    const newEntry = { id: Math.random().toString(36).substr(2, 9), message, type: finalType, timestamp: Date.now() };
    
    if ((window as any)._statusTimeout) clearTimeout((window as any)._statusTimeout);
    (window as any)._statusTimeout = setTimeout(() => {
      useStore.setState({ status: 'STANDING BY...' });
    }, 5000);

    return { status: message, statusLog: [newEntry, ...state.statusLog].slice(0, 50) };
  }),
  clearStatusLog: () => set({ statusLog: [] }),
  userRole: 'citizen',
  setUserRole: (userRole) => set({ userRole }),
  session: null,
  setSession: (session) => set({ session }),
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
  selectedVersion: '',
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
  setBackupProgress: (backupProgress) => set({ backupProgress }),
  hideIneligible: false,
  setHideIneligible: (hideIneligible) => set({ hideIneligible }),
  marketTab: 'MODS',
  setMarketTab: (marketTab) => set({ marketTab }),
  showImages: localStorage.getItem("sanctuary_show_images") !== "false",
  setShowImages: (showImages) => { localStorage.setItem("sanctuary_show_images", showImages.toString()); set({ showImages }); }
}));