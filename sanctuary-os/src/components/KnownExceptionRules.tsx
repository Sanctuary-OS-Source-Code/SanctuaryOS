import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { supabase } from "../supabase";
import { isDesktop } from "../utils/envUtils";
import {
  SidePanel,
  CustomDropdown,
  PanelHeaderGroup,
  PanelHeaderButton,
} from "../shared";
import { SidePanelHeroCard, SidePanelTitleInput } from "./layouts/ElevatedHubLayout";
import { UniversalCard } from "./universal/UniversalCard";
import {
  UniversalGroup,
  UniversalInput,
  UniversalTextArea,
  UniversalToggle,
  StatBox,
} from "./universal/UniversalLayout";
import { scrubLogUserData, formatHumanReadableLogText } from "../utils/logScrubber";

const VAULT_CHIP_CLASS =
  "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

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

export const DEFAULT_SIMS4_EXCEPTION_RULES: SchemaExceptionRule[] = [
  {
    id: "ts4_store_utils_wallet_ui",
    title: "StoreUtils / VirtualCurrencyWallet UI Desync (Error #1006)",
    pattern: "StoreUtils/StoreDisabledByFeatureParameter | VirtualCurrencyWallet | TryGetValueAsBoolean",
    file_hint: "lastUIException.txt",
    raw_log: `<?xml version="1.0" ?><root>
<report><version>2</version><sessionid>000000000000000000000000</sessionid><type>desync</type><sku>ea.maxis.sims4_64.15.pc</sku><createtime>2026-10-17 23:47:58</createtime><buildsignature>Local.Unknown.Unknown.1.128.90.1030-1.200.000.718.Release</buildsignature><categoryid>(AS)widgets.shared.utils::StoreUtils</categoryid><desyncid>000000000000000000000000</desyncid><systemconfig/><screenshot/><desyncdata>TypeError: Error #1006: TryGetValueAsBoolean is not a function.
	at widgets.shared.utils::StoreUtils/StoreDisabledByFeatureParameter()
	at widgets.Engagement.controls::VirtualCurrencyWallet/UpdateConnectivityStatus()
	at olympus.controls::GUIComponent/ConfigUI()
	at olympus.controls::GUIComponent/OnAddedToStage()
	at olympus.core::LayoutManager/LoadWidgetCompleteHandler()
</desyncdata></report>
</root>`,
    severity: "unstable",
    diagnosis:
      "ActionScript UI exception in widgets.shared.utils::StoreUtils / VirtualCurrencyWallet. Triggered when an outdated UI overhaul mod conflicts with current game patch UI widgets or when EA Store feature parameters fail to initialize.",
    resolution:
      "If UI panels are broken in live mode, update UI Cheats Extension (.package + .ts4script), Better BuildBuy / T.O.O.L., or More Columns in CAS for your current game patch. If this occurred on the Main Menu with no UI issues, you can change its Issue Classification to Unrelated.",
    ignore_in_lab: false,
    enabled: true,
  },
  {
    id: "ts4_vanilla_milestone_tracker",
    title: "Vanilla Milestone / Infant Tracker Desync (Base Game Bug)",
    pattern: "developmental_milestone_tracker | milestone_tracker",
    file_hint: "lastException.txt",
    raw_log: `<report><version>2</version><type>desync</type><categoryid>developmental_milestones.developmental_milestone_tracker.py:1109</categoryid><desyncdata>Exception in Sim Timeline: Exception running Element (AttributeError: 'NoneType' object has no attribute 'add_developmental_milestone')
  File "T:\\InGame\\Gameplay\\Scripts\\Server\\developmental_milestones\\developmental_milestone_tracker.py", line 1109, in load_milestones_info_from_proto
</desyncdata></report>`,
    severity: "unrelated",
    diagnosis:
      "Normal EA Base Game bug in developmental_milestone_tracker when switching households or loading lots with infants/toddlers whose milestone state became desynchronized in an unmodded save.",
    resolution:
      "Not caused by a custom mod. Marked as Unrelated (Normal Game Bug) so it will not auto-fail Lab Proving Runs.",
    ignore_in_lab: true,
    enabled: true,
  },
  {
    id: "ts4_python_attr_or_import",
    title: "Python Script Tuning Mismatch or Missing Core Library",
    pattern: "AttributeError | ModuleNotFoundError | ImportError",
    file_hint: "lastException.txt",
    raw_log: `<report><version>2</version><type>desync</type><categoryid>sims4.tuning.instance_manager.py:567</categoryid><desyncdata>Failure: 'custom_mod_script' (ModuleNotFoundError: No module named 'lot51_core')
  File "T:\\InGame\\Gameplay\\Scripts\\Core\\sims4\\importer\\custom_import.py", line 196, in load_module
</desyncdata></report>`,
    severity: "corrupted",
    diagnosis:
      "A Python script (.ts4script) attempted to call a game engine attribute or import a module that changed in a recent game patch or requires an external core library (such as Lot51 Core Library, XML Injector, or S4CL).",
    resolution:
      "Verify that all required dependency libraries are installed in your Mods folder and that the mod's .ts4script is updated for your current game patch.",
    ignore_in_lab: false,
    enabled: true,
  },
  {
    id: "ts4_posture_routing_graph",
    title: "Posture Graph / Sim Routing Autonomy Exception",
    pattern: "posture_graph | routing_service | PostureGraphService",
    file_hint: "lastException.txt",
    raw_log: `<report><version>2</version><type>desync</type><categoryid>postures.posture_graph.py:4912</categoryid><desyncdata>Exception in Sim Timeline: Exception running Element (RuntimeError: Posture graph failed to find validsegmented path)
  File "T:\\InGame\\Gameplay\\Scripts\\Server\\postures\\posture_graph.py", line 4912, in get_segmented_paths
</desyncdata></report>`,
    severity: "unstable",
    diagnosis:
      "A Sim attempted to route to or interact with an object whose footprint, slot, or posture tuning failed validation during live autonomy, causing Sim resets or random interaction bugs.",
    resolution:
      "Check custom furniture/object overrides on the active lot or custom interaction mods that modify Sim posture tuning.",
    ignore_in_lab: false,
    enabled: true,
  },
];

