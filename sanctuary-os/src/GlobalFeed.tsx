import { useState, useEffect } from "react";
import { useLexicon } from "./LexiconContext";
import { supabase } from "./supabase";
import { ViewHeader } from "./shared";

export default function GlobalFeed({ onOpenMasonProfile }: { onOpenMasonProfile?: (id: string, postId?: string) => void }) {
  const { t } = useLexicon();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPost, setSelectedPost] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"DISCOVER" | "FOLLOWING">("DISCOVER");
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const fetchPosts = async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const currentUserId = session?.user?.id || null;
      setUserId(currentUserId);

      if (activeTab === "FOLLOWING") {
        if (!currentUserId) {
          setPosts([]);
          setLoading(false);
          return;
        }
        const { data: followData } = await supabase.from('mason_followers').select('mason_id').eq('user_id', currentUserId);
        const followedIds = followData?.map(f => f.mason_id) || [];
        if (followedIds.length === 0) {
          setPosts([]);
          setLoading(false);
          return;
        }
        const { data } = await supabase.from('mason_posts').select('*, masons(name)').in('mason_id', followedIds).order('created_at', { ascending: false }).limit(100);
        if (data) setPosts(data);
      } else {
        const { data } = await supabase.from('mason_posts').select('*, masons(name)').order('created_at', { ascending: false }).limit(100);
        if (data) setPosts(data);
      }
      setLoading(false);
    };
    fetchPosts();
  }, [activeTab]);

  const filteredPosts = posts.filter(p => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (p.title || "").toLowerCase().includes(q) ||
      (p.content || "").toLowerCase().includes(q) ||
      (p.masons?.name || "").toLowerCase().includes(q)
    );
  });

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
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 h-full w-full overflow-hidden">
      <ViewHeader title={t("mason_feed_title") || "GLOBAL COMM-LINK"} subtitle={t("mason_feed_subtitle") || "LATEST NETWORK ACTIVITY"} />

      <div className="flex justify-between items-center mb-2 px-2 gap-4">
        <div className="flex items-center gap-2 bg-white/5 p-1 rounded-2xl border border-white/5 shadow-inner shrink-0">
          <button 
            onClick={() => setActiveTab("DISCOVER")} 
            className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === "DISCOVER" ? "bg-white/10 text-[var(--text)] shadow-md" : "text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5"}`}
          >
            {t("feed_tab_discover") || "Discover"}
          </button>
          <button 
            onClick={() => setActiveTab("FOLLOWING")} 
            className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === "FOLLOWING" ? "bg-white/10 text-[var(--text)] shadow-md" : "text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5"}`}
          >
            {t("feed_tab_following") || "Following"}
          </button>
        </div>
        <input 
          value={searchQuery} 
          onChange={e => setSearchQuery(e.target.value)} 
          placeholder={t("mason_search_placeholder") || "Search transmissions..."} 
          className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-xs font-bold focus:outline-none focus:theme-border-accent w-full max-w-md shadow-sm"
        />
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-4 pb-32">
        {loading ? (
          <div className="text-center py-12 opacity-50 text-xs font-black uppercase tracking-widest">{t("loading") || "ACCESSING NETWORK..."}</div>
        ) : activeTab === "FOLLOWING" && !userId ? (
          <div className="text-center py-12 opacity-50 text-xs font-black uppercase tracking-widest">{t("feed_login_required") || "LOGIN REQUIRED TO VIEW FOLLOWED ARCHITECTS"}</div>
        ) : filteredPosts.length === 0 ? (
          <div className="text-center py-12 opacity-50 text-xs font-black uppercase tracking-widest">
            {activeTab === "FOLLOWING" ? (t("feed_no_following") || "YOU ARE NOT FOLLOWING ANY ACTIVE MASONS") : (t("mason_no_posts") || "NO COMM-LINK TRANSMISSIONS FOUND")}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredPosts.map(p => {
              const parsed = parsePostContent(p);
              return (
              <div key={p.id} onClick={() => setSelectedPost(p)} className="theme-glass-panel rounded-[2rem] border border-white/5 overflow-hidden flex flex-col cursor-pointer group hover:border-white/20 transition-all shadow-xl">
                {parsed.imageUrl && (
                  <div className="w-full h-56 bg-black/50 relative overflow-hidden shrink-0">
                    <div className="absolute inset-0 bg-cover bg-center opacity-80 group-hover:scale-105 transition-transform duration-700" style={{ backgroundImage: `url(${parsed.imageUrl})` }} />
                  </div>
                )}
                <div className="p-8 flex flex-col gap-4 flex-1">
                  <div className="flex justify-between items-start gap-4">
                    <h4 className="text-xl font-black uppercase tracking-tighter text-[var(--text)] line-clamp-1">{p.title}</h4>
                    <span className="text-[10px] font-black theme-text-accent uppercase tracking-widest shrink-0 opacity-80 whitespace-nowrap bg-white/5 px-3 py-1 rounded-full">
                      {new Date(p.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="text-sm font-medium text-[var(--text)] opacity-80 line-clamp-3 leading-relaxed flex-1">
                    {parsed.content}
                  </div>
                  <div className="flex justify-between items-center mt-4 pt-6 border-t border-white/5">
                    <div className="flex items-center gap-3">
                      <span className="text-xl opacity-80 theme-text-accent">{t("ui_icon_mason")}</span>
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black text-[var(--subtext)] uppercase tracking-widest opacity-60">Architect</span>
                        <span 
                          onClick={(e) => { e.stopPropagation(); onOpenMasonProfile?.(p.mason_id); }} 
                          className="text-xs font-black text-[var(--text)] uppercase tracking-widest hover:underline hover:theme-text-accent transition-all cursor-pointer"
                        >
                          {p.masons?.name || "Unknown"}
                        </span>
                      </div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setSelectedPost(p); }} className="px-6 py-3 theme-glass-inner rounded-xl text-[10px] font-black theme-text-accent border border-white/5 uppercase tracking-widest hover:bg-white/10 transition-all">
                      {t("mason_btn_view_post") || "VIEW POST"}
                    </button>
                  </div>
                </div>
              </div>
            )})}
          </div>
        )}
      </div>

      {/* POST MODAL */}
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
