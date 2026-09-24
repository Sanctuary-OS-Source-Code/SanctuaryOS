import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLexicon } from '../LexiconContext';
import { HexToRGB, RGBToHex, PRESET_COLORS, SEMANTIC_SHADES, themeKeys } from './ChameleonShared';
import { GlassSegmentedControl } from '../shared';
import { UniversalCard } from '../components/universal/UniversalCard';
import { Slider } from '../components/universal/Slider';

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
  const [pickerCoords, setPickerCoords] = useState<{ top?: number, left?: number, right?: number } | null>(null);
  const [activeTab, setActiveTab] = useState<'colors' | 'typography' | 'structure' | 'backgrounds'>('colors');

  const [bgBuilderType, setBgBuilderType] = useState<'solid' | 'linear' | 'radial'>('linear');
  const [bgBuilderAngle, setBgBuilderAngle] = useState(135);
  const [bgBuilderColor1, setBgBuilderColor1] = useState('#1e1b4b');
  const [bgBuilderColor2, setBgBuilderColor2] = useState('#000000');

  const applyBgBuilder = (type: 'solid' | 'linear' | 'radial', angle: number, c1: string, c2: string) => {
    let css = 'none';
    if (type === 'solid') css = c1;
    else if (type === 'linear') css = `linear-gradient(${angle}deg, ${c1} 0%, ${c2} 100%)`;
    else if (type === 'radial') css = `radial-gradient(circle at center, ${c1} 0%, ${c2} 100%)`;
    handleUpdateTheme({ bgGradient: css });
  };


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
  const canRename = !!renameTheme;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        const MAX_WIDTH = 1920;
        const MAX_HEIGHT = 1080;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height = Math.round(height * (MAX_WIDTH / width));
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = Math.round(width * (MAX_HEIGHT / height));
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/webp', 0.7);
          handleUpdateTheme({ bgImage: dataUrl });
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex-1 flex flex-col h-full border-r border-[color-mix(in_srgb,var(--text)_5%,transparent)] overflow-hidden">
      <div className="flex flex-col gap-4 px-6 pt-5 pb-0 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-transparent shrink-0">
        <div className="flex-1 flex flex-col justify-start">
          <input
            type="text"
            value={currentTheme.name || ""}
            onChange={(e) => canRename && renameTheme(editingThemeId!, e.target.value)}
            className="w-full bg-transparent border-b border-transparent hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] focus:theme-border-accent outline-none text-3xl font-black text-[var(--text)] capitalize tracking-widest transition-colors py-1"
            placeholder={t("forge_theme_name_placeholder")}
            disabled={!canRename}
          />
          <p className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)] opacity-60 mt-2 ml-1">
            {t("ui_use_dashboard")}
          </p>
        </div>

        <div className="flex items-center w-full mt-4 mb-6 relative z-10 shrink-0">
          <GlassSegmentedControl
            options={[
              { id: 'colors', label: t("forge_tab_colors") || 'Chromatics' },
              { id: 'typography', label: t("forge_tab_typography") || 'Glyphs' },
              { id: 'structure', label: t("forge_tab_structure") || 'Architecture & Silica' },
              { id: 'backgrounds', label: t("forge_tab_backgrounds") || 'Atmospherics & VFX' }
            ]}
            activeTab={activeTab}
            setTab={(id: any) => setActiveTab(id)}
            className="!w-full flex-1 [&>button]:!flex-1"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col pb-32">
        {activeTab === 'colors' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {themeKeys.map(key => (
              <div key={key} className="flex flex-col gap-3 group">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2 group-hover:text-[var(--text)] transition-colors">
                  {t(`color_${key}`) || key.toUpperCase()}
                </label>
                <div className="relative">
                  <div
                    className="flex items-center justify-between w-full glass-panel rounded-2xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] transition-all border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-inner cursor-pointer active:scale-95 group/swatch"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (activeColorPicker === key) {
                        setActiveColorPicker(null);
                      } else {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setPickerCoords({
                          top: Math.min(rect.bottom + 12, window.innerHeight - 450),
                          left: Math.min(rect.left, window.innerWidth - 450)
                        });
                        setActiveColorPicker(key);
                      }
                    }}
                  >
                    <div className="flex items-center gap-3 w-full">
                      <div
                        className="w-5 h-5 rounded-full border border-[color-mix(in_srgb,var(--text)_15%,transparent)] shadow-inner shrink-0 group-hover/swatch:scale-110 transition-transform"
                        style={{ backgroundColor: currentTheme[key] }}
                      />
                      <code
                        className="text-[10px] font-mono tracking-widest opacity-70 group-hover/swatch:opacity-100 transition-opacity uppercase"
                        style={{ color: currentTheme.text }}
                      >
                        {currentTheme[key]?.toUpperCase() || '#000000'}
                      </code>
                    </div>
                    <span className="material-symbols-outlined !text-[16px] opacity-30 group-hover/swatch:opacity-100 transition-opacity">colorize</span>
                  </div>

                  {activeColorPicker === key && createPortal(
                    <>
                      <div className="fixed inset-0" style={{ zIndex: 999998 }} onPointerDown={(e) => { e.stopPropagation(); setActiveColorPicker(null); }} />
                      <div className="fixed p-8 glass-panel backdrop-blur-3xl rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_20px_50px_rgba(0,0,0,0.5)] w-[26rem] animate-in fade-in zoom-in-95 duration-200"
                        style={{ zIndex: 999999, ...pickerCoords }}>
                        <div className="flex gap-4 mb-8">
                          {!(key === 'success' || key === 'warning' || key === 'danger') ? (
                            <input
                              type="text"
                              value={currentTheme[key]}
                              onChange={(e) => handleUpdateTheme({ [key]: e.target.value })}
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
                            <h4 className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)] mb-4">{t("color_favs")}</h4>
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
                              <span className="text-xs font-black opacity-50 w-3 text-center text-red-500">{t("color_r")}</span>
                              <Slider
                                min={0} max={255}
                                value={HexToRGB(currentTheme[key]).r}
                                onChange={(e) => handleUpdateTheme({ [key]: RGBToHex(parseInt(e.target.value), HexToRGB(currentTheme[key]).g, HexToRGB(currentTheme[key]).b) })}
                                className="flex-1"
                                style={{ '--accent': '#ef4444' } as React.CSSProperties}
                              />
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="text-xs font-black opacity-50 w-3 text-center text-green-500">{t("color_g")}</span>
                              <Slider
                                min={0} max={255}
                                value={HexToRGB(currentTheme[key]).g}
                                onChange={(e) => handleUpdateTheme({ [key]: RGBToHex(HexToRGB(currentTheme[key]).r, parseInt(e.target.value), HexToRGB(currentTheme[key]).b) })}
                                className="flex-1"
                                style={{ '--accent': '#22c55e' } as React.CSSProperties}
                              />
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="text-xs font-black opacity-50 w-3 text-center text-blue-500">{t("color_b")}</span>
                              <Slider
                                min={0} max={255}
                                value={HexToRGB(currentTheme[key]).b}
                                onChange={(e) => handleUpdateTheme({ [key]: RGBToHex(HexToRGB(currentTheme[key]).r, HexToRGB(currentTheme[key]).g, parseInt(e.target.value)) })}
                                className="flex-1"
                                style={{ '--accent': '#3b82f6' } as React.CSSProperties}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </>, document.getElementById('sa-portals') || document.body
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'typography' && (
          <div className="flex flex-col gap-12 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex flex-col gap-6 w-full xl:w-4/5">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-1">{t("forge_font_family")}</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {["Inter, sans-serif", "'Space Mono', monospace", "'Orbitron', sans-serif", "'Fira Code', monospace", "'Rajdhani', sans-serif", "'Share Tech Mono', monospace", "'VT323', monospace", "Courier New, monospace"].map((font) => {
                  const isActive = currentTheme.fontFamily === font || (!currentTheme.fontFamily && font.includes('Inter'));
                  const fontName = font.split(',')[0].replace(/'/g, "");
                  return (
                    <button
                      key={font}
                      onClick={() => handleUpdateTheme({ fontFamily: font })}
                      className={`glass-panel w-full flex flex-col items-center justify-center p-4 rounded-2xl gap-3 transition-all group relative overflow-hidden ${isActive ? 'border-[var(--accent)] shadow-[0_0_20px_rgba(var(--accent-rgb),0.1)]' : 'hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] border-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}
                    >
                      {isActive && <div className="absolute inset-0 bg-gradient-to-b from-[color-mix(in_srgb,var(--accent)_15%,transparent)] to-transparent pointer-events-none" />}
                      <span className={`text-3xl transition-colors ${isActive ? 'theme-text-accent drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]' : 'text-[var(--text)] opacity-50 group-hover:opacity-100'}`} style={{ fontFamily: font }}>Ag</span>
                      <span className={`text-[9px] font-black tracking-widest uppercase transition-colors ${isActive ? 'theme-text-accent' : 'text-[var(--subtext)] group-hover:text-[var(--text)]'}`}>
                        {fontName}
                      </span>
                      {isActive && <span className="material-symbols-outlined absolute top-2 right-2 !text-[14px] theme-text-accent">check_circle</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-3 w-full xl:w-4/5">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-1 mb-2">{t("forge_tab_fonts")}</label>
              {[
                { key: 'fontSizeHeader', label: t('forge_font_header'), def: '1.875', max: 4, icon: 'format_h1' },
                { key: 'fontSizeSubheader', label: t('forge_font_subheader'), def: '1.5', max: 3, icon: 'format_h2' },
                { key: 'fontSizeTitle', label: t('forge_font_title'), def: '1.25', max: 2.5, icon: 'title' },
                { key: 'fontSizeSubtitle', label: t('forge_font_subtitle'), def: '1.125', max: 2, icon: 'subtitles' },
                { key: 'fontSizeText', label: t('forge_font_text'), def: '1', max: 2, icon: 'notes' },
                { key: 'fontSizeSubtext', label: t('forge_font_subtext'), def: '0.75', max: 1.5, icon: 'short_text' },
                { key: 'fontSizeSidebar', label: t('forge_font_sidebar'), def: '10', max: 20, isPx: true, icon: 'view_sidebar' },
                { key: 'sidebarWidth', label: t('forge_sidebar_width'), def: '288', max: 500, min: 200, isPx: true, icon: 'width' }
              ].map(cfg => (
                <UniversalCard
                  key={cfg.key}
                  layout="horizontal"
                  icon={cfg.icon}
                  title={cfg.label}
                  subtitle={
                    <span className="text-[10px] text-[var(--accent)] font-bold font-mono">
                      {currentTheme[cfg.key] || (cfg.isPx ? `${cfg.def}px` : `${cfg.def}rem`)}
                    </span>
                  }
                  className="w-full"
                >
                  <div className="w-full pt-2">
                    <Slider
                      min={cfg.min !== undefined ? cfg.min : (cfg.isPx ? 6 : 0.5)} max={cfg.max} step={cfg.isPx ? 1 : 0.125}
                      value={parseFloat(currentTheme[cfg.key] || cfg.def) || parseFloat(cfg.def)}
                      onChange={(e) => handleUpdateTheme({ [cfg.key]: cfg.isPx ? `${e.target.value}px` : `${e.target.value}rem` })}
                      className="w-full sanctuary-slider"
                    />
                  </div>
                </UniversalCard>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'structure' && (
          <div className="flex flex-col gap-12 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex flex-col gap-3 w-full xl:w-4/5">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-1 mb-2">{t("forge_glass_opacity")}</label>
              <UniversalCard
                layout="horizontal"
                icon="opacity"
                title={t("forge_glass_opacity")}
                subtitle={
                  <span className="text-[10px] text-[var(--accent)] font-bold font-mono">
                    {currentTheme.glassOpacity || "3%"}
                  </span>
                }
                className="w-full"
              >
                <div className="w-full pt-2">
                  <Slider
                    min={0} max={100} step={1}
                    value={parseFloat(currentTheme.glassOpacity || '3')}
                    onChange={(e) => handleUpdateTheme({ glassOpacity: `${e.target.value}%` })}
                    className="w-full sanctuary-slider"
                  />
                </div>
              </UniversalCard>

              <UniversalCard
                layout="horizontal"
                icon="blur_on"
                title={t("forge_glass_blur")}
                subtitle={
                  <span className="text-[10px] text-[var(--accent)] font-bold font-mono">
                    {currentTheme.glassBlur || "16px"}
                  </span>
                }
                className="w-full mt-2"
              >
                <div className="w-full pt-2">
                  <Slider
                    min={0} max={64} step={1}
                    value={parseInt(currentTheme.glassBlur || "16") || 16}
                    onChange={(e) => handleUpdateTheme({ glassBlur: `${e.target.value}px` })}
                    className="w-full sanctuary-slider"
                  />
                </div>
              </UniversalCard>

              <UniversalCard
                layout="horizontal"
                icon="rounded_corner"
                title={t("forge_radius")}
                subtitle={
                  <span className="text-[10px] text-[var(--accent)] font-bold font-mono">
                    {currentTheme.radius || "1.5rem"}
                  </span>
                }
                className="w-full mt-2"
              >
                <div className="w-full pt-2">
                  <Slider
                    min={0} max={4} step={0.125}
                    value={parseFloat(currentTheme.radius || "1.5") || 1.5}
                    onChange={(e) => handleUpdateTheme({ radius: `${e.target.value}rem` })}
                    className="w-full sanctuary-slider"
                  />
                </div>
              </UniversalCard>
            </div>
          </div>
        )}

        {activeTab === 'backgrounds' && (
          <div className="flex flex-col gap-12 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex flex-col gap-6">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("forge_wallpaper_engine")}</label>
              <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
                {currentTheme.bgImage ? (
                  <div className="relative w-72 h-40 rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-lg group">
                    <img src={currentTheme.bgImage} alt="Wallpaper Preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 rounded-[inherit] bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <button
                        onClick={() => handleUpdateTheme({ bgImage: null })}
                        className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/50 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all shadow-md"
                      >
                        {t("forge_bg_remove")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="w-72 h-40 rounded-2xl border border-dashed border-[color-mix(in_srgb,var(--text)_20%,transparent)] flex flex-col items-center justify-center gap-3 opacity-60">
                    <span className="material-symbols-outlined !text-[36px]">image_not_supported</span>
                    <span className="text-[10px] font-black uppercase tracking-widest">{t("forge_bg_none")}</span>
                  </div>
                )}

                <div className="flex-1 flex flex-col gap-4">
                  <div className="relative">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="absolute inset-0 rounded-[inherit] w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div className="w-full px-6 py-5 glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] rounded-2xl flex items-center justify-center gap-3 hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:scale-[1.02] transition-all shadow-md">
                      <span className="material-symbols-outlined !text-[24px] text-[var(--accent)]">upload</span>
                      <span className="text-xs font-black uppercase tracking-widest text-[var(--text)] group-hover:text-[var(--accent)]">{t("forge_bg_upload")}</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-[var(--subtext)] font-black capitalize tracking-widest ml-1 opacity-60 leading-relaxed">
                    {t("forge_bg_upload_desc")}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-6 pt-6 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("forge_bg_selector")}</label>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {[
                  { id: 'none', label: t("forge_bg_solid") },
                  { id: 'linear-gradient(to bottom right, #171520, #241b2f)', label: t("forge_bg_miami") },
                  { id: 'radial-gradient(circle at center, #1e1b4b, #000000)', label: t("forge_bg_abyssal") },
                  { id: 'linear-gradient(135deg, rgba(2,0,36,1) 0%, rgba(9,9,121,1) 35%, rgba(0,212,255,1) 100%)', label: t("forge_bg_ocean") },
                  { id: 'radial-gradient(circle at top right, #3f3f46, #000000)', label: t("forge_bg_slate") },
                  { id: 'radial-gradient(circle at 80% -20%, rgba(56, 189, 248, 0.6) 0%, transparent 50%), radial-gradient(circle at 10% 100%, rgba(14, 165, 233, 0.4) 0%, transparent 60%), radial-gradient(circle at 50% 50%, rgba(2, 6, 23, 0.7) 0%, transparent 100%), #050b14', label: t("forge_bg_architect") },
                  { id: 'radial-gradient(circle at 20% -20%, rgba(249, 42, 173, 0.7) 0%, transparent 60%), radial-gradient(circle at 80% 120%, rgba(11, 3, 45, 0.9) 0%, transparent 70%), radial-gradient(circle at 50% 50%, rgba(76, 29, 149, 0.5) 0%, transparent 100%), #14052b', label: t("forge_bg_synthwave") }
                ].map(preset => (
                  <button
                    key={preset.id}
                    onClick={() => handleUpdateTheme({ bgGradient: preset.id })}
                    className={`aspect-video rounded-xl border transition-all flex flex-col items-center justify-center gap-2 p-2 relative overflow-hidden group shadow-lg ${currentTheme.bgGradient === preset.id || (!currentTheme.bgGradient && preset.id === 'none') ? 'border-[var(--accent)] shadow-[0_0_20px_rgba(var(--accent-rgb),0.4)] scale-[1.02]' : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)]'}`}
                    style={{
                      backgroundColor: (currentTheme.bgGradient === preset.id || (!currentTheme.bgGradient && preset.id === 'none')) ? "color-mix(in srgb, var(--accent) 15%, transparent)" : undefined
                    }}
                  >
                    <div className="absolute inset-0 rounded-[inherit] opacity-40 group-hover:opacity-100 transition-opacity" style={{ background: preset.id === 'none' ? currentTheme.bg : preset.id }} />
                    <span className={`relative z-10 text-[9px] font-black capitalize tracking-widest drop-shadow-md text-center ${(currentTheme.bgGradient === preset.id || (!currentTheme.bgGradient && preset.id === 'none')) ? 'theme-text-accent text-shadow-[0_0_10px_var(--accent)]' : 'text-white'}`}>{preset.label}</span>
                  </button>
                ))}
              </div>


              <div className="flex flex-col gap-4 mt-6 w-full lg:w-2/3">
                <div className="glass-panel rounded-2xl flex flex-col overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-lg transition-all focus-within:border-[var(--accent)] focus-within:shadow-[0_0_20px_rgba(var(--accent-rgb),0.1)] group">
                  <div className="bg-[color-mix(in_srgb,var(--text)_5%,transparent)] px-4 py-3 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] flex justify-between items-center group-focus-within:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] transition-colors">
                    <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text)]">{t("forge_background_builder") || "Atmospheric Forge"}</span>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className={`text-[8px] font-black uppercase tracking-widest transition-colors ${currentTheme.animated !== false ? 'theme-text-accent drop-shadow-[0_0_5px_rgba(var(--accent-rgb),0.5)]' : 'text-[var(--subtext)]'}`}>{t("forge_bg_animated")}</span>
                      <div className={`w-6 h-3 rounded-full p-0.5 transition-colors ${currentTheme.animated !== false ? 'bg-[var(--accent)]' : 'bg-[color-mix(in_srgb,var(--text)_20%,transparent)]'}`}>
                        <div className={`w-2 h-2 rounded-full bg-white transition-transform shadow-sm ${currentTheme.animated !== false ? 'translate-x-3' : 'translate-x-0'}`} />
                      </div>
                      <input
                        type="checkbox"
                        className="hidden"
                        checked={currentTheme.animated !== false}
                        onChange={(e) => handleUpdateTheme({ animated: e.target.checked })}
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                    {/* Render Topology */}
                    <div className="p-4 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--text)_3%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors">
                      <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] mb-3 block">Render Topology</label>
                      <div className="flex gap-2">
                        {([
                          { id: 'solid', label: 'Solid' },
                          { id: 'linear', label: 'Linear' },
                          { id: 'radial', label: 'Radial' }
                        ] as const).map((mode) => (
                          <button
                            key={mode.id}
                            onClick={() => {
                              setBgBuilderType(mode.id);
                              applyBgBuilder(mode.id, bgBuilderAngle, bgBuilderColor1, bgBuilderColor2);
                            }}
                            className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${bgBuilderType === mode.id ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] border border-[var(--accent)] text-white shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_30%,transparent)]' : 'bg-black/20 border border-transparent text-[var(--subtext)] hover:text-white'}`}
                          >
                            {mode.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Trajectory Vector */}
                    <div className={`p-4 rounded-xl border transition-all ${bgBuilderType === 'linear' ? 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--text)_3%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]' : 'border-transparent bg-transparent opacity-30 pointer-events-none'} flex flex-col justify-between`}>
                      <div className="flex justify-between items-center mb-3">
                        <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] block">Trajectory Vector</label>
                        <code className="text-[10px] font-mono font-black theme-text-accent">{bgBuilderAngle}°</code>
                      </div>
                      <Slider
                        min={0} max={360} step={1}
                        value={bgBuilderAngle}
                        onChange={(e) => {
                          const ang = parseInt(e.target.value);
                          setBgBuilderAngle(ang);
                          applyBgBuilder(bgBuilderType, ang, bgBuilderColor1, bgBuilderColor2);
                        }}
                        className="w-full"
                      />
                    </div>

                    {/* Chromatic Matrix */}
                    <div className="col-span-1 md:col-span-2 p-4 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--text)_3%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors">
                      <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] mb-3 block">Chromatic Matrix</label>
                      <div className={`grid gap-4 ${bgBuilderType === 'solid' ? 'grid-cols-1' : 'grid-cols-2'}`}>
                        {/* Node 1 */}
                        <button
                          onClick={(e) => {
                            if (activeColorPicker === 'bgbuilder_c1') setActiveColorPicker(null);
                            else {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setPickerCoords({ top: Math.min(rect.bottom + 12, window.innerHeight - 450), left: Math.min(rect.left, window.innerWidth - 450) });
                              setActiveColorPicker('bgbuilder_c1');
                            }
                          }}
                          className={`flex items-center gap-4 p-3 rounded-lg bg-black/20 border transition-all text-left group ${activeColorPicker === 'bgbuilder_c1' ? 'border-[var(--accent)] shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_30%,transparent)] scale-[1.02]' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)]'}`}
                        >
                          <div className="w-10 h-10 rounded-full border-2 border-white/20 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] shrink-0 transition-transform group-hover:scale-110" style={{ backgroundColor: bgBuilderColor1 }} />
                          <div className="flex flex-col">
                            <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] group-hover:text-white transition-colors">Primary Node</span>
                            <code className="text-[13px] font-mono font-black text-white">{bgBuilderColor1}</code>
                          </div>
                        </button>

                        {/* Node 2 */}
                        {bgBuilderType !== 'solid' && (
                          <button
                            onClick={(e) => {
                              if (activeColorPicker === 'bgbuilder_c2') setActiveColorPicker(null);
                              else {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setPickerCoords({ top: Math.min(rect.bottom + 12, window.innerHeight - 450), left: Math.min(rect.left, window.innerWidth - 450) });
                                setActiveColorPicker('bgbuilder_c2');
                              }
                            }}
                            className={`flex items-center gap-4 p-3 rounded-lg bg-black/20 border transition-all text-left group ${activeColorPicker === 'bgbuilder_c2' ? 'border-[var(--accent)] shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_30%,transparent)] scale-[1.02]' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)]'}`}
                          >
                            <div className="w-10 h-10 rounded-full border-2 border-white/20 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] shrink-0 transition-transform group-hover:scale-110" style={{ backgroundColor: bgBuilderColor2 }} />
                            <div className="flex flex-col">
                              <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] group-hover:text-white transition-colors">Secondary Node</span>
                              <code className="text-[13px] font-mono font-black text-white">{bgBuilderColor2}</code>
                            </div>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Color Picker Portal for Background Builder */}
                  {(activeColorPicker === 'bgbuilder_c1' || activeColorPicker === 'bgbuilder_c2') && createPortal(
                    <>
                      <div className="fixed inset-0" style={{ zIndex: 999998 }} onPointerDown={(e) => { e.stopPropagation(); setActiveColorPicker(null); }} />
                      <div className="fixed p-8 glass-panel backdrop-blur-3xl rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_20px_50px_rgba(0,0,0,0.5)] w-[26rem] animate-in fade-in zoom-in-95 duration-200"
                        style={{ zIndex: 999999, ...pickerCoords }}>
                        <div className="flex gap-4 mb-8">
                          <input
                            type="text"
                            value={activeColorPicker === 'bgbuilder_c1' ? bgBuilderColor1 : bgBuilderColor2}
                            onChange={(e) => {
                              const col = e.target.value;
                              if (activeColorPicker === 'bgbuilder_c1') {
                                setBgBuilderColor1(col);
                                applyBgBuilder(bgBuilderType, bgBuilderAngle, col, bgBuilderColor2);
                              } else {
                                setBgBuilderColor2(col);
                                applyBgBuilder(bgBuilderType, bgBuilderAngle, bgBuilderColor1, col);
                              }
                            }}
                            className="flex-1 glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl px-5 py-4 text-xs font-black text-[var(--text)] capitalize tracking-widest outline-none focus:theme-border-accent transition-colors shadow-inner "
                          />
                        </div>
                        <div className="grid grid-cols-8 gap-3">
                          {PRESET_COLORS.map(color => (
                            <button
                              key={color}
                              onClick={() => {
                                if (activeColorPicker === 'bgbuilder_c1') {
                                  setBgBuilderColor1(color);
                                  applyBgBuilder(bgBuilderType, bgBuilderAngle, color, bgBuilderColor2);
                                } else {
                                  setBgBuilderColor2(color);
                                  applyBgBuilder(bgBuilderType, bgBuilderAngle, bgBuilderColor1, color);
                                }
                              }}
                              className={`w-7 h-7 rounded-full border hover:scale-125 transition-all shadow-sm ${((activeColorPicker === 'bgbuilder_c1' ? bgBuilderColor1 : bgBuilderColor2) === color) ? 'theme-border-accent scale-110 shadow-[0_0_15px_var(--accent)]' : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)]'}`}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      </div>
                    </>, document.getElementById('sa-portals') || document.body
                  )}

                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4 mt-6 pt-6 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("forge_atmospheric_overrides")}</label>
              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-3 cursor-pointer group w-fit">
                  <input
                    type="checkbox"
                    checked={currentTheme.ambientNoise !== false}
                    onChange={(e) => handleUpdateTheme({ ambientNoise: e.target.checked })}
                    className="w-4 h-4 rounded border border-[color-mix(in_srgb,var(--text)_30%,transparent)] appearance-none checked:bg-[var(--accent)] checked:border-[var(--accent)] transition-all relative before:content-[''] before:absolute before:inset-0 before:bg-white before:opacity-0 checked:before:opacity-20 hover:border-[var(--text)] shadow-inner"
                  />
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] group-hover:theme-text-accent transition-colors">{t("forge_ambient_grain")}</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer group w-fit">
                  <input
                    type="checkbox"
                    checked={currentTheme.ambientOrb !== false}
                    onChange={(e) => handleUpdateTheme({ ambientOrb: e.target.checked })}
                    className="w-4 h-4 rounded border border-[color-mix(in_srgb,var(--text)_30%,transparent)] appearance-none checked:bg-[var(--accent)] checked:border-[var(--accent)] transition-all relative before:content-[''] before:absolute before:inset-0 before:bg-white before:opacity-0 checked:before:opacity-20 hover:border-[var(--text)] shadow-inner"
                  />
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] group-hover:theme-text-accent transition-colors">{t("forge_ambient_orb")}</span>
                </label>
                <p className="text-[9px] text-[var(--subtext)] font-black capitalize tracking-widest ml-1 opacity-60 mt-1">
                  {t("forge_atmospheric_desc")}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}




