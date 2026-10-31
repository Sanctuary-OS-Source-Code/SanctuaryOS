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
  "id",
  "updated_at",
  "last_updated_at",
  "last_updated_by",
  "created_at",
  "actor_id",
  "author_id",
  "supabase_service_key",
  "mod_versions",
  "masons",
  "profiles",
  "mods",
]);

const PRIMARY_SUMMARY_KEYS = [
  "name",
  "title",
  "status",
  "category_override",
  "category",
  "sub_type",
  "latest_version",
  "version_label",
  "version",
  "compliance_tier",
  "role",
  "is_active",
  "is_banned",
  "defcon_level",
  "signature",
  "severity",
  "enabled",
  "url",
];

function isEmptyAuditVal(val: any): boolean {
  if (val === undefined || val === null || val === "") return true;
  if (Array.isArray(val) && val.length === 0) return true;
  return false;
}

function areAuditValuesEqual(prevVal: any, nextVal: any): boolean {
  if (prevVal === nextVal) return true;
  if (isEmptyAuditVal(prevVal) && isEmptyAuditVal(nextVal)) return true;
  if (
    typeof nextVal === "boolean" &&
    nextVal === false &&
    (prevVal === null || prevVal === undefined || prevVal === false)
  ) {
    return true;
  }
  const prevStr = JSON.stringify(prevVal ?? null);
  const nextStr = JSON.stringify(nextVal ?? null);
  return prevStr === nextStr;
}

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
      if (ignored.has(k) || k.startsWith("_") || isEmptyAuditVal(v)) continue;
      out[k] = { to: truncateAuditVal(v) };
    }
    return out;
  }

  if (before && !after) {
    for (const [k, v] of Object.entries(before)) {
      if (ignored.has(k) || k.startsWith("_") || isEmptyAuditVal(v)) continue;
      out[k] = { from: truncateAuditVal(v) };
    }
    return out;
  }

  // Both `before` and `after` exist (UPDATE): compare keys present in `after`
  for (const k of Object.keys(after || {})) {
    if (ignored.has(k) || k.startsWith("_")) continue;
    const prevVal = before?.[k];
    const nextVal = after?.[k];
    if (!areAuditValuesEqual(prevVal, nextVal)) {
      out[k] = {
        from: truncateAuditVal(prevVal),
        to: truncateAuditVal(nextVal),
      };
    }
  }

  // Fallback: if no diff keys were detected (e.g. re-saving unchanged values),
  // include up to 4 primary identifying fields so the audit entry always carries field telemetry.
  if (Object.keys(out).length === 0 && after) {
    let added = 0;
    for (const k of PRIMARY_SUMMARY_KEYS) {
      if (ignored.has(k) || !(k in after)) continue;
      const val = after[k];
      if (isEmptyAuditVal(val) && isEmptyAuditVal(before?.[k])) continue;
      out[k] = {
        from: truncateAuditVal(before?.[k] ?? val),
        to: truncateAuditVal(val),
      };
      added++;
      if (added >= 4) break;
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
        const isDeleteAction = /delete|deprecate|remove|purge/i.test(String(log?.action || ""));
        for (const [k, v] of Object.entries(norm)) {
          if (k === "id" && v.to === undefined && !isDeleteAction) continue;
          addEdit(k, v.from, v.to);
        }
      }
    } catch {
      // Ignore malformed JSON
    }
  }

  // 3. Fallback extraction for legacy audit strings so existing logs also display what changed
  if (editsMap.size === 0) {
    const actionStr = String(log?.action || "").trim();
    const actionLower = actionStr.toLowerCase();
    const targetName = String(log?.target_name || "").trim();
    const targetTable = String(log?.target_table || "").trim().toLowerCase();

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
    if (actionLower.startsWith("mass updated") && actionStr.includes(":")) {
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

    // Pattern F: DEFCON Alerts ("Triggered Global DEFCON 1 Override" / "Stood Down Global DEFCON Alert")
    if (editsMap.size === 0 && (actionLower.includes("defcon") || targetTable === "global_network_status")) {
      if (actionLower.includes("stood down")) {
        addEdit("defcon_level", "1", "5");
        addEdit("status_message", "GAME PATCH IMMINENT", cleanReason || "System Normal");
      } else {
        addEdit("defcon_level", "5", "1");
        addEdit("status_message", "System Normal", cleanReason || "GAME PATCH IMMINENT");
      }
    }

    // Pattern G: Blueprint Uploads ("Uploaded Blueprint: <name>")
    if (editsMap.size === 0 && (actionLower.startsWith("uploaded blueprint") || targetTable === "blueprints")) {
      const bpName = actionStr.replace(/^uploaded\s+blueprint:\s*/i, "").trim();
      if (bpName) addEdit("name", undefined, bpName);
      if (targetName) addEdit("code", undefined, targetName);
      if (cleanReason.includes(",")) {
        const kvParts = cleanReason.split(",").map((s) => s.trim());
        for (const kv of kvParts) {
          if (kv.includes(":")) {
            const [k, v] = kv.split(":").map((s) => s.trim());
            if (k && v) addEdit(k.toLowerCase(), undefined, v);
          }
        }
      }
    }

    // Pattern H: DNA Verification Scan ("DNA Verification Scan: <hash>")
    if (editsMap.size === 0 && actionLower.startsWith("dna verification scan")) {
      const hash = actionStr.split(":").slice(1).join(":").trim();
      if (hash) addEdit("dna_hash", undefined, hash);
      if (targetName) addEdit("matched_artifact", undefined, targetName);
    }

    // Pattern I: Scout Submissions ("Approved Scout Submission" / "Rejected Scout Submission")
    if (editsMap.size === 0 && (actionLower.includes("scout submission") || targetTable === "scout_suggestions")) {
      const isApproved = actionLower.includes("approved");
      addEdit("status", "pending", isApproved ? "approved" : "rejected");
      if (targetName) addEdit("submission_id", undefined, targetName);
    }

    // Pattern J: Game Versions & DLC ("Added Game Version X" / "Deleted Game Version X" / "Added DLC Pack [ID] Name")
    if (editsMap.size === 0 && (targetTable === "game_versions" || actionLower.includes("game version"))) {
      const ver = actionStr.replace(/^(added|deleted|edited)\s+game\s+version\s*/i, "").trim() || targetName;
      if (actionLower.startsWith("deleted")) {
        addEdit("version", ver, "Deleted");
      } else {
        addEdit("version", undefined, ver);
      }
    }
    if (editsMap.size === 0 && (targetTable === "dlc_registry" || actionLower.includes("dlc pack"))) {
      if (targetName) addEdit("dlc_id", actionLower.startsWith("deleted") ? targetName : undefined, actionLower.startsWith("deleted") ? "Deleted" : targetName);
    }

    // Pattern K: Malware / Purge / Compliance Flags
    if (editsMap.size === 0 && actionLower.startsWith("purged malware artifact")) {
      addEdit("status", "flagged", "purged");
      if (targetName) addEdit("artifact", targetName, "Deleted");
    } else if (editsMap.size === 0 && actionLower.startsWith("cleared malware flag")) {
      addEdit("compliance_tier", "5", "0");
      addEdit("status", "flagged", "verified");
    } else if (editsMap.size === 0 && actionLower.startsWith("confirmed malware flag")) {
      addEdit("compliance_tier", "0", "5");
      addEdit("status", "under_review", "blacklisted");
    } else if (editsMap.size === 0 && actionLower.startsWith("cleared compliance flag")) {
      addEdit("compliance_tier", "2", "0");
      addEdit("status", "flagged", "verified");
    } else if (editsMap.size === 0 && actionLower.startsWith("flagged artifact")) {
      const flaggedName = actionStr.split(":").slice(1).join(":").trim() || targetName;
      if (flaggedName) addEdit("artifact", undefined, flaggedName);
      addEdit("status", undefined, "Flagged for Review");
    }

    // Pattern L: Collections ("Added Mod ID X to Collection", "Removed Mod X from Collection", "Created/Updated/Deleted Collection")
    if (editsMap.size === 0 && targetTable === "collections") {
      if (targetName) addEdit("collection", undefined, targetName);
      const addedModMatch = actionStr.match(/added\s+mod(?:\s+id)?\s+(.+?)\s+to\s+collection/i);
      const removedModMatch = actionStr.match(/removed\s+mod\s+(.+?)\s+from\s+collection/i);
      if (addedModMatch) {
        addEdit("member_mod", undefined, addedModMatch[1]);
      } else if (removedModMatch) {
        addEdit("member_mod", removedModMatch[1], "Removed");
      } else {
        addEdit("operation", undefined, actionStr);
      }
    }

    // Pattern M: Dispatches & Broadcasts (legacy rows without embedded diff)
    if (
      editsMap.size === 0 &&
      (targetTable === "system_broadcasts" ||
        targetTable === "keeper_system_broadcasts" ||
        actionLower.includes("dispatch") ||
        actionLower.includes("broadcast") ||
        actionLower.includes("legal doc"))
    ) {
      if (targetName) {
        if (actionLower.startsWith("deleted")) {
          addEdit("title", targetName, "Deleted");
        } else {
          addEdit("title", actionLower.startsWith("updated") ? targetName : undefined, targetName);
        }
      }
      addEdit("status", undefined, actionLower.startsWith("deleted") ? "Deleted" : "Published");
    }

    // Pattern N: Mod Metadata / DLC Protocols / Generic legacy Spoke updates
    if (editsMap.size === 0 && (targetTable === "mods" || targetName)) {
      if (targetName) {
        addEdit("name", actionLower.startsWith("updated") ? targetName : undefined, targetName);
      }
      if (targetTable === "mods") {
        addEdit("status", undefined, "Verified / Active");
      }
      if (actionStr) {
        addEdit("operation", undefined, actionStr);
      }
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
