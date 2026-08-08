import { SearchBar } from "../shared";
import { CustomDropdown, FilterTabs, FilterTabButton, ActionButton } from "../shared";

export default function MasonHeader({
   t,
   isCloudMode,
   isKeepers = false,
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
      <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] relative z-10">
         <h2 className="text-xl font-black text-[var(--text)] uppercase tracking-widest flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl glass-panel border border-[var(--accent)]/[30%] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
               <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("icon_code")}</span>
            </div>
            <span className="truncate">{isCloudMode ? (isKeepers ? "KEEPERS IDE" : "WAYFINDER IDE") : t("tools_ide")}</span>
         </h2>

         <div className="flex items-center gap-3 relative flex-1 ml-auto justify-end">
            <div className="relative flex-1 max-w-[300px]">
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={t("search_files")}
              className="h-12 w-full rounded-2xl"
            />
          </div>

            <div className="w-max min-w-[160px] max-w-xs shrink-0 relative z-50 h-12">
               {isCloudMode ? (
                  <CustomDropdown
                     disableTint={true}
                     options={[
                        { id: "sanctuary_schemas", label: "SCHEMAS" },
                        { id: "sanctuary_lexicons", label: "LEXICONS" }
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
               {!(isCloudMode && internalCloudTarget === 'sanctuary_schemas') && (
                  <>
                     <ActionButton
                        onClick={() => setIsCreatePanelOpen(true)}
                        className="shrink-0 h-12 px-6 font-black uppercase tracking-widest text-[10px]"
                        icon={t("icon_add") || "add"}
                        label={t("auto_create_file") || "Create File"}
                     />
                     <ActionButton
                        onClick={handleImport}
                        className="shrink-0 h-12 px-6 font-black uppercase tracking-widest text-[10px]"
                        icon={t("icon_upload") || "upload"}
                        label={t("import_file")}
                     />
                  </>
               )}
            </div>
         </div>
      </div>
   );
}
