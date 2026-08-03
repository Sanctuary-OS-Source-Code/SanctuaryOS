import React, { useState, useEffect } from 'react';
import { useLexicon } from './LexiconContext';
import { useStore } from './store';
import { ViewHeader, HubTabButton, SidePanel, standardButtonClass, standardDangerButtonClass, ActionButton } from './shared';
import { WorkbenchFileGrid } from './workbench/WorkbenchFileGrid';
import { WorkbenchSidePanel } from './workbench/WorkbenchSidePanel';
import { PushTemplateSidePanel } from './side-panels/PushTemplateSidePanel';
import { WorkbenchTemplateGuide } from './workbench/WorkbenchTemplateGuide';
import VersionTimeline from "./VersionTimeline";
import { invoke } from '@tauri-apps/api/core';
import { supabase } from './supabase';
import { supabaseServices } from './lib/supabase-services';
import { writeTextFile, remove } from '@tauri-apps/plugin-fs';

import { useWorkbenchFiles } from './workbench/hooks/useWorkbenchFiles';
import { useWorkbenchEditor } from './workbench/hooks/useWorkbenchEditor';
import { useWorkbenchLayout } from './workbench/hooks/useWorkbenchLayout';

export default function CitizensWorkbench({ onOpenMasonProfile }: { onOpenMasonProfile?: (masonId: string, postId?: string) => void }) {
   const { t } = useLexicon();
   
   const mainTab = useStore(state => state.cwMainTab);
   const setMainTab = useStore(state => state.setCwMainTab);
   const [mainSearchQuery, setMainSearchQuery] = useState("");
   
   const vaultPath = useStore(state => state.vaultPath);
   const selectedFile = useStore(state => state.cwSelectedFile);

   const [isPushModalOpen, setIsPushModalOpen] = useState(false);
   const [showTimeline, setShowTimeline] = useState(false);
   
   const [isFlagPanelOpen, setIsFlagPanelOpen] = useState(false);
   const [flagReason, setFlagReason] = useState("");
   const [isFlagging, setIsFlagging] = useState(false);
   const [flagSuccess, setFlagSuccess] = useState(false);

   const fileState = useWorkbenchFiles({ mainTab, mainSearchQuery });
   
   const editorState = useWorkbenchEditor();

   const layoutState = useWorkbenchLayout({
      editorRef: editorState.editorRef,
      previewMode: 'preview',
      isTemplateMode: selectedFile?.name.toLowerCase().endsWith('.json') || false
   });

   const [activeTemplate, setActiveTemplate] = useState<any>(null);
   const [customAppliedTemplate, setCustomAppliedTemplate] = useState<any>(null);
   const [selectedTemplatePath, setSelectedTemplatePath] = useState<string>("built_in");
   const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
   const [searchQuery, setSearchQuery] = useState("");
   const [lastInitializedFile, setLastInitializedFile] = useState<string | null>(null);

   useEffect(() => {
      if (selectedFile && fileState.availableTemplates.length > 0 && lastInitializedFile !== selectedFile.path) {
         setLastInitializedFile(selectedFile.path);
         
         const commTmpl = fileState.availableTemplates.find((t: any) => t.isCommunity);
         const builtIn = fileState.availableTemplates.find((t: any) => t.id === "built_in");
         
         const defaultId = commTmpl ? commTmpl.id : (builtIn ? "built_in" : fileState.availableTemplates[0].id);
         setSelectedTemplatePath(defaultId);
         
         const tmpl = fileState.availableTemplates.find((t: any) => t.id === defaultId);
         if (tmpl && (tmpl.id === "built_in" || tmpl.isCommunity)) {
            setActiveTemplate(tmpl.data);
            setCustomAppliedTemplate(null);
         } else if (tmpl) {
            setCustomAppliedTemplate(tmpl.data);
            setActiveTemplate(null);
         }
      } else if (!selectedFile) {
         setLastInitializedFile(null);
      }
   }, [selectedFile, fileState.availableTemplates, lastInitializedFile]);

   useEffect(() => {
      return () => {
         useStore.getState().setCwSelectedFile(null);
      };
   }, []);

   return (
      <div className="flex flex-col w-full relative animate-in fade-in slide-in-from-bottom-4 duration-700">
         <ViewHeader title={t("workbench_title") || "CITIZENS WORKBENCH"} subtitle={t("workbench_subtitle")} icon="tune" />

         <div className="flex flex-col gap-0 min-h-max w-full">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 animate-in slide-in-from-top-4 duration-500 mb-6">
               <div className="flex items-center overflow-x-auto overflow-y-hidden accent-scrollbar theme-glass-panel rounded-2xl border border-white/5 shadow-inner divide-x divide-white/5 w-full">
                  <HubTabButton id="CONFIGS" icon="settings" label={t("configs")} activeTab={mainTab} setTab={setMainTab as any} />
                  <HubTabButton id="TEMPLATES" icon="data_object" label={t("ql_templates")} activeTab={mainTab} setTab={setMainTab as any} />
               </div>
            </div>

            <div className="flex flex-col xl:flex-row xl:items-center gap-4 py-4 shrink-0 border-b border-white/5 w-full mb-8 relative z-20 animate-in slide-in-from-top-4 duration-500">
               <h2 className="text-xl font-black text-[var(--text)] uppercase tracking-widest hidden xl:flex items-center gap-3 shrink-0">
                  <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
                     <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">
                        {mainTab === "TEMPLATES" ? "data_object" : "settings"}
                     </span>
                  </div>
                  <span className="truncate">
                     {mainTab === "TEMPLATES" ? (t("ql_templates") || "TEMPLATES") : (t("configs") || "CONFIGURATIONS")}
                  </span>
               </h2>
               
               <div className="flex flex-wrap xl:flex-nowrap items-center gap-3 relative flex-1 xl:ml-auto xl:justify-end w-full xl:w-auto">
                  <div className="relative flex-1 min-w-[200px] w-full xl:max-w-[350px]">
                     <input
                        value={mainSearchQuery}
                        onChange={e => setMainSearchQuery(e.target.value)}
                        placeholder={t("search_files") || "Search files..."}
                        className="w-full h-12 bg-black/40 border border-white/10 rounded-xl pl-12 pr-10 text-xs font-mono text-white placeholder-white/30 focus:outline-none focus:border-[var(--accent)] transition-all"
                     />
                     <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-white/30 text-[18px]">{t("icon_search")}</span>
                     {mainSearchQuery && (
                        <button onClick={() => setMainSearchQuery("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors">
                           <span className="material-symbols-outlined text-sm">{t("icon_close")}</span>
                        </button>
                     )}
                  </div>
                  {mainTab === "TEMPLATES" && (
                     <>
                        <ActionButton 
                           icon={t("icon_help")} 
                           label={t("btn_info") || "TEMPLATE GUIDE"} 
                           onClick={() => layoutState.setIsTemplateGuideOpen(true)} 
                           className="!h-12 !py-0 !px-6 !rounded-xl"
                        />
                        <ActionButton 
                           icon={t("icon_add")} 
                           label={t("btn_new_template") || "NEW TEMPLATE"} 
                           onClick={fileState.handleNewTemplate} 
                           className="!h-12 !py-0 !px-6 !rounded-xl"
                        />
                     </>
                  )}
               </div>
            </div>

            <div className="flex-1 pb-32">
               <WorkbenchFileGrid
                  filteredMainFiles={fileState.filteredMainFiles}
                  mainTab={mainTab}
                  renamingFile={fileState.renamingFile}
                  renameInput={fileState.renameInput}
                  deleteConfirmPath={fileState.deleteConfirmPath}
                  setRenameInput={fileState.setRenameInput}
                  setRenamingFile={fileState.setRenamingFile}
                  setDeleteConfirmPath={fileState.setDeleteConfirmPath}
                  handleRenameSubmit={fileState.handleRenameSubmit}
                  handleDeleteTemplate={fileState.handleDeleteTemplate}
                  openFile={fileState.openFile}
               />
            </div>
         </div>

         {selectedFile && (
            <WorkbenchSidePanel
               fileState={fileState}
               editorState={editorState}
               layoutState={layoutState}
               activeTemplate={activeTemplate}
               customAppliedTemplate={customAppliedTemplate}
               selectedTemplatePath={selectedTemplatePath}
               availableTemplates={fileState.availableTemplates}
               selectedCategory={selectedCategory}
               setSelectedTemplatePath={setSelectedTemplatePath}
               setActiveTemplate={setActiveTemplate}
               setCustomAppliedTemplate={setCustomAppliedTemplate}
               setSelectedCategory={setSelectedCategory}
               searchQuery={searchQuery}
               setSearchQuery={setSearchQuery}
               files={fileState.files}
               setShowTimeline={setShowTimeline}
               setIsPushModalOpen={setIsPushModalOpen}
            />
         )}

         <PushTemplateSidePanel
            isOpen={isPushModalOpen}
            onClose={() => setIsPushModalOpen(false)}
            templateContent={editorState.rawText}
            onChange={editorState.handleRawChange}
            onPushSuccess={async (newName, newJson) => {
               if (selectedFile) {
                  try {
                     const sanitizedName = newName.replace(/[^a-z0-9_\-\.]/gi, '_');
                     const newFileName = sanitizedName.toLowerCase().endsWith('.json') ? sanitizedName : sanitizedName + '.json';

                     if (newFileName !== selectedFile.name) {
                        const dirPath = selectedFile.path.substring(0, selectedFile.path.lastIndexOf(selectedFile.path.includes('\\') ? '\\' : '/'));
                        const sep = selectedFile.path.includes('\\') ? '\\' : '/';
                        const newPath = `${dirPath}${sep}${newFileName}`;

                        await writeTextFile(newPath, newJson);
                        await remove(selectedFile.path);

                        useStore.getState().setCwSelectedFile({ name: newFileName, path: newPath });
                     } else {
                        await invoke('save_file_silently', { path: selectedFile.path, content: newJson });
                     }
                  } catch (e) {
                     console.error("Failed to rename file after push", e);
                  }
               }
               setIsPushModalOpen(false);
            }}
         />

         <WorkbenchTemplateGuide isOpen={layoutState.isTemplateGuideOpen} onClose={() => layoutState.setIsTemplateGuideOpen(false)} />

         <SidePanel
            isOpen={isFlagPanelOpen}
            onClose={() => setIsFlagPanelOpen(false)}
            title={t("auto_report") || "Flag Template"}
            subtitle="Report an issue with this community template"
            icon="flag"
            iconColorClass="text-rose-500"
            footer={
               flagSuccess ? undefined : (
                  <div className="flex w-full gap-3 mt-4">
                     <button
                        onClick={() => setIsFlagPanelOpen(false)}
                        className={standardButtonClass + " flex-1"}
                     >
                        {t("nav_cancel") || "Cancel"}
                     </button>
                     <button
                        onClick={async () => {
                           if (!flagReason.trim()) return;
                           setIsFlagging(true);
                           const { data: { session } } = await supabase.auth.getSession();
                           const userId = session?.user?.id || "system";
                           await supabaseServices.flagTemplate(selectedTemplatePath, flagReason, userId);
                           setIsFlagging(false);
                           setFlagSuccess(true);
                        }}
                        disabled={isFlagging || !flagReason.trim()}
                        className={standardDangerButtonClass + " flex-1"}
                     >
                        {isFlagging ? <span className="material-symbols-outlined animate-spin">refresh</span> : <span className="material-symbols-outlined">{t("icon_flag")}</span>}
                        {isFlagging ? t("create_btn_creating") : t("auto_report")}
                     </button>
                  </div>
               )
            }
         >
            <div className="p-8 flex flex-col gap-6">
               {flagSuccess ? (
                  <div className="flex flex-col items-center justify-center p-12 text-center gap-4">
                     <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center">
                        <span className="material-symbols-outlined !text-3xl">{t("icon_check")}</span>
                     </div>
                     <p className="text-[var(--text)] font-bold">{t("verify_panel_flag_success") || "Template flagged successfully"}</p>
                  </div>
               ) : (
                  <div className="theme-glass-panel p-6 rounded-2xl border border-white/10 flex flex-col gap-4">
                     <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("flag_reason")}</label>
                     <textarea
                        value={flagReason}
                        onChange={(e) => setFlagReason(e.target.value)}
                        className="w-full h-32 bg-black/20 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl p-4 text-[12px] font-bold text-[var(--text)] focus:outline-none focus:border-rose-500/50 resize-none custom-scrollbar"
                        placeholder="E.g. The configuration fields don't match the mod, it contains invalid types..."
                     />
                  </div>
               )}
            </div>
         </SidePanel>

         {showTimeline && selectedFile && (
            <VersionTimeline
               key={selectedFile.path}
               filePath={selectedFile.path}
               hasUnsavedChanges={useStore.getState().cwUnsavedEdits[selectedFile.path] !== undefined}
               activeVersionTimestamp={null}
               onRestore={async (content, timestamp) => {
                  editorState.setRawText(content);
                  try {
                     editorState.setParsedData(JSON.parse(content));
                  } catch (e) {
                     editorState.setParsedData(null);
                  }
                  
                  useStore.getState().setCwUnsavedEdits(prev => {
                     const next = { ...prev };
                     delete next[selectedFile.path];
                     return next;
                  });

                  try {
                     await invoke('save_file_silently', { path: selectedFile.path, content });
                     useStore.getState().pushStatus(t("alert_saved"), "success");
                  } catch (e) {
                     useStore.getState().pushStatus("Failed to save restored version", "error");
                  }
               }}
               onClose={() => setShowTimeline(false)}
            />
         )}
      </div>
   );
}
