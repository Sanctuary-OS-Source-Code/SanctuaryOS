import { useState, useMemo, useRef, useEffect } from "react";
import Editor from "@monaco-editor/react";
import { useLexicon } from "../LexiconContext";
import { useTheme } from "../ThemeContext";
import {
  SidePanel,
  PanelHeaderGroup,
  PanelHeaderButton,
} from "../shared";
import { VAULT_CHIP_CLASS } from "../Cards";
import {
  defineSanctuaryMonacoThemes,
  useSanctuaryMonacoTheme,
  isThemeLight,
} from "../utils/monacoTheme";
import LexiconVisualStudio from "../hub-components/LexiconVisualStudio";
import SchemaVisualStudio from "../hub-components/SchemaVisualStudio";
import enDefaultRaw from "../lexicons/en-default.json";

interface CodeSnippetSidebarProps {
  isOpen?: boolean;
  onClose: () => void;
  code: string | null;
  widthClass?: string;
  title?: string;
  backdropZ?: string;
  panelZ?: string;
}

export default function CodeSnippetSidebar({
  isOpen = true,
  onClose,
  code,
  widthClass = "w-[90vw] md:w-[760px]",
  title,
  backdropZ = "z-[120000]",
  panelZ = "z-[120001]",
}: CodeSnippetSidebarProps) {
  const { t } = useLexicon();
  const { currentTheme } = useTheme();
  const [copied, setCopied] = useState(false);
  const [wrapLines, setWrapLines] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showReference, setShowReference] = useState(false);
  const [isScrollLocked, setIsScrollLocked] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );
  const leftEditorRef = useRef<any>(null);
  const rightEditorRef = useRef<any>(null);
  const isSyncingScroll = useRef(false);

  const isLight = useMemo(() => {
    if (typeof document !== "undefined" && document.body.classList.contains("theme-light")) {
      return true;
    }
    return isThemeLight(currentTheme);
  }, [currentTheme]);

  useSanctuaryMonacoTheme(currentTheme, isLight);

  useEffect(() => {
    const handleResize = () => {
      setIsMobileViewport(window.innerWidth < 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const safeCode = code || "";
  const [workingContent, setWorkingContent] = useState<string>(safeCode);

  useEffect(() => {
    setWorkingContent(code || "");
  }, [code]);

  const isLexiconSnippet = useMemo(() => {
    const lowerTitle = (title || "").toLowerCase();
    return Boolean(
      safeCode.includes('"_meta_lang"') ||
        safeCode.includes('"a_citizen"') ||
        safeCode.includes('"term_mod"') ||
        safeCode.includes('"vault_title"') ||
        (safeCode.includes('"save"') && safeCode.includes('"cancel"')) ||
        lowerTitle.includes("lexicon") ||
        lowerTitle.match(/^[a-z]{2}-.+\.json$/i) !== null ||
        lowerTitle === "simlish.json"
    );
  }, [safeCode, title]);

  const isSchemaSnippet = useMemo(() => {
    return Boolean(
      !isLexiconSnippet &&
        safeCode.includes('"schema_version"') &&
        !safeCode.includes('"template_id"')
    );
  }, [safeCode, isLexiconSnippet]);

  const hasVisualStudio = isLexiconSnippet || isSchemaSnippet;
  const [editorViewMode, setEditorViewMode] = useState<"visual" | "split" | "raw">("raw");

  useEffect(() => {
    setEditorViewMode(hasVisualStudio ? "visual" : "raw");
  }, [hasVisualStudio, title]);

  const effectiveViewMode: "visual" | "split" | "raw" =
    isMobileViewport && editorViewMode === "split" ? "visual" : editorViewMode;
  const effectiveShowReference = !isMobileViewport && showReference && isLexiconSnippet;

  useEffect(() => {
    if (!isScrollLocked || !leftEditorRef.current || !rightEditorRef.current) return;
    const leftEditor = leftEditorRef.current;
    const rightEditor = rightEditorRef.current;

    const leftSub = leftEditor.onDidScrollChange((e: any) => {
      if (isSyncingScroll.current) return;
      isSyncingScroll.current = true;
      const leftH = leftEditor.getScrollHeight() - leftEditor.getLayoutInfo().height;
      const perc = leftH > 0 ? e.scrollTop / leftH : 0;
      const rightH = rightEditor.getScrollHeight() - rightEditor.getLayoutInfo().height;
      rightEditor.setScrollTop(perc * rightH);
      setTimeout(() => {
        isSyncingScroll.current = false;
      }, 10);
    });

    const rightSub = rightEditor.onDidScrollChange((e: any) => {
      if (isSyncingScroll.current) return;
      isSyncingScroll.current = true;
      const rightH = rightEditor.getScrollHeight() - rightEditor.getLayoutInfo().height;
      const perc = rightH > 0 ? e.scrollTop / rightH : 0;
      const leftH = leftEditor.getScrollHeight() - leftEditor.getLayoutInfo().height;
      leftEditor.setScrollTop(perc * leftH);
      setTimeout(() => {
        isSyncingScroll.current = false;
      }, 10);
    });

    return () => {
      leftSub.dispose();
      rightSub.dispose();
    };
  }, [isScrollLocked, effectiveShowReference, effectiveViewMode]);

  const lines = useMemo(() => {
    if (!workingContent) return [];
    return workingContent.replace(/\r\n/g, "\n").split("\n");
  }, [workingContent]);

  const detectedLanguage = useMemo(() => {
    const trimmed = workingContent.trim();
    const lowerTitle = (title || "").toLowerCase();
    if (
      lowerTitle.endsWith(".json") ||
      trimmed.startsWith("{") ||
      trimmed.startsWith("[") ||
      /^\s*"[^"]+"\s*:/.test(trimmed)
    ) {
      return "json";
    }
    if (
      lowerTitle.endsWith(".xml") ||
      lowerTitle.endsWith(".html") ||
      trimmed.startsWith("<")
    ) {
      return "xml";
    }
    if (
      lowerTitle.endsWith(".py") ||
      /^(def |import |from |class )/m.test(trimmed)
    ) {
      return "python";
    }
    if (
      lowerTitle.endsWith(".ts") ||
      lowerTitle.endsWith(".tsx") ||
      lowerTitle.endsWith(".js") ||
      /^(export |const |function |interface )/m.test(trimmed)
    ) {
      return "typescript";
    }
    if (
      lowerTitle.endsWith(".cfg") ||
      lowerTitle.endsWith(".ini") ||
      /^\[[^\]]+\]/m.test(trimmed)
    ) {
      return "ini";
    }
    return "json";
  }, [workingContent, title]);

  if (!isOpen || !code) return null;

  const ensureSanctuaryThemes = (monaco: any) => {
    defineSanctuaryMonacoThemes(monaco, currentTheme);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(workingContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const ext = detectedLanguage === "json" ? "json" : "txt";
    const blob = new Blob([workingContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(title || `snippet-${Date.now()}`).replace(/[^a-z0-9_-]/gi, "_")}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderVisualPane = () => {
    if (isLexiconSnippet) {
      return (
        <LexiconVisualStudio
          content={workingContent}
          onChange={(val) => setWorkingContent(val || "")}
          referenceData={enDefaultRaw}
          fileName={title || "lexicon.json"}
        />
      );
    }
    if (isSchemaSnippet) {
      return (
        <SchemaVisualStudio
          content={workingContent}
          onChange={(val) => setWorkingContent(val || "")}
          fileName={title || "schema.json"}
        />
      );
    }
    return null;
  };

  const renderMonacoPane = () => (
    <div className="flex-1 min-h-0 relative flex flex-col h-full w-full">
      <div className="px-5 py-2.5 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 shrink-0 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
            {detectedLanguage === "json"
              ? t("icon_data_object", "data_object")
              : t("icon_code", "code")}
          </span>
          <span className="text-xs font-black text-[var(--text)] truncate font-mono">
            {title || t("code_snippet", "Code Snippet")}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={() => setWrapLines((w) => !w)}
            className={`${VAULT_CHIP_CLASS} ${
              wrapLines ? "sa-glass-pill-active" : "hover:sa-glass-pill-active"
            } transition-all cursor-pointer`}
          >
            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
              {t("icon_wrap_text", "wrap_text")}
            </span>
            <span>{t("ide_toggle_word_wrap", "Wrap Text")}</span>
          </button>

          {!isMobileViewport && isLexiconSnippet && effectiveViewMode === "raw" && (
            <>
              <button
                type="button"
                onClick={() => setShowReference((prev) => !prev)}
                className={`${VAULT_CHIP_CLASS} ${
                  effectiveShowReference
                    ? "sa-glass-pill-active"
                    : "hover:sa-glass-pill-active"
                } transition-all cursor-pointer`}
              >
                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                  {effectiveShowReference
                    ? t("icon_vertical_split", "vertical_split")
                    : t("icon_splitscreen", "splitscreen")}
                </span>
                <span>{t("btn_reference", "Toggle Reference Split")}</span>
              </button>
              {effectiveShowReference && (
                <button
                  type="button"
                  onClick={() => setIsScrollLocked((prev) => !prev)}
                  className={`${VAULT_CHIP_CLASS} ${
                    isScrollLocked ? "sa-glass-pill-active" : "hover:sa-glass-pill-active"
                  } transition-all cursor-pointer`}
                >
                  <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                    {isScrollLocked
                      ? t("icon_lock", "lock")
                      : t("icon_lock_open", "lock_open")}
                  </span>
                  <span>{t("sync_scroll", "Sync Scroll")}</span>
                </button>
              )}
            </>
          )}

          <span className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
              {t("icon_data_object", "data_object")}
            </span>
            <span>{detectedLanguage.toUpperCase()}</span>
          </span>

          <span className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
              {t("icon_format_list_numbered", "format_list_numbered")}
            </span>
            <span>
              {lines.length.toLocaleString()} {t("lines", "Lines")}
            </span>
          </span>

          <span className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
              {t("icon_memory", "memory")}
            </span>
            <span>{`${(workingContent.length / 1024).toFixed(1)} KB`}</span>
          </span>
        </div>
      </div>

      <div className="monaco-wrapper flex-1 min-h-0 relative w-full">
        <Editor
          height="100%"
          language={detectedLanguage}
          theme={isLight ? "sanctuary-glass-light" : "sanctuary-glass-dark"}
          beforeMount={ensureSanctuaryThemes}
          value={workingContent}
          onMount={(editor, monaco) => {
            ensureSanctuaryThemes(monaco);
            monaco.editor.setTheme(
              isLight ? "sanctuary-glass-light" : "sanctuary-glass-dark"
            );
            leftEditorRef.current = editor;
            (window as any).monaco = monaco;
          }}
          options={{
            readOnly: true,
            domReadOnly: true,
            contextmenu: false,
            minimap: { enabled: false },
            fontSize: isMobileViewport ? 12 : 14,
            fontFamily:
              "var(--font-mono), 'JetBrains Mono', 'Fira Code', Consolas, monospace",
            lineHeight: isMobileViewport ? 20 : 24,
            lineNumbersMinChars: isMobileViewport ? 3 : 5,
            wordWrap: wrapLines ? "on" : "off",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 16, bottom: isMobileViewport ? 48 : 80 },
            renderLineHighlight: "all",
            smoothScrolling: true,
            cursorBlinking: "smooth",
            folding: !isMobileViewport,
            glyphMargin: false,
            bracketPairColorization: { enabled: true },
            scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
          }}
        />
      </div>
    </div>
  );

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={
        isLexiconSnippet
          ? t("tools_ide", "{Mason} Editor")
          : t("editor_mode", "Editor Mode")
      }
      subtitle={
        title ||
        (isLexiconSnippet
          ? t("lex_studio_glossary_title", "Core Terminology Matrix")
          : t("code_snippet", "Code Snippet"))
      }
      icon={isLexiconSnippet ? t("icon_translate", "translate") : t("icon_code", "code")}
      iconColorClass="text-[var(--accent)]"
      isResizable={!isFullscreen}
      defaultWidth={
        isFullscreen
          ? typeof window !== "undefined"
            ? window.innerWidth
            : 1400
          : effectiveShowReference || (hasVisualStudio && effectiveViewMode === "split")
            ? 1220
            : 760
      }
      widthClass={isFullscreen ? "!w-full !max-w-[100vw]" : widthClass}
      backdropZ={backdropZ}
      panelZ={panelZ}
      panelClass={
        isFullscreen
          ? "!w-full !max-w-[100vw] !border-r-0 !rounded-none transition-all duration-500"
          : "transition-all duration-500"
      }
      headerActions={
        <>
          {hasVisualStudio && (
            <PanelHeaderGroup className="mr-1">
              <PanelHeaderButton
                icon={t("icon_auto_awesome", "auto_awesome")}
                tooltip={t("lex_studio_visual", "Visual Studio")}
                isActive={effectiveViewMode === "visual"}
                onClick={() => setEditorViewMode("visual")}
              />
              {!isMobileViewport && (
                <PanelHeaderButton
                  icon={t("icon_vertical_split", "vertical_split")}
                  tooltip={t("lex_studio_split", "Split View")}
                  isActive={effectiveViewMode === "split"}
                  onClick={() => setEditorViewMode("split")}
                />
              )}
              <PanelHeaderButton
                icon={t("icon_data_object", "data_object")}
                tooltip={t("lex_studio_raw", "Raw JSON")}
                isActive={effectiveViewMode === "raw"}
                onClick={() => setEditorViewMode("raw")}
              />
            </PanelHeaderGroup>
          )}

          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={
                copied
                  ? t("icon_check", "check")
                  : t("icon_content_copy", "content_copy")
              }
              variant={copied ? "success" : "accent"}
              tooltip={copied ? t("copied", "Copied!") : t("copy_code", "Copy Code")}
              onClick={handleCopy}
            />
            <PanelHeaderButton
              icon={t("icon_download", "download")}
              tooltip={t("download_txt", "Download .txt")}
              onClick={handleDownload}
            />
            {!isMobileViewport && (
              <PanelHeaderButton
                icon={
                  isFullscreen
                    ? t("icon_fullscreen_exit", "fullscreen_exit")
                    : t("icon_fullscreen", "fullscreen")
                }
                tooltip={
                  isFullscreen
                    ? t("btn_exit_fullscreen", "Exit Fullscreen")
                    : t("btn_fullscreen", "Fullscreen")
                }
                isActive={isFullscreen}
                onClick={() => setIsFullscreen(!isFullscreen)}
              />
            )}
          </PanelHeaderGroup>
        </>
      }
    >
      <div className="absolute inset-0 flex flex-col w-full min-w-full">
        <div className="flex-1 relative flex flex-col md:flex-row w-full min-w-full h-full min-h-0">
          {hasVisualStudio && effectiveViewMode === "visual" ? (
            <div className="w-full h-full min-w-0 flex flex-col">{renderVisualPane()}</div>
          ) : hasVisualStudio && effectiveViewMode === "split" ? (
            <>
              <div className="w-1/2 h-full min-w-0 flex flex-col">{renderVisualPane()}</div>
              <div className="w-1/2 relative h-full min-w-0 border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col bg-[color-mix(in_srgb,var(--bg)_30%,transparent)]">
                {renderMonacoPane()}
              </div>
            </>
          ) : (
            <>
              <div
                style={{ width: effectiveShowReference ? "50%" : "100%" }}
                className="flex-shrink-0 w-full flex flex-col relative h-full min-w-0"
              >
                {renderMonacoPane()}
              </div>
              {effectiveShowReference && (
                <div className="w-1/2 relative h-full min-w-0 border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col bg-[color-mix(in_srgb,var(--bg)_30%,transparent)]">
                  <div className="px-5 py-2.5 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined !text-[15px] text-[var(--subtext)]">
                        {t("icon_menu_book", "menu_book")}
                      </span>
                      <span className="text-xs font-black text-[var(--subtext)] truncate font-mono">
                        en-default.json ({t("reference", "Reference")})
                      </span>
                    </div>
                  </div>
                  <div className="monaco-wrapper flex-1 min-h-0 relative w-full">
                    <Editor
                      height="100%"
                      language="json"
                      theme={isLight ? "sanctuary-glass-light" : "sanctuary-glass-dark"}
                      beforeMount={ensureSanctuaryThemes}
                      value={JSON.stringify(enDefaultRaw, null, 2)}
                      onMount={(editor, monaco) => {
                        ensureSanctuaryThemes(monaco);
                        monaco.editor.setTheme(
                          isLight ? "sanctuary-glass-light" : "sanctuary-glass-dark"
                        );
                        rightEditorRef.current = editor;
                      }}
                      options={{
                        readOnly: true,
                        domReadOnly: true,
                        contextmenu: false,
                        minimap: { enabled: false },
                        fontSize: 13,
                        fontFamily:
                          "var(--font-mono), 'JetBrains Mono', 'Fira Code', Consolas, monospace",
                        lineHeight: 22,
                        wordWrap: wrapLines ? "on" : "off",
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        padding: { top: 16, bottom: 80 },
                        renderLineHighlight: "all",
                        smoothScrolling: true,
                        folding: true,
                        scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
                      }}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </SidePanel>
  );
}
