import { useState, useEffect } from 'react';
// Force Vite HMR reload
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { open } from '@tauri-apps/plugin-dialog';
import { useTheme } from './ThemeContext';
import { useLexicon } from './LexiconContext';
import { ViewHeader, DashboardStatTile, ActionPill, InlineFilterGroup } from './shared';
import { StatTileCarousel } from './hub-components/SharedCommandScreenLayout';
import { useStore } from './store';
import { supabase } from './supabase';
import { openSanctuaryLogin } from './AuthWrapper';

import CoreTab from './settings-tabs/CoreTab';
import VaultStorageTab from './settings-tabs/VaultStorageTab';
import EngineTab from './settings-tabs/EngineTab';
import NotificationsTab from './settings-tabs/NotificationsTab';
import AestheticsTab from './settings-tabs/AestheticsTab';
import MalwareTab from './settings-tabs/MalwareTab';
import SupporterTab from './settings-tabs/SupporterTab';
import TicketsTab from './settings-tabs/TicketsTab';
import { isDesktop } from './utils/envUtils';
import { isRootDomain } from './utils/routingUtils';
import { getKeepersPipelineConfig, isTargetVersionNewer } from './utils/supporterManager';
import packageJson from '../package.json';

const normalizeSettingsTabId = (rawTab?: string | null): string => {
  const upper = String(rawTab || '').trim().toUpperCase();
  if (!upper) return 'CORE';
  if (upper === 'CORE' || upper === 'ACCOUNT' || upper === 'PRIVACY' || upper === 'CLIENT') {
    return 'CORE';
  }
  if (
    upper === 'VAULT' ||
    upper === 'STORAGE' ||
    upper === 'LOGIC' ||
    upper === 'BLUEPRINTS' ||
    upper === 'WORKBENCH'
  ) {
    return isDesktop() ? 'VAULT' : 'AESTHETICS';
  }
  if (
    upper === 'ENGINE' ||
    upper === 'GAME' ||
    upper === 'LAUNCH' ||
    upper === 'BACKUPS' ||
    upper === 'TIMECAPSULE' ||
    upper === 'TIME_CAPSULE'
  ) {
    return isDesktop() ? 'ENGINE' : 'AESTHETICS';
  }
  if (
    upper === 'AESTHETICS' ||
    upper === 'LEXICON' ||
    upper === 'CHAMELEON' ||
    upper === 'PREFERENCES' ||
    upper === 'INTERFACE'
  ) {
    return 'AESTHETICS';
  }
  if (upper === 'NOTIFICATIONS') return 'NOTIFICATIONS';
  if (upper === 'SUPPORTER') return 'SUPPORTER';
  if (upper === 'TICKETS') return 'TICKETS';
  if (upper === 'MALWARE') return 'MALWARE';
  return 'CORE';
};

