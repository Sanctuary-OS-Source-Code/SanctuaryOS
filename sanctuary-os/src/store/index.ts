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
  if (!safe.executable_names || safe.executable_names.length === 0) {
    safe.executable_names = ["TS4_x64.exe", "TS4.exe", "TS4_DX9_x64.exe"];
  }
  if (!safe.paths) {
    safe.paths = { default_mod_dir_windows: "", default_mod_dir_mac: "", manifest_file: "Resource.cfg", auto_scan_paths_windows: [], auto_scan_paths_mac: [] };
  } else if (!safe.paths.manifest_file) {
    safe.paths = { ...safe.paths, manifest_file: "Resource.cfg" };
  }
  if (!safe.extensions) {
    safe.extensions = { supported: [".package", ".ts4script", ".world"], parsers: {}, labels: { package: "PACKAGE", ts4script: "SCRIPT", world: "WORLD" } };
  } else if (!safe.extensions.supported || safe.extensions.supported.length === 0) {
    safe.extensions = {
      ...safe.extensions,
      supported: [".package", ".ts4script", ".world"],
      labels: { package: "PACKAGE", ts4script: "SCRIPT", world: "WORLD", ...(safe.extensions.labels || {}) }
    };
  }
  if (!safe.install_routes) {
    safe.install_routes = [
      {
        id: "world_areas",
        label: "World Area Files (.world)",
        extensions: [".world"],
        folder_match: "Worlds",
        target_root: "live_path",
        target_subdir: "Data/Shared/Worlds/Areas",
        preserve_vanilla: true
      }
    ];
  }
  if (!safe.external_tools) {
    safe.external_tools = [];
  }
  if (!safe.lab_verification) {
    safe.lab_verification = {
      require_for_mason_publish: true,
      require_for_scout_approval: true,
      required_active_seconds: 120,
      max_idle_seconds: 20,
      require_focus: true,
      require_save_checkpoint: true,
      seed_sandbox_from_latest_save: true,
      save_extensions: [".save"],
      world_load_signature: {
        stabilize_boot_seconds: 8,
        min_disk_read_mb: 75,
        min_ram_step_percent: 25,
        warm_cache_ram_step_percent: 45,
        scratch_activity_subdirs: ["saves/scratch"]
      }
    };
  }
  if (!safe.exception_rules || !Array.isArray(safe.exception_rules) || safe.exception_rules.length === 0) {
    let cachedRules: any[] | null = null;
    try {
      const rawRules = localStorage.getItem(`sanctuary_exception_rules_${safe.id}`);
      if (rawRules) {
        const parsed = JSON.parse(rawRules);
        if (Array.isArray(parsed) && parsed.length > 0) cachedRules = parsed;
      }
    } catch (e) {}
    safe.exception_rules = cachedRules || [
      {
        id: "ts4_store_utils_wallet_ui",
        title: "StoreUtils / VirtualCurrencyWallet UI Desync (Error #1006)",
        pattern: "StoreUtils/StoreDisabledByFeatureParameter | VirtualCurrencyWallet | TryGetValueAsBoolean",
        file_hint: "lastUIException.txt",
        severity: "warning",
        diagnosis: "ActionScript UI exception in widgets.shared.utils::StoreUtils / VirtualCurrencyWallet. Frequently triggered on the Main Menu when EA Store feature parameters fail to initialize, or when an outdated UI override (.package) conflicts with current game patch UI widgets.",
        resolution: "If this occurred on the Main Menu and live gameplay UI works normally, it is often a benign EA Store telemetry quirk (you can toggle 'Ignore During Timed Lab Verification' on this rule if desired). If UI panels are broken in live mode, ensure UI Cheats Extension (.package + .ts4script) and Main Menu overrides match your current game patch.",
        ignore_in_lab: false,
        enabled: true
      },
      {
        id: "ts4_python_attr_or_import",
        title: "Python Script Tuning Mismatch or Missing Core Library",
        pattern: "AttributeError | ModuleNotFoundError | ImportError",
        file_hint: "lastException.txt",
        severity: "critical",
        diagnosis: "A Python script (.ts4script) attempted to call a game engine attribute or import a module that changed in a recent game patch or requires an external core library (such as Lot51 Core Library, XML Injector, or S4CL).",
        resolution: "Verify that all required dependency libraries are installed in your Mods folder and that the mod's .ts4script is updated for your active game patch.",
        ignore_in_lab: false,
        enabled: true
      },
      {
        id: "ts4_posture_routing_graph",
        title: "Posture Graph / Sim Routing Autonomy Exception",
        pattern: "posture_graph | routing_service | PostureGraphService",
        file_hint: "lastException.txt",
        severity: "warning",
        diagnosis: "A Sim attempted to route to or interact with an object whose footprint, slot, or posture tuning failed validation during live autonomy.",
        resolution: "Check custom furniture/object overrides on the active lot or custom interaction mods that modify Sim posture tuning.",
        ignore_in_lab: false,
        enabled: true
      }
    ];
  }
  if (!safe.time_capsule) {
    safe.time_capsule = {
      world_state_targets: [
        { name: "Saves", path: "saves" },
        { name: "Tray", path: "Tray" }
      ],
      engine_state_targets: [
        { name: "Game", path: "Game" },
        { name: "Data", path: "Data" },
        { name: "Delta", path: "Delta" }
      ],
      save_airgap_targets: ["saves"]
    };
  } else if (!safe.time_capsule.save_airgap_targets) {
    safe.time_capsule.save_airgap_targets = ["saves"];
  }
  if (!safe.load_order) {
    safe.load_order = {
      strategy: "folder_priority",
      direction: "higher_wins",
      manifest_file: safe.paths?.manifest_file || "Resource.cfg",
      prefix_format: "{index:03}_",
      line_template: "{file}",
      priority_tiers: [
        { id: "default", label: "Standard (Base)", priority: 500, folder: "" },
        { id: "tier_1", label: "Tier 1 (Sanctuary)", priority: 1000, folder: "Sanctuary" },
        { id: "tier_2", label: "Tier 2 (Sanctuary2)", priority: 1500, folder: "Sanctuary2" },
        { id: "tier_3", label: "Tier 3 (Sanctuary3)", priority: 2000, folder: "Sanctuary3" }
      ]
    };
  }
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
    const cached = localStorage.getItem(`sanctuary_${wsId}_network_updates`) || localStorage.getItem('sanctuary_network_updates');
    if (cached) return JSON.parse(cached);
  } catch (e) {}
  return { broken: [], obsolete: [], updated: [] };
};

