import React from "react";
import { useLexicon } from "./LexiconContext";
import { stripMarkdown, renderTextWithIcons } from "./shared";
import { useStore } from "./store";
import { UniversalCard } from "./components/universal/UniversalCard";

export default function MasonPostCard({ post, index, onPostClick, onToggleLike, onOpenMasonProfile, isFeatured, isCompact }: any) {
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
  const hashtags = (post.content.match(/#[a-zA-Z0-9_]+/g) || []).slice(0, 3);
  
  const masonCommentDrafts = useStore(state => state.masonCommentDrafts);
  const hasUnsavedReply = !!masonCommentDrafts[post.id];
  
  const showImage = !!imageUrl;

  const cardBadges = (
    <div className="flex flex-wrap gap-2">
      {hashtags.map((tag: string) => (
        <span key={tag} className="text-[10px] font-mono theme-text-accent opacity-60 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] px-2 py-1 rounded-md">{tag}</span>
      ))}
    </div>
  );

  const footer = (
    <div className="flex items-center justify-between flex-wrap gap-y-3 relative z-10 w-full pt-4 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
      <div className="flex items-center gap-3">
        <div 
          className={`w-8 h-8 rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(var(--text-rgb),0.3)] cursor-pointer z-20 hover:scale-110 transition-transform overflow-hidden ${
            post.mason_id === 'system' || !post.masons?.avatar_url 
              ? 'glass-surface border border-[color-mix(in_srgb,var(--text)_20%,transparent)] backdrop-blur-md' 
              : 'bg-transparent border border-[color-mix(in_srgb,var(--text)_10%,transparent)]'
          }`}
          onClick={(e) => { e.stopPropagation(); onOpenMasonProfile && onOpenMasonProfile(post.mason_id); }}
        >
          {post.mason_id === 'system' ? (
             <span className={`material-symbols-outlined !text-[16px] ${post.category?.toLowerCase().includes('alert') ? 'text-[var(--danger)]' : 'text-[var(--text)]'} drop-shadow-md`}>memory</span>
          ) : post.masons?.avatar_url ? (
             <img src={post.masons.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
             <span className="text-xs font-black text-[var(--text)]">{post.masons?.name?.charAt(0) || '?'}</span>
          )}
        </div>
        <div className="flex flex-col z-20">
          <span 
            className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] hover:theme-text-accent cursor-pointer transition-colors"
            onClick={(e) => { e.stopPropagation(); onOpenMasonProfile && onOpenMasonProfile(post.mason_id); }}
          >
            {post.masons?.name || t("unknown_architect") || "Unknown Architect"}
          </span>
          <span className="text-[9px] font-bold text-[var(--subtext)] opacity-50 font-mono tracking-widest">{new Date(post.created_at).toLocaleDateString()}</span>
        </div>
      </div>
      
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
    </div>
  );

  const customExtras = (
    <>
      {isNew && (
        <div className="absolute top-0 left-0 z-[60] bg-[var(--accent)]/20 backdrop-blur-md border-b border-r border-[var(--accent)]/50 text-[var(--text)] px-4 py-2 rounded-br-2xl text-[9px] font-black uppercase tracking-widest shadow-lg flex items-center gap-1">
          <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{t("icon_new_releases")}</span>
          {t("badge_new")}
        </div>
      )}
      <div className="absolute top-0 right-0 z-[60] flex items-start">
        {hasUnsavedReply && (
          <div className="bg-[var(--warning)]/20 backdrop-blur-md border-b border-l border-[var(--warning)]/30 text-[var(--warning)] px-4 py-2 text-[9px] font-black uppercase tracking-widest shadow-[0_0_10px_rgba(var(--warning-rgb),0.2)] flex items-center gap-1 rounded-bl-2xl">
            <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">{t("icon_edit_note")}</span>
            UNSAVED REPLY
          </div>
        )}
        {post.is_pinned && (
          <div className={`bg-[var(--text)]/10 backdrop-blur-md border-b border-[var(--text)]/20 border-l text-[var(--text)] px-4 py-2 text-[9px] font-black uppercase tracking-widest shadow-lg flex items-center gap-1 ${hasUnsavedReply ? 'rounded-bl-none' : 'rounded-bl-2xl'}`}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{t("icon_keep")}</span>
            {t("pinned")}
          </div>
        )}
      </div>
    </>
  );

  return (
    <div 
      className={`glass-panel p-4 rounded-[var(--radius)] flex flex-col gap-4 group border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)] hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden ${isFeatured ? 'lg:col-span-2' : ''}`}
      style={{ animationFillMode: "both", animationDelay: `${(index % 10) * 100}ms` }}
      onClick={() => onPostClick(post)}
    >
      {/* Background Hover Effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      {/* Floating Status Badges (Absolute to Card) */}
      <div className="absolute top-4 right-4 z-20 flex gap-2">
         {post.is_pinned && (
           <div className="w-6 h-6 rounded-full backdrop-blur-md border border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)] shadow-md flex items-center justify-center">
              <span className="material-symbols-outlined !text-[12px] drop-shadow-md">{t("icon_push_pin")}</span>
           </div>
         )}
         {hasUnsavedReply && (
           <div className="w-6 h-6 rounded-full backdrop-blur-md border border-[var(--warning)]/30 bg-[var(--warning)]/10 text-[var(--warning)] shadow-md flex items-center justify-center">
              <span className="material-symbols-outlined !text-[12px] drop-shadow-md">{t("icon_edit_note")}</span>
           </div>
         )}
         {isNew && (
           <div className="w-6 h-6 rounded-full backdrop-blur-md border border-[var(--success)]/30 bg-[var(--success)]/10 text-[var(--success)] shadow-md flex items-center justify-center">
              <span className="material-symbols-outlined !text-[12px] drop-shadow-md">{t("icon_new_releases")}</span>
           </div>
         )}
      </div>

      {/* Header: Author & Category */}
      <div className="flex items-center justify-between relative z-10">
        <div className="flex items-center gap-3">
           <div 
             className={`w-10 h-10 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] flex items-center justify-center shadow-md cursor-pointer hover:scale-105 hover:border-[var(--accent)] transition-all overflow-hidden ${
               post.mason_id === 'system' || !post.masons?.avatar_url ? 'glass-surface backdrop-blur-md' : 'bg-transparent'
             }`}
             onClick={(e) => { e.stopPropagation(); onOpenMasonProfile && onOpenMasonProfile(post.mason_id); }}
           >
              {post.mason_id === 'system' ? (
                 <span className={`material-symbols-outlined !text-[20px] ${post.category?.toLowerCase().includes('alert') ? 'text-[var(--danger)]' : 'text-[var(--text)]'} drop-shadow-md`}>memory</span>
              ) : post.masons?.avatar_url ? (
                 <img src={post.masons.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                 <span className="text-sm font-black">{post.masons?.name?.charAt(0) || '?'}</span>
              )}
           </div>
           <div className="flex flex-col">
             <span 
               className="text-[11px] font-black uppercase tracking-widest text-[var(--text)] hover:theme-text-accent cursor-pointer transition-colors"
               onClick={(e) => { e.stopPropagation(); onOpenMasonProfile && onOpenMasonProfile(post.mason_id); }}
             >
               {post.masons?.name || t("unknown_architect") || "Unknown Architect"}
             </span>
             <div className="flex items-center gap-2 mt-0.5">
               <span className="text-[9px] font-mono text-[var(--subtext)] opacity-60 uppercase tracking-widest">{new Date(post.created_at).toLocaleDateString()}</span>
               <span className="text-[8px] px-1.5 py-0.5 rounded bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--subtext)] font-black uppercase tracking-widest">
                 {post.category === 'dispatch' ? (t("dispatch") || "DISPATCH") : (t("comm_link") || "COMM-LINK")}
               </span>
             </div>
           </div>
        </div>
      </div>

      {/* Image (if any) */}
      {showImage && (
        <div className={`w-full ${isFeatured ? 'h-64' : 'h-40'} rounded-[calc(var(--radius)-8px)] overflow-hidden shrink-0 relative shadow-sm border border-[color-mix(in_srgb,var(--text)_5%,transparent)] z-10`}>
          <img src={imageUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out" />
        </div>
      )}

      {/* Content Area */}
      <div className="flex flex-col flex-1 z-10">
        <h3 className="text-base font-black uppercase tracking-widest text-[var(--text)] leading-tight mb-2 group-hover:theme-text-accent transition-colors duration-300">
           {renderTextWithIcons(post.title)}
        </h3>

        <p className={`text-[11px] font-mono text-[var(--subtext)] opacity-70 leading-relaxed whitespace-pre-wrap break-words transition-opacity group-hover:opacity-100 ${isCompact ? 'line-clamp-2' : isFeatured ? 'line-clamp-4' : 'line-clamp-3'}`}>
          {post.description ? renderTextWithIcons(post.description) : renderTextWithIcons(stripMarkdown(content).replace(/#[a-zA-Z0-9_]+/g, '').trim())}
        </p>

        {hashtags.length > 0 && !isCompact && (
          <div className="mt-3">
            {cardBadges}
          </div>
        )}
      </div>

      {/* Footer Stats/Actions */}
      <div className="mt-auto pt-3 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] flex justify-between items-center z-10">
        <div className="flex items-center gap-4 text-[10px] font-mono font-bold text-[var(--subtext)] opacity-60 group-hover:opacity-100 transition-opacity">
          <span className="relative group/tooltip flex items-center gap-1.5 hover:text-[var(--text)] cursor-pointer">
            <span className="material-symbols-outlined !text-[16px]">{t("icon_visibility")}</span> {(post.views?.[0]?.count || 0).toLocaleString()}
          </span>
          <span className="relative group/tooltip flex items-center gap-1.5 hover:text-[var(--text)] cursor-pointer" onClick={(e) => onToggleLike(e, post)}>
            <span className="material-symbols-outlined !text-[16px]">{t("icon_favorite")}</span> {(post.likes?.[0]?.count || 0).toLocaleString()}
          </span>
          <span className="relative group/tooltip flex items-center gap-1.5 hover:text-[var(--text)] cursor-pointer">
            <span className="material-symbols-outlined !text-[16px]">{t("icon_chat")}</span> {(post.comments?.[0]?.count || 0).toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
