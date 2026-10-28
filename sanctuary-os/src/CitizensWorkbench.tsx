import React, { useState, useEffect } from 'react';
import { useLexicon } from './LexiconContext';
import { useStore } from './store';
import { ViewHeader, HoverTabDrawer, VerticalTabButton, SidePanel, SidePanelHeroCard, UniversalGroup, ActionPill, PanelHeaderGroup, PanelHeaderButton, EmptyState } from './shared';
import { WorkbenchFileGrid } from './workbench/WorkbenchFileGrid';
import { WorkbenchSidePanel } from './workbench/WorkbenchSidePanel';
import { PushTemplateSidePanel } from './side-panels/PushTemplateSidePanel';
import { WorkbenchTemplateGuide } from './workbench/WorkbenchTemplateGuide';
import VersionTimeline from "./VersionTimeline";
import { invoke } from '@tauri-apps/api/core';
import { supabase } from './supabase';
import { supabaseServices } from './lib/supabase-services';
import { writeTextFile, remove } from '@tauri-apps/plugin-fs';
import { CommandScreenLayout, CommandScreenBody, CommandScreenMain, CommandScreenSidebar, CommandScreenQuickLink, DashboardStatTile, CommandScreenSectionHeading, StatTileCarousel } from "./hub-components/SharedCommandScreenLayout";
import { UniversalCard } from './components/universal/UniversalCard';

import { useWorkbenchFiles } from './workbench/hooks/useWorkbenchFiles';
import { useWorkbenchEditor } from './workbench/hooks/useWorkbenchEditor';
import { useWorkbenchLayout } from './workbench/hooks/useWorkbenchLayout';

const VAULT_CHIP_CLASS =
   "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

