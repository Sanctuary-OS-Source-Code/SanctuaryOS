import { supabase, supabaseAuth, getActiveGameClient, RESOLVED_SANCTUARY_CONFIG, isStandaloneFork } from "../supabase";
import { useStore } from "../store";

export const AUDIT_DIFF_MARKER = "\n---AUDIT_DIFF---\n";

export const CORE_ONLY_AUDIT_TABLES = new Set([
  "keeper_system_broadcasts",
  "keeper_dispatch_poll_votes",
  "keeper_tickets",
  "keeper_support_categories",
  "keeper_heuristic_signatures",
  "system_directives",
  "sanctuary_games",
  "sanctuary_schemas",
  "sanctuary_lexicons",
  "sanctuary_themes",
  "sanctuary_theme_images",
]);

export interface AuditFieldDiff {
  from?: any;
  to?: any;
}

export type AuditChangesInput =
  | Record<string, AuditFieldDiff | any>
  | Array<{ field: string; from?: any; to?: any }>;

export interface ParsedAuditEdit {
  field: string;
  label: string;
  from?: string;
  to?: string;
}

const DEFAULT_IGNORED_DIFF_KEYS = new Set([
  "updated_at",
  "last_updated_at",
  "created_at",
  "actor_id",
  "author_id",
  "supabase_service_key",
]);

function truncateAuditVal(val: any, maxLen = 220): any {
  if (val === undefined) return undefined;
  if (val === null) return null;
  if (typeof val === "string") {
    const trimmed = val.trim();
    return trimmed.length > maxLen ? `${trimmed.slice(0, maxLen)}...` : trimmed;
  }
  if (typeof val === "number" || typeof val === "boolean") {
    return val;
  }
  if (Array.isArray(val)) {
    const str = val
      .map((item) => (typeof item === "object" && item !== null ? JSON.stringify(item) : String(item)))
      .join(", ");
    return str.length > maxLen ? `${str.slice(0, maxLen)}...` : str;
  }
  if (typeof val === "object") {
    try {
      const str = JSON.stringify(val);
      return str.length > maxLen ? `${str.slice(0, maxLen)}...` : str;
    } catch {
      return String(val);
    }
  }
  return String(val);
}

export function formatAuditFieldLabel(field: string): string {
  return String(field || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export function formatAuditValueDisplay(val: any): string {
  if (val === undefined || val === null || val === "") return "—";
  if (typeof val === "boolean") return val ? "True" : "False";
  if (typeof val === "object") {
    try {
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  }
  return String(val);
}

/**
 * Computes a clean field-by-field `{ from, to }` diff between `before` and `after` records.
 */
export function computeAuditDiff(
  before?: Record<string, any> | null,
  after?: Record<string, any> | null,
  ignoreKeys: string[] = []
): Record<string, AuditFieldDiff> {
  const ignored = new Set([...DEFAULT_IGNORED_DIFF_KEYS, ...ignoreKeys]);
  const out: Record<string, AuditFieldDiff> = {};

  if (!before && !after) return out;

  if (!before && after) {
    for (const [k, v] of Object.entries(after)) {
      if (ignored.has(k) || v === undefined || v === null || v === "") continue;
      out[k] = { to: truncateAuditVal(v) };
    }
    return out;
  }

  if (before && !after) {
    for (const [k, v] of Object.entries(before)) {
      if (ignored.has(k) || v === undefined || v === null || v === "") continue;
      out[k] = { from: truncateAuditVal(v) };
    }
    return out;
  }

  const allKeys = new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {}),
  ]);

  for (const k of allKeys) {
    if (ignored.has(k)) continue;
    const prevVal = before?.[k];
    const nextVal = after?.[k];
    const prevStr = JSON.stringify(prevVal ?? null);
    const nextStr = JSON.stringify(nextVal ?? null);
    if (prevStr !== nextStr) {
      out[k] = {
        from: truncateAuditVal(prevVal),
        to: truncateAuditVal(nextVal),
      };
    }
  }

  return out;
}

