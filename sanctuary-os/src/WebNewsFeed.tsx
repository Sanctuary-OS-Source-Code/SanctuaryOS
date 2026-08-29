import { useState, useEffect } from "react";
import { useLexicon } from "./LexiconContext";
import { supabase, supabaseAuth } from "./supabase";
import { stripMarkdown } from "./shared";
import MasonPostViewer from "./side-panels/MasonPostViewer";

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
        .in('category', ['Announcement', 'Blog', 'Press', 'Update', 'Maintenance'])
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
    <div className="flex flex-col gap-6">
      {loading ? (
        <div className="text-center py-12 opacity-50 font-black uppercase tracking-widest">{t("loading")}</div>
      ) : posts.length === 0 ? (
        <div className="text-center py-12 opacity-50 font-black uppercase tracking-widest">{t("system_no_broadcasts") || "No announcements."}</div>
      ) : (
        posts.map((p) => (
          <div 
            key={p.id} 
            onClick={() => setSelectedPost(p)}
            className="w-full glass-panel rounded-2xl p-6 md:p-8 flex flex-col gap-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:shadow-[0_0_40px_rgba(var(--accent-rgb),0.1)] hover:bg-[color-mix(in_srgb,var(--accent)_2%,transparent)] hover:-translate-y-1 cursor-pointer transition-all duration-300 group relative overflow-hidden"
          >
            {/* Edge Glint */}
            <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_20%,transparent)] group-hover:via-[var(--accent)] to-transparent opacity-50 transition-colors duration-500" />
            
            <div className="flex flex-wrap justify-between items-start gap-4 relative z-10">
              <h3 className="text-2xl md:text-3xl font-black uppercase tracking-[0.1em] text-[var(--text)] group-hover:text-[var(--accent)] transition-all duration-300 drop-shadow-sm">
                {p.title}
              </h3>
              <div className="flex flex-col text-right">
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] opacity-40 group-hover:opacity-100 transition-opacity">{new Date(p.created_at).toLocaleDateString()}</span>
                <span className="text-[11px] font-black uppercase tracking-widest text-[var(--accent)] drop-shadow-[0_0_5px_var(--accent)]">{p.category}</span>
              </div>
            </div>
            
            <p className="text-[var(--subtext)] text-sm leading-relaxed line-clamp-3 relative z-10 font-medium">
              {stripMarkdown(p.content)}
            </p>
            
            <div className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text)] opacity-30 group-hover:opacity-100 group-hover:text-[var(--accent)] group-hover:drop-shadow-[0_0_8px_var(--accent)] transition-all duration-300 relative z-10 flex items-center gap-2">
              {t("read_more") || "READ MORE"} 
              <span className="material-symbols-outlined !text-[12px] group-hover:translate-x-1 transition-transform">arrow_forward_ios</span>
            </div>
          </div>
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







