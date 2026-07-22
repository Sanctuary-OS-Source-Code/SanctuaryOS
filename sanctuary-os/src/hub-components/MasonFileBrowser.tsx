import { EmptyState } from "../shared";

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
   internalCloudTarget
}: any) {

   const filteredFiles = files.filter((f: any) => {
      if (searchQuery && !f.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (fileTypeFilter === "lexicon") {
         if (!f.name.match(/^[a-z]{2}-.+\.json$/i)) return false;
      } else if (fileTypeFilter !== "all") {
         if (!f.name.toLowerCase().endsWith(`.${fileTypeFilter}`)) return false;
      }
      return true;
   });

   if (filteredFiles.length === 0) {
      return <EmptyState icon={t("icon_folder_off") || "folder_off"} title={t("tools_ide")} className="col-span-full py-16" />;
   }

   return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6 w-full">
         {filteredFiles.map((file: any) => {
            const isTmpl = file.name.toLowerCase().endsWith('.json');
            const isLexicon = file.name.match(/^[a-z]{2}-.+\.json$/i);
            return (
               <div key={file.path} className="group relative break-inside-avoid">
                  <div
                     onClick={() => !renamingFile && openFile(file)}
                     className={`w-full text-left p-6 rounded-[var(--radius)] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_20px_40px_rgba(0,0,0,0.3)] flex flex-col gap-4 relative group-hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] cursor-pointer ${openFiles.find((o: any) => o.path === file.path && o.content !== o.originalContent) ? 'border border-amber-500/30 text-amber-500 bg-amber-500/10 hover:bg-amber-500/20 hover:border-amber-500/50 backdrop-blur-[3px] shadow-[0_8px_32px_rgba(245,158,11,0.15)]' : 'border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]'}`}
                  >
                     <div className="absolute inset-0 rounded-[var(--radius)] bg-gradient-to-br from-[var(--accent)]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                     {openFiles.find((o: any) => o.path === file.path && o.content !== o.originalContent) && (
                        <div className="absolute top-6 right-6 flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-[var(--warning)] bg-[var(--warning)]/20 border border-[var(--warning)]/40 px-3 py-1.5 rounded-full shadow-lg z-20 pointer-events-none backdrop-blur-xl">
                           <span className="material-symbols-outlined !text-[12px]">{t("icon_warning")}</span>
                           {t("unsaved_changes")}
                        </div>
                     )}

                     <div className="w-12 h-12 rounded-2xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] flex items-center justify-center border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner group-hover:border-[var(--accent)]/50 transition-colors relative z-10">
                        <span className="material-symbols-outlined !text-2xl text-[var(--subtext)] group-hover:text-[var(--accent)] transition-colors">{isLexicon ? "translate" : (isTmpl ? "data_object" : "description")}</span>
                     </div>

                     {renamingFile === file.path ? (
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
                                 className="h-6 w-16 px-2 rounded-lg text-[10px] font-bold uppercase tracking-widest bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] focus:border-[var(--accent)] text-[var(--subtext)] focus:outline-none transition-all placeholder:text-[var(--subtext)]/50 shadow-inner"
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
                     ) : (
                        <div className="flex flex-col gap-1 z-10 pr-10 text-left">
                           <span className="text-sm font-black text-[var(--text)] tracking-wider truncate block">{file.name.lastIndexOf('.') > 0 ? file.name.substring(0, file.name.lastIndexOf('.')) : file.name}</span>
                           <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtext)] opacity-60 block">{isLexicon ? "Lexicon Pack" : (file.name.lastIndexOf('.') > 0 ? file.name.substring(file.name.lastIndexOf('.')) : (isTmpl ? "JSON File" : "Source File"))}</span>
                        </div>
                     )}

                     {renamingFile !== file.path && (
                        <div onClick={(e) => e.stopPropagation()} className="absolute bottom-6 right-6 flex items-center gap-2 z-20">
                           {deleteConfirmPath === file.path ? (
                              <>
                                 <button onClick={(e) => { e.stopPropagation(); handleDeleteFile(file.path); setDeleteConfirmPath(null); }} className="w-8 h-8 rounded-xl border border-[var(--danger)]/50 text-[var(--danger)] bg-[var(--danger)]/10 hover:bg-[var(--danger)]/20 hover:border-[var(--danger)]/80 backdrop-blur-[3px] flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-[0_4px_12px_rgba(244,63,94,0.15)]">
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
                  </div>
               </div>
            );
         })}
      </div>
   );
}