const loadPlaySets = (wsId: string) => {
  try {
    const cached = localStorage.getItem(`sanctuary_${wsId}_playsets`);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
};

const loadActiveConflictCount = (wsId: string) => {
  try {
    const cached = localStorage.getItem(`sanctuary_${wsId}_conflict_count`);
    if (cached) return JSON.parse(cached);
  } catch (e) {}
  return { total: 0, tier4: 0, tier3: 0 };
};

const loadActiveBrokenCounts = (wsId: string) => {
  try {
    const cached = localStorage.getItem(`sanctuary_${wsId}_broken_counts`);
    if (cached) return JSON.parse(cached);
  } catch (e) {}
  return { broken: 0, unstable: 0 };
};

const loadQuarantineList = (wsId: string) => {
  try {
    const cached = localStorage.getItem(`sanctuary_${wsId}_quarantine_list`);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
};

const loadOwnedDLC = (wsId: string) => {
  try {
    const cached = localStorage.getItem(`sanctuary_${wsId}_owned_dlc`);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
};

const loadMaskedDLC = (wsId: string) => {
  try {
    const cached = localStorage.getItem(`sanctuary_${wsId}_masked_dlc`);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
};

const loadSelectedVersion = (wsId: string) => {
  try {
    return localStorage.getItem(`sanctuary_${wsId}_selected_version`) || '';
  } catch (e) {}
  return '';
};

const trimNetworkUpdateItem = (m: any) => ({
  hash: m?.hash,
  name: m?.name,
  dbId: m?.dbId,
  displayName: m?.displayName,
  author: m?.author,
  version: m?.version,
  newVersion: m?.newVersion,
  newGameVersion: m?.newGameVersion,
  download_url: m?.download_url,
  url: m?.url,
  status: m?.status,
  is_edge_update: m?.is_edge_update,
  edge_changelog: m?.edge_changelog,
  image_url: m?.image_url,
});

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

const purgeBloatedLocalStorage = () => {
  try {
    const builtinLexicons = new Set(['en-default', 'en-sanctuary', 'en-sims', 'Simlish']);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k === 'network_updates_debug') {
        localStorage.removeItem(k);
        continue;
      }
      if (k.endsWith('_lexicon_registry')) {
        try {
          const raw = localStorage.getItem(k);
          if (raw) {
            const parsed = JSON.parse(raw);
            for (const bId of builtinLexicons) delete parsed[bId];
            localStorage.removeItem(k);
            if (Object.keys(parsed).length > 0) {
              localStorage.setItem(k, JSON.stringify(parsed));
            }
          }
        } catch {
          localStorage.removeItem(k);
        }
      }
    }
  } catch {}
};

purgeBloatedLocalStorage();

const safeLocalStorageSetItem = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    purgeBloatedLocalStorage();
    try {
      localStorage.removeItem(key);
      localStorage.setItem(key, value);
    } catch (retryErr) {
      console.warn(`Could not persist ${key} to localStorage (quota exceeded):`, retryErr);
    }
  }
};

