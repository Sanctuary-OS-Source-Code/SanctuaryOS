import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import MarkdownRenderer from "../MarkdownRenderer";
import CodeSnippetSidebar from "./CodeSnippetSidebar";
import { SidePanel, standardButtonClass, standardDangerButtonClass, extractPostImage, renderTextWithIcons, EmptyState, HoverTooltip } from "../shared";
import FlagContentSidePanel from './FlagContentSidePanel';
import { handleOpenUrl } from "../shared";
import { useStore } from '../store';

export default function MasonPostViewer({ post, onClose, onOpenMasonProfile, onAssetClick, userId }: { post: any, onClose: () => void, onOpenMasonProfile?: (id: string) => void, onAssetClick?: (type: string, id: string) => void, userId: string | null }) {
  const { t } = useLexicon();
  const isBanned = localStorage.getItem("sanctuary_blacklisted") === "true";
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
  const [flagTarget, setFlagTarget] = useState<{ id: string, type: 'post' | 'comment' | 'broadcast' } | null>(null);

  const [assets, setAssets] = useState<any[]>([]);
  const [isAssetPanelOpen, setIsAssetPanelOpen] = useState(false);
  const [assetSearchQuery, setAssetSearchQuery] = useState("");

  const masonCommentDrafts = useStore(state => state.masonCommentDrafts);
  const setMasonCommentDrafts = useStore(state => state.setMasonCommentDrafts);

  const [userCollapsed, setUserCollapsed] = useState<Set<string>>(new Set());
  const [userExpanded, setUserExpanded] = useState<Set<string>>(new Set());
  const [repliesExpanded, setRepliesExpanded] = useState<Set<string>>(new Set());

  const fetchComments = async () => {
    setLoading(true);
    const { data: commentsData, error } = await supabase
      .from('mason_post_comments')
      .select('*')
      .eq('post_id', post.id)
      .order('created_at', { ascending: true });

    if (!error && commentsData) {
      const authorIds = Array.from(new Set(commentsData.map(c => c.author_id)));
      if (authorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username')
          .in('id', authorIds);

        const profileMap: any = {};
        profiles?.forEach((p: any) => profileMap[p.id] = p);

        const merged = commentsData.map(c => ({
          ...c,
          author: profileMap[c.author_id] || { id: c.author_id, username: 'Citizen' }
        }));
        setComments(merged);
      } else {
        setComments(commentsData);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
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
    if (post?.id && (newComment || codeSnippet)) {
      setMasonCommentDrafts(prev => ({
        ...prev,
        [post.id]: { newComment, codeSnippet }
      }));
    } else if (post?.id && !newComment && !codeSnippet) {
      setMasonCommentDrafts(prev => {
        const next = { ...prev };
        delete next[post.id];
        return next;
      });
    }
  }, [newComment, codeSnippet, post?.id]);

  useEffect(() => {
    if (editingCommentId && editCommentContent) {
      setMasonCommentDrafts(prev => ({
        ...prev,
        ['edit-' + editingCommentId]: { editCommentContent }
      }));
    }
  }, [editCommentContent, editingCommentId]);

  useEffect(() => {
    const fetchAssets = async () => {
      const { data: modsData } = await supabase.from('mods').select('id, name');
      const { data: marketAssetsData } = await supabase.from('nexus_assets').select('id, name, asset_type');
      const { data: blueprintsData } = await supabase.from('blueprints').select('id, name');

      let combinedAssets: any[] = [];
      if (modsData) combinedAssets.push(...modsData.map(m => ({ id: m.id, name: m.name, type: 'mod' })));
      if (blueprintsData) combinedAssets.push(...blueprintsData.map(b => ({ id: b.id, name: b.name, type: 'blueprint' })));
      if (marketAssetsData) combinedAssets.push(...marketAssetsData.map(a => ({ id: a.id, name: a.name, type: a.asset_type })));
      setAssets(combinedAssets.sort((a, b) => a.name.localeCompare(b.name)));
    };
    fetchAssets();
  }, []);

  const handleLinkAsset = (asset: any) => {
    const linkStr = `asset://${asset.type}/${asset.id}`;
    const typeKey = `masonhub_asset_type_${asset.type}`;
    const translatedType = t(typeKey) !== typeKey ? t(typeKey) : (asset.type === 'mod' ? 'Artifact' : asset.type === 'blueprint' ? 'Blueprint' : asset.type === 'chameleon' ? 'Theme' : 'Lexicon');

    const textToInsert = `[${translatedType}: ${asset.name}](${linkStr})`;
    setNewComment(prev => prev + (prev.length > 0 && !prev.endsWith(' ') ? ' ' : '') + textToInsert + ' ');

    setIsAssetPanelOpen(false);
    setAssetSearchQuery("");
  };

  const filteredAssets = assets.filter(a => a.name.toLowerCase().includes(assetSearchQuery.toLowerCase()));

  useEffect(() => {
    if (post?.scrollToCommentId && comments.length > 0) {
      setTimeout(() => {
        const el = document.getElementById(`comment-${post.scrollToCommentId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("ring-2", "ring-[var(--accent)]", "ring-offset-4", "ring-offset-[var(--bg)]", "rounded-[var(--radius)]");
          setTimeout(() => el.classList.remove("ring-2", "ring-[var(--accent)]", "ring-offset-4", "ring-offset-[var(--bg)]", "rounded-[var(--radius)]"), 2000);
        }
      }, 300);
    }
  }, [comments, post?.scrollToCommentId]);

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() && !codeSnippet.trim()) return;
    if (!userId) return;

    const { data: profile } = await supabase.from('profiles').select('is_comm_banned, comm_blacklist_reason').eq('id', userId).single();
    if (profile?.is_comm_banned) {
      useStore.getState().pushStatus(`Communications Ban: ${profile.comm_blacklist_reason || 'You are banned from replying.'}`, "error");
      return;
    }

    let finalContent = newComment.trim();

    const { error } = await supabase.from('mason_post_comments').insert({
      post_id: post.id,
      author_id: userId,
      content: finalContent,
      parent_comment_id: replyTargetId,
      code_snippet: codeSnippet.trim() || null
    });

    if (!error) {
      if (replyTargetAuthorId && replyTargetAuthorId !== userId) {
        const { data: notificationProfile } = await supabase.from('profiles').select('username').eq('id', userId).single();
        const senderName = notificationProfile?.username || "A Citizen";
        await supabase.from('notifications').insert({
          user_id: replyTargetAuthorId,
          actor_id: userId,
          type: 'reply',
          reference_id: post.id,
          message: `${senderName} replied to your comment.`
        });
      }
      useStore.getState().setMasonCommentDrafts(prev => {
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
    const { error: rpcError } = await supabase.rpc('hide_mason_comment', { p_comment_id: commentId });
    if (!rpcError) {
      fetchComments();
      return;
    }

    const { data, error } = await supabase.from('mason_post_comments').update({ is_hidden: true }).eq('id', commentId).select();
    if (error) {
      useStore.getState().pushStatus("Error hiding comment: " + error.message);
    } else if (data && data.length === 0) {
      useStore.getState().pushStatus(t("auto_error_database_blocked_the_action_row_le"));
    } else {
      fetchComments();
    }
  };

  const handleReplyTo = (c: any) => {
    const snippet = c.content.length > 50 ? c.content.slice(0, 50) + "..." : c.content;
    const cleanSnippet = snippet.replace(/^>\s*/gm, '').trim();
    setReplyTargetSnippet(cleanSnippet);
    setReplyTargetUsername(c.author?.username || "Citizen");
    setReplyTargetId(c.id);
    setReplyTargetAuthorId(c.author_id);
    const textElement = document.getElementById("reply-textarea");
    textElement?.focus();
  };

  const handleSaveEdit = async (commentId: string) => {
    if (!editCommentContent.trim()) return;
    const { error } = await supabase.from('mason_post_comments').update({ content: editCommentContent.trim() }).eq('id', commentId);
    if (!error) {
      useStore.getState().setMasonCommentDrafts(prev => {
        const next = { ...prev };
        delete next['edit-' + commentId];
        return next;
      });
      setEditingCommentId(null);
      fetchComments();
    } else {
      useStore.getState().pushStatus("Error updating comment: " + error.message);
    }
  };

  if (!post) return null;

  const parsePostContent = (p: any) => {
    let content = p.content || '';
    let imageUrl = p.image_url || '';
    if (content.startsWith('[IMG:')) {
      const endIdx = content.indexOf(']');
      if (endIdx !== -1) {
        imageUrl = content.substring(5, endIdx);
        content = content.substring(endIdx + 1).trim();
      }
    }
    return { content, imageUrl };
  };

  const { content, imageUrl } = parsePostContent(post);
  const isPostAuthor = userId && post.mason_id && userId === post.masons?.profile_id;

  const buildCommentTree = (commentsList: any[]) => {
    const map = new Map();
    const roots: any[] = [];
    commentsList.forEach(c => map.set(c.id, { ...c, replies: [] }));
    commentsList.forEach(c => {
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
        setUserExpanded(prev => {
          const next = new Set(prev);
          if (next.has(c.id)) next.delete(c.id);
          else next.add(c.id);
          return next;
        });
      } else {
        setUserCollapsed(prev => {
          const next = new Set(prev);
          if (next.has(c.id)) next.delete(c.id);
          else next.add(c.id);
          return next;
        });
      }
    };

    const toggleRepliesExpand = () => {
      setRepliesExpanded(prev => {
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
      <div id={`comment-${c.id}`} key={c.id} className="flex flex-col gap-2 relative transition-all duration-500" style={{ marginLeft: depth > 0 ? '1.5rem' : '0' }}>
        {depth > 0 && (
          <div className="absolute top-0 bottom-0 left-[-1.5rem] w-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
        )}
        <div className={`p-4 rounded-[var(--radius)] border ${c.is_hidden ? 'border-[var(--danger)]/30 bg-[var(--danger)]/5' : 'theme-glass-inner border-white/5 hover:border-white/20 transition-all shadow-md'} flex flex-col gap-2 relative`}>
          {depth > 0 && (
            <div className="absolute top-6 left-[-1.5rem] w-6 h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
          )}
          {isCollapsed ? (
            <div className="flex items-center gap-2">
              <button onClick={toggleCollapse} className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] hover:text-[var(--text)] transition-colors mr-1">
                [+]
              </button>
              <div className="w-6 h-6 rounded-lg theme-bg-accent/20 flex items-center justify-center text-[10px] font-black theme-text-accent shadow-inner border border-white/5">
                {c.author?.username?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <span className="text-[11px] font-black uppercase tracking-widest text-[var(--text)]">{c.author?.username || "Citizen"}</span>
              <span className="text-[8px] font-mono text-[var(--subtext)] opacity-50 ml-2">{allowedReplies.length} {t("auto_replies_hidden")}</span>
            </div>
          ) : editingCommentId === c.id ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={editCommentContent}
                onChange={(e) => setEditCommentContent(e.target.value)}
                className="w-full bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-[calc(var(--radius)-4px)] p-3 text-xs text-[var(--text)] outline-none focus:theme-border-accent transition-all resize-none h-20 custom-scrollbar"
              />
              <div className="flex gap-2 justify-end mt-2">
                <button onClick={() => setEditingCommentId(null)} className="text-[8px] font-black uppercase tracking-widest text-[var(--subtext)] hover:text-[var(--text)]">{t("nav_cancel")}</button>
                <button onClick={() => handleSaveEdit(c.id)} className="text-[8px] font-black uppercase tracking-widest theme-text-accent hover:underline">{t("ui_btn_save")}</button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button onClick={toggleCollapse} className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] hover:text-[var(--text)] transition-colors mr-1">
                    [-]
                  </button>
                  <div className="w-6 h-6 rounded-lg theme-bg-accent/20 flex items-center justify-center text-[10px] font-black theme-text-accent shadow-inner border border-white/5">
                    {c.author?.username?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <span className="text-[11px] font-black uppercase tracking-widest text-[var(--text)]">{c.author?.username || "Citizen"}</span>
                  <span className="text-xs font-mono text-[var(--subtext)] opacity-50">{new Date(c.created_at).toLocaleString()}</span>
                  {c.is_hidden && <span className="text-[10px] font-black uppercase tracking-widest theme-text-danger ml-2">{t("reply_hidden")}</span>}
                </div>
                <div className="flex items-center gap-3">
                  {isMyComment && !c.is_hidden && (
                    <button onClick={() => {
                      setEditingCommentId(c.id);
                      const draft = useStore.getState().masonCommentDrafts['edit-' + c.id];
                      setEditCommentContent(draft?.editCommentContent ?? c.content);
                    }} className="flex items-center gap-1.5 text-[10px] font-black tracking-widest uppercase text-[var(--subtext)] hover:text-[var(--text)] transition-colors group">
                      <span className="material-symbols-outlined !text-[14px] opacity-70 group-hover:opacity-100">{t("icon_edit")}</span>
                      {t("emote_edit")}
                    </button>
                  )}
                  {isPostAuthor && (
                    <button onClick={() => handleHideComment(c.id)} className="flex items-center gap-1.5 text-[10px] font-black tracking-widest uppercase text-[var(--subtext)] hover:text-[var(--text)] transition-colors group">
                      <span className="material-symbols-outlined !text-[14px] opacity-70 group-hover:opacity-100">{c.is_hidden ? 'visibility' : 'visibility_off'}</span>
                      {c.is_hidden ? (t("btn_show")) : (t("btn_hide_reply"))}
                    </button>
                  )}
                  {!c.is_hidden && userId && depth < 4 && (
                    <button onClick={() => handleReplyTo(c)} className="flex items-center gap-1.5 text-[10px] font-black tracking-widest uppercase theme-text-accent hover:scale-105 transition-all group px-3 py-1.5 rounded-[calc(var(--radius)-4px)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:theme-border-accent shadow-sm">
                      <span className="material-symbols-outlined !text-[14px]">{t("icon_reply")}</span>
                      {t("ui_btn_reply")}
                    </button>
                  )}
                  {userId && userId !== c.author_id && !isBanned && (
                    <button onClick={() => setFlagTarget({ id: c.id, type: 'comment' })} className="flex items-center gap-1.5 text-[10px] font-black tracking-widest uppercase theme-text-danger hover:scale-105 transition-all group px-3 py-1.5 rounded-[calc(var(--radius)-4px)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:border-[var(--danger)] shadow-sm ml-2">
                      <span className="material-symbols-outlined !text-[14px]">{t("icon_flag")}</span>
                      {t("feed_btn_flag")}
                    </button>
                  )}
                  {(!userId || isBanned) && (
                    <div className="relative group/flagbtn">
                      <HoverTooltip
                        variant="danger"
                        title={isBanned ? t("alert_comm_banned") : t("alert_guest_mode_uploads")}
                        subtitle={isBanned ? t("alert_comm_banned_desc") : t("alert_guest_mode_desc")}
                        className="group-hover/flagbtn:flex z-[1000]"
                      />
                      <button disabled className="flex items-center gap-1.5 text-[10px] font-black tracking-widest uppercase theme-text-danger opacity-30 grayscale cursor-not-allowed group px-3 py-1.5 rounded-[calc(var(--radius)-4px)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-sm ml-2">
                        <span className="material-symbols-outlined !text-[14px]">{t("icon_flag")}</span>
                        {t("feed_btn_flag")}
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-3">
                {c.is_hidden && !isPostAuthor ? (
                  <p className="text-[var(--subtext)] opacity-50 italic text-sm">{t("reply_hidden")}</p>
                ) : (
                  <div className={`text-[var(--text)] text-sm leading-relaxed whitespace-pre-wrap ${c.is_hidden ? 'opacity-50' : 'opacity-90'} markdown-body`}>
                    <MarkdownRenderer content={c.content} onAssetClick={(type: string, id: string) => { onAssetClick?.(type, id); }} />
                  </div>
                )}
              </div>
              {c.code_snippet && !c.is_hidden && (
                <div className="mt-4 flex">
                  <button onClick={() => setActiveCodeSnippet(c.code_snippet)} className="px-5 py-2.5 rounded-lg bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] backdrop-blur-md text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-[0_4px_15px_color-mix(in_srgb,var(--accent)_5%,transparent)] hover:scale-105 active:scale-95">
                    <span className="material-symbols-outlined !text-[16px]">{t("icon_data_object")}</span>
                    {t("show_code")}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        {!isCollapsed && allowedReplies.length > 0 && (
          <div className="flex flex-col gap-2 mt-2">
            {visibleReplies.map((r: any) => renderCommentNode(r, depth + 1))}
            {hiddenRepliesCount > 0 && (
              <button onClick={toggleRepliesExpand} className="text-[9px] font-black uppercase tracking-widest theme-text-accent self-start ml-6 mt-1 hover:underline flex items-center gap-2">
                <span className="text-[12px]">↳</span> {t("feed_show_more_replies", { count: hiddenRepliesCount }) || `SHOW ${hiddenRepliesCount} MORE REPLIES`}
              </button>
            )}
            {isRepliesExpanded && allowedReplies.length > 1 && (
              <button onClick={toggleRepliesExpand} className="text-[9px] font-black uppercase tracking-widest theme-text-accent self-start ml-6 mt-1 hover:underline flex items-center gap-2">
                <span className="text-[12px]">↳</span> {t("show_less_replies")}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <SidePanel
        isOpen={true}
        onClose={onClose}
        title={
          post.mason_id === 'system' && post.category?.toLowerCase().includes('alert')
            ? (t("defcon_alert_title") || "GLOBAL ALERT")
            : (post.category ? "DISPATCH" : "COMM-LINK")
        }
        icon={post.mason_id === 'system' && post.category?.toLowerCase().includes('alert') ? "priority_high" : "forum"}
        iconColorClass={post.mason_id === 'system' && post.category?.toLowerCase().includes('alert') ? "text-[var(--danger)] drop-shadow-[0_0_10px_rgba(var(--danger-rgb),0.8)]" : undefined}
        widthClass="w-[55vw] max-w-5xl"
        panelZ="z-[50001]"
        backdropZ="z-[50000]"
        noPadding={true}
        noScroll={true}
        panelClass={post.mason_id === 'system' && post.category?.toLowerCase().includes('alert') ? 'danger-accent-override' : undefined}
        subtitle={
          post.mason_id === 'system' && post.category?.toLowerCase().includes('alert')
            ? (t("alert_subtitle") || "Critical system override, warnings, and urgent advisories")
            : (post.category ? (t("dispatch_subtitle") || "Official system updates, information, and event logs") : (t("transmission_subtitle") || "Direct communications and logs from Sanctuary Architects"))
        }
      >
        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col relative">
          {imageUrl && (() => {
            const isSystem = post.mason_id === 'system';
            const isAlert = isSystem && post.category?.toLowerCase().includes('alert');
            return (
              <div className={`w-full h-64 sm:h-80 relative shrink-0 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[var(--bg)]`}>
                {isSystem && (
                  <>
                    {isAlert && <div className="absolute inset-0 bg-[var(--danger)]/20 z-0" />}
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[var(--background)] z-10 opacity-90" />
                    <div className={`absolute inset-0 bg-gradient-to-br ${isAlert ? 'from-[var(--danger)]/20' : 'from-[var(--accent)]/10'} to-transparent z-10 pointer-events-none`} />
                  </>
                )}
                {!isSystem && (
                   <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[var(--background)] z-10 opacity-90 pointer-events-none" />
                )}
                <img src={imageUrl} className={`w-full h-full object-cover object-center relative z-0 ${isSystem ? 'opacity-60 mix-blend-luminosity' : ''}`} alt={t("auto_post_cover")} />
              </div>
            );
          })()}
          <div className={`p-10 gap-0 flex flex-col flex-1 relative z-20 ${imageUrl ? '-mt-22 sm:-mt-22' : ''}`}>

            <div className={`flex flex-col gap-4 mb-2 ${imageUrl ? 'p-8 -mx-8 rounded-[var(--radius)] border border-white/10 bg-[var(--background)]/40 backdrop-blur-2xl shadow-2xl mt-4' : ''}`}>
              <h1 className={`text-4xl font-black uppercase tracking-tighter drop-shadow-sm leading-tight ${post.mason_id === 'system' && post.category?.toLowerCase().includes('alert') ? 'text-[var(--danger)] drop-shadow-[0_0_10px_rgba(var(--danger-rgb),0.4)]' : 'text-[var(--text)]'}`}>
                {renderTextWithIcons(post.title)}
              </h1>

              <div className="flex items-center gap-3">
                <span className="text-[9px] font-mono theme-text-accent px-3 py-1 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] rounded-full border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] backdrop-blur-md shadow-sm">
                  {new Date(post.created_at).toLocaleString()}
                </span>
                <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--text)] flex items-center gap-1.5 opacity-80 px-3 py-1 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] rounded-full border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] backdrop-blur-md shadow-sm">
                  {t("post_by")}
                  <span className="theme-text-accent cursor-pointer hover:underline hover:opacity-100 transition-opacity" onClick={() => { if (post.mason_id !== 'system') { onClose(); onOpenMasonProfile?.(post.mason_id); } }}>
                    {post.mason_id === 'system' ? 'Sanctuary OS' : (post.masons?.name || t("unknown_architect") || "Unknown Architect")}
                  </span>
                </span>
              </div>
            </div>

            <div className="flex-1 flex flex-col">
              <div className="markdown-body text-[var(--text)] opacity-90 leading-relaxed text-lg flex-1">
                <MarkdownRenderer
                  content={content}
                  isAlert={post.mason_id === 'system' && post.category?.toLowerCase().includes('alert')}
                  onAssetClick={(type: string, id: string) => {
                    onAssetClick?.(type, id);
                  }}
                />
              </div>

              {post.code_snippet && (
                <div className="mt-12 p-6 rounded-[var(--radius)] theme-glass-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative overflow-hidden group shadow-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-5">
                      <div className="w-12 h-12 rounded-[calc(var(--radius)-4px)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] flex items-center justify-center">
                        <span className="material-symbols-outlined text-[24px] theme-text-accent">{t("icon_data_object")}</span>
                      </div>
                      <div>
                        <h4 className="text-[12px] font-black uppercase tracking-[0.2em] text-[var(--text)]">{t("code_snippet")}</h4>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtext)] mt-1">{t("code_desc")}</p>
                      </div>
                    </div>
                    <button onClick={() => setActiveCodeSnippet(post.code_snippet)} className="px-6 py-3 rounded-[calc(var(--radius)-4px)] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] text-[10px] font-black uppercase tracking-widest hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:scale-105 transition-all shadow-[0_10px_30px_color-mix(in_srgb,var(--accent)_15%,transparent)] flex items-center gap-2 backdrop-blur-md active:scale-95">
                      <span className="material-symbols-outlined text-[16px]">{t("icon_visibility")}</span>
                      {t("show_code")}
                    </button>
                  </div>
                </div>
              )}


            </div>

            <div className="mt-8 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] pt-10 flex flex-col gap-8">
              <h3 className="text-2xl font-black uppercase tracking-[0.2em] text-[var(--text)] flex items-center gap-4">
                <span className="material-symbols-outlined theme-text-accent text-[32px]">{t("icon_forum")}</span>
                {t("ui.replies")}
              </h3>

              {userId && localStorage.getItem("sanctuary_blacklisted") !== "true" ? (
                <form onSubmit={handlePostComment} className="flex flex-col gap-3 relative theme-glass-inner p-6 rounded-[var(--radius)] border border-white/5 shadow-xl">
                  {replyTargetId && (
                    <div className="flex items-center justify-between bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border-l-4 theme-border-accent rounded-r-xl p-4 mb-2 shadow-inner">
                      <div className="flex flex-col gap-1 overflow-hidden">
                        <span className="text-[9px] font-black tracking-widest uppercase theme-text-accent flex items-center gap-2">
                          <span className="material-symbols-outlined !text-[14px]">{t("icon_reply")}</span>
                          {t("replying_to")} @{replyTargetUsername}
                        </span>
                        <span className="text-[12px] font-medium text-[var(--text)] opacity-80 italic truncate flex items-center gap-1">
                          "{renderTextWithIcons(replyTargetSnippet)}"
                        </span>
                      </div>
                      <button type="button" onClick={() => setReplyTargetId(null)} className="theme-text-accent hover:text-white hover:bg-white/10 w-8 h-8 rounded-full flex items-center justify-center transition-colors">
                        <span className="material-symbols-outlined !text-[18px]">{t("icon_close")}</span>
                      </button>
                    </div>
                  )}
                  <textarea
                    id="reply-textarea"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder={t("write_reply")}
                    className="w-full bg-transparent border-none text-sm text-[var(--text)] placeholder-[var(--subtext)] outline-none resize-none h-20 custom-scrollbar"
                  />
                  {showCodeInput && (
                    <div className="mt-2 relative group">
                      <div className="absolute top-0 left-0 w-1 h-full theme-bg-accent rounded-l-xl z-10" />
                      <textarea
                        value={codeSnippet}
                        onChange={(e) => setCodeSnippet(e.target.value)}
                        placeholder={t("ph_code_logs")}
                        className="w-full bg-[color-mix(in_srgb,var(--bg)_30%,transparent)] backdrop-blur-md border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-[calc(var(--radius)-4px)] py-4 pl-6 pr-4 text-[13px] font-mono text-[var(--text)] placeholder-[var(--subtext)] outline-none focus:theme-border-accent transition-all resize-none h-40 custom-scrollbar shadow-inner"
                        spellCheck={false}
                      />
                      <div className="absolute top-4 right-4 text-[10px] font-black uppercase tracking-widest text-[var(--text)] opacity-30 pointer-events-none">{t("code_snippet")}</div>
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => setShowCodeInput(!showCodeInput)} className={`flex items-center gap-2 px-6 py-3 rounded-[calc(var(--radius)-4px)] font-black uppercase tracking-widest text-[10px] transition-all border ${showCodeInput ? 'border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] theme-text-accent shadow-[0_0_15px_rgba(var(--accent-rgb),0.3)]' : 'bg-transparent border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>
                        <span className="material-symbols-outlined !text-[16px]">{showCodeInput ? 'close' : 'data_object'}</span> {showCodeInput ? "HIDE CODE PASTE" : (t("add_code"))}
                      </button>
                      <button type="button" onClick={() => setIsAssetPanelOpen(true)} className="flex items-center gap-2 px-6 py-3 rounded-[calc(var(--radius)-4px)] font-black uppercase tracking-widest text-[10px] transition-all border bg-transparent border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                        <span className="material-symbols-outlined !text-[16px]">link</span> {t("link_asset")}
                      </button>
                    </div>
                    <button type="submit" disabled={!newComment.trim() && !codeSnippet.trim()} className="px-8 py-3 rounded-[calc(var(--radius)-4px)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] theme-text-accent font-black uppercase tracking-[0.2em] text-[10px] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-105 transition-all shadow-[0_0_15px_rgba(var(--accent-rgb),0.3)] disabled:opacity-50 disabled:hover:scale-100 flex items-center gap-2">
                      <span className="material-symbols-outlined !text-[16px]">{t("icon_send")}</span> {t("btn_send")}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="text-center text-[10px] font-black tracking-widest uppercase text-[var(--subtext)] p-6 bg-white/5 rounded-[var(--radius)] border border-white/5">
                  {localStorage.getItem("sanctuary_blacklisted") === "true" ? t("alert_comm_banned") : t("login_required")}
                </div>
              )}

              <div className="flex flex-col gap-6 mt-4">
                {loading ? (
                  <div className="text-[10px] font-black tracking-widest uppercase text-[var(--subtext)] opacity-50 text-center py-10 animate-pulse">{t("loading_replies")}</div>
                ) : comments.filter(c => !c.is_hidden || isPostAuthor).length === 0 ? (
                  <EmptyState icon={t("icon_forum") || "forum"} title={t("no_replies")} className="col-span-full py-16" />
                ) : (
                  buildCommentTree(comments).map(c => renderCommentNode(c))
                )}
              </div>
            </div>

            <div className="mt-12 pt-8 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] flex items-center justify-center w-full gap-8">
              <div className="flex items-center gap-4">
                {post.mason_id !== 'system' && <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-50">{t("creator_links")}</span>}
                {post.mason_id !== 'system' && (
                  <button onClick={() => { onClose(); onOpenMasonProfile?.(post.mason_id); }} className={standardButtonClass}>{t("btn_view_profile")}</button>
                )}
                {post.masons?.patreon_url && <button onClick={() => handleOpenUrl(post.masons.patreon_url)} className="px-8 py-4 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-black uppercase tracking-[0.2em] rounded-[var(--radius)] hover:bg-rose-500/20 hover:border-rose-500/60 hover:text-rose-300 hover:-translate-y-1 hover:shadow-[0_10px_30px_color-mix(in_srgb,var(--rose-500)_20%,transparent)] transition-all duration-300 flex items-center justify-center gap-2">{t("btn_patreon")}</button>}
                {post.masons?.discord_url && <button onClick={() => handleOpenUrl(post.masons.discord_url)} className="px-8 py-4 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs font-black uppercase tracking-[0.2em] rounded-[var(--radius)] hover:bg-indigo-500/20 hover:border-indigo-500/60 hover:text-indigo-300 hover:-translate-y-1 hover:shadow-[0_10px_30px_color-mix(in_srgb,var(--indigo-500)_20%,transparent)] transition-all duration-300 flex items-center justify-center gap-2">{t("btn_discord")}</button>}
              </div>
              <div className="flex items-center gap-4">
                {userId && !isPostAuthor && !isBanned && (
                  <button onClick={() => setFlagTarget({ id: post.id, type: 'post' })} className={standardDangerButtonClass}>
                    <span className="material-symbols-outlined !text-[16px]">{t("icon_flag")}</span>
                    {t("feed_btn_flag")}
                  </button>
                )}
                {(!userId || isBanned) && (
                  <div className="relative group/flagbtn">
                    <HoverTooltip
                      variant="danger"
                      title={isBanned ? t("alert_comm_banned") : t("alert_guest_mode_uploads")}
                      subtitle={isBanned ? t("alert_comm_banned_desc") : t("alert_guest_mode_desc")}
                      className="group-hover/flagbtn:flex z-[1000]"
                    />
                    <button disabled className={`${standardDangerButtonClass} opacity-30 grayscale cursor-not-allowed`}>
                      <span className="material-symbols-outlined !text-[16px]">{t("icon_flag")}</span>
                      {t("feed_btn_flag")}
                    </button>
                  </div>
                )}
                {post.mason_id === 'system' && (
                  <button onClick={onClose} className={standardButtonClass}>
                    <span className="material-symbols-outlined !text-[16px]">{t("icon_close")}</span>
                    {t("ui_btn_close") || "CLOSE"}
                  </button>
                )}
              </div>
            </div>
          </div>
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

      <SidePanel
        isOpen={isAssetPanelOpen}
        onClose={() => setIsAssetPanelOpen(false)}
        title={t("link_asset")}
        icon="link"
        backdropZ="z-[50000]"
        panelZ="z-[50001]"
      >
        <div className="flex flex-col gap-6">
          <div className="animate-in slide-in-from-top-2">
            <div className="relative w-full">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 !text-sm">{t("icon_search")}</span>
              <input
                value={assetSearchQuery}
                onChange={(e) => setAssetSearchQuery(e.target.value)}
                placeholder={t("search_assets")}
                className="w-full theme-glass-panel rounded-[var(--radius)] pl-10 pr-5 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40 shadow-inner"
                autoFocus
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {filteredAssets.length === 0 && <EmptyState icon={t("ui_icon_image_not_supported") || "image_not_supported"} title={t("no_assets")} className="col-span-full py-16" />}
            {filteredAssets.map(asset => (
              <button key={`${asset.type}-${asset.id}`} type="button" onClick={() => handleLinkAsset(asset)} className="text-left px-5 py-4 rounded-[var(--radius)] theme-glass-inner hover:theme-border-accent hover:-translate-y-0.5 transition-all flex items-center gap-4 group">
                <span className="material-symbols-outlined opacity-70 text-xl shrink-0 group-hover:scale-110 transition-transform">{asset.type === 'mod' ? (t("icon_extension")) : asset.type === 'blueprint' ? (t("icon_architecture")) : asset.type === 'lexicon' ? (t("icon_translate")) : (t("icon_palette"))}</span>
                <span className="text-sm font-black text-[var(--text)] uppercase tracking-tight truncate w-full group-hover:theme-text-accent transition-colors">{asset.name}</span>
              </button>
            ))}
          </div>
        </div>
      </SidePanel>

      {activeCodeSnippet && (
        <CodeSnippetSidebar code={activeCodeSnippet} onClose={() => setActiveCodeSnippet(null)} />
      )}
    </>
  );
}
