import React, { useEffect, useState } from "react";
import { useLexicon } from "./LexiconContext";
import { createPortal } from "react-dom";
import { useStore } from "./store";
import { useTooltipStore } from "./store/tooltipStore";
import IconPicker from "./IconPicker";
import { spellChecker } from "./SpellChecker";

export interface SanctuaryContextMenuItem {
  id?: string;
  label: string;
  icon: string;
  iconColorClass?: string;
  variant?: "default" | "danger" | "success" | "warning" | "accent";
  danger?: boolean;
  badge?: string;
  disabled?: boolean;
  dividerBefore?: boolean;
  divider?: boolean;
  onClick?: () => void;
  submenu?: SanctuaryContextMenuItem[];
}

export interface SanctuaryContextMenuConfig {
  title: string;
  subtitle?: string;
  statusLabel?: string;
  statusColorClass?: string;
  icon?: string;
  iconColorClass?: string;
  items: SanctuaryContextMenuItem[];
}

let globalOpenCardMenu: ((x: number, y: number, config: SanctuaryContextMenuConfig) => void) | null = null;
let globalCloseCardMenu: (() => void) | null = null;

export function openSanctuaryContextMenu(
  e: {
    preventDefault?: () => void;
    stopPropagation?: () => void;
    clientX: number;
    clientY: number;
    currentTarget?: EventTarget | null;
    target?: EventTarget | null;
  },
  configOrItems: SanctuaryContextMenuConfig | SanctuaryContextMenuItem[]
) {
  if (e.preventDefault) e.preventDefault();
  if (e.stopPropagation) e.stopPropagation();
  try {
    useTooltipStore.getState().clearTooltip();
  } catch {}
  let config: SanctuaryContextMenuConfig;
  if (Array.isArray(configOrItems)) {
    let inferredTitle = "";
    let inferredSubtitle = "";
    let inferredIcon = "";
    const el = (e.currentTarget || e.target) as HTMLElement | null;
    const cardEl = el?.closest?.(".glass-panel") || el;
    if (cardEl && typeof cardEl.querySelector === "function") {
      const h3 = cardEl.querySelector("h3, h4");
      if (h3?.textContent) inferredTitle = h3.textContent.trim();
      const sub = h3?.parentElement?.querySelector("p");
      if (sub?.textContent) inferredSubtitle = sub.textContent.trim();
      const iconSpan = cardEl.querySelector(".material-symbols-outlined");
      if (iconSpan?.textContent) inferredIcon = iconSpan.textContent.trim();
    }
    config = {
      title: inferredTitle || configOrItems[0]?.label || "",
      subtitle: inferredSubtitle || undefined,
      icon: inferredIcon || configOrItems[0]?.icon,
      items: configOrItems,
    };
  } else {
    config = configOrItems;
  }
  if (globalOpenCardMenu && config.items && config.items.length > 0) {
    globalOpenCardMenu(e.clientX, e.clientY, config);
  }
}

export function closeSanctuaryContextMenu() {
  if (globalCloseCardMenu) {
    globalCloseCardMenu();
  }
}

