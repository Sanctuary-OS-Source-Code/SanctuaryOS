import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../../store";
import { supabase, hasActiveGameDatabase } from "../../supabase";
import { isDesktop } from "../../utils/envUtils";

export type NormalizedRuleSeverity = "corrupted" | "unstable" | "unrelated";

export interface SchemaExceptionRule {
  id: string;
  title: string;
  pattern: string;
  file_hint?: string;
  raw_log?: string;
  severity: "corrupted" | "unstable" | "unrelated" | "warning" | "critical" | "benign" | string;
  diagnosis: string;
  resolution: string;
  ignore_in_lab: boolean;
  pinned?: boolean;
  pinned_order?: number;
  enabled: boolean;
}

export function normalizeRuleSeverity(rule: Partial<SchemaExceptionRule>): NormalizedRuleSeverity {
  const raw = (rule.severity || "").toLowerCase();
  if (raw === "corrupted" || raw === "critical") {
    return "corrupted";
  }
  if (raw === "unstable" || raw === "warning") {
    return "unstable";
  }
  if (raw === "unrelated" || raw === "benign") {
    return "unrelated";
  }
  if (rule.ignore_in_lab) {
    return "unrelated";
  }
  return "unstable";
}

export function resolveDefaultExceptionFileHint(schema?: any): string {
  const firstLog = schema?.exception_logs?.[0];
  if (firstLog) {
    if (typeof firstLog === "string") return firstLog;
    if (firstLog.exact) return String(firstLog.exact);
    if (firstLog.starts_with || firstLog.ends_with) {
      return `${firstLog.starts_with || "exception"}${firstLog.ends_with || ".log"}`;
    }
  }
  return "exception.log";
}

export function normalizeSchemaRulesList(rules: SchemaExceptionRule[]): SchemaExceptionRule[] {
  return rules.map((r) => {
    const normSev = normalizeRuleSeverity(r);
    return {
      id: String(r.id || ""),
      title: String(r.title || ""),
      pattern: String(r.pattern || ""),
      file_hint: r.file_hint ? String(r.file_hint) : undefined,
      raw_log: r.raw_log || "",
      severity: normSev,
      diagnosis: String(r.diagnosis || ""),
      resolution: String(r.resolution || ""),
      ignore_in_lab: normSev === "unrelated" ? true : Boolean(r.ignore_in_lab),
      pinned: typeof r.pinned === "boolean" ? r.pinned : undefined,
      pinned_order: typeof r.pinned_order === "number" ? r.pinned_order : undefined,
      enabled: r.enabled !== false,
    };
  });
}

export const SPOKE_RULES_MEMORY_CACHE: Record<string, SchemaExceptionRule[]> = {};
const SPOKE_RULES_INFLIGHT: Record<string, Promise<SchemaExceptionRule[]> | undefined> = {};
export const SPOKE_RULES_HYDRATED: Record<string, boolean> = {};

export function resolveActiveRulesScopeKey(activeGameSchema?: any): string {
  const storeState = useStore.getState();
  const rawWorkspaceId = String(storeState.activeWorkspaceId || "").trim();
  if (rawWorkspaceId && rawWorkspaceId !== "default_workspace") {
    return rawWorkspaceId.toLowerCase();
  }
  const schema =
    activeGameSchema && !Array.isArray(activeGameSchema)
      ? activeGameSchema
      : storeState.activeGameSchema;
  return String(schema?.id || schema?.game_id || "default_schema")
    .trim()
    .toLowerCase();
}

export function syncRulesToRustRuntime(rules: SchemaExceptionRule[]) {
  if (!isDesktop()) return;
  const currentSchema = useStore.getState().activeGameSchema || {};
  invoke("update_active_game_schema", {
    schema: { ...currentSchema, exception_rules: rules },
  }).catch(() => {});
}

