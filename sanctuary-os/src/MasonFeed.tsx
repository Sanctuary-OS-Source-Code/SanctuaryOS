import { useState, useEffect } from "react";
import { useLexicon } from "./LexiconContext";
import { supabase } from "./supabase";
import AssetPreviewSidebar from "./AssetPreviewSidebar";
import MasonPostCard from "./MasonPostCard";
import MasonPostViewer from "./side-panels/MasonPostViewer";
import { useStore } from './store';

export default function MasonFeed({ onOpenMasonProfile, noCardWrapper, gridCols }: { onOpenMasonProfile?: (id: string, postId?: string) => void, noCardWrapper?: boolean, gridCols?: string }) {
  const { t } = useLexicon();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPost, setSelectedPost] = useState<any>(null);
  const [activeAsset, setActiveAsset] = useState<{ type: string; id: string } | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id || null);
    });

    const fetchPosts = async () => {
      if (!navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true") return;
      setLoading(true);
      const { data } = await supabase.from('mason_posts').select('*, masons(name, avatar_url, patreon_url, discord_url, website_url, profile_id), likes:mason_post_likes(count), views:mason_post_views(count), comments:mason_post_comments(count)').order('created_at', { ascending: false }).limit(9);
      if (data) setPosts(data);
      setLoading(false);
    };
    fetchPosts();
  }, []);

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
      try { await supabase.rpc('secure_upsert_cloud_file', { p_target: 'mason_post_views', p_payload: { post_id: post.id, user_id: userId }, p_token: session.access_token }); } catch(e) { console.warn("Failed to record view", e); }
    }
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, views: [{ count: (p.views?.[0]?.count || 0) + 1 }] } : p));
  };

  const feedContent = (
    <div className={`grid ${gridCols || 'grid-cols-1 md:grid-cols-2'} gap-6 flex-1 ${noCardWrapper ? 'pb-12' : 'overflow-y-auto custom-scrollbar p-6 -m-6'}`}>
      {loading ? (
        <div className="text-center py-8 opacity-50 text-xs font-black capitalize tracking-widest">{t("loading")}</div>
      ) : posts.length === 0 ? (
        <div className="text-center py-8 opacity-50 text-xs font-black capitalize tracking-widest col-span-2">{t("no_posts")}</div>
      ) : (
        posts.map((p, index) => {
          return (
            <div key={p.id} className="break-inside-avoid">
              <MasonPostCard 
                post={p} 
                index={index} 
                onPostClick={handlePostClick} 
                onToggleLike={handleToggleLike} 
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

