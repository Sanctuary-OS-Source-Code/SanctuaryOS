import { useState, useMemo } from "react";
import Editor from "@monaco-editor/react";
import { useLexicon } from "../LexiconContext";
import {
  SidePanel,
  PanelHeaderGroup,
  PanelHeaderButton,
  SidePanelHeroCard,
  StatBox,
} from "../shared";
import { VAULT_CHIP_CLASS } from "../Cards";
import {
  defineSanctuaryMonacoThemes,
  useSanctuaryMonacoTheme,
} from "../utils/monacoTheme";

interface CodeSnippetSidebarProps {
  isOpen?: boolean;
  onClose: () => void;
  code: string | null;
  widthClass?: string;
  title?: string;
}

export default function CodeSnippetSidebar({
  isOpen = true,
  onClose,
  code,
  widthClass = "w-full md:w-[860px]",
  title,
}: CodeSnippetSidebarProps) {
  const { t } = useLexicon();
  const [copied, setCopied] = useState(false);
  const [wrapLines, setWrapLines] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const isLight =
    typeof document !== "undefined" &&
    document.body.classList.contains("theme-light");
  useSanctuaryMonacoTheme(isLight);

  const safeCode = code || "";

  const lines = useMemo(() => {
    if (!safeCode) return [];
    return safeCode.replace(/\r\n/g, "\n").split("\n");
  }, [safeCode]);

  const detectedLanguage = useMemo(() => {
    const trimmed = safeCode.trim();
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
  }, [safeCode, title]);

  if (!isOpen || !code) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `snippet-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("editor_mode", "Editor Mode")}
      subtitle={title || t("code_snippet", "Code Snippet")}
      icon={t("icon_code", "code")}
      iconColorClass="text-[var(--accent)]"
      isResizable={!isFullscreen}
      widthClass={isFullscreen ? "!w-full !max-w-[100vw]" : widthClass}
      panelClass={
        isFullscreen ? "!w-full !max-w-[100vw] !border-r-0 !rounded-none" : ""
      }
      headerActions={
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
            icon={t("icon_wrap_text", "wrap_text")}
            isActive={wrapLines}
            tooltip={t("wrap_text", "Wrap Text")}
            onClick={() => setWrapLines(!wrapLines)}
          />
          <PanelHeaderButton
            icon={t("icon_download", "download")}
            tooltip={t("download_txt", "Download .txt")}
            onClick={handleDownload}
          />
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
            onClick={() => setIsFullscreen(!isFullscreen)}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex-1 min-h-0 flex flex-col h-full w-full relative gap-3 pb-6">
        <SidePanelHeroCard
          title={title || t("code_snippet", "Code Snippet")}
          subtitle={t("code_snippet_desc", "Attached Code Block")}
          label={t("editor_mode", "Editor Mode")}
          icon={t("icon_code", "code")}
          variant="accent"
          badges={[
            {
              icon: t("icon_lock", "lock"),
              label: t("read_only", "Read Only"),
              colorClass:
                "text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_35%,transparent)]",
            },
          ]}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
            <StatBox
              label={t("label_format", "Format")}
              value={detectedLanguage.toUpperCase()}
              icon={t("icon_data_object", "data_object")}
              iconColorClass="text-[var(--accent)]"
            />
            <StatBox
              label={t("lines", "Lines")}
              value={lines.length}
              icon={t("icon_format_list_numbered", "format_list_numbered")}
              iconColorClass="text-[var(--accent)]"
            />
            <StatBox
              label={t("size", "Size")}
              value={`${(safeCode.length / 1024).toFixed(1)} KB`}
              icon={t("icon_memory", "memory")}
              iconColorClass="text-[var(--accent)]"
            />
          </div>
        </SidePanelHeroCard>

        <div className="monaco-wrapper relative flex flex-col flex-1 min-w-0 min-h-[420px] glass-surface rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] overflow-hidden shadow-inner">
          <div className="px-4 py-2.5 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--text)_3%,transparent)] flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
                {t("icon_code", "code")}
              </span>
              <span className="text-xs font-black font-mono text-[var(--text)] truncate">
                {title || t("code_snippet", "Code Snippet")}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                  {t("icon_data_object", "data_object")}
                </span>
                <span>{detectedLanguage.toUpperCase()}</span>
              </span>
            </div>
          </div>

          <div className="flex-1 w-full min-h-[380px] relative">
            <Editor
              height="100%"
              language={detectedLanguage}
              theme={isLight ? "sanctuary-light" : "sanctuary-dark"}
              beforeMount={(monaco) => {
                defineSanctuaryMonacoThemes(monaco);
              }}
              value={safeCode}
              options={{
                readOnly: true,
                domReadOnly: true,
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily:
                  "var(--font-mono), 'JetBrains Mono', 'Fira Code', Consolas, monospace",
                wordWrap: wrapLines ? "on" : "off",
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 16, bottom: 24 },
                renderLineHighlight: "all",
                smoothScrolling: true,
                folding: true,
                bracketPairColorization: { enabled: true },
              }}
            />
          </div>
        </div>
      </div>
    </SidePanel>
  );
}
