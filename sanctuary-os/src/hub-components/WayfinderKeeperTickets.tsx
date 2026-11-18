import { useState, useEffect } from "react";
import { useLexicon } from "../LexiconContext";
import { EmptyState, InlineFilterGroup, ActionPill, HeaderActionPortal } from "../shared";
import {
  SupportTicketCard,
  sortTicketsPriorityFirst,
  TicketSupporterFallback,
} from "../components/universal/SupportTicketCard";
import { openSanctuaryContextMenu } from "../shared-components/ContextMenu";
import { supabaseAuth } from "../supabase";
import { useStore } from "../store";
import {
  getSupporterState,
  findAnyActiveMasonSupporterPasses,
  isSpokeSupporter,
  isFoundryPatron,
} from "../utils/supporterManager";

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
  const sessionUserId = useStore((state) => state.session?.user?.id);
  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);
  const modList = useStore((state) => state.modList);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<"all" | "open" | "pending" | "closed">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [supporterFallback, setSupporterFallback] = useState<TicketSupporterFallback>({});

  useEffect(() => {
    if (!userId || (sessionUserId && sessionUserId !== userId)) return;
    let isMounted = true;
    getSupporterState()
      .then((st) => {
        if (!isMounted) return;
        const masonPasses = findAnyActiveMasonSupporterPasses(st);
        const spokePass = isSpokeSupporter(st, activeWorkspaceId);
        const patron = isFoundryPatron(st);
        setSupporterFallback({
          isMasonSupporter: masonPasses.length > 0,
          masonSupporterName: masonPasses[0]?.mason_name || null,
          isSpokeSupporter: Boolean(spokePass),
          spokeSupporterName: spokePass?.spoke_name || null,
          isFoundryPatron: patron,
        });
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [userId, sessionUserId, activeWorkspaceId]);

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

  const sortedTickets = sortTicketsPriorityFirst(filteredTickets, (tk) =>
    !userId || tk.author_id === userId ? supporterFallback : undefined
  );

  const ticketFilterPopover = {
    icon: t("icon_tune", "tune"),
    label: t("filters", "Filters") || "Filters",
    content: (
      <div className="flex flex-col gap-4 w-[280px] p-2">
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-2">
            {t("ticket_status", "Ticket Status") || "Ticket Status"}
          </span>
          <InlineFilterGroup
            value={activeFilter}
            onChange={(v) => setActiveFilter(v as any)}
            options={[
              { id: "all", label: t("filter_all", "All") },
              { id: "open", label: t("ticket_status_open", "Open") },
              { id: "pending", label: t("ticket_status_pending", "Pending") },
              { id: "closed", label: t("filter_closed", "Closed") },
            ]}
          />
        </div>
      </div>
    ),
  };

  return (
    <div className={`flex flex-col w-full text-[var(--text)] ${embedded || isSidePanel ? "" : "h-full"}`}>
      {!embedded && isSidePanel ? (
        <ActionPill
          className="w-full !max-w-none shrink-0 mb-4"
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          searchPlaceholder={t("ph_search_tickets", "Search Tickets...") || "Search Tickets..."}
          primaryPopover={ticketFilterPopover}
        />
      ) : !embedded ? (
        <HeaderActionPortal>
          <ActionPill
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchPlaceholder={t("ph_search_tickets", "Search Tickets...") || "Search Tickets..."}
            primaryPopover={ticketFilterPopover}
          />
        </HeaderActionPortal>
      ) : null}

      <div
        className={
          isSidePanel
            ? "w-full grid grid-cols-1 sm:grid-cols-2 gap-4 content-start items-start auto-rows-max"
            : embedded
              ? "w-full grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pb-16"
              : "w-full flex flex-col sm:grid sm:grid-cols-2 gap-4 px-6 md:px-8 overflow-y-auto custom-scrollbar flex-1 pb-20 content-start sm:items-start sm:auto-rows-max"
        }
      >
        {isLoading ? (
          <EmptyState
            icon={t("icon_sync", "sync")}
            title={t("ui_btn_processing", "Processing...")}
            className="col-span-full"
          />
        ) : sortedTickets.length === 0 ? (
          <div className="col-span-full">
            <EmptyState icon={t("icon_receipt_long", "receipt_long")} title={t("ticket_no_tickets", "No Active Tickets Found")} className="col-span-full py-16" />
          </div>
        ) : (
          sortedTickets.map((ticket) => {
            const rawTargetModId = String(
              (ticket as any).target_mod_id || ticket.metadata?.target_mod_id || ""
            ).trim();
            const localModMatch = rawTargetModId
              ? modList.find(
                  (m: any) =>
                    m.dbId === rawTargetModId || m.id === rawTargetModId || m.hash === rawTargetModId
                )
              : null;
            const resolvedModName = localModMatch
              ? String(localModMatch.displayName || localModMatch.name || "").trim() || null
              : null;
            const replyCount = Array.isArray(ticket.metadata?.replies)
              ? ticket.metadata.replies.length
              : 0;

            return (
              <SupportTicketCard
                key={ticket.id}
                ticket={ticket}
                t={t}
                resolvedModName={resolvedModName}
                supporterFallback={
                  !userId || ticket.author_id === userId ? supporterFallback : undefined
                }
                replyCount={replyCount}
                onClick={() => onSelectTicket && onSelectTicket(ticket)}
                onContextMenu={(e) => {
                  openSanctuaryContextMenu(e, [
                    {
                      label: t("view_ticket", "View Ticket"),
                      icon: t("icon_confirmation_number", "confirmation_number"),
                      onClick: () => onSelectTicket && onSelectTicket(ticket),
                    },
                    {
                      divider: true,
                      label: t("copy_title", "Copy Title"),
                      icon: t("icon_content_copy", "content_copy"),
                      onClick: () => navigator.clipboard?.writeText(ticket.title || ""),
                    },
                  ]);
                }}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
