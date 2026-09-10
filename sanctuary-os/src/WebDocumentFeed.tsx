import { useState, useEffect } from "react";
import { useLexicon } from "./LexiconContext";
import { supabase, supabaseAuth } from "./supabase";
import { stripMarkdown } from "./shared";
import MasonPostViewer from "./side-panels/MasonPostViewer";
import MasonPostCard from "./MasonPostCard";

export default function WebDocumentFeed() {
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
        .in('category', ['Citizen Guide', 'Master Architecture', 'Master Protocol List', 'Phase Roadmap'])
        .ilike('target_audience', '%Public%')
        .order('created_at', { ascending: false });

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
    <div className="grid grid-cols-[repeat(auto-fill,minmax(400px,1fr))] gap-6 w-full">
      {loading ? (
        <div className="col-span-full text-center py-12 opacity-50 font-black uppercase tracking-widest">{t("loading")}</div>
      ) : posts.length === 0 ? (
        <div className="col-span-full text-center py-12 opacity-50 font-black uppercase tracking-widest">{t("system_no_broadcasts") || "No documents found."}</div>
      ) : (
        posts.map((p, index) => (
          <MasonPostCard
            key={p.id}
            post={p}
            index={index}
            onPostClick={() => setSelectedPost(p)}
            isCompact={true}
            layout="horizontal"
          />
        ))
      )}

      {selectedPost && (
        <MasonPostViewer
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          userId={null}
        />
      )}
    </div>
  );
}







