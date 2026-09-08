import { DashboardStatTile, getModIcon, stripMarkdown } from './shared';
import MasonPostCard from './MasonPostCard';
import { UniversalCard } from './components/universal/UniversalCard';

export default function MasonProfileOverview({ posts, mods, marketAssets, mason, setActiveView, setModCategory, setModSearch, setActiveAsset, setSelectedBlueprint, onModClick, activeGameSchema, handlePostClick, handleToggleLike, isOwner, onEditShowcase, t }: any) {
  return (
    <div className="flex flex-col gap-8 w-full h-full overflow-y-auto custom-scrollbar content-start p-4 pb-32">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 w-full shrink-0">
        <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_account_balance")}</span>} number={mods.length} label={t("items")} colorClass={`text-teal-500`} onClick={() => { setActiveView("MODS"); setModCategory('ALL'); setModSearch(''); }} />
        <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_map")}</span>} number={marketAssets.filter((a: any) => a.asset_type === 'blueprint').length} label={t("playsets_title")} colorClass={`text-blue-500`} onClick={() => { setActiveView("BLUEPRINTS"); setModCategory('ALL'); setModSearch(''); }} />
        <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_translate")}</span>} number={marketAssets.filter((a: any) => a.asset_type === 'lexicon').length} label={t("tab_lexicons")} colorClass={`text-indigo-500`} onClick={() => { setActiveView("LEXICONS"); setModCategory('ALL'); setModSearch(''); }} />
        <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_palette")}</span>} number={marketAssets.filter((a: any) => a.asset_type === 'chameleon').length} label={t("type_theme")} colorClass={`text-purple-500`} onClick={() => { setActiveView("CHAMELEONS"); setModCategory('ALL'); setModSearch(''); }} />
        <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_draw")}</span>} number={marketAssets.filter((a: any) => a.asset_type === 'workbench_template').length} label={t("ql_templates")} colorClass={`text-pink-500`} onClick={() => { setActiveView("TEMPLATES"); setModCategory('ALL'); setModSearch(''); }} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_450px] 2xl:grid-cols-[1fr_500px] gap-12 w-full h-full min-h-0">
        
        {/* SHOWCASE on left */}
        <div className="w-full flex flex-col gap-8 h-full min-w-0">
          <div className="flex items-center justify-between w-full gap-4 mb-2 pb-4 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
            <h2 className="text-2xl font-black capitalize tracking-widest text-[var(--text)] flex items-center gap-4 min-w-[200px] shrink-0">
              <div className="w-14 h-14 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_20px_rgba(var(--warning-rgb),0.3)] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined !text-3xl text-amber-400 drop-shadow-lg">workspace_premium</span>
              </div>
              <span className="truncate">{t("showcase")}</span>
            </h2>
            {isOwner && (
              <button
                onClick={onEditShowcase}
                className="theme-glass-button h-12 px-5 rounded-2xl flex items-center gap-2 text-xs font-black capitalize tracking-widest text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] transition-colors shrink-0"
              >
                <span className="material-symbols-outlined !text-xl">edit</span>
                {t("edit")}
              </button>
            )}
          </div>

          <div className="flex flex-col gap-12 w-full">
            {mods.length > 0 && (
              <div className="flex flex-col gap-5">
                <h3 className="text-sm font-black text-[color-mix(in_srgb,var(--text)_60%,transparent)] uppercase tracking-[0.3em] pl-2 flex items-center gap-3">
                  <span className="material-symbols-outlined !text-lg text-[var(--text)] opacity-50">auto_awesome</span>
                  {t("latest_artifact")}
                </h3>
                {(() => {
                  const showcaseMod = mods.find((m: any) => m.id === mason?.pinned_mod_id || m.id === mason?.pinned_ccset_id) || mods[0];
                  const otherMods = mods.filter((m: any) => m.id !== showcaseMod.id).slice(0, 2);
                  return (
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                      <div className={`w-full min-h-[220px] h-full ${otherMods.length > 0 ? 'lg:col-span-3' : 'lg:col-span-5'}`}>
                        <div 
                          onClick={() => onModClick({ ...showcaseMod, author: mason.name, isNexusView: true })}
                          className="relative w-full h-full rounded-2xl glass-panel group/feat overflow-hidden border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:shadow-[0_0_40px_rgba(var(--accent-rgb),0.15)] transition-all duration-500 cursor-pointer flex flex-col justify-end p-5"
                        >
                          {showcaseMod.image_url ? (
                            <>
                              <img src={showcaseMod.image_url} alt={showcaseMod.name} className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover/feat:opacity-100 group-hover/feat:scale-105 transition-all duration-700" />
                              <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-[color-mix(in_srgb,var(--bg)_60%,transparent)] to-transparent opacity-90 z-10" />
                            </>
                          ) : (
                            <div className="absolute inset-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_5%,transparent)] to-transparent overflow-hidden">
                              <span className="material-symbols-outlined absolute -bottom-10 -right-10 !text-[200px] opacity-[0.03] text-[var(--text)] group-hover/feat:text-[var(--accent)] group-hover/feat:scale-110 group-hover/feat:-rotate-12 transition-all duration-700 pointer-events-none">{getModIcon(showcaseMod, activeGameSchema, t)}</span>
                            </div>
                          )}

                          <div className="relative z-20 flex flex-col gap-2 w-full mt-auto">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              {showcaseMod.status === 'verified' && (
                                <span className="text-[10px] font-black capitalize tracking-widest text-[var(--success)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] px-3 py-1 rounded-full shadow-sm border border-[color-mix(in_srgb,var(--success)_30%,transparent)] flex items-center gap-1.5 backdrop-blur-md">
                                  <span className="material-symbols-outlined !text-[14px]">verified</span>
                                  {t("verified")}
                                </span>
                              )}
                              <span className="text-[10px] font-black px-3 py-1 bg-[color-mix(in_srgb,var(--bg)_60%,transparent)] backdrop-blur-xl rounded-full border border-[color-mix(in_srgb,var(--text)_15%,transparent)] shadow-sm text-[var(--text)] capitalize tracking-widest">{showcaseMod.category_override || t("label_artifact")}</span>
                              {showcaseMod.is_early_access && (
                                <span className="text-[10px] font-black capitalize tracking-widest text-purple-400 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-3 py-1 rounded-full shadow-sm border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] backdrop-blur-md">{t("badge_early_access")}</span>
                              )}
                              {showcaseMod.is_paid && (
                                <span className="text-[10px] font-black capitalize tracking-widest text-yellow-400 bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-3 py-1 rounded-full shadow-sm border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] backdrop-blur-md">{t("badge_paid")}</span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 mb-1">
                              <div className="flex items-center gap-1.5 opacity-60">
                                <span className="material-symbols-outlined !text-[14px]">person</span>
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
                                  <div className="px-3 py-1.5 bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] rounded-full flex items-center gap-1.5 shadow-lg shrink-0 backdrop-blur-xl">
                                    <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">push_pin</span>
                                    <span className="text-[10px] font-black capitalize tracking-[0.2em] text-[var(--accent)]">{t("pinned")}</span>
                                  </div>
                                ) : <div />}
                                <span className="text-[10px] font-mono text-[var(--subtext)] opacity-60 capitalize tracking-[0.2em]">{new Date(showcaseMod.created_at).toLocaleDateString()}</span>
                              </div>
                              <span className="text-[11px] font-black theme-text-accent capitalize tracking-widest opacity-0 group-hover/feat:opacity-100 transition-all translate-x-4 group-hover/feat:translate-x-0 duration-500 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-4 py-2 rounded-xl">{t("btn_view")} &rarr;</span>
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
                                    <span className="text-[8px] font-black capitalize tracking-widest text-[var(--success)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] px-2 py-0.5 rounded-full shadow-sm border border-[color-mix(in_srgb,var(--success)_30%,transparent)] flex items-center gap-0.5 backdrop-blur-md">
                                      <span className="material-symbols-outlined !text-[12px]">verified</span>
                                    </span>
                                  )}
                                  <span className="text-[8px] font-black text-[color-mix(in_srgb,var(--text)_90%,transparent)] capitalize tracking-widest truncate border border-[color-mix(in_srgb,var(--text)_15%,transparent)] px-2 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--bg)_60%,transparent)] shadow-sm backdrop-blur-xl">{mod.category_override || t("label_artifact")}</span>
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

            {marketAssets.length > 0 && (
              <div className="flex flex-col gap-5">
                <h3 className="text-sm font-black text-[color-mix(in_srgb,var(--text)_60%,transparent)] uppercase tracking-[0.3em] pl-2 flex items-center gap-3">
                  <span className="material-symbols-outlined !text-lg text-[var(--text)] opacity-50">widgets</span>
                  {t("latest_asset")}
                </h3>
                {(() => {
                  const showcaseAsset = marketAssets.find((a: any) => a.id === mason?.pinned_asset_id || a.id === mason?.pinned_blueprint_id) || marketAssets[0];
                  const otherAssets = marketAssets.filter((a: any) => a.id !== showcaseAsset.id).slice(0, 2);
                  const isBlueprint = showcaseAsset.asset_type === 'blueprint';
                  const icon = isBlueprint ? t("icon_map") : showcaseAsset.asset_type === 'lexicon' ? t("icon_translate") : showcaseAsset.asset_type === 'chameleon' ? t("icon_palette") : t("icon_draw");

                  return (
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                      <div className={`w-full min-h-[220px] h-full ${otherAssets.length > 0 ? 'lg:col-span-3' : 'lg:col-span-5'}`}>
                        <div 
                          onClick={() => {
                            if (isBlueprint) {
                              setSelectedBlueprint(showcaseAsset);
                            } else {
                              setActiveAsset({ type: showcaseAsset.asset_type, id: showcaseAsset.id });
                            }
                          }}
                          className="relative w-full h-full rounded-2xl glass-panel group/feat overflow-hidden border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:shadow-[0_0_40px_rgba(var(--accent-rgb),0.15)] transition-all duration-500 cursor-pointer flex flex-col justify-end p-5"
                        >
                          {showcaseAsset.image_url ? (
                            <>
                              <img src={showcaseAsset.image_url} alt={showcaseAsset.name} className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover/feat:opacity-100 group-hover/feat:scale-105 transition-all duration-700" />
                              <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-[color-mix(in_srgb,var(--bg)_60%,transparent)] to-transparent opacity-90 z-10" />
                            </>
                          ) : (
                            <div className="absolute inset-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_5%,transparent)] to-transparent overflow-hidden">
                              <span className="material-symbols-outlined absolute -bottom-10 -right-10 !text-[200px] opacity-[0.03] text-[var(--text)] group-hover/feat:text-[var(--accent)] group-hover/feat:scale-110 group-hover/feat:-rotate-12 transition-all duration-700 pointer-events-none">{icon}</span>
                            </div>
                          )}

                          <div className="relative z-20 flex flex-col gap-2 w-full mt-auto">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="text-[10px] font-black px-3 py-1 bg-[color-mix(in_srgb,var(--bg)_60%,transparent)] backdrop-blur-xl rounded-full border border-[color-mix(in_srgb,var(--text)_15%,transparent)] shadow-sm text-[var(--text)] capitalize tracking-widest">{t(showcaseAsset.asset_type) || showcaseAsset.asset_type}</span>
                              {showcaseAsset.is_early_access && (
                                <span className="text-[10px] font-black capitalize tracking-widest text-purple-400 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-3 py-1 rounded-full shadow-sm border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] backdrop-blur-md">EA</span>
                              )}
                              {showcaseAsset.is_paid && (
                                <span className="text-[10px] font-black capitalize tracking-widest text-yellow-400 bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-3 py-1 rounded-full shadow-sm border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] backdrop-blur-md">$</span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 mb-1">
                              <div className="flex items-center gap-1.5 opacity-60">
                                <span className="material-symbols-outlined !text-[14px]">person</span>
                                <span className="text-[10px] font-black tracking-widest uppercase">{mason.name}</span>
                              </div>
                            </div>
                            <h4 className="text-2xl lg:text-3xl font-black text-[var(--text)] line-clamp-1 group-hover/feat:theme-text-accent transition-colors drop-shadow-md">
                              {showcaseAsset.name}
                            </h4>
                            
                            {showcaseAsset.description && <p className="text-sm text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed drop-shadow-md">{stripMarkdown(showcaseAsset.description)}</p>}

                            <div className="flex items-center justify-between w-full mt-4 pt-4 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                              <div className="flex items-center gap-3">
                                {(mason?.pinned_asset_id === showcaseAsset.id || mason?.pinned_blueprint_id === showcaseAsset.id) ? (
                                  <div className="px-3 py-1.5 bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] rounded-full flex items-center gap-1.5 shadow-lg shrink-0 backdrop-blur-xl">
                                    <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">push_pin</span>
                                    <span className="text-[10px] font-black capitalize tracking-[0.2em] text-[var(--accent)]">{t("pinned")}</span>
                                  </div>
                                ) : <div />}
                                <span className="text-[10px] font-mono text-[var(--subtext)] opacity-60 capitalize tracking-[0.2em]">{new Date(showcaseAsset.created_at).toLocaleDateString()}</span>
                              </div>
                              <span className="text-[11px] font-black theme-text-accent capitalize tracking-widest opacity-0 group-hover/feat:opacity-100 transition-all translate-x-4 group-hover/feat:translate-x-0 duration-500 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-4 py-2 rounded-xl">{t("btn_view")} &rarr;</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {otherAssets.length > 0 && (
                        <div className="lg:col-span-2 flex flex-col justify-center gap-5">
                          {otherAssets.map((asset: any) => {
                            const isBp = asset.asset_type === 'blueprint';
                            const smIcon = isBp ? t("icon_map") : asset.asset_type === 'lexicon' ? t("icon_translate") : asset.asset_type === 'chameleon' ? t("icon_palette") : t("icon_draw");
                            return (
                              <UniversalCard
                                key={asset.id}
                                layout="compact"
                                image={asset.image_url ? asset.image_url : undefined}
                                icon={!asset.image_url ? smIcon : undefined}
                                title={asset.name}
                                subtitle={<span className="text-[9px] font-mono text-[var(--subtext)] opacity-60 tracking-[0.2em] uppercase">{new Date(asset.created_at).toLocaleDateString()}</span>}
                                onClick={() => {
                                  if (isBp) {
                                    setSelectedBlueprint(asset);
                                  } else {
                                    setActiveAsset({ type: asset.asset_type, id: asset.id });
                                  }
                                }}
                                className="w-full hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)]"
                                badges={
                                  <>
                                    <span className="text-[8px] font-black text-[color-mix(in_srgb,var(--text)_90%,transparent)] capitalize tracking-widest truncate border border-[color-mix(in_srgb,var(--text)_15%,transparent)] px-2 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--bg)_60%,transparent)] shadow-sm backdrop-blur-xl">{t(asset.asset_type) || asset.asset_type}</span>
                                  </>
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
        <div className="flex flex-col gap-8 min-w-0 h-full border-l border-[color-mix(in_srgb,var(--text)_5%,transparent)] xl:pl-12">
          <h2 className="text-2xl font-black capitalize tracking-widest text-[var(--text)] flex items-center gap-4 min-w-[200px] shrink-0 mb-2">
            <div className="w-14 h-14 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_20px_rgba(var(--accent-rgb),0.3)] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined !text-3xl text-cyan-400 drop-shadow-lg">{t("icon_satellite_alt")}</span>
            </div>
            <span className="truncate">{t("tab_commlink")}</span>
          </h2>
          <div className="w-full">
            {posts.length === 0 ? (
              <div className="text-center py-16 opacity-50 text-xs font-black capitalize tracking-widest border border-dashed border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-3xl">{t("profile_no_posts")}</div>
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


