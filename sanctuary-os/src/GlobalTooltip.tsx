import React from 'react';
import { createPortal } from 'react-dom';
import { useLexicon } from './LexiconContext';
import { useTooltipStore } from './store/tooltipStore';
export { useTooltipStore };

export function GlobalTooltip() {
  const { t } = useLexicon();
  const tooltip = useTooltipStore((state) => state.tooltip);
  const tooltipRef = React.useRef<HTMLDivElement>(null);
  const [size, setSize] = React.useState({ width: 0, height: 0 });

  const title = tooltip?.title;
  const subtitle = tooltip?.subtitle;
  const variant = tooltip?.variant || 'default';
  const noIcon = tooltip?.noIcon || false;
  const icon = tooltip?.icon;
  const normalFont = tooltip?.normalFont || false;
  const content = tooltip?.content;

  // Measure dimensions ONLY when tooltip content changes (never on x/y mousemove!)
  React.useLayoutEffect(() => {
    if (!tooltip) {
      if (size.width !== 0 || size.height !== 0) {
        setSize({ width: 0, height: 0 });
      }
      return;
    }
    if (tooltipRef.current) {
      const rect = tooltipRef.current.getBoundingClientRect();
      const nextW = Math.round(rect.width);
      const nextH = Math.round(rect.height);
      if (nextW !== size.width || nextH !== size.height) {
        setSize({ width: nextW, height: nextH });
      }
    }
  }, [Boolean(tooltip), title, subtitle, variant, noIcon, icon, normalFont, content]);

  if (!tooltip) return null;
  if (window.innerWidth < 768) return null;

  const { x, y, align = 'center', vAlign = 'top' } = tooltip;

  const isDanger = variant === 'danger';
  const isInfo = variant === 'info';
  const isAccent = variant === 'accent';
  const isWarning = variant === 'warning';

  let variantStyle: React.CSSProperties = {};
  let textColorClass = 'text-[var(--text)]';
  let iconColorClass = 'text-[var(--accent)]';
  let defaultIconName = t('icon_info', 'info');

  if (isDanger) {
    variantStyle = {
      borderColor: 'color-mix(in srgb, var(--danger) 55%, var(--glass-dropdown-border-top, rgba(255,255,255,0.28)))',
    };
    textColorClass = 'theme-text-danger';
    iconColorClass = 'theme-text-danger';
    defaultIconName = t('icon_error', 'error');
  } else if (isInfo) {
    variantStyle = {
      borderColor: 'color-mix(in srgb, #3b82f6 55%, var(--glass-dropdown-border-top, rgba(255,255,255,0.28)))',
    };
    textColorClass = 'text-[#3b82f6]';
    iconColorClass = 'text-[#3b82f6]';
    defaultIconName = t('icon_info', 'info');
  } else if (isAccent) {
    variantStyle = {
      borderColor: 'color-mix(in srgb, var(--accent) 55%, var(--glass-dropdown-border-top, rgba(255,255,255,0.28)))',
    };
    textColorClass = 'text-[var(--text)]';
    iconColorClass = 'theme-text-accent';
    defaultIconName = t('icon_auto_awesome', 'auto_awesome');
  } else if (isWarning) {
    variantStyle = {
      borderColor: 'color-mix(in srgb, var(--warning) 55%, var(--glass-dropdown-border-top, rgba(255,255,255,0.28)))',
    };
    textColorClass = 'text-[var(--warning)]';
    iconColorClass = 'text-[var(--warning)]';
    defaultIconName = t('icon_warning', 'warning');
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
  const padding = 12;
  if (finalLeft < padding) finalLeft = padding;
  if (finalLeft + size.width > window.innerWidth - padding && size.width > 0) {
    finalLeft = window.innerWidth - size.width - padding;
  }
  if (finalTop < padding) finalTop = padding;
  if (finalTop + size.height > window.innerHeight - padding && size.height > 0) {
    finalTop = window.innerHeight - size.height - padding;
  }

  const roundedLeft = Math.round(finalLeft);
  const roundedTop = Math.round(finalTop);

  const portalRoot = document.getElementById('sa-portals') || document.body;

  return createPortal(
    <div id="sa-tooltip-portal" className="fixed inset-0 z-[999999] pointer-events-none">
      <div
        className="absolute top-0 left-0 pointer-events-none will-change-transform"
        style={{
          transform: `translate3d(${roundedLeft}px, ${roundedTop}px, 0)`,
          opacity: size.width === 0 ? 0 : 1,
        } as React.CSSProperties}
      >
        {content ? (
          <div
            ref={tooltipRef}
            style={variantStyle}
            className="sa-tooltip-glass flex flex-col items-start justify-center px-3.5 py-2 max-w-[360px] w-max !rounded-xl relative overflow-hidden"
          >
            <div className="relative z-10 w-full">{content}</div>
          </div>
        ) : (
          <div
            ref={tooltipRef}
            style={variantStyle}
            className="sa-tooltip-glass flex flex-col items-start justify-center px-3.5 py-2 max-w-[360px] w-max !rounded-xl relative overflow-hidden"
          >
            <div className="relative z-10 flex flex-col items-start gap-1 w-full">
              <div className={`${normalFont ? 'text-xs font-semibold' : 'text-[11px] font-bold tracking-wide'} flex items-center text-left gap-2 whitespace-pre-wrap leading-snug ${textColorClass}`}>
                {!noIcon && (
                  <span className={`material-symbols-outlined !text-[15px] shrink-0 ${iconColorClass}`}>
                    {iconName}
                  </span>
                )}
                <span className="break-words">{title}</span>
              </div>
              {subtitle && (
                <span className="text-[11px] font-medium text-[var(--subtext)] text-left whitespace-pre-line w-full leading-relaxed break-words line-clamp-6">
                  {subtitle}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    portalRoot
  );
}
