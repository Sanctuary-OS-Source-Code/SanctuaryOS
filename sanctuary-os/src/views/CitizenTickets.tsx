import { useState, useEffect } from "react";
import { useLexicon } from "../LexiconContext";
import { EmptyState, InlineFilterGroup, ActionPill, HoverTooltip } from "../shared";
import { supabase, supabaseAuth, getSpokeClientById } from "../supabase";
import { useStore } from "../store";
import {
  SupportTicketCard,
  sortTicketsPriorityFirst,
  TicketSupporterFallback,
} from "../components/universal/SupportTicketCard";
import {
  getSupporterState,
  findAnyActiveMasonSupporterPasses,
  isSpokeSupporter,
  isFoundryPatron,
} from "../utils/supporterManager";

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
  spokeId?: string;
}

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
  spokeId,
}: CitizenTicketsProps) {
  const { t } = useLexicon();
  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);
  const [tickets, setTickets] = useState<Ticket[]>(externalTickets || []);
  const [isLoading, setIsLoading] = useState(externalTickets === undefined);
  const [activeFilter, setActiveFilter] = useState<"all" | "open" | "pending" | "closed">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [supporterFallback, setSupporterFallback] = useState<TicketSupporterFallback>({});
  const [modNameMap, setModNameMap] = useState<Record<string, string>>({});

  useEffect(() => {
    let isMounted = true;
    getSupporterState()
      .then((st) => {
        if (!isMounted) return;
        const masonPasses = findAnyActiveMasonSupporterPasses(st);
        const spokePass = isSpokeSupporter(st, spokeId || activeWorkspaceId);
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
  }, [userId, spokeId, activeWorkspaceId]);

  useEffect(() => {
    let isMounted = true;
    const localMods = useStore.getState().modList || [];
    const nextMap: Record<string, string> = {};
    const missingUuids: string[] = [];
    const isUuid = (s: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

    tickets.forEach((tk) => {
      const tid = String((tk as any)?.target_mod_id || tk?.metadata?.target_mod_id || "").trim();
      if (!tid || tk?.metadata?.target_mod_name) return;
      const localMatch = localMods.find(
        (m: any) => m.dbId === tid || m.id === tid || m.hash === tid
      );
      if (localMatch) {
        const label = String(localMatch.displayName || localMatch.name || "").trim();
        if (label) nextMap[tid] = label;
      } else if (isUuid(tid) && (tk.table_name || tableName) === "sanctuary_tickets") {
        if (!missingUuids.includes(tid)) missingUuids.push(tid);
      }
    });

    if (Object.keys(nextMap).length > 0 && isMounted) {
      setModNameMap((prev) => ({ ...prev, ...nextMap }));
    }
    if (missingUuids.length === 0) {
      return () => {
        isMounted = false;
      };
    }

    const resolveRemoteMods = async () => {
      try {
        const client = spokeId ? (await getSpokeClientById(spokeId)) || supabase : supabase;
        const { data } = await client.from("mods").select("id, name").in("id", missingUuids);
        if (isMounted && Array.isArray(data) && data.length > 0) {
          const fetched: Record<string, string> = {};
          data.forEach((m: any) => {
            if (m?.id && m?.name) fetched[m.id] = String(m.name);
          });
          if (Object.keys(fetched).length > 0) {
            setModNameMap((prev) => ({ ...prev, ...fetched }));
          }
        }
      } catch {
        // Best-effort mod name resolution
      }
    };
    resolveRemoteMods();
    return () => {
      isMounted = false;
    };
  }, [tickets, tableName, spokeId]);

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
      const targetSpokeKey = spokeId || activeWorkspaceId || "default";
      const cacheKey = tableName === "keeper_tickets"
        ? `coreTickets_${userId}`
        : `spokeTickets_${targetSpokeKey}_${userId}`;
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
        const client =
          tableName === "keeper_tickets"
            ? supabaseAuth
            : spokeId
              ? (await getSpokeClientById(spokeId)) || supabase
              : supabase;
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
        const targetSpokeKey = spokeId || activeWorkspaceId || "default";
        const cacheKey = tableName === "keeper_tickets"
          ? `coreTickets_${userId}`
          : `spokeTickets_${targetSpokeKey}_${userId}`;
        delete (window as any).__sanctuaryCache.support[`${cacheKey}_lastFetch`];
      }
      fetchTickets();
    };
    window.addEventListener("sanctuary-tickets-updated", handleRefresh);
    return () => {
      isMounted = false;
      window.removeEventListener("sanctuary-tickets-updated", handleRefresh);
    };
  }, [userId, tableName, activeWorkspaceId, spokeId, externalTickets]);

  const isFlush = embedded || isSidePanel;
  const effectiveSearch = externalSearch !== undefined ? externalSearch : searchQuery;
  const effectiveFilter = externalFilter !== undefined ? externalFilter : activeFilter;
  const shouldHideActionPill = hideActionPill ?? isFlush;

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
    if (effectiveFilter === "open") return status === "open" || status === "new";
    if (effectiveFilter === "pending") {
      return (
        status === "escalated" ||
        status === "pending" ||
        status === "investigating" ||
        status === "in_progress" ||
        status === "in progress" ||
        status === "under_review" ||
        status === "claimed"
      );
    }
    if (effectiveFilter === "closed") return status === "resolved" || status === "rejected" || status === "closed" || status === "solved";
    return true;
  });

  const sortedTickets = sortTicketsPriorityFirst(filteredTickets, (tk) =>
    !tk.author_id || tk.author_id === userId ? supporterFallback : undefined
  );

  const gridClassName = isSidePanel
    ? "w-full grid grid-cols-1 sm:grid-cols-2 gap-5 content-start items-start auto-rows-max relative z-10"
    : embedded
      ? "w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 content-start items-start auto-rows-max relative z-10"
      : "w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 px-6 md:px-8 pb-20 content-start items-start auto-rows-max";

  return (
    <div className={`flex flex-col w-full text-[var(--text)] ${isFlush ? "" : "min-h-full"}`}>
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
          <EmptyState
            icon={t("icon_sync", "sync")}
            title={t("ui_btn_processing", "Processing...")}
            className="col-span-full"
          />
        ) : sortedTickets.length === 0 ? (
          <div className="col-span-full">
            <EmptyState icon={t("icon_receipt_long", "receipt_long")} title={t("ticket_no_tickets", "No Active Tickets Found")} className={`col-span-full ${isFlush ? "py-10" : "py-16"}`} />
          </div>
        ) : (
          sortedTickets.map((ticket) => {
            const rawTargetModId = String(
              (ticket as any).target_mod_id || ticket.metadata?.target_mod_id || ""
            ).trim();
            const replyCount = Array.isArray(ticket.metadata?.replies)
              ? ticket.metadata.replies.length
              : 0;

            return (
              <SupportTicketCard
                key={ticket.id}
                ticket={ticket}
                t={t}
                resolvedModName={rawTargetModId ? modNameMap[rawTargetModId] : null}
                supporterFallback={
                  !ticket.author_id || ticket.author_id === userId
                    ? supporterFallback
                    : undefined
                }
                replyCount={replyCount}
                onClick={() =>
                  onSelectTicket &&
                  onSelectTicket({
                    ...ticket,
                    table_name: ticket.table_name || tableName,
                  })
                }
              />
            );
          })
        )}
      </div>
    </div>
  );
}
