import { useState } from "react";
import { formatDisplayName } from "./shared";
import { useLexicon } from "./LexiconContext";
import defaultCover from "./assets/default-cover.jpg"; // Adjust path as needed

export function ModCard({ mod, isInActiveSet, onSelect, onToggleSet, ownedDLC = [],
maskedDLC =[], casualtyList = "", tier3List = "", isParent = false, isExpanded = false, onExpand = () => {},
isBulkMode = false, isSelected = false, onToggleSelect = () => {}, onResolveTier3 = () => {} }: any) {
  const { t } = useLexicon();
  const [confirmMode, setConfirmMode] = useState<'casualty' | 'dlc' | 'tier3' | null>(null);

  const missingPacks = mod.requiredDLC?.filter((p: string) => !ownedDLC.includes(p) || maskedDLC.includes(p)) || [];
  const isGhosted = missingPacks.length > 0;
  const isNemesisEquipped = !isInActiveSet && casualtyList.length > 0;
  
  // Shadow Card condition
  const isShadowed = isGhosted || isNemesisEquipped;
  
  let reqCount = mod.requirements?.length || 0;
  if (!reqCount && mod.flavors) {
     const allReqs = new Set();
     mod.flavors.forEach((f: any) => f.requirements?.forEach((r: string) => allReqs.add(r)));
     reqCount = allReqs.size;
  }

  const handleToggleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isInActiveSet) {
        if (isGhosted) { setConfirmMode('dlc'); return; }
        if (casualtyList.length > 0) { setConfirmMode('casualty'); return; }
    }
    if (isInActiveSet && casualtyList.length > 0) { setConfirmMode('casualty'); return; }
    onToggleSet(e);
  };

  return (
    <div className="relative group/shadow h-full">
      {/* SHADOW CARD INFO BUTTON REMOVED */}

      <div 
        onClick={(e) => { if (isShadowed) { e.preventDefault(); return; } onSelect(e); }} 
        className={`relative flex flex-col h-full theme-glass-panel rounded-[2.5rem] overflow-hidden transition-all duration-500 ${isShadowed ? 'opacity-30 grayscale pointer-events-none border-[var(--danger)]' : 'cursor-pointer hover:scale-[1.02] hover:bg-black/5'}`}
      >
      {/* ⚠️ THE ALERT OVERLAY */}
      {confirmMode && (
        <div 
          className={`absolute inset-0 z-[60] rounded-[2.5rem] flex flex-col p-5 border-2 animate-in fade-in zoom-in-95 shadow-xl ${
            confirmMode === 'tier3' ? 'theme-border-warning' : 'theme-border-danger'
          }`} 
          style={{ backgroundColor: "var(--bg)" }}
        >
          <div className="flex items-center gap-2 mb-3 shrink-0">
            <div className="flex flex-col">
              <span className={`text-[10px] font-black uppercase tracking-widest ${confirmMode === 'tier3' ? 'text-orange-500' : 'theme-text-danger'}`}>
                {confirmMode === 'dlc' ? t("modcard_missing_dlc") : confirmMode === 'casualty' ? t("modcard_yeet_cascade") : "Tier 3 Conflict"}
              </span>
              <span className="text-[8px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-tighter">
                {confirmMode === 'dlc' ? "Protocol Override Required" : confirmMode === 'casualty' ? t("modcard_override_exclusive") : "Manual Resolution Required"}
              </span>
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-1.5 overflow-y-auto custom-scrollbar pr-1 mb-2">
            {confirmMode === 'dlc' ? (
              <>
                <p className="text-[8px] font-black text-[var(--subtext)] opacity-60 uppercase mb-1 ml-1">{t("modcard_req")}:</p>
                <div className="theme-glass-inner px-3 py-2 rounded-xl text-[9px] font-bold theme-text-danger truncate flex items-center gap-2">
                  {missingPacks.join(", ")}
                </div>
              </>
            ) : confirmMode === 'casualty' ? (
              <>
                <p className="text-[8px] font-black text-[var(--subtext)] opacity-60 uppercase mb-1 ml-1">{t("modcard_artifacts_removed") || t("modcard_removes")}</p>
                {casualtyList.split(', ').map((c: string) => (
                  <div key={c} className="theme-glass-inner px-3 py-2 rounded-xl text-[9px] font-bold text-[var(--text)]/80 truncate flex items-center gap-2">
                    {c.replace(/_/g, " ")}
                  </div>
                ))}
              </>
            ) : (
              <>
                <p className="text-[8px] font-black text-[var(--subtext)] opacity-60 uppercase mb-1 ml-1">Conflicts with:</p>
                {tier3List.split(', ').map((c: string) => (
                  <div key={c} className="theme-glass-inner px-3 py-2 rounded-xl text-[9px] font-bold text-[var(--text)]/80 truncate flex items-center gap-2">
                    {c}
                  </div>
                ))}
              </>
            )}
          </div>

          <div className="flex gap-2 pt-3 border-t border-white/10 shrink-0">
            {confirmMode === 'tier3' ? (
               <button onClick={(e) => { e.stopPropagation(); onResolveTier3(); setConfirmMode(null); }} className="flex-1 py-2.5 bg-orange-500 text-[var(--bg)] font-black rounded-xl text-[9px] uppercase tracking-widest hover:scale-[1.02] transition-transform shadow-[0_0_10px_rgba(249,115,22,0.4)]">Load Last</button>
            ) : (
               <button onClick={(e) => { e.stopPropagation(); onToggleSet(e); setConfirmMode(null); }} className={`flex-1 py-2.5 font-black rounded-xl text-[9px] uppercase tracking-widest hover:scale-[1.02] transition-transform ${confirmMode === 'dlc' ? 'theme-bg-success text-[var(--bg)] shadow-[0_0_10px_rgba(var(--success-rgb),0.4)]' : 'theme-bg-danger text-[var(--bg)] shadow-[0_0_10px_rgba(var(--danger-rgb),0.4)]'}`}>
                 {t("vault_btn_confirm")}
               </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); setConfirmMode(null); }} className="flex-1 py-2.5 bg-white/5 text-[var(--text)]/60 font-black rounded-xl text-[9px] uppercase tracking-widest border border-white/10 hover:bg-white/10 transition-all">{t("vault_btn_abort")}</button>
          </div>
        </div>
      )}

      {/* TOP IMAGE AREA */}
      <div className="relative h-40 overflow-hidden border-b border-white/5 shrink-0">
        <img 
  src={mod.image_url || mod.imageUrl || defaultCover} 
  onError={(e) => { (e.target as HTMLImageElement).src = defaultCover; }}
  className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
  alt="cover" 
