import React, { useState } from 'react';
import { useStore } from './store';
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useLexicon } from "./LexiconContext";
import { useTheme } from "./ThemeContext";
import {
  CustomDropdown,
  SidePanel,
  ActionButton,
  HoverTooltip,
  SidePanelHeroCard,
  UniversalGroup,
} from "./shared";
import { CommandScreenBody, CommandScreenMain, CommandScreenSectionHeading } from "./hub-components/SharedCommandScreenLayout";
import { UniversalCard } from "./components/universal/UniversalCard";

export function CartographerSetup({ preselectedGame, onCancel }: { preselectedGame?: any, onCancel?: () => void }) {
  const { t, activeLang, setActiveLang, registry, lexiconMeta } = useLexicon();
  const { CORE_THEMES, customThemes, activeThemeId, setActiveThemeId, currentTheme } = useTheme();

  const [livePath, setLivePath] = React.useState("");
  const [modsPath, setModsPath] = React.useState("");
  const [vaultPath, setVaultPath] = React.useState("");
  const [isGlobalVaultSet, setIsGlobalVaultSet] = React.useState(true); // default true until checked

  const [isThemePreviewOpen, setIsThemePreviewOpen] = useState(false);

  const setIsConfigured = useStore((state) => state.setIsConfigured);
  const setStatus = useStore((state) => state.setStatus);

  React.useEffect(() => {
    async function loadGlobal() {
      try {
        const config: any = await invoke("get_global_config");
        if (config && config.vault_path) {
          setVaultPath(config.vault_path);
          setIsGlobalVaultSet(true);
        } else {
          setIsGlobalVaultSet(false);
        }
      } catch (e) {
        console.error(e);
        setIsGlobalVaultSet(false);
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
    if (!livePath || !modsPath || (!isGlobalVaultSet && !vaultPath)) {
      alert(t("ui_fdw_severed", "Required paths are not configured."));
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
    if (!isGlobalVaultSet && vaultPath) {
      globalConfig.vault_path = vaultPath;
    }

    await invoke("save_coordinates", { config: globalConfig });
    setIsConfigured(true);
    setTimeout(() => window.location.reload(), 300);
  }

  const lexiconOptions = React.useMemo(() => {
    const buildOption = (id: string, name: string, badge: string, isCustom: boolean = false) => {
      const displayName = isCustom ? `${t("badge_custom", "Custom")}: ${name}` : name;
      const badgeColor = badge.toLowerCase() === 'sanctuary'
        ? 'border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] bg-transparent'
        : 'border-[color-mix(in_srgb,var(--text)_18%,transparent)] text-[var(--text)] bg-transparent';
      return {
        id,
        searchText: `${displayName} ${badge} ${id.toLowerCase().startsWith('en-') ? 'English' : ''} ${id.toLowerCase().startsWith('de-') ? 'German' : ''}`,
        label: (
          <div className="flex items-center justify-start w-full">
            <span className="truncate pr-4 normal-case">{displayName}</span>
            <span className={`px-2 py-0.5 rounded-full text-[8px] font-black capitalize tracking-widest border ${badgeColor} shrink-0`}>
              {badge}
            </span>
          </div>
        )
      };
    };

    const result: any[] = [];
    const addedIds = new Set<string>();

    if (lexiconMeta && lexiconMeta.length > 0) {
      lexiconMeta.forEach((m: any) => {
        let labelName = m.name;
        if (labelName && labelName.toUpperCase() === 'EN-SIMS') labelName = 'English (Sims)';
        if (labelName === 'EN-Sims') labelName = 'English (Sims)';

        // Only include community lexicons if they match the game schema, OR if they are core OS lexicons
        if (!m.schema_id || m.schema_id === 'core' || m.schema_id === preselectedGame?.schema_id) {
          result.push(buildOption(m.id, labelName, m.badge || t("badge_community", "Community")));
          addedIds.add(m.id);
        }
      });
    }

    const fallbacks = [
      { id: 'en-sanctuary', name: 'English (Sanctuary)', badge: t("badge_sanctuary", "Sanctuary") },
      { id: 'en-default', name: 'English (Default)', badge: t("badge_sanctuary", "Sanctuary") },
      { id: 'en-sims', name: 'English (Sims)', badge: t("badge_community", "Community") },
      { id: 'de-default', name: 'German (Default)', badge: t("badge_community", "Community") }
    ];

    fallbacks.forEach(f => {
      if (!addedIds.has(f.id)) {
        result.push(buildOption(f.id, f.name, f.badge));
        addedIds.add(f.id);
      }
    });

    Object.keys(registry || {}).forEach(k => {
      if (!addedIds.has(k) && k !== 'default' && k !== 'sanctuary') {
        result.push(buildOption(k, k, t("badge_local", "Local"), true));
        addedIds.add(k);
      }
    });

    return result;
  }, [lexiconMeta, registry, preselectedGame, t]);

  const obfuscatePath = (p: string) => p ? p.replace(/([A-Za-z]:\\[Uu]sers\\[^\\]+)/, (_match, p1) => {
    const parts = p1.split('\\');
    parts[2] = '***';
    return parts.join('\\');
  }) : t("path_not_set", "Not Set");

  const allThemes = Object.entries({ ...CORE_THEMES, ...customThemes });

  return (
    <>
      <CommandScreenSectionHeading
        title={t("sys_coords", "System Coordinates")}
        breadcrumb={`${t("setup_title", "Workspace Setup")} ${preselectedGame?.name || ''}`}
        subtitle={t("setup_title", "Workspace Setup")}
        icon={t("icon_build", "build")}
        shape="square"
        onBack={onCancel}
        rightContent={
          <div className="flex gap-3">
            <div className="relative group/detect">
              <button
                onClick={() => console.log('Auto detect mock')}
                className="w-12 h-12 rounded-xl glass-surface flex items-center justify-center hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-all border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] shadow-sm group disabled:opacity-30 disabled:cursor-not-allowed disabled:pointer-events-none"
              >
                <span className="material-symbols-outlined !text-[20px] opacity-70 group-hover:opacity-100 transition-transform group-hover:scale-110">{t("icon_search", "search")}</span>
              </button>
              <HoverTooltip title={t("setup_btn_auto_detect", "Auto-Detect")} noIcon={true} className="!hidden group-hover/detect:!flex !top-[calc(100%+8px)] !right-0 !translate-x-0 z-[200]" />
            </div>

            <div className="relative group/lock">
              <button
                onClick={lockCoordinates}
                disabled={!livePath || !modsPath || (!isGlobalVaultSet && !vaultPath)}
                className="w-12 h-12 rounded-xl glass-surface flex items-center justify-center hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:text-[var(--accent)] transition-all border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-md group disabled:opacity-30 disabled:cursor-not-allowed disabled:pointer-events-none"
              >
                <span className="material-symbols-outlined !text-[20px] opacity-80 group-hover:opacity-100 transition-transform group-hover:scale-110">{t("icon_lock", "lock")}</span>
              </button>
              <HoverTooltip title={(!livePath || !modsPath || (!isGlobalVaultSet && !vaultPath)) ? t("fill_required_fields", "Fill Required Fields") : t("setup_btn_lock", "Lock Coordinates")} noIcon={true} variant={(!livePath || !modsPath || (!isGlobalVaultSet && !vaultPath)) ? "warning" : "accent"} className="!hidden group-hover/lock:!flex !top-[calc(100%+8px)] !right-0 !translate-x-0 z-[200]" />
            </div>
          </div>
        }
      />
      <CommandScreenBody>
        <CommandScreenMain>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 w-full max-w-6xl mx-auto pb-20 items-start">
            {/* Live Bin Path */}
            <UniversalCard
              title={t("tab_bin_folder", "Game Installation Path")}
              subtitle={obfuscatePath(livePath)}
              icon={t("icon_folder_special", "folder_special")}
              onClick={pickLivePath}
              layout="vertical"
              className={!livePath ? 'border-[color-mix(in_srgb,var(--warning)_50%,transparent)] shadow-[0_0_15px_color-mix(in_srgb,var(--warning)_10%,transparent)]' : 'border-[color-mix(in_srgb,var(--success)_30%,transparent)]'}
            >
              {!livePath && (
                <div className="mt-4 px-3 py-2 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--warning)_40%,transparent)] text-[var(--warning)] text-xs font-bold flex items-center gap-2">
                  <span className="material-symbols-outlined !text-[14px]">{t("icon_warning", "warning")}</span>
                  {t("action_required", "Action Required")}
                </div>
              )}
            </UniversalCard>

            {/* Mods Path */}
            <UniversalCard
              title={t("library_path", "Active Library ({Mods} Folder)")}
              subtitle={obfuscatePath(modsPath)}
              icon={t("icon_folder", "folder")}
              onClick={pickModsPath}
              layout="vertical"
              className={!modsPath ? 'border-[color-mix(in_srgb,var(--warning)_50%,transparent)] shadow-[0_0_15px_color-mix(in_srgb,var(--warning)_10%,transparent)]' : 'border-[color-mix(in_srgb,var(--success)_30%,transparent)]'}
            >
              {!modsPath && (
                <div className="mt-4 px-3 py-2 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--warning)_40%,transparent)] text-[var(--warning)] text-xs font-bold flex items-center gap-2">
                  <span className="material-symbols-outlined !text-[14px]">{t("icon_warning", "warning")}</span>
                  {t("action_required", "Action Required")}
                </div>
              )}
            </UniversalCard>

            {/* Vault Path (Only if not set globally) */}
            {!isGlobalVaultSet && (
              <UniversalCard
                title={t("vault_path", "The {Vault} Path")}
                subtitle={obfuscatePath(vaultPath)}
                icon={t("icon_dns", "dns")}
                onClick={pickVaultPath}
                layout="vertical"
                className={!vaultPath ? 'border-[color-mix(in_srgb,var(--warning)_50%,transparent)] shadow-[0_0_15px_color-mix(in_srgb,var(--warning)_10%,transparent)]' : 'border-[color-mix(in_srgb,var(--success)_30%,transparent)]'}
              >
                <div className="mt-4 px-3 py-2 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] text-[10px] font-bold flex items-center gap-2">
                  <span className="material-symbols-outlined !text-[14px]">{t("icon_info", "info")}</span>
                  {t("setup_vault_required", "Initial OS Master {Vault} Setup Required")}
                </div>
              </UniversalCard>
            )}

            {/* Lexicon Dropdown */}
            <UniversalCard
              title={t("settings_tab_lexicons", "Language & Terminology")}
              subtitle={t("settings_tab_lexicons_desc", "Choose your preferred UI language and terminology")}
              icon={t("icon_translate", "translate")}
              layout="vertical"
              className="overflow-visible z-30 relative"
            >
              <div className="mt-4 relative" onClick={(e) => e.stopPropagation()}>
                <CustomDropdown
                  disableTint={true}
                  value={activeLang}
                  onChange={(v: string[]) => setActiveLang(v[0])}
                  options={lexiconOptions}
                />
              </div>
            </UniversalCard>

            {/* Theme Dropdown */}
            <UniversalCard
              title={t("ui_chameleons", "{Chameleons}")}
              subtitle={t("ui_chameleons_subtitle", "Select your active interface theme")}
              icon={t("icon_palette", "palette")}
              onClick={() => setIsThemePreviewOpen(true)}
              layout="vertical"
              className="overflow-visible z-20 relative cursor-pointer hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] transition-colors"
            >
              <div className="mt-4 flex items-center gap-3">
                <div className="flex -space-x-2">
                  {allThemes.slice(0, 3).map(([id, theme]: [string, any]) => (
                    <div key={id} className={`w-8 h-8 rounded-full border-2 border-[var(--panelTint)] shadow-sm ${activeThemeId === id ? 'scale-110 z-10 border-[var(--accent)]' : ''}`} style={{ backgroundColor: theme.accent }} />
                  ))}
                </div>
                <span className="text-[10px] font-bold text-[var(--subtext)]">{t("click_to_browse", "Click to browse themes")}</span>
              </div>
            </UniversalCard>
          </div>
        </CommandScreenMain>
      </CommandScreenBody>

      <SidePanel
        isOpen={isThemePreviewOpen}
        onClose={() => setIsThemePreviewOpen(false)}
        title={t("chameleon_title", "{Chameleon} Library")}
        subtitle={t("ui_chameleons_subtitle", "Select your active interface theme")}
        icon={t("icon_palette", "palette")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[680px]"
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_palette", "palette")}
            overline={t("ui_chameleons", "{Chameleons}")}
            title={t("chameleon_title", "{Chameleon} Library")}
            description={t("ui_chameleons_subtitle", "Select your active interface theme")}
            badge={currentTheme?.name || `${allThemes.length}`}
            variant="accent"
          />

          <UniversalGroup
            title={t("ui_chameleons", "{Chameleons}")}
            icon={t("icon_palette", "palette")}
            headerAction={
              <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-transparent border border-[color-mix(in_srgb,var(--text)_18%,transparent)] text-[var(--subtext)]">
                {allThemes.length}
              </span>
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {allThemes.map(([id, theme]: [string, any]) => (
                <div
                  key={id}
                  onClick={() => setActiveThemeId(id)}
                  className={`relative rounded-xl overflow-hidden cursor-pointer border-2 transition-all ${activeThemeId === id ? 'border-[var(--accent)] shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_30%,transparent)] scale-[1.02] z-10' : 'border-transparent hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] opacity-70 hover:opacity-100'}`}
                >
                  <div className="aspect-video bg-black relative">
                    {theme.bgImage && <img src={theme.bgImage} className="absolute inset-0 w-full h-full object-cover" />}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                    <div className="absolute bottom-3 left-3 flex flex-col">
                      <span className="text-white font-bold text-sm drop-shadow-md tracking-wider">{theme.name}</span>
                      <div className="flex gap-1.5 mt-2">
                        <div className="w-3 h-3 rounded-full shadow-sm border border-white/20" style={{ backgroundColor: theme.accent }} />
                        <div className="w-3 h-3 rounded-full shadow-sm border border-white/20" style={{ backgroundColor: theme.bg }} />
                      </div>
                    </div>
                    {activeThemeId === id && (
                      <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-[var(--accent)] text-white flex items-center justify-center shadow-md">
                        <span className="material-symbols-outlined !text-[14px]">{t("icon_check", "check")}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </UniversalGroup>
        </div>
      </SidePanel>
    </>
  );
}