export function normalizeAuditChanges(
  changes?: AuditChangesInput | null
): Record<string, AuditFieldDiff> | null {
  if (!changes) return null;
  const normalized: Record<string, AuditFieldDiff> = {};

  if (Array.isArray(changes)) {
    for (const item of changes) {
      if (!item || !item.field) continue;
      normalized[item.field] = {
        ...(item.from !== undefined ? { from: truncateAuditVal(item.from) } : {}),
        ...(item.to !== undefined ? { to: truncateAuditVal(item.to) } : {}),
      };
    }
  } else if (typeof changes === "object") {
    for (const [key, val] of Object.entries(changes)) {
      if (val === undefined) continue;
      if (
        val !== null &&
        typeof val === "object" &&
        !Array.isArray(val) &&
        ("from" in val || "to" in val)
      ) {
        normalized[key] = {
          ...(val.from !== undefined ? { from: truncateAuditVal(val.from) } : {}),
          ...(val.to !== undefined ? { to: truncateAuditVal(val.to) } : {}),
        };
      } else {
        normalized[key] = { to: truncateAuditVal(val) };
      }
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

export function serializeAuditReasonWithDiff(
  reason: string,
  changes?: AuditChangesInput | null
): string {
  const baseReason = (reason || "").split(AUDIT_DIFF_MARKER)[0].trim() || "System Action";
  const normalized = normalizeAuditChanges(changes);
  if (!normalized) return baseReason;
  try {
    return `${baseReason}${AUDIT_DIFF_MARKER}${JSON.stringify(normalized)}`;
  } catch {
    return baseReason;
  }
}

/**
 * Parses an audit log row into a clean reason string and structured field-level edits.
 * Supports:
 * 1. Explicit `log.changes` JSONB column (if present)
 * 2. Embedded `---AUDIT_DIFF---` JSON block in `log.reason`
 * 3. Legacy inline action/reason patterns (e.g. `from X to Y`, `X -> Y`, `Status->verified`)
 */
export function parseAuditLogEntry(log: any): {
  cleanReason: string;
  changes: ParsedAuditEdit[];
  hasChanges: boolean;
} {
  const rawReason = String(log?.reason || "");
  const parts = rawReason.split(AUDIT_DIFF_MARKER);
  const cleanReason = parts[0].trim();
  const editsMap = new Map<string, ParsedAuditEdit>();

  const addEdit = (field: string, fromVal?: any, toVal?: any) => {
    const cleanKey = String(field || "").trim();
    if (!cleanKey) return;
    editsMap.set(cleanKey, {
      field: cleanKey,
      label: formatAuditFieldLabel(cleanKey),
      from: fromVal !== undefined && fromVal !== null ? formatAuditValueDisplay(fromVal) : undefined,
      to: toVal !== undefined && toVal !== null ? formatAuditValueDisplay(toVal) : undefined,
    });
  };

  // 1. Check `log.changes` JSONB column if present
  if (log?.changes && typeof log.changes === "object") {
    const norm = normalizeAuditChanges(log.changes);
    if (norm) {
      for (const [k, v] of Object.entries(norm)) {
        addEdit(k, v.from, v.to);
      }
    }
  }

  // 2. Check embedded diff block in `log.reason`
  if (parts.length > 1 && parts[1]) {
    try {
      const parsedJson = JSON.parse(parts[1].trim());
      const norm = normalizeAuditChanges(parsedJson);
      if (norm) {
        for (const [k, v] of Object.entries(norm)) {
          addEdit(k, v.from, v.to);
        }
      }
    } catch {
      // Ignore malformed JSON
    }
  }

  // 3. Fallback extraction for legacy audit strings so existing logs also display what changed
  if (editsMap.size === 0) {
    const actionStr = String(log?.action || "");

    // Pattern A: "Changed <field> from <old> to <new>"
    const fromToMatch = actionStr.match(/changed\s+(.+?)\s+from\s+(.+?)\s+to\s+(.+)$/i);
    if (fromToMatch) {
      addEdit(fromToMatch[1], fromToMatch[2], fromToMatch[3]);
    }

    // Pattern B: "Edited <thing> <old> -> <new>"
    const arrowMatch = actionStr.match(/edited\s+(.+?)\s+([^\s]+)\s*->\s*(.+)$/i);
    if (arrowMatch && editsMap.size === 0) {
      addEdit(arrowMatch[1], arrowMatch[2], arrowMatch[3]);
    }

    // Pattern C: "Mass Updated X Artifacts: Status->verified, Tier->2"
    if (actionStr.toLowerCase().startsWith("mass updated") && actionStr.includes(":")) {
      const afterColon = actionStr.split(":").slice(1).join(":").trim();
      const pairs = afterColon.split(",").map((s) => s.trim()).filter(Boolean);
      for (const p of pairs) {
        if (p.includes("->")) {
          const [k, v] = p.split("->").map((s) => s.trim());
          addEdit(k, undefined, v);
        } else {
          addEdit("operation", undefined, p);
        }
      }
    }

    // Pattern D: "Updated role to <role>"
    const roleMatch = actionStr.match(/updated\s+role\s+to\s+(.+)$/i);
    if (roleMatch && editsMap.size === 0) {
      addEdit("role", undefined, roleMatch[1]);
    }

    // Pattern E: "Set compliance flag for artifact: <name> to Tier <N>" or "Manually flagged with tier <N>"
    const tierMatch =
      actionStr.match(/to\s+tier\s+(\d+)/i) ||
      actionStr.match(/flagged\s+with\s+tier\s+(\d+)/i);
    if (tierMatch && editsMap.size === 0) {
      addEdit("compliance_tier", undefined, `Tier ${tierMatch[1]}`);
    }
  }

  const changes = Array.from(editsMap.values());
  return {
    cleanReason,
    changes,
    hasChanges: changes.length > 0,
  };
}

/**
 * Identifies whether an audit log row belongs strictly to Keepers Core OS.
 * Non-Keeper Spoke views use this to ensure Core OS logs are never shown outside Keepers Core.
 */
export function isCoreOnlyAuditRow(log: any): boolean {
  if (!log) return false;
  const gameName = String(log.game_name || "").trim().toLowerCase();
  if (gameName === "core os" || gameName === "sanctuary foundry" || gameName === "keepers core") {
    return true;
  }
  const targetTable = String(log.target_table || "").trim().toLowerCase();
  if (CORE_ONLY_AUDIT_TABLES.has(targetTable)) {
    return true;
  }
  const reason = String(log.reason || "").toLowerCase();
  if (reason.includes("automated from the keeper hub") || reason.includes("automated from the keepers core")) {
    return true;
  }
  return false;
}

function isEffectiveKeepersAction(
  target_table: string,
  sourceHub?: string,
  isKeepers?: boolean
): boolean {
  if (isKeepers) return true;
  const cleanHub = String(sourceHub || "").trim().toLowerCase();
  if (cleanHub === "keeper hub" || cleanHub === "keepers core") return true;
  const cleanTable = String(target_table || "").trim().toLowerCase();
  if (CORE_ONLY_AUDIT_TABLES.has(cleanTable)) return true;
  return false;
}

async function writeSpokeAndCoreAuditLog(params: {
  action: string;
  target_table: string;
  target_name: string;
  actor_id: string;
  reason: string;
  isKeepers: boolean;
  changes?: AuditChangesInput;
}) {
  const { action, target_table, target_name, actor_id, reason, isKeepers, changes } = params;
  const serializedReason = serializeAuditReasonWithDiff(reason, changes);

  const spokePayload = {
    action,
    target_table,
    target_name,
    actor_id,
    reason: serializedReason,
  };

  // 1. Keeper edits ONLY write to the Core OS Database (`supabaseAuth`)
  if (isKeepers) {
    await supabaseAuth.from("audit_logs").insert({
      ...spokePayload,
      game_name: "Core OS",
    });
    return;
  }

  // 2. Spoke edits write to BOTH the Spoke Database AND the Core OS Database
  const state = useStore.getState();
  const activeWs = state.workspaces?.find((w: any) => w.id === state.activeWorkspaceId);
  const gameName =
    activeWs?.name ||
    state.activeGameSchema?.display_name ||
    activeWs?.schema_id ||
    "Spoke Workspace";

  const cleanCoreUrl = (RESOLVED_SANCTUARY_CONFIG.supabaseUrl || "").trim().replace(/\/+$/, "");
  const cleanSpokeUrl = (activeWs?.supabase_url || "").trim().replace(/\/+$/, "");
  const isSharedDevDatabase =
    isStandaloneFork || !cleanSpokeUrl || cleanSpokeUrl === cleanCoreUrl;

  if (!isSharedDevDatabase) {
    let spokeWriteSucceeded = false;
    const spokeClient = getActiveGameClient();
    if (spokeClient) {
      const { error: directErr } = await spokeClient.from("audit_logs").insert(spokePayload);
      if (!directErr) {
        spokeWriteSucceeded = true;
      }
    }
    if (!spokeWriteSucceeded) {
      await supabase.rpc("secure_upsert_cloud_file", {
        p_token: state.session?.access_token || "",
        p_target: "audit_logs",
        p_payload: spokePayload,
      });
    }
  }

  // Always write Spoke edits to Core Audit Logs tagged with the Spoke's `game_name`
  await supabaseAuth.from("audit_logs").insert({
    ...spokePayload,
    game_name: gameName,
  });
}

export async function logArchitectAction(
  action: string,
  target_table: string,
  target_name: string,
  customReason?: string,
  sourceHub: string = "Architect Console",
  isKeepers: boolean = false,
  changes?: AuditChangesInput
) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const effectiveKeepers = isEffectiveKeepersAction(target_table, sourceHub, isKeepers);
    const reason = customReason || `Automated from the ${sourceHub}`;

    await writeSpokeAndCoreAuditLog({
      action,
      target_table,
      target_name,
      actor_id: user.id,
      reason,
      isKeepers: effectiveKeepers,
      changes,
    });
  } catch (err) {
    console.error("Audit log error:", err);
  }
}

export async function logUserAction(
  action: string,
  target_table: string,
  target_name: string,
  reason: string = "User Action",
  isKeepers: boolean = false,
  changes?: AuditChangesInput
) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const effectiveKeepers = isEffectiveKeepersAction(target_table, undefined, isKeepers);

    await writeSpokeAndCoreAuditLog({
      action,
      target_table,
      target_name,
      actor_id: user.id,
      reason,
      isKeepers: effectiveKeepers,
      changes,
    });
  } catch (err) {
    console.error("Audit log error:", err);
  }
}
