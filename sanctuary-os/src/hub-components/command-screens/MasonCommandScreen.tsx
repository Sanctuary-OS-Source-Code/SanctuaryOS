import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../supabase";
import { useLexicon } from "../../LexiconContext";
import { useStore } from "../../store";
import { SanctuaryAlertsSidePanel } from "../../side-panels/SanctuaryAlertsSidePanel";
import TicketDossierSidePanel from "../../side-panels/TicketDossierSidePanel";
import { stripMarkdown, EmptyState, openModDossier, VAULT_CHIP_CLASS } from "../../shared";
import {
  CommandScreenLayout,
  CommandScreenBody,
  CommandScreenSidebar,
  CommandScreenStats,
  CommandScreenMain,
  SystemBroadcastsGrid,
  CommandScreenMetricTile,
  CommandScreenQuickLink,
  DashboardStatTile,
  AlertStatTile,
  CommandScreenSectionHeading,
} from "../SharedCommandScreenLayout";
import { UniversalCard } from "../../components/universal/UniversalCard";
import { openSanctuaryContextMenu, SanctuaryContextMenuItem } from "../../ContextMenu";
import { formatSanctuaryDate } from "../../utils/dateUtils";
import { isDesktop } from "../../utils/envUtils";
import {
  getHubCommandCache,
  setHubCommandCache,
  isTicketOpenStatus,
  filterMasonBugTickets,
  executeHubTicketAction,
  claimOrReleaseHubTicket,
} from "../../utils/hubCommandCache";

interface MasonCommandSnapshot {
  stats: {
    artifacts: number;
    collections: number;
    posts: number;
    replies: number;
    bugs: number;
    support: number;
    followers: number;
    blueprints: number;
    chameleons: number;
    lexicons: number;
    templates: number;
    flaggedAssets: number;
  };
  broadcasts: any[];
  urgentBroadcast: any | null;
  recentBugs: any[];
  recentArtifacts: any[];
  recentReplies: any[];
  recentStudioAssets: any[];
}

const DEFAULT_MASON_SNAPSHOT: MasonCommandSnapshot = {
  stats: {
    artifacts: 0,
    collections: 0,
    posts: 0,
    replies: 0,
    bugs: 0,
    support: 0,
    followers: 0,
    blueprints: 0,
    chameleons: 0,
    lexicons: 0,
    templates: 0,
    flaggedAssets: 0,
  },
  broadcasts: [],
  urgentBroadcast: null,
  recentBugs: [],
  recentArtifacts: [],
  recentReplies: [],
  recentStudioAssets: [],
};

