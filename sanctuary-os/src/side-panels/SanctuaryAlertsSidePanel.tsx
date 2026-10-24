import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import {
  SidePanel,
  extractPostImage,
  stripMarkdown,
  ActionPill,
  InlineFilterGroup,
  EmptyState,
} from "../shared";
import MasonPostViewer from "./MasonPostViewer";
import { useStore } from "../store";
import {
  formatDispatchCategory,
  extractDispatchMetadata,
} from "../components/universal/DispatchPollAndMeta";

export function SanctuaryAlertsSidePanel({
  isOpen,
  onClose,
  audience = "All",
  tableName = "system_broadcasts",
}: {
  isOpen: boolean;
  onClose: () => void;
  audience?: string;
  tableName?: string;
}) {
  const { t } = useLexicon();
  const session = useStore((state) => state.session);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("Active");
  const [filterCategory, setFilterCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewingPost, setViewingPost] = useState<any>(null);

  useEffect(() => {
    if (!isOpen) return;
    const fetchPosts = async () => {
      setLoading(true);
      let query = supabase
        .from(tableName)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (audience && audience !== "All") {
        query = query.or(
          `target_audience.ilike.%All%,target_audience.ilike.%${audience.replace(/ /g, "_")}%`
        );
      }

      if (filterStatus === "Active") {
        query = query.eq("is_active", true);
      } else if (filterStatus === "Inactive") {
        query = query.eq("is_active", false);
      }

      if (filterCategory !== "All") {
        query = query.eq("category", filterCategory);
      } else {
        query = query.in("category", [
          "Alert",
          "Game Version Alert",
          "Malware Alert",
          "Artifact Alert",
        ]);
      }

      const { data } = await query;

      if (data) {
        const activeSchema = useStore.getState().activeGameSchema;
        const teamName =
          tableName === "keeper_system_broadcasts"
            ? t("author_sanctuary_team", "Sanctuary Foundry")
            : `${activeSchema?.display_name || activeSchema?.name || "Wayfinders"} Team`;

        setPosts(
          data.map((p: any) => ({
            ...p,
            masons: { name: teamName },
          }))
        );
      }
      setLoading(false);
    };
    fetchPosts();
  }, [isOpen, filterStatus, filterCategory, audience, tableName, t]);

  const filteredPosts = useMemo(() => {
    return [...posts]
      .filter(
        (p) =>
          !searchQuery ||
          p.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.message?.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .sort((a, b) => {
        const aPinned = a.is_pinned === true || a.is_pinned === "true";
        const bPinned = b.is_pinned === true || b.is_pinned === "true";
        if (aPinned && !bPinned) return -1;
        if (!aPinned && bPinned) return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [posts, searchQuery]);

  const isPostPinned = (p: any) => p?.is_pinned === true || p?.is_pinned === "true";
  const hasActiveAlert = posts.some(isPostPinned);

  return (
    <>
      <SidePanel
        isOpen={isOpen}
        onClose={onClose}
        icon={
          hasActiveAlert
            ? t("icon_priority_high", "priority_high")
            : t("icon_notifications", "notifications")
        }
        iconColorClass="theme-text-accent"
        widthClass="w-full md:w-[820px]"
        title={t("title_sanctuary_alerts", "Sanctuary Alerts")}
        subtitle={t("subtitle_sanctuary_alerts", "Official System & Security Advisories")}
      >
        <div className="flex flex-col gap-6 relative z-10 w-full pb-12">
          <ActionPill
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchPlaceholder={t("ui_placeholder_search", "Search...")}
            primaryPopover={{
              icon: t("icon_tune", "tune"),
              label: t("ui_btn_filter", "Filters"),
              content: (
                <div className="flex flex-col gap-4 p-3 w-[290px]">
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 px-1">
                      {t("category", "Category")}
                    </span>
                    <InlineFilterGroup
                      value={filterCategory}
                      onChange={(v: string) => setFilterCategory(v)}
                      options={[
                        { id: "All", label: t("all_classes", "All") },
                        { id: "Alert", label: t("category_alert", "General Alert") },
                        {
                          id: "Game Version Alert",
                          label: t("category_game_version_alert", "Game Version Alert"),
                        },
                        {
                          id: "Malware Alert",
                          label: t("category_malware_alert", "Malware Alert"),
                        },
                        {
                          id: "Artifact Alert",
                          label: t("category_artifact_alert", "Artifact Alert"),
                        },
                      ]}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 px-1">
                      {t("status", "Status")}
                    </span>
                    <InlineFilterGroup
                      value={filterStatus}
                      onChange={(v: string) => setFilterStatus(v)}
                      options={[
                        { id: "All", label: t("alert_filter_status_all", "All Statuses") },
                        { id: "Active", label: t("status_active", "Active") },
                        { id: "Inactive", label: t("status_inactive", "Inactive") },
                      ]}
                    />
                  </div>
                </div>
              ),
            }}
          />

          {loading ? (
            <div className="glass-panel rounded-3xl p-12 flex flex-col items-center justify-center opacity-70">
              <span className="material-symbols-outlined animate-spin-slow text-[var(--accent)] mb-3 !text-[28px]">
                {t("icon_sync", "sync")}
              </span>
              <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text)]">
                {t("ui_loading", "Loading...")}
              </span>
            </div>
          ) : filteredPosts.length === 0 ? (
            <div className="glass-panel rounded-3xl p-10">
              <EmptyState
                icon={t("icon_satellite_alt", "satellite_alt")}
                title={t("system_no_broadcasts", "No Active Broadcasts")}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              {filteredPosts.map((post) => {
                const isPinned = isPostPinned(post);
                const isInactive = !post.is_active;
                const postImg = extractPostImage(post);
                const meta = extractDispatchMetadata(post);
                const cleanSummary = post.description
                  ? post.description
                  : stripMarkdown(meta.cleanContent || post.message || "");
                const categoryLabel = formatDispatchCategory(
                  meta.alertOrDispatchType || post.category,
                  t
                );
                const audienceLabel = (meta.audience || post.target_audience || "All")
                  .split(",")
                  .map((a: string) =>
                    a.trim() === "Senior Architects" ? "Oversight" : a.trim()
                  )
                  .join(", ");
                const actionLabel =
                  meta.actionRequired ||
                  (isPinned
                    ? t("urgent_alert", "Urgent Advisory")
                    : t("alert_card_read_more", "Open Full Advisory"));

                return (
                  <div
                    key={post.id}
                    onClick={() =>
                      setViewingPost({
                        ...post,
                        content: post.message,
                        mason_id: "system",
                        views: 0,
                        likes: 0,
                        replies: 0,
                      })
                    }
                    className={`glass-panel rounded-2xl overflow-hidden flex flex-col justify-between transition-all duration-300 cursor-pointer group hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)] ${
                      isInactive ? "opacity-60 hover:opacity-95 grayscale-[35%]" : ""
                    }`}
                  >
                    {/* Top Visual Area (Matches Comm-Link Feed Card Layout) */}
                    <div className="w-full h-36 overflow-hidden relative border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-center shrink-0">
                      {postImg ? (
                        <>
                          <img
                            src={postImg}
                            alt={post.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent pointer-events-none" />
                        </>
                      ) : (
                        <div className="w-14 h-14 rounded-2xl glass-surface flex items-center justify-center text-[var(--text)] opacity-80 group-hover:scale-105 transition-transform duration-300">
                          <span className="material-symbols-outlined !text-[28px]">
                            {isPinned
                              ? t("icon_warning", "warning")
                              : t("icon_podcasts", "podcasts")}
                          </span>
                        </div>
                      )}

                      <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 pointer-events-none">
                        <span className="px-2.5 py-1 rounded-lg glass-surface backdrop-blur-md text-[10px] font-semibold text-[var(--text)] inline-flex items-center">
                          <span>{categoryLabel}</span>
                        </span>
                        {isPinned && (
                          <span className="px-2.5 py-1 rounded-lg glass-surface backdrop-blur-md text-[10px] font-semibold text-[var(--text)]">
                            {t("urgent_alert", "Urgent")}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Card Content */}
                    <div className="p-4 flex flex-col gap-2.5 flex-1 justify-between">
                      <div className="flex flex-col gap-1.5">
                        <span
                          className="text-[15px] font-bold text-[var(--text)] tracking-tight leading-snug line-clamp-1"
                          title={post.title}
                        >
                          {post.title}
                        </span>

                        <div className="flex items-center gap-1.5 text-[11px] text-[var(--subtext)] opacity-80">
                          <span className="truncate">
                            {post.masons?.name || t("author_sanctuary_team", "Sanctuary Foundry")}
                          </span>
                          <span>•</span>
                          <span className="truncate">{audienceLabel}</span>
                        </div>

                        {cleanSummary && (
                          <p className="text-[12px] text-[var(--subtext)] opacity-85 line-clamp-2 leading-relaxed mt-1">
                            {cleanSummary}
                          </p>
                        )}
                      </div>

                      {/* Footer Row */}
                      <div className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 text-[11px] text-[var(--subtext)] opacity-75">
                        <span className="truncate">{actionLabel}</span>
                        <span className="font-mono shrink-0">
                          {new Date(post.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SidePanel>
      {viewingPost && (
        <MasonPostViewer
          post={viewingPost}
          onClose={() => setViewingPost(null)}
          userId={session?.user?.id || null}
        />
      )}
    </>
  );
}




