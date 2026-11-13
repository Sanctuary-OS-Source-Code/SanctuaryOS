import { useState, useEffect } from "react";
import { supabase, supabaseAuth } from "../supabase";
import { useStore } from "../store";
import { logArchitectAction } from "../lib/audit";

export type HubId = "mason" | "architect" | "oversight" | "wayfinder" | "keeper";

interface HubCacheEntry<T = any> {
  updatedAt: number;
  data: T;
}

const HUB_CACHE_PREFIX = "sanctuary_hub_cmd_v2:";
const memoryCache = new Map<string, HubCacheEntry>();
const masonProfileCache = new Map<string, { updatedAt: number; profile: any }>();

export function getHubCommandCache<T = any>(hubId: HubId, scopeId: string): T | null {
  const key = `${HUB_CACHE_PREFIX}${hubId}:${scopeId || "global"}`;
  const mem = memoryCache.get(key);
  if (mem) return mem.data as T;

  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HubCacheEntry<T>;
    if (parsed && parsed.data) {
      memoryCache.set(key, parsed);
      return parsed.data;
    }
  } catch {
    // Ignore storage read errors
  }
  return null;
}

export function setHubCommandCache<T = any>(hubId: HubId, scopeId: string, data: T): void {
  const key = `${HUB_CACHE_PREFIX}${hubId}:${scopeId || "global"}`;
  const entry: HubCacheEntry<T> = {
    updatedAt: Date.now(),
    data,
  };
  memoryCache.set(key, entry);
  try {
    sessionStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Ignore quota errors
  }
}

export function invalidateHubCommandCache(hubId?: HubId): void {
  if (!hubId) {
    memoryCache.clear();
    try {
      Object.keys(sessionStorage).forEach((k) => {
        if (k.startsWith(HUB_CACHE_PREFIX)) sessionStorage.removeItem(k);
      });
    } catch {}
    return;
  }
  const prefix = `${HUB_CACHE_PREFIX}${hubId}:`;
  for (const k of Array.from(memoryCache.keys())) {
    if (k.startsWith(prefix)) memoryCache.delete(k);
  }
  try {
    Object.keys(sessionStorage).forEach((k) => {
      if (k.startsWith(prefix)) sessionStorage.removeItem(k);
    });
  } catch {}
}

export function getCachedMasonProfile(userId: string, scopeId: string): any | undefined {
  const entry = masonProfileCache.get(`${userId}:${scopeId}`);
  if (!entry) return undefined;
  return entry.profile;
}

export function setCachedMasonProfile(userId: string, scopeId: string, profile: any): void {
  masonProfileCache.set(`${userId}:${scopeId}`, {
    updatedAt: Date.now(),
    profile,
  });
}

export function isStaffOrCoreRole(userRole?: string | null, osRole?: string | null): boolean {
  return (
    ["architect", "senior_architect", "oversight", "wayfinder", "admin"].includes(
      String(userRole || "").toLowerCase()
    ) ||
    ["core_dev", "admin", "keeper"].includes(String(osRole || "").toLowerCase())
  );
}

export function useVerifiedMasonOrStaff(): boolean {
  const session = useStore((s) => s.session);
  const userRole = useStore((s) => s.userRole);
  const osRole = useStore((s) => s.osRole);
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);
  const userId = session?.user?.id || "";
  const scopeKey = activeWorkspaceId || "global";
  const staffOverride = isStaffOrCoreRole(userRole, osRole);

  const [isOwnedMasonVerified, setIsOwnedMasonVerified] = useState<boolean>(() => {
    if (!userId) return false;
    const cached = getCachedMasonProfile(userId, scopeKey);
    return Boolean(cached && !cached.isUnverifiedLocal && cached.is_verified === true);
  });

  useEffect(() => {
    if (!userId) {
      setIsOwnedMasonVerified(false);
      return;
    }
    if (staffOverride) {
      setIsOwnedMasonVerified(true);
      return;
    }
    const cached = getCachedMasonProfile(userId, scopeKey);
    if (cached !== undefined) {
      setIsOwnedMasonVerified(Boolean(!cached.isUnverifiedLocal && cached.is_verified === true));
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    let cancelled = false;
    supabase
      .from("masons")
      .select("*")
      .eq("profile_id", userId)
      .maybeSingle()
      .then(
        ({ data, error }) => {
          if (cancelled) return;
          if (!error && data) {
            setCachedMasonProfile(userId, scopeKey, data);
            setIsOwnedMasonVerified(Boolean(data.is_verified === true));
          } else if (!error) {
            setIsOwnedMasonVerified(false);
          }
        },
        () => {}
      );
    return () => {
      cancelled = true;
    };
  }, [userId, scopeKey, staffOverride]);

  return staffOverride || isOwnedMasonVerified;
}

