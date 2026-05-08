import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { useTheme } from "./ThemeContext";
import { useLexicon } from "./LexiconContext";
import { supabase } from "./supabase";

export const HotSwapPanel = () => {
  const { currentTheme, activeThemeId, setActiveThemeId, CORE_THEMES, customThemes, updateActiveTheme, createNewTheme, importTheme, deleteTheme } = useTheme();
  const { t, registry, activeLang, setActiveLang, importLexicon, deleteLexicon } = useLexicon();

  const handleExportTheme = async (e: React.MouseEvent, themeObj: any) => {
    e.stopPropagation();
    try {
      const config: any = await invoke("get_saved_coordinates");
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

  const themeKeys =['bg', 'sidebar', 'accent', 'text', 'subtext', 'success', 'warning', 'danger'];

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      
      <section className="space-y-6">
        <div className="flex justify-between items-end px-1">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--subtext)] opacity-80">{t("settings_theme_registry")}</p>
            <h2 className="text-xl font-black uppercase tracking-tighter text-[var(--text)]">{t("settings_chameleon_title")}</h2>
          </div>
          <div className="flex gap-2">
            <button onClick={handleImportTheme} className="px-6 py-3 text-xs font-black rounded-xl border transition-all" style={{ backgroundColor: `${currentTheme.accent}15`, borderColor: `${currentTheme.accent}30`, color: currentTheme.accent }}>{t("settings_btn_import")}</button>
            <button onClick={createNewTheme} className="px-6 py-3 text-xs font-black rounded-xl border transition-all" style={{ backgroundColor: `${currentTheme.success}15`, borderColor: `${currentTheme.success}30`, color: currentTheme.success }}>{t("settings_btn_create")}</button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries({ ...CORE_THEMES, ...customThemes }).map(([id, data]: any) => (
            <button key={id} onClick={() => setActiveThemeId(id)} className={`theme-glass-inner p-5 rounded-2xl border transition-all text-left group relative ${activeThemeId === id ? 'theme-border-accent shadow-xl' : 'border-white/5 hover:border-white/20'}`}>
              <div className="w-8 h-8 rounded-full mb-3 shadow-lg" style={{ backgroundColor: data.accent }} />
              <p className="text-[10px] font-black uppercase truncate" style={{ color: activeThemeId === id ? currentTheme.text : currentTheme.subtext }}>{data.name}</p>
              <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <div onClick={(e) => handleExportTheme(e, data)} className="p-2 rounded-full hover:bg-white/10 text-[10px]">{t("ui_icon_save")}</div>
                {!CORE_THEMES[id] && <div onClick={(e) => { e.stopPropagation(); deleteTheme(id); }} className="p-2 rounded-full hover:bg-white/10 text-[10px] theme-text-danger">{t("ui_icon_trash")}</div>}
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="theme-glass-panel p-8 border border-white/10 rounded-[2rem] space-y-6 shadow-inner relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 blur-3xl rounded-full opacity-10" style={{ backgroundColor: currentTheme.accent }} />
        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[var(--text)] opacity-50">{t("settings_forge_live")}</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
          {themeKeys.map(key => (
            <div key={key} className="flex flex-col gap-3">
              <label className="text-[9px] font-black uppercase tracking-widest ml-1 text-[var(--subtext)] opacity-60">{t(`settings_color_${key}`) || key.toUpperCase()}</label>
              <div className="flex items-center gap-3">
                <input type="color" value={currentTheme[key]} onChange={(e) => updateActiveTheme({ [key]: e.target.value })} className="w-12 h-10 bg-transparent border-none cursor-pointer rounded-lg overflow-hidden shrink-0" />
                <code className="text-[10px] font-mono opacity-40" style={{ color: currentTheme.text }}>{currentTheme[key]?.toUpperCase()}</code>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="pt-10 border-t space-y-6" style={{ borderColor: `${currentTheme.text}10` }}>
        <div className="flex justify-between items-center px-1">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--subtext)] opacity-80">{t("settings_lexicon_protocol")}</p>
            <h2 className="text-xl font-black uppercase tracking-tighter text-[var(--text)]">Persona Registry</h2>
          </div>
          <button onClick={handleImportLexicon} className="px-6 py-3 text-xs font-black rounded-xl border transition-all" style={{ backgroundColor: `${currentTheme.accent}15`, borderColor: `${currentTheme.accent}30`, color: currentTheme.accent }}>{t("settings_btn_import_persona")}</button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {['en-sanctuary', 'en-default'].map(langId => (
            <div key={langId} onClick={() => setActiveLang(langId)} className={`theme-glass-inner p-5 rounded-2xl border transition-all cursor-pointer ${activeLang === langId ? 'theme-border-accent shadow-xl' : 'border-white/5 hover:border-white/20'}`}>
              <p className="text-[10px] font-black uppercase truncate" style={{ color: activeLang === langId ? currentTheme.text : currentTheme.subtext }}>{langId === 'en-sanctuary' ? 'Sanctuary OS' : 'Standard Manager'}</p>
            </div>
          ))}
          {Object.entries(registry || {}).map(([code, _dict]: any) => (
            <div key={code} onClick={() => setActiveLang(code)} className={`theme-glass-inner p-5 rounded-2xl border transition-all cursor-pointer relative group ${activeLang === code ? 'theme-border-accent shadow-xl' : 'border-white/5 hover:border-white/20'}`}>
              <p className="text-[10px] font-black uppercase truncate" style={{ color: activeLang === code ? currentTheme.text : currentTheme.subtext }}>{code}</p>
              <button onClick={(e) => { e.stopPropagation(); deleteLexicon(code); }} className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 p-2 theme-text-danger transition-opacity">{t("ui_icon_trash")}</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

function CustomSettingsDropdown({ value, options, onChange }: any) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = options.find((o: any) => o.id == value) || options[0];

  return (
    <div className="relative w-full">
      <button onClick={() => setIsOpen(!isOpen)} className="w-full p-4 rounded-2xl border border-white/10 theme-glass-inner outline-none transition-all shadow-inner flex justify-between items-center text-xs font-black uppercase tracking-widest text-[var(--text)] focus:theme-border-accent group">
        <span>{selected?.label}</span>
        <span className="text-[var(--subtext)] opacity-60 text-[10px] group-hover:text-[var(--text)] transition-colors">{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--sidebar)] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
          {options.map((opt: any) => (
            <button key={opt.id} onClick={() => { onChange(opt.id); setIsOpen(false); }} className="w-full text-left px-5 py-4 text-xs font-black uppercase tracking-widest transition-all hover:bg-white/5 text-[var(--text)] border-b border-white/5 last:border-0 flex items-center">
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Settings({ anarchyRules, setAnarchyRules }: any) {
  const { t } = useLexicon();
  const { currentTheme } = useTheme();
  const [config, setConfig] = useState<any>(null);
  const[hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [showMalwareOverride, setShowMalwareOverride] = useState(false);
  const [malwareToggleActive, setMalwareToggleActive] = useState(false);
  const [overrideInput, setOverrideInput] = useState("");
  const [matureEnabled, setMatureEnabled] = useState(localStorage.getItem("sanctuary_mature_transmissions") === "true");

  const executeOverride = async () => {
    if (overrideInput !== "I Confirm") return;
    
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('profiles').update({ role: 'blacklisted' }).eq('id', user.id);
    }

    localStorage.setItem("sanctuary_blacklisted", "true");
    await supabase.auth.signOut();
    alert("You have chosen to override the Malware Protocol. Your Database Access has been severed.");
    setShowMalwareOverride(false);
  };

  const toggleMature = () => {
    const newVal = !matureEnabled;
    setMatureEnabled(newVal);
    localStorage.setItem("sanctuary_mature_transmissions", newVal.toString());
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

    const parsedVal = (key === 'engine_agency_level' || key === 'backup_preference' || key === 'backup_retention_cycles') ? parseInt(val) : val;
    const newConfig = { ...config, [key]: parsedVal };
    setConfig(newConfig);
    try {
      await invoke("save_coordinates", {
        livePath: newConfig.live_path || "",
        modsPath: newConfig.mods_path || "",
        vaultPath: newConfig.vault_path || "",
        engineAgencyLevel: newConfig.engine_agency_level != null ? parseInt(newConfig.engine_agency_level) : null,
        backupPreference: newConfig.backup_preference != null ? parseInt(newConfig.backup_preference) : null,
        backupRetentionCycles: newConfig.backup_retention_cycles != null ? parseInt(newConfig.backup_retention_cycles) : null
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
          backupPreference: config.backup_preference != null ? parseInt(config.backup_preference) : null,
          backupRetentionCycles: config.backup_retention_cycles != null ? parseInt(config.backup_retention_cycles) : null
        };
        await invoke("save_coordinates", payload);
        await refreshConfig();
      }
    } catch (err) { alert(err); }
  };

  if (!config) return <div className="p-12 font-black animate-pulse uppercase tracking-widest" style={{ color: currentTheme.accent }}>{t("settings_booting")}</div>;

  const pathMap =[
    { rustKey: 'vault_path', label: t("settings_vault_path"), value: config.vault_path, icon: t("ui_icon_collection") },
    { rustKey: 'mods_path', label: t("settings_library_path"), value: config.mods_path, icon: t("ui_icon_folder") },
    { rustKey: 'live_path', label: t("setup_btn_bin"), value: config.live_path, icon: t("ui_icon_pin") }
  ];

  return (
    <div className="p-8 w-full h-full overflow-y-auto space-y-12 pb-32 custom-scrollbar" style={{ color: currentTheme.text }}>
      <header className="flex flex-col gap-1 pt-2">
        <h1 className="text-4xl font-black uppercase tracking-tighter text-[var(--text)]">{t("settings_title")}</h1>
        <p className="text-[10px] font-black uppercase tracking-[0.3em]" style={{ color: currentTheme.subtext }}>{t("settings_subtitle")}</p>
      </header>

      <HotSwapPanel />
      <div className="h-px w-full" style={{ backgroundColor: `${currentTheme.text}10` }} />

      <section className="space-y-6">
        <div className="flex justify-between items-end px-1">
          <h2 className="text-xl font-black uppercase tracking-tighter text-[var(--text)]">{t("settings_sys_coords")}</h2>
          <button onClick={async () => {
            try {
              const detected: any = await invoke("auto_detect_paths");
              if (detected.live_path) updateConfig('live_path', detected.live_path);
              if (detected.mods_path) updateConfig('mods_path', detected.mods_path);
              if (detected.vault_path) updateConfig('vault_path', detected.vault_path);
            } catch (err) { alert(err); }
          }} className="px-6 py-3 text-xs font-black rounded-xl border transition-all" style={{ backgroundColor: `${currentTheme.accent}15`, borderColor: `${currentTheme.accent}30`, color: currentTheme.accent }}>
            <span className="text-sm mr-2">📡</span> AUTO-DETECT
          </button>
        </div>
        <div className="grid gap-6">
          {pathMap.map(dir => {
            const isHovered = hoveredKey === dir.rustKey;
            return (
              <div key={dir.rustKey} className="group relative" onMouseEnter={() => setHoveredKey(dir.rustKey)} onMouseLeave={() => setHoveredKey(null)}>
                <label className="block text-[9px] font-black uppercase tracking-widest mb-2 ml-1 text-[var(--subtext)] opacity-60 transition-colors">{dir.label}</label>
                <div onClick={() => pickPath(dir.rustKey, dir.label)} className="relative flex items-center cursor-pointer">
                  <input 
                    readOnly value={dir.value || ""} 
                    style={{ paddingLeft: isHovered ? '4.5rem' : '1.25rem' }}
                    className={`w-full py-5 pr-32 rounded-2xl border theme-glass-inner font-mono text-xs shadow-inner transition-all duration-500 pointer-events-none ${isHovered ? 'theme-border-accent' : 'border-white/10'}`} 
                    placeholder="NOT SET" 
                  />
                  <div className="absolute right-4 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all duration-300" style={{ backgroundColor: `${currentTheme.accent}20`, color: currentTheme.accent }}>{t("modal_btn_rename")}</div>
                  <div className="absolute left-[-2.5rem] text-xl opacity-0 group-hover:opacity-100 group-hover:left-5 transition-all duration-500">{dir.icon}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-xl font-black uppercase tracking-tighter text-[var(--text)]">{t("settings_engine")}</h2>
        <div className="group">
          <label className="block text-[9px] font-black uppercase tracking-widest mb-2 ml-1 text-[var(--subtext)] opacity-60 transition-colors">{t("settings_conflict_res")}</label>
          <CustomSettingsDropdown 
            value={config.engine_agency_level || 1} 
            onChange={(val: any) => updateConfig('engine_agency_level', val)}
            options={[
              { id: 1, label: t("settings_autopilot") },
              { id: 2, label: t("settings_copilot") },
              { id: 3, label: t("settings_devmode") }
            ]} 
          />
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-xl font-black uppercase tracking-tighter text-[var(--text)]">{t("settings_capsule")}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="group">
            <label className="block text-[9px] font-black uppercase tracking-widest mb-2 ml-1 text-[var(--subtext)] opacity-60">{t("settings_backup_strat")}</label>
            <CustomSettingsDropdown 
              value={config.backup_preference || 0} 
              onChange={(val: any) => updateConfig('backup_preference', val)}
              options={[
                { id: 0, label: t("settings_auto_archive") },
                { id: 1, label: t("settings_prompt_first") },
                { id: 2, label: t("settings_disable_backups") }
              ]} 
            />
          </div>
          <div className="group">
            <label className="block text-[9px] font-black uppercase tracking-widest mb-2 ml-1 text-[var(--subtext)] opacity-60">{t("settings_retention")}</label>
            <CustomSettingsDropdown 
              value={config.backup_retention_cycles || 1} 
              onChange={(val: any) => updateConfig('backup_retention_cycles', val)}
              options={[
                { id: 1, label: t("settings_keep_1") },
                { id: 2, label: t("settings_keep_2") },
                { id: 999, label: t("settings_keep_all") }
              ]} 
            />
          </div>
        </div>
      </section>

      <div className="h-px w-full my-4" style={{ backgroundColor: `${currentTheme.text}10` }} />
        
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <span className="text-3xl theme-text-danger animate-pulse">{t("ui_icon_flag")}</span>
          <h2 className="text-xl font-black uppercase tracking-tighter text-[var(--text)]">
            {t("settings_anarchy_title")}
          </h2>
        </div>
        
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

          <div onClick={() => toggleRule('highlander')} className={`p-5 rounded-2xl border transition-all cursor-pointer flex items-center gap-4 group ${!rules.highlander ? 'theme-panel-danger theme-border-danger shadow-lg' : 'theme-glass-inner border-white/5 hover:border-white/20'}`}>
            <div className={`w-12 h-7 rounded-full flex items-center p-1 transition-colors ${!rules.highlander ? 'theme-bg-danger' : 'bg-white/10'}`}>
              <div className={`w-5 h-5 bg-white rounded-full transition-transform ${!rules.highlander ? 'translate-x-5 shadow-[-2px_0_5px_rgba(0,0,0,0.5)]' : 'translate-x-0'}`} />
            </div>
            <div className="flex flex-col">
              <span className={`text-xs font-black uppercase tracking-widest transition-colors ${!rules.highlander ? 'theme-text-danger' : 'text-[var(--text)]'}`}>{t("settings_anarchy_highlander")}</span>
              <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("settings_anarchy_highlander_desc")}</span>
            </div>
          </div>

          <div onClick={() => toggleRule('family')} className={`p-5 rounded-2xl border transition-all cursor-pointer flex items-center gap-4 group ${!rules.family ? 'theme-panel-danger theme-border-danger shadow-lg' : 'theme-glass-inner border-white/5 hover:border-white/20'}`}>
            <div className={`w-12 h-7 rounded-full flex items-center p-1 transition-colors ${!rules.family ? 'theme-bg-danger' : 'bg-white/10'}`}>
              <div className={`w-5 h-5 bg-white rounded-full transition-transform ${!rules.family ? 'translate-x-5 shadow-[-2px_0_5px_rgba(0,0,0,0.5)]' : 'translate-x-0'}`} />
            </div>
            <div className="flex flex-col">
              <span className={`text-xs font-black uppercase tracking-widest transition-colors ${!rules.family ? 'theme-text-danger' : 'text-[var(--text)]'}`}>{t("settings_anarchy_family")}</span>
              <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("settings_anarchy_family_desc")}</span>
            </div>
          </div>

          <div onClick={() => toggleRule('dependencies')} className={`p-5 rounded-2xl border transition-all cursor-pointer flex items-center gap-4 group ${!rules.dependencies ? 'theme-panel-danger theme-border-danger shadow-lg' : 'theme-glass-inner border-white/5 hover:border-white/20'}`}>
            <div className={`w-12 h-7 rounded-full flex items-center p-1 transition-colors ${!rules.dependencies ? 'theme-bg-danger' : 'bg-white/10'}`}>
              <div className={`w-5 h-5 bg-white rounded-full transition-transform ${!rules.dependencies ? 'translate-x-5 shadow-[-2px_0_5px_rgba(0,0,0,0.5)]' : 'translate-x-0'}`} />
            </div>
            <div className="flex flex-col">
              <span className={`text-xs font-black uppercase tracking-widest transition-colors ${!rules.dependencies ? 'theme-text-danger' : 'text-[var(--text)]'}`}>{t("settings_anarchy_deps")}</span>
              <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("settings_anarchy_deps_desc")}</span>
            </div>
          </div>

          <div onClick={() => toggleRule('intercept')} className={`p-5 rounded-2xl border transition-all cursor-pointer flex items-center gap-4 group ${!rules.intercept ? 'theme-panel-danger theme-border-danger shadow-lg' : 'theme-glass-inner border-white/5 hover:border-white/20'}`}>
            <div className={`w-12 h-7 rounded-full flex items-center p-1 transition-colors ${!rules.intercept ? 'theme-bg-danger' : 'bg-white/10'}`}>
              <div className={`w-5 h-5 bg-white rounded-full transition-transform ${!rules.intercept ? 'translate-x-5 shadow-[-2px_0_5px_rgba(0,0,0,0.5)]' : 'translate-x-0'}`} />
            </div>
            <div className="flex flex-col">
              <span className={`text-xs font-black uppercase tracking-widest transition-colors ${!rules.intercept ? 'theme-text-danger' : 'text-[var(--text)]'}`}>{t("settings_anarchy_intercept")}</span>
              <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("settings_anarchy_intercept_desc")}</span>
            </div>
          </div>

        </div>
      </section> 

      <section className="space-y-6 pt-6 border-t border-white/5">
        <h2 className="text-xl font-black uppercase tracking-tighter text-[var(--text)]">{t("settings_compliance")}</h2>
        <div className="flex items-center justify-between p-6 rounded-[2rem] theme-glass-inner border border-white/5 hover:border-white/20 transition-all cursor-pointer group" onClick={toggleMature}>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-black uppercase tracking-widest transition-colors group-hover:theme-text-accent text-[var(--text)]">{t("settings_mature_enable")}</span>
            <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--subtext)] opacity-60">{t("settings_mature_desc")}</span>
          </div>
          <div className={`w-14 h-8 rounded-full flex items-center p-1 transition-colors ${matureEnabled ? 'theme-bg-accent shadow-[0_0_20px_var(--accent)]' : 'bg-white/10'}`}>
            <div className={`w-6 h-6 bg-white rounded-full transition-transform duration-300 ${matureEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
          </div>
        </div>
      </section>

      <section className="space-y-6 pt-6 border-t border-white/5">
        <h2 className="text-xl font-black uppercase tracking-tighter text-[var(--text)]">{t("settings_security")}</h2>
        <button onClick={() => { setShowMalwareOverride(true); setMalwareToggleActive(false); setOverrideInput(''); }} className="w-full py-5 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all shadow-xl border bg-transparent theme-text-danger theme-border-danger hover:theme-bg-danger hover:text-[var(--bg)]">
          {t("settings_malware_btn")}
        </button>
      </section>

      <section className="space-y-6 pt-6 border-t border-white/5">
        <h2 className="text-xl font-black uppercase tracking-tighter text-[var(--text)]">Session Management</h2>
        <button onClick={async () => {
          await supabase.auth.signOut();
          window.location.reload();
        }} className="w-full py-5 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all shadow-xl border bg-transparent theme-text-warning border-white/10 hover:bg-white/10 hover:text-[var(--text)]">
          LOG OUT (GUEST TEST)
        </button>
      </section>

      {showMalwareOverride && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--bg)]/10 backdrop-blur-3xl p-8 animate-in fade-in duration-300">
          <div className="w-full max-w-xl theme-glass-panel border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] rounded-[3rem] p-10 flex flex-col gap-8 text-center" onClick={e => e.stopPropagation()}>
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <span className="text-6xl animate-pulse drop-shadow-md mb-2">{t("ui_icon_warning")}</span>
              <h2 className="text-2xl font-black theme-text-danger uppercase tracking-tighter">{t("settings_malware_title")}</h2>
              <p className="text-[10px] font-black text-[var(--text)] uppercase tracking-widest">{t("settings_malware_subtitle")}</p>
            </div>

            <div className="flex items-center justify-between p-6 rounded-[2rem] bg-[var(--bg)]/40 border border-[var(--text)]/5 shadow-inner cursor-pointer hover:bg-[var(--bg)]/60 transition-all" onClick={() => setMalwareToggleActive(!malwareToggleActive)}>
               <div className="flex flex-col gap-1 text-left">
                 <span className="text-sm font-black uppercase tracking-widest theme-text-danger">{t("settings_malware_disable")}</span>
                 <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text)] opacity-80">{t("settings_malware_disable_desc")}</span>
               </div>
               <div className={`w-14 h-8 rounded-full flex items-center p-1 transition-all ${malwareToggleActive ? 'theme-bg-danger opacity-30 border border-white/50' : 'bg-black/20 border border-[var(--text)]/10'}`}>
                 <div className={`w-6 h-6 bg-white rounded-full transition-transform duration-300 ${malwareToggleActive ? 'translate-x-6 shadow-[0_0_15px_white]' : 'translate-x-0'}`} />
               </div>
            </div>

            {malwareToggleActive ? (
              <div className="flex flex-col gap-8 animate-in slide-in-from-top-4 fade-in duration-300">
                <div className="p-6 bg-black/5 border border-white/5 rounded-[2rem] text-center shadow-inner">
                  <p className="text-[10px] font-black theme-text-danger uppercase tracking-widest leading-relaxed">
                    {t("settings_malware_warning")}
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <label className="text-[9px] font-black theme-text-danger uppercase tracking-widest text-center">{t("settings_malware_type_confirm")}</label>
                  <input value={overrideInput} onChange={(e) => setOverrideInput(e.target.value)} className="w-full bg-black/5 border border-[var(--text)]/20 rounded-2xl py-5 text-center theme-text-danger font-black text-lg uppercase tracking-widest focus:outline-none focus:border-[var(--text)]/50 shadow-inner" placeholder="I Confirm" />
                </div>
                
                <div className="flex gap-3 mt-2">
                  <button disabled={overrideInput !== 'I Confirm'} onClick={executeOverride} className="flex-1 py-4 theme-bg-danger text-[var(--bg)] rounded-xl font-black text-[10px] uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105 transition-all shadow-[0_0_15px_rgba(var(--danger-rgb),0.4)]">{t("settings_malware_sever")}</button>
                  <button onClick={() => { setShowMalwareOverride(false); setMalwareToggleActive(false); setOverrideInput(''); }} className="flex-1 py-4 theme-glass-inner border border-white/5 rounded-xl font-black text-[10px] uppercase text-[var(--text)] tracking-widest transition-all hover:bg-white/5 shadow-sm">{t("radar_tier3_cancel")}</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowMalwareOverride(false)} className="w-full py-5 theme-glass-panel border-white/10 rounded-2xl font-black text-[10px] uppercase tracking-widest text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/10 transition-all mt-4">
                {t("radar_tier3_cancel")}
              </button>
            )}
          </div>
        </div>
      )}

    </div>
  );
}