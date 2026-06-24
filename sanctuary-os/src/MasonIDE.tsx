import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import Editor from "@monaco-editor/react";
import { useStore } from "./store";
import { useLexicon } from "./LexiconContext";
import { ViewHeader } from "./shared";
import { readDir, readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs';

export default function MasonIDE({ vaultPath }: { vaultPath?: string }) {
  const { t } = useLexicon();
  const pushStatus = useStore(state => state.pushStatus);
  const [files, setFiles] = useState<{name: string, path: string}[]>([]);
  const [openFiles, setOpenFiles] = useState<{name: string, path: string, content: string, originalContent: string}[]>([]);
  const [activeFileIndex, setActiveFileIndex] = useState(-1);
  const [isScanning, setIsScanning] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [problemsList, setProblemsList] = useState<any[]>([]);
  const [editorRef, setEditorRef] = useState<any>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const bg = getComputedStyle(document.body).getPropertyValue('--bg').trim();
  const bgHex = bg.replace('#', '');
  const r = parseInt(bgHex.substring(0, 2), 16) || 0;
  const g = parseInt(bgHex.substring(2, 4), 16) || 0;
  const b = parseInt(bgHex.substring(4, 6), 16) || 0;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const isLight = luminance > 0.5;

  const fetchFiles = async () => {
    setIsScanning(true);
    try {
      if (!vaultPath) return;
      const normalizedVault = vaultPath.replace(/\\/g, '/');
      let baseDir = normalizedVault;
      if (baseDir.toLowerCase().endsWith('/mods')) {
        baseDir = baseDir.substring(0, baseDir.length - 5);
      } else if (baseDir.toLowerCase().endsWith('mods')) {
        baseDir = baseDir.substring(0, baseDir.length - 4);
      }
      const sandboxDir = `${baseDir}/Dev/Sandbox`;
      
      const dirExists = await exists(sandboxDir);
      if (!dirExists) {
         setFiles([]);
         return;
      }

      const entries = await readDir(sandboxDir);
      const foundFiles: {name: string, path: string}[] = [];
      for (const entry of entries) {
         if (!entry.isDirectory && entry.name) {
             const n = entry.name.toLowerCase();
             if (n.endsWith('.json') || n.endsWith('.cfg') || n.endsWith('.ini') || n.endsWith('.js') || n.endsWith('.ts') || n.endsWith('.xml')) {
                 foundFiles.push({ name: entry.name, path: `${sandboxDir}/${entry.name}` });
             }
         }
      }
      
      foundFiles.sort((a, b) => a.name.localeCompare(b.name));
      setFiles(foundFiles);
    } catch (e) {
       console.error("Error reading sandbox:", e);
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, [vaultPath]);

  const handleEditorWillMount = (monaco: any) => {
      monaco.editor.defineTheme('sanctuary-glass-dark', {
          base: 'vs-dark',
          inherit: true,
          rules: [
            { token: 'string', foreground: '#e2e8f0' }, 
            { token: 'string.key.json', foreground: '#38bdf8' }, 
            { token: 'string.value.json', foreground: '#f8fafc' }, 
            { token: 'keyword', foreground: '#38bdf8' }, 
            { token: 'number', foreground: '#a78bfa' }, 
            { token: 'boolean', foreground: '#818cf8' }, 
            { token: 'comment', foreground: '#64748b', fontStyle: 'italic' }, 
            { token: 'type', foreground: '#2dd4bf' }, 
            { token: 'identifier', foreground: '#f8fafc' }, 
          ],
          colors: {
            'editor.background': '#00000000',
            'editor.lineHighlightBackground': '#ffffff0a',
            'editorLineNumber.foreground': '#ffffff40',
            'editorLineNumber.activeForeground': '#38bdf8',
            'editorIndentGuide.background': '#ffffff10',
            'editorSuggestWidget.background': '#0f172a',
            'editorSuggestWidget.border': '#334155',
            'minimap.background': '#00000000',
            'minimapSlider.background': '#ffffff10',
            'minimapSlider.hoverBackground': '#ffffff20',
            'minimapSlider.activeBackground': '#ffffff30',
          }
      });
      monaco.editor.defineTheme('sanctuary-glass-light', {
          base: 'vs',
          inherit: true,
          rules: [
            { token: 'string', foreground: '#475569' }, 
            { token: 'string.key.json', foreground: '#0284c7' }, 
            { token: 'string.value.json', foreground: '#0f172a' }, 
            { token: 'keyword', foreground: '#0284c7' }, 
            { token: 'number', foreground: '#7c3aed' }, 
            { token: 'boolean', foreground: '#4f46e5' }, 
            { token: 'comment', foreground: '#94a3b8', fontStyle: 'italic' }, 
            { token: 'type', foreground: '#0d9488' }, 
            { token: 'identifier', foreground: '#0f172a' }, 
          ],
          colors: {
            'editor.background': '#00000000',
            'editor.lineHighlightBackground': '#0000000a',
            'editorLineNumber.foreground': '#00000040',
            'editorLineNumber.activeForeground': '#0284c7',
            'editorIndentGuide.background': '#00000010',
            'editorSuggestWidget.background': '#f8fafc',
            'editorSuggestWidget.border': '#cbd5e1',
            'minimap.background': '#00000000',
            'minimapSlider.background': '#00000010',
            'minimapSlider.hoverBackground': '#00000020',
            'minimapSlider.activeBackground': '#00000030',
          }
      });
  };

  const validateContent = (text: string, monaco: any, model: any) => {
      let problems: any[] = [];
      let markers: any[] = [];
      const activeFile = openFiles[activeFileIndex];
      const isJson = activeFile?.name.endsWith('.json');
      
      if (isJson) {
        try {
          JSON.parse(text);
        } catch (err: any) {
          const match = err.message.match(/at position (\d+)/);
          let line = 1;
          let col = 1;
          if (match && model) {
             const pos = parseInt(match[1], 10);
             const p = model.getPositionAt(pos);
             line = p.lineNumber;
             col = p.column;
          }
          problems.push({ line, column: col, message: err.message });
          markers.push({
             startLineNumber: line,
             startColumn: col,
             endLineNumber: line,
             endColumn: col + 1,
             message: err.message,
             severity: monaco.MarkerSeverity.Error
          });
        }
      }
      if (model && monaco) {
         monaco.editor.setModelMarkers(model, 'owner', markers);
      }
      setProblemsList(problems);
  };

  const openFile = async (file: {name: string, path: string}) => {
     const idx = openFiles.findIndex(f => f.path === file.path);
     if (idx >= 0) {
        setActiveFileIndex(idx);
     } else {
        try {
           const content = await readTextFile(file.path);
           setOpenFiles([...openFiles, { ...file, content, originalContent: content }]);
           setActiveFileIndex(openFiles.length);
        } catch (e) {
           pushStatus(t("ide_err_open") || "Failed to open file.", "error");
        }
     }
  };

  const closeFile = (index: number, e: React.MouseEvent) => {
     e.stopPropagation();
     const file = openFiles[index];
     if (file.content !== file.originalContent) {
        if (!confirm(t("ide_confirm_close") || "You have unsaved changes. Discard?")) return;
     }
     const newFiles = [...openFiles];
     newFiles.splice(index, 1);
     setOpenFiles(newFiles);
     if (activeFileIndex >= index) {
        setActiveFileIndex(Math.max(-1, activeFileIndex - 1));
     }
  };

  const handleEditorChange = (value: string | undefined) => {
      if (value === undefined || activeFileIndex < 0) return;
      const newFiles = [...openFiles];
      newFiles[activeFileIndex].content = value;
      setOpenFiles(newFiles);
      if (editorRef && (window as any).monaco) {
         validateContent(value, (window as any).monaco, editorRef.getModel());
      }
  };

  const saveFile = async () => {
      if (activeFileIndex < 0) return;
      const file = openFiles[activeFileIndex];
      try {
         await writeTextFile(file.path, file.content);
         const newFiles = [...openFiles];
         newFiles[activeFileIndex].originalContent = file.content;
         setOpenFiles(newFiles);
         pushStatus(t("alert_saved") || "File Saved", "success");
      } catch (e) {
         pushStatus(t("alert_error") || "Failed to save file.", "error");
      }
  };

  const activeFile = activeFileIndex >= 0 ? openFiles[activeFileIndex] : null;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 h-full w-full overflow-y-auto custom-scrollbar pb-12 pr-4">      
      
      <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
        <h2 className="text-xl font-black text-[var(--text)] uppercase tracking-widest flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[24px] text-[var(--accent)] drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)] opacity-90">{t("ui_icon_code") || "code"}</span>
          </div>
          <span className="truncate">{t("masonhub_ide_title") || "MASON IDE"}</span>
        </h2>
      </div>

      <div className="flex flex-col xl:flex-row gap-8 w-full max-w-[1800px] min-h-[800px] mx-auto px-6">
          {/* SIDEBAR - Floating Card */}
          <div className={`shrink-0 flex flex-col theme-glass-panel rounded-[2rem] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-2xl relative overflow-hidden h-[800px] xl:h-auto transition-all duration-500 ease-in-out ${isSidebarCollapsed ? 'w-full xl:w-[88px]' : 'w-full xl:w-[340px]'}`}>
             <div className="flex items-center justify-between px-6 py-5 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 bg-[color-mix(in_srgb,var(--text)_2%,transparent)] backdrop-blur-md">
                <div className={`flex items-center gap-3 transition-opacity duration-300 ${isSidebarCollapsed ? 'opacity-0 w-0 hidden xl:flex xl:invisible' : 'opacity-100'}`}>
                    <span className="material-symbols-outlined !text-lg text-[var(--accent)] drop-shadow-sm">{t("ui_icon_folder_special") || "folder_special"}</span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] whitespace-nowrap">{t("ide_explorer_title") || "Sandbox Explorer"}</span>
                </div>
                <div className="flex items-center gap-2">
                   {!isSidebarCollapsed && (
                      <button onClick={fetchFiles} className="text-[var(--subtext)] hover:text-[var(--accent)] transition-colors p-1.5 rounded-lg hover:bg-white/5">
                          <span className={`material-symbols-outlined !text-sm ${isScanning ? 'animate-spin' : ''}`}>refresh</span>
                      </button>
                   )}
                   <button onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} className="shrink-0 p-1.5 rounded-lg hover:bg-white/10 text-[var(--subtext)] hover:text-[var(--text)] transition-colors hidden xl:flex">
                      <span className="material-symbols-outlined !text-xl">{isSidebarCollapsed ? 'keyboard_double_arrow_right' : 'keyboard_double_arrow_left'}</span>
                   </button>
                </div>
             </div>
             
             <div className="flex-1 flex flex-col min-h-0 overflow-y-auto custom-scrollbar p-5">
                {!isSidebarCollapsed && (
                   <div className="mb-5 shrink-0 flex flex-col gap-2">
                      <div className="relative">
                         <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[var(--subtext)] !text-sm">search</span>
                         <input
                           type="text"
                           placeholder={t("workbench_search_files") || "Search Sandbox..."}
                           value={searchQuery}
                           onChange={(e) => setSearchQuery(e.target.value)}
                           className="w-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl pl-9 pr-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-[var(--text)] focus:border-[var(--accent)] focus:bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] focus:outline-none transition-all shadow-inner"
                         />
                      </div>
                   </div>
                )}

                <div className="flex flex-col gap-1.5">
                  {isScanning && !isSidebarCollapsed && <div className="text-center p-4 text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-50 animate-pulse">{t("workbench_status_scanning") || "Scanning..."}</div>}
                  {files.length === 0 && !isScanning && !isSidebarCollapsed && (
                      <div className="flex flex-col items-center justify-center py-10 opacity-30 gap-4">
                        <span className="material-symbols-outlined !text-4xl text-[var(--subtext)]">folder_off</span>
                        <div className="text-center text-[10px] font-mono uppercase tracking-widest leading-relaxed text-[var(--text)]">
                          [{t("ide_no_files_found") || "NO EDITABLE FILES"}]<br/>{t("ide_place_files") || "PLACE FILES IN SANDBOX"}
                        </div>
                      </div>
                  )}
                  {files.filter(f => !searchQuery || f.name.toLowerCase().includes(searchQuery.toLowerCase())).map(file => {
                    const isSelected = activeFile?.path === file.path;
                    const isOpen = openFiles.some(of => of.path === file.path);
                    return (
                      <button key={file.path} onClick={() => openFile(file)} className={`w-full text-left ${isSidebarCollapsed ? 'px-0 justify-center' : 'px-4'} py-3.5 rounded-[1rem] flex items-center gap-3 transition-all border group ${isSelected ? 'theme-glass-panel border-[var(--accent)]/30 !bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] shadow-[inset_0_0_20px_rgba(var(--accent-rgb),0.1)] backdrop-blur-md' : 'theme-glass-panel border-transparent text-[var(--subtext)] hover:text-[var(--text)] hover:border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:shadow-md hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>
                          <span className={`material-symbols-outlined !text-[16px] shrink-0 ${isSelected ? 'text-[var(--accent)]' : 'opacity-50 group-hover:text-[var(--accent)] group-hover:opacity-100 transition-colors'}`}>
                            {file.name.endsWith('.json') ? 'data_object' : file.name.endsWith('.ts') ? 'typescript' : file.name.endsWith('.js') ? 'javascript' : 'description'}
                          </span>
                          {!isSidebarCollapsed && (
                             <span className="text-[10px] font-black uppercase tracking-widest truncate flex-1">{file.name}</span>
                          )}
                          {!isSidebarCollapsed && isOpen && !isSelected && <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] ml-auto shadow-[0_0_5px_rgba(var(--accent-rgb),0.8)]"></div>}
                          {isSidebarCollapsed && isOpen && !isSelected && <div className="absolute right-2 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-[var(--accent)] shadow-[0_0_5px_rgba(var(--accent-rgb),0.8)]"></div>}
                       </button>
                     );
                  })}
                </div>
             </div>
          </div>

          {/* MAIN CANVAS - Floating Card */}
          <div className="flex-1 flex flex-col gap-6 min-w-0">
             
             {/* Floating Tabs Pill Header */}
             <div className="theme-glass-panel rounded-full border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-lg px-3 py-2 flex items-center gap-2 overflow-x-auto custom-scrollbar shrink-0 bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] backdrop-blur-2xl sticky top-0 z-40 h-16">
                 {openFiles.length === 0 ? (
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-50 px-6">{t("ide_no_tabs") || "NO OPEN FILES"}</span>
                 ) : (
                    <>
                       {openFiles.map((file, i) => {
                          const isActive = activeFileIndex === i;
                          const isDirty = file.content !== file.originalContent;
                          return (
                             <div key={file.path} onClick={() => setActiveFileIndex(i)} className={`h-full px-5 rounded-full flex items-center gap-3 shrink-0 cursor-pointer transition-all border ${isActive ? '!bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_10px_rgba(var(--accent-rgb),0.1)]' : 'border-transparent hover:!bg-[color-mix(in_srgb,var(--text)_2%,transparent)]'}`}>
                                <span className={`material-symbols-outlined !text-[14px] ${isActive ? 'text-[var(--accent)]' : 'text-[var(--subtext)]'}`}>
                                   {file.name.endsWith('.json') ? 'data_object' : 'description'}
                                </span>
                                <span className={`text-[10px] font-black uppercase tracking-widest ${isActive ? 'text-[var(--text)]' : 'text-[var(--subtext)]'}`}>{file.name}</span>
                                {isDirty && <div className="w-1.5 h-1.5 rounded-full bg-[var(--warning)] shadow-[0_0_5px_rgba(var(--warning-rgb),0.8)] animate-pulse"></div>}
                                <button onClick={(e) => closeFile(i, e)} className={`material-symbols-outlined !text-[12px] p-1 rounded-full transition-colors ml-1 ${isActive ? 'text-[var(--subtext)] hover:text-[var(--text)] hover:!bg-[color-mix(in_srgb,var(--text)_10%,transparent)]' : 'text-transparent group-hover:text-[var(--subtext)] hover:!text-[var(--danger)] hover:!bg-[var(--danger)]/10'}`}>close</button>
                             </div>
                          );
                       })}
                       
                       <div className="ml-auto px-4 flex items-center gap-4 border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                           <button 
                              onClick={saveFile} 
                              disabled={!activeFile || activeFile.content === activeFile.originalContent}
                              className="h-8 px-6 rounded-full bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-105 hover:shadow-[0_5px_15px_rgba(var(--accent-rgb),0.2)] transition-all flex items-center justify-center gap-2 font-black text-[9px] uppercase tracking-widest disabled:opacity-30 disabled:saturate-0 disabled:hover:scale-100 disabled:hover:shadow-none shrink-0"
                            >
                               <span className="material-symbols-outlined !text-[14px]">{t("workbench_icon_save") || "save"}</span>
                               {t("workbench_btn_save") || "SAVE"}
                            </button>
                       </div>
                    </>
                 )}
             </div>

             {/* Editor Panel Card */}
             <div className="flex-1 theme-glass-panel rounded-[2rem] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-2xl flex flex-col relative overflow-hidden min-h-[600px] bg-[color-mix(in_srgb,var(--bg)_60%,transparent)]">
                 {!activeFile ? (
                     <div className="flex-1 flex flex-col items-center justify-center opacity-50 gap-6 p-12">
                         <div className="w-24 h-24 rounded-[2rem] theme-glass-panel flex items-center justify-center shadow-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                           <span className="material-symbols-outlined !text-5xl text-[var(--text)]">code</span>
                         </div>
                         <span className="text-2xl font-black uppercase tracking-[0.3em]">{t("masonhub_ide_title") || "MASON IDE"}</span>
                         <span className="text-[10px] font-bold uppercase tracking-widest opacity-70 text-center max-w-sm leading-relaxed">[{t("ide_welcome_msg") || "Select an isolated sandbox matrix file to begin direct neural-code interface."}]</span>
                     </div>
                 ) : (
                    <div className="flex-1 flex flex-col relative min-h-0">
                       <div className="flex-1 relative p-4 flex flex-col">
                           <div className="flex-1 relative rounded-2xl overflow-hidden shadow-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
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
                                 }}
                                 options={{
                                   minimap: { enabled: true, scale: 0.75, renderCharacters: false },
                                   scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
                                   fontSize: 13,
                                   fontFamily: "var(--font-mono), Consolas, monospace",
                                   padding: { top: 24, bottom: 24 },
                                   smoothScrolling: true,
                                   cursorBlinking: "smooth"
                                 }}
                               />
                           </div>
                       </div>

                       {/* Problems Panel inside Editor Card */}
                       {problemsList.length > 0 && (
                           <div className="theme-glass-panel border-t border-[var(--danger)]/30 max-h-64 overflow-y-auto custom-scrollbar z-40 shrink-0">
                              <div className="flex items-center justify-between px-6 py-3 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] sticky top-0 bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] backdrop-blur-md">
                                <span className="text-[9px] font-black uppercase tracking-widest text-[var(--danger)] flex items-center gap-2">
                                  <span className="material-symbols-outlined !text-[12px]">error</span>
                                  {t("ide_problems") || "PROBLEMS"} ({problemsList.length})
                                </span>
                                <button onClick={() => setProblemsList([])} className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] hover:text-[var(--text)]">CLEAR</button>
                              </div>
                              <div className="p-2">
                                {problemsList.map((p, i) => (
                                  <div key={i} onClick={() => { if (editorRef) { editorRef.revealLineInCenter(p.line); editorRef.setPosition({ lineNumber: p.line, column: p.column }); editorRef.focus(); } }} className="flex items-start gap-3 px-4 py-2 rounded-lg hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] cursor-pointer group">
                                    <span className="material-symbols-outlined !text-[14px] text-[var(--danger)] mt-0.5">cancel</span>
                                    <div className="flex flex-col">
                                      <span className="text-[11px] font-mono text-[var(--text)] group-hover:text-[var(--accent)]">{p.message}</span>
                                      <span className="text-[9px] text-[var(--subtext)] font-mono uppercase opacity-60">[{p.line}, {p.column}]</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                           </div>
                       )}
                    </div>
                 )}
             </div>
          </div>
      </div>
    </div>
  );
}
