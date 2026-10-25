import React, { useEffect, useState } from 'react';
import { useLexicon } from '../LexiconContext';
import { computeGlassOpticalVars, generateRefractedWallpaperDataUrl } from '../ThemeContext';
import { DynamicThemePreviewBanner } from './ThemeCard';

interface ChameleonSandboxPreviewProps {
  currentTheme: any;
}

export function ChameleonSandboxPreview({ currentTheme }: ChameleonSandboxPreviewProps) {
  const { t } = useLexicon();
  const opticalVars = computeGlassOpticalVars(currentTheme);
  const [refractedUrl, setRefractedUrl] = useState<string>('none');

  useEffect(() => {
    let cancelled = false;
    const rawBgImg = currentTheme.bgImage ? String(currentTheme.bgImage).trim() : '';
    const rawBlurPx = Math.max(0, Math.min(64, parseFloat(String(currentTheme.glassBlur || '34')) || 34));
    const rawSatPct = Math.max(80, Math.min(260, parseFloat(String(currentTheme.glassSaturation || '195')) || 195));

    if (!rawBgImg || rawBgImg === 'none') {
      setRefractedUrl('none');
      return;
    }

    generateRefractedWallpaperDataUrl(
      rawBgImg,
      rawBlurPx,
      `${rawSatPct}%`,
      currentTheme.bg || '#060b14',
      480,
      900
    ).then((cssUrl) => {
      if (!cancelled) {
        setRefractedUrl(cssUrl || `url("${rawBgImg}")`);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [currentTheme.bgImage, currentTheme.glassBlur, currentTheme.glassSaturation, currentTheme.bg]);

  const resolvedRefractedLayer =
    refractedUrl && refractedUrl !== 'none'
      ? refractedUrl
      : currentTheme.bgGradient && currentTheme.bgGradient !== 'transparent' && currentTheme.bgGradient !== 'none'
        ? currentTheme.bgGradient
        : 'none';

  // Scoped inline 3D Liquid Glass styles so parent `.sa-side-panel-window .glass-panel` CSS rules never override live Sandbox optics
  const panelGlassStyle: React.CSSProperties = {
    borderRadius: currentTheme.radius || '1.25rem',
    borderStyle: 'solid',
    borderWidth: '1px',
    borderTopColor: opticalVars['--glass-border-top'],
    borderLeftColor: opticalVars['--glass-border-left'],
    borderRightColor: opticalVars['--glass-border-right'],
    borderBottomColor: opticalVars['--glass-border-bottom'],
    backgroundColor: opticalVars['--glass-base-fill'],
    backgroundImage: `${opticalVars['--glass-meniscus-top']}, ${opticalVars['--glass-sheen']}, linear-gradient(0deg, ${opticalVars['--glass-base-fill']}, ${opticalVars['--glass-base-fill']}), ${resolvedRefractedLayer}`,
    backgroundSize: '100% 100%, 100% 100%, 100% 100%, 135% 135%',
    backgroundPosition: '0 0, 0 0, 0 0, center center',
    backgroundRepeat: 'no-repeat, no-repeat, no-repeat, no-repeat',
    boxShadow: `${opticalVars['--glass-outer-shadow']}, ${opticalVars['--glass-inset-highlight']}`,
  };

  const surfaceGlassStyle: React.CSSProperties = {
    borderRadius: `max(0px, calc((${currentTheme.radius || '1.25rem'}) * 0.65))`,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderTopColor: opticalVars['--glass-border-top'],
    borderLeftColor: opticalVars['--glass-border-left'],
    borderRightColor: opticalVars['--glass-surface-border'],
    borderBottomColor: opticalVars['--glass-surface-border'],
    backgroundColor: opticalVars['--glass-surface-fill'],
    backgroundImage: `${opticalVars['--glass-surface-sheen']}, linear-gradient(0deg, ${opticalVars['--glass-surface-fill']}, ${opticalVars['--glass-surface-fill']}), ${resolvedRefractedLayer}`,
    backgroundSize: '100% 100%, 100% 100%, 135% 135%',
    backgroundPosition: '0 0, 0 0, center center',
    backgroundRepeat: 'no-repeat, no-repeat, no-repeat',
    boxShadow: `${opticalVars['--glass-surface-outer-shadow']}, ${opticalVars['--glass-surface-inset-highlight']}`,
  };

  const pillGlassStyle: React.CSSProperties = {
    ...panelGlassStyle,
    borderRadius: `max(0px, calc((${currentTheme.radius || '1.25rem'}) * 0.65))`,
  };

  const rawOpacityVal = parseFloat(String(currentTheme.glassOpacity || '0.34'));
  const displayOpacityPct = rawOpacityVal <= 1 ? Math.round(rawOpacityVal * 100) : Math.round(rawOpacityVal);

  return (
    <div
      className="w-full lg:w-[440px] xl:w-[490px] shrink-0 h-full border-l border-[color-mix(in_srgb,var(--text)_8%,transparent)] relative flex flex-col !rounded-none z-0 overflow-hidden"
      style={{
        '--bg': currentTheme.bg,
        '--text': currentTheme.text,
        '--subtext': currentTheme.subtext,
        '--accent': currentTheme.accent,
        '--sidebar': currentTheme.sidebar,
        '--sidebartext': currentTheme.sidebartext,
        '--success': currentTheme.success || '#10b981',
        '--warning': currentTheme.warning || '#f59e0b',
        '--danger': currentTheme.danger || '#f43f5e',
        '--panelTint': currentTheme.panelTint || currentTheme.sidebar,
        '--headerText': currentTheme.headerText || currentTheme.text,
        '--radius': currentTheme.radius || '1.25rem',
        '--glassBlur': currentTheme.glassBlur || '34px',
        '--bgGradient':
          currentTheme.bgGradient && currentTheme.bgGradient !== 'transparent'
            ? currentTheme.bgGradient
            : currentTheme.bg,
        ...opticalVars,
        backgroundColor: currentTheme.bg || '#060b14',
        fontFamily: currentTheme.fontFamily || 'Inter, sans-serif'
      } as React.CSSProperties}
    >
      {/* Live Background Engine */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        {currentTheme.bgImage ? (
          <div
            className="absolute inset-0 w-full h-full opacity-100 transition-all duration-500"
            style={{
              backgroundImage: `url("${currentTheme.bgImage}")`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat'
            }}
          />
        ) : (
          <div
            className="absolute inset-0 w-full h-full opacity-100 transition-all duration-500"
            style={{ background: 'var(--bgGradient)' }}
          />
        )}
      </div>

      <div className="relative z-10 flex-1 flex flex-col p-6 gap-4 overflow-y-auto custom-scrollbar pb-28">
        {/* Top Floating 2-Pill Bar Preview */}
        <div className="flex items-center justify-between gap-2">
          <div style={pillGlassStyle} className="px-3.5 h-8 flex items-center gap-2 shrink-0">
            <span className="w-2 h-2 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" />
            <span className="text-[9px] font-black uppercase tracking-[0.16em] text-[var(--text)]">
              {t('forge_preview_pill_label', 'Liquid Glass Active')}
            </span>
          </div>
          <div style={pillGlassStyle} className="px-3 h-8 flex items-center gap-2 shrink-0">
            <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--subtext)]">
              {`${displayOpacityPct}% · ${currentTheme.glassBlur || '34px'}`}
            </span>
            <span className="text-[9px] font-black font-mono text-[var(--accent)]">
              {currentTheme.glassSaturation || '195%'}
            </span>
          </div>
        </div>

        {/* Live Header Specimen */}
        <div className="flex flex-col gap-1 pt-1">
          <h1
            className="truncate"
            style={{
              fontSize: currentTheme.fontSizeHeader || '1.75rem',
              color: currentTheme.headerText || currentTheme.text,
              fontWeight: 900,
              lineHeight: 1.15
            }}
          >
            {currentTheme.name || t('forge_preview', 'Live Sandbox')}
          </h1>
          <p style={{ fontSize: currentTheme.fontSizeSubtext || '0.75rem', color: currentTheme.subtext, opacity: 0.9 }}>
            {t('forge_preview_desc', 'Real-time 3D optical refraction, specular rim highlights, and elevation preview.')}
          </p>
        </div>

        {/* Row 1: 2-Up Stat Tile Specimen */}
        <div className="grid grid-cols-2 gap-3">
          <div style={panelGlassStyle} className="p-3.5 flex items-center gap-3 overflow-hidden">
            <div style={surfaceGlassStyle} className="w-9 h-9 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined !text-[18px] text-[var(--text)]">
                {t('icon_account_balance', 'account_balance')}
              </span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[8px] font-black uppercase tracking-widest text-[var(--subtext)] truncate">
                {t('nav_vault', 'Your Vault')}
              </span>
              <span className="text-lg font-black text-[var(--text)] leading-tight">3,074</span>
            </div>
          </div>

          <div style={panelGlassStyle} className="p-3.5 flex items-center gap-3 overflow-hidden">
            <div style={surfaceGlassStyle} className="w-9 h-9 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">
                {t('icon_hub', 'hub')}
              </span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[8px] font-black uppercase tracking-widest text-[var(--subtext)] truncate">
                {t('nav_nexus', 'The Nexus')}
              </span>
              <span className="text-lg font-black text-[var(--accent)] leading-tight">2,990</span>
            </div>
          </div>
        </div>

        {/* Row 2: Full-Width Interactive Glass Card Specimen */}
        <div style={panelGlassStyle} className="p-4 flex flex-col gap-3.5 overflow-hidden">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div style={surfaceGlassStyle} className="w-10 h-10 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined !text-[20px] text-[var(--accent)]">
                  {t('icon_blur_on', 'blur_on')}
                </span>
              </div>
              <div className="flex flex-col min-w-0">
                <span
                  className="font-bold text-[var(--text)] truncate"
                  style={{ fontSize: currentTheme.fontSizeText || '0.95rem' }}
                >
                  {t('ui_forge_glass', 'Liquid Glass Surface')}
                </span>
                <span className="text-[10px] text-[var(--subtext)] line-clamp-1 leading-relaxed">
                  {t('ui_forge_glass_desc', 'Refractive backdrop saturation & specular rim lighting.')}
                </span>
              </div>
            </div>
            <span
              className="px-2.5 py-1 rounded-lg bg-transparent border text-[9px] font-black uppercase tracking-wider shrink-0 flex items-center gap-1"
              style={{
                color: currentTheme.success || '#10b981',
                borderColor: `color-mix(in srgb, ${currentTheme.success || '#10b981'} 45%, transparent)`
              }}
            >
              <span className="material-symbols-outlined !text-[12px]">
                {t('icon_check_circle', 'check_circle')}
              </span>
              {t('synced_badge', 'Synced')}
            </span>
          </div>

          <div style={surfaceGlassStyle} className="px-3.5 py-2.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                {t('icon_auto_awesome', 'auto_awesome')}
              </span>
              <span className="text-[10px] font-bold text-[var(--subtext)] truncate">
                {t('forge_section_optics', 'Liquid Glass Optics')}
              </span>
            </div>
            <span
              className="px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border shrink-0"
              style={{
                color: currentTheme.accent,
                backgroundColor: `color-mix(in srgb, ${currentTheme.accent} 15%, transparent)`,
                borderColor: `color-mix(in srgb, ${currentTheme.accent} 40%, transparent)`
              }}
            >
              {t('active_badge', 'Active')}
            </span>
          </div>
        </div>

        {/* Row 3: Simulated Navigation Bar & Quick Launch Specimen */}
        <div
          style={{
            ...panelGlassStyle,
            backgroundColor: opticalVars['--glass-sidebar-bg'],
            boxShadow: opticalVars['--glass-sidebar-shadow'],
          }}
          className="p-3 flex items-center justify-between gap-2 overflow-hidden"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="px-3 py-2 rounded-xl flex items-center gap-2 border shrink-0"
              style={{
                background: `linear-gradient(135deg, color-mix(in srgb, ${currentTheme.accent} 22%, rgba(255,255,255,0.08)) 0%, color-mix(in srgb, ${currentTheme.accent} 8%, transparent) 100%)`,
                borderColor: `color-mix(in srgb, ${currentTheme.accent} 48%, rgba(255,255,255,0.22))`,
                boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.28), 0 6px 14px -4px rgba(0,0,0,0.4)'
              }}
            >
              <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                {t('icon_space_dashboard', 'space_dashboard')}
              </span>
              <span className="text-[9px] font-black tracking-wide text-[var(--text)]">
                {t('nav_dashboard', 'Command Center')}
              </span>
            </div>

            <div className="px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 opacity-75 min-w-0">
              <span className="material-symbols-outlined !text-[15px] text-[var(--sidebartext)]">
                {t('icon_account_balance', 'account_balance')}
              </span>
              <span className="text-[9px] font-bold text-[var(--sidebartext)] truncate">
                {t('nav_vault', 'Your Vault')}
              </span>
            </div>
          </div>

          <div
            className="px-3 py-2 rounded-xl border flex items-center justify-center gap-1.5 shrink-0"
            style={{
              borderColor: `color-mix(in srgb, ${currentTheme.success || '#10b981'} 45%, transparent)`,
              backgroundColor: `color-mix(in srgb, ${currentTheme.success || '#10b981'} 14%, transparent)`,
              color: currentTheme.success || '#10b981'
            }}
          >
            <span className="material-symbols-outlined !text-[13px]">
              {t('icon_rocket_launch', 'rocket_launch')}
            </span>
            <span className="text-[8px] font-black uppercase tracking-widest">
              {t('quick_launch', 'Quick Launch')}
            </span>
          </div>
        </div>

        {/* Row 4: Live Dynamic Nexus Preview Card Specimen */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
              {t('chameleon_dynamic_preview_badge', 'Nexus Card Preview')}
            </span>
            <span className="text-[9px] font-mono text-[var(--accent)]">
              {currentTheme.previewImage
                ? t('forge_preview_custom_mode', 'Custom Banner')
                : t('forge_preview_dynamic_mode', 'Auto-Generated')}
            </span>
          </div>
          <div className="rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_14%,transparent)] shadow-xl">
            <DynamicThemePreviewBanner data={currentTheme} heightClass="h-32" />
          </div>
        </div>

        {/* Row 5: Semantic Status Badges (Transparent Background per Sanctuary Design Rules) */}
        <div className="flex flex-col gap-2">
          <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
            {t('forge_semantic', 'Semantic Status Badges')}
          </span>
          <div className="grid grid-cols-3 gap-2.5">
            {(['success', 'warning', 'danger'] as const).map((sem) => (
              <div
                key={sem}
                className="px-3 py-2 rounded-xl bg-transparent border flex items-center justify-center gap-1.5"
                style={{
                  borderColor: `color-mix(in srgb, ${currentTheme[sem]} 45%, transparent)`,
                  color: currentTheme[sem]
                }}
              >
                <span className="material-symbols-outlined !text-[14px]">
                  {sem === 'success'
                    ? t('icon_check_circle', 'check_circle')
                    : sem === 'warning'
                    ? t('icon_warning', 'warning')
                    : t('icon_error', 'error')}
                </span>
                <span className="text-[9px] font-black uppercase tracking-wider truncate">
                  {t(`color_${sem}`, sem)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
