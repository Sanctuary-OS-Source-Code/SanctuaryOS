import React, { useState, useEffect } from "react";
import { useLexicon } from "./LexiconContext";
import { EmptyState } from "./shared";
import { supabase } from "./supabase";

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
        
        <div className="flex items-stretch overflow-hidden theme-glass-panel rounded-xl border border-white/5 shadow-inner h-12 shrink-0 divide-x divide-white/5 w-full">
          {["all", "open", "pending", "closed"].map(filter => (
             <button 
               key={filter}
               onClick={() => setActiveFilter(filter as any)}
               className={`h-full flex-1 px-6 rounded-none flex items-center justify-center text-[10px] font-black uppercase tracking-widest transition-all ${activeFilter === filter ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5'}`}
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
          filteredTickets.map(ticket => (
            <div 
              key={ticket.id}
              className="relative group w-full rounded-[var(--radius)] overflow-hidden transition-all duration-500 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] shadow-lg hover:shadow-[0_0_30px_color-mix(in_srgb,var(--accent)_10%,transparent)] hover:scale-[1.02] cursor-pointer flex flex-col"
              onClick={() => onSelectTicket && onSelectTicket(ticket)}
            >
              <div className="absolute inset-0 rounded-[inherit] theme-glass-panel opacity-100 group-hover:opacity-0 transition-opacity duration-500" />
              <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-[var(--accent)] via-transparent to-transparent opacity-0 group-hover:opacity-10 transition-opacity duration-500" />
              
              <div className="relative p-6 flex flex-col gap-4 z-10 flex-1">
                <div className="flex justify-between items-start">
                  <div className="flex flex-col gap-1 min-w-0 pr-2">
                    <span className="text-[10px] font-black theme-text-accent uppercase tracking-widest flex items-center gap-2 truncate">
                      {ticket.ticket_type || "SUPPORT"}
                    </span>
                    <h3 className="font-bold text-lg leading-tight text-[var(--text)] group-hover:theme-text-accent transition-colors truncate">
                      {ticket.title}
                    </h3>
                  </div>
                  <span className={`px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest uppercase flex-shrink-0 shadow-sm
                    ${ticket.status?.toLowerCase() === 'open' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : ''}
                    ${ticket.status?.toLowerCase() === 'resolved' ? 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)]' : ''}
                    ${ticket.status?.toLowerCase() === 'rejected' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : ''}
                    ${ticket.status?.toLowerCase() === 'escalated' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-[0_0_10px_color-mix(in_srgb,var(--amber-500)_20%,transparent)]' : ''}
                  `}>
                    {ticket.status}
                  </span>
                </div>
                
                <p className="text-sm text-[var(--subtext)] line-clamp-2 bg-[color-mix(in_srgb,var(--bg)_30%,transparent)] p-4 rounded-xl border border-white/5 flex-1">
                  {ticket.description}
                </p>
                
                <div className="flex justify-between items-center mt-2 pt-3 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0">
                  <span className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest">
                    {new Date(ticket.created_at).toLocaleDateString()}
                  </span>
                  <button className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-colors flex items-center gap-1">
                    {t("view_details")} <span className="material-symbols-outlined !text-[11px]">{t("icon_arrow_forward")}</span>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
