import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase, supabaseAuth, getActiveGameClient } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { SharedIdentityEditor } from "../IdentityMatrix";
import {
  SidePanel,
  CustomDropdown,
  EmptyState,
  DashboardStatTile,
  SidePanelHeroCard,
  StatBox,
  UniversalGroup,
  PanelHeaderGroup,
  PanelHeaderButton,
  ActionButton,
  ActionPill,
} from "../shared";
import { UniversalCard } from "../components/universal/UniversalCard";
import {
  ElevatedHubLayout,
  HubOverviewLanding,
  HubOverviewSection,
} from "../components/layouts/ElevatedHubLayout";
import { parseAuditLogEntry, isCoreOnlyAuditRow } from "../lib/audit";

const VAULT_CHIP_CLASS =
  "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

const PAGE_SIZE = 24;

export function AuditLogViewer({
  isOpen,
  onClose,
  isSidePanel = false,
  hideEditIdentity = false,
  isKeepers = false,
  forceHubLogs = false,
  embedded = false,
  externalSearch,
  externalFilterAction,
  externalScopeFilter,
  externalTimeRange,
  openRetentionRef,
  onCountChange,
  onLogsLoaded,
}: {
  isOpen?: boolean;
  onClose?: () => void;
  isSidePanel?: boolean;
  hideEditIdentity?: boolean;
  isKeepers?: boolean;
  forceHubLogs?: boolean;
  embedded?: boolean;
  externalSearch?: string;
  externalFilterAction?: string;
  externalScopeFilter?: string;
  externalTimeRange?: string;
  openRetentionRef?: React.MutableRefObject<(() => void) | null>;
  onCountChange?: (count: number) => void;
  onLogsLoaded?: (logs: any[]) => void;
}) {
  const { t } = useLexicon();
  const userRole = useStore((state) => state.userRole);
  const osRole = useStore((state) => (state as any).osRole);
  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);
  const workspaces = useStore((state) => state.workspaces);
  const pushStatus = useStore((state) => state.pushStatus);

  // Strict enforcement: Only Keepers in Keepers Core can view Keepers Core Audit Logs
  const effectiveIsKeepers = Boolean(
    (isKeepers || forceHubLogs) &&
      (userRole === "keeper" ||
        userRole === "admin" ||
        osRole === "keeper" ||
        osRole === "core_dev" ||
        osRole === "admin")
  );

  const [logs, setLogs] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterAction, setFilterAction] = useState("overview");
  const [scopeFilter, setScopeFilter] = useState<string>("ALL");
  const [timeRange, setTimeRange] = useState<string>("ALL");
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<any | null>(null);
  const profileCacheRef = useRef<Record<string, any>>({});

  // Retention & Archive Manager State
  const [isRetentionOpen, setIsRetentionOpen] = useState(false);
  const [retentionDays, setRetentionDays] = useState<number>(90);
  const [agedLogsCount, setAgedLogsCount] = useState<number>(0);
  const [isPruning, setIsPruning] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const isInline = (isOpen === undefined || embedded) && !isSidePanel;

  const effectiveSearch =
    embedded && externalSearch !== undefined ? externalSearch : search;
  const effectiveFilter =
    embedded && externalFilterAction !== undefined
      ? externalFilterAction
      : filterAction;
  const effectiveScope =
    embedded && externalScopeFilter !== undefined
      ? externalScopeFilter
      : scopeFilter;
  const effectiveTimeRange =
    embedded && externalTimeRange !== undefined
      ? externalTimeRange
      : timeRange;

  useEffect(() => {
    if (openRetentionRef) {
      openRetentionRef.current = () => setIsRetentionOpen(true);
    }
  }, [openRetentionRef]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(effectiveSearch.trim());
      setPage(0);
    }, 220);
    return () => clearTimeout(timer);
  }, [effectiveSearch]);

  useEffect(() => {
    setPage(0);
  }, [effectiveFilter, effectiveScope, effectiveTimeRange, activeWorkspaceId, effectiveIsKeepers]);

  const resolveTargetClient = useCallback(() => {
    if (effectiveIsKeepers) {
      return supabaseAuth;
    }
    // Non-Keeper views strictly query the active Spoke database
    return getActiveGameClient();
  }, [effectiveIsKeepers, activeWorkspaceId]);

  const getTimeCutoffIso = (rangeKey: string): string | null => {
    const now = Date.now();
    if (rangeKey === "24h") return new Date(now - 24 * 60 * 60 * 1000).toISOString();
    if (rangeKey === "7d") return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    if (rangeKey === "30d") return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    if (rangeKey === "90d") return new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();
    return null;
  };

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const client = resolveTargetClient();

    if (!client) {
      setLogs([]);
      setTotalCount(0);
      if (onCountChange) onCountChange(0);
      if (onLogsLoaded) onLogsLoaded([]);
      setLoading(false);
      return;
    }

    try {
      let query = client
        .from("audit_logs")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });

      // Scope filtering in Keepers Core
      if (effectiveIsKeepers) {
        if (effectiveScope === "CORE_OS") {
          query = query.or("game_name.eq.Core OS,game_name.is.null");
        } else if (effectiveScope === "SPOKES_ONLY") {
          query = query.not("game_name", "is", null).neq("game_name", "Core OS");
        } else if (effectiveScope !== "ALL") {
          query = query.eq("game_name", effectiveScope);
        }
      }

      // Time window filter
      const cutoffIso = getTimeCutoffIso(effectiveTimeRange);
      if (cutoffIso) {
        query = query.gte("created_at", cutoffIso);
      }

      // Server-side search
      if (debouncedSearch) {
        const safeQ = debouncedSearch.replace(/[,%()]/g, " ").trim();
        if (safeQ) {
          query = query.or(
            `action.ilike.%${safeQ}%,target_name.ilike.%${safeQ}%,target_table.ilike.%${safeQ}%,reason.ilike.%${safeQ}%`
          );
        }
      }

      // Server-side action category or exact action filter
      if (
        effectiveFilter &&
        effectiveFilter !== "ALL" &&
        effectiveFilter !== "overview" &&
        effectiveFilter !== "all"
      ) {
        if (effectiveFilter === "CAT_CREATE") {
          query = query.or("action.ilike.%Create%,action.ilike.%Add%,action.ilike.%Register%,action.ilike.%Upload%");
        } else if (effectiveFilter === "CAT_UPDATE") {
          query = query.or("action.ilike.%Update%,action.ilike.%Edit%,action.ilike.%Sync%,action.ilike.%Change%");
        } else if (effectiveFilter === "CAT_DELETE") {
          query = query.or("action.ilike.%Delete%,action.ilike.%Remove%,action.ilike.%Purge%,action.ilike.%Deprecate%");
        } else if (effectiveFilter === "CAT_SECURITY") {
          query = query.or("action.ilike.%Ban%,action.ilike.%Flag%,action.ilike.%Malware%,action.ilike.%DEFCON%,action.ilike.%Sever%");
        } else {
          query = query.eq("action", effectiveFilter);
        }
      }

      const fromIdx = page * PAGE_SIZE;
      const toIdx = fromIdx + PAGE_SIZE - 1;
      const { data: rawLogs, count, error } = await query.range(fromIdx, toIdx);

      if (error || !rawLogs) {
        setLogs([]);
        setTotalCount(0);
        setLoading(false);
        return;
      }

      // Client-side strict isolation guard:
      // If not Keepers Core, strip any Core OS / Keeper-only rows (in case dev DB is shared)
      const activeWs = workspaces?.find((w: any) => w.id === activeWorkspaceId);
      const isolatedLogs = effectiveIsKeepers
        ? rawLogs
        : rawLogs.filter((row: any) => {
            if (isCoreOnlyAuditRow(row)) return false;
            if (
              row.game_name &&
              activeWs?.name &&
              row.game_name !== activeWs.name &&
              row.game_name !== activeWs.schema_id
            ) {
              return false;
            }
            return true;
          });

      const uuidRegex =
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
      const candidateIds = new Set<string>();
      isolatedLogs.forEach((l: any) => {
        if (l.actor_id && typeof l.actor_id === "string") {
          candidateIds.add(l.actor_id.trim());
        }
        if (l.target_id && typeof l.target_id === "string") {
          const m = l.target_id.match(uuidRegex);
          if (m) m.forEach((id: string) => candidateIds.add(id));
        }
        if (l.target_name && typeof l.target_name === "string") {
          const m = l.target_name.match(uuidRegex);
          if (m) m.forEach((id: string) => candidateIds.add(id));
        }
      });

      const uncachedActorIds = Array.from(candidateIds).filter(
        (id) => !profileCacheRef.current[id]
      );

      if (uncachedActorIds.length > 0) {
        const [{ data: spokeProfs }, { data: authProfs }, { data: spokeMasons }] =
          await Promise.all([
            client
              .from("profiles")
              .select(
                "id, username, role, is_banned, is_comm_banned, blacklist_reason, comm_blacklist_reason"
              )
              .in("id", uncachedActorIds),
            supabaseAuth
              .from("profiles")
              .select(
                "id, username, role, is_banned, is_comm_banned, blacklist_reason, comm_blacklist_reason"
              )
              .in("id", uncachedActorIds),
            client
              .from("masons")
              .select("id, name, profile_id")
              .in("id", uncachedActorIds),
          ]);

        if (spokeMasons) {
          spokeMasons.forEach((m: any) => {
            if (m?.id && m?.name && !profileCacheRef.current[m.id]) {
              profileCacheRef.current[m.id] = {
                id: m.id,
                username: m.name,
                role: "mason",
              };
            }
          });
        }

        if (authProfs) {
          authProfs.forEach((p: any) => {
            profileCacheRef.current[p.id] = p;
          });
        }
        if (spokeProfs) {
          spokeProfs.forEach((p: any) => {
            const existing = profileCacheRef.current[p.id];
            if (
              !existing ||
              !existing.username ||
              existing.username.startsWith("Citizen_")
            ) {
              profileCacheRef.current[p.id] = p;
            } else {
              profileCacheRef.current[p.id] = {
                ...existing,
                role: p.role && p.role !== "citizen" ? p.role : existing.role,
                is_banned: Boolean(existing.is_banned || p.is_banned),
                is_comm_banned: Boolean(
                  existing.is_comm_banned || p.is_comm_banned
                ),
                blacklist_reason:
                  existing.blacklist_reason || p.blacklist_reason,
                comm_blacklist_reason:
                  existing.comm_blacklist_reason || p.comm_blacklist_reason,
              };
            }
          });
        }
      }

      const replaceUuidsWithUsernames = (rawStr: string | null | undefined) => {
        if (!rawStr || typeof rawStr !== "string") return rawStr || "";
        return rawStr.replace(uuidRegex, (matchedUuid) => {
          const found =
            profileCacheRef.current[matchedUuid] ||
            profileCacheRef.current[matchedUuid.toLowerCase()];
          if (found?.username) {
            return `@${found.username}`;
          }
          return matchedUuid;
        });
      };

      const enriched = isolatedLogs.map((l: any) => {
        const parsed = parseAuditLogEntry(l);
        const prof = profileCacheRef.current[l.actor_id] || null;
        const resolvedTargetName = replaceUuidsWithUsernames(
          l.target_name || l.target_id || ""
        );
        const resolvedReason = replaceUuidsWithUsernames(parsed.cleanReason);
        return {
          ...l,
          target_name: resolvedTargetName || l.target_name,
          profiles: prof,
          actor: prof,
          _cleanReason: resolvedReason,
          _changes: parsed.changes,
          _hasChanges: parsed.hasChanges,
        };
      });

      const resolvedTotal = effectiveIsKeepers
        ? typeof count === "number"
          ? count
          : enriched.length
        : typeof count === "number" && isolatedLogs.length === rawLogs.length
          ? count
          : enriched.length;

      setLogs(enriched);
      setTotalCount(resolvedTotal);
      if (onCountChange) onCountChange(resolvedTotal);
      if (onLogsLoaded) onLogsLoaded(enriched);
    } catch (err) {
      console.error("Failed to fetch audit logs:", err);
    } finally {
      setLoading(false);
    }
  }, [
    resolveTargetClient,
    effectiveIsKeepers,
    effectiveScope,
    effectiveTimeRange,
    debouncedSearch,
    effectiveFilter,
    page,
    activeWorkspaceId,
  ]);

  const fetchLogsRef = useRef(fetchLogs);
  useEffect(() => {
    fetchLogsRef.current = fetchLogs;
  }, [fetchLogs]);

  // Fetch aged logs count when Retention Drawer is open
  useEffect(() => {
    if (!isRetentionOpen) return;
    const client = resolveTargetClient();
    if (!client) {
      setAgedLogsCount(0);
      return;
    }
    const cutoff = new Date(
      Date.now() - retentionDays * 24 * 60 * 60 * 1000
    ).toISOString();
    client
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .lt("created_at", cutoff)
      .then(({ count }) => {
        setAgedLogsCount(typeof count === "number" ? count : 0);
      });
  }, [isRetentionOpen, retentionDays, resolveTargetClient]);

  // Fetch logs when filters/page/search change
  useEffect(() => {
    if (!isInline && !isOpen) return;
    fetchLogs();
  }, [isOpen, isInline, fetchLogs]);

  // Subscribe to realtime inserts only when workspace/open state changes (not on every search/filter/page)
  useEffect(() => {
    if (!isInline && !isOpen) return;

    const client = resolveTargetClient();
    if (!client) return;

    const channelName = effectiveIsKeepers
      ? "core_audit_logs_realtime"
      : `spoke_audit_logs_${activeWorkspaceId || "active"}`;

    const channel = client
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "audit_logs" },
        () => {
          fetchLogsRef.current();
        }
      )
      .subscribe();

    return () => {
      try {
        client.removeChannel(channel);
      } catch {}
    };
  }, [isOpen, isInline, resolveTargetClient, effectiveIsKeepers, activeWorkspaceId]);

  const handleExportArchive = async (format: "json" | "csv") => {
    const client = resolveTargetClient();
    if (!client) return;
    setIsExporting(true);
    try {
      const { data } = await client
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5000);

      const rows = (data || [])
        .filter((r: any) => (effectiveIsKeepers ? true : !isCoreOnlyAuditRow(r)))
        .map((r: any) => {
          const parsed = parseAuditLogEntry(r);
          return {
            id: r.id,
            created_at: r.created_at,
            game_name: r.game_name || (effectiveIsKeepers ? "Core OS" : "Spoke"),
            action: r.action,
            target_table: r.target_table,
            target_name: r.target_name,
            actor_id: r.actor_id,
            reason: parsed.cleanReason,
            changes: parsed.changes,
          };
        });

      const stamp = new Date().toISOString().slice(0, 10);
      const scopeTag = effectiveIsKeepers ? "keepers-core" : activeWorkspaceId || "spoke";

      if (format === "json") {
        const blob = new Blob([JSON.stringify(rows, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `sanctuary-audit-archive-${scopeTag}-${stamp}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const headers = [
          "id",
          "created_at",
          "game_name",
          "action",
          "target_table",
          "target_name",
          "actor_id",
          "reason",
          "changes",
        ];
        const csvLines = [
          headers.join(","),
          ...rows.map((r: any) =>
            headers
              .map((h) => {
                const raw = h === "changes" ? JSON.stringify(r.changes || []) : r[h] ?? "";
                return `"${String(raw).replace(/"/g, '""')}"`;
              })
              .join(",")
          ),
        ];
        const blob = new Blob([csvLines.join("\n")], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `sanctuary-audit-archive-${scopeTag}-${stamp}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
      pushStatus(
        t("audit_export_json", "Audit Archive Exported"),
        "success"
      );
    } catch (err: any) {
      pushStatus(err?.message || "Export failed", "error");
    } finally {
      setIsExporting(false);
    }
  };

  const handlePruneOldLogs = async () => {
    const client = resolveTargetClient();
    if (!client) return;
    setIsPruning(true);
    try {
      const { error } = await client.rpc("prune_old_audit_logs", {
        p_retention_days: retentionDays,
      });
      if (error) throw error;
      pushStatus(
        t("audit_prune_success", "Aged audit logs pruned successfully."),
        "success"
      );
      await fetchLogs();
      setIsRetentionOpen(false);
    } catch (err: any) {
      pushStatus(
        err?.message || "Retention prune requires prune_old_audit_logs SQL function.",
        "error"
      );
    } finally {
      setIsPruning(false);
    }
  };

  const scopeOptions = useMemo(() => {
    const wsNames = Array.from(
      new Set(
        (workspaces || [])
          .filter((w: any) => w && w.id !== "default_workspace" && w.name)
          .map((w: any) => w.name)
      )
    );
    return [
      { id: "ALL", label: t("audit_scope_all", "All (Core + Spokes)") },
      { id: "CORE_OS", label: t("audit_scope_core_only", "Core OS Only") },
      { id: "SPOKES_ONLY", label: t("audit_scope_spoke_only", "Spoke Only") },
      ...wsNames.map((name) => ({ id: String(name), label: String(name) })),
    ];
  }, [workspaces, t]);

  if (!isInline && !isOpen) return null;

  const uniqueActions = Array.from(
    new Set(logs.map((l) => l.action).filter(Boolean))
  );
  const filterOptions = [
    { id: "ALL", label: t("all_actions", "All Actions") },
    { id: "CAT_CREATE", label: `${t("create", "Create")} / ${t("add", "Add")}` },
    { id: "CAT_UPDATE", label: `${t("edit", "Update")} / ${t("modify", "Edit")}` },
    { id: "CAT_DELETE", label: `${t("delete", "Delete")} / ${t("remove", "Remove")}` },
    { id: "CAT_SECURITY", label: t("security_alert", "Security & Compliance") },
    ...uniqueActions.map((a) => ({ id: a as string, label: a as string })),
  ];

  const timeRangeOptions = [
    { id: "ALL", label: t("audit_time_all", "All Time") },
    { id: "24h", label: t("audit_time_24h", "Last 24 Hours") },
    { id: "7d", label: t("audit_time_7d", "Last 7 Days") },
    { id: "30d", label: t("audit_time_30d", "Last 30 Days") },
    { id: "90d", label: t("audit_time_90d", "Last 90 Days") },
  ];

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const renderPaginationBar = () => {
    if (totalCount <= PAGE_SIZE && page === 0) return null;
    const startItem = totalCount === 0 ? 0 : page * PAGE_SIZE + 1;
    const endItem = Math.min(totalCount, (page + 1) * PAGE_SIZE);
    return (
      <div className="glass-panel rounded-2xl px-5 py-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-wrap items-center justify-between gap-4 w-full">
        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-[var(--subtext)]">
          <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
            {t("icon_database", "database")}
          </span>
          <span>
            {startItem}–{endItem} / {totalCount.toLocaleString()}{" "}
            {t("audit_logs", "Audit Logs")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ActionButton
            variant="glass"
            icon={t("icon_chevron_left", "chevron_left")}
            label={t("back", "Previous")}
            disabled={page <= 0 || loading}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          />
          <span className="px-3 py-1.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[10px] font-mono font-black text-[var(--text)]">
            {t("audit_page_of", "Page")} {page + 1} / {totalPages}
          </span>
          <ActionButton
            variant="glass"
            icon={t("icon_chevron_right", "chevron_right")}
            label={t("next", "Next")}
            disabled={page + 1 >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
          />
        </div>
      </div>
    );
  };

  const renderRetentionDrawer = () => (
    <SidePanel
      isOpen={isRetentionOpen}
      onClose={() => setIsRetentionOpen(false)}
      title={t("audit_retention_title", "Audit Log Storage & Retention")}
      subtitle={t(
        "audit_retention_subtitle",
        "Manage log volume, cold-storage exports, and rolling retention"
      )}
      icon={t("icon_auto_delete", "auto_delete")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] max-w-[540px]"
      backdropZ="z-[55000]"
      panelZ="z-[55001]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={t("icon_auto_delete", "auto_delete")}
            variant="danger"
            tooltip={
              isPruning
                ? t("audit_pruning", "Pruning Aged Logs...")
                : `${t("audit_prune_btn", "Prune Logs Older Than Window")} (${retentionDays}d)`
            }
            disabled={isPruning || agedLogsCount === 0}
            onClick={handlePruneOldLogs}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-5">
        <SidePanelHeroCard
          icon={t("icon_database", "database")}
          overline={
            effectiveIsKeepers
              ? t("keepers_core", "KEEPERS CORE")
              : t("audit_scope_spoke_only", "Spoke Only")
          }
          title={t("audit_retention_title", "Audit Log Storage & Retention")}
          description={t(
            "audit_retention_desc",
            "Export cold-storage archives (JSON or CSV) and prune aged entries beyond your retention window while preserving recent compliance history."
          )}
          badge={`${totalCount.toLocaleString()} ${t("audit_logs", "Logs")}`}
          variant="accent"
        >
          <div className="grid grid-cols-2 gap-3 w-full">
            <StatBox
              label={t("audit_total_records", "Total Records")}
              value={totalCount.toLocaleString()}
              icon={t("icon_history", "history")}
            />
            <StatBox
              label={`${t("audit_aged_records", "Aged Records")} (>${retentionDays}d)`}
              value={agedLogsCount.toLocaleString()}
              icon={t("icon_auto_delete", "auto_delete")}
              iconColorClass={
                agedLogsCount > 0 ? "text-[var(--warning)]" : "text-[var(--success)]"
              }
            />
          </div>
        </SidePanelHeroCard>

        <UniversalGroup
          title={t("audit_export_json", "Export Archive")}
          icon={t("icon_download", "download")}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
            <ActionButton
              variant="glass"
              icon={t("icon_data_object", "data_object")}
              label={t("audit_export_json", "Export JSON Archive")}
              disabled={isExporting || totalCount === 0}
              onClick={() => handleExportArchive("json")}
            />
            <ActionButton
              variant="glass"
              icon={t("icon_table_view", "table_view")}
              label={t("audit_export_csv", "Export CSV Archive")}
              disabled={isExporting || totalCount === 0}
              onClick={() => handleExportArchive("csv")}
            />
          </div>
        </UniversalGroup>

        <UniversalGroup
          title={t("audit_retention_window", "Retention Window")}
          icon={t("icon_schedule", "schedule")}
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 w-full">
            {[30, 60, 90, 180].map((days) => (
              <DashboardStatTile
                key={days}
                variant="filter"
                compact={true}
                icon={t("icon_event_repeat", "event_repeat")}
                title={`${days}D`}
                value={`${days}d`}
                active={retentionDays === days}
                onClick={() => setRetentionDays(days)}
                accentColor="accent"
              />
            ))}
          </div>
        </UniversalGroup>
      </div>
    </SidePanel>
  );

  const renderLogDetailsDrawer = () => {
    const cleanReason =
      selectedLog?._cleanReason ??
      (selectedLog ? parseAuditLogEntry(selectedLog).cleanReason : "");
    const changes =
      selectedLog?._changes ??
      (selectedLog ? parseAuditLogEntry(selectedLog).changes : []);

    return (
      <>
        <SidePanel
          isOpen={!!selectedLog}
          onClose={() => setSelectedLog(null)}
          title={t("audit_details_title", "Audit Log Details")}
          subtitle={
            selectedLog
              ? new Date(selectedLog.created_at).toLocaleString()
              : undefined
          }
          icon={t("icon_history", "history")}
          iconColorClass="text-[var(--accent)]"
          widthClass="w-[90vw] max-w-[560px]"
          backdropZ="z-[55000]"
          panelZ="z-[55001]"
          headerActions={
            selectedLog?.profiles && !hideEditIdentity ? (
              <PanelHeaderGroup>
                <PanelHeaderButton
                  icon={t("icon_person", "person")}
                  tooltip={t("edit_identity", "Edit Identity")}
                  onClick={() => setSelectedProfile(selectedLog.profiles)}
                />
              </PanelHeaderGroup>
            ) : undefined
          }
        >
        {selectedLog && (
          <div className="flex flex-col gap-5">
            <SidePanelHeroCard
              icon={t("icon_receipt_long", "receipt_long")}
              overline={t("audit_logs", "Audit Logs")}
              title={selectedLog.action || t("action", "Action")}
              description={
                cleanReason ||
                t("audit_logs_desc", "System and user activity logs")
              }
              badge={selectedLog.target_table || "system"}
              badgeIcon={t("icon_database", "database")}
              variant="accent"
            >
              <div className="grid grid-cols-2 gap-3 w-full">
                <StatBox
                  label={t("actor", "Actor")}
                  value={
                    selectedLog.profiles?.username
                      ? `@${selectedLog.profiles.username}`
                      : t("system", "System")
                  }
                  icon={t("icon_person", "person")}
                />
                <StatBox
                  label={t("role", "Role")}
                  value={(
                    selectedLog.profiles?.role || t("system", "System")
                  ).toUpperCase()}
                  icon={t("icon_badge", "badge")}
                />
                {effectiveIsKeepers && (
                  <StatBox
                    label={t("workspace", "Workspace")}
                    value={selectedLog.game_name || "Core OS"}
                    icon={t("icon_dns", "dns")}
                  />
                )}
                <StatBox
                  label={t("target", "Target")}
                  value={
                    selectedLog.target_name ||
                    selectedLog.target_table ||
                    t("system", "System")
                  }
                  icon={t("icon_target", "my_location")}
                />
              </div>
            </SidePanelHeroCard>

            {/* Recorded Edits / Field Diff Breakdown */}
            <UniversalGroup
              title={t(
                "audit_recorded_edits",
                "Recorded Edits & Field Changes"
              )}
              icon={t("icon_difference", "difference")}
            >
              {changes.length > 0 ? (
                <div className="flex flex-col gap-2.5 w-full">
                  {changes.map((chg: any, idx: number) => (
                    <div
                      key={`${chg.field}_${idx}`}
                      className="flex flex-col gap-2.5 p-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className={`${VAULT_CHIP_CLASS} !border-[color-mix(in_srgb,var(--accent)_35%,transparent)] !text-[var(--accent)]`}>
                          <span className="material-symbols-outlined !text-[12px]">
                            {t("icon_edit_note", "edit_note")}
                          </span>
                          <span>{chg.label}</span>
                        </span>
                        <span className={`${VAULT_CHIP_CLASS} font-mono text-[var(--subtext)]`}>
                          <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                            {t("icon_code", "code")}
                          </span>
                          <span>{chg.field}</span>
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-0.5">
                        {chg.from !== undefined && (
                          <div className="flex flex-col gap-1 p-2.5 rounded-lg bg-[color-mix(in_srgb,var(--danger)_6%,transparent)] border border-[color-mix(in_srgb,var(--danger)_25%,transparent)]">
                            <span className="text-[8px] font-black uppercase tracking-widest text-[var(--danger)] opacity-80">
                              {t("audit_prev_value", "Previous")}
                            </span>
                            <span className="text-xs font-mono font-bold text-[var(--text)] break-words">
                              {chg.from}
                            </span>
                          </div>
                        )}
                        {chg.to !== undefined && (
                          <div
                            className={`flex flex-col gap-1 p-2.5 rounded-lg bg-[color-mix(in_srgb,var(--success)_6%,transparent)] border border-[color-mix(in_srgb,var(--success)_25%,transparent)] ${
                              chg.from === undefined ? "sm:col-span-2" : ""
                            }`}
                          >
                            <span className="text-[8px] font-black uppercase tracking-widest text-[var(--success)] opacity-80">
                              {t("audit_new_value", "Updated")}
                            </span>
                            <span className="text-xs font-mono font-bold text-[var(--text)] break-words">
                              {chg.to}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_8%,transparent)] text-xs font-bold text-[var(--subtext)]">
                  <div className="w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined !text-[16px]">
                      {t("icon_info", "info")}
                    </span>
                  </div>
                  <span>
                    {t(
                      "audit_no_field_diff",
                      "No granular field diff recorded for this entry."
                    )}
                  </span>
                </div>
              )}
            </UniversalGroup>

            {cleanReason && (
              <UniversalGroup
                title={t("reason", "Reason / Notes")}
                icon={t("icon_description", "description")}
              >
                <p className="text-xs font-bold text-[var(--text)] leading-relaxed whitespace-pre-wrap m-0 px-1">
                  {cleanReason}
                </p>
              </UniversalGroup>
            )}

            <UniversalGroup
              title={t("audit_actor", "Actor Identity")}
              icon={t("icon_person", "person")}
            >
              <div className="glass-surface rounded-xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-xs font-bold text-[var(--text)] flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined !text-[20px]">
                      {t("icon_person", "person")}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-sm font-black text-[var(--text)] truncate">
                      {selectedLog.profiles?.username
                        ? `@${selectedLog.profiles.username}`
                        : t("system", "System")}
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={VAULT_CHIP_CLASS}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                          {t("icon_badge", "badge")}
                        </span>
                        <span>
                          {(
                            selectedLog.profiles?.role || t("system", "System")
                          ).toUpperCase()}
                        </span>
                      </span>
                      {selectedLog.profiles?.is_banned && (
                        <span className={`${VAULT_CHIP_CLASS} !border-[color-mix(in_srgb,var(--danger)_40%,transparent)] !text-[var(--danger)]`}>
                          <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                            {t("icon_gpp_bad", "gpp_bad")}
                          </span>
                          <span>{t("status_banned", "Banned")}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {selectedLog.profiles && !hideEditIdentity && (
                  <ActionButton
                    variant="glass"
                    icon={t("icon_person", "person")}
                    onClick={() => setSelectedProfile(selectedLog.profiles)}
                    className="!px-4 !py-2 shrink-0"
                  >
                    {t("edit_identity", "Edit Identity")}
                  </ActionButton>
                )}
              </div>
            </UniversalGroup>
          </div>
        )}
        </SidePanel>

        <SharedIdentityEditor
          profile={selectedProfile}
          onClose={() => setSelectedProfile(null)}
          onUpdated={() => {
            profileCacheRef.current = {};
            fetchLogs();
          }}
          isSkinny={true}
          isKeepers={effectiveIsKeepers}
          backdropZ="z-[60000]"
          panelZ="z-[60001]"
        />
      </>
    );
  };

  const renderAuditCard = (log: any) => {
    const actionLower = (log.action || "").toLowerCase();
    const isDanger =
      actionLower.includes("delete") ||
      actionLower.includes("remove") ||
      actionLower.includes("purge") ||
      actionLower.includes("ban") ||
      actionLower.includes("malware") ||
      actionLower.includes("reject") ||
      actionLower.includes("sever");
    const isSuccess =
      actionLower.includes("create") ||
      actionLower.includes("add") ||
      actionLower.includes("approve") ||
      actionLower.includes("verify") ||
      actionLower.includes("register");

    const statusIcon = isDanger
      ? t("icon_gpp_maybe", "gpp_maybe")
      : isSuccess
        ? t("icon_check_circle", "check_circle")
        : t("icon_history", "history");
    const statusTextClass = isDanger
      ? "text-[var(--danger)]"
      : isSuccess
        ? "text-[var(--success)]"
        : "text-[var(--accent)]";
    const statusBorderClass = isDanger
      ? "border-[color-mix(in_srgb,var(--danger)_30%,transparent)]"
      : isSuccess
        ? "border-[color-mix(in_srgb,var(--success)_25%,transparent)]"
        : undefined;

    const actorName = log.profiles?.username
      ? `@${log.profiles.username}`
      : t("system", "System");
    const actorRole = (
      log.profiles?.role || t("system", "System")
    ).toUpperCase();

    const cleanReason = log._cleanReason ?? parseAuditLogEntry(log).cleanReason;
    const changes = log._changes ?? parseAuditLogEntry(log).changes;

    return (
      <UniversalCard
        key={log.id}
        layout="vertical"
        title={log.action || t("action", "Action")}
        subtitle={
          log.target_name ||
          log.target_table ||
          t("system_event", "System Event")
        }
        icon={statusIcon}
        statusColor={statusBorderClass}
        onClick={() => setSelectedLog(log)}
        imageOverlay={
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
            <div className={VAULT_CHIP_CLASS}>
              <span
                className={`material-symbols-outlined !text-[12px] ${statusTextClass}`}
              >
                {statusIcon}
              </span>
              <span>{actorRole}</span>
            </div>
          </div>
        }
        badges={
          <>
            {effectiveIsKeepers && (
              <div className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                  {t("icon_dns", "dns")}
                </span>
                <span className="truncate max-w-[130px]">
                  {log.game_name || "Core OS"}
                </span>
              </div>
            )}
            {log.target_table && (
              <div className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                  {t("icon_database", "database")}
                </span>
                <span className="font-mono">{log.target_table}</span>
              </div>
            )}
            <div className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                {t("icon_person", "person")}
              </span>
              <span className="truncate max-w-[140px]">{actorName}</span>
            </div>
            {changes.length > 0 && (
              <div className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                  {t("icon_difference", "difference")}
                </span>
                <span>
                  {changes.length} {t("audit_fields_edited", "Fields Edited")}
                </span>
              </div>
            )}
          </>
        }
        footer={
          <div className="flex items-center justify-between w-full text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
            <span className="font-mono opacity-75">
              {new Date(log.created_at).toLocaleString()}
            </span>
            <span className="text-[var(--text)] group-hover:text-[var(--accent)] transition-all flex items-center gap-1 shrink-0">
              {t("details", "Details")}{" "}
              <span className="text-base leading-none">&rarr;</span>
            </span>
          </div>
        }
      >
        <div className="flex flex-col gap-2">
          {cleanReason && (
            <p className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed line-clamp-2">
              {cleanReason}
            </p>
          )}
          {changes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {changes.slice(0, 2).map((chg: any, idx: number) => (
                <div
                  key={`${chg.field}_${idx}`}
                  className="px-2 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_8%,transparent)] text-[10px] font-mono flex items-center gap-1.5 max-w-full truncate"
                >
                  <span className="font-black text-[var(--subtext)]">
                    {chg.label}:
                  </span>
                  {chg.from !== undefined && chg.to !== undefined ? (
                    <span className="truncate text-[var(--text)]">
                      <span className="text-[var(--danger)] line-through opacity-75">
                        {chg.from}
                      </span>{" "}
                      &rarr;{" "}
                      <span className="text-[var(--success)] font-bold">
                        {chg.to}
                      </span>
                    </span>
                  ) : (
                    <span className="truncate text-[var(--accent)] font-bold">
                      {chg.to ?? chg.from}
                    </span>
                  )}
                </div>
              ))}
              {changes.length > 2 && (
                <span className="px-2 py-1 rounded-lg glass-surface text-[9px] font-black text-[var(--subtext)]">
                  +{changes.length - 2}
                </span>
              )}
            </div>
          )}
        </div>
      </UniversalCard>
    );
  };

  const renderSidePanelAuditRow = (log: any) => {
    const actionLower = (log.action || "").toLowerCase();
    const isDanger =
      actionLower.includes("delete") ||
      actionLower.includes("remove") ||
      actionLower.includes("purge") ||
      actionLower.includes("ban") ||
      actionLower.includes("malware") ||
      actionLower.includes("reject") ||
      actionLower.includes("sever");
    const isSuccess =
      actionLower.includes("create") ||
      actionLower.includes("add") ||
      actionLower.includes("approve") ||
      actionLower.includes("verify") ||
      actionLower.includes("register");

    const statusIcon = isDanger
      ? t("icon_gpp_maybe", "gpp_maybe")
      : isSuccess
        ? t("icon_check_circle", "check_circle")
        : t("icon_history", "history");
    const statusTextClass = isDanger
      ? "text-[var(--danger)]"
      : isSuccess
        ? "text-[var(--success)]"
        : "text-[var(--accent)]";
    const statusBorderClass = isDanger
      ? "border-[color-mix(in_srgb,var(--danger)_30%,transparent)]"
      : isSuccess
        ? "border-[color-mix(in_srgb,var(--success)_25%,transparent)]"
        : "border-[color-mix(in_srgb,var(--text)_10%,transparent)]";

    const actorName = log.profiles?.username
      ? `@${log.profiles.username}`
      : t("system", "System");
    const actorRole = (
      log.profiles?.role || t("system", "System")
    ).toUpperCase();

    const cleanReason = log._cleanReason ?? parseAuditLogEntry(log).cleanReason;
    const changes = log._changes ?? parseAuditLogEntry(log).changes;

    return (
      <div
        key={log.id}
        onClick={() => setSelectedLog(log)}
        className={`glass-surface rounded-2xl p-4 border ${statusBorderClass} hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] transition-all cursor-pointer group flex flex-col justify-between gap-3 w-full`}
      >
        <div className="flex flex-col gap-2.5 w-full">
          {/* Top Row: Boxed Icon on Left, Badges on Right */}
          <div className="flex items-center justify-between gap-2 w-full">
            <div className="w-9 h-9 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex items-center justify-center shrink-0">
              <span className={`material-symbols-outlined !text-[18px] ${statusTextClass}`}>
                {statusIcon}
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-1.5 min-w-0">
              {effectiveIsKeepers && (
                <div className={VAULT_CHIP_CLASS}>
                  <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                    {t("icon_dns", "dns")}
                  </span>
                  <span className="truncate max-w-[110px]">
                    {log.game_name || "Core OS"}
                  </span>
                </div>
              )}
              <div className={VAULT_CHIP_CLASS}>
                <span className={`material-symbols-outlined !text-[12px] ${statusTextClass}`}>
                  {statusIcon}
                </span>
                <span>{actorRole}</span>
              </div>
              <div className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                  {t("icon_person", "person")}
                </span>
                <span className="truncate max-w-[110px]">{actorName}</span>
              </div>
              {changes.length > 0 && (
                <div className={VAULT_CHIP_CLASS}>
                  <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                    {t("icon_difference", "difference")}
                  </span>
                  <span>{changes.length}</span>
                </div>
              )}
            </div>
          </div>

          {/* Middle Block: Overline + Full Title + Reason / Diffs */}
          <div className="flex flex-col gap-1 w-full">
            <span className="text-[9px] font-black uppercase tracking-widest text-[var(--accent)] opacity-90 truncate">
              {log.target_name && log.target_table
                ? `${log.target_name} • ${log.target_table}`
                : log.target_name ||
                  log.target_table ||
                  t("system_event", "System Event")}
            </span>
            <h4 className="text-sm font-black text-[var(--text)] tracking-tight leading-snug m-0">
              {log.action || t("action", "Action")}
            </h4>
            {cleanReason && (
              <p className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed line-clamp-2 m-0 pt-0.5">
                {cleanReason}
              </p>
            )}
            {changes.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {changes.slice(0, 2).map((chg: any, idx: number) => (
                  <div
                    key={`${chg.field}_${idx}`}
                    className="px-2 py-0.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[10px] font-mono flex items-center gap-1 max-w-full truncate"
                  >
                    <span className="font-black text-[var(--subtext)]">
                      {chg.label}:
                    </span>
                    {chg.from !== undefined && chg.to !== undefined ? (
                      <span className="truncate text-[var(--text)]">
                        <span className="text-[var(--danger)] line-through opacity-75">
                          {chg.from}
                        </span>{" "}
                        &rarr;{" "}
                        <span className="text-[var(--success)] font-bold">
                          {chg.to}
                        </span>
                      </span>
                    ) : (
                      <span className="truncate text-[var(--accent)] font-bold">
                        {chg.to ?? chg.from}
                      </span>
                    )}
                  </div>
                ))}
                {changes.length > 2 && (
                  <span className="px-2 py-0.5 rounded-lg glass-surface text-[9px] font-black text-[var(--subtext)]">
                    +{changes.length - 2}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer Row: Timestamp on Left, Details on Right */}
        <div className="flex items-center justify-between w-full pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
          <span className="font-mono opacity-75">
            {new Date(log.created_at).toLocaleString()}
          </span>
          <span className="text-[var(--text)] group-hover:text-[var(--accent)] transition-all flex items-center gap-1 shrink-0">
            {t("details", "Details")}{" "}
            <span className="text-base leading-none">&rarr;</span>
          </span>
        </div>
      </div>
    );
  };

  if (!isInline) {
    const securityCount = logs.filter((log) => {
      const a = (log.action || "").toLowerCase();
      return (
        a.includes("delete") ||
        a.includes("remove") ||
        a.includes("purge") ||
        a.includes("ban") ||
        a.includes("malware") ||
        a.includes("sever") ||
        a.includes("defcon")
      );
    }).length;
    const editedCount = logs.filter((log) => {
      const ch = log._changes ?? parseAuditLogEntry(log).changes;
      return ch.length > 0;
    }).length;

    return (
      <>
        <SidePanel
          isOpen={!!isOpen}
          onClose={onClose || (() => {})}
          title={t("audit_logs", "Audit Logs")}
          subtitle={t("audit_logs_desc", "System and user activity logs")}
          icon={t("icon_history", "history")}
          iconColorClass="theme-text-accent"
          widthClass="w-[90vw] md:w-[860px]"
          headerActions={
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon={t("icon_auto_delete", "auto_delete")}
                tooltip={t("audit_retention_btn", "Storage & Retention")}
                onClick={() => setIsRetentionOpen(true)}
              />
            </PanelHeaderGroup>
          }
        >
          <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
            <SidePanelHeroCard
              icon={t("icon_history", "history")}
              overline={t("audit_logs", "Audit Logs")}
              title={t("audit_logs_title", "System Activity Ledger")}
              description={t(
                "audit_logs_desc",
                "System and user activity logs"
              )}
              badge={`${totalCount.toLocaleString()} ${t("events", "Events")}`}
              variant="accent"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                <StatBox
                  label={t("audit_total_records", "Total Records")}
                  value={totalCount.toLocaleString()}
                  icon={t("icon_history", "history")}
                  iconColorClass="text-[var(--accent)]"
                />
                <StatBox
                  label={t("security_alert", "Security & Alerts")}
                  value={securityCount}
                  icon={t("icon_gpp_maybe", "gpp_maybe")}
                  iconColorClass={
                    securityCount > 0
                      ? "text-[var(--warning)]"
                      : "text-[var(--subtext)]"
                  }
                />
                <StatBox
                  label={t("audit_fields_edited", "Field Edits")}
                  value={editedCount}
                  icon={t("icon_difference", "difference")}
                  iconColorClass="text-[var(--success)]"
                />
              </div>
            </SidePanelHeroCard>

            <ActionPill
              searchQuery={search}
              setSearchQuery={setSearch}
              searchPlaceholder={t("search_logs", "Search logs...") as string}
              primaryPopover={{
                icon: t("icon_tune", "tune"),
                label: t("filters", "Filters"),
                content: (
                  <div className="flex flex-col w-[280px] p-4 max-w-[calc(100vw-40px)] gap-3">
                    {effectiveIsKeepers && (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                          {t("audit_scope_filter", "Log Scope")}
                        </span>
                        <CustomDropdown
                          flat={true}
                          disableTint={true}
                          variant="pill"
                          value={scopeFilter}
                          onChange={(v: string[]) => setScopeFilter(v[0] || "ALL")}
                          options={scopeOptions}
                        />
                      </div>
                    )}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("auto_filter_logs", "Action Type")}
                      </span>
                      <CustomDropdown
                        flat={true}
                        disableTint={true}
                        variant="pill"
                        value={filterAction === "overview" ? "ALL" : filterAction}
                        onChange={(v: string[]) => setFilterAction(v[0] || "ALL")}
                        options={filterOptions}
                        searchable={true}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("audit_time_range", "Time Window")}
                      </span>
                      <CustomDropdown
                        flat={true}
                        disableTint={true}
                        variant="pill"
                        value={timeRange}
                        onChange={(v: string[]) => setTimeRange(v[0] || "ALL")}
                        options={timeRangeOptions}
                      />
                    </div>
                  </div>
                ),
              }}
            />

            <UniversalGroup
              title={`${t("audit_logs", "Audit Logs")} (${totalCount.toLocaleString()})`}
              icon={t("icon_receipt_long", "receipt_long")}
            >
              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
                  {[...Array(6)].map((_, i) => (
                    <div
                      key={i}
                      className="p-4 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--text)_8%,transparent)] min-h-[140px] animate-pulse"
                    />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
                  {logs.map(renderSidePanelAuditRow)}
                  {logs.length === 0 && (
                    <EmptyState
                      icon={t("icon_history", "history")}
                      title={t("audit_no_logs", "No Audit Logs")}
                      className="col-span-full py-12"
                    />
                  )}
                </div>
              )}
            </UniversalGroup>

            {renderPaginationBar()}
          </div>
        </SidePanel>
        {renderLogDetailsDrawer()}
        {renderRetentionDrawer()}
      </>
    );
  }

  if (embedded) {
    return (
      <div className="flex-1 flex flex-col gap-6 w-full animate-in fade-in pb-16">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6 w-full">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="flex flex-col justify-start p-6 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] relative min-h-[220px] animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6 w-full">
            {logs.map(renderAuditCard)}
            {logs.length === 0 && (
              <EmptyState
                icon={t("icon_history", "history")}
                title={t("audit_no_logs", "No Audit Logs")}
                className="col-span-full py-16"
              />
            )}
          </div>
        )}
        {renderPaginationBar()}
        {renderLogDetailsDrawer()}
        {renderRetentionDrawer()}
      </div>
    );
  }

  const anomalyLogs = logs.filter((log) => {
    const actionLower = (log.action || "").toLowerCase();
    return (
      actionLower.includes("malware") ||
      actionLower.includes("ban") ||
      actionLower.includes("delete") ||
      actionLower.includes("purge") ||
      actionLower.includes("flag") ||
      actionLower.includes("sever")
    );
  });

  return (
    <ElevatedHubLayout
      hideHeader={false}
      headerTitle={t("audit_logs", "Audit Logs")}
      headerSubtitle={t("audit_logs_desc", "System and user activity logs")}
      headerIcon="history"
      headerIconColorClass="theme-text-accent"
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder={t("search_logs", "Search logs...") as string}
      hideSearch={filterAction === "overview"}
      activeTab={filterAction === "overview" ? "overview" : "all"}
      onTabChange={(tabId: string) =>
        setFilterAction(tabId === "overview" ? "overview" : "ALL")
      }
      tabs={[
        {
          id: "overview",
          label: t("overview", "Overview"),
          icon: t("icon_dashboard", "dashboard"),
          number: totalCount.toString(),
        },
        {
          id: "all",
          label: t("all_logs", "All Logs"),
          icon: t("icon_list", "list"),
          number: totalCount.toString(),
        },
      ]}
      actions={[
        {
          id: "audit_retention",
          icon: t("icon_auto_delete", "auto_delete"),
          label: t("audit_retention_btn", "Storage & Retention"),
          onClick: () => setIsRetentionOpen(true),
        },
      ]}
      primaryPopover={
        filterAction !== "overview"
          ? {
              icon: "tune",
              label: t("filters", "Filters"),
              content: (
                <div className="flex flex-col w-[300px] p-4 max-w-[calc(100vw-40px)] gap-4">
                  {effectiveIsKeepers && (
                    <div className="flex flex-col gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("audit_scope_filter", "Log Scope")}
                      </span>
                      <CustomDropdown
                        flat={true}
                        disableTint={true}
                        variant="pill"
                        value={scopeFilter}
                        onChange={(v: string[]) => setScopeFilter(v[0] || "ALL")}
                        options={scopeOptions}
                      />
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                      {t("audit_time_range", "Time Window")}
                    </span>
                    <CustomDropdown
                      flat={true}
                      disableTint={true}
                      variant="pill"
                      value={timeRange}
                      onChange={(v: string[]) => setTimeRange(v[0] || "ALL")}
                      options={timeRangeOptions}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                      {t("auto_filter_logs", "Action Type")}
                    </span>
                    <CustomDropdown
                      flat={true}
                      disableTint={true}
                      variant="pill"
                      value={filterAction === "overview" ? "ALL" : filterAction}
                      onChange={(v: string[]) => setFilterAction(v[0] || "ALL")}
                      options={filterOptions}
                      placeholder={t("auto_filter_logs", "Action Type") as string}
                      searchable={true}
                    />
                  </div>
                </div>
              ),
            }
          : undefined
      }
    >
      {filterAction === "overview" ? (
        <HubOverviewLanding>
          <HubOverviewSection
            icon={t("icon_schedule", "schedule")}
            iconColorClass="text-[var(--accent)]"
            title={t("chameleons_overview_recent", "Recent")}
            isEmpty={logs.length === 0 && !loading}
            emptyIcon={t("icon_history", "history")}
            emptyTitle={t("no_logs", "No Activity Logs")}
            gridClassName="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            {logs.slice(0, 4).map(renderAuditCard)}
          </HubOverviewSection>

          <HubOverviewSection
            icon={t("icon_warning", "warning")}
            iconColorClass="text-[var(--warning)]"
            title={t("chameleons_overview_anomalies", "Anomalies")}
            isEmpty={anomalyLogs.length === 0 && !loading}
            emptyIcon={t("icon_check_circle", "check_circle")}
            emptyTitle={t("no_issues", "No issues detected")}
            gridClassName="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            {anomalyLogs.slice(0, 4).map(renderAuditCard)}
          </HubOverviewSection>
        </HubOverviewLanding>
      ) : (
        <div className="flex-1 flex flex-col gap-6 w-full animate-in fade-in pb-16">
          {loading ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6 w-full">
              {[...Array(12)].map((_, i) => (
                <div
                  key={i}
                  className="flex flex-col justify-start p-6 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] relative min-h-[220px] animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6 w-full">
              {logs.map(renderAuditCard)}
              {logs.length === 0 && (
                <EmptyState
                  icon={t("icon_history", "history")}
                  title={t("audit_no_logs", "No Audit Logs")}
                  className="col-span-full py-16"
                />
              )}
            </div>
          )}
          {renderPaginationBar()}
        </div>
      )}

      {renderLogDetailsDrawer()}
      {renderRetentionDrawer()}
    </ElevatedHubLayout>
  );
}
export default AuditLogViewer;