function upgradeLegacyDefaultRules(rules: SchemaExceptionRule[]): SchemaExceptionRule[] {
  const defaultById = new Map(DEFAULT_SIMS4_EXCEPTION_RULES.map((d) => [d.id, d]));
  let needsStoreUtilsMigration = false;
  try {
    if (!localStorage.getItem("sanctuary_exc_rules_storeutils_fixed_v1")) {
      needsStoreUtilsMigration = true;
      localStorage.setItem("sanctuary_exc_rules_storeutils_fixed_v1", "1");
    }
  } catch {}

  let updated: SchemaExceptionRule[] = rules.map((r) => {
    const def = defaultById.get(r.id);
    let effectiveRule = r;
    if (needsStoreUtilsMigration && r.id === "ts4_store_utils_wallet_ui") {
      effectiveRule = {
        ...r,
        severity: "unstable",
        ignore_in_lab: false,
      };
    }
    const normSev = normalizeRuleSeverity(effectiveRule);
    return {
      ...effectiveRule,
      raw_log: effectiveRule.raw_log || def?.raw_log || "",
      severity: normSev,
      ignore_in_lab: normSev === "unrelated",
    };
  });

  if (needsStoreUtilsMigration) {
    try {
      for (const key of ["sanctuary_exception_rules_ts4", "sanctuary_exception_rules_sims4", "sanctuary_exception_rules_default_schema"]) {
        if (localStorage.getItem(key)) {
          localStorage.setItem(key, JSON.stringify(updated));
        }
      }
    } catch {}
  }

  if (!updated.some((r) => r.id === "ts4_vanilla_milestone_tracker")) {
    const vanillaRule = DEFAULT_SIMS4_EXCEPTION_RULES.find(
      (d) => d.id === "ts4_vanilla_milestone_tracker"
    );
    if (vanillaRule) {
      updated = [
        updated[0] || vanillaRule,
        vanillaRule,
        ...updated.slice(1),
      ];
    }
  }
  return updated;
}

