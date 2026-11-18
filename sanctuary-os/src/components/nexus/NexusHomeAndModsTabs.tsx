import React from "react";
import {
  ActionButton,
  isScriptExtension,
  formatDisplayName,
  getModIcon,
  AccordionDrawer,
  DeferredRender,
  HoverTooltip,
  EmptyState,
} from "../../shared";
import { useStore } from "../../store";
import { isDesktop } from "../../utils/envUtils";
import {
  CommandScreenLayout,
  CommandScreenSectionHeading,
  CommandScreenBody,
  CommandScreenMain,
  CommandScreenSidebar,
  CommandScreenQuickLink,
} from "../../hub-components/SharedCommandScreenLayout";
import {
  DynamicThemePreviewBanner,
  DynamicLexiconPreviewBanner,
  DynamicBlueprintPreviewBanner,
  DynamicTemplatePreviewBanner,
  DynamicArtifactPreviewBanner,
} from "../../chameleon-components/ThemeCard";

export function NexusHomeAndModsTabs({
  cleanModName,
  onOpenDossier,
  onSetStatus,
  t,
  activeGameSchema,
  marketTab,
  setMarketTab,
  selectedVersion,
  showImages,
  setSelectedBlueprint,
  setPreviewAsset,
  toggleModInStagingDraft,
  stagedModKeys,
  results,
  loadingMods,
  searchQuery,
  setCurrentPage,
  currentPage,
  categoryFilter,
  selectedGameVersion,
  dlcFilter,
  hidePaid,
  hideEarlyAccess,
  hideMissingDLC,
  hideInstalled,
  setHideInstalled,
  expandedFolder,
  setExpandedFolder,
  drawerSearchQuery,
  setDrawerSearchQuery,
  stats,
  recentFeed,
  loadingHome,
  totalPages,
  paginatedResults,
  handleNexusModContextMenu,
  handleNexusAssetContextMenu,
}: any) {
  return (
    <>
        <div className={marketTab === 'HOME' ? 'flex-1 flex flex-col relative' : 'hidden'}>
          <CommandScreenLayout>
            <CommandScreenBody>
              <CommandScreenMain>
                <div className="flex flex-col gap-4 w-full">
                  <CommandScreenSectionHeading
                    title={t("recent_activity", "Recent Activity")}
                    icon={t("icon_history", "history")}
                  />
                  <div className="grid grid-flow-row-dense grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-6 w-full">
                    {loadingHome ? (
                      <EmptyState
                        icon={t("icon_sync", "sync")}
                        title={t("loading", "Loading")}
                        className="col-span-full"
                      />
                    ) : recentFeed.length > 0 ? recentFeed.map((item: any, index: any) => {
                      const mainKey = item.id || `${item.feed_type}_${index}`;
                      const isFolder = item.feed_type === 'artifact' && (item.isVirtual || item.isParent || item.familyCount > 1);
                      const chipClass =
                        "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

                      const rawStatus = String(item?.status || "stable").toLowerCase().replace(/_/g, " ").replace(/[^\w\s-]/gi, "").trim();
                      const statusMeta = (() => {
                        if (rawStatus === "corrupted" || rawStatus === "broken") {
                          return { label: t("status_corrupted", "Corrupted"), icon: t("icon_error", "error"), iconColor: "text-[var(--danger)]" };
                        }
                        if (rawStatus === "unstable") {
                          return { label: t("label_unstable", "Unstable"), icon: t("icon_warning", "warning"), iconColor: "text-[var(--warning)]" };
                        }
                        if (rawStatus === "under review" || rawStatus === "pending") {
                          return { label: t("status_dd_review", "Under Review"), icon: t("icon_schedule", "schedule"), iconColor: "text-[var(--accent)]" };
                        }
                        if (item.feed_type !== 'artifact' || rawStatus === "synced") {
                          return { label: t("synced_badge", "Synced"), icon: t("icon_cloud_done", "cloud_done"), iconColor: "text-[var(--success)]" };
                        }
                        return { label: t("status_stable", "Stable"), icon: t("icon_verified", "verified"), iconColor: "text-[var(--success)]" };
                      })();

                      const typeBadgeIcon = item.feed_type === 'artifact'
                        ? (String(item.category_override || item.name || "").toLowerCase().includes("script") ? t("icon_terminal", "terminal") : t("icon_deployed_code", "deployed_code"))
                        : item.feed_type === 'blueprint'
                          ? t("icon_map", "map")
                          : item.feed_type === 'lexicon'
                            ? t("icon_translate", "translate")
                            : item.feed_type === 'template'
                              ? t("icon_draw", "draw")
                              : t("icon_palette", "palette");

                      const typeBadgeColor = item.feed_type === 'artifact' ? "text-[var(--subtext)]" : "text-[var(--accent)]";
                      const bannerIcon = item.feed_type === 'artifact'
                        ? (item.isCollection ? t("icon_folder_special", "folder_special") : item.isParent ? t("icon_account_tree", "account_tree") : t("icon_deployed_code", "deployed_code"))
                        : item.feed_type === 'blueprint'
                          ? t("icon_map", "map")
                          : item.feed_type === 'lexicon'
                            ? t("icon_translate", "translate")
                            : item.feed_type === 'template'
                              ? t("icon_draw", "draw")
                              : t("icon_palette", "palette");

                      const renderedCard = (
                        <div key={mainKey} className={`relative flex flex-col h-full glass-panel rounded-[var(--radius)] transition-colors duration-300 shadow-xl hover:shadow-2xl cursor-pointer hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] group ${expandedFolder === mainKey ? 'sa-glass-active' : ''}`} onClick={() => {
                          if (item.feed_type === 'artifact') {
                            if (onOpenDossier) onOpenDossier({ ...item, isNexusView: true });
                          } else if (item.feed_type === 'blueprint') {
                            setSelectedBlueprint(item);
                          } else if (item.feed_type === 'lexicon') {
                            setPreviewAsset({ id: item.id, type: 'lexicon' });
                          } else if (item.feed_type === 'chameleon') {
                            setPreviewAsset({ id: item.id, type: 'chameleon' });
                          } else if (item.feed_type === 'template') {
                            setPreviewAsset({ id: item.id, type: 'workbench_template' });
                          }
                        }} onContextMenu={(e) => {
                          if (item.feed_type === 'artifact') {
                            handleNexusModContextMenu(e, item, mainKey, isFolder);
                          } else {
                            handleNexusAssetContextMenu(e, item, item.feed_type || 'asset');
                          }
                        }}>
                          <div
                            className="relative z-20 h-32 border-b border-[color-mix(in_srgb,var(--text)_5%,rgba(255,255,255,0.14))] shrink-0 flex items-center justify-center transition-colors duration-500 overflow-hidden"
                            style={{ borderTopLeftRadius: 'inherit', borderTopRightRadius: 'inherit', background: 'var(--glass-card-banner-bg)' }}
                          >
                            <div className="absolute top-3 left-3 z-30">
                              <div className={chipClass}>
                                <span className={`material-symbols-outlined !text-[12px] ${statusMeta.iconColor}`}>
                                  {statusMeta.icon}
                                </span>
                                <span>{statusMeta.label}</span>
                              </div>
                            </div>
                            {(showImages !== false && item.image_url) ? (
                              <img
                                src={item.image_url}
                                alt={item.name || item.title}
                                loading="lazy"
                                className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-transform duration-700"
                                style={{ borderTopLeftRadius: 'inherit', borderTopRightRadius: 'inherit' }}
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              />
                            ) : item.feed_type === 'chameleon' ? (
                              <div className="w-full h-full">
                                <DynamicThemePreviewBanner
                                  data={{ ...item, ...(typeof item.json_data === 'object' ? item.json_data : {}), name: item.name || item.title, previewImage: showImages !== false ? (item.image_url || item.json_data?.previewImage) : undefined }}
                                  heightClass="h-full"
                                />
                              </div>
                            ) : item.feed_type === 'lexicon' ? (
                              <div className="w-full h-full">
                                <DynamicLexiconPreviewBanner data={item} heightClass="h-full" />
                              </div>
                            ) : item.feed_type === 'blueprint' ? (
                              <div className="w-full h-full">
                                <DynamicBlueprintPreviewBanner data={item} heightClass="h-full" />
                              </div>
                            ) : item.feed_type === 'template' ? (
                              <div className="w-full h-full">
                                <DynamicTemplatePreviewBanner data={item} heightClass="h-full" />
                              </div>
                            ) : (
                              <div className="w-full h-full">
                                <DynamicArtifactPreviewBanner
                                  data={item}
                                  icon={bannerIcon}
                                  heightClass="h-full"
                                />
                              </div>
                            )}
                          </div>

                          <div className="p-5 flex flex-col flex-1">
                            <h3 className="text-[15px] font-bold truncate capitalize tracking-tight group-hover:theme-text-accent transition-colors mb-1">
                              {cleanModName(item.name || item.title || item.id).name}
                            </h3>
                            <p className="text-[9px] font-bold text-[var(--subtext)] opacity-60 capitalize tracking-widest truncate mb-2">
                              BY {item.master_author || item.author || "Citizen"}
                            </p>

                            <div className="flex flex-wrap items-center gap-2 mt-1 mb-3">
                              <div className={chipClass}>
                                <span className={`material-symbols-outlined !text-[12px] ${typeBadgeColor}`}>
                                  {typeBadgeIcon}
                                </span>
                                <span className={item.feed_type === 'artifact' ? "text-[var(--subtext)]" : ""}>
                                  {item.category_override || item.feed_type}
                                </span>
                              </div>
                            </div>

                            <div className="mt-auto pt-3 flex items-center justify-between border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] relative">
                              <span className="text-[8px] font-mono text-[var(--subtext)] opacity-50 capitalize tracking-widest pointer-events-auto z-10">
                                {item.created_at ? new Date(item.created_at).toLocaleDateString() : ""}
                              </span>

                              {isFolder && (
                                <button
                                  type="button"
                                  className="group/hitbox relative z-20 flex items-center gap-1.5 font-black text-[9px] uppercase tracking-wider text-[var(--text)] hover:text-[var(--accent)] transition-colors pointer-events-auto cursor-pointer"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedFolder((prev: string | null) => prev === mainKey ? null : mainKey);
                                  }}
                                >
                                  <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                                    {t("icon_account_tree", "account_tree")}
                                  </span>
                                  <span>+{item.familyCount || (item.flavors?.length || 0)} {t("badge_modules_count", "Modules")}</span>
                                  <span className={`material-symbols-outlined !text-[14px] transition-transform duration-300 ${expandedFolder === mainKey ? 'rotate-180 text-[var(--accent)]' : ''}`}>
                                    {t("icon_expand_more", "expand_more")}
                                  </span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );

                      return (
                        <React.Fragment key={mainKey}>
                          <div className="contents">
                            {renderedCard}
                          </div>

                          <AccordionDrawer isOpen={expandedFolder === mainKey}>
                            <div
                              className="w-full glass-panel rounded-3xl p-4 sm:p-6 md:p-8 border border-[color-mix(in_srgb,var(--text)_14%,transparent)] shadow-[0_24px_60px_rgba(0,0,0,0.45)] flex flex-col gap-5 md:gap-6 relative isolate"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {/* Header */}
                              <div className="flex flex-wrap gap-3 sm:gap-4 items-center justify-between pb-4 sm:pb-5 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] relative z-20 w-full">
                                <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0">
                                    <span className="material-symbols-outlined !text-[22px] sm:!text-[24px] text-[var(--accent)]">{t("icon_folder_open", "folder_open")}</span>
                                  </div>
                                  <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                                    <h3 className="text-base sm:text-xl md:text-2xl font-black text-[var(--text)] tracking-tight leading-tight truncate">
                                      {formatDisplayName(item.displayName || item.name || item.title)}
                                    </h3>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                                        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{t("icon_account_tree", "account_tree")}</span>
                                        <span>
                                          {t("nav_exploring", "Exploring")} {(item.flavors || []).length} {t("term_mods", "Mods")}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2.5 sm:gap-3 w-full md:w-auto relative z-30">
                                  <div
                                    className="relative flex-1 md:w-72 h-10 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus-within:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] flex items-center px-3.5 gap-2.5 transition-colors"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <span className="material-symbols-outlined !text-[16px] text-[var(--subtext)] opacity-70 shrink-0">
                                      {t("icon_search", "search")}
                                    </span>
                                    <input
                                      type="text"
                                      value={drawerSearchQuery}
                                      onChange={(e) => setDrawerSearchQuery(e.target.value)}
                                      onClick={(e) => e.stopPropagation()}
                                      onKeyDown={(e) => {
                                        e.stopPropagation();
                                        if (e.key === "Escape") setDrawerSearchQuery("");
                                      }}
                                      placeholder={t("search_ph", "Search {mods}...")}
                                      className="w-full bg-transparent border-none outline-none text-xs font-bold text-[var(--text)] placeholder:text-[var(--subtext)] placeholder:opacity-50"
                                    />
                                    {drawerSearchQuery && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setDrawerSearchQuery("");
                                        }}
                                        className="w-5 h-5 rounded-full flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] transition-colors shrink-0"
                                      >
                                        <span className="material-symbols-outlined !text-[14px]">
                                          {t("icon_close", "close")}
                                        </span>
                                      </button>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDrawerSearchQuery("");
                                      setExpandedFolder(null);
                                    }}
                                    className="w-10 h-10 rounded-xl glass-surface hover:text-[var(--danger)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center text-[var(--text)] transition-colors shrink-0 cursor-pointer pointer-events-auto"
                                  >
                                    <span className="material-symbols-outlined !text-[20px]">
                                      {t("icon_close", "close")}
                                    </span>
                                  </button>
                                </div>
                              </div>

                              {/* Content Area */}
                              <div className="w-full relative z-10">
                                <DeferredRender>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-h-[520px] xl:max-h-[600px] overflow-y-auto custom-scrollbar pr-1 pt-1 pb-2">
                                    {(item.flavors || [])
                                      .filter((flavor: any) => {
                                        if (!drawerSearchQuery) return true;
                                        const query = drawerSearchQuery.toLowerCase().replace(/[_\-\.\/]+/g, ' ').replace(/\s+/g, ' ').trim();
                                        const target = `${flavor.displayName || ""} ${flavor.name || ""} ${flavor.master_author || flavor.author || ""}`.toLowerCase().replace(/[_\-\.\/]+/g, ' ').replace(/\s+/g, ' ');
                                        return target.includes(query);
                                      })
                                      .map((flavor: any, subIdx: number) => {
                                        const flavorIsScript =
                                          String(flavor.file_extension || "").toLowerCase().includes("script") ||
                                          String(flavor.category_override || "").toLowerCase() === "script" ||
                                          String(flavor.sub_type || "").toLowerCase() === "script" ||
                                          isScriptExtension(String(flavor.name || flavor.file_extension || ""), activeGameSchema);
                                        return (
                                          <div
                                            key={`sub-${flavor.id || flavor.hash || flavor.name}-${subIdx}`}
                                            onClick={() => onOpenDossier && onOpenDossier({ ...flavor, isNexusView: true })}
                                            className="relative flex flex-col h-full glass-panel rounded-2xl transition-all duration-300 shadow-xl hover:shadow-2xl cursor-pointer hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] group"
                                          >
                                            <div
                                              className="relative z-20 h-28 border-b border-[color-mix(in_srgb,var(--text)_5%,rgba(255,255,255,0.14))] shrink-0 flex items-center justify-center transition-colors duration-500 overflow-hidden"
                                              style={{ borderTopLeftRadius: 'inherit', borderTopRightRadius: 'inherit', background: 'var(--glass-card-banner-bg)' }}
                                            >
                                              {(showImages !== false && flavor.image_url) ? (
                                                <img
                                                  src={flavor.image_url}
                                                  alt={flavor.name}
                                                  loading="lazy"
                                                  className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-transform duration-700"
                                                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                                />
                                              ) : (
                                                <DynamicArtifactPreviewBanner
                                                  data={flavor}
                                                  icon={getModIcon(flavor, useStore.getState().activeGameSchema, t)}
                                                  compact={true}
                                                  heightClass="h-full"
                                                />
                                              )}
                                            </div>
                                            <div className="p-4 flex flex-col flex-1">
                                              <h3 className="text-xs font-bold truncate capitalize tracking-tight group-hover:theme-text-accent transition-colors mb-1">
                                                {cleanModName(flavor.name || flavor.id).name}
                                              </h3>
                                              <p className="text-[8px] font-black text-[color-mix(in_srgb,var(--text)_30%,transparent)] capitalize tracking-widest truncate mb-2">
                                                {flavor.master_author || item.master_author || "Unknown Creator"}{(flavor.latest_version || flavor.version) ? ` • ${flavor.latest_version || flavor.version}` : ""}
                                              </p>
                                              <div className="flex flex-wrap items-center gap-1.5 mt-1 mb-2">
                                                <div className={chipClass}>
                                                  <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                                                    {flavorIsScript ? t("icon_terminal", "terminal") : t("icon_deployed_code", "deployed_code")}
                                                  </span>
                                                  <span className="text-[var(--subtext)]">
                                                    {flavorIsScript ? t("type_script", "Script") : t("type_package", "Module")}
                                                  </span>
                                                </div>
                                              </div>
                                              {!isDesktop() && (
                                                <div className="mt-auto pt-2 flex justify-end">
                                                  <button
                                                    type="button"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      const wasStaged = stagedModKeys.has(String(flavor.id)) || (flavor.hash && stagedModKeys.has(String(flavor.hash)));
                                                      toggleModInStagingDraft(flavor);
                                                      onSetStatus(wasStaged ? t("status_staging_item_removed", "Removed from Remote Staging Queue.") : t("status_staging_item_added", "Added to Remote Staging Queue."));
                                                    }}
                                                    className={`px-2.5 py-1 rounded-lg border text-[8px] font-black uppercase tracking-widest flex items-center gap-1 transition-all ${
                                                      (stagedModKeys.has(String(flavor.id)) || (flavor.hash && stagedModKeys.has(String(flavor.hash))))
                                                        ? 'sa-glass-active text-[var(--accent)]'
                                                        : 'glass-surface border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)]'
                                                    }`}
                                                  >
                                                    <span className="material-symbols-outlined !text-[12px]">
                                                      {(stagedModKeys.has(String(flavor.id)) || (flavor.hash && stagedModKeys.has(String(flavor.hash))))
                                                        ? t("icon_playlist_add_check", "playlist_add_check")
                                                        : t("icon_playlist_add", "playlist_add")}
                                                    </span>
                                                    <span>
                                                      {(stagedModKeys.has(String(flavor.id)) || (flavor.hash && stagedModKeys.has(String(flavor.hash))))
                                                        ? t("staging_btn_staged", "Staged")
                                                        : t("staging_btn_stage_mod", "Stage to PC")}
                                                    </span>
                                                  </button>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                  </div>
                                </DeferredRender>
                              </div>
                            </div>
                          </AccordionDrawer>
                        </React.Fragment>
                      );
                    }) : (
                      <EmptyState
                        icon={t("icon_history", "history")}
                        title={t("no_recent_activity", "No Recent Activity")}
                        className="col-span-full"
                      />
                    )}
                  </div>
                </div>
              </CommandScreenMain>

              <CommandScreenSidebar title={t("wf_quick_links", "Quick Links")} icon={t("icon_bolt", "bolt")}>
                <div className="flex flex-col gap-4">
                  <CommandScreenQuickLink
                    icon={t("icon_extension", "extension")}
                    title={t("tab_mods", "{Mods}")}
                    subtitle={`${t("btn_browse", "Browse")} ${t("filter_all", "All")} ${stats.artifacts} ${t("tab_mods", "{Mods}")}`}
                    onClick={() => setMarketTab('MODS')}
                    textColorClass="text-emerald-500"
                    hoverTextColorClass="group-hover:text-emerald-400"
                    iconShadowClass="drop-shadow-md text-emerald-500"
                    iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)]"
                  />
                  <CommandScreenQuickLink
                    icon={t("icon_map", "map")}
                    title={t("tab_blueprints", "{Blueprints}")}
                    subtitle={`${t("btn_browse", "Browse")} ${t("filter_all", "All")} ${stats.blueprints} ${t("tab_blueprints", "{Blueprints}")}`}
                    onClick={() => setMarketTab('BLUEPRINTS')}
                    textColorClass="text-blue-500"
                    hoverTextColorClass="group-hover:text-blue-400"
                    iconShadowClass="drop-shadow-md text-blue-500"
                    iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)]"
                  />
                  <CommandScreenQuickLink
                    icon={t("icon_translate", "translate")}
                    title={t("tab_lexicons", "Language")}
                    subtitle={`${t("btn_browse", "Browse")} ${t("filter_all", "All")} ${stats.lexicons} ${t("tab_lexicons", "Language")}`}
                    onClick={() => setMarketTab('LEXICONS')}
                    textColorClass="text-purple-500"
                    hoverTextColorClass="group-hover:text-purple-400"
                    iconShadowClass="drop-shadow-md text-purple-500"
                    iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)]"
                  />
                  <CommandScreenQuickLink
                    icon={t("icon_palette", "palette")}
                    title={t("tab_chameleons", "Chameleons")}
                    subtitle={`${t("btn_browse", "Browse")} ${t("filter_all", "All")} ${stats.chameleons} ${t("tab_chameleons", "Chameleons")}`}
                    onClick={() => setMarketTab('CHAMELEONS')}
                    textColorClass="text-rose-500"
                    hoverTextColorClass="group-hover:text-rose-400"
                    iconShadowClass="drop-shadow-md text-rose-500"
                    iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)]"
                  />
                  <CommandScreenQuickLink
                    icon={t("icon_draw", "draw")}
                    title={t("tab_templates", "Templates")}
                    subtitle={`${t("btn_browse", "Browse")} ${t("filter_all", "All")} ${stats.templates} ${t("tab_templates", "Templates")}`}
                    onClick={() => setMarketTab('TEMPLATES')}
                    textColorClass="text-amber-500"
                    hoverTextColorClass="group-hover:text-amber-400"
                    iconShadowClass="drop-shadow-md text-amber-500"
                    iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)]"
                  />
                </div>
              </CommandScreenSidebar>
            </CommandScreenBody>
          </CommandScreenLayout>
        </div>

        <div className={marketTab === 'MODS' ? 'flex-1 flex flex-col relative' : 'hidden'}>
          <>
            {/*  removed in favor of ViewHeader filters */}

            <div className="grid grid-flow-row-dense grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6 pb-8 mt-6">
              {loadingMods ? (
                <EmptyState
                  icon={t("icon_sync", "sync")}
                  title={t("searching", "Searching The {Nexus}...")}
                  className="col-span-full"
                />
              ) : paginatedResults.length > 0 ? (
                <>
                  {paginatedResults.map((mod: any, index: number) => {
                    const mainKey = mod.id || `${mod.name}_${index}`;
                    const isFolder = mod.isVirtual || mod.isParent || mod.familyCount > 1;
                    const chipClass =
                      "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

                    const rawStatus = (mod.status || 'UNVERIFIED').toLowerCase().replace(/[\[\]]/g, "").replace(/_/g, " ").trim();
                    const statusMeta = (() => {
                      if (rawStatus === 'broken' || rawStatus === 'corrupted') {
                        return { label: t("status_corrupted", "Corrupted"), icon: t("icon_error", "error"), iconColor: "text-[var(--danger)]" };
                      }
                      if (rawStatus === 'unstable') {
                        return { label: t("label_unstable", "Unstable"), icon: t("icon_warning", "warning"), iconColor: "text-[var(--warning)]" };
                      }
                      if (rawStatus === 'under review' || rawStatus === 'pending') {
                        return { label: t("status_dd_review", "Under Review"), icon: t("icon_schedule", "schedule"), iconColor: "text-[var(--accent)]" };
                      }
                      if (rawStatus === 'synced') {
                        return { label: t("synced_badge", "Synced"), icon: t("icon_cloud_done", "cloud_done"), iconColor: "text-[var(--success)]" };
                      }
                      if (rawStatus === 'stable' || rawStatus === 'verified') {
                        return { label: t("status_stable", "Stable"), icon: t("icon_verified", "verified"), iconColor: "text-[var(--success)]" };
                      }
                      if (rawStatus === 'early access') {
                        return { label: t("badge_early_access", "Early Access"), icon: t("icon_science", "science"), iconColor: "text-purple-400" };
                      }
                      if (rawStatus === 'paid') {
                        return { label: t("badge_paid", "Paid"), icon: t("icon_monetization_on", "monetization_on"), iconColor: "text-amber-400" };
                      }
                      return { label: rawStatus.toUpperCase() || t("unverified", "Unverified"), icon: t("icon_science", "science"), iconColor: "text-[var(--accent)]" };
                    })();

                    const isScriptMod = String(mod.category_override || mod.name || "").toLowerCase().includes("script");

                    const renderedCard = (
                      <div
                        key={mainKey}
                        onClick={() => onOpenDossier && onOpenDossier({ ...mod, isNexusView: true })}
                        onContextMenu={(e) => handleNexusModContextMenu(e, mod, mainKey, isFolder)}
                        className={`relative flex flex-col h-full glass-panel rounded-2xl transition-colors duration-300 shadow-xl hover:shadow-2xl cursor-pointer hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] group ${expandedFolder === mainKey ? 'sa-glass-active' : ''}`}
                      >
                        <div
                          className="relative z-20 h-32 border-b border-[color-mix(in_srgb,var(--text)_5%,rgba(255,255,255,0.14))] shrink-0 flex items-center justify-center transition-colors duration-500 overflow-hidden"
                          style={{ borderTopLeftRadius: 'inherit', borderTopRightRadius: 'inherit', background: 'var(--glass-card-banner-bg)' }}
                        >
                          <div className="absolute top-3 left-3 z-30">
                            <div className={chipClass}>
                              <span className={`material-symbols-outlined !text-[12px] ${statusMeta.iconColor}`}>
                                {statusMeta.icon}
                              </span>
                              <span>{statusMeta.label}</span>
                            </div>
                          </div>
                          {(showImages !== false && mod.image_url) ? (
                            <img
                              src={mod.image_url}
                              alt={mod.name}
                              loading="lazy"
                              className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-transform duration-700"
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                          ) : (
                            <DynamicArtifactPreviewBanner
                              data={mod}
                              icon={getModIcon(mod, useStore.getState().activeGameSchema, t)}
                              heightClass="h-full"
                            />
                          )}
                        </div>

                        <div className="p-5 flex flex-col flex-1">
                          <h3 className="text-[15px] font-bold truncate capitalize tracking-tight group-hover:theme-text-accent transition-colors mb-1">
                            {cleanModName(mod.name || mod.id).name}
                          </h3>
                          <p className="text-[9px] font-black text-[color-mix(in_srgb,var(--text)_30%,transparent)] capitalize tracking-widest truncate mb-2">
                            {mod.master_author || t("unknown_mason", "Unknown {Mason}")}{(mod.latest_version) ? ` • ${mod.latest_version}` : ""}
                          </p>

                          <div className="flex flex-wrap items-center gap-2 mt-1 mb-3">
                            <div className={chipClass}>
                              <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                                {isScriptMod ? t("icon_terminal", "terminal") : t("icon_deployed_code", "deployed_code")}
                              </span>
                              <span className="text-[var(--subtext)]">
                                {mod.category_override || t("label_artifact", "{Mod}")}
                              </span>
                            </div>

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

                          {mod.description && (
                            <p className="text-[10px] text-[var(--subtext)] opacity-70 line-clamp-2 leading-relaxed mb-4">
                              {mod.description}
                            </p>
                          )}

                          <div className="mt-auto pt-3.5 flex items-center justify-between border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] relative gap-2">
                            {isFolder ? (
                              <button
                                type="button"
                                className="group/hitbox relative z-20 flex items-center gap-1.5 font-black text-[9px] uppercase tracking-wider text-[var(--text)] hover:text-[var(--accent)] transition-colors pointer-events-auto cursor-pointer whitespace-nowrap"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedFolder((prev: string | null) => prev === mainKey ? null : mainKey);
                                }}
                              >
                                <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                                  {t("icon_account_tree", "account_tree")}
                                </span>
                                <span>+{mod.familyCount || (mod.flavors?.length || 0)} {t("badge_modules_count", "Modules")}</span>
                                <span className={`material-symbols-outlined !text-[14px] transition-transform duration-300 ${expandedFolder === mainKey ? 'rotate-180 text-[var(--accent)]' : ''}`}>
                                  {t("icon_expand_more", "expand_more")}
                                </span>
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[9px] font-bold text-[var(--subtext)] opacity-65 tracking-wider pointer-events-auto z-10 whitespace-nowrap">
                                <span className="material-symbols-outlined !text-[12px] opacity-75">{t("icon_calendar", "event")}</span>
                                {mod.created_at ? new Date(mod.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : t("date_unknown", "Unknown Date")}
                              </span>
                            )}

                            {!isDesktop() && (() => {
                              const isModOrSuiteStaged = isFolder && Array.isArray(mod.flavors) && mod.flavors.length > 0
                                ? mod.flavors.every((f: any) => stagedModKeys.has(String(f.id)) || (f.hash && stagedModKeys.has(String(f.hash))))
                                : (stagedModKeys.has(String(mod.id)) || (mod.hash && stagedModKeys.has(String(mod.hash))));
                              return (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleModInStagingDraft(mod);
                                    onSetStatus(
                                      isModOrSuiteStaged
                                        ? t("status_staging_item_removed", "Removed from Remote Staging Queue.")
                                        : t("status_staging_item_added", "Added to Remote Staging Queue.")
                                    );
                                  }}
                                  className={`h-8 px-3 rounded-xl border text-[9.5px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 whitespace-nowrap transition-all pointer-events-auto z-20 cursor-pointer ${
                                    isModOrSuiteStaged
                                      ? 'sa-glass-active text-[var(--accent)]'
                                      : 'glass-surface border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)]'
                                  }`}
                                >
                                  <span className="material-symbols-outlined !text-[14px]">
                                    {isModOrSuiteStaged
                                      ? t("icon_playlist_add_check", "playlist_add_check")
                                      : t("icon_playlist_add", "playlist_add")}
                                  </span>
                                  <span>
                                    {isModOrSuiteStaged
                                      ? t("staging_btn_staged", "Staged")
                                      : isFolder
                                        ? t("staging_btn_stage_suite", "Stage Suite")
                                        : t("nexus_btn_stage_compact", "Stage to Desktop")}
                                  </span>
                                  <HoverTooltip
                                    title={
                                      isModOrSuiteStaged
                                        ? t("staging_btn_unstage_mod", "Remove from Staging")
                                        : isFolder
                                          ? t("staging_btn_stage_suite", "Stage Suite")
                                          : t("nexus_btn_stage_compact", "Stage to Desktop")
                                    }
                                  />
                                </button>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    );

                    return (
                      <React.Fragment key={mainKey}>
                        <div className="contents">
                          {renderedCard}
                        </div>

                        <AccordionDrawer isOpen={expandedFolder === mainKey}>
                          <div
                            className="w-full glass-panel rounded-3xl p-4 sm:p-6 md:p-8 border border-[color-mix(in_srgb,var(--text)_14%,transparent)] shadow-[0_24px_60px_rgba(0,0,0,0.45)] flex flex-col gap-5 md:gap-6 relative isolate"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {/* Header */}
                            <div className="flex flex-wrap gap-3 sm:gap-4 items-center justify-between pb-4 sm:pb-5 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] relative z-20 w-full">
                              <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0">
                                  <span className="material-symbols-outlined !text-[22px] sm:!text-[24px] text-[var(--accent)]">{t("icon_folder_open", "folder_open")}</span>
                                </div>
                                <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                                  <h3 className="text-base sm:text-xl md:text-2xl font-black text-[var(--text)] tracking-tight leading-tight truncate">
                                    {formatDisplayName(mod.displayName || mod.name)}
                                  </h3>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                                      <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{t("icon_account_tree", "account_tree")}</span>
                                      <span>
                                        {t("nav_exploring", "Exploring")} {(mod.flavors || []).length} {t("term_mods", "Mods")}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2.5 sm:gap-3 w-full md:w-auto relative z-30">
                                <div
                                  className="relative flex-1 md:w-72 h-10 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus-within:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] flex items-center px-3.5 gap-2.5 transition-colors"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <span className="material-symbols-outlined !text-[16px] text-[var(--subtext)] opacity-70 shrink-0">
                                    {t("icon_search", "search")}
                                  </span>
                                  <input
                                    type="text"
                                    value={drawerSearchQuery}
                                    onChange={(e) => setDrawerSearchQuery(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => {
                                      e.stopPropagation();
                                      if (e.key === "Escape") setDrawerSearchQuery("");
                                    }}
                                    placeholder={t("search_ph", "Search {mods}...")}
                                    className="w-full bg-transparent border-none outline-none text-xs font-bold text-[var(--text)] placeholder:text-[var(--subtext)] placeholder:opacity-50"
                                  />
                                  {drawerSearchQuery && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDrawerSearchQuery("");
                                      }}
                                      className="w-5 h-5 rounded-full flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] transition-colors shrink-0"
                                    >
                                      <span className="material-symbols-outlined !text-[14px]">
                                        {t("icon_close", "close")}
                                      </span>
                                    </button>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDrawerSearchQuery("");
                                    setExpandedFolder(null);
                                  }}
                                  className="w-10 h-10 rounded-xl glass-surface hover:text-[var(--danger)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center text-[var(--text)] transition-colors shrink-0 cursor-pointer pointer-events-auto"
                                >
                                  <span className="material-symbols-outlined !text-[20px]">
                                    {t("icon_close", "close")}
                                  </span>
                                </button>
                              </div>
                            </div>

                            {/* Content Area */}
                            <div className="w-full relative z-10">
                              <DeferredRender>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-h-[520px] xl:max-h-[600px] overflow-y-auto custom-scrollbar pr-1 pt-1 pb-2">
                                  {(mod.flavors || [])
                                    .filter((flavor: any) => {
                                      if (!drawerSearchQuery) return true;
                                      const query = drawerSearchQuery.toLowerCase().replace(/[_\-\.\/]+/g, ' ').replace(/\s+/g, ' ').trim();
                                      const target = `${flavor.displayName || ""} ${flavor.name || ""} ${flavor.master_author || flavor.author || ""}`.toLowerCase().replace(/[_\-\.\/]+/g, ' ').replace(/\s+/g, ' ');
                                      return target.includes(query);
                                    })
                                    .map((flavor: any, subIdx: number) => {
                                      const flavorIsScript =
                                        String(flavor.file_extension || "").toLowerCase().includes("script") ||
                                        String(flavor.category_override || "").toLowerCase() === "script" ||
                                        String(flavor.sub_type || "").toLowerCase() === "script" ||
                                        isScriptExtension(String(flavor.name || flavor.file_extension || ""), activeGameSchema);
                                      return (
                                        <div
                                          key={`sub-${flavor.id || flavor.hash || flavor.name}-${subIdx}`}
                                          onClick={() => onOpenDossier && onOpenDossier({ ...flavor, isNexusView: true })}
                                          className="relative flex flex-col h-full glass-panel rounded-2xl transition-all duration-300 shadow-xl hover:shadow-2xl cursor-pointer hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] group"
                                        >
                                          <div
                                            className="relative z-20 h-28 border-b border-[color-mix(in_srgb,var(--text)_5%,rgba(255,255,255,0.14))] shrink-0 flex items-center justify-center transition-colors duration-500 overflow-hidden"
                                            style={{ borderTopLeftRadius: 'inherit', borderTopRightRadius: 'inherit', background: 'var(--glass-card-banner-bg)' }}
                                          >
                                            {(showImages !== false && flavor.image_url) ? (
                                              <img
                                                src={flavor.image_url}
                                                alt={flavor.name}
                                                loading="lazy"
                                                className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-transform duration-700"
                                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                              />
                                            ) : (
                                              <DynamicArtifactPreviewBanner
                                                data={flavor}
                                                icon={getModIcon(flavor, useStore.getState().activeGameSchema, t)}
                                                compact={true}
                                                heightClass="h-full"
                                              />
                                            )}
                                          </div>
                                          <div className="p-4 flex flex-col flex-1">
                                            <h3 className="text-xs font-bold truncate capitalize tracking-tight group-hover:theme-text-accent transition-colors mb-1">
                                              {cleanModName(flavor.name || flavor.id).name}
                                            </h3>
                                            <p className="text-[8px] font-black text-[color-mix(in_srgb,var(--text)_30%,transparent)] capitalize tracking-widest truncate mb-2">
                                              {flavor.master_author || mod.master_author || "Unknown Creator"}{(flavor.latest_version || flavor.version) ? ` • ${flavor.latest_version || flavor.version}` : ""}
                                            </p>
                                            <div className="flex flex-wrap items-center gap-1.5 mt-1 mb-2">
                                              <div className={chipClass}>
                                                <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                                                  {flavorIsScript ? t("icon_terminal", "terminal") : t("icon_deployed_code", "deployed_code")}
                                                </span>
                                                <span className="text-[var(--subtext)]">
                                                  {flavorIsScript ? t("type_script", "Script") : t("type_package", "Module")}
                                                </span>
                                              </div>
                                            </div>
                                            {!isDesktop() && (
                                              <div className="mt-auto pt-2 flex justify-end">
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    const wasStaged = stagedModKeys.has(String(flavor.id)) || (flavor.hash && stagedModKeys.has(String(flavor.hash)));
                                                    toggleModInStagingDraft(flavor);
                                                    onSetStatus(wasStaged ? t("status_staging_item_removed", "Removed from Remote Staging Queue.") : t("status_staging_item_added", "Added to Remote Staging Queue."));
                                                  }}
                                                  className={`px-2.5 py-1 rounded-lg border text-[8px] font-black uppercase tracking-widest flex items-center gap-1 transition-all ${
                                                    (stagedModKeys.has(String(flavor.id)) || (flavor.hash && stagedModKeys.has(String(flavor.hash))))
                                                      ? 'sa-glass-active text-[var(--accent)]'
                                                      : 'glass-surface border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)]'
                                                  }`}
                                                >
                                                  <span className="material-symbols-outlined !text-[12px]">
                                                    {(stagedModKeys.has(String(flavor.id)) || (flavor.hash && stagedModKeys.has(String(flavor.hash))))
                                                      ? t("icon_playlist_add_check", "playlist_add_check")
                                                      : t("icon_playlist_add", "playlist_add")}
                                                  </span>
                                                  <span>
                                                    {(stagedModKeys.has(String(flavor.id)) || (flavor.hash && stagedModKeys.has(String(flavor.hash))))
                                                      ? t("staging_btn_staged", "Staged")
                                                      : t("staging_btn_stage_mod", "Stage to PC")}
                                                  </span>
                                                </button>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                </div>
                              </DeferredRender>
                            </div>
                          </div>
                        </AccordionDrawer>
                      </React.Fragment>
                    );
                  })}
                </>
              ) : (() => {
                const isHiddenOnlyByInstalled =
                  hideInstalled &&
                  results.length > 0 &&
                  !searchQuery.trim() &&
                  (categoryFilter === "ALL" || categoryFilter === t("filter_all", "All")) &&
                  (selectedGameVersion === "all" || selectedGameVersion === (selectedVersion || "all")) &&
                  dlcFilter === "all" &&
                  !hidePaid &&
                  !hideEarlyAccess &&
                  !hideMissingDLC;
                const showInstalledAction =
                  hideInstalled && results.length > 0 ? (
                    <ActionButton
                      variant={isHiddenOnlyByInstalled ? "accent" : "default"}
                      icon={t("icon_visibility", "visibility")}
                      label={t("nexus_show_installed", "Show Installed")}
                      onClick={() => {
                        setHideInstalled(false);
                        localStorage.setItem('sanctuary_hide_installed_assets', 'false');
                        setCurrentPage(1);
                      }}
                    />
                  ) : undefined;
                return (
                  <EmptyState
                    icon={
                      isHiddenOnlyByInstalled
                        ? t("icon_hub", "hub")
                        : t("icon_search_off", "search_off")
                    }
                    title={
                      isHiddenOnlyByInstalled
                        ? t("nexus_empty_installed_title", "No new {mods} detected.")
                        : t("no_matches_found", "No matching {mods} found.")
                    }
                    subtitle={
                      isHiddenOnlyByInstalled
                        ? t("empty_desc", "Everything in The {Nexus} is already in Your {Vault}.")
                        : t("nexus_no_matches_desc", "Try adjusting your search or filter options.")
                    }
                    action={showInstalledAction}
                    className="col-span-full py-16"
                  />
                );
              })()}
            </div>

            {totalPages > 1 && !loadingMods && (
              <div className="flex justify-center items-center gap-4 mt-4 mb-20">
                <button
                  onClick={() => setCurrentPage((p: any) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-6 py-3 glass-surface rounded-xl font-black text-[10px] capitalize tracking-widest disabled:opacity-30 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:theme-border-accent"
                >
                  {t("nav_prev", "PREV")}
                </button>
                <span className="text-[12px] font-black capitalize tracking-widest text-[var(--subtext)] px-4">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p: any) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-6 py-3 glass-surface rounded-xl font-black text-[10px] capitalize tracking-widest disabled:opacity-30 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:theme-border-accent"
                >
                  {t("nav_next", "NEXT")}
                </button>
              </div>
            )}
          </>
        </div>
    </>
  );
}
