import React from "react";
import { useLexicon } from "./LexiconContext";
import { stripMarkdown, renderTextWithIcons } from "./shared";
import { useStore } from "./store";
import { UniversalCard } from "./components/universal/UniversalCard";

export default function MasonPostCard({ post, index, onPostClick, onToggleLike, onOpenMasonProfile, isFeatured, isCompact, actions, hasUnsavedEdits }: any) {
  const { t } = useLexicon();

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
  const isNew = new Date(post.created_at).getTime() > Date.now() - 86400000;
  const hashtags = (content.match(/#[a-zA-Z0-9_]+/g) || []).slice(0, 3);
  
  const masonCommentDrafts = useStore(state => state.masonCommentDrafts);
  const hasUnsavedReply = !!masonCommentDrafts[post.id];
  
  const showImage = !!imageUrl;

  const cardBadges = (
    <div className="flex flex-wrap gap-2">
      {hashtags.map((tag: string) => (
        <span key={tag} className="text-[10px] font-mono theme-text-accent opacity-60 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] px-2 py-1 rounded-md border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner">{tag}</span>
      ))}
    </div>
  );

  const footer = (
    <div className="flex items-center justify-between flex-wrap gap-y-3 w-full">
      <div className="flex items-center gap-4 text-[10px] font-mono font-bold text-[var(--subtext)] opacity-50 group-hover:opacity-100 transition-opacity">
        <span className="relative group/tooltip flex items-center gap-1.5 hover:text-[var(--text)] cursor-pointer">
          <span className="material-symbols-outlined !text-[16px]">{t("icon_visibility")}</span> {(post.views?.[0]?.count || 0).toLocaleString()}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-4 py-2 bg-[var(--sidebar)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl text-[10px] font-black uppercase tracking-widest text-[var(--text)] whitespace-nowrap shadow-[0_10px_30px_rgba(0,0,0,0.5)] opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-300 pointer-events-none backdrop-blur-xl z-[100]">
            {t("ui.views")}
          </div>
        </span>
        <span className="relative group/tooltip flex items-center gap-1.5 hover:text-[var(--text)] cursor-pointer" onClick={(e) => onToggleLike(e, post)}>
          <span className="material-symbols-outlined !text-[16px]">{t("icon_favorite")}</span> {(post.likes?.[0]?.count || 0).toLocaleString()}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-4 py-2 bg-[var(--sidebar)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl text-[10px] font-black uppercase tracking-widest text-[var(--text)] whitespace-nowrap shadow-[0_10px_30px_rgba(0,0,0,0.5)] opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-300 pointer-events-none backdrop-blur-xl z-[100]">
            {t("ui_likes") || "Likes"}
          </div>
        </span>
        <span className="relative group/tooltip flex items-center gap-1.5 hover:text-[var(--text)] cursor-pointer">
          <span className="material-symbols-outlined !text-[16px]">{t("icon_chat")}</span> {(post.comments?.[0]?.count || 0).toLocaleString()}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-4 py-2 bg-[var(--sidebar)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl text-[10px] font-black uppercase tracking-widest text-[var(--text)] whitespace-nowrap shadow-[0_10px_30px_rgba(0,0,0,0.5)] opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-300 pointer-events-none backdrop-blur-xl z-[100]">
            {t("ui.replies")}
          </div>
        </span>
      </div>
      <span className="text-[9px] font-bold text-[var(--subtext)] opacity-50 font-mono tracking-widest">{new Date(post.created_at).toLocaleDateString()}</span>
    </div>
  );

  const customExtras = (
    <>
      <div className="absolute top-3 left-3 z-[60] flex flex-col items-start gap-2">
        {isNew && (
          <div className="bg-[var(--accent)]/20 backdrop-blur-xl border border-[var(--accent)]/50 text-[var(--text)] px-2.5 py-1 text-[9px] font-black uppercase tracking-widest shadow-lg flex items-center gap-1 rounded-full">
            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{t("icon_new_releases")}</span>
            {t("badge_new")}
          </div>
        )}
        {hasUnsavedReply && (
          <div className="bg-[var(--warning)]/20 backdrop-blur-xl border border-[var(--warning)]/30 text-[var(--warning)] px-2.5 py-1 text-[9px] font-black uppercase tracking-widest shadow-[0_0_10px_rgba(var(--warning-rgb),0.2)] flex items-center gap-1 rounded-full">
            <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">{t("icon_edit_note")}</span>
            UNSAVED REPLY
          </div>
        )}
        {(() => {
          let badgeType = null;
          const isPinned = post.is_pinned === true || post.is_pinned === 'true';
          
          if (post.mason_id === 'system') {
            if (isPinned) badgeType = 'urgent';
            else if (post.category?.toLowerCase().includes('alert')) badgeType = 'alert';
          } else {
            if (isPinned) badgeType = 'pinned';
          }

          if (badgeType === 'urgent') {
            return (
              <div className="bg-[var(--danger)]/20 backdrop-blur-xl border border-[var(--danger)]/30 text-[var(--danger)] px-2.5 py-1 text-[9px] font-black uppercase tracking-widest shadow-[0_0_10px_rgba(239,68,68,0.2)] flex items-center gap-1 rounded-full">
                <span className="material-symbols-outlined !text-[12px]">{t("icon_emergency") || "emergency"}</span>
                {t("category_urgent") || "URGENT"}
              </div>
            );
          }
          if (badgeType === 'alert') {
            return (
              <div className="bg-[var(--danger)]/10 backdrop-blur-xl border border-[var(--danger)]/20 text-[var(--danger)] px-2.5 py-1 text-[9px] font-black uppercase tracking-widest shadow-lg flex items-center gap-1 rounded-full">
                <span className="material-symbols-outlined !text-[12px] opacity-80">{t("icon_warning") || "warning"}</span>
                {t("category_alert") || "ALERT"}
              </div>
            );
          }
          if (badgeType === 'pinned') {
            return (
              <div className="bg-[var(--accent)]/10 backdrop-blur-xl border border-[var(--accent)]/30 text-[var(--accent)] px-2.5 py-1 text-[9px] font-black uppercase tracking-widest shadow-lg flex items-center gap-1 rounded-full">
                <span className="material-symbols-outlined !text-[12px]">{t("icon_keep") || "keep"}</span>
                {t("pinned")}
              </div>
            );
          }
          return null;
        })()}
      </div>
    </>
  );

  const subtitleNode = (
    <div className="flex items-center gap-2">
      <div 
        className={`w-6 h-6 rounded-full flex items-center justify-center shadow-md cursor-pointer z-20 hover:scale-110 transition-transform overflow-hidden ${
          post.mason_id === 'system' || !post.masons?.avatar_url 
            ? 'glass-surface border border-[color-mix(in_srgb,var(--text)_20%,transparent)] backdrop-blur-md' 
            : 'bg-transparent border border-[color-mix(in_srgb,var(--text)_10%,transparent)]'
        }`}
        onClick={(e) => { e.stopPropagation(); onOpenMasonProfile && onOpenMasonProfile(post.mason_id); }}
      >
        {post.mason_id === 'system' ? (
           <span className={`material-symbols-outlined !text-[12px] ${post.category?.toLowerCase().includes('alert') ? 'text-[var(--danger)]' : 'text-[var(--text)]'} drop-shadow-md`}>memory</span>
        ) : post.masons?.avatar_url ? (
           <img src={post.masons.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
        ) : (
           <span className="text-[10px] font-black text-[var(--text)]">{post.masons?.name?.charAt(0) || '?'}</span>
        )}
      </div>
      <span 
        className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] opacity-80 hover:theme-text-accent cursor-pointer transition-colors"
        onClick={(e) => { e.stopPropagation(); onOpenMasonProfile && onOpenMasonProfile(post.mason_id); }}
      >
        {post.mason_id === 'system' ? (post.masons?.name || t("author_sanctuary_team") || "Sanctuary OS Team") : (post.masons?.name || t("unknown_architect") || "Unknown Architect")}
      </span>
      <span className="text-[10px] font-black opacity-30 text-[var(--text)]">&bull;</span>
      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">{post.category}</span>
    </div>
  );

  return (
    <UniversalCard
      layout={isCompact ? "vertical-compact" : "vertical"}
      title={post.title}
      subtitle={subtitleNode}
      image={showImage ? imageUrl : undefined}
      icon={!showImage ? "cell_tower" : undefined}
      statusColor={post.category?.toLowerCase().includes('alert') ? 'border-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.1)]' : undefined}
      badges={hashtags.length > 0 ? cardBadges : undefined}
      footer={footer}
      actions={actions}
      imageOverlay={customExtras}
      onClick={() => onPostClick(post)}
      className={isFeatured ? 'lg:col-span-2' : ''}
      style={{ animationFillMode: "both", animationDelay: `${(index % 10) * 100}ms` }}
    >
      {!isCompact && (
        <div className="text-xs text-[var(--subtext)] line-clamp-3 leading-relaxed font-medium mt-1">
          {renderTextWithIcons(stripMarkdown(content))}
        </div>
      )}
    </UniversalCard>
  );
}
