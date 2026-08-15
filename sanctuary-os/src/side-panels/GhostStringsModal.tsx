import { useState, useEffect } from "react";
import { useLexicon } from "../LexiconContext";
import { HoverTooltip, cleanSearchName, SidePanel, handleOpenUrl } from "../shared";
import { UniversalCard } from "../components/universal/UniversalCard";
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
      title={t("title_missing_artifacts")}
      subtitle={`Found ${ghosts.length} ghosts in ${setName}`}
      icon="cleaning_services"
      iconColorClass="text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)]"
    >
      <div className="flex flex-col gap-3 pb-8">
        {(() => {
          const premiumGhosts = ghosts.filter((mod: string) => ghostsMeta[mod]?.is_paid || ghostsMeta[mod]?.is_early_access);
          const standardGhosts = ghosts.filter((mod: string) => !ghostsMeta[mod]?.is_paid && !ghostsMeta[mod]?.is_early_access);

          const renderGhostList = (modList: string[]) => (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {modList.map((mod: string, idx: number) => {
                const meta = ghostsMeta[mod] || {};
                const targetUrl = `https://www.google.com/search?q=${encodeURIComponent(`${useStore.getState().activeGameSchema?.display_name || "Mod"} ${cleanSearchName(mod, useStore.getState().activeGameSchema)}`)}`;
                return (
                  <UniversalCard
                    key={idx}
                    layout="vertical-compact"
                    title={cleanSearchName(mod, useStore.getState().activeGameSchema)}
                    subtitle={mod}
                    badges={
                      (meta.is_paid || meta.is_early_access) && (
                        <>
                          {meta.is_early_access && (
                            <div className="px-2 py-1 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] rounded-lg flex items-center gap-1 shadow-md">
                              <span className="material-symbols-outlined !text-[10px] text-purple-500">science</span>
                              <span className="text-[8px] font-black capitalize tracking-[0.1em] text-purple-500">{t("badge_early_access")}</span>
                            </div>
                          )}
                          {meta.is_paid && (
                            <div className="px-2 py-1 bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] rounded-lg flex items-center gap-1 shadow-md">
                              <span className="material-symbols-outlined !text-[10px] text-yellow-500">monetization_on</span>
                              <span className="text-[8px] font-black capitalize tracking-[0.1em] text-yellow-500">{t("badge_paid")}</span>
                            </div>
                          )}
                        </>
                      )
                    }
                    actions={
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleOpenUrl(targetUrl)}
                          className="w-8 h-8 shrink-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_15%,transparent)] rounded-lg transition-all text-[var(--text)] group/btn relative"
                        >
                          <span className="material-symbols-outlined !text-[16px]">search</span>
                          <HoverTooltip title={t("btn_search_network")} variant="default" className="group-hover/btn:flex z-[200]" />
                        </button>
                        <button
                          onClick={() => onIgnore(mod)}
                          className="w-8 h-8 shrink-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] hover:text-amber-500 border hover:border-[color-mix(in_srgb,var(--warning)_50%,transparent)] rounded-lg transition-all text-[var(--text)] group/btn relative"
                        >
                          <span className="material-symbols-outlined !text-[16px]">visibility_off</span>
                          <HoverTooltip title={t("btn_ignore_alert")} variant="default" className="group-hover/btn:flex z-[200]" />
                        </button>
                        <button
                          onClick={() => onPurge(mod)}
                          className="w-8 h-8 shrink-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:text-red-500 border hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] rounded-lg transition-all text-[var(--text)] group/btn relative"
                        >
                          <span className="material-symbols-outlined !text-[16px]">delete</span>
                          <HoverTooltip title={t("btn_purge_string")} variant="danger" className="group-hover/btn:flex z-[200]" />
                        </button>
                      </div>
                    }
                  />
                );
              })}
            </div>
          );

          return (
            <>
              {premiumGhosts.length > 0 && (
                <div className="flex flex-col gap-3 mb-4">
                  <div className="flex items-center gap-3 p-4 glass-panel border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] rounded-2xl bg-[color-mix(in_srgb,var(--warning)_5%,transparent)] shadow-md">
                    <div className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] text-yellow-500">
                      <span className="material-symbols-outlined !text-[20px]">auto_fix_high</span>
                    </div>
                    <div className="flex flex-col flex-1">
                      <span className="text-xs font-black text-yellow-500 capitalize tracking-widest">{t("premium_detected")}</span>
                      <span className="text-[10px] font-bold text-[var(--subtext)] capitalize tracking-wider opacity-80">
                        {premiumGhosts.filter((m: string) => ghostsMeta[m]?.is_paid).length} Paid, {premiumGhosts.filter((m: string) => ghostsMeta[m]?.is_early_access).length} Early Access
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          premiumGhosts.forEach((mod: string) => onIgnore(mod));
                        }}
                        className="px-3 py-1.5 flex items-center gap-2 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] rounded-xl transition-all"
                      >
                        <span className="material-symbols-outlined !text-[14px]">visibility_off</span>
                        <span className="text-[10px] font-black capitalize tracking-widest">{t("btn_ignore_issue")}</span>
                      </button>
                      <button
                        onClick={() => {
                          premiumGhosts.forEach((mod: string) => onPurge(mod));
                        }}
                        className="px-3 py-1.5 flex items-center gap-2 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] text-[var(--danger)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] rounded-xl transition-all"
                      >
                        <span className="material-symbols-outlined !text-[14px]">delete</span>
                        <span className="text-[10px] font-black capitalize tracking-widest">{t("btn_purge_issue")}</span>
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
                      <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent" />
                      <span className="text-[9px] font-black text-[var(--subtext)] capitalize tracking-widest opacity-60">{t("standard_artifacts")}</span>
                      <div className="h-[1px] flex-1 bg-gradient-to-r from-[color-mix(in_srgb,var(--text)_10%,transparent)] via-transparent to-transparent" />
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


