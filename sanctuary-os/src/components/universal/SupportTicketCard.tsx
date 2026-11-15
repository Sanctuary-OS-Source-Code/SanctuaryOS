import React from "react";
import { UniversalCard } from "./UniversalCard";
import { VAULT_CHIP_CLASS } from "../../shared-components/constants";

export interface TicketSupporterFlags {
  isPriority: boolean;
  isMasonSupporter: boolean;
  masonSupporterName: string | null;
  isSpokeSupporter: boolean;
  spokeSupporterName: string | null;
  isFoundryPatron: boolean;
}

export interface TicketSupporterFallback {
  isMasonSupporter?: boolean;
  masonSupporterName?: string | null;
  isSpokeSupporter?: boolean;
  spokeSupporterName?: string | null;
  isFoundryPatron?: boolean;
}

export function getTicketSupporterFlags(
  ticket: any,
  fallback?: TicketSupporterFallback
): TicketSupporterFlags {
  const meta = ticket?.metadata || {};
  const isMasonSupporter = Boolean(
    meta.priority_ticket ||
      meta.is_mason_supporter ||
      meta.expedited_support ||
      fallback?.isMasonSupporter
  );
  const masonSupporterName =
    String(meta.mason_supporter_name || meta.mason_name || fallback?.masonSupporterName || "").trim() ||
    null;
  const isSpokeSupporter = Boolean(
    meta.is_spoke_supporter || fallback?.isSpokeSupporter
  );
  const spokeSupporterName =
    String(meta.spoke_supporter_name || fallback?.spokeSupporterName || "").trim() || null;
  const isFoundryPatron = Boolean(
    meta.is_foundry_patron || fallback?.isFoundryPatron
  );
  const isPriority = Boolean(
    meta.priority_ticket || meta.urgent || isMasonSupporter
  );
  return {
    isPriority,
    isMasonSupporter,
    masonSupporterName,
    isSpokeSupporter,
    spokeSupporterName,
    isFoundryPatron,
  };
}

export function getTicketPriorityRank(
  ticket: any,
  fallback?: TicketSupporterFallback
): number {
  const flags = getTicketSupporterFlags(ticket, fallback);
  if (flags.isMasonSupporter || ticket?.metadata?.urgent) return 3;
  if (flags.isSpokeSupporter) return 2;
  if (flags.isFoundryPatron) return 1;
  return 0;
}

export function sortTicketsPriorityFirst<T = any>(
  tickets: T[],
  getFallback?: (ticket: T) => TicketSupporterFallback | undefined
): T[] {
  return [...tickets].sort((a: any, b: any) => {
    const rankDiff =
      getTicketPriorityRank(b, getFallback?.(b)) -
      getTicketPriorityRank(a, getFallback?.(a));
    if (rankDiff !== 0) return rankDiff;
    const ta = new Date(a?.created_at || 0).getTime() || 0;
    const tb = new Date(b?.created_at || 0).getTime() || 0;
    return tb - ta;
  });
}

export interface SupportTicketCardProps {
  ticket: any;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  t: (key: string, fallback?: string) => string;
  claimedBySelf?: boolean;
  resolvedModName?: string | null;
  supporterFallback?: TicketSupporterFallback;
  replyCount?: number | null;
  authorLabel?: string | null;
  categoryLabel?: string | null;
}

