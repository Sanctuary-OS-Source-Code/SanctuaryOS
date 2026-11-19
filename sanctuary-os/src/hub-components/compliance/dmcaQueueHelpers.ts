import { createClient } from "@supabase/supabase-js";
import { spokeOversightFrom, supabaseAuth } from "../../supabase";
import { useStore } from "../../store";
import type { LegalTargetItem } from "../../landing/DmcaAndLegalFlowSteps";
import type { SpokeTargetPreResolvedMeta } from "../../landing/SpokeTargetDossierSidePanel";

export interface ResolvedDmcaTargetEntry {
  identifier: string;
  item: LegalTargetItem;
  spokeGame: any | null;
  preResolved?: SpokeTargetPreResolvedMeta;
}

export interface DmcaQueueFetchResult {
  notices: any[];
  activeCount: number;
  overdueCount: number;
  gamesMap: Record<string, any>;
  resolvedTargetsMap: Record<string, ResolvedDmcaTargetEntry>;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_REGEX = /^[0-9a-f]{64}$/i;

export const ACTIVE_DMCA_STATUSES = [
  "OPEN",
  "SPOKE_PENDING_SLA",
  "AWAITING_AUTHORITY",
  "VALIDATED_HOLD",
  "COUNTER_NOTICE_PENDING_10_14D",
];

export const SETTLED_DMCA_STATUSES = [
  "RESTORED",
  "REJECTED_INVALID",
  "RESOLVED",
  "CLOSED",
];

export type DmcaLaneId = "urgent" | "pending" | "settled";

export interface DmcaActiveTimerInfo {
  kind: "sla" | "counter_window" | "paused" | "settled" | "none";
  deadlineIso: string | null;
  text: string;
  remainingMs: number | null;
  isOverdue: boolean;
}

export function normalizeExternalUrl(rawUrl?: string | null): string | null {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    return null;
  }
  const withProto = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed.replace(/^\/+/, "")}`;
  try {
    const parsed = new URL(withProto);
    if (parsed.protocol === "http:") {
      const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
      if (!isLocal) parsed.protocol = "https:";
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function isSpokeTargetDmcaNotice(notice: any): boolean {
  return (
    Boolean(notice?.target_spoke_id) ||
    String(notice?.target_scope || "").toLowerCase() === "spoke"
  );
}

export function getNoticeActiveTimerInfo(
  notice: any,
  t: (k: string, f?: string) => string
): DmcaActiveTimerInfo {
  const status = String(notice?.relay_status || "OPEN").toUpperCase();

  if (SETTLED_DMCA_STATUSES.includes(status)) {
    return {
      kind: "settled",
      deadlineIso: null,
      text: t("dmca_timer_settled", "Settled"),
      remainingMs: null,
      isOverdue: false,
    };
  }

  if (status === "AWAITING_AUTHORITY") {
    return {
      kind: "paused",
      deadlineIso: null,
      text: t("dmca_timer_sla_paused", "SLA Paused"),
      remainingMs: null,
      isOverdue: false,
    };
  }

  if (status === "VALIDATED_HOLD" || status === "COUNTER_NOTICE_PENDING_10_14D") {
    const deadlineIso = notice?.counter_window_ends_at || null;
    if (!deadlineIso) {
      return {
        kind: "counter_window",
        deadlineIso: null,
        text: t("dmca_status_counter_window", "Counter Window (10–14d)"),
        remainingMs: null,
        isOverdue: false,
      };
    }
    const diffMs = new Date(deadlineIso).getTime() - Date.now();
    return {
      kind: "counter_window",
      deadlineIso,
      text: formatRemainingWindow(deadlineIso),
      remainingMs: Number.isFinite(diffMs) ? diffMs : null,
      isOverdue: Number.isFinite(diffMs) && diffMs <= 0,
    };
  }

  const deadlineIso = notice?.sla_deadline_at || notice?.counter_window_ends_at || null;
  if (!deadlineIso) {
    return {
      kind: "none",
      deadlineIso: null,
      text: "",
      remainingMs: null,
      isOverdue: Boolean(notice?.is_sla_overdue),
    };
  }
  const diffMs = new Date(deadlineIso).getTime() - Date.now();
  return {
    kind: notice?.sla_deadline_at ? "sla" : "counter_window",
    deadlineIso,
    text: formatRemainingWindow(deadlineIso),
    remainingMs: Number.isFinite(diffMs) ? diffMs : null,
    isOverdue: Boolean(notice?.is_sla_overdue) || (Number.isFinite(diffMs) && diffMs <= 0),
  };
}

export function filterDmcaNotices(
  notices: any[],
  options: {
    searchQuery?: string;
    scopeFilter?: string;
    resolvedTargetsMap?: Record<string, ResolvedDmcaTargetEntry>;
    gamesMap?: Record<string, any>;
  }
): any[] {
  const { searchQuery = "", scopeFilter = "all", resolvedTargetsMap = {}, gamesMap = {} } = options;
  const q = searchQuery.trim().toLowerCase();
  const cleanScope = String(scopeFilter || "all").trim();

  return (Array.isArray(notices) ? notices : []).filter((n) => {
    const isSpoke = isSpokeTargetDmcaNotice(n);
    const sid = String(n?.target_spoke_id || "").trim();

    if (cleanScope === "hub" && isSpoke) return false;
    if (cleanScope === "spokes" && !isSpoke) return false;
    if (cleanScope && cleanScope !== "all" && cleanScope !== "hub" && cleanScope !== "spokes") {
      if (sid !== cleanScope) return false;
    }

    if (!q) return true;
    const lookupSid = sid || "hub";
    const resolvedTitles = (Array.isArray(n?.target_identifiers) ? n.target_identifiers : [])
      .map((id: string) => resolvedTargetsMap[makeTargetLookupKey(lookupSid, id)]?.item?.title || "")
      .join(" ");
    const spokeName =
      n?.target_spoke_name ||
      n?.metadata?.target_spoke_name ||
      (sid ? gamesMap[sid]?.name : "") ||
      "";
    const hay = [
      n.id,
      n.notice_type,
      n.claimant_name_masked,
      n.decrypted_contact?.full_legal_name,
      n.reply_email_masked,
      n.work_description,
      n.work_url,
      n.relay_status,
      spokeName,
      resolvedTitles,
      ...(Array.isArray(n.target_identifiers) ? n.target_identifiers : []),
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

export function partitionDmcaNoticesByLane(
  notices: any[],
  t: (k: string, f?: string) => string
): {
  urgent: any[];
  pending: any[];
  settled: any[];
  active: any[];
} {
  const URGENT_THRESHOLD_MS = 48 * 60 * 60 * 1000;
  const urgent: any[] = [];
  const pending: any[] = [];
  const settled: any[] = [];

  for (const notice of Array.isArray(notices) ? notices : []) {
    const status = String(notice?.relay_status || "OPEN").toUpperCase();
    if (SETTLED_DMCA_STATUSES.includes(status) || !ACTIVE_DMCA_STATUSES.includes(status)) {
      settled.push(notice);
      continue;
    }

    const timer = getNoticeActiveTimerInfo(notice, t);
    const isSoonestTimer =
      timer.remainingMs !== null && timer.remainingMs <= URGENT_THRESHOLD_MS;

    if (
      Boolean(notice?.is_sla_overdue) ||
      timer.isOverdue ||
      status === "OPEN" ||
      status === "SPOKE_PENDING_SLA" ||
      isSoonestTimer
    ) {
      urgent.push(notice);
    } else {
      pending.push(notice);
    }
  }

  const byDeadlineAscThenNewestDesc = (a: any, b: any) => {
    const tA = getNoticeActiveTimerInfo(a, t);
    const tB = getNoticeActiveTimerInfo(b, t);
    const rA = tA.remainingMs;
    const rB = tB.remainingMs;
    if (rA !== null && rB !== null) {
      if (rA !== rB) return rA - rB;
    } else if (rA !== null) {
      return -1;
    } else if (rB !== null) {
      return 1;
    }
    const cA = new Date(a?.created_at || 0).getTime();
    const cB = new Date(b?.created_at || 0).getTime();
    return cB - cA;
  };

  urgent.sort(byDeadlineAscThenNewestDesc);
  pending.sort(byDeadlineAscThenNewestDesc);
  settled.sort((a: any, b: any) => {
    const sA = new Date(a?.resolved_at || a?.updated_at || a?.created_at || 0).getTime();
    const sB = new Date(b?.resolved_at || b?.updated_at || b?.created_at || 0).getTime();
    return sB - sA;
  });

  return {
    urgent,
    pending,
    settled,
    active: [...urgent, ...pending],
  };
}

export function resolveActiveGatewayGameId(filterGameId?: string): string | undefined {
  const state = useStore.getState();
  const activeWs = Array.isArray(state.workspaces)
    ? state.workspaces.find((w: any) => w.id === state.activeWorkspaceId)
    : null;
  const candidate =
    filterGameId ||
    activeWs?.game_id ||
    activeWs?.schema_id ||
    state.activeGameSchema?.id ||
    (state.activeWorkspaceId !== "default_workspace" &&
    state.activeWorkspaceId !== "web"
      ? state.activeWorkspaceId
      : undefined);
  return candidate ? String(candidate) : undefined;
}

export function getNoticeStatusMeta(notice: any, t: (k: string, f?: string) => string) {
  const status = String(notice?.relay_status || "OPEN").toUpperCase();
  if (notice?.is_sla_overdue) {
    return {
      label: t("dmca_status_sla_overdue", "48h SLA Overdue"),
      color: "danger" as const,
      variant: "danger" as const,
      iconName: t("icon_gavel", "gavel"),
      iconColorClass: "text-[var(--danger)]",
    };
  }
  switch (status) {
    case "AWAITING_AUTHORITY":
      return {
        label: t("dmca_status_awaiting_authority", "Verify Authority (SLA Paused)"),
        color: "warning" as const,
        variant: "warning" as const,
        iconName: t("icon_verified_user", "verified_user"),
        iconColorClass: "text-[var(--warning)]",
      };
    case "SPOKE_PENDING_SLA":
      return {
        label: t("dmca_status_spoke_sla", "48h Spoke SLA"),
        color: "warning" as const,
        variant: "warning" as const,
        iconName: t("icon_schedule", "schedule"),
        iconColorClass: "text-[var(--warning)]",
      };
    case "VALIDATED_HOLD":
      return {
        label: t("dmca_status_tier1_hold", "Tier 1 Hold (10–14d)"),
        color: "warning" as const,
        variant: "warning" as const,
        iconName: t("icon_policy", "policy"),
        iconColorClass: "text-[var(--warning)]",
      };
    case "COUNTER_NOTICE_PENDING_10_14D":
      return {
        label: t("dmca_status_counter_window", "Counter Window (10–14d)"),
        color: "accent" as const,
        variant: "accent" as const,
        iconName: t("icon_hourglass_top", "hourglass_top"),
        iconColorClass: "text-[var(--accent)]",
      };
    case "RESTORED":
      return {
        label: t("dmca_status_restored", "Restored (Tier 0)"),
        color: "success" as const,
        variant: "success" as const,
        iconName: t("icon_check_circle", "check_circle"),
        iconColorClass: "text-[var(--success)]",
      };
    case "REJECTED_INVALID":
      return {
        label: t("dmca_status_rejected", "Rejected Invalid"),
        color: "success" as const,
        variant: "accent" as const,
        iconName: t("icon_cancel", "cancel"),
        iconColorClass: "text-[var(--subtext)]",
      };
    default:
      return {
        label: t("dmca_status_open", "Pending Review"),
        color: "accent" as const,
        variant: "accent" as const,
        iconName: t("icon_gavel", "gavel"),
        iconColorClass: "text-[var(--accent)]",
      };
  }
}

export function getNoticeTypeLabel(notice: any, t: (k: string, f?: string) => string): string {
  const nt = String(notice?.notice_type || "").toLowerCase();
  if (nt === "dmca_takedown") {
    return t("dmca_flow_takedown_label", "DMCA Takedown");
  }
  if (nt === "dmca_counter") {
    return t("dmca_flow_counter_label", "Counter-Notice");
  }
  return t("dmca_flow_privacy_label", "Privacy & Legal");
}

export function formatRemainingWindow(deadlineIso?: string | null): string {
  if (!deadlineIso) return "";
  const diffMs = new Date(deadlineIso).getTime() - Date.now();
  const absHours = Math.round(Math.abs(diffMs) / (60 * 60 * 1000));
  if (diffMs <= 0) return `${absHours}h overdue`;
  if (absHours >= 48) return `${Math.ceil(absHours / 24)}d left`;
  return `${absHours}h left`;
}

export function makeTargetLookupKey(spokeId: string | null | undefined, token: string): string {
  return `${String(spokeId || "hub").toLowerCase()}::${String(token || "").trim().toLowerCase()}`;
}

export async function hydrateSpokeTargetsForIdentifiers(
  entries: Array<{ targetSpokeId?: string | null; identifiers: string[] }>,
  existingGamesMap?: Record<string, any>
): Promise<{
  gamesMap: Record<string, any>;
  resolvedTargetsMap: Record<string, ResolvedDmcaTargetEntry>;
}> {
  const gamesMap: Record<string, any> = { ...(existingGamesMap || {}) };
  const resolvedTargetsMap: Record<string, ResolvedDmcaTargetEntry> = {};

  const spokeIdsNeeded = Array.from(
    new Set(
      entries
        .map((e) => String(e.targetSpokeId || "").trim())
        .filter((id) => UUID_REGEX.test(id) && !gamesMap[id])
    )
  );

  if (spokeIdsNeeded.length > 0) {
    try {
      const { data: gRows } = await supabaseAuth
        .from("sanctuary_games")
        .select("id, name, schema_id, supabase_url, supabase_anon_key, icon")
        .in("id", spokeIdsNeeded);
      for (const g of gRows || []) {
        if (g?.id) gamesMap[String(g.id)] = g;
      }
    } catch {
      // Best-effort game catalog fetch
    }
  }

  const storeState = useStore.getState();
  const activeWs = Array.isArray(storeState.workspaces)
    ? storeState.workspaces.find((w: any) => w.id === storeState.activeWorkspaceId)
    : null;
  const activeWsGameId = String(activeWs?.game_id || "").trim();
  const activeWsSchemaId = String(activeWs?.schema_id || "").trim().toLowerCase();

  // Group unique identifiers by spokeId
  const bySpoke = new Map<string, Set<string>>();
  for (const entry of entries) {
    const sid = String(entry.targetSpokeId || "").trim();
    if (!sid || !UUID_REGEX.test(sid)) continue;
    let bucket = bySpoke.get(sid);
    if (!bucket) {
      bucket = new Set<string>();
      bySpoke.set(sid, bucket);
    }
    for (const rawId of entry.identifiers || []) {
      const clean = String(rawId || "").trim();
      if (clean) bucket.add(clean);
    }
  }

  await Promise.all(
    Array.from(bySpoke.entries()).map(async ([sid, tokenSet]) => {
      const tokens = Array.from(tokenSet);
      if (tokens.length === 0) return;

      const spokeGame = gamesMap[sid] || null;
      const isCurrentActiveSpoke = Boolean(
        storeState.activeWorkspaceId &&
          storeState.activeWorkspaceId !== "web" &&
          storeState.activeWorkspaceId !== "default_workspace" &&
          ((activeWsGameId && activeWsGameId === sid) ||
            (activeWsSchemaId &&
              spokeGame?.schema_id &&
              String(spokeGame.schema_id).toLowerCase() === activeWsSchemaId))
      );

      const spokeClient =
        spokeGame?.supabase_url && spokeGame?.supabase_anon_key
          ? createClient(spokeGame.supabase_url, spokeGame.supabase_anon_key, {
              auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false,
              },
            })
          : null;

      const querySource = isCurrentActiveSpoke
        ? (tbl: string) => spokeOversightFrom(tbl)
        : spokeClient
          ? (tbl: string) => spokeClient.from(tbl)
          : null;

      if (!querySource) return;

      const uuids = tokens.filter((tok) => UUID_REGEX.test(tok));
      const hashes = tokens
        .filter((tok) => SHA256_REGEX.test(tok))
        .map((tok) => tok.toLowerCase());
      const bpCodes = tokens.filter(
        (tok) => !UUID_REGEX.test(tok) && !SHA256_REGEX.test(tok) && !/^https?:\/\//i.test(tok)
      );

      try {
        if (uuids.length > 0) {
          const { data: modRows } = await querySource("mods")
            .select(
              "id, name, master_author, status, compliance_tier, url, description, created_at, mod_versions(dna_hash, version_label, created_at)"
            )
            .in("id", uuids);

          for (const m of modRows || []) {
            if (!m?.id) continue;
            const entry: ResolvedDmcaTargetEntry = {
              identifier: String(m.id),
              item: {
                identifier: String(m.id),
                kind: "mod",
                title: String(m.name || m.id),
                subtitle: m.master_author ? String(m.master_author) : undefined,
                is_held: Number(m.compliance_tier || 0) === 1,
              },
              spokeGame,
              preResolved: {
                description: m.description ? String(m.description) : undefined,
                url: m.url ? String(m.url) : undefined,
                status: m.status ? String(m.status) : undefined,
                complianceTier:
                  typeof m.compliance_tier === "number" ? m.compliance_tier : 0,
                createdAt: m.created_at ? String(m.created_at) : undefined,
                versions: Array.isArray(m.mod_versions) ? m.mod_versions : [],
              },
            };
            resolvedTargetsMap[makeTargetLookupKey(sid, String(m.id))] = entry;
          }
        }

        if (hashes.length > 0) {
          const { data: verRows } = await querySource("mod_versions")
            .select(
              "dna_hash, version_label, created_at, mods(id, name, master_author, status, compliance_tier, url, description, created_at)"
            )
            .in("dna_hash", hashes);

          for (const v of verRows || []) {
            const modObj = Array.isArray(v.mods) ? v.mods[0] : v.mods;
            if (v.dna_hash && modObj?.id) {
              const entry: ResolvedDmcaTargetEntry = {
                identifier: String(modObj.id),
                item: {
                  identifier: String(modObj.id),
                  kind: "mod",
                  title: String(modObj.name || modObj.id),
                  subtitle: modObj.master_author
                    ? String(modObj.master_author)
                    : undefined,
                  is_held: Number(modObj.compliance_tier || 0) === 1,
                },
                spokeGame,
                preResolved: {
                  description: modObj.description
                    ? String(modObj.description)
                    : undefined,
                  url: modObj.url ? String(modObj.url) : undefined,
                  status: modObj.status ? String(modObj.status) : undefined,
                  complianceTier:
                    typeof modObj.compliance_tier === "number"
                      ? modObj.compliance_tier
                      : 0,
                  createdAt: modObj.created_at
                    ? String(modObj.created_at)
                    : undefined,
                  versions: [
                    {
                      dna_hash: v.dna_hash,
                      version_label: v.version_label,
                      created_at: v.created_at,
                    },
                  ],
                },
              };
              resolvedTargetsMap[makeTargetLookupKey(sid, String(v.dna_hash))] =
                entry;
            }
          }
        }

        const unresolvedUuids = uuids.filter(
          (id) => !resolvedTargetsMap[makeTargetLookupKey(sid, id)]
        );
        if (bpCodes.length > 0 || unresolvedUuids.length > 0) {
          const bpFilter =
            bpCodes.length > 0 && unresolvedUuids.length > 0
              ? `code.in.(${bpCodes.join(",")}),id.in.(${unresolvedUuids.join(",")})`
              : null;
          const bpQuery = querySource("blueprints").select(
            "id, code, name, description, created_at, compliance_tier"
          );
          const { data: bpRows } = bpFilter
            ? await bpQuery.or(bpFilter)
            : bpCodes.length > 0
              ? await bpQuery.in("code", bpCodes)
              : await bpQuery.in("id", unresolvedUuids);

          for (const bp of bpRows || []) {
            const entry: ResolvedDmcaTargetEntry = {
              identifier: String(bp.code || bp.id),
              item: {
                identifier: String(bp.code || bp.id),
                kind: "blueprint",
                title: String(bp.name || bp.code || bp.id),
                is_held: Number(bp.compliance_tier || 0) === 1,
              },
              spokeGame,
              preResolved: {
                description: bp.description ? String(bp.description) : undefined,
                complianceTier:
                  typeof bp.compliance_tier === "number"
                    ? bp.compliance_tier
                    : 0,
                createdAt: bp.created_at ? String(bp.created_at) : undefined,
              },
            };
            if (bp.id) resolvedTargetsMap[makeTargetLookupKey(sid, String(bp.id))] = entry;
            if (bp.code) {
              resolvedTargetsMap[makeTargetLookupKey(sid, String(bp.code))] = entry;
            }
          }
        }
      } catch {
        // Best-effort Spoke target hydration
      }
    })
  );

  return { gamesMap, resolvedTargetsMap };
}

export async function fetchDmcaQueueNotices(options?: {
  filterGameId?: string;
  isKeepersHub?: boolean;
}): Promise<DmcaQueueFetchResult> {
  const filterGameId = options?.filterGameId;
  const isKeepersHub = Boolean(options?.isKeepersHub);
  const token = useStore.getState().session?.access_token || "";
  const targetGameId = isKeepersHub
    ? filterGameId
      ? resolveActiveGatewayGameId(filterGameId)
      : undefined
    : resolveActiveGatewayGameId(filterGameId);
  const { data, error } = await supabaseAuth.functions.invoke("game-gateway", {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: {
      ...(targetGameId ? { game_id: targetGameId } : {}),
      action: "list_spoke_dmca_notices",
      payload: {
        ...(filterGameId ? { filter_game_id: filterGameId } : {}),
      },
    },
  });

  if (error || data?.error) {
    throw new Error(error?.message || data?.error || "Failed to load DMCA queue");
  }

  const notices: any[] = Array.isArray(data?.notices) ? data.notices : [];
  const activeCount = notices.filter((r) =>
    ACTIVE_DMCA_STATUSES.includes(String(r?.relay_status || "").toUpperCase())
  ).length;
  const overdueCount = notices.filter((r) => Boolean(r?.is_sla_overdue)).length;

  // Hydrate Spoke game metadata + target item titles from server-resolved_targets AND Spoke DB
  const { gamesMap, resolvedTargetsMap } = await hydrateSpokeTargetsForIdentifiers(
    notices.map((n) => ({
      targetSpokeId: n.target_spoke_id,
      identifiers: Array.isArray(n.target_identifiers) ? n.target_identifiers : [],
    }))
  );

  // Merge any server-side resolved_targets from enhanced game-gateway response
  for (const notice of notices) {
    const sid = String(notice?.target_spoke_id || "hub").trim();
    const serverTargets = Array.isArray(notice?.resolved_targets)
      ? notice.resolved_targets
      : [];
    for (const rt of serverTargets) {
      const tokenKey = String(rt?.hash || rt?.identifier || "").trim();
      if (!tokenKey) continue;
      const mapKey = makeTargetLookupKey(sid, tokenKey);
      if (!resolvedTargetsMap[mapKey]) {
        resolvedTargetsMap[mapKey] = {
          identifier: String(rt.identifier || tokenKey),
          item: {
            identifier: String(rt.identifier || tokenKey),
            kind:
              rt.kind === "blueprint" || rt.kind === "collection"
                ? rt.kind
                : "mod",
            title: String(rt.title || tokenKey),
            subtitle: rt.subtitle ? String(rt.subtitle) : undefined,
            is_held: Number(rt.compliance_tier || 0) === 1,
          },
          spokeGame: gamesMap[sid] || null,
          preResolved: {
            description: rt.description ? String(rt.description) : undefined,
            url: rt.url ? String(rt.url) : undefined,
            status: rt.status ? String(rt.status) : undefined,
            complianceTier:
              typeof rt.compliance_tier === "number" ? rt.compliance_tier : 0,
            createdAt: rt.created_at ? String(rt.created_at) : undefined,
            versions: Array.isArray(rt.versions) ? rt.versions : [],
          },
        };
      }
    }
  }

  return {
    notices,
    activeCount,
    overdueCount,
    gamesMap,
    resolvedTargetsMap,
  };
}
