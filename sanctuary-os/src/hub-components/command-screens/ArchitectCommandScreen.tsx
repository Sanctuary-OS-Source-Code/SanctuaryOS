import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../supabase";
import { useLexicon } from "../../LexiconContext";
import { useStore } from "../../store";
import { SanctuaryAlertsSidePanel } from "../../side-panels/SanctuaryAlertsSidePanel";
import TicketDossierSidePanel from "../../side-panels/TicketDossierSidePanel";
import {
  CommandScoutReviewSidePanel,
  CommandMasonSubmissionSidePanel,
  CommandDiagnosticDossierSidePanel,
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
  isComplianceEscalatedReport,
  buildTicketModLookupMap,
  routeSpokeTicketsForRole,
  executeHubTicketAction,
  claimOrReleaseHubTicket,
} from "../../utils/hubCommandCache";
import { auditBlueprintsTier0Compliance } from "../../side-panels/NexusSidePanels";

interface ArchitectCommandSnapshot {
  stats: {
    scoutQueue: number;
    masonQueue: number;
    ticketQueue: number;
    pendingDiagnostics: number;
    reportQueue: number;
    verifiedMods: number;
    templates: number;
    collections: number;
    conflicts: number;
    dependencies: number;
  };
  broadcasts: any[];
  urgentBroadcast: any | null;
  recentSupport: any[];
  recentScanner: any[];
  recentMasonSubs: any[];
  recentDiagnostics: any[];
  recentReports: any[];
}

const DEFAULT_ARCHITECT_SNAPSHOT: ArchitectCommandSnapshot = {
  stats: {
    scoutQueue: 0,
    masonQueue: 0,
    ticketQueue: 0,
    pendingDiagnostics: 0,
    reportQueue: 0,
    verifiedMods: 0,
    templates: 0,
    collections: 0,
    conflicts: 0,
    dependencies: 0,
  },
  broadcasts: [],
  urgentBroadcast: null,
  recentSupport: [],
  recentScanner: [],
  recentMasonSubs: [],
  recentDiagnostics: [],
  recentReports: [],
};

