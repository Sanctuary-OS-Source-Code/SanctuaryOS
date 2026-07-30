import { getModIcon } from './shared';

export default function MasonProfileArtifacts({ filteredMods, onModClick, mason, activeGameSchema, isOwner, handlePin, t }: any) {
  return (
    <>
      {filteredMods.length === 0 && <div className="text-[10px] text-[var(--subtext)] opacity-60 font-bold uppercase tracking-widest text-center mt-10">{t("no_mods")}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
        {filteredMods.map((mod: any) => (
          <div key={mod.id} onClick={() => onModClick({ ...mod, author: mason.name, isNexusView: true })} className="relative flex flex-col h-full theme-glass-panel rounded-[var(--radius)] overflow-hidden transition-all duration-500 shadow-xl hover:shadow-2xl cursor-pointer hover:scale-[1.02] hover:border-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] group">
            <div className="relative z-20 h-40 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_2%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors duration-700 overflow-hidden">
              {mod.image_url ? (
                <img
                  src={mod.image_url}
                  alt={mod.name}
                  className="w-full h-full object-cover opacity-60 group-hover:opacity-80 group-hover:scale-110 transition-transform duration-700"
                />
              ) : (
                <span className="material-symbols-outlined text-[var(--subtext)] opacity-40 group-hover:opacity-60 group-hover:scale-110 group-hover:text-[var(--accent)] transition-all duration-700" style={{ fontSize: '120px' }}>
                  {getModIcon(mod, activeGameSchema, t)}
                </span>
              )}
              <div className="absolute top-4 left-4 z-30 pointer-events-auto">
                <div className={`backdrop-blur-md border px-3 py-1.5 rounded-xl shadow-2xl flex items-center gap-2 transition-all ${mod.status === 'verified' ? 'bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border-[color-mix(in_srgb,var(--success)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_15%,transparent)]' : 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)]'}`}>
                  <span className={`text-[8px] font-black uppercase tracking-widest ${mod.status === 'verified' ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                    {(() => {
                      let s = mod.status || 'UNVERIFIED';
                      s = s.replace(/[\[\]"]/g, "");
                      if (s.toUpperCase().includes('SANDBOX')) return 'SANDBOX';
                      return s;
                    })()}
                  </span>
                </div>
              </div>
              <div className="absolute top-4 right-4 flex flex-col items-end gap-2 z-30 pointer-events-auto">
                <span className="text-[8px] font-black px-3 py-1.5 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-md rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] uppercase tracking-widest pointer-events-none">
                  {mod.category_override || t("label_artifact") || "MOD"}
                </span>
              </div>
              <div className="absolute bottom-3 right-3 flex items-center gap-2 z-30 pointer-events-auto">
                {mod.is_early_access && (
                  <div className="px-2 py-1 bg-purple-500/10 border border-purple-500/30 rounded-lg flex items-center gap-1 shadow-[0_0_10px_rgba(168,85,247,0.1)] backdrop-blur-md">
                    <span className="material-symbols-outlined !text-[10px] text-purple-500">science</span>
                    <span className="text-[8px] font-black uppercase tracking-[0.1em] text-purple-500">{t("badge_early_access") || "Early Access"}</span>
                  </div>
                )}
                {mod.is_paid && (
                  <div className="px-2 py-1 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-center gap-1 shadow-[0_0_10px_rgba(234,179,8,0.1)] backdrop-blur-md">
                    <span className="material-symbols-outlined !text-[10px] text-yellow-500">monetization_on</span>
                    <span className="text-[8px] font-black uppercase tracking-[0.1em] text-yellow-500">{t("badge_paid") || "Paid"}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="p-5 flex flex-col flex-1">
              <h3 className="text-xs font-black truncate uppercase tracking-tight group-hover:theme-text-accent transition-colors mb-1">
                {mod.name}
              </h3>
              <p className="text-[9px] font-black text-[var(--text)]/30 uppercase tracking-widest truncate mb-2">
                {mason.name || "UNKNOWN MASON"}{(mod.latest_version) ? ` • ${mod.latest_version}` : ""}
              </p>
              {mod.description && (
                <p className="text-[10px] text-[var(--subtext)] opacity-70 line-clamp-2 leading-relaxed mb-4">
                  {mod.description}
                </p>
              )}

              <div className="mt-auto pt-4 flex items-center justify-between border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                <div className="flex items-center gap-2">
                  {(mod.isVirtual || mod.isParent || mod.familyCount > 1) && (
                    <span className="text-[8px] font-black px-3 py-1.5 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] rounded-lg uppercase tracking-widest flex items-center gap-1.5 shadow-sm">
                      <span className="material-symbols-outlined !text-[10px]">folder</span>
                      {mod.familyCount || (mod.flavors?.length || 0)} {t("items")}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-black theme-text-accent uppercase opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0 duration-300">{t("btn_view")}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
