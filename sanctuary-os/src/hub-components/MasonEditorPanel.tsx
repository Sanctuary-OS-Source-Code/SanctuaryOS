import React, { useState, useRef, useEffect } from 'react';
import { ViewHeader, SidePanel, CustomDropdown, standardButtonClass, standardGlassButtonClass, standardAccentGlassButtonClass, standardPrimaryButtonClass, EmptyState, HoverTooltip, FilterTabs, FilterTabButton } from "../shared";
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

   const isLexiconActive = activeFile?.content?.includes('_meta_lang') || activeFile?.content?.includes('"a_citizen"') || activeFile?.name.startsWith('en-') || activeFile?.name.startsWith('de-') || activeFile?.name.startsWith('es-') || activeFile?.name.startsWith('fr-');

   return (
      <>
         <SidePanel
            isOpen={!!activeFile}
            onClose={() => setActiveFileIndex(-1)}
            title={isCloudMode ? (isKeepers ? "KEEPERS IDE" : "WAYFINDER IDE") : (t("tools_ide") || "MASON IDE")}
            subtitle={t("mason_ide_subtitle") || "DEVELOPMENT & LOCALIZATION ENVIRONMENT"}
            icon="code"
            iconColorClass="theme-text-accent"
            isResizable={!isFullscreen}
            defaultWidth={isFullscreen ? window.innerWidth : (showReference ? 1400 : 1000)}
            panelClass={isFullscreen ? "!w-full !max-w-[100vw] !border-r-0 !rounded-none transition-all duration-500" : "transition-all duration-500"}
            headerActions={
               <div className="flex items-center overflow-hidden theme-glass-panel rounded-2xl divide-x divide-white/5 border border-white/10 shadow-inner mr-2 backdrop-blur-md">
                  <div className="relative group flex">
                     <button
                        onClick={() => setIsFullscreen(!isFullscreen)}
                        className="w-12 h-12 flex items-center justify-center text-[color-mix(in_srgb,var(--text)_50%,transparent)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all shrink-0"
                     >
                        <span className="material-symbols-outlined !text-[18px]">{isFullscreen ? 'fullscreen_exit' : 'fullscreen'}</span>
                     </button>
                     <HoverTooltip title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"} variant="info" className="z-[100] top-[120%]" />
                  </div>
                  {isLexiconActive && (
                     <>
                        <button
                           onClick={() => setShowReference(!showReference)}
                           disabled={!activeFile}
                           className={`h-12 px-6 transition-all flex items-center justify-center gap-2 shrink-0 text-[var(--text)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-transparent font-black ${showReference ? '!opacity-100 bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]' : ''}`}
                        >
                           <span className="material-symbols-outlined !text-[18px] normal-case">{showReference ? "vertical_split" : "splitscreen"}</span>
                           <span className="text-[10px] font-black uppercase tracking-widest">{t("btn_reference") || "Reference"}</span>
                        </button>
                        {showReference && (
                           <button
                              onClick={() => setIsScrollLocked(!isScrollLocked)}
                              className={`h-12 px-6 transition-all flex items-center justify-center gap-2 shrink-0 text-[var(--text)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-l border-white/5 font-black ${isScrollLocked ? '!opacity-100 !bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] !text-[var(--accent)] hover:!bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]' : ''}`}
                           >
                              <span className="material-symbols-outlined !text-[18px] normal-case">{isScrollLocked ? 'lock' : 'lock_open'}</span>
                              <span className="text-[10px] font-black uppercase tracking-widest">{t("sync_scroll") || "Sync Scroll"}</span>
                           </button>
                        )}
                     </>
                  )}
                  {activeFile && !isCloudMode && (
                     <button
                        onClick={() => setShowTimeline(true)}
                        disabled={!activeFile}
                        className="h-12 px-6 transition-all flex items-center justify-center gap-2 shrink-0 text-[var(--text)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-transparent font-black"
                     >
                        <span className="material-symbols-outlined !text-[18px] normal-case">{t("icon_history")}</span>
                        <span className="text-[10px] font-black uppercase tracking-widest">{t("btn_timeline")}</span>
                     </button>
                  )}
               </div>
            }
            footer={
               <div className="flex items-center justify-center gap-3 w-full shrink-0">
                  <div className="relative group">
                     {(problemsList.length > 0 || (!isKeepers && validationStats && validationStats.missing > 0)) ? (
                        <HoverTooltip title={problemsList.length > 0 ? t("publish_disabled_errors_desc") : t("lexicon_missing_keys_btn")} variant="error" className="z-[100]" />
                     ) : isDirty && (
                        <HoverTooltip title={t("unsaved_changes")} variant="warning" className="z-[100]" />
                     )}

                     <button
                        onClick={saveFile}
                        disabled={!activeFile || !isDirty || problemsList.length > 0 || (!isKeepers && validationStats ? validationStats.missing > 0 : false)}
                        className={
                           isDirty
                              ? standardButtonClass.replace('bg-[color-mix(in_srgb,var(--text)_5%,transparent)]', 'bg-[color-mix(in_srgb,var(--warning)_15%,transparent)]').replace('border-[color-mix(in_srgb,var(--text)_10%,transparent)]', 'border-[color-mix(in_srgb,var(--warning)_50%,transparent)] text-[var(--warning)] shadow-[0_0_20px_color-mix(in_srgb,var(--warning)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--warning)_25%,transparent)] hover:shadow-[0_5px_20px_rgba(245,158,11,0.4)]')
                              : standardButtonClass
                        }
                     >
                        <span className="material-symbols-outlined !text-[18px]">
                           {isCloudMode ? "cloud_upload" : t("icon_save")}
                        </span>
                        {isCloudMode ? (t("btn_publish") || "Publish") : t("save")}
                     </button>
                  </div>

                  {activeFile && activeFile.name.match(/^[a-z]{2}-.+\.json$/i) && !isCloudMode && (
                     <div className="relative group">
                        {(problemsList.length > 0 || (validationStats && validationStats.missing > 0)) && (
                           <HoverTooltip title={problemsList.length > 0 ? t("publish_disabled_errors_desc") : t("lexicon_missing_keys_btn")} variant="error" className="z-[100]" />
                        )}
                        <button
                           onClick={() => handlePublishLexicon(activeFile)}
                           disabled={problemsList.length > 0 || (validationStats ? validationStats.missing > 0 : false)}
                           className={
                              (problemsList.length > 0 || (validationStats ? validationStats.missing > 0 : false))
                                 ? standardButtonClass.replace('hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]', '').replace('active:scale-95', '') + ' opacity-50 cursor-not-allowed grayscale'
                                 : standardButtonClass.replace('bg-[color-mix(in_srgb,var(--text)_5%,transparent)]', 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)]').replace('border-[color-mix(in_srgb,var(--text)_10%,transparent)]', 'border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_20%,transparent)]')
                           }
                        >
                           <span className="material-symbols-outlined !text-[18px]">{t("icon_upload") || "cloud_upload"}</span>
                           {activeFile?.name.match(/^[a-z]{2}-.+\.json$/i) ? (t("sandbox_btn_sync") || "SYNC LEXICON") : "SYNC SCHEMA"}
                        </button>
                     </div>
                  )}
               </div>
            }
         >
            <div className="flex flex-col h-full relative">
               <div className="flex flex-col relative z-20 shrink-0 px-6 pt-0 pb-4 pointer-events-none">
                  <div className="flex items-center overflow-x-auto custom-scrollbar theme-glass-panel rounded-full border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner divide-x divide-[color-mix(in_srgb,var(--text)_10%,transparent)] shrink-0 w-max max-w-full mx-auto pointer-events-auto h-10">
                     {openFiles.map((file: any, i: number) => {
                        if (file.isHidden) return null;
                        const isActive = activeFileIndex === i;
                        const fileIsDirty = file.content !== file.originalContent;
                        return (
                           <button
                              key={file.path}
                              onClick={() => setActiveFileIndex(i)}
                              className={`h-full px-5 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap first:rounded-l-full last:rounded-r-full group shrink-0 ${isActive ? (fileIsDirty ? 'bg-[var(--warning)]/20 text-[var(--warning)]' : 'bg-[var(--accent)]/20 text-[var(--accent)]') : 'bg-transparent text-[var(--subtext)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:text-[var(--text)]'}`}
                           >
                              <span className="material-symbols-outlined !text-[16px]">{file.name.endsWith('.json') ? 'data_object' : 'description'}</span>
                              {file.name}
                              <div onClick={(e) => { e.stopPropagation(); closeFile(i, e); }} className={`material-symbols-outlined !text-[14px] p-0.5 rounded-full transition-colors ml-1 ${isActive ? (fileIsDirty ? 'text-[var(--warning)] hover:bg-[var(--warning)]/20' : 'text-[var(--accent)] hover:bg-[var(--accent)]/20') : 'text-transparent group-hover:text-[var(--subtext)] hover:!text-[var(--danger)] hover:!bg-[var(--danger)]/20'}`}>{t("icon_close") || "close"}</div>
                           </button>
                        );
                     })}
                  </div>
               </div>

               <div className="flex-1 relative flex w-full min-h-0">

                  <div style={{ width: (showReference && isLexiconActive) ? `${splitRatio}%` : '100%' }} className="flex-shrink-0 relative h-full min-w-0 transition-none">
                     {validationStats && (
                        <div className={`absolute bottom-8 left-1/2 -translate-x-1/2 z-[50] flex items-center gap-6 theme-glass-panel rounded-full border px-6 py-3 shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-all ${validationStats.missing === 0 ? 'border-[color-mix(in_srgb,var(--success)_30%,transparent)] shadow-[0_0_20px_color-mix(in_srgb,var(--success)_10%,transparent)]' : 'border-[color-mix(in_srgb,var(--warning)_30%,transparent)] shadow-[0_0_20px_color-mix(in_srgb,var(--warning)_10%,transparent)]'}`}>
                           <div className="flex items-center gap-3">

                              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] whitespace-nowrap opacity-90">
                                 <strong>{validationStats.total - validationStats.missing}</strong> {
                                    activeFile?.name.match(/^[a-z]{2}-.+\.json$/i)
                                       ? (t("lexicon_translated_count")?.replace("{translated} / {total}", `/ ${validationStats.total}`) || `/ ${validationStats.total} Translated`)
                                       : `/ ${validationStats.total} Validated`
                                 }
                              </span>
                           </div>
                           {validationStats.missing > 0 || validationStats.deprecated > 0 ? (
                              <>
                                 <div className="w-px h-5 bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
                                 <div className="flex items-center gap-2 relative group">
                                    {!activeFile?.name.match(/^[a-z]{2}-.+\.json$/i) && validationStats.deprecated === 0 && (
                                       <HoverTooltip title="Tip: You can set any value to the JSON 'null' literal (without quotes) to legitimately leave it blank without triggering missing key errors!" variant="warning" className="z-[100] bottom-[120%]" />
                                    )}
                                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-2 opacity-90 whitespace-nowrap">
                                       <span className="material-symbols-outlined !text-[16px] text-[var(--warning)]">warning</span>
                                       {validationStats.deprecated > 0
                                          ? `${validationStats.deprecated} ${activeFile?.name.match(/^[a-z]{2}-.+\.json$/i) ? 'Deprecated Strings' : 'Unrecognized Fields'}`
                                          : (activeFile?.name.match(/^[a-z]{2}-.+\.json$/i) ? t("lexicon_missing_count")?.replace("{missing}", validationStats.missing.toString()) || `${validationStats.missing} Missing Strings` : `${validationStats.missing} Missing Schema Keys`)}
                                    </span>
                                 </div>
                                 {validationStats.deprecated > 0 ? (
                                    <button
                                       onClick={purgeDeprecatedStrings}
                                       className="ml-2 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] text-[9px] font-black uppercase tracking-widest px-4 py-2 rounded-full transition-all flex items-center gap-1.5 shadow-md active:scale-95 whitespace-nowrap"
                                    >
                                       <span className="material-symbols-outlined !text-[14px]">delete</span>
                                       <span>{t("lexicon_purge_keys") || "Purge Keys"} ({validationStats.deprecated})</span>
                                    </button>
                                 ) : validationStats.completelyMissing > 0 ? (
                                    <button
                                       onClick={addMissingStrings}
                                       className="ml-2 bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[9px] font-black uppercase tracking-widest px-4 py-2 rounded-full transition-all flex items-center gap-1.5 shadow-md active:scale-95 whitespace-nowrap"
                                    >
                                       <span className="material-symbols-outlined !text-[14px]">add_circle</span>
                                       <span>{t("lexicon_add_missing") || "Add Missing Keys"}</span>
                                    </button>
                                 ) : (
                                    <button
                                       onClick={jumpToNextEmpty}
                                       className="ml-2 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[9px] font-black uppercase tracking-widest px-4 py-2 rounded-full transition-all flex items-center gap-1.5 shadow-md active:scale-95 whitespace-nowrap"
                                    >
                                       <span>{t("lexicon_next_empty") || "Next Empty"}</span>
                                       <span className="material-symbols-outlined !text-[14px]">arrow_downward</span>
                                    </button>
                                 )}
                              </>
                           ) : null}
                        </div>
                     )}
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
                              scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 }
                           }}
                        />
                     )}
                  </div>

                  {(showReference && isLexiconActive) && (
                     <>
                        <div
                           onMouseDown={(e) => { e.preventDefault(); isResizing.current = true; document.body.style.cursor = 'col-resize'; }}
                           className="w-4 cursor-col-resize hover:bg-[var(--accent)]/10 active:bg-[var(--accent)]/20 transition-colors z-50 flex items-center justify-center -ml-2 mr-2 relative group shrink-0"
                        >
                           <div className="w-[2px] h-12 bg-[var(--text)]/20 group-hover:bg-[var(--accent)] transition-colors rounded-full" />
                        </div>
                        <div style={{ width: `${100 - splitRatio}%` }} className="flex-1 relative h-full min-w-0 border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] pl-2 transition-none">
                           <div className="absolute top-4 right-6 z-10 theme-glass-panel px-4 py-1.5 rounded-full border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[10px] font-black tracking-widest uppercase text-[var(--subtext)] shadow-md">{referenceLabel}</div>
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
                              options={{ contextmenu: false, readOnly: true, minimap: { enabled: false }, fontSize: 13, fontFamily: "var(--font-mono)", padding: { top: 24, bottom: 24 } }}
                           />
                        </div>
                     </>
                  )}
               </div>

               {problemsList.length > 0 && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 max-w-2xl w-[90%] bg-[color-mix(in_srgb,var(--bg)_85%,transparent)] backdrop-blur-2xl rounded-[var(--radius)] shadow-[0_30px_60px_rgba(0,0,0,0.8)] border border-[color-mix(in_srgb,var(--danger)_60%,transparent)] overflow-hidden animate-in slide-in-from-bottom-10 z-[100] flex flex-col max-h-72">
                     <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--danger)]/30 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] shrink-0">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--danger)] flex items-center gap-2 drop-shadow-md">
                           <span className="material-symbols-outlined !text-[16px]">{t("icon_error")}</span>
                           {t("problems")} ({problemsList.length})
                        </span>
                        <button onClick={() => setProblemsList([])} className="w-6 h-6 rounded-full flex items-center justify-center text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] transition-colors">
                           <span className="material-symbols-outlined !text-[14px]">{t("icon_close")}</span>
                        </button>
                     </div>
                     <div className="p-2 flex flex-col gap-1 overflow-y-auto custom-scrollbar relative z-10">
                        {problemsList.map((p: any, i: number) => (
                           <div key={i} onClick={() => { if (editorRef) { editorRef.revealLineInCenter(p.line); editorRef.setPosition({ lineNumber: p.line, column: p.column }); editorRef.focus(); } }} className="flex items-start gap-4 px-4 py-3 rounded-xl hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] cursor-pointer group transition-colors">
                              <span className="material-symbols-outlined !text-[16px] text-[var(--danger)] mt-0.5">{t("nav_cancel")}</span>
                              <div className="flex flex-col gap-0.5 min-w-0">
                                 <span className="text-[11px] font-mono font-bold text-[var(--text)] group-hover:text-[var(--danger)] transition-colors whitespace-normal break-words">{p.message}</span>
                                 <span className="text-[9px] text-[var(--subtext)] font-mono uppercase tracking-widest opacity-60">{t("auto_ln")} {p.line}{t("auto_col")} {p.column}</span>
                              </div>
                           </div>
                        ))}
                     </div>
                  </div>
               )}
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
