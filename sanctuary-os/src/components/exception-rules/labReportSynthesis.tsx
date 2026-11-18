import { useLexicon } from "../../LexiconContext";
import { useStore } from "../../store";
import { supabase, hasActiveGameDatabase } from "../../supabase";
import { type SchemaExceptionRule, matchExceptionRules, extractSuggestedPatternFromLog } from "./ruleStoreAndMatcher";

export interface LabIssueCauseSynthesis {
  summary: string;
  suggestedStatus: "broken" | "unstable" | "verified" | null;
  matchedRules: SchemaExceptionRule[];
  bestReport: any | null;
}

export function combineLabReportLogText(report: any): string {
  if (!report || typeof report !== "object") return "";
  return [report.tester_note, report.log_snippet, report.log_text]
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .join("\n");
}

export async function fetchModLabReports(
  modId: string,
  limit = 5
): Promise<any[]> {
  const cleanId = String(modId || "").trim();
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);
  if (!isUuid || !hasActiveGameDatabase()) return [];
  try {
    const { data, error } = await supabase
      .from("homestead_lab_logs")
      .select("*")
      .eq("mod_id", cleanId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !Array.isArray(data)) return [];
    return data;
  } catch {
    return [];
  }
}

export function synthesizeIssueCauseFromLabReports(
  reports: any[],
  activeGameSchema?: any,
  labels?: {
    fixPrefix?: string;
    notePrefix?: string;
  }
): LabIssueCauseSynthesis {
  const list = Array.isArray(reports) ? reports : [];
  if (list.length === 0) {
    return {
      summary: "",
      suggestedStatus: null,
      matchedRules: [],
      bestReport: null,
    };
  }

  const pickScore = (r: any) => {
    const s = String(r?.status || "").toLowerCase();
    const sev = String(r?.severity || "").toLowerCase();
    let score = 0;
    if (s === "broken" || s === "corrupted") score += 60;
    else if (s === "unstable" || sev === "warning" || sev === "unstable") score += 45;
    else if (s === "pending" || s === "under_review") score += 25;
    if (String(r?.log_text || "").trim()) score += 15;
    if (String(r?.log_snippet || "").trim()) score += 10;
    if (String(r?.tester_note || "").trim()) score += 8;
    return score;
  };

  const ranked = [...list].sort((a, b) => pickScore(b) - pickScore(a));
  const bestReport = ranked[0] || list[0];

  const ruleMap = new Map<string, SchemaExceptionRule>();
  for (const r of ranked) {
    const combined = combineLabReportLogText(r);
    if (!combined) continue;
    for (const rule of matchExceptionRules(combined, activeGameSchema)) {
      const k = rule.id || rule.title;
      if (k && !ruleMap.has(k)) ruleMap.set(k, rule);
    }
  }
  const matchedRules = Array.from(ruleMap.values());
  const relevantRules = matchedRules.filter((r) => r.severity !== "unrelated");

  const bestStatus = String(bestReport?.status || "").toLowerCase();
  const bestSeverity = String(bestReport?.severity || "").toLowerCase();
  let suggestedStatus: "broken" | "unstable" | "verified" | null = null;
  if (relevantRules.some((r) => r.severity === "corrupted")) {
    suggestedStatus = "broken";
  } else if (bestStatus === "broken" || bestStatus === "corrupted" || bestSeverity === "critical" || bestSeverity === "fatal") {
    suggestedStatus = "broken";
  } else if (relevantRules.some((r) => r.severity === "unstable")) {
    suggestedStatus = "unstable";
  } else if (bestStatus === "unstable" || bestSeverity === "warning" || bestSeverity === "unstable") {
    suggestedStatus = "unstable";
  } else if (bestStatus === "verified") {
    suggestedStatus = "verified";
  }

  const parts: string[] = [];
  const fixPrefix = labels?.fixPrefix || "Resolution";
  const notePrefix = labels?.notePrefix || "Tester Note";

  for (const rule of relevantRules.slice(0, 2)) {
    const lineParts = [rule.title, rule.diagnosis].filter(Boolean);
    if (rule.resolution) lineParts.push(`${fixPrefix}: ${rule.resolution}`);
    const block = lineParts.join(" — ").trim();
    if (block) parts.push(block);
  }

  const testerNote = ranked
    .map((r) => String(r?.tester_note || "").trim())
    .find((n) => Boolean(n) && !/^\[ARCHITECT\b/i.test(n));
  if (testerNote) {
    parts.push(`${notePrefix}: ${testerNote}`);
  }

  if (parts.length === 0) {
    const rawFallback = String(bestReport?.log_snippet || bestReport?.log_text || "").trim();
    if (rawFallback) {
      const sig = extractSuggestedPatternFromLog(rawFallback, activeGameSchema);
      const cleanSnippet = rawFallback
        .replace(/<[^>]+>/g, " ")
        .replace(/&#\d+;/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 260);
      if (sig.title && cleanSnippet && !cleanSnippet.startsWith(sig.title)) {
        parts.push(`${sig.title} — ${cleanSnippet}`);
      } else if (sig.title || cleanSnippet) {
        parts.push(sig.title || cleanSnippet);
      }
    }
  }

  return {
    summary: parts.join("\n\n").slice(0, 900).trim(),
    suggestedStatus,
    matchedRules,
    bestReport,
  };
}

export async function importIssueCauseFromLabReports(options: {
  modId?: string | null;
  currentStatus?: string | null;
  activeGameSchema?: any;
  labels?: {
    fixPrefix?: string;
    notePrefix?: string;
    importedToast?: string;
    emptyToast?: string;
  };
  onApply: (patch: {
    status_reason?: string;
    status?: "broken" | "unstable" | "verified";
  }) => void;
}): Promise<LabIssueCauseSynthesis | null> {
  const reports = await fetchModLabReports(String(options.modId || ""), 5);
  const storeState = useStore.getState();
  const synthesis = synthesizeIssueCauseFromLabReports(
    reports,
    options.activeGameSchema || storeState.activeGameSchema,
    options.labels
  );

  if (
    reports.length === 0 ||
    (!synthesis.summary &&
      synthesis.matchedRules.length === 0 &&
      (!synthesis.suggestedStatus || synthesis.suggestedStatus === "verified"))
  ) {
    if (options.labels?.emptyToast) {
      storeState.pushStatus(options.labels.emptyToast, "info");
    }
    return null;
  }

  const patch: {
    status_reason?: string;
    status?: "broken" | "unstable" | "verified";
  } = {};
  if (synthesis.summary) {
    patch.status_reason = synthesis.summary;
  }
  const cur = String(options.currentStatus || "").toLowerCase();
  if (
    synthesis.suggestedStatus &&
    synthesis.suggestedStatus !== "verified" &&
    (cur === "" ||
      cur === "stable" ||
      cur === "verified" ||
      cur === "under_review" ||
      cur === "pending" ||
      (cur === "unstable" && synthesis.suggestedStatus === "broken"))
  ) {
    patch.status = synthesis.suggestedStatus;
  }

  options.onApply(patch);
  if (options.labels?.importedToast) {
    storeState.pushStatus(options.labels.importedToast, "success");
  }
  return synthesis;
}

export function LabReportDiagnosticCards({
  reports,
  activeGameSchema,
  maxReports = 3,
}: {
  reports: any[];
  activeGameSchema?: any;
  maxReports?: number;
}) {
  const { t } = useLexicon();
  if (!Array.isArray(reports) || reports.length === 0) return null;

  const combinedText = reports
    .map(combineLabReportLogText)
    .filter(Boolean)
    .join("\n");
  const matchedRules = combinedText
    ? matchExceptionRules(combinedText, activeGameSchema)
    : [];

  return (
    <div className="flex flex-col gap-2">
      {matchedRules.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
            {t("exc_rules_matched_header", "Matched Known Error Rules")}
          </span>
          {matchedRules.slice(0, 3).map((rule) => {
            const ruleTone =
              rule.severity === "corrupted"
                ? "text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_35%,transparent)]"
                : rule.severity === "unstable"
                  ? "text-[var(--warning)] border-[color-mix(in_srgb,var(--warning)_35%,transparent)]"
                  : "text-[var(--subtext)] border-[color-mix(in_srgb,var(--text)_20%,transparent)]";
            return (
              <div
                key={rule.id || rule.title}
                className="p-2.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--warning)_24%,transparent)] flex flex-col gap-1"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-black text-[var(--text)]">
                    {rule.title}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-md bg-transparent border text-[9px] font-black uppercase tracking-wider ${ruleTone}`}
                  >
                    {rule.severity === "corrupted"
                      ? t("status_corrupted", "Corrupted")
                      : rule.severity === "unstable"
                        ? t("status_unstable", "Unstable")
                        : t("exc_severity_unrelated", "Benign / Unrelated")}
                  </span>
                </div>
                {rule.diagnosis && (
                  <p className="text-[11px] font-semibold text-[var(--subtext)] leading-relaxed">
                    {rule.diagnosis}
                  </p>
                )}
                {rule.resolution && (
                  <p className="text-[11px] font-bold text-[var(--success)] leading-relaxed">
                    {`${t("fix_prefix", "Fix")}: ${rule.resolution}`}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
          {t("recent_lab_reports_header", "Recent {Lab} Verification Reports")}
        </span>
        {reports.slice(0, maxReports).map((rep: any, rIdx: number) => {
          const repStatus = String(rep?.status || "pending").toLowerCase();
          const repBroken = repStatus === "broken" || repStatus === "corrupted";
          const repUnstable = repStatus === "unstable";
          const repVerified = repStatus === "verified";
          const badgeTone = repBroken
            ? "text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_35%,transparent)]"
            : repUnstable
              ? "text-[var(--warning)] border-[color-mix(in_srgb,var(--warning)_35%,transparent)]"
              : repVerified
                ? "text-[var(--success)] border-[color-mix(in_srgb,var(--success)_35%,transparent)]"
                : "text-[var(--subtext)] border-[color-mix(in_srgb,var(--text)_20%,transparent)]";
          const snippetText = String(rep?.tester_note || rep?.log_snippet || "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 220);
          return (
            <div
              key={rep?.id || rIdx}
              className="p-2.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-1"
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`px-2 py-0.5 rounded-md bg-transparent border text-[9px] font-black uppercase tracking-wider ${badgeTone}`}
                >
                  {repBroken
                    ? t("status_corrupted", "Corrupted")
                    : repUnstable
                      ? t("status_unstable", "Unstable")
                      : repVerified
                        ? t("verified", "Verified")
                        : t("pending", "Pending")}
                </span>
                {rep?.created_at && (
                  <span className="text-[10px] font-bold text-[var(--subtext)]">
                    {new Date(rep.created_at).toLocaleDateString()}
                  </span>
                )}
              </div>
              {snippetText && (
                <p className="text-[11px] font-semibold text-[var(--subtext)] leading-relaxed break-words">
                  {snippetText}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

