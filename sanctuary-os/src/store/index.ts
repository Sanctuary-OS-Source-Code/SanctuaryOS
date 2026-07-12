import { create } from 'zustand';
import sims4Schema from '../data/schemas/sims4.json';
import { supabase } from '../supabase';
import { invoke } from '@tauri-apps/api/core';

const loadActiveGameSchema = () => {
  try {
    const cached = localStorage.getItem('sanctuary_master_schema_sims4');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.schema_version >= sims4Schema.schema_version) {
        return parsed;
      }
    }
  } catch(e) {}
  return sims4Schema;
};

const loadIdeOpenFiles = () => {
  try {
    const cached = localStorage.getItem('sanctuary_ide_open_files');
    if (cached) return JSON.parse(cached);
  } catch (e) {}
  return [];
};

const loadIdeActiveFileIndex = () => {
  try {
    const cached = localStorage.getItem('sanctuary_ide_active_file_index');
    if (cached) return parseInt(cached);
  } catch (e) {}
  return -1;
};

const loadCwUnsavedEdits = () => {
  try {
    const cached = localStorage.getItem('sanctuary_cw_unsaved_edits');
    if (cached) return JSON.parse(cached);
  } catch (e) {}
  return {};
};

const loadCwSelectedFile = () => {
  try {
    const cached = localStorage.getItem('sanctuary_cw_selected_file');
    if (cached) return JSON.parse(cached);
  } catch (e) {}
  return null;
};

const loadCwActiveTab = () => {
  try {
    const cached = localStorage.getItem('sanctuary_cw_active_tab');
    if (cached) return cached as "visual" | "raw";
  } catch (e) {}
  return "visual" as "visual" | "raw";
};

const loadNetworkUpdates = () => {
  try {
    const cached = localStorage.getItem('sanctuary_network_updates');
    if (cached) return JSON.parse(cached);
  } catch (e) {}
  return { broken: [], obsolete: [], updated: [] };
};

const loadWayfinderDrafts = () => {
  try {
    const cached = localStorage.getItem('sanctuary_wayfinder_drafts');
    if (cached) return JSON.parse(cached);
  } catch (e) {}
  return {};
};

const loadMasonCommentDrafts = () => {
  try {
    const cached = localStorage.getItem('sanctuary_mason_comment_drafts');
    if (cached) return JSON.parse(cached);
  } catch (e) {}
  return {};
};

const loadMasonHubDrafts = () => {
  try {
    const cached = localStorage.getItem('sanctuary_mason_hub_drafts');
    if (cached) return JSON.parse(cached);
  } catch (e) {}
  return {};
};

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
  detectGameVersion: () => Promise<void>;
  networkUpdates: { broken: any[], obsolete: any[], updated: any[] };
  setNetworkUpdates: (updates: any) => void;
  scanProgress: { current: number, total: number, message: string };
  setScanProgress: (progress: any) => void;
  defconLevel: number;
  setDefconLevel: (level: number) => void;
  isPatchDetected: boolean;
  setIsPatchDetected: (detected: boolean) => void;
  backupProgress: any;
  setBackupProgress: (progress: any) => void;
  hideIneligible: boolean;
  setHideIneligible: (hide: boolean) => void;
  marketTab: string;
  setMarketTab: (tab: string) => void;
  nexusUpdatesCount: number;
  setNexusUpdatesCount: (count: number) => void;
  nexusUpdateTabs: string[];
  setNexusUpdateTabs: (tabs: string[]) => void;
  showImages: boolean;
  setShowImages: (show: boolean) => void;
  marketSearchQuery: string;
  setMarketSearchQuery: (query: string) => void;
  ideOpenFiles: {name: string, path: string, content: string, originalContent: string}[];
  setIdeOpenFiles: (files: {name: string, path: string, content: string, originalContent: string}[] | ((prev: any[]) => any[])) => void;
  ideActiveFileIndex: number;
  setIdeActiveFileIndex: (index: number) => void;
  cloudIdeOpenFiles: {name: string, path: string, content: string, originalContent: string}[];
  setCloudIdeOpenFiles: (files: {name: string, path: string, content: string, originalContent: string}[] | ((prev: any[]) => any[])) => void;
  cloudIdeActiveFileIndex: number;
  setCloudIdeActiveFileIndex: (index: number) => void;
  cwUnsavedEdits: Record<string, string>;
  setCwUnsavedEdits: (edits: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  cwSelectedFile: {name: string, path: string} | null;
  setCwSelectedFile: (file: {name: string, path: string} | null) => void;
  cwActiveTab: "visual" | "raw";
  setCwActiveTab: (tab: "visual" | "raw") => void;
  masonActiveTab: string;
  setMasonActiveTab: (tab: string) => void;
  communityDefaultsRefreshTrigger: number;
  incrementCommunityDefaultsRefreshTrigger: () => void;
  wayfinderDrafts: Record<string, any>;
  setWayfinderDrafts: (drafts: Record<string, any> | ((prev: Record<string, any>) => Record<string, any>)) => void;
  masonCommentDrafts: Record<string, any>;
  setMasonCommentDrafts: (drafts: Record<string, any> | ((prev: Record<string, any>) => Record<string, any>)) => void;
  masonHubDrafts: Record<string, any>;
  setMasonHubDrafts: (drafts: Record<string, any> | ((prev: Record<string, any>) => Record<string, any>)) => void;
  cwMainTab: "CONFIGS" | "TEMPLATES";
  setCwMainTab: (tab: "CONFIGS" | "TEMPLATES") => void;
  wayfinderActiveTab: string;
  setWayfinderActiveTab: (tab: string) => void;
  activeGameSchema: any;
  setActiveGameSchema: (schema: any) => void;
}

