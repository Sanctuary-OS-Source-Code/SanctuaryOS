import { useState, useEffect } from "react";
import { useLexicon } from "../LexiconContext";
import { supabaseAuth } from "../supabase";
import { useStore } from "../store";
import { EmptyState } from "../shared";
import MasonPostViewer from "../side-panels/MasonPostViewer";
import MasonPostCard from "../hub-components/mason/MasonPostCard";

export default function WebNewsFeed({
  limit = 3,
  onCountChange,
  searchQuery = "",
  categoryFilter = "ALL",
  gridClassName = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full",
  disableFeaturedSpan = true,
}: {
  limit?: number;
  onCountChange?: (count: number) => void;
  searchQuery?: string;
  categoryFilter?: string;
  gridClassName?: string;
  disableFeaturedSpan?: boolean;
} = {}) {
  const { t } = useLexicon();
  const session = useStore((state: any) => state.session);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPost, setSelectedPost] = useState<any>(null);

  useEffect(() => {
    const fetchBroadcasts = async () => {
      setLoading(true);
      const { data, count } = await supabaseAuth
        .from('system_broadcasts')
        .select('*', { count: 'exact' })
        .in('category', ['Announcement', 'Blog', 'Press', 'Update', 'Maintenance', 'Info', 'Event'])
        .ilike('target_audience', '%Public%')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (typeof count === 'number') {
        onCountChange?.(count);
      } else if (data) {
        onCountChange?.(data.length);
      }

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
  }, [limit, onCountChange]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredPosts = posts.filter((p) => {
    if (categoryFilter && categoryFilter !== "ALL") {
      if (String(p.category || "").toLowerCase() !== categoryFilter.toLowerCase()) {
        return false;
      }
    }
    if (!normalizedQuery) return true;
    const haystack = `${p.title || ""} ${p.content || ""} ${p.category || ""} ${p.masons?.name || ""}`.toLowerCase();
    return haystack.includes(normalizedQuery);
  });

  return (
    <div className={gridClassName}>
      {loading ? (
        <EmptyState icon={t("icon_sync", "sync")} title={t("loading", "Loading")} className="col-span-full animate-pulse" />
      ) : filteredPosts.length === 0 ? (
        <EmptyState icon={t("icon_satellite_alt", "satellite_alt")} title={t("system_no_broadcasts", "No Recent Posts") || "No announcements."} className="col-span-full" />
      ) : (
        filteredPosts.map((p, index) => (
          <MasonPostCard
            key={p.id}
            post={p}
            index={index}
            onPostClick={() => setSelectedPost(p)}
            isFeatured={disableFeaturedSpan ? false : undefined}
            isCompact={false}
          />
        ))
      )}

      {selectedPost && (
        <MasonPostViewer
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          userId={session?.user?.id || null}
          hideActions={true}
        />
      )}
    </div>
  );
}







