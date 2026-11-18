import { useEffect, useState } from "react";
import { useLexicon } from "../../LexiconContext";
import { useStore } from "../../store";
import { supabaseAuth } from "../../supabase";
import {
  ActionButton,
  EmptyState,
  PanelHeaderButton,
  PanelHeaderGroup,
  SidePanel,
  SidePanelHeroCard,
  VAULT_CHIP_CLASS,
} from "../../shared";
import { UniversalCard } from "../../components/universal/UniversalCard";
import {
  UniversalGroup,
  UniversalTextArea,
} from "../../components/universal/UniversalLayout";
import { HubListGrid } from "../../components/layouts/ElevatedHubLayout";

interface DmcaOversightQueueSectionProps {
  searchQuery?: string;
  filterGameId?: string;
  onCountChange?: (activeCount: number) => void;
  onTriageCompleted?: () => void;
}

function getNoticeStatusMeta(notice: any, t: (k: string, f?: string) => string) {
  const status = String(notice?.relay_status || "OPEN").toUpperCase();
  if (notice?.is_sla_overdue) {
    return {
      label: t("dmca_status_sla_overdue", "48h SLA Overdue"),
      color: "danger" as const,
      iconName: t("icon_gavel", "gavel"),
      iconColorClass: "text-[var(--danger)]",
    };
  }
  switch (status) {
    case "SPOKE_PENDING_SLA":
      return {
        label: t("dmca_status_spoke_sla", "48h Spoke SLA"),
        color: "warning" as const,
        iconName: t("icon_schedule", "schedule"),
        iconColorClass: "text-[var(--warning)]",
      };
    case "VALIDATED_HOLD":
      return {
        label: t("dmca_status_tier6_hold", "Tier 6 Hold (10–14d)"),
        color: "warning" as const,
        iconName: t("icon_policy", "policy"),
        iconColorClass: "text-[var(--warning)]",
      };
    case "COUNTER_NOTICE_PENDING_10_14D":
      return {
        label: t("dmca_status_counter_window", "Counter Window (10–14d)"),
        color: "accent" as const,
        iconName: t("icon_hourglass_top", "hourglass_top"),
        iconColorClass: "text-[var(--accent)]",
      };
    case "RESTORED":
      return {
        label: t("dmca_status_restored", "Restored (Tier 0)"),
        color: "success" as const,
        iconName: t("icon_check_circle", "check_circle"),
        iconColorClass: "text-[var(--success)]",
      };
    case "REJECTED_INVALID":
      return {
        label: t("dmca_status_rejected", "Rejected Invalid"),
        color: "success" as const,
        iconName: t("icon_cancel", "cancel"),
        iconColorClass: "text-[var(--subtext)]",
      };
    default:
      return {
        label: t("dmca_status_open", "Pending Review"),
        color: "accent" as const,
        iconName: t("icon_gavel", "gavel"),
        iconColorClass: "text-[var(--accent)]",
      };
  }
}

function formatRemainingWindow(deadlineIso?: string | null): string {
  if (!deadlineIso) return "";
  const diffMs = new Date(deadlineIso).getTime() - Date.now();
  const absHours = Math.round(Math.abs(diffMs) / (60 * 60 * 1000));
  if (diffMs <= 0) return `${absHours}h overdue`;
  if (absHours >= 48) return `${Math.ceil(absHours / 24)}d left`;
  return `${absHours}h left`;
}

