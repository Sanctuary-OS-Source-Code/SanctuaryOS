import type { DirectiveSlug } from "../directivesSync";
import type { RoadmapMilestoneStatus, DirectiveBuilderSubCard, DirectiveBuilderCard, DirectiveBuilderTab, DirectiveBuilderSchema } from "./types";
import { resolveRoadmapSubCardStatus, CURRENT_DIRECTIVE_SCHEMA_VERSION, defaultT, interpolateDynamicText } from "./types";
import { getDefaultDirectiveBuilderSchema } from "./defaultSchemas";

const BUILDER_COMMENT_PREFIX = "<!-- SANCTUARY_DIRECTIVE_BUILDER_JSON:";
const BUILDER_COMMENT_REGEX =
  /\n*<!-- SANCTUARY_DIRECTIVE_BUILDER_JSON:\s*([\s\S]*?)\s*-->\s*$/;


function computeBodySig(cleanBody: string): number {
  const normalized = (cleanBody || "").replace(/\r\n/g, "\n").trim();
  let hash = normalized.length;
  for (let i = 0; i < normalized.length; i += 7) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function stripDirectiveMarkdownClutter(content: string): string {
  if (!content) return "";
  return content
    .replace(/^[ \t]*!\[[^\]]*\]\(https?:\/\/img\.shields\.io\/[^)]+\)[ \t]*\r?\n?/gm, "")
    .replace(/<img[^>]+src=["']https?:\/\/img\.shields\.io\/[^"']+["'][^>]*>\s*/gi, "")
    .replace(/(\n---\s*\n)?##+\s*Table of Contents[\s\S]*?\n---\s*\n/gi, "\n")
    .replace(/##+\s*Table of Contents[\s\S]*?(?=\n# |\n## (?!Table of Contents))/gi, "")
    .replace(/^[ \t]*>[ \t]*\*\*Official Citizen Guide[^\r\n]*\r?\n[ \t]*>[ \t]*Synced bidirectionally[^\r\n]*\r?\n?/gim, "")
    .replace(/^[ \t]*>[ \t]*\*\*Live Directive Synchronization:\*\*[^\r\n]*\r?\n?/gim, "")
    .replace(/^[ \t]*>?[ \t]*\*\*Document Version:?\*\*:?[^\r\n]*\r?\n?/gim, "")
    .replace(/^[ \t]*>?[ \t]*\*\*Last Updated:?\*\*:?[^\r\n]*\r?\n?/gim, "")
    .replace(/^[ \t]*>?[ \t]*\*\*Sync Pipeline:?\*\*:?[^\r\n]*\r?\n?/gim, "")
    .replace(/^[ \t]*\*\*Version:\*\*[^\r\n]*\|\s*\*\*Last Updated:\*\*[^\r\n]*\r?\n?/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function stripDirectiveBuilderComment(content: string): string {
  if (!content) return "";
  return stripDirectiveMarkdownClutter(
    content.replace(BUILDER_COMMENT_REGEX, "").trim()
  );
}

/**
 * Extracts `- **Title:** Description` bullets from a Markdown section, supporting both
 * single-line bullets and parent `- **Title:**` bullets followed by indented `  - Sub-bullet` lines.
 */
function extractMarkdownSubCards(
  sectionBody: string,
  idPrefix: string,
  fallbackSubs: DirectiveBuilderSubCard[] | undefined,
  t: (key: string, fallback: string) => string
): DirectiveBuilderSubCard[] {
  const lines = sectionBody.replace(/\r\n/g, "\n").split("\n");
  const rawItems: {
    title: string;
    inlineDesc: string;
    subLines: string[];
    explicitStatus?: RoadmapMilestoneStatus;
  }[] = [];

  for (const rawLine of lines) {
    const indentMatch = rawLine.match(/^([ \t]*)(.*)$/);
    const indent = (indentMatch?.[1] || "").replace(/\t/g, "  ").length;
    const trimmed = (indentMatch?.[2] || "").trim();
    if (!trimmed || trimmed === "---") continue;

    if (indent <= 1) {
      const topMatch = trimmed.match(/^[-*]\s+\*\*([^*]+?):?\*\*:?\s*(.*)$/);
      if (topMatch) {
        const rawHeading = topMatch[1].trim();
        const rawRest = topMatch[2].trim();
        const combinedMeta = `${rawHeading} ${rawRest}`;
        let explicitStatus: RoadmapMilestoneStatus | undefined = undefined;
        if (/\bplanned\b/i.test(combinedMeta)) {
          explicitStatus = "planned";
        } else if (
          /in\s+testing|in\s+dev\s+build/i.test(combinedMeta) ||
          combinedMeta.includes("\u{1F9EA}")
        ) {
          explicitStatus = "in_testing";
        } else if (
          /\b(?:in\s+progress)\b/i.test(combinedMeta) ||
          combinedMeta.includes("\u23F3")
        ) {
          explicitStatus = "in_progress";
        } else if (
          /\b(?:completed|complete\s*\(in\s+stable\s+build\)|in\s+stable\s+build)\b/i.test(
            combinedMeta
          ) ||
          combinedMeta.includes("\u2705")
        ) {
          explicitStatus = "completed";
        }
        const cleanTitle = rawHeading
          .replace(
            /^\[(?:Planned|In Progress|In Testing(?:\s*\[In Dev Build\])?|Complete|Completed)[^\]]*\]\s*/i,
            ""
          )
          .replace(
            /\s*(?:\((?:Planned|Completed|Complete|In Progress|In Testing[^)]*)\)|\[(?:Planned|In Progress|In Testing[^\]]*|Complete[^\]]*)\])+/gi,
            ""
          )
          .replace(/:\s*$/, "")
          .trim();
        const cleanInline = rawRest
          .replace(
            /^(?:\((?:Planned|Completed|Complete|In Progress|In Testing[^)]*)\)|\[(?:Planned|In Progress|In Testing[^\]]*|Complete[^\]]*)\]):?\s*/i,
            ""
          )
          .trim();
        rawItems.push({
          title: cleanTitle,
          inlineDesc: cleanInline,
          subLines: [],
          explicitStatus,
        });
        continue;
      }
    }

    if (indent >= 2 && rawItems.length > 0 && /^[-*]\s+/.test(trimmed)) {
      const subText = trimmed
        .replace(/^[-*]\s+/, "")
        .replace(/\*\*([^*]+?)\*\*/g, "$1")
        .trim();
      if (subText) {
        rawItems[rawItems.length - 1].subLines.push(subText);
      }
    }
  }

  const normalizeHeadingKey = (str: string): string =>
    str
      .toLowerCase()
      .replace(/\{[^}]+\}/g, "")
      .replace(/`[^`]+`/g, "")
      .replace(/\([^)]*\)/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  const results: DirectiveBuilderSubCard[] = [];
  const usedFallbackIds = new Set<string>();
  for (const item of rawItems) {
    const cleanItemTitle = item.title.replace(/`([^`]+)`/g, "$1").trim();
    const combinedDesc = [item.inlineDesc, ...item.subLines]
      .filter(Boolean)
      .join(" ")
      .replace(/\*\*([^*]+?)\*\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .trim();
    if (!cleanItemTitle || combinedDesc.length < 8) continue;
    const subIdx = results.length;
    const normItem = normalizeHeadingKey(cleanItemTitle);
    const matchedFb =
      fallbackSubs?.find((cand) => {
        if (usedFallbackIds.has(cand.id)) return false;
        const normCand = normalizeHeadingKey(cand.title);
        if (!normCand || !normItem) return false;
        if (normCand === normItem) return true;
        const itemWords = normItem.split(" ").filter((w) => w.length > 3);
        const candWords = normCand.split(" ").filter((w) => w.length > 3);
        if (itemWords.length >= 2 && candWords.length >= 2) {
          return (
            itemWords[0] === candWords[0] &&
            itemWords.slice(1, 5).some((w) => candWords.slice(1).includes(w))
          );
        }
        return false;
      }) ||
      (fallbackSubs &&
      rawItems.length === fallbackSubs.length &&
      fallbackSubs[subIdx] &&
      !usedFallbackIds.has(fallbackSubs[subIdx].id)
        ? fallbackSubs[subIdx]
        : undefined);

    if (matchedFb) {
      usedFallbackIds.add(matchedFb.id);
    }

    const resolvedStatus: RoadmapMilestoneStatus =
      item.explicitStatus ||
      matchedFb?.roadmapStatus ||
      (matchedFb?.pending ? "in_progress" : "completed");
    const isPending = resolvedStatus === "in_progress";

    results.push({
      id: matchedFb?.id || `${idPrefix}_${subIdx + 1}`,
      icon:
        matchedFb?.icon ||
        (resolvedStatus === "in_testing"
          ? t("icon_science", "science")
          : isPending
            ? t("icon_rocket_launch", "rocket_launch")
            : t("icon_check_circle", "check_circle")),
      title: interpolateDynamicText(t, cleanItemTitle || matchedFb?.title || ""),
      desc: interpolateDynamicText(t, combinedDesc || matchedFb?.desc || ""),
      pending: isPending,
      roadmapStatus: resolvedStatus,
    });
  }

  return results;
}

