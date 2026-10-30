import React, { useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useTheme } from '../ThemeContext';
import { defineSanctuaryMonacoThemes, useSanctuaryMonacoTheme } from '../utils/monacoTheme';

interface WorkbenchRawEditorProps {
   value: string;
   onChange: (val: string) => void;
   language: string;
   isLight: boolean;
   problemsList: any[];
   setProblemsList: (list: any[]) => void;
   onEditorMount?: (editor: any, monaco: any) => void;
   isResizingPreview?: boolean;
   wordWrap?: boolean;
}

export const WorkbenchRawEditor: React.FC<WorkbenchRawEditorProps> = ({
   value,
   onChange,
   language,
   isLight,
   onEditorMount,
   isResizingPreview = false,
   wordWrap = false,
}) => {
   const { currentTheme } = useTheme();
   const [, setEditorRef] = useState<any>(null);
   const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

   useSanctuaryMonacoTheme(currentTheme, isLight);

   const handleEditorWillMount = (monaco: any) => {
      defineSanctuaryMonacoThemes(monaco, currentTheme);
   };

   const handleChange = (val: string | undefined) => {
      if (val === undefined) return;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
         onChange(val);
      }, 300);
   };

   return (
      <div className={`monaco-wrapper flex-1 relative w-full h-full flex flex-col min-w-0 ${isResizingPreview ? 'pointer-events-none select-none' : ''}`}>
         <Editor
            height="100%"
            language={language}
            theme={isLight ? "sanctuary-glass-light" : "sanctuary-glass-dark"}
            beforeMount={handleEditorWillMount}
            value={value}
            onChange={handleChange}
            options={{
               hover: { enabled: 'on', above: false },
               smoothScrolling: true,
               automaticLayout: true,
               wordWrap: wordWrap ? 'on' : 'off',
               minimap: { enabled: false },
            }}
            onMount={(editor, monaco) => {
               setEditorRef(editor);
               (window as any).monaco = monaco;
               defineSanctuaryMonacoThemes(monaco, currentTheme);

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
