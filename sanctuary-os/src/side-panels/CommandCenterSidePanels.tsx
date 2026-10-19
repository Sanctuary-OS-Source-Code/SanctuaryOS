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

function groupUpdateMods(rawList: any[]): any[] {
  if (!Array.isArray(rawList) || rawList.length === 0) return [];

  const mcCount = rawList.filter((u) => {
    const label = formatDisplayName(u?.displayName || u?.name || "").trim();
    return /^mc[\s_-]/i.test(label) || /mc\s*command\s*center/i.test(label);
  }).length;

  const grouped = new Map<string, any>();

  for (const item of rawList) {
    const rawTitle = formatDisplayName(item?.displayName || item?.name || "").trim();
    const isMc = mcCount > 1 && (/^mc[\s_-]/i.test(rawTitle) || /mc\s*command\s*center/i.test(rawTitle));

    let groupKey: string;
    let displayTitle = rawTitle;

    if (isMc) {
      groupKey = "__suite_mc_command_center__";
      displayTitle = "MC Command Center";
    } else {
      const twinNormalized = rawTitle
        .replace(/(\s+scripts|\s+script|_scripts|_script)$/i, "")
        .trim();
      groupKey = (twinNormalized || rawTitle).toLowerCase();
      displayTitle = twinNormalized || rawTitle;
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
      if (!existing.download_url && item.download_url) existing.download_url = item.download_url;
      if (!existing.url && item.url) existing.url = item.url;
      if ((!existing.author || existing.author === "Unknown") && item.author) {
        existing.author = item.author;
      }
    }
  }

  return Array.from(grouped.values());
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
  const hasDirectLink = Boolean(update.download_url || update.url);
  const modIcon = getModIcon(update, activeGameSchema, t);

  const realVersion =
    update.version &&
    String(update.version).trim() !== "" &&
    String(update.version).toLowerCase() !== "v.local" &&
    String(update.version).toLowerCase() !== "vlocal" &&
    String(update.version).toLowerCase() !== "local" &&
    String(update.version).toLowerCase() !== "unknown"
      ? String(update.version)
      : null;

  const realAuthor =
    update.author &&
    String(update.author).trim() !== "" &&
    String(update.author).toLowerCase() !== "unknown"
      ? String(update.author)
      : null;

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
      : null;

  return (
    <div className="glass-panel rounded-2xl p-4 flex flex-col gap-3 transition-all duration-300 relative border border-[color-mix(in_srgb,var(--accent)_22%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]">
      {/* Top Row: Icon + Title/Meta + Single Update Button */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] flex items-center justify-center shrink-0 overflow-hidden">
          {image ? (
            <img src={image} alt={title} className="w-full h-full object-cover" />
          ) : (
            <span className="material-symbols-outlined !text-[20px]">{modIcon}</span>
          )}
        </div>

        <div className="flex flex-col min-w-0 flex-1">
          <span
            className="text-[13px] font-bold text-[var(--text)] truncate leading-tight"
            title={title}
          >
            {title}
          </span>
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--subtext)] mt-1 flex-wrap">
            {realAuthor && <span className="truncate max-w-[150px]">{realAuthor}</span>}
            {realAuthor && groupedMods.length > 1 && <span className="opacity-40">•</span>}
            {groupedMods.length > 1 ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded((prev) => !prev);
                }}
                className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] border border-[color-mix(in_srgb,var(--accent)_28%,transparent)] text-[var(--accent)] text-[10px] font-bold hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] transition-colors cursor-pointer"
              >
                <span>
                  {groupedMods.length} {t("staging_btn_view_suite", "Modules")}
                </span>
                <span className="material-symbols-outlined !text-[13px] leading-none">
                  {isExpanded
                    ? t("icon_expand_less", "expand_less")
                    : t("icon_expand_more", "expand_more")}
                </span>
              </button>
            ) : (
              !realAuthor && (
                <span className="truncate opacity-70 font-mono text-[10px]">
                  {(update.name || "").split(/[\\/]/).pop()}
                </span>
              )
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={openUpdateTarget}
          className="relative group/actionbtn w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] flex items-center justify-center transition-all shrink-0 cursor-pointer"
        >
          <span className="material-symbols-outlined !text-[16px]">
            {hasDirectLink ? t("icon_download", "download") : t("icon_open_in_new", "open_in_new")}
          </span>
          <HoverTooltip
            className="z-[100] !right-0 !translate-x-0 !left-auto"
            title={t("comms_btn_update", "Update")}
            subtitle={realVersion ? `${realVersion} → ${update.newVersion}` : String(update.newVersion)}
            icon={t("icon_update", "update")}
            variant="accent"
          />
        </button>
      </div>

      {/* Inline Version Transition Strip */}
      <button
        type="button"
        onClick={openUpdateTarget}
        className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl border bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] border-[color-mix(in_srgb,var(--accent)_22%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[11px] transition-all cursor-pointer w-full"
      >
        <div className="flex items-center gap-2 min-w-0 text-[var(--accent)]">
          <span className="material-symbols-outlined !text-[15px] shrink-0">
            {t("icon_update", "update")}
          </span>
          <span className="font-mono font-bold truncate">
            {realVersion ? `${realVersion} → ${update.newVersion}` : String(update.newVersion)}
          </span>
        </div>
        {highestGameVer && highestGameVer !== "Unknown" ? (
          <span className="font-mono text-[10px] font-bold text-[var(--subtext)] shrink-0">
            {highestGameVer}
          </span>
        ) : (
          <span className="text-[10px] font-bold text-[var(--accent)] shrink-0">
            {t("comms_btn_update", "Update")}
          </span>
        )}
      </button>

      {/* Expandable Grouped Modules Drawer */}
      {isExpanded && groupedMods.length > 1 && (
        <div className="pt-2.5 mt-0.5 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--subtext)] opacity-75 px-1">
            {t("card_grouped_files", "Grouped Files")} ({groupedMods.length})
          </span>
          <div className="flex flex-col gap-1 max-h-[150px] overflow-y-auto custom-scrollbar pr-1">
            {groupedMods.map((gm: any, idx: number) => {
              const rawFile = String(gm.name || "").split(/[\\/]/).pop() || gm.name;
              const isScript = /\.ts4script$/i.test(rawFile);
              return (
                <div
                  key={`${gm.name}-${idx}`}
                  className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[color-mix(in_srgb,var(--text)_4%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] text-[11px]"
                >
                  <span
                    className="font-mono text-[var(--text)] opacity-90 truncate"
                    title={rawFile}
                  >
                    {rawFile}
                  </span>
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                      isScript
                        ? "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)]"
                        : "bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-[var(--subtext)]"
                    }`}
                  >
                    {isScript
                      ? t("card_file_script", "Script")
                      : t("card_file_package", "Package")}
                  </span>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 items-start">
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