const CACHED_GAME_DBS_KEY = 'sanctuary_cached_game_dbs_v1';

const loadCachedGameDatabases = (): any[] => {
  try {
    const raw = localStorage.getItem(CACHED_GAME_DBS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const mergeGamesWithLocalWorkspaces = (games: any[], localWorkspaces: any[] = []): any[] => {
  return games.map((g: any) => {
    const existing = localWorkspaces.find((w: any) => w.schema_id === g.schema_id || w.id === g.schema_id);
    const derivedId = existing ? existing.id : (g.schema_id || g.id);
    const finalId = derivedId === 'default_workspace' ? g.schema_id : derivedId;
    return {
      id: finalId,
      game_id: g.game_id || g.id,
      name: existing && existing.name !== 'Default Game' ? existing.name : g.name,
      schema_id: g.schema_id,
      supabase_url: g.supabase_url,
      supabase_anon_key: g.supabase_anon_key,
      live_path: existing?.live_path ?? g.live_path,
      mods_path: existing?.mods_path ?? g.mods_path,
      vault_path: existing?.vault_path ?? g.vault_path
    };
  });
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
  exceptionRules?: any[];
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
  architectActiveTab: string;
  setArchitectActiveTab: (tab: string) => void;
  oversightActiveTab: string;
  setOversightActiveTab: (tab: string) => void;
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

const initialBootWorkspaceId = (() => {
  try {
    return localStorage.getItem("sanctuary_last_active_workspace") || localStorage.getItem("sanctuary_active_workspace") || "sims4";
  } catch {
    return "sims4";
  }
})();

export const useStore = create<GlobalState>((set) => ({
  activeGameSchema: loadActiveGameSchema(),
  setActiveGameSchema: (activeGameSchema) => set({ activeGameSchema }),
  isMobileMenuOpen: false,
  setIsMobileMenuOpen: (isMobileMenuOpen) => set({ isMobileMenuOpen }),
  isGameDatabasesSynced: false,
  hydrateWorkspaceState: (wsId) => {
    const cachedSets = loadPlaySets(wsId);
    const savedActiveSetName = loadActiveSet(wsId);
    let resolvedSetIdx = 0;
    let resolvedSetName = savedActiveSetName;
    if (savedActiveSetName && cachedSets.length > 0) {
      const idx = cachedSets.findIndex((s: any) => s.name === savedActiveSetName);
      if (idx !== -1) resolvedSetIdx = idx;
    } else if (cachedSets.length > 0) {
      resolvedSetName = cachedSets[0].name;
      resolvedSetIdx = 0;
    }
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
      playSets: cachedSets,
      playsetsLoaded: cachedSets.length > 0,
      activeSetName: resolvedSetName,
      activePlaySetIndex: resolvedSetIdx,
      modList: [],
      quarantineList: loadQuarantineList(wsId),
      shelterContents: [],
      backupList: [],
      ownedDLC: loadOwnedDLC(wsId),
      maskedDLC: loadMaskedDLC(wsId),
      selectedVersion: loadSelectedVersion(wsId),
      activeConflictCount: loadActiveConflictCount(wsId),
      activeBrokenCounts: loadActiveBrokenCounts(wsId),
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

    if (!status || status.trim() === '') {
      return { status: status || 'STANDING BY...' };
    }

    let type: 'info' | 'error' | 'success' | 'warning' = 'info';
    if (status.toLowerCase().includes('error') || status.toLowerCase().includes('fail') || status.includes('❌')) type = 'error';
    if (status.toLowerCase().includes('success') || status.toLowerCase().includes('done') || status.includes('✅') || status.includes('icon_check_circle')) type = 'success';

    const durationMs = type === 'error' ? 4500 : 2500;
    (window as any)._statusTimeout = setTimeout(() => {
      useStore.setState({ status: 'STANDING BY...' });
    }, durationMs);

    if (state.statusLog.length > 0 && state.statusLog[0].message === status && (Date.now() - state.statusLog[0].timestamp) < 500) return { status };
    
    const newEntry = { id: Math.random().toString(36).substr(2, 9), message: status, type, timestamp: Date.now() };

    return { status, statusLog: [newEntry, ...state.statusLog].slice(0, 50) };
  }),
  architectActiveTab: "command_center",
  setArchitectActiveTab: (tab) => set({ architectActiveTab: tab }),
  oversightActiveTab: "command_center",
  setOversightActiveTab: (tab) => set({ oversightActiveTab: tab }),
  wayfinderActiveTab: "command_center",
  setWayfinderActiveTab: (tab) => set({ wayfinderActiveTab: tab }),
  keepersActiveTab: "command_center",
  setKeepersActiveTab: (tab) => set({ keepersActiveTab: tab }),
  cwMainTab: "COMMAND",
  setCwMainTab: (tab) => set({ cwMainTab: tab }),
  statusLog: [],
  pushStatus: (message, type = 'info') => set((state) => {
    if ((window as any)._statusTimeout) clearTimeout((window as any)._statusTimeout);

    if (!message || message.trim() === '') {
      return { status: message || 'STANDING BY...' };
    }

    let finalType = type;
    if (finalType === 'info') {
      const lower = message.toLowerCase();
      if (lower.includes('error') || lower.includes('fail') || lower.includes('blocked') || lower.includes('revoked') || lower.includes('missing')) finalType = 'error';
      else if (lower.includes('success') || lower.includes('cleared') || lower.includes('done')) finalType = 'success';
    }

    const durationMs = finalType === 'error' ? 4500 : 2500;
    (window as any)._statusTimeout = setTimeout(() => {
      useStore.setState({ status: 'STANDING BY...' });
    }, durationMs);

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
  workspaces: loadCachedGameDatabases(),
  setWorkspaces: (ws) => set({ workspaces: ws }),
  activeWorkspaceId: null,
  setActiveWorkspaceId: (activeWorkspaceId) => set({ activeWorkspaceId }),
  modList: [],
  setModList: (modList) => set((state) => ({ modList: typeof modList === 'function' ? modList(state.modList) : modList })),
  playSets: loadPlaySets(initialBootWorkspaceId),
  setPlaySets: (playSets) => set((state) => {
    const nextSets = typeof playSets === 'function' ? playSets(state.playSets) : playSets;
    const wsId = state.activeWorkspaceId || initialBootWorkspaceId;
    if (wsId && Array.isArray(nextSets)) {
      safeLocalStorageSetItem(`sanctuary_${wsId}_playsets`, JSON.stringify(nextSets));
    }
    return { playSets: nextSets };
  }),
  playsetsLoaded: loadPlaySets(initialBootWorkspaceId).length > 0,
  setPlaysetsLoaded: (loaded) => set({ playsetsLoaded: loaded }),
  activeSetName: loadActiveSet(initialBootWorkspaceId),
  setActiveSetName: (activeSetName) => set((state) => {
    const wsId = state.activeWorkspaceId || initialBootWorkspaceId;
    if (wsId && activeSetName) {
      safeLocalStorageSetItem(`sanctuary_${wsId}_active_set`, activeSetName);
    }
    return { activeSetName };
  }),
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
  quarantineList: loadQuarantineList(initialBootWorkspaceId),
  setQuarantineList: (quarantineList) => set((state) => {
    const wsId = state.activeWorkspaceId || initialBootWorkspaceId;
    if (wsId && Array.isArray(quarantineList)) {
      safeLocalStorageSetItem(`sanctuary_${wsId}_quarantine_list`, JSON.stringify(quarantineList));
    }
    return { quarantineList };
  }),
  shelterContents: [],
  setShelterContents: (shelterContents) => set({ shelterContents }),
  shelterActive: false,
  setShelterActive: (shelterActive) => set({ shelterActive }),
  backupList: [],
  setBackupList: (backupList) => set({ backupList }),
  anarchyRules: { highlander: true, family: true, dependencies: true, intercept: true },
  setAnarchyRules: (anarchyRules) => set({ anarchyRules }),
  ownedDLC: loadOwnedDLC(initialBootWorkspaceId),
  setOwnedDLC: (ownedDLC) => set((state) => {
    const wsId = state.activeWorkspaceId || initialBootWorkspaceId;
    if (wsId && Array.isArray(ownedDLC)) {
      safeLocalStorageSetItem(`sanctuary_${wsId}_owned_dlc`, JSON.stringify(ownedDLC));
    }
    return { ownedDLC };
  }),
  maskedDLC: loadMaskedDLC(initialBootWorkspaceId),
  setMaskedDLC: (maskedDLC) => set((state) => {
    const wsId = state.activeWorkspaceId || initialBootWorkspaceId;
    if (wsId && Array.isArray(maskedDLC)) {
      safeLocalStorageSetItem(`sanctuary_${wsId}_masked_dlc`, JSON.stringify(maskedDLC));
    }
    return { maskedDLC };
  }),
  selectedVersion: loadSelectedVersion(initialBootWorkspaceId),
  setSelectedVersion: (selectedVersion) => set((state) => {
    const wsId = state.activeWorkspaceId || initialBootWorkspaceId;
    if (wsId && selectedVersion) {
      safeLocalStorageSetItem(`sanctuary_${wsId}_selected_version`, selectedVersion);
    }
    return { selectedVersion };
  }),
  detectGameVersion: async () => {
    if (!isDesktop()) return;
    try {
      const config: any = await invoke("get_saved_coordinates");
      if (!config.live_path) return;

      const rawRipped = await invoke<string>("rip_game_version", {
        livePath: config.live_path,
      });
      const cleanVersion = rawRipped.replace(/[^0-9.]/g, "");
      set((state) => {
        const wsId = state.activeWorkspaceId || initialBootWorkspaceId;
        if (wsId && cleanVersion) {
          safeLocalStorageSetItem(`sanctuary_${wsId}_selected_version`, cleanVersion);
        }
        return { selectedVersion: cleanVersion, status: `STANDING BY |  v${cleanVersion}` };
      });
    } catch (err) {
      console.warn("Version detection failed:", err);
    }
  },
  networkUpdates: loadNetworkUpdates(initialBootWorkspaceId),
  setNetworkUpdates: (networkUpdates) => set((state) => {
    const wsId = state.activeWorkspaceId || initialBootWorkspaceId;
    try {
      if (networkUpdates) {
        const trimmed = {
          broken: Array.isArray(networkUpdates.broken) ? networkUpdates.broken.map(trimNetworkUpdateItem) : [],
          obsolete: Array.isArray(networkUpdates.obsolete) ? networkUpdates.obsolete.map(trimNetworkUpdateItem) : [],
          updated: Array.isArray(networkUpdates.updated) ? networkUpdates.updated.map(trimNetworkUpdateItem) : [],
        };
        const serialized = JSON.stringify(trimmed);
        safeLocalStorageSetItem('sanctuary_network_updates', serialized);
        if (wsId) safeLocalStorageSetItem(`sanctuary_${wsId}_network_updates`, serialized);
      } else {
        localStorage.removeItem('sanctuary_network_updates');
        if (wsId) localStorage.removeItem(`sanctuary_${wsId}_network_updates`);
      }
    } catch (e) {}
    return { networkUpdates };
  }),
  activeConflictCount: loadActiveConflictCount(initialBootWorkspaceId),
  setActiveConflictCount: (activeConflictCount) => set((state) => {
    if (
      state.activeConflictCount &&
      activeConflictCount &&
      state.activeConflictCount.total === activeConflictCount.total &&
      state.activeConflictCount.tier3 === activeConflictCount.tier3 &&
      state.activeConflictCount.tier4 === activeConflictCount.tier4
    ) {
      return state;
    }
    const wsId = state.activeWorkspaceId || initialBootWorkspaceId;
    if (wsId && activeConflictCount) {
      safeLocalStorageSetItem(`sanctuary_${wsId}_conflict_count`, JSON.stringify(activeConflictCount));
    }
    return { activeConflictCount };
  }),
  activeBrokenCounts: loadActiveBrokenCounts(initialBootWorkspaceId),
  setActiveBrokenCounts: (activeBrokenCounts) => set((state) => {
    if (
      state.activeBrokenCounts &&
      activeBrokenCounts &&
      state.activeBrokenCounts.broken === activeBrokenCounts.broken &&
      state.activeBrokenCounts.unstable === activeBrokenCounts.unstable
    ) {
      return state;
    }
    const wsId = state.activeWorkspaceId || initialBootWorkspaceId;
    if (wsId && activeBrokenCounts) {
      safeLocalStorageSetItem(`sanctuary_${wsId}_broken_counts`, JSON.stringify(activeBrokenCounts));
    }
    return { activeBrokenCounts };
  }),
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
  setShowImages: (showImages) => { safeLocalStorageSetItem("sanctuary_show_images", showImages.toString()); set({ showImages }); },
  marketSearchQuery: '',
  setMarketSearchQuery: (marketSearchQuery) => set({ marketSearchQuery }),
  ideOpenFiles: [],
  setIdeOpenFiles: (files) => set((state) => {
      const newFiles = typeof files === 'function' ? files(state.ideOpenFiles) : files;
      const wsId = state.activeWorkspaceId || 'default';
      safeLocalStorageSetItem(`sanctuary_${wsId}_ide_open_files`, JSON.stringify(newFiles));
      return { ideOpenFiles: newFiles };
  }),
  ideActiveFileIndex: -1,
  setIdeActiveFileIndex: (ideActiveFileIndex) => set((state) => {
    const wsId = state.activeWorkspaceId || 'default';
    safeLocalStorageSetItem(`sanctuary_${wsId}_ide_active_file_index`, ideActiveFileIndex.toString());
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
      safeLocalStorageSetItem(`sanctuary_${wsId}_cw_unsaved_edits`, JSON.stringify(newEdits));
      return { cwUnsavedEdits: newEdits };
  }),
  cwSelectedFile: null,
  setCwSelectedFile: (file) => set((state) => {
      const wsId = state.activeWorkspaceId || 'default';
      safeLocalStorageSetItem(`sanctuary_${wsId}_cw_selected_file`, JSON.stringify(file));
      return { cwSelectedFile: file };
  }),
  cwActiveTab: "visual",
  setCwActiveTab: (tab) => set((state) => {
      const wsId = state.activeWorkspaceId || 'default';
      safeLocalStorageSetItem(`sanctuary_${wsId}_cw_active_tab`, tab);
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
      safeLocalStorageSetItem(`sanctuary_${wsId}_wayfinder_drafts`, JSON.stringify(newDrafts));
      return { wayfinderDrafts: newDrafts };
  }),
  masonCommentDrafts: {},
  setMasonCommentDrafts: (drafts) => set((state) => {
      const newDrafts = typeof drafts === 'function' ? drafts(state.masonCommentDrafts) : drafts;
      const wsId = state.activeWorkspaceId || 'default';
      safeLocalStorageSetItem(`sanctuary_${wsId}_mason_comment_drafts`, JSON.stringify(newDrafts));
      return { masonCommentDrafts: newDrafts };
  }),
  masonHubDrafts: {},
  setMasonHubDrafts: (drafts) => set((state) => {
      const newDrafts = typeof drafts === 'function' ? drafts(state.masonHubDrafts) : drafts;
      const wsId = state.activeWorkspaceId || 'default';
      safeLocalStorageSetItem(`sanctuary_${wsId}_mason_hub_drafts`, JSON.stringify(newDrafts));
      return { masonHubDrafts: newDrafts };
  })
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
       safeLocalStorageSetItem(`sanctuary_master_schema_${schemaId}`, JSON.stringify(safeSchema));
       useStore.getState().setActiveGameSchema(safeSchema);
    } else {
       const cached = localStorage.getItem(`sanctuary_master_schema_${schemaId}`);
       if (cached) {
         useStore.getState().setActiveGameSchema(getSafeSchema(JSON.parse(cached), schemaId));
       } else {
         // Fallback basic schema if not found anywhere
         const fallbackSchema = getSafeSchema({
           id: schemaId,
           game_id: schemaId,
           name: schemaId.replace(/_/g, ' ').toUpperCase(),
           display_name: schemaId.replace(/_/g, ' ').toUpperCase(),
           schema_version: 1,
           config_schema: { groups: [] },
           file_patterns: { live: [], mods: [], vault: [], dlc: [] },
           folder_structures: { live: [], mods: [], vault: [] },
           heuristics: { critical_files: [], ignore_patterns: [] },
           features: { has_dlc: true, has_saves: true, has_tray: true, has_cc: true }
         }, schemaId);
         useStore.getState().setActiveGameSchema(fallbackSchema);
       }
    }
  } catch (err) {
    console.error("Failed to sync master schemas", err);
  }
};

export const syncGameDatabases = async (preloadedLocalWorkspaces?: any[]) => {
  const cachedGames = loadCachedGameDatabases();
  if (cachedGames.length > 0) {
    const hydratedCached = mergeGamesWithLocalWorkspaces(cachedGames, preloadedLocalWorkspaces || []);
    useStore.setState({ workspaces: hydratedCached, isGameDatabasesSynced: true });
  }

  if (!navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true") {
    useStore.setState({ isGameDatabasesSynced: true });
    return;
  }

  const performNetworkSync = async () => {
    try {
      const { supabaseAuth } = await import('../supabase');
      const { data: games, error } = await supabaseAuth
        .from('sanctuary_games')
        .select('id, name, schema_id, supabase_url, supabase_anon_key, icon, is_active')
        .neq('is_active', false);

      if (error) {
        alert(`HUB DB ERROR: ${error.message}. If this says JWT invalid, you need to sign out and sign back in!`);
      }

      if (games && games.length > 0) {
        safeLocalStorageSetItem(CACHED_GAME_DBS_KEY, JSON.stringify(games));
        let localWorkspaces: any[] = Array.isArray(preloadedLocalWorkspaces) ? preloadedLocalWorkspaces : [];
        if (localWorkspaces.length === 0 && isDesktop()) {
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            const gConf: any = await invoke("get_global_config");
            if (gConf && gConf.workspaces) localWorkspaces = gConf.workspaces;
          } catch (e) {}
        }

        const liveWorkspaces = mergeGamesWithLocalWorkspaces(games, localWorkspaces);
        useStore.setState({ workspaces: liveWorkspaces, isGameDatabasesSynced: true });
      } else {
        useStore.setState({ isGameDatabasesSynced: true });
      }
    } catch (err) {
      console.error("Failed to sync core game databases", err);
      useStore.setState({ isGameDatabasesSynced: true });
    }
  };

  if (cachedGames.length > 0) {
    // Already hydrated from local cache in 0ms; refresh in the background without blocking workspace boot
    performNetworkSync();
    return;
  }

  // First-time cold boot without cache: bound network wait to 2500ms so a slow connection never hangs boot
  await Promise.race([
    performNetworkSync(),
    new Promise<void>((resolve) => setTimeout(() => {
      useStore.setState({ isGameDatabasesSynced: true });
      resolve();
    }, 2500)),
  ]);
};
