import { useState } from "react";
import { formatDisplayName, mapDlcCode, isVersionMatch, getHighestVersion, getLowestVersion } from "./shared";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import { openUrl } from "@tauri-apps/plugin-opener";
import defaultCover from "./assets/default-cover.jpg";

export function ModCard({ mod, gameVersion, isInActiveSet, onSelect, onToggleSet, ownedDLC = [],
maskedDLC =[], casualtyList = [], tier3List = [], missingDeps = "", isParent = false, isExpanded = false, onExpand = () => {},
isBulkMode = false, isSelected = false, onToggleSelect = () => {}, onResolveTier3 = () => {}, anarchyRules = null, hideIneligible = false }: any) {
  const { t } = useLexicon();
  const showImages = useStore((state: any) => state.showImages);
  const [confirmMode, setConfirmMode] = useState<'casualty' | 'dlc' | 'tier3' | 'broken' | null>(null);

  let rawDLC: string[] = [];
  if (mod.requiredDLC) {
    if (typeof mod.requiredDLC === 'string') {
      rawDLC = mod.requiredDLC.split(',').map((s: string) => s.trim());
    } else if (Array.isArray(mod.requiredDLC)) {
      rawDLC = [...mod.requiredDLC];
    }
  }
  if (mod.flavors) {
    mod.flavors.forEach((f: any) => {
      if (f.requiredDLC) {
        let fDLC = f.requiredDLC;
        if (typeof fDLC === 'string') fDLC = fDLC.split(',').map((s: string) => s.trim());
        if (Array.isArray(fDLC)) {
          fDLC.forEach((d: string) => { if (!rawDLC.includes(d)) rawDLC.push(d); });
        }
      }
    });
  }
  
  let missingPacks = rawDLC.filter((p: string) => {
    const baseCode = p.split(' ')[0].toUpperCase();
    return !ownedDLC.includes(baseCode) || maskedDLC.includes(baseCode);
  });
  
  const hasMissingDeps = missingDeps.length > 0;

  const getVersions = (target: any) => {
    const v = target.compatible_versions;
    return typeof v === 'string' ? v.split(',').map((s:string) => s.trim()) : (v || []);
  };
  
  let familyVersion = "Unknown";
  if (mod.isVirtual) {
    const highestPerFlavor = (mod.flavors || []).map((f: any) => getHighestVersion(getVersions(f)));
    familyVersion = getLowestVersion(highestPerFlavor);
  } else {
    familyVersion = getHighestVersion(getVersions(mod));
  }

  const isGameVersionMismatch = gameVersion && familyVersion !== "Unknown" && familyVersion !== "ALL" && familyVersion !== "" && !isVersionMatch([familyVersion], gameVersion);
  
  const isGhosted = missingPacks.length > 0 || hasMissingDeps || (isGameVersionMismatch && mod.ghostReason !== "VERSION_MISMATCH" ? true : mod.ghostReason === "VERSION_MISMATCH") || mod.isGhosted;

  if (hideIneligible && isGhosted) {
    return null;
  }

  const requiredVersions = [familyVersion];
  const isNemesisEquipped = !isInActiveSet && casualtyList.length > 0 && !casualtyList.every((c: any) => mod.flavors?.some((f: any) => f.name === (c.name || c) || f.displayName === (c.name || c) || (c.name || c) === (f.displayName || f.name)));
  const getIsBroken = (m: any) => {
      let broken = typeof m.status === 'string' && m.status.toLowerCase() === 'broken';
      if (broken && m.compatible_versions && m.compatible_versions.length > 0 && gameVersion) {
         if (gameVersion !== getHighestVersion(getVersions(m))) {
             broken = false;
         }
      }
      return broken;
  };

  const isSelfBroken = mod.isVirtual && mod.flavors ? mod.flavors.some(getIsBroken) : getIsBroken(mod);
  const brokenMods = (mod.isVirtual && mod.flavors ? mod.flavors.filter(getIsBroken) : []).concat(getIsBroken(mod) && !(mod.isVirtual && mod.flavors) ? [mod] : []);

  const isShadowed = (isGhosted || isNemesisEquipped || brokenMods.length > 0) && !isInActiveSet;
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
            className={`absolute -top-12 left-1/2 -translate-x-1/2 z-[70] hidden group-hover/shadow:flex flex-col items-center justify-center theme-glass-panel backdrop-blur-3xl border px-4 py-3 rounded-2xl whitespace-nowrap max-w-[280px] pointer-events-none transition-all animate-in fade-in slide-in-from-bottom-2 overflow-hidden ${isShadowed ? 'border-[color-mix(in_srgb,var(--danger)_50%,transparent)] shadow-[0_10px_50px_rgba(220,38,38,0.2)]' : 'border-orange-500/50 shadow-[0_10px_50px_rgba(249,115,22,0.2)]'}`}
          >
            <div className={`absolute inset-0 bg-gradient-to-t ${isShadowed ? 'from-[color-mix(in_srgb,var(--danger)_30%,transparent)]' : 'from-[color-mix(in_srgb,orange_30%,transparent)]'} to-transparent opacity-50 z-0 pointer-events-none`} />
            <div className="relative z-10 flex flex-col items-center">
              <div className={`text-[9px] font-black uppercase opacity-90 mb-0.5 ${isShadowed ? 'text-[var(--danger)]' : 'text-orange-500'}`}>
                {isNemesisEquipped ? t("modcard_fatal_conflict") || "Collision Severity 4 Conflict" : hasMissingDeps ? t("modcard_missing_artifacts") || "Missing Artifacts" : isGameVersionMismatch ? t("vault_unsupported_version") || "UNSUPPORTED VERSION" : isGhosted ? t("modcard_missing_dlc") || "Missing DLC" : t("ui_icon_warning") || "warning_amber"}
              </div>
              <div className={`text-[11px] font-black w-full text-center whitespace-normal leading-tight ${isShadowed ? 'text-red-300' : 'text-orange-300'}`}>
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
          </div>
        )}

      {confirmMode && (
          <div 
            className={`absolute inset-0 z-[60] rounded-[2.5rem] flex flex-col p-5 border animate-in fade-in zoom-in-95 shadow-2xl theme-glass-panel ${
              confirmMode === 'tier3' ? 'border-orange-500/50 bg-[color-mix(in_srgb,orange_5%,transparent)]' : 'border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_5%,transparent)]'
            }`} 
          >
          <div className="flex items-center gap-2 mb-3 shrink-0">
            <div className="flex flex-col">
              <span className={`text-[10px] font-black uppercase tracking-widest ${confirmMode === 'tier3' ? 'text-orange-500' : 'theme-text-danger'}`}>
                {confirmMode === 'dlc' ? (isGameVersionMismatch ? t("vault_unsupported_version") || "UNSUPPORTED VERSION" : hasMissingDeps ? t("modcard_missing_artifacts") || "Missing Artifacts" : t("modcard_missing_dlc") || "Missing DLC") : confirmMode === 'casualty' ? t("modcard_yeet_cascade") || "Yeet Cascade:" : confirmMode === 'broken' ? t("modcard_broken_artifacts") || "Broken Artifacts" : t("modcard_tier3_conflict") || "Collision Severity 3 Conflict"}
              </span>
              <span className="text-[8px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-tighter">
                {confirmMode === 'dlc' ? t("modcard_protocol_override") || "Protocol Override Required" : confirmMode === 'casualty' ? t("modcard_override_exclusive") || "Protocol Override Required" : confirmMode === 'broken' ? t("modcard_review_before") || "Review Before Equipping" : t("modcard_manual_resolution") || "Manual Resolution Required"}
              </span>
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-1.5 overflow-y-auto custom-scrollbar pr-1 mb-2">
            {confirmMode === 'dlc' ? (
              <>
                {isGameVersionMismatch && (
                  <>
                    <p className="text-[8px] font-black text-[var(--subtext)] opacity-60 uppercase mb-1 ml-1">{t("modcard_required_patches") || "REQUIRED PATCH(ES):"}</p>
                    <div className="theme-glass-inner px-3 py-2 rounded-xl text-[9px] font-bold theme-text-danger truncate flex items-center gap-2 mb-2 shrink-0">
                      {getHighestVersion(requiredVersions || [])}
                    </div>
                  </>
                )}
                {missingPacks.length > 0 && (
                  <>
                    <p className="text-[8px] font-black text-[var(--subtext)] opacity-60 uppercase mb-1 ml-1">{t("modcard_req") || "Req:"}:</p>
                    <div className="theme-glass-inner px-3 py-2 rounded-xl text-[9px] font-bold theme-text-danger truncate flex items-center gap-2 mb-2 shrink-0">
                      {missingPacks.map((p: string) => mapDlcCode(p)).join(", ")}
                    </div>
                  </>
                )}
                {hasMissingDeps && (
                  <>
                <p className="text-[8px] font-black text-[var(--subtext)] opacity-60 uppercase mb-1 ml-1">{t("modcard_missing_artifacts") || "Missing Artifacts"}:</p>
                {missingDeps.map((req: any) => {
                      const reqIdStr = String(typeof req === 'string' ? req : (req.id || req.name || ''));
                      const reqUrl = typeof req === 'string' ? null : req.url;
                      const cleanName = reqIdStr.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, "") || reqIdStr;
                      const searchUrl = reqUrl || `https://www.google.com/search?q=Sims+4+${encodeURIComponent(cleanName)}`;
                      return (
                        <a 
                          key={reqIdStr} 
                          href="#" 
                          className="theme-glass-inner px-3 py-2 rounded-xl text-[9px] font-bold theme-text-danger truncate flex items-center justify-between gap-2 mb-1 hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border border-transparent hover:border-[color-mix(in_srgb,var(--danger)_20%,transparent)] transition-all cursor-pointer shrink-0" 
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); openUrl(searchUrl); }}
                        >
                          <span className="truncate">{cleanName}</span>
                          <span className="text-[10px] opacity-70">{reqUrl ? (t("ui_icon_import") || "download") : (t("ui_icon_search") || "search")}</span>
                        </a>
                      );
                    })}
                  </>
                )}
              </>
            ) : confirmMode === 'casualty' ? (
              <>
                <p className="text-[8px] font-black text-[var(--subtext)] opacity-60 uppercase mb-1 ml-1">{anarchyRules?.intercept === false ? t("modcard_known_clashes") || "Known Logical Clashes" : (t("modcard_artifacts_removed") || t("modcard_removes") || "Removes:")}</p>
                {casualtyList.map((c: any) => (
                  <div key={c.name || c} className="theme-glass-inner px-3 py-2 rounded-xl text-[9px] font-bold text-[var(--text)]/80 truncate flex flex-col items-start gap-0.5 shrink-0">
                    <span className="flex items-center gap-2">{formatDisplayName(c.name || c)}</span>
                    {c.note && <span className="opacity-60 text-[7px] uppercase whitespace-normal leading-tight">{c.note}</span>}
                  </div>
                ))}
              </>
            ) : confirmMode === 'broken' ? (
              <>
                <p className="text-[8px] font-black text-[var(--subtext)] opacity-60 uppercase mb-1 ml-1">{t("modcard_broken_artifacts") || "Broken Artifacts"}:</p>
                {brokenMods.map((b: any) => (
                  <div key={b.name} className="theme-glass-inner px-3 py-2 rounded-xl text-[9px] font-bold theme-text-danger truncate flex items-center gap-2 mb-1 shrink-0">
                    {formatDisplayName(b.displayName || b.name)}
                  </div>
                ))}
              </>
            ) : (
              <>
                <p className="text-[8px] font-black text-[var(--subtext)] opacity-60 uppercase mb-1 ml-1">{t("modcard_conflicts_with") || "Conflicts with:"}</p>
                {tier3List.map((c: any) => (
                  <div key={c.name || c} className="theme-glass-inner px-3 py-2 rounded-xl text-[9px] font-bold text-[var(--text)]/80 truncate flex flex-col items-start gap-0.5 shrink-0">
                    <span className="flex items-center gap-2">{formatDisplayName(c.name || c)}</span>
                    {c.note && <span className="opacity-60 text-[7px] uppercase whitespace-normal leading-tight">{c.note}</span>}
                  </div>
                ))}
              </>
            )}
          </div>

          <div className="flex gap-2 pt-3 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0">
            {confirmMode === 'tier3' ? (
               <button onClick={(e) => { e.stopPropagation(); onToggleSet(e, false); setConfirmMode(null); }} className="flex-1 py-3 rounded-xl bg-orange-500/20 border border-orange-500/30 text-orange-500 font-black text-[9px] uppercase tracking-widest hover:bg-orange-500/30 hover:scale-105 transition-all shadow-lg">{t("modcard_btn_proceed") || "Proceed Anyway"}</button>
            ) : confirmMode === 'broken' ? (
               <>
                 <button onClick={(e) => { e.stopPropagation(); onToggleSet(e, false); setConfirmMode(null); }} className="flex-1 py-3 rounded-xl bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] font-black text-[9px] uppercase tracking-widest hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:scale-105 transition-all shadow-lg">{t("modcard_btn_proceed") || "Proceed Anyway"}</button>
                 <button onClick={(e) => { e.stopPropagation(); onToggleSet(e, true); setConfirmMode(null); }} className="flex-1 py-3 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] font-black text-[9px] uppercase tracking-widest hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-all">{t("modcard_btn_add_not_broken") || "Add Not Broken"}</button>
               </>
            ) : (
               <button onClick={(e) => { e.stopPropagation(); onToggleSet(e, false); setConfirmMode(null); }} className="flex-1 py-3 rounded-xl bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] font-black text-[9px] uppercase tracking-widest hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:scale-105 transition-all shadow-lg">
                 {t("modcard_btn_proceed") || "Proceed Anyway"}
               </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); setConfirmMode(null); }} className="flex-1 py-3 rounded-xl bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] font-black text-[9px] uppercase tracking-widest hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] hover:scale-105 transition-all shadow-lg">{t("modcard_btn_safety") || "Back to Safety"}</button>
          </div>
        </div>
      )}

      <div 
        onClick={(e) => { if (isShadowed) { e.preventDefault(); return; } onSelect(e); }} 
        className={`relative flex flex-col h-full theme-glass-panel rounded-[2.5rem] transition-all duration-500 shadow-xl hover:shadow-2xl overflow-hidden ${isShadowed ? 'opacity-30 grayscale border-[var(--danger)]' : 'cursor-pointer hover:scale-[1.02] hover:border-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)]'}`}
      >
      {isBulkMode && (
        <div 
          onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
          className="absolute inset-0 z-50 bg-black/50 backdrop-blur-[3px] rounded-[2.5rem] flex flex-col items-center justify-start pt-12 cursor-pointer transition-all hover:bg-black/40"
        >
          <div className={`w-14 h-14 rounded-3xl border flex items-center justify-center transition-all duration-300 ${isSelected ? 'theme-glass-panel bg-[color-mix(in_srgb,var(--success)_25%,transparent)] border-[color-mix(in_srgb,var(--success)_50%,transparent)] shadow-[0_10px_30px_rgba(var(--success-rgb),0.3)] scale-110' : 'theme-glass-panel border-white/10 hover:bg-white/5 hover:scale-105'}`}>
            {isSelected && <span className="text-3xl text-[var(--success)] font-black drop-shadow-[0_0_10px_rgba(var(--success-rgb),0.5)]">✓</span>}
          </div>
        </div>
      )}

      <div className="relative z-20 h-40 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_2%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors duration-700 rounded-t-[2.5rem]">
        <div className="absolute inset-0 overflow-hidden z-0 rounded-t-[2.5rem]">
          {(showImages && (mod.image_url || mod.imageUrl)) ? (
            <img src={mod.image_url || mod.imageUrl} className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity duration-700 group-hover:scale-105" alt="Cover" />
          ) : (
            <span className="material-symbols-outlined text-[var(--subtext)] opacity-40 group-hover:opacity-60 group-hover:scale-110 group-hover:text-[var(--accent)] transition-all duration-700 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ fontSize: '120px' }}>
              {(() => {
                const name = (mod.name || "").toLowerCase();
                const rawType = (mod.type || mod.category_override || "").toLowerCase();
                
                if (rawType.includes('cas') || name.includes('hair') || name.includes('clothes') || name.includes('tattoo')) return "checkroom";
                if (rawType.includes('build') || name.includes('furniture') || name.includes('object')) return "chair";
                if (rawType.includes('script') || name.endsWith('.ts4script')) return "code";
                if (rawType.includes('anim') || name.includes('anim')) return "animation";
                // Folder logic based on properties rather than name matching
                if (mod.isCCSet) return "folder_special";
                if (mod.isFlavorFolder) return "style"; // Flavors / Exclusives
                if (mod.isParent && mod.flavors?.some((f: any) => ["twin", "beta", "addon"].includes(f.relationshipType))) return "account_tree"; // Database linked relationships
                if (mod.isParent) return "folder_open";
                
                return "extension";
              })()}
            </span>
          )}
        </div>
        


        <div className="absolute top-4 left-4 z-30 group/badge pointer-events-auto cursor-help">
          <div className={`backdrop-blur-md border px-3 py-1.5 rounded-xl shadow-2xl flex items-center gap-2 transition-all ${(() => {
              const s = (mod.status || "").toLowerCase();
              const isStatusBroken = isSelfBroken;
              if (isStatusBroken) return "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)]";
              if (s === 'unstable') return "bg-orange-500/10 border-orange-500/30 hover:bg-orange-500/20";
              if (s === 'verified' || s === 'stable' || (s === 'broken' && !isSelfBroken)) return "bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border-[color-mix(in_srgb,var(--success)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_15%,transparent)]";
              if (s === 'unverified') return "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)]";
              return "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_15%,transparent)]";
          })()}`}>
            <div className={`w-1.5 h-1.5 rounded-full shadow-[0_0_5px_currentColor] ${(() => {
              const s = (mod.status || "").toLowerCase();
              if (isSelfBroken || s === 'unverified') return "bg-[var(--danger)]";
              if (s === 'unstable') return "bg-orange-500";
              if (s === 'verified' || s === 'stable' || (s === 'broken' && !isSelfBroken)) return "bg-[var(--success)]";
              return "bg-[var(--accent)]";
            })()}`} style={mod.color && !isSelfBroken && !isGameVersionMismatch && mod.status?.toLowerCase() !== 'verified' && mod.status?.toLowerCase() !== 'stable' && mod.status?.toLowerCase() !== 'unverified' ? { backgroundColor: mod.color } : undefined} />
            <span className={`text-[8px] font-black uppercase tracking-widest ${(() => {
              const s = (mod.status || "").toLowerCase();
              if (isSelfBroken || s === 'unverified') return "text-[var(--danger)]";
              if (s === 'unstable') return "text-orange-500";
              if (s === 'verified' || s === 'stable' || (s === 'broken' && !isSelfBroken)) return "text-[var(--success)]";
              return "text-[var(--accent)]";
            })()}`}>
              {(() => {
                const raw = (mod.status || "");
                let cleaned = raw.replace(/[[\]"]/g, "");
                if (cleaned.toUpperCase().includes('SANDBOX')) cleaned = 'SANDBOX';
                if (isSelfBroken) return t("status_dd_broken") || "BROKEN";
                if (cleaned.toLowerCase() === 'broken' && !isSelfBroken) return t("badge_stable") || "STABLE";
                if (cleaned.toLowerCase() === 'unverified') return t("status_unverified") || "UNVERIFIED";
                if (cleaned.toLowerCase() === 'unstable') return t("status_unstable") || "UNSTABLE";
                return cleaned.toUpperCase();
              })()}
            </span>
          </div>

          <div className="absolute top-12 left-0 mt-1 hidden group-hover/badge:flex flex-col gap-2 bg-[color-mix(in_srgb,var(--bg)_95%,transparent)] backdrop-blur-3xl border border-[color-mix(in_srgb,var(--text)_15%,transparent)] p-4 rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] z-[80] min-w-[220px] animate-in fade-in slide-in-from-top-2 pointer-events-none overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-t from-[color-mix(in_srgb,var(--text)_5%,transparent)] to-transparent opacity-50 z-0 pointer-events-none" />
            <div className="relative z-10 flex flex-col gap-2">
              <div className="bg-[color-mix(in_srgb,var(--text)_2%,transparent)] px-3 py-2 rounded-xl flex flex-col gap-0.5 border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner">
               <span className="text-[7px] font-black uppercase text-[var(--subtext)] opacity-80 tracking-[0.2em] flex items-center gap-1.5"><span className="material-symbols-outlined !text-[10px]">{t("ui_icon_history") || "history"}</span>{t("dossier_revision") || "Revision"}</span>
               <span className="text-[10px] font-mono font-black text-[var(--text)] uppercase truncate">{(() => {
                 let v = mod.latest_version || mod.version;
                 if (!v && mod.isVirtual && mod.flavors) {
                   const flavorV = mod.flavors.find((f: any) => f.latest_version || f.version);
                   if (flavorV) v = flavorV.latest_version || flavorV.version;
                 }
                 return v || t("modcard_unknown") || "UNKNOWN";
               })()}</span>
            </div>
              <div className="bg-[color-mix(in_srgb,var(--text)_2%,transparent)] px-3 py-2 rounded-xl flex flex-col gap-0.5 border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner">
               <span className="text-[7px] font-black uppercase text-[var(--subtext)] opacity-80 tracking-[0.2em] flex items-center gap-1.5"><span className="material-symbols-outlined !text-[10px]">{t("ui_icon_sports_esports") || "sports_esports"}</span>{t("dossier_label_game_version") || "ENGINE VERSION"}</span>
               <span className="text-[9px] font-black text-[var(--text)] uppercase truncate">{mod.compatible_versions && mod.compatible_versions.length > 0 ? getHighestVersion(mod.compatible_versions) : t("modcard_all") || "ALL"}</span>
            </div>
              <div className="bg-[color-mix(in_srgb,var(--text)_2%,transparent)] px-3 py-2 rounded-xl flex flex-col gap-0.5 border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner">
               <span className="text-[7px] font-black uppercase text-[var(--subtext)] opacity-80 tracking-[0.2em] flex items-center gap-1.5"><span className="material-symbols-outlined !text-[10px]">{t("ui_icon_calendar_today") || "calendar_today"}</span>{t("dossier_label_last_updated") || "LAST UPDATED"}</span>
               <span className="text-[9px] font-black text-[var(--text)] uppercase truncate">{(() => {
                 let dt = mod.updated_at;
                 if (!dt && mod.isVirtual && mod.flavors) {
                   const dates = mod.flavors.map((f: any) => f.updated_at).filter(Boolean).sort().reverse();
                   if (dates.length > 0) dt = dates[0];
                 }
                 return dt ? new Date(dt).toLocaleDateString() : t("modcard_unknown") || "UNKNOWN";
               })()}</span>
            </div>
            {mod.status_reason && (
               <div className="theme-glass-inner bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border-[color-mix(in_srgb,var(--danger)_20%,transparent)] px-3 py-2 rounded-xl flex flex-col gap-0.5 border shadow-sm mt-1">
                 <span className="text-[7px] font-black uppercase theme-text-danger opacity-80 tracking-[0.2em] flex items-center gap-1.5"><span className="material-symbols-outlined !text-[10px]">{t("ui_icon_error") || "error"}</span>{t("modcard_directive_note") || "DIRECTIVE NOTE"}</span>
                 <span className="text-[9px] font-black theme-text-danger uppercase whitespace-normal leading-tight">{mod.status_reason}</span>
               </div>
            )}
            </div>
          </div>
        </div>

        <div className="absolute top-3 right-3 z-40">
          {!mod.status?.includes('QUARANTINED') && !mod.status?.includes('ARCHIVED') && (
            <button 
              onClick={handleToggleClick} 
              className={`w-9 h-9 rounded-full backdrop-blur-md border flex items-center justify-center font-black text-xl transition-all shadow-xl ${isShadowed ? 'theme-panel-danger border-[var(--danger)] text-[var(--text)]' : hasTier3 && !isInActiveSet ? 'bg-[color-mix(in_srgb,orange_5%,transparent)] border-[color-mix(in_srgb,orange_15%,transparent)] text-orange-500 hover:bg-[color-mix(in_srgb,orange_10%,transparent)] hover:border-[color-mix(in_srgb,orange_25%,transparent)] hover:scale-110' : isInActiveSet ? 'bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] rotate-45 hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:scale-110' : 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] hover:scale-110'}`}
            >
              {isShadowed ? (
                <span className="material-symbols-outlined !text-[18px]">
                  {isNemesisEquipped ? (t("ui_icon_conflict") || "swords") 
                   : hasMissingDeps ? "extension" 
                   : isGameVersionMismatch ? "hourglass_empty" 
                   : "block"}
                </span>
              ) : hasTier3 && !isInActiveSet ? (
                <span className="material-symbols-outlined !text-[18px]">{t("ui_icon_warning") || "warning_amber"}</span>
              ) : (
                <span className="material-symbols-outlined !text-[20px]">{isInActiveSet ? t("ui_icon_plus") || "add" : t("ui_icon_plus") || "add"}</span>
              )}
            </button>
          )}
        </div>
      </div>

      <div className="p-5 flex flex-col flex-1 rounded-b-[2.5rem] z-10 relative">
        <h3 className="text-xs font-black truncate uppercase tracking-tight group-hover:theme-text-accent transition-colors mb-1">
          {formatDisplayName(mod.displayName || mod.name)}
        </h3>
        <p className="text-[9px] font-black text-[var(--text)]/30 uppercase tracking-widest truncate mb-4">
         {mod.author || t("bp_unknown_creator_full") || "Unknown Mason"}{(mod.latest_version || mod.version) ? ` • ${(mod.latest_version || mod.version)}` : ""}
        </p>

        <div 
          className={`mt-auto pt-4 flex items-center justify-between border-t border-white/5 ${isParent ? 'cursor-pointer hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] -mx-5 px-5 -mb-5 pb-5 rounded-b-[2.5rem] transition-colors' : ''}`}
          onClick={(e) => { if (isParent) { e.stopPropagation(); onExpand(e); } }}
        >
          {isParent ? (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border backdrop-blur-md transition-all font-black text-[9px] uppercase tracking-widest ${isExpanded ? 'bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_15%,transparent)] shadow-[0_0_15px_rgba(var(--accent-rgb),0.2)]' : 'bg-[color-mix(in_srgb,var(--text)_5%,transparent)] theme-text-accent border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)]'}`}>
              <svg className="w-3 h-3 opacity-80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
              <span>{mod.flavors?.length || 0} {t("modcard_items") || "ARTIFACTS"}</span>
              <svg className={`w-2 h-2 ml-1 opacity-60 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </div>
          ) : <div />}
          
          <div className="flex items-center gap-1.5 ml-auto hidden">
             {reqCount > 0 && (
               <div className="theme-panel-accent border px-1.5 py-0.5 rounded-md text-[7px] font-black theme-text-accent uppercase">
                 {reqCount} {t("modcard_req_short") || "REQ"}
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
