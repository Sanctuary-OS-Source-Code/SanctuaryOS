import { useState, useEffect } from "react";
import { useLexicon } from "./LexiconContext";
import { EmptyState, InlineFilterGroup, ActionPill, HeaderActionPortal } from "./shared";
import { UniversalCard } from "./components/universal/UniversalCard";
import { supabaseAuth } from "./supabase";

interface Ticket {
  id: string;
  author_id: string;
  status: string;
  ticket_type: string;
  title: string;
  description: string;
  created_at: string;
  metadata?: any;
}

interface WayfinderKeeperTicketsProps {
  userId?: string; // Optional: if provided, filter by specific user
  onSelectTicket?: (ticket: Ticket) => void;
  isSidePanel?: boolean;
  embedded?: boolean;
  externalSearch?: string;
  externalFilter?: "all" | "open" | "pending" | "closed";
  onCountChange?: (count: number) => void;
  onTicketsLoaded?: (tickets: Ticket[]) => void;
}

const VAULT_CHIP_CLASS = "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

export default function WayfinderKeeperTickets({
  userId,
  onSelectTicket,
  isSidePanel = false,
  embedded = false,
  externalSearch,
  externalFilter,
  onCountChange,
  onTicketsLoaded,
}: WayfinderKeeperTicketsProps) {
  const { t } = useLexicon();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<"all" | "open" | "pending" | "closed">("all");
  const [searchQuery, setSearchQuery] = useState("");
  void isSidePanel;

  const effectiveSearch = externalSearch !== undefined ? externalSearch : searchQuery;
  const effectiveFilter = externalFilter !== undefined ? externalFilter : activeFilter;

  useEffect(() => {
    const fetchTickets = async () => {
      const CACHE_TTL = 5 * 60 * 1000;
      const cache = window.__sanctuaryCache?.support;
      
      if (cache?.tickets && cache.tickets.length > 0) {
        if (performance.now() - cache.lastFetch < CACHE_TTL) {
          setTickets(cache.tickets);
          setIsLoading(false);
          return;
        }
        setTickets(cache.tickets);
      }

      if (!cache?.tickets || cache.tickets.length === 0) setIsLoading(true);
      const { data, error } = await supabaseAuth
        .from('keeper_tickets')
        .select('*')
        .eq('author_id', userId)
        .order('created_at', { ascending: false });

      if (data && !error) {
        setTickets(data as Ticket[]);
        if (window.__sanctuaryCache) {
          window.__sanctuaryCache.support.tickets = data;
          window.__sanctuaryCache.support.lastFetch = performance.now();
        }
      }
      setIsLoading(false);
    };

    if (userId) {
      fetchTickets();
    }
  }, [userId]);

  useEffect(() => {
    if (onCountChange) onCountChange(tickets.length);
    if (onTicketsLoaded) onTicketsLoaded(tickets);
  }, [tickets, onCountChange, onTicketsLoaded]);

  const filteredTickets = tickets.filter(ticket => {
    if (effectiveSearch) {
      const q = effectiveSearch.toLowerCase();
      if (!ticket.title?.toLowerCase().includes(q) && !ticket.ticket_type?.toLowerCase().includes(q)) {
        return false;
      }
    }
    
    if (effectiveFilter === "all") return true;
    const status = ticket.status?.toLowerCase() || "open";
    if (effectiveFilter === "open") return status === "open" || status === "new";
    if (effectiveFilter === "pending") return status === "escalated" || status === "pending";
    if (effectiveFilter === "closed") return status === "resolved" || status === "rejected" || status === "closed";
    return true;
  });

  return (
    <div className="flex flex-col w-full text-[var(--text)] h-full">
      {!embedded && (
        <HeaderActionPortal>
          <ActionPill
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
          />
        </HeaderActionPortal>
      )}

      <div className={embedded ? "w-full grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pb-16" : "w-full flex flex-col sm:grid sm:grid-cols-2 gap-4 px-6 md:px-8 overflow-y-auto custom-scrollbar flex-1 pb-20 content-start sm:items-start sm:auto-rows-max"}>
        {isLoading ? (
          <div className="col-span-full flex justify-center items-center h-32 opacity-50">
            <span className="text-sm font-bold animate-pulse capitalize tracking-widest">{t("ui_btn_processing", "Processing...")}</span>
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="col-span-full">
            <EmptyState icon={t("icon_receipt_long", "receipt_long")} title={t("ticket_no_tickets", "No Active Tickets Found")} className="col-span-full py-16" />
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
                  </div>
                }
                title={ticket.title}
                subtitle={`#${ticket.id.slice(0, 8)}`}
                onClick={() => onSelectTicket && onSelectTicket(ticket)}
                badges={
                  <div className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {t("icon_local_activity", "local_activity")}
                    </span>
                    <span>{(ticket.ticket_type || t("support_tickets", "Support")).replace(/_/g, " ")}</span>
                  </div>
                }
                footer={
                  <div className="flex justify-between items-center w-full">
                    <span className="text-[10px] font-black text-[var(--subtext)] capitalize tracking-widest flex items-center gap-1.5 opacity-60">
                      <span className="material-symbols-outlined !text-[14px] normal-case">{t("icon_calendar_today", "calendar_today")}</span>
                      {new Date(ticket.created_at).toLocaleDateString()}
                    </span>
                    <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] capitalize tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0">
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
