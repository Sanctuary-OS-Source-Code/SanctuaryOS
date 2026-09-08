import React from 'react';

interface GlassPageLayoutProps {
  sidebar?: React.ReactNode;
  children: React.ReactNode;
}

export function GlassPageLayout({ sidebar, children }: GlassPageLayoutProps) {
  return (
    <div className="flex-1 flex flex-row min-h-0 relative w-full h-full">
      {sidebar && (
        <div className="h-full shrink-0 relative z-40 bg-[color-mix(in_srgb,var(--text)_2%,transparent)] backdrop-blur-3xl border-r border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-[10px_0_30px_-15px_rgba(0,0,0,0.2)]">
          {sidebar}
        </div>
      )}
      
      <main className="flex-1 relative overflow-y-auto custom-scrollbar flex flex-col">
        {children}
      </main>
    </div>
  );
}
