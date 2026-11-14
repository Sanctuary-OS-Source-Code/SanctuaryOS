import React, { useMemo, useState } from "react";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import {
  SidePanel,
  PanelHeaderGroup,
  PanelHeaderButton,
  ActionButton,
  cleanSearchName,
  getModFallbackUrl,
  getModIcon,
  formatDisplayName,
  HoverTooltip,
  EmptyState,
  ActionPill,
  getHighestVersion,
  SidePanelHeroCard,
  StatBox,
  UniversalGroup,
  VAULT_CHIP_CLASS,
  isScriptExtension,
  openModDossier,
} from "../shared";
import {
  normalizeModGroupTitle,
  extractValidCreator,
  isKnownCreatorName,
  getCachedVaultGroupLookups,
  formatAddonModuleName,
  formatCleanModTitle,
} from "./CommandIncompatiblePanel";

export function groupUpdateMods(rawList: any[]): any[] {
  if (!Array.isArray(rawList) || rawList.length === 0) return [];

  const flatList: any[] = [];
  for (const entry of rawList) {
    if (!entry) continue;
    if (Array.isArray(entry._groupedMods) && entry._groupedMods.length > 0) {
      flatList.push(...entry._groupedMods);
    } else {
      flatList.push(entry);
    }
  }
  if (flatList.length === 0) return [];

  const allVaultMods: any[] = useStore.getState().modList || [];
  const {
    vaultByHash,
    vaultUpdateLookup,
    virtualByFamilyId,
    collectionBySetId,
    parentByDbId,
    vaultFamilyCounts,
    vaultSetCounts,
  } = getCachedVaultGroupLookups(allVaultMods);

  const listFamilyCounts = new Map<string, number>();
  const listSetCounts = new Map<string, number>();

  const enrichedItems = flatList.map((rawItem) => {
    const matchedVault =
      (rawItem?.hash ? vaultByHash.get(String(rawItem.hash).toLowerCase()) : undefined) ||
      vaultUpdateLookup.get(String(rawItem?.name || "").toLowerCase()) ||
      vaultUpdateLookup.get(String(rawItem?.displayName || "").toLowerCase());

    const famIdRaw = String(
      matchedVault?.baseFamilyId ||
        matchedVault?.familyId ||
        rawItem?.baseFamilyId ||
        rawItem?.familyId ||
        ""
    ).split("@")[0];
    if (
      famIdRaw &&
      famIdRaw !== "null" &&
      famIdRaw !== "undefined" &&
      !famIdRaw.startsWith("local_")
    ) {
      listFamilyCounts.set(famIdRaw, (listFamilyCounts.get(famIdRaw) || 0) + 1);
    }

    const setIdRaw = String(rawItem?.setId || matchedVault?.setId || "").trim();
    if (setIdRaw && setIdRaw !== "null" && setIdRaw !== "undefined") {
      listSetCounts.set(setIdRaw, (listSetCounts.get(setIdRaw) || 0) + 1);
    }

    return { rawItem, matchedVault, famIdRaw, setIdRaw };
  });

  const grouped = new Map<string, any>();

  for (const { rawItem, matchedVault, famIdRaw, setIdRaw } of enrichedItems) {
    const hasRealFamily = Boolean(
      famIdRaw &&
        famIdRaw !== "null" &&
        famIdRaw !== "undefined" &&
        !famIdRaw.startsWith("local_") &&
        (virtualByFamilyId.has(famIdRaw) ||
          (vaultFamilyCounts.get(famIdRaw) || 0) > 1 ||
          (listFamilyCounts.get(famIdRaw) || 0) > 1)
    );
    const familyParent = hasRealFamily
      ? virtualByFamilyId.get(famIdRaw) || parentByDbId.get(famIdRaw)
      : null;

    const hasCollectionFolder = Boolean(
      setIdRaw &&
        setIdRaw !== "null" &&
        setIdRaw !== "undefined" &&
        (collectionBySetId.has(setIdRaw) ||
          (vaultSetCounts.get(setIdRaw) || 0) > 1 ||
          (listSetCounts.get(setIdRaw) || 0) > 1)
    );
    const collectionFolder = hasCollectionFolder ? collectionBySetId.get(setIdRaw) : null;

    const resolvedAuthor = extractValidCreator(
      rawItem,
      matchedVault,
      familyParent,
      collectionFolder
    );

    const item = {
      ...(familyParent && !familyParent.isVirtual ? familyParent : {}),
      ...(matchedVault || {}),
      ...rawItem,
      setId: setIdRaw || matchedVault?.setId || rawItem?.setId,
      familyId: matchedVault?.familyId || rawItem?.familyId,
      baseFamilyId: matchedVault?.baseFamilyId || rawItem?.baseFamilyId,
      download_url:
        rawItem.download_url ||
        matchedVault?.download_url ||
        familyParent?.download_url ||
        collectionFolder?.url,
      url:
        rawItem.url ||
        matchedVault?.url ||
        familyParent?.url ||
        collectionFolder?.url,
      image_url:
        rawItem.image_url ||
        rawItem.imageUrl ||
        matchedVault?.image_url ||
        familyParent?.image_url ||
        collectionFolder?.image_url,
      author: resolvedAuthor || rawItem?.author,
    };

    const rawTitle = formatDisplayName(item?.displayName || item?.name || "").trim();
    const twinNormalized = normalizeModGroupTitle(rawTitle) || rawTitle;

    let groupKey: string;
    let displayTitle = twinNormalized;
    let isCollectionGroup = false;

    if (hasRealFamily) {
      groupKey = `__family_${famIdRaw}__`;
      const canonicalParentTitle = familyParent
        ? formatDisplayName(familyParent.displayName || familyParent.name || "").trim()
        : "";
      displayTitle =
        normalizeModGroupTitle(canonicalParentTitle) ||
        canonicalParentTitle ||
        twinNormalized;
    } else if (hasCollectionFolder) {
      groupKey = `__set_${setIdRaw}__`;
      isCollectionGroup = true;
      const colTitle = collectionFolder
        ? formatDisplayName(collectionFolder.displayName || collectionFolder.name || "").trim()
        : "";
      displayTitle = colTitle || twinNormalized;
    } else if (item.communityGroupId) {
      groupKey = `__comm_${item.communityGroupId}__`;
      displayTitle = formatDisplayName(item.communityGroupName || twinNormalized).trim();
    } else {
      groupKey = twinNormalized.toLowerCase();
      displayTitle = twinNormalized;
    }

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        ...item,
        _isCollectionGroup: isCollectionGroup,
        _groupedTitle: displayTitle,
        _moduleCount: 1,
        _groupedMods: [item],
      });
    } else {
      const existing = grouped.get(groupKey);
      existing._moduleCount = (existing._moduleCount || 1) + 1;
      existing._groupedMods.push(item);
      if (isCollectionGroup) existing._isCollectionGroup = true;
      if (hasRealFamily && String(item.dbId) === famIdRaw) {
        existing._groupedTitle = twinNormalized;
      }
      if (!existing.download_url && item.download_url) existing.download_url = item.download_url;
      if (!existing.url && item.url) existing.url = item.url;
      if (!isKnownCreatorName(existing.author) && isKnownCreatorName(item.author)) {
        existing.author = item.author;
      }
      if (!existing.newVersion && item.newVersion) existing.newVersion = item.newVersion;
      if (
        (!existing.version ||
          String(existing.version).toLowerCase() === "v.local" ||
          String(existing.version).toLowerCase() === "vlocal") &&
        item.version &&
        String(item.version).toLowerCase() !== "v.local" &&
        String(item.version).toLowerCase() !== "vlocal"
      ) {
        existing.version = item.version;
      }
    }
  }

  // Second pass: merge prefix-based Addons/Modules and equal-normalized-title twins into their parent mod card
  const entries = Array.from(grouped.values());
  const mergedOut = new Set<number>();

  for (let i = 0; i < entries.length; i++) {
    if (mergedOut.has(i)) continue;
    const parent = entries[i];
    const pTitle = String(parent._groupedTitle || "").trim();
    if (pTitle.length < 5) continue;
    const pLower = pTitle.toLowerCase();
    const pNorm = normalizeModGroupTitle(pTitle).toLowerCase();

    for (let j = 0; j < entries.length; j++) {
      if (i === j || mergedOut.has(j)) continue;
      const candidate = entries[j];
      const cTitle = String(candidate._groupedTitle || "").trim();
      const cLower = cTitle.toLowerCase();
      const cNorm = normalizeModGroupTitle(cTitle).toLowerCase();

      const isEqualTwin = Boolean(pNorm.length >= 4 && pNorm === cNorm);
      const isPrefixAddon =
        isEqualTwin ||
        (cLower.length > pLower.length &&
          cLower.startsWith(pLower) &&
          /^(\s*[-:–_(\[]|\s+(addon|add-on|module|pack|part|script|scripts)\b)/i.test(
            cTitle.slice(pTitle.length)
          ));

      if (isPrefixAddon) {
        mergedOut.add(j);
        parent._moduleCount = (parent._moduleCount || 1) + (candidate._moduleCount || 1);
        parent._groupedMods.push(...(candidate._groupedMods || [candidate]));
        if (!parent.newVersion && candidate.newVersion) parent.newVersion = candidate.newVersion;
        if (!isKnownCreatorName(parent.author) && isKnownCreatorName(candidate.author)) {
          parent.author = candidate.author;
        }
      }
    }
  }

  return entries.filter((_, idx) => !mergedOut.has(idx));
}

export function UpdateModCard({ update, handleOpenUrl, t, activeGameSchema }: any) {
  const [isExpanded, setIsExpanded] = useState(false);
  const showImages = useStore((state: any) => state.showImages);
  const image =
    showImages &&
    (update.image_url || update.imageUrl) &&
    String(update.image_url || update.imageUrl) !== "null" &&
    String(update.image_url || update.imageUrl).trim() !== ""
      ? update.image_url || update.imageUrl
      : undefined;

  const groupedMods: any[] =
    Array.isArray(update._groupedMods) && update._groupedMods.length > 0
      ? update._groupedMods
      : [update];

  const rawTitle = update._groupedTitle || formatDisplayName(update.displayName || update.name);
  const title = formatCleanModTitle(rawTitle) || rawTitle;
  const resolvedFallbackUrl = getModFallbackUrl(
    title || update.name || "",
    update.hash,
    activeGameSchema,
    { url: update.download_url || update.url }
  );
  const directTargetUrl = update.download_url || update.url || resolvedFallbackUrl;
  const modIcon = getModIcon(update, activeGameSchema, t);

  const hasRealVersion = Boolean(
    update.version &&
      String(update.version).trim() !== "" &&
      String(update.version).toLowerCase() !== "v.local" &&
      String(update.version).toLowerCase() !== "vlocal" &&
      String(update.version).toLowerCase() !== "local" &&
      String(update.version).toLowerCase() !== "unknown"
  );
  const cleanInstalledVer = hasRealVersion
    ? String(update.version).replace(/^v\.?/i, "").trim()
    : null;
  const cleanNewVer = update.newVersion
    ? String(update.newVersion).replace(/^v\.?/i, "").trim()
    : null;

  const validCreator = extractValidCreator(update, ...groupedMods);
  const hasScriptFile = groupedMods.some((gm) =>
    isScriptExtension(String(gm?.name || gm?._originalSetName || ""), activeGameSchema)
  );
  const fallbackTypeLabel = hasScriptFile
    ? t("type_script", "Script")
    : t("type_package", "Module");

  const openUpdateTarget = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const targetUrl =
      directTargetUrl ||
      `https://www.google.com/search?q=${encodeURIComponent(
        useStore.getState().activeGameSchema?.display_name || "Mod"
      )}+${encodeURIComponent(
        cleanSearchName(title || update.name || "", useStore.getState().activeGameSchema)
      )}`;
    handleOpenUrl(targetUrl);
  };

  const highestGameVer =
    Array.isArray(update.compatible_versions) && update.compatible_versions.length > 0
      ? getHighestVersion(update.compatible_versions)
      : update.newGameVersion || null;

  return (
    <div
      onClick={() =>
        openModDossier(
          groupedMods.length > 1
            ? {
                ...update,
                displayName: title || update._groupedTitle || update.displayName || update.name,
                isVirtual: true,
                flavors: groupedMods,
              }
            : update
        )
      }
      className={`glass-panel rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)] flex flex-col justify-between gap-3 transition-all duration-200 cursor-pointer relative ${
        isExpanded && groupedMods.length > 1 ? "sm:col-span-2" : ""
      }`}
    >
      {/* Top Tier: Full-Width Icon Well + Title/Creator Identity */}
      <div className="flex items-center gap-3 min-w-0 w-full">
        {image ? (
          <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
            <img src={image} alt={title} className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[20px]">{modIcon}</span>
          </div>
        )}

        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <div className="relative group/updtitle flex items-center min-w-0 w-fit max-w-full">
            <span className="text-sm font-black text-[var(--text)] tracking-tight leading-snug truncate">
              {title}
            </span>
            <HoverTooltip
              className="z-[100]"
              title={title}
              icon={modIcon}
            />
          </div>

          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--subtext)] min-w-0">
            <span className="truncate opacity-85">
              {validCreator ? formatCleanModTitle(validCreator) : fallbackTypeLabel}
            </span>
            {groupedMods.length > 1 && (
              <>
                <span className="opacity-40 shrink-0">•</span>
                <span className="opacity-85 shrink-0">
                  {groupedMods.length} {t("badge_modules_count", "Modules")}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Telemetry & Action Bar */}
      <div className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`relative group/updchip ${VAULT_CHIP_CLASS} font-mono`}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
              {t("icon_new_releases", "new_releases")}
            </span>
            {cleanInstalledVer && cleanNewVer ? (
              <>
                <span className="text-[var(--subtext)]">v{cleanInstalledVer} &rarr; </span>
                <span>v{cleanNewVer}</span>
              </>
            ) : cleanNewVer ? (
              <span>v{cleanNewVer}</span>
            ) : cleanInstalledVer ? (
              <span>v{cleanInstalledVer}</span>
            ) : (
              <span>{t("btn_update", "Update")}</span>
            )}
            <HoverTooltip
              className="z-[100] !left-0 !translate-x-0"
              title={t("btn_update", "Update")}
              icon={t("icon_new_releases", "new_releases")}
              variant="accent"
              description={
                <div className="flex flex-col gap-0.5 text-left font-mono text-[11px]">
                  {cleanInstalledVer && (
                    <div>
                      <span className="opacity-70">{t("installed", "Installed")}:</span>{" "}
                      <span className="font-bold text-[var(--text)]">v{cleanInstalledVer}</span>
                    </div>
                  )}
                  {cleanNewVer && (
                    <div>
                      <span className="opacity-70">{t("latest", "Latest")}:</span>{" "}
                      <span className="font-bold text-[var(--accent)]">v{cleanNewVer}</span>
                    </div>
                  )}
                  {highestGameVer && highestGameVer !== "Unknown" && (
                    <div>
                      <span className="opacity-70">{t("required", "Required")}:</span>{" "}
                      <span className="font-bold text-[var(--text)]">{highestGameVer}</span>
                    </div>
                  )}
                </div>
              }
            />
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          {groupedMods.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded((prev) => !prev);
              }}
              className={`relative group/actionbtn w-7 h-7 rounded-lg glass-surface border flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                isExpanded
                  ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)]"
                  : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)]"
              }`}
            >
              <span className="material-symbols-outlined !text-[15px]">
                {t("icon_account_tree", "account_tree")}
              </span>
              <HoverTooltip
                className="z-[100] !right-0 !translate-x-0 !left-auto"
                title={`${groupedMods.length} ${t("badge_modules_count", "Modules")}`}
                icon={t("icon_account_tree", "account_tree")}
              />
            </button>
          )}

          <button
            type="button"
            onClick={openUpdateTarget}
            className="relative group/actionbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all shrink-0 cursor-pointer"
          >
            <span className="material-symbols-outlined !text-[15px]">
              {t("icon_open_in_new", "open_in_new")}
            </span>
            <HoverTooltip
              className="z-[100] !right-0 !translate-x-0 !left-auto"
              title={t("btn_update", "Update")}
              icon={t("icon_update", "update")}
              variant="accent"
            />
          </button>
        </div>
      </div>

      {/* Compact Recessed Linked Modules Drawer */}
      {isExpanded && groupedMods.length > 1 && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] animate-in fade-in slide-in-from-top-1 duration-200 cursor-default"
        >
          <div className="max-h-[196px] overflow-y-auto custom-scrollbar pr-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {groupedMods.map((gm: any, gIdx: number) => {
              const gmName =
                formatAddonModuleName(gm, activeGameSchema) ||
                formatDisplayName(gm.displayName || gm.name);
              const isScript = isScriptExtension(
                String(gm?.name || gm?._originalSetName || ""),
                activeGameSchema
              );
              return (
                <div
                  key={`${gm.name || gIdx}-${gIdx}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    openModDossier(gm);
                  }}
                  className="glass-surface rounded-lg px-3 py-2 border border-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_18%,transparent)] flex items-center justify-between gap-2 cursor-pointer transition-all"
                >
                  <div className="relative group/gmtitle flex items-center gap-2 min-w-0 flex-1">
                    <span className="material-symbols-outlined !text-[14px] text-[var(--accent)] shrink-0">
                      {isScript
                        ? t("icon_terminal", "terminal")
                        : t("icon_deployed_code", "deployed_code")}
                    </span>
                    <span className="text-xs font-bold text-[var(--text)] truncate">
                      {gmName}
                    </span>
                    <HoverTooltip
                      className="z-[100]"
                      title={gmName}
                      icon={
                        isScript
                          ? t("icon_terminal", "terminal")
                          : t("icon_deployed_code", "deployed_code")
                      }
                    />
                  </div>
                  <span className="text-[10px] font-semibold text-[var(--subtext)] opacity-70 shrink-0">
                    {isScript
                      ? t("type_script", "Script")
                      : t("type_package", "Module")}
                  </span>
                </div>
              );
            })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function UpdatesSidePanel({
  isOpen,
  onClose,
  activeUpdates,
  handleOpenUrl,
}: any) {
  const { t } = useLexicon();
  const activeGameSchema = useStore((state: any) => state.activeGameSchema);
  const [searchQuery, setSearchQuery] = useState("");

  const groupedUpdates = useMemo(() => groupUpdateMods(activeUpdates || []), [activeUpdates]);

  const filteredUpdates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return groupedUpdates;
    return groupedUpdates.filter((u: any) => {
      const title = String(u._groupedTitle || u.displayName || u.name || "").toLowerCase();
      const author = String(u.author || "").toLowerCase();
      return title.includes(q) || author.includes(q);
    });
  }, [groupedUpdates, searchQuery]);

  const handleStartGuidedUpdateQueue = () => {
    const guidedItems: {
      id: string;
      name: string;
      author?: string;
      url: string;
      hash?: string;
      installedVersion?: string;
      version?: string;
      icon?: string;
      moduleCount?: number;
      status: "pending" | "completed" | "skipped";
    }[] = [];

    filteredUpdates.forEach((u: any, idx: number) => {
      const groupedMods: any[] =
        Array.isArray(u._groupedMods) && u._groupedMods.length > 0
          ? u._groupedMods
          : [u];
      const rawTitle = u._groupedTitle || formatDisplayName(u.displayName || u.name || "");
      const title = formatCleanModTitle(rawTitle) || rawTitle || "Unknown Artifact";
      const validCreator = extractValidCreator(u, ...groupedMods);
      const modIcon = getModIcon(u, activeGameSchema, t);

      const hasRealVersion = Boolean(
        u.version &&
          String(u.version).trim() !== "" &&
          String(u.version).toLowerCase() !== "v.local" &&
          String(u.version).toLowerCase() !== "vlocal" &&
          String(u.version).toLowerCase() !== "local" &&
          String(u.version).toLowerCase() !== "unknown"
      );
      const cleanInstalledVer = hasRealVersion
        ? String(u.version).replace(/^v\.?/i, "").trim()
        : undefined;
      const cleanNewVer = u.newVersion
        ? String(u.newVersion).replace(/^v\.?/i, "").trim()
        : undefined;

      const resolvedFallbackUrl = getModFallbackUrl(
        title || u.name || "",
        u.hash,
        activeGameSchema,
        { url: u.download_url || u.url }
      );
      const directTargetUrl = u.download_url || u.url || resolvedFallbackUrl;
      const targetUrl =
        directTargetUrl ||
        `https://www.google.com/search?q=${encodeURIComponent(
          activeGameSchema?.display_name || "Mod"
        )}+${encodeURIComponent(
          cleanSearchName(title || u.name || "", activeGameSchema)
        )}`;

      if (targetUrl) {
        guidedItems.push({
          id: String(u.hash || u.dbId || `${title}_${idx}`),
          name: title,
          author: validCreator ? formatCleanModTitle(validCreator) : undefined,
          url: targetUrl,
          hash: u.hash || undefined,
          installedVersion: cleanInstalledVer,
          version: cleanNewVer || cleanInstalledVer || undefined,
          icon: modIcon,
          moduleCount: groupedMods.length > 1 ? groupedMods.length : undefined,
          status: "pending",
        });
      }
    });

    if (guidedItems.length === 0) return;
    const mStore = useModalStore.getState();
    mStore.startGuidedBrowserQueue(guidedItems);
    mStore.setIsSideBrowserOpen(true);
    onClose?.();
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("updates_modal_title", "Updates")}
      subtitle={t("updates_summary_desc", "New versions are available for the following {mods} in your active profile.")}
      icon={t("icon_update", "update")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[760px]"
      headerActions={
        filteredUpdates.length > 0 ? (
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_playlist_play", "playlist_play")}
              tooltip={t(
                "guided_queue_start_btn",
                "Guided Batch Update ({0})"
              ).replace("{0}", String(filteredUpdates.length))}
              variant="accent"
              onClick={handleStartGuidedUpdateQueue}
            />
          </PanelHeaderGroup>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_update", "update")}
          overline={t("updates_modal_title", "Updates")}
          title={t("updates_summary_desc", "New versions are available for the following {mods} in your active profile.")}
          description={
            groupedUpdates.length > 0
              ? t("updates_det", "{Mod} Updates Detected")
              : t("no_updates", "All Mods Up to Date")
          }
          badge={`${groupedUpdates.length} ${t("term_mods", "Items")}`}
          badgeIcon={t("icon_update", "update")}
          variant={groupedUpdates.length > 0 ? "accent" : "success"}
        >
          <div className="flex flex-col gap-3 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <StatBox
                label={t("updates_avail", "Updates Available")}
                value={groupedUpdates.length}
                icon={t("icon_update", "update")}
                iconColorClass="text-[var(--accent)]"
              />
              <StatBox
                label={t("card_files_linked", "Linked Files")}
                value={(activeUpdates || []).length}
                icon={t("icon_inventory_2", "inventory_2")}
                iconColorClass="text-[var(--accent)]"
              />
            </div>
            {filteredUpdates.length > 0 && (
              <div className="flex flex-wrap items-center justify-end gap-2 ml-auto w-full pt-1">
                <ActionButton
                  variant="accent"
                  icon={t("icon_playlist_play", "playlist_play")}
                  label={t(
                    "guided_queue_start_btn",
                    "Guided Batch Update ({0})"
                  ).replace("{0}", String(filteredUpdates.length))}
                  onClick={handleStartGuidedUpdateQueue}
                />
              </div>
            )}
          </div>
        </SidePanelHeroCard>

        {groupedUpdates.length > 0 && (
          <ActionPill
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchPlaceholder={t("nav_search", "Search...")}
          />
        )}

        {filteredUpdates.length > 0 ? (
          <UniversalGroup
            title={`${t("updates_avail", "Updates Available")} (${filteredUpdates.length})`}
            icon={t("icon_update", "update")}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
              {filteredUpdates.map((update: any) => (
                <UpdateModCard
                  key={update._groupedTitle || update.hash || update.name}
                  update={update}
                  handleOpenUrl={handleOpenUrl}
                  t={t}
                  activeGameSchema={activeGameSchema}
                />
              ))}
            </div>
          </UniversalGroup>
        ) : (
          <EmptyState
            icon={t("icon_check_circle", "check_circle")}
            title={t("no_updates", "All Mods Up to Date")}
          />
        )}
      </div>
    </SidePanel>
  );
}
