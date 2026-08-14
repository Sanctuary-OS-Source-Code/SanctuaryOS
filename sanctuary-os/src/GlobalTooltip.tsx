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

  const { title, subtitle, variant = 'default', noIcon = false, icon, normalFont = false, x, y, align = 'center', vAlign = 'top', content } = tooltip;

  const isDanger = variant === 'danger';
  const isInfo = variant === 'info';
  const isAccent = variant === 'accent';
  const isWarning = variant === 'warning';

  let borderColorClass = 'border-[color-mix(in_srgb,var(--text)_10%,transparent)]';
  let textColorClass = 'text-[var(--text)]';
  let defaultIconName = 'info';

  if (isDanger) {
    borderColorClass = 'border-[color-mix(in_srgb,var(--danger)_30%,transparent)]';
    textColorClass = 'theme-text-danger';
    defaultIconName = 'error';
  } else if (isInfo) {
    borderColorClass = 'border-[#3b82f6]/30';
    textColorClass = 'text-[#3b82f6]';
    defaultIconName = 'info';
  } else if (isAccent) {
    borderColorClass = 'border-[color-mix(in_srgb,var(--accent)_30%,transparent)]';
    textColorClass = 'theme-text-accent';
    defaultIconName = 'star';
  } else if (isWarning) {
    borderColorClass = 'border-[color-mix(in_srgb,var(--warning)_30%,transparent)]';
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
            className={`flex flex-col items-start justify-center px-5 py-3 max-w-[320px] w-max border ${borderColorClass} shadow-2xl animate-in fade-in zoom-in-95 rounded-xl relative overflow-hidden bg-[color-mix(in_srgb,var(--text)_5%,transparent)]`}
          >
            {/* 3D Glass Inner Top Highlight */}
            <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_20%,transparent)] to-transparent opacity-60 pointer-events-none z-0" />
            
            {/* Ultra-faint Noise Texture for Glass Material realism */}
            <div className="absolute inset-0 z-0 opacity-[0.05] mix-blend-overlay pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }} />

            <div className="relative z-10 flex flex-col items-start gap-1 w-full">
              <div className={`${normalFont ? 'text-[11px] font-bold' : 'text-[10px] font-black capitalize tracking-[0.2em]'} flex items-start text-left gap-2 whitespace-pre-line ${textColorClass}`}>
                {!noIcon && <span className="material-symbols-outlined !text-[14px] shrink-0 mt-[1px]">{iconName}</span>}
                <span className="break-all">{title}</span>
              </div>
              {subtitle && (
                <span className="text-[10px] font-bold text-[var(--subtext)] text-left whitespace-pre-line mt-0.5 w-full leading-relaxed break-all">{subtitle}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>, document.body
  );
}
