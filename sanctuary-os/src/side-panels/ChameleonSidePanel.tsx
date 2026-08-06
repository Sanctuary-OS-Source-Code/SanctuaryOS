import { useState } from 'react';
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { useLexicon } from '../LexiconContext';
import { useTheme } from '../ThemeContext';
import { useStore } from '../store';
import { SidePanel, CustomDropdown, HoverTooltip, SearchBar, HubTabs, FilterTabs, FilterTabButton } from '../shared';
import { CommandScreenQuickLink } from '../hub-components/SharedCommandScreenLayout';
import { ChameleonEditorPanel } from '../side-panels/ChameleonEditorPanel';

const standardButtonClass = "px-6 py-3 rounded-2xl theme-glass-inner text-[var(--text)] text-[10px] font-black uppercase tracking-widest transition-all shadow-lg hover:theme-border-accent hover:scale-105 active:scale-95 border border-white/10 backdrop-blur-xl flex items-center justify-center gap-3 hover:bg-white/5";

const getLuminance = (hex: string) => {
  const cleanHex = (hex || '#000000').replace('#', '').padEnd(6, '0').slice(0, 6);
  const r = parseInt(cleanHex.slice(0, 2), 16) || 0;
  const g = parseInt(cleanHex.slice(2, 4), 16) || 0;
  const b = parseInt(cleanHex.slice(4, 6), 16) || 0;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};

