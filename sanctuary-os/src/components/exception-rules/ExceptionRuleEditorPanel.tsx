import { useState, useEffect } from "react";
import { useLexicon } from "../../LexiconContext";
import { useStore } from "../../store";
import { SidePanel, CustomDropdown, PanelHeaderGroup, PanelHeaderButton, VAULT_CHIP_CLASS, ActionButton } from "../../shared";
import { SidePanelHeroCard, SidePanelTitleInput } from "../layouts/ElevatedHubLayout";
import { CommandScreenSectionHeading } from "../../hub-components/SharedCommandScreenLayout";
import { UniversalGroup, StatBox } from "../universal/UniversalLayout";
import { scrubLogUserData, formatHumanReadableLogText } from "../../utils/logScrubber";
import { type NormalizedRuleSeverity, type SchemaExceptionRule, normalizeRuleSeverity, resolveDefaultExceptionFileHint, getExceptionRules, extractSuggestedPatternFromLog, saveExceptionRulesToSpoke, matchExceptionRules } from "./ruleStoreAndMatcher";

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
        t("exc_rules_saved_db_toast", "Known Error Rule saved to database."),
        "success"
      );
      onClose();
    } catch (err: any) {
      pushStatus(
        err?.message || t("alert_error", "Error saving:"),
        "error"
      );
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
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
                  className="w-full min-h-10 py-2 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
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
                  className="w-full min-h-10 py-2 glass-panel rounded-xl px-3.5 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] flex items-center justify-between gap-2 text-xs font-black text-[var(--text)] transition-all cursor-pointer"
                >
                  <span className="leading-snug text-left break-words">
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
                  className={`w-full min-h-10 py-2 glass-panel rounded-xl px-3.5 border flex items-center justify-between gap-2 text-xs font-black transition-all cursor-pointer ${
                    rule.pinned
                      ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--text)]"
                      : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[var(--subtext)]"
                  }`}
                >
                  <span className="leading-snug text-left break-words">
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

