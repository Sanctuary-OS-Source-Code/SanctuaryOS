import React from 'react';
import { useStore } from './store';
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useLexicon } from "./LexiconContext";
import { useTheme } from "./ThemeContext";
import { CustomDropdown } from "./shared";

export function CartographerSetup({ preselectedGame, onCancel }: { preselectedGame?: any, onCancel?: () => void }) {
  const { t, activeLang, setActiveLang, registry, lexiconMeta } = useLexicon();
  const { CORE_THEMES, activeThemeId, setActiveThemeId } = useTheme();
  const [livePath, setLivePath] = React.useState("");
  const [modsPath, setModsPath] = React.useState("");
  const [vaultPath, setVaultPath] = React.useState("");
  const [isGlobalVaultSet, setIsGlobalVaultSet] = React.useState(false);
  const setIsConfigured = useStore((state) => state.setIsConfigured);
  const setStatus = useStore((state) => state.setStatus);

  React.useEffect(() => {
    async function loadGlobal() {
      try {
        const config: any = await invoke("get_global_config");
        if (config && config.vault_path) {
          setVaultPath(config.vault_path);
          setIsGlobalVaultSet(true);
        }
      } catch (e) {
        console.error(e);
      }
    }
    loadGlobal();
  }, []);
  
  async function pickLivePath() {
    const s = await open({ directory: true });
    if (s) setLivePath(s as string);
  }
  async function pickModsPath() {
    const s = await open({ directory: true });
    if (s) setModsPath(s as string);
  }
  async function pickVaultPath() {
    const s = await open({ directory: true });
    if (s) setVaultPath(s as string);
  }
  async function lockCoordinates() {
    if (!livePath || !modsPath || !vaultPath) {
      alert(t("alert_select_paths") || "Please select all required paths before proceeding.");
      return;
    }
    const globalConfig: any = await invoke("get_global_config");
    const newWorkspaceId = `workspace_${Date.now()}`;
    const newWorkspace = {
      id: newWorkspaceId,
      name: preselectedGame?.name || `Workspace ${globalConfig.workspaces?.length ? globalConfig.workspaces.length + 1 : 1}`,
      schema_id: preselectedGame?.schema_id || "sims4",
      live_path: livePath,
      mods_path: modsPath,
      vault_path: vaultPath,
      engine_agency_level: null,
      defcon_backup_target: null,
      backup_preference: null,
      engine_retention_cycles: null,
      world_retention_cycles: null,
      vault_capacity_gb: null,
      timeline_retention_copies: null,
      timeline_retention_size_mb: null,
      supabase_url: preselectedGame?.supabase_url || null,
      supabase_anon_key: preselectedGame?.supabase_anon_key || null,
    };
    
    globalConfig.workspaces = [...(globalConfig.workspaces || []), newWorkspace];
    globalConfig.active_workspace_id = newWorkspaceId;
    if (!globalConfig.vault_path) {
      globalConfig.vault_path = vaultPath;
    }
    
    await invoke("save_coordinates", { config: globalConfig });
    setIsConfigured(true);
    setTimeout(() => window.location.reload(), 300);
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center font-sans relative overflow-hidden transition-colors duration-1000" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <div className="absolute inset-0 z-0 bg-[url('/bg_workspace.png')] bg-cover bg-center bg-no-repeat opacity-40 mix-blend-screen transition-opacity duration-1000 animate-in fade-in" />
      <div className="absolute inset-0 z-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom, transparent, color-mix(in srgb, var(--bg) 50%, transparent), var(--bg))' }} />

      <div className="relative z-10 w-[95%] max-w-5xl theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-[var(--radius)] shadow-[0_40px_100px_rgba(0,0,0,0.4)] flex flex-col lg:flex-row overflow-hidden group">

        {/* LEFT COLUMN: The Setup Console */}
        <div className="p-8 lg:p-12 flex flex-col lg:w-1/2 border-b lg:border-b-0 lg:border-r border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative z-20">
          <div className="flex flex-col items-start mb-8">
            <div className="w-14 h-14 mb-4 relative flex items-center justify-center">
              <div className="absolute inset-0 theme-bg-accent opacity-20 blur-xl rounded-full transition-all duration-700" />
              <img src="/icon.png" alt="" className="w-10 h-10 object-contain relative z-10 drop-shadow-[0_2px_10px_rgba(0,0,0,0.2)]" />
            </div>
            <h1 className="text-2xl lg:text-3xl font-black uppercase tracking-widest text-[var(--headerText)] drop-shadow-sm">
              {preselectedGame?.name || t("setup_title") || "Initialize Cartographer"}
            </h1>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] theme-text-accent opacity-80 mt-2 transition-colors duration-500">
              {preselectedGame ? t("status_cartographer_init") || "Cartographer Initialization" : t("status_cartographer_init") || "Cartographer Initialization"}
            </p>
          </div>

          <div className="flex flex-col gap-3 w-full">
            <button
              onClick={async () => {
                try {
                  const paths: any = await invoke("auto_detect_paths");
                  if (paths) {
                    if (paths.live_path) setLivePath(paths.live_path);
                    if (paths.mods_path) setModsPath(paths.mods_path);
                    if (paths.vault_path) setVaultPath(paths.vault_path);
                    setStatus(t("settings_auto_detect_success") || "Paths Auto-Detected!");
                  }
                } catch (e) {
                  console.error(e);
                  setStatus(t("status_autodetect_failed"));
                }
              }}
              className="w-full theme-glass-inner backdrop-blur-md border border-[color-mix(in_srgb,var(--text)_10%,transparent)] px-5 py-3.5 rounded-xl text-[10px] font-black text-[var(--text)] hover:bg-[var(--accent)] hover:text-white hover:border-[var(--accent)]/30 active:scale-[0.98] transition-all flex items-center justify-center gap-3 uppercase tracking-widest mb-3 shadow-sm"
            >
              <span className="flex items-center gap-2"><span className="material-symbols-outlined !text-[14px]">cloud</span> {t("auto_auto_detect_paths") || "Auto-Detect Paths"}</span>
            </button>

            <button onClick={pickLivePath} className={`w-full theme-glass-inner backdrop-blur-md border ${livePath ? 'border-[var(--success)]/30 bg-[var(--success)]/10' : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)]/50 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'} px-5 py-3.5 rounded-xl text-[10px] font-bold text-[var(--text)] focus:outline-none transition-all flex items-center justify-between group shadow-sm`}>
              <span className="uppercase tracking-widest">{livePath ? t("setup_btn_bin_locked") || "Bin Locked" : t("setup_btn_bin") || "Select Bin Folder"}</span>
              <div className={`w-2 h-2 rounded-full ${livePath ? 'theme-bg-success shadow-[0_0_10px_var(--success)]' : 'bg-[var(--warning)] shadow-[0_0_10px_var(--warning)] animate-pulse'}`} />
            </button>
            <button onClick={pickModsPath} className={`w-full theme-glass-inner backdrop-blur-md border ${modsPath ? 'border-[var(--success)]/30 bg-[var(--success)]/10' : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)]/50 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'} px-5 py-3.5 rounded-xl text-[10px] font-bold text-[var(--text)] focus:outline-none transition-all flex items-center justify-between group shadow-sm`}>
              <span className="uppercase tracking-widest">{modsPath ? t("setup_btn_mods_locked") || "Mods Locked" : t("setup_btn_mods") || "Select Mods Folder"}</span>
              <div className={`w-2 h-2 rounded-full ${modsPath ? 'theme-bg-success shadow-[0_0_10px_var(--success)]' : 'bg-[var(--warning)] shadow-[0_0_10px_var(--warning)] animate-pulse'}`} />
            </button>
            <button onClick={!isGlobalVaultSet ? pickVaultPath : undefined} className={`w-full theme-glass-inner backdrop-blur-md border ${vaultPath ? 'border-[var(--success)]/30 bg-[var(--success)]/10' : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)]/50 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'} px-5 py-3.5 rounded-xl text-[10px] font-bold text-[var(--text)] focus:outline-none transition-all flex items-center justify-between group shadow-sm mb-3 ${isGlobalVaultSet ? 'opacity-80 cursor-not-allowed' : ''}`}>
              <span className="uppercase tracking-widest">{vaultPath ? (isGlobalVaultSet ? "OS Master Vault Enforced" : "Master Vault Locked") : "Select Master OS Vault"}</span>
              <div className={`w-2 h-2 rounded-full ${vaultPath ? 'theme-bg-success shadow-[0_0_10px_var(--success)]' : 'bg-[var(--warning)] shadow-[0_0_10px_var(--warning)] animate-pulse'}`} />
            </button>

            <div className="flex flex-col gap-3 mb-4">
              <div className="flex flex-col gap-1.5 relative z-50">
                <label className="text-[9px] font-black uppercase tracking-widest theme-text-accent opacity-80 pl-1">{t("settings_tab_lexicons") || "Lexicon"}</label>
                <CustomDropdown
                  searchable={true}
                  disableTint={true}
                  value={activeLang}
                  onChange={(v: string[]) => setActiveLang(v[0])}
                  options={
                    (() => {
                      const buildOption = (id: string, name: string, badge: string, isCustom: boolean = false) => {
                        const displayName = isCustom ? `Custom: ${name}` : name;
                        const badgeColor = badge.toLowerCase() === 'sanctuary' 
                          ? 'border-[var(--accent)]/30 text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]'
                          : 'border-white/10 text-[var(--text)] bg-white/5';
                        return {
                          id,
                          searchText: `${displayName} ${badge} ${id.toLowerCase().startsWith('en-') ? 'English' : ''} ${id.toLowerCase().startsWith('de-') ? 'German' : ''}`,
                          label: (
                            <div className="flex items-center justify-between w-full">
                              <span className="truncate pr-4 normal-case">{displayName}</span>
                              <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${badgeColor} shrink-0`}>
                                {badge}
                              </span>
                            </div>
                          )
                        };
                      };

                      const result: any[] = [];
                      const addedIds = new Set<string>();

                      // 1. Add DB items (Cloud sync is source of truth for overwrites)
                      if (lexiconMeta && lexiconMeta.length > 0) {
                        lexiconMeta.forEach((m: any) => {
                          let labelName = m.name;
                          if (labelName && labelName.toUpperCase() === 'EN-SIMS') labelName = 'English (Sims)';
                          if (labelName === 'EN-Sims') labelName = 'English (Sims)';
                          result.push(buildOption(m.id, labelName, m.badge));
                          addedIds.add(m.id);
                        });
                      }

                      // 2. Add base OS fallbacks (Only if not provided by cloud)
                      const fallbacks = [
                        { id: 'en-sanctuary', name: 'English (Sanctuary)', badge: 'Sanctuary' },
                        { id: 'en-default', name: 'English (Default)', badge: 'Sanctuary' },
                        { id: 'en-sims', name: 'English (Sims)', badge: 'Community' },
                        { id: 'de-default', name: 'German (Default)', badge: 'Community' }
                      ];

                      fallbacks.forEach(f => {
                        if (!addedIds.has(f.id)) {
                          result.push(buildOption(f.id, f.name, f.badge));
                          addedIds.add(f.id);
                        }
                      });

                      // 3. Add local registry items (excluding legacy duplicates and already added items)
                      Object.keys(registry || {}).forEach(k => {
                        if (!addedIds.has(k) && k !== 'default' && k !== 'sanctuary') {
                          result.push(buildOption(k, k, 'Local', true));
                          addedIds.add(k);
                        }
                      });

                      return result;
                    })()
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5 relative z-50">
                <label className="text-[9px] font-black uppercase tracking-widest theme-text-accent opacity-80 pl-1">{t("settings_tab_themes") || "Aesthetics"}</label>
                <CustomDropdown
                  disableTint={true}
                  value={activeThemeId}
                  onChange={(v: string[]) => setActiveThemeId(v[0])}
                  options={Object.entries(CORE_THEMES).map(([id, t]: [string, any]) => ({ id: id, label: t.name }))}
                />
              </div>
            </div>

            <button
              onClick={lockCoordinates}
              disabled={!livePath || !modsPath || !vaultPath}
              className="w-full mt-2 py-4 rounded-xl font-black text-[11px] uppercase tracking-[0.2em] transition-all bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] backdrop-blur-md border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] theme-text-accent hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_20%,transparent)] active:scale-[0.98] disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2 group/lock"
            >
              <span className="material-symbols-outlined !text-[16px] group-hover/lock:scale-110 transition-transform duration-500">lock</span>
              {t("setup_btn_lock") || "Lock Coordinates"}
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: The Aesthetic Preview */}
        <div className="lg:w-1/2 p-8 lg:p-12 flex flex-col relative overflow-hidden">
          <div className="absolute inset-0 theme-bg-accent opacity-[0.03] pointer-events-none transition-colors duration-1000" />

          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] mb-8 theme-text-accent drop-shadow-sm flex items-center gap-2 relative z-10 transition-colors duration-500">
            <span className="material-symbols-outlined !text-[14px]">visibility</span>
            {t("settings_tab_themes") || "Aesthetic Preview"}
          </h3>

          <div className="flex flex-col gap-6 relative z-10 flex-1 justify-center">
            {/* Fake Component 1: Mod Card / Transmission */}
            <div className="theme-glass-panel p-6 rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-2xl hover:border-[var(--accent)]/30 transition-all duration-700">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full theme-bg-accent/20 flex items-center justify-center border border-[var(--accent)]/30 transition-colors duration-500">
                    <span className="material-symbols-outlined theme-text-accent !text-[18px]">engineering</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[var(--headerText)]">{t("sidebar_app_title")}</h4>
                    <p className="text-[9px] theme-text-accent uppercase tracking-widest font-black opacity-80 transition-colors duration-500">{t("tab_architect") || "ARCHITECT"}</p>
                  </div>
                </div>
                <div className="px-3 py-1.5 theme-bg-success/10 border border-[var(--success)]/20 rounded-full text-[var(--success)] text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full theme-bg-success animate-pulse" />
                  {t("status_online") || "ONLINE"}
                </div>
              </div>
              <h5 className="text-sm font-bold mb-2 text-[var(--text)]">{t("comms_handshake") || "Awaiting Cryptographic Handshake."}</h5>
              <p className="text-xs text-[var(--subtext)] leading-relaxed mb-6 line-clamp-2">
                {t("alert_guest_mode_uploads") || "Guest mode active. Uploads and global flags are disabled."}
              </p>
              <div className="flex items-center gap-3">
                <button className="px-5 py-2 bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] border border-[color-mix(in_srgb,var(--accent)_50%,transparent)] text-[var(--accent)] rounded-lg text-[10px] font-black uppercase tracking-widest shadow-[inset_0_0_15px_color-mix(in_srgb,var(--accent)_10%,transparent),0_0_15px_color-mix(in_srgb,var(--accent)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 backdrop-blur-md">
                  <span className="material-symbols-outlined !text-[14px]">bolt</span>
                  {t("context_initialize") || "INITIALIZE"}
                </button>
                <button className="px-5 py-2 theme-glass-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors">
                  {t("nav_cancel") || "CANCEL"}
                </button>
              </div>
            </div>

            {/* Fake Component 2: System Status widgets */}
            <div className="grid grid-cols-2 gap-4">
              <div className="theme-glass-panel p-5 rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 relative overflow-hidden group/stat shadow-xl">
                <div className="absolute inset-0 bg-gradient-to-br from-[var(--success)]/10 to-transparent opacity-0 group-hover/stat:opacity-100 transition-opacity duration-500" />
                <span className="text-[9px] font-black tracking-[0.2em] theme-text-accent uppercase opacity-80 relative z-10 transition-colors duration-500">{t("status") || "STATUS"}</span>
                <div className="flex items-center gap-2.5 relative z-10">
                  <div className="w-2 h-2 rounded-full theme-bg-success shadow-[0_0_10px_var(--success)]" />
                  <span className="text-sm font-bold text-[var(--text)] tracking-wide">{t("status_operational") || "OPERATIONAL"}</span>
                </div>
              </div>
              <div className="theme-glass-panel p-5 rounded-2xl border border-[var(--warning)]/30 flex flex-col gap-2 relative overflow-hidden hover:border-[var(--warning)]/50 transition-colors shadow-xl">
                <div className="absolute inset-0 bg-[var(--warning)]/10" />
                <span className="text-[9px] font-black tracking-[0.2em] text-[var(--warning)] uppercase opacity-90 relative z-10">DEFCON</span>
                <div className="flex items-center gap-2.5 relative z-10">
                  <span className="material-symbols-outlined !text-[16px] text-[var(--warning)] drop-shadow-[0_0_8px_var(--warning)]">warning</span>
                  <span className="text-sm font-bold text-[var(--text)] tracking-wide">LEVEL 3</span>
                </div>
              </div>
            </div>
          </div>

          {/* Decorative Background Elements */}
          <div className="absolute -bottom-32 -right-32 w-96 h-96 theme-bg-accent rounded-full opacity-10 blur-[100px] pointer-events-none transition-all duration-1000" />
          <div className="absolute top-10 -right-10 w-40 h-40 theme-bg-success rounded-full opacity-[0.05] blur-[80px] pointer-events-none transition-all duration-1000" />
        </div>

      </div>
    </div>
  );
}
