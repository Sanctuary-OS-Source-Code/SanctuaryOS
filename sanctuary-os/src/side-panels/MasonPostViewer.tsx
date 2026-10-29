import React, { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import MarkdownRenderer from "../MarkdownRenderer";
import CodeSnippetSidebar from "./CodeSnippetSidebar";
import {
  SidePanel,
  renderTextWithIcons,
  EmptyState,
  HoverTooltip,
  ActionButton,
  PanelHeaderGroup,
  PanelHeaderButton,
  LinkAssetSidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  DashboardStatTile,
  StatBox,
  handleOpenUrl,
} from "../shared";
import {
  StructuredReleaseNotesView,
  cleanPostBodyForViewer,
} from "../components/ReleaseNotesShowcase";
import { extractLinkedAssetsFromMarkdown } from "../components/universal/UnifiedPostEditor";
import FlagContentSidePanel from "./FlagContentSidePanel";
import { VAULT_CHIP_CLASS } from "../Cards";
import { useStore } from "../store";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { IconPlugin } from "../IconPlugin";
import {
  DispatchMetadataHeader,
  DispatchPollViewer,
  extractDispatchMetadata,
  formatDispatchCategory,
} from "../components/universal/DispatchPollAndMeta";

function RichReplyEditor({
  value,
  onChange,
  placeholder,
  className,
  id,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}) {
  const updateTimeoutRef = React.useRef<any>(null);
  const [isEmpty, setIsEmpty] = useState(!value);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        horizontalRule: false,
        codeBlock: false,
        blockquote: false,
        bold: false,
        italic: false,
        strike: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
      }),
      Markdown,
      IconPlugin,
    ],
    content: value,
    onUpdate: ({ editor }) => {
      setIsEmpty(editor.isEmpty);
      if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
      updateTimeoutRef.current = setTimeout(() => {
        onChange((editor.storage as any).markdown.getMarkdown());
      }, 500);
    },
    editorProps: {
      attributes: {
        id: id || "",
        class: className || "",
      },
    },
  });

  useEffect(() => {
    if (editor && value !== undefined) {
      const currentContent = (editor.storage as any).markdown.getMarkdown();
      if (value !== currentContent) {
        if (!editor.isFocused || value === "") {
          editor.commands.setContent(value);
          setIsEmpty(editor.isEmpty);
        }
      }
    }
  }, [value, editor]);

  return (
    <div className="relative w-full">
      {isEmpty && placeholder && (
        <div className="absolute top-0 left-0 text-[var(--subtext)] pointer-events-none text-sm">
          {placeholder}
        </div>
      )}
      <EditorContent editor={editor} className="w-full" />
    </div>
  );
}

