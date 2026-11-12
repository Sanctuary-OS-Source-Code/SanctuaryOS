import React, { useState, useEffect, useCallback, Suspense } from "react";
import { supabase } from "../../supabase";
import { useLexicon } from "../../LexiconContext";
import { useStore } from "../../store";
import { SanctuaryAlertsSidePanel } from "../../side-panels/SanctuaryAlertsSidePanel";
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

const AuditLogViewer = React.lazy(() =>
  import("../../side-panels/SAAuditLogViewer").then((m) => ({
    default: m.AuditLogViewer,
  }))
);

interface OversightCommandSnapshot {
  stats: {
    complianceFlags: number;
    pendingCompliance: number;
    supportTickets: number;
    malwareTotal: number;
    pendingManifests: number;
    reportQueue: number;
    citizens: number;
    masons: number;
    moderators: number;
    blacklists: number;
    heuristics: number;
    auditLogs: number;
    activePatchVersion: string;
    dlcCount: number;
  };
  broadcasts: any[];
  urgentBroadcast: any | null;
  recentSupport: any[];
  recentMalware: any[];
  recentCompliance: any[];
  recentReports: any[];
}

const DEFAULT_OVERSIGHT_SNAPSHOT: OversightCommandSnapshot = {
  stats: {
    complianceFlags: 0,
    pendingCompliance: 0,
    supportTickets: 0,
    malwareTotal: 0,
    pendingManifests: 0,
    reportQueue: 0,
    citizens: 0,
    masons: 0,
    moderators: 0,
    blacklists: 0,
    heuristics: 0,
    auditLogs: 0,
    activePatchVersion: "",
    dlcCount: 0,
  },
  broadcasts: [],
  urgentBroadcast: null,
  recentSupport: [],
  recentMalware: [],
  recentCompliance: [],
  recentReports: [],
};

