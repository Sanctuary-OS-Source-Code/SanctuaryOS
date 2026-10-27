import { useState } from "react";
import {
  getModIcon,
  SidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  DashboardStatTile,
  EmptyState,
  CustomDropdown,
  VAULT_CHIP_CLASS,
} from "../shared";
import { UniversalSearch } from "../components/universal/UniversalLayout";

export default function SidePanelMasonPin({
  isOpen,
  onClose,
  mason,
  mods,
  marketAssets,
  gameVersions,
  handlePin,
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

  const filteredMods =
    mods?.filter((m: any) => {
      if (
        activeCategory !== "ALL" &&
        (m.category_override || t("label_artifact", "{Mod}")) !== activeCategory
      )
        return false;
      if (searchQuery && !m.name?.toLowerCase().includes(searchQuery.toLowerCase()))
        return false;
      return true;
    }) || [];

  const filteredBlueprints = blueprintAssets.filter((b: any) => {
    if (activeCategory !== "ALL" && b.json_data?.game_version !== activeCategory)
      return false;
    if (searchQuery && !b.name?.toLowerCase().includes(searchQuery.toLowerCase()))
      return false;
    return true;
  });

  const filteredAssets = nonBlueprintAssets.filter((a: any) => {
    if (activeCategory !== "ALL" && a.asset_type !== activeCategory) return false;
    if (searchQuery && !a.name?.toLowerCase().includes(searchQuery.toLowerCase()))
      return false;
    return true;
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
                    mason?.pinned_mod_id === mod.id || mason?.pinned_ccset_id === mod.id;
                  return (
                    <div
                      key={mod.id}
                      onClick={() => {
                        handlePin("mod", mod.id);
                      }}
                      className={`relative flex items-center gap-3.5 px-4 py-3 glass-surface border rounded-xl transition-all duration-300 cursor-pointer group ${
                        isPinned
                          ? "border-[color-mix(in_srgb,var(--accent)_50%,transparent)]"
                          : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
                      }`}
                    >
                      <div
                        className="w-10 h-10 rounded-xl shrink-0 overflow-hidden glass-surface flex items-center justify-center border"
                        style={{
                          borderColor: "color-mix(in srgb, var(--accent) 25%, var(--border))",
                        }}
                      >
                        {mod.image_url ? (
                          <img
                            src={mod.image_url}
                            alt={mod.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span
                            className={`material-symbols-rounded !text-xl transition-all duration-300 ${
                              isPinned
                                ? "text-[var(--accent)]"
                                : "text-[var(--subtext)] opacity-70 group-hover:text-[var(--accent)]"
                            }`}
                          >
                            {getModIcon(mod, activeGameSchema, t)}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col flex-1 min-w-0 justify-center gap-1">
                        <h3
                          className={`text-xs font-black truncate tracking-tight m-0 transition-colors ${
                            isPinned
                              ? "text-[var(--accent)]"
                              : "text-[var(--text)] group-hover:text-[var(--accent)]"
                          }`}
                        >
                          {mod.name}
                        </h3>
                        <span
                          className={`${VAULT_CHIP_CLASS} w-fit`}
                          style={{
                            color: "var(--accent)",
                            borderColor: "color-mix(in srgb, var(--accent) 35%, var(--border))",
                          }}
                        >
                          <span className="material-symbols-rounded !text-[12px] shrink-0">
                            {getModIcon(mod, activeGameSchema, t)}
                          </span>
                          <span className="truncate">
                            {mod.category_override || t("label_artifact", "{Mod}")}
                          </span>
                        </span>
                      </div>

                      <div className="flex items-center justify-center w-8 h-8 shrink-0">
                        {isPinned ? (
                          <span className="material-symbols-outlined !text-xl text-[var(--accent)]">
                            {t("icon_check_circle", "check_circle")}
                          </span>
                        ) : (
                          <span className="material-symbols-outlined !text-lg text-[var(--subtext)] opacity-40 group-hover:opacity-100 group-hover:text-[var(--accent)] transition-all">
                            {t("icon_push_pin", "push_pin")}
                          </span>
                        )}
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
                  return (
                    <div
                      key={bp.id}
                      onClick={() => {
                        handlePin("blueprint", bp.id);
                      }}
                      className={`relative flex items-center gap-3.5 px-4 py-3 glass-surface border rounded-xl transition-all duration-300 cursor-pointer group ${
                        isPinned
                          ? "border-[color-mix(in_srgb,var(--accent)_50%,transparent)]"
                          : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
                      }`}
                    >
                      <div
                        className="w-10 h-10 rounded-xl shrink-0 overflow-hidden glass-surface flex items-center justify-center border"
                        style={{
                          borderColor: "color-mix(in srgb, var(--accent) 25%, var(--border))",
                        }}
                      >
                        {bp.image_url ? (
                          <img
                            src={bp.image_url}
                            alt={bp.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span
                            className={`material-symbols-rounded !text-xl transition-all duration-300 ${
                              isPinned
                                ? "text-[var(--accent)]"
                                : "text-[var(--subtext)] opacity-70 group-hover:text-[var(--accent)]"
                            }`}
                          >
                            {bpIcon}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col flex-1 min-w-0 justify-center gap-1">
                        <h3
                          className={`text-xs font-black truncate tracking-tight m-0 transition-colors ${
                            isPinned
                              ? "text-[var(--accent)]"
                              : "text-[var(--text)] group-hover:text-[var(--accent)]"
                          }`}
                        >
                          {bp.name}
                        </h3>
                        <span
                          className={`${VAULT_CHIP_CLASS} w-fit`}
                          style={{
                            color: "var(--accent)",
                            borderColor: "color-mix(in srgb, var(--accent) 35%, var(--border))",
                          }}
                        >
                          <span className="material-symbols-rounded !text-[12px] shrink-0">
                            {bpIcon}
                          </span>
                          <span className="truncate">{t("blueprint", "{Blueprint}")}</span>
                        </span>
                      </div>

                      <div className="flex items-center justify-center w-8 h-8 shrink-0">
                        {isPinned ? (
                          <span className="material-symbols-outlined !text-xl text-[var(--accent)]">
                            {t("icon_check_circle", "check_circle")}
                          </span>
                        ) : (
                          <span className="material-symbols-outlined !text-lg text-[var(--subtext)] opacity-40 group-hover:opacity-100 group-hover:text-[var(--accent)] transition-all">
                            {t("icon_push_pin", "push_pin")}
                          </span>
                        )}
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
                return (
                  <div
                    key={asset.id}
                    onClick={() => {
                      handlePin("asset", asset.id);
                    }}
                    className={`relative flex items-center gap-3.5 px-4 py-3 glass-surface border rounded-xl transition-all duration-300 cursor-pointer group ${
                      isPinned
                        ? "border-[color-mix(in_srgb,var(--accent)_50%,transparent)]"
                        : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
                    }`}
                  >
                    <div
                      className="w-10 h-10 rounded-xl shrink-0 overflow-hidden glass-surface flex items-center justify-center border"
                      style={{
                        borderColor: "color-mix(in srgb, var(--accent) 25%, var(--border))",
                      }}
                    >
                      {asset.image_url ? (
                        <img
                          src={asset.image_url}
                          alt={asset.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span
                          className={`material-symbols-rounded !text-xl transition-all duration-300 ${
                            isPinned
                              ? "text-[var(--accent)]"
                              : "text-[var(--subtext)] opacity-70 group-hover:text-[var(--accent)]"
                          }`}
                        >
                          {smIcon}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-col flex-1 min-w-0 justify-center gap-1">
                      <h3
                        className={`text-xs font-black truncate tracking-tight m-0 transition-colors ${
                          isPinned
                            ? "text-[var(--accent)]"
                            : "text-[var(--text)] group-hover:text-[var(--accent)]"
                        }`}
                      >
                        {asset.name}
                      </h3>
                      <span
                        className={`${VAULT_CHIP_CLASS} w-fit`}
                        style={{
                          color: "var(--accent)",
                          borderColor: "color-mix(in srgb, var(--accent) 35%, var(--border))",
                        }}
                      >
                        <span className="material-symbols-rounded !text-[12px] shrink-0">
                          {smIcon}
                        </span>
                        <span className="truncate">
                          {t(asset.asset_type, asset.asset_type) || asset.asset_type}
                        </span>
                      </span>
                    </div>

                    <div className="flex items-center justify-center w-8 h-8 shrink-0">
                      {isPinned ? (
                        <span className="material-symbols-outlined !text-xl text-[var(--accent)]">
                          {t("icon_check_circle", "check_circle")}
                        </span>
                      ) : (
                        <span className="material-symbols-outlined !text-lg text-[var(--subtext)] opacity-40 group-hover:opacity-100 group-hover:text-[var(--accent)] transition-all">
                          {t("icon_push_pin", "push_pin")}
                        </span>
                      )}
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
