import { useMemo } from "react";
import { Editor } from "@tiptap/react";
import { useLexicon } from "../../../LexiconContext";
import { ActionButton } from "../../../shared-components/buttons";
import { HoverTooltip } from "../../../shared-components/alerts";
import { UniversalGroup } from "../UniversalLayout";
import { DispatchPollBuilder, DispatchPollData } from "../DispatchPollAndMeta";

import { extractLinkedAssetsFromMarkdown, type LinkedAssetItem } from "./postEditorPrimitives";

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
    if (type === "mod") return t("icon_deployed_code", "deployed_code");
    if (type === "blueprint") return t("icon_map", "map");
    if (type === "theme" || type === "chameleon") return t("icon_palette", "palette");
    if (type === "lexicon") return t("icon_translate", "translate");
    if (type === "workbench_template") return t("icon_draw", "draw");
    if (type === "mason") return t("icon_engineering", "engineering");
    return t("icon_link", "link");
  };

  const resolveAssetColorClass = (type: string) => {
    if (type === "mod") return "text-teal-400";
    if (type === "blueprint") return "text-blue-400";
    if (type === "theme" || type === "chameleon") return "text-purple-400";
    if (type === "lexicon") return "text-indigo-400";
    if (type === "workbench_template") return "text-pink-400";
    return "text-[var(--accent)]";
  };

  const resolveAssetTypeLabel = (type: string) => {
    if (type === "mod") return t("term_mod", "{Mod}");
    if (type === "blueprint") return t("term_blueprint", "{Blueprint}");
    if (type === "theme" || type === "chameleon") return t("chameleon", "Chameleon");
    if (type === "lexicon") return t("lexicon", "Lexicon");
    if (type === "workbench_template") return t("workbench_template", "Template");
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {linkedAssets.map((asset) => {
              const assetIcon = resolveAssetIcon(asset.type);
              const colorClass = resolveAssetColorClass(asset.type);
              const typeLabel = resolveAssetTypeLabel(asset.type);
              return (
                <div
                  key={`${asset.type}-${asset.id}`}
                  className="relative glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] flex items-center justify-between gap-3 transition-all group"
                >
                  <HoverTooltip
                    title={asset.label}
                    subtitle={typeLabel}
                    icon={assetIcon}
                    delay={120}
                  />
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-xl glass-panel border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0">
                      <span className={`material-symbols-outlined !text-[19px] ${colorClass}`}>
                        {assetIcon}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <span className="text-xs font-black tracking-tight text-[var(--text)] truncate group-hover:text-[var(--accent)] transition-colors">
                        {asset.label}
                      </span>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--subtext)] opacity-80 flex items-center gap-1 truncate">
                        <span className={`material-symbols-outlined !text-[11px] ${colorClass}`}>
                          {assetIcon}
                        </span>
                        <span className="truncate">{typeLabel}</span>
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveAsset(asset)}
                    className="relative w-8 h-8 rounded-xl glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] hover:text-[var(--danger)] text-[var(--subtext)] flex items-center justify-center shrink-0 transition-all cursor-pointer"
                  >
                    <HoverTooltip
                      title={t("remove", "Remove")}
                      icon={t("icon_close", "close")}
                      variant="danger"
                      delay={120}
                    />
                    <span className="material-symbols-outlined !text-[15px]">
                      {t("icon_close", "close")}
                    </span>
                  </button>
                </div>
              );
            })}
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

