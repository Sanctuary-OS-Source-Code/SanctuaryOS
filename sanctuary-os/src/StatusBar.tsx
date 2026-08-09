import React from 'react';
import { useStore } from './store';

export function StatusBar() {
  const status = useStore((state) => state.status);

  return (
    <div className="absolute bottom-4 left-[calc(var(--sidebar-width)+1.5rem)] right-6 h-12 flex items-center px-6 justify-between z-40 transition-all duration-300 pointer-events-none shadow-lg"
         style={{
           borderRadius: '9999px',
           background: 'color-mix(in srgb, var(--panelTint) 15%, transparent)',
           backdropFilter: 'blur(16px)',
           WebkitBackdropFilter: 'blur(16px)',
           border: '1px solid color-mix(in srgb, var(--text) 10%, transparent)'
         }}>
      <div className="flex items-center gap-3 w-1/2">
        <span className={`text-sm font-medium tracking-wide truncate ${status?.includes("FAIL") || status?.includes("ERROR") || status?.includes("EXCEPTION") || status?.includes("FAILED") ? 'text-red-400' : 'text-[var(--text)]'}`}>
          {status}
        </span>
      </div>
    </div>
  );
}
