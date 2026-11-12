import React, { useState, useEffect, useCallback, Suspense } from "react";
import { supabaseAuth } from "../../supabase";
import { useLexicon } from "../../LexiconContext";
import { useStore } from "../../store";
import { SanctuaryAlertsSidePanel } from "../../side-panels/SanctuaryAlertsSidePanel";
import {
  ServerHealthSidePanel,
  KeeperReleasePipelineSidePanel,
} from "../../side-panels/WayfinderSidePanels";
import TicketDossierSidePanel from "../../side-panels/TicketDossierSidePanel";
import { CommandSpokeNodeSidePanel } from "../../side-panels/HubCommandQuickPanels";
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
  isTicketVisibleToStaff,
  classifyKeeperTicket,
  executeHubTicketAction,
  claimOrReleaseHubTicket,
} from "../../utils/hubCommandCache";

const MasonPostViewer = React.lazy(() => import("../../side-panels/MasonPostViewer"));
const ReleaseNotesShowcase = React.lazy(() =>
  import("../../components/ReleaseNotesShowcase").then((m) => ({
    default: m.ReleaseNotesShowcase,
  }))
);
const AuditLogViewer = React.lazy(() =>
  import("../../side-panels/SAAuditLogViewer").then((m) => ({
    default: m.AuditLogViewer,
  }))
);

interface KeeperCommandSnapshot {
  stats: {
    onlineGames: number;
    totalGames: number;
    partnerApps: number;
    supportTickets: number;
    coreHeuristics: number;
    citizens: number;
    keepers: number;
    activeThemes: number;
    lexicons: number;
    activeBroadcasts: number;
    defaultSchemaVersion: number;
    webNewsCount: number;
    networkLatency: number;
    networkStatus: string;
  };
  broadcasts: any[];
  urgentBroadcast: any | null;
  spokeNodes: any[];
  recentPartnerApps: any[];
  recentSupport: any[];
}

const DEFAULT_KEEPER_SNAPSHOT: KeeperCommandSnapshot = {
  stats: {
    onlineGames: 0,
    totalGames: 0,
    partnerApps: 0,
    supportTickets: 0,
    coreHeuristics: 0,
    citizens: 0,
    keepers: 0,
    activeThemes: 0,
    lexicons: 0,
    activeBroadcasts: 0,
    defaultSchemaVersion: 1,
    webNewsCount: 0,
    networkLatency: 0,
    networkStatus: "ONLINE",
  },
  broadcasts: [],
  urgentBroadcast: null,
  spokeNodes: [],
  recentPartnerApps: [],
  recentSupport: [],
};

