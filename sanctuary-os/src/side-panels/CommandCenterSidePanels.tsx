import React from "react";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { SidePanel, cleanSearchName, HoverTooltip } from "../shared";

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
      <div className="flex flex-col gap-4 w-full">
        <div className="px-1 py-2 shrink-0 flex flex-col gap-4 relative">
          <div className="flex items-center justify-between w-full relative z-10">
            <h3 className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-[0.2em] opacity-80">{t("updates_modal_title")}</h3>
            <div className="flex items-center gap-2 text-[10px] font-mono text-[var(--subtext)] opacity-60 uppercase tracking-widest">
              {activeUpdates.length > 0 ? (
                <span>
                  {Object.keys(activeUpdates.reduce((acc: any, update: any) => { acc[update.dbId || update.displayName || update.name] = true; return acc; }, {})).length} {t("items")}
                </span>
              ) : (
                <span>0 {t("items")}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 pb-24">
          {activeUpdates.length > 0 ? Object.values(activeUpdates.reduce((acc: any, update: any) => {
            const key = update.dbId || update.displayName || update.name;
            if (!acc[key]) acc[key] = update;
            return acc;
          }, {})).map((update: any) => (
            <div key={update.hash || update.name} className="relative shrink-0 group/card w-full rounded-[var(--radius)] transition-all duration-500 border flex items-center border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] shadow-lg hover:shadow-[0_0_30px_rgba(var(--accent-rgb),0.2)]">
              <div className="relative p-4 z-10 flex items-center gap-3 w-full">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-all duration-500 shadow-inner border-[color-mix(in_srgb,var(--accent)_50%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] shadow-[0_0_15px_rgba(var(--accent-rgb),0.2)]">
                  <span className="material-symbols-outlined !text-[20px] text-[var(--accent)]">{t("icon_update")}</span>
                </div>

                <div className="flex flex-col gap-0.5 flex-1 min-w-0 pr-4 group/title relative">
                  <span className="text-[12px] font-semibold truncate text-[var(--text)]">
                    {update.displayName || update.name}
                  </span>
                  <HoverTooltip title={update.displayName || update.name} variant="default" className="!hidden group-hover/title:!flex z-[100]" />
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] font-mono text-[var(--subtext)] opacity-80 uppercase tracking-widest bg-white/5 border border-white/10 px-1.5 py-0.5 rounded flex items-center">
                      {update.version} <span className="opacity-40 mx-1 text-[8px]">-</span> <span className="theme-text-accent font-black">{update.newVersion}</span>
                    </span>
                    {update.newGameVersion && (
                      <span className="px-1.5 py-0.5 rounded border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-white/5 text-[9px] font-mono uppercase tracking-widest text-[var(--subtext)] opacity-80 flex items-center gap-1">
                        <span className="material-symbols-outlined !text-[10px] opacity-70">{t("icon_sports_esports")}</span>
                        {update.newGameVersion}
                      </span>
                    )}
                  </div>
                </div>

                <div className="relative z-10 flex items-center shrink-0 gap-2">
                  <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleOpenUrl(update.download_url || update.url || `https://www.google.com/search?q=${encodeURIComponent(useStore.getState().activeGameSchema?.display_name || "Mod")}+${encodeURIComponent(cleanSearchName(update.displayName || update.name || "", useStore.getState().activeGameSchema))}`); }} className={`w-8 h-8 rounded-lg bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_60%,transparent)] theme-text-accent transition-all active:scale-95 flex items-center justify-center group relative shadow-[0_0_10px_rgba(var(--accent-rgb),0.1)] hover:shadow-[0_0_15px_rgba(var(--accent-rgb),0.2)]`}>
                    <span className="material-symbols-outlined !text-[16px]">{update.download_url || update.url ? (t("icon_download")) : (t("icon_search"))}</span>
                    <HoverTooltip title={update.download_url || update.url ? (t("btn_download")) : (t("btn_search_web"))} variant="default" />
                  </button>
                </div>
              </div>
            </div>
          )) : (
            <div className="flex-1 flex flex-col items-center justify-center opacity-50 space-y-4 py-12">
              <span className="material-symbols-outlined !text-6xl theme-text-success drop-shadow-[0_0_30px_var(--success)] animate-pulse">{t("icon_update")}</span>
              <p className="text-[12px] font-black tracking-widest uppercase text-center">{t("no_updates")}</p>
            </div>
          )}
        </div>
        <div className="h-32 shrink-0 pointer-events-none" />
      </div>
    </SidePanel>
  );
}
