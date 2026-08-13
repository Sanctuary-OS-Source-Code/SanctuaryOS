import { DashboardStatTile, getModIcon, stripMarkdown } from './shared';
import MasonPostCard from './MasonPostCard';
import { UniversalCard } from './components/universal/UniversalCard';

export default function MasonProfileOverview({ posts, mods, marketAssets, mason, setActiveView, setModCategory, setModSearch, setActiveAsset, setSelectedBlueprint, onModClick, activeGameSchema, handlePostClick, handleToggleLike, isOwner, onEditShowcase, t }: any) {
  return (
    <div className="flex flex-col gap-8 w-full h-full overflow-y-auto custom-scrollbar content-start p-4 pb-32">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 w-full shrink-0">
        <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_account_balance")}</span>} number={mods.length} label={t("items")} colorClass={`text-teal-500`} onClick={() => { setActiveView("MODS"); setModCategory('ALL'); setModSearch(''); }} />
        <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_map")}</span>} number={marketAssets.filter((a: any) => a.asset_type === 'blueprint').length} label={t("playsets_title")} colorClass={`text-blue-500`} onClick={() => { setActiveView("BLUEPRINTS"); setModCategory('ALL'); setModSearch(''); }} />
        <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_translate")}</span>} number={marketAssets.filter((a: any) => a.asset_type === 'lexicon').length} label={t("tab_lexicons")} colorClass={`text-indigo-500`} onClick={() => { setActiveView("LEXICONS"); setModCategory('ALL'); setModSearch(''); }} />
        <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_palette")}</span>} number={marketAssets.filter((a: any) => a.asset_type === 'chameleon').length} label={t("type_theme")} colorClass={`text-purple-500`} onClick={() => { setActiveView("CHAMELEONS"); setModCategory('ALL'); setModSearch(''); }} />
        <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_draw")}</span>} number={marketAssets.filter((a: any) => a.asset_type === 'workbench_template').length} label={t("ql_templates")} colorClass={`text-pink-500`} onClick={() => { setActiveView("TEMPLATES"); setModCategory('ALL'); setModSearch(''); }} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_480px] 2xl:grid-cols-[1fr_560px] gap-8 w-full h-full min-h-0">

        {/* COMM-LINK on left */}
        <div className="flex flex-col gap-6 min-w-0 h-full">
          <h2 className="text-xl font-black capitalize tracking-widest text-[var(--text)] flex items-center gap-3 min-w-[200px] shrink-0 mb-4">
            <div className="w-12 h-12 rounded-xl glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined !text-2xl text-cyan-400 opacity-90 drop-shadow-lg">{t("icon_satellite_alt")}</span>
            </div>
            <span className="truncate">{t("tab_commlink")}</span>
          </h2>
          <div className="w-full">
            {posts.length === 0 ? (
              <div className="text-center py-12 opacity-50 text-xs font-black capitalize tracking-widest">{t("profile_no_posts")}</div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
                {posts.map((p: any, index: number) => (
                  <div key={p.id} className="break-inside-avoid">
                    <MasonPostCard post={p} index={index} onPostClick={handlePostClick} onToggleLike={handleToggleLike} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* SHOWCASE on right */}
        <div className="w-full flex flex-col gap-6 h-full">
          <div className="flex items-center justify-start w-full gap-4 mb-2">
            <h2 className="text-xl font-black capitalize tracking-widest text-[var(--text)] flex items-center gap-3 min-w-[200px] shrink-0">
              <div className="w-12 h-12 rounded-xl glass-panel border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined !text-2xl text-amber-500 opacity-90 drop-shadow-lg">workspace_premium</span>
              </div>
              <span className="truncate">{t("showcase")}</span>
            </h2>
            {isOwner && (
              <button
                onClick={onEditShowcase}
                className="theme-glass-button h-10 px-4 rounded-xl flex items-center gap-2 text-xs font-black capitalize tracking-widest text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] transition-colors shrink-0"
              >
                <span className="material-symbols-outlined !text-lg">edit</span>
                {t("edit")}
              </button>
            )}
          </div>

          <div className="flex flex-col gap-10 w-full">
            {mods.length > 0 && (
              <div className="flex flex-col gap-4">
                <h3 className="text-[14px] font-black text-[color-mix(in_srgb,var(--text)_50%,transparent)] capitalize tracking-widest pl-2">{t("latest_artifact")}</h3>
                {(() => {
                  const showcaseMod = mods.find((m: any) => m.id === mason?.pinned_mod_id || m.id === mason?.pinned_ccset_id) || mods[0];
                  const otherMods = mods.filter((m: any) => m.id !== showcaseMod.id).slice(0, 2);
                  return (
                    <div className="flex flex-col gap-3">
                      <UniversalCard
                        layout="horizontal"
                        image={showcaseMod.image_url ? showcaseMod.image_url : undefined}
                        icon={!showcaseMod.image_url ? getModIcon(showcaseMod, activeGameSchema, t) : undefined}
                        title={showcaseMod.name}
                        subtitle={mason.name}
                        onClick={() => onModClick({ ...showcaseMod, author: mason.name, isNexusView: true })}
                        badges={
                          <>
                            {showcaseMod.status === 'verified' && (
                              <span className="text-[9px] font-black capitalize tracking-widest text-[var(--success)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] px-2 py-0.5 rounded-full shadow-sm border border-[color-mix(in_srgb,var(--success)_30%,transparent)] flex items-center gap-1 backdrop-blur-md">
                                <span className="material-symbols-outlined !text-[12px]">verified</span>
                                {t("verified")}
                              </span>
                            )}
                            <span className="text-[9px] font-black px-2 py-0.5 bg-[color-mix(in_srgb,var(--bg)_40%,transparent)] backdrop-blur-md rounded-full border border-[color-mix(in_srgb,var(--text)_15%,transparent)] shadow-sm text-[var(--text)] capitalize tracking-widest">{showcaseMod.category_override || t("label_artifact")}</span>
                            {showcaseMod.is_early_access && (
                              <span className="text-[9px] font-black capitalize tracking-widest text-purple-400 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-2 py-0.5 rounded-full shadow-sm border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] backdrop-blur-md">{t("badge_early_access")}</span>
                            )}
                            {showcaseMod.is_paid && (
                              <span className="text-[9px] font-black capitalize tracking-widest text-yellow-400 bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-2 py-0.5 rounded-full shadow-sm border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] backdrop-blur-md">{t("badge_paid")}</span>
                            )}
                          </>
                        }
                        className="w-full"
                      >
                        <div className="flex items-center justify-start w-full mt-1">
                          {(mason?.pinned_mod_id === showcaseMod.id || mason?.pinned_ccset_id === showcaseMod.id) ? (
                            <div className="px-2 py-1 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] rounded-full flex items-center gap-1 shadow-md shrink-0 backdrop-blur-md">
                              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">push_pin</span>
                              <span className="text-[9px] font-black capitalize tracking-widest text-[var(--accent)]">{t("pinned")}</span>
                            </div>
                          ) : <div />}
                          <div className="flex items-center gap-4">
                            <span className="text-[8px] font-mono text-[var(--subtext)] opacity-50 capitalize tracking-widest">{new Date(showcaseMod.created_at).toLocaleDateString()}</span>
                            <span className="text-[10px] font-black theme-text-accent capitalize opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0 duration-300">{t("btn_view")}</span>
                          </div>
                        </div>
                      </UniversalCard>
                      {otherMods.length > 0 && (
                        <div className="grid grid-cols-2 gap-3">
                          {otherMods.map((mod: any) => (
                            <UniversalCard
                              key={mod.id}
                              layout="compact"
                              image={mod.image_url ? mod.image_url : undefined}
                              icon={!mod.image_url ? getModIcon(mod, activeGameSchema, t) : undefined}
                              title={mod.name}
                              subtitle={<span className="text-[9px] font-mono opacity-50">{new Date(mod.created_at).toLocaleDateString()}</span>}
                              onClick={() => onModClick({ ...mod, author: mason.name, isNexusView: true })}
                              badges={
                                <>
                                  {mod.status === 'verified' && (
                                    <span className="text-[8px] font-black capitalize tracking-widest text-[var(--success)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] px-1.5 py-0.5 rounded-full shadow-sm border border-[color-mix(in_srgb,var(--success)_30%,transparent)] flex items-center gap-0.5 backdrop-blur-md">
                                      <span className="material-symbols-outlined !text-[10px]">verified</span>
                                    </span>
                                  )}
                                  <span className="text-[8px] font-black text-[color-mix(in_srgb,var(--text)_80%,transparent)] capitalize tracking-widest truncate border border-[color-mix(in_srgb,var(--text)_15%,transparent)] px-1.5 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--bg)_40%,transparent)] shadow-sm backdrop-blur-md">{mod.category_override || t("label_artifact")}</span>
                                  {mod.is_early_access && (
                                    <span className="text-[8px] font-black capitalize tracking-widest text-purple-400 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-1.5 py-0.5 rounded-full shadow-sm border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] backdrop-blur-md">EA</span>
                                  )}
                                  {mod.is_paid && (
                                    <span className="text-[8px] font-black capitalize tracking-widest text-yellow-400 bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-1.5 py-0.5 rounded-full shadow-sm border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] backdrop-blur-md">$</span>
                                  )}
                                </>
                              }
                              className="w-full h-full"
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
              <div className="flex flex-col gap-4">
                <h3 className="text-[14px] font-black text-[color-mix(in_srgb,var(--text)_50%,transparent)] capitalize tracking-widest pl-2">{t("latest_asset")}</h3>
                {(() => {
                  const showcaseAsset = marketAssets.find((a: any) => a.id === mason?.pinned_asset_id || a.id === mason?.pinned_blueprint_id) || marketAssets[0];
                  const otherAssets = marketAssets.filter((a: any) => a.id !== showcaseAsset.id).slice(0, 2);
                  const isBlueprint = showcaseAsset.asset_type === 'blueprint';
                  const icon = isBlueprint ? t("icon_map") : showcaseAsset.asset_type === 'lexicon' ? t("icon_translate") : showcaseAsset.asset_type === 'chameleon' ? t("icon_palette") : t("icon_draw");

                  return (
                    <div className="flex flex-col gap-3">
                      <UniversalCard
                        layout="horizontal"
                        image={showcaseAsset.image_url ? showcaseAsset.image_url : undefined}
                        icon={!showcaseAsset.image_url ? icon : undefined}
                        title={showcaseAsset.name}
                        subtitle={mason.name}
                        onClick={() => {
                          if (isBlueprint) {
                            setSelectedBlueprint(showcaseAsset);
                          } else {
                            setActiveAsset({ type: showcaseAsset.asset_type, id: showcaseAsset.id });
                          }
                        }}
                        badges={
                          <span className="text-[9px] font-black px-2 py-0.5 bg-[color-mix(in_srgb,var(--bg)_40%,transparent)] backdrop-blur-md rounded-full border border-[color-mix(in_srgb,var(--text)_15%,transparent)] shadow-sm text-[var(--text)] capitalize tracking-widest">{t(showcaseAsset.asset_type) || showcaseAsset.asset_type}</span>
                        }
                        className="w-full"
                      >
                        <div className="flex items-center justify-start w-full mt-1">
                          {(mason?.pinned_asset_id === showcaseAsset.id || mason?.pinned_blueprint_id === showcaseAsset.id) ? (
                            <div className="px-2 py-1 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] rounded-full flex items-center gap-1 shadow-md shrink-0 backdrop-blur-md">
                              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">push_pin</span>
                              <span className="text-[9px] font-black capitalize tracking-widest text-[var(--accent)]">{t("pinned")}</span>
                            </div>
                          ) : <div />}
                          <div className="flex items-center gap-4">
                            <span className="text-[8px] font-mono text-[var(--subtext)] opacity-50 capitalize tracking-widest">{new Date(showcaseAsset.created_at).toLocaleDateString()}</span>
                            <span className="text-[10px] font-black theme-text-accent capitalize opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0 duration-300">{t("btn_view")}</span>
                          </div>
                        </div>
                      </UniversalCard>
                      {otherAssets.length > 0 && (
                        <div className="grid grid-cols-2 gap-3">
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
                                subtitle={<span className="text-[9px] font-mono opacity-50">{new Date(asset.created_at).toLocaleDateString()}</span>}
                                onClick={() => {
                                  if (isBp) {
                                    setSelectedBlueprint(asset);
                                  } else {
                                    setActiveAsset({ type: asset.asset_type, id: asset.id });
                                  }
                                }}
                                badges={
                                  <>
                                    <span className="text-[8px] font-black text-[color-mix(in_srgb,var(--text)_80%,transparent)] capitalize tracking-widest truncate border border-[color-mix(in_srgb,var(--text)_15%,transparent)] px-1.5 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--bg)_40%,transparent)] shadow-sm backdrop-blur-md">{t(asset.asset_type) || asset.asset_type}</span>
                                    {asset.is_early_access && (
                                      <span className="text-[8px] font-black capitalize tracking-widest text-purple-400 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-1.5 py-0.5 rounded-full shadow-sm border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] backdrop-blur-md">EA</span>
                                    )}
                                    {asset.is_paid && (
                                      <span className="text-[8px] font-black capitalize tracking-widest text-yellow-400 bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-1.5 py-0.5 rounded-full shadow-sm border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] backdrop-blur-md">$</span>
                                    )}
                                  </>
                                }
                                className="w-full h-full"
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
      </div>
    </div>
  );
}
