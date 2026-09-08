import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { useLexicon } from './LexiconContext';
import { EmptyState } from './shared';

export function HeuristicsReadOnlyList({ onEditClick, search }: { onEditClick: (sig: any) => void, search: string }) {
  const { t } = useLexicon();
  const [signatures, setSignatures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('heuristic_signatures').select('*');
      if (error) {
        console.error("Error fetching heuristics:", error);
      } else {
        setSignatures(data || []);
      }
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
    <>
      {loading ? (
        <div className="glass-panel p-8 rounded-2xl text-center text-sm font-bold text-[var(--subtext)] capitalize tracking-widest animate-pulse">{t("auto_loading_signatures")}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredSignatures.map(sig => {
            const isMalware = sig.severity === 'malware';
            const isExplicit = sig.severity === 'explicit';
            const sColor = isMalware ? 'text-red-500' : isExplicit ? 'text-[#fbbf24]' : 'theme-text-accent';
            const sBorder = isMalware ? 'border-[color-mix(in_srgb,var(--danger)_20%,transparent)]' : isExplicit ? 'border-[#fbbf24]/20' : 'border-[color-mix(in_srgb,var(--accent)_20%,transparent)]';
            const sHoverBorder = isMalware ? 'hover:border-[color-mix(in_srgb,var(--danger)_40%,transparent)]' : isExplicit ? 'hover:border-[#fbbf24]/40' : 'hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]';
            const bgClass = isMalware ? 'from-[color-mix(in_srgb,var(--danger)_5%,transparent)]' : isExplicit ? 'from-[#fbbf24]/10' : 'from-[color-mix(in_srgb,var(--accent)_5%,transparent)]';

            return (
              <div
                key={sig.id}
                onClick={() => onEditClick(sig)}
                className={`relative glass-panel p-5 rounded-2xl flex flex-col gap-4 shadow-xl min-h-[13rem] overflow-hidden group ${sHoverBorder} transition-all duration-300 cursor-pointer ${!sig.enabled ? 'opacity-50 grayscale hover:opacity-100 hover:grayscale-0' : ''}`}
              >
                <div className={`absolute inset-0 rounded-[inherit] bg-gradient-to-br ${bgClass} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`} />

                <div className="flex justify-between items-start relative z-10">
                  <div className={`w-12 h-12 rounded-xl theme-glass-panel border ${sBorder} shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0`}>
                    <span className={`material-symbols-outlined !text-[24px] ${sColor} opacity-90 drop-shadow-lg`}>
                      bug_report
                    </span>
                  </div>

                  <span className="text-[9px] font-black text-[var(--subtext)] capitalize tracking-widest bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 px-2.5 py-1 rounded-lg">
                    {sig.id?.substring(0, 8) || 'GLOBAL'}
                  </span>
                </div>

                <div className="flex flex-col relative z-10 mt-1">
                  <h3 className="text-lg font-black text-[var(--text)] tracking-tighter capitalize leading-none mb-2.5 truncate" title={sig.signature}>
                    {sig.signature}
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-black ${sColor} capitalize tracking-widest`}>{sig.severity}</span>
                    <span className="text-[var(--subtext)] opacity-50">&bull;</span>
                    <span className="text-[9px] font-black text-[var(--subtext)] lowercase tracking-widest truncate flex items-center gap-1">
                      <span className="material-symbols-outlined !text-[10px]">account_tree</span>
                      {sig.match_type}
                    </span>
                  </div>
                </div>

                <div className="mt-auto relative z-20 h-10">
                  <div className={`absolute inset-0 rounded-[inherit] flex gap-2 transition-all duration-300 opacity-100 translate-y-0`}>
                    <button
                      className={`flex-[2] h-full flex items-center justify-center gap-2 text-[10px] font-black capitalize tracking-widest text-[var(--text)] hover:${sColor} bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 transition-all rounded-xl shadow-sm`}
                    >
                      <span className={`material-symbols-outlined !text-sm`}>edit</span>
                      {t("btn_inspect")}
                    </button>
                    <button
                      className={`flex-1 h-full flex items-center justify-center gap-2 text-[10px] font-black capitalize tracking-widest ${sig.enabled ? 'text-[var(--success)]' : 'text-[var(--danger)]'} hover:bg-black/10 dark:hover:bg-white/10 border border-transparent hover:border-black/20 dark:hover:border-white/20 transition-all rounded-xl`}
                    >
                      <span className={`material-symbols-outlined !text-sm`}>{sig.enabled ? 'verified' : 'block'}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {filteredSignatures.length === 0 && (
            <EmptyState icon={t("ui_icon_find_in_page")} title={t("comp_no_heuristics")} className="col-span-full py-16" />
          )}
        </div>
      )}
    </>
  );
}


