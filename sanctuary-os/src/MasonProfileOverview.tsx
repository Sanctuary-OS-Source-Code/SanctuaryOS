import { getModIcon, stripMarkdown } from './shared';
import MasonPostCard from './MasonPostCard';
import { UniversalCard } from './components/universal/UniversalCard';
import {
  DynamicThemePreviewBanner,
  DynamicLexiconPreviewBanner,
  DynamicBlueprintPreviewBanner,
  DynamicTemplatePreviewBanner,
  DynamicArtifactPreviewBanner,
} from './chameleon-components/ThemeCard';
import { useStore } from './store';

export default function MasonProfileOverview({ posts, mods, marketAssets, mason, setActiveAsset, setSelectedBlueprint, onModClick, activeGameSchema, handlePostClick, handleToggleLike, isOwner, onEditShowcase, t }: any) {
  const showImages = useStore((state: any) => state.showImages);
  const blueprintAssets = (marketAssets || []).filter((a: any) => a.asset_type === 'blueprint');
  const nonBlueprintAssets = (marketAssets || []).filter((a: any) => a.asset_type !== 'blueprint');

  const glassBadgeBase = "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

  return (
    <div className="flex flex-col gap-8 w-full h-full overflow-y-auto custom-scrollbar content-start p-4 pb-32">
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_450px] 2xl:grid-cols-[1fr_500px] gap-12 w-full h-full min-h-0">
        
        {/* SHOWCASE on left */}
        <div className="w-full flex flex-col gap-8 h-full min-w-0">
          <div className="flex items-center justify-between w-full gap-4 mb-2 pb-4 border-b border-[color-mix(in_srgb,var(--text)_6%,transparent)]">
            <h2 className="text-2xl font-black capitalize tracking-widest text-[var(--text)] flex items-center gap-4 min-w-[200px] shrink-0">
              <div className="w-12 h-12 rounded-2xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined !text-2xl text-[var(--warning)]">{t("icon_workspace_premium", "workspace_premium")}</span>
              </div>
              <span className="truncate">{t("showcase", "Showcase")}</span>
            </h2>
            {isOwner && (
              <button
                onClick={onEditShowcase}
                className="h-10 px-4 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center gap-2 text-xs font-black capitalize tracking-widest text-[var(--text)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] transition-all shrink-0"
              >
                <span className="material-symbols-outlined !text-lg">{t("icon_edit", "edit")}</span>
                <span>{t("edit", "Edit")}</span>
              </button>
            )}
          </div>

          <div className="flex flex-col gap-12 w-full">
            {/* 1. ARTIFACTS SHOWCASE */}
            {mods.length > 0 && (
              <div className="flex flex-col gap-5">
                <h3 className="text-sm font-black text-[color-mix(in_srgb,var(--text)_60%,transparent)] uppercase tracking-[0.3em] pl-2 flex items-center gap-3">
                  <span className="material-symbols-outlined !text-lg text-[var(--text)] opacity-50">{t("icon_auto_awesome", "auto_awesome")}</span>
                  <span>{t("latest_artifact", "{Mod} Showcase")}</span>
                </h3>
                {(() => {
                  const showcaseMod = mods.find((m: any) => m.id === mason?.pinned_mod_id || m.id === mason?.pinned_ccset_id) || mods[0];
                  const otherMods = mods.filter((m: any) => m.id !== showcaseMod.id).slice(0, 2);
                  const displayMods = [showcaseMod, ...otherMods];
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {displayMods.map((mod: any) => {
                        const isPinned = mason?.pinned_mod_id === mod.id || mason?.pinned_ccset_id === mod.id;
                        return (
                          <UniversalCard
                            key={mod.id}
                            layout="vertical"
                            isActive={isPinned}
                            image={showImages !== false && mod.image_url ? mod.image_url : undefined}
                            icon={!mod.image_url ? getModIcon(mod, activeGameSchema, t) : undefined}
                            customIcon={
                              <DynamicArtifactPreviewBanner
                                data={mod}
                                icon={getModIcon(mod, activeGameSchema, t)}
                                heightClass="h-full"
                              />
                            }
                            title={mod.name}
                            subtitle={`${mason.name || t("unknown_mason", "Unknown {Mason}")}${mod.latest_version ? ` • ${mod.latest_version}` : ""}`}
                            onClick={() => onModClick({ ...mod, author: mason.name, isNexusView: true })}
                            imageOverlay={
                              <div className="absolute top-3 left-3 z-30 flex items-center gap-1.5 pointer-events-none">
                                {isPinned && (
                                  <div className={glassBadgeBase}>
                                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{t("icon_push_pin", "push_pin")}</span>
                                    <span>{t("pinned", "Pinned")}</span>
                                  </div>
                                )}
                                {mod.status === 'verified' && (
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
                                  <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                                    {String(mod.category_override || mod.name || "").toLowerCase().includes("script") ? t("icon_terminal", "terminal") : t("icon_deployed_code", "deployed_code")}
                                  </span>
                                  <span className="text-[var(--subtext)]">{mod.category_override || t("label_artifact", "{Mod}")}</span>
                                </div>
                                {mod.is_early_access && (
                                  <div className={glassBadgeBase}>
                                    <span className="material-symbols-outlined !text-[12px] text-purple-400">{t("icon_science", "science")}</span>
                                    <span>{t("badge_early_access", "Early Access")}</span>
                                  </div>
                                )}
                                {mod.is_paid && (
                                  <div className={glassBadgeBase}>
                                    <span className="material-symbols-outlined !text-[12px] text-amber-400">{t("icon_monetization_on", "monetization_on")}</span>
                                    <span>{t("badge_paid", "Paid")}</span>
                                  </div>
                                )}
                              </>
                            }
                            footer={
                              <div className="flex items-center justify-between w-full pt-1 gap-2">
                                <span className="text-[8px] font-mono text-[var(--subtext)] opacity-50 capitalize tracking-widest">
                                  {mod.created_at ? new Date(mod.created_at).toLocaleDateString() : ""}
                                </span>
                                <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
                                  {t("btn_view", "View")} <span className="text-base leading-none">&rarr;</span>
                                </span>
                              </div>
                            }
                          >
                            {mod.description && (
                              <p className="text-[10px] text-[var(--subtext)] opacity-70 line-clamp-2 leading-relaxed mb-1">
                                {stripMarkdown(mod.description)}
                              </p>
                            )}
                          </UniversalCard>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* 2. BLUEPRINTS SHOWCASE */}
            {blueprintAssets.length > 0 && (
              <div className="flex flex-col gap-5">
                <h3 className="text-sm font-black text-[color-mix(in_srgb,var(--text)_60%,transparent)] uppercase tracking-[0.3em] pl-2 flex items-center gap-3">
                  <span className="material-symbols-outlined !text-lg text-[var(--text)] opacity-50">{t("icon_map", "map")}</span>
                  <span>{t("latest_blueprint", "{Blueprint} Showcase")}</span>
                </h3>
                {(() => {
                  const showcaseBlueprint = blueprintAssets.find((a: any) => a.id === mason?.pinned_blueprint_id) || blueprintAssets[0];
                  const otherBlueprints = blueprintAssets.filter((a: any) => a.id !== showcaseBlueprint.id).slice(0, 2);
                  const displayBlueprints = [showcaseBlueprint, ...otherBlueprints];
                  const bpIcon = t("icon_map", "map");

                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {displayBlueprints.map((bp: any) => {
                        const isPinned = mason?.pinned_blueprint_id === bp.id;
                        return (
                          <UniversalCard
                            key={bp.id}
                            layout="vertical"
                            isActive={isPinned}
                            image={showImages !== false && bp.image_url ? bp.image_url : undefined}
                            icon={!bp.image_url ? bpIcon : undefined}
                            customIcon={<DynamicBlueprintPreviewBanner data={bp} heightClass="h-full" />}
                            title={bp.name}
                            subtitle={mason.name || t("unknown_mason", "Unknown {Mason}")}
                            onClick={() => setSelectedBlueprint(bp)}
                            imageOverlay={
                              isPinned ? (
                                <div className="absolute top-3 left-3 z-30 flex items-center gap-1.5 pointer-events-none">
                                  <div className={glassBadgeBase}>
                                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{t("icon_push_pin", "push_pin")}</span>
                                    <span>{t("pinned", "Pinned")}</span>
                                  </div>
                                </div>
                              ) : undefined
                            }
                            badges={
                              <>
                                <div className={glassBadgeBase}>
                                  <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{bpIcon}</span>
                                  <span>{t("blueprint", "{Blueprint}")}</span>
                                </div>
                                {(bp.json_data?.artifacts?.length || 0) > 0 && (
                                  <div className={glassBadgeBase}>
                                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{t("icon_account_tree", "account_tree")}</span>
                                    <span>+{bp.json_data.artifacts.length} {t("badge_modules_count", "Modules")}</span>
                                  </div>
                                )}
                                {bp.is_early_access && (
                                  <div className={glassBadgeBase}>
                                    <span className="material-symbols-outlined !text-[12px] text-purple-400">{t("icon_science", "science")}</span>
                                    <span>{t("badge_early_access", "Early Access")}</span>
                                  </div>
                                )}
                                {bp.is_paid && (
                                  <div className={glassBadgeBase}>
                                    <span className="material-symbols-outlined !text-[12px] text-amber-400">{t("icon_monetization_on", "monetization_on")}</span>
                                    <span>{t("badge_paid", "Paid")}</span>
                                  </div>
                                )}
                              </>
                            }
                            footer={
                              <div className="flex items-center justify-between w-full pt-1 gap-2">
                                <span className="text-[8px] font-mono text-[var(--subtext)] opacity-50 capitalize tracking-widest">
                                  {bp.created_at ? new Date(bp.created_at).toLocaleDateString() : ""}
                                </span>
                                <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
                                  {t("btn_view", "View")} <span className="text-base leading-none">&rarr;</span>
                                </span>
                              </div>
                            }
                          >
                            {bp.description && (
                              <p className="text-[10px] text-[var(--subtext)] opacity-70 line-clamp-2 leading-relaxed mb-1">
                                {stripMarkdown(bp.description)}
                              </p>
                            )}
                          </UniversalCard>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* 3. ASSETS SHOWCASE [Lexicons, Chameleons, Templates] */}
            {nonBlueprintAssets.length > 0 && (
              <div className="flex flex-col gap-5">
                <h3 className="text-sm font-black text-[color-mix(in_srgb,var(--text)_60%,transparent)] uppercase tracking-[0.3em] pl-2 flex items-center gap-3">
                  <span className="material-symbols-outlined !text-lg text-[var(--text)] opacity-50">{t("icon_widgets", "widgets")}</span>
                  <span>{t("latest_asset", "Asset Showcase")}</span>
                </h3>
                {(() => {
                  const showcaseAsset = nonBlueprintAssets.find((a: any) => a.id === mason?.pinned_asset_id) || nonBlueprintAssets[0];
                  const otherAssets = nonBlueprintAssets.filter((a: any) => a.id !== showcaseAsset.id).slice(0, 2);
                  const displayAssets = [showcaseAsset, ...otherAssets];

                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {displayAssets.map((asset: any) => {
                        const isPinned = mason?.pinned_asset_id === asset.id;
                        const smIcon = asset.asset_type === 'lexicon' ? t("icon_translate", "translate") : asset.asset_type === 'chameleon' ? t("icon_palette", "palette") : t("icon_draw", "draw");
                        const previewNode =
                          asset.asset_type === 'chameleon' ? (
                            <DynamicThemePreviewBanner
                              data={{
                                ...asset,
                                ...(typeof asset.json_data === 'object' ? asset.json_data : {}),
                                name: asset.name,
                                previewImage: showImages !== false ? (asset.image_url || asset.json_data?.previewImage) : undefined,
                              }}
                              heightClass="h-full"
                            />
                          ) : asset.asset_type === 'lexicon' ? (
                            <DynamicLexiconPreviewBanner data={asset} heightClass="h-full" />
                          ) : (
                            <DynamicTemplatePreviewBanner data={asset} heightClass="h-full" />
                          );

                        return (
                          <UniversalCard
                            key={asset.id}
                            layout="vertical"
                            isActive={isPinned}
                            image={showImages !== false && asset.image_url ? asset.image_url : undefined}
                            icon={!asset.image_url ? smIcon : undefined}
                            customIcon={previewNode}
                            title={asset.name}
                            subtitle={mason.name || t("unknown_mason", "Unknown {Mason}")}
                            onClick={() => setActiveAsset({ type: asset.asset_type, id: asset.id })}
                            imageOverlay={
                              isPinned ? (
                                <div className="absolute top-3 left-3 z-30 flex items-center gap-1.5 pointer-events-none">
                                  <div className={glassBadgeBase}>
                                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{t("icon_push_pin", "push_pin")}</span>
                                    <span>{t("pinned", "Pinned")}</span>
                                  </div>
                                </div>
                              ) : undefined
                            }
                            badges={
                              <div className={glassBadgeBase}>
                                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{smIcon}</span>
                                <span>{t(asset.asset_type, asset.asset_type) || asset.asset_type}</span>
                              </div>
                            }
                            footer={
                              <div className="flex items-center justify-between w-full pt-1 gap-2">
                                <span className="text-[8px] font-mono text-[var(--subtext)] opacity-50 capitalize tracking-widest">
                                  {asset.created_at ? new Date(asset.created_at).toLocaleDateString() : ""}
                                </span>
                                <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
                                  {t("btn_view", "View")} <span className="text-base leading-none">&rarr;</span>
                                </span>
                              </div>
                            }
                          >
                            {asset.description && (
                              <p className="text-[10px] text-[var(--subtext)] opacity-70 line-clamp-2 leading-relaxed mb-1">
                                {stripMarkdown(asset.description)}
                              </p>
                            )}
                          </UniversalCard>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>

        {/* COMM-LINK on right */}
        <div className="flex flex-col gap-8 min-w-0 h-full border-l border-[color-mix(in_srgb,var(--text)_6%,transparent)] xl:pl-12">
          <h2 className="text-2xl font-black capitalize tracking-widest text-[var(--text)] flex items-center gap-4 min-w-[200px] shrink-0 mb-2 pb-4 border-b border-[color-mix(in_srgb,var(--text)_6%,transparent)]">
            <div className="w-12 h-12 rounded-2xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined !text-2xl text-[var(--accent)]">{t("icon_satellite_alt", "satellite_alt")}</span>
            </div>
            <span className="truncate">{t("tab_commlink", "Comm-Link")}</span>
          </h2>
          <div className="w-full">
            {posts.length === 0 ? (
              <div className="text-center py-16 opacity-50 text-xs font-black capitalize tracking-widest border border-dashed border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-3xl">{t("profile_no_posts", "No {dispatches} found.")}</div>
            ) : (
              <div className="flex flex-col gap-6">
                {posts.map((p: any, index: number) => (
                  <div key={p.id} className="w-full">
                    <MasonPostCard post={p} index={index} onPostClick={handlePostClick} onToggleLike={handleToggleLike} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}


