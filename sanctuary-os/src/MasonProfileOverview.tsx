import { getModIcon, stripMarkdown } from './shared';
import MasonPostCard from './MasonPostCard';
import { UniversalCard } from './components/universal/UniversalCard';

export default function MasonProfileOverview({ posts, mods, marketAssets, mason, setActiveAsset, setSelectedBlueprint, onModClick, activeGameSchema, handlePostClick, handleToggleLike, isOwner, onEditShowcase, t }: any) {
  const blueprintAssets = (marketAssets || []).filter((a: any) => a.asset_type === 'blueprint');
  const nonBlueprintAssets = (marketAssets || []).filter((a: any) => a.asset_type !== 'blueprint');

  const glassBadgeBase = "glass-surface bg-[color-mix(in_srgb,var(--text)_6%,transparent)] backdrop-blur-md border border-[color-mix(in_srgb,var(--text)_14%,transparent)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)] text-[var(--text)]";

  return (
    <div className="flex flex-col gap-8 w-full h-full overflow-y-auto custom-scrollbar content-start p-4 pb-32">
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_450px] 2xl:grid-cols-[1fr_500px] gap-12 w-full h-full min-h-0">
        
        {/* SHOWCASE on left */}
        <div className="w-full flex flex-col gap-8 h-full min-w-0">
          <div className="flex items-center justify-between w-full gap-4 mb-2 pb-4 border-b border-[color-mix(in_srgb,var(--text)_6%,transparent)]">
            <h2 className="text-2xl font-black capitalize tracking-widest text-[var(--text)] flex items-center gap-4 min-w-[200px] shrink-0">
              <div className="w-12 h-12 rounded-2xl glass-surface bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined !text-2xl text-[var(--warning)]">{t("icon_workspace_premium", "workspace_premium")}</span>
              </div>
              <span className="truncate">{t("showcase", "Showcase")}</span>
            </h2>
            {isOwner && (
              <button
                onClick={onEditShowcase}
                className="h-10 px-4 rounded-xl glass-surface bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] backdrop-blur-md flex items-center gap-2 text-xs font-black capitalize tracking-widest text-[var(--text)] hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] transition-all shrink-0 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]"
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
                  <span>{t("latest_artifact", "Artifact Showcase")}</span>
                </h3>
                {(() => {
                  const showcaseMod = mods.find((m: any) => m.id === mason?.pinned_mod_id || m.id === mason?.pinned_ccset_id) || mods[0];
                  const otherMods = mods.filter((m: any) => m.id !== showcaseMod.id).slice(0, 2);
                  return (
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                      <div className={`w-full min-h-[220px] h-full ${otherMods.length > 0 ? 'lg:col-span-3' : 'lg:col-span-5'}`}>
                        <div 
                          onClick={() => onModClick({ ...showcaseMod, author: mason.name, isNexusView: true })}
                          className="relative w-full h-full rounded-2xl glass-panel group/feat overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:shadow-[0_12px_36px_rgba(0,0,0,0.25)] transition-all duration-500 cursor-pointer flex flex-col justify-end p-5"
                        >
                          {showcaseMod.image_url ? (
                            <>
                              <img src={showcaseMod.image_url} alt={showcaseMod.name} className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover/feat:opacity-100 group-hover/feat:scale-105 transition-all duration-700" />
                              <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-[color-mix(in_srgb,var(--bg)_55%,transparent)] to-transparent opacity-90 z-10" />
                            </>
                          ) : (
                            <div className="absolute inset-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_5%,transparent)] to-transparent overflow-hidden">
                              <span className="material-symbols-outlined absolute -bottom-10 -right-10 !text-[200px] opacity-[0.03] text-[var(--text)] group-hover/feat:text-[var(--accent)] group-hover/feat:scale-110 group-hover/feat:-rotate-12 transition-all duration-700 pointer-events-none">{getModIcon(showcaseMod, activeGameSchema, t)}</span>
                            </div>
                          )}

                          <div className="relative z-20 flex flex-col gap-2 w-full mt-auto">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              {showcaseMod.status === 'verified' && (
                                <span className="text-[10px] font-black capitalize tracking-widest text-[var(--success)] glass-surface bg-[color-mix(in_srgb,var(--success)_8%,transparent)] px-3 py-1 rounded-full border border-[color-mix(in_srgb,var(--success)_22%,transparent)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)] flex items-center gap-1.5 backdrop-blur-md">
                                  <span className="material-symbols-outlined !text-[14px]">{t("icon_verified", "verified")}</span>
                                  <span>{t("verified", "Verified")}</span>
                                </span>
                              )}
                              <span className={`text-[10px] font-black px-3 py-1 rounded-full capitalize tracking-widest ${glassBadgeBase}`}>
                                {showcaseMod.category_override || t("label_artifact", "Artifact")}
                              </span>
                              {showcaseMod.is_early_access && (
                                <span className="text-[10px] font-black capitalize tracking-widest text-purple-300 glass-surface bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] px-3 py-1 rounded-full border border-[color-mix(in_srgb,var(--accent)_22%,transparent)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)] backdrop-blur-md">
                                  {t("badge_early_access", "Early Access")}
                                </span>
                              )}
                              {showcaseMod.is_paid && (
                                <span className="text-[10px] font-black capitalize tracking-widest text-amber-300 glass-surface bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] px-3 py-1 rounded-full border border-[color-mix(in_srgb,var(--warning)_22%,transparent)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)] backdrop-blur-md">
                                  {t("badge_paid", "Paid")}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 mb-1">
                              <div className="flex items-center gap-1.5 opacity-60">
                                <span className="material-symbols-outlined !text-[14px]">{t("icon_person", "person")}</span>
                                <span className="text-[10px] font-black tracking-widest uppercase">{mason.name}</span>
                              </div>
                            </div>
                            <h4 className="text-2xl lg:text-3xl font-black text-[var(--text)] line-clamp-1 group-hover/feat:theme-text-accent transition-colors drop-shadow-md">
                              {showcaseMod.name}
                            </h4>
                            
                            {showcaseMod.description && <p className="text-sm text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed drop-shadow-md">{stripMarkdown(showcaseMod.description)}</p>}

                            <div className="flex items-center justify-between w-full mt-4 pt-4 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                              <div className="flex items-center gap-3">
                                {(mason?.pinned_mod_id === showcaseMod.id || mason?.pinned_ccset_id === showcaseMod.id) ? (
                                  <div className="px-3 py-1 glass-surface bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] rounded-full flex items-center gap-1.5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)] shrink-0 backdrop-blur-md">
                                    <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">{t("icon_push_pin", "push_pin")}</span>
                                    <span className="text-[10px] font-black capitalize tracking-[0.2em] text-[var(--accent)]">{t("pinned", "Pinned")}</span>
                                  </div>
                                ) : <div />}
                                <span className="text-[10px] font-mono text-[var(--subtext)] opacity-60 capitalize tracking-[0.2em]">{new Date(showcaseMod.created_at).toLocaleDateString()}</span>
                              </div>
                              <span className="text-[11px] font-black theme-text-accent capitalize tracking-widest opacity-0 group-hover/feat:opacity-100 transition-all translate-x-4 group-hover/feat:translate-x-0 duration-500 glass-surface bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] px-4 py-1.5 rounded-xl flex items-center gap-1.5">
                                <span>{t("btn_view", "View")}</span>
                                <span className="material-symbols-outlined !text-[14px]">{t("icon_arrow_forward", "arrow_forward")}</span>
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {otherMods.length > 0 && (
                        <div className="lg:col-span-2 flex flex-col justify-center gap-5">
                          {otherMods.map((mod: any) => (
                            <UniversalCard
                              key={mod.id}
                              layout="compact"
                              image={mod.image_url ? mod.image_url : undefined}
                              icon={!mod.image_url ? getModIcon(mod, activeGameSchema, t) : undefined}
                              title={mod.name}
                              subtitle={<span className="text-[9px] font-mono text-[var(--subtext)] opacity-60 tracking-[0.2em] uppercase">{new Date(mod.created_at).toLocaleDateString()}</span>}
                              onClick={() => onModClick({ ...mod, author: mason.name, isNexusView: true })}
                              className="w-full hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)]"
                              badges={
                                <>
                                  {mod.status === 'verified' && (
                                    <span className="text-[8px] font-black capitalize tracking-widest text-[var(--success)] glass-surface bg-[color-mix(in_srgb,var(--success)_8%,transparent)] px-2 py-0.5 rounded-full border border-[color-mix(in_srgb,var(--success)_22%,transparent)] flex items-center gap-0.5 backdrop-blur-md">
                                      <span className="material-symbols-outlined !text-[12px]">{t("icon_verified", "verified")}</span>
                                    </span>
                                  )}
                                  <span className={`text-[8px] font-black capitalize tracking-widest truncate px-2.5 py-0.5 rounded-full ${glassBadgeBase}`}>
                                    {mod.category_override || t("label_artifact", "Artifact")}
                                  </span>
                                </>
                              }
                            />
                          ))}
                        </div>
                      )}
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
                  <span>{t("latest_blueprint", "Blueprint Showcase")}</span>
                </h3>
                {(() => {
                  const showcaseBlueprint = blueprintAssets.find((a: any) => a.id === mason?.pinned_blueprint_id) || blueprintAssets[0];
                  const otherBlueprints = blueprintAssets.filter((a: any) => a.id !== showcaseBlueprint.id).slice(0, 2);
                  const bpIcon = t("icon_map", "map");

                  return (
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                      <div className={`w-full min-h-[220px] h-full ${otherBlueprints.length > 0 ? 'lg:col-span-3' : 'lg:col-span-5'}`}>
                        <div 
                          onClick={() => setSelectedBlueprint(showcaseBlueprint)}
                          className="relative w-full h-full rounded-2xl glass-panel group/feat overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:shadow-[0_12px_36px_rgba(0,0,0,0.25)] transition-all duration-500 cursor-pointer flex flex-col justify-end p-5"
                        >
                          {showcaseBlueprint.image_url ? (
                            <>
                              <img src={showcaseBlueprint.image_url} alt={showcaseBlueprint.name} className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover/feat:opacity-100 group-hover/feat:scale-105 transition-all duration-700" />
                              <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-[color-mix(in_srgb,var(--bg)_55%,transparent)] to-transparent opacity-90 z-10" />
                            </>
                          ) : (
                            <div className="absolute inset-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_5%,transparent)] to-transparent overflow-hidden">
                              <span className="material-symbols-outlined absolute -bottom-10 -right-10 !text-[200px] opacity-[0.03] text-[var(--text)] group-hover/feat:text-[var(--accent)] group-hover/feat:scale-110 group-hover/feat:-rotate-12 transition-all duration-700 pointer-events-none">{bpIcon}</span>
                            </div>
                          )}

                          <div className="relative z-20 flex flex-col gap-2 w-full mt-auto">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className={`text-[10px] font-black px-3 py-1 rounded-full capitalize tracking-widest ${glassBadgeBase}`}>
                                {t("type_blueprint", "Blueprint")}
                              </span>
                              {(showcaseBlueprint.json_data?.artifacts?.length || 0) > 0 && (
                                <span className={`text-[10px] font-black px-3 py-1 rounded-full capitalize tracking-widest ${glassBadgeBase}`}>
                                  {showcaseBlueprint.json_data.artifacts.length} {t("items", "Artifacts")}
                                </span>
                              )}
                              {showcaseBlueprint.is_early_access && (
                                <span className="text-[10px] font-black capitalize tracking-widest text-purple-300 glass-surface bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] px-3 py-1 rounded-full border border-[color-mix(in_srgb,var(--accent)_22%,transparent)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)] backdrop-blur-md">
                                  {t("badge_early_access", "Early Access")}
                                </span>
                              )}
                              {showcaseBlueprint.is_paid && (
                                <span className="text-[10px] font-black capitalize tracking-widest text-amber-300 glass-surface bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] px-3 py-1 rounded-full border border-[color-mix(in_srgb,var(--warning)_22%,transparent)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)] backdrop-blur-md">
                                  {t("badge_paid", "Paid")}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 mb-1">
                              <div className="flex items-center gap-1.5 opacity-60">
                                <span className="material-symbols-outlined !text-[14px]">{t("icon_person", "person")}</span>
                                <span className="text-[10px] font-black tracking-widest uppercase">{mason.name}</span>
                              </div>
                            </div>
                            <h4 className="text-2xl lg:text-3xl font-black text-[var(--text)] line-clamp-1 group-hover/feat:theme-text-accent transition-colors drop-shadow-md">
                              {showcaseBlueprint.name}
                            </h4>
                            
                            {showcaseBlueprint.description && <p className="text-sm text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed drop-shadow-md">{stripMarkdown(showcaseBlueprint.description)}</p>}

                            <div className="flex items-center justify-between w-full mt-4 pt-4 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                              <div className="flex items-center gap-3">
                                {mason?.pinned_blueprint_id === showcaseBlueprint.id ? (
                                  <div className="px-3 py-1 glass-surface bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] rounded-full flex items-center gap-1.5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)] shrink-0 backdrop-blur-md">
                                    <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">{t("icon_push_pin", "push_pin")}</span>
                                    <span className="text-[10px] font-black capitalize tracking-[0.2em] text-[var(--accent)]">{t("pinned", "Pinned")}</span>
                                  </div>
                                ) : <div />}
                                <span className="text-[10px] font-mono text-[var(--subtext)] opacity-60 capitalize tracking-[0.2em]">{new Date(showcaseBlueprint.created_at).toLocaleDateString()}</span>
                              </div>
                              <span className="text-[11px] font-black theme-text-accent capitalize tracking-widest opacity-0 group-hover/feat:opacity-100 transition-all translate-x-4 group-hover/feat:translate-x-0 duration-500 glass-surface bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] px-4 py-1.5 rounded-xl flex items-center gap-1.5">
                                <span>{t("btn_view", "View")}</span>
                                <span className="material-symbols-outlined !text-[14px]">{t("icon_arrow_forward", "arrow_forward")}</span>
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {otherBlueprints.length > 0 && (
                        <div className="lg:col-span-2 flex flex-col justify-center gap-5">
                          {otherBlueprints.map((bp: any) => (
                            <UniversalCard
                              key={bp.id}
                              layout="compact"
                              image={bp.image_url ? bp.image_url : undefined}
                              icon={!bp.image_url ? bpIcon : undefined}
                              title={bp.name}
                              subtitle={<span className="text-[9px] font-mono text-[var(--subtext)] opacity-60 tracking-[0.2em] uppercase">{new Date(bp.created_at).toLocaleDateString()}</span>}
                              onClick={() => setSelectedBlueprint(bp)}
                              className="w-full hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)]"
                              badges={
                                <span className={`text-[8px] font-black capitalize tracking-widest truncate px-2.5 py-0.5 rounded-full ${glassBadgeBase}`}>
                                  {t("type_blueprint", "Blueprint")}
                                </span>
                              }
                            />
                          ))}
                        </div>
                      )}
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
                  const icon = showcaseAsset.asset_type === 'lexicon' ? t("icon_translate", "translate") : showcaseAsset.asset_type === 'chameleon' ? t("icon_palette", "palette") : t("icon_draw", "draw");

                  return (
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                      <div className={`w-full min-h-[220px] h-full ${otherAssets.length > 0 ? 'lg:col-span-3' : 'lg:col-span-5'}`}>
                        <div 
                          onClick={() => setActiveAsset({ type: showcaseAsset.asset_type, id: showcaseAsset.id })}
                          className="relative w-full h-full rounded-2xl glass-panel group/feat overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:shadow-[0_12px_36px_rgba(0,0,0,0.25)] transition-all duration-500 cursor-pointer flex flex-col justify-end p-5"
                        >
                          {showcaseAsset.image_url ? (
                            <>
                              <img src={showcaseAsset.image_url} alt={showcaseAsset.name} className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover/feat:opacity-100 group-hover/feat:scale-105 transition-all duration-700" />
                              <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-[color-mix(in_srgb,var(--bg)_55%,transparent)] to-transparent opacity-90 z-10" />
                            </>
                          ) : (
                            <div className="absolute inset-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_5%,transparent)] to-transparent overflow-hidden">
                              <span className="material-symbols-outlined absolute -bottom-10 -right-10 !text-[200px] opacity-[0.03] text-[var(--text)] group-hover/feat:text-[var(--accent)] group-hover/feat:scale-110 group-hover/feat:-rotate-12 transition-all duration-700 pointer-events-none">{icon}</span>
                            </div>
                          )}

                          <div className="relative z-20 flex flex-col gap-2 w-full mt-auto">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className={`text-[10px] font-black px-3 py-1 rounded-full capitalize tracking-widest ${glassBadgeBase}`}>
                                {t(showcaseAsset.asset_type, showcaseAsset.asset_type) || showcaseAsset.asset_type}
                              </span>
                              {showcaseAsset.is_early_access && (
                                <span className="text-[10px] font-black capitalize tracking-widest text-purple-300 glass-surface bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] px-3 py-1 rounded-full border border-[color-mix(in_srgb,var(--accent)_22%,transparent)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)] backdrop-blur-md">
                                  {t("badge_early_access", "Early Access")}
                                </span>
                              )}
                              {showcaseAsset.is_paid && (
                                <span className="text-[10px] font-black capitalize tracking-widest text-amber-300 glass-surface bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] px-3 py-1 rounded-full border border-[color-mix(in_srgb,var(--warning)_22%,transparent)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)] backdrop-blur-md">
                                  {t("badge_paid", "Paid")}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 mb-1">
                              <div className="flex items-center gap-1.5 opacity-60">
                                <span className="material-symbols-outlined !text-[14px]">{t("icon_person", "person")}</span>
                                <span className="text-[10px] font-black tracking-widest uppercase">{mason.name}</span>
                              </div>
                            </div>
                            <h4 className="text-2xl lg:text-3xl font-black text-[var(--text)] line-clamp-1 group-hover/feat:theme-text-accent transition-colors drop-shadow-md">
                              {showcaseAsset.name}
                            </h4>
                            
                            {showcaseAsset.description && <p className="text-sm text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed drop-shadow-md">{stripMarkdown(showcaseAsset.description)}</p>}

                            <div className="flex items-center justify-between w-full mt-4 pt-4 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                              <div className="flex items-center gap-3">
                                {mason?.pinned_asset_id === showcaseAsset.id ? (
                                  <div className="px-3 py-1 glass-surface bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] rounded-full flex items-center gap-1.5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)] shrink-0 backdrop-blur-md">
                                    <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">{t("icon_push_pin", "push_pin")}</span>
                                    <span className="text-[10px] font-black capitalize tracking-[0.2em] text-[var(--accent)]">{t("pinned", "Pinned")}</span>
                                  </div>
                                ) : <div />}
                                <span className="text-[10px] font-mono text-[var(--subtext)] opacity-60 capitalize tracking-[0.2em]">{new Date(showcaseAsset.created_at).toLocaleDateString()}</span>
                              </div>
                              <span className="text-[11px] font-black theme-text-accent capitalize tracking-widest opacity-0 group-hover/feat:opacity-100 transition-all translate-x-4 group-hover/feat:translate-x-0 duration-500 glass-surface bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] px-4 py-1.5 rounded-xl flex items-center gap-1.5">
                                <span>{t("btn_view", "View")}</span>
                                <span className="material-symbols-outlined !text-[14px]">{t("icon_arrow_forward", "arrow_forward")}</span>
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {otherAssets.length > 0 && (
                        <div className="lg:col-span-2 flex flex-col justify-center gap-5">
                          {otherAssets.map((asset: any) => {
                            const smIcon = asset.asset_type === 'lexicon' ? t("icon_translate", "translate") : asset.asset_type === 'chameleon' ? t("icon_palette", "palette") : t("icon_draw", "draw");
                            return (
                              <UniversalCard
                                key={asset.id}
                                layout="compact"
                                image={asset.image_url ? asset.image_url : undefined}
                                icon={!asset.image_url ? smIcon : undefined}
                                title={asset.name}
                                subtitle={<span className="text-[9px] font-mono text-[var(--subtext)] opacity-60 tracking-[0.2em] uppercase">{new Date(asset.created_at).toLocaleDateString()}</span>}
                                onClick={() => setActiveAsset({ type: asset.asset_type, id: asset.id })}
                                className="w-full hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)]"
                                badges={
                                  <span className={`text-[8px] font-black capitalize tracking-widest truncate px-2.5 py-0.5 rounded-full ${glassBadgeBase}`}>
                                    {t(asset.asset_type, asset.asset_type) || asset.asset_type}
                                  </span>
                                }
                              />
                            );
                          })}
                        </div>
                      )}
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
            <div className="w-12 h-12 rounded-2xl glass-surface bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined !text-2xl text-[var(--accent)]">{t("icon_satellite_alt", "satellite_alt")}</span>
            </div>
            <span className="truncate">{t("tab_commlink", "Comm-Link")}</span>
          </h2>
          <div className="w-full">
            {posts.length === 0 ? (
              <div className="text-center py-16 opacity-50 text-xs font-black capitalize tracking-widest border border-dashed border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-3xl">{t("profile_no_posts", "No transmissions found.")}</div>
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


