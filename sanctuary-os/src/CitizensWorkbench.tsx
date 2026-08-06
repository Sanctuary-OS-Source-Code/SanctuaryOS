import React, { useState, useEffect } from 'react';
import { useLexicon } from './LexiconContext';
import { useStore } from './store';
import { ViewHeader, HubTabButton, SidePanel, standardButtonClass, standardDangerButtonClass, ActionButton, SearchBar, FilterTabs, FilterTabButton } from './shared';
import { WorkbenchFileGrid } from './workbench/WorkbenchFileGrid';
import { WorkbenchSidePanel } from './workbench/WorkbenchSidePanel';
import { PushTemplateSidePanel } from './side-panels/PushTemplateSidePanel';
import { WorkbenchTemplateGuide } from './workbench/WorkbenchTemplateGuide';
import VersionTimeline from "./VersionTimeline";
import { invoke } from '@tauri-apps/api/core';
import { supabase } from './supabase';
import { supabaseServices } from './lib/supabase-services';
import { writeTextFile, remove } from '@tauri-apps/plugin-fs';
import { CommandScreenLayout, CommandScreenBody, CommandScreenMain, CommandScreenSidebar, CommandScreenQuickLink, CommandScreenStats, DashboardStatTile, CommandScreenSectionHeading } from "./hub-components/SharedCommandScreenLayout";

import { useWorkbenchFiles } from './workbench/hooks/useWorkbenchFiles';
import { useWorkbenchEditor } from './workbench/hooks/useWorkbenchEditor';
import { useWorkbenchLayout } from './workbench/hooks/useWorkbenchLayout';

