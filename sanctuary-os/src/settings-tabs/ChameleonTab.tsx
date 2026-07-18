import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { useLexicon } from '../LexiconContext';
import { useTheme } from '../ThemeContext';
import { useStore } from '../store';
import { TabContainer } from './shared';

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

const PRESET_COLORS = [
  '#000000', '#1a1a1a', '#2a2a2a', '#3a3a3a', '#555555', '#888888',
  '#f5f5f5', '#e0e0e0', '#cccccc', '#ffffff', '#ffcc00', '#4cd964',
  '#5ac8fa', '#007aff', '#5856d6', '#ff2d55', '#ff3b30', '#ff9500',
  '#ff4444', '#00c851', '#33b5e5', '#ffbb33', '#00ffff', '#ff00ff'
];

const SEMANTIC_SHADES: Record<string, string[]> = {
  success: [
    '#052e16', '#14532d', '#166534', '#15803d', '#16a34a', '#22c55e', '#4ade80', '#86efac',
    '#022c22', '#064e3b', '#065f46', '#047857', '#059669', '#10b981', '#34d399', '#6ee7b7'
  ],
  warning: [
    '#451a03', '#713f12', '#854d0e', '#a16207', '#ca8a04', '#eab308', '#facc15', '#fde047',
    '#422006', '#78350f', '#92400e', '#b45309', '#d97706', '#f59e0b', '#fbbf24', '#fcd34d'
  ],
  danger: [
    '#450a0a', '#7f1d1d', '#991b1b', '#b91c1c', '#dc2626', '#ef4444', '#f87171', '#fca5a5',
    '#4c0519', '#881337', '#9f1239', '#be123c', '#e11d48', '#f43f5e', '#fb7185', '#fda4af'
  ]
};

const standardButtonClass = "px-6 py-3 rounded-2xl theme-glass-inner text-[var(--text)] text-[10px] font-black uppercase tracking-widest transition-all shadow-lg hover:theme-border-accent hover:scale-105 active:scale-95 border border-white/10 backdrop-blur-xl flex items-center justify-center gap-3 hover:bg-white/5";

