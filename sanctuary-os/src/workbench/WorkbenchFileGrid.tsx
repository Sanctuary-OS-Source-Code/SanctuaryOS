import React from 'react';
import { useLexicon } from '../LexiconContext';
import { useStore } from '../store';

interface WorkbenchFileCardProps {
   file: { name: string; path: string };
   isTmpl: boolean;
   renamingFile: string | null;
   renameInput: string;
   deleteConfirmPath: string | null;
   setRenameInput: (val: string) => void;
   setRenamingFile: (path: string | null) => void;
   setDeleteConfirmPath: (path: string | null) => void;
   handleRenameSubmit: (path: string, name: string) => void;
   handleDeleteTemplate: (path: string) => void;
   openFile: (file: any) => void;
}

const WorkbenchFileCard = React.memo(({
   file,
   isTmpl,
   renamingFile,
   renameInput,
   deleteConfirmPath,
   setRenameInput,
   setRenamingFile,
   setDeleteConfirmPath,
   handleRenameSubmit,
   handleDeleteTemplate,
   openFile
}: WorkbenchFileCardProps) => {
   const { t } = useLexicon();
   const hasUnsavedEdits = useStore(state => state.cwUnsavedEdits[file.path] !== undefined);

   return (
      <div className="group relative break-inside-avoid">
         <button
            onClick={() => openFile(file)}
            className={`w-full text-left p-6 rounded-[var(--radius)] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_20px_40px_rgba(0,0,0,0.3)] flex flex-col gap-4 relative group-hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] ${hasUnsavedEdits ? 'border border-amber-500/30 text-amber-500 bg-amber-500/10 hover:bg-amber-500/20 hover:border-amber-500/50 backdrop-blur-[3px] shadow-[0_8px_32px_rgba(245,158,11,0.15)]' : 'border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]'}`}
         >
            <div className="absolute inset-0 rounded-[var(--radius)] bg-gradient-to-br from-[var(--accent)]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            <div className="w-12 h-12 rounded-2xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] flex items-center justify-center border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner group-hover:border-[var(--accent)]/50 transition-colors">
               <span className="material-symbols-outlined !text-2xl text-[var(--subtext)] group-hover:text-[var(--accent)] transition-colors">{isTmpl ? (t("icon_data_object")) : (t("icon_settings"))}</span>
            </div>
            <div className={`flex flex-col gap-1 z-10 w-full ${renamingFile !== file.path ? 'pr-10' : ''}`} onClick={(e) => renamingFile === file.path ? e.stopPropagation() : undefined}>
               {renamingFile === file.path ? (
                  <div className="flex items-center gap-2 w-full mt-1">
                     <input
                        autoFocus
                        value={renameInput}
                        onChange={e => setRenameInput(e.target.value)}
                        onKeyDown={e => {
                           if (e.key === 'Enter') handleRenameSubmit(file.path, file.name);
                           if (e.key === 'Escape') setRenamingFile(null);
                        }}
                        className="h-8 w-full min-w-0 px-3 rounded-xl text-[12px] font-black bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:border-[var(--accent)] text-[var(--text)] focus:outline-none focus:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-all placeholder:text-[var(--subtext)] shadow-inner"
                        placeholder={file.name}
                     />
                     <button onClick={() => handleRenameSubmit(file.path, file.name)} className="shrink-0 w-8 h-8 rounded-xl border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--success)_50%,transparent)] flex items-center justify-center transition-all shadow-md hover:scale-110 active:scale-95">
                        <span className="material-symbols-outlined !text-sm">{t("icon_check")}</span>
                     </button>
                     <button onClick={() => setRenamingFile(null)} className="shrink-0 w-8 h-8 rounded-xl border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] flex items-center justify-center transition-all shadow-md hover:scale-110 active:scale-95">
                        <span className="material-symbols-outlined !text-sm">{t("icon_close")}</span>
                     </button>
                  </div>
               ) : (
                  <>
                     <span className="text-sm font-black text-[var(--text)] tracking-wider truncate">{file.name.lastIndexOf('.') > 0 ? file.name.substring(0, file.name.lastIndexOf('.')) : file.name}</span>
                     <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtext)] opacity-60">{file.name.lastIndexOf('.') > 0 ? file.name.substring(file.name.lastIndexOf('.')) : (isTmpl ? (t("schema_json")) : (t("schema_system")))}</span>
                  </>
               )}
            </div>
         </button>
         {hasUnsavedEdits && (
            <div className="absolute top-6 right-6 flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-[var(--warning)] bg-[var(--warning)]/20 border border-[var(--warning)]/40 px-3 py-1.5 rounded-full shadow-lg z-20 pointer-events-none backdrop-blur-xl">
               <span className="material-symbols-outlined !text-[12px]">{t("icon_warning")}</span>
               {t("unsaved_changes")}
            </div>
         )}
         {isTmpl && renamingFile !== file.path && (
            <div onClick={(e) => e.stopPropagation()} className="absolute bottom-6 right-6 flex items-center gap-2 z-20">
               {deleteConfirmPath === file.path ? (
                  <>
                     <button onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(file.path); setDeleteConfirmPath(null); }} className="w-8 h-8 rounded-xl border border-rose-500/30 text-rose-500 bg-rose-500/10 hover:bg-rose-500/20 hover:border-rose-500/50 backdrop-blur-[3px] flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-[0_4px_12px_rgba(244,63,94,0.15)]">
                        <span className="material-symbols-outlined !text-sm drop-shadow-md">{t("icon_check")}</span>
                     </button>
                     <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmPath(null); }} className="w-8 h-8 rounded-xl border border-white/10 text-[var(--subtext)] bg-white/5 hover:bg-white/10 hover:text-[var(--text)] hover:border-white/20 backdrop-blur-[3px] flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-lg">
                        <span className="material-symbols-outlined !text-sm">{t("icon_close")}</span>
                     </button>
                  </>
               ) : (
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                     <button
                        onClick={(e) => { e.stopPropagation(); setRenamingFile(file.path); const d = file.name.lastIndexOf('.'); setRenameInput(d > 0 ? file.name.substring(0, d) : file.name); }}
                        className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-[var(--subtext)] hover:bg-white/10 hover:border-white/20 hover:text-[var(--text)] transition-all hover:scale-110 active:scale-95 shadow-lg"
                     >
                        <span className="material-symbols-outlined !text-sm">{t("icon_edit")}</span>
                     </button>
                     <button
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirmPath(file.path); }}
                        className="w-8 h-8 rounded-xl bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] flex items-center justify-center text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] transition-all hover:scale-110 active:scale-95 shadow-lg"
                     >
                        <span className="material-symbols-outlined !text-sm">{t("icon_delete")}</span>
                     </button>
                  </div>
               )}
            </div>
         )}
      </div>
   );
});

