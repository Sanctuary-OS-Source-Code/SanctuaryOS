import { useState, useEffect } from "react";
import { useLexicon } from "./LexiconContext";
import { supabase, supabaseAuth } from "./supabase";
import { stripMarkdown } from "./shared";
import MasonPostViewer from "./side-panels/MasonPostViewer";
import MasonPostCard from "./MasonPostCard";
import { UniversalCard } from "./components/universal/UniversalCard";

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
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-4 w-full">
      {loading ? (
        <div className="col-span-full text-center py-12 opacity-50 font-black uppercase tracking-widest">{t("loading")}</div>
      ) : posts.length === 0 ? (
        <div className="col-span-full text-center py-12 opacity-50 font-black uppercase tracking-widest">{t("system_no_broadcasts") || "No documents found."}</div>
      ) : (
        posts.map((p, index) => (
          <UniversalCard
            key={p.id}
            layout="horizontal"
            onClick={() => setSelectedPost(p)}
            className="w-full group cursor-pointer"
            isActive={selectedPost?.id === p.id}
            title={<span className="group-hover:text-[var(--accent)] transition-colors line-clamp-1 leading-snug">{p.title}</span>}
            subtitle={<span className="text-[10px] font-mono tracking-widest text-[var(--subtext)] opacity-60 uppercase mt-0.5 inline-block">{p.category}</span>}
            icon={p.category?.toLowerCase().includes('alert') ? 'warning' : 'data_object'}
            style={{ animationFillMode: "both", animationDelay: `${(index % 10) * 50}ms` }}
          >
            <p className="text-xs text-[var(--subtext)] line-clamp-2 leading-relaxed opacity-70 font-medium">
              {stripMarkdown(p.description || p.content)}
            </p>
          </UniversalCard>
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