export function ArchitectCommandScreen({
  setStatus: _setStatus,
  onNavigate,
  setViewingPost,
  onOpenVerifyHash,
  onOpenMetadataEditor,
}: any) {
  const { t } = useLexicon();
  const session = useStore((s) => s.session);
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);
  const activeGameSchema = useStore((s) => s.activeGameSchema);
  const dateFormat = useStore((s) => s.dateFormat);

  const userId = session?.user?.id || "";
  const minScoutSubmissions = Math.max(
    1,
    Number(activeGameSchema?.min_scout_submissions ?? 5)
  );
  const exceptionRulesCount = Array.isArray(activeGameSchema?.exception_rules)
    ? activeGameSchema.exception_rules.length
    : 0;

  const cacheScope = `${activeWorkspaceId || "global"}:${minScoutSubmissions}:${userId || "anon"}`;
  const [snapshot, setSnapshot] = useState<ArchitectCommandSnapshot>(
    () =>
      getHubCommandCache<ArchitectCommandSnapshot>("architect", cacheScope) ||
      DEFAULT_ARCHITECT_SNAPSHOT
  );

  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [selectedScout, setSelectedScout] = useState<any | null>(null);
  const [selectedMasonSub, setSelectedMasonSub] = useState<any | null>(null);
  const [selectedDiagnostic, setSelectedDiagnostic] = useState<any | null>(null);
  const [selectedReport, setSelectedReport] = useState<any | null>(null);

  const refreshArchitectDashboard = useCallback(async () => {
    const [
      broadcastsRes,
      urgentRes,
      scoutRes,
      underReviewModsRes,
      verifiedMasonsRes,
      verifiedModsCountRes,
      ticketsRes,
      categoriesRes,
      labLogsRes,
      nexusReportsRes,
      blueprintReportsRes,
      contentFlagsRes,
      templatesCountRes,
      collectionsCountRes,
      conflictsCountRes,
      modDepsCountRes,
      verDepsCountRes,
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
        .from("scout_suggestions")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      supabase
        .from("mods")
        .select("*")
        .eq("status", "under_review")
        .order("created_at", { ascending: false }),
      supabase
        .from("masons")
        .select("id, name, is_verified")
        .eq("is_verified", true),
      supabase
        .from("mods")
        .select("id", { count: "exact", head: true })
        .in("status", ["stable", "verified"])
        .eq("compliance_tier", 0),
      supabase
        .from("sanctuary_tickets")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase.from("support_categories").select("*"),
      supabase
        .from("homestead_lab_logs")
        .select("*, mods(id, name, master_author, status, compliance_tier, latest_version)")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(60),
      supabase
        .from("nexus_reports")
        .select("*, nexus_assets(id, name, asset_type)")
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      supabase
        .from("blueprint_reports")
        .select("*, blueprints(*)")
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      supabase
        .from("content_flags")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      supabase
        .from("nexus_assets")
        .select("id", { count: "exact", head: true })
        .eq("asset_type", "workbench_template"),
      supabase
        .from("collections")
        .select("id", { count: "exact", head: true })
        .eq("compliance_tier", 0),
      supabase
        .from("logical_conflicts")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("mod_dependencies")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("version_dependencies")
        .select("id", { count: "exact", head: true }),
    ]);

    const matchesArchitectAudience = (p: any) => {
      const aud = p?.target_audience;
      if (!aud || (Array.isArray(aud) && aud.length === 0)) return true;
      const arr = Array.isArray(aud) ? aud.map(String) : [String(aud)];
      return (
        arr.includes("All") ||
        arr.includes("Architect") ||
        arr.includes("Moderators")
      );
    };

    const broadcasts = (broadcastsRes?.data || []).filter(matchesArchitectAudience).slice(0, 3);
    let urgentBroadcast = (urgentRes?.data || []).find(matchesArchitectAudience) || null;
    const dismissedAlertId = sessionStorage.getItem("dismissedAlertId");
    if (urgentBroadcast && String(urgentBroadcast.id) === dismissedAlertId) {
      urgentBroadcast = null;
    }

    // 1:1 Scout consensus grouping (matches ArchitectScoutQueue.tsx)
    const pendingScouts = (scoutRes?.data || []).filter(
      (s: any) => Number(s?.compliance_tier || 0) === 0
    );
    const scoutByHash = new Map<string, any[]>();
    pendingScouts.forEach((row: any) => {
      const key = row.dna_hash || `id:${row.id}`;
      const list = scoutByHash.get(key) || [];
      list.push(row);
      scoutByHash.set(key, list);
    });
    const consensusReadyGroups: any[] = [];
    scoutByHash.forEach((rows, key) => {
      if (rows.length >= minScoutSubmissions) {
        const primary = rows[0];
        consensusReadyGroups.push({
          ...primary,
          dna_hash: key.startsWith("id:") ? primary.dna_hash : key,
          suggested_name:
            String(primary.suggested_name || "")
              .replace(/_/g, " ")
              .trim() ||
            primary.dna_hash ||
            t("scanner_item", "Scanner Telemetry"),
          suggested_author: primary.suggested_author || t("unknown_author", "Unknown Author"),
          suggested_version: primary.suggested_version || "1.0.0",
          submission_count: rows.length,
        });
      }
    });

    // 1:1 Mason Queue (verified masons + Tier 0 + deduplicated by normalized name)
    const verifiedMasonMap = new Map<string, string>();
    (verifiedMasonsRes?.data || []).forEach((m: any) => {
      verifiedMasonMap.set(String(m.id), m.name);
    });
    const seenMasonSubNames = new Set<string>();
    const verifiedMasonSubs: any[] = [];
    (underReviewModsRes?.data || []).forEach((mod: any) => {
      if (Number(mod?.compliance_tier || 0) > 0) return;
      if (!mod?.mason_id || !verifiedMasonMap.has(String(mod.mason_id))) return;
      const normName = String(mod.name || mod.id).trim().toLowerCase();
      if (seenMasonSubNames.has(normName)) return;
      seenMasonSubNames.add(normName);
      verifiedMasonSubs.push({
        ...mod,
        mason_name: verifiedMasonMap.get(String(mod.mason_id)),
      });
    });

    // 1:1 Architect Support Queue (includes NEW / OPEN, exclusive when claimed!)
    const rawOpenTickets = (ticketsRes?.data || []).filter((tk: any) =>
      isTicketOpenStatus(tk.status)
    );
    const modLookup = await buildTicketModLookupMap(rawOpenTickets);
    const architectOpenTickets = routeSpokeTicketsForRole(
      rawOpenTickets,
      categoriesRes?.data || [],
      modLookup,
      "architect",
      userId
    );

    // 1:1 Pending Diagnostics (unresolved Tier-0 Homestead Lab reports, deduplicated by mod)
    const pendingDiagMap = new Map<string, any>();
    (labLogsRes?.data || []).forEach((log: any) => {
      const mod = Array.isArray(log.mods) ? log.mods[0] : log.mods;
      if (!mod || Number(mod?.compliance_tier || 0) > 0) return;
      if (mod.status === "stable" || mod.status === "verified" || mod.status === "broken") return;
      if (!pendingDiagMap.has(mod.id)) {
        pendingDiagMap.set(mod.id, {
          ...log,
          mod_id: mod.id,
          mod_name: mod.name,
          mod_author: mod.master_author,
          mod_status: mod.status,
          version_label: mod.latest_version,
        });
      }
    });
    const pendingDiagnosticsList = Array.from(pendingDiagMap.values());

    // Audit reported blueprints so Tier 1-4 / compliance-flagged blueprints route exclusively to Oversight
    const uniqueReportedBlueprints = new Map<string, any>();
    (blueprintReportsRes?.data || []).forEach((r: any) => {
      if (r?.blueprints?.id) {
        uniqueReportedBlueprints.set(String(r.blueprints.id), r.blueprints);
      }
    });
    let bpAuditMap: Record<string, any> = {};
    if (uniqueReportedBlueprints.size > 0) {
      try {
        bpAuditMap = await auditBlueprintsTier0Compliance(
          supabase,
          Array.from(uniqueReportedBlueprints.values()),
          { autoFlagInDb: false }
        );
      } catch {
        // Ignore audit failure
      }
    }

    // Unified Reports Queue (Tier-0 Non-Compliance Nexus + Blueprints + Comm-Link)
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
      ...(blueprintReportsRes?.data || []).map((r: any) => {
        const bp = r.blueprints || {};
        const audit = bp.id ? bpAuditMap[String(bp.id)] : undefined;
        return {
          id: r.id,
          source: "blueprint",
          status: r.status,
          title: bp.name || t("term_blueprint", "{Blueprint}"),
          reason: r.reason,
          reporter_name: r.reporter_name,
          compliance_tier: bp.compliance_tier,
          violations: audit?.violations || [],
          target_id: r.blueprint_id,
          created_at: r.created_at,
        };
      }),
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
    ]
      .filter((rep) => !isComplianceEscalatedReport(rep))
      .sort(
        (a, b) =>
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      );

    const nextSnapshot: ArchitectCommandSnapshot = {
      stats: {
        scoutQueue: consensusReadyGroups.length,
        masonQueue: verifiedMasonSubs.length,
        ticketQueue: architectOpenTickets.length,
        pendingDiagnostics: pendingDiagnosticsList.length,
        reportQueue: unifiedReports.length,
        verifiedMods: verifiedModsCountRes?.count || 0,
        templates: templatesCountRes?.count || 0,
        collections: collectionsCountRes?.count || 0,
        conflicts: conflictsCountRes?.count || 0,
        dependencies: (modDepsCountRes?.count || 0) + (verDepsCountRes?.count || 0),
      },
      broadcasts,
      urgentBroadcast,
      recentSupport: architectOpenTickets.slice(0, 3),
      recentScanner: consensusReadyGroups.slice(0, 3),
      recentMasonSubs: verifiedMasonSubs.slice(0, 3),
      recentDiagnostics: pendingDiagnosticsList.slice(0, 3),
      recentReports: unifiedReports.slice(0, 3),
    };

    setSnapshot(nextSnapshot);
    setHubCommandCache("architect", cacheScope, nextSnapshot);
  }, [cacheScope, minScoutSubmissions, t, userId]);

  useEffect(() => {
    const cached = getHubCommandCache<ArchitectCommandSnapshot>("architect", cacheScope);
    if (cached) setSnapshot(cached);
    refreshArchitectDashboard();
  }, [cacheScope, refreshArchitectDashboard]);

  const {
    stats,
    broadcasts,
    urgentBroadcast,
    recentSupport,
    recentScanner,
    recentMasonSubs,
    recentDiagnostics,
    recentReports,
  } = snapshot;

  return (
    <CommandScreenLayout>
      {/* 1. TOP STAT TILES (1:1 WITH SUB-SECTIONS) */}
      <CommandScreenStats>
        {urgentBroadcast ? (
          <AlertStatTile
            broadcast={urgentBroadcast}
            active={true}
            onClick={() => setIsAlertsOpen(true)}
          />
        ) : (
          <DashboardStatTile
            icon={t("icon_radar", "radar")}
            value={stats.scoutQueue}
            label={t("scout_queue", "Scout Queue")}
            colorClass={stats.scoutQueue > 0 ? "text-[var(--warning)]" : "theme-text-accent"}
            onClick={() => onNavigate("queue")}
          />
        )}
        <DashboardStatTile
          icon={t("icon_construction", "construction")}
          value={stats.masonQueue}
          label={t("mason_queue", "{Mason} Queue")}
          colorClass={stats.masonQueue > 0 ? "text-[var(--warning)]" : "theme-text-accent"}
          onClick={() => onNavigate("mason_queue")}
        />
        <DashboardStatTile
          icon={t("icon_local_activity", "local_activity")}
          value={stats.ticketQueue}
          label={t("support_queue", "Support Queue")}
          colorClass={stats.ticketQueue > 0 ? "text-[var(--danger)]" : "text-[var(--success)]"}
          onClick={() => onNavigate("support_tickets")}
        />
        <DashboardStatTile
          icon={t("icon_flag", "flag")}
          value={stats.reportQueue}
          label={t("nexus_reports", "{Nexus} Reports")}
          colorClass={stats.reportQueue > 0 ? "text-[var(--danger)]" : "theme-text-accent"}
          onClick={() => onNavigate("nexus_reports")}
        />
      </CommandScreenStats>

      {/* 2. MAIN LANDING BODY + OPERATIONS SIDEBAR */}
      <CommandScreenBody>
        <CommandScreenMain>
          {/* System Broadcasts */}
          <div className="flex flex-col gap-4">
            <CommandScreenSectionHeading
              icon={t("icon_satellite_alt", "satellite_alt")}
              title={t("wf_tab_dispatch", "{Dispatches}")}
              subtitle={t("architect_broadcasts_sub", "Staff Directives & Catalog Notices")}
              onJump={() => setIsAlertsOpen(true)}
              jumpTooltip={t("sanctuary_alerts", "Sanctuary Alerts")}
            />
            <SystemBroadcastsGrid broadcasts={broadcasts} setViewingPost={setViewingPost} />
          </div>

          {/* Support Queue -> Opens TicketDossierSidePanel Directly */}
          <div className="flex flex-col gap-4">
            <CommandScreenSectionHeading
              icon={t("icon_local_activity", "local_activity")}
              iconColorClass={stats.ticketQueue > 0 ? "text-[var(--danger)]" : "text-[var(--success)]"}
              title={t("support_queue", "Support Queue")}
              subtitle={t("architect_support_sub", "Click any ticket to claim, reply, or resolve in-drawer")}
              onJump={() => onNavigate("support_tickets")}
              jumpTooltip={`${t("support_queue", "Support Queue")} (${stats.ticketQueue})`}
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
                      <>
                        <span className={`${VAULT_CHIP_CLASS} !text-[var(--accent)] !border-[color-mix(in_srgb,var(--accent)_35%,transparent)]`}>
                          <span className="material-symbols-outlined !text-[12px]">
                            {t("icon_confirmation_number", "confirmation_number")}
                          </span>
                          <span>{String(tk.status || "OPEN").toUpperCase()}</span>
                        </span>
                        {tk.target_mod_name && (
                          <span className={VAULT_CHIP_CLASS}>
                            <span className="material-symbols-outlined !text-[12px]">
                              {t("icon_extension", "extension")}
                            </span>
                            <span className="truncate max-w-[140px]">{tk.target_mod_name}</span>
                          </span>
                        )}
                      </>
                    }
                    footer={
                      <div className="flex items-center justify-between w-full">
                        <span className="text-[10px] font-black text-[var(--subtext)] opacity-60">
                          {formatSanctuaryDate(tk.created_at, dateFormat)}
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

          {/* Scanner Consensus Queue -> Opens CommandScoutReviewSidePanel Directly */}
          <div className="flex flex-col gap-4">
            <CommandScreenSectionHeading
              icon={t("icon_radar", "radar")}
              iconColorClass={stats.scoutQueue > 0 ? "text-[var(--warning)]" : "theme-text-accent"}
              title={t("scout_queue", "Scout Queue")}
              subtitle={t("architect_scanner_sub", "Consensus-ready {Citizen} telemetry — click to approve or reject")}
              onJump={() => onNavigate("queue")}
              jumpTooltip={`${t("scout_queue", "Scout Queue")} (${stats.scoutQueue})`}
            />
            {recentScanner.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
                {recentScanner.map((item: any) => (
                  <UniversalCard
                    key={item.dna_hash || item.id}
                    layout="vertical"
                    icon={t("icon_radar", "radar")}
                    title={item.suggested_name}
                    subtitle={item.suggested_author}
                    bannerTopLabel={`${item.submission_count} ${t("submissions", "Submissions")}`}
                    bannerTopRightLabel={item.suggested_version}
                    onClick={() => setSelectedScout(item)}
                    badges={
                      <>
                        <span className={`${VAULT_CHIP_CLASS} !text-[var(--accent)] !border-[color-mix(in_srgb,var(--accent)_35%,transparent)]`}>
                          <span className="material-symbols-outlined !text-[12px]">
                            {t("icon_groups", "groups")}
                          </span>
                          <span>{item.submission_count}x</span>
                        </span>
                        {item.dna_hash && (
                          <span className={`${VAULT_CHIP_CLASS} font-mono`}>
                            {String(item.dna_hash).substring(0, 10)}
                          </span>
                        )}
                      </>
                    }
                    footer={
                      <span className="text-[10px] font-black text-[var(--accent)] flex items-center gap-1">
                        {t("btn_review", "Review Telemetry")}
                        <span className="material-symbols-outlined !text-[12px]">
                          {t("icon_arrow_forward", "arrow_forward")}
                        </span>
                      </span>
                    }
                  >
                    <p className="text-xs text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed">
                      {item.description ||
                        `${t("author", "Author")}: ${item.suggested_author} • ${t("version", "Version")}: ${item.suggested_version}`}
                    </p>
                  </UniversalCard>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={t("icon_radar", "radar")}
                title={t("no_consensus_scouts", "No Consensus-Ready Scanner Items")}
              />
            )}
          </div>

          {/* {Mason} Submissions Queue -> Opens CommandMasonSubmissionSidePanel Directly */}
          <div className="flex flex-col gap-4">
            <CommandScreenSectionHeading
              icon={t("icon_construction", "construction")}
              title={t("mason_queue", "{Mason} Queue")}
              subtitle={t("mason_queue_desc", "Review submissions from {masons}.")}
              onJump={() => onNavigate("mason_queue")}
              jumpTooltip={`${t("mason_queue", "{Mason} Queue")} (${stats.masonQueue})`}
            />
            {recentMasonSubs.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
                {recentMasonSubs.map((sub: any) => (
                  <UniversalCard
                    key={sub.id}
                    layout="vertical"
                    icon={t("icon_extension", "extension")}
                    title={sub.name || t("untitled", "Untitled")}
                    subtitle={sub.mason_name || sub.master_author || t("mason", "{Mason}")}
                    bannerTopLabel={sub.latest_version || "1.0.0"}
                    bannerTopRightLabel={formatSanctuaryDate(sub.created_at, dateFormat)}
                    onClick={() => setSelectedMasonSub(sub)}
                    badges={
                      <span className={`${VAULT_CHIP_CLASS} !text-[var(--warning)] !border-[color-mix(in_srgb,var(--warning)_35%,transparent)]`}>
                        <span className="material-symbols-outlined !text-[12px]">
                          {t("icon_schedule", "schedule")}
                        </span>
                        <span>{t("under_review", "Under Review")}</span>
                      </span>
                    }
                    footer={
                      <span className="text-[10px] font-black text-[var(--accent)] flex items-center gap-1">
                        {t("btn_review", "Review Submission")}
                        <span className="material-symbols-outlined !text-[12px]">
                          {t("icon_arrow_forward", "arrow_forward")}
                        </span>
                      </span>
                    }
                  >
                    <p className="text-xs text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed">
                      {sub.description || t("no_description", "No description provided.")}
                    </p>
                  </UniversalCard>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={t("icon_check_circle", "check_circle")}
                title={t("no_pending_masons", "No Pending {Mason} Submissions")}
              />
            )}
          </div>

          {/* Diagnostics & Known Error Rules -> Opens CommandDiagnosticDossierSidePanel Directly */}
          <div className="flex flex-col gap-4">
            <CommandScreenSectionHeading
              icon={t("icon_monitor_heart", "monitor_heart")}
              title={t("diagnostics_and_rules_heading", "Diagnostics & Known Error Rules")}
              subtitle={t(
                "diagnostics_and_rules_sub",
                "Pending {Lab} crash/loadout dossiers and active schema exception signatures"
              )}
              onJump={() => onNavigate("lab")}
              jumpTooltip={`${t("tab_diagnostics", "Diagnostics")} (${stats.pendingDiagnostics})`}
            />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
              {recentDiagnostics.slice(0, 2).map((diag: any) => (
                <UniversalCard
                  key={diag.id}
                  layout="vertical"
                  icon={t("icon_science", "science")}
                  title={diag.mod_name || t("unknown", "Unknown")}
                  subtitle={diag.mod_author || t("lab_diagnostic_entry", "{Lab} Report")}
                  bannerTopLabel={diag.version_label || "1.0.0"}
                  bannerTopRightLabel={formatSanctuaryDate(diag.created_at, dateFormat)}
                  onClick={() => setSelectedDiagnostic(diag)}
                  badges={
                    <span className={`${VAULT_CHIP_CLASS} !text-[var(--warning)] !border-[color-mix(in_srgb,var(--warning)_35%,transparent)]`}>
                      <span className="material-symbols-outlined !text-[12px]">
                        {t("icon_pending_actions", "pending_actions")}
                      </span>
                      <span>{t("pending", "Pending")}</span>
                    </span>
                  }
                  footer={
                    <span className="text-[10px] font-black text-[var(--accent)] flex items-center gap-1">
                      {t("inspect_telemetry", "Inspect Dossier")}
                      <span className="material-symbols-outlined !text-[12px]">
                        {t("icon_arrow_forward", "arrow_forward")}
                      </span>
                    </span>
                  }
                >
                  <p className="text-xs text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed">
                    {diag.notes ||
                      diag.exception_summary ||
                      t("pending_lab_verdict", "Awaiting moderator verification verdict.")}
                  </p>
                </UniversalCard>
              ))}

              <UniversalCard
                layout="vertical"
                icon={t("icon_rule_settings", "rule_settings")}
                title={t("known_error_rules_card", "Known Error Rules")}
                subtitle={`${exceptionRulesCount} ${t("active_rules", "Active Rules")}`}
                onClick={() => onNavigate("lab")}
                badges={
                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {t("icon_Terminal", "terminal")}
                    </span>
                    <span>{exceptionRulesCount} {t("signatures", "Signatures")}</span>
                  </span>
                }
                footer={
                  <span className="text-[10px] font-black text-[var(--accent)] flex items-center gap-1">
                    {t("manage_error_rules", "Open Diagnostics & Rules")}
                    <span className="material-symbols-outlined !text-[12px]">
                      {t("icon_arrow_forward", "arrow_forward")}
                    </span>
                  </span>
                }
              >
                <p className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed">
                  {t(
                    "known_error_rules_card_desc",
                    "Schema-driven exception log matchers that automatically diagnose known crashes in {Lab}."
                  )}
                </p>
              </UniversalCard>
            </div>
          </div>

          {/* {Nexus} Reports & Registry Governance (Templates / Collections / Registry) */}
          <div className="flex flex-col gap-4">
            <CommandScreenSectionHeading
              icon={t("icon_flag", "flag")}
              title={t("reports_and_governance_heading", "{Nexus} Reports, Templates & Collections")}
              subtitle={t(
                "reports_and_governance_sub",
                "Community flags and curated catalog architecture"
              )}
              onJump={() => onNavigate("nexus_reports")}
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
                    footer={
                      <span className="text-[10px] font-black text-[var(--accent)] flex items-center gap-1">
                        {t("btn_review", "Review Report")}
                        <span className="material-symbols-outlined !text-[12px]">
                          {t("icon_arrow_forward", "arrow_forward")}
                        </span>
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
                icon={t("icon_inventory_2", "inventory_2")}
                title={t("mod_registry_card", "{Mod} Registry & Conflicts")}
                subtitle={`${stats.verifiedMods} ${t("status_stable", "Stable")} • ${stats.conflicts} ${t("conflicts", "Conflicts")}`}
                onClick={() => onNavigate("registry")}
                footer={
                  <span className="text-[10px] font-black text-[var(--accent)] flex items-center gap-1">
                    {t("open_registry", "Open {Mod} Registry")}
                    <span className="material-symbols-outlined !text-[12px]">
                      {t("icon_arrow_forward", "arrow_forward")}
                    </span>
                  </span>
                }
              >
                <p className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed">
                  {t(
                    "mod_registry_card_desc",
                    "Curate verified Tier-0 {Mod} metadata, lineage hashes, dependencies, and conflict matrices."
                  )}
                </p>
              </UniversalCard>

              <UniversalCard
                layout="vertical"
                icon={t("icon_data_object", "data_object")}
                title={t("ql_templates", "Workbench Templates")}
                subtitle={`${stats.templates} ${t("ql_templates", "Templates")}`}
                onClick={() => onNavigate("template_oversight")}
                footer={
                  <span className="text-[10px] font-black text-[var(--accent)] flex items-center gap-1">
                    {t("open_templates", "Open Templates")}
                    <span className="material-symbols-outlined !text-[12px]">
                      {t("icon_arrow_forward", "arrow_forward")}
                    </span>
                  </span>
                }
              >
                <p className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed">
                  {t(
                    "template_oversight_desc",
                    "Audit and curate community Workbench Templates published to {Nexus}."
                  )}
                </p>
              </UniversalCard>

              <UniversalCard
                layout="vertical"
                icon={t("icon_collections_bookmark", "collections_bookmark")}
                title={t("tab_collections", "Collection Forge")}
                subtitle={`${stats.collections} ${t("tab_collections", "Collections")}`}
                onClick={() => onNavigate("collections")}
                footer={
                  <span className="text-[10px] font-black text-[var(--accent)] flex items-center gap-1">
                    {t("open_collections", "Open Collections")}
                    <span className="material-symbols-outlined !text-[12px]">
                      {t("icon_arrow_forward", "arrow_forward")}
                    </span>
                  </span>
                }
              >
                <p className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed">
                  {t(
                    "collection_forge_desc",
                    "Organize related {Mods} into structured creator sets and dependency groups."
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
          metricsSubtitle={t("architect_metrics_sub", "Tier-0 Atomic Logic, Metadata & Conflict Telemetry")}
          metrics={
            <>
              <CommandScreenMetricTile
                icon={t("icon_verified", "verified")}
                value={stats.verifiedMods}
                label={t("stable_mods_metric", "Stable {Mods}")}
                onClick={() => onNavigate("registry")}
              />
              <CommandScreenMetricTile
                icon={t("icon_warning", "warning")}
                value={stats.conflicts}
                label={t("active_conflicts_metric", "Active Conflicts")}
                valueColorClass={stats.conflicts > 0 ? "text-[var(--warning)]" : "theme-text-accent"}
                onClick={() => onNavigate("registry")}
              />
              <CommandScreenMetricTile
                icon={t("icon_account_tree", "account_tree")}
                value={stats.dependencies}
                label={t("dependencies_metric", "Dependencies")}
                onClick={() => onNavigate("registry")}
              />
              <CommandScreenMetricTile
                icon={t("icon_rule_settings", "rule_settings")}
                value={exceptionRulesCount}
                label={t("known_error_rules_card", "Known Error Rules")}
                onClick={() => onNavigate("lab")}
              />
              <CommandScreenMetricTile
                icon={t("icon_collections_bookmark", "collections_bookmark")}
                value={stats.collections}
                label={t("tab_collections", "Collections")}
                onClick={() => onNavigate("collections")}
              />
              <CommandScreenMetricTile
                icon={t("icon_data_object", "data_object")}
                value={stats.templates}
                label={t("ql_templates", "Templates")}
                onClick={() => onNavigate("template_oversight")}
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
          {onOpenVerifyHash && (
            <CommandScreenQuickLink
              icon={t("icon_verified_user", "verified_user")}
              title={t("wf_hub_verify", "Verify SHA-256 Hash")}
              subtitle={t("verify_hash_sub", "Inspect Any Local File Against Cloud DNA")}
              onClick={onOpenVerifyHash}
            />
          )}
          <CommandScreenQuickLink
            icon={t("icon_inventory_2", "inventory_2")}
            title={t("mod_registry_card", "{Mod} Registry")}
            subtitle={`${stats.verifiedMods} ${t("status_stable", "Stable")}`}
            onClick={() => onNavigate("registry")}
          />
          <CommandScreenQuickLink
            icon={t("icon_monitor_heart", "monitor_heart")}
            title={t("tab_diagnostics", "Diagnostics & Error Rules")}
            subtitle={`${stats.pendingDiagnostics} ${t("pending", "Pending")} • ${exceptionRulesCount} ${t("rules", "Rules")}`}
            onClick={() => onNavigate("lab")}
          />
          <CommandScreenQuickLink
            icon={t("icon_data_object", "data_object")}
            title={t("ql_templates", "Workbench Templates")}
            subtitle={`${stats.templates} ${t("ql_templates", "Templates")}`}
            onClick={() => onNavigate("template_oversight")}
          />
        </CommandScreenSidebar>
      </CommandScreenBody>

      {/* DIRECT SIDE PANELS */}
      <SanctuaryAlertsSidePanel
        isOpen={isAlertsOpen}
        onClose={() => setIsAlertsOpen(false)}
      />

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
            actorRole: "architect",
            t,
          });
          if (updated) {
            setSelectedTicket(updated);
            refreshArchitectDashboard();
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
            refreshArchitectDashboard();
          }
        }}
        onReplyAdded={() => refreshArchitectDashboard()}
        onTakeAction={async (actionType, reason) => {
          const ok = await executeHubTicketAction({
            ticket: selectedTicket,
            actionType,
            reason,
            actorRole: "architect",
            t,
          });
          if (ok) {
            setSelectedTicket(null);
            refreshArchitectDashboard();
          }
        }}
      />

      <CommandScoutReviewSidePanel
        isOpen={Boolean(selectedScout)}
        onClose={() => setSelectedScout(null)}
        scoutItem={selectedScout}
        onCompleted={refreshArchitectDashboard}
        onOpenFullQueue={() => onNavigate("queue")}
      />

      <CommandMasonSubmissionSidePanel
        isOpen={Boolean(selectedMasonSub)}
        onClose={() => setSelectedMasonSub(null)}
        submission={selectedMasonSub}
        onCompleted={refreshArchitectDashboard}
        onOpenMetadataEditor={onOpenMetadataEditor}
        onOpenFullQueue={() => onNavigate("mason_queue")}
      />

      <CommandDiagnosticDossierSidePanel
        isOpen={Boolean(selectedDiagnostic)}
        onClose={() => setSelectedDiagnostic(null)}
        diagnostic={selectedDiagnostic}
        onCompleted={refreshArchitectDashboard}
        onOpenFullDiagnostics={() => onNavigate("lab")}
      />

      <CommandReportResolutionSidePanel
        isOpen={Boolean(selectedReport)}
        onClose={() => setSelectedReport(null)}
        report={selectedReport}
        onCompleted={refreshArchitectDashboard}
        onOpenFullReports={() => onNavigate("nexus_reports")}
      />
    </CommandScreenLayout>
  );
}
