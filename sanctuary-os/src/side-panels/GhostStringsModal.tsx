import { useLexicon } from "../LexiconContext";
import { HoverTooltip, cleanSearchName } from "../shared";
import { useStore } from "../store";

export function GhostStringsModal({
  setName,
  ghosts,
  onClose,
  onIgnore,
  onPurge,
  onSearch,
}: any) {
  const { t } = useLexicon();

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-8 pointer-events-none">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-md pointer-events-auto" onClick={onClose} />
      <div className="w-[600px] max-h-[85vh] bg-[var(--bg)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-3xl shadow-2xl flex flex-col relative pointer-events-auto overflow-hidden">
        
        {/* Header */}
        <div className="shrink-0 p-6 pb-4 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] backdrop-blur-xl relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] flex items-center justify-center shrink-0 border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)]">
              <span className="material-symbols-outlined !text-[20px]">ghost</span>
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <h2 className="text-lg font-black text-[var(--text)] uppercase tracking-tight flex items-center gap-2">
                Missing Artifacts
              </h2>
              <p className="text-xs font-bold text-[var(--subtext)] uppercase tracking-widest mt-1 opacity-70">
                Found <span className="theme-text-danger font-black text-sm">{ghosts.length}</span> ghosts in {setName}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          <div className="flex flex-col gap-3">
            {ghosts.map((mod: string, idx: number) => {
              const targetUrl = `https://www.google.com/search?q=${encodeURIComponent(`${useStore.getState().activeGameSchema?.display_name || "Mod"} ${cleanSearchName(mod, useStore.getState().activeGameSchema)}`)}`;
              return (
                <div key={idx} className="flex justify-between items-center theme-glass-inner border border-white/5 p-4 rounded-2xl hover:border-white/20 transition-all group shadow-md">
                  <div className="flex flex-col min-w-0 pr-4">
                    <span className="text-xs font-black text-[var(--text)] uppercase truncate group-hover:text-[var(--danger)] transition-colors">{cleanSearchName(mod, useStore.getState().activeGameSchema)}</span>
                    <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest mt-1 truncate">{mod}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onSearch(targetUrl)}
                      className="w-10 h-10 shrink-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_15%,transparent)] rounded-xl transition-all text-[var(--text)] group/btn relative"
                    >
                      <span className="material-symbols-outlined !text-[18px]">search</span>
                      <HoverTooltip title="Search Network" variant="info" className="group-hover/btn:flex z-[200]" />
                    </button>
                    <button
                      onClick={() => onIgnore(mod)}
                      className="w-10 h-10 shrink-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:theme-bg-accent hover:text-[var(--bg)] rounded-xl transition-all text-[var(--text)] group/btn relative"
                    >
                      <span className="material-symbols-outlined !text-[18px]">visibility_off</span>
                      <HoverTooltip title="Ignore Alert" variant="accent" className="group-hover/btn:flex z-[200]" />
                    </button>
                    <button
                      onClick={() => onPurge(mod)}
                      className="w-10 h-10 shrink-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:theme-bg-danger hover:text-[var(--bg)] rounded-xl transition-all text-[var(--text)] group/btn relative"
                    >
                      <span className="material-symbols-outlined !text-[18px]">delete</span>
                      <HoverTooltip title="Purge String" variant="danger" className="group-hover/btn:flex z-[200]" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 p-6 pt-4 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] backdrop-blur-xl relative z-10 flex justify-end">
          <button
            onClick={onClose}
            className="py-3 px-6 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--text)] rounded-xl font-black uppercase text-[10px] tracking-widest transition-all"
          >
            {t("btn_close")}
          </button>
        </div>
      </div>
    </div>
  );
}
