import React, { useState } from 'react';
import { getModIcon, AccordionDrawer, DeferredRender, formatDisplayName, ActionPill } from './shared';
import { UniversalCard } from './components/universal/UniversalCard';

export default function MasonProfileArtifacts({ filteredMods, onModClick, mason, activeGameSchema, isOwner, handlePin, t }: any) {
  const [expandedFolder, setExpandedFolder] = useState<string | null>(null);
  const [drawerSearchQuery, setDrawerSearchQuery] = useState("");

  return (
    <>
      {filteredMods.length === 0 && <div className="text-[10px] text-[var(--subtext)] opacity-60 font-bold capitalize tracking-widest text-center mt-10">{t("no_mods")}</div>}
      <div className="grid grid-flow-row-dense grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
        {filteredMods.map((mod: any, index: number) => {
          const mainKey = mod.id || mod.hash || mod.name || String(index);
          const isFolder = mod.isVirtual || mod.isParent || mod.familyCount > 1;
          const renderedCard = (
            <UniversalCard
              layout="vertical"
              image={mod.image_url ? mod.image_url : undefined}
              icon={!mod.image_url ? getModIcon(mod, activeGameSchema, t) : undefined}
              title={mod.name}
              subtitle={`${mason.name || t("unknown_mason", "Unknown Creator")}${mod.latest_version ? ` • ${mod.latest_version}` : ""}`}
              onClick={() => {
                if (isFolder) {
                  setExpandedFolder(expandedFolder === mainKey ? null : mainKey);
                } else {
                  onModClick({ ...mod, author: mason.name, isNexusView: true });
                }
              }}
              imageOverlay={
                <>
                  <div className="absolute top-4 left-4 z-30 pointer-events-auto">
                    <div className={`glass-surface backdrop-blur-md border px-3 py-1 rounded-full shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)] flex items-center gap-2 transition-all ${(() => {
                      const s = (mod.status || 'UNVERIFIED').toLowerCase().replace(/[\[\]"]/g, "");
                      if (s === 'stable') return 'bg-[color-mix(in_srgb,var(--success)_8%,transparent)] border-[color-mix(in_srgb,var(--success)_22%,transparent)]';
                      if (s === 'unstable') return 'bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] border-[color-mix(in_srgb,var(--warning)_22%,transparent)]';
                      if (s === 'broken' || s === 'corrupted') return 'bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] border-[color-mix(in_srgb,var(--danger)_22%,transparent)]';
                      if (s === 'under review') return 'bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] border-[color-mix(in_srgb,var(--accent)_22%,transparent)]';
                      if (s === 'pending') return 'bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] border-[color-mix(in_srgb,var(--accent)_22%,transparent)]';
                      if (s === 'early access') return 'bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] border-[color-mix(in_srgb,var(--accent)_22%,transparent)]';
                      if (s === 'paid') return 'bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] border-[color-mix(in_srgb,var(--warning)_22%,transparent)]';
                      return 'bg-[color-mix(in_srgb,var(--text)_6%,transparent)] border-[color-mix(in_srgb,var(--text)_14%,transparent)]';
                    })()}`}>
                      <span className={`text-[8px] font-black capitalize tracking-widest ${(() => {
                        const s = (mod.status || 'UNVERIFIED').toLowerCase().replace(/[\[\]"]/g, "");
                        if (s === 'stable') return 'text-[var(--success)]';
                        if (s === 'unstable') return 'text-[var(--warning)]';
                        if (s === 'broken' || s === 'corrupted') return 'text-[var(--danger)]';
                        if (s === 'under review') return 'text-[var(--accent)]';
                        if (s === 'pending') return 'text-sky-300';
                        if (s === 'early access') return 'text-purple-300';
                        if (s === 'paid') return 'text-amber-300';
                        return 'text-[var(--subtext)]';
                      })()}`}>
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
                    <span className="text-[8px] font-black px-3 py-1 glass-surface bg-[color-mix(in_srgb,var(--text)_6%,transparent)] backdrop-blur-md rounded-full border border-[color-mix(in_srgb,var(--text)_14%,transparent)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)] text-[var(--text)] capitalize tracking-widest pointer-events-none">
                      {mod.category_override || t("label_artifact", "Artifact")}
                    </span>
                  </div>
                  <div className="absolute bottom-3 right-3 flex items-center gap-2 z-30 pointer-events-auto">
                    {mod.is_early_access && (
                      <div className="px-2.5 py-1 glass-surface bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] border border-[color-mix(in_srgb,var(--accent)_22%,transparent)] rounded-full flex items-center gap-1 shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)] backdrop-blur-md">
                        <span className="material-symbols-outlined !text-[10px] text-purple-300">{t("icon_science", "science")}</span>
                        <span className="text-[8px] font-black capitalize tracking-[0.1em] text-purple-300">{t("badge_early_access", "Early Access")}</span>
                      </div>
                    )}
                    {mod.is_paid && (
                      <div className="px-2.5 py-1 glass-surface bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] border border-[color-mix(in_srgb,var(--warning)_22%,transparent)] rounded-full flex items-center gap-1 shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)] backdrop-blur-md">
                        <span className="material-symbols-outlined !text-[10px] text-amber-300">{t("icon_monetization_on", "monetization_on")}</span>
                        <span className="text-[8px] font-black capitalize tracking-[0.1em] text-amber-300">{t("badge_paid", "Paid")}</span>
                      </div>
                    )}
                  </div>
                </>
              }
              className={`w-full h-full transition-all duration-300 ${expandedFolder === mainKey ? 'opacity-50 scale-[0.98] grayscale-[0.5] pointer-events-none' : ''}`}
              footer={
                <div className="flex items-center justify-between w-full pt-1 relative min-h-[16px]">
                  <span className="text-[8px] font-mono text-[var(--subtext)] opacity-50 capitalize tracking-widest">{mod.updated_at ? new Date(mod.updated_at).toLocaleDateString() : ""}</span>
                  
                  <div className="absolute inset-0 rounded-[inherit] flex items-center justify-center pointer-events-none">
                    {isFolder && (
                      <div className="group/hitbox static flex items-center justify-center gap-2 font-black text-[9px] capitalize tracking-widest text-[var(--subtext)] group-hover/hitbox:text-[var(--text)] transition-colors pointer-events-auto cursor-pointer" onClick={(e) => { e.stopPropagation(); setExpandedFolder(expandedFolder === mainKey ? null : mainKey); }}>
                        <div className="absolute inset-0 rounded-[inherit] z-0 pointer-events-auto" />
                        <span className="relative z-10 leading-none flex items-center mt-[2px]">{mod.familyCount || (mod.flavors?.length || 0)} {t("items", "Artifacts")}</span>
                        <span className={`relative z-10 material-symbols-outlined !text-[14px] transition-transform duration-300 ${expandedFolder === mainKey ? 'rotate-180' : ''}`}>{t("icon_expand_more", "expand_more")}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 relative z-40">
                    {!isFolder && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onModClick({ ...mod, author: mason.name, isNexusView: true }); }}
                        className="px-3 py-1.5 rounded-full glass-surface bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] text-[9px] font-black capitalize tracking-widest shadow-sm hover:scale-105 transition-all flex items-center gap-1.5 opacity-0 group-hover:opacity-100"
                      >
                        <span className="material-symbols-outlined !text-[12px]">{t("icon_download", "download")}</span>
                        <span>{t("update_panel_install", "Install")}</span>
                      </button>
                    )}
                  </div>
                </div>
              }
            >
              {mod.description && (
                <p className="text-[10px] text-[var(--subtext)] opacity-70 line-clamp-2 leading-relaxed mb-1">
                  {mod.description}
                </p>
              )}
            </UniversalCard>
          );

          return (
            <React.Fragment key={mainKey}>
              <div className="contents">
                {renderedCard}
              </div>

              <AccordionDrawer isOpen={expandedFolder === mainKey}>
                <div className="w-full glass-panel rounded-3xl p-8 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_20px_50px_rgba(0,0,0,0.3)] flex flex-col gap-8 relative isolate">
                  {/* Header */}
                  <div className="flex flex-wrap gap-4 items-center justify-start pb-6 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] relative z-10">
                    <div className="flex items-center gap-5">
                      <div className="w-12 h-12 rounded-xl glass-surface bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center shrink-0 shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)]">
                        <span className="material-symbols-outlined !text-[24px] text-[var(--accent)]">{t("icon_folder_open", "folder_open")}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-3">
                          <h3 className="text-2xl md:text-3xl font-black text-[var(--text)] capitalize tracking-widest leading-none">
                            {formatDisplayName(mod.displayName || mod.name)}
                          </h3>
                        </div>
                        <span className="text-[11px] font-black capitalize tracking-[0.2em] text-[var(--accent)] opacity-80 flex items-center gap-2 mt-1">
                          <span className="material-symbols-outlined !text-[14px]">{t("icon_account_tree", "account_tree")}</span>
                          {t("nav_exploring", "Exploring")} {(mod.flavors || []).length} {t("items", "Artifacts")}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 w-full md:w-auto">
                      <div className="relative flex-1 md:w-72">
                        <ActionPill
                          searchQuery={drawerSearchQuery}
                          setSearchQuery={(v: string) => setDrawerSearchQuery(v)}
                          searchPlaceholder={t("search_ph", "Search...")}
                        />
                      </div>
                      <button onClick={() => setExpandedFolder(null)} className="w-12 h-12 rounded-xl glass-surface hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:text-[var(--danger)] hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center text-[var(--text)] transition-all shadow-sm shrink-0">
                        <span className="material-symbols-outlined !text-[24px]">{t("icon_close", "close")}</span>
                      </button>
                    </div>
                  </div>

                  {/* Content Area */}
                  <div className="flex flex-col xl:flex-row gap-10 relative z-10">
                    <div className="w-full xl:w-[350px] shrink-0 flex flex-col relative pointer-events-none">
                      <div className="w-full relative">
                        {renderedCard}
                        <div className="absolute -bottom-10 -right-10 w-48 h-48 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] blur-[50px] rounded-full pointer-events-none z-[-1]" />
                      </div>
                    </div>
                    <div className="hidden xl:block w-px bg-gradient-to-b from-[color-mix(in_srgb,var(--text)_10%,transparent)] via-[color-mix(in_srgb,var(--text)_5%,transparent)] to-transparent" />
                    
                    <div className="flex-1 min-w-0">
                      <DeferredRender>
                        <div className="grid grid-cols-1 xl:grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-5 max-h-[500px] xl:max-h-[600px] overflow-y-auto custom-scrollbar p-6">
                        {(mod.flavors || [])
                          .filter((flavor: any) => {
                            if (!drawerSearchQuery) return true;
                            const query = drawerSearchQuery.toLowerCase();
                            return (flavor.displayName || flavor.name || "").toLowerCase().includes(query) || (flavor.author || "").toLowerCase().includes(query);
                          })
                          .map((flavor: any, subIdx: number) => (
                            <UniversalCard
                              key={`sub-${flavor.hash || flavor.name}-${subIdx}`}
                              layout="vertical"
                              image={flavor.image_url ? flavor.image_url : undefined}
                              icon={!flavor.image_url ? getModIcon(flavor, activeGameSchema, t) : undefined}
                              title={flavor.name}
                              subtitle={`${flavor.author || mason.name || t("unknown_mason", "Unknown Creator")}${flavor.version ? ` • ${flavor.version}` : ""}`}
                              onClick={() => onModClick({ ...flavor, author: flavor.author || mason.name, isNexusView: true })}
                              className="w-full h-full cursor-pointer hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)]"
                            />
                          ))}
                        </div>
                      </DeferredRender>
                    </div>
                  </div>
                </div>
              </AccordionDrawer>
            </React.Fragment>
          );
        })}
      </div>
    </>
  );
}




