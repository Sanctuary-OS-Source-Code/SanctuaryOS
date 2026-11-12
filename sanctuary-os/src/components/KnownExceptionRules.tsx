import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { supabase, hasActiveGameDatabase } from "../supabase";
import { isDesktop } from "../utils/envUtils";
import {
  SidePanel,
  CustomDropdown,
  PanelHeaderGroup,
  PanelHeaderButton,
  EmptyState,
  HoverTooltip,
  VAULT_CHIP_CLASS,
  ActionButton,
  DashboardStatTile,
} from "../shared";
import { SidePanelHeroCard, SidePanelTitleInput } from "./layouts/ElevatedHubLayout";
import { CommandScreenSectionHeading } from "../hub-components/SharedCommandScreenLayout";
import {
  UniversalGroup,
  StatBox,
} from "./universal/UniversalLayout";
import { scrubLogUserData, formatHumanReadableLogText } from "../utils/logScrubber";
import { openSanctuaryContextMenu, SanctuaryContextMenuItem } from "../ContextMenu";

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

function resolveDefaultExceptionFileHint(schema?: any): string {
  const firstRuleHint = schema?.exception_rules?.find((r: any) => r?.file_hint)?.file_hint;
  if (firstRuleHint) return String(firstRuleHint);
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

function normalizeSchemaRulesList(rules: SchemaExceptionRule[]): SchemaExceptionRule[] {
  return rules.map((r) => {
    const normSev = normalizeRuleSeverity(r);
    return {
      ...r,
      raw_log: r.raw_log || "",
      severity: normSev,
      ignore_in_lab: normSev === "unrelated" ? true : Boolean(r.ignore_in_lab),
      pinned: typeof r.pinned === "boolean" ? r.pinned : undefined,
      pinned_order: typeof r.pinned_order === "number" ? r.pinned_order : undefined,
    };
  });
}

export function getExceptionRules(activeGameSchema?: any): SchemaExceptionRule[] {
  if (Array.isArray(activeGameSchema)) {
    return activeGameSchema.length > 0 ? normalizeSchemaRulesList(activeGameSchema) : [];
  }
  const storeState = useStore.getState();
  const schema =
    activeGameSchema && !Array.isArray(activeGameSchema)
      ? activeGameSchema
      : storeState.activeGameSchema;
  const rawWorkspaceId = storeState.activeWorkspaceId || "";
  const schemaId =
    (rawWorkspaceId && rawWorkspaceId !== "default_workspace" ? rawWorkspaceId : "") ||
    schema?.id ||
    schema?.game_id ||
    "default_schema";

  if (Array.isArray(schema?.exception_rules) && schema.exception_rules.length > 0) {
    return normalizeSchemaRulesList(schema.exception_rules);
  }

  if (!hasActiveGameDatabase() && (!schemaId || schemaId === "default_schema" || schemaId === "default")) {
    return [];
  }

  try {
    const cached = localStorage.getItem(`sanctuary_exception_rules_${schemaId}`);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return normalizeSchemaRulesList(parsed);
      }
    }
  } catch { }

  return [];
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
  const normalizedRules = rules.map((r) => {
    const sev = normalizeRuleSeverity(r);
    return {
      ...r,
      severity: sev,
      ignore_in_lab: sev === "unrelated" ? true : !!r.ignore_in_lab,
      pinned: typeof r.pinned === "boolean" ? r.pinned : undefined,
      pinned_order: typeof r.pinned_order === "number" ? r.pinned_order : undefined,
    };
  });

  const store = useStore.getState();
  const currentSchema = activeGameSchema || store.activeGameSchema || {};
  const schemaId = currentSchema.id || currentSchema.game_id || "default_schema";

  const updatedSchema = {
    ...currentSchema,
    exception_rules: normalizedRules,
  };

  try {
    localStorage.setItem(
      `sanctuary_exception_rules_${schemaId}`,
      JSON.stringify(normalizedRules)
    );
    localStorage.setItem(
      `sanctuary_master_schema_${schemaId}`,
      JSON.stringify(updatedSchema)
    );
  } catch (e) { }

  store.setActiveGameSchema(updatedSchema);

  if (isDesktop()) {
    try {
      await invoke("update_active_game_schema", { schema: updatedSchema });
    } catch (e) { }
  }

  try {
    let { data: existing } = await supabase
      .from("sanctuary_schemas")
      .select("id, name, version, schema_data")
      .eq("id", schemaId)
      .maybeSingle();

    if (!existing) {
      const { data: firstRow } = await supabase
        .from("sanctuary_schemas")
        .select("id, name, version, schema_data")
        .limit(1)
        .maybeSingle();
      if (firstRow) existing = firstRow;
    }

    if (existing) {
      const mergedData = {
        ...(existing.schema_data || {}),
        exception_rules: normalizedRules,
      };
      await supabase
        .from("sanctuary_schemas")
        .update({
          schema_data: mergedData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("sanctuary_schemas").upsert([
        {
          id: schemaId,
          name: updatedSchema.display_name || updatedSchema.name || schemaId,
          version: updatedSchema.schema_version || 1,
          schema_data: updatedSchema,
          updated_at: new Date().toISOString(),
        },
      ]);
    }
  } catch (e) {
    console.warn("Could not sync exception_rules to cloud sanctuary_schemas:", e);
  }

  window.dispatchEvent(new CustomEvent("sanctuary-exception-rules-updated"));
}

export function KnownErrorDiagnosisBanner({
  logText,
  allowEdit = false,
  canEdit,
  reportFailed = false,
}: {
  logText?: string | null;
  allowEdit?: boolean;
  canEdit?: boolean;
  reportFailed?: boolean;
}) {
  const effectiveAllowEdit = canEdit !== undefined ? canEdit : allowEdit;
  const { t } = useLexicon();
  const activeGameSchema = useStore((s) => s.activeGameSchema);
  const [rulesVersion, setRulesVersion] = useState(0);
  const [editingRule, setEditingRule] = useState<SchemaExceptionRule | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  useEffect(() => {
    const handler = () => setRulesVersion((v) => v + 1);
    window.addEventListener("sanctuary-exception-rules-updated", handler);
    return () => window.removeEventListener("sanctuary-exception-rules-updated", handler);
  }, []);

  if (!logText || logText === "Clean") return null;

  const matchedRules = matchExceptionRules(logText, activeGameSchema);
  if (matchedRules.length === 0 && !effectiveAllowEdit) return null;

  const handleOpenCreateFromLog = (asGameBug = false) => {
    const suggested = extractSuggestedPatternFromLog(logText);
    setEditingRule({
      id: `rule_${Date.now()}`,
      title: suggested.title,
      pattern: suggested.pattern,
      file_hint: suggested.fileHint,
      raw_log: logText || "",
      severity: asGameBug ? "unrelated" : "unstable",
      diagnosis: "",
      resolution: "",
      ignore_in_lab: asGameBug,
      enabled: true,
    });
    setIsEditorOpen(true);
  };

  const handleOpenEdit = (rule: SchemaExceptionRule) => {
    setEditingRule({
      ...rule,
      raw_log: rule.raw_log || logText || "",
    });
    setIsEditorOpen(true);
  };

  return (
    <div className="flex flex-col gap-3 w-full" data-rules-v={rulesVersion}>
      {effectiveAllowEdit && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CommandScreenSectionHeading
            title={t("exc_rules_section_title", "Community Known Error Diagnosis")}
            subtitle={t(
              "exc_rules_section_subtitle",
              "Matched against community-maintained exception log rules for this game"
            )}
            icon={t("icon_psychology", "psychology")}
            className="!w-auto"
          />

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => handleOpenCreateFromLog(true)}
              className="px-3 py-1.5 rounded-xl text-[10px] font-black tracking-wider uppercase glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[var(--text)] transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[14px] text-[var(--success)]">
                {t("icon_bug_report", "bug_report")}
              </span>
              {t("exc_rules_btn_add_game_bug", "Add Normal Game Bug")}
            </button>
            <button
              type="button"
              onClick={() => handleOpenCreateFromLog(false)}
              className="px-3 py-1.5 rounded-xl text-[10px] font-black tracking-wider uppercase glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[var(--text)] transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                {t("icon_edit_note", "edit_note")}
              </span>
              {t("exc_rules_btn_create_from_log", "Explain / Edit Known Error Rule")}
            </button>
          </div>
        </div>
      )}

      {matchedRules.length > 0 && (
        <div className="flex flex-col gap-3">
          {matchedRules.map((rule) => {
            let normSev = normalizeRuleSeverity(rule);
            if (normSev === "unrelated" && reportFailed) {
              normSev = "unstable";
            }
            const isCrit = normSev === "corrupted";
            const isBenign = normSev === "unrelated";
            const borderClass = "border-[color-mix(in_srgb,var(--text)_10%,transparent)]";

            const iconColorClass = isCrit
              ? "text-[var(--danger)]"
              : isBenign
                ? "text-[var(--success)]"
                : "text-[var(--warning)]";

            return (
              <div
                key={rule.id}
                className={`rounded-2xl p-4 glass-panel border ${borderClass} flex flex-col gap-3.5 shadow-md`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={VAULT_CHIP_CLASS}>
                        <span className={`material-symbols-outlined !text-[12px] ${iconColorClass}`}>
                          {isCrit
                            ? t("icon_gpp_maybe", "gpp_maybe")
                            : isBenign
                              ? t("icon_bug_report", "bug_report")
                              : t("icon_warning", "warning")}
                        </span>
                        <span>
                          {isCrit
                            ? t("status_corrupted", "Corrupted")
                            : isBenign
                              ? t("exc_rules_filter_unrelated", "Unrelated")
                              : t("label_unstable", "Unstable")}
                        </span>
                      </span>
                      {isBenign && (
                        <span className={VAULT_CHIP_CLASS}>
                          <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                            {t("icon_verified", "verified")}
                          </span>
                          <span>{t("exc_rules_badge_no_autofail", "Ignored in {Lab}")}</span>
                        </span>
                      )}
                      {rule.file_hint && (
                        <span className={VAULT_CHIP_CLASS}>
                          <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                            {t("icon_description", "description")}
                          </span>
                          <code className="font-mono normal-case tracking-normal">
                            {rule.file_hint}
                          </code>
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-black text-[var(--text)] leading-snug">
                      {rule.title}
                    </span>
                  </div>

                  {effectiveAllowEdit && (
                    <ActionButton
                      variant="glass"
                      icon={t("icon_edit", "edit")}
                      label={t("edit", "Edit")}
                      onClick={() => handleOpenEdit(rule)}
                      className="ml-auto shrink-0"
                    />
                  )}
                </div>

                {(rule.diagnosis || rule.resolution) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-[rgba(var(--text-rgb),0.08)]">
                    {rule.diagnosis && (
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-black uppercase tracking-wider text-[var(--subtext)] flex items-center gap-1.5">
                          <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                            {t("icon_psychology", "psychology")}
                          </span>
                          {t("exc_rules_what_it_means", "What the Community Knows (Cause & Diagnosis)")}
                        </span>
                        <p className="text-xs font-medium text-[var(--text)] opacity-90 leading-relaxed whitespace-pre-line">
                          {rule.diagnosis.replace(/\s*•\s*/g, "\n• ").trim()}
                        </p>
                      </div>
                    )}

                    {rule.resolution && (
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-black uppercase tracking-wider text-[var(--subtext)] flex items-center gap-1.5">
                          <span className="material-symbols-outlined !text-[13px] text-[var(--success)]">
                            {t("icon_lightbulb", "lightbulb")}
                          </span>
                          {t("exc_rules_recommended_fix", "Recommended Fix / Resolution")}
                        </span>
                        <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed whitespace-pre-line">
                          {rule.resolution.replace(/\s*•\s*/g, "\n• ").trim()}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {effectiveAllowEdit && (
        <KnownErrorRuleEditorSidePanel
          isOpen={isEditorOpen}
          onClose={() => {
            setIsEditorOpen(false);
            setEditingRule(null);
          }}
          initialRule={editingRule}
          readOnly={false}
        />
      )}
    </div>
  );
}

export function KnownErrorRuleEditorSidePanel({
  isOpen,
  onClose,
  initialRule,
  readOnly = false,
  defaultAsGameBug = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  initialRule: SchemaExceptionRule | null;
  readOnly?: boolean;
  defaultAsGameBug?: boolean;
}) {
  const { t } = useLexicon();
  const activeGameSchema = useStore((s) => s.activeGameSchema);
  const pushStatus = useStore((s) => s.pushStatus);

  const defaultFileHint = resolveDefaultExceptionFileHint(activeGameSchema);

  const [rule, setRule] = useState<SchemaExceptionRule>({
    id: "",
    title: "",
    pattern: "",
    file_hint: defaultFileHint,
    raw_log: "",
    severity: "unstable",
    diagnosis: "",
    resolution: "",
    ignore_in_lab: false,
    pinned: false,
    enabled: true,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [copiedRawLog, setCopiedRawLog] = useState(false);
  const [copiedSignature, setCopiedSignature] = useState(false);
  const [copiedFix, setCopiedFix] = useState(false);

  useEffect(() => {
    if (initialRule) {
      const normSev = normalizeRuleSeverity(initialRule);
      const rawLogText = initialRule.raw_log || "";
      setRule({
        ...initialRule,
        raw_log: rawLogText ? formatHumanReadableLogText(rawLogText) : "",
        severity: normSev,
        ignore_in_lab: normSev === "unrelated" ? true : !!initialRule.ignore_in_lab,
        pinned: Boolean(initialRule.pinned),
      });
    } else {
      setRule({
        id: `rule_${Date.now()}`,
        title: "",
        pattern: "",
        file_hint: defaultFileHint,
        raw_log: "",
        severity: defaultAsGameBug ? "unrelated" : "unstable",
        diagnosis: "",
        resolution: "",
        ignore_in_lab: defaultAsGameBug ? true : false,
        pinned: false,
        enabled: true,
      });
    }
  }, [initialRule, isOpen, defaultAsGameBug, defaultFileHint]);

  if (!isOpen) return null;

  const existingRules = getExceptionRules(activeGameSchema);
  const isExisting = existingRules.some((r) => r.id === rule.id);

  const handleExtractFromRawLog = () => {
    const raw = scrubLogUserData((rule.raw_log || "").trim());
    if (!raw) return;
    const suggested = extractSuggestedPatternFromLog(raw, activeGameSchema);
    setRule((prev) => ({
      ...prev,
      raw_log: formatHumanReadableLogText(raw),
      title: prev.title.trim() ? prev.title : suggested.title,
      pattern: suggested.pattern || prev.pattern,
      file_hint: suggested.fileHint || prev.file_hint,
    }));
  };

  const handleSave = async () => {
    if (readOnly || !rule.title.trim() || !rule.pattern.trim()) return;
    setIsSaving(true);
    try {
      const normSev = normalizeRuleSeverity(rule);
      const current = getExceptionRules(activeGameSchema);
      const hasExplicitPins = current.some((r) => typeof r.pinned === "boolean");
      const baseList = hasExplicitPins
        ? current
        : (() => {
            const seenPerTier: Record<NormalizedRuleSeverity, number> = {
              corrupted: 0,
              unstable: 0,
              unrelated: 0,
            };
            return current.map((item) => {
              const s = normalizeRuleSeverity(item);
              const idxInTier = seenPerTier[s];
              seenPerTier[s] += 1;
              return {
                ...item,
                pinned: idxInTier < 3,
                pinned_order: idxInTier < 3 ? idxInTier : undefined,
              };
            });
          })();

      const maxPinnedOrder = baseList
        .filter((r) => normalizeRuleSeverity(r) === normSev && r.pinned && r.id !== rule.id)
        .reduce((acc, r) => Math.max(acc, typeof r.pinned_order === "number" ? r.pinned_order : 0), -1);

      const finalizedRule: SchemaExceptionRule = {
        ...rule,
        raw_log: rule.raw_log ? scrubLogUserData(rule.raw_log) : "",
        severity: normSev,
        ignore_in_lab: normSev === "unrelated" ? true : !!rule.ignore_in_lab,
        pinned: Boolean(rule.pinned),
        pinned_order: rule.pinned
          ? typeof rule.pinned_order === "number"
            ? rule.pinned_order
            : maxPinnedOrder + 1
          : undefined,
      };
      const idx = baseList.findIndex((r) => r.id === finalizedRule.id);
      let next: SchemaExceptionRule[];
      if (idx >= 0) {
        next = [...baseList];
        next[idx] = finalizedRule;
      } else {
        next = [finalizedRule, ...baseList];
      }
      await saveExceptionRulesToSpoke(next, activeGameSchema);
      pushStatus(
        t("exc_rules_saved_toast", "Known Error Rule saved and synced to Master Schema!"),
        "success"
      );
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (readOnly) return;
    setIsSaving(true);
    try {
      const current = getExceptionRules(activeGameSchema);
      const next = current.filter((r) => r.id !== rule.id);
      await saveExceptionRulesToSpoke(next, activeGameSchema);
      pushStatus(t("exc_rules_deleted_toast", "Known Error Rule removed."), "info");
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const severityOptions = [
    {
      id: "corrupted",
      label: t("status_corrupted", "Corrupted"),
    },
    {
      id: "unstable",
      label: t("label_unstable", "Unstable"),
    },
    {
      id: "unrelated",
      label: t("exc_rules_filter_unrelated", "Unrelated"),
    },
  ];

  const normSev = normalizeRuleSeverity(rule);
  const isCrit = normSev === "corrupted";
  const isBenign = normSev === "unrelated";
  const sevIcon = isCrit
    ? t("icon_gpp_maybe", "gpp_maybe")
    : isBenign
      ? t("icon_bug_report", "bug_report")
      : t("icon_warning", "warning");

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={
        readOnly
          ? t("exc_rules_knowledge_title", "Community Known Error Knowledge")
          : t("exc_rules_editor_title", "Known Exception / Error Log Rule")
      }
      subtitle={
        readOnly
          ? t(
            "exc_rules_knowledge_subtitle",
            "Community-maintained cause and fix steps for this exception pattern"
          )
          : t("exc_rules_editor_subtitle", "Define how Sanctuary OS explains or filters known game & {mod} exceptions for this community")
      }
      icon={readOnly ? t("icon_psychology", "psychology") : t("icon_rule", "rule")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[820px]"
      headerActions={
        !readOnly ? (
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_save", "save")}
              variant="success"
              disabled={isSaving || !rule.title.trim() || !rule.pattern.trim()}
              tooltip={t("exc_rules_btn_save", "Save Known Error Rule")}
              onClick={handleSave}
            />
            {isExisting && (
              <PanelHeaderButton
                icon={t("icon_delete", "delete")}
                variant="danger"
                disabled={isSaving}
                tooltip={t("exc_rules_btn_delete", "Delete Rule")}
                onClick={handleDelete}
              />
            )}
          </PanelHeaderGroup>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-5 mt-2 w-full pb-8">
        <SidePanelHeroCard
          title={
            rule.title ||
            t("exc_rules_editor_title", "Known Exception / Error Log Rule")
          }
          subtitle={
            readOnly
              ? t(
                "exc_rules_knowledge_subtitle",
                "Community-maintained cause and fix steps for this exception pattern"
              )
              : t("exc_rules_editor_subtitle", "Define how Sanctuary OS explains or filters known game & {mod} exceptions for this community")
          }
          label={<code className="font-mono tracking-normal">{rule.file_hint || defaultFileHint}</code>}
          icon={sevIcon}
          variant={isCrit ? "danger" : isBenign ? "success" : "warning"}
          badges={[
            {
              icon: sevIcon,
              label: isCrit
                ? t("status_corrupted", "Corrupted")
                : isBenign
                  ? t("exc_rules_filter_unrelated", "Unrelated")
                  : t("label_unstable", "Unstable"),
              colorClass: isCrit
                ? "text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_45%,transparent)]"
                : isBenign
                  ? "text-[var(--success)] border-[color-mix(in_srgb,var(--success)_45%,transparent)]"
                  : "text-[var(--warning)] border-[color-mix(in_srgb,var(--warning)_45%,transparent)]",
            },
            {
              icon:
                isBenign || rule.ignore_in_lab
                  ? t("icon_verified", "verified")
                  : t("icon_science", "science"),
              label:
                isBenign || rule.ignore_in_lab
                  ? t("exc_rules_badge_no_autofail", "Ignored in {Lab}")
                  : t("exc_rules_lab_fails_test", "Fails {Lab} Test"),
              colorClass:
                isBenign || rule.ignore_in_lab
                  ? "text-[var(--success)] border-[color-mix(in_srgb,var(--success)_35%,transparent)]"
                  : "text-[var(--warning)] border-[color-mix(in_srgb,var(--warning)_35%,transparent)]",
            },
          ]}
        >
          {/* 3-Column Telemetry / Rule Config Row */}
          {readOnly ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
              <StatBox
                icon={sevIcon}
                iconColorClass={
                  isCrit
                    ? "text-[var(--danger)]"
                    : isBenign
                      ? "text-[var(--success)]"
                      : "text-[var(--warning)]"
                }
                label={t("exc_rules_col_classification", "Issue Classification")}
                value={
                  isCrit
                    ? t("status_corrupted", "Corrupted")
                    : isBenign
                      ? t("exc_rules_filter_unrelated", "Unrelated")
                      : t("label_unstable", "Unstable")
                }
              />
              <StatBox
                icon={t("icon_description", "description")}
                iconColorClass="text-[var(--accent)]"
                label={t("exc_rules_col_log_source", "Log File Source")}
                value={<code className="font-mono text-xs">{rule.file_hint || defaultFileHint}</code>}
              />
              <StatBox
                icon={
                  isBenign || rule.ignore_in_lab
                    ? t("icon_verified", "verified")
                    : t("icon_science", "science")
                }
                iconColorClass={
                  isBenign || rule.ignore_in_lab
                    ? "text-[var(--success)]"
                    : "text-[var(--warning)]"
                }
                label={t("exc_rules_col_lab_behavior", "Lab Test Behavior")}
                value={
                  isBenign || rule.ignore_in_lab
                    ? t("exc_rules_badge_no_autofail", "Ignored in {Lab}")
                    : t("exc_rules_lab_fails_test", "Fails {Lab} Test")
                }
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full">
              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col justify-between gap-2">
                <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest flex items-center gap-1.5">
                  <span className="material-symbols-outlined !text-[13px] text-[var(--accent)] shrink-0">
                    {sevIcon}
                  </span>
                  <span className="leading-snug">
                    {t("exc_rules_col_classification", "Issue Classification")}
                  </span>
                </label>
                <CustomDropdown
                  disableTint={true}
                  value={normSev}
                  options={severityOptions}
                  onChange={(vals: any) => {
                    const rawVal = Array.isArray(vals) ? vals[0] : vals;
                    const chosen = (rawVal || "unstable") as NormalizedRuleSeverity;
                    setRule((prev) => ({
                      ...prev,
                      severity: chosen,
                      ignore_in_lab: chosen === "unrelated",
                    }));
                  }}
                />
              </div>

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col justify-between gap-2">
                <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest flex items-center gap-1.5">
                  <span className="material-symbols-outlined !text-[13px] text-[var(--accent)] shrink-0">
                    {t("icon_description", "description")}
                  </span>
                  <span className="leading-snug">
                    {t("exc_rules_col_log_source", "Log File Source")}
                  </span>
                </label>
                <input
                  value={rule.file_hint || ""}
                  onChange={(e) => setRule((prev) => ({ ...prev, file_hint: e.target.value }))}
                  placeholder={
                    t(
                      "exc_rules_field_file_hint_ph",
                      defaultFileHint
                    ) as string
                  }
                  className="w-full h-10 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col justify-between gap-2">
                <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest flex items-center gap-1.5">
                  <span className="material-symbols-outlined !text-[13px] text-[var(--accent)] shrink-0">
                    {t("icon_science", "science")}
                  </span>
                  <span className="leading-snug">
                    {t("exc_rules_col_lab_behavior", "Lab Test Behavior")}
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() =>
                    !isBenign &&
                    setRule((prev) => ({ ...prev, ignore_in_lab: !prev.ignore_in_lab }))
                  }
                  className="w-full h-10 glass-panel rounded-xl px-3.5 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] flex items-center justify-between gap-2 text-xs font-black text-[var(--text)] transition-all cursor-pointer"
                >
                  <span className="leading-snug text-left">
                    {isBenign || rule.ignore_in_lab
                      ? t("exc_rules_badge_no_autofail", "Ignored in {Lab}")
                      : t("exc_rules_lab_fails_test", "Fails {Lab} Test")}
                  </span>
                  <span
                    className={`material-symbols-outlined !text-[16px] shrink-0 ${
                      isBenign || rule.ignore_in_lab
                        ? "text-[var(--success)]"
                        : "text-[var(--warning)]"
                    }`}
                  >
                    {isBenign || rule.ignore_in_lab
                      ? t("icon_verified", "verified")
                      : t("icon_warning", "warning")}
                  </span>
                </button>
              </div>

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col justify-between gap-2">
                <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest flex items-center gap-1.5">
                  <span className="material-symbols-outlined !text-[13px] text-[var(--accent)] shrink-0">
                    {t("icon_push_pin", "push_pin")}
                  </span>
                  <span className="leading-snug">
                    {t("exc_rules_col_pinned", "Overview Pin")}
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => setRule((prev) => ({ ...prev, pinned: !prev.pinned }))}
                  className={`w-full h-10 glass-panel rounded-xl px-3.5 border flex items-center justify-between gap-2 text-xs font-black transition-all cursor-pointer ${
                    rule.pinned
                      ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--text)]"
                      : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[var(--subtext)]"
                  }`}
                >
                  <span className="leading-snug text-left">
                    {rule.pinned
                      ? t("pinned", "Pinned")
                      : t("pin_item", "Pin")}
                  </span>
                  <span
                    className={`material-symbols-outlined !text-[16px] shrink-0 ${
                      rule.pinned ? "text-[var(--accent)]" : "text-[var(--subtext)]"
                    }`}
                  >
                    {t("icon_push_pin", "push_pin")}
                  </span>
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1 ml-auto w-full">
            {readOnly ? (
              <>
                {Boolean(rule.pattern) && (
                  <ActionButton
                    variant="glass"
                    icon={
                      copiedSignature
                        ? t("icon_check", "check")
                        : t("icon_content_copy", "content_copy")
                    }
                    label={
                      copiedSignature
                        ? t("copied", "Copied")
                        : t("exc_rules_btn_copy_signature", "Copy Signature")
                    }
                    onClick={() => {
                      if (!rule.pattern) return;
                      navigator.clipboard?.writeText(rule.pattern);
                      setCopiedSignature(true);
                      setTimeout(() => setCopiedSignature(false), 1800);
                    }}
                  />
                )}
                {Boolean(rule.resolution) && (
                  <ActionButton
                    variant="accent"
                    icon={
                      copiedFix
                        ? t("icon_check", "check")
                        : t("icon_lightbulb", "lightbulb")
                    }
                    label={
                      copiedFix
                        ? t("copied", "Copied")
                        : t("exc_rules_btn_copy_fix", "Copy Fix Steps")
                    }
                    onClick={() => {
                      if (!rule.resolution) return;
                      navigator.clipboard?.writeText(rule.resolution);
                      setCopiedFix(true);
                      setTimeout(() => setCopiedFix(false), 1800);
                    }}
                  />
                )}
              </>
            ) : (
              <>
                {isExisting && (
                  <ActionButton
                    variant="danger"
                    icon={t("icon_delete", "delete")}
                    label={t("delete", "{Delete}")}
                    disabled={isSaving}
                    onClick={handleDelete}
                  />
                )}
                <ActionButton
                  variant="success"
                  icon={t("icon_save", "save")}
                  label={t("save", "Save Changes")}
                  disabled={isSaving || !rule.title.trim() || !rule.pattern.trim()}
                  onClick={handleSave}
                />
              </>
            )}
          </div>
        </SidePanelHeroCard>

        <SidePanelTitleInput
          label={t("exc_rules_field_title_label", "Error Title")}
          icon={t("icon_edit_note", "edit_note")}
          value={rule.title}
          onChange={!readOnly ? (val) => setRule((prev) => ({ ...prev, title: val })) : undefined}
          readOnly={readOnly}
          placeholder={
            t(
              "exc_rules_field_title_ph",
              "e.g. StoreUtils / VirtualCurrencyWallet UI Desync"
            ) as string
          }
        />

        {/* Matched Log Signature Bar */}
        <UniversalGroup
          title={t("exc_rules_header_pattern", "Matched Log Signature")}
          icon={t("icon_rule", "rule")}
          headerAction={
            !readOnly && (rule.raw_log || "").trim().length > 0 ? (
              <PanelHeaderGroup>
                <PanelHeaderButton
                  icon={t("icon_auto_fix", "auto_fix_high")}
                  label={t("exc_rules_btn_extract_pattern", "Auto-Extract Signature from Log")}
                  variant="accent"
                  onClick={handleExtractFromRawLog}
                />
              </PanelHeaderGroup>
            ) : undefined
          }
        >
          {readOnly ? (
            <div className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] font-mono text-xs font-bold text-[var(--text)] break-words leading-relaxed">
              {rule.pattern}
            </div>
          ) : (
            <input
              value={rule.pattern}
              onChange={(e) => setRule((prev) => ({ ...prev, pattern: e.target.value }))}
              placeholder={
                t(
                  "exc_rules_field_pattern_ph",
                  "e.g. StoreUtils/StoreDisabledByFeatureParameter | Error #1006"
                ) as string
              }
              className="w-full glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:border-[var(--accent)] font-mono text-xs font-bold text-[var(--text)] focus:outline-none"
            />
          )}
        </UniversalGroup>

        {/* Side-by-Side Community Diagnosis (Cause) + Recommended Fix / Resolution */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] flex items-center gap-1.5 truncate">
                <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
                  {t("icon_psychology", "psychology")}
                </span>
                <span className="truncate">
                  {t("exc_rules_header_cause", "Community Diagnosis (Cause)")}
                </span>
              </span>
            </div>
            {readOnly ? (
              <div className="p-4 text-xs font-medium text-[var(--text)] leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto custom-scrollbar">
                {rule.diagnosis || "--"}
              </div>
            ) : (
              <textarea
                rows={6}
                value={rule.diagnosis}
                onChange={(e) => setRule((prev) => ({ ...prev, diagnosis: e.target.value }))}
                placeholder={
                  t(
                    "exc_rules_field_diagnosis_ph",
                    "Explain what the community knows about this exception in plain language..."
                  ) as string
                }
                className="w-full p-4 bg-transparent text-xs font-medium text-[var(--text)] leading-relaxed focus:outline-none resize-y overflow-y-auto min-h-[150px] custom-scrollbar"
              />
            )}
          </div>

          <div className="glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] flex items-center gap-1.5 truncate">
                <span className="material-symbols-outlined !text-[15px] text-[var(--success)] shrink-0">
                  {t("icon_lightbulb", "lightbulb")}
                </span>
                <span className="truncate">
                  {t("exc_rules_recommended_fix", "Recommended Fix / Resolution")}
                </span>
              </span>
            </div>
            {readOnly ? (
              <div className="p-4 text-xs font-medium text-[var(--text)] leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto custom-scrollbar">
                {rule.resolution || "--"}
              </div>
            ) : (
              <textarea
                rows={6}
                value={rule.resolution}
                onChange={(e) => setRule((prev) => ({ ...prev, resolution: e.target.value }))}
                placeholder={
                  t(
                    "exc_rules_field_resolution_ph",
                    "Explain what the player or creator should do to fix or verify this issue..."
                  ) as string
                }
                className="w-full p-4 bg-transparent text-xs font-medium text-[var(--text)] leading-relaxed focus:outline-none resize-y overflow-y-auto min-h-[150px] custom-scrollbar"
              />
            )}
          </div>
        </div>

        {/* Raw Exception / Stack Trace Terminal with Privacy Scrubber */}
        {(readOnly ? Boolean(rule.raw_log) : true) && (
          <div className="glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl overflow-hidden shadow-inner flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[var(--accent)] !text-[16px]">
                  {t("icon_terminal", "terminal")}
                </span>
                <span className="text-xs font-black font-mono text-[var(--text)]">
                  {t("exc_rules_raw_log_label", "Raw Exception / Stack Trace Snippet")}
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 flex-wrap ml-auto">
                <span className={VAULT_CHIP_CLASS}>
                  <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                    {t("icon_verified_user", "verified_user")}
                  </span>
                  <span>{t("lab_report_pii_scrubbed_badge", "USER DATA SCRUBBED")}</span>
                </span>

                {Boolean(rule.raw_log) && (
                  <PanelHeaderGroup>
                    <PanelHeaderButton
                      icon={copiedRawLog ? t("icon_check", "check") : t("icon_content_copy", "content_copy")}
                      label={
                        copiedRawLog
                          ? t("copied", "Copied")
                          : t("lab_report_copy_btn", "Copy Log")
                      }
                      variant={copiedRawLog ? "success" : "default"}
                      onClick={() => {
                        if (!rule.raw_log) return;
                        navigator.clipboard?.writeText(formatHumanReadableLogText(rule.raw_log));
                        setCopiedRawLog(true);
                        setTimeout(() => setCopiedRawLog(false), 1800);
                      }}
                    />
                  </PanelHeaderGroup>
                )}
              </div>
            </div>

            {readOnly ? (
              <pre className="p-4 font-mono text-[11px] text-[var(--text)] whitespace-pre-wrap break-words leading-relaxed max-h-64 overflow-y-auto custom-scrollbar opacity-90">
                {formatHumanReadableLogText(rule.raw_log)}
              </pre>
            ) : (
              <textarea
                rows={7}
                value={rule.raw_log || ""}
                onChange={(e) =>
                  setRule((prev) => ({
                    ...prev,
                    raw_log: formatHumanReadableLogText(e.target.value),
                  }))
                }
                placeholder={
                  t(
                    "exc_rules_paste_log_ph",
                    "Paste a raw exception or crash log snippet here to auto-extract its signature..."
                  ) as string
                }
                className="w-full p-4 bg-transparent font-mono text-[11px] text-[var(--text)] leading-relaxed focus:outline-none resize-y overflow-y-auto min-h-[160px] custom-scrollbar"
              />
            )}
          </div>
        )}
      </div>
    </SidePanel>
  );
}

function KnownErrorFilterSection({
  title,
  options,
  value,
  onChange,
  t,
  codeLabels = false,
  columns = 2,
}: {
  title: string;
  options: { id: string; label: string; count?: number }[];
  value: string;
  onChange: (val: string) => void;
  t: (key: string, fallback: string) => string;
  codeLabels?: boolean;
  columns?: 1 | 2;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 px-1 flex items-center gap-2">
        <span>{title}</span>
        <div className="h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex-1"></div>
      </div>
      <div className={`grid ${columns === 1 ? "grid-cols-1" : "grid-cols-2"} gap-1.5`}>
        {options.map((opt) => {
          const active = String(value).toLowerCase() === String(opt.id).toLowerCase();
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className={`sa-dropdown-item flex items-center justify-between gap-2.5 px-3 py-2 text-[11px] tracking-wide text-left cursor-pointer min-w-0 ${
                active ? "is-selected font-bold" : "font-semibold"
              }`}
            >
              {codeLabels && opt.id !== "all" ? (
                <code className="font-mono text-[10.5px] leading-snug break-all min-w-0">
                  {opt.label}
                </code>
              ) : (
                <span className="leading-snug break-words min-w-0">{opt.label}</span>
              )}
              <div className="flex items-center gap-1.5 shrink-0">
                {typeof opt.count === "number" && (
                  <span className="text-[10px] font-mono font-bold text-[var(--subtext)] opacity-75 tabular-nums">
                    ({opt.count})
                  </span>
                )}
                {active && (
                  <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
                    {t("icon_check", "check")}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type KnownErrorSortField = "severity" | "pinned" | "title" | "source";

export function KnownErrorFilterPopoverContent({
  rules,
  severityFilter,
  onSeverityFilterChange,
  labBehaviorFilter = "all",
  onLabBehaviorFilterChange,
  fileHintFilter = "all",
  onFileHintFilterChange,
  sortBy = "severity",
  onSortByChange,
}: {
  rules: SchemaExceptionRule[];
  severityFilter: "all" | NormalizedRuleSeverity;
  onSeverityFilterChange: (val: "all" | NormalizedRuleSeverity) => void;
  labBehaviorFilter?: "all" | "fails" | "ignored";
  onLabBehaviorFilterChange?: (val: "all" | "fails" | "ignored") => void;
  fileHintFilter?: string;
  onFileHintFilterChange?: (val: string) => void;
  sortBy?: KnownErrorSortField;
  onSortByChange?: (val: KnownErrorSortField) => void;
}) {
  const { t } = useLexicon();

  const counts = useMemo(() => {
    let corrupted = 0;
    let unstable = 0;
    let unrelated = 0;
    let failsLab = 0;
    let ignoredInLab = 0;
    const hintMap = new Map<string, { label: string; count: number }>();

    for (const r of rules) {
      const sev = normalizeRuleSeverity(r);
      if (sev === "corrupted") corrupted++;
      else if (sev === "unstable") unstable++;
      else unrelated++;

      if (sev === "unrelated" || r.ignore_in_lab) ignoredInLab++;
      else failsLab++;

      const hint = String(r.file_hint || "").trim();
      if (hint) {
        const key = hint.toLowerCase();
        const prev = hintMap.get(key);
        if (prev) prev.count += 1;
        else hintMap.set(key, { label: hint, count: 1 });
      }
    }

    return {
      total: rules.length,
      corrupted,
      unstable,
      unrelated,
      failsLab,
      ignoredInLab,
      fileHints: Array.from(hintMap.entries()).map(([key, item]) => ({
        id: key,
        label: item.label,
        count: item.count,
      })),
    };
  }, [rules]);

  return (
    <div className="flex flex-col w-[420px] max-w-[calc(100vw-40px)] p-4 gap-5 text-left">
      <KnownErrorFilterSection
        t={t}
        columns={2}
        title={t("exc_rules_col_classification", "Issue Classification")}
        value={severityFilter}
        onChange={(val) => onSeverityFilterChange(val as "all" | NormalizedRuleSeverity)}
        options={[
          { id: "all", label: t("filter_all", "All"), count: counts.total },
          {
            id: "corrupted",
            label: t("status_corrupted", "Corrupted"),
            count: counts.corrupted,
          },
          {
            id: "unstable",
            label: t("label_unstable", "Unstable"),
            count: counts.unstable,
          },
          {
            id: "unrelated",
            label: t("exc_rules_filter_unrelated", "Unrelated"),
            count: counts.unrelated,
          },
        ]}
      />

      {onLabBehaviorFilterChange && (
        <KnownErrorFilterSection
          t={t}
          columns={1}
          title={t("exc_rules_col_lab_behavior", "Lab Test Behavior")}
          value={labBehaviorFilter}
          onChange={(val) => onLabBehaviorFilterChange(val as "all" | "fails" | "ignored")}
          options={[
            { id: "all", label: t("filter_all", "All"), count: counts.total },
            {
              id: "fails",
              label: t("exc_rules_lab_fails_test", "Fails {Lab} Test"),
              count: counts.failsLab,
            },
            {
              id: "ignored",
              label: t("exc_rules_badge_no_autofail", "Ignored in {Lab}"),
              count: counts.ignoredInLab,
            },
          ]}
        />
      )}

      {onFileHintFilterChange && counts.fileHints.length > 1 && (
        <KnownErrorFilterSection
          t={t}
          columns={1}
          codeLabels={true}
          title={t("exc_rules_col_log_source", "Log File Source")}
          value={fileHintFilter}
          onChange={onFileHintFilterChange}
          options={[
            { id: "all", label: t("filter_all", "All"), count: counts.total },
            ...counts.fileHints,
          ]}
        />
      )}

      {onSortByChange && (
        <KnownErrorFilterSection
          t={t}
          columns={2}
          title={t("sort_by", "Sort By")}
          value={sortBy}
          onChange={(val) => onSortByChange(val as KnownErrorSortField)}
          options={[
            { id: "severity", label: t("label_severity", "Severity") },
            { id: "pinned", label: t("pinned", "Pinned") },
            { id: "title", label: t("exc_rules_field_title_label", "Error Title") },
            { id: "source", label: t("exc_rules_col_log_source", "Log File Source") },
          ]}
        />
      )}
    </div>
  );
}

interface KnownErrorSectionInfoCardProps {
  icon: string;
  accentVar: string;
  iconColorClass: string;
  badgeLabel: string;
  overline: string;
  title: string;
  description: string;
  actionLabel: string;
  actionIcon: string;
  onAction: () => void;
}

function KnownErrorSectionInfoCard({
  icon,
  accentVar,
  iconColorClass,
  badgeLabel,
  overline,
  title,
  description,
  actionLabel,
  actionIcon,
  onAction,
}: KnownErrorSectionInfoCardProps) {
  return (
    <div
      className="glass-panel rounded-[var(--radius)] p-5 flex flex-col gap-3.5 relative overflow-hidden h-full"
      style={{
        backgroundColor: `color-mix(in srgb, ${accentVar} 4%, transparent)`,
        borderColor: `color-mix(in srgb, ${accentVar} 20%, transparent)`,
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{
          background: `radial-gradient(circle at 88% 12%, color-mix(in srgb, ${accentVar} 14%, transparent) 0%, transparent 62%)`,
        }}
      />
      <span
        className={`material-symbols-outlined absolute -right-3 -bottom-4 !text-[84px] ${iconColorClass} opacity-[0.04] pointer-events-none select-none rotate-[-10deg]`}
      >
        {icon}
      </span>

      {/* Row 1: Semantic Icon Well on Left + Frosted Count Chip on Right */}
      <div className="flex items-center justify-between gap-3 relative z-10">
        <div
          className={`w-11 h-11 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] ${iconColorClass} flex items-center justify-center shrink-0`}
        >
          <span className="material-symbols-outlined !text-[22px]">{icon}</span>
        </div>
        <span className={VAULT_CHIP_CLASS}>
          <span className={`material-symbols-outlined !text-[12px] shrink-0 ${iconColorClass}`}>
            {icon}
          </span>
          <span>{badgeLabel}</span>
        </span>
      </div>

      {/* Row 2: Overline + Title */}
      <div className="flex flex-col gap-1 relative z-10">
        <span
          className={`text-[10px] font-mono font-black uppercase tracking-[0.14em] ${iconColorClass} leading-snug`}
        >
          {overline}
        </span>
        <h3 className="text-[15px] md:text-base font-black text-[var(--text)] tracking-tight leading-snug m-0">
          {title}
        </h3>
      </div>

      {/* Row 3: Full Description (Never Truncated) */}
      <p className="text-xs font-medium text-[var(--subtext)] opacity-85 leading-relaxed m-0 relative z-10">
        {description}
      </p>

      {/* Row 4: View All Action Footer */}
      <div className="pt-3 mt-auto border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 relative z-10 w-full">
        <ActionButton
          variant="glass"
          icon={actionIcon}
          label={actionLabel}
          onClick={onAction}
          className="w-full"
        />
      </div>
    </div>
  );
}

const SEVERITY_SORT_RANK: Record<NormalizedRuleSeverity, number> = {
  corrupted: 0,
  unstable: 1,
  unrelated: 2,
};

const KNOWN_ERRORS_PAGE_SIZE = 24;
const ORDERED_SEVERITY_TIERS: NormalizedRuleSeverity[] = [
  "corrupted",
  "unstable",
  "unrelated",
];

function materializeRulesWithDefaults(currentRules: SchemaExceptionRule[]): SchemaExceptionRule[] {
  if (currentRules.some((r) => typeof r.pinned === "boolean")) {
    return currentRules.map((r) => ({ ...r, pinned: Boolean(r.pinned) }));
  }
  const seenPerTier: Record<NormalizedRuleSeverity, number> = {
    corrupted: 0,
    unstable: 0,
    unrelated: 0,
  };
  return currentRules.map((item) => {
    const sev = normalizeRuleSeverity(item);
    const idxInTier = seenPerTier[sev];
    seenPerTier[sev] += 1;
    const isDefaultPinned = idxInTier < 3;
    return {
      ...item,
      pinned: isDefaultPinned,
      pinned_order: isDefaultPinned ? idxInTier : undefined,
    };
  });
}

export function KnownErrorRulesManager({
  searchQuery = "",
  onClearSearch,
  canEdit = false,
  externalTriggerCreate = 0,
  externalTriggerCreateGameBug = 0,
  hideTopBarButton = false,
  severityFilter,
  onSeverityFilterChange,
  labBehaviorFilter = "all",
  fileHintFilter = "all",
  sortBy = "severity",
}: {
  searchQuery?: string;
  onClearSearch?: () => void;
  canEdit?: boolean;
  externalTriggerCreate?: number;
  externalTriggerCreateGameBug?: number;
  hideTopBarButton?: boolean;
  severityFilter?: "all" | NormalizedRuleSeverity;
  onSeverityFilterChange?: (val: "all" | NormalizedRuleSeverity) => void;
  labBehaviorFilter?: "all" | "fails" | "ignored";
  fileHintFilter?: string;
  sortBy?: KnownErrorSortField;
}) {
  const { t } = useLexicon();
  const activeGameSchema = useStore((s) => s.activeGameSchema);
  const [rules, setRules] = useState<SchemaExceptionRule[]>(() =>
    getExceptionRules(activeGameSchema)
  );
  const [localFilter, setLocalFilter] = useState<"all" | NormalizedRuleSeverity>("all");
  const [editingRule, setEditingRule] = useState<SchemaExceptionRule | null>(null);
  const [defaultAsGameBug, setDefaultAsGameBug] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Full Directory SidePanel State (opened via "View All" or "View More")
  const [isDirectoryOpen, setIsDirectoryOpen] = useState(false);
  const [directorySeverity, setDirectorySeverity] = useState<"all" | NormalizedRuleSeverity>("all");
  const [directorySearch, setDirectorySearch] = useState("");
  const [directorySort, setDirectorySort] = useState<KnownErrorSortField>("pinned");
  const [directoryLabBehavior, setDirectoryLabBehavior] = useState<"all" | "fails" | "ignored">("all");
  const [directoryPage, setDirectoryPage] = useState(1);

  const activeFilter = severityFilter !== undefined ? severityFilter : localFilter;

  const handleSelectSeverity = (nextSev: "all" | NormalizedRuleSeverity) => {
    if (onSeverityFilterChange) {
      onSeverityFilterChange(nextSev);
    } else {
      setLocalFilter(nextSev);
    }
    setCurrentPage(1);
  };

  const openDirectoryDrawer = (initialTier: "all" | NormalizedRuleSeverity = "all") => {
    setDirectorySeverity(initialTier);
    setDirectoryPage(1);
    setIsDirectoryOpen(true);
  };

  useEffect(() => {
    const refresh = () => {
      const loaded = getExceptionRules(useStore.getState().activeGameSchema);
      setRules(loaded);
      if (isDesktop()) {
        const currentSchema = useStore.getState().activeGameSchema || {};
        invoke("update_active_game_schema", {
          schema: { ...currentSchema, exception_rules: loaded },
        }).catch(() => { });
      }
    };
    refresh();
    window.addEventListener("sanctuary-exception-rules-updated", refresh);
    return () => window.removeEventListener("sanctuary-exception-rules-updated", refresh);
  }, [activeGameSchema]);

  useEffect(() => {
    if (externalTriggerCreate > 0 && canEdit) {
      setEditingRule(null);
      setDefaultAsGameBug(false);
      setIsEditorOpen(true);
    }
  }, [externalTriggerCreate, canEdit]);

  useEffect(() => {
    if (externalTriggerCreateGameBug > 0 && canEdit) {
      setEditingRule(null);
      setDefaultAsGameBug(true);
      setIsEditorOpen(true);
    }
  }, [externalTriggerCreateGameBug, canEdit]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeFilter, labBehaviorFilter, fileHintFilter, sortBy]);

  useEffect(() => {
    setDirectoryPage(1);
  }, [directorySeverity, directorySearch, directorySort, directoryLabBehavior]);

  const effectiveRules = useMemo(() => materializeRulesWithDefaults(rules), [rules]);
  const pinnedIds = useMemo(
    () => new Set(effectiveRules.filter((r) => Boolean(r.pinned)).map((r) => r.id)),
    [effectiveRules]
  );

  const severityMeta = useMemo(
    () => ({
      corrupted: {
        label: t("status_corrupted", "Corrupted"),
        overline: `${t("exc_rules_lab_fails_test", "Fails {Lab} Test")} • ${t("status_corrupted", "Corrupted")}`,
        subtitle: t(
          "exc_rules_tier_corrupted_desc",
          "Critical crashes, broken binary or script hooks, and engine-halting patch mismatches."
        ),
        icon: t("icon_gpp_maybe", "gpp_maybe"),
        iconColorClass: "text-[var(--danger)]",
        accentVar: "var(--danger)",
        variant: "danger" as const,
      },
      unstable: {
        label: t("label_unstable", "Unstable"),
        overline: `${t("exc_rules_lab_fails_test", "Fails {Lab} Test")} • ${t("label_unstable", "Unstable")}`,
        subtitle: t(
          "exc_rules_tier_unstable_desc",
          "Non-fatal runtime exceptions, UI desyncs, autonomy resets, and conditional {mod} issues."
        ),
        icon: t("icon_warning", "warning"),
        iconColorClass: "text-[var(--warning)]",
        accentVar: "var(--warning)",
        variant: "warning" as const,
      },
      unrelated: {
        label: t("exc_rules_filter_unrelated", "Unrelated"),
        overline: `${t("exc_rules_badge_no_autofail", "Ignored in {Lab}")} • ${t("exc_rules_filter_unrelated", "Unrelated")}`,
        subtitle: t(
          "exc_rules_tier_unrelated_desc",
          "Known base-game engine bugs that occur without {mods} and are ignored during {Lab} tests."
        ),
        icon: t("icon_bug_report", "bug_report"),
        iconColorClass: "text-[var(--success)]",
        accentVar: "var(--success)",
        variant: "success" as const,
      },
    }),
    [t]
  );

  // Full tier totals + Architect-sorted pinned lists for the 3-section overview
  const overviewSections = useMemo(() => {
    const allByTier: Record<NormalizedRuleSeverity, SchemaExceptionRule[]> = {
      corrupted: [],
      unstable: [],
      unrelated: [],
    };
    const pinnedByTier: Record<NormalizedRuleSeverity, SchemaExceptionRule[]> = {
      corrupted: [],
      unstable: [],
      unrelated: [],
    };

    for (const r of effectiveRules) {
      const sev = normalizeRuleSeverity(r);
      allByTier[sev].push(r);
      if (r.pinned) {
        pinnedByTier[sev].push(r);
      }
    }

    for (const sev of ORDERED_SEVERITY_TIERS) {
      pinnedByTier[sev].sort((a, b) => {
        const ordA = typeof a.pinned_order === "number" ? a.pinned_order : 9999;
        const ordB = typeof b.pinned_order === "number" ? b.pinned_order : 9999;
        if (ordA !== ordB) return ordA - ordB;
        return a.title.localeCompare(b.title);
      });
    }

    return { allByTier, pinnedByTier };
  }, [effectiveRules]);

  const handleTogglePin = async (targetRule: SchemaExceptionRule, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!canEdit) return;
    const base = materializeRulesWithDefaults(getExceptionRules(activeGameSchema));
    const targetSev = normalizeRuleSeverity(targetRule);
    const currentlyPinned = Boolean(base.find((r) => r.id === targetRule.id)?.pinned);
    const nextPinnedState = !currentlyPinned;

    const maxOrderInTier = base
      .filter((r) => normalizeRuleSeverity(r) === targetSev && r.pinned && r.id !== targetRule.id)
      .reduce((acc, r) => Math.max(acc, typeof r.pinned_order === "number" ? r.pinned_order : 0), -1);

    const updated = base.map((r) => {
      if (r.id !== targetRule.id) return r;
      return {
        ...r,
        pinned: nextPinnedState,
        pinned_order: nextPinnedState ? maxOrderInTier + 1 : undefined,
      };
    });

    await saveExceptionRulesToSpoke(updated, activeGameSchema);
    useStore
      .getState()
      .pushStatus(
        nextPinnedState
          ? t("exc_rules_pinned_toast", "Pinned to Known Errors overview.")
          : t("exc_rules_unpinned_toast", "Unpinned from Known Errors overview."),
        "info"
      );
  };

  const handleMovePinned = async (
    targetRule: SchemaExceptionRule,
    direction: -1 | 1,
    e?: React.MouseEvent
  ) => {
    if (e) e.stopPropagation();
    if (!canEdit) return;
    const base = materializeRulesWithDefaults(getExceptionRules(activeGameSchema));
    const targetSev = normalizeRuleSeverity(targetRule);
    const tierPinned = base
      .filter((r) => normalizeRuleSeverity(r) === targetSev && r.pinned)
      .sort((a, b) => {
        const ordA = typeof a.pinned_order === "number" ? a.pinned_order : 9999;
        const ordB = typeof b.pinned_order === "number" ? b.pinned_order : 9999;
        if (ordA !== ordB) return ordA - ordB;
        return a.title.localeCompare(b.title);
      });

    const curIdx = tierPinned.findIndex((r) => r.id === targetRule.id);
    const swapIdx = curIdx + direction;
    if (curIdx < 0 || swapIdx < 0 || swapIdx >= tierPinned.length) return;

    const reordered = [...tierPinned];
    const [moved] = reordered.splice(curIdx, 1);
    reordered.splice(swapIdx, 0, moved);

    const orderMap = new Map<string, number>();
    reordered.forEach((item, idx) => orderMap.set(item.id, idx));

    const updated = base.map((r) => {
      if (orderMap.has(r.id)) {
        return { ...r, pinned: true, pinned_order: orderMap.get(r.id) };
      }
      return r;
    });

    await saveExceptionRulesToSpoke(updated, activeGameSchema);
  };

  const sortRulesList = (list: SchemaExceptionRule[], mode: KnownErrorSortField) => {
    return [...list].sort((a, b) => {
      const sevA = normalizeRuleSeverity(a);
      const sevB = normalizeRuleSeverity(b);

      if (mode === "pinned") {
        const pinA = pinnedIds.has(a.id) ? 0 : 1;
        const pinB = pinnedIds.has(b.id) ? 0 : 1;
        if (pinA !== pinB) return pinA - pinB;
        const sevDiff = SEVERITY_SORT_RANK[sevA] - SEVERITY_SORT_RANK[sevB];
        if (sevDiff !== 0) return sevDiff;
        const ordA = typeof a.pinned_order === "number" ? a.pinned_order : 9999;
        const ordB = typeof b.pinned_order === "number" ? b.pinned_order : 9999;
        if (ordA !== ordB) return ordA - ordB;
        return a.title.localeCompare(b.title);
      }

      if (mode === "title") {
        return a.title.localeCompare(b.title);
      }
      if (mode === "source") {
        const srcA = (a.file_hint || "").toLowerCase();
        const srcB = (b.file_hint || "").toLowerCase();
        const diff = srcA.localeCompare(srcB);
        if (diff !== 0) return diff;
        return a.title.localeCompare(b.title);
      }
      const diff = SEVERITY_SORT_RANK[sevA] - SEVERITY_SORT_RANK[sevB];
      if (diff !== 0) return diff;
      const pinA = pinnedIds.has(a.id) ? 0 : 1;
      const pinB = pinnedIds.has(b.id) ? 0 : 1;
      if (pinA !== pinB) return pinA - pinB;
      return a.title.localeCompare(b.title);
    });
  };

  // Main-page search & filter pulls from ALL rules (not just pinned) so users never have to dig
  const isMainPageFilteredOrSearching =
    searchQuery.trim().length > 0 ||
    activeFilter !== "all" ||
    labBehaviorFilter !== "all" ||
    (fileHintFilter || "all").toLowerCase() !== "all";

  const filteredAndSorted = useMemo(() => {
    const rawQuery = searchQuery.trim();
    const q = rawQuery.toLowerCase();
    const normHintFilter = (fileHintFilter || "all").toLowerCase();

    const matchedByLogIds = rawQuery
      ? new Set(matchExceptionRules(rawQuery, effectiveRules).map((r) => r.id))
      : null;

    const matches = effectiveRules.filter((r) => {
      const normSev = normalizeRuleSeverity(r);
      if (activeFilter !== "all" && normSev !== activeFilter) return false;

      const isIgnored = normSev === "unrelated" || Boolean(r.ignore_in_lab);
      if (labBehaviorFilter === "fails" && isIgnored) return false;
      if (labBehaviorFilter === "ignored" && !isIgnored) return false;

      if (
        normHintFilter !== "all" &&
        String(r.file_hint || "").trim().toLowerCase() !== normHintFilter
      ) {
        return false;
      }

      if (!q) return true;
      if (matchedByLogIds?.has(r.id)) return true;

      return (
        r.title.toLowerCase().includes(q) ||
        r.pattern.toLowerCase().includes(q) ||
        (r.file_hint || "").toLowerCase().includes(q) ||
        (r.diagnosis || "").toLowerCase().includes(q) ||
        (r.resolution || "").toLowerCase().includes(q)
      );
    });

    return sortRulesList(matches, sortBy);
  }, [effectiveRules, activeFilter, labBehaviorFilter, fileHintFilter, searchQuery, sortBy, pinnedIds]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / KNOWN_ERRORS_PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedRules = useMemo(() => {
    const start = (safePage - 1) * KNOWN_ERRORS_PAGE_SIZE;
    return filteredAndSorted.slice(start, start + KNOWN_ERRORS_PAGE_SIZE);
  }, [filteredAndSorted, safePage]);

  // Full Directory SidePanel filtered + sorted rules
  const directoryCounts = useMemo(
    () => ({
      total: effectiveRules.length,
      corrupted: overviewSections.allByTier.corrupted.length,
      unstable: overviewSections.allByTier.unstable.length,
      unrelated: overviewSections.allByTier.unrelated.length,
    }),
    [effectiveRules.length, overviewSections]
  );

  const directoryFilteredRules = useMemo(() => {
    const rawQuery = directorySearch.trim();
    const q = rawQuery.toLowerCase();
    const matchedByLogIds = rawQuery
      ? new Set(matchExceptionRules(rawQuery, effectiveRules).map((r) => r.id))
      : null;

    const matches = effectiveRules.filter((r) => {
      const normSev = normalizeRuleSeverity(r);
      if (directorySeverity !== "all" && normSev !== directorySeverity) return false;

      const isIgnored = normSev === "unrelated" || Boolean(r.ignore_in_lab);
      if (directoryLabBehavior === "fails" && isIgnored) return false;
      if (directoryLabBehavior === "ignored" && !isIgnored) return false;

      if (!q) return true;
      if (matchedByLogIds?.has(r.id)) return true;

      return (
        r.title.toLowerCase().includes(q) ||
        r.pattern.toLowerCase().includes(q) ||
        (r.file_hint || "").toLowerCase().includes(q) ||
        (r.diagnosis || "").toLowerCase().includes(q) ||
        (r.resolution || "").toLowerCase().includes(q)
      );
    });

    return sortRulesList(matches, directorySort);
  }, [effectiveRules, directorySeverity, directoryLabBehavior, directorySearch, directorySort, pinnedIds]);

  const directoryTotalPages = Math.max(
    1,
    Math.ceil(directoryFilteredRules.length / KNOWN_ERRORS_PAGE_SIZE)
  );
  const safeDirectoryPage = Math.min(directoryPage, directoryTotalPages);
  const pagedDirectoryRules = useMemo(() => {
    const start = (safeDirectoryPage - 1) * KNOWN_ERRORS_PAGE_SIZE;
    return directoryFilteredRules.slice(start, start + KNOWN_ERRORS_PAGE_SIZE);
  }, [directoryFilteredRules, safeDirectoryPage]);

  const handleOpenRuleContextMenu = (
    e: React.MouseEvent,
    rule: SchemaExceptionRule,
    statusLabel: string,
    iconName: string,
    iconColorClass: string,
    reorderCtx?: { index: number; count: number }
  ) => {
    const isPinned = pinnedIds.has(rule.id);
    const menuItems: SanctuaryContextMenuItem[] = [
      {
        id: "inspect_rule",
        label: canEdit
          ? t("exc_rules_btn_edit_rule", "Edit Rule")
          : t("view_details", "View Details"),
        icon: canEdit
          ? t("icon_edit", "edit")
          : t("icon_open_in_new", "open_in_new"),
        variant: "accent",
        onClick: () => {
          setEditingRule(rule);
          setDefaultAsGameBug(false);
          setIsEditorOpen(true);
        },
      },
    ];

    if (canEdit) {
      menuItems.push({
        id: "toggle_pin",
        label: isPinned
          ? t("unpin_item", "Unpin")
          : t("pin_item", "Pin"),
        icon: t("icon_push_pin", "push_pin"),
        onClick: () => {
          handleTogglePin(rule);
        },
      });
      if (reorderCtx && reorderCtx.count > 1) {
        if (reorderCtx.index > 0) {
          menuItems.push({
            id: "move_earlier",
            label: t("move_up", "Move Up"),
            icon: t("icon_arrow_upward", "arrow_upward"),
            onClick: () => {
              handleMovePinned(rule, -1);
            },
          });
        }
        if (reorderCtx.index < reorderCtx.count - 1) {
          menuItems.push({
            id: "move_later",
            label: t("move_down", "Move Down"),
            icon: t("icon_arrow_downward", "arrow_downward"),
            onClick: () => {
              handleMovePinned(rule, 1);
            },
          });
        }
      }
    }

    menuItems.push({
      id: "copy_pattern",
      label: t("exc_rules_header_pattern", "Matched Log Signature"),
      icon: t("icon_content_copy", "content_copy"),
      badge: t("ctx_copy", "Copy"),
      dividerBefore: canEdit,
      onClick: () => {
        navigator.clipboard?.writeText(rule.pattern || "");
        useStore.getState().pushStatus(t("copied", "Copied"), "info");
      },
    });
    if (rule.resolution) {
      menuItems.push({
        id: "copy_resolution",
        label: t("exc_rules_recommended_fix", "Recommended Fix / Resolution"),
        icon: t("icon_lightbulb", "lightbulb"),
        badge: t("ctx_copy", "Copy"),
        onClick: () => {
          navigator.clipboard?.writeText(rule.resolution || "");
          useStore.getState().pushStatus(t("copied", "Copied"), "info");
        },
      });
    }
    if (rule.raw_log) {
      menuItems.push({
        id: "copy_raw_log",
        label: t("lab_report_copy_btn", "Copy Log"),
        icon: t("icon_terminal", "terminal"),
        onClick: () => {
          navigator.clipboard?.writeText(formatHumanReadableLogText(rule.raw_log || ""));
          useStore.getState().pushStatus(t("copied", "Copied"), "info");
        },
      });
    }
    if (canEdit) {
      menuItems.push({
        id: "delete_rule",
        label: t("exc_rules_btn_delete", "Delete Rule"),
        icon: t("icon_delete", "delete"),
        variant: "danger",
        dividerBefore: true,
        onClick: async () => {
          const current = getExceptionRules(activeGameSchema);
          const next = current.filter((r) => r.id !== rule.id);
          await saveExceptionRulesToSpoke(next, activeGameSchema);
          useStore
            .getState()
            .pushStatus(t("exc_rules_deleted_toast", "Known Error Rule removed."), "info");
        },
      });
    }
    openSanctuaryContextMenu(e, {
      title: rule.title,
      subtitle: rule.file_hint || rule.pattern,
      statusLabel,
      statusColorClass: iconColorClass,
      icon: iconName,
      iconColorClass,
      items: menuItems,
    });
  };

  const renderRuleCard = (
    rule: SchemaExceptionRule,
    opts?: {
      reorderIndex?: number;
      reorderTotal?: number;
    }
  ) => {
    const sev = normalizeRuleSeverity(rule);
    const meta = severityMeta[sev];
    const isIgnoredInLab = sev === "unrelated" || Boolean(rule.ignore_in_lab);
    const isPinned = pinnedIds.has(rule.id);
    const canReorder =
      canEdit &&
      typeof opts?.reorderIndex === "number" &&
      typeof opts?.reorderTotal === "number" &&
      opts.reorderTotal > 1;

    return (
      <div
        key={rule.id}
        onClick={() => {
          setEditingRule(rule);
          setDefaultAsGameBug(false);
          setIsEditorOpen(true);
        }}
        onContextMenu={(e) =>
          handleOpenRuleContextMenu(
            e,
            rule,
            meta.label,
            meta.icon,
            meta.iconColorClass,
            typeof opts?.reorderIndex === "number" && typeof opts?.reorderTotal === "number"
              ? { index: opts.reorderIndex, count: opts.reorderTotal }
              : undefined
          )
        }
        className="glass-panel rounded-[var(--radius)] p-5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)] flex flex-col justify-between gap-3.5 transition-all duration-200 cursor-pointer group h-full"
      >
        <div className="flex flex-col gap-3 min-w-0 w-full">
          {/* Row 1: Semantic Icon Well on Left + Pin / Architect Sort Controls on Right */}
          <div className="flex items-center justify-between gap-2.5 w-full">
            <div
              className={`w-11 h-11 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 ${meta.iconColorClass}`}
            >
              <span className="material-symbols-outlined !text-[21px]">
                {meta.icon}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {canReorder && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={opts!.reorderIndex! <= 0}
                    onClick={(e) => handleMovePinned(rule, -1, e)}
                    className="relative group/mvprev w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[15px]">
                      {t("icon_chevron_left", "chevron_left")}
                    </span>
                    <HoverTooltip
                      className="z-[100] !right-0 !translate-x-0 !left-auto"
                      title={t("move_up", "Move Up")}
                    />
                  </button>
                  <button
                    type="button"
                    disabled={opts!.reorderIndex! >= opts!.reorderTotal! - 1}
                    onClick={(e) => handleMovePinned(rule, 1, e)}
                    className="relative group/mvnext w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[15px]">
                      {t("icon_chevron_right", "chevron_right")}
                    </span>
                    <HoverTooltip
                      className="z-[100] !right-0 !translate-x-0 !left-auto"
                      title={t("move_down", "Move Down")}
                    />
                  </button>
                </div>
              )}

              {canEdit ? (
                <button
                  type="button"
                  onClick={(e) => handleTogglePin(rule, e)}
                  className={`${VAULT_CHIP_CLASS} cursor-pointer transition-colors ${
                    isPinned
                      ? "!border-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
                      : "opacity-75 hover:opacity-100 hover:!border-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
                  }`}
                >
                  <span
                    className={`material-symbols-outlined !text-[12px] shrink-0 ${
                      isPinned ? "text-[var(--accent)]" : "text-[var(--subtext)]"
                    }`}
                  >
                    {t("icon_push_pin", "push_pin")}
                  </span>
                  <span>
                    {isPinned ? t("pinned", "Pinned") : t("pin_item", "Pin")}
                  </span>
                </button>
              ) : isPinned ? (
                <span className={VAULT_CHIP_CLASS}>
                  <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--accent)]">
                    {t("icon_push_pin", "push_pin")}
                  </span>
                  <span>{t("pinned", "Pinned")}</span>
                </span>
              ) : (
                <span className={VAULT_CHIP_CLASS}>
                  <span className={`material-symbols-outlined !text-[12px] shrink-0 ${meta.iconColorClass}`}>
                    {meta.icon}
                  </span>
                  <span>{meta.label}</span>
                </span>
              )}
            </div>
          </div>

          {/* Row 2: Full Unclipped Title + Log Source & Signature */}
          <div className="flex flex-col gap-1 min-w-0 w-full">
            <h3 className="text-[15px] font-black text-[var(--text)] tracking-tight leading-snug break-words m-0 group-hover:text-[var(--accent)] transition-colors">
              {rule.title}
            </h3>

            <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-semibold text-[var(--subtext)] min-w-0 leading-relaxed">
              {rule.file_hint && (
                <>
                  <code className="font-mono text-[10.5px] opacity-85 break-all">
                    {rule.file_hint}
                  </code>
                  <span className="opacity-40">&bull;</span>
                </>
              )}
              <code className="font-mono text-[10px] opacity-75 break-all line-clamp-2">
                {rule.pattern}
              </code>
            </div>
          </div>

          {/* Row 3: Diagnosis Summary */}
          {rule.diagnosis && (
            <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed line-clamp-3 m-0 opacity-85">
              {rule.diagnosis}
            </p>
          )}
        </div>

        {/* Row 4: Frosted Status Chips on Left | View / Edit Action on Right */}
        <div className="pt-3 mt-auto border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span className={VAULT_CHIP_CLASS}>
              <span
                className={`material-symbols-outlined !text-[12px] shrink-0 ${
                  isIgnoredInLab ? "text-[var(--success)]" : "text-[var(--warning)]"
                }`}
              >
                {isIgnoredInLab
                  ? t("icon_verified", "verified")
                  : t("icon_science", "science")}
              </span>
              <span>
                {isIgnoredInLab
                  ? t("exc_rules_badge_no_autofail", "Ignored in {Lab}")
                  : t("exc_rules_lab_fails_test", "Fails {Lab} Test")}
              </span>
            </span>

            {rule.resolution && (
              <span className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--accent)]">
                  {t("icon_lightbulb", "lightbulb")}
                </span>
                <span>{t("exc_rules_has_fix_badge", "Fix Steps")}</span>
              </span>
            )}
          </div>

          <span className="h-7 px-2.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] group-hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] group-hover:text-[var(--accent)] flex items-center gap-1 transition-all shrink-0 ml-auto">
            <span>{canEdit ? t("edit", "Edit") : t("btn_view", "View")}</span>
            <span className="material-symbols-outlined !text-[13px]">
              {canEdit
                ? t("icon_edit", "edit")
                : t("icon_arrow_forward", "arrow_forward")}
            </span>
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-8 w-full pb-16">
      {canEdit && !hideTopBarButton && (
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setEditingRule(null);
              setDefaultAsGameBug(true);
              setIsEditorOpen(true);
            }}
            className="px-3 py-1.5 rounded-xl text-[10px] font-black tracking-wider uppercase glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[var(--text)] transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span className="material-symbols-outlined !text-[14px] text-[var(--success)]">
              {t("icon_bug_report", "bug_report")}
            </span>
            <span>{t("exc_rules_btn_add_game_bug", "Add Normal Game Bug")}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingRule(null);
              setDefaultAsGameBug(false);
              setIsEditorOpen(true);
            }}
            className="px-3 py-1.5 rounded-xl text-[10px] font-black tracking-wider uppercase glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[var(--text)] transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
              {t("icon_add", "add")}
            </span>
            <span>{t("exc_rules_btn_add_rule", "Add Known Error Rule")}</span>
          </button>
        </div>
      )}

      {effectiveRules.length === 0 ? (
        <EmptyState
          icon={t("icon_psychology", "psychology")}
          title={t("exc_rules_empty_title", "No Known Error Rules Configured")}
          subtitle={t(
            "exc_rules_empty_desc",
            "Add rules for common exception log patterns so citizens and creators see plain-language community diagnoses instead of raw stack traces."
          )}
        />
      ) : isMainPageFilteredOrSearching ? (
        /* LIVE MAIN-PAGE SEARCH & FILTER RESULTS (PULLS FROM FULL CATALOG, NOT JUST PINNED) */
        <div className="flex flex-col gap-5 w-full">
          <CommandScreenSectionHeading
            icon={t("icon_manage_search", "manage_search")}
            iconColorClass="text-[var(--accent)]"
            title={
              searchQuery.trim()
                ? t("search_results", "Search Results")
                : activeFilter !== "all"
                  ? severityMeta[activeFilter].label
                  : t("exc_rules_user_tab_title", "Known Errors")
            }
            subtitle={t(
              "exc_rules_search_all_sub",
              "Searching across all community Known Error rules (pinned and unpinned)"
            )}
            actions={
              <PanelHeaderGroup>
                <PanelHeaderButton
                  icon={t("icon_apps", "apps")}
                  label={`${t("view_all", "View All")} (${effectiveRules.length})`}
                  onClick={() => openDirectoryDrawer("all")}
                />
                <PanelHeaderButton
                  icon={t("icon_close", "close")}
                  label={t("clear", "Clear")}
                  onClick={() => {
                    if (onClearSearch) {
                      onClearSearch();
                    } else {
                      handleSelectSeverity("all");
                    }
                  }}
                />
              </PanelHeaderGroup>
            }
          />

          {filteredAndSorted.length === 0 ? (
            <EmptyState
              icon={t("icon_search_off", "search_off")}
              title={t("no_matches", "No matches found")}
              subtitle={t(
                "exc_rules_empty_desc",
                "Add rules for common exception log patterns so citizens and creators see plain-language community diagnoses instead of raw stack traces."
              )}
            />
          ) : (
            <>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6 w-full">
                {pagedRules.map((rule) => renderRuleCard(rule))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-2 select-none">
                  <button
                    type="button"
                    disabled={safePage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[16px]">
                      {t("icon_chevron_left", "chevron_left")}
                    </span>
                    <span>{t("prev", "Prev")}</span>
                  </button>

                  <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-xs font-black text-[var(--subtext)] font-mono">
                    <span className="text-[var(--accent)]">{safePage}</span>
                    <span className="opacity-40">/</span>
                    <span>{totalPages}</span>
                  </div>

                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
                  >
                    <span>{t("next", "Next")}</span>
                    <span className="material-symbols-outlined !text-[16px]">
                      {t("icon_chevron_right", "chevron_right")}
                    </span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        /* DONATIONS-STYLE 3-SECTION SHOWCASE: INFO CARD + PINNED ISSUES + VIEW MORE SIDEPANEL */
        <div className="flex flex-col gap-14 w-full">
          {ORDERED_SEVERITY_TIERS.map((tier) => {
            const meta = severityMeta[tier];
            const tierAll = overviewSections.allByTier[tier];
            const tierPinned = overviewSections.pinnedByTier[tier];

            return (
              <div key={tier} className="flex flex-col gap-5 w-full relative">
                <CommandScreenSectionHeading
                  icon={meta.icon}
                  iconColorClass={meta.iconColorClass}
                  title={meta.label}
                />

                <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6 w-full relative z-10">
                  {/* FIRST CARD: TIER INFO CARD + VIEW ALL BUTTON */}
                  <KnownErrorSectionInfoCard
                    icon={meta.icon}
                    accentVar={meta.accentVar}
                    iconColorClass={meta.iconColorClass}
                    badgeLabel={`${tierAll.length} • ${tierPinned.length} ${t("pinned", "Pinned")}`}
                    overline={meta.overline}
                    title={meta.label}
                    description={meta.subtitle}
                    actionIcon={t("icon_apps", "apps")}
                    actionLabel={`${t("view_all", "View All")} (${tierAll.length})`}
                    onAction={() => openDirectoryDrawer(tier)}
                  />

                  {/* PINNED ISSUES (CURATED & SORTED BY COMMUNITY ARCHITECTS) */}
                  {tierPinned.map((rule, idx) =>
                    renderRuleCard(rule, {
                      reorderIndex: idx,
                      reorderTotal: tierPinned.length,
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* FULL KNOWN ERRORS DIRECTORY SIDEPANEL (FILTER TILES + SORT + SEARCH) */}
      <SidePanel
        isOpen={isDirectoryOpen}
        onClose={() => setIsDirectoryOpen(false)}
        title={t("exc_rules_directory_title", "All Community Known Errors")}
        subtitle={t(
          "exc_rules_section_subtitle",
          "Matched against community-maintained exception log rules for this game"
        )}
        icon={t("icon_rule_settings", "rule_settings")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[92vw] md:w-[920px] xl:w-[1040px]"
        backdropZ="z-[39990]"
        panelZ="z-[39991]"
        headerActions={
          canEdit ? (
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon={t("icon_bug_report", "bug_report")}
                variant="success"
                tooltip={t("exc_rules_btn_add_game_bug", "Add Normal Game Bug")}
                onClick={() => {
                  setEditingRule(null);
                  setDefaultAsGameBug(true);
                  setIsEditorOpen(true);
                }}
              />
              <PanelHeaderButton
                icon={t("icon_add", "add")}
                variant="accent"
                tooltip={t("exc_rules_btn_add_rule", "Add Known Error Rule")}
                onClick={() => {
                  setEditingRule(null);
                  setDefaultAsGameBug(false);
                  setIsEditorOpen(true);
                }}
              />
            </PanelHeaderGroup>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-5 mt-2 w-full pb-8">
          {/* 4-TILE SEVERITY FILTER GRID (ALLOWED INSIDE SIDEPANEL) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full">
            <DashboardStatTile
              variant="filter"
              icon={t("icon_apps", "apps")}
              label={t("filter_all", "All")}
              number={directoryCounts.total}
              isActive={directorySeverity === "all"}
              onClick={() => setDirectorySeverity("all")}
            />
            <DashboardStatTile
              variant="filter"
              icon={t("icon_gpp_maybe", "gpp_maybe")}
              label={t("status_corrupted", "Corrupted")}
              number={directoryCounts.corrupted}
              isActive={directorySeverity === "corrupted"}
              onClick={() => setDirectorySeverity("corrupted")}
            />
            <DashboardStatTile
              variant="filter"
              icon={t("icon_warning", "warning")}
              label={t("label_unstable", "Unstable")}
              number={directoryCounts.unstable}
              isActive={directorySeverity === "unstable"}
              onClick={() => setDirectorySeverity("unstable")}
            />
            <DashboardStatTile
              variant="filter"
              icon={t("icon_bug_report", "bug_report")}
              label={t("exc_rules_filter_unrelated", "Unrelated")}
              number={directoryCounts.unrelated}
              isActive={directorySeverity === "unrelated"}
              onClick={() => setDirectorySeverity("unrelated")}
            />
          </div>

          {/* SEARCH + SORT + LAB BEHAVIOR CONTROLS */}
          <div className="glass-panel rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
            <div className="lg:col-span-6 flex flex-col gap-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                {t("search", "Search")}
              </label>
              <div className="relative flex items-center w-full">
                <span className="material-symbols-outlined !text-[17px] text-[var(--subtext)] absolute left-3.5 pointer-events-none">
                  {t("icon_search", "search")}
                </span>
                <input
                  type="text"
                  value={directorySearch}
                  onChange={(e) => setDirectorySearch(e.target.value)}
                  placeholder={
                    t(
                      "exc_rules_search_short_ph",
                      "Search errors or paste log..."
                    ) as string
                  }
                  className="w-full h-10 pl-10 pr-9 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[var(--accent)] text-xs font-bold text-[var(--text)] focus:outline-none transition-colors"
                />
                {directorySearch && (
                  <button
                    type="button"
                    onClick={() => setDirectorySearch("")}
                    className="absolute right-2.5 w-6 h-6 rounded-lg hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] flex items-center justify-center cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[14px]">
                      {t("icon_close", "close")}
                    </span>
                  </button>
                )}
              </div>
            </div>

            <div className="lg:col-span-3 flex flex-col gap-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                {t("sort_by", "Sort By")}
              </label>
              <CustomDropdown
                disableTint={true}
                value={directorySort}
                onChange={(vals: any) => {
                  const v = Array.isArray(vals) ? vals[0] : vals;
                  setDirectorySort((v || "pinned") as KnownErrorSortField);
                }}
                options={[
                  { id: "pinned", label: t("pinned", "Pinned") },
                  { id: "severity", label: t("label_severity", "Severity") },
                  { id: "title", label: t("exc_rules_field_title_label", "Error Title") },
                  { id: "source", label: t("exc_rules_col_log_source", "Log File Source") },
                ]}
              />
            </div>

            <div className="lg:col-span-3 flex flex-col gap-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                {t("exc_rules_col_lab_behavior", "Lab Test Behavior")}
              </label>
              <CustomDropdown
                disableTint={true}
                value={directoryLabBehavior}
                onChange={(vals: any) => {
                  const v = Array.isArray(vals) ? vals[0] : vals;
                  setDirectoryLabBehavior((v || "all") as "all" | "fails" | "ignored");
                }}
                options={[
                  { id: "all", label: t("filter_all", "All") },
                  { id: "fails", label: t("exc_rules_lab_fails_test", "Fails {Lab} Test") },
                  { id: "ignored", label: t("exc_rules_badge_no_autofail", "Ignored in {Lab}") },
                ]}
              />
            </div>
          </div>

          {/* DIRECTORY RESULTS GRID */}
          {pagedDirectoryRules.length === 0 ? (
            <EmptyState
              icon={t("icon_search_off", "search_off")}
              title={t("no_matches", "No matches found")}
            />
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                {pagedDirectoryRules.map((rule) => renderRuleCard(rule))}
              </div>

              {directoryTotalPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-2 select-none">
                  <button
                    type="button"
                    disabled={safeDirectoryPage === 1}
                    onClick={() => setDirectoryPage((p) => Math.max(1, p - 1))}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[16px]">
                      {t("icon_chevron_left", "chevron_left")}
                    </span>
                    <span>{t("prev", "Prev")}</span>
                  </button>

                  <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-xs font-black text-[var(--subtext)] font-mono">
                    <span className="text-[var(--accent)]">{safeDirectoryPage}</span>
                    <span className="opacity-40">/</span>
                    <span>{directoryTotalPages}</span>
                  </div>

                  <button
                    type="button"
                    disabled={safeDirectoryPage >= directoryTotalPages}
                    onClick={() =>
                      setDirectoryPage((p) => Math.min(directoryTotalPages, p + 1))
                    }
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
                  >
                    <span>{t("next", "Next")}</span>
                    <span className="material-symbols-outlined !text-[16px]">
                      {t("icon_chevron_right", "chevron_right")}
                    </span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </SidePanel>

      <KnownErrorRuleEditorSidePanel
        isOpen={isEditorOpen}
        onClose={() => {
          setIsEditorOpen(false);
          setEditingRule(null);
          setDefaultAsGameBug(false);
        }}
        initialRule={editingRule}
        readOnly={!canEdit}
        defaultAsGameBug={defaultAsGameBug}
      />
    </div>
  );
}