/>
        {/* BULK MODE CHECKBOX */}
      {isBulkMode && (
        <div 
          onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
          className="absolute inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center cursor-pointer transition-all hover:bg-black/40"
        >
          <div className={`w-12 h-12 rounded-2xl border-2 flex items-center justify-center transition-all ${isSelected ? 'theme-bg-success border-transparent shadow-lg scale-110' : 'border-white/20 bg-black/50 hover:scale-105'}`}>
            {isSelected && <span className="text-2xl text-[var(--bg)] font-black">✓</span>}
          </div>
        </div>
      )}

        {/* STATUS LABEL (Top Left) */}
        <div className="absolute top-4 left-4 z-30 bg-black/40 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-xl shadow-2xl flex items-center gap-2 pointer-events-none">
          <div className="w-1.5 h-1.5 rounded-full shadow-[0_0_5px_rgba(255,255,255,0.5)]" style={{ backgroundColor: mod.color || '#666' }} />
          <span className="text-[8px] font-black uppercase text-[var(--text)]/80 tracking-widest">
            {(() => {
              const raw = (mod.status || "");
              const cleaned = raw.replace(/[\[\]]/g, "");
              return cleaned.includes('status_') ? t(cleaned) : raw;
            })()}
          </span>
        </div>

        
        
        <div className="absolute top-3 right-3 z-40">
          {!mod.status?.includes('QUARANTINED') && (
            <button 
              onClick={handleToggleClick} 
              className={`w-9 h-9 rounded-full backdrop-blur-xl border-2 flex items-center justify-center font-black text-xl transition-all shadow-2xl ${isInActiveSet ? 'theme-bg-danger border-red-500 text-[var(--text)] rotate-45 shadow-lg' : 'theme-bg-success border-emerald-500 text-[var(--bg)] shadow-lg hover:scale-110'}`}
            >
              <span className="mt-[-4px] select-none">+</span>
            </button>
          )}
        </div>
      </div>

      {/* TEXT AREA */}
      <div className="p-5 flex flex-col flex-1">
        <h3 className="text-xs font-black truncate uppercase tracking-tight group-hover:theme-text-accent transition-colors mb-1">
          {formatDisplayName(mod.displayName || mod.name)}
        </h3>
        <p className="text-[9px] font-black text-[var(--text)]/30 uppercase tracking-widest truncate mb-4">
         {mod.author || t("bp_unknown_creator_full")}
        </p>

        {/* FOOTER ROW */}
        <div className="mt-auto pt-4 flex items-center justify-between border-t border-white/5">
          {isParent ? (
            <button 
              onClick={(e) => { e.stopPropagation(); onExpand(e); }} 
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all font-black text-[10px] ${isExpanded ? 'theme-bg-accent text-[var(--bg)] theme-border-accent' : 'bg-black/20 theme-text-accent border-white/10 hover:bg-black/40'}`}
            >
              <span>📂 {mod.flavors?.length || 0}</span>
              <span className="text-[8px] opacity-40">{isExpanded ? '▲' : '▼'}</span>
            </button>
          ) : <div />}
          
          <div className="flex items-center gap-1.5 ml-auto">
             {reqCount > 0 && (
               <div className="theme-panel-accent border px-1.5 py-0.5 rounded-md text-[7px] font-black theme-text-accent uppercase">
                 {reqCount} {t("modcard_req_short")}
               </div>
             )}
             {mod.isFlavorFolder && <span className="text-[10px]">⚡</span>}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}