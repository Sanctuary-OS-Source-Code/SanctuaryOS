import React from 'react';
import { CustomDropdown, isVersionMatch, getHighestVersion, getLowestVersion, SearchBar } from "../../shared";

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
    <div className={`flex flex-col xl:flex-row xl:items-center gap-4 py-4 shrink-0 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] w-full mb-8 relative z-20 animate-in slide-in-from-top-4 duration-500`}>
      <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] hidden xl:flex items-center gap-3 shrink-0">
        <div className="w-12 h-12 rounded-xl glass-panel border border-[var(--accent)]/[30%] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("icon_inventory_2")}</span>
        </div>
        <span className="truncate">{t("title_artifacts") || "YOUR ARTIFACTS"}</span>
      </h2>

        <div className="flex flex-wrap xl:flex-nowrap items-center gap-3 relative flex-1 xl:ml-auto xl:justify-end w-full xl:w-auto">
          <DebouncedSearchInput value={searchQuery} onChange={setSearchQuery} placeholder={t("search_ph")} t={t} />

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
              { id: "VERIFIED", label: t("verified") },
              { id: "REVIEW", label: t("status_dd_review") },
              { id: "UNVERIFIED", label: t("unverified") }
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
      </div>
    </div>
  );
}
