import React, { useState, useEffect } from "react";
import { useLexicon } from "./LexiconContext";
import { EmptyState } from "./shared";
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
}

export default function CitizenTickets({ userId, onSelectTicket, onOpenNewTicket }: CitizenTicketsProps) {
  const { t } = useLexicon();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<"all" | "open" | "pending" | "closed">("all");

  useEffect(() => {
    const fetchTickets = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('sanctuary_tickets')
        .select('*')
        .eq('author_id', userId)
        .order('created_at', { ascending: false });

      if (data && !error) {
        setTickets(data as Ticket[]);
      }
      setIsLoading(false);
    };

    if (userId) {
      fetchTickets();
    }
  }, [userId]);

  const filteredTickets = tickets.filter(ticket => {
    if (activeFilter === "all") return true;
    const status = ticket.status?.toLowerCase() || "open";
    if (activeFilter === "open") return status === "open";
    if (activeFilter === "pending") return status === "escalated" || status === "pending";
    if (activeFilter === "closed") return status === "resolved" || status === "rejected" || status === "closed";
    return true;
  });

  return (
    <div className="flex flex-col gap-6 w-full p-6 pb-20 text-[var(--text)]">
      <div className="flex flex-col gap-4 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] pb-4">
        <div className="flex justify-between items-center">
          <div className="flex flex-col">
            <h2 className="text-xl font-black uppercase tracking-widest">{t("your_tickets")}</h2>
            <p className="text-sm text-[var(--subtext)]">{t("create_new")}</p>
          </div>
        </div>
        
        <div className="flex items-stretch overflow-hidden glass-panel rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner h-12 shrink-0 divide-x divide-white/5 w-full">
          {["all", "open", "pending", "closed"].map(filter => (
             <button 
               key={filter}
               onClick={() => setActiveFilter(filter as any)}
               className={`h-full flex-1 px-6 rounded-none flex items-center justify-center text-[10px] font-black uppercase tracking-widest transition-all ${activeFilter === filter ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}
             >
               {filter}
             </button>
          ))}
        </div>
      </div>

      <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4 pr-2">
        {isLoading ? (
          <div className="col-span-full flex justify-center items-center h-32 opacity-50">
            <span className="text-sm font-bold animate-pulse uppercase tracking-widest">{t("ui_btn_processing")}</span>
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="col-span-full">
            <EmptyState icon={t("icon_receipt_long") || "receipt_long"} title={t("ticket_no_tickets")} className="col-span-full py-16" />
          </div>
        ) : (
          filteredTickets.map(ticket => {
            const isResolved = ticket.status?.toLowerCase() === 'resolved';
            const isRejected = ticket.status?.toLowerCase() === 'rejected';
            const isEscalated = ticket.status?.toLowerCase() === 'escalated';
            const statusColorClass = isResolved ? "border-[color-mix(in_srgb,var(--text)_10%,transparent)]" : isRejected ? "border-rose-500/50" : isEscalated ? "border-amber-500/50" : "border-emerald-500/50";
            
            return (
              <UniversalCard
                key={ticket.id}
                layout="vertical-compact"
                statusColor={statusColorClass}
                className={isResolved ? "opacity-70 grayscale-[0.2]" : ""}
                title={ticket.title}
                subtitle={ticket.ticket_type || "SUPPORT"}
                onClick={() => onSelectTicket && onSelectTicket(ticket)}
                badges={
                  <span className={`px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest uppercase flex-shrink-0 shadow-sm
                    ${!isResolved && !isRejected && !isEscalated ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : ''}
                    ${isResolved ? 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)]' : ''}
                    ${isRejected ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : ''}
                    ${isEscalated ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-md' : ''}
                  `}>
                    {ticket.status}
                  </span>
                }
                footer={
                  <div className="flex justify-between items-center w-full">
                    <span className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest">
                      {new Date(ticket.created_at).toLocaleDateString()}
                    </span>
                    <button className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-colors flex items-center gap-1">
                      {t("view_details")} <span className="material-symbols-outlined !text-[11px]">{t("icon_arrow_forward")}</span>
                    </button>
                  </div>
                }
              >
                <p className="text-sm text-[var(--subtext)] line-clamp-2 glass-surface p-4 shadow-inner border border-white/5 flex-1 mt-2">
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
