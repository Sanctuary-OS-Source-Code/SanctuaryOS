import React from 'react';
import { CustomDropdown, isVersionMatch, getHighestVersion, getLowestVersion } from "../../shared";

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
    <div className="relative flex-1 min-w-[200px] w-full xl:max-w-[300px]">
      <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-sm opacity-50">{t("icon_search")}</span>
      <input
        type="text"
        placeholder={placeholder}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        className="w-full theme-glass-panel rounded-2xl pl-10 pr-10 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
      />
      {localValue && (
        <button onClick={() => { setLocalValue(""); onChange(""); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] hover:text-[var(--text)] transition-colors flex items-center justify-center">
          <span className="material-symbols-outlined text-sm">{t("icon_close")}</span>
        </button>
      )}
    </div>
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
  setHideGhostCards
}: any) {
  return (
    <div className={`flex flex-col xl:flex-row xl:items-center gap-4 py-4 shrink-0 border-b border-white/5 w-full mb-8 relative z-20 animate-in slide-in-from-top-4 duration-500`}>
      <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] hidden xl:flex items-center gap-3 shrink-0">
        <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("icon_inventory_2")}</span>
        </div>
        <span className="truncate">{t("title_artifacts") || "YOUR ARTIFACTS"}</span>
      </h2>

      <div className="flex flex-wrap xl:flex-nowrap items-center gap-3 relative flex-1 xl:ml-auto xl:justify-end w-full xl:w-auto">
        <DebouncedSearchInput value={searchQuery} onChange={setSearchQuery} placeholder={t("search_ph")} t={t} />

        <div className="flex-1 xl:flex-none xl:w-max min-w-[140px] xl:max-w-[200px] shrink-0 relative z-50 h-12">
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

        {(equipFilter === "ALL" || equipFilter === "EQUIPPED" || equipFilter === "UNEQUIPPED") && (
          <button
            onClick={() => setHideGhostCards(!hideGhostCards)}
            className={`h-12 px-5 rounded-2xl overflow-hidden text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 border shadow-lg hover:scale-[1.02] active:scale-95 shrink-0 ${hideGhostCards
              ? 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)] text-[var(--success)] border-[color-mix(in_srgb,var(--success)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] hover:shadow-[0_5px_20px_color-mix(in_srgb,var(--success)_20%,transparent)]'
              : 'theme-glass-panel text-[var(--subtext)] hover:text-[var(--text)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-white/5'
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
