import { useState, useEffect } from "react";
import { useLexicon } from "./LexiconContext";
import { supabase } from "./supabase";
import MasonPostCard from "./MasonPostCard";
import MasonPostViewer from "./MasonPostViewer";

export default function SystemBroadcastsFeed({ audience, noCardWrapper, gridCols }: { audience: string, noCardWrapper?: boolean, gridCols?: string }) {
  const { t } = useLexicon();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPost, setSelectedPost] = useState<any>(null);

  useEffect(() => {
    const fetchBroadcasts = async () => {
      setLoading(true);
      // Fetch system_broadcasts where target_audience is either "All", "all", or the specific audience
      const { data } = await supabase
        .from('system_broadcasts')
        .select('*')
        .in('target_audience', ['All', 'all', audience, audience.toLowerCase(), audience.toUpperCase()])
        .order('created_at', { ascending: false })
        .limit(5);
        
      if (data) {
        // Map to match MasonPostCard expectations
        const mappedData = data.map(b => ({
            ...b,
            content: b.message || b.content || "",
            masons: { name: "System Oversight" },
            likes: [],
            views: [],
            comments: []
        }));
        setPosts(mappedData);
      }
      setLoading(false);
    };
    fetchBroadcasts();
  }, [audience]);

  const feedContent = (
    <div className={`grid ${gridCols || 'grid-cols-1 md:grid-cols-2'} gap-6 flex-1 overflow-y-auto custom-scrollbar pr-2 pb-4`}>
      {loading ? (
        <div className="text-center py-8 opacity-50 text-xs font-black uppercase tracking-widest">{t("loading") || "Loading"}</div>
      ) : posts.length === 0 ? (
        <div className="text-center py-8 opacity-50 text-xs font-black uppercase tracking-widest col-span-2">{t("system_no_broadcasts") || "No Recent Broadcasts"}</div>
      ) : (
        posts.map((p, index) => {
          const isFeatured = index === 0 && posts.length !== 2;
          const isCompact = posts.length >= 3 && index > 0;
          return (
            <div key={p.id} className={`break-inside-avoid ${isFeatured ? 'md:col-span-2' : ''}`}>
              <MasonPostCard 
                post={p} 
                index={index} 
                onPostClick={() => setSelectedPost(p)} 
                onToggleLike={() => {}} 
                isFeatured={isFeatured}
                isCompact={isCompact}
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
        <div className="h-full flex flex-col w-full">
          {feedContent}
        </div>
      ) : (
        <div className="theme-glass-panel rounded-3xl p-8 h-full flex flex-col">
          {feedContent}
        </div>
      )}

      {selectedPost && (
        <MasonPostViewer 
          post={selectedPost} 
          onClose={() => setSelectedPost(null)} 
          userId="system" 
        />
      )}
    </>
  );
}