export function MasonCommandScreen({
  onNavigate,
  masonId,
  masonName: _masonName,
  isVerifiedMason = false,
  session,
  onOpenRecentReplies,
  onOpenSupportDesk,
  onOpenNotepad,
  onOpenCreatorSettings,
  onViewProfile,
  setViewingPost,
  onOpenMetadataEditor,
}: any) {
  const { t } = useLexicon();
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);
  const dateFormat = useStore((s) => s.dateFormat);
  const modList = useStore((s) => s.modList);

  const userId = session?.user?.id || "";
  const cacheScope = `${activeWorkspaceId || "global"}:${userId}:${masonId || "local"}:${isVerifiedMason ? "v" : "u"}`;

  const [snapshot, setSnapshot] = useState<MasonCommandSnapshot>(
    () => getHubCommandCache<MasonCommandSnapshot>("mason", cacheScope) || DEFAULT_MASON_SNAPSHOT
  );
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [selectedBugTicket, setSelectedBugTicket] = useState<any | null>(null);

  const localSandboxCount = Array.isArray(modList) ? modList.length : 0;

  const refreshMasonDashboard = useCallback(async () => {
    const ownerIds = Array.from(new Set([masonId, userId].filter(Boolean)));
    const targetRoleTag = isVerifiedMason ? "{Mason}" : "{Citizen}";

    const [
      broadcastsRes,
      urgentRes,
      ticketsRes,
      blueprintsRes,
      nexusAssetsRes,
      modsRes,
      collectionsRes,
      postsRes,
      followersRes,
    ] = await Promise.all([
      supabase
        .from("system_broadcasts")
        .select("*")
        .eq("is_active", true)
        .in("category", ["Update", "Info", "Event", "System"])
        .order("created_at", { ascending: false })
        .limit(12),
      supabase
        .from("system_broadcasts")
        .select("*")
        .eq("is_active", true)
        .in("is_pinned", ["true", "True", true] as any)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("sanctuary_tickets")
        .select("*")
        .order("created_at", { ascending: false }),
      ownerIds.length > 0
        ? supabase
            .from("blueprints")
            .select("id, name, description, created_at, downloads, is_public", { count: "exact" })
            .in("mason_id", ownerIds)
            .order("created_at", { ascending: false })
            .limit(4)
        : Promise.resolve({ data: [], count: 0 } as any),
      ownerIds.length > 0
        ? supabase
            .from("nexus_assets")
            .select("id, name, asset_type, version, downloads, is_public, is_outdated, created_at")
            .in("author", ownerIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] } as any),
      isVerifiedMason && masonId
        ? supabase
            .from("mods")
            .select("id, name, description, latest_version, status, sub_type, category_override, updated_at, created_at", { count: "exact" })
            .eq("mason_id", masonId)
            .order("updated_at", { ascending: false })
        : Promise.resolve({ data: [], count: 0 } as any),
      isVerifiedMason && masonId
        ? supabase
            .from("collections")
            .select("id, name, description, created_at", { count: "exact" })
            .eq("mason_id", masonId)
            .order("created_at", { ascending: false })
            .limit(3)
        : Promise.resolve({ data: [], count: 0 } as any),
      isVerifiedMason && masonId
        ? supabase
            .from("mason_posts")
            .select("id, title, created_at", { count: "exact" })
            .eq("mason_id", masonId)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], count: 0 } as any),
      isVerifiedMason && masonId
        ? supabase
            .from("mason_followers")
            .select("id", { count: "exact", head: true })
            .eq("mason_id", masonId)
        : Promise.resolve({ count: 0 } as any),
    ]);

    const matchesMasonAudience = (post: any) => {
      const aud = post?.target_audience;
      if (!aud || (Array.isArray(aud) && aud.length === 0)) return true;
      const arr = Array.isArray(aud) ? aud.map(String) : [String(aud)];
      return (
        arr.includes("All") ||
        arr.includes("Mason") ||
        arr.includes("{Mason}") ||
        arr.includes(targetRoleTag)
      );
    };

    const broadcasts = (broadcastsRes?.data || []).filter(matchesMasonAudience).slice(0, 3);
    let urgentBroadcast = (urgentRes?.data || []).find(matchesMasonAudience) || null;
    const dismissedAlertId = sessionStorage.getItem("dismissedAlertId");
    if (urgentBroadcast && String(urgentBroadcast.id) === dismissedAlertId) {
      urgentBroadcast = null;
    }

    const allOpenTickets = (ticketsRes?.data || []).filter((tk: any) =>
      isTicketOpenStatus(tk.status)
    );
    const citizenSupportCount = userId
      ? allOpenTickets.filter((tk: any) => tk.author_id === userId).length
      : 0;

    const creatorMods = modsRes?.data || [];
    const modNamesById: Record<string, string> = {};
    const masonModIds: string[] = [];
    creatorMods.forEach((m: any) => {
      if (m.id) {
        masonModIds.push(m.id);
        if (m.name) modNamesById[m.id] = m.name;
      }
    });

    const openCreatorBugs = isVerifiedMason
      ? filterMasonBugTickets(allOpenTickets, {
          userId,
          masonId,
          masonModIds,
          modNamesById,
        })
      : [];

    // Fetch comments strictly on THIS Mason's posts (never entire Spoke!)
    const creatorPosts = postsRes?.data || [];
    const creatorPostIds = creatorPosts.map((p: any) => p.id).filter(Boolean);
    const postTitleMap: Record<string, string> = {};
    creatorPosts.forEach((p: any) => {
      postTitleMap[p.id] = p.title;
    });

    let repliesCount = 0;
    let recentReplies: any[] = [];
    if (isVerifiedMason && creatorPostIds.length > 0) {
      const { data: commentsData, count: commentsCount } = await supabase
        .from("mason_post_comments")
        .select("*", { count: "exact" })
        .in("post_id", creatorPostIds)
        .order("created_at", { ascending: false })
        .limit(6);
      repliesCount = commentsCount ?? (commentsData?.length || 0);
      recentReplies = (commentsData || []).slice(0, 3).map((rep: any) => ({
        ...rep,
        post_title: postTitleMap[rep.post_id] || t("tab_posts", "{Dispatch}"),
      }));
    }

    const nexusAssets = nexusAssetsRes?.data || [];
    const chameleons = nexusAssets.filter(
      (a: any) => String(a.asset_type || "").toLowerCase() === "chameleon" || String(a.asset_type || "").toLowerCase() === "theme"
    );
    const lexicons = nexusAssets.filter(
      (a: any) => String(a.asset_type || "").toLowerCase() === "lexicon"
    );
    const templates = nexusAssets.filter(
      (a: any) => String(a.asset_type || "").toLowerCase() === "workbench_template"
    );

    const brokenOrFlaggedMods = creatorMods.filter((m: any) =>
      ["broken", "corrupted", "blacklisted", "quarantined"].includes(
        String(m.status || "").toLowerCase()
      )
    ).length;
    const outdatedNexus = nexusAssets.filter((a: any) => Boolean(a.is_outdated)).length;

    const studioCards: any[] = [
      ...(blueprintsRes?.data || []).slice(0, 2).map((bp: any) => ({
        id: bp.id,
        title: bp.name || t("term_blueprint", "{Blueprint}"),
        subtitle: t("term_blueprint", "{Blueprint}"),
        description: bp.description || t("published_blueprint_desc", "Published {Blueprint} loadout in {Nexus}."),
        created_at: bp.created_at,
        kind: "blueprint",
        targetTab: "nexus",
        icon: t("icon_map", "map"),
      })),
      ...nexusAssets.slice(0, 3).map((asset: any) => {
        const typeLower = String(asset.asset_type || "lexicon").toLowerCase();
        const isChameleon = typeLower === "chameleon" || typeLower === "theme";
        const isTemplate = typeLower === "workbench_template";
        return {
          id: asset.id,
          title: asset.name || t("unknown_asset", "Unknown Asset"),
          subtitle: isChameleon
            ? t("term_chameleon", "{Chameleon}")
            : isTemplate
              ? t("ql_templates", "Template")
              : t("term_lexicon", "{Lexicon}"),
          description: asset.version
            ? `${t("version", "Version")} ${asset.version} • ${asset.downloads || 0} ${t("downloads", "Downloads")}`
            : `${asset.downloads || 0} ${t("downloads", "Downloads")}`,
          created_at: asset.created_at,
          kind: typeLower,
          targetTab: isChameleon && isDesktop() ? "chameleons" : "nexus",
          icon: isChameleon
            ? t("icon_palette", "palette")
            : isTemplate
              ? t("icon_data_object", "data_object")
              : t("icon_translate", "translate"),
          is_outdated: Boolean(asset.is_outdated),
        };
      }),
    ].slice(0, 3);

    const nextSnapshot: MasonCommandSnapshot = {
      stats: {
        artifacts: modsRes?.count ?? creatorMods.length,
        collections: collectionsRes?.count ?? (collectionsRes?.data?.length || 0),
        posts: postsRes?.count ?? creatorPosts.length,
        replies: repliesCount,
        bugs: openCreatorBugs.length,
        support: citizenSupportCount,
        followers: followersRes?.count || 0,
        blueprints: blueprintsRes?.count ?? (blueprintsRes?.data?.length || 0),
        chameleons: chameleons.length,
        lexicons: lexicons.length,
        templates: templates.length,
        flaggedAssets: brokenOrFlaggedMods + outdatedNexus,
      },
      broadcasts,
      urgentBroadcast,
      recentBugs: openCreatorBugs.slice(0, 3),
      recentArtifacts: creatorMods.slice(0, 3),
      recentReplies,
      recentStudioAssets: studioCards,
    };

    setSnapshot(nextSnapshot);
    setHubCommandCache("mason", cacheScope, nextSnapshot);
  }, [cacheScope, isVerifiedMason, masonId, t, userId]);

  useEffect(() => {
    const cached = getHubCommandCache<MasonCommandSnapshot>("mason", cacheScope);
    if (cached) setSnapshot(cached);
    refreshMasonDashboard();
  }, [cacheScope, refreshMasonDashboard]);

  const handleOpenReplyInPostViewer = async (rep: any) => {
    if (!rep?.post_id || !setViewingPost) return;
    const { data } = await supabase
      .from("mason_posts")
      .select("*")
      .eq("id", rep.post_id)
      .maybeSingle();
    if (data) {
      setViewingPost({ ...data, scrollToCommentId: rep.id });
    }
  };

  const { stats, broadcasts, urgentBroadcast, recentBugs, recentArtifacts, recentReplies, recentStudioAssets } =
    snapshot;
  const totalNexusAndAesthetics =
    stats.blueprints + stats.chameleons + stats.lexicons + stats.templates;

  return (
    <CommandScreenLayout>
      {/* 1. TOP STAT TILES */}
      <CommandScreenStats>
        {urgentBroadcast ? (
          <AlertStatTile
            broadcast={urgentBroadcast}
            active={true}
            onClick={() => setIsAlertsOpen(true)}
          />
        ) : isVerifiedMason ? (
          <DashboardStatTile
            icon={t("icon_deployed_code", "deployed_code")}
            value={stats.artifacts}
            label={t("term_mods", "{Mods}")}
            colorClass={stats.flaggedAssets > 0 ? "text-[var(--warning)]" : "theme-text-accent"}
            onClick={() => onNavigate("sandbox")}
          />
        ) : (
          <DashboardStatTile
            icon={t("icon_handyman", "handyman")}
            value={localSandboxCount}
            label={t("filter_dev", "Sandbox")}
            colorClass="theme-text-accent"
            onClick={() => onNavigate("sandbox")}
          />
        )}

        {isVerifiedMason ? (
          <>
            <DashboardStatTile
              icon={t("icon_bug_report", "bug_report")}
              value={stats.bugs}
              label={t("open_bug_reports", "Bug Reports")}
              colorClass={stats.bugs > 0 ? "text-[var(--danger)]" : "text-[var(--success)]"}
              onClick={() => {
                if (recentBugs[0]) {
                  setSelectedBugTicket(recentBugs[0]);
                } else {
                  onNavigate("bug_reports");
                }
              }}
            />
            <DashboardStatTile
              icon={t("icon_forum", "forum")}
              value={stats.replies}
              label={t("mason_replies_label", "Replies")}
              colorClass="theme-text-accent"
              onClick={() => onOpenRecentReplies && onOpenRecentReplies()}
            />
            <DashboardStatTile
              icon={t("icon_hub", "hub")}
              value={totalNexusAndAesthetics}
              label={t("nexus_and_aesthetics", "{Nexus} & Aesthetics")}
              colorClass="theme-text-accent"
              onClick={() => onNavigate("nexus")}
            />
            <DashboardStatTile
              icon={t("icon_confirmation_number", "confirmation_number")}
              value={stats.support}
              label={t("support_tickets", "Support Tickets")}
              colorClass="theme-text-accent"
              onClick={() => onOpenSupportDesk && onOpenSupportDesk()}
            />
          </>
        ) : (
          <>
            <DashboardStatTile
              icon={t("icon_map", "map")}
              value={stats.blueprints}
              label={t("term_blueprints", "{Blueprints}")}
              colorClass="theme-text-accent"
              onClick={() => onNavigate("nexus")}
            />
            <DashboardStatTile
              icon={t("icon_palette", "palette")}
              value={stats.chameleons}
              label={t("term_chameleons", "{Chameleons}")}
              colorClass="theme-text-accent"
              onClick={() => (isDesktop() ? onNavigate("chameleons") : onNavigate("nexus"))}
            />
            <DashboardStatTile
              icon={t("icon_translate", "translate")}
              value={stats.lexicons}
              label={t("term_lexicons", "{Lexicons}")}
              colorClass="theme-text-accent"
              onClick={() => onNavigate("nexus")}
            />
            <DashboardStatTile
              icon={t("icon_confirmation_number", "confirmation_number")}
              value={stats.support}
              label={t("support_tickets", "Support Tickets")}
              colorClass="theme-text-accent"
              onClick={() => onOpenSupportDesk && onOpenSupportDesk()}
            />
          </>
        )}
      </CommandScreenStats>

      {/* 2. BODY */}
      <CommandScreenBody>
        <CommandScreenMain>
          {/* System Broadcasts */}
          <div className="flex flex-col gap-4">
            <CommandScreenSectionHeading
              icon={t("icon_satellite_alt", "satellite_alt")}
              title={t("wf_tab_dispatch", "{Dispatches}")}
              subtitle={t("mason_broadcasts_sub", "Platform Advisories & Creator Updates")}
              onJump={() => setIsAlertsOpen(true)}
              jumpTooltip={t("sanctuary_alerts", "Sanctuary Alerts")}
            />
            <SystemBroadcastsGrid broadcasts={broadcasts} setViewingPost={setViewingPost} />
          </div>

          {/* Verified Mason: Open Bug Reports -> Opens TicketDossierSidePanel Directly */}
          {isVerifiedMason && (
            <div className="flex flex-col gap-4">
              <CommandScreenSectionHeading
                icon={t("icon_bug_report", "bug_report")}
                iconColorClass={stats.bugs > 0 ? "text-[var(--danger)]" : "text-[var(--success)]"}
                title={t("open_bug_reports", "Bug Reports")}
                subtitle={t("mason_bugs_sub", "Click any report to inspect diagnostics and reply in-drawer")}
                onJump={() => onNavigate("bug_reports")}
                jumpTooltip={`${t("open_bug_reports", "Bug Reports")} (${stats.bugs})`}
              />
              {recentBugs.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
                  {recentBugs.map((bug: any) => (
                    <UniversalCard
                      key={bug.id}
                      layout="vertical"
                      icon={t("icon_bug_report", "bug_report")}
                      title={bug.title || t("untitled", "Untitled")}
                      subtitle={bug.target_mod_name || t("artifact", "{Mod}")}
                      bannerTopLabel={String(bug.status || "OPEN").toUpperCase()}
                      bannerTopRightLabel={formatSanctuaryDate(bug.created_at, dateFormat)}
                      onClick={() => setSelectedBugTicket(bug)}
                      onContextMenu={(e) => {
                        const menuItems: SanctuaryContextMenuItem[] = [
                          {
                            label: t("view_ticket", "Inspect Ticket"),
                            icon: t("icon_receipt_long", "receipt_long"),
                            onClick: () => setSelectedBugTicket(bug),
                          },
                          ...(bug.target_mod_id || bug.metadata?.target_mod_id
                            ? [
                                {
                                  label: t("edit_metadata", "Edit {Mod} Metadata"),
                                  icon: t("icon_edit_note", "edit_note"),
                                  onClick: () =>
                                    onOpenMetadataEditor &&
                                    onOpenMetadataEditor(
                                      bug.target_mod_id || bug.metadata?.target_mod_id
                                    ),
                                },
                              ]
                            : []),
                          {
                            label: t("open_reports_section", "Open All Bug Reports"),
                            icon: t("icon_open_in_new", "open_in_new"),
                            onClick: () => onNavigate("bug_reports"),
                          },
                        ];
                        openSanctuaryContextMenu(e, menuItems);
                      }}
                      badges={
                        <>
                          <span className={`${VAULT_CHIP_CLASS} !text-[var(--danger)] !border-[color-mix(in_srgb,var(--danger)_35%,transparent)]`}>
                            <span className="material-symbols-outlined !text-[12px]">
                              {t("icon_bug_report", "bug_report")}
                            </span>
                            <span>{String(bug.status || "OPEN").toUpperCase()}</span>
                          </span>
                          {bug.target_mod_name && (
                            <span className={VAULT_CHIP_CLASS}>
                              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                {t("icon_extension", "extension")}
                              </span>
                              <span className="truncate max-w-[140px]">{bug.target_mod_name}</span>
                            </span>
                          )}
                        </>
                      }
                      footer={
                        <div className="flex items-center justify-between w-full">
                          <span className="text-[10px] font-black text-[var(--subtext)] opacity-60">
                            {formatSanctuaryDate(bug.created_at, dateFormat)}
                          </span>
                          <span className="text-[10px] font-black text-[var(--accent)] flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {t("view_ticket", "Inspect")}
                            <span className="material-symbols-outlined !text-[12px]">
                              {t("icon_arrow_forward", "arrow_forward")}
                            </span>
                          </span>
                        </div>
                      }
                    >
                      <p className="text-xs text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed">
                        {bug.description || t("no_description", "No description provided.")}
                      </p>
                    </UniversalCard>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={t("icon_check_circle", "check_circle")}
                  title={t("no_open_bug_reports", "Zero Open {Mod} Bug Reports")}
                />
              )}
            </div>
          )}

          {/* Verified Mason: Recent {Mods} -> Opens SharedMetadataEditorSidePanel Directly */}
          {isVerifiedMason && (
            <div className="flex flex-col gap-4">
              <CommandScreenSectionHeading
                icon={t("icon_deployed_code", "deployed_code")}
                title={t("recent_mods_heading", "Recent {Mods}")}
                subtitle={t("mason_recent_mods_sub", "Click any {mod} to edit cloud metadata directly")}
                onJump={() => onNavigate("sandbox")}
                jumpTooltip={`${t("term_mods", "{Mods}")} (${stats.artifacts})`}
              />
              {recentArtifacts.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
                  {recentArtifacts.map((art: any) => {
                    const stLower = String(art.status || "verified").toLowerCase();
                    const isWarn = ["under_review", "pending", "unverified"].includes(stLower);
                    const isBroken = ["broken", "corrupted", "blacklisted"].includes(stLower);
                    return (
                      <UniversalCard
                        key={art.id}
                        layout="vertical"
                        icon={t("icon_deployed_code", "deployed_code")}
                        title={art.name || t("untitled", "Untitled")}
                        subtitle={art.sub_type || art.category_override || t("artifact", "{Mod}")}
                        bannerTopLabel={art.latest_version || "1.0.0"}
                        bannerTopRightLabel={formatSanctuaryDate(
                          art.updated_at || art.created_at,
                          dateFormat
                        )}
                        onClick={() => onOpenMetadataEditor && onOpenMetadataEditor(art.id)}
                        onContextMenu={(e) =>
                          openSanctuaryContextMenu(e, [
                            {
                              label: t("edit_metadata", "Edit Metadata"),
                              icon: t("icon_edit_note", "edit_note"),
                              onClick: () => onOpenMetadataEditor && onOpenMetadataEditor(art.id),
                            },
                            {
                              label: t("open_dossier", "Open {Mod} Dossier"),
                              icon: t("icon_info", "info"),
                              onClick: () => openModDossier({ ...art, isNexusView: true }),
                            },
                            {
                              label: t("open_in_workshop", "Open {Mods} Workspace"),
                              icon: t("icon_open_in_new", "open_in_new"),
                              onClick: () => onNavigate("sandbox"),
                            },
                          ])
                        }
                        badges={
                          <>
                            <span
                              className={`${VAULT_CHIP_CLASS} ${
                                isBroken
                                  ? "!text-[var(--danger)] !border-[color-mix(in_srgb,var(--danger)_35%,transparent)]"
                                  : isWarn
                                    ? "!text-[var(--warning)] !border-[color-mix(in_srgb,var(--warning)_35%,transparent)]"
                                    : "!text-[var(--success)] !border-[color-mix(in_srgb,var(--success)_35%,transparent)]"
                              }`}
                            >
                              <span className="material-symbols-outlined !text-[12px]">
                                {isBroken
                                  ? t("icon_error", "error")
                                  : isWarn
                                    ? t("icon_schedule", "schedule")
                                    : t("icon_verified", "verified")}
                              </span>
                              <span>{stLower.replace(/_/g, " ")}</span>
                            </span>
                            {art.latest_version && (
                              <span className={VAULT_CHIP_CLASS}>{art.latest_version}</span>
                            )}
                          </>
                        }
                        footer={
                          <div className="flex items-center justify-between w-full">
                            <span className="text-[10px] font-black text-[var(--subtext)] opacity-60">
                              {formatSanctuaryDate(art.updated_at || art.created_at, dateFormat)}
                            </span>
                            <span className="text-[10px] font-black text-[var(--accent)] flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {t("edit_metadata", "Edit Metadata")}
                              <span className="material-symbols-outlined !text-[12px]">
                                {t("icon_edit_note", "edit_note")}
                              </span>
                            </span>
                          </div>
                        }
                      >
                        <p className="text-xs text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed">
                          {art.description
                            ? stripMarkdown(art.description)
                            : t("no_description", "No description provided.")}
                        </p>
                      </UniversalCard>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  icon={t("icon_deployed_code", "deployed_code")}
                  title={t("no_published_mods_yet", "No Published {Mods} Yet")}
                />
              )}
            </div>
          )}

          {/* Verified Mason: Recent Replies & {Dispatches} -> Opens MasonPostViewer Focused on Comment */}
          {isVerifiedMason && (
            <div className="flex flex-col gap-4">
              <CommandScreenSectionHeading
                icon={t("icon_forum", "forum")}
                title={t("recent_replies_dispatches", "Recent Replies & {Dispatches}")}
                subtitle={t("mason_replies_sub", "Click any reply to open the thread focused on that comment")}
                onJump={() => onNavigate("posts")}
                jumpTooltip={`${t("tab_posts", "{Dispatches}")} (${stats.replies})`}
              />
              {recentReplies.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
                  {recentReplies.map((rep: any) => (
                    <UniversalCard
                      key={rep.id}
                      layout="vertical"
                      icon={t("icon_chat", "chat")}
                      title={rep.author_name || t("citizen", "{Citizen}")}
                      subtitle={rep.post_title}
                      bannerTopLabel={t("reply", "Reply")}
                      bannerTopRightLabel={formatSanctuaryDate(rep.created_at, dateFormat)}
                      onClick={() => handleOpenReplyInPostViewer(rep)}
                      badges={
                        <span className={VAULT_CHIP_CLASS}>
                          <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                            {t("icon_edit_document", "edit_document")}
                          </span>
                          <span className="truncate max-w-[180px]">{rep.post_title}</span>
                        </span>
                      }
                      footer={
                        <div className="flex items-center justify-between w-full">
                          <span className="text-[10px] font-black text-[var(--subtext)] opacity-60">
                            {formatSanctuaryDate(rep.created_at, dateFormat)}
                          </span>
                          <span className="text-[10px] font-black text-[var(--accent)] flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {t("open_thread", "Open Thread")}
                            <span className="material-symbols-outlined !text-[12px]">
                              {t("icon_arrow_forward", "arrow_forward")}
                            </span>
                          </span>
                        </div>
                      }
                    >
                      <p className="text-xs text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed">
                        {stripMarkdown(rep.content || "")}
                      </p>
                    </UniversalCard>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={t("icon_forum", "forum")}
                  title={t("no_recent_replies", "No Recent Replies on Your {Dispatches}")}
                />
              )}
            </div>
          )}

          {/* Creator Studio, {Nexus} & Aesthetics (Mirrors Nexus, Aesthetics, Collections, Templates!) */}
          <div className="flex flex-col gap-4">
            <CommandScreenSectionHeading
              icon={t("icon_palette", "palette")}
              title={t("creator_studio_sections", "Creator Studio, {Nexus} & Aesthetics")}
              subtitle={t(
                "creator_studio_sections_sub",
                "Direct overview of your {Blueprints}, {Chameleons}, {Lexicons}, Templates, and Collections"
              )}
              onJump={() => onNavigate("nexus")}
              jumpTooltip={t("open_nexus_studio", "Open {Nexus} Studio")}
            />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
              <UniversalCard
                layout="vertical"
                icon={t("icon_hub", "hub")}
                title={t("nexus_publishing_card", "{Nexus} Assets & {Blueprints}")}
                subtitle={`${stats.blueprints} ${t("term_blueprints", "{Blueprints}")} • ${stats.templates} ${t("ql_templates", "Templates")}`}
                onClick={() => onNavigate("nexus")}
                badges={
                  <>
                    <span className={VAULT_CHIP_CLASS}>
                      <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                        {t("icon_map", "map")}
                      </span>
                      <span>{stats.blueprints} {t("term_blueprints", "{Blueprints}")}</span>
                    </span>
                    <span className={VAULT_CHIP_CLASS}>
                      <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                        {t("icon_data_object", "data_object")}
                      </span>
                      <span>{stats.templates} {t("ql_templates", "Templates")}</span>
                    </span>
                  </>
                }
                footer={
                  <span className="text-[10px] font-black text-[var(--accent)] flex items-center gap-1">
                    {t("open_nexus_studio", "Open {Nexus} Studio")}
                    <span className="material-symbols-outlined !text-[12px]">
                      {t("icon_arrow_forward", "arrow_forward")}
                    </span>
                  </span>
                }
              >
                <p className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed">
                  {t(
                    "nexus_publishing_card_desc",
                    "Publish and update community {Blueprints}, {Lexicon} packs, and Workbench Templates."
                  )}
                </p>
              </UniversalCard>

              <UniversalCard
                layout="vertical"
                icon={t("icon_palette", "palette")}
                title={t("aesthetics_studio_card", "Aesthetics & {Lexicon} Studio")}
                subtitle={`${stats.chameleons} ${t("term_chameleons", "{Chameleons}")} • ${stats.lexicons} ${t("term_lexicons", "{Lexicons}")}`}
                onClick={() => (isDesktop() ? onNavigate("chameleons") : onNavigate("nexus"))}
                badges={
                  <>
                    <span className={VAULT_CHIP_CLASS}>
                      <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                        {t("icon_palette", "palette")}
                      </span>
                      <span>{stats.chameleons} {t("term_chameleons", "{Chameleons}")}</span>
                    </span>
                    <span className={VAULT_CHIP_CLASS}>
                      <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                        {t("icon_translate", "translate")}
                      </span>
                      <span>{stats.lexicons} {t("term_lexicons", "{Lexicons}")}</span>
                    </span>
                  </>
                }
                footer={
                  <span className="text-[10px] font-black text-[var(--accent)] flex items-center gap-1">
                    {t("open_aesthetics_studio", "Open Aesthetics Studio")}
                    <span className="material-symbols-outlined !text-[12px]">
                      {t("icon_arrow_forward", "arrow_forward")}
                    </span>
                  </span>
                }
              >
                <p className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed">
                  {t(
                    "aesthetics_studio_card_desc",
                    "Craft custom glass {Chameleon} themes and sparse-delta {Lexicon} dialect overrides."
                  )}
                </p>
              </UniversalCard>

              {isVerifiedMason ? (
                <UniversalCard
                  layout="vertical"
                  icon={t("icon_collections_bookmark", "collections_bookmark")}
                  title={t("collections_dispatches_card", "Collections & {Dispatches}")}
                  subtitle={`${stats.collections} ${t("tab_collections", "Collections")} • ${stats.posts} ${t("tab_posts", "{Dispatches}")}`}
                  onClick={() => onNavigate("collections")}
                  badges={
                    <>
                      <span className={VAULT_CHIP_CLASS}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                          {t("icon_collections_bookmark", "collections_bookmark")}
                        </span>
                        <span>{stats.collections} {t("tab_collections", "Collections")}</span>
                      </span>
                      <span className={VAULT_CHIP_CLASS}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                          {t("icon_edit_document", "edit_document")}
                        </span>
                        <span>{stats.posts} {t("tab_posts", "{Dispatches}")}</span>
                      </span>
                    </>
                  }
                  footer={
                    <span className="text-[10px] font-black text-[var(--accent)] flex items-center gap-1">
                      {t("manage_collections", "Manage Collections")}
                      <span className="material-symbols-outlined !text-[12px]">
                        {t("icon_arrow_forward", "arrow_forward")}
                      </span>
                    </span>
                  }
                >
                  <p className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed">
                    {t(
                      "collections_dispatches_card_desc",
                      "Bundle curated {Mod} sets and broadcast release {dispatches} to your followers."
                    )}
                  </p>
                </UniversalCard>
              ) : (
                <UniversalCard
                  layout="vertical"
                  icon={t("icon_handyman", "handyman")}
                  title={t("local_sandbox_card", "Creator Sandbox")}
                  subtitle={`${localSandboxCount} ${t("term_mods", "{Mods}")}`}
                  onClick={() => onNavigate("sandbox")}
                  badges={
                    <span className={VAULT_CHIP_CLASS}>
                      <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                        {t("icon_handyman", "handyman")}
                      </span>
                      <span>{localSandboxCount} {t("term_mods", "{Mods}")}</span>
                    </span>
                  }
                  footer={
                    <span className="text-[10px] font-black text-[var(--accent)] flex items-center gap-1">
                      {t("open_sandbox", "Open Sandbox")}
                      <span className="material-symbols-outlined !text-[12px]">
                        {t("icon_arrow_forward", "arrow_forward")}
                      </span>
                    </span>
                  }
                >
                  <p className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed">
                    {t(
                      "local_sandbox_card_desc",
                      "Test local {mods}, inspect binary headers, and stage creator packages."
                    )}
                  </p>
                </UniversalCard>
              )}
            </div>

            {recentStudioAssets.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full pt-2">
                {recentStudioAssets.map((item: any) => (
                  <UniversalCard
                    key={`${item.kind}-${item.id}`}
                    layout="vertical"
                    icon={item.icon}
                    title={item.title}
                    subtitle={item.subtitle}
                    bannerTopLabel={item.subtitle}
                    bannerTopRightLabel={formatSanctuaryDate(item.created_at, dateFormat)}
                    onClick={() => onNavigate(item.targetTab)}
                    badges={
                      item.is_outdated ? (
                        <span className={`${VAULT_CHIP_CLASS} !text-[var(--warning)] !border-[color-mix(in_srgb,var(--warning)_40%,transparent)]`}>
                          <span className="material-symbols-outlined !text-[12px]">
                            {t("icon_update", "update")}
                          </span>
                          <span>{t("outdated", "Outdated")}</span>
                        </span>
                      ) : undefined
                    }
                  >
                    <p className="text-xs text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed">
                      {item.description}
                    </p>
                  </UniversalCard>
                ))}
              </div>
            )}
          </div>
        </CommandScreenMain>

        {/* 3. QUICK OPERATIONS SIDEBAR + 2x3 HUB METRICS */}
        <CommandScreenSidebar
          title={t("command_operations", "Command Operations")}
          icon={t("icon_bolt", "bolt")}
          metricsSubtitle={t("mason_metrics_sub", "Live Creator Footprint Across This Workspace")}
          metrics={
            <>
              <CommandScreenMetricTile
                icon={isVerifiedMason ? t("icon_deployed_code", "deployed_code") : t("icon_handyman", "handyman")}
                value={isVerifiedMason ? stats.artifacts : localSandboxCount}
                label={isVerifiedMason ? t("term_mods", "{Mods}") : t("filter_dev", "Sandbox")}
                onClick={() => onNavigate("sandbox")}
              />
              <CommandScreenMetricTile
                icon={
                  isVerifiedMason
                    ? t("icon_collections_bookmark", "collections_bookmark")
                    : t("icon_data_object", "data_object")
                }
                value={isVerifiedMason ? stats.collections : stats.templates}
                label={
                  isVerifiedMason
                    ? t("tab_collections", "Collections")
                    : t("ql_templates", "Templates")
                }
                onClick={() => onNavigate(isVerifiedMason ? "collections" : "nexus")}
              />
              <CommandScreenMetricTile
                icon={t("icon_map", "map")}
                value={stats.blueprints}
                label={t("term_blueprints", "{Blueprints}")}
                onClick={() => onNavigate("nexus")}
              />
              <CommandScreenMetricTile
                icon={t("icon_palette", "palette")}
                value={isVerifiedMason ? stats.chameleons + stats.lexicons : stats.chameleons}
                label={isVerifiedMason ? t("tab_aesthetics", "Aesthetics") : t("term_chameleons", "{Chameleons}")}
                onClick={() => (isDesktop() ? onNavigate("chameleons") : onNavigate("nexus"))}
              />
              <CommandScreenMetricTile
                icon={
                  isVerifiedMason
                    ? t("icon_edit_document", "edit_document")
                    : t("icon_translate", "translate")
                }
                value={isVerifiedMason ? stats.posts : stats.lexicons}
                label={isVerifiedMason ? t("tab_posts", "{Dispatches}") : t("term_lexicons", "{Lexicons}")}
                onClick={() => onNavigate(isVerifiedMason ? "posts" : "nexus")}
              />
              <CommandScreenMetricTile
                icon={
                  isVerifiedMason
                    ? t("icon_groups", "groups")
                    : t("icon_confirmation_number", "confirmation_number")
                }
                value={isVerifiedMason ? stats.followers : stats.support}
                label={isVerifiedMason ? t("followers", "Followers") : t("support_tickets", "Support Tickets")}
                onClick={
                  isVerifiedMason
                    ? onViewProfile || (() => onNavigate("posts"))
                    : () => onOpenSupportDesk && onOpenSupportDesk()
                }
              />
            </>
          }
        >
          <CommandScreenQuickLink
            icon={t("icon_campaign", "campaign")}
            title={t("sanctuary_alerts", "Sanctuary Alerts")}
            subtitle={
              urgentBroadcast
                ? t("urgent_alert_active", "Urgent Alert Active")
                : t("view_active_advisories", "View Platform Advisories")
            }
            isAlert={Boolean(urgentBroadcast)}
            onClick={() => setIsAlertsOpen(true)}
          />
          {onOpenNotepad && (
            <CommandScreenQuickLink
              icon={t("icon_description", "description")}
              title={t("ui_btn_notepad", "Creator Notepad")}
              subtitle={t("mason_notepad_sub", "Scratchpad & Release Checklists")}
              onClick={onOpenNotepad}
            />
          )}
          {isVerifiedMason && onOpenRecentReplies && (
            <CommandScreenQuickLink
              icon={t("icon_forum", "forum")}
              title={t("recent_replies_drawer", "Recent Replies")}
              subtitle={`${stats.replies} ${t("comments_on_dispatches", "Comments on Your {Dispatches}")}`}
              onClick={onOpenRecentReplies}
            />
          )}
          {onOpenSupportDesk && (
            <CommandScreenQuickLink
              icon={t("icon_confirmation_number", "confirmation_number")}
              title={t("support_desk", "Support Desk")}
              subtitle={t("open_support_drawer_sub", "Manage Your Support Tickets")}
              onClick={onOpenSupportDesk}
            />
          )}
          {isVerifiedMason && onOpenCreatorSettings && (
            <CommandScreenQuickLink
              icon={t("icon_settings", "settings")}
              title={t("masonhub_settings_title", "{Mason} {Settings}")}
              subtitle={t("creator_profile_links_sub", "Bio, Links & Creator Preferences")}
              onClick={onOpenCreatorSettings}
            />
          )}
          {isVerifiedMason && onViewProfile && (
            <CommandScreenQuickLink
              icon={t("icon_visibility", "visibility")}
              title={t("btn_view_profile", "Public {Mason} Profile")}
              subtitle={`${stats.followers} ${t("followers", "Followers")}`}
              onClick={onViewProfile}
            />
          )}
        </CommandScreenSidebar>
      </CommandScreenBody>

      {/* DIRECT SIDE PANELS */}
      <SanctuaryAlertsSidePanel
        isOpen={isAlertsOpen}
        onClose={() => setIsAlertsOpen(false)}
      />

      <TicketDossierSidePanel
        isOpen={Boolean(selectedBugTicket)}
        onClose={() => setSelectedBugTicket(null)}
        ticket={selectedBugTicket}
        tableName="sanctuary_tickets"
        canReply={true}
        currentUserId={userId}
        availableActions={["RESOLVED", "REJECTED", "ESCALATED", "PENDING"]}
        onEditMetadata={(hashOrId) => {
          setSelectedBugTicket(null);
          if (onOpenMetadataEditor) onOpenMetadataEditor(hashOrId);
        }}
        onClaim={async () => {
          const updated = await claimOrReleaseHubTicket({
            ticket: selectedBugTicket,
            currentUserId: userId,
            claim: true,
            t,
          });
          if (updated) {
            setSelectedBugTicket(updated);
            refreshMasonDashboard();
          }
        }}
        onRelease={async () => {
          const updated = await claimOrReleaseHubTicket({
            ticket: selectedBugTicket,
            currentUserId: userId,
            claim: false,
            t,
          });
          if (updated) {
            setSelectedBugTicket(updated);
            refreshMasonDashboard();
          }
        }}
        onReplyAdded={() => refreshMasonDashboard()}
        onTakeAction={async (actionType, reason) => {
          const ok = await executeHubTicketAction({
            ticket: selectedBugTicket,
            actionType,
            reason,
            actorRole: "mason",
            t,
          });
          if (ok) {
            setSelectedBugTicket(null);
            refreshMasonDashboard();
          }
        }}
      />
    </CommandScreenLayout>
  );
}
