import React, { useState, useEffect, useMemo } from "react";
import { useLexicon } from "../../LexiconContext";
import { StatBox } from "../universal/UniversalLayout";
import { HoverTooltip } from "../../shared-components/alerts";
import { getKeepersPipelineConfig, DEFAULT_KEEPERS_PIPELINE_CONFIG, KeepersPipelineConfig } from "../../utils/supporterManager";
import packageJson from "../../../package.json";
import bundledCommunityBlog from "../../../../Release Notes (Community Blog).md?raw";
import bundledNerdChangelog from "../../../../changelog.md?raw";
import { cleanCardParagraph, parseMarkdownIntoReleaseSections } from "./releaseMarkdownParser";
import { parseSeedCommunityBlog, parseLatestChangelogBlock } from "./releasePostSerializers";

export function renderCleanInlineText(text: string): React.ReactNode {
  const sanitized = (text || "")
    .replace(/^[\s\u200B\uFEFF#\\]+/, "")
    .replace(/\\\*/g, "*")
    .replace(/\\_/g, "_")
    .replace(/\\`/g, "`");
  const parts = sanitized.split(
    /(\\?\[ICON:[a-zA-Z0-9_-]+\\?\]|\*\*[\s\S]+?\*\*|__[\s\S]+?__|`[^`]+`|\*[^*\n]+\*)/gi
  );
  return parts.map((part, idx) => {
    const iconMatch = part.match(/^\\?\[ICON:([a-zA-Z0-9_-]+)\\?\]$/i);
    if (iconMatch) {
      const iconName = iconMatch[1].toLowerCase();
      return (
        <span
          key={idx}
          className="material-symbols-outlined !text-[15px] align-middle mx-0.5 text-[var(--accent)] inline-block leading-none"
        >
          {iconName}
        </span>
      );
    }
    if (
      ((part.startsWith("**") && part.endsWith("**")) ||
        (part.startsWith("__") && part.endsWith("__"))) &&
      part.length > 4
    ) {
      return (
        <strong key={idx} className="font-black text-[var(--text)]">
          {renderCleanInlineText(
            part.slice(2, -2).replace(/^[\s\u200B\uFEFF#\\]+/, "")
          )}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={idx}
          className="px-2 py-0.5 rounded-lg bg-[color-mix(in_srgb,var(--text)_6%,transparent)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] font-sans text-[11px] font-bold text-[var(--text)]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return (
        <em key={idx} className="italic text-[var(--text)]">
          {renderCleanInlineText(
            part.slice(1, -1).replace(/^[\s\u200B\uFEFF#\\]+/, "")
          )}
        </em>
      );
    }
    return <React.Fragment key={idx}>{part.replace(/\*\*/g, "")}</React.Fragment>;
  });
}

export function useStableReleaseMeta(): {
  stableVersion: string;
  stableDateDisplay: string;
} {
  const seedPublicBlog = useMemo(
    () => parseSeedCommunityBlog(bundledCommunityBlog),
    []
  );
  const seedChangelog = useMemo(
    () => parseLatestChangelogBlock(bundledNerdChangelog),
    []
  );
  const [pipelineConfig, setPipelineConfig] = useState<KeepersPipelineConfig>(
    DEFAULT_KEEPERS_PIPELINE_CONFIG
  );

  useEffect(() => {
    let active = true;
    getKeepersPipelineConfig()
      .then((cfg) => {
        if (active && cfg) setPipelineConfig(cfg);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const stableVersion = (
    pipelineConfig.stable_version ||
    seedPublicBlog.version ||
    packageJson.version.split("-")[0] ||
    packageJson.version ||
    "0.6.0"
  )
    .replace(/^v/i, "")
    .trim();

  const rawDate =
    seedPublicBlog.releaseDate ||
    (pipelineConfig.stable_published_at
      ? new Date(pipelineConfig.stable_published_at).toLocaleDateString()
      : seedChangelog.date || "10/28/2026");

  const stableDateDisplay = (() => {
    const trimmed = (rawDate || "").trim();
    if (!trimmed) return "";
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(trimmed)) return trimmed;
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString();
    }
    return trimmed;
  })();

  return { stableVersion, stableDateDisplay };
}

export function LegalDocVersionInfoBlock({
  content,
  updatedAt,
}: {
  content?: string;
  updatedAt?: string;
} = {}) {
  const { t } = useLexicon();
  const { stableVersion, stableDateDisplay } = useStableReleaseMeta();

  const resolvedDate = React.useMemo(() => {
    if (content) {
      const dateMatch = content.match(
        /\*\*(?:Effective Date|Last Updated|Last Synchronized):\*\*\s*([^\n\r]+)/i,
      );
      if (dateMatch?.[1]?.trim()) {
        return dateMatch[1].trim();
      }
    }
    if (updatedAt) {
      const parsed = new Date(updatedAt);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString();
      }
    }
    return stableDateDisplay;
  }, [content, updatedAt, stableDateDisplay]);

  const resolvedVersion = React.useMemo(() => {
    if (content) {
      const verMatch = content.match(
        /\*\*(?:Document Version|Version):\*\*\s*([^\n\r]+)/i,
      );
      if (verMatch?.[1]?.trim()) {
        return verMatch[1].trim();
      }
    }
    return `v${stableVersion}`;
  }, [content, stableVersion]);

  return (
    <div className="grid grid-cols-2 gap-3 w-full">
      <StatBox
        className="w-full"
        icon={t("icon_calendar_today", "calendar_today")}
        iconColorClass="text-[var(--accent)]"
        label={t("updated_date", "Last Updated")}
        value={resolvedDate}
        tooltipSubtitle={resolvedDate}
      />
      <StatBox
        className="w-full"
        icon={t("icon_tag", "tag")}
        iconColorClass="text-[var(--accent)]"
        label={t("release_notes_meta_version", "Version Number")}
        value={resolvedVersion}
        tooltipSubtitle={resolvedVersion}
      />
    </div>
  );
}

export function StructuredReleaseNotesView({
  content,
  forceTranslate,
  hideIntro = false,
  hideImages = false,
}: {
  content: string;
  forceTranslate?: boolean;
  hideIntro?: boolean;
  hideImages?: boolean;
}) {
  const { t, td } = useLexicon();
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const translatedContent = td ? td(content || "", { forceTranslate }) : (content || "");
  const parsed = useMemo(
    () => parseMarkdownIntoReleaseSections(translatedContent),
    [translatedContent]
  );

  const resolveSectionIcon = (title: string, explicitIcon?: string) => {
    if (explicitIcon) {
      return t(`icon_${explicitIcon}`, explicitIcon);
    }
    const inlineMatch = (title || "").match(/\\?\[ICON:([a-zA-Z0-9_-]+)\\?\]/i);
    if (inlineMatch) {
      const iconKey = inlineMatch[1].toLowerCase();
      return t(`icon_${iconKey}`, iconKey);
    }
    const lower = (title || "").toLowerCase();
    if (lower.includes("tl;dr") || lower.includes("summary") || lower.includes("short")) {
      return t("icon_bolt", "bolt");
    }
    if (
      lower.includes("player") ||
      lower.includes("citizen") ||
      lower.includes("phone") ||
      lower.includes("queue")
    ) {
      return t("icon_sports_esports", "sports_esports");
    }
    if (lower.includes("homestead") || lower.includes("lab") || lower.includes("proving")) {
      return t("icon_science", "science");
    }
    if (
      lower.includes("creator") ||
      lower.includes("mason") ||
      lower.includes("workshop") ||
      lower.includes("scout")
    ) {
      return t("icon_construction", "construction");
    }
    if (lower.includes("community") || lower.includes("wayfinder") || lower.includes("server")) {
      return t("icon_hub", "hub");
    }
    if (
      lower.includes("security") ||
      lower.includes("heuristic") ||
      lower.includes("malware") ||
      lower.includes("privacy") ||
      lower.includes("honeypot")
    ) {
      return t("icon_shield", "shield");
    }
    if (lower.includes("architecture") || lower.includes("sandbox") || lower.includes("blueprint")) {
      return t("icon_architecture", "architecture");
    }
    if (lower.includes("bug") || lower.includes("fix")) {
      return t("icon_bug_report", "bug_report");
    }
    if (lower.includes("visual") || lower.includes("overhaul") || lower.includes("polish")) {
      return t("icon_auto_awesome", "auto_awesome");
    }
    return t("icon_new_releases", "new_releases");
  };

  const renderSectionImages = (images?: string[]) => {
    if (hideImages || !images || images.length === 0) return null;
    return (
      <div className="flex flex-col gap-3 w-full">
        {images.map((src, imgIdx) => {
          const isExpanded = expandedImage === src;
          return (
            <div
              key={`${src}-${imgIdx}`}
              onClick={() => setExpandedImage(isExpanded ? null : src)}
              className="group block overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-lg glass-surface relative cursor-pointer transition-all duration-500"
            >
              <img
                src={src}
                alt=""
                className={`w-full object-cover transition-all duration-500 ${
                  isExpanded
                    ? "max-h-none"
                    : "max-h-96 group-hover:scale-[1.02]"
                }`}
              />
              <span className="absolute top-3 right-3 bg-black/50 hover:bg-black/80 rounded-full w-9 h-9 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none backdrop-blur-md border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                <span className="material-symbols-outlined !text-[18px] text-white">
                  {isExpanded
                    ? t("icon_close_fullscreen", "close_fullscreen")
                    : t("icon_fullscreen", "fullscreen")}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  if (parsed.sections.length === 0) {
    return (
      <div className="flex flex-col gap-3.5 min-w-0">
        {parsed.introTitle && (
          <div className="flex items-center gap-3 px-1 pt-1">
            <span className="material-symbols-outlined !text-[22px] sm:!text-[24px] text-[var(--accent)] shrink-0">
              {resolveSectionIcon(parsed.introTitle, parsed.introIcon)}
            </span>
            <h2 className="text-lg sm:text-xl font-black tracking-tight text-[var(--text)] leading-snug">
              {renderCleanInlineText(parsed.introTitle)}
            </h2>
          </div>
        )}
        {(parsed.intro || cleanCardParagraph(content)) && (
          <div className="glass-panel rounded-3xl p-5 sm:p-6 flex flex-col gap-3 text-xs sm:text-[13px] text-[color-mix(in_srgb,var(--text)_82%,transparent)] leading-relaxed break-words">
            {(parsed.intro || cleanCardParagraph(content))
              .split(/\n{2,}/)
              .filter(Boolean)
              .map((para, pIdx) => (
                <p key={pIdx}>{renderCleanInlineText(para)}</p>
              ))}
          </div>
        )}
        {renderSectionImages(parsed.introImages)}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7 min-w-0">
      {!hideIntro &&
        (parsed.introTitle ||
          parsed.intro ||
          (parsed.introImages && parsed.introImages.length > 0)) && (
          <div className="flex flex-col gap-3.5">
          {parsed.introTitle && (
            <div className="flex items-center gap-3 px-1 pt-1">
              <span className="material-symbols-outlined !text-[22px] sm:!text-[24px] text-[var(--accent)] shrink-0">
                {resolveSectionIcon(parsed.introTitle, parsed.introIcon)}
              </span>
              <h2 className="text-lg sm:text-xl font-black tracking-tight text-[var(--text)] leading-snug">
                {renderCleanInlineText(parsed.introTitle)}
              </h2>
            </div>
          )}
          {parsed.intro && (
            <div className="glass-panel rounded-3xl p-4 sm:p-5 flex flex-col gap-3 relative overflow-hidden">
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(var(--text-rgb, 255, 255, 255), 0.05) 0%, transparent 65%)",
                }}
              />
              {parsed.intro
                .split(/\n{2,}/)
                .filter(Boolean)
                .map((para, pIdx) => (
                  <p
                    key={pIdx}
                    className="text-xs sm:text-[13px] text-[color-mix(in_srgb,var(--text)_80%,transparent)] leading-relaxed relative z-10"
                  >
                    {renderCleanInlineText(para)}
                  </p>
                ))}
            </div>
          )}
          {renderSectionImages(parsed.introImages)}
        </div>
      )}

      {parsed.sections.map((section, sIdx) => {
        const orderedCards = section.cards;
        const naturalFullFlags = orderedCards.map(
          (c) =>
            Boolean(c.subItems && c.subItems.length > 0) ||
            Boolean(c.codeBlock) ||
            !c.title?.trim() ||
            c.paragraphs.length > 1
        );
        const spanFullFlags: boolean[] = [];
        let colCursor = 0;
        for (let i = 0; i < orderedCards.length; i++) {
          if (naturalFullFlags[i]) {
            spanFullFlags.push(true);
            colCursor = 0;
          } else if (
            colCursor === 0 &&
            (i === orderedCards.length - 1 || naturalFullFlags[i + 1])
          ) {
            spanFullFlags.push(true);
            colCursor = 0;
          } else {
            spanFullFlags.push(false);
            colCursor = (colCursor + 1) % 2;
          }
        }

        const renderReleaseCard = (
          card: (typeof orderedCards)[number],
          cIdx: number,
          spanFull: boolean
        ) => (
          <div
            key={`${card.title || "card"}-${cIdx}`}
            className={`glass-panel rounded-3xl p-4 sm:p-5 flex flex-col gap-2.5 relative overflow-hidden ${
              spanFull ? "md:col-span-2" : ""
            }`}
          >
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "linear-gradient(135deg, rgba(var(--text-rgb, 255, 255, 255), 0.05) 0%, transparent 65%)",
              }}
            />
            {card.title && (
              <div className="flex items-center gap-2.5 relative z-10">
                {card.icon && (
                  <div className="w-7 h-7 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                    <span className="material-symbols-outlined !text-[15px]">
                      {t(`icon_${card.icon}`, card.icon)}
                    </span>
                  </div>
                )}
                <h3 className="text-sm sm:text-[15px] font-bold tracking-tight text-[var(--text)] leading-snug">
                  {renderCleanInlineText(card.title)}
                </h3>
              </div>
            )}
            {card.paragraphs.length > 0 && (
              <div className="flex flex-col gap-2 text-xs sm:text-[13px] text-[color-mix(in_srgb,var(--text)_80%,transparent)] leading-relaxed relative z-10">
                {card.paragraphs.map((p, pIdx) => (
                  <p key={pIdx}>{renderCleanInlineText(p)}</p>
                ))}
              </div>
            )}
            {card.codeBlock && (
              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative group/code z-10 overflow-x-auto custom-scrollbar">
                <button
                  type="button"
                  onClick={() =>
                    navigator.clipboard.writeText(card.codeBlock || "")
                  }
                  className="absolute top-2.5 right-2.5 w-7 h-7 rounded-lg glass-panel text-[var(--subtext)] hover:text-[var(--text)] opacity-0 group-hover/code:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[14px]">
                    {t("icon_content_copy", "content_copy")}
                  </span>
                  <HoverTooltip title={t("btn_copy", "Copy")} />
                </button>
                <pre className="font-mono text-xs text-[var(--accent)] whitespace-pre-wrap break-words m-0 pr-8">
                  <code>{card.codeBlock}</code>
                </pre>
              </div>
            )}
            {card.subItems && card.subItems.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 relative z-10">
                {card.subItems.map((sub, subIdx) => {
                  const isLastOddSub =
                    card.subItems!.length > 1 &&
                    card.subItems!.length % 2 === 1 &&
                    subIdx === card.subItems!.length - 1;
                  return (
                    <div
                      key={`${sub.title || "sub"}-${subIdx}`}
                      className={`glass-surface rounded-2xl p-3.5 flex flex-col gap-1 ${
                        isLastOddSub ? "sm:col-span-2" : ""
                      }`}
                    >
                      {sub.title && (
                        <span className="text-xs font-bold text-[var(--text)]">
                          {renderCleanInlineText(sub.title)}
                        </span>
                      )}
                      <span className="text-xs text-[color-mix(in_srgb,var(--text)_80%,transparent)] leading-relaxed">
                        {renderCleanInlineText(sub.body)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );

        const canUseBalancedColumns =
          !naturalFullFlags.some(Boolean) && orderedCards.length > 1;
        const balancedCols: Array<
          Array<{ card: (typeof orderedCards)[number]; idx: number }>
        > = [[], []];
        if (canUseBalancedColumns) {
          const weights = [0, 0];
          orderedCards.forEach((card, cIdx) => {
            const targetCol = weights[0] <= weights[1] ? 0 : 1;
            balancedCols[targetCol].push({ card, idx: cIdx });
            weights[targetCol] +=
              (card.title?.length || 0) +
              card.paragraphs.join(" ").length +
              60;
          });
        }

        return (
          <div key={`${section.title}-${sIdx}`} className="flex flex-col gap-3.5">
            {section.title && (
              <div className="flex items-center gap-3 px-1 pt-1">
                <span className="material-symbols-outlined !text-[22px] sm:!text-[24px] text-[var(--accent)] shrink-0">
                  {resolveSectionIcon(section.title, section.icon)}
                </span>
                <h2 className="text-lg sm:text-xl font-black tracking-tight text-[var(--text)] leading-snug">
                  {renderCleanInlineText(section.title)}
                </h2>
              </div>
            )}
            {section.description && (
              <div className="glass-panel rounded-3xl p-4 sm:p-5 flex flex-col gap-3 relative overflow-hidden">
                {section.description
                  .split(/\n{2,}/)
                  .filter(Boolean)
                  .map((para, pIdx) => (
                    <p
                      key={pIdx}
                      className="text-xs sm:text-[13px] text-[color-mix(in_srgb,var(--text)_80%,transparent)] leading-relaxed relative z-10"
                    >
                      {renderCleanInlineText(para)}
                    </p>
                  ))}
              </div>
            )}

            {orderedCards.length > 0 &&
              (canUseBalancedColumns ? (
                <>
                  <div className="flex flex-col gap-3.5 md:hidden">
                    {orderedCards.map((card, cIdx) =>
                      renderReleaseCard(card, cIdx, false)
                    )}
                  </div>
                  <div className="hidden md:grid md:grid-cols-2 gap-3.5 items-start">
                    {balancedCols.map((col, colIdx) => (
                      <div key={colIdx} className="flex flex-col gap-3.5">
                        {col.map(({ card, idx }) =>
                          renderReleaseCard(card, idx, false)
                        )}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 items-start">
                  {orderedCards.map((card, cIdx) =>
                    renderReleaseCard(card, cIdx, spanFullFlags[cIdx])
                  )}
                </div>
              ))}

            {renderSectionImages(section.images)}
          </div>
        );
      })}
    </div>
  );
}

