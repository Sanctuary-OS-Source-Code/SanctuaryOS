import React, { useState, useRef, useEffect } from 'react';
import { ViewHeader, SidePanel, CustomDropdown, standardButtonClass, standardGlassButtonClass, standardAccentGlassButtonClass, standardPrimaryButtonClass, EmptyState, HoverTooltip, FilterTabs, FilterTabButton, ActionButton, HubActionButton, HoverTabDrawer, PanelHeaderButton, PanelHeaderGroup } from "../shared";
import Editor from "@monaco-editor/react";
import VersionTimeline from "../VersionTimeline";
import { invoke } from '@tauri-apps/api/core';

export default function MasonEditorPanel({
   t,
   isCloudMode,
   isKeepers = false,
   isFullscreen,
   setIsFullscreen,
   showReference,
   setShowReference,
   showTimeline,
   setShowTimeline,
   activeFile,
   activeFileIndex,
   setActiveFileIndex,
   problemsList,
   setProblemsList,
   validationStats,
   isDirty,
   saveFile,
   handlePublishLexicon,
   openFiles,
   closeFile,
   splitRatio,
   isLight,
   addMissingStrings,
   purgeDeprecatedStrings,
   jumpToNextEmpty,
   handleEditorWillMount,
   handleEditorChange,
   setEditorRef,
   validateContent,
   referenceLabel,
   referenceData,
   isResizing,
   editorRef,
   activeVersionTimestamp,
   setActiveVersionTimestamp,
   setOpenFiles,
   pushStatus
}: any) {

   const [isScrollLocked, setIsScrollLocked] = useState(false);
   const [isDrawerHovered, setIsDrawerHovered] = useState(false);
   const [isFileDropdownOpen, setIsFileDropdownOpen] = useState(false);
   const rightEditorRef = useRef<any>(null);
   const isSyncingScroll = useRef(false);

   useEffect(() => {
      if (!isScrollLocked || !editorRef || !rightEditorRef.current) return;

      const leftEditor = editorRef;
      const rightEditor = rightEditorRef.current;

      const leftScrollListener = leftEditor.onDidScrollChange((e: any) => {
         if (isSyncingScroll.current) return;
         isSyncingScroll.current = true;
         const leftHeight = leftEditor.getScrollHeight() - leftEditor.getLayoutInfo().height;
         const perc = leftHeight > 0 ? e.scrollTop / leftHeight : 0;
         const rightHeight = rightEditor.getScrollHeight() - rightEditor.getLayoutInfo().height;
         rightEditor.setScrollTop(perc * rightHeight);
         setTimeout(() => { isSyncingScroll.current = false; }, 10);
      });

      const rightScrollListener = rightEditor.onDidScrollChange((e: any) => {
         if (isSyncingScroll.current) return;
         isSyncingScroll.current = true;
         const rightHeight = rightEditor.getScrollHeight() - rightEditor.getLayoutInfo().height;
         const perc = rightHeight > 0 ? e.scrollTop / rightHeight : 0;
         const leftHeight = leftEditor.getScrollHeight() - leftEditor.getLayoutInfo().height;
         leftEditor.setScrollTop(perc * leftHeight);
         setTimeout(() => { isSyncingScroll.current = false; }, 10);
      });

      return () => {
         leftScrollListener.dispose();
         rightScrollListener.dispose();
      };
   }, [isScrollLocked, editorRef]);

   const isLexiconActive = activeFile?.content?.includes('_meta_lang') || activeFile?.content?.includes('"a_citizen"') || activeFile?.name.match(/^[a-z]{2}-.+\.json$/i) !== null;

   const isJsonParseError = React.useMemo(() => {
      if (!activeFile) return false;
      try { JSON.parse(activeFile.content); return false; } catch (e) { return true; }
   }, [activeFile?.content]);

   const isValidationRequired = activeFile && (isLexiconActive || activeFile.name.includes('Sims4'));
   const isPublishDisabled = !activeFile || !isDirty || problemsList.length > 0 || isJsonParseError ||
      (isCloudMode && !isKeepers && isValidationRequired && !validationStats) ||
      (!isKeepers && validationStats ? validationStats.missing > 0 : false);

   const getSaveTooltip = () => {
      if (isPublishDisabled) {
         if (isJsonParseError) return "Cannot save invalid JSON";
         if (problemsList.length > 0) return t("publish_disabled_errors_desc");
         if (isCloudMode && !isKeepers && isValidationRequired && !validationStats) return "Awaiting schema validation";
         return t("lexicon_missing_keys_btn");
      }
      return isDirty ? t("unsaved_changes") : (isCloudMode ? t("btn_publish") : t("save"));
   };

   const getSaveVariant = () => {
      if (isPublishDisabled) return "error";
      if (isDirty) return "warning";
      return "default";
   };

   const syncTooltip = problemsList.length > 0 ? t("publish_disabled_errors_desc") : t("lexicon_missing_keys_btn");
   const isSyncDisabled = problemsList.length > 0 || (validationStats ? validationStats.missing > 0 : false);

   return (
      <>
         <SidePanel
            isOpen={!!activeFile}
            onClose={() => setActiveFileIndex(-1)}
            title={isCloudMode ? (isKeepers ? "KEEPERS IDE" : "WAYFINDER IDE") : (t("tools_ide"))}
            subtitle={t("mason_ide_subtitle")}
            icon="code"
            iconColorClass="theme-text-accent"
            isResizable={!isFullscreen}
            defaultWidth={isFullscreen ? window.innerWidth : (showReference ? 1400 : 1000)}
            panelClass={isFullscreen ? "!w-full !max-w-[100vw] !border-r-0 !rounded-none transition-all duration-500" : "transition-all duration-500"}
            headerActions={
               <>
                  <PanelHeaderGroup>
                     <PanelHeaderButton
                        icon={isCloudMode ? "cloud" : "save"}
                        tooltip={getSaveTooltip()}
                        variant={getSaveVariant()}
                        disabled={isPublishDisabled}
                        onClick={saveFile}
                        isActive={isDirty}
                     />
                     {activeFile && activeFile.name.match(/^[a-z]{2}-.+\.json$/i) && !isCloudMode && (
                        <PanelHeaderButton
                           icon={t("icon_upload")}
                           tooltip={isSyncDisabled ? syncTooltip : "SYNC SCHEMA"}
                           variant={isSyncDisabled ? "error" : "success"}
                           disabled={isSyncDisabled}
                           onClick={() => handlePublishLexicon(activeFile)}
                        />
                     )}
                  </PanelHeaderGroup>

                  {isLexiconActive && (
                     <PanelHeaderGroup className="ml-2">
                        <PanelHeaderButton
                           icon={showReference ? "vertical_split" : "splitscreen"}
                           tooltip={t("btn_reference")}
                           isActive={showReference}
                           disabled={!activeFile}
                           onClick={() => setShowReference(!showReference)}
                        />
                     </PanelHeaderGroup>
                  )}

                  <PanelHeaderGroup className="ml-2">
                     {isLexiconActive && showReference && (
                        <PanelHeaderButton
                           icon={isScrollLocked ? 'lock' : 'lock_open'}
                           tooltip={t("sync_scroll")}
                           isActive={isScrollLocked}
                           onClick={() => setIsScrollLocked(!isScrollLocked)}
                        />
                     )}
                     {activeFile && !isCloudMode && (
                        <PanelHeaderButton
                           icon={t("icon_history")}
                           tooltip={t("btn_timeline")}
                           disabled={!activeFile}
                           onClick={() => setShowTimeline(true)}
                        />
                     )}
                     <PanelHeaderButton
                        icon={isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
                        tooltip={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                        onClick={() => setIsFullscreen(!isFullscreen)}
                     />
                  </PanelHeaderGroup>
               </>
            }
            footer={
               (problemsList.length > 0 || (validationStats && (validationStats.missing > 0 || validationStats.deprecated > 0))) ? (
                  <div className="flex flex-col gap-4 w-full relative z-50">
                     {/* Validation Error Banner */}
                     {validationStats && (validationStats.missing > 0 || validationStats.deprecated > 0) && (
                        <div className="w-full flex items-center justify-between gap-5 theme-panel-warning !rounded-2xl px-6 py-4">
                           <div className="flex items-center gap-5">
                              <div className="w-10 h-10 rounded-full bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] flex items-center justify-center text-[var(--warning)] shrink-0">
                                 <span className="material-symbols-outlined !text-[20px]">warning</span>
                              </div>
                              <div className="flex flex-col min-w-0">
                                 <span className="text-sm font-bold text-[var(--warning)] flex items-center gap-2">
                                    <strong>{validationStats.total - validationStats.missing}</strong> 
                                    {activeFile?.name.match(/^[a-z]{2}-.+\.json$/i) ? (t("lexicon_translated_count")?.replace("{translated} / {total}", `/ ${validationStats.total}`) || `/ ${validationStats.total} Translated`) : `/ ${validationStats.total} Validated`}
                                    <span className="text-[10px] text-[var(--warning)] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded border border-[color-mix(in_srgb,var(--warning)_20%,transparent)] shrink-0 bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] ml-1">
                                       Schema Validation
                                    </span>
                                 </span>
                                 <span className="text-xs text-[var(--warning)] opacity-80 mt-0.5">
                                    {validationStats.deprecated > 0
                                       ? `${validationStats.deprecated} ${activeFile?.name.match(/^[a-z]{2}-.+\.json$/i) ? 'Deprecated Strings' : 'Unrecognized Fields'}`
                                       : (activeFile?.name.match(/^[a-z]{2}-.+\.json$/i) ? (t("lexicon_missing_count")?.replace("{missing}", validationStats.missing.toString()) || `${validationStats.missing} Missing Strings`) : `${validationStats.missing} Missing Schema Keys`)}
                                 </span>
                              </div>
                           </div>
                           <div className="flex items-center gap-3 shrink-0">
                              {validationStats.deprecated > 0 ? (
                                 <ActionButton
                                    onClick={purgeDeprecatedStrings}
                                    variant="danger"
                                    icon="delete"
                                    label={<span className="whitespace-nowrap">{`${t("lexicon_purge_keys")} (${validationStats.deprecated})`}</span>}
                                    className="!px-5 !py-2.5 !text-xs"
                                 />
                              ) : validationStats.completelyMissing > 0 ? (
                                 <ActionButton
                                    onClick={addMissingStrings}
                                    variant="default"
                                    icon="add_circle"
                                    label={<span className="whitespace-nowrap">{t("lexicon_add_missing")}</span>}
                                    className="!px-5 !py-2.5 !text-xs"
                                 />
                              ) : (
                                 <ActionButton
                                    onClick={jumpToNextEmpty}
                                    variant="default"
                                    icon="arrow_downward"
                                    label={<span className="whitespace-nowrap">{t("lexicon_next_empty")}</span>}
                                    className="!px-5 !py-2.5 !text-xs"
                                 />
                              )}
                           </div>
                        </div>
                     )}

                     {/* Syntax Error Banner */}
                     {problemsList.length > 0 && (
                        <div className="w-full flex items-center justify-between gap-5 theme-panel-danger !rounded-2xl px-6 py-4 cursor-pointer hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] transition-all group/problem"
                             onClick={() => { if (editorRef && problemsList[0]) { editorRef.revealLineInCenter(problemsList[0].line); editorRef.setPosition({ lineNumber: problemsList[0].line, column: problemsList[0].column }); editorRef.focus(); } }}
                        >
                           <div className="flex items-center gap-5">
                              <div className="w-10 h-10 rounded-full bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] flex items-center justify-center text-[var(--danger)] group-hover/problem:animate-pulse shrink-0">
                                 <span className="material-symbols-outlined !text-[20px]">{t("icon_error")}</span>
                              </div>
                              <div className="flex flex-col min-w-0">
                                 <span className="text-sm font-bold text-[var(--danger)] flex items-center gap-2">
                                    <strong>{problemsList.length}</strong> {problemsList.length === 1 ? 'Syntax Error' : 'Syntax Errors'}
                                    <span className="text-[10px] text-[var(--danger)] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded border border-[color-mix(in_srgb,var(--danger)_20%,transparent)] shrink-0 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] ml-1">
                                       Line {problemsList[0]?.line}
                                    </span>
                                 </span>
                                 <span className="text-xs text-[var(--danger)] opacity-80 font-mono truncate max-w-[600px] transition-colors mt-0.5">
                                    {problemsList[0]?.message}
                                 </span>
                              </div>
                           </div>
                           
                           <button onClick={(e) => { e.stopPropagation(); setProblemsList([]); }} className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--danger)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] transition-all shrink-0">
                              <span className="material-symbols-outlined !text-[18px]">{t("icon_close")}</span>
                           </button>
                        </div>
                     )}
                  </div>
               ) : undefined
            }
         >
            <div className="absolute inset-0 flex flex-col w-full min-w-full">
               <div className="flex-1 relative flex w-full min-w-full h-full min-h-0">
                  <HoverTabDrawer
                     title="WORKSPACE"
                     position="left"
                     className="!absolute !top-0 !bottom-0 !z-[100] !h-full"
                     activeTab={activeFileIndex}
                     setTab={setActiveFileIndex}
                     onHoverChange={setIsDrawerHovered}
                     tabs={openFiles.map((file: any, i: number) => {
                        if (file.isHidden) return null;
                        const fileIsDirty = file.content !== file.originalContent;
                        return {
                           id: i,
                           label: (
                              <span className={fileIsDirty ? "text-[var(--warning)] italic drop-shadow-[0_0_8px_color-mix(in_srgb,var(--warning)_50%,transparent)]" : ""}>
                                 {file.name}{fileIsDirty ? " *" : ""}
                              </span>
                           ),
                           icon: file.name.endsWith('.json') ? 'data_object' : 'description',
                           badge: (
                              <div className="flex items-center -mr-1">
                                 <div
                                    onClick={(e) => {
                                       e.stopPropagation();
                                       closeFile(i, e);
                                    }}
                                    className="hover:text-[var(--danger)] text-[var(--subtext)] cursor-pointer flex items-center justify-center rounded-full hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] transition-all w-6 h-6"
                                 >
                                    <span className="material-symbols-outlined !text-[14px]">close</span>
                                 </div>
                              </div>
                           )
                        };
                     }).filter(Boolean)}
                  />

                  <div className={`flex-1 flex w-full min-w-0 relative h-full pl-12 transition-opacity duration-500 ease-[cubic-bezier(0.2,0.9,0.2,1)] ${isDrawerHovered ? 'opacity-5 pointer-events-none' : 'opacity-100'}`}>
                     <div style={{ width: (showReference && isLexiconActive) ? `${splitRatio}%` : '100%' }} className="flex-shrink-0 w-full flex flex-col relative h-full min-w-0 transition-none">

                        {activeFile && (
                           <Editor
                              height="100%"
                              language={activeFile.name.endsWith('.json') || (activeFile.content && (activeFile.content.trim().startsWith('{') || activeFile.content.trim().startsWith('['))) ? 'json' : activeFile.name.endsWith('.ts') || activeFile.name.endsWith('.tsx') ? 'typescript' : 'javascript'}
                              theme={isLight ? "sanctuary-glass-light" : "sanctuary-glass-dark"}
                              beforeMount={handleEditorWillMount}
                              value={activeFile.content}
                              onChange={handleEditorChange}
                              onMount={(editor, monaco) => {
                                 setEditorRef(editor);
                                 (window as any).monaco = monaco;
                                 validateContent(activeFile.content, monaco, editor.getModel());
                                 editor.onContextMenu((e: any) => {
                                    if (e.event) {
                                       if (e.event.browserEvent) e.event.browserEvent.preventDefault();
                                       window.dispatchEvent(new CustomEvent('sanctuary-monaco-contextmenu', {
                                          detail: {
                                             x: e.event.browserEvent ? e.event.browserEvent.clientX : e.event.posx,
                                             y: e.event.browserEvent ? e.event.browserEvent.clientY : e.event.posy,
                                             target: e.target?.element || document.body,
                                             isReadOnly: false
                                          }
                                       }));
                                    }
                                 });
                              }}
                              options={{
                                 contextmenu: false,
                                 minimap: { enabled: true },
                                 fontSize: 14,
                                 fontFamily: "var(--font-mono), Consolas, monospace",
                                 padding: { top: 24, bottom: 24 },
                                 smoothScrolling: true,
                                 cursorBlinking: "smooth",
                                 lineHeight: 24,
                                 automaticLayout: true,
                                 scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 }
                              }}
                           />
                        )}
                     </div>

                     {(showReference && isLexiconActive) && (
                        <>
                           <div
                              onMouseDown={(e) => { e.preventDefault(); isResizing.current = true; document.body.style.cursor = 'col-resize'; }}
                              className="w-4 cursor-col-resize hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] active:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] transition-colors z-50 flex items-center justify-center -ml-2 mr-2 relative group shrink-0"
                           >
                              <div className="w-[2px] h-12 bg-[color-mix(in_srgb,var(--text)_20%,transparent)] group-hover:bg-[var(--accent)] transition-colors rounded-full" />
                           </div>
                           <div style={{ width: `${100 - splitRatio}%` }} className="flex-1 relative h-full min-w-0 border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] pl-2 transition-none">
                              <div className="absolute top-4 right-6 z-10 glass-panel px-4 py-1.5 rounded-full border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[10px] font-black tracking-widest capitalize text-[var(--subtext)] shadow-md">{referenceLabel}</div>
                              <Editor
                                 height="100%"
                                 language="json"
                                 theme={isLight ? "sanctuary-glass-light" : "sanctuary-glass-dark"}
                                 value={JSON.stringify(referenceData, null, 2)}
                                 onMount={(editor) => {
                                    rightEditorRef.current = editor;
                                    editor.onContextMenu((e: any) => {
                                       if (e.event) {
                                          if (e.event.browserEvent) e.event.browserEvent.preventDefault();
                                          window.dispatchEvent(new CustomEvent('sanctuary-monaco-contextmenu', {
                                             detail: {
                                                x: e.event.browserEvent ? e.event.browserEvent.clientX : e.event.posx,
                                                y: e.event.browserEvent ? e.event.browserEvent.clientY : e.event.posy,
                                                target: e.target?.element || document.body,
                                                isReadOnly: true
                                             }
                                          }));
                                       }
                                    });
                                 }}
                                 options={{ contextmenu: false, readOnly: true, minimap: { enabled: false }, fontSize: 13, fontFamily: "var(--font-mono)", padding: { top: 24, bottom: 24 }, automaticLayout: true }}
                              />
                           </div>
                        </>
                     )}
                  </div>
               </div>
            </div>
         </SidePanel>

         {showTimeline && activeFile && (
            <VersionTimeline
               key={activeFile.path}
               filePath={activeFile.path.replace(/\//g, '\\')}
               hasUnsavedChanges={activeFile.content !== activeFile.originalContent}
               activeVersionTimestamp={activeVersionTimestamp}
               onRestore={async (content: string, timestamp: number) => {
                  setOpenFiles((prev: any) => prev.map((f: any, i: number) => i === activeFileIndex ? { ...f, content, originalContent: content } : f));
                  if (editorRef && (window as any).monaco) {
                     validateContent(content, (window as any).monaco, editorRef.getModel());
                  }
                  try {
                     await invoke('save_file_silently', { path: activeFile.path.replace(/\//g, '\\'), content });
                     setActiveVersionTimestamp(timestamp);
                     pushStatus(t("alert_saved"), "success");
                  } catch (e) {
                     console.error(e);
                     pushStatus("Failed to save restored version", "error");
                  }
               }}
               onClose={() => setShowTimeline(false)}
            />
         )}
      </>
   );
}


