import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLexicon } from '../LexiconContext';
import { HexToRGB, RGBToHex, PRESET_COLORS, SEMANTIC_SHADES, themeKeys } from './ChameleonShared';

interface ChameleonControlDashboardProps {
  currentTheme: any;
  handleUpdateTheme: (updates: any) => void;
  editingThemeId: string | null;
  renameTheme?: (id: string, newName: string) => void;
}

export function ChameleonControlDashboard({ 
  currentTheme, 
  handleUpdateTheme, 
  editingThemeId, 
  renameTheme 
}: ChameleonControlDashboardProps) {
  const { t } = useLexicon();
  const [activeColorPicker, setActiveColorPicker] = useState<string | null>(null);
  const colorPickerRefs = useRef<any>({});
  
  const [favColors, setFavColors] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("sanctuary_fav_colors") || '[]');
    } catch { return []; }
  });

  const toggleFavColor = (color: string) => {
    let updated;
    if (favColors.includes(color)) updated = favColors.filter(c => c !== color);
    else updated = [...favColors, color].slice(-12);
    setFavColors(updated);
    localStorage.setItem("sanctuary_fav_colors", JSON.stringify(updated));
  };

  const isDevOrCustomTheme = typeof editingThemeId === 'string' && (editingThemeId.startsWith('dev_') || editingThemeId.startsWith('custom_') || editingThemeId.startsWith('signature_'));
  // Note: Wayfinder might pass an ID that is just "architect" but it's editable in the cloud.
  // We'll allow rename if renameTheme is passed and it's not explicitly false.
  const canRename = !!renameTheme;

  return (
    <div className="flex-1 flex flex-col h-full border-r border-[color-mix(in_srgb,var(--text)_5%,transparent)] overflow-hidden">
      {/* SECONDARY HEADER: Editable Title */}
      <div className="flex gap-6 px-6 py-4 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-transparent shrink-0">
        <div className="flex-1 flex flex-col justify-start pt-1">
          <input
            type="text"
            value={currentTheme.name || ""}
            onChange={(e) => canRename && renameTheme(editingThemeId!, e.target.value)}
            className="w-full bg-transparent border-b border-transparent hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] focus:theme-border-accent outline-none text-3xl font-black text-[var(--text)] uppercase tracking-widest transition-colors py-1"
            placeholder="THEME NAME"
            disabled={!canRename}
          />
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-60 mt-2 ml-1">
            {t("ui_use_dashboard") || "Use the dashboard below to construct your signature."}
          </p>
        </div>
      </div>

      {/* DASHBOARD SCROLL AREA */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-10 pb-32">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-10">
          {themeKeys.map(key => (
            <div key={key} className="flex flex-col gap-3 group">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] ml-1 text-[var(--subtext)] opacity-60 group-hover:text-[var(--text)] transition-colors">
                {t(`color_${key}`) || key.toUpperCase()}
              </label>
              <div className="relative">
                <div
                  className="flex items-center gap-4 cursor-pointer hover:scale-[1.02] active:scale-95 transition-all w-max"
                  onClick={() => setActiveColorPicker(activeColorPicker === key ? null : key)}
                >
                  <div
                    ref={(el) => { colorPickerRefs.current[key] = el; }}
                    className="w-[4.5rem] h-12 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl overflow-hidden shrink-0 shadow-inner"
                    style={{ backgroundColor: currentTheme[key] }}
                  />
                  <code
                    className="text-xs font-black uppercase tracking-widest opacity-60 group-hover:opacity-100 transition-opacity"
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
                            onChange={(e) => handleUpdateTheme({ [key]: e.target.value })}
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
                          <div className="w-12 h-12 rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shrink-0 shadow-inner flex items-center justify-center cursor-pointer hover:scale-110 transition-transform group/fav" style={{ backgroundColor: currentTheme[key] }} onClick={() => toggleFavColor(currentTheme[key])}>
                            {favColors.includes(currentTheme[key]) ? <span className="text-yellow-500 text-2xl drop-shadow-md">★</span> : <span className="opacity-0 group-hover/fav:opacity-50 text-white font-black text-2xl material-symbols-outlined">{t("icon_add")}</span>}
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-8 gap-3 mb-6">
                        {(SEMANTIC_SHADES[key] || PRESET_COLORS).map(color => (
                          <button
                            key={color}
                            onClick={() => handleUpdateTheme({ [key]: color })}
                            className={`w-7 h-7 rounded-full border hover:scale-125 transition-all shadow-sm ${currentTheme[key]?.toLowerCase() === color ? 'theme-border-accent scale-110 shadow-[0_0_15px_var(--accent)]' : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)]'}`}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                      {favColors.length > 0 && !(key === 'success' || key === 'warning' || key === 'danger') && (
                        <div className="mb-8 pt-6 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                          <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] mb-4">{t("color_favs") || "FAVORITES"}</h4>
                          <div className="flex flex-wrap gap-3">
                            {favColors.map(color => (
                              <button
                                key={color}
                                onClick={() => handleUpdateTheme({ [key]: color })}
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
                            <span className="text-xs font-black opacity-50 w-3 text-center text-red-500">{t("color_r") || "R"}</span>
                            <input
                              type="range" min="0" max="255"
                              value={HexToRGB(currentTheme[key]).r}
                              onChange={(e) => handleUpdateTheme({ [key]: RGBToHex(parseInt(e.target.value), HexToRGB(currentTheme[key]).g, HexToRGB(currentTheme[key]).b) })}
                              className="flex-1 h-3 bg-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-red-500 [&::-webkit-slider-thumb]:rounded-full cursor-pointer shadow-inner"
                            />
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-xs font-black opacity-50 w-3 text-center text-green-500">{t("color_g") || "G"}</span>
                            <input
                              type="range" min="0" max="255"
                              value={HexToRGB(currentTheme[key]).g}
                              onChange={(e) => handleUpdateTheme({ [key]: RGBToHex(HexToRGB(currentTheme[key]).r, parseInt(e.target.value), HexToRGB(currentTheme[key]).b) })}
                              className="flex-1 h-3 bg-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-green-500 [&::-webkit-slider-thumb]:rounded-full cursor-pointer shadow-inner"
                            />
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-xs font-black opacity-50 w-3 text-center text-blue-500">{t("color_b") || "B"}</span>
                            <input
                              type="range" min="0" max="255"
                              value={HexToRGB(currentTheme[key]).b}
                              onChange={(e) => handleUpdateTheme({ [key]: RGBToHex(HexToRGB(currentTheme[key]).r, HexToRGB(currentTheme[key]).g, parseInt(e.target.value)) })}
                              className="flex-1 h-3 bg-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full cursor-pointer shadow-inner"
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

        <div className="mt-14 mb-8 flex items-center gap-4 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-4">
          <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">tune</span>
          <h2 className="text-[14px] font-black uppercase tracking-[0.15em] text-[var(--text)]">{t("forge_typography") || "Typography"}</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div className="flex flex-col gap-4">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] ml-1 text-[var(--subtext)] opacity-60">{t("forge_font_family") || "Primary Font"}</label>
            <div className="flex flex-wrap gap-3">
              {["Inter, sans-serif", "'Space Mono', monospace", "'Orbitron', sans-serif", "'Fira Code', monospace", "'Rajdhani', sans-serif", "'Share Tech Mono', monospace", "'VT323', monospace", "Courier New, monospace"].map(font => (
                <button
                  key={font}
                  onClick={() => handleUpdateTheme({ fontFamily: font })}
                  className={`px-5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${currentTheme.fontFamily === font || (!currentTheme.fontFamily && font.includes('Inter')) ? 'theme-glass-panel border-[var(--accent)] theme-text-accent shadow-[0_0_30px_rgba(var(--accent-rgb),0.5)] scale-105' : 'theme-glass-panel hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner'}`}
                  style={{
                    fontFamily: font,
                    backgroundColor: (currentTheme.fontFamily === font || (!currentTheme.fontFamily && font.includes('Inter'))) ? "color-mix(in srgb, var(--accent) 15%, transparent)" : undefined
                  }}
                >
                  {font.split(',')[0].replace("'", "").replace("'", "")}
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
                  onChange={(e) => handleUpdateTheme({ [cfg.key]: cfg.isPx ? `${e.target.value}px` : `${e.target.value}rem` })}
                  className="w-full sanctuary-slider"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14 mb-8 flex items-center gap-4 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-4">
          <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">tune</span>
          <h2 className="text-[14px] font-black uppercase tracking-[0.15em] text-[var(--text)]">{t("forge_glass") || "Glass & Material"}</h2>
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
              onChange={(e) => handleUpdateTheme({ glassOpacity: `${e.target.value}%` })}
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
              onChange={(e) => handleUpdateTheme({ glassBlur: `${e.target.value}px` })}
              className="w-full sanctuary-slider"
            />
          </div>
        </div>

        <div className="mt-14 mb-8 flex items-center gap-4 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-4">
          <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">tune</span>
          <h2 className="text-[14px] font-black uppercase tracking-[0.15em] text-[var(--text)]">{t("forge_geometry") || "Shape Geometry"}</h2>
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-[10px] font-black uppercase tracking-[0.2em] ml-1 text-[var(--subtext)] opacity-80 flex justify-between">
            <span>{t("forge_radius") || "Border Radius"}</span>
            <span className="theme-text-accent">{currentTheme.radius || "1.5rem"}</span>
          </label>
          <input
            type="range" min="0" max="4" step="0.125"
            value={parseFloat(currentTheme.radius || "1.5") || 1.5}
            onChange={(e) => handleUpdateTheme({ radius: `${e.target.value}rem` })}
            className="w-full sanctuary-slider"
          />
        </div>

        <div className="mt-14 mb-8 flex items-center gap-4 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-4">
          <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">tune</span>
          <h2 className="text-[14px] font-black uppercase tracking-[0.15em] text-[var(--text)]">{t("forge_background") || "Background Override"}</h2>
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
                onClick={() => handleUpdateTheme({ bgGradient: preset.id })}
                className={`aspect-video rounded-xl border transition-all flex flex-col items-center justify-center gap-2 p-2 relative overflow-hidden group shadow-lg ${currentTheme.bgGradient === preset.id || (!currentTheme.bgGradient && preset.id === 'none') ? 'border-[var(--accent)] shadow-[0_0_20px_rgba(var(--accent-rgb),0.4)] scale-[1.02]' : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)]'}`}
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
            onChange={(e) => handleUpdateTheme({ bgGradient: e.target.value })}
            className="w-full theme-glass-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-5 py-4 text-[10px] font-mono text-[var(--text)] uppercase tracking-widest outline-none focus:theme-border-accent transition-all shadow-inner"
            placeholder={t("ui_bg_gradient_ph") || "linear-gradient(to bottom, #000, #111)"}
          />
        </div>
      </div>
    </div>
  );
}
