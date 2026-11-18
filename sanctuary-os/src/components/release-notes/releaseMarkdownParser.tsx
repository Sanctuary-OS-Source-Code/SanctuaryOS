import { DispatchPollData } from "../universal/DispatchPollAndMeta";

export const LEGACY_BLOG_BROADCAST_TITLE = "[KEEPERS_RELEASE_NOTES_BLOG]";
export const PUBLIC_POST_BROADCAST_TITLE = "[KEEPERS_RELEASE_POST_PUBLIC]";
export const DEV_POST_BROADCAST_TITLE = "[KEEPERS_RELEASE_POST_DEV]";
export const PUBLIC_CHANGELOG_BROADCAST_CATEGORY = "ReleaseChangelog_Public";
export const DEV_CHANGELOG_BROADCAST_CATEGORY = "ReleaseChangelog_Dev";

export const GITHUB_RELEASES_WEB_URL =
  "https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases";
export const GITHUB_WEB_DEV_RELEASE_URL =
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

export function stripEmojiPrefix(text: string): string {
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

export function normalizeLatexArrows(text: string): string {
  return (text || "")
    .replace(/\$*\\+rightleftarrows\$*/gi, "⇄")
    .replace(/\$*\\+leftrightarrow\$*/gi, "↔")
    .replace(/\$*\\+rightarrow\$*/gi, "→")
    .replace(/\$*\\+leftarrow\$*/gi, "←");
}

export function cleanHeadingTitle(raw: string): string {
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

export function cleanCardTitle(raw: string): string {
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

export function extractImagesFromLine(raw: string): {
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

export function cleanCardParagraph(raw: string): string {
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
    .replace(/(?!\[ICON:)\[([^\]]+)\]\((?!asset:\/\/)[^)]+\)/gi, "$1")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/^[\s\u200B\uFEFF#\\]+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function extractBulletTitleAndRest(rawLine: string): { title: string; rest: string } | null {
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

export function parseBulletGroupIntoCards(bulletLines: string[]): ParsedReleaseCard[] {
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

