import React from 'react';
import { CustomDropdown, isVersionMatch, getHighestVersion, getLowestVersion, SearchBar, ScreenUtilityBar } from "../../shared";

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
  onCreateLocalFolder,
  setSelectedMods
}: any) {
  return (
        <ScreenUtilityBar
      search={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder={t("search_ph")}
      className="!mb-8 animate-in slide-in-from-top-4 duration-500 relative z-20"
    >

          <div className="flex items-center gap-2 flex-1 xl:flex-none xl:w-max min-w-[140px] shrink-0 relative z-50 h-12">
            <div className="flex-1 xl:max-w-[200px] h-full">
                <CustomDropdown disableTint={true}
                  value={activeCategory}
                  onChange={(val: string[]) => { setActiveCategory(val[0]); setActiveSubType("ALL"); }}
                  options={[
                    { id: "ALL", label: t("ql_all") || "ALL" },
                    ...(activeGameSchema?.mod_categories?.map((cat: any) => ({
                      id: cat.id,
                      label: t(cat.lexicon_key) || cat.id
                    })) || []),
                    { id: "LOCAL_FOLDERS", label: t("filter_local") || "LOCAL FOLDERS" }
                  ]}
                />
            </div>
          </div>

        {(() => {
          const activeSchemaCategory = activeGameSchema?.mod_categories?.find((c: any) => c.id === activeCategory);
          const subcats = activeSchemaCategory?.subcategories || [];
          if (subcats.length === 0) return null;

          return (
            <div className="flex-1 xl:flex-none xl:w-max min-w-[140px] xl:max-w-[200px] shrink-0 relative z-50 h-12 animate-in fade-in slide-in-from-right-4">
              <CustomDropdown disableTint={true}
                value={activeSubType}
                onChange={(val: string[]) => setActiveSubType(val[0])}
                options={[
                  { id: "ALL", label: t("ql_all") || "ALL" },
                  ...subcats.map((sub: any) => ({
                    id: sub.id,
                    label: t(sub.lexicon_key) || sub.id
                  }))
                ]}
              />
            </div>
          );
        })()}

        <div className="flex-1 xl:flex-none xl:w-max min-w-[140px] xl:max-w-[200px] shrink-0 relative z-[49] h-12">
          <CustomDropdown disableTint={true}
            value={filterStatus}
            onChange={(val: string[]) => setFilterStatus(val[0])}
            options={[
              { id: "ALL", label: t("ql_all") || "ALL" },
              { id: "STABLE", label: t("status_stable") || "STABLE" },
              { id: "UNSTABLE", label: t("status_unstable") || "UNSTABLE" },
              { id: "CORRUPTED", label: t("status_corrupted") || "CORRUPTED" },
              { id: "REVIEW", label: t("status_dd_review") || "UNDER REVIEW" },
              { id: "PENDING", label: t("status_pending") || "PENDING" },
              { id: "UNVERIFIED", label: t("status_unverified") || "UNVERIFIED" },
            ]}
          />
        </div>

        {equipFilter === "ARCHIVES" && (
          <div className="flex-1 xl:flex-none xl:w-max min-w-[140px] xl:max-w-[200px] shrink-0 relative z-[48] h-12">
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
                <CustomDropdown disableTint={true}
                  options={archiveOptions}
                  value={activeVal}
                  onChange={(val: any) => {
                    const newVal = Array.isArray(val) ? val[0] : val;
                    setArchiveVersionFilter(newVal || "");
                  }}
                  placeholder={t("filter_archive_version")}
                  multiSelect={false}
                />
              );
            })()}
          </div>
        )}

        {onCreateLocalFolder && (
          <button
            onClick={() => { setSelectedMods && setSelectedMods([]); onCreateLocalFolder(); }}
            className="h-12 px-5 rounded-2xl overflow-hidden text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 border hover:scale-[1.02] active:scale-95 shrink-0 glass-surface text-[var(--subtext)] hover:text-[var(--text)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
          >
            <span className="material-symbols-outlined !text-[18px]">add_circle</span>
            {t("btn_create_node") || "NEW NODE"}
          </button>
        )}

        {(equipFilter === "ALL" || equipFilter === "EQUIPPED" || equipFilter === "UNEQUIPPED") && (
          <button
            onClick={() => setHideGhostCards(!hideGhostCards)}
            className={`h-12 px-5 rounded-2xl overflow-hidden text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 border hover:scale-[1.02] active:scale-95 shrink-0 ${hideGhostCards
              ? 'bg-emerald-500/[15%] text-[var(--success)] border-emerald-500/[30%] hover:bg-emerald-500/[20%] shadow-inner'
              : 'glass-surface text-[var(--subtext)] hover:text-[var(--text)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'
              }`}
          >
            <span className="material-symbols-outlined !text-[18px]">
              {hideGhostCards ? "visibility_off" : "visibility"}
            </span>
            {t("btn_hide_ghosts")}
          </button>
        )}
          </ScreenUtilityBar>
  );
}
