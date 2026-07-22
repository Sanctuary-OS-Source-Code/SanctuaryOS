import { create } from 'zustand';
import sims4Schema from '../data/schemas/sims4.json';
import { supabase } from '../supabase';
import { invoke } from '@tauri-apps/api/core';

const loadActiveGameSchema = () => {
  try {
    // Try to find the active workspace from config file directly if possible, otherwise fallback
    let activeSchemaId = 'sims4';
    try {
      // Very hacky synchronous read of localStorage or fallback
      const globalConfigRaw = localStorage.getItem('sanctuary_config');
      if (globalConfigRaw) {
         const cfg = JSON.parse(globalConfigRaw);
         if (cfg.active_workspace_id && cfg.workspaces) {
            const ws = cfg.workspaces.find((w: any) => w.id === cfg.active_workspace_id);
            if (ws && ws.schema_id) activeSchemaId = ws.schema_id;
         }
      }
    } catch(e) {}
    
    const cached = localStorage.getItem(`sanctuary_master_schema_${activeSchemaId}`);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.schema_version >= sims4Schema.schema_version || activeSchemaId !== 'sims4') {
        return parsed;
      }
    }
  } catch(e) {}
  return sims4Schema;
};

const loadIdeOpenFiles = (wsId: string) => {
  try {
    const cached = localStorage.getItem(`sanctuary_${wsId}_ide_open_files`);
    if (cached) return JSON.parse(cached);
  } catch (e) {}
  return [];
};

const loadIdeActiveFileIndex = (wsId: string) => {
  try {
    const cached = localStorage.getItem(`sanctuary_${wsId}_ide_active_file_index`);
    if (cached) return parseInt(cached);
  } catch (e) {}
  return -1;
};

const loadCwUnsavedEdits = (wsId: string) => {
  try {
    const cached = localStorage.getItem(`sanctuary_${wsId}_cw_unsaved_edits`);
    if (cached) return JSON.parse(cached);
  } catch (e) {}
  return {};
};

const loadCwSelectedFile = (wsId: string) => {
  try {
    const cached = localStorage.getItem(`sanctuary_${wsId}_cw_selected_file`);
    if (cached) return JSON.parse(cached);
  } catch (e) {}
  return null;
};

const loadCwActiveTab = (wsId: string) => {
  try {
    const cached = localStorage.getItem(`sanctuary_${wsId}_cw_active_tab`);
    if (cached) return cached as "visual" | "raw";
  } catch (e) {}
  return "visual" as "visual" | "raw";
};

const loadNetworkUpdates = (wsId: string) => {
  try {
    const cached = localStorage.getItem(`sanctuary_${wsId}_network_updates`);
    if (cached) return JSON.parse(cached);
  } catch (e) {}
  return { broken: [], obsolete: [], updated: [] };
};

const loadWayfinderDrafts = (wsId: string) => {
  try {
    const cached = localStorage.getItem(`sanctuary_${wsId}_wayfinder_drafts`);
    if (cached) return JSON.parse(cached);
  } catch (e) {}
  return {};
};

const loadMasonCommentDrafts = (wsId: string) => {
  try {
    const cached = localStorage.getItem(`sanctuary_${wsId}_mason_comment_drafts`);
    if (cached) return JSON.parse(cached);
  } catch (e) {}
  return {};
};

const loadMasonHubDrafts = (wsId: string) => {
  try {
    const cached = localStorage.getItem(`sanctuary_${wsId}_mason_hub_drafts`);
    if (cached) return JSON.parse(cached);
  } catch (e) {}
  return {};
};

const loadPlaySets = (wsId: string) => {
  try {
    const savedSets = localStorage.getItem(`sanctuary_${wsId}_playsets`);
    if (savedSets) {
      const parsedSets = JSON.parse(savedSets);
      return parsedSets.map((set: any) => ({
        name: set.name,
        mods: (set.mods || []).map((m: any) =>
          typeof m === "string" ? m : m.name,
        ),
      }));
    }
  } catch (e) {}
  return [];
};

