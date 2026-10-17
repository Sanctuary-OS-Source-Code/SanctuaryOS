import React, { useState, useEffect } from 'react';
import { supabase, supabaseAuth } from './supabase';
import { useLexicon } from './LexiconContext';
import { EmptyState, SidePanel } from './shared';
import { UniversalGroup, UniversalInput, UniversalTextArea } from './components/universal/UniversalLayout';

export function HeuristicsReadOnlyList({
  onEditClick,
  search,
  scope = "spoke",
  readOnly = false
}: {
  onEditClick?: (sig: any) => void;
  search: string;
  scope?: "spoke" | "core";
  readOnly?: boolean;
}) {
  const { t } = useLexicon();
  const [signatures, setSignatures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [inspectingSig, setInspectingSig] = useState<any | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const query = scope === "core"
        ? supabaseAuth.from('keeper_heuristic_signatures').select('*').order('created_at', { ascending: true })
        : supabase.from('heuristic_signatures').select('*').order('created_at', { ascending: true });
      const { data, error } = await query;
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
  }, [scope]);

  const filteredSignatures = signatures.filter(sig =>
    !search ||
    sig.signature?.toLowerCase().includes(search.toLowerCase()) ||
    sig.match_type?.toLowerCase().includes(search.toLowerCase()) ||
    sig.notes?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      {readOnly && scope === "core" && (
        <div className="glass-surface px-5 py-3.5 rounded-2xl border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] flex items-center gap-3 mb-2">
          <span className="material-symbols-outlined !text-[18px] text-[var(--accent)] shrink-0">
            {t("icon_shield_lock") || "shield_lock"}
          </span>
          <span className="text-[11px] font-bold text-[var(--subtext)] tracking-wide">
            {t("core_heuristics_readonly_notice") || "Core OS heuristic definitions are governed globally by Keepers Core and are read-only at the Spoke level."}
          </span>
        </div>
      )}

      {loading ? (
        <div className="glass-panel p-8 rounded-2xl text-center text-sm font-bold text-[var(--subtext)] capitalize tracking-widest animate-pulse">
          {t("auto_loading_signatures") || "Loading Signatures..."}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredSignatures.map(sig => {
            const isMalware = sig.severity === 'malware';
            const isExplicit = sig.severity === 'explicit';
            const sColor = isMalware ? 'text-[var(--danger)]' : isExplicit ? 'text-[var(--warning)]' : 'theme-text-accent';
            const sBorder = isMalware ? 'border-[color-mix(in_srgb,var(--danger)_25%,transparent)]' : isExplicit ? 'border-[color-mix(in_srgb,var(--warning)_25%,transparent)]' : 'border-[color-mix(in_srgb,var(--accent)_25%,transparent)]';
            const sHoverBorder = isMalware ? 'hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)]' : isExplicit ? 'hover:border-[color-mix(in_srgb,var(--warning)_45%,transparent)]' : 'hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)]';
            const bgClass = isMalware ? 'from-[color-mix(in_srgb,var(--danger)_5%,transparent)]' : isExplicit ? 'from-[color-mix(in_srgb,var(--warning)_8%,transparent)]' : 'from-[color-mix(in_srgb,var(--accent)_5%,transparent)]';

            return (
              <div
                key={sig.id}
                onClick={() => {
                  if (readOnly || !onEditClick) {
                    setInspectingSig(sig);
                  } else {
                    onEditClick(sig);
                  }
                }}
                className={`relative glass-panel p-5 rounded-2xl flex flex-col gap-4 shadow-xl min-h-[13rem] overflow-hidden group ${sHoverBorder} transition-all duration-300 cursor-pointer ${!sig.enabled ? 'opacity-50 grayscale hover:opacity-100 hover:grayscale-0' : ''}`}
              >
                <div className={`absolute inset-0 rounded-[inherit] bg-gradient-to-br ${bgClass} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`} />

                <div className="flex justify-between items-start relative z-10">
                  <div className={`w-12 h-12 rounded-xl theme-glass-panel border ${sBorder} shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0`}>
                    <span className={`material-symbols-outlined !text-[24px] ${sColor} opacity-90 drop-shadow-lg`}>
                      {scope === "core" ? (t("icon_shield_lock") || "shield_lock") : (t("icon_bug_report") || "bug_report")}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className={`text-[9px] font-black capitalize tracking-widest px-2.5 py-1 rounded-lg border ${scope === "core" ? "text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_25%,transparent)]" : "text-[var(--subtext)] bg-black/5 dark:bg-white/5 border-black/5 dark:border-white/5"}`}>
                      {scope === "core" ? (t("core_os_badge") || "Core OS") : (t("spoke_badge") || "Spoke")}
                    </span>
                    <span className="text-[9px] font-black text-[var(--subtext)] capitalize tracking-widest bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 px-2.5 py-1 rounded-lg">
                      {sig.id?.substring(0, 8) || 'GLOBAL'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col relative z-10 mt-1">
                  <h3 className="text-lg font-black text-[var(--text)] tracking-tighter leading-none mb-2.5 truncate" title={sig.signature}>
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
                  {sig.notes && (
                    <p className="text-[11px] font-bold text-[var(--subtext)] opacity-70 line-clamp-2 mt-2">
                      {sig.notes}
                    </p>
                  )}
                </div>

                <div className="mt-auto relative z-20 h-10">
                  <div className="absolute inset-0 rounded-[inherit] flex gap-2 transition-all duration-300 opacity-100 translate-y-0">
                    <button
                      className={`flex-[2] h-full flex items-center justify-center gap-2 text-[10px] font-black capitalize tracking-widest text-[var(--text)] hover:${sColor} bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 transition-all rounded-xl shadow-sm`}
                    >
                      <span className="material-symbols-outlined !text-sm">{readOnly ? "visibility" : "edit"}</span>
                      {t("btn_inspect") || "Inspect"}
                    </button>
                    <div
                      className={`flex-1 h-full flex items-center justify-center gap-2 text-[10px] font-black capitalize tracking-widest ${sig.enabled ? 'text-[var(--success)]' : 'text-[var(--danger)]'} bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-xl`}
                    >
                      <span className="material-symbols-outlined !text-sm">{sig.enabled ? 'verified' : 'block'}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {filteredSignatures.length === 0 && (
            <EmptyState icon={t("ui_icon_find_in_page") || "find_in_page"} title={t("comp_no_heuristics") || "No Heuristics Found"} className="col-span-full py-16" />
          )}
        </div>
      )}

      <SidePanel
        isOpen={!!inspectingSig}
        onClose={() => setInspectingSig(null)}
        title={t("inspect_core_heuristic") || "Inspect Core Heuristic"}
        subtitle={inspectingSig ? `ID: ${inspectingSig.id}` : undefined}
        icon={t("icon_shield_lock") || "shield_lock"}
        widthClass="w-[500px]"
      >
        {inspectingSig && (
          <div className="flex flex-col gap-6">
            <div className="glass-surface px-4 py-3 rounded-xl border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] flex items-center gap-3">
              <span className="material-symbols-outlined !text-[18px] text-[var(--accent)] shrink-0">
                {t("icon_shield_lock") || "shield_lock"}
              </span>
              <span className="text-[11px] font-bold text-[var(--subtext)]">
                {t("core_heuristics_readonly_notice") || "Core OS heuristic definitions are governed globally by Keepers Core and are read-only at the Spoke level."}
              </span>
            </div>

            <UniversalGroup title={t("core_heuristics_tab") || "Core Heuristics"} icon={t("icon_memory") || "memory"}>
              <UniversalInput
                label={t("auto_file_signature") || "File Signature"}
                value={inspectingSig.signature || ""}
                onChange={() => {}}
                readOnly={true}
              />
              <UniversalInput
                label={t("comp_match_type") || "Match Type"}
                value={inspectingSig.match_type || ""}
                onChange={() => {}}
                readOnly={true}
              />
              <UniversalTextArea
                label={t("reason") || "Reason / Notes"}
                value={inspectingSig.notes || ""}
                onChange={() => {}}
                readOnly={true}
                rows={4}
              />
            </UniversalGroup>
          </div>
        )}
      </SidePanel>
    </>
  );
}



