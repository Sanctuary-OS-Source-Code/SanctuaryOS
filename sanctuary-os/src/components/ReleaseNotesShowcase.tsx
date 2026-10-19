import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { supabaseAuth } from "../supabase";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import Image from "@tiptap/extension-image";
import { IconPlugin } from "../IconPlugin";
import {
  SidePanel,
  PanelHeaderGroup,
  PanelHeaderButton,
  DashboardStatTile,
  StatBox,
  HoverTooltip,
  LinkAssetSidePanel,
  handleOpenUrl,
  stripMarkdown,
} from "../shared";
import { SidePanelTitleInput } from "./layouts/ElevatedHubLayout";
import { UniversalCard } from "./universal/UniversalCard";
import { UniversalGroup } from "./universal/UniversalLayout";
import {
  DispatchPollBuilder,
  DispatchPollData,
  DispatchPollViewer,
} from "./universal/DispatchPollAndMeta";
import MarkdownRenderer from "../MarkdownRenderer";
import IconPicker from "../IconPicker";
import {
  getKeepersPipelineConfig,
  DEFAULT_KEEPERS_PIPELINE_CONFIG,
  KeepersPipelineConfig,
} from "../utils/supporterManager";
import packageJson from "../../package.json";
import bundledCommunityBlog from "../../../Release Notes (Community Blog).md?raw";
import bundledNerdChangelog from "../../../changelog.md?raw";

export const LEGACY_BLOG_BROADCAST_TITLE = "[KEEPERS_RELEASE_NOTES_BLOG]";
const PUBLIC_POST_BROADCAST_TITLE = "[KEEPERS_RELEASE_POST_PUBLIC]";
const DEV_POST_BROADCAST_TITLE = "[KEEPERS_RELEASE_POST_DEV]";

const GITHUB_RELEASES_WEB_URL =
  "https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases";
const GITHUB_WEB_DEV_RELEASE_URL =
  "https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/tag/dev-latest";

export interface KeepersReleasePostRecord {
  id: string | null;
  title: string;
  summary: string;
  version: string;
  releaseDate: string;
  platform: string;
  imageUrl: string;
  codeSnippet: string;
  pollData: DispatchPollData | null;
  body: string;
}

function stripEmojiPrefix(text: string): string {
  return text.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\s]+/u, "").trim();
}

