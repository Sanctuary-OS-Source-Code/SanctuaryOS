import { supabase } from "../../supabase";
import {
  HoverTooltip,
  EmptyState,
  countBlueprintArtifacts,
} from "../../shared";
import { useStore } from "../../store";
import {
  MarketUploadPanel,
  MarketReportPanel,
  MarketBlueprintPanel,
} from '../../side-panels/NexusSidePanels';
import { isDesktop } from "../../utils/envUtils";
import BlueprintMatrix from "../../views/BlueprintMatrix";
import AssetPreviewSidebar from "../../side-panels/AssetPreviewSidebar";
import {
  DynamicThemePreviewBanner,
  DynamicLexiconPreviewBanner,
  DynamicBlueprintPreviewBanner,
  DynamicTemplatePreviewBanner,
  resolveThemePreviewData,
} from "../../chameleon-components/ThemeCard";
import { getLuminance } from "../../chameleon-components/ChameleonShared";

export function NexusAssetTabs({
  onOpenDossier,
  onOpenMasonProfile,
  onSetStatus,
  t,
  importLexicon,
  previewLexiconId,
  startLexiconPreview,
  stopLexiconPreview,
  session,
  marketTab,
  canPublishNexusAssets,
  showImages,
  playSets,
  importTheme,
  previewThemeId,
  startThemePreview,
  stopThemePreview,
  setAssetResultsMap,
  setSelectedBlueprint,
  setPreviewAsset,
  toggleModInStagingDraft,
  stageBlueprintToDraft,
  stagedModKeys,
  loadingAssets,
  setCurrentPage,
  currentPage,
  setInstalledTemplates,
  masonMap,
  handleEditAsset,
  isInstalled,
  getAssetDisplayVersion,
  isOutdated,
  importTemplate,
  assetTotalPages,
  assetPaginatedResults,
  handleNexusAssetContextMenu,
}: any) {
  return (
        <div className={['BLUEPRINTS', 'LEXICONS', 'CHAMELEONS', 'TEMPLATES'].includes(marketTab) ? 'flex-1 flex flex-col relative' : 'hidden'}>
          <div className="flex flex-col">
            {/*  removed in favor of ViewHeader filters */}

            <div className="grid grid-flow-row-dense grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6 pb-8 mt-6">
              {loadingAssets ? (
                <EmptyState
                  icon={t("icon_sync", "sync")}
                  title={t("searching", "Searching The {Nexus}...")}
                  className="col-span-full"
                />
              ) : assetPaginatedResults.length > 0 ? (
                assetPaginatedResults.map((asset: any, index: number) => (
                  <div
                    key={asset.id || `${asset.name}_${index}`}
                    onClick={() => {
                      if (marketTab === 'BLUEPRINTS') setSelectedBlueprint(asset);
                      else if (marketTab === 'LEXICONS') setPreviewAsset({ id: asset.id, type: 'lexicon' });
                      else if (marketTab === 'CHAMELEONS') setPreviewAsset({ id: asset.id, type: 'chameleon' });
                      else if (marketTab === 'TEMPLATES') setPreviewAsset({ id: asset.id, type: 'workbench_template' });
                      else if (onOpenDossier) onOpenDossier({ ...asset, isNexusView: true });
                    }}
                    onContextMenu={(e) => handleNexusAssetContextMenu(e, asset, marketTab)}
                    className="relative flex flex-col h-full glass-panel rounded-2xl transition-colors duration-300 shadow-xl hover:shadow-2xl cursor-pointer hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] group"
                  >
                    <div
                      className="relative z-20 h-32 border-b border-[color-mix(in_srgb,var(--text)_5%,rgba(255,255,255,0.14))] shrink-0 flex items-center justify-center transition-colors duration-500 overflow-hidden"
                      style={{ borderTopLeftRadius: 'inherit', borderTopRightRadius: 'inherit', background: 'var(--glass-card-banner-bg)' }}
                    >
                      <div className="absolute top-3 left-3 z-30">
                        <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                          <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                            {t("icon_cloud_done", "cloud_done")}
                          </span>
                          <span>{t("synced_badge", "Synced")}</span>
                        </div>
                      </div>
                      {marketTab === 'CHAMELEONS' ? (
                        <div className="w-full h-full">
                          <DynamicThemePreviewBanner
                            data={{ ...asset, ...(typeof asset.json_data === 'object' ? asset.json_data : {}), name: asset.name, previewImage: showImages !== false ? (asset.image_url || asset.json_data?.previewImage) : undefined }}
                            heightClass="h-full"
                          />
                        </div>
                      ) : marketTab === 'LEXICONS' ? (
                        <div className="w-full h-full">
                          <DynamicLexiconPreviewBanner data={asset} heightClass="h-full" />
                        </div>
                      ) : marketTab === 'BLUEPRINTS' ? (
                        <div className="w-full h-full">
                          <DynamicBlueprintPreviewBanner data={asset} heightClass="h-full" />
                        </div>
                      ) : marketTab === 'TEMPLATES' ? (
                        <div className="w-full h-full">
                          <DynamicTemplatePreviewBanner data={asset} heightClass="h-full" />
                        </div>
                      ) : (
                        <div
                          className="w-16 h-16 rounded-2xl border flex items-center justify-center transition-all duration-500 group-hover:scale-105"
                          style={{
                            backgroundColor: 'var(--glass-card-icon-bg)',
                            borderColor: 'var(--glass-card-icon-border)',
                            boxShadow: 'var(--glass-card-icon-shadow)',
                          }}
                        >
                          <span className="material-symbols-outlined !text-[34px] text-[var(--text)] opacity-85 group-hover:opacity-100 group-hover:text-[var(--accent)] transition-all duration-500 drop-shadow-sm">
                            {marketTab === 'BLUEPRINTS' ? t("icon_map", "map") : marketTab === 'TEMPLATES' ? t("icon_draw", "draw") : t("icon_translate", "translate")}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="p-5 flex flex-col flex-1">
                      <h3 className="text-[15px] font-bold truncate capitalize tracking-tight group-hover:theme-text-accent transition-colors mb-1">
                        {asset.name}
                      </h3>
                      {masonMap[asset.author?.toLowerCase()] ? (
                        <p
                          onClick={(e) => { e.stopPropagation(); onOpenMasonProfile?.(masonMap[asset.author.toLowerCase()]); }}
                          className="text-[9px] font-black text-[color-mix(in_srgb,var(--text)_30%,transparent)] capitalize tracking-widest truncate mb-2 cursor-pointer hover:underline hover:text-[var(--text)] transition-colors"
                        >
                          {asset.author} • v{String(getAssetDisplayVersion(asset) || '1.0.0').replace(/^v/i, '')}
                        </p>
                      ) : (
                        <p className="text-[9px] font-black text-[color-mix(in_srgb,var(--text)_30%,transparent)] capitalize tracking-widest truncate mb-2">
                          {asset.author || "Citizen"} • v{String(getAssetDisplayVersion(asset) || '1.0.0').replace(/^v/i, '')}
                        </p>
                      )}

                      {asset.description && !/^(language|theme)\s+pack:/i.test(String(asset.description).trim()) && (
                        <p className="text-[10px] text-[var(--subtext)] opacity-75 line-clamp-2 leading-relaxed mb-3">
                          {asset.description}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-1.5 mt-auto pt-1 pb-3">
                        {marketTab === 'CHAMELEONS' && (() => {
                          const resolvedTheme = resolveThemePreviewData(asset);
                          const isDark = getLuminance(resolvedTheme?.bg || '#060b14') < 0.5;
                          return (
                            <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                {isDark ? t("icon_dark_mode", "dark_mode") : t("icon_light_mode", "light_mode")}
                              </span>
                              <span>{isDark ? t("mode_dark", "Dark") : t("mode_light", "Light")}</span>
                            </div>
                          );
                        })()}

                        {marketTab === 'LEXICONS' && (
                          <>
                            <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                {t("icon_language", "language")}
                              </span>
                              <span>{asset.language || "English"}</span>
                            </div>
                            {asset.lexicon_type && (
                              <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                                <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                                  {t("icon_translate", "translate")}
                                </span>
                                <span>
                                  {asset.lexicon_type === "Theme"
                                    ? t("lexicon_type_thematic", "Thematic")
                                    : asset.lexicon_type === "Default"
                                      ? t("lexicon_type_standard", "Standard")
                                      : asset.lexicon_type}
                                </span>
                              </div>
                            )}
                          </>
                        )}

                        {marketTab === 'BLUEPRINTS' && countBlueprintArtifacts(asset.json_data?.artifacts) > 0 && (
                          <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                              {t("icon_account_tree", "account_tree")}
                            </span>
                            <span>
                              +{countBlueprintArtifacts(asset.json_data?.artifacts)} {t("badge_modules_count", "Modules")}
                            </span>
                          </div>
                        )}

                        {marketTab === 'TEMPLATES' && (() => {
                          const parsedTpl = (() => {
                            try {
                              const raw = typeof asset.json_data === 'string' ? JSON.parse(asset.json_data) : (asset.json_data || asset);
                              return Array.isArray(raw) ? raw[0] || {} : raw || {};
                            } catch {
                              return {};
                            }
                          })();
                          const targetFile = String(parsedTpl?.target_file || asset.name || 'settings.cfg').split(/[\\/]/).pop();
                          return (
                            <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                              <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                                {t("icon_tune", "tune")}
                              </span>
                              <span>{targetFile}</span>
                            </div>
                          );
                        })()}

                        {asset.is_early_access && (
                          <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                              {t("icon_science", "science")}
                            </span>
                            <span>{t("badge_early_access", "Early Access")}</span>
                          </div>
                        )}

                        {asset.is_paid && (
                          <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                            <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                              {t("icon_monetization_on", "monetization_on")}
                            </span>
                            <span>{t("badge_paid", "Paid")}</span>
                          </div>
                        )}
                      </div>

                      <div className="pt-3.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 relative z-10 pointer-events-auto">
                        <div className="flex items-center gap-2.5 text-[9px] font-bold text-[var(--subtext)] opacity-65 tracking-wider whitespace-nowrap min-w-0 truncate">
                          <span className="inline-flex items-center gap-1">
                            <span className="material-symbols-outlined !text-[12px] opacity-75">{t("icon_calendar", "event")}</span>
                            {asset.created_at
                              ? new Date(asset.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                              : t("date_unknown", "Unknown Date")}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <span className="material-symbols-outlined !text-[12px] opacity-75">{t("icon_download", "download")}</span>
                            {asset.downloads || 0}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {(session?.user?.id &&
                            (String(asset.author_id || asset.mason_id || "") === String(session.user.id) ||
                              session?.user?.user_metadata?.username === asset.author) &&
                            (marketTab === 'BLUEPRINTS' || canPublishNexusAssets)) && (
                            <button
                              type="button"
                              onClick={(e) => handleEditAsset(e, asset)}
                              className="relative group/editbtn w-8 h-8 rounded-xl border flex items-center justify-center transition-all glass-surface border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] cursor-pointer shrink-0"
                            >
                              <span className="material-symbols-outlined !text-[14px]">
                                {t("icon_edit", "edit")}
                              </span>
                              <HoverTooltip title={t("edit", "Edit")} className="group-hover/editbtn:flex z-[200]" />
                            </button>
                          )}
                          {(marketTab === 'CHAMELEONS' || marketTab === 'LEXICONS') && (() => {
                            const isPreviewingThis =
                              marketTab === 'CHAMELEONS'
                                ? String(previewThemeId || '') === String(asset.id)
                                : String(previewLexiconId || '') === String(asset.id);
                            return (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isPreviewingThis) {
                                    if (marketTab === 'CHAMELEONS') stopThemePreview();
                                    else stopLexiconPreview();
                                    onSetStatus(
                                      t(
                                        "status_preview_stopped",
                                        "Preview stopped — restored your active settings."
                                      )
                                    );
                                  } else {
                                    if (marketTab === 'CHAMELEONS') {
                                      startThemePreview(String(asset.id), asset.name, asset);
                                    } else {
                                      startLexiconPreview(String(asset.id), asset.name, asset);
                                    }
                                    onSetStatus(
                                      t(
                                        "status_previewing_asset",
                                        "Previewing {0} — click Stop Preview or Install when done."
                                      ).replace("{0}", asset.name || "")
                                    );
                                  }
                                }}
                                className={`relative group/prevbtn w-8 h-8 rounded-xl border flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                                  isPreviewingThis
                                    ? 'sa-glass-active text-[var(--accent)]'
                                    : 'glass-surface border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)]'
                                }`}
                              >
                                <span className="material-symbols-outlined !text-[14px]">
                                  {isPreviewingThis
                                    ? t("icon_visibility_off", "visibility_off")
                                    : t("icon_visibility", "visibility")}
                                </span>
                                <HoverTooltip
                                  title={
                                    isPreviewingThis
                                      ? t("btn_stop_preview", "Stop Preview")
                                      : t("preview", "Preview")
                                  }
                                  className="group-hover/prevbtn:flex z-[200]"
                                />
                              </button>
                            );
                          })()}
                          {marketTab === 'BLUEPRINTS' ? (() => {
                            const isInstalledBp = playSets.some((p: any) => p.code && asset.json_data?.code && p.code === asset.json_data.code);
                            if (!isDesktop()) {
                              return (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    stageBlueprintToDraft(asset);
                                    onSetStatus(t("status_staging_blueprint_loaded", "Blueprint loaded into Payload Editor."));
                                    useStore.getState().setView('playsets');
                                  }}
                                  className="h-8 px-3 rounded-xl border text-[9.5px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 whitespace-nowrap transition-all glass-surface border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] cursor-pointer"
                                >
                                  <span className="material-symbols-outlined !text-[14px]">
                                    {t("icon_phonelink", "phonelink")}
                                  </span>
                                  <span>{t("nexus_btn_stage_compact", "Stage to Desktop")}</span>
                                </button>
                              );
                            }
                            return (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedBlueprint(asset);
                                }}
                                className={`h-8 px-3 rounded-xl border text-[9.5px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
                                  isInstalledBp
                                    ? 'glass-surface border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)]'
                                    : 'glass-surface border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)]'
                                }`}
                              >
                                <span className="material-symbols-outlined !text-[14px]">
                                  {t("icon_download", "download")}
                                </span>
                                <span>
                                  {isInstalledBp ? t("btn_install_copy", "Install Copy") : t("update_panel_install", "Install")}
                                </span>
                              </button>
                            );
                          })() : (() => {
                            const assetTypeKey = marketTab === 'LEXICONS' ? 'lexicon' : marketTab === 'CHAMELEONS' ? 'chameleon' : 'workbench_template';
                            const assetStagingId = `asset_${assetTypeKey}_${asset.id}`;
                            const isAssetStaged = stagedModKeys.has(assetStagingId.toLowerCase());

                            if (!isDesktop()) {
                              if (marketTab === 'TEMPLATES') {
                                return (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleModInStagingDraft({
                                        ...asset,
                                        asset_type: assetTypeKey,
                                        asset_id: asset.id,
                                      });
                                      onSetStatus(
                                        isAssetStaged
                                          ? t("status_staging_item_removed", "Removed from Remote Staging Queue.")
                                          : t("status_staging_item_added", "Added to Remote Staging Queue.")
                                      );
                                    }}
                                    className={`h-8 px-3 rounded-xl border text-[9.5px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
                                      isAssetStaged
                                        ? 'sa-glass-active text-[var(--accent)]'
                                        : 'glass-surface border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)]'
                                    }`}
                                  >
                                    <span className="material-symbols-outlined !text-[14px]">
                                      {isAssetStaged ? t("icon_playlist_add_check", "playlist_add_check") : t("icon_playlist_add", "playlist_add")}
                                    </span>
                                    <span>
                                      {isAssetStaged ? t("staging_btn_staged", "Staged") : t("nexus_btn_stage_compact", "Stage to Desktop")}
                                    </span>
                                  </button>
                                );
                              }

                              // Web / Mobile PWA unified action for Lexicons & Chameleons: Apply locally AND stage to Desktop Queue
                              return (
                                <button
                                  type="button"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (isAssetStaged) {
                                      toggleModInStagingDraft({
                                        ...asset,
                                        asset_type: assetTypeKey,
                                        asset_id: asset.id,
                                      });
                                      onSetStatus(t("status_staging_item_removed", "Removed from Remote Staging Queue."));
                                      return;
                                    }

                                    const parsedData = typeof asset.json_data === 'string' ? JSON.parse(asset.json_data) : (asset.json_data || {});
                                    if (marketTab === 'CHAMELEONS') {
                                      importTheme({
                                        ...parsedData,
                                        name: asset.name || parsedData.name || "Chameleon",
                                        version: asset.version || parsedData.version || '1.0.0',
                                        author: asset.author || parsedData.author || "Citizen",
                                        _meta_version: asset.version || parsedData._meta_version || '1.0.0',
                                      });
                                    } else {
                                      importLexicon(
                                        {
                                          ...parsedData,
                                          _meta_language: asset.language || "Custom",
                                          _meta_version: asset.version || '1.0.0',
                                        },
                                        asset.name
                                      );
                                    }

                                    toggleModInStagingDraft({
                                      ...asset,
                                      asset_type: assetTypeKey,
                                      asset_id: asset.id,
                                    });
                                    onSetStatus(t("status_staging_applied_and_queued", "Applied locally & added to Desktop Staging Queue."));

                                    try {
                                      await supabase.rpc('increment_asset_downloads', { asset_id: asset.id });
                                    } catch (err) {
                                      console.error("Could not increment downloads", err);
                                    }
                                    setAssetResultsMap((prev: any) => {
                                      const newMap = { ...prev, [marketTab]: (prev[marketTab] || []).map((a: any) => a.id === asset.id ? { ...a, downloads: (a.downloads || 0) + 1 } : a) };
                                      if (window.__sanctuaryCache!.nexus) window.__sanctuaryCache!.nexus.assetResultsMap = newMap;
                                      return newMap;
                                    });
                                  }}
                                  className={`h-8 px-3 rounded-xl border text-[9.5px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
                                    isAssetStaged
                                      ? 'sa-glass-active text-[var(--accent)]'
                                      : 'glass-surface border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)]'
                                  }`}
                                >
                                  <span className="material-symbols-outlined !text-[14px]">
                                    {isAssetStaged
                                      ? t("icon_playlist_add_check", "playlist_add_check")
                                      : isInstalled(asset) && isOutdated(asset)
                                        ? t("icon_update", "update")
                                        : t("icon_download", "download")}
                                  </span>
                                  <span>
                                    {isAssetStaged
                                      ? t("staging_btn_staged", "Staged")
                                      : isInstalled(asset) && isOutdated(asset)
                                        ? t("btn_update", "Update")
                                        : t("nexus_btn_stage_apply_compact", "Apply & Stage")}
                                  </span>
                                </button>
                              );
                            }

                            return (
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (marketTab === 'CHAMELEONS') {
                                    const parsedData = typeof asset.json_data === 'string' ? JSON.parse(asset.json_data) : (asset.json_data || {});
                                    importTheme({
                                      ...parsedData,
                                      name: asset.name || parsedData.name || "Chameleon",
                                      version: asset.version || parsedData.version || '1.0.0',
                                      author: asset.author || parsedData.author || "Citizen",
                                      _meta_version: asset.version || parsedData._meta_version || '1.0.0',
                                    });
                                    onSetStatus(`Successfully Installed Theme: ${asset.name}`);
                                  } else if (marketTab === 'TEMPLATES') {
                                    const parsedData = typeof asset.json_data === 'string' ? JSON.parse(asset.json_data) : asset.json_data;
                                    const versionToSave = getAssetDisplayVersion(asset);
                                    await importTemplate({ ...parsedData, version: versionToSave });
                                    setInstalledTemplates((prev: any) => ({ ...prev, [asset.name]: versionToSave }));
                                    onSetStatus(`Successfully Installed Template: ${asset.name}`);
                                  } else {
                                    const parsedData = typeof asset.json_data === 'string' ? JSON.parse(asset.json_data) : asset.json_data;
                                    importLexicon({ ...parsedData, _meta_language: asset.language || "Custom", _meta_version: asset.version || '1.0.0' }, asset.name);
                                    onSetStatus(`Successfully Installed Lexicon: ${asset.name}`);
                                  }
                                  try {
                                    await supabase.rpc('increment_asset_downloads', { asset_id: asset.id });
                                  } catch (e) { console.error("Could not increment downloads", e); }
                                  setAssetResultsMap((prev: any) => {
                                    const newMap = { ...prev, [marketTab]: (prev[marketTab] || []).map((a: any) => a.id === asset.id ? { ...a, downloads: (a.downloads || 0) + 1 } : a) };
                                    if (window.__sanctuaryCache!.nexus) window.__sanctuaryCache!.nexus.assetResultsMap = newMap;
                                    return newMap;
                                  });
                                }}
                                className={`h-8 px-3 rounded-xl border text-[9.5px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
                                  isInstalled(asset) && !isOutdated(asset)
                                    ? 'glass-surface border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)]'
                                    : 'glass-surface border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)]'
                                }`}
                              >
                                <span className="material-symbols-outlined !text-[14px]">
                                  {isInstalled(asset) ? (isOutdated(asset) ? t("icon_update", "update") : t("icon_refresh", "refresh")) : t("icon_download", "download")}
                                </span>
                                <span>
                                  {isInstalled(asset) ? (isOutdated(asset) ? t("btn_update", "Update") : t("btn_reinstall", "Reinstall")) : t("update_panel_install", "Install")}
                                </span>
                              </button>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState
                  icon={
                    marketTab === 'BLUEPRINTS'
                      ? t("icon_map", "map")
                      : marketTab === 'TEMPLATES'
                        ? t("icon_draw", "draw")
                        : t("icon_palette", "palette")
                  }
                  title={
                    marketTab === 'CHAMELEONS'
                      ? t("empty_title_chameleons", "No {Chameleon} found.")
                      : marketTab === 'TEMPLATES'
                        ? t("empty_title_templates", "No Templates Found")
                        : marketTab === 'BLUEPRINTS'
                          ? t("bp_no_blueprints_found", "No {Blueprints} Found")
                          : t("empty_title_lexicons", "No {Lexicons} found.")
                  }
                  subtitle={t("empty_desc", "Everything in The {Nexus} is already in Your {Vault}.")}
                  className="col-span-full py-16"
                />
              )}
            </div>

            {assetTotalPages > 1 && !loadingAssets && (
              <div className="flex justify-center items-center gap-4 mt-4 mb-20">
                <button
                  onClick={() => setCurrentPage((p: any) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-6 py-3 glass-surface rounded-xl font-black text-[10px] capitalize tracking-widest disabled:opacity-30 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:theme-border-accent"
                >
                  {t("nav_prev", "PREV")}
                </button>
                <span className="text-[12px] font-black capitalize tracking-widest text-[var(--subtext)] px-4">
                  {currentPage} / {assetTotalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p: any) => Math.min(assetTotalPages, p + 1))}
                  disabled={currentPage === assetTotalPages}
                  className="px-6 py-3 glass-surface rounded-xl font-black text-[10px] capitalize tracking-widest disabled:opacity-30 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:theme-border-accent"
                >
                  {t("nav_next", "NEXT")}
                </button>
              </div>
            )}
          </div>
        </div>
  );
}