export default function Settings({ anarchyRules, setAnarchyRules }: any) {
  const { t } = useLexicon();
  const { currentTheme } = useTheme();
  const session = useStore((state) => state.session);

  const [activeTab, setActiveTab] = useState(() => {
    const override = localStorage.getItem('sanctuary_settings_tab');
    if (override) {
      localStorage.removeItem('sanctuary_settings_tab');
      return normalizeSettingsTabId(override);
    }
    return 'CORE';
  });
  const [appVersion, setAppVersion] = useState(`v${packageJson.version}`);

  useEffect(() => {
    if (isDesktop()) {
      getVersion()
        .then((v) => setAppVersion(`v${v}`))
        .catch(console.error);
    } else {
      getKeepersPipelineConfig(false)
        .then((cfg) => {
          const remoteVer = (cfg?.stable_version || '').replace(/^v/i, '').trim();
          const localVer = (packageJson.version || '').replace(/^v/i, '').trim();
          if (remoteVer && isTargetVersionNewer(localVer, remoteVer, false)) {
            setAppVersion(`v${remoteVer}`);
          } else if (localVer) {
            setAppVersion(`v${localVer}`);
          }
        })
        .catch(() => {});
    }
  }, []);

  const [hackerClicks, setHackerClicks] = useState(0);
  const showMalwareTab = hackerClicks >= 5;
  const [ticketSearch, setTicketSearch] = useState('');
  const [ticketStatusFilter, setTicketStatusFilter] = useState<
    'all' | 'open' | 'pending' | 'closed'
  >('all');
  const [ticketScopeFilter, setTicketScopeFilter] = useState<'all' | 'core' | 'spoke'>('all');

  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);
  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const availableWorkspaces = useStore((state) => state.workspaces);
  const hasLoadedSpoke = Boolean(
    activeWorkspaceId &&
      activeWorkspaceId !== 'default_workspace' &&
      activeWorkspaceId !== 'web' &&
      !(!isDesktop() && isRootDomain())
  );

  const activeWorkspaceObj = Array.isArray(availableWorkspaces)
    ? availableWorkspaces.find(
        (w: any) =>
          String(w?.id || '').toLowerCase() === String(activeWorkspaceId || '').toLowerCase() ||
          String(w?.schema_id || '').toLowerCase() === String(activeWorkspaceId || '').toLowerCase()
      )
    : null;
  const activeSpokeName =
    activeGameSchema?.display_name ||
    activeGameSchema?.name ||
    activeWorkspaceObj?.name ||
    activeWorkspaceId ||
    t('tab_workspace', 'Workspace');

  useEffect(() => {
    const handleNav = (e: any) => {
      if (e.detail && e.detail.tab) {
        setActiveTab(normalizeSettingsTabId(e.detail.tab));
      }
    };
    window.addEventListener('navigateSettings', handleNav);
    return () => window.removeEventListener('navigateSettings', handleNav);
  }, []);

  const [config, setConfig] = useState<any>(null);
  const [globalConfig, setGlobalConfig] = useState<any>(null);

  const resolveUniversalMasterVaultPath = (
    rawPath: string | undefined | null,
    workspacesList?: any[],
    activeW?: any
  ): string => {
    const trimmed = String(rawPath || '').trim().replace(/[\\/]+$/, '');
    if (!trimmed || trimmed.toLowerCase() === 'web') return trimmed;
    const parts = trimmed.split(/[\\/]/);
    if (parts.length <= 1) return trimmed;
    const lastSeg = parts[parts.length - 1].toLowerCase();
    const knownSchemas = new Set<string>();
    if (Array.isArray(workspacesList)) {
      workspacesList.forEach((w: any) => {
        if (w?.schema_id && String(w.schema_id).toLowerCase() !== 'default_schema') {
          knownSchemas.add(String(w.schema_id).toLowerCase());
        }
        if (w?.id && String(w.id).toLowerCase() !== 'default_workspace') {
          knownSchemas.add(String(w.id).toLowerCase());
        }
      });
    }
    if (Array.isArray(availableWorkspaces)) {
      availableWorkspaces.forEach((w: any) => {
        if (w?.schema_id) knownSchemas.add(String(w.schema_id).toLowerCase());
        if (w?.id) knownSchemas.add(String(w.id).toLowerCase());
      });
    }
    if (activeW?.schema_id) knownSchemas.add(String(activeW.schema_id).toLowerCase());
    if (activeW?.id && String(activeW.id).toLowerCase() !== 'default_workspace') {
      knownSchemas.add(String(activeW.id).toLowerCase());
    }
    if (knownSchemas.has(lastSeg)) {
      const sep = trimmed.includes('/') && !trimmed.includes('\\') ? '/' : '\\';
      return parts.slice(0, -1).join(sep);
    }
    return trimmed;
  };

  const refreshConfig = async () => {
    try {
      if (!isDesktop()) {
        const dummyConfig = {
          id: 'web',
          vault_path: 'web',
          master_vault_path: 'web',
          mods_path: 'web',
          live_path: 'web',
          docs_path: 'web',
        };
        setConfig(dummyConfig);
        setGlobalConfig({
          workspaces: [dummyConfig],
          active_workspace_id: 'web',
          vault_path: 'web',
        });
        return;
      }
      const gConf: any = await invoke('get_global_config');
      const storeState = useStore.getState();
      const fallbackWorkspaceId =
        storeState.activeWorkspaceId ||
        localStorage.getItem('sanctuary_last_active_workspace') ||
        'default_workspace';
      const activeId =
        gConf?.active_workspace_id && gConf.active_workspace_id !== 'default_workspace'
          ? gConf.active_workspace_id
          : fallbackWorkspaceId;

      let activeW = gConf?.workspaces?.find(
        (w: any) =>
          String(w.id || '').toLowerCase() === String(activeId || '').toLowerCase() ||
          String(w.schema_id || '').toLowerCase() === String(activeId || '').toLowerCase()
      );
      if (!activeW && gConf?.workspaces?.length > 0) {
        activeW = gConf.workspaces[0];
      }
      const masterVault = resolveUniversalMasterVaultPath(
        gConf?.vault_path || activeW?.master_vault_path || activeW?.vault_path || storeState.vaultPath,
        gConf?.workspaces,
        activeW
      );
      const sep = masterVault.includes('/') && !masterVault.includes('\\') ? '/' : '\\';

      if (!activeW) {
        const storeMatch = (storeState.workspaces || []).find(
          (w: any) =>
            String(w.id || '').toLowerCase() === String(activeId || '').toLowerCase() ||
            String(w.schema_id || '').toLowerCase() === String(activeId || '').toLowerCase()
        );
        const resolvedId = storeMatch?.id || activeId || 'default_workspace';
        const resolvedSchema = storeMatch?.schema_id || resolvedId;
        activeW = {
          id: resolvedId,
          name: storeMatch?.name || resolvedId,
          schema_id: resolvedSchema,
          live_path: storeState.livePath || '',
          mods_path: storeState.modsPath || '',
          docs_path: storeState.docsPath || '',
          user_data_path: storeState.docsPath || '',
          master_vault_path: masterVault,
          vault_path: masterVault
            ? `${masterVault}${sep}${resolvedSchema}`
            : storeState.vaultPath || '',
        };
      } else {
        activeW = {
          ...activeW,
          docs_path: activeW.docs_path || activeW.user_data_path || storeState.docsPath || '',
          master_vault_path: masterVault || activeW.master_vault_path,
        };
      }

      // Auto-resolve Saves & User Data path from the active GameSchema when live/mods paths are already set
      let autoResolvedDocsPath = '';
      if (!activeW.docs_path && (activeW.mods_path || activeW.live_path)) {
        try {
          if (storeState.activeGameSchema) {
            await invoke('update_active_game_schema', { schema: storeState.activeGameSchema }).catch(
              () => {}
            );
          }
          const detected: any = await invoke('auto_detect_paths');
          const resolvedDocs = String(detected?.docs_path || detected?.user_data_path || '').trim();
          if (resolvedDocs) {
            autoResolvedDocsPath = resolvedDocs;
            activeW = {
              ...activeW,
              docs_path: resolvedDocs,
              user_data_path: resolvedDocs,
            };
          }
        } catch {
          // Non-fatal fallback
        }
      }

      const normalizedWorkspaces = Array.isArray(gConf?.workspaces)
        ? gConf.workspaces.map((w: any) => {
            const isTarget =
              String(w.id || '').toLowerCase() === String(activeW.id || '').toLowerCase() ||
              String(w.schema_id || '').toLowerCase() ===
                String(activeW.schema_id || '').toLowerCase();
            const withDocs =
              isTarget && autoResolvedDocsPath && !w.docs_path
                ? { ...w, docs_path: autoResolvedDocsPath, user_data_path: autoResolvedDocsPath }
                : w;
            if (!masterVault) return withDocs;
            const wsSchema =
              withDocs.schema_id && withDocs.schema_id !== 'default_schema'
                ? withDocs.schema_id
                : withDocs.id;
            return {
              ...withDocs,
              master_vault_path: masterVault,
              vault_path:
                wsSchema && wsSchema !== 'default_workspace'
                  ? `${masterVault}${sep}${wsSchema}`
                  : withDocs.vault_path,
            };
          })
        : [];
      const normalizedGlobal = {
        ...gConf,
        vault_path: masterVault || gConf?.vault_path,
        active_workspace_id: activeW.id || activeId,
        workspaces: normalizedWorkspaces,
      };
      if (autoResolvedDocsPath) {
        invoke('save_coordinates', { config: normalizedGlobal }).catch(() => {});
        useStore.getState().setDocsPath(autoResolvedDocsPath);
      }
      setGlobalConfig(normalizedGlobal);
      setConfig(activeW);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    refreshConfig();
  }, [activeWorkspaceId, activeGameSchema?.id]);

  const INT_CONFIG_KEYS = new Set([
    'vault_capacity_gb',
    'engine_agency_level',
    'backup_preference',
    'defcon_backup_target',
    'engine_retention_cycles',
    'world_retention_cycles',
    'timeline_retention_copies',
    'timeline_retention_size_mb',
  ]);

  const updateConfig = async (keyOrPatch: string | Record<string, any>, val?: any) => {
    if (!config || !globalConfig) return;
    const rawPatch: Record<string, any> =
      typeof keyOrPatch === 'string' ? { [keyOrPatch]: val } : { ...keyOrPatch };
    const parsedPatch: Record<string, any> = {};
    for (const [k, v] of Object.entries(rawPatch)) {
      parsedPatch[k] = INT_CONFIG_KEYS.has(k) ? parseInt(String(v), 10) : v;
    }

    const { isGuest: _ignoredGuest, ...cleanBase } = config;
    const resolvedId =
      cleanBase.id ||
      useStore.getState().activeWorkspaceId ||
      localStorage.getItem('sanctuary_last_active_workspace') ||
      'default_workspace';
    const resolvedSchema = cleanBase.schema_id || resolvedId;

    let universalMasterVault = resolveUniversalMasterVaultPath(
      globalConfig.vault_path || cleanBase.master_vault_path || cleanBase.vault_path,
      globalConfig.workspaces,
      cleanBase
    );

    if (typeof parsedPatch.vault_path === 'string' && parsedPatch.vault_path.trim()) {
      universalMasterVault = resolveUniversalMasterVaultPath(
        parsedPatch.vault_path,
        globalConfig.workspaces,
        cleanBase
      );
      const sep =
        universalMasterVault.includes('/') && !universalMasterVault.includes('\\')
          ? '/'
          : '\\';
      parsedPatch.master_vault_path = universalMasterVault;
      parsedPatch.vault_path =
        resolvedSchema &&
        resolvedSchema !== 'default_schema' &&
        resolvedSchema !== 'default_workspace'
          ? `${universalMasterVault}${sep}${resolvedSchema}`
          : universalMasterVault;
    }

    if (typeof parsedPatch.docs_path === 'string') {
      parsedPatch.user_data_path = parsedPatch.docs_path;
    }

    const newConfig = {
      ...cleanBase,
      id: resolvedId,
      name: cleanBase.name || resolvedId,
      schema_id: resolvedSchema,
      ...(universalMasterVault ? { master_vault_path: universalMasterVault } : {}),
      ...parsedPatch,
    };
    setConfig(newConfig);

    let existingList = Array.isArray(globalConfig.workspaces)
      ? [...globalConfig.workspaces]
      : [];
    const matchIdx = existingList.findIndex(
      (w: any) =>
        String(w.id || '').toLowerCase() === String(newConfig.id || '').toLowerCase() ||
        String(w.schema_id || '').toLowerCase() === String(newConfig.schema_id || '').toLowerCase()
    );
    if (matchIdx >= 0) {
      existingList[matchIdx] = newConfig;
    } else {
      existingList.push(newConfig);
    }

    if (universalMasterVault) {
      const sep =
        universalMasterVault.includes('/') && !universalMasterVault.includes('\\')
          ? '/'
          : '\\';
      existingList = existingList.map((w: any) => {
        const wsSchema =
          w.schema_id && w.schema_id !== 'default_schema' ? w.schema_id : w.id;
        return {
          ...w,
          master_vault_path: universalMasterVault,
          vault_path:
            wsSchema && wsSchema !== 'default_workspace'
              ? `${masterVaultWithSep(universalMasterVault, sep, wsSchema)}`
              : universalMasterVault,
        };
      });
    }

    const newGlobal = {
      ...globalConfig,
      active_workspace_id: newConfig.id,
      workspaces: existingList,
      ...(universalMasterVault ? { vault_path: universalMasterVault } : {}),
    };
    setGlobalConfig(newGlobal);

    const storeState = useStore.getState();
    if (typeof newConfig.live_path === 'string') storeState.setLivePath(newConfig.live_path);
    if (typeof newConfig.mods_path === 'string') storeState.setModsPath(newConfig.mods_path);
    if (typeof newConfig.docs_path === 'string') storeState.setDocsPath(newConfig.docs_path);
    if (typeof newConfig.vault_path === 'string') storeState.setVaultPath(newConfig.vault_path);
    // Preserve all cloud Spoke database credentials (supabase_url, supabase_anon_key, icon, etc.) on store.workspaces
    if (Array.isArray(storeState.workspaces) && storeState.workspaces.length > 0) {
      const mergedStoreWorkspaces = storeState.workspaces.map((sw: any) => {
        const localMatch = existingList.find(
          (lw: any) =>
            String(lw?.id || '').toLowerCase() === String(sw?.id || '').toLowerCase() ||
            String(lw?.schema_id || '').toLowerCase() === String(sw?.schema_id || '').toLowerCase()
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
      storeState.setWorkspaces(mergedStoreWorkspaces);
    }
    if (newConfig.mods_path || newConfig.vault_path || newConfig.live_path || newConfig.docs_path) {
      storeState.setIsConfigured(true);
    }

    try {
      if (isDesktop()) {
        await invoke('save_coordinates', { config: newGlobal });
        const savedCoords: any = await invoke('get_saved_coordinates').catch(() => null);
        if (savedCoords?.vault_path) {
          storeState.setVaultPath(savedCoords.vault_path);
          setConfig((prev: any) =>
            prev
              ? {
                  ...prev,
                  vault_path: savedCoords.vault_path,
                  master_vault_path:
                    savedCoords.master_vault_path || universalMasterVault || prev.master_vault_path,
                }
              : prev
          );
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const pickPath = async (rustKey: string, label: string) => {
    if (!config || !globalConfig) return;
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: `${t('select_path', 'Select Directory for')} ${label}`,
      });
      if (selected) {
        await updateConfig(rustKey, selected);
      }
    } catch (err) {
      useStore.getState().pushStatus(String(err), 'error');
    }
  };

  if (config === null) {
    return (
      <div
        className="p-12 font-black animate-pulse capitalize tracking-widest"
        style={{ color: currentTheme.accent }}
      >
        {t('booting', 'Booting core systems...')}
      </div>
    );
  }

  const universalMasterVaultValue = resolveUniversalMasterVaultPath(
    globalConfig?.vault_path || config?.master_vault_path || config?.vault_path,
    globalConfig?.workspaces,
    config
  );

  const gamePathMap = [
    {
      rustKey: 'live_path',
      label: t('game_executable_folder', 'Game Executable Folder'),
      description: t(
        'settings_path_live_desc',
        'Game installation binary folder—used by Quick Launch, patch version detection, and {Backups} engine snapshots.'
      ),
      value: config.live_path,
      icon: t('icon_terminal', 'terminal'),
    },
    {
      rustKey: 'mods_path',
      label: t('library_path', 'Active Library ({Mods} Folder)'),
      description: t(
        'settings_path_mods_desc',
        'Live game {mods} folder where Sanctuary OS deploys your equipped {Blueprint}.'
      ),
      value: config.mods_path,
      icon: t('icon_folder', 'folder'),
    },
    {
      rustKey: 'docs_path',
      label: t('user_data_path_label', 'Game Saves & Logs Folder'),
      description: t(
        'settings_path_docs_desc',
        'Game saves and user-data folder—used by {Backups} for save snapshots, {Lab} save protection & crash logs, and Quick Launch cache cleanup.'
      ),
      value: config.docs_path || config.user_data_path || '',
      icon: t('icon_save', 'save'),
    },
  ];

  let TABS = [
    {
      id: 'CORE',
      icon: t('icon_shield_person', 'shield_person'),
      label: t('settings_tab_account_system', 'Account & System'),
    },
    {
      id: 'VAULT',
      icon: t('icon_inventory_2', 'inventory_2'),
      label: t('settings_tab_vault_blueprints', '{Vault} & {Blueprints}'),
    },
    {
      id: 'ENGINE',
      icon: t('icon_sports_esports', 'sports_esports'),
      label: t('settings_tab_game_backups', 'Game & {Backups}'),
    },
    {
      id: 'AESTHETICS',
      icon: t('icon_palette', 'palette'),
      label: t('settings_tab_appearance_v2', 'Appearance'),
    },
    {
      id: 'NOTIFICATIONS',
      icon: t('icon_notifications', 'notifications'),
      label: t('tab_notifs', 'Notifications'),
    },
    {
      id: 'SUPPORTER',
      icon: t('icon_volunteer_activism', 'volunteer_activism'),
      label: t('tab_supporter', 'Supporter & Perks'),
    },
    {
      id: 'TICKETS',
      icon: t('icon_confirmation_number', 'confirmation_number'),
      label: t('support_tickets', 'Support Tickets'),
    },
  ];

  if (showMalwareTab) {
    TABS.push({
      id: 'MALWARE',
      icon: t('icon_skull', 'skull'),
      label: t('malware_btn', 'Nuclear Override'),
    });
  }

  if (!isDesktop()) {
    TABS = TABS.filter((tab) =>
      ['CORE', 'AESTHETICS', 'NOTIFICATIONS', 'SUPPORTER', 'TICKETS', 'MALWARE'].includes(tab.id)
    );
  }

  const effectiveTab = TABS.some((tab) => tab.id === activeTab) ? activeTab : TABS[0]?.id || 'CORE';

  return (
    <div className="flex flex-col gap-0 pb-32">
      <ViewHeader
        title={t('settings_title', 'System Preferences')}
        breadcrumb={TABS.find((tab) => tab.id === effectiveTab)?.label}
        icon={t('icon_settings', 'settings')}
        subtitle={t(
          'settings_subtitle',
          'Local configuration, identity, libraries, and security processes'
        )}
        onSubtitleClick={() => setHackerClicks((prev) => prev + 1)}
      >
        <ActionPill
          searchQuery={effectiveTab === 'TICKETS' ? ticketSearch : ''}
          setSearchQuery={effectiveTab === 'TICKETS' ? setTicketSearch : () => {}}
          hideSearch={effectiveTab !== 'TICKETS'}
          searchPlaceholder={t('ph_search_tickets', 'Search Tickets...')}
          primaryPopover={
            effectiveTab === 'TICKETS'
              ? {
                  icon: t('icon_tune', 'tune'),
                  label: t('filters', 'Filters'),
                  isActive: ticketScopeFilter !== 'all' || ticketStatusFilter !== 'all',
                  content: (
                    <div className="flex flex-col gap-4 w-[300px] p-2">
                      {hasLoadedSpoke && (
                        <div className="flex flex-col gap-2">
                          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-2">
                            {t('filter_category', 'Filter Category')}
                          </span>
                          <InlineFilterGroup
                            value={ticketScopeFilter}
                            onChange={(v) => setTicketScopeFilter(v as any)}
                            options={[
                              { id: 'all', label: t('filter_all', 'All') },
                              { id: 'spoke', label: activeSpokeName },
                              { id: 'core', label: t('keepers_title', 'Keepers Core') },
                            ]}
                          />
                        </div>
                      )}
                      <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-2">
                          {t('ticket_status', 'Ticket Status')}
                        </span>
                        <InlineFilterGroup
                          value={ticketStatusFilter}
                          onChange={(v) => setTicketStatusFilter(v as any)}
                          options={[
                            { id: 'all', label: t('filter_all', 'All') },
                            { id: 'open', label: t('ticket_status_open', 'Open') },
                            { id: 'pending', label: t('ticket_status_pending', 'Pending') },
                            { id: 'closed', label: t('filter_closed', 'Closed') },
                          ]}
                        />
                      </div>
                    </div>
                  ),
                }
              : undefined
          }
          leftContent={
            effectiveTab !== 'TICKETS' ? (
              <span className="text-[11px] font-semibold tracking-wider text-[var(--subtext)] px-1 whitespace-nowrap">
                {appVersion}
              </span>
            ) : undefined
          }
          rightContent={
            effectiveTab === 'TICKETS' ? (
              <span className="text-[11px] font-semibold tracking-wider text-[var(--subtext)] px-3 whitespace-nowrap">
                {appVersion}
              </span>
            ) : undefined
          }
          actions={
            session?.user?.id
              ? [
                  {
                    id: 'logout',
                    icon: t('icon_logout', 'logout'),
                    label: t('btn_logout', 'Log Out'),
                    onClick: async () => {
                      await supabase.auth.signOut();
                      localStorage.setItem('sanctuary_show_login', 'true');
                      localStorage.removeItem('sanctuary_login_bypassed');
                      useStore.getState().setSession(null);
                      useStore.getState().setView('landing');
                      window.dispatchEvent(new CustomEvent('sanctuary-open-login'));
                    },
                    activeClassName:
                      '!text-[var(--danger)] hover:!bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]',
                  },
                ]
              : [
                  {
                    id: 'login',
                    icon: t('icon_login', 'login'),
                    label: t('btn_sign_in', 'Sign In'),
                    onClick: () => openSanctuaryLogin(),
                  },
                ]
          }
        />
      </ViewHeader>

      {TABS.length > 0 && (
        <div className="flex flex-col w-full gap-3 mb-8 md:mb-10 relative z-10 shrink-0">
          <StatTileCarousel>
            {TABS.map((tab) => (
              <DashboardStatTile
                key={tab.id}
                variant="tab"
                isActive={effectiveTab === tab.id}
                icon={tab.icon}
                label={tab.label}
                onClick={() => setActiveTab(tab.id)}
              />
            ))}
          </StatTileCarousel>
        </div>
      )}

      <div className="flex flex-col gap-4 relative">
        <div className="w-full relative">
          {effectiveTab === 'CORE' && <CoreTab />}
          {effectiveTab === 'VAULT' && (
            <VaultStorageTab
              config={config}
              updateConfig={updateConfig}
              pickPath={pickPath}
              masterVaultPath={universalMasterVaultValue}
              anarchyRules={anarchyRules}
              setAnarchyRules={setAnarchyRules}
            />
          )}
          {effectiveTab === 'ENGINE' && (
            <EngineTab
              config={config}
              updateConfig={updateConfig}
              pickPath={pickPath}
              gamePathMap={gamePathMap}
              activeSpokeName={hasLoadedSpoke ? activeSpokeName : ''}
            />
          )}
          {effectiveTab === 'AESTHETICS' && <AestheticsTab config={config} />}
          {effectiveTab === 'NOTIFICATIONS' && <NotificationsTab />}
          {effectiveTab === 'SUPPORTER' && <SupporterTab />}
          {effectiveTab === 'TICKETS' && (
            <TicketsTab
              searchQuery={ticketSearch}
              ticketStatusFilter={ticketStatusFilter}
              scopeFilter={ticketScopeFilter}
            />
          )}
          {effectiveTab === 'MALWARE' && <MalwareTab />}
        </div>
      </div>
    </div>
  );
}

function masterVaultWithSep(masterVault: string, sep: string, wsSchema: string): string {
  return `${masterVault}${sep}${wsSchema}`;
}