function extractSectionIntroParagraph(sectionBody: string, fallbackDesc: string): string {
  const lines = sectionBody.replace(/\r\n/g, "\n").split("\n");
  const introLines: string[] = [];
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed === "---") {
      if (introLines.length > 0) break;
      continue;
    }
    if (
      trimmed.startsWith("#") ||
      trimmed.startsWith("- ") ||
      trimmed.startsWith("* ") ||
      trimmed.startsWith("1. ") ||
      trimmed.startsWith("```") ||
      /^\*\*(?:Status|Date Range|Start Date|Target Launch|Focus):?\*\*/i.test(trimmed)
    ) {
      if (introLines.length > 0) break;
      continue;
    }
    const cleanedLine = trimmed
      .replace(/^\*[^*]+•[^*]+\*\s*/, "")
      .replace(/\*\*([^*]+?)\*\*/g, "$1")
      .trim();
    if (cleanedLine) {
      introLines.push(cleanedLine);
    }
  }
  return introLines.join(" ").trim() || fallbackDesc;
}

/**
 * Dynamically parses raw Markdown headings (`#`, `##`, `###`) and bullet points (`- **Title:** Desc`)
 * so that editing a `.md` file in the codebase or updating markdown in the cloud database
 * automatically updates the directive's cards, tabs, and subCards even if the JSON comment wasn't manually rebuilt.
 */
