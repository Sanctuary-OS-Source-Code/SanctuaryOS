import { useState } from "react";
import { formatDisplayName } from "./shared";
import { useLexicon } from "./LexiconContext";
import { openUrl } from "@tauri-apps/plugin-opener";
import defaultCover from "./assets/default-cover.jpg"; // Adjust path as needed

export function ModCard({ mod, isInActiveSet, onSelect, onToggleSet, ownedDLC = [],
maskedDLC =[], casualtyList = "", tier3List = "", missingDeps = "", isParent = false, isExpanded = false, onExpand = () => {},
isBulkMode = false, isSelected = false, onToggleSelect = () => {}, onResolveTier3 = () => {} }: any) {
  const { t } = useLexicon();
  const [confirmMode, setConfirmMode] = useState<'casualty' | 'dlc' | 'tier3' | 'broken' | null>(null);

  const missingPacks = mod.requiredDLC?.filter((p: string) => !ownedDLC.includes(p) || maskedDLC.includes(p)) || [];
  const hasMissingDeps = missingDeps.length > 0;
  const isGhosted = missingPacks.length > 0 || hasMissingDeps;
  const isNemesisEquipped = !isInActiveSet && casualtyList.length > 0;
  const brokenMods = mod.isVirtual && mod.flavors ? mod.flavors.filter((f: any) => f.status === t("status_broken") || f.status?.includes("BROKEN")) : [];
  
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
        if (brokenMods.length > 0) { setConfirmMode('broken'); return; }
    }
    if (isInActiveSet && casualtyList.length > 0) { setConfirmMode('casualty'); return; }
    onToggleSet(e);
  };

  return (
    <div className="relative group/shadow h-full">
      {/* ⚠️ THE CUSTOM HOVER TOOLTIP */}
      {isGhosted && !confirmMode && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-[70] hidden group-hover/shadow:flex bg-black/90 backdrop-blur-md border border-[var(--danger)] px-4 py-2.5 rounded-xl shadow-[0_0_20px_rgba(var(--danger-rgb),0.5)] items-center justify-center whitespace-nowrap text-[10px] font-black theme-text-danger max-w-[280px] pointer-events-none transition-all animate-in fade-in slide-in-from-bottom-2">
          <div className="truncate">
            {hasMissingDeps ? `MISSING ARTIFACT: ${missingDeps.map((d: any) => String(typeof d === 'string' ? d : (d.id || d.name || '')).split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, "")).join(", ")}` : `MISSING DLC: ${missingPacks.join(", ")}`}
          </div>
        </div>
      )}

      {/* ⚠️ THE ALERT OVERLAY */}
      {confirmMode && (
        <div 
          className={`absolute inset-0 z-[60] rounded-[2.5rem] flex flex-col p-5 border-2 animate-in fade-in zoom-in-95 shadow-2xl ${
            confirmMode === 'tier3' ? 'theme-border-warning' : 'theme-border-danger'
          }`} 
          style={{ backgroundColor: "var(--bg)" }}
        >
          <div className="flex items-center gap-2 mb-3 shrink-0">
            <div className="flex flex-col">
              <span className={`text-[10px] font-black uppercase tracking-widest ${confirmMode === 'tier3' ? 'text-orange-500' : 'theme-text-danger'}`}>
                {confirmMode === 'dlc' ? (hasMissingDeps ? "Missing Artifacts" : t("modcard_missing_dlc")) : confirmMode === 'casualty' ? t("modcard_yeet_cascade") : confirmMode === 'broken' ? "Broken Artifacts" : "Tier 3 Conflict"}
              </span>
              <span className="text-[8px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-tighter">
                {confirmMode === 'dlc' ? "Protocol Override Required" : confirmMode === 'casualty' ? t("modcard_override_exclusive") : confirmMode === 'broken' ? "Review Before Equipping" : "Manual Resolution Required"}
              </span>
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-1.5 overflow-y-auto custom-scrollbar pr-1 mb-2">
            {confirmMode === 'dlc' ? (
              <>
                <p className="text-[8px] font-black text-[var(--subtext)] opacity-60 uppercase mb-1 ml-1">{t("modcard_req")}:</p>
                {missingPacks.length > 0 && (
                  <div className="theme-glass-inner px-3 py-2 rounded-xl text-[9px] font-bold theme-text-danger truncate flex items-center gap-2 mb-2">
                    {missingPacks.join(", ")}
                  </div>
                )}
                {hasMissingDeps && (
                  <>
                    <p className="text-[8px] font-black text-[var(--subtext)] opacity-60 uppercase mb-1 ml-1">Missing Artifacts:</p>
                    {missingDeps.map((req: any) => {
                      const reqIdStr = String(typeof req === 'string' ? req : (req.id || req.name || ''));
                      const reqUrl = typeof req === 'string' ? null : req.url;
                      const cleanName = reqIdStr.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, "") || reqIdStr;
                      const searchUrl = reqUrl || `https://www.google.com/search?q=Sims+4+${encodeURIComponent(cleanName)}`;
                      return (
                        <a 
                          key={reqIdStr} 
                          href="#" 
                          className="theme-glass-inner px-3 py-2 rounded-xl text-[9px] font-bold theme-text-danger truncate flex items-center justify-between gap-2 mb-1 hover:bg-white/10 transition-colors cursor-pointer" 
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); openUrl(searchUrl); }}
                        >
                          <span className="truncate">{cleanName}</span>
                          <span className="text-[10px] opacity-70">🔗</span>
                        </a>
                      );
                    })}
                  </>
                )}
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
            ) : confirmMode === 'broken' ? (
              <>
                <p className="text-[8px] font-black text-[var(--subtext)] opacity-60 uppercase mb-1 ml-1">Broken Items:</p>
                {brokenMods.map((b: any) => (
                  <div key={b.name} className="theme-glass-inner px-3 py-2 rounded-xl text-[9px] font-bold theme-text-danger truncate flex items-center gap-2 mb-1">
                    {formatDisplayName(b.displayName || b.name)}
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
               <button onClick={(e) => { e.stopPropagation(); onResolveTier3(); setConfirmMode(null); }} className="flex-1 py-2.5 bg-orange-500 text-[var(--bg)] font-black rounded-xl text-[9px] uppercase tracking-widest hover:scale-[1.02] transition-transform shadow-[0_0_10px_rgba(249,115,22,0.4)]">{t("modcard_btn_load_last")}</button>
            ) : confirmMode === 'broken' ? (
               <>
                 <button onClick={(e) => { e.stopPropagation(); onToggleSet(e, false); setConfirmMode(null); }} className="flex-1 py-2.5 theme-bg-danger text-[var(--bg)] font-black rounded-xl text-[9px] uppercase tracking-widest hover:scale-[1.02] transition-transform shadow-[0_0_10px_rgba(var(--danger-rgb),0.4)]">{t("modcard_btn_proceed")}</button>
                 <button onClick={(e) => { e.stopPropagation(); onToggleSet(e, true); setConfirmMode(null); }} className="flex-1 py-2.5 bg-white/5 text-[var(--text)]/60 font-black rounded-xl text-[9px] uppercase tracking-widest border border-white/10 hover:bg-white/10 transition-all">{t("modcard_btn_add_not_broken")}</button>
               </>
            ) : (
               <button onClick={(e) => { e.stopPropagation(); onToggleSet(e); setConfirmMode(null); }} className="flex-1 py-2.5 theme-bg-danger text-[var(--bg)] font-black rounded-xl text-[9px] uppercase tracking-widest hover:scale-[1.02] transition-transform shadow-[0_0_10px_rgba(var(--danger-rgb),0.4)]">
                 {t("modcard_btn_proceed")}
               </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); setConfirmMode(null); }} className="flex-1 py-2.5 theme-bg-success text-[var(--bg)] font-black rounded-xl text-[9px] uppercase tracking-widest hover:scale-[1.02] transition-transform shadow-[0_0_10px_rgba(var(--success-rgb),0.4)]">{t("modcard_btn_safety")}</button>
          </div>
        </div>
      )}

      <div 
        onClick={(e) => { if (isShadowed) { e.preventDefault(); return; } onSelect(e); }} 
        className={`relative flex flex-col h-full theme-glass-panel rounded-[2.5rem] overflow-hidden transition-all duration-500 ${isShadowed ? 'opacity-30 grayscale border-[var(--danger)]' : 'cursor-pointer hover:scale-[1.02] hover:bg-black/5'}`}
      >

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
              className={`w-9 h-9 rounded-full backdrop-blur-xl border-2 flex items-center justify-center font-black text-xl transition-all shadow-2xl ${isGhosted ? 'bg-orange-500 border-orange-400 text-white shadow-lg' : isInActiveSet ? 'theme-bg-danger border-red-500 text-[var(--text)] rotate-45 shadow-lg' : 'theme-bg-success border-emerald-500 text-[var(--bg)] shadow-lg hover:scale-110'}`}
            >
              {isGhosted ? (
                <span className="text-[14px]">{t("ui_icon_warning") || "⚠️"}</span>
              ) : (
                <span className="mt-[-4px] select-none">+</span>
              )}
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
        <div 
          className={`mt-auto pt-4 flex items-center justify-between border-t border-white/5 ${isParent ? 'cursor-pointer hover:bg-white/5 -mx-5 px-5 -mb-5 pb-5 rounded-b-[2.5rem] transition-colors' : ''}`}
          onClick={(e) => { if (isParent) { e.stopPropagation(); onExpand(e); } }}
        >
          {isParent ? (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all font-black text-[10px] ${isExpanded ? 'theme-bg-accent text-[var(--bg)] theme-border-accent' : 'bg-black/20 theme-text-accent border-white/10'}`}>
              <span>📂 {mod.flavors?.length || 0}</span>
              <span className="text-[8px] opacity-40">{isExpanded ? '▲' : '▼'}</span>
            </div>
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