export function isTicketOpenStatus(status: string | null | undefined): boolean {
  const upper = String(status || "OPEN").trim().toUpperCase();
  return !["RESOLVED", "REJECTED", "CLOSED"].includes(upper);
}

export function isTicketClaimedBy(ticket: any): string {
  if (!ticket || !isTicketOpenStatus(ticket.status)) return "";
  const claimer = ticket?.metadata?.claimed_by;
  return claimer ? String(claimer).trim() : "";
}

export function isTicketVisibleToStaff(ticket: any, currentUserId?: string | null): boolean {
  const claimer = isTicketClaimedBy(ticket);
  if (!claimer) return true;
  if (!currentUserId) return false;
  return claimer === String(currentUserId).trim();
}

export function isComplianceEscalatedReport(report: {
  source?: string;
  reason?: string;
  description?: string;
  reporter_name?: string;
  compliance_tier?: number | null;
  violations?: any[];
}): boolean {
  const reporter = String(report?.reporter_name || "").trim();
  const reasonText = `${report?.reason || ""} ${report?.description || ""}`.trim();
  if (reporter === "Sanctuary OS Automated Compliance") return true;
  if (/^Nexus Compliance Audit:/i.test(String(report?.reason || report?.description || "").trim())) {
    return true;
  }
  if (Number(report?.compliance_tier || 0) >= 1) return true;
  if (
    Array.isArray(report?.violations) &&
    report.violations.some(
      (v: any) =>
        (typeof v?.tier === "number" && v.tier >= 1) ||
        /^Tier\s+[1-5]/i.test(String(v?.reason || ""))
    )
  ) {
    return true;
  }
  if (
    /tier\s*[1-5]|non-tier-0|compliance|piracy|nsfw|adult|paywall|malware/i.test(reasonText)
  ) {
    return true;
  }
  return false;
}

export function classifyKeeperTicket(
  ticket: any
): "bugs" | "feedback" | "contact" | "partner_apps" {
  const typeStr = String(ticket?.ticket_type || ticket?.category || "").toLowerCase();
  const titleStr = String(ticket?.title || "").toLowerCase();
  if (
    typeStr.includes("partner spoke") ||
    Boolean(ticket?.metadata?.partner_application) ||
    titleStr.startsWith("[partner spoke]")
  ) {
    return "partner_apps";
  }
  if (
    typeStr.startsWith("direct contact") ||
    Boolean(ticket?.metadata?.contact_meta) ||
    titleStr.startsWith("[contact")
  ) {
    return "contact";
  }
  if (
    typeStr.includes("feature request") ||
    typeStr.includes("public build feedback") ||
    typeStr.includes("beta build feedback") ||
    typeStr.startsWith("desktop app -") ||
    typeStr.startsWith("website -") ||
    typeStr.startsWith("mobile pwa -") ||
    (Boolean(ticket?.metadata?.feedback_meta) &&
      ticket?.metadata?.feedback_meta?.stream !== "Core Bug Report")
  ) {
    return "feedback";
  }
  return "bugs";
}

export interface ModTicketLookupMap {
  masonByModId: Record<string, string | null>;
  tierByModId: Record<string, number>;
  modIdByHash: Record<string, string>;
  modNameById: Record<string, string>;
}

