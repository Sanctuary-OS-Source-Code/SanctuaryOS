import React, { useState, useEffect, useRef } from "react";
import { useLexicon } from "../LexiconContext";
import { useStore } from '../store';
import { supabase, supabaseAuth } from "../supabase";
import TicketDossierSidePanel from '../side-panels/TicketDossierSidePanel';
import { logArchitectAction } from "../lib/audit";
import { CustomDropdown, EmptyState } from "../shared";
import { UniversalCard } from "../components/universal/UniversalCard";
import { ElevatedHubLayout, HubOverviewLanding, HubOverviewSection } from "../components/layouts/ElevatedHubLayout";
import KeeperSupportSettings from "./KeeperSupportSettings";

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

const VAULT_CHIP_CLASS = "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

export default function KeepersSupportTickets({
  userRole = "keeper",
  masonProfileId,
  onEditMetadata,
  setStatus,
  initialTab
}: {
  userRole?: string;
  masonProfileId?: string;
  onEditMetadata?: (hash: string) => void;
  setStatus?: any;
  initialTab?: "overview" | "new" | "pending" | "closed" | "settings";
}) {
  const { t } = useLexicon();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<"overview" | "new" | "pending" | "closed" | "settings">(initialTab || "overview");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryOptions, setCategoryOptions] = useState<any[]>([]);
  const [settingsCount, setSettingsCount] = useState<number>(0);
  const [settingsStatusFilter, setSettingsStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const openCatRef = useRef<(() => void) | null>(null);
  const currentUserId = useStore(state => state.session?.user?.id);

  useEffect(() => {
    if (initialTab) {
      setActiveFilter(initialTab);
    }
  }, [initialTab]);

  const fetchTickets = async () => {
    setIsLoading(true);
    let query = supabaseAuth
      .from('keeper_tickets')
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

      const { data: catData } = await supabaseAuth.from('keeper_support_categories').select('*');
      setSettingsCount(catData?.length || 0);

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

      setTickets(finalTickets);

      const uniqueCats = [...new Set(finalTickets.map(t => t.ticket_type || t.category || "GENERAL"))];
      const dynamicOptions = [
        { id: "all", label: t("all_types", "All Types") },
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

    const { error } = await supabaseAuth
      .from('keeper_tickets')
      .update({
        status: newStatus,
        metadata: newMetadata
      })
      .eq('id', selectedTicket.id);

    if (error) {
      useStore.getState().pushStatus(t("err_save_failed", "Save failed:") + " " + error.message, "error");
      return;
    }

    useStore.getState().pushStatus(t("auto_ticket_status_updated_39", "Ticket status updated."), "success");

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
      useStore.getState().pushStatus(t("ticket_claim", "Claim Ticket") || "Ticket Claimed", "success");
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
      useStore.getState().pushStatus(t("ticket_release", "Release Ticket") || "Ticket Released", "success");
    }
  };

  const renderTicketCard = (ticket: Ticket) => {
    const statusLower = ticket.status?.toLowerCase() || 'new';
    const isNew = statusLower === 'new' || statusLower === 'open';
    const isResolved = statusLower === 'closed' || statusLower === 'resolved';
    const isRejected = statusLower === 'rejected';
    const isPending = statusLower === 'investigating' || statusLower === 'pending';
    const isEscalated = statusLower === 'escalated';

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

    const statusLabel = isNew
      ? t("ticket_status_open", "Open")
      : isResolved
        ? t("ticket_status_resolved", "Resolved")
        : isRejected
          ? t("ticket_status_rejected", "Rejected")
          : isEscalated
            ? t("ticket_status_escalated", "Escalated")
            : isPending
              ? t("ticket_status_pending", "Pending")
              : t(`ticket_status_${statusLower}`, ticket.status || "Open");

    return (
      <UniversalCard
        key={ticket.id}
        onClick={() => setSelectedTicket(ticket)}
        layout="vertical"
        isGhosted={isResolved || isRejected}
        icon={t("icon_support_agent", "support_agent")}
        imageOverlay={
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
            <div className={VAULT_CHIP_CLASS}>
              <span className={`material-symbols-outlined !text-[12px] ${statusIconColor}`}>
                {statusIcon}
              </span>
              <span>{statusLabel}</span>
            </div>
            {(ticket.metadata?.expedited_support || ticket.metadata?.urgent) && (
              <div className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                  {t("icon_bolt", "bolt")}
                </span>
                <span>{t("urgent", "Urgent")}</span>
              </div>
            )}
          </div>
        }
        title={ticket.title}
        subtitle={ticket.author_username ? `${ticket.author_username} • #${ticket.id.slice(0, 8)}` : `#${ticket.id.slice(0, 8)}`}
        badges={
          <>
            {(ticket.ticket_type || ticket.category) && (
              <div className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                  {t("icon_local_activity", "local_activity")}
                </span>
                <span>{(ticket.ticket_type || ticket.category || "").replace(/_/g, " ")}</span>
              </div>
            )}
            {(ticket.target_mod_id || ticket.metadata?.target_mod_id) && (
              <div className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                  {t("icon_extension", "extension")}
                </span>
                <span className="truncate max-w-[140px]">
                  {String(ticket.target_mod_id || ticket.metadata?.target_mod_id).slice(0, 12)}
                </span>
              </div>
            )}
          </>
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
  };

  const renderLanding = () => {
    const newTickets = tickets.filter(t => ['NEW', 'OPEN', 'new', 'open'].includes(t.status) || !t.status);
    const pendingTickets = tickets.filter(t => ['PENDING', 'ESCALATED', 'INVESTIGATING', 'pending', 'escalated', 'investigating'].includes(t.status));

    return (
      <HubOverviewLanding>
        <HubOverviewSection
          title={t("recent_new_reports", "Recent New Reports") || "Recent New"}
          icon={t("icon_new_releases", "new_releases")}
          iconColorClass="text-[var(--danger)]"
          isEmpty={newTickets.length === 0}
          emptyState={<EmptyState icon={t("icon_support_agent", "support_agent")} title={t("no_bug_reports", "NO BUG REPORTS DETECTED.\nYOUR CODE IS FLAWLESS.") || "No New Tickets"} className="py-8" />}
        >
          {newTickets.slice(0, 4).map(renderTicketCard)}
        </HubOverviewSection>

        <HubOverviewSection
          title={t("recent_pending", "Recent Pending") || "Recent Pending"}
          icon={t("icon_pending_actions", "pending_actions")}
          iconColorClass="text-[var(--warning)]"
          isEmpty={pendingTickets.length === 0}
          emptyState={<EmptyState icon={t("icon_done_all", "done_all")} title={t("no_tickets", "No Support Tickets") || "No Pending Tickets"} className="py-8" />}
        >
          {pendingTickets.slice(0, 4).map(renderTicketCard)}
        </HubOverviewSection>
      </HubOverviewLanding>
    );
  };

  const tabs = [
    {
      id: "overview",
      label: t("overview", "Overview") || "Overview",
      icon: t("icon_dashboard", "dashboard"),
      number: tickets.length.toString(),
    },
    {
      id: "new",
      label: t("badge_new", "NEW"),
      icon: t("icon_new_releases", "new_releases"),
      number: tickets.filter(t => ['NEW', 'OPEN', 'new', 'open'].includes(t.status) || !t.status).length.toString(),
    },
    {
      id: "pending",
      label: t("ticket_tab_claimed", "Claimed") || t("pending", "Pending"),
      icon: t("icon_pending_actions", "pending_actions"),
      number: tickets.filter(t => ['PENDING', 'ESCALATED', 'INVESTIGATING', 'pending', 'escalated', 'investigating'].includes(t.status)).length.toString(),
    },
    {
      id: "closed",
      label: t("filter_closed", "Closed"),
      icon: t("icon_check_circle", "check_circle"),
      number: tickets.filter(t => ['RESOLVED', 'REJECTED', 'CLOSED', 'resolved', 'rejected', 'closed'].includes(t.status)).length.toString(),
      colorClass: "text-[var(--success)]",
    },
    {
      id: "settings",
      label: t("settings", "Settings") || "Settings",
      icon: t("icon_settings", "settings"),
      number: settingsCount.toString(),
    }
  ];

  return (
    <ElevatedHubLayout
      headerTitle={t("support_tickets", "Support Tickets") || "Support Tickets"}
      headerSubtitle={t("hub_subtitle_tickets", "Manage and resolve {citizen} support requests.") || "Manage and resolve citizen support requests."}
      headerIcon={t("icon_support_agent", "support_agent")}
      headerIconColorClass="text-[var(--accent)]"
      search={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder={t("nav_search", "Search...")}
      hideSearch={activeFilter === 'overview'}
      tabs={tabs}
      activeTab={activeFilter}
      onTabChange={(id) => setActiveFilter(id as any)}
      primaryPopover={
        activeFilter === 'settings'
          ? {
              icon: t("icon_tune", "tune"),
              label: t("filters", "Filters") || "Filters",
              content: (
                <div className="flex flex-col w-[300px] p-4 max-w-[calc(100vw-40px)] gap-4">
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("status", "Status") || "Status"}</span>
                    <CustomDropdown
                      flat={true}
                      variant="pill"
                      value={settingsStatusFilter}
                      onChange={(v: string[]) => setSettingsStatusFilter((v[0] as any) || "all")}
                      options={[
                        { id: "all", label: t("all_classes", "All Categories") },
                        { id: "active", label: t("support_active_only", "Active Only") },
                        { id: "inactive", label: t("support_inactive_only", "Inactive Only") }
                      ]}
                      disableTint={true}
                    />
                  </div>
                </div>
              )
            }
          : activeFilter !== 'overview'
            ? {
                icon: t("icon_tune", "tune"),
                label: t("filters", "Filters") || "Filters",
                content: (
                  <div className="flex flex-col w-[300px] p-4 max-w-[calc(100vw-40px)] gap-4">
                    <div className="flex flex-col gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("category", "Category") || "Category"}</span>
                      <CustomDropdown
                        flat={true}
                        variant="pill"
                        value={activeCategory}
                        onChange={(v: string[]) => setActiveCategory(v[0])}
                        options={categoryOptions.length > 0 ? categoryOptions : [{ id: "all", label: t("all_types", "All Types") }]}
                        disableTint={true}
                      />
                    </div>
                  </div>
                )
              }
            : undefined
      }
      actions={
        activeFilter === 'settings'
          ? [
              {
                id: "add_cat",
                icon: t("icon_add", "add"),
                label: t("support_add_cat", "Add Category"),
                onClick: () => openCatRef.current?.()
              }
            ]
          : undefined
      }
    >
      {activeFilter === 'settings' ? (
        <KeeperSupportSettings
          embedded={true}
          externalSearch={searchQuery}
          statusFilter={settingsStatusFilter}
          openCatRef={openCatRef}
          onCountsChange={setSettingsCount}
        />
      ) : activeFilter === 'overview' ? renderLanding() : (
        <div className="flex flex-col gap-4">
          {isLoading ? (
            <div className="flex justify-center items-center h-40 opacity-50">
              <span className="text-sm font-bold animate-pulse capitalize tracking-widest">{t("ui_btn_processing", "Processing...")}</span>
            </div>
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
              <EmptyState icon={searchQuery ? t("icon_search_off", "search_off") : t("icon_celebration", "celebration")} title={searchQuery ? t("no_matches", "No matches found") : (activeFilter === 'new' ? t("no_bug_reports", "NO BUG REPORTS DETECTED.\nYOUR CODE IS FLAWLESS.") : t("no_tickets", "No Support Tickets"))} className="col-span-full py-16" />
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
