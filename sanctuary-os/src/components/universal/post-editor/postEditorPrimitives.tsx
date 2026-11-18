import {
  useRef,
  useEffect,
  useLayoutEffect,
} from "react";
import { useLexicon } from "../../../LexiconContext";
import {
  DashboardStatTile,
  SidePanelFilterBar,
} from "../../../shared-components/layout";
import { ParsedReleaseSection } from "../../release-notes/releaseMarkdownParser";


export function AutoResizeTextarea({
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
    <SidePanelFilterBar className="grid-cols-3 gap-3">
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
    </SidePanelFilterBar>
  );
}

