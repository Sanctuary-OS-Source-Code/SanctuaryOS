import { useState } from "react";
import { useStore } from "../store";
import {
  getModIcon,
  getExtensionRegex,
  SidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  DashboardStatTile,
  EmptyState,
  CustomDropdown,
  HoverTooltip,
} from "../shared";
import { UniversalSearch } from "../components/universal/UniversalLayout";

const formatCleanPinTitle = (rawInput: any) => {
  const raw =
    String(rawInput || "")
      .split(/[\\/]/)
      .pop() || "";
  const base = raw
    .replace(getExtensionRegex(useStore.getState().activeGameSchema), "")
    .replace(/\.(zip|rar|7z|tar|gz|json|toml|yaml|yml|xml|cfg|ini|dll|asi|so|dylib|lua)$/i, "")
    .replace(/_/g, " ")
    .trim();
  if (!base) return "";
  if (base === base.toUpperCase() && base.length > 4) {
    return base.replace(/\b([A-Z]{2,})\b/g, (word, _g, offset) => {
      if (offset > 0 && base[offset - 1] === "[") return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
  }
  return base;
};

export default function SidePanelMasonPin({
  isOpen,
  onClose,
  mason,
  mods,
  marketAssets,
  gameVersions,
  handlePin,
  onModClick,
  setSelectedBlueprint,
  setActiveAsset,
  activeGameSchema,
  t,
}: any) {
  const [activeTab, setActiveTab] = useState<"mod" | "blueprint" | "asset">("mod");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("ALL");

  const modCategories = [
    "ALL",
    ...Array.from(
      new Set(
        mods?.map((m: any) => m.category_override || t("label_artifact", "{Mod}")) || []
      )
    ),
  ];
  const blueprintAssets = (marketAssets || []).filter(
    (a: any) => a.asset_type === "blueprint"
  );
  const nonBlueprintAssets = (marketAssets || []).filter(
    (a: any) => a.asset_type !== "blueprint"
  );

  const blueprintVersions = [
    "ALL",
    ...Array.from(
      new Set([
        ...(gameVersions || []),
        ...blueprintAssets.map((b: any) => b.json_data?.game_version).filter(Boolean),
      ])
    ),
  ];
  const assetCategories = ["ALL", "lexicon", "chameleon", "workbench_template"];

  const filteredMods = (
    mods?.filter((m: any) => {
      if (
        activeCategory !== "ALL" &&
        (m.category_override || t("label_artifact", "{Mod}")) !== activeCategory
      )
        return false;
      if (searchQuery && !m.name?.toLowerCase().includes(searchQuery.toLowerCase()))
        return false;
      return true;
    }) || []
  ).sort((a: any, b: any) => {
    const aPin = mason?.pinned_mod_id === a?.id || mason?.pinned_collection_id === a?.id ? 1 : 0;
    const bPin = mason?.pinned_mod_id === b?.id || mason?.pinned_collection_id === b?.id ? 1 : 0;
    return bPin - aPin;
  });

  const filteredBlueprints = blueprintAssets
    .filter((b: any) => {
      if (activeCategory !== "ALL" && b.json_data?.game_version !== activeCategory)
        return false;
      if (searchQuery && !b.name?.toLowerCase().includes(searchQuery.toLowerCase()))
        return false;
      return true;
    })
    .sort((a: any, b: any) => {
      const aPin = mason?.pinned_blueprint_id === a?.id ? 1 : 0;
      const bPin = mason?.pinned_blueprint_id === b?.id ? 1 : 0;
      return bPin - aPin;
    });

  const filteredAssets = nonBlueprintAssets
    .filter((a: any) => {
      if (activeCategory !== "ALL" && a.asset_type !== activeCategory) return false;
      if (searchQuery && !a.name?.toLowerCase().includes(searchQuery.toLowerCase()))
        return false;
      return true;
    })
    .sort((a: any, b: any) => {
      const aPin = mason?.pinned_asset_id === a?.id ? 1 : 0;
      const bPin = mason?.pinned_asset_id === b?.id ? 1 : 0;
      return bPin - aPin;
    });

  if (!mason) return null;

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      keepMounted={true}
      title={t("panel_pin_details", "Feature Assignment")}
      subtitle={t("panel_pin_subtitle", "Select items to pin to your profile showcase")}
      icon={t("icon_push_pin", "push_pin")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[760px]"
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_push_pin", "push_pin")}
          overline={t("panel_pin_details", "Feature Assignment")}
          title={t("panel_pin_subtitle", "Select items to pin to your profile showcase")}
          description={t(
            "creator_identity",
            "Highlight your featured artifacts, blueprints, and Nexus creations on your public profile."
          )}
          badge={mason?.name || t("label_artifact", "{Mod}")}
          badgeIcon={t("icon_verified", "verified")}
          variant="accent"
        />

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            icon={t("icon_account_balance", "account_balance")}
            label={t("term_mods", "Artifacts")}
            value={mods?.length || 0}
            isActive={activeTab === "mod"}
            onClick={() => {
              setActiveTab("mod");
              setActiveCategory("ALL");
            }}
          />
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            icon={t("icon_map", "map")}
            label={t("playsets_title", "{Blueprints}")}
            value={blueprintAssets.length}
            isActive={activeTab === "blueprint"}
            onClick={() => {
              setActiveTab("blueprint");
              setActiveCategory("ALL");
            }}
          />
          <DashboardStatTile
            variant="filter"
            className="!w-full col-span-2 sm:col-span-1"
            icon={t("icon_inventory_2", "inventory_2")}
            label={t("pin_tab_assets", "Assets")}
            value={nonBlueprintAssets.length}
            isActive={activeTab === "asset"}
            onClick={() => {
              setActiveTab("asset");
              setActiveCategory("ALL");
            }}
          />
        </div>

        <UniversalGroup
          title={
            activeTab === "mod"
              ? t("term_mods", "Artifacts")
              : activeTab === "blueprint"
                ? t("playsets_title", "{Blueprints}")
                : t("pin_tab_assets", "Assets")
          }
          icon={
            activeTab === "mod"
              ? t("icon_account_balance", "account_balance")
              : activeTab === "blueprint"
                ? t("icon_map", "map")
                : t("icon_inventory_2", "inventory_2")
          }
        >
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full">
            <UniversalSearch
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={
                activeTab === "mod"
                  ? t("search_ph", "Search {mods}...")
                  : activeTab === "blueprint"
                    ? t("search_blueprints", "Search {Blueprints}...")
                    : t("cc_search", "Search assets...")
              }
              wrapperClassName="flex-1"
            />

            <div className="min-w-[200px] shrink-0">
              <CustomDropdown
                disableTint={true}
                value={activeCategory}
                onChange={(v: any) => setActiveCategory(v[0])}
                options={
                  activeTab === "mod"
                    ? modCategories.map((cat: any) => ({
                        id: cat,
                        label: cat === "ALL" ? t("all_classes", "All Classes") : cat,
                        icon: t("icon_folder", "folder"),
                      }))
                    : activeTab === "blueprint"
                      ? blueprintVersions.map((ver: any) => ({
                          id: ver,
                          label:
                            ver === "ALL" ? t("filter_all_versions", "All Versions") : ver,
                          icon:
                            ver === "ALL"
                              ? t("icon_folder", "folder")
                              : t("icon_map", "map"),
                        }))
                      : assetCategories.map((cat: any) => ({
                          id: cat,
                          label:
                            cat === "ALL"
                              ? t("all_types", "All Types")
                              : t(cat, cat) || cat,
                          icon: t("icon_folder", "folder"),
                        }))
                }
              />
            </div>
          </div>

          {activeTab === "mod" ? (
            filteredMods.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
                {filteredMods.map((mod: any) => {
                  const isPinned =
                    mason?.pinned_mod_id === mod.id || mason?.pinned_collection_id === mod.id;
                  const cleanedTitle = formatCleanPinTitle(mod?.displayName || mod?.name);
                  const modIcon = getModIcon(mod, activeGameSchema, t);
                  const categoryLabel = mod.category_override || t("label_artifact", "{Mod}");
                  return (
                    <div
                      key={mod.id}
                      onClick={() => {
                        if (onModClick) {
                          onModClick({ ...mod, author: mason.name, isNexusView: true });
                        } else {
                          handlePin("mod", mod.id);
                        }
                      }}
                      className={`relative flex items-center gap-3.5 px-4 py-3.5 glass-surface border rounded-2xl transition-all duration-300 cursor-pointer group ${
                        isPinned
                          ? "border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
                          : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
                      }`}
                    >
                      <div className="w-10 h-10 rounded-xl shrink-0 overflow-hidden glass-surface flex items-center justify-center border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)]">
                        {mod.image_url ? (
                          <img
                            src={mod.image_url}
                            alt={cleanedTitle}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span
                            className={`material-symbols-rounded !text-xl transition-all duration-300 ${
                              isPinned
                                ? "text-[var(--accent)]"
                                : "text-[var(--subtext)] opacity-75 group-hover:text-[var(--accent)]"
                            }`}
                          >
                            {modIcon}
                          </span>
                        )}
                      </div>

                      <div className="relative flex flex-col flex-1 min-w-0 justify-center gap-1">
                        <HoverTooltip
                          title={cleanedTitle}
                          subtitle={
                            onModClick
                              ? t("btn_view", "View")
                              : t("panel_pin_details", "Feature Assignment")
                          }
                          icon={modIcon}
                          delay={150}
                        />
                        <h3 className="text-xs font-black truncate tracking-tight m-0 text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">
                          {cleanedTitle}
                        </h3>
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--subtext)] opacity-80 truncate">
                          <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--accent)]">
                            {modIcon}
                          </span>
                          <span className="truncate">{categoryLabel}</span>
                          {isPinned && (
                            <>
                              <span className="opacity-40">•</span>
                              <span className="text-[var(--accent)] font-black uppercase tracking-wider shrink-0 flex items-center gap-0.5">
                                <span className="material-symbols-outlined !text-[11px]">
                                  {t("icon_push_pin", "push_pin")}
                                </span>
                                {t("pinned", "Pinned")}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {onModClick && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onModClick({ ...mod, author: mason.name, isNexusView: true });
                            }}
                            className="relative flex items-center justify-center w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] transition-all cursor-pointer"
                          >
                            <HoverTooltip
                              title={t("btn_view", "View")}
                              subtitle={cleanedTitle}
                              icon={t("icon_visibility", "visibility")}
                              delay={120}
                            />
                            <span className="material-symbols-outlined !text-[16px]">
                              {t("icon_visibility", "visibility")}
                            </span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePin("mod", mod.id);
                          }}
                          className={`relative flex items-center justify-center w-8 h-8 rounded-lg glass-surface border transition-all cursor-pointer ${
                            isPinned
                              ? "border-[color-mix(in_srgb,var(--accent)_50%,transparent)] text-[var(--accent)]"
                              : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
                          }`}
                        >
                          <HoverTooltip
                            title={
                              isPinned
                                ? t("pinned", "Pinned")
                                : t("panel_pin_details", "Feature Assignment")
                            }
                            subtitle={t(
                              "panel_pin_subtitle",
                              "Select items to pin to your profile showcase"
                            )}
                            icon={
                              isPinned
                                ? t("icon_check_circle", "check_circle")
                                : t("icon_push_pin", "push_pin")
                            }
                            delay={120}
                          />
                          {isPinned ? (
                            <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">
                              {t("icon_check_circle", "check_circle")}
                            </span>
                          ) : (
                            <span className="material-symbols-outlined !text-[16px]">
                              {t("icon_push_pin", "push_pin")}
                            </span>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                icon={t("icon_search", "search")}
                title={t("mason_cc_no_assets", "No Matching {Mods}")}
                minHeightClass="min-h-[180px]"
              />
            )
          ) : activeTab === "blueprint" ? (
            filteredBlueprints.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
                {filteredBlueprints.map((bp: any) => {
                  const isPinned = mason?.pinned_blueprint_id === bp.id;
                  const bpIcon = t("icon_map", "map");
                  const cleanedTitle = formatCleanPinTitle(bp.name) || bp.name;
                  return (
                    <div
                      key={bp.id}
                      onClick={() => {
                        if (setSelectedBlueprint) {
                          setSelectedBlueprint(bp);
                        } else {
                          handlePin("blueprint", bp.id);
                        }
                      }}
                      className={`relative flex items-center gap-3.5 px-4 py-3.5 glass-surface border rounded-2xl transition-all duration-300 cursor-pointer group ${
                        isPinned
                          ? "border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
                          : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
                      }`}
                    >
                      <div className="w-10 h-10 rounded-xl shrink-0 overflow-hidden glass-surface flex items-center justify-center border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)]">
                        {bp.image_url ? (
                          <img
                            src={bp.image_url}
                            alt={cleanedTitle}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span
                            className={`material-symbols-rounded !text-xl transition-all duration-300 ${
                              isPinned
                                ? "text-[var(--accent)]"
                                : "text-[var(--subtext)] opacity-75 group-hover:text-[var(--accent)]"
                            }`}
                          >
                            {bpIcon}
                          </span>
                        )}
                      </div>

                      <div className="relative flex flex-col flex-1 min-w-0 justify-center gap-1">
                        <HoverTooltip
                          title={cleanedTitle}
                          subtitle={
                            setSelectedBlueprint
                              ? t("btn_view", "View")
                              : t("panel_pin_details", "Feature Assignment")
                          }
                          icon={bpIcon}
                          delay={150}
                        />
                        <h3 className="text-xs font-black truncate tracking-tight m-0 text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">
                          {cleanedTitle}
                        </h3>
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--subtext)] opacity-80 truncate">
                          <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--accent)]">
                            {bpIcon}
                          </span>
                          <span className="truncate">{t("blueprint", "{Blueprint}")}</span>
                          {isPinned && (
                            <>
                              <span className="opacity-40">•</span>
                              <span className="text-[var(--accent)] font-black uppercase tracking-wider shrink-0 flex items-center gap-0.5">
                                <span className="material-symbols-outlined !text-[11px]">
                                  {t("icon_push_pin", "push_pin")}
                                </span>
                                {t("pinned", "Pinned")}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {setSelectedBlueprint && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedBlueprint(bp);
                            }}
                            className="relative flex items-center justify-center w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] transition-all cursor-pointer"
                          >
                            <HoverTooltip
                              title={t("btn_view", "View")}
                              subtitle={cleanedTitle}
                              icon={t("icon_visibility", "visibility")}
                              delay={120}
                            />
                            <span className="material-symbols-outlined !text-[16px]">
                              {t("icon_visibility", "visibility")}
                            </span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePin("blueprint", bp.id);
                          }}
                          className={`relative flex items-center justify-center w-8 h-8 rounded-lg glass-surface border transition-all cursor-pointer ${
                            isPinned
                              ? "border-[color-mix(in_srgb,var(--accent)_50%,transparent)] text-[var(--accent)]"
                              : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
                          }`}
                        >
                          <HoverTooltip
                            title={
                              isPinned
                                ? t("pinned", "Pinned")
                                : t("panel_pin_details", "Feature Assignment")
                            }
                            subtitle={t(
                              "panel_pin_subtitle",
                              "Select items to pin to your profile showcase"
                            )}
                            icon={
                              isPinned
                                ? t("icon_check_circle", "check_circle")
                                : t("icon_push_pin", "push_pin")
                            }
                            delay={120}
                          />
                          {isPinned ? (
                            <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">
                              {t("icon_check_circle", "check_circle")}
                            </span>
                          ) : (
                            <span className="material-symbols-outlined !text-[16px]">
                              {t("icon_push_pin", "push_pin")}
                            </span>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                icon={t("icon_search", "search")}
                title={t("no_match_blueprints", "No Matching {Blueprints} Found")}
                minHeightClass="min-h-[180px]"
              />
            )
          ) : filteredAssets.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
              {filteredAssets.map((asset: any) => {
                const isPinned = mason?.pinned_asset_id === asset.id;
                const smIcon =
                  asset.asset_type === "lexicon"
                    ? t("icon_translate", "translate")
                    : asset.asset_type === "chameleon"
                      ? t("icon_palette", "palette")
                      : t("icon_draw", "draw");
                const cleanedTitle = formatCleanPinTitle(asset.name) || asset.name;
                return (
                  <div
                    key={asset.id}
                    onClick={() => {
                      if (setActiveAsset) {
                        setActiveAsset({ type: asset.asset_type, id: asset.id });
                      } else {
                        handlePin("asset", asset.id);
                      }
                    }}
                    className={`relative flex items-center gap-3.5 px-4 py-3.5 glass-surface border rounded-2xl transition-all duration-300 cursor-pointer group ${
                      isPinned
                        ? "border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
                        : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl shrink-0 overflow-hidden glass-surface flex items-center justify-center border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)]">
                      {asset.image_url ? (
                        <img
                          src={asset.image_url}
                          alt={cleanedTitle}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span
                          className={`material-symbols-rounded !text-xl transition-all duration-300 ${
                            isPinned
                              ? "text-[var(--accent)]"
                              : "text-[var(--subtext)] opacity-75 group-hover:text-[var(--accent)]"
                          }`}
                        >
                          {smIcon}
                        </span>
                      )}
                    </div>

                    <div className="relative flex flex-col flex-1 min-w-0 justify-center gap-1">
                      <HoverTooltip
                        title={cleanedTitle}
                        subtitle={
                          setActiveAsset
                            ? t("btn_view", "View")
                            : t("panel_pin_details", "Feature Assignment")
                        }
                        icon={smIcon}
                        delay={150}
                      />
                      <h3 className="text-xs font-black truncate tracking-tight m-0 text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">
                        {cleanedTitle}
                      </h3>
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--subtext)] opacity-80 truncate">
                        <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--accent)]">
                          {smIcon}
                        </span>
                        <span className="truncate">
                          {t(asset.asset_type, asset.asset_type) || asset.asset_type}
                        </span>
                        {isPinned && (
                          <>
                            <span className="opacity-40">•</span>
                            <span className="text-[var(--accent)] font-black uppercase tracking-wider shrink-0 flex items-center gap-0.5">
                              <span className="material-symbols-outlined !text-[11px]">
                                {t("icon_push_pin", "push_pin")}
                              </span>
                              {t("pinned", "Pinned")}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {setActiveAsset && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveAsset({ type: asset.asset_type, id: asset.id });
                          }}
                          className="relative flex items-center justify-center w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] transition-all cursor-pointer"
                        >
                          <HoverTooltip
                            title={t("btn_view", "View")}
                            subtitle={cleanedTitle}
                            icon={t("icon_visibility", "visibility")}
                            delay={120}
                          />
                          <span className="material-symbols-outlined !text-[16px]">
                            {t("icon_visibility", "visibility")}
                          </span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePin("asset", asset.id);
                        }}
                        className={`relative flex items-center justify-center w-8 h-8 rounded-lg glass-surface border transition-all cursor-pointer ${
                          isPinned
                            ? "border-[color-mix(in_srgb,var(--accent)_50%,transparent)] text-[var(--accent)]"
                            : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
                        }`}
                      >
                        <HoverTooltip
                          title={
                            isPinned
                              ? t("pinned", "Pinned")
                              : t("panel_pin_details", "Feature Assignment")
                          }
                          subtitle={t(
                            "panel_pin_subtitle",
                            "Select items to pin to your profile showcase"
                          )}
                          icon={
                            isPinned
                              ? t("icon_check_circle", "check_circle")
                              : t("icon_push_pin", "push_pin")
                          }
                          delay={120}
                        />
                        {isPinned ? (
                          <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">
                            {t("icon_check_circle", "check_circle")}
                          </span>
                        ) : (
                          <span className="material-symbols-outlined !text-[16px]">
                            {t("icon_push_pin", "push_pin")}
                          </span>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={t("icon_search", "search")}
              title={t("no_match_assets", "No Matching Assets Found")}
              minHeightClass="min-h-[180px]"
            />
          )}
        </UniversalGroup>
      </div>
    </SidePanel>
  );
}
