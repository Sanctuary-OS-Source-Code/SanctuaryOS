import React, { useRef, useState, useEffect } from 'react';
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

   // Actively inject backdrop-filter directly onto Monaco's floating widgets
   useEffect(() => {
      const applyGlass = () => {
         const processRoot = (root: Document | ShadowRoot) => {
            const widgets = root.querySelectorAll('.quick-input-widget, .monaco-editor .find-widget, .suggest-widget, .monaco-hover');
            widgets.forEach((w: any) => {
               // Apply glassmorphism directly inline
               w.style.setProperty('background', 'rgba(15, 23, 42, 0.4)', 'important');
               w.style.setProperty('background-color', 'rgba(15, 23, 42, 0.4)', 'important');
               w.style.setProperty('backdrop-filter', 'blur(24px) saturate(1.5)', 'important');
               w.style.setProperty('-webkit-backdrop-filter', 'blur(24px) saturate(1.5)', 'important');
               w.style.setProperty('border-radius', '12px', 'important');
               w.style.setProperty('border', '1px solid rgba(255, 255, 255, 0.1)', 'important');
               w.style.setProperty('box-shadow', '0 20px 50px rgba(0,0,0,0.5)', 'important');

               // Find internal wrappers and force them to be transparent
               const internals = w.querySelectorAll('.quick-input-header, .quick-input-and-more, .quick-input-list, .monaco-list, .monaco-list-rows, .find-part, .replace-part');
               internals.forEach((inner: any) => {
                  inner.style.setProperty('background', 'transparent', 'important');
                  inner.style.setProperty('background-color', 'transparent', 'important');
               });
            });
         };

         processRoot(document);
         document.body.querySelectorAll('*').forEach(el => {
            if (el.shadowRoot) processRoot(el.shadowRoot);
         });
      };
      
      const interval = setInterval(applyGlass, 100);
      return () => clearInterval(interval);
   }, []);
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
            'editorSuggestWidget.background': '#0f172aee',
            'editorSuggestWidget.border': '#ffffff1a',
            'editorSuggestWidget.selectedBackground': '#38bdf840',
            'editorHoverWidget.background': '#0f172aee',
            'editorHoverWidget.border': '#ffffff1a',
            'editorWidget.background': '#0f172aee',
            'editorWidget.border': '#ffffff1a',
            'quickInput.background': '#0f172aee',
            'quickInputList.focusBackground': '#38bdf840',
            'list.activeSelectionBackground': '#38bdf840',
            'list.hoverBackground': '#38bdf81a',
            'input.background': '#ffffff0a',
            'inputOption.activeBorder': '#38bdf880',
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
            'editorSuggestWidget.background': '#00000000',
            'editorSuggestWidget.border': '#00000000',
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
      </div>
   );
};


