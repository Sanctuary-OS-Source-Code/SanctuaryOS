import React from 'react';
import { ActionPill } from "../../shared";

function FilterSection({ title, options, value, onChange, t }: any) {
  if (!options || options.length === 0) return null;
  return (
    <div className="flex flex-col mb-4 w-full last:mb-0">
      <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-90 mb-2.5 px-1.5 flex items-center gap-2">
        <span className="text-[var(--text)] opacity-90">{title}</span>
        <div className="h-px bg-gradient-to-r from-[color-mix(in_srgb,var(--accent)_30%,transparent)] via-[color-mix(in_srgb,var(--text)_12%,transparent)] to-transparent flex-1"></div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {options.map((opt: any) => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => onChange(opt.id)}
              className={`sa-dropdown-item flex items-center justify-between gap-2.5 px-3 py-2 text-[11px] capitalize tracking-wide text-left cursor-pointer ${
                active ? "is-selected font-bold" : "font-semibold"
              }`}
            >
              <span className="truncate flex items-center gap-2 min-w-0">
                {opt.label}
              </span>
              {active && (
                <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
                  {t ? t("icon_check", "check") : ""}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export const VaultFilters = React.memo(function VaultFilters({
  t,
  searchQuery,
  setSearchQuery,
  activeCategory,
  setActiveCategory,
  activeSubType,
  setActiveSubType,
  activeGameSchema,
  filterStatus,
  setFilterStatus,
  equipFilter,
  hideGhostCards,
  setHideGhostCards,
  vaultLayout,
  setVaultLayout,
  onCreateLocalFolder,
  onOpenVersionPool,
  setSelectedMods
}: any) {
  const FilterContent = React.useMemo(() => {
    const activeSchemaCategory = activeGameSchema?.mod_categories?.find((c: any) => c.id === activeCategory);
    const subcats = activeSchemaCategory?.subcategories || [];

    return (
      <div className="flex flex-col w-[500px] p-4 max-w-[calc(100vw-40px)] text-left">
        <FilterSection
          t={t}
          title={t("filter_category", "Filter Category")}
          value={activeCategory}
          onChange={(val: string) => { setActiveCategory(val); setActiveSubType("ALL"); }}
          options={[
            { id: "ALL", label: t("filter_all", "All") },
            ...(activeGameSchema?.mod_categories?.map((cat: any) => ({
              id: cat.id,
              label: t(cat.lexicon_key, cat.id)
            })) || []),
            { id: "LOCAL_FOLDERS", label: t("filter_local", "Local Folders") }
          ]}
        />

        {subcats.length > 0 && (
          <FilterSection
            t={t}
            title={t("filter_subtype", "Subtype")}
            value={activeSubType}
            onChange={(val: string) => setActiveSubType(val)}
            options={[
              { id: "ALL", label: t("filter_all", "All") },
              ...subcats.map((sub: any) => ({
                id: sub.id,
                label: t(sub.lexicon_key, sub.id)
              }))
            ]}
          />
        )}

        <FilterSection
          t={t}
          title={t("filter_status", "Filter Status")}
          value={filterStatus}
          onChange={(val: string) => setFilterStatus(val)}
          options={[
            { id: "ALL", label: t("filter_all", "All") },
            { id: "stable", label: t("status_stable", "STABLE") },
            { id: "UNVERIFIED", label: t("unverified", "Unverified") },
            { id: "unstable", label: t("label_unstable", "Unstable") },
            { id: "corrupted", label: t("status_corrupted", "Corrupted") },
            { id: "under_review", label: t("status_dd_review", "Under Review") },
            { id: "pending", label: t("pending", "Pending") },
            { id: "unknown", label: t("unknown", "Unknown") },
          ]}
        />
      </div>
    );
  }, [activeCategory, activeSubType, activeGameSchema, filterStatus, setActiveCategory, setActiveSubType, setFilterStatus, t]);

  const actions = React.useMemo(() => {
    const list: any[] = [
      {
        id: "layout",
        icon: <span className="material-symbols-outlined !text-[20px] sm:!text-[20px]">{vaultLayout === "standard" ? t("icon_view_module", "view_module") : vaultLayout === "compact" ? t("icon_grid_view", "grid_view") : t("icon_view_list", "view_list")}</span>,
        label: t("layout_toggle", "Toggle Layout"),
        onClick: () => {
          if (vaultLayout === "standard") setVaultLayout("compact");
          else if (vaultLayout === "compact") setVaultLayout("list");
          else setVaultLayout("standard");
        }
      }
    ];

    if (onCreateLocalFolder) {
      list.push({
        id: "create_node",
        icon: <span className="material-symbols-outlined !text-[20px] sm:!text-[20px]">{t("icon_add_circle", "add_circle")}</span>,
        label: t("btn_create_node", "New Node"),
        onClick: () => { setSelectedMods && setSelectedMods([]); onCreateLocalFolder(); }
      });
    }

    if (onOpenVersionPool) {
      list.push({
        id: "version_pool",
        icon: <span className="material-symbols-outlined !text-[20px] sm:!text-[20px]">{t("icon_history", "history")}</span>,
        label: t("version_pool_title", "{Mod} Version {Backups}"),
        onClick: () => onOpenVersionPool()
      });
    }

    if (equipFilter === "ALL" || equipFilter === "EQUIPPED" || equipFilter === "UNEQUIPPED") {
      list.push({
        id: "hide_ghosts",
        icon: <span className={`material-symbols-outlined !text-[20px] sm:!text-[20px] ${hideGhostCards ? 'text-[var(--success)]' : ''}`}>{hideGhostCards ? t("icon_visibility_off", "visibility_off") : t("icon_visibility", "visibility")}</span>,
        label: t("btn_hide_ghosts", "Only Show Eligible"),
        activeClassName: hideGhostCards ? 'sa-glass-active !text-[var(--success)] !opacity-100' : '',
        onClick: () => setHideGhostCards(!hideGhostCards)
      });
    }

    return list;
  }, [vaultLayout, setVaultLayout, onCreateLocalFolder, onOpenVersionPool, setSelectedMods, equipFilter, hideGhostCards, setHideGhostCards, t]);

  return (
    <ActionPill
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      searchPlaceholder={t("search_ph", "Search {mods}...")}
      primaryPopover={{
        icon: t("icon_tune", "tune"),
        label: t("filters", "Filters"),
        content: FilterContent
      }}
      actions={actions}
    />
  );
});
