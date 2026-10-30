import { useState, useRef, useMemo, useEffect, useLayoutEffect } from "react";
import { EditorContent, Editor } from "@tiptap/react";
import { useLexicon } from "../../LexiconContext";
import {
  ActionButton,
  DashboardStatTile,
  HoverTooltip,
  UniversalGroup,
} from "../../shared";
import IconPicker from "../../IconPicker";
import {
  parseMarkdownIntoReleaseSections,
  ParsedReleaseSection,
  ParsedReleaseCard,
} from "../ReleaseNotesShowcase";
import { DispatchPollBuilder, DispatchPollData } from "./DispatchPollAndMeta";

function AutoResizeTextarea({
  value,
  onChange,
  placeholder,
  className = "",
  minRows = 3,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  className?: string;
  minRows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = () => {
    const el = ref.current;
    if (!el) return;
    let scrollParent: HTMLElement | null = el.parentElement;
    while (
      scrollParent &&
      scrollParent.scrollHeight <= scrollParent.clientHeight
    ) {
      scrollParent = scrollParent.parentElement;
    }
    const prevScrollTop = scrollParent ? scrollParent.scrollTop : 0;
    el.style.height = "0px";
    const nextHeight = Math.max(el.scrollHeight, minRows * 22);
    el.style.height = `${nextHeight}px`;
    if (scrollParent) {
      scrollParent.scrollTop = prevScrollTop;
    }
  };

  useLayoutEffect(() => {
    adjustHeight();
  }, [value, minRows]);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let prevWidth = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== prevWidth) {
        prevWidth = el.clientWidth;
        adjustHeight();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [minRows]);

  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={`resize-none overflow-hidden ${className}`}
    />
  );
}

export type PostEditorMode = "visual" | "wysiwyg" | "markdown";

export interface LinkedAssetItem {
  type: string;
  id: string;
  label: string;
  rawTag: string;
}

export function extractLinkedAssetsFromMarkdown(markdown: string): LinkedAssetItem[] {
  if (!markdown) return [];
  const regex =
    /(?:\\?\[ICON:[a-zA-Z0-9_-]+\\?\]\s*)?\\?\[((?:\\?\[ICON:[a-zA-Z0-9_-]+\\?\]|[^\]])+?)\\?\]\(asset:\/\/([a-zA-Z0-9_-]+)\/([^)]+)\)/gi;
  const items: LinkedAssetItem[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(markdown)) !== null) {
    const rawLabel = match[1] || "";
    const cleanedLabel = rawLabel
      .replace(/\\?\[ICON:[a-zA-Z0-9_-]+\\?\]/gi, "")
      .replace(
        /^(?:Artifact|Mod|Blueprint|Play Set|Theme|Chameleon|Template|Lexicon)\s*:\s*/i,
        ""
      )
      .replace(/^[\s:—–\\-]+/, "")
      .replace(/\\+$/, "")
      .trim();
    const type = match[2].trim().toLowerCase();
    const id = match[3].trim();
    const label = cleanedLabel || id;
    const key = `${type}:${id}`;
    if (!seen.has(key)) {
      seen.add(key);
      items.push({
        label,
        type,
        id,
        rawTag: match[0],
      });
    }
  }
  return items;
}

export function serializeReleaseSectionsToMarkdown(
  doc: {
    introTitle: string;
    introIcon?: string;
    intro: string;
    introImages?: string[];
    sections: ParsedReleaseSection[];
  },
  existingMarkdown?: string
): string {
  const parts: string[] = [];

  if (doc.introTitle.trim()) {
    const iconPrefix = doc.introIcon ? `[ICON:${doc.introIcon}] ` : "";
    parts.push(`## ${iconPrefix}${doc.introTitle.trim()}`);
  }
  if (doc.intro.trim()) {
    parts.push(doc.intro.trim());
  }
  if (doc.introImages && doc.introImages.length > 0) {
    parts.push(doc.introImages.map((src) => `![](${src})`).join("\n\n"));
  }

  for (const section of doc.sections) {
    const secBlocks: string[] = [];
    if (section.title.trim()) {
      const secIconPrefix = section.icon ? `[ICON:${section.icon}] ` : "";
      secBlocks.push(`### ${secIconPrefix}${section.title.trim()}`);
    }
    if (section.description && section.description.trim()) {
      secBlocks.push(section.description.trim());
    }

    const bulletLines: string[] = [];
    const postBulletProseBlocks: string[] = [];
    const codeBlocks: string[] = [];
    const hasStructuredCards = section.cards.some(
      (c) =>
        Boolean(c.title?.trim()) ||
        Boolean(c.icon) ||
        Boolean(c.subItems && c.subItems.length > 0)
    );

    for (let cIdx = 0; cIdx < section.cards.length; cIdx++) {
      const card = section.cards[cIdx];
      if (card.codeBlock && card.codeBlock.trim()) {
        codeBlocks.push(`\`\`\`\n${card.codeBlock.trim()}\n\`\`\``);
      }
      const cardTitle = (card.title || "").trim();
      const cardIconPrefix = card.icon ? `[ICON:${card.icon}] ` : "";
      const cleanParagraphs = (card.paragraphs || [])
        .map((p) => p.trim())
        .filter(Boolean);
      const hasSubs = Boolean(card.subItems && card.subItems.length > 0);

      // If this is an untitled prose card following structured bullet cards (or multi-paragraph closing prose),
      // serialize as standalone paragraph block(s) so closing section prose round-trips 1:1.
      if (
        !cardTitle &&
        !card.icon &&
        !hasSubs &&
        cleanParagraphs.length > 0 &&
        ((hasStructuredCards && cIdx > 0) || cleanParagraphs.length > 1)
      ) {
        postBulletProseBlocks.push(cleanParagraphs.join("\n\n"));
        continue;
      }

      const cardBody = cleanParagraphs.join(" ");

      if (cardTitle && cardBody) {
        bulletLines.push(`- **${cardIconPrefix}${cardTitle}:** ${cardBody}`);
      } else if (cardTitle) {
        bulletLines.push(`- **${cardIconPrefix}${cardTitle}:**`);
      } else if (cardBody) {
        bulletLines.push(`- ${cardBody}`);
      }

      if (card.subItems && card.subItems.length > 0) {
        for (const sub of card.subItems) {
          const sTitle = (sub.title || "").trim();
          const sBody = (sub.body || "").trim();
          if (sTitle && sBody) {
            bulletLines.push(`  - **${sTitle}:** ${sBody}`);
          } else if (sTitle) {
            bulletLines.push(`  - **${sTitle}**`);
          } else if (sBody) {
            bulletLines.push(`  - ${sBody}`);
          }
        }
      }
    }

    if (bulletLines.length > 0) {
      secBlocks.push(bulletLines.join("\n"));
    }
    if (postBulletProseBlocks.length > 0) {
      secBlocks.push(postBulletProseBlocks.join("\n\n"));
    }
    if (codeBlocks.length > 0) {
      secBlocks.push(codeBlocks.join("\n\n"));
    }
    if (section.images && section.images.length > 0) {
      secBlocks.push(section.images.map((src) => `![](${src})`).join("\n\n"));
    }

    if (secBlocks.length > 0) {
      parts.push(secBlocks.join("\n\n"));
    }
  }

  // Preserve any linked asset:// tags at the end of the markdown
  if (existingMarkdown) {
    const linked = extractLinkedAssetsFromMarkdown(existingMarkdown);
    if (linked.length > 0) {
      parts.push(linked.map((a) => a.rawTag).join("\n"));
    }
  }

  return parts.join("\n\n").trim();
}

export function PostEditorModeTiles({
  mode,
  onModeChange,
}: {
  mode: PostEditorMode;
  onModeChange: (m: PostEditorMode) => void;
}) {
  const { t } = useLexicon();
  return (
    <div className="grid grid-cols-3 gap-3 w-full">
      <DashboardStatTile
        variant="filter"
        className="!w-full"
        icon={t("icon_dashboard", "dashboard")}
        label={t("btn_view", "View")}
        number={t("tab_visual", "Visual")}
        colorClass="text-[var(--accent)]"
        isActive={mode === "visual"}
        onClick={() => onModeChange("visual")}
      />
      <DashboardStatTile
        variant="filter"
        className="!w-full"
        icon={t("icon_edit_note", "edit_note")}
        label={t("btn_view", "View")}
        number={t("editor", "Editor")}
        colorClass="text-[var(--accent)]"
        isActive={mode === "wysiwyg"}
        onClick={() => onModeChange("wysiwyg")}
      />
      <DashboardStatTile
        variant="filter"
        className="!w-full"
        icon={t("icon_code", "code")}
        label={t("btn_view", "View")}
        number={t("tab_raw", "Raw")}
        colorClass="text-[var(--accent)]"
        isActive={mode === "markdown"}
        onClick={() => onModeChange("markdown")}
      />
    </div>
  );
}

