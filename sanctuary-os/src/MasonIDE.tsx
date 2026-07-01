import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import Editor from "@monaco-editor/react";
import { useStore } from "./store";
import { useLexicon } from "./LexiconContext";
import { ViewHeader, SidePanel, CustomDropdown, standardButtonClass } from "./shared";
import { readDir, readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs';
import { open } from "@tauri-apps/plugin-dialog";
import VersionTimeline from './VersionTimeline';

export default function MasonIDE({ vaultPath }: { vaultPath?: string }) {
  const { t } = useLexicon();
  const pushStatus = useStore(state => state.pushStatus);
  const openFiles = useStore(state => state.ideOpenFiles);
  const setOpenFiles = useStore(state => state.setIdeOpenFiles);
  const activeFileIndex = useStore(state => state.ideActiveFileIndex);
  const setActiveFileIndex = useStore(state => state.setIdeActiveFileIndex);
  const [files, setFiles] = useState<{name: string, path: string}[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [fileTypeFilter, setFileTypeFilter] = useState("all");
  const [problemsList, setProblemsList] = useState<any[]>([]);
  const [editorRef, setEditorRef] = useState<any>(null);
  
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
             if (n.endsWith('.json') || n.endsWith('.cfg') || n.endsWith('.ini') || n.endsWith('.js') || n.endsWith('.ts') || n.endsWith('.xml') || n.endsWith('.txt') || n.endsWith('.md')) {
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
            'scrollbarSlider.background': '#ffffff00',
            'scrollbarSlider.hoverBackground': '#ffffff10',
            'scrollbarSlider.activeBackground': '#ffffff20',
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
            'scrollbarSlider.background': '#00000000',
            'scrollbarSlider.hoverBackground': '#00000010',
            'scrollbarSlider.activeBackground': '#00000020',
          }
      });
  };

  const validateContent = (text: string, monaco: any, model: any) => {
      let problems: any[] = [];
      let markers: any[] = [];
      const activeFile = openFiles[activeFileIndex];
      const isJson = activeFile?.name.endsWith('.json') || (activeFile?.content && (activeFile.content.trim().startsWith('{') || activeFile.content.trim().startsWith('[')));
      
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
           pushStatus(t("ide_err_open"), "error");
        }
     }
  };

  const closeFile = (index: number, e: React.MouseEvent) => {
     e.stopPropagation();
     const file = openFiles[index];
     if (file.content !== file.originalContent) {
        if (!confirm(t("ide_confirm_close"))) return;
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
         // The backend database keys paths with backslashes on Windows.
         const normalizedPath = file.path.replace(/\//g, '\\');
         await invoke('save_file_with_history', { path: normalizedPath, content: file.content });
         const newFiles = [...openFiles];
         newFiles[activeFileIndex].originalContent = file.content;
         setOpenFiles(newFiles);
         pushStatus(t("alert_saved"), "success");
      } catch (e) {
         pushStatus(t("alert_error"), "error");
      }
  };

  const handleImport = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [{ name: "Text Files", extensions: ["json", "cfg", "ini", "xml", "js", "ts", "md", "txt"] }]
      });
      if (selected) {
         if (!vaultPath) return;
         let baseDir = vaultPath.replace(/\\/g, '/');
         if (baseDir.toLowerCase().endsWith('/mods')) baseDir = baseDir.substring(0, baseDir.length - 5);
         else if (baseDir.toLowerCase().endsWith('mods')) baseDir = baseDir.substring(0, baseDir.length - 4);
         const sandboxDir = `${baseDir}/Dev/Sandbox`;
         
         const paths = Array.isArray(selected) ? selected : [selected];
         for (const file of paths) {
            const content = await readTextFile(file);
            const fileName = file.substring(file.lastIndexOf('/') + 1).substring(file.lastIndexOf('\\') + 1);
            await writeTextFile(`${sandboxDir}/${fileName}`, content);
         }
         pushStatus(t("ide_import_success"), "success");
         fetchFiles();
      }
    } catch (e) {
      console.error(e);
      pushStatus(t("ide_import_failed"), "error");
    }
  };

  const activeFile = activeFileIndex >= 0 ? openFiles[activeFileIndex] : null;
  const isDirty = activeFile ? activeFile.content !== activeFile.originalContent : false;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 min-h-[800px] h-[calc(100vh-250px)] w-full pb-12 relative">      
      
      {/* Title Area matching MasonHub Tab Headers */}
      <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-white/5 relative z-10">
        <h2 className="text-xl font-black text-[var(--text)] uppercase tracking-widest flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("ui_icon_code")}</span>
          </div>
          <span className="truncate">{t("masonhub_ide_title")}</span>
        </h2>
        
        <div className="flex items-center gap-3 relative flex-1 ml-auto justify-end">
            {/* Search Input */}
            <div className="relative flex-1 max-w-[300px]">
               <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 !text-sm">{t("ui_icon_search")}</span>
               <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={t("ide_search_files")}
                  className="w-full theme-glass-panel rounded-2xl pl-10 pr-10 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
               />
            </div>
            
            {/* Dropdown for File Type */}
            <div className="w-40 shrink-0 relative z-50 h-12">
               <CustomDropdown 
                  disableTint={true}
                  options={[
                     { id: "all", label: "ALL FILES" },
                     { id: "json", label: "JSON DATA" },
                     { id: "cfg", label: "CONFIG (.CFG)" },
                     { id: "ini", label: "SETTINGS (.INI)" }
                  ]}
                  value={fileTypeFilter}
                  onChange={(val: string[]) => setFileTypeFilter(val[0])}
                  placeholder={t("auto_file_type")}
               />
            </div>

            <button onClick={handleImport} className="h-12 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-105 shadow-lg font-black uppercase tracking-widest text-[10px] group">
               <span className="material-symbols-outlined !text-[16px] group-hover:-translate-y-1 transition-transform duration-500">{t("ui_icon_upload")}</span> 
               {t("ide_import_file")}
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative px-6 flex flex-col">
          {/* Main Grid View */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6">


             {files.length === 0 ? (
                <div className="flex flex-col items-center justify-center opacity-50 gap-6 p-12 mt-20">
                    <div className="w-24 h-24 rounded-[2rem] theme-glass-panel flex items-center justify-center shadow-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                      <span className="material-symbols-outlined !text-5xl text-[var(--text)]">{t("auto_folder_off")}</span>
                    </div>
                    <span className="text-2xl font-black uppercase tracking-[0.3em]">{t("masonhub_ide_title")}</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest opacity-70 text-center max-w-sm leading-relaxed">[{t("ide_no_files_found")}]<br/>{t("ide_place_files")}</span>
                </div>
             ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
                   {files.filter(f => {
                       if (searchQuery && !f.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
                       if (fileTypeFilter !== "all" && !f.name.toLowerCase().endsWith(`.${fileTypeFilter}`)) return false;
                       return true;
                   }).map(file => {
                      const isTmpl = file.name.toLowerCase().endsWith('.json');
                      return (
                         <div key={file.path} className="group relative break-inside-avoid">
                           <button 
                             onClick={() => openFile(file)}
                             className={`w-full text-left p-6 rounded-[2rem] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_20px_40px_rgba(0,0,0,0.3)] flex flex-col gap-4 relative group-hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] ${openFiles.find(o => o.path === file.path && o.content !== o.originalContent) ? 'border border-amber-500/30 text-amber-500 bg-amber-500/10 hover:bg-amber-500/20 hover:border-amber-500/50 backdrop-blur-[3px] shadow-[0_8px_32px_rgba(245,158,11,0.15)]' : 'border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]'}`}
                           >
                              <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-br from-[var(--accent)]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                              {openFiles.find(o => o.path === file.path && o.content !== o.originalContent) && (
                                 <div className="absolute top-6 right-6 flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-[var(--warning)] bg-[var(--warning)]/20 border border-[var(--warning)]/40 px-3 py-1.5 rounded-full shadow-lg z-20 pointer-events-none backdrop-blur-xl">
                                    <span className="material-symbols-outlined !text-[12px]">{t("auto_warning")}</span>
                                    {t("workbench_unsaved_changes")}
                                 </div>
                              )}
                              <div className="w-12 h-12 rounded-2xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] flex items-center justify-center border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner group-hover:border-[var(--accent)]/50 transition-colors relative z-10">
                                 <span className="material-symbols-outlined !text-2xl text-[var(--subtext)] group-hover:text-[var(--accent)] transition-colors">{isTmpl ? "data_object" : "description"}</span>
                              </div>
                              <div className="flex flex-col gap-1 z-10 pr-10 text-left">
                                 <span className="text-sm font-black text-[var(--text)] tracking-wider truncate block">{file.name}</span>
                                 <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtext)] opacity-60 block">{isTmpl ? "JSON File" : "Source File"}</span>
                              </div>
                           </button>
                         </div>
                      )
                   })}
                </div>
             )}
          </div>
      </div>

      {/* IDE SIDE PANEL */}
      <SidePanel
         isOpen={!!activeFile}
         onClose={() => setActiveFileIndex(-1)}
         title={activeFile?.name || ""}
         subtitle={activeFile?.name?.endsWith('.json') ? (t("workbench_template_architect")) : (t("workbench_tab_raw"))}
         icon="code"
         iconColorClass="theme-text-accent"
         isResizable={true}
         defaultWidth={1000}
         headerActions={
           <button 
             onClick={() => setShowTimeline(true)} 
             disabled={!activeFile}
             className="h-12 px-6 rounded-2xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-[10px] font-black uppercase tracking-widest transition-all hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] hover:shadow-xl hover:scale-105 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:scale-100 disabled:pointer-events-none mr-2 backdrop-blur-md"
           >
             <span className="material-symbols-outlined !text-[18px]">{t("auto_history")}</span>
             {t("workbench_btn_timeline")}
           </button>
         }
         footer={
            <div className="flex items-center justify-center gap-3 w-full shrink-0">
               <div className="relative group">
                 {isDirty && (
                   <div className="absolute -top-10 left-1/2 -translate-x-1/2 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-[var(--warning)] whitespace-nowrap bg-[var(--bg)]/90 px-3 py-1.5 rounded-full border border-[var(--warning)]/40 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg backdrop-blur-xl">
                      <span className="material-symbols-outlined !text-[12px]">{t("auto_warning")}</span>
                      {t("workbench_unsaved_changes")}
                   </div>
                 )}

                 <button 
                   onClick={saveFile} 
                   disabled={!activeFile || !isDirty}
                   className={
                      isDirty
                        ? standardButtonClass.replace('bg-[color-mix(in_srgb,var(--text)_5%,transparent)]', 'bg-[color-mix(in_srgb,var(--warning)_15%,transparent)]').replace('border-[color-mix(in_srgb,var(--text)_10%,transparent)]', 'border-[color-mix(in_srgb,var(--warning)_50%,transparent)] text-[var(--warning)] shadow-[0_0_20px_color-mix(in_srgb,var(--warning)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--warning)_25%,transparent)] hover:shadow-[0_5px_20px_rgba(245,158,11,0.4)]')
                        : standardButtonClass
                   }
                 >
                   <span className="material-symbols-outlined !text-[18px]">{t("workbench_icon_save")}</span>
                   {t("workbench_btn_save")}
                 </button>
               </div>
            </div>
         }
      >
         <div className="flex flex-col h-full relative">
            <div className="flex flex-col relative z-20 shrink-0 px-6 pt-6 pb-2 pointer-events-none">
                <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar p-2 shrink-0 theme-glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-[0_10px_30px_rgba(0,0,0,0.3)] w-full pointer-events-auto">
                    {openFiles.map((file, i) => {
                        const isActive = activeFileIndex === i;
                        const isDirty = file.content !== file.originalContent;
                        return (
                            <div key={file.path} onClick={() => setActiveFileIndex(i)} className={`h-10 px-5 flex items-center gap-3 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all whitespace-nowrap cursor-pointer group shrink-0 ${
                                isActive 
                                   ? (isDirty ? 'bg-amber-500/10 border border-amber-500/50 text-amber-500 shadow-[inset_0_0_20px_rgba(245,158,11,0.15)]' : 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_50%,transparent)] text-[var(--accent)] shadow-[inset_0_0_20px_color-mix(in_srgb,var(--accent)_10%,transparent)]') 
                                   : (isDirty ? 'text-amber-500/70 border border-amber-500/30 hover:border-amber-500/50 hover:text-amber-500 bg-amber-500/5' : 'text-[var(--subtext)] border border-transparent hover:text-[var(--text)] hover:bg-white/5 opacity-70 hover:opacity-100')
                            }`}>
                                <span className={`material-symbols-outlined !text-[16px] ${isActive && !isDirty ? 'text-[var(--accent)]' : (isDirty ? 'text-amber-500' : 'text-[var(--subtext)]')}`}>
                                    {file.name.endsWith('.json') ? 'data_object' : 'description'}
                                </span>
                                <span>{file.name}</span>
                                <button onClick={(e) => closeFile(i, e)} className={`material-symbols-outlined !text-[16px] p-0.5 rounded-lg transition-colors ml-1 ${isActive ? (isDirty ? 'text-amber-500 hover:bg-amber-500/20' : 'text-[var(--accent)] hover:bg-[var(--accent)]/20') : 'text-transparent group-hover:text-[var(--subtext)] hover:!text-[var(--danger)] hover:!bg-[var(--danger)]/20'}`}>{t("auto_close")}</button>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="flex-1 relative">
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
                       }}
                       options={{
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
            
            {problemsList.length > 0 && (
               <div className="absolute bottom-4 left-1/2 -translate-x-1/2 max-w-2xl w-[90%] bg-[color-mix(in_srgb,var(--bg)_85%,transparent)] backdrop-blur-2xl rounded-[2rem] shadow-[0_30px_60px_rgba(0,0,0,0.8)] border border-[color-mix(in_srgb,var(--danger)_60%,transparent)] overflow-hidden animate-in slide-in-from-bottom-10 z-[100] flex flex-col max-h-72">
                 <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--danger)]/30 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] shrink-0">
                   <span className="text-[10px] font-black uppercase tracking-widest text-[var(--danger)] flex items-center gap-2 drop-shadow-md">
                     <span className="material-symbols-outlined !text-[16px]">{t("auto_error")}</span>
                     {t("ide_problems")} ({problemsList.length})
                   </span>
                   <button onClick={() => setProblemsList([])} className="w-6 h-6 rounded-full flex items-center justify-center text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] transition-colors">
                     <span className="material-symbols-outlined !text-[14px]">{t("auto_close")}</span>
                   </button>
                 </div>
                 <div className="p-2 flex flex-col gap-1 overflow-y-auto custom-scrollbar relative z-10">
                   {problemsList.map((p: any, i: number) => (
                     <div key={i} onClick={() => { if (editorRef) { editorRef.revealLineInCenter(p.line); editorRef.setPosition({ lineNumber: p.line, column: p.column }); editorRef.focus(); } }} className="flex items-start gap-4 px-4 py-3 rounded-xl hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] cursor-pointer group transition-colors">
                       <span className="material-symbols-outlined !text-[16px] text-[var(--danger)] mt-0.5">{t("auto_cancel")}</span>
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
            filePath={activeFile.path.replace(/\//g, '\\')}
            hasUnsavedChanges={activeFile.content !== activeFile.originalContent}
            onRestore={(content) => {
               setOpenFiles(prev => prev.map((f, i) => i === activeFileIndex ? { ...f, content } : f));
               if (editorRef && (window as any).monaco) {
                  validateContent(content, (window as any).monaco, editorRef.getModel());
               }
            }}
            onClose={() => setShowTimeline(false)}
         />
      )}
    </div>
  );
}