export function NexusModals({
  cleanModName,
  onOpenDossier,
  syncBlueprintByCode,
  marketTab,
  setAssetResultsMap,
  selectedBlueprint,
  setSelectedBlueprint,
  previewAsset,
  setPreviewAsset,
  availableLanguages,
  uploadState,
  setUploadState,
  reportState,
  setReportState,
  matrixBlueprintAsset,
  setMatrixBlueprintAsset,
  fetchNexusAssets,
  submitUpload,
  handleReportSubmit,
}: any) {
  return (
    <>
      <MarketUploadPanel
        uploadState={uploadState}
        setUploadState={setUploadState}
        marketTab={marketTab}
        availableLanguages={availableLanguages}
        submitUpload={submitUpload}
      />

      <MarketReportPanel
        reportState={reportState}
        setReportState={setReportState}
        handleReportSubmit={handleReportSubmit}
      />
      <MarketBlueprintPanel
        selectedBlueprint={selectedBlueprint}
        setSelectedBlueprint={setSelectedBlueprint}
        onOpenDossier={onOpenDossier}
        cleanModName={cleanModName}
        syncBlueprintByCode={syncBlueprintByCode}
        onReportBlueprint={(bpId: string) => {
          setSelectedBlueprint(null);
          setReportState({
            isOpen: true,
            assetId: bpId,
            assetType: "blueprint",
            reason: "",
            complianceTier: 1,
          });
        }}
        onDownloadSuccess={(id: any) => setAssetResultsMap((prev: any) => {
          const newMap = { ...prev, [marketTab]: (prev[marketTab] || []).map((a: any) => a.id === id ? { ...a, downloads: (a.downloads || 0) + 1 } : a) };
          if (window.__sanctuaryCache!.nexus) window.__sanctuaryCache!.nexus.assetResultsMap = newMap;
          return newMap;
        })}
      />

      {matrixBlueprintAsset && (
        <BlueprintMatrix
          isOpen={true}
          onClose={() => setMatrixBlueprintAsset(null)}
          playSet={{
            ...matrixBlueprintAsset.json_data,
            mods: matrixBlueprintAsset.json_data?.artifacts?.map((a: any) => a.name) || matrixBlueprintAsset.json_data?.mods || [],
            name: matrixBlueprintAsset.name,
            code: matrixBlueprintAsset.json_data?.code || matrixBlueprintAsset.code
          }}
          modList={useStore.getState().modList}
          onUpload={async (isPublic: boolean, _isLocked: boolean, _allowedMods: any[], isMarketListed: boolean) => {
            try {
              const { error } = await supabase.from('blueprints').update({
                is_public: isPublic,
                is_locked: false,
                is_market_listed: isPublic ? isMarketListed : false
              }).eq('id', matrixBlueprintAsset.id);
              if (error) throw error;
              fetchNexusAssets();
              return matrixBlueprintAsset.json_data?.code || matrixBlueprintAsset.code || "UPDATED";
            } catch (err) {
              console.error(err);
              return null;
            }
          }}
          onUpdatePlaySet={() => { }}
        />
      )}

      {previewAsset && (
        <AssetPreviewSidebar
          assetType={previewAsset.type}
          assetId={previewAsset.id}
          onClose={() => setPreviewAsset(null)}
          onFlag={(id, type) => {
            setPreviewAsset(null);
            const raw = String(id || "");
            const isCol = type === "collection" || raw.startsWith("collection_");
            setReportState({
              isOpen: true,
              assetId: raw.replace(/^collection_/, ""),
              assetType: isCol ? "collection" : type,
              reason: "",
              complianceTier: 1,
            });
          }}
        />
      )}
    </>
  );
}
