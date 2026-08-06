import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useLexicon } from "./LexiconContext";
import { supabase } from "./supabase";
import { ViewHeader, stripMarkdown, HubTabButton, CustomDropdown, CustomDatePicker, ActionButton } from "./shared";
import MarkdownRenderer from "./MarkdownRenderer";
import AssetPreviewSidebar from "./AssetPreviewSidebar";
import MasonPostCard from "./MasonPostCard";
import MasonPostViewer from "./side-panels/MasonPostViewer";
import { useStore } from './store';
import { CommandScreenLayout, CommandScreenStats, CommandScreenBody, CommandScreenMain, CommandScreenSidebar, DashboardStatTile, CommandScreenQuickLink, CommandScreenSectionHeading } from "./hub-components/SharedCommandScreenLayout";
import MasonRecentRepliesSidePanel from "./side-panels/MasonRecentRepliesSidePanel";
import MasonRecentPostsSidePanel from "./side-panels/MasonRecentPostsSidePanel";

export default function GlobalFeed({ onOpenMasonProfile }: { onOpenMasonProfile?: (id: string, postId?: string) => void }) {
  const [activeSort, setActiveSort] = useState("NEWEST");
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const { t } = useLexicon();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPost, setSelectedPost] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"OVERVIEW" | "DISCOVER" | "FOLLOWING">("OVERVIEW");
  const [userId, setUserId] = useState<string | null>(null);
  const [activeAsset, setActiveAsset] = useState<{ type: string; id: string } | null>(null);
  const [isRepliesOpen, setIsRepliesOpen] = useState(false);
  const [isPostsOpen, setIsPostsOpen] = useState(false);
  const [masonProfileId, setMasonProfileId] = useState<string | null>(null);
  const [overviewStats, setOverviewStats] = useState({ nodes: 0, posts: 0, likes: 0, replies: 0, followingPosts: 0 });

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
    if (activeTab === "OVERVIEW" && userId) {
      const fetchStats = async () => {
        const { data: masonData } = await supabase.from('masons').select('id').eq('profile_id', userId).maybeSingle();
        if (masonData) setMasonProfileId(masonData.id);

        const [masonsRes, postsRes, likesRes, repliesRes] = await Promise.all([
          supabase.from('masons').select('id', { count: 'exact', head: true }),
          supabase.from('mason_posts').select('id', { count: 'exact', head: true }),
          supabase.from('mason_post_likes').select('id', { count: 'exact', head: true }),
          supabase.from('mason_post_comments').select('id', { count: 'exact', head: true })
        ]);

        let followingPostsCount = 0;
        if (userId) {
          const { data: followData } = await supabase.from('mason_followers').select('mason_id').eq('user_id', userId);
          const followedIds = followData?.map(f => f.mason_id) || [];
          if (followedIds.length > 0) {
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            const { count } = await supabase.from('mason_posts')
              .select('id', { count: 'exact', head: true })
              .in('mason_id', followedIds)
              .gte('created_at', thirtyDaysAgo);
            followingPostsCount = count || 0;
          }
        }

        setOverviewStats({
          nodes: masonsRes.count || 0,
          posts: postsRes.count || 0,
          likes: likesRes.count || 0,
          replies: repliesRes.count || 0,
          followingPosts: followingPostsCount
        });
      };
      fetchStats();
    }
  }, [activeTab, userId, isOffline]);

  useEffect(() => {
    if (isOffline) return;
    const fetchPosts = async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const currentUserId = session?.user?.id || null;
      setUserId(currentUserId);

      if (activeTab === "FOLLOWING" || activeTab === "OVERVIEW") {
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
        const limit = activeTab === "OVERVIEW" ? 4 : 100;
        const { data, error } = await supabase.from('mason_posts').select('*, masons(*), likes:mason_post_likes(count), views:mason_post_views(count), comments:mason_post_comments(count)').in('mason_id', followedIds).order('created_at', { ascending: false }).limit(limit);
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
    if (searchQuery) {
      if (!p.title?.toLowerCase().includes(searchQuery.toLowerCase()) && !p.content?.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
    }
    if (startDate || endDate) {
      const postDate = new Date(p.created_at);
      postDate.setHours(0, 0, 0, 0);
      if (startDate) {
        const sd = new Date(startDate);
        if (postDate < sd) return false;
      }
      if (endDate) {
        const ed = new Date(endDate);
        if (postDate > ed) return false;
      }
    }
    return true;
  }).sort((a, b) => {
    if (activeSort === "TOP") {
      const aLikes = a.likes?.[0]?.count || 0;
      const bLikes = b.likes?.[0]?.count || 0;
      if (bLikes !== aLikes) return bLikes - aLikes;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const handleToggleLike = async (e: React.MouseEvent, post: any) => {
    e.stopPropagation();
    if (!userId) return useStore.getState().pushStatus(t("auto_guest_mode_active_45"));

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
        shape="circle"
      />
      <div className="flex flex-col gap-4 animate-in slide-in-from-top-4 duration-500 w-full mb-6 shrink-0">
        <div className="flex items-center overflow-x-auto overflow-y-hidden accent-scrollbar theme-glass-panel rounded-2xl border border-white/5 shadow-inner divide-x divide-white/5 w-full">
          <HubTabButton id="OVERVIEW" icon="dashboard" label={t("tab_overview")} activeTab={activeTab} setTab={(id: any) => { setActiveTab(id); setStartDate(null); setEndDate(null); }} />
          <HubTabButton id="DISCOVER" icon="explore" label={t("tab_discover")} activeTab={activeTab} setTab={(id: any) => { setActiveTab(id); setStartDate(null); setEndDate(null); }} />
          <HubTabButton id="FOLLOWING" icon="diversity_1" label={t("tab_following")} activeTab={activeTab} setTab={(id: any) => { setActiveTab(id); setStartDate(null); setEndDate(null); }} />
        </div>
      </div>


      {activeTab !== "OVERVIEW" && (
        <div className="flex flex-col gap-4 mb-8 mx-2 animate-in slide-in-from-top-4 duration-500">
          <CommandScreenSectionHeading
            shape="circle"
            title={activeTab === "DISCOVER" ? t("tab_discover") : t("tab_following")}
            icon={activeTab === "DISCOVER" ? "explore" : "diversity_1"}
            className="mb-8 w-full relative z-20"
            rightContent={
              <div className="flex items-center gap-4 flex-1 justify-end">
                <div className="relative flex-1 max-w-[300px] h-12">
                  <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder={t("mason_search_placeholder")}
                    className="w-full h-full bg-white/5 border border-white/10 rounded-[var(--radius)] px-4 pl-10 text-[var(--text)] text-sm focus:outline-none focus:border-white/20 transition-all font-medium placeholder:text-white/40"
                  />
                  <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-white/40">search</span>
                </div>
                <div className="w-max min-w-[150px] shrink-0 h-12">
                  <CustomDatePicker
                    value={startDate}
                    onChange={setStartDate}
                    placeholder={t("filter_start_date") || "Start Date"}
                  />
                </div>
                <div className="w-max min-w-[150px] shrink-0 h-12">
                  <CustomDatePicker
                    value={endDate}
                    onChange={setEndDate}
                    placeholder={t("filter_end_date") || "End Date"}
                  />
                </div>
                {(startDate || endDate) && (
                  <div className="shrink-0 h-12 flex">
                    <ActionButton icon="close" label={t("btn_clear")} onClick={() => { setStartDate(null); setEndDate(null); }} className="h-full py-0 rounded-[calc(var(--radius)-4px)]" />
                  </div>
                )}
                <div className="w-max min-w-[150px] shrink-0 h-12">
                  <CustomDropdown
                    disableTint={true}
                    value={activeSort}
                    options={[
                      { id: "NEWEST", label: t("sort_newest") },
                      { id: "TOP", label: t("sort_top") }
                    ]}
                    onChange={(val: any) => setActiveSort(Array.isArray(val) ? val[0] : val)}
                  />
                </div>
              </div>
            }
          />
        </div>
      )}

      {activeTab === "OVERVIEW" ? (
        <div className="flex-1 w-full">
          <CommandScreenLayout>
            <CommandScreenStats>
              <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_group")}</span>} number={overviewStats.nodes} label={t("feed_stat_nodes")} colorClass="border-blue-500/30 text-blue-500 hover:border-blue-500 bg-blue-500/10 hover:bg-blue-500/20" />
              <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_dynamic_feed") || "dynamic_feed"}</span>} number={overviewStats.posts} label={t("feed_stat_replies")} colorClass="border-purple-500/30 text-purple-500 hover:border-purple-500 bg-purple-500/10 hover:bg-purple-500/20" onClick={() => setIsPostsOpen(true)} className="cursor-pointer" />
              <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_favorite")}</span>} number={overviewStats.likes + overviewStats.replies} label={t("feed_stat_activity")} colorClass="border-amber-500/30 text-amber-500 hover:border-amber-500 bg-amber-500/10 hover:bg-amber-500/20" onClick={() => setIsRepliesOpen(true)} className="cursor-pointer" />
              <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_diversity_1") || "diversity_1"}</span>} number={overviewStats.followingPosts} label={t("feed_stat_following") || "Following (Past 30 Days)"} colorClass="border-emerald-500/30 text-emerald-500 hover:border-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20" onClick={() => { setActiveTab("FOLLOWING"); setStartDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]); }} className="cursor-pointer" />
            </CommandScreenStats>

            <CommandScreenBody>
              <CommandScreenMain>
                <div className="flex flex-col gap-6 w-full">
                  <CommandScreenSectionHeading
                    title={t("feed_sub_feed")}
                    icon="diversity_1"
                  />

                  {loading ? (
                    <div className="text-center py-12 opacity-50 text-xs font-black uppercase tracking-widest">{t("loading")}</div>
                  ) : !userId ? (
                    <div className="text-center py-12 opacity-50 text-xs font-black uppercase tracking-widest">{t("login_required")}</div>
                  ) : filteredPosts.length === 0 ? (
                    <div className="text-center py-12 opacity-50 text-xs font-black uppercase tracking-widest">{t("no_posts")}</div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-[repeat(auto-fill,minmax(380px,1fr))] gap-6 pb-8">
                      {filteredPosts.map((p, index) => (
                        <MasonPostCard
                          key={p.id}
                          post={p}
                          index={index}
                          onPostClick={handlePostClick}
                          onToggleLike={handleToggleLike}
                          onOpenMasonProfile={onOpenMasonProfile}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </CommandScreenMain>

              <CommandScreenSidebar title={t("feed_quick_actions")} icon="explore">
                <CommandScreenQuickLink icon="explore" title={t("feed_btn_discover")} subtitle={t("feed_btn_discover_desc")} onClick={() => { setActiveTab("DISCOVER"); setStartDate(null); setEndDate(null); }} />
                {masonProfileId && (
                  <CommandScreenQuickLink icon="reply" title={t("feed_my_replies")} subtitle={t("feed_my_replies_desc")} onClick={() => setIsRepliesOpen(true)} dotColorClass="bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]" textColorClass="text-purple-500" hoverTextColorClass="group-hover:text-purple-400" iconShadowClass="drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]" iconBorderHoverClass="group-hover:border-purple-500/30" />
                )}
                <CommandScreenQuickLink icon="diversity_1" title={t("tab_following")} subtitle={t("feed_view_full")} onClick={() => { setActiveTab("FOLLOWING"); setStartDate(null); setEndDate(null); }} dotColorClass="bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" textColorClass="text-emerald-500" hoverTextColorClass="group-hover:text-emerald-400" iconShadowClass="drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]" iconBorderHoverClass="group-hover:border-emerald-500/30" />
              </CommandScreenSidebar>
            </CommandScreenBody>
          </CommandScreenLayout>
        </div>
      ) : (
        <div className="flex-1 pr-4 pb-32">
          {loading ? (
            <div className="text-center py-12 opacity-50 text-xs font-black uppercase tracking-widest">{t("loading")}</div>
          ) : activeTab === "FOLLOWING" && !userId ? (
            <div className="text-center py-12 opacity-50 text-xs font-black uppercase tracking-widest">{t("login_required")}</div>
          ) : filteredPosts.length === 0 ? (
            <div className="text-center py-12 opacity-50 text-xs font-black uppercase tracking-widest">{t("no_posts")}</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-[repeat(auto-fill,minmax(380px,1fr))] gap-6">
              {filteredPosts.map((p, index) => {
                const isCompact = filteredPosts.length >= 3 && index > 0;
                return (
                  <div key={p.id}>
                    <MasonPostCard
                      post={p}
                      index={index}
                      onPostClick={handlePostClick}
                      onToggleLike={handleToggleLike}
                      onOpenMasonProfile={onOpenMasonProfile}
                      isCompact={isCompact}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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

      <MasonRecentRepliesSidePanel
        isOpen={isRepliesOpen}
        onClose={() => setIsRepliesOpen(false)}
        masonId={masonProfileId || undefined}
        userProfileId={userId || undefined}
        onReplyClick={(postId) => {
          setIsRepliesOpen(false);
        }}
      />

      <MasonRecentPostsSidePanel
        isOpen={isPostsOpen}
        onClose={() => setIsPostsOpen(false)}
        posts={posts}
        onPostClick={(post) => {
          setSelectedPost(post);
          setIsPostsOpen(false);
        }}
        onToggleLike={handleToggleLike}
        onOpenMasonProfile={(masonId) => {
          if (onOpenMasonProfile) onOpenMasonProfile(masonId);
        }}
      />
    </div>
  );
}