export default function MasonPostViewer({
  post,
  onClose,
  onOpenMasonProfile,
  onAssetClick,
  userId,
  initialFocusCommentId,
  hideActions,
}: {
  post: any;
  onClose: () => void;
  onOpenMasonProfile?: (id: string) => void;
  onAssetClick?: (type: string, id: string) => void;
  userId: string | null;
  initialFocusCommentId?: string | null;
  hideActions?: boolean;
}) {
  const { t, td } = useLexicon();
  const isBanned = localStorage.getItem("sanctuary_blacklisted") === "true";
  const [forceTranslatePost, setForceTranslatePost] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const [replyTargetAuthorId, setReplyTargetAuthorId] = useState<string | null>(null);
  const [replyTargetUsername, setReplyTargetUsername] = useState<string>("");
  const [replyTargetSnippet, setReplyTargetSnippet] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentContent, setEditCommentContent] = useState("");
  const [codeSnippet, setCodeSnippet] = useState("");
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [activeCodeSnippet, setActiveCodeSnippet] = useState<string | null>(null);
  const [flagTarget, setFlagTarget] = useState<{
    id: string;
    type: "post" | "comment" | "broadcast";
  } | null>(null);

  const [isAssetPanelOpen, setIsAssetPanelOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"ui" | "normal">("ui");

  const setMasonCommentDrafts = useStore((state) => state.setMasonCommentDrafts);
  const showCommLinkImages = useStore((state) => state.showCommLinkImages);

  const [userCollapsed, setUserCollapsed] = useState<Set<string>>(new Set());
  const [userExpanded, setUserExpanded] = useState<Set<string>>(new Set());
  const [repliesExpanded, setRepliesExpanded] = useState<Set<string>>(new Set());

  const fetchComments = async () => {
    setLoading(true);
    const { data: commentsData, error } = await supabase
      .from("mason_post_comments")
      .select("*")
      .eq("post_id", post.id)
      .order("created_at", { ascending: true });

    if (!error && commentsData) {
      const authorIds = Array.from(new Set(commentsData.map((c) => c.author_id)));
      if (authorIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, username")
          .in("id", authorIds);

        const profileMap: any = {};
        profiles?.forEach((p: any) => (profileMap[p.id] = p));

        const merged = commentsData.map((c) => ({
          ...c,
          author: profileMap[c.author_id] || { id: c.author_id, username: "Citizen" },
        }));
        setComments(merged);
      } else {
        setComments(commentsData);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    setViewMode("ui");
    if (post?.id) {
      const draft = useStore.getState().masonCommentDrafts[post.id];
      if (draft) {
        setNewComment(draft.newComment || "");
        setCodeSnippet(draft.codeSnippet || "");
        setShowCodeInput(!!draft.codeSnippet);
      }
      fetchComments();
    }
  }, [post?.id]);

  useEffect(() => {
    if (initialFocusCommentId && comments.length > 0) {
      setTimeout(() => {
        const el = document.getElementById(`comment-${initialFocusCommentId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add(
            "ring-2",
            "ring-[var(--accent)]",
            "ring-offset-2",
            "ring-offset-[var(--bg)]",
            "transition-all",
            "duration-1000"
          );
          setTimeout(() => {
            el.classList.remove(
              "ring-2",
              "ring-[var(--accent)]",
              "ring-offset-2",
              "ring-offset-[var(--bg)]"
            );
          }, 2000);
        }
      }, 100);
    }
  }, [initialFocusCommentId, comments]);

  useEffect(() => {
    if (post?.id && (newComment || codeSnippet)) {
      setMasonCommentDrafts((prev) => ({
        ...prev,
        [post.id]: { newComment, codeSnippet },
      }));
    } else if (post?.id && !newComment && !codeSnippet) {
      setMasonCommentDrafts((prev) => {
        const next = { ...prev };
        delete next[post.id];
        return next;
      });
    }
  }, [newComment, codeSnippet, post?.id]);

  useEffect(() => {
    if (editingCommentId && editCommentContent) {
      setMasonCommentDrafts((prev) => ({
        ...prev,
        ["edit-" + editingCommentId]: { editCommentContent },
      }));
    }
  }, [editCommentContent, editingCommentId]);

  const handleLinkAsset = (asset: any) => {
    const linkStr = `asset://${asset.type}/${asset.id}`;
    const typeKey = `masonhub_asset_type_${asset.type}`;
    const fallbackType =
      asset.type === "mod"
        ? "Artifact"
        : asset.type === "blueprint"
          ? "Blueprint"
          : asset.type === "chameleon"
            ? "Theme"
            : "Lexicon";
    const translatedType = t(typeKey, fallbackType);

    const textToInsert = `[${translatedType}: ${asset.name}](${linkStr})`;
    setNewComment(
      (prev) => prev + (prev.length > 0 && !prev.endsWith(" ") ? " " : "") + textToInsert + " "
    );

    setIsAssetPanelOpen(false);
  };

  useEffect(() => {
    if (post?.scrollToCommentId && comments.length > 0) {
      setTimeout(() => {
        const el = document.getElementById(`comment-${post.scrollToCommentId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add(
            "ring-2",
            "ring-[var(--accent)]",
            "ring-offset-4",
            "ring-offset-[var(--bg)]",
            "rounded-2xl"
          );
          setTimeout(
            () =>
              el.classList.remove(
                "ring-2",
                "ring-[var(--accent)]",
                "ring-offset-4",
                "ring-offset-[var(--bg)]",
                "rounded-2xl"
              ),
            2000
          );
        }
      }, 300);
    }
  }, [comments, post?.scrollToCommentId]);

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() && !codeSnippet.trim()) return;
    if (!userId) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_comm_banned, comm_blacklist_reason")
      .eq("id", userId)
      .single();
    if (profile?.is_comm_banned) {
      useStore
        .getState()
        .pushStatus(
          `Communications Ban: ${profile.comm_blacklist_reason || "You are banned from replying."}`,
          "error"
        );
      return;
    }

    const finalContent = newComment.trim();

    const { error } = await supabase.from("mason_post_comments").insert({
      post_id: post.id,
      author_id: userId,
      content: finalContent,
      parent_comment_id: replyTargetId,
      code_snippet: codeSnippet.trim() || null,
    });

    if (!error) {
      if (replyTargetAuthorId && replyTargetAuthorId !== userId) {
        const { data: notificationProfile } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", userId)
          .maybeSingle();
        const senderName = notificationProfile?.username || "A Citizen";
        await supabase.from("notifications").insert({
          user_id: replyTargetAuthorId,
          actor_id: userId,
          type: "reply",
          reference_id: post.id,
          message: `${senderName} replied to your comment.`,
        });
      }

      useStore.getState().setMasonCommentDrafts((prev) => {
        const next = { ...prev };
        delete next[post.id];
        return next;
      });
      setNewComment("");
      setCodeSnippet("");
      setShowCodeInput(false);
      setReplyTargetId(null);
      setReplyTargetAuthorId(null);
      fetchComments();
    } else {
      useStore.getState().pushStatus("Error posting comment: " + error.message);
    }
  };

  const handleHideComment = async (commentId: string) => {
    const { error: rpcError } = await supabase.rpc("hide_mason_comment", {
      p_comment_id: commentId,
    });
    if (!rpcError) {
      fetchComments();
      return;
    }

    const { data, error } = await supabase
      .from("mason_post_comments")
      .update({ is_hidden: true })
      .eq("id", commentId)
      .select();
    if (error) {
      useStore.getState().pushStatus("Error hiding comment: " + error.message);
    } else if (data && data.length === 0) {
      useStore.getState().pushStatus(t("auto_error_database_blocked_45", "Database action blocked"));
    } else {
      fetchComments();
    }
  };

  const handleReplyTo = (c: any) => {
    const snippet = c.content.length > 50 ? c.content.slice(0, 50) + "..." : c.content;
    const cleanSnippet = snippet.replace(/^>\s*/gm, "").trim();
    setReplyTargetSnippet(cleanSnippet);
    setReplyTargetUsername(c.author?.username || "Citizen");
    setReplyTargetId(c.id);
    setReplyTargetAuthorId(c.author_id);
    const textElement = document.getElementById("reply-textarea");
    textElement?.focus();
  };

  const handleSaveEdit = async (commentId: string) => {
    if (!editCommentContent.trim()) return;
    const { error } = await supabase
      .from("mason_post_comments")
      .update({ content: editCommentContent.trim() })
      .eq("id", commentId);
    if (!error) {
      useStore.getState().setMasonCommentDrafts((prev) => {
        const next = { ...prev };
        delete next["edit-" + commentId];
        return next;
      });
      setEditingCommentId(null);
      fetchComments();
    } else {
      useStore.getState().pushStatus("Error updating comment: " + error.message);
    }
  };

  if (!post) return null;

  const nonDispatchCategories = ["EULA", "Privacy", "Terms"];
  const isDispatchPost = Boolean(
    (post.mason_id === "system" || post.category || post.target_audience) &&
      !nonDispatchCategories.includes(post.category || "")
  );

  const parsePostContent = (p: any) => {
    let content = p.content || p.message || "";
    let imageUrl = p.image_url || "";
    if (content.startsWith("[IMG:")) {
      const endIdx = content.indexOf("]");
      if (endIdx !== -1) {
        imageUrl = content.substring(5, endIdx);
        content = content.substring(endIdx + 1).trim();
      }
    }
    if (isDispatchPost) {
      const meta = extractDispatchMetadata(p, content);
      content = meta.cleanContent;
    }
    return { content, imageUrl };
  };

  const { content, imageUrl } = parsePostContent(post);
  const isPostAuthor = userId && post.mason_id && userId === post.masons?.profile_id;

  const buildCommentTree = (commentsList: any[]) => {
    const map = new Map();
    const roots: any[] = [];
    commentsList.forEach((c) => map.set(c.id, { ...c, replies: [] }));
    commentsList.forEach((c) => {
      if (c.parent_comment_id) {
        const parent = map.get(c.parent_comment_id);
        if (parent) {
          parent.replies.push(map.get(c.id));
        } else {
          roots.push(map.get(c.id));
        }
      } else {
        roots.push(map.get(c.id));
      }
    });
    return roots;
  };

  const renderCommentNode = (c: any, depth: number = 0) => {
    if (c.is_hidden && !isPostAuthor && depth === 0 && c.replies.length === 0) return null;
    const isMyComment = userId === c.author_id;

    const defaultCollapsed = depth > 1;
    const isCollapsed = defaultCollapsed ? !userExpanded.has(c.id) : userCollapsed.has(c.id);
    const isRepliesExpanded = repliesExpanded.has(c.id);

    const toggleCollapse = () => {
      if (defaultCollapsed) {
        setUserExpanded((prev) => {
          const next = new Set(prev);
          if (next.has(c.id)) next.delete(c.id);
          else next.add(c.id);
          return next;
        });
      } else {
        setUserCollapsed((prev) => {
          const next = new Set(prev);
          if (next.has(c.id)) next.delete(c.id);
          else next.add(c.id);
          return next;
        });
      }
    };

    const toggleRepliesExpand = () => {
      setRepliesExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(c.id)) next.delete(c.id);
        else next.add(c.id);
        return next;
      });
    };

    const allowedReplies = depth >= 4 ? [] : c.replies;
    const visibleReplies = isRepliesExpanded ? allowedReplies : allowedReplies.slice(0, 1);
    const hiddenRepliesCount = allowedReplies.length - visibleReplies.length;

    return (
      <div
        key={c.id}
        className="flex flex-col gap-2 relative transition-all duration-500"
        style={{ marginLeft: depth > 0 ? "1.5rem" : "0" }}
      >
        {depth > 0 && (
          <div className="absolute top-0 bottom-0 left-[-1.5rem] w-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
        )}
        <div
          id={`comment-${c.id}`}
          className={`p-4 rounded-xl border ${
            c.is_hidden
              ? "border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-transparent"
              : "glass-surface border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] transition-all"
          } flex flex-col gap-2 relative`}
        >
          {depth > 0 && (
            <div className="absolute top-6 left-[-1.5rem] w-6 h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
          )}
          {isCollapsed ? (
            <div className="flex items-center gap-2">
              <button
                onClick={toggleCollapse}
                className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)] hover:text-[var(--text)] transition-colors mr-1 flex items-center justify-center"
              >
                <span className="material-symbols-outlined !text-[16px]">
                  {t("icon_add", "add")}
                </span>
              </button>
              <div className="w-7 h-7 rounded-lg glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center text-[10px] font-black text-[var(--accent)]">
                {c.author?.username?.charAt(0)?.toUpperCase() || "?"}
              </div>
              <span className="text-[11px] font-black capitalize tracking-widest text-[var(--text)]">
                {c.author?.username || t("role_citizen", "{Citizen}")}
              </span>
              <span className="text-[8px] font-mono text-[var(--subtext)] opacity-50 ml-2">
                {allowedReplies.length} {t("auto_replies_hidden", "replies hidden")}
              </span>
            </div>
          ) : editingCommentId === c.id ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={editCommentContent}
                onChange={(e) => setEditCommentContent(e.target.value)}
                className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl p-3 text-xs text-[var(--text)] outline-none focus:theme-border-accent transition-all resize-none h-20 custom-scrollbar"
              />
              <div className="flex gap-2 justify-end mt-2">
                <button
                  onClick={() => setEditingCommentId(null)}
                  className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] hover:text-[var(--text)]"
                >
                  {t("cancel", "Cancel")}
                </button>
                <button
                  onClick={() => handleSaveEdit(c.id)}
                  className="text-[10px] font-black uppercase tracking-wider text-[var(--accent)] hover:underline"
                >
                  {t("hub_save", "Save")}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleCollapse}
                    className="w-6 h-6 rounded-lg glass-surface text-[var(--subtext)] hover:text-[var(--text)] transition-colors shrink-0 flex items-center justify-center"
                  >
                    <span className="material-symbols-outlined !text-[14px]">
                      {t("icon_remove", "remove")}
                    </span>
                  </button>
                  <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center text-xs font-black text-[var(--accent)] shrink-0">
                    {c.author?.username?.charAt(0)?.toUpperCase() || "?"}
                  </div>
                  <span className="text-xs font-black text-[var(--text)]">
                    {c.author?.username || t("role_citizen", "{Citizen}")}
                  </span>
                  <span className="text-[10px] font-mono text-[var(--subtext)] opacity-60 ml-1">
                    {new Date(c.created_at).toLocaleString()}
                  </span>
                  {c.is_hidden && (
                    <span className={`${VAULT_CHIP_CLASS} ml-1`}>
                      <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--danger)]">
                        {t("icon_visibility_off", "visibility_off")}
                      </span>
                      {t("reply_hidden", "Hidden")}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {isMyComment && !c.is_hidden && (
                    <button
                      onClick={() => {
                        setEditingCommentId(c.id);
                        const draft = useStore.getState().masonCommentDrafts["edit-" + c.id];
                        setEditCommentContent(draft?.editCommentContent ?? c.content);
                      }}
                      className="flex items-center gap-1 text-[10px] font-black tracking-wider uppercase text-[var(--subtext)] hover:text-[var(--text)] px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-colors"
                    >
                      <span className="material-symbols-outlined !text-[13px]">
                        {t("icon_edit", "edit")}
                      </span>
                      {t("btn_edit", "Edit")}
                    </button>
                  )}
                  {isPostAuthor && (
                    <button
                      onClick={() => handleHideComment(c.id)}
                      className="flex items-center gap-1 text-[10px] font-black tracking-wider uppercase text-[var(--subtext)] hover:text-[var(--text)] px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-colors"
                    >
                      <span className="material-symbols-outlined !text-[13px]">
                        {c.is_hidden
                          ? t("icon_visibility", "visibility")
                          : t("icon_visibility_off", "visibility_off")}
                      </span>
                      {c.is_hidden ? t("btn_show", "Show") : t("btn_hide_reply", "Hide")}
                    </button>
                  )}
                  {!c.is_hidden && userId && depth < 4 && !hideActions && (
                    <button
                      onClick={() => handleReplyTo(c)}
                      className="flex items-center gap-1 text-[10px] font-black tracking-wider uppercase text-[var(--text)] px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] transition-all"
                    >
                      <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                        {t("icon_reply", "reply")}
                      </span>
                      {t("ui_btn_reply", "Reply")}
                    </button>
                  )}
                  {userId && userId !== c.author_id && !isBanned && !hideActions && (
                    <button
                      onClick={() => setFlagTarget({ id: c.id, type: "comment" })}
                      className="flex items-center gap-1 text-[10px] font-black tracking-wider uppercase text-[var(--text)] px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] transition-all"
                    >
                      <span className="material-symbols-outlined !text-[13px] text-[var(--danger)]">
                        {t("icon_flag", "flag")}
                      </span>
                      {t("feed_btn_flag", "Flag")}
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-2">
                {c.is_hidden && !isPostAuthor ? (
                  <p className="text-[var(--subtext)] opacity-50 italic text-xs">
                    {t("reply_hidden", "Reply hidden")}
                  </p>
                ) : (
                  <div
                    className={`text-[var(--text)] text-xs leading-relaxed whitespace-pre-wrap ${
                      c.is_hidden ? "opacity-50" : "opacity-90"
                    } markdown-body`}
                  >
                    <MarkdownRenderer
                      content={c.content}
                      forceTranslate={forceTranslatePost}
                      onAssetClick={(type: string, id: string) => {
                        onAssetClick?.(type, id);
                      }}
                    />
                  </div>
                )}
              </div>
              {c.code_snippet && !c.is_hidden && (
                <div className="mt-3 flex">
                  <ActionButton
                    onClick={() => setActiveCodeSnippet(c.code_snippet)}
                    variant="accent"
                    icon={t("icon_data_object", "data_object")}
                    label={t("show_code", "Show Code")}
                  />
                </div>
              )}
            </>
          )}
        </div>
        {!isCollapsed && allowedReplies.length > 0 && (
          <div className="flex flex-col gap-2 mt-2">
            {visibleReplies.map((r: any) => renderCommentNode(r, depth + 1))}
            {hiddenRepliesCount > 0 && (
              <button
                onClick={toggleRepliesExpand}
                className="text-[10px] font-black uppercase tracking-wider text-[var(--accent)] self-start ml-6 mt-1 hover:underline flex items-center gap-2"
              >
                <span className="text-[12px]">&rarr;</span>{" "}
                {t("feed_show_more_replies", `Show ${hiddenRepliesCount} more replies`)}
              </button>
            )}
            {isRepliesExpanded && allowedReplies.length > 1 && (
              <button
                onClick={toggleRepliesExpand}
                className="text-[10px] font-black uppercase tracking-wider text-[var(--accent)] self-start ml-6 mt-1 hover:underline flex items-center gap-2"
              >
                <span className="text-[12px]">&rarr;</span>{" "}
                {t("show_less_replies", "Show less replies")}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const isSystem = post.mason_id === "system";
  const isAlert = Boolean(isSystem && post.category?.toLowerCase().includes("alert"));
  const authorDisplayName = isSystem
    ? post.masons?.name || t("author_sanctuary_team", "Sanctuary Foundry")
    : post.masons?.name || t("unknown_architect", "Unknown Architect");
  const visibleCommentCount = comments.filter((c) => !c.is_hidden || isPostAuthor).length;

  return (
    <>
      <SidePanel
        isOpen={true}
        onClose={onClose}
        title={
          isAlert
            ? t("tile_global_alert", "Global Alert")
            : post.category
              ? t("dispatch_header", "Dispatch")
              : t("comm_link", "Comm-Link")
        }
        icon={isAlert ? t("icon_priority_high", "priority_high") : t("icon_forum", "forum")}
        iconColorClass={isAlert ? "text-[var(--danger)]" : "text-[var(--accent)]"}
        widthClass="w-[90vw] md:w-[760px]"
        panelZ="z-[50001]"
        backdropZ="z-[50000]"
        panelClass={isAlert ? "danger-accent-override" : ""}
        subtitle={
          isAlert
            ? t("alert_subtitle", "Critical System Broadcast")
            : post.category
              ? t("dispatch_subtitle", "Official Sanctuary Dispatch")
              : t("transmission_subtitle", "Direct communications and logs from Sanctuary {Masons}")
        }
        headerActions={
          !hideActions ? (
            <>
              <PanelHeaderGroup>
                <PanelHeaderButton
                  icon={t("icon_translate", "translate")}
                  tooltip={t("lex_translate_post", "Translate {Dispatch}")}
                  isActive={forceTranslatePost}
                  onClick={() => setForceTranslatePost((prev) => !prev)}
                />
              </PanelHeaderGroup>
              {!userId || isBanned ? (
                <div className="relative group/flagbtn h-full flex items-center">
                  <HoverTooltip
                    variant="danger"
                    title={
                      isBanned
                        ? t("alert_comm_banned", "Communications Restricted")
                        : t("alert_guest_mode_uploads", "Authentication Required")
                    }
                    subtitle={
                      isBanned
                        ? t("alert_comm_banned_desc", "Your account cannot flag or reply.")
                        : t("alert_guest_mode_desc", "Sign in to interact with transmissions.")
                    }
                    className="group-hover/flagbtn:flex z-[1000]"
                  />
                  <PanelHeaderGroup>
                    <PanelHeaderButton
                      icon={t("icon_flag", "flag")}
                      tooltip={t("feed_btn_flag", "Flag")}
                      disabled={true}
                      variant="danger"
                    />
                  </PanelHeaderGroup>
                </div>
              ) : (
                !isPostAuthor && (
                  <PanelHeaderGroup>
                    <PanelHeaderButton
                      icon={t("icon_flag", "flag")}
                      tooltip={t("feed_btn_flag", "Flag")}
                      onClick={() => setFlagTarget({ id: post.id, type: "post" })}
                      variant="danger"
                    />
                  </PanelHeaderGroup>
                )
              )}
              {post.mason_id !== "system" && (
                <PanelHeaderGroup>
                  <PanelHeaderButton
                    icon={t("icon_person", "person")}
                    tooltip={t("btn_view_profile", "View Profile")}
                    onClick={() => {
                      onClose();
                      onOpenMasonProfile?.(post.mason_id);
                    }}
                  />
                  {post.masons?.patreon_url && (
                    <PanelHeaderButton
                      icon={t("icon_favorite", "favorite")}
                      tooltip={t("btn_patreon", "Patreon")}
                      onClick={() => handleOpenUrl(post.masons.patreon_url)}
                      variant="danger"
                    />
                  )}
                  {post.masons?.discord_url && (
                    <PanelHeaderButton
                      icon={t("icon_forum", "forum")}
                      tooltip={t("btn_discord", "Discord")}
                      onClick={() => handleOpenUrl(post.masons.discord_url)}
                    />
                  )}
                </PanelHeaderGroup>
              )}
            </>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-6 mt-2 relative z-10 w-full pb-8">
          {/* Top StatTile Navigation: View -> Visual / Post (matching Update Post layout without View On GitHub) */}
          <div className="grid grid-cols-2 gap-4 w-full">
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_dashboard", "dashboard")}
              label={t("btn_view", "View")}
              number={t("tab_visual", "Visual")}
              colorClass={isAlert ? "text-[var(--danger)]" : "text-[var(--accent)]"}
              isActive={viewMode === "ui"}
              onClick={() => setViewMode("ui")}
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_menu_book", "menu_book")}
              label={t("btn_view", "View")}
              number={t("btn_post", "Post")}
              colorClass={isAlert ? "text-[var(--danger)]" : "text-[var(--accent)]"}
              isActive={viewMode === "normal"}
              onClick={() => setViewMode("normal")}
            />
          </div>

          <SidePanelHeroCard
            title={renderTextWithIcons(td ? td(post.title || "", { forceTranslate: forceTranslatePost }) : post.title)}
            subtitle={
              isAlert
                ? t("tile_global_alert", "Global Alert")
                : post.category
                  ? formatDispatchCategory(post.category, t)
                  : t("comm_link", "Comm-Link")
            }
            label={new Date(post.created_at).toLocaleDateString()}
            icon={isAlert ? t("icon_priority_high", "priority_high") : t("icon_forum", "forum")}
            variant={isAlert ? "danger" : "accent"}
            badges={[
              {
                icon: isSystem
                  ? t("icon_verified", "verified")
                  : t("icon_person", "person"),
                label: authorDisplayName,
                colorClass: isAlert
                  ? "text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_35%,transparent)]"
                  : "text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_35%,transparent)]",
              },
            ]}
          >
            <div className="flex flex-col gap-4 w-full">
              {/* Framed Cover Banner (if present) */}
              {showCommLinkImages !== false && imageUrl && (
                <div className="w-full h-52 sm:h-64 rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
                  <img
                    src={imageUrl}
                    className="w-full h-full object-cover object-center"
                    alt={t("auto_post_cover", "Post Cover")}
                  />
                </div>
              )}

              {isDispatchPost ? (
                <DispatchMetadataHeader post={post} />
              ) : (
                <div className="grid grid-cols-2 gap-3 w-full">
                  <StatBox
                    className="w-full"
                    icon={t("icon_person", "person")}
                    iconColorClass="text-[var(--accent)]"
                    label={t("author", "Author")}
                    value={authorDisplayName}
                    onClick={
                      post.mason_id !== "system" && onOpenMasonProfile
                        ? () => {
                            onClose();
                            onOpenMasonProfile(post.mason_id);
                          }
                        : undefined
                    }
                  />
                  <StatBox
                    className="w-full"
                    icon={t("icon_calendar_today", "calendar_today")}
                    iconColorClass="text-[var(--accent)]"
                    label={t("date", "Date")}
                    value={new Date(post.created_at).toLocaleDateString()}
                  />
                  <StatBox
                    className="w-full"
                    icon={t("icon_forum", "forum")}
                    iconColorClass="text-[var(--accent)]"
                    label={t("category", "Category")}
                    value={
                      post.category
                        ? formatDispatchCategory(post.category, t)
                        : t("comm_link", "Comm-Link")
                    }
                  />
                  <StatBox
                    className="w-full"
                    icon={t("icon_chat", "chat")}
                    iconColorClass="text-[var(--accent)]"
                    label={t("ui.replies", "Replies")}
                    value={String(visibleCommentCount)}
                  />
                </div>
              )}
            </div>
          </SidePanelHeroCard>

          {/* Post Content Group */}
          <UniversalGroup
            title={
              isAlert
                ? t("tile_global_alert", "Global Alert")
                : post.category
                  ? formatDispatchCategory(post.category, t)
                  : t("comm_link", "Comm-Link")
            }
            icon={
              isAlert ? t("icon_priority_high", "priority_high") : t("icon_menu_book", "menu_book")
            }
          >
            <div className="flex flex-col gap-5 min-w-0">
              {viewMode === "ui" ? (
                <StructuredReleaseNotesView
                  content={content}
                  forceTranslate={forceTranslatePost}
                  hideImages={showCommLinkImages === false}
                />
              ) : (
                <div className="glass-panel rounded-3xl p-5 sm:p-6 markdown-body text-[var(--text)] opacity-95 leading-relaxed text-sm">
                  <MarkdownRenderer
                    content={cleanPostBodyForViewer(content)}
                    isAlert={isAlert}
                    forceTranslate={forceTranslatePost}
                    hideImages={showCommLinkImages === false}
                    onAssetClick={(type: string, id: string) => {
                      onAssetClick?.(type, id);
                    }}
                  />
                </div>
              )}

              {/* Attached Nexus Assets Cards */}
              {(() => {
                const linkedAssets = extractLinkedAssetsFromMarkdown(content);
                if (linkedAssets.length === 0) return null;
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                    {linkedAssets.map((asset) => {
                      const assetIcon =
                        asset.type === "mod"
                          ? t("icon_inventory_2", "inventory_2")
                          : asset.type === "blueprint"
                            ? t("icon_architecture", "architecture")
                            : asset.type === "theme" || asset.type === "chameleon"
                              ? t("icon_palette", "palette")
                              : asset.type === "lexicon"
                                ? t("icon_translate", "translate")
                                : asset.type === "workbench_template"
                                  ? t("icon_description", "description")
                                  : t("icon_engineering", "engineering");
                      return (
                        <div
                          key={`${asset.type}-${asset.id}`}
                          onClick={() => onAssetClick?.(asset.type, asset.id)}
                          className="glass-panel rounded-2xl p-4 flex items-center justify-between gap-3 cursor-pointer hover:border-[var(--accent)] transition-all group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center text-[var(--accent)] shrink-0">
                              <span className="material-symbols-outlined !text-[20px]">
                                {assetIcon}
                              </span>
                            </div>
                            <div className="flex flex-col min-w-0 gap-1">
                              <span className="text-xs sm:text-sm font-bold text-[var(--text)] group-hover:text-[var(--accent)] transition-colors truncate">
                                {asset.label}
                              </span>
                              <span className={`${VAULT_CHIP_CLASS} w-fit`}>
                                <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--accent)]">
                                  {assetIcon}
                                </span>
                                {asset.type}
                              </span>
                            </div>
                          </div>
                          <span className="material-symbols-outlined !text-[18px] text-[var(--subtext)] group-hover:text-[var(--accent)] transition-colors shrink-0">
                            {t("icon_open_in_new", "open_in_new")}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {post.code_snippet && (
                <div className="glass-panel rounded-2xl p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined !text-[20px]">
                        {t("icon_data_object", "data_object")}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text)] truncate">
                        {t("code_snippet", "Code Snippet")}
                      </h4>
                      <p className="text-[11px] font-medium text-[var(--subtext)] truncate m-0">
                        {t("code_desc", "View attached code")}
                      </p>
                    </div>
                  </div>
                  <ActionButton
                    onClick={() => setActiveCodeSnippet(post.code_snippet)}
                    variant="accent"
                    icon={t("icon_visibility", "visibility")}
                    label={t("show_code", "Show Code")}
                    className="rounded-xl !px-4 !py-2 !text-[10px] shrink-0"
                  />
                </div>
              )}

              {post.poll_data && <DispatchPollViewer post={post} userId={userId} />}
            </div>
          </UniversalGroup>

          {/* Replies Group */}
          {!hideActions && (
            <UniversalGroup
              title={`${t("ui.replies", "Replies")} (${visibleCommentCount})`}
              icon={t("icon_forum", "forum")}
            >
              <div className="flex flex-col gap-4">
                {userId && localStorage.getItem("sanctuary_blacklisted") !== "true" ? (
                  <form
                    onSubmit={handlePostComment}
                    className="flex flex-col gap-2.5 relative glass-surface p-4 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                  >
                    {replyTargetId && (
                      <div className="flex items-center justify-between glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] rounded-xl p-3 mb-1">
                        <div className="flex flex-col gap-1 overflow-hidden">
                          <span className="text-[10px] font-black tracking-wider uppercase text-[var(--text)] flex items-center gap-1.5">
                            <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                              {t("icon_reply", "reply")}
                            </span>
                            {t("replying_to", "Replying to")} @{replyTargetUsername}
                          </span>
                          <span className="text-xs font-medium text-[var(--subtext)] italic truncate flex items-center gap-1">
                            "{renderTextWithIcons(replyTargetSnippet)}"
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setReplyTargetId(null)}
                          className="text-[var(--subtext)] hover:text-[var(--text)] w-7 h-7 rounded-lg glass-surface flex items-center justify-center transition-colors shrink-0"
                        >
                          <span className="material-symbols-outlined !text-[14px]">
                            {t("icon_close", "close")}
                          </span>
                        </button>
                      </div>
                    )}
                    <RichReplyEditor
                      id="reply-textarea"
                      value={newComment}
                      onChange={setNewComment}
                      placeholder={t("write_reply", "Write a reply...")}
                      className="w-full bg-transparent border-none text-xs text-[var(--text)] outline-none resize-none min-h-[60px] custom-scrollbar [&_p.is-editor-empty:first-child::before]:text-[var(--subtext)] [&_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_p.is-editor-empty:first-child::before]:float-left [&_p.is-editor-empty:first-child::before]:pointer-events-none"
                    />
                    {showCodeInput && (
                      <div className="mt-1 relative group">
                        <textarea
                          value={codeSnippet}
                          onChange={(e) => setCodeSnippet(e.target.value)}
                          placeholder={t("ph_code_logs", "Paste code or diagnostic logs...")}
                          className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl p-3.5 text-xs font-mono text-[var(--text)] placeholder-[var(--subtext)] outline-none focus:theme-border-accent transition-all resize-none h-28 custom-scrollbar"
                          spellCheck={false}
                        />
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowCodeInput(!showCodeInput)}
                          className="flex items-center justify-center sm:justify-start gap-1.5 w-9 h-8 sm:w-auto sm:px-3 rounded-xl font-black uppercase tracking-wider text-[10px] transition-all glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[var(--text)]"
                        >
                          <span className={`material-symbols-outlined !text-[14px] ${showCodeInput ? "text-[var(--danger)]" : "text-[var(--accent)]"}`}>
                            {showCodeInput
                              ? t("icon_close", "close")
                              : t("icon_data_object", "data_object")}
                          </span>
                          <span className="hidden sm:inline">
                            {showCodeInput
                              ? t("hide_code", "Hide Code")
                              : t("add_code", "Attach Code")}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsAssetPanelOpen(true)}
                          className="flex items-center justify-center sm:justify-start gap-1.5 w-9 h-8 sm:w-auto sm:px-3 rounded-xl font-black uppercase tracking-wider text-[10px] transition-all glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
                        >
                          <span className="material-symbols-outlined !text-[14px]">
                            {t("icon_link", "link")}
                          </span>
                          <span className="hidden sm:inline">
                            {t("link_asset", "Link Asset")}
                          </span>
                        </button>
                      </div>
                      <ActionButton
                        type="submit"
                        disabled={!newComment.trim() && !codeSnippet.trim()}
                        variant="accent"
                        icon={t("icon_send", "send")}
                        label={t("btn_send", "Send")}
                        className="rounded-xl !px-4 sm:!px-5 !h-8 !py-0 !text-[10px] !shadow-none shrink-0"
                      />
                    </div>
                  </form>
                ) : (
                  <div className="text-center text-[11px] font-bold text-[var(--subtext)] p-4 glass-surface rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                    {localStorage.getItem("sanctuary_blacklisted") === "true"
                      ? t("alert_comm_banned", "Communications Restricted")
                      : t("login_required", "Sign in to reply")}
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  {loading ? (
                    <div className="text-[11px] font-bold text-[var(--subtext)] opacity-60 text-center py-8 animate-pulse">
                      {t("loading_replies", "Loading replies...")}
                    </div>
                  ) : visibleCommentCount === 0 ? (
                    <EmptyState
                      icon={t("icon_forum", "forum")}
                      title={t("no_replies", "No Replies Yet")}
                    />
                  ) : (
                    buildCommentTree(comments).map((c) => renderCommentNode(c))
                  )}
                </div>
              </div>
            </UniversalGroup>
          )}
        </div>
      </SidePanel>

      {flagTarget && userId && (
        <FlagContentSidePanel
          isOpen={!!flagTarget}
          onClose={() => setFlagTarget(null)}
          targetId={flagTarget.id}
          targetType={flagTarget.type}
          userId={userId}
        />
      )}

      <LinkAssetSidePanel
        isOpen={isAssetPanelOpen}
        onClose={() => setIsAssetPanelOpen(false)}
        onAssetSelect={handleLinkAsset}
        backdropZ="z-[60000]"
        panelZ="z-[60001]"
      />

      {activeCodeSnippet && (
        <CodeSnippetSidebar code={activeCodeSnippet} onClose={() => setActiveCodeSnippet(null)} />
      )}
    </>
  );
}
