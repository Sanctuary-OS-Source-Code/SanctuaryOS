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
import {
  DashboardStatTile,
  StatTileCarousel,
} from "../hub-components/SharedCommandScreenLayout";
import { SidePanelTitleInput } from "./layouts/ElevatedHubLayout";
import {
  UniversalGroup,
  UniversalInput,
  UniversalTextArea,
  UniversalToggle,
} from "./universal/UniversalLayout";

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

        {effectiveAllowEdit && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => handleOpenCreateFromLog(true)}
              className="px-3 py-1.5 rounded-xl text-[10px] font-black tracking-wider uppercase glass-surface border border-[color-mix(in_srgb,var(--success)_40%,transparent)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_22%,transparent)] transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[14px]">
                {t("icon_bug_report", "bug_report")}
              </span>
              {t("exc_rules_btn_add_game_bug", "Add Normal Game Bug")}
            </button>
            <button
              type="button"
              onClick={() => handleOpenCreateFromLog(false)}
              className="px-3 py-1.5 rounded-xl text-[10px] font-black tracking-wider uppercase glass-surface border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)] transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[14px]">
                {t("icon_edit_note", "edit_note")}
              </span>
              {t("exc_rules_btn_create_from_log", "Explain / Edit Known Error Rule")}
            </button>
          </div>
        )}
      </div>

      {matchedRules.length > 0 && (
        <div className="flex flex-col gap-3">
          {matchedRules.map((rule) => {
            let normSev = normalizeRuleSeverity(rule);
            // If this rule is being rendered inside a failed report (or logText has an explicit stamp), never show a contradictory "WON'T FAIL TEST / UNRELATED" green badge
            if (normSev === "unrelated" && reportFailed) {
              normSev = "unstable";
            }
            const isCrit = normSev === "corrupted";
            const isBenign = normSev === "unrelated";
            const borderClass = isCrit
              ? "border-[color-mix(in_srgb,var(--danger)_40%,transparent)]"
              : isBenign
              ? "border-[color-mix(in_srgb,var(--success)_40%,transparent)]"
              : "border-[color-mix(in_srgb,var(--warning)_40%,transparent)]";

            const badgeColor = isCrit
              ? "text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_15%,transparent)]"
              : isBenign
              ? "text-[var(--success)] border-[color-mix(in_srgb,var(--success)_40%,transparent)] bg-[color-mix(in_srgb,var(--success)_15%,transparent)]"
              : "text-[var(--warning)] border-[color-mix(in_srgb,var(--warning)_40%,transparent)] bg-[color-mix(in_srgb,var(--warning)_15%,transparent)]";

            return (
              <div
                key={rule.id}
                className={`rounded-2xl p-4 glass-surface border ${borderClass} flex flex-col gap-3 shadow-md`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[9px] font-black tracking-widest uppercase border ${badgeColor}`}
                      >
                        {isCrit
                          ? t("exc_rules_badge_corrupted", "CORRUPTED • GAME CRASH")
                          : isBenign
                          ? t("exc_rules_badge_unrelated", "UNRELATED • NORMAL GAME BUG")
                          : t("exc_rules_badge_unstable", "UNSTABLE • UI / RANDOM BUGS")}
                      </span>
                      {isBenign && (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black tracking-widest uppercase text-[var(--success)] border border-[color-mix(in_srgb,var(--success)_35%,transparent)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] flex items-center gap-1">
                          <span className="material-symbols-outlined !text-[11px]">
                            {t("icon_verified", "verified")}
                          </span>
                          {t("exc_rules_badge_no_autofail", "WON'T FAIL TEST")}
                        </span>
                      )}
                      {rule.file_hint && (
                        <span className="px-2 py-0.5 rounded-lg text-[9px] font-mono text-[var(--subtext)] glass-surface border border-[rgba(var(--text-rgb),0.12)]">
                          {rule.file_hint}
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-black text-[var(--text)] leading-snug mt-0.5">
                      {rule.title}
                    </span>
                  </div>

                  {effectiveAllowEdit && (
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(rule)}
                      className="px-2.5 py-1 rounded-lg text-[9px] font-black tracking-widest uppercase glass-surface border border-[rgba(var(--text-rgb),0.15)] text-[var(--subtext)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-all flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <span className="material-symbols-outlined !text-[13px]">
                        {t("icon_edit", "edit")}
                      </span>
                      {t("exc_rules_btn_edit_rule", "Edit Rule")}
                    </button>
                  )}
                </div>

                {rule.diagnosis && (
                  <div className="p-3 rounded-xl glass-surface border border-[rgba(var(--text-rgb),0.1)] flex flex-col gap-1">
                    <span className="text-[9px] font-black uppercase tracking-wider text-[var(--accent)] flex items-center gap-1.5">
                      <span className="material-symbols-outlined !text-[13px]">
                        {t("icon_psychology", "psychology")}
                      </span>
                      {t("exc_rules_what_it_means", "What the Community Knows (Cause & Diagnosis)")}
                    </span>
                    <p className="text-xs font-bold text-[var(--text)] leading-relaxed">
                      {rule.diagnosis}
                    </p>
                  </div>
                )}

                {rule.resolution && (
                  <div className="p-3 rounded-xl glass-surface border border-[rgba(var(--text-rgb),0.1)] flex flex-col gap-1">
                    <span className="text-[9px] font-black uppercase tracking-wider text-[var(--success)] flex items-center gap-1.5">
                      <span className="material-symbols-outlined !text-[13px]">
                        {t("icon_lightbulb", "lightbulb")}
                      </span>
                      {t("exc_rules_recommended_fix", "Recommended Fix / Resolution")}
                    </span>
                    <p className="text-xs font-bold text-[var(--subtext)] leading-relaxed">
                      {rule.resolution}
                    </p>
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

  useEffect(() => {
    if (initialRule) {
      const normSev = normalizeRuleSeverity(initialRule);
      const def = DEFAULT_SIMS4_EXCEPTION_RULES.find((d) => d.id === initialRule.id);
      setRule({
        ...initialRule,
        raw_log: initialRule.raw_log || def?.raw_log || "",
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
    const raw = (rule.raw_log || "").trim();
    if (!raw) return;
    const suggested = extractSuggestedPatternFromLog(raw);
    setRule((prev) => ({
      ...prev,
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
      label: t(
        "exc_rules_sev_corrupted_option",
        "Corrupted (Game Crash / Fatal Mod Error)"
      ),
    },
    {
      id: "unstable",
      label: t(
        "exc_rules_sev_unstable_option",
        "Unstable (UI Issues / Works with Random Bugs)"
      ),
    },
    {
      id: "unrelated",
      label: t(
        "exc_rules_sev_unrelated_option",
        "Unrelated (Normal Game Bug — Not Caused by Mod)"
      ),
    },
  ];

  const normSev = normalizeRuleSeverity(rule);
  const isCrit = normSev === "corrupted";
  const isBenign = normSev === "unrelated";

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
          : t(
              "exc_rules_editor_subtitle",
              "Define how Sanctuary OS explains or filters known game & mod exceptions for this community"
            )
      }
      icon={readOnly ? t("icon_psychology", "psychology") : t("icon_rule", "rule")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[92vw] md:w-[680px]"
      headerActions={
        !readOnly ? (
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_saves", "save")}
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
      <div className="flex flex-col gap-8 pb-24">
        <SidePanelTitleInput
          value={rule.title}
          onChange={
            readOnly
              ? undefined
              : (v: string) => setRule((prev) => ({ ...prev, title: v }))
          }
          readOnly={readOnly}
          placeholder={t(
            "exc_rules_field_title_ph",
            "e.g. StoreUtils / VirtualCurrencyWallet UI Desync"
          )}
          subtitle={t("exc_rules_field_title", "Rule Name / Issue Title")}
        />

        {readOnly ? (
          <>
            <UniversalGroup
              title={t("exc_rules_matched_pattern", "Matched Log Signature")}
              icon={t("icon_rule", "rule")}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase border ${
                    isCrit
                      ? "text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]"
                      : isBenign
                      ? "text-[var(--success)] border-[color-mix(in_srgb,var(--success)_35%,transparent)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)]"
                      : "text-[var(--warning)] border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_12%,transparent)]"
                  }`}
                >
                  {isCrit
                    ? t("exc_rules_badge_corrupted", "CORRUPTED • GAME CRASH")
                    : isBenign
                    ? t("exc_rules_badge_unrelated", "UNRELATED • NORMAL GAME BUG")
                    : t("exc_rules_badge_unstable", "UNSTABLE • UI / RANDOM BUGS")}
                </span>
                {(isBenign || rule.ignore_in_lab) && (
                  <span className="px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase text-[var(--success)] border border-[color-mix(in_srgb,var(--success)_35%,transparent)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] flex items-center gap-1">
                    <span className="material-symbols-outlined !text-[12px]">
                      {t("icon_verified", "verified")}
                    </span>
                    {t("exc_rules_badge_no_autofail", "WON'T FAIL TEST")}
                  </span>
                )}
                {rule.file_hint && (
                  <span className="px-3 py-1 rounded-full text-[10px] font-mono text-[var(--subtext)] glass-surface border border-[rgba(var(--text-rgb),0.15)]">
                    {rule.file_hint}
                  </span>
                )}
              </div>

              <div className="p-4 rounded-xl glass-surface border border-[rgba(var(--text-rgb),0.12)] font-mono text-xs text-[var(--text)] break-words leading-relaxed">
                {rule.pattern}
              </div>

              {rule.raw_log && (
                <div className="flex flex-col gap-1.5 mt-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">
                    {t("exc_rules_raw_log_label", "Raw Exception / Stack Trace Snippet")}
                  </span>
                  <pre className="p-4 rounded-xl glass-surface border border-[rgba(var(--text-rgb),0.12)] font-mono text-[11px] text-[var(--subtext)] whitespace-pre-wrap break-words max-h-56 overflow-y-auto custom-scrollbar leading-relaxed">
                    {rule.raw_log}
                  </pre>
                </div>
              )}
            </UniversalGroup>

            <UniversalGroup
              title={t("exc_rules_what_it_means", "What the Community Knows (Cause & Diagnosis)")}
              icon={t("icon_psychology", "psychology")}
            >
              <div className="p-5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-sm font-bold text-[var(--text)] leading-relaxed whitespace-pre-wrap">
                {rule.diagnosis || "--"}
              </div>
            </UniversalGroup>

            <UniversalGroup
              title={t("exc_rules_recommended_fix", "Recommended Fix / Resolution")}
              icon={t("icon_lightbulb", "lightbulb")}
            >
              <div className="p-5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-sm font-bold text-[var(--text)] leading-relaxed whitespace-pre-wrap">
                {rule.resolution || "--"}
              </div>
            </UniversalGroup>
          </>
        ) : (
          <>
            <UniversalGroup
              title={t("exc_rules_raw_log_group_title", "Raw Exception / Error Log Code")}
              icon={t("icon_terminal", "terminal")}
            >
              <UniversalTextArea
                label={t(
                  "exc_rules_raw_log_label",
                  "Raw Exception / Stack Trace Snippet"
                )}
                value={rule.raw_log || ""}
                onChange={(v: any) =>
                  setRule((prev) => ({
                    ...prev,
                    raw_log: typeof v === "string" ? v : v?.target?.value || "",
                  }))
                }
                placeholder={t(
                  "exc_rules_paste_log_ph",
                  "Paste a raw lastException.txt or lastUIException.txt snippet here to auto-extract its signature..."
                )}
                rows={6}
              />
              {(rule.raw_log || "").trim().length > 0 && (
                <button
                  type="button"
                  onClick={handleExtractFromRawLog}
                  className="self-start px-3.5 py-2 rounded-xl text-[10px] font-black tracking-widest uppercase border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[14px]">
                    {t("icon_auto_fix", "auto_fix_high")}
                  </span>
                  {t("exc_rules_btn_extract_pattern", "Auto-Extract Signature from Log")}
                </button>
              )}
            </UniversalGroup>

            <UniversalGroup
              title={t("exc_rules_matched_pattern", "Matched Log Signature")}
              icon={t("icon_rule", "rule")}
            >
              <UniversalInput
                label={t(
                  "exc_rules_field_pattern",
                  "Log Match Pattern (Substring, Category ID, or Error Code)"
                )}
                value={rule.pattern}
                onChange={(v: any) =>
                  setRule((prev) => ({
                    ...prev,
                    pattern: typeof v === "string" ? v : v?.target?.value || "",
                  }))
                }
                placeholder={t(
                  "exc_rules_field_pattern_ph",
                  "e.g. StoreUtils/StoreDisabledByFeatureParameter | Error #1006"
                )}
              />

              <UniversalInput
                label={t("exc_rules_field_file_hint", "Log File Source (Optional)")}
                value={rule.file_hint || ""}
                onChange={(v: any) =>
                  setRule((prev) => ({
                    ...prev,
                    file_hint: typeof v === "string" ? v : v?.target?.value || "",
                  }))
                }
                placeholder={t(
                  "exc_rules_field_file_hint_ph",
                  "e.g. lastUIException.txt or lastException.txt"
                )}
              />

              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest ml-1">
                  {t("exc_rules_field_severity", "Issue Classification")}
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
                {isBenign && (
                  <div className="p-3 rounded-xl border border-[color-mix(in_srgb,var(--success)_35%,transparent)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] flex items-start gap-2 mt-1">
                    <span className="material-symbols-outlined !text-[16px] text-[var(--success)] shrink-0 mt-0.5">
                      {t("icon_verified", "verified")}
                    </span>
                    <span className="text-[11px] font-bold text-[var(--text)] leading-relaxed">
                      {t(
                        "exc_rules_unrelated_lab_notice",
                        "Unrelated (Normal Game Bug) rules automatically bypass Lab Test auto-failure so vanilla game bugs never falsely fail a mod test."
                      )}
                    </span>
                  </div>
                )}
              </div>
            </UniversalGroup>

            <UniversalGroup
              title={t("exc_rules_what_it_means", "What the Community Knows (Cause & Diagnosis)")}
              icon={t("icon_lightbulb", "lightbulb")}
            >
              <UniversalTextArea
                label={t("exc_rules_field_diagnosis", "Community Diagnosis (What Causes This Error?)")}
                value={rule.diagnosis}
                onChange={(v: any) =>
                  setRule((prev) => ({
                    ...prev,
                    diagnosis: typeof v === "string" ? v : v?.target?.value || "",
                  }))
                }
                placeholder={t(
                  "exc_rules_field_diagnosis_ph",
                  "Explain what the community knows about this exception in plain language..."
                )}
                rows={4}
              />

              <UniversalTextArea
                label={t("exc_rules_field_resolution", "Recommended Resolution / Fix Steps")}
                value={rule.resolution}
                onChange={(v: any) =>
                  setRule((prev) => ({
                    ...prev,
                    resolution: typeof v === "string" ? v : v?.target?.value || "",
                  }))
                }
                placeholder={t(
                  "exc_rules_field_resolution_ph",
                  "Explain what the player or creator should do to fix or verify this issue..."
                )}
                rows={3}
              />

              <div className="flex flex-col gap-1.5">
                <UniversalToggle
                  label={t(
                    "exc_rules_field_ignore_lab",
                    "Ignore During Timed Lab Verification (Do Not Fail Test)"
                  )}
                  checked={isBenign ? true : rule.ignore_in_lab}
                  onChange={(val: boolean) =>
                    setRule((prev) => ({ ...prev, ignore_in_lab: val }))
                  }
                />
                <span className="text-[10px] text-[var(--subtext)] opacity-75 px-2 leading-relaxed">
                  {t(
                    "exc_rules_field_ignore_lab_desc",
                    "Enable for harmless vanilla game errors (like EA Store/Wallet UI desyncs) so they do not falsely fail a Proving Run."
                  )}
                </span>
              </div>

              <UniversalToggle
                label={t("exc_rules_field_enabled", "Rule Active")}
                checked={rule.enabled}
                onChange={(val: boolean) =>
                  setRule((prev) => ({ ...prev, enabled: val }))
                }
              />
            </UniversalGroup>
          </>
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
      {severityFilter === undefined && (
        <StatTileCarousel>
          <DashboardStatTile
            variant="filter"
            icon={t("icon_psychology", "psychology")}
            label={t("filter_all", "All")}
            number={counts.all}
            isActive={activeFilter === "all"}
            onClick={() => handleFilterChange("all")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_gpp_maybe", "gpp_maybe")}
            label={t("exc_rules_filter_corrupted", "Corrupted")}
            number={counts.corrupted}
            isActive={activeFilter === "corrupted"}
            colorClass="text-[var(--danger)]"
            onClick={() =>
              handleFilterChange(activeFilter === "corrupted" ? "all" : "corrupted")
            }
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_warning", "warning")}
            label={t("exc_rules_filter_unstable", "Unstable")}
            number={counts.unstable}
            isActive={activeFilter === "unstable"}
            colorClass="text-[var(--warning)]"
            onClick={() =>
              handleFilterChange(activeFilter === "unstable" ? "all" : "unstable")
            }
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_bug_report", "bug_report")}
            label={t("exc_rules_filter_unrelated", "Unrelated")}
            number={counts.unrelated}
            isActive={activeFilter === "unrelated"}
            colorClass="text-[var(--success)]"
            onClick={() =>
              handleFilterChange(activeFilter === "unrelated" ? "all" : "unrelated")
            }
          />
        </StatTileCarousel>
      )}

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
              className="px-3.5 py-2 rounded-xl text-[10px] font-black tracking-widest uppercase border border-[color-mix(in_srgb,var(--success)_45%,transparent)] bg-[color-mix(in_srgb,var(--success)_14%,transparent)] text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_24%,transparent)] transition-all flex items-center gap-1.5 cursor-pointer"
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
              className="px-3.5 py-2 rounded-xl text-[10px] font-black tracking-widest uppercase border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] transition-all flex items-center gap-1.5 cursor-pointer"
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {filtered.map((rule) => {
            const normSev = normalizeRuleSeverity(rule);
            const isCrit = normSev === "corrupted";
            const isBenign = normSev === "unrelated";

            const iconName = isCrit
              ? t("icon_gpp_maybe", "gpp_maybe")
              : isBenign
              ? t("icon_bug_report", "bug_report")
              : t("icon_warning", "warning");

            const accentColor = isCrit
              ? "var(--danger)"
              : isBenign
              ? "var(--success)"
              : "var(--warning)";

            return (
              <div
                key={rule.id}
                onClick={() => {
                  setEditingRule(rule);
                  setDefaultAsGameBug(false);
                  setIsEditorOpen(true);
                }}
                className="group glass-panel rounded-2xl p-5 border border-[rgba(var(--text-rgb),0.1)] hover:border-[var(--accent)] transition-all duration-200 cursor-pointer flex flex-col justify-between gap-4 min-h-[180px] shadow-md hover:shadow-xl"
              >
                <div className="flex flex-col gap-3">
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div
                      className="w-11 h-11 rounded-xl shrink-0 flex items-center justify-center border"
                      style={{
                        borderColor: `color-mix(in srgb, ${accentColor} 35%, transparent)`,
                        backgroundColor: `color-mix(in srgb, ${accentColor} 12%, transparent)`,
                        color: accentColor,
                      }}
                    >
                      <span className="material-symbols-outlined !text-[22px]">
                        {iconName}
                      </span>
                    </div>

                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                      <span className="text-sm font-black text-[var(--text)] leading-snug line-clamp-1 group-hover:text-[var(--accent)] transition-colors">
                        {rule.title}
                      </span>
                      <span className="text-[11px] font-mono text-[var(--subtext)] opacity-75 truncate">
                        {rule.pattern}
                      </span>
                    </div>
                  </div>

                  {rule.diagnosis && (
                    <p className="text-xs font-medium text-[var(--subtext)] opacity-90 line-clamp-2 leading-relaxed">
                      {rule.diagnosis}
                    </p>
                  )}
                </div>

                <div className="pt-3.5 border-t border-[rgba(var(--text-rgb),0.08)] flex items-center justify-between gap-2 flex-wrap mt-auto">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`px-2.5 py-1 rounded-lg text-[9px] font-black tracking-wider uppercase border ${
                        isCrit
                          ? "text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]"
                          : isBenign
                          ? "text-[var(--success)] border-[color-mix(in_srgb,var(--success)_35%,transparent)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)]"
                          : "text-[var(--warning)] border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_12%,transparent)]"
                      }`}
                    >
                      {isCrit
                        ? t("exc_rules_badge_corrupted", "CORRUPTED • GAME CRASH")
                        : isBenign
                        ? t("exc_rules_badge_unrelated", "UNRELATED • NORMAL GAME BUG")
                        : t("exc_rules_badge_unstable", "UNSTABLE • UI / RANDOM BUGS")}
                    </span>

                    {(isBenign || rule.ignore_in_lab) && (
                      <span className="px-2.5 py-1 rounded-lg text-[9px] font-black tracking-wider uppercase text-[var(--success)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] flex items-center gap-1">
                        <span className="material-symbols-outlined !text-[12px]">
                          {t("icon_verified", "verified")}
                        </span>
                        {t("exc_rules_badge_no_autofail", "WON'T FAIL TEST")}
                      </span>
                    )}
                  </div>

                  {rule.file_hint && (
                    <span className="px-2.5 py-1 rounded-lg text-[9px] font-mono text-[var(--subtext)] glass-surface border border-[rgba(var(--text-rgb),0.12)] shrink-0">
                      {rule.file_hint}
                    </span>
                  )}
                </div>
              </div>
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


