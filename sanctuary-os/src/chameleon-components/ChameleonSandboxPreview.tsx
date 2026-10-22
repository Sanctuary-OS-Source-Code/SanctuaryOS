import React from 'react';
import { useLexicon } from '../LexiconContext';
import { computeGlassOpticalVars } from '../ThemeContext';

interface ChameleonSandboxPreviewProps {
  currentTheme: any;
}

export function ChameleonSandboxPreview({ currentTheme }: ChameleonSandboxPreviewProps) {
  const { t } = useLexicon();
  const opticalVars = computeGlassOpticalVars(currentTheme);

  return (
    <div
      className="w-[400px] xl:w-[480px] shrink-0 h-full border-l border-[color-mix(in_srgb,var(--text)_8%,transparent)] relative flex flex-col !rounded-none z-0 overflow-hidden"
      style={{
        '--bg': currentTheme.bg,
        '--text': currentTheme.text,
        '--subtext': currentTheme.subtext,
        '--accent': currentTheme.accent,
        '--sidebar': currentTheme.sidebar,
        '--sidebartext': currentTheme.sidebartext,
        '--success': currentTheme.success,
        '--warning': currentTheme.warning,
        '--danger': currentTheme.danger,
        '--panelTint': currentTheme.panelTint,
        '--headerText': currentTheme.headerText,
        '--radius': currentTheme.radius || '1.25rem',
        '--glassBlur': currentTheme.glassBlur || '36px',
        '--bgGradient': currentTheme.bgGradient && currentTheme.bgGradient !== 'transparent' ? currentTheme.bgGradient : currentTheme.bg,
        ...opticalVars,
        backgroundColor: currentTheme.bg || '#05070c',
        fontFamily: currentTheme.fontFamily || 'Inter, sans-serif'
      } as React.CSSProperties}
    >
      {/* Live Background Engine */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden rounded-[inherit]">
        {currentTheme.bgImage ? (
          <div
            className="absolute inset-0 rounded-[inherit] w-full h-full opacity-100 transition-all duration-1000"
            style={{
              backgroundImage: `url("${currentTheme.bgImage}")`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat'
            }}
          />
        ) : (
          <div
            className="absolute inset-0 rounded-[inherit] w-full h-full opacity-100 transition-all duration-1000"
            style={{ background: 'var(--bgGradient)' }}
          />
        )}

        {currentTheme.ambientOrb !== false && currentTheme.volumetricOrbs && currentTheme.volumetricOrbs.length > 0 ? (
          <div className="absolute inset-0 rounded-[inherit] w-full h-full">
            {currentTheme.volumetricOrbs.map((orb: any, index: number) => (
              <div
                key={`${currentTheme.name || 'theme'}-${index}`}
                className={`absolute rounded-full pointer-events-none ${orb.blendMode || 'mix-blend-screen'}`}
                style={{
                  backgroundColor: orb.color,
                  top: orb.top, left: orb.left, width: orb.width || '120vw', height: orb.height || '120vh',
                  filter: `blur(${orb.blur})`, opacity: orb.opacity || 0.5,
                  animation: currentTheme.animated !== false ? `${orb.animation || 'ambient-drift'} ${orb.duration || '60s'} ease-in-out infinite alternate` : 'none'
                }}
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="relative z-10 flex-1 flex flex-col p-8 gap-7 overflow-y-auto custom-scrollbar pt-8 pb-28">
        {/* Simulated Floating Chrome Capsule */}
        <div className="flex items-center justify-between">
          <div className="glass-panel portal-glass-fix !rounded-full px-4 h-9 flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" />
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text)]">
              {t("forge_preview_pill_label", "Liquid Glass Active")}
            </span>
          </div>
          <div className="glass-panel portal-glass-fix !rounded-full px-3 h-9 flex items-center gap-2">
            <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--subtext)]">
              {t("forge_preview_stat_label", "Optical Index")}
            </span>
            <span className="text-[10px] font-black font-mono text-[var(--accent)]">
              {t("forge_preview_stat_val", "99.8%")}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h1 style={{ fontSize: currentTheme.fontSizeHeader || '1.875rem', color: currentTheme.headerText || currentTheme.text, fontWeight: '900', lineHeight: 1.1 }}>
            {t("forge_preview", "Live Sandbox")}
          </h1>
          <p style={{ fontSize: currentTheme.fontSizeText || '1rem', color: currentTheme.subtext, opacity: 0.85 }}>
            {t("forge_preview_desc", "Real-time optical refraction, specular rim highlights, and elevation preview.")}
          </p>
        </div>

        {/* Real Liquid Glass Panel + Nested Glass Surface */}
        <div className="glass-panel p-7 flex flex-col gap-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <h2 style={{ fontSize: currentTheme.fontSizeTitle || '1.25rem', color: currentTheme.text, fontWeight: '800' }}>
                {t("ui_forge_glass", "Liquid Glass Surface")}
              </h2>
              <p style={{ fontSize: currentTheme.fontSizeSubtext || '0.75rem', color: currentTheme.subtext, lineHeight: 1.5 }}>
                {t("ui_forge_glass_desc", "Engineered with directional specular rims and true GPU backdrop saturation.")}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl glass-surface flex items-center justify-center shrink-0 text-[var(--accent)]">
              <span className="material-symbols-outlined !text-[20px]">blur_on</span>
            </div>
          </div>

          <div className="glass-surface p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">auto_awesome</span>
              <span className="text-[11px] font-bold text-[var(--text)]">
                {t("forge_section_optics", "Liquid Glass Optics")}
              </span>
            </div>
            <button
              type="button"
              className="px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 border flex items-center justify-center gap-1.5 rounded-xl"
              style={{
                color: currentTheme.accent,
                backgroundColor: `color-mix(in srgb, ${currentTheme.accent} 14%, transparent)`,
                borderColor: `color-mix(in srgb, ${currentTheme.accent} 38%, transparent)`,
                boxShadow: `0 8px 20px -4px rgba(0,0,0,0.28)`
              }}
            >
              <span className="material-symbols-outlined !text-[14px]">add</span>
              {t("auto_create", "Create")}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h3 style={{ fontSize: currentTheme.fontSizeSubtitle || '1.125rem', color: currentTheme.text, fontWeight: '700' }}>
            {t("forge_semantic", "Semantic Indicators")}
          </h3>

          {['success', 'warning', 'danger'].map((sem) => (
            <div
              key={sem}
              className="glass-surface p-4 flex items-center gap-3.5"
              style={{
                backgroundColor: `color-mix(in srgb, ${currentTheme[sem]} 10%, transparent)`,
                borderColor: `color-mix(in srgb, ${currentTheme[sem]} 32%, transparent)`,
                color: currentTheme[sem]
              }}
            >
              <span className="material-symbols-outlined !text-[20px]">
                {sem === 'success' ? 'check_circle' : sem === 'warning' ? 'warning' : 'error'}
              </span>
              <span className="text-[11px] font-black uppercase tracking-widest">
                {t(`color_${sem}`, sem)} {t("ui_status", "Status")}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

