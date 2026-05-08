import { useLexicon } from "./LexiconContext";

import { openUrl } from "@tauri-apps/plugin-opener";
export function MissingImportsAlert({ missingImportMods, setMissingImportMods, pendingImportSet, setPendingImportSet, finalizeImport, setIsDropzoneOpen }: any) {
  const { t } = useLexicon();
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--bg)]/40 backdrop-blur-2xl animate-in fade-in duration-200">
            <div className="w-full max-w-2xl bg-[var(--sidebar)] border theme-border-warning rounded-[2rem] p-8 shadow-2xl flex flex-col gap-6 max-h-[90vh]" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-4 shrink-0">
                <span className="text-4xl animate-pulse">⚠️</span>
                <div>
                  <h2 className="text-2xl font-black uppercase theme-text-warning tracking-tighter mb-1">{t("modal_import_title")}</h2>
                  <p className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">
                    {t("modal_import_desc1")} <span className="text-[var(--text)]">{missingImportMods.length}</span> {t("modal_import_desc2")}
                  </p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar theme-glass-inner rounded-2xl p-4 flex flex-col gap-2">
                {missingImportMods.map((mod: any, idx: number) => {
                  const targetUrl = (mod.url && mod.url.trim() !== "") ? (mod.url.startsWith("http") ? mod.url : `https://${mod.url}`) : `https://www.bing.com/search?q=${encodeURIComponent(`Sims 4 mod ${mod.name}`)}`;
                  return (
                    <div key={idx} className="flex justify-between items-center bg-white/5 border border-white/5 p-4 rounded-xl hover:border-white/20 transition-all group">
                      <div className="flex flex-col min-w-0 pr-4">
                        <span className="text-xs font-black text-[var(--text)] uppercase truncate">{mod.name.replace(".package", "").replace(".ts4script", "")}</span>
                        <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">{mod.author || t("registry_unknown_architect")}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => {
                            const next = missingImportMods.filter((m: any) => m.name !== mod.name);
                            if (next.length === 0) {
                              finalizeImport(pendingImportSet);
                              setMissingImportMods(null);
                            } else {
                              setMissingImportMods(next);
                            }
                          }}
                          className="shrink-0 px-4 py-2 bg-white/5 hover:theme-bg-danger hover:text-[var(--bg)] rounded-lg text-[9px] font-black uppercase tracking-widest transition-all text-[var(--text)] border border-white/10"
                        >
                          Skip
                        </button>
                        <button 
                          onClick={() => {
                            openUrl(targetUrl);
                            setIsDropzoneOpen(true);
                          }} 
                          className="shrink-0 px-4 py-2 bg-white/10 hover:theme-bg-accent hover:text-[var(--bg)] rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 text-[var(--text)]"
                        >
                          {t("modal_import_intel")} <span className="text-sm">{t("ui_icon_external_link")}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2 pt-3 border-t border-white/10 shrink-0">
                <button 
                  onClick={() => finalizeImport(pendingImportSet)} 
                  className="flex-1 py-2.5 theme-bg-danger text-[var(--bg)] font-black rounded-xl text-[9px] uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_10px_rgba(var(--danger-rgb),0.4)]"
                >
                  {t("modal_btn_confirm") || "CONFIRM"}
                </button>
                <button 
                  onClick={() => { setMissingImportMods(null); setPendingImportSet(null); }} 
                  className="flex-1 py-2.5 theme-bg-success text-[var(--bg)] font-black rounded-xl text-[9px] uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_10px_rgba(var(--success-rgb),0.4)]"
                >
                  {t("modal_btn_abort") || "ABORT"}
                </button>
              </div>
            </div>
          </div>
  );
}
