import React, { useState, useEffect, useCallback, Suspense } from "react";
import { supabase, supabaseAuth } from "../../supabase";
import { useLexicon } from "../../LexiconContext";
import { useStore } from "../../store";
import { SanctuaryAlertsSidePanel } from "../../side-panels/SanctuaryAlertsSidePanel";
import { ServerHealthSidePanel } from "../../side-panels/WayfinderSidePanels";
import WayfinderKeeperSidePanel from "../../side-panels/WayfinderKeeperSidePanel";
import TicketDossierSidePanel from "../../side-panels/TicketDossierSidePanel";
import {
  CommandMalwareManifestSidePanel,
  CommandComplianceReviewSidePanel,
  CommandReportResolutionSidePanel,
} from "../../side-panels/HubCommandQuickPanels";
import { EmptyState, VAULT_CHIP_CLASS } from "../../shared";
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
import { formatSanctuaryDate } from "../../utils/dateUtils";
import {
  getHubCommandCache,
  setHubCommandCache,
  isTicketOpenStatus,
  buildTicketModLookupMap,
  routeSpokeTicketsForRole,
  executeHubTicketAction,
  claimOrReleaseHubTicket,
} from "../../utils/hubCommandCache";

const MasonPostViewer = React.lazy(() => import("../../side-panels/MasonPostViewer"));
const AuditLogViewer = React.lazy(() =>
  import("../../side-panels/SAAuditLogViewer").then((m) => ({
    default: m.AuditLogViewer,
  }))
);

interface WayfinderCommandSnapshot {
  stats: {
    tickets: number;
    complianceFlags: number;
    pendingCompliance: number;
    malwareTotal: number;
    pendingManifests: number;
    reportQueue: number;
    citizens: number;
    masons: number;
    staff: number;
    spokeThemes: number;
    spokeLexicons: number;
    auditLogs: number;
    networkLatency: number;
    networkStatus: string;
  };
  broadcasts: any[];
  urgentBroadcast: any | null;
  recentSupport: any[];
  recentMalware: any[];
  recentCompliance: any[];
  recentReports: any[];
}

const DEFAULT_WAYFINDER_SNAPSHOT: WayfinderCommandSnapshot = {
  stats: {
    tickets: 0,
    complianceFlags: 0,
    pendingCompliance: 0,
    malwareTotal: 0,
    pendingManifests: 0,
    reportQueue: 0,
    citizens: 0,
    masons: 0,
    staff: 0,
    spokeThemes: 0,
    spokeLexicons: 0,
    auditLogs: 0,
    networkLatency: 0,
    networkStatus: "ONLINE",
  },
  broadcasts: [],
  urgentBroadcast: null,
  recentSupport: [],
  recentMalware: [],
  recentCompliance: [],
  recentReports: [],
};

