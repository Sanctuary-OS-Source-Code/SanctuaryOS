import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { open } from "@tauri-apps/plugin-dialog";
import { useTheme } from "./ThemeContext";
import { useLexicon } from "./LexiconContext";
import { ViewHeader, HubTabButton } from "./shared";
import { useStore } from "./store";
import { supabase } from "./supabase";

import SystemTab from './settings-tabs/SystemTab';
import AuthTab from './settings-tabs/AuthTab';
import NetworkTab from './settings-tabs/NetworkTab';
import NotificationsTab from './settings-tabs/NotificationsTab';
import ChameleonTab from './settings-tabs/ChameleonTab';
import LexiconTab from './settings-tabs/LexiconTab';
import LogicTab from './settings-tabs/LogicTab';
import MalwareTab from './settings-tabs/MalwareTab';

export default function Settings({ anarchyRules, setAnarchyRules }: any) {
  const { t } = useLexicon();
  const { currentTheme } = useTheme();

  const [activeTab, setActiveTab] = useState(() => {
    const override = localStorage.getItem("sanctuary_settings_tab");
    if (override) {
      localStorage.removeItem("sanctuary_settings_tab");
      return override;
    }
    return 'SYSTEM';
  });
  const [appVersion, setAppVersion] = useState("v1.0.1");

  useEffect(() => {
    getVersion().then(v => setAppVersion(`v${v}`)).catch(console.error);
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

  const refreshConfig = async () => {
    try {
      const data = await invoke<any>('get_saved_coordinates');
      setConfig(data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { refreshConfig(); }, []);

  const updateConfig = async (key: string, val: any) => {
    const parsedVal = (key === 'engine_agency_level' || key === 'backup_preference' || key === 'defcon_backup_target' || key === 'engine_retention_cycles' || key === 'world_retention_cycles' || key === 'timeline_retention_copies' || key === 'timeline_retention_size_mb') ? parseInt(val) : val;
    const newConfig = { ...config, [key]: parsedVal };
    setConfig(newConfig);
    try {
      await invoke("save_coordinates", {
        livePath: newConfig.live_path || "",
        modsPath: newConfig.mods_path || "",
        vaultPath: newConfig.vault_path || "",
        engineAgencyLevel: newConfig.engine_agency_level != null ? parseInt(newConfig.engine_agency_level) : null,
        defconBackupTarget: newConfig.defcon_backup_target != null ? parseInt(newConfig.defcon_backup_target) : null,
        backupPreference: newConfig.backup_preference != null ? parseInt(newConfig.backup_preference) : null,
        engineRetentionCycles: newConfig.engine_retention_cycles != null ? parseInt(newConfig.engine_retention_cycles) : null,
        worldRetentionCycles: newConfig.world_retention_cycles != null ? parseInt(newConfig.world_retention_cycles) : null,
        vaultCapacityGb: newConfig.vault_capacity_gb != null ? parseInt(newConfig.vault_capacity_gb) : null,
        timelineRetentionCopies: newConfig.timeline_retention_copies != null ? parseInt(newConfig.timeline_retention_copies) : null,
        timelineRetentionSizeMb: newConfig.timeline_retention_size_mb != null ? parseInt(newConfig.timeline_retention_size_mb) : null
      });
    } catch (err) { console.error(err); }
  };

  const pickPath = async (rustKey: string, label: string) => {
    try {
      const selected = await open({ directory: true, multiple: false, title: `${t("select_path")} ${label}` });
      if (selected) {
        const payload = {
          livePath: rustKey === 'live_path' ? selected : config.live_path,
          modsPath: rustKey === 'mods_path' ? selected : config.mods_path,
          vaultPath: rustKey === 'vault_path' ? selected : config.vault_path,
          engineAgencyLevel: config.engine_agency_level != null ? parseInt(config.engine_agency_level) : null,
          defconBackupTarget: config.defcon_backup_target != null ? parseInt(config.defcon_backup_target) : null,
          backupPreference: config.backup_preference != null ? parseInt(config.backup_preference) : null,
          engineRetentionCycles: config.engine_retention_cycles != null ? parseInt(config.engine_retention_cycles) : null,
          worldRetentionCycles: config.world_retention_cycles != null ? parseInt(config.world_retention_cycles) : null,
          vaultCapacityGb: config.vault_capacity_gb != null ? parseInt(config.vault_capacity_gb) : null,
          timelineRetentionCopies: config.timeline_retention_copies != null ? parseInt(config.timeline_retention_copies) : null,
          timelineRetentionSizeMb: config.timeline_retention_size_mb != null ? parseInt(config.timeline_retention_size_mb) : null
        };
        await invoke("save_coordinates", payload);
        await refreshConfig();
      }
    } catch (err) { useStore.getState().pushStatus(String(err), 'error'); }
  };

  if (!config) return <div className="p-12 font-black animate-pulse uppercase tracking-widest" style={{ color: currentTheme.accent }}>{t("booting")}</div>;

  const pathMap = [
    { rustKey: 'vault_path', label: t("vault_path"), value: config.vault_path, icon: t("icon_account_balance") },
    { rustKey: 'mods_path', label: t("library_path"), value: config.mods_path, icon: t("icon_folder") },
    { rustKey: 'live_path', label: t("setup_btn_bin"), value: config.live_path, icon: t("icon_push_pin") }
  ];

  const TABS = [
    { id: 'SYSTEM', icon: t("icon_push_pin"), label: t("tab_system") },
    { id: 'AUTH', icon: t("icon_lock"), label: t("tab_identities") },
    { id: 'NETWORK', icon: t("icon_public"), label: t("settings_tab_network") },
    { id: 'NOTIFICATIONS', icon: t("icon_notifications"), label: t("tab_notifs") },
    { id: 'CHAMELEON', icon: t("icon_palette"), label: t("tab_chameleons") },
    { id: 'LEXICON', icon: t("icon_language"), label: t("tab_lexicons") },
    { id: 'LOGIC', icon: t("icon_flag"), label: t("tab_logic") }
  ];
  if (showMalwareTab) TABS.push({ id: 'MALWARE', icon: t("icon_skull") || "skull", label: t("tab_malware") });

  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-32">
      <ViewHeader 
        title={t("settings_title")} 
        icon="settings" 
        subtitle={t("settings_subtitle")}
        onSubtitleClick={() => setHackerClicks(prev => prev + 1)}
      >
        <button 
          className="px-6 py-2 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] opacity-30 hover:opacity-100 transition-opacity bg-black/20"
        >
          {appVersion}
        </button>
        <button 
          onClick={async () => {
            await supabase.auth.signOut();
            window.location.reload();
          }}
          className="px-4 py-2 mx-1 rounded-xl bg-black/20 theme-glass-inner text-red-500 text-[10px] font-black uppercase tracking-widest transition-all shadow-md hover:theme-border-danger hover:bg-red-500/10 hover:scale-105 active:scale-95 border border-white/5 flex items-center justify-center gap-3 backdrop-blur-md"
        >
          <span className="material-symbols-outlined !text-lg">{t("icon_logout")}</span> {t("btn_logout")}
        </button>
      </ViewHeader>

      <div className="flex flex-col gap-1 w-full">
        <div className="flex items-center overflow-x-auto overflow-y-hidden accent-scrollbar theme-glass-panel rounded-2xl border border-white/5 shadow-inner divide-x divide-white/5 shrink-0">
          {TABS.map(tab => (
            <HubTabButton
              key={tab.id}
              id={tab.id}
              icon={tab.icon}
              label={tab.label}
              activeTab={activeTab}
              setTab={setActiveTab}
            />
          ))}
          <div className="flex-1" />
        </div>
      </div>

      <div className="flex flex-col gap-4 relative">
        <div className="w-full relative">
          {activeTab === 'SYSTEM' && <SystemTab config={config} updateConfig={updateConfig} pickPath={pickPath} pathMap={pathMap} />}
          {activeTab === 'AUTH' && <AuthTab />}
          {activeTab === 'NETWORK' && <NetworkTab />}
          {activeTab === 'NOTIFICATIONS' && <NotificationsTab />}
          {activeTab === 'CHAMELEON' && <ChameleonTab config={config} />}
          {activeTab === 'LEXICON' && <LexiconTab />}
          {activeTab === 'LOGIC' && <LogicTab anarchyRules={anarchyRules} setAnarchyRules={setAnarchyRules} />}
          {activeTab === 'MALWARE' && <MalwareTab />}
        </div>
      </div>
    </div>
  );
}
