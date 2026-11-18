import {
  useState,
  useRef,
  useEffect,
} from "react";
import { useLexicon } from "../../../LexiconContext";
import { HoverTooltip } from "../../../shared-components/alerts";
import IconPicker from "../../../shared-components/IconPicker";
import {
  parseMarkdownIntoReleaseSections,
  ParsedReleaseSection,
  ParsedReleaseCard,
} from "../../release-notes/releaseMarkdownParser";

import { AutoResizeTextarea, serializeReleaseSectionsToMarkdown } from "./postEditorPrimitives";

export function StructuredPostSectionsBuilder({
  content,
  onContentChange,
  placeholder,
}: {
  content: string;
  onContentChange: (nextMarkdown: string) => void;
  placeholder?: string;
}) {
  const { t } = useLexicon();
  const lastSerializedRef = useRef<string>(content);
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
  const [confirmDeleteSecIdx, setConfirmDeleteSecIdx] = useState<number | null>(null);
  const [confirmDeleteCardKey, setConfirmDeleteCardKey] = useState<string | null>(null);
  const [visibleEmptyHeaders, setVisibleEmptyHeaders] = useState<Record<number, boolean>>({});

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
    if (content !== lastSerializedRef.current) {
      lastSerializedRef.current = content;
      setVisualDoc(parseMarkdownIntoReleaseSections(content));
      setVisibleEmptyHeaders({});
      setConfirmDeleteIntro(false);
      setConfirmDeleteSecIdx(null);
      setConfirmDeleteCardKey(null);
    }
  }, [content]);

  const commitVisualDoc = (nextDoc: {
    introTitle: string;
    introIcon?: string;
    intro: string;
    introImages?: string[];
    sections: ParsedReleaseSection[];
  }) => {
    setVisualDoc(nextDoc);
    const nextMd = serializeReleaseSectionsToMarkdown(nextDoc, content);
    lastSerializedRef.current = nextMd;
    onContentChange(nextMd);
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
                      className={`md:hidden w-8 h-8 rounded-xl glass-surface sa-glass-pill-hover border flex items-center justify-center cursor-pointer transition-all ${openActionMenuKey === "intro"
                        ? "border-[var(--accent)] text-[var(--accent)]"
                        : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
                        }`}
                    >
                      <span className="material-symbols-outlined !text-[16px]">
                        {t("icon_more_vert", "more_vert")}
                      </span>
                    </button>

                    <div
                      className={`${openActionMenuKey === "intro"
                        ? "flex absolute right-0 top-[calc(100%+6px)] z-[220] glass-panel portal-glass-fix sa-dropdown-popover sa-inline-md-toolbar p-1.5 rounded-2xl"
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
                        className={`h-8 rounded-xl glass-surface border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${confirmDeleteIntro
                          ? "px-3 sa-glass-pill-danger !text-[var(--text)]"
                          : "w-8 sa-glass-pill-hover border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
                          }`}
                      >
                        <span
                          className={`material-symbols-outlined !text-[15px] ${confirmDeleteIntro ? "text-[var(--danger)]" : ""
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
                        className={`md:hidden w-8 h-8 rounded-xl glass-surface sa-glass-pill-hover border flex items-center justify-center cursor-pointer transition-all ${openActionMenuKey === `sec-${sIdx}`
                          ? "border-[var(--accent)] text-[var(--accent)]"
                          : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
                          }`}
                      >
                        <span className="material-symbols-outlined !text-[16px]">
                          {t("icon_more_vert", "more_vert")}
                        </span>
                      </button>

                      <div
                        className={`${openActionMenuKey === `sec-${sIdx}`
                          ? "flex absolute right-0 top-[calc(100%+6px)] z-[220] glass-panel portal-glass-fix sa-dropdown-popover sa-inline-md-toolbar p-1.5 rounded-2xl"
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
                          className={`h-8 rounded-xl glass-surface border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${confirmDeleteSecIdx === sIdx
                            ? "px-3 sa-glass-pill-danger !text-[var(--text)]"
                            : "w-8 sa-glass-pill-hover border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
                            }`}
                        >
                          <span
                            className={`material-symbols-outlined !text-[15px] ${confirmDeleteSecIdx === sIdx
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
                          className={`glass-panel rounded-3xl p-3.5 sm:p-5 flex flex-col gap-3 relative group transition-colors focus-within:!border-[color-mix(in_srgb,var(--accent)_45%,transparent)] ${spanFull ? "md:col-span-2" : ""
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
                                className={`md:hidden w-8 h-8 rounded-xl glass-surface sa-glass-pill-hover border flex items-center justify-center cursor-pointer transition-all ${openActionMenuKey === cardKey
                                  ? "border-[var(--accent)] text-[var(--accent)]"
                                  : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
                                  }`}
                              >
                                <span className="material-symbols-outlined !text-[16px]">
                                  {t("icon_more_vert", "more_vert")}
                                </span>
                              </button>

                              <div
                                className={`${openActionMenuKey === cardKey
                                  ? "flex absolute right-0 top-[calc(100%+6px)] z-[220] glass-panel portal-glass-fix sa-dropdown-popover sa-inline-md-toolbar p-1.5 rounded-2xl"
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
                                  className={`h-7 rounded-lg glass-surface border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${confirmDeleteCardKey === `${sIdx}-${cIdx}`
                                    ? "px-2.5 sa-glass-pill-danger !text-[var(--text)]"
                                    : "w-7 sa-glass-pill-hover border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
                                    }`}
                                >
                                  <span
                                    className={`material-symbols-outlined !text-[14px] ${confirmDeleteCardKey === `${sIdx}-${cIdx}`
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
                              className={`grid gap-3 ${card.subItems.length > 1
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
                                    className={`rounded-2xl p-3.5 sm:p-4 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus-within:!border-[color-mix(in_srgb,var(--accent)_50%,transparent)] flex flex-col gap-2.5 relative group/sub transition-colors ${isLastOddSub ? "md:col-span-2" : ""
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
  );
}
