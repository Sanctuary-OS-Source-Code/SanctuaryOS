import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useLexicon } from "./LexiconContext";
import { supabase } from "./supabase";
import { ViewHeader, stripMarkdown, HubTabButton } from "./shared";
import MarkdownRenderer from "./MarkdownRenderer";
import AssetPreviewSidebar from "./AssetPreviewSidebar";
import MasonPostCard from "./MasonPostCard";
import MasonPostViewer from "./MasonPostViewer";

export default function GlobalFeed({ onOpenMasonProfile }: { onOpenMasonProfile?: (id: string, postId?: string) => void }) {
  const { t } = useLexicon();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPost, setSelectedPost] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"DISCOVER" | "FOLLOWING">("DISCOVER");
  const [userId, setUserId] = useState<string | null>(null);
  const [activeAsset, setActiveAsset] = useState<{ type: string; id: string } | null>(null);

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
        const { data, error } = await supabase.from('mason_posts').select('*, masons(*), likes:mason_post_likes(count), views:mason_post_views(count), comments:mason_post_comments(count)').in('mason_id', followedIds).order('created_at', { ascending: false }).limit(100);
        if (error) console.error(error);
        if (data) setPosts(data);
      } else {
        const { data, error } = await supabase.from('mason_posts').select('*, masons(*), likes:mason_post_likes(count), views:mason_post_views(count), comments:mason_post_comments(count)').order('created_at', { ascending: false }).limit(100);
        if (error) {
          console.error("GlobalFeed Error:", error);
          alert("GlobalFeed Error: " + error.message);
        }
        if (data) setPosts(data);
      }
      setLoading(false);
    };
    fetchPosts();
  }, [activeTab]);

  const filteredPosts = posts.filter(p => {
    const masonTier = p.masons?.compliance_tier || 0;
    
    // Global filter rules
    if (masonTier > 0) return false; // NSFW/Explicit/Malware always blocked in global feed

    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (p.title || "").toLowerCase().includes(q) ||
      (p.content || "").toLowerCase().includes(q) ||
      (p.masons?.name || "").toLowerCase().includes(q)
    );
  });

  const handleToggleLike = async (e: React.MouseEvent, post: any) => {
    e.stopPropagation();
    if (!userId) return alert(t("feed_login_required") || "Login Required");
    
    const { error } = await supabase.from('mason_post_likes').insert({ post_id: post.id, user_id: userId });
    let increment = 1;
    if (error && error.code === '23505') {
       await supabase.from('mason_post_likes').delete().match({ post_id: post.id, user_id: userId });
       increment = -1;
    }
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, likes: [{ count: Math.max(0, (p.likes?.[0]?.count || 0) + increment) }] } : p));
  };

  const handlePostClick = async (post: any) => {
    setSelectedPost(post);
    if (userId) {
      await supabase.from('mason_post_views').upsert({ post_id: post.id, user_id: userId }, { onConflict: 'post_id,user_id', ignoreDuplicates: true });
    } else {
      try { await supabase.from('mason_post_views').insert({ post_id: post.id }); } catch(e) {}
    }
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, views: [{ count: (p.views?.[0]?.count || 0) + 1 }] } : p));
  };

  return (
    <div className="w-full h-full flex flex-col animate-in fade-in duration-300">
      <ViewHeader 
        title={t("mason_feed_title") || "GLOBAL COMM-LINK"}
        subtitle={t("mason_feed_subtitle") || "LATEST NETWORK ACTIVITY"}
        icon={t("ui_icon_broadcast") || "broadcast"}
        iconColorClass="text-[var(--accent)] border-[var(--accent)]/30"
      />
      <div className="flex flex-col gap-6 h-full w-full overflow-hidden p-2">
      <div className="theme-glass-panel p-6 rounded-[2rem] shadow-xl border border-white/10 mb-8 animate-in slide-in-from-top-4 duration-500 flex flex-wrap gap-4 items-center relative z-20 mx-2 mt-2">
        <div className="flex items-center gap-1 overflow-x-auto accent-scrollbar p-1 theme-glass-inner rounded-2xl border border-white/5 shadow-inner shrink-0">
          <HubTabButton id="DISCOVER" icon="explore" label={t("feed_tab_discover") || "DISCOVER"} activeTab={activeTab} setTab={setActiveTab as any} />
          <HubTabButton id="FOLLOWING" icon="diversity_1" label={t("feed_tab_following") || "FOLLOWING"} activeTab={activeTab} setTab={setActiveTab as any} />
        </div>
        <div className="flex-1 min-w-[250px] relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--accent)] text-lg flex items-center justify-center">
            <span className="material-symbols-outlined !text-[20px] drop-shadow-md">{t("ui_icon_search") || "search"}</span>
          </div>
          <input 
            value={searchQuery} 
            onChange={e => setSearchQuery(e.target.value)} 
            placeholder={t("mason_search_placeholder") || "Search transmissions..."} 
            className="w-full theme-glass-inner rounded-2xl pl-12 pr-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all shadow-inner"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-4 pb-32">
        {loading ? (
          <div className="text-center py-12 opacity-50 text-xs font-black uppercase tracking-widest">{t("loading") || "ACCESSING NETWORK..."}</div>
        ) : activeTab === "FOLLOWING" && !userId ? (
          <div className="text-center py-12 opacity-50 text-xs font-black uppercase tracking-widest">{t("feed_login_required")}</div>
        ) : filteredPosts.length === 0 ? (
          <div className="text-center py-12 opacity-50 text-xs font-black uppercase tracking-widest">{t("mason_no_posts") || "NO COMM-LINK TRANSMISSIONS FOUND"}</div>
        ) : (
          <div className="columns-1 lg:columns-2 xl:columns-3 gap-6 space-y-6">
            {filteredPosts.map((p, index) => {
              const isFeatured = index === 0 && filteredPosts.length !== 2;
              const isCompact = filteredPosts.length >= 3 && index > 0;
              return (
                <div key={p.id} className="break-inside-avoid">
                  <MasonPostCard 
                    post={p} 
                    index={index} 
                    onPostClick={handlePostClick} 
                    onToggleLike={handleToggleLike} 
                    isFeatured={isFeatured}
                    isCompact={isCompact}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedPost && (
        <MasonPostViewer 
          post={selectedPost} 
          onClose={() => setSelectedPost(null)} 
          onOpenMasonProfile={onOpenMasonProfile} 
          onAssetClick={(type, id) => setActiveAsset({ type, id })}
          userId={userId} 
        />
      )}
      
      {activeAsset && (
        <AssetPreviewSidebar 
          assetType={activeAsset.type} 
          assetId={activeAsset.id} 
          onClose={() => setActiveAsset(null)} 
        />
      )}
      </div>
    </div>
  );
}
