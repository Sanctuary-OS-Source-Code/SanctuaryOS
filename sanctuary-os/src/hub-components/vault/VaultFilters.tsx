import React from 'react';
import { CustomDropdown, isVersionMatch, getHighestVersion, getLowestVersion, HoverTooltip, ActionPill } from "../../shared";



export function VaultFilters({
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
  const [isSearchFocused, setIsSearchFocused] = React.useState(false);

  const FilterSection = ({ title, options, value, onChange }: any) => {
    if (!options || options.length === 0) return null;
    return (
      <div className="flex flex-col mb-5 w-full last:mb-0">
        <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-2.5 px-1 flex items-center gap-2">
          {title}
          <div className="h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex-1"></div>
        </div>
        <div className="flex flex-wrap gap-2">
          {options.map((opt: any) => {
            const active = value === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => onChange(opt.id)}
                className={`rounded-full px-4 py-1.5 transition-all flex items-center justify-center text-[10px] font-bold capitalize tracking-widest border ${active
                  ? 'border-[var(--accent)] text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] shadow-[0_0_10px_rgba(var(--accent-rgb),0.2)]'
                  : 'border-transparent bg-transparent text-[var(--subtext)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:text-[var(--text)]'
                  }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const FilterContent = (
    <div className="flex flex-col w-[500px] p-4 max-w-[calc(100vw-40px)] text-left">
      <FilterSection
        title={t("filter_category") || "Category"}
        value={activeCategory}
        onChange={(val: string) => { setActiveCategory(val); setActiveSubType("ALL"); }}
        options={[
          { id: "ALL", label: t("ql_all") },
          ...(activeGameSchema?.mod_categories?.map((cat: any) => ({
            id: cat.id,
            label: t(cat.lexicon_key) || cat.id
          })) || []),
          { id: "LOCAL_FOLDERS", label: t("filter_local") }
        ]}
      />

      {(() => {
        const activeSchemaCategory = activeGameSchema?.mod_categories?.find((c: any) => c.id === activeCategory);
        const subcats = activeSchemaCategory?.subcategories || [];
        if (subcats.length === 0) return null;

        return (
          <FilterSection
            title={t("filter_subtype") || "Subtype"}
            value={activeSubType}
            onChange={(val: string) => setActiveSubType(val)}
            options={[
              { id: "ALL", label: t("ql_all") },
              ...subcats.map((sub: any) => ({
                id: sub.id,
                label: t(sub.lexicon_key) || sub.id
              }))
            ]}
          />
        );
      })()}

      <FilterSection
        title={t("filter_status") || "Status"}
        value={filterStatus}
        onChange={(val: string) => setFilterStatus(val)}
        options={[
          { id: "ALL", label: t("ql_all") },
          { id: "stable", label: t("status_tag_stable") || "Stable" },
          { id: "unstable", label: t("status_tag_unstable") || "Unstable" },
          { id: "corrupted", label: t("status_tag_corrupted") || "Corrupted" },
          { id: "under_review", label: t("status_tag_under_review") || "Under Review" },
          { id: "pending", label: t("status_tag_pending") || "Pending" },
          { id: "unknown", label: t("status_tag_unknown") || "Unknown" },
        ]}
      />

      {equipFilter === "ARCHIVES" && (
        <>
          {(() => {
            const archiveOptionsRaw = Array.from(new Set(displayModList.flatMap((m: any) => {
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

            const archiveOptions = (archiveOptionsRaw as string[])
              .sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }))
              .map(v => ({ id: v, label: v === "Unknown" ? t("status_unknown") : v }));

            const activeVal = archiveVersionFilter && archiveOptions.some(o => o.id === archiveVersionFilter)
              ? archiveVersionFilter
              : (archiveOptions[0]?.id || "");

            if (!archiveVersionFilter && activeVal) {
              setTimeout(() => setArchiveVersionFilter(activeVal), 0);
            }

            return (
              <FilterSection
                title={t("filter_archive_version") || "Archive Version"}
                value={activeVal}
                onChange={(val: string) => setArchiveVersionFilter(val || "")}
                options={archiveOptions}
              />
            );
          })()}
        </>
      )}
    </div>
  );

  const actions = [];
  
  actions.push({
    id: "layout",
    icon: <span className="material-symbols-outlined !text-[20px] sm:!text-[20px] !text-[18px]">{vaultLayout === "standard" ? "view_module" : vaultLayout === "compact" ? "grid_view" : "view_list"}</span>,
    label: t("layout_toggle") || "Toggle Layout",
    onClick: () => {
      if (vaultLayout === "standard") setVaultLayout("compact");
      else if (vaultLayout === "compact") setVaultLayout("list");
      else setVaultLayout("standard");
    }
  });

  if (onCreateLocalFolder) {
    actions.push({
      id: "create_node",
      icon: <span className="material-symbols-outlined !text-[20px] sm:!text-[20px] !text-[18px]">add_circle</span>,
      label: t("btn_create_node") || "Create Node",
      onClick: () => { setSelectedMods && setSelectedMods([]); onCreateLocalFolder(); }
    });
  }

  if (equipFilter === "ALL" || equipFilter === "EQUIPPED" || equipFilter === "UNEQUIPPED") {
    actions.push({
      id: "hide_ghosts",
      icon: <span className={`material-symbols-outlined !text-[20px] sm:!text-[20px] !text-[18px] ${hideGhostCards ? 'text-[var(--success)]' : ''}`}>{hideGhostCards ? "visibility_off" : "visibility"}</span>,
      label: t("btn_hide_ghosts") || "Hide Ghost Cards",
      activeClassName: hideGhostCards ? 'text-[var(--success)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)]' : '',
      onClick: () => setHideGhostCards(!hideGhostCards)
    });
  }

  return (
    <ActionPill
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      searchPlaceholder={t("search_ph") || "Search..."}
      primaryPopover={{
        icon: "tune",
        label: t("filters") || "Filters",
        content: FilterContent
      }}
      actions={actions}
    />
  );
}
