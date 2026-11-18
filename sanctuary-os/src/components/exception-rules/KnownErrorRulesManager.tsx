import { useState, useEffect, useMemo } from "react";
import { useLexicon } from "../../LexiconContext";
import { useStore } from "../../store";
import { SidePanel, PanelHeaderGroup, EmptyState, DashboardStatTile, SidePanelFilterBar } from "../../shared-components/layout";
import { CustomDropdown } from "../../shared-components/dropdowns";
import { PanelHeaderButton, ActionButton } from "../../shared-components/buttons";
import { HoverTooltip } from "../../shared-components/alerts";
import { VAULT_CHIP_CLASS } from "../../shared-components/constants";
import { CommandScreenSectionHeading } from "../../hub-components/SharedCommandScreenLayout";
import { formatHumanReadableLogText } from "../../utils/logScrubber";
import { openSanctuaryContextMenu, SanctuaryContextMenuItem } from "../../shared-components/ContextMenu";
import { type NormalizedRuleSeverity, type SchemaExceptionRule, normalizeRuleSeverity, syncRulesToRustRuntime, loadExceptionRulesFromSpoke, getExceptionRules, matchExceptionRules, saveExceptionRulesToSpoke } from "./ruleStoreAndMatcher";
import { KnownErrorRuleEditorSidePanel } from "./ExceptionRuleEditorPanel";

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
      syncRulesToRustRuntime(loaded);
    };
    refresh();
    loadExceptionRulesFromSpoke(activeGameSchema).catch(() => {});
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
          <SidePanelFilterBar className="grid-cols-2 sm:grid-cols-4 gap-3">
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
          </SidePanelFilterBar>

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




