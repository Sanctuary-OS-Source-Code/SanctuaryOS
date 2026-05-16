import { useState } from "react";
import { formatDisplayName, mapDlcCode, isVersionMatch, getHighestVersion } from "./shared";
import { useLexicon } from "./LexiconContext";
import { openUrl } from "@tauri-apps/plugin-opener";
import defaultCover from "./assets/default-cover.jpg";

export function ModCard({ mod, gameVersion, isInActiveSet, onSelect, onToggleSet, ownedDLC = [],
maskedDLC =[], casualtyList = [], tier3List = [], missingDeps = "", isParent = false, isExpanded = false, onExpand = () => {},
isBulkMode = false, isSelected = false, onToggleSelect = () => {}, onResolveTier3 = () => {}, anarchyRules = null, hideIneligible = false }: any) {
  const { t } = useLexicon();
  const [confirmMode, setConfirmMode] = useState<'casualty' | 'dlc' | 'tier3' | 'broken' | null>(null);

  let rawDLC = mod.requiredDLC || [];
  if (typeof rawDLC === 'string') rawDLC = rawDLC.split(',').map((s: string) => s.trim());
  
  let missingPacks = rawDLC.filter((p: string) => {
    const baseCode = p.split(' ')[0].toUpperCase();
    return !ownedDLC.includes(baseCode) || maskedDLC.includes(baseCode);
  });


  
  const hasMissingDeps = missingDeps.length > 0;

  const isDirectMismatch = gameVersion && mod.compatible_versions && mod.compatible_versions.length > 0 && !isVersionMatch(mod.compatible_versions, gameVersion);
  const childMismatch = mod.flavors?.filter((f: any) => gameVersion && f.compatible_versions && f.compatible_versions.length > 0 && !isVersionMatch(f.compatible_versions, gameVersion));
  const isChildMismatch = childMismatch && childMismatch.length > 0 && childMismatch.length === mod.flavors?.length;
  
  const isGameVersionMismatch = (mod.isVirtual && mod.flavors && mod.flavors.length > 0 ? isChildMismatch : isDirectMismatch) || mod.ghostReason === "VERSION_MISMATCH";
  const isGhosted = missingPacks.length > 0 || hasMissingDeps || isGameVersionMismatch || mod.isGhosted;

  if (hideIneligible && isGhosted) {
    return null;
  }

  const requiredVersions = isChildMismatch 
    ? Array.from(new Set(childMismatch.flatMap((c: any) => Array.isArray(c.compatible_versions) ? c.compatible_versions : typeof c.compatible_versions === 'string' ? [c.compatible_versions] : [])))
    : mod.compatible_versions;
  const isNemesisEquipped = !isInActiveSet && casualtyList.length > 0 && !casualtyList.every((c: any) => mod.flavors?.some((f: any) => f.name === (c.name || c) || f.displayName === (c.name || c) || (c.name || c) === (f.displayName || f.name)));
  const isSelfBroken = typeof mod.status === 'string' && mod.status.toLowerCase() === 'broken';
  const brokenMods = (mod.isVirtual && mod.flavors ? mod.flavors.filter((f: any) => typeof f.status === 'string' && f.status.toLowerCase() === 'broken') : []).concat(isSelfBroken ? [mod] : []);

  const isShadowed = isGhosted || isNemesisEquipped || brokenMods.length > 0;
  const hasTier3 = tier3List.length > 0;
  
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
        if (hasTier3) { setConfirmMode('tier3'); return; }
        if (brokenMods.length > 0) { setConfirmMode('broken'); return; }
    }
    if (isInActiveSet && casualtyList.length > 0) { setConfirmMode('casualty'); return; }
    onToggleSet(e, true);
  };

  return (
    <div className="relative group/shadow h-full">
        {(isShadowed || hasTier3) && !confirmMode && (
          <div 
            className={`absolute -top-12 left-1/2 -translate-x-1/2 z-[70] hidden group-hover/shadow:flex flex-col items-center justify-center bg-black/90 backdrop-blur-md border px-4 py-2.5 rounded-xl whitespace-nowrap max-w-[280px] pointer-events-none transition-all animate-in fade-in slide-in-from-bottom-2 ${isShadowed ? 'border-[var(--danger)] theme-text-danger shadow-[0_0_20px_rgba(var(--danger-rgb),0.5)]' : 'border-orange-500 text-orange-500 shadow-[0_0_20px_rgba(249,115,22,0.5)]'}`}
          >
            <div className="text-[9px] font-black uppercase opacity-70 mb-0.5">
              {isNemesisEquipped ? t("modcard_fatal_conflict") : hasMissingDeps ? t("modcard_missing_artifacts") : isGameVersionMismatch ? t("vault_unsupported_version") : isGhosted ? t("modcard_missing_dlc") : t("ui_icon_warning")}
            </div>
            <div className="text-[11px] font-black w-full text-center whitespace-normal leading-tight">
              {isNemesisEquipped 
                ? formatDisplayName(casualtyList[0]?.name || casualtyList[0] || "") + (casualtyList[0]?.note ? ` - ${casualtyList[0].note}` : "") + (casualtyList.length > 1 ? ` (+${casualtyList.length - 1})` : "")
                : hasMissingDeps 
                  ? formatDisplayName(typeof missingDeps[0] === 'string' ? missingDeps[0] : (missingDeps[0]?.name || missingDeps[0]?.id || '')) + (missingDeps.length > 1 ? ` (+${missingDeps.length - 1})` : "")
                  : isGameVersionMismatch
                  ? `Required: ${getHighestVersion(requiredVersions || [])} | Current: ${gameVersion || "Unknown"}`
                  : isGhosted
                  ? missingPacks.map((p: string) => mapDlcCode(p)).join(", ")
                  : hasTier3
                  ? formatDisplayName(tier3List[0]?.name || tier3List[0] || "") + (tier3List[0]?.note ? ` - ${tier3List[0].note}` : "")
                  : ""
              }
            </div>
          </div>
        )}

      {confirmMode && (
          <div 
            className={`absolute inset-0 z-[60] rounded-[2.5rem] flex flex-col p-5 border-2 animate-in fade-in zoom-in-95 shadow-2xl bg-black/95 backdrop-blur-xl ${
              confirmMode === 'tier3' ? 'theme-border-warning' : 'theme-border-danger'
            }`} 
          >
          <div className="flex items-center gap-2 mb-3 shrink-0">
            <div className="flex flex-col">
              <span className={`text-[10px] font-black uppercase tracking-widest ${confirmMode === 'tier3' ? 'text-orange-500' : 'theme-text-danger'}`}>
                {confirmMode === 'dlc' ? (isGameVersionMismatch ? t("vault_unsupported_version") : hasMissingDeps ? t("modcard_missing_artifacts") : t("modcard_missing_dlc")) : confirmMode === 'casualty' ? t("modcard_yeet_cascade") : confirmMode === 'broken' ? t("modcard_broken_artifacts") : t("modcard_tier3_conflict")}
              </span>
              <span className="text-[8px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-tighter">
                {confirmMode === 'dlc' ? "Protocol Override Required" : confirmMode === 'casualty' ? t("modcard_override_exclusive") : confirmMode === 'broken' ? t("modcard_review_before") : t("modcard_manual_resolution")}
              </span>
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-1.5 overflow-y-auto custom-scrollbar pr-1 mb-2">
            {confirmMode === 'dlc' ? (
              <>
                {isGameVersionMismatch && (
                  <>
                    <p className="text-[8px] font-black text-[var(--subtext)] opacity-60 uppercase mb-1 ml-1">REQUIRED PATCH(ES):</p>
                    <div className="theme-glass-inner px-3 py-2 rounded-xl text-[9px] font-bold theme-text-danger truncate flex items-center gap-2 mb-2 shrink-0">
                      {getHighestVersion(requiredVersions || [])}
                    </div>
                  </>
                )}
                {missingPacks.length > 0 && (
                  <>
                    <p className="text-[8px] font-black text-[var(--subtext)] opacity-60 uppercase mb-1 ml-1">{t("modcard_req")}:</p>
                    <div className="theme-glass-inner px-3 py-2 rounded-xl text-[9px] font-bold theme-text-danger truncate flex items-center gap-2 mb-2 shrink-0">
                      {missingPacks.join(", ")}
                    </div>
                  </>
                )}
                {hasMissingDeps && (
                  <>
                <p className="text-[8px] font-black text-[var(--subtext)] opacity-60 uppercase mb-1 ml-1">{t("modcard_missing_artifacts")}:</p>
                {missingDeps.map((req: any) => {
                      const reqIdStr = String(typeof req === 'string' ? req : (req.id || req.name || ''));
                      const reqUrl = typeof req === 'string' ? null : req.url;
                      const cleanName = reqIdStr.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, "") || reqIdStr;
                      const searchUrl = reqUrl || `https://www.google.com/search?q=Sims+4+${encodeURIComponent(cleanName)}`;
                      return (
                        <a 
                          key={reqIdStr} 
                          href="#" 
                          className="theme-glass-inner px-3 py-2 rounded-xl text-[9px] font-bold theme-text-danger truncate flex items-center justify-between gap-2 mb-1 hover:bg-white/10 transition-colors cursor-pointer shrink-0" 
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); openUrl(searchUrl); }}
                        >
                          <span className="truncate">{cleanName}</span>
                          <span className="text-[10px] opacity-70">{t("ui_icon_link")}</span>
                        </a>
                      );
                    })}
                  </>
                )}
              </>
            ) : confirmMode === 'casualty' ? (
              <>
                <p className="text-[8px] font-black text-[var(--subtext)] opacity-60 uppercase mb-1 ml-1">{anarchyRules?.intercept === false ? t("modcard_known_clashes") : (t("modcard_artifacts_removed") || t("modcard_removes"))}</p>
                {casualtyList.map((c: any) => (
                  <div key={c.name || c} className="theme-glass-inner px-3 py-2 rounded-xl text-[9px] font-bold text-[var(--text)]/80 truncate flex flex-col items-start gap-0.5 shrink-0">
                    <span className="flex items-center gap-2">{formatDisplayName(c.name || c)}</span>
                    {c.note && <span className="opacity-60 text-[7px] uppercase whitespace-normal leading-tight">{c.note}</span>}
                  </div>
                ))}
              </>
            ) : confirmMode === 'broken' ? (
              <>
                <p className="text-[8px] font-black text-[var(--subtext)] opacity-60 uppercase mb-1 ml-1">{t("modcard_broken_artifacts")}:</p>
                {brokenMods.map((b: any) => (
                  <div key={b.name} className="theme-glass-inner px-3 py-2 rounded-xl text-[9px] font-bold theme-text-danger truncate flex items-center gap-2 mb-1 shrink-0">
                    {formatDisplayName(b.displayName || b.name)}
                  </div>
                ))}
              </>
            ) : (
              <>
                <p className="text-[8px] font-black text-[var(--subtext)] opacity-60 uppercase mb-1 ml-1">Conflicts with:</p>
                {tier3List.map((c: any) => (
                  <div key={c.name || c} className="theme-glass-inner px-3 py-2 rounded-xl text-[9px] font-bold text-[var(--text)]/80 truncate flex flex-col items-start gap-0.5 shrink-0">
                    <span className="flex items-center gap-2">{formatDisplayName(c.name || c)}</span>
                    {c.note && <span className="opacity-60 text-[7px] uppercase whitespace-normal leading-tight">{c.note}</span>}
                  </div>
                ))}
              </>
            )}
          </div>

          <div className="flex gap-2 pt-3 border-t border-white/10 shrink-0">
            {confirmMode === 'tier3' ? (
               <button onClick={(e) => { e.stopPropagation(); onToggleSet(e, false); setConfirmMode(null); }} className="flex-1 py-2.5 bg-orange-500 text-[var(--bg)] font-black rounded-xl text-[9px] uppercase tracking-widest hover:scale-[1.02] transition-transform shadow-[0_0_10px_rgba(249,115,22,0.4)]">{t("modcard_btn_proceed")}</button>
            ) : confirmMode === 'broken' ? (
               <>
                 <button onClick={(e) => { e.stopPropagation(); onToggleSet(e, false); setConfirmMode(null); }} className="flex-1 py-2.5 theme-bg-danger text-[var(--bg)] font-black rounded-xl text-[9px] uppercase tracking-widest hover:scale-[1.02] transition-transform shadow-[0_0_10px_rgba(var(--danger-rgb),0.4)]">{t("modcard_btn_proceed")}</button>
                 <button onClick={(e) => { e.stopPropagation(); onToggleSet(e, true); setConfirmMode(null); }} className="flex-1 py-2.5 bg-white/5 text-[var(--text)]/60 font-black rounded-xl text-[9px] uppercase tracking-widest border border-white/10 hover:bg-white/10 transition-all">{t("modcard_btn_add_not_broken")}</button>
               </>
            ) : (
               <button onClick={(e) => { e.stopPropagation(); onToggleSet(e, false); setConfirmMode(null); }} className="flex-1 py-2.5 theme-bg-danger text-[var(--bg)] font-black rounded-xl text-[9px] uppercase tracking-widest hover:scale-[1.02] transition-transform shadow-[0_0_10px_rgba(var(--danger-rgb),0.4)]">
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

      <div className="relative h-40 overflow-hidden border-b border-white/5 shrink-0">
        <img 
  src={mod.image_url || mod.imageUrl || defaultCover} 
  onError={(e) => { (e.target as HTMLImageElement).src = defaultCover; }}
  className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
  alt="cover" 
/>
        
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

        <div className="absolute top-4 left-4 z-30 group/badge pointer-events-auto cursor-help">
          <div className="bg-black/40 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-xl shadow-2xl flex items-center gap-2 transition-all group-hover/badge:bg-black/60">
            <div className="w-1.5 h-1.5 rounded-full shadow-[0_0_5px_rgba(255,255,255,0.5)]" style={{ backgroundColor: mod.color || '#666' }} />
            <span className="text-[8px] font-black uppercase text-[var(--text)]/80 tracking-widest">
              {(() => {
                const raw = (mod.status || "");
                const cleaned = raw.replace(/[\[\]]/g, "");
                if (cleaned.toLowerCase() === 'broken') return t("status_broken");
                return cleaned.includes('status_') ? t(cleaned) : raw;
              })()}
            </span>
          </div>

          <div className="absolute top-full left-0 mt-2 hidden group-hover/badge:flex flex-col gap-2 bg-black/90 backdrop-blur-xl border border-white/10 px-4 py-3 rounded-2xl shadow-2xl z-[80] w-max animate-in fade-in slide-in-from-top-2 pointer-events-none">
            <div className="flex flex-col">
               <span className="text-[7px] font-black uppercase text-[var(--subtext)] opacity-60 tracking-[0.2em]">{t("dossier_revision")}</span>
               <span className="text-[10px] font-mono font-black text-[var(--text)] uppercase">{mod.latest_version || mod.version || "UNKNOWN"}</span>
            </div>
            <div className="flex flex-col">
               <span className="text-[7px] font-black uppercase text-[var(--subtext)] opacity-60 tracking-[0.2em]">{t("dossier_label_game_version")}</span>
               <span className="text-[9px] font-black text-[var(--text)] uppercase">{mod.compatible_versions && mod.compatible_versions.length > 0 ? getHighestVersion(mod.compatible_versions) : "ALL"}</span>
            </div>
            <div className="flex flex-col">
               <span className="text-[7px] font-black uppercase text-[var(--subtext)] opacity-60 tracking-[0.2em]">{t("dossier_label_last_updated")}</span>
               <span className="text-[9px] font-black text-[var(--text)] uppercase">{mod.updated_at ? new Date(mod.updated_at).toLocaleDateString() : "UNKNOWN"}</span>
            </div>
            {mod.status_reason && (
               <div className="flex flex-col mt-1 pt-2 border-t border-white/10">
                 <span className="text-[7px] font-black uppercase text-[var(--subtext)] opacity-60 tracking-[0.2em]">DIRECTIVE NOTE</span>
                 <span className="text-[9px] font-black theme-text-danger uppercase max-w-[150px] whitespace-normal leading-tight">{mod.status_reason}</span>
               </div>
            )}
          </div>
        </div>

        <div className="absolute top-3 right-3 z-40">
          {!mod.status?.includes('QUARANTINED') && !mod.status?.includes('ARCHIVED') && (
            <button 
              onClick={handleToggleClick} 
              className={`w-9 h-9 rounded-full backdrop-blur-xl border-2 flex items-center justify-center font-black text-xl transition-all shadow-2xl ${isShadowed ? 'theme-panel-danger border-[var(--danger)] text-[var(--text)] shadow-lg' : hasTier3 && !isInActiveSet ? 'bg-orange-500 border-orange-400 text-white shadow-lg' : isInActiveSet ? 'theme-bg-danger border-red-500 text-[var(--text)] rotate-45 shadow-lg' : 'theme-bg-success border-emerald-500 text-[var(--bg)] shadow-lg hover:scale-110'}`}
            >
              {isShadowed ? (
                <span className="text-[14px]">
                  {isNemesisEquipped ? (t("ui_icon_conflict") || "⚔️") 
                   : hasMissingDeps ? "🧩" 
                   : isGameVersionMismatch ? "⏳" 
                   : "🛑"}
                </span>
              ) : hasTier3 && !isInActiveSet ? (
                <span className="text-[14px]">{t("ui_icon_warning") || "⚠️"}</span>
              ) : (
                <span className="mt-[-4px] select-none">+</span>
              )}
            </button>
          )}
        </div>
      </div>

      <div className="p-5 flex flex-col flex-1">
        <h3 className="text-xs font-black truncate uppercase tracking-tight group-hover:theme-text-accent transition-colors mb-1">
          {formatDisplayName(mod.displayName || mod.name)}
        </h3>
        <p className="text-[9px] font-black text-[var(--text)]/30 uppercase tracking-widest truncate mb-4">
         {mod.author || t("bp_unknown_creator_full")}{(mod.latest_version || mod.version) ? ` • ${(mod.latest_version || mod.version)}` : ""}
        </p>

        <div 
          className={`mt-auto pt-4 flex items-center justify-between border-t border-white/5 ${isParent ? 'cursor-pointer hover:bg-white/5 -mx-5 px-5 -mb-5 pb-5 rounded-b-[2.5rem] transition-colors' : ''}`}
          onClick={(e) => { if (isParent) { e.stopPropagation(); onExpand(e); } }}
        >
          {isParent ? (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all font-black text-[9px] uppercase tracking-widest ${isExpanded ? 'theme-bg-accent text-[var(--bg)] theme-border-accent shadow-[0_0_15px_rgba(var(--accent-rgb),0.3)]' : 'theme-glass-inner theme-text-accent border-white/10 hover:border-white/20'}`}>
              <svg className="w-3 h-3 opacity-80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
              <span>{mod.flavors?.length || 0} ITEMS</span>
              <svg className={`w-2 h-2 ml-1 opacity-60 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </div>
          ) : <div />}
          
          <div className="flex items-center gap-1.5 ml-auto hidden">
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