export const useStore = create<GlobalState>((set) => ({
  activeGameSchema: loadActiveGameSchema(),
  setActiveGameSchema: (activeGameSchema) => set({ activeGameSchema }),
  view: 'dashboard',
  setView: (view) => set({ view }),
  status: 'STANDING BY',
  setStatus: (status) => set((state) => {
    let type: 'info' | 'error' | 'success' | 'warning' = 'info';
    if (status.toLowerCase().includes('error') || status.toLowerCase().includes('fail') || status.includes('❌')) type = 'error';
    if (status.toLowerCase().includes('success') || status.toLowerCase().includes('done') || status.includes('✅') || status.includes('icon_check_circle')) type = 'success';
    if (state.statusLog.length > 0 && state.statusLog[0].message === status && (Date.now() - state.statusLog[0].timestamp) < 500) return state;
    
    const newEntry = { id: Math.random().toString(36).substr(2, 9), message: status, type, timestamp: Date.now() };
    
    if ((window as any)._statusTimeout) clearTimeout((window as any)._statusTimeout);
    (window as any)._statusTimeout = setTimeout(() => {
      useStore.setState({ status: 'STANDING BY...' });
    }, 5000);

    return { status, statusLog: [newEntry, ...state.statusLog].slice(0, 50) };
  }),
  wayfinderActiveTab: "command_center",
  setWayfinderActiveTab: (tab) => set({ wayfinderActiveTab: tab }),
  cwMainTab: "CONFIGS",
  setCwMainTab: (tab) => set({ cwMainTab: tab }),
  statusLog: [],
  pushStatus: (message, type = 'info') => set((state) => {
    let finalType = type;
    if (finalType === 'info') {
      const lower = message.toLowerCase();
      if (lower.includes('error') || lower.includes('fail') || lower.includes('blocked') || lower.includes('revoked') || lower.includes('missing')) finalType = 'error';
      else if (lower.includes('success') || lower.includes('cleared') || lower.includes('done')) finalType = 'success';
    }
    if (state.statusLog.length > 0 && state.statusLog[0].message === message && (Date.now() - state.statusLog[0].timestamp) < 500) return state;

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
  detectGameVersion: async () => {
    try {
      const config: any = await invoke("get_saved_coordinates");
      if (!config.live_path) return;

      const rawRipped = await invoke<string>("rip_game_version", {
        livePath: config.live_path,
      });
      const cleanVersion = rawRipped.replace(/[^0-9.]/g, "");
      set({ selectedVersion: cleanVersion, status: `STANDING BY |  v${cleanVersion}` });
    } catch (err) {
      console.warn("Version detection failed:", err);
    }
  },
  networkUpdates: loadNetworkUpdates(),
  setNetworkUpdates: (networkUpdates) => {
    try {
      if (networkUpdates) {
        localStorage.setItem('sanctuary_network_updates', JSON.stringify(networkUpdates));
      } else {
        localStorage.removeItem('sanctuary_network_updates');
      }
    } catch (e) {}
    set({ networkUpdates });
  },
  scanProgress: { current: 0, total: 0, message: '' },
  setScanProgress: (scanProgress) => set({ scanProgress }),
  defconLevel: 5,
  setDefconLevel: (defconLevel) => set({ defconLevel }),
  isPatchDetected: false,
  setIsPatchDetected: (isPatchDetected) => set({ isPatchDetected }),
  backupProgress: null,
  setBackupProgress: (backupProgress) => set((state: any) => {
    if (state.backupProgress && backupProgress && state.backupProgress.action === backupProgress.action) {
      if (backupProgress.current < state.backupProgress.current) return state;
    }
    return { backupProgress };
  }),
  hideIneligible: false,
  setHideIneligible: (hideIneligible) => set({ hideIneligible }),
  marketTab: 'MODS',
  setMarketTab: (marketTab) => set({ marketTab }),
  nexusUpdatesCount: 0,
  setNexusUpdatesCount: (nexusUpdatesCount) => set({ nexusUpdatesCount }),
  nexusUpdateTabs: [],
  setNexusUpdateTabs: (nexusUpdateTabs) => set({ nexusUpdateTabs }),
  showImages: localStorage.getItem("sanctuary_show_images") !== "false",
  setShowImages: (showImages) => { localStorage.setItem("sanctuary_show_images", showImages.toString()); set({ showImages }); },
  marketSearchQuery: '',
  setMarketSearchQuery: (marketSearchQuery) => set({ marketSearchQuery }),
  ideOpenFiles: loadIdeOpenFiles(),
  setIdeOpenFiles: (files) => set((state) => {
      const newFiles = typeof files === 'function' ? files(state.ideOpenFiles) : files;
      localStorage.setItem('sanctuary_ide_open_files', JSON.stringify(newFiles));
      return { ideOpenFiles: newFiles };
  }),
  ideActiveFileIndex: loadIdeActiveFileIndex(),
  setIdeActiveFileIndex: (ideActiveFileIndex) => {
    localStorage.setItem('sanctuary_ide_active_file_index', ideActiveFileIndex.toString());
    set({ ideActiveFileIndex });
  },
  cloudIdeOpenFiles: [],
  setCloudIdeOpenFiles: (files) => set((state) => {
      const newFiles = typeof files === 'function' ? files(state.cloudIdeOpenFiles) : files;
      return { cloudIdeOpenFiles: newFiles };
  }),
  cloudIdeActiveFileIndex: -1,
  setCloudIdeActiveFileIndex: (cloudIdeActiveFileIndex) => set({ cloudIdeActiveFileIndex }),
  cwUnsavedEdits: loadCwUnsavedEdits(),
  setCwUnsavedEdits: (edits) => set((state) => {
      const newEdits = typeof edits === 'function' ? edits(state.cwUnsavedEdits) : edits;
      localStorage.setItem('sanctuary_cw_unsaved_edits', JSON.stringify(newEdits));
      return { cwUnsavedEdits: newEdits };
  }),
  cwSelectedFile: loadCwSelectedFile(),
  setCwSelectedFile: (file) => set((state) => {
      localStorage.setItem('sanctuary_cw_selected_file', JSON.stringify(file));
      return { cwSelectedFile: file };
  }),
  cwActiveTab: loadCwActiveTab(),
  setCwActiveTab: (tab) => { localStorage.setItem('sanctuary_cw_active_tab', tab); set({ cwActiveTab: tab }); },
  masonActiveTab: "command_center",
  setMasonActiveTab: (tab) => set({ masonActiveTab: tab }),
  communityDefaultsRefreshTrigger: 0,
  incrementCommunityDefaultsRefreshTrigger: () => set((state) => ({ communityDefaultsRefreshTrigger: state.communityDefaultsRefreshTrigger + 1 })),
  wayfinderDrafts: loadWayfinderDrafts(),
  setWayfinderDrafts: (drafts) => set((state) => {
      const newDrafts = typeof drafts === 'function' ? drafts(state.wayfinderDrafts) : drafts;
      localStorage.setItem('sanctuary_wayfinder_drafts', JSON.stringify(newDrafts));
      return { wayfinderDrafts: newDrafts };
  }),
  masonCommentDrafts: loadMasonCommentDrafts(),
  setMasonCommentDrafts: (drafts) => set((state) => {
      const newDrafts = typeof drafts === 'function' ? drafts(state.masonCommentDrafts) : drafts;
      localStorage.setItem('sanctuary_mason_comment_drafts', JSON.stringify(newDrafts));
      return { masonCommentDrafts: newDrafts };
  }),
  masonHubDrafts: loadMasonHubDrafts(),
  setMasonHubDrafts: (drafts) => set((state) => {
      const newDrafts = typeof drafts === 'function' ? drafts(state.masonHubDrafts) : drafts;
      localStorage.setItem('sanctuary_mason_hub_drafts', JSON.stringify(newDrafts));
      return { masonHubDrafts: newDrafts };
  })
}));

export const syncMasterSchemas = async () => {
  try {
    if (!navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true") return;
    const { data, error } = await supabase.from('sanctuary_schemas').select('schema_data').eq('id', 'sims4').single();
    if (!error && data && data.schema_data) {
       const currentVersion = useStore.getState().activeGameSchema.schema_version || 1;
       const cloudVersion = data.schema_data.schema_version || 1;
       if (cloudVersion > currentVersion) {
         localStorage.setItem('sanctuary_master_schema_sims4', JSON.stringify(data.schema_data));
         useStore.getState().setActiveGameSchema(data.schema_data);

         // Dev Sync: Overwrite local file to keep source repo updated
         try {
           const { invoke } = await import('@tauri-apps/api/core');
           await invoke('overwrite_local_schema', { 
             schemaId: 'sims4', 
             schemaData: JSON.stringify(data.schema_data, null, 2) 
           });
           console.log("Local schema synced to src/data/schemas/sims4.json");
         } catch(e) {}
       }
    }
  } catch (e) {
    console.error("Failed to sync master schemas", e);
  }
};