export function UnifiedPostBodyEditor({
  mode,
  onModeChange,
  content,
  onContentChange,
  editor,
  placeholder,
  minHeightClass = "min-h-[280px]",
  hideModeTiles = false,
}: {
  mode: PostEditorMode;
  onModeChange: (m: PostEditorMode) => void;
  content: string;
  onContentChange: (nextMarkdown: string) => void;
  editor?: Editor | null;
  placeholder?: string;
  minHeightClass?: string;
  hideModeTiles?: boolean;
}) {
  const { t } = useLexicon();
  const [showImagePrompt, setShowImagePrompt] = useState(false);
  const [inlineImgUrl, setInlineImgUrl] = useState("");
  const [showEmotePicker, setShowEmotePicker] = useState(false);
  const emoteBtnRef = useRef<HTMLButtonElement>(null);

  // Interactive Visual Builder state
  const lastSerializedRef = useRef<string>(content);
  const prevModeRef = useRef<PostEditorMode>(mode);
  const [visualDoc, setVisualDoc] = useState<{
    introTitle: string;
    introIcon?: string;
    intro: string;
    introImages?: string[];
    sections: ParsedReleaseSection[];
  }>(() => parseMarkdownIntoReleaseSections(content));
  const [activeTarget, setActiveTarget] = useState<string | null>(null);
  const [iconPickerFor, setIconPickerFor] = useState<string | null>(null);
  const [openActionMenuKey, setOpenActionMenuKey] = useState<string | null>(null);
  const [confirmDeleteIntro, setConfirmDeleteIntro] = useState(false);
  const [confirmDeleteSecIdx, setConfirmDeleteSecIdx] = useState<number | null>(
    null
  );
  const [confirmDeleteCardKey, setConfirmDeleteCardKey] = useState<
    string | null
  >(null);
  const [visibleEmptyHeaders, setVisibleEmptyHeaders] = useState<
    Record<number, boolean>
  >({});

  useEffect(() => {
    if (!openActionMenuKey) return;
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && !target.closest("[data-mobile-action-menu]")) {
        setOpenActionMenuKey(null);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [openActionMenuKey]);

  useEffect(() => {
    const modeChangedToVisual =
      mode === "visual" && prevModeRef.current !== "visual";
    const modeChangedToWysiwyg =
      mode === "wysiwyg" && prevModeRef.current !== "wysiwyg";
    prevModeRef.current = mode;

    if (modeChangedToWysiwyg && editor && !editor.isDestroyed) {
      const currentMd =
        (editor.storage as any)?.markdown?.getMarkdown?.() ?? "";
      if (currentMd !== content) {
        editor.commands.setContent(content, { emitUpdate: false });
      }
    }

    if (modeChangedToVisual || content !== lastSerializedRef.current) {
      lastSerializedRef.current = content;
      setVisualDoc(parseMarkdownIntoReleaseSections(content));
      setVisibleEmptyHeaders({});
      setConfirmDeleteIntro(false);
      setConfirmDeleteSecIdx(null);
      setConfirmDeleteCardKey(null);
    }
  }, [content, mode, editor]);

  const syncMarkdown = (nextMd: string, syncToTipTap = false) => {
    lastSerializedRef.current = nextMd;
    onContentChange(nextMd);
    if (syncToTipTap && editor && !editor.isDestroyed) {
      const currentMd =
        (editor.storage as any)?.markdown?.getMarkdown?.() ?? "";
      if (currentMd !== nextMd) {
        editor.commands.setContent(nextMd, { emitUpdate: false });
      }
    }
  };

  const commitVisualDoc = (nextDoc: {
    introTitle: string;
    introIcon?: string;
    intro: string;
    introImages?: string[];
    sections: ParsedReleaseSection[];
  }) => {
    setVisualDoc(nextDoc);
    const nextMd = serializeReleaseSectionsToMarkdown(nextDoc, content);
    syncMarkdown(nextMd, false);
  };

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
    if (lower.includes("player") || lower.includes("citizen") || lower.includes("queue")) {
      return t("icon_sports_esports", "sports_esports");
    }
    if (lower.includes("homestead") || lower.includes("lab") || lower.includes("proving")) {
      return t("icon_science", "science");
    }
    if (lower.includes("creator") || lower.includes("mason") || lower.includes("workshop")) {
      return t("icon_construction", "construction");
    }
    if (lower.includes("community") || lower.includes("wayfinder") || lower.includes("server")) {
      return t("icon_hub", "hub");
    }
    if (
      lower.includes("security") ||
      lower.includes("heuristic") ||
      lower.includes("malware") ||
      lower.includes("privacy")
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

  // Smoothly scroll to & focus newly created or targeted blocks without layout jump
  const scrollAndFocusTarget = (targetKey: string, preferInput = false) => {
    setActiveTarget(targetKey);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const container = document.querySelector<HTMLElement>(
          `[data-visual-target="${targetKey}"]`
        );
        if (!container) return;
        container.scrollIntoView({ behavior: "smooth", block: "nearest" });
        const focusEl = preferInput
          ? container.querySelector<HTMLElement>("input[type='text'], textarea")
          : container.querySelector<HTMLElement>("textarea, input[type='text']");
        focusEl?.focus({ preventScroll: true });
      });
    });
  };

  // Visual Builder mutations
  const handleAddIntro = () => {
    const next = {
      ...visualDoc,
      intro: visualDoc.intro || "",
    };
    setVisualDoc(next);
    scrollAndFocusTarget("intro", false);
  };

  const handleDeleteIntro = () => {
    const hasContent =
      Boolean(visualDoc.intro.trim()) || Boolean(visualDoc.introTitle.trim());
    if (hasContent && !confirmDeleteIntro) {
      setConfirmDeleteIntro(true);
      setTimeout(() => setConfirmDeleteIntro(false), 3000);
      return;
    }
    setConfirmDeleteIntro(false);
    const next = {
      ...visualDoc,
      introTitle: "",
      intro: "",
    };
    commitVisualDoc(next);
    if (activeTarget === "intro") setActiveTarget(null);
  };

  const handleAddSection = (position: "top" | "bottom" = "bottom") => {
    // If adding at top and the first section currently has no visible heading, reveal its Section Heading bar first
    if (
      position === "top" &&
      visualDoc.sections.length > 0 &&
      !visualDoc.sections[0].title.trim() &&
      !visibleEmptyHeaders[0]
    ) {
      setVisibleEmptyHeaders((prev) => ({ ...prev, 0: true }));
      scrollAndFocusTarget("sec-0-header", true);
      return;
    }

    const newSection: ParsedReleaseSection = {
      title: "",
      icon: "new_releases",
      description: undefined,
      cards: [
        {
          title: "",
          paragraphs: [""],
        },
      ],
    };
    const nextSections: ParsedReleaseSection[] =
      position === "top"
        ? [newSection, ...visualDoc.sections]
        : [...visualDoc.sections, newSection];
    const targetSecIdx = position === "top" ? 0 : nextSections.length - 1;
    if (position === "top") {
      setVisibleEmptyHeaders((prev) => {
        const shifted: Record<number, boolean> = { 0: true };
        Object.keys(prev).forEach((k) => {
          shifted[Number(k) + 1] = prev[Number(k)];
        });
        return shifted;
      });
    } else {
      setVisibleEmptyHeaders((prev) => ({ ...prev, [targetSecIdx]: true }));
    }
    const next = { ...visualDoc, sections: nextSections };
    commitVisualDoc(next);
    scrollAndFocusTarget(`sec-${targetSecIdx}-header`, true);
  };

  const handleQuickAddCard = (position: "top" | "bottom" = "bottom") => {
    if (visualDoc.sections.length === 0) {
      handleAddSection(position);
      return;
    }
    const targetSecIdx = position === "top" ? 0 : visualDoc.sections.length - 1;
    handleAddCardToSection(targetSecIdx);
  };

  const handleDeleteSection = (sIdx: number) => {
    const sec = visualDoc.sections[sIdx];
    if (!sec) return;

    if (sec.title.trim() && confirmDeleteSecIdx !== sIdx) {
      setConfirmDeleteSecIdx(sIdx);
      setTimeout(() => {
        setConfirmDeleteSecIdx((prev) => (prev === sIdx ? null : prev));
      }, 3000);
      return;
    }
    setConfirmDeleteSecIdx(null);

    const hasCardsOrProse =
      sec.cards.length > 0 || Boolean(sec.description?.trim());

    // Clicking Trash on a Section Heading bar NEVER deletes the cards inside that section:
    // - On section 0: it removes/hides the Section Heading bar and keeps all cards intact.
    // - On section > 0: it removes the Section Heading divider by merging its cards into the previous section.
    if (hasCardsOrProse) {
      if (sIdx === 0) {
        setVisibleEmptyHeaders((prev) => {
          const next = { ...prev };
          delete next[0];
          return next;
        });
        if (sec.title.trim()) {
          handleUpdateSection(0, { title: "" });
        }
        return;
      }

      const prevSec = visualDoc.sections[sIdx - 1];
      const mergedDescription =
        [prevSec.description, sec.description]
          .map((d) => (d || "").trim())
          .filter(Boolean)
          .join("\n\n") || undefined;
      const mergedImages = [
        ...(prevSec.images || []),
        ...(sec.images || []),
      ];
      const mergedPrev: ParsedReleaseSection = {
        ...prevSec,
        description: mergedDescription,
        cards: [...prevSec.cards, ...sec.cards],
        images: mergedImages.length > 0 ? mergedImages : undefined,
      };
      const nextSections = visualDoc.sections
        .map((item, idx) => (idx === sIdx - 1 ? mergedPrev : item))
        .filter((_, idx) => idx !== sIdx);
      setVisibleEmptyHeaders((prev) => {
        const next: Record<number, boolean> = {};
        Object.keys(prev).forEach((k) => {
          const num = Number(k);
          if (num < sIdx) next[num] = prev[num];
          else if (num > sIdx) next[num - 1] = prev[num];
        });
        return next;
      });
      commitVisualDoc({ ...visualDoc, sections: nextSections });
      setActiveTarget(null);
      return;
    }

    const nextSections = visualDoc.sections.filter((_, idx) => idx !== sIdx);
    setVisibleEmptyHeaders((prev) => {
      const next: Record<number, boolean> = {};
      Object.keys(prev).forEach((k) => {
        const num = Number(k);
        if (num < sIdx) next[num] = prev[num];
        else if (num > sIdx) next[num - 1] = prev[num];
      });
      return next;
    });
    commitVisualDoc({ ...visualDoc, sections: nextSections });
    setActiveTarget(null);
  };

  const handleMoveSection = (sIdx: number, dir: -1 | 1) => {
    const targetIdx = sIdx + dir;
    if (targetIdx < 0 || targetIdx >= visualDoc.sections.length) return;
    const nextSections = [...visualDoc.sections];
    const [moved] = nextSections.splice(sIdx, 1);
    nextSections.splice(targetIdx, 0, moved);
    commitVisualDoc({ ...visualDoc, sections: nextSections });
    scrollAndFocusTarget(`sec-${targetIdx}-header`, true);
  };

  const handleUpdateSection = (
    sIdx: number,
    patch: Partial<ParsedReleaseSection>
  ) => {
    const nextSections = visualDoc.sections.map((sec, idx) =>
      idx === sIdx ? { ...sec, ...patch } : sec
    );
    commitVisualDoc({ ...visualDoc, sections: nextSections });
  };

  const handleAddCardToSection = (sIdx: number) => {
    const sec = visualDoc.sections[sIdx];
    if (!sec) return;
    const newCardIdx = sec.cards.length;
    const nextCards: ParsedReleaseCard[] = [
      ...sec.cards,
      { title: "", paragraphs: [""] },
    ];
    handleUpdateSection(sIdx, { cards: nextCards });
    scrollAndFocusTarget(`sec-${sIdx}-card-${newCardIdx}`, true);
  };

  const handleUpdateCard = (
    sIdx: number,
    cIdx: number,
    patch: Partial<ParsedReleaseCard>
  ) => {
    const sec = visualDoc.sections[sIdx];
    if (!sec) return;
    const nextCards = sec.cards.map((c, idx) =>
      idx === cIdx ? { ...c, ...patch } : c
    );
    handleUpdateSection(sIdx, { cards: nextCards });
  };

  const handleDeleteCard = (sIdx: number, cIdx: number) => {
    const sec = visualDoc.sections[sIdx];
    if (!sec) return;
    const card = sec.cards[cIdx];
    const cardHasContent =
      Boolean(card?.title?.trim()) ||
      Boolean((card?.paragraphs || []).join("").trim()) ||
      Boolean(card?.subItems && card.subItems.length > 0) ||
      Boolean(card?.codeBlock?.trim());
    const key = `${sIdx}-${cIdx}`;
    if (cardHasContent && confirmDeleteCardKey !== key) {
      setConfirmDeleteCardKey(key);
      setTimeout(() => {
        setConfirmDeleteCardKey((prev) => (prev === key ? null : prev));
      }, 3000);
      return;
    }
    setConfirmDeleteCardKey(null);
    const nextCards = sec.cards.filter((_, idx) => idx !== cIdx);
    handleUpdateSection(sIdx, { cards: nextCards });
    setActiveTarget(null);
  };

  const handleMoveCard = (sIdx: number, cIdx: number, dir: -1 | 1) => {
    const sec = visualDoc.sections[sIdx];
    if (!sec) return;
    const targetIdx = cIdx + dir;
    if (targetIdx < 0 || targetIdx >= sec.cards.length) return;
    const nextCards = [...sec.cards];
    const [moved] = nextCards.splice(cIdx, 1);
    nextCards.splice(targetIdx, 0, moved);
    handleUpdateSection(sIdx, { cards: nextCards });
    scrollAndFocusTarget(`sec-${sIdx}-card-${targetIdx}`, false);
  };

  const handleAddSubItem = (sIdx: number, cIdx: number) => {
    const sec = visualDoc.sections[sIdx];
    if (!sec) return;
    const card = sec.cards[cIdx];
    if (!card) return;
    const rawBody = (card.paragraphs || []).join("\n\n").trim();
    const cleanedParagraphs =
      card.title && rawBody.toLowerCase() === card.title.trim().toLowerCase()
        ? []
        : card.paragraphs;
    const newSubIdx = (card.subItems || []).length;
    const nextSubs = [...(card.subItems || []), { title: "", body: "" }];
    handleUpdateCard(sIdx, cIdx, {
      paragraphs: cleanedParagraphs,
      subItems: nextSubs,
    });
    scrollAndFocusTarget(`sec-${sIdx}-card-${cIdx}-sub-${newSubIdx}`, false);
  };

  const handleMoveSubItem = (
    sIdx: number,
    cIdx: number,
    subIdx: number,
    dir: -1 | 1
  ) => {
    const sec = visualDoc.sections[sIdx];
    if (!sec) return;
    const card = sec.cards[cIdx];
    if (!card || !card.subItems) return;
    const targetIdx = subIdx + dir;
    if (targetIdx < 0 || targetIdx >= card.subItems.length) return;
    const nextSubs = [...card.subItems];
    const [moved] = nextSubs.splice(subIdx, 1);
    nextSubs.splice(targetIdx, 0, moved);
    handleUpdateCard(sIdx, cIdx, { subItems: nextSubs });
  };

  const ToolbarBtn = ({
    onClick,
    active,
    icon,
    title,
  }: {
    onClick: () => void;
    active?: boolean;
    icon: string;
    title: string;
  }) => (
    <div className="relative group flex items-center justify-center">
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          onClick();
        }}
        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer ${
          active
            ? "glass-surface text-[var(--accent)] border border-[color-mix(in_srgb,var(--text)_18%,transparent)] scale-105"
            : "text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[rgba(var(--text-rgb),0.06)] border border-transparent"
        }`}
      >
        <span className="material-symbols-outlined !text-[16px] leading-none pointer-events-none">
          {icon}
        </span>
      </button>
      <HoverTooltip title={title} variant="accent" />
    </div>
  );

  const hasIntro =
    Boolean(visualDoc.introTitle.trim()) ||
    Boolean(visualDoc.intro.trim()) ||
    Boolean(visualDoc.introImages && visualDoc.introImages.length > 0) ||
    activeTarget === "intro";

  const handleRemoveIntroImage = (imgIdx: number) => {
    const nextImgs = (visualDoc.introImages || []).filter((_, idx) => idx !== imgIdx);
    commitVisualDoc({
      ...visualDoc,
      introImages: nextImgs.length > 0 ? nextImgs : undefined,
    });
  };

  const handleRemoveSectionImage = (sIdx: number, imgIdx: number) => {
    const sec = visualDoc.sections[sIdx];
    if (!sec) return;
    const nextImgs = (sec.images || []).filter((_, idx) => idx !== imgIdx);
    handleUpdateSection(sIdx, {
      images: nextImgs.length > 0 ? nextImgs : undefined,
    });
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* 1x3 DashboardStatTile Mode Switcher (No PillTabs) */}
      {!hideModeTiles && (
        <PostEditorModeTiles mode={mode} onModeChange={onModeChange} />
      )}

      {/* =====================================================================
          MODE 1: INTERACTIVE IN-PLACE VISUAL UI BUILDER
         ===================================================================== */}
      {mode === "visual" && (
        <div className="flex flex-col gap-5 w-full">
          {/* Top Action Bar (Quick Add Section, Add Card, Add/Edit Intro) */}
          <div className="glass-panel p-3 rounded-2xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <div className="px-2.5 py-1 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5">
                <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                  {t("icon_dashboard", "dashboard")}
                </span>
                <span>
                  {`${visualDoc.sections.length} ${t("visual_editor_sections_label", "Sections")} • ${visualDoc.sections.reduce((acc, s) => acc + s.cards.length, 0)} ${t("visual_editor_cards_label", "Cards")}`}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleAddIntro}
                className="h-8 px-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                  {t("icon_short_text", "short_text")}
                </span>
                <span>
                  {hasIntro
                    ? t("visual_editor_edit_intro", "Edit Intro")
                    : t("visual_editor_add_intro", "Add Intro")}
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickAddCard("top")}
                className="h-8 px-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                  {t("icon_add_box", "add_box")}
                </span>
                <span>{t("visual_editor_add_card", "Add Card")}</span>
              </button>
              <button
                type="button"
                onClick={() => handleAddSection("top")}
                className="h-8 px-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                  {t("icon_post_add", "post_add")}
                </span>
                <span>{t("visual_editor_new_section", "New Section")}</span>
              </button>
            </div>
          </div>

          {/* Top Intro Block (Direct In-Place Editing — Zero Mode-Swap Jump) */}
          {hasIntro && (
            <div className="flex flex-col gap-2.5 w-full" data-visual-target="intro">
              <div className="glass-panel rounded-3xl p-3.5 sm:p-5 flex flex-col gap-3 relative group transition-colors focus-within:!border-[color-mix(in_srgb,var(--accent)_45%,transparent)]">
                <div className="flex items-center justify-between gap-2 sm:gap-2.5">
                  <div className="flex items-center gap-2 sm:gap-2.5 flex-1 min-w-0">
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setIconPickerFor(
                            iconPickerFor === "intro" ? null : "intro"
                          )
                        }
                        className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)] cursor-pointer transition-all"
                      >
                        <span className="material-symbols-outlined !text-[17px]">
                          {resolveSectionIcon(
                            visualDoc.introTitle || "Welcome",
                            visualDoc.introIcon || "verified"
                          )}
                        </span>
                        <HoverTooltip title={t("visual_editor_pick_icon", "Pick Icon")} />
                      </button>
                      {iconPickerFor === "intro" && (
                        <IconPicker
                          onSelect={(icon) => {
                            commitVisualDoc({
                              ...visualDoc,
                              introIcon: icon,
                            });
                            setIconPickerFor(null);
                          }}
                          onClose={() => setIconPickerFor(null)}
                        />
                      )}
                    </div>
                    <input
                      type="text"
                      value={visualDoc.introTitle}
                      onChange={(e) =>
                        commitVisualDoc({
                          ...visualDoc,
                          introTitle: e.target.value,
                        })
                      }
                      placeholder={t(
                        "visual_editor_overview_heading_ph",
                        "Overview Heading (Optional)..."
                      )}
                      className="flex-1 min-w-0 h-9 pl-2.5 pr-2.5 sm:pl-3.5 sm:pr-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] focus:border-[var(--accent)] text-xs sm:text-base font-black text-[var(--text)] outline-none transition-colors"
                    />
                  </div>
                  <div className="relative flex items-center gap-1.5 shrink-0" data-mobile-action-menu>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenActionMenuKey(
                          openActionMenuKey === "intro" ? null : "intro"
                        )
                      }
                      className={`md:hidden w-8 h-8 rounded-xl glass-surface sa-glass-pill-hover border flex items-center justify-center cursor-pointer transition-all ${
                        openActionMenuKey === "intro"
                          ? "border-[var(--accent)] text-[var(--accent)]"
                          : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
                      }`}
                    >
                      <span className="material-symbols-outlined !text-[16px]">
                        {t("icon_more_vert", "more_vert")}
                      </span>
                    </button>

                    <div
                      className={`${
                        openActionMenuKey === "intro"
                          ? "flex absolute right-0 top-[calc(100%+6px)] z-[220] glass-panel portal-glass-fix sa-dropdown-popover p-1.5 rounded-2xl border border-[color-mix(in_srgb,var(--text)_14%,transparent)] shadow-2xl"
                          : "hidden"
                      } md:flex md:static md:p-0 md:bg-transparent md:border-0 md:shadow-none items-center gap-1.5`}
                    >
                      {visualDoc.introTitle.trim() && (
                        <button
                          type="button"
                          onClick={() => {
                            commitVisualDoc({
                              ...visualDoc,
                              introTitle: "",
                            });
                            setOpenActionMenuKey(null);
                          }}
                          className="w-8 h-8 rounded-xl glass-surface sa-glass-pill-hover border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] flex items-center justify-center cursor-pointer transition-all"
                        >
                          <span className="material-symbols-outlined !text-[15px]">
                            {t("icon_close", "close")}
                          </span>
                          <HoverTooltip title={t("clear", "Clear")} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const wasConfirmed = confirmDeleteIntro;
                          handleDeleteIntro();
                          if (wasConfirmed) setOpenActionMenuKey(null);
                        }}
                        className={`h-8 rounded-xl glass-surface border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                          confirmDeleteIntro
                            ? "px-3 sa-glass-pill-danger !text-[var(--text)]"
                            : "w-8 sa-glass-pill-hover border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
                        }`}
                      >
                        <span
                          className={`material-symbols-outlined !text-[15px] ${
                            confirmDeleteIntro ? "text-[var(--danger)]" : ""
                          }`}
                        >
                          {confirmDeleteIntro
                            ? t("icon_delete_forever", "delete_forever")
                            : t("icon_delete", "delete")}
                        </span>
                        {confirmDeleteIntro && (
                          <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text)] whitespace-nowrap">
                            {t("btn_confirm_delete", "Confirm {Delete}")}
                          </span>
                        )}
                        <HoverTooltip
                          title={
                            confirmDeleteIntro
                              ? t("btn_confirm_delete", "Confirm {Delete}")
                              : t("btn_delete", "{Delete}")
                          }
                          variant="danger"
                        />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl p-3.5 glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus-within:!border-[color-mix(in_srgb,var(--accent)_45%,transparent)] transition-colors">
                  <AutoResizeTextarea
                    minRows={3}
                    value={visualDoc.intro}
                    onChange={(e) =>
                      commitVisualDoc({
                        ...visualDoc,
                        intro: e.target.value,
                      })
                    }
                    placeholder={
                      placeholder ||
                      t("post_description_ph", "Lead summary or introduction...")
                    }
                    className="w-full bg-transparent text-xs sm:text-[13px] text-[color-mix(in_srgb,var(--text)_88%,transparent)] leading-relaxed outline-none"
                  />
                </div>
              </div>
              {visualDoc.introImages && visualDoc.introImages.length > 0 && (
                <div className="flex flex-col gap-2.5 w-full">
                  {visualDoc.introImages.map((src, imgIdx) => (
                    <div
                      key={`intro-img-${imgIdx}-${src}`}
                      className="glass-panel rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_12%,transparent)] relative group/img"
                    >
                      <img
                        src={src}
                        alt=""
                        className="w-full max-h-72 object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveIntroImage(imgIdx)}
                        className="absolute top-3 right-3 w-8 h-8 rounded-xl glass-panel border border-[color-mix(in_srgb,var(--text)_16%,transparent)] text-[var(--text)] hover:text-[var(--danger)] flex items-center justify-center cursor-pointer transition-all shadow-lg"
                      >
                        <span className="material-symbols-outlined !text-[16px]">
                          {t("icon_delete", "delete")}
                        </span>
                        <HoverTooltip title={t("remove", "Remove")} variant="danger" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Sections & Direct In-Place Info Cards */}
          {visualDoc.sections.map((section, sIdx) => {
            const leadKey = `sec-${sIdx}-lead`;
            const isLeadEditing = activeTarget === leadKey;
            const hasLead =
              Boolean(section.description !== undefined) ||
              isLeadEditing ||
              section.cards.length === 0;
            const secIconPickerKey = `sec-${sIdx}-icon`;

            // Compute 1:1 grid spanning flags matching StructuredReleaseNotesView
            const spanFullFlags = section.cards.map((card, idx) => {
              const hasSubs = Boolean(card.subItems && card.subItems.length > 0);
              const hasCode = Boolean(card.codeBlock);
              const isUntitledMultiPara =
                !card.title?.trim() && card.paragraphs.length > 1;
              const isStandaloneUntitledCard =
                !card.title?.trim() &&
                !card.icon &&
                !hasSubs &&
                idx > 0 &&
                section.cards
                  .slice(0, idx)
                  .some(
                    (prev) =>
                      Boolean(prev.title?.trim()) ||
                      Boolean(prev.subItems?.length)
                  );
              return (
                hasSubs ||
                hasCode ||
                isUntitledMultiPara ||
                isStandaloneUntitledCard
              );
            });

            let currentCol = 0;
            for (let idx = 0; idx < section.cards.length; idx++) {
              if (spanFullFlags[idx]) {
                currentCol = 0;
              } else {
                const nextCardIsFull =
                  idx + 1 < section.cards.length ? spanFullFlags[idx + 1] : true;
                if (currentCol === 0 && nextCardIsFull) {
                  spanFullFlags[idx] = true;
                  currentCol = 0;
                } else {
                  currentCol = (currentCol + 1) % 2;
                }
              }
            }

            const showSectionHeader =
              Boolean(section.title.trim()) ||
              sIdx > 0 ||
              (section.cards.length === 0 && !section.description?.trim()) ||
              Boolean(visibleEmptyHeaders[sIdx]);

            return (
              <div
                key={`visual-sec-${sIdx}`}
                className="flex flex-col gap-3.5 w-full"
              >
                {/* Sculpted Section Header Bar with Clickable Icon Picker & Section Actions */}
                {showSectionHeader && (
                  <div
                    data-visual-target={`sec-${sIdx}-header`}
                    className="glass-panel px-3 sm:px-3.5 py-2.5 rounded-2xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-between gap-2 sm:gap-2.5"
                  >
                    <div className="flex items-center gap-2 sm:gap-2.5 flex-1 min-w-0">
                      <div className="relative shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setIconPickerFor(
                              iconPickerFor === secIconPickerKey
                                ? null
                                : secIconPickerKey
                            )
                          }
                          className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)] cursor-pointer transition-all"
                        >
                          <span className="material-symbols-outlined !text-[17px]">
                            {resolveSectionIcon(section.title, section.icon)}
                          </span>
                          <HoverTooltip title={t("visual_editor_pick_icon", "Pick Icon")} />
                        </button>
                        {iconPickerFor === secIconPickerKey && (
                          <IconPicker
                            onSelect={(icon) => {
                              handleUpdateSection(sIdx, { icon });
                              setIconPickerFor(null);
                            }}
                            onClose={() => setIconPickerFor(null)}
                          />
                        )}
                      </div>
                      <input
                        type="text"
                        value={section.title}
                        onChange={(e) =>
                          handleUpdateSection(sIdx, { title: e.target.value })
                        }
                        placeholder={t(
                          "visual_editor_section_title_ph",
                          "Section Title..."
                        )}
                        className="flex-1 min-w-0 h-9 pl-2.5 pr-2.5 sm:pl-3.5 sm:pr-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] focus:border-[var(--accent)] text-xs sm:text-base font-black tracking-tight text-[var(--text)] outline-none transition-colors"
                      />
                    </div>

                    <div className="relative flex items-center gap-1.5 shrink-0" data-mobile-action-menu>
                      <button
                        type="button"
                        onClick={() =>
                          setOpenActionMenuKey(
                            openActionMenuKey === `sec-${sIdx}`
                              ? null
                              : `sec-${sIdx}`
                          )
                        }
                        className={`md:hidden w-8 h-8 rounded-xl glass-surface sa-glass-pill-hover border flex items-center justify-center cursor-pointer transition-all ${
                          openActionMenuKey === `sec-${sIdx}`
                            ? "border-[var(--accent)] text-[var(--accent)]"
                            : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
                        }`}
                      >
                        <span className="material-symbols-outlined !text-[16px]">
                          {t("icon_more_vert", "more_vert")}
                        </span>
                      </button>

                      <div
                        className={`${
                          openActionMenuKey === `sec-${sIdx}`
                            ? "flex absolute right-0 top-[calc(100%+6px)] z-[220] glass-panel portal-glass-fix sa-dropdown-popover p-1.5 rounded-2xl border border-[color-mix(in_srgb,var(--text)_14%,transparent)] shadow-2xl"
                            : "hidden"
                        } md:flex md:static md:p-0 md:bg-transparent md:border-0 md:shadow-none items-center gap-1.5`}
                      >
                        <button
                          type="button"
                          disabled={sIdx === 0}
                          onClick={() => {
                            handleMoveSection(sIdx, -1);
                            setOpenActionMenuKey(null);
                          }}
                          className="w-8 h-8 rounded-xl glass-surface sa-glass-pill-hover border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] disabled:opacity-30 flex items-center justify-center cursor-pointer transition-all"
                        >
                          <span className="material-symbols-outlined !text-[15px]">
                            {t("icon_arrow_upward", "arrow_upward")}
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={sIdx === visualDoc.sections.length - 1}
                          onClick={() => {
                            handleMoveSection(sIdx, 1);
                            setOpenActionMenuKey(null);
                          }}
                          className="w-8 h-8 rounded-xl glass-surface sa-glass-pill-hover border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] disabled:opacity-30 flex items-center justify-center cursor-pointer transition-all"
                        >
                          <span className="material-symbols-outlined !text-[15px]">
                            {t("icon_arrow_downward", "arrow_downward")}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const wasConfirmed = confirmDeleteSecIdx === sIdx;
                            handleDeleteSection(sIdx);
                            if (wasConfirmed) setOpenActionMenuKey(null);
                          }}
                          className={`h-8 rounded-xl glass-surface border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                            confirmDeleteSecIdx === sIdx
                              ? "px-3 sa-glass-pill-danger !text-[var(--text)]"
                              : "w-8 sa-glass-pill-hover border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
                          }`}
                        >
                          <span
                            className={`material-symbols-outlined !text-[15px] ${
                              confirmDeleteSecIdx === sIdx
                                ? "text-[var(--danger)]"
                                : ""
                            }`}
                          >
                            {confirmDeleteSecIdx === sIdx
                              ? t("icon_delete_forever", "delete_forever")
                              : t("icon_delete", "delete")}
                          </span>
                          {confirmDeleteSecIdx === sIdx && (
                            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text)] whitespace-nowrap">
                              {t("btn_confirm_delete", "Confirm {Delete}")}
                            </span>
                          )}
                          <HoverTooltip
                            title={
                              confirmDeleteSecIdx === sIdx
                                ? t("btn_confirm_delete", "Confirm {Delete}")
                                : t("remove", "Remove")
                            }
                            variant="danger"
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Section Lead / Prose Block (Matches Published Section Prose Card 1:1) */}
                {hasLead && (
                  <div
                    data-visual-target={leadKey}
                    className="glass-panel rounded-3xl p-4 sm:p-5 flex flex-col gap-2.5 relative group transition-colors focus-within:!border-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("visual_editor_add_summary", "Section Summary")}
                      </span>
                      {section.cards.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            handleUpdateSection(sIdx, {
                              description: undefined,
                            });
                            setActiveTarget(null);
                          }}
                          className="w-6 h-6 rounded-lg glass-surface text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center cursor-pointer"
                        >
                          <span className="material-symbols-outlined !text-[13px]">
                            {t("icon_delete", "delete")}
                          </span>
                          <HoverTooltip title={t("btn_delete", "{Delete}")} variant="danger" />
                        </button>
                      )}
                    </div>
                    <AutoResizeTextarea
                      minRows={3}
                      value={section.description || ""}
                      onChange={(e) =>
                        handleUpdateSection(sIdx, {
                          description: e.target.value,
                        })
                      }
                      placeholder={t(
                        "visual_editor_section_body_ph",
                        "Write section overview or paragraph content..."
                      )}
                      className="w-full bg-transparent text-xs sm:text-[13px] text-[color-mix(in_srgb,var(--text)_88%,transparent)] leading-relaxed outline-none"
                    />
                  </div>
                )}

                {/* 2-Column Bento Info Cards Grid (Matches Published Layout 1:1) */}
                {section.cards.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {section.cards.map((card, cIdx) => {
                      const cardKey = `sec-${sIdx}-card-${cIdx}`;
                      const cardIconKey = `sec-${sIdx}-card-${cIdx}-icon`;
                      const hasSubItems = Boolean(
                        card.subItems && card.subItems.length > 0
                      );
                      const spanFull = spanFullFlags[cIdx] ?? false;
                      const rawBodyValue = (card.paragraphs || []).join("\n\n");
                      const bodyValue =
                        card.title &&
                        rawBodyValue.trim().toLowerCase() ===
                          card.title.trim().toLowerCase()
                          ? ""
                          : rawBodyValue;

                      return (
                        <div
                          key={cardKey}
                          data-visual-target={cardKey}
                          className={`glass-panel rounded-3xl p-3.5 sm:p-5 flex flex-col gap-3 relative group transition-colors focus-within:!border-[color-mix(in_srgb,var(--accent)_45%,transparent)] ${
                            spanFull ? "md:col-span-2" : ""
                          }`}
                        >
                          {/* Card Header Bar: Inline Icon + Full-Width Recessed Title Input + Compact Icon Actions */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <div className="relative shrink-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setIconPickerFor(
                                      iconPickerFor === cardIconKey
                                        ? null
                                        : cardIconKey
                                    )
                                  }
                                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)] cursor-pointer transition-all"
                                >
                                  <span className="material-symbols-outlined !text-[17px]">
                                    {card.icon
                                      ? t(`icon_${card.icon}`, card.icon)
                                      : t("icon_add_reaction", "add_reaction")}
                                  </span>
                                  <HoverTooltip title={t("visual_editor_pick_icon", "Pick Icon")} />
                                </button>
                                {iconPickerFor === cardIconKey && (
                                  <IconPicker
                                    onSelect={(icon) => {
                                      handleUpdateCard(sIdx, cIdx, { icon });
                                      setIconPickerFor(null);
                                    }}
                                    onClose={() => setIconPickerFor(null)}
                                  />
                                )}
                              </div>

                              <input
                                type="text"
                                value={card.title}
                                onChange={(e) =>
                                  handleUpdateCard(sIdx, cIdx, {
                                    title: e.target.value,
                                  })
                                }
                                placeholder={t(
                                  "visual_editor_card_title_ph",
                                  "Card Heading (Optional)..."
                                )}
                                className="flex-1 min-w-0 h-9 pl-2.5 pr-2.5 sm:pl-3.5 sm:pr-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] focus:border-[var(--accent)] text-xs sm:text-sm font-bold text-[var(--text)] outline-none transition-colors"
                              />
                            </div>

                            <div className="relative flex items-center gap-1 shrink-0" data-mobile-action-menu>
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenActionMenuKey(
                                    openActionMenuKey === cardKey
                                      ? null
                                      : cardKey
                                  )
                                }
                                className={`md:hidden w-8 h-8 rounded-xl glass-surface sa-glass-pill-hover border flex items-center justify-center cursor-pointer transition-all ${
                                  openActionMenuKey === cardKey
                                    ? "border-[var(--accent)] text-[var(--accent)]"
                                    : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
                                }`}
                              >
                                <span className="material-symbols-outlined !text-[16px]">
                                  {t("icon_more_vert", "more_vert")}
                                </span>
                              </button>

                              <div
                                className={`${
                                  openActionMenuKey === cardKey
                                    ? "flex absolute right-0 top-[calc(100%+6px)] z-[220] glass-panel portal-glass-fix sa-dropdown-popover p-1.5 rounded-2xl border border-[color-mix(in_srgb,var(--text)_14%,transparent)] shadow-2xl"
                                    : "hidden"
                                } md:flex md:static md:p-0 md:bg-transparent md:border-0 md:shadow-none items-center gap-1`}
                              >
                                {card.icon && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleUpdateCard(sIdx, cIdx, {
                                        icon: undefined,
                                      });
                                      setOpenActionMenuKey(null);
                                    }}
                                    className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center cursor-pointer"
                                  >
                                    <span className="material-symbols-outlined !text-[13px]">
                                      {t("icon_close", "close")}
                                    </span>
                                    <HoverTooltip
                                      title={t("visual_editor_clear_icon", "Clear Icon")}
                                    />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  disabled={cIdx === 0}
                                  onClick={() => {
                                    handleMoveCard(sIdx, cIdx, -1);
                                    setOpenActionMenuKey(null);
                                  }}
                                  className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] disabled:opacity-30 flex items-center justify-center cursor-pointer"
                                >
                                  <span className="material-symbols-outlined !text-[14px]">
                                    {t("icon_arrow_upward", "arrow_upward")}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  disabled={cIdx === section.cards.length - 1}
                                  onClick={() => {
                                    handleMoveCard(sIdx, cIdx, 1);
                                    setOpenActionMenuKey(null);
                                  }}
                                  className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] disabled:opacity-30 flex items-center justify-center cursor-pointer"
                                >
                                  <span className="material-symbols-outlined !text-[14px]">
                                    {t("icon_arrow_downward", "arrow_downward")}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const wasConfirmed =
                                      confirmDeleteCardKey === `${sIdx}-${cIdx}`;
                                    handleDeleteCard(sIdx, cIdx);
                                    if (wasConfirmed) setOpenActionMenuKey(null);
                                  }}
                                  className={`h-7 rounded-lg glass-surface border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                                    confirmDeleteCardKey === `${sIdx}-${cIdx}`
                                      ? "px-2.5 sa-glass-pill-danger !text-[var(--text)]"
                                      : "w-7 sa-glass-pill-hover border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
                                  }`}
                                >
                                  <span
                                    className={`material-symbols-outlined !text-[14px] ${
                                      confirmDeleteCardKey === `${sIdx}-${cIdx}`
                                        ? "text-[var(--danger)]"
                                        : ""
                                    }`}
                                  >
                                    {confirmDeleteCardKey === `${sIdx}-${cIdx}`
                                      ? t("icon_delete_forever", "delete_forever")
                                      : t("icon_delete", "delete")}
                                  </span>
                                  {confirmDeleteCardKey === `${sIdx}-${cIdx}` && (
                                    <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text)] whitespace-nowrap">
                                      {t("btn_confirm_delete", "Confirm {Delete}")}
                                    </span>
                                  )}
                                  <HoverTooltip
                                    title={
                                      confirmDeleteCardKey === `${sIdx}-${cIdx}`
                                        ? t("btn_confirm_delete", "Confirm {Delete}")
                                        : t("btn_delete", "{Delete}")
                                    }
                                    variant="danger"
                                  />
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Card Main Body */}
                          {(!hasSubItems || Boolean(bodyValue)) && (
                            <div className="rounded-2xl p-3.5 glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus-within:!border-[color-mix(in_srgb,var(--accent)_45%,transparent)] transition-colors">
                              <AutoResizeTextarea
                                minRows={hasSubItems ? 2 : 3}
                                value={bodyValue}
                                onChange={(e) => {
                                  const rawVal = e.target.value;
                                  const nextParas = rawVal
                                    ? rawVal.split(/\n{2,}/)
                                    : [];
                                  handleUpdateCard(sIdx, cIdx, {
                                    paragraphs: nextParas,
                                  });
                                }}
                                placeholder={t(
                                  "visual_editor_card_body_ph",
                                  "Write card content..."
                                )}
                                className="w-full bg-transparent text-xs sm:text-[13px] text-[color-mix(in_srgb,var(--text)_88%,transparent)] leading-relaxed outline-none"
                              />
                            </div>
                          )}

                          {/* 2-Column Sub-Blocks Grid (Matches Published Sub-Item Grid 1:1) */}
                          {card.subItems && card.subItems.length > 0 && (
                            <div
                              className={`grid gap-3 ${
                                card.subItems.length > 1
                                  ? "grid-cols-1 md:grid-cols-2"
                                  : "grid-cols-1"
                              }`}
                            >
                              {card.subItems.map((sub, subIdx) => {
                                const subTargetKey = `sec-${sIdx}-card-${cIdx}-sub-${subIdx}`;
                                const isLastOddSub =
                                  (card.subItems?.length || 0) > 1 &&
                                  (card.subItems?.length || 0) % 2 === 1 &&
                                  subIdx === (card.subItems?.length || 1) - 1;

                                return (
                                  <div
                                    key={`sub-${subIdx}`}
                                    data-visual-target={subTargetKey}
                                    className={`rounded-2xl p-3.5 sm:p-4 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus-within:!border-[color-mix(in_srgb,var(--accent)_50%,transparent)] flex flex-col gap-2.5 relative group/sub transition-colors ${
                                      isLastOddSub ? "md:col-span-2" : ""
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] opacity-70">
                                        #{subIdx + 1}
                                      </span>
                                      <div className="flex items-center gap-1">
                                        <button
                                          type="button"
                                          disabled={subIdx === 0}
                                          onClick={() =>
                                            handleMoveSubItem(
                                              sIdx,
                                              cIdx,
                                              subIdx,
                                              -1
                                            )
                                          }
                                          className="w-6 h-6 rounded-lg glass-panel text-[var(--subtext)] hover:text-[var(--text)] disabled:opacity-25 flex items-center justify-center cursor-pointer"
                                        >
                                          <span className="material-symbols-outlined !text-[13px]">
                                            {t("icon_arrow_upward", "arrow_upward")}
                                          </span>
                                        </button>
                                        <button
                                          type="button"
                                          disabled={
                                            subIdx ===
                                            (card.subItems?.length || 1) - 1
                                          }
                                          onClick={() =>
                                            handleMoveSubItem(
                                              sIdx,
                                              cIdx,
                                              subIdx,
                                              1
                                            )
                                          }
                                          className="w-6 h-6 rounded-lg glass-panel text-[var(--subtext)] hover:text-[var(--text)] disabled:opacity-25 flex items-center justify-center cursor-pointer"
                                        >
                                          <span className="material-symbols-outlined !text-[13px]">
                                            {t("icon_arrow_downward", "arrow_downward")}
                                          </span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const nextSubs = (
                                              card.subItems || []
                                            ).filter((_, idx) => idx !== subIdx);
                                            handleUpdateCard(sIdx, cIdx, {
                                              subItems:
                                                nextSubs.length > 0
                                                  ? nextSubs
                                                  : undefined,
                                            });
                                          }}
                                          className="w-6 h-6 rounded-lg glass-panel text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center cursor-pointer"
                                        >
                                          <span className="material-symbols-outlined !text-[13px]">
                                            {t("icon_close", "close")}
                                          </span>
                                          <HoverTooltip
                                            title={t("remove", "Remove")}
                                            variant="danger"
                                          />
                                        </button>
                                      </div>
                                    </div>

                                    <input
                                      type="text"
                                      value={sub.title}
                                      onChange={(e) => {
                                        const nextSubs = [
                                          ...(card.subItems || []),
                                        ];
                                        nextSubs[subIdx] = {
                                          ...nextSubs[subIdx],
                                          title: e.target.value,
                                        };
                                        handleUpdateCard(sIdx, cIdx, {
                                          subItems: nextSubs,
                                        });
                                      }}
                                      placeholder={t(
                                        "visual_editor_sub_title_ph",
                                        "Sub-heading (optional)..."
                                      )}
                                      className="w-full h-8 px-3 rounded-xl glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] focus:border-[var(--accent)] text-xs font-bold text-[var(--text)] outline-none transition-colors"
                                    />

                                    <AutoResizeTextarea
                                      minRows={3}
                                      value={sub.body}
                                      onChange={(e) => {
                                        const nextSubs = [
                                          ...(card.subItems || []),
                                        ];
                                        nextSubs[subIdx] = {
                                          ...nextSubs[subIdx],
                                          body: e.target.value,
                                        };
                                        handleUpdateCard(sIdx, cIdx, {
                                          subItems: nextSubs,
                                        });
                                      }}
                                      placeholder={t(
                                        "visual_editor_sub_body_ph",
                                        "Write block content..."
                                      )}
                                      className="w-full bg-transparent text-xs sm:text-[13px] text-[color-mix(in_srgb,var(--text)_88%,transparent)] leading-relaxed outline-none"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Card Footer Bar: Add Sub-Block Action (Keeps Top Heading Row 100% Un-Squished) */}
                          <div className="flex items-center justify-between pt-0.5">
                            <button
                              type="button"
                              onClick={() => handleAddSubItem(sIdx, cIdx)}
                              className="h-7 px-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[var(--text)] text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-all"
                            >
                              <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                                {t("icon_add", "add")}
                              </span>
                              <span>
                                {t("visual_editor_add_block", "Add Sub-Block")}
                              </span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Per-Section Inline Images (Click Trash to Remove) */}
                {section.images && section.images.length > 0 && (
                  <div className="flex flex-col gap-2.5 w-full">
                    {section.images.map((src, imgIdx) => (
                      <div
                        key={`sec-${sIdx}-img-${imgIdx}-${src}`}
                        className="glass-panel rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_12%,transparent)] relative group/img"
                      >
                        <img
                          src={src}
                          alt=""
                          className="w-full max-h-72 object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveSectionImage(sIdx, imgIdx)}
                          className="absolute top-3 right-3 w-8 h-8 rounded-xl glass-panel border border-[color-mix(in_srgb,var(--text)_16%,transparent)] text-[var(--text)] hover:text-[var(--danger)] flex items-center justify-center cursor-pointer transition-all shadow-lg"
                        >
                          <span className="material-symbols-outlined !text-[16px]">
                            {t("icon_delete", "delete")}
                          </span>
                          <HoverTooltip title={t("remove", "Remove")} variant="danger" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Per-Section Quick Add Controls */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleAddCardToSection(sIdx)}
                    className="h-8 px-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[var(--text)] text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                      {t("icon_add_box", "add_box")}
                    </span>
                    <span>{t("visual_editor_add_card", "Add Card")}</span>
                  </button>
                  {!hasLead && (
                    <button
                      type="button"
                      onClick={() => {
                        handleUpdateSection(sIdx, { description: "" });
                        scrollAndFocusTarget(leadKey, false);
                      }}
                      className="h-8 px-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[var(--text)] text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                        {t("icon_notes", "notes")}
                      </span>
                      <span>
                        {t("visual_editor_add_summary", "Section Summary")}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Bottom Action Bar (Matching Top Bar for Quick Access at Bottom of Post) */}
          <div className="glass-panel p-3 rounded-2xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <div className="px-2.5 py-1 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5">
                <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                  {t("icon_dashboard", "dashboard")}
                </span>
                <span>
                  {`${visualDoc.sections.length} ${t("visual_editor_sections_label", "Sections")} • ${visualDoc.sections.reduce((acc, s) => acc + s.cards.length, 0)} ${t("visual_editor_cards_label", "Cards")}`}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!hasIntro && (
                <button
                  type="button"
                  onClick={handleAddIntro}
                  className="h-8 px-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                    {t("icon_short_text", "short_text")}
                  </span>
                  <span>{t("visual_editor_add_intro", "Add Intro")}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => handleQuickAddCard("bottom")}
                className="h-8 px-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                  {t("icon_add_box", "add_box")}
                </span>
                <span>{t("visual_editor_add_card", "Add Card")}</span>
              </button>
              <button
                type="button"
                onClick={() => handleAddSection("bottom")}
                className="h-8 px-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                  {t("icon_post_add", "post_add")}
                </span>
                <span>{t("visual_editor_new_section", "New Section")}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODE 2: RICH TEXT (TIPTAP WYSIWYG)
         ===================================================================== */}
      {mode === "wysiwyg" && (
        <div
          className={`w-full glass-panel rounded-2xl transition-all duration-300 flex flex-col relative overflow-visible ${minHeightClass}`}
        >
          {editor && (
            <div className="sticky top-2 z-30 mx-auto mt-3 mb-1 px-2 py-1 rounded-full glass-panel flex items-center gap-0.5 flex-wrap justify-center max-w-[95%]">
              <ToolbarBtn
                onClick={() => editor.chain().focus().toggleBold().run()}
                active={editor.isActive("bold")}
                icon={t("icon_format_bold", "format_bold")}
                title={t("bold", "Bold")}
              />
              <ToolbarBtn
                onClick={() => editor.chain().focus().toggleItalic().run()}
                active={editor.isActive("italic")}
                icon={t("icon_format_italic", "format_italic")}
                title={t("italic", "Italic")}
              />
              <div className="w-px h-4 bg-[var(--border)] opacity-50 mx-1" />
              <ToolbarBtn
                onClick={() =>
                  editor.chain().focus().toggleHeading({ level: 1 }).run()
                }
                active={editor.isActive("heading", { level: 1 })}
                icon={t("icon_format_h1", "format_h1")}
                title={t("heading_1", "Heading 1")}
              />
              <ToolbarBtn
                onClick={() =>
                  editor.chain().focus().toggleHeading({ level: 2 }).run()
                }
                active={editor.isActive("heading", { level: 2 })}
                icon={t("icon_format_h2", "format_h2")}
                title={t("heading_2", "Heading 2")}
              />
              <div className="w-px h-4 bg-[var(--border)] opacity-50 mx-1" />
              <ToolbarBtn
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                active={editor.isActive("bulletList")}
                icon={t("icon_format_list_bulleted", "format_list_bulleted")}
                title={t("bullet_list", "Bullet List")}
              />
              <ToolbarBtn
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                active={editor.isActive("orderedList")}
                icon={t("icon_format_list_numbered", "format_list_numbered")}
                title={t("numbered_list", "Numbered List")}
              />
              <ToolbarBtn
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
                active={editor.isActive("blockquote")}
                icon={t("icon_format_quote", "format_quote")}
                title={t("quote", "Quote")}
              />
              <div className="w-px h-4 bg-[var(--border)] opacity-50 mx-1" />
              <ToolbarBtn
                onClick={() => setShowImagePrompt(!showImagePrompt)}
                active={showImagePrompt}
                icon={t("icon_add_photo_alternate", "add_photo_alternate")}
                title={t("insert_inline_image", "Insert Inline Image")}
              />
              {editor.isActive("image") && (
                <ToolbarBtn
                  onClick={() => editor.chain().focus().deleteSelection().run()}
                  active={true}
                  icon={t("icon_delete", "delete")}
                  title={t("remove", "Remove")}
                />
              )}
              <ToolbarBtn
                onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                active={editor.isActive("codeBlock")}
                icon={t("icon_code", "code")}
                title={t("code_block", "Code Block")}
              />
              <ToolbarBtn
                onClick={() =>
                  editor.chain().focus().setHorizontalRule().run()
                }
                icon={t("icon_horizontal_rule", "horizontal_rule")}
                title={t("divider", "Divider")}
              />
              <div className="w-px h-4 bg-[var(--border)] opacity-50 mx-1" />
              <div className="relative flex items-center justify-center">
                <div className="relative group flex items-center justify-center">
                  <button
                    ref={emoteBtnRef}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setShowEmotePicker(!showEmotePicker);
                    }}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                      showEmotePicker
                        ? "glass-surface text-[var(--accent)] border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] scale-105"
                        : "text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[rgba(var(--text-rgb),0.06)] border border-transparent"
                    }`}
                  >
                    <span className="material-symbols-outlined !text-[16px] leading-none pointer-events-none">
                      {t("icon_sentiment_satisfied", "sentiment_satisfied")}
                    </span>
                  </button>
                  <HoverTooltip
                    title={t("insert_emote", "Insert Emote")}
                    variant="accent"
                  />
                </div>
                {showEmotePicker && (
                  <IconPicker
                    onClose={() => setShowEmotePicker(false)}
                    onSelect={(iconKey: string) => {
                      editor.chain().focus().insertContent(`[ICON:${iconKey}] `).run();
                      setShowEmotePicker(false);
                    }}
                  />
                )}
              </div>
            </div>
          )}

          {showImagePrompt && editor && (
            <div className="mx-4 my-2 p-2.5 rounded-xl glass-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-[var(--accent)] !text-sm ml-1">
                {t("icon_link", "link")}
              </span>
              <input
                type="text"
                placeholder={t(
                  "paste_direct_image_url_https",
                  "Paste direct image URL (https://...)"
                )}
                value={inlineImgUrl}
                onChange={(e) => setInlineImgUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && inlineImgUrl.trim()) {
                    e.preventDefault();
                    editor
                      .chain()
                      .focus()
                      .setImage({ src: inlineImgUrl.trim() })
                      .run();
                    setInlineImgUrl("");
                    setShowImagePrompt(false);
                  }
                }}
                className="flex-1 bg-transparent text-xs text-[var(--text)] outline-none font-mono"
                autoFocus
              />
              <ActionButton
                variant="accent"
                onClick={() => {
                  if (inlineImgUrl.trim()) {
                    editor
                      .chain()
                      .focus()
                      .setImage({ src: inlineImgUrl.trim() })
                      .run();
                    setInlineImgUrl("");
                    setShowImagePrompt(false);
                  }
                }}
                className="!px-3 !py-1.5 !text-[10px] !rounded-xl shrink-0"
              >
                {t("ql_add", "Add")}
              </ActionButton>
              <ActionButton
                variant="glass"
                icon={t("icon_close", "close")}
                onClick={() => setShowImagePrompt(false)}
                className="!px-2.5 !py-1.5 !text-[10px] !rounded-xl shrink-0"
              />
            </div>
          )}

          <div
            className="flex-1 cursor-text flex flex-col"
            onClick={() => editor?.commands.focus()}
          >
            {editor ? (
              <EditorContent editor={editor} className="flex-1" />
            ) : (
              <textarea
                value={content}
                onChange={(e) => onContentChange(e.target.value)}
                placeholder={placeholder}
                className="w-full flex-1 min-h-[260px] p-5 bg-transparent text-xs sm:text-sm text-[var(--text)] outline-none resize-y leading-relaxed"
              />
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          MODE 3: RAW MARKDOWN SOURCE
         ===================================================================== */}
      {mode === "markdown" && (
        <div className="glass-panel rounded-2xl p-4 flex flex-col gap-3">
          <textarea
            value={content}
            onChange={(e) => syncMarkdown(e.target.value)}
            placeholder={
              placeholder ||
              t(
                "keepers_web_directives_body_ph",
                "Write or paste Markdown content..."
              )
            }
            className="w-full min-h-[320px] p-4 rounded-xl glass-surface font-mono text-xs text-[var(--text)] leading-relaxed outline-none focus:border-[var(--accent)] resize-y custom-scrollbar"
          />
        </div>
      )}
    </div>
  );
}

export function PostAttachmentsManager({
  content,
  onContentChange,
  editor,
  onOpenAssetLinker,
  imageUrl,
  onImageUrlChange,
  showCodeInput,
  onToggleCodeInput,
  codeSnippet,
  onCodeSnippetChange,
  pollData,
  onPollDataChange,
}: {
  content: string;
  onContentChange: (nextMd: string) => void;
  editor?: Editor | null;
  onOpenAssetLinker?: () => void;
  imageUrl?: string;
  onImageUrlChange?: (val: string) => void;
  showCodeInput?: boolean;
  onToggleCodeInput?: (show: boolean) => void;
  codeSnippet?: string;
  onCodeSnippetChange?: (val: string) => void;
  pollData?: DispatchPollData | null;
  onPollDataChange?: (val: DispatchPollData | null) => void;
}) {
  const { t } = useLexicon();
  const linkedAssets = useMemo(
    () => extractLinkedAssetsFromMarkdown(content),
    [content]
  );

  const inlineImages = useMemo(() => {
    if (!content) return [];
    const results: { url: string; rawTag: string }[] = [];
    const mdImgRegex = /!\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
    let m: RegExpExecArray | null;
    while ((m = mdImgRegex.exec(content)) !== null) {
      const url = (m[1] || "").trim();
      if (url && !url.startsWith("icon://") && !url.startsWith("asset://")) {
        results.push({ url, rawTag: m[0] });
      }
    }
    const htmlImgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    while ((m = htmlImgRegex.exec(content)) !== null) {
      const url = (m[1] || "").trim();
      if (url && !url.startsWith("icon://") && !url.startsWith("asset://")) {
        results.push({ url, rawTag: m[0] });
      }
    }
    return results;
  }, [content]);

  const handleRemoveInlineImage = (item: { url: string; rawTag: string }) => {
    const nextMd = content
      .replace(item.rawTag, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    onContentChange(nextMd);
    if (editor && !editor.isDestroyed) {
      editor.commands.setContent(nextMd, { emitUpdate: false });
    }
  };

  const handleRemoveAsset = (asset: LinkedAssetItem) => {
    const nextMd = content
      .replace(asset.rawTag, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    onContentChange(nextMd);
    if (editor && !editor.isDestroyed) {
      editor.commands.setContent(nextMd, { emitUpdate: false });
    }
  };

  const resolveAssetIcon = (type: string) => {
    if (type === "mod") return t("icon_inventory_2", "inventory_2");
    if (type === "blueprint") return t("icon_architecture", "architecture");
    if (type === "theme" || type === "chameleon") return t("icon_palette", "palette");
    if (type === "lexicon") return t("icon_translate", "translate");
    if (type === "workbench_template") return t("icon_description", "description");
    if (type === "mason") return t("icon_engineering", "engineering");
    return t("icon_link", "link");
  };

  const resolveAssetTypeLabel = (type: string) => {
    if (type === "mod") return t("term_mod", "{Mod}");
    if (type === "blueprint") return t("term_blueprint", "{Blueprint}");
    if (type === "theme" || type === "chameleon") return t("chameleon", "Theme");
    if (type === "lexicon") return t("lexicon", "Lexicon");
    if (type === "workbench_template") return t("template", "Template");
    if (type === "mason") return t("term_mason", "{Mason}");
    return type;
  };

  const hasCode = Boolean(showCodeInput || (codeSnippet && codeSnippet.trim()));

  return (
    <UniversalGroup
      icon={t("icon_attach_file", "attach_file")}
      title={t("resources", "Resources")}
      headerAction={
        <div className="flex items-center gap-2">
          {onOpenAssetLinker && (
            <ActionButton
              variant="accent"
              icon={t("icon_add_link", "add_link")}
              onClick={onOpenAssetLinker}
              className="!px-3 !py-1 !text-[10px] !rounded-xl"
            >
              {t("btn_select_assets", "Select Assets")}
              {linkedAssets.length > 0 ? ` (${linkedAssets.length})` : ""}
            </ActionButton>
          )}
          {onCodeSnippetChange && onToggleCodeInput && (
            <ActionButton
              variant={hasCode ? "danger" : "glass"}
              icon={
                hasCode
                  ? t("icon_delete", "delete")
                  : t("icon_terminal", "terminal")
              }
              onClick={() => {
                if (hasCode) {
                  onCodeSnippetChange("");
                  onToggleCodeInput(false);
                } else {
                  onToggleCodeInput(true);
                }
              }}
              className="!px-3 !py-1 !text-[10px] !rounded-xl"
            >
              {hasCode
                ? t("clear", "Clear")
                : t("btn_view_code", "View Code Snippet")}
            </ActionButton>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-3 w-full">
        {/* 1. Compact Single-Row Cover Image Bar (No Nested Box-in-Box) */}
        {onImageUrlChange && (
          <div className="glass-surface rounded-xl px-3.5 h-11 flex items-center gap-2.5">
            <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0">
              {t("icon_image", "image")}
            </span>
            <input
              type="text"
              value={imageUrl || ""}
              onChange={(e) => onImageUrlChange(e.target.value)}
              placeholder={t(
                "header_image_placeholder",
                "Header Image URL (Optional https://...)"
              )}
              className="flex-1 min-w-0 bg-transparent text-xs font-mono text-[var(--text)] outline-none"
            />
            {imageUrl && (
              <>
                <div className="w-11 h-7 rounded-lg overflow-hidden border border-[rgba(var(--text-rgb),0.14)] shrink-0">
                  <img
                    src={imageUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onImageUrlChange("")}
                  className="w-7 h-7 rounded-lg glass-panel text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[14px]">
                    {t("icon_close", "close")}
                  </span>
                </button>
              </>
            )}
          </div>
        )}

        {/* 1b. Attached Inline Body Images (Click X to Remove From Body) */}
        {inlineImages.map((imgItem, idx) => (
          <div
            key={`inline-img-${idx}-${imgItem.url}`}
            className="glass-surface rounded-xl px-3.5 h-11 flex items-center gap-2.5"
          >
            <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0">
              {t("icon_add_photo_alternate", "add_photo_alternate")}
            </span>
            <span className="flex-1 min-w-0 text-xs font-mono text-[var(--text)] truncate">
              {imgItem.url}
            </span>
            <div className="w-11 h-7 rounded-lg overflow-hidden border border-[rgba(var(--text-rgb),0.14)] shrink-0">
              <img
                src={imgItem.url}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
            <button
              type="button"
              onClick={() => handleRemoveInlineImage(imgItem)}
              className="w-7 h-7 rounded-lg glass-panel text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center shrink-0 cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[14px]">
                {t("icon_close", "close")}
              </span>
            </button>
          </div>
        ))}

        {/* 2. Linked Nexus Assets Grid (Shown When Assets Are Attached) */}
        {linkedAssets.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {linkedAssets.map((asset) => (
              <div
                key={`${asset.type}-${asset.id}`}
                className="glass-surface rounded-xl p-2.5 flex items-center justify-between gap-2.5"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg glass-panel flex items-center justify-center text-[var(--accent)] shrink-0">
                    <span className="material-symbols-outlined !text-[16px]">
                      {resolveAssetIcon(asset.type)}
                    </span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold text-[var(--text)] truncate">
                      {asset.label}
                    </span>
                    <span className="text-[9px] font-black uppercase tracking-wider text-[var(--subtext)]">
                      {resolveAssetTypeLabel(asset.type)}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveAsset(asset)}
                  className="w-7 h-7 rounded-lg glass-panel hover:text-[var(--danger)] text-[var(--subtext)] flex items-center justify-center shrink-0 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[14px]">
                    {t("icon_close", "close")}
                  </span>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 3. Code Block (Shown Only When Toggled) */}
        {onCodeSnippetChange && hasCode && (
          <textarea
            value={codeSnippet || ""}
            onChange={(e) => onCodeSnippetChange(e.target.value)}
            placeholder={t(
              "paste_raw_code_json_or_crash_logs_here",
              "Paste raw code, JSON, or crash logs here..."
            )}
            className="w-full h-28 p-3.5 rounded-xl glass-surface text-xs text-[var(--accent)] font-mono outline-none focus:border-[var(--accent)] resize-y leading-relaxed custom-scrollbar"
          />
        )}

        {/* 4. Community Poll Builder */}
        {onPollDataChange && (
          <DispatchPollBuilder
            pollData={pollData || null}
            onChange={onPollDataChange}
          />
        )}
      </div>
    </UniversalGroup>
  );
}
