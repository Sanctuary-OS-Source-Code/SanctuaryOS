import React, { useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useTheme } from '../ThemeContext';
import { useLexicon } from '../LexiconContext';
import { defineSanctuaryMonacoThemes, useSanctuaryMonacoTheme } from '../utils/monacoTheme';
import { VAULT_CHIP_CLASS, HoverTooltip } from '../shared';

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
   fileName?: string;
   showSyncScroll?: boolean;
   isScrollLocked?: boolean;
   onToggleScrollLock?: () => void;
}

export const WorkbenchRawEditor: React.FC<WorkbenchRawEditorProps> = ({
   value,
   onChange,
   language,
   isLight,
   onEditorMount,
   isResizingPreview = false,
   wordWrap: initialWordWrap = false,
   fileName,
   showSyncScroll = false,
   isScrollLocked = false,
   onToggleScrollLock,
}) => {
   const { currentTheme } = useTheme();
   const { t } = useLexicon();
   const [, setEditorRef] = useState<any>(null);
   const [wordWrap, setWordWrap] = useState<boolean>(initialWordWrap);
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
      <div className={`monaco-wrapper flex-1 relative w-full h-full flex flex-col min-w-0 overflow-hidden rounded-2xl ${isResizingPreview ? 'pointer-events-none select-none' : ''}`}>
         <div className="shrink-0 flex items-center justify-between gap-2 px-3.5 py-2 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--bg-surface)_45%,transparent)]">
            <div className="flex items-center gap-2 min-w-0">
               <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
                  {t("icon_code", "code")}
               </span>
               {fileName && (
                  <span className="text-[11px] font-bold text-[var(--text-main)] truncate font-mono">
                     {fileName}
                  </span>
               )}
               <span className={`${VAULT_CHIP_CLASS} !h-5 !px-2 !text-[9px] uppercase font-mono`}>
                  {language}
               </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
               {showSyncScroll && onToggleScrollLock && (
                  <div className="relative flex">
                     <button
                        type="button"
                        onClick={onToggleScrollLock}
                        className={`h-7 px-2.5 rounded-xl text-[10px] font-bold flex items-center gap-1.5 transition-all cursor-pointer glass-surface border ${
                           isScrollLocked
                              ? 'sa-glass-pill-active text-[var(--accent)] border-[var(--accent)]/40'
                              : 'border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text-muted)] hover:text-[var(--text-main)]'
                        }`}
                     >
                        <span className="material-symbols-outlined !text-[13px]">
                           {isScrollLocked ? t("icon_lock", "lock") : t("icon_lock_open", "lock_open")}
                        </span>
                        <span className="hidden sm:inline">{t("sync_scroll", "Sync Scroll")}</span>
                     </button>
                     <HoverTooltip title={t("sync_scroll", "Sync Scroll")} />
                  </div>
               )}

               <div className="relative flex">
                  <button
                     type="button"
                     onClick={() => setWordWrap(prev => !prev)}
                     className={`h-7 px-2.5 rounded-xl text-[10px] font-bold flex items-center gap-1.5 transition-all cursor-pointer glass-surface border ${
                        wordWrap
                           ? 'sa-glass-pill-active text-[var(--accent)] border-[var(--accent)]/40'
                           : 'border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text-muted)] hover:text-[var(--text-main)]'
                     }`}
                  >
                     <span className="material-symbols-outlined !text-[13px]">
                        {t("icon_wrap_text", "wrap_text")}
                     </span>
                     <span className="hidden sm:inline">{t("cw_wrap_lines", "Wrap Lines")}</span>
                  </button>
                  <HoverTooltip title={t("cw_wrap_lines", "Wrap Lines")} />
               </div>
            </div>
         </div>

         <div className="flex-1 min-h-0 relative w-full">
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
      </div>
   );
};
