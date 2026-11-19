import { useEffect, useMemo, useState } from "react";
import { useLexicon } from "../../LexiconContext";
import { useStore } from "../../store";
import { supabaseAuth } from "../../supabase";
import {
  ActionButton,
  CustomDropdown,
  DashboardStatTile,
  EmptyState,
  handleOpenUrl,
  PanelHeaderButton,
  PanelHeaderGroup,
  SidePanel,
  SidePanelFilterBar,
  SidePanelHeroCard,
  StatBox,
  VAULT_CHIP_CLASS,
} from "../../shared";
import { UniversalCard } from "../../components/universal/UniversalCard";
import {
  UniversalGroup,
  UniversalSearch,
  UniversalTextArea,
} from "../../components/universal/UniversalLayout";
import { CommandScreenSectionHeading } from "../SharedCommandScreenLayout";
import { invalidateHubCommandCache } from "../../utils/hubCommandCache";
import {
  SpokeTargetDossierSidePanel,
  type SpokeTargetPreResolvedMeta,
} from "../../landing/SpokeTargetDossierSidePanel";
import type { LegalTargetItem } from "../../landing/DmcaAndLegalFlowSteps";
import {
  fetchDmcaQueueNotices,
  filterDmcaNotices,
  getNoticeActiveTimerInfo,
  getNoticeStatusMeta,
  getNoticeTypeLabel,
  isSpokeTargetDmcaNotice,
  makeTargetLookupKey,
  normalizeExternalUrl,
  partitionDmcaNoticesByLane,
  resolveActiveGatewayGameId,
  type DmcaLaneId,
  type ResolvedDmcaTargetEntry,
} from "./dmcaQueueHelpers";

export { fetchDmcaQueueNotices } from "./dmcaQueueHelpers";
export type {
  ResolvedDmcaTargetEntry,
  DmcaQueueFetchResult,
} from "./dmcaQueueHelpers";

type DmcaTriageDecisionId =
  | "VALIDATE_TAKEDOWN"
  | "HOLD_VERIFY_AUTHORITY"
  | "ACCEPT_COUNTER_NOTICE"
  | "RESTORE_MATERIAL"
  | "REJECT_DEFECTIVE_ID"
  | "REJECT_NON_COPYRIGHT"
  | "REJECT_OTHER";

const DECISION_TO_BACKEND_ACTION: Record<
  DmcaTriageDecisionId,
  | "VALIDATE_TAKEDOWN"
  | "HOLD_VERIFY_AUTHORITY"
  | "REJECT_NOTICE"
  | "ACCEPT_COUNTER_NOTICE"
  | "RESTORE_MATERIAL"
> = {
  VALIDATE_TAKEDOWN: "VALIDATE_TAKEDOWN",
  HOLD_VERIFY_AUTHORITY: "HOLD_VERIFY_AUTHORITY",
  ACCEPT_COUNTER_NOTICE: "ACCEPT_COUNTER_NOTICE",
  RESTORE_MATERIAL: "RESTORE_MATERIAL",
  REJECT_DEFECTIVE_ID: "REJECT_NOTICE",
  REJECT_NON_COPYRIGHT: "REJECT_NOTICE",
  REJECT_OTHER: "REJECT_NOTICE",
};

function openSafeReferenceUrl(rawUrl?: string | null) {
  const safe = normalizeExternalUrl(rawUrl);
  if (safe) handleOpenUrl(safe);
}

interface DmcaNoticeCardProps {
  notice: any;
  resolvedTargetsMap?: Record<string, ResolvedDmcaTargetEntry>;
  gamesMap?: Record<string, any>;
  showScopeChip?: boolean;
  onSelect: (notice: any) => void;
}

export function DmcaNoticeCard({
  notice,
  resolvedTargetsMap = {},
  gamesMap = {},
  showScopeChip = false,
  onSelect,
}: DmcaNoticeCardProps) {
  const { t } = useLexicon();
  const meta = getNoticeStatusMeta(notice, t);
  const typeLabel = getNoticeTypeLabel(notice, t);
  const timerInfo = getNoticeActiveTimerInfo(notice, t);
  const isSpoke = isSpokeTargetDmcaNotice(notice);
  const identifiers: string[] = Array.isArray(notice?.target_identifiers)
    ? notice.target_identifiers
    : [];
  const sid = String(notice?.target_spoke_id || "hub").trim();
  const primaryResolved = identifiers
    .map((id) => resolvedTargetsMap[makeTargetLookupKey(sid, id)])
    .find(Boolean);
  const scopeLabel =
    notice?.target_spoke_name ||
    notice?.metadata?.target_spoke_name ||
    gamesMap[sid]?.name ||
    t("dmca_scope_core", "Keepers Core");
  const claimantName =
    notice?.decrypted_contact?.full_legal_name ||
    notice?.claimant_name_masked ||
    `#${String(notice?.id || "").slice(0, 8)}`;

  const cardTitle = primaryResolved?.item?.title || claimantName;
  const cardSubtitle = primaryResolved
    ? `${claimantName} • ${scopeLabel}`
    : [scopeLabel, notice?.reply_email_masked].filter(Boolean).join(" • ");

  return (
    <UniversalCard
      layout="vertical"
      statusColor={meta.color}
      icon={meta.iconName}
      bannerTopLabel={typeLabel}
      bannerTopRightLabel={timerInfo.text || `#${String(notice?.id || "").slice(0, 8)}`}
      bannerBottomLabel={
        primaryResolved?.item?.subtitle
          ? `${t("by_prefix", "By")} ${primaryResolved.item.subtitle}`
          : scopeLabel
      }
      title={cardTitle}
      subtitle={<span className="no-text-case text-[11px]">{cardSubtitle}</span>}
      description={
        notice?.work_description ? (
          <span className="line-clamp-2 text-xs text-[var(--subtext)]">
            {notice.work_description}
          </span>
        ) : undefined
      }
      imageOverlay={
        <div className="absolute top-2.5 inset-x-3 flex items-center justify-between gap-1.5 z-30 pointer-events-none">
          <span className={`${VAULT_CHIP_CLASS} max-w-[68%]`}>
            <span className={`material-symbols-outlined !text-[12px] shrink-0 ${meta.iconColorClass}`}>
              {meta.iconName}
            </span>
            <span className="truncate">{meta.label}</span>
          </span>
          {showScopeChip && (
            <span className={`${VAULT_CHIP_CLASS} ml-auto max-w-[44%]`}>
              <span
                className={`material-symbols-outlined !text-[12px] shrink-0 ${
                  isSpoke ? "text-[var(--accent)]" : "text-[var(--warning)]"
                }`}
              >
                {isSpoke ? t("icon_dns", "dns") : t("icon_shield", "shield")}
              </span>
              <span className="truncate">
                {isSpoke ? scopeLabel : t("dmca_scope_hub_short", "Hub")}
              </span>
            </span>
          )}
        </div>
      }
      onClick={() => onSelect(notice)}
      className="w-full h-full"
      footer={
        <div className="flex items-center justify-between gap-2 w-full">
          <span className="text-[10px] font-black opacity-60 text-[var(--subtext)] flex items-center gap-1.5">
            <span className="material-symbols-outlined !text-[12px]">
              {t("icon_calendar_today", "calendar_today")}
            </span>
            <span>
              {notice?.created_at
                ? new Date(notice.created_at).toLocaleDateString()
                : ""}
            </span>
          </span>
          <span className="text-[10px] font-black text-[var(--text)] group-hover/card:text-[var(--accent)] capitalize tracking-widest transition-colors flex items-center gap-1 shrink-0">
            <span>
              {isSpoke && showScopeChip
                ? t("dmca_view_copy_btn", "View Copy")
                : t("dmca_review_notice_btn", "Review Notice")}
            </span>
            <span className="material-symbols-outlined !text-sm">
              {t("icon_arrow_forward", "arrow_forward")}
            </span>
          </span>
        </div>
      }
    />
  );
}

