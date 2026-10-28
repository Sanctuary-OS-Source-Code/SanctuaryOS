import { DirectiveSlug } from "./directivesSync";

export interface DirectiveBuilderSubCard {
  id: string;
  icon: string;
  title: string;
  desc: string;
  pending?: boolean;
}

export interface DirectiveBuilderCard {
  id: string;
  icon: string;
  overline: string;
  badge: string;
  title: string;
  footerMeta: string;
  desc: string;
  tip?: string;
  codeSnippet?: string;
  status?: "active" | "completed" | "passkey" | "citizen" | "warning" | "danger" | "info";
  subCards: DirectiveBuilderSubCard[];
}

export interface DirectiveBuilderTab {
  id: string;
  icon: string;
  label: string;
  value: string;
  cards: DirectiveBuilderCard[];
}

export interface DirectiveBuilderSchema {
  slug: DirectiveSlug;
  title: string;
  summary: string;
  isActive?: boolean;
  _schemaVersion?: number;
  _bodySig?: number;
  tabs: DirectiveBuilderTab[];
}

export const CURRENT_DIRECTIVE_SCHEMA_VERSION = 75;

const BUILDER_COMMENT_PREFIX = "<!-- SANCTUARY_DIRECTIVE_BUILDER_JSON:";
const BUILDER_COMMENT_REGEX =
  /\n*<!-- SANCTUARY_DIRECTIVE_BUILDER_JSON:\s*([\s\S]*?)\s*-->\s*$/;

