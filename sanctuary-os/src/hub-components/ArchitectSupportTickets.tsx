import React, { useState, useEffect } from "react";
import { useLexicon } from "../LexiconContext";
import { useStore } from '../store';
import { supabase } from "../supabase";
import TicketDossierSidePanel from '../side-panels/TicketDossierSidePanel';
import { logArchitectAction } from "../lib/audit";
import { SidePanel, CustomDropdown, EmptyState, ScreenUtilityBar, FilterTabs, FilterTabButton, FilterPopover } from "../shared";
import { UniversalCard } from "../components/universal/UniversalCard";
import { ElevatedHubLayout } from "../components/layouts/ElevatedHubLayout";

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

export default function ArchitectSupportTickets({ userRole = "architect", masonProfileId, onEditMetadata, setStatus }: { userRole?: string, masonProfileId?: string, onEditMetadata?: (hash: string) => void, setStatus?: any }) {
  const { t } = useLexicon();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<"overview" | "new" | "pending" | "closed">("overview");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryOptions, setCategoryOptions] = useState<any[]>([]);
  const currentUserId = useStore(state => state.session?.user?.id);

  const fetchTickets = async () => {
    setIsLoading(true);
    let query = supabase
      .from('sanctuary_tickets')
      .select('*')
      .order('created_at', { ascending: false });


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

      const { data: catData } = await supabase.from('sanctuary_support_categories').select('*');

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
      if (userRole !== "mason") {
        finalTickets = mergedTickets.filter(t => {
          const typeStr = t.ticket_type || t.category;
          const cat = catData?.find((c: any) => c.category_name === typeStr || c.category_code === typeStr);
          let baseDest = cat?.ticket_destination || 'architect';
          if (typeStr === 'BUG_MOD' || typeStr?.toLowerCase().includes('bug_mod') || typeStr?.toLowerCase().includes('artifact')) {
            baseDest = 'mod_author';
          }
          const escalationPath = cat?.escalation_path || 'standard';

          if (userRole === 'wayfinder') {
            const isTargeted = baseDest === 'wayfinder';
            const logs = t.metadata?.action_log || [];
            const isEscalatedFromOversight = t.status?.toUpperCase() === 'ESCALATED' &&
              logs.some((l: any) => l.action === 'ESCALATED' && (l.architect === 'Oversight' || l.architect === 'Mason'));
            return isTargeted || isEscalatedFromOversight;
          }

          const ageMs = Date.now() - new Date(t.created_at).getTime();
          const hoursOld = ageMs / (1000 * 60 * 60);

          let escalationTiers = 0;
          if (escalationPath === 'urgent') {
            escalationTiers = Math.floor(hoursOld / 24);
          } else if (escalationPath === 'standard') {
            escalationTiers = Math.floor(hoursOld / 72);
          }

          const tiers = ['mod_author', 'architect', 'oversight', 'wayfinder'];
          let currentTierIndex = tiers.indexOf(baseDest);
          if (currentTierIndex === -1) currentTierIndex = 1;

          let effectiveTierIndex = currentTierIndex;
          if (escalationPath?.toLowerCase() !== 'none') {
            effectiveTierIndex += escalationTiers;
          }


          effectiveTierIndex = Math.min(effectiveTierIndex, Math.max(2, currentTierIndex));
          let dest = tiers[effectiveTierIndex];

          if (t.status?.toUpperCase() === 'ESCALATED') {
            const logs = t.metadata?.action_log || [];
            const lastEscalation = [...logs].reverse().find((l: any) => l.action === 'ESCALATED');

            if (lastEscalation) {
              const esciArc = lastEscalation.architect;
              if (esciArc === 'Wayfinder') {
                dest = 'wayfinder';
              } else if (esciArc === 'Oversight' || esciArc === 'Oversight') {
                dest = 'wayfinder';
              } else if (esciArc === 'Architect') {
                dest = 'oversight';
              } else if (esciArc === 'Mason' || esciArc === 'Mod Author') {
                dest = 'architect';
              } else {
                dest = tiers[Math.min(currentTierIndex + 1, tiers.length - 1)];
              }
            } else {
              dest = tiers[Math.min(currentTierIndex + 1, tiers.length - 1)];
            }
          }

          if (dest === 'mod_author') {
            const modId = t.target_mod_id || t.metadata?.target_mod_id;
            let modAuthorId = modId ? modAuthorMap[modId] : null;
            if (!modAuthorId && modId && modAuthorMap[`HASH_MAP_${modId}`]) {
              modAuthorId = modAuthorMap[modAuthorMap[`HASH_MAP_${modId}`]];
            }
            if (!modAuthorId) dest = 'architect';
          }

          if (dest !== userRole) return false;

          return true;
        });
      }

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
  }, []);

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

    const { error } = await supabase
      .from('sanctuary_tickets')
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

    if (userRole === "architect") {
      logArchitectAction(`Support Ticket ${actionType}: ${reason}`, 'sanctuary_tickets', selectedTicket.id);
    }
    setSelectedTicket(null);
    fetchTickets();
  };

  const handleClaimTicket = async () => {
    if (!selectedTicket || !currentUserId) return;
    const newMetadata = { ...(selectedTicket.metadata || {}), claimed_by: currentUserId };
    const { error } = await supabase.from('sanctuary_tickets').update({ metadata: newMetadata }).eq('id', selectedTicket.id);
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
    const { error } = await supabase.from('sanctuary_tickets').update({ metadata: newMetadata }).eq('id', selectedTicket.id);
    if (!error) {
      setSelectedTicket({ ...selectedTicket, metadata: newMetadata });
      fetchTickets();
      useStore.getState().pushStatus(t("ticket_release") || "Ticket Released", "success");
    }
  };

  const tabs = [
    {
      id: "overview",
      label: t("landing_overview") || "Overview",
      icon: "dashboard",
    },
    {
      id: "new",
      label: t("ui_tab_new"),
      icon: "new_releases",
      number: tickets.filter(t => ['NEW', 'OPEN', 'new', 'open'].includes(t.status)).length,
    },
    {
      id: "pending",
      label: t("ticket_tab_claimed") || t("pending"),
      icon: "pending_actions",
      number: tickets.filter(t => ['PENDING', 'ESCALATED', 'INVESTIGATING', 'pending', 'escalated', 'investigating'].includes(t.status)).length,
    },
    {
      id: "closed",
      label: t("ui_tab_closed"),
      icon: "check_circle",
      number: tickets.filter(t => ['RESOLVED', 'REJECTED', 'CLOSED', 'resolved', 'rejected', 'closed'].includes(t.status)).length,
    }
  ];

  const renderTicketCard = (ticket: Ticket) => (
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
        <div className="flex justify-start items-center w-full">
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
  );

  const renderLanding = () => {
    const newTickets = tickets.filter(t => ['NEW', 'OPEN', 'new', 'open'].includes(t.status));
    const pendingTickets = tickets.filter(t => ['PENDING', 'ESCALATED', 'INVESTIGATING', 'pending', 'escalated', 'investigating'].includes(t.status));

    return (
      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between gap-4 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-4">
            <h3 className="text-sm font-black text-[var(--text)] tracking-widest uppercase flex items-center gap-2">
              <span className="material-symbols-outlined !text-[18px] text-[var(--danger)]">new_releases</span>
              {t("recent_new_reports") || "Recent New"}
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
            {newTickets.slice(0, 10).length > 0 ? newTickets.slice(0, 10).map(renderTicketCard) : (
              <EmptyState icon="support_agent" title={t("no_bug_reports") || "No New Tickets"} className="py-8" />
            )}
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between gap-4 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-4">
            <h3 className="text-sm font-black text-[var(--text)] tracking-widest uppercase flex items-center gap-2">
              <span className="material-symbols-outlined !text-[18px] text-[var(--warning)]">pending_actions</span>
              {t("recent_pending") || "Recent Pending"}
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
            {pendingTickets.slice(0, 10).length > 0 ? pendingTickets.slice(0, 10).map(renderTicketCard) : (
              <EmptyState icon="done_all" title={t("no_tickets") || "No Pending Tickets"} className="py-8" />
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <ElevatedHubLayout
      headerTitle={t("support_tickets") || "Support Tickets"}
      headerSubtitle={t("support_tickets_desc") || "Manage and review user support tickets."}
      headerIcon="support_agent"
      headerIconColorClass="theme-text-accent"
      search={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder={t("ui_placeholder_search")}
      tabs={tabs}
      activeTab={activeFilter}
      onTabChange={(tabId) => setActiveFilter(tabId as any)}
      headerActions={
        <FilterPopover icon="tune" label="" className="shrink-0">
          <div className="flex flex-col gap-2 p-4">
            <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-1">{t("filter_by_type") || "Filter Type"}</label>
            <CustomDropdown
              value={activeCategory}
              onChange={(v: string[]) => setActiveCategory(v[0])}
              options={categoryOptions.length > 0 ? categoryOptions : [{ id: "all", label: t("ui_tab_all_types") }]}
              disableTint={true}
            />
          </div>
        </FilterPopover>
      }
    >
      {activeFilter === 'overview' ? renderLanding() : (
        <div className="flex flex-col gap-4">
          {isLoading ? (
            <div className="h-full flex items-center justify-center theme-text-accent font-black tracking-widest text-xs capitalize animate-pulse">{t("intercepting")}</div>
          ) : (() => {
            const filteredTickets = tickets.filter(t => {
              if (activeCategory !== "all") {
                const tCat = t.ticket_type || t.category || "GENERAL";
                if (tCat !== activeCategory) return false;
              }
              if (searchQuery) {
                const q = searchQuery.toLowerCase();
                if (!(t.title?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q))) return false;
              }

              const isClaimedByMe = t.metadata?.claimed_by === currentUserId;
              const isClaimedByOther = t.metadata?.claimed_by && !isClaimedByMe;

              if (activeFilter === "new") {
                if (!['NEW', 'OPEN', 'new', 'open'].includes(t.status)) return false;
                if (isClaimedByOther || isClaimedByMe) return false;
              } else if (activeFilter === "pending") {
                if (!['NEW', 'OPEN', 'new', 'open', 'PENDING', 'ESCALATED', 'INVESTIGATING', 'pending', 'escalated', 'investigating'].includes(t.status)) return false;
                if (!isClaimedByMe) return false;
              } else if (activeFilter === "closed") {
                if (!['RESOLVED', 'REJECTED', 'CLOSED', 'resolved', 'rejected', 'closed'].includes(t.status)) return false;
              }

              return true;
            });

            if (filteredTickets.length === 0) return (
              <EmptyState icon={searchQuery ? "search_off" : t("icon_celebration")} title={searchQuery ? t("no_matches") : (activeFilter === 'new' ? t("no_bug_reports") : t("no_tickets"))} className="col-span-full py-16" />
            );

            return (
              <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
                {filteredTickets.map(renderTicketCard)}
              </div>
            );
          })()}
        </div>
      )}
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
    </ElevatedHubLayout>
  );
}