interface DmcaLaneLeadCardProps {
  lane: DmcaLaneId;
  count: number;
  overdueCount?: number;
  onClick: () => void;
  className?: string;
}

export function DmcaLaneLeadCard({
  lane,
  count,
  overdueCount = 0,
  onClick,
  className = "",
}: DmcaLaneLeadCardProps) {
  const { t } = useLexicon();

  const tone =
    lane === "urgent"
      ? overdueCount > 0
        ? "danger"
        : count > 0
          ? "warning"
          : "success"
      : lane === "pending"
        ? count > 0
          ? "warning"
          : "accent"
        : "success";

  const toneVar =
    tone === "danger"
      ? "var(--danger)"
      : tone === "warning"
        ? "var(--warning)"
        : tone === "success"
          ? "var(--success)"
          : "var(--accent)";

  const iconName =
    lane === "urgent"
      ? overdueCount > 0
        ? t("icon_warning", "warning")
        : t("icon_gavel", "gavel")
      : lane === "pending"
        ? t("icon_hourglass_top", "hourglass_top")
        : t("icon_task_alt", "task_alt");

  const chipText =
    lane === "urgent"
      ? overdueCount > 0
        ? `${overdueCount} ${t("dmca_chip_overdue", "Overdue")}`
        : count > 0
          ? `${count} ${t("dmca_lane_urgent_short", "Urgent")}`
          : t("dmca_chip_sla_clear", "SLA Clear")
      : lane === "pending"
        ? `${count} ${t("pending", "Pending")}`
        : `${count} ${t("dmca_lane_settled_short", "Settled")}`;

  const overline =
    lane === "urgent"
      ? t("dmca_lead_urgent_overline", "Statutory 48h SLA & Expiring Timers")
      : lane === "pending"
        ? t("dmca_lead_pending_overline", "Tier 1 Holds & Authority Verification")
        : t("dmca_lead_settled_overline", "Completed Compliance Record");

  const title =
    lane === "urgent"
      ? t("dmca_lead_urgent_title", "Urgent & New Notices")
      : lane === "pending"
        ? t("dmca_lead_pending_title", "Pending & Counter Windows")
        : t("dmca_lead_settled_title", "Settled & Archived Notices");

  const callout =
    lane === "urgent"
      ? t("dmca_lead_urgent_callout", "Overdue & Soonest Expiring Timers Ranked First")
      : lane === "pending"
        ? t("dmca_lead_pending_callout", "10–14 Business Day Window & Paused Holds")
        : t("dmca_lead_settled_callout", "Restored Material & Rejected Deficient Notices");

  const body =
    lane === "urgent"
      ? t(
          "dmca_lead_urgent_body",
          "Prioritizes overdue 48-hour Spoke SLAs, newly filed takedowns, and any active window expiring within 48 hours."
        )
      : lane === "pending"
        ? t(
            "dmca_lead_pending_body",
            "Active Tier 1 soft-holds, counter-notice waiting windows, and filings paused pending claimant authority verification."
          )
        : t(
            "dmca_lead_settled_body",
            "Historical record of restored material, rejected § 512(c)(3) / § 102(b) notices, and closed compliance actions."
          );

  const ctaLabel =
    lane === "urgent"
      ? `${t("dmca_open_all_urgent", "View All Urgent")} (${count})`
      : lane === "pending"
        ? `${t("dmca_open_all_pending", "View All Pending")} (${count})`
        : `${t("dmca_open_all_settled", "View Settled Archive")} (${count})`;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={`glass-panel rounded-[var(--radius)] p-5 flex flex-col gap-3.5 relative overflow-hidden h-full cursor-pointer transition-all duration-300 hover:shadow-2xl group/lead ${className}`}
      style={{
        backgroundColor: `color-mix(in srgb, ${toneVar} 4%, transparent)`,
        borderColor: `color-mix(in srgb, ${toneVar} 24%, transparent)`,
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{
          background: `radial-gradient(circle at 88% 12%, color-mix(in srgb, ${toneVar} 14%, transparent) 0%, transparent 62%)`,
        }}
      />
      <span
        className="material-symbols-outlined absolute -right-3 -bottom-4 !text-[84px] opacity-[0.04] pointer-events-none select-none rotate-[-10deg]"
        style={{ color: toneVar }}
      >
        {iconName}
      </span>

      <div className="flex items-center justify-between gap-3 relative z-10">
        <div
          className="w-11 h-11 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0"
          style={{ color: toneVar }}
        >
          <span className="material-symbols-outlined !text-[22px]">{iconName}</span>
        </div>
        <span className={VAULT_CHIP_CLASS}>
          <span
            className="material-symbols-outlined !text-[12px]"
            style={{ color: toneVar }}
          >
            {iconName}
          </span>
          <span>{chipText}</span>
        </span>
      </div>

      <div className="flex flex-col gap-1 relative z-10">
        <span
          className="text-[10px] font-mono font-black uppercase tracking-[0.14em] leading-snug"
          style={{ color: toneVar }}
        >
          {overline}
        </span>
        <h3 className="text-base font-black text-[var(--text)] tracking-tight leading-snug m-0 group-hover/lead:text-[var(--accent)] transition-colors">
          {title}
        </h3>
      </div>

      <div
        className="px-3 py-2 rounded-xl glass-surface border flex items-center gap-2 relative z-10"
        style={{
          borderColor: `color-mix(in srgb, ${toneVar} 24%, transparent)`,
          backgroundColor: `color-mix(in srgb, ${toneVar} 6%, transparent)`,
        }}
      >
        <span
          className="material-symbols-outlined !text-[15px] shrink-0"
          style={{ color: toneVar }}
        >
          {t("icon_info", "info")}
        </span>
        <span
          className="text-[10px] font-mono font-bold uppercase tracking-wider leading-snug"
          style={{ color: toneVar }}
        >
          {callout}
        </span>
      </div>

      <p className="text-[11px] text-[var(--subtext)] opacity-90 leading-relaxed m-0 relative z-10 no-text-case">
        {body}
      </p>

      <div className="pt-3 mt-auto border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-widest relative z-10">
        <span className="text-[var(--subtext)] opacity-75">
          {t("dmca_tab_label", "DMCA & Legal")}
        </span>
        <span
          className="flex items-center gap-1 shrink-0 transition-transform group-hover/lead:translate-x-0.5"
          style={{ color: toneVar }}
        >
          <span>{ctaLabel}</span>
          <span className="material-symbols-outlined !text-[14px]">
            {t("icon_arrow_forward", "arrow_forward")}
          </span>
        </span>
      </div>
    </div>
  );
}

