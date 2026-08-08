import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useLexicon } from './LexiconContext';
import { EmptyState } from './shared';
import { UniversalCard } from './components/universal/UniversalCard';

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
        <div className="glass-panel p-8 rounded-[var(--radius)] text-center text-sm font-bold text-[var(--subtext)] uppercase tracking-widest animate-pulse">{t("auto_loading_signatures")}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredSignatures.map(sig => {
            const isMalware = sig.severity === 'malware';
            const isExplicit = sig.severity === 'explicit';
            const sColor = isMalware ? 'text-red-500' : isExplicit ? 'text-[#fbbf24]' : 'theme-text-accent';
            const sBorder = isMalware ? 'border-red-500' : isExplicit ? 'border-[#fbbf24]' : 'border-[var(--accent)]';
            const bgClass = isMalware ? 'bg-red-500/10' : isExplicit ? 'bg-[#fbbf24]/10' : 'bg-[var(--accent)]/10';

            return (
              <UniversalCard
                key={sig.id}
                onClick={() => onEditClick(sig)}
                layout="vertical"
                icon="bug_report"
                title={sig.signature}
                subtitle={
                  <span className="flex gap-1.5 items-center">
                    <span className="material-symbols-outlined !text-[12px] opacity-70">{t("icon_account_tree")}</span>
                    {sig.match_type}
                  </span>
                }
                statusColor={sBorder}
                isDisabled={!sig.enabled}
                badges={[
                  <span key="rating" className={`px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest uppercase border shadow-inner shrink-0 transition-colors bg-[color-mix(in_srgb,var(--text)_5%,transparent)] ${bgClass} ${sColor} ${sBorder}/20`}>
                    {sig.severity}
                  </span>
                ]}
                footer={
                  <div className="flex justify-between items-center w-full">
                    <span className="flex items-center gap-1.5 truncate text-[var(--subtext)] opacity-80">
                      <span className="material-symbols-outlined !text-[12px] opacity-70">{t("icon_shield")}</span>
                      {sig.enabled ? (t("comp_enabled")) : (t("comp_disabled"))}
                    </span>
                    <span className="text-[10px] font-black theme-text-accent uppercase opacity-0 group-hover:opacity-100 transition-opacity translate-x-4 group-hover:translate-x-0">{t("ui_edit_metadata")} &rarr;</span>
                  </div>
                }
              />
            );
          })}
          {filteredSignatures.length === 0 && (
            <EmptyState icon={t("ui_icon_find_in_page") || "find_in_page"} title={t("comp_no_heuristics")} className="col-span-full py-16" />
          )}
        </div>
      )}
    </div>
  );
}
