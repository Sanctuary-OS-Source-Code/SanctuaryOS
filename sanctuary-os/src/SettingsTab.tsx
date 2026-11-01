import { useState, useEffect } from 'react';
// Force Vite HMR reload
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { open } from "@tauri-apps/plugin-dialog";
import { useTheme } from "./ThemeContext";
import { useLexicon } from "./LexiconContext";
import { ViewHeader, DashboardStatTile, ActionPill, InlineFilterGroup } from './shared';
import { StatTileCarousel } from './hub-components/SharedCommandScreenLayout';
import { useStore } from "./store";
import { supabase, getActiveGameClient } from "./supabase";

import CoreTab from './settings-tabs/CoreTab';
import EngineTab from './settings-tabs/EngineTab';
import ClientTab from './settings-tabs/ClientTab';
import NotificationsTab from './settings-tabs/NotificationsTab';
import AestheticsTab from './settings-tabs/AestheticsTab';
import LogicTab from './settings-tabs/LogicTab';
import MalwareTab from './settings-tabs/MalwareTab';
import SupporterTab from './settings-tabs/SupporterTab';
import TicketsTab from './settings-tabs/TicketsTab';
import { isDesktop } from './utils/envUtils';
import { isRootDomain } from './utils/routingUtils';
import { getKeepersPipelineConfig, isTargetVersionNewer } from './utils/supporterManager';
import packageJson from '../package.json';

