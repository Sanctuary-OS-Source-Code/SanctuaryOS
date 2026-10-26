import React, { useState, useRef, useMemo, useEffect } from "react";
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
    const codeBlocks: string[] = [];
    for (const card of section.cards) {
      if (card.codeBlock && card.codeBlock.trim()) {
        codeBlocks.push(`\`\`\`\n${card.codeBlock.trim()}\n\`\`\``);
      }
      const cardTitle = (card.title || "").trim();
      const cardIconPrefix = card.icon ? `[ICON:${card.icon}] ` : "";
      const cardBody = (card.paragraphs || [])
        .map((p) => p.trim())
        .filter(Boolean)
        .join(" ");

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
  const [visualDoc, setVisualDoc] = useState<{
    introTitle: string;
    introIcon?: string;
    intro: string;
    introImages?: string[];
    sections: ParsedReleaseSection[];
  }>(() => parseMarkdownIntoReleaseSections(content));
  const [activeTarget, setActiveTarget] = useState<string | null>(null);
  const [iconPickerFor, setIconPickerFor] = useState<string | null>(null);

  useEffect(() => {
    if (content !== lastSerializedRef.current) {
      lastSerializedRef.current = content;
      setVisualDoc(parseMarkdownIntoReleaseSections(content));
    }
  }, [content, mode]);

  const syncMarkdown = (nextMd: string) => {
    lastSerializedRef.current = nextMd;
    onContentChange(nextMd);
    if (editor && !editor.isDestroyed) {
      const currentMd =
        (editor.storage as any)?.markdown?.getMarkdown?.() ?? "";
      if (currentMd !== nextMd) {
        editor.commands.setContent(nextMd);
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
    syncMarkdown(nextMd);
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

  // Visual Builder mutations
  const handleAddIntro = () => {
    const next = {
      ...visualDoc,
      intro: visualDoc.intro || "",
    };
    setVisualDoc(next);
    setActiveTarget("intro");
  };

  const handleDeleteIntro = () => {
    const next = {
      ...visualDoc,
      introTitle: "",
      intro: "",
    };
    commitVisualDoc(next);
    if (activeTarget === "intro") setActiveTarget(null);
  };

  const handleAddSection = (position: "top" | "bottom" = "bottom") => {
    const newSecNum = visualDoc.sections.length + 1;
    const newSection: ParsedReleaseSection = {
      title: `${t("visual_editor_section_default", "Section")} ${newSecNum}`,
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
    const next = { ...visualDoc, sections: nextSections };
    commitVisualDoc(next);
    setActiveTarget(`sec-${targetSecIdx}-card-0`);
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
    const nextSections = visualDoc.sections.filter((_, idx) => idx !== sIdx);
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
    setActiveTarget(null);
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
    setActiveTarget(`sec-${sIdx}-card-${newCardIdx}`);
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
    setActiveTarget(`sec-${sIdx}-card-${targetIdx}`);
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
            ? "glass-surface text-[var(--accent)] border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] scale-105"
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
    activeTarget === "intro";

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
              <div className="px-2.5 py-1 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] flex items-center gap-1.5">
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
                className="h-8 px-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[var(--accent)] text-[10px] font-black uppercase tracking-wider text-[var(--text)] hover:text-[var(--accent)] flex items-center gap-1.5 transition-all cursor-pointer"
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
                className="h-8 px-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[var(--accent)] text-[10px] font-black uppercase tracking-wider text-[var(--text)] hover:text-[var(--accent)] flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                  {t("icon_add_box", "add_box")}
                </span>
                <span>{t("visual_editor_add_card", "Add Card")}</span>
              </button>
              <button
                type="button"
                onClick={() => handleAddSection("top")}
                className="h-8 px-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:border-[var(--accent)] text-[10px] font-black uppercase tracking-wider text-[var(--accent)] flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[15px]">
                  {t("icon_post_add", "post_add")}
                </span>
                <span>{t("visual_editor_new_section", "New Section")}</span>
              </button>
            </div>
          </div>

          {/* Top Intro Block (Click to Edit or Delete + Clickable Icon Picker) */}
          {hasIntro && (
            <div className="flex flex-col gap-2.5 w-full">
              {activeTarget === "intro" ? (
                <div className="glass-panel rounded-2xl p-4 flex flex-col gap-3 !border-[color-mix(in_srgb,var(--accent)_45%,transparent)]">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[rgba(var(--text-rgb),0.08)]">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)] flex items-center gap-1.5">
                      <span className="material-symbols-outlined !text-[14px]">
                        {t("icon_short_text", "short_text")}
                      </span>
                      {t("overview", "Overview")}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleDeleteIntro()}
                        className="h-7 px-2.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] hover:border-[var(--danger)] text-[var(--danger)] text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer"
                      >
                        <span className="material-symbols-outlined !text-[13px]">
                          {t("icon_delete", "delete")}
                        </span>
                        <span>{t("btn_delete", "{Delete}")}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTarget(null)}
                        className="h-7 px-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:border-[var(--accent)] text-[var(--accent)] text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer"
                      >
                        <span className="material-symbols-outlined !text-[13px]">
                          {t("icon_check", "check")}
                        </span>
                        <span>{t("btn_done", "Done")}</span>
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 w-full">
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setIconPickerFor(
                            iconPickerFor === "intro" ? null : "intro"
                          )
                        }
                        className="h-10 px-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:border-[var(--accent)] text-[var(--accent)] flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <span className="material-symbols-outlined !text-[18px]">
                          {resolveSectionIcon(
                            visualDoc.introTitle || "Welcome",
                            visualDoc.introIcon || "verified"
                          )}
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-wider">
                          {t("visual_editor_icon_btn", "Icon")}
                        </span>
                        <span className="material-symbols-outlined !text-[14px] opacity-70">
                          {t("icon_expand_more", "expand_more")}
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
                      placeholder={t("post_title", "Heading (Optional)...")}
                      className="flex-1 min-w-0 h-10 px-3.5 rounded-xl glass-surface text-xs font-bold text-[var(--text)] outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                  <textarea
                    rows={3}
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
                    className="w-full p-3.5 rounded-xl glass-surface text-xs text-[var(--text)] leading-relaxed outline-none focus:border-[var(--accent)] resize-y custom-scrollbar"
                    autoFocus
                  />
                </div>
              ) : (
                <div
                  onClick={() => setActiveTarget("intro")}
                  className="glass-panel rounded-2xl p-4 sm:p-5 flex flex-col gap-2.5 relative group cursor-pointer transition-all hover:!border-[color-mix(in_srgb,var(--text)_24%,transparent)]"
                >
                  <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                    <div
                      className="relative"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setIconPickerFor(
                            iconPickerFor === "intro-view" ? null : "intro-view"
                          )
                        }
                        className="h-7 px-2 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--accent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center gap-1 cursor-pointer transition-all"
                      >
                        <span className="material-symbols-outlined !text-[14px]">
                          {t("icon_add_reaction", "add_reaction")}
                        </span>
                        <span className="text-[9px] font-black uppercase tracking-wider">
                          {t("visual_editor_icon_btn", "Icon")}
                        </span>
                        <HoverTooltip title={t("visual_editor_pick_icon", "Pick Icon")} />
                      </button>
                      {iconPickerFor === "intro-view" && (
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
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveTarget("intro");
                      }}
                      className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] flex items-center justify-center cursor-pointer"
                    >
                      <span className="material-symbols-outlined !text-[14px]">
                        {t("icon_edit", "edit")}
                      </span>
                      <HoverTooltip title={t("edit", "Edit")} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteIntro();
                      }}
                      className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center cursor-pointer"
                    >
                      <span className="material-symbols-outlined !text-[14px]">
                        {t("icon_delete", "delete")}
                      </span>
                      <HoverTooltip title={t("btn_delete", "{Delete}")} variant="danger" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2.5 pr-28">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIconPickerFor(
                          iconPickerFor === "intro-view" ? null : "intro-view"
                        );
                      }}
                      className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:border-[var(--accent)] flex items-center justify-center shrink-0 text-[var(--accent)] cursor-pointer transition-all"
                    >
                      <span className="material-symbols-outlined !text-[17px]">
                        {resolveSectionIcon(
                          visualDoc.introTitle || "Welcome",
                          visualDoc.introIcon || "verified"
                        )}
                      </span>
                      <HoverTooltip title={t("visual_editor_pick_icon", "Pick Icon")} />
                    </button>
                    {visualDoc.introTitle && (
                      <h3 className="text-sm sm:text-base font-black text-[var(--text)]">
                        {visualDoc.introTitle}
                      </h3>
                    )}
                  </div>
                  <p className="text-xs sm:text-[13px] text-[var(--text)] opacity-85 leading-relaxed pr-12">
                    {visualDoc.intro || t("edit", "Click to edit...")}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Sections & 2-Column Info Cards (Click Any Section or Card to Edit/Delete + Pick Icons) */}
          {visualDoc.sections.map((section, sIdx) => {
            const leadKey = `sec-${sIdx}-lead`;
            const isLeadEditing = activeTarget === leadKey;
            const hasLead =
              Boolean(section.description && section.description.trim()) ||
              isLeadEditing;
            const secIconPickerKey = `sec-${sIdx}-icon`;

            return (
              <div
                key={`visual-sec-${sIdx}`}
                className="flex flex-col gap-3.5 w-full"
              >
                {/* Sculpted Section Header Bar with Clickable Icon Picker & Section Actions */}
                <div className="glass-panel px-3.5 py-2.5 rounded-2xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 flex-1 min-w-[200px]">
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
                        className="h-9 px-2.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:border-[var(--accent)] text-[var(--accent)] flex items-center gap-1 cursor-pointer transition-all"
                      >
                        <span className="material-symbols-outlined !text-[18px]">
                          {resolveSectionIcon(section.title, section.icon)}
                        </span>
                        <span className="material-symbols-outlined !text-[13px] opacity-70">
                          {t("icon_expand_more", "expand_more")}
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
                      placeholder={t("post_title", "Section Title...")}
                      className="flex-1 min-w-0 bg-transparent text-sm sm:text-base font-black tracking-tight text-[var(--text)] border-b border-transparent hover:border-[rgba(var(--text-rgb),0.18)] focus:border-[var(--accent)] outline-none py-0.5 transition-colors"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setIconPickerFor(
                          iconPickerFor === secIconPickerKey
                            ? null
                            : secIconPickerKey
                        )
                      }
                      className="h-7 px-2.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--accent)] text-[var(--subtext)] hover:text-[var(--accent)] text-[9px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-all"
                    >
                      <span className="material-symbols-outlined !text-[14px]">
                        {t("icon_add_reaction", "add_reaction")}
                      </span>
                      <span className="hidden sm:inline">
                        {t("visual_editor_icon_btn", "Icon")}
                      </span>
                      <HoverTooltip title={t("visual_editor_pick_icon", "Pick Icon")} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddCardToSection(sIdx)}
                      className="h-7 px-2.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:border-[var(--accent)] text-[var(--accent)] text-[9px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-all"
                    >
                      <span className="material-symbols-outlined !text-[14px]">
                        {t("icon_add", "add")}
                      </span>
                      <span className="hidden sm:inline">
                        {t("visual_editor_add_card", "Add Card")}
                      </span>
                      <HoverTooltip title={t("visual_editor_add_card", "Add Card")} />
                    </button>
                    <button
                      type="button"
                      disabled={sIdx === 0}
                      onClick={() => handleMoveSection(sIdx, -1)}
                      className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] disabled:opacity-30 flex items-center justify-center cursor-pointer transition-all"
                    >
                      <span className="material-symbols-outlined !text-[14px]">
                        {t("icon_arrow_upward", "arrow_upward")}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={sIdx === visualDoc.sections.length - 1}
                      onClick={() => handleMoveSection(sIdx, 1)}
                      className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] disabled:opacity-30 flex items-center justify-center cursor-pointer transition-all"
                    >
                      <span className="material-symbols-outlined !text-[14px]">
                        {t("icon_arrow_downward", "arrow_downward")}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSection(sIdx)}
                      className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center cursor-pointer transition-all"
                    >
                      <span className="material-symbols-outlined !text-[14px]">
                        {t("icon_delete", "delete")}
                      </span>
                      <HoverTooltip title={t("btn_delete", "{Delete}")} variant="danger" />
                    </button>
                  </div>
                </div>

                {/* Section Lead Paragraph Box */}
                {hasLead &&
                  (isLeadEditing ? (
                    <div className="glass-panel rounded-2xl p-4 flex flex-col gap-2.5 !border-[color-mix(in_srgb,var(--accent)_45%,transparent)]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)]">
                          {t("visual_editor_add_summary", "Section Summary")}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              handleUpdateSection(sIdx, {
                                description: undefined,
                              });
                              setActiveTarget(null);
                            }}
                            className="h-7 px-2.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] hover:border-[var(--danger)] text-[var(--danger)] text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer"
                          >
                            <span className="material-symbols-outlined !text-[13px]">
                              {t("icon_delete", "delete")}
                            </span>
                            <span>{t("btn_delete", "{Delete}")}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveTarget(null)}
                            className="h-7 px-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:border-[var(--accent)] text-[var(--accent)] text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer"
                          >
                            <span className="material-symbols-outlined !text-[13px]">
                              {t("icon_check", "check")}
                            </span>
                            <span>{t("btn_done", "Done")}</span>
                          </button>
                        </div>
                      </div>
                      <textarea
                        rows={3}
                        value={section.description || ""}
                        onChange={(e) =>
                          handleUpdateSection(sIdx, {
                            description: e.target.value,
                          })
                        }
                        placeholder={t(
                          "post_description_ph",
                          "Section summary..."
                        )}
                        className="w-full p-3 rounded-xl glass-surface text-xs text-[var(--text)] leading-relaxed outline-none focus:border-[var(--accent)] resize-y custom-scrollbar"
                        autoFocus
                      />
                    </div>
                  ) : (
                    <div
                      onClick={() => setActiveTarget(leadKey)}
                      className="glass-panel rounded-2xl p-4 flex flex-col gap-2 relative group cursor-pointer transition-all hover:!border-[color-mix(in_srgb,var(--text)_24%,transparent)]"
                    >
                      <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveTarget(leadKey);
                          }}
                          className="w-6 h-6 rounded-lg glass-surface text-[var(--subtext)] hover:text-[var(--text)] flex items-center justify-center cursor-pointer"
                        >
                          <span className="material-symbols-outlined !text-[13px]">
                            {t("icon_edit", "edit")}
                          </span>
                          <HoverTooltip title={t("edit", "Edit")} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUpdateSection(sIdx, {
                              description: undefined,
                            });
                          }}
                          className="w-6 h-6 rounded-lg glass-surface text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center cursor-pointer"
                        >
                          <span className="material-symbols-outlined !text-[13px]">
                            {t("icon_delete", "delete")}
                          </span>
                          <HoverTooltip title={t("btn_delete", "{Delete}")} variant="danger" />
                        </button>
                      </div>
                      <p className="text-xs sm:text-[13px] text-[var(--text)] opacity-80 leading-relaxed pr-12">
                        {section.description}
                      </p>
                    </div>
                  ))}

                {/* 2-Column Info Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {section.cards.map((card, cIdx) => {
                    const cardKey = `sec-${sIdx}-card-${cIdx}`;
                    const cardIconKey = `sec-${sIdx}-card-${cIdx}-icon`;
                    const isCardEditing = activeTarget === cardKey;
                    const hasSubItems = Boolean(
                      card.subItems && card.subItems.length > 0
                    );
                    const isLastOdd =
                      !hasSubItems &&
                      section.cards.length % 2 === 1 &&
                      cIdx === section.cards.length - 1;
                    const spanFull = isCardEditing || hasSubItems || isLastOdd;
                    const bodyValue = (card.paragraphs || []).join("\n\n");

                    if (isCardEditing) {
                      return (
                        <div
                          key={cardKey}
                          className="md:col-span-2 glass-panel rounded-2xl p-4 flex flex-col gap-3 !border-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[rgba(var(--text-rgb),0.08)]">
                            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)] flex items-center gap-1.5">
                              <span className="material-symbols-outlined !text-[14px]">
                                {t("icon_edit_note", "edit_note")}
                              </span>
                              #{cIdx + 1}
                            </span>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {card.icon && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateCard(sIdx, cIdx, {
                                      icon: undefined,
                                    })
                                  }
                                  className="h-7 px-2.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] text-[9px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-all"
                                >
                                  <span className="material-symbols-outlined !text-[13px]">
                                    {t("icon_close", "close")}
                                  </span>
                                  <span>
                                    {t("visual_editor_clear_icon", "Clear Icon")}
                                  </span>
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={cIdx === 0}
                                onClick={() => handleMoveCard(sIdx, cIdx, -1)}
                                className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] disabled:opacity-30 flex items-center justify-center cursor-pointer"
                              >
                                <span className="material-symbols-outlined !text-[14px]">
                                  {t("icon_arrow_upward", "arrow_upward")}
                                </span>
                              </button>
                              <button
                                type="button"
                                disabled={cIdx === section.cards.length - 1}
                                onClick={() => handleMoveCard(sIdx, cIdx, 1)}
                                className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] disabled:opacity-30 flex items-center justify-center cursor-pointer"
                              >
                                <span className="material-symbols-outlined !text-[14px]">
                                  {t("icon_arrow_downward", "arrow_downward")}
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteCard(sIdx, cIdx)}
                                className="h-7 px-2.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] hover:border-[var(--danger)] text-[var(--danger)] text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer"
                              >
                                <span className="material-symbols-outlined !text-[13px]">
                                  {t("icon_delete", "delete")}
                                </span>
                                <span>{t("btn_delete", "{Delete}")}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setActiveTarget(null)}
                                className="h-7 px-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:border-[var(--accent)] text-[var(--accent)] text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer"
                              >
                                <span className="material-symbols-outlined !text-[13px]">
                                  {t("icon_check", "check")}
                                </span>
                                <span>{t("btn_done", "Done")}</span>
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center gap-2.5 w-full">
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
                                className="h-10 px-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:border-[var(--accent)] text-[var(--accent)] flex items-center gap-1.5 transition-all cursor-pointer"
                              >
                                <span className="material-symbols-outlined !text-[18px]">
                                  {card.icon
                                    ? t(`icon_${card.icon}`, card.icon)
                                    : t("icon_add_reaction", "add_reaction")}
                                </span>
                                <span className="text-[10px] font-black uppercase tracking-wider">
                                  {t("visual_editor_icon_btn", "Icon")}
                                </span>
                                <span className="material-symbols-outlined !text-[14px] opacity-70">
                                  {t("icon_expand_more", "expand_more")}
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
                                "post_title",
                                "Card Heading (Optional)..."
                              )}
                              className="flex-1 min-w-0 h-10 px-3.5 rounded-xl glass-surface text-xs font-bold text-[var(--text)] outline-none focus:border-[var(--accent)]"
                            />
                          </div>

                          <textarea
                            rows={3}
                            value={bodyValue}
                            onChange={(e) =>
                              handleUpdateCard(sIdx, cIdx, {
                                paragraphs: [e.target.value],
                              })
                            }
                            placeholder={t(
                              "post_description_ph",
                              "Card details..."
                            )}
                            className="w-full p-3.5 rounded-xl glass-surface text-xs text-[var(--text)] leading-relaxed outline-none focus:border-[var(--accent)] resize-y custom-scrollbar"
                            autoFocus
                          />

                          {card.subItems && card.subItems.length > 0 && (
                            <div className="flex flex-col gap-2 pt-2 border-t border-[rgba(var(--text-rgb),0.06)]">
                              {card.subItems.map((sub, subIdx) => (
                                <div
                                  key={`sub-${subIdx}`}
                                  className="grid grid-cols-1 sm:grid-cols-[0.8fr_1.4fr_auto] gap-2 items-center"
                                >
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
                                    placeholder={t("name", "Title")}
                                    className="h-8 px-3 rounded-lg glass-surface text-xs font-bold text-[var(--text)] outline-none focus:border-[var(--accent)]"
                                  />
                                  <input
                                    type="text"
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
                                    placeholder={t("value", "Details")}
                                    className="h-8 px-3 rounded-lg glass-surface text-xs text-[var(--text)] outline-none focus:border-[var(--accent)]"
                                  />
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
                                    className="w-8 h-8 rounded-lg glass-surface text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center cursor-pointer"
                                  >
                                    <span className="material-symbols-outlined !text-[14px]">
                                      {t("icon_close", "close")}
                                    </span>
                                    <HoverTooltip title={t("remove", "Remove")} variant="danger" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div
                        key={cardKey}
                        onClick={() => setActiveTarget(cardKey)}
                        className={`glass-panel rounded-2xl p-4 sm:p-5 flex flex-col gap-2 relative group cursor-pointer transition-all hover:!border-[color-mix(in_srgb,var(--text)_24%,transparent)] ${
                          spanFull ? "md:col-span-2" : ""
                        }`}
                      >
                        <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1 opacity-75 group-hover:opacity-100 transition-opacity">
                          <div
                            className="relative"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setIconPickerFor(
                                  iconPickerFor === cardIconKey
                                    ? null
                                    : cardIconKey
                                )
                              }
                              className="w-6 h-6 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center cursor-pointer"
                            >
                              <span className="material-symbols-outlined !text-[13px]">
                                {t("icon_add_reaction", "add_reaction")}
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
                          <button
                            type="button"
                            disabled={cIdx === 0}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveCard(sIdx, cIdx, -1);
                            }}
                            className="w-6 h-6 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] disabled:opacity-30 flex items-center justify-center cursor-pointer"
                          >
                            <span className="material-symbols-outlined !text-[13px]">
                              {t("icon_arrow_upward", "arrow_upward")}
                            </span>
                          </button>
                          <button
                            type="button"
                            disabled={cIdx === section.cards.length - 1}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveCard(sIdx, cIdx, 1);
                            }}
                            className="w-6 h-6 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] disabled:opacity-30 flex items-center justify-center cursor-pointer"
                          >
                            <span className="material-symbols-outlined !text-[13px]">
                              {t("icon_arrow_downward", "arrow_downward")}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveTarget(cardKey);
                            }}
                            className="w-6 h-6 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] flex items-center justify-center cursor-pointer"
                          >
                            <span className="material-symbols-outlined !text-[13px]">
                              {t("icon_edit", "edit")}
                            </span>
                            <HoverTooltip title={t("edit", "Edit")} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteCard(sIdx, cIdx);
                            }}
                            className="w-6 h-6 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center cursor-pointer"
                          >
                            <span className="material-symbols-outlined !text-[13px]">
                              {t("icon_delete", "delete")}
                            </span>
                            <HoverTooltip title={t("btn_delete", "{Delete}")} variant="danger" />
                          </button>
                        </div>

                        {(card.title || card.icon) && (
                          <div className="flex items-center gap-2.5 pr-28">
                            {card.icon && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setIconPickerFor(
                                    iconPickerFor === cardIconKey
                                      ? null
                                      : cardIconKey
                                  );
                                }}
                                className="w-7 h-7 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:border-[var(--accent)] flex items-center justify-center shrink-0 text-[var(--accent)] cursor-pointer transition-all"
                              >
                                <span className="material-symbols-outlined !text-[15px]">
                                  {t(`icon_${card.icon}`, card.icon)}
                                </span>
                                <HoverTooltip title={t("visual_editor_pick_icon", "Pick Icon")} />
                              </button>
                            )}
                            {card.title && (
                              <h3 className="text-sm font-bold text-[var(--text)] leading-snug">
                                {card.title}
                              </h3>
                            )}
                          </div>
                        )}
                        <p className="text-xs sm:text-[13px] text-[var(--text)] opacity-80 leading-relaxed pr-8">
                          {bodyValue || t("edit", "Click to edit...")}
                        </p>

                        {card.subItems && card.subItems.length > 0 && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mt-1">
                            {card.subItems.map((sub, subIdx) => (
                              <div
                                key={`sub-view-${subIdx}`}
                                className="rounded-xl p-3 glass-surface flex flex-col gap-1"
                              >
                                {sub.title && (
                                  <span className="text-xs font-bold text-[var(--text)]">
                                    {sub.title}
                                  </span>
                                )}
                                {sub.body && (
                                  <span className="text-xs text-[var(--text)] opacity-80 leading-relaxed">
                                    {sub.body}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Per-Section Quick Add Controls */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleAddCardToSection(sIdx)}
                    className="h-8 px-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:border-[var(--accent)] text-[var(--accent)] text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[15px]">
                      {t("icon_add_box", "add_box")}
                    </span>
                    <span>{t("visual_editor_add_card", "Add Card")}</span>
                  </button>
                  {!hasLead && (
                    <button
                      type="button"
                      onClick={() => {
                        handleUpdateSection(sIdx, { description: "" });
                        setActiveTarget(leadKey);
                      }}
                      className="h-8 px-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[var(--accent)] text-[var(--text)] hover:text-[var(--accent)] text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer"
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
              <div className="px-2.5 py-1 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] flex items-center gap-1.5">
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
                  className="h-8 px-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[var(--accent)] text-[10px] font-black uppercase tracking-wider text-[var(--text)] hover:text-[var(--accent)] flex items-center gap-1.5 transition-all cursor-pointer"
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
                className="h-8 px-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[var(--accent)] text-[10px] font-black uppercase tracking-wider text-[var(--text)] hover:text-[var(--accent)] flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                  {t("icon_add_box", "add_box")}
                </span>
                <span>{t("visual_editor_add_card", "Add Card")}</span>
              </button>
              <button
                type="button"
                onClick={() => handleAddSection("bottom")}
                className="h-8 px-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:border-[var(--accent)] text-[10px] font-black uppercase tracking-wider text-[var(--accent)] flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[15px]">
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

  const handleRemoveAsset = (asset: LinkedAssetItem) => {
    const nextMd = content
      .replace(asset.rawTag, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    onContentChange(nextMd);
    if (editor && !editor.isDestroyed) {
      editor.commands.setContent(nextMd);
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
