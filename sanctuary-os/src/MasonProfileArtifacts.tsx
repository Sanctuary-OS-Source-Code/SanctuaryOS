import { getModIcon } from './shared';
import { UniversalCard } from './components/universal/UniversalCard';

export default function MasonProfileArtifacts({ filteredMods, onModClick, mason, activeGameSchema, isOwner, handlePin, t }: any) {
  return (
    <>
      {filteredMods.length === 0 && <div className="text-[10px] text-[var(--subtext)] opacity-60 font-bold uppercase tracking-widest text-center mt-10">{t("no_mods")}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
        {filteredMods.map((mod: any) => (
          <UniversalCard
            key={mod.id}
            layout="vertical"
            image={mod.image_url ? mod.image_url : undefined}
            icon={!mod.image_url ? getModIcon(mod, activeGameSchema, t) : undefined}
            title={mod.name}
            subtitle={`${mason.name || "UNKNOWN MASON"}${mod.latest_version ? ` • ${mod.latest_version}` : ""}`}
            onClick={() => onModClick({ ...mod, author: mason.name, isNexusView: true })}
            imageOverlay={
              <>
                <div className="absolute top-4 left-4 z-30 pointer-events-auto">
                  <div className={`backdrop-blur-md border px-3 py-1.5 rounded-xl shadow-2xl flex items-center gap-2 transition-all ${mod.status === 'verified' ? 'bg-emerald-500/[10%] border-emerald-500/[30%]' : 'bg-red-500/[10%] border-red-500/[30%]'}`}>
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
                    <div className="px-2 py-1 bg-purple-500/10 border border-purple-500/30 rounded-lg flex items-center gap-1 shadow-md backdrop-blur-md">
                      <span className="material-symbols-outlined !text-[10px] text-purple-500">science</span>
                      <span className="text-[8px] font-black uppercase tracking-[0.1em] text-purple-500">{t("badge_early_access") || "Early Access"}</span>
                    </div>
                  )}
                  {mod.is_paid && (
                    <div className="px-2 py-1 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-center gap-1 shadow-md backdrop-blur-md">
                      <span className="material-symbols-outlined !text-[10px] text-yellow-500">monetization_on</span>
                      <span className="text-[8px] font-black uppercase tracking-[0.1em] text-yellow-500">{t("badge_paid") || "Paid"}</span>
                    </div>
                  )}
                </div>
              </>
            }
            className="w-full h-full"
            footer={
              <div className="flex items-center justify-between w-full pt-1">
                <div className="flex items-center gap-2">
                  {(mod.isVirtual || mod.isParent || mod.familyCount > 1) && (
                    <span className="text-[8px] font-black px-3 py-1.5 bg-[var(--accent)]/[10%] border border-[var(--accent)]/[20%] text-[var(--accent)] rounded-lg uppercase tracking-widest flex items-center gap-1.5 shadow-sm">
                      <span className="material-symbols-outlined !text-[10px]">folder</span>
                      {mod.familyCount || (mod.flavors?.length || 0)} {t("items")}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-black theme-text-accent uppercase opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0 duration-300">
                  {t("btn_view")}
                </span>
              </div>
            }
          >
            {mod.description && (
              <p className="text-[10px] text-[var(--subtext)] opacity-70 line-clamp-2 leading-relaxed mb-1">
                {mod.description}
              </p>
            )}
          </UniversalCard>
        ))}
      </div>
    </>
  );
}
