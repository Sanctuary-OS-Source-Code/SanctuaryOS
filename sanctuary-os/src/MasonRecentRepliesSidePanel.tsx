import React, { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { SidePanel } from "./shared";
import { useLexicon } from "./LexiconContext";

export default function MasonRecentRepliesSidePanel({ 
  isOpen, 
  onClose, 
  masonId,
  userProfileId,
  onReplyClick 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  masonId?: string;
  userProfileId?: string;
  onReplyClick?: (postId: string, replyId: string) => void;
}) {
  const { t } = useLexicon();
  const [replies, setReplies] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) loadReplies();
  }, [isOpen]);

  const loadReplies = async () => {
    if (!masonId || !userProfileId) return;
    setIsLoading(true);

    const { data: myPosts } = await supabase.from("mason_posts").select("id, title").eq("mason_id", masonId);
    if (!myPosts || myPosts.length === 0) {
      setReplies([]);
      setIsLoading(false);
      return;
    }
    const myPostIds = myPosts.map(p => p.id);

    const { data: comments, error } = await supabase.from("mason_post_comments")
      .select("*, mason_posts(title)")
      .in("post_id", myPostIds)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) console.error("Error fetching comments:", error);

    if (!comments || comments.length === 0) {
      setReplies([]);
      setIsLoading(false);
      return;
    }

    const authorIds = [...new Set(comments.map(c => c.author_id))];
    const { data: profiles } = await supabase.from("profiles").select("id, username").in("id", authorIds);
    
    const merged = comments.map(c => ({
       ...c,
       profiles: profiles?.find(p => p.id === c.author_id)
    }));
    setReplies(merged);
    setIsLoading(false);
  };

  return (
    <SidePanel 
        isOpen={isOpen} 
        onClose={onClose} 
        title={t("mason_recent_transmissions")}
        subtitle={t("mason_recent_transmissions_sub")}
        icon={t("ui_icon_forum")}
        widthClass="w-[1000px]"
    >
        <div className="flex flex-col gap-6 w-full pb-8">
            <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6">
                {isLoading ? (
                    <div className="flex justify-center items-center h-32 opacity-50">
                        <span className="text-sm font-bold animate-pulse uppercase tracking-widest">{t("mason_loading_transmissions")}</span>
                    </div>
                ) : replies.length === 0 ? (
                    <div className="flex flex-col justify-center items-center h-64 theme-glass-panel rounded-3xl border border-white/5 shadow-xl group">
                        <span className="text-6xl mb-4 grayscale opacity-30 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-500 group-hover:scale-110 group-hover:-rotate-12">{t("ui_icon_mailbox")}</span>
                        <span className="text-sm font-black text-[var(--subtext)] uppercase tracking-widest text-center px-8 leading-relaxed">
                            {t("mason_no_recent_replies")}
                        </span>
                        <span className="text-[10px] font-bold text-[var(--subtext)] opacity-50 uppercase tracking-widest mt-2">
                            {t("mason_comm_link_quiet")}
                        </span>
                    </div>
                ) : (
                    replies.map(reply => (
                        <div 
                            key={reply.id}
                            className="theme-glass-panel rounded-2xl p-6 flex flex-col gap-3 group cursor-pointer border border-white/5 hover:border-emerald-500/30 hover:shadow-[0_0_30px_rgba(16,185,129,0.15)] transition-all hover:-translate-y-1"
                            onClick={() => {
                                if (onReplyClick && reply.post_id) {
                                    onReplyClick(reply.post_id, reply.id);
                                }
                            }}
                        >
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-xs font-black tracking-widest text-[var(--text)] group-hover:text-[var(--accent)] transition-colors uppercase flex items-center gap-2">
                                    <div className="w-6 h-6 rounded theme-bg-accent/20 flex items-center justify-center text-[10px] theme-text-accent shrink-0">
                                        {(reply.profiles?.username || t("mason_a_citizen") || "A Citizen").charAt(0).toUpperCase()}
                                    </div>
                                    {reply.profiles?.username || t("mason_a_citizen") || "A Citizen"}
                                </span>
                                <span className="text-[9px] font-bold opacity-60 text-[var(--subtext)] uppercase tracking-wider bg-black/30 px-2 py-1 rounded">
                                    {new Date(reply.created_at).toLocaleString()}
                                </span>
                            </div>
                            
                            <p className="text-sm text-[var(--text)] leading-relaxed bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] p-4 rounded-xl border border-white/5">
                                {reply.content}
                            </p>
                            
                            <div className="flex items-center gap-2 mt-2 pt-3 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                                <span className="material-symbols-outlined text-sm text-[var(--subtext)]">{t("ui_icon_reply")}</span>
                                <span className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest">
                                    {t("mason_original_post")}: 
                                </span>
                                <span className="text-[10px] font-bold text-[var(--text)] truncate max-w-[200px]">
                                    {reply.mason_posts?.title || t("mason_unknown_mason") || "Unknown Mason"}
                                </span>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    </SidePanel>
  );
}