export function getExceptionRules(activeGameSchema?: any): SchemaExceptionRule[] {
  if (Array.isArray(activeGameSchema) && activeGameSchema.length > 0) {
    return upgradeLegacyDefaultRules(activeGameSchema);
  }
  const schema =
    activeGameSchema && !Array.isArray(activeGameSchema)
      ? activeGameSchema
      : useStore.getState().activeGameSchema;
  const schemaId = schema?.id || schema?.game_id || "default_schema";

  if (Array.isArray(schema?.exception_rules) && schema.exception_rules.length > 0) {
    return upgradeLegacyDefaultRules(schema.exception_rules);
  }

  try {
    const cached = localStorage.getItem(`sanctuary_exception_rules_${schemaId}`);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return upgradeLegacyDefaultRules(parsed);
      }
    }
  } catch (e) {}

  return DEFAULT_SIMS4_EXCEPTION_RULES;
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

export function extractSuggestedPatternFromLog(logText?: string | null): {
  pattern: string;
  title: string;
  fileHint: string;
} {
  if (!logText) {
    return { pattern: "", title: "", fileHint: "lastException.txt" };
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

  if (catMatch && catMatch[1]) {
    const cleanCat = catMatch[1].replace(/^\(AS\)/i, "").trim();
    return {
      pattern: cleanCat,
      title: firstErrorLine
        ? `${cleanCat.split("::").pop() || cleanCat} (${firstErrorLine.slice(0, 48)})`
        : cleanCat,
      fileHint: isUiException ? "lastUIException.txt" : "lastException.txt",
    };
  }

  if (firstErrorLine) {
    return {
      pattern: firstErrorLine.slice(0, 80),
      title: firstErrorLine.slice(0, 60),
      fileHint: isUiException ? "lastUIException.txt" : "lastException.txt",
    };
  }

  return {
    pattern: "",
    title: "",
    fileHint: isUiException ? "lastUIException.txt" : "lastException.txt",
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
  } catch (e) {}

  store.setActiveGameSchema(updatedSchema);

  if (isDesktop()) {
    try {
      await invoke("update_active_game_schema", { schema: updatedSchema });
    } catch (e) {}
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
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">
              {t("icon_psychology", "psychology")}
            </span>
            <div className="flex flex-col">
              <span className="text-xs font-black tracking-wider uppercase text-[var(--text)]">
                {t("exc_rules_section_title", "Community Known Error Diagnosis")}
              </span>
              <span className="text-[10px] font-bold text-[var(--subtext)] opacity-80">
                {t(
                  "exc_rules_section_subtitle",
                  "Matched against community-maintained exception log rules for this game"
                )}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => handleOpenCreateFromLog(true)}
              className="px-3 py-1.5 rounded-xl text-[10px] font-black tracking-wider uppercase glass-surface border border-[color-mix(in_srgb,var(--success)_40%,transparent)] bg-transparent text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_12%,transparent)] transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[14px]">
                {t("icon_bug_report", "bug_report")}
              </span>
              {t("exc_rules_btn_add_game_bug", "Add Normal Game Bug")}
            </button>
            <button
              type="button"
              onClick={() => handleOpenCreateFromLog(false)}
              className="px-3 py-1.5 rounded-xl text-[10px] font-black tracking-wider uppercase glass-surface border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-transparent text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[14px]">
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
            const borderClass = isCrit
              ? "border-[color-mix(in_srgb,var(--danger)_35%,transparent)]"
              : isBenign
              ? "border-[color-mix(in_srgb,var(--success)_35%,transparent)]"
              : "border-[color-mix(in_srgb,var(--warning)_35%,transparent)]";

            const badgeColor = isCrit
              ? "text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_45%,transparent)] bg-transparent"
              : isBenign
              ? "text-[var(--success)] border-[color-mix(in_srgb,var(--success)_45%,transparent)] bg-transparent"
              : "text-[var(--warning)] border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-transparent";

            return (
              <div
                key={rule.id}
                className={`rounded-2xl p-4 glass-panel border ${borderClass} flex flex-col gap-3.5 shadow-md`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-2.5 py-0.5 rounded-lg text-[9px] font-black tracking-widest uppercase border flex items-center gap-1 ${badgeColor}`}
                      >
                        <span className="material-symbols-outlined !text-[11px]">
                          {isCrit
                            ? t("icon_gpp_maybe", "gpp_maybe")
                            : isBenign
                            ? t("icon_bug_report", "bug_report")
                            : t("icon_warning", "warning")}
                        </span>
                        {isCrit
                          ? t("exc_rules_badge_corrupted", "CORRUPTED • GAME CRASH")
                          : isBenign
                          ? t("exc_rules_badge_unrelated", "UNRELATED • NORMAL GAME BUG")
                          : t("exc_rules_badge_unstable", "UNSTABLE • UI / RANDOM BUGS")}
                      </span>
                      {isBenign && (
                        <span className="px-2 py-0.5 rounded-lg text-[9px] font-black tracking-widest uppercase text-[var(--success)] border border-[color-mix(in_srgb,var(--success)_45%,transparent)] bg-transparent flex items-center gap-1">
                          <span className="material-symbols-outlined !text-[11px]">
                            {t("icon_verified", "verified")}
                          </span>
                          {t("exc_rules_badge_no_autofail", "WON'T FAIL TEST")}
                        </span>
                      )}
                      {rule.file_hint && (
                        <span className="px-2 py-0.5 rounded-lg text-[9px] font-mono text-[var(--subtext)] bg-transparent border border-[rgba(var(--text-rgb),0.12)]">
                          {rule.file_hint}
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-black text-[var(--text)] leading-snug">
                      {rule.title}
                    </span>
                  </div>

                  {effectiveAllowEdit && (
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(rule)}
                      className="px-2.5 py-1 rounded-lg text-[9px] font-black tracking-widest uppercase bg-transparent border border-[rgba(var(--text-rgb),0.15)] text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] transition-all flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <span className="material-symbols-outlined !text-[13px]">
                        {t("icon_edit", "edit")}
                      </span>
                      {t("exc_rules_btn_edit_rule", "Edit Rule")}
                    </button>
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

  const [rule, setRule] = useState<SchemaExceptionRule>({
    id: "",
    title: "",
    pattern: "",
    file_hint: "lastException.txt",
    raw_log: "",
    severity: "unstable",
    diagnosis: "",
    resolution: "",
    ignore_in_lab: false,
    enabled: true,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [copiedRawLog, setCopiedRawLog] = useState(false);

  useEffect(() => {
    if (initialRule) {
      const normSev = normalizeRuleSeverity(initialRule);
      const def = DEFAULT_SIMS4_EXCEPTION_RULES.find((d) => d.id === initialRule.id);
      const rawLogText = initialRule.raw_log || def?.raw_log || "";
      setRule({
        ...initialRule,
        raw_log: rawLogText ? formatHumanReadableLogText(rawLogText) : "",
        severity: normSev,
        ignore_in_lab: normSev === "unrelated" ? true : !!initialRule.ignore_in_lab,
      });
    } else {
      setRule({
        id: `rule_${Date.now()}`,
        title: "",
        pattern: "",
        file_hint: "lastException.txt",
        raw_log: "",
        severity: defaultAsGameBug ? "unrelated" : "unstable",
        diagnosis: "",
        resolution: "",
        ignore_in_lab: defaultAsGameBug ? true : false,
        enabled: true,
      });
    }
  }, [initialRule, isOpen, defaultAsGameBug]);

  if (!isOpen) return null;

  const existingRules = getExceptionRules(activeGameSchema);
  const isExisting = existingRules.some((r) => r.id === rule.id);

  const handleExtractFromRawLog = () => {
    const raw = scrubLogUserData((rule.raw_log || "").trim());
    if (!raw) return;
    const suggested = extractSuggestedPatternFromLog(raw);
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
      const finalizedRule: SchemaExceptionRule = {
        ...rule,
        raw_log: rule.raw_log ? scrubLogUserData(rule.raw_log) : "",
        severity: normSev,
        ignore_in_lab: normSev === "unrelated" ? true : !!rule.ignore_in_lab,
      };
      const current = getExceptionRules(activeGameSchema);
      const idx = current.findIndex((r) => r.id === finalizedRule.id);
      let next: SchemaExceptionRule[];
      if (idx >= 0) {
        next = [...current];
        next[idx] = finalizedRule;
      } else {
        next = [finalizedRule, ...current];
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
          label={rule.file_hint || "lastException.txt"}
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
                  ? t("exc_rules_badge_no_autofail", "Won't Fail Test")
                  : t("exc_rules_lab_fails_test", "Fails Lab Test"),
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
                value={rule.file_hint || "lastException.txt"}
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
                    ? t("exc_rules_badge_no_autofail", "Won't Fail Test")
                    : t("exc_rules_lab_fails_test", "Fails Lab Test")
                }
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col justify-between gap-2">
                <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest flex items-center gap-1.5 truncate">
                  <span className="material-symbols-outlined !text-[13px] text-[var(--accent)] shrink-0">
                    {sevIcon}
                  </span>
                  <span className="truncate">
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
                <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest flex items-center gap-1.5 truncate">
                  <span className="material-symbols-outlined !text-[13px] text-[var(--accent)] shrink-0">
                    {t("icon_description", "description")}
                  </span>
                  <span className="truncate">
                    {t("exc_rules_col_log_source", "Log File Source")}
                  </span>
                </label>
                <input
                  value={rule.file_hint || ""}
                  onChange={(e) => setRule((prev) => ({ ...prev, file_hint: e.target.value }))}
                  placeholder={
                    t(
                      "exc_rules_field_file_hint_ph",
                      "lastUIException.txt or lastException.txt"
                    ) as string
                  }
                  className="w-full h-10 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col justify-between gap-2">
                <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest flex items-center gap-1.5 truncate">
                  <span className="material-symbols-outlined !text-[13px] text-[var(--accent)] shrink-0">
                    {t("icon_science", "science")}
                  </span>
                  <span className="truncate">
                    {t("exc_rules_col_lab_behavior", "Lab Test Behavior")}
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() =>
                    !isBenign &&
                    setRule((prev) => ({ ...prev, ignore_in_lab: !prev.ignore_in_lab }))
                  }
                  className={`w-full h-10 rounded-xl px-3.5 border bg-transparent flex items-center justify-between text-xs font-black transition-all cursor-pointer ${
                    isBenign || rule.ignore_in_lab
                      ? "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]"
                      : "border-[color-mix(in_srgb,var(--warning)_45%,transparent)] text-[var(--warning)]"
                  }`}
                >
                  <span className="truncate">
                    {isBenign || rule.ignore_in_lab
                      ? t("exc_rules_badge_no_autofail", "Won't Fail Test")
                      : t("exc_rules_lab_fails_test", "Fails Lab Test")}
                  </span>
                  <span className="material-symbols-outlined !text-[16px] shrink-0">
                    {isBenign || rule.ignore_in_lab
                      ? t("icon_verified", "verified")
                      : t("icon_warning", "warning")}
                  </span>
                </button>
              </div>
            </div>
          )}
        </SidePanelHeroCard>

        <SidePanelTitleInput
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
              <button
                type="button"
                onClick={handleExtractFromRawLog}
                className="px-2.5 py-1 rounded-lg text-[9px] font-black tracking-widest uppercase border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-transparent text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] transition-all flex items-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[12px]">
                  {t("icon_auto_fix", "auto_fix_high")}
                </span>
                {t("exc_rules_btn_extract_pattern", "Auto-Extract Signature from Log")}
              </button>
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

              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-transparent border border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)] flex items-center gap-1">
                  <span className="material-symbols-outlined !text-[12px]">
                    {t("icon_verified_user", "verified_user")}
                  </span>
                  {t("lab_report_pii_scrubbed_badge", "USER DATA SCRUBBED")}
                </span>

                {Boolean(rule.raw_log) && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!rule.raw_log) return;
                      navigator.clipboard?.writeText(formatHumanReadableLogText(rule.raw_log));
                      setCopiedRawLog(true);
                      setTimeout(() => setCopiedRawLog(false), 1800);
                    }}
                    className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-transparent border border-[color-mix(in_srgb,var(--text)_18%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[12px]">
                      {copiedRawLog ? t("icon_check", "check") : t("icon_content_copy", "content_copy")}
                    </span>
                    {copiedRawLog
                      ? t("copied", "Copied")
                      : t("lab_report_copy_btn", "Copy Log")}
                  </button>
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
                    "Paste a raw lastException.txt or lastUIException.txt snippet here to auto-extract its signature..."
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

export function KnownErrorRulesManager({
  searchQuery = "",
  canEdit = false,
  externalTriggerCreate = 0,
  externalTriggerCreateGameBug = 0,
  hideTopBarButton = false,
  severityFilter,
  onSeverityFilterChange,
}: {
  searchQuery?: string;
  canEdit?: boolean;
  externalTriggerCreate?: number;
  externalTriggerCreateGameBug?: number;
  hideTopBarButton?: boolean;
  severityFilter?: "all" | NormalizedRuleSeverity;
  onSeverityFilterChange?: (val: "all" | NormalizedRuleSeverity) => void;
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

  const activeFilter = severityFilter !== undefined ? severityFilter : localFilter;
  const handleFilterChange = (val: "all" | NormalizedRuleSeverity) => {
    if (onSeverityFilterChange) {
      onSeverityFilterChange(val);
    } else {
      setLocalFilter(val);
    }
  };

  useEffect(() => {
    const refresh = () => {
      const loaded = getExceptionRules(useStore.getState().activeGameSchema);
      setRules(loaded);
      if (isDesktop()) {
        const currentSchema = useStore.getState().activeGameSchema || {};
        invoke("update_active_game_schema", {
          schema: { ...currentSchema, exception_rules: loaded },
        }).catch(() => {});
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

  const counts = {
    all: rules.length,
    corrupted: rules.filter((r) => normalizeRuleSeverity(r) === "corrupted").length,
    unstable: rules.filter((r) => normalizeRuleSeverity(r) === "unstable").length,
    unrelated: rules.filter((r) => normalizeRuleSeverity(r) === "unrelated").length,
  };

  const filtered = rules.filter((r) => {
    const normSev = normalizeRuleSeverity(r);
    if (activeFilter !== "all" && normSev !== activeFilter) {
      return false;
    }
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.title.toLowerCase().includes(q) ||
      r.pattern.toLowerCase().includes(q) ||
      (r.diagnosis || "").toLowerCase().includes(q) ||
      (r.resolution || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col gap-5 w-full pb-16">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
            {t("exc_rules_section_title", "Community Known Error Diagnosis")}
          </span>
          <span className="text-[11px] font-bold text-[var(--subtext)] opacity-80">
            {t(
              "exc_rules_section_subtitle",
              "Matched against community-maintained exception log rules for this game"
            )}
          </span>
        </div>

        {canEdit && !hideTopBarButton && (
          <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setEditingRule(null);
                  setDefaultAsGameBug(true);
                  setIsEditorOpen(true);
                }}
                className="px-3.5 py-2 rounded-xl text-[10px] font-black tracking-widest uppercase border border-[color-mix(in_srgb,var(--success)_45%,transparent)] bg-transparent text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_12%,transparent)] transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[15px]">
                  {t("icon_bug_report", "bug_report")}
                </span>
                {t("exc_rules_btn_add_game_bug", "Add Normal Game Bug")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingRule(null);
                  setDefaultAsGameBug(false);
                  setIsEditorOpen(true);
                }}
                className="px-3.5 py-2 rounded-xl text-[10px] font-black tracking-widest uppercase border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-transparent text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[15px]">
                  {t("icon_add", "add")}
                </span>
                {t("exc_rules_btn_add_rule", "Add Known Error Rule")}
              </button>
            </div>
          )}
      </div>

      {filtered.length === 0 ? (
        <div className="glass-surface rounded-2xl p-10 border border-[rgba(var(--text-rgb),0.1)] flex flex-col items-center justify-center text-center gap-3">
          <span className="material-symbols-outlined !text-[42px] text-[var(--subtext)] opacity-60">
            {t("icon_psychology", "psychology")}
          </span>
          <span className="text-sm font-black uppercase tracking-wider text-[var(--text)]">
            {t("exc_rules_empty_title", "No Known Error Rules Configured")}
          </span>
          <p className="text-xs font-bold text-[var(--subtext)] max-w-lg leading-relaxed">
            {t(
              "exc_rules_empty_desc",
              "Add rules for common exception log patterns so citizens and creators see plain-language community diagnoses instead of raw stack traces."
            )}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
          {filtered.map((rule) => {
            const normSev = normalizeRuleSeverity(rule);
            const isCrit = normSev === "corrupted";
            const isBenign = normSev === "unrelated";

            const iconName = isCrit
              ? t("icon_gpp_maybe", "gpp_maybe")
              : isBenign
              ? t("icon_bug_report", "bug_report")
              : t("icon_warning", "warning");

            const iconColorClass = isCrit
              ? "text-[var(--danger)]"
              : isBenign
              ? "text-[var(--success)]"
              : "text-[var(--warning)]";

            const statusLabel = isCrit
              ? t("status_corrupted", "Corrupted")
              : isBenign
              ? t("exc_rules_filter_unrelated", "Unrelated")
              : t("label_unstable", "Unstable");

            return (
              <UniversalCard
                key={rule.id}
                onClick={() => {
                  setEditingRule(rule);
                  setDefaultAsGameBug(false);
                  setIsEditorOpen(true);
                }}
                layout="vertical"
                icon={iconName}
                imageOverlay={
                  <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
                    <div className={VAULT_CHIP_CLASS}>
                      <span className={`material-symbols-outlined !text-[12px] ${iconColorClass}`}>
                        {iconName}
                      </span>
                      <span>{statusLabel}</span>
                    </div>
                  </div>
                }
                title={rule.title}
                subtitle={rule.diagnosis || rule.pattern}
                badges={
                  <>
                    {rule.file_hint && (
                      <div className={VAULT_CHIP_CLASS}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                          {t("icon_description", "description")}
                        </span>
                        <span>{rule.file_hint}</span>
                      </div>
                    )}
                    <div className={VAULT_CHIP_CLASS}>
                      <span
                        className={`material-symbols-outlined !text-[12px] ${
                          isBenign || rule.ignore_in_lab
                            ? "text-[var(--success)]"
                            : "text-[var(--warning)]"
                        }`}
                      >
                        {isBenign || rule.ignore_in_lab
                          ? t("icon_verified", "verified")
                          : t("icon_science", "science")}
                      </span>
                      <span>
                        {isBenign || rule.ignore_in_lab
                          ? t("exc_rules_badge_no_autofail", "Won't Fail Test")
                          : t("exc_rules_lab_fails_test", "Fails Lab Test")}
                      </span>
                    </div>
                  </>
                }
                footer={
                  <div className="flex items-center justify-between w-full text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    <span className="font-mono truncate max-w-[65%] opacity-75">
                      {rule.pattern}
                    </span>
                    <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
                      {canEdit ? t("edit", "Edit") : t("btn_view", "View")} <span className="text-base leading-none">&rarr;</span>
                    </span>
                  </div>
                }
              />
            );
          })}
        </div>
      )}

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