export async function loadExceptionRulesFromSpoke(
  activeGameSchema?: any
): Promise<SchemaExceptionRule[]> {
  const scopeKey = resolveActiveRulesScopeKey(activeGameSchema);
  if (
    !hasActiveGameDatabase() ||
    !scopeKey ||
    scopeKey === "default_schema" ||
    scopeKey === "default"
  ) {
    return [];
  }

  if (SPOKE_RULES_INFLIGHT[scopeKey]) {
    return SPOKE_RULES_INFLIGHT[scopeKey]!;
  }

  const task = (async () => {
    try {
      const { data, error } = await supabase
        .from("known_exception_rules")
        .select("*")
        .order("created_at", { ascending: true });

      if (!error && Array.isArray(data)) {
        const normalized = normalizeSchemaRulesList(data as SchemaExceptionRule[]);
        SPOKE_RULES_MEMORY_CACHE[scopeKey] = normalized;
        SPOKE_RULES_HYDRATED[scopeKey] = true;
        try {
          localStorage.setItem(
            `sanctuary_exception_rules_${scopeKey}`,
            JSON.stringify(normalized)
          );
        } catch {}
        syncRulesToRustRuntime(normalized);
        window.dispatchEvent(new CustomEvent("sanctuary-exception-rules-updated"));
        return normalized;
      }
    } catch (e) {
      console.warn("Failed to fetch known_exception_rules from Spoke database:", e);
    } finally {
      delete SPOKE_RULES_INFLIGHT[scopeKey];
    }

    return SPOKE_RULES_MEMORY_CACHE[scopeKey] || [];
  })();

  SPOKE_RULES_INFLIGHT[scopeKey] = task;
  return task;
}

export function getExceptionRules(activeGameSchema?: any): SchemaExceptionRule[] {
  if (Array.isArray(activeGameSchema)) {
    return activeGameSchema.length > 0 ? normalizeSchemaRulesList(activeGameSchema) : [];
  }

  const scopeKey = resolveActiveRulesScopeKey(activeGameSchema);
  if (!scopeKey || scopeKey === "default_schema" || scopeKey === "default") {
    return [];
  }

  if (Array.isArray(SPOKE_RULES_MEMORY_CACHE[scopeKey])) {
    if (!SPOKE_RULES_HYDRATED[scopeKey] && hasActiveGameDatabase()) {
      loadExceptionRulesFromSpoke(activeGameSchema).catch(() => {});
    }
    return SPOKE_RULES_MEMORY_CACHE[scopeKey];
  }

  let offlineCached: SchemaExceptionRule[] = [];
  try {
    const cached = localStorage.getItem(`sanctuary_exception_rules_${scopeKey}`);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        offlineCached = normalizeSchemaRulesList(parsed);
        SPOKE_RULES_MEMORY_CACHE[scopeKey] = offlineCached;
      }
    }
  } catch {}

  if (!SPOKE_RULES_HYDRATED[scopeKey] && hasActiveGameDatabase()) {
    loadExceptionRulesFromSpoke(activeGameSchema).catch(() => {});
  }

  return offlineCached;
}

export function useExceptionRules(activeGameSchema?: any): SchemaExceptionRule[] {
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);
  const storeSchema = useStore((s) => s.activeGameSchema);
  const effectiveSchema = activeGameSchema ?? storeSchema;
  const [, setTick] = useState(0);

  useEffect(() => {
    const onUpdated = () => setTick((v) => v + 1);
    window.addEventListener("sanctuary-exception-rules-updated", onUpdated);
    loadExceptionRulesFromSpoke(effectiveSchema).catch(() => {});
    return () => window.removeEventListener("sanctuary-exception-rules-updated", onUpdated);
  }, [activeWorkspaceId, effectiveSchema?.id]);

  return getExceptionRules(effectiveSchema);
}

export function matchExceptionRules(
  logText?: string | null,
  activeGameSchema?: any
): SchemaExceptionRule[] {
  if (!logText || logText === "Clean") return [];
  const rules = getExceptionRules(activeGameSchema);
  const lower = logText.toLowerCase();

  return rules.filter((r) => {
    if (!r.enabled || !r.pattern?.trim()) return false;
    const clauses = r.pattern
      .split("|")
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);
    if (clauses.length === 0) return false;
    return clauses.some((c) => lower.includes(c));
  });
}

/**
 * Returns true if the given exception log matches one or more Known Error Rules
 * and all matched rules are classified as "unrelated" (Normal Game Bug) or ignore_in_lab.
 * Used by Lab verification so normal base-game bugs never auto-fail a mod test.
 */
export function isUnrelatedGameBugLog(
  logText?: string | null,
  activeGameSchema?: any
): boolean {
  if (!logText || logText === "Clean") return false;
  const matched = matchExceptionRules(logText, activeGameSchema);
  if (matched.length === 0) return false;
  return matched.every(
    (r) => normalizeRuleSeverity(r) === "unrelated" || r.ignore_in_lab
  );
}