const loadActiveSet = (wsId: string) => {
  return localStorage.getItem(`sanctuary_${wsId}_active_set`);
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
  isGlobalConfigLoaded: boolean;
  setIsGlobalConfigLoaded: (loaded: boolean) => void;
  workspaces: any[];
  setWorkspaces: (workspaces: any[]) => void;
  activeWorkspaceId: string | null;
  setActiveWorkspaceId: (id: string | null) => void;
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
  cwActiveTab: "visual" | "raw" | "dual";
  setCwActiveTab: (tab: "visual" | "raw" | "dual") => void;
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
  keepersActiveTab: string;
  setKeepersActiveTab: (tab: string) => void;
  activeGameSchema: any;
  setActiveGameSchema: (schema: any) => void;
  hydrateWorkspaceState: (wsId: string) => void;
}

export const useStore = create<GlobalState>((set) => ({
  activeGameSchema: sims4Schema,
  setActiveGameSchema: (activeGameSchema) => set({ activeGameSchema }),
  hydrateWorkspaceState: (wsId) => {
    set({
      ideOpenFiles: loadIdeOpenFiles(wsId),
      ideActiveFileIndex: loadIdeActiveFileIndex(wsId),
      cwUnsavedEdits: loadCwUnsavedEdits(wsId),
      cwSelectedFile: loadCwSelectedFile(wsId),
      cwActiveTab: loadCwActiveTab(wsId),
      networkUpdates: loadNetworkUpdates(wsId),
      wayfinderDrafts: loadWayfinderDrafts(wsId),
      masonCommentDrafts: loadMasonCommentDrafts(wsId),
      masonHubDrafts: loadMasonHubDrafts(wsId),
      playSets: loadPlaySets(wsId),
      activeSetName: loadActiveSet(wsId),
      activePlaySetIndex: loadPlaySets(wsId).findIndex((s: any) => s.name === loadActiveSet(wsId)) !== -1 ? loadPlaySets(wsId).findIndex((s: any) => s.name === loadActiveSet(wsId)) : 0,
      modList: [],
    });
  },
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
  modsPath: "",
  setModsPath: (modsPath) => set({ modsPath }),
  vaultPath: "",
  setVaultPath: (vaultPath) => set({ vaultPath }),
  isGlobalConfigLoaded: false,
  setIsGlobalConfigLoaded: (loaded) => set({ isGlobalConfigLoaded: loaded }),
  workspaces: [],
  setWorkspaces: (ws) => set({ workspaces: ws }),
  activeWorkspaceId: null,
  setActiveWorkspaceId: (activeWorkspaceId) => set({ activeWorkspaceId }),
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
  networkUpdates: { broken: [], obsolete: [], updated: [] },
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
  ideOpenFiles: [],
  setIdeOpenFiles: (files) => set((state) => {
      const newFiles = typeof files === 'function' ? files(state.ideOpenFiles) : files;
      const wsId = state.activeWorkspaceId || 'default';
      localStorage.setItem(`sanctuary_${wsId}_ide_open_files`, JSON.stringify(newFiles));
      return { ideOpenFiles: newFiles };
  }),
  ideActiveFileIndex: -1,
  setIdeActiveFileIndex: (ideActiveFileIndex) => set((state) => {
    const wsId = state.activeWorkspaceId || 'default';
    localStorage.setItem(`sanctuary_${wsId}_ide_active_file_index`, ideActiveFileIndex.toString());
    return { ideActiveFileIndex };
  }),
  cloudIdeOpenFiles: [],
  setCloudIdeOpenFiles: (files) => set((state) => {
      const newFiles = typeof files === 'function' ? files(state.cloudIdeOpenFiles) : files;
      return { cloudIdeOpenFiles: newFiles };
  }),
  cloudIdeActiveFileIndex: -1,
  setCloudIdeActiveFileIndex: (cloudIdeActiveFileIndex) => set({ cloudIdeActiveFileIndex }),
  cwUnsavedEdits: {},
  setCwUnsavedEdits: (edits) => set((state) => {
      const newEdits = typeof edits === 'function' ? edits(state.cwUnsavedEdits) : edits;
      const wsId = state.activeWorkspaceId || 'default';
      localStorage.setItem(`sanctuary_${wsId}_cw_unsaved_edits`, JSON.stringify(newEdits));
      return { cwUnsavedEdits: newEdits };
  }),
  cwSelectedFile: null,
  setCwSelectedFile: (file) => set((state) => {
      const wsId = state.activeWorkspaceId || 'default';
      localStorage.setItem(`sanctuary_${wsId}_cw_selected_file`, JSON.stringify(file));
      return { cwSelectedFile: file };
  }),
  cwActiveTab: "visual",
  setCwActiveTab: (tab) => set((state) => {
      const wsId = state.activeWorkspaceId || 'default';
      localStorage.setItem(`sanctuary_${wsId}_cw_active_tab`, tab);
      return { cwActiveTab: tab };
  }),
  masonActiveTab: "command_center",
  setMasonActiveTab: (tab) => set({ masonActiveTab: tab }),
  communityDefaultsRefreshTrigger: 0,
  incrementCommunityDefaultsRefreshTrigger: () => set((state) => ({ communityDefaultsRefreshTrigger: state.communityDefaultsRefreshTrigger + 1 })),
  wayfinderDrafts: {},
  setWayfinderDrafts: (drafts) => set((state) => {
      const newDrafts = typeof drafts === 'function' ? drafts(state.wayfinderDrafts) : drafts;
      const wsId = state.activeWorkspaceId || 'default';
      localStorage.setItem(`sanctuary_${wsId}_wayfinder_drafts`, JSON.stringify(newDrafts));
      return { wayfinderDrafts: newDrafts };
  }),
  masonCommentDrafts: {},
  setMasonCommentDrafts: (drafts) => set((state) => {
      const newDrafts = typeof drafts === 'function' ? drafts(state.masonCommentDrafts) : drafts;
      const wsId = state.activeWorkspaceId || 'default';
      localStorage.setItem(`sanctuary_${wsId}_mason_comment_drafts`, JSON.stringify(newDrafts));
      return { masonCommentDrafts: newDrafts };
  }),
  masonHubDrafts: {},
  setMasonHubDrafts: (drafts) => set((state) => {
      const newDrafts = typeof drafts === 'function' ? drafts(state.masonHubDrafts) : drafts;
      const wsId = state.activeWorkspaceId || 'default';
      localStorage.setItem(`sanctuary_${wsId}_mason_hub_drafts`, JSON.stringify(newDrafts));
      return { masonHubDrafts: newDrafts };
  }),
  keepersActiveTab: "active_games",
  setKeepersActiveTab: (tab) => set({ keepersActiveTab: tab })
}));

