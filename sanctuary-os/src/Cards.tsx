import React, { useState } from "react";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";

export function ArtifactCard({ mod, activeModId, onClick, masonsList, overrideActionLabel, onRemove, layout = "vertical" }: { mod: any, activeModId?: string, onClick: () => void, masonsList?: any[], overrideActionLabel?: string, onRemove?: (e: React.MouseEvent) => void, layout?: "vertical" | "horizontal" }) {
  const { t } = useLexicon();
  const showImages = useStore((state: any) => state.showImages);
  const [confirmDelete, setConfirmDelete] = useState(false);
  
  const masonName = masonsList?.find((m: any) => m.id === mod.mason_id)?.name || mod.master_author || mod.suggested_author || "";
  const cleanStatus = (mod.status || "unverified").replace(/_/g, ' ').replace(/[^\w\s-]/gi, '').trim();

  return (
    <div onClick={onClick} className={`theme-glass-panel rounded-[var(--radius)] flex group cursor-pointer border hover:shadow-2xl hover:-translate-y-1 transition-all duration-500 overflow-hidden relative ${activeModId === mod.id ? 'theme-border-accent ring-2 ring-[var(--accent)]/50' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)]'} ${layout === 'horizontal' ? 'flex-row items-center h-20' : 'flex-col'}`}>
      
      {onRemove && (
        <button 
          onClick={(e) => { 
            e.stopPropagation(); 
            if (confirmDelete) {
              onRemove(e); 
            } else {
              setConfirmDelete(true);
              setTimeout(() => setConfirmDelete(false), 2000);
            }
          }} 
          className={`absolute z-[50] w-8 h-8 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-all shadow-lg shadow-black/20 ${confirmDelete ? 'bg-red-500 hover:bg-red-600 border-red-500 scale-110' : 'hover:bg-red-500/30 hover:border-red-500/50 hover:shadow-[0_0_15px_rgba(239,68,68,0.2)]'} ${layout === 'horizontal' ? 'top-1/2 -translate-y-1/2 right-2' : 'top-4 left-4'}`}
        >
          <span className="material-symbols-outlined !text-[16px]">{confirmDelete ? (t("icon_warning_amber")) : (t("icon_close"))}</span>
        </button>
      )}

      <div className={`p-0 flex flex-col items-center justify-center relative bg-[var(--sidebar)] shrink-0 overflow-hidden ${layout === 'horizontal' ? 'w-20 h-full' : 'h-36 w-full'}`}>
        {(showImages && mod.image_url) ? (
          <img src={mod.image_url} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/10 to-transparent group-hover:from-[var(--accent)]/15 transition-colors duration-500 flex items-center justify-center">
              {layout === 'vertical' && <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--accent)]/10 rounded-full blur-[30px] pointer-events-none mix-blend-screen" />}
              <span className={`material-symbols-outlined opacity-60 group-hover:opacity-100 theme-text-accent transition-all duration-500 drop-shadow-lg group-hover:scale-110 relative z-10 ${layout === 'horizontal' ? '!text-[36px]' : '!text-[72px]'}`}>
                {t("icon_deployed_code")}
              </span>
          </div>
        )}
        {cleanStatus && layout === 'vertical' && (
          <div className={`absolute top-4 right-4 text-[9px] font-black px-3 py-1 backdrop-blur-md rounded-lg uppercase tracking-widest shadow-lg z-20 border ${cleanStatus === 'verified' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20' : cleanStatus === 'broken' ? 'bg-red-500/20 text-red-400 border-red-500/20' : 'bg-amber-500/20 text-amber-400 border-amber-500/20'}`}>
            {cleanStatus}
          </div>
        )}
        {mod?.file_extension && layout === 'vertical' && (
          <div className="absolute bottom-4 right-4 text-[9px] font-black px-3 py-1 backdrop-blur-md rounded-lg uppercase tracking-widest shadow-lg z-20 border bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] drop-shadow-md">
            {mod.file_extension.replace(/^\./, '')}
          </div>
        )}
      </div>
      
      {layout === 'vertical' && <div className="relative h-px bg-[color-mix(in_srgb,var(--text)_5%,transparent)] w-full flex items-center justify-center z-20" />}
      {layout === 'horizontal' && <div className="relative w-px bg-[color-mix(in_srgb,var(--text)_5%,transparent)] h-full flex items-center justify-center z-20 shrink-0" />}
      
      <div className={`flex flex-col self-stretch w-full flex-1 min-w-0 relative bg-gradient-to-tr from-[var(--bg)]/5 to-transparent group-hover:from-[var(--accent)]/5 transition-colors duration-500 ${layout === 'horizontal' ? 'justify-center p-3 pr-10' : 'p-5'}`}>
        <div className={`flex flex-col gap-1 relative z-10 w-full`}>
          <span className={`${layout === 'horizontal' ? 'text-xs' : 'text-xl'} font-black text-[var(--text)] uppercase tracking-tighter leading-tight group-hover:theme-text-accent transition-colors ${layout === 'horizontal' ? 'line-clamp-1' : 'truncate'} w-full`}>
            {mod?.name || t("unnamed_artifact") || "UNNAMED"}
          </span>
          
          {layout === 'horizontal' && (
            <div className="flex items-center gap-2 w-full mt-1">
              {cleanStatus && (
                <div className={`text-[8px] font-black px-1.5 py-0.5 backdrop-blur-md rounded-md uppercase tracking-widest border shrink-0 ${cleanStatus === 'verified' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20' : cleanStatus === 'broken' ? 'bg-red-500/20 text-red-400 border-red-500/20' : 'bg-amber-500/20 text-amber-400 border-amber-500/20'}`}>
                  {cleanStatus}
                </div>
              )}
              <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest truncate font-mono">
                {mod?.category_override || mod?.suggested_type || t("unknown") || "Unknown"}
              </span>
              {mod?.file_extension && (
                <div className="text-[8px] font-black px-1.5 py-0.5 backdrop-blur-md rounded-md uppercase tracking-widest border shrink-0 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] ml-2">
                  {mod.file_extension.replace(/^\./, '')}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      {layout === 'vertical' && (
        <div className="p-4 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-white/5 flex gap-2 relative z-10 items-center justify-between">
            <span className="text-[10px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest flex items-center gap-1.5 truncate pr-2">
              {mod?.category_override || mod?.suggested_type || t("unknown") || "Unknown"}
            </span>
            <button className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 shrink-0">
              {overrideActionLabel || t("emote_edit") || "EDIT"} <span className="text-lg leading-none">&rarr;</span>
            </button>
        </div>
      )}
    </div>
  );
}

export function VaultCard({ setItem, activeSetId, onClick, masonsList, masonNameFallback }: { setItem: any, activeSetId?: string, onClick: () => void, masonsList?: any[], masonNameFallback?: string }) {
  const { t } = useLexicon();
  const showImages = useStore((state: any) => state.showImages);
  const masonName = masonsList?.find((m: any) => m.id === setItem.mason_id)?.name || setItem.creator_name || masonNameFallback || t("label_select") || "MASON / CREATOR";

  return (
    <div onClick={onClick} className={`theme-glass-panel rounded-[var(--radius)] flex flex-col group cursor-pointer border hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 overflow-hidden relative ${activeSetId === setItem.id ? 'theme-border-accent ring-2 ring-[var(--accent)]/50' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>
      
      <div className="p-0 flex flex-col items-center justify-center relative bg-[var(--sidebar)] h-36 shrink-0 overflow-hidden">
        {(showImages && setItem.image_url) ? (
          <img src={setItem.image_url} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/10 to-transparent group-hover:from-[var(--accent)]/15 transition-colors duration-500 flex items-center justify-center">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--accent)]/10 rounded-full blur-[30px] pointer-events-none mix-blend-screen" />
              <span className="material-symbols-outlined !text-[72px] opacity-60 group-hover:opacity-100 theme-text-accent transition-all duration-500 drop-shadow-lg group-hover:scale-110 relative z-10">
                {t("icon_collections_bookmark")}
              </span>
          </div>
        )}
        <div className="absolute top-4 right-4 text-[9px] font-black px-3 py-1 backdrop-blur-md rounded-lg uppercase tracking-widest shadow-lg z-20 border bg-amber-500/20 text-amber-400 border-amber-500/20">
          {t("stat_tier")} {setItem.compliance_tier || 0}
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
            {t("emote_edit")} <span className="text-lg leading-none">&rarr;</span>
          </button>
      </div>
    </div>
  );
}