export default function DmcaOversightQueueSection({
  searchQuery = "",
  filterGameId,
  onCountChange,
  onTriageCompleted,
}: DmcaOversightQueueSectionProps) {
  const { t } = useLexicon();
  const [notices, setNotices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedNotice, setSelectedNotice] = useState<any | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [isActing, setIsActing] = useState(false);

  const resolveGatewayGameId = (): string | undefined => {
    const state = useStore.getState();
    const activeWs = Array.isArray(state.workspaces)
      ? state.workspaces.find((w: any) => w.id === state.activeWorkspaceId)
      : null;
    const candidate =
      filterGameId ||
      activeWs?.game_id ||
      activeWs?.schema_id ||
      state.activeGameSchema?.id ||
      (state.activeWorkspaceId !== "default_workspace" &&
      state.activeWorkspaceId !== "web"
        ? state.activeWorkspaceId
        : undefined);
    return candidate ? String(candidate) : undefined;
  };

  const fetchNotices = async () => {
    setIsLoading(true);
    try {
      const token = useStore.getState().session?.access_token || "";
      const targetGameId = resolveGatewayGameId();
      const { data, error } = await supabaseAuth.functions.invoke("game-gateway", {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: {
          ...(targetGameId ? { game_id: targetGameId } : {}),
          action: "list_spoke_dmca_notices",
          payload: {
            ...(filterGameId ? { filter_game_id: filterGameId } : {}),
          },
        },
      });
      if (error || data?.error) {
        throw new Error(error?.message || data?.error || "Failed to load DMCA queue");
      }
      const rows = Array.isArray(data?.notices) ? data.notices : [];
      setNotices(rows);
      const pendingCount = rows.filter((r: any) =>
        ["OPEN", "SPOKE_PENDING_SLA", "VALIDATED_HOLD", "COUNTER_NOTICE_PENDING_10_14D"].includes(
          String(r?.relay_status || "").toUpperCase()
        )
      ).length;
      onCountChange?.(pendingCount);
    } catch (err: any) {
      useStore
        .getState()
        .pushStatus(err?.message || String(err), "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNotices();
  }, [filterGameId]);

  const handleTriage = async (
    triageAction:
      | "VALIDATE_TAKEDOWN"
      | "REJECT_NOTICE"
      | "ACCEPT_COUNTER_NOTICE"
      | "RESTORE_MATERIAL"
  ) => {
    if (!selectedNotice || isActing) return;
    if (triageAction === "REJECT_NOTICE" && !resolutionNotes.trim()) {
      useStore
        .getState()
        .pushStatus(
          t("identities_req_reason", "Reason is required."),
          "warning"
        );
      return;
    }

    setIsActing(true);
    try {
      const token = useStore.getState().session?.access_token || "";
      const targetGameId =
        selectedNotice.target_spoke_id || resolveGatewayGameId();
      const { data, error } = await supabaseAuth.functions.invoke("game-gateway", {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: {
          ...(targetGameId ? { game_id: targetGameId } : {}),
          action: "execute_dmca_triage_action",
          payload: {
            notice_id: selectedNotice.id,
            triage_action: triageAction,
            resolution_notes: resolutionNotes.trim(),
          },
        },
      });
      if (error || data?.error || data?.ok === false) {
        throw new Error(error?.message || data?.error || "Failed to triage notice");
      }

      useStore
        .getState()
        .pushStatus(
          triageAction === "VALIDATE_TAKEDOWN"
            ? t(
                "dmca_triage_validated_toast",
                "DMCA takedown validated — target soft-delisted (Tier 6) and public {Blueprint} hashes stripped."
              )
            : triageAction === "RESTORE_MATERIAL"
              ? t(
                  "dmca_triage_restored_toast",
                  "Material restored to public visibility (Tier 0) and strike adjusted."
                )
              : triageAction === "ACCEPT_COUNTER_NOTICE"
                ? t(
                    "dmca_triage_counter_toast",
                    "Counter-notice accepted — 10–14 business day statutory clock started."
                  )
                : t("dmca_triage_rejected_toast", "DMCA notice rejected as incomplete/invalid."),
          "success"
        );
      setSelectedNotice(null);
      setResolutionNotes("");
      await fetchNotices();
      onTriageCompleted?.();
    } catch (err: any) {
      useStore.getState().pushStatus(err?.message || String(err), "error");
    } finally {
      setIsActing(false);
    }
  };

  const q = searchQuery.trim().toLowerCase();
  const filteredNotices = notices.filter((n) => {
    if (!q) return true;
    const hay = [
      n.id,
      n.notice_type,
      n.claimant_name_masked,
      n.reply_email_masked,
      n.work_description,
      n.work_url,
      n.relay_status,
      ...(Array.isArray(n.target_identifiers) ? n.target_identifiers : []),
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });

  if (isLoading) {
    return (
      <EmptyState
        icon={t("icon_sync", "sync")}
        title={t("comp_scanning", "Scanning...")}
      />
    );
  }

  return (
    <>
      <HubListGrid
        isEmpty={filteredNotices.length === 0}
        emptyIcon={t("icon_gavel", "gavel")}
        emptyTitle={t("dmca_queue_empty", "No DMCA or Legal Compliance Notices")}
      >
        {filteredNotices.map((notice) => {
          const meta = getNoticeStatusMeta(notice, t);
          const identifiers: string[] = Array.isArray(notice.target_identifiers)
            ? notice.target_identifiers
            : [];
          const typeLabel =
            notice.notice_type === "dmca_takedown"
              ? t("dmca_flow_takedown_label", "DMCA Takedown")
              : notice.notice_type === "dmca_counter"
                ? t("dmca_flow_counter_label", "Counter-Notice")
                : t("dmca_flow_privacy_label", "Privacy & Legal");
          const countdownText = notice.sla_deadline_at
            ? formatRemainingWindow(notice.sla_deadline_at)
            : notice.counter_window_ends_at
              ? formatRemainingWindow(notice.counter_window_ends_at)
              : "";

          return (
            <UniversalCard
              key={notice.id}
              layout="vertical"
              statusColor={meta.color}
              icon={meta.iconName}
              bannerTopLabel={typeLabel}
              bannerTopRightLabel={countdownText || `#${String(notice.id).slice(0, 8)}`}
              bannerBottomLabel={
                identifiers.length > 0
                  ? identifiers.join(", ")
                  : notice.claimant_name_masked || ""
              }
              title={
                notice.decrypted_contact?.full_legal_name ||
                notice.claimant_name_masked ||
                `Notice #${String(notice.id).slice(0, 8)}`
              }
              subtitle={
                <span className="no-text-case font-mono text-[11px]">
                  {notice.metadata?.target_spoke_name || t("dmca_scope_core", "Keepers Core")}{" "}
                  &bull; {notice.reply_email_masked || ""}
                </span>
              }
              description={
                notice.work_description ? (
                  <span className="line-clamp-2 text-xs text-[var(--subtext)]">
                    {notice.work_description}
                  </span>
                ) : undefined
              }
              imageOverlay={
                <div className="absolute top-2.5 left-3 flex flex-nowrap items-center gap-1.5 max-w-[calc(100%-6.5rem)] z-30 pointer-events-none">
                  <span className={VAULT_CHIP_CLASS}>
                    <span
                      className={`material-symbols-outlined !text-[12px] ${meta.iconColorClass}`}
                    >
                      {meta.iconName}
                    </span>
                    <span>{meta.label}</span>
                  </span>
                </div>
              }
              badges={
                <>
                  {identifiers.slice(0, 2).map((ident) => (
                    <span key={ident} className={VAULT_CHIP_CLASS}>
                      <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                        {t("icon_fingerprint", "fingerprint")}
                      </span>
                      <span className="no-text-case font-mono">
                        {ident.length > 14 ? `${ident.slice(0, 12)}...` : ident}
                      </span>
                    </span>
                  ))}
                  {countdownText && (
                    <span className={VAULT_CHIP_CLASS}>
                      <span
                        className={`material-symbols-outlined !text-[12px] ${
                          notice.is_sla_overdue
                            ? "text-[var(--danger)]"
                            : "text-[var(--warning)]"
                        }`}
                      >
                        {t("icon_timer", "timer")}
                      </span>
                      <span className="no-text-case">{countdownText}</span>
                    </span>
                  )}
                </>
              }
              onClick={() => {
                setSelectedNotice(notice);
                setResolutionNotes(notice.resolution_notes || "");
              }}
              footer={
                <div className="flex items-center justify-between gap-2 w-full">
                  <span className="text-[10px] font-bold text-[var(--subtext)] opacity-80">
                    {notice.created_at
                      ? new Date(notice.created_at).toLocaleDateString()
                      : ""}
                  </span>
                  <span className="text-[10px] font-black text-[var(--text)] group-hover/card:text-[var(--accent)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover/card:opacity-100 group-hover:opacity-100 translate-x-2 group-hover/card:translate-x-0 group-hover:translate-x-0 shrink-0">
                    <span>{t("dmca_review_notice_btn", "Review Notice")}</span>
                    <span className="text-base leading-none">&rarr;</span>
                  </span>
                </div>
              }
            />
          );
        })}
      </HubListGrid>

      <SidePanel
        isOpen={Boolean(selectedNotice)}
        onClose={() => setSelectedNotice(null)}
        title={t("dmca_admin_panel_title", "DMCA & Legal Notice")}
        subtitle={
          selectedNotice
            ? `#${String(selectedNotice.id).slice(0, 8)} • ${selectedNotice.relay_status}`
            : ""
        }
        icon={t("icon_gavel", "gavel")}
        iconColorClass="text-[var(--warning)]"
        widthClass="w-[92vw] md:w-[740px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_refresh", "refresh")}
              tooltip={t("refresh", "Refresh")}
              onClick={fetchNotices}
            />
          </PanelHeaderGroup>
        }
      >
        {selectedNotice && (
          <div className="flex flex-col gap-4 pb-8">
            <SidePanelHeroCard
              icon={t("icon_copyright", "copyright")}
              overline={
                selectedNotice.metadata?.target_spoke_name ||
                t("dmca_scope_core", "Keepers Core")
              }
              title={
                selectedNotice.decrypted_contact?.full_legal_name ||
                selectedNotice.claimant_name_masked ||
                selectedNotice.id
              }
              badge={getNoticeStatusMeta(selectedNotice, t).label}
              badgeIcon={getNoticeStatusMeta(selectedNotice, t).iconName}
              variant={selectedNotice.is_sla_overdue ? "danger" : "warning"}
            />

            <UniversalGroup
              title={t("dmca_admin_sec_contact", "Claimant Contact Information")}
              icon={t("icon_badge", "badge")}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-[10px] font-black uppercase text-[var(--subtext)]">
                    {t("dmca_legal_name_label", "Full Legal Name")}
                  </span>
                  <div className="font-bold text-[var(--text)] mt-0.5">
                    {selectedNotice.decrypted_contact?.full_legal_name ||
                      selectedNotice.claimant_name_masked}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase text-[var(--subtext)]">
                    {t("dmca_email_short_label", "Email Address")}
                  </span>
                  <div className="font-mono font-bold text-[var(--text)] no-text-case mt-0.5 break-all">
                    {selectedNotice.decrypted_contact?.email ||
                      selectedNotice.reply_email_masked}
                  </div>
                </div>
                {selectedNotice.decrypted_contact?.company_or_agent && (
                  <div>
                    <span className="text-[10px] font-black uppercase text-[var(--subtext)]">
                      {t("dmca_company_agent_label", "Company / Organization (Optional)")}
                    </span>
                    <div className="font-bold text-[var(--text)] mt-0.5">
                      {selectedNotice.decrypted_contact.company_or_agent}
                    </div>
                  </div>
                )}
                {selectedNotice.decrypted_contact?.phone && (
                  <div>
                    <span className="text-[10px] font-black uppercase text-[var(--subtext)]">
                      {t("dmca_phone_label", "Phone Number")}
                    </span>
                    <div className="font-mono font-bold text-[var(--text)] no-text-case mt-0.5">
                      {selectedNotice.decrypted_contact.phone}
                    </div>
                  </div>
                )}
              </div>
              {selectedNotice.decrypted_contact?.physical_address && (
                <div className="text-xs mt-2">
                  <span className="text-[10px] font-black uppercase text-[var(--subtext)]">
                    {t("dmca_physical_address_label", "Mailing Address")}
                  </span>
                  <div className="font-medium text-[var(--text)] whitespace-pre-wrap mt-0.5 no-text-case">
                    {selectedNotice.decrypted_contact.physical_address}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-2 mt-2">
                {selectedNotice.good_faith_attested && (
                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                      {t("icon_check_circle", "check_circle")}
                    </span>
                    <span>{t("dmca_good_faith_signed", "Good-Faith Attested")}</span>
                  </span>
                )}
                {selectedNotice.perjury_authority_attested && (
                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                      {t("icon_gavel", "gavel")}
                    </span>
                    <span>{t("dmca_perjury_signed", "Perjury & Authority Attested")}</span>
                  </span>
                )}
                <span className={VAULT_CHIP_CLASS}>
                  <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                    {t("icon_draw", "draw")}
                  </span>
                  <span className="no-text-case">
                    {selectedNotice.electronic_signature}
                  </span>
                </span>
              </div>
            </UniversalGroup>

            <UniversalGroup
              title={t("dmca_admin_sec_targets", "Reported Content & Reference")}
              icon={t("icon_fingerprint", "fingerprint")}
            >
              <div className="flex flex-wrap gap-2">
                {(selectedNotice.target_identifiers || []).map((idToken: string) => (
                  <span key={idToken} className={VAULT_CHIP_CLASS}>
                    <span className="no-text-case font-mono">{idToken}</span>
                  </span>
                ))}
              </div>
              {selectedNotice.work_url && (
                <a
                  href={selectedNotice.work_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-[var(--accent)] hover:underline no-text-case break-all mt-1 inline-block"
                >
                  {selectedNotice.work_url}
                </a>
              )}
              {selectedNotice.work_description && (
                <div className="text-xs text-[var(--text)] leading-relaxed whitespace-pre-wrap break-words mt-2 glass-surface rounded-xl p-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                  {selectedNotice.work_description}
                </div>
              )}
            </UniversalGroup>

            <UniversalGroup
              title={t("dmca_triage_actions_title", "Oversight & Wayfinder Triage Actions")}
              icon={t("icon_admin_panel_settings", "admin_panel_settings")}
            >
              <UniversalTextArea
                label={t("dmca_resolution_notes_label", "Triage Resolution / Audit Notes (Required for Rejection)")}
                value={resolutionNotes}
                onChange={setResolutionNotes}
                className="min-h-[84px]"
                placeholder={t(
                  "dmca_resolution_notes_ph",
                  "Document statutory compliance evaluation, takedown window dates, or deficiency details..."
                )}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <ActionButton
                  disabled={isActing}
                  onClick={() => handleTriage("VALIDATE_TAKEDOWN")}
                  variant="danger"
                  icon={t("icon_policy", "policy")}
                  label={t(
                    "dmca_btn_validate_hold",
                    "Validate & Soft-Hide (Tier 6)"
                  )}
                />
                <ActionButton
                  disabled={isActing}
                  onClick={() => handleTriage("ACCEPT_COUNTER_NOTICE")}
                  variant="primary"
                  icon={t("icon_hourglass_top", "hourglass_top")}
                  label={t(
                    "dmca_btn_accept_counter",
                    "Start 10–14d Counter Window"
                  )}
                />
                <ActionButton
                  disabled={isActing}
                  onClick={() => handleTriage("RESTORE_MATERIAL")}
                  variant="glass"
                  icon={t("icon_restore", "restore")}
                  label={t(
                    "dmca_btn_restore_material",
                    "Restore Material (Tier 0)"
                  )}
                />
                <ActionButton
                  disabled={isActing || !resolutionNotes.trim()}
                  onClick={() => handleTriage("REJECT_NOTICE")}
                  variant="glass"
                  icon={t("icon_cancel", "cancel")}
                  label={t(
                    "dmca_btn_reject_invalid",
                    "Reject Incomplete Notice"
                  )}
                />
              </div>
            </UniversalGroup>
          </div>
        )}
      </SidePanel>
    </>
  );
}