export const SupportTicketCard: React.FC<SupportTicketCardProps> = ({
  ticket,
  onClick,
  onContextMenu,
  t,
  claimedBySelf = false,
  resolvedModName,
  supporterFallback,
  replyCount,
  authorLabel,
  categoryLabel,
}) => {
  const flags = getTicketSupporterFlags(ticket, supporterFallback);
  const statusStr = String(ticket?.status || "open").toLowerCase();
  const isResolved =
    statusStr === "closed" ||
    statusStr === "resolved" ||
    statusStr === "solved";
  const isRejected = statusStr === "rejected";
  const isEscalated = statusStr === "escalated";
  const isInProgress =
    statusStr === "in_progress" ||
    statusStr === "in progress" ||
    statusStr === "under_review" ||
    statusStr === "pending" ||
    statusStr === "investigating" ||
    statusStr === "claimed";

  let statusLabel = t("ticket_status_open", "Open");
  let statusIcon = flags.isPriority ? t("icon_bolt", "bolt") : t("icon_inbox", "inbox");
  let statusIconColor = flags.isPriority ? "text-[var(--warning)]" : "text-[var(--accent)]";

  if (claimedBySelf && !isResolved && !isRejected) {
    statusLabel = t("ticket_tab_claimed", "Claimed");
    statusIcon = t("icon_assignment_ind", "assignment_ind");
    statusIconColor = "text-[var(--warning)]";
  } else if (isResolved) {
    statusLabel =
      statusStr === "closed"
        ? t("ticket_status_closed", "Closed")
        : t("ticket_status_resolved", "Resolved");
    statusIcon = t("icon_done_all", "done_all");
    statusIconColor = "text-[var(--success)]";
  } else if (isRejected) {
    statusLabel = t("ticket_status_rejected", "Rejected");
    statusIcon = t("icon_close", "close");
    statusIconColor = "text-[var(--danger)]";
  } else if (isEscalated) {
    statusLabel = t("ticket_status_escalated", "Escalated");
    statusIcon = t("icon_trending_up", "trending_up");
    statusIconColor = "text-[var(--warning)]";
  } else if (isInProgress) {
    statusLabel = t("ticket_status_in_progress", "In Progress");
    statusIcon = t("icon_hourglass_top", "hourglass_top");
    statusIconColor = "text-[var(--warning)]";
  }

  const statusColor = isResolved
    ? "success"
    : isRejected
      ? "danger"
      : flags.isPriority || isEscalated || isInProgress || claimedBySelf
        ? "warning"
        : "accent";

  const rawCategory =
    categoryLabel || ticket?.ticket_type || ticket?.category || "";
  const formattedCategory = String(rawCategory).replace(/_/g, " ").trim();

  const cardIcon = flags.isPriority
    ? t("icon_bolt", "bolt")
    : formattedCategory.toLowerCase().includes("bug")
      ? t("icon_bug_report", "bug_report")
      : t("icon_confirmation_number", "confirmation_number");

  const cleanTitle = String(
    ticket?.title || categoryLabel || t("support_ticket", "Support Ticket")
  ).trim();
  const rawDesc = String(ticket?.description || "").trim();
  const hasDistinctDesc =
    rawDesc.length > 0 && rawDesc.toLowerCase() !== cleanTitle.toLowerCase();

  const authorText =
    authorLabel ||
    ticket?.author_username ||
    ticket?.metadata?.author_username ||
    null;
  const shortId = ticket?.id ? `#${String(ticket.id).slice(0, 8)}` : "";
  const categorySubtitle =
    formattedCategory && formattedCategory.toLowerCase() !== cleanTitle.toLowerCase()
      ? formattedCategory
      : null;
  const subtitle = [authorText, categorySubtitle, shortId].filter(Boolean).join(" • ");

  const targetModDisplay =
    resolvedModName ||
    ticket?.target_mod_name ||
    ticket?.metadata?.target_mod_name ||
    null;
  const rawTargetModId = ticket?.target_mod_id || ticket?.metadata?.target_mod_id;
  const modLineLabel =
    targetModDisplay || (rawTargetModId ? `#${String(rawTargetModId).slice(0, 8)}` : null);

  let supporterBadge: React.ReactNode = null;
  if (flags.isMasonSupporter) {
    supporterBadge = (
      <span className={VAULT_CHIP_CLASS}>
        <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
          {t("icon_bolt", "bolt")}
        </span>
        <span className="truncate max-w-[200px]">
          {flags.masonSupporterName
            ? `${t("ticket_badge_mason_priority", "Priority • {Mason} Supporter")} (${flags.masonSupporterName})`
            : t("ticket_badge_mason_priority", "Priority • {Mason} Supporter")}
        </span>
      </span>
    );
  } else if (flags.isSpokeSupporter) {
    supporterBadge = (
      <span className={VAULT_CHIP_CLASS}>
        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
          {t("icon_favorite", "favorite")}
        </span>
        <span>{t("ticket_badge_spoke_supporter", "Spoke Supporter")}</span>
      </span>
    );
  } else if (flags.isFoundryPatron) {
    supporterBadge = (
      <span className={VAULT_CHIP_CLASS}>
        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
          {t("icon_workspace_premium", "workspace_premium")}
        </span>
        <span>{t("supporter_patron_badge_label", "Foundry Supporter")}</span>
      </span>
    );
  }

  const totalReplies =
    typeof replyCount === "number"
      ? replyCount
      : typeof ticket?.reply_count === "number"
        ? ticket.reply_count
        : Array.isArray(ticket?.messages)
          ? ticket.messages.length
          : 0;

  return (
    <UniversalCard
      layout="vertical"
      headerStyle="inline"
      onClick={onClick}
      onContextMenu={onContextMenu}
      statusColor={statusColor}
      isGhosted={isResolved || isRejected}
      icon={cardIcon}
      title={cleanTitle}
      subtitle={subtitle}
      description={
        modLineLabel || hasDistinctDesc ? (
          <div className="flex flex-col gap-1.5 min-w-0 w-full pt-0.5">
            {modLineLabel && (
              <div className="flex items-center gap-1.5 min-w-0 text-[11px] font-semibold text-[var(--text)] opacity-90">
                <span className="material-symbols-outlined !text-[13px] text-[var(--accent)] shrink-0">
                  {t("icon_extension", "extension")}
                </span>
                <span className="truncate">{modLineLabel}</span>
              </div>
            )}
            {hasDistinctDesc && (
              <p className="text-xs text-[var(--subtext)] opacity-85 line-clamp-2 leading-relaxed">
                {rawDesc}
              </p>
            )}
          </div>
        ) : undefined
      }
      imageOverlay={
        <div className="flex items-center justify-end">
          <span className={VAULT_CHIP_CLASS}>
            <span className={`material-symbols-outlined !text-[12px] ${statusIconColor}`}>
              {statusIcon}
            </span>
            <span>{statusLabel}</span>
          </span>
        </div>
      }
      badges={supporterBadge || undefined}
      footer={
        <div className="flex justify-between items-center gap-2 w-full">
          <div className="flex items-center gap-3 min-w-0 text-[10px] font-bold text-[var(--subtext)] opacity-75">
            {ticket?.created_at && (
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined !text-[13px]">
                  {t("icon_calendar_today", "calendar_today")}
                </span>
                <span>{new Date(ticket.created_at).toLocaleDateString()}</span>
              </span>
            )}
            {totalReplies > 0 && (
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined !text-[13px]">
                  {t("icon_chat_bubble_outline", "chat_bubble_outline")}
                </span>
                <span>{totalReplies}</span>
              </span>
            )}
          </div>
          <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] tracking-wider uppercase transition-all flex items-center gap-1 opacity-75 group-hover:opacity-100 shrink-0">
            <span>{t("view_ticket", "View Ticket")}</span>
            <span className="material-symbols-outlined !text-[13px]">
              {t("icon_arrow_forward", "arrow_forward")}
            </span>
          </span>
        </div>
      }
    />
  );
};
