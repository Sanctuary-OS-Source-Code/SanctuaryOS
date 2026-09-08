import React, { useState, useEffect } from "react";
import { useLexicon } from "./LexiconContext";
import { EmptyState, InlineFilterGroup, ScreenUtilityBar, CustomDropdown, FilterPopover } from "./shared";
import { supabase } from "./supabase";
import { UniversalCard } from "./components/universal/UniversalCard";

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

interface CitizenTicketsProps {
  userId: string;
  onSelectTicket?: (ticket: Ticket) => void;
  onOpenNewTicket?: () => void;
  isSidePanel?: boolean;
}

export default function CitizenTickets({ userId, onSelectTicket, onOpenNewTicket, isSidePanel = false }: CitizenTicketsProps) {
  const { t } = useLexicon();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<"all" | "open" | "pending" | "closed">("all");
  const [searchQuery, setSearchQuery] = useState("");

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
      const { data, error } = await supabase
        .from('sanctuary_tickets')
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

  const filteredTickets = tickets.filter(ticket => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!ticket.title.toLowerCase().includes(q) && !ticket.ticket_type?.toLowerCase().includes(q)) {
        return false;
      }
    }
    
    if (activeFilter === "all") return true;
    const status = ticket.status?.toLowerCase() || "open";
    if (activeFilter === "open") return status === "open";
    if (activeFilter === "pending") return status === "escalated" || status === "pending";
    if (activeFilter === "closed") return status === "resolved" || status === "rejected" || status === "closed";
    return true;
  });

  return (
    <div className="flex flex-col w-full text-[var(--text)] min-h-full">
      <div className="w-full px-6 md:px-8 pt-4 md:pt-6 shrink-0">
        <ScreenUtilityBar
          isSidePanel={isSidePanel}
          search={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder={t("ph_search_tickets") || "Search Tickets..."}
          className="!mb-6 !pb-0 !px-0 !border-0 flex-none w-full"
        >
          <FilterPopover icon="tune" label={t("filters") || "Filters"} className="shrink-0" buttonClassName="!rounded-2xl">
            <div className="flex flex-col gap-4 w-[280px] p-2">
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-2">{t("ticket_status") || "Ticket Status"}</span>
                <InlineFilterGroup 
                  value={activeFilter}
                  onChange={(v) => setActiveFilter(v as any)}
                  options={[
                    { id: 'all', label: 'ALL TICKETS' },
                    { id: 'open', label: 'OPEN' },
                    { id: 'pending', label: 'PENDING' },
                    { id: 'closed', label: 'CLOSED' }
                  ]}
                />
              </div>
            </div>
          </FilterPopover>
        </ScreenUtilityBar>
      </div>

      <div className="w-full flex flex-col sm:grid sm:grid-cols-2 gap-3 px-6 md:px-8 pb-20 content-start sm:items-start sm:auto-rows-max">
        {isLoading ? (
          <div className="col-span-full flex justify-center items-center h-32 opacity-50">
            <span className="text-sm font-bold animate-pulse capitalize tracking-widest">{t("ui_btn_processing")}</span>
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="col-span-full">
            <EmptyState icon={t("icon_receipt_long")} title={t("ticket_no_tickets")} className="col-span-full py-16" />
          </div>
        ) : (
          filteredTickets.map(ticket => {
            const isResolved = ticket.status?.toLowerCase() === 'resolved';
            const isRejected = ticket.status?.toLowerCase() === 'rejected';
            const isEscalated = ticket.status?.toLowerCase() === 'escalated';
            const statusColorClass = isResolved ? "border-[color-mix(in_srgb,var(--text)_10%,transparent)]" : isRejected ? "border-[color-mix(in_srgb,var(--danger)_50%,transparent)]" : isEscalated ? "border-[color-mix(in_srgb,var(--warning)_50%,transparent)]" : "border-[color-mix(in_srgb,var(--success)_50%,transparent)]";
            
            return (
              <UniversalCard
                key={ticket.id}
                layout="vertical-compact"
                statusColor={statusColorClass}
                className={`${isResolved ? "opacity-70 grayscale-[0.2]" : ""}`}
                title={ticket.title}
                subtitle={ticket.ticket_type || "SUPPORT"}
                onClick={() => onSelectTicket && onSelectTicket(ticket)}
                badges={
                  <span className={`px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest capitalize flex-shrink-0 shadow-sm
                    ${!isResolved && !isRejected && !isEscalated ? 'bg-[color-mix(in_srgb,var(--success)_20%,transparent)] text-emerald-400 border border-[color-mix(in_srgb,var(--success)_30%,transparent)]' : ''}
                    ${isResolved ? 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)]' : ''}
                    ${isRejected ? 'bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] text-rose-400 border border-[color-mix(in_srgb,var(--danger)_30%,transparent)]' : ''}
                    ${isEscalated ? 'bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] text-amber-400 border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] shadow-md' : ''}
                  `}>
                    {ticket.status}
                  </span>
                }
                footer={
                  <div className="flex justify-between items-center w-full">
                    <span className="text-[10px] font-black text-[var(--subtext)] capitalize tracking-widest">
                      {new Date(ticket.created_at).toLocaleDateString()}
                    </span>
                    <button className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] capitalize tracking-widest transition-colors flex items-center gap-1">
                      {t("view_details")} <span className="material-symbols-outlined !text-[11px]">{t("icon_arrow_forward")}</span>
                    </button>
                  </div>
                }
              >
                <p className="hidden sm:block text-xs text-[var(--subtext)] line-clamp-2 glass-surface !z-auto p-3 shadow-inner border border-white/5 mt-3">
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
