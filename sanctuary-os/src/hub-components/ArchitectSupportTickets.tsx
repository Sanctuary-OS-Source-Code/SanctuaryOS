import React, { useState, useEffect } from "react";
import { useLexicon } from "../LexiconContext";
import { useStore } from '../store';
import { supabase } from "../supabase";
import TicketDossierSidePanel from '../side-panels/TicketDossierSidePanel';
import { logArchitectAction } from "../lib/audit";
import { SidePanel, CustomDropdown, EmptyState } from "../shared";
import { UniversalCard } from "../components/universal/UniversalCard";
import { ElevatedHubLayout, HubOverviewLanding, HubOverviewSection, HubListGrid } from "../components/layouts/ElevatedHubLayout";

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

  const newCount = tickets.filter(t => ['NEW', 'OPEN', 'new', 'open'].includes(t.status) || !t.status).length;
  const pendingCount = tickets.filter(t => ['PENDING', 'ESCALATED', 'INVESTIGATING', 'pending', 'escalated', 'investigating'].includes(t.status)).length;
  const closedCount = tickets.filter(t => ['RESOLVED', 'REJECTED', 'CLOSED', 'resolved', 'rejected', 'closed'].includes(t.status)).length;

  const tabs = [
    {
      id: "overview",
      label: t("landing_overview") || "Overview",
      icon: "dashboard",
      number: tickets.length.toString(),
    },
    {
      id: "new",
      label: t("ui_tab_new") || "New",
      icon: "new_releases",
      number: newCount.toString(),
      colorClass: "text-[var(--danger)]",
    },
    {
      id: "pending",
      label: t("ticket_tab_claimed") || t("pending") || "Pending",
      icon: "pending_actions",
      number: pendingCount.toString(),
      colorClass: "text-[var(--warning)]",
    },
    {
      id: "closed",
      label: t("ui_tab_closed") || "Closed",
      icon: "check_circle",
      number: closedCount.toString(),
      colorClass: "text-[var(--success)]",
    }
  ];

  const renderTicketCard = (ticket: Ticket) => {
    const statusLower = ticket.status?.toLowerCase() || 'new';
    const isNew = statusLower === 'new' || statusLower === 'open';
    const isClosed = statusLower === 'closed' || statusLower === 'resolved' || statusLower === 'rejected';
    const isPending = statusLower === 'investigating' || statusLower === 'pending';
    const isEscalated = statusLower === 'escalated';

    return (
      <UniversalCard
        key={ticket.id}
        onClick={() => setSelectedTicket(ticket)}
        layout="vertical"
        icon={isNew ? 'support_agent' : isClosed ? 'done_all' : isPending ? 'warning' : isEscalated ? 'priority_high' : 'bug_report'}
        title={ticket.title}
        statusColor={
          isNew ? 'border-[color-mix(in_srgb,var(--danger)_50%,transparent)]' :
            isClosed ? 'border-[color-mix(in_srgb,var(--success)_50%,transparent)]' :
              isPending ? 'border-[color-mix(in_srgb,var(--warning)_50%,transparent)]' :
                isEscalated ? 'border-[color-mix(in_srgb,var(--accent)_50%,transparent)]' : undefined
        }
        badges={[
          <span key="status" className={`px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest capitalize border shadow-inner transition-colors
              ${isNew ? 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_20%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)]' : ''}
              ${isClosed ? 'bg-[color-mix(in_srgb,var(--success)_10%,transparent)] text-[var(--success)] border-[color-mix(in_srgb,var(--success)_20%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)]' : ''}
              ${isPending ? 'bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] text-[var(--warning)] border-[color-mix(in_srgb,var(--warning)_20%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--warning)_20%,transparent)]' : ''}
              ${isEscalated ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_20%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]' : ''}
              ${!isNew && !isClosed && !isPending && !isEscalated ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_20%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]' : ''}
          `}>
            {isNew ? (t("ui_tab_new") || "New") : (t(`ticket_status_${statusLower}`) || ticket.status || "NEW")}
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
    );
  };

  const renderLanding = () => {
    const newTickets = tickets.filter(t => ['NEW', 'OPEN', 'new', 'open'].includes(t.status) || !t.status);
    const pendingTickets = tickets.filter(t => ['PENDING', 'ESCALATED', 'INVESTIGATING', 'pending', 'escalated', 'investigating'].includes(t.status));

    return (
      <HubOverviewLanding>
        <HubOverviewSection
          title={t("recent_new_reports") || "Recent New"}
          icon="new_releases"
          iconColorClass="text-[var(--danger)]"
          isEmpty={newTickets.length === 0}
          emptyIcon="support_agent"
          emptyTitle={t("no_bug_reports") || "No New Tickets"}
        >
          {newTickets.slice(0, 6).map(renderTicketCard)}
        </HubOverviewSection>

        <HubOverviewSection
          title={t("recent_pending") || "Recent Pending"}
          icon="pending_actions"
          iconColorClass="text-[var(--warning)]"
          isEmpty={pendingTickets.length === 0}
          emptyIcon="done_all"
          emptyTitle={t("no_tickets") || "No Pending Tickets"}
        >
          {pendingTickets.slice(0, 6).map(renderTicketCard)}
        </HubOverviewSection>
      </HubOverviewLanding>
    );
  };

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
      if (!(['NEW', 'OPEN', 'new', 'open'].includes(t.status) || !t.status)) return false;
      if (isClaimedByOther || isClaimedByMe) return false;
    } else if (activeFilter === "pending") {
      if (!(['NEW', 'OPEN', 'new', 'open', 'PENDING', 'ESCALATED', 'INVESTIGATING', 'pending', 'escalated', 'investigating'].includes(t.status) || !t.status)) return false;
      if (!isClaimedByMe && !['PENDING', 'ESCALATED', 'INVESTIGATING', 'pending', 'escalated', 'investigating'].includes(t.status)) return false;
    } else if (activeFilter === "closed") {
      if (!['RESOLVED', 'REJECTED', 'CLOSED', 'resolved', 'rejected', 'closed'].includes(t.status)) return false;
    }

    return true;
  });

  return (
    <ElevatedHubLayout
      search={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder={t("ui_placeholder_search") as string}
      hideSearch={activeFilter === 'overview'}
      activeTab={activeFilter}
      onTabChange={(id) => setActiveFilter(id as any)}
      tabs={tabs}
      primaryPopover={activeFilter !== 'overview' ? {
        icon: "tune",
        label: t("filters") || "Filters",
        content: (
          <div className="flex flex-col w-[300px] p-4 text-left">
            <div className="flex flex-col mb-5 w-full">
              <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-2.5 px-1 flex items-center gap-2">
                {t("category") || "Category"}
              </div>
              <CustomDropdown
                flat={true}
                variant="pill"
                value={activeCategory}
                onChange={(v: string[]) => setActiveCategory(v[0])}
                options={categoryOptions.length > 0 ? categoryOptions : [{ id: "all", label: t("ui_tab_all_types") }]}
                disableTint={true}
              />
            </div>
          </div>
        )
      } : undefined}
    >
      {isLoading ? (
        <div className="h-full flex items-center justify-center theme-text-accent font-black tracking-widest text-xs capitalize animate-pulse">{t("intercepting")}</div>
      ) : activeFilter === 'overview' ? (
        renderLanding()
      ) : (
        <HubListGrid
          isEmpty={filteredTickets.length === 0}
          emptyIcon={searchQuery ? "search_off" : t("icon_celebration")}
          emptyTitle={searchQuery ? t("no_matches") : (activeFilter === 'new' ? t("no_bug_reports") : t("no_tickets"))}
        >
          {filteredTickets.map(renderTicketCard)}
        </HubListGrid>
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




