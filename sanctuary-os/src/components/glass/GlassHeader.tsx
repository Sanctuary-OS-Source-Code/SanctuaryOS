import React from 'react';

interface GlassHeaderProps {
  title: string;
  subtitle?: string;
  icon?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

export function GlassHeader({ title, subtitle, icon, actions, children }: GlassHeaderProps) {
  return (
    <div className="sticky top-0 z-50 w-full mb-6">
      <div className="absolute inset-0 rounded-[inherit] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] backdrop-blur-3xl border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-[0_10px_30px_-15px_rgba(0,0,0,0.2)] pointer-events-none" />
      
      <div className="relative px-8 py-6 flex flex-col md:flex-row md:items-center justify-start gap-4">
        <div className="flex items-center gap-4">
          {icon && (
            <div className="w-12 h-12 rounded-xl bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(var(--accent-rgb),0.1)]">
              <span className="material-symbols-outlined !text-[24px] text-[var(--accent)]">{icon}</span>
            </div>
          )}
          
          <div className="flex flex-col">
            <h1 className="text-[24px] font-black capitalize tracking-[0.1em] text-[var(--text)] leading-tight drop-shadow-sm">
              {title}
            </h1>
            {subtitle && (
              <h2 className="text-[11px] font-bold capitalize tracking-[0.2em] text-[var(--subtext)] opacity-70">
                {subtitle}
              </h2>
            )}
          </div>
        </div>

        {actions && (
          <div className="flex items-center gap-2">
            {actions}
          </div>
        )}
      </div>

      {children && (
        <div className="relative px-8 pb-4">
          {children}
        </div>
      )}
    </div>
  );
}



