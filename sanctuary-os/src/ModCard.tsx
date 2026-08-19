import React, { useState, useEffect } from "react";
import { HoverTooltip, getFileLabel, formatDisplayName, isSupportedExtension, getExtensionRegex, getModIcon, CustomDropdown, cleanSearchName, mapDlcCode, isVersionMatch, getHighestVersion, getLowestVersion, parseStringArray } from "./shared";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import { openUrl } from "@tauri-apps/plugin-opener";
import defaultCover from "./assets/default-cover.jpg";
import { UniversalCard } from "./components/universal/UniversalCard";

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
  layout?: "standard" | "compact" | "list";
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
  onInspectItem, onContextMenu, id, compact = false, layout = "standard", isGhostPlaceholder = false, hideHitBox = false, flavorGhostReason, isSelfGhosted, isSelfSwapped, isSelfBetaSwap }: ModCardProps) {
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

  let rawDLC: string[] = parseStringArray(mod.requiredDLC);
  if (mod.flavors) {
    mod.flavors.forEach((f: any) => {
      if (f.requiredDLC) {
        const fDLC = parseStringArray(f.requiredDLC);
        fDLC.forEach((d: string) => { if (!rawDLC.includes(d)) rawDLC.push(d); });
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

  const isGhosted = isSelfGhosted !== undefined ? isSelfGhosted : (missingPacks.length > 0 || hasMissingDeps || (isGameVersionMismatch && mod.ghostReason !== "VERSION_MISMATCH" ? true : mod.ghostReason === "VERSION_MISMATCH") || mod.isGhosted);

  if (hideIneligible && isGhosted) {
    return null;
  }

  const requiredVersions = [familyVersion];
  const isBetaSwap = isSelfBetaSwap !== undefined ? isSelfBetaSwap : (!isInActiveSet && (mod.relationshipType === 'beta' || (mod.relationshipType !== 'core' && mod.sub_type?.toLowerCase() === 'beta') || (mod.isVirtual && mod.flavors?.some((f: any) => f.relationshipType === 'beta' || (f.relationshipType !== 'core' && f.sub_type?.toLowerCase() === 'beta')))));
  const isSwappedState = isSelfSwapped !== undefined ? isSelfSwapped : ((isFlavorSwap || isBetaSwap) && !isInActiveSet);
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
      if (isSwappedState && casualtyList.length > 0) { setConfirmMode('flavor_swap'); return; }
      if (isNemesisEquipped) { setConfirmMode('casualty'); return; }
      if (isGhosted) { setConfirmMode('dlc'); return; }
      if (hasTier3) { setConfirmMode('tier3'); return; }
      if (brokenMods.length > 0) { setConfirmMode('broken'); return; }
    }
    if (isInActiveSet && isFlavorSwap) { setConfirmMode('flavor_swap'); return; }
    if (isInActiveSet && casualtyList.length > 0) { setConfirmMode('casualty'); return; }
    onToggleSet(e, true);
  };

  return (
    <div id={id} className={`relative group/shadow min-h-[160px] h-full flex flex-col shadow-xl transition-all duration-500 ${isGhostPlaceholder ? 'z-[150]' : delayedConfirmMode ? '' : isExpanded ? '-translate-y-2' : 'hover:-translate-y-1'} z-10 ${isGhostPlaceholder ? '' : 'hover:z-[100]'}`} style={{ borderRadius: 'var(--radius)' }}>
      {isGhostPlaceholder && (
        <div className="absolute inset-0 z-50 rounded-[var(--radius)] border-2 border-[var(--accent)] shadow-[0_0_30px_rgba(var(--accent-rgb),0.2)] bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] pointer-events-none" />
      )}
      <div className={`relative w-full h-full flex flex-col`}>

        <div className={`w-full h-full transition-all duration-300 ${confirmMode ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'}`}>
          <UniversalCard
            layout={layout === "compact" || compact ? "vertical-compact" : "vertical"}
            isActive={isSelected}
            isDisabled={delayedConfirmMode !== null}
            isGhosted={isShadowed}
            image={(showImages && (mod.image_url || mod.imageUrl) && String(mod.image_url || mod.imageUrl) !== "null" && String(mod.image_url || mod.imageUrl).trim() !== "") ? (mod.image_url || mod.imageUrl) : undefined}
            icon={!((showImages && (mod.image_url || mod.imageUrl) && String(mod.image_url || mod.imageUrl) !== "null" && String(mod.image_url || mod.imageUrl).trim() !== "")) ? getModIcon(mod, activeGameSchema, t) : undefined}
            title={formatDisplayName(mod.displayName || mod.name)}
            subtitle={
              <div className="flex items-center gap-1.5 opacity-80 mt-0.5">
                <span>{mod.author || t("unknown_mason")}</span>
                {reqCount > 0 && (
                  <>
                    <span className="opacity-50">|</span>
                    <span className="theme-text-accent">{reqCount} {t("req_short")}</span>
                  </>
                )}
              </div>
            }
            onClick={(e) => { if (isShadowed) { e.preventDefault(); return; } onSelect(e); }}
            onContextMenu={(e) => {
              if (onContextMenu) {
                e.preventDefault();
                e.stopPropagation();
                onContextMenu(e);
              }
            }}
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
            className={`w-full h-full ${isExpanded ? 'ring-2 ring-[color-mix(in_srgb,var(--accent)_50%,transparent)] shadow-lg' : ''}`}
            badges={
              <div className="flex flex-wrap items-center gap-2">
                {(() => {
                  const isTier1Or2 = mod.compliance_tier === 1 || mod.compliance_tier === 2;
                  const hasExplicitStatus = mod.status && mod.status.trim() !== "" && mod.status.toLowerCase() !== 'local folder' && mod.status.toLowerCase() !== 'local node';
                  const statusType = hasExplicitStatus ? mod.status.toLowerCase() : (!mod.dbId || mod.version?.toLowerCase() === 'v.local' || isTier1Or2) ? 'local' : 'local';
                  const isStatusBroken = isSelfBroken;

                  let badgeBg = "bg-slate-500/[10%] border-slate-500/[30%] ";
                  let badgeText = "text-slate-400";
                  let hoverBorder = "border-slate-500/30";

                  if (isStatusBroken || statusType === 'broken' || statusType === 'corrupted') {
                    badgeBg = "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] ";
                    badgeText = "text-[var(--danger)]";
                    hoverBorder = "border-[color-mix(in_srgb,var(--danger)_30%,transparent)]";
                  } else if (statusType === 'unstable') {
                    badgeBg = "bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border-[color-mix(in_srgb,var(--warning)_30%,transparent)] ";
                    badgeText = "text-[var(--warning)]";
                    hoverBorder = "border-[color-mix(in_srgb,var(--warning)_30%,transparent)]";
                  } else if (statusType === 'stable' || (statusType === 'broken' && !isSelfBroken)) {
                    badgeBg = "bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border-[color-mix(in_srgb,var(--success)_30%,transparent)] ";
                    badgeText = "text-[var(--success)]";
                    hoverBorder = "border-[color-mix(in_srgb,var(--success)_30%,transparent)]";
                  } else if (statusType === 'under review') {
                    badgeBg = "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] ";
                    badgeText = "text-cyan-400";
                    hoverBorder = "border-[color-mix(in_srgb,var(--accent)_30%,transparent)]";
                  } else if (statusType === 'pending') {
                    badgeBg = "bg-sky-500/[10%] border-sky-500/[30%] ";
                    badgeText = "text-sky-400";
                    hoverBorder = "border-sky-500/30";
                  } else if (statusType === 'early access') {
                    badgeBg = "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] ";
                    badgeText = "text-purple-400";
                    hoverBorder = "border-[color-mix(in_srgb,var(--accent)_30%,transparent)]";
                  } else if (statusType === 'paid') {
                    badgeBg = "bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border-[color-mix(in_srgb,var(--warning)_30%,transparent)] ";
                    badgeText = "text-amber-400";
                    hoverBorder = "border-[color-mix(in_srgb,var(--warning)_30%,transparent)]";
                  }

                  return (
                    <div className="group/badge relative cursor-help inline-flex">
                      <div className={`glass-surface border px-2 py-0.5 rounded-[max(0px,calc(var(--radius)-8px))] shadow-sm flex items-center gap-1.5 transition-all ${badgeBg}`}>
                        <span className={`text-[8px] font-black capitalize tracking-widest ${badgeText}`}>
                          {(() => {
                            if (!hasExplicitStatus && (!mod.dbId || mod.version?.toLowerCase() === 'v.local' || isTier1Or2)) return t("unlinked_badge");
                            const raw = (mod.status || "");
                            let cleaned = raw.replace(/[[\]"]/g, "");
                            if (cleaned === 'bunker') cleaned = 'vault';
                            if (mod.hash?.startsWith('dev_vault_')) return 'DEV';
                            if (cleaned.toUpperCase().includes('SANDBOX')) cleaned = 'SANDBOX';
                            if (isSelfBroken) return t("status_broken");
                            if (cleaned.toLowerCase() === 'broken' && !isSelfBroken) return t("badge_stable");
                            if (cleaned.toLowerCase() === 'stable') return t("status_dd_stable");
                            if (cleaned.toLowerCase() === 'unverified') return t("unverified");
                            if (cleaned.toLowerCase() === 'local folder' || cleaned.toLowerCase() === 'local node') return t("local_node");
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
                            className={`flex flex-col gap-2 glass-panel border ${hoverBorder} p-4 rounded-[var(--radius)] shadow-[0_30px_80px_rgba(0,0,0,0.8)] min-w-[220px] pointer-events-none`}
                            style={{
                              '--glassBlur': '30px',
                              '--panelTint': 'var(--text)',
                              '--glassOpacity': '15%'
                            } as React.CSSProperties}
                          >
                            <div className="relative z-10 flex flex-col gap-2 w-full">
                              <div className="bg-[color-mix(in_srgb,var(--text)_2%,transparent)] px-3 py-2 rounded-[max(0px,calc(var(--radius)-4px))] overflow-hidden flex flex-col gap-0.5 border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner">
                                <span className="text-[7px] font-black capitalize text-[var(--subtext)] opacity-80 tracking-[0.2em] flex items-center gap-1.5"><span className="material-symbols-outlined !text-[10px]">{t("icon_history")}</span>{t("revision")}</span>
                                <span className="text-[10px] font-mono font-black text-[var(--text)] capitalize truncate">{(() => {
                                  let v = mod.latest_version || mod.version;
                                  if (!v && mod.isVirtual && mod.flavors) {
                                    const flavorV = mod.flavors.find((f: any) => f.latest_version || f.version);
                                    if (flavorV) v = flavorV.latest_version || flavorV.version;
                                  }
                                  return v || t("vlocal");
                                })()}</span>
                              </div>
                              <div className="bg-[color-mix(in_srgb,var(--text)_2%,transparent)] px-3 py-2 rounded-[max(0px,calc(var(--radius)-4px))] overflow-hidden flex flex-col gap-0.5 border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner">
                                <span className="text-[7px] font-black capitalize text-[var(--subtext)] opacity-80 tracking-[0.2em] flex items-center gap-1.5"><span className="material-symbols-outlined !text-[10px]">{t("icon_sports_esports")}</span>{t("label_game_version")}</span>
                                <span className="text-[9px] font-black text-[var(--text)] capitalize truncate">{mod.compatible_versions && mod.compatible_versions.length > 0 ? getHighestVersion(mod.compatible_versions) : t("ql_all")}</span>
                              </div>
                              <div className="bg-[color-mix(in_srgb,var(--text)_2%,transparent)] px-3 py-2 rounded-[max(0px,calc(var(--radius)-4px))] overflow-hidden flex flex-col gap-0.5 border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner">
                                <span className="text-[7px] font-black capitalize text-[var(--subtext)] opacity-80 tracking-[0.2em] flex items-center gap-1.5"><span className="material-symbols-outlined !text-[10px]">{t("icon_calendar_today")}</span>{t("updated_date")}</span>
                                <span className="text-[9px] font-black text-[var(--text)] capitalize truncate">{(() => {
                                  let dt = mod.updated_at;
                                  if (!dt && mod.isVirtual && mod.flavors) {
                                    const dates = mod.flavors.map((f: any) => f.updated_at).filter(Boolean).sort().reverse();
                                    if (dates.length > 0) dt = dates[0];
                                  }
                                  return dt ? new Date(dt).toLocaleDateString() : t("vlocal");
                                })()}</span>
                              </div>
                              {mod.status_reason && (
                                <div className="glass-surface bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border-[color-mix(in_srgb,var(--danger)_20%,transparent)] px-3 py-2 rounded-[max(0px,calc(var(--radius)-4px))] overflow-hidden flex flex-col gap-0.5 border shadow-sm mt-1">
                                  <span className="text-[7px] font-black capitalize theme-text-danger opacity-80 tracking-[0.2em] flex items-center gap-1.5"><span className="material-symbols-outlined !text-[10px]">{t("icon_error")}</span>{t("directive_note")}</span>
                                  <span className="text-[9px] font-black theme-text-danger capitalize whitespace-normal leading-tight">{mod.status_reason}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        }
                      />
                    </div>
                  );
                })()}

                {mod.is_early_access && (
                  <div className="backdrop-blur-md bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] px-2 py-0.5 rounded-[max(0px,calc(var(--radius)-8px))] shadow-sm flex items-center gap-1">
                    <span className="material-symbols-outlined !text-[10px] text-purple-500">science</span>
                    <span className="text-[7px] font-black capitalize tracking-widest text-purple-500">{t("badge_early_access")}</span>
                  </div>
                )}
                {mod.is_paid && (
                  <div className="backdrop-blur-md bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] px-2 py-0.5 rounded-[max(0px,calc(var(--radius)-8px))] shadow-sm flex items-center gap-1">
                    <span className="material-symbols-outlined !text-[10px] text-yellow-500">monetization_on</span>
                    <span className="text-[7px] font-black capitalize tracking-widest text-yellow-500">{t("badge_paid")}</span>
                  </div>
                )}
              </div>
            }
            actions={
              <div className="flex items-center gap-1.5 pointer-events-auto">
                {!mod.status?.includes('QUARANTINED') && !mod.status?.includes('ARCHIVED') && (
                  <button
                    onClick={handleToggleClick}
                    className={`relative group/actionbtn w-8 h-8 rounded-[max(0px,calc(var(--radius)-4px))] backdrop-blur-md border flex items-center justify-center transition-all shadow-sm hover:shadow-md hover:scale-105 pointer-events-auto ${isShadowed ? (isSwappedState ? 'theme-panel-accent border-[var(--accent)] theme-text-accent' : 'theme-panel-danger border-[var(--danger)] text-[var(--text)]') : hasTier3 && !isInActiveSet ? 'bg-[color-mix(in_srgb,orange_5%,transparent)] border-[color-mix(in_srgb,orange_15%,transparent)] text-orange-500  hover:border-[color-mix(in_srgb,orange_25%,transparent)]' : isInActiveSet ? 'bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)]' : 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)]'}`}
                  >
                    {isShadowed ? (
                      <span className="material-symbols-outlined !text-[16px]">
                        {isSwappedState ? "swap_horiz" : isNemesisEquipped ? (t("icon_crisis_alert"))
                          : isGameVersionMismatch ? "sports_esports"
                            : hasMissingDeps ? "extension"
                              : isGhosted ? "currency_exchange"
                                : "broken_image"}
                      </span>
                    ) : hasTier3 && !isInActiveSet ? (
                      <span className="material-symbols-outlined !text-[16px]">{t("icon_tune")}</span>
                    ) : (
                      <span className={`material-symbols-outlined !text-[18px] ${isInActiveSet ? 'rotate-45' : ''}`}>{t("icon_add")}</span>
                    )}

                    {(isShadowed || hasTier3 || isSwappedState) && !confirmMode && !delayedConfirmMode && (
                      <HoverTooltip
                        className="z-[100] !right-0 !translate-x-0 !left-auto"
                        variant={isShadowed && !isSwappedState ? 'danger' : isSwappedState ? 'accent' : 'warning'}
                        title={isNemesisEquipped ? t("fatal_conflict") : isGameVersionMismatch ? t("unsupported_version") : hasMissingDeps ? t("missing_artifacts") : isGhosted ? t("missing_dlc") : isSwappedState ? (isBetaSwap ? t("badge_beta") : (t("flavor_swap"))) : t("tier3_conflict")}
                        subtitle={isNemesisEquipped
                          ? formatDisplayName(casualtyList[0]?.name || casualtyList[0] || "") + (casualtyList[0]?.note ? ` - ${casualtyList[0].note}` : "") + (casualtyList.length > 1 ? ` (+${casualtyList.length - 1})` : "")
                          : isGameVersionMismatch
                            ? (
                              <>
                                <div className="w-full truncate">{t("tooltip_required")} {getHighestVersion(requiredVersions || [])}</div>
                                <div className="w-full truncate">{t("tooltip_current")} {gameVersion || t("unknown")}</div>
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
            }
            footer={
              isParent && !hideHitBox ? (
                <div
                  className="group/hitbox static cursor-pointer pointer-events-auto"
                  onClick={(e) => { e.stopPropagation(); onExpand(e); }}
                >
                  <div className="absolute inset-0 z-0" />
                  <div
                    className={`relative z-10 w-full flex items-center justify-center gap-2 -translate-y-1.5 transition-all font-black text-[9px] capitalize tracking-widest ${isExpanded ? 'text-[var(--text)]' : 'text-[var(--subtext)] group-hover/hitbox:text-[var(--text)]'}`}
                  >
                    <span className="leading-none flex items-center mt-[1px]">{mod.flavors?.length || 0} {t("items")}</span>
                    <span className={`material-symbols-outlined !text-[14px] transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>expand_more</span>
                  </div>
                </div>
              ) : undefined
            }
          />
        </div>

        {delayedConfirmMode && (
          <div className={`absolute inset-0 z-[100] transition-all duration-300 ${confirmMode ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'}`}>
            <UniversalCard
              layout={layout === "compact" || compact ? "vertical-compact" : "vertical"}
              title={<></>}
              image={(showImages && (mod.image_url || mod.imageUrl) && String(mod.image_url || mod.imageUrl) !== "null" && String(mod.image_url || mod.imageUrl).trim() !== "") ? (mod.image_url || mod.imageUrl) : undefined}
              className={`pointer-events-auto relative h-full w-full border ${delayedConfirmMode === 'tier3' ? 'border-[color-mix(in_srgb,orange_30%,transparent)]' :
                delayedConfirmMode === 'flavor_swap' ? 'border-[color-mix(in_srgb,var(--accent)_30%,transparent)]' :
                  'border-[color-mix(in_srgb,var(--danger)_30%,transparent)]'
                }`}
            >
              <div className="absolute inset-0 z-20 flex flex-col rounded-[inherit] overflow-hidden">

                {/* Header */}
                <div className={`relative z-10 pt-4 pb-2 px-4 flex flex-row items-center justify-center gap-3 shrink-0`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border shadow-inner shrink-0 ${delayedConfirmMode === 'tier3' ? 'bg-[color-mix(in_srgb,orange_5%,transparent)] border-[color-mix(in_srgb,orange_20%,transparent)]' :
                    delayedConfirmMode === 'flavor_swap' ? 'bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] border-[color-mix(in_srgb,var(--accent)_20%,transparent)]' :
                      'bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] border-[color-mix(in_srgb,var(--danger)_20%,transparent)]'
                    }`}>
                    <span className={`material-symbols-outlined !text-[16px] ${delayedConfirmMode === 'tier3' ? 'text-orange-500' : delayedConfirmMode === 'flavor_swap' ? 'theme-text-accent' : 'text-[var(--danger)]'}`}>
                      {delayedConfirmMode === 'flavor_swap' ? 'swap_horiz' : delayedConfirmMode === 'dlc' ? (isGameVersionMismatch ? 'sports_esports' : hasMissingDeps ? 'extension' : 'currency_exchange') : delayedConfirmMode === 'broken' ? 'warning' : delayedConfirmMode === 'casualty' ? (!isInActiveSet ? (t("icon_crisis_alert")) : 'delete') : delayedConfirmMode === 'tier3' ? (t("icon_tune")) : 'delete'}
                    </span>
                  </div>
                  <span className={`text-[12px] font-black capitalize tracking-widest text-left leading-normal truncate ${delayedConfirmMode === 'tier3' ? 'text-orange-500' : delayedConfirmMode === 'flavor_swap' ? 'theme-text-accent' : 'text-[var(--danger)]'}`}>
                    {String(delayedConfirmMode === 'dlc' ? (isGameVersionMismatch ? t("unsupported_version") : hasMissingDeps ? t("missing_artifacts") : t("missing_dlc")) : (delayedConfirmMode === 'casualty' || delayedConfirmMode === 'flavor_swap') ? (delayedConfirmMode === 'flavor_swap' ? (isBetaSwap ? t("beta_swap") : (t("flavor_swap"))) : (!isInActiveSet ? t("fatal_conflict") : t("yeet_cascade"))) : delayedConfirmMode === 'broken' ? t("broken_artifacts") : t("tier3_conflict")).replace(/:$/, '')}
                  </span>
                </div>

                {/* Scrolling Content */}
                <div className="relative z-10 flex-1 overflow-y-auto custom-scrollbar px-5 flex flex-col gap-2 mb-4">
                  {delayedConfirmMode === 'dlc' ? (
                    <>
                      {isGameVersionMismatch && (
                        <div className="flex items-center gap-3 glass-panel backdrop-blur-md border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-sm p-3 rounded-2xl">
                          <span className="material-symbols-outlined !text-[16px] text-[var(--danger)] shrink-0">sports_esports</span>
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-[8px] font-black text-[var(--danger)] opacity-70 capitalize tracking-widest">{t("required_version")}</span>
                            <span className="text-[10px] font-mono font-black text-[var(--danger)] capitalize tracking-widest truncate">{getHighestVersion(requiredVersions || [])}</span>
                          </div>
                        </div>
                      )}
                      {missingPacks.length > 0 && missingPacks.map((p: string) => (
                        <div key={p} className="flex items-center gap-3 glass-panel backdrop-blur-md border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-sm p-3 rounded-2xl">
                          <span className="material-symbols-outlined !text-[16px] text-[var(--danger)] shrink-0">currency_exchange</span>
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-[8px] font-black text-[var(--danger)] opacity-70 capitalize tracking-widest">{t("missing_dlc")}</span>
                            <span className="text-[10px] font-mono font-black text-[var(--danger)] capitalize tracking-widest truncate">{mapDlcCode(p)}</span>
                          </div>
                        </div>
                      ))}
                      {hasMissingDeps && missingDeps.map((req: any) => {
                        const reqIdStr = String(typeof req === 'string' ? req : (req.id || req.name || ''));
                        return (
                          <div key={reqIdStr}
                            onClick={(e) => { if (onInspectItem) { e.stopPropagation(); onInspectItem(req); } }}
                            className={`flex items-center gap-3 glass-panel backdrop-blur-md border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-sm p-3 rounded-2xl ${onInspectItem ? 'cursor-pointer hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)] group/inspect' : ''}`}>
                            <span className="material-symbols-outlined !text-[16px] text-[var(--danger)] shrink-0">extension</span>
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className="text-[8px] font-black text-[var(--danger)] opacity-70 capitalize tracking-widest">{t("missing_dependency")}</span>
                              <span className="text-[10px] font-mono font-black text-[var(--danger)] capitalize tracking-widest truncate">{cleanSearchName(reqIdStr, activeGameSchema)}</span>
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
                        className={`flex items-center gap-3 glass-panel backdrop-blur-md border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-sm p-3 rounded-2xl ${onInspectItem ? 'cursor-pointer hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)] group/inspect' : ''}`}>
                        <span className={`material-symbols-outlined !text-[16px] shrink-0 ${delayedConfirmMode === 'flavor_swap' ? 'theme-text-accent' : 'theme-text-danger'}`}>{delayedConfirmMode === 'flavor_swap' ? 'swap_horiz' : (!isInActiveSet ? (t("icon_crisis_alert")) : 'delete')}</span>
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className={`text-[8px] font-black capitalize tracking-widest ${delayedConfirmMode === 'flavor_swap' ? 'theme-text-accent opacity-70' : 'text-[var(--danger)] opacity-70'}`}>{delayedConfirmMode === 'flavor_swap' ? (t("flavor_replaced")) : (t("artifact_removed"))}</span>
                          <span className={`text-[10px] font-mono font-black capitalize tracking-widest truncate ${delayedConfirmMode === 'flavor_swap' ? 'theme-text-accent' : 'text-[var(--danger)]'}`}>{formatDisplayName(c.name || c)}</span>
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
                        className={`flex items-center gap-3 glass-panel backdrop-blur-md border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-sm p-3 rounded-2xl ${onInspectItem ? 'cursor-pointer hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)] group/inspect' : ''}`}>
                        <span className="material-symbols-outlined !text-[16px] text-[var(--danger)] shrink-0">broken_image</span>
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-[8px] font-black text-[var(--danger)] opacity-70 capitalize tracking-widest">{t("status_broken")}</span>
                          <span className="text-[10px] font-mono font-black text-[var(--danger)] capitalize tracking-widest truncate">{formatDisplayName(b.displayName || b.name)}</span>
                        </div>
                        {onInspectItem && (
                          <span className="material-symbols-outlined !text-[16px] text-[var(--danger)] opacity-0 group-hover/inspect:opacity-50 transition-opacity">open_in_new</span>
                        )}
                      </div>
                    ))
                  ) : delayedConfirmMode === 'tier3' ? (
                    <div className="flex flex-col relative gap-2">
                      <div className="text-[9px] font-black capitalize tracking-widest text-orange-500 mb-1 opacity-70 px-1">{t("select_winner")}</div>
                      <div className="relative flex flex-col gap-8">
                        <button onClick={(e) => { e.stopPropagation(); setConfirmMode(null); setTimeout(() => { if (onResolveConflict) { onResolveConflict(e, tier3List, mod, mod.name); } }, 10); }} className="flex items-center justify-start gap-3 glass-panel backdrop-blur-md border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,orange_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] active:scale-95  duration-300 p-3 rounded-2xl w-full text-left group/btn shadow-md hover:shadow-lg">
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-[8px] font-black text-orange-500 opacity-50 group-hover/btn:opacity-100 transition-opacity capitalize tracking-widest">{t("equip_artifact")}</span>
                            <span className="text-[10px] font-mono font-black text-[var(--text)] opacity-90 capitalize tracking-widest truncate">{formatDisplayName(mod.displayName || mod.name)}</span>
                          </div>
                          <span className="material-symbols-outlined !text-[16px] text-orange-500 opacity-30 group-hover/btn:opacity-100 group-hover/btn:scale-110 group-hover/btn:drop-shadow-[0_0_8px_orange] transition-all">add_circle</span>
                        </button>
                        <div className="absolute top-1/2 left-[calc(50%-12px)] -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
                          <div className="glass-panel shadow-sm px-2.5 h-5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-orange-500 rounded-full flex items-center justify-center">
                            <span className="text-[9px] font-black leading-none tracking-[0.1em] mt-[1px]">{t("vs")}</span>
                          </div>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); setConfirmMode(null); setTimeout(() => { if (onResolveConflict) { onResolveConflict(e, tier3List, mod, tier3List[0]?.rawName || tier3List[0]?.name); } }, 10); }} className="flex items-center justify-start gap-3 glass-panel backdrop-blur-md border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,orange_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] active:scale-95  duration-300 p-3 rounded-2xl w-full text-left group/btn shadow-md hover:shadow-lg">
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-[8px] font-black text-orange-500 opacity-50 group-hover/btn:opacity-100 transition-opacity capitalize tracking-widest">{t("keep_artifact")}</span>
                            <span className="text-[10px] font-mono font-black text-[var(--text)] opacity-90 capitalize tracking-widest truncate">{formatDisplayName(tier3List[0]?.name || tier3List[0] || "")}</span>
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

                    <button onClick={(e) => { e.stopPropagation(); onToggleSet(e, false); setConfirmMode(null); }} className="flex-1 glass-surface min-w-0 py-2 rounded-[16px] text-[var(--danger)] font-black text-[10px] capitalize tracking-widest shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-95 transition-all px-2 min-h-[36px] flex items-center justify-center leading-tight whitespace-normal text-center break-words hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)]">
                      {t("btn_ignore_conflict")}
                    </button>
                  </>
                ) : delayedConfirmMode === 'broken' || delayedConfirmMode === 'dlc' ? (
                  <>
                    <button onClick={(e) => { e.stopPropagation(); onToggleSet(e, true); setConfirmMode(null); }} className="flex-1 glass-surface min-w-0 py-2 rounded-[16px] text-[var(--danger)] font-black text-[10px] capitalize tracking-widest shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-95 transition-all px-2 min-h-[36px] flex items-center justify-center leading-tight whitespace-normal text-center break-words hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)]">
                      {t("btn_equip_anyway")}
                    </button>
                    {mod.isParent && delayedConfirmMode === 'broken' && (
                      <button onClick={(e) => { e.stopPropagation(); onToggleSet(e, true); setConfirmMode(null); }} className="flex-1 glass-surface min-w-0 py-2 rounded-[16px] text-[var(--text)] font-black text-[10px] capitalize tracking-widest shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-95 transition-all px-2 min-h-[36px] flex items-center justify-center leading-tight whitespace-normal text-center break-words hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)]">
                        {t("btn_add_not_broken")}
                      </button>
                    )}
                  </>
                ) : (
                  <button onClick={(e) => { e.stopPropagation(); onToggleSet(e, true); setConfirmMode(null); }} className={`flex-1 glass-surface min-w-0 py-2 rounded-[16px] font-black text-[10px] capitalize tracking-widest px-2 min-h-[36px] flex items-center justify-center leading-tight whitespace-normal text-center break-words shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-95 transition-all ${delayedConfirmMode === 'flavor_swap' ? 'theme-text-accent hover:bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]' : 'text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)]'}`}>
                    {delayedConfirmMode === 'flavor_swap' ? t("btn_swap_confirm") : t("btn_purge_confirm")}
                  </button>
                )}
                <button onClick={(e) => { e.stopPropagation(); setConfirmMode(null); }} className="flex-1 glass-surface min-w-0 py-2 rounded-[16px] text-[var(--safe)] font-black text-[10px] capitalize tracking-widest shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-95 transition-all px-2 min-h-[36px] flex items-center justify-center leading-tight whitespace-normal text-center break-words hover:bg-[color-mix(in_srgb,var(--safe)_15%,transparent)] hover:border-[color-mix(in_srgb,var(--safe)_30%,transparent)]">
                  {t("btn_safety")}
                </button>
                </div>

              </div>
            </UniversalCard>
          </div>
        )}
      </div>
    </div>
  );
}

const arePropsEqual = (prev: any, next: any) => {
  return (
    prev.layout === next.layout &&
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

