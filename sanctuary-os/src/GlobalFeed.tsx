import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useLexicon } from "./LexiconContext";
import { supabase } from "./supabase";
import { ViewHeader, stripMarkdown, HubTabButton } from "./shared";
import MarkdownRenderer from "./MarkdownRenderer";
import AssetPreviewSidebar from "./AssetPreviewSidebar";
import MasonPostCard from "./MasonPostCard";
import MasonPostViewer from "./side-panels/MasonPostViewer";
import { useStore } from './store';

export default function GlobalFeed({ onOpenMasonProfile }: { onOpenMasonProfile?: (id: string, postId?: string) => void }) {
  const { t } = useLexicon();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPost, setSelectedPost] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"DISCOVER" | "FOLLOWING">("DISCOVER");
  const [userId, setUserId] = useState<string | null>(null);
  const [activeAsset, setActiveAsset] = useState<{ type: string; id: string } | null>(null);

  const [isOffline, setIsOffline] = useState(!navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true");

  useEffect(() => {
    const handleOnline = () => setIsOffline(localStorage.getItem("sanctuary_local_only") === "true");
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (isOffline) return;
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
          useStore.getState().pushStatus("GlobalFeed Error: " + error.message);
        }
        if (data) setPosts(data);
      }
      setLoading(false);
    };
    fetchPosts();
  }, [activeTab]);

  const filteredPosts = posts.filter(p => {
    const masonTier = p.masons?.compliance_tier || 0;

    if (masonTier > 0) return false;

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
    if (!userId) return useStore.getState().pushStatus(t("auto_guest_mode_active_uploads_and_global_fla"));

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
      try { await supabase.from('mason_post_views').insert({ post_id: post.id }); } catch (e) { }
    }
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, views: [{ count: (p.views?.[0]?.count || 0) + 1 }] } : p));
  };

  if (isOffline) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center animate-in fade-in duration-300 gap-6">
        <span className="material-symbols-outlined !text-[6rem] opacity-20 text-[var(--text)] drop-shadow-lg">wifi_off</span>
        <h2 className="text-2xl font-black uppercase tracking-[0.2em] opacity-50">{t("offline_mode_title")}</h2>
        <p className="text-xs font-bold uppercase tracking-widest opacity-40 text-center max-w-md">{t("offline_mode_desc")}</p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-4 px-8 py-4 rounded-[var(--radius)] theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-xl hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-3 text-[10px] font-black uppercase tracking-widest group"
        >
          <span className="material-symbols-outlined !text-lg opacity-60 group-hover:opacity-100 group-hover:rotate-180 transition-all duration-500">refresh</span>
          {t("offline_mode_refresh")}
        </button>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col animate-in fade-in duration-300">
      <ViewHeader
        title={t("feed_title")}
        subtitle={t("feed_subtitle")}
        icon={t("icon_satellite_alt")}
        iconColorClass="text-[var(--accent)] border-[var(--accent)]/30"
      >
      </ViewHeader>
      <div className="flex flex-col gap-6 h-full w-full overflow-hidden p-2">

        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 animate-in slide-in-from-top-4 duration-500 mx-2 mt-2">
          <div className="flex items-center overflow-x-auto overflow-y-hidden accent-scrollbar theme-glass-panel rounded-2xl border border-white/5 shadow-inner divide-x divide-white/5 w-full">
            <HubTabButton id="DISCOVER" icon="explore" label={t("tab_discover")} activeTab={activeTab} setTab={setActiveTab as any} />
            <HubTabButton id="FOLLOWING" icon="diversity_1" label={t("tab_following")} activeTab={activeTab} setTab={setActiveTab as any} />
          </div>
        </div>

        <div className="theme-glass-panel p-6 rounded-[var(--radius)] shadow-xl border border-white/10 mb-8 animate-in slide-in-from-top-4 duration-500 flex flex-wrap gap-4 items-center relative z-20 mx-2">
          <div className="flex-1 min-w-[250px] relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--accent)] text-lg flex items-center justify-center">
              <span className="material-symbols-outlined !text-[20px] drop-shadow-md">{t("icon_search")}</span>
            </div>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t("mason_search_placeholder")}
              className="w-full theme-glass-inner rounded-2xl pl-12 pr-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all shadow-inner"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar pr-4 pb-32">
          {loading ? (
            <div className="text-center py-12 opacity-50 text-xs font-black uppercase tracking-widest">{t("loading")}</div>
          ) : activeTab === "FOLLOWING" && !userId ? (
            <div className="text-center py-12 opacity-50 text-xs font-black uppercase tracking-widest">{t("login_required")}</div>
          ) : filteredPosts.length === 0 ? (
            <div className="text-center py-12 opacity-50 text-xs font-black uppercase tracking-widest">{t("no_posts")}</div>
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
                      onOpenMasonProfile={onOpenMasonProfile}
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