export default function ChameleonSidePanel({ config, isOpen, onClose }: any) {
  const { t } = useLexicon();
  const { currentTheme, activeThemeId, setActiveThemeId, CORE_THEMES, customThemes, renameTheme, createNewTheme, importTheme, deleteTheme, useGlobalTheme, setUseGlobalTheme } = useTheme();
  const setView = useStore(state => state.setView);
  const setMarketTab = useStore(state => state.setMarketTab);

  const [editingThemeId, setEditingThemeId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | false>(false);
  const [newThemeName, setNewThemeName] = useState("");

  const [themeSearch, setThemeSearch] = useState("");
  const [selectedCommunity, setSelectedCommunity] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<string | null>(null);

  const [favoriteThemes, setFavoriteThemes] = useState<string[]>(() => JSON.parse(localStorage.getItem("sanctuary_favorite_themes") || '["architect"]'));

  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const toggleFavoriteTheme = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    let updated;
    if (favoriteThemes.includes(id)) {
      updated = favoriteThemes.filter((c: string) => c !== id);
    } else {
      updated = [...favoriteThemes, id];
    }
    setFavoriteThemes(updated);
    localStorage.setItem("sanctuary_favorite_themes", JSON.stringify(updated));
  };

  const handleExportTheme = async (e: React.MouseEvent, themeObj: any) => {
    e.stopPropagation();
    try {
      const defaultPath = config?.vault_path ? `${config.vault_path}\\Data\\Themes\\${themeObj.name}.json` : `${themeObj.name}.json`;
      const path = await save({ defaultPath, filters: [{ name: 'JSON', extensions: ['json'] }] });
      if (path) await writeTextFile(path, JSON.stringify(themeObj, null, 2));
    } catch (err) { useStore.getState().pushStatus(`${t("alert_export_failed")}${err}`); }
  };

  const handleImportTheme = async () => {
    try {
      const selected = await open({ filters: [{ name: 'Theme', extensions: ['json'] }] });
      if (!selected) return;
      const content = await readTextFile(selected as string);
      importTheme(JSON.parse(content));
    } catch (err) { useStore.getState().pushStatus(`${t("alert_import_failed")}${err}`); }
  };

  const getThemeBadge = (id: string, data: any) => {
    if (CORE_THEMES[id]) {
      return t("badge_sanctuary") || 'Sanctuary';
    }
    if (data.badge) {
      return data.badge;
    }
    return t("badge_custom") || 'Custom';
  };

  const getThemeMode = (data: any) => {
    return getLuminance(data.bg) < 0.5 ? (t("mode_dark") || "Dark") : (t("mode_light") || "Light");
  };

  const handleEditClick = (e: React.MouseEvent, id: string, data: any) => {
    e.stopPropagation();
    setActiveThemeId(id);
    setIsEditorOpen(true);
  };

  const allThemes = { ...CORE_THEMES, ...customThemes };
  const allThemeIds = Object.keys(allThemes);

  const uniqueCommunities = Array.from(new Set(allThemeIds.map(id => getThemeBadge(id, allThemes[id]))));
  const uniqueModes = [t("mode_dark") || "Dark", t("mode_light") || "Light"];

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("chameleon_title")}
      icon="palette"
      widthClass="w-[900px]"
      footer={null}
      noPadding
    >
      <div className="flex flex-col gap-6 p-10 pt-2 h-full min-h-[600px]">
        <div className="flex flex-col gap-3 w-full shrink-0 z-50 mb-2 px-1">
          {/* Row 1: Actions */}
          <div className="w-full h-12">
            <HubTabs
              className="h-full w-full !rounded-2xl"
              tabs={[
                { id: 'nexus', icon: 'explore', label: t("tab_nexus") || "Nexus" },
                { id: 'import', icon: 'download', label: t("btn_import") || "Import" },
                { id: 'create', icon: 'add', label: t("btn_create_theme") || "Forge" }
              ]}
              activeTab={null}
              setTab={(id: string) => {
                if (id === 'nexus') { setMarketTab('CHAMELEONS'); setView('nexus'); onClose(); }
                if (id === 'import') handleImportTheme();
                if (id === 'create') createNewTheme();
              }}
            />
          </div>

          {/* Row 2: Search */}
          <div className="w-full h-12">
            <SearchBar
              value={themeSearch}
              onChange={setThemeSearch}
              placeholder={t("ui_search_chameleons") || "Search aesthetics..."}
              className="h-full w-full !rounded-2xl"
            />
          </div>

          {/* Row 3: Filters */}
          <div className="flex items-center gap-4 w-full h-10">
            <div className="flex-1 h-full">
              <FilterTabs className="h-full !rounded-xl">
                <FilterTabButton
                  id="workspace"
                  icon="grid_view"
                  label={t("scope_workspace") || "Workspace"}
                  activeTab={!useGlobalTheme ? "workspace" : ""}
                  setTab={() => setUseGlobalTheme(false)}
                />
                <FilterTabButton
                  id="global"
                  icon="public"
                  label={t("scope_global") || "Global"}
                  activeTab={useGlobalTheme ? "global" : ""}
                  setTab={() => setUseGlobalTheme(true)}
                />
              </FilterTabs>
            </div>
            
            <div className="flex-1 h-full">
              <CustomDropdown
                className="h-full"
                value={selectedCommunity}
                options={[{ id: null, label: "ALL COMMUNITIES" }, ...uniqueCommunities.map(community => ({ id: community, label: typeof community === 'string' ? community.toUpperCase() : community }))]}
                onChange={(val: any) => setSelectedCommunity(val?.[0] ?? null)}
                placeholder="ALL COMMUNITIES"
              />
            </div>
            
            <div className="flex-1 h-full">
              <CustomDropdown
                className="h-full"
                value={selectedMode}
                options={[{ id: null, label: "ALL MODES" }, ...uniqueModes.map(mode => ({ id: mode, label: typeof mode === 'string' ? mode.toUpperCase() : mode }))]}
                onChange={(val: any) => setSelectedMode(val?.[0] ?? null)}
                placeholder="ALL MODES"
              />
            </div>
          </div>
        </div>

        {favoriteThemes.length > 0 && (
          <div className="flex flex-col gap-4 w-full mb-6 z-10">
            <div className="flex items-center gap-3 pl-1 mb-1">
              <span className="material-symbols-outlined text-[var(--accent)] !text-[16px]">{t("icon_keep") || "keep"}</span>
              <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--text)] drop-shadow-md">{t("installed_themes") || "Installed Aesthetics"}</h3>
              <div className="flex-1 h-px bg-gradient-to-r from-[color-mix(in_srgb,var(--accent)_40%,transparent)] to-transparent" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              {favoriteThemes.filter(id => allThemes[id]).map(id => {
                const data = allThemes[id];
                return (
                  <div
                    key={id}
                    onClick={() => setActiveThemeId(id)}
                    className={`flex flex-col p-4 rounded-xl theme-glass-panel transition-all shadow-lg hover:shadow-xl hover:-translate-y-1 active:scale-95 border cursor-pointer group relative overflow-hidden ${activeThemeId === id
                      ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)]'
                      : 'border-white/5 hover:border-white/20'
                      }`}
                  >
                    {activeThemeId === id && <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/10 to-transparent pointer-events-none" />}

                    <div className="flex justify-between items-start mb-4 relative z-10">
                      <div className="w-8 h-8 rounded-full shadow-md border border-white/10 shrink-0" style={{ backgroundColor: data.accent }} />

                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity absolute right-3 top-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleFavoriteTheme(id, e); }}
                          className={`relative w-7 h-7 rounded-full transition-all bg-black/40 border border-white/10 hover:border-white/30 backdrop-blur-sm shadow-md ${favoriteThemes.includes(id)
                            ? 'text-[var(--accent)] border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] drop-shadow-[0_0_5px_currentColor]'
                            : 'text-[var(--subtext)] hover:text-white'
                            }`}
                        >
                          <span className="material-symbols-outlined !text-[14px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ fontVariationSettings: favoriteThemes.includes(id) ? "'FILL' 1" : "'FILL' 0" }}>star</span>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleExportTheme(e, data); }} className="relative w-7 h-7 rounded-full transition-all bg-black/40 border border-white/10 hover:border-white/30 hover:text-white backdrop-blur-sm text-[var(--subtext)] cursor-pointer shadow-md">
                          <span className="material-symbols-outlined !text-[16px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ml-[1px]">{t("icon_save")}</span>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleEditClick(e, id, data); }} className="relative w-7 h-7 rounded-full transition-all bg-black/40 border border-white/10 hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:text-white hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] backdrop-blur-sm theme-text-accent cursor-pointer shadow-md">
                          <span className="material-symbols-outlined !text-[16px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">{t("icon_tune") || "tune"}</span>
                        </button>

                        {!CORE_THEMES[id] && (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); setNewThemeName(data.name); setEditingThemeId(id); }} className="relative w-7 h-7 rounded-full transition-all bg-black/40 border border-white/10 hover:border-white/30 hover:text-white backdrop-blur-sm text-[var(--subtext)] cursor-pointer shadow-md">
                              <span className="material-symbols-outlined !text-[16px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">{t("icon_edit")}</span>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirmDelete === id) { deleteTheme(id); setConfirmDelete(false); }
                                else { setConfirmDelete(id); }
                              }}
                              onMouseLeave={() => setConfirmDelete(false)}
                              className={`relative w-7 h-7 rounded-full transition-all bg-black/40 border border-white/10 backdrop-blur-sm cursor-pointer shadow-md ${confirmDelete === id ? 'bg-[color-mix(in_srgb,var(--danger)_30%,transparent)] border-[var(--danger)] text-[var(--danger)] scale-110 shadow-[0_0_10px_rgba(var(--danger-rgb),0.5)]' : 'hover:bg-red-500/10 hover:border-red-500/50 theme-text-danger'}`}
                            >
                              <span className="material-symbols-outlined !text-[16px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">{confirmDelete === id ? t("icon_warning") || 'warning' : t("icon_delete") || 'delete'}</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1 relative z-10">
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
                          className="w-full bg-black/40 border border-white/20 rounded md px-2 py-1 text-[11px] font-black uppercase tracking-[0.2em] outline-none shadow-inner transition-all text-white focus:border-[var(--accent)]"
                        />
                      ) : (
                        <span className={`text-[12px] font-black uppercase tracking-[0.2em] truncate ${activeThemeId === id ? "text-[var(--text)]" : "text-[var(--text)]"}`}>{data.name}</span>
                      )}
                      <div className="flex items-center gap-2 mt-1 opacity-80">
                        <span className="px-1.5 py-0.5 rounded bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[8px] font-black uppercase tracking-widest text-[var(--accent)] truncate border border-[color-mix(in_srgb,var(--accent)_30%,transparent)]">
                          {getThemeBadge(id, data)}
                        </span>
                        <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--subtext)] truncate">
                          {getThemeMode(data)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4 w-full z-10">
          <div className="flex items-center gap-3 pl-1 mb-1">
            <span className="material-symbols-outlined text-[var(--subtext)] !text-[16px]">{t("icon_grid_view") || "grid_view"}</span>
            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--text)] opacity-80 drop-shadow-md">{t("ui_library") || "Library"}</h3>
            <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
          </div>
          <div className="grid grid-cols-2 gap-4 w-full">
            {allThemeIds
              .filter(id => !favoriteThemes.includes(id))
              .filter(id => !selectedCommunity || getThemeBadge(id, allThemes[id]) === selectedCommunity)
              .filter(id => !selectedMode || getThemeMode(allThemes[id]) === selectedMode)
              .filter(id => allThemes[id].name.toLowerCase().includes(themeSearch.toLowerCase()) || id.toLowerCase().includes(themeSearch.toLowerCase()))
              .map(id => {
                const data = allThemes[id];
                return (
                  <div
                    key={id}
                    onClick={() => setActiveThemeId(id)}
                    className={`flex flex-col p-4 rounded-xl theme-glass-panel transition-all shadow-lg hover:shadow-xl hover:-translate-y-1 active:scale-95 border cursor-pointer group relative overflow-hidden ${activeThemeId === id
                      ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)]'
                      : 'border-white/5 hover:border-white/20'
                      }`}
                  >
                    {activeThemeId === id && <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/10 to-transparent pointer-events-none" />}

                    <div className="flex justify-between items-start mb-4 relative z-10">
                      <div className="w-8 h-8 rounded-full shadow-md border border-white/10 shrink-0" style={{ backgroundColor: data.accent }} />

                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity absolute right-3 top-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleFavoriteTheme(id, e); }}
                          className={`relative w-7 h-7 rounded-full transition-all bg-black/40 border border-white/10 hover:border-white/30 backdrop-blur-sm shadow-md ${favoriteThemes.includes(id)
                            ? 'text-[var(--accent)] border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] drop-shadow-[0_0_5px_currentColor]'
                            : 'text-[var(--subtext)] hover:text-white'
                            }`}
                        >
                          <span className="material-symbols-outlined !text-[14px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ fontVariationSettings: favoriteThemes.includes(id) ? "'FILL' 1" : "'FILL' 0" }}>star</span>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleExportTheme(e, data); }} className="relative w-7 h-7 rounded-full transition-all bg-black/40 border border-white/10 hover:border-white/30 hover:text-white backdrop-blur-sm text-[var(--subtext)] cursor-pointer shadow-md">
                          <span className="material-symbols-outlined !text-[16px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ml-[1px]">{t("icon_save")}</span>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleEditClick(e, id, data); }} className="relative w-7 h-7 rounded-full transition-all bg-black/40 border border-white/10 hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:text-white hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] backdrop-blur-sm theme-text-accent cursor-pointer shadow-md">
                          <span className="material-symbols-outlined !text-[16px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">{t("icon_tune") || "tune"}</span>
                        </button>

                        {!CORE_THEMES[id] && (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); setNewThemeName(data.name); setEditingThemeId(id); }} className="relative w-7 h-7 rounded-full transition-all bg-black/40 border border-white/10 hover:border-white/30 hover:text-white backdrop-blur-sm text-[var(--subtext)] cursor-pointer shadow-md">
                              <span className="material-symbols-outlined !text-[16px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">{t("icon_edit")}</span>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirmDelete === id) { deleteTheme(id); setConfirmDelete(false); }
                                else { setConfirmDelete(id); }
                              }}
                              onMouseLeave={() => setConfirmDelete(false)}
                              className={`relative w-7 h-7 rounded-full transition-all bg-black/40 border border-white/10 backdrop-blur-sm cursor-pointer shadow-md ${confirmDelete === id ? 'bg-[color-mix(in_srgb,var(--danger)_30%,transparent)] border-[var(--danger)] text-[var(--danger)] scale-110 shadow-[0_0_10px_rgba(var(--danger-rgb),0.5)]' : 'hover:bg-red-500/10 hover:border-red-500/50 theme-text-danger'}`}
                            >
                              <span className="material-symbols-outlined !text-[16px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">{confirmDelete === id ? t("icon_warning") || 'warning' : t("icon_delete") || 'delete'}</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1 relative z-10">
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
                          className="w-full bg-black/40 border border-white/20 rounded md px-2 py-1 text-[11px] font-black uppercase tracking-[0.2em] outline-none shadow-inner transition-all text-white focus:border-[var(--accent)]"
                        />
                      ) : (
                        <span className={`text-[12px] font-black uppercase tracking-[0.2em] truncate ${activeThemeId === id ? "text-[var(--text)]" : "text-[var(--text)]"}`}>{data.name}</span>
                      )}
                      <div className="flex items-center gap-2 mt-1 opacity-80">
                        <span className="px-1.5 py-0.5 rounded bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[8px] font-black uppercase tracking-widest text-[var(--accent)] truncate border border-[color-mix(in_srgb,var(--accent)_30%,transparent)]">
                          {getThemeBadge(id, data)}
                        </span>
                        <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--subtext)] truncate">
                          {getThemeMode(data)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        <ChameleonEditorPanel isOpen={isEditorOpen} onClose={() => setIsEditorOpen(false)} />
      </div>
    </SidePanel>
  );
}
