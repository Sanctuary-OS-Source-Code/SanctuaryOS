import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { supabaseAuth } from "../supabase";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import Image from "@tiptap/extension-image";
import { IconPlugin } from "../IconPlugin";
import {
  SidePanel,
  PanelHeaderGroup,
  PanelHeaderButton,
  DashboardStatTile,
  StatTileCarousel,
  StatBox,
  HoverTooltip,
  LinkAssetSidePanel,
  handleOpenUrl,
  stripMarkdown
} from "../shared";
import { SidePanelHeroCard } from "./layouts/ElevatedHubLayout";
import { UniversalCard } from "./universal/UniversalCard";
import { UniversalGroup } from "./universal/UniversalLayout";
import {
  DispatchPollData,
  DispatchPollViewer,
} from "./universal/DispatchPollAndMeta";
import {
  PostEditorMode,
  UnifiedPostBodyEditor,
  PostAttachmentsManager,
} from "./universal/UnifiedPostEditor";
import {
  getKeepersPipelineConfig,
  getSupporterState,
  DEFAULT_KEEPERS_PIPELINE_CONFIG,
  KeepersPipelineConfig,
} from "../utils/supporterManager";
import packageJson from "../../package.json";
import bundledCommunityBlog from "../../../Release Notes (Community Blog).md?raw";
import bundledDevBlog from "../../../Release Notes (Dev).md?raw";
import bundledNerdChangelog from "../../../changelog.md?raw";
import bundledRunningChangelog from "../../../changelog (running).md?raw";
import {
  readAllLocalDocSnapshots,
  writeLocalDirectiveFile,
} from "../utils/directivesSync";

export const LEGACY_BLOG_BROADCAST_TITLE = "[KEEPERS_RELEASE_NOTES_BLOG]";
const PUBLIC_POST_BROADCAST_TITLE = "[KEEPERS_RELEASE_POST_PUBLIC]";
const DEV_POST_BROADCAST_TITLE = "[KEEPERS_RELEASE_POST_DEV]";
export const PUBLIC_CHANGELOG_BROADCAST_CATEGORY = "ReleaseChangelog_Public";
export const DEV_CHANGELOG_BROADCAST_CATEGORY = "ReleaseChangelog_Dev";

