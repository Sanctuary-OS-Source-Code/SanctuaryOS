import React from "react";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";

export function ArtifactCard({ mod, activeModId, onClick, masonsList, overrideActionLabel, onRemove }: { mod: any, activeModId?: string, onClick: () => void, masonsList?: any[], overrideActionLabel?: string, onRemove?: (e: React.MouseEvent) => void }) {
  const { t } = useLexicon();
  const showImages = useStore((state: any) => state.showImages);
  
  const masonName = masonsList?.find((m: any) => m.id === mod.mason_id)?.name || mod.master_author || mod.suggested_author || "";
  const cleanStatus = (mod.status || "unverified").replace(/_/g, ' ').replace(/[^\w\s-]/gi, '').trim();

  return (
    <div onClick={onClick} className={`theme-glass-panel rounded-[1.5rem] flex flex-col group cursor-pointer border hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 overflow-hidden relative ${activeModId === mod.id ? 'theme-border-accent ring-2 ring-[var(--accent)]/50' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>
      
      {onRemove && (
        <button onClick={(e) => { e.stopPropagation(); onRemove(e); }} className="absolute top-4 left-4 z-[50] w-8 h-8 rounded-full bg-black/50 backdrop-blur-md border border-white/10 hover:bg-red-500/80 hover:border-red-500/50 flex items-center justify-center text-white/70 hover:text-white transition-all shadow-lg shadow-black/20">
          <span className="material-symbols-outlined !text-[16px]">{t("ui_icon_close") || "close"}</span>
        </button>
      )}

      <div className="p-0 flex flex-col items-center justify-center relative bg-[var(--sidebar)] h-36 shrink-0 overflow-hidden">
        {(showImages && mod.image_url) ? (
          <img src={mod.image_url} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/10 to-transparent group-hover:from-[var(--accent)]/15 transition-colors duration-500 flex items-center justify-center">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--accent)]/10 rounded-full blur-[30px] pointer-events-none mix-blend-screen" />
              <span className="material-symbols-outlined !text-[72px] opacity-60 group-hover:opacity-100 theme-text-accent transition-all duration-500 drop-shadow-lg group-hover:scale-110 relative z-10">
                {t("ui_icon_artifact_card") || "deployed_code"}
              </span>
          </div>
        )}
        {cleanStatus && (
          <div className={`absolute top-4 right-4 text-[9px] font-black px-3 py-1 backdrop-blur-md rounded-lg uppercase tracking-widest shadow-lg z-20 border ${cleanStatus === 'verified' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20' : cleanStatus === 'broken' ? 'bg-red-500/20 text-red-400 border-red-500/20' : 'bg-amber-500/20 text-amber-400 border-amber-500/20'}`}>
            {cleanStatus}
          </div>
        )}
      </div>
      
      <div className="relative h-px bg-[color-mix(in_srgb,var(--text)_5%,transparent)] w-full flex items-center justify-center z-20" />
      
      <div className="flex flex-col p-5 w-full flex-1 relative bg-gradient-to-tr from-[var(--bg)]/5 to-transparent group-hover:from-[var(--accent)]/5 transition-colors duration-500">
        <span className="text-xl font-black text-[var(--text)] uppercase tracking-tighter truncate leading-tight group-hover:theme-text-accent transition-colors block w-full mb-1 relative z-10">
          {mod.name || t("mason_unnamed_artifact") || "UNNAMED"}
        </span>
        
        <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest truncate font-mono relative z-10">
            {mod.id}
        </span>
      </div>
      
      <div className="p-4 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-white/5 flex gap-2 relative z-10 items-center justify-between">
          <span className="text-[10px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest flex items-center gap-1.5 truncate pr-2">
            {mod.category_override || mod.suggested_type || t("registry_label_class2") || "Unknown"}
          </span>
          <button className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 shrink-0">
            {overrideActionLabel || t("ui_btn_edit") || "EDIT"} <span className="text-lg leading-none">&rarr;</span>
          </button>
      </div>
    </div>
  );
}

export function CollectionCard({ setItem, activeSetId, onClick, masonsList, masonNameFallback }: { setItem: any, activeSetId?: string, onClick: () => void, masonsList?: any[], masonNameFallback?: string }) {
  const { t } = useLexicon();
  const showImages = useStore((state: any) => state.showImages);
  const masonName = masonsList?.find((m: any) => m.id === setItem.mason_id)?.name || setItem.creator_name || masonNameFallback || t("registry_col_mason") || "MASON / CREATOR";

  return (
    <div onClick={onClick} className={`theme-glass-panel rounded-[1.5rem] flex flex-col group cursor-pointer border hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 overflow-hidden relative ${activeSetId === setItem.id ? 'theme-border-accent ring-2 ring-[var(--accent)]/50' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>
      
      <div className="p-0 flex flex-col items-center justify-center relative bg-[var(--sidebar)] h-36 shrink-0 overflow-hidden">
        {(showImages && setItem.image_url) ? (
          <img src={setItem.image_url} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/10 to-transparent group-hover:from-[var(--accent)]/15 transition-colors duration-500 flex items-center justify-center">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--accent)]/10 rounded-full blur-[30px] pointer-events-none mix-blend-screen" />
              <span className="material-symbols-outlined !text-[72px] opacity-60 group-hover:opacity-100 theme-text-accent transition-all duration-500 drop-shadow-lg group-hover:scale-110 relative z-10">
                {t("ui_icon_collections_card") || "collections_bookmark"}
              </span>
          </div>
        )}
        <div className="absolute top-4 right-4 text-[9px] font-black px-3 py-1 backdrop-blur-md rounded-lg uppercase tracking-widest shadow-lg z-20 border bg-amber-500/20 text-amber-400 border-amber-500/20">
          {t("vault_stat_tier") || "TIER"} {setItem.compliance_tier || 0}
        </div>
      </div>
      
      <div className="relative h-px bg-[color-mix(in_srgb,var(--text)_5%,transparent)] w-full flex items-center justify-center z-20" />
      
      <div className="flex flex-col p-5 w-full flex-1 relative bg-gradient-to-tr from-[var(--bg)]/5 to-transparent group-hover:from-[var(--accent)]/5 transition-colors duration-500">
        <span className="text-xl font-black text-[var(--text)] uppercase tracking-tighter truncate leading-tight group-hover:theme-text-accent transition-colors block w-full mb-1 relative z-10">
          {setItem.name || "UNNAMED COLLECTION"}
        </span>
        
        <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest truncate font-mono relative z-10">
            {setItem.id}
        </span>
      </div>
      
      <div className="p-4 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-white/5 flex gap-2 relative z-10 items-center justify-between">
          <span className="text-[10px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest flex items-center gap-1.5 truncate pr-2">
            {masonName}
          </span>
          <button className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 shrink-0">
            {t("ui_btn_edit") || "EDIT"} <span className="text-lg leading-none">&rarr;</span>
          </button>
      </div>
    </div>
  );
}
