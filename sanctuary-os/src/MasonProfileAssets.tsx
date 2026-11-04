import { stripMarkdown, EmptyState, ActionButton, formatDisplayName } from './shared';
import { UniversalCard } from './components/universal/UniversalCard';
import {
  DynamicThemePreviewBanner,
  DynamicLexiconPreviewBanner,
  DynamicBlueprintPreviewBanner,
  DynamicTemplatePreviewBanner,
} from './chameleon-components/ThemeCard';
import { openSanctuaryContextMenu } from './ContextMenu';

export default function MasonProfileAssets({ 
  activeView, 
  marketAssets, 
  modSearch, 
  modCategory, 
  mason, 
  setSelectedBlueprint, 
  setActiveAsset, 
  isInstalled, 
  isOutdated, 
  importLexicon, 
  importTheme, 
  vaultPath, 
  exists, 
  importFs, 
  setInstalledTemplates, 
  getAssetDisplayVersion, 
  useStore, 
  t,
  hidePaid,
  hideEarlyAccess,
  isSidePanel
}: any) {
  const showImages = useStore((state: any) => state.showImages);
  const gridColsClass = isSidePanel
    ? "grid grid-cols-1 sm:grid-cols-2 gap-4"
    : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6";
  const glassBadgeBase =
    "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

  if (activeView === 'BLUEPRINTS') {
    const filteredBlueprints = marketAssets
      .filter((a: any) => {
        if (a.asset_type !== 'blueprint') return false;
        if (hidePaid && a.is_paid) return false;
        if (hideEarlyAccess && a.is_early_access) return false;
        if (modSearch && !a.name.toLowerCase().includes(modSearch.toLowerCase())) return false;
        if (modCategory && modCategory !== 'ALL' && modCategory !== 'all') {
          if (a.json_data?.game_version !== modCategory) return false;
        }
        return true;
      })
      .sort((a: any, b: any) => {
        const aPin = mason?.pinned_blueprint_id === a?.id ? 1 : 0;
        const bPin = mason?.pinned_blueprint_id === b?.id ? 1 : 0;
        return bPin - aPin;
      });
    return (
      <>
        {filteredBlueprints.length === 0 && <EmptyState icon={t("icon_map", "map")} title={t("no_blueprints", "No {blueprints} found.")} minHeightClass="min-h-[400px]" />}
        <div className={gridColsClass}>
          {filteredBlueprints.map((asset: any) => {
            const isPinned = mason?.pinned_blueprint_id === asset.id;
            return (
              <UniversalCard
                key={asset.id}
                layout="vertical"
                image={showImages !== false && asset.image_url ? asset.image_url : undefined}
                icon={!asset.image_url ? t("icon_map", "map") : undefined}
                customIcon={<DynamicBlueprintPreviewBanner data={asset} heightClass="h-full" />}
                title={formatDisplayName(asset.name) || asset.name}
                subtitle={`${mason.name || t("unknown_mason", "Unknown {Mason}")}`}
                onClick={() => setSelectedBlueprint(asset)}
                onContextMenu={(e) => {
                  openSanctuaryContextMenu(e, {
                    title: formatDisplayName(asset.name) || asset.name,
                    subtitle: mason.name || t("unknown_mason", "Unknown {Mason}"),
                    statusLabel: isPinned ? t("pinned", "Pinned") : t("blueprint", "{Blueprint}"),
                    icon: t("icon_map", "map"),
                    items: [
                      {
                        id: "inspect",
                        label: t("btn_view", "View"),
                        icon: t("icon_open_in_new", "open_in_new"),
                        variant: "accent",
                        onClick: () => setSelectedBlueprint(asset),
                      },
                    ],
                  });
                }}
                imageOverlay={
                  <div className="absolute top-3 left-3 z-30 flex items-center gap-1.5 pointer-events-none">
                    {isPinned ? (
                      <div className={glassBadgeBase}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{t("icon_push_pin", "push_pin")}</span>
                        <span>{t("pinned", "Pinned")}</span>
                      </div>
                    ) : (
                      <div className={glassBadgeBase}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">{t("icon_verified", "verified")}</span>
                        <span>{t("verified", "Verified")}</span>
                      </div>
                    )}
                  </div>
                }
                badges={
                  <>
                    <div className={glassBadgeBase}>
                      <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{t("icon_map", "map")}</span>
                      <span>{t("blueprint", "{Blueprint}")}</span>
                    </div>
                    {asset.is_early_access && (
                      <div className={glassBadgeBase}>
                        <span className="material-symbols-outlined !text-[12px] text-purple-400">{t("icon_science", "science")}</span>
                        <span>{t("badge_early_access", "Early Access")}</span>
                      </div>
                    )}
                    {asset.is_paid && (
                      <div className={glassBadgeBase}>
                        <span className="material-symbols-outlined !text-[12px] text-amber-400">{t("icon_monetization_on", "monetization_on")}</span>
                        <span>{t("badge_paid", "Paid")}</span>
                      </div>
                    )}
                  </>
                }
                className="w-full h-full"
                footer={
                  <div className="flex items-center justify-between w-full pt-1 gap-2">
                    <div className="flex items-center gap-1.5">
                      {(asset.json_data?.artifacts?.length || 0) > 0 && (
                        <div className={glassBadgeBase}>
                          <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{t("icon_account_tree", "account_tree")}</span>
                          <span>+{(asset.json_data?.artifacts?.length || 0)} {t("badge_modules_count", "Modules")}</span>
                        </div>
                      )}
                      <span className="text-[8px] font-mono text-[var(--subtext)] opacity-50 capitalize tracking-widest">{asset.downloads || 0} {t("sort_downloads", "DL")}</span>
                    </div>
                    <div className="flex gap-2 relative z-40">
                      <ActionButton
                        onClick={(e) => { e.stopPropagation(); setSelectedBlueprint(asset); }}
                        variant="primary"
                        icon={t("icon_visibility", "visibility")}
                        label={t("btn_view", "View")}
                        className="!py-1.5 !px-3 !text-[9px]"
                      />
                    </div>
                  </div>
                }
              >
                {asset.description && <p className="text-[10px] text-[var(--subtext)] opacity-70 line-clamp-2 leading-relaxed mb-1">{asset.description}</p>}
              </UniversalCard>
            );
          })}
        </div>
      </>
    );
  }

  if (activeView === 'LEXICONS') {
    const filteredLexicons = marketAssets.filter((a: any) => {
      if (a.asset_type !== 'lexicon') return false;
      let lang = a.language;
      if (!lang && a.json_data) {
        try {
          const parsed = typeof a.json_data === 'string' ? JSON.parse(a.json_data) : a.json_data;
          lang = parsed.language;
        } catch (e) {}
      }
      lang = lang || "Custom";
      if (modCategory !== "ALL" && lang !== modCategory) return false;
      if (modSearch && !a.name.toLowerCase().includes(modSearch.toLowerCase())) return false;
      return true;
    }).sort((a: any, b: any) => {
      const aPin = mason?.pinned_asset_id === a?.id ? 1 : 0;
      const bPin = mason?.pinned_asset_id === b?.id ? 1 : 0;
      if (bPin !== aPin) return bPin - aPin;
      const aOutdated = isOutdated(a) ? 1 : 0;
      const bOutdated = isOutdated(b) ? 1 : 0;
      return bOutdated - aOutdated;
    });
    return (
      <>
        {filteredLexicons.length === 0 && <EmptyState icon={t("icon_translate", "translate")} title={t("no_lexicons", "No {lexicons} deployed.")} minHeightClass="min-h-[400px]" />}
        <div className={gridColsClass}>
          {filteredLexicons.map((asset: any) => {
            const isPinned = mason?.pinned_asset_id === asset.id;
            return (
              <UniversalCard
                key={asset.id}
                layout="vertical"
                image={showImages !== false && asset.image_url ? asset.image_url : undefined}
                icon={!asset.image_url ? t("icon_translate", "translate") : undefined}
                customIcon={<DynamicLexiconPreviewBanner data={asset} heightClass="h-full" />}
                title={formatDisplayName(asset.name) || asset.name}
                subtitle={mason.name || t("unknown_mason", "Unknown {Mason}")}
                onClick={() => setActiveAsset({ type: 'lexicon', id: asset.id })}
                onContextMenu={(e) => {
                  openSanctuaryContextMenu(e, {
                    title: formatDisplayName(asset.name) || asset.name,
                    subtitle: mason.name || t("unknown_mason", "Unknown {Mason}"),
                    statusLabel: asset.language || "Custom",
                    icon: t("icon_translate", "translate"),
                    items: [
                      {
                        id: "inspect",
                        label: t("btn_view", "View"),
                        icon: t("icon_open_in_new", "open_in_new"),
                        variant: "accent",
                        onClick: () => setActiveAsset({ type: 'lexicon', id: asset.id }),
                      },
                      {
                        id: "install",
                        label: isInstalled(asset)
                          ? isOutdated(asset)
                            ? t("btn_update", "Update")
                            : t("btn_reinstall", "Reinstall")
                          : t("update_panel_install", "Install"),
                        icon: isInstalled(asset)
                          ? isOutdated(asset)
                            ? t("icon_update", "update")
                            : t("icon_refresh", "refresh")
                          : t("icon_download", "download"),
                        variant: "success",
                        onClick: () => {
                          const parsed =
                            typeof asset.json_data === 'string'
                              ? JSON.parse(asset.json_data)
                              : asset.json_data;
                          importLexicon(asset.name, parsed);
                          if (parsed._meta_language)
                            localStorage.setItem("sanctuary_ui_language", parsed._meta_language);
                          if (parsed._meta_version)
                            localStorage.setItem(
                              `sanctuary_lexicon_version_${asset.name}`,
                              parsed._meta_version
                            );
                        },
                      },
                    ],
                  });
                }}
                imageOverlay={
                  <div className="absolute top-3 left-3 z-30 flex items-center gap-1.5 pointer-events-none">
                    {isPinned ? (
                      <div className={glassBadgeBase}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{t("icon_push_pin", "push_pin")}</span>
                        <span>{t("pinned", "Pinned")}</span>
                      </div>
                    ) : (
                      <div className={glassBadgeBase}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">{t("icon_verified", "verified")}</span>
                        <span>{t("verified", "Verified")}</span>
                      </div>
                    )}
                  </div>
                }
                badges={
                  <div className={glassBadgeBase}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{t("icon_translate", "translate")}</span>
                    <span>{t("auto_lexicon", "{Lexicon} -")} {asset.language || "Custom"}</span>
                  </div>
                }
                className="w-full h-full"
                footer={
                  <div className="flex items-center justify-between w-full pt-1">
                    <span className="text-[8px] font-mono text-[var(--subtext)] opacity-50 capitalize tracking-widest">{asset.downloads || 0} {t("sort_downloads", "DL")}</span>
                    <div className="flex gap-2 relative z-40">
                      <ActionButton
                        onClick={(e) => {
                          e.stopPropagation();
                          const parsed = typeof asset.json_data === 'string' ? JSON.parse(asset.json_data) : asset.json_data;
                          importLexicon(asset.name, parsed);
                          if (parsed._meta_language) localStorage.setItem("sanctuary_ui_language", parsed._meta_language);
                          if (parsed._meta_version) localStorage.setItem(`sanctuary_lexicon_version_${asset.name}`, parsed._meta_version);
                        }}
                        variant={isInstalled(asset) ? (isOutdated(asset) ? 'primary' : 'glass') : 'success'}
                        icon={isInstalled(asset) ? (isOutdated(asset) ? t("icon_update", "update") : t("icon_refresh", "refresh")) : t("icon_download", "download")}
                        label={isInstalled(asset) ? (isOutdated(asset) ? t("btn_update", "Update") : t("btn_reinstall", "Reinstall")) : t("update_panel_install", "Install")}
                        className="!py-1.5 !px-3 !text-[9px]"
                      />
                    </div>
                  </div>
                }
              >
                {asset.description && <p className="text-[10px] text-[var(--subtext)] opacity-70 line-clamp-2 leading-relaxed mb-1">{stripMarkdown(asset.description)}</p>}
              </UniversalCard>
            );
          })}
        </div>
      </>
    );
  }

  if (activeView === 'CHAMELEONS') {
    const filteredChameleons = marketAssets.filter((a: any) => {
      if (a.asset_type !== 'chameleon') return false;
      if (modCategory !== "ALL" && a.theme_mode !== modCategory) return false;
      if (modSearch && !a.name.toLowerCase().includes(modSearch.toLowerCase())) return false;
      return true;
    }).sort((a: any, b: any) => {
      const aPin = mason?.pinned_asset_id === a?.id ? 1 : 0;
      const bPin = mason?.pinned_asset_id === b?.id ? 1 : 0;
      if (bPin !== aPin) return bPin - aPin;
      const aOutdated = isOutdated(a) ? 1 : 0;
      const bOutdated = isOutdated(b) ? 1 : 0;
      return bOutdated - aOutdated;
    });
    return (
      <>
        {filteredChameleons.length === 0 && <EmptyState icon={t("icon_palette", "palette")} title={t("no_themes", "No Themes Found")} minHeightClass="min-h-[400px]" />}
        <div className={gridColsClass}>
          {filteredChameleons.map((asset: any) => {
            const isPinned = mason?.pinned_asset_id === asset.id;
            return (
              <UniversalCard
                key={asset.id}
                layout="vertical"
                image={showImages !== false && asset.image_url ? asset.image_url : undefined}
                icon={!asset.image_url ? t("icon_palette", "palette") : undefined}
                customIcon={
                  <DynamicThemePreviewBanner
                    data={{
                      ...asset,
                      ...(typeof asset.json_data === 'object' ? asset.json_data : {}),
                      name: asset.name,
                      previewImage: showImages !== false ? (asset.image_url || asset.json_data?.previewImage) : undefined,
                    }}
                    heightClass="h-full"
                  />
                }
                title={formatDisplayName(asset.name) || asset.name}
                subtitle={mason.name || t("unknown_mason", "Unknown {Mason}")}
                onClick={() => setActiveAsset({ type: 'chameleon', id: asset.id })}
                onContextMenu={(e) => {
                  openSanctuaryContextMenu(e, {
                    title: formatDisplayName(asset.name) || asset.name,
                    subtitle: mason.name || t("unknown_mason", "Unknown {Mason}"),
                    statusLabel: t("chameleon", "Chameleon"),
                    icon: t("icon_palette", "palette"),
                    items: [
                      {
                        id: "inspect",
                        label: t("btn_view", "View"),
                        icon: t("icon_open_in_new", "open_in_new"),
                        variant: "accent",
                        onClick: () => setActiveAsset({ type: 'chameleon', id: asset.id }),
                      },
                      {
                        id: "install",
                        label: isInstalled(asset)
                          ? isOutdated(asset)
                            ? t("btn_update", "Update")
                            : t("btn_reinstall", "Reinstall")
                          : t("update_panel_install", "Install"),
                        icon: isInstalled(asset)
                          ? isOutdated(asset)
                            ? t("icon_update", "update")
                            : t("icon_refresh", "refresh")
                          : t("icon_download", "download"),
                        variant: "success",
                        onClick: () => {
                          const parsed =
                            typeof asset.json_data === 'string'
                              ? JSON.parse(asset.json_data)
                              : asset.json_data;
                          importTheme(parsed.name || asset.name, parsed);
                          useStore
                            .getState()
                            .pushStatus(`Imported ${parsed.name || asset.name} from Cloud`);
                        },
                      },
                    ],
                  });
                }}
                imageOverlay={
                  <div className="absolute top-3 left-3 z-30 flex items-center gap-1.5 pointer-events-none">
                    {isPinned ? (
                      <div className={glassBadgeBase}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{t("icon_push_pin", "push_pin")}</span>
                        <span>{t("pinned", "Pinned")}</span>
                      </div>
                    ) : (
                      <div className={glassBadgeBase}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">{t("icon_verified", "verified")}</span>
                        <span>{t("verified", "Verified")}</span>
                      </div>
                    )}
                  </div>
                }
                badges={
                  <div className={glassBadgeBase}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{t("icon_palette", "palette")}</span>
                    <span>{t("chameleon", "Chameleon")}</span>
                  </div>
                }
                className="w-full h-full"
                footer={
                  <div className="flex items-center justify-between w-full pt-1">
                    <span className="text-[8px] font-mono text-[var(--subtext)] opacity-50 capitalize tracking-widest">{asset.downloads || 0} {t("sort_downloads", "DL")}</span>
                    <div className="flex gap-2 relative z-40">
                      <ActionButton
                        onClick={async (e) => {
                          e.stopPropagation();
                          const parsed = typeof asset.json_data === 'string' ? JSON.parse(asset.json_data) : asset.json_data;
                          importTheme(parsed.name || asset.name, parsed);
                          useStore.getState().pushStatus(`Imported ${parsed.name || asset.name} from Cloud`);
                        }}
                        variant={isInstalled(asset) ? (isOutdated(asset) ? 'primary' : 'glass') : 'success'}
                        icon={isInstalled(asset) ? (isOutdated(asset) ? t("icon_update", "update") : t("icon_refresh", "refresh")) : t("icon_download", "download")}
                        label={isInstalled(asset) ? (isOutdated(asset) ? t("btn_update", "Update") : t("btn_reinstall", "Reinstall")) : t("update_panel_install", "Install")}
                        className="!py-1.5 !px-3 !text-[9px]"
                      />
                    </div>
                  </div>
                }
              >
                {asset.description && <p className="text-[10px] text-[var(--subtext)] opacity-70 line-clamp-2 leading-relaxed mb-1">{stripMarkdown(asset.description)}</p>}
              </UniversalCard>
            );
          })}
        </div>
      </>
    );
  }

  if (activeView === 'TEMPLATES') {
    const filteredTemplates = marketAssets.filter((a: any) => {
      if (a.asset_type !== 'workbench_template') return false;
      if (modSearch && !a.name.toLowerCase().includes(modSearch.toLowerCase())) return false;
      return true;
    }).sort((a: any, b: any) => {
      const aPin = mason?.pinned_asset_id === a?.id ? 1 : 0;
      const bPin = mason?.pinned_asset_id === b?.id ? 1 : 0;
      if (bPin !== aPin) return bPin - aPin;
      const aOutdated = isOutdated(a) ? 1 : 0;
      const bOutdated = isOutdated(b) ? 1 : 0;
      return bOutdated - aOutdated;
    });
    return (
      <>
        {filteredTemplates.length === 0 && <EmptyState icon={t("icon_draw", "draw")} title={t("empty_title_templates", "No Templates Found")} minHeightClass="min-h-[400px]" />}
        <div className={gridColsClass}>
          {filteredTemplates.map((asset: any) => {
            const isPinned = mason?.pinned_asset_id === asset.id;
            return (
              <UniversalCard
                key={asset.id}
                layout="vertical"
                image={showImages !== false && asset.image_url ? asset.image_url : undefined}
                icon={!asset.image_url ? t("icon_draw", "draw") : undefined}
                customIcon={<DynamicTemplatePreviewBanner data={asset} heightClass="h-full" />}
                title={formatDisplayName(asset.name) || asset.name}
                subtitle={mason.name || t("unknown_mason", "Unknown {Mason}")}
                onClick={() => setActiveAsset({ type: 'workbench_template', id: asset.id })}
                onContextMenu={(e) => {
                  openSanctuaryContextMenu(e, {
                    title: formatDisplayName(asset.name) || asset.name,
                    subtitle: mason.name || t("unknown_mason", "Unknown {Mason}"),
                    statusLabel: t("workbench_template", "Template"),
                    icon: t("icon_draw", "draw"),
                    items: [
                      {
                        id: "inspect",
                        label: t("btn_view", "View"),
                        icon: t("icon_open_in_new", "open_in_new"),
                        variant: "accent",
                        onClick: () =>
                          setActiveAsset({ type: 'workbench_template', id: asset.id }),
                      },
                      {
                        id: "install",
                        label: isInstalled(asset)
                          ? isOutdated(asset)
                            ? t("btn_update", "Update")
                            : t("btn_reinstall", "Reinstall")
                          : t("update_panel_install", "Install"),
                        icon: isInstalled(asset)
                          ? isOutdated(asset)
                            ? t("icon_update", "update")
                            : t("icon_refresh", "refresh")
                          : t("icon_download", "download"),
                        variant: "success",
                        onClick: async () => {
                          const parsed =
                            typeof asset.json_data === 'string'
                              ? JSON.parse(asset.json_data)
                              : asset.json_data;
                          if (vaultPath) {
                            const templatesDir = `${vaultPath}\\Templates`;
                            if (!(await exists(templatesDir)))
                              await importFs.mkdir(templatesDir, { recursive: true });
                            await importFs.writeTextFile(
                              `${templatesDir}\\${asset.name}_template.json`,
                              JSON.stringify(parsed, null, 2)
                            );
                            useStore
                              .getState()
                              .pushStatus(`Successfully Installed Template: ${asset.name}`);
                            if (setInstalledTemplates) {
                              const entries = await importFs.readDir(templatesDir);
                              const tpls = await Promise.all(
                                entries
                                  .filter((en: any) => en.name?.endsWith('.json'))
                                  .map(async (en: any) => {
                                    const content = await importFs.readTextFile(
                                      `${templatesDir}\\${en.name}`
                                    );
                                    return JSON.parse(content);
                                  })
                              );
                              setInstalledTemplates(tpls);
                            }
                          }
                        },
                      },
                    ],
                  });
                }}
                imageOverlay={
                  <div className="absolute top-3 left-3 z-30 flex items-center gap-1.5 pointer-events-none">
                    {isPinned ? (
                      <div className={glassBadgeBase}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{t("icon_push_pin", "push_pin")}</span>
                        <span>{t("pinned", "Pinned")}</span>
                      </div>
                    ) : (
                      <div className={glassBadgeBase}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">{t("icon_verified", "verified")}</span>
                        <span>{t("verified", "Verified")}</span>
                      </div>
                    )}
                  </div>
                }
                badges={
                  <div className={glassBadgeBase}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{t("icon_draw", "draw")}</span>
                    <span>{t("workbench_template", "Template")}</span>
                  </div>
                }
                className="w-full h-full"
                footer={
                  <div className="flex items-center justify-between w-full pt-1">
                    <span className="text-[8px] font-mono text-[var(--subtext)] opacity-50 capitalize tracking-widest">{asset.downloads || 0} {t("sort_downloads", "DL")}</span>
                    <div className="flex gap-2 relative z-40">
                      <ActionButton
                        onClick={async (e) => {
                          e.stopPropagation();
                          const parsed = typeof asset.json_data === 'string' ? JSON.parse(asset.json_data) : asset.json_data;
                          if (vaultPath) {
                            const templatesDir = `${vaultPath}\\Templates`;
                            if (!(await exists(templatesDir))) await importFs.mkdir(templatesDir, { recursive: true });
                            await importFs.writeTextFile(`${templatesDir}\\${asset.name}_template.json`, JSON.stringify(parsed, null, 2));
                            useStore.getState().pushStatus(`Successfully Installed Template: ${asset.name}`);
                            
                            if (setInstalledTemplates) {
                              const entries = await importFs.readDir(templatesDir);
                              const tpls = await Promise.all(
                                entries.filter((en: any) => en.name?.endsWith('.json')).map(async (en: any) => {
                                  const content = await importFs.readTextFile(`${templatesDir}\\${en.name}`);
                                  return JSON.parse(content);
                                })
                              );
                              setInstalledTemplates(tpls);
                            }
                          }
                        }}
                        variant={isInstalled(asset) ? (isOutdated(asset) ? 'primary' : 'glass') : 'success'}
                        icon={isInstalled(asset) ? (isOutdated(asset) ? t("icon_update", "update") : t("icon_refresh", "refresh")) : t("icon_download", "download")}
                        label={isInstalled(asset) ? (isOutdated(asset) ? t("btn_update", "Update") : t("btn_reinstall", "Reinstall")) : t("update_panel_install", "Install")}
                        className="!py-1.5 !px-3 !text-[9px]"
                      />
                    </div>
                  </div>
                }
              >
                {asset.description && <p className="text-[10px] text-[var(--subtext)] opacity-70 line-clamp-2 leading-relaxed mb-1">{stripMarkdown(asset.description)}</p>}
              </UniversalCard>
            );
          })}
        </div>
      </>
    );
  }

  return null;
}


