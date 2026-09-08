import { SearchBar, ScreenUtilityBar } from "../shared";
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
      <ScreenUtilityBar
         search={searchQuery}
         onSearchChange={setSearchQuery}
         searchPlaceholder={t("search_files") as string}
         className="px-6 py-4 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] z-10"
      >
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
                     className="shrink-0 h-12 px-6 font-black capitalize tracking-widest text-[10px]"
                     icon={t("icon_add")}
                     label={t("auto_create_file")}
                  />
                  <ActionButton
                     onClick={handleImport}
                     className="shrink-0 h-12 px-6 font-black capitalize tracking-widest text-[10px]"
                     icon={t("icon_upload")}
                     label={t("import_file")}
                  />
               </>
            )}
         </div>

      </ScreenUtilityBar>
   );
}
