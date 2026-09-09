import { create } from 'zustand';
import { isDesktop } from "../utils/envUtils";
import { supabase } from '../supabase';
import { invoke } from '@tauri-apps/api/core';
import { getSubdomain } from '../utils/routingUtils';

export const getSafeSchema = (raw: any, fallbackId: string) => {
  const safe = { ...raw };
  if (!safe.id) safe.id = fallbackId;
  if (!safe.game_id) safe.game_id = safe.id;
  if (!safe.name) safe.name = safe.id.replace(/_/g, ' ').toUpperCase();
  if (!safe.display_name) safe.display_name = safe.name;
  if (!safe.schema_version) safe.schema_version = 1;
  if (!safe.executable_names) safe.executable_names = [];
  if (!safe.paths) safe.paths = { default_mod_dir_windows: "", default_mod_dir_mac: "", manifest_file: "", auto_scan_paths_windows: [], auto_scan_paths_mac: [] };
  if (!safe.extensions) safe.extensions = { supported: [], parsers: {}, labels: {} };
  return safe;
};

const loadActiveGameSchema = () => {
  let activeSchemaId = 'default_schema';
  try {
    // Try to find the active workspace from config file directly if possible, otherwise fallback
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
      return getSafeSchema(JSON.parse(cached), activeSchemaId);
    }
  } catch(e) {}

  return getSafeSchema({}, activeSchemaId);
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


const loadActiveSet = (wsId: string) => {
  return localStorage.getItem(`sanctuary_${wsId}_active_set`);
};

interface GlobalState {
  view: string;
  setView: (view: string) => void;
  status: string;
  setStatus: (status: string) => void;
  isAlertsOpen: boolean;
  setIsAlertsOpen: (isOpen: boolean) => void;
  statusLog: { id: string, message: string, type: 'success' | 'error' | 'info' | 'warning' | 'loading', timestamp: number }[];
  pushStatus: (message: string, type?: 'success' | 'error' | 'info' | 'warning' | 'loading') => void;
  clearStatusLog: () => void;
  userRole: string;
  setUserRole: (role: string) => void;
  osRole: string;
  setOsRole: (role: string) => void;
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
  playsetsLoaded: boolean;
  setPlaysetsLoaded: (loaded: boolean) => void;
  activeSetName: string | null;
  setActiveSetName: (activeSetName: string | null) => void;
  ignoredGlobal: string[];
  setIgnoredGlobal: (ignored: string[] | ((prev: string[]) => string[])) => void;
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
  activeConflictCount: { total: number, tier4: number, tier3: number };
  setActiveConflictCount: (counts: { total: number, tier4: number, tier3: number }) => void;
  activeBrokenCounts: { broken: number, unstable: number };
  setActiveBrokenCounts: (counts: { broken: number, unstable: number }) => void;
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
  nexusAvailableUpdates: any[];
  setNexusAvailableUpdates: (updates: any[]) => void;
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
  cwMainTab: "COMMAND" | "CONFIGS" | "TEMPLATES";
  setCwMainTab: (tab: "COMMAND" | "CONFIGS" | "TEMPLATES") => void;
  wayfinderActiveTab: string;
  setWayfinderActiveTab: (tab: string) => void;
  keepersActiveTab: string;
  setKeepersActiveTab: (tab: string) => void;
  activeGameSchema: any;
  setActiveGameSchema: (schema: any) => void;
  hydrateWorkspaceState: (wsId: string) => void;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (isOpen: boolean) => void;
  isGameDatabasesSynced: boolean;
}

