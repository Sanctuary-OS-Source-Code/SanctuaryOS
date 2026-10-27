import { useState, useEffect } from 'react';
// Force Vite HMR reload
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { open } from "@tauri-apps/plugin-dialog";
import { useTheme } from "./ThemeContext";
import { useLexicon } from "./LexiconContext";
import { ViewHeader, DashboardStatTile, ActionPill } from './shared';
import { StatTileCarousel } from './hub-components/SharedCommandScreenLayout';
import { useStore } from "./store";
import { supabase } from "./supabase";

import CoreTab from './settings-tabs/CoreTab';
import EngineTab from './settings-tabs/EngineTab';
import ClientTab from './settings-tabs/ClientTab';
import NotificationsTab from './settings-tabs/NotificationsTab';
import AestheticsTab from './settings-tabs/AestheticsTab';
import LogicTab from './settings-tabs/LogicTab';
import MalwareTab from './settings-tabs/MalwareTab';
import SupporterTab from './settings-tabs/SupporterTab';
import { isDesktop } from './utils/envUtils';
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
      setGlobalConfig(gConf);
      const activeId = gConf.active_workspace_id;
      let activeW = gConf.workspaces?.find((w: any) => w.id === activeId);
      if (!activeW && gConf.workspaces?.length > 0) activeW = gConf.workspaces[0];
      setConfig(activeW || { isGuest: true });
    } catch (err) { console.error(err); }
  };

  useEffect(() => { refreshConfig(); }, []);

  useEffect(() => {
    if (config?.isGuest && activeTab === 'CORE') {
      setActiveTab('CLIENT');
    }
  }, [config, activeTab]);

  const updateConfig = async (key: string, val: any) => {
    if (!config || !globalConfig) return;
    const parsedVal = (key === 'vault_capacity_gb' || key === 'engine_agency_level' || key === 'backup_preference' || key === 'defcon_backup_target' || key === 'engine_retention_cycles' || key === 'world_retention_cycles' || key === 'timeline_retention_copies' || key === 'timeline_retention_size_mb') ? parseInt(val) : val;
    
    const newConfig = { ...config, [key]: parsedVal };
    setConfig(newConfig);
    
    const newGlobal = { ...globalConfig };
    newGlobal.workspaces = newGlobal.workspaces.map((w: any) => w.id === newConfig.id ? newConfig : w);
    setGlobalConfig(newGlobal);

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
        const newConfig = { ...config, [rustKey]: selected };
        setConfig(newConfig);
        
        const newGlobal = { ...globalConfig };
        newGlobal.workspaces = newGlobal.workspaces.map((w: any) => w.id === newConfig.id ? newConfig : w);
        if (rustKey === 'vault_path') {
          newGlobal.vault_path = selected;
        }
        setGlobalConfig(newGlobal);
        
        if (isDesktop()) {
          await invoke("save_coordinates", { config: newGlobal });
        }
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
    { id: 'ENGINE', icon: t("icon_history", "history") || "history", label: t("tab_engine", "Engine") || "Engine" },
    { id: 'CLIENT', icon: t("icon_tune", "tune") || "tune", label: t("tab_preferences", "Preferences") || "Preferences" },
    { id: 'NOTIFICATIONS', icon: t("icon_notifications", "notifications") || "notifications", label: t("tab_notifs", "Notifications") || "Notifications" },
    { id: 'AESTHETICS', icon: t("icon_format_paint", "format_paint") || "format_paint", label: t("tab_aesthetics", "Aesthetics") || "Aesthetics" },
    { id: 'LOGIC', icon: t("icon_flag", "flag") || "flag", label: t("tab_logic", "Logic Integrity") || "Logic" }
  ];
  if (showMalwareTab) TABS.push({ id: 'MALWARE', icon: t("icon_skull", "skull") || "skull", label: t("malware_btn", "Configure Malware Process") || "Nuclear Override" });

  if (!isDesktop()) {
    TABS = TABS.filter(t => ['CORE', 'SUPPORTER', 'CLIENT', 'AESTHETICS', 'NOTIFICATIONS'].includes(t.id));
  } else if (config?.isGuest) {
    TABS = TABS.filter(t => ['SUPPORTER', 'CLIENT', 'AESTHETICS', 'NOTIFICATIONS'].includes(t.id));
  }

  return (
    <div className="flex flex-col gap-0 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-32">
      <ViewHeader
        title={t("settings_title", "System Preferences") || "Settings"}
        breadcrumb={TABS.find(tab => tab.id === activeTab)?.label}
        icon="settings"
        subtitle={t("settings_subtitle", "Local configuration, identity, libraries, and security processes") || "Configure system parameters and workspace preferences."}
        onSubtitleClick={() => setHackerClicks(prev => prev + 1)}
      >
        <ActionPill
          searchQuery=""
          setSearchQuery={() => {}}
          hideSearch={true}
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
        <div className="flex flex-col w-full gap-3 mb-8 md:mb-10 relative z-10 animate-in slide-in-from-top-4 duration-500 shrink-0">
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
