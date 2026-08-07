import React, { useState, useEffect } from "react";
import { HoverTooltip, getFileLabel, formatDisplayName, isSupportedExtension, getExtensionRegex, getModIcon, CustomDropdown, cleanSearchName, mapDlcCode, isVersionMatch, getHighestVersion, getLowestVersion } from "./shared";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import { openUrl } from "@tauri-apps/plugin-opener";
import defaultCover from "./assets/default-cover.jpg";

interface ModCardProps {
  mod: any;
  gameVersion?: string;
  isInActiveSet?: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onToggleSet: (e: React.MouseEvent, force?: boolean) => void;
  ownedDLC?: string[];
  maskedDLC?: string[];
  casualtyList?: any[];
  tier3List?: any[];
  missingDeps?: any[];
  isParent?: boolean;
  isExpanded?: boolean;
  onExpand?: (e?: any) => void;
  isBulkMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  onResolveConflict?: any;
  anarchyRules?: any;
  hideIneligible?: boolean;
  isFlavorSwap?: boolean;
  onInspectItem?: any;
  onContextMenu?: (e: React.MouseEvent) => void;
  id?: string;
  compact?: boolean;
  isGhostPlaceholder?: boolean;
  hideHitBox?: boolean;
  flavorGhostReason?: any;
  isSelfGhosted?: boolean;
  isSelfSwapped?: boolean;
  isSelfBetaSwap?: boolean;
}

