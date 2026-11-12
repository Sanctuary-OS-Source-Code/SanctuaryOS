import { useState, useEffect } from "react";
import { useLexicon } from "./LexiconContext";
import { supabase, supabaseAuth } from "./supabase";
import { EmptyState } from "./shared";
import AssetPreviewSidebar from "./AssetPreviewSidebar";
import MasonPostCard from "./MasonPostCard";
import MasonPostViewer from "./side-panels/MasonPostViewer";
import { useStore } from './store';

const MASON_POST_SELECT =
  '*, masons(name, avatar_url, patreon_url, discord_url, website_url, profile_id), likes:mason_post_likes(count), views:mason_post_views(count), comments:mason_post_comments(count)';

export default function MasonFeed({
  onOpenMasonProfile,
  noCardWrapper,
  gridCols,
  maxItems,
  noBottomPad,
}: {
  onOpenMasonProfile?: (id: string, postId?: string) => void;
  noCardWrapper?: boolean;
  gridCols?: string;
  maxItems?: number;
  noBottomPad?: boolean;
}) {
  const { t } = useLexicon();
  const sessionUserId = useStore((state) => state.session?.user?.id || null);
  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);
  const workspaces = useStore((state) => state.workspaces);

  const [posts, setPosts] = useState<any[]>(() => {
    const cached = (window as any).__sanctuaryCache?.globalFeed?.ccTailoredPosts;
    return Array.isArray(cached) ? cached : [];
  });
  const [loading, setLoading] = useState(false);
  const [selectedPost, setSelectedPost] = useState<any>(null);
  const [activeAsset, setActiveAsset] = useState<{ type: string; id: string } | null>(null);
  const [userId, setUserId] = useState<string | null>(sessionUserId);

  useEffect(() => {
    if (sessionUserId) {
      setUserId(sessionUserId);
    } else {
      supabaseAuth.auth.getSession().then(({ data: { session } }) => {
        setUserId(session?.user?.id || null);
      }).catch(() => {});
    }
  }, [sessionUserId]);

  useEffect(() => {
    let cancelled = false;
    const fetchPosts = async () => {
      if (activeWorkspaceId !== 'default_workspace' && (!workspaces || workspaces.length === 0)) return;
      if (!navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true") return;

      if (posts.length === 0) setLoading(true);
      try {
        const resolvedUid =
          sessionUserId ||
          (await supabaseAuth.auth.getSession()).data.session?.user?.id ||
          null;
        if (!cancelled && resolvedUid) setUserId(resolvedUid);

        const targetLimit = typeof maxItems === "number" && maxItems > 0 ? Math.max(maxItems, 6) : 9;
        let combined: any[] = [];

        if (resolvedUid) {
          const { data: followData } = await supabase
            .from('mason_followers')
            .select('mason_id')
            .eq('user_id', resolvedUid);
          const followedIds = (followData || [])
            .map((f: any) => f?.mason_id)
            .filter(Boolean);

          if (followedIds.length > 0) {
            const { data: followedPosts } = await supabase
              .from('mason_posts')
              .select(MASON_POST_SELECT)
              .in('mason_id', followedIds)
              .order('created_at', { ascending: false })
              .limit(targetLimit);
            if (Array.isArray(followedPosts)) {
              combined = [...followedPosts];
            }
          }
        }

        if (combined.length < targetLimit) {
          const { data: recentPosts } = await supabase
            .from('mason_posts')
            .select(MASON_POST_SELECT)
            .order('created_at', { ascending: false })
            .limit(targetLimit);
          if (Array.isArray(recentPosts)) {
            const seen = new Set(combined.map((p: any) => p.id));
            for (const rp of recentPosts) {
              if (!seen.has(rp.id)) {
                seen.add(rp.id);
                combined.push(rp);
                if (combined.length >= targetLimit) break;
              }
            }
          }
        }

        if (!cancelled) {
          setPosts(combined);
          if ((window as any).__sanctuaryCache?.globalFeed) {
            (window as any).__sanctuaryCache.globalFeed.ccTailoredPosts = combined;
          }
        }
      } catch (err) {
        console.warn("MasonFeed fetch error:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchPosts();
    window.addEventListener('sanctuary-games-updated', fetchPosts);
    return () => {
      cancelled = true;
      window.removeEventListener('sanctuary-games-updated', fetchPosts);
    };
  }, [activeWorkspaceId, workspaces, sessionUserId, maxItems]);

  const handleToggleLike = async (e: React.MouseEvent, post: any) => {
    e.stopPropagation();
    if (!userId) return useStore.getState().pushStatus(t("auto_guest_mode_active_45", "Guest Mode Active"));
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
      try { await supabase.rpc('secure_upsert_cloud_file', { p_target: 'mason_post_views', p_payload: { post_id: post.id, user_id: userId }, p_token: session.access_token }); } catch(e) { console.warn("Failed to record view", e); }
    }
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, views: [{ count: (p.views?.[0]?.count || 0) + 1 }] } : p));
  };

  const visiblePosts =
    typeof maxItems === "number" && maxItems > 0 ? posts.slice(0, maxItems) : posts;

  const feedContent = (
    <div className={`grid ${gridCols || 'grid-cols-1 md:grid-cols-2'} gap-6 flex-1 ${noCardWrapper ? (noBottomPad ? '' : 'pb-12') : 'overflow-y-auto custom-scrollbar p-6 -m-6'}`}>
      {loading ? (
        <EmptyState icon={t("icon_sync", "sync")} title={t("loading", "Loading")} className="col-span-full animate-pulse" />
      ) : visiblePosts.length === 0 ? (
        <EmptyState icon={t("icon_dynamic_feed", "dynamic_feed")} title={t("no_posts", "No Community Posts Found")} className="col-span-full" />
      ) : (
        visiblePosts.map((p, index) => {
          return (
            <div key={p.id} className="break-inside-avoid self-start">
              <MasonPostCard 
                post={p} 
                index={index} 
                onPostClick={handlePostClick} 
                onToggleLike={handleToggleLike} 
                onOpenMasonProfile={onOpenMasonProfile}
                hidePinBadge={true}
              />
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <>
      {noCardWrapper ? (
        <div className="w-full">
          {feedContent}
        </div>
      ) : (
        <div className="glass-panel rounded-2xl p-8 h-full flex flex-col">
          {feedContent}
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
    </>
  );
}