export function KeeperCommandScreen({
  setTab,
  onOpenMasonProfile,
  onOpenVerifyHash,
}: any) {
  const { t } = useLexicon();
  const session = useStore((s) => s.session);
  const dateFormat = useStore((s) => s.dateFormat);

  const userId = session?.user?.id || "";
  const cacheScope = `keepers_core_hub:${userId || "anon"}`;

  const [snapshot, setSnapshot] = useState<KeeperCommandSnapshot>(
    () =>
      getHubCommandCache<KeeperCommandSnapshot>("keeper", cacheScope) ||
      DEFAULT_KEEPER_SNAPSHOT
  );

  const [healthOpen, setHealthOpen] = useState(false);
  const [isPipelineOpen, setIsPipelineOpen] = useState(false);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [isAuditDrawerOpen, setIsAuditDrawerOpen] = useState(false);
  const [viewingPost, setViewingPost] = useState<any | null>(null);
  const [selectedKeeperTicket, setSelectedKeeperTicket] = useState<any | null>(null);
  const [selectedSpokeNode, setSelectedSpokeNode] = useState<any | null>(null);

  const refreshKeeperDashboard = useCallback(async () => {
    const pingStart = Date.now();
    // CRITICAL: 100% of Keepers Core queries MUST target supabaseAuth (Core Hub DB), NEVER Spoke DB!
    const [
      broadcastsRes,
      urgentRes,
      gamesRes,
      ticketsRes,
      heuristicsRes,
      citizensRes,
      keepersRes,
      themesRes,
      lexiconsRes,
      activeBroadcastsCountRes,
      schemasRes,
      webNewsRes,
    ] = await Promise.all([
      supabaseAuth
        .from("keeper_system_broadcasts")
        .select("*")
        .eq("is_active", true)
        .in("category", ["Update", "Info", "Event", "System"])
        .order("created_at", { ascending: false })
        .limit(12),
      supabaseAuth
        .from("keeper_system_broadcasts")
        .select("*")
        .eq("is_active", true)
        .in("is_pinned", ["true", "True", true] as any)
        .order("created_at", { ascending: false })
        .limit(8),
      supabaseAuth
        .from("sanctuary_games")
        .select(
          "id, name, schema_id, supabase_url, supabase_anon_key, icon, created_at, is_active, is_keepers_only"
        )
        .order("created_at", { ascending: false }),
      supabaseAuth
        .from("keeper_tickets")
        .select("*")
        .order("created_at", { ascending: false }),
      supabaseAuth
        .from("keeper_heuristic_signatures")
        .select("id", { count: "exact", head: true })
        .eq("enabled", true),
      supabaseAuth.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAuth
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .in("os_role", ["keeper", "core_dev", "admin"]),
      supabaseAuth.from("sanctuary_themes").select("id", { count: "exact", head: true }),
      supabaseAuth.from("sanctuary_lexicons").select("id", { count: "exact", head: true }),
      supabaseAuth
        .from("keeper_system_broadcasts")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .neq("category", "SpokeDonationConfig")
        .neq("category", "KeeperPipelineConfig"),
      supabaseAuth
        .from("sanctuary_schemas")
        .select("schema_id, schema_version")
        .limit(5),
      supabaseAuth.from("keeper_web_news").select("id", { count: "exact", head: true }),
    ]);

    const latency = Date.now() - pingStart;

    const matchesKeeperAudience = (p: any) => {
      const aud = p?.target_audience;
      if (!aud || (Array.isArray(aud) && aud.length === 0)) return true;
      const arr = Array.isArray(aud) ? aud.map(String) : [String(aud)];
      return (
        arr.includes("All") ||
        arr.includes("Keeper Core") ||
        arr.includes("Keepers")
      );
    };

    const broadcasts = (broadcastsRes?.data || []).filter(matchesKeeperAudience).slice(0, 3);
    let urgentBroadcast = (urgentRes?.data || []).find(matchesKeeperAudience) || null;
    const dismissedAlertId = sessionStorage.getItem("dismissedAlertId");
    if (urgentBroadcast && String(urgentBroadcast.id) === dismissedAlertId) {
      urgentBroadcast = null;
    }

    const spokeNodes = gamesRes?.data || [];
    const onlineGames = spokeNodes.filter((g: any) => Boolean(g.is_active)).length;

    const openKeeperTickets = (ticketsRes?.data || []).filter(
      (tk: any) => isTicketOpenStatus(tk.status) && isTicketVisibleToStaff(tk, userId)
    );
    // 1:1 Parity with KeepersSupportTickets.tsx and KeepersActiveGames.tsx
    const openPartnerApps = openKeeperTickets.filter(
      (tk: any) => classifyKeeperTicket(tk) === "partner_apps"
    );
    const openSupportQueue = openKeeperTickets.filter(
      (tk: any) => classifyKeeperTicket(tk) !== "partner_apps"
    );

    const defaultSchemaRow =
      (schemasRes?.data || []).find(
        (s: any) => String(s.schema_id || "").toLowerCase() === "default"
      ) || schemasRes?.data?.[0];

    const nextSnapshot: KeeperCommandSnapshot = {
      stats: {
        onlineGames,
        totalGames: spokeNodes.length,
        partnerApps: openPartnerApps.length,
        supportTickets: openSupportQueue.length,
        coreHeuristics: heuristicsRes?.count || 0,
        citizens: citizensRes?.count || 0,
        keepers: keepersRes?.count || 0,
        activeThemes: themesRes?.count || 0,
        lexicons: lexiconsRes?.count || 0,
        activeBroadcasts: activeBroadcastsCountRes?.count || 0,
        defaultSchemaVersion: Number(defaultSchemaRow?.schema_version || 1),
        webNewsCount: webNewsRes?.count || 0,
        networkLatency: latency,
        networkStatus: latency > 5000 ? "DEGRADED" : "ONLINE",
      },
      broadcasts,
      urgentBroadcast,
      spokeNodes: spokeNodes.slice(0, 3),
      recentPartnerApps: openPartnerApps.slice(0, 3),
      recentSupport: openSupportQueue.slice(0, 3),
    };

    setSnapshot(nextSnapshot);
    setHubCommandCache("keeper", cacheScope, nextSnapshot);
  }, [cacheScope, userId]);

  useEffect(() => {
    const cached = getHubCommandCache<KeeperCommandSnapshot>("keeper", cacheScope);
    if (cached) setSnapshot(cached);
    refreshKeeperDashboard();
  }, [refreshKeeperDashboard]);

  const {
    stats,
    broadcasts,
    urgentBroadcast,
    spokeNodes,
    recentPartnerApps,
    recentSupport,
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
            label={t("core_hub_latency", "Core Hub Health")}
            colorClass={
              stats.networkStatus === "ONLINE"
                ? "text-[var(--success)]"
                : "text-[var(--warning)]"
            }
            onClick={() => setHealthOpen(true)}
          />
        )}
        <DashboardStatTile
          icon={t("icon_hub", "hub")}
          number={`${stats.onlineGames}/${stats.totalGames}`}
          label={t("keepers_tab_partner_spokes", "Partner Spokes")}
          colorClass="theme-text-accent"
          onClick={() => setTab("active_games")}
        />
        <DashboardStatTile
          icon={t("icon_handshake", "handshake")}
          value={stats.partnerApps}
          label={t("keepers_tab_partner_apps", "Partner Applications")}
          colorClass={stats.partnerApps > 0 ? "text-[var(--warning)]" : "theme-text-accent"}
          onClick={() => setTab("partner_apps")}
        />
        <DashboardStatTile
          icon={t("icon_support_agent", "support_agent")}
          value={stats.supportTickets}
          label={t("support_queue", "Support Queue")}
          colorClass={stats.supportTickets > 0 ? "text-[var(--danger)]" : "text-[var(--success)]"}
          onClick={() => setTab("support")}
        />
        <DashboardStatTile
          icon={t("icon_shield_lock", "shield_lock")}
          value={stats.coreHeuristics}
          label={t("core_heuristics_tab", "Core Heuristics")}
          colorClass="theme-text-accent"
          onClick={() => setTab("heuristics")}
        />
      </CommandScreenStats>

      {/* 2. BODY */}
      <CommandScreenBody>
        <CommandScreenMain>
          {/* Core Dispatches */}
          <div className="flex flex-col gap-4">
            <CommandScreenSectionHeading
              icon={t("icon_satellite_alt", "satellite_alt")}
              title={t("wf_tab_dispatch", "Core {Dispatches}")}
              subtitle={t("keeper_broadcasts_sub", "Global OS Broadcasts & Federated Wayfinder Advisories")}
              onJump={() => setTab("keepers_comms")}
              jumpTooltip={t("wf_tab_dispatch", "Core {Dispatches}")}
            />
            <SystemBroadcastsGrid broadcasts={broadcasts} setViewingPost={setViewingPost} />
          </div>

          {/* Partner Spokes & Partner Applications -> Open Drawers Directly */}
          <div className="flex flex-col gap-4">
            <CommandScreenSectionHeading
              icon={t("icon_dns", "dns")}
              title={t("partner_spokes_and_apps_heading", "Partner Spokes & Applications")}
              subtitle={t(
                "partner_spokes_and_apps_sub",
                "Inspect Partner Applications or open Spoke compliance severing (Cut the Cord)"
              )}
              onJump={() => setTab("active_games")}
              jumpTooltip={`${t("keepers_tab_partner_spokes", "Partner Spokes")} (${stats.onlineGames}/${stats.totalGames})`}
            />
            {recentPartnerApps.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
                {recentPartnerApps.map((app: any) => (
                  <UniversalCard
                    key={app.id}
                    layout="vertical"
                    icon={t("icon_handshake", "handshake")}
                    title={app.title || t("keepers_tab_partner_apps", "Partner Application")}
                    subtitle={
                      app.metadata?.partner_application?.game_title ||
                      app.metadata?.partner_application?.lead_contact ||
                      t("keepers_tab_partner_spokes", "Partner Spoke")
                    }
                    bannerTopLabel={t("application", "Application")}
                    bannerTopRightLabel={formatSanctuaryDate(app.created_at, dateFormat)}
                    onClick={() => setSelectedKeeperTicket(app)}
                    badges={
                      <span className={`${VAULT_CHIP_CLASS} !text-[var(--warning)] !border-[color-mix(in_srgb,var(--warning)_35%,transparent)]`}>
                        <span className="material-symbols-outlined !text-[12px]">
                          {t("icon_handshake", "handshake")}
                        </span>
                        <span>{String(app.status || "OPEN").toUpperCase()}</span>
                      </span>
                    }
                  >
                    <p className="text-xs text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed">
                      {app.description || t("no_description", "No description provided.")}
                    </p>
                  </UniversalCard>
                ))}
              </div>
            )}

            {spokeNodes.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
                {spokeNodes.map((node: any) => (
                  <UniversalCard
                    key={node.id}
                    layout="vertical"
                    icon={t("icon_dns", "dns")}
                    title={node.name}
                    subtitle={node.supabase_url}
                    bannerTopLabel={node.is_active ? t("online", "Online") : t("offline", "Offline")}
                    bannerTopRightLabel={String(node.schema_id || "").toUpperCase()}
                    onClick={() => setSelectedSpokeNode(node)}
                    badges={
                      <>
                        <span
                          className={`${VAULT_CHIP_CLASS} ${
                            node.is_active
                              ? "!text-[var(--success)] !border-[color-mix(in_srgb,var(--success)_35%,transparent)]"
                              : "!text-[var(--subtext)]"
                          }`}
                        >
                          <span className="material-symbols-outlined !text-[12px]">
                            {node.is_active
                              ? t("icon_check_circle", "check_circle")
                              : t("icon_cloud_off", "cloud_off")}
                          </span>
                          <span>{node.is_active ? t("online", "Online") : t("offline", "Offline")}</span>
                        </span>
                        {node.is_keepers_only && (
                          <span className={`${VAULT_CHIP_CLASS} !text-[var(--warning)] !border-[color-mix(in_srgb,var(--warning)_35%,transparent)]`}>
                            <span className="material-symbols-outlined !text-[12px]">
                              {t("icon_visibility_off", "visibility_off")}
                            </span>
                            <span>{t("keepers_only_badge", "Keepers-Classified")}</span>
                          </span>
                        )}
                      </>
                    }
                    footer={
                      <span className="text-[10px] font-black text-[var(--accent)] flex items-center gap-1">
                        {node.is_keepers_only
                          ? t("configure_node", "Configure Test Node")
                          : t("spoke_compliance_status", "Compliance & Status")}
                        <span className="material-symbols-outlined !text-[12px]">
                          {t("icon_arrow_forward", "arrow_forward")}
                        </span>
                      </span>
                    }
                  >
                    <p className="text-xs text-[var(--subtext)] opacity-80 truncate">
                      {`${t("schema_id", "Schema")}: ${String(node.schema_id || "").toUpperCase()}`}
                    </p>
                  </UniversalCard>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={t("icon_dns", "dns")}
                title={t("no_partner_spokes_registered", "No Partner Spokes Registered")}
              />
            )}
          </div>

          {/* Keepers Support Queue -> Opens TicketDossierSidePanel (keeper_tickets) Directly */}
          <div className="flex flex-col gap-4">
            <CommandScreenSectionHeading
              icon={t("icon_support_agent", "support_agent")}
              iconColorClass={stats.supportTickets > 0 ? "text-[var(--danger)]" : "text-[var(--success)]"}
              title={t("support_queue", "Support Queue")}
              subtitle={t(
                "keepers_support_sub",
                "Core OS bugs, feedback & Wayfinder escalations — click to reply or resolve in-drawer"
              )}
              onJump={() => setTab("support")}
              jumpTooltip={`${t("support_queue", "Support Queue")} (${stats.supportTickets})`}
            />
            {recentSupport.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
                {recentSupport.map((tk: any) => (
                  <UniversalCard
                    key={tk.id}
                    layout="vertical"
                    icon={t("icon_support_agent", "support_agent")}
                    title={tk.title || t("support_ticket", "Support Ticket")}
                    subtitle={tk.ticket_type || tk.category || t("support", "Support")}
                    bannerTopLabel={String(tk.status || "OPEN").toUpperCase()}
                    bannerTopRightLabel={formatSanctuaryDate(tk.created_at, dateFormat)}
                    onClick={() => setSelectedKeeperTicket(tk)}
                    badges={
                      <span className={`${VAULT_CHIP_CLASS} !text-[var(--accent)] !border-[color-mix(in_srgb,var(--accent)_35%,transparent)]`}>
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

          {/* Core OS Infrastructure: Default Master Schema, Web Landing & Core Aesthetics */}
          <div className="flex flex-col gap-4">
            <CommandScreenSectionHeading
              icon={t("icon_layers", "layers")}
              title={t(
                "keepers_infrastructure_heading",
                "Core Schemas, Web Landing & Core Aesthetics"
              )}
              subtitle={t(
                "keepers_infrastructure_sub",
                "Baseline Master Schema template, public web portal directives, and Keepers {Chameleon} / {Lexicon} engines"
              )}
              onJump={() => setTab("schemas")}
              jumpTooltip={t("default_master_schema_card", "Default Master Schema")}
            />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
              <UniversalCard
                layout="vertical"
                icon={t("icon_data_object", "data_object")}
                title={t("default_master_schema_card", "Default Master Schema")}
                subtitle={`v${stats.defaultSchemaVersion} • ${t("baseline_template", "Spoke Baseline Template")}`}
                onClick={() => setTab("schemas")}
                badges={
                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {t("icon_verified", "verified")}
                    </span>
                    <span>v{stats.defaultSchemaVersion}</span>
                  </span>
                }
                footer={
                  <span className="text-[10px] font-black text-[var(--accent)] flex items-center gap-1">
                    {t("open_schema_studio", "Open Schema Studio")}
                    <span className="material-symbols-outlined !text-[12px]">
                      {t("icon_arrow_forward", "arrow_forward")}
                    </span>
                  </span>
                }
              >
                <p className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed">
                  {t(
                    "default_master_schema_card_desc",
                    "Edit the canonical game-agnostic Master Schema template inherited by all Partner Spokes."
                  )}
                </p>
              </UniversalCard>

              <UniversalCard
                layout="vertical"
                icon={t("icon_public", "public")}
                title={t("keepers_tab_web_landing", "Web Landing, News & Legal")}
                subtitle={`${stats.webNewsCount} ${t("published_articles", "Articles")} • ${t("legal_covenants", "Legal Covenants")}`}
                onClick={() => setTab("web_directives")}
                badges={
                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {t("icon_newspaper", "newspaper")}
                    </span>
                    <span>{stats.webNewsCount} {t("news", "News")}</span>
                  </span>
                }
                footer={
                  <span className="text-[10px] font-black text-[var(--accent)] flex items-center gap-1">
                    {t("open_web_landing_editor", "Edit Web Portal")}
                    <span className="material-symbols-outlined !text-[12px]">
                      {t("icon_arrow_forward", "arrow_forward")}
                    </span>
                  </span>
                }
              >
                <p className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed">
                  {t(
                    "web_landing_card_desc",
                    "Manage public landing hero directives, Foundry news articles, and legal covenants."
                  )}
                </p>
              </UniversalCard>

              <UniversalCard
                layout="vertical"
                icon={t("icon_palette", "palette")}
                title={t("keepers_tab_core_aesthetics", "Core Aesthetics & Brand")}
                subtitle={`${stats.activeThemes} ${t("term_chameleons", "{Chameleons}")} • ${stats.lexicons} ${t("term_lexicons", "{Lexicons}")}`}
                onClick={() => setTab("chameleons")}
                badges={
                  <>
                    <span className={VAULT_CHIP_CLASS}>
                      <span>{stats.activeThemes} {t("term_chameleons", "{Chameleons}")}</span>
                    </span>
                    <span className={VAULT_CHIP_CLASS}>
                      <span>{stats.lexicons} {t("term_lexicons", "{Lexicons}")}</span>
                    </span>
                  </>
                }
                footer={
                  <span className="text-[10px] font-black text-[var(--accent)] flex items-center gap-1">
                    {t("open_core_aesthetics", "Open Core Aesthetics")}
                    <span className="material-symbols-outlined !text-[12px]">
                      {t("icon_arrow_forward", "arrow_forward")}
                    </span>
                  </span>
                }
              >
                <p className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed">
                  {t(
                    "core_aesthetics_card_desc",
                    "Curate Core {Chameleon} themes, Title Area brand emblems, and baseline `en-default` / `en-sanctuary` {Lexicons}."
                  )}
                </p>
              </UniversalCard>
            </div>
          </div>

          {/* Lazy-loaded Release Notes Showcase */}
          <Suspense fallback={null}>
            <ReleaseNotesShowcase isKeepers={true} />
          </Suspense>
        </CommandScreenMain>

        {/* 3. QUICK OPERATIONS SIDEBAR + 2x3 HUB METRICS */}
        <CommandScreenSidebar
          title={t("command_operations", "Command Operations")}
          icon={t("icon_bolt", "bolt")}
          metricsSubtitle={t("keeper_metrics_sub", "Global Sanctuary Foundry Telemetry")}
          metrics={
            <>
              <CommandScreenMetricTile
                icon={t("icon_group", "group")}
                value={stats.citizens}
                label={t("global_citizens_metric", "Global {Citizens}")}
                onClick={() => setTab("identities")}
              />
              <CommandScreenMetricTile
                icon={t("icon_admin_panel_settings", "admin_panel_settings")}
                value={stats.keepers}
                label={t("keepers_metric", "Keepers")}
                onClick={() => setTab("identities")}
              />
              <CommandScreenMetricTile
                icon={t("icon_data_object", "data_object")}
                value={`v${stats.defaultSchemaVersion}`}
                label={t("default_schema_metric", "Default Schema")}
                onClick={() => setTab("schemas")}
              />
              <CommandScreenMetricTile
                icon={t("icon_newspaper", "newspaper")}
                value={stats.webNewsCount}
                label={t("web_articles_metric", "Web Articles")}
                onClick={() => setTab("web_directives")}
              />
              <CommandScreenMetricTile
                icon={t("icon_palette", "palette")}
                value={stats.activeThemes}
                label={t("core_chameleons_metric", "Core {Chameleons}")}
                onClick={() => setTab("chameleons")}
              />
              <CommandScreenMetricTile
                icon={t("icon_translate", "translate")}
                value={stats.lexicons}
                label={t("core_lexicons_metric", "Core {Lexicons}")}
                onClick={() => setTab("chameleons")}
              />
            </>
          }
        >
          <CommandScreenQuickLink
            icon={t("icon_dns", "dns")}
            title={t("core_hub_latency", "Core Hub Health")}
            subtitle={`${stats.networkStatus} • ${stats.networkLatency}ms`}
            isActive={stats.networkStatus === "ONLINE"}
            onClick={() => setHealthOpen(true)}
          />
          <CommandScreenQuickLink
            icon={t("icon_rocket_launch", "rocket_launch")}
            title={t("keepers_pipeline_quicklink_title", "Release Pipeline & Foundry Funding")}
            subtitle={t(
              "keepers_pipeline_quicklink_sub",
              "Manage Daily Dev Builds, Stable Stream & Keepers Support"
            )}
            onClick={() => setIsPipelineOpen(true)}
          />
          {onOpenVerifyHash && (
            <CommandScreenQuickLink
              icon={t("icon_verified_user", "verified_user")}
              title={t("wf_hub_verify", "Verify SHA-256 Hash")}
              subtitle={t("verify_hash_sub", "Inspect Any Local File Against Cloud DNA")}
              onClick={onOpenVerifyHash}
            />
          )}
          <CommandScreenQuickLink
            icon={t("icon_history", "history")}
            title={t("audit_logs", "Core Audit Logs")}
            subtitle={t("open_core_audit_drawer_sub", "Open Keepers Core Ledger Drawer")}
            onClick={() => setIsAuditDrawerOpen(true)}
          />
          <CommandScreenQuickLink
            icon={t("icon_shield_lock", "shield_lock")}
            title={t("core_heuristics_tab", "Core Heuristics")}
            subtitle={`${stats.coreHeuristics} ${t("active_rules", "Active Rules")}`}
            onClick={() => setTab("heuristics")}
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
        isKeepers={true}
      />
      <KeeperReleasePipelineSidePanel
        isOpen={isPipelineOpen}
        onClose={() => setIsPipelineOpen(false)}
      />
      <SanctuaryAlertsSidePanel
        isOpen={isAlertsOpen}
        onClose={() => setIsAlertsOpen(false)}
        audience="All"
        tableName="keeper_system_broadcasts"
      />

      <Suspense fallback={null}>
        {isAuditDrawerOpen && (
          <AuditLogViewer
            isSidePanel={true}
            isOpen={isAuditDrawerOpen}
            onClose={() => setIsAuditDrawerOpen(false)}
            isKeepers={true}
            forceHubLogs={true}
          />
        )}
        {viewingPost && (
          <MasonPostViewer
            post={viewingPost}
            onClose={() => setViewingPost(null)}
            userId={userId || "keeper"}
            onOpenMasonProfile={onOpenMasonProfile}
          />
        )}
      </Suspense>

      <CommandSpokeNodeSidePanel
        isOpen={Boolean(selectedSpokeNode)}
        onClose={() => setSelectedSpokeNode(null)}
        gameNode={selectedSpokeNode}
        onCompleted={refreshKeeperDashboard}
        onOpenPartnerSpokes={() => setTab("active_games")}
      />

      <TicketDossierSidePanel
        isOpen={Boolean(selectedKeeperTicket)}
        onClose={() => setSelectedKeeperTicket(null)}
        ticket={selectedKeeperTicket}
        tableName="keeper_tickets"
        canReply={true}
        currentUserId={userId}
        availableActions={["RESOLVED", "REJECTED", "PENDING"]}
        onClaim={async () => {
          const updated = await claimOrReleaseHubTicket({
            ticket: selectedKeeperTicket,
            currentUserId: userId,
            claim: true,
            actorRole: "keeper",
            tableName: "keeper_tickets",
            t,
          });
          if (updated) {
            setSelectedKeeperTicket(updated);
            refreshKeeperDashboard();
          }
        }}
        onRelease={async () => {
          const updated = await claimOrReleaseHubTicket({
            ticket: selectedKeeperTicket,
            currentUserId: userId,
            claim: false,
            tableName: "keeper_tickets",
            t,
          });
          if (updated) {
            setSelectedKeeperTicket(updated);
            refreshKeeperDashboard();
          }
        }}
        onReplyAdded={() => refreshKeeperDashboard()}
        onTakeAction={async (actionType, reason) => {
          const ok = await executeHubTicketAction({
            ticket: selectedKeeperTicket,
            actionType,
            reason,
            actorRole: "keeper",
            tableName: "keeper_tickets",
            t,
          });
          if (ok) {
            setSelectedKeeperTicket(null);
            refreshKeeperDashboard();
          }
        }}
      />
    </CommandScreenLayout>
  );
}
