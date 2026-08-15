import React from 'react';
import { CustomDropdown, isVersionMatch, getHighestVersion, getLowestVersion, SearchBar, ScreenUtilityBar, FilterPopover, HoverTooltip } from "../../shared";

export function DebouncedSearchInput({ value, onChange, placeholder, t }: { value: string, onChange: (val: string) => void, placeholder: string, t: any }) {
  const [localValue, setLocalValue] = React.useState(value);

  React.useEffect(() => {
    setLocalValue(value);
  }, [value]);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      if (localValue !== value) onChange(localValue);
    }, 300);
    return () => clearTimeout(handler);
  }, [localValue, onChange, value]);

  return (
    <SearchBar
      value={localValue}
      onChange={(val) => { setLocalValue(val); onChange(val); }}
      placeholder={placeholder}
      className="flex-1 min-w-[200px] w-full xl:max-w-[300px] !h-12 !rounded-2xl"
    />
  );
}

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
                  ? 'border-[var(--accent)] text-[var(--accent)] bg-transparent shadow-[0_0_10px_rgba(var(--accent-rgb),0.2)]'
                  : 'border-[color-mix(in_srgb,var(--text)_15%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] text-[var(--subtext)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] hover:text-[var(--text)]'
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

  return (
    <div className="flex items-center gap-3 animate-in slide-in-from-top-4 duration-500 relative z-20 w-full xl:w-auto">
      <div className="relative flex-1 min-w-[200px] xl:w-[480px]">
        <SearchBar
          value={searchQuery || ""}
          onChange={setSearchQuery}
          placeholder={t("search_ph") || "Search..."}
          className="h-12 w-full rounded-2xl"
        />
      </div>


      <FilterPopover icon="tune" label={t("filters")} className="shrink-0">
        <div className="flex flex-col w-[500px] p-4 max-w-[calc(100vw-40px)]">
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
              { id: "STABLE", label: t("status_stable") },
              { id: "UNSTABLE", label: t("status_unstable") },
              { id: "CORRUPTED", label: t("status_corrupted") },
              { id: "REVIEW", label: t("status_dd_review") },
              { id: "PENDING", label: t("status_pending") },
              { id: "UNVERIFIED", label: t("status_unverified") },
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
      </FilterPopover>
      <div className="relative group shrink-0">
        <button
          onClick={() => {
            if (vaultLayout === "standard") setVaultLayout("compact");
            else if (vaultLayout === "compact") setVaultLayout("list");
            else setVaultLayout("standard");
          }}
          className="w-12 h-12 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_5%,transparent)] flex items-center justify-center text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all shadow-sm hover:shadow-md"
        >
          <span className="material-symbols-outlined !text-[24px]">
            {vaultLayout === "standard" ? "view_module" : vaultLayout === "compact" ? "grid_view" : "view_list"}
          </span>
        </button>
        <HoverTooltip title={t("layout_toggle") || "Toggle Layout"} variant="default" noIcon={true} className="!hidden group-hover:!flex !bottom-[calc(100%+8px)] z-[200]" />
      </div>
      {onCreateLocalFolder && (
        <div className="relative group flex">
          <button
            onClick={() => { setSelectedMods && setSelectedMods([]); onCreateLocalFolder(); }}
            className="w-12 h-12 rounded-xl overflow-hidden transition-all flex items-center justify-center border hover:scale-[1.02] active:scale-95 shrink-0 glass-surface text-[var(--subtext)] hover:text-[var(--text)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
          >
            <span className="material-symbols-outlined !text-[18px]">add_circle</span>
          </button>
          <HoverTooltip title={t("btn_create_node")} variant="default" />
        </div>
      )}

      {(equipFilter === "ALL" || equipFilter === "EQUIPPED" || equipFilter === "UNEQUIPPED") && (
        <div className="relative group flex">
          <button
            onClick={() => setHideGhostCards(!hideGhostCards)}
            className={`w-12 h-12 rounded-xl overflow-hidden transition-all flex items-center justify-center border shrink-0 ${hideGhostCards
              ? 'border-[var(--success)] text-[var(--success)] bg-transparent shadow-[0_0_10px_rgba(var(--success-rgb),0.2)]'
              : 'glass-surface text-[var(--subtext)] hover:text-[var(--text)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'
              }`}
          >
            <span className="material-symbols-outlined !text-[18px]">
              {hideGhostCards ? "visibility_off" : "visibility"}
            </span>
          </button>
          <HoverTooltip title={t("btn_hide_ghosts")} variant="default" />
        </div>
      )}
    </div>
  );
}