export function parseMarkdownToDirectiveSchema(
  rawContent: string,
  slug: DirectiveSlug,
  t: (key: string, fallback: string) => string = defaultT
): DirectiveBuilderSchema {
  const baseSchema = getDefaultDirectiveBuilderSchema(slug, t);
  const clean = stripDirectiveBuilderComment(rawContent);
  if (!clean) return baseSchema;

  const lines = clean.replace(/\r\n/g, "\n").split("\n");
  let docTitle = baseSchema.title;
  let docSummary = baseSchema.summary;

  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    const line = lines[i].trim();
    if (line.startsWith("# ") && !/^#\s+Part\s+\d+/i.test(line)) {
      const extractedTitle = line
        .replace(/^#\s+/, "")
        .replace(/^Sanctuary OS\s*[—–:-]\s*/i, "")
        .trim();
      if (extractedTitle) docTitle = extractedTitle;
    } else if (line.startsWith("> ") && !line.toLowerCase().includes("version:")) {
      const extractedQuote = line.replace(/^>\s+/, "").replace(/\*\*/g, "").trim();
      if (extractedQuote.length > 25) {
        docSummary = extractedQuote;
        break;
      }
    } else if (
      line.length > 35 &&
      !line.startsWith("#") &&
      !line.startsWith("-") &&
      !line.startsWith("*") &&
      !line.startsWith("!") &&
      !line.toLowerCase().startsWith("document version:") &&
      !line.toLowerCase().startsWith("last updated:")
    ) {
      docSummary = line.replace(/\*\*/g, "").trim();
      break;
    }
  }

  // 1. Check if markdown was compiled by compileDirectiveSchemaToMarkdown (`## LABEL — VALUE` & `### OVERLINE: TITLE`)
  const compiledTabMatches =
    slug === "phase_roadmap"
      ? []
      : [...clean.matchAll(/^##\s+([^—\n]+?)\s+—\s+([^\n]+)$/gm)].filter(
          (m) =>
            !/^##\s+(?:Phase|Stage|Pillar|Domain|Part)\s+\d+/i.test(m[0]) &&
            (!m[1].includes("(") || m[1].includes(")"))
        );
  if (compiledTabMatches.length > 0 && compiledTabMatches.length >= baseSchema.tabs.length) {
    const parsedTabs: DirectiveBuilderTab[] = [];
    let allTabsHaveCompiledCards = true;
    for (let tIdx = 0; tIdx < compiledTabMatches.length; tIdx++) {
      const match = compiledTabMatches[tIdx];
      const label = match[1].trim();
      const value = match[2].trim();
      const startPos = (match.index || 0) + match[0].length;
      const endPos =
        tIdx + 1 < compiledTabMatches.length
          ? compiledTabMatches[tIdx + 1].index || clean.length
          : clean.length;
      const tabBody = clean.slice(startPos, endPos);
      const fallbackTab = baseSchema.tabs[tIdx] || baseSchema.tabs[0];

      const cardMatches = [...tabBody.matchAll(/^###\s+([^\n]+)$/gm)];
      if (cardMatches.length === 0) {
        allTabsHaveCompiledCards = false;
        break;
      }
      const cards: DirectiveBuilderCard[] = cardMatches.map((cm, cIdx) => {
        const rawHeading = cm[1].trim();
        const cStart = (cm.index || 0) + cm[0].length;
        const cEnd =
          cIdx + 1 < cardMatches.length
            ? cardMatches[cIdx + 1].index || tabBody.length
            : tabBody.length;
        const cardBody = tabBody.slice(cStart, cEnd).trim();
        const fallbackCard = fallbackTab?.cards?.[cIdx];

        let overline = fallbackCard?.overline || `ITEM ${cIdx + 1}`;
        let title = rawHeading;
        const colonIdx = rawHeading.indexOf(":");
        if (colonIdx > 0 && colonIdx < 48) {
          overline = rawHeading.slice(0, colonIdx).trim();
          title = rawHeading.slice(colonIdx + 1).trim();
        }

        const cLines = cardBody.split("\n");
        let badge = fallbackCard?.badge || "";
        let footerMeta = fallbackCard?.footerMeta || "";
        let parsedMetaLine = false;
        const descLines: string[] = [];
        let tip: string | undefined = fallbackCard?.tip;

        for (const cl of cLines) {
          const trimmed = cl.trim();
          if (!trimmed || trimmed === "---") continue;
          const leadingMetaMatch = trimmed.match(/^\*([^*]+?)\*(?:\s+(.*))?$/);
          if (leadingMetaMatch && !parsedMetaLine) {
            parsedMetaLine = true;
            const metaParts = leadingMetaMatch[1].split("•").map((s) => s.trim());
            badge = metaParts[0] || badge;
            footerMeta = metaParts.slice(1).join(" • ") || footerMeta;
            if (leadingMetaMatch[2]?.trim()) {
              descLines.push(leadingMetaMatch[2].trim());
            }
          } else if (trimmed.startsWith("- **") || trimmed.startsWith("* **") || /^\s+[-*]\s+/.test(cl)) {
            continue;
          } else if (/^>\s*\*\*Tip:?\*\*/i.test(trimmed)) {
            tip = trimmed.replace(/^>\s*\*\*Tip:?\*\*:?\s*/i, "").trim();
          } else if (!trimmed.startsWith("```")) {
            descLines.push(trimmed.replace(/^\*[^*]+•[^*]+\*\s*/, "").trim());
          }
        }

        const subCards = extractMarkdownSubCards(
          cardBody,
          `sub_${tIdx}_${cIdx}`,
          fallbackCard?.subCards,
          t
        );

        const cleanedDesc = (descLines.join(" ").trim() || fallbackCard?.desc || "")
          .replace(/^\*[^*]+•[^*]+\*\s*/, "")
          .trim();

        return {
          id: fallbackCard?.id || `card_${tIdx}_${cIdx + 1}`,
          icon: fallbackCard?.icon || t("icon_layers", "layers"),
          overline,
          badge: badge || overline,
          title,
          footerMeta: footerMeta || badge,
          desc: cleanedDesc,
          tip,
          status: fallbackCard?.status,
          subCards: subCards.length > 0 ? subCards : fallbackCard?.subCards || [],
        };
      });

      parsedTabs.push({
        id: fallbackTab?.id || `tab_${tIdx + 1}`,
        icon: fallbackTab?.icon || t("icon_folder_special", "folder_special"),
        label,
        value,
        cards,
      });
    }

    if (
      allTabsHaveCompiledCards &&
      parsedTabs.length > 0 &&
      parsedTabs.every((tb) => tb.cards.length > 0 && tb.cards.every((c) => Boolean(c.desc)))
    ) {
      return {
        ...baseSchema,
        title: docTitle,
        summary: docSummary,
        _schemaVersion: CURRENT_DIRECTIVE_SCHEMA_VERSION,
        _bodySig: computeBodySig(clean),
        tabs: parsedTabs,
      };
    }
  }

  // 2. Native `.md` Section & Bullet Overlay Parser:
  // Syncs headings (`## Phase N`, `## Stage N`, `## Pillar N`, etc.) and `- **Title:** Desc` bullets
  // directly from the repository `.md` files or Hub DB markdown into `baseSchema.tabs`.
  if (slug === "phase_roadmap") {
    const rawPhaseMatches = [...clean.matchAll(/^##\s+(Phase\s+(\d+)[^\n]*)$/gim)];
    const seenNums = new Set<number>();
    const phaseMatches = rawPhaseMatches.filter((pm) => {
      const n = parseInt(pm[2], 10);
      if (seenNums.has(n)) return false;
      seenNums.add(n);
      return true;
    });
    if (phaseMatches.length > 0 && baseSchema.tabs[0]) {
      const defaultCards = baseSchema.tabs[0].cards;
      const updatedCards: DirectiveBuilderCard[] = phaseMatches.map((pm, idx) => {
        const fullHeading = pm[1].trim();
        const phaseNum = parseInt(pm[2], 10);
        const startPos = (pm.index || 0) + pm[0].length;
        const endPos =
          idx + 1 < phaseMatches.length
            ? phaseMatches[idx + 1].index || clean.length
            : clean.length;
        const sectionBody = clean.slice(startPos, endPos).trim();

        const fallback = defaultCards.find((c: any) => {
          if (c.id === `phase_${phaseNum}`) return true;
          const m = (c.overline || c.title || "").match(/\bPhase\s+(\d+)\b/i);
          return m && parseInt(m[1], 10) === phaseNum;
        });

        let title = fallback?.title || fullHeading;
        const colonIdx = fullHeading.indexOf(":");
        if (colonIdx > 0) {
          const parsedHeadingTitle = fullHeading
            .slice(colonIdx + 1)
            .replace(/\s*\([^)]*(?:2026|2025|Active|Progress|Completed|V0\.|V5\.)[^)]*\)\s*$/i, "")
            .trim();
          if (parsedHeadingTitle) {
            title = fallback?.title || interpolateDynamicText(t, parsedHeadingTitle);
          }
        }

        let focusText = fallback?.footerMeta || "";
        const focusMatch = sectionBody.match(/\*\*Focus:\*\*\s*`?([^`\n|]+)`?/i);
        if (focusMatch && focusMatch[1]) {
          focusText = fallback?.footerMeta || interpolateDynamicText(t, focusMatch[1].trim());
        }

        const statusLineMatch = sectionBody.match(
          /\*\*Status:\*\*\s*`?([^`\n|]+)`?/i
        );
        const rawStatusText = (statusLineMatch?.[1] || "").trim();
        let resolvedCardStatus: "planned" | "active" | "in_testing" | "completed" =
          idx === 0 ? "active" : "completed";
        if (/\bplanned\b/i.test(rawStatusText)) {
          resolvedCardStatus = "planned";
        } else if (/in\s+testing|in\s+dev\s+build/i.test(rawStatusText)) {
          resolvedCardStatus = "in_testing";
        } else if (/active|in\s+progress/i.test(rawStatusText)) {
          resolvedCardStatus = "active";
        } else if (/complete/i.test(rawStatusText)) {
          resolvedCardStatus = "completed";
        }
        const isActiveStatus =
          resolvedCardStatus === "active" || resolvedCardStatus === "in_testing";

        const dateMatch = sectionBody.match(
          /\*\*(?:Date Range|Start Date|Target Launch):\*\*\s*([^\n|]+)/i
        );
        const versionMatch = fullHeading.match(/\((V[0-9.]+[^)]*)\)/i);
        const computedOverline =
          fallback?.overline ||
          `Phase ${phaseNum}${versionMatch ? ` (${versionMatch[1]})` : ""}${
            dateMatch ? ` • ${dateMatch[1].trim()}` : ""
          }${isActiveStatus ? " — Active Era" : ""}`;

        const extractedSubs = extractMarkdownSubCards(
          sectionBody,
          `p${phaseNum}_m`,
          fallback?.subCards,
          t
        );

        const resolvedSubCards =
          phaseNum <= 12 && fallback?.subCards && fallback.subCards.length > 0
            ? fallback.subCards
            : extractedSubs.length > 0
              ? extractedSubs
              : fallback?.subCards || [];

        const resolvedBadge =
          resolvedCardStatus === "planned"
            ? "Planned"
            : resolvedCardStatus === "in_testing"
              ? "In Testing [In Dev Build]"
              : resolvedCardStatus === "active"
                ? "In Progress"
                : "Completed";

        return {
          id: fallback?.id || `phase_${phaseNum}`,
          icon:
            fallback?.icon ||
            (resolvedCardStatus === "planned"
              ? t("icon_upcoming", "upcoming")
              : resolvedCardStatus === "in_testing"
                ? t("icon_science", "science")
                : isActiveStatus
                  ? t("icon_auto_awesome", "auto_awesome")
                  : t("icon_rocket_launch", "rocket_launch")),
          overline: computedOverline,
          badge: resolvedBadge,
          title,
          footerMeta: focusText || fallback?.footerMeta || "",
          desc: fallback?.desc || focusText || title,
          status: resolvedCardStatus,
          subCards: resolvedSubCards,
        };
      });

      const maxPhase = updatedCards.reduce((acc, c) => {
        const m = c.id.match(/^phase_(\d+)$/);
        return m ? Math.max(acc, parseInt(m[1], 10)) : acc;
      }, updatedCards.length);

      return {
        ...baseSchema,
        title:
          docTitle.includes("Phase ")
            ? docTitle
            : `Engineering Phase Roadmap (Phase ${maxPhase} → Phase 1)`,
        summary: docSummary,
        _schemaVersion: CURRENT_DIRECTIVE_SCHEMA_VERSION,
        _bodySig: computeBodySig(clean),
        tabs: [
          {
            ...baseSchema.tabs[0],
            label: `${updatedCards.length} Phases`,
            cards: updatedCards,
          },
        ],
      };
    }
  }

  if (slug === "citizen_guide") {
    const nextTabs = [...baseSchema.tabs];

    // Tab 0: Stage 1..N under `# Part 1`
    const stageMatches = [...clean.matchAll(/^#{1,3}\s+Stage\s+(\d+):\s*([^\n]+)$/gim)];
    if (stageMatches.length > 0 && nextTabs[0]) {
      const defaultStageCards = nextTabs[0].cards;
      const stageCards: DirectiveBuilderCard[] = stageMatches.map((sm, idx) => {
        const stageNum = parseInt(sm[1], 10);
        const stageTitle = sm[2].replace(/`([^`]+)`/g, "$1").trim();
        const startPos = (sm.index || 0) + sm[0].length;
        const endPos =
          idx + 1 < stageMatches.length
            ? stageMatches[idx + 1].index || clean.length
            : clean.indexOf("# Part 2") > startPos
              ? clean.indexOf("# Part 2")
              : clean.length;
        const sectionBody = clean.slice(startPos, endPos).trim();
        const fb =
          defaultStageCards.find((c: any) => c.id === `walk_${stageNum}`) ||
          defaultStageCards[idx];
        const subs = extractMarkdownSubCards(
          sectionBody,
          `walk_${stageNum}_c`,
          fb?.subCards,
          t
        );
        const introDesc = extractSectionIntroParagraph(
          sectionBody,
          fb?.desc || stageTitle
        ).replace(/:$/, ".");

        return {
          id: fb?.id || `walk_${stageNum}`,
          icon: fb?.icon || t("icon_play_circle", "play_circle"),
          overline: `STAGE ${stageNum} OF ${stageMatches.length}`,
          badge: fb?.badge || `${stageNum}. Stage ${stageNum}`,
          title: stageTitle || fb?.title || `Stage ${stageNum}`,
          footerMeta: fb?.footerMeta || stageTitle,
          desc: introDesc || fb?.desc || stageTitle,
          subCards: subs.length > 0 ? subs : fb?.subCards || [],
        };
      });
      nextTabs[0] = {
        ...nextTabs[0],
        label: `${stageCards.length} STAGES`,
        cards: stageCards,
      };
    }

    // Tab 1: Numbered modules `1. **Module:** Desc` under `# Part 2`
    const part2Idx = clean.search(/^#{1,3}\s+Part\s+2:/im);
    const part3Idx = clean.search(/^#{1,3}\s+Part\s+3:/im);
    if (part2Idx >= 0 && nextTabs[1]) {
      const part2Body = clean.slice(
        part2Idx,
        part3Idx > part2Idx ? part3Idx : clean.length
      );
      const modMatches = [
        ...part2Body.matchAll(/^(\d+)\.\s+\*\*([^*]+?):?\*\*:?\s*(.+)$/gm),
      ];
      if (modMatches.length > 0) {
        const defaultModCards = nextTabs[1].cards;
        const modCards: DirectiveBuilderCard[] = modMatches.map((mm, idx) => {
          const modNum = parseInt(mm[1], 10);
          const rawModTitle = mm[2].replace(/`([^`]+)`/g, "$1").trim();
          const rawModDesc = mm[3].replace(/`([^`]+)`/g, "$1").trim();
          const fb =
            defaultModCards.find((c: any) => c.id === `mod_${modNum}`) ||
            defaultModCards[idx];
          return {
            id: fb?.id || `mod_${modNum}`,
            icon: fb?.icon || t("icon_explore", "explore"),
            overline: `MODULE ${modNum} OF ${modMatches.length}`,
            badge: fb?.badge || `${modNum}. ${rawModTitle}`,
            title: rawModTitle || fb?.title || `Module ${modNum}`,
            footerMeta: fb?.footerMeta || rawModTitle.toUpperCase(),
            desc: rawModDesc || fb?.desc || rawModTitle,
            tip: fb?.tip,
            subCards: fb?.subCards || [],
          };
        });
        nextTabs[1] = {
          ...nextTabs[1],
          label: `${modCards.length} MODULES`,
          cards: modCards,
        };
      }
    }

    return {
      ...baseSchema,
      title: docTitle,
      summary: docSummary,
      _schemaVersion: CURRENT_DIRECTIVE_SCHEMA_VERSION,
      _bodySig: computeBodySig(clean),
      tabs: nextTabs,
    };
  }

  if (slug === "master_architecture") {
    const pillarMatches = [...clean.matchAll(/^#{1,3}\s+Pillar\s+(\d+):\s*([^\n]+)$/gim)];
    if (pillarMatches.length > 0) {
      const updatedTabs: DirectiveBuilderTab[] = pillarMatches.map((pm, idx) => {
        const pillarNum = parseInt(pm[1], 10);
        const pillarTitle = pm[2].replace(/`([^`]+)`/g, "$1").trim();
        const startPos = (pm.index || 0) + pm[0].length;
        const endPos =
          idx + 1 < pillarMatches.length
            ? pillarMatches[idx + 1].index || clean.length
            : clean.length;
        const sectionBody = clean.slice(startPos, endPos).trim();
        const fbTab = baseSchema.tabs[idx] || baseSchema.tabs[0];
        const fbCard = fbTab?.cards?.[0];
        const subs = extractMarkdownSubCards(
          sectionBody,
          `arch_p${pillarNum}_c`,
          fbCard?.subCards,
          t
        );
        const introDesc = extractSectionIntroParagraph(
          sectionBody,
          fbCard?.desc || pillarTitle
        ).replace(/:$/, ".");

        return {
          id: fbTab?.id || `p${pillarNum}`,
          icon: fbTab?.icon || t("icon_memory", "memory"),
          label: `PILLAR ${pillarNum}`,
          value: fbTab?.value || `Pillar ${pillarNum}`,
          cards: [
            {
              id: fbCard?.id || `arch_p${pillarNum}`,
              icon: fbCard?.icon || t("icon_memory", "memory"),
              overline:
                fbCard?.overline ||
                `ARCHITECTURE PILLAR ${pillarNum} • SANCTUARY OS`,
              badge: fbCard?.badge || t("active", "Active"),
              title: pillarTitle || fbCard?.title || `Pillar ${pillarNum}`,
              footerMeta: fbCard?.footerMeta || pillarTitle,
              desc: introDesc || fbCard?.desc || pillarTitle,
              subCards: subs.length > 0 ? subs : fbCard?.subCards || [],
            },
          ],
        };
      });

      return {
        ...baseSchema,
        title: docTitle,
        summary: docSummary,
        _schemaVersion: CURRENT_DIRECTIVE_SCHEMA_VERSION,
        _bodySig: computeBodySig(clean),
        tabs: updatedTabs,
      };
    }
  }

  if (slug === "master_protocols") {
    const nextTabs = [...baseSchema.tabs];
    const domainMatches = [
      ...clean.matchAll(/^#{1,3}\s+([2-5])\.\s+([^\n]+)$/gm),
    ];
    if (domainMatches.length > 0 && nextTabs[2]) {
      const defaultDomainCards = nextTabs[2].cards;
      let totalProtocols = 0;
      const domainCards: DirectiveBuilderCard[] = domainMatches.map((dm, idx) => {
        const secNum = parseInt(dm[1], 10);
        const domainNum = secNum - 1;
        const domainTitle = dm[2].replace(/`([^`]+)`/g, "$1").trim();
        const startPos = (dm.index || 0) + dm[0].length;
        const endPos =
          idx + 1 < domainMatches.length
            ? domainMatches[idx + 1].index || clean.length
            : clean.length;
        const sectionBody = clean.slice(startPos, endPos).trim();
        const fb =
          defaultDomainCards.find((c: any) => c.id === `proto_d${domainNum}`) ||
          defaultDomainCards[idx];
        const subs = extractMarkdownSubCards(
          sectionBody,
          `proto_d${domainNum}_r`,
          fb?.subCards,
          t
        );
        const finalSubs = subs.length > 0 ? subs : fb?.subCards || [];
        totalProtocols += finalSubs.length;

        return {
          id: fb?.id || `proto_d${domainNum}`,
          icon: fb?.icon || t("icon_policy", "policy"),
          overline: `DOMAIN ${domainNum} • ${finalSubs.length} PROTOCOLS`,
          badge: `DOMAIN ${domainNum}`,
          title: domainTitle || fb?.title || `Domain ${domainNum}`,
          footerMeta: `DOMAIN ${domainNum} • ${finalSubs.length} PROTOCOLS`,
          desc:
            fb?.desc ||
            `${domainTitle} (${finalSubs.length} operational protocols).`,
          subCards: finalSubs,
        };
      });

      nextTabs[2] = {
        ...nextTabs[2],
        label: `${totalProtocols || 37} RULES`,
        cards: domainCards,
      };
    }

    return {
      ...baseSchema,
      title: docTitle,
      summary: docSummary,
      _schemaVersion: CURRENT_DIRECTIVE_SCHEMA_VERSION,
      _bodySig: computeBodySig(clean),
      tabs: nextTabs,
    };
  }

  return {
    ...baseSchema,
    title: docTitle,
    summary: docSummary,
    _schemaVersion: CURRENT_DIRECTIVE_SCHEMA_VERSION,
    _bodySig: computeBodySig(clean),
  };
}

export function extractDirectiveBuilderSchema(
  content?: string | null,
  slug?: DirectiveSlug,
  t: (key: string, fallback: string) => string = defaultT
): DirectiveBuilderSchema | null {
  if (!content) {
    return slug ? getDefaultDirectiveBuilderSchema(slug, t) : null;
  }

  const cleanBody = stripDirectiveBuilderComment(content);
  const currentBodySig = computeBodySig(cleanBody);
  const match = content.match(BUILDER_COMMENT_REGEX);

  if (match && match[1]) {
    try {
      const rawJsonStr = match[1];
      if (!rawJsonStr.includes("[sd_") && !rawJsonStr.includes("[dir_")) {
        const parsed = JSON.parse(rawJsonStr) as DirectiveBuilderSchema;
        if (parsed && Array.isArray(parsed.tabs)) {
          const effectiveSlug = (slug || parsed.slug || "citizen_guide") as DirectiveSlug;
          if ((parsed._schemaVersion || 0) < CURRENT_DIRECTIVE_SCHEMA_VERSION) {
            return parseMarkdownToDirectiveSchema(content, effectiveSlug, t);
          }
          if (parsed._bodySig && parsed._bodySig !== currentBodySig) {
            return parseMarkdownToDirectiveSchema(content, effectiveSlug, t);
          }
          if (
            effectiveSlug === "phase_roadmap" &&
            (parsed.tabs.length !== 1 ||
              !parsed.tabs[0]?.cards?.some(
                (c) =>
                  (c.subCards?.length || 0) >= 19 &&
                  c.subCards?.some((sc) =>
                    (sc.title || "").includes("Zero-Copy Exodus")
                  )
              ))
          ) {
            return parseMarkdownToDirectiveSchema(content, effectiveSlug, t);
          }
          // Sanitize any leftover italic meta prefix on card descriptions
          parsed.tabs = parsed.tabs.map((tb) => ({
            ...tb,
            cards: (tb.cards || []).map((c: any) => ({
              ...c,
              desc: (c.desc || "").replace(/^\*[^*]+•[^*]+\*\s*/, "").trim(),
            })),
          }));
          return parsed;
        }
      }
    } catch {
      // Fall through to dynamic markdown parser
    }
  }

  if (slug) {
    return parseMarkdownToDirectiveSchema(content, slug, t);
  }
  return null;
}

export function embedDirectiveBuilderSchema(
  cleanMarkdown: string,
  schema: DirectiveBuilderSchema | null
): string {
  const base = stripDirectiveBuilderComment(cleanMarkdown);
  if (!schema) return base;
  const enrichedSchema: DirectiveBuilderSchema = {
    ...schema,
    _schemaVersion: CURRENT_DIRECTIVE_SCHEMA_VERSION,
    _bodySig: computeBodySig(base),
  };
  return `${base}\n\n${BUILDER_COMMENT_PREFIX}\n${JSON.stringify(enrichedSchema, null, 2)}\n-->\n`;
}

export function compileDirectiveSchemaToMarkdown(
  schema: DirectiveBuilderSchema
): string {
  const lines: string[] = [];
  lines.push(`# ${schema.title}`);
  if (schema.summary) {
    lines.push("");
    lines.push(`> ${schema.summary}`);
  }
  lines.push("");

  for (const tab of schema.tabs) {
    lines.push("---");
    lines.push("");
    if (schema.slug !== "phase_roadmap") {
      lines.push(`## ${tab.label} — ${tab.value}`);
      lines.push("");
    }

    for (const card of tab.cards) {
      const headingPrefix = schema.slug === "phase_roadmap" ? "##" : "###";
      lines.push(`${headingPrefix} ${card.overline ? `${card.overline}: ` : ""}${card.title}`);
      if (card.badge || card.footerMeta) {
        if (schema.slug === "phase_roadmap") {
          lines.push(
            `**Status:** \`${card.badge || "COMPLETED"}\`${
              card.footerMeta ? ` | **Focus:** \`${card.footerMeta}\`` : ""
            }`
          );
        } else {
          const metaParts = [card.badge, card.footerMeta].filter(Boolean);
          if (metaParts.length > 0) {
            lines.push(`*${metaParts.join(" • ")}*`);
          }
        }
      }
      if (card.desc) {
        lines.push("");
        lines.push(card.desc);
      }
      if (card.subCards && card.subCards.length > 0) {
        lines.push("");
        for (const sub of card.subCards) {
          if (schema.slug === "phase_roadmap") {
            const subStatus = resolveRoadmapSubCardStatus(sub);
            const cleanSubTitle = (sub.title || "")
              .replace(
                /\s*(?:\((?:Planned|Completed|Complete|In Progress|In Testing[^)]*)\)|\[(?:Planned|In Progress|In Testing[^\]]*|Complete[^\]]*)\])+/gi,
                ""
              )
              .trim();
            const statusSuffix =
              subStatus === "planned"
                ? " (Planned)"
                : subStatus === "in_testing"
                  ? " (In Testing [In Dev Build])"
                  : subStatus === "in_progress"
                    ? " (In Progress)"
                    : " (Complete)";
            lines.push(`- **${cleanSubTitle}${statusSuffix}:** ${sub.desc}`);
          } else {
            lines.push(`- **${sub.title}:** ${sub.desc}`);
          }
        }
      }
      if (card.tip) {
        lines.push("");
        lines.push(`> **Tip:** ${card.tip}`);
      }
      if (card.codeSnippet) {
        lines.push("");
        lines.push("```ts");
        lines.push(card.codeSnippet);
        lines.push("```");
      }
      lines.push("");
    }
  }

  return lines.join("\n").trim();
}

