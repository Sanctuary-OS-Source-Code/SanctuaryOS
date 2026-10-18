import { useState, useEffect } from "react";
import { useLexicon } from "./LexiconContext";
import { supabaseAuth } from "./supabase";
import { useStore } from "./store";
import { stripMarkdown, extractPostImage } from "./shared";
import MasonPostViewer from "./side-panels/MasonPostViewer";
import { UniversalCard } from "./components/universal/UniversalCard";
import { extractDispatchMetadata } from "./components/universal/DispatchPollAndMeta";

export default function WebDocumentFeed() {
  const { t } = useLexicon();
  const session = useStore((state: any) => state.session);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPost, setSelectedPost] = useState<any>(null);

  useEffect(() => {
    const fetchBroadcasts = async () => {
      setLoading(true);
      const { data } = await supabaseAuth
        .from("system_broadcasts")
        .select("*")
        .in("category", [
          "Citizen Guide",
          "Master Architecture",
          "Master Protocol List",
          "Phase Roadmap",
        ])
        .ilike("target_audience", "%Public%")
        .order("created_at", { ascending: false });

      if (data) {
        const mappedData = data.map((b) => ({
          ...b,
          mason_id: b.mason_id || "system",
          content: b.message || b.content || "",
          masons: { name: "Sanctuary Foundry" },
          likes: [],
          views: [],
          comments: [],
        }));
        setPosts(mappedData);
      }
      setLoading(false);
    };
    fetchBroadcasts();
  }, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
      {loading ? (
        <div className="col-span-full text-center py-12 opacity-50 font-black uppercase tracking-widest">
          {t("loading")}
        </div>
      ) : posts.length === 0 ? (
        <div className="col-span-full text-center py-12 opacity-50 font-black uppercase tracking-widest">
          {t("system_no_broadcasts") || "No documents found."}
        </div>
      ) : (
        posts.map((p, index) => {
          const rawBody = p.content || p.message || "";
          const parsedImage = extractPostImage(p) || undefined;
          const cleanBody = extractDispatchMetadata(p, rawBody).cleanContent;
          const summaryText = stripMarkdown(p.description || cleanBody);

          return (
            <UniversalCard
              key={p.id}
              layout="vertical-compact"
              onClick={() => setSelectedPost(p)}
              className="w-full h-full group cursor-pointer"
              isActive={selectedPost?.id === p.id}
              image={parsedImage}
              icon={
                !parsedImage
                  ? p.category?.toLowerCase().includes("alert")
                    ? t("icon_warning", "warning")
                    : t("icon_data_object", "data_object")
                  : undefined
              }
              title={
                <span className="group-hover:text-[var(--accent)] transition-colors line-clamp-1 leading-snug">
                  {p.title}
                </span>
              }
              subtitle={
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center shadow-md glass-surface border border-[color-mix(in_srgb,var(--text)_20%,transparent)] backdrop-blur-md shrink-0">
                    <span className="material-symbols-outlined !text-[12px] text-[var(--text)] drop-shadow-md">
                      {t("icon_memory", "memory")}
                    </span>
                  </div>
                  <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80">
                    {t("author_sanctuary_team", "Sanctuary Foundry")}
                  </span>
                  <span className="text-[10px] font-black opacity-30 text-[var(--text)]">
                    &bull;
                  </span>
                  <span className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)]">
                    {p.category}
                  </span>
                </div>
              }
              imageOverlay={
                <div className="absolute top-3 left-3 flex flex-wrap gap-2 z-30">
                  <span className="px-2.5 py-1 bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] text-[9px] font-black uppercase tracking-widest rounded-lg backdrop-blur-md flex items-center gap-1">
                    <span className="material-symbols-outlined !text-[12px]">
                      {t("icon_folder_special", "folder_special")}
                    </span>
                    {p.category}
                  </span>
                </div>
              }
              footer={
                <div className="flex items-center justify-between w-full mt-1">
                  <span className="text-[10px] font-black capitalize tracking-widest opacity-50 text-[var(--subtext)] flex items-center gap-2">
                    <span className="material-symbols-outlined !text-[12px]">
                      {t("icon_calendar_today", "calendar_today")}
                    </span>
                    {new Date(p.created_at).toLocaleDateString()}
                  </span>
                  <span className="text-[10px] font-black capitalize tracking-widest opacity-70 group-hover/card:opacity-100 transition-all flex items-center gap-1 text-[var(--accent)]">
                    {t("btn_view", "View")}{" "}
                    <span className="material-symbols-outlined !text-sm">
                      {t("icon_arrow_forward", "arrow_forward")}
                    </span>
                  </span>
                </div>
              }
              style={{
                animationFillMode: "both",
                animationDelay: `${(index % 10) * 50}ms`,
              }}
            >
              <p className="text-[11px] text-[var(--subtext)] line-clamp-2 leading-relaxed opacity-80 font-medium mt-1">
                {summaryText}
              </p>
            </UniversalCard>
          );
        })
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