const VAULT_CHIP_CLASS =
  "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

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
  let inTableOfContents = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (
      !skippedTopHeading &&
      i < 6 &&
      ((/^\\?#\s+[^#]/.test(trimmed) && trimmed.length <= 110) ||
        /^\\?##\s+\*".*"\*\s*$/.test(trimmed))
    ) {
      skippedTopHeading = true;
      continue;
    }
    if (
      i < 6 &&
      (/^\\?##\s+\*".*"\*\s*$/.test(trimmed) ||
        (skippedTopHeading && /^\\?###\s+/.test(trimmed)))
    ) {
      continue;
    }
    if (
      i < 14 &&
      /^(?:>\s*)*\*\*(?:Release Date|Date|Version|Document Version|Last Updated|Effective Date|Classification|Scope):/i.test(
        trimmed
      )
    ) {
      const strippedMeta = trimmed
        .replace(
          /(?:>\s*)?\*\*(?:Release Date|Date|Version|Document Version|Last Updated|Effective Date|Classification|Scope):\*\*\s*[^>\n]+/gi,
          ""
        )
        .replace(/^[>\s•|—–-]+/, "")
        .trim();
      if (strippedMeta && /^(?:This|Sanctuary|By\s)/i.test(strippedMeta)) {
        cleaned.push(strippedMeta);
      }
      continue;
    }
    if (i < 16 && /^\\?#{1,3}\s+table\s+of\s+contents\b/i.test(trimmed)) {
      inTableOfContents = true;
      continue;
    }
    if (inTableOfContents) {
      if (!trimmed || trimmed === "---" || /^\d+\.\s+/.test(trimmed) || /^[*-]\s+/.test(trimmed)) {
        if (trimmed === "---") {
          inTableOfContents = false;
        }
        continue;
      }
      inTableOfContents = false;
    }
    // If a long intro paragraph at the top was accidentally formatted as a # heading in TipTap, strip the leading # prefix
    if (i < 6 && /^[\s\u200B\uFEFF#*\\]*#+\s+/.test(trimmed) && trimmed.length > 110) {
      cleaned.push(trimmed.replace(/^[\s\u200B\uFEFF#\\]+/, ""));
      continue;
    }
    // Strip standalone or inline asset:// link lines (rendered separately in Attached Nexus Assets section)
    const withoutAssets = lines[i].replace(
      /(?:\\?\[ICON:[a-zA-Z0-9_-]+\\?\]\s*)?\\?\[((?:\\?\[ICON:[a-zA-Z0-9_-]+\\?\]|[^\]])+?)\\?\]\(asset:\/\/[^)]+\)/gi,
      ""
    );
    if (lines[i].includes("asset://") && !withoutAssets.trim()) {
      continue;
    }
    cleaned.push(withoutAssets);
  }

  return cleaned.join("\n").replace(/^\s*---\s*\n/, "").trim();
}

export interface ParsedReleaseSubItem {
  title: string;
  body: string;
}

export interface ParsedReleaseCard {
  title: string;
  icon?: string;
  paragraphs: string[];
  subItems?: ParsedReleaseSubItem[];
  imageUrl?: string;
  codeBlock?: string;
}

export interface ParsedReleaseSection {
  title: string;
  icon?: string;
  description?: string;
  cards: ParsedReleaseCard[];
  images?: string[];
}

export function extractHeadingIconAndTitle(raw: string): {
  icon?: string;
  title: string;
} {
  let extractedIcon: string | undefined;
  const withoutIcon = (raw || "").replace(
    /\\?\[ICON:([a-zA-Z0-9_-]+)\\?\]/gi,
    (_, iconName) => {
      if (!extractedIcon) extractedIcon = String(iconName).toLowerCase();
      return "";
    }
  );
  return {
    icon: extractedIcon,
    title: cleanHeadingTitle(withoutIcon),
  };
}

function normalizeLatexArrows(text: string): string {
  return (text || "")
    .replace(/\$*\\+rightleftarrows\$*/gi, "⇄")
    .replace(/\$*\\+leftrightarrow\$*/gi, "↔")
    .replace(/\$*\\+rightarrow\$*/gi, "→")
    .replace(/\$*\\+leftarrow\$*/gi, "←");
}

function cleanHeadingTitle(raw: string): string {
  return stripEmojiPrefix(
    normalizeLatexArrows(raw || "")
      .replace(/\\?\[ICON:[a-zA-Z0-9_-]+\\?\]/gi, "")
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
  const cleaned = normalizeLatexArrows(raw || "")
    .replace(
      /\((?:[^()]*?(?:src\/|src-tauri\/|\.github\/|supabase\/|[A-Za-z0-9_/-]+\.(?:rs|tsx?|sql|css|yml)\b|keeper_heuristic|compliance_tier|tier2_hashes|schema_os)[^()]*)\)/gi,
      ""
    )
    .replace(/\\?\[ICON:([a-zA-Z0-9_-]+)\\?\]/gi, "[ICON:$1]")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/`/g, "")
    .replace(/^\d+\.\s+/, "")
    .replace(/[:—–-]+\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return stripEmojiPrefix(cleaned);
}

export function extractCardIconAndTitle(rawTitle: string): {
  icon?: string;
  title: string;
} {
  let extractedIcon: string | undefined;
  const withoutIcon = (rawTitle || "")
    .replace(/\\?\[ICON:([a-zA-Z0-9_-]+)\\?\]/gi, (_, iconName) => {
      if (!extractedIcon) extractedIcon = String(iconName).toLowerCase();
      return "";
    })
    .replace(/\s{2,}/g, " ")
    .trim();
  return {
    icon: extractedIcon,
    title: withoutIcon,
  };
}

function extractImagesFromLine(raw: string): {
  images: string[];
  textWithoutImages: string;
} {
  const images: string[] = [];
  const textWithoutImages = (raw || "").replace(
    /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi,
    (_, url) => {
      images.push(String(url).trim());
      return "";
    }
  );
  return { images, textWithoutImages };
}

function cleanCardParagraph(raw: string): string {
  return normalizeLatexArrows(raw || "")
    .replace(/^\s*(?:[*-]|\d+\.)\s+/, "")
    .replace(/^[\s\u200B\uFEFF#\\]+/, "")
    .replace(/\\+$/, "")
    .replace(/^\*\*([^*]+)\*\*$/, "$1")
    .replace(
      /(?:\\?\[ICON:[a-zA-Z0-9_-]+\\?\]\s*)?\\?\[((?:\\?\[ICON:[a-zA-Z0-9_-]+\\?\]|[^\]])+?)\\?\]\(asset:\/\/[^)]+\)/gi,
      ""
    )
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\\?\[ICON:([a-zA-Z0-9_-]+)\\?\]/gi, "[ICON:$1]")
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
    .replace(/(?!\[ICON:)\[([^\]]+)\]\((?!asset:\/\/)[^)]+\)/gi, "$1")
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

  // Standalone bold heading bullet (e.g. `- **Physical Copies / True Ownership**` followed by sub-bullets)
  const standaloneBoldMatch = stripped.match(/^\*\*([^*]{2,120}?)\*\*:?\s*$/);
  if (standaloneBoldMatch) {
    const title = cleanCardTitle(standaloneBoldMatch[1]);
    if (title) {
      return {
        title,
        rest: "",
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

  const rawCleanedMainBody = cleanCardParagraph(rawMainBody);
  const parsedMainHeader = extractCardIconAndTitle(mainExtracted ? mainExtracted.title : "");
  const cleanedMainBody =
    parsedMainHeader.title &&
    rawCleanedMainBody.trim().toLowerCase() === parsedMainHeader.title.trim().toLowerCase()
      ? ""
      : rawCleanedMainBody;

  if (subBulletGroups.length > 0) {
    const firstLinesParsed = subBulletGroups.map((group) => {
      const firstExtracted = extractBulletTitleAndRest(group[0]);
      const joinedAll = group.map((l) => l.trim()).join(" ");
      const joinedExtracted = firstExtracted ? null : extractBulletTitleAndRest(joinedAll);
      const resolvedTitle = firstExtracted?.title || joinedExtracted?.title || "";
      const rawBodyText = firstExtracted
        ? [
            firstExtracted.rest,
            ...group.slice(1).map((l) => l.replace(/^\s*(?:[*-]|\d+\.)\s+/, "").trim()),
          ]
            .filter(Boolean)
            .join(" ")
        : joinedExtracted
          ? joinedExtracted.rest
          : joinedAll;
      const cleanedSubBody = cleanCardParagraph(rawBodyText);
      return {
        group,
        title: resolvedTitle,
        body:
          resolvedTitle &&
          cleanedSubBody.trim().toLowerCase() === resolvedTitle.trim().toLowerCase()
            ? ""
            : cleanedSubBody,
      };
    });

    const allSubsHaveTitles = firstLinesParsed.every((s) => Boolean(s.title));

    // If the parent bullet is an untitled umbrella header with no body of its own and titled sub-bullets,
    // promote each sub-bullet group into its own card (recursively handling any 4-space sub-sub-bullets).
    if (!parsedMainHeader.title && !cleanedMainBody && allSubsHaveTitles) {
      return subBulletGroups.flatMap(parseBulletGroupIntoCards);
    }

    // Render sub-bullets as structured mini-cards inside the parent card so there is never a multi-paragraph wall of text.
    const rawSubItems = firstLinesParsed
      .filter((s) => s.title || s.body)
      .flatMap((s) => {
        const normTitle = s.title.replace(/[.:;!?—–-]+$/g, "").trim().toLowerCase();
        const normBody = s.body.replace(/[.:;!?—–-]+$/g, "").trim().toLowerCase();

        // If the sub-bullet was just a bolded sentence with no separate body, or title & body are identical, treat it as the body text
        if (!s.body || normTitle === normBody) {
          return [{ title: "", body: (s.body || s.title).trim() }];
        }

        // Only merge into body if the bold prefix is a full paragraph (> 95 chars)
        if (s.title.trim().length > 95) {
          return [
            {
              title: "",
              body: `${s.title.replace(/[.:]+$/, "").trim()}. ${s.body.trim()}`,
            },
          ];
        }

        return [
          {
            title: s.title.replace(/\.+$/, "").trim(),
            body: s.body.trim(),
          },
        ];
      });

    return [
      {
        title: parsedMainHeader.title,
        icon: parsedMainHeader.icon,
        paragraphs: cleanedMainBody ? [cleanedMainBody.replace(/:\s*$/, ".")] : [],
        subItems: rawSubItems,
      },
    ];
  }

  if (!mainExtracted && !cleanedMainBody) return [];

  return [
    {
      title: parsedMainHeader.title,
      icon: parsedMainHeader.icon,
      paragraphs: cleanedMainBody ? [cleanedMainBody] : [],
    },
  ];
}

export function parseMarkdownIntoReleaseSections(markdown: string): {
  introTitle: string;
  introIcon?: string;
  intro: string;
  introImages?: string[];
  sections: ParsedReleaseSection[];
} {
  const cleaned = cleanPostBodyForViewer(
    (markdown || "").replace(/<!--[\s\S]*?-->/g, "")
  );
  const rawLines = cleaned.split(/\r?\n/);

  interface HeadingBlock {
    level: number;
    title: string;
    icon?: string;
    lines: string[];
  }

  let introTitle = "";
  let introIcon: string | undefined;
  const introLines: string[] = [];
  const blocks: HeadingBlock[] = [];
  let currentBlock: HeadingBlock | null = null;
  let inTopFence = false;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const trimmed = line.trim();

    if (/^```/.test(trimmed)) {
      inTopFence = !inTopFence;
      if (currentBlock) {
        currentBlock.lines.push(line);
      } else {
        introLines.push(line);
      }
      continue;
    }

    if (!inTopFence) {
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

        const { icon: headingIcon, title: headingTitle } =
          extractHeadingIconAndTitle(rawHeadingText);

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
        currentBlock = {
          level,
          title: headingTitle,
          icon: headingIcon,
          lines: [],
        };
        continue;
      }

      // Also recognize standalone bold subheadings (e.g. `**The Current Trend: Pass-Through Modding and "Vibe-Coding"**`)
      // when they do not end in sentence punctuation (`.` / `!`) and are immediately followed by bullet items.
      const standaloneBoldHeadingMatch = trimmed.match(
        /^\*\*([^*\n]{3,90}?)\*\*:?\s*$/
      );
      if (standaloneBoldHeadingMatch) {
        const candidateHeading = standaloneBoldHeadingMatch[1].trim();
        if (!/[.!]\s*$/.test(candidateHeading)) {
          let nextNonEmptyLine = "";
          for (let j = i + 1; j < rawLines.length; j++) {
            const nj = rawLines[j].trim();
            if (nj) {
              nextNonEmptyLine = nj;
              break;
            }
          }
          if (/^(?:[*-]|\d+\.)\s+/.test(nextNonEmptyLine)) {
            const { icon: headingIcon, title: headingTitle } =
              extractHeadingIconAndTitle(candidateHeading);
            if (headingTitle) {
              if (currentBlock) {
                blocks.push(currentBlock);
              }
              currentBlock = {
                level: 3,
                title: headingTitle,
                icon: headingIcon,
                lines: [],
              };
              continue;
            }
          }
        }
      }
    }

    if (currentBlock) {
      currentBlock.lines.push(line);
    } else {
      introLines.push(line);
    }
  }

  if (currentBlock) {
    blocks.push(currentBlock);
  }

  // If introLines itself contains bullet items (e.g. a post with bullets and no ## heading above them),
  // split introLines at the first bullet into prose intro + a leading section block.
  const firstIntroBulletIdx = introLines.findIndex((l) =>
    /^\s{0,1}(?:[*-]|\d+\.)\s+/.test(l)
  );
  if (firstIntroBulletIdx !== -1) {
    const bulletPortion = introLines.splice(firstIntroBulletIdx);
    blocks.unshift({
      level: 2,
      title: introTitle || "",
      icon: introIcon,
      lines: bulletPortion,
    });
    if (introTitle) introTitle = "";
    if (introIcon) introIcon = undefined;
  }

  // Fold a leading higher-level heading block that contains zero bullet items (e.g. a top-level ## overview heading above ### sections)
  // into the intro while preserving its heading title & icon. Do NOT fold peer sections at the same heading level.
  if (
    !introLines.some((l) => l.trim().length > 0) &&
    blocks.length > 1 &&
    blocks[0].level < blocks[1].level &&
    !blocks[0].lines.some((l) => /^\s*(?:[*-]|\d+\.)\s+/.test(l))
  ) {
    const firstBlock = blocks.shift()!;
    if (!introTitle && firstBlock.title) {
      introTitle = firstBlock.title;
      introIcon = firstBlock.icon;
    }
    introLines.push(...firstBlock.lines);
  }

  const sections: ParsedReleaseSection[] = [];

  for (const block of blocks) {
    const preBulletProseLines: string[] = [];
    const orderedEntries: Array<
      | { kind: "bullet"; lines: string[] }
      | { kind: "prose"; line: string }
      | { kind: "code"; code: string }
    > = [];
    const sectionImages: string[] = [];
    let currentBullet: string[] | null = null;
    let seenAnyCardItem = false;

    for (let idx = 0; idx < block.lines.length; idx++) {
      const rawLine = block.lines[idx];
      const trimmed = rawLine.trim();

      // Handle fenced code blocks ``` ... ```
      if (/^```/.test(trimmed)) {
        if (currentBullet) {
          orderedEntries.push({ kind: "bullet", lines: currentBullet });
          currentBullet = null;
        }
        seenAnyCardItem = true;
        const codeLines: string[] = [];
        const firstFenceRest = trimmed.replace(/^```[a-zA-Z0-9_-]*\s*/, "");
        if (firstFenceRest && !firstFenceRest.endsWith("```")) {
          codeLines.push(firstFenceRest);
        }
        idx++;
        while (idx < block.lines.length) {
          const cLine = block.lines[idx];
          if (/^```/.test(cLine.trim())) {
            break;
          }
          codeLines.push(cLine);
          idx++;
        }
        const joinedCode = codeLines.join("\n").trim();
        if (joinedCode) {
          orderedEntries.push({ kind: "code", code: joinedCode });
        }
        continue;
      }

      if (!trimmed || trimmed === "---") {
        if (currentBullet) {
          // Look ahead to next non-empty line: only keep currentBullet open across a blank line if the next line is an indented sub-bullet
          let nextNonEmpty = "";
          for (let j = idx + 1; j < block.lines.length; j++) {
            if (block.lines[j].trim()) {
              nextNonEmpty = block.lines[j];
              break;
            }
          }
          const nextIsSubBullet = /^\s{2,}(?:[*-]|\d+\.)\s+/.test(nextNonEmpty);
          if (!nextIsSubBullet) {
            orderedEntries.push({ kind: "bullet", lines: currentBullet });
            currentBullet = null;
          }
        }
        continue;
      }

      const { images: lineImages, textWithoutImages } = extractImagesFromLine(rawLine);
      if (lineImages.length > 0) {
        sectionImages.push(...lineImages);
      }

      const cleanTrimmed = textWithoutImages.trim();
      if (!cleanTrimmed) {
        if (currentBullet) {
          orderedEntries.push({ kind: "bullet", lines: currentBullet });
          currentBullet = null;
        }
        continue;
      }

      const isTopBullet = /^\s{0,1}(?:[*-]|\d+\.)\s+/.test(textWithoutImages);
      const isSubBullet = /^\s{2,}(?:[*-]|\d+\.)\s+/.test(textWithoutImages);

      if (isTopBullet) {
        if (currentBullet) {
          orderedEntries.push({ kind: "bullet", lines: currentBullet });
        }
        currentBullet = [textWithoutImages];
        seenAnyCardItem = true;
      } else if (isSubBullet && currentBullet) {
        currentBullet.push(textWithoutImages);
      } else if (currentBullet) {
        currentBullet.push(textWithoutImages);
      } else if (seenAnyCardItem) {
        orderedEntries.push({ kind: "prose", line: cleanTrimmed });
      } else {
        preBulletProseLines.push(cleanTrimmed);
      }
    }

    if (currentBullet) {
      orderedEntries.push({ kind: "bullet", lines: currentBullet });
    }

    const parsedCards: ParsedReleaseCard[] = [];
    for (const entry of orderedEntries) {
      if (entry.kind === "bullet") {
        parsedCards.push(...parseBulletGroupIntoCards(entry.lines));
      } else if (entry.kind === "code") {
        parsedCards.push({
          title: "",
          paragraphs: [],
          codeBlock: entry.code,
        });
      } else if (entry.kind === "prose") {
        const cleanedLine = cleanCardParagraph(entry.line);
        if (cleanedLine) {
          const prevCard = parsedCards[parsedCards.length - 1];
          if (
            prevCard &&
            !prevCard.title &&
            !prevCard.codeBlock &&
            (!prevCard.subItems || prevCard.subItems.length === 0)
          ) {
            prevCard.paragraphs.push(cleanedLine);
          } else {
            parsedCards.push({
              title: "",
              paragraphs: [cleanedLine],
            });
          }
        }
      }
    }

    const sectionDescription = preBulletProseLines
      .map(cleanCardParagraph)
      .filter(Boolean)
      .join("\n\n")
      .trim();

    if (
      parsedCards.length > 0 ||
      sectionDescription ||
      sectionImages.length > 0 ||
      block.title
    ) {
      sections.push({
        title: block.title,
        icon: block.icon,
        description: sectionDescription || undefined,
        cards: parsedCards,
        images: sectionImages.length > 0 ? sectionImages : undefined,
      });
    }
  }

  const introImages: string[] = [];
  const nonEmptyIntroLines = introLines
    .map((l) => {
      const { images, textWithoutImages } = extractImagesFromLine(l);
      if (images.length > 0) introImages.push(...images);
      return textWithoutImages.replace(/\\+$/, "").trim();
    })
    .filter(Boolean);

  const cleanedIntro = nonEmptyIntroLines
    .map(cleanCardParagraph)
    .filter(Boolean)
    .join("\n\n")
    .replace(/^[\s\u200B\uFEFF#\\]+/, "")
    .trim();

  return {
    introTitle,
    introIcon,
    intro: cleanedIntro,
    introImages: introImages.length > 0 ? introImages : undefined,
    sections,
  };
}

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

export function LegalDocVersionInfoBlock() {
  const { t } = useLexicon();
  const { stableVersion, stableDateDisplay } = useStableReleaseMeta();

  return (
    <div className="grid grid-cols-2 gap-3 w-full">
      <StatBox
        className="w-full"
        icon={t("icon_calendar_today", "calendar_today")}
        iconColorClass="text-[var(--accent)]"
        label={t("updated_date", "Last Updated")}
        value={stableDateDisplay}
        tooltipSubtitle={stableDateDisplay}
      />
      <StatBox
        className="w-full"
        icon={t("icon_tag", "tag")}
        iconColorClass="text-[var(--accent)]"
        label={t("release_notes_meta_version", "Version Number")}
        value={`v${stableVersion}`}
        tooltipSubtitle={`v${stableVersion}`}
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

            {orderedCards.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {orderedCards.map((card, cIdx) => {
                  const spanFull = spanFullFlags[cIdx];

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
                })}
              </div>
            )}

            {renderSectionImages(section.images)}
          </div>
        );
      })}
    </div>
  );
}

export function parseSeedCommunityBlog(markdown: string) {
  const lines = (markdown || "").split(/\r?\n/);
  let mainTitle = `Sanctuary OS v${packageJson.version}`;
  let subtitle = "";
  let releaseDate = "";
  let version = "";
  let platform = "";
  let intro = "";
  const tldrBullets: string[] = [];
  let inTldr = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith("# ") && !line.startsWith("## ")) {
      mainTitle = stripEmojiPrefix(line.replace(/^#\s+/, ""));
      continue;
    }
    if (!subtitle && line.startsWith("### ")) {
      subtitle = stripEmojiPrefix(line.replace(/^###\s+/, ""));
      continue;
    }
    if (!releaseDate && /release date:/i.test(line)) {
      const m = line.match(/release date:\s*\*{0,2}([^|*]+)/i);
      if (m && m[1]) releaseDate = m[1].trim();
    }
    if (!version && /version:/i.test(line)) {
      const vm = line.match(/version:\s*\*{0,2}([0-9A-Za-z._-]+)/i);
      if (vm && vm[1]) version = vm[1].trim();
    }
    if (!platform && /platform:/i.test(line)) {
      const pm = line.match(/platform:\s*\*{0,2}([^|*\n]+)/i);
      if (pm && pm[1]) platform = pm[1].trim();
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
    version,
    platform,
    summary: subtitle || intro || tldrBullets[0] || "",
    cleanBody: cleanPostBodyForViewer(markdown),
  };
}

export function formatReleasePostToMarkdownFile(
  record: Omit<KeepersReleasePostRecord, "id">
): string {
  const headerLines: string[] = [];
  if (record.title.trim()) {
    headerLines.push(`# ${record.title.trim()}`);
  }
  if (record.summary.trim()) {
    headerLines.push(`### ${record.summary.trim()}`);
  }
  const metaParts: string[] = [];
  if (record.releaseDate.trim()) {
    metaParts.push(`**Release Date:** ${record.releaseDate.trim()}`);
  }
  if (record.version.trim()) {
    metaParts.push(`**Version:** ${record.version.trim().replace(/^v/i, "")}`);
  }
  if (record.platform.trim()) {
    metaParts.push(`**Platform:** ${record.platform.trim()}`);
  }
  if (metaParts.length > 0) {
    headerLines.push(metaParts.join(" | "));
  }
  const cleanBody = cleanPostBodyForViewer(record.body || "");
  return `${headerLines.join("\n")}\n\n${cleanBody}\n`;
}

export function isBundledVersionNewer(bundledVer?: string, dbVer?: string): boolean {
  const cleanA = String(bundledVer || "")
    .replace(/^v/i, "")
    .trim();
  const cleanB = String(dbVer || "")
    .replace(/^v/i, "")
    .trim();
  if (!cleanA) return false;
  if (!cleanB) return true;
  if (cleanA.toLowerCase() === cleanB.toLowerCase()) return false;
  const parseNums = (v: string) =>
    v
      .split(/[^0-9]+/)
      .filter(Boolean)
      .map((n) => parseInt(n, 10) || 0);
  const a = parseNums(cleanA);
  const b = parseNums(cleanB);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const na = a[i] ?? 0;
    const nb = b[i] ?? 0;
    if (na > nb) return true;
    if (na < nb) return false;
  }
  return false;
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

export function serializeReleasePostMessage(
  record: Omit<KeepersReleasePostRecord, "id" | "title">
): string {
  const meta = {
    summary: record.summary || "",
    version: record.version || "",
    releaseDate: record.releaseDate || "",
    platform: record.platform || "Windows & macOS",
    imageUrl: record.imageUrl || "",
    codeSnippet: record.codeSnippet || "",
    pollData: record.pollData || null,
    customEdited: true,
  };
  return `<!-- RELEASE_META:${JSON.stringify(meta)} -->\n${(record.body || "").trim()}`;
}

export function deserializeReleasePostRow(
  row: any,
  fallback: Omit<KeepersReleasePostRecord, "id">,
  usePublished = false
): KeepersReleasePostRecord {
  if (!row) {
    return { id: null, ...fallback };
  }
  const rawMessage = String(
    (usePublished ? row.published_message || row.message : row.message) || ""
  );
  if (!rawMessage.trim()) {
    return { id: row.id || null, ...fallback };
  }
  const rawDescription = usePublished
    ? row.published_description ?? row.description
    : row.description;
  const rawTitle = String(
    (usePublished ? row.published_title || row.title : row.title) || ""
  ).trim();

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
      summary: rawDescription || legacyParsed.summary,
      releaseDate: legacyParsed.releaseDate,
      version: legacyParsed.version,
      platform: legacyParsed.platform,
    };
    body = legacyParsed.cleanBody || rawMessage;
  }

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
        : rawDescription || fallback.summary,
    version: parsedMeta.version || fallback.version,
    releaseDate: parsedMeta.releaseDate || fallback.releaseDate,
    platform: parsedMeta.platform || fallback.platform || "Windows & macOS",
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

export function deserializeChangelogRow(
  row: any,
  fallback: string,
  usePublished = false
): string {
  if (!row) return fallback;
  const raw = String(
    (usePublished ? row.published_message || row.message : row.message) || ""
  ).trim();
  return raw || fallback;
}

const normalizeMd = (txt: string): string =>
  (txt || "").replace(/\r\n/g, "\n").trim();

export function areReleasePostsEquivalent(
  a: Omit<KeepersReleasePostRecord, "id">,
  b: Omit<KeepersReleasePostRecord, "id">
): boolean {
  return (
    normalizeMd(a.title) === normalizeMd(b.title) &&
    normalizeMd(a.summary) === normalizeMd(b.summary) &&
    normalizeMd(a.version.replace(/^v/i, "")) ===
      normalizeMd(b.version.replace(/^v/i, "")) &&
    normalizeMd(cleanPostBodyForViewer(a.body)) ===
      normalizeMd(cleanPostBodyForViewer(b.body))
  );
}

export function areChangelogsEquivalent(a: string, b: string): boolean {
  return normalizeMd(a) === normalizeMd(b);
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
  const osRole = useStore((state: any) => state.osRole);
  const userRole = useStore((state: any) => state.userRole);
  const [isDevSupporter, setIsDevSupporter] = useState(false);

  const isStaff = useMemo(() => {
    const r1 = String(osRole || "").toLowerCase();
    const r2 = String(userRole || "").toLowerCase();
    return (
      ["keeper", "wayfinder", "architect", "admin"].includes(r1) ||
      ["keeper", "wayfinder", "architect", "admin"].includes(r2)
    );
  }, [osRole, userRole]);

  useEffect(() => {
    let active = true;
    const checkSupporter = async () => {
      const uid = session?.user?.id;
      if (!uid || uid === "local_citizen") {
        if (active) setIsDevSupporter(false);
        return;
      }
      const sup = await getSupporterState("web", uid);
      const until = sup?.dev_build?.dev_build_until || 0;
      if (active) {
        setIsDevSupporter(until > Math.floor(Date.now() / 1000));
      }
    };
    checkSupporter();
    const onUpdate = () => checkSupporter();
    window.addEventListener("sanctuary-supporter-updated", onUpdate);
    return () => {
      active = false;
      window.removeEventListener("sanctuary-supporter-updated", onUpdate);
    };
  }, [session?.user?.id]);

  const canSeeDevBuildCard =
    isKeepers || (Boolean(session?.user?.id) && (isDevSupporter || isStaff));

  const seedPublicBlog = useMemo(() => parseSeedCommunityBlog(bundledCommunityBlog), []);
  const seedDevBlog = useMemo(() => parseSeedCommunityBlog(bundledDevBlog), []);
  const seedChangelog = useMemo(() => parseLatestChangelogBlock(bundledNerdChangelog), []);

  const [pipelineConfig, setPipelineConfig] = useState<KeepersPipelineConfig>(
    DEFAULT_KEEPERS_PIPELINE_CONFIG
  );

  const defaultStableVersion = (
    versionLabel ||
    seedPublicBlog.version ||
    pipelineConfig.stable_version ||
    packageJson.version.split("-")[0] ||
    packageJson.version ||
    "0.6.0"
  )
    .replace(/^v/i, "")
    .trim();

  const defaultDevVersion = (
    seedDevBlog.version ||
    pipelineConfig.dev_build_version ||
    seedChangelog.version ||
    packageJson.version ||
    `${defaultStableVersion}-Dev.1`
  )
    .replace(/^v/i, "")
    .trim();

  const defaultStableDate =
    seedPublicBlog.releaseDate ||
    (pipelineConfig.stable_published_at
      ? new Date(pipelineConfig.stable_published_at).toLocaleDateString()
      : seedChangelog.date || new Date().toLocaleDateString());

  const defaultDevDate =
    seedDevBlog.releaseDate ||
    (pipelineConfig.dev_published_at
      ? new Date(pipelineConfig.dev_published_at).toLocaleDateString()
      : seedChangelog.date || new Date().toLocaleDateString());

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
      platform:
        seedPublicBlog.platform ||
        t("release_notes_meta_platform_default", "Windows & macOS"),
      imageUrl: "",
      codeSnippet: "",
      pollData: null,
      body: seedPublicBlog.cleanBody,
    }),
    [seedPublicBlog, defaultStableVersion, defaultStableDate, t]
  );

  const defaultDevPost = useMemo<Omit<KeepersReleasePostRecord, "id">>(
    () => ({
      title:
        seedDevBlog.mainTitle ||
        `${t("release_notes_dev_card_title", "Sanctuary OS — Dev Build")}`,
      summary:
        seedDevBlog.summary ||
        (seedChangelog.heading
          ? `${seedChangelog.heading} — ${t(
              "release_notes_dev_card_desc",
              "Latest daily preview features, heuristic refinements, and architectural updates ahead of the next Stable release."
            )}`
          : t(
              "release_notes_dev_card_desc",
              "Latest daily preview features, heuristic refinements, and architectural updates ahead of the next Stable release."
            )),
      version: defaultDevVersion,
      releaseDate: defaultDevDate,
      platform:
        seedDevBlog.platform ||
        t("release_notes_meta_platform_default", "Windows & macOS"),
      imageUrl: "",
      codeSnippet: "",
      pollData: null,
      body: seedDevBlog.cleanBody || seedChangelog.markdown,
    }),
    [seedDevBlog, seedChangelog, defaultDevVersion, defaultDevDate, t]
  );

  // Working (Synced .md + DB) vs. Published (User-Facing) States
  const [workingPublicPost, setWorkingPublicPost] = useState<KeepersReleasePostRecord>({
    id: null,
    ...defaultPublicPost,
  });
  const [publishedPublicPost, setPublishedPublicPost] = useState<KeepersReleasePostRecord>({
    id: null,
    ...defaultPublicPost,
  });
  const [workingDevPost, setWorkingDevPost] = useState<KeepersReleasePostRecord>({
    id: null,
    ...defaultDevPost,
  });
  const [publishedDevPost, setPublishedDevPost] = useState<KeepersReleasePostRecord>({
    id: null,
    ...defaultDevPost,
  });

  const [workingStableChangelog, setWorkingStableChangelog] = useState<string>(
    bundledRunningChangelog || bundledNerdChangelog
  );
  const [publishedStableChangelog, setPublishedStableChangelog] = useState<string>(
    bundledRunningChangelog || bundledNerdChangelog
  );
  const [workingDevChangelog, setWorkingDevChangelog] = useState<string>(
    bundledNerdChangelog || seedChangelog.markdown
  );
  const [publishedDevChangelog, setPublishedDevChangelog] = useState<string>(
    bundledNerdChangelog || seedChangelog.markdown
  );
  const [stableChangelogRowId, setStableChangelogRowId] = useState<string | null>(null);
  const [devChangelogRowId, setDevChangelogRowId] = useState<string | null>(null);

  // User-facing vs. Keepers Core effective records
  const publicPost = isKeepers ? workingPublicPost : publishedPublicPost;
  const devPost = isKeepers ? workingDevPost : publishedDevPost;

  const hasUnpublishedPublicPost = useMemo(
    () => !areReleasePostsEquivalent(workingPublicPost, publishedPublicPost),
    [workingPublicPost, publishedPublicPost]
  );
  const hasUnpublishedPublicChangelog = useMemo(
    () => !areChangelogsEquivalent(workingStableChangelog, publishedStableChangelog),
    [workingStableChangelog, publishedStableChangelog]
  );
  const hasUnpublishedPublic = hasUnpublishedPublicPost || hasUnpublishedPublicChangelog;

  const hasUnpublishedDevPost = useMemo(
    () => !areReleasePostsEquivalent(workingDevPost, publishedDevPost),
    [workingDevPost, publishedDevPost]
  );
  const hasUnpublishedDevChangelog = useMemo(
    () => !areChangelogsEquivalent(workingDevChangelog, publishedDevChangelog),
    [workingDevChangelog, publishedDevChangelog]
  );
  const hasUnpublishedDev = hasUnpublishedDevPost || hasUnpublishedDevChangelog;

  const [activeChannel, setActiveChannel] = useState<"stable" | "dev" | null>(null);
  const [activeView, setActiveView] = useState<"post" | "changelog">("post");

  // Keepers Core Dispatch / Comm-Link Post & Changelog Editor state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<PostEditorMode>("visual");
  const [editorChannel, setEditorChannel] = useState<"stable" | "dev">("stable");
  const [editorDocType, setEditorDocType] = useState<"post" | "changelog">("post");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftSummary, setDraftSummary] = useState("");
  const [draftVersion, setDraftVersion] = useState("");
  const [draftReleaseDate, setDraftReleaseDate] = useState("");
  const [draftPlatform, setDraftPlatform] = useState("");
  const [draftImageUrl, setDraftImageUrl] = useState("");
  const [draftCodeSnippet, setDraftCodeSnippet] = useState("");
  const [draftPollData, setDraftPollData] = useState<DispatchPollData | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [isAssetPanelOpen, setIsAssetPanelOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
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

  const persistReleaseStateCache = useCallback(
    (stateObj: {
      workingPublicPost: KeepersReleasePostRecord;
      publishedPublicPost: KeepersReleasePostRecord;
      workingDevPost: KeepersReleasePostRecord;
      publishedDevPost: KeepersReleasePostRecord;
      workingStableChangelog: string;
      publishedStableChangelog: string;
      workingDevChangelog: string;
      publishedDevChangelog: string;
    }) => {
      try {
        localStorage.setItem(
          "sanctuary_keepers_release_posts_v5",
          JSON.stringify(stateObj)
        );
        // Keep v4 in sync with published posts for legacy readers
        localStorage.setItem(
          "sanctuary_keepers_release_posts_v4",
          JSON.stringify({
            publicPost: stateObj.publishedPublicPost,
            devPost: stateObj.publishedDevPost,
            publishedStableChangelog: stateObj.publishedStableChangelog,
            publishedDevChangelog: stateObj.publishedDevChangelog,
          })
        );
      } catch {
        // ignore storage errors
      }
    },
    []
  );

  const loadPostsAndReleases = useCallback(
    async (
      forceRefreshGitHub = false,
      syncDirection: "auto" | "local_to_hub" | "hub_to_local" = "auto"
    ) => {
      try {
        const cachedRawV5 = localStorage.getItem("sanctuary_keepers_release_posts_v5");
        if (cachedRawV5) {
          const parsedCache = JSON.parse(cachedRawV5);
          if (parsedCache?.workingPublicPost) setWorkingPublicPost(parsedCache.workingPublicPost);
          if (parsedCache?.publishedPublicPost)
            setPublishedPublicPost(parsedCache.publishedPublicPost);
          if (parsedCache?.workingDevPost) setWorkingDevPost(parsedCache.workingDevPost);
          if (parsedCache?.publishedDevPost) setPublishedDevPost(parsedCache.publishedDevPost);
          if (parsedCache?.workingStableChangelog)
            setWorkingStableChangelog(parsedCache.workingStableChangelog);
          if (parsedCache?.publishedStableChangelog)
            setPublishedStableChangelog(parsedCache.publishedStableChangelog);
          if (parsedCache?.workingDevChangelog)
            setWorkingDevChangelog(parsedCache.workingDevChangelog);
          if (parsedCache?.publishedDevChangelog)
            setPublishedDevChangelog(parsedCache.publishedDevChangelog);
        }
      } catch {
        // ignore cache parse error
      }

      try {
        const [broadcastRes, cfg, localSnapshots] = await Promise.all([
          supabaseAuth
            .from("keeper_system_broadcasts")
            .select(
              "id, title, description, message, published_title, published_description, published_message, published_at, updated_at, category, target_audience, code_snippet, poll_data, created_at"
            )
            .in("category", [
              "ReleasePost_Public",
              "ReleasePost_Dev",
              "ReleaseNotesBlog",
              PUBLIC_CHANGELOG_BROADCAST_CATEGORY,
              DEV_CHANGELOG_BROADCAST_CATEGORY,
            ])
            .order("created_at", { ascending: false }),
          getKeepersPipelineConfig(forceRefreshGitHub),
          readAllLocalDocSnapshots(),
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
          const publicChangelogRow = rows.find(
            (r: any) => r.category === PUBLIC_CHANGELOG_BROADCAST_CATEGORY
          );
          const devChangelogRow = rows.find(
            (r: any) => r.category === DEV_CHANGELOG_BROADCAST_CATEGORY
          );

          // 1. Parse local .md snapshots
          const localPubSnap = localSnapshots.release_notes_public;
          const localDevSnap = localSnapshots.release_notes_dev;
          const localRunningClSnap = localSnapshots.changelog_running;
          const localDevClSnap = localSnapshots.changelog_dev;

          const parsedLocalPub = localPubSnap?.content
            ? parseSeedCommunityBlog(localPubSnap.content)
            : seedPublicBlog;
          const parsedLocalDev = localDevSnap?.content
            ? parseSeedCommunityBlog(localDevSnap.content)
            : seedDevBlog;

          let resolvedPubPublished = deserializeReleasePostRow(
            publicRow,
            defaultPublicPost,
            true
          );
          let resolvedPubWorking = deserializeReleasePostRow(
            publicRow,
            defaultPublicPost,
            false
          );

          let resolvedDevPublished = deserializeReleasePostRow(
            devRow,
            defaultDevPost,
            true
          );
          let resolvedDevWorking = deserializeReleasePostRow(
            devRow,
            defaultDevPost,
            false
          );

          const localPubPostCandidate: KeepersReleasePostRecord = {
            id: resolvedPubWorking.id,
            title: parsedLocalPub.mainTitle || resolvedPubWorking.title,
            summary: parsedLocalPub.summary || resolvedPubWorking.summary,
            version: parsedLocalPub.version || resolvedPubWorking.version,
            releaseDate: parsedLocalPub.releaseDate || resolvedPubWorking.releaseDate,
            platform: parsedLocalPub.platform || resolvedPubWorking.platform,
            imageUrl: resolvedPubWorking.imageUrl || "",
            codeSnippet: resolvedPubWorking.codeSnippet || "",
            pollData: resolvedPubWorking.pollData || null,
            body: parsedLocalPub.cleanBody || resolvedPubWorking.body,
          };

          const localDevPostCandidate: KeepersReleasePostRecord = {
            id: resolvedDevWorking.id,
            title: parsedLocalDev.mainTitle || resolvedDevWorking.title,
            summary: parsedLocalDev.summary || resolvedDevWorking.summary,
            version: parsedLocalDev.version || resolvedDevWorking.version,
            releaseDate: parsedLocalDev.releaseDate || resolvedDevWorking.releaseDate,
            platform: parsedLocalDev.platform || resolvedDevWorking.platform,
            imageUrl: resolvedDevWorking.imageUrl || "",
            codeSnippet: resolvedDevWorking.codeSnippet || "",
            pollData: resolvedDevWorking.pollData || null,
            body: parsedLocalDev.cleanBody || resolvedDevWorking.body,
          };

          const localStableClContent =
            localRunningClSnap?.content || bundledRunningChangelog || bundledNerdChangelog;
          const localDevClContent =
            localDevClSnap?.content || bundledNerdChangelog || seedChangelog.markdown;

          let resolvedStableClPublished = deserializeChangelogRow(
            publicChangelogRow,
            localStableClContent,
            true
          );
          let resolvedStableClWorking = deserializeChangelogRow(
            publicChangelogRow,
            localStableClContent,
            false
          );

          let resolvedDevClPublished = deserializeChangelogRow(
            devChangelogRow,
            localDevClContent,
            true
          );
          let resolvedDevClWorking = deserializeChangelogRow(
            devChangelogRow,
            localDevClContent,
            false
          );

          let nextPubRowId = publicRow?.id || null;
          let nextDevRowId = devRow?.id || null;
          let nextPubClRowId = publicChangelogRow?.id || null;
          let nextDevClRowId = devChangelogRow?.id || null;

          const canSyncWorking = isKeepers || isStaff || syncDirection !== "auto";

          // 2. Two-Way Sync (.md <-> Hub DB Working Columns ONLY; never touches published_*)
          if (canSyncWorking) {
            // A. Public Release Post (Release Notes (Community Blog).md <-> ReleasePost_Public)
            const pubDbEpoch = publicRow?.updated_at
              ? new Date(publicRow.updated_at).getTime()
              : publicRow?.created_at
                ? new Date(publicRow.created_at).getTime()
                : 0;
            const pubLocalEpoch = localPubSnap?.modified_epoch_ms || 0;

            if (!areReleasePostsEquivalent(localPubPostCandidate, resolvedPubWorking)) {
              if (
                syncDirection === "local_to_hub" ||
                (syncDirection === "auto" && pubLocalEpoch > pubDbEpoch + 1500)
              ) {
                resolvedPubWorking = localPubPostCandidate;
                const serialized = serializeReleasePostMessage(resolvedPubWorking);
                const nowIso = new Date().toISOString();
                if (nextPubRowId) {
                  await supabaseAuth
                    .from("keeper_system_broadcasts")
                    .update({
                      title: resolvedPubWorking.title,
                      description: resolvedPubWorking.summary || null,
                      message: serialized,
                      updated_at: nowIso,
                    })
                    .eq("id", nextPubRowId);
                } else {
                  const { data } = await supabaseAuth
                    .from("keeper_system_broadcasts")
                    .insert({
                      title: resolvedPubWorking.title,
                      description: resolvedPubWorking.summary || null,
                      category: "ReleasePost_Public",
                      target_audience: "Public",
                      message: serialized,
                      published_title: resolvedPubPublished.title,
                      published_description: resolvedPubPublished.summary || null,
                      published_message: serializeReleasePostMessage(resolvedPubPublished),
                      published_at: nowIso,
                      updated_at: nowIso,
                      is_active: false,
                      is_pinned: "false",
                    })
                    .select("id");
                  if (data?.[0]?.id) {
                    nextPubRowId = data[0].id;
                    resolvedPubWorking.id = nextPubRowId;
                  }
                }
              } else if (
                syncDirection === "hub_to_local" ||
                (syncDirection === "auto" && pubDbEpoch > 0 && pubLocalEpoch > 0)
              ) {
                await writeLocalDirectiveFile(
                  "release_notes_public",
                  formatReleasePostToMarkdownFile(resolvedPubWorking)
                );
              }
            }

            // B. Dev Release Post (Release Notes (Dev).md <-> ReleasePost_Dev)
            const devDbEpoch = devRow?.updated_at
              ? new Date(devRow.updated_at).getTime()
              : devRow?.created_at
                ? new Date(devRow.created_at).getTime()
                : 0;
            const devLocalEpoch = localDevSnap?.modified_epoch_ms || 0;

            if (!areReleasePostsEquivalent(localDevPostCandidate, resolvedDevWorking)) {
              if (
                syncDirection === "local_to_hub" ||
                (syncDirection === "auto" && devLocalEpoch > devDbEpoch + 1500)
              ) {
                resolvedDevWorking = localDevPostCandidate;
                const serialized = serializeReleasePostMessage(resolvedDevWorking);
                const nowIso = new Date().toISOString();
                if (nextDevRowId) {
                  await supabaseAuth
                    .from("keeper_system_broadcasts")
                    .update({
                      title: resolvedDevWorking.title,
                      description: resolvedDevWorking.summary || null,
                      message: serialized,
                      updated_at: nowIso,
                    })
                    .eq("id", nextDevRowId);
                } else {
                  const { data } = await supabaseAuth
                    .from("keeper_system_broadcasts")
                    .insert({
                      title: resolvedDevWorking.title,
                      description: resolvedDevWorking.summary || null,
                      category: "ReleasePost_Dev",
                      target_audience: "Dev",
                      message: serialized,
                      published_title: resolvedDevPublished.title,
                      published_description: resolvedDevPublished.summary || null,
                      published_message: serializeReleasePostMessage(resolvedDevPublished),
                      published_at: nowIso,
                      updated_at: nowIso,
                      is_active: false,
                      is_pinned: "false",
                    })
                    .select("id");
                  if (data?.[0]?.id) {
                    nextDevRowId = data[0].id;
                    resolvedDevWorking.id = nextDevRowId;
                  }
                }
              } else if (
                syncDirection === "hub_to_local" ||
                (syncDirection === "auto" && devDbEpoch > 0 && devLocalEpoch > 0)
              ) {
                await writeLocalDirectiveFile(
                  "release_notes_dev",
                  formatReleasePostToMarkdownFile(resolvedDevWorking)
                );
              }
            }

            // C. Stable Changelog (changelog (running).md <-> ReleaseChangelog_Public)
            const pubClDbEpoch = publicChangelogRow?.updated_at
              ? new Date(publicChangelogRow.updated_at).getTime()
              : publicChangelogRow?.created_at
                ? new Date(publicChangelogRow.created_at).getTime()
                : 0;
            const pubClLocalEpoch = localRunningClSnap?.modified_epoch_ms || 0;

            if (!nextPubClRowId) {
              const nowIso = new Date().toISOString();
              const { data } = await supabaseAuth
                .from("keeper_system_broadcasts")
                .insert({
                  title: "Full Change Log (Stable)",
                  description: "Running changelog across dev builds since last stable release",
                  category: PUBLIC_CHANGELOG_BROADCAST_CATEGORY,
                  target_audience: "Public",
                  message: localStableClContent,
                  published_title: "Full Change Log (Stable)",
                  published_description:
                    "Running changelog across dev builds since last stable release",
                  published_message: localStableClContent,
                  published_at: nowIso,
                  updated_at: nowIso,
                  is_active: false,
                  is_pinned: "false",
                })
                .select("id");
              if (data?.[0]?.id) {
                nextPubClRowId = data[0].id;
              }
            } else if (!areChangelogsEquivalent(localStableClContent, resolvedStableClWorking)) {
              if (
                syncDirection === "local_to_hub" ||
                (syncDirection === "auto" && pubClLocalEpoch > pubClDbEpoch + 1500)
              ) {
                resolvedStableClWorking = localStableClContent;
                await supabaseAuth
                  .from("keeper_system_broadcasts")
                  .update({
                    message: resolvedStableClWorking,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", nextPubClRowId);
              } else if (
                syncDirection === "hub_to_local" ||
                (syncDirection === "auto" && pubClDbEpoch > 0 && pubClLocalEpoch > 0)
              ) {
                await writeLocalDirectiveFile("changelog_running", resolvedStableClWorking);
              }
            }

            // D. Dev Changelog (changelog.md <-> ReleaseChangelog_Dev)
            const devClDbEpoch = devChangelogRow?.updated_at
              ? new Date(devChangelogRow.updated_at).getTime()
              : devChangelogRow?.created_at
                ? new Date(devChangelogRow.created_at).getTime()
                : 0;
            const devClLocalEpoch = localDevClSnap?.modified_epoch_ms || 0;

            if (!nextDevClRowId) {
              const nowIso = new Date().toISOString();
              const { data } = await supabaseAuth
                .from("keeper_system_broadcasts")
                .insert({
                  title: "Full Change Log (Dev)",
                  description: "Current Dev Build technical changelog",
                  category: DEV_CHANGELOG_BROADCAST_CATEGORY,
                  target_audience: "Dev",
                  message: localDevClContent,
                  published_title: "Full Change Log (Dev)",
                  published_description: "Current Dev Build technical changelog",
                  published_message: localDevClContent,
                  published_at: nowIso,
                  updated_at: nowIso,
                  is_active: false,
                  is_pinned: "false",
                })
                .select("id");
              if (data?.[0]?.id) {
                nextDevClRowId = data[0].id;
              }
            } else if (!areChangelogsEquivalent(localDevClContent, resolvedDevClWorking)) {
              if (
                syncDirection === "local_to_hub" ||
                (syncDirection === "auto" && devClLocalEpoch > devClDbEpoch + 1500)
              ) {
                resolvedDevClWorking = localDevClContent;
                await supabaseAuth
                  .from("keeper_system_broadcasts")
                  .update({
                    message: resolvedDevClWorking,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", nextDevClRowId);
              } else if (
                syncDirection === "hub_to_local" ||
                (syncDirection === "auto" && devClDbEpoch > 0 && devClLocalEpoch > 0)
              ) {
                await writeLocalDirectiveFile("changelog_dev", resolvedDevClWorking);
              }
            }
          }

          setStableChangelogRowId(nextPubClRowId);
          setDevChangelogRowId(nextDevClRowId);

          setWorkingPublicPost(resolvedPubWorking);
          setPublishedPublicPost(resolvedPubPublished);
          setWorkingDevPost(resolvedDevWorking);
          setPublishedDevPost(resolvedDevPublished);

          setWorkingStableChangelog(resolvedStableClWorking);
          setPublishedStableChangelog(resolvedStableClPublished);
          setWorkingDevChangelog(resolvedDevClWorking);
          setPublishedDevChangelog(resolvedDevClPublished);

          persistReleaseStateCache({
            workingPublicPost: resolvedPubWorking,
            publishedPublicPost: resolvedPubPublished,
            workingDevPost: resolvedDevWorking,
            publishedDevPost: resolvedDevPublished,
            workingStableChangelog: resolvedStableClWorking,
            publishedStableChangelog: resolvedStableClPublished,
            workingDevChangelog: resolvedDevClWorking,
            publishedDevChangelog: resolvedDevClPublished,
          });
        }
      } catch {
        // Keep current / cached state if offline
      }
    },
    [
      defaultPublicPost,
      defaultDevPost,
      seedPublicBlog,
      seedDevBlog,
      seedChangelog.markdown,
      isKeepers,
      isStaff,
      persistReleaseStateCache,
    ]
  );

  useEffect(() => {
    loadPostsAndReleases(false);
    const onUpdated = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail;
      const dir = detail?.syncDirection || "auto";
      loadPostsAndReleases(false, dir);
    };
    const onTourReleasePanel = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail || {};
      if (detail.open) {
        setActiveChannel(detail.channel === "dev" ? "dev" : "stable");
        setActiveView(detail.view === "changelog" ? "changelog" : "post");
      } else {
        setActiveChannel(null);
      }
    };
    window.addEventListener("keepers_release_posts_updated", onUpdated);
    window.addEventListener("sanctuary-tour-release-notes-panel", onTourReleasePanel);
    return () => {
      window.removeEventListener("keepers_release_posts_updated", onUpdated);
      window.removeEventListener("sanctuary-tour-release-notes-panel", onTourReleasePanel);
    };
  }, [loadPostsAndReleases]);

  const populateDraftForChannel = useCallback(
    (channel: "stable" | "dev", docType: "post" | "changelog" = editorDocType) => {
      const target = channel === "dev" ? workingDevPost : workingPublicPost;
      const targetChangelog =
        channel === "dev" ? workingDevChangelog : workingStableChangelog;
      setEditorChannel(channel);
      setEditorDocType(docType);
      setDraftTitle(target.title);
      setDraftSummary(target.summary);
      setDraftVersion(
        target.version || (channel === "dev" ? defaultDevVersion : defaultStableVersion)
      );
      setDraftReleaseDate(
        target.releaseDate || (channel === "dev" ? defaultDevDate : defaultStableDate)
      );
      setDraftPlatform(
        target.platform || t("release_notes_meta_platform_default", "Windows & macOS")
      );
      setDraftImageUrl(target.imageUrl || "");
      setDraftCodeSnippet(target.codeSnippet || "");
      setShowCodeInput(Boolean(target.codeSnippet));
      setDraftPollData(target.pollData || null);
      const nextBody = docType === "changelog" ? targetChangelog : target.body;
      setDraftBody(nextBody);
      if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
      if (editor) {
        editor.commands.setContent(nextBody || "", { emitUpdate: false });
      }
    },
    [
      editorDocType,
      workingDevPost,
      workingPublicPost,
      workingDevChangelog,
      workingStableChangelog,
      defaultDevVersion,
      defaultStableVersion,
      defaultDevDate,
      defaultStableDate,
      editor,
      t,
    ]
  );

  const openKeepersEditor = (
    channel: "stable" | "dev",
    docType: "post" | "changelog" = "post"
  ) => {
    populateDraftForChannel(channel, docType);
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

  const handlePublishChannel = async (
    channel: "stable" | "dev",
    e?: React.MouseEvent
  ) => {
    if (e) e.stopPropagation();
    setIsPublishing(true);
    try {
      const isDev = channel === "dev";
      const targetPost = isDev ? workingDevPost : workingPublicPost;
      const targetCl = isDev ? workingDevChangelog : workingStableChangelog;
      const postCat = isDev ? "ReleasePost_Dev" : "ReleasePost_Public";
      const clCat = isDev
        ? DEV_CHANGELOG_BROADCAST_CATEGORY
        : PUBLIC_CHANGELOG_BROADCAST_CATEGORY;
      const nowIso = new Date().toISOString();

      const serializedPostMsg = serializeReleasePostMessage(targetPost);

      // 1. Publish Release Post row
      let postId = targetPost.id;
      if (!postId) {
        const { data: existingRows } = await supabaseAuth
          .from("keeper_system_broadcasts")
          .select("id")
          .eq("category", postCat)
          .order("created_at", { ascending: false });
        if (existingRows?.[0]?.id) postId = existingRows[0].id;
      }

      if (postId) {
        await supabaseAuth
          .from("keeper_system_broadcasts")
          .update({
            title: targetPost.title,
            description: targetPost.summary || null,
            message: serializedPostMsg,
            published_title: targetPost.title,
            published_description: targetPost.summary || null,
            published_message: serializedPostMsg,
            published_at: nowIso,
            updated_at: nowIso,
          })
          .eq("id", postId);
      } else {
        const { data } = await supabaseAuth
          .from("keeper_system_broadcasts")
          .insert({
            title: targetPost.title,
            description: targetPost.summary || null,
            category: postCat,
            target_audience: isDev ? "Dev" : "Public",
            message: serializedPostMsg,
            published_title: targetPost.title,
            published_description: targetPost.summary || null,
            published_message: serializedPostMsg,
            published_at: nowIso,
            updated_at: nowIso,
            is_active: false,
            is_pinned: "false",
          })
          .select("id");
        if (data?.[0]?.id) postId = data[0].id;
      }

      // 2. Publish Changelog row
      let clId = isDev ? devChangelogRowId : stableChangelogRowId;
      if (!clId) {
        const { data: existingCl } = await supabaseAuth
          .from("keeper_system_broadcasts")
          .select("id")
          .eq("category", clCat)
          .order("created_at", { ascending: false });
        if (existingCl?.[0]?.id) clId = existingCl[0].id;
      }

      if (clId) {
        await supabaseAuth
          .from("keeper_system_broadcasts")
          .update({
            message: targetCl,
            published_message: targetCl,
            published_at: nowIso,
            updated_at: nowIso,
          })
          .eq("id", clId);
      } else {
        const { data } = await supabaseAuth
          .from("keeper_system_broadcasts")
          .insert({
            title: isDev ? "Full Change Log (Dev)" : "Full Change Log (Stable)",
            description: isDev
              ? "Current Dev Build technical changelog"
              : "Running changelog across dev builds since last stable release",
            category: clCat,
            target_audience: isDev ? "Dev" : "Public",
            message: targetCl,
            published_title: isDev ? "Full Change Log (Dev)" : "Full Change Log (Stable)",
            published_message: targetCl,
            published_at: nowIso,
            updated_at: nowIso,
            is_active: false,
            is_pinned: "false",
          })
          .select("id");
        if (data?.[0]?.id) clId = data[0].id;
      }

      const nextPubPublished = isDev ? publishedPublicPost : { ...targetPost, id: postId };
      const nextDevPublished = isDev ? { ...targetPost, id: postId } : publishedDevPost;
      const nextStableClPublished = isDev ? publishedStableChangelog : targetCl;
      const nextDevClPublished = isDev ? targetCl : publishedDevChangelog;

      if (isDev) {
        setPublishedDevPost(nextDevPublished);
        setPublishedDevChangelog(nextDevClPublished);
        setDevChangelogRowId(clId);
      } else {
        setPublishedPublicPost(nextPubPublished);
        setPublishedStableChangelog(nextStableClPublished);
        setStableChangelogRowId(clId);
      }

      persistReleaseStateCache({
        workingPublicPost,
        publishedPublicPost: nextPubPublished,
        workingDevPost,
        publishedDevPost: nextDevPublished,
        workingStableChangelog,
        publishedStableChangelog: nextStableClPublished,
        workingDevChangelog,
        publishedDevChangelog: nextDevClPublished,
      });

      window.dispatchEvent(new CustomEvent("keepers_release_posts_updated"));
      useStore
        .getState()
        .pushStatus(
          t(
            "dir_toast_published_live",
            "Published live to {Citizens} and synced with local .md file!"
          ),
          "success"
        );
    } finally {
      setIsPublishing(false);
    }
  };

  const handleSaveKeepersPost = async (publishLive = false) => {
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
      updateTimeoutRef.current = null;
    }
    let finalBody = draftBody;
    if (editor && editorMode === "wysiwyg") {
      finalBody = (editor.storage as any).markdown.getMarkdown();
      setDraftBody(finalBody);
    }
    if (!finalBody.trim()) return;
    if (editorDocType === "post" && !draftTitle.trim()) return;

    setIsSaving(true);
    try {
      const isDev = editorChannel === "dev";
      const nowIso = new Date().toISOString();

      if (editorDocType === "changelog") {
        const clCat = isDev
          ? DEV_CHANGELOG_BROADCAST_CATEGORY
          : PUBLIC_CHANGELOG_BROADCAST_CATEGORY;
        const clSlug = isDev ? "changelog_dev" : "changelog_running";
        const trimmedCl = finalBody.trim();

        // 1. Write to local .md file
        await writeLocalDirectiveFile(clSlug, `${trimmedCl}\n`);

        // 2. Sync to Hub DB (working message + optional publish)
        let clId = isDev ? devChangelogRowId : stableChangelogRowId;
        if (!clId) {
          const { data: existingRows } = await supabaseAuth
            .from("keeper_system_broadcasts")
            .select("id")
            .eq("category", clCat)
            .order("created_at", { ascending: false });
          if (existingRows?.[0]?.id) clId = existingRows[0].id;
        }

        const clPayload: any = {
          title: isDev ? "Full Change Log (Dev)" : "Full Change Log (Stable)",
          description: isDev
            ? "Current Dev Build technical changelog"
            : "Running changelog across dev builds since last stable release",
          category: clCat,
          target_audience: isDev ? "Dev" : "Public",
          message: trimmedCl,
          updated_at: nowIso,
          is_active: false,
          is_pinned: "false",
        };
        if (publishLive) {
          clPayload.published_title = clPayload.title;
          clPayload.published_description = clPayload.description;
          clPayload.published_message = trimmedCl;
          clPayload.published_at = nowIso;
        }

        if (clId) {
          await supabaseAuth
            .from("keeper_system_broadcasts")
            .update(clPayload)
            .eq("id", clId);
        } else {
          if (!publishLive) {
            clPayload.published_title = clPayload.title;
            clPayload.published_description = clPayload.description;
            clPayload.published_message = isDev
              ? publishedDevChangelog
              : publishedStableChangelog;
            clPayload.published_at = nowIso;
          }
          const { data } = await supabaseAuth
            .from("keeper_system_broadcasts")
            .insert(clPayload)
            .select("id");
          if (data?.[0]?.id) clId = data[0].id;
        }

        if (isDev) {
          setWorkingDevChangelog(trimmedCl);
          setDevChangelogRowId(clId);
          if (publishLive) setPublishedDevChangelog(trimmedCl);
        } else {
          setWorkingStableChangelog(trimmedCl);
          setStableChangelogRowId(clId);
          if (publishLive) setPublishedStableChangelog(trimmedCl);
        }

        if (publishLive) {
          await handlePublishChannel(editorChannel);
        } else {
          persistReleaseStateCache({
            workingPublicPost,
            publishedPublicPost,
            workingDevPost,
            publishedDevPost,
            workingStableChangelog: isDev ? workingStableChangelog : trimmedCl,
            publishedStableChangelog,
            workingDevChangelog: isDev ? trimmedCl : workingDevChangelog,
            publishedDevChangelog,
          });
          window.dispatchEvent(new CustomEvent("keepers_release_posts_updated"));
          useStore
            .getState()
            .pushStatus(
              t(
                "dir_sync_toast_synced",
                "Directives & Covenants synchronized between Keepers Core & Codebase (.md)!"
              ),
              "success"
            );
        }
        setIsEditorOpen(false);
        return;
      }

      // Post mode: Save & Sync (.md + DB) and optionally Publish
      const targetCategory = isDev ? "ReleasePost_Dev" : "ReleasePost_Public";
      const existingId = isDev ? workingDevPost.id : workingPublicPost.id;
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

      const nextRecord: KeepersReleasePostRecord = {
        id: existingId || null,
        title: draftTitle.trim(),
        summary: draftSummary.trim(),
        version: draftVersion.trim().replace(/^v/i, ""),
        releaseDate: draftReleaseDate.trim(),
        platform:
          draftPlatform.trim() ||
          t("release_notes_meta_platform_default", "Windows & macOS"),
        imageUrl: draftImageUrl.trim(),
        codeSnippet: draftCodeSnippet.trim(),
        pollData: sanitizedPoll,
        body: finalBody.trim(),
      };

      const serializedMessage = serializeReleasePostMessage(nextRecord);

      // 1. Write to local .md file
      await writeLocalDirectiveFile(
        isDev ? "release_notes_dev" : "release_notes_public",
        formatReleasePostToMarkdownFile(nextRecord)
      );

      // 2. Write to Hub DB (working columns + optional published columns)
      const payload: any = {
        title: nextRecord.title,
        description: nextRecord.summary || null,
        category: targetCategory,
        target_audience: isDev ? "Dev" : "Public",
        message: serializedMessage,
        code_snippet: nextRecord.codeSnippet || null,
        poll_data: sanitizedPoll,
        updated_at: nowIso,
        is_active: false,
        is_pinned: "false",
      };

      if (publishLive) {
        payload.published_title = nextRecord.title;
        payload.published_description = nextRecord.summary || null;
        payload.published_message = serializedMessage;
        payload.published_at = nowIso;
      }

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
        if (!publishLive) {
          const prevPub = isDev ? publishedDevPost : publishedPublicPost;
          payload.published_title = prevPub.title;
          payload.published_description = prevPub.summary || null;
          payload.published_message = serializeReleasePostMessage(prevPub);
          payload.published_at = nowIso;
        }
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

      nextRecord.id = savedId || null;

      const nextWorkingPublic = isDev ? workingPublicPost : nextRecord;
      const nextWorkingDev = isDev ? nextRecord : workingDevPost;
      const nextPublishedPublic =
        !isDev && publishLive ? nextRecord : publishedPublicPost;
      const nextPublishedDev =
        isDev && publishLive ? nextRecord : publishedDevPost;

      if (isDev) {
        setWorkingDevPost(nextRecord);
        if (publishLive) setPublishedDevPost(nextRecord);
      } else {
        setWorkingPublicPost(nextRecord);
        if (publishLive) setPublishedPublicPost(nextRecord);
      }

      if (publishLive) {
        // Also publish the channel's changelog if it has staged changes
        const clCat = isDev
          ? DEV_CHANGELOG_BROADCAST_CATEGORY
          : PUBLIC_CHANGELOG_BROADCAST_CATEGORY;
        const targetCl = isDev ? workingDevChangelog : workingStableChangelog;
        let clId = isDev ? devChangelogRowId : stableChangelogRowId;
        if (clId) {
          await supabaseAuth
            .from("keeper_system_broadcasts")
            .update({
              message: targetCl,
              published_message: targetCl,
              published_at: nowIso,
              updated_at: nowIso,
            })
            .eq("id", clId);
        } else {
          await supabaseAuth
            .from("keeper_system_broadcasts")
            .update({
              message: targetCl,
              published_message: targetCl,
              published_at: nowIso,
              updated_at: nowIso,
            })
            .eq("category", clCat);
        }
        if (isDev) {
          setPublishedDevChangelog(targetCl);
        } else {
          setPublishedStableChangelog(targetCl);
        }
      }

      persistReleaseStateCache({
        workingPublicPost: nextWorkingPublic,
        publishedPublicPost: nextPublishedPublic,
        workingDevPost: nextWorkingDev,
        publishedDevPost: nextPublishedDev,
        workingStableChangelog,
        publishedStableChangelog:
          !isDev && publishLive ? workingStableChangelog : publishedStableChangelog,
        workingDevChangelog,
        publishedDevChangelog:
          isDev && publishLive ? workingDevChangelog : publishedDevChangelog,
      });

      window.dispatchEvent(new CustomEvent("keepers_release_posts_updated"));
      setIsEditorOpen(false);
      useStore
        .getState()
        .pushStatus(
          publishLive
            ? t(
                "dir_toast_published_live",
                "Published live to {Citizens} and synced with local .md file!"
              )
            : t(
                "dir_sync_toast_synced",
                "Directives & Covenants synchronized between Keepers Core & Codebase (.md)!"
              ),
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
    publicPost.platform || t("release_notes_meta_platform_default", "Windows & macOS");
  const devPlatformDisplay =
    devPost.platform || t("release_notes_meta_platform_default", "Windows & macOS");

  // Full Change Logs:
  // - Keepers view (isKeepers=true) displays working (synced .md + DB) changelog
  // - User view (isKeepers=false) displays published changelog ONLY
  const stableGitHubChangelog = isKeepers
    ? workingStableChangelog
    : publishedStableChangelog;
  const devGitHubChangelog = isKeepers
    ? workingDevChangelog
    : publishedDevChangelog;

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
      <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 whitespace-nowrap shrink-0">
        {t("author_sanctuary_team", "Sanctuary Foundry")}
      </span>
      <span className="text-[10px] font-black opacity-30 text-[var(--text)]">&bull;</span>
      <span className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)] truncate">
        {channelBadge}
      </span>
      <span className="text-[10px] font-mono font-bold tracking-widest text-[var(--accent)] hidden">
        v{versionStr}
      </span>
    </div>
  );

  const isDevActive = activeChannel === "dev";
  const activePostRecord = isDevActive ? devPost : publicPost;
  const activeChannelHasUnpublished = isDevActive ? hasUnpublishedDev : hasUnpublishedPublic;
  const activeVersion = isDevActive ? devVersion : stableVersion;
  const activeDateStr = isDevActive ? devDateDisplay : stableDateDisplay;
  const activePlatformStr = isDevActive ? devPlatformDisplay : stablePlatformDisplay;
  const activeChannelBadge = isDevActive
    ? t("release_notes_dev_channel_badge", "Dev Build")
    : t("release_notes_stable_channel_badge", "Stable Release");

  const activeTitle =
    activeView === "changelog"
      ? t("release_notes_github_changelog_title", "Full Change Log")
      : activePostRecord.title;

  const activeChangelogHeading = useMemo(
    () =>
      parseLatestChangelogBlock(
        isDevActive ? devGitHubChangelog : stableGitHubChangelog
      ).heading || seedChangelog.heading,
    [isDevActive, devGitHubChangelog, stableGitHubChangelog, seedChangelog.heading]
  );

  const activeGroupTitle =
    activeView === "changelog"
      ? activeChangelogHeading || t("release_notes_tile_changelog", "Changelog")
      : activeChangelogHeading ||
        activePostRecord.summary ||
        t("release_notes_blog_panel_title", "Community Release Notes");

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
      <div className="grid grid-cols-2 gap-3 w-full">
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
              ? t("release_notes_dev_channel_badge", "Dev Build")
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
      {/* 2-Card Grid: Compact Keepers cards when isKeepers=true, or full Landing cards */}
      {isKeepers ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
          {/* Card 1: Public / Stable Release */}
          <div
            onClick={() => openReleasePanel("stable")}
            className="glass-panel rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,rgba(255,255,255,0.35))] hover:-translate-y-0.5 transition-all duration-300 cursor-pointer flex flex-col justify-between gap-3 group"
          >
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined !text-[18px] text-[var(--accent)] group-hover:scale-110 transition-transform duration-300">
                    {t("icon_verified", "verified")}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {hasUnpublishedPublic && (
                    <span className={VAULT_CHIP_CLASS}>
                      <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                        {t("icon_pending_actions", "pending_actions")}
                      </span>
                      <span>
                        {t("dir_status_staged_sync", "Synced • Unpushed")}
                      </span>
                    </span>
                  )}
                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {t("icon_verified", "verified")}
                    </span>
                    {t("release_notes_meta_channel_public", "Public")} &bull; v{stableVersion}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[8px] font-black uppercase tracking-widest text-[var(--accent)]">
                  {t("release_notes_stable_channel_badge", "Stable Release")}
                </span>
                <h4 className="text-sm font-black text-[var(--text)] group-hover:text-[var(--accent)] transition-colors duration-300 tracking-tight leading-snug line-clamp-1">
                  {publicPost.title}
                </h4>
              </div>
              <p className="text-[11px] font-normal text-[var(--subtext)] opacity-80 leading-relaxed line-clamp-2">
                {publicPost.summary}
              </p>
            </div>
            <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
              <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-65 flex items-center gap-1.5">
                <span className="material-symbols-outlined !text-[12px]">
                  {t("icon_calendar_today", "calendar_today")}
                </span>
                {stableDateDisplay}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                {hasUnpublishedPublic && (
                  <button
                    type="button"
                    onClick={(e) => handlePublishChannel("stable", e)}
                    disabled={isPublishing || isSaving || isSyncing}
                    className="px-2.5 py-1 rounded-lg glass-surface sa-glass-pill-hover border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                      {t("icon_publish", "publish")}
                    </span>
                    <span>{t("btn_publish", "Publish")}</span>
                  </button>
                )}
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] opacity-80 group-hover:opacity-100 group-hover:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                  {t("release_notes_read_notes_cta", "Read Release Notes")}
                  <span className="material-symbols-outlined !text-[14px]">
                    {t("icon_arrow_forward", "arrow_forward")}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Dev Build */}
          <div
            onClick={() => openReleasePanel("dev")}
            className="glass-panel rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,rgba(255,255,255,0.35))] hover:-translate-y-0.5 transition-all duration-300 cursor-pointer flex flex-col justify-between gap-3 group"
          >
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined !text-[18px] text-[var(--success)] group-hover:scale-110 transition-transform duration-300">
                    {t("icon_bolt", "bolt")}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {hasUnpublishedDev && (
                    <span className={VAULT_CHIP_CLASS}>
                      <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                        {t("icon_pending_actions", "pending_actions")}
                      </span>
                      <span>
                        {t("dir_status_staged_sync", "Synced • Unpushed")}
                      </span>
                    </span>
                  )}
                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                      {t("icon_bolt", "bolt")}
                    </span>
                    {t("release_notes_meta_channel_dev", "Dev")} &bull; v{devVersion}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[8px] font-black uppercase tracking-widest text-[var(--success)]">
                  {t("release_notes_dev_channel_badge", "Dev Build")}
                </span>
                <h4 className="text-sm font-black text-[var(--text)] group-hover:text-[var(--accent)] transition-colors duration-300 tracking-tight leading-snug line-clamp-1">
                  {devPost.title}
                </h4>
              </div>
              <p className="text-[11px] font-normal text-[var(--subtext)] opacity-80 leading-relaxed line-clamp-2">
                {devPost.summary}
              </p>
            </div>
            <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
              <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-65 flex items-center gap-1.5">
                <span className="material-symbols-outlined !text-[12px]">
                  {t("icon_calendar_today", "calendar_today")}
                </span>
                {devDateDisplay}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                {hasUnpublishedDev && (
                  <button
                    type="button"
                    onClick={(e) => handlePublishChannel("dev", e)}
                    disabled={isPublishing || isSaving || isSyncing}
                    className="px-2.5 py-1 rounded-lg glass-surface sa-glass-pill-hover border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                      {t("icon_publish", "publish")}
                    </span>
                    <span>{t("btn_publish", "Publish")}</span>
                  </button>
                )}
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] opacity-80 group-hover:opacity-100 group-hover:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                  {t("release_notes_read_dev_cta", "Read Dev Build Notes")}
                  <span className="material-symbols-outlined !text-[14px]">
                    {t("icon_arrow_forward", "arrow_forward")}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          className={`grid grid-cols-1 ${
            canSeeDevBuildCard ? "md:grid-cols-2" : "md:grid-cols-1 max-w-2xl"
          } gap-6 w-full`}
        >
          {/* Card 1: Public / Stable Release */}
          <UniversalCard
            layout="vertical"
            icon={t("icon_new_releases", "new_releases")}
            title={publicPost.title}
            subtitle={buildCommSubtitle(
              t("release_notes_stable_channel_badge", "Stable Release"),
              stableVersion
            )}
            bannerTopLabel={`${t("release_notes_stable_channel_badge", "Stable Release")} • v${stableVersion}`}
            bannerBottomLabel={`${t("author_sanctuary_team", "Sanctuary Foundry")} • ${stablePlatformDisplay}`}
            onClick={() => openReleasePanel("stable")}
            className="w-full h-full"
            imageOverlay={
              <div className="absolute top-3 left-3 flex flex-wrap gap-2 z-30">
                <span className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                  <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                    {t("icon_verified", "verified")}
                  </span>
                  {t("release_notes_meta_channel_public", "Public")} &bull; v{stableVersion}
                </span>
              </div>
            }
            footer={
              <div className="flex items-center justify-between w-full">
                <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-2">
                  <span className="material-symbols-outlined !text-[12px]">
                    {t("icon_calendar_today", "calendar_today")}
                  </span>
                  {stableDateDisplay}
                </span>
                <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
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

          {/* Card 2: Dev Build (Supporters & Authenticated Staff Only) */}
          {canSeeDevBuildCard && (
            <UniversalCard
              layout="vertical"
              icon={t("icon_bolt", "bolt")}
              title={devPost.title}
              subtitle={buildCommSubtitle(
                t("release_notes_dev_channel_badge", "Dev Build"),
                devVersion
              )}
              bannerTopLabel={`${t("release_notes_dev_channel_badge", "Dev Build")} • v${devVersion}`}
              bannerBottomLabel={`${t("author_sanctuary_team", "Sanctuary Foundry")} • ${devPlatformDisplay}`}
              onClick={() => openReleasePanel("dev")}
              className="w-full h-full"
              imageOverlay={
                <div className="absolute top-3 left-3 flex flex-wrap gap-2 z-30">
                  <span className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                    <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                      {t("icon_bolt", "bolt")}
                    </span>
                    {t("release_notes_meta_channel_dev", "Dev")} &bull; v{devVersion}
                  </span>
                </div>
              }
              footer={
                <div className="flex items-center justify-between w-full">
                  <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-2">
                    <span className="material-symbols-outlined !text-[12px]">
                      {t("icon_calendar_today", "calendar_today")}
                    </span>
                    {devDateDisplay}
                  </span>
                  <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
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
          )}
        </div>
      )}

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
        panelClass="!border-l-[color-mix(in_srgb,var(--text)_15%,transparent)]"
        headerActions={
          isKeepers ? (
            <PanelHeaderGroup>
              <PanelHeaderButton
                onClick={() => handlePublishChannel(isDevActive ? "dev" : "stable")}
                disabled={isPublishing || isSaving || isSyncing}
                tooltip={t("dir_btn_publish_live", "Update / Publish to {Citizens}")}
                icon={isPublishing ? t("icon_sync", "sync") : t("icon_publish", "publish")}
                variant={activeChannelHasUnpublished ? "accent" : undefined}
              />
              <PanelHeaderButton
                onClick={() =>
                  openKeepersEditor(
                    isDevActive ? "dev" : "stable",
                    activeView === "changelog" ? "changelog" : "post"
                  )
                }
                tooltip={t("release_notes_edit_post_btn", "Edit Release Post")}
                icon={t("icon_edit", "edit")}
                variant="accent"
              />
              <PanelHeaderButton
                onClick={handleRefreshGitHubChangelog}
                disabled={isSyncing}
                tooltip={t("release_notes_sync_github_btn", "Sync from Repo / GitHub")}
                icon={t("icon_sync", "sync")}
              />
            </PanelHeaderGroup>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-6 pb-12 w-full">
          {/* StatTile Navigation: Top line "View", Bottom line "Post" / "Changelog" / "On GitHub" */}
          <StatTileCarousel innerClassName="px-0">
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_menu_book", "menu_book")}
              label={t("btn_view", "View")}
              number={t("btn_post", "Post")}
              colorClass="text-[var(--accent)]"
              isActive={activeView === "post"}
              onClick={() => setActiveView("post")}
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_terminal", "terminal")}
              label={t("btn_view", "View")}
              number={t("release_notes_tile_changelog", "Changelog")}
              colorClass="text-[var(--accent)]"
              isActive={activeView === "changelog"}
              onClick={() => setActiveView("changelog")}
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_open_in_new", "open_in_new")}
              label={t("btn_view", "View")}
              number={t("release_notes_tile_on_github", "On GitHub")}
              colorClass="text-[var(--text)]"
              isActive={false}
              onClick={() => handleOpenUrl(activeGitHubUrl)}
            />
          </StatTileCarousel>

          <SidePanelHeroCard
            title={activeTitle}
            subtitle={t("release_notes_author_subtitle", "Official Release Dispatch")}
            label={`${activeChannelBadge} v${activeVersion}`}
            icon={isDevActive ? t("icon_bolt", "bolt") : t("icon_forum", "forum")}
            variant="accent"
            badges={[
              ...(isKeepers && activeChannelHasUnpublished
                ? [
                    {
                      icon: t("icon_pending_actions", "pending_actions"),
                      label: t("dir_status_staged_sync", "Synced • Unpushed"),
                      colorClass:
                        "text-[var(--warning)] border-[color-mix(in_srgb,var(--text)_12%,transparent)]",
                    },
                  ]
                : []),
              {
                icon: t("icon_verified", "verified"),
                label: t("author_sanctuary_team", "Sanctuary Foundry"),
                colorClass:
                  "text-[var(--text)] border-[color-mix(in_srgb,var(--text)_12%,transparent)]",
              },
            ]}
          >
            <div className="flex flex-col gap-4 w-full">
              {activeView === "post" && activePostRecord.imageUrl && (
                <div className="w-full h-52 sm:h-64 rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
                  <img
                    src={activePostRecord.imageUrl}
                    alt={activeTitle}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              {renderReleaseInfoPanel(
                activeDateStr,
                activeVersion,
                isDevActive,
                activePlatformStr
              )}
            </div>
          </SidePanelHeroCard>

          <UniversalGroup
            title={activeGroupTitle}
            icon={
              activeView === "changelog"
                ? t("icon_terminal", "terminal")
                : t("icon_menu_book", "menu_book")
            }
          >
            <div className="flex-1 flex flex-col gap-6 min-w-0">
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
          </UniversalGroup>
        </div>
      </SidePanel>

      {/* SidePanel: Reuse the Dispatch / Comm-Link Post Editor for Public & Dev Release Posts & Changelogs */}
      {isKeepers && (
        <>
          <SidePanel
            isOpen={isEditorOpen}
            onClose={() => setIsEditorOpen(false)}
            icon={t("icon_cell_tower", "cell_tower")}
            widthClass="w-[800px]"
            backdropZ="z-[60000]"
            panelZ="z-[60001]"
            title={t("update_transmission", "Update {Dispatch}")}
            subtitle={
              editorChannel === "dev"
                ? `${t("release_notes_dev_post_label", "Dev Channel Post")} • ${
                    editorDocType === "changelog"
                      ? t("release_notes_tile_changelog", "Changelog")
                      : t("btn_post", "Post")
                  }`
                : `${t("release_notes_public_post_label", "Public Channel Post")} • ${
                    editorDocType === "changelog"
                      ? t("release_notes_tile_changelog", "Changelog")
                      : t("btn_post", "Post")
                  }`
            }
            headerActions={
              <PanelHeaderGroup>
                <PanelHeaderButton
                  onClick={() => handleSaveKeepersPost(false)}
                  disabled={
                    isSaving ||
                    !draftBody.trim() ||
                    (editorDocType === "post" && !draftTitle.trim())
                  }
                  tooltip={
                    isSaving
                      ? t("btn_saving", "Saving...")
                      : t("dir_btn_save_sync_staged", "Save & Sync (.md + DB)")
                  }
                  icon={isSaving ? t("icon_sync", "sync") : t("icon_save", "save")}
                />
                <PanelHeaderButton
                  onClick={() => handleSaveKeepersPost(true)}
                  disabled={
                    isSaving ||
                    !draftBody.trim() ||
                    (editorDocType === "post" && !draftTitle.trim())
                  }
                  tooltip={
                    isSaving
                      ? t("btn_saving", "Saving...")
                      : t("dir_btn_publish_live", "Update / Publish to {Citizens}")
                  }
                  icon={isSaving ? t("icon_sync", "sync") : t("icon_publish", "publish")}
                  variant="accent"
                  className={isSaving ? "animate-pulse" : ""}
                />
              </PanelHeaderGroup>
            }
          >
            <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {/* Switch between Public and Dev Release Channel + Post vs Changelog */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full">
                <DashboardStatTile
                  variant="filter"
                  className="!w-full"
                  icon={
                    <span className="material-symbols-outlined">
                      {t("icon_verified", "verified")}
                    </span>
                  }
                  label={t("release_notes_meta_channel_public", "Public")}
                  number={t("btn_post", "Post")}
                  isActive={editorChannel === "stable" && editorDocType === "post"}
                  onClick={() => populateDraftForChannel("stable", "post")}
                />
                <DashboardStatTile
                  variant="filter"
                  className="!w-full"
                  icon={
                    <span className="material-symbols-outlined">
                      {t("icon_terminal", "terminal")}
                    </span>
                  }
                  label={t("release_notes_meta_channel_public", "Public")}
                  number={t("release_notes_tile_changelog", "Changelog")}
                  isActive={editorChannel === "stable" && editorDocType === "changelog"}
                  onClick={() => populateDraftForChannel("stable", "changelog")}
                />
                <DashboardStatTile
                  variant="filter"
                  className="!w-full"
                  icon={
                    <span className="material-symbols-outlined">{t("icon_bolt", "bolt")}</span>
                  }
                  label={t("release_notes_meta_channel_dev", "Dev")}
                  number={t("btn_post", "Post")}
                  isActive={editorChannel === "dev" && editorDocType === "post"}
                  onClick={() => populateDraftForChannel("dev", "post")}
                />
                <DashboardStatTile
                  variant="filter"
                  className="!w-full"
                  icon={
                    <span className="material-symbols-outlined">
                      {t("icon_terminal", "terminal")}
                    </span>
                  }
                  label={t("release_notes_meta_channel_dev", "Dev")}
                  number={t("release_notes_tile_changelog", "Changelog")}
                  isActive={editorChannel === "dev" && editorDocType === "changelog"}
                  onClick={() => populateDraftForChannel("dev", "changelog")}
                />
              </div>

              {editorDocType === "post" && (
                <UniversalGroup
                  title={t("metadata", "Metadata")}
                  icon={t("icon_tune", "tune")}
                >
                  <div className="flex flex-col gap-4 w-full">
                    <div className="flex flex-col gap-1.5 w-full">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-70 uppercase tracking-widest ml-1">
                        {t("post_title", "Post Title")}
                      </label>
                      <input
                        value={draftTitle}
                        onChange={(e) => setDraftTitle(e.target.value)}
                        placeholder={t("post_title", "Title")}
                        className="w-full glass-surface rounded-xl px-4 py-2.5 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5 w-full">
                      <div className="flex justify-between items-center ml-1">
                        <label className="text-[9px] font-black text-[var(--subtext)] opacity-70 uppercase tracking-widest">
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
                        placeholder={t(
                          "post_description_ph",
                          "Short summary shown on the Release Card..."
                        )}
                        className="w-full glass-surface rounded-xl px-4 py-2.5 text-[var(--text)] text-xs font-medium focus:outline-none focus:theme-border-accent transition-all"
                      />
                    </div>

                    {/* Release Info Fields (Release Date / Version Number / Platform) */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 w-full">
                      <div className="flex flex-col gap-1.5 flex-1">
                        <label className="text-[9px] font-black text-[var(--subtext)] opacity-70 uppercase tracking-widest ml-1">
                          {t("release_notes_meta_release_date", "Release Date")}
                        </label>
                        <input
                          value={draftReleaseDate}
                          onChange={(e) => setDraftReleaseDate(e.target.value)}
                          className="w-full glass-surface rounded-xl px-4 py-2.5 text-[var(--text)] text-xs font-bold focus:outline-none focus:theme-border-accent transition-all"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5 flex-1">
                        <label className="text-[9px] font-black text-[var(--subtext)] opacity-70 uppercase tracking-widest ml-1">
                          {t("release_notes_meta_version", "Version Number")}
                        </label>
                        <input
                          value={draftVersion}
                          onChange={(e) => setDraftVersion(e.target.value)}
                          className="w-full glass-surface rounded-xl px-4 py-2.5 text-[var(--accent)] font-mono text-xs font-bold focus:outline-none focus:theme-border-accent transition-all"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5 flex-1">
                        <label className="text-[9px] font-black text-[var(--subtext)] opacity-70 uppercase tracking-widest ml-1">
                          {t("release_notes_meta_platform", "Platform")}
                        </label>
                        <input
                          value={draftPlatform}
                          onChange={(e) => setDraftPlatform(e.target.value)}
                          className="w-full glass-surface rounded-xl px-4 py-2.5 text-[var(--text)] text-xs font-bold focus:outline-none focus:theme-border-accent transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </UniversalGroup>
              )}

              {/* Unified 3-Mode Post Editor (Visual UI / Rich Text / Markdown) */}
              <UnifiedPostBodyEditor
                mode={editorMode}
                onModeChange={setEditorMode}
                content={draftBody}
                onContentChange={setDraftBody}
                editor={editor}
                placeholder={t("post_content", "{Dispatch} Body...")}
              />

              {editorDocType === "post" && (
                <PostAttachmentsManager
                  content={draftBody}
                  onContentChange={setDraftBody}
                  editor={editor}
                  onOpenAssetLinker={() => setIsAssetPanelOpen(true)}
                  imageUrl={draftImageUrl}
                  onImageUrlChange={setDraftImageUrl}
                  showCodeInput={showCodeInput}
                  onToggleCodeInput={setShowCodeInput}
                  codeSnippet={draftCodeSnippet}
                  onCodeSnippetChange={setDraftCodeSnippet}
                  pollData={draftPollData}
                  onPollDataChange={setDraftPollData}
                />
              )}
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
