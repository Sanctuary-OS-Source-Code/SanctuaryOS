import React, { useEffect, useState } from "react";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import IconPicker from "./IconPicker";

export function ContextMenu() {
  const { t } = useLexicon();
  const pushStatus = useStore((state) => state.pushStatus);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = useState(false);
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [isMonacoTarget, setIsMonacoTarget] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [supportsIcons, setSupportsIcons] = useState(false);
  const [savedRange, setSavedRange] = useState<Range | null>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.native-context-menu')) return;
      
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      const selection = window.getSelection();
      const hasSelection = selection ? selection.toString().length > 0 : false;

      if (isInput || hasSelection) {
        e.preventDefault();
        setTargetElement(target);
        setIsReadOnly(!isInput);
        setIsMonacoTarget(false);
        
        let x = e.clientX;
        let y = e.clientY;
        const menuWidth = 200;
        const menuHeight = isInput ? 160 : 50;

        if (x + menuWidth > window.innerWidth) x -= menuWidth;
        if (y + menuHeight > window.innerHeight) y -= menuHeight;

        setPosition({ x, y });
        setIsVisible(true);
        setShowIconPicker(false);
        
        if (selection && selection.rangeCount > 0) {
           setSavedRange(selection.getRangeAt(0));
        } else {
           setSavedRange(null);
        }
        
        if (target.tagName === "TEXTAREA" || target.isContentEditable) {
           setSupportsIcons(true);
        } else {
           setSupportsIcons(false);
        }
      } else {
        const isMonaco = target.closest('.monaco-wrapper') !== null || target.closest('.monaco-editor') !== null || e.composedPath().some((el: any) => el.classList && (el.classList.contains('monaco-editor') || el.classList.contains('monaco-wrapper')));
        
        e.preventDefault();
        
        if (!isMonaco) {
           setIsVisible(false);
           setTargetElement(null);
           setIsMonacoTarget(false);
        }
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (isVisible && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsVisible(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isVisible) setIsVisible(false);
    };

    const handleCustomMonacoContextMenu = (e: any) => {
      const target = e.detail.target as HTMLElement;
      
      setTargetElement(target);
      setIsReadOnly(e.detail.isReadOnly === true);
      setIsMonacoTarget(true);
      
      let x = e.detail.x || 0;
      let y = e.detail.y || 0;
      const menuWidth = 200;
      const menuHeight = 160;

      if (x + menuWidth > window.innerWidth) x -= menuWidth;
      if (y + menuHeight > window.innerHeight) y -= menuHeight;

      setPosition({ x, y });
      setIsVisible(true);
      setShowIconPicker(false);
      setSupportsIcons(true);
    };

    const handleWebviewContextMenu = (e: any) => {
      setTargetElement(null);
      setIsReadOnly(false);
      setIsMonacoTarget(false);
      
      let x = e.detail.x || 0;
      let y = e.detail.y || 0;
      const menuWidth = 200;
      const menuHeight = 160;

      if (x + menuWidth > window.innerWidth) x -= menuWidth;
      if (y + menuHeight > window.innerHeight) y -= menuHeight;

      setPosition({ x, y });
      setIsVisible(true);
      setShowIconPicker(false);
      setSupportsIcons(false);
      (window as any)._activeWebviewLabel = e.detail.label;
    };

    const handleWebviewContextClose = () => {
      setIsVisible(false);
      (window as any)._activeWebviewLabel = null;
    };

    window.addEventListener("contextmenu", handleContextMenu, { capture: true });
    window.addEventListener("sanctuary-monaco-contextmenu", handleCustomMonacoContextMenu);
    window.addEventListener("sanctuary-webview-contextmenu", handleWebviewContextMenu);
    window.addEventListener("sanctuary-webview-contextmenu-close", handleWebviewContextClose);
    window.addEventListener("mousedown", handleMouseDown, { capture: true });
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("contextmenu", handleContextMenu, { capture: true });
      window.removeEventListener("sanctuary-monaco-contextmenu", handleCustomMonacoContextMenu);
      window.removeEventListener("sanctuary-webview-contextmenu", handleWebviewContextMenu);
      window.removeEventListener("sanctuary-webview-contextmenu-close", handleWebviewContextClose);
      window.removeEventListener("mousedown", handleMouseDown, { capture: true });
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isVisible]);

  const handleAction = (action: string) => {
    setIsVisible(false);
    setShowIconPicker(false);
    
    if ((window as any)._activeWebviewLabel && !targetElement && !isMonacoTarget) {
       let script = "";
       if (action === "copy") script = "document.execCommand('copy');";
       if (action === "cut") script = "document.execCommand('cut');";
       if (action === "paste") {
          import("@tauri-apps/plugin-clipboard-manager").then(({ readText }) => {
             readText().then((clipText) => {
                if (clipText) {
                   const escaped = clipText.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '');
                   import("@tauri-apps/api/core").then(({ invoke }) => {
                      invoke('webview_eval', { label: (window as any)._activeWebviewLabel, script: `document.execCommand('insertText', false, '${escaped}')` }).catch(console.error);
                   });
                }
             });
          });
       }
        if (action.startsWith("insert_icon:")) {
           const iconName = action.split(":")[1];
           const escaped = `[ICON:${iconName}]`.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '');
           import("@tauri-apps/api/core").then(({ invoke }) => {
              invoke('webview_eval', { label: (window as any)._activeWebviewLabel, script: `document.execCommand('insertText', false, '${escaped}')` }).catch(console.error);
           });
        }
       if (action === "selectAll") script = "document.execCommand('selectAll');";
       
       if (script) {
          import("@tauri-apps/api/core").then(({ invoke }) => {
             invoke('webview_eval', { label: (window as any)._activeWebviewLabel, script }).catch(console.error);
          });
       }
       (window as any)._activeWebviewLabel = null;
       return;
    }
    
    if (isMonacoTarget && (window as any).monaco) {
       const monaco = (window as any).monaco;
       const activeEditor = monaco.editor.getEditors().find((e: any) => e.hasTextFocus() || e.hasWidgetFocus()) || monaco.editor.getEditors()[0];
       
       if (activeEditor) {
          activeEditor.focus();
          if (action === "copy") activeEditor.trigger('keyboard', 'editor.action.clipboardCopyAction', null);
          if (action === "cut") activeEditor.trigger('keyboard', 'editor.action.clipboardCutAction', null);
          if (action === "paste") {
             import("@tauri-apps/plugin-clipboard-manager").then(({ readText }) => {
                readText().then((clipText) => {
                   if (clipText) {
                      activeEditor.executeEdits("context-menu", [{
                         range: activeEditor.getSelection(),
                         text: clipText,
                         forceMoveMarkers: true
                      }]);
                   }
                }).catch(() => {
                   pushStatus(t("clipboard_read_error"), "error");
                });
             });
          }
           if (action.startsWith("insert_icon:")) {
              const iconName = action.split(":")[1];
              const clipText = `[ICON:${iconName}]`;
              activeEditor.executeEdits("context-menu", [{
                 range: activeEditor.getSelection(),
                 text: clipText,
                 forceMoveMarkers: true
              }]);
           }
          if (action === "selectAll") {
             const model = activeEditor.getModel();
             if (model) {
                activeEditor.setSelection(model.getFullModelRange());
             }
          }
       }
       return;
    }
    
    if (targetElement) {
      let finalTarget = targetElement;
      
      const monacoContainer = targetElement.closest('.monaco-editor');
      if (monacoContainer) {
         const inputArea = monacoContainer.querySelector('.inputarea') as HTMLElement;
         if (inputArea) {
            finalTarget = inputArea;
         }
      }

      finalTarget.focus();
      
      try {
        if (action === "copy" || action === "cut") {
          document.execCommand(action);
        }
        if (action === "paste") {
          import("@tauri-apps/plugin-clipboard-manager").then(({ readText }) => {
            readText().then((clipText) => {
              if (clipText && finalTarget) {
                
                if (finalTarget.tagName === "INPUT" || finalTarget.tagName === "TEXTAREA") {
                   const el = finalTarget as HTMLInputElement | HTMLTextAreaElement;
                   
                   if (monacoContainer) {
                      document.execCommand("insertText", false, clipText);
                      return;
                   }

                   const start = el.selectionStart || 0;
                   const end = el.selectionEnd || 0;
                   const currentVal = el.value || "";
                   const newVal = currentVal.substring(0, start) + clipText + currentVal.substring(end);
                   
                   const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
                   const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
                   
                   if (el.tagName === "INPUT" && nativeInputValueSetter) {
                     nativeInputValueSetter.call(el, newVal);
                   } else if (el.tagName === "TEXTAREA" && nativeTextAreaValueSetter) {
                     nativeTextAreaValueSetter.call(el, newVal);
                   } else {
                     el.value = newVal;
                   }
                   
                   el.selectionStart = el.selectionEnd = start + clipText.length;
                   el.dispatchEvent(new Event("input", { bubbles: true }));
                   el.dispatchEvent(new Event("change", { bubbles: true }));
                } else if (finalTarget.isContentEditable) {
                   document.execCommand("insertText", false, clipText);
                }
              } else {
                console.error("Clipboard is empty or could not be read.");
              }
            }).catch(err => {
               console.error("Clipboard plugin read error: " + err);
            });
          }).catch((err) => {
             console.error("Clipboard plugin load error: " + err);
          });
        }
         if (action.startsWith("insert_icon:")) {
             const iconName = action.split(":")[1];
             const clipText = `[ICON:${iconName}]`;
             if (finalTarget) {
               if (finalTarget.tagName === "INPUT" || finalTarget.tagName === "TEXTAREA") {
                  const el = finalTarget as HTMLInputElement | HTMLTextAreaElement;
                  if (monacoContainer) {
                     document.execCommand("insertText", false, clipText);
                  } else {
                     const start = el.selectionStart || 0;
                     const end = el.selectionEnd || 0;
                     const currentVal = el.value || "";
                     const newVal = currentVal.substring(0, start) + clipText + currentVal.substring(end);
                     
                     const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
                     const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
                     
                     if (el.tagName === "INPUT" && nativeInputValueSetter) {
                       nativeInputValueSetter.call(el, newVal);
                     } else if (el.tagName === "TEXTAREA" && nativeTextAreaValueSetter) {
                       nativeTextAreaValueSetter.call(el, newVal);
                     } else {
                       el.value = newVal;
                     }
                     
                     el.selectionStart = el.selectionEnd = start + clipText.length;
                     el.dispatchEvent(new Event("input", { bubbles: true }));
                     el.dispatchEvent(new Event("change", { bubbles: true }));
                  }
               } else if (finalTarget.isContentEditable) {
                  finalTarget.focus();
                  if (savedRange) {
                     const sel = window.getSelection();
                     if (sel) {
                        sel.removeAllRanges();
                        sel.addRange(savedRange);
                     }
                  }
                  document.execCommand("insertText", false, clipText);
               }
             }
         }
        if (action === "selectAll") {
          if (finalTarget.tagName === "INPUT" || finalTarget.tagName === "TEXTAREA") {
             (finalTarget as HTMLInputElement | HTMLTextAreaElement).select();
          } else {
             document.execCommand("selectAll");
          }
        }
      } catch (err) {
        console.error("Context menu action failed:", err);
      }
    }
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top: position.y,
        left: position.x,
        zIndex: 999999,
      }}
      className="flex"
    >
      <div
        className="w-48 h-max theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-2xl rounded-xl overflow-hidden flex flex-col py-1 animate-in fade-in zoom-in-95 duration-100"
        onContextMenu={(e) => e.preventDefault()}
      >
      {!isReadOnly && (
        <button
          onMouseDown={(e) => { e.preventDefault(); handleAction("cut"); }}
          className="px-4 py-2 text-left hover:bg-white/10 transition-colors flex items-center gap-3 text-sm font-medium text-[var(--text)] group"
        >
          <span className="material-symbols-outlined !text-[16px] opacity-50 group-hover:opacity-100">content_cut</span>
          {t("ctx_cut")}
        </button>
      )}
      <button
        onMouseDown={(e) => { e.preventDefault(); handleAction("copy"); }}
        className="px-4 py-2 text-left hover:bg-white/10 transition-colors flex items-center gap-3 text-sm font-medium text-[var(--text)] group"
      >
        <span className="material-symbols-outlined !text-[16px] opacity-50 group-hover:opacity-100">content_copy</span>
        {t("ctx_copy")}
      </button>
      {!isReadOnly && (
        <>
          <button
            onMouseDown={(e) => { e.preventDefault(); handleAction("paste"); }}
            className="px-4 py-2 text-left hover:bg-white/10 transition-colors flex items-center gap-3 text-sm font-medium text-[var(--text)] group"
          >
            <span className="material-symbols-outlined !text-[16px] opacity-50 group-hover:opacity-100">content_paste</span>
            {t("ctx_paste")}
          </button>
          {supportsIcons && (
            <>
              <div className="h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] my-1 w-full" />
              <button
                onMouseDown={(e) => { e.preventDefault(); setShowIconPicker(!showIconPicker); }}
                className={`px-4 py-2 text-left hover:bg-white/10 transition-colors flex items-center justify-between text-sm font-medium text-[var(--text)] group ${showIconPicker ? 'bg-white/5' : ''}`}
              >
                <div className="flex items-center gap-3">
                   <span className="material-symbols-outlined !text-[16px] opacity-50 group-hover:opacity-100">add_reaction</span>
                   {t("ctx_insert_icon")}
                </div>
                <span className="material-symbols-outlined !text-[16px] opacity-50">{showIconPicker ? 'expand_less' : 'chevron_right'}</span>
              </button>
            </>
          )}
          <div className="h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] my-1 w-full" />
          <button
            onMouseDown={(e) => { e.preventDefault(); handleAction("selectAll"); }}
            className="px-4 py-2 text-left hover:bg-white/10 transition-colors flex items-center gap-3 text-sm font-medium text-[var(--text)] group"
          >
            <span className="material-symbols-outlined !text-[16px] opacity-50 group-hover:opacity-100">select_all</span>
            {t("btn_select_all")}
          </button>
        </>
      )}
      </div>

      {showIconPicker && (
         <div className={`absolute top-0 ${position.x > window.innerWidth / 2 ? 'right-full mr-2 [&>div]:right-0' : 'left-full ml-2 [&>div]:left-0'}`}>
            <IconPicker 
               onSelect={(icon) => handleAction(`insert_icon:${icon}`)} 
               onClose={() => setShowIconPicker(false)} 
            />
         </div>
      )}
    </div>
  );
}
