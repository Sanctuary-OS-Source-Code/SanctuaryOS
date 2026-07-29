import { DashboardStatTile, getModIcon, stripMarkdown } from './shared';
import MasonPostCard from './MasonPostCard';

export default function MasonProfileOverview({ posts, mods, marketAssets, mason, setActiveView, setModCategory, setModSearch, setActiveAsset, setSelectedBlueprint, onModClick, activeGameSchema, handlePostClick, handleToggleLike, t }: any) {
  return (
    <div className="flex flex-col gap-8 w-full h-full overflow-y-auto custom-scrollbar content-start p-4 pb-32">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 w-full shrink-0">
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_satellite_alt") || "satellite_alt"}</span>} number={posts.length} label={t("tab_commlink") || "COMM-LINK"} colorClass={`border-cyan-500/30 text-cyan-500 hover:border-cyan-500 bg-cyan-500/10 hover:bg-cyan-500/20`} onClick={() => setActiveView("COMM-LINK")} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_account_balance") || "account_balance"}</span>} number={mods.length} label={t("items") || "ARTIFACTS"} colorClass={`border-teal-500/30 text-teal-500 hover:border-teal-500 bg-teal-500/10 hover:bg-teal-500/20`} onClick={() => { setActiveView("MODS"); setModCategory('ALL'); setModSearch(''); }} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_map") || "map"}</span>} number={marketAssets.filter((a: any) => a.asset_type === 'blueprint').length} label={t("playsets_title") || "BLUEPRINTS"} colorClass={`border-blue-500/30 text-blue-500 hover:border-blue-500 bg-blue-500/10 hover:bg-blue-500/20`} onClick={() => { setActiveView("BLUEPRINTS"); setModCategory('ALL'); setModSearch(''); }} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_translate") || "translate"}</span>} number={marketAssets.filter((a: any) => a.asset_type === 'lexicon').length} label={t("tab_lexicons") || "LEXICONS"} colorClass={`border-indigo-500/30 text-indigo-500 hover:border-indigo-500 bg-indigo-500/10 hover:bg-indigo-500/20`} onClick={() => { setActiveView("LEXICONS"); setModCategory('ALL'); setModSearch(''); }} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_palette") || "palette"}</span>} number={marketAssets.filter((a: any) => a.asset_type === 'chameleon').length} label={t("type_theme") || "CHAMELEONS"} colorClass={`border-purple-500/30 text-purple-500 hover:border-purple-500 bg-purple-500/10 hover:bg-purple-500/20`} onClick={() => { setActiveView("CHAMELEONS"); setModCategory('ALL'); setModSearch(''); }} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_draw")}</span>} number={marketAssets.filter((a: any) => a.asset_type === 'workbench_template').length} label={t("ql_templates") || "TEMPLATES"} colorClass={`border-pink-500/30 text-pink-500 hover:border-pink-500 bg-pink-500/10 hover:bg-pink-500/20`} onClick={() => { setActiveView("TEMPLATES"); setModCategory('ALL'); setModSearch(''); }} />
      </div>

      <div className="flex flex-col lg:flex-row gap-8 w-full h-full min-h-0">
        <div className="flex-1 flex flex-col gap-6 min-w-0">
          <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-3 min-w-[200px] shrink-0 mb-4">
            <div className="w-12 h-12 rounded-xl theme-glass-panel border border-cyan-500/30 shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined !text-2xl text-cyan-400 opacity-90 drop-shadow-lg">{t("icon_satellite_alt")}</span>
            </div>
            <span className="truncate">{t("tab_commlink")}</span>
          </h2>
          <div className="w-full">
            {posts.length === 0 ? (
              <div className="text-center py-12 opacity-50 text-xs font-black uppercase tracking-widest">{t("profile_no_posts")}</div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
                {posts.map((p: any, index: number) => (
                  <div key={p.id} className="break-inside-avoid">
                    <MasonPostCard
                      post={p}
                      index={index}
                      onPostClick={handlePostClick}
                      onToggleLike={handleToggleLike}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="w-full lg:w-[420px] shrink-0 flex flex-col gap-6">
          <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-3 min-w-[200px] shrink-0 mb-4">
            <div className="w-12 h-12 rounded-xl theme-glass-panel border border-amber-500/30 shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined !text-2xl text-amber-500 opacity-90 drop-shadow-lg">workspace_premium</span>
            </div>
            <span className="truncate">{t("showcase") || "Showcase"}</span>
          </h2>

          {mods.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="text-[10px] font-black theme-text-accent uppercase tracking-widest pl-2 opacity-80">{t("latest_artifact") || "Latest Artifact"}</h3>
              {(() => {
                const mod = mods[0];
                return (
                  <div onClick={() => onModClick({ ...mod, author: mason.name, isNexusView: true })} className="relative flex flex-col theme-glass-panel rounded-[var(--radius)] overflow-hidden transition-all duration-500 shadow-xl hover:shadow-2xl cursor-pointer hover:scale-[1.02] hover:border-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] group">
                    <div className="relative z-20 h-40 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_2%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors duration-700 overflow-hidden">
                      {mod.image_url ? (
                        <img src={mod.image_url} alt={mod.name} className="w-full h-full object-cover opacity-60 group-hover:opacity-80 group-hover:scale-110 transition-transform duration-700" />
                      ) : (
                        <span className="material-symbols-outlined text-[var(--subtext)] opacity-40 group-hover:opacity-60 group-hover:scale-110 group-hover:text-[var(--accent)] transition-all duration-700" style={{ fontSize: '80px' }}>{getModIcon(mod, activeGameSchema, t)}</span>
                      )}
                      <div className="absolute top-3 right-3 flex gap-2 z-30">
                        <span className="text-[8px] font-black px-3 py-1.5 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-md rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] uppercase tracking-widest">{mod.category_override || "MOD"}</span>
                      </div>
                    </div>
                    <div className="p-4 flex flex-col flex-1">
                      <h3 className="text-xs font-black truncate uppercase tracking-tight group-hover:theme-text-accent transition-colors mb-1">{mod.name}</h3>
                      <p className="text-[9px] font-black text-[var(--text)]/30 uppercase tracking-widest truncate mb-2">{mason.name}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[8px] font-mono text-[var(--subtext)] opacity-50 uppercase tracking-widest">{new Date(mod.created_at).toLocaleDateString()}</span>
                        <span className="text-[10px] font-black theme-text-accent uppercase opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0 duration-300">{t("btn_view")}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {marketAssets.length > 0 && (
            <div className="flex flex-col gap-3 mt-4">
              <h3 className="text-[10px] font-black theme-text-accent uppercase tracking-widest pl-2 opacity-80">{t("latest_asset") || "Latest Asset"}</h3>
              {(() => {
                const asset = marketAssets[0];
                const isBlueprint = asset.asset_type === 'blueprint';
                const icon = isBlueprint ? t("icon_map") : asset.asset_type === 'lexicon' ? t("icon_translate") : asset.asset_type === 'chameleon' ? t("icon_palette") : t("icon_draw");

                return (
                  <div onClick={() => {
                    if (isBlueprint) {
                      setSelectedBlueprint(asset);
                    } else {
                      setActiveAsset({ type: asset.asset_type, id: asset.id });
                    }
                  }} className="relative flex flex-col theme-glass-panel rounded-[var(--radius)] overflow-hidden transition-all duration-500 shadow-xl hover:shadow-2xl cursor-pointer hover:scale-[1.02] hover:border-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] group">
                    <div className="relative z-20 h-40 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_2%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors duration-700 overflow-hidden">
                      {asset.image_url ? (
                        <img src={asset.image_url} alt={asset.name} className="w-full h-full object-cover opacity-60 group-hover:opacity-80 group-hover:scale-110 transition-transform duration-700" />
                      ) : (
                        <span className="material-symbols-outlined text-[var(--subtext)] opacity-40 group-hover:opacity-60 group-hover:scale-110 group-hover:text-[var(--accent)] transition-all duration-700" style={{ fontSize: '80px' }}>{icon}</span>
                      )}
                      <div className="absolute top-3 right-3 flex gap-2 z-30">
                        <span className="text-[8px] font-black px-3 py-1.5 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-md rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] uppercase tracking-widest">{t(asset.asset_type) || asset.asset_type}</span>
                      </div>
                    </div>
                    <div className="p-4 flex flex-col flex-1">
                      <h3 className="text-xs font-black truncate uppercase tracking-tight group-hover:theme-text-accent transition-colors mb-1">{asset.name}</h3>
                      <p className="text-[9px] font-black text-[var(--text)]/30 uppercase tracking-widest truncate mb-2">{mason.name}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[8px] font-mono text-[var(--subtext)] opacity-50 uppercase tracking-widest">{new Date(asset.created_at).toLocaleDateString()}</span>
                        <span className="text-[10px] font-black theme-text-accent uppercase opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0 duration-300">{t("btn_view")}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
