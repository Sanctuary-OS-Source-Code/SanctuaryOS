import React, { useMemo, useState } from "react";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import {
  SidePanel,
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
} from "../shared";
import {
  normalizeModGroupTitle,
  extractValidCreator,
  formatAddonModuleName,
  formatCleanModTitle,
} from "./CommandIncompatiblePanel";

export function groupUpdateMods(rawList: any[]): any[] {
  if (!Array.isArray(rawList) || rawList.length === 0) return [];

  const allVaultMods: any[] = useStore.getState().modList || [];
  const virtualByFamilyId = new Map<string, any>();
  const parentByDbId = new Map<string, any>();

  for (const vm of allVaultMods) {
    if (!vm) continue;
    if (vm.isVirtual && !vm.isCollection) {
      if (vm.dbId) virtualByFamilyId.set(String(vm.dbId).split("@")[0], vm);
      if (vm.baseFamilyId) virtualByFamilyId.set(String(vm.baseFamilyId).split("@")[0], vm);
      continue;
    }
    if (vm.dbId) {
      parentByDbId.set(String(vm.dbId), vm);
    }
  }

  const mcCount = rawList.filter((u) => {
    const label = formatDisplayName(u?.displayName || u?.name || "").trim();
    return /^mc[\s_-]/i.test(label) || /mc\s*command\s*center/i.test(label);
  }).length;

  const grouped = new Map<string, any>();

  for (const item of rawList) {
    const famIdRaw = String(item?.baseFamilyId || item?.familyId || "").split("@")[0];
    const hasRealFamily = Boolean(
      famIdRaw &&
        famIdRaw !== "null" &&
        famIdRaw !== "undefined" &&
        !famIdRaw.startsWith("local_")
    );
    const familyParent = hasRealFamily
      ? parentByDbId.get(famIdRaw) || virtualByFamilyId.get(famIdRaw)
      : null;

    const rawTitle = formatDisplayName(item?.displayName || item?.name || "").trim();
    const isMc =
      mcCount > 1 && (/^mc[\s_-]/i.test(rawTitle) || /mc\s*command\s*center/i.test(rawTitle));
    const twinNormalized = normalizeModGroupTitle(rawTitle) || rawTitle;

    let groupKey: string;
    let displayTitle = twinNormalized;

    if (isMc) {
      groupKey = "__suite_mc_command_center__";
      displayTitle = "MC Command Center";
    } else if (hasRealFamily) {
      groupKey = `__family_${famIdRaw}__`;
      const canonicalParentTitle = familyParent
        ? formatDisplayName(familyParent.displayName || familyParent.name || "").trim()
        : "";
      displayTitle =
        normalizeModGroupTitle(canonicalParentTitle) ||
        canonicalParentTitle ||
        twinNormalized;
    } else if (item.flavorGroupId) {
      groupKey = `__flavor_${item.flavorGroupId}__`;
      displayTitle = formatDisplayName(item.flavorGroupName || twinNormalized).trim();
    } else {
      groupKey = twinNormalized.toLowerCase();
      displayTitle = twinNormalized;
    }

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        ...item,
        _groupedTitle: displayTitle,
        _moduleCount: 1,
        _groupedMods: [item],
      });
    } else {
      const existing = grouped.get(groupKey);
      existing._moduleCount = (existing._moduleCount || 1) + 1;
      existing._groupedMods.push(item);
      if (hasRealFamily && String(item.dbId) === famIdRaw) {
        existing._groupedTitle = twinNormalized;
      }
      if (!existing.download_url && item.download_url) existing.download_url = item.download_url;
      if (!existing.url && item.url) existing.url = item.url;
      if ((!existing.author || existing.author === "Unknown") && item.author) {
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

  // Second pass: merge prefix-based Addons/Modules into their parent mod card if present
  const entries = Array.from(grouped.values());
  const mergedOut = new Set<number>();

  for (let i = 0; i < entries.length; i++) {
    if (mergedOut.has(i)) continue;
    const parent = entries[i];
    const pTitle = String(parent._groupedTitle || "").trim();
    if (pTitle.length < 5) continue;
    const pLower = pTitle.toLowerCase();

    for (let j = 0; j < entries.length; j++) {
      if (i === j || mergedOut.has(j)) continue;
      const candidate = entries[j];
      const cTitle = String(candidate._groupedTitle || "").trim();
      const cLower = cTitle.toLowerCase();

      const isPrefixAddon =
        cLower.length > pLower.length &&
        cLower.startsWith(pLower) &&
        /^(\s*[-:–_(\[]|\s+(addon|add-on|module|pack|part|script|scripts)\b)/i.test(
          cTitle.slice(pTitle.length)
        );

      if (isPrefixAddon) {
        mergedOut.add(j);
        parent._moduleCount = (parent._moduleCount || 1) + (candidate._moduleCount || 1);
        parent._groupedMods.push(...(candidate._groupedMods || [candidate]));
        if (!parent.newVersion && candidate.newVersion) parent.newVersion = candidate.newVersion;
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
    /\.ts4script$/i.test(String(gm?.name || gm?._originalSetName || ""))
  );
  const fallbackTypeLabel = hasScriptFile
    ? t("type_script", "Script")
    : t("type_package", "Package");

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
      onClick={openUpdateTarget}
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
            {validCreator && (
              <>
                <span className="truncate opacity-85">
                  {formatCleanModTitle(validCreator)}
                </span>
                <span className="opacity-40 shrink-0">•</span>
              </>
            )}
            <span className="opacity-85 shrink-0">{fallbackTypeLabel}</span>
            {groupedMods.length > 1 && (
              <>
                <span className="opacity-40 shrink-0">•</span>
                <span className="opacity-85 shrink-0">
                  {groupedMods.length} {t("badge_modules_count", "Modules")}
                </span>
              </>
            )}
            {highestGameVer && highestGameVer !== "Unknown" && (
              <>
                <span className="opacity-40 shrink-0">•</span>
                <span className="relative group/gamever font-mono text-[10px] font-semibold text-[var(--subtext)] opacity-80 truncate">
                  {highestGameVer}
                  <HoverTooltip
                    className="z-[100]"
                    title={`${t("required_version", "Required Game Version")}: ${highestGameVer}`}
                    icon={t("icon_sports_esports", "sports_esports")}
                  />
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Telemetry & Action Bar */}
      <div className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`${VAULT_CHIP_CLASS} font-mono`}>
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
              <span>{t("category_update", "Update")}</span>
            )}
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
              title={t("category_update", "Update")}
              icon={t("icon_update", "update")}
              variant="accent"
            />
          </button>
        </div>
      </div>

      {/* Compact Recessed Linked Modules Tray */}
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
              const isScript = /\.ts4script$/i.test(
                String(gm?.name || gm?._originalSetName || "")
              );
              return (
                <div
                  key={`${gm.name || gIdx}-${gIdx}`}
                  className="glass-surface rounded-lg px-3 py-2 border border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2"
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
                      : t("type_package", "Package")}
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

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("updates_modal_title", "Updates")}
      subtitle={t("updates_summary_desc", "New versions are available for the following {mods} in your active profile.")}
      icon={t("icon_update", "update")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[760px]"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
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