export const useStore = create<GlobalState>((set) => ({
  activeGameSchema: loadActiveGameSchema(),
  setActiveGameSchema: (activeGameSchema) => set({ activeGameSchema }),
  isMobileMenuOpen: false,
  setIsMobileMenuOpen: (isMobileMenuOpen) => set({ isMobileMenuOpen }),
  isGameDatabasesSynced: false,
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
      playSets: [],
      playsetsLoaded: false,
      activeSetName: loadActiveSet(wsId),
      activePlaySetIndex: 0,
      modList: [],
      quarantineList: [],
      shelterContents: [],
      backupList: [],
      activeConflictCount: { total: 0, tier4: 0, tier3: 0 },
      activeBrokenCounts: { broken: 0, unstable: 0 },
      scanProgress: { current: 0, total: 0, message: '' },
      defconLevel: 5,
      isPatchDetected: false,
      backupProgress: null,
      nexusUpdatesCount: 0,
      nexusAvailableUpdates: [],
      nexusUpdateTabs: [],
      marketSearchQuery: '',
      statusLog: [],
      status: 'STANDING BY',
      cloudIdeOpenFiles: [],
      cloudIdeActiveFileIndex: -1,
    });
  },
  view: isDesktop() ? 'dashboard' : 'dashboard',
  setView: (view) => set({ view }),
  isAlertsOpen: false,
  setIsAlertsOpen: (isOpen) => set({ isAlertsOpen: isOpen }),
  status: 'STANDING BY',
  setStatus: (status) => set((state) => {
    if ((window as any)._statusTimeout) clearTimeout((window as any)._statusTimeout);
    (window as any)._statusTimeout = setTimeout(() => {
      useStore.setState({ status: 'STANDING BY...' });
    }, 5000);

    if (!status || status.trim() === '') {
      return { status: status || 'STANDING BY...' };
    }

    let type: 'info' | 'error' | 'success' | 'warning' = 'info';
    if (status.toLowerCase().includes('error') || status.toLowerCase().includes('fail') || status.includes('❌')) type = 'error';
    if (status.toLowerCase().includes('success') || status.toLowerCase().includes('done') || status.includes('✅') || status.includes('icon_check_circle')) type = 'success';
    if (state.statusLog.length > 0 && state.statusLog[0].message === status && (Date.now() - state.statusLog[0].timestamp) < 500) return { status };
    
    const newEntry = { id: Math.random().toString(36).substr(2, 9), message: status, type, timestamp: Date.now() };

    return { status, statusLog: [newEntry, ...state.statusLog].slice(0, 50) };
  }),
  wayfinderActiveTab: "command_center",
  setWayfinderActiveTab: (tab) => set({ wayfinderActiveTab: tab }),
  cwMainTab: "COMMAND",
  setCwMainTab: (tab) => set({ cwMainTab: tab }),
  statusLog: [],
  pushStatus: (message, type = 'info') => set((state) => {
    if ((window as any)._statusTimeout) clearTimeout((window as any)._statusTimeout);
    (window as any)._statusTimeout = setTimeout(() => {
      useStore.setState({ status: 'STANDING BY...' });
    }, 5000);

    if (!message || message.trim() === '') {
      return { status: message || 'STANDING BY...' };
    }

    let finalType = type;
    if (finalType === 'info') {
      const lower = message.toLowerCase();
      if (lower.includes('error') || lower.includes('fail') || lower.includes('blocked') || lower.includes('revoked') || lower.includes('missing')) finalType = 'error';
      else if (lower.includes('success') || lower.includes('cleared') || lower.includes('done')) finalType = 'success';
    }
    if (state.statusLog.length > 0 && state.statusLog[0].message === message && (Date.now() - state.statusLog[0].timestamp) < 500) return { status: message };

    const newEntry = { id: Math.random().toString(36).substr(2, 9), message, type: finalType, timestamp: Date.now() };

    return { status: message, statusLog: [newEntry, ...state.statusLog].slice(0, 50) };
  }),
  clearStatusLog: () => set({ statusLog: [] }),
  userRole: 'citizen',
  setUserRole: (userRole) => set({ userRole }),
  osRole: 'citizen',
  setOsRole: (osRole) => set({ osRole }),
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
  playsetsLoaded: false,
  setPlaysetsLoaded: (loaded) => set({ playsetsLoaded: loaded }),
  activeSetName: null,
  setActiveSetName: (activeSetName) => set({ activeSetName }),
  ignoredGlobal: (() => {
    try {
      const stored = localStorage.getItem('sanctuary_ignored_conflicts');
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch(e) { return []; }
  })(),
  setIgnoredGlobal: (ignored) => set((state) => ({ ignoredGlobal: typeof ignored === 'function' ? ignored(state.ignoredGlobal) : ignored })),
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
    if (!isDesktop()) return;
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
  activeConflictCount: { total: 0, tier4: 0, tier3: 0 },
  setActiveConflictCount: (activeConflictCount) => set({ activeConflictCount }),
  activeBrokenCounts: { broken: 0, unstable: 0 },
  setActiveBrokenCounts: (activeBrokenCounts) => set({ activeBrokenCounts }),
  scanProgress: { current: 0, total: 0, message: '' },
  setScanProgress: (scanProgress) => set({ scanProgress }),
  defconLevel: 5,
  setDefconLevel: (defconLevel) => set({ defconLevel }),
  isPatchDetected: false,
  setIsPatchDetected: (isPatchDetected) => set({ isPatchDetected }),
  backupProgress: null,
  setBackupProgress: (backupProgress) => set((state: any) => {
    if (backupProgress === null || backupProgress === undefined) {
        return { backupProgress: { current: 0, total: 100, action: "ERROR: NULL RECEIVED" } };
    }
    
    let payload = backupProgress;
    if (payload.payload) {
        payload = payload.payload;
    }
    
    if (state.backupProgress && payload && state.backupProgress.action === payload.action) {
      if (payload.current < state.backupProgress.current) return state;
    }
    return { backupProgress: payload };
  }),
  hideIneligible: false,
  setHideIneligible: (hideIneligible) => set({ hideIneligible }),
  marketTab: 'HOME',
  setMarketTab: (marketTab) => set({ marketTab }),
  nexusUpdatesCount: 0,
  setNexusUpdatesCount: (nexusUpdatesCount) => set({ nexusUpdatesCount }),
  nexusAvailableUpdates: [],
  setNexusAvailableUpdates: (nexusAvailableUpdates) => set({ nexusAvailableUpdates }),
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

export const syncMasterSchemas = async (initialSchemaId: string = 'default_schema') => {
  try {
    let schemaId = initialSchemaId;
    
    // Resolve subdomain to schema if on web
    const subdomain = getSubdomain();
    if (subdomain && !isDesktop()) {
      schemaId = subdomain; // Trust the URL path for schema routing
    }

    if (!navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true") {
      const cached = localStorage.getItem(`sanctuary_master_schema_${schemaId}`);
      if (cached) {
        useStore.getState().setActiveGameSchema(getSafeSchema(JSON.parse(cached), schemaId));
      }
      return;
    }
    const { data, error } = await supabase.from('sanctuary_schemas').select('schema_data').eq('id', schemaId).maybeSingle();
    if (!error && data && data.schema_data) {
       const safeSchema = getSafeSchema(data.schema_data, schemaId);
       localStorage.setItem(`sanctuary_master_schema_${schemaId}`, JSON.stringify(safeSchema));
       useStore.getState().setActiveGameSchema(safeSchema);
    } else {
       const cached = localStorage.getItem(`sanctuary_master_schema_${schemaId}`);
       if (cached) {
         useStore.getState().setActiveGameSchema(getSafeSchema(JSON.parse(cached), schemaId));
       } else {
         // Fallback basic schema if not found anywhere
         const fallbackSchema = {
           id: schemaId,
           game_id: schemaId,
           name: schemaId.replace(/_/g, ' ').toUpperCase(),
           display_name: schemaId.replace(/_/g, ' ').toUpperCase(),
           executable_names: [],
           schema_version: 1,
           paths: {
             default_mod_dir_windows: "",
             default_mod_dir_mac: "",
             manifest_file: "",
             auto_scan_paths_windows: [],
             auto_scan_paths_mac: []
           },
           extensions: {
             supported: [],
             parsers: {},
             labels: {}
           },
           config_schema: { groups: [] },
           file_patterns: { live: [], mods: [], vault: [], dlc: [] },
           folder_structures: { live: [], mods: [], vault: [] },
           heuristics: { critical_files: [], ignore_patterns: [] },
           features: { has_dlc: false, has_saves: false, has_tray: false, has_cc: false }
         };
         useStore.getState().setActiveGameSchema(fallbackSchema);
       }
    }
  } catch (err) {
    console.error("Failed to sync master schemas", err);
  }
};

export const syncGameDatabases = async () => {
  try {
    if (!navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true") {
       useStore.setState({ isGameDatabasesSynced: true });
       return; // Rely on existing local workspaces/fallback config
    }
    const { supabaseAuth } = await import('../supabase');
    const { data: games, error } = await supabaseAuth.from('sanctuary_games').select('*');
    
    if (error) {
      alert(`HUB DB ERROR: ${error.message}. If this says JWT invalid, you need to sign out and sign back in!`);
    }

    if (games && games.length > 0) {
      let localWorkspaces: any[] = [];
      try {
        if (isDesktop()) {
           const { invoke } = await import('@tauri-apps/api/core');
           const gConf: any = await invoke("get_global_config");
           if (gConf && gConf.workspaces) localWorkspaces = gConf.workspaces;
        }
      } catch(e) {}
      
      const liveWorkspaces = games.map((g: any) => {
        // Find existing local workspace that matches this schema to preserve its UUID and paths
        const existing = localWorkspaces.find(w => w.schema_id === g.schema_id || w.id === g.schema_id);
        const derivedId = existing ? existing.id : g.schema_id;
        const finalId = derivedId === 'default_workspace' ? g.schema_id : derivedId;
        return {
          id: finalId,
          game_id: g.id,
          name: existing && existing.name !== 'Default Game' ? existing.name : g.name,
          schema_id: g.schema_id,
          supabase_url: g.supabase_url,
          supabase_anon_key: g.supabase_anon_key,
          live_path: existing?.live_path,
          mods_path: existing?.mods_path,
          vault_path: existing?.vault_path
        };
      });
      useStore.setState({ workspaces: liveWorkspaces, isGameDatabasesSynced: true });
    } else {
        useStore.setState({ isGameDatabasesSynced: true });
    }
  } catch (err) {
    console.error("Failed to sync core game databases", err);
    useStore.setState({ isGameDatabasesSynced: true });
  }
};