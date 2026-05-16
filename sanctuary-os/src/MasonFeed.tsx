import { useState, useEffect } from "react";
import { useLexicon } from "./LexiconContext";
import { supabase } from "./supabase";

export default function MasonFeed({ onOpenMasonProfile }: { onOpenMasonProfile?: (id: string, postId?: string) => void }) {
  const { t } = useLexicon();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPost, setSelectedPost] = useState<any>(null);

  useEffect(() => {
    const fetchPosts = async () => {
      setLoading(true);
      const { data } = await supabase.from('mason_posts').select('*, masons(name)').order('created_at', { ascending: false }).limit(10);
      if (data) setPosts(data);
      setLoading(false);
    };
    fetchPosts();
  }, []);

  const parsePostContent = (post: any) => {
    let content = post.content || '';
    let imageUrl = post.image_url || '';
    if (content.startsWith('[IMG:')) {
      const endIdx = content.indexOf(']');
      if (endIdx !== -1) {
        imageUrl = content.substring(5, endIdx);
        content = content.substring(endIdx + 1).trim();
      }
    }
    return { content, imageUrl };
  };

  return (
    <div className="theme-glass-panel rounded-3xl p-8 mt-4">
      <h3 className="text-xl font-bold text-[var(--text)] mb-6 flex items-center gap-3">
        <span></span>
        {t("mason_feed_title") || "COMM-LINK FEED"}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {loading ? (
          <div className="text-center py-8 opacity-50 text-xs font-black uppercase tracking-widest">{t("loading")}</div>
        ) : posts.length === 0 ? (
          <div className="text-center py-8 opacity-50 text-xs font-black uppercase tracking-widest">{t("mason_no_posts") || "NO COMM-LINK TRANSMISSIONS FOUND"}</div>
        ) : (
          posts.map(p => (
            <div key={p.id} className="theme-glass-inner rounded-[2rem] border border-white/5 overflow-hidden flex flex-col cursor-pointer group hover:border-white/20 transition-all shadow-lg" onClick={() => setSelectedPost(p)}>
              {p.image_url && (
                <div className="w-full h-48 bg-black/50 relative overflow-hidden shrink-0">
                  <div className="absolute inset-0 bg-cover bg-center opacity-80 group-hover:scale-105 transition-transform duration-700" style={{ backgroundImage: `url(${p.image_url})` }} />
                </div>
              )}
              <div className="p-6 flex flex-col gap-3">
                <div className="flex justify-between items-start gap-4">
                  <h4 className="text-lg font-black uppercase tracking-tighter text-[var(--text)] line-clamp-1">{p.title}</h4>
                  <span className="text-[10px] font-black theme-text-accent uppercase tracking-widest shrink-0 opacity-80 whitespace-nowrap">
                    {new Date(p.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="text-[11px] font-bold text-[var(--subtext)] uppercase tracking-widest opacity-80 line-clamp-2 leading-relaxed">
                  {p.content}
                </div>
                <div className="flex justify-between items-center mt-2 pt-4 border-t border-white/5">
                  <div className="flex items-center gap-2 cursor-pointer hover:underline" onClick={(e) => { e.stopPropagation(); onOpenMasonProfile?.(p.mason_id); }}>
                    <span className="text-[12px] opacity-80 theme-text-accent">{t("ui_icon_mason")}</span>
                    <span className="text-[10px] font-black theme-text-accent uppercase tracking-widest">{p.masons?.name || "Unknown"}</span>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setSelectedPost(p); }} className="px-4 py-2 theme-glass-panel rounded-xl text-[9px] font-black text-[var(--text)] uppercase tracking-widest hover:theme-bg-accent hover:text-[var(--bg)] transition-all">
                    {t("mason_btn_view_post") || "VIEW POST"}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {selectedPost && (() => {
        const parsed = parsePostContent(selectedPost);
        return (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in p-6" onClick={() => setSelectedPost(null)}>
           <div className="w-full max-w-2xl bg-[var(--sidebar)] border border-white/10 rounded-[3rem] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]" onClick={e => e.stopPropagation()}>
              {parsed.imageUrl && <img src={parsed.imageUrl} className="w-full h-64 object-cover" alt="Post Cover" />}
              <div className="p-8 flex flex-col overflow-y-auto custom-scrollbar flex-1 gap-6">
                 <div>
                    <h2 className="text-3xl font-black uppercase text-[var(--text)] tracking-tighter leading-none mb-2">{selectedPost.title}</h2>
                    <div className="flex items-center gap-4">
                      <span className="text-[10px] font-mono theme-text-accent">{new Date(selectedPost.created_at).toLocaleString()}</span>
                      <span className="text-[10px] font-mono text-white/20">|</span>
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("mason_post_by") || "By"} <span className="theme-text-accent cursor-pointer hover:underline" onClick={() => { setSelectedPost(null); onOpenMasonProfile?.(selectedPost.mason_id); }}>{selectedPost.masons?.name || "Unknown"}</span>
                      </span>
                    </div>
                 </div>
                 <p className="text-sm font-medium text-gray-300 leading-relaxed whitespace-pre-wrap">{parsed.content}</p>
              </div>
              <div className="p-6 theme-glass-inner border-t border-white/5 flex justify-end">
                 <button onClick={() => setSelectedPost(null)} className="px-8 py-3 bg-white/10 hover:bg-white/20 text-[var(--text)] font-black text-[10px] uppercase tracking-widest rounded-xl transition-all">{t("mason_btn_close_post") || "Close Transmission"}</button>
              </div>
           </div>
        </div>
        ); })()}
    </div>
  );
}