export default function CitizensWorkbench({ onOpenMasonProfile }: { onOpenMasonProfile?: (masonId: string, postId?: string) => void }) {
   const { t } = useLexicon();

   const mainTab = useStore(state => state.cwMainTab);
   const setMainTab = useStore(state => state.setCwMainTab);
   const setView = useStore(state => state.setView);
   const unsavedEdits = useStore(state => state.cwUnsavedEdits);

   const [mainSearchQuery, setMainSearchQuery] = useState("");
   const [feedFilter] = useState<"ALL" | "CONFIGS" | "TEMPLATES">("ALL");
   const [gridFilter, setGridFilter] = useState<"ALL" | "UNSAVED">("ALL");

   const selectedFile = useStore(state => state.cwSelectedFile);

   const [isPushModalOpen, setIsPushModalOpen] = useState(false);
   const [showTimeline, setShowTimeline] = useState(false);
   const [timelineInitialSelection, setTimelineInitialSelection] = useState<'unsaved' | 'latest'>('latest');

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
      if (!selectedFile) {
         setLastInitializedFile(null);
         setActiveTemplate(null);
         setCustomAppliedTemplate(null);
         setSelectedCategory("ALL");
         setSearchQuery("");
         return;
      }

      if (lastInitializedFile !== selectedFile.path) {
         setSelectedCategory("ALL");
         setSearchQuery("");
      }

      if (fileState.availableTemplates.length > 0) {
         const existingMatch = fileState.availableTemplates.find((tmpl: any) => tmpl.id === selectedTemplatePath);
         const hasHydratedData = Boolean(activeTemplate || customAppliedTemplate);
         if (lastInitializedFile !== selectedFile.path || !existingMatch || !hasHydratedData) {
            setLastInitializedFile(selectedFile.path);

            const commTmpl = fileState.availableTemplates.find((tmpl: any) => tmpl.isCommunity);
            const builtIn = fileState.availableTemplates.find((tmpl: any) => tmpl.id === "built_in");

            const defaultId = (lastInitializedFile === selectedFile.path && existingMatch)
               ? existingMatch.id
               : (commTmpl ? commTmpl.id : (builtIn ? "built_in" : fileState.availableTemplates[0].id));
            setSelectedTemplatePath(defaultId);

            const tmpl = fileState.availableTemplates.find((tItem: any) => tItem.id === defaultId);
            const resolvedData = tmpl?.data ? (Array.isArray(tmpl.data) ? tmpl.data[0] : tmpl.data) : null;
            if (tmpl && (tmpl.id === "built_in" || tmpl.isCommunity)) {
               setActiveTemplate(resolvedData);
               setCustomAppliedTemplate(null);
            } else if (tmpl) {
               setCustomAppliedTemplate(resolvedData);
               setActiveTemplate(null);
            }
         }
      } else {
         setActiveTemplate(null);
         setCustomAppliedTemplate(null);
      }
   }, [selectedFile, fileState.availableTemplates, lastInitializedFile, selectedTemplatePath, activeTemplate, customAppliedTemplate]);

   useEffect(() => {
      return () => {
         useStore.getState().setCwSelectedFile(null);
      };
   }, []);

   const configsCount = fileState.files.filter((f: any) => !f.name.toLowerCase().endsWith('.json')).length;
   const templatesCount = fileState.files.filter((f: any) => f.name.toLowerCase().endsWith('.json')).length;
   const unsavedConfigsCount = Object.keys(unsavedEdits || {}).filter(p => !p.toLowerCase().endsWith('.json')).length;
   const unsavedTemplatesCount = Object.keys(unsavedEdits || {}).filter(p => p.toLowerCase().endsWith('.json')).length;

   const headerPillActions = React.useMemo(() => {
      const list: any[] = [];
      if (mainTab === "TEMPLATES") {
         list.push({
            id: "new_template",
            icon: t("icon_add", "add"),
            label: t("btn_new_template", "New Template"),
            onClick: () => fileState.handleNewTemplate(true)
         });
      }
      if (
         (mainTab === "CONFIGS" && unsavedConfigsCount > 0) ||
         (mainTab === "TEMPLATES" && unsavedTemplatesCount > 0) ||
         gridFilter === "UNSAVED"
      ) {
         list.push({
            id: "filter_unsaved",
            icon: t("icon_edit_document", "edit_document"),
            label: gridFilter === "UNSAVED" ? t("workbench_filter_all", "All Files") : t("workbench_filter_unsaved", "Unsaved Only"),
            activeClassName: gridFilter === "UNSAVED" ? "text-[var(--warning)] bg-[color-mix(in_srgb,var(--warning)_12%,transparent)]" : "",
            onClick: () => setGridFilter(prev => prev === "ALL" ? "UNSAVED" : "ALL")
         });
      }
      return list;
   }, [mainTab, unsavedConfigsCount, unsavedTemplatesCount, gridFilter, fileState, t]);

   return (
      <div className="flex flex-col w-full relative animate-in fade-in slide-in-from-bottom-4 duration-700">
         <ViewHeader
            title={t("workbench_title", "{Citizen} Workbench")}
            subtitle={t("workbench_subtitle", "Community-powered configuration editor")}
            icon={t("icon_tune", "tune")}
            breadcrumb={mainTab !== "COMMAND" ? (t(`tab_${mainTab.toLowerCase()}`, mainTab) || mainTab) : undefined}
            onTitleClick={() => setMainTab("COMMAND" as any)}
         >
            {mainTab !== "COMMAND" && (
               <div className="w-full max-w-[460px] animate-in fade-in slide-in-from-right-4 duration-500 flex justify-end">
                  <ActionPill
                     searchQuery={mainSearchQuery}
                     setSearchQuery={setMainSearchQuery}
                     searchPlaceholder={t("search_files", "Search files...") as string}
                     actions={headerPillActions}
                  />
               </div>
            )}
         </ViewHeader>

         <div className="md:hidden">
            <HoverTabDrawer title={t("workbench_title", "{Citizen} Workbench")} activeTab={mainTab} setTab={setMainTab as any}>
               <VerticalTabButton id="COMMAND" icon={t("icon_dashboard", "dashboard")} label={t("overview", "Overview")} activeTab={mainTab} setTab={setMainTab as any} />
               <VerticalTabButton id="CONFIGS" icon={t("icon_settings", "settings")} label={t("configs", "Configs")} activeTab={mainTab} setTab={setMainTab as any} />
               <VerticalTabButton id="TEMPLATES" icon={t("icon_data_object", "data_object")} label={t("ql_templates", "Templates")} activeTab={mainTab} setTab={setMainTab as any} />
            </HoverTabDrawer>
         </div>

         <div className="flex flex-col w-full gap-3 mb-8 md:mb-10">
            <StatTileCarousel>
               <DashboardStatTile variant="tab" icon={t("icon_dashboard", "dashboard")} label={t("overview", "Overview")} number="" onClick={() => setMainTab("COMMAND" as any)} isActive={mainTab === "COMMAND"} />
               <DashboardStatTile variant="tab" icon={t("icon_settings", "settings")} label={t("configs", "Configs")} number={configsCount} onClick={() => setMainTab("CONFIGS" as any)} isActive={mainTab === "CONFIGS"} />
               <DashboardStatTile variant="tab" icon={t("icon_data_object", "data_object")} label={t("ql_templates", "Templates")} number={templatesCount} onClick={() => setMainTab("TEMPLATES" as any)} isActive={mainTab === "TEMPLATES"} />
            </StatTileCarousel>
         </div>

         <div className="flex flex-col w-full animate-in slide-in-from-top-4 duration-500 flex-1 min-h-[400px]">
            {mainTab === "COMMAND" && (
               <CommandScreenLayout>
                  <CommandScreenBody>
                     <CommandScreenMain>
                        <div className="flex flex-col gap-4">
                           <CommandScreenSectionHeading
                              title={t("recent_activity", "Recent Activity")}
                              icon={t("icon_history", "history")}
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
                                    <EmptyState
                                       icon={t("icon_history", "history")}
                                       title={t("no_recent_activity", "No Recent Activity")}
                                       subtitle={t("unsaved_desc", "Files with unsaved edits will appear here.")}
                                       minHeightClass="min-h-[260px]"
                                    />
                                 );
                              }

                              return (
                                 <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
                                    {recentActivityFiles.map((file: any) => {
                                       const isTmpl = file.name.toLowerCase().endsWith('.json');
                                       const dotIndex = file.name.lastIndexOf('.');
                                       const baseTitle = dotIndex > 0 ? file.name.substring(0, dotIndex) : file.name;
                                       const extLabel = dotIndex > 0 ? file.name.substring(dotIndex) : (isTmpl ? t("schema_json", ".json") : t("schema_system", ".cfg"));
                                       return (
                                          <UniversalCard
                                             key={file.path}
                                             layout="vertical"
                                             onClick={() => fileState.openFile(file)}
                                             icon={isTmpl ? t("icon_data_object", "data_object") : t("icon_settings", "settings")}
                                             title={baseTitle}
                                             subtitle={isTmpl ? t("ql_templates", "Templates") : t("configs", "Configs")}
                                             imageOverlay={
                                                <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
                                                   <div className={VAULT_CHIP_CLASS}>
                                                      <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                                                         {t("icon_edit_note", "edit_note")}
                                                      </span>
                                                      <span>{t("unsaved", "Unsaved")}</span>
                                                   </div>
                                                </div>
                                             }
                                             badges={
                                                <div className={VAULT_CHIP_CLASS}>
                                                   <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                                                      {isTmpl ? t("icon_data_object", "data_object") : t("icon_description", "description")}
                                                   </span>
                                                   <span className="text-[var(--subtext)]">{extLabel}</span>
                                                </div>
                                             }
                                             footer={
                                                <div className="flex gap-2 items-center justify-between group">
                                                   <span className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest flex items-center gap-1.5 truncate pr-2">
                                                      {extLabel}
                                                   </span>
                                                   <button
                                                      type="button"
                                                      className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0"
                                                   >
                                                      {t("edit", "Edit")} <span className="text-base leading-none">&rarr;</span>
                                                   </button>
                                                </div>
                                             }
                                          />
                                       );
                                    })}
                                 </div>
                              );
                           })()}
                        </div>
                     </CommandScreenMain>

                     <CommandScreenSidebar title={t("quick_actions", "Quick Actions")} icon={t("icon_bolt", "bolt")}>
                        <CommandScreenQuickLink
                           icon={t("icon_settings", "settings")}
                           title={t("configs", "Configs")}
                           subtitle={t("workbench_subtitle", "Manage Configuration Files")}
                           textColorClass="text-blue-400"
                           hoverTextColorClass="group-hover:text-blue-300"
                           dotColorClass="bg-blue-400"
                           onClick={() => setMainTab("CONFIGS" as any)}
                        />
                        <CommandScreenQuickLink
                           icon={t("icon_data_object", "data_object")}
                           title={t("ql_templates", "Templates")}
                           subtitle={t("ql_templates_desc", "Manage Metadata Formats")}
                           textColorClass="text-emerald-400"
                           hoverTextColorClass="group-hover:text-emerald-300"
                           dotColorClass="bg-emerald-400"
                           onClick={() => setMainTab("TEMPLATES" as any)}
                        />
                        <CommandScreenQuickLink
                           icon={t("icon_note_add", "note_add")}
                           title={t("btn_new_template", "New Template")}
                           subtitle={t("author_mode", "Author Mode")}
                           textColorClass="text-cyan-400"
                           hoverTextColorClass="group-hover:text-cyan-300"
                           dotColorClass="bg-cyan-400"
                           onClick={() => {
                              setMainTab("TEMPLATES" as any);
                              fileState.handleNewTemplate(true);
                           }}
                        />
                        {unsavedConfigsCount > 0 && (
                           <CommandScreenQuickLink
                              icon={t("icon_edit_document", "edit_document")}
                              title={t("unsaved_configs", "Unsaved Configs")}
                              subtitle={`${unsavedConfigsCount} ${t("unsaved_changes", "unsaved")}`}
                              textColorClass="text-amber-400"
                              hoverTextColorClass="group-hover:text-amber-300"
                              dotColorClass="bg-amber-400"
                              onClick={() => { setMainTab("CONFIGS" as any); setGridFilter("UNSAVED"); }}
                           />
                        )}
                        {unsavedTemplatesCount > 0 && (
                           <CommandScreenQuickLink
                              icon={t("icon_edit_note", "edit_note")}
                              title={t("unsaved_templates", "Unsaved Templates")}
                              subtitle={`${unsavedTemplatesCount} ${t("unsaved_changes", "unsaved")}`}
                              textColorClass="text-orange-400"
                              hoverTextColorClass="group-hover:text-orange-300"
                              dotColorClass="bg-orange-400"
                              onClick={() => { setMainTab("TEMPLATES" as any); setGridFilter("UNSAVED"); }}
                           />
                        )}
                        <CommandScreenQuickLink
                           icon={t("icon_explore", "explore")}
                           title={t("nexus_templates", "Nexus Templates")}
                           subtitle={t("search_nexus", "Search The {Nexus}")}
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
                        onNewTemplate={() => fileState.handleNewTemplate(true)}
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
               setTimelineInitialSelection={setTimelineInitialSelection}
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
            title={t("auto_report", "Report Template")}
            subtitle={t("flag_reason", "Report an issue with this community template")}
            icon={t("icon_flag", "flag")}
            iconColorClass="text-[var(--danger)]"
            widthClass="w-[90vw] md:w-[640px]"
            headerActions={
               !flagSuccess ? (
                  <PanelHeaderGroup>
                     <PanelHeaderButton
                        icon={isFlagging ? t("icon_refresh", "refresh") : t("icon_flag", "flag")}
                        variant="danger"
                        tooltip={isFlagging ? t("create_btn_creating", "Submitting...") : t("auto_report", "Report")}
                        disabled={isFlagging || !flagReason.trim()}
                        onClick={async () => {
                           if (!flagReason.trim()) return;
                           setIsFlagging(true);
                           const { data: { session } } = await supabase.auth.getSession();
                           const userId = session?.user?.id || "system";
                           await supabaseServices.flagTemplate(selectedTemplatePath, flagReason, userId);
                           setIsFlagging(false);
                           setFlagSuccess(true);
                        }}
                     />
                  </PanelHeaderGroup>
               ) : undefined
            }
         >
            <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
               <SidePanelHeroCard
                  icon={flagSuccess ? t("icon_check_circle", "check_circle") : t("icon_flag", "flag")}
                  overline={t("auto_report", "Community Template Report")}
                  title={selectedTemplatePath?.split(/[\\/]/).pop() || t("auto_report", "Report Template")}
                  description={t("flag_reason", "Report an issue or policy violation with this community template.")}
                  badge={flagSuccess ? t("status_submitted", "Submitted") : t("auto_report", "Report")}
                  variant={flagSuccess ? "success" : "danger"}
               />

               {flagSuccess ? (
                  <UniversalGroup
                     title={t("verify_panel_flag_success", "Report Submitted")}
                     icon={t("icon_check_circle", "check_circle")}
                  >
                     <p className="text-xs font-bold text-[var(--subtext)] leading-relaxed m-0">
                        {t("verify_panel_flag_success", "Report submitted successfully.")}
                     </p>
                  </UniversalGroup>
               ) : (
                  <UniversalGroup
                     title={t("flag_reason", "Reason")}
                     icon={t("icon_edit_note", "edit_note")}
                  >
                     <textarea
                        value={flagReason}
                        onChange={(e) => setFlagReason(e.target.value)}
                        className="w-full h-32 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-4 text-xs font-bold text-[var(--text)] focus:outline-none focus:border-[var(--danger)] resize-y custom-scrollbar"
                        placeholder={t("flag_reason", "Describe the issue...")}
                     />
                  </UniversalGroup>
               )}
            </div>
         </SidePanel>

         {showTimeline && selectedFile && (
            <VersionTimeline
               key={selectedFile.path}
               filePath={selectedFile.path}
               hasUnsavedChanges={useStore.getState().cwUnsavedEdits[selectedFile.path] !== undefined}
               activeVersionTimestamp={null}
               currentContent={editorState.rawText}
               savedContent={editorState.savedRawText}
               visualTemplate={
                  !selectedFile.name.toLowerCase().endsWith('.json')
                     ? ((selectedTemplatePath && selectedTemplatePath !== "built_in" && customAppliedTemplate) ? customAppliedTemplate : activeTemplate)
                     : undefined
               }
               onApplySettingValue={editorState.handleVisualChange}
               onUndoAllUnsaved={editorState.handleUndoAllUnsaved}
               initialSelection={timelineInitialSelection}
               onRestore={async (content) => {
                  editorState.syncSavedBaseline(content, selectedFile.name);
                  editorState.handleRawChange(content, true);

                  useStore.getState().setCwUnsavedEdits(prev => {
                     const next = { ...prev };
                     delete next[selectedFile.path];
                     return next;
                  });

                  try {
                     await invoke('save_file_silently', { path: selectedFile.path, content });
                     useStore.getState().pushStatus(t("alert_saved", "Saved"), "success");
                  } catch (e) {
                     useStore.getState().pushStatus(t("alert_error", "Failed to save restored version"), "error");
                  }
               }}
               onClose={() => setShowTimeline(false)}
            />
         )}
      </div>
   );
}