export async function buildTicketModLookupMap(tickets: any[]): Promise<ModTicketLookupMap> {
  const lookup: ModTicketLookupMap = {
    masonByModId: {},
    tierByModId: {},
    modIdByHash: {},
    modNameById: {},
  };
  if (!tickets || tickets.length === 0) return lookup;

  const rawTargets = [
    ...new Set(
      tickets
        .map((tk) => tk.target_mod_id || tk.metadata?.target_mod_id)
        .filter(Boolean)
        .map((v) => String(v))
    ),
  ];
  if (rawTargets.length === 0) return lookup;

  const isUUID = (id: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const validModIds = rawTargets.filter(isUUID);
  const hashes = rawTargets.filter((id) => !isUUID(id));

  if (hashes.length > 0) {
    const { data: verData } = await supabase
      .from("mod_versions")
      .select("mod_id, dna_hash")
      .in("dna_hash", hashes);
    verData?.forEach((v: any) => {
      if (v.dna_hash && v.mod_id) {
        lookup.modIdByHash[v.dna_hash] = v.mod_id;
        if (!validModIds.includes(v.mod_id)) validModIds.push(v.mod_id);
      }
    });
  }

  if (validModIds.length > 0) {
    const { data: modsData } = await supabase
      .from("mods")
      .select("id, name, mason_id, compliance_tier")
      .in("id", validModIds);
    modsData?.forEach((m: any) => {
      lookup.masonByModId[m.id] = m.mason_id || null;
      lookup.tierByModId[m.id] = Number(m.compliance_tier || 0);
      if (m.name) lookup.modNameById[m.id] = m.name;
    });
  }

  return lookup;
}

export function routeSpokeTicketsForRole(
  tickets: any[],
  categories: any[],
  lookup: ModTicketLookupMap,
  userRole: "architect" | "oversight" | "wayfinder",
  currentUserId?: string | null
): any[] {
  if (!tickets || tickets.length === 0) return [];

  return tickets
    .filter((tk) => {
      if (!isTicketVisibleToStaff(tk, currentUserId)) return false;

      const rawTargetModId = tk.target_mod_id || tk.metadata?.target_mod_id;
      const resolvedModId = rawTargetModId
        ? lookup.modIdByHash[rawTargetModId] || rawTargetModId
        : null;
      const targetModTier = resolvedModId ? Number(lookup.tierByModId[resolvedModId] || 0) : 0;
      if (userRole === "architect" && targetModTier > 0) return false;

      const claimer = isTicketClaimedBy(tk);
      const claimedRole = tk.metadata?.claimed_role
        ? String(tk.metadata.claimed_role).toLowerCase()
        : "";
      if (claimer && claimedRole) {
        return claimedRole === userRole;
      }

      const typeStr = tk.ticket_type || tk.category || "";
      const cat = categories?.find(
        (c: any) => c.category_name === typeStr || c.category_code === typeStr
      );
      let baseDest = cat?.ticket_destination || "architect";
      if (
        typeStr === "BUG_MOD" ||
        typeStr.toLowerCase().includes("bug_mod") ||
        typeStr.toLowerCase().includes("artifact")
      ) {
        baseDest = "mod_author";
      }
      const escalationPath = cat?.escalation_path || "standard";

      if (userRole === "wayfinder") {
        const isTargeted = baseDest === "wayfinder";
        const logs = tk.metadata?.action_log || [];
        const isEscalatedFromOversight =
          String(tk.status || "").toUpperCase() === "ESCALATED" &&
          logs.some(
            (l: any) =>
              l.action === "ESCALATED" &&
              (l.architect === "Oversight" || l.architect === "Mason")
          );
        return isTargeted || isEscalatedFromOversight;
      }

      const ageMs = Date.now() - new Date(tk.created_at).getTime();
      const hoursOld = ageMs / (1000 * 60 * 60);

      let escalationTiers = 0;
      if (escalationPath === "urgent") {
        escalationTiers = Math.floor(hoursOld / 24);
      } else if (escalationPath === "standard") {
        escalationTiers = Math.floor(hoursOld / 72);
      }

      const tiers = ["mod_author", "architect", "oversight", "wayfinder"];
      let currentTierIndex = tiers.indexOf(baseDest);
      if (currentTierIndex === -1) currentTierIndex = 1;

      let effectiveTierIndex = currentTierIndex;
      if (escalationPath?.toLowerCase() !== "none") {
        effectiveTierIndex += escalationTiers;
      }
      effectiveTierIndex = Math.min(effectiveTierIndex, Math.max(2, currentTierIndex));
      let dest = tiers[effectiveTierIndex];

      if (String(tk.status || "").toUpperCase() === "ESCALATED") {
        const logs = tk.metadata?.action_log || [];
        const lastEscalation = [...logs].reverse().find((l: any) => l.action === "ESCALATED");
        if (lastEscalation) {
          const esciArc = lastEscalation.architect;
          if (esciArc === "Wayfinder" || esciArc === "Oversight") {
            dest = "wayfinder";
          } else if (esciArc === "Architect") {
            dest = "oversight";
          } else if (esciArc === "Mason" || esciArc === "Mod Author") {
            dest = "architect";
          } else {
            dest = tiers[Math.min(currentTierIndex + 1, tiers.length - 1)];
          }
        } else {
          dest = tiers[Math.min(currentTierIndex + 1, tiers.length - 1)];
        }
      }

      if (dest === "mod_author") {
        const modId = tk.target_mod_id || tk.metadata?.target_mod_id;
        const resolvedId = modId ? lookup.modIdByHash[modId] || modId : null;
        const modAuthorId = resolvedId ? lookup.masonByModId[resolvedId] : null;
        if (!modAuthorId) dest = "architect";
      }

      return dest === userRole;
    })
    .map((tk) => {
      const rawTargetModId = tk.target_mod_id || tk.metadata?.target_mod_id;
      const resolvedModId = rawTargetModId
        ? lookup.modIdByHash[rawTargetModId] || rawTargetModId
        : null;
      return {
        ...tk,
        target_mod_name:
          tk.target_mod_name ||
          (resolvedModId ? lookup.modNameById[resolvedModId] : undefined),
      };
    });
}

export function filterMasonBugTickets(
  tickets: any[],
  opts: {
    userId?: string | null;
    masonId?: string | null;
    masonModIds: string[];
    modNamesById?: Record<string, string>;
  }
): any[] {
  const { userId, masonId, masonModIds, modNamesById = {} } = opts;
  const modIdSet = new Set(masonModIds.filter(Boolean));
  const localModList = useStore.getState().modList || [];

  return (tickets || [])
    .filter((tk) => {
      const typeStr = String(tk.ticket_type || tk.category || "").toLowerCase();
      const isArtifactBug =
        (typeStr.includes("bug") || typeStr.includes("artifact")) && !typeStr.includes("os");
      if (!isArtifactBug) return false;

      const targetUser = tk.metadata?.target_user_id;
      const targetMason = tk.metadata?.target_mason;
      const ticketMasonId = tk.metadata?.mason_id;
      const targetMod = tk.target_mod_id || tk.metadata?.target_mod_id;

      if (
        userId &&
        (targetUser === userId || targetMason === userId || ticketMasonId === userId)
      ) {
        return true;
      }
      if (
        masonId &&
        (targetUser === masonId || targetMason === masonId || ticketMasonId === masonId)
      ) {
        return true;
      }
      if (targetMod && modIdSet.has(targetMod)) {
        return true;
      }
      return false;
    })
    .map((tk) => {
      const targetMod = tk.target_mod_id || tk.metadata?.target_mod_id;
      let localName: string | undefined = undefined;
      if (targetMod) {
        const localMatch = localModList.find(
          (lm: any) => lm.id === targetMod || lm.dbId === targetMod || lm.hash === targetMod
        );
        if (localMatch) localName = localMatch.displayName || localMatch.name;
      }
      return {
        ...tk,
        target_mod_name:
          tk.target_mod_name ||
          (targetMod ? modNamesById[targetMod] || localName : undefined),
      };
    });
}

export async function executeHubTicketAction(opts: {
  ticket: any;
  actionType: "RESOLVED" | "REJECTED" | "ESCALATED" | "PENDING";
  reason: string;
  actorRole: "mason" | "architect" | "oversight" | "wayfinder" | "keeper";
  tableName?: "sanctuary_tickets" | "keeper_tickets";
  t: (key: string, fallback: string) => string;
}): Promise<boolean> {
  const {
    ticket,
    actionType,
    reason,
    actorRole,
    tableName = "sanctuary_tickets",
    t,
  } = opts;
  if (!ticket) return false;

  const isKeepers = tableName === "keeper_tickets";
  const newStatus = actorRole === "mason" ? actionType.toLowerCase() : actionType.toUpperCase();
  const architectLabel =
    actorRole === "keeper"
      ? "Keeper"
      : actorRole === "wayfinder"
        ? "Wayfinder"
        : actorRole === "oversight"
          ? "Oversight"
          : actorRole === "architect"
            ? "Architect"
            : "Mason";

  const newMetadata: Record<string, any> = {
    ...(ticket.metadata || {}),
    action_log: [
      ...(ticket.metadata?.action_log || []),
      {
        action: actionType,
        reason,
        timestamp: new Date().toISOString(),
        architect: architectLabel,
      },
    ],
  };

  if (
    actionType === "ESCALATED" ||
    actionType === "RESOLVED" ||
    actionType === "REJECTED"
  ) {
    delete newMetadata.claimed_by;
    delete newMetadata.claimed_role;
  } else if (actionType === "PENDING") {
    const uid = useStore.getState().session?.user?.id;
    if (uid && actorRole !== "mason") {
      newMetadata.claimed_by = uid;
      newMetadata.claimed_role = actorRole;
    }
  }

  const client = isKeepers ? supabaseAuth : supabase;
  const { error } = await client
    .from(tableName)
    .update({
      status: newStatus,
      metadata: newMetadata,
    })
    .eq("id", ticket.id);

  if (error) {
    useStore
      .getState()
      .pushStatus(`${t("err_save_failed", "Save failed:")} ${error.message}`, "error");
    return false;
  }

  useStore
    .getState()
    .pushStatus(t("auto_ticket_status_updated_39", "Ticket status updated."), "success");

  if (actorRole !== "mason") {
    logArchitectAction(
      `Support Ticket ${actionType}: ${reason}`,
      tableName,
      ticket.id,
      reason,
      isKeepers ? "Keepers Core" : undefined,
      isKeepers,
      {
        status: { from: ticket.status, to: newStatus },
        resolution_action: { to: actionType },
      }
    );
  }
  return true;
}

export async function claimOrReleaseHubTicket(opts: {
  ticket: any;
  currentUserId: string | undefined;
  claim: boolean;
  actorRole?: "architect" | "oversight" | "wayfinder" | "keeper";
  tableName?: "sanctuary_tickets" | "keeper_tickets";
  t: (key: string, fallback: string) => string;
}): Promise<any | null> {
  const {
    ticket,
    currentUserId,
    claim,
    actorRole,
    tableName = "sanctuary_tickets",
    t,
  } = opts;
  if (!ticket || !currentUserId) return null;

  const newMetadata: Record<string, any> = { ...(ticket.metadata || {}) };
  if (claim) {
    newMetadata.claimed_by = currentUserId;
    if (actorRole) newMetadata.claimed_role = actorRole;
  } else {
    delete newMetadata.claimed_by;
    delete newMetadata.claimed_role;
  }

  const client = tableName === "keeper_tickets" ? supabaseAuth : supabase;
  const { error } = await client
    .from(tableName)
    .update({ metadata: newMetadata })
    .eq("id", ticket.id);

  if (error) {
    useStore
      .getState()
      .pushStatus(`${t("err_save_failed", "Save failed:")} ${error.message}`, "error");
    return null;
  }

  useStore
    .getState()
    .pushStatus(
      claim
        ? t("ticket_claim", "Claim Ticket")
        : t("ticket_release", "Release Ticket"),
      "success"
    );
  return { ...ticket, metadata: newMetadata };
}