export function OversightCommandScreen({
  setTab,
  onOpenDefcon,
  setComplianceFilter,
  setViewingPost,
  onOpenVerifyHash,
  onOpenManualFlag,
  onOpenMetadataEditor,
}: any) {
  const { t } = useLexicon();
  const session = useStore((s) => s.session);
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);
  const defconLevel = useStore((s) => s.defconLevel);
  const dateFormat = useStore((s) => s.dateFormat);

  const userId = session?.user?.id || "";
  const cacheScope = `${activeWorkspaceId || "global"}:${userId || "anon"}`;

  const [snapshot, setSnapshot] = useState<OversightCommandSnapshot>(
    () =>
      getHubCommandCache<OversightCommandSnapshot>("oversight", cacheScope) ||
      DEFAULT_OVERSIGHT_SNAPSHOT
  );

  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [isAuditDrawerOpen, setIsAuditDrawerOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [selectedManifest, setSelectedManifest] = useState<any | null>(null);
  const [selectedComplianceMod, setSelectedComplianceMod] = useState<any | null>(null);
  const [selectedReport, setSelectedReport] = useState<any | null>(null);

  const refreshOversightDashboard = useCallback(async () => {
    const [
      broadcastsRes,
      urgentRes,
      complianceModsRes,
      pendingComplianceRes,
      tier5ModsRes,
      malwareReportsRes,
      ticketsRes,
      categoriesRes,
      nexusReportsRes,
      blueprintReportsRes,
      contentFlagsRes,
      citizensRes,
      masonsRes,
      moderatorsRes,
      bannedUsersRes,
      heuristicsRes,
      auditLogsRes,
      latestPatchRes,
      dlcCountRes,
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
        .from("sanctuary_tickets")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase.from("support_categories").select("*"),
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
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .not("role", "in", "(wayfinder,oversight,admin)"),
      supabase
        .from("masons")
        .select("id", { count: "exact", head: true })
        .eq("is_verified", true),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "architect"),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .not("role", "in", "(wayfinder,oversight,admin)")
        .eq("is_banned", true),
      supabase
        .from("heuristic_signatures")
        .select("id", { count: "exact", head: true })
        .eq("enabled", true),
      supabase.from("audit_logs").select("id", { count: "exact", head: true }),
      supabase
        .from("game_versions")
        .select("version")
        .order("release_date", { ascending: false })
        .limit(1),
      supabase.from("dlc_packs").select("id", { count: "exact", head: true }),
    ]);

    const matchesOversightAudience = (p: any) => {
      const aud = p?.target_audience;
      if (!aud || (Array.isArray(aud) && aud.length === 0)) return true;
      const arr = Array.isArray(aud) ? aud.map(String) : [String(aud)];
      return (
        arr.includes("All") ||
        arr.includes("Oversight") ||
        arr.includes("Senior Architect") ||
        arr.includes("Admin")
      );
    };

    const broadcasts = (broadcastsRes?.data || []).filter(matchesOversightAudience).slice(0, 3);
    let urgentBroadcast = (urgentRes?.data || []).find(matchesOversightAudience) || null;
    const dismissedAlertId = sessionStorage.getItem("dismissedAlertId");
    if (urgentBroadcast && String(urgentBroadcast.id) === dismissedAlertId) {
      urgentBroadcast = null;
    }

    const rawOpenTickets = (ticketsRes?.data || []).filter((tk: any) =>
      isTicketOpenStatus(tk.status)
    );
    const modLookup = await buildTicketModLookupMap(rawOpenTickets);
    const oversightTickets = routeSpokeTicketsForRole(
      rawOpenTickets,
      categoriesRes?.data || [],
      modLookup,
      "oversight",
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

    const nextSnapshot: OversightCommandSnapshot = {
      stats: {
        complianceFlags:
          complianceModsRes?.count ?? (complianceModsRes?.data?.length || 0),
        pendingCompliance: pendingComplianceCount,
        supportTickets: oversightTickets.length,
        malwareTotal: tier5Count + pendingManifests,
        pendingManifests,
        reportQueue: unifiedReports.length,
        citizens: citizensRes?.count || 0,
        masons: masonsRes?.count || 0,
        moderators: moderatorsRes?.count || 0,
        blacklists: (bannedUsersRes?.count || 0) + tier5Count,
        heuristics: heuristicsRes?.count || 0,
        auditLogs: auditLogsRes?.count || 0,
        activePatchVersion: latestPatchRes?.data?.[0]?.version || "",
        dlcCount: dlcCountRes?.count || 0,
      },
      broadcasts,
      urgentBroadcast,
      recentSupport: oversightTickets.slice(0, 3),
      recentMalware: (malwareReportsRes?.data || []).slice(0, 3),
      recentCompliance: prioritizedCompliance.slice(0, 3),
      recentReports: unifiedReports.slice(0, 3),
    };

    setSnapshot(nextSnapshot);
    setHubCommandCache("oversight", cacheScope, nextSnapshot);
  }, [cacheScope, t, userId]);

  useEffect(() => {
    const cached = getHubCommandCache<OversightCommandSnapshot>("oversight", cacheScope);
    if (cached) setSnapshot(cached);
    refreshOversightDashboard();
  }, [cacheScope, refreshOversightDashboard]);

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
            icon={defconLevel === 1 ? t("icon_warning", "warning") : t("icon_shield", "shield")}
            number={
              defconLevel === 1
                ? t("status_active", "Active")
                : t("standby", "Standby")
            }
            label={t("defcon_title", "Lockdown Override")}
            colorClass={defconLevel === 1 ? "text-[var(--danger)]" : "text-[var(--success)]"}
            onClick={onOpenDefcon}
          />
        )}
        <DashboardStatTile
          icon={t("icon_policy", "policy")}
          value={stats.pendingCompliance > 0 ? stats.pendingCompliance : stats.complianceFlags}
          label={
            stats.pendingCompliance > 0
              ? t("pending_compliance_label", "Pending Compliance")
              : t("tab_compliance", "Compliance")
          }
          colorClass={
            stats.pendingCompliance > 0
              ? "text-[var(--warning)]"
              : stats.complianceFlags > 0
                ? "text-[var(--warning)]"
                : "theme-text-accent"
          }
          onClick={() => {
            if (setComplianceFilter) {
              setComplianceFilter(stats.pendingCompliance > 0 ? "pending" : "overview");
            }
            setTab("compliance");
          }}
        />
        <DashboardStatTile
          icon={t("icon_local_activity", "local_activity")}
          value={stats.supportTickets}
          label={t("support_queue", "Support Queue")}
          colorClass={stats.supportTickets > 0 ? "text-[var(--danger)]" : "text-[var(--success)]"}
          onClick={() => setTab("sanctuary_tickets")}
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
          {/* System Broadcasts */}
          <div className="flex flex-col gap-4">
            <CommandScreenSectionHeading
              icon={t("icon_satellite_alt", "satellite_alt")}
              title={t("wf_tab_dispatch", "{Dispatches}")}
              subtitle={t("oversight_broadcasts_sub", "Enforcement Directives & Platform Notices")}
              onJump={() => setTab("oversight_comms")}
              jumpTooltip={t("wf_tab_dispatch", "{Dispatches}")}
            />
            <SystemBroadcastsGrid broadcasts={broadcasts} setViewingPost={setViewingPost} />
          </div>

          {/* Support Queue -> Opens TicketDossierSidePanel Directly */}
          <div className="flex flex-col gap-4">
            <CommandScreenSectionHeading
              icon={t("icon_local_activity", "local_activity")}
              iconColorClass={stats.supportTickets > 0 ? "text-[var(--danger)]" : "text-[var(--success)]"}
              title={t("support_queue", "Support Queue")}
              subtitle={t("oversight_support_sub", "Escalated & Oversight-routed tickets — click to inspect in-drawer")}
              onJump={() => setTab("sanctuary_tickets")}
              jumpTooltip={`${t("support_queue", "Support Queue")} (${stats.supportTickets})`}
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

          {/* Malware & Threat Manifests -> Opens CommandMalwareManifestSidePanel Directly */}
          <div className="flex flex-col gap-4">
            <CommandScreenSectionHeading
              icon={t("icon_coronavirus", "coronavirus")}
              iconColorClass={stats.pendingManifests > 0 ? "text-[var(--danger)]" : "text-[var(--success)]"}
              title={t("malware_manifests", "Malware & Manifests")}
              subtitle={t("oversight_malware_sub", "Pending heuristic threat manifests — click to confirm or dismiss")}
              onJump={() => setTab("oversight_reports")}
              jumpTooltip={`${t("malware_manifests", "Malware & Manifests")} (${stats.pendingManifests})`}
            />
            {recentMalware.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
                {recentMalware.map((item: any) => {
                  const targetLabel =
                    item.mod_name ||
                    item.file_name ||
                    (item.detected_hash ? String(item.detected_hash).substring(0, 14) : "") ||
                    t("threat_manifest", "Threat Manifest");
                  return (
                    <UniversalCard
                      key={item.id}
                      layout="vertical"
                      icon={t("icon_coronavirus", "coronavirus")}
                      title={targetLabel}
                      subtitle={item.matched_rule || item.threat_type || t("heuristic_alert", "Heuristic Match")}
                      bannerTopLabel={t("pending", "Pending")}
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
                      footer={
                        <span className="text-[10px] font-black text-[var(--danger)] flex items-center gap-1">
                          {t("inspect_telemetry", "Inspect Threat")}
                          <span className="material-symbols-outlined !text-[12px]">
                            {t("icon_arrow_forward", "arrow_forward")}
                          </span>
                        </span>
                      }
                    >
                      <p className="text-xs text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed">
                        {item.reason ||
                          item.matched_pattern ||
                          (item.detected_hash ? `SHA-256: ${item.detected_hash}` : "")}
                      </p>
                    </UniversalCard>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                icon={t("icon_verified_user", "verified_user")}
                title={t("no_pending_threat_manifests", "Zero Pending Threat Manifests")}
              />
            )}
          </div>

          {/* Compliance Flags -> Opens CommandComplianceReviewSidePanel Directly */}
          <div className="flex flex-col gap-4">
            <CommandScreenSectionHeading
              icon={t("icon_policy", "policy")}
              iconColorClass="text-[var(--warning)]"
              title={t("tab_compliance", "Compliance")}
              subtitle={t("oversight_compliance_sub", "Pending & Active Tier 1–4 {Mods} — click to confirm, adjust, or clear")}
              onJump={() => {
                if (setComplianceFilter) {
                  setComplianceFilter(stats.pendingCompliance > 0 ? "pending" : "overview");
                }
                setTab("compliance");
              }}
              jumpTooltip={`${t("tab_compliance", "Compliance")} (${stats.complianceFlags})`}
            />
            {recentCompliance.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
                {recentCompliance.map((mod: any) => {
                  const isPendingFlag = ["pending", "under_review", "unverified"].includes(
                    String(mod.status || "").toLowerCase()
                  );
                  return (
                    <UniversalCard
                      key={mod.id}
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
                        <>
                          <span className={`${VAULT_CHIP_CLASS} !text-[var(--warning)] !border-[color-mix(in_srgb,var(--warning)_35%,transparent)]`}>
                            <span className="material-symbols-outlined !text-[12px]">
                              {t("icon_policy", "policy")}
                            </span>
                            <span>
                              {t("stat_tier", "Tier")} {mod.compliance_tier}
                            </span>
                          </span>
                          <span
                            className={`${VAULT_CHIP_CLASS} ${
                              isPendingFlag
                                ? "!text-[var(--accent)] !border-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
                                : "!text-[var(--success)] !border-[color-mix(in_srgb,var(--success)_35%,transparent)]"
                            }`}
                          >
                            <span>
                              {isPendingFlag
                                ? t("pending", "Pending")
                                : t("status_active", "Active")}
                            </span>
                          </span>
                        </>
                      }
                      footer={
                        <span className="text-[10px] font-black text-[var(--accent)] flex items-center gap-1">
                          {isPendingFlag
                            ? t("review_pending_flag", "Review Pending Flag")
                            : t("btn_review", "Adjust Tier")}
                          <span className="material-symbols-outlined !text-[12px]">
                            {t("icon_arrow_forward", "arrow_forward")}
                          </span>
                        </span>
                      }
                    >
                      <p className="text-xs text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed">
                        {mod.status_reason ||
                          `${t("status", "Status")}: ${String(mod.status || "verified")}`}
                      </p>
                    </UniversalCard>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                icon={t("icon_policy", "policy")}
                title={t("no_compliance_flags", "No Active Compliance Flags")}
              />
            )}
          </div>

          {/* {Nexus} Reports + Platform Governance (Identity, Mass Update, Patch & DLC Management) */}
          <div className="flex flex-col gap-4">
            <CommandScreenSectionHeading
              icon={t("icon_settings_suggest", "settings_suggest")}
              title={t(
                "oversight_governance_heading",
                "Reports, Identity, Mass Update & Patch Management"
              )}
              subtitle={t(
                "oversight_governance_sub",
                "Community content flags, {Citizen} & {Mason} clearances, and engine patch versions"
              )}
              onJump={() => setTab("reports")}
              jumpTooltip={`${t("nexus_reports", "{Nexus} Reports")} (${stats.reportQueue})`}
            />
            {recentReports.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
                {recentReports.map((rep: any) => (
                  <UniversalCard
                    key={`${rep.source}-${rep.id}`}
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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
              <UniversalCard
                layout="vertical"
                icon={t("icon_group", "group")}
                title={t("tab_identities", "Identity & {Mason} Verification")}
                subtitle={`${stats.citizens} ${t("term_citizens", "{Citizens}")} • ${stats.masons} ${t("term_masons", "{Masons}")}`}
                onClick={() => setTab("identities")}
                footer={
                  <span className="text-[10px] font-black text-[var(--accent)] flex items-center gap-1">
                    {t("open_identity_matrix", "Open Identity Matrix")}
                    <span className="material-symbols-outlined !text-[12px]">
                      {t("icon_arrow_forward", "arrow_forward")}
                    </span>
                  </span>
                }
              >
                <p className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed">
                  {t(
                    "oversight_identity_card_desc",
                    "Manage {Citizen} clearances, verify {Masons}, and enforce platform blacklists."
                  )}
                </p>
              </UniversalCard>

              <UniversalCard
                layout="vertical"
                icon={t("icon_dynamic_feed", "dynamic_feed")}
                title={t("tab_mass_update", "Mass Update")}
                subtitle={t("bulk_patch_compatibility_sub", "Bulk Patch & Creator Status")}
                onClick={() => setTab("mass_update")}
                footer={
                  <span className="text-[10px] font-black text-[var(--accent)] flex items-center gap-1">
                    {t("open_mass_update", "Open Mass Update")}
                    <span className="material-symbols-outlined !text-[12px]">
                      {t("icon_arrow_forward", "arrow_forward")}
                    </span>
                  </span>
                }
              >
                <p className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed">
                  {t(
                    "mass_update_card_desc",
                    "Batch-certify or mark {Mods} broken following major engine updates."
                  )}
                </p>
              </UniversalCard>

              <UniversalCard
                layout="vertical"
                icon={t("icon_settings", "settings")}
                title={t("tab_game_versions", "Patch & DLC Management")}
                subtitle={
                  stats.activePatchVersion
                    ? `${stats.activePatchVersion} • ${stats.dlcCount} DLC`
                    : `${stats.dlcCount} DLC`
                }
                onClick={() => setTab("game_versions")}
                footer={
                  <span className="text-[10px] font-black text-[var(--accent)] flex items-center gap-1">
                    {t("open_game_management", "Manage Versions & DLC")}
                    <span className="material-symbols-outlined !text-[12px]">
                      {t("icon_arrow_forward", "arrow_forward")}
                    </span>
                  </span>
                }
              >
                <p className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed">
                  {t(
                    "game_versions_card_desc",
                    "Maintain official game patch versions and expansion pack catalogs."
                  )}
                </p>
              </UniversalCard>
            </div>
          </div>
        </CommandScreenMain>

        {/* 3. QUICK OPERATIONS SIDEBAR + 2x3 HUB METRICS */}
        <CommandScreenSidebar
          title={t("command_operations", "Command Operations")}
          icon={t("icon_bolt", "bolt")}
          metricsSubtitle={t("oversight_metrics_sub", "Security, Compliance & Enforcement Footprint")}
          metrics={
            <>
              <CommandScreenMetricTile
                icon={t("icon_pending_actions", "pending_actions")}
                value={stats.pendingCompliance}
                label={t("pending_compliance_label", "Pending Compliance")}
                valueColorClass={stats.pendingCompliance > 0 ? "text-[var(--warning)]" : "theme-text-accent"}
                onClick={() => {
                  if (setComplianceFilter) setComplianceFilter("pending");
                  setTab("compliance");
                }}
              />
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
                icon={t("icon_block", "block")}
                value={stats.blacklists}
                label={t("blacklists_metric", "Blacklists")}
                valueColorClass={stats.blacklists > 0 ? "text-[var(--danger)]" : "theme-text-accent"}
                onClick={() => setTab("identities")}
              />
              <CommandScreenMetricTile
                icon={t("icon_shield_lock", "shield_lock")}
                value={stats.heuristics}
                label={t("heuristic_rules_metric", "Heuristic Rules")}
                onClick={() => setTab("malware_oversight")}
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
            title={t("audit_logs", "Audit Log Reviewer")}
            subtitle={t("open_audit_drawer_sub", "Inspect & Export Spoke Enforcement Ledger")}
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
          <CommandScreenQuickLink
            icon={t("icon_satellite_alt", "satellite_alt")}
            title={t("compose_dispatch", "Broadcast {Dispatch}")}
            subtitle={t("compose_dispatch_sub", "Publish Staff Advisory or Alert")}
            onClick={() => setTab("oversight_comms")}
          />
        </CommandScreenSidebar>
      </CommandScreenBody>

      {/* DIRECT SIDE PANELS */}
      <SanctuaryAlertsSidePanel
        isOpen={isAlertsOpen}
        onClose={() => setIsAlertsOpen(false)}
      />

      <Suspense fallback={null}>
        {isAuditDrawerOpen && (
          <AuditLogViewer
            isSidePanel={true}
            isOpen={isAuditDrawerOpen}
            onClose={() => setIsAuditDrawerOpen(false)}
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
        availableActions={["RESOLVED", "REJECTED", "ESCALATED", "PENDING"]}
        onEditMetadata={(hashOrId) => {
          setSelectedTicket(null);
          if (onOpenMetadataEditor) onOpenMetadataEditor(hashOrId);
        }}
        onClaim={async () => {
          const updated = await claimOrReleaseHubTicket({
            ticket: selectedTicket,
            currentUserId: userId,
            claim: true,
            actorRole: "oversight",
            t,
          });
          if (updated) {
            setSelectedTicket(updated);
            refreshOversightDashboard();
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
            refreshOversightDashboard();
          }
        }}
        onReplyAdded={() => refreshOversightDashboard()}
        onTakeAction={async (actionType, reason) => {
          const ok = await executeHubTicketAction({
            ticket: selectedTicket,
            actionType,
            reason,
            actorRole: "oversight",
            t,
          });
          if (ok) {
            setSelectedTicket(null);
            refreshOversightDashboard();
          }
        }}
      />

      <CommandMalwareManifestSidePanel
        isOpen={Boolean(selectedManifest)}
        onClose={() => setSelectedManifest(null)}
        manifest={selectedManifest}
        onCompleted={refreshOversightDashboard}
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
        onCompleted={refreshOversightDashboard}
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
        onCompleted={refreshOversightDashboard}
        onOpenFullReports={() => setTab("reports")}
      />
    </CommandScreenLayout>
  );
}
