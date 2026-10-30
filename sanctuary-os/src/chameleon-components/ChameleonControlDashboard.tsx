import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLexicon } from '../LexiconContext';
import { useTheme, applyThemeCssVarsToRoot } from '../ThemeContext';
import {
  HexToRGB,
  RGBToHex,
  PRESET_COLORS,
  SEMANTIC_SHADES,
  sanitizeSemanticStatusColor,
  GLASS_MATERIAL_PRESETS,
  CURATED_COLOR_PALETTES,
  BUILTIN_WALLPAPERS,
  FONT_OPTIONS,
  getLuminance,
  analyzeAndHarmonizeTheme,
} from './ChameleonShared';
import { UniversalCard } from '../components/universal/UniversalCard';
import { Slider } from '../components/universal/Slider';
import { DashboardStatTile } from '../hub-components/SharedCommandScreenLayout';
import { UniversalGroup, VAULT_CHIP_CLASS, HoverTooltip } from '../shared';
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
  const { currentTheme: osActiveTheme } = useTheme();
  const osActiveThemeRef = useRef<any>(osActiveTheme);
  osActiveThemeRef.current = osActiveTheme;
  const pushStatus = useStore((state) => state.pushStatus);
  const [activeColorPicker, setActiveColorPicker] = useState<string | null>(null);
  const [pickerCoords, setPickerCoords] = useState<{ top?: number; left?: number; right?: number } | null>(null);
  const [activeTab, setActiveTab] = useState<'presets' | 'optics' | 'typography' | 'backgrounds'>('presets');
  const [syncPaletteWallpaper, setSyncPaletteWallpaper] = useState(false);
  const [mobilePane, setMobilePane] = useState<'controls' | 'preview'>('controls');

  useEffect(() => {
    const handlePaneSwitch = (e: Event) => {
      const next = (e as CustomEvent<'controls' | 'preview'>).detail;
      if (next === 'controls' || next === 'preview') {
        setMobilePane(next);
      }
    };
    window.addEventListener('sanctuary-chameleon-mobile-pane', handlePaneSwitch);
    return () => window.removeEventListener('sanctuary-chameleon-mobile-pane', handlePaneSwitch);
  }, []);

  const [bgBuilderType, setBgBuilderType] = useState<'solid' | 'linear' | 'radial'>('linear');
  const [bgBuilderAngle, setBgBuilderAngle] = useState(135);
  const [bgBuilderColor1, setBgBuilderColor1] = useState('#1e1b4b');
  const [bgBuilderColor2, setBgBuilderColor2] = useState('#020617');

  // Drive the live WebGL2 SDF Liquid Glass Engine AND :root CSS variables in real time even when editing cloud/sandbox theme objects
  const prevTexKeyRef = useRef<string>('');
  useEffect(() => {
    (window as any).__sanctuaryPreviewTheme = currentTheme;
    applyThemeCssVarsToRoot(currentTheme);
    const texKey = `${currentTheme?.bgImage || ''}::${currentTheme?.bg || ''}::${Boolean(currentTheme?.transparentWindow)}::${currentTheme?.glassBlur || ''}::${currentTheme?.glassSaturation || ''}::${currentTheme?.ambientOrb ?? true}`;
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
      if (osActiveThemeRef.current) {
        applyThemeCssVarsToRoot(osActiveThemeRef.current);
      }
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
      handleUpdateTheme({
        bgImage: dataUrl,
        transparentWindow: false,
        ...(currentTheme.bg === 'transparent' ? { bg: '#050914' } : {}),
      });
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

  const handleAutoHarmonize = async () => {
    const harmonized = await analyzeAndHarmonizeTheme(currentTheme);
    handleUpdateTheme(harmonized);
    pushStatus?.(
      t(
        'forge_status_harmonized',
        'Liquid Glass optics, surfaces & text contrast harmonized to active background.'
      )
    );
  };

  const handleAutoTuneGlassOnly = async () => {
    const tunedGlass = await analyzeAndHarmonizeTheme(currentTheme, { glassOnly: true });
    handleUpdateTheme(tunedGlass);
    pushStatus?.(
      t(
        'forge_status_glass_tuned',
        'Liquid Glass optics calibrated to active wallpaper & background.'
      )
    );
  };

  const isDarkMode = getLuminance(currentTheme?.bg || '#060b14') < 0.5;

  const handleToggleThemeMode = async () => {
    const nextMode = isDarkMode ? 'light' : 'dark';
    const harmonized = await analyzeAndHarmonizeTheme(currentTheme, { targetMode: nextMode });
    handleUpdateTheme(harmonized);
    pushStatus?.(
      t(
        'forge_status_harmonized',
        'Liquid Glass optics, surfaces & text contrast harmonized to active background.'
      )
    );
  };

  const COLOR_CHANNEL_GROUPS = [
    {
      id: 'surfaces',
      title: t('forge_colors_surfaces', 'Core Surfaces & Accent'),
      icon: t('icon_layers', 'layers'),
      items: [
        { key: 'accent', label: t('color_accent', 'Accent') },
        { key: 'bg', label: t('color_bg', 'Background') },
        { key: 'sidebar', label: t('color_sidebar', 'Sidebar') },
        { key: 'panelTint', label: t('forge_color_panel_tint', 'Glass Surface Tint') },
      ],
    },
    {
      id: 'typography',
      title: t('forge_colors_typography', 'Typography & Contrast'),
      icon: t('icon_text_fields', 'text_fields'),
      items: [
        { key: 'headerText', label: t('color_headerText', 'Header Text') },
        { key: 'text', label: t('color_text', 'Primary Text') },
        { key: 'subtext', label: t('color_subtext', 'Subtext') },
        { key: 'sidebartext', label: t('color_sidebartext', 'Sidebar Text') },
      ],
    },
    {
      id: 'semantic',
      title: t('forge_colors_semantic', 'Semantic Status Channels'),
      icon: t('icon_verified', 'verified'),
      items: [
        { key: 'success', label: t('color_success', 'Success') },
        { key: 'warning', label: t('color_warning', 'Warning') },
        { key: 'danger', label: t('color_danger', 'Danger') },
      ],
    },
  ];

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
      className={`${mobilePane === 'preview' ? 'hidden lg:flex' : 'flex'} flex-1 flex-col h-full min-h-0 lg:border-r border-[color-mix(in_srgb,var(--text)_8%,transparent)] overflow-hidden`}
      style={{ '--accent': currentTheme.accent || '#38bdf8' } as React.CSSProperties}
    >
      {/* Compact Theme Matrix Header & 4-Tile Navigation */}
      <div className="flex flex-col gap-3 px-3.5 sm:px-6 pt-3.5 sm:pt-4 pb-3.5 sm:pb-4 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-transparent shrink-0">
        <div className="glass-panel p-3 sm:p-3.5 rounded-2xl flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)]">
              <span className="material-symbols-outlined !text-[20px]">
                {t('icon_palette', 'palette')}
              </span>
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0 px-2.5 py-0.5 -ml-2.5 rounded-xl border border-transparent hover:glass-surface hover:border-[color-mix(in_srgb,var(--text)_14%,transparent)] focus-within:glass-surface focus-within:border-[color-mix(in_srgb,var(--accent)_45%,rgba(255,255,255,0.32))] transition-all w-fit max-w-full">
                <input
                  type="text"
                  value={currentTheme.name || ''}
                  onChange={(e) => canRename && renameTheme && editingThemeId && renameTheme(editingThemeId, e.target.value)}
                  className="w-full max-w-[260px] bg-transparent border-none outline-none text-base font-black text-[var(--text)] tracking-tight py-0.5 truncate"
                  placeholder={t('forge_theme_name_placeholder', 'Enter Theme Name...')}
                  disabled={!canRename}
                />
                {canRename && (
                  <span className="material-symbols-outlined !text-[13px] text-[var(--accent)] opacity-75 shrink-0">
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
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent('sanctuary-chameleon-mobile-pane', { detail: 'preview' })
                )
              }
              className={`lg:hidden ${VAULT_CHIP_CLASS} hover:sa-glass-pill-active transition-all cursor-pointer`}
            >
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t('icon_visibility', 'visibility')}
              </span>
              <span>{t('btn_preview_theme', 'Preview')}</span>
            </button>
            <button
              type="button"
              onClick={handleToggleThemeMode}
              className={`${VAULT_CHIP_CLASS} hover:sa-glass-pill-active transition-all cursor-pointer`}
            >
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {isDarkMode ? t('icon_dark_mode', 'dark_mode') : t('icon_light_mode', 'light_mode')}
              </span>
              <span>{isDarkMode ? t('mode_dark', 'Dark') : t('mode_light', 'Light')}</span>
            </button>
            <button
              type="button"
              onClick={handleAutoHarmonize}
              className={`${VAULT_CHIP_CLASS} hover:sa-glass-pill-active transition-all cursor-pointer`}
            >
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t('icon_contrast', 'contrast')}
              </span>
              <span>{t('forge_btn_auto_contrast', 'Auto-Harmonize')}</span>
            </button>
            <button
              type="button"
              onClick={handleCopyThemeJson}
              className={`${VAULT_CHIP_CLASS} hover:sa-glass-pill-active transition-all cursor-pointer`}
            >
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t('icon_content_copy', 'content_copy')}
              </span>
              <span>{t('forge_btn_copy_json', 'Copy JSON')}</span>
            </button>
          </div>
        </div>

        {/* 4-Tile Filter Grid */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-2.5 w-full">
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
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3.5 sm:p-6 flex flex-col gap-5 sm:gap-6 pb-28">
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
                          ? 'sa-glass-pill-active z-10'
                          : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)]'
                      }`}
                    >
                      <div className="relative z-10 flex items-start justify-between gap-2.5 w-full">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">
                              {t(preset.iconKey, preset.fallbackIcon)}
                            </span>
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className={`text-xs font-black tracking-tight leading-snug ${isCurrentMaterial ? 'text-[var(--accent)]' : 'text-[var(--text)]'}`}>
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

                      {/* Sleek Single-Line Optical Summary Pill */}
                      <div className="relative z-10 w-full px-3 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-[9.5px] font-mono font-bold text-[var(--text)]">
                          <span>{`${presetOpacityPct}%`}</span>
                          <span className="text-[var(--subtext)] opacity-50">·</span>
                          <span>{preset.values.glassBlur}</span>
                          <span className="text-[var(--subtext)] opacity-50">·</span>
                          <span className="text-[var(--accent)]">{preset.values.glassRefraction}</span>
                        </div>
                        <span className="text-[8.5px] font-black uppercase tracking-wider text-[var(--subtext)] opacity-80">
                          {`${t('forge_metric_glare', 'Glare')} ${presetSpecPct}%`}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </UniversalGroup>

            <UniversalGroup
              icon={t('icon_palette', 'palette')}
              title={t('forge_color_palettes_title', 'Curated Color Harmony Palettes')}
              actions={
                <button
                  type="button"
                  onClick={() => setSyncPaletteWallpaper(!syncPaletteWallpaper)}
                  className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all flex items-center gap-1.5 cursor-pointer ${
                    syncPaletteWallpaper
                      ? 'sa-glass-pill-active'
                      : 'glass-surface border-transparent text-[var(--subtext)] hover:text-[var(--text)]'
                  }`}
                >
                  <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                    {syncPaletteWallpaper
                      ? t('icon_check_box', 'check_box')
                      : t('icon_check_box_outline_blank', 'check_box_outline_blank')}
                  </span>
                  <span>{t('forge_sync_wallpaper', 'Apply Suggested Wallpaper')}</span>
                </button>
              }
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
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
                          transparentWindow: false,
                          glassOpacity: isLightPalette ? '0.20' : '0.10',
                          ...(syncPaletteWallpaper && palette.suggestedWallpaper
                            ? { bgImage: palette.suggestedWallpaper }
                            : {}),
                        })
                      }
                      className={`glass-panel p-4 rounded-2xl border text-left transition-all flex flex-col justify-between gap-3 group relative overflow-hidden cursor-pointer ${
                        isActivePalette
                          ? 'sa-glass-pill-active z-10'
                          : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)]'
                      }`}
                    >
                      <div className="relative z-10 flex items-center justify-between gap-2 w-full">
                        <span className={`text-xs font-black tracking-tight leading-snug ${isActivePalette ? 'text-[var(--accent)]' : 'text-[var(--text)]'}`}>
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
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAutoTuneGlassOnly}
                    className="glass-surface px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                      {t('icon_auto_awesome', 'auto_awesome')}
                    </span>
                    {t('forge_auto_tune_glass', 'Auto-Tune Glass')}
                  </button>
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
                </div>
              }
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
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
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)] mt-0.5">
                          <span className="material-symbols-outlined !text-[16px]">{ctrl.icon}</span>
                        </div>
                        <div className="flex flex-col min-w-0 gap-0.5">
                          <span className="text-xs font-black text-[var(--text)] leading-snug">{ctrl.title}</span>
                          <span className="text-[10px] text-[var(--subtext)] opacity-80 leading-snug">{ctrl.desc}</span>
                        </div>
                      </div>
                      <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
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

            {/* Section 2: Full Chromatic Matrix (Grouped into Core Surfaces, Typography & Semantic Status) */}
            <UniversalGroup
              icon={t('icon_colorize', 'colorize')}
              title={t('forge_tab_colors', 'Chromatic Channels & Glass Tint')}
              actions={
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAutoHarmonize}
                    className="glass-surface px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                      {t('icon_contrast', 'contrast')}
                    </span>
                    {t('forge_btn_auto_contrast', 'Auto-Harmonize')}
                  </button>
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
                </div>
              }
            >
              <div className="flex flex-col gap-5">
                {COLOR_CHANNEL_GROUPS.map((group) => (
                  <div key={group.id} className="flex flex-col gap-2.5">
                    <div className="flex items-center gap-2 px-1">
                      <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                        {group.icon}
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {group.title}
                      </span>
                    </div>
                    <div className={`grid grid-cols-1 ${group.items.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-3.5`}>
                      {group.items.map(({ key, label }) => {
                        const rawSwatchVal =
                          currentTheme[key] ||
                          (key === 'panelTint' ? currentTheme.sidebar || '#0b1528' : '#000000');
                        const isSemanticChannel = Boolean(SEMANTIC_SHADES[key]);
                        const swatchVal = isSemanticChannel
                          ? sanitizeSemanticStatusColor(key, rawSwatchVal)
                          : rawSwatchVal;
                        const isPickerOpen = activeColorPicker === key;
                        return (
                          <div key={key} className="relative">
                            <div
                              className={`flex items-center justify-between w-full glass-panel rounded-2xl p-3.5 text-[var(--text)] transition-all border cursor-pointer active:scale-[0.99] group/swatch ${
                                isPickerOpen
                                  ? 'sa-glass-pill-active z-10'
                                  : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]'
                              }`}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (activeColorPicker === key) {
                                  setActiveColorPicker(null);
                                } else {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  const popW = 344;
                                  const popH = isSemanticChannel ? 215 : favColors.length > 0 ? 410 : 340;
                                  const spaceBelow = window.innerHeight - rect.bottom;
                                  const shouldDropUp = spaceBelow < popH + 16 && rect.top > popH + 16;
                                  const topPos = shouldDropUp
                                    ? Math.max(16, rect.top - popH - 8)
                                    : Math.max(16, Math.min(rect.bottom + 8, window.innerHeight - popH - 16));
                                  const leftPos = Math.max(16, Math.min(rect.left, window.innerWidth - popW - 16));
                                  setPickerCoords({
                                    top: topPos,
                                    left: leftPos,
                                  });
                                  setActiveColorPicker(key);
                                }
                              }}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div
                                  className="w-9 h-9 !rounded-xl sa-glass-swatch shrink-0 group-hover/swatch:scale-105 transition-transform"
                                  style={{ backgroundColor: swatchVal === 'transparent' ? '#050b16' : swatchVal }}
                                />
                                <div className="flex flex-col min-w-0 gap-0.5">
                                  <span className="text-[10px] font-black text-[var(--text)] uppercase tracking-wider leading-snug">
                                    {label}
                                  </span>
                                  <code className="text-[10px] font-mono font-bold text-[var(--subtext)] uppercase truncate">
                                    {String(swatchVal).toUpperCase()}
                                  </code>
                                </div>
                              </div>
                              <span className="material-symbols-outlined !text-[16px] text-[var(--subtext)] group-hover/swatch:text-[var(--accent)] transition-colors shrink-0">
                                {t('icon_colorize', 'colorize')}
                              </span>
                            </div>

                            {isPickerOpen &&
                              createPortal(
                                <>
                                  <div
                                    className="!fixed inset-0 pointer-events-auto bg-transparent"
                                    style={{ zIndex: 100000000 }}
                                    onPointerDown={(e) => {
                                      e.stopPropagation();
                                      setActiveColorPicker(null);
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveColorPicker(null);
                                    }}
                                  />
                                  <div
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                    className="!fixed pointer-events-auto p-4 sa-dropdown-popover !rounded-2xl w-[21.5rem] max-w-[calc(100vw-24px)]"
                                    style={{
                                      zIndex: 100000001,
                                      ...pickerCoords,
                                    }}
                                  >
                                    <div className="flex items-center justify-between gap-2 pb-3 mb-3.5 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                                          {t('icon_palette', 'palette')}
                                        </span>
                                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] truncate">
                                          {label}
                                        </span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => setActiveColorPicker(null)}
                                        className="w-7 h-7 !rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--accent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] transition-all cursor-pointer"
                                      >
                                        <span className="material-symbols-outlined !text-[14px]">
                                          {t('icon_close', 'close')}
                                        </span>
                                      </button>
                                    </div>

                                    {isSemanticChannel ? (
                                      <div className="flex items-center justify-between gap-2.5 mb-3.5 px-3 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                          <div
                                            className="w-7 h-7 !rounded-lg sa-glass-swatch shrink-0"
                                            style={{ backgroundColor: swatchVal }}
                                          />
                                          <code className="text-xs font-mono font-bold text-[var(--text)] uppercase tracking-widest">
                                            {String(swatchVal).toUpperCase()}
                                          </code>
                                        </div>
                                        <span className="px-2 py-0.5 rounded-md bg-transparent border border-[color-mix(in_srgb,var(--text)_16%,transparent)] text-[8.5px] font-black uppercase tracking-wider text-[var(--subtext)] flex items-center gap-1 shrink-0">
                                          <span className="material-symbols-outlined !text-[11px] text-[var(--accent)]">
                                            {t('icon_lock', 'lock')}
                                          </span>
                                          <span>{t('forge_semantic_locked', 'Locked Spectrum')}</span>
                                        </span>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2.5 mb-3.5">
                                        <label className="relative w-10 h-10 !rounded-xl sa-glass-swatch shrink-0 cursor-pointer group/native">
                                          <input
                                            type="color"
                                            value={swatchVal.startsWith('#') && swatchVal.length === 7 ? swatchVal : '#38bdf8'}
                                            onChange={(e) => handleUpdateTheme({ [key]: e.target.value })}
                                            className="absolute -inset-2 w-14 h-14 cursor-pointer opacity-0 z-10"
                                          />
                                          <div className="w-full h-full" style={{ backgroundColor: swatchVal }} />
                                          <span className="material-symbols-outlined !text-[12px] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)] absolute bottom-1 right-1 opacity-75 group-hover/native:opacity-100 pointer-events-none">
                                            {t('icon_colorize', 'colorize')}
                                          </span>
                                        </label>

                                        <input
                                          type="text"
                                          value={swatchVal}
                                          onChange={(e) => handleUpdateTheme({ [key]: e.target.value })}
                                          className="flex-1 h-10 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] !rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] uppercase tracking-widest outline-none focus:border-[var(--accent)] transition-colors"
                                        />

                                        <button
                                          type="button"
                                          onClick={() => toggleFavColor(swatchVal)}
                                          className="relative w-10 h-10 !rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] shrink-0 flex items-center justify-center cursor-pointer hover:border-[var(--accent)] transition-all"
                                        >
                                          <span
                                            className={`material-symbols-outlined !text-[17px] ${
                                              favColors.includes(swatchVal) ? 'text-amber-400' : 'text-[var(--subtext)] opacity-70'
                                            }`}
                                          >
                                            {favColors.includes(swatchVal) ? t('icon_star', 'star') : t('icon_star_border', 'star_border')}
                                          </span>
                                          <HoverTooltip title={t('color_favs', 'Favorite Colors')} variant="accent" vAlign="bottom" />
                                        </button>
                                      </div>
                                    )}

                                    <div className={`grid grid-cols-8 gap-2 ${isSemanticChannel ? '' : 'mb-3.5'}`}>
                                      {(SEMANTIC_SHADES[key] || PRESET_COLORS).map((color) => {
                                        const isSwatchSelected = swatchVal?.toLowerCase() === color.toLowerCase();
                                        return (
                                          <button
                                            key={color}
                                            type="button"
                                            onClick={() => handleUpdateTheme({ [key]: color })}
                                            className={`w-full aspect-square !rounded-lg sa-glass-swatch hover:scale-105 transition-all cursor-pointer flex items-center justify-center ${
                                              isSwatchSelected
                                                ? 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg,#050b16)] scale-105 z-10'
                                                : ''
                                            }`}
                                            style={{ backgroundColor: color }}
                                          />
                                        );
                                      })}
                                    </div>

                                    {!isSemanticChannel && favColors.length > 0 && (
                                      <div className="mb-3.5 pt-3 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                                        <h4 className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] mb-2">
                                          {t('color_favs', 'Saved Swatches')}
                                        </h4>
                                        <div className="grid grid-cols-8 gap-2">
                                          {favColors.map((color) => (
                                            <button
                                              key={color}
                                              type="button"
                                              onClick={() => handleUpdateTheme({ [key]: color })}
                                              className={`w-full aspect-square !rounded-lg sa-glass-swatch hover:scale-105 transition-all cursor-pointer ${
                                                swatchVal?.toLowerCase() === color.toLowerCase()
                                                  ? 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg,#050b16)] scale-105'
                                                  : ''
                                              }`}
                                              style={{ backgroundColor: color }}
                                            />
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {!isSemanticChannel && (
                                      <div className="flex flex-col gap-2 pt-3 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                                        <div className="flex items-center gap-2.5">
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
                                          <code className="text-[10px] font-mono font-bold text-[var(--text)] opacity-85 w-8 text-right">
                                            {HexToRGB(swatchVal).r}
                                          </code>
                                        </div>
                                        <div className="flex items-center gap-2.5">
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
                                          <code className="text-[10px] font-mono font-bold text-[var(--text)] opacity-85 w-8 text-right">
                                            {HexToRGB(swatchVal).g}
                                          </code>
                                        </div>
                                        <div className="flex items-center gap-2.5">
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
                                          <code className="text-[10px] font-mono font-bold text-[var(--text)] opacity-85 w-8 text-right">
                                            {HexToRGB(swatchVal).b}
                                          </code>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </>,
                                document.getElementById('sa-portals') || document.body
                              )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
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
                      <div className="w-8 h-8 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center text-[var(--accent)]">
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
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {[
                      { val: '0.5rem', label: t('forge_radius_sharp', 'Sharp') },
                      { val: '0.875rem', label: t('forge_radius_tactical', 'Tactical') },
                      { val: '1.25rem', label: t('forge_radius_standard', 'Standard') },
                      { val: '1.5rem', label: t('forge_radius_sculpted', 'Sculpted') },
                      { val: '2rem', label: t('forge_radius_pill', 'Pill') },
                    ].map((preset) => {
                      const isRadActive =
                        Math.abs((parseFloat(currentTheme.radius || '1.25') || 1.25) - parseFloat(preset.val)) < 0.05;
                      return (
                        <button
                          key={preset.val}
                          type="button"
                          onClick={() => handleUpdateTheme({ radius: preset.val })}
                          className={`flex-1 min-w-fit px-2.5 py-1.5 rounded-xl text-[8.5px] font-black uppercase tracking-wider border transition-all cursor-pointer text-center ${
                            isRadActive
                              ? 'sa-glass-pill-active'
                              : 'glass-surface border-transparent text-[var(--subtext)] hover:text-[var(--text)]'
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="glass-panel p-4 rounded-2xl flex flex-col justify-between gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center text-[var(--accent)]">
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
                  <div className="grid grid-cols-4 gap-1.5 pt-1">
                    {['220px', '260px', '300px', '340px'].map((wVal) => {
                      const isWidthActive = (currentTheme.sidebarWidth || '260px') === wVal;
                      return (
                        <button
                          key={wVal}
                          type="button"
                          onClick={() => handleUpdateTheme({ sidebarWidth: wVal })}
                          className={`px-2 py-1.5 rounded-xl text-[8.5px] font-mono font-black border transition-all cursor-pointer ${
                            isWidthActive
                              ? 'sa-glass-pill-active'
                              : 'glass-surface border-transparent text-[var(--subtext)] hover:text-[var(--text)]'
                          }`}
                        >
                          {wVal}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="glass-panel p-4 rounded-2xl flex flex-col justify-between gap-3 md:col-span-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center text-[var(--accent)]">
                        <span className="material-symbols-outlined !text-[16px]">
                          {t('icon_text_fields', 'text_fields')}
                        </span>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-black text-[var(--text)]">
                          {t('forge_text_case', 'Text Caps Case')}
                        </span>
                        <span className="text-[10px] text-[var(--subtext)] opacity-80">
                          {t('forge_text_case_desc', 'Global typographic casing across headers, navigation, and interface labels.')}
                        </span>
                      </div>
                    </div>
                    <span className={VAULT_CHIP_CLASS}>
                      <span className="font-mono text-[var(--accent)]">
                        {(currentTheme.textCase || 'capitalize') === 'uppercase'
                          ? t('forge_case_upper', 'ALL CAPS')
                          : (currentTheme.textCase || 'capitalize') === 'lowercase'
                            ? t('forge_case_lower', 'lowercase')
                            : t('forge_case_title', 'Title Case')}
                      </span>
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2.5 pt-1">
                    {[
                      {
                        val: 'uppercase',
                        glyph: 'AA',
                        label: t('forge_case_upper', 'ALL CAPS'),
                        transform: 'uppercase' as const,
                      },
                      {
                        val: 'capitalize',
                        glyph: 'Aa',
                        label: t('forge_case_title', 'Title Case'),
                        transform: 'capitalize' as const,
                      },
                      {
                        val: 'lowercase',
                        glyph: 'aa',
                        label: t('forge_case_lower', 'lowercase'),
                        transform: 'lowercase' as const,
                      },
                    ].map((caseOpt) => {
                      const isCaseActive = (currentTheme.textCase || 'capitalize') === caseOpt.val;
                      return (
                        <button
                          key={caseOpt.val}
                          type="button"
                          onClick={() => handleUpdateTheme({ textCase: caseOpt.val })}
                          className={`px-3.5 py-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                            isCaseActive
                              ? 'sa-glass-pill-active'
                              : 'glass-surface border-transparent text-[var(--subtext)] hover:text-[var(--text)]'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`text-sm font-black font-mono shrink-0 ${
                                isCaseActive ? 'text-[var(--accent)]' : 'text-[var(--text)] opacity-80'
                              }`}
                              style={{ textTransform: 'none' }}
                            >
                              {caseOpt.glyph}
                            </span>
                            <span
                              className="text-[10px] font-black tracking-wider truncate"
                              style={{ textTransform: caseOpt.transform }}
                            >
                              {caseOpt.label}
                            </span>
                          </div>
                          {isCaseActive && (
                            <span className="material-symbols-outlined !text-[14px] text-[var(--accent)] shrink-0">
                              {t('icon_check_circle', 'check_circle')}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </UniversalGroup>

            <UniversalGroup
              icon={t('icon_font_download', 'font_download')}
              title={t('forge_font_family', 'Primary Typeface')}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {FONT_OPTIONS.map((font) => {
                  const isActive =
                    currentTheme.fontFamily === font.value ||
                    (!currentTheme.fontFamily && font.value.includes('Inter'));
                  return (
                    <button
                      key={font.value}
                      type="button"
                      onClick={() => handleUpdateTheme({ fontFamily: font.value })}
                      className={`glass-panel w-full flex flex-col justify-between p-4 rounded-2xl gap-2.5 text-left transition-all group relative overflow-hidden cursor-pointer ${
                        isActive
                          ? 'sa-glass-pill-active z-10'
                          : 'hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] border-[color-mix(in_srgb,var(--text)_8%,transparent)]'
                      }`}
                    >
                      <div className="relative z-10 flex items-center justify-between gap-2 w-full">
                        <span
                          className={`text-2xl font-bold transition-colors ${
                            isActive
                              ? 'theme-text-accent'
                              : 'text-[var(--text)] opacity-85 group-hover:opacity-100'
                          }`}
                          style={{ fontFamily: font.value }}
                        >
                          Ag
                        </span>
                        {isActive && (
                          <div className="w-6 h-6 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] flex items-center justify-center text-[var(--accent)]">
                            <span className="material-symbols-outlined !text-[13px]">
                              {t('icon_check_circle', 'check_circle')}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="relative z-10 flex flex-col gap-0.5 min-w-0">
                        <span className={`text-[10px] font-black tracking-wider uppercase leading-snug ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text)]'}`}>
                          {t(font.labelKey, font.fallbackLabel)}
                        </span>
                        <span className="text-[10px] text-[var(--subtext)] opacity-80 leading-snug">
                          {t(font.descKey, font.fallbackDesc)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </UniversalGroup>

            <UniversalGroup
              icon={t('icon_format_size', 'format_size')}
              title={t('forge_tab_fonts', 'Typographic Scale Hierarchy')}
              actions={
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    {
                      id: 'compact',
                      label: t('forge_scale_compact', 'Compact'),
                      values: {
                        fontSizeHeader: '1.625rem',
                        fontSizeSubheader: '1.35rem',
                        fontSizeTitle: '1.125rem',
                        fontSizeSubtitle: '1rem',
                        fontSizeText: '0.875rem',
                        fontSizeSubtext: '0.6875rem',
                        fontSizeSidebar: '9px',
                      },
                    },
                    {
                      id: 'default',
                      label: t('forge_scale_default', 'Default'),
                      values: {
                        fontSizeHeader: '1.875rem',
                        fontSizeSubheader: '1.5rem',
                        fontSizeTitle: '1.25rem',
                        fontSizeSubtitle: '1.125rem',
                        fontSizeText: '1rem',
                        fontSizeSubtext: '0.75rem',
                        fontSizeSidebar: '10px',
                      },
                    },
                    {
                      id: 'comfortable',
                      label: t('forge_scale_comfortable', 'Comfortable'),
                      values: {
                        fontSizeHeader: '2.125rem',
                        fontSizeSubheader: '1.65rem',
                        fontSizeTitle: '1.375rem',
                        fontSizeSubtitle: '1.25rem',
                        fontSizeText: '1.0625rem',
                        fontSizeSubtext: '0.8125rem',
                        fontSizeSidebar: '11px',
                      },
                    },
                    {
                      id: 'large',
                      label: t('forge_scale_large', 'Large'),
                      values: {
                        fontSizeHeader: '2.375rem',
                        fontSizeSubheader: '1.85rem',
                        fontSizeTitle: '1.5rem',
                        fontSizeSubtitle: '1.35rem',
                        fontSizeText: '1.125rem',
                        fontSizeSubtext: '0.875rem',
                        fontSizeSidebar: '12px',
                      },
                    },
                  ].map((scalePreset) => {
                    const isScaleActive =
                      (currentTheme.fontSizeText || '1rem') === scalePreset.values.fontSizeText &&
                      (currentTheme.fontSizeHeader || '1.875rem') === scalePreset.values.fontSizeHeader;
                    return (
                      <button
                        key={scalePreset.id}
                        type="button"
                        onClick={() => handleUpdateTheme(scalePreset.values)}
                        className={`px-2.5 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all cursor-pointer ${
                          isScaleActive
                            ? 'sa-glass-pill-active'
                            : 'glass-surface border-transparent text-[var(--subtext)] hover:text-[var(--text)]'
                        }`}
                      >
                        {scalePreset.label}
                      </button>
                    );
                  })}
                </div>
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
                        <div className="w-8 h-8 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center text-[var(--accent)]">
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
              <div className="flex flex-col gap-3.5">
                {/* OS Desktop Passthrough (True Glass) Toggle Banner */}
                {(() => {
                  const isPassthrough =
                    !currentTheme.bgImage &&
                    (currentTheme.bg === 'transparent' || Boolean(currentTheme.transparentWindow));
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        if (isPassthrough) {
                          handleUpdateTheme({
                            transparentWindow: false,
                            bg: '#050914',
                            bgImage: '/themes/architect.png',
                          });
                        } else {
                          handleUpdateTheme({
                            transparentWindow: true,
                            bg: 'transparent',
                            bgImage: '',
                            bgGradient: 'transparent',
                          });
                        }
                      }}
                      className={`glass-panel p-4 rounded-2xl border text-left transition-all flex items-center justify-between gap-4 cursor-pointer relative overflow-hidden ${
                        isPassthrough
                          ? 'sa-glass-pill-active z-10'
                          : 'border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)]'
                      }`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                          <span className="material-symbols-outlined !text-[20px]">
                            {t('icon_flip_to_back', 'flip_to_back')}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-xs font-black text-[var(--text)] leading-snug">
                            {t('forge_wp_desktop_passthrough', 'Desktop Passthrough')}
                          </span>
                          <span className="text-[10px] text-[var(--subtext)] opacity-80 leading-snug">
                            {t(
                              'forge_wp_desktop_passthrough_desc',
                              'Removes the app wallpaper and reveals your OS desktop behind Liquid Glass surfaces.'
                            )}
                          </span>
                        </div>
                      </div>
                      <div
                        className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border shrink-0 flex items-center gap-1.5 ${
                          isPassthrough
                            ? 'sa-glass-pill-active'
                            : 'glass-surface border-transparent text-[var(--subtext)]'
                        }`}
                      >
                        <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                          {isPassthrough
                            ? t('icon_check_circle', 'check_circle')
                            : t('icon_radio_button_unchecked', 'radio_button_unchecked')}
                        </span>
                        <span>{isPassthrough ? t('active', 'Active') : t('disabled', 'Disabled')}</span>
                      </div>
                    </button>
                  );
                })()}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
                  {BUILTIN_WALLPAPERS.map((wp) => {
                    const isPassthrough =
                      !currentTheme.bgImage &&
                      (currentTheme.bg === 'transparent' || Boolean(currentTheme.transparentWindow));
                    const isSelected = !isPassthrough && (currentTheme.bgImage || '') === wp.path;
                    return (
                      <button
                        key={wp.id}
                        type="button"
                        onClick={() =>
                          handleUpdateTheme({
                            bgImage: wp.path || null,
                            transparentWindow: false,
                            ...(currentTheme.bg === 'transparent' ? { bg: '#050914' } : {}),
                          })
                        }
                        className={`group relative h-24 rounded-2xl overflow-hidden border transition-all flex flex-col justify-end p-3 text-left cursor-pointer ${
                          isSelected
                            ? 'sa-glass-pill-active z-10'
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
                          <span className="text-[10px] font-black uppercase tracking-wider text-white leading-snug">
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
              </div>
            </UniversalGroup>

            {/* Section 2: Custom Wallpaper & Nexus Preview Banner Uploads */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="glass-panel p-5 rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)]">
                        {t('forge_wallpaper_engine', 'Custom Desktop Wallpaper')}
                      </span>
                      <span className="px-2 py-0.5 rounded-md glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--accent)] text-[8px] font-black uppercase tracking-wider">
                        {!currentTheme.bgImage && (currentTheme.bg === 'transparent' || currentTheme.transparentWindow)
                          ? t('forge_wp_desktop_passthrough', 'Desktop Passthrough')
                          : String(currentTheme.bgImage || '').startsWith('http')
                            ? t('forge_wp_source_cloud', 'Cloud CDN Wallpaper')
                            : String(currentTheme.bgImage || '').startsWith('data:')
                              ? t('forge_wp_source_embedded', 'Portable WebP Asset')
                              : t('forge_wp_source_builtin', 'Built-In Wallpaper')}
                      </span>
                    </div>
                    <span className="text-[10px] text-[var(--subtext)] opacity-80 leading-snug">
                      {t('forge_bg_upload_desc', 'Auto-compressed to 1080p WebP for real-time glass refraction.')}
                    </span>
                  </div>
                  {currentTheme.bgImage && (
                    <button
                      type="button"
                      onClick={() => handleUpdateTheme({ bgImage: null })}
                      className="px-2.5 py-1 rounded-lg bg-transparent border border-red-500/40 text-red-400 text-[9px] font-black uppercase tracking-widest hover:border-red-400 transition-all cursor-pointer shrink-0"
                    >
                      {t('clear', 'Clear')}
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

                <span className="text-[9px] text-[var(--subtext)] opacity-75 leading-relaxed">
                  {t(
                    'forge_wp_cloud_sync_hint',
                    'Custom wallpapers are automatically compressed as portable WebP in local JSON exports and uploaded to Cloud Storage when published to The {Nexus}.'
                  )}
                </span>
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
                      {t('clear', 'Clear')}
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
                            ? 'sa-glass-pill-active z-10'
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
                              ? 'sa-glass-pill-active'
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
                      <label className="relative w-9 h-9 rounded-xl sa-glass-swatch cursor-pointer">
                        <input
                          type="color"
                          value={bgBuilderColor1}
                          onChange={(e) => {
                            setBgBuilderColor1(e.target.value);
                            applyBgBuilder(bgBuilderType, bgBuilderAngle, e.target.value, bgBuilderColor2);
                          }}
                          className="absolute -inset-2 w-14 h-14 opacity-0 cursor-pointer z-10"
                        />
                        <div className="w-full h-full" style={{ backgroundColor: bgBuilderColor1 }} />
                      </label>
                      {bgBuilderType !== 'solid' && (
                        <>
                          <span className="material-symbols-outlined !text-[15px] text-[var(--subtext)] opacity-60">
                            {t('icon_arrow_forward', 'arrow_forward')}
                          </span>
                          <label className="relative w-9 h-9 rounded-xl sa-glass-swatch cursor-pointer">
                            <input
                              type="color"
                              value={bgBuilderColor2}
                              onChange={(e) => {
                                setBgBuilderColor2(e.target.value);
                                applyBgBuilder(bgBuilderType, bgBuilderAngle, bgBuilderColor1, e.target.value);
                              }}
                              className="absolute -inset-2 w-14 h-14 opacity-0 cursor-pointer z-10"
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
                          className={`sa-glass-toggle ${
                            currentTheme.ambientNoise !== false ? 'is-on' : ''
                          }`}
                        >
                          <div className="sa-glass-toggle-thumb" />
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
                          className={`sa-glass-toggle ${
                            currentTheme.ambientOrb !== false ? 'is-on' : ''
                          }`}
                        >
                          <div className="sa-glass-toggle-thumb" />
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
                          className={`sa-glass-toggle ${
                            Boolean(currentTheme.scanlines) ? 'is-on' : ''
                          }`}
                        >
                          <div className="sa-glass-toggle-thumb" />
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
