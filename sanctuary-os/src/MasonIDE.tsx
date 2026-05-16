import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import Editor from "@monaco-editor/react";
import { showToast } from "./Toast";
import { useLexicon } from "./LexiconContext";

export default function MasonIDE({ vaultPath }: { vaultPath?: string }) {
  const { t } = useLexicon();
  const [files, setFiles] = useState<{ name: string; path: string }[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);

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
      const content = await invoke<string>("read_config_file", { path });
      setFileContent(content);
      setActiveFile(path);
    } catch (err) {
      showToast("Failed to open file. It may be binary or locked.", "error");
    }
  };

  const handleSaveFile = async () => {
    if (!activeFile) return;
    setIsSaving(true);
    try {
      await invoke("save_config_file", { path: activeFile, content: fileContent });
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

  const handleEditorWillMount = (monaco: any) => {
    const root = document.documentElement;
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim() || '#0f172a';
    const sidebar = getComputedStyle(root).getPropertyValue('--sidebar').trim() || '#1e293b';
    const accent = getComputedStyle(root).getPropertyValue('--accent').trim() || '#38bdf8';
    const text = getComputedStyle(root).getPropertyValue('--text').trim() || '#f1f5f9';

    const isLightText = text === '#000000' || text.toLowerCase() === '#000';
    const baseTheme = isLightText ? 'vs' : 'vs-dark';

    monaco.editor.defineTheme('sanctuary-theme', {
      base: baseTheme,
      inherit: true,
      rules: [
        { background: bg.replace('#', '') }
      ],
      colors: {
        'editor.background': bg,
        'editor.foreground': text,
        'editorCursor.foreground': accent,
        'editor.lineHighlightBackground': sidebar,
        'editorLineNumber.foreground': text + '50',
        'editorIndentGuide.background': text + '10',
        'editorIndentGuide.activeBackground': text + '30',
        'editor.selectionBackground': accent + '40',
        'editor.inactiveSelectionBackground': accent + '20',
        'scrollbarSlider.background': text + '15',
        'scrollbarSlider.hoverBackground': text + '30',
        'scrollbarSlider.activeBackground': text + '50',
        'editorWidget.background': sidebar,
        'editorWidget.border': text + '20'
      }
    });
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[700px] min-h-[400px] max-h-[1200px] resize-y overflow-auto pb-4">
      <div className="w-full lg:w-1/4 flex flex-col gap-4 h-full">
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
                  className={`text-left px-4 py-3 rounded-xl transition-all flex items-center gap-3 text-xs font-mono truncate ${activeFile === file.path ? 'theme-panel-accent theme-border-accent shadow-lg text-[var(--text)]' : 'theme-glass-inner border border-white/5 hover:theme-border-accent hover:theme-panel-accent text-[var(--subtext)]'}`}
                >
                  <span className="opacity-50">{t("ui_icon_document")}</span>
                  {file.name}
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 theme-glass-panel rounded-[2rem] shadow-2xl overflow-hidden flex flex-col">
        {activeFile ? (
          <>
            <div className="flex justify-between items-center p-4 border-b border-white/10 shrink-0 theme-glass-inner">
              <span className="text-xs font-mono text-[var(--text)] truncate">{activeFile.split(/[\\/]/).pop()}</span>
              <button
                onClick={handleSaveFile}
                disabled={isSaving}
                className="px-6 py-2 theme-bg-accent text-[var(--bg)] font-black text-[10px] uppercase tracking-widest rounded-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50 shadow-lg"
              >
                {isSaving ? t("ide_btn_saving") : t("ide_btn_save")}
              </button>
            </div>
            <div className="flex-1 min-h-0 relative">
              <Editor
                height="100%"
                language={getLanguage(activeFile)}
                theme="sanctuary-theme"
                beforeMount={handleEditorWillMount}
                value={fileContent}
                onChange={val => setFileContent(val || "")}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  fontFamily: "var(--font-mono)",
                  padding: { top: 16 },
                  scrollBeyondLastLine: false,
                  smoothScrolling: true,
                  cursorBlinking: "smooth",
                }}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center opacity-30 text-center p-12">
            <span className="text-6xl mb-4 grayscale">{t("ui_icon_tools")}</span>
            <span className="text-sm font-black text-[var(--text)] uppercase tracking-[0.3em]">{t("ide_title")}</span>
            <p className="text-[10px] mt-2 font-bold max-w-md">{t("ide_welcome_msg")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
