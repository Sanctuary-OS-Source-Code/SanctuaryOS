import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useLexicon } from './LexiconContext';
import { EmptyState } from './shared';

export function HeuristicsReadOnlyList({ onEditClick, search }: { onEditClick: (sig: any) => void, search: string }) {
  const { t } = useLexicon();
  const [signatures, setSignatures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const config = await invoke<any>('get_saved_coordinates');
      const sigs = await invoke<any[]>('get_heuristic_signatures', { vaultPath: config.vault_path });
      setSignatures(sigs);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const handleRefresh = () => load();
    window.addEventListener('force-heuristics-refresh', handleRefresh);
    return () => window.removeEventListener('force-heuristics-refresh', handleRefresh);
  }, []);

  const filteredSignatures = signatures.filter(sig => 
    !search || 
    sig.signature?.toLowerCase().includes(search.toLowerCase()) || 
    sig.match_type?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-6">
      {loading ? (
        <div className="theme-glass-panel p-8 rounded-[var(--radius)] text-center text-sm font-bold text-[var(--subtext)] uppercase tracking-widest animate-pulse">{t("auto_loading_signatures")}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredSignatures.map(sig => {
            const isMalware = sig.severity === 'malware';
            const isExplicit = sig.severity === 'explicit';
            const sColor = isMalware ? 'text-red-500' : isExplicit ? 'text-[#fbbf24]' : 'text-[#3b82f6]';
            const sBorder = isMalware ? 'border-red-500' : isExplicit ? 'border-[#fbbf24]' : 'border-[#3b82f6]';
            const sBg = isMalware ? 'from-red-500/10' : isExplicit ? 'from-[#fbbf24]/10' : 'from-[#3b82f6]/10';
            const sLine = isMalware ? 'bg-red-500/50 group-hover:bg-red-500' : isExplicit ? 'bg-[#fbbf24]/50 group-hover:bg-[#fbbf24]' : 'bg-[#3b82f6]/50 group-hover:bg-[#3b82f6]';

            return (
              <div 
                key={sig.id} 
                onClick={() => onEditClick(sig)}
                className={`theme-glass-panel rounded-[var(--radius)] flex flex-col group border transition-all duration-500 relative overflow-hidden bg-gradient-to-br from-white/5 to-transparent min-h-[160px] border-white/5 hover:${sBorder}/50 hover:shadow-[0_0_40px_rgba(0,0,0,0.2)] cursor-pointer ${!sig.enabled ? 'opacity-50 grayscale' : ''}`}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${sBg} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`} />
                
                <div className={`absolute top-0 left-0 w-full h-1 transition-all duration-500 ${sLine}`} />
                
                <div className="p-6 flex flex-col gap-4 flex-1 relative z-10">
                  <div className="flex justify-between items-start gap-4">
                    <div className={`w-12 h-12 rounded-[1rem] flex items-center justify-center shrink-0 border transition-all duration-500 shadow-inner border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] group-hover:${sBorder}/30`}>
                        <span className={`material-symbols-outlined !text-[24px] opacity-50 group-hover:opacity-100 transition-colors duration-500 ${sColor}`}>
                            {t("icon_bug_report")}
                        </span>
                    </div>
                    <span className={`px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest uppercase border shadow-inner shrink-0 transition-colors bg-white/5 text-[var(--subtext)] border-white/10 group-hover:${sBorder}/30 group-hover:${sColor}`}>
                        {sig.severity}
                    </span>
                  </div>
                  
                  <div className="flex flex-col gap-1 mt-auto pt-2">
                      <span className={`text-lg font-mono opacity-80 font-bold truncate leading-tight transition-colors ${sColor} group-hover:opacity-100`}>
                        {sig.signature}
                      </span>
                      <span className="text-[10px] font-mono text-[var(--subtext)] opacity-60 flex gap-1.5 items-center truncate">
                          <span className="material-symbols-outlined !text-[12px] opacity-70">{t("icon_account_tree")}</span>
                          {sig.match_type}
                      </span>
                  </div>
                  
                  <div className="flex flex-col gap-1 mt-1 border-t border-white/5 pt-3">
                     <span className="text-[10px] font-bold uppercase flex justify-between items-center w-full text-[var(--subtext)] opacity-80">
                       <span className="flex items-center gap-1.5 truncate">
                         <span className="material-symbols-outlined !text-[12px] opacity-70">{t("icon_shield")}</span>
                         {sig.enabled ? (t("comp_enabled")) : (t("comp_disabled"))}
                       </span>
                     </span>
                  </div>
                </div>
              </div>
            );
          })}
          {signatures.length === 0 && (
            <EmptyState icon={t("ui_icon_find_in_page") || "find_in_page"} title={t("comp_no_heuristics")} className="col-span-full py-16" />
          )}
        </div>
      )}
    </div>
  );
}