export function cleanPostBodyForViewer(markdown: string): string {
  const lines = (markdown || "").split(/\r?\n/);
  const cleaned: string[] = [];
  let skippedTopHeading = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (
      !skippedTopHeading &&
      i < 6 &&
      (/^\\?#\s+sanctuary\s+os\s+[—–-]\s+version\b/i.test(trimmed) ||
        /^\\?##\s+\*".*"\*\s*$/.test(trimmed))
    ) {
      skippedTopHeading = true;
      continue;
    }
    if (i < 6 && /^\\?##\s+\*".*"\*\s*$/.test(trimmed)) {
      continue;
    }
    if (i < 8 && /^\*\*(Release Date|Date|Version):/i.test(trimmed)) {
      continue;
    }
    // If a long intro paragraph at the top was accidentally formatted as a # heading in TipTap, strip the leading # prefix
    if (i < 6 && /^[\s\u200B\uFEFF#*\\]*#+\s+/.test(trimmed) && trimmed.length > 110) {
      cleaned.push(trimmed.replace(/^[\s\u200B\uFEFF#\\]+/, ""));
      continue;
    }
    cleaned.push(lines[i]);
  }

  return cleaned.join("\n").replace(/^\s*---\s*\n/, "").trim();
}

interface ParsedReleaseSubItem {
  title: string;
  body: string;
}

interface ParsedReleaseCard {
  title: string;
  paragraphs: string[];
  subItems?: ParsedReleaseSubItem[];
}

interface ParsedReleaseSection {
  title: string;
  cards: ParsedReleaseCard[];
}

function cleanHeadingTitle(raw: string): string {
  return stripEmojiPrefix(
    raw
      .replace(/^[\s\u200B\uFEFF#*\\-]+/, "")
      .replace(/\\+$/, "")
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .replace(/`/g, "")
      .replace(/^\d+\.\s+/, "")
      .replace(/[:—–-]+\s*$/, "")
      .trim()
  );
}

function cleanCardTitle(raw: string): string {
  const cleaned = raw
    .replace(
      /\((?:[^()]*?(?:src\/|src-tauri\/|\.github\/|supabase\/|[A-Za-z0-9_/-]+\.(?:rs|tsx?|sql|css|yml)\b|keeper_heuristic|compliance_tier|tier2_hashes|schema_os)[^()]*)\)/gi,
      ""
    )
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/`/g, "")
    .replace(/^\d+\.\s+/, "")
    .replace(/[:—–-]+\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return stripEmojiPrefix(cleaned);
}

function cleanCardParagraph(raw: string): string {
  return raw
    .replace(/^\s*(?:[*-]|\d+\.)\s+/, "")
    .replace(/^[\s\u200B\uFEFF#\\]+/, "")
    .replace(/\\+$/, "")
    .replace(
      /\((?:[^()]*?(?:src\/|src-tauri\/|\.github\/|supabase\/|[A-Za-z0-9_/-]+\.(?:rs|tsx?|sql|css|yml)\b|keeper_heuristic|compliance_tier|tier2_hashes|schema_os)[^()]*)\)/gi,
      ""
    )
    .replace(/\((?:[^()]*`[^`]+`[^()]*)\)/g, (match) => {
      const withoutBackticks = match
        .replace(/`[^`]+`/g, "")
        .replace(
          /\b(?:in|via|and|or|from|to|with|plus|e\.g\.|such as)\b|[(),/|+&.;:=\s-]/gi,
          ""
        );
      return withoutBackticks.length > 14 ? match : "";
    })
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/^[\s\u200B\uFEFF#\\]+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractBulletTitleAndRest(rawLine: string): { title: string; rest: string } | null {
  const stripped = rawLine.replace(/^\s*(?:[*-]|\d+\.)\s+/, "").trim();
  if (!stripped.startsWith("**") && !stripped.startsWith("`")) {
    return null;
  }

  // Match up to the first `:**` or `**:` delimiter (handles split TipTap bold spans, "vs.", brackets `[REDACTED]`, `#`, parentheses, etc.)
  const colonMatch = stripped.match(/^(.{2,160}?)(?::\*\*|\*\*:)\s*(.*)$/);
  if (colonMatch) {
    const rawCandidate = colonMatch[1];
    const title = cleanCardTitle(rawCandidate);
    if (title) {
      return {
        title,
        rest: colonMatch[2].trim(),
      };
    }
  }

  const dashMatch = stripped.match(
    /^((?:\*\*[^*]+\*\*|`[^`]+`|\([^)]*\)|\[[^\]]*\]|\s)+?)\s+[—–-]\s+(.*)$/
  );
  if (dashMatch) {
    const title = cleanCardTitle(dashMatch[1]);
    if (title) {
      return {
        title,
        rest: dashMatch[2].trim(),
      };
    }
  }

  const simpleMatch = stripped.match(/^\*\*([^*]+?)\*\*\s*(?::|—|–|-)\s*(.*)$/);
  if (simpleMatch) {
    const title = cleanCardTitle(simpleMatch[1]);
    if (title) {
      return {
        title,
        rest: simpleMatch[2].trim(),
      };
    }
  }

  return null;
}

function parseBulletGroupIntoCards(bulletLines: string[]): ParsedReleaseCard[] {
  if (bulletLines.length === 0) return [];

  const mainLine = bulletLines[0];
  const mainExtracted = extractBulletTitleAndRest(mainLine);

  // Find minimum indentation of sub-bullets so 4-space sub-sub-bullets stay grouped inside their 2-space parent
  let minSubIndent = Infinity;
  for (let i = 1; i < bulletLines.length; i++) {
    const m = bulletLines[i].match(/^(\s+)(?:[*-]|\d+\.)\s+/);
    if (m && m[1].length < minSubIndent) {
      minSubIndent = m[1].length;
    }
  }

  const mainContinuation: string[] = [];
  const subBulletGroups: string[][] = [];
  let currentSub: string[] | null = null;

  for (let i = 1; i < bulletLines.length; i++) {
    const line = bulletLines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    const subMatch = line.match(/^(\s+)(?:[*-]|\d+\.)\s+/);
    if (subMatch) {
      const indentLen = subMatch[1].length;
      if (indentLen <= minSubIndent + 1) {
        if (currentSub) subBulletGroups.push(currentSub);
        currentSub = [line];
      } else if (currentSub) {
        currentSub.push(line);
      } else {
        currentSub = [line];
      }
    } else if (currentSub) {
      currentSub.push(line);
    } else {
      mainContinuation.push(trimmed);
    }
  }
  if (currentSub) {
    subBulletGroups.push(currentSub);
  }

  const rawMainBody = [
    mainExtracted ? mainExtracted.rest : mainLine.replace(/^\s*(?:[*-]|\d+\.)\s+/, "").trim(),
    ...mainContinuation,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  const cleanedMainBody = cleanCardParagraph(rawMainBody);

  if (subBulletGroups.length > 0) {
    const firstLinesParsed = subBulletGroups.map((group) => {
      const firstExtracted = extractBulletTitleAndRest(group[0]);
      const joinedAll = group.map((l) => l.trim()).join(" ");
      const joinedExtracted = extractBulletTitleAndRest(joinedAll);
      return {
        group,
        title: firstExtracted?.title || joinedExtracted?.title || "",
        body: cleanCardParagraph(
          joinedExtracted ? joinedExtracted.rest : joinedAll
        ),
      };
    });

    const allSubsHaveTitles = firstLinesParsed.every((s) => Boolean(s.title));

    // If the parent bullet is an umbrella header with no body of its own and titled sub-bullets,
    // promote each sub-bullet group into its own card (recursively handling any 4-space sub-sub-bullets).
    if (!cleanedMainBody && allSubsHaveTitles) {
      return subBulletGroups.flatMap(parseBulletGroupIntoCards);
    }

    // If there is only 1 untitled sub-bullet and no main body, fold it cleanly into a single 1-column card.
    if (!cleanedMainBody && firstLinesParsed.length === 1 && !firstLinesParsed[0].title) {
      return [
        {
          title: mainExtracted ? mainExtracted.title : "",
          paragraphs: firstLinesParsed[0].body ? [firstLinesParsed[0].body] : [],
        },
      ];
    }

    // Render sub-bullets as structured mini-cards inside the parent card so there is never a multi-paragraph wall of text.
    return [
      {
        title: mainExtracted ? mainExtracted.title : "",
        paragraphs: cleanedMainBody ? [cleanedMainBody.replace(/:\s*$/, ".")] : [],
        subItems: firstLinesParsed
          .filter((s) => s.title || s.body)
          .map((s) => ({
            title: s.title,
            body: s.body,
          })),
      },
    ];
  }

  if (!mainExtracted && !cleanedMainBody) return [];

  return [
    {
      title: mainExtracted ? mainExtracted.title : "",
      paragraphs: cleanedMainBody ? [cleanedMainBody] : [],
    },
  ];
}

function parseMarkdownIntoReleaseSections(markdown: string): {
  introTitle: string;
  intro: string;
  sections: ParsedReleaseSection[];
} {
  const cleaned = cleanPostBodyForViewer(
    (markdown || "").replace(/<!--[\s\S]*?-->/g, "")
  );
  const rawLines = cleaned.split(/\r?\n/);

  interface HeadingBlock {
    level: number;
    title: string;
    lines: string[];
  }

  let introTitle = "";
  const introLines: string[] = [];
  const blocks: HeadingBlock[] = [];
  let currentBlock: HeadingBlock | null = null;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const trimmed = line.trim();

    if (trimmed === "---") continue;
    if (i < 6 && /^\*\*(Date|Version|Release Date):/i.test(trimmed)) continue;

    const headingMatch = trimmed.match(/^\\?(#{1,4})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const rawHeadingText = headingMatch[2].trim();

      // If a long multi-sentence paragraph at the top was accidentally formatted as a heading in TipTap, treat it as intro prose
      if (
        !currentBlock &&
        blocks.length === 0 &&
        i < 5 &&
        rawHeadingText.length > 105
      ) {
        introLines.push(rawHeadingText);
        continue;
      }

      const headingTitle = cleanHeadingTitle(rawHeadingText);

      // Skip only the raw seed file top-level release header ("# Sanctuary OS — Version 0.5.7 Update")
      if (
        !currentBlock &&
        blocks.length === 0 &&
        i < 5 &&
        /^sanctuary\s+os\s+[—–-]\s+version\b/i.test(headingTitle)
      ) {
        continue;
      }

      if (currentBlock) {
        blocks.push(currentBlock);
      }
      currentBlock = { level, title: headingTitle, lines: [] };
    } else if (currentBlock) {
      currentBlock.lines.push(line);
    } else {
      introLines.push(line);
    }
  }

  if (currentBlock) {
    blocks.push(currentBlock);
  }

  // If the first heading block at the top of the post has only prose paragraphs (zero bullet items) before the first bulleted section,
  // treat that heading as the Intro Title and its lines as the Intro paragraph.
  const hasInitialIntroLines = introLines.some((l) => l.trim().length > 0);
  if (
    !hasInitialIntroLines &&
    blocks.length > 1 &&
    !blocks[0].lines.some((l) => /^\s*(?:[*-]|\d+\.)\s+/.test(l))
  ) {
    const firstBlock = blocks.shift()!;
    introTitle = firstBlock.title;
    introLines.push(...firstBlock.lines);
  }

  const sections: ParsedReleaseSection[] = [];

  for (const block of blocks) {
    const bulletGroups: string[][] = [];
    const proseLines: string[] = [];
    let currentBullet: string[] | null = null;

    for (const line of block.lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "---") continue;

      const isTopBullet = /^\s{0,1}(?:[*-]|\d+\.)\s+/.test(line);
      if (isTopBullet) {
        if (currentBullet) bulletGroups.push(currentBullet);
        currentBullet = [line];
      } else if (currentBullet) {
        currentBullet.push(line);
      } else {
        if (!trimmed.endsWith(":")) {
          proseLines.push(trimmed);
        }
      }
    }

    if (currentBullet) {
      bulletGroups.push(currentBullet);
    }

    const parsedCards = bulletGroups.flatMap(parseBulletGroupIntoCards);
    const hasTitledCards = parsedCards.some((c) => Boolean(c.title));

    if (hasTitledCards) {
      sections.push({
        title: block.title,
        cards: parsedCards,
      });
    } else if (parsedCards.length > 0 || proseLines.length > 0) {
      // Untitled bullets in this subsection (e.g., "### 3. Decentralized Mod Updates" or "### 3. Forking Sanctuary OS"):
      // Keep the section header consistent (`block.title`) and render each bullet as its own clean card.
      const cardsFromUntitled: ParsedReleaseCard[] =
        parsedCards.length > 0
          ? parsedCards
          : proseLines
              .map(cleanCardParagraph)
              .filter(Boolean)
              .map((p) => ({ title: "", paragraphs: [p] }));

      if (cardsFromUntitled.length > 0) {
        sections.push({
          title: block.title,
          cards: cardsFromUntitled,
        });
      }
    }
  }

  const nonEmptyIntroLines = introLines
    .map((l) => l.replace(/\\+$/, "").trim())
    .filter((l) => l && !l.endsWith(":"));

  if (!introTitle && nonEmptyIntroLines.length >= 2) {
    const firstLinePlain = cleanHeadingTitle(nonEmptyIntroLines[0]);
    if (firstLinePlain.length >= 2 && firstLinePlain.length <= 100) {
      introTitle = firstLinePlain;
      nonEmptyIntroLines.shift();
    }
  }

  let cleanedIntro = nonEmptyIntroLines
    .map(cleanCardParagraph)
    .filter(Boolean)
    .join(" ")
    .replace(/^[\s\u200B\uFEFF#\\]+/, "")
    .trim();

  if (!introTitle && cleanedIntro) {
    const inlineWelcomeMatch = cleanedIntro.match(
      /^(Welcome to [^*!.\n]{2,60}\*{0,2}!)\s+(.+)$/i
    );
    if (inlineWelcomeMatch) {
      introTitle = cleanHeadingTitle(inlineWelcomeMatch[1]);
      cleanedIntro = inlineWelcomeMatch[2].trim();
    }
  }

  return {
    introTitle,
    intro: cleanedIntro,
    sections,
  };
}

function renderCleanInlineText(text: string): React.ReactNode {
  const sanitized = (text || "").replace(/^[\s\u200B\uFEFF#\\]+/, "");
  const parts = sanitized.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={idx} className="font-bold text-[var(--text)] opacity-100">
          {part.slice(2, -2).replace(/^[\s\u200B\uFEFF#\\]+/, "")}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return (
        <em key={idx} className="italic text-[var(--text)] opacity-95">
          {part.slice(1, -1).replace(/^[\s\u200B\uFEFF#\\]+/, "")}
        </em>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export function StructuredReleaseNotesView({ content }: { content: string }) {
  const { t } = useLexicon();
  const parsed = useMemo(() => parseMarkdownIntoReleaseSections(content), [content]);

  const resolveSectionIcon = (title: string) => {
    const lower = title.toLowerCase();
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

  if (parsed.sections.length === 0) {
    return (
      <div className="flex flex-col gap-3.5 min-w-0">
        {parsed.introTitle && (
          <div className="flex items-center gap-3 px-1 pt-1">
            <span className="material-symbols-outlined !text-[22px] sm:!text-[24px] text-[var(--accent)] shrink-0">
              {resolveSectionIcon(parsed.introTitle)}
            </span>
            <h2 className="text-lg sm:text-xl font-black tracking-tight text-[var(--text)] leading-snug">
              {parsed.introTitle}
            </h2>
          </div>
        )}
        <div className="glass-panel rounded-3xl p-5 sm:p-6 flex flex-col gap-2 text-xs sm:text-[13px] text-[var(--text)] leading-relaxed break-words">
          <p className="opacity-85">
            {renderCleanInlineText(parsed.intro || cleanCardParagraph(content))}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7 min-w-0">
      {(parsed.introTitle || parsed.intro) && (
        <div className="flex flex-col gap-3.5">
          {parsed.introTitle && (
            <div className="flex items-center gap-3 px-1 pt-1">
              <span className="material-symbols-outlined !text-[22px] sm:!text-[24px] text-[var(--accent)] shrink-0">
                {resolveSectionIcon(parsed.introTitle)}
              </span>
              <h2 className="text-lg sm:text-xl font-black tracking-tight text-[var(--text)] leading-snug">
                {parsed.introTitle}
              </h2>
            </div>
          )}
          {parsed.intro && (
            <div className="glass-panel rounded-3xl p-4 sm:p-5 flex flex-col gap-2 relative overflow-hidden">
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(var(--text-rgb, 255, 255, 255), 0.05) 0%, transparent 65%)",
                }}
              />
              <p className="text-xs sm:text-[13px] text-[var(--text)] opacity-80 leading-relaxed relative z-10">
                {renderCleanInlineText(parsed.intro)}
              </p>
            </div>
          )}
        </div>
      )}

      {parsed.sections.map((section, sIdx) => {
        // Pair compact single cards first, followed by full-width multi-item cards so the 2-column Bento grid has zero orphan gaps
        const singleCards = section.cards.filter(
          (c) => !c.subItems || c.subItems.length === 0
        );
        const multiItemCards = section.cards.filter(
          (c) => c.subItems && c.subItems.length > 0
        );
        const orderedCards = [...singleCards, ...multiItemCards];

        return (
          <div key={`${section.title}-${sIdx}`} className="flex flex-col gap-3.5">
            <div className="flex items-center gap-3 px-1 pt-1">
              <span className="material-symbols-outlined !text-[22px] sm:!text-[24px] text-[var(--accent)] shrink-0">
                {resolveSectionIcon(section.title)}
              </span>
              <h2 className="text-lg sm:text-xl font-black tracking-tight text-[var(--text)] leading-snug">
                {section.title}
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {orderedCards.map((card, cIdx) => {
                const hasSubItems = Boolean(card.subItems && card.subItems.length > 0);
                const isLastOddSingleCard =
                  !hasSubItems &&
                  singleCards.length % 2 === 1 &&
                  cIdx === singleCards.length - 1;
                const spanFull = hasSubItems || isLastOddSingleCard;

                return (
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
                      <h3 className="text-sm sm:text-[15px] font-bold tracking-tight text-[var(--text)] leading-snug relative z-10">
                        {card.title}
                      </h3>
                    )}
                    {card.paragraphs.length > 0 && (
                      <div className="flex flex-col gap-2 text-xs sm:text-[13px] text-[var(--text)] opacity-80 leading-relaxed relative z-10">
                        {card.paragraphs.map((p, pIdx) => (
                          <p key={pIdx}>{renderCleanInlineText(p)}</p>
                        ))}
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
                                  {sub.title}
                                </span>
                              )}
                              <span className="text-xs text-[var(--text)] opacity-80 leading-relaxed">
                                {renderCleanInlineText(sub.body)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function parseSeedCommunityBlog(markdown: string) {
  const lines = (markdown || "").split(/\r?\n/);
  let mainTitle = `Sanctuary OS v${packageJson.version}`;
  let releaseDate = "";
  let intro = "";
  const tldrBullets: string[] = [];
  let inTldr = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith("# ") && !line.startsWith("## ")) {
      mainTitle = stripEmojiPrefix(line.replace(/^#\s+/, ""));
      continue;
    }
    if (!releaseDate && /release date:/i.test(line)) {
      const m = line.match(/release date:\s*\*{0,2}([^|*]+)/i);
      if (m && m[1]) releaseDate = m[1].trim();
    }
    if (line.startsWith("## ")) {
      const heading = line.replace(/^##\s+/, "").toLowerCase();
      inTldr = heading.includes("short version") || heading.includes("tl;dr");
      continue;
    }
    if (
      !inTldr &&
      !intro &&
      line &&
      line !== "---" &&
      !line.startsWith("**Release Date") &&
      !line.startsWith('*"')
    ) {
      intro = stripMarkdown(line);
    }
    if (inTldr && (line.startsWith("* ") || line.startsWith("- "))) {
      tldrBullets.push(stripMarkdown(line.replace(/^(\*|-)\s+/, "")));
    }
  }

  return {
    mainTitle,
    releaseDate,
    summary: intro || tldrBullets[0] || "",
    cleanBody: cleanPostBodyForViewer(markdown),
  };
}

export function parseLatestChangelogBlock(changelog: string) {
  const lines = (changelog || "").split(/\r?\n/);
  let date = "";
  let version = "";
  let heading = "";
  const latestSectionLines: string[] = [];
  let startedFirstRelease = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (/^\*\*Date:/i.test(trimmed)) {
      if (startedFirstRelease) break;
      startedFirstRelease = true;
      date = trimmed.replace(/^\*\*Date:\s*/i, "").replace(/\*\*$/g, "").trim();
      latestSectionLines.push(rawLine);
      continue;
    }
    if (startedFirstRelease) {
      if (/^\*\*Version:/i.test(trimmed) && !version) {
        version = trimmed.replace(/^\*\*Version:\s*/i, "").replace(/\*\*$/g, "").trim();
      } else if (trimmed.startsWith("## ") && !heading) {
        heading = trimmed.replace(/^##\s+/, "").trim();
      }
      latestSectionLines.push(rawLine);
    }
  }

  return {
    date,
    version,
    heading,
    markdown: latestSectionLines.join("\n").trim() || changelog,
  };
}

function serializeReleasePostMessage(record: Omit<KeepersReleasePostRecord, "id" | "title">): string {
  const meta = {
    summary: record.summary || "",
    version: record.version || "",
    releaseDate: record.releaseDate || "",
    platform: record.platform || "Windows / Mac (Planned)",
    imageUrl: record.imageUrl || "",
    codeSnippet: record.codeSnippet || "",
    pollData: record.pollData || null,
  };
  return `<!-- RELEASE_META:${JSON.stringify(meta)} -->\n${(record.body || "").trim()}`;
}

export function deserializeReleasePostRow(
  row: any,
  fallback: Omit<KeepersReleasePostRecord, "id">
): KeepersReleasePostRecord {
  if (!row) {
    return { id: null, ...fallback };
  }
  const rawMessage = String(row.message || "");
  const metaMatch = rawMessage.match(/^<!--\s*RELEASE_META:(\{.*?\})\s*-->\s*/s);
  let parsedMeta: any = {};
  let body = rawMessage;

  if (metaMatch && metaMatch[1]) {
    try {
      parsedMeta = JSON.parse(metaMatch[1]);
    } catch {
      parsedMeta = {};
    }
    body = rawMessage.slice(metaMatch[0].length).trim();
  } else {
    const legacyParsed = parseSeedCommunityBlog(rawMessage);
    parsedMeta = {
      summary: row.description || legacyParsed.summary,
      releaseDate: legacyParsed.releaseDate,
    };
    body = legacyParsed.cleanBody || rawMessage;
  }

  const rawTitle = String(row.title || "").trim();
  const isInternalTitle =
    rawTitle === LEGACY_BLOG_BROADCAST_TITLE ||
    rawTitle === PUBLIC_POST_BROADCAST_TITLE ||
    rawTitle === DEV_POST_BROADCAST_TITLE;

  return {
    id: row.id || null,
    title: !isInternalTitle && rawTitle ? rawTitle : parsedMeta.title || fallback.title,
    summary:
      parsedMeta.summary !== undefined && parsedMeta.summary !== ""
        ? parsedMeta.summary
        : row.description || fallback.summary,
    version: parsedMeta.version || fallback.version,
    releaseDate: parsedMeta.releaseDate || fallback.releaseDate,
    platform: parsedMeta.platform || fallback.platform || "Windows / Mac (Planned)",
    imageUrl: parsedMeta.imageUrl !== undefined ? parsedMeta.imageUrl : fallback.imageUrl || "",
    codeSnippet:
      parsedMeta.codeSnippet !== undefined
        ? parsedMeta.codeSnippet
        : row.code_snippet || fallback.codeSnippet || "",
    pollData:
      parsedMeta.pollData !== undefined
        ? parsedMeta.pollData
        : row.poll_data || fallback.pollData || null,
    body: body || fallback.body,
  };
}

export function ReleaseNotesShowcase({
  isKeepers = false,
  versionLabel,
}: {
  isKeepers?: boolean;
  versionLabel?: string;
}) {
  const { t } = useLexicon();
  const session = useStore((state) => state.session);

  const seedPublicBlog = useMemo(() => parseSeedCommunityBlog(bundledCommunityBlog), []);
  const seedChangelog = useMemo(() => parseLatestChangelogBlock(bundledNerdChangelog), []);

  const [pipelineConfig, setPipelineConfig] = useState<KeepersPipelineConfig>(
    DEFAULT_KEEPERS_PIPELINE_CONFIG
  );

  const defaultStableVersion = (
    versionLabel ||
    pipelineConfig.stable_version ||
    packageJson.version.split("-")[0] ||
    packageJson.version ||
    "0.5.8"
  )
    .replace(/^v/i, "")
    .trim();

  const defaultDevVersion = (
    pipelineConfig.dev_build_version ||
    seedChangelog.version ||
    packageJson.version ||
    `${defaultStableVersion}-dev.1`
  )
    .replace(/^v/i, "")
    .trim();

  const defaultStableDate =
    seedPublicBlog.releaseDate ||
    (pipelineConfig.stable_published_at
      ? new Date(pipelineConfig.stable_published_at).toLocaleDateString()
      : seedChangelog.date || new Date().toLocaleDateString());

  const defaultDevDate = pipelineConfig.dev_published_at
    ? new Date(pipelineConfig.dev_published_at).toLocaleDateString()
    : seedChangelog.date || new Date().toLocaleDateString();

  const defaultPublicPost = useMemo<Omit<KeepersReleasePostRecord, "id">>(
    () => ({
      title: seedPublicBlog.mainTitle,
      summary:
        seedPublicBlog.summary ||
        t(
          "release_notes_section_subtitle",
          "What's new in the latest Sanctuary OS build — written for humans, backed by the full technical changelog."
        ),
      version: defaultStableVersion,
      releaseDate: defaultStableDate,
      platform: t("release_notes_meta_platform_default", "Windows / Mac (Planned)"),
      imageUrl: "",
      codeSnippet: "",
      pollData: null,
      body: seedPublicBlog.cleanBody,
    }),
    [seedPublicBlog, defaultStableVersion, defaultStableDate, t]
  );

  const defaultDevPost = useMemo<Omit<KeepersReleasePostRecord, "id">>(
    () => ({
      title: `${t("release_notes_dev_card_title", "Sanctuary OS — Daily Dev Build")}`,
      summary: seedChangelog.heading
        ? `${seedChangelog.heading} — ${t(
            "release_notes_dev_card_desc",
            "Latest daily preview features, heuristic refinements, and architectural updates ahead of the next Stable release."
          )}`
        : t(
            "release_notes_dev_card_desc",
            "Latest daily preview features, heuristic refinements, and architectural updates ahead of the next Stable release."
          ),
      version: defaultDevVersion,
      releaseDate: defaultDevDate,
      platform: t("release_notes_meta_platform_default", "Windows / Mac (Planned)"),
      imageUrl: "",
      codeSnippet: "",
      pollData: null,
      body: seedChangelog.markdown,
    }),
    [seedChangelog, defaultDevVersion, defaultDevDate, t]
  );

  const [publicPost, setPublicPost] = useState<KeepersReleasePostRecord>({
    id: null,
    ...defaultPublicPost,
  });
  const [devPost, setDevPost] = useState<KeepersReleasePostRecord>({
    id: null,
    ...defaultDevPost,
  });

  const [activeChannel, setActiveChannel] = useState<"stable" | "dev" | null>(null);
  const [activeView, setActiveView] = useState<"post" | "changelog">("post");

  // Keepers Core Dispatch / Comm-Link Post Editor state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorChannel, setEditorChannel] = useState<"stable" | "dev">("stable");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftSummary, setDraftSummary] = useState("");
  const [draftVersion, setDraftVersion] = useState("");
  const [draftReleaseDate, setDraftReleaseDate] = useState("");
  const [draftPlatform, setDraftPlatform] = useState("");
  const [draftImageUrl, setDraftImageUrl] = useState("");
  const [draftCodeSnippet, setDraftCodeSnippet] = useState("");
  const [draftPollData, setDraftPollData] = useState<DispatchPollData | null>(null);
  const [draftBody, setDraftBody] = useState("");

  const [showImageInput, setShowImageInput] = useState(false);
  const [inlineImageUrl, setInlineImageUrl] = useState("");
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [isAssetPanelOpen, setIsAssetPanelOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const updateTimeoutRef = useRef<any>(null);

  const editor = useEditor({
    extensions: [StarterKit, Markdown, IconPlugin, Image],
    content: draftBody,
    onUpdate: ({ editor: ed }) => {
      if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
      updateTimeoutRef.current = setTimeout(() => {
        setDraftBody((ed.storage as any).markdown.getMarkdown());
      }, 300);
    },
    editorProps: {
      attributes: {
        class:
          "w-full flex-1 px-6 py-6 text-[var(--text)] text-sm font-sans focus:outline-none custom-scrollbar min-h-[350px] leading-relaxed [&_h1]:text-2xl [&_h1]:font-black [&_h2]:text-xl [&_h2]:font-bold [&_p]:mb-4 [&_ul]:list-disc [&_ul]:ml-6 [&_ol]:list-decimal [&_ol]:ml-6 [&_a]:text-[var(--accent)] [&_img]:rounded-xl [&_img]:max-w-full [&_code]:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] [&_code]:px-1 [&_code]:rounded [&_hr]:border-[color-mix(in_srgb,var(--text)_10%,transparent)] [&_hr]:my-8",
      },
    },
  });

  const loadPostsAndReleases = useCallback(
    async (forceRefreshGitHub = false) => {
      try {
        const cachedRaw = localStorage.getItem("sanctuary_keepers_release_posts_v1");
        if (cachedRaw) {
          const parsedCache = JSON.parse(cachedRaw);
          if (parsedCache?.publicPost) setPublicPost(parsedCache.publicPost);
          if (parsedCache?.devPost) setDevPost(parsedCache.devPost);
        }
      } catch {
        // ignore cache parse error
      }

      try {
        const [broadcastRes, cfg] = await Promise.all([
          supabaseAuth
            .from("keeper_system_broadcasts")
            .select(
              "id, title, description, message, category, target_audience, code_snippet, poll_data, created_at"
            )
            .in("category", ["ReleasePost_Public", "ReleasePost_Dev", "ReleaseNotesBlog"])
            .order("created_at", { ascending: false }),
          getKeepersPipelineConfig(forceRefreshGitHub),
        ]);

        if (cfg) {
          setPipelineConfig(cfg);
        }

        if (!broadcastRes.error && Array.isArray(broadcastRes.data)) {
          const rows = broadcastRes.data;
          const publicRow =
            rows.find((r: any) => r.category === "ReleasePost_Public") ||
            rows.find(
              (r: any) =>
                r.category === "ReleaseNotesBlog" || r.title === LEGACY_BLOG_BROADCAST_TITLE
            );

          const devRow = rows.find((r: any) => r.category === "ReleasePost_Dev");

          const resolvedPublic = deserializeReleasePostRow(publicRow, defaultPublicPost);
          const resolvedDev = deserializeReleasePostRow(devRow, defaultDevPost);

          setPublicPost(resolvedPublic);
          setDevPost(resolvedDev);

          try {
            localStorage.setItem(
              "sanctuary_keepers_release_posts_v1",
              JSON.stringify({
                publicPost: resolvedPublic,
                devPost: resolvedDev,
              })
            );
          } catch {
            // ignore storage errors
          }
        }
      } catch {
        // Keep current / cached state if offline
      }
    },
    [defaultPublicPost, defaultDevPost]
  );

  useEffect(() => {
    loadPostsAndReleases(false);
    const onUpdated = () => loadPostsAndReleases(false);
    window.addEventListener("keepers_release_posts_updated", onUpdated);
    return () => window.removeEventListener("keepers_release_posts_updated", onUpdated);
  }, [loadPostsAndReleases]);

  const populateDraftForChannel = useCallback(
    (channel: "stable" | "dev") => {
      const target = channel === "dev" ? devPost : publicPost;
      setEditorChannel(channel);
      setDraftTitle(target.title);
      setDraftSummary(target.summary);
      setDraftVersion(
        target.version || (channel === "dev" ? defaultDevVersion : defaultStableVersion)
      );
      setDraftReleaseDate(
        target.releaseDate || (channel === "dev" ? defaultDevDate : defaultStableDate)
      );
      setDraftPlatform(
        target.platform || t("release_notes_meta_platform_default", "Windows / Mac (Planned)")
      );
      setDraftImageUrl(target.imageUrl || "");
      setDraftCodeSnippet(target.codeSnippet || "");
      setShowCodeInput(Boolean(target.codeSnippet));
      setDraftPollData(target.pollData || null);
      setDraftBody(target.body);
      if (editor) {
        editor.commands.setContent(target.body || "");
      }
    },
    [
      devPost,
      publicPost,
      defaultDevVersion,
      defaultStableVersion,
      defaultDevDate,
      defaultStableDate,
      editor,
      t,
    ]
  );

  const openKeepersEditor = (channel: "stable" | "dev") => {
    populateDraftForChannel(channel);
    setIsEditorOpen(true);
  };

  const handleLinkAsset = (asset: any) => {
    const linkStr = `asset://${asset.type}/${asset.id}`;
    const typeKey = `masonhub_asset_type_${asset.type}`;
    const translatedType =
      t(typeKey) !== typeKey
        ? t(typeKey)
        : asset.type === "mod"
          ? "Artifact"
          : asset.type === "blueprint"
            ? "Blueprint"
            : asset.type === "chameleon"
              ? "Theme"
              : "Lexicon";
    const text = `${translatedType}: ${asset.name}`;

    if (editor) {
      editor
        .chain()
        .focus()
        .insertContent({
          type: "text",
          text,
          marks: [{ type: "link", attrs: { href: linkStr } }],
        })
        .insertContent(" ")
        .run();
    }
    setIsAssetPanelOpen(false);
  };

  const handleSaveKeepersPost = async () => {
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
      updateTimeoutRef.current = null;
    }
    let finalBody = draftBody;
    if (editor) {
      finalBody = (editor.storage as any).markdown.getMarkdown();
      setDraftBody(finalBody);
    }
    if (!draftTitle.trim() || !finalBody.trim()) return;

    setIsSaving(true);
    try {
      const isDev = editorChannel === "dev";
      const targetCategory = isDev ? "ReleasePost_Dev" : "ReleasePost_Public";
      const existingId = isDev ? devPost.id : publicPost.id;
      const sanitizedPoll =
        draftPollData &&
        draftPollData.question.trim() &&
        draftPollData.options.filter((o) => o.label.trim()).length >= 2
          ? {
              ...draftPollData,
              question: draftPollData.question.trim(),
              options: draftPollData.options
                .filter((o) => o.label.trim())
                .map((o) => ({ ...o, label: o.label.trim() })),
            }
          : null;

      const serializedMessage = serializeReleasePostMessage({
        summary: draftSummary.trim(),
        version: draftVersion.trim().replace(/^v/i, ""),
        releaseDate: draftReleaseDate.trim(),
        platform:
          draftPlatform.trim() ||
          t("release_notes_meta_platform_default", "Windows / Mac (Planned)"),
        imageUrl: draftImageUrl.trim(),
        codeSnippet: draftCodeSnippet.trim(),
        pollData: sanitizedPoll,
        body: finalBody.trim(),
      });

      const payload: any = {
        title: draftTitle.trim(),
        description: draftSummary.trim() || null,
        category: targetCategory,
        target_audience: isDev ? "Dev" : "Public",
        message: serializedMessage,
        code_snippet: draftCodeSnippet.trim() || null,
        poll_data: sanitizedPoll,
        is_active: false,
        is_pinned: "false",
      };

      let savedId = existingId;
      let saveError: any = null;

      if (!savedId) {
        const { data: existingRows } = await supabaseAuth
          .from("keeper_system_broadcasts")
          .select("id")
          .eq("category", targetCategory)
          .order("created_at", { ascending: false });
        if (existingRows && existingRows.length > 0) {
          savedId = existingRows[0].id;
        }
      }

      if (savedId) {
        const { error } = await supabaseAuth
          .from("keeper_system_broadcasts")
          .update(payload)
          .eq("id", savedId);
        saveError = error;
      } else {
        const { data, error } = await supabaseAuth
          .from("keeper_system_broadcasts")
          .insert(payload)
          .select("id");
        saveError = error;
        if (data && data[0]?.id) {
          savedId = data[0].id;
        }
      }

      if (saveError) {
        useStore
          .getState()
          .pushStatus(`Failed to save Release Post: ${saveError.message}`, "error");
        return;
      }

      const nextRecord: KeepersReleasePostRecord = {
        id: savedId || null,
        title: draftTitle.trim(),
        summary: draftSummary.trim(),
        version: draftVersion.trim().replace(/^v/i, ""),
        releaseDate: draftReleaseDate.trim(),
        platform:
          draftPlatform.trim() ||
          t("release_notes_meta_platform_default", "Windows / Mac (Planned)"),
        imageUrl: draftImageUrl.trim(),
        codeSnippet: draftCodeSnippet.trim(),
        pollData: sanitizedPoll,
        body: finalBody.trim(),
      };

      const nextPublic = isDev ? publicPost : nextRecord;
      const nextDev = isDev ? nextRecord : devPost;

      if (isDev) {
        setDevPost(nextRecord);
      } else {
        setPublicPost(nextRecord);
      }

      try {
        localStorage.setItem(
          "sanctuary_keepers_release_posts_v1",
          JSON.stringify({
            publicPost: nextPublic,
            devPost: nextDev,
          })
        );
      } catch {
        // ignore storage errors
      }

      window.dispatchEvent(new CustomEvent("keepers_release_posts_updated"));
      setIsEditorOpen(false);
      useStore
        .getState()
        .pushStatus(
          t("release_notes_saved_toast", "Published updated Release Notes Blog!"),
          "success"
        );
    } finally {
      setIsSaving(false);
    }
  };

  const handleRefreshGitHubChangelog = async () => {
    setIsSyncing(true);
    try {
      await loadPostsAndReleases(true);
      useStore
        .getState()
        .pushStatus(
          t("release_notes_synced_toast", "Synced latest Release Notes & Changelog!"),
          "success"
        );
    } finally {
      setIsSyncing(false);
    }
  };

  const formatCompactReleaseDate = (raw: string): string => {
    const trimmed = (raw || "").trim();
    if (!trimmed) return "";
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(trimmed)) return trimmed;
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString();
    }
    return trimmed;
  };

  // Resolved display values for Public & Dev channels
  const stableVersion = (publicPost.version || defaultStableVersion).replace(/^v/i, "").trim();
  const devVersion = (devPost.version || defaultDevVersion).replace(/^v/i, "").trim();

  const stableDateDisplay = formatCompactReleaseDate(publicPost.releaseDate || defaultStableDate);
  const devDateDisplay = formatCompactReleaseDate(devPost.releaseDate || defaultDevDate);

  const stablePlatformDisplay =
    publicPost.platform || t("release_notes_meta_platform_default", "Windows / Mac (Planned)");
  const devPlatformDisplay =
    devPost.platform || t("release_notes_meta_platform_default", "Windows / Mac (Planned)");

  // Full Change Logs pulled from GitHub Release Notes (with fallback to changelog.md)
  const isDetailedChangelog = (raw?: string | null): boolean => {
    const trimmed = String(raw || "").trim();
    if (!trimmed) return false;
    const placeholderStr = "See the assets to download this version and install.";
    const defaultDevNote =
      "Daily Dev Build stream for Sanctuary OS Ecosystem Supporters ($5 = +30 Days across any Partner Community or Keepers Core).";
    if (trimmed === placeholderStr || trimmed === defaultDevNote) {
      return false;
    }
    return (
      trimmed.length > 140 &&
      (trimmed.includes("\n") || trimmed.includes("- ") || trimmed.includes("#"))
    );
  };

  const stableGitHubChangelog = useMemo(() => {
    if (isDetailedChangelog(pipelineConfig.stable_release_notes)) {
      return pipelineConfig.stable_release_notes!.trim();
    }
    return bundledNerdChangelog;
  }, [pipelineConfig.stable_release_notes]);

  const devGitHubChangelog = useMemo(() => {
    if (isDetailedChangelog(pipelineConfig.dev_build_notes)) {
      return pipelineConfig.dev_build_notes!.trim();
    }
    return seedChangelog.markdown || bundledNerdChangelog;
  }, [pipelineConfig.dev_build_notes, seedChangelog.markdown]);

  const openReleasePanel = (channel: "stable" | "dev") => {
    setActiveChannel(channel);
    setActiveView("post");
  };

  const buildCommSubtitle = (channelBadge: string, versionStr: string) => (
    <div className="flex items-center gap-2">
      <div className="w-6 h-6 rounded-full flex items-center justify-center shadow-md glass-surface border border-[color-mix(in_srgb,var(--text)_20%,transparent)] backdrop-blur-md shrink-0">
        <span className="material-symbols-outlined !text-[12px] text-[var(--text)] drop-shadow-md">
          {t("icon_memory", "memory")}
        </span>
      </div>
      <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80">
        {t("author_sanctuary_team", "Sanctuary Foundry")}
      </span>
      <span className="text-[10px] font-black opacity-30 text-[var(--text)]">&bull;</span>
      <span className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)]">
        {channelBadge}
      </span>
      <span className="text-[10px] font-black opacity-30 text-[var(--text)]">&bull;</span>
      <span className="text-[10px] font-mono font-bold tracking-widest text-[var(--accent)]">
        v{versionStr}
      </span>
    </div>
  );

  const isDevActive = activeChannel === "dev";
  const activePostRecord = isDevActive ? devPost : publicPost;
  const activeVersion = isDevActive ? devVersion : stableVersion;
  const activeDateStr = isDevActive ? devDateDisplay : stableDateDisplay;
  const activePlatformStr = isDevActive ? devPlatformDisplay : stablePlatformDisplay;
  const activeChannelShort = isDevActive
    ? t("release_notes_meta_channel_dev", "Dev")
    : t("release_notes_meta_channel_public", "Public");
  const activeChannelBadge = isDevActive
    ? t("release_notes_dev_channel_badge", "Daily Dev Build")
    : t("release_notes_stable_channel_badge", "Stable Release");

  const activeTitle =
    activeView === "changelog"
      ? t("release_notes_github_changelog_title", "Full Change Log (GitHub Release Notes)")
      : activePostRecord.title;

  const activeMarkdownContent =
    activeView === "changelog"
      ? isDevActive
        ? devGitHubChangelog
        : stableGitHubChangelog
      : cleanPostBodyForViewer(activePostRecord.body);

  const activeGitHubUrl = isDevActive
    ? pipelineConfig.dev_release_url || GITHUB_WEB_DEV_RELEASE_URL
    : pipelineConfig.stable_release_url || GITHUB_RELEASES_WEB_URL;

  const renderReleaseInfoPanel = (
    dateVal: string,
    versionVal: string,
    isDevChan: boolean,
    platformVal: string
  ) => {
    const compactDate = formatCompactReleaseDate(dateVal);
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 w-full">
        <StatBox
          className="w-full"
          icon={t("icon_calendar_today", "calendar_today")}
          iconColorClass="text-[var(--accent)]"
          label={t("release_notes_meta_release_date", "Release Date")}
          value={compactDate}
          tooltipSubtitle={dateVal || compactDate}
        />
        <StatBox
          className="w-full"
          icon={t("icon_tag", "tag")}
          iconColorClass="text-[var(--accent)]"
          label={t("release_notes_meta_version", "Version Number")}
          value={`v${versionVal.replace(/^v/i, "")}`}
          tooltipSubtitle={`v${versionVal.replace(/^v/i, "")}`}
        />
        <StatBox
          className="w-full"
          icon={isDevChan ? t("icon_bolt", "bolt") : t("icon_verified", "verified")}
          iconColorClass={isDevChan ? "text-[var(--warning)]" : "text-[var(--success)]"}
          label={t("release_notes_meta_channel", "Channel")}
          value={
            isDevChan
              ? t("release_notes_meta_channel_dev", "Dev")
              : t("release_notes_meta_channel_public", "Public")
          }
          tooltipSubtitle={
            isDevChan
              ? t("release_notes_dev_channel_badge", "Daily Dev Build")
              : t("release_notes_stable_channel_badge", "Stable Release")
          }
        />
        <StatBox
          className="w-full"
          icon={t("icon_devices", "devices")}
          iconColorClass="text-[var(--accent)]"
          label={t("release_notes_meta_platform", "Platform")}
          value={platformVal}
          tooltipSubtitle={platformVal}
        />
      </div>
    );
  };

  return (
    <div className="w-full flex flex-col gap-6">
      {/* 2-Card Comm-Link Grid: One for Stable (Public), One for Daily Dev Build */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
        {/* Card 1: Public / Stable Release */}
        <UniversalCard
          layout="vertical"
          icon={t("icon_new_releases", "new_releases")}
          title={publicPost.title}
          subtitle={buildCommSubtitle(
            t("release_notes_stable_channel_badge", "Stable Release"),
            stableVersion
          )}
          onClick={() => openReleasePanel("stable")}
          className="w-full h-full"
          imageOverlay={
            <div className="absolute top-3 left-3 flex flex-wrap gap-2 z-30">
              <span className="px-2.5 py-1 bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] text-[9px] font-black uppercase tracking-widest rounded-lg backdrop-blur-md flex items-center gap-1">
                <span className="material-symbols-outlined !text-[12px]">
                  {t("icon_verified", "verified")}
                </span>
                {t("release_notes_meta_channel_public", "Public")} &bull; v{stableVersion}
              </span>
            </div>
          }
          footer={
            <div className="flex items-center justify-between w-full mt-2">
              <span className="text-[10px] font-black capitalize tracking-widest opacity-50 text-[var(--subtext)] flex items-center gap-2">
                <span className="material-symbols-outlined !text-[12px]">
                  {t("icon_calendar_today", "calendar_today")}
                </span>
                {stableDateDisplay}
              </span>
              <span className="text-[10px] font-black capitalize tracking-widest opacity-70 group-hover/card:opacity-100 transition-all flex items-center gap-1 text-[var(--accent)]">
                {t("release_notes_read_notes_cta", "Read Release Notes")}{" "}
                <span className="material-symbols-outlined !text-sm">
                  {t("icon_arrow_forward", "arrow_forward")}
                </span>
              </span>
            </div>
          }
        >
          <p className="text-xs text-[var(--subtext)] leading-relaxed font-medium opacity-85 line-clamp-3 mt-1">
            {publicPost.summary}
          </p>
        </UniversalCard>

        {/* Card 2: Daily Dev Build */}
        <UniversalCard
          layout="vertical"
          icon={t("icon_bolt", "bolt")}
          title={devPost.title}
          subtitle={buildCommSubtitle(
            t("release_notes_dev_channel_badge", "Daily Dev Build"),
            devVersion
          )}
          onClick={() => openReleasePanel("dev")}
          className="w-full h-full"
          imageOverlay={
            <div className="absolute top-3 left-3 flex flex-wrap gap-2 z-30">
              <span className="px-2.5 py-1 bg-[color-mix(in_srgb,var(--success)_18%,transparent)] border border-[color-mix(in_srgb,var(--success)_40%,transparent)] text-[var(--success)] text-[9px] font-black uppercase tracking-widest rounded-lg backdrop-blur-md flex items-center gap-1">
                <span className="material-symbols-outlined !text-[12px]">
                  {t("icon_bolt", "bolt")}
                </span>
                {t("release_notes_meta_channel_dev", "Dev")} &bull; v{devVersion}
              </span>
            </div>
          }
          footer={
            <div className="flex items-center justify-between w-full mt-2">
              <span className="text-[10px] font-black capitalize tracking-widest opacity-50 text-[var(--subtext)] flex items-center gap-2">
                <span className="material-symbols-outlined !text-[12px]">
                  {t("icon_calendar_today", "calendar_today")}
                </span>
                {devDateDisplay}
              </span>
              <span className="text-[10px] font-black capitalize tracking-widest opacity-70 group-hover/card:opacity-100 transition-all flex items-center gap-1 text-[var(--accent)]">
                {t("release_notes_read_dev_cta", "Read Dev Build Notes")}{" "}
                <span className="material-symbols-outlined !text-sm">
                  {t("icon_arrow_forward", "arrow_forward")}
                </span>
              </span>
            </div>
          }
        >
          <p className="text-xs text-[var(--subtext)] leading-relaxed font-medium opacity-85 line-clamp-3 mt-1">
            {devPost.summary}
          </p>
        </UniversalCard>
      </div>

      {/* Comm-Link Style SidePanel with StatTiles (View -> Post / Changelog / On GitHub) */}
      <SidePanel
        isOpen={activeChannel !== null}
        onClose={() => setActiveChannel(null)}
        title={t("release_notes_blog_panel_title", "Community Release Notes")}
        subtitle={`${activeChannelBadge} v${activeVersion}`}
        icon={isDevActive ? t("icon_bolt", "bolt") : t("icon_forum", "forum")}
        widthClass="w-[55vw] max-w-5xl"
        panelZ="z-[50001]"
        backdropZ="z-[50000]"
        noPadding={true}
        noScroll={true}
        panelClass="!border-l-[color-mix(in_srgb,var(--text)_15%,transparent)]"
        headerActions={
          isKeepers ? (
            <PanelHeaderGroup>
              <PanelHeaderButton
                onClick={() => openKeepersEditor(isDevActive ? "dev" : "stable")}
                tooltip={t("release_notes_edit_post_btn", "Edit Release Post")}
                icon="edit"
                variant="accent"
              />
              <PanelHeaderButton
                onClick={handleRefreshGitHubChangelog}
                disabled={isSyncing}
                tooltip={t("release_notes_sync_github_btn", "Sync from Repo / GitHub")}
                icon="sync"
              />
            </PanelHeaderGroup>
          ) : undefined
        }
      >
        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col relative">
          {activeView === "post" && activePostRecord.imageUrl && (
            <div className="w-full h-56 sm:h-72 relative shrink-0 overflow-hidden">
              <img
                src={activePostRecord.imageUrl}
                alt={activeTitle}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-transparent to-transparent" />
            </div>
          )}

          <div className="px-4 sm:px-8 md:px-12 pb-12 pt-8 gap-6 flex flex-col flex-1 relative z-20">
            {/* StatTile Navigation: Top line "View", Bottom line "Post" / "Changelog" / "On GitHub" */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
              <DashboardStatTile
                variant="filter"
                className="!w-full"
                icon={t("icon_menu_book", "menu_book")}
                label={t("release_notes_tile_view", "View")}
                number={t("release_notes_tile_post", "Post")}
                colorClass="text-[var(--accent)]"
                isActive={activeView === "post"}
                onClick={() => setActiveView("post")}
              />
              <DashboardStatTile
                variant="filter"
                className="!w-full"
                icon={t("icon_terminal", "terminal")}
                label={t("release_notes_tile_view", "View")}
                number={t("release_notes_tile_changelog", "Changelog")}
                colorClass="text-[var(--accent)]"
                isActive={activeView === "changelog"}
                onClick={() => setActiveView("changelog")}
              />
              <DashboardStatTile
                variant="filter"
                className="!w-full"
                icon={t("icon_open_in_new", "open_in_new")}
                label={t("release_notes_tile_view", "View")}
                number={t("release_notes_tile_on_github", "On GitHub")}
                colorClass="text-[var(--text)]"
                isActive={false}
                onClick={() => handleOpenUrl(activeGitHubUrl)}
              />
            </div>

            {/* Post Header & 4-Column Release Telemetry */}
            <div className="flex flex-col gap-5 mt-2">
              <h1 className="text-3xl sm:text-4xl font-black tracking-tighter drop-shadow-sm leading-tight text-[var(--text)]">
                {activeTitle}
              </h1>

              <div className="flex items-center gap-3.5 relative z-20">
                <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 bg-[color-mix(in_srgb,var(--accent)_15%,var(--surface))] border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] shadow-inner">
                  <span className="material-symbols-outlined !text-[22px]">
                    {t("icon_memory", "memory")}
                  </span>
                </div>

                <div className="flex flex-col gap-0.5 z-20 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base sm:text-lg font-black capitalize tracking-tight text-[var(--text)] leading-tight">
                      {t("author_sanctuary_team", "Sanctuary Foundry")}
                    </span>
                    <span className="relative inline-flex items-center cursor-default">
                      <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">
                        {t("icon_verified", "verified")}
                      </span>
                      <HoverTooltip
                        title={t("verified", "Verified")}
                        icon={t("icon_verified", "verified")}
                        variant="default"
                      />
                    </span>
                  </div>
                  <span className="text-xs sm:text-[13px] font-medium text-[var(--subtext)] opacity-85">
                    {t("release_notes_author_subtitle", "Official Release Dispatch")}
                  </span>
                </div>
              </div>

              {renderReleaseInfoPanel(
                activeDateStr,
                activeVersion,
                isDevActive,
                activePlatformStr
              )}

              <div className="flex-1 flex flex-col mt-2 gap-6 min-w-0">
                <StructuredReleaseNotesView content={activeMarkdownContent} />

                {activeView === "post" && activePostRecord.codeSnippet && (
                  <pre className="w-full glass-surface rounded-2xl p-5 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] overflow-x-auto custom-scrollbar">
                    <code>{activePostRecord.codeSnippet}</code>
                  </pre>
                )}

                {activeView === "post" && activePostRecord.pollData && (
                  <DispatchPollViewer
                    post={{
                      id: activePostRecord.id || `release-post-${activeChannel}`,
                      poll_data: activePostRecord.pollData,
                      _sourceTable: "keeper_system_broadcasts",
                    }}
                    userId={session?.user?.id || null}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </SidePanel>

      {/* SidePanel: Reuse the Dispatch / Comm-Link Post Editor for Public & Dev Release Posts */}
      {isKeepers && (
        <>
          <SidePanel
            isOpen={isEditorOpen}
            onClose={() => setIsEditorOpen(false)}
            icon="cell_tower"
            widthClass="w-[800px]"
            backdropZ="z-[60000]"
            panelZ="z-[60001]"
            title={t("update_transmission", "Update Transmission")}
            subtitle={
              editorChannel === "dev"
                ? t("release_notes_dev_post_label", "Dev Channel Post")
                : t("release_notes_public_post_label", "Public Channel Post")
            }
            headerActions={
              <PanelHeaderGroup>
                <PanelHeaderButton
                  onClick={handleSaveKeepersPost}
                  disabled={isSaving || !draftTitle.trim() || !draftBody.trim()}
                  tooltip={
                    isSaving
                      ? t("btn_saving", "Saving...")
                      : t("update_transmission", "Update Transmission")
                  }
                  icon={isSaving ? "sync" : "send"}
                  variant="accent"
                  className={isSaving ? "animate-pulse" : ""}
                />
              </PanelHeaderGroup>
            }
          >
            <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {/* Switch between Public and Dev Release Post */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                <DashboardStatTile
                  variant="filter"
                  className="!w-full"
                  icon={
                    <span className="material-symbols-outlined">
                      {t("icon_verified", "verified")}
                    </span>
                  }
                  label={t("release_notes_meta_channel_public", "Public")}
                  number={t("release_notes_public_post_label", "Public Channel Post")}
                  isActive={editorChannel === "stable"}
                  onClick={() => populateDraftForChannel("stable")}
                />
                <DashboardStatTile
                  variant="filter"
                  className="!w-full"
                  icon={
                    <span className="material-symbols-outlined">{t("icon_bolt", "bolt")}</span>
                  }
                  label={t("release_notes_meta_channel_dev", "Dev")}
                  number={t("release_notes_dev_post_label", "Dev Channel Post")}
                  isActive={editorChannel === "dev"}
                  onClick={() => populateDraftForChannel("dev")}
                />
              </div>

              <SidePanelTitleInput
                value={draftTitle}
                onChange={setDraftTitle}
                placeholder={t("post_title", "Title")}
              />

              <div className="flex flex-col gap-2 w-full">
                <div className="flex justify-between items-center ml-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest">
                    {t("post_description", "Description")}
                  </label>
                  <span
                    className={`text-[9px] font-black ${
                      draftSummary.length >= 250
                        ? "text-[var(--warning)]"
                        : "text-[var(--subtext)] opacity-60"
                    }`}
                  >
                    {draftSummary.length} / 250
                  </span>
                </div>
                <input
                  maxLength={250}
                  value={draftSummary}
                  onChange={(e) => setDraftSummary(e.target.value)}
                  placeholder={t("post_description_ph", "Short summary shown on the Release Card...")}
                  className="w-full glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all"
                />
              </div>

              {/* Release Info Fields (Release Date / Version Number / Platform) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
                <div className="flex flex-col gap-2 flex-1">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">
                    {t("release_notes_meta_release_date", "Release Date")}
                  </label>
                  <input
                    value={draftReleaseDate}
                    onChange={(e) => setDraftReleaseDate(e.target.value)}
                    className="w-full glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all"
                  />
                </div>
                <div className="flex flex-col gap-2 flex-1">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">
                    {t("release_notes_meta_version", "Version Number")}
                  </label>
                  <input
                    value={draftVersion}
                    onChange={(e) => setDraftVersion(e.target.value)}
                    className="w-full glass-surface rounded-xl px-5 py-3 text-[var(--accent)] font-mono text-sm font-bold focus:outline-none focus:theme-border-accent transition-all"
                  />
                </div>
                <div className="flex flex-col gap-2 flex-1">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">
                    {t("release_notes_meta_platform", "Platform")}
                  </label>
                  <input
                    value={draftPlatform}
                    onChange={(e) => setDraftPlatform(e.target.value)}
                    className="w-full glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all"
                  />
                </div>
              </div>

              {/* Live 2x2 Release Info Panel Preview */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">
                  {t("dispatch_telemetry_preview", "Dispatch Telemetry Header Preview")}
                </label>
                {renderReleaseInfoPanel(
                  draftReleaseDate || (editorChannel === "dev" ? defaultDevDate : defaultStableDate),
                  draftVersion ||
                    (editorChannel === "dev" ? defaultDevVersion : defaultStableVersion),
                  editorChannel === "dev",
                  draftPlatform ||
                    t("release_notes_meta_platform_default", "Windows / Mac (Planned)")
                )}
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">
                  {t("header_image_placeholder", "Header Image URL (Optional)")}
                </label>
                <input
                  value={draftImageUrl}
                  onChange={(e) => setDraftImageUrl(e.target.value)}
                  placeholder={t("header_image_placeholder", "Header Image URL (Optional)")}
                  className="w-full glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all"
                />
              </div>

              {/* Dispatch / Comm-Link Rich TipTap Post Editor */}
              <div className="flex flex-col gap-2 flex-1 min-h-[400px]">
                <div className="flex items-center justify-between ml-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest">
                    {t("post_content", "Post Content")}
                  </label>
                </div>
                <div className="flex flex-col flex-1 glass-surface !overflow-visible bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-2xl border focus-within:border-[var(--accent)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner transition-all">
                  <div className="shrink-0 sticky top-0 z-50 flex flex-col items-center p-3 bg-transparent pointer-events-none">
                    <div className="relative flex flex-col items-center pointer-events-auto w-fit">
                      <div className="glass-panel portal-glass-fix backdrop-blur-[var(--glassBlur)] flex flex-wrap items-center gap-1 p-1.5 !rounded-[1.25rem] border border-[color-mix(in_srgb,var(--text)_14%,transparent)] shadow-[0_14px_34px_rgba(0,0,0,0.45)]">
                        <div className="relative group/btn flex">
                          <button
                            type="button"
                            onClick={() => editor?.chain().focus().toggleBold().run()}
                            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                              editor?.isActive("bold")
                                ? "bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner"
                                : "text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                            }`}
                          >
                            <span className="material-symbols-outlined !text-[18px]">
                              {t("icon_format_bold", "format_bold")}
                            </span>
                          </button>
                          <HoverTooltip
                            title={t("editor_tt_bold", "Bold")}
                            variant="info"
                            className="group-hover/btn:flex z-[100]"
                          />
                        </div>
                        <div className="relative group/btn flex">
                          <button
                            type="button"
                            onClick={() => editor?.chain().focus().toggleItalic().run()}
                            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                              editor?.isActive("italic")
                                ? "bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner"
                                : "text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                            }`}
                          >
                            <span className="material-symbols-outlined !text-[18px]">
                              {t("icon_format_italic", "format_italic")}
                            </span>
                          </button>
                          <HoverTooltip
                            title={t("editor_tt_italic", "Italic")}
                            variant="info"
                            className="group-hover/btn:flex z-[100]"
                          />
                        </div>
                        <div className="relative group/btn flex">
                          <button
                            type="button"
                            onClick={() =>
                              editor?.chain().focus().toggleHeading({ level: 1 }).run()
                            }
                            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                              editor?.isActive("heading", { level: 1 })
                                ? "bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner"
                                : "text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                            }`}
                          >
                            <span className="material-symbols-outlined !text-[18px]">
                              {t("icon_format_h1", "format_h1")}
                            </span>
                          </button>
                          <HoverTooltip
                            title={t("editor_tt_h1", "Heading 1")}
                            variant="info"
                            className="group-hover/btn:flex z-[100]"
                          />
                        </div>
                        <div className="relative group/btn flex">
                          <button
                            type="button"
                            onClick={() =>
                              editor?.chain().focus().toggleHeading({ level: 2 }).run()
                            }
                            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                              editor?.isActive("heading", { level: 2 })
                                ? "bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner"
                                : "text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                            }`}
                          >
                            <span className="material-symbols-outlined !text-[18px]">
                              {t("icon_format_h2", "format_h2")}
                            </span>
                          </button>
                          <HoverTooltip
                            title={t("editor_tt_h2", "Heading 2")}
                            variant="info"
                            className="group-hover/btn:flex z-[100]"
                          />
                        </div>
                        <div className="relative group/btn flex">
                          <button
                            type="button"
                            onClick={() => editor?.chain().focus().toggleBulletList().run()}
                            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                              editor?.isActive("bulletList")
                                ? "bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner"
                                : "text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                            }`}
                          >
                            <span className="material-symbols-outlined !text-[18px]">
                              {t("icon_format_list_bulleted", "format_list_bulleted")}
                            </span>
                          </button>
                          <HoverTooltip
                            title={t("editor_tt_bullets", "Bullet List")}
                            variant="info"
                            className="group-hover/btn:flex z-[100]"
                          />
                        </div>
                        <div className="relative group/btn flex">
                          <button
                            type="button"
                            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
                            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                              editor?.isActive("orderedList")
                                ? "bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner"
                                : "text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                            }`}
                          >
                            <span className="material-symbols-outlined !text-[18px]">
                              {t("icon_format_list_numbered", "format_list_numbered")}
                            </span>
                          </button>
                          <HoverTooltip
                            title={t("editor_tt_numbers", "Numbered List")}
                            variant="info"
                            className="group-hover/btn:flex z-[100]"
                          />
                        </div>
                        <div className="relative group/btn flex">
                          <button
                            type="button"
                            onClick={() => setShowImageInput(!showImageInput)}
                            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                              showImageInput
                                ? "bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner"
                                : "text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                            }`}
                          >
                            <span className="material-symbols-outlined !text-[18px]">
                              {t("icon_image", "image")}
                            </span>
                          </button>
                          <HoverTooltip
                            title={t("editor_tt_image", "Insert Image")}
                            variant="info"
                            className="group-hover/btn:flex z-[100]"
                          />
                        </div>
                        <div className="relative group/btn flex">
                          <button
                            type="button"
                            onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
                            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                              editor?.isActive("codeBlock")
                                ? "bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner"
                                : "text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                            }`}
                          >
                            <span className="material-symbols-outlined !text-[18px]">
                              {t("icon_code", "code")}
                            </span>
                          </button>
                          <HoverTooltip
                            title={t("editor_tt_code", "Code Block")}
                            variant="info"
                            className="group-hover/btn:flex z-[100]"
                          />
                        </div>
                        <div className="relative group/btn flex">
                          <button
                            type="button"
                            onClick={() => editor?.chain().focus().setHorizontalRule().run()}
                            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                          >
                            <span className="material-symbols-outlined !text-[18px]">
                              {t("icon_horizontal_rule", "horizontal_rule")}
                            </span>
                          </button>
                          <HoverTooltip
                            title={t("editor_tt_hr", "Divider")}
                            variant="info"
                            className="group-hover/btn:flex z-[100]"
                          />
                        </div>
                        <div className="relative group/btn flex">
                          <button
                            type="button"
                            onClick={() => setShowIconPicker(!showIconPicker)}
                            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                              showIconPicker
                                ? "bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner"
                                : "text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                            }`}
                          >
                            <span className="material-symbols-outlined !text-[18px]">
                              {t("icon_sentiment_satisfied", "sentiment_satisfied")}
                            </span>
                          </button>
                          <HoverTooltip
                            title={t("editor_tt_icon", "Insert Icon")}
                            variant="info"
                            className="group-hover/btn:flex z-[100]"
                          />
                        </div>
                      </div>
                      {showIconPicker && (
                        <IconPicker
                          onSelect={(icon) => {
                            editor?.chain().focus().insertContent(`[ICON:${icon}] `).run();
                            setShowIconPicker(false);
                          }}
                          onClose={() => setShowIconPicker(false)}
                        />
                      )}
                    </div>
                  </div>

                  {showImageInput && (
                    <div className="border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] p-3 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner animate-in slide-in-from-top-2 duration-300 flex items-center gap-3 relative z-10 backdrop-blur-xl">
                      <input
                        value={inlineImageUrl}
                        onChange={(e) => setInlineImageUrl(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && inlineImageUrl) {
                            e.preventDefault();
                            editor?.chain().focus().setImage({ src: inlineImageUrl }).run();
                            setInlineImageUrl("");
                            setShowImageInput(false);
                          }
                        }}
                        placeholder={t("image_url_placeholder", "Paste Image URL...")}
                        className="flex-1 glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (inlineImageUrl) {
                            editor?.chain().focus().setImage({ src: inlineImageUrl }).run();
                            setInlineImageUrl("");
                            setShowImageInput(false);
                          }
                        }}
                        className="px-6 py-2 bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] border border-[color-mix(in_srgb,var(--accent)_50%,transparent)] text-[var(--accent)] rounded-xl font-black text-[10px] capitalize tracking-widest shadow-lg hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.3)] transition-all hover:bg-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
                      >
                        {t("ui_btn_insert", "Insert")}
                      </button>
                    </div>
                  )}

                  <div className="w-full flex-1 relative min-h-[350px]">
                    <EditorContent editor={editor} className="h-full w-full custom-scrollbar" />
                  </div>

                  {showCodeInput && (
                    <div className="border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] p-3 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner animate-in slide-in-from-bottom-2 duration-300">
                      <textarea
                        value={draftCodeSnippet}
                        onChange={(e) => setDraftCodeSnippet(e.target.value)}
                        placeholder={t("code_snippet_placeholder", "Paste code snippet...")}
                        className="w-full glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-xs font-mono placeholder-[var(--subtext)] focus:outline-none focus:theme-border-accent h-48 resize-none custom-scrollbar transition-all"
                        spellCheck={false}
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between p-3 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] rounded-b-2xl shrink-0">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowCodeInput(!showCodeInput)}
                        className={`px-3 py-1.5 rounded-lg transition-all text-[10px] font-bold tracking-widest flex items-center gap-1.5 ${
                          showCodeInput
                            ? "theme-bg-accent/20 theme-text-accent"
                            : "text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
                        }`}
                      >
                        <span className="material-symbols-outlined !text-[14px]">
                          {t("icon_data_object", "data_object")}
                        </span>{" "}
                        {showCodeInput
                          ? t("hide_code", "Hide Code")
                          : t("masonhub_add_code", "Add Code")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsAssetPanelOpen(true)}
                        className="px-3 py-1.5 rounded-lg transition-all text-[10px] font-bold tracking-widest text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] flex items-center gap-1.5"
                      >
                        <span className="material-symbols-outlined !text-[14px]">
                          {t("icon_link", "link")}
                        </span>{" "}
                        {t("link_asset", "Link Asset")}
                      </button>
                    </div>
                    <div className="text-[9px] font-black tracking-widest capitalize opacity-40 flex items-center gap-1.5">
                      <span className="material-symbols-outlined !text-[14px]">
                        {t("icon_markdown", "markdown")}
                      </span>{" "}
                      {t("icon_markdown", "markdown")}
                    </div>
                  </div>
                </div>
              </div>

              <DispatchPollBuilder pollData={draftPollData} onChange={setDraftPollData} />
            </div>
          </SidePanel>

          <LinkAssetSidePanel
            isOpen={isAssetPanelOpen}
            onClose={() => setIsAssetPanelOpen(false)}
            onAssetSelect={handleLinkAsset}
            backdropZ="z-[60002]"
            panelZ="z-[60003]"
          />
        </>
      )}
    </div>
  );
}
