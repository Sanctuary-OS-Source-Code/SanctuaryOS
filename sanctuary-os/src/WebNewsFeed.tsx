import { useState, useEffect } from "react";
import { useLexicon } from "./LexiconContext";
import { supabase, supabaseAuth } from "./supabase";
import { stripMarkdown } from "./shared";
import MasonPostViewer from "./side-panels/MasonPostViewer";
import MasonPostCard from "./MasonPostCard";

export default function WebNewsFeed() {
  const { t } = useLexicon();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPost, setSelectedPost] = useState<any>(null);

  useEffect(() => {
    const fetchBroadcasts = async () => {
      setLoading(true);
      const { data } = await supabaseAuth
        .from('system_broadcasts')
        .select('*')
        .in('category', ['Announcement', 'Blog', 'Press', 'Update', 'Maintenance', 'Info', 'Event'])
        .ilike('target_audience', '%Public%')
        .order('created_at', { ascending: false })
        .limit(3);

      if (data) {
        const mappedData = data.map(b => ({
          ...b,
          content: b.message || b.content || "",
          masons: { name: "Sanctuary Foundry" },
          likes: [],
          views: [],
          comments: []
        }));
        setPosts(mappedData);
      }
      setLoading(false);
    };
    fetchBroadcasts();
  }, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {loading ? (
        <div className="text-center py-12 opacity-50 font-black uppercase tracking-widest col-span-full">{t("loading")}</div>
      ) : posts.length === 0 ? (
        <div className="text-center py-12 opacity-50 font-black uppercase tracking-widest col-span-full">{t("system_no_broadcasts") || "No announcements."}</div>
      ) : (
        posts.map((p, index) => (
          <MasonPostCard
            key={p.id}
            post={p}
            index={index}
            onPostClick={() => setSelectedPost(p)}
            isCompact={true}
          />
        ))
      )}

      {selectedPost && (
        <MasonPostViewer
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          userId={null}
          hideActions={true}
        />
      )}
    </div>
  );
}







