import { getModIcon, getExtensionRegex, stripMarkdown, EmptyState, formatDisplayName, HoverTooltip, VAULT_CHIP_CLASS, PanelHeaderGroup, PanelHeaderButton } from './shared';
import MasonPostCard from './MasonPostCard';
import { UniversalCard } from './components/universal/UniversalCard';
import {
  CommandScreenSectionHeading,
} from './hub-components/SharedCommandScreenLayout';
import {
  DynamicThemePreviewBanner,
  DynamicLexiconPreviewBanner,
  DynamicBlueprintPreviewBanner,
  DynamicTemplatePreviewBanner,
  DynamicArtifactPreviewBanner,
} from './chameleon-components/ThemeCard';
import { useStore } from './store';
import { openSanctuaryContextMenu, SanctuaryContextMenuItem } from './ContextMenu';

const formatModCardTitle = (mod: any) => {
  const raw =
    String(mod?.displayName || mod?.name || "")
      .split(/[\\/]/)
      .pop() || "";
  return (
    raw
      .replace(getExtensionRegex(useStore.getState().activeGameSchema), "")
      .replace(/\.(zip|rar|7z|tar|gz|json|toml|yaml|yml|xml|cfg|ini|dll|asi|so|dylib|lua)$/i, "")
      .replace(/_/g, " ")
      .trim() ||
    mod?.name ||
    ""
  );
};

