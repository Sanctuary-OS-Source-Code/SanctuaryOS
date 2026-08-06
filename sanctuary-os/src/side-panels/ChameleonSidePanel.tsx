import { useState } from 'react';
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { useLexicon } from '../LexiconContext';
import { useTheme } from '../ThemeContext';
import { useStore } from '../store';
import { SidePanel, CustomDropdown, HoverTooltip } from '../shared';
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
      actions={
        <>
          <div className="relative group">
            <button
              onClick={() => setUseGlobalTheme(!useGlobalTheme)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg border ${useGlobalTheme ? 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--text)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_20%,transparent)] backdrop-blur-xl hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)]' : 'theme-glass-inner text-[var(--subtext)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'} flex items-center justify-center gap-2`}
            >
              <span className="material-symbols-outlined !text-[14px]">{useGlobalTheme ? 'public' : 'grid_view'}</span>
              {useGlobalTheme ? t("scope_global") || 'Global Scope' : t("scope_workspace") || 'Workspace Scope'}
            </button>
            <HoverTooltip 
              title={useGlobalTheme ? t("scope_global_title") || "GLOBAL SCOPE" : t("scope_workspace_title") || "WORKSPACE SCOPE"} 
              subtitle={useGlobalTheme ? t("scope_global_desc_theme") || "This aesthetic applies across all environments." : t("scope_workspace_desc_theme") || "This aesthetic is bound only to the active environment."} 
              variant="info" 
            />
          </div>
          <button onClick={() => { setMarketTab('CHAMELEONS'); setView('nexus'); onClose(); }} className="p-2 rounded-xl theme-glass-inner hover:theme-text-accent transition-all flex items-center justify-center"><span className="material-symbols-outlined !text-lg">explore</span></button>
          <button onClick={handleImportTheme} className="p-2 rounded-xl theme-glass-inner hover:theme-text-accent transition-all flex items-center justify-center"><span className="material-symbols-outlined !text-lg">download</span></button>
          <button onClick={createNewTheme} className="p-2 rounded-xl theme-glass-inner hover:theme-text-accent transition-all flex items-center justify-center"><span className="material-symbols-outlined !text-lg">add</span></button>
        </>
      }
    >
      <div className="flex flex-col gap-8 p-8">
      
        {favoriteThemes.length > 0 && (
            <div className="flex flex-col gap-6">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60 ml-2">{t("chameleon_favs") || "Pinned Aesthetics"}</h3>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-8">
                {favoriteThemes.filter(id => allThemes[id]).map(id => {
                  const data = allThemes[id];
                  return (
                      <div 
                        key={id} 
                        onClick={() => setActiveThemeId(id)} 
                        className={`p-6 rounded-[var(--radius)] border transition-all text-left flex justify-between items-start group relative backdrop-blur-xl shadow-lg cursor-pointer ${activeThemeId === id ? 'theme-border-accent theme-glass-inner shadow-[0_0_30px_rgba(var(--accent-rgb),0.2)]' : 'theme-glass-panel opacity-80 hover:opacity-100'}`}
                        style={{ backgroundColor: activeThemeId === id ? "color-mix(in srgb, var(--accent) 10%, transparent)" : undefined }}
                      >
                         <div className="flex flex-col gap-2 min-w-0 flex-1 pr-4">
                             <div className="w-10 h-10 rounded-full shadow-lg border border-white/10 shrink-0" style={{ backgroundColor: data.accent }} />
                             
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
                                className="w-full theme-glass-inner border border-white/10 rounded-lg px-3 py-2 text-[10px] font-black text-[var(--text)] uppercase tracking-widest outline-none mt-2 shadow-inner focus:border-white/20 transition-all"
                              />
                            ) : (
                              <div className="flex flex-col gap-2 pr-4 break-words mt-2 min-w-0">
                                <p className="text-[12px] font-black uppercase tracking-[0.2em] truncate w-full" style={{ color: activeThemeId === id ? currentTheme.text : currentTheme.subtext }}>{data.name}</p>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="px-2 py-0.5 rounded border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[8px] font-black uppercase tracking-widest text-[var(--accent)] opacity-90 truncate">{getThemeBadge(id, data)}</span>
                                  <span className="px-2 py-0.5 rounded border border-white/10 bg-white/5 text-[8px] font-black uppercase tracking-widest text-[var(--text)] opacity-80">{getThemeMode(data)}</span>
                                </div>
                              </div>
                            )}
                         </div>

                         <div className="flex flex-col items-end gap-2 shrink-0">
                            <button 
                                onClick={(e) => toggleFavoriteTheme(id, e)} 
                                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${favoriteThemes.includes(id) ? 'theme-border-accent shadow-sm hover:scale-110' : 'border border-white/5 bg-white/5 text-[var(--subtext)] opacity-40 hover:opacity-100 hover:theme-text-accent'}`}
                                style={favoriteThemes.includes(id) ? {
                                    backgroundColor: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                                    color: 'var(--accent)'
                                } : undefined}
                            >
                                <span className="material-symbols-outlined !text-[16px]">star</span>
                            </button>
                            
                            <div className="grid grid-cols-2 gap-1 opacity-0 group-hover:opacity-100 transition-opacity mt-2">
                                <div onClick={(e) => handleExportTheme(e, data)} className="p-1.5 rounded-full hover:bg-white/10 text-sm material-symbols-outlined lowercase cursor-pointer">{t("icon_save")}</div>
                                <div onClick={(e) => handleEditClick(e, id, data)} className="p-1.5 rounded-full hover:bg-white/10 text-sm theme-text-accent material-symbols-outlined lowercase cursor-pointer">{t("icon_tune") || "tune"}</div>
                                
                                {!CORE_THEMES[id] && (
                                  <>
                                      <div onClick={(e) => { e.stopPropagation(); setNewThemeName(data.name); setEditingThemeId(id); }} className="p-1.5 rounded-full hover:bg-white/10 text-sm material-symbols-outlined lowercase cursor-pointer">{t("icon_edit")}</div>
                                      <div 
                                        onClick={(e) => { 
                                          e.stopPropagation(); 
                                          if (confirmDelete === id) { deleteTheme(id); setConfirmDelete(false); }
                                          else { setConfirmDelete(id); }
                                        }} 
                                        onMouseLeave={() => setConfirmDelete(false)}
                                        className={`p-1.5 rounded-full text-sm material-symbols-outlined lowercase transition-all cursor-pointer ${confirmDelete === id ? 'bg-red-500/20 text-red-500 scale-110 shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'hover:bg-white/10 theme-text-danger'}`}
                                      >
                                        {confirmDelete === id ? t("icon_warning") || 'warning' : t("icon_delete") || 'delete'}
                                      </div>
                                  </>
                                )}
                            </div>
                         </div>
                      </div>
                  );
                })}
              </div>
            </div>
        )}

        <div className="flex flex-col gap-6 mt-8 pt-12 border-t border-white/5">
          <h3 className="text-xl font-black uppercase tracking-widest text-[var(--text)] mb-2 flex items-center gap-3">
            <span className="material-symbols-outlined text-2xl theme-text-accent">{t("icon_palette") || "palette"}</span>
            {t("chameleon_library") || "Aesthetic Registry"}
          </h3>

          <div className="flex items-center gap-4 w-full mt-4">
            <div className="relative flex-1">
              <input
                type="text"
                value={themeSearch}
                onChange={e => setThemeSearch(e.target.value)}
                placeholder={t("ui_search_chameleons") || "Query aesthetics..."}
                className="w-full theme-glass-panel rounded-2xl px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text)] outline-none focus:theme-border-accent transition-all shadow-inner"
              />
              <span className="absolute right-6 top-1/2 -translate-y-1/2 opacity-50 text-xl material-symbols-outlined">{t("icon_search")}</span>
            </div>
            
            <div className="w-[220px] shrink-0">
              <CustomDropdown
                value={selectedCommunity}
                options={[
                  { id: null, label: "ALL COMMUNITIES" },
                  ...uniqueCommunities.map(community => ({ id: community, label: typeof community === 'string' ? community.toUpperCase() : community }))
                ]}
                onChange={(val: any) => setSelectedCommunity(val?.[0] ?? null)}
                placeholder="ALL COMMUNITIES"
                disableTint={true}
              />
            </div>

            <div className="w-[220px] shrink-0">
              <CustomDropdown
                value={selectedMode}
                options={[
                  { id: null, label: "ALL MODES" },
                  ...uniqueModes.map(mode => ({ id: mode, label: typeof mode === 'string' ? mode.toUpperCase() : mode }))
                ]}
                onChange={(val: any) => setSelectedMode(val?.[0] ?? null)}
                placeholder="ALL MODES"
                disableTint={true}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-8 mt-6">
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
                      className={`p-6 rounded-[var(--radius)] border transition-all text-left flex justify-between items-start group relative backdrop-blur-xl shadow-lg cursor-pointer ${activeThemeId === id ? 'theme-border-accent theme-glass-inner shadow-[0_0_30px_rgba(var(--accent-rgb),0.2)]' : 'theme-glass-panel opacity-80 hover:opacity-100'}`}
                      style={{ backgroundColor: activeThemeId === id ? "color-mix(in srgb, var(--accent) 10%, transparent)" : undefined }}
                    >
                       <div className="flex flex-col gap-2 min-w-0 flex-1 pr-4">
                           <div className="w-10 h-10 rounded-full shadow-lg border border-white/10 shrink-0" style={{ backgroundColor: data.accent }} />
                           
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
                              className="w-full theme-glass-inner border border-white/10 rounded-lg px-3 py-2 text-[10px] font-black text-[var(--text)] uppercase tracking-widest outline-none mt-2 shadow-inner focus:border-white/20 transition-all"
                            />
                          ) : (
                            <div className="flex flex-col gap-2 pr-4 break-words mt-2 min-w-0">
                              <p className="text-[12px] font-black uppercase tracking-[0.2em] truncate w-full" style={{ color: activeThemeId === id ? currentTheme.text : currentTheme.subtext }}>{data.name}</p>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="px-2 py-0.5 rounded border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[8px] font-black uppercase tracking-widest text-[var(--accent)] opacity-90 truncate">{getThemeBadge(id, data)}</span>
                                <span className="px-2 py-0.5 rounded border border-white/10 bg-white/5 text-[8px] font-black uppercase tracking-widest text-[var(--text)] opacity-80">{getThemeMode(data)}</span>
                              </div>
                            </div>
                          )}
                       </div>

                       <div className="flex flex-col items-end gap-2 shrink-0">
                          <button 
                              onClick={(e) => toggleFavoriteTheme(id, e)} 
                              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${favoriteThemes.includes(id) ? 'theme-border-accent shadow-sm hover:scale-110' : 'border border-white/5 bg-white/5 text-[var(--subtext)] opacity-40 hover:opacity-100 hover:theme-text-accent'}`}
                              style={favoriteThemes.includes(id) ? {
                                  backgroundColor: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                                  color: 'var(--accent)'
                              } : undefined}
                          >
                              <span className="material-symbols-outlined !text-[16px]">star</span>
                          </button>
                          
                          <div className="grid grid-cols-2 gap-1 opacity-0 group-hover:opacity-100 transition-opacity mt-2">
                              <div onClick={(e) => handleExportTheme(e, data)} className="p-1.5 rounded-full hover:bg-white/10 text-sm material-symbols-outlined lowercase cursor-pointer">{t("icon_save")}</div>
                              <div onClick={(e) => handleEditClick(e, id, data)} className="p-1.5 rounded-full hover:bg-white/10 text-sm theme-text-accent material-symbols-outlined lowercase cursor-pointer">{t("icon_tune") || "tune"}</div>
                              
                              {!CORE_THEMES[id] && (
                                <>
                                  <div onClick={(e) => { e.stopPropagation(); setNewThemeName(data.name); setEditingThemeId(id); }} className="p-1.5 rounded-full hover:bg-white/10 text-sm material-symbols-outlined lowercase cursor-pointer">{t("icon_edit")}</div>
                                  <div 
                                    onClick={(e) => { 
                                      e.stopPropagation(); 
                                      if (confirmDelete === id) { deleteTheme(id); setConfirmDelete(false); }
                                      else { setConfirmDelete(id); }
                                    }} 
                                    onMouseLeave={() => setConfirmDelete(false)}
                                    className={`p-1.5 rounded-full text-sm material-symbols-outlined lowercase transition-all cursor-pointer ${confirmDelete === id ? 'bg-red-500/20 text-red-500 scale-110 shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'hover:bg-white/10 theme-text-danger'}`}
                                  >
                                    {confirmDelete === id ? t("icon_warning") || 'warning' : t("icon_delete") || 'delete'}
                                  </div>
                                </>
                              )}
                          </div>
                       </div>
                    </div>
                  );
                })}
          </div>
        </div>
      </div>
      
      <ChameleonEditorPanel isOpen={isEditorOpen} onClose={() => setIsEditorOpen(false)} />
    </SidePanel>
  );
}
