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

  const title = update._groupedTitle || formatDisplayName(update.displayName || update.name);
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
      className="glass-surface rounded-xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 transition-all duration-300 cursor-pointer group hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)]"
    >
      {/* Top Row: Boxed Mod Icon + Title & Subtitle on Left | Version Badge + Update Button on Right */}
      <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {image ? (
            <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
              <img src={image} alt={title} className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined !text-[20px]">{modIcon}</span>
            </div>
          )}

          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <span
              className="text-sm font-black text-[var(--text)] tracking-tight leading-snug truncate"
              title={title}
            >
              {title}
            </span>

            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--subtext)] min-w-0 flex-wrap">
              <span className="truncate opacity-85">{validCreator || fallbackTypeLabel}</span>
              {groupedMods.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded((prev) => !prev);
                  }}
                  className={`relative group/modpill ${VAULT_CHIP_CLASS} hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] transition-all cursor-pointer`}
                >
                  <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                    {t("icon_inventory_2", "inventory_2")}
                  </span>
                  <span>
                    {groupedMods.length} {t("card_files_linked", "Linked Files")}
                  </span>
                  <span
                    className={`material-symbols-outlined !text-[12px] opacity-75 transition-transform duration-300 ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                  >
                    {t("icon_expand_more", "expand_more")}
                  </span>

                    {!isExpanded && (
                      <HoverTooltip
                        align="left"
                        vAlign="bottom"
                        content={
                          <div className="glass-panel rounded-2xl p-3.5 min-w-[230px] max-w-[300px] border border-[color-mix(in_srgb,var(--text)_14%,transparent)] shadow-2xl flex flex-col gap-2 pointer-events-none">
                            <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)]">
                                {groupedMods.length} {t("card_files_linked", "Linked Files")}
                              </span>
                            </div>
                            <div className="flex flex-col gap-1.5">
                              {groupedMods.slice(0, 14).map((gm: any, gIdx: number) => {
                                const gmName =
                                  formatAddonModuleName(gm, activeGameSchema) ||
                                  formatDisplayName(gm.displayName || gm.name);
                                const isScript = /\.ts4script$/i.test(
                                  String(gm?.name || gm?._originalSetName || "")
                                );
                                return (
                                  <div
                                    key={`${gm.name || gIdx}-${gIdx}`}
                                    className="flex items-center justify-between gap-3 text-[11px]"
                                  >
                                    <span className="font-bold text-[var(--text)] truncate">
                                      {gmName}
                                    </span>
                                    <span className="text-[10px] font-semibold text-[var(--subtext)] opacity-75 shrink-0">
                                      {isScript
                                        ? t("type_script", "Script")
                                        : t("type_package", "Package")}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        }
                      />
                    )}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <span className={`${VAULT_CHIP_CLASS} !border-[color-mix(in_srgb,var(--accent)_40%,transparent)] !text-[var(--accent)] font-mono`}>
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

          <button
            type="button"
            onClick={openUpdateTarget}
            className="px-3.5 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--accent)] transition-all inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <span>{t("category_update", "Update")}</span>
            <span className="text-xs leading-none">&rarr;</span>
          </button>
        </div>
      </div>

      {/* Optional Footer Row: Target Game Version */}
      {highestGameVer && highestGameVer !== "Unknown" && (
        <div className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 text-xs">
          <span className="text-[11px] font-bold text-[var(--subtext)] opacity-85 truncate">
            {t("required_version", "Required Game Version")}
          </span>
          <span className="font-mono text-[11px] font-bold text-[var(--text)] shrink-0">
            {highestGameVer}
          </span>
        </div>
      )}

      {/* Expanded Linked Modules Drawer inside the card */}
      {isExpanded && groupedMods.length > 1 && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="pt-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex flex-col gap-2.5 animate-in fade-in slide-in-from-top-1 duration-200 cursor-default"
        >
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined !text-[14px]">
                  {t("icon_extension", "extension")}
                </span>
              </div>
              <span className="text-[11px] font-black uppercase tracking-wider text-[var(--subtext)] truncate">
                {groupedMods.length} {t("card_files_linked", "Linked Files")}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_28%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] transition-all cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined !text-[14px]">
                {t("icon_close", "close")}
              </span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                  className="glass-surface rounded-xl px-3.5 py-2.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center gap-2.5"
                >
                  <div className="w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined !text-[15px]">
                      {getModIcon(gm, activeGameSchema, t)}
                    </span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span
                      className="text-xs font-bold text-[var(--text)] truncate"
                      title={gmName}
                    >
                      {gmName}
                    </span>
                    <span className="text-[10px] font-semibold text-[var(--subtext)] opacity-75">
                      {isScript
                        ? t("type_script", "Script")
                        : t("type_package", "Package")}
                    </span>
                  </div>
                </div>
              );
            })}
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
              ? t("updates_det", "{mod} updates detected")
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
            <div className="flex flex-col gap-3 w-full">
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
          <div className="glass-panel rounded-2xl p-8 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
            <EmptyState
              icon={t("icon_check_circle", "check_circle")}
              title={t("no_updates", "All Mods Up to Date")}
            />
          </div>
        )}
      </div>
    </SidePanel>
  );
}