interface DmcaAllNoticesSidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  initialLane?: DmcaLaneId;
  notices: any[];
  resolvedTargetsMap?: Record<string, ResolvedDmcaTargetEntry>;
  gamesMap?: Record<string, any>;
  isKeepersView?: boolean;
  initialScopeFilter?: string;
  onSelectNotice: (notice: any) => void;
  onRefresh?: () => Promise<void> | void;
}

export function DmcaAllNoticesSidePanel({
  isOpen,
  onClose,
  initialLane = "urgent",
  notices,
  resolvedTargetsMap = {},
  gamesMap = {},
  isKeepersView = false,
  initialScopeFilter = "all",
  onSelectNotice,
  onRefresh,
}: DmcaAllNoticesSidePanelProps) {
  const { t } = useLexicon();
  const [activeLane, setActiveLane] = useState<DmcaLaneId>(initialLane);
  const [drawerSearch, setDrawerSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState<string>(initialScopeFilter);

  useEffect(() => {
    if (isOpen) {
      setActiveLane(initialLane);
      setScopeFilter(initialScopeFilter);
    }
  }, [isOpen, initialLane, initialScopeFilter]);

  const spokeOptions = useMemo(() => {
    const map = new Map<string, string>();
    Object.values(gamesMap || {}).forEach((g: any) => {
      if (g?.id) map.set(String(g.id), String(g.name || g.schema_id || g.id));
    });
    (notices || []).forEach((n: any) => {
      const sid = String(n?.target_spoke_id || "").trim();
      if (sid && !map.has(sid)) {
        map.set(
          sid,
          String(n?.target_spoke_name || n?.metadata?.target_spoke_name || sid)
        );
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, label: name }));
  }, [gamesMap, notices]);

  const scopedFiltered = useMemo(
    () =>
      filterDmcaNotices(notices, {
        searchQuery: drawerSearch,
        scopeFilter: isKeepersView ? scopeFilter : "all",
        resolvedTargetsMap,
        gamesMap,
      }),
    [notices, drawerSearch, isKeepersView, scopeFilter, resolvedTargetsMap, gamesMap]
  );

  const lanes = useMemo(
    () => partitionDmcaNoticesByLane(scopedFiltered, t),
    [scopedFiltered, t]
  );

  const visibleList =
    activeLane === "urgent"
      ? lanes.urgent
      : activeLane === "pending"
        ? lanes.pending
        : lanes.settled;

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("dmca_drawer_all_title", "DMCA & Legal Compliance Queue")}
      subtitle={t(
        "dmca_drawer_all_sub",
        "Inspect overdue SLAs, active hold windows, and settled records"
      )}
      icon={t("icon_gavel", "gavel")}
      iconColorClass="text-[var(--warning)]"
      widthClass="w-[92vw] md:w-[880px]"
      backdropZ="z-[50000]"
      panelZ="z-[50001]"
      headerActions={
        onRefresh ? (
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_refresh", "refresh")}
              tooltip={t("refresh", "Refresh")}
              onClick={onRefresh}
            />
          </PanelHeaderGroup>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4 pb-8">
        <SidePanelFilterBar className="grid-cols-3 gap-3">
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            isActive={activeLane === "urgent"}
            icon={t("icon_warning", "warning")}
            label={t("dmca_lane_urgent_short", "Urgent")}
            value={lanes.urgent.length}
            colorClass={
              lanes.urgent.length > 0 ? "text-[var(--danger)]" : "text-[var(--success)]"
            }
            onClick={() => setActiveLane("urgent")}
          />
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            isActive={activeLane === "pending"}
            icon={t("icon_hourglass_top", "hourglass_top")}
            label={t("pending", "Pending")}
            value={lanes.pending.length}
            colorClass="text-[var(--warning)]"
            onClick={() => setActiveLane("pending")}
          />
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            isActive={activeLane === "settled"}
            icon={t("icon_task_alt", "task_alt")}
            label={t("dmca_lane_settled_short", "Settled")}
            value={lanes.settled.length}
            colorClass="text-[var(--success)]"
            onClick={() => setActiveLane("settled")}
          />
        </SidePanelFilterBar>

        <div
          className={`grid grid-cols-1 ${
            isKeepersView ? "md:grid-cols-12" : ""
          } gap-3 items-end`}
        >
          <div className={isKeepersView ? "md:col-span-7" : ""}>
            <UniversalSearch
              value={drawerSearch}
              onChange={setDrawerSearch}
              placeholder={t("nav_search", "Search...")}
            />
          </div>
          {isKeepersView && (
            <div className="md:col-span-5">
              <CustomDropdown
                disableTint={true}
                value={scopeFilter}
                onChange={(vals: string[]) => setScopeFilter(vals[0] || "all")}
                options={[
                  {
                    id: "all",
                    label: t("audit_scope_all", "All (Core + Spokes)"),
                  },
                  {
                    id: "hub",
                    label: t("dmca_scope_hub_only", "Keepers Core (Hub Only)"),
                  },
                  {
                    id: "spokes",
                    label: t("audit_scope_spokes", "Partner Spokes"),
                  },
                  ...spokeOptions,
                ]}
              />
            </div>
          )}
        </div>

        {visibleList.length === 0 ? (
          <EmptyState
            icon={t("icon_gavel", "gavel")}
            title={t("dmca_queue_empty", "No DMCA or Legal Compliance Notices")}
            className="py-12"
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visibleList.map((notice) => (
              <DmcaNoticeCard
                key={notice.id}
                notice={notice}
                resolvedTargetsMap={resolvedTargetsMap}
                gamesMap={gamesMap}
                showScopeChip={isKeepersView}
                onSelect={onSelectNotice}
              />
            ))}
          </div>
        )}
      </div>
    </SidePanel>
  );
}