const defaultT = (_key: string, fallback?: string): string => fallback || _key;

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
  t: (key: string, fallback?: string) => string
): DirectiveBuilderSubCard[] {
  const lines = sectionBody.replace(/\r\n/g, "\n").split("\n");
  const rawItems: { title: string; inlineDesc: string; subLines: string[]; isPending: boolean }[] = [];

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
        const isPending =
          /\(In Progress\)/i.test(rawHeading) ||
          /\(In Progress\)/i.test(rawRest) ||
          rawHeading.includes("⏳") ||
          rawRest.includes("⏳");
        const cleanTitle = rawHeading
          .replace(/\s*\((?:Completed|In Progress)[^)]*\)/gi, "")
          .replace(/:\s*$/, "")
          .trim();
        const cleanInline = rawRest
          .replace(/^\((?:Completed|In Progress)[^)]*\):?\s*/i, "")
          .trim();
        rawItems.push({
          title: cleanTitle,
          inlineDesc: cleanInline,
          subLines: [],
          isPending,
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
        const normCand = normalizeHeadingKey(cand.title);
        if (!normCand || !normItem) return false;
        if (normCand === normItem) return true;
        const itemWords = normItem.split(" ").filter((w) => w.length > 3);
        const candWords = normCand.split(" ").filter((w) => w.length > 3);
        if (itemWords.length >= 2 && candWords.length >= 2) {
          return (
            itemWords[0] === candWords[0] &&
            itemWords.slice(0, 3).some((w) => candWords.includes(w))
          );
        }
        return false;
      }) ||
      (fallbackSubs && rawItems.length === fallbackSubs.length
        ? fallbackSubs[subIdx]
        : undefined);

    const isPending = item.isPending || matchedFb?.pending || false;
    const preferCuratedFallback = Boolean(
      matchedFb && (item.subLines.length > 0 || combinedDesc.length > 280)
    );

    results.push({
      id: matchedFb?.id || `${idPrefix}_${subIdx + 1}`,
      icon:
        matchedFb?.icon ||
        (isPending
          ? t("icon_rocket_launch", "rocket_launch")
          : t("icon_check_circle", "check_circle")),
      title: preferCuratedFallback
        ? matchedFb!.title
        : t("", cleanItemTitle),
      desc: preferCuratedFallback
        ? matchedFb!.desc
        : t("", combinedDesc),
      pending: isPending,
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
  t: (key: string, fallback?: string) => string = defaultT
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

        const fallback = defaultCards.find((c) => {
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
            title = fallback?.title || t("", parsedHeadingTitle);
          }
        }

        let focusText = fallback?.footerMeta || "";
        const focusMatch = sectionBody.match(/\*\*Focus:\*\*\s*`?([^`\n|]+)`?/i);
        if (focusMatch && focusMatch[1]) {
          focusText = fallback?.footerMeta || t("", focusMatch[1].trim());
        }

        const isActiveStatus = idx === 0;

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

        return {
          id: fallback?.id || `phase_${phaseNum}`,
          icon:
            fallback?.icon ||
            (isActiveStatus
              ? t("icon_auto_awesome", "auto_awesome")
              : t("icon_rocket_launch", "rocket_launch")),
          overline: computedOverline,
          badge: isActiveStatus ? "Active Phase" : "Completed",
          title,
          footerMeta: focusText || fallback?.footerMeta || "",
          desc: fallback?.desc || focusText || title,
          status: isActiveStatus ? "active" : "completed",
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
    const stageMatches = [...clean.matchAll(/^##\s+Stage\s+(\d+):\s*([^\n]+)$/gim)];
    if (stageMatches.length > 0 && nextTabs[0]) {
      const defaultStageCards = nextTabs[0].cards;
      const stageCards: DirectiveBuilderCard[] = stageMatches.map((sm, idx) => {
        const stageNum = parseInt(sm[1], 10);
        const stageTitle = sm[2].trim();
        const startPos = (sm.index || 0) + sm[0].length;
        const endPos =
          idx + 1 < stageMatches.length
            ? stageMatches[idx + 1].index || clean.length
            : clean.indexOf("# Part 2") > startPos
              ? clean.indexOf("# Part 2")
              : clean.length;
        const sectionBody = clean.slice(startPos, endPos).trim();
        const fb =
          defaultStageCards.find((c) => c.id === `walk_${stageNum}`) ||
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
          title: fb?.title || stageTitle,
          footerMeta: fb?.footerMeta || stageTitle,
          desc: fb?.desc || introDesc,
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
    const part2Idx = clean.search(/^#\s+Part\s+2:/im);
    const part3Idx = clean.search(/^#\s+Part\s+3:/im);
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
          const rawModTitle = mm[2].trim();
          const rawModDesc = mm[3].trim();
          const fb =
            defaultModCards.find((c) => c.id === `mod_${modNum}`) ||
            defaultModCards[idx];
          return {
            id: fb?.id || `mod_${modNum}`,
            icon: fb?.icon || t("icon_explore", "explore"),
            overline: `MODULE ${modNum} OF ${modMatches.length}`,
            badge: fb?.badge || `${modNum}. ${rawModTitle}`,
            title: fb?.title || rawModTitle,
            footerMeta: fb?.footerMeta || rawModTitle.toUpperCase(),
            desc: fb?.desc || rawModDesc,
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
    const pillarMatches = [...clean.matchAll(/^##\s+Pillar\s+(\d+):\s*([^\n]+)$/gim)];
    if (pillarMatches.length > 0) {
      const updatedTabs: DirectiveBuilderTab[] = pillarMatches.map((pm, idx) => {
        const pillarNum = parseInt(pm[1], 10);
        const pillarTitle = pm[2].trim();
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
              title: fbCard?.title || pillarTitle,
              footerMeta: fbCard?.footerMeta || pillarTitle,
              desc: fbCard?.desc || introDesc,
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
      ...clean.matchAll(/^##\s+([2-5])\.\s+([^\n]+)$/gm),
    ];
    if (domainMatches.length > 0 && nextTabs[2]) {
      const defaultDomainCards = nextTabs[2].cards;
      let totalProtocols = 0;
      const domainCards: DirectiveBuilderCard[] = domainMatches.map((dm, idx) => {
        const secNum = parseInt(dm[1], 10);
        const domainNum = secNum - 1;
        const domainTitle = dm[2].trim();
        const startPos = (dm.index || 0) + dm[0].length;
        const endPos =
          idx + 1 < domainMatches.length
            ? domainMatches[idx + 1].index || clean.length
            : clean.length;
        const sectionBody = clean.slice(startPos, endPos).trim();
        const fb =
          defaultDomainCards.find((c) => c.id === `proto_d${domainNum}`) ||
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
        label: `${totalProtocols || 33} RULES`,
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
  t: (key: string, fallback?: string) => string = defaultT
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
              (parsed.tabs[0]?.cards?.[0]?.subCards?.length || 0) < 14)
          ) {
            return parseMarkdownToDirectiveSchema(content, effectiveSlug, t);
          }
          // Sanitize any leftover italic meta prefix on card descriptions
          parsed.tabs = parsed.tabs.map((tb) => ({
            ...tb,
            cards: (tb.cards || []).map((c) => ({
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
          lines.push(`- **${sub.title}:** ${sub.desc}`);
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

export function getDefaultDirectiveBuilderSchema(
  slug: DirectiveSlug,
  t: (key: string, fallback?: string) => string = defaultT
): DirectiveBuilderSchema {
  const g = (txt: string) => (txt ? t("", txt) : "");
  const elevatedRolesCards: DirectiveBuilderCard[] = [
    {
      id: "role_citizen",
      icon: t("icon_person", "person"),
      overline: t("dir_proto_r1_tier", "Tier 1 • Base + Open Workshop"),
      badge: t("role_citizen", "{Citizen}"),
      title: t("role_citizen", "{Citizen}"),
      footerMeta: t("dir_proto_r1_tier", "Tier 1 • Base + Open Workshop"),
      desc: t(
        "dir_proto_r1_scope",
        "All 9 {Citizen} Modules ({Vault}, Nexus, {Blueprints}, Conflict Radar, Homestead Lab, Workbench, {Backups}) + Inherited Open {Mason} Workshop (Sandbox, {Mason} IDE, 3-Tile {Mod} Studio, Theme Forge, Static Edge Direct Push, Schema & Lexicon Codex) + Scout Queue submissions."
      ),
      status: "citizen",
      subCards: [
        {
          id: "role_cit_s1",
          icon: t("icon_inventory_2", "inventory_2"),
          title: t("dir_role_cit_s1_title", "9 Core {Citizen} Sectors & Symlink Airgap"),
          desc: t(
            "dir_role_cit_s1_desc",
            "Full offline and online access to Command Center, Your {Vault}, The Nexus, {Blueprints}, Comm-Link, Conflict Radar, Homestead Lab, {Citizen}'s Workbench, and {Backups}."
          ),
        },
        {
          id: "role_cit_s2",
          icon: t("icon_handyman", "handyman"),
          title: t("dir_role_cit_s2_title", "Inherited Open {Mason} Workshop & Static Edge Push"),
          desc: t(
            "dir_role_cit_s2_desc",
            "Build {mods} in Dev Sandbox, package manifest.json / catalog.json releases, and 1-click Auto-Push to GitHub, Gist, GitLab/Codeberg, Neocities, or WebDAV."
          ),
        },
      ],
    },
    {
      id: "role_mason",
      icon: t("icon_construction", "construction"),
      overline: t("dir_proto_r2_tier", "Tier 2 • Verified Creator"),
      badge: t("auth_passkey_badge_fido", "FIDO2 PASSKEY"),
      title: t("dir_proto_r2_role", "Verified {Mason}"),
      footerMeta: t("dir_proto_r2_tier", "Tier 2 • Verified Creator"),
      desc: t(
        "dir_proto_r2_scope",
        "Inherits all {Citizen} & Open Workshop tools + FIDO2 Passkey {Vault} gate, Direct Nexus {Mod} Publishing, Verified {Mason} Queue Fast-Lane (bypasses Scout threshold), Public {Mason} Profile Showcase, {Mason} Comm-Link Broadcasts, and 0%-Cut Supporter Bridge."
      ),
      status: "passkey",
      subCards: [
        {
          id: "role_mas_s1",
          icon: t("icon_rocket_launch", "rocket_launch"),
          title: t("dir_role_mas_s1_title", "Verified Fast-Lane & Direct Nexus Publishing"),
          desc: t(
            "dir_role_mas_s1_desc",
            "Bypasses crowd Scout thresholds to submit verified {mods} directly to Architect review and manage public creator portfolios."
          ),
        },
        {
          id: "role_mas_s2",
          icon: t("icon_volunteer_activism", "volunteer_activism"),
          title: t("dir_role_mas_s2_title", "0%-Cut Supporter Bridge & Creator Dispatches"),
          desc: t(
            "dir_role_mas_s2_desc",
            "Link Patreon, Ko-fi, or custom supporter URLs with 0% platform cut and broadcast release alerts to followers."
          ),
        },
      ],
    },
    {
      id: "role_architect",
      icon: t("icon_architecture", "architecture"),
      overline: t("dir_proto_r3_tier", "Tier 3 • Spoke Moderator"),
      badge: t("auth_passkey_badge_fido", "FIDO2 PASSKEY"),
      title: t("architect", "Architect"),
      footerMeta: t("dir_proto_r3_tier", "Tier 3 • Spoke Moderator"),
      desc: t(
        "dir_proto_r3_scope",
        "Unlocks Architect Console: Global Registry curation (3-Tile {Mod} Studio), Verified {Mason} & Scout Queue triage (min_scout_submissions), Global Conflict Matrix directives, Check Hash deep scan, Template Oversight, and claimable {Citizen} Support Desk tickets."
      ),
      status: "passkey",
      subCards: [
        {
          id: "role_arc_s1",
          icon: t("icon_fact_check", "fact_check"),
          title: t("dir_role_arc_s1_title", "Global Registry & Conflict Matrix Curation"),
          desc: t(
            "dir_role_arc_s1_desc",
            "Approve Verified {Mason} & Scout submissions, author Severity 1–4 conflict directives, and run deep Check Hash heuristic verification."
          ),
        },
        {
          id: "role_arc_s2",
          icon: t("icon_support_agent", "support_agent"),
          title: t("dir_role_arc_s2_title", "{Citizen} Support Desk & Diagnostic Dossiers"),
          desc: t(
            "dir_role_arc_s2_desc",
            "Claim and resolve encrypted {Citizen} support tickets with PII-scrubbed crash logs and active loadout telemetry."
          ),
        },
      ],
    },
    {
      id: "role_oversight",
      icon: t("icon_admin_panel_settings", "admin_panel_settings"),
      overline: t("dir_proto_r4_tier", "Tier 4 • Spoke Security Admin"),
      badge: t("auth_passkey_badge_fido", "FIDO2 PASSKEY"),
      title: t("role_oversight", "Oversight"),
      footerMeta: t("dir_proto_r4_tier", "Tier 4 • Spoke Security Admin"),
      desc: t(
        "dir_proto_r4_scope",
        "Unlocks Oversight Command: Spoke Heuristic Signatures authoring (17+ Spoke rules), Compliance Tier 5 Malware flagging, Emergency DEFCON 1 Lockdown override, Game/DLC patch registration, Mass Batch Updater, {Mason} Linker, and Spoke Identity Matrix (up to Architect)."
      ),
      status: "passkey",
      subCards: [
        {
          id: "role_ovr_s1",
          icon: t("icon_security", "security"),
          title: t("dir_role_ovr_s1_title", "Spoke Heuristics, Tier 5 Blacklists & DEFCON 1"),
          desc: t(
            "dir_role_ovr_s1_desc",
            "Author game-specific heuristic signatures, flag Tier 5 Malware DNA hashes, and trigger DEFCON 1 pre-patch shields."
          ),
        },
        {
          id: "role_ovr_s2",
          icon: t("icon_published_with_changes", "published_with_changes"),
          title: t("dir_role_ovr_s2_title", "Engine Patch Registration & Mass Batch Triage"),
          desc: t(
            "dir_role_ovr_s2_desc",
            "Register upstream game binary patches and DLC packs, and execute mass compatibility updates across the Spoke registry."
          ),
        },
      ],
    },
    {
      id: "role_wayfinder",
      icon: t("icon_explore", "explore"),
      overline: t("dir_proto_r5_tier", "Tier 5 • Spoke Sovereign"),
      badge: t("auth_passkey_badge_fido", "FIDO2 PASSKEY"),
      title: t("role_wayfinder", "Wayfinder"),
      footerMeta: t("dir_proto_r5_tier", "Tier 5 • Spoke Sovereign"),
      desc: t(
        "dir_proto_r5_scope",
        "Unlocks Wayfinder Operations: Full Spoke Identity Matrix (up to Wayfinder), Spoke Setup & Maintenance, Partners Agreement & Compliance Protocol covenants, unilateral Cut the Cord severance, Master Schema & Lexicon Studios, Non-Custodial 0%-Cut Donations, and The Dispatch."
      ),
      status: "passkey",
      subCards: [
        {
          id: "role_way_s1",
          icon: t("icon_hub", "hub"),
          title: t("dir_role_way_s1_title", "Spoke Sovereignty, Covenants & Cut the Cord"),
          desc: t(
            "dir_role_way_s1_desc",
            "Rotate Spoke Supabase keys, inspect the Partners Agreement & Compliance Protocol, configure 0%-cut community donations, or sever from the Hub at any time."
          ),
        },
        {
          id: "role_way_s2",
          icon: t("icon_schema", "schema"),
          title: t("dir_role_way_s2_title", "Master Schema Studio & Spoke Aesthetics"),
          desc: t(
            "dir_role_way_s2_desc",
            "Customize your game's Master Schema JSON (paths, install routes, config watcher, mod categories) and publish Spoke Lexicons & Chameleons."
          ),
        },
      ],
    },
    {
      id: "role_keeper",
      icon: t("icon_memory", "memory"),
      overline: t("dir_proto_r6_tier", "Tier 6 • Core OS Hub"),
      badge: t("auth_passkey_badge_fido", "FIDO2 PASSKEY"),
      title: t("dir_proto_r6_role", "Keeper"),
      footerMeta: t("dir_proto_r6_tier", "Tier 6 • Core OS Hub"),
      desc: t(
        "dir_proto_r6_scope",
        "Unlocks Keepers Core (accessible on Landing Page & all workspaces): Partner Spoke Applications & Turnkey SANCTUARY-UPLINK:// Onboarding, Core Heuristics (21+ signatures) & Threat Manifests, Master Game Schemas, Global Lexicons/Chameleons, Bilateral Codebase ↔ Cloud Directives Sync, and Global Audit Logs."
      ),
      status: "passkey",
      subCards: [
        {
          id: "role_kpr_s1",
          icon: t("icon_verified_user", "verified_user"),
          title: t("dir_role_kpr_s1_title", "Core Heuristics (21+ Rules) & Threat Manifests"),
          desc: t(
            "dir_role_kpr_s1_desc",
            "Maintain global antivirus signatures (keeper_heuristic_signatures) and triage Zero-PII Threat Manifest reports submitted from quarantined files."
          ),
        },
        {
          id: "role_kpr_s2",
          icon: t("icon_sync", "sync"),
          title: t("dir_role_kpr_s2_title", "Bilateral Codebase ↔ Hub Sync & Partner Onboarding"),
          desc: t(
            "dir_role_kpr_s2_desc",
            "Sync Directives, Legal Covenants, Schemas, and Lexicons between the codebase offline baseline and the live Cloud Hub database without app rebuilds."
          ),
        },
      ],
    },
  ];

  if (slug === "citizen_guide") {
    return {
      slug: "citizen_guide",
      _schemaVersion: CURRENT_DIRECTIVE_SCHEMA_VERSION,
      title: t("sd_card_guide_title", "Interactive {Citizen} Guide & OS Walkthrough"),
      summary: t(
        "sd_card_guide_desc",
        "10-stage interactive walkthrough of Sanctuary OS, 12 operational & creator modules (including Static Edge Direct Push, Master Schema & Lexicon Studios, and Spoke Covenants), and the 6-Tier Clearance Hierarchy."
      ),
      tabs: [
        {
          id: "walkthrough",
          icon: t("icon_play_circle", "play_circle"),
          label: t("dir_guide_mode_walk_v58_lbl", "10 STAGES"),
          value: t("dir_guide_mode_walk_val", "OS Walkthrough"),
          cards: [
            {
              id: "walk_1",
              icon: t("icon_space_dashboard", "space_dashboard"),
              overline: "STAGE 1 OF 10",
              badge: t("dir_walk_s1_short", "1. Shell & Bars"),
              title: t("dir_walk_s1_title", "Global Shell: Sidebar, Top Pill & Dock"),
              footerMeta: t("dir_walk_s1_sub", "Persistent Glass Frame & Context-Aware Navigation"),
              desc: t(
                "dir_walk_s1_desc",
                "Sanctuary OS is framed by three persistent Liquid Glass bars that adapt automatically between the Foundry Landing Page and your mounted Game Workspaces."
              ),
              subCards: [
                {
                  id: "walk_1_c1",
                  icon: t("icon_menu", "menu"),
                  title: t("dir_walk_s1_c1_name", "Left Sidebar (Context-Aware)"),
                  desc: t(
                    "dir_walk_s1_c1_desc",
                    "On the Landing Page, scrolls to Web sections and shows Keepers Core for Keepers. Inside a game workspace, switches between the 9 {Citizen} modules, unlocked Command Hubs, and the Quick Launch button."
                  ),
                },
                {
                  id: "walk_1_c2",
                  icon: t("icon_sports_esports", "sports_esports"),
                  title: t("dir_walk_s1_c2_name", "Top Center Workspace Pill"),
                  desc: t(
                    "dir_walk_s1_c2_desc",
                    "Click the game pill in the top TitleBar to switch active games, mount a new workspace, or return to the Sanctuary Foundry Landing Page."
                  ),
                },
                {
                  id: "walk_1_c3",
                  icon: t("icon_dock_to_bottom", "dock_to_bottom"),
                  title: t("dir_walk_s1_c3_name", "Bottom Morphing Status Pill"),
                  desc: t(
                    "dir_walk_s1_c3_desc",
                    "Houses 1-Click Radar Sweep, {Vault} Lockdown, {Blueprint} Quick-Swap, Side Browser, Notifications, and live alert counters. Auto-tucks when SidePanels open."
                  ),
                },
              ],
            },
            {
              id: "walk_2",
              icon: t("icon_explore", "explore"),
              overline: "STAGE 2 OF 10",
              badge: t("dir_walk_s2_short", "2. Cartographer"),
              title: t("dir_walk_s2_title", "Mounting a Workspace & Cartographer (Win & Mac)"),
              footerMeta: t("dir_walk_s2_sub", "First-Boot Coordinate Mapping & Native PE/Plist Ripper"),
              desc: t(
                "dir_walk_s2_desc",
                "Selecting a workspace on the Landing Page launches The Cartographer to link your Windows (.exe) or macOS (.app) game binary, live {Mods} directory, and airgapped {Vault} storage."
              ),
              subCards: [
                {
                  id: "walk_2_c1",
                  icon: t("icon_terminal", "terminal"),
                  title: t("dir_walk_s2_c1_name", "Bin Folder (Windows .exe & macOS .app)"),
                  desc: t(
                    "dir_walk_s2_c1_desc",
                    "Points to your game binary (e.g. TS4_x64.exe or The Sims 4.app). Sanctuary extracts the genuine patch version in-process via Rust pelite or macOS Info.plist."
                  ),
                },
                {
                  id: "walk_2_c2",
                  icon: t("icon_folder_open", "folder_open"),
                  title: t("dir_walk_s2_c2_name", "{Mods} Folder (Symlink Target)"),
                  desc: t(
                    "dir_walk_s2_c2_desc",
                    "Your live game {Mods} folder. Keep this untouched—Sanctuary projects active {mods} here via zero-copy OS symlinks and custom install_routes."
                  ),
                },
                {
                  id: "walk_2_c3",
                  icon: t("icon_inventory_2", "inventory_2"),
                  title: t("dir_walk_s2_c3_name", "{Vault} Folder (Deep Archive)"),
                  desc: t(
                    "dir_walk_s2_c3_desc",
                    "Your isolated storage directory where Sanctuary builds {Mods}/, {Blueprints}/, Backups/World/, Backups/Engine/, Quarantine/, and Data/Cache/."
                  ),
                },
              ],
            },
            {
              id: "walk_3",
              icon: t("icon_inventory_2", "inventory_2"),
              overline: "STAGE 3 OF 10",
              badge: t("dir_walk_s3_short", "3. {Vault} & Cards"),
              title: t("dir_walk_s3_title", "Your {Vault}, {Mod} Cards & ActionPill"),
              footerMeta: t("dir_walk_s3_sub", "Drag-and-Drop Ingestion, Suite Grouping & Dossiers"),
              desc: t(
                "dir_walk_s3_desc",
                "Every {mod} you drop into Sanctuary OS is fingerprinted with SHA-256, scanned by the Universal 21+17 Heuristic Engine, and indexed in Your {Vault}."
              ),
              subCards: [
                {
                  id: "walk_3_c1",
                  icon: t("icon_tune", "tune"),
                  title: t("dir_walk_s3_c1_name", "ActionPill & Filters Popover"),
                  desc: t(
                    "dir_walk_s3_c1_desc",
                    "Instant search bar, Filters (tune) popover for Game Version / Eligible-Only filtering, sort order, and bulk selection actions."
                  ),
                },
                {
                  id: "walk_3_c2",
                  icon: t("icon_toggle_on", "toggle_on"),
                  title: t("dir_walk_s3_c2_name", "Parent Suite Card & Equip Toggle"),
                  desc: t(
                    "dir_walk_s3_c2_desc",
                    "Toggles symlinks in milliseconds. Multi-part {mod} suites (like MC Command Center) group into one Parent Card with an expandable Linked Modules drawer."
                  ),
                },
                {
                  id: "walk_3_c3",
                  icon: t("icon_menu_book", "menu_book"),
                  title: t("dir_walk_s3_c3_name", "{Mod} Dossier SidePanel"),
                  desc: t(
                    "dir_walk_s3_c3_desc",
                    "Click any card to open its right-hand Dossier: edit custom local names/URLs/tags, bind a static manifest.json / catalog.json URL, or inspect package files."
                  ),
                },
              ],
            },
            {
              id: "walk_4",
              icon: t("icon_map", "map"),
              overline: "STAGE 4 OF 10",
              badge: t("sd_guide_s4_short", "4. {Blueprints}"),
              title: t("dir_walk_s4_title", "{Blueprints} & Loadout Hot-Swapping"),
              footerMeta: t("dir_walk_s4_sub", "Zero-Copy Profile Switching & SNCXXX Cloud Uplinks"),
              desc: t(
                "dir_walk_s4_desc",
                "Replace manual folder dragging with saved tactical loadouts that swap thousands of symlinks in under a second."
              ),
              subCards: [
                {
                  id: "walk_4_c1",
                  icon: t("icon_swap_horiz", "swap_horiz"),
                  title: t("dir_walk_s4_c1_name", "{Blueprint} Hot-Swap Dropdown"),
                  desc: t(
                    "dir_walk_s4_c1_desc",
                    "Switch between playstyles (e.g. Realism Save, Occult Save, Patch Testing) directly from the {Vault} header or Bottom Dock."
                  ),
                },
                {
                  id: "walk_4_c2",
                  icon: t("icon_data_object", "data_object"),
                  title: t("dir_walk_s4_c2_name", "Portable Offline JSON Export"),
                  desc: t(
                    "dir_walk_s4_c2_desc",
                    "Exports your loadout to a self-contained .json file that preserves custom local modMeta URLs and workspace identity offline."
                  ),
                },
                {
                  id: "walk_4_c3",
                  icon: t("icon_tag", "tag"),
                  title: t("dir_walk_s4_c3_name", "6-Digit Cloud Uplink (SNCXXX)"),
                  desc: t(
                    "dir_walk_s4_c3_desc",
                    "Generates a 6-character share code (SNCXXX) or publishes your {Blueprint} to The Nexus while auto-stripping flagged Tier 1–4 hashes."
                  ),
                },
              ],
            },
            {
              id: "walk_5",
              icon: t("icon_radar", "radar"),
              overline: "STAGE 5 OF 10",
              badge: t("dir_walk_s5_short", "5. Radar & Lab"),
              title: t("dir_walk_s5_title", "Conflict Radar & Homestead Lab"),
              footerMeta: t("dir_walk_s5_sub", "Pick-a-Winner Load Order & 100% Nuke Proving Grounds"),
              desc: t(
                "dir_walk_s5_desc",
                "Resolve tuning overlaps before launching the game, or isolate suspect {mods} in a sterile crash-monitored sandbox."
              ),
              subCards: [
                {
                  id: "walk_5_c1",
                  icon: t("icon_emoji_events", "emoji_events"),
                  title: t("dir_walk_s5_c1_name", "Casual Mode (Pick a Winner)"),
                  desc: t(
                    "dir_walk_s5_c1_desc",
                    "Click 'Pick a Winner' on any Severity 3 Tuning Overlap to automatically route the winning {mod} into a higher priority tier and dynamic Resource.cfg."
                  ),
                },
                {
                  id: "walk_5_c2",
                  icon: t("icon_rule", "rule"),
                  title: t("dir_walk_s5_c2_name", "Advanced Load Order & Break Loop"),
                  desc: t(
                    "dir_walk_s5_c2_desc",
                    "Build directional Must Load After / Before rules with topological sorting and 1-click circular dependency loop breaking."
                  ),
                },
                {
                  id: "walk_5_c3",
                  icon: t("icon_science", "science"),
                  title: t("dir_walk_s5_c3_name", "Homestead 100% Nuke & Save Airgap"),
                  desc: t(
                    "dir_walk_s5_c3_desc",
                    "Snapshots save_airgap_targets (saves & Tray), boots with only the test {mod} (or 1v1 pair), harvests crash logs, and restores your saves."
                  ),
                },
              ],
            },
            {
              id: "walk_6",
              icon: t("icon_construction", "construction"),
              overline: "STAGE 6 OF 10",
              badge: t("dir_walk_s6_short", "6. IDE & Backups"),
              title: t("dir_walk_s6_title", "Workbench, Config Watcher & {Backups}"),
              footerMeta: t("dir_walk_s6_sub", "2-Column Visual Config Studio & Hardlink Backups"),
              desc: t(
                "dir_walk_s6_desc",
                "Edit 430+ setting {mod} config files visually at 60 FPS, sync live in-game config writes back to the {Vault}, and safeguard saves with hardlink snapshots."
              ),
              subCards: [
                {
                  id: "walk_6_c1",
                  icon: t("icon_tune", "tune"),
                  title: t("dir_walk_s6_c1_name", "2-Column Visual Config Editor & Watcher"),
                  desc: t(
                    "dir_walk_s6_c1_desc",
                    "Category Pill Bar, dual Min/Max range steppers, Undo/Reset, plus the Dynamic Config Watcher that syncs in-game .cfg/.ini/.json edits back to your {Vault}."
                  ),
                },
                {
                  id: "walk_6_c2",
                  icon: t("icon_compare_arrows", "compare_arrows"),
                  title: t("dir_walk_s6_c2_name", "2-Column Timeline & Diff Panel"),
                  desc: t(
                    "dir_walk_s6_c2_desc",
                    "Compare live unsaved edits or historical snapshots side-by-side in Visual Diff cards or Raw Monaco Code Diff."
                  ),
                },
                {
                  id: "walk_6_c3",
                  icon: t("icon_history", "history"),
                  title: t("dir_walk_s6_c3_name", "{Backups} (World & Engine)"),
                  desc: t(
                    "dir_walk_s6_c3_desc",
                    "Uses OS hardlinks so unchanged files consume 0 extra bytes, paired with differential rollback restoration."
                  ),
                },
              ],
            },
            {
              id: "walk_7",
              icon: t("icon_shield", "shield"),
              overline: "STAGE 7 OF 10",
              badge: t("dir_walk_s7_short", "7. Hubs & Security"),
              title: t("dir_walk_s7_title", "Open Workshop, Passkeys & Universal AV Lockdown"),
              footerMeta: t("dir_walk_s7_sub", "21+17 Heuristic Rules, FIDO2 Passkeys & Quarantine Shred"),
              desc: t(
                "dir_walk_s7_desc",
                "Every {Citizen} inherits the local {Mason} Workshop, while hardware FIDO2 Passkeys and the Universal Multi-Format Heuristic Scanner protect the OS."
              ),
              subCards: [
                {
                  id: "walk_7_c1",
                  icon: t("icon_handyman", "handyman"),
                  title: t("dir_walk_s7_c1_name", "Open {Mason} Workshop ({Citizen} Tier)"),
                  desc: t(
                    "dir_walk_s7_c1_desc",
                    "All {Citizens} can use Dev Sandbox, {Mason} IDE, 3-Tile {Mod} Studio, Theme Forge (6 Liquid Glass sliders), and Static Edge Release Packaging."
                  ),
                },
                {
                  id: "walk_7_c2",
                  icon: t("icon_passkey", "passkey"),
                  title: t("dir_walk_s7_c2_name", "FIDO2 Passkey & TOTP {Vault}"),
                  desc: t(
                    "dir_walk_s7_c2_desc",
                    "Elevated clearances (Verified {Mason} through Keeper) bind Windows Hello, Touch ID, or YubiKey tokens inside the right-hand Security {Vault} SidePanel."
                  ),
                },
                {
                  id: "walk_7_c3",
                  icon: t("icon_gpp_bad", "gpp_bad"),
                  title: t("dir_walk_s7_c3_name", "Universal AV Quarantine & Threat Manifest"),
                  desc: t(
                    "dir_walk_s7_c3_desc",
                    "Decompresses Zlib/Zstd DBPF streams and Base64/Hex strings against 21 Core + 17 Spoke rules, locking the OS with Move-mode source disposition and Secure Shred."
                  ),
                },
              ],
            },
            {
              id: "walk_8",
              icon: t("icon_cloud_upload", "cloud_upload"),
              overline: "STAGE 8 OF 10",
              badge: t("dir_walk_s8_short", "8. Static Edge"),
              title: t("dir_walk_s8_title", "Decentralized Static Edge Polling & 1-Click Auto-Push"),
              footerMeta: t("dir_walk_s8_sub", "manifest.json • catalog.json • Lineage Hash Rollover"),
              desc: t(
                "dir_walk_s8_desc",
                "Publish {mod} updates without a central server using static manifest.json or multi-{mod} catalog.json endpoints with 1-click OS Auto-Push and automatic SHA-256 lineage rollover."
              ),
              subCards: [
                {
                  id: "walk_8_c1",
                  icon: t("icon_rocket_launch", "rocket_launch"),
                  title: t("dir_walk_s8_c1_name", "6-Provider 1-Click OS Auto-Push"),
                  desc: t(
                    "dir_walk_s8_c1_desc",
                    "Push manifest.json or catalog.json directly from your PC to GitHub Repo/Cloudflare Pages, GitHub Gist, GitLab/Codeberg, Neocities, WebDAV, or a Local Synced Folder."
                  ),
                },
                {
                  id: "walk_8_c2",
                  icon: t("icon_history", "history"),
                  title: t("dir_walk_s8_c2_name", "Automatic Lineage Hash Rollover"),
                  desc: t(
                    "dir_walk_s8_c2_desc",
                    "Exporting a new version automatically rolls prior v1.0 hashes into previous_hashes so {Citizens} get instant Update Available alerts and in-place file replacement."
                  ),
                },
                {
                  id: "walk_8_c3",
                  icon: t("icon_library_books", "library_books"),
                  title: t("dir_walk_s8_c3_name", "Single Master catalog.json Support"),
                  desc: t(
                    "dir_walk_s8_c3_desc",
                    "Point all of your {mods} to one shared catalog.json URL—Sanctuary OS matches each installed {mod} by artifact ID, current_hashes, or previous_hashes."
                  ),
                },
              ],
            },
            {
              id: "walk_9",
              icon: t("icon_schema", "schema"),
              overline: "STAGE 9 OF 10",
              badge: t("dir_walk_s9_short", "9. Schema & Lexicon"),
              title: t("dir_walk_s9_title", "Master Schema Studio & Lexicon Terminology Studio"),
              footerMeta: t("dir_walk_s9_sub", "7 Engine Presets • 21 {Glossary} Tokens • Guided Icon Builder"),
              desc: t(
                "dir_walk_s9_desc",
                "Configure any game engine across Windows and macOS with the 4-Tab Master Schema Visual Studio, and hot-swap all 1,700+ OS strings and icons with the Lexicon Studio."
              ),
              subCards: [
                {
                  id: "walk_9_c1",
                  icon: t("icon_schema", "schema"),
                  title: t("dir_walk_s9_c1_name", "7 Engine Architecture Presets & Routes"),
                  desc: t(
                    "dir_walk_s9_c1_desc",
                    "Load presets for The Sims 4, Cyberpunk 2077, Skyrim SE, GTA V, Baldur's Gate 3, Stardew Valley, or Universal—complete with install_routes and mod_categories."
                  ),
                },
                {
                  id: "walk_9_c2",
                  icon: t("icon_translate", "translate"),
                  title: t("dir_walk_s9_c2_name", "21 Dynamic {Glossary} Tokens & Parity Alert"),
                  desc: t(
                    "dir_walk_s9_c2_desc",
                    "Editing {Mod}, {Vault}, or {Blueprint} updates 1,700+ strings with automatic Title/lower/UPPER casing, a/an grammar, and livecloud updates without rebuilding the app."
                  ),
                },
                {
                  id: "walk_9_c3",
                  icon: t("icon_Apps", "apps"),
                  title: t("dir_walk_s9_c3_name", "Guided Icon Override Builder & Codex Guides"),
                  desc: t(
                    "dir_walk_s9_c3_desc",
                    "Search and remap any OS Material Symbol icon visually with side-by-side Default → New glyph previews, or open the interactive Schema & Lexicon Codex."
                  ),
                },
              ],
            },
            {
              id: "walk_10",
              icon: t("icon_handshake", "handshake"),
              overline: "STAGE 10 OF 10",
              badge: t("dir_walk_s10_short", "10. Support & Partners"),
              title: t("dir_walk_s10_title", "Supporter Pipeline, Core Feedback & Partner Spoke Onboarding"),
              footerMeta: t("dir_walk_s10_sub", "$5 = +30 Days Dev Builds • 0% Partner Cut • Sovereign Covenants"),
              desc: t(
                "dir_walk_s10_desc",
                "Submit Core OS feedback or bug reports from the Landing Page, unlock Daily Dev Builds via the Supporter Pipeline, or apply to launch a Sovereign Partner Spoke."
              ),
              subCards: [
                {
                  id: "walk_10_c1",
                  icon: t("icon_Favorite", "favorite"),
                  title: t("dir_walk_s10_c1_name", "Supporter Pipeline ($5 = +30 Days Dev Builds)"),
                  desc: t(
                    "dir_walk_s10_c1_desc",
                    "Every $5 contribution adds +30 days of automated Daily Dev Build access (Windows .msi & macOS .dmg) verified via Stripe Receipt / Order ID."
                  ),
                },
                {
                  id: "walk_10_c2",
                  icon: t("icon_gavel", "gavel"),
                  title: t("dir_walk_s10_c2_name", "Readiness-Gated Partner Spoke Application"),
                  desc: t(
                    "dir_walk_s10_c2_desc",
                    "Review the Sanctuary Partners Agreement and Compliance Protocol in an interactive overlay drawer, verify your schema.sql Spoke readiness, and retain 100% of community donations."
                  ),
                },
                {
                  id: "walk_10_c3",
                  icon: t("icon_cloud_sync", "cloud_sync"),
                  title: t("dir_walk_s10_c3_name", "Offline Codebase Baseline + Live Cloud Updates"),
                  desc: t(
                    "dir_walk_s10_c3_desc",
                    "Bundled .md, schema, and lexicon files power instant first-launch & offline use, while connected desktops receive live cloud updates without reinstalling."
                  ),
                },
              ],
            },
          ],
        },
        {
          id: "modules",
          icon: t("icon_explore", "explore"),
          label: g("12 MODULES"),
          value: g("{Citizen} Tools"),
          cards: [
            {
              id: "mod_1",
              icon: t("icon_explore", "explore"),
              overline: "MODULE 1 OF 12",
              badge: g("1. Cartographer"),
              title: g("Cartographer Initialization & System Coordinates"),
              footerMeta: g("INITIAL SETUP • 3 COORDINATES"),
              desc: g(
                "On first boot, the Cartographer maps your machine's file system and extracts your genuine game engine version directly from the binary executable (.exe / .app) using an in-process Rust PE/plist parser."
              ),
              tip: g(
                "Click the Cloud Auto-Detect icon during setup to automatically locate your Game Bin and {Mods} directories for the active workspace."
              ),
              subCards: [
                {
                  id: "mod_1_c1",
                  icon: t("icon_terminal", "terminal"),
                  title: g("Game Bin Folder (Live Engine)"),
                  desc: g(
                    "Where your game executable lives. Sanctuary reads PE headers directly from the .exe (or macOS .app Info.plist) to guarantee 100% patch version accuracy with zero antivirus false positives."
                  ),
                },
                {
                  id: "mod_1_c2",
                  icon: t("icon_folder_open", "folder_open"),
                  title: g("Active {Mods} Folder (Symlink Target)"),
                  desc: g(
                    "Your game's live {Mods} folder. Never drop files here manually—Sanctuary projects high-speed symlinks into this directory from your isolated {Vault}."
                  ),
                },
                {
                  id: "mod_1_c3",
                  icon: t("icon_inventory_2", "inventory_2"),
                  title: g("Isolated {Vault} Folder (Deep Storage)"),
                  desc: g(
                    "Your airgapped archive containing {Mods}/, {Blueprints}/, Backups/World, Backups/Engine, Quarantine/, and Data/Cache (.sanctuary_cache.db)."
                  ),
                },
                {
                  id: "mod_1_c4",
                  icon: t("icon_verified_user", "verified_user"),
                  title: g("Windows & macOS Symlink Permissions"),
                  desc: g(
                    "Enable Windows Developer Mode (or macOS Full Disk Access) so the Airgap engine can project zero-byte symlinks and manage com.apple.quarantine attributes cleanly."
                  ),
                },
              ],
            },
            {
              id: "mod_2",
              icon: t("icon_space_dashboard", "space_dashboard"),
              overline: "MODULE 2 OF 12",
              badge: g("2. Command Center"),
              title: g("The Command Center & Live Telemetry"),
              footerMeta: g("SYSTEM DASHBOARD • 4 HEALTH STATES"),
              desc: g(
                "Your high-level glassmorphic mission control. Monitors the health of your active {Blueprint}, surfaces {mason} updates and system dispatches, and provides 1-click access to Radar Sweeps and {Vault} Lockdown."
              ),
              tip: g(
                "Use the global SystemStatusBar at the bottom of the window to trigger a Radar Sweep or instant {Vault} Lockdown from any screen in the OS."
              ),
              subCards: [
                {
                  id: "mod_2_c1",
                  icon: t("icon_check_circle", "check_circle"),
                  title: g("System Stable (Green State)"),
                  desc: g(
                    "All equipped {mods} match your active game version, all required DLCs and dependencies are satisfied, and zero unmitigated collisions exist."
                  ),
                },
                {
                  id: "mod_2_c2",
                  icon: t("icon_system_update_alt", "system_update_alt"),
                  title: g("{Mod} Updates Available (Blue State)"),
                  desc: g(
                    "Newer SHA-256 versions have been detected either via the Spoke Cloud Registry or decentralized {mason} manifest.json / catalog.json endpoints."
                  ),
                },
                {
                  id: "mod_2_c3",
                  icon: t("icon_warning", "warning"),
                  title: g("{Citizen} Action Recommended (Amber State)"),
                  desc: g(
                    "An equipped {mod} is flagged as Unstable or has an unresolved Severity 3 Tuning Overlap awaiting a Load Order winner."
                  ),
                },
                {
                  id: "mod_2_c4",
                  icon: t("icon_error", "error"),
                  title: g("Critical Failure Detected (Red State)"),
                  desc: g(
                    "An equipped {mod} is Corrupted, incompatible with your Game Patch, missing a mandatory dependency/DLC, or locked in a Severity 4 Fatal Clash."
                  ),
                },
              ],
            },
            {
              id: "mod_3",
              icon: t("icon_inventory_2", "inventory_2"),
              overline: "MODULE 3 OF 12",
              badge: g("3. Your {Vault}"),
              title: g("Your {Vault} & Symlink Airgap 2.5"),
              footerMeta: g("ISOLATED STORAGE • SHA-256 DNA"),
              desc: g(
                "Your local {vault} and secured asset bunker. The game engine never touches your {Vault} directly—files are ingested, hashed via SHA-256, scanned by 21+17 heuristics, and projected via symlinks."
              ),
              tip: g(
                "Your Local {Mod} Dossier is decoupled from the cloud—you can freely customize {mod} titles, creator URLs, cover images, and tags locally."
              ),
              subCards: [
                {
                  id: "mod_3_c1",
                  icon: t("icon_fingerprint", "fingerprint"),
                  title: g("Global Drop-Zone & DNA Match"),
                  desc: g(
                    "Drag and drop .package, .ts4script, .zip, .rar, .7z, .tar.zst, or override.json files anywhere into Sanctuary OS. Duplicate SHA-256 hashes are automatically intercepted."
                  ),
                },
                {
                  id: "mod_3_c2",
                  icon: t("icon_cloud_done", "cloud_done"),
                  title: g("Decentralized Static Edge (override.json)"),
                  desc: g(
                    "When a {mod} archive includes a {mason}'s override.json, Sanctuary binds its SHA-256 lineage to the {mason}'s static manifest.json or catalog.json URL for serverless update alerts."
                  ),
                },
                {
                  id: "mod_3_c3",
                  icon: t("icon_delete_sweep", "delete_sweep"),
                  title: g("Delete Cascade (Deep Yeet 2.0)"),
                  desc: g(
                    "Removing a core master library (such as XML Injector) automatically alerts you and queues all dependent add-ons so your loadout never breaks."
                  ),
                },
                {
                  id: "mod_3_c4",
                  icon: t("icon_visibility_off", "visibility_off"),
                  title: g("Ghosted Diagnostic States"),
                  desc: g(
                    "Incompatible or broken {mods} automatically enter a translucent Ghosted state with hover tooltips detailing Missing DLC, Version Mismatches, or Collisions."
                  ),
                },
              ],
            },
            {
              id: "mod_4",
              icon: t("icon_map", "map"),
              overline: "MODULE 4 OF 12",
              badge: g("4. {Blueprints}"),
              title: g("{Blueprints} & Tactical Loadouts"),
              footerMeta: g("INSTANT HOT-SWAP • CLOUD & OFFLINE"),
              desc: g(
                "Replace manual folder shuffling with {Blueprints}. Switch between completely different {mod} loadouts in seconds without duplicating files on your hard drive."
              ),
              tip: g(
                "Use 'Snapshot Active {Blueprint}' anytime to clone your currently deployed loadout into an experimental profile before adding new {mods}."
              ),
              subCards: [
                {
                  id: "mod_4_c1",
                  icon: t("icon_swap_horiz", "swap_horiz"),
                  title: g("1-Click {Blueprint} Hot-Swap"),
                  desc: g(
                    "Switch active loadouts directly from the {Vault} header or {Blueprints} view. Sanctuary instantly re-projects the exact symlinks and load order for that profile."
                  ),
                },
                {
                  id: "mod_4_c2",
                  icon: t("icon_tag", "tag"),
                  title: g("6-Digit Cloud Uplink (SNCXXX)"),
                  desc: g(
                    "Share your loadout with the community or across devices using a compact 6-character alphanumeric coordinate code."
                  ),
                },
                {
                  id: "mod_4_c3",
                  icon: t("icon_data_object", "data_object"),
                  title: g("Offline JSON Import/Export with modMeta"),
                  desc: g(
                    "Export portable JSON {blueprints} that embed your custom Local Dossier metadata (author links, custom names) and workspace ID for 100% offline preservation."
                  ),
                },
                {
                  id: "mod_4_c4",
                  icon: t("icon_install_mobile", "install_mobile"),
                  title: g("Remote Mobile/Web Queue Staging"),
                  desc: g(
                    "Browse The Nexus on your phone or tablet, stage a {blueprint} queue encrypted in the cloud, and approve it in one click when you sit down at your PC."
                  ),
                },
              ],
            },
            {
              id: "mod_5",
              icon: t("icon_hub", "hub"),
              overline: "MODULE 5 OF 12",
              badge: g("5. Nexus & Browser"),
              title: g("The Nexus & Integrated Side Browser"),
              footerMeta: g("METADATA REGISTRY • ZERO-TAX DISCOVERY"),
              desc: g(
                "Discover verified {Mods}, {Blueprints}, Lexicons, Chameleons, and Workbench Templates—and download directly from creator pages using the built-in Side Browser."
              ),
              tip: g(
                "You can toggle the Integrated Side Browser on or off anytime in System Preferences -> Network depending on whether you prefer in-app or external browsing."
              ),
              subCards: [
                {
                  id: "mod_5_c1",
                  icon: t("icon_tune", "tune"),
                  title: g("Smart Compatibility Filtering"),
                  desc: g(
                    "The Nexus automatically cross-references your installed Game Patch and owned DLCs, highlighting compatible releases and enforcing Tier-0 public safety."
                  ),
                },
                {
                  id: "mod_5_c2",
                  icon: t("icon_download", "download"),
                  title: g("Automatic Download Interception"),
                  desc: g(
                    "Clicking download on a creator's page inside the Integrated Side Browser automatically intercepts the archive and routes it straight into your {Vault}."
                  ),
                },
                {
                  id: "mod_5_c3",
                  icon: t("icon_verified", "verified"),
                  title: g("{Mason} Profiles & Direct Attribution"),
                  desc: g(
                    "Follow your favorite {Masons} to see their posts in your Comm-Link feed. Sanctuary takes 0% platform tax and links directly to {mason} Patreon, Ko-fi, and websites."
                  ),
                },
                {
                  id: "mod_5_c4",
                  icon: t("icon_radar", "radar"),
                  title: g("Crowd-Sourced Scout Queue"),
                  desc: g(
                    "Unidentified local {mods} can be submitted via the Scout Dossier or marked 'Flag as Local' to permanently exclude private files from cloud lookups."
                  ),
                },
              ],
            },
            {
              id: "mod_6",
              icon: t("icon_radar", "radar"),
              overline: "MODULE 6 OF 12",
              badge: g("6. Conflict Radar"),
              title: g("Conflict Radar & Schema Load Order Engine"),
              footerMeta: g("TOPOLOGICAL COMPILER • SEVERITY 1–4"),
              desc: g(
                "Sanctuary combines global Architect Directives, creator Static Edge rules, and a topological Load Order compiler to resolve tuning overlaps and prevent crashes before launch."
              ),
              tip: g(
                "Switch between Casual Mode and Advanced Mode anytime using the toggle inside Conflict Radar."
              ),
              subCards: [
                {
                  id: "mod_6_c1",
                  icon: t("icon_emoji_events", "emoji_events"),
                  title: g("Casual Mode: 1-Click 'Pick a Winner'"),
                  desc: g(
                    "For Severity 3 Tuning Overlaps, simply click the {mod} you want to win. Sanctuary automatically compiles the priority rules and routes the winner into the top override tier."
                  ),
                },
                {
                  id: "mod_6_c2",
                  icon: t("icon_rule", "rule"),
                  title: g("Advanced Mode: Directional Rules & Cycle Breaker"),
                  desc: g(
                    "Author custom 'Must Load After / Before' rules, assign explicit Priority Tiers (Base to Sanctuary3), and resolve circular dependency loops with 1-click Break Loop."
                  ),
                },
                {
                  id: "mod_6_c3",
                  icon: t("icon_warning", "warning"),
                  title: g("Severity 4 (Fatal) vs. Severity 3 (Tuning)"),
                  desc: g(
                    "Severity 4 indicates a hard binary/script clash where only one {mod} can remain enabled. Severity 3 indicates a tuning overlap solvable via Load Order priority."
                  ),
                },
                {
                  id: "mod_6_c4",
                  icon: t("icon_layers", "layers"),
                  title: g("Schema-Driven Deployment Strategies"),
                  desc: g(
                    "Adapts per game schema: dynamic Resource.cfg multi-tier folders (Sims 4), ordered manifest lists (loadorder.txt / plugins.txt), numeric prefixes (001_), or timestamps."
                  ),
                },
              ],
            },
            {
              id: "mod_7",
              icon: t("icon_science", "science"),
              overline: "MODULE 7 OF 12",
              badge: g("7. Homestead Lab"),
              title: g("Homestead Lab & 100% Nuke Isolation"),
              footerMeta: g("AIRGAPPED SANDBOX • LIVE CRASH CAPTURE"),
              desc: g(
                "Test unverified {mods} or pit two conflicting {mods} against each other in an airgapped sandbox without risking your real save files or main loadout."
              ),
              tip: g(
                "Passing a timed Homestead Lab playtest and saving in-game automatically verifies your Sandbox {mod} for publishing!"
              ),
              subCards: [
                {
                  id: "mod_7_c1",
                  icon: t("icon_bolt", "bolt"),
                  title: g("100% Nuke Symlink Injection"),
                  desc: g(
                    "Temporarily strips your active loadout symlinks and injects only the isolated test subject plus its mandatory dependencies."
                  ),
                },
                {
                  id: "mod_7_c2",
                  icon: t("icon_shield", "shield"),
                  title: g("Hardware-Airgapped Lab Test Save"),
                  desc: g(
                    "Swaps your live Saves folder with a dedicated Lab Test Save slot during testing so your legacy households can never be corrupted."
                  ),
                },
                {
                  id: "mod_7_c3",
                  icon: t("icon_bug_report", "bug_report"),
                  title: g("Real-Time Exception & Crash Monitor"),
                  desc: g(
                    "Purges stale logs before launch and watches for LastException / engine crash output in real time, matching against community diagnostic signatures."
                  ),
                },
                {
                  id: "mod_7_c4",
                  icon: t("icon_compare_arrows", "compare_arrows"),
                  title: g("1v1 Conflict Stability Protocol"),
                  desc: g(
                    "Pit two suspected conflicting {mods} together in isolation to verify compatibility and submit telemetry directly to Architects."
                  ),
                },
              ],
            },
            {
              id: "mod_8",
              icon: t("icon_history", "history"),
              overline: "MODULE 8 OF 12",
              badge: g("8. {Backups} & IDE"),
              title: g("{Backups} & {Citizen}'s Workbench"),
              footerMeta: g("HARDLINK SNAPSHOTS • VISUAL CONFIG IDE"),
              desc: g(
                "Protect your saves and game binaries with zero-duplication hardlink backups, and fine-tune {mod} configuration files using visual sliders or the built-in Monaco IDE."
              ),
              tip: g(
                "When DEFCON 1 is declared for an incoming game patch, Sanctuary automatically prompts to seal a Pre-Patch {Backups} before launching."
              ),
              subCards: [
                {
                  id: "mod_8_c1",
                  icon: t("icon_archive", "archive"),
                  title: g("World State (Purple) & Engine Core (Pink)"),
                  desc: g(
                    "Independently snapshot your Saves/Tray/Configs (World State) and your actual Game Installation Binaries (Engine Core) before patches hit."
                  ),
                },
                {
                  id: "mod_8_c2",
                  icon: t("icon_home_storage", "home_storage"),
                  title: g("0 MB Delta Hardlink Deduplication"),
                  desc: g(
                    "Unchanged files are linked via native OS hardlinks rather than copied—making snapshots near-instant and consuming disk space only for changed bytes."
                  ),
                },
                {
                  id: "mod_8_c3",
                  icon: t("icon_settings_backup_restore", "settings_backup_restore"),
                  title: g("Differential Rollback & Surgical Extraction"),
                  desc: g(
                    "Restore an entire snapshot via fast differential sync, or browse inside any {Backups} to surgically extract a single household save slot."
                  ),
                },
                {
                  id: "mod_8_c4",
                  icon: t("icon_construction", "construction"),
                  title: g("{Citizen}'s Workbench & Open {Mason} Workshop"),
                  desc: g(
                    "Edit {mod} .json/.ini/.cfg files with safe visual toggles and sliders synced live with a Monaco Raw Code Diff editor—plus full local Sandbox & Export Release tools for all {Citizens}."
                  ),
                },
              ],
            },
            {
              id: "mod_9",
              icon: t("icon_shield", "shield"),
              overline: "MODULE 9 OF 12",
              badge: g("9. Themes & Security"),
              title: g("Chameleons, Lexicons & Malware Defense"),
              footerMeta: g("LIQUID GLASS V3 • UNIVERSAL 21+17 HEURISTICS"),
              desc: g(
                "Personalize every pixel and word of Sanctuary OS while staying protected by cryptographic SHA-256 DNA blacklists and the multi-format Rust Heuristic Scanner."
              ),
              tip: g(
                "Sanctuary OS works 100% offline without an account—and if you sign in, elevated roles are protected by hardware/biometric FIDO2 Passkeys."
              ),
              subCards: [
                {
                  id: "mod_9_c1",
                  icon: t("icon_palette", "palette"),
                  title: g("Chameleon Theme Forge & Liquid Glass"),
                  desc: g(
                    "Switch between Dark and Light presets, download community Chameleons, or build your own in Theme Forge with live refractive saturation, rim light, and specular glare sliders."
                  ),
                },
                {
                  id: "mod_9_c2",
                  icon: t("icon_translate", "translate"),
                  title: g("Lexicon Protocol (Word-as-a-Service)"),
                  desc: g(
                    "Hot-swap the entire OS vocabulary between Standard Technical English, Sanctuary Sci-Fi Cyberpunk, Sims-Friendly Casual, or Simlish."
                  ),
                },
                {
                  id: "mod_9_c3",
                  icon: t("icon_security", "security"),
                  title: g("Universal 21+17 Multi-Format Heuristic Scanner"),
                  desc: g(
                    "Combines 21 Sanctuary Foundry Core Heuristics and 17 Spoke Heuristics with Zlib/Zstd DBPF stream decompression to inspect .zip, .ts4script, .package, .dll, .exe, and .pyc files."
                  ),
                },
                {
                  id: "mod_9_c4",
                  icon: t("icon_gpp_bad", "gpp_bad"),
                  title: g("Full-OS Malware Lockdown & Secure Shred"),
                  desc: g(
                    "If Tier 5 Malware is detected, Sanctuary isolates the file in Quarantine, locks the workspace shell, displays the exact trigger & source in the side panel, and overwrites the file with zeros upon your Secure Shred signature."
                  ),
                },
              ],
            },
            {
              id: "mod_10",
              icon: t("icon_cloud_upload", "cloud_upload"),
              overline: "MODULE 10 OF 12",
              badge: g("10. Static Edge"),
              title: g("Decentralized Static Edge Release & Catalog Engine"),
              footerMeta: g("MANIFEST.JSON • CATALOG.JSON • 6-PROVIDER AUTO-PUSH"),
              desc: g(
                "Zero-server update distribution for independent {Masons} and Tier 1–4 creators—supporting 1-click direct push, automatic SHA-256 lineage rollover, and in-place {Vault} upgrades."
              ),
              tip: g(
                "Use a single catalog.json URL across your entire {mod} portfolio so {Citizens} receive update pings for every {mod} from one static file."
              ),
              subCards: [
                {
                  id: "mod_10_c1",
                  icon: t("icon_cloud_upload", "cloud_upload"),
                  title: g("6-Provider 1-Click Direct Push"),
                  desc: g(
                    "Push manifest.json or catalog.json directly from the Rust backend to GitHub, GitHub Gist, GitLab/Codeberg, Neocities, WebDAV, or a Local Synced Folder."
                  ),
                },
                {
                  id: "mod_10_c2",
                  icon: t("icon_history", "history"),
                  title: g("Automatic previous_hashes Lineage Rollover"),
                  desc: g(
                    "Absorbs historical SHA-256 hashes from your Sandbox and remote manifest so existing {Citizens} are notified immediately when v1.1+ ships."
                  ),
                },
                {
                  id: "mod_10_c3",
                  icon: t("icon_find_replace", "find_replace"),
                  title: g("In-Place Lineage File Replacement"),
                  desc: g(
                    "Dropping an updated .zip automatically locates the older file by its previous_hashes lineage and replaces it in-place without leaving duplicate {mods}."
                  ),
                },
                {
                  id: "mod_10_c4",
                  icon: t("icon_lock", "lock"),
                  title: g("100% Local API Token Isolation"),
                  desc: g(
                    "Personal Access Tokens stay strictly on your local machine and are never transmitted to Sanctuary servers or bundled into exported .zip archives."
                  ),
                },
              ],
            },
            {
              id: "mod_11",
              icon: t("icon_schema", "schema"),
              overline: "MODULE 11 OF 12",
              badge: g("11. Schema & Lexicon"),
              title: g("Master Schema Studio & Lexicon Terminology Studio"),
              footerMeta: g("7 ENGINE PRESETS • 21 {GLOSSARY} TOKENS • ICON OVERRIDES"),
              desc: g(
                "Visual IDEs for engineering cross-platform game schemas (Windows & macOS) and hot-swapping all 1,700+ OS localization strings, dynamic glossary tokens, and Material icons."
              ),
              tip: g(
                "Click the book icon (Schema Codex / Lexicon Codex) in the studio header at any time for an interactive field-by-field reference."
              ),
              subCards: [
                {
                  id: "mod_11_c1",
                  icon: t("icon_terminal", "terminal"),
                  title: g("Cross-Platform Binaries, Routes & Config Watcher"),
                  desc: g(
                    "Map Windows (.exe) and macOS (.app) paths, custom secondary install_routes (.world, .asi, .dll), and config_extensions for live in-game config syncing."
                  ),
                },
                {
                  id: "mod_11_c2",
                  icon: t("icon_category", "category"),
                  title: g("Game-Agnostic {Mod} Categories & Exception Rules"),
                  desc: g(
                    "Define custom per-game {mod} categories and regex/keyword exception log diagnostic matchers directly inside the Master Schema JSON."
                  ),
                },
                {
                  id: "mod_11_c3",
                  icon: t("icon_translate", "translate"),
                  title: g("21 Dynamic {Glossary} Tokens & Smart Grammar"),
                  desc: g(
                    "Change {Mod}, {Vault}, or {Blueprint} once in Tab 1 to interpolate across 1,700+ strings with automatic casing and indefinite article ('a'/'an') grammar."
                  ),
                },
                {
                  id: "mod_11_c4",
                  icon: t("icon_apps", "apps"),
                  title: g("Guided Searchable Icon Override Builder"),
                  desc: g(
                    "Select any target OS icon from a searchable dropdown and pick a replacement Material Symbol with live Default → New glyph previews."
                  ),
                },
              ],
            },
            {
              id: "mod_12",
              icon: t("icon_handshake", "handshake"),
              overline: "MODULE 12 OF 12",
              badge: g("12. Spoke & Covenants"),
              title: g("Wayfinder Spoke Control, Covenants & Supporter Bridge"),
              footerMeta: g("PARTNERS AGREEMENT • CUT THE CORD • 0%-CUT DONATIONS"),
              desc: g(
                "Full community database sovereignty for Partner Spokes, transparent legal covenants, non-custodial 0%-cut community donations, and the $5 = +30 Days Dev Build pipeline."
              ),
              tip: g(
                "All Directives, Legal Covenants, Schemas, and Lexicons use local codebase files for offline backup while syncing live updates from the Hub database."
              ),
              subCards: [
                {
                  id: "mod_12_c1",
                  icon: t("icon_gavel", "gavel"),
                  title: g("Partners Agreement & Compliance Protocol"),
                  desc: g(
                    "Accessible anytime in Wayfinder Spoke Maintenance and required before submitting a Partner Spoke application on the Landing Page."
                  ),
                },
                {
                  id: "mod_12_c2",
                  icon: t("icon_link_off", "link_off"),
                  title: g("Unilateral 'Cut the Cord' Severance"),
                  desc: g(
                    "Double-click Cut the Cord in Wayfinder Hub to scrub your service key from the Hub while keeping 100% of your community's 36-table Supabase database."
                  ),
                },
                {
                  id: "mod_12_c3",
                  icon: t("icon_volunteer_activism", "volunteer_activism"),
                  title: g("0%-Cut Non-Custodial Community Donations"),
                  desc: g(
                    "Bind your community's own Stripe, Ko-fi, or OpenCollective checkout link in Spoke Control—Sanctuary OS takes 0% platform cut."
                  ),
                },
                {
                  id: "mod_12_c4",
                  icon: t("icon_system_update_alt", "system_update_alt"),
                  title: g("Daily Dev Builds & Cross-Platform Auto-Updater"),
                  desc: g(
                    "Supporters ($5 = +30 Days) and Partner team members receive automated Windows (.msi/.exe) and macOS (.dmg/.app.tar.gz) Dev Build updates."
                  ),
                },
              ],
            },
          ],
        },
        {
          id: "roles",
          icon: t("icon_admin_panel_settings", "admin_panel_settings"),
          label: g("6 TIERS"),
          value: g("Role Tiers"),
          cards: elevatedRolesCards,
        },
      ],
    };
  }

  if (slug === "phase_roadmap") {
    const roadmapCards: DirectiveBuilderCard[] = [
      {
        id: "phase_14",
        icon: t("icon_science", "science"),
        overline: g("PHASE 14 (V0.6.0) • NOVEMBER 2026 — ACTIVE ERA"),
        badge: g("ACTIVE PHASE"),
        title: g(
          "Multi-Engine Live Adapters, Save-Airgapped External Tool Bridge, Manager & Collection Migration, Guided Diagnostics & Cross-Platform {Vault} Companion"
        ),
        footerMeta: g(
          "External Tool Bridge (World Architect, CakeView, Sims 4 Studio, OpenIV), GTA V .rpf Isolation, FOMOD/Flavor Installer, MO2/Vortex Setup Importer, Cross-Platform Modlist/Collection Translator, Save Doctor, Crash Decoder, SteamOS/Proton, Patch Radar, Guided Queue, Ctrl+K & Conflict Radar 2.0"
        ),
        desc: g(
          "First-class External Modding & World-Building Tool Bridge with Hardware Save Airgapping inside {Lab}, live Multi-Engine Manifest Compilers & GTA V .rpf Copy-on-Write / LML isolation, Guided FOMOD & Flavor Package Installer, External Mod Manager Migration (MO2, Vortex, BG3MM, Sims 4 Mod Manager) without reinstalling, Cross-Platform Curated Modlist & Collection Translator into native {Blueprints}, Save-Game {Blueprint} Lock (Save Doctor), {Lab} Crash & Exception Decoder, SteamOS/Proton Prefix Auto-Resolver, Mobile/Web {Vault} Patch Radar, Guided Side Browser Batch Queue, Global Ctrl+K Command Palette, Conflict Radar 2.0 Resource Diffing, In-Game Config Diff Timeline, and an automated Vitest + Cargo Test regression suite."
        ),
        status: "active",
        subCards: [
          {
            id: "phase_14_m1",
            icon: t("icon_handyman", "handyman"),
            title: g("External Creator & World-Building Tool Bridge + {Lab} Save Airgap"),
            desc: g(
              "Launch World Architect, CakeView, Sims 4 Studio, OpenIV, and xEdit inside a Save-Airgapped {Lab} session—physically isolating legacy saves while developing worlds or testing {mods} and restoring saves automatically on exit."
            ),
            pending: true,
          },
          {
            id: "phase_14_m2",
            icon: t("icon_extension", "extension"),
            title: g("Multi-Engine Manifest Compilers & GTA V .rpf / mods/ Isolation"),
            desc: g(
              "Native compilers for BG3 (modsettings.lsx), Creation Engine (plugins.txt), Cyberpunk 2077 (REDmod), SMAPI (manifest.json), plus GTA V .rpf Copy-on-Write hardlink staging and OpenIV / LML VFS integration."
            ),
            pending: true,
          },
          {
            id: "phase_14_m3",
            icon: t("icon_inventory_2", "inventory_2"),
            title: g("Guided Multi-Option Package Installer (FOMOD & {Mason} Flavor Wizard)"),
            desc: g(
              "Intercepts multi-variant archives on drop/download with a Guided Package Installer SidePanel that parses fomod/ModuleConfig.xml and {Mason} Dossier Flavors with auto-checked compatibility patches."
            ),
            pending: true,
          },
          {
            id: "phase_14_m4",
            icon: t("icon_drive_file_move", "drive_file_move"),
            title: g("External Mod Manager Migration & Out-of-Tree Setup Importer (MO2 / Vortex / BG3MM)"),
            desc: g(
              "Imports existing Mod Organizer 2, Vortex, BG3MM, and Sims 4 Mod Manager staging folders without reinstalling—reading meta.ini, modlist.txt, plugins.txt, and deployment manifests to reconstruct every profile as a Sanctuary {Blueprint} via Zero-Duplication Hardlink, Move, or Copy."
            ),
            pending: true,
          },
          {
            id: "phase_14_m5",
            icon: t("icon_swap_horiz", "swap_horiz"),
            title: g("Cross-Platform Curated Modlist & Collection Translator (External Lists → {Blueprints})"),
            desc: g(
              "Imports Nexus Collections (collection.json), Wabbajack manifests, MO2 profile exports, and CurseForge/Modrinth packs directly into native Sanctuary {Blueprints}—binding existing {Vault} {mods} by DNA hash and routing missing items into the Guided Side Browser Queue."
            ),
            pending: true,
          },
          {
            id: "phase_14_m6",
            icon: t("icon_health_and_safety", "health_and_safety"),
            title: g("Save-Game {Blueprint} Lock & Pre-Launch Save Doctor"),
            desc: g(
              "Pairs save states with the deployed {Blueprint} DNA manifest (.sanctuary-save-manifest.json) and warns before launch if switching {Blueprints} removed {mods} required by the latest save."
            ),
            pending: true,
          },
          {
            id: "phase_14_m7",
            icon: t("icon_troubleshoot", "troubleshoot"),
            title: g("{Citizen}-Facing {Lab} Crash & Exception Decoder (Desktop + Web)"),
            desc: g(
              "Watches schema log_files (lastException.txt, Papyrus, SMAPI, redscript) and cross-references stack traces against installed {Vault} {mods} and KnownExceptionRules to surface plain-English Crash Diagnosis Cards."
            ),
            pending: true,
          },
          {
            id: "phase_14_m8",
            icon: t("icon_sports_esports", "sports_esports"),
            title: g("SteamOS / Linux Proton Prefix Auto-Resolver (Steam Deck Parity)"),
            desc: g(
              "Parses Steam libraryfolders.vdf and maps ~/Documents and %APPDATA% Master Schema tokens into each game's Proton compatdata/<AppID>/pfx/ prefix for out-of-the-box Steam Deck and Linux support."
            ),
            pending: true,
          },
          {
            id: "phase_14_m9",
            icon: t("icon_phonelink_ring", "phonelink_ring"),
            title: g("Mobile PWA / Web 'My {Vault} Patch Radar' (Zero-PII Cloud Companion)"),
            desc: g(
              "Optional encrypted sync of active {Blueprint} DNA hashes so {Citizens} on Mobile PWA or Web immediately see which of their installed {mods} broke in a game patch and can queue updates remotely."
            ),
            pending: true,
          },
          {
            id: "phase_14_m10",
            icon: t("icon_playlist_play", "playlist_play"),
            title: g("Realtime Queue Handshake & Side Browser Guided Batch Updater"),
            desc: g(
              "Adds a Guided Update Queue (1 of N) stepper bar to SidePanelBrowser.tsx that opens each {Mason}'s download page sequentially and auto-advances the instant the Rust download interceptor verifies the archive."
            ),
            pending: true,
          },
          {
            id: "phase_14_m11",
            icon: t("icon_terminal", "terminal"),
            title: g("Global Ctrl+K / Cmd+K Liquid Glass Command Palette (All Platforms)"),
            desc: g(
              "Instant fuzzy-search Command Palette across Desktop, Web, and Mobile PWA for jumping to installed {Vault} {mods}, activating {Blueprints}, navigating all 18 OS views, and triggering {Mason}/Architect actions."
            ),
            pending: true,
          },
          {
            id: "phase_14_m12",
            icon: t("icon_compare", "compare"),
            title: g("Conflict Radar 2.0 — Resource-Level Overlap & Diff Inspector"),
            desc: g(
              "Breaks down conflicting files inside ConflictResolutionSidebar.tsx into Visual/Texture Overrides (DDS/Mesh) vs. Gameplay Tuning/Script Collisions (XML/SimData) with side-by-side Monaco XML diffing."
            ),
            pending: true,
          },
          {
            id: "phase_14_m13",
            icon: t("icon_difference", "difference"),
            title: g("In-Game Config Watcher → Workbench Interactive Diff Timeline"),
            desc: g(
              "Automatically captures live in-game .cfg/.ini/.json/.toml modifications intercepted by the Rust Config Watcher as timestamped [In-Game Engine Edit] snapshots inside the {Citizen}'s Workbench Diff Timeline."
            ),
            pending: true,
          },
          {
            id: "phase_14_m14",
            icon: t("icon_verified", "verified"),
            title: g("Automated Protocol Regression & Stability Suite (Vitest + Cargo Test)"),
            desc: g(
              "Automated test coverage for compileLoadOrder, check_heuristic_malware_detailed (21+17 rules & Zlib/Zstd DBPF streams), interpolateGlossaryTokens, and parseMarkdownToDirectiveSchema."
            ),
            pending: true,
          },
        ],
      },
      {
        id: "phase_13",
        icon: t("icon_auto_awesome", "auto_awesome"),
        overline: g("PHASE 13 (V5.8) • OCTOBER 2026"),
        badge: g("COMPLETED"),
        title: g(
          "Sovereign Multi-Engine Studios, Universal 21+17 Heuristics & Bilateral Cloud Sync"
        ),
        footerMeta: g(
          "Master Schema & Lexicon Studios, Guided Icon Builder, Universal AV, Static Edge Auto-Push & Partner Covenants"
        ),
        desc: g(
          "Delivered the 4-Tab Master Schema Studio & Lexicon Terminology Studio with Guided Icon Overrides and Interactive Codex Guides, upgraded the Universal Heuristic Scanner (21 Core + 17 Spoke rules with Zlib/Zstd DBPF & Base64/Hex deobfuscation), added 6-provider Static Edge Direct Push, Readiness-Gated Partner Applications with mandatory Covenants, and Bilateral Codebase ↔ Cloud Sync."
        ),
        status: "completed",
        subCards: [
          {
            id: "phase_13_m1",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Master Schema Studio, macOS Pathing & Dynamic Config Watcher"),
            desc: g(
              "7 multi-game architecture presets, Windows (.exe) & macOS (.app) coordinate mapping, secondary install_routes, game-agnostic mod_categories, and live config_extensions syncing."
            ),
            pending: false,
          },
          {
            id: "phase_13_m2",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Lexicon Visual Studio, Guided Icon Override Builder & Codex Guides"),
            desc: g(
              "Searchable Material Symbol override builder with Default → New glyph previews, themed checkboxes, parity validation bar, and interactive Schema & Lexicon Codex drawers."
            ),
            pending: false,
          },
          {
            id: "phase_13_m3",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Universal Multi-Format Heuristic Scanner (21 Core + 17 Spoke Rules)"),
            desc: g(
              "In-memory Zlib/Zstd DBPF stream decompression, Base64/Hex deobfuscation, Move-mode source disposition tracking, and Zero-PII Threat Manifest reporting."
            ),
            pending: false,
          },
          {
            id: "phase_13_m4",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Decentralized Static Edge Direct Push & Multi-Mod catalog.json"),
            desc: g(
              "1-click OS Auto-Push to GitHub, Gist, GitLab/Codeberg, Neocities, WebDAV, and Local Folders with automatic previous_hashes lineage rollover."
            ),
            pending: false,
          },
          {
            id: "phase_13_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Readiness-Gated Partner Onboarding, Covenants & Supporter Pipeline"),
            desc: g(
              "Mandatory Partners Agreement & Compliance Protocol review before Partner Spoke application, 0%-cut community donations, $5 = +30 Days Dev Builds, and Bilateral Codebase ↔ Cloud Sync."
            ),
            pending: false,
          },
        ],
      },
      {
        id: "phase_12",
        icon: t("icon_rocket_launch", "rocket_launch"),
        overline: g("PHASE 12 • JULY 15 – OCTOBER 2026"),
        badge: g("COMPLETED"),
        title: g(
          "Agnostic Future — Multi-Workspace, Sanctuary V6 Liquid Glass & Web PWA"
        ),
        footerMeta: g(
          "{Citizens} Workbench / {Mason} IDE, Lexicon Revamp, Sanctuary Partners, V6 Liquid Glass & Website V2"
        ),
        desc: g(
          "Dual-Vision {Mason} IDE & Cloud Lexicons, Multi-Workspace Master Schemas & the 0%-cut Sanctuary Partners Agreement, the Sanctuary V6 3D Liquid Glass Engine & 18-Section Revamp, and Website V2 / Mobile PWA."
        ),
        status: "completed",
        subCards: [
          {
            id: "phase_12_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("{Citizens} Workbench & {Mason} IDE 2.0"),
            desc: g(
              "Named Version Timeline entries, simultaneous Dual-Vision (Visual + Raw Monaco) split editing, Author Mode scaffolding, and the side-by-side Lexicon Builder."
            ),
          },
          {
            id: "phase_12_m6",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Lexicon Revamp & Cloud Schemas"),
            desc: g(
              "Deduplicated all localization dictionaries, moved default Lexicon JSONs to the cloud database, and added official Sanctuary & Community badges."
            ),
          },
          {
            id: "phase_12_m7",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Multi-Workspace & Sanctuary Partners"),
            desc: g(
              "Shared Core App and SSO with per-game Master Schemas, 100% Partner DB ownership ('Cut the Cord'), 0%-cut Partner Donations, and 1-File Standalone Forking."
            ),
          },
          {
            id: "phase_12_m8",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Sanctuary V6 & Liquid Glass Engine"),
            desc: g(
              "4-layer 3D Refractive Liquid Glass Engine, revamped Default Themes + The Sims 4 ('Plumbob Crystal') Partner Chameleon, and Chameleon Theme Forge 2.0."
            ),
          },
          {
            id: "phase_12_m10",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Dynamic Alert Tiles & 18-Section Revamp"),
            desc: g(
              "Floating 2-Pill Title Bar, Hover Dock, 5 Dynamic Alert Stat Tiles (Permissions, Global, Critical, System, Updates), and a full 18-section UI overhaul."
            ),
          },
          {
            id: "phase_12_m9",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Website V2, Mobile PWA & Remote Queuing"),
            desc: g(
              "Unified single-codebase Web OS & PWA (sanctuaryos.net/sims4) with live Comm-Link, Nexus, Support Desk, Command Hubs, and Web-to-PC {Blueprint} queuing."
            ),
          },
          {
            id: "phase_12_m11",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Schema-Driven Load Order Compiler"),
            desc: g(
              "Declarative Master Game Schemas powering multi-strategy topological compilation across folder priority, manifest lists, numeric prefixes, and timestamps."
            ),
          },
          {
            id: "phase_12_m12",
            icon: t("icon_check_circle", "check_circle"),
            title: g("FIDO2 Passkey {Vault} & Quarantine Lockdown"),
            desc: g(
              "Hardware WebAuthn Passkey gates for Elevated Hubs, Full-OS Malware Quarantine SidePanel Lockdown, Silent Updater, and Bilateral Directives Sync."
            ),
          },
        ],
      },
      {
        id: "phase_11",
        icon: t("icon_public", "public"),
        overline: g("PHASE 11 • MAY 17 – JULY 13, 2026"),
        badge: g("COMPLETED"),
        title: g(
          "Technical Debt Repayment, {Citizens} Workbench & The Agnostic Sprint"
        ),
        footerMeta: g(
          "Native Intake & Support Desk, {Citizens} Workbench 1.0 & Game-Agnostic Kernel"
        ),
        desc: g(
          "Integrated {Mason} & Architect intake forms, native Bug Reports & Support Ticket Dossiers, {Citizens} Workbench 1.0 (.cfg/.ini/.json + Monaco IDE + Sanctuary Templates), full 11-section Lexicon/UI sweep, and the Agnostic Sprint."
        ),
        status: "completed",
        subCards: [
          {
            id: "phase_11_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Native Intake Forms & Support Desk"),
            desc: g(
              "Integrated {Mason} UUID registration, Architect intake forms, Bug Reports, and encrypted Support Ticket dossiers directly into the Desktop App."
            ),
          },
          {
            id: "phase_11_m6",
            icon: t("icon_check_circle", "check_circle"),
            title: g("{Citizens} Workbench 1.0 & Sanctuary Templates"),
            desc: g(
              "Automatic .cfg, .ini, and .json detection in the {Vault} with an embedded Monaco IDE and visual slider/toggle Schema Mapping."
            ),
          },
          {
            id: "phase_11_m7",
            icon: t("icon_check_circle", "check_circle"),
            title: g("The Agnostic Sprint & Master Schemas"),
            desc: g(
              "Extracted all hardcoded Sims 4 (.package / .ts4script) checks across 17 frontend modules and the Rust backend into dynamic Master JSON Schemas."
            ),
          },
          {
            id: "phase_11_m8",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Integrated Side Browser & {Vault} Intercept"),
            desc: g(
              "Embedded multi-tab Side Browser that automatically intercepts .zip, .rar, .7z, .package, and .ts4script downloads straight into the {Vault}."
            ),
          },
          {
            id: "phase_11_m9",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Full-Stack Security & Forensic Audit"),
            desc: g(
              "Hardened Rust path-traversal guards (is_safe_user_file_path), Supabase Row-Level Security (RLS) policies, and immutable append-only audit logs."
            ),
          },
          {
            id: "phase_11_m10",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Oversight {Mason} Linker & Lexicon Sweep"),
            desc: g(
              "Deployed the Oversight {Mason} Linker, automatic Unregistered {Vault} syncing on Nexus verification, and a full 11-section Lexicon/UI sweep."
            ),
          },
        ],
      },
      {
        id: "phase_10",
        icon: t("icon_palette", "palette"),
        overline: g("PHASE 10 • MAY 10 – MAY 16, 2026"),
        badge: g("COMPLETED"),
        title: g(
          "Post-Alpha Revamp, Visual Protocol Manager & Senior Architect Mass Update"
        ),
        footerMeta: g(
          "Dev Sandbox, Visual Protocol Schema, Theme Forge & Mass Triage"
        ),
        desc: g(
          "Launched the isolated Dev Sandbox & 'Sync to Network' creator pipeline, visual database-schema Protocol Manager, Folder Structure builder, Senior Architect Mass Update console, The Nexus registry, and Chameleon Theme Forge."
        ),
        status: "completed",
        subCards: [
          {
            id: "phase_10_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Isolated Dev Sandbox & Sync to Network"),
            desc: g(
              "Dedicated local Dev Sandbox folder bypassing radar hash churn for WIP {mods}, paired with 1-click 'Sync to Network' release promotion."
            ),
          },
          {
            id: "phase_10_m6",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Visual Protocol & Folder Structure Builder"),
            desc: g(
              "Database-schema visual Protocol Manager (Core & Addons, Flavors, Dependencies, DLC) and visual Folder Structure builder enforced by Sanitize {Vault}."
            ),
          },
          {
            id: "phase_10_m7",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Senior Architect Mass Update & Filters"),
            desc: g(
              "Bulk post-patch triage console for Senior Architects alongside 'Game Version', 'Currently Eligible', and 'Exclude Unowned DLC' filters."
            ),
          },
          {
            id: "phase_10_m8",
            icon: t("icon_check_circle", "check_circle"),
            title: g("The Nexus Discovery Registry"),
            desc: g(
              "Global metadata catalog for {Mods}, {Blueprints}, Lexicons, Chameleons, and Templates with automatic game patch and DLC compatibility filtering."
            ),
          },
          {
            id: "phase_10_m9",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Chameleon Theme Forge & Holo Sandbox"),
            desc: g(
              "Interactive Theme Forge suite featuring a multi-stop atmospheric Background Builder, Dark/Light adaptation, and live Holo Sandbox previewing."
            ),
          },
          {
            id: "phase_10_m10",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Hot-Swappable Lexicon Protocol"),
            desc: g(
              "Word-as-a-Service localization engine routing 100% of UI labels and icons through hot-swappable JSON dictionaries."
            ),
          },
        ],
      },
      {
        id: "phase_9",
        icon: t("icon_admin_panel_settings", "admin_panel_settings"),
        overline: g("PHASE 9 • MAY 8 – MAY 9, 2026"),
        badge: g("COMPLETED"),
        title: g(
          "Infrastructure Finalization, Laboratory Diagnostics & Command Hubs"
        ),
        footerMeta: g(
          "Proving Grounds Simulation, macOS Universal Pipeline & Command Hubs"
        ),
        desc: g(
          "Transitioned Homestead Proving Grounds into a live simulation laboratory with real-time log monitoring, deployed the Senior Architect & Wayfinder Command Hubs, automated signed macOS Universal (.dmg) builds, and enforced Florida Compliance Tiers 1–4."
        ),
        status: "completed",
        subCards: [
          {
            id: "phase_9_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Live Proving Grounds & macOS Pipeline"),
            desc: g(
              "Real-time crash log monitoring with 1-click conflict rule pushing in the Homestead Lab, plus signed macOS Universal (.dmg) GitHub Actions builds."
            ),
          },
          {
            id: "phase_9_m6",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Five Elevated Command Hubs"),
            desc: g(
              "Dedicated ElevatedHubLayout command centers for {Mason} Workshop, Architect Console, Oversight Command, Wayfinder Operations, and Keepers Core."
            ),
          },
          {
            id: "phase_9_m7",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Claimable Support Desk Ticket Dossiers"),
            desc: g(
              "Interactive ticket dossiers equipped with PII-scrubbed crash logs, response macros, and cross-tier escalation between Architects and Oversight."
            ),
          },
          {
            id: "phase_9_m8",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Florida Compliance Tiers 1–4"),
            desc: g(
              "Automated public feed scrubbing and Cloud {Blueprint} hash purge triggers protecting public discovery while preserving local {Vault} freedom."
            ),
          },
        ],
      },
      {
        id: "phase_8",
        icon: t("icon_cell_tower", "cell_tower"),
        overline: g("PHASE 8 • MAY 7 – MAY 8, 2026"),
        badge: g("COMPLETED"),
        title: g(
          "Standardized Lexicons, Dynamic Engine Recognition & DEFCON Shield"
        ),
        footerMeta: g(
          "Rust Rip Protocol, Auto-Sanitization Launch & DEFCON 1 Shield"
        ),
        desc: g(
          "Engineered the Rust 'Rip Protocol' for dynamic engine version recognition, Auto-Sanitization Launch purging stale crash logs & caches, Global Lexicon Extraction, the {Blueprint} Architect Load Order UI, and the real-time DEFCON 1 patch shield."
        ),
        status: "completed",
        subCards: [
          {
            id: "phase_8_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Rust 'Rip Protocol' & Auto-Sanitization"),
            desc: g(
              "Dynamic engine version recognition parsing Default.ini and PE headers in Rust, plus pre-launch purging of stale LastException and cache files."
            ),
          },
          {
            id: "phase_8_m6",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Global Comm-Link Broadcast Feed"),
            desc: g(
              "Real-time community feed supporting WYSIWYG/Markdown dispatches, multi-level threaded replies, and dedicated Discover & Following tabs."
            ),
          },
          {
            id: "phase_8_m7",
            icon: t("icon_check_circle", "check_circle"),
            title: g("DEFCON 1 Pre-Patch Network Shield"),
            desc: g(
              "Real-time network listener that intercepts game launches during breaking engine patches to prompt an emergency {Backups} backup."
            ),
          },
          {
            id: "phase_8_m8",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Tier 5 Malware Scanner & Secure Shred"),
            desc: g(
              "Byte-level heuristic malware scanner, {Citizen}-signed 3-pass Secure Shredding, and the privacy-first hardware_bans Nuclear Override."
            ),
          },
        ],
      },
      {
        id: "phase_7",
        icon: t("icon_construction", "construction"),
        overline: g("PHASE 7 • MAY 6, 2026"),
        badge: g("COMPLETED"),
        title: g(
          "Core Architecture, {Backups} Compression & Windows MSI Pipeline"
        ),
        footerMeta: g(
          "Nested {Vault} Taxonomy, 78 GB → 24 GB Engine Compression & Automated MSI Builds"
        ),
        desc: g(
          "Deployed the nested {Vault} directory hierarchy, optimized {Backups} Engine Core compression (78 GB → 24 GB) with <50s rollbacks, automated Windows .msi GitHub Actions builds, and integrated Scout Dossiers into Conflict Radar."
        ),
        status: "completed",
        subCards: [
          {
            id: "phase_7_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Nested {Vault} Taxonomy & 24 GB Compression"),
            desc: g(
              "Self-healing {Vault} hierarchy (Backups/World, Backups/Engine, Data/cache, Quarantine) and 78 GB → 24 GB Engine Core compression with <50s rollbacks."
            ),
          },
          {
            id: "phase_7_m6",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Schema-Driven Visual Config Workbench"),
            desc: g(
              "Visual configuration studio rendering raw {mod} settings as interactive sliders and toggles synchronized live with a Monaco Raw Editor."
            ),
          },
          {
            id: "phase_7_m7",
            icon: t("icon_check_circle", "check_circle"),
            title: g("{Mason} Workshop & Collections Orchestrator"),
            desc: g(
              "Creator suite featuring an isolated Dev Sandbox, Collections Builder, and relational Protocol Orchestrator for Twins, Flavors, and Dependencies."
            ),
          },
          {
            id: "phase_7_m8",
            icon: t("icon_check_circle", "check_circle"),
            title: g("In-Process Rust PE Executable Parser"),
            desc: g(
              "Native Rust pelite binary parser extracting genuine patch versions directly from .exe headers with zero antivirus false positives."
            ),
          },
        ],
      },
      {
        id: "phase_6",
        icon: t("icon_science", "science"),
        overline: g("PHASE 6 • MAY 3 – MAY 5, 2026"),
        badge: g("COMPLETED"),
        title: g(
          "Codebase Modularization, Comm-Link Ledger & Homestead Proving Grounds"
        ),
        footerMeta: g(
          "Creator Following Feed, App.tsx Modularization & Nuke Sandbox"
        ),
        desc: g(
          "Launched the Creator Following system and real-time Comm-Link discovery ledger, modularized App.tsx into dedicated domain views, extracted Yeet Cascade casualty tracking, and built the 100% Nuke Isolation Proving Grounds."
        ),
        status: "completed",
        subCards: [
          {
            id: "phase_6_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Creator Following & Domain Modularization"),
            desc: g(
              "Added the Creator Following feed to Comm-Link, modularized App.tsx into dedicated domain views, and extracted Yeet Cascade casualty tracking."
            ),
          },
          {
            id: "phase_6_m6",
            icon: t("icon_check_circle", "check_circle"),
            title: g("100% Nuke Injection Sandbox"),
            desc: g(
              "Temporarily strips active {Vault} symlinks during Proving Grounds runs to inject only the isolated test subject and its mandatory dependencies."
            ),
          },
          {
            id: "phase_6_m7",
            icon: t("icon_check_circle", "check_circle"),
            title: g("1v1 Conflict Stability Arena"),
            desc: g(
              "Pits two suspected colliding {mods} head-to-head in an airgapped test environment while monitoring real-time engine stability."
            ),
          },
          {
            id: "phase_6_m8",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Automated Crash Log Harvester & Scrubber"),
            desc: g(
              "Captures lastException.txt crash logs automatically and scrubs local filesystem paths and PII (scrub_user_data_from_log) before sharing."
            ),
          },
        ],
      },
      {
        id: "phase_5",
        icon: t("icon_history", "history"),
        overline: g("PHASE 5 • MAY 1 – MAY 3, 2026"),
        badge: g("COMPLETED"),
        title: g(
          "Defensive Protocols, Symlink Airgap 2.1 & {Mason} Protocol Manager"
        ),
        footerMeta: g(
          "Real-Time Airgap Watcher, DNA Duplicate Intercept & Time Capsule"
        ),
        desc: g(
          "Implemented Symlink Airgap 2.1 real-time .cfg/.ini file watching in Rust, SHA-256 DNA duplicate interception, {Mason} Protocol Manager 1.0, intelligent Google Search fallback, and hardlink {Backups} snapshots."
        ),
        status: "completed",
        subCards: [
          {
            id: "phase_5_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Real-Time Airgap Watcher & DNA Intercept"),
            desc: g(
              "Non-blocking Rust notify thread syncing live in-game .cfg/.ini edits back to the {Vault}, plus SHA-256 duplicate interception on drop."
            ),
          },
          {
            id: "phase_5_m6",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Dual-State {Backups} Architecture"),
            desc: g(
              "Independently snapshots World State (Saves, Tray & Settings) and Engine Core (Game Installation Binaries) before patches or {mod} tests."
            ),
          },
          {
            id: "phase_5_m7",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Zero-Bloat OS Hardlink Snapshot Engine"),
            desc: g(
              "Pairs native NTFS/POSIX hardlink deduplication with .tar.zst Zstandard compression so unchanged files consume zero extra disk space."
            ),
          },
          {
            id: "phase_5_m8",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Differential Rollback Comparator"),
            desc: g(
              "High-speed diff_backup engine that restores only modified bytes and purges rogue files without re-copying the entire installation."
            ),
          },
        ],
      },
      {
        id: "phase_4",
        icon: t("icon_radar", "radar"),
        overline: g("PHASE 4 • APRIL 28 – MAY 1, 2026"),
        badge: g("COMPLETED"),
        title: g(
          "The Global Network, Radiant Light Mode & Cloud {Blueprints}"
        ),
        footerMeta: g(
          "Radiant ThemeProvider, SNC-XXXXX Cloud Codes & Conflict Radar"
        ),
        desc: g(
          "Expanded beyond dark-only Bunker to Radiant Light Mode with real-time ThemeProvider switching, launched 6-digit Cloud {Blueprint} transmissions (SNC-XXXXX), added the Architect Signature gate, and established Conflict Radar Severity 1–4."
        ),
        status: "completed",
        subCards: [
          {
            id: "phase_4_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Radiant Mode, ThemeProvider & Signature Gate"),
            desc: g(
              "Introduced Radiant (Light Mode) and real-time ThemeProvider profile switching, 6-digit Cloud {Blueprint} codes, and the Architect Signature gate."
            ),
          },
          {
            id: "phase_4_m6",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Severity 1–4 Collision Matrix"),
            desc: g(
              "Proactive conflict classifier distinguishing minor overlaps from Severity 3 Tuning Overlaps and Severity 4 Fatal Clashes."
            ),
          },
          {
            id: "phase_4_m7",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Priority Tier Folders & Dynamic Resource.cfg"),
            desc: g(
              "Multi-tier override directories (Sanctuary1–Sanctuary3) paired with automated Resource.cfg priority depth compilation."
            ),
          },
          {
            id: "phase_4_m8",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Architect Console & Crowd-Sourced Scout Queue"),
            desc: g(
              "Dedicated moderation console for verifying community Scout Dossier submissions behind Copilot confirmation gates."
            ),
          },
        ],
      },
      {
        id: "phase_3",
        icon: t("icon_hub", "hub"),
        overline: g("PHASE 3 • APRIL 15 – APRIL 28, 2026"),
        badge: g("COMPLETED"),
        title: g("System Rip, Deep Yeet 2.0 & Logic Intelligence"),
        footerMeta: g(
          "Deep Yeet 2.0, UTF-16 Version Ripper, Twin Bonds & Copilot"
        ),
        desc: g(
          "Engineered Deep Yeet 2.0 recursive dependency cascade scanning, the Rust UTF-16 byte-filter System Version Ripper, Twin Bond synchronized script/package links, and the Copilot Philosophy halting for manual {Citizen} signature."
        ),
        status: "completed",
        subCards: [
          {
            id: "phase_3_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Deep Yeet 2.0 & UTF-16 Version Ripper"),
            desc: g(
              "Recursive dependency cascade scanner queuing orphaned addons on master removal, paired with the Rust UTF-16 binary version ripper."
            ),
          },
          {
            id: "phase_3_m6",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Atomic Logic Triumvirate"),
            desc: g(
              "Relational {mod} rules enforcing Highlander Flavor eviction, bidirectional .package/.ts4script Twin bonds, and Recursive Chain-Link Dependencies."
            ),
          },
          {
            id: "phase_3_m7",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Orphaned Addon Cascade Protection"),
            desc: g(
              "Intercepts master library removal and halts for the {Citizen}'s manual signature before cleanly unequipping or removing dependent child add-ons."
            ),
          },
          {
            id: "phase_3_m8",
            icon: t("icon_check_circle", "check_circle"),
            title: g("SNCXXX Cloud {Blueprints} & Ghosted States"),
            desc: g(
              "6-character alphanumeric Cloud {Blueprint} share codes, portable offline JSON exports, and automatic Missing DLC Ghosting diagnostics."
            ),
          },
        ],
      },
      {
        id: "phase_2",
        icon: t("icon_map", "map"),
        overline: g("PHASE 2 • APRIL 10 – APRIL 15, 2026"),
        badge: g("COMPLETED"),
        title: g("Visual Uplink, Glassmorphism 1.0 & The Quarantine Zone"),
        footerMeta: g(
          "Glassmorphism 1.0, Quarantine Bio-Hazard Sector & Symlink Airgap"
        ),
        desc: g(
          "Introduced the Glassmorphism 1.0 backdrop-blur engine, constructed the dedicated bio-hazard Quarantine Zone for isolating malicious files, and unified the app into a layered desktop OS experience backed by Symlink Airgap and SQLite caching."
        ),
        status: "completed",
        subCards: [
          {
            id: "phase_2_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Glassmorphism 1.0 & Bio-Hazard Quarantine"),
            desc: g(
              "Translucent backdrop-blur glass containers with deep elevation shadows and a dedicated Quarantine Zone for isolating and shredding threats."
            ),
          },
          {
            id: "phase_2_m6",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Symlink Airgap 2.5 Projection Engine"),
            desc: g(
              "Projects active {mods} from the isolated {Vault} into the live game directory via zero-copy OS symlinks in milliseconds."
            ),
          },
          {
            id: "phase_2_m7",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Sub-Second SQLite Delta Scanner"),
            desc: g(
              "Local .sanctuary_cache.db SQLite engine using mtime-first delta checks to index 5,000+ {mod} Vaults in sub-second sweeps."
            ),
          },
          {
            id: "phase_2_m8",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Self-Healing {Vault} Sanitizer & Profiles"),
            desc: g(
              "Automatically maintains the isolated {Vault} directory structure and powers instant local {Blueprint} loadout switching."
            ),
          },
        ],
      },
      {
        id: "phase_1",
        icon: t("icon_inventory_2", "inventory_2"),
        overline: g("PHASE 1 • APRIL 1 – APRIL 10, 2026"),
        badge: g("COMPLETED"),
        title: g(
          "Bunker Initialization, Cartographer Protocol & SHA-256 DNA Pathing"
        ),
        footerMeta: g(
          "First-Boot Cartographer Recon & Millisecond Delta Caching"
        ),
        desc: g(
          "Initialized the Tauri v2 + Rust + React 18 architecture, built The Cartographer automated first-boot reconnaissance scanner for Game Bin & {Mods} directories, and engineered SHA-256 DNA delta caching."
        ),
        status: "completed",
        subCards: [
          {
            id: "phase_1_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Cartographer Recon & Millisecond Delta Cache"),
            desc: g(
              "Automated first-boot drive reconnaissance locating Game Bin & {Mods} folders, paired with SHA-256 delta caching for instant startup."
            ),
          },
          {
            id: "phase_1_m6",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Tauri v2 + Rust + React 18 Kernel"),
            desc: g(
              "Foundational desktop OS architecture combining a native multi-threaded Rust backend with React 18, TypeScript, and Zustand."
            ),
          },
          {
            id: "phase_1_m7",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Automated Coordinate Discovery Wizard"),
            desc: g(
              "Guided first-launch Cartographer setup linking Game Binaries, live {Mods} folders, and airgapped Bunker {Vault} coordinates."
            ),
          },
          {
            id: "phase_1_m8",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Streaming SHA-256 DNA & Archive Inspector"),
            desc: g(
              "Multi-threaded Rust cryptographic hashing and in-memory DBPF/ZIP header inspection without extracting archives to disk."
            ),
          },
        ],
      },
    ];

    return {
      slug: "phase_roadmap",
      _schemaVersion: CURRENT_DIRECTIVE_SCHEMA_VERSION,
      title: g("Engineering Phase Roadmap (Phase 14 → Phase 1)"),
      summary: g(
        "Interactive reverse-chronological engineering timeline tracking Sanctuary OS from Phase 14 (V0.6.0 Agnostic Multi-Engine Expansion) and Phase 13 (V5.8 Multi-Engine Studios & Bilateral Cloud Sync) down to Phase 1."
      ),
      tabs: [
        {
          id: "all",
          icon: t("icon_timeline", "timeline"),
          label: g("14 Phases"),
          value: g("Full Timeline"),
          cards: roadmapCards,
        },
      ],
    };
  }

  if (slug === "forking_guide") {
    return {
      slug: "forking_guide",
      _schemaVersion: CURRENT_DIRECTIVE_SCHEMA_VERSION,
      title: g("Forking & Spoke Provisioning Matrix"),
      summary: g(
        "Interactive schematic for deploying a Sovereign Community Spoke (SANCTUARY-UPLINK://), reviewing Partner Covenants, launching a 1-file Standalone Codebase Fork (src/supabase.ts), or building cross-platform Master Schemas."
      ),
      tabs: [
        {
          id: "spoke",
          icon: t("icon_hub", "hub"),
          label: g("STEP 1"),
          value: g("Spoke Setup"),
          cards: [
            {
              id: "fork_spoke_setup",
              icon: t("icon_hub", "hub"),
              overline: g("OFFICIAL PARTNER NETWORK • ZERO CODE EDITS"),
              badge: t("active", "Active"),
              title: g("Connect a Sovereign Community Spoke in 3 Steps"),
              footerMeta: "SANCTUARY-UPLINK:// • schema.sql",
              desc: g(
                "Join the official Sanctuary OS multi-game network while retaining 100% ownership of your community's Supabase PostgreSQL database. No client forking or code edits required."
              ),
              subCards: [
                {
                  id: "fork_spoke_s1",
                  icon: t("icon_database", "database"),
                  title: g("Step 1: Initialize Your Supabase Spoke (schema.sql)"),
                  desc: g(
                    "Create a free Supabase project, open the SQL Editor, and run schema.sql. This single script provisions all 36 community tables, RLS policies, immutable audit triggers, and role functions."
                  ),
                },
                {
                  id: "fork_spoke_s2",
                  icon: t("icon_key", "key"),
                  title: g("Step 2: Generate Your SANCTUARY-UPLINK:// Bundle"),
                  desc: g(
                    "In Keepers Core -> Active Workspaces (or Wayfinder Hub), paste your Supabase URL, Anon Key, and Service Role Key to generate an encrypted SANCTUARY-UPLINK:// handshake bundle."
                  ),
                },
                {
                  id: "fork_spoke_s3",
                  icon: t("icon_rocket_launch", "rocket_launch"),
                  title: g("Step 3: Verify Handshake & Provision Founding Wayfinder"),
                  desc: g(
                    "Click 'Test Handshake & Verify Schema'. The game-gateway Edge Function verifies table readiness, seeds global_network_status, and automatically promotes your founder account to Wayfinder."
                  ),
                },
              ],
            },
            {
              id: "fork_spoke_covenants",
              icon: t("icon_gavel", "gavel"),
              overline: g("PARTNER APPLICATION • SOVEREIGN COVENANTS"),
              badge: t("verified", "Verified"),
              title: g("Readiness-Gated Partner Application & Sovereign Covenants"),
              footerMeta: "Partners Agreement • Compliance Protocol",
              desc: g(
                "Prospective community leaders can apply directly from the Landing Page after inspecting and accepting the Sanctuary Partners Agreement and Compliance Protocol."
              ),
              subCards: [
                {
                  id: "fork_cov_s1",
                  icon: t("icon_handshake", "handshake"),
                  title: g("Mandatory Partners Agreement & Compliance Review"),
                  desc: g(
                    "Both covenants open in an interactive overlay drawer during Step 1 of the Partner Application and remain permanently accessible inside Wayfinder Hub -> Spoke Maintenance."
                  ),
                },
                {
                  id: "fork_cov_s2",
                  icon: t("icon_link_off", "link_off"),
                  title: g("Community-Initiated Severance ('Cut the Cord')"),
                  desc: g(
                    "A Wayfinder can double-click 'Cut the Cord' in Wayfinder Hub at any time—writing an immutable audit log, setting is_active = false, and scrubbing the Spoke's service key from the Hub."
                  ),
                },
                {
                  id: "fork_cov_s3",
                  icon: t("icon_volunteer_activism", "volunteer_activism"),
                  title: g("0% Platform Tax & Non-Custodial Community Donations"),
                  desc: g(
                    "Sanctuary OS takes 0% of {mason} Patreon/Ko-fi revenue and 0% of Partner community donations. Export your SANCTUARY-UPLINK:// bundle at any time."
                  ),
                },
              ],
            },
          ],
        },
        {
          id: "standalone",
          icon: t("icon_call_split", "call_split"),
          label: g("FORK MODES"),
          value: g("Standalone & Hub"),
          cards: [
            {
              id: "fork_mode_standalone",
              icon: t("icon_call_split", "call_split"),
              overline: g("MODE 1 • 1-DATABASE STANDALONE"),
              badge: g("1-File Fork"),
              title: g("1-File Standalone Fork (Single Database)"),
              footerMeta: "schema.sql • src/supabase.ts",
              desc: g(
                "Run your own independent Sanctuary OS build backed by a single Supabase project (schema.sql) and a 1-file edit in src/supabase.ts with zero Edge Functions."
              ),
              subCards: [
                {
                  id: "fork_m1_s1",
                  icon: t("icon_bolt", "bolt"),
                  title: g("1. Unified Auth & Direct RPC Engine"),
                  desc: g(
                    "When mode is set to 'standalone', Sanctuary OS automatically routes all 15 secure_* RPCs directly against your single Supabase database with zero Edge Function dependency."
                  ),
                },
                {
                  id: "fork_m1_s2",
                  icon: t("icon_verified", "verified"),
                  title: g("2. Automatic Founding Wayfinder Promotion"),
                  desc: g(
                    "The on_auth_user_created_spoke trigger in schema.sql detects when your standalone database has 0 Wayfinders and automatically promotes the very first registered user to Founding Wayfinder."
                  ),
                },
                {
                  id: "fork_m1_s3",
                  icon: t("icon_storage", "storage"),
                  title: g("3. Transparent OS-to-Spoke Table Mapping"),
                  desc: g(
                    "All internal queries to global broadcasts, polls, and support categories automatically map to your single database's system_broadcasts, dispatch_poll_votes, and support_tickets tables."
                  ),
                },
              ],
            },
            {
              id: "fork_mode_hub",
              icon: t("icon_hub", "hub"),
              overline: g("MODE 2 • FULL HUB & SPOKE FEDERATION"),
              badge: g("Hub & Spokes"),
              title: g("Full Hub & Spoke Multi-Game Fork (Hub + Child Spokes)"),
              footerMeta: "schema_os.sql + schema.sql • game-gateway",
              desc: g(
                "Self-host your own central Sanctuary OS Hub (schema_os.sql + game-gateway Edge Function) that authenticates users once and routes across multiple independent community Spoke databases (schema.sql)."
              ),
              subCards: [
                {
                  id: "fork_m2_s1",
                  icon: t("icon_memory", "memory"),
                  title: g("1. Provision Core Hub Database (schema_os.sql)"),
                  desc: g(
                    "Create your central Hub Supabase project and run schema_os.sql in the SQL Editor. This provisions global SSO profiles, FIDO2 user_passkeys, sanctuary_games, sanctuary_schemas, system_directives, and keeper_heuristic_signatures."
                  ),
                },
                {
                  id: "fork_m2_s2",
                  icon: t("icon_cloud_done", "cloud_done"),
                  title: g("2. Deploy game-gateway Edge Function"),
                  desc: g(
                    "Deploy supabase/functions/game-gateway to your Hub project (supabase functions deploy game-gateway). It validates Hub JWTs, checks roles, and executes cross-database mutations against each Spoke."
                  ),
                },
                {
                  id: "fork_m2_s3",
                  icon: t("icon_code", "code"),
                  title: g("3. Point src/supabase.ts at Your Core Hub"),
                  desc: g(
                    "Keep mode set to 'hub_and_spoke' in src/supabase.ts (or set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env) pointing to your central Hub project's URL and Anon Key."
                  ),
                },
                {
                  id: "fork_m2_s4",
                  icon: t("icon_storage", "storage"),
                  title: g("4. Provision & Link Child Spoke Databases (schema.sql)"),
                  desc: g(
                    "For each game community, create a separate Supabase project, run schema.sql, and register its URL, Anon Key, and Service Role Key (or SANCTUARY-UPLINK:// bundle) in Keepers Core -> Active Workspaces."
                  ),
                },
              ],
            },
            {
              id: "fork_mode_schema",
              icon: t("icon_schema", "schema"),
              overline: g("MODE 3 • MASTER GAME SCHEMAS & CROSS-PLATFORM"),
              badge: g("7 Engine Presets"),
              title: g("Master Schema Studio & Windows/macOS Build Pipeline"),
              footerMeta: "sims4.json • Universal Darwin .dmg & Windows .msi",
              desc: g(
                "Adapt Sanctuary OS to any game engine without touching Rust or React code by configuring a declarative Master Schema JSON in Wayfinder or Keepers IDE."
              ),
              subCards: [
                {
                  id: "fork_m3_s1",
                  icon: t("icon_schema", "schema"),
                  title: g("7 Built-In Engine Architecture Presets"),
                  desc: g(
                    "1-click templates for DBPF + Python, REDengine 4, Creation Engine, RAGE / OpenIV, Larian .pak, SMAPI, and Universal engines."
                  ),
                },
                {
                  id: "fork_m3_s2",
                  icon: t("icon_laptop_mac", "laptop_mac"),
                  title: g("Windows (.exe) & macOS (.app) Native Parity"),
                  desc: g(
                    "Supports Windows %USERPROFILE% and macOS ~/Documents & /Applications/*.app bundles, plus universal-apple-darwin .dmg builds."
                  ),
                },
              ],
            },
          ],
        },
        {
          id: "sql",
          icon: t("icon_database", "database"),
          label: g("STEP 3"),
          value: g("SQL Schemas"),
          cards: [
            {
              id: "fork_sql_spoke",
              icon: t("icon_storage", "storage"),
              overline: g("Spoke & Standalone DB • 36 Tables"),
              badge: "schema.sql",
              title: g("schema.sql (36 Tables)"),
              footerMeta: "Community Spoke & Standalone Fork SQL",
              desc: g(
                "Complete community registry schema (mods, blueprints, masons, conflicts, tickets, heuristics, RLS policies, and Founding Wayfinder trigger)."
              ),
              subCards: [],
            },
            {
              id: "fork_sql_hub",
              icon: t("icon_dns", "dns"),
              overline: g("Core Hub Federation DB • SSO & Security"),
              badge: "schema_os.sql",
              title: g("schema_os.sql (Core Hub DB)"),
              footerMeta: "Central Multi-Game Federation SQL",
              desc: g(
                "Central multi-game federation schema (global SSO profiles, FIDO2 passkeys, sanctuary_games directory, master schemas, global lexicons/themes, and core heuristics)."
              ),
              subCards: [],
            },
          ],
        },
      ],
    };
  }

  if (slug === "master_architecture") {
    return {
      slug: "master_architecture",
      _schemaVersion: CURRENT_DIRECTIVE_SCHEMA_VERSION,
      title: g("Master Architecture & Feature Blueprint"),
      summary: g(
        "Deep-dive interactive explorer into the Tauri v2 Rust core, Master Schema & Lexicon Visual Studios, Hub-and-Spoke Cloud Federation with Bilateral Codebase Sync, Symlink Airgap 2.5, and the Universal 21+17 Heuristic Scanner."
      ),
      tabs: [
        {
          id: "p1",
          icon: t("icon_memory", "memory"),
          label: g("PILLAR 1"),
          value: g("Core & Glass"),
          cards: [
            {
              id: "arch_p1",
              icon: t("icon_memory", "memory"),
              overline: g("ARCHITECTURE PILLAR 1 • CORE ENGINE, OPTICS & STUDIOS"),
              badge: t("active", "Active"),
              title: g(
                "Tauri v2 Rust Kernel, Liquid Glass V3, Schema Studio & Lexicon Engine"
              ),
              footerMeta: "Tauri v2 • React 18 • Liquid Glass V3 • Win & Mac",
              desc: g(
                "Sanctuary OS combines a zero-overhead native Rust backend across Windows and macOS with a GPU-pinned 3D refractive Liquid Glass interface, a 4-Tab Master Schema Studio, and a 21-token Lexicon Engine."
              ),
              subCards: [
                {
                  id: "arch_p1_c1",
                  icon: t("icon_auto_awesome", "auto_awesome"),
                  title: g("Frontend & Liquid Glass V3 UI"),
                  desc: g(
                    "Zero-Tearing Liquid Glass Engine (.glass-panel / .glass-surface) with 6 live Theme Forge optical sliders (Opacity, Blur, Saturation, Rim Light, Glare, Depth)."
                  ),
                },
                {
                  id: "arch_p1_c2",
                  icon: t("icon_memory", "memory"),
                  title: g("Tauri v2 Native Rust Core (Win & Mac)"),
                  desc: g(
                    "Native Tauri v2 Rust core: pelite PE & macOS Info.plist version ripper, SQLite .sanctuary_cache.db mtime delta scanner, WebAuthn FIDO2 bridge, and .msi/.dmg auto-updater."
                  ),
                },
                {
                  id: "arch_p1_c3",
                  icon: t("icon_schema", "schema"),
                  title: g("Master Schema Visual Studio & 7 Engine Presets"),
                  desc: g(
                    "Declarative Master Schema JSON editor governing binaries, secondary install_routes, config_extensions watcher, load order strategies, mod_categories, and exception matchers."
                  ),
                },
                {
                  id: "arch_p1_c4",
                  icon: t("icon_translate", "translate"),
                  title: g("Lexicon Studio & Guided Icon Overrides"),
                  desc: g(
                    "21 Dynamic {Glossary} Tokens interpolated across 1,700+ keys with smart article grammar, plus the Guided Searchable Material Icon Override Builder."
                  ),
                },
              ],
            },
          ],
        },
        {
          id: "p2",
          icon: t("icon_hub", "hub"),
          label: g("PILLAR 2"),
          value: g("Hub & Spokes"),
          cards: [
            {
              id: "arch_p2",
              icon: t("icon_hub", "hub"),
              overline: g("ARCHITECTURE PILLAR 2 • FEDERATION, SYNC & STATIC EDGE"),
              badge: t("active", "Active"),
              title: g(
                "Decoupled Hub-and-Spoke Cloud, Bilateral Sync & Static Edge Polling"
              ),
              footerMeta: "schema_os.sql • schema.sql • Static Edge • Cloud Sync",
              desc: g(
                "Uses bundled codebase files as the offline baseline while syncing Directives, Legal Covenants, Schemas, and Lexicons live from the Hub database—paired with community-owned Spoke DBs and 6-provider Static Edge polling."
              ),
              subCards: [
                {
                  id: "arch_p2_c1",
                  icon: t("icon_hub", "hub"),
                  title: g("Core OS Hub vs. Sovereign Community Spoke DBs"),
                  desc: g(
                    "Core OS Hub (schema_os.sql) governs global SSO, FIDO2 passkeys, sanctuary_schemas, keeper_heuristic_signatures & system_directives; Spokes (schema.sql) own 100% of their 36 community tables."
                  ),
                },
                {
                  id: "arch_p2_c2",
                  icon: t("icon_sync", "sync"),
                  title: g("Offline Codebase Baseline + Live Cloud Sync"),
                  desc: g(
                    "First-time launch and offline sessions boot from bundled .md, schema, and lexicon files; connected clients pull live updates from the Hub DB without requiring an app update."
                  ),
                },
                {
                  id: "arch_p2_c3",
                  icon: t("icon_cloud_done", "cloud_done"),
                  title: g("Decentralized Static Edge Direct Push (manifest.json & catalog.json)"),
                  desc: g(
                    "6-provider 1-click OS Auto-Push and HTTP GET polling with automatic previous_hashes lineage rollover and in-place file upgrades."
                  ),
                },
                {
                  id: "arch_p2_c4",
                  icon: t("icon_favorite", "favorite"),
                  title: g("0%-Cut Partner Covenants & $5 = +30 Days Supporter Pipeline"),
                  desc: g(
                    "Readiness-gated Partner Spoke onboarding with mandatory Partners Agreement & Compliance Protocol review, 0%-cut community donations, and Stripe-verified Daily Dev Builds."
                  ),
                },
              ],
            },
          ],
        },
        {
          id: "p3",
          icon: t("icon_shield", "shield"),
          label: g("PILLAR 3"),
          value: g("{Vault} & Lab"),
          cards: [
            {
              id: "arch_p3",
              icon: t("icon_inventory_2", "inventory_2"),
              overline: g("ARCHITECTURE PILLAR 3 • {VAULT}, COMPILER & WORKBENCH"),
              badge: t("active", "Active"),
              title: g(
                "Symlink Airgap 2.5, Config Watcher, Topological Compiler & Workbench"
              ),
              footerMeta: "Symlink Airgap • Config Watcher • Load Order Compiler",
              desc: g(
                "Protects your game installation via zero-copy symlink projection, automatic root config deduplication, schema-driven topological load order compilation, and 60 FPS visual config editing."
              ),
              subCards: [
                {
                  id: "arch_p3_c1",
                  icon: t("icon_inventory_2", "inventory_2"),
                  title: g("Symlink Airgap 2.5, Custom Routes & Dynamic Config Watcher"),
                  desc: g(
                    "Projects {mods} from {Vault}/{Mods}/ into live game folders and secondary install_routes while syncing in-game config_extensions writes back to the {Vault}."
                  ),
                },
                {
                  id: "arch_p3_c2",
                  icon: t("icon_layers", "layers"),
                  title: g("Topological Load Order Compiler (compileLoadOrder)"),
                  desc: g(
                    "Schema-Driven Load Order Compiler (folder_priority + dynamic Resource.cfg, manifest_list, numeric_prefix, timestamp) with topological cycle breaking."
                  ),
                },
                {
                  id: "arch_p3_c3",
                  icon: t("icon_tune", "tune"),
                  title: g("{Citizen}'s Workbench & 2-Column Timeline Diff"),
                  desc: g(
                    "60 FPS 2-column Visual Config Editor with Category Pill Bar, Min/Max range steppers, No-Code Template Builder, and side-by-side Visual/Raw Diff."
                  ),
                },
                {
                  id: "arch_p3_c4",
                  icon: t("icon_science", "science"),
                  title: g("Homestead {Lab} & Hardlink {Backups}"),
                  desc: g(
                    "100% Nuke sandbox isolation, 1v1 Conflict Stability testing, schema-driven exception log diagnosis, and zero-bloat hardlink snapshots."
                  ),
                },
              ],
            },
          ],
        },
        {
          id: "p4",
          icon: t("icon_admin_panel_settings", "admin_panel_settings"),
          label: g("PILLAR 4"),
          value: g("6-Tier & AV"),
          cards: [
            {
              id: "arch_p4",
              icon: t("icon_admin_panel_settings", "admin_panel_settings"),
              overline: g("ARCHITECTURE PILLAR 4 • GOVERNANCE, PASSKEYS & MALWARE LOCKDOWN"),
              badge: t("active", "Active"),
              title: g(
                "6-Tier Clearance Matrix, 2-Column Hub Overviews, FIDO2 Passkeys & Malware Lockdown"
              ),
              footerMeta: "6 Role Tiers • FIDO2 Passkey {Vault} • 21+17 Rust AV",
              desc: g(
                "Enforces strict separation between Spoke and Core Hub clearances, hardware-backed WebAuthn Passkey gates, and full-OS Tier 5 Malware quarantine."
              ),
              subCards: [
                {
                  id: "arch_p4_c1",
                  icon: t("icon_admin_panel_settings", "admin_panel_settings"),
                  title: g("6-Tier Clearance Hierarchy ({Citizen} to Keeper)"),
                  desc: g(
                    "Decouples Game Spoke roles ({Citizen}, Verified {Mason}, Architect, Oversight, Wayfinder) from Global Core OS Hub roles (Keeper)."
                  ),
                },
                {
                  id: "arch_p4_c2",
                  icon: t("icon_space_dashboard", "space_dashboard"),
                  title: g("Standardized 2-Column Recent & Anomalies Hub Overviews"),
                  desc: g(
                    "Every Elevated Hub opens to a 2-column Recent and Anomalies overview surfacing live schema/lexicon edits and actionable configuration alerts."
                  ),
                },
                {
                  id: "arch_p4_c3",
                  icon: t("icon_passkey", "passkey"),
                  title: g("FIDO2 Passkey & TOTP Security {Vault}"),
                  desc: g(
                    "Hardware-bound WebAuthn Passkeys (Windows Hello, Touch ID, YubiKey) and TOTP gates protect Elevated Hubs inside a right-hand SidePanel."
                  ),
                },
                {
                  id: "arch_p4_c4",
                  icon: t("icon_gpp_bad", "gpp_bad"),
                  title: g("Dual-Tier Heuristic Scanner & Quarantine Lockdown"),
                  desc: g(
                    "Merges 21 Core + 17 Spoke rules with Zlib/Zstd decompression to lock the OS shell on Tier 5 Malware and enforce a {Citizen}-signed Secure Shred."
                  ),
                },
              ],
            },
          ],
        },
      ],
    };
  }

  // Default: master_protocols
  return {
    slug: "master_protocols",
    _schemaVersion: CURRENT_DIRECTIVE_SCHEMA_VERSION,
    title: g("Master Protocol List & 6-Tier Clearance Matrix"),
    summary: g(
      "Interactive directory of all 33 Sanctuary OS operational protocols across 4 Domains, Florida Compliance Tiers 0–5, Universal 21+17 Heuristic Antivirus rules, and the 6-Tier Role Clearance Hierarchy."
    ),
    tabs: [
      {
        id: "roles",
        icon: t("icon_admin_panel_settings", "admin_panel_settings"),
        label: g("6 TIERS"),
        value: g("Role Matrix"),
        cards: elevatedRolesCards,
      },
      {
        id: "compliance",
        icon: t("icon_shield", "shield"),
        label: g("TIERS 0–5"),
        value: g("Safety & AV"),
        cards: [
          {
            id: "comp_t0",
            icon: t("icon_check_circle", "check_circle"),
            overline: g("TIER 0 • PUBLIC SAFE"),
            badge: "TIER 0",
            title: g("Standard Verified & General Audience"),
            footerMeta: g("TIER 0 • PUBLIC SAFE"),
            desc: g(
              "Eligible for full public indexing across The Nexus, shared Cloud {Blueprints} (SNCXXX), and public {Mason} Profiles. Full {Citizen} Support Desk access."
            ),
            subCards: [],
          },
          {
            id: "comp_t12",
            icon: t("icon_visibility_off", "visibility_off"),
            overline: g("TIERS 1–2 • EXPLICIT / ILLICIT"),
            badge: "TIERS 1–2",
            title: g(
              "Adult (NSFW) & Illicit Themes — Local & Static Edge Allowed, Public Scrubbed"
            ),
            footerMeta: g("TIERS 1–2 • EXPLICIT / ILLICIT"),
            desc: g(
              "Permitted in local Vaults and decentralized Static Edge manifests (manifest.json / catalog.json). Automatically scrubbed from public Nexus feeds and stripped from public Cloud {Blueprints}. Eligible for Support Desk with automated 'Dirty Log' sanitization."
            ),
            subCards: [],
          },
          {
            id: "comp_t34",
            icon: t("icon_lock", "lock"),
            overline: g("TIERS 3–4 • SEVERE / RESTRICTED"),
            badge: "TIERS 3–4",
            title: g("Extreme Violence & Taboo Content — Triggers {Vault} Lock"),
            footerMeta: g("TIERS 3–4 • SEVERE / RESTRICTED"),
            desc: g(
              "Permitted strictly within isolated local Vaults and Static Edge manifests. Scrubbed from all public feeds and Cloud {Blueprints}. Equipping or storing Tier 3–4 {mods} engages a {Vault} Lock that restricts {Citizen} Support Desk ticket submissions until removed."
            ),
            subCards: [],
          },
          {
            id: "comp_t5",
            icon: t("icon_gpp_bad", "gpp_bad"),
            overline: g("TIER 5 • CONFIRMED MALWARE"),
            badge: "TIER 5",
            title: g(
              "Zero-Choice OS Lockdown, Move-Mode Isolation & Secure Shred"
            ),
            footerMeta: g("TIER 5 • CONFIRMED MALWARE"),
            desc: g(
              "Malicious payloads, webhook exfiltrators, credential stealers, or unauthorized executables detected via SHA-256 DNA or Universal 21+17 Rust Heuristics. Immediately halts game launch, moves/isolates the file in Quarantine, locks the OS shell, and requires a Secure Shred signature."
            ),
            subCards: [],
          },
          {
            id: "comp_av",
            icon: t("icon_security", "security"),
            overline: g(
              "UNIVERSAL 21+17 RUST AV • DBPF & BYTECODE DECOMPRESSION"
            ),
            badge: "21+17 RULES",
            title: g(
              "Universal Multi-Format Heuristic & Decompression Scanner"
            ),
            footerMeta: "21 Core + 17 Spoke Signatures • Zlib/Zstd/Base64",
            desc: g(
              "Combines 21 Core Heuristics (keeper_heuristic_signatures) and 17+ Spoke Heuristics (heuristic_signatures) with in-memory Zlib/Zstd DBPF decompression and Base64/Hex deobfuscation to inspect .zip, .package, .ts4script, .asi, .dll, .exe, and .pyc bytecode."
            ),
            subCards: [],
          },
          {
            id: "comp_nuclear",
            icon: t("icon_policy", "policy"),
            overline: g("NUCLEAR OVERRIDE & ZERO-PII THREAT MANIFEST"),
            badge: "PRIVACY-FIRST",
            title: g(
              "Decoupled Hardware Ban Ledger & Anonymous Threat Telemetry"
            ),
            footerMeta: "hardware_bans • Zero-PII Threat Manifest",
            desc: g(
              "Sanctuary OS never tracks Hardware IDs on normal users. Quarantined files offer an optional Zero-PII Threat Manifest report (SHA-256 + matched rule IDs only), while the 5-click Nuclear Override records a one-way hash in hardware_bans and severs cloud access."
            ),
            subCards: [],
          },
        ],
      },
      {
        id: "list",
        icon: t("icon_policy", "policy"),
        label: g("33 RULES"),
        value: g("OS Protocols"),
        cards: [
          {
            id: "proto_d1",
            icon: t("icon_hub", "hub"),
            overline: g("DOMAIN 1 • 10 PROTOCOLS"),
            badge: "DOMAIN 1",
            title: g(
              "System Foundation, Cross-Platform (Windows + macOS) & Bilateral Sync Protocols"
            ),
            footerMeta: g("DOMAIN 1 • 10 PROTOCOLS"),
            desc: g(
              "Cross-platform binary reconnaissance, macOS TCC/Gatekeeper handling, Master Schema & Lexicon Studios, Turnkey Spoke Uplinks, Bilateral Severance, and Codebase-to-Hub Sync."
            ),
            subCards: [
              {
                id: "proto_d1_r1",
                icon: t("icon_explore", "explore"),
                title: g("The Cartographer"),
                desc: g(
                  "Automated first-boot reconnaissance system that locates the Game Bin (executable_subdir), live {Mods} directory, and external {Vault} archive path across Windows and macOS."
                ),
              },
              {
                id: "proto_d1_r2",
                icon: t("icon_memory", "memory"),
                title: g("Cross-Platform Version Ripper (pelite + macOS Info.plist)"),
                desc: g(
                  "In-process Rust binary inspector that extracts genuine patch versions directly from Windows .exe PE headers and macOS .app/Contents/Info.plist without spawning external processes."
                ),
              },
              {
                id: "proto_d1_r3",
                icon: t("icon_laptop_mac", "laptop_mac"),
                title: g("macOS Full Disk Access & Gatekeeper Quarantine Protocol"),
                desc: g(
                  "Detects macOS TCC permission blocks on ~/Documents and ~/Library/Application Support, deep-links to macOS System Settings, and strips com.apple.quarantine attributes."
                ),
              },
              {
                id: "proto_d1_r4",
                icon: t("icon_schema", "schema"),
                title: g("100% Agnostic Master Schema & Secondary Install Route Protocol"),
                desc: g(
                  "Supports 7 pre-calibrated Engine Architecture Presets, secondary install_routes, dlc_subdirs, launch_args_dlc_mask_template, save_airgap_targets, and lab_verification.save_extensions."
                ),
              },
              {
                id: "proto_d1_r5",
                icon: t("icon_menu_book", "menu_book"),
                title: g("Master Schema & Lexicon Architecture Codex"),
                desc: g(
                  "Interactive in-app SidePanel manual with mode-switchable documentation and 2-column field reference grids explaining every schema and lexicon directive."
                ),
              },
              {
                id: "proto_d1_r6",
                icon: t("icon_translate", "translate"),
                title: g("Dynamic Glossary Token & Guided Icon Override Protocol"),
                desc: g(
                  "Interpolates 21 core domain tokens ({Mod}, {Vault}, {Blueprint}, {Mason}, {Citizen}, {Backups}, {Lab}, {Settings}) with automatic casing and article grammar, paired with a searchable Guided OS Icon Override Builder."
                ),
              },
              {
                id: "proto_d1_r7",
                icon: t("icon_key", "key"),
                title: g("Turnkey Spoke Uplink Handshake (SANCTUARY-UPLINK://)"),
                desc: g(
                  "1-click onboarding protocol (verify_and_bootstrap_spoke) that validates all 36 tables in schema.sql, seeds global_network_status, and auto-provisions the Founding Wayfinder."
                ),
              },
              {
                id: "proto_d1_r8",
                icon: t("icon_link_off", "link_off"),
                title: g("Bilateral Severance Protocol ('Cut the Cord')"),
                desc: g(
                  "Self-service sovereignty protocol executable by either a Keeper or a Spoke's Wayfinder that writes immutable audit logs and scrubs the Spoke's service key from the Hub."
                ),
              },
              {
                id: "proto_d1_r9",
                icon: t("icon_call_split", "call_split"),
                title: g("Single-File Standalone Fork Protocol (src/supabase.ts)"),
                desc: g(
                  "Allows any community to fork Sanctuary OS against a single schema.sql Supabase project by editing only SANCTUARY_CONFIG in src/supabase.ts."
                ),
              },
              {
                id: "proto_d1_r10",
                icon: t("icon_sync", "sync"),
                title: g("Bilateral Codebase-to-Keepers-Core Directive & Legal Sync"),
                desc: g(
                  "Automatically synchronizes core documentation directives and canonical legal/covenant documents between local repository .md files and Keepers Core."
                ),
              },
            ],
          },
          {
            id: "proto_d2",
            icon: t("icon_inventory_2", "inventory_2"),
            overline: g("DOMAIN 2 • 7 PROTOCOLS"),
            badge: "DOMAIN 2",
            title: g(
              "{Vault} Airgap, Config Deduplication, Static Edge & {Mod} Management Protocols"
            ),
            footerMeta: g("DOMAIN 2 • 7 PROTOCOLS"),
            desc: g(
              "Zero-copy symlink projection, root config deduplication, decentralized Static Edge polling, parent suite grouping, 3-tile studio, Workbench diffing, and live key validation."
            ),
            subCards: [
              {
                id: "proto_d2_r1",
                icon: t("icon_inventory_2", "inventory_2"),
                title: g("Symlink Airgap 2.5"),
                desc: g(
                  "Projects {mods} from the isolated {Vault}/{Mods}/ archive into the live game directory via zero-copy OS symlinks and secondary install_routes."
                ),
              },
              {
                id: "proto_d2_r2",
                icon: t("icon_sync_saved_locally", "sync_saved_locally"),
                title: g("Automatic Root Config Deduplication Protocol"),
                desc: g(
                  "Syncs newer timestamped config data into the {mod}'s subfolder copy, removes duplicate root config strays, and suppresses watcher feedback loops."
                ),
              },
              {
                id: "proto_d2_r3",
                icon: t("icon_cloud_done", "cloud_done"),
                title: g("Decentralized Static Edge Polling (manifest.json & override.json)"),
                desc: g(
                  "Binds a {mod}'s SHA-256 hash lineage in .sanctuary_cache.db and polls creator HTTP endpoints directly during Radar Sweeps for serverless updates."
                ),
              },
              {
                id: "proto_d2_r4",
                icon: t("icon_folder_copy", "folder_copy"),
                title: g("{Mod} Suite Parent Grouping"),
                desc: g(
                  "Automatically groups multi-file {mod} suites (e.g., MC Command Center and its submodules) into a single clean Parent Card with an expandable Linked Modules drawer."
                ),
              },
              {
                id: "proto_d2_r5",
                icon: t("icon_handyman", "handyman"),
                title: g("Unified 3-Tile {Mod} Studio"),
                desc: g(
                  "Standardized 3-step workflow (Details & Versions, Files & Folders, Rules & Upload) across both the {Mason} Workshop and Architect Console."
                ),
              },
              {
                id: "proto_d2_r6",
                icon: t("icon_tune", "tune"),
                title: g("Reimagined {Citizen}'s Workbench & Visual Timeline Diff"),
                desc: g(
                  "2-column 60 FPS Visual Config Editor with category pills, Min/Max range controls, No-Code Visual Template Builder, and 2-Column Interactive Timeline & Diff."
                ),
              },
              {
                id: "proto_d2_r7",
                icon: t("icon_verified", "verified"),
                title: g("Floating Liquid Glass Key Validator Alert"),
                desc: g(
                  "Real-time floating alert card in the Master Schema and Lexicon IDEs validating active files against the Keepers Core Default Schema or en-default.json Baseline."
                ),
              },
            ],
          },
          {
            id: "proto_d3",
            icon: t("icon_radar", "radar"),
            overline: g("DOMAIN 3 • 7 PROTOCOLS"),
            badge: "DOMAIN 3",
            title: g("Stability, Load Order & Atomic Logic Protocols"),
            footerMeta: g("DOMAIN 3 • 7 PROTOCOLS"),
            desc: g(
              "Topological load order compilation, Casual vs. Advanced Conflict Radar, Highlander Flavor eviction, Nuclear Family twins, Deep Yeet cascades, Homestead {Lab}, and hardlink {Backups}."
            ),
            subCards: [
              {
                id: "proto_d3_r1",
                icon: t("icon_layers", "layers"),
                title: g("Schema-Driven Load Order Engine (compileLoadOrder)"),
                desc: g(
                  "Compiles deployment priority using folder_priority, manifest_list, numeric_prefix, or timestamp, complete with topological sorting and DFS circular-loop breaking."
                ),
              },
              {
                id: "proto_d3_r2",
                icon: t("icon_radar", "radar"),
                title: g("Conflict Radar Casual vs. Advanced Mode"),
                desc: g(
                  "Casual Mode provides 1-click 'Pick a Winner' resolution for Severity 3 Tuning Overlaps; Advanced Mode unlocks directional Must Load After/Before rules."
                ),
              },
              {
                id: "proto_d3_r3",
                icon: t("icon_filter_1", "filter_1"),
                title: g("The Highlander Rule"),
                desc: g(
                  "Automatically evicts rival Flavor files when equipping a chosen Flavor."
                ),
              },
              {
                id: "proto_d3_r4",
                icon: t("icon_join_inner", "join_inner"),
                title: g("Nuclear Family Cohesion (Twins)"),
                desc: g(
                  "Bidirectionally links companion .package and .ts4script files so they equip and unequip together."
                ),
              },
              {
                id: "proto_d3_r5",
                icon: t("icon_delete_sweep", "delete_sweep"),
                title: g("Recursive Dependencies (Chain-Link) & Deep Yeet 2.0"),
                desc: g(
                  "Automatically equips required master {mods} when enabling an add-on, and intercepts master {mod} deletion to queue all dependent child {mods}."
                ),
              },
              {
                id: "proto_d3_r6",
                icon: t("icon_science", "science"),
                title: g("100% Nuke Injection & 1v1 Stability Arena (Homestead {Lab})"),
                desc: g(
                  "Isolates vanilla saves via save_airgap_targets, strips active symlinks to test suspect {mods} in total isolation, and diagnoses crash logs using schema-driven exception_rules."
                ),
              },
              {
                id: "proto_d3_r7",
                icon: t("icon_history", "history"),
                title: g("Incremental Hardlink {Backups} & Differential Rollback"),
                desc: g(
                  "Snapshots World State and Engine Core using OS hardlinks so unchanged files consume 0 extra bytes, restoring via differential byte comparison."
                ),
              },
            ],
          },
          {
            id: "proto_d4",
            icon: t("icon_shield", "shield"),
            overline: g("DOMAIN 4 • 7 PROTOCOLS"),
            badge: "DOMAIN 4",
            title: g(
              "Security, FIDO2 Passkeys, Non-Custodial Supporter Bridge & Quarantine Protocols"
            ),
            footerMeta: g("DOMAIN 4 • 7 PROTOCOLS"),
            desc: g(
              "FIDO2 Passkey gates, 0%-cut Partner & {Mason} Supporter Bridge, 21+17 Multi-Format Heuristic Scanner, Full-OS Quarantine Lockdown, Florida Compliance Tiers 1–4, DEFCON 1, and Nuclear Override."
            ),
            subCards: [
              {
                id: "proto_d4_r1",
                icon: t("icon_passkey", "passkey"),
                title: g("FIDO2 Passkey & TOTP Security {Vault} (SecurityVaultSidePanel)"),
                desc: g(
                  "Requires hardware-bound WebAuthn/FIDO2 Passkeys or TOTP verification for all Elevated Clearances, locking Elevated Hubs inside a right-hand SidePanel until verified."
                ),
              },
              {
                id: "proto_d4_r2",
                icon: t("icon_volunteer_activism", "volunteer_activism"),
                title: g("Non-Custodial Supporter Bridge & Community Donations"),
                desc: g(
                  "Connects Partner Spoke communities and Verified {Masons} directly to their own payment processors with a 0% Sanctuary cut, crediting +30 days of Daily Dev Builds per $5 donated."
                ),
              },
              {
                id: "proto_d4_r3",
                icon: t("icon_security", "security"),
                title: g("Dual-Tier Multi-Format Heuristic Scanner"),
                desc: g(
                  "Merges global Core Heuristics and community Spoke Heuristics using pre-compiled OnceLock Rust regex sets to scan ZIP containers, raw binaries, and .pyc/.pyo bytecode."
                ),
              },
              {
                id: "proto_d4_r4",
                icon: t("icon_gpp_bad", "gpp_bad"),
                title: g("Full-OS Quarantine SidePanel Lockdown & External Secure Shred"),
                desc: g(
                  "Confirmed Tier 5 Malware locks the entire OS shell, displays the exact Triggered By rule and Detection Source, and requires a {Citizen}'s Signature for multi-pass Secure Shred."
                ),
              },
              {
                id: "proto_d4_r5",
                icon: t("icon_visibility_off", "visibility_off"),
                title: g("Florida Compliance Tiers 1–4 & {Blueprint} Auto-Purge"),
                desc: g(
                  "Permits Tiers 1–4 in local Vaults while scrubbing them from public Nexus feeds and automatically stripping flagged hashes from Cloud {Blueprints}."
                ),
              },
              {
                id: "proto_d4_r6",
                icon: t("icon_warning", "warning"),
                title: g("DEFCON 1 Network Shield"),
                desc: g(
                  "Real-time Supabase listener on global_network_status that intercepts game launches during breaking game patches and forces a Pre-Patch {Backups} snapshot."
                ),
              },
              {
                id: "proto_d4_r7",
                icon: t("icon_policy", "policy"),
                title: g("The Nuclear Override & Decoupled hardware_bans"),
                desc: g(
                  "Revealed by clicking the {Settings} subtitle 5 times; bypasses local quarantine at the cost of recording the machine's hardware hash in hardware_bans and revoking cloud access."
                ),
              },
            ],
          },
        ],
      },
    ],
  };
}
