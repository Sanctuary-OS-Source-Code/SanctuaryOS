import React, { useState, useMemo } from "react";
import { useLexicon } from "../LexiconContext";
import {
  SidePanel,
  UniversalGroup,
  ActionButton,
  HoverTooltip,
} from "../shared";
import { VAULT_CHIP_CLASS } from "../Cards";

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
  widthClass = "w-[90vw] md:w-[760px]",
  title,
}: CodeSnippetSidebarProps) {
  const { t } = useLexicon();
  const [copied, setCopied] = useState(false);
  const [wrapLines, setWrapLines] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const safeCode = code || "";

  const lines = useMemo(() => {
    if (!safeCode) return [];
    return safeCode.replace(/\r\n/g, "\n").split("\n");
  }, [safeCode]);

  const trimmedQuery = searchQuery.trim().toLowerCase();

  const matchingLineIndices = useMemo(() => {
    if (!trimmedQuery) return new Set<number>();
    const set = new Set<number>();
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(trimmedQuery)) {
        set.add(i);
      }
    }
    return set;
  }, [lines, trimmedQuery]);

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

  const renderHighlightedLine = (lineText: string) => {
    if (!lineText) return "\u00A0";
    if (!trimmedQuery) return lineText;

    const escaped = trimmedQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const parts = lineText.split(new RegExp(`(${escaped})`, "gi"));
    if (parts.length === 1) return lineText;

    return parts.map((part, idx) =>
      part.toLowerCase() === trimmedQuery ? (
        <mark
          key={idx}
          className="bg-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--text)] rounded px-0.5 font-bold"
        >
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={title || t("code_snippet", "Code Snippet")}
      subtitle={t("code_snippet_desc", "Attached Code Block")}
      icon={t("icon_data_object", "data_object")}
      widthClass={widthClass}
      headerActions={
        <div className="flex items-center gap-1.5">
          <div className="relative group flex items-center">
            <ActionButton
              onClick={() => setWrapLines(!wrapLines)}
              variant="glass"
              icon={t("icon_wrap_text", "wrap_text")}
              className={`!px-2.5 !py-1.5 !text-[10px] ${
                wrapLines
                  ? "!border-[var(--accent)] !text-[var(--accent)]"
                  : ""
              }`}
            />
            <HoverTooltip
              title={t("wrap_text", "Wrap Text")}
              variant="accent"
            />
          </div>
          <div className="relative group flex items-center">
            <ActionButton
              onClick={handleDownload}
              variant="glass"
              icon={t("icon_download", "download")}
              className="!px-2.5 !py-1.5 !text-[10px]"
            />
            <HoverTooltip
              title={t("download_txt", "Download .txt")}
              variant="accent"
            />
          </div>
          <ActionButton
            onClick={handleCopy}
            variant="accent"
            icon={
              copied
                ? t("icon_check", "check")
                : t("icon_content_copy", "content_copy")
            }
            className="!px-3 !py-1.5 !text-[10px]"
          >
            {copied ? t("copied", "Copied!") : t("copy_code", "Copy Code")}
          </ActionButton>
        </div>
      }
    >
      <div className="flex flex-col gap-4 pb-8">
        {/* Search & Telemetry Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="relative flex-1 min-w-[200px] flex items-center">
            <span className="material-symbols-outlined !text-[15px] text-[var(--subtext)] absolute left-3.5 pointer-events-none">
              {t("icon_search", "search")}
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("search_code_placeholder", "Search code...")}
              className="w-full h-9 pl-9 pr-8 rounded-xl glass-surface text-xs text-[var(--text)] outline-none focus:border-[var(--accent)] transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 text-[var(--subtext)] hover:text-[var(--text)] flex items-center justify-center cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[14px]">
                  {t("icon_close", "close")}
                </span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {trimmedQuery && (
              <span
                className={`${VAULT_CHIP_CLASS} !border-[color-mix(in_srgb,var(--accent)_40%,transparent)] !text-[var(--accent)]`}
              >
                <span className="material-symbols-outlined !text-[12px]">
                  {t("icon_find_in_page", "find_in_page")}
                </span>
                {matchingLineIndices.size} / {lines.length}
              </span>
            )}
            <span className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t("icon_format_list_numbered", "format_list_numbered")}
              </span>
              {lines.length} {t("lines", "Lines")}
            </span>
            <span className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t("icon_data_object", "data_object")}
              </span>
              {(safeCode.length / 1024).toFixed(1)} KB
            </span>
          </div>
        </div>

        <UniversalGroup
          title={t("code_viewer", "Code Viewer")}
          icon={t("icon_terminal", "terminal")}
        >
          <div className="w-full rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] overflow-x-auto custom-scrollbar py-3">
            <div className="font-mono text-[12px] leading-[1.65] text-[var(--text)] min-w-full">
              {lines.map((line, idx) => {
                const isMatch = matchingLineIndices.has(idx);
                return (
                  <div
                    key={idx}
                    className={`flex items-start px-3 transition-colors ${
                      isMatch
                        ? "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]"
                        : "hover:bg-[rgba(var(--text-rgb),0.03)]"
                    }`}
                  >
                    <span className="w-9 shrink-0 select-none text-right pr-3 text-[10px] font-mono text-[var(--subtext)] opacity-45 pt-[1px]">
                      {idx + 1}
                    </span>
                    <span
                      className={`flex-1 min-w-0 ${
                        wrapLines
                          ? "whitespace-pre-wrap break-words"
                          : "whitespace-pre"
                      }`}
                    >
                      {renderHighlightedLine(line)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </UniversalGroup>
      </div>
    </SidePanel>
  );
}
