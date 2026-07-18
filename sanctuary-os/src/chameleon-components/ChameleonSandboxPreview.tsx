import React from 'react';
import { useLexicon } from '../LexiconContext';
import { HexToRGB } from './ChameleonShared';

interface ChameleonSandboxPreviewProps {
  currentTheme: any;
}

export function ChameleonSandboxPreview({ currentTheme }: ChameleonSandboxPreviewProps) {
  const { t } = useLexicon();

  return (
    <div className="w-[400px] xl:w-[480px] shrink-0 h-full border-l border-[color-mix(in_srgb,var(--text)_5%,transparent)] relative flex flex-col theme-glass-panel !rounded-none overflow-hidden z-0" style={{
      backgroundColor: `color-mix(in srgb, ${currentTheme.bg} 15%, transparent)`,
      '--bg': currentTheme.bg,
      '--text': currentTheme.text,
      '--subtext': currentTheme.subtext,
      '--accent': currentTheme.accent,
      '--accent-rgb': `${HexToRGB(currentTheme.accent).r}, ${HexToRGB(currentTheme.accent).g}, ${HexToRGB(currentTheme.accent).b}`,
      '--sidebar': currentTheme.sidebar,
      '--sidebartext': currentTheme.sidebartext,
      '--success': currentTheme.success,
      '--warning': currentTheme.warning,
      '--danger': currentTheme.danger,
      '--panelTint': currentTheme.panelTint,
      '--headerText': currentTheme.headerText,
      '--radius': currentTheme.radius,
      '--bgGradient': currentTheme.bgGradient || currentTheme.bg,
      fontFamily: currentTheme.fontFamily || 'Inter, sans-serif'
    } as React.CSSProperties}>

      <div className="absolute inset-0 flex z-10">
        {/* Fake Content Area */}
        <div className="flex-1 flex flex-col p-8 gap-10 overflow-y-auto custom-scrollbar pt-10 pb-32">

          {/* Header Section */}
          <div className="flex flex-col gap-3">
            <h1 style={{ fontSize: `${currentTheme.fontSizeHeader || '1.875'}rem`, color: currentTheme.headerText || currentTheme.text, fontWeight: '900', lineHeight: 1.1 }}>
              {t("forge_preview") || "Sandbox"}
            </h1>
            <p style={{ fontSize: `${currentTheme.fontSizeText || '1'}rem`, color: currentTheme.subtext, opacity: 0.8 }}>
              {t("forge_preview_desc") || "Test your typography, glass, and semantic colors live."}
            </p>
          </div>

          {/* Fake Glass Panel */}
          <div className="p-8 flex flex-col gap-4 border" style={{
            backgroundColor: `color-mix(in srgb, ${currentTheme.panelTint || '#ffffff'} ${currentTheme.glassOpacity || '3%'}, transparent)`,
            backdropFilter: `blur(${currentTheme.glassBlur || '16px'})`,
            WebkitBackdropFilter: `blur(${currentTheme.glassBlur || '16px'})`,
            borderRadius: currentTheme.radius || '1.5rem',
            borderColor: `color-mix(in srgb, ${currentTheme.text} 10%, transparent)`,
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
          }}>
            <h2 style={{ fontSize: `${currentTheme.fontSizeTitle || '1.25'}rem`, color: currentTheme.text, fontWeight: '800' }}>
              {t("ui_forge_glass") || "Holographic Glass"}
            </h2>
            <p style={{ fontSize: `${currentTheme.fontSizeSubtext || '0.75'}rem`, color: currentTheme.subtext, lineHeight: 1.5 }}>
              {t("ui_forge_glass_desc") || "This hologram reflects your active structural geometry, optical tint, and plasma blur settings."}
            </p>

            <button className="px-6 py-3 mt-4 w-max text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 border flex items-center justify-center gap-2 group" style={{
              color: currentTheme.accent,
              backgroundColor: `color-mix(in srgb, ${currentTheme.accent} 15%, transparent)`,
              borderColor: `color-mix(in srgb, ${currentTheme.accent} 30%, transparent)`,
              borderRadius: `calc(${currentTheme.radius || '1.5rem'} * 0.5)`,
              boxShadow: `0 10px 30px rgba(0,0,0,0.3)`
            }}>
              <span className="material-symbols-outlined !text-[16px] group-hover:scale-110 transition-transform duration-500">add</span>
              {t("auto_create") || "CREATE"}
            </button>
          </div>

          {/* Semantic Alerts */}
          <div className="flex flex-col gap-4">
            <h3 style={{ fontSize: `${currentTheme.fontSizeSubtitle || '1.125'}rem`, color: currentTheme.text, fontWeight: '700' }}>
              {t("forge_semantic") || "Semantic Colors"}
            </h3>

            {['success', 'warning', 'danger'].map((sem) => (
              <div key={sem} className="p-5 border flex items-center gap-4" style={{
                backgroundColor: `color-mix(in srgb, ${currentTheme[sem]} 10%, transparent)`,
                borderColor: `color-mix(in srgb, ${currentTheme[sem]} 30%, transparent)`,
                borderRadius: `calc(${currentTheme.radius || '1.5rem'} * 0.75)`,
                color: currentTheme[sem],
                boxShadow: `inset 0 0 20px color-mix(in srgb, ${currentTheme[sem]} 5%, transparent)`
              }}>
                <span className="material-symbols-outlined !text-[22px]">
                  {sem === 'success' ? 'check_circle' : sem === 'warning' ? 'warning' : 'error'}
                </span>
                <span className="text-xs font-black uppercase tracking-widest">{t(`color_${sem}`) || sem} Status</span>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
