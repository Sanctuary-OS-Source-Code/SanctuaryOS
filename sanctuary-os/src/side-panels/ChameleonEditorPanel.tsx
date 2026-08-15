import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SidePanel, HubTabs } from '../shared';
import { useLexicon } from '../LexiconContext';
import { useTheme } from '../ThemeContext';
import { useStore } from '../store';
import { open } from '@tauri-apps/plugin-dialog';
import { copyFile, mkdir, readDir } from '@tauri-apps/plugin-fs';
import { convertFileSrc } from '@tauri-apps/api/core';
import { join } from '@tauri-apps/api/path';const HexToRGB = (hex: string) => {
  const cleanHex = (hex || '#000000').replace('#', '').padEnd(6, '0').slice(0, 6);
  const r = parseInt(cleanHex.slice(0, 2), 16) || 0;
  const g = parseInt(cleanHex.slice(2, 4), 16) || 0;
  const b = parseInt(cleanHex.slice(4, 6), 16) || 0;
  return { r, g, b };
}

const RGBToHex = (r: number, g: number, b: number) => {
  return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1).toUpperCase()}`;
}

export function ChameleonEditorPanel({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const { t } = useLexicon();
  const { currentTheme, activeThemeId, CORE_THEMES, customThemes, updateActiveTheme } = useTheme();

  const [activeTab, setActiveTab] = useState<'colors' | 'typography' | 'structure' | 'backgrounds'>('colors');
  const [isResizing, setIsResizing] = useState(false);
  
  const [showInstalledImages, setShowInstalledImages] = useState(false);
  const [installedImages, setInstalledImages] = useState<{name: string, url: string}[]>([]);

  const loadInstalledImages = async () => {
    try {
      const vaultPath = useStore.getState().vaultPath;
      if (!vaultPath) return;
      const themesDir = await join(vaultPath, 'Data', 'Themes', 'Images');
      try { await mkdir(themesDir, { recursive: true }); } catch (e) {} // Ensure it exists
      const entries = await readDir(themesDir);
      const files = [];
      for (const e of entries) {
        if (e.isFile && /\.(png|jpe?g|webp|gif)$/i.test(e.name)) {
          const path = await join(themesDir, e.name);
          files.push({ name: e.name, url: convertFileSrc(path) });
        }
      }
      setInstalledImages(files);
      setShowInstalledImages(!showInstalledImages);
    } catch (err) {
      console.error(err);
    }
  };

  const [activeColorPicker, setActiveColorPicker] = useState<string | null>(null);
  const [pickerCoords, setPickerCoords] = useState<{ top?: number, left?: number, right?: number } | null>(null);
  const [favColors, setFavColors] = useState<string[]>(() => JSON.parse(localStorage.getItem("sanctuary_fav_colors") || '[]'));

  const toggleFavColor = (color: string) => {
    let updated;
    if (favColors.includes(color)) updated = favColors.filter(c => c !== color);
    else updated = [...favColors, color].slice(-12);
    setFavColors(updated);
    localStorage.setItem("sanctuary_fav_colors", JSON.stringify(updated));
  };

  const themeKeys = ['bg', 'sidebar', 'sidebartext', 'accent', 'text', 'subtext', 'panelTint', 'headerText', 'success', 'warning', 'danger'];
  
  const allThemes = { ...CORE_THEMES, ...customThemes };
  const currentThemeData = allThemes[activeThemeId] || currentTheme;
  const themeName = currentThemeData.name || "Custom Theme";

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("chameleon_editor_title")}
      subtitle={t("chameleon_editor_subtitle")}
      icon="cloud"
      widthClass="w-[900px]"
    >
      <div className="flex-none px-8 pt-8 pb-4 z-20 relative shrink-0">
        <div className="mb-6">
          <h2 className="text-3xl font-black capitalize tracking-widest text-[var(--text)] mb-2">{themeName}</h2>
          <p className="text-[10px] font-black capitalize tracking-[0.2em] text-[var(--subtext)] opacity-60">{t("forge_instructions")}</p>
        </div>
        
    <div className="flex h-10 w-full items-stretch glass-panel rounded-xl divide-x divide-white/5 border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner">
          {[
            { id: 'colors', label: 'Colors' },
            { id: 'typography', label: 'Typography' },
            { id: 'structure', label: 'Structure & Glass' },
            { id: 'backgrounds', label: 'Backgrounds & FX' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 flex items-center justify-center text-[10px] font-black capitalize tracking-widest transition-all ${
                activeTab === tab.id 
                  ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)]' 
                  : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto custom-scrollbar p-8 flex flex-col gap-12 relative">
        
        {activeTab === 'colors' && (
          <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
              {themeKeys.map(key => (
                <div key={key} className="flex flex-col gap-4 group">
                  <label className="text-[10px] font-black capitalize tracking-[0.2em] ml-1 text-[var(--subtext)] opacity-60 group-hover:text-[var(--text)] transition-colors">{t(`color_${key}`) || key.toUpperCase()}</label>
                  <div className="relative">
                    <div className="flex items-center gap-4">
                      <div
                        onClick={(e) => {
                          if (activeColorPicker === key) {
                            setActiveColorPicker(null);
                          } else {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setPickerCoords({
                              top: rect.bottom + 16,
                              left: rect.left < window.innerWidth / 2 ? rect.left : undefined,
                              right: rect.left >= window.innerWidth / 2 ? window.innerWidth - rect.right : undefined
                            });
                            setActiveColorPicker(key);
                          }
                        }}
                        className="relative w-full h-14 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] cursor-pointer rounded-2xl overflow-hidden shrink-0 shadow-inner hover:scale-105 hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] transition-all flex items-center justify-start px-4"
                        style={{ backgroundColor: currentTheme[key] }}
                      >
                         <div className="absolute inset-0 rounded-[inherit] z-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjY2NjIiAvPgo8cmVjdCB4PSI0IiB5PSI0IiB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjY2NjIiAvPgo8L3N2Zz4=')] opacity-20 pointer-events-none" />
                         <div className="absolute inset-0 rounded-[inherit] z-10 pointer-events-none" style={{ backgroundColor: currentTheme[key] }} />
                         
                         {key === 'success' || key === 'warning' || key === 'danger' ? (
                           <div className="absolute inset-0 rounded-[inherit] z-30 flex items-center justify-end px-4 pointer-events-none">
                             <span className="material-symbols-outlined text-[14px] text-white/50">lock</span>
                           </div>
                         ) : null}

                         <span className="relative z-20 text-[10px] font-black capitalize tracking-widest drop-shadow-md mix-blend-difference text-white opacity-80 pointer-events-none">
                           {currentTheme[key]?.toUpperCase() || '#000000'}
                         </span>
                      </div>
                    </div>

                    {activeColorPicker === key && createPortal(
                      <>
                        {/* Invisible backdrop to catch clicks outside */}
                        <div className="fixed inset-0 z-[50000]" onClick={(e) => { e.stopPropagation(); setActiveColorPicker(null); }} />
                        <div className="fixed z-[50001] p-8 glass-panel backdrop-blur-3xl rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_20px_50px_rgba(0,0,0,0.5)] w-[26rem] animate-in fade-in zoom-in-95 duration-200" style={pickerCoords || {}}>
                          <div className="flex gap-4 mb-8">
                          {!(key === 'success' || key === 'warning' || key === 'danger') ? (
                            <input
                              type="text"
                              value={currentTheme[key]}
                              onChange={(e) => updateActiveTheme({ [key]: e.target.value })}
                              className="flex-1 glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl px-5 py-4 text-xs font-black text-[var(--text)] capitalize tracking-widest outline-none focus:theme-border-accent transition-colors shadow-inner"
                            />
                          ) : (
              <div className="flex-1 glass-panel border border-[color-mix(in_srgb,var(--warning)_40%,transparent)] rounded-2xl shadow-lg shadow-[color-mix(in_srgb,var(--warning)_10%,transparent)] flex items-center justify-center text-center relative ">
                              <div className="absolute inset-0 rounded-[inherit] bg-[var(--warning)] opacity-10 pointer-events-none" />
                              <span className="relative z-10 text-[var(--warning)] px-5 py-4 text-[10px] font-black capitalize tracking-[0.2em] drop-shadow-sm">
                                {t("color_restricted")}
                              </span>
                            </div>
                          )}
                          {!(key === 'success' || key === 'warning' || key === 'danger') && (
                            <div className="w-12 h-12 rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shrink-0 shadow-inner flex items-center justify-center cursor-pointer hover:scale-110 transition-transform group/fav" style={{ backgroundColor: currentTheme[key] }} onClick={() => toggleFavColor(currentTheme[key])}>
                              {favColors.includes(currentTheme[key]) ? <span className="text-yellow-500 text-2xl drop-shadow-md">★</span> : <span className="opacity-0 group-hover/fav:opacity-50 text-white font-black text-2xl material-symbols-outlined">{t("icon_add")}</span>}
                            </div>
                          )}
                        </div>
                        
                        {favColors.length > 0 && !(key === 'success' || key === 'warning' || key === 'danger') && (
                          <div className="mb-8">
                            <h4 className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)] mb-4">{t("color_favs")}</h4>
                            <div className="flex flex-wrap gap-3">
                              {favColors.map(color => (
                                <button
                                  key={color}
                                  onClick={() => updateActiveTheme({ [key]: color })}
                                  className={`w-7 h-7 rounded-xl border hover:scale-125 transition-all shadow-sm ${currentTheme[key]?.toLowerCase() === color.toLowerCase() ? 'theme-border-accent scale-110 shadow-[0_0_15px_var(--accent)]' : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)]'}`}
                                  style={{ backgroundColor: color }}
                                />
                              ))}
                            </div>
                          </div>
                        )}

                        {!(key === 'success' || key === 'warning' || key === 'danger') && (
                          <div className="flex flex-col gap-4 pt-6 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                            <div className="flex items-center gap-4">
                              <span className="text-xs font-black opacity-50 w-3 text-center text-[var(--danger)]">{t("color_r")}</span>
                              <input
                                type="range" min="0" max="255"
                                value={HexToRGB(currentTheme[key]).r}
                                onChange={(e) => updateActiveTheme({ [key]: RGBToHex(parseInt(e.target.value), HexToRGB(currentTheme[key]).g, HexToRGB(currentTheme[key]).b) })}
                                className="flex-1 h-3 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-[var(--danger)] [&::-webkit-slider-thumb]:rounded-full cursor-pointer shadow-inner"
                              />
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="text-xs font-black opacity-50 w-3 text-center text-[var(--success)]">{t("color_g")}</span>
                              <input
                                type="range" min="0" max="255"
                                value={HexToRGB(currentTheme[key]).g}
                                onChange={(e) => updateActiveTheme({ [key]: RGBToHex(HexToRGB(currentTheme[key]).r, parseInt(e.target.value), HexToRGB(currentTheme[key]).b) })}
                                className="flex-1 h-3 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-[var(--success)] [&::-webkit-slider-thumb]:rounded-full cursor-pointer shadow-inner"
                              />
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="text-xs font-black opacity-50 w-3 text-center text-[var(--accent)]">{t("editor_bold")}</span>
                              <input
                                type="range" min="0" max="255"
                                value={HexToRGB(currentTheme[key]).b}
                                onChange={(e) => updateActiveTheme({ [key]: RGBToHex(HexToRGB(currentTheme[key]).r, HexToRGB(currentTheme[key]).g, parseInt(e.target.value)) })}
                                className="flex-1 h-3 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-[var(--accent)] [&::-webkit-slider-thumb]:rounded-full cursor-pointer shadow-inner"
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
          </div>
        )}

        {activeTab === 'typography' && (
          <div className="flex flex-col gap-12 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              <div className="flex flex-col gap-4">
                <label className="text-[10px] font-black capitalize tracking-[0.2em] ml-1 text-[var(--subtext)] opacity-60">{t("forge_font_family")}</label>
                <div className="flex flex-wrap gap-3">
                  {["Inter, sans-serif", "'Space Mono', monospace", "'Orbitron', sans-serif", "'Fira Code', monospace", "'Rajdhani', sans-serif", "'Share Tech Mono', monospace", "'VT323', monospace", "Courier New, monospace"].map(font => (
                    <button 
                      key={font} 
                      onClick={() => updateActiveTheme({ fontFamily: font })}
                      className={`px-5 py-4 rounded-2xl text-[10px] font-black capitalize tracking-widest transition-all ${currentTheme.fontFamily === font || (!currentTheme.fontFamily && font.includes('Inter')) ? 'glass-panel border-[var(--accent)] theme-text-accent shadow-[0_0_30px_rgba(var(--accent-rgb),0.5)] scale-105' : 'glass-panel hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner'}`}
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
                  { key: 'fontSizeHeader', label: t('forge_font_header'), def: '1.875', max: 4 },
                  { key: 'fontSizeSubheader', label: t('forge_font_subheader'), def: '1.5', max: 3 },
                  { key: 'fontSizeTitle', label: t('forge_font_title'), def: '1.25', max: 2.5 },
                  { key: 'fontSizeSubtitle', label: t('forge_font_subtitle'), def: '1.125', max: 2 },
                  { key: 'fontSizeText', label: t('forge_font_text'), def: '1', max: 2 },
                  { key: 'fontSizeSubtext', label: t('forge_font_subtext'), def: '0.75', max: 1.5 },
                  { key: 'fontSizeSidebar', label: t('forge_font_sidebar'), def: '10', max: 20, isPx: true },
                  { key: 'sidebarWidth', label: t('forge_sidebar_width'), def: '288', max: 500, min: 200, isPx: true }
                ].map(cfg => (
                  <div key={cfg.key} className="flex flex-col gap-3">
                    <label className="text-[10px] font-black capitalize tracking-[0.2em] ml-1 text-[var(--subtext)] opacity-80 flex justify-start">
                      <span>{cfg.label}</span>
                      <span className="theme-text-accent ml-auto">{currentTheme[cfg.key] || (cfg.isPx ? `${cfg.def}px` : `${cfg.def}rem`)}</span>
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
          </div>
        )}

        {activeTab === 'structure' && (
          <div className="flex flex-col gap-12 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              <div className="flex flex-col gap-3">
                <label className="text-[10px] font-black capitalize tracking-[0.2em] ml-1 text-[var(--subtext)] opacity-80 flex justify-start">
                  <span>{t("forge_glass_opacity")}</span>
                  <span className="theme-text-accent ml-auto">{currentTheme.glassOpacity || "3%"}</span>
                </label>
                <input 
                  type="range" min="0" max="100" step="1"
                  value={parseFloat(currentTheme.glassOpacity || '3')}
                  onChange={(e) => updateActiveTheme({ glassOpacity: `${e.target.value}%` })}
                  className="w-full sanctuary-slider"
                />
              </div>
              
              <div className="flex flex-col gap-3">
                <label className="text-[10px] font-black capitalize tracking-[0.2em] ml-1 text-[var(--subtext)] opacity-80 flex justify-start">
                  <span>{t("forge_glass_blur")}</span>
                  <span className="theme-text-accent ml-auto">{currentTheme.glassBlur || "16px"}</span>
                </label>
                <input 
                  type="range" min="0" max="64" step="1"
                  value={parseInt(currentTheme.glassBlur || "16") || 16}
                  onChange={(e) => updateActiveTheme({ glassBlur: `${e.target.value}px` })}
                  className="w-full sanctuary-slider"
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 w-1/2 pr-6">
              <label className="text-[10px] font-black capitalize tracking-[0.2em] ml-1 text-[var(--subtext)] opacity-80 flex justify-start">
                <span>{t("forge_radius")}</span>
                <span className="theme-text-accent ml-auto">{currentTheme.radius || "1.5rem"}</span>
              </label>
              <input 
                type="range" min="0" max="4" step="0.125"
                value={parseFloat(currentTheme.radius || "1.5") || 1.5}
                onChange={(e) => updateActiveTheme({ radius: `${e.target.value}rem` })}
                className="w-full sanctuary-slider"
              />
            </div>
          </div>
        )}

        {activeTab === 'backgrounds' && (
          <div className="flex flex-col gap-12 animate-in fade-in slide-in-from-bottom-4 duration-300">
            
            <div className="flex flex-col gap-6">
              <label className="text-[10px] font-black capitalize tracking-[0.2em] ml-1 text-[var(--subtext)] opacity-80">{t("forge_bg_selector")}</label>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                {[
                  { id: '/themes/architect.png', label: 'Architect' },
                  { id: '/themes/radiant.png', label: 'Radiant' },
                  { id: '/themes/aurora.png', label: 'Aurora' },
                  { id: '/themes/bunker.png', label: 'Bunker' },
                  { id: '/themes/synthwave.png', label: 'Miami Vice' },
                  { id: '/themes/dracula.png', label: 'Dracula' },
                  { id: 'linear-gradient(135deg, rgba(2,0,36,1) 0%, rgba(9,9,121,1) 35%, rgba(0,212,255,1) 100%)', label: 'Ocean Matrix' },
                  { id: 'radial-gradient(circle at top right, #3f3f46, #000000)', label: 'Slate Glow' },
                  { id: 'none', label: 'Solid Color' }
                ].map(preset => (
                  <button 
                    key={preset.id}
                    onClick={() => updateActiveTheme({ 
                      bgImage: preset.id.endsWith('.png') ? preset.id : '',
                      bgGradient: preset.id.endsWith('.png') ? 'transparent' : preset.id 
                    })}
                    className={`aspect-video rounded-xl border transition-all flex flex-col items-center justify-center gap-2 relative overflow-hidden group shadow-lg ${
                      (currentTheme.bgImage === preset.id) || (currentTheme.bgGradient === preset.id) || (!currentTheme.bgGradient && !currentTheme.bgImage && preset.id === 'none') 
                        ? 'border-[var(--accent)] shadow-[0_0_20px_rgba(var(--accent-rgb),0.5)] scale-[1.05] z-10' 
                        : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] hover:scale-105'
                    }`}
                  >
                    {preset.id.endsWith('.png') ? (
                      <div className="absolute inset-0 rounded-[inherit] bg-cover bg-center" style={{ backgroundImage: `url("${preset.id}")` }} />
                    ) : (
                      <div className="absolute inset-0 rounded-[inherit] opacity-80 group-hover:opacity-100 transition-opacity" style={{ background: preset.id === 'none' ? currentTheme.bg : preset.id }} />
                    )}
                    <div className="absolute inset-0 rounded-[inherit] bg-black/40 group-hover:bg-black/20 transition-colors" />
                    <span className={`relative z-10 text-[10px] font-black capitalize tracking-widest drop-shadow-lg text-center ${
                      (currentTheme.bgImage === preset.id) || (currentTheme.bgGradient === preset.id) || (!currentTheme.bgGradient && !currentTheme.bgImage && preset.id === 'none') 
                        ? 'text-white text-shadow-[0_0_15px_var(--accent)]' 
                        : 'text-white/80'
                    }`}>{preset.label}</span>
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-2 mt-4 relative">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black capitalize tracking-[0.2em] ml-1 text-[var(--subtext)] opacity-80">{t("forge_custom_bg")}</label>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={loadInstalledImages}
                      className="px-3 py-1.5 rounded-lg border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[9px] font-black tracking-widest text-[var(--subtext)] hover:text-[var(--text)] flex items-center gap-1 transition-all"
                    >
                      <span className="material-symbols-outlined !text-[12px]">image</span> VIEW INSTALLED
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          const selected = await open({
                            multiple: false,
                            filters: [{ name: 'Image', extensions: ['png', 'jpeg', 'jpg', 'webp'] }]
                          });
                          if (selected && typeof selected === 'string') {
                            const vaultPath = useStore.getState().vaultPath;
                            if (!vaultPath) {
                              useStore.getState().pushStatus(t("error_no_vault_path") || "Vault Path not set");
                              return;
                            }
                            const themesDir = await join(vaultPath, 'Data', 'Themes', 'Images');
                            try { await mkdir(themesDir, { recursive: true }); } catch (e) {}
                            const filename = selected.replace(/^.*[\\\/]/, '');
                            const newPath = await join(themesDir, filename);
                            await copyFile(selected, newPath);
                            updateActiveTheme({ bgImage: convertFileSrc(newPath), bgGradient: 'transparent' });
                          }
                        } catch (err) {
                          console.error("Failed to select image", err);
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] text-[9px] font-black tracking-widest flex items-center gap-1 transition-all shadow-sm"
                    >
                      <span className="material-symbols-outlined !text-[12px]">upload</span> UPLOAD
                    </button>
                  </div>
                </div>
                <textarea 
                  value={currentTheme.bgImage || currentTheme.bgGradient || "none"}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val.startsWith('http') || val.startsWith('/')) {
                      updateActiveTheme({ bgImage: val, bgGradient: 'transparent' });
                    } else {
                      updateActiveTheme({ bgGradient: val, bgImage: '' });
                    }
                  }}
                  className="w-full h-16 glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-5 py-3 text-[10px] font-mono text-[var(--text)] tracking-widest outline-none focus:theme-border-accent transition-all shadow-inner resize-none"
                  placeholder="linear-gradient(...) OR https://..."
                />
                
                {showInstalledImages && (
                  <div className="mt-2 grid grid-cols-2 lg:grid-cols-3 gap-3 animate-in fade-in slide-in-from-top-2 p-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl glass-panel max-h-48 overflow-y-auto">
                    {installedImages.length === 0 && <span className="col-span-full text-[10px] font-black tracking-widest opacity-50 p-2 text-center w-full">No installed images found</span>}
                    {installedImages.map(img => (
                      <div 
                        key={img.name} 
                        className="relative aspect-video rounded-lg overflow-hidden cursor-pointer border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)] hover:shadow-[0_0_15px_rgba(var(--accent-rgb),0.5)] group transition-all" 
                        onClick={() => { 
                          updateActiveTheme({ bgImage: img.url, bgGradient: 'transparent' }); 
                          setShowInstalledImages(false); 
                        }}
                      >
                        <div className="absolute inset-0 rounded-[inherit] bg-cover bg-center" style={{ backgroundImage: `url("${img.url}")` }} />
                        <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[8px] font-mono truncate px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity">{img.name}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-4 mt-6 pt-6 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                <label className="text-[10px] font-black capitalize tracking-[0.2em] ml-1 text-[var(--subtext)] opacity-80">Atmospheric Overrides</label>
                <div className="flex flex-col gap-3">
                  <label className="flex items-center gap-3 cursor-pointer group w-fit">
                    <input 
                      type="checkbox" 
                      checked={currentTheme.ambientNoise !== false} 
                      onChange={(e) => updateActiveTheme({ ambientNoise: e.target.checked })}
                      className="w-4 h-4 rounded border border-[color-mix(in_srgb,var(--text)_20%,transparent)] appearance-none checked:bg-[var(--accent)] checked:border-[var(--accent)] transition-all relative before:content-[''] before:absolute before:inset-0 before:bg-white before:opacity-0 checked:before:opacity-20 hover:border-[var(--text)]"
                    />
                    <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] group-hover:theme-text-accent transition-colors">Ambient Texture Grain</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer group w-fit">
                    <input 
                      type="checkbox" 
                      checked={currentTheme.ambientOrb !== false} 
                      onChange={(e) => updateActiveTheme({ ambientOrb: e.target.checked })}
                      className="w-4 h-4 rounded border border-[color-mix(in_srgb,var(--text)_20%,transparent)] appearance-none checked:bg-[var(--accent)] checked:border-[var(--accent)] transition-all relative before:content-[''] before:absolute before:inset-0 before:bg-white before:opacity-0 checked:before:opacity-20 hover:border-[var(--text)]"
                    />
                    <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] group-hover:theme-text-accent transition-colors">Drifting Accent Orb</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </SidePanel>
  );
}



