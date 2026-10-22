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
} from "../shared";
import { UniversalGroup } from "../components/universal/UniversalLayout";
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

function UpdateModCard({ update, handleOpenUrl, t, activeGameSchema }: any) {
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
    ? t("card_file_script", "Script")
    : t("card_file_package", "Package");

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

  const panelResetStyle = {
    "--glass-outer-shadow": "0 0 #0000",
    "--glass-nested-shadow": "0 0 #0000",
    boxShadow: "var(--glass-inset-highlight, inset 0 1px 0 0 rgba(255, 255, 255, 0.14))",
  } as React.CSSProperties;

  return (
    <>
      <div
        onClick={openUpdateTarget}
        style={panelResetStyle}
        className="glass-panel shadow-none rounded-3xl p-5 flex flex-col justify-between gap-3 transition-all duration-300 cursor-pointer group hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)]"
      >
        {/* Top Row: Mod Icon & Metadata */}
        <div className="flex items-center gap-2 min-w-0">
          {image ? (
            <div className="w-8 h-8 rounded-xl overflow-hidden shrink-0">
              <img src={image} alt={title} className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-8 h-8 flex items-center justify-center shrink-0 text-[var(--text)] opacity-80 group-hover:opacity-100 transition-opacity">
              <span className="material-symbols-outlined !text-[20px]">{modIcon}</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--subtext)] min-w-0">
            <span className="truncate opacity-85">{validCreator || fallbackTypeLabel}</span>
            {groupedMods.length > 1 && (
              <>
                <span className="opacity-40 shrink-0">&bull;</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded((prev) => !prev);
                  }}
                  className="relative group/modpill inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full glass-surface hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[10px] font-bold text-[var(--text)] opacity-90 hover:opacity-100 transition-all cursor-pointer shrink-0"
                >
                  <span>
                    {groupedMods.length} {t("card_files_linked", "Linked Files")}
                  </span>
                  <span
                    className={`material-symbols-outlined !text-[13px] opacity-75 transition-transform duration-300 ${
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
                                      ? t("card_file_script", "Script")
                                      : t("card_file_package", "Package")}
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
              </>
            )}
          </div>
        </div>

        {/* Middle Row: Full-Width Mod Title */}
        <span
          className="text-[15px] font-black text-[var(--text)] tracking-tight leading-snug truncate"
          title={title}
        >
          {title}
        </span>

        {/* Bottom Section: Target Game Version (if known) + Installed vs Newest Version + Update Button */}
        <div className="pt-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex flex-col gap-2">
          {highestGameVer && highestGameVer !== "Unknown" && (
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-bold text-[var(--text)] truncate">
                {t("required_version", "Required Game Version")}
              </span>
              <span className="font-mono text-[11px] font-semibold text-[var(--subtext)] opacity-90 shrink-0">
                {highestGameVer}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-0.5">
            <span className="font-mono text-xs font-bold truncate">
              {cleanInstalledVer && cleanNewVer ? (
                <>
                  <span className="text-[var(--subtext)]">v{cleanInstalledVer} &rarr; </span>
                  <span className="text-[var(--text)]">v{cleanNewVer}</span>
                </>
              ) : cleanNewVer ? (
                <span className="text-[var(--text)]">v{cleanNewVer}</span>
              ) : cleanInstalledVer ? (
                <span className="text-[var(--subtext)]">v{cleanInstalledVer}</span>
              ) : (
                <span className="text-[var(--text)]">{t("updates_avail", "Update Available")}</span>
              )}
            </span>

            <button
              type="button"
              onClick={openUpdateTarget}
              className="px-3 h-7 rounded-full glass-surface group-hover:bg-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--text)] transition-all inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <span>{t("comms_btn_update", "Update")}</span>
              <span className="text-xs leading-none">&rarr;</span>
            </button>
          </div>
        </div>
      </div>

      {/* Full-Width Addon / Linked Modules Drawer */}
      {isExpanded && groupedMods.length > 1 && (
        <div
          style={panelResetStyle}
          className="col-span-full glass-panel shadow-none rounded-3xl p-4 flex flex-col gap-3 animate-in fade-in slide-in-from-top-1 duration-200"
        >
          <div className="flex items-center justify-between gap-2 px-1 pb-2 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined !text-[16px] text-[var(--subtext)]">
                {t("icon_extension", "extension")}
              </span>
              <span className="text-xs font-black text-[var(--text)] truncate">
                {title} &bull; {groupedMods.length} {t("card_files_linked", "Linked Files")}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="w-7 h-7 rounded-full glass-surface hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] transition-all cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined !text-[15px]">
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
                  className="glass-surface rounded-2xl px-3.5 py-2.5 flex items-center gap-2.5"
                >
                  <span className="material-symbols-outlined !text-[16px] text-[var(--subtext)] shrink-0">
                    {getModIcon(gm, activeGameSchema, t)}
                  </span>
                  <div className="flex flex-col min-w-0">
                    <span
                      className="text-xs font-bold text-[var(--text)] truncate"
                      title={gmName}
                    >
                      {gmName}
                    </span>
                    <span className="text-[10px] font-semibold text-[var(--subtext)] opacity-75">
                      {isScript
                        ? t("card_file_script", "Script")
                        : t("card_file_package", "Package")}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
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
      subtitle={t("updates_summary_desc", "Available Mod & Blueprint Updates")}
      icon={t("icon_update", "update")}
      iconColorClass="theme-text-accent"
      widthClass="w-full md:w-[760px]"
    >
      <div className="flex flex-col gap-6 relative z-10 w-full pb-12">
        {groupedUpdates.length > 0 && (
          <ActionPill
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchPlaceholder={t("ui_placeholder_search", "Search...")}
          />
        )}

        {filteredUpdates.length > 0 ? (
          <UniversalGroup
            title={`${t("updates_avail", "Updates Available")} (${filteredUpdates.length})`}
            icon={t("icon_update", "update")}
          >
            <div className="grid grid-flow-row-dense grid-cols-1 sm:grid-cols-2 gap-3.5 items-start">
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
          <div className="glass-panel rounded-3xl p-10">
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
