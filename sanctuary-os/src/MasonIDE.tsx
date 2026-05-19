import { useState, useEffect, Fragment } from "react";
import { invoke } from "@tauri-apps/api/core";
import Editor from "@monaco-editor/react";
import { showToast } from "./Toast";
import { useLexicon } from "./LexiconContext";

export default function MasonIDE({ vaultPath }: { vaultPath?: string }) {
  const { t } = useLexicon();
  const [files, setFiles] = useState<{ name: string; path: string }[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);

  // Multi-tab state management
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [tabContents, setTabContents] = useState<Map<string, string>>(new Map());
  const [originalContents, setOriginalContents] = useState<Map<string, string>>(new Map());
  
  // Problems panel state
  const [problemsList, setProblemsList] = useState<any[]>([]);
  const [editorRef, setEditorRef] = useState<any>(null);

  const fetchFiles = async () => {
    if (!vaultPath) return;
    try {
      const sandboxDir = `${vaultPath}/Dev/Sandbox`.replace(/\\/g, '/');
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
      showToast("Failed to open file. It may be binary or locked.", "error");
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
      const confirmed = window.confirm("You have uncommitted changes. Close tab and discard?");
      if (!confirmed) return;
    }
    
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
  };

  const handleSaveFile = async () => {
    if (!activeTab) return;
    setIsSaving(true);
    try {
      const content = tabContents.get(activeTab) || "";
      await invoke("save_config_file", { path: activeTab, content });
      // Update original content after successful save
      setOriginalContents(prev => new Map(prev).set(activeTab, content));
      showToast("File saved successfully!", "success");
    } catch (err) {
      showToast("Failed to save file.", "error");
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
    
    // JSON validation
    if (activeTab?.endsWith('.json')) {
      try {
        JSON.parse(value);
      } catch (err: any) {
        const match = err.message.match(/position (\d+)/);
        const pos = match ? parseInt(match[1]) : 0;
        const position = model.getPositionAt(pos);
        
        problems.push({
          line: position.lineNumber,
          column: position.column,
          message: err.message
        });
        
        markers.push({
          startLineNumber: position.lineNumber,
          startColumn: position.column,
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

    // Compute contrast overrides for light themes
    const isLight = bg === '#E3E3E3' || bg.toLowerCase() === '#ffffff' || bg === '#ffffff';
    const primaryTextColor = isLight ? '000000' : text.replace('#', '').toLowerCase();
    const structuralColor = isLight ? '111827' : accent.replace('#', '').toLowerCase();
    const commentColor = isLight ? '6b7280' : subtext.replace('#', '').toLowerCase();
    const booleanColor = isLight ? 'b91c1c' : danger.replace('#', '').toLowerCase();

    // Register custom language
    monaco.languages.register({ id: 'sanctuary-config' });
    
    // Define tokenization rules
    monaco.languages.setMonarchTokensProvider('sanctuary-config', {
      tokenizer: {
        root: [
          [/".*?"/, 'config-string'],
          [/'.*?'/, 'config-string'],
          [/\b(true|false)\b/, 'config-boolean'],
          [/\b\d+\b/, 'config-number'],
          [/[a-zA-Z_]\w*(?=\s*[:=])/, 'config-key'],
          [/#.*$/, 'comment'],
          [/\/\/.*$/, 'comment'],
          [/[\{\}\[\]\(\)]/, 'delimiter.bracket'],
          [/[,;:]/, 'delimiter'],
        ]
      }
    });

    // Maximum accessibility high-contrast theme
    monaco.editor.defineTheme('sanctuary-dark', {
      base: isLight ? 'vs' : 'vs-dark',
      inherit: true,
      rules: [
        { token: '', foreground: primaryTextColor }, // Global catch-all fallback
        { token: 'comment', foreground: commentColor, fontStyle: 'italic' },
        { token: 'config-key', foreground: structuralColor, fontStyle: 'bold' },
        { token: 'config-string', foreground: primaryTextColor, fontStyle: 'bold' }, // Force deep black strings
        { token: 'config-number', foreground: structuralColor, fontStyle: 'bold' }, // Force bold numbers
        { token: 'config-boolean', foreground: booleanColor, fontStyle: 'bold' },
        { token: 'delimiter', foreground: primaryTextColor },
        { token: 'delimiter.bracket', foreground: primaryTextColor },
      ],
      colors: {
        'editor.background': bg,
        'editor.foreground': isLight ? '#000000' : text,
        'editorCursor.foreground': isLight ? '#000000' : accent,
        'editor.lineHighlightBackground': isLight ? '#00000010' : `${accent}15`,
        'editorLineNumber.foreground': isLight ? '#6b7280' : subtext + '80',
        'editorLineNumber.activeForeground': isLight ? '#111827' : subtext,
        'editorIndentGuide.background': isLight ? '#e5e7eb' : sidebar,
        'editorIndentGuide.activeBackground': isLight ? '#9ca3af' : subtext + '40',
        'editor.selectionBackground': isLight ? '#00000030' : `${accent}30`,
        'editor.inactiveSelectionBackground': isLight ? '#00000015' : `${accent}15`,
        'scrollbarSlider.background': isLight ? '#d1d5db' : subtext + '20',
        'scrollbarSlider.hoverBackground': isLight ? '#9ca3af' : subtext + '40',
        'scrollbarSlider.activeBackground': isLight ? '#6b7280' : subtext + '60',
        'editorWidget.background': isLight ? '#f9fafb' : sidebar,
        'editorWidget.border': isLight ? '#d1d5db' : subtext + '40',
        'editorSuggestWidget.background': isLight ? '#ffffff' : sidebar,
        'editorSuggestWidget.border': isLight ? '#d1d5db' : subtext + '40',
        'editorSuggestWidget.selectedBackground': isLight ? '#e5e7eb' : accent + '20',
        'editorError.foreground': isLight ? '#b91c1c' : danger,
        'editorWarning.foreground': isLight ? '#d97706' : danger,
      }
    });

    // Error Highlight & Autocomplete settings for TS/JS
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
    });
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.CommonJS,
      noEmit: true,
      esModuleInterop: true,
    });
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
    });
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      allowNonTsExtensions: true,
    });
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[700px] min-h-[400px] max-h-[1200px] resize-y overflow-hidden pb-4 relative">
      

      {isSidebarVisible && (
        <div className="w-full lg:w-1/4 flex flex-col gap-4 h-full animate-in slide-in-from-left-4 duration-300">
          <div className="theme-glass-panel rounded-[2rem] shadow-2xl p-6 h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--text)]">{t("ide_sandbox_files")}</h3>
              <button onClick={fetchFiles} className="text-[10px] font-black uppercase tracking-widest theme-text-accent hover:opacity-80">{t("ide_refresh")}</button>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-2">
              {files.length === 0 ? (
                <div className="text-center text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest p-4">
                  {t("ide_no_files_found")}<br/>{t("ide_place_files")}
                </div>
              ) : (
                files.map(file => (
                  <button
                    key={file.path}
                    onClick={() => handleOpenFile(file.path)}
                    className={`text-left px-4 py-3 rounded-xl transition-all flex items-center gap-3 text-xs font-mono truncate ${activeTab === file.path ? 'theme-panel-accent theme-border-accent shadow-lg text-[var(--text)]' : 'theme-glass-inner border border-white/5 hover:theme-border-accent hover:theme-panel-accent text-[var(--subtext)]'}`}
                  >
                    <span className="opacity-50">{t("ui_icon_document")}</span>
                    {file.name}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col transition-all duration-300 relative">
        <div className="theme-glass-panel rounded-[2rem] shadow-2xl flex-1 flex flex-col">
        <div className="overflow-hidden rounded-[2rem] flex-1 flex flex-col">
        {activeTab ? (
          <>
            {/* Multi-Tab Navigation Bar */}
            {openTabs.length > 0 && (
              <div className="border-b border-zinc-900 bg-zinc-950/20 backdrop-blur-sm shrink-0 relative">
                <div className="flex items-center gap-1 px-2 py-2 overflow-x-auto custom-scrollbar">
                  <button 
                    onClick={() => setIsSidebarVisible(!isSidebarVisible)} 
                    className="shrink-0 theme-glass-panel border border-[var(--text)]/10 p-2 rounded-xl text-xs opacity-70 hover:opacity-100 hover:theme-bg-accent hover:text-[var(--bg)] hover:border-[var(--accent)] transition-all"
                    title="Toggle Sidebar"
                  >
                    ☰
                  </button>
                  {openTabs.map((tabPath, index) => {
                    const fileName = tabPath.split(/[\\/]/).pop() || tabPath;
                    const isActive = activeTab === tabPath;
                    const isDirty = tabContents.get(tabPath) !== originalContents.get(tabPath);
                    
                    return (
                      <Fragment key={tabPath}>
                        <div
                          className={`flex items-center gap-2 px-4 py-2 rounded-t-lg border-b-2 transition-all cursor-pointer min-w-[120px] max-w-[200px] ${
                            isActive 
                              ? 'bg-zinc-900/60 border-[var(--accent)] text-zinc-100 font-mono text-[10px]' 
                              : 'bg-transparent border-transparent text-zinc-500 hover:text-zinc-300 font-mono text-[10px]'
                          }`}
                          onClick={() => handleSwitchTab(tabPath)}
                        >
                          {/* Dirty Indicator */}
                          {isDirty && (
                            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" title="Unsaved changes" />
                          )}
                          
                          {/* File Name */}
                          <span className="text-[10px] font-mono truncate flex-1">
                            {fileName}
                          </span>
                          
                          {/* Close Button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCloseTab(tabPath);
                            }}
                            className="w-4 h-4 flex items-center justify-center rounded hover:bg-red-500/20 hover:text-red-400 transition-colors text-[10px] opacity-60 hover:opacity-100"
                          >
                            ✕
                          </button>
                        </div>
                      </Fragment>
                    );
                  })}
                </div>
              </div>
            )}
            
            <div className="flex justify-between items-center p-4 border-b border-white/10 shrink-0 theme-glass-inner">
              <span className="text-xs font-mono text-[var(--text)] truncate">{activeTab.split(/[\\/]/).pop()}</span>
              <button
                onClick={handleSaveFile}
                disabled={isSaving}
                className="px-6 py-2 theme-bg-accent text-[var(--bg)] font-black text-[10px] uppercase tracking-widest rounded-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50 shadow-lg"
              >
                {isSaving ? t("ide_btn_saving") : t("ide_btn_save")}
              </button>
            </div>
            <div className="flex-1 min-h-0 relative flex flex-col">
              <div className="flex-1 min-h-0">
                <Editor
                  height="100%"
                  language={getLanguage(activeTab)}
                  theme="sanctuary-dark"
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
                      
                      // Validate on change
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
                    fontSize: 14,
                    fontFamily: "var(--font-mono)",
                    padding: { top: 16 },
                    scrollBeyondLastLine: false,
                    smoothScrolling: true,
                    cursorBlinking: "smooth",
                    formatOnPaste: true,
                    formatOnType: true,
                    suggestOnTriggerCharacters: true,
                    quickSuggestions: true,
                  }}
                />
              </div>
              
              {/* Problems Panel */}
              {problemsList.length > 0 && (
                <div className="border-t border-zinc-900 bg-zinc-950/40 backdrop-blur-sm shrink-0">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-900">
                    <span className="text-[10px] font-mono font-black uppercase tracking-widest text-[var(--danger)]">
                      [ PROBLEMS ({problemsList.length}) ]
                    </span>
                    <button 
                      onClick={() => setProblemsList([])}
                      className="text-[8px] font-mono text-[var(--subtext)] hover:text-[var(--text)] transition-colors"
                    >
                      CLEAR
                    </button>
                  </div>
                  <div className="max-h-32 overflow-y-auto custom-scrollbar">
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
                        className="px-4 py-2 text-[9px] font-mono text-[var(--danger)] hover:bg-zinc-900/60 cursor-pointer transition-colors border-b border-zinc-900/40"
                      >
                        Line {problem.line}, Col {problem.column}: {problem.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center opacity-30 text-center p-12 relative">
            <button
              onClick={() => setIsSidebarVisible(!isSidebarVisible)}
              className="absolute top-4 left-4 theme-glass-panel p-2 rounded-xl text-xs opacity-70 hover:opacity-100 hover:theme-text-accent transition-all"
              title="Toggle Sidebar"
            >
              ☰
            </button>
            <span className="text-6xl mb-4 grayscale">{t("ui_icon_tools")}</span>
            <span className="text-sm font-black text-[var(--text)] uppercase tracking-[0.3em]">{t("ide_title")}</span>
            <p className="text-[10px] mt-2 font-bold max-w-md">{t("ide_welcome_msg")}</p>
          </div>
        )}
        </div>
        </div>
      </div>
    </div>
  );
}
