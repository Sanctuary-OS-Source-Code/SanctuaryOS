import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { useLexicon } from '../LexiconContext';
import { useStore } from '../store';
import { SidePanel, standardButtonClass, standardDangerButtonClass, HubTabButton, HoverTooltip, CustomDropdown } from '../shared';
import { WorkbenchRawEditor } from './WorkbenchRawEditor';
import { WorkbenchVisualEditor } from './WorkbenchVisualEditor';
import { WorkbenchEmptyVisualState } from './WorkbenchEmptyVisualState';
import { WorkbenchTemplateTools } from './WorkbenchTemplateTools';

export function WorkbenchSidePanel({
   fileState,
   editorState,
   layoutState,
   activeTemplate,
   customAppliedTemplate,
   selectedTemplatePath,
   availableTemplates,
   selectedCategory,
   setSelectedTemplatePath,
   setActiveTemplate,
   setCustomAppliedTemplate,
   setSelectedCategory,
   searchQuery,
   setSearchQuery,
   files,
   setShowTimeline,
   setIsPushModalOpen
}: any) {
   const { t } = useLexicon();
   
   const previewEditorOptions = React.useMemo(() => ({
      automaticLayout: true,
      readOnly: false,
      minimap: { enabled: false },
      fontSize: 12,
      wordWrap: "on" as const,
      renderLineHighlight: "none" as const,
      selectionHighlight: false,
      occurrencesHighlight: "off" as const,
      matchBrackets: "never" as const,
      contextmenu: false
   }), []);
   const selectedFile = useStore(state => state.cwSelectedFile);
   const setSelectedFile = useStore(state => state.setCwSelectedFile);
   const activeTab = useStore(state => state.cwActiveTab);
   const setActiveTab = useStore(state => state.setCwActiveTab);
   const session = useStore(state => state.session);
   const hasUnsavedChanges = selectedFile && useStore(state => state.cwUnsavedEdits)[selectedFile.path] !== undefined;

   const resolveText = (k?: string, fallback?: string) => {
      if (!k) return fallback || "";
      const tr = t(k);
      if (tr === `[${k}]`) return k;
      return tr;
   };

   const isTemplateMode = selectedFile?.name.toLowerCase().endsWith('.json');
   const currentVisualTemplate = (selectedTemplatePath && selectedTemplatePath !== "built_in" && customAppliedTemplate)
      ? customAppliedTemplate
      : activeTemplate;

   const [previewMode, setPreviewMode] = useState<'preview' | 'file' | 'off'>('preview');

   return (
      <SidePanel
         isOpen={!!selectedFile}
         onClose={() => setSelectedFile(null)}
         title={isTemplateMode ? (t("author_mode") || "AUTHOR MODE") : (t("editor_mode") || "EDITOR MODE")}
         subtitle={selectedFile ? selectedFile.name : (t("workbench_subtitle") || "CITIZENS WORKBENCH")}
         icon={isTemplateMode ? (t("icon_data_object")) : (t("icon_tune"))}
         iconColorClass="theme-text-accent"
         isResizable={!layoutState.isFullscreen}
         defaultWidth={layoutState.isFullscreen ? window.innerWidth : ((isTemplateMode && previewMode !== 'off') || activeTab === 'dual' ? 1400 : 900)}
         panelClass={layoutState.isFullscreen ? "!w-full !max-w-[100vw] !border-r-0 !rounded-none" : ""}
         headerActions={
            <div className="flex items-center overflow-hidden theme-glass-panel rounded-2xl divide-x divide-white/5 border border-white/10 shadow-inner mr-2 backdrop-blur-md">
               <div className="relative group flex">
                  <button
                     onClick={() => layoutState.setIsFullscreen(!layoutState.isFullscreen)}
                     className="w-12 h-12 flex items-center justify-center text-[color-mix(in_srgb,var(--text)_50%,transparent)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all shrink-0"
                  >
                     <span className="material-symbols-outlined !text-[18px]">{layoutState.isFullscreen ? 'fullscreen_exit' : 'fullscreen'}</span>
                  </button>
                  <HoverTooltip title={layoutState.isFullscreen ? "Exit Fullscreen" : "Fullscreen"} variant="info" className="z-[100] top-[120%]" />
               </div>

               {isTemplateMode && (
                  <div className="flex items-center">
                     <button
                        onClick={() => layoutState.setIsTemplateGuideOpen(true)}
                        className="h-12 px-6 transition-all flex items-center justify-center gap-2 shrink-0 text-[var(--text)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-transparent font-black"
                     >
                        <span className="material-symbols-outlined text-xl normal-case">{t("icon_help")}</span>
                        <span className="text-[10px] font-black uppercase tracking-widest">{t("btn_info")}</span>
                     </button>
                  </div>
               )}
               <button
                  onClick={() => setShowTimeline(true)}
                  disabled={!selectedFile}
                  className="h-12 px-6 rounded-none transition-all flex items-center justify-center gap-2 shrink-0 text-[var(--text)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)] border border-transparent font-black disabled:opacity-50 disabled:pointer-events-none"
               >
                  <span className="material-symbols-outlined text-xl normal-case">{t("icon_history")}</span>
                  <span className="text-[10px] font-black uppercase tracking-widest">{t("btn_timeline")}</span>
               </button>
            </div>
         }
         footer={
            <div className="flex items-center justify-center w-full gap-4">
               {isTemplateMode && (
                  <div className="relative group/publishbtn">
                     {(!session || localStorage.getItem("sanctuary_blacklisted") === "true") ? (
                        <HoverTooltip
                           title={localStorage.getItem("sanctuary_blacklisted") === "true" ? t("alert_comm_banned") : t("alert_guest_mode")}
                           subtitle={localStorage.getItem("sanctuary_blacklisted") === "true" ? t("alert_comm_banned_desc") : t("alert_guest_mode_desc")}
                           className="group-hover/publishbtn:flex z-[1000] left-1/2 -translate-x-1/2 bottom-[120%]"
                        />
                     ) : editorState.problemsList.length > 0 ? (
                        <HoverTooltip
                           title={t("err_publish_blocks")}
                           subtitle={t("publish_disabled_errors_desc")}
                           variant="danger"
                           className="group-hover/publishbtn:flex z-[1000] left-1/2 -translate-x-1/2 bottom-[120%]"
                        />
                     ) : null}
                     <button
                        onClick={() => setIsPushModalOpen(true)}
                        disabled={editorState.problemsList.length > 0 || !session || localStorage.getItem("sanctuary_blacklisted") === "true"}
                        className={`${standardButtonClass} disabled:opacity-30 disabled:saturate-0`}
                     >
                        <span className="material-symbols-outlined !text-[18px]">{t("icon_cloud_upload")}</span>
                        {t("btn_publish")}
                     </button>
                  </div>
               )}
               <div className="relative group">
                  {editorState.problemsList.length > 0 && hasUnsavedChanges ? (
                     layoutState.confirmSaveWithErrors ? (
                        <div className="flex items-center gap-2">
                           <button
                              onClick={() => layoutState.setConfirmSaveWithErrors(false)}
                              className="px-6 py-4 rounded-[var(--radius)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-xs font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] transition-all hover:scale-105 active:scale-95 group"
                           >
                              <span className="material-symbols-outlined !text-[20px] opacity-60 group-hover:opacity-100 transition-opacity">close</span>
                              {t("nav_cancel")}
                           </button>
                           <button
                              onClick={() => {
                                 layoutState.setConfirmSaveWithErrors(false);
                                 fileState.saveConfig(editorState.rawText);
                              }}
                              disabled={fileState.isSaving}
                              className={`${standardDangerButtonClass} shadow-[0_0_20px_color-mix(in_srgb,var(--danger)_30%,transparent)]`}
                           >
                              <span className="material-symbols-outlined !text-[18px]">check</span>
                              {t("btn_confirm_save_errors") || "FORCE SAVE"}
                           </button>
                        </div>
                     ) : (
                        <div className="relative group">
                           <HoverTooltip title={t("save_with_errors_warning") || "Saving not recommended until errors resolved"} variant="danger" className="z-[100] right-0 translate-x-0 left-auto bottom-[120%]" />
                           <button
                              onClick={() => layoutState.setConfirmSaveWithErrors(true)}
                              disabled={fileState.isSaving}
                              className={standardDangerButtonClass}
                           >
                              <span className={`material-symbols-outlined !text-[18px] ${fileState.isSaving ? 'animate-spin' : ''}`}>warning</span>
                              {fileState.isSaving ? (t("btn_saving")) : (t("btn_save_with_errors") || "SAVE WITH ERRORS")}
                           </button>
                        </div>
                     )
                  ) : (
                     <div className="relative group">
                        {hasUnsavedChanges && (
                           <HoverTooltip title={t("unsaved_changes")} variant="warning" className="z-[100] right-0 translate-x-0 left-auto bottom-[120%]" />
                        )}
                        <button
                           onClick={() => fileState.saveConfig(editorState.rawText)}
                           disabled={!hasUnsavedChanges || fileState.isSaving}
                           className={
                              hasUnsavedChanges
                                 ? standardButtonClass.replace('bg-[color-mix(in_srgb,var(--text)_5%,transparent)]', 'bg-[color-mix(in_srgb,var(--warning)_15%,transparent)]').replace('border-[color-mix(in_srgb,var(--text)_10%,transparent)]', 'border-[color-mix(in_srgb,var(--warning)_50%,transparent)] text-[var(--warning)] shadow-[0_0_20px_color-mix(in_srgb,var(--warning)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--warning)_25%,transparent)] hover:shadow-[0_5px_20px_rgba(245,158,11,0.4)]')
                                 : standardButtonClass
                           }
                        >
                           <span className={`material-symbols-outlined !text-[18px] ${fileState.isSaving ? 'animate-spin' : ''}`}>{t("icon_save")}</span>
                           {fileState.isSaving ? (t("btn_saving")) : (t("save"))}
                        </button>
                     </div>
                  )}
               </div>
            </div>
         }
      >
         <div className="flex-1 min-h-0 flex flex-col h-full w-full relative">

            <div className="flex-1 relative min-h-0 mx-2 mb-2 flex flex-col gap-4">
               {!isTemplateMode && (
                  <div className="flex justify-start items-center px-2 mt-2 shrink-0 z-[100]">
                     <div className="flex-1 flex items-center overflow-x-auto overflow-y-hidden custom-scrollbar theme-glass-panel rounded-2xl border border-white/5 shadow-inner divide-x divide-white/5">
                        <HubTabButton id="visual" activeTab={activeTab} setTab={setActiveTab} label={t("tab_visual") || "Visual"} icon={t("icon_tune") || "tune"} />
                        <HubTabButton id="raw" activeTab={activeTab} setTab={setActiveTab} label={t("tab_raw") || "Raw"} icon={t("icon_code") || "code"} />
                        <HubTabButton id="dual" activeTab={activeTab} setTab={setActiveTab} label={t("tab_dual_vision") || "Dual Vision"} icon="splitscreen" />
                     </div>
                     {activeTab === 'dual' && (
                        <button onClick={() => layoutState.setIsScrollLocked(!layoutState.isScrollLocked)} className={`ml-4 shrink-0 h-10 px-4 rounded-xl flex items-center justify-center gap-2 font-black text-[10px] uppercase tracking-widest transition-all ${layoutState.isScrollLocked ? 'theme-glass-panel !bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] !border-[color-mix(in_srgb,var(--accent)_50%,transparent)] !text-[var(--accent)] !shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_30%,transparent)]' : 'theme-glass-panel border border-white/5 text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5'}`}>
                           <span className="material-symbols-outlined !text-[18px]">{layoutState.isScrollLocked ? 'lock' : 'lock_open'}</span>
                           {t("sync_scroll") || "Sync Scroll"}
                        </button>
                     )}
                  </div>
               )}

               {!isTemplateMode && (
                  <div className={`flex-1 flex gap-4 min-w-0 min-h-0 ${activeTab === 'dual' ? 'flex-row' : 'flex-col'}`}>
                     <div className={`flex flex-col gap-6 flex-1 relative min-w-0 min-h-0 ${activeTab !== 'visual' && activeTab !== 'dual' ? 'hidden' : ''}`}>
                           <div className="flex flex-col gap-2 shrink-0 mb-4">
                              <div className="flex flex-row items-center gap-2 w-full">
                                 <div className="flex-[2] min-w-[120px] relative">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] flex items-center pointer-events-none">
                                       <span className="material-symbols-outlined !text-[18px]">{t("icon_search")}</span>
                                    </div>
                                    <input
                                       type="text"
                                       placeholder={t("workbench_search_placeholder")}
                                       value={searchQuery}
                                       onChange={(e) => setSearchQuery(e.target.value)}
                                       className="w-full theme-glass-inner border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-xl pl-12 pr-5 py-2.5 h-10 text-[var(--text)] text-[11px] font-black tracking-wider focus:outline-none focus:theme-border-accent transition-all shadow-inner"
                                    />
                                 </div>

                                 {!isTemplateMode && availableTemplates.length > 0 && (
                                    <div className="w-max shrink-0 relative z-[100]">
                                       <CustomDropdown
                                          value={selectedTemplatePath}
                                          options={availableTemplates}
                                          onChange={(val: string[]) => {
                                             const newPath = val[0];
                                             setSelectedTemplatePath(newPath);
                                             const tmpl = availableTemplates.find((t: any) => t.id === newPath);
                                             if (tmpl && (tmpl.id === "built_in" || tmpl.isCommunity)) {
                                                setActiveTemplate(tmpl.data);
                                                setCustomAppliedTemplate(null);
                                             } else if (tmpl) {
                                                setCustomAppliedTemplate(tmpl.data);
                                                setActiveTemplate(null);
                                             }
                                          }}
                                          disableTint={true}
                                       />
                                    </div>
                                 )}

                                 {currentVisualTemplate?.categories && currentVisualTemplate.categories.length > 0 && (
                                    <div className="w-max shrink-0 relative z-[40]">
                                       <CustomDropdown
                                          value={selectedCategory}
                                          options={[
                                             { id: "ALL", label: t("cat_all") || "All Settings" },
                                             ...currentVisualTemplate.categories.map((cat: any) => ({
                                                id: cat.id,
                                                label: resolveText(cat.name_key, cat.name || cat.id) as string,
                                                icon: resolveText(cat.icon_key, cat.icon || "folder") as string
                                             }))
                                          ]}
                                          onChange={(val: string[]) => setSelectedCategory(val[0])}
                                          disableTint={true}
                                       />
                                    </div>
                                 )}
                              </div>
                           </div>

                           <div className="flex-1 relative min-h-0 min-w-0">
                              {editorState.problemsList.length > 0 ? (
                                 <div className="h-full flex flex-col items-center justify-center gap-4 text-center p-8 opacity-60">
                                    <span className="material-symbols-outlined !text-5xl text-[var(--danger)] mb-2">warning</span>
                                    <h3 className="text-sm font-black text-[var(--text)] tracking-widest uppercase">{t("syntax_error_title")}</h3>
                                    <p className="text-[11px] text-[var(--subtext)] leading-relaxed">{t("syntax_error_desc")}</p>
                                 </div>
                              ) : (
                                 <div ref={layoutState.visualScrollRef} className="absolute inset-0 overflow-y-scroll overflow-x-hidden custom-scrollbar pr-2 z-10 pb-20">
                                    <div className="flex flex-col gap-4 min-h-[300px] px-2 pt-2">
                                       {currentVisualTemplate?.settings ? (
                                          <WorkbenchVisualEditor
                                             settings={currentVisualTemplate.settings}
                                             dataSource={editorState.parsedData}
                                             isPreview={false}
                                             selectedCategory={selectedCategory}
                                             searchQuery={searchQuery}
                                             onVisualChange={editorState.handleVisualChange}
                                             highlightedKey={editorState.highlightedKey}
                                          />
                                       ) : (
                                          <WorkbenchEmptyVisualState t={t} selectedFile={selectedFile} />
                                       )}
                                    </div>
                                 </div>
                              )}
                           </div>
                        </div>
                     
                     {activeTab === 'dual' && (
                        <>
                           {layoutState.isResizingPreview && <div className="fixed inset-0 z-[100010] cursor-col-resize" />}
                           <div
                              className="w-2 rounded-full cursor-col-resize hover:bg-[var(--accent)]/50 transition-colors flex items-center justify-center shrink-0 z-10"
                              onMouseDown={(e) => { e.preventDefault(); layoutState.setIsResizingPreview(true); }}
                           >
                              <div className="h-12 w-1 rounded-full bg-[var(--accent)]/30" />
                           </div>
                        </>
                     )}

                     <div ref={layoutState.rawContainerRef} className={`monaco-wrapper relative flex flex-col theme-glass-panel rounded-[var(--radius)] overflow-hidden shadow-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)] ${activeTab === 'dual' ? 'shrink-0' : 'flex-1 min-w-0 min-h-0'} ${activeTab !== 'raw' && activeTab !== 'dual' ? 'hidden' : ''}`} style={activeTab === 'dual' ? { width: layoutState.isResizingPreview ? layoutState.dragPreviewWidthRef.current : layoutState.previewWidth } : {}}>
                           <WorkbenchRawEditor
                              value={editorState.rawText}
                              onChange={editorState.handleRawChange}
                              language={selectedFile?.name.endsWith('.json') || (editorState.rawText && (editorState.rawText.trim().startsWith('{') || editorState.rawText.trim().startsWith('['))) ? 'json' : 'ini'}
                              isLight={layoutState.isLight}
                              problemsList={editorState.problemsList}
                              setProblemsList={editorState.setProblemsList}
                              isResizingPreview={layoutState.isResizingPreview}
                              onEditorMount={(editor, monaco) => {
                                 editorState.setEditorRef(editor);

                                 editor.onDidChangeModelContent((e: any) => {
                                    if (layoutState.isJumping.current > Date.now()) return;
                                    if (e.changes && e.changes.length > 0) {
                                       const change = e.changes[0];
                                       const lineNum = change.range.startLineNumber;
                                       const model = editor.getModel();
                                       if (model) {
                                          const lineContent = model.getLineContent(lineNum);
                                          let keyMatch = lineContent.match(/"([^"]+)"\s*:/);
                                          if (!keyMatch) {
                                             keyMatch = lineContent.match(/([a-zA-Z0-9_]+)\s*=/);
                                          }
                                          if (keyMatch && keyMatch[1]) {
                                             let key = keyMatch[1];
                                             let currentLine = lineNum - 1;
                                             let indentMatch = lineContent.match(/^\s*/);
                                             let indent = indentMatch ? indentMatch[0].length : 0;
                                             
                                             while (currentLine > 0 && indent > 0) {
                                                const prevLine = model.getLineContent(currentLine);
                                                const prevIndentMatch = prevLine.match(/^\s*/);
                                                const prevIndent = prevIndentMatch ? prevIndentMatch[0].length : 0;
                                                
                                                if (prevLine.trim() !== '' && prevIndent < indent) {
                                                   const parentMatch = prevLine.match(/"([^"]+)"\s*:/) || prevLine.match(/([a-zA-Z0-9_]+)\s*[:=]/);
                                                   if (parentMatch && parentMatch[1]) {
                                                      key = parentMatch[1] + "." + key;
                                                   }
                                                   indent = prevIndent;
                                                }
                                                currentLine--;
                                             }
                                             
                                             layoutState.isJumping.current = Date.now() + 1000;
                                             editorState.triggerHighlight(key);

                                             if (layoutState.visualScrollRef.current) {
                                                const visual = layoutState.visualScrollRef.current;
                                                const element = visual.querySelector(`[data-setting-key="${key}"]`);
                                                if (element) {
                                                   element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                }
                                             }
                                          }
                                       }
                                    }
                                 });
                              }}
                           />
                        </div>
                  </div>
               )}


               {isTemplateMode && (
                  <div className="flex justify-start items-center px-2 mt-2 mb-2 shrink-0 z-[100]">
                     <div className="flex-1 flex items-center overflow-x-auto overflow-y-hidden custom-scrollbar theme-glass-panel rounded-2xl border border-white/5 shadow-inner divide-x divide-white/5">
                        <HubTabButton id="preview" activeTab={previewMode} setTab={setPreviewMode} label={t("preview") || "Preview"} icon="visibility" />
                        <HubTabButton id="file" activeTab={previewMode} setTab={setPreviewMode} label={t("tab_file") || "File"} icon="description" />
                        <HubTabButton id="off" activeTab={previewMode} setTab={setPreviewMode} label={t("tab_off") || "Off"} icon="visibility_off" />
                     </div>
                     {(previewMode === 'preview' || previewMode === 'file') && (
                        <button onClick={() => layoutState.setIsScrollLocked(!layoutState.isScrollLocked)} className={`ml-4 shrink-0 h-10 px-4 rounded-xl flex items-center justify-center gap-2 font-black text-[10px] uppercase tracking-widest transition-all ${layoutState.isScrollLocked ? 'theme-glass-panel !bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] !border-[color-mix(in_srgb,var(--accent)_50%,transparent)] !text-[var(--accent)] !shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_30%,transparent)]' : 'theme-glass-panel border border-white/5 text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5'}`}>
                           <span className="material-symbols-outlined !text-[18px]">{layoutState.isScrollLocked ? 'lock' : 'lock_open'}</span>
                           {t("sync_scroll") || "Sync Scroll"}
                        </button>
                     )}
                  </div>
               )}

               {isTemplateMode && (
                  <div className={`flex-1 flex gap-4 min-w-0 min-h-0 ${previewMode === 'off' ? 'flex-col' : 'flex-row'}`}>
                     <div className="flex-1 theme-glass-panel rounded-[var(--radius)] overflow-visible shadow-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative flex flex-col min-h-0 min-w-0 z-[110]">
                        <div className="p-2 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] shrink-0 flex items-center justify-between z-10 w-full overflow-visible flex-wrap rounded-t-[var(--radius)]">
                           <WorkbenchTemplateTools
                              parsedData={editorState.parsedData}
                              rawText={editorState.rawText}
                              setRawText={editorState.handleRawChange}
                              files={files}
                              t={t}
                              handleInsertSnippet={editorState.handleInsertSnippet}
                              handleAutoMap={editorState.handleAutoMap}
                           />
                        </div>

                        <div className="flex-1 relative w-full min-w-0 min-h-0 overflow-hidden rounded-b-[var(--radius)]">
                           <WorkbenchRawEditor
                              value={editorState.rawText}
                              onChange={editorState.handleRawChange}
                              language="json"
                              isLight={layoutState.isLight}
                              problemsList={editorState.problemsList}
                              setProblemsList={editorState.setProblemsList}
                              isResizingPreview={layoutState.isResizingPreview}
                              onEditorMount={(editor, monaco) => {
                                 editorState.setEditorRef(editor);
                                 (window as any).monaco = monaco;

                                 editor.onContextMenu((e: any) => {
                                    if (e.event) {
                                       if (e.event.browserEvent) e.event.browserEvent.preventDefault();
                                       window.dispatchEvent(new CustomEvent('sanctuary-monaco-contextmenu', {
                                          detail: {
                                             x: e.event.posx,
                                             y: e.event.posy,
                                             target: e.target?.element || document.body
                                          }
                                       }));
                                    }
                                 });
                              }}
                           />
                        </div>

                     </div>

                     {previewMode !== 'off' && (
                        <>
                           {layoutState.isResizingPreview && <div className="fixed inset-0 z-[100010] cursor-col-resize" />}
                           <div
                              className="w-2 rounded-full cursor-col-resize hover:bg-[var(--accent)]/50 transition-colors flex items-center justify-center shrink-0 z-10"
                              onMouseDown={(e) => { e.preventDefault(); layoutState.setIsResizingPreview(true); }}
                           >
                              <div className="h-12 w-1 rounded-full bg-[var(--accent)]/30" />
                           </div>
                           <div className={`shrink-0 theme-glass-panel rounded-[var(--radius)] overflow-hidden shadow-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col relative ${layoutState.isResizingPreview ? 'pointer-events-none select-none' : ''}`} style={{ width: layoutState.previewWidth }}>
                              <div className="p-4 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] shrink-0 text-center flex items-center justify-between">
                                 <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-2">{previewMode === 'preview' ? t("workbench_preview_title") : (editorState.parsedData?.target_file || 'Target File')}</span>
                              </div>
                              <div ref={layoutState.visualScrollRef} className="flex-1 overflow-y-auto custom-scrollbar p-6">
                                 {previewMode === 'preview' ? (
                                    editorState.problemsList.length > 0 ? (
                                       <div className="h-full flex flex-col items-center justify-center gap-4 text-center p-8 opacity-60">
                                          <span className="material-symbols-outlined !text-5xl text-[var(--danger)] mb-2">{t("icon_visibility_off")}</span>
                                          <h3 className="text-sm font-black text-[var(--text)] tracking-widest uppercase">{t("preview_unavailable")}</h3>
                                          <p className="text-[11px] text-[var(--subtext)] leading-relaxed">{t("preview_resolve")}</p>
                                       </div>
                                    ) : (
                                       <div className="flex flex-col gap-4 pb-10">
                                          <WorkbenchVisualEditor
                                             settings={editorState.parsedData?.settings || (editorState.parsedData?.length ? editorState.parsedData[0]?.settings : [])}
                                             dataSource={null}
                                             isPreview={true}
                                             selectedCategory="ALL"
                                             searchQuery=""
                                             onVisualChange={() => { }}
                                          />
                                       </div>
                                    )
                                 ) : (
                                    <div className="h-full w-full">
                                       <Editor
                                          height="100%"
                                          language={editorState.parsedData?.target_file?.endsWith('.json') ? 'json' : 'ini'}
                                          theme={layoutState.isLight ? "sanctuary-glass-light" : "sanctuary-glass-dark"}
                                          value={editorState.targetFileContent}
                                          onChange={(val) => editorState.setTargetFileContent(val || '')}
                                          onMount={(editor, monaco) => {
                                             layoutState.rightEditorRef.current = editor;
                                             editor.onContextMenu((e: any) => {
                                                if (e.event) {
                                                   if (e.event.browserEvent) e.event.browserEvent.preventDefault();
                                                   window.dispatchEvent(new CustomEvent('sanctuary-monaco-contextmenu', {
                                                      detail: {
                                                         x: e.event.posx,
                                                         y: e.event.posy,
                                                         target: e.target?.element || document.body
                                                      }
                                                   }));
                                                }
                                             });
                                          }}
                                          options={previewEditorOptions}
                                       />
                                    </div>
                                 )}
                              </div>
                           </div>
                        </>
                     )}
                  </div>
               )}
            </div>
         </div>
      </SidePanel>
   );
}
