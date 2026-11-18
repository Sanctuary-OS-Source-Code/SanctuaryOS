import { useState, useRef, useEffect } from "react";
import { EditorContent, Editor } from "@tiptap/react";
import { useLexicon } from "../../LexiconContext";
import { useTheme } from "../../ThemeContext";
import {
  SanctuaryMonacoEditor,
  defineSanctuaryMonacoThemes,
  useSanctuaryMonacoTheme,
  isThemeLight,
} from "../../utils/monacoTheme";
import { ActionButton } from "../../shared-components/buttons";
import { HoverTooltip } from "../../shared-components/alerts";
import IconPicker from "../../shared-components/IconPicker";
import {
  type PostEditorMode,
  PostEditorModeTiles,
} from "./post-editor/postEditorPrimitives";
import { StructuredPostSectionsBuilder } from "./post-editor/StructuredPostSectionsBuilder";

export {
  AutoResizeTextarea,
  type PostEditorMode,
  type LinkedAssetItem,
  extractLinkedAssetsFromMarkdown,
  serializeReleaseSectionsToMarkdown,
  PostEditorModeTiles,
} from "./post-editor/postEditorPrimitives";
export { PostAttachmentsManager } from "./post-editor/PostAttachmentsManager";

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
  const { currentTheme } = useTheme();
  const isLightMode = isThemeLight(currentTheme);
  useSanctuaryMonacoTheme(currentTheme, isLightMode);
  const [rawWordWrap, setRawWordWrap] = useState(true);
  const [showImagePrompt, setShowImagePrompt] = useState(false);
  const [inlineImgUrl, setInlineImgUrl] = useState("");
  const [showEmotePicker, setShowEmotePicker] = useState(false);
  const emoteBtnRef = useRef<HTMLButtonElement>(null);

  // Interactive Visual Builder state
  const lastSerializedRef = useRef<string>(content);
  const prevModeRef = useRef<PostEditorMode>(mode);

  useEffect(() => {
    const modeChangedToWysiwyg =
      mode === "wysiwyg" && prevModeRef.current !== "wysiwyg";
    prevModeRef.current = mode;
    const contentChanged = content !== lastSerializedRef.current;
    if (
      (modeChangedToWysiwyg || (mode === "wysiwyg" && contentChanged)) &&
      editor &&
      !editor.isDestroyed &&
      (editor.storage as any)?.markdown
    ) {
      const currentMd =
        (editor.storage as any)?.markdown?.getMarkdown?.() ?? "";
      if (currentMd !== content) {
        editor.commands.setContent(content, { emitUpdate: false });
      }
    }
    if (contentChanged) {
      lastSerializedRef.current = content;
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
        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer ${active
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

  const handleModeSwitch = (nextMode: PostEditorMode) => {
    if (
      mode === "wysiwyg" &&
      nextMode !== "wysiwyg" &&
      editor &&
      !editor.isDestroyed
    ) {
      const liveMd = (editor.storage as any)?.markdown?.getMarkdown?.();
      if (typeof liveMd === "string" && liveMd !== content) {
        onContentChange(liveMd);
      }
    }
    onModeChange(nextMode);
  };

  return (
    <div
      className={`flex flex-col gap-4 w-full ${
        mode === "markdown" ? "flex-1 min-h-0" : ""
      }`}
    >
      {/* 1x3 DashboardStatTile Mode Switcher (No PillTabs) */}
      {!hideModeTiles && (
        <PostEditorModeTiles mode={mode} onModeChange={handleModeSwitch} />
      )}

      {/* =====================================================================
          MODE 1: INTERACTIVE IN-PLACE VISUAL UI BUILDER
         ===================================================================== */}
      {mode === "visual" && (
        <StructuredPostSectionsBuilder
          content={content}
          onContentChange={onContentChange}
          placeholder={placeholder}
        />
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
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer ${showEmotePicker
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
          MODE 3: RAW MARKDOWN SOURCE (IDE MONACO EDITOR)
         ===================================================================== */}
      {mode === "markdown" && (
        <div className="glass-panel rounded-2xl overflow-hidden flex-1 min-h-[calc(100dvh-230px)] flex flex-col border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
          <div className="px-4 py-2 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--bg)_25%,transparent)] flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0">
                {t("icon_code", "code")}
              </span>
              <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text)] truncate">
                {t("post_editor_markdown_source", "Markdown Source")}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-transparent border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[10px] font-mono font-bold text-[var(--subtext)] tabular-nums shrink-0">
                {content ? content.split("\n").length : 0}{" "}
                {t("editor_lines_label", "lines")}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setRawWordWrap((prev) => !prev)}
              className={`h-7 px-2.5 rounded-lg border text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                rawWordWrap
                  ? "glass-surface sa-glass-pill-active text-[var(--text)]"
                  : "bg-transparent border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
              }`}
            >
              <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                {t("icon_wrap_text", "wrap_text")}
              </span>
              <span>{t("editor_btn_wrap", "Wrap")}</span>
            </button>
          </div>
          <div className="monaco-wrapper flex-1 min-h-[480px] h-[max(480px,calc(100dvh-290px))] relative w-full">
            <div className="absolute inset-0">
              <SanctuaryMonacoEditor
                height="100%"
                width="100%"
                language="markdown"
                value={content}
                onChange={(val) => syncMarkdown(val ?? "")}
                theme={isLightMode ? "sanctuary-glass-light" : "sanctuary-glass-dark"}
                beforeMount={(monacoInstance) =>
                  defineSanctuaryMonacoThemes(monacoInstance, currentTheme)
                }
                onMount={(editorInstance) => {
                  editorInstance.layout();
                  editorInstance.onMouseDown((e) => {
                  if (e.event.rightButton) {
                    e.event.preventDefault();
                    e.event.stopPropagation();
                    window.dispatchEvent(
                      new CustomEvent("sanctuary-monaco-contextmenu", {
                        detail: {
                          editor: editorInstance,
                          x: e.event.posx,
                          y: e.event.posy,
                        },
                      })
                    );
                  }
                });
              }}
              options={{
                contextmenu: false,
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: "var(--font-mono), Consolas, monospace",
                lineHeight: 22,
                padding: { top: 14, bottom: 16 },
                scrollBeyondLastLine: false,
                wordWrap: rawWordWrap ? "on" : "off",
                automaticLayout: true,
                lineNumbersMinChars: 4,
                folding: true,
                glyphMargin: false,
                tabSize: 2,
                scrollbar: {
                  verticalScrollbarSize: 6,
                  horizontalScrollbarSize: 6,
                },
              }}
            />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