export function ContextMenu() {
  const { t } = useLexicon();
  const pushStatus = useStore((state) => state.pushStatus);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = useState(false);
  const [cardMenu, setCardMenu] = useState<{ x: number; y: number; config: SanctuaryContextMenuConfig } | null>(null);
  const [activeSubmenuIdx, setActiveSubmenuIdx] = useState<number | null>(null);
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [isMonacoTarget, setIsMonacoTarget] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [supportsIcons, setSupportsIcons] = useState(false);
  const [savedRange, setSavedRange] = useState<Range | null>(null);
  const [misspelledInfo, setMisspelledInfo] = useState<{ word: string, suggestions: string[], range: Range } | null>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const cardMenuRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    globalOpenCardMenu = (x, y, config) => {
      setIsVisible(false);
      setShowIconPicker(false);
      setActiveSubmenuIdx(null);
      setCardMenu({ x, y, config });
    };
    globalCloseCardMenu = () => {
      setCardMenu(null);
      setActiveSubmenuIdx(null);
    };
    return () => {
      globalOpenCardMenu = null;
      globalCloseCardMenu = null;
    };
  }, []);

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.native-context-menu')) return;
      if (cardMenuRef.current && cardMenuRef.current.contains(target)) {
        e.preventDefault();
        return;
      }
      setCardMenu(null);
      setActiveSubmenuIdx(null);
      
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
        const menuWidth = 228;
        const menuHeight = isInput ? 190 : 72;

        if (x + menuWidth > window.innerWidth) x -= menuWidth;
        if (y + menuHeight > window.innerHeight) y -= menuHeight;

        setPosition({ x, y });
        setIsVisible(true);
        setShowIconPicker(false);
        setMisspelledInfo(null);
        
        spellChecker.initialize();
        let currentMisspelledInfo = null;
        if (isInput) {
            const docAny = document as any;
            const range = docAny.caretRangeFromPoint ? docAny.caretRangeFromPoint(e.clientX, e.clientY) : null;
            if (range && range.startContainer.nodeType === Node.TEXT_NODE) {
                const text = range.startContainer.textContent || '';
                const offset = range.startOffset;
                let start = offset;
                let end = offset;
                while (start > 0 && /[a-zA-Z']/.test(text[start - 1])) start--;
                while (end < text.length && /[a-zA-Z']/.test(text[end])) end++;
                if (start !== end) {
                    const word = text.substring(start, end);
                    if (!spellChecker.isCorrect(word)) {
                        const suggestions = spellChecker.suggest(word).slice(0, 5);
                        if (suggestions.length > 0) {
                            const wordRange = document.createRange();
                            wordRange.setStart(range.startContainer, start);
                            wordRange.setEnd(range.startContainer, end);
                            currentMisspelledInfo = { word, suggestions, range: wordRange };
                        }
                    }
                }
            }
        }
        setMisspelledInfo(currentMisspelledInfo);
        
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
      if (cardMenu && cardMenuRef.current && !cardMenuRef.current.contains(e.target as Node)) {
        setCardMenu(null);
        setActiveSubmenuIdx(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isVisible) setIsVisible(false);
        if (cardMenu) {
          setCardMenu(null);
          setActiveSubmenuIdx(null);
        }
      }
    };

    const handleScroll = (e: Event) => {
      if (cardMenu && cardMenuRef.current && !cardMenuRef.current.contains(e.target as Node)) {
        setCardMenu(null);
        setActiveSubmenuIdx(null);
      }
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
    window.addEventListener("scroll", handleScroll, { capture: true });

    return () => {
      window.removeEventListener("contextmenu", handleContextMenu, { capture: true });
      window.removeEventListener("sanctuary-monaco-contextmenu", handleCustomMonacoContextMenu);
      window.removeEventListener("sanctuary-webview-contextmenu", handleWebviewContextMenu);
      window.removeEventListener("sanctuary-webview-contextmenu-close", handleWebviewContextClose);
      window.removeEventListener("mousedown", handleMouseDown, { capture: true });
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, { capture: true });
    };
  }, [isVisible, cardMenu]);

  const handleAction = (action: string) => {
    setIsVisible(false);
    setShowIconPicker(false);
    
    if (action.startsWith("spell_correct:")) {
        const suggestion = action.split(":")[1];
        if (misspelledInfo && targetElement) {
            let finalTarget = targetElement;
            const monacoContainer = targetElement.closest('.monaco-editor');
            if (monacoContainer) {
               const inputArea = monacoContainer.querySelector('.inputarea') as HTMLElement;
               if (inputArea) finalTarget = inputArea;
            }
            finalTarget.focus();
            
            const sel = window.getSelection();
            if (sel) {
                sel.removeAllRanges();
                sel.addRange(misspelledInfo.range);
                document.execCommand('insertText', false, suggestion);
            }
        }
        return;
    }
    
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
                   pushStatus(t("clipboard_read_error", "Failed to read clipboard"), "error");
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

  const menuBtnClass =
    "w-full rounded-xl text-left px-2.5 py-2 hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-xs font-bold text-[var(--text)] flex items-center justify-between gap-2.5 transition-all cursor-pointer group/ctxitem";
  const dangerMenuBtnClass =
    "w-full rounded-xl text-left px-2.5 py-2 hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-xs font-bold text-[var(--danger)] flex items-center justify-between gap-2.5 transition-all cursor-pointer group/ctxitem";
  const iconWellClass =
    "w-7 h-7 rounded-lg glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 transition-colors";

  if (cardMenu) {
    const estHeight = Math.min(480, 96 + cardMenu.config.items.length * 42);
    const clampedX = Math.max(12, Math.min(cardMenu.x, window.innerWidth - 308));
    const clampedY = Math.max(12, Math.min(cardMenu.y, window.innerHeight - estHeight));
    const openSubmenuLeft = cardMenu.x > window.innerWidth - 560;

    return createPortal(
      <div
        ref={cardMenuRef}
        style={{
          position: "fixed",
          left: clampedX,
          top: clampedY,
          zIndex: 120000,
        }}
        className="flex flex-col w-[292px] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <div
          style={{ overflow: "visible" }}
          className="w-full h-full glass-panel portal-glass-fix sa-dropdown-popover !overflow-visible rounded-2xl p-2 border border-[color-mix(in_srgb,var(--text)_14%,rgba(255,255,255,0.22))] shadow-[0_24px_60px_rgba(0,0,0,0.65)] flex flex-col gap-1"
        >
          {/* Liquid Glass Context Header Card */}
          <div className="flex items-center gap-3 p-2.5 mb-1 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
            <div
              className={`w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 ${
                cardMenu.config.iconColorClass || "text-[var(--accent)]"
              }`}
            >
              <span className="material-symbols-outlined !text-[18px]">
                {cardMenu.config.icon || t("icon_deployed_code", "deployed_code")}
              </span>
            </div>
            <div className="flex flex-col min-w-0 flex-1 gap-0.5">
              <span className="text-xs font-black text-[var(--text)] tracking-tight truncate">
                {cardMenu.config.title}
              </span>
              {(cardMenu.config.subtitle || cardMenu.config.statusLabel) && (
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[var(--subtext)] min-w-0">
                  {cardMenu.config.subtitle && (
                    <span className="truncate">{cardMenu.config.subtitle}</span>
                  )}
                  {cardMenu.config.subtitle && cardMenu.config.statusLabel && (
                    <span className="opacity-40 shrink-0">•</span>
                  )}
                  {cardMenu.config.statusLabel && (
                    <span className={`shrink-0 ${cardMenu.config.statusColorClass || "opacity-80"}`}>
                      {cardMenu.config.statusLabel}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {cardMenu.config.items.map((item, idx) => {
            const isDanger = item.variant === "danger" || Boolean(item.danger);
            const resolvedIconColor =
              item.iconColorClass ||
              (isDanger
                ? "text-[var(--danger)]"
                : item.variant === "success"
                  ? "text-[var(--success)]"
                  : item.variant === "warning"
                    ? "text-[var(--warning)]"
                    : "text-[var(--accent)]");
            const hasSubmenu = Array.isArray(item.submenu) && item.submenu.length > 0;
            const showDivider = Boolean(item.dividerBefore || item.divider);

            return (
              <React.Fragment key={item.id || `${item.label}_${idx}`}>
                {showDivider && (
                  <div
                    className={`w-full h-px bg-gradient-to-r from-transparent ${
                      isDanger
                        ? "via-[color-mix(in_srgb,var(--danger)_25%,transparent)]"
                        : "via-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                    } to-transparent my-0.5`}
                  />
                )}
                {hasSubmenu ? (
                  <div
                    className="relative"
                    onMouseEnter={() => setActiveSubmenuIdx(idx)}
                    onMouseLeave={() => setActiveSubmenuIdx(null)}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveSubmenuIdx((prev) => (prev === idx ? null : idx));
                      }}
                      className={menuBtnClass}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`${iconWellClass} ${resolvedIconColor}`}>
                          <span className="material-symbols-outlined !text-[15px]">
                            {item.icon}
                          </span>
                        </div>
                        <span className="truncate">{item.label}</span>
                      </div>
                      <span className="material-symbols-outlined !text-[16px] text-[var(--subtext)] opacity-60 shrink-0">
                        {t("icon_chevron_right", "chevron_right")}
                      </span>
                    </button>
                    {activeSubmenuIdx === idx && (
                      <div
                        className={`absolute top-0 w-64 pt-0 z-50 ${
                          openSubmenuLeft ? "right-full pr-1.5" : "left-full pl-1.5"
                        }`}
                      >
                        <div className="w-full glass-panel portal-glass-fix sa-dropdown-popover rounded-2xl p-2 border border-[color-mix(in_srgb,var(--text)_14%,rgba(255,255,255,0.22))] shadow-[0_24px_60px_rgba(0,0,0,0.65)] flex flex-col gap-1 max-h-64 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-150">
                          {item.submenu!.map((sub, sIdx) => {
                            const subDanger = sub.variant === "danger";
                            const subIconColor =
                              sub.iconColorClass ||
                              (sub.variant === "danger"
                                ? "text-[var(--danger)]"
                                : sub.variant === "success"
                                  ? "text-[var(--success)]"
                                  : sub.variant === "warning"
                                    ? "text-[var(--warning)]"
                                    : "text-[var(--accent)]");
                            return (
                              <React.Fragment key={sub.id || `${sub.label}_${sIdx}`}>
                                {sub.dividerBefore && (
                                  <div className="w-full h-px bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent my-0.5" />
                                )}
                                <button
                                  type="button"
                                  disabled={sub.disabled}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (sub.disabled) return;
                                    setCardMenu(null);
                                    setActiveSubmenuIdx(null);
                                    sub.onClick?.();
                                  }}
                                  className={`${subDanger ? dangerMenuBtnClass : menuBtnClass} ${
                                    sub.disabled ? "opacity-45 cursor-not-allowed" : ""
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div className={`${iconWellClass} ${subIconColor}`}>
                                      <span className="material-symbols-outlined !text-[15px]">
                                        {sub.icon}
                                      </span>
                                    </div>
                                    <span className="truncate">{sub.label}</span>
                                  </div>
                                  {sub.badge && (
                                    <span className="text-[10px] font-mono text-[var(--subtext)] opacity-75 shrink-0">
                                      {sub.badge}
                                    </span>
                                  )}
                                </button>
                              </React.Fragment>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={item.disabled}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (item.disabled) return;
                      setCardMenu(null);
                      setActiveSubmenuIdx(null);
                      item.onClick?.();
                    }}
                    className={`${isDanger ? dangerMenuBtnClass : menuBtnClass} ${
                      item.disabled ? "opacity-45 cursor-not-allowed" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`${iconWellClass} ${resolvedIconColor}`}>
                        <span className="material-symbols-outlined !text-[15px]">
                          {item.icon}
                        </span>
                      </div>
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className="text-[10px] font-mono text-[var(--subtext)] opacity-75 shrink-0">
                        {item.badge}
                      </span>
                    )}
                  </button>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>,
      document.body
    );
  }

  if (!isVisible) return null;

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top: position.y,
        left: position.x,
        zIndex: 9999999,
      }}
      className="flex"
    >
      <div
        className="w-56 h-max glass-panel portal-glass-fix sa-dropdown-popover rounded-2xl p-2 border border-[color-mix(in_srgb,var(--text)_14%,rgba(255,255,255,0.22))] shadow-[0_24px_60px_rgba(0,0,0,0.65)] flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-150"
        onContextMenu={(e) => e.preventDefault()}
      >
        {misspelledInfo && (
          <>
            <div className="px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-70">
              {t("spell_suggest", "Spelling Suggestions")}
            </div>
            {misspelledInfo.suggestions.map((suggestion) => (
              <button
                key={suggestion}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleAction(`spell_correct:${suggestion}`);
                }}
                className={menuBtnClass}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`${iconWellClass} text-[var(--accent)]`}>
                    <span className="material-symbols-outlined !text-[15px]">
                      {t("icon_spellcheck", "spellcheck")}
                    </span>
                  </div>
                  <span className="truncate">{suggestion}</span>
                </div>
              </button>
            ))}
            <div className="w-full h-px bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent my-0.5" />
          </>
        )}
        {!isReadOnly && (
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              handleAction("cut");
            }}
            className={menuBtnClass}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`${iconWellClass} text-[var(--accent)]`}>
                <span className="material-symbols-outlined !text-[15px]">
                  {t("icon_content_cut", "content_cut")}
                </span>
              </div>
              <span className="truncate">{t("ctx_cut", "Cut")}</span>
            </div>
          </button>
        )}
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            handleAction("copy");
          }}
          className={menuBtnClass}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`${iconWellClass} text-[var(--accent)]`}>
              <span className="material-symbols-outlined !text-[15px]">
                {t("icon_content_copy", "content_copy")}
              </span>
            </div>
            <span className="truncate">{t("btn_copy", "Copy")}</span>
          </div>
        </button>
        {!isReadOnly && (
          <>
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                handleAction("paste");
              }}
              className={menuBtnClass}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`${iconWellClass} text-[var(--accent)]`}>
                  <span className="material-symbols-outlined !text-[15px]">
                    {t("icon_content_paste", "content_paste")}
                  </span>
                </div>
                <span className="truncate">{t("ctx_paste", "Paste")}</span>
              </div>
            </button>
            {supportsIcons && (
              <>
                <div className="w-full h-px bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent my-0.5" />
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setShowIconPicker(!showIconPicker);
                  }}
                  className={`${menuBtnClass} ${
                    showIconPicker ? "bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" : ""
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`${iconWellClass} text-[var(--accent)]`}>
                      <span className="material-symbols-outlined !text-[15px]">
                        {t("icon_add_reaction", "add_reaction")}
                      </span>
                    </div>
                    <span className="truncate">{t("editor_tt_icon", "Insert Icon")}</span>
                  </div>
                  <span className="material-symbols-outlined !text-[16px] text-[var(--subtext)] opacity-60 shrink-0">
                    {showIconPicker
                      ? t("icon_expand_less", "expand_less")
                      : t("icon_chevron_right", "chevron_right")}
                  </span>
                </button>
              </>
            )}
            <div className="w-full h-px bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent my-0.5" />
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                handleAction("selectAll");
              }}
              className={menuBtnClass}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`${iconWellClass} text-[var(--accent)]`}>
                  <span className="material-symbols-outlined !text-[15px]">
                    {t("icon_select_all", "select_all")}
                  </span>
                </div>
                <span className="truncate">{t("btn_select_all", "Select All")}</span>
              </div>
            </button>
          </>
        )}
      </div>

      {showIconPicker && (
        <div
          className={`absolute top-0 ${
            position.x > window.innerWidth / 2
              ? "right-full mr-2 [&>div]:right-0"
              : "left-full ml-2 [&>div]:left-0"
          }`}
        >
          <IconPicker
            onSelect={(icon) => handleAction(`insert_icon:${icon}`)}
            onClose={() => setShowIconPicker(false)}
          />
        </div>
      )}
    </div>,
    document.body
  );
}
