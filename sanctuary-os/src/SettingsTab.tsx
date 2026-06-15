import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { useTheme } from "./ThemeContext";
import { useLexicon } from "./LexiconContext";
import { supabase } from "./supabase";
import { ViewHeader, SidePanel, HubTabButton } from "./shared";
import { useStore } from "./store";

const HexToRGB = (hex: string) => {
  const cleanHex = (hex || '#000000').replace('#', '').padEnd(6, '0').slice(0, 6);
  const r = parseInt(cleanHex.slice(0, 2), 16) || 0;
  const g = parseInt(cleanHex.slice(2, 4), 16) || 0;
  const b = parseInt(cleanHex.slice(4, 6), 16) || 0;
  return { r, g, b };
}

const RGBToHex = (r: number, g: number, b: number) => {
  return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1).toUpperCase()}`;
}

function CustomSettingsDropdown({ value, options, onChange }: any) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = options.find((o: any) => o.id == value) || options[0];
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="relative w-full z-10">
      <button ref={btnRef} onClick={() => setIsOpen(!isOpen)} className="w-full p-5 rounded-3xl theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] outline-none transition-all shadow-xl flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-[var(--text)] focus:theme-border-accent group hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] hover:shadow-2xl hover:scale-[1.02] active:scale-95 backdrop-blur-3xl relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
        <span className="relative z-10">{selected?.label}</span>
        <span className="text-[var(--subtext)] opacity-60 text-[10px] group-hover:text-[var(--text)] group-hover:theme-text-accent transition-colors relative z-10 material-symbols-outlined !text-[18px]">{isOpen ? 'expand_less' : 'expand_more'}</span>
      </button>
      {isOpen && createPortal(
        <>
          <div className="fixed inset-0 z-[50000]" onClick={() => setIsOpen(false)} />
          <div className="fixed mt-3 theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden z-[50001] animate-in fade-in zoom-in-95 slide-in-from-top-2 backdrop-blur-3xl"
               style={{
                 top: btnRef.current?.getBoundingClientRect().bottom,
                 left: btnRef.current?.getBoundingClientRect().left,
                 width: btnRef.current?.getBoundingClientRect().width,
               }}
          >
            {options.map((opt: any) => (
              <button key={opt.id} onClick={() => { onChange(opt.id); setIsOpen(false); }} className={`w-full text-left px-5 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] last:border-0 flex items-center justify-between group/opt hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:pl-7 ${opt.id === value ? 'theme-text-accent bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]' : 'text-[var(--text)]'}`}>
                {opt.label}
                {opt.id === value && <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">check</span>}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

const TabContainer = ({ title, icon, actions, children }: any) => (
  <div className="flex flex-col gap-12 animate-in slide-in-from-right-8 duration-500 w-full max-w-7xl theme-glass-panel p-10 rounded-[3rem] shadow-2xl backdrop-blur-3xl border border-white/5 relative overflow-hidden">
    <div className="absolute top-0 right-0 w-96 h-96 bg-[var(--accent)] opacity-[0.02] blur-[100px] pointer-events-none rounded-full" />
    <div className="flex justify-between items-end border-b border-white/10 pb-8 relative z-10">
       <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-white/20 to-transparent" />
       <h2 className="text-2xl font-black text-[var(--text)] uppercase tracking-widest flex items-center gap-4 drop-shadow-lg">
         {icon && <span className="material-symbols-outlined !text-4xl opacity-50 theme-text-accent">{icon}</span>}
         {title}
       </h2>
       {actions && <div className="flex gap-3 relative z-10">{actions}</div>}
    </div>
    <div className="flex flex-col gap-10 w-full relative z-10">
       {children}
    </div>
  </div>
);

export default function Settings({ anarchyRules, setAnarchyRules }: any) {
  const { t, registry, activeLang, setActiveLang, importLexicon, deleteLexicon } = useLexicon();
  const { currentTheme, activeThemeId, setActiveThemeId, CORE_THEMES, customThemes, updateActiveTheme, renameTheme, createNewTheme, importTheme, deleteTheme } = useTheme();
  const { session } = useStore();
  const showImages = useStore((state) => state.showImages);
  const setShowImages = useStore((state) => state.setShowImages);
  
  const [activeTab, setActiveTab] = useState('SYSTEM');
  const [hackerClicks, setHackerClicks] = useState(0);
  const showMalwareTab = hackerClicks >= 5;
  
  const [config, setConfig] = useState<any>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  
  // Auth & Notifs
  const [localOnly, setLocalOnly] = useState(localStorage.getItem("sanctuary_local_only") === "true");
  const [notifyReplies, setNotifyReplies] = useState(localStorage.getItem("sanctuary_notify_replies") !== "false");
  const [notifyNewPosts, setNotifyNewPosts] = useState(localStorage.getItem("sanctuary_notify_new_posts") !== "false");
  const [notifySupport, setNotifySupport] = useState(localStorage.getItem("sanctuary_notify_support") !== "false");
  const [notifyAuthorOnly, setNotifyAuthorOnly] = useState(localStorage.getItem("sanctuary_notify_author_only") === "true");
  
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Malware
  const [showMalwareOverride, setShowMalwareOverride] = useState(false);
  const [malwareToggleActive, setMalwareToggleActive] = useState(false);
  const [overrideInput, setOverrideInput] = useState("");

  // Mason
  const [showMasonPanel, setShowMasonPanel] = useState(false);
  const [followedMasons, setFollowedMasons] = useState<any[]>([]);
  const [masonAlerts, setMasonAlerts] = useState<Record<string, boolean>>(() => JSON.parse(localStorage.getItem("sanctuary_mason_alerts") || "{}"));

  // Lexicon 
  const setView = useStore(state => state.setView);
  const setMarketTab = useStore(state => state.setMarketTab);
  const [lexiconSearch, setLexiconSearch] = useState("");
  const [selectedLibraryLang, setSelectedLibraryLang] = useState<string | null>(null);
  const [favoriteLexicons, setFavoriteLexicons] = useState<string[]>(() => JSON.parse(localStorage.getItem("sanctuary_favorite_lexicons") || '["en-sanctuary", "en-default", "de-default"]'));
  const [dbLanguages, setDbLanguages] = useState<Record<string, string>>({});
  
  // Theme
  const [editingThemeId, setEditingThemeId] = useState<string | null>(null);
  const [newThemeName, setNewThemeName] = useState("");
  const [activeColorPicker, setActiveColorPicker] = useState<string | null>(null);
  const colorPickerRefs = useRef<any>({});
  const [favColors, setFavColors] = useState<string[]>(() => JSON.parse(localStorage.getItem("sanctuary_fav_colors") || '[]'));
  
  const PRESET_COLORS = [
    '#000000', '#1a1a1a', '#2a2a2a', '#3a3a3a', '#555555', '#888888',
    '#f5f5f5', '#e0e0e0', '#cccccc', '#ffffff', '#ffcc00', '#4cd964',
    '#5ac8fa', '#007aff', '#5856d6', '#ff2d55', '#ff3b30', '#ff9500', 
    '#ff4444', '#00c851', '#33b5e5', '#ffbb33', '#00ffff', '#ff00ff'
  ];
  const themeKeys =['bg', 'sidebar', 'sidebartext', 'accent', 'text', 'subtext', 'success', 'warning', 'danger'];

  useEffect(() => {
    async function fetchLanguages() {
      try {
        const { data } = await supabase.from('marketplace_assets').select('name, language').eq('asset_type', 'lexicon');
        if (data) {
          const map = data.reduce((acc: any, curr: any) => {
            if (curr.name && curr.language) acc[curr.name] = curr.language;
            return acc;
          }, {});
          setDbLanguages(map);
        }
      } catch (e) {}
    }
    fetchLanguages();
  }, []);

  const getLexiconMetadata = (code: string) => {
    if (code === 'en-sanctuary') return { language: 'English', name: t("settings_lang_sanctuary")?.split(': ')[1] || 'Sanctuary' };
    if (code === 'en-default') return { language: 'English', name: t("settings_lang_standard")?.split(': ')[1] || 'Default' };
    if (code === 'de-default') return { language: 'German', name: t("settings_lang_german")?.split(': ')[1] || 'Default' };
    return { language: registry?.[code]?._meta_language || dbLanguages[code] || 'Custom', name: code };
  };

  const allLexiconCodes = Array.from(new Set(['en-sanctuary', 'en-default', 'de-default', ...Object.keys(registry || {})]));
  const uniqueLanguages = Array.from(new Set(allLexiconCodes.map(code => getLexiconMetadata(code).language)));

  const toggleFavoriteLexicon = (code: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    let updated;
    if (favoriteLexicons.includes(code)) {
      updated = favoriteLexicons.filter((c: string) => c !== code);
    } else {
      updated = [...favoriteLexicons, code];
    }
    setFavoriteLexicons(updated);
    localStorage.setItem("sanctuary_favorite_lexicons", JSON.stringify(updated));
  };
  
  const toggleFavColor = (color: string) => {
    let updated;
    if (favColors.includes(color)) updated = favColors.filter(c => c !== color);
    else updated = [...favColors, color].slice(-12);
    setFavColors(updated);
    localStorage.setItem("sanctuary_fav_colors", JSON.stringify(updated));
  };

  const handleExportTheme = async (e: React.MouseEvent, themeObj: any) => {
    e.stopPropagation();
    try {
      const defaultPath = config.vault_path ? `${config.vault_path}\\Data\\Themes\\${themeObj.name}.json` : `${themeObj.name}.json`;
      const path = await save({ defaultPath, filters: [{ name: 'JSON', extensions: ['json'] }] });
      if (path) await writeTextFile(path, JSON.stringify(themeObj, null, 2));
    } catch (err) { alert(`${t("alert_export_failed")}${err}`); }
  };

  const handleImportTheme = async () => {
    try {
      const selected = await open({ filters:[{ name: 'Theme', extensions: ['json'] }] });
      if (!selected) return;
      const content = await readTextFile(selected as string);
      importTheme(JSON.parse(content));
    } catch (err) { alert(`${t("alert_import_failed")}${err}`); }
  };

  const handleImportLexicon = async () => {
    try {
      const selected = await open({ filters:[{ name: 'Lexicon', extensions: ['json'] }] });
      if (!selected) return;
      const content = await readTextFile(selected as string);
      const langCode = prompt(t("prompt_lang_code")) || "custom";
      importLexicon(JSON.parse(content), langCode);
    } catch (err) { alert(`${t("alert_lexicon_failed")}${err}`); }
  };

  const toggleMasonAlert = (id: string) => {
    const newVal = { ...masonAlerts, [id]: !masonAlerts[id] };
    setMasonAlerts(newVal);
    localStorage.setItem("sanctuary_mason_alerts", JSON.stringify(newVal));
  };

  useEffect(() => {
    async function fetchFollows() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;
      const { data } = await supabase.from('mason_followers').select('masons(id, name, profile_id)').eq('user_id', session.user.id);
      if (data) {
        setFollowedMasons(data.map((row: any) => ({
          id: row.masons.id,
          name: row.masons.name,
          handle: `@${row.masons.profile_id || 'unknown'}`
        })));
      }
    }
    if (showMasonPanel) fetchFollows();
  }, [showMasonPanel]);

  const toggleLocalOnly = () => {
    const newVal = !localOnly;
    setLocalOnly(newVal);
    localStorage.setItem("sanctuary_local_only", newVal.toString());
  };
  
  const toggleNotifyReplies = () => {
    const newVal = !notifyReplies;
    setNotifyReplies(newVal);
    localStorage.setItem("sanctuary_notify_replies", newVal.toString());
  };

  const toggleNotifyNewPosts = () => {
    const newVal = !notifyNewPosts;
    setNotifyNewPosts(newVal);
    localStorage.setItem("sanctuary_notify_new_posts", newVal.toString());
  };

  const toggleNotifySupport = () => {
    const newVal = !notifySupport;
    setNotifySupport(newVal);
    localStorage.setItem("sanctuary_notify_support", newVal.toString());
  };

  const toggleNotifyAuthorOnly = () => {
    const newVal = !notifyAuthorOnly;
    setNotifyAuthorOnly(newVal);
    localStorage.setItem("sanctuary_notify_author_only", newVal.toString());
  };

  const updateAuth = async (type: 'email' | 'password') => {
    setAuthLoading(true);
    try {
      if (type === 'email' && emailInput) {
        const { error } = await supabase.auth.updateUser({ email: emailInput });
        if (error) throw error;
        alert("Email update initiated. Check your inboxes for confirmation links.");
        setEmailInput("");
      }
      if (type === 'password' && passwordInput) {
        const { error } = await supabase.auth.updateUser({ password: passwordInput });
        if (error) throw error;
        alert("Password updated successfully.");
        setPasswordInput("");
      }
    } catch (err: any) {
      alert(`Error updating credentials: ${err.message}`);
    }
    setAuthLoading(false);
  };

  const executeOverride = async () => {
    if (overrideInput.toLowerCase() !== t("settings_malware_confirm_text").toLowerCase()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        let hwid = "UNKNOWN_HWID";
        try {
          hwid = await invoke<string>("get_hardware_id");
        } catch (e) {
          console.error("Failed to get HWID from Tauri", e);
        }
        
        const { data, error } = await supabase.from('profiles').update({ is_banned: true, hardware_id: hwid }).eq('id', user.id).select();
        if (error || !data || data.length === 0) {
          console.error("Database ban update failed! Supabase Row Level Security (RLS) policies likely blocked the update, or an error occurred.");
          console.error("Error payload:", error);
          console.error("Rows updated:", data?.length || 0);
          console.error("Aborting local lockdown so you can inspect the above errors.");
          return;
        }
    }
    localStorage.setItem("sanctuary_blacklisted", "true");
    await supabase.auth.signOut();
    alert(t("settings_malware_severed_alert"));
    window.location.reload();
  };

  const rules = anarchyRules || { highlander: true, family: true, dependencies: true, intercept: true };
  const toggleRule = (key: string) => {
    if (setAnarchyRules) setAnarchyRules({ ...rules, [key]: !rules[key as keyof typeof rules] });
  };

  const refreshConfig = async () => {
    try {
      const data = await invoke<any>('get_saved_coordinates');
      setConfig(data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { refreshConfig(); },[]);

  const updateConfig = async (key: string, val: any) => {
    const parsedVal = (key === 'engine_agency_level' || key === 'backup_preference' || key === 'defcon_backup_target' || key === 'engine_retention_cycles' || key === 'world_retention_cycles') ? parseInt(val) : val;
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
        vaultCapacityGb: newConfig.vault_capacity_gb != null ? parseInt(newConfig.vault_capacity_gb) : null
      });
    } catch (err) { console.error(err); }
  };

  const pickPath = async (rustKey: string, label: string) => {
    try {
      const selected = await open({ directory: true, multiple: false, title: `${t("modal_select_path")} ${label}` });
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
          vaultCapacityGb: config.vault_capacity_gb != null ? parseInt(config.vault_capacity_gb) : null
        };
        await invoke("save_coordinates", payload);
        await refreshConfig();
      }
    } catch (err) { alert(err); }
  };

  if (!config) return <div className="p-12 font-black animate-pulse uppercase tracking-widest" style={{ color: currentTheme.accent }}>{t("settings_booting")}</div>;

  const pathMap =[
    { rustKey: 'vault_path', label: t("settings_vault_path"), value: config.vault_path, icon: t("ui_icon_collection") || "inventory_2" },
    { rustKey: 'mods_path', label: t("settings_library_path"), value: config.mods_path, icon: t("ui_icon_folder") || "folder" },
    { rustKey: 'live_path', label: t("setup_btn_bin"), value: config.live_path, icon: t("ui_icon_pin") || "push_pin" }
  ];

  const TABS = [
    { id: 'SYSTEM', icon: t("ui_icon_pin") || "push_pin", label: t("settings_tab_system") },
    { id: 'AUTH', icon: t("ui_icon_lock") || "lock", label: t("settings_tab_auth") },
    { id: 'NETWORK', icon: t("ui_icon_globe") || "public", label: t("settings_tab_network") },
    { id: 'NOTIFICATIONS', icon: t("ui_icon_notifications") || "notifications", label: t("settings_tab_notifs") },
    { id: 'CHAMELEON', icon: t("ui_icon_theme") || "palette", label: t("settings_tab_chameleon") },
    { id: 'LEXICON', icon: t("ui_icon_language") || "translate", label: t("settings_tab_lexicon") },
    { id: 'LOGIC', icon: t("ui_icon_flag") || "flag", label: t("settings_tab_logic") }
  ];
  if (showMalwareTab) {
    TABS.push({ id: 'MALWARE', icon: t("ui_icon_warning") || "warning", label: t("settings_tab_malware") || "MALWARE" });
  }

  const standardButtonClass = "px-6 py-3 rounded-xl theme-glass-panel text-[var(--text)] text-[10px] font-black uppercase tracking-widest transition-all shadow-[inset_0_0_20px_rgba(255,255,255,0.02),0_4px_15px_rgba(0,0,0,0.2)] hover:shadow-[inset_0_0_20px_rgba(var(--accent-rgb),0.1),0_4px_15px_rgba(var(--accent-rgb),0.2)] hover:border-[var(--accent)]/50 hover:scale-105 active:scale-95 border border-white/5 flex items-center justify-center gap-2";

  return (
    <div className="flex flex-col h-full w-full p-8 gap-8 animate-in fade-in duration-500 overflow-y-auto custom-scrollbar pb-[30rem]" style={{ color: currentTheme.text }}>
      
      {/* FULL WIDTH HEADER */}
      <ViewHeader 
        title={t("settings_title")} 
        subtitle={<span className="cursor-default" onClick={() => setHackerClicks(prev => prev + 1)}>{t("settings_subtitle")}</span>} 
        icon="settings" 
        iconColorClass="text-slate-400 border-slate-500/30" 
      >
        <button 
          onClick={async () => {
            await supabase.auth.signOut();
            window.location.reload();
          }} 
          className="px-4 py-2 mx-1 rounded-xl bg-black/20 theme-glass-inner text-red-500 text-[10px] font-black uppercase tracking-widest transition-all shadow-md hover:theme-border-danger hover:bg-red-500/10 hover:scale-105 active:scale-95 border border-white/5 flex items-center justify-center gap-3 backdrop-blur-md"
        >
          <span className="material-symbols-outlined !text-lg">logout</span> {t("settings_btn_logout") || "LOGOUT"}
        </button>
      </ViewHeader>

      {/* HORIZONTAL NAV BAR */}
      <div className="flex flex-col gap-1 w-full mt-2">
        <div className="flex items-center gap-1 overflow-x-auto accent-scrollbar p-1 theme-glass-panel rounded-2xl border border-white/5 shadow-inner">
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
          <div className="flex-1" /> {/* Spacer */}
        </div>
      </div>

      <div className="flex flex-1 gap-16 mt-2 relative">
        {/* ACTIVE TAB CONTENT - UNBOXED BUT GLASSY */}
        <div className="flex-1 relative pr-6">
           
           {activeTab === 'SYSTEM' && (
             <div className="flex flex-col gap-8 w-full">
               <TabContainer 
                  title={t("settings_sys_coords")}
                  icon={TABS.find(t=>t.id==='SYSTEM')?.icon}
                  actions={
                    <button onClick={async () => {
                      try {
                        const detected: any = await invoke("auto_detect_paths");
                        if (detected.live_path) updateConfig('live_path', detected.live_path);
                        if (detected.mods_path) updateConfig('mods_path', detected.mods_path);
                        if (detected.vault_path) updateConfig('vault_path', detected.vault_path);
                      } catch (err) { alert(err); }
                    }} className="px-6 py-3 rounded-2xl theme-glass-inner text-[var(--text)] text-[10px] font-black uppercase tracking-widest transition-all shadow-lg hover:theme-border-accent hover:scale-105 active:scale-95 border border-white/10 backdrop-blur-xl flex items-center gap-3 hover:bg-white/5">
                      <span className="material-symbols-outlined !text-lg text-[var(--accent)] drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]">troubleshoot</span>
                      {t("settings_auto_detect")}
                    </button>
                  }
               >
                 <div className="grid gap-6">
                 {pathMap.map(dir => {
                   const isHovered = hoveredKey === dir.rustKey;
                   return (
                     <div key={dir.rustKey} className="group relative" onMouseEnter={() => setHoveredKey(dir.rustKey)} onMouseLeave={() => setHoveredKey(null)}>
                       <label className="block text-[10px] font-black uppercase tracking-[0.2em] mb-3 ml-2 text-[var(--subtext)] opacity-70 transition-colors group-hover:theme-text-accent">{dir.label}</label>
                       <div onClick={() => pickPath(dir.rustKey, dir.label)} className="relative flex items-center cursor-pointer group/input hover:scale-[1.01] transition-transform">
                         <input 
                           readOnly value={dir.value || ""} 
                           style={{ paddingLeft: isHovered ? '4.5rem' : '1.5rem' }}
                           className={`w-full py-6 pr-32 rounded-3xl border text-[10px] font-black uppercase tracking-widest text-[var(--text)] shadow-inner transition-all duration-500 pointer-events-none outline-none backdrop-blur-xl group-hover/input:border-[color-mix(in_srgb,var(--text)_20%,transparent)] ${isHovered ? 'theme-border-accent theme-glass-inner' : 'theme-glass-inner'}`} 
                           placeholder={t("settings_path_not_set")}
                         />
                         <div className="absolute right-3 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all duration-300 theme-glass-inner border border-white/20 hover:scale-105 active:scale-95 flex items-center gap-2 shadow-lg hover:theme-border-accent bg-black/40 text-[var(--text)]">
                            <span className="material-symbols-outlined !text-sm text-[var(--accent)]">"sync"</span>
                            {t("settings_btn_calibrate")}
                          </div>
                         <div className="absolute left-[-2.5rem] text-xl opacity-0 group-hover:opacity-100 group-hover:left-6 transition-all duration-500 text-[var(--text)]"><span className="material-symbols-outlined">{dir.icon}</span></div>
                       </div>
                     </div>
                   );
                 })}
                 </div>
               </TabContainer>

               <TabContainer 
                  title={t("settings_time_capsule") || "Time Capsule"}
                  icon="history"
               >
                 <div className="grid grid-cols-1 xl:grid-cols-2 gap-12">
                  <div className="flex flex-col gap-8">
                    <div className="group">
                      <label className="block text-[10px] font-black uppercase tracking-[0.2em] mb-3 ml-4 text-[var(--subtext)] opacity-70 group-hover:text-[var(--text)] group-hover:theme-text-accent transition-colors">{t("settings_engine_agency")}</label>
                      <CustomSettingsDropdown 
                        value={config.engine_agency_level || 0} 
                        onChange={(val: any) => updateConfig('engine_agency_level', val)}
                        options={[
                          { id: 0, label: t("settings_agency_none") },
                          { id: 1, label: t("settings_agency_basic") },
                          { id: 2, label: t("settings_agency_adv") }
                        ]} 
                      />
                    </div>
                    <div className="group">
                      <label className="block text-[10px] font-black uppercase tracking-[0.2em] mb-3 ml-4 text-[var(--subtext)] opacity-70 group-hover:text-[var(--text)] group-hover:theme-text-accent transition-colors">{t("settings_engine_retention")}</label>
                      <CustomSettingsDropdown 
                        value={config.engine_retention_cycles || 5} 
                        onChange={(val: any) => updateConfig('engine_retention_cycles', val)}
                        options={[
                          { id: 1, label: t("settings_keep_1") || "Keep Last 1" },
                          { id: 3, label: t("settings_keep_3") || "Keep Last 3" },
                          { id: 5, label: t("settings_keep_5") || "Keep Last 5" },
                          { id: 10, label: t("settings_keep_10") || "Keep Last 10" },
                          { id: 999, label: t("settings_keep_all") || "Keep All" }
                        ]} 
                      />
                    </div>
                    <div className="group">
                      <label className="block text-[10px] font-black uppercase tracking-[0.2em] mb-3 ml-4 text-[var(--subtext)] opacity-70 group-hover:text-[var(--text)] group-hover:theme-text-accent transition-colors">{t("settings_vault_capacity") || "Vault Max Capacity"}</label>
                      <CustomSettingsDropdown 
                        value={config.vault_capacity_gb || 0} 
                        onChange={(val: any) => updateConfig('vault_capacity_gb', val)}
                        options={[
                          { id: 0, label: t("settings_capacity_unlimited") || "Unlimited" },
                          { id: 10, label: t("settings_capacity_10") || "10 GB" },
                          { id: 25, label: t("settings_capacity_25") || "25 GB" },
                          { id: 50, label: t("settings_capacity_50") || "50 GB" },
                          { id: 100, label: t("settings_capacity_100") || "100 GB" }
                        ]} 
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-8">
                    <div className="group">
                      <label className="block text-[10px] font-black uppercase tracking-[0.2em] mb-3 ml-4 text-[var(--subtext)] opacity-70 group-hover:text-[var(--text)] group-hover:theme-text-accent transition-colors">{t("settings_defcon_target")}</label>
                      <CustomSettingsDropdown 
                        value={config.defcon_backup_target || 0} 
                        onChange={(val: any) => updateConfig('defcon_backup_target', val)}
                        options={[
                          { id: 0, label: t("settings_target_both") },
                          { id: 1, label: t("settings_target_world") },
                          { id: 2, label: t("settings_target_engine") }
                        ]} 
                      />
                    </div>
                    <div className="group">
                      <label className="block text-[10px] font-black uppercase tracking-[0.2em] mb-3 ml-4 text-[var(--subtext)] opacity-70 group-hover:text-[var(--text)] group-hover:theme-text-accent transition-colors">{t("settings_world_retention")}</label>
                      <CustomSettingsDropdown 
                        value={config.world_retention_cycles || 5} 
                        onChange={(val: any) => updateConfig('world_retention_cycles', val)}
                        options={[
                          { id: 1, label: t("settings_keep_1") || "Keep Last 1" },
                          { id: 3, label: t("settings_keep_3") || "Keep Last 3" },
                          { id: 5, label: t("settings_keep_5") || "Keep Last 5" },
                          { id: 10, label: t("settings_keep_10") || "Keep Last 10" },
                          { id: 999, label: t("settings_keep_all") || "Keep All" }
                        ]} 
                      />
                    </div>
                  </div>
                 </div>
               </TabContainer>
             </div>
           )}

           {activeTab === 'AUTH' && (
             <TabContainer title={t("settings_auth_title")} icon={TABS.find(t=>t.id==='AUTH')?.icon}>
                <div className="grid xl:grid-cols-2 gap-12">
                 <div className="flex flex-col gap-8">
                   {session?.user?.id && (
                     <div className="flex flex-col gap-3 group">
                       <label className="text-[10px] font-black uppercase tracking-[0.2em] ml-2 text-[var(--subtext)] opacity-70 group-hover:text-[var(--text)] transition-colors">{t("settings_auth_user_id")}</label>
                       <div className="flex gap-2">
                         <input 
                           type="text" 
                           readOnly
                           value={session.user.id}
                           className="flex-1 theme-glass-inner rounded-2xl px-5 py-5 text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 outline-none shadow-inner select-all"
                         />
                       </div>
                     </div>
                   )}
                   <div className="flex flex-col gap-3 group">
                     <label className="text-[10px] font-black uppercase tracking-[0.2em] ml-2 text-[var(--subtext)] opacity-70 group-hover:text-[var(--text)] transition-colors">{t("settings_auth_email")}</label>
                     <div className="flex gap-2">
                       <input 
                         type="email" 
                         value={emailInput}
                         onChange={e => setEmailInput(e.target.value)}
                         placeholder="mason@sanctuary.network"
                         className="flex-1 theme-glass-inner rounded-2xl px-5 py-5 text-[10px] font-black uppercase tracking-widest text-[var(--text)] outline-none focus:theme-border-accent focus:bg-black/40 transition-all shadow-inner"
                       />
                       <button 
                         onClick={() => updateAuth('email')}
                         disabled={authLoading || !emailInput}
                         className={standardButtonClass}
                       >
                         {t("settings_btn_update")}
                       </button>
                     </div>
                   </div>

                   <div className="flex flex-col gap-3 group">
                     <label className="text-[10px] font-black uppercase tracking-[0.2em] ml-2 text-[var(--subtext)] opacity-70 group-hover:text-[var(--text)] transition-colors">{t("settings_auth_password")}</label>
                     <div className="flex gap-2">
                       <input 
                         type="password" 
                         value={passwordInput}
                         onChange={e => setPasswordInput(e.target.value)}
                         placeholder="••••••••••••"
                         className="flex-1 theme-glass-inner rounded-2xl px-5 py-5 text-[10px] font-black uppercase tracking-widest text-[var(--text)] outline-none focus:theme-border-accent focus:bg-black/40 transition-all shadow-inner"
                       />
                       <button 
                         onClick={() => updateAuth('password')}
                         disabled={authLoading || !passwordInput}
                         className={standardButtonClass}
                       >
                         {t("settings_btn_update")}
                       </button>
                     </div>
                   </div>
                 </div>
               </div>
             </TabContainer>
           )}

           {activeTab === 'NETWORK' && (
             <TabContainer title={t("settings_tab_network")} icon={TABS.find(t=>t.id==='NETWORK')?.icon}>
               <div className="grid xl:grid-cols-2 gap-12">
                 <div className="flex items-center justify-between p-8 rounded-3xl theme-glass-panel hover:theme-border-accent transition-all cursor-pointer group shadow-xl hover:scale-[1.02] active:scale-95" onClick={toggleLocalOnly}>
                   <div className="flex flex-col gap-2">
                     <span className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)] group-hover:theme-text-accent transition-colors">{t("settings_local_only")}</span>
                     <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest leading-relaxed">{t("settings_local_only_desc")}</span>
                   </div>
                   <div className={`w-16 h-8 rounded-full transition-colors flex items-center p-1 shrink-0 ${localOnly ? 'theme-bg-accent shadow-[0_0_15px_var(--accent)]' : 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border border-[color-mix(in_srgb,var(--text)_20%,transparent)]'}`}>
                     <div className={`w-6 h-6 bg-white rounded-full transition-transform duration-300 ${localOnly ? 'translate-x-8' : 'translate-x-0'}`} />
                   </div>
                 </div>
                 <div className="flex items-center justify-between p-8 rounded-3xl theme-glass-panel hover:theme-border-accent transition-all cursor-pointer group shadow-xl hover:scale-[1.02] active:scale-95" onClick={() => setShowImages(!showImages)}>
                    <div className="flex flex-col gap-2">
                      <span className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)] group-hover:theme-text-accent transition-colors">{t("settings_show_images") || "SHOW ASSET IMAGES"}</span>
                      <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest leading-relaxed">{t("settings_show_images_desc") || "Display cover images on mod cards and dossiers."}</span>
                    </div>
                    <div className={`w-16 h-8 rounded-full transition-colors flex items-center p-1 shrink-0 ${showImages ? 'theme-bg-accent shadow-[0_0_15px_var(--accent)]' : 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border border-[color-mix(in_srgb,var(--text)_20%,transparent)]'}`}>
                      <div className={`w-6 h-6 bg-white rounded-full transition-transform duration-300 ${showImages ? 'translate-x-8' : 'translate-x-0'}`} />
                    </div>
                  </div>
               </div>
             </TabContainer>
           )}

           {activeTab === 'NOTIFICATIONS' && (
             <TabContainer 
                title={t("settings_tab_notifs")}
                icon={TABS.find(t=>t.id==='NOTIFICATIONS')?.icon}
                actions={
                  <button onClick={() => setShowMasonPanel(true)} className={standardButtonClass}>
                    <span className="theme-text-accent text-lg">{t("emote_bell")}</span> {t("settings_notif_per_mason")}
                  </button>
                }
             >
               <div className="grid xl:grid-cols-2 gap-8">
                 <div className="flex items-center justify-between p-8 rounded-3xl theme-glass-panel hover:theme-border-accent transition-all cursor-pointer group shadow-xl hover:scale-[1.02] active:scale-95" onClick={toggleNotifyReplies}>
                   <div className="flex flex-col gap-2">
                     <span className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)] group-hover:theme-text-accent transition-colors">{t("settings_notify_replies")}</span>
                     <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest leading-relaxed">{t("settings_notify_replies_desc")}</span>
                   </div>
                   <div className={`w-16 h-8 rounded-full transition-colors flex items-center p-1 shrink-0 ${notifyReplies ? 'theme-bg-accent shadow-[0_0_15px_var(--accent)]' : 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border border-[color-mix(in_srgb,var(--text)_20%,transparent)]'}`}>
                     <div className={`w-6 h-6 bg-white rounded-full transition-transform duration-300 ${notifyReplies ? 'translate-x-8' : 'translate-x-0'}`} />
                   </div>
                 </div>

                 <div className="flex items-center justify-between p-8 rounded-3xl theme-glass-panel hover:theme-border-accent transition-all cursor-pointer group shadow-xl hover:scale-[1.02] active:scale-95" onClick={toggleNotifySupport}>
                   <div className="flex flex-col gap-2">
                     <span className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)] group-hover:theme-text-accent transition-colors">{t("settings_notify_support")}</span>
                     <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest leading-relaxed">{t("settings_notify_support_desc")}</span>
                   </div>
                   <div className={`w-16 h-8 rounded-full transition-colors flex items-center p-1 shrink-0 ${notifySupport ? 'theme-bg-accent shadow-[0_0_15px_var(--accent)]' : 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border border-[color-mix(in_srgb,var(--text)_20%,transparent)]'}`}>
                     <div className={`w-6 h-6 bg-white rounded-full transition-transform duration-300 ${notifySupport ? 'translate-x-8' : 'translate-x-0'}`} />
                   </div>
                 </div>

                 <div className="flex items-center justify-between p-8 rounded-3xl theme-glass-panel hover:theme-border-accent transition-all cursor-pointer group shadow-xl hover:scale-[1.02] active:scale-95" onClick={toggleNotifyNewPosts}>
                   <div className="flex flex-col gap-2">
                     <span className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)] group-hover:theme-text-accent transition-colors">{t("settings_notify_new_posts")}</span>
                     <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest leading-relaxed">{t("settings_notify_new_posts_desc")}</span>
                   </div>
                   <div className={`w-16 h-8 rounded-full transition-colors flex items-center p-1 shrink-0 ${notifyNewPosts ? 'theme-bg-accent shadow-[0_0_15px_var(--accent)]' : 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border border-[color-mix(in_srgb,var(--text)_20%,transparent)]'}`}>
                     <div className={`w-6 h-6 bg-white rounded-full transition-transform duration-300 ${notifyNewPosts ? 'translate-x-8' : 'translate-x-0'}`} />
                   </div>
                 </div>

                 <div className="flex items-center justify-between p-8 rounded-3xl theme-glass-panel hover:theme-border-accent transition-all cursor-pointer group shadow-xl hover:scale-[1.02] active:scale-95" onClick={toggleNotifyAuthorOnly}>
                   <div className="flex flex-col gap-2">
                     <span className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)] group-hover:theme-text-accent transition-colors">{t("settings_notify_author_only")}</span>
                     <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest leading-relaxed">{t("settings_notify_author_only_desc")}</span>
                   </div>
                   <div className={`w-16 h-8 rounded-full transition-colors flex items-center p-1 shrink-0 ${notifyAuthorOnly ? 'theme-bg-accent shadow-[0_0_15px_var(--accent)]' : 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border border-[color-mix(in_srgb,var(--text)_20%,transparent)]'}`}>
                     <div className={`w-6 h-6 bg-white rounded-full transition-transform duration-300 ${notifyAuthorOnly ? 'translate-x-8' : 'translate-x-0'}`} />
                   </div>
                 </div>
               </div>
             </TabContainer>
           )}

           {activeTab === 'CHAMELEON' && (
             <TabContainer 
               title={t("settings_chameleon_title")}
               icon={TABS.find(t=>t.id==='CHAMELEON')?.icon}
               actions={
                 <>
                   <button onClick={() => { setMarketTab('CHAMELEONS'); setView('marketplace'); }} className={standardButtonClass}>{t("market_btn_browse")}</button>
                   <button onClick={handleImportTheme} className={standardButtonClass}>{t("settings_btn_import")}</button>
                   <button onClick={createNewTheme} className={standardButtonClass}>{t("settings_btn_create")}</button>
                 </>
               }
             >
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                 {Object.entries({ ...CORE_THEMES, ...customThemes }).map(([id, data]: any) => (
                   <button key={id} onClick={() => setActiveThemeId(id)} className={`p-6 rounded-3xl border transition-all text-left group relative backdrop-blur-xl shadow-lg ${activeThemeId === id ? 'theme-border-accent theme-glass-inner shadow-[0_0_30px_rgba(var(--accent-rgb),0.2)]' : 'theme-glass-panel opacity-80 hover:opacity-100'}`}>
                     <div className="w-10 h-10 rounded-full mb-4 shadow-lg border border-white/10" style={{ backgroundColor: data.accent }} />
                     {editingThemeId === id ? (
                       <input
                         autoFocus
                         value={newThemeName}
                         onChange={(e) => setNewThemeName(e.target.value)}
                         onClick={(e) => e.stopPropagation()}
                         onKeyDown={(e) => {
                           if (e.key === 'Enter') {
                             if (newThemeName.trim() !== "" && newThemeName !== data.name) renameTheme(id, newThemeName.trim());
                             setEditingThemeId(null);
                           } else if (e.key === 'Escape') {
                             setEditingThemeId(null);
                           }
                         }}
                         onBlur={() => {
                           if (newThemeName.trim() !== "" && newThemeName !== data.name) renameTheme(id, newThemeName.trim());
                           setEditingThemeId(null);
                         }}
                         className="w-full bg-black/40 border border-[var(--accent)] rounded-lg px-3 py-2 text-[10px] font-black text-[var(--text)] uppercase tracking-widest outline-none"
                       />
                     ) : (
                       <p className="text-[12px] font-black uppercase tracking-[0.2em] truncate" style={{ color: activeThemeId === id ? currentTheme.text : currentTheme.subtext }}>{data.name}</p>
                     )}
                     <div className="absolute top-6 right-6 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                       <div onClick={(e) => handleExportTheme(e, data)} className="p-2 rounded-full hover:bg-white/10 text-sm material-symbols-outlined lowercase">save</div>
                       {!CORE_THEMES[id] && (
                         <>
                           <div onClick={(e) => { e.stopPropagation(); setNewThemeName(data.name); setEditingThemeId(id); }} className="p-2 rounded-full hover:bg-white/10 text-sm theme-text-accent material-symbols-outlined lowercase">edit</div>
                           <div onClick={(e) => { e.stopPropagation(); deleteTheme(id); }} className="p-2 rounded-full hover:bg-white/10 text-sm theme-text-danger material-symbols-outlined lowercase">delete</div>
                         </>
                       )}
                     </div>
                   </button>
                 ))}
               </div>

               <div className="mt-8 pt-10 border-t border-white/5">
                  <h3 className="text-xl font-black uppercase tracking-widest text-[var(--text)] mb-8 flex items-center gap-3">
                     <span className="material-symbols-outlined text-2xl theme-text-accent">tune</span>
                     {t("settings_forge_live")}
                  </h3>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-12">
                    {themeKeys.map(key => (
                      <div key={key} className="flex flex-col gap-4 group">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] ml-1 text-[var(--subtext)] opacity-60 group-hover:text-[var(--text)] transition-colors">{t(`settings_color_${key}`) || key.toUpperCase()}</label>
                        <div className="relative">
                          <div className="flex items-center gap-4">
                            <div 
                              ref={(el) => { colorPickerRefs.current[key] = el; }}
                              onClick={() => setActiveColorPicker(activeColorPicker === key ? null : key)}
                              className="w-20 h-14 border border-white/10 cursor-pointer rounded-2xl overflow-hidden shrink-0 shadow-inner hover:scale-105 hover:border-white/30 transition-all" 
                              style={{ backgroundColor: currentTheme[key] }}
                            />
                            <code 
                              className="text-xs font-black uppercase tracking-widest opacity-40 cursor-pointer hover:opacity-100 transition-opacity" 
                              onClick={() => setActiveColorPicker(activeColorPicker === key ? null : key)} 
                              style={{ color: currentTheme.text }}
                            >
                              {currentTheme[key]?.toUpperCase() || '#000000'}
                            </code>
                          </div>
                          
                          {activeColorPicker === key && createPortal(
                            <>
                              <div className="fixed inset-0 z-[50000]" onClick={() => setActiveColorPicker(null)} />
                              <div className="fixed z-[50001] p-8 theme-glass-panel rounded-[2rem] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_0_50px_rgba(0,0,0,0.8)] w-[26rem] animate-in fade-in zoom-in-95 duration-200"
                                   style={{
                                      top: Math.min(colorPickerRefs.current[key]?.getBoundingClientRect().bottom + 12, window.innerHeight - 350),
                                      left: Math.min(colorPickerRefs.current[key]?.getBoundingClientRect().left, window.innerWidth - 450),
                                   }}>
                                <div className="flex gap-4 mb-8">
                                  <input 
                                    type="text" 
                                    value={currentTheme[key]} 
                                    onChange={(e) => updateActiveTheme({ [key]: e.target.value })}
                                    className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-xs font-black text-[var(--text)] uppercase tracking-widest outline-none focus:theme-border-accent focus:theme-text-accent transition-colors shadow-inner"
                                  />
                                  <div className="w-12 h-12 rounded-2xl border border-white/10 shrink-0 shadow-inner flex items-center justify-center cursor-pointer hover:scale-110 transition-transform group/fav" style={{ backgroundColor: currentTheme[key] }} onClick={() => toggleFavColor(currentTheme[key])}>
                                     {favColors.includes(currentTheme[key]) ? <span className="text-yellow-500 text-2xl drop-shadow-md">{t("emote_star")}</span> : <span className="opacity-0 group-hover/fav:opacity-50 text-white font-black text-2xl material-symbols-outlined">{t("ui_icon_plus")}</span>}
                                  </div>
                                </div>
                                <div className="grid grid-cols-8 gap-3 mb-6">
                                  {PRESET_COLORS.map(color => (
                                     <button
                                       key={color}
                                       onClick={() => updateActiveTheme({ [key]: color })}
                                       className={`w-7 h-7 rounded-full border hover:scale-125 transition-all shadow-sm ${currentTheme[key]?.toLowerCase() === color ? 'theme-border-accent scale-110 shadow-[0_0_15px_var(--accent)]' : 'border-white/10 hover:border-white/30'}`}
                                       style={{ backgroundColor: color }}
                                     />
                                  ))}
                                </div>
                                {favColors.length > 0 && (
                                  <div className="mb-8 pt-6 border-t border-white/10">
                                     <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] mb-4">{t("settings_color_favs")}</h4>
                                     <div className="flex flex-wrap gap-3">
                                       {favColors.map(color => (
                                          <button
                                           key={color}
                                           onClick={() => updateActiveTheme({ [key]: color })}
                                           className={`w-7 h-7 rounded-xl border hover:scale-125 transition-all shadow-sm ${currentTheme[key]?.toLowerCase() === color.toLowerCase() ? 'theme-border-accent scale-110 shadow-[0_0_15px_var(--accent)]' : 'border-white/10 hover:border-white/30'}`}
                                           style={{ backgroundColor: color }}
                                         />
                                       ))}
                                     </div>
                                  </div>
                                )}
                                <div className="flex flex-col gap-4 pt-6 border-t border-white/10">
                                  <div className="flex items-center gap-4">
                                    <span className="text-xs font-black opacity-50 w-3 text-center text-red-500">{t("settings_color_r")}</span>
                                    <input 
                                      type="range" min="0" max="255" 
                                      value={HexToRGB(currentTheme[key]).r} 
                                      onChange={(e) => updateActiveTheme({ [key]: RGBToHex(parseInt(e.target.value), HexToRGB(currentTheme[key]).g, HexToRGB(currentTheme[key]).b) })}
                                      className="flex-1 h-3 bg-black/40 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-red-500 [&::-webkit-slider-thumb]:rounded-full cursor-pointer shadow-inner"
                                    />
                                  </div>
                                  <div className="flex items-center gap-4">
                                    <span className="text-xs font-black opacity-50 w-3 text-center text-green-500">{t("settings_color_g")}</span>
                                    <input 
                                      type="range" min="0" max="255" 
                                      value={HexToRGB(currentTheme[key]).g} 
                                      onChange={(e) => updateActiveTheme({ [key]: RGBToHex(HexToRGB(currentTheme[key]).r, parseInt(e.target.value), HexToRGB(currentTheme[key]).b) })}
                                      className="flex-1 h-3 bg-black/40 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-green-500 [&::-webkit-slider-thumb]:rounded-full cursor-pointer shadow-inner"
                                    />
                                  </div>
                                  <div className="flex items-center gap-4">
                                    <span className="text-xs font-black opacity-50 w-3 text-center text-blue-500">{t("settings_color_b")}</span>
                                    <input 
                                      type="range" min="0" max="255" 
                                      value={HexToRGB(currentTheme[key]).b} 
                                      onChange={(e) => updateActiveTheme({ [key]: RGBToHex(HexToRGB(currentTheme[key]).r, HexToRGB(currentTheme[key]).g, parseInt(e.target.value)) })}
                                      className="flex-1 h-3 bg-black/40 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full cursor-pointer shadow-inner"
                                    />
                                  </div>
                                </div>
                              </div>
                            </>, document.body
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
               </div>
             </TabContainer>
           )}

           {activeTab === 'LEXICON' && (
             <TabContainer 
               title={t("settings_lexicon_title")}
               icon={TABS.find(t=>t.id==='LEXICON')?.icon}
               actions={
                 <>
                   <button onClick={() => { setMarketTab('LEXICONS'); setView('marketplace'); }} className={standardButtonClass}>{t("market_btn_browse")}</button>
                   <button onClick={handleImportLexicon} className={standardButtonClass}>{t("settings_btn_import")}</button>
                 </>
               }
             >
               <div className="flex flex-col gap-12">
                 
                 {/* INSTALLED / FAVORITES GRID */}
                 <div className="flex flex-col gap-6">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60 ml-2">{t("settings_installed_lexicons")}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                      {favoriteLexicons.map(code => (
                        <button key={code} onClick={() => setActiveLang(code)} className={`p-6 rounded-3xl border transition-all text-left flex justify-between items-center group relative backdrop-blur-xl shadow-lg ${activeLang === code ? 'theme-border-accent theme-glass-inner shadow-[0_0_30px_rgba(var(--accent-rgb),0.2)]' : 'theme-glass-panel opacity-80 hover:opacity-100'}`}>
                           <div className="flex flex-col gap-2 truncate pr-4">
                             <span className={`text-[12px] font-black uppercase tracking-[0.2em] truncate ${activeLang === code ? 'theme-text-accent' : 'text-[var(--text)]'}`}>{getLexiconMetadata(code).name}</span>
                             <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">{getLexiconMetadata(code).language}</span>
                           </div>
                           <div className="flex items-center gap-3 shrink-0">
                             <span className={`text-2xl transition-all material-symbols-outlined ${activeLang === code ? 'opacity-100 theme-text-accent' : 'opacity-0 scale-50 w-0'}`}>{t("ui_icon_check")}</span>
                             <span onClick={(e) => toggleFavoriteLexicon(code, e)} className="text-2xl text-yellow-500 drop-shadow-md hover:scale-125 transition-transform">{t("emote_star")}</span>
                           </div>
                        </button>
                      ))}
                    </div>
                 </div>

                 {/* LEXICON LIBRARY */}
                 <div className="flex flex-col gap-6 mt-8 pt-10 border-t border-white/5">
                    <h3 className="text-xl font-black uppercase tracking-widest text-[var(--text)] mb-2 flex items-center gap-3">
                       <span className="material-symbols-outlined text-2xl theme-text-accent">menu_book</span>
                       {t("settings_library")}
                    </h3>
                    
                    <div className="flex gap-2 w-full overflow-x-auto accent-scrollbar pb-2">
                       <button onClick={() => setSelectedLibraryLang(null)} className={`px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] whitespace-nowrap transition-all ${!selectedLibraryLang ? 'theme-glass-inner theme-border-accent shadow-[0_0_20px_rgba(var(--accent-rgb),0.3)] text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]' : 'theme-glass-inner border border-white/5 hover:theme-border-accent hover:shadow-[0_0_15px_rgba(var(--accent-rgb),0.2)] text-[var(--text)] opacity-70 hover:opacity-100'}`}>
                          {t("settings_all_languages") || "ALL LANGUAGES"}
                       </button>
                       {uniqueLanguages.map(lang => (
                          <button key={lang} onClick={() => setSelectedLibraryLang(lang)} className={`px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] whitespace-nowrap transition-all ${selectedLibraryLang === lang ? 'theme-glass-inner theme-border-accent shadow-[0_0_20px_rgba(var(--accent-rgb),0.3)] text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]' : 'theme-glass-inner border border-white/5 hover:theme-border-accent hover:shadow-[0_0_15px_rgba(var(--accent-rgb),0.2)] text-[var(--text)] opacity-70 hover:opacity-100'}`}>
                             {lang}
                          </button>
                       ))}
                    </div>

                    <div className="relative mt-2">
                       <input 
                         type="text" 
                         value={lexiconSearch}
                         onChange={e => setLexiconSearch(e.target.value)}
                         placeholder={t("ui_search_lexicons")}
                         className="w-full theme-glass-panel rounded-2xl px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text)] outline-none focus:theme-border-accent transition-all shadow-inner"
                       />
                       <span className="absolute right-6 top-1/2 -translate-y-1/2 opacity-50 text-xl material-symbols-outlined">{t("ui_icon_search")}</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-4">
                       {allLexiconCodes
                         .filter(code => !favoriteLexicons.includes(code))
                         .filter(code => !selectedLibraryLang || getLexiconMetadata(code).language === selectedLibraryLang)
                         .filter(code => getLexiconMetadata(code).name.toLowerCase().includes(lexiconSearch.toLowerCase()) || code.toLowerCase().includes(lexiconSearch.toLowerCase()))
                         .map(code => (
                           <div key={code} className={`p-6 rounded-3xl border transition-all flex flex-col gap-2 relative group cursor-pointer backdrop-blur-xl shadow-lg ${activeLang === code ? 'theme-border-accent theme-glass-inner shadow-[0_0_30px_rgba(var(--accent-rgb),0.2)]' : 'theme-glass-panel opacity-80 hover:opacity-100'}`} onClick={() => setActiveLang(code)}>
                              <div className="flex justify-between items-start w-full">
                                 <span className="text-[12px] font-black text-[var(--text)] uppercase tracking-widest truncate">{getLexiconMetadata(code).name}</span>
                                 <button onClick={(e) => toggleFavoriteLexicon(code, e)} className={`text-2xl transition-colors ${favoriteLexicons.includes(code) ? 'text-yellow-500' : 'text-[var(--subtext)] opacity-30 hover:opacity-100 hover:text-yellow-500'}`}>
                                    ★
                                 </button>
                              </div>
                              <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">{getLexiconMetadata(code).language}</span>
                              <div className="absolute top-1/2 right-6 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                                 {activeLang === code && <span className="theme-text-accent text-3xl material-symbols-outlined">{t("ui_icon_check")}</span>}
                              </div>
                              {code !== 'en-sanctuary' && code !== 'en-default' && code !== 'de-default' && (
                                <div className="absolute bottom-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                   <button onClick={(e) => { e.stopPropagation(); deleteLexicon(code); }} className="p-3 rounded-full hover:bg-red-500/20 text-sm theme-text-danger shadow-sm transition-colors flex items-center justify-center">
                                      <span className="material-symbols-outlined !text-lg">{t("ui_icon_trash")}</span>
                                   </button>
                                </div>
                              )}
                           </div>
                       ))}
                    </div>
                 </div>
               </div>
             </TabContainer>
           )}

           {activeTab === 'LOGIC' && (
             <TabContainer title={t("settings_anarchy_title")} icon={TABS.find(t=>t.id==='LOGIC')?.icon}>
               <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                  <div onClick={() => toggleRule('highlander')} className={`p-8 rounded-3xl border transition-all cursor-pointer flex items-center gap-8 group backdrop-blur-xl shadow-xl ${!rules.highlander ? 'theme-glass-inner border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.2)]' : 'theme-glass-inner hover:border-white/20'}`}>
                    <div className={`w-16 h-8 rounded-full flex items-center p-1 transition-colors shrink-0 ${!rules.highlander ? 'bg-red-500' : 'bg-black/50 border border-white/10'}`}>
                      <div className={`w-6 h-6 bg-white rounded-full transition-transform ${!rules.highlander ? 'translate-x-8 shadow-[0_0_10px_white]' : 'translate-x-0'}`} />
                    </div>
                    <div className="flex flex-col pr-4">
                      <span className={`text-sm font-black uppercase tracking-widest transition-colors ${!rules.highlander ? 'text-red-400' : 'text-[var(--text)] group-hover:text-white'}`}>{t("settings_anarchy_highlander")}</span>
                      <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest leading-relaxed mt-2">{t("settings_anarchy_highlander_desc")}</span>
                    </div>
                  </div>

                  <div onClick={() => toggleRule('family')} className={`p-8 rounded-3xl border transition-all cursor-pointer flex items-center gap-8 group backdrop-blur-xl shadow-xl ${!rules.family ? 'theme-glass-inner border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.2)]' : 'theme-glass-inner hover:border-white/20'}`}>
                    <div className={`w-16 h-8 rounded-full flex items-center p-1 transition-colors shrink-0 ${!rules.family ? 'bg-red-500' : 'bg-black/50 border border-white/10'}`}>
                      <div className={`w-6 h-6 bg-white rounded-full transition-transform ${!rules.family ? 'translate-x-8 shadow-[0_0_10px_white]' : 'translate-x-0'}`} />
                    </div>
                    <div className="flex flex-col pr-4">
                      <span className={`text-sm font-black uppercase tracking-widest transition-colors ${!rules.family ? 'text-red-400' : 'text-[var(--text)] group-hover:text-white'}`}>{t("settings_anarchy_family")}</span>
                      <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest leading-relaxed mt-2">{t("settings_anarchy_family_desc")}</span>
                    </div>
                  </div>

                  <div onClick={() => toggleRule('dependencies')} className={`p-8 rounded-3xl border transition-all cursor-pointer flex items-center gap-8 group backdrop-blur-xl shadow-xl ${!rules.dependencies ? 'theme-glass-inner border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.2)]' : 'theme-glass-inner hover:border-white/20'}`}>
                    <div className={`w-16 h-8 rounded-full flex items-center p-1 transition-colors shrink-0 ${!rules.dependencies ? 'bg-red-500' : 'bg-black/50 border border-white/10'}`}>
                      <div className={`w-6 h-6 bg-white rounded-full transition-transform ${!rules.dependencies ? 'translate-x-8 shadow-[0_0_10px_white]' : 'translate-x-0'}`} />
                    </div>
                    <div className="flex flex-col pr-4">
                      <span className={`text-sm font-black uppercase tracking-widest transition-colors ${!rules.dependencies ? 'text-red-400' : 'text-[var(--text)] group-hover:text-white'}`}>{t("settings_anarchy_deps")}</span>
                      <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest leading-relaxed mt-2">{t("settings_anarchy_deps_desc")}</span>
                    </div>
                  </div>

                  <div onClick={() => toggleRule('intercept')} className={`p-8 rounded-3xl border transition-all cursor-pointer flex items-center gap-8 group backdrop-blur-xl shadow-xl ${!rules.intercept ? 'theme-glass-inner border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.2)]' : 'theme-glass-inner hover:border-white/20'}`}>
                    <div className={`w-16 h-8 rounded-full flex items-center p-1 transition-colors shrink-0 ${!rules.intercept ? 'bg-red-500' : 'bg-black/50 border border-white/10'}`}>
                      <div className={`w-6 h-6 bg-white rounded-full transition-transform ${!rules.intercept ? 'translate-x-8 shadow-[0_0_10px_white]' : 'translate-x-0'}`} />
                    </div>
                    <div className="flex flex-col pr-4">
                      <span className={`text-sm font-black uppercase tracking-widest transition-colors ${!rules.intercept ? 'text-red-400' : 'text-[var(--text)] group-hover:text-white'}`}>{t("settings_anarchy_intercept")}</span>
                      <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest leading-relaxed mt-2">{t("settings_anarchy_intercept_desc")}</span>
                    </div>
                  </div>
               </div>
             </TabContainer>
           )}

           {activeTab === 'MALWARE' && (
             <TabContainer title={t("settings_tab_malware") || "MALWARE"} icon={TABS.find(t=>t.id==='MALWARE')?.icon}>
               <div className="flex flex-col items-center justify-center p-16 text-center border border-red-500/20 rounded-[3rem] bg-red-950/20 backdrop-blur-xl shadow-[0_0_50px_rgba(239,68,68,0.1)] mt-8">
                 <span className="!text-[8rem] animate-bounce drop-shadow-[0_0_20px_rgba(220,38,38,1)] mb-8 material-symbols-outlined">{t("ui_icon_skull") || "skull"}</span>
                 <p className="text-xs font-black text-red-400 opacity-80 uppercase tracking-widest max-w-xl leading-relaxed mb-12">
                   {t("settings_god_mode_warn") || "This protocol permanently severs your profile from the global network, granting you unrestrained local sandbox authority."}
                 </p>
                 <button onClick={() => { setShowMalwareOverride(true); setMalwareToggleActive(false); setOverrideInput(''); }} className="w-full max-w-lg py-8 rounded-[2rem] font-black text-xs uppercase tracking-[0.3em] transition-all shadow-xl border bg-black/40 text-red-500 border-red-500/30 hover:bg-red-900/40 hover:border-red-500 hover:shadow-[0_0_40px_rgba(239,68,68,0.3)]">
                   {t("settings_malware_btn")}
                 </button>
               </div>
             </TabContainer>
           )}

        </div>
      </div>

      {/* MODALS */}
      <SidePanel 
        isOpen={showMasonPanel} 
        onClose={() => setShowMasonPanel(false)} 
        title={t("settings_notif_per_mason") || "Per-Mason Broadcast Alerts"}
        subtitle={t("settings_notif_per_mason_desc")}
        icon={t("emote_bell") || "notifications"}
        iconColorClass="theme-text-accent"
      >
        <div className="flex flex-col space-y-4 relative z-10 w-full h-full p-4">
          {followedMasons.length === 0 && <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-50 text-center mt-12 p-8 theme-glass-inner border border-dashed border-white/10 rounded-3xl">{t("settings_no_masons")}</div>}
          {followedMasons.map(m => (
            <div key={m.id} className="flex items-center justify-between p-6 rounded-3xl theme-glass-inner border border-white/10 hover:border-white/30 hover:-translate-y-1 backdrop-blur-xl transition-all group cursor-pointer shadow-lg hover:shadow-2xl" onClick={() => toggleMasonAlert(m.id)}>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-black uppercase tracking-widest text-[var(--text)] group-hover:theme-text-accent transition-colors">{m.name}</span>
                <span className="text-[10px] font-black text-[var(--subtext)] opacity-60 tracking-widest">{m.handle}</span>
              </div>
              <div className={`w-14 h-8 rounded-full transition-colors flex items-center p-1 shrink-0 ${masonAlerts[m.id] ? 'theme-bg-accent shadow-[0_0_15px_var(--accent)]' : 'bg-black/50 border border-white/10'}`}>
                <div className={`w-6 h-6 bg-white rounded-full transition-transform duration-300 shadow-[0_0_10px_rgba(0,0,0,0.5)] ${masonAlerts[m.id] ? 'translate-x-6' : 'translate-x-0'}`} />
              </div>
            </div>
          ))}
        </div>
      </SidePanel>

      <SidePanel
        isOpen={showMalwareOverride}
        onClose={() => setShowMalwareOverride(false)}
        title={t("settings_malware_title")}
        icon="skull"
        iconColorClass="text-red-500 bg-red-900/20 border-red-500/50"
        backdropZ="z-[50000]"
        panelZ="z-[50001]"
        widthClass="w-[640px]"
      >
        <div className="flex-1 flex flex-col gap-8 relative">
          <div className="absolute inset-0 bg-red-900/10 animate-pulse pointer-events-none rounded-[2rem]" />
          <div className="flex flex-col gap-4 min-w-0 flex-1 relative z-10 text-center mb-8">
            <span className="material-symbols-outlined !text-[8rem] animate-bounce drop-shadow-[0_0_20px_rgba(220,38,38,1)] mb-4 mt-8">{t("ui_icon_skull") || "skull"}</span>
            <p className="text-xs font-black text-red-400 opacity-80 uppercase tracking-widest leading-relaxed">
              {t("settings_malware_subtitle")}
            </p>
          </div>

          <div className="relative z-10 flex items-center justify-between p-8 rounded-[2rem] theme-glass-inner backdrop-blur-2xl border border-red-500/20 shadow-2xl cursor-pointer hover:border-red-500/50 hover:scale-[1.02] transition-all group mt-4" onClick={() => setMalwareToggleActive(!malwareToggleActive)}>
            <div className="flex flex-col gap-2 text-left">
              <span className="text-sm font-black uppercase tracking-[0.2em] text-red-400 group-hover:text-red-300 transition-colors">{t("settings_malware_disable")}</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-red-200/50">{t("settings_malware_disable_desc")}</span>
            </div>
            <div className={`w-16 h-8 rounded-full flex items-center p-1 transition-all ${malwareToggleActive ? 'bg-red-500 shadow-[0_0_20px_rgba(220,38,38,0.6)]' : 'bg-red-950/40 border border-red-500/20'}`}>
              <div className={`w-8 h-6 bg-white rounded-full transition-transform duration-300 ${malwareToggleActive ? 'translate-x-8' : 'translate-x-0'}`} />
            </div>
          </div>

          {malwareToggleActive ? (
            <div className="flex flex-col gap-8 animate-in slide-in-from-top-4 fade-in duration-300 relative z-10 mt-4">
              <div className="p-8 bg-red-950/30 border border-red-500/30 rounded-[2rem] text-center shadow-inner">
                <p className="text-[10px] font-black text-red-400 uppercase tracking-[0.2em] leading-relaxed">
                  {t("settings_malware_warning")}
                </p>
              </div>
              <div className="flex flex-col gap-4">
                <label className="text-[10px] font-black text-red-500 uppercase tracking-widest text-center">{t("settings_malware_type_confirm")}</label>
                <input value={overrideInput} onChange={(e) => setOverrideInput(e.target.value)} className="w-full bg-red-950/20 backdrop-blur-md theme-glass-panel border border-red-500/50 rounded-2xl py-6 text-center text-red-300 font-black text-xl uppercase tracking-widest focus:outline-none focus:bg-red-950/40 focus:border-red-400 focus:shadow-[0_0_30px_rgba(239,68,68,0.4)] shadow-inner transition-all" placeholder={t("settings_malware_confirm_text")} />
              </div>
              
              <div className="flex gap-4 mt-4 mb-8">
                <button disabled={overrideInput.toLowerCase() !== t("settings_malware_confirm_text").toLowerCase()} onClick={executeOverride} className="flex-1 py-5 bg-red-600/20 theme-glass-panel border border-red-500/50 hover:bg-red-600/40 text-red-100 hover:text-white backdrop-blur-xl shadow-[0_0_30px_rgba(220,38,38,0.4)] rounded-xl font-black text-[10px] uppercase tracking-[0.3em] disabled:opacity-30 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-95 transition-all">{t("settings_malware_sever")}</button>
                <button onClick={() => { setShowMalwareOverride(false); setMalwareToggleActive(false); setOverrideInput(''); }} className="flex-1 py-5 theme-glass-panel border border-white/10 hover:border-white/30 backdrop-blur-lg rounded-xl font-black text-[10px] uppercase text-red-200 tracking-widest transition-all hover:bg-red-950/40 shadow-lg">{t("radar_tier3_cancel")}</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowMalwareOverride(false)} className="relative z-10 w-full py-6 theme-glass-inner backdrop-blur-md border border-red-500/20 shadow-lg rounded-2xl font-black text-[10px] uppercase tracking-widest text-red-300/50 hover:text-red-300 hover:bg-red-950/40 hover:-translate-y-1 transition-all mt-6 mb-8">
              {t("radar_tier3_cancel")}
            </button>
          )}
        </div>
      </SidePanel>

    </div>
  );
}
