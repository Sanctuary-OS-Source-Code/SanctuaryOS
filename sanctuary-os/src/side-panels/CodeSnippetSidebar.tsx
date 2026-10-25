import React from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  SidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  ActionButton,
  PanelHeaderGroup,
  PanelHeaderButton,
} from "../shared";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { scrubLogUserData } from "../utils/logScrubber";

interface CodeSnippetSidebarProps {
  code: string;
  title?: string;
  onClose: () => void;
  widthClass?: string;
}

export default function CodeSnippetSidebar({
  code,
  title,
  onClose,
}: CodeSnippetSidebarProps) {
  const { t } = useLexicon();
  const [wrapText, setWrapText] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = React.useState(0);
  const markRefs = React.useRef<(HTMLElement | null)[]>([]);
  const safeCode = React.useMemo(() => scrubLogUserData(code || ""), [code]);

  React.useEffect(() => {
    setCurrentMatchIndex(0);
  }, [searchTerm]);

  React.useEffect(() => {
    if (markRefs.current[currentMatchIndex]) {
      markRefs.current[currentMatchIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [currentMatchIndex, searchTerm]);

  const escapeRegExp = (string: string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  };

  const matchCount = searchTerm
    ? (safeCode.match(new RegExp(escapeRegExp(searchTerm), "gi")) || []).length
    : 0;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (matchCount > 0) {
        if (e.shiftKey) {
          setCurrentMatchIndex((prev) => (prev - 1 + matchCount) % matchCount);
        } else {
          setCurrentMatchIndex((prev) => (prev + 1) % matchCount);
        }
      }
    }
  };

  const lineCount = safeCode ? safeCode.split(/\r\n|\r|\n/).length : 0;

  return (
    <SidePanel
      isOpen={true}
      onClose={onClose}
      title={title || t("code_snippet", "Code Snippet")}
      subtitle={`${lineCount} ${t("label_lines", "Lines")}`}
      icon={t("icon_data_object", "data_object")}
      iconColorClass="text-[var(--accent)]"
      panelZ="z-[60001]"
      backdropZ="z-[60000]"
      isResizable={true}
      defaultWidth={750}
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={t("icon_content_copy", "content_copy")}
            tooltip={t("ui_btn_copy_all", "Copy All")}
            onClick={() => {
              navigator.clipboard.writeText(safeCode);
              useStore.getState().pushStatus(t("alert_copied", "Copied!"));
            }}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_data_object", "data_object")}
          overline={t("code_snippet", "Code Snippet")}
          title={title || t("code_snippet", "Source Output")}
          badge={`${lineCount} ${t("label_lines", "Lines")}`}
          badgeIcon={t("icon_terminal", "terminal")}
          variant="accent"
        >
          <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full">
            <div className="relative flex-1 w-full flex items-center glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus-within:border-[var(--accent)] rounded-xl px-3.5 h-11 transition-all">
              <span className="material-symbols-outlined !text-[18px] text-[var(--subtext)] mr-2.5">
                {t("icon_search", "search")}
              </span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t(
                  "ui_placeholder_search_code",
                  "Search within code..."
                )}
                className="w-full bg-transparent border-none text-xs font-bold text-[var(--text)] focus:outline-none placeholder:text-[var(--subtext)] placeholder:opacity-50"
              />
              {searchTerm && (
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="text-[10px] font-black text-[var(--accent)] bg-transparent px-2 py-0.5 rounded-md border border-[color-mix(in_srgb,var(--accent)_35%,transparent)]">
                    {matchCount > 0
                      ? `${currentMatchIndex + 1} / ${matchCount}`
                      : "0"}
                  </span>
                  <button
                    onClick={() => setSearchTerm("")}
                    className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--subtext)] hover:text-[var(--text)] cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[15px]">
                      {t("icon_close", "close")}
                    </span>
                  </button>
                </div>
              )}
            </div>

            <ActionButton
              variant="glass"
              icon={
                wrapText
                  ? t("icon_wrap_text", "wrap_text")
                  : t("icon_segment", "segment")
              }
              label={t("ui_btn_wrap_text", "Wrap Text")}
              onClick={() => setWrapText(!wrapText)}
              className={`!h-11 ${
                wrapText
                  ? "!text-[var(--accent)] !border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
                  : ""
              }`}
            />
          </div>
        </SidePanelHeroCard>

        <UniversalGroup
          title={title || t("code_snippet", "Code Output")}
          icon={t("icon_terminal", "terminal")}
          headerAction={
            <ActionButton
              variant="glass"
              icon={t("icon_content_copy", "content_copy")}
              label={t("ui_btn_copy_all", "Copy")}
              onClick={() => {
                navigator.clipboard.writeText(safeCode);
                useStore.getState().pushStatus(t("alert_copied", "Copied!"));
              }}
            />
          }
        >
          <div className="w-full rounded-xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] glass-surface max-h-[65vh] overflow-y-auto custom-scrollbar">
            {!searchTerm ? (
              <SyntaxHighlighter
                language="javascript"
                style={vscDarkPlus}
                showLineNumbers={!wrapText}
                codeTagProps={
                  wrapText
                    ? {
                        style: {
                          wordBreak: "break-all",
                          overflowWrap: "anywhere",
                          whiteSpace: "pre-wrap",
                        },
                      }
                    : undefined
                }
                customStyle={{
                  margin: 0,
                  padding: "1.25rem",
                  background: "transparent",
                  fontSize: "12px",
                  lineHeight: "1.6",
                  ...(wrapText
                    ? {
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-all",
                        overflowWrap: "anywhere",
                      }
                    : {}),
                }}
              >
                {safeCode}
              </SyntaxHighlighter>
            ) : (
              <pre
                className="m-0 p-5 bg-transparent text-xs leading-[1.6] text-[var(--text)] font-mono"
                style={{
                  whiteSpace: wrapText ? "pre-wrap" : "pre",
                  wordBreak: wrapText ? "break-all" : "normal",
                  overflowWrap: "anywhere",
                }}
              >
                {(() => {
                  markRefs.current = [];
                  let matchIndexCounter = -1;
                  return safeCode
                    .split(new RegExp(`(${escapeRegExp(searchTerm)})`, "gi"))
                    .map((part, i) => {
                      if (part.toLowerCase() === searchTerm.toLowerCase()) {
                        matchIndexCounter++;
                        const isCurrent =
                          matchIndexCounter === currentMatchIndex;
                        return (
                          <mark
                            key={i}
                            ref={(el) => {
                              if (el) markRefs.current.push(el);
                            }}
                            className={`bg-transparent border border-[var(--accent)] text-[var(--accent)] font-black px-1 py-0.5 rounded ${
                              isCurrent ? "ring-2 ring-[var(--accent)]" : ""
                            }`}
                          >
                            {part}
                          </mark>
                        );
                      }
                      return <span key={i}>{part}</span>;
                    });
                })()}
              </pre>
            )}
          </div>
        </UniversalGroup>
      </div>
    </SidePanel>
  );
}