export const syncMasterSchemas = async (schemaId: string = 'sims4') => {
  try {
    if (!navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true") {
      const cached = localStorage.getItem(`sanctuary_master_schema_${schemaId}`);
      if (cached) {
        useStore.getState().setActiveGameSchema(JSON.parse(cached));
      }
      return;
    }
    const { data, error } = await supabase.from('sanctuary_schemas').select('schema_data').eq('id', schemaId).maybeSingle();
    if (!error && data && data.schema_data) {
       localStorage.setItem(`sanctuary_master_schema_${schemaId}`, JSON.stringify(data.schema_data));
       useStore.getState().setActiveGameSchema(data.schema_data);
    } else {
       const cached = localStorage.getItem(`sanctuary_master_schema_${schemaId}`);
       if (cached) {
         useStore.getState().setActiveGameSchema(JSON.parse(cached));
       } else if (schemaId === 'sims4') {
         useStore.getState().setActiveGameSchema(sims4Schema);
       } else {
         // Fallback basic schema if not found anywhere
         const fallbackSchema = {
           id: schemaId,
           name: schemaId.replace(/_/g, ' ').toUpperCase(),
           schema_version: 1,
           config_schema: { groups: [] },
           file_patterns: { live: [], mods: [], vault: [], dlc: [] },
           folder_structures: { live: [], mods: [], vault: [] },
           heuristics: { critical_files: [], ignore_patterns: [] },
           features: { has_dlc: false, has_saves: false, has_tray: false, has_cc: false }
         };
         useStore.getState().setActiveGameSchema(fallbackSchema);
       }
    }
  } catch (e) {
    console.error("Failed to sync master schemas", e);
  }
};