import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useLexicon } from "./LexiconContext";
import { supabase } from "./supabase";
import { ViewHeader, stripMarkdown, HoverTabDrawer, VerticalTabButton, CustomDropdown, CustomDatePicker, ActionButton, ScreenUtilityBar, FilterPopover, SearchBar } from "./shared";
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
  const [selectedReplyId, setSelectedReplyId] = useState<string | null>(null);
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
          const CACHE_TTL = 5 * 60 * 1000;
          const cache = window.__sanctuaryCache?.globalFeed;
          if (cache?.overviewStats && (performance.now() - cache.lastFetch < CACHE_TTL)) {
            setOverviewStats(cache.overviewStats);
            return;
          }
          if (cache?.overviewStats) {
            setOverviewStats(cache.overviewStats);
          }

          const { data: masonData } = await supabase.from('masons').select('id').eq('profile_id', userId).maybeSingle();
        if (masonData) setMasonProfileId(masonData.id);

        const [masonsRes, postsRes] = await Promise.all([
          supabase.from('masons').select('id', { count: 'exact', head: true }),
          supabase.from('mason_posts').select('id', { count: 'exact', head: true })
        ]);

        let followingPostsCount = 0;
        let myLikesCount = 0;
        let myRepliesCount = 0;
        
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
          
          if (masonData?.id) {
            const { data: myPosts } = await supabase.from('mason_posts').select('id').eq('mason_id', masonData.id);
            if (myPosts && myPosts.length > 0) {
              const postIds = myPosts.map(p => p.id);
              const [likesRes, repliesRes] = await Promise.all([
                supabase.from('mason_post_likes').select('id', { count: 'exact', head: true }).in('post_id', postIds).neq('user_id', userId),
                supabase.from('mason_post_comments').select('id', { count: 'exact', head: true }).in('post_id', postIds).neq('author_id', userId)
              ]);
              myLikesCount = likesRes.count || 0;
              myRepliesCount = repliesRes.count || 0;
            }
          }
        }

          const newStats = {
            nodes: masonsRes.count || 0,
            posts: postsRes.count || 0,
            likes: myLikesCount,
            replies: myRepliesCount,
            followingPosts: followingPostsCount
          };
          setOverviewStats(newStats);
          if (window.__sanctuaryCache) {
            window.__sanctuaryCache.globalFeed.overviewStats = newStats;
            window.__sanctuaryCache.globalFeed.lastFetch = performance.now();
          }
        };
      fetchStats();
    }
  }, [activeTab, userId, isOffline]);

  useEffect(() => {
    if (isOffline) return;
    const fetchPosts = async () => {
      const CACHE_TTL = 5 * 60 * 1000;
      const cache = window.__sanctuaryCache?.globalFeed;
      
      if (activeTab === "DISCOVER" && cache?.posts && cache.posts.length > 0) {
        if (performance.now() - cache.lastFetch < CACHE_TTL) {
          setPosts(cache.posts);
          setLoading(false);
          return;
        }
        setPosts(cache.posts);
      }

      if (!cache?.posts || cache.posts.length === 0) setLoading(true);
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
        if (data) {
          setPosts(data);
          if (window.__sanctuaryCache) {
            window.__sanctuaryCache.globalFeed.posts = data;
            window.__sanctuaryCache.globalFeed.lastFetch = performance.now();
          }
        }
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
    const session = useStore.getState().session;

    const { error } = await supabase.rpc('secure_upsert_cloud_file', {
      p_target: 'mason_post_likes',
      p_payload: { post_id: post.id, user_id: userId },
      p_token: session?.access_token
    });
    
    let increment = 1;
    if (error && (JSON.stringify(error).includes('23505') || JSON.stringify(error).includes('duplicate key'))) {
      const { data: likeData } = await supabase.from('mason_post_likes').select('id').eq('post_id', post.id).eq('user_id', userId).maybeSingle();
      if (likeData) {
        await supabase.rpc('secure_delete_cloud_file', { p_target: 'mason_post_likes', p_id: likeData.id, p_token: session?.access_token });
      }
      increment = -1;
    }
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, likes: [{ count: Math.max(0, (p.likes?.[0]?.count || 0) + increment) }] } : p));
  };

  const handlePostClick = async (post: any) => {
    setSelectedPost(post);
    const session = useStore.getState().session;
    if (userId && session?.access_token) {
      try { await supabase.rpc('secure_upsert_cloud_file', { p_target: 'mason_post_views', p_payload: { post_id: post.id, user_id: userId }, p_token: session.access_token }); } catch (e) { console.warn("Failed to record view", e); }
    }
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, views: [{ count: (p.views?.[0]?.count || 0) + 1 }] } : p));
  };

  if (isOffline) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center animate-in fade-in duration-300 gap-6">
        <span className="material-symbols-outlined !text-[6rem] opacity-20 text-[var(--text)] drop-shadow-lg">wifi_off</span>
        <h2 className="text-2xl font-black capitalize tracking-[0.2em] opacity-50">{t("offline_mode_title")}</h2>
        <p className="text-xs font-bold capitalize tracking-widest opacity-40 text-center max-w-md">{t("offline_mode_desc")}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-8 py-4 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-xl hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-3 text-[10px] font-black capitalize tracking-widest group"
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
        iconColorClass="text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
        shape="circle"
        breadcrumb={activeTab !== "OVERVIEW" ? (t(`tab_${activeTab.toLowerCase()}`) || activeTab) : undefined}
        onTitleClick={() => { setActiveTab("OVERVIEW"); setStartDate(null); setEndDate(null); }}
      >
        {activeTab !== "OVERVIEW" && (
          <div className="flex items-center gap-3 animate-in slide-in-from-top-4 duration-500 relative z-20 w-full xl:w-auto">
            <div className="relative flex-1 min-w-[200px] xl:w-[480px]">
              <SearchBar
                value={searchQuery || ""}
                onChange={setSearchQuery}
                placeholder={t("mason_search_placeholder") || "Search..."}
                className="h-12 w-full rounded-2xl"
              />
            </div>
            <FilterPopover icon="tune" label={t("filters")} className="shrink-0" activeTab={startDate || endDate || activeSort !== "NEWEST" ? "active" : undefined}>
              <div className="flex flex-col w-[300px] p-4 max-w-[calc(100vw-40px)] gap-4">
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("sort_by") || "Sort By"}</span>
                  <CustomDropdown
                    disableTint={true}
                    value={activeSort}
                    options={[
                      { id: "NEWEST", label: t("sort_newest") || "Newest" },
                      { id: "TOP", label: t("sort_top") || "Top" }
                    ]}
                    onChange={(val: any) => setActiveSort(Array.isArray(val) ? val[0] : val)}
                  />
                </div>
                
                <div className="w-full h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
                
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("date_range") || "Date Range"}</span>
                  <div className="flex flex-col gap-2">
                    <CustomDatePicker
                      value={startDate}
                      onChange={setStartDate}
                      placeholder={t("filter_start_date") || "Start Date"}
                    />
                    <CustomDatePicker
                      value={endDate}
                      onChange={setEndDate}
                      placeholder={t("filter_end_date") || "End Date"}
                    />
                  </div>
                </div>

                {(startDate || endDate || activeSort !== "NEWEST") && (
                  <ActionButton 
                    icon="close" 
                    label={t("btn_clear") || "Clear Filters"} 
                    onClick={() => { setStartDate(null); setEndDate(null); setActiveSort("NEWEST"); }} 
                    className="w-full mt-2" 
                    variant="danger"
                  />
                )}
              </div>
            </FilterPopover>
          </div>
        )}
      </ViewHeader>
      <HoverTabDrawer title="Comm-Link Navigation" activeTab={activeTab} setTab={setActiveTab}>
        <VerticalTabButton id="OVERVIEW" icon="dashboard" label={t("tab_overview")} activeTab={activeTab} setTab={(id: any) => { setActiveTab(id); setStartDate(null); setEndDate(null); }} />
        <VerticalTabButton id="DISCOVER" icon="explore" label={t("tab_discover")} activeTab={activeTab} setTab={(id: any) => { setActiveTab(id); setStartDate(null); setEndDate(null); }} />
        <VerticalTabButton id="FOLLOWING" icon="diversity_1" label={t("tab_following")} activeTab={activeTab} setTab={(id: any) => { setActiveTab(id); setStartDate(null); setEndDate(null); }} />
      </HoverTabDrawer>

      {activeTab === "OVERVIEW" ? (
        <div className="flex-1 w-full">
          <CommandScreenLayout>
            <CommandScreenStats>
              <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_group")}</span>} number={overviewStats.nodes} label={t("feed_stat_nodes")} colorClass="text-blue-500" />
              <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_dynamic_feed")}</span>} number={overviewStats.posts} label={t("feed_stat_replies")} colorClass="text-purple-500" onClick={() => setIsPostsOpen(true)} className="cursor-pointer" />
              <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_favorite")}</span>} number={overviewStats.likes + overviewStats.replies} label={t("feed_stat_activity")} colorClass="text-amber-500" onClick={() => setIsRepliesOpen(true)} className="cursor-pointer" />
              <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_diversity_1")}</span>} number={overviewStats.followingPosts} label={t("feed_stat_following")} colorClass="text-emerald-500" onClick={() => { setActiveTab("FOLLOWING"); setStartDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]); }} className="cursor-pointer" />
            </CommandScreenStats>

            <CommandScreenBody>
              <CommandScreenMain>
                <div className="flex flex-col gap-6 w-full">
                  <CommandScreenSectionHeading
                    title={t("feed_sub_feed")}
                    icon="diversity_1"
                  />

                  {loading ? (
                    <div className="text-center py-12 opacity-50 text-xs font-black capitalize tracking-widest">{t("loading")}</div>
                  ) : !userId ? (
                    <div className="text-center py-12 opacity-50 text-xs font-black capitalize tracking-widest">{t("login_required")}</div>
                  ) : filteredPosts.length === 0 ? (
                    <div className="text-center py-12 opacity-50 text-xs font-black capitalize tracking-widest">{t("no_posts")}</div>
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
                  <CommandScreenQuickLink icon="reply" title={t("feed_my_replies")} subtitle={t("feed_my_replies_desc")} onClick={() => setIsRepliesOpen(true)} dotColorClass="bg-purple-500 shadow-md" textColorClass="text-purple-500" hoverTextColorClass="group-hover:text-purple-400" iconShadowClass="drop-shadow-md" iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]" />
                )}
                <CommandScreenQuickLink icon="diversity_1" title={t("tab_following")} subtitle={t("feed_view_full")} onClick={() => { setActiveTab("FOLLOWING"); setStartDate(null); setEndDate(null); }} dotColorClass="bg-emerald-500 shadow-md" textColorClass="text-emerald-500" hoverTextColorClass="group-hover:text-emerald-400" iconShadowClass="drop-shadow-md" iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--success)_30%,transparent)]" />
              </CommandScreenSidebar>
            </CommandScreenBody>
          </CommandScreenLayout>
        </div>
      ) : (
        <div className="flex-1 pr-4 pb-32">
          {loading ? (
            <div className="text-center py-12 opacity-50 text-xs font-black capitalize tracking-widest">{t("loading")}</div>
          ) : activeTab === "FOLLOWING" && !userId ? (
            <div className="text-center py-12 opacity-50 text-xs font-black capitalize tracking-widest">{t("login_required")}</div>
          ) : filteredPosts.length === 0 ? (
            <div className="text-center py-12 opacity-50 text-xs font-black capitalize tracking-widest">{t("no_posts")}</div>
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
        onReplyClick={(post, replyId) => {
          if (post) setSelectedPost(post);
          if (replyId) setSelectedReplyId(replyId);
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

      {selectedPost && (
        <MasonPostViewer
          post={selectedPost}
          onClose={() => { setSelectedPost(null); setSelectedReplyId(null); }}
          onOpenMasonProfile={onOpenMasonProfile}
          onAssetClick={(type, id) => setActiveAsset({ type, id })}
          userId={userId}
          initialFocusCommentId={selectedReplyId}
        />
      )}
    </div>
  );
}





