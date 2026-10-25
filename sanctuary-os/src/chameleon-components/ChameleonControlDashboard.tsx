import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useLexicon } from '../LexiconContext';
import {
  HexToRGB,
  RGBToHex,
  PRESET_COLORS,
  SEMANTIC_SHADES,
  themeKeys,
  GLASS_MATERIAL_PRESETS,
  CURATED_COLOR_PALETTES,
  BUILTIN_WALLPAPERS,
  autoHarmonizeThemeColors
} from './ChameleonShared';
import { UniversalCard } from '../components/universal/UniversalCard';
import { Slider } from '../components/universal/Slider';
import { DashboardStatTile } from '../hub-components/SharedCommandScreenLayout';
import { useStore } from '../store';

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
  const pushStatus = useStore((state) => state.pushStatus);
  const [activeColorPicker, setActiveColorPicker] = useState<string | null>(null);
  const [pickerCoords, setPickerCoords] = useState<{ top?: number; left?: number; right?: number } | null>(null);
  const [activeTab, setActiveTab] = useState<'presets' | 'optics' | 'typography' | 'backgrounds'>('presets');

  const [bgBuilderType, setBgBuilderType] = useState<'solid' | 'linear' | 'radial'>('linear');
  const [bgBuilderAngle, setBgBuilderAngle] = useState(135);
  const [bgBuilderColor1, setBgBuilderColor1] = useState('#1e1b4b');
  const [bgBuilderColor2, setBgBuilderColor2] = useState('#020617');

  const applyBgBuilder = (type: 'solid' | 'linear' | 'radial', angle: number, c1: string, c2: string) => {
    let css = 'none';
    if (type === 'solid') css = c1;
    else if (type === 'linear') css = `linear-gradient(${angle}deg, ${c1} 0%, ${c2} 100%)`;
    else if (type === 'radial') css = `radial-gradient(circle at center, ${c1} 0%, ${c2} 100%)`;
    handleUpdateTheme({ bgGradient: css });
  };

  const [favColors, setFavColors] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('sanctuary_fav_colors') || '[]');
    } catch {
      return [];
    }
  });

  const toggleFavColor = (color: string) => {
    let updated: string[];
    if (favColors.includes(color)) updated = favColors.filter((c) => c !== color);
    else updated = [...favColors, color].slice(-12);
    setFavColors(updated);
    localStorage.setItem('sanctuary_fav_colors', JSON.stringify(updated));
  };

  const canRename = !!renameTheme;

  const compressUploadedImage = (file: File, maxW: number, maxH: number, callback: (dataUrl: string) => void) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxW) {
            height = Math.round(height * (maxW / width));
            width = maxW;
          }
        } else {
          if (height > maxH) {
            width = Math.round(width * (maxH / height));
            height = maxH;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/webp', 0.78);
          callback(dataUrl);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    compressUploadedImage(file, 1920, 1080, (dataUrl) => {
      handleUpdateTheme({ bgImage: dataUrl });
    });
  };

  const handlePreviewImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    compressUploadedImage(file, 1280, 720, (dataUrl) => {
      handleUpdateTheme({ previewImage: dataUrl });
    });
  };

  const handleCopyThemeJson = () => {
    try {
      navigator.clipboard.writeText(JSON.stringify(currentTheme, null, 2));
      pushStatus?.(t('forge_status_copied_json', 'Theme JSON copied to clipboard.'));
    } catch {
      // ignore clipboard errors
    }
  };

  const allEditableColorKeys = [...themeKeys, 'panelTint'];

  const toPercentInt = (rawVal: any, fallbackPercent: number) => {
    if (rawVal === undefined || rawVal === null || rawVal === '') return fallbackPercent;
    const str = String(rawVal).trim();
    if (str.endsWith('%')) {
      const p = parseFloat(str);
      return isNaN(p) ? fallbackPercent : Math.round(p);
    }
    const n = parseFloat(str);
    if (isNaN(n)) return fallbackPercent;
    return n <= 1 && n >= 0 && !str.includes('%') && str.includes('.')
      ? Math.round(n * 100)
      : Math.round(n);
  };

  const opacityPct = toPercentInt(currentTheme.glassOpacity, 14);
  const blurPx = parseInt(String(currentTheme.glassBlur || '34'), 10) || 34;
  const saturationPct = parseInt(String(currentTheme.glassSaturation || '195'), 10) || 195;
  const borderPct = toPercentInt(currentTheme.glassBorderOpacity, 26);
  const specularPct = toPercentInt(currentTheme.glassSpecular, 36);
  const shadowPct = toPercentInt(currentTheme.glassShadow, 46);

  return (
    <div className="flex-1 flex flex-col h-full border-r border-[color-mix(in_srgb,var(--text)_6%,transparent)] overflow-hidden">
      {/* Forge Header & 4-Tile Navigation */}
      <div className="flex flex-col gap-4 px-6 pt-5 pb-5 border-b border-[color-mix(in_srgb,var(--text)_6%,transparent)] bg-transparent shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex-1 flex flex-col justify-start min-w-0">
            <input
              type="text"
              value={currentTheme.name || ''}
              onChange={(e) => canRename && renameTheme && editingThemeId && renameTheme(editingThemeId, e.target.value)}
              className="w-full bg-transparent border-b border-transparent hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] focus:theme-border-accent outline-none text-2xl md:text-3xl font-black text-[var(--text)] tracking-tight transition-colors py-1 truncate"
              placeholder={t('forge_theme_name_placeholder', 'Enter Theme Name...')}
              disabled={!canRename}
            />
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-65 mt-1">
              {t('ui_use_dashboard', 'Customize Liquid Glass optics, chromatic palettes, typography, and refractive wallpapers.')}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                const harmonized = autoHarmonizeThemeColors(currentTheme);
                handleUpdateTheme(harmonized);
                pushStatus?.(t('forge_status_harmonized', 'Text & surface contrast automatically harmonized.'));
              }}
              className="glass-surface px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest text-[var(--text)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-all flex items-center gap-1.5"
              title={t('forge_btn_auto_contrast', 'Auto-Harmonize Contrast')}
            >
              <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                {t('icon_contrast', 'contrast')}
              </span>
              <span>{t('forge_btn_auto_contrast', 'Auto-Harmonize')}</span>
            </button>

            <button
              type="button"
              onClick={handleCopyThemeJson}
              className="glass-surface px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] hover:text-[var(--text)] hover:border-[color-mix(in_srgb,var(--text)_25%,transparent)] transition-all flex items-center gap-1.5"
              title={t('forge_btn_copy_json', 'Copy Theme JSON')}
            >
              <span className="material-symbols-outlined !text-[14px]">
                {t('icon_data_object', 'data_object')}
              </span>
              <span>{t('forge_btn_copy_json', 'Copy JSON')}</span>
            </button>
          </div>
        </div>

        {/* 4-Tile Filter Grid */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 w-full mt-1">
          <DashboardStatTile
            variant="filter"
            icon={t('icon_auto_awesome', 'auto_awesome')}
            label={t('forge_tab_presets', 'Presets')}
            value={t('forge_tab_presets_sub', 'Quick Styles')}
            isActive={activeTab === 'presets'}
            onClick={() => setActiveTab('presets')}
          />
          <DashboardStatTile
            variant="filter"
            icon={t('icon_blur_on', 'blur_on')}
            label={t('forge_tab_optics', 'Liquid Glass')}
            value={t('forge_tab_optics_sub', 'Optics & Colors')}
            isActive={activeTab === 'optics'}
            onClick={() => setActiveTab('optics')}
          />
          <DashboardStatTile
            variant="filter"
            icon={t('icon_text_fields', 'text_fields')}
            label={t('forge_tab_type_shape', 'Typography')}
            value={t('forge_tab_type_shape_sub', 'Fonts & Shape')}
            isActive={activeTab === 'typography'}
            onClick={() => setActiveTab('typography')}
          />
          <DashboardStatTile
            variant="filter"
            icon={t('icon_wallpaper', 'wallpaper')}
            label={t('forge_tab_atmosphere', 'Atmosphere')}
            value={t('forge_tab_atmosphere_sub', 'Wallpapers')}
            isActive={activeTab === 'backgrounds'}
            onClick={() => setActiveTab('backgrounds')}
          />
        </div>
      </div>

      {/* Tab Content Body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-10 pb-32">
        {/* TAB 1: QUICK PRESETS (1-CLICK GLASS MATERIALS & CURATED COLOR PALETTES) */}
        {activeTab === 'presets' && (
          <div className="flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Section 1: 1-Click Liquid Glass Material Presets */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between px-1">
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] font-black text-[var(--text)] uppercase tracking-[0.2em] flex items-center gap-2">
                    <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                      {t('icon_blur_on', 'blur_on')}
                    </span>
                    {t('forge_glass_presets_title', '1-Click Liquid Glass Materials')}
                  </label>
                  <p className="text-[10px] text-[var(--subtext)] opacity-75">
                    {t('forge_glass_presets_desc', 'Instantly calibrate all 6 optical refraction, specular glare, and elevation parameters.')}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {GLASS_MATERIAL_PRESETS.map((preset) => {
                  const presetOpacityPct = toPercentInt(preset.values.glassOpacity, 34);
                  const presetBorderDec = parseFloat(preset.values.glassBorderOpacity) || 0.22;
                  const presetSpecDec = parseFloat(preset.values.glassSpecular) || 0.32;
                  const presetBlurInt = parseInt(preset.values.glassBlur, 10) || 34;
                  const isCurrentMaterial =
                    Math.abs(opacityPct - presetOpacityPct) <= 2 &&
                    Math.abs(blurPx - presetBlurInt) <= 3;

                  const tintHex = currentTheme.panelTint || '#091326';
                  const tintRgb = HexToRGB(tintHex);
                  const accRgb = HexToRGB(currentTheme.accent || '#38bdf8');
                  const sampleAlpha = Math.max(0.10, Math.min(0.82, presetOpacityPct / 100));

                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleUpdateTheme(preset.values)}
                      className={`glass-panel p-4 rounded-2xl border text-left transition-all flex flex-col justify-between gap-3 group relative overflow-hidden cursor-pointer ${
                        isCurrentMaterial
                          ? 'border-[var(--accent)] shadow-[0_0_24px_rgba(var(--accent-rgb),0.22)]'
                          : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 w-full">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">
                              {t(preset.iconKey, preset.fallbackIcon)}
                            </span>
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-black text-[var(--text)] tracking-tight truncate">
                              {t(preset.labelKey, preset.fallbackLabel)}
                            </span>
                            <span className="text-[10px] text-[var(--subtext)] opacity-75 line-clamp-1">
                              {t(preset.descKey, preset.fallbackDesc)}
                            </span>
                          </div>
                        </div>
                        {isCurrentMaterial && (
                          <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0">
                            {t('icon_check_circle', 'check_circle')}
                          </span>
                        )}
                      </div>

                      {/* Live Optical Material Specimen Strip */}
                      <div
                        className="w-full h-11 rounded-xl relative overflow-hidden flex items-center justify-center p-2 border border-white/10"
                        style={{
                          backgroundImage: currentTheme.bgImage
                            ? `url("${currentTheme.bgImage}")`
                            : `linear-gradient(135deg, ${currentTheme.accent || '#38bdf8'}44 0%, ${currentTheme.bg || '#060b14'} 100%)`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center'
                        }}
                      >
                        <div
                          className="w-full h-full rounded-lg px-3 flex items-center justify-between"
                          style={{
                            backgroundColor: `rgba(${tintRgb.r}, ${tintRgb.g}, ${tintRgb.b}, ${sampleAlpha})`,
                            backgroundImage: `linear-gradient(165deg, rgba(255,255,255,${(presetSpecDec * 0.35).toFixed(2)}) 0%, transparent 55%, rgba(${accRgb.r},${accRgb.g},${accRgb.b},${(presetSpecDec * 0.25).toFixed(2)}) 100%)`,
                            backdropFilter: `blur(${Math.max(4, Math.round(presetBlurInt * 0.25))}px) saturate(${preset.values.glassSaturation})`,
                            WebkitBackdropFilter: `blur(${Math.max(4, Math.round(presetBlurInt * 0.25))}px) saturate(${preset.values.glassSaturation})`,
                            borderTop: `1px solid rgba(255,255,255,${Math.min(0.65, presetBorderDec * 1.4).toFixed(2)})`,
                            borderLeft: `1px solid rgba(255,255,255,${Math.min(0.48, presetBorderDec * 1.0).toFixed(2)})`,
                            borderRight: `1px solid rgba(${accRgb.r},${accRgb.g},${accRgb.b},${Math.min(0.45, presetBorderDec * 0.9).toFixed(2)})`,
                            borderBottom: `1px solid rgba(${accRgb.r},${accRgb.g},${accRgb.b},${Math.min(0.38, presetBorderDec * 0.75).toFixed(2)})`,
                            boxShadow: `inset 0 1px 0 0 rgba(255,255,255,${Math.min(0.65, presetSpecDec * 1.1).toFixed(2)}), 0 4px 12px rgba(0,0,0,0.35)`
                          }}
                        >
                          <span className="text-[9px] font-black uppercase tracking-widest text-white drop-shadow">
                            {`${presetOpacityPct}%`}
                          </span>
                          <span className="text-[9px] font-mono font-bold text-[var(--accent)] drop-shadow">
                            {`${preset.values.glassBlur} · ${preset.values.glassSaturation}`}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5 pt-1 w-full">
                        <div className="px-2 py-1 rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] flex flex-col">
                          <span className="text-[8px] font-black uppercase tracking-wider text-[var(--subtext)] opacity-60">
                            {t('forge_metric_opacity', 'Opacity')}
                          </span>
                          <span className="text-[10px] font-mono font-bold text-[var(--text)]">
                            {`${presetOpacityPct}%`}
                          </span>
                        </div>
                        <div className="px-2 py-1 rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] flex flex-col">
                          <span className="text-[8px] font-black uppercase tracking-wider text-[var(--subtext)] opacity-60">
                            {t('forge_metric_blur', 'Blur')}
                          </span>
                          <span className="text-[10px] font-mono font-bold text-[var(--text)]">
                            {preset.values.glassBlur}
                          </span>
                        </div>
                        <div className="px-2 py-1 rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] flex flex-col">
                          <span className="text-[8px] font-black uppercase tracking-wider text-[var(--subtext)] opacity-60">
                            {t('forge_metric_glare', 'Glare')}
                          </span>
                          <span className="text-[10px] font-mono font-bold text-[var(--accent)]">
                            {`${toPercentInt(preset.values.glassSpecular, 32)}%`}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section 2: Curated Color Harmony Palettes */}
            <div className="flex flex-col gap-4 pt-6 border-t border-[color-mix(in_srgb,var(--text)_6%,transparent)]">
              <div className="flex items-center justify-between px-1">
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] font-black text-[var(--text)] uppercase tracking-[0.2em] flex items-center gap-2">
                    <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                      {t('icon_palette', 'palette')}
                    </span>
                    {t('forge_color_palettes_title', 'Curated Color Harmony Palettes')}
                  </label>
                  <p className="text-[10px] text-[var(--subtext)] opacity-75">
                    {t('forge_color_palettes_desc', 'Contrast-verified chromatic palettes with paired atmospheric gradients and wallpapers.')}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {CURATED_COLOR_PALETTES.map((palette) => {
                  const isActivePalette =
                    currentTheme.accent?.toLowerCase() === palette.colors.accent.toLowerCase() &&
                    currentTheme.bg?.toLowerCase() === palette.colors.bg.toLowerCase();
                  const isLightPalette = palette.id === 'alabaster' || palette.id === 'sims';

                  return (
                    <button
                      key={palette.id}
                      type="button"
                      onClick={() =>
                        handleUpdateTheme({
                          ...palette.colors,
                          glassOpacity: isLightPalette ? '0.20' : '0.14',
                          ...(palette.suggestedWallpaper ? { bgImage: palette.suggestedWallpaper } : {})
                        })
                      }
                      className={`glass-panel p-4 rounded-2xl border text-left transition-all flex flex-col justify-between gap-3.5 group relative overflow-hidden cursor-pointer ${
                        isActivePalette
                          ? 'border-[var(--accent)] shadow-[0_0_24px_rgba(var(--accent-rgb),0.22)]'
                          : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 w-full">
                        <span className="text-xs font-black text-[var(--text)] tracking-tight truncate">
                          {t(palette.labelKey, palette.fallbackLabel)}
                        </span>
                        {isActivePalette && (
                          <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
                            {t('icon_check_circle', 'check_circle')}
                          </span>
                        )}
                      </div>

                      {/* 5-Swatch Color Preview Bar */}
                      <div
                        className="w-full h-11 rounded-xl p-2 flex items-center justify-between border border-white/15 shadow-inner relative overflow-hidden"
                        style={{
                          backgroundColor: palette.colors.bg,
                          backgroundImage: palette.suggestedWallpaper ? `url("${palette.suggestedWallpaper}")` : undefined,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center'
                        }}
                      >
                        <div
                          className="absolute inset-0"
                          style={{
                            background: `linear-gradient(90deg, ${palette.colors.bg}ee 0%, ${palette.colors.panelTint}cc 65%, transparent 100%)`
                          }}
                        />
                        <div className="flex items-center gap-1.5 relative z-10">
                          {[
                            palette.colors.bg,
                            palette.colors.panelTint,
                            palette.colors.accent,
                            palette.colors.text,
                            palette.colors.subtext
                          ].map((swatch, idx) => (
                            <span
                              key={idx}
                              className="w-5 h-5 rounded-full border border-white/30 shadow-md"
                              style={{ backgroundColor: swatch }}
                            />
                          ))}
                        </div>
                        <span
                          className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-md border relative z-10"
                          style={{
                            backgroundColor: 'rgba(0,0,0,0.65)',
                            color: palette.colors.accent,
                            borderColor: `${palette.colors.accent}66`
                          }}
                        >
                          {palette.colors.accent}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: LIQUID GLASS OPTICS & CHROMATIC SWATCHES */}
        {activeTab === 'optics' && (
          <div className="flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Section 1: 6-Parameter Liquid Glass Optical Sliders */}
            <div className="flex flex-col gap-4 w-full">
              <div className="flex items-center justify-between px-1">
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] font-black text-[var(--text)] uppercase tracking-[0.2em] flex items-center gap-2">
                    <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                      {t('icon_tune', 'tune')}
                    </span>
                    {t('forge_section_optics', 'Liquid Glass Optics')}
                  </label>
                  <p className="text-[10px] text-[var(--subtext)] opacity-75">
                    {t('forge_section_optics_desc', 'Fine-tune surface translucency, refractive backdrop blur, rim lighting, and specular highlights.')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleUpdateTheme({
                      glassOpacity: '0.14',
                      glassBlur: '34px',
                      glassSaturation: '195%',
                      glassBorderOpacity: '0.26',
                      glassSpecular: '0.36',
                      glassShadow: '0.46'
                    })
                  }
                  className="glass-surface px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-all flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined !text-[13px]">
                    {t('icon_restart_alt', 'restart_alt')}
                  </span>
                  {t('forge_reset_glass', 'Reset Optics')}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 w-full">
                <UniversalCard
                  layout="horizontal"
                  icon="opacity"
                  title={t('forge_glass_opacity', 'Glass Opacity')}
                  subtitle={
                    <span className="text-[10px] text-[var(--accent)] font-bold font-mono">
                      {`${opacityPct}%`}
                    </span>
                  }
                  className="w-full h-full"
                >
                  <div className="w-full pt-2">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={opacityPct}
                      onChange={(e) => handleUpdateTheme({ glassOpacity: `${e.target.value}%` })}
                      className="w-full h-1.5 bg-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-lg appearance-none cursor-pointer accent-[var(--accent)]"
                    />
                  </div>
                </UniversalCard>

                <UniversalCard
                  layout="horizontal"
                  icon="blur_on"
                  title={t('forge_glass_blur', 'Refractive Blur')}
                  subtitle={
                    <span className="text-[10px] text-[var(--accent)] font-bold font-mono">
                      {`${blurPx}px`}
                    </span>
                  }
                  className="w-full h-full"
                >
                  <div className="w-full pt-2">
                    <input
                      type="range"
                      min={0}
                      max={64}
                      step={1}
                      value={blurPx}
                      onChange={(e) => handleUpdateTheme({ glassBlur: `${e.target.value}px` })}
                      className="w-full h-1.5 bg-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-lg appearance-none cursor-pointer accent-[var(--accent)]"
                    />
                  </div>
                </UniversalCard>

                <UniversalCard
                  layout="horizontal"
                  icon="invert_colors"
                  title={t('forge_glass_saturation', 'Refractive Saturation')}
                  subtitle={
                    <span className="text-[10px] text-[var(--accent)] font-bold font-mono">
                      {`${saturationPct}%`}
                    </span>
                  }
                  className="w-full h-full"
                >
                  <div className="w-full pt-2">
                    <input
                      type="range"
                      min={80}
                      max={240}
                      step={5}
                      value={saturationPct}
                      onChange={(e) => handleUpdateTheme({ glassSaturation: `${e.target.value}%` })}
                      className="w-full h-1.5 bg-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-lg appearance-none cursor-pointer accent-[var(--accent)]"
                    />
                  </div>
                </UniversalCard>

                <UniversalCard
                  layout="horizontal"
                  icon="border_style"
                  title={t('forge_glass_border', 'Rim Light Intensity')}
                  subtitle={
                    <span className="text-[10px] text-[var(--accent)] font-bold font-mono">
                      {`${borderPct}%`}
                    </span>
                  }
                  className="w-full h-full"
                >
                  <div className="w-full pt-2">
                    <input
                      type="range"
                      min={0}
                      max={60}
                      step={1}
                      value={borderPct}
                      onChange={(e) => handleUpdateTheme({ glassBorderOpacity: `${e.target.value}%` })}
                      className="w-full h-1.5 bg-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-lg appearance-none cursor-pointer accent-[var(--accent)]"
                    />
                  </div>
                </UniversalCard>

                <UniversalCard
                  layout="horizontal"
                  icon="flare"
                  title={t('forge_glass_specular', 'Specular Glare')}
                  subtitle={
                    <span className="text-[10px] text-[var(--accent)] font-bold font-mono">
                      {`${specularPct}%`}
                    </span>
                  }
                  className="w-full h-full"
                >
                  <div className="w-full pt-2">
                    <input
                      type="range"
                      min={0}
                      max={75}
                      step={1}
                      value={specularPct}
                      onChange={(e) => handleUpdateTheme({ glassSpecular: `${e.target.value}%` })}
                      className="w-full h-1.5 bg-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-lg appearance-none cursor-pointer accent-[var(--accent)]"
                    />
                  </div>
                </UniversalCard>

                <UniversalCard
                  layout="horizontal"
                  icon="layers"
                  title={t('forge_glass_shadow', 'Elevation Depth')}
                  subtitle={
                    <span className="text-[10px] text-[var(--accent)] font-bold font-mono">
                      {`${shadowPct}%`}
                    </span>
                  }
                  className="w-full h-full"
                >
                  <div className="w-full pt-2">
                    <input
                      type="range"
                      min={0}
                      max={85}
                      step={1}
                      value={shadowPct}
                      onChange={(e) => handleUpdateTheme({ glassShadow: `${e.target.value}%` })}
                      className="w-full h-1.5 bg-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-lg appearance-none cursor-pointer accent-[var(--accent)]"
                    />
                  </div>
                </UniversalCard>
              </div>
            </div>

            {/* Section 2: Full Chromatic Matrix (Including Panel Tint & Status Colors) */}
            <div className="flex flex-col gap-4 pt-6 border-t border-[color-mix(in_srgb,var(--text)_6%,transparent)]">
              <div className="flex items-center justify-between px-1">
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] font-black text-[var(--text)] uppercase tracking-[0.2em] flex items-center gap-2">
                    <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                      {t('icon_colorize', 'colorize')}
                    </span>
                    {t('forge_tab_colors', 'Chromatic Channels & Glass Tint')}
                  </label>
                  <p className="text-[10px] text-[var(--subtext)] opacity-75">
                    {t('forge_colors_sub', 'Click any channel to open the precision color wheel, RGB sliders, or semantic shade matrix.')}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    handleUpdateTheme({
                      success: '#10b981',
                      warning: '#f59e0b',
                      danger: '#f43f5e'
                    })
                  }
                  className="glass-surface px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-all flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined !text-[13px]">
                    {t('icon_restart_alt', 'restart_alt')}
                  </span>
                  {t('forge_btn_reset_status', 'Reset Status Colors')}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {allEditableColorKeys.map((key) => {
                  const swatchVal = currentTheme[key] || (key === 'panelTint' ? currentTheme.sidebar || '#0b1528' : '#000000');
                  return (
                    <div key={key} className="flex flex-col gap-2 group">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-70 uppercase tracking-widest ml-1.5 group-hover:text-[var(--text)] transition-colors">
                        {key === 'panelTint'
                          ? t('forge_color_panel_tint', 'Glass Surface Tint')
                          : t(`color_${key}`, key.toUpperCase())}
                      </label>
                      <div className="relative">
                        <div
                          className="flex items-center justify-between w-full glass-panel rounded-2xl px-4 py-3.5 text-[var(--text)] text-sm font-bold transition-all border border-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] shadow-inner cursor-pointer active:scale-95 group/swatch"
                          onPointerDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (activeColorPicker === key) {
                              setActiveColorPicker(null);
                            } else {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setPickerCoords({
                                top: Math.min(rect.bottom + 10, window.innerHeight - 460),
                                left: Math.min(rect.left, window.innerWidth - 440)
                              });
                              setActiveColorPicker(key);
                            }
                          }}
                        >
                          <div className="flex items-center gap-3.5 w-full min-w-0">
                            <div
                              className="w-8 h-8 rounded-xl border-2 border-white/20 shadow-md shrink-0 group-hover/swatch:scale-110 transition-transform"
                              style={{ backgroundColor: swatchVal }}
                            />
                            <code
                              className="text-xs font-mono font-bold tracking-widest opacity-80 group-hover/swatch:opacity-100 transition-opacity uppercase truncate"
                              style={{ color: currentTheme.text }}
                            >
                              {String(swatchVal).toUpperCase()}
                            </code>
                          </div>
                          <span className="material-symbols-outlined !text-[18px] opacity-40 group-hover/swatch:opacity-100 group-hover/swatch:text-[var(--accent)] transition-all">
                            {t('icon_colorize', 'colorize')}
                          </span>
                        </div>

                        {activeColorPicker === key &&
                          createPortal(
                            <>
                              <div
                                className="fixed inset-0"
                                style={{ zIndex: 999998 }}
                                onPointerDown={(e) => {
                                  e.stopPropagation();
                                  setActiveColorPicker(null);
                                }}
                              />
                              <div
                                className="fixed p-6 glass-panel backdrop-blur-3xl rounded-2xl border border-[color-mix(in_srgb,var(--text)_14%,transparent)] shadow-[0_24px_60px_rgba(0,0,0,0.65)] w-[25rem] animate-in fade-in zoom-in-95 duration-200"
                                style={{ zIndex: 999999, ...pickerCoords }}
                              >
                                <div className="flex items-center gap-3 mb-5">
                                  <label className="relative w-11 h-11 rounded-xl border border-white/25 overflow-hidden shrink-0 cursor-pointer shadow-inner">
                                    <input
                                      type="color"
                                      value={swatchVal.startsWith('#') && swatchVal.length === 7 ? swatchVal : '#38bdf8'}
                                      onChange={(e) => handleUpdateTheme({ [key]: e.target.value })}
                                      className="absolute -inset-2 w-16 h-16 cursor-pointer opacity-0"
                                    />
                                    <div className="w-full h-full" style={{ backgroundColor: swatchVal }} />
                                  </label>

                                  <input
                                    type="text"
                                    value={swatchVal}
                                    onChange={(e) => handleUpdateTheme({ [key]: e.target.value })}
                                    className="flex-1 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl px-4 py-3 text-xs font-mono font-bold text-[var(--text)] uppercase tracking-widest outline-none focus:theme-border-accent transition-colors shadow-inner"
                                  />

                                  <button
                                    type="button"
                                    onClick={() => toggleFavColor(swatchVal)}
                                    className="w-11 h-11 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] shrink-0 flex items-center justify-center cursor-pointer hover:scale-105 transition-transform"
                                    title={t('color_favs', 'Favorite Colors')}
                                  >
                                    <span
                                      className={`material-symbols-outlined !text-[18px] ${
                                        favColors.includes(swatchVal) ? 'text-amber-400' : 'text-[var(--subtext)] opacity-60'
                                      }`}
                                    >
                                      {favColors.includes(swatchVal) ? t('icon_star', 'star') : t('icon_star_border', 'star_border')}
                                    </span>
                                  </button>
                                </div>

                                <div className="grid grid-cols-8 gap-2.5 mb-5">
                                  {(SEMANTIC_SHADES[key] || PRESET_COLORS).map((color) => (
                                    <button
                                      key={color}
                                      type="button"
                                      onClick={() => handleUpdateTheme({ [key]: color })}
                                      className={`w-7 h-7 rounded-lg border hover:scale-115 transition-all shadow-sm ${
                                        swatchVal?.toLowerCase() === color.toLowerCase()
                                          ? 'theme-border-accent scale-110 shadow-[0_0_12px_var(--accent)]'
                                          : 'border-white/15 hover:border-white/40'
                                      }`}
                                      style={{ backgroundColor: color }}
                                    />
                                  ))}
                                </div>

                                {favColors.length > 0 && (
                                  <div className="mb-5 pt-4 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                                    <h4 className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] mb-2.5">
                                      {t('color_favs', 'Saved Swatches')}
                                    </h4>
                                    <div className="flex flex-wrap gap-2">
                                      {favColors.map((color) => (
                                        <button
                                          key={color}
                                          type="button"
                                          onClick={() => handleUpdateTheme({ [key]: color })}
                                          className={`w-6 h-6 rounded-lg border hover:scale-115 transition-all shadow-sm ${
                                            swatchVal?.toLowerCase() === color.toLowerCase()
                                              ? 'theme-border-accent scale-110'
                                              : 'border-white/15'
                                          }`}
                                          style={{ backgroundColor: color }}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                )}

                                <div className="flex flex-col gap-3 pt-4 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                                  <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-black w-4 text-center text-red-400">{t('color_r', 'R')}</span>
                                    <Slider
                                      min={0}
                                      max={255}
                                      value={HexToRGB(swatchVal).r}
                                      onChange={(e) =>
                                        handleUpdateTheme({
                                          [key]: RGBToHex(
                                            parseInt(e.target.value),
                                            HexToRGB(swatchVal).g,
                                            HexToRGB(swatchVal).b
                                          )
                                        })
                                      }
                                      className="flex-1"
                                      style={{ '--accent': '#ef4444' } as React.CSSProperties}
                                    />
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-black w-4 text-center text-emerald-400">{t('color_g', 'G')}</span>
                                    <Slider
                                      min={0}
                                      max={255}
                                      value={HexToRGB(swatchVal).g}
                                      onChange={(e) =>
                                        handleUpdateTheme({
                                          [key]: RGBToHex(
                                            HexToRGB(swatchVal).r,
                                            parseInt(e.target.value),
                                            HexToRGB(swatchVal).b
                                          )
                                        })
                                      }
                                      className="flex-1"
                                      style={{ '--accent': '#10b981' } as React.CSSProperties}
                                    />
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-black w-4 text-center text-sky-400">{t('color_b', 'B')}</span>
                                    <Slider
                                      min={0}
                                      max={255}
                                      value={HexToRGB(swatchVal).b}
                                      onChange={(e) =>
                                        handleUpdateTheme({
                                          [key]: RGBToHex(
                                            HexToRGB(swatchVal).r,
                                            HexToRGB(swatchVal).g,
                                            parseInt(e.target.value)
                                          )
                                        })
                                      }
                                      className="flex-1"
                                      style={{ '--accent': '#38bdf8' } as React.CSSProperties}
                                    />
                                  </div>
                                </div>
                              </div>
                            </>,
                            document.getElementById('sa-portals') || document.body
                          )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: TYPOGRAPHY & SURFACE GEOMETRY */}
        {activeTab === 'typography' && (
          <div className="flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Section 1: Surface Geometry */}
            <div className="flex flex-col gap-4 w-full">
              <label className="text-[10px] font-black text-[var(--text)] uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
                <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                  {t('icon_rounded_corner', 'rounded_corner')}
                </span>
                {t('forge_section_geometry', 'Surface Geometry & Density')}
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                <UniversalCard
                  layout="horizontal"
                  icon="rounded_corner"
                  title={t('forge_radius', 'Corner Radius')}
                  subtitle={
                    <span className="text-[10px] text-[var(--accent)] font-bold font-mono">
                      {currentTheme.radius || '1.25rem'}
                    </span>
                  }
                  className="w-full h-full"
                >
                  <div className="w-full pt-2">
                    <input
                      type="range"
                      min={0}
                      max={2.5}
                      step={0.125}
                      value={parseFloat(currentTheme.radius || '1.25') || 0}
                      onChange={(e) => handleUpdateTheme({ radius: `${e.target.value}rem` })}
                      className="w-full h-1.5 bg-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-lg appearance-none cursor-pointer accent-[var(--accent)]"
                    />
                  </div>
                </UniversalCard>

                <UniversalCard
                  layout="horizontal"
                  icon="width"
                  title={t('forge_sidebar_width', 'Sidebar Width')}
                  subtitle={
                    <span className="text-[10px] text-[var(--accent)] font-bold font-mono">
                      {currentTheme.sidebarWidth || '260px'}
                    </span>
                  }
                  className="w-full h-full"
                >
                  <div className="w-full pt-2">
                    <input
                      type="range"
                      min={200}
                      max={400}
                      step={4}
                      value={parseInt(currentTheme.sidebarWidth || '260', 10) || 260}
                      onChange={(e) => handleUpdateTheme({ sidebarWidth: `${e.target.value}px` })}
                      className="w-full h-1.5 bg-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-lg appearance-none cursor-pointer accent-[var(--accent)]"
                    />
                  </div>
                </UniversalCard>
              </div>
            </div>

            {/* Section 2: Font Family Specimen Grid */}
            <div className="flex flex-col gap-4 pt-6 border-t border-[color-mix(in_srgb,var(--text)_6%,transparent)] w-full">
              <label className="text-[10px] font-black text-[var(--text)] uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
                <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                  {t('icon_font_download', 'font_download')}
                </span>
                {t('forge_font_family', 'Primary Typeface')}
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
                {[
                  'Inter, sans-serif',
                  "'Space Mono', monospace",
                  "'Orbitron', sans-serif",
                  "'Fira Code', monospace",
                  "'Rajdhani', sans-serif",
                  "'Share Tech Mono', monospace",
                  "'VT323', monospace",
                  'Courier New, monospace'
                ].map((font) => {
                  const isActive =
                    currentTheme.fontFamily === font || (!currentTheme.fontFamily && font.includes('Inter'));
                  const fontName = font.split(',')[0].replace(/'/g, '');
                  return (
                    <button
                      key={font}
                      type="button"
                      onClick={() => handleUpdateTheme({ fontFamily: font })}
                      className={`glass-panel w-full flex flex-col items-center justify-center p-4 rounded-2xl gap-2.5 transition-all group relative overflow-hidden ${
                        isActive
                          ? 'border-[var(--accent)] shadow-[0_0_20px_rgba(var(--accent-rgb),0.15)]'
                          : 'hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] border-[color-mix(in_srgb,var(--text)_8%,transparent)]'
                      }`}
                    >
                      <span
                        className={`text-3xl transition-colors ${
                          isActive
                            ? 'theme-text-accent drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.4)]'
                            : 'text-[var(--text)] opacity-65 group-hover:opacity-100'
                        }`}
                        style={{ fontFamily: font }}
                      >
                        Ag
                      </span>
                      <span
                        className={`text-[9px] font-black tracking-widest uppercase transition-colors ${
                          isActive ? 'theme-text-accent' : 'text-[var(--subtext)] group-hover:text-[var(--text)]'
                        }`}
                      >
                        {fontName}
                      </span>
                      {isActive && (
                        <span className="material-symbols-outlined absolute top-2.5 right-2.5 !text-[14px] theme-text-accent">
                          {t('icon_check_circle', 'check_circle')}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section 3: Typographic Scale Sliders */}
            <div className="flex flex-col gap-4 pt-6 border-t border-[color-mix(in_srgb,var(--text)_6%,transparent)] w-full">
              <label className="text-[10px] font-black text-[var(--text)] uppercase tracking-[0.2em] ml-1">
                {t('forge_tab_fonts', 'Typographic Scale Hierarchy')}
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                {[
                  { key: 'fontSizeHeader', label: t('forge_font_header', 'Header Size'), def: '1.875', max: 3.5, icon: 'format_h1' },
                  { key: 'fontSizeSubheader', label: t('forge_font_subheader', 'Subheader Size'), def: '1.5', max: 2.75, icon: 'format_h2' },
                  { key: 'fontSizeTitle', label: t('forge_font_title', 'Card Title Size'), def: '1.25', max: 2.25, icon: 'title' },
                  { key: 'fontSizeSubtitle', label: t('forge_font_subtitle', 'Subtitle Size'), def: '1.125', max: 2, icon: 'subtitles' },
                  { key: 'fontSizeText', label: t('forge_font_text', 'Body Copy Size'), def: '1', max: 1.75, icon: 'notes' },
                  { key: 'fontSizeSubtext', label: t('forge_font_subtext', 'Caption / Metadata Size'), def: '0.75', max: 1.25, icon: 'short_text' },
                  { key: 'fontSizeSidebar', label: t('forge_font_sidebar', 'Navigation Label Size'), def: '10', max: 18, isPx: true, icon: 'view_sidebar' }
                ].map((cfg) => (
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
                    className="w-full h-full"
                  >
                    <div className="w-full pt-2">
                      <input
                        type="range"
                        min={cfg.isPx ? 8 : 0.625}
                        max={cfg.max}
                        step={cfg.isPx ? 1 : 0.0625}
                        value={parseFloat(currentTheme[cfg.key] || cfg.def) || parseFloat(cfg.def)}
                        onChange={(e) =>
                          handleUpdateTheme({ [cfg.key]: cfg.isPx ? `${e.target.value}px` : `${e.target.value}rem` })
                        }
                        className="w-full h-1.5 bg-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-lg appearance-none cursor-pointer accent-[var(--accent)]"
                      />
                    </div>
                  </UniversalCard>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: ATMOSPHERE (BUILT-IN WALLPAPERS, CUSTOM WALLPAPER & PREVIEW UPLOAD, GRADIENT FORGE) */}
        {activeTab === 'backgrounds' && (
          <div className="flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Section 1: Built-In Sanctuary Refractive Wallpapers Gallery */}
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-0.5 px-1">
                <label className="text-[10px] font-black text-[var(--text)] uppercase tracking-[0.2em] flex items-center gap-2">
                  <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                    {t('icon_wallpaper', 'wallpaper')}
                  </span>
                  {t('forge_builtin_wallpapers_title', 'Built-In Sanctuary Wallpapers')}
                </label>
                <p className="text-[10px] text-[var(--subtext)] opacity-75">
                  {t('forge_builtin_wallpapers_desc', 'Select an official high-refraction environment backdrop or switch to pure atmospheric gradients.')}
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
                {BUILTIN_WALLPAPERS.map((wp) => {
                  const isSelected = (currentTheme.bgImage || '') === wp.path;
                  return (
                    <button
                      key={wp.id}
                      type="button"
                      onClick={() => handleUpdateTheme({ bgImage: wp.path || null })}
                      className={`group relative h-24 rounded-2xl overflow-hidden border transition-all flex flex-col justify-end p-3 text-left ${
                        isSelected
                          ? 'border-[var(--accent)] shadow-[0_0_24px_rgba(var(--accent-rgb),0.3)] scale-[1.01]'
                          : 'border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)]'
                      }`}
                    >
                      {wp.path ? (
                        <img
                          src={wp.path}
                          alt={t(wp.labelKey, wp.fallbackLabel)}
                          className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                        />
                      ) : (
                        <div
                          className="absolute inset-0 w-full h-full"
                          style={{ background: currentTheme.bgGradient || currentTheme.bg || '#050914' }}
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                      <div className="relative z-10 flex items-center justify-between gap-2 w-full">
                        <span className="text-[10px] font-black uppercase tracking-wider text-white truncate">
                          {t(wp.labelKey, wp.fallbackLabel)}
                        </span>
                        {isSelected && (
                          <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
                            {t('icon_check_circle', 'check_circle')}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section 2: Custom Wallpaper & Nexus Preview Banner Uploads */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 pt-6 border-t border-[color-mix(in_srgb,var(--text)_6%,transparent)]">
              {/* Custom Desktop Wallpaper Upload */}
              <div className="glass-panel p-5 rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)]">
                      {t('forge_wallpaper_engine', 'Custom Desktop Wallpaper')}
                    </span>
                    <span className="text-[10px] text-[var(--subtext)] opacity-75">
                      {t('forge_bg_upload_desc', 'Auto-compressed to 1080p WebP for real-time glass refraction.')}
                    </span>
                  </div>
                  {currentTheme.bgImage && (
                    <button
                      type="button"
                      onClick={() => handleUpdateTheme({ bgImage: null })}
                      className="px-2.5 py-1 rounded-lg bg-red-500/15 border border-red-500/40 text-red-400 text-[9px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all"
                    >
                      {t('forge_bg_remove', 'Clear')}
                    </button>
                  )}
                </div>

                <label className="relative h-32 rounded-xl border border-dashed border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:border-[var(--accent)] transition-all flex flex-col items-center justify-center gap-2 cursor-pointer overflow-hidden group">
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                  {currentTheme.bgImage ? (
                    <>
                      <img src={currentTheme.bgImage} alt="Wallpaper" className="absolute inset-0 w-full h-full object-cover opacity-55 group-hover:opacity-75 transition-opacity" />
                      <div className="relative z-10 px-3 py-1.5 rounded-xl bg-black/70 border border-white/20 flex items-center gap-2">
                        <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                          {t('icon_upload', 'upload')}
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-white">
                          {t('forge_bg_upload', 'Replace Wallpaper')}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined !text-[28px] text-[var(--accent)]">
                        {t('icon_upload', 'upload')}
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)]">
                        {t('forge_bg_upload', 'Upload Custom Wallpaper')}
                      </span>
                    </>
                  )}
                </label>
              </div>

              {/* Custom Nexus Card Banner Upload (Optional Override for Dynamic Preview Card) */}
              <div className="glass-panel p-5 rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)]">
                      {t('forge_preview_banner_title', 'Custom Card Banner (Optional)')}
                    </span>
                    <span className="text-[10px] text-[var(--subtext)] opacity-75">
                      {t('forge_preview_banner_desc', 'If omitted, Sanctuary generates a live Dynamic OS Preview Card automatically.')}
                    </span>
                  </div>
                  {currentTheme.previewImage && (
                    <button
                      type="button"
                      onClick={() => handleUpdateTheme({ previewImage: undefined })}
                      className="px-2.5 py-1 rounded-lg bg-red-500/15 border border-red-500/40 text-red-400 text-[9px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all"
                    >
                      {t('forge_bg_remove', 'Clear')}
                    </button>
                  )}
                </div>

                <label className="relative h-32 rounded-xl border border-dashed border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:border-[var(--accent)] transition-all flex flex-col items-center justify-center gap-2 cursor-pointer overflow-hidden group">
                  <input type="file" accept="image/*" onChange={handlePreviewImageUpload} className="hidden" />
                  {currentTheme.previewImage ? (
                    <>
                      <img src={currentTheme.previewImage} alt="Banner" className="absolute inset-0 w-full h-full object-cover opacity-65 group-hover:opacity-85 transition-opacity" />
                      <div className="relative z-10 px-3 py-1.5 rounded-xl bg-black/70 border border-white/20 flex items-center gap-2">
                        <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                          {t('icon_image', 'image')}
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-white">
                          {t('forge_preview_banner_replace', 'Replace Custom Banner')}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined !text-[28px] text-[var(--accent)]">
                        {t('icon_auto_awesome_mosaic', 'auto_awesome_mosaic')}
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)]">
                        {t('forge_preview_banner_auto', 'Using Default Dynamic OS Preview Card (Click to Override)')}
                      </span>
                    </>
                  )}
                </label>
              </div>
            </div>

            {/* Section 3: Atmospheric Gradient Forge & Presets */}
            <div className="flex flex-col gap-5 pt-6 border-t border-[color-mix(in_srgb,var(--text)_6%,transparent)]">
              <label className="text-[10px] font-black text-[var(--text)] uppercase tracking-[0.2em] ml-1">
                {t('forge_bg_selector', 'Atmospheric Underlay Gradients')}
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                {[
                  { id: 'none', label: t('forge_bg_solid', 'Solid Canvas') },
                  { id: 'linear-gradient(to bottom right, #171520, #241b2f)', label: t('forge_bg_miami', 'Nocturne') },
                  { id: 'radial-gradient(circle at center, #1e1b4b, #000000)', label: t('forge_bg_abyssal', 'Abyssal') },
                  { id: 'linear-gradient(135deg, rgba(2,0,36,1) 0%, rgba(9,9,121,1) 35%, rgba(0,212,255,1) 100%)', label: t('forge_bg_ocean', 'Deep Azure') },
                  { id: 'radial-gradient(circle at top right, #3f3f46, #000000)', label: t('forge_bg_slate', 'Monolith') },
                  { id: 'radial-gradient(circle at 80% -15%, rgba(56, 189, 248, 0.38) 0%, transparent 55%), radial-gradient(circle at 12% 105%, rgba(37, 99, 235, 0.28) 0%, transparent 60%), #050914', label: t('forge_bg_architect', 'Sanctuary') },
                  { id: 'radial-gradient(circle at 18% -15%, rgba(16, 185, 129, 0.38) 0%, transparent 55%), radial-gradient(circle at 85% 110%, rgba(59, 130, 246, 0.30) 0%, transparent 65%), #061318', label: t('theme_name_sims4', 'Plumbob') }
                ].map((preset) => {
                  const isGradActive =
                    currentTheme.bgGradient === preset.id || (!currentTheme.bgGradient && preset.id === 'none');
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleUpdateTheme({ bgGradient: preset.id })}
                      className={`h-16 rounded-xl border transition-all flex items-center justify-center p-2 relative overflow-hidden group shadow-md ${
                        isGradActive
                          ? 'border-[var(--accent)] shadow-[0_0_18px_rgba(var(--accent-rgb),0.35)]'
                          : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)]'
                      }`}
                    >
                      <div
                        className="absolute inset-0 opacity-75 group-hover:opacity-100 transition-opacity"
                        style={{ background: preset.id === 'none' ? currentTheme.bg : preset.id }}
                      />
                      <span className="relative z-10 text-[9px] font-black uppercase tracking-widest text-white drop-shadow-md text-center">
                        {preset.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Custom Gradient Builder */}
              <UniversalCard layout="vertical" title={t('forge_background_builder', 'Custom Gradient Synthesizer')}>
                <div
                  className="w-full h-28 rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] shadow-inner mt-3 relative overflow-hidden"
                  style={{
                    background:
                      bgBuilderType === 'solid'
                        ? bgBuilderColor1
                        : bgBuilderType === 'linear'
                        ? `linear-gradient(${bgBuilderAngle}deg, ${bgBuilderColor1}, ${bgBuilderColor2})`
                        : `radial-gradient(circle, ${bgBuilderColor1}, ${bgBuilderColor2})`
                  }}
                />

                <div className="flex flex-col lg:flex-row gap-6 pt-5 w-full border-t border-[color-mix(in_srgb,var(--text)_6%,transparent)] mt-5 items-start lg:items-center">
                  <div className="flex items-center gap-2">
                    {(['solid', 'linear', 'radial'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => {
                          setBgBuilderType(mode);
                          applyBgBuilder(mode, bgBuilderAngle, bgBuilderColor1, bgBuilderColor2);
                        }}
                        className={`px-3.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${
                          bgBuilderType === mode
                            ? 'bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-[var(--accent)] border-[var(--accent)]'
                            : 'glass-surface text-[var(--subtext)] border-transparent hover:text-[var(--text)]'
                        }`}
                      >
                        {t(`forge_topology_${mode}`, mode.toUpperCase())}
                      </button>
                    ))}
                  </div>

                  {bgBuilderType === 'linear' && (
                    <div className="flex-1 flex items-center gap-3 w-full">
                      <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] shrink-0">
                        {t('forge_trajectory', 'Angle')}
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={360}
                        step={1}
                        value={bgBuilderAngle}
                        onChange={(e) => {
                          const ang = parseInt(e.target.value, 10);
                          setBgBuilderAngle(ang);
                          applyBgBuilder(bgBuilderType, ang, bgBuilderColor1, bgBuilderColor2);
                        }}
                        className="flex-1 h-1.5 bg-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-lg appearance-none cursor-pointer accent-[var(--accent)]"
                      />
                      <code className="text-[10px] font-mono font-bold text-[var(--accent)] w-10 text-right">
                        {bgBuilderAngle}°
                      </code>
                    </div>
                  )}

                  <div className="flex items-center gap-3 shrink-0">
                    <label className="relative w-9 h-9 rounded-xl border border-white/25 overflow-hidden cursor-pointer shadow-md">
                      <input
                        type="color"
                        value={bgBuilderColor1}
                        onChange={(e) => {
                          setBgBuilderColor1(e.target.value);
                          applyBgBuilder(bgBuilderType, bgBuilderAngle, e.target.value, bgBuilderColor2);
                        }}
                        className="absolute -inset-2 w-14 h-14 opacity-0 cursor-pointer"
                      />
                      <div className="w-full h-full" style={{ backgroundColor: bgBuilderColor1 }} />
                    </label>
                    {bgBuilderType !== 'solid' && (
                      <>
                        <span className="material-symbols-outlined !text-[15px] text-[var(--subtext)] opacity-60">
                          {t('icon_arrow_forward', 'arrow_forward')}
                        </span>
                        <label className="relative w-9 h-9 rounded-xl border border-white/25 overflow-hidden cursor-pointer shadow-md">
                          <input
                            type="color"
                            value={bgBuilderColor2}
                            onChange={(e) => {
                              setBgBuilderColor2(e.target.value);
                              applyBgBuilder(bgBuilderType, bgBuilderAngle, bgBuilderColor1, e.target.value);
                            }}
                            className="absolute -inset-2 w-14 h-14 opacity-0 cursor-pointer"
                          />
                          <div className="w-full h-full" style={{ backgroundColor: bgBuilderColor2 }} />
                        </label>
                      </>
                    )}
                  </div>
                </div>
              </UniversalCard>

              {/* Ambient Grain & Ambient Orb Toggles */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full mt-2">
                <UniversalCard
                  layout="horizontal"
                  icon="grain"
                  title={t('forge_ambient_grain', 'Micro-Silica Film Grain')}
                  actions={
                    <label className="flex items-center gap-2 cursor-pointer mt-1">
                      <div
                        className={`w-8 h-4 rounded-full p-0.5 transition-colors ${
                          currentTheme.ambientNoise !== false
                            ? 'bg-[var(--accent)]'
                            : 'bg-[color-mix(in_srgb,var(--text)_20%,transparent)]'
                        }`}
                      >
                        <div
                          className={`w-3 h-3 rounded-full bg-white transition-transform shadow-sm ${
                            currentTheme.ambientNoise !== false ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </div>
                      <input
                        type="checkbox"
                        className="hidden"
                        checked={currentTheme.ambientNoise !== false}
                        onChange={(e) => handleUpdateTheme({ ambientNoise: e.target.checked })}
                      />
                    </label>
                  }
                  className="w-full"
                >
                  <p className="text-[10px] text-[var(--subtext)] leading-relaxed mt-1">
                    {t('forge_ambient_grain_desc', 'Adds subtle tactile film grain across frosted glass surfaces.')}
                  </p>
                </UniversalCard>

                <UniversalCard
                  layout="horizontal"
                  icon="blur_on"
                  title={t('forge_ambient_orb', 'Ambient Backlight Orbs')}
                  actions={
                    <label className="flex items-center gap-2 cursor-pointer mt-1">
                      <div
                        className={`w-8 h-4 rounded-full p-0.5 transition-colors ${
                          currentTheme.ambientOrb !== false
                            ? 'bg-[var(--accent)]'
                            : 'bg-[color-mix(in_srgb,var(--text)_20%,transparent)]'
                        }`}
                      >
                        <div
                          className={`w-3 h-3 rounded-full bg-white transition-transform shadow-sm ${
                            currentTheme.ambientOrb !== false ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </div>
                      <input
                        type="checkbox"
                        className="hidden"
                        checked={currentTheme.ambientOrb !== false}
                        onChange={(e) => handleUpdateTheme({ ambientOrb: e.target.checked })}
                      />
                    </label>
                  }
                  className="w-full"
                >
                  <p className="text-[10px] text-[var(--subtext)] leading-relaxed mt-1">
                    {t('forge_ambient_orb_desc', 'Projects soft chromatic light blooms behind glass panels.')}
                  </p>
                </UniversalCard>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
