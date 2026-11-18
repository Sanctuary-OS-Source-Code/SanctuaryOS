import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useStore, syncMasterSchemas, syncGameDatabases } from '../store';
import { useModalStore } from '../store/modalStore';
import { useLexicon, CORE_GLOSSARY_TERMS } from '../LexiconContext';
import { isDesktop } from '../utils/envUtils';
import {
  inspectWorkspaceCloudSync,
  CloudSyncPathFinding,
  getCloudSyncConsents,
  isCloudSyncFindingConsented,
  grantCloudSyncConsent,
} from '../utils/cloudSyncGuard';
import { useTheme, SPOKE_THEMES_CACHE_KEY } from '../ThemeContext';
import { supabase, hasActiveGameDatabase } from '../supabase';
import { DynamicThemePreviewBanner } from '../chameleon-components/ThemeCard';
import { getLuminance } from '../chameleon-components/ChameleonShared';
import {
  SidePanelHeroCard,
  UniversalGroup,
} from './universal/UniversalLayout';
import {
  SidePanel,
  SidePanelFilterBar,
  DashboardStatTile,
  ActionButton,
  VAULT_CHIP_CLASS,
} from '../shared';
import {
  isPlaceholderWorkspaceKey,
  healAndMatchLocalWorkspaces,
} from '../utils/workspaceConfigMatch';
import { recordWorkspaceLoaded } from '../utils/workspacePrefs';

const BUILTIN_LEXICON_IDS = new Set(['en-default', 'en-sanctuary', 'en-sims', 'Simlish']);

function masterVaultWithSep(masterVault: string, sep: string, schemaId: string): string {
  const cleanMaster = masterVault.replace(/[\\/]+$/, '');
  return `${cleanMaster}${sep}${schemaId}`;
}

