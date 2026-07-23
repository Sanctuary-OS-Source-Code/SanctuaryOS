import React, { useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useLexicon } from '../LexiconContext';

interface WorkbenchRawEditorProps {
   value: string;
   onChange: (val: string) => void;
   language: string;
   isLight: boolean;
   problemsList: any[];
   setProblemsList: (list: any[]) => void;
   onEditorMount?: (editor: any, monaco: any) => void;
   isResizingPreview?: boolean;
}

export const WorkbenchRawEditor: React.FC<WorkbenchRawEditorProps> = ({
   value,
   onChange,
   language,
   isLight,
   problemsList,
   setProblemsList,
   onEditorMount,
   isResizingPreview = false
}) => {
   const { t } = useLexicon();
   const [editorRef, setEditorRef] = useState<any>(null);
   const timeoutRef = useRef<NodeJS.Timeout | null>(null);
   const editorOptions = React.useMemo(() => ({
      automaticLayout: true,
      minimap: { enabled: true },
      fontSize: 14,
      fontFamily: "var(--font-mono), Consolas, monospace",
      padding: { top: 24, bottom: 24 },
      smoothScrolling: true,
      cursorBlinking: "smooth",
      lineHeight: 24,
      contextmenu: false,
      renderLineHighlight: "none",
      selectionHighlight: false,
      occurrencesHighlight: "off",
      matchBrackets: "never"
   }), []);

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

   const handleChange = (val: string | undefined) => {
      if (val === undefined) return;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
         onChange(val);
      }, 300); // 300ms debounce
   };

   return (
      <div className={`flex-1 relative w-full h-full flex flex-col min-w-0 ${isResizingPreview ? 'pointer-events-none select-none' : ''}`}>
         <Editor
            height="100%"
            language={language}
            theme={isLight ? "sanctuary-glass-light" : "sanctuary-glass-dark"}
            beforeMount={handleEditorWillMount}
            value={value}
            onChange={handleChange}
            onMount={(editor, monaco) => {
               setEditorRef(editor);
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

               if (onEditorMount) {
                  onEditorMount(editor, monaco);
               }
            }}
         />

         {problemsList.length > 0 && (
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 max-w-2xl w-[90%] bg-[color-mix(in_srgb,var(--bg)_85%,transparent)] backdrop-blur-2xl rounded-[var(--radius)] shadow-[0_30px_60px_rgba(0,0,0,0.8)] border border-[color-mix(in_srgb,var(--danger)_60%,transparent)] overflow-hidden animate-in slide-in-from-bottom-10 z-[100] flex flex-col max-h-72">
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
                  {problemsList.map((p, i) => (
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
   );
};
