import React, { useState } from "react";
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
  const delayedConfirmMode = confirmMode;

  let rawDLC: string[] = parseStringArray(mod.requiredDLC);
  if (mod.flavors) {
    mod.flavors.forEach((f: any) => {
      if (f.requiredDLC) {
        const fDLC = parseStringArray(f.requiredDLC);
        fDLC.forEach((d: string) => { if (!rawDLC.includes(d)) rawDLC.push(d); });
      }
    });
  }
  rawDLC = rawDLC.filter((p: string) => {
    const code = p.split(' ')[0].toUpperCase().trim();
    return Boolean(code) && code !== "BASE";
  });

  let missingPacks = rawDLC.filter((p: string) => {
    const baseCode = p.split(' ')[0].toUpperCase().trim();
    return !ownedDLC.includes(baseCode) || maskedDLC.includes(baseCode);
  });

  const hasMissingDeps = missingDeps.length > 0;

  const getVersions = (target: any) => {
    const v = target.compatible_versions;
    return typeof v === 'string' ? v.split(',').map((s: string) => s.trim()) : (v || []);
  };

  let familyVersion = "Unknown";
  if (mod.isVirtual) {
    const highestPerFlavor = (mod.flavors || [])
      .map((f: any) => getHighestVersion(getVersions(f)))
      .filter((v: string) => v && v !== "Unknown" && v !== "ALL" && v !== "ANY" && v.toLowerCase() !== "global");
    familyVersion = highestPerFlavor.length > 0 ? getLowestVersion(highestPerFlavor) : getHighestVersion(getVersions(mod));
  } else {
    familyVersion = getHighestVersion(getVersions(mod));
  }

  const isGameVersionMismatch = Boolean(
    gameVersion &&
    familyVersion !== "Unknown" &&
    familyVersion !== "ALL" &&
    familyVersion !== "ANY" &&
    familyVersion.toLowerCase() !== "global" &&
    familyVersion !== "" &&
    !isVersionMatch([familyVersion], gameVersion)
  );

  const hasLiveGhostIssue = missingPacks.length > 0 || hasMissingDeps || isGameVersionMismatch;
  const isGhosted = isSelfGhosted !== undefined ? (isSelfGhosted && hasLiveGhostIssue) : hasLiveGhostIssue;

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

  const statusBadgeLabel = (() => {
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
  })();

  const statusRevisionValue = (() => {
    let v = mod.latest_version || mod.version;
    if (!v && mod.isVirtual && mod.flavors) {
      const flavorV = mod.flavors.find((f: any) => f.latest_version || f.version);
      if (flavorV) v = flavorV.latest_version || flavorV.version;
    }
    return v || t("unknown", "Unknown");
  })();

  const statusGameVersionValue = mod.compatible_versions && mod.compatible_versions.length > 0
    ? getHighestVersion(mod.compatible_versions)
    : t("filter_all", "All");

  const statusUpdatedDateValue = (() => {
    let dt = mod.updated_at;
    if (!dt && mod.isVirtual && mod.flavors) {
      const dates = mod.flavors.map((f: any) => f.updated_at).filter(Boolean).sort().reverse();
      if (dates.length > 0) dt = dates[0];
    }
    return dt ? new Date(dt).toLocaleDateString() : t("unknown", "Unknown");
  })();

  const statusBadgeNode = (
    <div className="group/badge relative cursor-help inline-flex pointer-events-auto" onClick={(e) => e.stopPropagation()}>
      <div className={chipClass}>
        <span className={`material-symbols-outlined !text-[12px] ${statusIconColor}`}>
          {statusIcon}
        </span>
        <span>{statusBadgeLabel}</span>
      </div>
      <HoverTooltip
        align="left"
        vAlign="bottom"
        icon={statusIcon}
        variant={
          isStatusBroken || statusType === 'broken' || statusType === 'corrupted' || Boolean(mod.status_reason)
            ? 'danger'
            : statusType === 'unstable'
              ? 'warning'
              : 'default'
        }
        title={statusBadgeLabel}
        subtitle={
          <>
            <div className="w-full truncate">{t("revision", "Revision")}: {statusRevisionValue}</div>
            <div className="w-full truncate">{t("label_game_version", "Game Version")}: {statusGameVersionValue}</div>
            <div className="w-full truncate">{t("updated_date", "Last Updated")}: {statusUpdatedDateValue}</div>
            {mod.status_reason && (
              <div className="w-full text-[var(--danger)] font-bold mt-0.5">{t("directive_note", "Rule Note")}: {mod.status_reason}</div>
            )}
          </>
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
                <span>{!mod.author || String(mod.author).trim().toLowerCase() === "unknown" ? t("unknown", "Unknown") : mod.author}</span>
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
                    type="button"
                    onClick={handleToggleClick}
                    className={`relative group/actionbtn w-7 h-7 rounded-lg glass-surface border flex items-center justify-center transition-all cursor-pointer pointer-events-auto ${
                      isShadowed
                        ? isSwappedState
                          ? 'border-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:border-[var(--accent)] text-[var(--accent)]'
                          : 'border-[color-mix(in_srgb,var(--danger)_35%,transparent)] hover:border-[var(--danger)] text-[var(--danger)]'
                        : hasTier3 && !isInActiveSet
                          ? 'border-[color-mix(in_srgb,var(--warning)_35%,transparent)] hover:border-[var(--warning)] text-[var(--warning)]'
                          : isInActiveSet
                            ? 'border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] text-[var(--danger)]'
                            : 'border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--success)_50%,transparent)] text-[var(--success)]'
                    }`}
                  >
                    {isShadowed ? (
                      <span className="material-symbols-outlined !text-[15px]">
                        {isSwappedState
                          ? t("icon_swap_horiz", "swap_horiz")
                          : isNemesisEquipped
                            ? t("icon_crisis_alert", "crisis_alert")
                            : isGameVersionMismatch
                              ? t("icon_sports_esports", "sports_esports")
                              : hasMissingDeps
                                ? t("icon_extension", "extension")
                                : isGhosted
                                  ? t("icon_currency_exchange", "currency_exchange")
                                  : t("icon_broken_image", "broken_image")}
                      </span>
                    ) : hasTier3 && !isInActiveSet ? (
                      <span className="material-symbols-outlined !text-[15px]">{t("icon_tune", "tune")}</span>
                    ) : (
                      <span className={`material-symbols-outlined !text-[16px] transition-transform duration-200 ${isInActiveSet ? 'rotate-45' : ''}`}>{t("icon_add", "add")}</span>
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
          <div className={`absolute inset-0 z-[100] transition-opacity duration-200 ${confirmMode ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
            <UniversalCard
              layout={layout === "compact" || compact ? "vertical-compact" : "vertical"}
              title={<></>}
              image={undefined}
              className={` relative h-full w-full ${confirmMode ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
            >
              <div className="absolute inset-0 z-20 flex flex-col rounded-[inherit] overflow-hidden">

                {/* Header (Matches ModCard & ConflictCard Liquid Glass Header Chips) */}
                <div className="relative z-10 pt-3 pb-2 px-3.5 flex flex-row items-center justify-between gap-2 shrink-0">
                  <div className={chipClass}>
                    <span className={`material-symbols-outlined !text-[12px] ${delayedConfirmMode === 'tier3' ? 'text-[var(--warning)]' : delayedConfirmMode === 'flavor_swap' ? 'text-[var(--accent)]' : 'text-[var(--danger)]'}`}>
                      {delayedConfirmMode === 'flavor_swap' ? t("icon_swap_horiz", "swap_horiz") : delayedConfirmMode === 'dlc' ? (isGameVersionMismatch ? t("icon_sports_esports", "sports_esports") : hasMissingDeps ? t("icon_extension", "extension") : t("icon_currency_exchange", "currency_exchange")) : delayedConfirmMode === 'broken' ? t("icon_warning", "warning") : delayedConfirmMode === 'casualty' ? (!isInActiveSet ? t("icon_crisis_alert", "crisis_alert") : t("icon_delete", "delete")) : delayedConfirmMode === 'tier3' ? t("icon_tune", "tune") : t("icon_delete", "delete")}
                    </span>
                    <span className="truncate">
                      {String(delayedConfirmMode === 'dlc' ? (isGameVersionMismatch ? t("unsupported_version", "Unsupported Game Version") : hasMissingDeps ? t("missing_artifacts", "Missing {Mods}") : t("missing_dlc", "Missing DLC")) : (delayedConfirmMode === 'casualty' || delayedConfirmMode === 'flavor_swap') ? (delayedConfirmMode === 'flavor_swap' ? (isBetaSwap ? t("badge_beta", "BETA") : (t("flavor_swap", "Flavor Swap"))) : (!isInActiveSet ? t("fatal_conflict", "Severity 4 Collision") : t("yeet_cascade", "Delete Cascade:"))) : delayedConfirmMode === 'broken' ? t("broken_artifacts", "Corrupted {Mods}") : t("tier3_conflict", "Severity 3 Collision")).replace(/:$/, '')}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setConfirmMode(null); }}
                    className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] flex items-center justify-center shrink-0 transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[15px]">{t("icon_close", "close")}</span>
                  </button>
                </div>

                {/* Scrolling Content */}
                <div className="relative z-10 flex-1 min-h-0 overflow-y-auto custom-scrollbar px-3.5 py-1.5 flex flex-col gap-2">
                  {delayedConfirmMode === 'dlc' ? (
                    <>
                      {isGameVersionMismatch && (
                        <div className="relative flex items-center gap-2.5 shrink-0 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] py-2.5 px-3 min-h-[46px] rounded-xl">
                          <div className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--danger)_32%,transparent)] flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined !text-[14px] text-[var(--danger)]">{t("icon_sports_esports", "sports_esports")}</span>
                          </div>
                          <div className="flex flex-col justify-center min-w-0 flex-1 gap-0.5">
                            <span className="text-[8.5px] font-black text-[var(--danger)] uppercase tracking-wider leading-none">{t("required_version", "Required Game Version")}</span>
                            <span className="text-[11px] font-black text-[var(--text)] tracking-tight leading-tight truncate">{getHighestVersion(requiredVersions || [])}</span>
                          </div>
                          <HoverTooltip
                            onlyWhenTruncated
                            variant="danger"
                            icon={t("icon_sports_esports", "sports_esports")}
                            title={getHighestVersion(requiredVersions || [])}
                            subtitle={t("required_version", "Required Game Version")}
                          />
                        </div>
                      )}
                      {missingPacks.length > 0 && missingPacks.map((p: string) => {
                        const dlcName = mapDlcCode(p);
                        return (
                          <div key={p} className="relative flex items-center gap-2.5 shrink-0 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] py-2.5 px-3 min-h-[46px] rounded-xl">
                            <div className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--danger)_32%,transparent)] flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined !text-[14px] text-[var(--danger)]">{t("icon_currency_exchange", "currency_exchange")}</span>
                            </div>
                            <div className="flex flex-col justify-center min-w-0 flex-1 gap-0.5">
                              <span className="text-[8.5px] font-black text-[var(--danger)] uppercase tracking-wider leading-none">{t("missing_dlc", "Missing DLC")}</span>
                              <span className="text-[11px] font-black text-[var(--text)] tracking-tight leading-tight truncate">{dlcName}</span>
                            </div>
                            <HoverTooltip
                              onlyWhenTruncated
                              variant="danger"
                              icon={t("icon_currency_exchange", "currency_exchange")}
                              title={dlcName}
                              subtitle={t("missing_dlc", "Missing DLC")}
                            />
                          </div>
                        );
                      })}
                      {hasMissingDeps && missingDeps.map((req: any) => {
                        const reqIdStr = String(typeof req === 'string' ? req : (req.id || req.name || ''));
                        const depLabel = cleanSearchName(reqIdStr, activeGameSchema);
                        return (
                          <div key={reqIdStr}
                            onClick={(e) => { if (onInspectItem) { e.stopPropagation(); onInspectItem(req); } }}
                            className={`relative flex items-center gap-2.5 shrink-0 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] py-2.5 px-3 min-h-[46px] rounded-xl transition-colors ${onInspectItem ? 'cursor-pointer hover:border-[color-mix(in_srgb,var(--danger)_42%,transparent)] group/inspect' : ''}`}>
                            <div className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--danger)_32%,transparent)] flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined !text-[14px] text-[var(--danger)]">{t("icon_extension", "extension")}</span>
                            </div>
                            <div className="flex flex-col justify-center min-w-0 flex-1 gap-0.5">
                              <span className="text-[8.5px] font-black text-[var(--danger)] uppercase tracking-wider leading-none">{t("badge_missing_dep", "Missing Dependency")}</span>
                              <span className="text-[11px] font-black text-[var(--text)] tracking-tight leading-tight truncate">{depLabel}</span>
                            </div>
                            {onInspectItem && (
                              <span className="material-symbols-outlined !text-[15px] text-[var(--subtext)] group-hover/inspect:text-[var(--text)] transition-colors shrink-0">{t("icon_open_in_new", "open_in_new")}</span>
                            )}
                            <HoverTooltip
                              onlyWhenTruncated
                              variant="danger"
                              icon={t("icon_extension", "extension")}
                              title={depLabel}
                              subtitle={t("badge_missing_dep", "Missing Dependency")}
                            />
                          </div>
                        );
                      })}
                      {!isGameVersionMismatch && missingPacks.length === 0 && !hasMissingDeps && (
                        rawDLC.length > 0 ? rawDLC.map((p: string) => {
                          const dlcName = mapDlcCode(p);
                          return (
                            <div key={p} className="relative flex items-center gap-2.5 shrink-0 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] py-2.5 px-3 min-h-[46px] rounded-xl">
                              <div className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--danger)_32%,transparent)] flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined !text-[14px] text-[var(--danger)]">{t("icon_currency_exchange", "currency_exchange")}</span>
                              </div>
                              <div className="flex flex-col justify-center min-w-0 flex-1 gap-0.5">
                                <span className="text-[8.5px] font-black text-[var(--danger)] uppercase tracking-wider leading-none">{t("missing_dlc", "Missing DLC")}</span>
                                <span className="text-[11px] font-black text-[var(--text)] tracking-tight leading-tight truncate">{dlcName}</span>
                              </div>
                              <HoverTooltip
                                onlyWhenTruncated
                                variant="danger"
                                icon={t("icon_currency_exchange", "currency_exchange")}
                                title={dlcName}
                                subtitle={t("missing_dlc", "Missing DLC")}
                              />
                            </div>
                          );
                        }) : (
                          <div className="relative flex items-center gap-2.5 shrink-0 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] py-2.5 px-3 min-h-[46px] rounded-xl">
                            <div className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--danger)_32%,transparent)] flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined !text-[14px] text-[var(--danger)]">{t("icon_sports_esports", "sports_esports")}</span>
                            </div>
                            <div className="flex flex-col justify-center min-w-0 flex-1 gap-0.5">
                              <span className="text-[8.5px] font-black text-[var(--danger)] uppercase tracking-wider leading-none">{t("required_version", "Required Game Version")}</span>
                              <span className="text-[11px] font-black text-[var(--text)] tracking-tight leading-tight truncate">{getHighestVersion(requiredVersions || [])}</span>
                            </div>
                          </div>
                        )
                      )}
                    </>
                  ) : (delayedConfirmMode === 'casualty' || delayedConfirmMode === 'flavor_swap') ? (
                    casualtyList.map((c: any, i: number) => {
                      const itemTitle = formatDisplayName(c.name || c);
                      const itemOverline = delayedConfirmMode === 'flavor_swap' ? t("flavor_replaced", "Will Replace") : t("artifact_removed", "Will {Remove}");
                      const itemIcon = delayedConfirmMode === 'flavor_swap' ? t("icon_swap_horiz", "swap_horiz") : (!isInActiveSet ? t("icon_crisis_alert", "crisis_alert") : t("icon_delete", "delete"));
                      return (
                        <div key={i}
                          onClick={(e) => { if (onInspectItem) { e.stopPropagation(); onInspectItem(c); } }}
                          className={`relative flex items-center gap-2.5 shrink-0 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] py-2.5 px-3 min-h-[46px] rounded-xl transition-colors ${onInspectItem ? `cursor-pointer group/inspect ${delayedConfirmMode === 'flavor_swap' ? 'hover:border-[color-mix(in_srgb,var(--accent)_42%,transparent)]' : 'hover:border-[color-mix(in_srgb,var(--danger)_42%,transparent)]'}` : ''}`}>
                          <div className={`w-7 h-7 rounded-lg glass-surface border flex items-center justify-center shrink-0 ${delayedConfirmMode === 'flavor_swap' ? 'border-[color-mix(in_srgb,var(--accent)_32%,transparent)]' : 'border-[color-mix(in_srgb,var(--danger)_32%,transparent)]'}`}>
                            <span className={`material-symbols-outlined !text-[14px] ${delayedConfirmMode === 'flavor_swap' ? 'text-[var(--accent)]' : 'text-[var(--danger)]'}`}>{itemIcon}</span>
                          </div>
                          <div className="flex flex-col justify-center min-w-0 flex-1 gap-0.5">
                            <span className={`text-[8.5px] font-black uppercase tracking-wider leading-none ${delayedConfirmMode === 'flavor_swap' ? 'text-[var(--accent)]' : 'text-[var(--danger)]'}`}>{itemOverline}</span>
                            <span className="text-[11px] font-black text-[var(--text)] tracking-tight leading-tight truncate">{itemTitle}</span>
                          </div>
                          {onInspectItem && (
                            <span className="material-symbols-outlined !text-[15px] text-[var(--subtext)] group-hover/inspect:text-[var(--text)] transition-colors shrink-0">{t("icon_open_in_new", "open_in_new")}</span>
                          )}
                          <HoverTooltip
                            onlyWhenTruncated
                            variant={delayedConfirmMode === 'flavor_swap' ? 'accent' : 'danger'}
                            icon={itemIcon}
                            title={itemTitle}
                            subtitle={itemOverline}
                          />
                        </div>
                      );
                    })
                  ) : delayedConfirmMode === 'broken' ? (
                    brokenMods.map((b: any, i: number) => {
                      const brokenTitle = formatDisplayName(b.displayName || b.name);
                      return (
                        <div key={i}
                          onClick={(e) => { if (onInspectItem) { e.stopPropagation(); onInspectItem(b); } }}
                          className={`relative flex items-center gap-2.5 shrink-0 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] py-2.5 px-3 min-h-[46px] rounded-xl transition-colors ${onInspectItem ? 'cursor-pointer hover:border-[color-mix(in_srgb,var(--danger)_42%,transparent)] group/inspect' : ''}`}>
                          <div className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--danger)_32%,transparent)] flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined !text-[14px] text-[var(--danger)]">{t("icon_broken_image", "broken_image")}</span>
                          </div>
                          <div className="flex flex-col justify-center min-w-0 flex-1 gap-0.5">
                            <span className="text-[8.5px] font-black text-[var(--danger)] uppercase tracking-wider leading-none">{t("status_corrupted", "Corrupted")}</span>
                            <span className="text-[11px] font-black text-[var(--text)] tracking-tight leading-tight truncate">{brokenTitle}</span>
                          </div>
                          {onInspectItem && (
                            <span className="material-symbols-outlined !text-[15px] text-[var(--subtext)] group-hover/inspect:text-[var(--text)] transition-colors shrink-0">{t("icon_open_in_new", "open_in_new")}</span>
                          )}
                          <HoverTooltip
                            onlyWhenTruncated
                            variant="danger"
                            icon={t("icon_broken_image", "broken_image")}
                            title={brokenTitle}
                            subtitle={t("status_corrupted", "Corrupted")}
                          />
                        </div>
                      );
                    })
                  ) : delayedConfirmMode === 'tier3' ? (
                    <div className="flex flex-col relative gap-2">
                      <div className="text-[9px] font-black uppercase tracking-wider text-[var(--subtext)] mb-0.5 px-1">{t("select_winner", "Select Winner")}</div>
                      <div className="relative flex flex-col gap-4">
                        <button type="button" onClick={(e) => { e.stopPropagation(); setConfirmMode(null); setTimeout(() => { if (onResolveConflict) { onResolveConflict(e, tier3List, mod, mod.name); } }, 10); }} className="relative flex items-center justify-start gap-2.5 shrink-0 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--warning)_45%,transparent)] transition-all duration-300 py-2.5 px-3 min-h-[46px] rounded-xl w-full text-left group/btn cursor-pointer">
                          <div className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--warning)_32%,transparent)] flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined !text-[14px] text-[var(--warning)]">{t("icon_tune", "tune")}</span>
                          </div>
                          <div className="flex flex-col justify-center min-w-0 flex-1 gap-0.5">
                            <span className="text-[8.5px] font-black text-[var(--warning)] uppercase tracking-wider leading-none">{t("enemy_a", "{Mod} A")}</span>
                            <span className="text-[11px] font-black text-[var(--text)] tracking-tight leading-tight truncate">{formatDisplayName(mod.displayName || mod.name)}</span>
                          </div>
                          <span className="material-symbols-outlined !text-[16px] text-[var(--subtext)] group-hover/btn:text-[var(--warning)] transition-colors shrink-0">{t("icon_check_circle", "check_circle")}</span>
                          <HoverTooltip
                            onlyWhenTruncated
                            variant="warning"
                            icon={t("icon_tune", "tune")}
                            title={formatDisplayName(mod.displayName || mod.name)}
                            subtitle={t("enemy_a", "{Mod} A")}
                          />
                        </button>
                        <div className="relative h-px w-full flex items-center justify-center z-20">
                          <div className="px-2 py-0.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center absolute text-[var(--subtext)]">
                            <span className="text-[8px] font-black uppercase tracking-wider">{t("vs", "VS")}</span>
                          </div>
                          <div className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent" />
                        </div>
                        <button type="button" onClick={(e) => { e.stopPropagation(); setConfirmMode(null); setTimeout(() => { if (onResolveConflict) { onResolveConflict(e, tier3List, mod, tier3List[0]?.rawName || tier3List[0]?.name); } }, 10); }} className="relative flex items-center justify-start gap-2.5 shrink-0 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--warning)_45%,transparent)] transition-all duration-300 py-2.5 px-3 min-h-[46px] rounded-xl w-full text-left group/btn cursor-pointer">
                          <div className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--warning)_32%,transparent)] flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined !text-[14px] text-[var(--warning)]">{t("icon_tune", "tune")}</span>
                          </div>
                          <div className="flex flex-col justify-center min-w-0 flex-1 gap-0.5">
                            <span className="text-[8.5px] font-black text-[var(--warning)] uppercase tracking-wider leading-none">{t("enemy_b", "{Mod} B")}</span>
                            <span className="text-[11px] font-black text-[var(--text)] tracking-tight leading-tight truncate">{formatDisplayName(tier3List[0]?.name || tier3List[0] || "")}</span>
                          </div>
                          <span className="material-symbols-outlined !text-[16px] text-[var(--subtext)] group-hover/btn:text-[var(--warning)] transition-colors shrink-0">{t("icon_check_circle", "check_circle")}</span>
                          <HoverTooltip
                            onlyWhenTruncated
                            variant="warning"
                            icon={t("icon_tune", "tune")}
                            title={formatDisplayName(tier3List[0]?.name || tier3List[0] || "")}
                            subtitle={t("enemy_b", "{Mod} B")}
                          />
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Footer Actions */}
                <div className="w-full z-20 px-3.5 pb-3 pt-2 flex flex-row gap-2 shrink-0 isolate">
                  <div className="absolute top-0 left-3.5 right-3.5 h-px bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent pointer-events-none" />
                  {delayedConfirmMode === 'tier3' ? (
                  <>
                    <button type="button" onClick={(e) => { e.stopPropagation(); onToggleSet(e, false); setConfirmMode(null); }} className="flex-1 glass-surface min-w-0 py-2 rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--warning)_45%,transparent)] text-[var(--warning)] font-black text-[9.5px] uppercase tracking-wider transition-all px-2.5 min-h-[34px] flex items-center justify-center gap-1.5 leading-tight whitespace-normal text-center break-words cursor-pointer">
                      <span className="material-symbols-outlined !text-[13px] shrink-0">{t("icon_warning", "warning")}</span>
                      <span>{t("btn_ignore_conflict", "Ignore Conflict")}</span>
                    </button>
                  </>
                ) : delayedConfirmMode === 'broken' || delayedConfirmMode === 'dlc' ? (
                  <>
                    <button type="button" onClick={(e) => { e.stopPropagation(); onToggleSet(e, true); setConfirmMode(null); }} className="flex-1 glass-surface min-w-0 py-2 rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--danger)] font-black text-[9.5px] uppercase tracking-wider transition-all px-2.5 min-h-[34px] flex items-center justify-center gap-1.5 leading-tight whitespace-normal text-center break-words cursor-pointer">
                      <span className="material-symbols-outlined !text-[13px] shrink-0">{t("icon_warning", "warning")}</span>
                      <span>{t("btn_equip_anyway", "Proceed Anyway")}</span>
                    </button>
                    {mod.isParent && delayedConfirmMode === 'broken' && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); onToggleSet(e, true); setConfirmMode(null); }} className="flex-1 glass-surface min-w-0 py-2 rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_28%,transparent)] text-[var(--text)] font-black text-[9.5px] uppercase tracking-wider transition-all px-2.5 min-h-[34px] flex items-center justify-center gap-1.5 leading-tight whitespace-normal text-center break-words cursor-pointer">
                        <span>{t("btn_add_not_broken", "Add Not Corrupted")}</span>
                      </button>
                    )}
                  </>
                ) : (
                  <button type="button" onClick={(e) => { e.stopPropagation(); onToggleSet(e, true); setConfirmMode(null); }} className={`flex-1 glass-surface min-w-0 py-2 rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] font-black text-[9.5px] uppercase tracking-wider px-2.5 min-h-[34px] flex items-center justify-center gap-1.5 leading-tight whitespace-normal text-center break-words transition-all cursor-pointer ${delayedConfirmMode === 'flavor_swap' ? 'text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)]' : 'text-[var(--danger)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)]'}`}>
                    <span className="material-symbols-outlined !text-[13px] shrink-0">{delayedConfirmMode === 'flavor_swap' ? t("icon_swap_horiz", "swap_horiz") : t("icon_delete", "delete")}</span>
                    <span>{delayedConfirmMode === 'flavor_swap' ? t("btn_swap_confirm", "Swap Files") : t("btn_purge_confirm", "{Remove} {Mods}")}</span>
                  </button>
                )}
                <button type="button" onClick={(e) => { e.stopPropagation(); setConfirmMode(null); }} className="flex-1 glass-surface min-w-0 py-2 rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--text)] hover:text-[var(--success)] font-black text-[9.5px] uppercase tracking-wider transition-all px-2.5 min-h-[34px] flex items-center justify-center gap-1.5 leading-tight whitespace-normal text-center break-words cursor-pointer">
                  <span className="material-symbols-outlined !text-[13px] shrink-0 text-[var(--success)]">{t("icon_shield", "shield")}</span>
                  <span>{t("btn_safety", "Back to Safety")}</span>
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