export default function WorkspaceFirstTimeSetup({
  isOpen = false,
}: {
  isOpen?: boolean;
}) {
  const {
    t,
    activeLang,
    setActiveLang,
    lexiconMeta,
    registry,
    useGlobalLexicon,
    setUseGlobalLexicon,
    globalLexiconId,
    getWorkspaceLexiconId,
    setWorkspaceLexiconId,
    startLexiconPreview,
    stopLexiconPreview,
  } = useLexicon();

  const {
    activeThemeId,
    setActiveThemeId,
    CORE_THEMES,
    gameThemes,
    customThemes,
    allThemes,
    useGlobalTheme,
    setUseGlobalTheme,
    globalThemeId,
    getWorkspaceThemeId,
    setWorkspaceThemeId,
    startThemePreview,
    stopThemePreview,
  } = useTheme();

  const workspaces = useStore((state) => state.workspaces) || [];
  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);
  const pendingWorkspaceSetupId = useStore((state) => state.pendingWorkspaceSetupId);
  const setPendingWorkspaceSetupId = useStore((state) => state.setPendingWorkspaceSetupId);
  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const setActiveWorkspaceId = useStore((state) => state.setActiveWorkspaceId);
  const setIsConfigured = useStore((state) => state.setIsConfigured);
  const setLivePathStore = useStore((state) => state.setLivePath);
  const setModsPathStore = useStore((state) => state.setModsPath);
  const setDocsPathStore = useStore((state) => state.setDocsPath);
  const setVaultPathStore = useStore((state) => state.setVaultPath);
  const setWorkspacesStore = useStore((state) => state.setWorkspaces);
  const setView = useStore((state) => state.setView);
  const pushToast = useStore((state) => state.pushStatus);
  const detectGameVersion = useStore((state) => state.detectGameVersion);

  const targetWorkspaceId = useMemo(() => {
    const pending =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('sanctuary_pending_workspace_setup')
        : null;
    const lastActive =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('sanctuary_last_active_workspace')
        : null;
    for (const candidate of [
      pendingWorkspaceSetupId,
      pending,
      activeWorkspaceId,
      lastActive,
    ]) {
      if (candidate && !isPlaceholderWorkspaceKey(candidate)) {
        return candidate;
      }
    }
    const firstValid = workspaces.find(
      (w: any) => !isPlaceholderWorkspaceKey(w?.schema_id) || !isPlaceholderWorkspaceKey(w?.id)
    );
    return firstValid?.schema_id || firstValid?.id || 'default_workspace';
  }, [pendingWorkspaceSetupId, activeWorkspaceId, workspaces]);

  const matchedWorkspace = useMemo(() => {
    const key = String(targetWorkspaceId || '').trim().toLowerCase();
    return workspaces.find(
      (w: any) =>
        String(w?.id || '').trim().toLowerCase() === key ||
        String(w?.schema_id || '').trim().toLowerCase() === key
    );
  }, [workspaces, targetWorkspaceId]);

  const targetSchemaId = useMemo(() => {
    if (matchedWorkspace?.schema_id && !isPlaceholderWorkspaceKey(matchedWorkspace.schema_id)) {
      return matchedWorkspace.schema_id;
    }
    if (activeGameSchema?.id && !isPlaceholderWorkspaceKey(activeGameSchema.id)) {
      return activeGameSchema.id;
    }
    return targetWorkspaceId;
  }, [matchedWorkspace, activeGameSchema, targetWorkspaceId]);

  const targetGameName = useMemo(() => {
    if (
      matchedWorkspace?.name &&
      matchedWorkspace.name !== 'Default Game' &&
      !isPlaceholderWorkspaceKey(matchedWorkspace.name)
    ) {
      return matchedWorkspace.name;
    }
    if (
      activeGameSchema?.display_name &&
      activeGameSchema.display_name !== 'Default Master Schema'
    ) {
      return activeGameSchema.display_name;
    }
    return targetSchemaId || targetWorkspaceId;
  }, [matchedWorkspace, activeGameSchema, targetSchemaId, targetWorkspaceId]);

  const [step, setStep] = useState<'paths' | 'aesthetics'>('paths');
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isAutoDetecting, setIsAutoDetecting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [livePathInput, setLivePathInput] = useState('');
  const [modsPathInput, setModsPathInput] = useState('');
  const [docsPathInput, setDocsPathInput] = useState('');
  const [masterVaultInput, setMasterVaultInput] = useState('');
  const [hasExistingMasterVault, setHasExistingMasterVault] = useState(false);
  const [isEditingMasterVault, setIsEditingMasterVault] = useState(false);
  const [detectedSource, setDetectedSource] = useState('');
  const [modsWillCreate, setModsWillCreate] = useState(false);
  const [showAdvancedPaths, setShowAdvancedPaths] = useState(false);

  const [fetchedSpokeThemes, setFetchedSpokeThemes] = useState<Record<string, any>>({});
  const [fetchedSpokeLexicons, setFetchedSpokeLexicons] = useState<
    Array<{ id: string; name: string; badge: string; dict: Record<string, any> }>
  >([]);
  const [selectedThemeChoice, setSelectedThemeChoice] = useState<string>('__bypass__');
  const [selectedLexiconChoice, setSelectedLexiconChoice] = useState<string>('__bypass__');

  const globalConfigRef = useRef<any>(null);
  const latestThemeIdRef = useRef<string>(activeThemeId || 'architect');
  const latestLexiconIdRef = useRef<string>(activeLang || 'en-sanctuary');
  latestThemeIdRef.current = activeThemeId || 'architect';
  latestLexiconIdRef.current = activeLang || 'en-sanctuary';
  const initialThemeIdRef = useRef<string>(activeThemeId || 'architect');
  const initialLexiconIdRef = useRef<string>(activeLang || 'en-sanctuary');
  const didCommitRef = useRef<boolean>(false);

  // Restore pre-preview state cleanly on unmount unless setup was committed
  useEffect(() => {
    return () => {
      if (!didCommitRef.current) {
        stopThemePreview();
        stopLexiconPreview();
      }
    };
  }, [stopThemePreview, stopLexiconPreview]);

  const runSchemaAutoDetect = useCallback(
    async (silent = false, liveHint?: string) => {
      if (isAutoDetecting && !liveHint) return;
      setIsAutoDetecting(true);
      try {
        const currentSchema = useStore.getState().activeGameSchema;
        if (currentSchema) {
          await invoke('update_active_game_schema', { schema: currentSchema }).catch(() => {});
        }
        const detected: any = await invoke(
          'auto_detect_paths',
          liveHint ? { livePathHint: liveHint } : {}
        ).catch(() => null);
        let applied = false;
        if (detected?.live_path) {
          setLivePathInput((prev) => (liveHint ? String(detected.live_path) : prev || String(detected.live_path)));
          applied = true;
        }
        if (detected?.mods_path) {
          setModsPathInput((prev) => (liveHint ? String(detected.mods_path) : prev || String(detected.mods_path)));
          applied = true;
        } else if (liveHint && detected?.live_path) {
          setShowAdvancedPaths(true);
        }
        const detectedDocs = detected?.docs_path || detected?.user_data_path;
        if (detectedDocs) {
          setDocsPathInput((prev) => (liveHint && !prev ? String(detectedDocs) : prev || String(detectedDocs)));
        }
        if (!hasExistingMasterVault && detected?.vault_path) {
          setMasterVaultInput((prev) => prev || String(detected.vault_path));
        }
        if (detected?.detected_source) {
          setDetectedSource(String(detected.detected_source));
        }
        setModsWillCreate(Boolean(detected?.mods_will_create));
        if (!silent) {
          pushToast(
            applied
              ? t('settings_auto_detect_success', 'Paths Auto-Detected Successfully!')
              : t('settings_auto_detect_fail', 'Failed to auto-detect paths.'),
            applied ? 'success' : 'warning'
          );
        }
      } finally {
        setIsAutoDetecting(false);
      }
    },
    [isAutoDetecting, hasExistingMasterVault, pushToast, t]
  );

  // Initialize coordinates, active schema, auto-detection, and Spoke aesthetics when drawer opens
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    didCommitRef.current = false;
    initialThemeIdRef.current = latestThemeIdRef.current || 'architect';
    initialLexiconIdRef.current = latestLexiconIdRef.current || 'en-sanctuary';
    setStep('paths');
    setSelectedThemeChoice('__bypass__');
    setSelectedLexiconChoice('__bypass__');

    const bootstrapSetup = async () => {
      setIsLoadingConfig(true);
      try {
        if (targetSchemaId && !isPlaceholderWorkspaceKey(targetSchemaId)) {
          await syncMasterSchemas(targetSchemaId).catch(() => {});
        }
        const syncedSchema = useStore.getState().activeGameSchema;
        if (syncedSchema) {
          await invoke('update_active_game_schema', { schema: syncedSchema }).catch(() => {});
        }

        const [gConf, savedCoords]: [any, any] = await Promise.all([
          invoke('get_global_config').catch(() => null),
          invoke('get_saved_coordinates').catch(() => null),
        ]);
        if (cancelled) return;

        globalConfigRef.current = gConf;
        const gWorkspaces = Array.isArray(gConf?.workspaces) ? gConf.workspaces : [];
        const existingMaster = String(
          gConf?.vault_path ||
            gWorkspaces.find((w: any) => String(w?.master_vault_path || '').trim())?.master_vault_path ||
            ''
        )
          .trim()
          .replace(/[\\/]+$/, '');

        const existingWs = gWorkspaces.find(
          (w: any) =>
            (!isPlaceholderWorkspaceKey(w?.id) &&
              String(w.id).trim().toLowerCase() === targetWorkspaceId.toLowerCase()) ||
            (!isPlaceholderWorkspaceKey(w?.schema_id) &&
              String(w.schema_id).trim().toLowerCase() === targetSchemaId.toLowerCase())
        );

        const seedLive = String(existingWs?.live_path || savedCoords?.live_path || '').trim();
        const seedMods = String(existingWs?.mods_path || savedCoords?.mods_path || '').trim();
        const seedDocs = String(
          existingWs?.docs_path ||
            existingWs?.user_data_path ||
            savedCoords?.docs_path ||
            ''
        ).trim();

        setLivePathInput(seedLive);
        setModsPathInput(seedMods);
        setDocsPathInput(seedDocs);

        if (existingMaster && existingMaster.toLowerCase() !== 'web') {
          setMasterVaultInput(existingMaster);
          setHasExistingMasterVault(true);
          setIsEditingMasterVault(false);
        } else {
          setMasterVaultInput('');
          setHasExistingMasterVault(false);
          setIsEditingMasterVault(true);
        }

        // Run schema-driven auto-detection once on mount if either required folder is blank
        if (!seedLive || !seedMods) {
          const detected: any = await invoke(
            'auto_detect_paths',
            seedLive ? { livePathHint: seedLive } : {}
          ).catch(() => null);
          if (!cancelled && detected) {
            if (!seedLive && detected.live_path) setLivePathInput(String(detected.live_path));
            if (!seedMods && detected.mods_path) setModsPathInput(String(detected.mods_path));
            const detDocs = detected.docs_path || detected.user_data_path;
            if (!seedDocs && detDocs) setDocsPathInput(String(detDocs));
            if (!existingMaster && detected.vault_path) {
              setMasterVaultInput(String(detected.vault_path));
            }
            if (detected.detected_source) {
              setDetectedSource(String(detected.detected_source));
            }
            setModsWillCreate(Boolean(detected.mods_will_create));
            if ((seedLive || detected.live_path) && !seedMods && !detected.mods_path) {
              setShowAdvancedPaths(true);
            }
          }
        }
      } finally {
        if (!cancelled) setIsLoadingConfig(false);
      }
    };

    const fetchSpokeAesthetics = async () => {
      if (!navigator.onLine || localStorage.getItem('sanctuary_local_only') === 'true') return;
      if (!hasActiveGameDatabase()) return;
      try {
        const [themesRes, lexiconsRes] = await Promise.all([
          supabase.from('sanctuary_themes').select('*'),
          supabase.from('sanctuary_lexicons').select('id, name, badge, version, lexicon_data'),
        ]);
        if (cancelled) return;

        if (!themesRes.error && Array.isArray(themesRes.data)) {
          const nextThemes: Record<string, any> = {};
          for (const row of themesRes.data) {
            if (!row?.id || CORE_THEMES?.[row.id]) continue;
            nextThemes[row.id] = {
              ...(row.theme_data || {}),
              id: row.id,
              name: row.name || row.theme_data?.name || row.id,
              badge: row.theme_data?.badge || targetGameName,
            };
          }
          setFetchedSpokeThemes(nextThemes);
        }

        if (!lexiconsRes.error && Array.isArray(lexiconsRes.data)) {
          const nextLexicons: Array<{
            id: string;
            name: string;
            badge: string;
            dict: Record<string, any>;
          }> = [];
          for (const row of lexiconsRes.data) {
            if (!row?.id || row.id === 'en-default' || row.id === 'en-sanctuary') continue;
            const rawDict =
              row.lexicon_data && typeof row.lexicon_data === 'object' ? row.lexicon_data : {};
            nextLexicons.push({
              id: row.id,
              name: row.name || rawDict._meta_name || row.id,
              badge: row.badge || rawDict._meta_badge || targetGameName,
              dict: rawDict,
            });
          }
          setFetchedSpokeLexicons(nextLexicons);
        }
      } catch {
        // Offline / unconfigured spoke tables cleanly ignored
      }
    };

    bootstrapSetup();
    fetchSpokeAesthetics();

    return () => {
      cancelled = true;
      if (!didCommitRef.current) {
        stopThemePreview();
        stopLexiconPreview();
      }
    };
  }, [isOpen, targetWorkspaceId, targetSchemaId, targetGameName, stopThemePreview, stopLexiconPreview]);

  const pickDirectory = async (
    titleKey: string,
    titleFallback: string,
    defaultPath: string,
    onPicked: (selected: string) => void
  ) => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: t(titleKey, titleFallback) as string,
        defaultPath: defaultPath || undefined,
      });
      if (selected && typeof selected === 'string') {
        onPicked(selected.trim());
      }
    } catch (err) {
      console.error('Folder picker failed:', err);
    }
  };

  const resolvedExpectedExecutables = useMemo(() => {
    const names = Array.isArray(activeGameSchema?.executable_names)
      ? activeGameSchema.executable_names.filter((n: any) => typeof n === 'string' && n.trim())
      : [];
    return names.slice(0, 3).join(' • ');
  }, [activeGameSchema]);

  const effectiveMasterVault = masterVaultInput.trim().replace(/[\\/]+$/, '');
  const vaultSubdirPreview = useMemo(() => {
    if (!effectiveMasterVault) return t('path_not_set', 'Not Set');
    const sep =
      effectiveMasterVault.includes('/') && !effectiveMasterVault.includes('\\') ? '/' : '\\';
    return targetSchemaId && !isPlaceholderWorkspaceKey(targetSchemaId)
      ? `${effectiveMasterVault}${sep}${targetSchemaId}`
      : effectiveMasterVault;
  }, [effectiveMasterVault, targetSchemaId, t]);

  const hasLive = livePathInput.trim().length > 0 && livePathInput.trim().toLowerCase() !== 'web';
  const hasMods = modsPathInput.trim().length > 0 && modsPathInput.trim().toLowerCase() !== 'web';
  const hasVault = effectiveMasterVault.length > 0 && effectiveMasterVault.toLowerCase() !== 'web';
  const isPathsReady = hasLive && hasMods && hasVault;

  const [setupCloudFindings, setSetupCloudFindings] = useState<CloudSyncPathFinding[]>([]);
  const [setupCloudConsents, setSetupCloudConsents] = useState(() => getCloudSyncConsents());
  const [isCheckingCloudSync, setIsCheckingCloudSync] = useState(false);

  const buildSetupInspectInput = useCallback(
    () => ({
      master_vault_path: effectiveMasterVault || undefined,
      mods_path: modsPathInput.trim() || undefined,
      docs_path: docsPathInput.trim() || undefined,
      live_path: livePathInput.trim() || undefined,
    }),
    [effectiveMasterVault, modsPathInput, docsPathInput, livePathInput]
  );

  const runSetupCloudCheck = useCallback(async () => {
    if (!isOpen || !isDesktop()) {
      setSetupCloudFindings([]);
      return;
    }
    const input = buildSetupInspectInput();
    const hasAnyPath = Object.values(input).some(
      (v) => typeof v === 'string' && v.trim().length > 0 && v.trim().toLowerCase() !== 'web'
    );
    if (!hasAnyPath) {
      setSetupCloudFindings([]);
      return;
    }
    setIsCheckingCloudSync(true);
    try {
      const report = await inspectWorkspaceCloudSync(input, true);
      setSetupCloudFindings(report?.findings || []);
      setSetupCloudConsents(getCloudSyncConsents());
    } finally {
      setIsCheckingCloudSync(false);
    }
  }, [isOpen, buildSetupInspectInput]);

  useEffect(() => {
    if (!isOpen || !isDesktop()) return;
    const timer = setTimeout(() => {
      void runSetupCloudCheck();
    }, 250);
    return () => clearTimeout(timer);
  }, [isOpen, runSetupCloudCheck]);

  useEffect(() => {
    if (!isOpen || !isDesktop()) return;
    const handleConsentChange = () => {
      setSetupCloudConsents(getCloudSyncConsents());
    };
    const handleCoordsUpdated = async () => {
      try {
        const gCfg: any = await invoke('get_global_config').catch(() => null);
        if (gCfg?.master_vault_path && String(gCfg.master_vault_path).trim()) {
          setMasterVaultInput(String(gCfg.master_vault_path).trim());
        }
        const wsList = Array.isArray(gCfg?.workspaces) ? gCfg.workspaces : [];
        const match = wsList.find(
          (w: any) =>
            String(w?.id || '').trim().toLowerCase() === targetWorkspaceId.toLowerCase() ||
            String(w?.schema_id || '').trim().toLowerCase() === targetSchemaId.toLowerCase()
        );
        if (match?.mods_path) setModsPathInput(String(match.mods_path));
        if (match?.docs_path) setDocsPathInput(String(match.docs_path));
        if (match?.live_path) setLivePathInput(String(match.live_path));
      } catch {}
      void runSetupCloudCheck();
    };
    window.addEventListener('sanctuary-cloud-sync-consent-changed', handleConsentChange);
    window.addEventListener('sanctuary-coordinates-updated', handleCoordsUpdated);
    return () => {
      window.removeEventListener('sanctuary-cloud-sync-consent-changed', handleConsentChange);
      window.removeEventListener('sanctuary-coordinates-updated', handleCoordsUpdated);
    };
  }, [isOpen, targetWorkspaceId, targetSchemaId, runSetupCloudCheck]);

  const unconsentedSetupFindings = useMemo(
    () => setupCloudFindings.filter((f) => !isCloudSyncFindingConsented(f, setupCloudConsents)),
    [setupCloudFindings, setupCloudConsents]
  );

  const guardSetupCloudStep = useCallback(
    (onProceed: () => void, actionLabel: string) => {
      if (isDesktop() && unconsentedSetupFindings.length > 0) {
        useModalStore.getState().openCloudSyncGuard({
          pendingActionLabel: actionLabel,
          pathsOverride: buildSetupInspectInput(),
          onConsentProceed: onProceed,
          onConsentGranted: () => {
            void runSetupCloudCheck();
          },
        });
        return;
      }
      onProceed();
    },
    [unconsentedSetupFindings.length, buildSetupInspectInput, runSetupCloudCheck]
  );

  const folderCompletedCount = useMemo(() => {
    if (hasExistingMasterVault && !isEditingMasterVault) {
      return (hasLive ? 1 : 0) + (hasMods ? 1 : 0);
    }
    return (hasLive ? 1 : 0) + (hasMods ? 1 : 0) + (hasVault ? 1 : 0);
  }, [hasExistingMasterVault, isEditingMasterVault, hasLive, hasMods, hasVault]);

  const folderTotalCount = hasExistingMasterVault && !isEditingMasterVault ? 2 : 3;

  const themeOptions = useMemo(() => {
    const combined: Array<{ id: string; name: string; data: any; isSpoke: boolean; isDark: boolean; swatches: string[]; badge: string }> = [];
    const seen = new Set<string>();

    const addEntry = (id: string, th: any, isSpoke: boolean) => {
      if (!id || !th || seen.has(id)) return;
      if (String(th?.name || '').toLowerCase().includes('performance')) return;
      seen.add(id);
      const safeBg = th?.bg && th.bg !== 'transparent' ? th.bg : '#060b14';
      combined.push({
        id,
        name: th?.name || id,
        data: th,
        isSpoke,
        isDark: getLuminance(safeBg) < 0.5,
        badge: isSpoke
          ? th?.badge || targetGameName
          : t('ws_setup_core_badge', 'Core OS'),
        swatches: [
          safeBg,
          th?.sidebar || '#050914',
          th?.accent || '#38bdf8',
          th?.success || '#10b981',
        ],
      });
    };

    // Prioritize Spoke-specific Chameleon themes first, then Core/Custom themes
    Object.entries(fetchedSpokeThemes || {}).forEach(([id, th]) => addEntry(id, th, true));
    Object.entries(gameThemes || {}).forEach(([id, th]) => addEntry(id, th, true));
    Object.entries(customThemes || {}).forEach(([id, th]) => addEntry(id, th, false));
    Object.entries(CORE_THEMES || {}).forEach(([id, th]) => addEntry(id, th, false));

    return combined;
  }, [fetchedSpokeThemes, gameThemes, customThemes, CORE_THEMES, targetGameName, t]);

  const cleanLexLabel = (val: string) => (val.includes(':') ? val.split(':')[1].trim() : val);

  const lexiconOptions = useMemo(() => {
    const sampleKeys = [
      'term_mods',
      'term_vault',
      'term_blueprints',
      'term_masons',
      'term_lab',
    ];
    const buildGlossarySample = (code: string, dictOverride?: Record<string, any>) =>
      sampleKeys
        .map((termKey) => {
          const def = CORE_GLOSSARY_TERMS.find((item) => item.key === termKey);
          if (!def) return '';
          if (dictOverride && typeof dictOverride[termKey] === 'string' && dictOverride[termKey].trim()) {
            return dictOverride[termKey].trim();
          }
          if (code === 'en-default') return def.defaults['en-default'];
          if (code === 'en-sanctuary') return def.defaults['en-sanctuary'];
          const customVal = registry?.[code]?.[termKey];
          return typeof customVal === 'string' && customVal.trim()
            ? customVal.trim()
            : def.defaults['en-default'];
        })
        .filter(Boolean)
        .join(' • ');

    const items: Array<{
      id: string;
      name: string;
      badge: string;
      sample: string;
      dict: Record<string, any>;
      isSpoke: boolean;
    }> = [];
    const seen = new Set<string>();

    // Prioritize Spoke Lexicons discovered from DB/cache first
    for (const sl of fetchedSpokeLexicons) {
      if (!sl?.id || seen.has(sl.id)) continue;
      seen.add(sl.id);
      items.push({
        id: sl.id,
        name: cleanLexLabel(String(sl.name || sl.id)),
        badge: sl.badge || targetGameName,
        sample: buildGlossarySample(sl.id, sl.dict),
        dict: sl.dict,
        isSpoke: true,
      });
    }

    if (Array.isArray(lexiconMeta)) {
      for (const m of lexiconMeta) {
        if (!m?.id || m.id === 'en-default' || m.id === 'en-sanctuary' || seen.has(m.id)) {
          continue;
        }
        seen.add(m.id);
        const rawDict = registry?.[m.id] || {};
        items.push({
          id: m.id,
          name: cleanLexLabel(String(m.name || m.id)),
          badge: m.badge || t('badge_community', 'Community'),
          sample: buildGlossarySample(m.id, rawDict),
          dict: rawDict,
          isSpoke: true,
        });
      }
    }

    if (registry && typeof registry === 'object') {
      for (const [id, dict] of Object.entries(registry)) {
        if (!id || seen.has(id) || id === 'en-default' || id === 'en-sanctuary') continue;
        seen.add(id);
        items.push({
          id,
          name: cleanLexLabel(String((dict as any)?._meta_name || id)),
          badge: String((dict as any)?._meta_badge || t('badge_custom', 'Custom')),
          sample: buildGlossarySample(id, dict as any),
          dict: dict as Record<string, any>,
          isSpoke: true,
        });
      }
    }

    // Standard Core Lexicons always available as fallback/override choices
    items.push({
      id: 'en-sanctuary',
      name: cleanLexLabel(t('lang_sanctuary', 'Sanctuary')),
      badge: t('auth_lex_sanctuary_badge', 'Sci-Fi Lore'),
      sample: buildGlossarySample('en-sanctuary'),
      dict: {},
      isSpoke: false,
    });
    items.push({
      id: 'en-default',
      name: cleanLexLabel(t('lang_standard', 'Standard English')),
      badge: t('auth_lex_standard_badge', 'Everyday Terms'),
      sample: buildGlossarySample('en-default'),
      dict: {},
      isSpoke: false,
    });

    return items;
  }, [fetchedSpokeLexicons, lexiconMeta, registry, targetGameName, t]);

  const handleSelectThemeChoice = (themeId: string) => {
    setSelectedThemeChoice(themeId);
    if (themeId === '__bypass__') {
      stopThemePreview();
      return;
    }
    const found = themeOptions.find((th) => th.id === themeId);
    if (found) {
      startThemePreview(found.id, found.name, found.data);
    }
  };

  const handleSelectLexiconChoice = (lexId: string) => {
    setSelectedLexiconChoice(lexId);
    if (lexId === '__bypass__') {
      stopLexiconPreview();
      return;
    }
    const found = lexiconOptions.find((lx) => lx.id === lexId);
    if (found) {
      startLexiconPreview(found.id, found.name, found.dict);
    }
  };

  const handleCancelSetup = useCallback(() => {
    stopThemePreview();
    stopLexiconPreview();
    setPendingWorkspaceSetupId(null);
    setView('landing');
  }, [stopThemePreview, stopLexiconPreview, setPendingWorkspaceSetupId, setView]);

  const completeWorkspaceSetup = async (bypassBothAesthetics = false) => {
    if (!isPathsReady || isSaving) return;
    setIsSaving(true);
    try {
      stopThemePreview();
      stopLexiconPreview();

      const themeChoice = bypassBothAesthetics ? '__bypass__' : selectedThemeChoice;
      const lexiconChoice = bypassBothAesthetics ? '__bypass__' : selectedLexiconChoice;

      // 1. Apply / Bypass Chameleon Choice cleanly without altering Hub or other workspaces
      const existingGlobalConfig =
        (await invoke<any>('get_global_config').catch(() => null)) || globalConfigRef.current || {};
      const existingWorkspacesList = Array.isArray(existingGlobalConfig?.workspaces)
        ? existingGlobalConfig.workspaces
        : [];
      const { healedWorkspaces } = healAndMatchLocalWorkspaces(
        workspaces,
        existingWorkspacesList,
        useStore.getState().activeGameSchema
      );

      if (themeChoice !== '__bypass__') {
        if (!allThemes?.[themeChoice] && fetchedSpokeThemes?.[themeChoice]) {
          try {
            const cachedSpoke = JSON.parse(localStorage.getItem(SPOKE_THEMES_CACHE_KEY) || '{}');
            cachedSpoke[themeChoice] = fetchedSpokeThemes[themeChoice];
            localStorage.setItem(SPOKE_THEMES_CACHE_KEY, JSON.stringify(cachedSpoke));
          } catch {}
        }
        if (useGlobalTheme) {
          // Snapshot current global theme onto Hub and existing configured workspaces before disabling global lock
          if (!localStorage.getItem('sanctuary_default_workspace_active_theme')) {
            setWorkspaceThemeId('default_workspace', globalThemeId || initialThemeIdRef.current);
          }
          for (const w of healedWorkspaces) {
            const wId = w?.id || w?.schema_id;
            if (
              wId &&
              !isPlaceholderWorkspaceKey(wId) &&
              String(wId).toLowerCase() !== targetWorkspaceId.toLowerCase() &&
              !localStorage.getItem(`sanctuary_${wId}_active_theme`)
            ) {
              setWorkspaceThemeId(wId, globalThemeId || getWorkspaceThemeId(wId));
            }
          }
          setUseGlobalTheme(false);
        }
        setWorkspaceThemeId(targetWorkspaceId, themeChoice);
        if (localStorage.getItem('sanctuary_use_global_theme') === 'true') {
          setActiveThemeId(themeChoice);
        }
      } else if (!useGlobalTheme) {
        // Bypass: preserve current visual Chameleon when mounting this workspace
        setWorkspaceThemeId(targetWorkspaceId, initialThemeIdRef.current || 'architect');
      }

      // 2. Apply / Bypass Lexicon Choice cleanly
      if (lexiconChoice !== '__bypass__') {
        const chosenLex = lexiconOptions.find((l) => l.id === lexiconChoice);
        if (chosenLex && Object.keys(chosenLex.dict || {}).length > 0) {
          try {
            if (BUILTIN_LEXICON_IDS.has(lexiconChoice)) {
              const cacheKey = `sanctuary_cached_spoke_lexicons_${targetWorkspaceId}`;
              const existingCache = JSON.parse(localStorage.getItem(cacheKey) || '{}');
              existingCache[lexiconChoice] = chosenLex.dict;
              localStorage.setItem(cacheKey, JSON.stringify(existingCache));
            } else {
              const regKey = `sanctuary_${targetWorkspaceId}_lexicon_registry`;
              const existingReg = JSON.parse(localStorage.getItem(regKey) || '{}');
              existingReg[lexiconChoice] = chosenLex.dict;
              localStorage.setItem(regKey, JSON.stringify(existingReg));
            }
          } catch {}
        }
        if (useGlobalLexicon) {
          if (!localStorage.getItem('sanctuary_default_workspace_lang')) {
            setWorkspaceLexiconId('default_workspace', globalLexiconId || initialLexiconIdRef.current);
          }
          for (const w of healedWorkspaces) {
            const wId = w?.id || w?.schema_id;
            if (
              wId &&
              !isPlaceholderWorkspaceKey(wId) &&
              String(wId).toLowerCase() !== targetWorkspaceId.toLowerCase() &&
              !getWorkspaceLexiconId(wId)
            ) {
              setWorkspaceLexiconId(wId, globalLexiconId || initialLexiconIdRef.current);
            }
          }
          setUseGlobalLexicon(false);
        }
        setWorkspaceLexiconId(targetWorkspaceId, lexiconChoice);
        if (localStorage.getItem('sanctuary_use_global_lexicon') === 'true') {
          setActiveLang(lexiconChoice);
        }
      } else if (!useGlobalLexicon) {
        // Bypass: preserve current Lexicon instead of auto-activating Spoke default
        setWorkspaceLexiconId(targetWorkspaceId, initialLexiconIdRef.current || 'en-sanctuary');
      }

      // 3. Persist Per-Workspace Coordinates Safely Without Mutating Other Workspaces
      const sep =
        effectiveMasterVault.includes('/') && !effectiveMasterVault.includes('\\') ? '/' : '\\';
      const spokeVaultPath =
        targetSchemaId && !isPlaceholderWorkspaceKey(targetSchemaId)
          ? masterVaultWithSep(effectiveMasterVault, sep, targetSchemaId)
          : effectiveMasterVault;

      const cleanLive = livePathInput.trim();
      const cleanMods = modsPathInput.trim();
      const cleanDocs = docsPathInput.trim();

      const matchIdx = healedWorkspaces.findIndex(
        (w: any) =>
          (!isPlaceholderWorkspaceKey(w?.id) &&
            String(w.id).trim().toLowerCase() === targetWorkspaceId.toLowerCase()) ||
          (!isPlaceholderWorkspaceKey(w?.schema_id) &&
            String(w.schema_id).trim().toLowerCase() === targetSchemaId.toLowerCase())
      );

      const existingEntry = matchIdx >= 0 ? healedWorkspaces[matchIdx] : null;
      const nextEntry = {
        ...(existingEntry || {}),
        id: targetWorkspaceId,
        name: targetGameName,
        schema_id: targetSchemaId,
        live_path: cleanLive,
        mods_path: cleanMods,
        ...(cleanDocs
          ? { docs_path: cleanDocs, user_data_path: cleanDocs }
          : existingEntry?.docs_path
            ? { docs_path: existingEntry.docs_path }
            : {}),
        vault_path: spokeVaultPath,
        master_vault_path: effectiveMasterVault,
        supabase_url: matchedWorkspace?.supabase_url ?? existingEntry?.supabase_url ?? null,
        supabase_anon_key:
          matchedWorkspace?.supabase_anon_key ?? existingEntry?.supabase_anon_key ?? null,
      };

      const updatedWorkspaces = [...healedWorkspaces];
      if (matchIdx >= 0) {
        updatedWorkspaces[matchIdx] = nextEntry;
      } else {
        updatedWorkspaces.push(nextEntry);
      }

      const nextGlobalConfig = {
        ...existingGlobalConfig,
        vault_path: effectiveMasterVault,
        active_workspace_id: targetWorkspaceId,
        workspaces: updatedWorkspaces,
      };

      await invoke('save_coordinates', { config: nextGlobalConfig });
      const savedCoords: any = await invoke('get_saved_coordinates').catch(() => null);

      const finalLive = String(savedCoords?.live_path || cleanLive);
      const finalMods = String(savedCoords?.mods_path || cleanMods);
      const finalDocs = String(savedCoords?.docs_path || cleanDocs || '');
      const finalVault = String(savedCoords?.vault_path || spokeVaultPath);

      setLivePathStore(finalLive);
      setModsPathStore(finalMods);
      setDocsPathStore(finalDocs);
      setVaultPathStore(finalVault);

      const storeWorkspaces = useStore.getState().workspaces || [];
      if (storeWorkspaces.length > 0) {
        const mergedStore = storeWorkspaces.map((sw: any) => {
          const localMatch = updatedWorkspaces.find(
            (lw: any) =>
              (!isPlaceholderWorkspaceKey(lw?.id) &&
                String(lw.id).toLowerCase() === String(sw?.id || '').toLowerCase()) ||
              (!isPlaceholderWorkspaceKey(lw?.schema_id) &&
                String(lw.schema_id).toLowerCase() === String(sw?.schema_id || '').toLowerCase())
          );
          if (!localMatch) return sw;
          return {
            ...localMatch,
            ...sw,
            live_path: localMatch.live_path ?? sw.live_path,
            mods_path: localMatch.mods_path ?? sw.mods_path,
            docs_path: localMatch.docs_path ?? sw.docs_path,
            vault_path: localMatch.vault_path ?? sw.vault_path,
            master_vault_path: localMatch.master_vault_path ?? sw.master_vault_path,
          };
        });
        setWorkspacesStore(mergedStore);
      }

      didCommitRef.current = true;
      localStorage.setItem('sanctuary_last_active_workspace', targetWorkspaceId);
      setPendingWorkspaceSetupId(null);
      recordWorkspaceLoaded(targetWorkspaceId);

      useStore.getState().hydrateWorkspaceState(targetWorkspaceId);
      setActiveWorkspaceId(targetWorkspaceId);
      setIsConfigured(true);

      if (targetSchemaId && !isPlaceholderWorkspaceKey(targetSchemaId)) {
        syncMasterSchemas(targetSchemaId).catch(console.warn);
      }
      syncGameDatabases(updatedWorkspaces).catch(console.warn);
      detectGameVersion().catch(() => {});

      invoke('scan_installed_dlc', { livePath: finalLive })
        .then((physicalDLC) => useStore.getState().setOwnedDLC(physicalDLC as string[]))
        .catch(() => {});
      invoke('initialize_vault_watch').catch(() => {});
      if (finalDocs) {
        invoke('initialize_airgap_watch', {
          docsPath: finalDocs,
          vaultPath: finalVault,
        }).catch(() => {});
      }
      invoke('initialize_settings_watch', {
        modsPath: finalMods,
        vaultPath: finalVault,
      }).catch(() => {});

      pushToast(
        t('ws_setup_complete_toast', 'Workspace configured and mounted successfully!'),
        'success'
      );
      setView('dashboard');
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('force-radar-sweep'));
      }, 60);
    } catch (err: any) {
      pushToast(
        `${t('status_save_failure', 'Save Failure:')} ${err?.message || String(err)}`,
        'error'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const renderStatusBadge = (isComplete: boolean) => (
    <span className={`${VAULT_CHIP_CLASS} bg-transparent`}>
      <span
        className={`material-symbols-outlined !text-[12px] ${
          isComplete ? 'text-[var(--success)]' : 'text-[var(--warning)]'
        }`}
      >
        {isComplete
          ? t('icon_check_circle', 'check_circle')
          : t('icon_pending', 'pending')}
      </span>
      <span>
        {isComplete ? t('active', 'Active') : t('ws_setup_required_badge', 'Required')}
      </span>
    </span>
  );

  const folderPickerGroup = (
    titleKey: string,
    titleFallback: string,
    descKey: string,
    descFallback: string,
    iconName: string,
    value: string,
    setValue: (val: string) => void,
    isComplete: boolean,
    hint?: string,
    extraBadge?: string,
    onDirectoryPicked?: (val: string) => void
  ) => (
    <UniversalGroup
      title={t(titleKey, titleFallback)}
      icon={iconName}
      headerAction={
        <div className="flex items-center gap-2 ml-auto">
          {extraBadge && (
            <span className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t('icon_radar', 'radar')}
              </span>
              <span>{extraBadge}</span>
            </span>
          )}
          {renderStatusBadge(isComplete)}
        </div>
      }
    >
      <p className="text-[11px] font-medium text-[var(--subtext)] opacity-85 m-0 leading-relaxed">
        {t(descKey, descFallback)}
      </p>

      {hint && (
        <div className="flex items-center gap-2 text-[10px] font-bold text-[var(--subtext)] px-0.5">
          <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
            {t('icon_terminal', 'terminal')}
          </span>
          <span className="font-mono opacity-85">{hint}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t('path_not_set', 'Not Set')}
          className="flex-1 glass-surface rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[color-mix(in_srgb,var(--text)_28%,transparent)]"
        />
        <ActionButton
          type="button"
          variant="glass"
          icon={t('icon_folder_open', 'folder_open')}
          label={t('btn_browse', 'Browse')}
          onClick={() =>
            pickDirectory(titleKey, titleFallback, value, (picked) => {
              setValue(picked);
              if (onDirectoryPicked) onDirectoryPicked(picked);
            })
          }
        />
      </div>
    </UniversalGroup>
  );

  const bodyActionControls = (
    <div className="glass-panel rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-wrap items-center justify-between gap-2.5 w-full">
      {step === 'paths' ? (
        <>
          <ActionButton
            type="button"
            variant="glass"
            icon={t('icon_close', 'close')}
            label={t('cancel', 'Cancel')}
            onClick={handleCancelSetup}
          />

          <div className="flex items-center gap-2.5 flex-wrap ml-auto">
            <ActionButton
              type="button"
              variant="glass"
              disabled={!isPathsReady || isSaving}
              icon={t('icon_skip_next', 'skip_next')}
              label={t('ws_setup_bypass_and_finish', 'Bypass Aesthetics & Launch')}
              onClick={() =>
                guardSetupCloudStep(
                  () => void completeWorkspaceSetup(true),
                  t('ws_setup_bypass_and_finish', 'Bypass Aesthetics & Launch')
                )
              }
            />
            <ActionButton
              type="button"
              variant="accent"
              disabled={!isPathsReady || isSaving}
              icon={t('icon_arrow_forward', 'arrow_forward')}
              label={t('next', 'Next')}
              onClick={() => guardSetupCloudStep(() => setStep('aesthetics'), t('next', 'Next'))}
            />
          </div>
        </>
      ) : (
        <>
          <ActionButton
            type="button"
            variant="glass"
            icon={t('icon_arrow_back', 'arrow_back')}
            label={t('back', 'Back')}
            onClick={() => setStep('paths')}
          />

          <div className="flex items-center gap-2.5 flex-wrap ml-auto">
            <ActionButton
              type="button"
              variant="glass"
              disabled={!isPathsReady || isSaving}
              icon={t('icon_skip_next', 'skip_next')}
              label={t('ws_setup_bypass_both_btn', 'Bypass Both & Launch')}
              onClick={() => {
                stopThemePreview();
                stopLexiconPreview();
                setSelectedThemeChoice('__bypass__');
                setSelectedLexiconChoice('__bypass__');
                guardSetupCloudStep(
                  () => void completeWorkspaceSetup(true),
                  t('ws_setup_bypass_both_btn', 'Bypass Both & Launch')
                );
              }}
            />
            <ActionButton
              type="button"
              variant="accent"
              disabled={!isPathsReady || isSaving}
              icon={t('icon_rocket_launch', 'rocket_launch')}
              label={t('ws_setup_complete_btn', 'Complete Setup & Launch')}
              onClick={() =>
                guardSetupCloudStep(
                  () => void completeWorkspaceSetup(false),
                  t('ws_setup_complete_btn', 'Complete Setup & Launch')
                )
              }
            />
          </div>
        </>
      )}
    </div>
  );

  const sourceBadgeLabel = useMemo(() => {
    switch (detectedSource) {
      case 'steam':
        return t('cartographer_src_steam', 'Steam Detected');
      case 'gog':
        return t('cartographer_src_gog', 'GOG Galaxy');
      case 'epic':
        return t('cartographer_src_epic', 'Epic Games');
      case 'heroic':
        return t('cartographer_src_heroic', 'Heroic Launcher');
      case 'lutris':
        return t('cartographer_src_lutris', 'Lutris');
      case 'ea_app':
        return t('cartographer_src_ea', 'EA App');
      case 'macos_app':
        return t('cartographer_src_macos', 'Applications');
      case 'manual_anchor':
        return t('cartographer_src_anchor', 'Anchored');
      case 'schema_scan':
        return t('cartographer_src_scan', 'Detected');
      default:
        return '';
    }
  }, [detectedSource, t]);

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={handleCancelSetup}
      title={t('cartographer_title', 'The Cartographer')}
      subtitle={targetGameName}
      icon={t('icon_explore', 'explore')}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-full md:w-[760px]"
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t('icon_explore', 'explore')}
          overline={t('cartographer_title', 'The Cartographer')}
          title={targetGameName}
          description={t(
            'ws_setup_subtitle',
            'Anchor your game installation and {Vault} once—derived {mods} and save paths populate automatically.'
          )}
          badge={`${folderCompletedCount}/${folderTotalCount}`}
          badgeIcon={
            isPathsReady
              ? t('icon_check_circle', 'check_circle')
              : t('icon_folder_open', 'folder_open')
          }
          variant={isPathsReady ? 'success' : 'accent'}
        >
          {step === 'paths' && (
            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] w-full">
              <ActionButton
                type="button"
                variant="glass"
                disabled={isAutoDetecting || isLoadingConfig}
                icon={t('icon_radar', 'radar')}
                label={t('ws_setup_auto_detect', 'Auto-Detect')}
                onClick={() => runSchemaAutoDetect(false)}
              />
            </div>
          )}
        </SidePanelHeroCard>

        <SidePanelFilterBar className="sm:grid-cols-2 gap-3">
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            icon={t('icon_folder_open', 'folder_open')}
            label={t('ws_setup_step_folders', 'Workspace Folders')}
            value={`${folderCompletedCount}/${folderTotalCount}`}
            active={step === 'paths'}
            onClick={() => setStep('paths')}
          />
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            icon={t('icon_palette', 'palette')}
            label={t('ws_setup_step_aesthetics', '{Chameleon} & {Lexicon}')}
            value={
              selectedThemeChoice === '__bypass__' && selectedLexiconChoice === '__bypass__'
                ? t('ws_setup_bypass_short', 'Bypass')
                : t('enabled', 'Enabled')
            }
            active={step === 'aesthetics'}
            onClick={() => {
              if (!isPathsReady) {
                pushToast(
                  t(
                    'ws_setup_paths_required_toast',
                    'Please select required game and {mods} folders first.'
                  ),
                  'warning'
                );
                return;
              }
              setStep('aesthetics');
            }}
          />
        </SidePanelFilterBar>

        {isLoadingConfig ? (
          <div className="glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] p-10 flex flex-col items-center justify-center gap-3 text-center">
            <span className="material-symbols-outlined !text-[28px] text-[var(--accent)] animate-spin">
              {t('icon_sync', 'sync')}
            </span>
            <span className="text-xs font-black uppercase tracking-widest text-[var(--text)]">
              {t('loading', 'Loading...')}
            </span>
          </div>
        ) : step === 'paths' ? (
          <div className="flex flex-col gap-4 w-full">
            {folderPickerGroup(
              'ws_setup_game_folder_title',
              'Game Installation Folder',
              'ws_setup_game_folder_desc',
              'Select your game root folder—Sanctuary derives {mods} and save directories automatically.',
              t('icon_sports_esports', 'sports_esports'),
              livePathInput,
              setLivePathInput,
              hasLive,
              resolvedExpectedExecutables || undefined,
              sourceBadgeLabel || undefined,
              (picked) => {
                void runSchemaAutoDetect(true, picked);
              }
            )}

            {hasExistingMasterVault && !isEditingMasterVault ? (
              <UniversalGroup
                title={t('ws_setup_vault_configured', 'Master {Vault} Already Configured')}
                icon={t('icon_inventory_2', 'inventory_2')}
                headerAction={renderStatusBadge(true)}
              >
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                  <div className="flex-1 glass-surface rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-[var(--subtext)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] break-all">
                    {vaultSubdirPreview}
                  </div>
                  <ActionButton
                    type="button"
                    variant="glass"
                    icon={t('icon_edit', 'edit')}
                    label={t('change', 'Change')}
                    onClick={() => setIsEditingMasterVault(true)}
                  />
                </div>
              </UniversalGroup>
            ) : (
              folderPickerGroup(
                'ws_setup_vault_folder_title',
                'Master {Vault} Path',
                'ws_setup_vault_folder_desc',
                'Select the root storage directory for your {Vault}. An isolated workspace subfolder will be created automatically.',
                t('icon_inventory_2', 'inventory_2'),
                masterVaultInput,
                setMasterVaultInput,
                hasVault
              )
            )}

            <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setShowAdvancedPaths((v) => !v)}
                className="flex items-center justify-between gap-2 w-full text-left cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="material-symbols-outlined !text-[16px] text-[var(--subtext)]">
                    {showAdvancedPaths
                      ? t('icon_expand_less', 'expand_less')
                      : t('icon_expand_more', 'expand_more')}
                  </span>
                  <span className="text-[11px] font-black uppercase tracking-widest text-[var(--text)]">
                    {t('cartographer_advanced_paths', 'Advanced Path Overrides')}
                  </span>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  {modsWillCreate && hasMods && (
                    <span className={VAULT_CHIP_CLASS}>
                      <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                        {t('icon_create_new_folder', 'create_new_folder')}
                      </span>
                      <span className="text-[var(--accent)]">
                        {t('cartographer_will_create_mods', 'Will create folder')}
                      </span>
                    </span>
                  )}
                  {renderStatusBadge(hasMods)}
                </div>
              </button>

              {(showAdvancedPaths || (hasLive && !hasMods)) && (
                <div className="flex flex-col gap-3 pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                  {folderPickerGroup(
                    'ws_setup_mods_folder_title',
                    '{Mods} Folder Path',
                    'ws_setup_mods_folder_desc',
                    'Derived game directory where active {mod} files deploy at runtime.',
                    t('icon_extension', 'extension'),
                    modsPathInput,
                    (v) => {
                      setModsPathInput(v);
                      setModsWillCreate(false);
                    },
                    hasMods
                  )}

                  {folderPickerGroup(
                    'ws_setup_docs_folder_title',
                    'Saves & User Data Folder',
                    'ws_setup_docs_folder_desc',
                    'Optional game saves and configuration folder for {Backups} and {Lab} airgapping.',
                    t('icon_save', 'save'),
                    docsPathInput,
                    setDocsPathInput,
                    docsPathInput.trim().length > 0
                  )}
                </div>
              )}
            </div>

            {isDesktop() && unconsentedSetupFindings.length > 0 && (
              <UniversalGroup
                title={t('cloud_guard_card_title', 'Cloud-Sync Folder Detected')}
                icon={t('icon_cloud_sync', 'cloud_sync')}
                headerAction={
                  <span className={`${VAULT_CHIP_CLASS} bg-transparent border-[color-mix(in_srgb,var(--warning)_45%,transparent)] text-[var(--warning)]`}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                      {isCheckingCloudSync ? t('icon_sync', 'sync') : t('icon_warning', 'warning')}
                    </span>
                    {Array.from(
                      new Set(unconsentedSetupFindings.map((f) => f.provider))
                    ).join(', ')}
                  </span>
                }
              >
                <p className="text-[11px] font-medium text-[var(--subtext)] leading-relaxed m-0">
                  {t(
                    'cloud_guard_setup_warn_desc',
                    'One or more selected directories sit inside a cloud-synced folder ({0}). Cloud sync can pull symlinks into the cloud or dehydrate files. Nothing will be moved or changed automatically—choose whether to review safe options or explicitly consent to keep using these folders.'
                  ).replace(
                    '{0}',
                    Array.from(
                      new Set(unconsentedSetupFindings.map((f) => f.provider))
                    ).join(', ')
                  )}
                </p>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <ActionButton
                    type="button"
                    variant="accent"
                    icon={t('icon_verified_user', 'verified_user')}
                    label={t('cloud_guard_review_btn', 'Review Cloud-Sync Options')}
                    onClick={() =>
                      useModalStore.getState().openCloudSyncGuard({
                        pendingActionLabel: targetGameName,
                        pathsOverride: buildSetupInspectInput(),
                        onConsentGranted: () => {
                          void runSetupCloudCheck();
                        },
                      })
                    }
                  />
                  <ActionButton
                    type="button"
                    variant="glass"
                    icon={t('icon_check_circle', 'check_circle')}
                    label={t('cloud_guard_allow_setup_btn', 'Allow Cloud Folder (I Understand)')}
                    onClick={() => {
                      grantCloudSyncConsent(unconsentedSetupFindings, targetWorkspaceId);
                      setSetupCloudConsents(getCloudSyncConsents());
                    }}
                  />
                </div>
              </UniversalGroup>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4 w-full">
            {/* Section A: Chameleon Preview (Enable for Workspace or Bypass) */}
            <UniversalGroup
              title={t('ws_setup_chameleon_heading', 'Workspace {Chameleon} Option')}
              icon={t('icon_palette', 'palette')}
            >
              <span className="text-[11px] font-medium text-[var(--subtext)] opacity-85">
                {t(
                  'ws_setup_chameleon_desc',
                  'Click any {Chameleon} to preview it live for this workspace, or bypass to keep your current visual style.'
                )}
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Explicit Bypass Option Card */}
                <button
                  type="button"
                  onClick={() => handleSelectThemeChoice('__bypass__')}
                  className={`glass-surface rounded-2xl p-4 text-left border transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                    selectedThemeChoice === '__bypass__'
                      ? 'sa-card-selected border-[color-mix(in_srgb,var(--text)_24%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]'
                      : 'border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">
                        {t('icon_block', 'block')}
                      </span>
                      <span className="text-xs font-black text-[var(--text)] truncate">
                        {t('ws_setup_bypass_theme_title', 'Bypass / Keep Current')}
                      </span>
                    </div>
                    <span
                      className={`material-symbols-outlined !text-[18px] shrink-0 ${
                        selectedThemeChoice === '__bypass__'
                          ? 'text-[var(--accent)]'
                          : 'text-[var(--subtext)] opacity-45'
                      }`}
                    >
                      {selectedThemeChoice === '__bypass__'
                        ? t('icon_check_circle', 'check_circle')
                        : t('icon_radio_button_unchecked', 'radio_button_unchecked')}
                    </span>
                  </div>
                  <p className="text-[11px] font-medium text-[var(--subtext)] leading-relaxed m-0">
                    {t(
                      'ws_setup_bypass_theme_desc',
                      'Skip assigning a custom workspace {Chameleon} and keep your active OS appearance.'
                    )}
                  </p>
                </button>

                {themeOptions.map((th) => {
                  const isSelected = selectedThemeChoice === th.id;
                  return (
                    <button
                      key={th.id}
                      type="button"
                      onClick={() => handleSelectThemeChoice(th.id)}
                      className={`glass-surface rounded-2xl overflow-hidden text-left border transition-all cursor-pointer flex flex-col ${
                        isSelected
                          ? 'sa-card-selected border-[color-mix(in_srgb,var(--text)_24%,transparent)] bg-[color-mix(in_srgb,var(--accent)_6%,transparent)]'
                          : 'border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)]'
                      }`}
                    >
                      <DynamicThemePreviewBanner
                        data={th.data}
                        heightClass="h-24"
                        insetTopClass="top-2"
                      />
                      <div className="px-3.5 py-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 w-full">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="material-symbols-outlined !text-[14px] text-[var(--accent)] shrink-0">
                            {th.isDark
                              ? t('icon_dark_mode', 'dark_mode')
                              : t('icon_light_mode', 'light_mode')}
                          </span>
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-black text-[var(--text)] truncate">
                              {th.name}
                            </span>
                            <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--subtext)] opacity-75 truncate">
                              {th.badge}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex items-center gap-1">
                            {th.swatches.map((hex, sIdx) => (
                              <span
                                key={sIdx}
                                className="w-2.5 h-2.5 rounded-full border border-white/30"
                                style={{ backgroundColor: hex }}
                              />
                            ))}
                          </div>
                          <span
                            className={`material-symbols-outlined !text-[17px] shrink-0 ${
                              isSelected ? 'text-[var(--accent)]' : 'text-[var(--subtext)] opacity-45'
                            }`}
                          >
                            {isSelected
                              ? t('icon_check_circle', 'check_circle')
                              : t('icon_radio_button_unchecked', 'radio_button_unchecked')}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </UniversalGroup>

            {/* Section B: Lexicon Preview (Enable for Workspace or Bypass) */}
            <UniversalGroup
              title={t('ws_setup_lexicon_heading', 'Workspace {Lexicon} Option')}
              icon={t('icon_translate', 'translate')}
            >
              <span className="text-[11px] font-medium text-[var(--subtext)] opacity-85">
                {t(
                  'ws_setup_lexicon_desc',
                  'Preview game-tailored or community terminology live, or bypass to keep your current {Lexicon}.'
                )}
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Explicit Bypass Option Card */}
                <button
                  type="button"
                  onClick={() => handleSelectLexiconChoice('__bypass__')}
                  className={`glass-surface rounded-2xl p-4 text-left border transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                    selectedLexiconChoice === '__bypass__'
                      ? 'sa-card-selected border-[color-mix(in_srgb,var(--text)_24%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]'
                      : 'border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">
                        {t('icon_block', 'block')}
                      </span>
                      <span className="text-xs font-black text-[var(--text)] truncate">
                        {t('ws_setup_bypass_lexicon_title', 'Bypass / Keep Current')}
                      </span>
                    </div>
                    <span
                      className={`material-symbols-outlined !text-[18px] shrink-0 ${
                        selectedLexiconChoice === '__bypass__'
                          ? 'text-[var(--accent)]'
                          : 'text-[var(--subtext)] opacity-45'
                      }`}
                    >
                      {selectedLexiconChoice === '__bypass__'
                        ? t('icon_check_circle', 'check_circle')
                        : t('icon_radio_button_unchecked', 'radio_button_unchecked')}
                    </span>
                  </div>
                  <p className="text-[11px] font-medium text-[var(--subtext)] leading-relaxed m-0">
                    {t(
                      'ws_setup_bypass_lexicon_desc',
                      'Skip enabling a workspace {Lexicon} pack and keep your current OS terminology.'
                    )}
                  </p>
                </button>

                {lexiconOptions.map((lx) => {
                  const isSelected = selectedLexiconChoice === lx.id;
                  return (
                    <button
                      key={lx.id}
                      type="button"
                      onClick={() => handleSelectLexiconChoice(lx.id)}
                      className={`glass-surface rounded-2xl p-4 text-left border transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                        isSelected
                          ? 'sa-card-selected border-[color-mix(in_srgb,var(--text)_24%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]'
                          : 'border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 w-full">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0">
                            {t('icon_menu_book', 'menu_book')}
                          </span>
                          <span className="text-xs font-black text-[var(--text)] truncate">
                            {lx.name}
                          </span>
                        </div>
                        <span
                          className={`material-symbols-outlined !text-[17px] shrink-0 ${
                            isSelected ? 'text-[var(--accent)]' : 'text-[var(--subtext)] opacity-45'
                          }`}
                        >
                          {isSelected
                            ? t('icon_check_circle', 'check_circle')
                            : t('icon_radio_button_unchecked', 'radio_button_unchecked')}
                        </span>
                      </div>
                      <div className="pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex flex-col gap-0.5 w-full">
                        <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75 truncate">
                          {lx.badge}
                        </span>
                        <span className="text-[10px] font-bold text-[var(--accent)] truncate">
                          {lx.sample}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </UniversalGroup>
          </div>
        )}

        {!isLoadingConfig && bodyActionControls}
      </div>
    </SidePanel>
  );
}