export function WayfinderCommandScreen({
  setTab,
  setComplianceFilter,
  onOpenMasonProfile,
  onOpenDefcon,
  onOpenVerifyHash,
  onOpenManualFlag,
  onOpenMetadataEditor,
}: any) {
  const { t } = useLexicon();
  const session = useStore((s) => s.session);
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);
  const activeGameSchema = useStore((s) => s.activeGameSchema);
  const defconLevel = useStore((s) => s.defconLevel);
  const dateFormat = useStore((s) => s.dateFormat);

  const userId = session?.user?.id || "";
  const cacheScope = `${activeWorkspaceId || "global"}:${userId || "anon"}`;

  const [snapshot, setSnapshot] = useState<WayfinderCommandSnapshot>(
    () =>
      getHubCommandCache<WayfinderCommandSnapshot>("wayfinder", cacheScope) ||
      DEFAULT_WAYFINDER_SNAPSHOT
  );

  const [healthOpen, setHealthOpen] = useState(false);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [isKeeperSupportOpen, setIsKeeperSupportOpen] = useState(false);
  const [isAuditDrawerOpen, setIsAuditDrawerOpen] = useState(false);
  const [viewingPost, setViewingPost] = useState<any | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [selectedManifest, setSelectedManifest] = useState<any | null>(null);
  const [selectedComplianceMod, setSelectedComplianceMod] = useState<any | null>(null);
  const [selectedReport, setSelectedReport] = useState<any | null>(null);

  const schemaVersion = Number(activeGameSchema?.schema_version || 1);
  const schemaExtensionsCount = Array.isArray(activeGameSchema?.file_extensions)
    ? activeGameSchema.file_extensions.length
    : 0;
  const schemaRoutesCount = Array.isArray(activeGameSchema?.install_routes)
    ? activeGameSchema.install_routes.length
    : 0;

  const refreshWayfinderDashboard = useCallback(async () => {
    const pingStart = Date.now();
    const [
      hubBroadcastsRes,
      spokeBroadcastsRes,
      hubUrgentRes,
      spokeUrgentRes,
      ticketsRes,
      categoriesRes,
      complianceModsRes,
      pendingComplianceRes,
      tier5ModsRes,
      malwareReportsRes,
      nexusReportsRes,
      blueprintReportsRes,
      contentFlagsRes,
      citizensRes,
      masonsRes,
      staffRes,
      spokeThemesRes,
      spokeLexiconsRes,
      auditLogsRes,
    ] = await Promise.all([
      supabaseAuth
        .from("keeper_system_broadcasts")
        .select("*")
        .eq("is_active", true)
        .in("category", ["Update", "Info", "Event", "System"])
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("system_broadcasts")
        .select("*")
        .eq("is_active", true)
        .in("category", ["Update", "Info", "Event", "System"])
        .order("created_at", { ascending: false })
        .limit(10),
      supabaseAuth
        .from("keeper_system_broadcasts")
        .select("*")
        .eq("is_active", true)
        .in("is_pinned", ["true", "True", true] as any)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("system_broadcasts")
        .select("*")
        .eq("is_active", true)
        .in("is_pinned", ["true", "True", true] as any)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("sanctuary_tickets")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase.from("support_categories").select("*"),
      supabase
        .from("mods")
        .select("id, name, master_author, status, status_reason, compliance_tier, updated_at, created_at", {
          count: "exact",
        })
        .gte("compliance_tier", 1)
        .lte("compliance_tier", 4)
        .order("updated_at", { ascending: false })
        .limit(6),
      supabase
        .from("mods")
        .select("id, name, master_author, status, status_reason, compliance_tier, updated_at, created_at", {
          count: "exact",
        })
        .gte("compliance_tier", 1)
        .lte("compliance_tier", 4)
        .in("status", ["pending", "under_review", "unverified"])
        .order("updated_at", { ascending: false })
        .limit(6),
      supabase
        .from("mods")
        .select("id", { count: "exact", head: true })
        .eq("compliance_tier", 5),
      supabase
        .from("malware_reports")
        .select("*", { count: "exact" })
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(6),
      supabase
        .from("nexus_reports")
        .select("*, nexus_assets(id, name, asset_type)")
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      supabase
        .from("blueprint_reports")
        .select("*, blueprints(id, name)")
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      supabase
        .from("content_flags")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase
        .from("masons")
        .select("id", { count: "exact", head: true })
        .eq("is_verified", true),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .in("role", ["architect", "senior_architect", "oversight", "wayfinder"]),
      supabase.from("sanctuary_themes").select("id", { count: "exact", head: true }),
      supabase.from("sanctuary_lexicons").select("id", { count: "exact", head: true }),
      supabase.from("audit_logs").select("id", { count: "exact", head: true }),
    ]);

    const latency = Date.now() - pingStart;

    const matchesWayfinderAudience = (p: any) => {
      const aud = p?.target_audience;
      if (!aud || (Array.isArray(aud) && aud.length === 0)) return true;
      const arr = Array.isArray(aud) ? aud.map(String) : [String(aud)];
      return (
        arr.includes("All") ||
        arr.includes("Wayfinder") ||
        arr.includes("Spoke Wayfinders")
      );
    };

    const mergedBroadcasts = [
      ...(hubBroadcastsRes?.data || []),
      ...(spokeBroadcastsRes?.data || []),
    ]
      .filter(matchesWayfinderAudience)
      .sort(
        (a, b) =>
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      )
      .slice(0, 3);

    let urgentBroadcast =
      [...(hubUrgentRes?.data || []), ...(spokeUrgentRes?.data || [])].find(
        matchesWayfinderAudience
      ) || null;
    const dismissedAlertId = sessionStorage.getItem("dismissedAlertId");
    if (urgentBroadcast && String(urgentBroadcast.id) === dismissedAlertId) {
      urgentBroadcast = null;
    }

    // 1:1 Wayfinder Support Queue (case-insensitive + targeted/escalated parity)
    const rawOpenTickets = (ticketsRes?.data || []).filter((tk: any) =>
      isTicketOpenStatus(tk.status)
    );
    const modLookup = await buildTicketModLookupMap(rawOpenTickets);
    const wayfinderTickets = routeSpokeTicketsForRole(
      rawOpenTickets,
      categoriesRes?.data || [],
      modLookup,
      "wayfinder",
      userId
    );

    const unifiedReports: any[] = [
      ...(nexusReportsRes?.data || []).map((r: any) => ({
        id: r.id,
        source: "nexus",
        status: r.status,
        title: r.nexus_assets?.name || t("unknown_asset", "Unknown Asset"),
        reason: r.reason,
        reporter_name: r.reporter_name,
        target_id: r.asset_id,
        created_at: r.created_at,
      })),
      ...(blueprintReportsRes?.data || []).map((r: any) => ({
        id: r.id,
        source: "blueprint",
        status: r.status,
        title: r.blueprints?.name || t("term_blueprint", "{Blueprint}"),
        reason: r.reason,
        reporter_name: r.reporter_name,
        target_id: r.blueprint_id,
        created_at: r.created_at,
      })),
      ...(contentFlagsRes?.data || []).map((r: any) => ({
        id: r.id,
        source: "comm-link",
        content_type: r.content_type,
        status: r.status,
        title:
          r.content_type === "comment"
            ? t("flagged_comment", "Flagged Comment")
            : t("flagged_dispatch", "Flagged {Dispatch}"),
        reason: r.reason,
        reporter_name: r.reporter_name,
        target_id: r.target_id,
        created_at: r.created_at,
      })),
    ].sort(
      (a, b) =>
        new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );

    const pendingManifests =
      malwareReportsRes?.count ?? (malwareReportsRes?.data?.length || 0);
    const tier5Count = tier5ModsRes?.count || 0;
    const pendingComplianceCount =
      pendingComplianceRes?.count ?? (pendingComplianceRes?.data?.length || 0);

    const seenComplianceIds = new Set<string>();
    const prioritizedCompliance: any[] = [];
    [...(pendingComplianceRes?.data || []), ...(complianceModsRes?.data || [])].forEach(
      (mod: any) => {
        if (!mod?.id || seenComplianceIds.has(String(mod.id))) return;
        seenComplianceIds.add(String(mod.id));
        prioritizedCompliance.push(mod);
      }
    );

    const nextSnapshot: WayfinderCommandSnapshot = {
      stats: {
        tickets: wayfinderTickets.length,
        complianceFlags:
          complianceModsRes?.count ?? (complianceModsRes?.data?.length || 0),
        pendingCompliance: pendingComplianceCount,
        malwareTotal: tier5Count + pendingManifests,
        pendingManifests,
        reportQueue: unifiedReports.length,
        citizens: citizensRes?.count || 0,
        masons: masonsRes?.count || 0,
        staff: staffRes?.count || 0,
        spokeThemes: spokeThemesRes?.count || 0,
        spokeLexicons: spokeLexiconsRes?.count || 0,
        auditLogs: auditLogsRes?.count || 0,
        networkLatency: latency,
        networkStatus: latency > 5000 ? "DEGRADED" : "ONLINE",
      },
      broadcasts: mergedBroadcasts,
      urgentBroadcast,
      recentSupport: wayfinderTickets.slice(0, 3),
      recentMalware: (malwareReportsRes?.data || []).slice(0, 3),
      recentCompliance: prioritizedCompliance.slice(0, 3),
      recentReports: unifiedReports.slice(0, 3),
    };

    setSnapshot(nextSnapshot);
    setHubCommandCache("wayfinder", cacheScope, nextSnapshot);
  }, [cacheScope, t, userId]);

  useEffect(() => {
    const cached = getHubCommandCache<WayfinderCommandSnapshot>("wayfinder", cacheScope);
    if (cached) setSnapshot(cached);
    refreshWayfinderDashboard();
  }, [cacheScope, refreshWayfinderDashboard]);

  const {
    stats,
    broadcasts,
    urgentBroadcast,
    recentSupport,
    recentMalware,
    recentCompliance,
    recentReports,
  } = snapshot;

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
        ) : (
          <DashboardStatTile
            icon={t("icon_dns", "dns")}
            number={`${stats.networkLatency}ms`}
            label={t("spoke_health_tile", "Spoke Health")}
            colorClass={
              stats.networkStatus === "ONLINE"
                ? "text-[var(--success)]"
                : "text-[var(--warning)]"
            }
            onClick={() => setHealthOpen(true)}
          />
        )}
        <DashboardStatTile
          icon={t("icon_local_activity", "local_activity")}
          value={stats.tickets}
          label={t("support_queue", "Support Queue")}
          colorClass={stats.tickets > 0 ? "text-[var(--danger)]" : "text-[var(--success)]"}
          onClick={() => setTab("sanctuary_tickets")}
        />
        <DashboardStatTile
          icon={t("icon_policy", "policy")}
          value={stats.complianceFlags}
          label={t("tab_compliance", "Compliance")}
          colorClass={stats.complianceFlags > 0 ? "text-[var(--warning)]" : "theme-text-accent"}
          onClick={() => {
            if (setComplianceFilter) setComplianceFilter("overview");
            setTab("compliance");
          }}
        />
        <DashboardStatTile
          icon={t("icon_coronavirus", "coronavirus")}
          value={stats.malwareTotal}
          label={t("malware_manifests", "Malware & Manifests")}
          colorClass={stats.malwareTotal > 0 ? "text-[var(--danger)]" : "text-[var(--success)]"}
          onClick={() => {
            if (setComplianceFilter) setComplianceFilter("overview");
            setTab("malware_oversight");
          }}
        />
        <DashboardStatTile
          icon={t("icon_flag", "flag")}
          value={stats.reportQueue}
          label={t("nexus_reports", "{Nexus} Reports")}
          colorClass={stats.reportQueue > 0 ? "text-[var(--danger)]" : "theme-text-accent"}
          onClick={() => setTab("reports")}
        />
      </CommandScreenStats>

      {/* 2. BODY */}
      <CommandScreenBody>
        <CommandScreenMain>
          {/* Keepers Core & Spoke Dispatches */}
          <div className="flex flex-col gap-4">
            <CommandScreenSectionHeading
              icon={t("icon_satellite_alt", "satellite_alt")}
              title={t("wf_tab_dispatch", "{Dispatches}")}
              subtitle={t("wayfinder_broadcasts_sub", "Keepers Core Directives & Spoke Broadcasts")}
              onJump={() => setTab("wf_comms_title")}
              jumpTooltip={t("wf_tab_dispatch", "{Dispatches}")}
            />
            <SystemBroadcastsGrid broadcasts={broadcasts} setViewingPost={setViewingPost} />
          </div>

          {/* Spoke Control & Spoke Aesthetics Overview (Mirrors Master Schemas, Uplink, Chameleons & Lexicons!) */}
          <div className="flex flex-col gap-4">
            <CommandScreenSectionHeading
              icon={t("icon_data_object", "data_object")}
              title={t("spoke_control_and_aesthetics_heading", "Spoke Control & Spoke Aesthetics")}
              subtitle={t(
                "spoke_control_and_aesthetics_sub",
                "Master Schema architecture, non-custodial Spoke sovereignty, and Spoke {Chameleon} / {Lexicon} packs"
              )}
              onJump={() => setTab("ide")}
              jumpTooltip={t("wf_tab_spoke_control", "Spoke Control")}
            />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
              <UniversalCard
                layout="vertical"
                icon={t("icon_data_object", "data_object")}
                title={t("master_schema_studio_card", "Master Schema Studio")}
                subtitle={`v${schemaVersion} • ${schemaExtensionsCount} ${t("extensions", "Extensions")} • ${schemaRoutesCount} ${t("routes", "Routes")}`}
                onClick={() => setTab("schemas")}
                badges={
                  <>
                    <span className={VAULT_CHIP_CLASS}>
                      <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                        {t("icon_verified", "verified")}
                      </span>
                      <span>v{schemaVersion}</span>
                    </span>
                    <span className={VAULT_CHIP_CLASS}>
                      <span>{schemaExtensionsCount} {t("extensions", "Extensions")}</span>
                    </span>
                  </>
                }
                footer={
                  <span className="text-[10px] font-black text-[var(--accent)] flex items-center gap-1">
                    {t("open_wayfinder_ide", "Open Master Schema IDE")}
                    <span className="material-symbols-outlined !text-[12px]">
                      {t("icon_arrow_forward", "arrow_forward")}
                    </span>
                  </span>
                }
              >
                <p className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed">
                  {t(
                    "master_schema_studio_card_desc",
                    "Configure engine binaries, install routes, load-order strategy, cache targets, and exception rules."
                  )}
                </p>
              </UniversalCard>

              <UniversalCard
                layout="vertical"
                icon={t("icon_palette", "palette")}
                title={t("wf_tab_spoke_aesthetics", "Spoke Aesthetics")}
                subtitle={`${stats.spokeThemes} ${t("term_chameleons", "{Chameleons}")} • ${stats.spokeLexicons} ${t("term_lexicons", "{Lexicons}")}`}
                onClick={() => setTab("chameleons")}
                badges={
                  <>
                    <span className={VAULT_CHIP_CLASS}>
                      <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                        {t("icon_palette", "palette")}
                      </span>
                      <span>{stats.spokeThemes} {t("term_chameleons", "{Chameleons}")}</span>
                    </span>
                    <span className={VAULT_CHIP_CLASS}>
                      <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                        {t("icon_translate", "translate")}
                      </span>
                      <span>{stats.spokeLexicons} {t("term_lexicons", "{Lexicons}")}</span>
                    </span>
                  </>
                }
                footer={
                  <span className="text-[10px] font-black text-[var(--accent)] flex items-center gap-1">
                    {t("open_spoke_aesthetics", "Open Spoke Aesthetics")}
                    <span className="material-symbols-outlined !text-[12px]">
                      {t("icon_arrow_forward", "arrow_forward")}
                    </span>
                  </span>
                }
              >
                <p className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed">
                  {t(
                    "spoke_aesthetics_card_desc",
                    "Curate official Spoke {Chameleon} themes and sparse-delta {Lexicon} terminology overrides."
                  )}
                </p>
              </UniversalCard>

              <UniversalCard
                layout="vertical"
                icon={t("icon_volunteer_activism", "volunteer_activism")}
                title={t("spoke_sovereignty_card", "Spoke Uplink & Community Funding")}
                subtitle={`${stats.networkStatus} (${stats.networkLatency}ms)`}
                onClick={() => setTab("ide")}
                badges={
                  <span className={`${VAULT_CHIP_CLASS} !text-[var(--success)] !border-[color-mix(in_srgb,var(--success)_35%,transparent)]`}>
                    <span className="material-symbols-outlined !text-[12px]">
                      {t("icon_check_circle", "check_circle")}
                    </span>
                    <span>{stats.networkStatus}</span>
                  </span>
                }
                footer={
                  <span className="text-[10px] font-black text-[var(--accent)] flex items-center gap-1">
                    {t("open_spoke_control", "Open Spoke Control")}
                    <span className="material-symbols-outlined !text-[12px]">
                      {t("icon_arrow_forward", "arrow_forward")}
                    </span>
                  </span>
                }
              >
                <p className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed">
                  {t(
                    "spoke_sovereignty_card_desc",
                    "Manage Spoke database uplink credentials, 0%-fee community donations, and sovereignty controls."
                  )}
                </p>
              </UniversalCard>
            </div>
          </div>

          {/* Support Queue -> Opens TicketDossierSidePanel Directly */}
          <div className="flex flex-col gap-4">
            <CommandScreenSectionHeading
              icon={t("icon_local_activity", "local_activity")}
              iconColorClass={stats.tickets > 0 ? "text-[var(--danger)]" : "text-[var(--success)]"}
              title={t("support_queue", "Support Queue")}
              subtitle={t("wayfinder_support_sub", "Wayfinder-targeted & escalated dossiers — click to inspect in-drawer")}
              onJump={() => setTab("sanctuary_tickets")}
              jumpTooltip={`${t("support_queue", "Support Queue")} (${stats.tickets})`}
            />
            {recentSupport.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
                {recentSupport.map((tk: any) => (
                  <UniversalCard
                    key={tk.id}
                    layout="vertical"
                    icon={t("icon_local_activity", "local_activity")}
                    title={tk.title || t("support_ticket", "Support Ticket")}
                    subtitle={(tk.ticket_type || tk.category || t("general", "General")).replace(/_/g, " ")}
                    bannerTopLabel={String(tk.status || "OPEN").toUpperCase()}
                    bannerTopRightLabel={formatSanctuaryDate(tk.created_at, dateFormat)}
                    onClick={() => setSelectedTicket(tk)}
                    badges={
                      <span className={`${VAULT_CHIP_CLASS} !text-[var(--danger)] !border-[color-mix(in_srgb,var(--danger)_35%,transparent)]`}>
                        <span className="material-symbols-outlined !text-[12px]">
                          {t("icon_confirmation_number", "confirmation_number")}
                        </span>
                        <span>{String(tk.status || "OPEN").toUpperCase()}</span>
                      </span>
                    }
                    footer={
                      <span className="text-[10px] font-black text-[var(--accent)] flex items-center gap-1">
                        {t("view_ticket", "Inspect Ticket")}
                        <span className="material-symbols-outlined !text-[12px]">
                          {t("icon_arrow_forward", "arrow_forward")}
                        </span>
                      </span>
                    }
                  >
                    <p className="text-xs text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed">
                      {tk.description || t("no_description", "No description provided.")}
                    </p>
                  </UniversalCard>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={t("icon_check_circle", "check_circle")}
                title={t("support_queue_clear", "Support Queue Clear")}
              />
            )}
          </div>

          {/* Malware, Compliance & {Nexus} Reports -> All Open SidePanels Directly */}
          <div className="flex flex-col gap-4">
            <CommandScreenSectionHeading
              icon={t("icon_security", "security")}
              title={t("spoke_security_compliance_heading", "Malware Manifests, Compliance & Reports")}
              subtitle={t(
                "spoke_security_compliance_sub",
                "Click any threat manifest, compliance item, or content report to review in-drawer"
              )}
              onJump={() => {
                if (setComplianceFilter) {
                  setComplianceFilter(stats.pendingCompliance > 0 ? "pending" : "overview");
                }
                setTab("compliance");
              }}
              jumpTooltip={t("tab_compliance", "Compliance")}
            />
            {recentMalware.length === 0 &&
            recentCompliance.length === 0 &&
            recentReports.length === 0 ? (
              <EmptyState
                icon={t("icon_verified_user", "verified_user")}
                title={t("spoke_queues_all_clear", "Zero Pending Malware or Moderation Alerts")}
              />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
                {recentMalware.slice(0, 2).map((item: any) => {
                  const targetLabel =
                    item.mod_name ||
                    item.file_name ||
                    (item.detected_hash ? String(item.detected_hash).substring(0, 14) : "") ||
                    t("threat_manifest", "Threat Manifest");
                  return (
                    <UniversalCard
                      key={`mw-${item.id}`}
                      layout="vertical"
                      icon={t("icon_coronavirus", "coronavirus")}
                      title={targetLabel}
                      subtitle={item.matched_rule || t("malware_manifests", "Threat Manifest")}
                      bannerTopLabel={t("rating_malware", "Malware")}
                      bannerTopRightLabel={formatSanctuaryDate(item.created_at, dateFormat)}
                      onClick={() => setSelectedManifest(item)}
                      badges={
                        <span className={`${VAULT_CHIP_CLASS} !text-[var(--danger)] !border-[color-mix(in_srgb,var(--danger)_35%,transparent)]`}>
                          <span className="material-symbols-outlined !text-[12px]">
                            {t("icon_warning", "warning")}
                          </span>
                          <span>{t("threat_manifest", "Manifest")}</span>
                        </span>
                      }
                    >
                      <p className="text-xs text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed">
                        {item.reason || item.matched_pattern || item.detected_hash}
                      </p>
                    </UniversalCard>
                  );
                })}

                {recentCompliance.slice(0, 2).map((mod: any) => (
                  <UniversalCard
                    key={`comp-${mod.id}`}
                    layout="vertical"
                    icon={t("icon_policy", "policy")}
                    title={mod.name || t("unknown", "Unknown")}
                    subtitle={mod.master_author || t("artifact", "{Mod}")}
                    bannerTopLabel={`${t("stat_tier", "Tier")} ${mod.compliance_tier}`}
                    bannerTopRightLabel={formatSanctuaryDate(
                      mod.updated_at || mod.created_at,
                      dateFormat
                    )}
                    onClick={() => setSelectedComplianceMod(mod)}
                    badges={
                      <span className={`${VAULT_CHIP_CLASS} !text-[var(--warning)] !border-[color-mix(in_srgb,var(--warning)_35%,transparent)]`}>
                        <span className="material-symbols-outlined !text-[12px]">
                          {t("icon_policy", "policy")}
                        </span>
                        <span>
                          {t("stat_tier", "Tier")} {mod.compliance_tier}
                        </span>
                      </span>
                    }
                  >
                    <p className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed">
                      {`${t("status", "Status")}: ${String(mod.status || "verified")}`}
                    </p>
                  </UniversalCard>
                ))}

                {recentReports.slice(0, 2).map((rep: any) => (
                  <UniversalCard
                    key={`rep-${rep.source}-${rep.id}`}
                    layout="vertical"
                    icon={t("icon_flag", "flag")}
                    title={rep.title}
                    subtitle={rep.reporter_name || t("citizen", "{Citizen}")}
                    bannerTopLabel={String(rep.source).toUpperCase()}
                    bannerTopRightLabel={formatSanctuaryDate(rep.created_at, dateFormat)}
                    onClick={() => setSelectedReport(rep)}
                    badges={
                      <span className={`${VAULT_CHIP_CLASS} !text-[var(--danger)] !border-[color-mix(in_srgb,var(--danger)_35%,transparent)]`}>
                        <span className="material-symbols-outlined !text-[12px]">
                          {t("icon_flag", "flag")}
                        </span>
                        <span>{String(rep.source).toUpperCase()}</span>
                      </span>
                    }
                  >
                    <p className="text-xs text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed">
                      {rep.reason || t("no_reason", "No reason provided")}
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
          metricsSubtitle={t("wayfinder_metrics_sub", "Spoke Population, Schema & Aesthetic Footprint")}
          metrics={
            <>
              <CommandScreenMetricTile
                icon={t("icon_group", "group")}
                value={stats.citizens}
                label={t("term_citizens", "{Citizens}")}
                onClick={() => setTab("identities")}
              />
              <CommandScreenMetricTile
                icon={t("icon_construction", "construction")}
                value={stats.masons}
                label={t("verified_masons_metric", "Verified {Masons}")}
                onClick={() => setTab("linker")}
              />
              <CommandScreenMetricTile
                icon={t("icon_shield_person", "shield_person")}
                value={stats.staff}
                label={t("spoke_staff_metric", "Spoke Staff")}
                onClick={() => setTab("identities")}
              />
              <CommandScreenMetricTile
                icon={t("icon_data_object", "data_object")}
                value={`v${schemaVersion}`}
                label={t("tab_schemas", "Master Schema")}
                onClick={() => setTab("schemas")}
              />
              <CommandScreenMetricTile
                icon={t("icon_palette", "palette")}
                value={stats.spokeThemes + stats.spokeLexicons}
                label={t("wf_tab_spoke_aesthetics", "Spoke Aesthetics")}
                onClick={() => setTab("chameleons")}
              />
              <CommandScreenMetricTile
                icon={t("icon_history", "history")}
                value={stats.auditLogs}
                label={t("audit_logs", "Audit Logs")}
                onClick={() => setTab("audit_logs")}
              />
            </>
          }
        >
          <CommandScreenQuickLink
            icon={t("icon_dns", "dns")}
            title={t("spoke_health_tile", "Spoke Server Health")}
            subtitle={`${stats.networkStatus} • ${stats.networkLatency}ms`}
            isActive={stats.networkStatus === "ONLINE"}
            onClick={() => setHealthOpen(true)}
          />
          {onOpenDefcon && (
            <CommandScreenQuickLink
              icon={defconLevel === 1 ? t("icon_warning", "warning") : t("icon_security", "security")}
              title={t("defcon_title", "Lockdown Override")}
              subtitle={
                defconLevel === 1
                  ? t("lockdown_active_sub", "Emergency Patch Lockdown Engaged")
                  : t("lockdown_standby_sub", "Configure Global {Vault} Lockdown")
              }
              isAlert={defconLevel === 1}
              onClick={onOpenDefcon}
            />
          )}
          <CommandScreenQuickLink
            icon={t("icon_dynamic_feed", "dynamic_feed")}
            title={t("patch_and_mass_update_ql", "Patch & Mass Update")}
            subtitle={t("patch_and_mass_update_sub", "Manage Engine Versions, DLC & Bulk Compatibility")}
            onClick={() => setTab("game_versions")}
          />
          <CommandScreenQuickLink
            icon={t("icon_admin_panel_settings", "admin_panel_settings")}
            title={t("wf_keeper_support_title", "Contact Keepers")}
            subtitle={t("wf_keeper_support_subtitle", "Direct Escalation Channel to Sanctuary Keepers")}
            onClick={() => setIsKeeperSupportOpen(true)}
          />
          {onOpenVerifyHash && (
            <CommandScreenQuickLink
              icon={t("icon_verified_user", "verified_user")}
              title={t("wf_hub_verify", "Verify SHA-256 Hash")}
              subtitle={t("verify_hash_sub", "Inspect Any Local File Against Cloud DNA")}
              onClick={onOpenVerifyHash}
            />
          )}
          {onOpenManualFlag && (
            <CommandScreenQuickLink
              icon={t("icon_gpp_bad", "gpp_bad")}
              title={t("manual_flag_title", "Manual Compliance / Malware Flag")}
              subtitle={t("manual_flag_sub", "Classify Hash or Add Spoke Signature")}
              onClick={() => onOpenManualFlag("")}
            />
          )}
          <CommandScreenQuickLink
            icon={t("icon_history", "history")}
            title={t("audit_logs", "Spoke Audit Logs")}
            subtitle={t("open_audit_drawer_sub", "Open Live Enforcement Ledger Drawer")}
            onClick={() => setIsAuditDrawerOpen(true)}
          />
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
        </CommandScreenSidebar>
      </CommandScreenBody>

      {/* DIRECT SIDE PANELS */}
      <ServerHealthSidePanel
        isOpen={healthOpen}
        onClose={() => setHealthOpen(false)}
        stats={stats}
        isKeepers={false}
      />
      <SanctuaryAlertsSidePanel
        isOpen={isAlertsOpen}
        onClose={() => setIsAlertsOpen(false)}
      />
      {userId && (
        <WayfinderKeeperSidePanel
          isOpen={isKeeperSupportOpen}
          onClose={() => setIsKeeperSupportOpen(false)}
          userId={userId}
        />
      )}

      <Suspense fallback={null}>
        {isAuditDrawerOpen && (
          <AuditLogViewer
            isSidePanel={true}
            isOpen={isAuditDrawerOpen}
            onClose={() => setIsAuditDrawerOpen(false)}
          />
        )}
        {viewingPost && (
          <MasonPostViewer
            post={viewingPost}
            onClose={() => setViewingPost(null)}
            userId={userId || "wayfinder"}
            onOpenMasonProfile={onOpenMasonProfile}
          />
        )}
      </Suspense>

      <TicketDossierSidePanel
        isOpen={Boolean(selectedTicket)}
        onClose={() => setSelectedTicket(null)}
        ticket={selectedTicket}
        tableName="sanctuary_tickets"
        canReply={true}
        currentUserId={userId}
        availableActions={["RESOLVED", "REJECTED", "PENDING"]}
        onEditMetadata={(hashOrId) => {
          setSelectedTicket(null);
          if (onOpenMetadataEditor) onOpenMetadataEditor(hashOrId);
        }}
        onClaim={async () => {
          const updated = await claimOrReleaseHubTicket({
            ticket: selectedTicket,
            currentUserId: userId,
            claim: true,
            actorRole: "wayfinder",
            t,
          });
          if (updated) {
            setSelectedTicket(updated);
            refreshWayfinderDashboard();
          }
        }}
        onRelease={async () => {
          const updated = await claimOrReleaseHubTicket({
            ticket: selectedTicket,
            currentUserId: userId,
            claim: false,
            t,
          });
          if (updated) {
            setSelectedTicket(updated);
            refreshWayfinderDashboard();
          }
        }}
        onReplyAdded={() => refreshWayfinderDashboard()}
        onTakeAction={async (actionType, reason) => {
          const ok = await executeHubTicketAction({
            ticket: selectedTicket,
            actionType,
            reason,
            actorRole: "wayfinder",
            t,
          });
          if (ok) {
            setSelectedTicket(null);
            refreshWayfinderDashboard();
          }
        }}
      />

      <CommandMalwareManifestSidePanel
        isOpen={Boolean(selectedManifest)}
        onClose={() => setSelectedManifest(null)}
        manifest={selectedManifest}
        onCompleted={refreshWayfinderDashboard}
        onOpenManualFlag={
          onOpenManualFlag
            ? () => onOpenManualFlag(selectedManifest?.detected_hash || "")
            : undefined
        }
        onOpenFullMalware={() => setTab("oversight_reports")}
      />

      <CommandComplianceReviewSidePanel
        isOpen={Boolean(selectedComplianceMod)}
        onClose={() => setSelectedComplianceMod(null)}
        modItem={selectedComplianceMod}
        onCompleted={refreshWayfinderDashboard}
        onOpenMetadataEditor={onOpenMetadataEditor}
        onOpenFullCompliance={() => {
          if (setComplianceFilter) setComplianceFilter("overview");
          setTab("compliance");
        }}
      />

      <CommandReportResolutionSidePanel
        isOpen={Boolean(selectedReport)}
        onClose={() => setSelectedReport(null)}
        report={selectedReport}
        onCompleted={refreshWayfinderDashboard}
        onOpenFullReports={() => setTab("reports")}
      />
    </CommandScreenLayout>
  );
}