export default function MasonProfileOverview({
  posts,
  mods,
  marketAssets,
  mason,
  setActiveAsset,
  setSelectedBlueprint,
  onModClick,
  activeGameSchema,
  handlePostClick,
  handleToggleLike,
  isOwner,
  onEditShowcase,
  isSidePanel,
  t,
}: any) {
  const showImages = useStore((state: any) => state.showImages);
  const blueprintAssets = (marketAssets || []).filter((a: any) => a.asset_type === 'blueprint');
  const nonBlueprintAssets = (marketAssets || []).filter((a: any) => a.asset_type !== 'blueprint');

  const sortedPosts = [...(posts || [])].sort((a: any, b: any) => {
    const aPin = a?.is_pinned === true || a?.is_pinned === 'true' ? 1 : 0;
    const bPin = b?.is_pinned === true || b?.is_pinned === 'true' ? 1 : 0;
    if (bPin !== aPin) return bPin - aPin;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const glassBadgeBase =
    "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

  const renderModStatusBadge = (mod: any) => {
    const rawStatus = String(mod?.status || 'stable').toLowerCase().replace(/[\[\]"]/g, "");
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
    const iconColor =
      s === 'stable' || s === 'verified'
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
      <div className={glassBadgeBase}>
        <span className={`material-symbols-outlined !text-[12px] ${iconColor}`}>{icon}</span>
        <span>{label}</span>
      </div>
    );
  };

  const editShowcaseAction =
    isOwner && onEditShowcase ? (
      <PanelHeaderGroup>
        <PanelHeaderButton
          icon={t("icon_edit", "edit")}
          tooltip={t("panel_pin_details", "Feature Assignment")}
          tooltipSubtitle={t("panel_pin_subtitle", "Select items to pin to your profile showcase")}
          onClick={onEditShowcase}
        />
      </PanelHeaderGroup>
    ) : undefined;

  const renderModShowcaseCard = (mod: any) => {
    const isPinned = mason?.pinned_mod_id === mod.id || mason?.pinned_collection_id === mod.id;
    const isFolder = Boolean(mod.isVirtual || mod.isParent || mod.familyCount > 1);
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

    return (
      <UniversalCard
        key={`mod-${mod.id}`}
        layout="vertical"
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
        onClick={() => onModClick({ ...mod, author: mason.name, isNexusView: true })}
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
          if (isOwner && onEditShowcase) {
            items.push({
              id: "pin",
              label: t("panel_pin_details", "Feature Assignment"),
              icon: t("icon_push_pin", "push_pin"),
              onClick: () => onEditShowcase(),
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
              <div className={glassBadgeBase}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                  {t("icon_push_pin", "push_pin")}
                </span>
                <span>{t("pinned", "Pinned")}</span>
              </div>
            )}
            {renderModStatusBadge(mod)}
          </div>
        }
        badges={
          <>
            <div className={glassBadgeBase}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                {String(mod.category_override || mod.name || "")
                  .toLowerCase()
                  .includes("script")
                  ? t("icon_terminal", "terminal")
                  : t("icon_deployed_code", "deployed_code")}
              </span>
              <span className="text-[var(--subtext)]">
                {mod.category_override || t("label_artifact", "{Mod}")}
              </span>
            </div>
            {isFolder && (
              <div className={glassBadgeBase}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                  {t("icon_account_tree", "account_tree")}
                </span>
                <span>
                  +{mod.familyCount || mod.flavors?.length || 1}{" "}
                  {t("badge_modules_count", "Modules")}
                </span>
              </div>
            )}
            {mod.is_early_access && (
              <div className={glassBadgeBase}>
                <span className="material-symbols-outlined !text-[12px] text-purple-400">
                  {t("icon_science", "science")}
                </span>
                <span>{t("badge_early_access", "Early Access")}</span>
              </div>
            )}
            {mod.is_paid && (
              <div className={glassBadgeBase}>
                <span className="material-symbols-outlined !text-[12px] text-amber-400">
                  {t("icon_monetization_on", "monetization_on")}
                </span>
                <span>{t("badge_paid", "Paid")}</span>
              </div>
            )}
          </>
        }
        footer={
          <div className="flex items-center justify-between w-full pt-1 gap-2">
            <span className="text-[8px] font-mono text-[var(--subtext)] opacity-50 capitalize tracking-widest">
              {mod.updated_at
                ? new Date(mod.updated_at).toLocaleDateString()
                : mod.created_at
                  ? new Date(mod.created_at).toLocaleDateString()
                  : ""}
            </span>
            <span className="relative text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-75 group-hover:opacity-100 shrink-0">
              <HoverTooltip
                title={t("btn_view", "View")}
                subtitle={cleanedTitle}
                icon={t("icon_visibility", "visibility")}
                delay={120}
              />
              <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                {t("icon_visibility", "visibility")}
              </span>
              <span>{t("btn_view", "View")}</span>
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
  };

  const renderBlueprintShowcaseCard = (bp: any) => {
    const isPinned = mason?.pinned_blueprint_id === bp.id;
    const bpIcon = t("icon_map", "map");
    return (
      <UniversalCard
        key={`bp-${bp.id}`}
        layout="vertical"
        image={showImages !== false && bp.image_url ? bp.image_url : undefined}
        icon={!bp.image_url ? bpIcon : undefined}
        customIcon={<DynamicBlueprintPreviewBanner data={bp} heightClass="h-full" />}
        title={formatDisplayName(bp.name) || bp.name}
        subtitle={mason.name || t("unknown_mason", "Unknown {Mason}")}
        onClick={() => setSelectedBlueprint(bp)}
        onContextMenu={(e) => {
          const items: SanctuaryContextMenuItem[] = [
            {
              id: "inspect",
              label: t("btn_view", "View"),
              icon: t("icon_open_in_new", "open_in_new"),
              variant: "accent",
              onClick: () => setSelectedBlueprint(bp),
            },
          ];
          if (isOwner && onEditShowcase) {
            items.push({
              id: "pin",
              label: t("panel_pin_details", "Feature Assignment"),
              icon: t("icon_push_pin", "push_pin"),
              onClick: () => onEditShowcase(),
            });
          }
          openSanctuaryContextMenu(e, {
            title: formatDisplayName(bp.name) || bp.name,
            subtitle: mason.name || t("unknown_mason", "Unknown {Mason}"),
            statusLabel: isPinned ? t("pinned", "Pinned") : t("blueprint", "{Blueprint}"),
            icon: bpIcon,
            items,
          });
        }}
        imageOverlay={
          <div className="absolute top-3 left-3 z-30 flex items-center gap-1.5 pointer-events-none">
            {isPinned ? (
              <div className={glassBadgeBase}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                  {t("icon_push_pin", "push_pin")}
                </span>
                <span>{t("pinned", "Pinned")}</span>
              </div>
            ) : (
              <div className={glassBadgeBase}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                  {t("icon_verified", "verified")}
                </span>
                <span>{t("verified", "Verified")}</span>
              </div>
            )}
          </div>
        }
        badges={
          <>
            <div className={glassBadgeBase}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {bpIcon}
              </span>
              <span>{t("blueprint", "{Blueprint}")}</span>
            </div>
            {(bp.json_data?.artifacts?.length || 0) > 0 && (
              <div className={glassBadgeBase}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                  {t("icon_account_tree", "account_tree")}
                </span>
                <span>
                  +{bp.json_data.artifacts.length} {t("badge_modules_count", "Modules")}
                </span>
              </div>
            )}
            {bp.is_early_access && (
              <div className={glassBadgeBase}>
                <span className="material-symbols-outlined !text-[12px] text-purple-400">
                  {t("icon_science", "science")}
                </span>
                <span>{t("badge_early_access", "Early Access")}</span>
              </div>
            )}
            {bp.is_paid && (
              <div className={glassBadgeBase}>
                <span className="material-symbols-outlined !text-[12px] text-amber-400">
                  {t("icon_monetization_on", "monetization_on")}
                </span>
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
            <span className="relative text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-75 group-hover:opacity-100 shrink-0">
              <HoverTooltip
                title={t("btn_view", "View")}
                subtitle={bp.name}
                icon={t("icon_visibility", "visibility")}
                delay={120}
              />
              <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                {t("icon_visibility", "visibility")}
              </span>
              <span>{t("btn_view", "View")}</span>
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
  };

  const renderAssetShowcaseCard = (asset: any) => {
    const isPinned = mason?.pinned_asset_id === asset.id;
    const smIcon =
      asset.asset_type === 'lexicon'
        ? t("icon_translate", "translate")
        : asset.asset_type === 'chameleon'
          ? t("icon_palette", "palette")
          : t("icon_draw", "draw");
    const previewNode =
      asset.asset_type === 'chameleon' ? (
        <DynamicThemePreviewBanner
          data={{
            ...asset,
            ...(typeof asset.json_data === 'object' ? asset.json_data : {}),
            name: asset.name,
            previewImage:
              showImages !== false
                ? asset.image_url || asset.json_data?.previewImage
                : undefined,
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
        key={`asset-${asset.id}`}
        layout="vertical"
        image={showImages !== false && asset.image_url ? asset.image_url : undefined}
        icon={!asset.image_url ? smIcon : undefined}
        customIcon={previewNode}
        title={formatDisplayName(asset.name) || asset.name}
        subtitle={mason.name || t("unknown_mason", "Unknown {Mason}")}
        onClick={() => setActiveAsset({ type: asset.asset_type, id: asset.id })}
        onContextMenu={(e) => {
          const items: SanctuaryContextMenuItem[] = [
            {
              id: "inspect",
              label: t("btn_view", "View"),
              icon: t("icon_open_in_new", "open_in_new"),
              variant: "accent",
              onClick: () => setActiveAsset({ type: asset.asset_type, id: asset.id }),
            },
          ];
          if (isOwner && onEditShowcase) {
            items.push({
              id: "pin",
              label: t("panel_pin_details", "Feature Assignment"),
              icon: t("icon_push_pin", "push_pin"),
              onClick: () => onEditShowcase(),
            });
          }
          openSanctuaryContextMenu(e, {
            title: formatDisplayName(asset.name) || asset.name,
            subtitle: mason.name || t("unknown_mason", "Unknown {Mason}"),
            statusLabel: isPinned
              ? t("pinned", "Pinned")
              : t(asset.asset_type, asset.asset_type) || asset.asset_type,
            icon: smIcon,
            items,
          });
        }}
        imageOverlay={
          <div className="absolute top-3 left-3 z-30 flex items-center gap-1.5 pointer-events-none">
            {isPinned ? (
              <div className={glassBadgeBase}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                  {t("icon_push_pin", "push_pin")}
                </span>
                <span>{t("pinned", "Pinned")}</span>
              </div>
            ) : (
              <div className={glassBadgeBase}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                  {t("icon_verified", "verified")}
                </span>
                <span>{t("verified", "Verified")}</span>
              </div>
            )}
          </div>
        }
        badges={
          <div className={glassBadgeBase}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
              {smIcon}
            </span>
            <span>{t(asset.asset_type, asset.asset_type) || asset.asset_type}</span>
          </div>
        }
        footer={
          <div className="flex items-center justify-between w-full pt-1 gap-2">
            <span className="text-[8px] font-mono text-[var(--subtext)] opacity-50 capitalize tracking-widest">
              {asset.created_at ? new Date(asset.created_at).toLocaleDateString() : ""}
            </span>
            <span className="relative text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-75 group-hover:opacity-100 shrink-0">
              <HoverTooltip
                title={t("btn_view", "View")}
                subtitle={asset.name}
                icon={t("icon_visibility", "visibility")}
                delay={120}
              />
              <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                {t("icon_visibility", "visibility")}
              </span>
              <span>{t("btn_view", "View")}</span>
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
  };

  const featuredMod =
    mods.find((m: any) => m.id === mason?.pinned_mod_id || m.id === mason?.pinned_collection_id) ||
    mods[0];
  const featuredBlueprint =
    blueprintAssets.find((b: any) => b.id === mason?.pinned_blueprint_id) || blueprintAssets[0];
  const featuredAsset =
    nonBlueprintAssets.find((a: any) => a.id === mason?.pinned_asset_id) || nonBlueprintAssets[0];

  if (isSidePanel) {
    const compactShowcaseItems: {
      key: string;
      icon: string;
      iconColor: string;
      title: string;
      subtitle: string;
      typeLabel: string;
      isPinned: boolean;
      onClick: () => void;
    }[] = [];

    if (featuredMod) {
      const cleanedTitle = formatModCardTitle(featuredMod);
      compactShowcaseItems.push({
        key: `mod-${featuredMod.id}`,
        icon: getModIcon(featuredMod, activeGameSchema, t),
        iconColor: "text-teal-400",
        title: cleanedTitle,
        subtitle: `${mason.name}${featuredMod.latest_version ? ` • ${featuredMod.latest_version}` : ""}`,
        typeLabel: featuredMod.category_override || t("label_artifact", "{Mod}"),
        isPinned:
          mason?.pinned_mod_id === featuredMod.id || mason?.pinned_collection_id === featuredMod.id,
        onClick: () => onModClick({ ...featuredMod, author: mason.name, isNexusView: true }),
      });
    }
    if (featuredBlueprint) {
      compactShowcaseItems.push({
        key: `bp-${featuredBlueprint.id}`,
        icon: t("icon_map", "map"),
        iconColor: "text-blue-400",
        title: formatDisplayName(featuredBlueprint.name) || featuredBlueprint.name,
        subtitle: `${mason.name} • +${featuredBlueprint.json_data?.artifacts?.length || 0} ${t("badge_modules_count", "Modules")}`,
        typeLabel: t("blueprint", "{Blueprint}"),
        isPinned: mason?.pinned_blueprint_id === featuredBlueprint.id,
        onClick: () => setSelectedBlueprint(featuredBlueprint),
      });
    }
    if (featuredAsset) {
      const smIcon =
        featuredAsset.asset_type === "lexicon"
          ? t("icon_translate", "translate")
          : featuredAsset.asset_type === "chameleon"
            ? t("icon_palette", "palette")
            : t("icon_draw", "draw");
      compactShowcaseItems.push({
        key: `asset-${featuredAsset.id}`,
        icon: smIcon,
        iconColor: "text-purple-400",
        title: formatDisplayName(featuredAsset.name) || featuredAsset.name,
        subtitle: mason.name,
        typeLabel:
          featuredAsset.asset_type === "workbench_template"
            ? t("ql_templates", "Templates")
            : t(featuredAsset.asset_type, featuredAsset.asset_type) || featuredAsset.asset_type,
        isPinned: mason?.pinned_asset_id === featuredAsset.id,
        onClick: () => setActiveAsset({ type: featuredAsset.asset_type, id: featuredAsset.id }),
      });
    }

    return (
      <div className="flex flex-col gap-6 w-full pb-12">
        {/* Compact Featured Showcase (Command Matrix Card Style) */}
        {compactShowcaseItems.length > 0 && (
          <div className="flex flex-col gap-3.5 w-full">
            <CommandScreenSectionHeading
              title={t("showcase", "Showcase")}
              icon={t("icon_workspace_premium", "workspace_premium")}
              iconColorClass="text-[var(--warning)]"
              hideLine={true}
              actions={editShowcaseAction}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 w-full">
              {compactShowcaseItems.map((item) => (
                <div
                  key={item.key}
                  onClick={item.onClick}
                  className="relative glass-panel rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)] flex flex-col justify-between gap-3.5 transition-all duration-300 cursor-pointer group"
                >
                  <HoverTooltip
                    title={item.title}
                    subtitle={item.typeLabel}
                    icon={item.icon}
                    delay={120}
                  />
                  <div className="flex items-start gap-3 min-w-0 w-full">
                    <div className="w-10 h-10 rounded-xl shrink-0 glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] flex items-center justify-center">
                      <span className={`material-symbols-outlined !text-[20px] ${item.iconColor}`}>
                        {item.icon}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <span className="text-xs font-black tracking-tight text-[var(--text)] group-hover:theme-text-accent transition-colors truncate">
                        {item.title}
                      </span>
                      <span className="text-[10px] font-semibold text-[var(--subtext)] opacity-80 truncate">
                        {item.subtitle}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {item.isPinned && (
                        <span className={VAULT_CHIP_CLASS}>
                          <span className="material-symbols-outlined !text-[11px] text-[var(--accent)]">
                            {t("icon_push_pin", "push_pin")}
                          </span>
                          <span>{t("pinned", "Pinned")}</span>
                        </span>
                      )}
                      <span className={VAULT_CHIP_CLASS}>
                        <span className={`material-symbols-outlined !text-[11px] ${item.iconColor}`}>
                          {item.icon}
                        </span>
                        <span>{item.typeLabel}</span>
                      </span>
                    </div>
                    <span className="material-symbols-outlined !text-[15px] text-[var(--subtext)] group-hover:text-[var(--accent)] transition-colors">
                      {t("icon_arrow_forward", "arrow_forward")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Comm-Link Feed (2-column balanced grid, immediately visible) */}
        <div className="flex flex-col gap-3.5 w-full">
          <CommandScreenSectionHeading
            title={t("comm_link_feed", "Comm-Link Feed")}
            icon={t("icon_satellite_alt", "satellite_alt")}
            iconColorClass="text-[var(--accent)]"
            hideLine={true}
          />
          {sortedPosts.length === 0 ? (
            <EmptyState
              icon={t("icon_satellite_alt", "satellite_alt")}
              title={t("profile_no_posts", "No {dispatches} found.")}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
              {sortedPosts.map((p: any, index: number) => (
                <MasonPostCard
                  key={p.id}
                  post={p}
                  index={index}
                  onPostClick={handlePostClick}
                  onToggleLike={handleToggleLike}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  let hasRenderedEditButton = false;
  const takeEditActionOnce = () => {
    if (hasRenderedEditButton) return undefined;
    hasRenderedEditButton = true;
    return editShowcaseAction;
  };

  const cardGridClass = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6";

  return (
    <div className="flex flex-col gap-8 w-full pb-32">
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_440px] 2xl:grid-cols-[1fr_480px] gap-10 w-full items-start">
        {/* LEFT COLUMN: Categorized Mason Showcases (Aligned at top with Comm-Link) */}
        <div className="w-full flex flex-col gap-10 min-w-0">
          {/* 1. ARTIFACTS SHOWCASE */}
          {mods.length > 0 && (
            <div className="flex flex-col gap-5">
              <CommandScreenSectionHeading
                title={t("latest_artifact", "{Mod} Showcase")}
                icon={t("icon_auto_awesome", "auto_awesome")}
                iconColorClass="text-[var(--accent)]"
                hideLine={true}
                actions={takeEditActionOnce()}
              />
              {(() => {
                const showcaseMod =
                  mods.find(
                    (m: any) => m.id === mason?.pinned_mod_id || m.id === mason?.pinned_collection_id
                  ) || mods[0];
                const otherMods = mods
                  .filter((m: any) => m.id !== showcaseMod.id)
                  .slice(0, 2);
                const displayMods = [showcaseMod, ...otherMods];
                return <div className={cardGridClass}>{displayMods.map(renderModShowcaseCard)}</div>;
              })()}
            </div>
          )}

          {/* 2. BLUEPRINTS SHOWCASE */}
          {blueprintAssets.length > 0 && (
            <div className="flex flex-col gap-5">
              <CommandScreenSectionHeading
                title={t("latest_blueprint", "{Blueprint} Showcase")}
                icon={t("icon_map", "map")}
                iconColorClass="text-[var(--accent)]"
                hideLine={true}
                actions={takeEditActionOnce()}
              />
              {(() => {
                const showcaseBlueprint =
                  blueprintAssets.find((a: any) => a.id === mason?.pinned_blueprint_id) ||
                  blueprintAssets[0];
                const otherBlueprints = blueprintAssets
                  .filter((a: any) => a.id !== showcaseBlueprint.id)
                  .slice(0, 2);
                const displayBlueprints = [showcaseBlueprint, ...otherBlueprints];
                return (
                  <div className={cardGridClass}>
                    {displayBlueprints.map(renderBlueprintShowcaseCard)}
                  </div>
                );
              })()}
            </div>
          )}

          {/* 3. ASSETS SHOWCASE [Lexicons, Chameleons, Templates] */}
          {nonBlueprintAssets.length > 0 && (
            <div className="flex flex-col gap-5">
              <CommandScreenSectionHeading
                title={t("latest_asset", "Asset Showcase")}
                icon={t("icon_widgets", "widgets")}
                iconColorClass="text-[var(--accent)]"
                hideLine={true}
                actions={takeEditActionOnce()}
              />
              {(() => {
                const showcaseAsset =
                  nonBlueprintAssets.find((a: any) => a.id === mason?.pinned_asset_id) ||
                  nonBlueprintAssets[0];
                const otherAssets = nonBlueprintAssets
                  .filter((a: any) => a.id !== showcaseAsset.id)
                  .slice(0, 2);
                const displayAssets = [showcaseAsset, ...otherAssets];
                return (
                  <div className={cardGridClass}>{displayAssets.map(renderAssetShowcaseCard)}</div>
                );
              })()}
            </div>
          )}

          {mods.length === 0 &&
            blueprintAssets.length === 0 &&
            nonBlueprintAssets.length === 0 && (
              <EmptyState
                icon={t("icon_inventory_2", "inventory_2")}
                title={t("no_artifacts", "Creator No {Mods}")}
              />
            )}
        </div>

        {/* RIGHT COLUMN: Comm-Link Dispatches (Aligned at top with Artifact Showcase) */}
        <div className="flex flex-col gap-5 min-w-0 w-full">
          <CommandScreenSectionHeading
            title={t("tab_commlink", "Comm-Link")}
            icon={t("icon_satellite_alt", "satellite_alt")}
            iconColorClass="text-[var(--accent)]"
            hideLine={true}
          />
          <div className="w-full">
            {sortedPosts.length === 0 ? (
              <EmptyState
                icon={t("icon_satellite_alt", "satellite_alt")}
                title={t("profile_no_posts", "No {dispatches} found.")}
              />
            ) : (
              <div className="flex flex-col gap-6">
                {sortedPosts.map((p: any, index: number) => (
                  <div key={p.id} className="w-full">
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
      </div>
    </div>
  );
}
