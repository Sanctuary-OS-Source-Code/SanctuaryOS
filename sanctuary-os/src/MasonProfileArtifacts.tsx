import React, { useState } from 'react';
import { getModIcon, AccordionDrawer, DeferredRender, formatDisplayName, EmptyState, HoverTooltip, stripMarkdown } from './shared';
import { UniversalCard } from './components/universal/UniversalCard';
import { DynamicArtifactPreviewBanner } from './chameleon-components/ThemeCard';
import { useStore } from './store';
import { openSanctuaryContextMenu, SanctuaryContextMenuItem } from './ContextMenu';

const formatModCardTitle = (mod: any) => {
  const raw =
    String(mod?.displayName || mod?.name || "")
      .split(/[\\/]/)
      .pop() || "";
  return (
    raw
      .replace(/\.(package|ts4script|zip|rar|7z|json|dll|asi|lua|reds|csx)$/i, "")
      .replace(/_/g, " ")
      .trim() ||
    mod?.name ||
    ""
  );
};

export default function MasonProfileArtifacts({ filteredMods, onModClick, mason, activeGameSchema, isSidePanel, t }: any) {
  const [expandedFolder, setExpandedFolder] = useState<string | null>(null);
  const [drawerSearchQuery, setDrawerSearchQuery] = useState("");
  const showImages = useStore((state: any) => state.showImages);

  const sortedMods = [...(filteredMods || [])].sort((a: any, b: any) => {
    const aPin = mason?.pinned_mod_id === a?.id || mason?.pinned_ccset_id === a?.id ? 1 : 0;
    const bPin = mason?.pinned_mod_id === b?.id || mason?.pinned_ccset_id === b?.id ? 1 : 0;
    if (bPin !== aPin) return bPin - aPin;
    return 0;
  });

  const gridColsClass = isSidePanel
    ? "grid grid-flow-row-dense grid-cols-1 sm:grid-cols-2 gap-4"
    : "grid grid-flow-row-dense grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6";

  return (
    <>
      {sortedMods.length === 0 && (
        <EmptyState icon={t("icon_deployed_code", "deployed_code")} title={t("no_mods", "No {mods} deployed.")} minHeightClass="min-h-[300px]" />
      )}
      <div className={gridColsClass}>
        {sortedMods.map((mod: any, index: number) => {
          const mainKey = mod.id || mod.hash || mod.name || String(index);
          const isFolder = mod.isVirtual || mod.isParent || mod.familyCount > 1;
          const isPinned = Boolean(mason?.pinned_mod_id === mod.id || mason?.pinned_ccset_id === mod.id);
          const cleanedTitle = formatModCardTitle(mod);
          const enrichedMod = {
            ...mod,
            author:
              mod.author && !String(mod.author).toLowerCase().includes("unknown")
                ? mod.author
                : mason?.name || mod.author,
            status:
              !mod.status || String(mod.status).toLowerCase() === "unverified"
                ? "verified"
                : mod.status,
          };
          const renderedCard = (
            <UniversalCard
              layout="vertical"
              isActive={expandedFolder === mainKey}
              image={showImages !== false && mod.image_url ? mod.image_url : undefined}
              icon={!mod.image_url ? getModIcon(mod, activeGameSchema, t) : undefined}
              customIcon={
                <DynamicArtifactPreviewBanner
                  data={enrichedMod}
                  icon={getModIcon(mod, activeGameSchema, t)}
                  heightClass="h-full"
                />
              }
              title={cleanedTitle}
              subtitle={`${mason.name || t("unknown_mason", "Unknown {Mason}")}${mod.latest_version ? ` • ${mod.latest_version}` : ""}`}
              onClick={() => {
                onModClick({ ...mod, author: mason.name, isNexusView: true });
              }}
              onContextMenu={(e) => {
                const items: SanctuaryContextMenuItem[] = [
                  {
                    id: "inspect",
                    label: t("btn_inspect", "Inspect {Mod}"),
                    icon: t("icon_open_in_new", "open_in_new"),
                    variant: "accent",
                    onClick: () => onModClick({ ...mod, author: mason.name, isNexusView: true }),
                  },
                ];
                if (isFolder) {
                  const isExpanded = expandedFolder === mainKey;
                  const count = mod.familyCount || (mod.flavors?.length || 0);
                  items.push({
                    id: "explore",
                    label: isExpanded
                      ? t("btn_close", "Close")
                      : `${t("nav_exploring", "Exploring")} (${count})`,
                    icon: t("icon_account_tree", "account_tree"),
                    onClick: () => setExpandedFolder(isExpanded ? null : mainKey),
                  });
                }
                openSanctuaryContextMenu(e, {
                  title: cleanedTitle,
                  subtitle: mason.name || t("unknown_mason", "Unknown {Mason}"),
                  statusLabel: isPinned ? t("pinned", "Pinned") : mod.latest_version || undefined,
                  icon: getModIcon(mod, activeGameSchema, t),
                  items,
                });
              }}
              imageOverlay={
                <div className="absolute top-3 left-3 z-30 flex flex-wrap items-center gap-1.5 pointer-events-none">
                  {isPinned && (
                    <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                      <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{t("icon_push_pin", "push_pin")}</span>
                      <span>{t("pinned", "Pinned")}</span>
                    </div>
                  )}
                  {(() => {
                    const rawStatus = String(mod.status || 'stable').toLowerCase().replace(/[\[\]"]/g, "");
                    const s = rawStatus === 'unverified' && mason?.is_verified ? 'stable' : rawStatus;
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
                              : t("icon_verified", "verified");
                    const iconColor = s === 'stable' || s === 'verified'
                      ? 'text-[var(--success)]'
                      : s === 'unstable'
                        ? 'text-[var(--warning)]'
                        : s === 'broken' || s === 'corrupted'
                          ? 'text-[var(--danger)]'
                          : 'text-[var(--accent)]';
                    const label = isSandbox
                      ? t("studio_badge_sandbox", "Sandbox")
                      : s === 'verified'
                        ? t("verified", "Verified")
                        : s === 'stable'
                          ? t("status_stable", "Stable")
                          : s;
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
                    <span className="text-[var(--subtext)]">{mod.category_override || t("label_artifact", "{Mod}")}</span>
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
              className="w-full h-full transition-all duration-300"
              footer={
                <div className="flex items-center justify-between w-full pt-1 relative min-h-[16px] gap-2">
                  <div className="flex items-center gap-1.5">
                    {isFolder ? (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setExpandedFolder(expandedFolder === mainKey ? null : mainKey); }}
                        className={`relative px-2.5 py-1 rounded-lg glass-surface border text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer ${expandedFolder === mainKey ? 'sa-glass-pill-active text-[var(--text)]' : 'border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)]'}`}
                      >
                        <HoverTooltip
                          title={t("nav_exploring", "Exploring")}
                          subtitle={`+${mod.familyCount || (mod.flavors?.length || 0)} ${t("badge_modules_count", "Modules")}`}
                          icon={t("icon_account_tree", "account_tree")}
                          delay={120}
                        />
                        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{t("icon_account_tree", "account_tree")}</span>
                        <span className="tabular-nums">+{mod.familyCount || (mod.flavors?.length || 0)} {t("badge_modules_count", "Modules")}</span>
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
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onModClick({ ...mod, author: mason.name, isNexusView: true }); }}
                      className="relative px-3 py-1.5 rounded-full glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] hover:text-[var(--accent)] text-[9px] font-black uppercase tracking-widest hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] transition-all flex items-center gap-1.5 opacity-80 group-hover:opacity-100 cursor-pointer"
                    >
                      <HoverTooltip
                        title={t("btn_view", "View")}
                        subtitle={cleanedTitle}
                        icon={t("icon_visibility", "visibility")}
                        delay={120}
                      />
                      <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{t("icon_visibility", "visibility")}</span>
                      <span>{t("btn_view", "View")}</span>
                    </button>
                  </div>
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
                          {t("nav_exploring", "Exploring")} {(mod.flavors || []).length} {t("term_mods", "Artifacts")}
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
                          placeholder={t("search_ph", "Search {mods}...")}
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
                        className="w-10 h-10 rounded-xl glass-surface hover:text-[var(--danger)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center text-[var(--subtext)] transition-colors shrink-0 cursor-pointer"
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
                              layout="vertical-compact"
                              image={showImages !== false && flavor.image_url ? flavor.image_url : undefined}
                              icon={!flavor.image_url ? getModIcon(flavor, activeGameSchema, t) : undefined}
                              customIcon={
                                <DynamicArtifactPreviewBanner
                                  data={flavor}
                                  icon={getModIcon(flavor, activeGameSchema, t)}
                                  compact={true}
                                  heightClass="h-full"
                                />
                              }
                              title={flavor.name}
                              subtitle={`${flavor.author || mason.name || t("unknown_mason", "Unknown {Mason}")}${flavor.version ? ` • ${flavor.version}` : ""}`}
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




