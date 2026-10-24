import React, { useState } from 'react';
import { getModIcon, AccordionDrawer, DeferredRender, formatDisplayName } from './shared';
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
                <div className="absolute top-3 left-3 z-30 flex items-center gap-1.5 pointer-events-none">
                  {(() => {
                    const s = (mod.status || 'UNVERIFIED').toLowerCase().replace(/[\[\]"]/g, "");
                    const isSandbox = s.toUpperCase().includes('SANDBOX');
                    const icon = isSandbox
                      ? t("icon_science", "science")
                      : s === 'stable' || s === 'verified'
                        ? t("icon_verified", "verified")
                        : s === 'unstable'
                          ? t("icon_warning", "warning")
                          : s === 'broken' || s === 'corrupted'
                            ? t("icon_error", "error")
                            : s === 'under review' || s === 'pending'
                              ? t("icon_schedule", "schedule")
                              : t("icon_science", "science");
                    const iconColor = s === 'stable' || s === 'verified'
                      ? 'text-[var(--success)]'
                      : s === 'unstable'
                        ? 'text-[var(--warning)]'
                        : s === 'broken' || s === 'corrupted'
                          ? 'text-[var(--danger)]'
                          : 'text-[var(--accent)]';
                    const label = isSandbox ? t("studio_badge_sandbox", "Sandbox") : s;
                    return (
                      <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                        <span className={`material-symbols-outlined !text-[12px] ${iconColor}`}>{icon}</span>
                        <span>{label}</span>
                      </div>
                    );
                  })()}
                </div>
              }
              badges={
                <>
                  <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                    <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                      {String(mod.category_override || mod.name || "").toLowerCase().includes("script") ? t("icon_terminal", "terminal") : t("icon_deployed_code", "deployed_code")}
                    </span>
                    <span className="text-[var(--subtext)]">{mod.category_override || t("label_artifact", "Artifact")}</span>
                  </div>
                  {mod.is_early_access && (
                    <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                      <span className="material-symbols-outlined !text-[12px] text-purple-400">{t("icon_science", "science")}</span>
                      <span>{t("badge_early_access", "Early Access")}</span>
                    </div>
                  )}
                  {mod.is_paid && (
                    <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                      <span className="material-symbols-outlined !text-[12px] text-amber-400">{t("icon_monetization_on", "monetization_on")}</span>
                      <span>{t("badge_paid", "Paid")}</span>
                    </div>
                  )}
                </>
              }
              className={`w-full h-full transition-colors transition-shadow duration-300 ${expandedFolder === mainKey ? '!border-[color-mix(in_srgb,var(--accent)_65%,transparent)] shadow-[0_0_25px_color-mix(in_srgb,var(--accent)_18%,transparent)]' : ''}`}
              footer={
                <div className="flex items-center justify-between w-full pt-1 relative min-h-[16px] gap-2">
                  <div className="flex items-center gap-1.5">
                    {isFolder ? (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setExpandedFolder(expandedFolder === mainKey ? null : mainKey); }}
                        className={`px-2.5 py-1 rounded-lg glass-surface border text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer ${expandedFolder === mainKey ? 'border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)]' : 'border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)]'}`}
                      >
                        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{t("icon_account_tree", "account_tree")}</span>
                        <span>+{mod.familyCount || (mod.flavors?.length || 0)} {t("badge_modules_count", "Modules")}</span>
                        <span className={`material-symbols-outlined !text-[13px] transition-transform duration-300 ${expandedFolder === mainKey ? 'rotate-180 text-[var(--accent)]' : 'text-[var(--subtext)]'}`}>{t("icon_expand_more", "expand_more")}</span>
                      </button>
                    ) : (
                      <span className="text-[8px] font-mono text-[var(--subtext)] opacity-50 capitalize tracking-widest">{mod.updated_at ? new Date(mod.updated_at).toLocaleDateString() : ""}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 relative z-40 ml-auto">
                    {isFolder && mod.updated_at && (
                      <span className="text-[8px] font-mono text-[var(--subtext)] opacity-50 capitalize tracking-widest">{new Date(mod.updated_at).toLocaleDateString()}</span>
                    )}
                    {!isFolder && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onModClick({ ...mod, author: mason.name, isNexusView: true }); }}
                        className="px-3 py-1.5 rounded-full glass-surface bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] text-[9px] font-black capitalize tracking-widest shadow-sm hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] transition-colors flex items-center gap-1.5 opacity-0 group-hover:opacity-100"
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
                <div className="w-full glass-panel rounded-3xl p-6 md:p-7 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] shadow-[0_20px_50px_rgba(0,0,0,0.3)] flex flex-col gap-6 relative isolate">
                  {/* Header */}
                  <div className="flex flex-wrap gap-4 items-center justify-between pb-5 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] relative z-20">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-11 h-11 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined !text-[22px] text-[var(--accent)]">{t("icon_folder_open", "folder_open")}</span>
                      </div>
                      <div className="flex flex-col gap-1 min-w-0">
                        <h3 className="text-xl md:text-2xl font-black text-[var(--text)] capitalize tracking-wider leading-tight truncate">
                          {formatDisplayName(mod.displayName || mod.name)}
                        </h3>
                        <span className="text-[10px] font-black capitalize tracking-[0.18em] text-[var(--accent)] opacity-90 flex items-center gap-1.5">
                          <span className="material-symbols-outlined !text-[13px]">{t("icon_account_tree", "account_tree")}</span>
                          {t("nav_exploring", "Exploring")} {(mod.flavors || []).length} {t("items", "Artifacts")}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 w-full md:w-auto ml-auto">
                      <div className="relative flex-1 md:w-72 flex items-center h-10 px-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus-within:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] transition-colors">
                        <span className="material-symbols-outlined !text-[16px] text-[var(--subtext)] mr-2.5 shrink-0">{t("icon_search", "search")}</span>
                        <input
                          type="text"
                          value={drawerSearchQuery}
                          onChange={(e) => setDrawerSearchQuery(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          placeholder={t("search_ph", "Search...")}
                          className="w-full bg-transparent border-none outline-none text-[11px] font-bold text-[var(--text)] placeholder:text-[var(--subtext)]/50 tracking-wider"
                        />
                        {drawerSearchQuery && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setDrawerSearchQuery(""); }}
                            className="w-5 h-5 rounded-md flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] transition-colors shrink-0 ml-1 cursor-pointer"
                          >
                            <span className="material-symbols-outlined !text-[14px]">{t("icon_close", "close")}</span>
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setDrawerSearchQuery(""); setExpandedFolder(null); }}
                        className="w-10 h-10 rounded-xl glass-surface hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] hover:text-[var(--danger)] hover:border-[color-mix(in_srgb,var(--danger)_35%,transparent)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center text-[var(--subtext)] transition-colors shrink-0 cursor-pointer"
                      >
                        <span className="material-symbols-outlined !text-[18px]">{t("icon_close", "close")}</span>
                      </button>
                    </div>
                  </div>

                  {/* Content Area */}
                  <div className="w-full relative z-10">
                    <DeferredRender>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5 max-h-[520px] overflow-y-auto custom-scrollbar p-1">
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
              </AccordionDrawer>
            </React.Fragment>
          );
        })}
      </div>
    </>
  );
}