interface DmcaNoticeReviewSidePanelProps {
  notice: any | null;
  isOpen: boolean;
  onClose: () => void;
  resolvedTargetsMap?: Record<string, ResolvedDmcaTargetEntry>;
  gamesMap?: Record<string, any>;
  isKeepersView?: boolean;
  backdropZ?: string;
  panelZ?: string;
  onRefresh?: () => Promise<void> | void;
  onTriageCompleted?: () => void;
}

export function DmcaNoticeReviewSidePanel({
  notice,
  isOpen,
  onClose,
  resolvedTargetsMap = {},
  gamesMap = {},
  isKeepersView = false,
  backdropZ = "z-[50100]",
  panelZ = "z-[50101]",
  onRefresh,
  onTriageCompleted,
}: DmcaNoticeReviewSidePanelProps) {
  const { t } = useLexicon();
  const [decision, setDecision] = useState<DmcaTriageDecisionId>("VALIDATE_TAKEDOWN");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [isActing, setIsActing] = useState(false);
  const [dossierTarget, setDossierTarget] = useState<{
    item: LegalTargetItem;
    spokeGame: any | null;
    preResolved?: SpokeTargetPreResolvedMeta;
  } | null>(null);

  const presetNotesByDecision: Partial<Record<DmcaTriageDecisionId, string>> = {
    REJECT_DEFECTIVE_ID: t(
      "dmca_preset_defective_id_note",
      "Rejected under 17 U.S.C. § 512(c)(3)(A): Notice uses an alias/incomplete identity, missing physical street address, or omits exact target UUID/hash/{Blueprint} identifiers."
    ),
    REJECT_NON_COPYRIGHT: t(
      "dmca_preset_non_copyright_note",
      "Rejected under 17 U.S.C. § 102(b): Copyright covers original expression only — claims over {mod} concepts/ideas, gameplay mechanics, titles, or personal disputes fail statutory subject-matter requirements."
    ),
    HOLD_VERIFY_AUTHORITY: t(
      "dmca_preset_verify_authority_note",
      "Paused pending 17 U.S.C. § 512(c)(3)(A)(i)/(vi) authority verification: Claimant must verify corporate domain email or written authorization to act on behalf of the stated rights holder before content is removed."
    ),
  };

  useEffect(() => {
    if (!notice) return;
    const defaultDecision: DmcaTriageDecisionId =
      notice.notice_type === "dmca_counter"
        ? "ACCEPT_COUNTER_NOTICE"
        : notice.authority_check_recommended
          ? "HOLD_VERIFY_AUTHORITY"
          : "VALIDATE_TAKEDOWN";
    setDecision(defaultDecision);
    setResolutionNotes(
      defaultDecision === "HOLD_VERIFY_AUTHORITY"
        ? presetNotesByDecision.HOLD_VERIFY_AUTHORITY || ""
        : ""
    );
    setDossierTarget(null);
  }, [notice?.id]);

  const statusMeta = getNoticeStatusMeta(notice, t);
  const typeLabel = getNoticeTypeLabel(notice, t);
  const timerInfo = getNoticeActiveTimerInfo(notice, t);
  const isSpokeNotice = isSpokeTargetDmcaNotice(notice);
  const isReadOnlySpokeCopy = Boolean(isKeepersView && isSpokeNotice);
  const sid = String(notice?.target_spoke_id || "hub").trim();
  const scopeLabel =
    notice?.target_spoke_name ||
    notice?.metadata?.target_spoke_name ||
    gamesMap[sid]?.name ||
    t("dmca_scope_core", "Keepers Core");

  const presetStringsSet = new Set(
    Object.values(presetNotesByDecision)
      .filter(Boolean)
      .map((s) => String(s).trim())
  );

  const handleDecisionChange = (vals: string[]) => {
    const nextDecision = (vals[0] || "VALIDATE_TAKEDOWN") as DmcaTriageDecisionId;
    setDecision(nextDecision);
    const nextPreset = presetNotesByDecision[nextDecision];
    const currentTrimmed = resolutionNotes.trim();
    if (nextPreset && (!currentTrimmed || presetStringsSet.has(currentTrimmed))) {
      setResolutionNotes(nextPreset);
    } else if (!nextPreset && presetStringsSet.has(currentTrimmed)) {
      setResolutionNotes("");
    }
  };

  const missingTriageReason = !resolutionNotes.trim()
    ? t("identities_req_reason", "Reason is required.")
    : "";

  const handleApplyDecision = async () => {
    if (!notice || isActing || isReadOnlySpokeCopy || missingTriageReason) return;
    const backendAction = DECISION_TO_BACKEND_ACTION[decision];

    setIsActing(true);
    try {
      const token = useStore.getState().session?.access_token || "";
      const targetGameId =
        notice.target_spoke_id || resolveActiveGatewayGameId();
      const { data, error } = await supabaseAuth.functions.invoke("game-gateway", {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: {
          ...(targetGameId ? { game_id: targetGameId } : {}),
          action: "execute_dmca_triage_action",
          payload: {
            notice_id: notice.id,
            triage_action: backendAction,
            resolution_notes: resolutionNotes.trim(),
            caller_context: isKeepersView ? "keepers_core" : "spoke_oversight",
          },
        },
      });
      if (error || data?.error || data?.ok === false) {
        throw new Error(error?.message || data?.error || "Failed to triage notice");
      }

      invalidateHubCommandCache("oversight");
      invalidateHubCommandCache("wayfinder");
      invalidateHubCommandCache("keeper");

      useStore
        .getState()
        .pushStatus(
          backendAction === "VALIDATE_TAKEDOWN"
            ? t(
                "dmca_triage_validated_toast",
                "DMCA takedown validated — target soft-delisted (Tier 1) and public {Blueprint} hashes stripped."
              )
            : backendAction === "HOLD_VERIFY_AUTHORITY"
              ? t(
                  "dmca_triage_authority_hold_toast",
                  "Notice paused for claimant authority verification — 48h SLA paused and content kept live."
                )
              : backendAction === "RESTORE_MATERIAL"
                ? t(
                    "dmca_triage_restored_toast",
                    "Material restored to public visibility (Tier 0) and strike adjusted."
                  )
                : backendAction === "ACCEPT_COUNTER_NOTICE"
                  ? t(
                      "dmca_triage_counter_toast",
                      "Counter-notice accepted — 10–14 business day statutory clock started."
                    )
                  : t("dmca_triage_rejected_toast", "DMCA notice rejected as incomplete/invalid."),
          "success"
        );
      onClose();
      await onRefresh?.();
      onTriageCompleted?.();
    } catch (err: any) {
      useStore.getState().pushStatus(err?.message || String(err), "error");
    } finally {
      setIsActing(false);
    }
  };

  const identifiers: string[] = Array.isArray(notice?.target_identifiers)
    ? notice.target_identifiers
    : [];

  return (
    <>
      <SidePanel
        isOpen={isOpen && Boolean(notice)}
        onClose={onClose}
        title={t("dmca_admin_panel_title", "DMCA & Legal Notice")}
        subtitle={
          notice
            ? `#${String(notice.id).slice(0, 8)} • ${statusMeta.label}`
            : ""
        }
        icon={t("icon_gavel", "gavel")}
        iconColorClass="text-[var(--warning)]"
        widthClass="w-[92vw] md:w-[760px]"
        backdropZ={backdropZ}
        panelZ={panelZ}
        headerActions={
          onRefresh || !isReadOnlySpokeCopy ? (
            <PanelHeaderGroup>
              {onRefresh && (
                <PanelHeaderButton
                  icon={t("icon_refresh", "refresh")}
                  tooltip={t("refresh", "Refresh")}
                  onClick={onRefresh}
                />
              )}
              {!isReadOnlySpokeCopy && (
                <PanelHeaderButton
                  icon={
                    isActing
                      ? t("icon_sync", "sync")
                      : t("icon_check_circle", "check_circle")
                  }
                  variant="accent"
                  disabled={isActing || Boolean(missingTriageReason)}
                  tooltip={
                    missingTriageReason ||
                    t("dmca_apply_decision_btn", "Apply Triage Decision")
                  }
                  onClick={handleApplyDecision}
                />
              )}
            </PanelHeaderGroup>
          ) : undefined
        }
      >
        {notice && (
          <div className="flex flex-col gap-4 pb-8">
            <SidePanelHeroCard
              icon={t("icon_copyright", "copyright")}
              overline={
                isReadOnlySpokeCopy
                  ? `${scopeLabel} • ${t("dmca_spoke_view_copy_badge", "View Copy")}`
                  : scopeLabel
              }
              title={
                notice.decrypted_contact?.full_legal_name ||
                notice.claimant_name_masked ||
                notice.id
              }
              badge={statusMeta.label}
              badgeIcon={statusMeta.iconName}
              variant={statusMeta.variant}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                <StatBox
                  label={t("dmca_request_type_label", "Request Type")}
                  value={typeLabel}
                  icon={t("icon_gavel", "gavel")}
                  iconColorClass="text-[var(--accent)]"
                />
                <StatBox
                  label={
                    timerInfo.kind === "counter_window"
                      ? t("dmca_counter_window_stat", "Counter Window")
                      : timerInfo.text
                        ? t("dmca_sla_window_label", "SLA / Window")
                        : t("dmca_scope_label", "Target Scope")
                  }
                  value={timerInfo.text || scopeLabel}
                  icon={
                    timerInfo.isOverdue
                      ? t("icon_warning", "warning")
                      : timerInfo.kind === "counter_window"
                        ? t("icon_hourglass_top", "hourglass_top")
                        : t("icon_schedule", "schedule")
                  }
                  iconColorClass={
                    timerInfo.isOverdue
                      ? "text-[var(--danger)]"
                      : timerInfo.kind === "settled"
                        ? "text-[var(--success)]"
                        : "text-[var(--warning)]"
                  }
                />
              </div>
            </SidePanelHeroCard>

            <UniversalGroup
              title={t("dmca_admin_sec_contact", "Claimant Contact Information")}
              icon={t("icon_badge", "badge")}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="glass-surface rounded-xl p-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                  <span className="text-[10px] font-black uppercase text-[var(--subtext)]">
                    {t("dmca_legal_name_label", "Full Legal Name")}
                  </span>
                  <div className="font-bold text-[var(--text)] mt-0.5 no-text-case">
                    {notice.decrypted_contact?.full_legal_name ||
                      notice.claimant_name_masked}
                  </div>
                </div>
                <div className="glass-surface rounded-xl p-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                  <span className="text-[10px] font-black uppercase text-[var(--subtext)]">
                    {t("dmca_email_short_label", "Email Address")}
                  </span>
                  <div className="font-mono font-bold text-[var(--text)] no-text-case mt-0.5 break-all">
                    {notice.decrypted_contact?.email || notice.reply_email_masked}
                  </div>
                </div>
                {notice.decrypted_contact?.company_or_agent && (
                  <div className="glass-surface rounded-xl p-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                    <span className="text-[10px] font-black uppercase text-[var(--subtext)]">
                      {t("dmca_company_agent_label", "Company / Organization (Optional)")}
                    </span>
                    <div className="font-bold text-[var(--text)] mt-0.5 no-text-case">
                      {notice.decrypted_contact.company_or_agent}
                    </div>
                  </div>
                )}
                {notice.decrypted_contact?.phone && (
                  <div className="glass-surface rounded-xl p-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                    <span className="text-[10px] font-black uppercase text-[var(--subtext)]">
                      {t("dmca_phone_label", "Phone Number")}
                    </span>
                    <div className="font-mono font-bold text-[var(--text)] no-text-case mt-0.5">
                      {notice.decrypted_contact.phone}
                    </div>
                  </div>
                )}
              </div>

              {notice.decrypted_contact?.physical_address && (
                <div className="glass-surface rounded-xl p-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-xs">
                  <span className="text-[10px] font-black uppercase text-[var(--subtext)]">
                    {t("dmca_physical_address_label", "Mailing Address")}
                  </span>
                  <div className="font-medium text-[var(--text)] whitespace-pre-wrap mt-0.5 no-text-case">
                    {notice.decrypted_contact.physical_address}
                  </div>
                </div>
              )}

              <div className="glass-surface rounded-xl px-3.5 py-2.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-wrap items-center justify-between gap-2 text-xs no-text-case">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="material-symbols-outlined !text-[16px] text-[var(--success)] shrink-0">
                    {t("icon_verified_user", "verified_user")}
                  </span>
                  <span className="font-semibold text-[var(--text)] no-text-case">
                    {notice.notice_type === "dmca_counter"
                      ? t(
                          "dmca_signed_counter_summary",
                          "Perjury Mistake & Jurisdiction Consent Attested"
                        )
                      : t(
                          "dmca_signed_takedown_summary",
                          "Good-Faith & Perjury / Authority Attested"
                        )}
                  </span>
                </div>
                {notice.electronic_signature && (
                  <span className="text-[11px] font-mono font-bold text-[var(--subtext)] no-text-case">
                    /s/ {notice.electronic_signature}
                  </span>
                )}
              </div>

              {notice.authority_check_recommended && (
                <div className="glass-surface rounded-xl p-3 border border-[color-mix(in_srgb,var(--warning)_28%,transparent)] bg-[color-mix(in_srgb,var(--warning)_6%,transparent)] flex items-start gap-2.5">
                  <span className="material-symbols-outlined !text-[18px] text-[var(--warning)] shrink-0 mt-0.5">
                    {t("icon_warning", "warning")}
                  </span>
                  <div className="flex flex-col gap-0.5 min-w-0 no-text-case">
                    <span className="text-xs font-black text-[var(--warning)] no-text-case">
                      {t("dmca_authority_mismatch_title", "Authority Verification Recommended")}
                    </span>
                    <span className="text-[11px] text-[var(--subtext)] leading-relaxed no-text-case">
                      {`${t("dmca_authority_mismatch_body", "Claimant listed an organization or agent while filing from consumer webmail")} (@${notice.claimant_email_domain || ""}). ${t("dmca_authority_mismatch_hint", "Pause with Hold — Verify Authority before acting unless authorization is confirmed.")}`}
                    </span>
                  </div>
                </div>
              )}
            </UniversalGroup>

            <UniversalGroup
              title={t("dmca_admin_sec_targets", "Reported Content & Reference")}
              icon={t("icon_fingerprint", "fingerprint")}
            >
              {identifiers.length > 0 && (
                <div className="flex flex-col gap-2">
                  {identifiers.map((idToken) => {
                    const resolvedEntry =
                      resolvedTargetsMap[makeTargetLookupKey(sid, idToken)];
                    const isUrl = /^https?:\/\//i.test(idToken);
                    const fallbackItem: LegalTargetItem = {
                      identifier: idToken,
                      kind: "mod",
                      title: idToken,
                      subtitle: scopeLabel,
                    };
                    const cardItem = resolvedEntry?.item || fallbackItem;
                    const isHashToken = /^[0-9a-f]{64}$/i.test(idToken);
                    const cardSubtitle = resolvedEntry
                      ? [
                          resolvedEntry.item.subtitle
                            ? `${t("by_prefix", "By")} ${resolvedEntry.item.subtitle}`
                            : scopeLabel,
                          typeof resolvedEntry.preResolved?.complianceTier === "number"
                            ? `${t("stat_tier", "Tier")} ${resolvedEntry.preResolved.complianceTier}`
                            : null,
                          `#${resolvedEntry.identifier.slice(0, 8)}`,
                        ]
                          .filter(Boolean)
                          .join(" • ")
                      : isHashToken
                        ? `SHA-256: ${idToken.slice(0, 12)}...${idToken.slice(-8)}`
                        : `${scopeLabel} • ${idToken}`;

                    return (
                      <div
                        key={idToken}
                        className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 no-text-case"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                            <span className="material-symbols-outlined !text-[18px]">
                              {cardItem.kind === "blueprint"
                                ? t("icon_layers", "layers")
                                : t("icon_inventory_2", "inventory_2")}
                            </span>
                          </div>
                          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                            <span className="text-sm font-black text-[var(--text)] truncate no-text-case">
                              {cardItem.title}
                            </span>
                            <span className="text-xs text-[var(--subtext)] truncate font-mono no-text-case">
                              {cardSubtitle}
                            </span>
                          </div>
                        </div>

                        <div className="ml-auto flex items-center gap-2 shrink-0">
                          {isUrl ? (
                            <ActionButton
                              variant="glass"
                              icon={t("icon_open_in_new", "open_in_new")}
                              label={t("btn_open", "Open")}
                              onClick={() => openSafeReferenceUrl(idToken)}
                            />
                          ) : (
                            <ActionButton
                              variant="glass"
                              icon={t("icon_menu_book", "menu_book")}
                              label={t("view_dossier", "View Dossier")}
                              onClick={() =>
                                setDossierTarget({
                                  item: cardItem,
                                  spokeGame:
                                    resolvedEntry?.spokeGame || gamesMap[sid] || null,
                                  preResolved: resolvedEntry?.preResolved,
                                })
                              }
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {notice.work_url && (
                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 no-text-case">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                      <span className="material-symbols-outlined !text-[18px]">
                        {t("icon_link", "link")}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <span className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest">
                        {t("dmca_work_url_opt_label", "Original Work / Reference URL")}
                      </span>
                      <span className="text-xs font-mono font-bold text-[var(--text)] truncate no-text-case">
                        {notice.work_url}
                      </span>
                    </div>
                  </div>

                  <div className="ml-auto flex items-center gap-2 shrink-0">
                    <ActionButton
                      variant="glass"
                      icon={t("icon_open_in_new", "open_in_new")}
                      label={t("dmca_open_reference_url", "Open Link")}
                      onClick={() => openSafeReferenceUrl(notice.work_url)}
                    />
                  </div>
                </div>
              )}

              {notice.work_description && (
                <div className="text-xs text-[var(--text)] leading-relaxed whitespace-pre-wrap break-words glass-surface rounded-xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] no-text-case">
                  {notice.work_description}
                </div>
              )}
            </UniversalGroup>

            {isReadOnlySpokeCopy ? (
              <UniversalGroup
                title={t("dmca_spoke_view_copy_title", "Partner Spoke Relay Copy (Read-Only)")}
                icon={t("icon_visibility", "visibility")}
              >
                <div className="glass-surface rounded-xl p-3.5 border border-[color-mix(in_srgb,var(--accent)_24%,transparent)] bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] flex items-start gap-2.5 text-xs no-text-case">
                  <span className="material-symbols-outlined !text-[18px] text-[var(--accent)] shrink-0 mt-0.5">
                    {t("icon_info", "info")}
                  </span>
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="font-black text-[var(--text)]">
                      {t(
                        "dmca_spoke_custody_note_title",
                        "Triaged Directly by Partner Spoke Wayfinder & Oversight"
                      )}
                    </span>
                    <span className="text-[11px] text-[var(--subtext)] leading-relaxed">
                      {t(
                        "dmca_spoke_custody_note_body",
                        "Sanctuary Foundry is non-custodial over Partner Spoke catalogs. This record is a read-only Keepers Core audit copy to track the 48-hour statutory relay SLA before Partner Spoke gateway review."
                      )}
                    </span>
                  </div>
                </div>

                {notice.resolution_notes && (
                  <div className="glass-surface rounded-xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-1 text-xs no-text-case">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                      {t("dmca_latest_spoke_note", "Recorded Spoke Triage Note")}
                    </span>
                    <span className="text-[var(--text)] leading-relaxed whitespace-pre-wrap break-words">
                      {notice.resolution_notes}
                    </span>
                  </div>
                )}
              </UniversalGroup>
            ) : (
              <UniversalGroup
                title={t("dmca_triage_actions_title", "Oversight & Wayfinder Triage Actions")}
                icon={t("icon_admin_panel_settings", "admin_panel_settings")}
              >
                {notice.resolution_notes && (
                  <div className="glass-surface rounded-xl p-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-1 text-xs no-text-case">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                      {t("dmca_prior_audit_note", "Prior Triage / Audit Note")}
                    </span>
                    <span className="text-[var(--text)] leading-relaxed whitespace-pre-wrap break-words">
                      {notice.resolution_notes}
                    </span>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1 leading-tight">
                    {t("dmca_triage_decision_label", "Triage Decision")}
                  </label>
                  <CustomDropdown
                    disableTint={true}
                    value={decision}
                    onChange={handleDecisionChange}
                    options={[
                      {
                        id: "VALIDATE_TAKEDOWN",
                        label: t("dmca_btn_validate_hold", "Validate & Soft-Hide (Tier 1)"),
                      },
                      {
                        id: "HOLD_VERIFY_AUTHORITY",
                        label: t("dmca_btn_hold_authority", "Hold — Verify Authority (Pause SLA)"),
                      },
                      {
                        id: "ACCEPT_COUNTER_NOTICE",
                        label: t("dmca_btn_accept_counter", "Start 10–14d Counter Window"),
                      },
                      {
                        id: "RESTORE_MATERIAL",
                        label: t("dmca_btn_restore_material", "Restore Material (Tier 0)"),
                      },
                      {
                        id: "REJECT_DEFECTIVE_ID",
                        label: t("dmca_opt_reject_defective_id", "Reject — § 512(c)(3) Fake / Defective Identity"),
                      },
                      {
                        id: "REJECT_NON_COPYRIGHT",
                        label: t("dmca_opt_reject_non_copyright", "Reject — § 102(b) Idea / Mechanics / Non-Copyrightable"),
                      },
                      {
                        id: "REJECT_OTHER",
                        label: t("dmca_opt_reject_other", "Reject — Other Statutory Deficiency"),
                      },
                    ]}
                  />
                </div>

                <UniversalTextArea
                  label={`${t("dmca_resolution_notes_label", "Triage Resolution / Audit Notes")} *`}
                  value={resolutionNotes}
                  onChange={setResolutionNotes}
                  className="min-h-[92px] no-text-case"
                  placeholder={t(
                    "dmca_resolution_notes_ph",
                    "Document statutory compliance evaluation, takedown window dates, or deficiency details..."
                  )}
                />

                <ActionButton
                  disabled={isActing || Boolean(missingTriageReason)}
                  onClick={handleApplyDecision}
                  variant={decision === "VALIDATE_TAKEDOWN" ? "danger" : "primary"}
                  className="w-full"
                  icon={isActing ? t("icon_sync", "sync") : t("icon_check_circle", "check_circle")}
                  label={
                    isActing
                      ? t("ui_btn_processing", "Processing...")
                      : t("dmca_apply_decision_btn", "Apply Triage Decision")
                  }
                  tooltip={missingTriageReason || undefined}
                />
              </UniversalGroup>
            )}
          </div>
        )}
      </SidePanel>

      <SpokeTargetDossierSidePanel
        isOpen={Boolean(dossierTarget)}
        onClose={() => setDossierTarget(null)}
        item={dossierTarget?.item || null}
        spokeGame={dossierTarget?.spokeGame || null}
        preResolved={dossierTarget?.preResolved}
        backdropZ="z-[50200]"
        panelZ="z-[50201]"
      />
    </>
  );
}

interface DmcaOversightQueueSectionProps {
  searchQuery?: string;
  filterGameId?: string;
  scopeFilter?: string;
  activityFilter?: "all" | "active" | "settled";
  isKeepersView?: boolean;
  onCountChange?: (activeCount: number) => void;
  onAvailableSpokesChange?: (spokes: Array<{ id: string; name: string }>) => void;
  onTriageCompleted?: () => void;
}

export default function DmcaOversightQueueSection({
  searchQuery = "",
  filterGameId,
  scopeFilter = "all",
  activityFilter = "all",
  isKeepersView = false,
  onCountChange,
  onAvailableSpokesChange,
  onTriageCompleted,
}: DmcaOversightQueueSectionProps) {
  const { t } = useLexicon();
  const [notices, setNotices] = useState<any[]>([]);
  const [gamesMap, setGamesMap] = useState<Record<string, any>>({});
  const [resolvedTargetsMap, setResolvedTargetsMap] = useState<
    Record<string, ResolvedDmcaTargetEntry>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [selectedNotice, setSelectedNotice] = useState<any | null>(null);
  const [allDrawerLane, setAllDrawerLane] = useState<DmcaLaneId | null>(null);

  const loadQueue = async () => {
    setIsLoading(true);
    try {
      const res = await fetchDmcaQueueNotices({
        filterGameId,
        isKeepersHub: Boolean(isKeepersView),
      });
      setNotices(res.notices);
      setGamesMap(res.gamesMap);
      setResolvedTargetsMap(res.resolvedTargetsMap);
      onCountChange?.(res.activeCount);

      if (onAvailableSpokesChange) {
        const spokeMap = new Map<string, string>();
        Object.values(res.gamesMap || {}).forEach((g: any) => {
          if (g?.id) spokeMap.set(String(g.id), String(g.name || g.schema_id || g.id));
        });
        (res.notices || []).forEach((n: any) => {
          const sid = String(n?.target_spoke_id || "").trim();
          if (sid && !spokeMap.has(sid)) {
            spokeMap.set(
              sid,
              String(n?.target_spoke_name || n?.metadata?.target_spoke_name || sid)
            );
          }
        });
        onAvailableSpokesChange(
          Array.from(spokeMap.entries()).map(([id, name]) => ({ id, name }))
        );
      }

      setSelectedNotice((prev: any) =>
        prev ? res.notices.find((n: any) => n.id === prev.id) || null : null
      );
    } catch (err: any) {
      useStore.getState().pushStatus(err?.message || String(err), "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, [filterGameId]);

  const filteredNotices = useMemo(
    () =>
      filterDmcaNotices(notices, {
        searchQuery,
        scopeFilter: isKeepersView ? scopeFilter : "all",
        resolvedTargetsMap,
        gamesMap,
      }),
    [notices, searchQuery, isKeepersView, scopeFilter, resolvedTargetsMap, gamesMap]
  );

  const lanes = useMemo(
    () => partitionDmcaNoticesByLane(filteredNotices, t),
    [filteredNotices, t]
  );

  if (isLoading) {
    return (
      <EmptyState
        icon={t("icon_sync", "sync")}
        title={t("comp_scanning", "Scanning...")}
      />
    );
  }

  const overdueCount = filteredNotices.filter((n) => Boolean(n?.is_sla_overdue)).length;
  const showActiveLanes = activityFilter === "all" || activityFilter === "active";
  const showSettledLane = activityFilter === "all" || activityFilter === "settled";

  return (
    <>
      <div className="flex flex-col gap-10 w-full">
        {showActiveLanes && (
          <div className="flex flex-col gap-4 w-full">
            <CommandScreenSectionHeading
              icon={t("icon_warning", "warning")}
              iconColorClass={
                overdueCount > 0
                  ? "text-[var(--danger)]"
                  : lanes.urgent.length > 0
                    ? "text-[var(--warning)]"
                    : "text-[var(--success)]"
              }
              title={t("dmca_lead_urgent_title", "Urgent & New Notices")}
              subtitle={t(
                "dmca_lead_urgent_callout",
                "Overdue & Soonest Expiring Timers Ranked First"
              )}
              onJump={() => setAllDrawerLane("urgent")}
              jumpTooltip={`${t("dmca_open_all_urgent", "View All Urgent")} (${lanes.urgent.length})`}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
              <DmcaLaneLeadCard
                lane="urgent"
                count={lanes.urgent.length}
                overdueCount={overdueCount}
                onClick={() => setAllDrawerLane("urgent")}
              />
              {lanes.urgent.slice(0, 2).map((notice) => (
                <DmcaNoticeCard
                  key={notice.id}
                  notice={notice}
                  resolvedTargetsMap={resolvedTargetsMap}
                  gamesMap={gamesMap}
                  showScopeChip={isKeepersView}
                  onSelect={setSelectedNotice}
                />
              ))}
            </div>
          </div>
        )}

        {showActiveLanes && (
          <div className="flex flex-col gap-4 w-full">
            <CommandScreenSectionHeading
              icon={t("icon_hourglass_top", "hourglass_top")}
              iconColorClass={
                lanes.pending.length > 0 ? "text-[var(--warning)]" : "text-[var(--accent)]"
              }
              title={t("dmca_lead_pending_title", "Pending & Counter Windows")}
              subtitle={t(
                "dmca_lead_pending_callout",
                "10–14 Business Day Window & Paused Holds"
              )}
              onJump={() => setAllDrawerLane("pending")}
              jumpTooltip={`${t("dmca_open_all_pending", "View All Pending")} (${lanes.pending.length})`}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
              <DmcaLaneLeadCard
                lane="pending"
                count={lanes.pending.length}
                onClick={() => setAllDrawerLane("pending")}
              />
              {lanes.pending.slice(0, 2).map((notice) => (
                <DmcaNoticeCard
                  key={notice.id}
                  notice={notice}
                  resolvedTargetsMap={resolvedTargetsMap}
                  gamesMap={gamesMap}
                  showScopeChip={isKeepersView}
                  onSelect={setSelectedNotice}
                />
              ))}
            </div>
          </div>
        )}

        {showSettledLane && (
          <div className="flex flex-col gap-4 w-full">
            <CommandScreenSectionHeading
              icon={t("icon_task_alt", "task_alt")}
              iconColorClass="text-[var(--success)]"
              title={t("dmca_lead_settled_title", "Settled & Archived Notices")}
              subtitle={t(
                "dmca_lead_settled_callout",
                "Restored Material & Rejected Deficient Notices"
              )}
              onJump={() => setAllDrawerLane("settled")}
              jumpTooltip={`${t("dmca_open_all_settled", "View Settled Archive")} (${lanes.settled.length})`}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
              <DmcaLaneLeadCard
                lane="settled"
                count={lanes.settled.length}
                onClick={() => setAllDrawerLane("settled")}
              />
              {lanes.settled.slice(0, 2).map((notice) => (
                <DmcaNoticeCard
                  key={notice.id}
                  notice={notice}
                  resolvedTargetsMap={resolvedTargetsMap}
                  gamesMap={gamesMap}
                  showScopeChip={isKeepersView}
                  onSelect={setSelectedNotice}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <DmcaAllNoticesSidePanel
        isOpen={Boolean(allDrawerLane)}
        onClose={() => setAllDrawerLane(null)}
        initialLane={allDrawerLane || "urgent"}
        notices={notices}
        resolvedTargetsMap={resolvedTargetsMap}
        gamesMap={gamesMap}
        isKeepersView={isKeepersView}
        initialScopeFilter={isKeepersView ? scopeFilter : "all"}
        onSelectNotice={setSelectedNotice}
        onRefresh={loadQueue}
      />

      <DmcaNoticeReviewSidePanel
        notice={selectedNotice}
        isOpen={Boolean(selectedNotice)}
        onClose={() => setSelectedNotice(null)}
        resolvedTargetsMap={resolvedTargetsMap}
        gamesMap={gamesMap}
        isKeepersView={isKeepersView}
        onRefresh={loadQueue}
        onTriageCompleted={onTriageCompleted}
      />
    </>
  );
}
