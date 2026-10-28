import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import {
  SidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  StatBox,
  EmptyState,
  renderTextWithIcons,
} from "../shared";
import { useLexicon } from "../LexiconContext";
import { VAULT_CHIP_CLASS } from "../Cards";

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

  const commentCount = interactions.filter(i => i.type === 'comment').length;
  const likeCount = interactions.filter(i => i.type === 'like').length;

  return (
    <SidePanel 
      isOpen={isOpen} 
      onClose={onClose} 
      title={t("feed_stat_activity", "Interactions")}
      subtitle={t("feed_interactions_sub", "Recent activity on your comm-links")}
      icon={t("icon_favorite", "favorite")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[760px]"
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_favorite", "favorite")}
          overline={t("feed_stat_activity", "Interactions")}
          title={t("feed_interactions_sub", "Recent activity on your comm-links")}
          description={t("comm_link_quiet", "Monitor citizen replies and appreciation across your comm-link broadcasts.")}
          badge={`${interactions.length}`}
          badgeIcon={t("icon_forum", "forum")}
          variant="accent"
        >
          <div className="grid grid-cols-2 gap-3 pt-1">
            <StatBox
              label={t("feed_stat_replies", "Replies")}
              value={commentCount}
              icon={t("icon_forum", "forum")}
              iconColorClass="text-[var(--accent)]"
            />
            <StatBox
              label={t("feed_stat_activity", "Likes")}
              value={likeCount}
              icon={t("icon_favorite", "favorite")}
              iconColorClass="text-[var(--accent)]"
            />
          </div>
        </SidePanelHeroCard>

        <UniversalGroup
          title={t("feed_stat_activity", "Activity Feed")}
          icon={t("icon_forum", "forum")}
        >
          {isLoading ? (
            <div className="glass-surface rounded-xl px-4 py-12 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex justify-center items-center gap-2 opacity-70">
              <span className="material-symbols-outlined animate-spin !text-[18px] text-[var(--accent)]">
                {t("icon_sync", "sync")}
              </span>
              <span className="text-xs font-black uppercase tracking-widest text-[var(--subtext)]">
                {t("loading_transmissions", "Loading {dispatches}...")}
              </span>
            </div>
          ) : interactions.length === 0 ? (
            <EmptyState
              icon={t("icon_heart_broken", "heart_broken")}
              title={t("no_recent_interactions", "No recent interactions detected.")}
              subtitle={t("comm_link_quiet", "Your comm-links are quiet.")}
              minHeightClass="min-h-[200px]"
            />
          ) : (
            <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
              {interactions.map((interaction, index) => (
                <div 
                  key={`${interaction.type}-${interaction.id}`}
                  className={`glass-panel rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-all duration-300 relative flex flex-col justify-between group ${
                    interaction.type === 'comment'
                      ? 'cursor-pointer hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]'
                      : ''
                  }`}
                  style={{ animationDelay: `${index * 40}ms` }}
                  onClick={() => {
                    if (interaction.type === 'comment' && onReplyClick && interaction.mason_posts) {
                      onReplyClick(interaction.mason_posts, interaction.id);
                    }
                  }}
                >
                  {/* Card Header Bar */}
                  <div className="px-4 py-3 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                        {interaction.type === 'like' ? (
                          <span className="material-symbols-outlined !text-[18px]">
                            {t("icon_favorite", "favorite")}
                          </span>
                        ) : (
                          <span className="text-xs font-black uppercase">
                            {(interaction.profiles?.username || t("a_citizen", "A {Citizen}")).charAt(0)}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-black text-[var(--text)] truncate group-hover:text-[var(--accent)] transition-colors">
                          {interaction.profiles?.username || t("a_citizen", "A {Citizen}")}
                        </span>
                        <span className="text-[10px] font-bold text-[var(--subtext)] opacity-80 truncate">
                          {new Date(interaction.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <span className={VAULT_CHIP_CLASS}>
                      <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--accent)]">
                        {interaction.type === 'like'
                          ? t("icon_favorite", "favorite")
                          : t("icon_forum", "forum")}
                      </span>
                      <span>
                        {interaction.type === 'like'
                          ? t("ui_liked_your_post", "Liked")
                          : t("ui_replied_to_post", "Replied")}
                      </span>
                    </span>
                  </div>

                  {/* Card Body */}
                  <div className="p-4 flex flex-col gap-3 flex-1 justify-between">
                    {interaction.type === 'comment' && (
                      <div className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-xs font-medium text-[var(--text)] leading-relaxed">
                        {renderTextWithIcons(interaction.content)}
                      </div>
                    )}

                    <div className="glass-surface rounded-xl px-3.5 py-2.5 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-between gap-2.5 mt-auto">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                          <span className="material-symbols-outlined !text-[16px]">
                            {interaction.type === 'like'
                              ? t("icon_newspaper", "newspaper")
                              : t("icon_reply", "reply")}
                          </span>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-[9px] font-black uppercase tracking-wider text-[var(--subtext)] shrink-0">
                            {t("original_post", "Original Post")}
                          </span>
                          <span className="text-xs font-bold text-[var(--text)] truncate">
                            {interaction.mason_posts?.title || t("unknown_post", "Unknown {Dispatch}")}
                          </span>
                        </div>
                      </div>
                      {interaction.type === 'comment' && (
                        <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
                          {t("icon_open_in_new", "open_in_new")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </UniversalGroup>
      </div>
    </SidePanel>
  );
}
