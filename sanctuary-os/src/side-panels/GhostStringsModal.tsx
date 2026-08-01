import { useState, useEffect } from "react";
import { useLexicon } from "../LexiconContext";
import { HoverTooltip, cleanSearchName, SidePanel, handleOpenUrl } from "../shared";
import { useStore } from "../store";
import { supabase } from "../supabase";

export function GhostStringsModal({
  setName,
  ghosts,
  onClose,
  onIgnore,
  onPurge,
  onSearch,
}: any) {
  const { t } = useLexicon();
  const [ghostsMeta, setGhostsMeta] = useState<Record<string, { is_paid?: boolean, is_early_access?: boolean }>>({});

  useEffect(() => {
    if (!ghosts || ghosts.length === 0) return;
    const fetchMeta = async () => {
      const schema = useStore.getState().activeGameSchema;
      const newMeta: Record<string, any> = {};

      for (const ghost of ghosts) {
        if (ghostsMeta[ghost]) continue;
        const words = ghost.match(/[a-zA-Z0-9]+/g) || [];
        const longestWord = words.reduce((a: string, b: string) => a.length > b.length ? a : b, "");
        const baseQuery = longestWord.length >= 4 ? longestWord : "";
        
        if (baseQuery.length > 0) {
          const { data, error } = await supabase.from('mods').select('id, name, is_paid, is_early_access').ilike('name', `%${baseQuery}%`).limit(30);
          if (!error && data && data.length > 0) {
            const cleanMissingName = cleanSearchName(ghost, schema);
            const cleanMissingNameLower = cleanMissingName.toLowerCase();
            let dbMatch = data.find((dm: any) => cleanSearchName(dm.name || '', schema).toLowerCase() === cleanMissingNameLower);
            if (!dbMatch) {
              dbMatch = data.find((dm: any) => {
                const cleanLLower = cleanSearchName(dm.name || '', schema).toLowerCase();
                const str1 = cleanLLower.replace(/\s+/g, '');
                const str2 = cleanMissingNameLower.replace(/\s+/g, '');
                return cleanLLower.length > 10 && (str1.includes(str2) || str2.includes(str1));
              });
            }
            if (dbMatch) {
              newMeta[ghost] = { is_paid: dbMatch.is_paid, is_early_access: dbMatch.is_early_access };
            }
          }
        }
      }
      if (Object.keys(newMeta).length > 0) {
        setGhostsMeta(prev => ({ ...prev, ...newMeta }));
      }
    };
    fetchMeta();
  }, [ghosts]);

  return (
    <SidePanel
      isOpen={true}
      onClose={onClose}
      title={t("title_missing_artifacts") || "Missing Artifacts"}
      subtitle={`Found ${ghosts.length} ghosts in ${setName}`}
      icon="cleaning_services"
      iconColorClass="text-[var(--danger)] border-[var(--danger)]/30"
    >
      <div className="flex flex-col gap-3 pb-8">
        {(() => {
          const premiumGhosts = ghosts.filter((mod: string) => ghostsMeta[mod]?.is_paid || ghostsMeta[mod]?.is_early_access);
          const standardGhosts = ghosts.filter((mod: string) => !ghostsMeta[mod]?.is_paid && !ghostsMeta[mod]?.is_early_access);

          const renderGhostList = (modList: string[]) => modList.map((mod: string, idx: number) => {
            const meta = ghostsMeta[mod] || {};
            const targetUrl = `https://www.google.com/search?q=${encodeURIComponent(`${useStore.getState().activeGameSchema?.display_name || "Mod"} ${cleanSearchName(mod, useStore.getState().activeGameSchema)}`)}`;
            return (
              <div key={idx} className="flex justify-between items-center theme-glass-inner border border-white/5 p-4 rounded-2xl hover:border-white/20 transition-all group shadow-md">
                <div className="flex flex-col min-w-0 pr-4">
                  <span className="text-xs font-black text-[var(--text)] uppercase truncate group-hover:text-[var(--danger)] transition-colors">{cleanSearchName(mod, useStore.getState().activeGameSchema)}</span>
                  <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest mt-1 truncate">{mod}</span>
                  {(meta.is_paid || meta.is_early_access) && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {meta.is_early_access && (
                        <div className="px-2 py-1 bg-purple-500/10 border border-purple-500/30 rounded-lg flex items-center gap-1 shadow-[0_0_10px_rgba(168,85,247,0.1)]">
                          <span className="material-symbols-outlined !text-[10px] text-purple-500">science</span>
                          <span className="text-[8px] font-black uppercase tracking-[0.1em] text-purple-500">{t("badge_early_access") || "Early Access"}</span>
                        </div>
                      )}
                      {meta.is_paid && (
                        <div className="px-2 py-1 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-center gap-1 shadow-[0_0_10px_rgba(234,179,8,0.1)]">
                          <span className="material-symbols-outlined !text-[10px] text-yellow-500">monetization_on</span>
                          <span className="text-[8px] font-black uppercase tracking-[0.1em] text-yellow-500">{t("badge_paid") || "Paid"}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenUrl(targetUrl)}
                    className="w-10 h-10 shrink-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_15%,transparent)] rounded-xl transition-all text-[var(--text)] group/btn relative"
                  >
                    <span className="material-symbols-outlined !text-[18px]">search</span>
                    <HoverTooltip title={t("btn_search_network") || "Search Network"} variant="default" className="group-hover/btn:flex z-[200]" />
                  </button>
                  <button
                    onClick={() => onIgnore(mod)}
                    className="w-10 h-10 shrink-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:theme-bg-accent hover:text-[var(--bg)] rounded-xl transition-all text-[var(--text)] group/btn relative"
                  >
                    <span className="material-symbols-outlined !text-[18px]">visibility_off</span>
                    <HoverTooltip title={t("btn_ignore_alert") || "Ignore Alert"} variant="accent" className="group-hover/btn:flex z-[200]" />
                  </button>
                  <button
                    onClick={() => onPurge(mod)}
                    className="w-10 h-10 shrink-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:theme-bg-danger hover:text-[var(--bg)] rounded-xl transition-all text-[var(--text)] group/btn relative"
                  >
                    <span className="material-symbols-outlined !text-[18px]">delete</span>
                    <HoverTooltip title={t("btn_purge_string") || "Purge String"} variant="danger" className="group-hover/btn:flex z-[200] !left-auto !right-0 !translate-x-0" />
                  </button>
                </div>
              </div>
            );
          });

          return (
            <>
              {premiumGhosts.length > 0 && (
                <div className="flex flex-col gap-3 mb-4">
                  <div className="flex items-center gap-3 p-4 theme-glass-panel border border-yellow-500/30 rounded-2xl bg-yellow-500/5 shadow-md">
                    <div className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl bg-yellow-500/20 text-yellow-500">
                      <span className="material-symbols-outlined !text-[20px]">auto_fix_high</span>
                    </div>
                    <div className="flex flex-col flex-1">
                      <span className="text-xs font-black text-yellow-500 uppercase tracking-widest">Premium Artifacts Detected</span>
                      <span className="text-[10px] font-bold text-[var(--subtext)] uppercase tracking-wider opacity-80">
                        {premiumGhosts.filter((m: string) => ghostsMeta[m]?.is_paid).length} Paid, {premiumGhosts.filter((m: string) => ghostsMeta[m]?.is_early_access).length} Early Access
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          premiumGhosts.forEach((mod: string) => onIgnore(mod));
                        }}
                        className="px-3 py-1.5 flex items-center gap-2 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] border border-[var(--accent)]/30 rounded-xl transition-all"
                      >
                        <span className="material-symbols-outlined !text-[14px]">visibility_off</span>
                        <span className="text-[10px] font-black uppercase tracking-widest">Ignore</span>
                      </button>
                      <button
                        onClick={() => {
                          premiumGhosts.forEach((mod: string) => onPurge(mod));
                        }}
                        className="px-3 py-1.5 flex items-center gap-2 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] text-[var(--danger)] border border-[var(--danger)]/30 rounded-xl transition-all"
                      >
                        <span className="material-symbols-outlined !text-[14px]">delete</span>
                        <span className="text-[10px] font-black uppercase tracking-widest">Purge</span>
                      </button>
                    </div>
                  </div>
                  {renderGhostList(premiumGhosts)}
                </div>
              )}

              {standardGhosts.length > 0 && (
                <div className="flex flex-col gap-3">
                  {premiumGhosts.length > 0 && (
                    <div className="flex items-center gap-4 mt-2 mb-2">
                      <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-[var(--text)]/10 to-transparent" />
                      <span className="text-[9px] font-black text-[var(--subtext)] uppercase tracking-widest opacity-60">Standard Artifacts</span>
                      <div className="h-[1px] flex-1 bg-gradient-to-r from-[var(--text)]/10 via-transparent to-transparent" />
                    </div>
                  )}
                  {renderGhostList(standardGhosts)}
                </div>
              )}
            </>
          );
        })()}
      </div>
    </SidePanel>
  );
}
