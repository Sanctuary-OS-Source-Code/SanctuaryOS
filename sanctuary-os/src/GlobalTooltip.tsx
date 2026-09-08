import React from 'react';
import { createPortal } from 'react-dom';
import { useTooltipStore } from './store/tooltipStore';

export function GlobalTooltip() {
  const tooltip = useTooltipStore((state) => state.tooltip);
  const tooltipRef = React.useRef<HTMLDivElement>(null);
  const [size, setSize] = React.useState({ width: 0, height: 0 });

  React.useLayoutEffect(() => {
    if (tooltipRef.current) {
      const rect = tooltipRef.current.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    }
  }, [tooltip]);

  if (!tooltip) return null;
  if (window.innerWidth < 768) return null;

  const { title, subtitle, variant = 'default', noIcon = false, icon, normalFont = false, x, y, align = 'center', vAlign = 'top', content } = tooltip;

  const isDanger = variant === 'danger';
  const isInfo = variant === 'info';
  const isAccent = variant === 'accent';
  const isWarning = variant === 'warning';

  let borderShadowClass = '';
  let textColorClass = 'text-[var(--text)]';
  let defaultIconName = 'info';

  if (isDanger) {
    borderShadowClass = 'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--danger)_50%,transparent)]';
    textColorClass = 'theme-text-danger';
    defaultIconName = 'error';
  } else if (isInfo) {
    borderShadowClass = 'shadow-[inset_0_0_0_1px_color-mix(in_srgb,#3b82f6_50%,transparent)]';
    textColorClass = 'text-[#3b82f6]';
    defaultIconName = 'info';
  } else if (isAccent) {
    borderShadowClass = 'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_50%,transparent)]';
    textColorClass = 'theme-text-accent';
    defaultIconName = 'star';
  } else if (isWarning) {
    borderShadowClass = 'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--warning)_50%,transparent)]';
    textColorClass = 'text-[var(--warning)]';
    defaultIconName = 'warning';
  }

  const iconName = icon || defaultIconName;

  let finalLeft = x;
  let finalTop = y;

  if (align === 'center') {
    finalLeft -= size.width / 2;
  } else if (align === 'right') {
    finalLeft -= size.width;
  }

  if (vAlign === 'top') {
    finalTop -= size.height;
  }

  // Prevent rendering off-screen (basic padding)
  const padding = 16;
  if (finalLeft < padding) finalLeft = padding;
  if (finalLeft + size.width > window.innerWidth - padding && size.width > 0) {
    finalLeft = window.innerWidth - size.width - padding;
  }

  return createPortal(
    <div className="fixed inset-0 z-[999999] pointer-events-none">
      <div 
        className="absolute pointer-events-none"
        style={{ 
          left: `${finalLeft}px`,
          top: `${finalTop}px`,
          opacity: size.width === 0 ? 0 : 1
        } as React.CSSProperties}
      >
        {content ? (
          <div ref={tooltipRef}>
            {content}
          </div>
        ) : (
          <div 
            ref={tooltipRef}
            className={`glass-panel flex flex-col items-start justify-center px-5 py-4 max-w-[420px] w-max shadow-2xl animate-in fade-in zoom-in-95 !rounded-xl relative overflow-hidden ${borderShadowClass}`}
          >
            {/* Extra Pure Blur Layer (No Solid Colors!) */}
            <div className="absolute inset-0 rounded-[inherit] backdrop-blur-[32px] z-[-1] pointer-events-none" />

            {/* Premium Glass Glare & Light Leaks */}
            <div className="absolute inset-0 rounded-[inherit] bg-radial from-[color-mix(in_srgb,var(--text)_5%,transparent)] to-transparent z-[-1] pointer-events-none" />
            <div className="absolute inset-0 rounded-[inherit] shadow-[inset_0_0_30px_color-mix(in_srgb,var(--text)_2%,transparent)] z-[-1] pointer-events-none" />

            {/* 3D Glass Inner Top Highlight */}
            <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_20%,transparent)] to-transparent opacity-60 pointer-events-none z-0" />
            
            {/* Ultra-faint Noise Texture for Glass Material realism */}
            <div className="absolute inset-0 rounded-[inherit] z-0 opacity-[0.05] mix-blend-overlay pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }} />

            <div className="relative z-10 flex flex-col items-start gap-1.5 w-full">
              <div className={`${normalFont ? 'text-[12px] font-bold' : 'text-[12px] font-black capitalize tracking-[0.15em]'} flex items-start text-left gap-2 whitespace-pre-wrap ${textColorClass}`} style={{ textShadow: '0 2px 4px rgba(0,0,0,0.6)' }}>
                {!noIcon && <span className="material-symbols-outlined !text-[15px] shrink-0 mt-[1px]">{iconName}</span>}
                <span className="break-all" style={{ overflowWrap: 'anywhere' }}>{title}</span>
              </div>
              {subtitle && (
                <span className="text-[12px] font-semibold text-[color-mix(in_srgb,var(--text)_90%,transparent)] text-left whitespace-pre-line mt-0.5 w-full leading-relaxed break-words line-clamp-6" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>{subtitle}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>, document.body
  );
}



