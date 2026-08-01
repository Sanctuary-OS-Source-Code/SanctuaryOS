import React from 'react';
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
    borderColorClass = 'border-[var(--danger)]/30';
    textColorClass = 'theme-text-danger';
    defaultIconName = 'error';
  } else if (isInfo) {
    borderColorClass = 'border-[#3b82f6]/30';
    textColorClass = 'text-[#3b82f6]';
    defaultIconName = 'info';
  } else if (isAccent) {
    borderColorClass = 'border-[var(--accent)]/30';
    textColorClass = 'theme-text-accent';
    defaultIconName = 'star';
  } else if (isWarning) {
    borderColorClass = 'border-[var(--warning)]/30';
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

  return (
    <div className="fixed inset-0 z-[99999] pointer-events-none">
      <div 
        className="absolute pointer-events-none transition-all duration-200"
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
            className={`flex flex-col items-start justify-center theme-glass-panel px-5 py-3 max-w-[320px] w-max border ${borderColorClass} shadow-[0_30px_80px_rgba(0,0,0,0.5)] animate-in fade-in zoom-in-95 rounded-xl`}
            style={{ 
              '--glassBlur': '30px',
              '--panelTint': 'var(--text)',
              '--glassOpacity': '15%'
            } as React.CSSProperties}
          >
            <div className="relative z-10 flex flex-col items-start gap-1 w-full">
              <div className={`${normalFont ? 'text-[11px] font-bold' : 'text-[10px] font-black uppercase tracking-[0.2em]'} flex items-start text-left gap-2 whitespace-pre-line drop-shadow-sm ${textColorClass}`}>
                {!noIcon && <span className="material-symbols-outlined !text-[14px] shrink-0 mt-[1px]">{iconName}</span>}
                <span>{title}</span>
              </div>
              {subtitle && (
                <span className="text-[10px] font-bold text-[var(--subtext)] text-left whitespace-pre-line mt-0.5 w-full leading-relaxed drop-shadow-sm">{subtitle}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
