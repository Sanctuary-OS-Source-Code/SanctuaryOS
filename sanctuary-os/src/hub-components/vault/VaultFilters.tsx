import React from 'react';
import { isVersionMatch, getHighestVersion, getLowestVersion, ActionPill } from "../../shared";

function FilterSection({ title, options, value, onChange, t }: any) {
  if (!options || options.length === 0) return null;
  return (
    <div className="flex flex-col mb-5 w-full last:mb-0">
      <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-2 px-1 flex items-center gap-2">
        {title}
        <div className="h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex-1"></div>
      </div>
      <div className="grid grid-cols-2 gap-1">
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
  archiveVersionFilter,
  setArchiveVersionFilter,
  displayModList,
  selectedVersion,
  hideGhostCards,
  setHideGhostCards,
  vaultLayout,
  setVaultLayout,
  onCreateLocalFolder,
  setSelectedMods
}: any) {
  const archiveOptions = React.useMemo(() => {
    if (equipFilter !== "ARCHIVES") return [];
    const archiveOptionsRaw = Array.from(new Set((displayModList || []).flatMap((m: any) => {
      const getVersions = (target: any) => {
        const v = target.compatible_versions;
        return typeof v === 'string' ? v.split(',').map((s: string) => s.trim()) : (v || []);
      };
      let highest = "0.0.0";
      if (m.isVirtual) {
        const highestPerFlavor = (m.flavors || []).map((f: any) => getHighestVersion(getVersions(f)));
        highest = getLowestVersion(highestPerFlavor);
      } else {
        highest = getHighestVersion(getVersions(m));
      }

      if (selectedVersion && selectedVersion !== "") {
        if (isVersionMatch([highest], selectedVersion)) return [];
      }
      return [highest];
    }).filter(Boolean)));

    return (archiveOptionsRaw as string[])
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }))
      .map(v => ({ id: v, label: v === "Unknown" ? t("unknown", "Unknown") : v }));
  }, [equipFilter, displayModList, selectedVersion, t]);

  React.useEffect(() => {
    if (equipFilter === "ARCHIVES" && !archiveVersionFilter && archiveOptions.length > 0) {
      setArchiveVersionFilter(archiveOptions[0].id);
    }
  }, [equipFilter, archiveVersionFilter, archiveOptions, setArchiveVersionFilter]);

  const FilterContent = React.useMemo(() => {
    const activeSchemaCategory = activeGameSchema?.mod_categories?.find((c: any) => c.id === activeCategory);
    const subcats = activeSchemaCategory?.subcategories || [];
    const activeArchiveVal = archiveVersionFilter && archiveOptions.some(o => o.id === archiveVersionFilter)
      ? archiveVersionFilter
      : (archiveOptions[0]?.id || "");

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
            { id: "unstable", label: t("label_unstable", "Unstable") },
            { id: "corrupted", label: t("status_corrupted", "Corrupted") },
            { id: "under_review", label: t("status_dd_review", "Under Review") },
            { id: "pending", label: t("pending", "Pending") },
            { id: "unknown", label: t("unknown", "Unknown") },
          ]}
        />

        {equipFilter === "ARCHIVES" && (
          <FilterSection
            t={t}
            title={t("filter_archive_version", "Archive Version")}
            value={activeArchiveVal}
            onChange={(val: string) => setArchiveVersionFilter(val || "")}
            options={archiveOptions}
          />
        )}
      </div>
    );
  }, [activeCategory, activeSubType, activeGameSchema, filterStatus, equipFilter, archiveVersionFilter, archiveOptions, setActiveCategory, setActiveSubType, setFilterStatus, setArchiveVersionFilter, t]);

  const actions = React.useMemo(() => {
    const list: any[] = [
      {
        id: "layout",
        icon: <span className="material-symbols-outlined !text-[20px] sm:!text-[20px] !text-[18px]">{vaultLayout === "standard" ? t("icon_view_module", "view_module") : vaultLayout === "compact" ? t("icon_grid_view", "grid_view") : t("icon_view_list", "view_list")}</span>,
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
        icon: <span className="material-symbols-outlined !text-[20px] sm:!text-[20px] !text-[18px]">{t("icon_add_circle", "add_circle")}</span>,
        label: t("btn_create_node", "New Node"),
        onClick: () => { setSelectedMods && setSelectedMods([]); onCreateLocalFolder(); }
      });
    }

    if (equipFilter === "ALL" || equipFilter === "EQUIPPED" || equipFilter === "UNEQUIPPED") {
      list.push({
        id: "hide_ghosts",
        icon: <span className={`material-symbols-outlined !text-[20px] sm:!text-[20px] !text-[18px] ${hideGhostCards ? 'text-[var(--success)]' : ''}`}>{hideGhostCards ? t("icon_visibility_off", "visibility_off") : t("icon_visibility", "visibility")}</span>,
        label: t("btn_hide_ghosts", "Only Show Eligible"),
        activeClassName: hideGhostCards ? 'sa-glass-active !text-[var(--success)] !opacity-100' : '',
        onClick: () => setHideGhostCards(!hideGhostCards)
      });
    }

    return list;
  }, [vaultLayout, setVaultLayout, onCreateLocalFolder, setSelectedMods, equipFilter, hideGhostCards, setHideGhostCards, t]);

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
