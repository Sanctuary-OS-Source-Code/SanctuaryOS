import React from "react";
import { useLexicon } from "./LexiconContext";
import { stripMarkdown } from "./shared";

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
  
  // Decide if we show the image at all
  const showImage = imageUrl && (!isCompact || isFeatured);

  return (
    <div 
      className={`theme-glass-panel rounded-[2rem] overflow-hidden flex flex-col cursor-pointer border border-white/5 group hover:theme-border-accent hover:shadow-[0_0_30px_rgba(var(--accent-rgb),0.15)] transition-all duration-500 animate-in fade-in slide-in-from-bottom-8 relative break-inside-avoid bg-gradient-to-br from-white/5 to-transparent ${isFeatured ? 'lg:col-span-2 lg:flex-row min-h-[220px]' : 'min-h-[260px]'}`} 
      style={{ animationFillMode: "both", animationDelay: `${(index % 10) * 100}ms` }} 
      onClick={() => onPostClick(post)}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
        
        {post.is_pinned && (
          <div className="absolute top-0 right-0 z-[60] bg-[var(--text)]/10 backdrop-blur-md border-b border-l border-[var(--text)]/20 text-[var(--text)] px-4 py-2 rounded-bl-2xl text-[9px] font-black uppercase tracking-widest shadow-lg flex items-center gap-1">
            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{t("ui_icon_keep") || "keep"}</span>
            {t("feed_badge_pinned") || "PINNED"}
          </div>
        )}
      
      
      
      {showImage && (
        <div className={`${isFeatured ? 'w-full lg:w-2/5 h-48 lg:h-auto border-b lg:border-b-0 lg:border-r' : 'w-full h-36 border-b'} bg-black/50 relative overflow-hidden shrink-0 border-white/5`}>
          <img src={imageUrl} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700 ease-out" alt="Post Cover" />
          {isNew && (
            <div className="absolute top-4 left-4 bg-[var(--accent)] text-[var(--bg)] px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shadow-lg">
              {t("feed_badge_new") || "NEW"}
            </div>
          )}
        </div>
      )}
      
      <div className={`p-6 flex flex-col flex-1 relative z-10 ${isFeatured ? 'justify-center' : ''}`}>
        {!showImage && isNew && (
          <div className="w-max mb-3 bg-[var(--accent)] text-[var(--bg)] px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shadow-lg">
            {t("feed_badge_new") || "NEW"}
          </div>
        )}
        
        <h4 className={`${isFeatured ? 'text-2xl mb-2' : 'text-lg mb-1'} font-black text-[var(--text)] uppercase tracking-tighter leading-tight group-hover:theme-text-accent transition-colors`}>
            {post.title}
          </h4>
        
        <p className={`text-xs text-[var(--text)] opacity-70 leading-relaxed font-medium mb-4 ${isCompact ? 'line-clamp-2' : (isFeatured ? 'line-clamp-4' : 'line-clamp-3')}`}>
          {stripMarkdown(content).replace(/#[a-zA-Z0-9_]+/g, '').trim()}
        </p>

        {hashtags.length > 0 && !isCompact && (
          <div className="flex flex-wrap gap-2 mb-4 mt-auto">
            {hashtags.map((tag: string) => (
              <span key={tag} className="text-[10px] font-mono theme-text-accent opacity-60 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] px-2 py-1 rounded-md">{tag}</span>
            ))}
          </div>
        )}

        <div className={`mt-auto pt-4 border-t border-white/5 flex items-center justify-between flex-wrap gap-y-3 relative z-10 ${isCompact ? 'mt-4' : ''}`}>
          <div className="flex items-center gap-3">
            <div 
              className="w-8 h-8 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] flex items-center justify-center border border-white/5 hover:theme-border-accent transition-colors shadow-sm cursor-pointer z-20"
              onClick={(e) => { e.stopPropagation(); onOpenMasonProfile && onOpenMasonProfile(post.mason_id); }}
            >
              <span className="text-xs font-black theme-text-accent">{post.masons?.name?.charAt(0) || '?'}</span>
            </div>
            <div className="flex flex-col z-20">
              <span 
                className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] hover:theme-text-accent cursor-pointer transition-colors"
                onClick={(e) => { e.stopPropagation(); onOpenMasonProfile && onOpenMasonProfile(post.mason_id); }}
              >
                {post.masons?.name || t("feed_unknown_architect") || "Unknown Architect"}
              </span>
              <span className="text-[8px] font-mono text-[var(--subtext)] opacity-60">{new Date(post.created_at).toLocaleDateString()}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4 text-[10px] font-mono text-[var(--subtext)] opacity-60 group-hover:opacity-100 transition-opacity">
            <span className="relative group/tooltip flex items-center gap-1 hover:theme-text-accent cursor-pointer">
              <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_visibility") || "visibility"}</span> {(post.views?.[0]?.count || 0).toLocaleString()}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/tooltip:flex flex-col bg-[color-mix(in_srgb,var(--bg)_40%,transparent)] backdrop-blur-2xl border border-white/10 rounded-lg px-2 py-1 shadow-xl z-50 w-max text-[9px] font-black uppercase tracking-widest text-[var(--text)]">
                {t("ui.views")}
              </div>
            </span>
            <span className="relative group/tooltip flex items-center gap-1 hover:text-emerald-400 cursor-pointer" onClick={(e) => onToggleLike(e, post)}>
              <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_sync") || "sync"}</span> {(post.likes?.[0]?.count || 0).toLocaleString()}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/tooltip:flex flex-col bg-[color-mix(in_srgb,var(--bg)_40%,transparent)] backdrop-blur-2xl border border-emerald-500/30 rounded-lg px-2 py-1 shadow-[0_0_15px_rgba(16,185,129,0.3)] z-50 w-max text-[9px] font-black uppercase tracking-widest text-emerald-400">
                {t("ui.syncs")}
              </div>
            </span>
            <span className="relative group/tooltip flex items-center gap-1 hover:text-blue-400 cursor-pointer">
              <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_chat") || "chat"}</span> {(post.comments?.[0]?.count || 0).toLocaleString()}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/tooltip:flex flex-col bg-[color-mix(in_srgb,var(--bg)_40%,transparent)] backdrop-blur-2xl border border-blue-500/30 rounded-lg px-2 py-1 shadow-[0_0_15px_rgba(59,130,246,0.3)] z-50 w-max text-[9px] font-black uppercase tracking-widest text-blue-400">
                {t("ui.replies")}
              </div>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
