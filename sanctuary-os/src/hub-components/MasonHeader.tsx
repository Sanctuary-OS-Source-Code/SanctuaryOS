import { CustomDropdown } from "../shared";

export default function MasonHeader({
   t,
   isCloudMode,
   searchQuery,
   setSearchQuery,
   fileTypeFilter,
   setFileTypeFilter,
   internalCloudTarget,
   setInternalCloudTarget,
   setIsCreatePanelOpen,
   handleImport
}: any) {
   return (
      <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-white/5 relative z-10">
         <h2 className="text-xl font-black text-[var(--text)] uppercase tracking-widest flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
               <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("icon_code")}</span>
            </div>
            <span className="truncate">{isCloudMode ? "WAYFINDER IDE" : t("tools_ide")}</span>
         </h2>

         <div className="flex items-center gap-3 relative flex-1 ml-auto justify-end">
            <div className="relative flex-1 max-w-[300px]">
               <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 !text-sm">{t("icon_search")}</span>
               <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={t("search_files")}
                  className="w-full theme-glass-panel rounded-2xl pl-10 pr-10 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
               />
            </div>

            <div className="w-max min-w-[160px] max-w-xs shrink-0 relative z-50 h-12">
               {isCloudMode ? (
                  <CustomDropdown
                     disableTint={true}
                     options={[
                        { id: "sanctuary_schemas", label: "MASTER SCHEMAS" },
                        { id: "sanctuary_lexicons", label: "MASTER LEXICONS" }
                     ]}
                     value={internalCloudTarget}
                     onChange={(v: string[]) => setInternalCloudTarget(v[0] as any)}
                  />
               ) : (
                  <CustomDropdown
                     disableTint={true}
                     options={[
                        { id: "all", label: "ALL FILES" },
                        { id: "json", label: "JSON DATA" },
                        { id: "cfg", label: "CONFIG (.CFG)" },
                        { id: "ini", label: "SETTINGS (.INI)" },
                        { id: "lexicon", label: "LEXICON PACK" }
                     ]}
                     value={fileTypeFilter}
                     onChange={(val: string[]) => setFileTypeFilter(val[0])}
                     placeholder={t("auto_file_type")}
                  />
               )}
            </div>

            <div className="flex items-center gap-4 shrink-0">
               <button onClick={() => setIsCreatePanelOpen(true)} className="h-12 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-105 shadow-lg font-black uppercase tracking-widest text-[10px] group">
                  <span className="material-symbols-outlined !text-[16px] group-hover:scale-110 transition-transform duration-500">{t("icon_add") || "add"}</span>
                  {t("auto_create_file") || "Create File"}
               </button>
               <button onClick={handleImport} className="h-12 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-105 shadow-lg font-black uppercase tracking-widest text-[10px] group">
                  <span className="material-symbols-outlined !text-[16px] group-hover:-translate-y-1 transition-transform duration-500">{t("icon_upload") || "upload"}</span>
                  {t("import_file")}
               </button>
            </div>
         </div>
      </div>
   );
}
