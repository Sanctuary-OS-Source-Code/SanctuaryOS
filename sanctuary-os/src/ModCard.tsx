import React, { useState, useEffect } from "react";
import { HoverTooltip, getFileLabel, formatDisplayName, isSupportedExtension, getExtensionRegex, getModIcon, CustomDropdown, cleanSearchName, mapDlcCode, isVersionMatch, getHighestVersion, getLowestVersion } from "./shared";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import { openUrl } from "@tauri-apps/plugin-opener";
import defaultCover from "./assets/default-cover.jpg";

function ModCardInner({ mod, gameVersion, isInActiveSet, onSelect, onToggleSet, ownedDLC = [],
  maskedDLC = [], casualtyList = [], tier3List = [], missingDeps = "", isParent = false, isExpanded = false, onExpand = () => { },
  isBulkMode = false, isSelected = false, onToggleSelect = () => { }, onResolveConflict, anarchyRules = null, hideIneligible = false, isFlavorSwap = false,
  onInspectItem }: any) {
  const activeGameSchema = useStore((state: any) => state.activeGameSchema);
  const { t } = useLexicon();
  const showImages = useStore((state: any) => state.showImages);
  const [confirmMode, setConfirmMode] = useState<'casualty' | 'dlc' | 'tier3' | 'broken' | 'flavor_swap' | null>(null);
  const [delayedConfirmMode, setDelayedConfirmMode] = useState<'casualty' | 'dlc' | 'tier3' | 'broken' | 'flavor_swap' | null>(null);

  useEffect(() => {
    if (confirmMode) {
      setDelayedConfirmMode(confirmMode);
    } else {
      const timer = setTimeout(() => setDelayedConfirmMode(null), 500);
      return () => clearTimeout(timer);
    }
  }, [confirmMode]);

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
    return typeof v === 'string' ? v.split(',').map((s: string) => s.trim()) : (v || []);
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
  const isBetaSwap = !isInActiveSet && (mod.relationshipType === 'beta' || (mod.relationshipType !== 'core' && mod.sub_type?.toLowerCase() === 'beta') || (mod.isVirtual && mod.flavors?.some((f: any) => f.relationshipType === 'beta' || (f.relationshipType !== 'core' && f.sub_type?.toLowerCase() === 'beta'))));
  const isSwappedState = (isFlavorSwap || isBetaSwap) && !isInActiveSet;
  const isNemesisEquipped = !isInActiveSet && casualtyList.length > 0 && !casualtyList.every((c: any) => mod.flavors?.some((f: any) => f.name === (c.name || c) || f.displayName === (c.name || c) || (c.name || c) === (f.displayName || f.name))) && !isSwappedState;
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

  const isShadowed = (isGhosted || isNemesisEquipped || isSwappedState || brokenMods.length > 0) && !isInActiveSet;
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
      if (isSwappedState && casualtyList.length > 0) { setConfirmMode('flavor_swap'); return; }
      if (casualtyList.length > 0) { setConfirmMode('casualty'); return; }
      if (hasTier3) { setConfirmMode('tier3'); return; }
      if (brokenMods.length > 0) { setConfirmMode('broken'); return; }
    }
    if (isInActiveSet && isFlavorSwap) { setConfirmMode('flavor_swap'); return; }
    if (isInActiveSet && casualtyList.length > 0) { setConfirmMode('casualty'); return; }
    onToggleSet(e, true);
  };

  return (
    <div className="relative group/shadow h-[320px] [perspective:1000px]">
      <div className={`relative w-full h-full transition-transform duration-500 [transform-style:preserve-3d] ${confirmMode ? '[transform:rotateY(180deg)]' : ''}`}>

        <div
          onClick={(e) => { if (isShadowed) { e.preventDefault(); return; } onSelect(e); }}
          className={`relative flex flex-col h-full theme-glass-panel rounded-[var(--radius)] transition-all duration-500 shadow-xl overflow-hidden group/maincard [backface-visibility:hidden] ${delayedConfirmMode ? 'pointer-events-none !border-transparent' : ''} ${isShadowed ? `opacity-30 grayscale border ${isSwappedState ? 'border-[var(--accent)]/50' : 'border-[var(--danger)]'}` : `cursor-pointer border border-transparent ${delayedConfirmMode ? '' : 'hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(var(--accent-rgb),0.15)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]'}`}`}
        >
          {!isShadowed && (
            <div className={`absolute inset-0 z-0 pointer-events-none transition-all duration-500 ${delayedConfirmMode ? '' : 'group-hover/maincard:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)]'}`} />
          )}
          {isBulkMode && (
            <div
              onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
              className="absolute inset-0 z-50 bg-black/50 backdrop-blur-[3px] rounded-[var(--radius)] flex flex-col items-center justify-start pt-12 cursor-pointer transition-all hover:bg-black/40"
            >
              <div className={`w-14 h-14 rounded-[var(--radius)] border flex items-center justify-center transition-all duration-300 ${isSelected ? 'theme-glass-panel bg-[color-mix(in_srgb,var(--success)_25%,transparent)] border-[color-mix(in_srgb,var(--success)_50%,transparent)] shadow-[0_10px_30px_rgba(var(--success-rgb),0.3)] scale-110' : 'theme-glass-panel border-white/10 hover:bg-white/5 hover:scale-105'}`}>
                {isSelected && <span className="text-3xl text-[var(--success)] font-black drop-shadow-[0_0_10px_rgba(var(--success-rgb),0.5)]">✓</span>}
              </div>
            </div>
          )}

          <div className={`relative z-20 h-40 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_2%,transparent)] transition-colors duration-700 ${delayedConfirmMode ? '' : 'group-hover/maincard:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>
            <div className="absolute inset-0 overflow-hidden z-0">
              {(showImages && (mod.image_url || mod.imageUrl) && String(mod.image_url || mod.imageUrl) !== "null" && String(mod.image_url || mod.imageUrl).trim() !== "") ? (
                <img src={mod.image_url || mod.imageUrl} className={`w-full h-full object-contain opacity-90 transition-opacity duration-700 ${delayedConfirmMode ? '' : 'group-hover/maincard:opacity-100'}`} alt={t("auto_cover")} onError={(e) => e.currentTarget.style.display = 'none'} />
              ) : (
                <span className={`material-symbols-outlined text-[var(--subtext)] opacity-40 transition-all duration-700 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ${delayedConfirmMode ? '' : 'group-hover/maincard:opacity-60 group-hover/maincard:text-[var(--accent)]'}`} style={{ fontSize: '120px' }}>
                  {getModIcon(mod, activeGameSchema, t)}
                </span>
              )}
            </div>

            <div className="absolute bottom-4 left-4 z-30 flex items-center gap-2 pointer-events-auto">
              {mod.is_early_access && (
                <div className="backdrop-blur-md bg-purple-500/10 border border-purple-500/30 px-3 py-1.5 rounded-xl overflow-hidden shadow-2xl flex items-center gap-2">
                  <span className="material-symbols-outlined !text-[12px] text-purple-500">science</span>
                  <span className="text-[8px] font-black uppercase tracking-widest text-purple-500">{t("badge_early_access") || "Early Access"}</span>
                </div>
              )}
              {mod.is_paid && (
                <div className="backdrop-blur-md bg-yellow-500/10 border border-yellow-500/30 px-3 py-1.5 rounded-xl overflow-hidden shadow-2xl flex items-center gap-2">
                  <span className="material-symbols-outlined !text-[12px] text-yellow-500">monetization_on</span>
                  <span className="text-[8px] font-black uppercase tracking-widest text-yellow-500">{t("badge_paid") || "Paid"}</span>
                </div>
              )}
            </div>

            {(() => {
              const isTier1Or2 = mod.compliance_tier === 1 || mod.compliance_tier === 2;
              const statusType = (!mod.dbId || mod.version?.toLowerCase() === 'v.local' || isTier1Or2) ? 'local' : (mod.status || "").toLowerCase();
              const isStatusBroken = isSelfBroken;

              let badgeBg = "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] ";
              let badgeText = "text-[var(--accent)]";
              let hoverBorder = "border-[var(--accent)]/30";

              if (isStatusBroken || statusType === 'unverified') {
                badgeBg = "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] ";
                badgeText = "text-[var(--danger)]";
                hoverBorder = "border-[var(--danger)]/30";
              } else if (statusType === 'unstable') {
                badgeBg = "bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border-[color-mix(in_srgb,var(--warning)_30%,transparent)] ";
                badgeText = "text-[var(--warning)]";
                hoverBorder = "border-[var(--warning)]/30";
              } else if (statusType === 'verified' || statusType === 'stable' || (statusType === 'broken' && !isSelfBroken)) {
                badgeBg = "bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border-[color-mix(in_srgb,var(--success)_30%,transparent)] ";
                badgeText = "text-[var(--success)]";
                hoverBorder = "border-[var(--success)]/30";
              }

              return (
                <div className="absolute top-4 left-4 z-30 group/badge pointer-events-auto cursor-help">
                  <div className={`backdrop-blur-md border px-3 py-1.5 rounded-xl overflow-hidden shadow-2xl flex items-center gap-2 transition-all ${badgeBg}`}>
                    <span className={`text-[8px] font-black uppercase tracking-widest ${badgeText}`}>
                      {(() => {
                        if (!mod.dbId || mod.version?.toLowerCase() === 'v.local' || isTier1Or2) return t("unlinked_badge") || "LOCAL";
                        const raw = (mod.status || "");
                        let cleaned = raw.replace(/[[\]"]/g, "");
                        if (cleaned === 'bunker') cleaned = 'vault';
                        if (mod.hash?.startsWith('dev_vault_')) return 'DEV';
                        if (cleaned.toUpperCase().includes('SANDBOX')) cleaned = 'SANDBOX';
                        if (isSelfBroken) return t("status_broken");
                        if (cleaned.toLowerCase() === 'broken' && !isSelfBroken) return t("badge_stable");
                        if (cleaned.toLowerCase() === 'unverified') return t("unverified");
                        if (cleaned.toLowerCase() === 'unstable') return t("label_unstable");
                        return cleaned.toUpperCase();
                      })()}
                    </span>
                  </div>
                  <HoverTooltip
                    align="left"
                    vAlign="bottom"
                    content={
                      <div
                        className={`flex flex-col gap-2 theme-glass-panel border ${hoverBorder} p-4 rounded-xl shadow-[0_30px_80px_rgba(0,0,0,0.8)] min-w-[220px] pointer-events-none`}
                        style={{
                          '--glassBlur': '30px',
                          '--panelTint': 'var(--text)',
                          '--glassOpacity': '15%'
                        } as React.CSSProperties}
                      >
                        <div className="relative z-10 flex flex-col gap-2 w-full">
                          <div className="bg-[color-mix(in_srgb,var(--text)_2%,transparent)] px-3 py-2 rounded-xl overflow-hidden flex flex-col gap-0.5 border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner">
                            <span className="text-[7px] font-black uppercase text-[var(--subtext)] opacity-80 tracking-[0.2em] flex items-center gap-1.5"><span className="material-symbols-outlined !text-[10px]">{t("icon_history")}</span>{t("revision")}</span>
                            <span className="text-[10px] font-mono font-black text-[var(--text)] uppercase truncate">{(() => {
                              let v = mod.latest_version || mod.version;
                              if (!v && mod.isVirtual && mod.flavors) {
                                const flavorV = mod.flavors.find((f: any) => f.latest_version || f.version);
                                if (flavorV) v = flavorV.latest_version || flavorV.version;
                              }
                              return v || t("vlocal") || "UNKNOWN";
                            })()}</span>
                          </div>
                          <div className="bg-[color-mix(in_srgb,var(--text)_2%,transparent)] px-3 py-2 rounded-xl overflow-hidden flex flex-col gap-0.5 border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner">
                            <span className="text-[7px] font-black uppercase text-[var(--subtext)] opacity-80 tracking-[0.2em] flex items-center gap-1.5"><span className="material-symbols-outlined !text-[10px]">{t("icon_sports_esports")}</span>{t("label_game_version")}</span>
                            <span className="text-[9px] font-black text-[var(--text)] uppercase truncate">{mod.compatible_versions && mod.compatible_versions.length > 0 ? getHighestVersion(mod.compatible_versions) : t("ql_all")}</span>
                          </div>
                          <div className="bg-[color-mix(in_srgb,var(--text)_2%,transparent)] px-3 py-2 rounded-xl overflow-hidden flex flex-col gap-0.5 border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner">
                            <span className="text-[7px] font-black uppercase text-[var(--subtext)] opacity-80 tracking-[0.2em] flex items-center gap-1.5"><span className="material-symbols-outlined !text-[10px]">{t("icon_calendar_today")}</span>{t("updated_date")}</span>
                            <span className="text-[9px] font-black text-[var(--text)] uppercase truncate">{(() => {
                              let dt = mod.updated_at;
                              if (!dt && mod.isVirtual && mod.flavors) {
                                const dates = mod.flavors.map((f: any) => f.updated_at).filter(Boolean).sort().reverse();
                                if (dates.length > 0) dt = dates[0];
                              }
                              return dt ? new Date(dt).toLocaleDateString() : t("vlocal");
                            })()}</span>
                          </div>
                          {mod.status_reason && (
                            <div className="theme-glass-inner bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border-[color-mix(in_srgb,var(--danger)_20%,transparent)] px-3 py-2 rounded-xl overflow-hidden flex flex-col gap-0.5 border shadow-sm mt-1">
                              <span className="text-[7px] font-black uppercase theme-text-danger opacity-80 tracking-[0.2em] flex items-center gap-1.5"><span className="material-symbols-outlined !text-[10px]">{t("icon_error")}</span>{t("directive_note")}</span>
                              <span className="text-[9px] font-black theme-text-danger uppercase whitespace-normal leading-tight">{mod.status_reason}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    }
                  />
                </div>
              );
            })()}

            <div className="absolute top-3 right-3 z-[60]">
              {(isShadowed || hasTier3 || isSwappedState) && !confirmMode && !delayedConfirmMode && (
                <HoverTooltip
                  className="z-[100] !right-0 !translate-x-0 !left-auto"
                  variant={isShadowed && !isSwappedState ? 'danger' : isSwappedState ? 'accent' : 'warning'}
                  icon={isNemesisEquipped ? (t("icon_crisis_alert") || 'crisis_alert') : isGameVersionMismatch ? 'sports_esports' : hasMissingDeps ? 'extension' : isGhosted ? 'currency_exchange' : isSwappedState ? 'swap_horiz' : (t("icon_tune") || 'tune')}
                  title={isNemesisEquipped ? t("fatal_conflict") : isGameVersionMismatch ? t("unsupported_version") : hasMissingDeps ? t("missing_artifacts") : isGhosted ? t("missing_dlc") : isSwappedState ? (isBetaSwap ? t("badge_beta") : (t("flavor_swap") || "FLAVOR SWAP")) : t("tier3_conflict")}
                  subtitle={isNemesisEquipped
                    ? formatDisplayName(casualtyList[0]?.name || casualtyList[0] || "") + (casualtyList[0]?.note ? ` - ${casualtyList[0].note}` : "") + (casualtyList.length > 1 ? ` (+${casualtyList.length - 1})` : "")
                    : isGameVersionMismatch
                      ? (
                        <>
                          <div className="w-full truncate">{t("tooltip_required")} {getHighestVersion(requiredVersions || [])}</div>
                          <div className="w-full truncate">{t("tooltip_current")} {gameVersion || t("unknown") || "Unknown"}</div>
                        </>
                      )
                      : hasMissingDeps
                        ? formatDisplayName(typeof missingDeps[0] === 'string' ? missingDeps[0] : (missingDeps[0]?.name || missingDeps[0]?.id || '')) + (missingDeps.length > 1 ? ` (+${missingDeps.length - 1})` : "")
                        : isGhosted
                          ? missingPacks.map((p: string) => mapDlcCode(p)).join(", ")
                          : isSwappedState
                            ? formatDisplayName(casualtyList[0]?.name || casualtyList[0] || "") + (casualtyList.length > 1 ? ` (+${casualtyList.length - 1})` : "")
                            : hasTier3
                              ? formatDisplayName(tier3List[0]?.name || tier3List[0] || "") + (tier3List[0]?.note ? ` - ${tier3List[0].note}` : "")
                              : ""}
                />
              )}
              {!mod.status?.includes('QUARANTINED') && !mod.status?.includes('ARCHIVED') && (
                <button
                  onClick={handleToggleClick}
                  className={`relative z-10 w-9 h-9 rounded-full backdrop-blur-md border flex items-center justify-center font-black text-xl transition-all shadow-xl ${isShadowed ? (isSwappedState ? 'theme-panel-accent border-[var(--accent)] theme-text-accent' : 'theme-panel-danger border-[var(--danger)] text-[var(--text)]') : hasTier3 && !isInActiveSet ? 'bg-[color-mix(in_srgb,orange_5%,transparent)] border-[color-mix(in_srgb,orange_15%,transparent)] text-orange-500  hover:border-[color-mix(in_srgb,orange_25%,transparent)] hover:scale-110' : isInActiveSet ? 'bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] rotate-45  hover:scale-110' : 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)]  hover:scale-110'}`}
                >
                  {isShadowed ? (
                    <span className="material-symbols-outlined !text-[18px]">
                      {isSwappedState ? "swap_horiz" : isNemesisEquipped ? (t("icon_crisis_alert") || 'crisis_alert')
                        : isGameVersionMismatch ? "sports_esports"
                          : hasMissingDeps ? "extension"
                            : isGhosted ? "currency_exchange"
                              : "broken_image"}
                    </span>
                  ) : hasTier3 && !isInActiveSet ? (
                    <span className="material-symbols-outlined !text-[18px]">{t("icon_tune") || 'tune'}</span>
                  ) : (
                    <span className="material-symbols-outlined !text-[20px]">{isInActiveSet ? (t("icon_add") || 'add') : (t("icon_add") || 'add')}</span>
                  )}
                </button>
              )}

            </div>
          </div>

          <div className="p-5 flex flex-col flex-1 min-h-0 rounded-b-[calc(var(--radius)-4px)] z-10 relative">
            <h3 className="text-xs font-black truncate uppercase tracking-tight group-hover:theme-text-accent transition-colors mb-1">
              {formatDisplayName(mod.displayName || mod.name)}
            </h3>
            <p className="text-[9px] font-black text-[var(--text)]/30 uppercase tracking-widest truncate mb-4">
              {mod.author || t("unknown_mason") || "Unknown Mason"}{(mod.latest_version || mod.version) ? ` • ${(mod.latest_version || mod.version)}` : ""}
            </p>

            <div
              className={`mt-auto pt-4 flex items-center justify-between border-t border-white/5 ${isParent ? 'cursor-pointer  -mx-5 px-5 -mb-5 pb-5 rounded-b-[calc(var(--radius)-4px)] transition-colors' : ''}`}
              onClick={(e) => { if (isParent) { e.stopPropagation(); onExpand(e); } }}
            >
              {isParent ? (
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border backdrop-blur-md transition-all font-black text-[9px] uppercase tracking-widest ${isExpanded ? 'bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_15%,transparent)] shadow-[0_0_15px_rgba(var(--accent-rgb),0.2)]' : 'bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] theme-text-accent border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)]'}`}>
                  <svg className="w-3 h-3 opacity-80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                  </svg>
                  <span>{mod.flavors?.length || 0} {t("items")}</span>
                  <svg className={`w-2 h-2 ml-1 opacity-60 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </div>
              ) : <div />}

              <div className="flex items-center gap-1.5 ml-auto hidden">
                {reqCount > 0 && (
                  <div className="theme-panel-accent border px-1.5 py-0.5 rounded-md text-[7px] font-black theme-text-accent uppercase">
                    {reqCount} {t("req_short")}
                  </div>
                )}
                {mod.isFlavorFolder && <span className="material-symbols-outlined !text-[14px]">folder</span>}
              </div>
            </div>
          </div>
        </div>

        {delayedConfirmMode && (
          <div className="absolute inset-0 z-[100] pointer-events-none [transform:rotateY(180deg)] [backface-visibility:hidden]">
            <div className={`pointer-events-auto relative h-full w-full theme-glass-panel !backdrop-blur-none [clip-path:inset(0_round_calc(var(--radius)-4px))] rounded-[calc(var(--radius)-4px)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] flex flex-col border ${delayedConfirmMode === 'tier3' ? 'border-[color-mix(in_srgb,orange_50%,transparent)]' :
              delayedConfirmMode === 'flavor_swap' ? 'border-[color-mix(in_srgb,var(--accent)_50%,transparent)]' :
                'border-[color-mix(in_srgb,var(--danger)_50%,transparent)]'
              }`}>

              {/* Header */}
              <div className={`relative z-10 p-4 flex items-center justify-center gap-2 border-b shrink-0 rounded-t-[calc(var(--radius)-4px)] ${delayedConfirmMode === 'tier3' ? 'bg-[color-mix(in_srgb,orange_5%,transparent)] border-[color-mix(in_srgb,orange_20%,transparent)]' :
                delayedConfirmMode === 'flavor_swap' ? 'bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] border-[color-mix(in_srgb,var(--accent)_20%,transparent)]' :
                  'bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] border-[color-mix(in_srgb,var(--danger)_20%,transparent)]'
                }`}>
                <span className={`material-symbols-outlined !text-[18px] ${delayedConfirmMode === 'tier3' ? 'text-orange-500' : delayedConfirmMode === 'flavor_swap' ? 'theme-text-accent' : 'text-[var(--danger)]'}`}>
                  {delayedConfirmMode === 'flavor_swap' ? 'swap_horiz' : delayedConfirmMode === 'dlc' ? (isGameVersionMismatch ? 'sports_esports' : hasMissingDeps ? 'extension' : 'currency_exchange') : delayedConfirmMode === 'broken' ? 'warning' : delayedConfirmMode === 'casualty' ? (!isInActiveSet ? (t("icon_crisis_alert") || 'crisis_alert') : 'delete') : delayedConfirmMode === 'tier3' ? (t("icon_tune") || 'tune') : 'delete'}
                </span>
                <span className={`text-[11px] font-black uppercase tracking-widest truncate ${delayedConfirmMode === 'tier3' ? 'text-orange-500' : delayedConfirmMode === 'flavor_swap' ? 'theme-text-accent' : 'text-[var(--danger)]'}`}>
                  {String(delayedConfirmMode === 'dlc' ? (isGameVersionMismatch ? t("unsupported_version") : hasMissingDeps ? t("missing_artifacts") : t("missing_dlc")) : (delayedConfirmMode === 'casualty' || delayedConfirmMode === 'flavor_swap') ? (delayedConfirmMode === 'flavor_swap' ? (isBetaSwap ? t("beta_swap") : (t("flavor_swap") || "FLAVOR SWAP")) : (!isInActiveSet ? t("fatal_conflict") : t("yeet_cascade"))) : delayedConfirmMode === 'broken' ? t("broken_artifacts") : t("tier3_conflict")).replace(/:$/, '')}
                </span>
              </div>

              {/* Scrolling Content */}
              <div className="relative z-10 flex-1 overflow-y-auto custom-scrollbar p-4 pb-4 flex flex-col gap-2 bg-[color-mix(in_srgb,var(--text)_3%,transparent)]">
                {delayedConfirmMode === 'dlc' ? (
                  <>
                    {isGameVersionMismatch && (
                      <div className="flex items-center gap-3 theme-glass-panel backdrop-blur-md border border-white/5 shadow-sm p-3 rounded-2xl">
                        <span className="material-symbols-outlined !text-[16px] text-[var(--danger)] shrink-0">sports_esports</span>
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-[8px] font-black text-[var(--danger)] opacity-70 uppercase tracking-widest">{t("required_version") || "REQUIRED"}</span>
                          <span className="text-[10px] font-mono font-black text-[var(--danger)] uppercase tracking-widest truncate">{getHighestVersion(requiredVersions || [])}</span>
                        </div>
                      </div>
                    )}
                    {missingPacks.length > 0 && missingPacks.map((p: string) => (
                      <div key={p} className="flex items-center gap-3 theme-glass-panel backdrop-blur-md border border-white/5 shadow-sm p-3 rounded-2xl">
                        <span className="material-symbols-outlined !text-[16px] text-[var(--danger)] shrink-0">currency_exchange</span>
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-[8px] font-black text-[var(--danger)] opacity-70 uppercase tracking-widest">{t("missing_dlc") || "DLC"}</span>
                          <span className="text-[10px] font-mono font-black text-[var(--danger)] uppercase tracking-widest truncate">{mapDlcCode(p)}</span>
                        </div>
                      </div>
                    ))}
                    {hasMissingDeps && missingDeps.map((req: any) => {
                      const reqIdStr = String(typeof req === 'string' ? req : (req.id || req.name || ''));
                      return (
                        <div key={reqIdStr} 
                             onClick={(e) => { if (onInspectItem) { e.stopPropagation(); onInspectItem(req); } }}
                             className={`flex items-center gap-3 theme-glass-panel backdrop-blur-md border border-white/5 shadow-sm p-3 rounded-2xl ${onInspectItem ? 'cursor-pointer hover:bg-white/5 hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)] group/inspect' : ''}`}>
                          <span className="material-symbols-outlined !text-[16px] text-[var(--danger)] shrink-0">extension</span>
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-[8px] font-black text-[var(--danger)] opacity-70 uppercase tracking-widest">{t("missing_dependency") || "DEP"}</span>
                            <span className="text-[10px] font-mono font-black text-[var(--danger)] uppercase tracking-widest truncate">{cleanSearchName(reqIdStr, activeGameSchema)}</span>
                          </div>
                          {onInspectItem && (
                            <span className="material-symbols-outlined !text-[16px] text-[var(--danger)] opacity-0 group-hover/inspect:opacity-50 transition-opacity">open_in_new</span>
                          )}
                        </div>
                      );
                    })}
                  </>
                ) : (delayedConfirmMode === 'casualty' || delayedConfirmMode === 'flavor_swap') ? (
                  casualtyList.map((c: any, i: number) => (
                    <div key={i} 
                         onClick={(e) => { if (onInspectItem) { e.stopPropagation(); onInspectItem(c); } }}
                         className={`flex items-center gap-3 theme-glass-panel backdrop-blur-md border border-white/5 shadow-sm p-3 rounded-2xl ${onInspectItem ? 'cursor-pointer hover:bg-white/5 hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)] group/inspect' : ''}`}>
                      <span className={`material-symbols-outlined !text-[16px] shrink-0 ${delayedConfirmMode === 'flavor_swap' ? 'theme-text-accent' : 'theme-text-danger'}`}>{delayedConfirmMode === 'flavor_swap' ? 'swap_horiz' : (!isInActiveSet ? (t("icon_crisis_alert") || 'crisis_alert') : 'delete')}</span>
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className={`text-[8px] font-black uppercase tracking-widest ${delayedConfirmMode === 'flavor_swap' ? 'theme-text-accent opacity-70' : 'text-[var(--danger)] opacity-70'}`}>{delayedConfirmMode === 'flavor_swap' ? (t("flavor_replaced") || "REPLACED") : (t("artifact_removed") || "REMOVED")}</span>
                        <span className={`text-[10px] font-mono font-black uppercase tracking-widest truncate ${delayedConfirmMode === 'flavor_swap' ? 'theme-text-accent' : 'text-[var(--danger)]'}`}>{formatDisplayName(c.name || c)}</span>
                      </div>
                      {onInspectItem && (
                        <span className={`material-symbols-outlined !text-[16px] opacity-0 group-hover/inspect:opacity-50 transition-opacity ${delayedConfirmMode === 'flavor_swap' ? 'theme-text-accent' : 'text-[var(--danger)]'}`}>open_in_new</span>
                      )}
                    </div>
                  ))
                ) : delayedConfirmMode === 'broken' ? (
                  brokenMods.map((b: any, i: number) => (
                    <div key={i} 
                         onClick={(e) => { if (onInspectItem) { e.stopPropagation(); onInspectItem(b); } }}
                         className={`flex items-center gap-3 theme-glass-panel backdrop-blur-md border border-white/5 shadow-sm p-3 rounded-2xl ${onInspectItem ? 'cursor-pointer hover:bg-white/5 hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)] group/inspect' : ''}`}>
                      <span className="material-symbols-outlined !text-[16px] text-[var(--danger)] shrink-0">broken_image</span>
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-[8px] font-black text-[var(--danger)] opacity-70 uppercase tracking-widest">{t("status_broken") || "BROKEN"}</span>
                        <span className="text-[10px] font-mono font-black text-[var(--danger)] uppercase tracking-widest truncate">{formatDisplayName(b.displayName || b.name)}</span>
                      </div>
                      {onInspectItem && (
                        <span className="material-symbols-outlined !text-[16px] text-[var(--danger)] opacity-0 group-hover/inspect:opacity-50 transition-opacity">open_in_new</span>
                      )}
                    </div>
                  ))
                ) : delayedConfirmMode === 'tier3' ? (
                  <div className="flex flex-col relative gap-2">
                    <div className="text-[9px] font-black uppercase tracking-widest text-orange-500 mb-1 opacity-70 px-1">{t("select_winner") || "SELECT WINNER"}</div>
                    <div className="relative flex flex-col gap-8">
                      <button onClick={(e) => { e.stopPropagation(); setConfirmMode(null); setTimeout(() => { if (onResolveConflict) { onResolveConflict(e, tier3List, mod, mod.name); } }, 10); }} className="flex items-center justify-between gap-3 theme-glass-panel backdrop-blur-md border border-white/5 hover:border-[color-mix(in_srgb,orange_30%,transparent)] hover:bg-white/5 active:scale-95  duration-300 p-3 rounded-2xl w-full text-left group/btn shadow-md hover:shadow-lg">
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-[8px] font-black text-orange-500 opacity-50 group-hover/btn:opacity-100 transition-opacity uppercase tracking-widest">{t("equip_artifact") || "EQUIP ARTIFACT"}</span>
                          <span className="text-[10px] font-mono font-black text-[var(--text)] opacity-90 uppercase tracking-widest truncate">{formatDisplayName(mod.displayName || mod.name)}</span>
                        </div>
                        <span className="material-symbols-outlined !text-[16px] text-orange-500 opacity-30 group-hover/btn:opacity-100 group-hover/btn:scale-110 group-hover/btn:drop-shadow-[0_0_8px_orange] transition-all">add_circle</span>
                      </button>
                      <div className="absolute top-1/2 left-[calc(50%-12px)] -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
                        <div className="theme-glass-panel shadow-sm px-2.5 h-5 border border-white/10 text-orange-500 rounded-full flex items-center justify-center">
                          <span className="text-[9px] font-black leading-none tracking-[0.1em] mt-[1px]">VS</span>
                        </div>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); setConfirmMode(null); setTimeout(() => { if (onResolveConflict) { onResolveConflict(e, tier3List, mod, tier3List[0]?.rawName || tier3List[0]?.name); } }, 10); }} className="flex items-center justify-between gap-3 theme-glass-panel backdrop-blur-md border border-white/5 hover:border-[color-mix(in_srgb,orange_30%,transparent)] hover:bg-white/5 active:scale-95  duration-300 p-3 rounded-2xl w-full text-left group/btn shadow-md hover:shadow-lg">
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-[8px] font-black text-orange-500 opacity-50 group-hover/btn:opacity-100 transition-opacity uppercase tracking-widest">{t("keep_artifact") || "KEEP ARTIFACT"}</span>
                          <span className="text-[10px] font-mono font-black text-[var(--text)] opacity-90 uppercase tracking-widest truncate">{formatDisplayName(tier3List[0]?.name || tier3List[0] || "")}</span>
                        </div>
                        <span className="material-symbols-outlined !text-[16px] text-orange-500 opacity-30 group-hover/btn:opacity-100 group-hover/btn:scale-110 group-hover/btn:drop-shadow-[0_0_8px_orange] transition-all">add_circle</span>
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Footer Actions */}
              <div className="mt-auto w-full z-20 px-4 pb-4 pt-4 flex flex-row gap-2 shrink-0 border-t border-white/5 isolate will-change-transform [transform:translateZ(0)]">
                {delayedConfirmMode === 'tier3' ? (
                  <>

                    <button onClick={(e) => { e.stopPropagation(); onToggleSet(e, false); setConfirmMode(null); }} className="flex-1 min-w-0 py-2.5 rounded-xl bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] border border-[color-mix(in_srgb,var(--danger)_50%,transparent)] text-[var(--danger)] font-black text-[9px] uppercase tracking-widest hover:opacity-80 active:scale-95 transition-all truncate px-1">
                      {t("btn_ignore_conflict") || "IGNORE CONFLICT"}
                    </button>
                  </>
                ) : delayedConfirmMode === 'broken' || delayedConfirmMode === 'dlc' ? (
                  <>
                    <button onClick={(e) => { e.stopPropagation(); onToggleSet(e, false); setConfirmMode(null); }} className="flex-1 min-w-0 py-2.5 rounded-xl bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] border border-[color-mix(in_srgb,var(--danger)_50%,transparent)] text-[var(--danger)] font-black text-[9px] uppercase tracking-widest hover:opacity-80 transition-all truncate px-1">
                      {t("btn_equip_anyway")}
                    </button>
                    {mod.isParent && delayedConfirmMode === 'broken' && (
                      <button onClick={(e) => { e.stopPropagation(); onToggleSet(e, true); setConfirmMode(null); }} className="flex-1 min-w-0 py-2.5 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_20%,transparent)] text-[var(--text)] font-black text-[9px] uppercase tracking-widest hover:opacity-80 transition-all truncate px-1">
                        {t("btn_add_not_broken")}
                      </button>
                    )}
                  </>
                ) : (
                  <button onClick={(e) => { e.stopPropagation(); onToggleSet(e, false); setConfirmMode(null); }} className={`flex-1 min-w-0 py-2.5 rounded-xl border font-black text-[9px] uppercase tracking-widest truncate px-1 hover:opacity-80 transition-all ${delayedConfirmMode === 'flavor_swap' ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] border-[color-mix(in_srgb,var(--accent)_50%,transparent)] theme-text-accent' : 'bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] border-[color-mix(in_srgb,var(--danger)_50%,transparent)] text-[var(--danger)]'}`}>
                    {delayedConfirmMode === 'flavor_swap' ? t("btn_swap_confirm") : t("btn_purge_confirm")}
                  </button>
                )}
                <button onClick={(e) => { e.stopPropagation(); setConfirmMode(null); }} className="flex-1 min-w-0 py-2.5 rounded-xl border border-[color-mix(in_srgb,var(--safe)_50%,transparent)] bg-[color-mix(in_srgb,var(--safe)_10%,transparent)] text-[var(--safe)] font-black text-[9px] uppercase tracking-widest hover:opacity-80 transition-all truncate px-1">
                  {t("btn_safety")}
                </button>
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const arePropsEqual = (prev: any, next: any) => {
  return (
    prev.mod.hash === next.mod.hash &&
    prev.isInActiveSet === next.isInActiveSet &&
    prev.isExpanded === next.isExpanded &&
    prev.isSelected === next.isSelected &&
    (prev.missingDeps || []).length === (next.missingDeps || []).length &&
    prev.hideIneligible === next.hideIneligible &&
    prev.isBulkMode === next.isBulkMode &&
    prev.gameVersion === next.gameVersion &&
    prev.isFlavorSwap === next.isFlavorSwap &&
    (prev.casualtyList || []).length === (next.casualtyList || []).length &&
    (prev.tier3List || []).length === (next.tier3List || []).length
  );
};

export const ModCard = React.memo(ModCardInner, arePropsEqual);
