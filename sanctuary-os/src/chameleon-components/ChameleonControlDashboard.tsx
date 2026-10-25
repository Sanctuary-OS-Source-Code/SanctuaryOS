import React, { useEffect, useRef, useState } from 'react';
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
  autoHarmonizeThemeColors,
} from './ChameleonShared';
import { UniversalCard } from '../components/universal/UniversalCard';
import { Slider } from '../components/universal/Slider';
import { DashboardStatTile } from '../hub-components/SharedCommandScreenLayout';
import { UniversalGroup, VAULT_CHIP_CLASS } from '../shared';
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
  renameTheme,
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

  // Drive the live WebGL2 SDF Liquid Glass Engine in real time even when editing cloud/sandbox theme objects
  const prevTexKeyRef = useRef<string>('');
  useEffect(() => {
    (window as any).__sanctuaryPreviewTheme = currentTheme;
    const texKey = `${currentTheme?.bgImage || ''}::${currentTheme?.bg || ''}::${currentTheme?.glassBlur || ''}::${currentTheme?.glassSaturation || ''}::${currentTheme?.ambientOrb ?? true}`;
    if (prevTexKeyRef.current && prevTexKeyRef.current !== texKey) {
      (window as any).__sanctuaryRebuildWebGLGlass?.();
    } else {
      (window as any).__sanctuaryRenderWebGLGlass?.(true);
    }
    prevTexKeyRef.current = texKey;
  }, [currentTheme]);

  useEffect(() => {
    return () => {
      (window as any).__sanctuaryPreviewTheme = null;
      (window as any).__sanctuaryRebuildWebGLGlass?.();
      (window as any).__sanctuaryRenderWebGLGlass?.(true);
    };
  }, []);

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
      pushStatus?.(t('forge_status_copied_json', '{Chameleon} JSON copied to clipboard.'));
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
    return n <= 2.5 && n >= 0 && !str.includes('%') && str.includes('.')
      ? Math.round(n * 100)
      : Math.round(n);
  };

  const opacityPct = toPercentInt(currentTheme.glassOpacity, 10);
  const blurPx = parseInt(String(currentTheme.glassBlur ?? '36'), 10);
  const resolvedBlurPx = isNaN(blurPx) ? 36 : blurPx;
  const saturationPct = parseInt(String(currentTheme.glassSaturation || '185'), 10) || 185;
  const refractionPct = toPercentInt(currentTheme.glassRefraction, 100);
  const bezelPct = toPercentInt(currentTheme.glassBezel, 100);
  const borderPct = toPercentInt(currentTheme.glassBorderOpacity, 14);
  const specularPct = toPercentInt(currentTheme.glassSpecular, 24);
  const shadowPct = toPercentInt(currentTheme.glassShadow, 42);

  return (
    <div
      className="flex-1 flex flex-col h-full border-r border-[color-mix(in_srgb,var(--text)_8%,transparent)] overflow-hidden"
      style={{ '--accent': currentTheme.accent || '#38bdf8' } as React.CSSProperties}
    >
      {/* Compact Theme Matrix Header & 4-Tile Navigation */}
      <div className="flex flex-col gap-3.5 px-6 pt-4 pb-4 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-transparent shrink-0">
        <div className="glass-panel p-3.5 rounded-2xl flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] flex items-center justify-center shrink-0 text-[var(--accent)]">
              <span className="material-symbols-outlined !text-[20px]">
                {t('icon_palette', 'palette')}
              </span>
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <input
                  type="text"
                  value={currentTheme.name || ''}
                  onChange={(e) => canRename && renameTheme && editingThemeId && renameTheme(editingThemeId, e.target.value)}
                  className="w-full max-w-[280px] bg-transparent border-b border-transparent hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] focus:theme-border-accent outline-none text-base font-black text-[var(--text)] tracking-tight transition-colors py-0.5 truncate"
                  placeholder={t('forge_theme_name_placeholder', 'Enter Theme Name...')}
                  disabled={!canRename}
                />
                {canRename && (
                  <span className="material-symbols-outlined !text-[13px] text-[var(--subtext)] opacity-50 shrink-0">
                    {t('icon_edit', 'edit')}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-[var(--subtext)] opacity-80 truncate">
                {t('ui_use_dashboard', 'Customize Liquid Glass optics, chromatic palettes, typography, and refractive wallpapers.')}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <span className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t('icon_deployed_code', 'deployed_code')}
              </span>
              <span>{t('forge_engine_badge', 'WebGL2 SDF Engine')}</span>
            </span>
            <span className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t('icon_opacity', 'opacity')}
              </span>
              <span className="font-mono">{`${opacityPct}%`}</span>
            </span>
            <span className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t('icon_blur_on', 'blur_on')}
              </span>
              <span className="font-mono">{`${resolvedBlurPx}px`}</span>
            </span>
            <span className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t('icon_lens_blur', 'lens_blur')}
              </span>
              <span className="font-mono">{`${refractionPct}%`}</span>
            </span>
          </div>
        </div>

        {/* 4-Tile Filter Grid */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 w-full">
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
            label={t('forge_tab_fonts', 'Typography')}
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
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-6 pb-28">
        {/* TAB 1: QUICK PRESETS (1-CLICK GLASS MATERIALS & CURATED COLOR PALETTES) */}
        {activeTab === 'presets' && (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <UniversalGroup
              icon={t('icon_blur_on', 'blur_on')}
              title={t('forge_glass_presets_title', '1-Click Liquid Glass Materials')}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
                {GLASS_MATERIAL_PRESETS.map((preset) => {
                  const presetOpacityPct = toPercentInt(preset.values.glassOpacity, 10);
                  const presetSpecPct = toPercentInt(preset.values.glassSpecular, 24);
                  const presetBlurInt = parseInt(preset.values.glassBlur, 10) || 36;
                  const presetRefractPct = toPercentInt(preset.values.glassRefraction, 100);
                  const isCurrentMaterial =
                    Math.abs(opacityPct - presetOpacityPct) <= 2 &&
                    Math.abs(resolvedBlurPx - presetBlurInt) <= 3 &&
                    Math.abs(refractionPct - presetRefractPct) <= 10;

                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleUpdateTheme(preset.values)}
                      className={`glass-panel p-4 rounded-2xl border text-left transition-all flex flex-col justify-between gap-3 group relative overflow-hidden cursor-pointer ${
                        isCurrentMaterial
                          ? '!border-[color-mix(in_srgb,var(--accent)_55%,rgba(255,255,255,0.35))] z-10'
                          : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)]'
                      }`}
                    >
                      {isCurrentMaterial && (
                        <div
                          className="absolute inset-0 rounded-[inherit] pointer-events-none"
                          style={{
                            background:
                              'linear-gradient(135deg, color-mix(in srgb, var(--accent) 16%, rgba(255, 255, 255, 0.06)) 0%, color-mix(in srgb, var(--accent) 4%, transparent) 55%, transparent 100%)',
                          }}
                        />
                      )}
                      <div className="relative z-10 flex items-start justify-between gap-2.5 w-full">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-9 h-9 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">
                              {t(preset.iconKey, preset.fallbackIcon)}
                            </span>
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className={`text-xs font-black tracking-tight truncate ${isCurrentMaterial ? 'text-[var(--accent)]' : 'text-[var(--text)]'}`}>
                              {t(preset.labelKey, preset.fallbackLabel)}
                            </span>
                            <span className="text-[10px] text-[var(--subtext)] opacity-80 line-clamp-1">
                              {t(preset.descKey, preset.fallbackDesc)}
                            </span>
                          </div>
                        </div>
                        {isCurrentMaterial && (
                          <div className="w-7 h-7 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                            <span className="material-symbols-outlined !text-[14px]">
                              {t('icon_check_circle', 'check_circle')}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* 2x2 Optical Material Telemetry Grid (Refracted via WebGL2 SDF Engine) */}
                      <div className="grid grid-cols-2 gap-1.5 w-full">
                        <div className="px-2.5 py-1.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-between gap-1.5">
                          <span className="text-[8.5px] font-black uppercase tracking-wider text-[var(--subtext)] opacity-75">
                            {t('forge_metric_opacity', 'Opacity')}
                          </span>
                          <span className="text-[9.5px] font-mono font-black text-[var(--text)]">
                            {`${presetOpacityPct}%`}
                          </span>
                        </div>
                        <div className="px-2.5 py-1.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-between gap-1.5">
                          <span className="text-[8.5px] font-black uppercase tracking-wider text-[var(--subtext)] opacity-75">
                            {t('forge_metric_blur', 'Blur')}
                          </span>
                          <span className="text-[9.5px] font-mono font-black text-[var(--text)]">
                            {preset.values.glassBlur}
                          </span>
                        </div>
                        <div className="px-2.5 py-1.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-between gap-1.5">
                          <span className="text-[8.5px] font-black uppercase tracking-wider text-[var(--subtext)] opacity-75">
                            {t('forge_metric_refract', 'Refract')}
                          </span>
                          <span className="text-[9.5px] font-mono font-black text-[var(--accent)]">
                            {preset.values.glassRefraction}
                          </span>
                        </div>
                        <div className="px-2.5 py-1.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-between gap-1.5">
                          <span className="text-[8.5px] font-black uppercase tracking-wider text-[var(--subtext)] opacity-75">
                            {t('forge_metric_glare', 'Glare')}
                          </span>
                          <span className="text-[9.5px] font-mono font-black text-[var(--accent)]">
                            {`${presetSpecPct}%`}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </UniversalGroup>

            <UniversalGroup
              icon={t('icon_palette', 'palette')}
              title={t('forge_color_palettes_title', 'Curated Color Harmony Palettes')}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5">
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
                          glassOpacity: isLightPalette ? '0.20' : '0.10',
                          ...(palette.suggestedWallpaper ? { bgImage: palette.suggestedWallpaper } : {}),
                        })
                      }
                      className={`glass-panel p-4 rounded-2xl border text-left transition-all flex flex-col justify-between gap-3 group relative overflow-hidden cursor-pointer ${
                        isActivePalette
                          ? '!border-[color-mix(in_srgb,var(--accent)_55%,rgba(255,255,255,0.35))] z-10'
                          : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)]'
                      }`}
                    >
                      {isActivePalette && (
                        <div
                          className="absolute inset-0 rounded-[inherit] pointer-events-none"
                          style={{
                            background:
                              'linear-gradient(135deg, color-mix(in srgb, var(--accent) 16%, rgba(255, 255, 255, 0.06)) 0%, color-mix(in srgb, var(--accent) 4%, transparent) 55%, transparent 100%)',
                          }}
                        />
                      )}
                      <div className="relative z-10 flex items-center justify-between gap-2 w-full">
                        <span className={`text-xs font-black tracking-tight truncate ${isActivePalette ? 'text-[var(--accent)]' : 'text-[var(--text)]'}`}>
                          {t(palette.labelKey, palette.fallbackLabel)}
                        </span>
                        {isActivePalette && (
                          <div className="w-6 h-6 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                            <span className="material-symbols-outlined !text-[13px]">
                              {t('icon_check_circle', 'check_circle')}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* 5-Swatch Color Preview Bar */}
                      <div
                        className="w-full h-11 rounded-xl p-2 flex items-center justify-between border border-white/15 shadow-inner relative overflow-hidden"
                        style={{
                          background: `linear-gradient(135deg, ${palette.colors.bg} 0%, ${palette.colors.panelTint} 62%, ${palette.colors.accent}40 100%)`,
                        }}
                      >
                        <div className="flex items-center gap-1.5 relative z-10">
                          {[
                            palette.colors.bg,
                            palette.colors.panelTint,
                            palette.colors.accent,
                            palette.colors.text,
                            palette.colors.subtext,
                          ].map((swatch, idx) => (
                            <span
                              key={idx}
                              className="w-4 h-4 rounded-full border border-white/30 shadow-md"
                              style={{ backgroundColor: swatch }}
                            />
                          ))}
                        </div>
                        <span
                          className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-md border relative z-10"
                          style={{
                            backgroundColor: 'rgba(0,0,0,0.65)',
                            color: palette.colors.accent,
                            borderColor: `${palette.colors.accent}66`,
                          }}
                        >
                          {palette.colors.accent}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </UniversalGroup>
          </div>
        )}

        {/* TAB 2: WEBGL2 SDF LIQUID GLASS OPTICS & CHROMATIC SWATCHES */}
        {activeTab === 'optics' && (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <UniversalGroup
              icon={t('icon_tune', 'tune')}
              title={t('forge_section_optics', 'Liquid Glass Optics')}
              actions={
                <button
                  type="button"
                  onClick={() =>
                    handleUpdateTheme({
                      glassOpacity: '0.10',
                      glassBlur: '36px',
                      glassSaturation: '185%',
                      glassRefraction: '100%',
                      glassBezel: '100%',
                      glassBorderOpacity: '0.14',
                      glassSpecular: '0.24',
                      glassShadow: '0.42',
                    })
                  }
                  className="glass-surface px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[13px]">
                    {t('icon_restart_alt', 'restart_alt')}
                  </span>
                  {t('forge_reset_glass', 'Reset Optics')}
                </button>
              }
            >
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5 w-full">
                {[
                  {
                    key: 'glassOpacity',
                    icon: t('icon_opacity', 'opacity'),
                    title: t('forge_glass_opacity', 'Glass Opacity'),
                    desc: t('forge_glass_opacity_desc', 'Smoked crystal readability cushion'),
                    display: `${opacityPct}%`,
                    min: 4,
                    max: 65,
                    step: 1,
                    value: opacityPct,
                    onChange: (v: number) => handleUpdateTheme({ glassOpacity: (v / 100).toFixed(2) }),
                  },
                  {
                    key: 'glassBlur',
                    icon: t('icon_blur_on', 'blur_on'),
                    title: t('forge_glass_blur', 'Refractive Blur'),
                    desc: t('forge_glass_blur_desc', 'Gaussian frosted core diffusion'),
                    display: `${resolvedBlurPx}px`,
                    min: 0,
                    max: 64,
                    step: 1,
                    value: resolvedBlurPx,
                    onChange: (v: number) => handleUpdateTheme({ glassBlur: `${v}px` }),
                  },
                  {
                    key: 'glassSaturation',
                    icon: t('icon_invert_colors', 'invert_colors'),
                    title: t('forge_glass_saturation', 'Refractive Saturation'),
                    desc: t('forge_glass_saturation_desc', 'Refracted backdrop chromatic boost'),
                    display: `${saturationPct}%`,
                    min: 80,
                    max: 240,
                    step: 5,
                    value: saturationPct,
                    onChange: (v: number) => handleUpdateTheme({ glassSaturation: `${v}%` }),
                  },
                  {
                    key: 'glassRefraction',
                    icon: t('icon_lens_blur', 'lens_blur'),
                    title: t('forge_glass_refraction', "Snell's Refraction"),
                    desc: t('forge_glass_refraction_desc', '3D meniscus lens bending & convex dome magnification'),
                    display: `${refractionPct}%`,
                    min: 0,
                    max: 200,
                    step: 5,
                    value: refractionPct,
                    onChange: (v: number) => handleUpdateTheme({ glassRefraction: `${v}%` }),
                  },
                  {
                    key: 'glassBezel',
                    icon: t('icon_filter_Center_focus', 'filter_center_focus'),
                    title: t('forge_glass_bezel', 'Meniscus Lip Width'),
                    desc: t('forge_glass_bezel_desc', '3D curved perimeter lip width & clear refractive rim zone'),
                    display: `${bezelPct}%`,
                    min: 40,
                    max: 180,
                    step: 5,
                    value: bezelPct,
                    onChange: (v: number) => handleUpdateTheme({ glassBezel: `${v}%` }),
                  },
                  {
                    key: 'glassSpecular',
                    icon: t('icon_flare', 'flare'),
                    title: t('forge_glass_specular', 'Specular Glare'),
                    desc: t('forge_glass_specular_desc', 'Fresnel corner catchlights & inner bevel caustics'),
                    display: `${specularPct}%`,
                    min: 0,
                    max: 75,
                    step: 1,
                    value: specularPct,
                    onChange: (v: number) => handleUpdateTheme({ glassSpecular: (v / 100).toFixed(2) }),
                  },
                  {
                    key: 'glassShadow',
                    icon: t('icon_layers', 'layers'),
                    title: t('forge_glass_shadow', 'Elevation Depth'),
                    desc: t('forge_glass_shadow_desc', '6mm slab thickness crease & elevation depth'),
                    display: `${shadowPct}%`,
                    min: 0,
                    max: 85,
                    step: 1,
                    value: shadowPct,
                    onChange: (v: number) => handleUpdateTheme({ glassShadow: (v / 100).toFixed(2) }),
                  },
                  {
                    key: 'glassBorderOpacity',
                    icon: t('icon_border_style', 'border_style'),
                    title: t('forge_glass_border', 'Rim Light Intensity'),
                    desc: t('forge_glass_border_desc', '4-sided directional specular rim outline'),
                    display: `${borderPct}%`,
                    min: 0,
                    max: 60,
                    step: 1,
                    value: borderPct,
                    onChange: (v: number) => handleUpdateTheme({ glassBorderOpacity: (v / 100).toFixed(2) }),
                  },
                ].map((ctrl) => (
                  <div
                    key={ctrl.key}
                    className="glass-panel p-4 rounded-2xl flex flex-col justify-between gap-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)] transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                          <span className="material-symbols-outlined !text-[16px]">{ctrl.icon}</span>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-black text-[var(--text)] truncate">{ctrl.title}</span>
                          <span className="text-[9px] text-[var(--subtext)] opacity-75 line-clamp-1">{ctrl.desc}</span>
                        </div>
                      </div>
                      <span className={VAULT_CHIP_CLASS}>
                        <span className="font-mono text-[var(--accent)]">{ctrl.display}</span>
                      </span>
                    </div>
                    <Slider
                      min={ctrl.min}
                      max={ctrl.max}
                      step={ctrl.step}
                      value={ctrl.value}
                      onChange={(e) => ctrl.onChange(Number(e.target.value))}
                    />
                  </div>
                ))}
              </div>
            </UniversalGroup>

            {/* Section 2: Full Chromatic Matrix (Including Panel Tint & Status Colors) */}
            <UniversalGroup
              icon={t('icon_colorize', 'colorize')}
              title={t('forge_tab_colors', 'Chromatic Channels & Glass Tint')}
              actions={
                <button
                  type="button"
                  onClick={() =>
                    handleUpdateTheme({
                      success: '#10b981',
                      warning: '#f59e0b',
                      danger: '#f43f5e',
                    })
                  }
                  className="glass-surface px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[13px]">
                    {t('icon_restart_alt', 'restart_alt')}
                  </span>
                  {t('forge_btn_reset_status', 'Reset Status Colors')}
                </button>
              }
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                {allEditableColorKeys.map((key) => {
                  const swatchVal = currentTheme[key] || (key === 'panelTint' ? currentTheme.sidebar || '#0b1528' : '#000000');
                  const isPickerOpen = activeColorPicker === key;
                  return (
                    <div key={key} className="relative">
                      <div
                        className={`flex items-center justify-between w-full glass-panel rounded-2xl p-3.5 text-[var(--text)] transition-all border cursor-pointer active:scale-[0.99] group/swatch ${
                          isPickerOpen
                            ? '!border-[var(--accent)] outline outline-2 -outline-offset-1 outline-[color-mix(in_srgb,var(--accent)_80%,transparent)]'
                            : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]'
                        }`}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (activeColorPicker === key) {
                            setActiveColorPicker(null);
                          } else {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setPickerCoords({
                              top: Math.min(rect.bottom + 10, window.innerHeight - 460),
                              left: Math.min(rect.left, window.innerWidth - 440),
                            });
                            setActiveColorPicker(key);
                          }
                        }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-9 h-9 rounded-xl border-2 border-white/25 shadow-md shrink-0 group-hover/swatch:scale-105 transition-transform"
                            style={{ backgroundColor: swatchVal }}
                          />
                          <div className="flex flex-col min-w-0">
                            <span className="text-[10px] font-black text-[var(--text)] uppercase tracking-wider truncate">
                              {key === 'panelTint'
                                ? t('forge_color_panel_tint', 'Glass Surface Tint')
                                : t(`color_${key}`, key.toUpperCase())}
                            </span>
                            <code className="text-[10px] font-mono font-bold text-[var(--subtext)] uppercase truncate">
                              {String(swatchVal).toUpperCase()}
                            </code>
                          </div>
                        </div>
                        <span className="material-symbols-outlined !text-[16px] text-[var(--subtext)] group-hover/swatch:text-[var(--accent)] transition-colors">
                          {t('icon_colorize', 'colorize')}
                        </span>
                      </div>

                      {isPickerOpen &&
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
                                        ),
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
                                        ),
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
                                        ),
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
                  );
                })}
              </div>
            </UniversalGroup>
          </div>
        )}

        {/* TAB 3: TYPOGRAPHY & SURFACE GEOMETRY */}
        {activeTab === 'typography' && (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <UniversalGroup
              icon={t('icon_rounded_corner', 'rounded_corner')}
              title={t('forge_section_geometry', 'Surface Geometry & Density')}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
                <div className="glass-panel p-4 rounded-2xl flex flex-col justify-between gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center justify-center text-[var(--accent)]">
                        <span className="material-symbols-outlined !text-[16px]">
                          {t('icon_rounded_corner', 'rounded_corner')}
                        </span>
                      </div>
                      <span className="text-xs font-black text-[var(--text)]">
                        {t('forge_radius', 'Corner Radius')}
                      </span>
                    </div>
                    <span className={VAULT_CHIP_CLASS}>
                      <span className="font-mono text-[var(--accent)]">{currentTheme.radius || '1.25rem'}</span>
                    </span>
                  </div>
                  <Slider
                    min={0}
                    max={2.5}
                    step={0.125}
                    value={parseFloat(currentTheme.radius || '1.25') || 0}
                    onChange={(e) => handleUpdateTheme({ radius: `${e.target.value}rem` })}
                  />
                </div>

                <div className="glass-panel p-4 rounded-2xl flex flex-col justify-between gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center justify-center text-[var(--accent)]">
                        <span className="material-symbols-outlined !text-[16px]">
                          {t('icon_width', 'width')}
                        </span>
                      </div>
                      <span className="text-xs font-black text-[var(--text)]">
                        {t('forge_sidebar_width', 'Sidebar Width')}
                      </span>
                    </div>
                    <span className={VAULT_CHIP_CLASS}>
                      <span className="font-mono text-[var(--accent)]">{currentTheme.sidebarWidth || '260px'}</span>
                    </span>
                  </div>
                  <Slider
                    min={200}
                    max={400}
                    step={4}
                    value={parseInt(currentTheme.sidebarWidth || '260', 10) || 260}
                    onChange={(e) => handleUpdateTheme({ sidebarWidth: `${e.target.value}px` })}
                  />
                </div>
              </div>
            </UniversalGroup>

            <UniversalGroup
              icon={t('icon_font_download', 'font_download')}
              title={t('forge_font_family', 'Primary Typeface')}
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
                {[
                  'Inter, sans-serif',
                  "'Space Mono', monospace",
                  "'Orbitron', sans-serif",
                  "'Fira Code', monospace",
                  "'Rajdhani', sans-serif",
                  "'Share Tech Mono', monospace",
                  "'VT323', monospace",
                  'Courier New, monospace',
                ].map((font) => {
                  const isActive =
                    currentTheme.fontFamily === font || (!currentTheme.fontFamily && font.includes('Inter'));
                  const fontName = font.split(',')[0].replace(/'/g, '');
                  return (
                    <button
                      key={font}
                      type="button"
                      onClick={() => handleUpdateTheme({ fontFamily: font })}
                      className={`glass-panel w-full flex flex-col items-center justify-center p-4 rounded-2xl gap-2 transition-all group relative overflow-hidden cursor-pointer ${
                        isActive
                          ? '!border-[color-mix(in_srgb,var(--accent)_55%,rgba(255,255,255,0.35))] z-10'
                          : 'hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] border-[color-mix(in_srgb,var(--text)_8%,transparent)]'
                      }`}
                    >
                      {isActive && (
                        <div
                          className="absolute inset-0 rounded-[inherit] pointer-events-none"
                          style={{
                            background:
                              'linear-gradient(135deg, color-mix(in srgb, var(--accent) 16%, rgba(255, 255, 255, 0.06)) 0%, color-mix(in srgb, var(--accent) 4%, transparent) 55%, transparent 100%)',
                          }}
                        />
                      )}
                      <span
                        className={`relative z-10 text-2xl transition-colors ${
                          isActive
                            ? 'theme-text-accent'
                            : 'text-[var(--text)] opacity-75 group-hover:opacity-100'
                        }`}
                        style={{ fontFamily: font }}
                      >
                        Ag
                      </span>
                      <span
                        className={`relative z-10 text-[9px] font-black tracking-widest uppercase transition-colors ${
                          isActive ? 'theme-text-accent' : 'text-[var(--subtext)] group-hover:text-[var(--text)]'
                        }`}
                      >
                        {fontName}
                      </span>
                      {isActive && (
                        <div className="absolute top-2.5 right-2.5 w-6 h-6 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] flex items-center justify-center text-[var(--accent)] z-10">
                          <span className="material-symbols-outlined !text-[13px]">
                            {t('icon_check_circle', 'check_circle')}
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </UniversalGroup>

            <UniversalGroup
              icon={t('icon_format_size', 'format_size')}
              title={t('forge_tab_fonts', 'Typographic Scale Hierarchy')}
              actions={
                <button
                  type="button"
                  onClick={() =>
                    handleUpdateTheme({
                      fontSizeHeader: '1.875rem',
                      fontSizeSubheader: '1.5rem',
                      fontSizeTitle: '1.25rem',
                      fontSizeSubtitle: '1.125rem',
                      fontSizeText: '1rem',
                      fontSizeSubtext: '0.75rem',
                      fontSizeSidebar: '10px',
                    })
                  }
                  className="glass-surface px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[13px]">
                    {t('icon_restart_alt', 'restart_alt')}
                  </span>
                  {t('forge_reset_type', 'Reset Typography')}
                </button>
              }
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
                {[
                  { key: 'fontSizeHeader', label: t('forge_font_header', 'Header Size'), def: '1.875', max: 3.5, icon: t('icon_format_h1', 'format_h1') },
                  { key: 'fontSizeSubheader', label: t('forge_font_subheader', 'Subheader Size'), def: '1.5', max: 2.75, icon: t('icon_format_h2', 'format_h2') },
                  { key: 'fontSizeTitle', label: t('forge_font_title', 'Card Title Size'), def: '1.25', max: 2.25, icon: t('icon_title', 'title') },
                  { key: 'fontSizeSubtitle', label: t('forge_font_subtitle', 'Subtitle Size'), def: '1.125', max: 2, icon: t('icon_subtitles', 'subtitles') },
                  { key: 'fontSizeText', label: t('forge_font_text', 'Body Copy Size'), def: '1', max: 1.75, icon: t('icon_notes', 'notes') },
                  { key: 'fontSizeSubtext', label: t('forge_font_subtext', 'Caption / Metadata Size'), def: '0.75', max: 1.25, icon: t('icon_short_text', 'short_text') },
                  { key: 'fontSizeSidebar', label: t('forge_font_sidebar', 'Navigation Label Size'), def: '10', max: 18, isPx: true, icon: t('icon_view_sidebar', 'view_sidebar') },
                ].map((cfg) => (
                  <div key={cfg.key} className="glass-panel p-4 rounded-2xl flex flex-col justify-between gap-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center justify-center text-[var(--accent)]">
                          <span className="material-symbols-outlined !text-[16px]">{cfg.icon}</span>
                        </div>
                        <span className="text-xs font-black text-[var(--text)]">{cfg.label}</span>
                      </div>
                      <span className={VAULT_CHIP_CLASS}>
                        <span className="font-mono text-[var(--accent)]">
                          {currentTheme[cfg.key] || (cfg.isPx ? `${cfg.def}px` : `${cfg.def}rem`)}
                        </span>
                      </span>
                    </div>
                    <Slider
                      min={cfg.isPx ? 8 : 0.625}
                      max={cfg.max}
                      step={cfg.isPx ? 1 : 0.0625}
                      value={parseFloat(currentTheme[cfg.key] || cfg.def) || parseFloat(cfg.def)}
                      onChange={(e) =>
                        handleUpdateTheme({ [cfg.key]: cfg.isPx ? `${e.target.value}px` : `${e.target.value}rem` })
                      }
                    />
                  </div>
                ))}
              </div>
            </UniversalGroup>
          </div>
        )}

        {/* TAB 4: ATMOSPHERE (BUILT-IN WALLPAPERS, CUSTOM WALLPAPER & PREVIEW UPLOAD, GRADIENT FORGE) */}
        {activeTab === 'backgrounds' && (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <UniversalGroup
              icon={t('icon_wallpaper', 'wallpaper')}
              title={t('forge_builtin_wallpapers_title', 'Built-In Sanctuary Wallpapers')}
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
                {BUILTIN_WALLPAPERS.map((wp) => {
                  const isSelected = (currentTheme.bgImage || '') === wp.path;
                  return (
                    <button
                      key={wp.id}
                      type="button"
                      onClick={() => handleUpdateTheme({ bgImage: wp.path || null })}
                      className={`group relative h-24 rounded-2xl overflow-hidden border transition-all flex flex-col justify-end p-3 text-left cursor-pointer ${
                        isSelected
                          ? '!border-[color-mix(in_srgb,var(--accent)_65%,rgba(255,255,255,0.4))] z-10'
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
                          <div className="w-6 h-6 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                            <span className="material-symbols-outlined !text-[13px]">
                              {t('icon_check_circle', 'check_circle')}
                            </span>
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </UniversalGroup>

            {/* Section 2: Custom Wallpaper & Nexus Preview Banner Uploads */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
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
                      className="px-2.5 py-1 rounded-lg bg-transparent border border-red-500/40 text-red-400 text-[9px] font-black uppercase tracking-widest hover:border-red-400 transition-all cursor-pointer"
                    >
                      {t('forge_bg_remove', 'Clear')}
                    </button>
                  )}
                </div>

                <label className="relative h-28 rounded-xl border border-dashed border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:border-[var(--accent)] transition-all flex flex-col items-center justify-center gap-2 cursor-pointer overflow-hidden group">
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
                      <span className="material-symbols-outlined !text-[26px] text-[var(--accent)]">
                        {t('icon_upload', 'upload')}
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)]">
                        {t('forge_bg_upload', 'Upload Custom Wallpaper')}
                      </span>
                    </>
                  )}
                </label>
              </div>

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
                      className="px-2.5 py-1 rounded-lg bg-transparent border border-red-500/40 text-red-400 text-[9px] font-black uppercase tracking-widest hover:border-red-400 transition-all cursor-pointer"
                    >
                      {t('forge_bg_remove', 'Clear')}
                    </button>
                  )}
                </div>

                <label className="relative h-28 rounded-xl border border-dashed border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:border-[var(--accent)] transition-all flex flex-col items-center justify-center gap-2 cursor-pointer overflow-hidden group">
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
                      <span className="material-symbols-outlined !text-[26px] text-[var(--accent)]">
                        {t('icon_auto_awesome_mosaic', 'auto_awesome_mosaic')}
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] text-center px-4">
                        {t('forge_preview_banner_auto', 'Using Default Dynamic OS Preview Card (Click to Override)')}
                      </span>
                    </>
                  )}
                </label>
              </div>
            </div>

            {/* Section 3: Atmospheric Gradient Forge & Surface Effects */}
            <UniversalGroup
              icon={t('icon_gradient', 'gradient')}
              title={t('forge_bg_selector', 'Atmospheric Underlay Gradients')}
            >
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                  {[
                    { id: 'none', label: t('forge_bg_solid', 'Solid Canvas') },
                    { id: 'linear-gradient(to bottom right, #171520, #241b2f)', label: t('forge_bg_miami', 'Nocturne') },
                    { id: 'radial-gradient(circle at center, #1e1b4b, #000000)', label: t('forge_bg_abyssal', 'Abyssal') },
                    { id: 'linear-gradient(135deg, rgba(2,0,36,1) 0%, rgba(9,9,121,1) 35%, rgba(0,212,255,1) 100%)', label: t('forge_bg_ocean', 'Deep Azure') },
                    { id: 'radial-gradient(circle at top right, #3f3f46, #000000)', label: t('forge_bg_slate', 'Monolith') },
                    { id: 'radial-gradient(circle at 80% -15%, rgba(56, 189, 248, 0.38) 0%, transparent 55%), radial-gradient(circle at 12% 105%, rgba(37, 99, 235, 0.28) 0%, transparent 60%), #050914', label: t('forge_bg_architect', 'Sanctuary') },
                    { id: 'radial-gradient(circle at 18% -15%, rgba(16, 185, 129, 0.38) 0%, transparent 55%), radial-gradient(circle at 85% 110%, rgba(59, 130, 246, 0.30) 0%, transparent 65%), #061318', label: t('theme_name_sims4', 'Plumbob') },
                  ].map((preset) => {
                    const isGradActive =
                      currentTheme.bgGradient === preset.id || (!currentTheme.bgGradient && preset.id === 'none');
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleUpdateTheme({ bgGradient: preset.id })}
                        className={`h-16 rounded-xl border transition-all flex items-center justify-center p-2 relative overflow-hidden group shadow-md cursor-pointer ${
                          isGradActive
                            ? '!border-[var(--accent)] outline outline-2 -outline-offset-1 outline-[color-mix(in_srgb,var(--accent)_80%,transparent)]'
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
                <div className="glass-panel p-4 rounded-2xl flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-[var(--text)]">
                      {t('forge_background_builder', 'Custom Gradient Synthesizer')}
                    </span>
                  </div>
                  <div
                    className="w-full h-20 rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] shadow-inner relative overflow-hidden"
                    style={{
                      background:
                        bgBuilderType === 'solid'
                          ? bgBuilderColor1
                          : bgBuilderType === 'linear'
                            ? `linear-gradient(${bgBuilderAngle}deg, ${bgBuilderColor1}, ${bgBuilderColor2})`
                            : `radial-gradient(circle, ${bgBuilderColor1}, ${bgBuilderColor2})`,
                    }}
                  />

                  <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
                    <div className="flex items-center gap-2">
                      {(['solid', 'linear', 'radial'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => {
                            setBgBuilderType(mode);
                            applyBgBuilder(mode, bgBuilderAngle, bgBuilderColor1, bgBuilderColor2);
                          }}
                          className={`px-3.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all cursor-pointer ${
                            bgBuilderType === mode
                              ? 'bg-transparent text-[var(--accent)] border-[var(--accent)]'
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
                        <Slider
                          min={0}
                          max={360}
                          step={1}
                          value={bgBuilderAngle}
                          onChange={(e) => {
                            const ang = parseInt(e.target.value, 10);
                            setBgBuilderAngle(ang);
                            applyBgBuilder(bgBuilderType, ang, bgBuilderColor1, bgBuilderColor2);
                          }}
                          className="flex-1"
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
                </div>

                {/* Ambient Grain, Ambient Orb & Holo-Scanline Toggles */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 w-full">
                  <UniversalCard
                    layout="horizontal"
                    icon={t('icon_grain', 'grain')}
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
                    icon={t('icon_blur_on', 'blur_on')}
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

                  <UniversalCard
                    layout="horizontal"
                    icon={t('icon_line_weight', 'line_weight')}
                    title={t('forge_scanlines', 'CRT Holo-Scanlines')}
                    actions={
                      <label className="flex items-center gap-2 cursor-pointer mt-1">
                        <div
                          className={`w-8 h-4 rounded-full p-0.5 transition-colors ${
                            Boolean(currentTheme.scanlines)
                              ? 'bg-[var(--accent)]'
                              : 'bg-[color-mix(in_srgb,var(--text)_20%,transparent)]'
                          }`}
                        >
                          <div
                            className={`w-3 h-3 rounded-full bg-white transition-transform shadow-sm ${
                              Boolean(currentTheme.scanlines) ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </div>
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={Boolean(currentTheme.scanlines)}
                          onChange={(e) => handleUpdateTheme({ scanlines: e.target.checked })}
                        />
                      </label>
                    }
                    className="w-full"
                  >
                    <p className="text-[10px] text-[var(--subtext)] leading-relaxed mt-1">
                      {t('forge_scanlines_desc', 'Projects subtle horizontal tactical scanlines across the viewport.')}
                    </p>
                  </UniversalCard>
                </div>
              </div>
            </UniversalGroup>
          </div>
        )}
      </div>
    </div>
  );
}