export default function ChameleonTab({ config }: any) {
  const { t } = useLexicon();
  const { currentTheme, activeThemeId, setActiveThemeId, CORE_THEMES, customThemes, updateActiveTheme, renameTheme, createNewTheme, importTheme, deleteTheme } = useTheme();
  const setView = useStore(state => state.setView);
  const setMarketTab = useStore(state => state.setMarketTab);

  const [editingThemeId, setEditingThemeId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | false>(false);
  const [newThemeName, setNewThemeName] = useState("");
  const [activeColorPicker, setActiveColorPicker] = useState<string | null>(null);
  const colorPickerRefs = useRef<any>({});
  const [favColors, setFavColors] = useState<string[]>(() => JSON.parse(localStorage.getItem("sanctuary_fav_colors") || '[]'));

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

  // Re-ordered themeKeys to place traffic lights at the end!
  const themeKeys = ['bg', 'sidebar', 'sidebartext', 'accent', 'text', 'subtext', 'panelTint', 'headerText', 'success', 'warning', 'danger'];

  return (
    <TabContainer
      title={t("chameleon_title")}
      icon="palette"
      actions={
        <>
          <button onClick={() => { setMarketTab('CHAMELEONS'); setView('nexus'); }} className={standardButtonClass}>{t("btn_browse")}</button>
          <button onClick={handleImportTheme} className={standardButtonClass}>{t("btn_import")}</button>
          <button onClick={createNewTheme} className={standardButtonClass}>{t("auto_create")}</button>
        </>
      }
    >
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-8">
        {Object.entries({ ...CORE_THEMES, ...customThemes }).map(([id, data]: any) => (
          <button 
            key={id} 
            onClick={() => setActiveThemeId(id)} 
            className={`p-6 rounded-[var(--radius)] border transition-all text-left group relative backdrop-blur-xl shadow-lg ${activeThemeId === id ? 'theme-border-accent theme-glass-inner shadow-[0_0_30px_rgba(var(--accent-rgb),0.2)]' : 'theme-glass-panel opacity-80 hover:opacity-100'}`}
            style={{ backgroundColor: activeThemeId === id ? "color-mix(in srgb, var(--accent) 10%, transparent)" : undefined }}
          >
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
              <div onClick={(e) => handleExportTheme(e, data)} className="p-2 rounded-full hover:bg-white/10 text-sm material-symbols-outlined lowercase">{t("icon_save")}</div>
              {!CORE_THEMES[id] && (
                <>
                  <div onClick={(e) => { e.stopPropagation(); setNewThemeName(data.name); setEditingThemeId(id); }} className="p-2 rounded-full hover:bg-white/10 text-sm theme-text-accent material-symbols-outlined lowercase">{t("icon_edit")}</div>
                  <div 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      if (confirmDelete === id) { deleteTheme(id); setConfirmDelete(false); }
                      else { setConfirmDelete(id); }
                    }} 
                    onMouseLeave={() => setConfirmDelete(false)}
                    className={`p-2 rounded-full text-sm material-symbols-outlined lowercase transition-all ${confirmDelete === id ? 'bg-red-500/20 text-red-500 scale-110 shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'hover:bg-white/10 theme-text-danger'}`}
                  >
                    {confirmDelete === id ? t("icon_warning") || 'warning' : t("icon_delete") || 'delete'}
                  </div>
                </>
              )}
            </div>
          </button>
        ))}
      </div>

      <div className="mt-16 pt-12 border-t border-white/5">
        <h3 className="text-xl font-black uppercase tracking-widest text-[var(--text)] mb-8 flex items-center gap-3">
          <span className="material-symbols-outlined text-2xl theme-text-accent">{t("icon_tune")}</span>
          {t("forge_live")}
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-12">
          {themeKeys.map(key => (
            <div key={key} className="flex flex-col gap-4 group">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] ml-1 text-[var(--subtext)] opacity-60 group-hover:text-[var(--text)] transition-colors">{t(`color_${key}`) || key.toUpperCase()}</label>
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
                    <div className="fixed z-[50001] p-8 theme-glass-panel backdrop-blur-3xl rounded-[var(--radius)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_20px_50px_rgba(0,0,0,0.5)] w-[26rem] animate-in fade-in zoom-in-95 duration-200"
                      style={{
                        top: Math.min(colorPickerRefs.current[key]?.getBoundingClientRect().bottom + 12, window.innerHeight - 350),
                        left: Math.min(colorPickerRefs.current[key]?.getBoundingClientRect().left, window.innerWidth - 450),
                      }}>
                      <div className="flex gap-4 mb-8">
                        {!(key === 'success' || key === 'warning' || key === 'danger') ? (
                          <input
                            type="text"
                            value={currentTheme[key]}
                            onChange={(e) => updateActiveTheme({ [key]: e.target.value })}
                            className="flex-1 theme-glass-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl px-5 py-4 text-xs font-black text-[var(--text)] uppercase tracking-widest outline-none focus:theme-border-accent transition-colors shadow-inner"
                          />
                        ) : (
                          <div className="flex-1 theme-glass-panel border border-[var(--warning)]/40 rounded-2xl shadow-lg shadow-[var(--warning)]/10 flex items-center justify-center text-center relative overflow-hidden">
                            <div className="absolute inset-0 bg-[var(--warning)] opacity-10 pointer-events-none" />
                            <span className="relative z-10 text-[var(--warning)] px-5 py-4 text-[10px] font-black uppercase tracking-[0.2em] drop-shadow-sm">
                              {t("color_restricted") || "SEMANTIC LOCK ACTIVE"}
                            </span>
                          </div>
                        )}
                        {!(key === 'success' || key === 'warning' || key === 'danger') && (
                          <div className="w-12 h-12 rounded-2xl border border-white/10 shrink-0 shadow-inner flex items-center justify-center cursor-pointer hover:scale-110 transition-transform group/fav" style={{ backgroundColor: currentTheme[key] }} onClick={() => toggleFavColor(currentTheme[key])}>
                            {favColors.includes(currentTheme[key]) ? <span className="text-yellow-500 text-2xl drop-shadow-md">Γÿà</span> : <span className="opacity-0 group-hover/fav:opacity-50 text-white font-black text-2xl material-symbols-outlined">{t("icon_add")}</span>}
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-8 gap-3 mb-6">
                        {(SEMANTIC_SHADES[key] || PRESET_COLORS).map(color => (
                          <button
                            key={color}
                            onClick={() => updateActiveTheme({ [key]: color })}
                            className={`w-7 h-7 rounded-full border hover:scale-125 transition-all shadow-sm ${currentTheme[key]?.toLowerCase() === color ? 'theme-border-accent scale-110 shadow-[0_0_15px_var(--accent)]' : 'border-white/10 hover:border-white/30'}`}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                      {favColors.length > 0 && !(key === 'success' || key === 'warning' || key === 'danger') && (
                        <div className="mb-8 pt-6 border-t border-white/10">
                          <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] mb-4">{t("color_favs")}</h4>
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
                        {!(key === 'success' || key === 'warning' || key === 'danger') && (
                          <div className="flex flex-col gap-4 pt-6 border-t border-white/10">
                            <div className="flex items-center gap-4">
                              <span className="text-xs font-black opacity-50 w-3 text-center text-red-500">{t("color_r")}</span>
                              <input
                                type="range" min="0" max="255"
                                value={HexToRGB(currentTheme[key]).r}
                                onChange={(e) => updateActiveTheme({ [key]: RGBToHex(parseInt(e.target.value), HexToRGB(currentTheme[key]).g, HexToRGB(currentTheme[key]).b) })}
                                className="flex-1 h-3 bg-black/40 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-red-500 [&::-webkit-slider-thumb]:rounded-full cursor-pointer shadow-inner"
                              />
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="text-xs font-black opacity-50 w-3 text-center text-green-500">{t("color_g")}</span>
                              <input
                                type="range" min="0" max="255"
                                value={HexToRGB(currentTheme[key]).g}
                                onChange={(e) => updateActiveTheme({ [key]: RGBToHex(HexToRGB(currentTheme[key]).r, parseInt(e.target.value), HexToRGB(currentTheme[key]).b) })}
                                className="flex-1 h-3 bg-black/40 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-green-500 [&::-webkit-slider-thumb]:rounded-full cursor-pointer shadow-inner"
                              />
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="text-xs font-black opacity-50 w-3 text-center text-blue-500">{t("editor_bold")}</span>
                              <input
                                type="range" min="0" max="255"
                                value={HexToRGB(currentTheme[key]).b}
                                onChange={(e) => updateActiveTheme({ [key]: RGBToHex(HexToRGB(currentTheme[key]).r, HexToRGB(currentTheme[key]).g, parseInt(e.target.value)) })}
                                className="flex-1 h-3 bg-black/40 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full cursor-pointer shadow-inner"
                              />
                            </div>
                          </div>
                        )}
                    </div>
                  </>, document.body
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-20 mb-12 flex items-center gap-4 border-b border-white/5 pb-4">
          <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">tune</span>
          <h2 className="text-[14px] font-black uppercase tracking-[0.15em] text-white">{t("forge_typography") || "Typography"}</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div className="flex flex-col gap-4">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] ml-1 text-[var(--subtext)] opacity-60">{t("forge_font_family") || "Primary Font"}</label>
            <div className="flex flex-wrap gap-3">
              {["Inter, sans-serif", "'Space Mono', monospace", "'Orbitron', sans-serif", "'Fira Code', monospace", "'Rajdhani', sans-serif", "'Share Tech Mono', monospace", "'VT323', monospace", "Courier New, monospace"].map(font => (
                <button 
                  key={font} 
                  onClick={() => updateActiveTheme({ fontFamily: font })}
                  className={`px-5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${currentTheme.fontFamily === font || (!currentTheme.fontFamily && font.includes('Inter')) ? 'theme-glass-panel border-[var(--accent)] theme-text-accent shadow-[0_0_30px_rgba(var(--accent-rgb),0.5)] scale-105' : 'theme-glass-panel hover:bg-white/5 border border-white/5 shadow-inner'}`}
                  style={{ 
                    fontFamily: font,
                    backgroundColor: (currentTheme.fontFamily === font || (!currentTheme.fontFamily && font.includes('Inter'))) ? "color-mix(in srgb, var(--accent) 15%, transparent)" : undefined 
                  }}
                >
                  {font.split(',')[0].replace(/'/g, '')}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-6">
            {[
              { key: 'fontSizeHeader', label: t('forge_font_header') || 'Headers', def: '1.875', max: 4 },
              { key: 'fontSizeSubheader', label: t('forge_font_subheader') || 'Sub Headers', def: '1.5', max: 3 },
              { key: 'fontSizeTitle', label: t('forge_font_title') || 'Titles', def: '1.25', max: 2.5 },
              { key: 'fontSizeSubtitle', label: t('forge_font_subtitle') || 'Sub Titles', def: '1.125', max: 2 },
              { key: 'fontSizeText', label: t('forge_font_text') || 'Text', def: '1', max: 2 },
              { key: 'fontSizeSubtext', label: t('forge_font_subtext') || 'Sub Text', def: '0.75', max: 1.5 },
              { key: 'fontSizeSidebar', label: t('forge_font_sidebar') || 'Side Bar Font', def: '10', max: 20, isPx: true },
              { key: 'sidebarWidth', label: t('forge_sidebar_width') || 'Side Bar Width', def: '288', max: 500, min: 200, isPx: true }
            ].map(cfg => (
              <div key={cfg.key} className="flex flex-col gap-3">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] ml-1 text-[var(--subtext)] opacity-80 flex justify-between">
                  <span>{cfg.label}</span>
                  <span className="theme-text-accent">{currentTheme[cfg.key] || (cfg.isPx ? `${cfg.def}px` : `${cfg.def}rem`)}</span>
                </label>
                <input 
                  type="range" min={cfg.min !== undefined ? cfg.min : (cfg.isPx ? 6 : 0.5)} max={cfg.max} step={cfg.isPx ? 1 : 0.125}
                  value={parseFloat(currentTheme[cfg.key] || cfg.def) || parseFloat(cfg.def)}
                  onChange={(e) => updateActiveTheme({ [cfg.key]: cfg.isPx ? `${e.target.value}px` : `${e.target.value}rem` })}
                  className="w-full sanctuary-slider"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-20 mb-12 flex items-center gap-4 border-b border-white/5 pb-4">
          <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">tune</span>
          <h2 className="text-[14px] font-black uppercase tracking-[0.15em] text-white">{t("forge_glass") || "Glass & Material"}</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div className="flex flex-col gap-3">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] ml-1 text-[var(--subtext)] opacity-80 flex justify-between">
              <span>{t("forge_glass_opacity") || "Panel Opacity"}</span>
              <span className="theme-text-accent">{currentTheme.glassOpacity || "3%"}</span>
            </label>
            <input 
              type="range" min="0" max="100" step="1"
              value={parseFloat(currentTheme.glassOpacity || '3')}
              onChange={(e) => updateActiveTheme({ glassOpacity: `${e.target.value}%` })}
              className="w-full sanctuary-slider"
            />
          </div>
          
          <div className="flex flex-col gap-3">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] ml-1 text-[var(--subtext)] opacity-80 flex justify-between">
              <span>{t("forge_glass_blur") || "Frosted Blur"}</span>
              <span className="theme-text-accent">{currentTheme.glassBlur || "16px"}</span>
            </label>
            <input 
              type="range" min="0" max="64" step="1"
              value={parseInt(currentTheme.glassBlur || "16") || 16}
              onChange={(e) => updateActiveTheme({ glassBlur: `${e.target.value}px` })}
              className="w-full sanctuary-slider"
            />
          </div>
        </div>

        <div className="mt-20 mb-12 flex items-center gap-4 border-b border-white/5 pb-4">
          <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">tune</span>
          <h2 className="text-[14px] font-black uppercase tracking-[0.15em] text-white">{t("forge_geometry") || "Shape Geometry"}</h2>
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-[10px] font-black uppercase tracking-[0.2em] ml-1 text-[var(--subtext)] opacity-80 flex justify-between">
            <span>{t("forge_radius") || "Border Radius"}</span>
            <span className="theme-text-accent">{currentTheme.radius || "1.5rem"}</span>
          </label>
          <input 
            type="range" min="0" max="4" step="0.125"
            value={parseFloat(currentTheme.radius || "1.5") || 1.5}
            onChange={(e) => updateActiveTheme({ radius: `${e.target.value}rem` })}
            className="w-full sanctuary-slider"
          />
        </div>
        
        <div className="mt-20 mb-12 flex items-center gap-4 border-b border-white/5 pb-4">
          <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">tune</span>
          <h2 className="text-[14px] font-black uppercase tracking-[0.15em] text-white">{t("forge_background") || "Background Override"}</h2>
        </div>
        
        <div className="flex flex-col gap-6">
          <label className="text-[10px] font-black uppercase tracking-[0.2em] ml-1 text-[var(--subtext)] opacity-80">{t("forge_bg_selector") || "Gradient Preset"}</label>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {[
              { id: 'none', label: 'Solid' },
              { id: 'linear-gradient(to bottom right, #171520, #241b2f)', label: 'Miami Neon' },
              { id: 'radial-gradient(circle at center, #1e1b4b, #000000)', label: 'Abyssal Void' },
              { id: 'linear-gradient(135deg, rgba(2,0,36,1) 0%, rgba(9,9,121,1) 35%, rgba(0,212,255,1) 100%)', label: 'Ocean Matrix' },
              { id: 'radial-gradient(circle at top right, #3f3f46, #000000)', label: 'Slate Glow' },
              { id: 'linear-gradient(to top, #3b82f620, transparent)', label: 'Data Stream' }
            ].map(preset => (
              <button 
                key={preset.id}
                onClick={() => updateActiveTheme({ bgGradient: preset.id })}
                className={`aspect-video rounded-xl border transition-all flex flex-col items-center justify-center gap-2 p-2 relative overflow-hidden group shadow-lg ${currentTheme.bgGradient === preset.id || (!currentTheme.bgGradient && preset.id === 'none') ? 'border-[var(--accent)] shadow-[0_0_20px_rgba(var(--accent-rgb),0.4)] scale-[1.02]' : 'border-white/10 hover:border-white/30'}`}
                style={{
                  backgroundColor: (currentTheme.bgGradient === preset.id || (!currentTheme.bgGradient && preset.id === 'none')) ? "color-mix(in srgb, var(--accent) 15%, transparent)" : undefined
                }}
              >
                <div className="absolute inset-0 opacity-40 group-hover:opacity-100 transition-opacity" style={{ background: preset.id === 'none' ? currentTheme.bg : preset.id }} />
                <span className={`relative z-10 text-[9px] font-black uppercase tracking-widest drop-shadow-md text-center ${(currentTheme.bgGradient === preset.id || (!currentTheme.bgGradient && preset.id === 'none')) ? 'theme-text-accent text-shadow-[0_0_10px_var(--accent)]' : 'text-white'}`}>{preset.label}</span>
              </button>
            ))}
          </div>

          <input 
            type="text" 
            value={currentTheme.bgGradient || "none"}
            onChange={(e) => updateActiveTheme({ bgGradient: e.target.value })}
            className="w-full theme-glass-inner border border-white/10 rounded-xl px-5 py-4 text-[10px] font-mono text-[var(--text)] uppercase tracking-widest outline-none focus:theme-border-accent transition-all shadow-inner"
            placeholder="linear-gradient(to bottom, #000, #111)"
          />
        </div>
      </div>
    </TabContainer>
  );
}
