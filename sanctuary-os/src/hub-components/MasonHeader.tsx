import { SearchBar, ActionPill } from "../shared";
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
      <div className="px-6 py-4 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] z-10 w-full mb-4">
         <ActionPill
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchPlaceholder={t("search_files") as string}
            leftContent={
               <div className="w-max min-w-[160px] max-w-xs shrink-0 relative z-50 h-10 border-r border-[color-mix(in_srgb,var(--text)_6%,transparent)] pr-4 mr-4 flex items-center">
                  {isCloudMode ? (
                     <CustomDropdown
                        disableTint={true}
                        options={[
                           { id: "sanctuary_schemas", label: "SCHEMAS" },
                           { id: "sanctuary_lexicons", label: "LEXICONS" }
                        ]}
                        value={internalCloudTarget}
                        onChange={(v: string[]) => setInternalCloudTarget(v[0] as any)}
                        triggerClassName="!border-none !shadow-none !bg-transparent !px-0"
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
                        triggerClassName="!border-none !shadow-none !bg-transparent !px-0"
                     />
                  )}
               </div>
            }
            rightContent={
               <div className="flex items-center gap-2 h-full px-2 shrink-0">
                  {!(isCloudMode && internalCloudTarget === 'sanctuary_schemas') && (
                     <>
                        <button
                           onClick={() => setIsCreatePanelOpen(true)}
                           title={t("auto_create_file") as string}
                           className="h-9 w-9 rounded-md flex items-center justify-center hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors text-[var(--subtext)] hover:text-[var(--text)]"
                        >
                           <span className="material-symbols-outlined !text-[18px]">{t("icon_add")}</span>
                        </button>
                        <button
                           onClick={handleImport}
                           title={t("import_file") as string}
                           className="h-9 w-9 rounded-md flex items-center justify-center hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors text-[var(--subtext)] hover:text-[var(--text)]"
                        >
                           <span className="material-symbols-outlined !text-[18px]">{t("icon_upload")}</span>
                        </button>
                     </>
                  )}
               </div>
            }
         />
      </div>
   );
}
