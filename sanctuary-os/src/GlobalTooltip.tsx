import React from 'react';
import { createPortal } from 'react-dom';
import { useTooltipStore } from './store/tooltipStore';
export { useTooltipStore };

export function GlobalTooltip() {
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

  const portalRoot = document.getElementById("sa-portals") || document.body;

  return createPortal(
    <div className="fixed inset-0 z-[999999] pointer-events-none">
      <div
        className="absolute top-0 left-0 pointer-events-none will-change-transform"
        style={{
          transform: `translate3d(${roundedLeft}px, ${roundedTop}px, 0)`,
          opacity: size.width === 0 ? 0 : 1,
        } as React.CSSProperties}
      >
        {content ? (
          <div ref={tooltipRef}>
            {content}
          </div>
        ) : (
          <div
            ref={tooltipRef}
            style={{
              "--glass-x": `${roundedLeft}px`,
              "--glass-y": `${roundedTop}px`,
            } as React.CSSProperties}
            className={`glass-panel portal-glass-fix flex flex-col items-start justify-center px-3.5 py-2.5 max-w-[380px] w-max border border-[rgba(var(--text-rgb,255,255,255),0.16)] !rounded-xl relative overflow-hidden ${borderShadowClass}`}
          >
            {/* Subtle top specular highlight */}
            <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_24%,transparent)] to-transparent opacity-80 pointer-events-none z-0" />

            <div className="relative z-10 flex flex-col items-start gap-1 w-full">
              <div className={`${normalFont ? 'text-xs font-semibold' : 'text-xs font-bold capitalize tracking-wide'} flex items-start text-left gap-2 whitespace-pre-wrap leading-snug ${textColorClass}`}>
                {!noIcon && (
                  <span className="material-symbols-outlined !text-[15px] shrink-0 mt-[1px] opacity-90">
                    {iconName}
                  </span>
                )}
                <span className="break-words">{title}</span>
              </div>
              {subtitle && (
                <span className="text-[11px] font-medium text-[color-mix(in_srgb,var(--text)_82%,transparent)] text-left whitespace-pre-line w-full leading-relaxed break-words line-clamp-6">
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