export function extractSuggestedPatternFromLog(
  logText?: string | null,
  activeGameSchema?: any
): {
  pattern: string;
  title: string;
  fileHint: string;
} {
  const schema = activeGameSchema || useStore.getState().activeGameSchema;
  const defaultHint = resolveDefaultExceptionFileHint(schema);
  if (!logText) {
    return { pattern: "", title: "", fileHint: defaultHint };
  }

  const catMatch = logText.match(/<categoryid>([^<]+)<\/categoryid>/i);
  const desyncMatch = logText.match(/<desyncdata>([\s\S]*?)<\/desyncdata>/i);
  const decodedDesync = (desyncMatch?.[1] || logText)
    .replace(/&#13;/g, "\r")
    .replace(/&#10;/g, "\n")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

  const firstErrorLine = decodedDesync
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(
      (l) =>
        l.includes("Error") ||
        l.includes("Exception") ||
        l.startsWith("TypeError") ||
        l.startsWith("AttributeError") ||
        l.startsWith("KeyError") ||
        l.startsWith("ValueError")
    );

  const isUiException =
    logText.includes("widgets.") ||
    logText.includes("olympus.") ||
    logText.includes("(AS)");

  const uiLogEntry = schema?.exception_logs?.find((e: any) =>
    String(e?.starts_with || e?.exact || "").toLowerCase().includes("ui")
  );
  const resolvedUiHint = uiLogEntry
    ? uiLogEntry.exact || `${uiLogEntry.starts_with || "ui_exception"}${uiLogEntry.ends_with || ".log"}`
    : defaultHint;

  if (catMatch && catMatch[1]) {
    const cleanCat = catMatch[1].replace(/^\(AS\)/i, "").trim();
    return {
      pattern: cleanCat,
      title: firstErrorLine
        ? `${cleanCat.split("::").pop() || cleanCat} (${firstErrorLine.slice(0, 48)})`
        : cleanCat,
      fileHint: isUiException ? resolvedUiHint : defaultHint,
    };
  }

  if (firstErrorLine) {
    return {
      pattern: firstErrorLine.slice(0, 80),
      title: firstErrorLine.slice(0, 60),
      fileHint: isUiException ? resolvedUiHint : defaultHint,
    };
  }

  return {
    pattern: "",
    title: "",
    fileHint: isUiException ? resolvedUiHint : defaultHint,
  };
}


export async function saveExceptionRulesToSpoke(
  rules: SchemaExceptionRule[],
  activeGameSchema?: any
): Promise<void> {
  const normalizedRules = normalizeSchemaRulesList(rules);
  const scopeKey = resolveActiveRulesScopeKey(activeGameSchema);
  const previousRules = SPOKE_RULES_MEMORY_CACHE[scopeKey] || [];
  const nextIdSet = new Set(normalizedRules.map((r) => r.id));
  const deletedIds = previousRules
    .map((r) => r.id)
    .filter((id) => Boolean(id) && !nextIdSet.has(id));

  SPOKE_RULES_MEMORY_CACHE[scopeKey] = normalizedRules;
  SPOKE_RULES_HYDRATED[scopeKey] = true;

  try {
    localStorage.setItem(
      `sanctuary_exception_rules_${scopeKey}`,
      JSON.stringify(normalizedRules)
    );
  } catch {}

  syncRulesToRustRuntime(normalizedRules);

  if (hasActiveGameDatabase()) {
    const token = useStore.getState().session?.access_token || "";
    const nowIso = new Date().toISOString();

    for (const delId of deletedIds) {
      if (token) {
        const { error } = await supabase.rpc("secure_delete_cloud_file", {
          p_token: token,
          p_target: "known_exception_rules",
          p_id: delId,
        });
        if (error) {
          console.error("Failed to delete known_exception_rule via RPC:", error);
        }
      } else {
        await supabase.from("known_exception_rules").delete().eq("id", delId);
      }
    }

    if (normalizedRules.length > 0) {
      const dbRows = normalizedRules.map((r) => ({
        id: r.id,
        title: r.title,
        pattern: r.pattern,
        file_hint: r.file_hint || null,
        raw_log: r.raw_log || null,
        severity: r.severity,
        diagnosis: r.diagnosis || "",
        resolution: r.resolution || "",
        ignore_in_lab: Boolean(r.ignore_in_lab),
        pinned: Boolean(r.pinned),
        pinned_order: typeof r.pinned_order === "number" ? r.pinned_order : null,
        enabled: r.enabled !== false,
        updated_at: nowIso,
      }));

      if (token) {
        const { error } = await supabase.rpc("secure_upsert_cloud_file", {
          p_token: token,
          p_target: "known_exception_rules",
          p_payload: dbRows,
        });
        if (error) {
          console.error("Failed to upsert known_exception_rules via RPC:", error);
          throw error;
        }
      } else {
        const { error } = await supabase.from("known_exception_rules").upsert(dbRows);
        if (error) {
          console.error("Failed to upsert known_exception_rules:", error);
          throw error;
        }
      }
    }
  }

  window.dispatchEvent(new CustomEvent("sanctuary-exception-rules-updated"));
}