interface WorkbenchFileGridProps {
   filteredMainFiles: { name: string; path: string }[];
   mainTab: string;
   renamingFile: string | null;
   renameInput: string;
   deleteConfirmPath: string | null;
   setRenameInput: (val: string) => void;
   setRenamingFile: (path: string | null) => void;
   setDeleteConfirmPath: (path: string | null) => void;
   handleRenameSubmit: (path: string, name: string) => void;
   handleDeleteTemplate: (path: string) => void;
   openFile: (file: any) => void;
}

export const WorkbenchFileGrid = React.memo(({
   filteredMainFiles,
   mainTab,
   renamingFile,
   renameInput,
   deleteConfirmPath,
   setRenameInput,
   setRenamingFile,
   setDeleteConfirmPath,
   handleRenameSubmit,
   handleDeleteTemplate,
   openFile
}: WorkbenchFileGridProps) => {
   const { t } = useLexicon();

   if (filteredMainFiles.length === 0) {
      return (
         <div className="w-full p-12 rounded-[var(--radius)] theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col items-center justify-center gap-4 opacity-60 shadow-inner">
            <span className="material-symbols-outlined !text-4xl text-[var(--subtext)]">{mainTab === "CONFIGS" ? (t("icon_search_off")) : (t("icon_data_object"))}</span>
            <span className="text-[11px] font-black uppercase tracking-widest text-[var(--text)]">{t("workbench_no_files_found")}</span>
         </div>
      );
   }

   return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6">
         {filteredMainFiles.map(file => (
            <WorkbenchFileCard
               key={file.path}
               file={file}
               isTmpl={file.name.toLowerCase().endsWith('.json')}
               renamingFile={renamingFile}
               renameInput={renameInput}
               deleteConfirmPath={deleteConfirmPath}
               setRenameInput={setRenameInput}
               setRenamingFile={setRenamingFile}
               setDeleteConfirmPath={setDeleteConfirmPath}
               handleRenameSubmit={handleRenameSubmit}
               handleDeleteTemplate={handleDeleteTemplate}
               openFile={openFile}
            />
         ))}
      </div>
   );
});
