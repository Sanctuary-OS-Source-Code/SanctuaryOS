import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { useLexicon } from '../LexiconContext';
import { useStore } from '../store';
import { SidePanel, standardButtonClass, standardDangerButtonClass, HubTabButton, HoverTooltip, CustomDropdown, ActionButton, SearchBar, PanelHeaderGroup, PanelHeaderButton } from '../shared';
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
         title={isTemplateMode ? (t("author_mode")) : (t("editor_mode"))}
         subtitle={selectedFile ? selectedFile.name : (t("workbench_subtitle"))}
         icon={isTemplateMode ? (t("icon_data_object")) : (t("icon_tune"))}
         iconColorClass="theme-text-accent"
         isResizable={!layoutState.isFullscreen}
         defaultWidth={layoutState.isFullscreen ? window.innerWidth : ((isTemplateMode && previewMode !== 'off') || activeTab === 'dual' ? 1400 : 900)}
         panelClass={layoutState.isFullscreen ? "!w-full !max-w-[100vw] !border-r-0 !rounded-none" : ""}
         headerActions={
            <>
               <PanelHeaderGroup>
                  {isTemplateMode && (
                     <PanelHeaderButton
                        icon={t("icon_cloud_upload")}
                        tooltip={(!session || localStorage.getItem("sanctuary_blacklisted") === "true") ? (localStorage.getItem("sanctuary_blacklisted") === "true" ? t("alert_comm_banned") : t("alert_guest_mode")) : (editorState.problemsList.length > 0 ? t("err_publish_blocks") : t("btn_publish"))}
                        variant="accent"
                        disabled={editorState.problemsList.length > 0 || !session || localStorage.getItem("sanctuary_blacklisted") === "true"}
                        onClick={() => setIsPushModalOpen(true)}
                     />
                  )}
                  
                  {editorState.problemsList.length > 0 && hasUnsavedChanges ? (
                     layoutState.confirmSaveWithErrors ? (
                        <>
                           <PanelHeaderButton
                              icon="close"
                              tooltip={t("nav_cancel")}
                              variant="danger"
                              onClick={() => layoutState.setConfirmSaveWithErrors(false)}
                           />
                           <PanelHeaderButton
                              icon="check"
                              tooltip={t("btn_confirm_save_errors")}
                              variant="warning"
                              disabled={fileState.isSaving}
                              onClick={() => {
                                 layoutState.setConfirmSaveWithErrors(false);
                                 fileState.saveConfig(editorState.rawText);
                              }}
                           />
                        </>
                     ) : (
                        <PanelHeaderButton
                           icon="warning"
                           tooltip={t("save_with_errors_warning")}
                           variant="warning"
                           disabled={fileState.isSaving}
                           onClick={() => layoutState.setConfirmSaveWithErrors(true)}
                        />
                     )
                  ) : (
                     <PanelHeaderButton
                        icon={t("icon_save")}
                        tooltip={fileState.isSaving ? t("btn_saving") : t("save")}
                        variant={hasUnsavedChanges ? "success" : "default"}
                        disabled={!hasUnsavedChanges || fileState.isSaving}
                        onClick={() => fileState.saveConfig(editorState.rawText)}
                     />
                  )}
               </PanelHeaderGroup>

               {!isTemplateMode ? (
                  <PanelHeaderGroup className="ml-2">
                     <PanelHeaderButton
                        icon={t("icon_tune")}
                        tooltip={t("tab_visual")}
                        isActive={activeTab === 'visual'}
                        onClick={() => setActiveTab('visual')}
                     />
                     <PanelHeaderButton
                        icon={t("icon_code")}
                        tooltip={t("tab_raw")}
                        isActive={activeTab === 'raw'}
                        onClick={() => setActiveTab('raw')}
                     />
                     <PanelHeaderButton
                        icon="splitscreen"
                        tooltip={t("tab_dual_vision")}
                        isActive={activeTab === 'dual'}
                        onClick={() => setActiveTab('dual')}
                     />
                  </PanelHeaderGroup>
               ) : (
                  <PanelHeaderGroup className="ml-2">
                     <PanelHeaderButton
                        icon="visibility"
                        tooltip={t("preview")}
                        isActive={previewMode === 'preview'}
                        onClick={() => setPreviewMode('preview')}
                     />
                     <PanelHeaderButton
                        icon="description"
                        tooltip={t("tab_file")}
                        isActive={previewMode === 'file'}
                        onClick={() => setPreviewMode('file')}
                     />
                     <PanelHeaderButton
                        icon="visibility_off"
                        tooltip={t("tab_off")}
                        isActive={previewMode === 'off'}
                        onClick={() => setPreviewMode('off')}
                     />
                  </PanelHeaderGroup>
               )}

               <PanelHeaderGroup className="ml-2">
                  {isTemplateMode && (
                     <PanelHeaderButton
                        icon={t("icon_help")}
                        tooltip={t("btn_info")}
                        onClick={() => layoutState.setIsTemplateGuideOpen(true)}
                     />
                  )}
                  <PanelHeaderButton
                     icon={t("icon_history")}
                     tooltip={t("btn_timeline")}
                     onClick={() => setShowTimeline(true)}
                  />
                  {((!isTemplateMode && activeTab === 'dual') || (isTemplateMode && (previewMode === 'preview' || previewMode === 'file'))) && (
                     <PanelHeaderButton
                        icon={layoutState.isScrollLocked ? 'lock' : 'lock_open'}
                        tooltip={t("sync_scroll")}
                        isActive={layoutState.isScrollLocked}
                        onClick={() => layoutState.setIsScrollLocked(!layoutState.isScrollLocked)}
                     />
                  )}
               </PanelHeaderGroup>
               <PanelHeaderGroup className="ml-2">
                  <PanelHeaderButton
                     icon={layoutState.isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
                     tooltip={layoutState.isFullscreen ? t("btn_exit_fullscreen") : t("btn_fullscreen")}
                     onClick={() => layoutState.setIsFullscreen(!layoutState.isFullscreen)}
                  />
               </PanelHeaderGroup>
            </>
         }
         footer={
            editorState.problemsList.length > 0 ? (
               <div className="flex flex-col gap-4 w-full relative z-50">
                  <div className="w-full flex items-center justify-between gap-5 theme-panel-danger !rounded-2xl px-6 py-4 cursor-pointer hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] transition-all group/problem"
                       onClick={() => { if (editorState.editorRef && editorState.problemsList[0]) { editorState.editorRef.revealLineInCenter(editorState.problemsList[0].line); editorState.editorRef.setPosition({ lineNumber: editorState.problemsList[0].line, column: editorState.problemsList[0].column }); editorState.editorRef.focus(); } }}
                  >
                     <div className="flex items-center gap-5">
                        <div className="w-10 h-10 rounded-full bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] flex items-center justify-center text-[var(--danger)] group-hover/problem:animate-pulse shrink-0">
                           <span className="material-symbols-outlined !text-[20px]">{t("icon_error") || "error"}</span>
                        </div>
                        <div className="flex flex-col min-w-0">
                           <span className="text-sm font-bold text-[var(--danger)] flex items-center gap-2">
                              <strong>{editorState.problemsList.length}</strong> {editorState.problemsList.length === 1 ? 'Syntax Error' : 'Syntax Errors'}
                              <span className="text-[10px] text-[var(--danger)] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded border border-[color-mix(in_srgb,var(--danger)_20%,transparent)] shrink-0 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] ml-1">
                                 Line {editorState.problemsList[0]?.line}
                              </span>
                           </span>
                           <span className="text-xs text-[var(--danger)] opacity-80 font-mono truncate max-w-[600px] transition-colors mt-0.5">
                              {editorState.problemsList[0]?.message}
                           </span>
                        </div>
                     </div>
                     
                     <button onClick={(e) => { e.stopPropagation(); editorState.setProblemsList([]); }} className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--danger)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] transition-all shrink-0">
                        <span className="material-symbols-outlined !text-[18px]">{t("icon_close") || "close"}</span>
                     </button>
                  </div>
               </div>
            ) : undefined
         }
      >
         <div className="flex-1 min-h-0 flex flex-col h-full w-full relative">

            <div className="flex-1 relative min-h-0 mx-2 mb-2 flex flex-col gap-4">
               {!isTemplateMode && (
                  <div className={`flex-1 flex gap-4 min-w-0 min-h-0 ${activeTab === 'dual' ? 'flex-row' : 'flex-col'}`}>
                     <div className={`flex flex-col gap-6 flex-1 relative min-w-0 min-h-0 ${activeTab !== 'visual' && activeTab !== 'dual' ? 'hidden' : ''}`}>
                           <div className="flex flex-col gap-2 shrink-0 mb-4">
                              <div className="flex flex-row items-center gap-2 w-full">
                                 <div className="flex-[2] min-w-[120px] relative">
                                    <SearchBar
                                       value={searchQuery}
                                       onChange={setSearchQuery}
                                       placeholder={t("workbench_search_placeholder")}
                                       className="rounded-xl h-10"
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
                                             { id: "ALL", label: t("cat_all") },
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
                                    <h3 className="text-sm font-black text-[var(--text)] tracking-widest capitalize">{t("syntax_error_title")}</h3>
                                    <p className="text-[11px] text-[var(--subtext)] leading-relaxed">{t("syntax_error_desc")}</p>
                                 </div>
                              ) : (
                                 <div ref={layoutState.visualScrollRef} className="absolute inset-0 rounded-[inherit] overflow-y-scroll overflow-x-hidden custom-scrollbar pr-2 z-10 pb-20">
                                    <div className="flex flex-col gap-4 min-h-[300px] px-2 pt-2">
                                       {editorState.problemsList.length > 0 ? (
                                          <div className="h-full flex flex-col items-center justify-center gap-4 text-center p-8 opacity-60">
                                             <span className="material-symbols-outlined !text-5xl text-[var(--danger)] mb-2">{t("icon_visibility_off")}</span>
                                             <h3 className="text-sm font-black text-[var(--text)] tracking-widest capitalize">{t("preview_unavailable")}</h3>
                                             <p className="text-[11px] text-[var(--subtext)] leading-relaxed">{t("preview_resolve")}</p>
                                          </div>
                                       ) : currentVisualTemplate?.settings ? (
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
                              className="w-2 rounded-full cursor-col-resize hover:bg-[color-mix(in_srgb,var(--accent)_50%,transparent)] transition-colors flex items-center justify-center shrink-0 z-10"
                              onMouseDown={(e) => { e.preventDefault(); layoutState.setIsResizingPreview(true); }}
                           >
                              <div className="h-12 w-1 rounded-full bg-[color-mix(in_srgb,var(--accent)_30%,transparent)]" />
                           </div>
                        </>
                     )}

           <div ref={layoutState.rawContainerRef} className={`monaco-wrapper relative flex flex-col glass-panel rounded-2xl shadow-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)] ${activeTab === 'dual' ? 'shrink-0' : 'flex-1 min-w-0 min-h-0'} ${activeTab !== 'raw' && activeTab !== 'dual' ? 'hidden' : ''}`} style={activeTab === 'dual' ? { width: layoutState.isResizingPreview ? layoutState.dragPreviewWidthRef.current : layoutState.previewWidth } : {}}>
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
                  <div className={`flex-1 flex gap-4 min-w-0 min-h-0 ${previewMode === 'off' ? 'flex-col' : 'flex-row'}`}>
                     <div className="flex-1 relative flex flex-col min-h-0 min-w-0 z-[110]">
                        <div className="shrink-0 flex items-center justify-center z-10 w-full overflow-visible flex-wrap pb-4 pt-2">
                           <div className="glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-full px-4 py-2 shadow-lg flex items-center gap-2">
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
                        </div>

                        <div className="flex-1 relative w-full min-w-0 min-h-0 overflow-hidden">
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
                              className="w-2 rounded-full cursor-col-resize hover:bg-[color-mix(in_srgb,var(--accent)_50%,transparent)] transition-colors flex items-center justify-center shrink-0 z-10"
                              onMouseDown={(e) => { e.preventDefault(); layoutState.setIsResizingPreview(true); }}
                           >
                              <div className="h-12 w-1 rounded-full bg-[color-mix(in_srgb,var(--accent)_30%,transparent)]" />
                           </div>
              <div className={`shrink-0 flex flex-col relative border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] ${layoutState.isResizingPreview ? 'pointer-events-none select-none' : ''}`} style={{ width: layoutState.previewWidth }}>
                              <div className="p-4 shrink-0 text-center flex items-center justify-center">
                                 <div className="glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-full px-6 py-2 shadow-md">
                                    <span className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)]">{previewMode === 'preview' ? t("workbench_preview_title") : (editorState.parsedData?.target_file || 'Target File')}</span>
                                 </div>
                              </div>
                              <div ref={layoutState.visualScrollRef} className="flex-1 overflow-y-auto custom-scrollbar p-6">
                                 {previewMode === 'preview' ? (
                                    editorState.problemsList.length > 0 ? (
                                       <div className="h-full flex flex-col items-center justify-center gap-4 text-center p-8 opacity-60">
                                          <span className="material-symbols-outlined !text-5xl text-[var(--danger)] mb-2">{t("icon_visibility_off")}</span>
                                          <h3 className="text-sm font-black text-[var(--text)] tracking-widest capitalize">{t("preview_unavailable")}</h3>
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



