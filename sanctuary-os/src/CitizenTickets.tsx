import { useState, useEffect } from "react";
import { useLexicon } from "./LexiconContext";
import { EmptyState, InlineFilterGroup, ActionPill, HoverTooltip } from "./shared";
import { supabase, supabaseAuth } from "./supabase";
import { useStore } from "./store";
import { UniversalCard } from "./components/universal/UniversalCard";

export interface Ticket {
  id: string;
  author_id: string;
  status: string;
  ticket_type: string;
  title: string;
  description: string;
  created_at: string;
  metadata?: any;
  table_name?: "sanctuary_tickets" | "keeper_tickets";
}

interface CitizenTicketsProps {
  userId: string;
  onSelectTicket?: (ticket: Ticket) => void;
  onOpenNewTicket?: () => void;
  isSidePanel?: boolean;
  tableName?: "sanctuary_tickets" | "keeper_tickets";
  externalTickets?: Ticket[];
  embedded?: boolean;
  hideActionPill?: boolean;
  externalSearch?: string;
  externalFilter?: "all" | "open" | "pending" | "closed";
  onCountChange?: (count: number) => void;
}

const VAULT_CHIP_CLASS = "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

export default function CitizenTickets({
  userId,
  onSelectTicket,
  onOpenNewTicket,
  isSidePanel = false,
  tableName = "sanctuary_tickets",
  externalTickets,
  embedded = false,
  hideActionPill,
  externalSearch,
  externalFilter,
  onCountChange,
}: CitizenTicketsProps) {
  const { t } = useLexicon();
  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);
  const [tickets, setTickets] = useState<Ticket[]>(externalTickets || []);
  const [isLoading, setIsLoading] = useState(externalTickets === undefined);
  const [activeFilter, setActiveFilter] = useState<"all" | "open" | "pending" | "closed">("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (externalTickets !== undefined) {
      setTickets(externalTickets);
      setIsLoading(false);
      onCountChange?.(externalTickets.length);
      return;
    }

    let isMounted = true;
    const fetchTickets = async () => {
      if (!userId) {
        if (isMounted) {
          setTickets([]);
          setIsLoading(false);
          onCountChange?.(0);
        }
        return;
      }

      const CACHE_TTL = 2 * 60 * 1000;
      const cache = (window as any).__sanctuaryCache?.support as Record<string, any> | undefined;
      const cacheKey = tableName === "keeper_tickets"
        ? `coreTickets_${userId}`
        : `spokeTickets_${activeWorkspaceId || "default"}_${userId}`;
      const lastFetchKey = `${cacheKey}_lastFetch`;

      if (cache?.[cacheKey] && Array.isArray(cache[cacheKey]) && cache[cacheKey].length > 0) {
        if (isMounted) {
          setTickets(cache[cacheKey]);
          onCountChange?.(cache[cacheKey].length);
        }
        if (performance.now() - (cache[lastFetchKey] || 0) < CACHE_TTL) {
          if (isMounted) setIsLoading(false);
          return;
        }
      } else if (isMounted) {
        setIsLoading(true);
      }

      try {
        const client = tableName === "keeper_tickets" ? supabaseAuth : supabase;
        const { data, error } = await client
          .from(tableName)
          .select("*")
          .eq("author_id", userId)
          .order("created_at", { ascending: false });

        if (!isMounted) return;
        if (data && !error) {
          const normalized = (data as Ticket[]).map((tk) => ({
            ...tk,
            table_name: tableName,
          }));
          setTickets(normalized);
          onCountChange?.(normalized.length);
          if ((window as any).__sanctuaryCache?.support) {
            (window as any).__sanctuaryCache.support[cacheKey] = normalized;
            (window as any).__sanctuaryCache.support[lastFetchKey] = performance.now();
          }
        }
      } catch (err) {
        console.error(`[CitizenTickets] Failed to fetch ${tableName}:`, err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchTickets();

    const handleRefresh = () => {
      if ((window as any).__sanctuaryCache?.support) {
        const cacheKey = tableName === "keeper_tickets"
          ? `coreTickets_${userId}`
          : `spokeTickets_${activeWorkspaceId || "default"}_${userId}`;
        delete (window as any).__sanctuaryCache.support[`${cacheKey}_lastFetch`];
      }
      fetchTickets();
    };
    window.addEventListener("sanctuary-tickets-updated", handleRefresh);
    return () => {
      isMounted = false;
      window.removeEventListener("sanctuary-tickets-updated", handleRefresh);
    };
  }, [userId, tableName, activeWorkspaceId, externalTickets]);

  const effectiveSearch = externalSearch !== undefined ? externalSearch : searchQuery;
  const effectiveFilter = externalFilter !== undefined ? externalFilter : activeFilter;
  const shouldHideActionPill = hideActionPill ?? embedded;

  const filteredTickets = tickets.filter((ticket) => {
    if (effectiveSearch) {
      const q = effectiveSearch.toLowerCase();
      const matchesTitle = ticket.title?.toLowerCase().includes(q);
      const matchesType = ticket.ticket_type?.toLowerCase().includes(q);
      const matchesDesc = ticket.description?.toLowerCase().includes(q);
      const matchesId = ticket.id?.toLowerCase().includes(q);
      if (!matchesTitle && !matchesType && !matchesDesc && !matchesId) {
        return false;
      }
    }

    if (effectiveFilter === "all") return true;
    const status = ticket.status?.toLowerCase() || "open";
    if (effectiveFilter === "open") return status === "open";
    if (effectiveFilter === "pending") return status === "escalated" || status === "pending" || status === "investigating";
    if (effectiveFilter === "closed") return status === "resolved" || status === "rejected" || status === "closed";
    return true;
  });

  const gridClassName = embedded
    ? "w-full grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6 content-start items-start auto-rows-max relative z-10"
    : "w-full flex flex-col sm:grid sm:grid-cols-2 gap-4 px-6 md:px-8 pb-20 content-start sm:items-start sm:auto-rows-max";

  return (
    <div className={`flex flex-col w-full text-[var(--text)] ${embedded ? "" : "min-h-full"}`}>
      {!shouldHideActionPill && (
        <div className="w-full px-6 md:px-8 pt-4 md:pt-6 shrink-0 mb-6">
          <ActionPill
            className="w-full !max-w-none"
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchPlaceholder={t("ph_search_tickets", "Search Tickets...") || "Search Tickets..."}
            primaryPopover={{
              icon: t("icon_tune", "tune"),
              label: t("filters", "Filters") || "Filters",
              content: (
                <div className="flex flex-col gap-4 w-[280px] p-2">
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-2">{t("ticket_status", "Ticket Status") || "Ticket Status"}</span>
                    <InlineFilterGroup 
                      value={activeFilter}
                      onChange={(v) => setActiveFilter(v as any)}
                      options={[
                        { id: 'all', label: t("filter_all", "All") },
                        { id: 'open', label: t("ticket_status_open", "Open") },
                        { id: 'pending', label: t("ticket_status_pending", "Pending") },
                        { id: 'closed', label: t("filter_closed", "Closed") }
                      ]}
                    />
                  </div>
                </div>
              )
            }}
            rightContent={
              isSidePanel || !onOpenNewTicket ? undefined : (
                <div className="flex items-center px-2 h-full">
                  <button
                    onClick={onOpenNewTicket}
                    className="h-9 px-4 rounded-md flex items-center justify-center gap-2 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors text-[var(--subtext)] hover:text-[var(--text)] font-black uppercase tracking-widest text-[10px] relative group"
                  >
                    <span className="material-symbols-outlined !text-[18px]">{t("icon_add", "add")}</span>
                    <span className="hidden md:inline">{t("ticket_new", "New Ticket") || "New Ticket"}</span>
                    <HoverTooltip title={t("ticket_new", "New Ticket") || "New Ticket"} />
                  </button>
                </div>
              )
            }
          />
        </div>
      )}

      <div className={gridClassName}>
        {isLoading ? (
          <div className="col-span-full flex justify-center items-center h-32 opacity-50">
            <span className="text-sm font-bold animate-pulse capitalize tracking-widest">{t("ui_btn_processing", "Processing...")}</span>
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="col-span-full">
            <EmptyState icon={t("icon_receipt_long", "receipt_long")} title={t("ticket_no_tickets", "No Active Tickets Found")} className={`col-span-full ${embedded ? "py-10" : "py-16"}`} />
          </div>
        ) : (
          filteredTickets.map(ticket => {
            const statusLower = ticket.status?.toLowerCase() || "open";
            const isResolved = statusLower === "resolved" || statusLower === "closed";
            const isRejected = statusLower === "rejected";
            const isEscalated = statusLower === "escalated";
            const isPending = statusLower === "pending" || statusLower === "investigating";

            const statusIconColor = isResolved
              ? "text-[var(--success)]"
              : isEscalated || isRejected
                ? "text-[var(--danger)]"
                : isPending
                  ? "text-[var(--warning)]"
                  : "text-[var(--accent)]";

            const statusIcon = isResolved
              ? t("icon_check_circle", "check_circle")
              : isRejected
                ? t("icon_cancel", "cancel")
                : isEscalated
                  ? t("icon_priority_high", "priority_high")
                  : isPending
                    ? t("icon_schedule", "schedule")
                    : t("icon_confirmation_number", "confirmation_number");

            const statusLabel = isResolved
              ? t("ticket_status_resolved", "Resolved")
              : isRejected
                ? t("ticket_status_rejected", "Rejected")
                : isEscalated
                  ? t("ticket_status_escalated", "Escalated")
                  : isPending
                    ? t("ticket_status_pending", "Pending")
                    : t("ticket_status_open", "Open");

            const replyCount = Array.isArray(ticket.metadata?.replies)
              ? ticket.metadata.replies.length
              : 0;

            return (
              <UniversalCard
                key={ticket.id}
                layout="vertical"
                isGhosted={isResolved}
                icon={t("icon_confirmation_number", "confirmation_number")}
                imageOverlay={
                  <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
                    <div className={VAULT_CHIP_CLASS}>
                      <span className={`material-symbols-outlined !text-[12px] ${statusIconColor}`}>
                        {statusIcon}
                      </span>
                      <span>{statusLabel}</span>
                    </div>
                    {ticket.metadata?.expedited_support && (
                      <div className={VAULT_CHIP_CLASS}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                          {t("icon_bolt", "bolt")}
                        </span>
                        <span>{t("supporter_badge_expedited_support", "Expedited Support")}</span>
                      </div>
                    )}
                    {ticket.metadata?.platform && (
                      <div className={VAULT_CHIP_CLASS}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                          {t("icon_devices", "devices")}
                        </span>
                        <span>{String(ticket.metadata.platform).toUpperCase()}</span>
                      </div>
                    )}
                  </div>
                }
                title={ticket.title}
                subtitle={`#${ticket.id.slice(0, 8)}`}
                onClick={() =>
                  onSelectTicket &&
                  onSelectTicket({
                    ...ticket,
                    table_name: ticket.table_name || tableName,
                  })
                }
                badges={
                  <div className="flex flex-wrap items-center gap-1.5">
                    <div className={VAULT_CHIP_CLASS}>
                      <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                        {t("icon_local_activity", "local_activity")}
                      </span>
                      <span>{(ticket.ticket_type || t("support_tickets", "Support")).replace(/_/g, " ")}</span>
                    </div>
                    {replyCount > 0 && (
                      <div className={VAULT_CHIP_CLASS}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                          {t("icon_forum", "forum")}
                        </span>
                        <span>{replyCount}</span>
                      </div>
                    )}
                  </div>
                }
                footer={
                  <div className="flex justify-between items-center w-full">
                    <span className="text-[10px] font-black text-[var(--subtext)] capitalize tracking-widest flex items-center gap-1.5 opacity-60">
                      <span className="material-symbols-outlined !text-[14px] normal-case">{t("icon_calendar_today", "calendar_today")}</span>
                      {new Date(ticket.created_at).toLocaleDateString()}
                    </span>
                    <span className="text-[10px] font-black text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] capitalize tracking-widest transition-all flex items-center gap-1">
                      {t("view_ticket", "View Ticket")} <span className="material-symbols-outlined !text-[12px]">{t("icon_arrow_forward", "arrow_forward")}</span>
                    </span>
                  </div>
                }
              >
                <p className="text-xs text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed">
                  {ticket.description}
                </p>
              </UniversalCard>
            );
          })
        )}
      </div>
    </div>
  );
}
