import React from 'react';
import { useLexicon } from "../LexiconContext";

export function IngestProgressModal({ ingestProgress }: any) {
  const { t } = useLexicon();
  if (!ingestProgress?.active) return null;

  return (
    <div className="fixed bottom-14 right-6 z-[15000] w-72 theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] p-3 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-5 fade-in duration-300 pointer-events-none flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-[var(--accent)] text-lg animate-pulse">{t("icon_cloud")}</span>
          <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text)]">{t("overlay_uplink_title")}</span>
        </div>
        <span className="text-[9px] font-mono font-bold theme-text-accent">{Math.round(((ingestProgress?.current || 0) / (ingestProgress?.total || 1)) * 100)}%</span>
      </div>
      <div className="w-full h-1 bg-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-full overflow-hidden">
        <div className="h-full theme-bg-accent transition-all duration-300 relative shadow-[0_0_10px_rgba(var(--accent-rgb),0.8)]" style={{ width: `${((ingestProgress?.current || 0) / (ingestProgress?.total || 1)) * 100}%` }}>
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent w-[200%] animate-pulse" />
        </div>
      </div>
    </div>
  );
}
