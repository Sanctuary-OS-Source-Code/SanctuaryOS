import React from 'react';
import { useStore } from './store';

export function StatusBar() {
  const status = useStore((state) => state.status);

  return (
    <div className="absolute bottom-0 left-[var(--sidebar-width)] right-0 h-10 bg-[var(--surface-sunken)] border-t border-[var(--border)] flex items-center px-4 justify-between z-40 transition-all duration-300 pointer-events-none">
      <div className="flex items-center gap-3 w-1/3">
        <span className={`text-sm tracking-wide truncate ${status?.includes("FAIL") || status?.includes("ERROR") || status?.includes("EXCEPTION") || status?.includes("FAILED") ? 'text-red-400' : 'text-[var(--text-muted)]'}`}>
          {status}
        </span>
      </div>
    </div>
  );
}
