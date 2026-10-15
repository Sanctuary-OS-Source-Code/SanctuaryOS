import { EmptyState } from "../shared";
import { useState, useEffect } from "react";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { UniversalCard } from "../components/universal/UniversalCard";

export default function MasonFileBrowser({
   t,
   files,
   searchQuery,
   fileTypeFilter,
   openFile,
   renamingFile,
   setRenamingFile,
   renameInput,
   setRenameInput,
   renameExt,
   setRenameExt,
   handleRenameSubmit,
   deleteConfirmPath,
   setDeleteConfirmPath,
   handleDeleteFile,
   openFiles,
   handlePublishLexicon,
   isCloudMode,
   internalCloudTarget,
   fetchError,
   layout
}: any) {
   const [templatePaths, setTemplatePaths] = useState<string[]>([]);

   useEffect(() => {
      if (fileTypeFilter === 'templates' && !isCloudMode) {
         const checkTemplates = async () => {
            const tmplPaths: string[] = [];
            for (const f of files) {
               if (f.name.toLowerCase().endsWith('.json')) {
                  try {
                     const content = await readTextFile(f.path);
                     if (content.includes('"template_id"')) {
                        tmplPaths.push(f.path);
                     }
                  } catch (e) {
                     // ignore
                  }
               }
            }
            setTemplatePaths(tmplPaths);
         };
         checkTemplates();
      }
   }, [fileTypeFilter, files, isCloudMode]);

   const filteredFiles = files.filter((f: any) => {
      if (searchQuery && !f.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (fileTypeFilter === "lexicon") {
         if (!f.name.match(/^[a-z]{2}-.+\.json$/i)) return false;
      } else if (fileTypeFilter === "templates") {
         if (!templatePaths.includes(f.path)) return false;
      } else if (fileTypeFilter === "settings") {
         if (!f.name.toLowerCase().endsWith('.ini') && !f.name.toLowerCase().endsWith('.cfg')) return false;
      } else if (fileTypeFilter !== "all") {
         if (!f.name.toLowerCase().endsWith(`.${fileTypeFilter}`)) return false;
      }
      return true;
   });

   if (fetchError) {
      return <EmptyState icon="error" title={t("fetch_error") || "Fetch Error"} subtitle={fetchError} className="col-span-full py-16" />;
   }

   if (filteredFiles.length === 0) {
      return <EmptyState icon="folder_off" title={t("workbench_no_files_found") || "No Files Found"} className="col-span-full py-16" />;
   }

   return (
      <div className={`grid ${layout === 'list' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-[repeat(auto-fill,minmax(280px,1fr))]'} gap-6 w-full px-2 py-4`}>
         {filteredFiles.map((file: any) => {
            const isTmpl = file.name.toLowerCase().endsWith('.json');
            const isLexicon = isCloudMode ? internalCloudTarget === 'sanctuary_lexicons' : file.name.match(/^[a-z]{2}-.+\.json$/i);
            const isUnsaved = !!openFiles.find((o: any) => o.path === file.path && o.content !== o.originalContent);
            const displayName = file.name.lastIndexOf('.') > 0 ? file.name.substring(0, file.name.lastIndexOf('.')) : file.name;
            const displaySub = isLexicon
               ? (t("auto_lexicon_pack") || "Lexicon Pack")
               : (file.name.lastIndexOf('.') > 0
                  ? file.name.substring(file.name.lastIndexOf('.'))
                  : (isTmpl ? (t("json_file") || "JSON File") : (t("source_file") || "Source File")));

            return (
               <UniversalCard
                  key={file.path}
                  icon={isLexicon ? "translate" : (isTmpl ? "data_object" : "description")}
                  title={renamingFile === file.path ? undefined : displayName}
                  subtitle={renamingFile === file.path ? undefined : displaySub}
                  onClick={() => !renamingFile && openFile(file)}
                  className={isUnsaved ? "border-[color-mix(in_srgb,var(--warning)_40%,transparent)] text-[var(--warning)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--warning)_50%,transparent)]" : ""}
                  badges={
                     isUnsaved ? (
                        <div className="flex items-center gap-1 text-[8px] font-black capitalize tracking-widest text-[var(--warning)] bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] border border-[color-mix(in_srgb,var(--warning)_40%,transparent)] px-3 py-1.5 rounded-full shadow-lg pointer-events-none backdrop-blur-xl">
                           <span className="material-symbols-outlined !text-[12px]">{t("icon_warning") || "warning"}</span>
                           {t("unsaved_changes") || "Unsaved"}
                        </div>
                     ) : undefined
                  }
               >
                  {renamingFile === file.path && (
                     <div className="flex items-center gap-2 z-20 mt-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-col gap-1 w-full min-w-0">
                           <input
                              type="text"
                              value={renameInput}
                              onChange={(e) => setRenameInput(e.target.value)}
                              className="h-8 w-full min-w-0 px-3 rounded-xl text-[12px] font-black bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:border-[var(--accent)] text-[var(--text)] focus:outline-none focus:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-all placeholder:text-[var(--subtext)] shadow-inner font-mono"
                              autoFocus
                              onKeyDown={(e) => {
                                 if (e.key === 'Enter') handleRenameSubmit(file.path, file.name);
                                 if (e.key === 'Escape') setRenamingFile(null);
                              }}
                           />
                           <input
                              type="text"
                              value={renameExt}
                              onChange={(e) => setRenameExt(e.target.value)}
                              className="h-6 w-16 px-2 rounded-lg text-[10px] font-bold capitalize tracking-widest bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] focus:border-[var(--accent)] text-[var(--subtext)] focus:outline-none transition-all placeholder:text-[color-mix(in_srgb,var(--subtext)_50%,transparent)] shadow-inner"
                              onKeyDown={(e) => {
                                 if (e.key === 'Enter') handleRenameSubmit(file.path, file.name);
                                 if (e.key === 'Escape') setRenamingFile(null);
                              }}
                           />
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                           <button onClick={() => handleRenameSubmit(file.path, file.name)} className="shrink-0 w-8 h-8 rounded-xl border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--success)_50%,transparent)] flex items-center justify-center transition-all shadow-md hover:scale-110 active:scale-95">
                              <span className="material-symbols-outlined !text-sm">{t("icon_check") || "check"}</span>
                           </button>
                           <button onClick={() => setRenamingFile(null)} className="shrink-0 w-8 h-8 rounded-xl border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] flex items-center justify-center transition-all shadow-md hover:scale-110 active:scale-95">
                              <span className="material-symbols-outlined !text-sm">{t("icon_close") || "close"}</span>
                           </button>
                        </div>
                     </div>
                  )}

                  {renamingFile !== file.path && (
                     <div onClick={(e) => e.stopPropagation()} className="absolute bottom-6 right-6 flex items-center gap-2 z-20">
                        {deleteConfirmPath === file.path ? (
                           <>
                              <button onClick={(e) => { e.stopPropagation(); handleDeleteFile(file.path); setDeleteConfirmPath(null); }} className="w-8 h-8 rounded-xl border border-[color-mix(in_srgb,var(--danger)_50%,transparent)] text-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_80%,transparent)] backdrop-blur-[3px] flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-md">
                                 <span className="material-symbols-outlined !text-sm drop-shadow-md">{t("icon_check") || "check"}</span>
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmPath(null); }} className="w-8 h-8 rounded-xl border border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--subtext)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:text-[var(--text)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] backdrop-blur-[3px] flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-lg">
                                 <span className="material-symbols-outlined !text-sm">{t("icon_close") || "close"}</span>
                              </button>
                           </>
                        ) : (
                           <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              {!(isCloudMode && internalCloudTarget === 'sanctuary_schemas') && (
                                 <>
                                    <button
                                       onClick={(e) => { e.stopPropagation(); setRenamingFile(file.path); const d = file.name.lastIndexOf('.'); setRenameInput(d > 0 ? file.name.substring(0, d) : file.name); setRenameExt(d > 0 ? file.name.substring(d) : ''); }}
                                       className="w-8 h-8 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_15%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] hover:text-[var(--text)] transition-all hover:scale-110 active:scale-95 shadow-lg"
                                    >
                                       <span className="material-symbols-outlined !text-sm">{t("icon_edit") || "edit"}</span>
                                    </button>
                                    <button
                                       onClick={(e) => { e.stopPropagation(); setDeleteConfirmPath(file.path); }}
                                       className="w-8 h-8 rounded-xl bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] flex items-center justify-center text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] transition-all hover:scale-110 active:scale-95 shadow-lg"
                                    >
                                       <span className="material-symbols-outlined !text-sm">{t("icon_delete") || "delete"}</span>
                                    </button>
                                 </>
                              )}
                           </div>
                        )}
                     </div>
                  )}
               </UniversalCard>
            );
         })}
      </div>
   );
}





