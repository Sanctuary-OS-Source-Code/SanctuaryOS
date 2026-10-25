import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import {
  SidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  DashboardStatTile,
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
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[760px]"
        title={t("title_sanctuary_alerts", "Sanctuary Alerts")}
        subtitle={t("subtitle_sanctuary_alerts", "Official System & Security Advisories")}
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={
              hasActiveAlert
                ? t("icon_priority_high", "priority_high")
                : t("icon_notifications", "notifications")
            }
            overline={t("title_sanctuary_alerts", "Sanctuary Alerts")}
            title={t("subtitle_sanctuary_alerts", "Official System & Security Advisories")}
            description={t(
              "alert_card_read_more",
              "Real-time system dispatches, game version alerts, and security advisories."
            )}
            badge={`${filteredPosts.length}`}
            badgeIcon={t("icon_podcasts", "podcasts")}
            variant={hasActiveAlert ? "warning" : "accent"}
          />

          <div className="grid grid-cols-3 gap-3">
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_check_circle", "check_circle")}
              label={t("status_active", "Active")}
              isActive={filterStatus === "Active"}
              onClick={() => setFilterStatus("Active")}
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_history", "history")}
              label={t("status_inactive", "Inactive")}
              isActive={filterStatus === "Inactive"}
              onClick={() => setFilterStatus("Inactive")}
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_all_inclusive", "all_inclusive")}
              label={t("alert_filter_status_all", "All Statuses")}
              isActive={filterStatus === "All"}
              onClick={() => setFilterStatus("All")}
            />
          </div>

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

          <UniversalGroup
            title={t("title_sanctuary_alerts", "Active Advisories")}
            icon={t("icon_podcasts", "podcasts")}
          >
            {loading ? (
              <div className="glass-surface rounded-xl p-12 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col items-center justify-center opacity-70">
                <span className="material-symbols-outlined animate-spin-slow text-[var(--accent)] mb-3 !text-[28px]">
                  {t("icon_sync", "sync")}
                </span>
                <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text)]">
                  {t("ui_loading", "Loading...")}
                </span>
              </div>
            ) : filteredPosts.length === 0 ? (
              <EmptyState
                icon={t("icon_satellite_alt", "satellite_alt")}
                title={t("system_no_broadcasts", "No Active Broadcasts")}
              />
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
                      className={`glass-panel rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col justify-between transition-all duration-300 cursor-pointer group hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] ${
                        isInactive ? "opacity-60 hover:opacity-95 grayscale-[35%]" : ""
                      }`}
                    >
                      {/* Top Header Bar */}
                      <div className="px-4 py-3 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                        <span className="px-2.5 py-1 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] text-[9px] font-black uppercase tracking-wider inline-flex items-center gap-1">
                          <span className="material-symbols-outlined !text-[12px]">
                            {isPinned
                              ? t("icon_warning", "warning")
                              : t("icon_podcasts", "podcasts")}
                          </span>
                          <span>{categoryLabel}</span>
                        </span>
                        {isPinned && (
                          <span className="px-2.5 py-1 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] text-[var(--warning)] text-[9px] font-black uppercase tracking-wider">
                            {t("urgent_alert", "Urgent")}
                          </span>
                        )}
                      </div>

                      {postImg && (
                        <div className="w-full h-32 overflow-hidden relative border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-center shrink-0">
                          <img
                            src={postImg}
                            alt={post.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                          />
                        </div>
                      )}

                      {/* Card Content */}
                      <div className="p-4 flex flex-col gap-2.5 flex-1 justify-between">
                        <div className="flex flex-col gap-1.5">
                          <span
                            className="text-sm font-black text-[var(--text)] tracking-tight leading-snug line-clamp-1 group-hover:text-[var(--accent)] transition-colors"
                            title={post.title}
                          >
                            {post.title}
                          </span>

                          <div className="flex items-center gap-1.5 text-[11px] text-[var(--subtext)] opacity-80">
                            <span className="truncate">
                              {post.masons?.name ||
                                t("author_sanctuary_team", "Sanctuary Foundry")}
                            </span>
                            <span>•</span>
                            <span className="truncate">{audienceLabel}</span>
                          </div>

                          {cleanSummary && (
                            <p className="text-xs text-[var(--subtext)] opacity-85 line-clamp-2 leading-relaxed mt-1 m-0">
                              {cleanSummary}
                            </p>
                          )}
                        </div>

                        {/* Footer Row */}
                        <div className="glass-surface rounded-xl px-3 py-2 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-between gap-2 text-[11px] text-[var(--subtext)] mt-1">
                          <span className="truncate font-bold text-[var(--text)]">
                            {actionLabel}
                          </span>
                          <span className="font-mono shrink-0 text-[10px]">
                            {new Date(post.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </UniversalGroup>
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
