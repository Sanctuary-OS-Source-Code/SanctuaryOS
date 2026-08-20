import React, { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { SidePanel, renderTextWithIcons } from "../shared";
import { useLexicon } from "../LexiconContext";

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
  const [interactions, setInteractions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) loadInteractions();
  }, [isOpen]);

  const loadInteractions = async () => {
    if (!masonId || !userProfileId) return;
    setIsLoading(true);

    const { data: myPosts } = await supabase.from("mason_posts").select(`
      *,
      masons (
        id,
        name
      )
    `).eq("mason_id", masonId);
    if (!myPosts || myPosts.length === 0) {
      setInteractions([]);
      setIsLoading(false);
      return;
    }

    const postIds = myPosts.map(p => p.id);
    
    const [commentsRes, likesRes] = await Promise.all([
      supabase.from("mason_post_comments")
        .select("*")
        .in("post_id", postIds)
        .neq("author_id", userProfileId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("mason_post_likes")
        .select("*")
        .in("post_id", postIds)
        .neq("user_id", userProfileId)
        .order("created_at", { ascending: false })
        .limit(20)
    ]);

    const comments = commentsRes.data || [];
    const likes = likesRes.data || [];

    if (comments.length === 0 && likes.length === 0) {
      setInteractions([]);
      setIsLoading(false);
      return;
    }

    const posts = myPosts.filter(p => postIds.includes(p.id));

    const authorIds = [...new Set([
      ...comments.map(c => c.author_id),
      ...likes.map(l => l.user_id)
    ])];
    
    const { data: profiles } = await supabase.from("profiles").select("id, username").in("id", authorIds);
    
    const merged = [
      ...comments.map(c => ({
         ...c,
         type: 'comment',
         mason_posts: posts?.find(p => p.id === c.post_id),
         profiles: profiles?.find(p => p.id === c.author_id)
      })),
      ...likes.map(l => ({
         ...l,
         type: 'like',
         author_id: l.user_id,
         mason_posts: posts?.find(p => p.id === l.post_id),
         profiles: profiles?.find(p => p.id === l.user_id)
      }))
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 30);
    
    setInteractions(merged);
    setIsLoading(false);
  };

  return (
    <SidePanel 
        isOpen={isOpen} 
        onClose={onClose} 
        title={t("feed_stat_activity") || "Interactions"}
        subtitle={t("feed_interactions_sub") || "Recent activity on your comm-links"}
        icon={t("icon_favorite") || "favorite"}
        widthClass="w-[90vw] xl:w-[1000px]"
    >
        <div className="flex flex-col gap-6 w-full pb-12">
            {isLoading ? (
                <div className="flex justify-center items-center h-48 opacity-50">
                    <span className="text-sm font-bold animate-pulse capitalize tracking-widest">{t("loading_transmissions") || "Loading Interactions..."}</span>
                </div>
            ) : interactions.length === 0 ? (
                <div className="flex flex-col justify-center items-center h-64 glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-xl group">
                    <span className="text-6xl mb-4 grayscale opacity-30 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-500 group-hover:scale-110 group-hover:-rotate-12">{t("icon_heart_broken") || "heart_broken"}</span>
                    <span className="text-sm font-black text-[var(--subtext)] capitalize tracking-widest text-center px-8 leading-relaxed">
                        {t("no_recent_interactions") || "No recent interactions detected."}
                    </span>
                    <span className="text-[10px] font-bold text-[var(--subtext)] opacity-50 capitalize tracking-widest mt-2">
                        {t("comm_link_quiet") || "Your comm-links are quiet."}
                    </span>
                </div>
            ) : (
                <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
                    {interactions.map((interaction, index) => (
                        <div 
                            key={`${interaction.type}-${interaction.id}`}
                            className={`glass-panel p-6 rounded-2xl border transition-all duration-500 relative overflow-hidden flex flex-col gap-4 animate-in slide-in-from-bottom-4 fade-in ${interaction.type === 'comment' ? 'cursor-pointer hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:shadow-lg hover:-translate-y-1 hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)]' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}
                            style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'both' }}
                            onClick={() => {
                                if (interaction.type === 'comment' && onReplyClick && interaction.mason_posts) {
                                    onReplyClick(interaction.mason_posts, interaction.id);
                                }
                            }}
                        >
                            <div className="flex justify-between items-start w-full relative z-10">
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border shadow-sm ${interaction.type === 'like' ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)]' : 'bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] theme-text-accent'}`}>
                                        {interaction.type === 'like' ? (
                                            <span className="material-symbols-outlined !text-[20px]">favorite</span>
                                        ) : (
                                            <span className="text-[18px] font-black uppercase">{(interaction.profiles?.username || t("a_citizen") || "C").charAt(0)}</span>
                                        )}
                                    </div>
                                    <div className="flex flex-col justify-center gap-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="text-sm font-black text-[var(--text)] tracking-wide group-hover:theme-text-accent transition-colors">
                                                {interaction.profiles?.username || t("a_citizen")}
                                            </span>
                                            <span className="text-[11px] font-bold text-[var(--subtext)] lowercase tracking-wide flex items-center gap-1 opacity-80">
                                                {interaction.type === 'like' ? (
                                                    <><span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">favorite</span> {t("ui_liked_your_post") || "liked your post"}</>
                                                ) : (
                                                    <><span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">forum</span> {t("ui_replied_to_post") || "replied to your post"}</>
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                    <span className="text-[10px] font-bold text-[var(--subtext)] capitalize tracking-widest opacity-60 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] px-2 py-1 rounded-md">
                                        {new Date(interaction.created_at).toLocaleString()}
                                    </span>
                                    {interaction.type === 'comment' && (
                                        <div className="w-8 h-8 rounded-full bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] flex items-center justify-center text-[var(--accent)] opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-2 group-hover:translate-x-0">
                                            <span className="material-symbols-outlined !text-[16px]">open_in_new</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            {interaction.type === 'comment' && (
                                <div className="relative z-10 w-full mt-2">
                                    <p className="text-sm text-[var(--text)] leading-relaxed bg-[color-mix(in_srgb,var(--text)_3%,transparent)] p-5 rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[inset_0_1px_5px_rgba(0,0,0,0.2)]">
                                        {renderTextWithIcons(interaction.content)}
                                    </p>
                                </div>
                            )}
                            
                            <div className="flex items-center gap-2 pt-4 mt-auto border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] relative z-10 w-full group-hover:border-[color-mix(in_srgb,var(--accent)_20%,transparent)] transition-colors">
                                <span className={`material-symbols-outlined !text-[14px] ${interaction.type === 'like' ? 'text-[var(--accent)]' : 'text-[var(--subtext)] group-hover:text-[var(--accent)] transition-colors'}`}>
                                    {interaction.type === 'like' ? 'newspaper' : t("icon_reply") || "reply"}
                                </span>
                                <span className="text-[9px] font-black text-[var(--subtext)] capitalize tracking-widest whitespace-nowrap group-hover:text-[var(--text)] transition-colors">
                                    {t("original_post") || "Original Post"}: 
                                </span>
                                <span className="text-[11px] font-bold text-[var(--text)] truncate group-hover:theme-text-accent transition-colors">
                                    {interaction.mason_posts?.title || t("unknown_post") || "Unknown Post"}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    </SidePanel>
  );
}


