import React, { useState, useEffect } from "react";
import { useLexicon } from "../LexiconContext";
import { useStore } from '../store';
import { supabase, supabaseAuth } from "../supabase";
import TicketDossierSidePanel from '../side-panels/TicketDossierSidePanel';
import { logArchitectAction } from "../lib/audit";
import { SidePanel, CustomDropdown, standardAccentGlassButtonClass, EmptyState, ScreenUtilityBar, FilterTabs, FilterTabButton } from "../shared";
import { UniversalCard } from "../components/universal/UniversalCard";

interface Ticket {
  id: string;
  author_id: string;
  status: "open" | "resolved" | "rejected" | "escalated";
  category?: string;
  ticket_type?: string;
  title: string;
  description: string;
  created_at: string;
  target_mod_id?: string;
  logs?: string;
  metadata?: any;
  author_username?: string;
  onEditMetadata?: (hash: string) => void;
}

export default function KeepersSupportTickets({ userRole = "keeper", masonProfileId, onEditMetadata, setStatus }: { userRole?: string, masonProfileId?: string, onEditMetadata?: (hash: string) => void, setStatus?: any }) {
  const { t } = useLexicon();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<"new" | "pending" | "closed">("pending");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryOptions, setCategoryOptions] = useState<any[]>([]);
  const currentUserId = useStore(state => state.session?.user?.id);

  const fetchTickets = async () => {
    setIsLoading(true);
    let query = supabaseAuth
      .from('keeper_tickets')
      .select('*')
      .order('created_at', { ascending: false });


    if (activeFilter === "new") {
      query = query.in('status', ['NEW', 'OPEN', 'new', 'open']);
    } else if (activeFilter === "pending") {
      query = query.in('status', ['NEW', 'OPEN', 'new', 'open', 'PENDING', 'ESCALATED', 'INVESTIGATING', 'pending', 'escalated', 'investigating']);
    } else if (activeFilter === "closed") {
      query = query.in('status', ['RESOLVED', 'REJECTED', 'CLOSED', 'resolved', 'rejected', 'closed']);
    }

    if (userRole === "mason" && masonProfileId) {
      query = query.eq('author_id', masonProfileId);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Error fetching tickets:", error);
    }
    if (data && !error) {
      const fetchedTickets = data as Ticket[];
      const authorIds = [...new Set(fetchedTickets.map(t => t.author_id))];
      const { data: profiles } = await supabase.from('profiles').select('id, username').in('id', authorIds);
      const { data: masons } = await supabase.from('masons').select('id, name').in('id', authorIds);
      const profileMap: Record<string, string> = {};
      profiles?.forEach(p => profileMap[p.id] = p.username);
      masons?.forEach(m => { if (!profileMap[m.id]) profileMap[m.id] = m.name; });

      const mergedTickets = fetchedTickets.map(t => ({
        ...t,
        author_username: profileMap[t.author_id] || t.author_id?.substring(0, 8).toUpperCase() || 'SYSTEM'
      }));

      const { data: catData } = await supabaseAuth.from('keeper_support_categories').select('*');

      const targetModIds = [...new Set(mergedTickets.map(t => t.target_mod_id || t.metadata?.target_mod_id).filter(Boolean))];
      const isValidUUID = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
      const validModIds = targetModIds.filter(isValidUUID);
      const hashes = targetModIds.filter(id => !isValidUUID(id));
      const modAuthorMap: Record<string, string> = {};

      if (hashes.length > 0) {
        const { data: verData } = await supabase.from('mod_versions').select('mod_id, dna_hash').in('dna_hash', hashes);
        if (verData && verData.length > 0) {
          const mIds = [...new Set(verData.map((v: any) => v.mod_id))];
          mIds.forEach(id => {
            if (!validModIds.includes(id)) validModIds.push(id);
          });
          verData.forEach((v: any) => {
            modAuthorMap[`HASH_MAP_${v.dna_hash}`] = v.mod_id;
          });
        }
      }

      if (validModIds.length > 0) {
        const { data: modsData } = await supabase.from('mods').select('id, mason_id').in('id', validModIds);
        modsData?.forEach(m => {
          modAuthorMap[m.id] = m.mason_id;
        });
      }

      let finalTickets = mergedTickets;
      // Removed role-based escalation filtering for Keepers since Keepers see all OS-level tickets directly.

      finalTickets = mergedTickets.filter(t => {
        const isClaimedByMe = t.metadata?.claimed_by === currentUserId;
        const isClaimedByOther = t.metadata?.claimed_by && !isClaimedByMe;

        if (activeFilter === "new") {
            if (isClaimedByOther || isClaimedByMe) return false;
        } else if (activeFilter === "pending") {
            if (!isClaimedByMe) return false;
        } else if (activeFilter === "closed") {
            // Closed tickets visible to all
        }
        return true;
      });

      setTickets(finalTickets);

      const uniqueCats = [...new Set(finalTickets.map(t => t.ticket_type || t.category || "GENERAL"))];
      const dynamicOptions = [
        { id: "all", label: t("ui_tab_all_types") },
        ...uniqueCats.map(c => ({ id: c, label: c.replace(/_/g, ' ') }))
      ];
      setCategoryOptions(dynamicOptions);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchTickets();
  }, [activeFilter]);

  const handleTakeAction = async (actionType: "RESOLVED" | "REJECTED" | "ESCALATED" | "PENDING", reason: string) => {
    if (!selectedTicket) return;

    const newStatus = actionType.toUpperCase();

    const newMetadata = {
      ...(selectedTicket.metadata || {}),
      action_log: [
        ...(selectedTicket.metadata?.action_log || []),
        {
          action: actionType,
          reason,
          timestamp: new Date().toISOString(),
          architect: userRole === "oversight" ? "Oversight" : userRole === "wayfinder" ? "Wayfinder" : userRole === "architect" ? "Architect" : "Mason"
        }
      ]
    };

    if (actionType === "ESCALATED") {
      delete newMetadata.claimed_by;
    }

    const { error } = await supabaseAuth
      .from('keeper_tickets')
      .update({
        status: newStatus,
        metadata: newMetadata
      })
      .eq('id', selectedTicket.id);

    if (error) {
      useStore.getState().pushStatus("Failed to update ticket: " + error.message, "error");
      return;
    }

    useStore.getState().pushStatus(t("auto_ticket_status_updated_39"), "success");

    if (userRole === "keeper" || userRole === "keepers") {
      logArchitectAction(`Keeper Ticket ${actionType}: ${reason}`, 'keeper_tickets', selectedTicket.id, undefined, 'Keeper Hub', true);
    }
    setSelectedTicket(null);
    fetchTickets();
  };

  const handleClaimTicket = async () => {
    if (!selectedTicket || !currentUserId) return;
    const newMetadata = { ...(selectedTicket.metadata || {}), claimed_by: currentUserId };
    const { error } = await supabaseAuth.from('keeper_tickets').update({ metadata: newMetadata }).eq('id', selectedTicket.id);
    if (!error) {
       setSelectedTicket({ ...selectedTicket, metadata: newMetadata });
       fetchTickets();
       useStore.getState().pushStatus(t("ticket_claim") || "Ticket Claimed", "success");
    }
  };

  const handleReleaseTicket = async () => {
    if (!selectedTicket || !currentUserId) return;
    const newMetadata = { ...(selectedTicket.metadata || {}) };
    delete newMetadata.claimed_by;
    const { error } = await supabaseAuth.from('keeper_tickets').update({ metadata: newMetadata }).eq('id', selectedTicket.id);
    if (!error) {
       setSelectedTicket({ ...selectedTicket, metadata: newMetadata });
       fetchTickets();
       useStore.getState().pushStatus(t("ticket_release") || "Ticket Released", "success");
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full pb-32 text-[var(--text)]">
      <ScreenUtilityBar
        search={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder={t("ui_placeholder_search")}
        className="!mb-0"
      >
        <div className="w-max min-w-[192px] max-w-xs shrink-0 relative z-50 h-12">
          <CustomDropdown
            value={activeCategory}
            onChange={(v: string[]) => setActiveCategory(v[0])}
            options={categoryOptions.length > 0 ? categoryOptions : [{ id: "all", label: t("ui_tab_all_types") }]}
            disableTint={true}
          />
        </div>
        <FilterTabs className="h-12 z-40">
          <FilterTabButton id="pending" label={t("ticket_tab_claimed") || t("pending")} activeTab={activeFilter} setTab={setActiveFilter} />
          <FilterTabButton id="new" label={t("ui_tab_new")} activeTab={activeFilter} setTab={setActiveFilter} />
          <FilterTabButton id="closed" label={t("ui_tab_closed")} activeTab={activeFilter} setTab={setActiveFilter} />
        </FilterTabs>
      </ScreenUtilityBar>

      <div className="w-full flex flex-col gap-4 pb-10 px-6">
        {isLoading ? (
          <div className="flex justify-center items-center h-40 opacity-50">
            <span className="text-sm font-bold animate-pulse capitalize tracking-widest">{t("ui_btn_processing")}</span>
          </div>
        ) : tickets.length === 0 ? (
          <EmptyState icon={t("icon_receipt_long")} title={t("ticket_no_tickets")} className="col-span-full py-16" />
        ) : (() => {
          const filteredTickets = tickets.filter(t => {
            if (activeCategory !== "all") {
              const tCat = t.ticket_type || t.category || "GENERAL";
              if (tCat !== activeCategory) return false;
            }
            if (searchQuery) {
              const q = searchQuery.toLowerCase();
              return t.title?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q);
            }
            return true;
          });

          if (filteredTickets.length === 0) return (
            <EmptyState icon={searchQuery ? "search_off" : t("icon_celebration")} title={searchQuery ? t("no_matches") : (activeFilter === 'new' ? t("no_bug_reports") : t("no_tickets"))} className="col-span-full py-16" />
          );

          return (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6 px-6">
              {filteredTickets.map(ticket => (
                <UniversalCard
                  key={ticket.id}
                  onClick={() => setSelectedTicket(ticket)}
                  layout="vertical"
                  icon={ticket.status?.toLowerCase() === 'new' || ticket.status?.toLowerCase() === 'open' ? 'support_agent' : ticket.status?.toLowerCase() === 'closed' || ticket.status?.toLowerCase() === 'resolved' || ticket.status?.toLowerCase() === 'rejected' ? 'done_all' : ticket.status?.toLowerCase() === 'investigating' || ticket.status?.toLowerCase() === 'pending' ? 'warning' : ticket.status?.toLowerCase() === 'escalated' ? 'priority_high' : 'bug_report'}
                  title={ticket.title}
                  statusColor={
                    ticket.status?.toLowerCase() === 'new' || ticket.status?.toLowerCase() === 'open' ? 'border-rose-500' :
                    ticket.status?.toLowerCase() === 'closed' || ticket.status?.toLowerCase() === 'resolved' || ticket.status?.toLowerCase() === 'rejected' ? 'border-emerald-500' :
                    ticket.status?.toLowerCase() === 'investigating' || ticket.status?.toLowerCase() === 'pending' ? 'border-amber-500' :
                    ticket.status?.toLowerCase() === 'escalated' ? 'border-fuchsia-500' : undefined
                  }
                  badges={[
                    <span key="status" className={`px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest capitalize border shadow-inner transition-colors
                                ${ticket.status?.toLowerCase() === 'new' || ticket.status?.toLowerCase() === 'open' ? 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-rose-400 border-[color-mix(in_srgb,var(--danger)_20%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)]' : ''}
                                ${ticket.status?.toLowerCase() === 'closed' || ticket.status?.toLowerCase() === 'resolved' || ticket.status?.toLowerCase() === 'rejected' ? 'bg-[color-mix(in_srgb,var(--success)_10%,transparent)] text-emerald-400 border-[color-mix(in_srgb,var(--success)_20%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)]' : ''}
                                ${ticket.status?.toLowerCase() === 'investigating' || ticket.status?.toLowerCase() === 'pending' ? 'bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] text-amber-400 border-[color-mix(in_srgb,var(--warning)_20%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--warning)_20%,transparent)]' : ''}
                                ${ticket.status?.toLowerCase() === 'escalated' ? 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20 group-hover:bg-fuchsia-500/20' : ''}
                                ${!['new', 'open', 'closed', 'resolved', 'rejected', 'investigating', 'pending', 'escalated'].includes(ticket.status?.toLowerCase() || '') ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_20%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]' : ''}
                            `}>
                      {(ticket.status?.toLowerCase() === 'new' || ticket.status?.toLowerCase() === 'open') ? (t("ui_tab_new")) : (t(`ticket_status_${ticket.status.toLowerCase()}`) || ticket.status || "NEW")}
                    </span>,
                    (ticket.ticket_type || ticket.category) && (
                      <span key="category" className="px-2 py-1 rounded bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[color-mix(in_srgb,var(--text)_60%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[8px] font-black capitalize tracking-widest whitespace-nowrap group-hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] group-hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] transition-all">
                        {(ticket.ticket_type || ticket.category || "").replace(/_/g, ' ')}
                      </span>
                    )
                  ].filter(Boolean)}
                  footer={
                    <div className="flex justify-between items-center w-full">
                      <span className="text-[10px] font-black text-[var(--subtext)] capitalize tracking-widest flex items-center gap-1.5 opacity-60">
                        <span className="material-symbols-outlined !text-[14px] normal-case">{t("icon_calendar_today")}</span>
                        {new Date(ticket.created_at).toLocaleDateString()}
                      </span>
                      <button className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] capitalize tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0">
                        {t("btn_view")} <span className="text-lg leading-none">&rarr;</span>
                      </button>
                    </div>
                  }
                >
                  <p className="text-xs text-[var(--subtext)] line-clamp-3 leading-relaxed font-bold opacity-70 group-hover:opacity-100 transition-opacity mt-4">
                    {ticket.description}
                  </p>
                </UniversalCard>
              ))}
            </div>
          );
        })()}
      </div>

      <TicketDossierSidePanel
        isOpen={!!selectedTicket}
        onClose={() => setSelectedTicket(null)}
        ticket={selectedTicket}
        isReadOnly={false}
        canReply={true}
        availableActions={["RESOLVED", "REJECTED", "ESCALATED", "PENDING"]}
        onTakeAction={handleTakeAction}
        onEditMetadata={onEditMetadata}
        onClaim={handleClaimTicket}
        onRelease={handleReleaseTicket}
        currentUserId={currentUserId}
        onReplyAdded={() => {
          fetchTickets();
        }}
      />
    </div>
  );
}



