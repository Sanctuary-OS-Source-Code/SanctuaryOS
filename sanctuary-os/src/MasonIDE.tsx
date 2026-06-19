import { useState, useEffect, Fragment, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import Editor from "@monaco-editor/react";
import { useStore } from "./store";

import { useLexicon } from "./LexiconContext";

export default function MasonIDE({ vaultPath }: { vaultPath?: string }) {
  const { t } = useLexicon();
  const setStatus = useStore((state) => state.setStatus);
  const [files, setFiles] = useState<{ name: string; path: string }[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);

  // Multi-tab state management
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [tabContents, setTabContents] = useState<Map<string, string>>(new Map());
  const [originalContents, setOriginalContents] = useState<Map<string, string>>(new Map());
  const [pendingCloseTab, setPendingCloseTab] = useState<string | null>(null);
  
  // Custom height resizer state
  const [ideHeight, setIdeHeight] = useState(750);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      setIdeHeight((prev) => Math.max(400, prev + e.movementY));
    };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);
  
  // Problems panel state
  const [problemsList, setProblemsList] = useState<any[]>([]);
  const [problemsHeight, setProblemsHeight] = useState(150);
  const isDragging = useRef(false);
  const [editorRef, setEditorRef] = useState<any>(null);

  const fetchFiles = async () => {
    if (!vaultPath) return;
    try {
      // Replicate the Rust logic: if vaultPath ends with Mods, parent dir + Dev/Sandbox
      const normalizedVault = vaultPath.replace(/\\/g, '/');
      let baseDir = normalizedVault;
      if (baseDir.toLowerCase().endsWith('/mods')) {
        baseDir = baseDir.substring(0, baseDir.length - 5);
      } else if (baseDir.toLowerCase().endsWith('mods')) {
        baseDir = baseDir.substring(0, baseDir.length - 4);
      }
      const sandboxDir = `${baseDir}/Dev/Sandbox`;
      
      const entries = await invoke<string[]>("get_sandbox_files", { vaultPath });
      
      const editableFiles = entries
        .map(name => ({ name, path: `${sandboxDir}/${name}` }))
        .sort((a, b) => a.name.localeCompare(b.name));
        
      setFiles(editableFiles);
    } catch (err) {
      console.warn("Could not read Sandbox directory. It may not exist yet.");
    }
  };

  useEffect(() => {
    fetchFiles();
  }, [vaultPath]);

  const handleOpenFile = async (path: string) => {
    try {
      // Add to tabs if not already open
      if (!openTabs.includes(path)) {
        setOpenTabs(prev => [...prev, path]);
      }
      
      // Load content if not cached
      if (!tabContents.has(path)) {
        const content = await invoke<string>("read_config_file", { path });
        setTabContents(prev => new Map(prev).set(path, content));
        setOriginalContents(prev => new Map(prev).set(path, content));
      }
      
      // Set as active
      setActiveTab(path);
    } catch (err) {
      useStore.getState().pushStatus("Failed to open file. It may be binary or locked.", "error");
    }
  };

  const handleSwitchTab = (path: string) => {
    setActiveTab(path);
  };

  const handleCloseTab = (path: string) => {
    // Check for unsaved changes
    const currentContent = tabContents.get(path);
    const originalContent = originalContents.get(path);
    const isDirty = currentContent !== originalContent;
    
    if (isDirty) {
      setPendingCloseTab(path);
      return;
    }
    
    executeCloseTab(path);
  };

  const executeCloseTab = (path: string) => {
    // Remove from tabs
    const newTabs = openTabs.filter(t => t !== path);
    setOpenTabs(newTabs);
    
    // Remove from cache
    const newContents = new Map(tabContents);
    newContents.delete(path);
    setTabContents(newContents);
    
    const newOriginals = new Map(originalContents);
    newOriginals.delete(path);
    setOriginalContents(newOriginals);
    
    // Redirect focus
    if (activeTab === path) {
      const currentIndex = openTabs.indexOf(path);
      const nextTab = newTabs[currentIndex] || newTabs[currentIndex - 1] || null;
      setActiveTab(nextTab);
    }
    setPendingCloseTab(null);
  };
  const handleSaveFile = async () => {
    if (!activeTab) return;
    setIsSaving(true);
    try {
      const content = tabContents.get(activeTab) || "";
      await invoke("save_config_file", { path: activeTab, content });
      // Update original content after successful save
      setOriginalContents(prev => new Map(prev).set(activeTab, content));
      const fileName = activeTab.split(/[\\/]/).pop() || activeTab;
      useStore.getState().pushStatus(`[${fileName}] ${t("ide_save_success") || "FILE SAVED SUCCESSFULLY"}`, "success");
    } catch (err: any) {
      useStore.getState().pushStatus((t("ide_save_error") || "FAILED TO SAVE FILE") + ": " + err, "error");
    } finally {
      setIsSaving(false);
    }
  };

  const getLanguage = (path: string) => {
    if (path.endsWith(".js")) return "javascript";
    if (path.endsWith(".ts")) return "typescript";
    if (path.endsWith(".json")) return "json";
    if (path.endsWith(".xml")) return "xml";
    if (path.endsWith(".html")) return "html";
    if (path.endsWith(".css")) return "css";
    if (path.endsWith(".ini") || path.endsWith(".cfg")) return "ini";
    return "plaintext";
  };

  const validateContent = (value: string, model: any, monaco: any) => {
    const problems: any[] = [];
    const markers: any[] = [];
    
    // JSON / CFG validation
    if (activeTab?.endsWith('.json') || (activeTab?.endsWith('.cfg') && value.trim().startsWith('{'))) {
      try {
        JSON.parse(value);
      } catch (err: any) {
        let pos = 0;
        const match = err.message.match(/position (\d+)/);
        const matchLineCol = err.message.match(/line (\d+) column (\d+)/);
        
        if (match) {
          pos = parseInt(match[1]);
        }
        
        let position = { lineNumber: 1, column: 1 };
        if (pos > 0) {
          position = model.getPositionAt(pos);
        } else if (matchLineCol) {
          position = { lineNumber: parseInt(matchLineCol[1]), column: parseInt(matchLineCol[2]) };
        }
        
        problems.push({
          line: position.lineNumber,
          column: position.column,
          message: err.message
        });
        
        markers.push({
          startLineNumber: position.lineNumber,
          startColumn: Math.max(1, position.column - 1),
          endLineNumber: position.lineNumber,
          endColumn: position.column + 1,
          message: err.message,
          severity: monaco.MarkerSeverity.Error
        });
      }
    }
    
    // CFG/INI validation - check for common syntax errors
    if (activeTab?.endsWith('.cfg') || activeTab?.endsWith('.ini')) {
      const lines = value.split('\n');
      lines.forEach((line, idx) => {
        const lineNum = idx + 1;
        const trimmed = line.trim();
        
        // Skip empty lines, comments, and lines with only braces/brackets (valid block delimiters)
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';') || trimmed.startsWith('//')) return;
        if (trimmed === '{' || trimmed === '}' || trimmed === '[' || trimmed === ']') return;
        if (trimmed.endsWith('{') || trimmed.endsWith('}')) return; // Allow opening/closing blocks
        
        // Check for unclosed quotes
        const quoteCount = (line.match(/"/g) || []).length;
        if (quoteCount % 2 !== 0) {
          problems.push({
            line: lineNum,
            column: line.indexOf('"') + 1,
            message: 'Unclosed quote'
          });
          markers.push({
            startLineNumber: lineNum,
            startColumn: line.indexOf('"') + 1,
            endLineNumber: lineNum,
            endColumn: line.length + 1,
            message: 'Unclosed quote',
            severity: monaco.MarkerSeverity.Error
          });
        }
      });
    }
    
    monaco.editor.setModelMarkers(model, 'owner', markers);
    setProblemsList(problems);
  };

  const handleEditorWillMount = (monaco: any) => {
    const root = document.documentElement;
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim() || '#0f172a';
    const sidebar = getComputedStyle(root).getPropertyValue('--sidebar').trim() || '#1e293b';
    const accent = getComputedStyle(root).getPropertyValue('--accent').trim() || '#38bdf8';
    const text = getComputedStyle(root).getPropertyValue('--text').trim() || '#f1f5f9';
    const subtext = getComputedStyle(root).getPropertyValue('--subtext').trim() || '#94a3b8';
    const danger = getComputedStyle(root).getPropertyValue('--danger').trim() || '#ef4444';

    const bgHex = bg.replace('#', '');
    const r = parseInt(bgHex.substring(0, 2), 16) || 0;
    const g = parseInt(bgHex.substring(2, 4), 16) || 0;
    const b = parseInt(bgHex.substring(4, 6), 16) || 0;
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const isLight = luminance > 0.5;

    // Register custom language
    monaco.languages.register({ id: 'sanctuary-config' });
    
    // Define tokenization rules
    monaco.languages.setMonarchTokensProvider('sanctuary-config', {
      tokenizer: {
        root: [
          [/".*?"/, 'string'],
          [/'.*?'/, 'string'],
          [/\b(true|false)\b/, 'keyword'],
          [/\b\d+\b/, 'number'],
          [/[a-zA-Z_]\w*(?=\s*[:=])/, 'key'],
          [/#.*$/, 'comment'],
          [/\/\/.*$/, 'comment'],
          [/[\{\}\[\]\(\)]/, 'delimiter.bracket'],
          [/[,;:]/, 'delimiter'],
        ]
      }
    });

    // Light Theme
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
      }
    });

    // Dark Theme
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
  };

  // Safe OS theme check
  const bg = getComputedStyle(document.body).getPropertyValue('--bg').trim();
  const bgHex = bg.replace('#', '');
  const r = parseInt(bgHex.substring(0, 2), 16) || 0;
  const g = parseInt(bgHex.substring(2, 4), 16) || 0;
  const b = parseInt(bgHex.substring(4, 6), 16) || 0;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const isLight = luminance > 0.5;

  return (
    <div className="flex flex-col w-full relative theme-glass-panel rounded-lg border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-2xl overflow-hidden" style={{ height: `${ideHeight}px` }}>
      
      {/* Title Bar (Matches Sandbox Explorer exactly) */}
      <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-white/5">
        <h2 className="text-xl font-black text-[var(--text)] uppercase tracking-widest flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("ui_icon_code") || "code"}</span>
          </div>
          <span className="truncate">{t("masonhub_ide_title") || "MASON IDE"}</span>
        </h2>
        <div className="relative flex-1 max-w-xl ml-auto flex gap-4 items-center justify-end">
           <button 
             onClick={handleSaveFile} 
             disabled={isSaving || !activeTab}
             className={`shrink-0 px-6 h-12 theme-glass-panel border-white/5 hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)] text-[var(--text)] rounded-xl text-[11px] font-black uppercase tracking-[0.2em] hover:scale-[1.02] transition-all flex items-center gap-2 disabled:opacity-50`}
           >
              <span className={`material-symbols-outlined !text-lg ${isSaving ? 'animate-spin' : ''}`}>{t("ui_icon_save") || "save"}</span>
              {t("ide_save") || "Save Changes"}
           </button>
           <button 
             onClick={() => setIsSidebarVisible(!isSidebarVisible)}
             className={`shrink-0 w-12 h-12 flex items-center justify-center transition-all rounded-xl text-[11px] font-black uppercase tracking-[0.2em] hover:scale-[1.02] border border-white/5 ${isSidebarVisible ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] border-[var(--accent)]/50 shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)]' : 'theme-glass-panel hover:border-[var(--accent)]/50 hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:text-[var(--accent)] hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)] text-[var(--text)]'}`}
           >
              <span className="material-symbols-outlined !text-lg">{t("ui_icon_folder") || "folder"}</span>
           </button>
        </div>
      </div>

      {/* Unified Header (Tabs) */}
      <div className="flex items-center border-b border-white/5 bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] backdrop-blur-md shrink-0 px-4 py-3 z-[20]">
        <div className="flex-1 flex items-center overflow-x-auto accent-scrollbar gap-2">
          {activeTab && openTabs.length > 0 && (
            <>
              {openTabs.map((tabPath, index) => {
                      const fileName = tabPath.split(/[\\/]/).pop() || tabPath;
                      const isActive = activeTab === tabPath;
                      const isDirty = tabContents.get(tabPath) !== originalContents.get(tabPath);
                      
                      return (
                        <div
                          key={tabPath}
                          className={`group flex items-center gap-3 px-4 py-2 min-w-[120px] max-w-[200px] rounded-2xl transition-all cursor-pointer shrink-0 border ${
                            isActive 
                              ? 'theme-glass-inner text-[var(--text)] mx-1 z-10' 
                              : 'theme-glass-panel border-white/5 hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] hover:text-[var(--text)] text-[var(--subtext)] opacity-70 hover:opacity-100'
                          }`}
                          style={isActive ? { backgroundColor: 'color-mix(in srgb, var(--accent) 30%, transparent)', borderColor: 'color-mix(in srgb, var(--accent) 60%, transparent)', backdropFilter: 'blur(16px)' } : undefined}
                          onClick={() => handleSwitchTab(tabPath)}
                        >
                          <div className="flex flex-col max-w-[150px]">
                            <span className="text-[10px] font-black tracking-widest truncate uppercase">
                              {fileName}
                            </span>
                            {isDirty && <span className="text-[8px] font-bold opacity-70 tracking-widest uppercase">{t("ide_unsaved") || "Unsaved"}</span>}
                          </div>
                          
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCloseTab(tabPath);
                            }}
                            className={`w-5 h-5 flex items-center justify-center rounded-md transition-colors text-[10px] shrink-0 ${isActive ? 'hover:bg-white/10 text-[var(--text)] opacity-60 hover:opacity-100' : 'bg-transparent hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] opacity-0 group-hover:opacity-100'}`}
                          ><span className='material-symbols-outlined !text-[12px]'>{t("ui_icon_close") || "close"}</span></button>
                        </div>
                      );
                    })}
            </>
          )}
        </div>
      </div>
      
      {/* Main Workspace Split */}
      <div className="flex-1 flex min-h-0 bg-[color-mix(in_srgb,var(--bg)_20%,transparent)] relative">
        
        {/* Editor Pane */}
        <div className="flex-1 flex flex-col relative min-w-0">
          {activeTab ? (
            <>
              {/* Seamless Glass Editor Wrapper */}
              <div className="flex-1 relative overflow-hidden min-h-0 min-w-0">
                <div className="absolute inset-0">
                  <Editor
                    height="100%"
                    language={getLanguage(activeTab)}
                    theme={isLight ? "sanctuary-glass-light" : "sanctuary-glass-dark"}
                    beforeMount={handleEditorWillMount}
                      onMount={(editor, monaco) => {
                        setEditorRef(editor);
                        const model = editor.getModel();
                        if (model) {
                          validateContent(tabContents.get(activeTab) || "", model, monaco);
                        }
                      }}
                      value={tabContents.get(activeTab) || ""}
                      onChange={(val, event) => {
                        if (activeTab) {
                          setTabContents(prev => new Map(prev).set(activeTab, val || ""));
                          
                          if (editorRef) {
                            const model = editorRef.getModel();
                            const monaco = (window as any).monaco;
                            if (model && monaco) {
                              validateContent(val || "", model, monaco);
                            }
                          }
                        }
                      }}
                      options={{
                        minimap: { enabled: true },
                        fontSize: 13,
                        fontFamily: "var(--font-mono), Consolas, monospace",
                        padding: { top: 24, bottom: 24 },
                        lineDecorationsWidth: 16,
                        lineNumbersMinChars: 4,
                        scrollBeyondLastLine: false,
                        smoothScrolling: true,
                        cursorBlinking: "smooth",
                        formatOnPaste: true,
                        formatOnType: true,
                        suggestOnTriggerCharacters: true,
                        quickSuggestions: true,
                        lineHeight: 1.6,
                        renderLineHighlight: "all",
                        scrollbar: {
                          verticalScrollbarSize: 8,
                          horizontalScrollbarSize: 8,
                        }
                      }}
                    />
                </div>
              </div>
              {/* Problems Panel */}
              {problemsList.length > 0 && (
                <>
                  <div 
                    className="h-1 bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-[var(--accent)] cursor-row-resize shrink-0 transition-colors z-[50]"
                    onMouseDown={(e) => {
                      isDragging.current = true;
                      const startY = e.clientY;
                      const startHeight = problemsHeight;
                      const handleMouseMove = (moveEvent: MouseEvent) => {
                        if (!isDragging.current) return;
                        const delta = startY - moveEvent.clientY;
                        setProblemsHeight(Math.max(100, Math.min(startHeight + delta, 600)));
                      };
                      const handleMouseUp = () => {
                        isDragging.current = false;
                        document.removeEventListener('mousemove', handleMouseMove);
                        document.removeEventListener('mouseup', handleMouseUp);
                      };
                      document.addEventListener('mousemove', handleMouseMove);
                      document.addEventListener('mouseup', handleMouseUp);
                    }}
                  />
                  <div 
                    className="theme-glass-panel bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] backdrop-blur-md shrink-0 relative z-[40] flex flex-col"
                    style={{ height: `${problemsHeight}px` }}
                  >
                  <div className="flex items-center justify-between px-6 py-3 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--bg)_50%,transparent)]">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--danger)]">
                      [ {t("ide_problems") || "PROBLEMS"} ({problemsList.length}) ]
                    </span>
                    <button 
                      onClick={() => setProblemsList([])}
                      className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] hover:text-[var(--text)] transition-colors"
                    >
                      {t("ide_clear") || "CLEAR"}
                    </button>
                  </div>
                  <div className="max-h-48 overflow-y-auto custom-scrollbar">
                    {problemsList.map((problem, idx) => (
                      <div
                        key={idx}
                        onClick={() => {
                          if (editorRef) {
                            editorRef.revealLineInCenter(problem.line);
                            editorRef.setPosition({ lineNumber: problem.line, column: problem.column });
                            editorRef.focus();
                          }
                        }}
                        className="px-6 py-3 text-[10px] font-mono font-black tracking-widest uppercase text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] cursor-pointer transition-colors border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)]"
                      >
                        {t("ide_line") || "Line"} {problem.line}, {t("ide_col") || "Col"} {problem.column}: {problem.message}
                      </div>
                    ))}
                  </div>
                </div>
                </>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center relative z-[10] border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
              <div className="flex flex-col items-center gap-6 p-12 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] rounded-xl max-w-lg w-full text-center shadow-sm">
                <span className="material-symbols-outlined !text-5xl theme-text-accent opacity-50">{t("ui_icon_code") || "code"}</span>
                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-black text-[var(--text)] uppercase tracking-[0.4em]">{t("masonhub_ide_title") || "MASON IDE"}</h3>
                  <p className="text-[10px] font-mono text-[var(--subtext)] uppercase tracking-widest leading-relaxed">
                    [{t("ide_welcome_msg") || "Select an isolated sandbox matrix file to begin direct neural-code interface."}]
                  </p>
                </div>
                <button 
                  onClick={() => setIsSidebarVisible(true)}
                  className="mt-4 px-6 py-3 bg-[color-mix(in_srgb,var(--bg)_60%,transparent)] backdrop-blur-2xl border border-white/5 hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] hover:text-[var(--accent)] hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)] hover:-translate-y-0.5 text-[var(--text)] font-black text-[9px] uppercase tracking-[0.2em] rounded-xl transition-all duration-300 flex items-center gap-2"
                >
                  <span className="material-symbols-outlined !text-sm text-[var(--accent)]">{t("ui_icon_folder_open") || "folder_open"}</span>
                  {t("ide_open_explorer") || "Open Explorer"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Pane */}
        {isSidebarVisible && (
          <>
            <div className="w-[300px] shrink-0 border-l border-white/5 theme-glass-panel bg-[var(--accent)]/5 flex flex-col z-[10] shadow-[inset_1px_0_0_rgba(255,255,255,0.05)] overflow-hidden">
              <div className="flex justify-between items-center px-6 py-4 shrink-0 border-b border-white/5">
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text)] flex items-center gap-3">
                  <span className="material-symbols-outlined !text-lg theme-text-accent">{t("ui_icon_folder_special") || "folder_special"}</span>
                  {t("ide_explorer_title") || "Sandbox Explorer"}
                </h3>
                <div className="flex gap-2">
                   <button onClick={fetchFiles} className="w-8 h-8 flex items-center justify-center rounded-xl theme-glass-panel border-white/5 hover:border-[var(--accent)]/50 hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:text-[var(--accent)] hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)] transition-all text-[var(--subtext)]">
                      <span className="material-symbols-outlined !text-sm">{t("ui_icon_refresh") || "refresh"}</span>
                   </button>
                   <button onClick={() => setIsSidebarVisible(false)} className="w-8 h-8 flex items-center justify-center rounded-xl theme-glass-panel border-white/5 hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)] transition-all text-[var(--subtext)]">
                      <span className="material-symbols-outlined !text-sm">{t("ui_icon_close") || "close"}</span>
                   </button>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-2">
                {files.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full opacity-30 gap-4">
                    <span className="material-symbols-outlined !text-4xl text-[var(--subtext)]">{t("ui_icon_folder_off") || "folder_off"}</span>
                    <div className="text-center text-[10px] font-mono uppercase tracking-widest leading-relaxed text-[var(--text)]">
                      [{t("ide_no_files_found") || "No editable artifacts located."}]<br/>{t("ide_place_files") || "Place .js, .ts, .json, or .xml files in the Sandbox."}
                    </div>
                  </div>
                ) : (
                  files.map(file => {
                    const isActive = activeTab === file.path;
                    return (
                      <button
                        key={file.path}
                        onClick={() => {
                           handleOpenFile(file.path);
                        }}
                        className={`text-left px-5 py-3 rounded-xl transition-all flex items-center gap-4 group border w-full ${isActive ? 'bg-[var(--accent)]/20 text-[var(--accent)] border-[var(--accent)]/50 shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)]' : 'theme-glass-panel border-white/5 hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 hover:text-[var(--text)] text-[var(--subtext)] hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.1)]'}`}
                      >
                        <span className={`material-symbols-outlined !text-[18px] ${isActive ? '' : 'opacity-50 group-hover:theme-text-accent group-hover:opacity-100 transition-colors'}`}>{t("ui_icon_document") || "description"}</span>
                        <span className="text-[10px] font-black uppercase tracking-widest truncate flex-1">{file.name}</span>
                        {isActive && <span className="w-1.5 h-1.5 rounded-full theme-bg-accent shadow-[0_0_8px_var(--accent)]" />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-6 py-2 border-t border-white/5 bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] backdrop-blur-md shrink-0 z-[20] min-h-[48px] relative">
        
        {pendingCloseTab ? (
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--danger)] flex items-center gap-2">
              <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_warning") || "warning_amber"}</span>
              UNSAVED CHANGES IN {pendingCloseTab.split(/[\\/]/).pop()}
            </span>
            <div className="flex items-center gap-2">
              <button 
                onClick={async () => {
                   setActiveTab(pendingCloseTab);
                   await handleSaveFile();
                   executeCloseTab(pendingCloseTab);
                }}
                className="shrink-0 px-4 h-8 bg-[var(--accent)]/10 border border-[var(--accent)]/20 hover:bg-[var(--accent)] hover:text-[var(--bg)] text-[var(--accent)] rounded-lg text-[9px] font-black uppercase tracking-[0.2em] transition-all flex items-center gap-2"
              >
                SAVE & CLOSE
              </button>
              <button 
                onClick={() => executeCloseTab(pendingCloseTab)}
                className="shrink-0 px-4 h-8 bg-[var(--danger)]/10 border border-[var(--danger)]/20 hover:bg-[var(--danger)] hover:text-[var(--bg)] text-[var(--danger)] rounded-lg text-[9px] font-black uppercase tracking-[0.2em] transition-all flex items-center gap-2"
              >
                DISCARD
              </button>
              <button 
                onClick={() => setPendingCloseTab(null)}
                className="shrink-0 px-4 h-8 theme-glass-panel border-white/5 hover:border-white/20 text-[var(--subtext)] hover:text-[var(--text)] rounded-lg text-[9px] font-black uppercase tracking-[0.2em] transition-all flex items-center gap-2"
              >
                CANCEL
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-4 text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
              <span>{activeTab ? getLanguage(activeTab) : "NO FILE SELECTED"}</span>
              {activeTab && tabContents.get(activeTab) !== originalContents.get(activeTab) && (
                <span className="text-[var(--accent)] flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)] animate-pulse" />
                  UNSAVED CHANGES
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Resize Handle */}
      <div 
        className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize bg-transparent hover:bg-[var(--accent)]/50 transition-colors z-50 group flex justify-center items-center"
        onMouseDown={() => setIsResizing(true)}
      >
        <div className="w-16 h-1 rounded-full bg-[var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

    </div>
  );
}