export default function Settings({ anarchyRules, setAnarchyRules }: any) {
  const { t } = useLexicon();
  const { currentTheme } = useTheme();

  const [activeTab, setActiveTab] = useState(() => {
    const override = localStorage.getItem("sanctuary_settings_tab");
    if (override) {
      localStorage.removeItem("sanctuary_settings_tab");
      return override;
    }
    return isDesktop() ? 'CORE' : 'CLIENT';
  });
  const [appVersion, setAppVersion] = useState(`v${packageJson.version}`);

  useEffect(() => {
    if (isDesktop()) {
      getVersion().then(v => setAppVersion(`v${v}`)).catch(console.error);
    } else {
      getKeepersPipelineConfig(false)
        .then((cfg) => {
          const remoteVer = (cfg?.stable_version || "").replace(/^v/i, "").trim();
          const localVer = (packageJson.version || "").replace(/^v/i, "").trim();
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
  const [ticketSearch, setTicketSearch] = useState("");
  const [ticketStatusFilter, setTicketStatusFilter] = useState<"all" | "open" | "pending" | "closed">("all");
  const [ticketScopeFilter, setTicketScopeFilter] = useState<"all" | "core" | "spoke">("all");
  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);
  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const availableWorkspaces = useStore((state) => state.workspaces);
  const hasLoadedSpoke = Boolean(
    activeWorkspaceId &&
      activeWorkspaceId !== 'default_workspace' &&
      activeWorkspaceId !== 'web' &&
      !(!isDesktop() && isRootDomain()) &&
      getActiveGameClient()
  );
  const activeWorkspaceObj = Array.isArray(availableWorkspaces)
    ? availableWorkspaces.find((w: any) => w.id === activeWorkspaceId)
    : null;
  const activeSpokeName =
    activeGameSchema?.display_name ||
    activeGameSchema?.name ||
    activeWorkspaceObj?.name ||
    activeWorkspaceId ||
    t("tab_workspace", "Workspace");

  useEffect(() => {
    const handleNav = (e: any) => {
      if (e.detail && e.detail.tab) setActiveTab(e.detail.tab);
    };
    window.addEventListener('navigateSettings', handleNav);
    return () => window.removeEventListener('navigateSettings', handleNav);
  }, []);

  const [config, setConfig] = useState<any>(null);
  const [globalConfig, setGlobalConfig] = useState<any>(null);

  const refreshConfig = async () => {
    try {
      if (!isDesktop()) {
        const dummyConfig = { id: 'web', vault_path: 'web', mods_path: 'web', live_path: 'web' };
        setConfig(dummyConfig);
        setGlobalConfig({ workspaces: [dummyConfig], active_workspace_id: 'web' });
        return;
      }
      const gConf: any = await invoke('get_global_config');
      const storeState = useStore.getState();
      const fallbackWorkspaceId =
        storeState.activeWorkspaceId ||
        localStorage.getItem('sanctuary_last_active_workspace') ||
        'sims4';
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
      if (!activeW) {
        const storeMatch = (storeState.workspaces || []).find(
          (w: any) =>
            String(w.id || '').toLowerCase() === String(activeId || '').toLowerCase() ||
            String(w.schema_id || '').toLowerCase() === String(activeId || '').toLowerCase()
        );
        const masterVault = gConf?.vault_path || '';
        const sep = masterVault.includes('/') ? '/' : '\\';
        const resolvedId = storeMatch?.id || activeId || 'sims4';
        const resolvedSchema = storeMatch?.schema_id || resolvedId;
        activeW = {
          id: resolvedId,
          name:
            storeMatch?.name ||
            (String(resolvedId).toLowerCase() === 'sims4' ? 'The Sims 4' : resolvedId),
          schema_id: resolvedSchema,
          live_path: storeState.livePath || '',
          mods_path: storeState.modsPath || '',
          vault_path:
            storeState.vaultPath ||
            (masterVault ? `${masterVault}${sep}${resolvedSchema}` : ''),
        };
      }
      const normalizedGlobal = {
        ...gConf,
        active_workspace_id: activeW.id || activeId,
        workspaces: Array.isArray(gConf?.workspaces) ? gConf.workspaces : [],
      };
      setGlobalConfig(normalizedGlobal);
      setConfig(activeW);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { refreshConfig(); }, []);

  useEffect(() => {
    if (config?.isGuest && activeTab === 'CORE') {
      setActiveTab('CLIENT');
    }
  }, [config, activeTab]);

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
      'sims4';
    const newConfig = {
      ...cleanBase,
      id: resolvedId,
      name:
        cleanBase.name ||
        (String(resolvedId).toLowerCase() === 'sims4' ? 'The Sims 4' : resolvedId),
      schema_id: cleanBase.schema_id || resolvedId,
      ...parsedPatch,
    };
    setConfig(newConfig);

    const existingList = Array.isArray(globalConfig.workspaces)
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

    const newGlobal = {
      ...globalConfig,
      active_workspace_id: newConfig.id,
      workspaces: existingList,
    };
    if (parsedPatch.vault_path) {
      newGlobal.vault_path = parsedPatch.vault_path;
    }
    setGlobalConfig(newGlobal);

    // Sync Zustand store so paths and configuration state reflect immediately across the OS
    const storeState = useStore.getState();
    if (typeof newConfig.live_path === 'string') storeState.setLivePath(newConfig.live_path);
    if (typeof newConfig.mods_path === 'string') storeState.setModsPath(newConfig.mods_path);
    if (typeof newConfig.vault_path === 'string') storeState.setVaultPath(newConfig.vault_path);
    storeState.setWorkspaces(existingList);
    if (newConfig.mods_path || newConfig.vault_path || newConfig.live_path) {
      storeState.setIsConfigured(true);
    }

    try {
      if (isDesktop()) {
        await invoke("save_coordinates", { config: newGlobal });
      }
    } catch (err) { console.error(err); }
  };

  const pickPath = async (rustKey: string, label: string) => {
    if (!config || !globalConfig) return;
    try {
      const selected = await open({ directory: true, multiple: false, title: `${t("select_path", "Select Directory for")} ${label}` });
      if (selected) {
        await updateConfig(rustKey, selected);
      }
    } catch (err) { useStore.getState().pushStatus(String(err), 'error'); }
  };

  if (config === null) return <div className="p-12 font-black animate-pulse capitalize tracking-widest" style={{ color: currentTheme.accent }}>{t("booting", "Booting core systems...") || "Booting..."}</div>;

  const pathMap = [
    { rustKey: 'vault_path', label: t("vault_path", "The {Vault} Path") || "Vault Path", value: config.vault_path, icon: t("icon_account_balance", "account_balance") || "account_balance" },
    { rustKey: 'mods_path', label: t("library_path", "Active Library ({Mods} Folder)") || "Library Path", value: config.mods_path, icon: t("icon_folder", "folder") || "folder" },
    { rustKey: 'live_path', label: t("setup_btn_bin", "Select Bin Folder") || "Live Path", value: config.live_path, icon: t("icon_push_pin", "push_pin") || "push_pin" }
  ];

  let TABS = [
    { id: 'CORE', icon: t("icon_account_circle", "account_circle") || "account_circle", label: t("tab_core", "Core") || "Core" },
    { id: 'SUPPORTER', icon: t("icon_volunteer_activism", "volunteer_activism") || "volunteer_activism", label: t("tab_supporter", "Supporter & Perks") || "Supporter & Perks" },
    { id: 'TICKETS', icon: t("icon_confirmation_number", "confirmation_number") || "confirmation_number", label: t("support_tickets", "Support Tickets") || "Support Tickets" },
    { id: 'ENGINE', icon: t("icon_history", "history") || "history", label: t("tab_engine", "Engine") || "Engine" },
    { id: 'CLIENT', icon: t("icon_tune", "tune") || "tune", label: t("tab_preferences", "Preferences") || "Preferences" },
    { id: 'NOTIFICATIONS', icon: t("icon_notifications", "notifications") || "notifications", label: t("tab_notifs", "Notifications") || "Notifications" },
    { id: 'AESTHETICS', icon: t("icon_format_paint", "format_paint") || "format_paint", label: t("tab_aesthetics", "Aesthetics") || "Aesthetics" },
    { id: 'LOGIC', icon: t("icon_flag", "flag") || "flag", label: t("tab_logic", "Logic Integrity") || "Logic" }
  ];
  if (showMalwareTab) TABS.push({ id: 'MALWARE', icon: t("icon_skull", "skull") || "skull", label: t("malware_btn", "Nuclear Override") || "Nuclear Override" });

  if (!isDesktop()) {
    TABS = TABS.filter(t => ['CORE', 'SUPPORTER', 'TICKETS', 'CLIENT', 'AESTHETICS', 'NOTIFICATIONS'].includes(t.id));
  } else if (config?.isGuest) {
    TABS = TABS.filter(t => ['SUPPORTER', 'TICKETS', 'CLIENT', 'AESTHETICS', 'NOTIFICATIONS'].includes(t.id));
  }

  return (
    <div className="flex flex-col gap-0 pb-32">
      <ViewHeader
        title={t("settings_title", "System Preferences") || "Settings"}
        breadcrumb={TABS.find(tab => tab.id === activeTab)?.label}
        icon="settings"
        subtitle={t("settings_subtitle", "Local configuration, identity, libraries, and security processes") || "Configure system parameters and workspace preferences."}
        onSubtitleClick={() => setHackerClicks(prev => prev + 1)}
      >
        <ActionPill
          searchQuery={activeTab === 'TICKETS' ? ticketSearch : ""}
          setSearchQuery={activeTab === 'TICKETS' ? setTicketSearch : () => {}}
          hideSearch={activeTab !== 'TICKETS'}
          searchPlaceholder={t("ph_search_tickets", "Search Tickets...") || "Search Tickets..."}
          primaryPopover={
            activeTab === 'TICKETS'
              ? {
                  icon: t("icon_tune", "tune"),
                  label: t("filters", "Filters") || "Filters",
                  content: (
                    <div className="flex flex-col gap-4 w-[300px] p-2">
                      {hasLoadedSpoke && (
                        <div className="flex flex-col gap-2">
                          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-2">
                            {t("filter_category", "Filter Category")}
                          </span>
                          <InlineFilterGroup
                            value={ticketScopeFilter}
                            onChange={(v) => setTicketScopeFilter(v as any)}
                            options={[
                              { id: "all", label: t("filter_all", "All") },
                              { id: "core", label: t("keepers_title", "Keepers Core") },
                              { id: "spoke", label: activeSpokeName },
                            ]}
                          />
                        </div>
                      )}
                      <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-2">
                          {t("ticket_status", "Ticket Status") || "Ticket Status"}
                        </span>
                        <InlineFilterGroup
                          value={ticketStatusFilter}
                          onChange={(v) => setTicketStatusFilter(v as any)}
                          options={[
                            { id: "all", label: t("filter_all", "All") },
                            { id: "open", label: t("ticket_status_open", "Open") },
                            { id: "pending", label: t("ticket_status_pending", "Pending") },
                            { id: "closed", label: t("filter_closed", "Closed") },
                          ]}
                        />
                      </div>
                    </div>
                  ),
                }
              : undefined
          }
          leftContent={
            <span className="text-[11px] font-semibold tracking-wider text-[var(--subtext)] px-1 whitespace-nowrap">
              {appVersion}
            </span>
          }
          actions={[
            {
              id: "logout",
              icon: t("icon_logout", "logout") || "logout",
              label: t("btn_logout", "Log Out") || "Logout",
              onClick: async () => {
                await supabase.auth.signOut();
                localStorage.setItem("sanctuary_show_login", "true");
                localStorage.removeItem("sanctuary_login_bypassed");
                useStore.getState().setSession(null);
                useStore.getState().setView("landing");
                window.dispatchEvent(new CustomEvent("sanctuary-open-login"));
              },
              activeClassName: "!text-[var(--danger)] hover:!bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]",
            },
          ]}
        />
      </ViewHeader>

      {TABS.length > 0 && (
        <div className="flex flex-col w-full gap-3 mb-8 md:mb-10 relative z-10 shrink-0">
          <StatTileCarousel>
            {TABS.map(tab => (
              <DashboardStatTile
                key={tab.id}
                variant="tab"
                isActive={activeTab === tab.id}
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
          {activeTab === 'CORE' && <CoreTab config={config} updateConfig={updateConfig} pickPath={pickPath} pathMap={pathMap} />}
          {activeTab === 'SUPPORTER' && <SupporterTab />}
          {activeTab === 'TICKETS' && <TicketsTab searchQuery={ticketSearch} ticketStatusFilter={ticketStatusFilter} scopeFilter={ticketScopeFilter} />}
          {activeTab === 'ENGINE' && <EngineTab config={config} updateConfig={updateConfig} />}
          {activeTab === 'CLIENT' && <ClientTab config={config} updateConfig={updateConfig} />}
          {activeTab === 'NOTIFICATIONS' && <NotificationsTab />}
          {activeTab === 'AESTHETICS' && <AestheticsTab config={config} />}
          {activeTab === 'LOGIC' && <LogicTab anarchyRules={anarchyRules} setAnarchyRules={setAnarchyRules} />}
          {activeTab === 'MALWARE' && <MalwareTab />}
        </div>
      </div>
    </div>
  );
}