export default function CitizensWorkbench({ onOpenMasonProfile }: { onOpenMasonProfile?: (masonId: string, postId?: string) => void }) {
   const { t } = useLexicon();
   
   const mainTab = useStore(state => state.cwMainTab);
   const setMainTab = useStore(state => state.setCwMainTab);
   const setView = useStore(state => state.setView);
   const unsavedEdits = useStore(state => state.cwUnsavedEdits);
   
   const [mainSearchQuery, setMainSearchQuery] = useState("");
   const [feedFilter, setFeedFilter] = useState<"ALL" | "CONFIGS" | "TEMPLATES">("ALL");
   const [gridFilter, setGridFilter] = useState<"ALL" | "UNSAVED">("ALL");
   
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

   const configsCount = fileState.files.filter((f: any) => !f.name.toLowerCase().endsWith('.json')).length;
   const templatesCount = fileState.files.filter((f: any) => f.name.toLowerCase().endsWith('.json')).length;
   const unsavedConfigsCount = Object.keys(unsavedEdits || {}).filter(p => !p.toLowerCase().endsWith('.json')).length;
   const unsavedTemplatesCount = Object.keys(unsavedEdits || {}).filter(p => p.toLowerCase().endsWith('.json')).length;

   return (
      <div className="flex flex-col w-full relative animate-in fade-in slide-in-from-bottom-4 duration-700">
         <ViewHeader title={t("workbench_title") || "CITIZENS WORKBENCH"} subtitle={t("workbench_subtitle")} icon="tune" />

         <div className="flex flex-col gap-4 animate-in slide-in-from-top-4 duration-500 w-full mb-6 shrink-0 relative z-30">
            <div className="flex items-center overflow-x-auto overflow-y-hidden accent-scrollbar theme-glass-panel rounded-2xl border border-white/5 shadow-inner divide-x divide-white/5 w-full shrink-0">
               <HubTabButton id="COMMAND" icon="dashboard" label={t("overview") || "OVERVIEW"} activeTab={mainTab} setTab={setMainTab as any} />
               <HubTabButton id="CONFIGS" icon="settings" label={t("configs")} activeTab={mainTab} setTab={setMainTab as any} activeColorClass="bg-blue-500/10 text-blue-500 shadow-[inset_0_0_20px_rgba(59,130,246,0.15)]" />
               <HubTabButton id="TEMPLATES" icon="data_object" label={t("ql_templates")} activeTab={mainTab} setTab={setMainTab as any} activeColorClass="bg-emerald-500/10 text-emerald-500 shadow-[inset_0_0_20px_rgba(16,185,129,0.15)]" />
            </div>
         </div>

         <div className="flex flex-col w-full animate-in slide-in-from-top-4 duration-500 flex-1 min-h-[400px]">
            {mainTab === "COMMAND" && (
               <CommandScreenLayout>
                  <CommandScreenStats>
                     <DashboardStatTile icon={<span className="material-symbols-outlined !text-[32px]">settings</span>} number={configsCount} label={t("configs") || "TOTAL CONFIGS"} colorClass="border-blue-500/30 text-blue-500 hover:border-blue-500 bg-blue-500/10 hover:bg-blue-500/20" onClick={() => { setMainTab("CONFIGS" as any); setGridFilter("ALL"); }} className="cursor-pointer hover:scale-105 transition-transform" />
                     <DashboardStatTile icon={<span className="material-symbols-outlined !text-[32px]">data_object</span>} number={templatesCount} label={t("ql_templates") || "TOTAL TEMPLATES"} colorClass="border-emerald-500/30 text-emerald-500 hover:border-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20" onClick={() => { setMainTab("TEMPLATES" as any); setGridFilter("ALL"); }} className="cursor-pointer hover:scale-105 transition-transform" />
                     <DashboardStatTile icon={<span className="material-symbols-outlined !text-[32px]">edit_document</span>} number={unsavedConfigsCount} label={t("unsaved_configs") || "UNSAVED CONFIGS"} colorClass="border-amber-500/30 text-amber-500 hover:border-amber-500 bg-amber-500/10 hover:bg-amber-500/20" onClick={() => { setMainTab("CONFIGS" as any); setGridFilter("UNSAVED"); }} className="cursor-pointer hover:scale-105 transition-transform" />
                     <DashboardStatTile icon={<span className="material-symbols-outlined !text-[32px]">edit_note</span>} number={unsavedTemplatesCount} label={t("unsaved_templates") || "UNSAVED TEMPLATES"} colorClass="border-orange-500/30 text-orange-500 hover:border-orange-500 bg-orange-500/10 hover:bg-orange-500/20" onClick={() => { setMainTab("TEMPLATES" as any); setGridFilter("UNSAVED"); }} className="cursor-pointer hover:scale-105 transition-transform" />
                  </CommandScreenStats>

                  <CommandScreenBody>
                     <CommandScreenMain>
                        <div className="flex flex-col gap-6">
                              <CommandScreenSectionHeading 
                                 title={t("recent_activity")} 
                                 icon="history"
                                 rightContent={
                                    <FilterTabs>
                                       <FilterTabButton id="ALL" label="ALL" activeTab={feedFilter} setTab={setFeedFilter} />
                                       <FilterTabButton id="CONFIGS" label={t("configs")} activeTab={feedFilter} setTab={setFeedFilter} />
                                       <FilterTabButton id="TEMPLATES" label={t("ql_templates")} activeTab={feedFilter} setTab={setFeedFilter} />
                                    </FilterTabs>
                                 }
                              />
                           
                           {(() => {
                              const recentActivityFiles = fileState.files.filter((f: any) => {
                                 const isTmpl = f.name.toLowerCase().endsWith('.json');
                                 if (feedFilter === "CONFIGS" && isTmpl) return false;
                                 if (feedFilter === "TEMPLATES" && !isTmpl) return false;
                                 return unsavedEdits && unsavedEdits[f.path] !== undefined;
                              });

                              if (recentActivityFiles.length === 0) {
                                 return (
                                    <div className="theme-glass-panel rounded-2xl border border-white/5 p-8 flex flex-col items-center justify-center text-center gap-4 opacity-50 min-h-[300px]">
                                       <span className="material-symbols-outlined !text-5xl opacity-50">history</span>
                                       <div>
                                          <p className="font-bold text-sm tracking-widest uppercase">{t("no_recent_activity")}</p>
                                          <p className="text-[10px] opacity-70">Files with unsaved changes will appear here.</p>
                                       </div>
                                    </div>
                                 );
                              }

                              return (
                                 <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
                                    {recentActivityFiles.map((file: any) => {
                                       const displayPath = file.path.replace(/^.*[\\\/](Data[\\\/]Templates|Mods)[\\\/]/i, '');
                                       return (
                                          <div key={file.path} onClick={() => fileState.openFile(file)} className="theme-glass-panel rounded-2xl border border-white/5 p-5 flex flex-col justify-between gap-4 hover:bg-white/5 cursor-pointer transition-colors hover:border-[var(--accent)]/30 group min-h-[120px]">
                                             <div className="flex items-start justify-between gap-3">
                                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border border-white/10 ${file.name.toLowerCase().endsWith('.json') ? 'bg-green-500/10 text-green-500' : 'bg-blue-500/10 text-blue-500'}`}>
                                                   <span className="material-symbols-outlined">{file.name.toLowerCase().endsWith('.json') ? "data_object" : "settings"}</span>
                                                </div>
                                                <span className="px-2 py-1 rounded bg-amber-500/10 text-amber-500 text-[9px] font-black uppercase tracking-widest border border-amber-500/20">{t("unsaved_changes") || "DRAFT"}</span>
                                             </div>
                                             <div className="flex flex-col min-w-0">
                                                <h4 className="font-bold text-[var(--text)] text-sm group-hover:text-[var(--accent)] transition-colors break-words line-clamp-2">{file.name}</h4>
                                                <p className="text-[10px] text-[var(--subtext)] truncate" title={file.path}>{displayPath}</p>
                                             </div>
                                          </div>
                                       );
                                    })}
                                 </div>
                              );
                           })()}
                        </div>
                     </CommandScreenMain>

                     <CommandScreenSidebar title={t("quick_actions")} icon="bolt">
                        <CommandScreenQuickLink
                           icon="settings"
                           title={t("configs")}
                           subtitle="Manage Configuration Files"
                           textColorClass="text-blue-400"
                           hoverTextColorClass="group-hover:text-blue-300"
                           dotColorClass="bg-blue-400"
                           onClick={() => setMainTab("CONFIGS" as any)}
                        />
                        <CommandScreenQuickLink
                           icon="data_object"
                           title={t("ql_templates")}
                           subtitle="Edit Local Templates"
                           textColorClass="text-emerald-400"
                           hoverTextColorClass="group-hover:text-emerald-300"
                           dotColorClass="bg-emerald-400"
                           onClick={() => setMainTab("TEMPLATES" as any)}
                        />
                        <CommandScreenQuickLink
                           icon="explore"
                           title={t("nexus_templates")}
                           subtitle="Discover Community Templates"
                           textColorClass="text-fuchsia-400"
                           hoverTextColorClass="group-hover:text-fuchsia-300"
                           dotColorClass="bg-fuchsia-400"
                           onClick={() => setView("nexus")}
                        />
                     </CommandScreenSidebar>
                  </CommandScreenBody>
               </CommandScreenLayout>
            )}

            {mainTab !== "COMMAND" && (
               <div className="flex flex-col gap-0 min-h-max w-full">
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
                           <SearchBar
                              value={mainSearchQuery}
                              onChange={setMainSearchQuery}
                              placeholder={t("search_files") || "Search files..."}
                              className="rounded-xl h-12"
                           />
                        </div>
                        <FilterTabs className="shrink-0 xl:ml-2">
                           <FilterTabButton id="ALL" label="ALL" activeTab={gridFilter} setTab={setGridFilter} />
                           <FilterTabButton id="UNSAVED" label={t("unsaved_changes") || "DRAFTS"} activeTab={gridFilter} setTab={setGridFilter} />
                        </FilterTabs>
                     </div>
                  </div>

                  <div className="flex-1 pb-10">
                     <WorkbenchFileGrid
                        filteredMainFiles={gridFilter === "ALL" ? fileState.filteredMainFiles : fileState.filteredMainFiles.filter((f: any) => unsavedEdits && unsavedEdits[f.path] !== undefined)}
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
            )}
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
