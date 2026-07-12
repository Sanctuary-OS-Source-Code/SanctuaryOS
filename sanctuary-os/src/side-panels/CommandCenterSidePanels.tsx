import React from "react";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { SidePanel } from "../shared";

export function UpdatesSidePanel({ 
  isOpen, 
  onClose, 
  activeUpdates, 
  handleOpenUrl
}: any) {
  const { t } = useLexicon();
  const setShowUpdatesModal = (val: boolean) => !val && onClose();

  return (
<SidePanel
        isOpen={isOpen}
        onClose={onClose}
        title={t("updates_modal_title")}
        subtitle={t("system_core")}
        icon={t("icon_update")}
        iconColorClass="text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
        widthClass="w-[550px]"
      >
        <div className="flex flex-col gap-3">
          {activeUpdates.length > 0 ? activeUpdates.map((update: any) => (
              <div key={update.hash || update.name} className="relative shrink-0 group w-full rounded-[var(--radius)] overflow-hidden transition-all duration-500 border flex items-center border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] shadow-lg hover:shadow-[0_0_30px_rgba(var(--accent-rgb),0.2)]">
                <div className="relative p-6 z-10 flex items-center gap-5 w-full">
                  <div className="w-12 h-12 rounded-[1.25rem] flex items-center justify-center shrink-0 border transition-all duration-500 shadow-inner border-[color-mix(in_srgb,var(--accent)_50%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)]">
                    <span className="material-symbols-outlined !text-[24px] text-[var(--accent)]">{t("icon_update")}</span>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex flex-col overflow-hidden">
                        <span className="text-sm font-black uppercase tracking-tight text-[var(--text)] truncate">{update.displayName || update.name}</span>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className="text-[10px] font-bold tracking-widest text-[var(--subtext)] opacity-80 flex items-center">
                             <span className="opacity-50 mr-1">{t("auto_v")}</span>{update.version} <span className="opacity-40 mx-2 text-[8px]">- </span> <span className="theme-text-accent font-black">{t("auto_v")}{update.newVersion}</span>
                          </span>
                          {update.newGameVersion && (
                            <span className="px-2 py-0.5 rounded-md bg-white/5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[8px] font-black uppercase tracking-widest text-[var(--text)] opacity-80 flex items-center gap-1 shadow-sm">
                              <span className="material-symbols-outlined !text-[10px] opacity-70">{t("icon_sports_esports")}</span>
                              {update.newGameVersion}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="shrink-0 ml-4">
                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleOpenUrl(update.download_url || update.url || `https://www.google.com/search?q=${encodeURIComponent(useStore.getState().activeGameSchema?.display_name || "Mod")}+${encodeURIComponent(update.displayName || (update.name || '').split('/').pop() || "")}`); }} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-[0_0_15px_rgba(var(--accent-rgb),0.1)] hover:shadow-[0_0_25px_rgba(var(--accent-rgb),0.2)] flex items-center gap-2 theme-bg-accent/10 border theme-border-accent/30 theme-text-accent hover:theme-bg-accent/20 hover:theme-border-accent/50 backdrop-blur-md active:scale-95`}>
                      {update.download_url || update.url ? (t("btn_download")) : (t("btn_search_web"))} <span className="material-symbols-outlined !text-[14px] opacity-70">{update.download_url || update.url ? (t("icon_download")) : (t("icon_search"))}</span>
                    </button>
                  </div>
                </div>
              </div>
          )) : (
          <div className="w-full theme-glass-inner rounded-[var(--radius)] p-6 text-center text-[var(--subtext)] opacity-60 text-[10px] font-black uppercase tracking-widest">
            {t("no_updates")}<br/>
            <span className="opacity-50 text-[8px]">{t("optimal")}</span>
          </div>
          )}
          <div className="h-32 shrink-0 pointer-events-none" />
        </div>
      </SidePanel>
  );
}
