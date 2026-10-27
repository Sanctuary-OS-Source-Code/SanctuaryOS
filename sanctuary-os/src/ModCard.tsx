import React, { useState, useEffect } from "react";
import { HoverTooltip, formatDisplayName, getModIcon, cleanSearchName, mapDlcCode, isVersionMatch, getHighestVersion, getLowestVersion, parseStringArray } from "./shared";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import { UniversalCard } from "./components/universal/UniversalCard";
import { DynamicArtifactPreviewBanner } from "./chameleon-components/ThemeCard";

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
  _callbacksRef?: React.MutableRefObject<any>;
}

function ModCardInner({ mod, gameVersion, isInActiveSet, onSelect: _onSelect, onToggleSet: _onToggleSet, ownedDLC = [],
  maskedDLC = [], casualtyList = [], tier3List = [], missingDeps = [], isParent = false, isExpanded = false, onExpand: _onExpand = () => { },
  isBulkMode = false, isSelected = false, onResolveConflict: _onResolveConflict, anarchyRules = null, hideIneligible = false, isFlavorSwap = false,
  onInspectItem: _onInspectItem, onContextMenu: _onContextMenu, id, compact = false, layout = "standard", isGhostPlaceholder = false, hideHitBox = false, flavorGhostReason, isSelfGhosted, isSelfSwapped, isSelfBetaSwap, _callbacksRef }: ModCardProps) {
  const onSelect = (e: any) => (_callbacksRef?.current?.onSelect || _onSelect)?.(e);
  const onToggleSet = (e: any, force?: boolean) => (_callbacksRef?.current?.onToggleSet || _onToggleSet)?.(e, force);
  const onExpand = (e?: any) => (_callbacksRef?.current?.onExpand || _onExpand)?.(e);
  const onResolveConflict = (e: any, t3: any, m: any, winner?: string) => (_callbacksRef?.current?.onResolveConflict || _onResolveConflict)?.(e, t3, m, winner);
  const onInspectItem = (_callbacksRef?.current?.onInspectItem || _onInspectItem) ? (target: any) => (_callbacksRef?.current?.onInspectItem || _onInspectItem)?.(target) : undefined;
  const onContextMenu = (_callbacksRef?.current?.onContextMenu || _onContextMenu) ? (e: any) => (_callbacksRef?.current?.onContextMenu || _onContextMenu)?.(e) : undefined;
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

  const chipClass =
    "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";
  const isTier1Or2 = mod.compliance_tier === 1 || mod.compliance_tier === 2;
  const hasExplicitStatus = mod.status && mod.status.trim() !== "" && mod.status.toLowerCase() !== 'local folder' && mod.status.toLowerCase() !== 'local node';
  const statusType = hasExplicitStatus ? mod.status.toLowerCase() : (!mod.dbId || mod.version?.toLowerCase() === 'v.local' || isTier1Or2) ? 'local' : 'local';
  const isStatusBroken = isSelfBroken;

  let statusIcon = t("icon_science", "science");
  let statusIconColor = "text-[var(--accent)]";

  if (isStatusBroken || statusType === 'broken' || statusType === 'corrupted') {
    statusIcon = t("icon_error", "error");
    statusIconColor = "text-[var(--danger)]";
  } else if (statusType === 'unstable') {
    statusIcon = t("icon_warning", "warning");
    statusIconColor = "text-[var(--warning)]";
  } else if (statusType === 'synced') {
    statusIcon = t("icon_cloud_done", "cloud_done");
    statusIconColor = "text-[var(--success)]";
  } else if (statusType === 'stable' || statusType === 'verified' || (statusType === 'broken' && !isSelfBroken)) {
    statusIcon = t("icon_verified", "verified");
    statusIconColor = "text-[var(--success)]";
  } else if (statusType === 'under review' || statusType === 'pending') {
    statusIcon = t("icon_schedule", "schedule");
    statusIconColor = "text-[var(--accent)]";
  } else if (statusType === 'early access') {
    statusIcon = t("icon_science", "science");
    statusIconColor = "text-purple-400";
  } else if (statusType === 'paid') {
    statusIcon = t("icon_monetization_on", "monetization_on");
    statusIconColor = "text-amber-400";
  }

  const roleType = String(mod.relationshipType || mod._familyRole || "").toLowerCase();
  const roleBadgeLabel = mod.isCollection
    ? t("tab_cc", "Collection")
    : roleType === "core" && compact
      ? t("core_artifact", "Core {Mod}")
      : roleType === "twin"
        ? t("editor_twin", "Twin")
        : roleType === "flavor"
          ? t("studio_badge_flavor", "Flavor")
          : roleType === "beta"
            ? t("badge_beta", "Beta")
            : roleType === "addon"
              ? t("editor_addon", "Addon")
              : null;

  const modulesCount = Array.isArray(mod.flavors) && mod.flavors.length > 1
    ? mod.flavors.length
    : typeof mod.familyCount === "number" && mod.familyCount > 1
      ? mod.familyCount
      : typeof mod._familyChildrenCount === "number" && mod._familyChildrenCount > 0
        ? mod._familyChildrenCount
        : 0;

  const rawFileName = String(mod.file_extension || mod.name || "").toLowerCase();
  const isScript = rawFileName.includes("ts4script") || String(mod.type || "").toLowerCase().includes("script");
  const extLabel = isScript
    ? t("type_script", "Script")
    : !mod.isCollection
      ? t("type_package", "Package")
      : null;

  const statusBadgeNode = (
    <div className="group/badge relative cursor-help inline-flex pointer-events-auto" onClick={(e) => e.stopPropagation()}>
      <div className={chipClass}>
        <span className={`material-symbols-outlined !text-[12px] ${statusIconColor}`}>
          {statusIcon}
        </span>
        <span>
          {(() => {
            if (!hasExplicitStatus && (!mod.dbId || mod.version?.toLowerCase() === 'v.local' || isTier1Or2)) return t("badge_local", "Unlinked");
            const raw = (mod.status || "");
            let cleaned = raw.replace(/[[]"]/g, "");
            if (cleaned === 'bunker') cleaned = 'vault';
            if (mod.hash?.startsWith('dev_vault_')) return 'DEV';
            if (cleaned.toUpperCase().includes('SANDBOX')) return t("studio_badge_sandbox", "Sandbox");
            if (isSelfBroken) return t("status_corrupted", "Broken");
            if (cleaned.toLowerCase() === 'broken' && !isSelfBroken) return t("status_stable", "Stable");
            if (cleaned.toLowerCase() === 'stable') return t("status_stable", "Stable");
            if (cleaned.toLowerCase() === 'unverified') return t("unverified", "Unverified");
            if (cleaned.toLowerCase() === 'local folder' || cleaned.toLowerCase() === 'local node') return t("local_node", "Local Node");
            if (cleaned.toLowerCase() === 'unstable') return t("label_unstable", "Unstable");
            return cleaned.toUpperCase();
          })()}
        </span>
      </div>
      <HoverTooltip
        align="left"
        vAlign="bottom"
        content={
          <div className="flex flex-col gap-1.5 min-w-[210px] pointer-events-none py-0.5">
            <div className="glass-surface px-3 py-2 rounded-xl overflow-hidden flex flex-col gap-0.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
              <span className="text-[8.5px] font-extrabold capitalize text-[var(--subtext)] tracking-[0.14em] flex items-center gap-1.5"><span className="material-symbols-outlined !text-[11px] text-[var(--accent)]">{t("icon_history", "history")}</span>{t("revision", "Revision")}</span>
              <span className="text-[10.5px] font-mono font-bold text-[var(--text)] capitalize truncate">{(() => {
                let v = mod.latest_version || mod.version;
                if (!v && mod.isVirtual && mod.flavors) {
                  const flavorV = mod.flavors.find((f: any) => f.latest_version || f.version);
                  if (flavorV) v = flavorV.latest_version || flavorV.version;
                }
                return v || t("unknown", "Unknown");
              })()}</span>
            </div>
            <div className="glass-surface px-3 py-2 rounded-xl overflow-hidden flex flex-col gap-0.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
              <span className="text-[8.5px] font-extrabold capitalize text-[var(--subtext)] tracking-[0.14em] flex items-center gap-1.5"><span className="material-symbols-outlined !text-[11px] text-[var(--accent)]">{t("icon_sports_esports", "sports_esports")}</span>{t("label_game_version", "Game Version")}</span>
              <span className="text-[10.5px] font-bold text-[var(--text)] capitalize truncate">{mod.compatible_versions && mod.compatible_versions.length > 0 ? getHighestVersion(mod.compatible_versions) : t("filter_all", "All")}</span>
            </div>
            <div className="glass-surface px-3 py-2 rounded-xl overflow-hidden flex flex-col gap-0.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
              <span className="text-[8.5px] font-extrabold capitalize text-[var(--subtext)] tracking-[0.14em] flex items-center gap-1.5"><span className="material-symbols-outlined !text-[11px] text-[var(--accent)]">{t("icon_calendar_today", "calendar_today")}</span>{t("updated_date", "Last Updated")}</span>
              <span className="text-[10.5px] font-bold text-[var(--text)] capitalize truncate">{(() => {
                let dt = mod.updated_at;
                if (!dt && mod.isVirtual && mod.flavors) {
                  const dates = mod.flavors.map((f: any) => f.updated_at).filter(Boolean).sort().reverse();
                  if (dates.length > 0) dt = dates[0];
                }
                return dt ? new Date(dt).toLocaleDateString() : t("unknown", "Unknown");
              })()}</span>
            </div>
            {mod.status_reason && (
              <div className="glass-surface !bg-[color-mix(in_srgb,var(--danger)_12%,var(--glass-nested-surface-bg,rgba(255,255,255,0.04)))] !border-[color-mix(in_srgb,var(--danger)_30%,transparent)] px-3 py-2 rounded-xl overflow-hidden flex flex-col gap-0.5 border shadow-sm">
                <span className="text-[8.5px] font-extrabold capitalize text-[var(--danger)] tracking-[0.14em] flex items-center gap-1.5"><span className="material-symbols-outlined !text-[11px]">{t("icon_error", "error")}</span>{t("directive_note", "Rule Note")}</span>
                <span className="text-[10px] font-bold text-[var(--text)] capitalize whitespace-normal leading-snug">{mod.status_reason}</span>
              </div>
            )}
          </div>
        }
      />
    </div>
  );

  return (
    <div id={id} className="relative group/shadow min-h-[160px] h-full flex flex-col shadow-xl transition-colors duration-300 z-10 hover:z-[100]" style={{ borderRadius: 'var(--radius)' }}>
      {isGhostPlaceholder && (
        <div className="absolute inset-0 z-50 rounded-[var(--radius)] border-2 border-[var(--accent)] shadow-[0_0_30px_rgba(var(--accent-rgb),0.2)] bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] pointer-events-none" />
      )}
      <div className="relative w-full h-full flex flex-col">

        <div className={`w-full h-full transition-opacity duration-300 ${confirmMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          <UniversalCard
            layout={layout === "compact" || compact ? "vertical-compact" : "vertical"}
            isActive={isSelected}
            isDisabled={delayedConfirmMode !== null}
            isGhosted={isShadowed}
            image={(showImages && (mod.image_url || mod.imageUrl) && String(mod.image_url || mod.imageUrl) !== "null" && String(mod.image_url || mod.imageUrl).trim() !== "") ? (mod.image_url || mod.imageUrl) : undefined}
            icon={!((showImages && (mod.image_url || mod.imageUrl) && String(mod.image_url || mod.imageUrl) !== "null" && String(mod.image_url || mod.imageUrl).trim() !== "")) ? getModIcon(mod, activeGameSchema, t) : undefined}
            customIcon={
              <DynamicArtifactPreviewBanner
                data={mod}
                icon={getModIcon(mod, activeGameSchema, t)}
                compact={layout === "compact" || compact}
                heightClass="h-full"
              />
            }
            imageOverlay={
              <div className="absolute top-3 left-3 z-30 pointer-events-auto">
                {statusBadgeNode}
              </div>
            }
            title={formatDisplayName(mod.displayName || mod.name)}
            subtitle={
              <div className="flex items-center gap-1.5 opacity-80 mt-0.5">
                <span>{mod.author || t("unknown_mason", "Unknown {Mason}")}</span>
                {reqCount > 0 && (
                  <>
                    <span className="opacity-50">|</span>
                    <span className="theme-text-accent">{reqCount} {t("req_short", "REQ")}</span>
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
                e.currentTarget.classList.add('shadow-[0_0_50px_rgba(var(--accent-rgb),0.5)]', '!border-[var(--accent)]');
              }
            }}
            onDragLeave={(e) => {
              if (mod.name?.startsWith('LOCAL_SET_')) {
                e.currentTarget.classList.remove('shadow-[0_0_50px_rgba(var(--accent-rgb),0.5)]', '!border-[var(--accent)]');
              }
            }}
            onDrop={(e) => {
              if (mod.name?.startsWith('LOCAL_SET_')) {
                e.preventDefault();
                e.currentTarget.classList.remove('shadow-[0_0_50px_rgba(var(--accent-rgb),0.5)]', '!border-[var(--accent)]');
                const droppedHash = e.dataTransfer.getData('sanctuary/mod-hash');
                if (droppedHash) {
                  const localSts = JSON.parse(localStorage.getItem(`sanctuary_${useStore.getState().activeWorkspaceId}_playsets`) || "[]");
                  const updatedSets = localSts.map((ls: any) => ls.id === mod.dbId ? { ...ls, items: Array.from(new Set([...ls.items, droppedHash])) } : ls);
                  localStorage.setItem(`sanctuary_${useStore.getState().activeWorkspaceId}_playsets`, JSON.stringify(updatedSets));
                  if (window.dispatchEvent) {
                    window.dispatchEvent(new CustomEvent('runRadarSweep'));
                    window.dispatchEvent(new CustomEvent('showSystemAlert', { detail: { message: 'Artifact added to folder', type: 'success' } }));
                  }
                }
              }
            }}
            className={`w-full h-full ${confirmMode ? 'opacity-0 pointer-events-none' : ''} ${isExpanded ? 'ring-2 ring-[color-mix(in_srgb,var(--accent)_50%,transparent)] shadow-lg' : ''}`}
            badges={
              <div className="flex flex-wrap items-center gap-2">
                {roleBadgeLabel && (
                  <div className={chipClass}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {mod.isCollection
                        ? t("icon_folder_special", "folder_special")
                        : roleType === "core"
                          ? t("icon_account_tree", "account_tree")
                          : t("icon_extension", "extension")}
                    </span>
                    <span>{roleBadgeLabel}</span>
                  </div>
                )}

                {extLabel && (
                  <div className={chipClass}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                      {isScript ? t("icon_terminal", "terminal") : t("icon_deployed_code", "deployed_code")}
                    </span>
                    <span className="text-[var(--subtext)]">{extLabel}</span>
                  </div>
                )}

                {mod.is_early_access && (
                  <div className={chipClass}>
                    <span className="material-symbols-outlined !text-[12px] text-purple-400">
                      {t("icon_science", "science")}
                    </span>
                    <span>{t("badge_early_access", "Early Access")}</span>
                  </div>
                )}

                {mod.is_paid && (
                  <div className={chipClass}>
                    <span className="material-symbols-outlined !text-[12px] text-amber-400">
                      {t("icon_monetization_on", "monetization_on")}
                    </span>
                    <span>{t("badge_paid", "Paid")}</span>
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
                        {isSwappedState ? "swap_horiz" : isNemesisEquipped ? (t("icon_crisis_alert", "crisis_alert"))
                          : isGameVersionMismatch ? "sports_esports"
                            : hasMissingDeps ? "extension"
                              : isGhosted ? "currency_exchange"
                                : "broken_image"}
                      </span>
                    ) : hasTier3 && !isInActiveSet ? (
                      <span className="material-symbols-outlined !text-[16px]">{t("icon_tune", "tune")}</span>
                    ) : (
                      <span className={`material-symbols-outlined !text-[18px] ${isInActiveSet ? 'rotate-45' : ''}`}>{t("icon_add", "add")}</span>
                    )}

                    {(isShadowed || hasTier3 || isSwappedState) && !confirmMode && !delayedConfirmMode && (
                      <HoverTooltip
                        className="z-[100] !right-0 !translate-x-0 !left-auto"
                        variant={isShadowed && !isSwappedState ? 'danger' : isSwappedState ? 'accent' : 'warning'}
                        title={isNemesisEquipped ? t("fatal_conflict", "Severity 4 Collision") : isGameVersionMismatch ? t("unsupported_version", "Unsupported Game Version") : hasMissingDeps ? t("missing_artifacts", "Missing {Mods}") : isGhosted ? t("missing_dlc", "Missing DLC") : isSwappedState ? (isBetaSwap ? t("badge_beta", "BETA") : (t("flavor_swap", "Flavor Swap"))) : t("tier3_conflict", "Severity 3 Collision")}
                        subtitle={isNemesisEquipped
                          ? formatDisplayName(casualtyList[0]?.name || casualtyList[0] || "") + (casualtyList[0]?.note ? ` - ${casualtyList[0].note}` : "") + (casualtyList.length > 1 ? ` (+${casualtyList.length - 1})` : "")
                          : isGameVersionMismatch
                            ? (
                              <>
                                <div className="w-full truncate">{t("tooltip_required", "Required:")} {getHighestVersion(requiredVersions || [])}</div>
                                <div className="w-full truncate">{t("tooltip_current", "Current:")} {gameVersion || t("unknown", "Unknown")}</div>
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
                <button
                  type="button"
                  className="group/hitbox relative w-full flex items-center justify-between cursor-pointer pointer-events-auto text-left py-0.5"
                  onClick={(e) => { e.stopPropagation(); onExpand(e); }}
                >
                  <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-[var(--text)]">
                    <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                      {t("icon_account_tree", "account_tree")}
                    </span>
                    <span>
                      +{mod.flavors?.length || modulesCount || 0} {t("badge_modules_count", "Modules")}
                    </span>
                  </div>
                  <div className={`flex items-center gap-1 font-black text-[9px] uppercase tracking-widest transition-colors ${isExpanded ? 'text-[var(--accent)]' : 'text-[var(--subtext)] group-hover/hitbox:text-[var(--text)]'}`}>
                    <span>{isExpanded ? t("btn_close", "Close") : t("nav_exploring", "Explore")}</span>
                    <span className={`material-symbols-outlined !text-[15px] transition-transform duration-300 ${isExpanded ? 'rotate-180 text-[var(--accent)]' : ''}`}>
                      {t("icon_expand_more", "expand_more")}
                    </span>
                  </div>
                </button>
              ) : modulesCount > 0 ? (
                <div className="flex items-center justify-between w-full py-0.5">
                  <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-[var(--text)]">
                    <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                      {t("icon_account_tree", "account_tree")}
                    </span>
                    <span>
                      +{modulesCount} {t("badge_modules_count", "Modules")}
                    </span>
                  </div>
                </div>
              ) : undefined
            }
          />
        </div>

        {delayedConfirmMode && (
          <div className={`absolute inset-0 z-[100] transition-opacity duration-300 ${confirmMode ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
            <UniversalCard
              layout={layout === "compact" || compact ? "vertical-compact" : "vertical"}
              title={<></>}
              image={undefined}
              className={`pointer-events-auto relative h-full w-full border ${delayedConfirmMode === 'tier3' ? 'border-[color-mix(in_srgb,var(--warning)_38%,transparent)]' :
                delayedConfirmMode === 'flavor_swap' ? 'border-[color-mix(in_srgb,var(--accent)_38%,transparent)]' :
                  'border-[color-mix(in_srgb,var(--danger)_38%,transparent)]'
                }`}
            >
              <div
                className="absolute inset-0 z-20 flex flex-col rounded-[inherit] overflow-hidden"
                style={{
                  backgroundColor: 'var(--glass-dropdown-bg, color-mix(in srgb, var(--bg, #050b16) 86%, var(--panelTint, #081020)))',
                  backgroundImage:
                    delayedConfirmMode === 'tier3'
                      ? 'radial-gradient(120% 80% at 50% 0%, color-mix(in srgb, var(--warning) 18%, transparent) 0%, transparent 72%), var(--glass-dropdown-gradient, none)'
                      : delayedConfirmMode === 'flavor_swap'
                        ? 'radial-gradient(120% 80% at 50% 0%, color-mix(in srgb, var(--accent) 18%, transparent) 0%, transparent 72%), var(--glass-dropdown-gradient, none)'
                        : 'radial-gradient(120% 80% at 50% 0%, color-mix(in srgb, var(--danger) 20%, transparent) 0%, transparent 72%), var(--glass-dropdown-gradient, none)',
                }}
              >

                {/* Header */}
                <div className="relative z-10 pt-3.5 pb-2.5 px-4 flex flex-row items-center justify-center gap-2.5 shrink-0 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                  <div className={`w-7 h-7 rounded-xl flex items-center justify-center border shadow-sm shrink-0 ${delayedConfirmMode === 'tier3' ? 'bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] border-[color-mix(in_srgb,var(--warning)_35%,transparent)]' :
                    delayedConfirmMode === 'flavor_swap' ? 'bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] border-[color-mix(in_srgb,var(--accent)_35%,transparent)]' :
                      'bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] border-[color-mix(in_srgb,var(--danger)_35%,transparent)]'
                    }`}>
                    <span className={`material-symbols-outlined !text-[15px] ${delayedConfirmMode === 'tier3' ? 'text-[var(--warning)]' : delayedConfirmMode === 'flavor_swap' ? 'text-[var(--accent)]' : 'text-[var(--danger)]'}`}>
                      {delayedConfirmMode === 'flavor_swap' ? t("icon_swap_horiz", "swap_horiz") : delayedConfirmMode === 'dlc' ? (isGameVersionMismatch ? t("icon_sports_esports", "sports_esports") : hasMissingDeps ? t("icon_extension", "extension") : t("icon_currency_exchange", "currency_exchange")) : delayedConfirmMode === 'broken' ? t("icon_warning", "warning") : delayedConfirmMode === 'casualty' ? (!isInActiveSet ? t("icon_crisis_alert", "crisis_alert") : t("icon_delete", "delete")) : delayedConfirmMode === 'tier3' ? t("icon_tune", "tune") : t("icon_delete", "delete")}
                    </span>
                  </div>
                  <span className={`text-[12px] font-black capitalize tracking-wider text-left leading-tight truncate ${delayedConfirmMode === 'tier3' ? 'text-[var(--warning)]' : delayedConfirmMode === 'flavor_swap' ? 'text-[var(--accent)]' : 'text-[var(--danger)]'}`}>
                    {String(delayedConfirmMode === 'dlc' ? (isGameVersionMismatch ? t("unsupported_version", "Unsupported Game Version") : hasMissingDeps ? t("missing_artifacts", "Missing {Mods}") : t("missing_dlc", "Missing DLC")) : (delayedConfirmMode === 'casualty' || delayedConfirmMode === 'flavor_swap') ? (delayedConfirmMode === 'flavor_swap' ? (isBetaSwap ? t("badge_beta", "BETA") : (t("flavor_swap", "Flavor Swap"))) : (!isInActiveSet ? t("fatal_conflict", "Severity 4 Collision") : t("yeet_cascade", "Delete Cascade:"))) : delayedConfirmMode === 'broken' ? t("broken_artifacts", "Corrupted {Mods}") : t("tier3_conflict", "Severity 3 Collision")).replace(/:$/, '')}
                  </span>
                </div>

                {/* Scrolling Content */}
                <div className="relative z-10 flex-1 overflow-y-auto custom-scrollbar px-3.5 py-2.5 flex flex-col gap-2">
                  {delayedConfirmMode === 'dlc' ? (
                    <>
                      {isGameVersionMismatch && (
                        <div className="flex items-center gap-2.5 glass-surface border shadow-sm p-2.5 px-3 rounded-xl !bg-[color-mix(in_srgb,var(--danger)_12%,var(--glass-nested-surface-bg,rgba(255,255,255,0.04)))] !border-[color-mix(in_srgb,var(--danger)_30%,transparent)]">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-[color-mix(in_srgb,var(--danger)_16%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)]">
                            <span className="material-symbols-outlined !text-[15px] text-[var(--danger)]">{t("icon_sports_esports", "sports_esports")}</span>
                          </div>
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-[9.5px] font-extrabold text-[var(--danger)] capitalize tracking-wider leading-tight">{t("required_version", "Required Game Version")}</span>
                            <span className="text-[11px] font-mono font-bold text-[var(--text)] capitalize tracking-wide truncate mt-0.5">{getHighestVersion(requiredVersions || [])}</span>
                          </div>
                        </div>
                      )}
                      {missingPacks.length > 0 && missingPacks.map((p: string) => (
                        <div key={p} className="flex items-center gap-2.5 glass-surface border shadow-sm p-2.5 px-3 rounded-xl !bg-[color-mix(in_srgb,var(--danger)_12%,var(--glass-nested-surface-bg,rgba(255,255,255,0.04)))] !border-[color-mix(in_srgb,var(--danger)_30%,transparent)]">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-[color-mix(in_srgb,var(--danger)_16%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)]">
                            <span className="material-symbols-outlined !text-[15px] text-[var(--danger)]">{t("icon_currency_exchange", "currency_exchange")}</span>
                          </div>
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-[9.5px] font-extrabold text-[var(--danger)] capitalize tracking-wider leading-tight">{t("missing_dlc", "Missing DLC")}</span>
                            <span className="text-[11px] font-mono font-bold text-[var(--text)] capitalize tracking-wide truncate mt-0.5">{mapDlcCode(p)}</span>
                          </div>
                        </div>
                      ))}
                      {hasMissingDeps && missingDeps.map((req: any) => {
                        const reqIdStr = String(typeof req === 'string' ? req : (req.id || req.name || ''));
                        return (
                          <div key={reqIdStr}
                            onClick={(e) => { if (onInspectItem) { e.stopPropagation(); onInspectItem(req); } }}
                            className={`flex items-center gap-2.5 glass-surface border shadow-sm p-2.5 px-3 rounded-xl !bg-[color-mix(in_srgb,var(--danger)_12%,var(--glass-nested-surface-bg,rgba(255,255,255,0.04)))] !border-[color-mix(in_srgb,var(--danger)_30%,transparent)] ${onInspectItem ? 'cursor-pointer hover:!bg-[color-mix(in_srgb,var(--danger)_18%,var(--glass-nested-surface-bg,rgba(255,255,255,0.06)))] hover:!border-[color-mix(in_srgb,var(--danger)_45%,transparent)] group/inspect' : ''}`}>
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-[color-mix(in_srgb,var(--danger)_16%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)]">
                              <span className="material-symbols-outlined !text-[15px] text-[var(--danger)]">{t("icon_extension", "extension")}</span>
                            </div>
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className="text-[9.5px] font-extrabold text-[var(--danger)] capitalize tracking-wider leading-tight">{t("badge_missing_dep", "Missing Dependency")}</span>
                              <span className="text-[11px] font-mono font-bold text-[var(--text)] capitalize tracking-wide truncate mt-0.5">{cleanSearchName(reqIdStr, activeGameSchema)}</span>
                            </div>
                            {onInspectItem && (
                              <span className="material-symbols-outlined !text-[16px] text-[var(--danger)] opacity-60 group-hover/inspect:opacity-100 transition-opacity">{t("icon_open_in_new", "open_in_new")}</span>
                            )}
                          </div>
                        );
                      })}
                    </>
                  ) : (delayedConfirmMode === 'casualty' || delayedConfirmMode === 'flavor_swap') ? (
                    casualtyList.map((c: any, i: number) => (
                      <div key={i}
                        onClick={(e) => { if (onInspectItem) { e.stopPropagation(); onInspectItem(c); } }}
                        className={`flex items-center gap-2.5 glass-surface border shadow-sm p-2.5 px-3 rounded-xl ${delayedConfirmMode === 'flavor_swap' ? '!bg-[color-mix(in_srgb,var(--accent)_12%,var(--glass-nested-surface-bg,rgba(255,255,255,0.04)))] !border-[color-mix(in_srgb,var(--accent)_30%,transparent)]' : '!bg-[color-mix(in_srgb,var(--danger)_12%,var(--glass-nested-surface-bg,rgba(255,255,255,0.04)))] !border-[color-mix(in_srgb,var(--danger)_30%,transparent)]'} ${onInspectItem ? `cursor-pointer group/inspect ${delayedConfirmMode === 'flavor_swap' ? 'hover:!border-[color-mix(in_srgb,var(--accent)_48%,transparent)] hover:!bg-[color-mix(in_srgb,var(--accent)_18%,var(--glass-nested-surface-bg,rgba(255,255,255,0.06)))]' : 'hover:!border-[color-mix(in_srgb,var(--danger)_48%,transparent)] hover:!bg-[color-mix(in_srgb,var(--danger)_18%,var(--glass-nested-surface-bg,rgba(255,255,255,0.06)))]'}` : ''}`}>
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${delayedConfirmMode === 'flavor_swap' ? 'bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]' : 'bg-[color-mix(in_srgb,var(--danger)_16%,transparent)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)]'}`}>
                          <span className={`material-symbols-outlined !text-[15px] ${delayedConfirmMode === 'flavor_swap' ? 'text-[var(--accent)]' : 'text-[var(--danger)]'}`}>{delayedConfirmMode === 'flavor_swap' ? t("icon_swap_horiz", "swap_horiz") : (!isInActiveSet ? t("icon_crisis_alert", "crisis_alert") : t("icon_delete", "delete"))}</span>
                        </div>
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className={`text-[9.5px] font-extrabold capitalize tracking-wider leading-tight ${delayedConfirmMode === 'flavor_swap' ? 'text-[var(--accent)]' : 'text-[var(--danger)]'}`}>{delayedConfirmMode === 'flavor_swap' ? t("flavor_replaced", "Will Replace") : t("artifact_removed", "Will {Remove}")}</span>
                          <span className="text-[11px] font-mono font-bold text-[var(--text)] capitalize tracking-wide truncate mt-0.5">{formatDisplayName(c.name || c)}</span>
                        </div>
                        {onInspectItem && (
                          <span className={`material-symbols-outlined !text-[16px] opacity-60 group-hover/inspect:opacity-100 transition-opacity ${delayedConfirmMode === 'flavor_swap' ? 'text-[var(--accent)]' : 'text-[var(--danger)]'}`}>{t("icon_open_in_new", "open_in_new")}</span>
                        )}
                      </div>
                    ))
                  ) : delayedConfirmMode === 'broken' ? (
                    brokenMods.map((b: any, i: number) => (
                      <div key={i}
                        onClick={(e) => { if (onInspectItem) { e.stopPropagation(); onInspectItem(b); } }}
                        className={`flex items-center gap-2.5 glass-surface border shadow-sm p-2.5 px-3 rounded-xl !bg-[color-mix(in_srgb,var(--danger)_12%,var(--glass-nested-surface-bg,rgba(255,255,255,0.04)))] !border-[color-mix(in_srgb,var(--danger)_30%,transparent)] ${onInspectItem ? 'cursor-pointer hover:!bg-[color-mix(in_srgb,var(--danger)_18%,var(--glass-nested-surface-bg,rgba(255,255,255,0.06)))] hover:!border-[color-mix(in_srgb,var(--danger)_45%,transparent)] group/inspect' : ''}`}>
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-[color-mix(in_srgb,var(--danger)_16%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)]">
                          <span className="material-symbols-outlined !text-[15px] text-[var(--danger)]">{t("icon_broken_image", "broken_image")}</span>
                        </div>
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-[9.5px] font-extrabold text-[var(--danger)] capitalize tracking-wider leading-tight">{t("status_corrupted", "Corrupted")}</span>
                          <span className="text-[11px] font-mono font-bold text-[var(--text)] capitalize tracking-wide truncate mt-0.5">{formatDisplayName(b.displayName || b.name)}</span>
                        </div>
                        {onInspectItem && (
                          <span className="material-symbols-outlined !text-[16px] text-[var(--danger)] opacity-60 group-hover/inspect:opacity-100 transition-opacity">{t("icon_open_in_new", "open_in_new")}</span>
                        )}
                      </div>
                    ))
                  ) : delayedConfirmMode === 'tier3' ? (
                    <div className="flex flex-col relative gap-2">
                      <div className="text-[9.5px] font-extrabold capitalize tracking-wider text-[var(--warning)] mb-0.5 px-1">{t("select_winner", "Select Winner")}</div>
                      <div className="relative flex flex-col gap-6">
                        <button onClick={(e) => { e.stopPropagation(); setConfirmMode(null); setTimeout(() => { if (onResolveConflict) { onResolveConflict(e, tier3List, mod, mod.name); } }, 10); }} className="flex items-center justify-start gap-2.5 glass-surface border !bg-[color-mix(in_srgb,var(--warning)_10%,var(--glass-nested-surface-bg,rgba(255,255,255,0.04)))] !border-[color-mix(in_srgb,var(--warning)_28%,transparent)] hover:!border-[color-mix(in_srgb,var(--warning)_50%,transparent)] hover:!bg-[color-mix(in_srgb,var(--warning)_18%,var(--glass-nested-surface-bg,rgba(255,255,255,0.06)))] active:scale-95 transition-all duration-300 p-2.5 px-3 rounded-xl w-full text-left group/btn shadow-sm">
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-[9px] font-extrabold text-[var(--warning)] capitalize tracking-wider">{t("enemy_a", "{Mod} A")}</span>
                            <span className="text-[11px] font-mono font-bold text-[var(--text)] capitalize tracking-wide truncate mt-0.5">{formatDisplayName(mod.displayName || mod.name)}</span>
                          </div>
                          <span className="material-symbols-outlined !text-[18px] text-[var(--warning)] opacity-70 group-hover/btn:opacity-100 group-hover/btn:scale-110 transition-all">{t("icon_add_circle", "add_circle")}</span>
                        </button>
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
                          <div className="glass-surface shadow-md px-2.5 h-5 border !bg-[var(--glass-dropdown-bg,rgba(8,12,20,0.92))] !border-[color-mix(in_srgb,var(--warning)_35%,transparent)] text-[var(--warning)] rounded-full flex items-center justify-center">
                            <span className="text-[9px] font-black leading-none tracking-[0.1em]">{t("vs", "VS")}</span>
                          </div>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); setConfirmMode(null); setTimeout(() => { if (onResolveConflict) { onResolveConflict(e, tier3List, mod, tier3List[0]?.rawName || tier3List[0]?.name); } }, 10); }} className="flex items-center justify-start gap-2.5 glass-surface border !bg-[color-mix(in_srgb,var(--warning)_10%,var(--glass-nested-surface-bg,rgba(255,255,255,0.04)))] !border-[color-mix(in_srgb,var(--warning)_28%,transparent)] hover:!border-[color-mix(in_srgb,var(--warning)_50%,transparent)] hover:!bg-[color-mix(in_srgb,var(--warning)_18%,var(--glass-nested-surface-bg,rgba(255,255,255,0.06)))] active:scale-95 transition-all duration-300 p-2.5 px-3 rounded-xl w-full text-left group/btn shadow-sm">
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-[9px] font-extrabold text-[var(--warning)] capitalize tracking-wider">{t("enemy_b", "{Mod} B")}</span>
                            <span className="text-[11px] font-mono font-bold text-[var(--text)] capitalize tracking-wide truncate mt-0.5">{formatDisplayName(tier3List[0]?.name || tier3List[0] || "")}</span>
                          </div>
                          <span className="material-symbols-outlined !text-[18px] text-[var(--warning)] opacity-70 group-hover/btn:opacity-100 group-hover/btn:scale-110 transition-all">{t("icon_add_circle", "add_circle")}</span>
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Footer Actions */}
                <div className="w-full z-20 px-3.5 pb-3.5 pt-1.5 flex flex-row gap-2 shrink-0 isolate border-t border-[color-mix(in_srgb,var(--text)_6%,transparent)]">
                  {delayedConfirmMode === 'tier3' ? (
                  <>
                    <button onClick={(e) => { e.stopPropagation(); onToggleSet(e, false); setConfirmMode(null); }} className="flex-1 glass-surface min-w-0 py-2 rounded-xl text-[var(--danger)] font-black text-[10px] capitalize tracking-wider shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-95 transition-all px-2.5 min-h-[36px] flex items-center justify-center leading-tight whitespace-normal text-center break-words !bg-[color-mix(in_srgb,var(--danger)_14%,var(--glass-nested-surface-bg,rgba(255,255,255,0.04)))] !border-[color-mix(in_srgb,var(--danger)_35%,transparent)] hover:!bg-[color-mix(in_srgb,var(--danger)_24%,var(--glass-nested-surface-bg,rgba(255,255,255,0.06)))] hover:!border-[color-mix(in_srgb,var(--danger)_55%,transparent)]">
                      {t("btn_ignore_conflict", "Ignore Conflict")}
                    </button>
                  </>
                ) : delayedConfirmMode === 'broken' || delayedConfirmMode === 'dlc' ? (
                  <>
                    <button onClick={(e) => { e.stopPropagation(); onToggleSet(e, true); setConfirmMode(null); }} className="flex-1 glass-surface min-w-0 py-2 rounded-xl text-[var(--danger)] font-black text-[10px] capitalize tracking-wider shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-95 transition-all px-2.5 min-h-[36px] flex items-center justify-center leading-tight whitespace-normal text-center break-words !bg-[color-mix(in_srgb,var(--danger)_14%,var(--glass-nested-surface-bg,rgba(255,255,255,0.04)))] !border-[color-mix(in_srgb,var(--danger)_35%,transparent)] hover:!bg-[color-mix(in_srgb,var(--danger)_24%,var(--glass-nested-surface-bg,rgba(255,255,255,0.06)))] hover:!border-[color-mix(in_srgb,var(--danger)_55%,transparent)]">
                      {t("btn_equip_anyway", "Proceed Anyway")}
                    </button>
                    {mod.isParent && delayedConfirmMode === 'broken' && (
                      <button onClick={(e) => { e.stopPropagation(); onToggleSet(e, true); setConfirmMode(null); }} className="flex-1 glass-surface min-w-0 py-2 rounded-xl text-[var(--text)] font-black text-[10px] capitalize tracking-wider shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-95 transition-all px-2.5 min-h-[36px] flex items-center justify-center leading-tight whitespace-normal text-center break-words !bg-[color-mix(in_srgb,var(--text)_8%,var(--glass-nested-surface-bg,rgba(255,255,255,0.04)))] !border-[color-mix(in_srgb,var(--text)_18%,transparent)] hover:!bg-[color-mix(in_srgb,var(--text)_14%,var(--glass-nested-surface-bg,rgba(255,255,255,0.06)))] hover:!border-[color-mix(in_srgb,var(--text)_30%,transparent)]">
                        {t("btn_add_not_broken", "Add Not Corrupted")}
                      </button>
                    )}
                  </>
                ) : (
                  <button onClick={(e) => { e.stopPropagation(); onToggleSet(e, true); setConfirmMode(null); }} className={`flex-1 glass-surface min-w-0 py-2 rounded-xl font-black text-[10px] capitalize tracking-wider px-2.5 min-h-[36px] flex items-center justify-center leading-tight whitespace-normal text-center break-words shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-95 transition-all ${delayedConfirmMode === 'flavor_swap' ? 'text-[var(--accent)] !bg-[color-mix(in_srgb,var(--accent)_14%,var(--glass-nested-surface-bg,rgba(255,255,255,0.04)))] !border-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:!bg-[color-mix(in_srgb,var(--accent)_24%,var(--glass-nested-surface-bg,rgba(255,255,255,0.06)))] hover:!border-[color-mix(in_srgb,var(--accent)_55%,transparent)]' : 'text-[var(--danger)] !bg-[color-mix(in_srgb,var(--danger)_14%,var(--glass-nested-surface-bg,rgba(255,255,255,0.04)))] !border-[color-mix(in_srgb,var(--danger)_35%,transparent)] hover:!bg-[color-mix(in_srgb,var(--danger)_24%,var(--glass-nested-surface-bg,rgba(255,255,255,0.06)))] hover:!border-[color-mix(in_srgb,var(--danger)_55%,transparent)]'}`}>
                    {delayedConfirmMode === 'flavor_swap' ? t("btn_swap_confirm", "Swap Files") : t("btn_purge_confirm", "{Remove} {Mods}")}
                  </button>
                )}
                <button onClick={(e) => { e.stopPropagation(); setConfirmMode(null); }} className="flex-1 glass-surface min-w-0 py-2 rounded-xl text-[var(--text)] hover:text-[var(--success)] font-black text-[10px] capitalize tracking-wider shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-95 transition-all px-2.5 min-h-[36px] flex items-center justify-center leading-tight whitespace-normal text-center break-words !bg-[color-mix(in_srgb,var(--text)_8%,var(--glass-nested-surface-bg,rgba(255,255,255,0.04)))] !border-[color-mix(in_srgb,var(--text)_18%,transparent)] hover:!bg-[color-mix(in_srgb,var(--success)_16%,var(--glass-nested-surface-bg,rgba(255,255,255,0.06)))] hover:!border-[color-mix(in_srgb,var(--success)_42%,transparent)]">
                  {t("btn_safety", "Back to Safety")}
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
    prev.mod === next.mod &&
    prev.mod?.hash === next.mod?.hash &&
    prev.mod?.name === next.mod?.name &&
    prev.mod?.displayName === next.mod?.displayName &&
    prev.mod?.status === next.mod?.status &&
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
    prev.flavorGhostReason === next.flavorGhostReason &&
    Boolean(prev._callbacksRef?.current?.onInspectItem ?? prev.onInspectItem) === Boolean(next._callbacksRef?.current?.onInspectItem ?? next.onInspectItem) &&
    Boolean(prev._callbacksRef?.current?.onContextMenu ?? prev.onContextMenu) === Boolean(next._callbacksRef?.current?.onContextMenu ?? next.onContextMenu) &&
    true
  );
};

const MemoizedModCardInner = React.memo(ModCardInner, arePropsEqual);

export function ModCard(props: ModCardProps) {
  const callbacksRef = React.useRef({
    onSelect: props.onSelect,
    onToggleSet: props.onToggleSet,
    onExpand: props.onExpand,
    onToggleSelect: props.onToggleSelect,
    onResolveConflict: props.onResolveConflict,
    onInspectItem: props.onInspectItem,
    onContextMenu: props.onContextMenu,
  });
  callbacksRef.current = {
    onSelect: props.onSelect,
    onToggleSet: props.onToggleSet,
    onExpand: props.onExpand,
    onToggleSelect: props.onToggleSelect,
    onResolveConflict: props.onResolveConflict,
    onInspectItem: props.onInspectItem,
    onContextMenu: props.onContextMenu,
  };
  return <MemoizedModCardInner {...props} _callbacksRef={callbacksRef} />;
}