function ModCardInner({ mod, gameVersion, isInActiveSet, onSelect, onToggleSet, ownedDLC = [],
  maskedDLC = [], casualtyList = [], tier3List = [], missingDeps = [], isParent = false, isExpanded = false, onExpand = () => { },
  isBulkMode = false, isSelected = false, onToggleSelect = () => { }, onResolveConflict, anarchyRules = null, hideIneligible = false, isFlavorSwap = false,
  onInspectItem, onContextMenu, id, compact = false, isGhostPlaceholder = false, hideHitBox = false }: ModCardProps) {
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
    <div id={id} className={`relative group/shadow ${compact ? 'h-[250px]' : 'h-[320px]'} shadow-xl [perspective:1000px] transition-all duration-500 ${isGhostPlaceholder ? 'opacity-40 grayscale-[50%] scale-95 pointer-events-none' : delayedConfirmMode ? '' : isExpanded ? '-translate-y-2' : 'hover:-translate-y-1'} z-10 ${isGhostPlaceholder ? '' : 'hover:z-[100]'}`} style={{ borderRadius: 'var(--radius)' }}>
      {isGhostPlaceholder && (
        <div className="absolute inset-0 z-50 rounded-[var(--radius)] border-2 border-[var(--accent)] shadow-[0_0_20px_rgba(var(--accent-rgb),0.3)] animate-pulse pointer-events-none" />
      )}
      <div className={`relative w-full h-full transition-transform duration-500 [transform-style:preserve-3d] ${confirmMode ? '[transform:rotateY(180deg)]' : ''}`}>

        <div
          onClick={(e) => { if (isShadowed) { e.preventDefault(); return; } onSelect(e); }}
          draggable={!mod.name?.startsWith('LOCAL_SET_')}
          onDragStart={(e) => {
            if (mod.name?.startsWith('LOCAL_SET_')) return;
            e.dataTransfer.setData('sanctuary/mod-hash', mod.hash);
            e.dataTransfer.effectAllowed = 'copyMove';
            e.currentTarget.style.opacity = '0.5';
          }}
          onDragEnd={(e) => {
            e.currentTarget.style.opacity = '1';
          }}
          onDragOver={(e) => {
            if (mod.name?.startsWith('LOCAL_SET_')) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
              e.currentTarget.classList.add('scale-[1.02]', 'shadow-[0_0_50px_rgba(var(--accent-rgb),0.5)]', '!border-[var(--accent)]');
            }
          }}
          onDragLeave={(e) => {
            if (mod.name?.startsWith('LOCAL_SET_')) {
              e.currentTarget.classList.remove('scale-[1.02]', 'shadow-[0_0_50px_rgba(var(--accent-rgb),0.5)]', '!border-[var(--accent)]');
            }
          }}
          onDrop={(e) => {
            if (mod.name?.startsWith('LOCAL_SET_')) {
              e.preventDefault();
              e.currentTarget.classList.remove('scale-[1.02]', 'shadow-[0_0_50px_rgba(var(--accent-rgb),0.5)]', '!border-[var(--accent)]');
              const droppedHash = e.dataTransfer.getData('sanctuary/mod-hash');
              if (droppedHash) {
                const localSts = JSON.parse(localStorage.getItem("sanctuary_local_sets") || "[]");
                const updatedSets = localSts.map((ls: any) => ls.id === mod.dbId ? { ...ls, items: Array.from(new Set([...ls.items, droppedHash])) } : ls);
                localStorage.setItem("sanctuary_local_sets", JSON.stringify(updatedSets));
                if (window.dispatchEvent) {
                  window.dispatchEvent(new CustomEvent('runRadarSweep'));
                  window.dispatchEvent(new CustomEvent('showSystemAlert', { detail: { message: 'Artifact added to folder', type: 'success' } }));
                }
              }
            }
          }}
          onContextMenu={(e) => {
            if (onContextMenu) {
              e.preventDefault();
              e.stopPropagation();
              onContextMenu(e);
            }
          }}
          className={`relative flex flex-col w-full h-full theme-glass-panel transition-all duration-500 overflow-hidden group/maincard [backface-visibility:hidden] [transform:translateZ(0)] [box-shadow:inset_0_1px_1px_rgba(255,255,255,0.1)_!important] ${delayedConfirmMode ? 'pointer-events-none !border-transparent' : ''} ${isShadowed ? `opacity-30 grayscale border ${isSwappedState ? 'border-[var(--accent)]/50' : 'border-[var(--danger)]'}` : `cursor-pointer border border-transparent ${delayedConfirmMode ? '' : isExpanded ? '' : 'group-hover/shadow:shadow-[0_20px_50px_rgba(var(--accent-rgb),0.15)] group-hover/shadow:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]'}`}`}
          style={{ borderRadius: 'var(--radius)' }}
        >
          {!isShadowed && (
            <div className={`absolute inset-0 z-0 pointer-events-none transition-all duration-500 rounded-[var(--radius)] ${delayedConfirmMode ? '' : 'group-hover/maincard:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)]'}`} />
          )}


          {/* Top Left Badges - Absolute */}
          <div className="absolute top-4 left-4 z-30 flex flex-col items-start gap-2 pointer-events-none">
            {(() => {
              const isTier1Or2 = mod.compliance_tier === 1 || mod.compliance_tier === 2;
              const hasExplicitStatus = mod.status && mod.status.trim() !== "" && mod.status.toLowerCase() !== 'local folder' && mod.status.toLowerCase() !== 'local node';
              const statusType = hasExplicitStatus ? mod.status.toLowerCase() : (!mod.dbId || mod.version?.toLowerCase() === 'v.local' || isTier1Or2) ? 'local' : 'local';
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
                <div className="group/badge pointer-events-auto cursor-help">
                  <div className={`backdrop-blur-md border px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-2 transition-all ${badgeBg}`}>
                    <span className={`text-[8px] font-black uppercase tracking-widest ${badgeText}`}>
                      {(() => {
                        if (!hasExplicitStatus && (!mod.dbId || mod.version?.toLowerCase() === 'v.local' || isTier1Or2)) return t("unlinked_badge") || "LOCAL";
                        const raw = (mod.status || "");
                        let cleaned = raw.replace(/[[\]"]/g, "");
                        if (cleaned === 'bunker') cleaned = 'vault';
                        if (mod.hash?.startsWith('dev_vault_')) return 'DEV';
                        if (cleaned.toUpperCase().includes('SANDBOX')) cleaned = 'SANDBOX';
                        if (isSelfBroken) return t("status_broken");
                        if (cleaned.toLowerCase() === 'broken' && !isSelfBroken) return t("badge_stable");
                        if (cleaned.toLowerCase() === 'unverified') return t("unverified");
                        if (cleaned.toLowerCase() === 'local folder' || cleaned.toLowerCase() === 'local node') return t("local_node") || "LOCAL FOLDER";
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

            <div className="flex items-center gap-1.5 pointer-events-auto">
              {mod.is_early_access && (
                <div className="backdrop-blur-md bg-purple-500/10 border border-purple-500/30 px-2 py-1 rounded-lg shadow-sm flex items-center gap-1">
                  <span className="material-symbols-outlined !text-[10px] text-purple-500">science</span>
                  <span className="text-[7px] font-black uppercase tracking-widest text-purple-500">{t("badge_early_access") || "Early Access"}</span>
                </div>
              )}
              {mod.is_paid && (
                <div className="backdrop-blur-md bg-yellow-500/10 border border-yellow-500/30 px-2 py-1 rounded-lg shadow-sm flex items-center gap-1">
                  <span className="material-symbols-outlined !text-[10px] text-yellow-500">monetization_on</span>
                  <span className="text-[7px] font-black uppercase tracking-widest text-yellow-500">{t("badge_paid") || "Paid"}</span>
                </div>
              )}
            </div>
          </div>

          {/* Top Right Actions - Absolute */}
          <div className="absolute top-4 right-4 z-[60] flex items-center gap-1.5">
            {!mod.status?.includes('QUARANTINED') && !mod.status?.includes('ARCHIVED') && (
              <button
                onClick={handleToggleClick}
                className={`relative group/actionbtn w-8 h-8 rounded-lg backdrop-blur-md border flex items-center justify-center transition-all shadow-sm hover:shadow-md hover:scale-105 pointer-events-auto ${isShadowed ? (isSwappedState ? 'theme-panel-accent border-[var(--accent)] theme-text-accent' : 'theme-panel-danger border-[var(--danger)] text-[var(--text)]') : hasTier3 && !isInActiveSet ? 'bg-[color-mix(in_srgb,orange_5%,transparent)] border-[color-mix(in_srgb,orange_15%,transparent)] text-orange-500  hover:border-[color-mix(in_srgb,orange_25%,transparent)]' : isInActiveSet ? 'bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)]' : 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)]'}`}
              >
                {isShadowed ? (
                  <span className="material-symbols-outlined !text-[16px]">
                    {isSwappedState ? "swap_horiz" : isNemesisEquipped ? (t("icon_crisis_alert") || 'crisis_alert')
                      : isGameVersionMismatch ? "sports_esports"
                        : hasMissingDeps ? "extension"
                          : isGhosted ? "currency_exchange"
                            : "broken_image"}
                  </span>
                ) : hasTier3 && !isInActiveSet ? (
                  <span className="material-symbols-outlined !text-[16px]">{t("icon_tune") || 'tune'}</span>
                ) : (
                  <span className={`material-symbols-outlined !text-[18px] ${isInActiveSet ? 'rotate-45' : ''}`}>{t("icon_add") || 'add'}</span>
                )}

                {(isShadowed || hasTier3 || isSwappedState) && !confirmMode && !delayedConfirmMode && (
                  <HoverTooltip
                    className="z-[100] !right-0 !translate-x-0 !left-auto"
                    variant={isShadowed && !isSwappedState ? 'danger' : isSwappedState ? 'accent' : 'warning'}
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
              </button>
            )}
          </div>

          {/* Center Content */}
          <div className={`flex flex-col items-center justify-center ${compact ? 'gap-2 pt-6 pb-2' : `gap-4 pt-8 ${isParent ? 'pb-14' : 'pb-6'}`} w-full flex-1 p-4 pointer-events-none`}>
            <div className={`${compact ? 'w-20 h-20 rounded-[16px]' : 'w-32 h-32 rounded-[24px]'} bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] overflow-hidden shrink-0 shadow-inner flex items-center justify-center transition-colors duration-700 ${delayedConfirmMode ? '' : 'group-hover/maincard:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>
              {(showImages && (mod.image_url || mod.imageUrl) && String(mod.image_url || mod.imageUrl) !== "null" && String(mod.image_url || mod.imageUrl).trim() !== "") ? (
                <img src={mod.image_url || mod.imageUrl} className={`w-full h-full object-cover opacity-90 transition-opacity duration-700 ${delayedConfirmMode ? '' : 'group-hover/maincard:opacity-100'}`} alt={t("auto_cover")} onError={(e) => e.currentTarget.style.display = 'none'} />
              ) : (
                <span className={`material-symbols-outlined text-[var(--subtext)] opacity-40 transition-all duration-700 ${delayedConfirmMode ? '' : 'group-hover/maincard:opacity-60 group-hover/maincard:text-[var(--accent)]'}`} style={{ fontSize: '64px' }}>
                  {getModIcon(mod, activeGameSchema, t)}
                </span>
              )}
            </div>

            <div className={`flex flex-col overflow-hidden text-center ${compact ? 'gap-0.5' : 'gap-1.5'} w-full items-center`}>
              <h3 className={`${compact ? 'text-[12px]' : 'text-[14px]'} font-black truncate uppercase tracking-tight group-hover/maincard:theme-text-accent transition-colors w-full px-2 pointer-events-auto leading-normal pb-0.5`}>
                {formatDisplayName(mod.displayName || mod.name)}
              </h3>
              <p className="text-[10px] font-black text-[var(--text)]/40 uppercase tracking-widest truncate w-full pointer-events-auto mb-1 leading-normal pb-0.5">
                {mod.author || t("unknown_mason") || "Unknown Mason"}
              </p>

              <div className="flex flex-wrap items-center justify-center gap-1.5 pointer-events-auto pb-1">
                <span className="text-[10px] font-mono font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest leading-none">{mod.latest_version || mod.version || t("vlocal") || "V.LOCAL"}</span>
                {reqCount > 0 && (
                  <>
                    <span className="text-[10px] font-mono text-[var(--subtext)] opacity-60 uppercase tracking-widest leading-none">|</span>
                    <div className="theme-panel-accent border px-1.5 py-0.5 rounded text-[8px] font-black theme-text-accent uppercase leading-none">
                      {reqCount} {t("req_short")}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {isParent && !hideHitBox && (
            <div
              className={`absolute bottom-0 left-0 right-0 w-full pointer-events-auto shrink-0 cursor-pointer flex items-center justify-center gap-2 px-4 py-2.5 backdrop-blur-md transition-all font-black text-[9px] uppercase tracking-widest border-t rounded-b-[var(--radius)] ${isExpanded ? 'bg-white/10 border-t-white/20 text-white shadow-[0_-5px_15px_rgba(255,255,255,0.05)]' : 'border-t-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)]'}`}
              onClick={(e) => { e.stopPropagation(); onExpand(e); }}
            >
              <div className="w-4 h-4 flex items-center justify-center shrink-0">
                <svg className="w-3.5 h-3.5 opacity-80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
              </div>
              <span className="leading-none -translate-y-[1px]">{mod.flavors?.length || 0} {t("items")}</span>
              <div className="w-4 h-4 flex items-center justify-center shrink-0">
                <svg className={`w-2.5 h-2.5 opacity-60 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </div>
            </div>
          )}
        </div>

        {delayedConfirmMode && (
          <div className="absolute inset-0 z-[100] pointer-events-none [transform:rotateY(180deg)] [backface-visibility:hidden]">
            <div className={`pointer-events-auto relative h-full w-full theme-glass-panel [box-shadow:inset_0_1px_1px_rgba(255,255,255,0.1)_!important] flex flex-col border overflow-hidden [transform:translateZ(0)] ${delayedConfirmMode === 'tier3' ? 'border-[color-mix(in_srgb,orange_30%,transparent)]' :
              delayedConfirmMode === 'flavor_swap' ? 'border-[color-mix(in_srgb,var(--accent)_30%,transparent)]' :
                'border-[color-mix(in_srgb,var(--danger)_30%,transparent)]'
              }`} style={{ borderRadius: 'var(--radius)' }}>

              {/* Header */}
              <div className={`relative z-10 pt-5 pb-1 flex flex-col items-center justify-center gap-2 shrink-0`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center border shadow-inner ${delayedConfirmMode === 'tier3' ? 'bg-[color-mix(in_srgb,orange_5%,transparent)] border-[color-mix(in_srgb,orange_20%,transparent)]' :
                  delayedConfirmMode === 'flavor_swap' ? 'bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] border-[color-mix(in_srgb,var(--accent)_20%,transparent)]' :
                    'bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] border-[color-mix(in_srgb,var(--danger)_20%,transparent)]'
                  }`}>
                  <span className={`material-symbols-outlined !text-[20px] ${delayedConfirmMode === 'tier3' ? 'text-orange-500' : delayedConfirmMode === 'flavor_swap' ? 'theme-text-accent' : 'text-[var(--danger)]'}`}>
                    {delayedConfirmMode === 'flavor_swap' ? 'swap_horiz' : delayedConfirmMode === 'dlc' ? (isGameVersionMismatch ? 'sports_esports' : hasMissingDeps ? 'extension' : 'currency_exchange') : delayedConfirmMode === 'broken' ? 'warning' : delayedConfirmMode === 'casualty' ? (!isInActiveSet ? (t("icon_crisis_alert") || 'crisis_alert') : 'delete') : delayedConfirmMode === 'tier3' ? (t("icon_tune") || 'tune') : 'delete'}
                  </span>
                </div>
                <span className={`text-[12px] font-black uppercase tracking-widest text-center px-4 leading-normal ${delayedConfirmMode === 'tier3' ? 'text-orange-500' : delayedConfirmMode === 'flavor_swap' ? 'theme-text-accent' : 'text-[var(--danger)]'}`}>
                  {String(delayedConfirmMode === 'dlc' ? (isGameVersionMismatch ? t("unsupported_version") : hasMissingDeps ? t("missing_artifacts") : t("missing_dlc")) : (delayedConfirmMode === 'casualty' || delayedConfirmMode === 'flavor_swap') ? (delayedConfirmMode === 'flavor_swap' ? (isBetaSwap ? t("beta_swap") : (t("flavor_swap") || "FLAVOR SWAP")) : (!isInActiveSet ? t("fatal_conflict") : t("yeet_cascade"))) : delayedConfirmMode === 'broken' ? t("broken_artifacts") : t("tier3_conflict")).replace(/:$/, '')}
                </span>
              </div>

              {/* Scrolling Content */}
              <div className="relative z-10 flex-1 overflow-y-auto custom-scrollbar px-5 flex flex-col gap-2 mb-4">
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
                          <span className="text-[9px] font-black leading-none tracking-[0.1em] mt-[1px]">{t("vs")}</span>
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
              <div className="w-full z-20 px-4 pb-4 pt-1 flex flex-row gap-2 shrink-0 isolate">
                {delayedConfirmMode === 'tier3' ? (
                  <>

                    <button onClick={(e) => { e.stopPropagation(); onToggleSet(e, false); setConfirmMode(null); }} className="flex-1 min-w-0 py-2 rounded-[16px] bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] font-black text-[10px] uppercase tracking-widest shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-95 transition-all px-2 min-h-[36px] flex items-center justify-center leading-tight whitespace-normal text-center break-words">
                      {t("btn_ignore_conflict") || "IGNORE CONFLICT"}
                    </button>
                  </>
                ) : delayedConfirmMode === 'broken' || delayedConfirmMode === 'dlc' ? (
                  <>
                    <button onClick={(e) => { e.stopPropagation(); onToggleSet(e, true); setConfirmMode(null); }} className="flex-1 min-w-0 py-2 rounded-[16px] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] font-black text-[10px] uppercase tracking-widest shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-95 transition-all px-2 min-h-[36px] flex items-center justify-center leading-tight whitespace-normal text-center break-words">
                      {t("btn_equip_anyway")}
                    </button>
                    {mod.isParent && delayedConfirmMode === 'broken' && (
                      <button onClick={(e) => { e.stopPropagation(); onToggleSet(e, true); setConfirmMode(null); }} className="flex-1 min-w-0 py-2 rounded-[16px] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_20%,transparent)] text-[var(--text)] font-black text-[10px] uppercase tracking-widest shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-95 transition-all px-2 min-h-[36px] flex items-center justify-center leading-tight whitespace-normal text-center break-words">
                        {t("btn_add_not_broken")}
                      </button>
                    )}
                  </>
                ) : (
                  <button onClick={(e) => { e.stopPropagation(); onToggleSet(e, false); setConfirmMode(null); }} className={`flex-1 min-w-0 py-2 rounded-[16px] border font-black text-[10px] uppercase tracking-widest px-2 min-h-[36px] flex items-center justify-center leading-tight whitespace-normal text-center break-words shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-95 transition-all ${delayedConfirmMode === 'flavor_swap' ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] theme-text-accent' : 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)]'}`}>
                    {delayedConfirmMode === 'flavor_swap' ? t("btn_swap_confirm") : t("btn_purge_confirm")}
                  </button>
                )}
                <button onClick={(e) => { e.stopPropagation(); setConfirmMode(null); }} className="flex-1 min-w-0 py-2 rounded-[16px] border border-[color-mix(in_srgb,var(--safe)_30%,transparent)] bg-[color-mix(in_srgb,var(--safe)_10%,transparent)] text-[var(--safe)] font-black text-[10px] uppercase tracking-widest shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-95 transition-all px-2 min-h-[36px] flex items-center justify-center leading-tight whitespace-normal text-center break-words">
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
    prev.compact === next.compact &&
    prev.isGhostPlaceholder === next.isGhostPlaceholder &&
    prev.hideHitBox === next.hideHitBox &&
    prev.isSelected === next.isSelected &&
    (prev.missingDeps || []).length === (next.missingDeps || []).length &&
    prev.hideIneligible === next.hideIneligible &&
    prev.isBulkMode === next.isBulkMode &&
    prev.gameVersion === next.gameVersion &&
    prev.isFlavorSwap === next.isFlavorSwap &&
    (prev.casualtyList || []).length === (next.casualtyList || []).length &&
    (prev.tier3List || []).length === (next.tier3List || []).length &&
    prev.isSelfSwapped === next.isSelfSwapped &&
    prev.isSelfBetaSwap === next.isSelfBetaSwap &&
    prev.isSelfGhosted === next.isSelfGhosted &&
    prev.flavorGhostReason === next.flavorGhostReason
  );
};

export const ModCard = React.memo(ModCardInner, arePropsEqual);
