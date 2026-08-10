import React from "react";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { SidePanel, cleanSearchName, HoverTooltip, getModIcon, formatDisplayName } from "../shared";
import { UniversalCard } from "../components/universal/UniversalCard";

function UpdateModCard({ update, handleOpenUrl, t, activeGameSchema }: any) {
  const showImages = useStore((state: any) => state.showImages);
  const image = (showImages && (update.image_url || update.imageUrl) && String(update.image_url || update.imageUrl) !== "null" && String(update.image_url || update.imageUrl).trim() !== "") ? (update.image_url || update.imageUrl) : undefined;

  return (
    <div className="relative group/shadow h-[250px] shadow-xl transition-all duration-500 hover:-translate-y-1 z-10 hover:z-[100]" style={{ borderRadius: 'var(--radius)' }}>
      <div className={`relative w-full h-full transition-transform duration-500`}>
        <UniversalCard
          layout="vertical-compact"
          image={image}
          icon={!image ? getModIcon(update, activeGameSchema, t) : undefined}
          statusColor="theme-border-accent"
          className="w-full h-full bg-[var(--accent)]/[5%] hover:bg-[var(--accent)]/[10%] border-[var(--accent)]/[30%] shadow-lg hover:shadow-[0_0_30px_rgba(var(--accent-rgb),0.2)]"
          title={formatDisplayName(update.displayName || update.name)}
          subtitle={
            <div className="flex items-center gap-1.5 opacity-80 mt-0.5">
               <span>{update.author || t("unknown_mason") || "Unknown Mason"}</span>
            </div>
          }
          actions={
            <div className="flex items-center gap-1.5 pointer-events-auto">
              <button 
                onClick={(e) => { 
                  e.preventDefault(); 
                  e.stopPropagation(); 
                  handleOpenUrl(update.download_url || update.url || `https://www.google.com/search?q=${encodeURIComponent(useStore.getState().activeGameSchema?.display_name || "Mod")}+${encodeURIComponent(cleanSearchName(update.displayName || update.name || "", useStore.getState().activeGameSchema))}`); 
                }} 
                className={`relative group/actionbtn w-8 h-8 rounded-[max(0px,calc(var(--radius)-4px))] backdrop-blur-md border flex items-center justify-center transition-all shadow-sm hover:shadow-md hover:scale-105 pointer-events-auto theme-panel-accent border-[var(--accent)] theme-text-accent`}
              >
                <span className="material-symbols-outlined !text-[16px]">{update.download_url || update.url ? (t("icon_download")) : (t("icon_search"))}</span>
                <HoverTooltip className="z-[100] !right-0 !translate-x-0 !left-auto" title={update.download_url || update.url ? (t("btn_download")) : (t("btn_search_web"))} variant="accent" />
              </button>
            </div>
          }
          badges={
            <div className="flex flex-wrap items-center gap-2">
               <div className="backdrop-blur-md bg-cyan-400/10 border border-cyan-400/30 px-2 py-0.5 rounded-[max(0px,calc(var(--radius)-8px))] shadow-sm flex items-center gap-1">
                 <span className="text-[7px] font-black uppercase tracking-widest text-cyan-400">{update.version || "v.Local"}</span>
                 <span className="opacity-40 mx-1 text-[8px] text-cyan-400">-</span> 
                 <span className="theme-text-accent font-black text-[7px] uppercase tracking-widest">{update.newVersion}</span>
               </div>
               {update.newGameVersion && (
                 <div className="backdrop-blur-md bg-purple-500/10 border border-purple-500/30 px-2 py-0.5 rounded-[max(0px,calc(var(--radius)-8px))] shadow-sm flex items-center gap-1">
                   <span className="material-symbols-outlined !text-[10px] text-purple-500">{t("icon_sports_esports")}</span>
                   <span className="text-[7px] font-black uppercase tracking-widest text-purple-500">{update.newGameVersion}</span>
                 </div>
               )}
            </div>
          }
        />
      </div>
    </div>
  );
}

export function UpdatesSidePanel({
  isOpen,
  onClose,
  activeUpdates,
  handleOpenUrl
}: any) {
  const { t } = useLexicon();
  const activeGameSchema = useStore((state: any) => state.activeGameSchema);
  const setShowUpdatesModal = (val: boolean) => !val && onClose();

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("updates_modal_title")}
      subtitle={t("system_core")}
      icon={t("icon_update")}
      iconColorClass="text-[var(--accent)] border-[var(--accent)]/[30%]"
      widthClass="w-[550px]"
    >
      <div className="flex flex-col gap-4 w-full">
        <div className="px-1 py-2 shrink-0 flex flex-col gap-4 relative">
          <div className="flex items-center justify-start w-full relative z-10">
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

        <div className={activeUpdates.length === 0 ? "flex flex-col gap-3 pb-24" : "grid grid-cols-2 gap-4 pb-24"}>
          {activeUpdates.length > 0 ? Object.values(activeUpdates.reduce((acc: any, update: any) => {
            const key = update.dbId || update.displayName || update.name;
            if (!acc[key]) acc[key] = update;
            return acc;
          }, {})).map((update: any) => (
             <UpdateModCard 
               key={update.hash || update.name} 
               update={update} 
               handleOpenUrl={handleOpenUrl} 
               t={t} 
               activeGameSchema={activeGameSchema}
             />
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
