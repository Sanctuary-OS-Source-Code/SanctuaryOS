import { useState, useEffect, useRef } from "react";
import { useLexicon } from "../LexiconContext";
import { useStore } from '../store';
import { supabase } from "../supabase";
import TicketDossierSidePanel from '../side-panels/TicketDossierSidePanel';
import { logArchitectAction } from "../lib/audit";
import { CustomDropdown, EmptyState, HoverTooltip, InlineFilterGroup } from "../shared";
import {
  SupportTicketCard,
  sortTicketsPriorityFirst,
  getTicketSupporterFlags,
} from "../components/universal/SupportTicketCard";
import { openSanctuaryContextMenu, SanctuaryContextMenuItem } from "../ContextMenu";
import { ElevatedHubLayout, HubOverviewLanding, HubOverviewSection, HubListGrid } from "../components/layouts/ElevatedHubLayout";
import SASupportSettings from "./SASupportSettings";
import {
  isTicketOpenStatus,
  isTicketClaimedBy,
  isTicketVisibleToStaff,
  invalidateHubCommandCache,
} from "../utils/hubCommandCache";

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

export default function ArchitectSupportTickets({
  userRole = "architect",
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
  const [priorityFilter, setPriorityFilter] = useState<"all" | "priority">("all");
  const [modNameMap, setModNameMap] = useState<Record<string, string>>({});
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryOptions, setCategoryOptions] = useState<any[]>([]);
  const [settingsCount, setSettingsCount] = useState<number>(0);
  const [settingsTypeFilter, setSettingsTypeFilter] = useState<"all" | "categories" | "log_sources">("all");
  const [settingsStatusFilter, setSettingsStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const openCatRef = useRef<(() => void) | null>(null);
  const openSourceRef = useRef<(() => void) | null>(null);
  const currentUserId = useStore(state => state.session?.user?.id);
  const showSettings = userRole === "oversight" || userRole === "wayfinder";

  useEffect(() => {
    if (initialTab) {
      setActiveFilter(initialTab);
    }
  }, [initialTab]);

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

      const [{ data: catData }, { count: sourcesCount }] = await Promise.all([
        supabase.from('sanctuary_support_categories').select('*'),
        supabase.from('sanctuary_telemetry_sources').select('*', { count: 'exact', head: true })
      ]);
      setSettingsCount((catData?.length || 0) + (sourcesCount || 0));

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

      const nextModNames: Record<string, string> = {};
      if (validModIds.length > 0) {
        const { data: modsData } = await supabase.from('mods').select('id, name, mason_id, compliance_tier').in('id', validModIds);
        modsData?.forEach(m => {
          modAuthorMap[m.id] = m.mason_id;
          modAuthorMap[`TIER_${m.id}`] = String(Number(m.compliance_tier || 0));
          if (m.name) nextModNames[m.id] = String(m.name);
        });
        hashes.forEach(h => {
          const resolvedId = modAuthorMap[`HASH_MAP_${h}`];
          if (resolvedId && nextModNames[resolvedId]) {
            nextModNames[h] = nextModNames[resolvedId];
          }
        });
      }
      setModNameMap(nextModNames);

      let finalTickets = mergedTickets;
      if (userRole !== "mason") {
        finalTickets = mergedTickets.filter(t => {
          if (!isTicketVisibleToStaff(t, currentUserId)) return false;

          const rawTargetModId = t.target_mod_id || t.metadata?.target_mod_id;
          const resolvedModId = rawTargetModId ? (modAuthorMap[`HASH_MAP_${rawTargetModId}`] || rawTargetModId) : null;
          const targetModTier = resolvedModId ? Number(modAuthorMap[`TIER_${resolvedModId}`] || 0) : 0;
          if (userRole === 'architect' && targetModTier > 0) return false;

          const claimer = isTicketClaimedBy(t);
          const claimedRole = t.metadata?.claimed_role
            ? String(t.metadata.claimed_role).toLowerCase()
            : "";
          if (claimer && claimedRole) {
            return claimedRole === userRole;
          }

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
          const isPriorityTicket = Boolean(
            t.metadata?.priority_ticket ||
              t.metadata?.is_mason_supporter ||
              t.metadata?.expedited_support
          );
          if (escalationPath === 'urgent' || isPriorityTicket) {
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

      setTickets(sortTicketsPriorityFirst(finalTickets));

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
  }, [currentUserId, userRole]);

  const handleTakeAction = async (actionType: "RESOLVED" | "REJECTED" | "ESCALATED" | "PENDING", reason: string) => {
    if (!selectedTicket) return;

    const newStatus = actionType.toUpperCase();

    const newMetadata: Record<string, any> = {
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

    if (actionType === "ESCALATED" || actionType === "RESOLVED" || actionType === "REJECTED") {
      delete newMetadata.claimed_by;
      delete newMetadata.claimed_role;
    } else if (actionType === "PENDING" && currentUserId && userRole !== "mason") {
      newMetadata.claimed_by = currentUserId;
      newMetadata.claimed_role = userRole;
    }

    const { error } = await supabase
      .from('sanctuary_tickets')
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

    if (userRole === "architect" || userRole === "oversight" || userRole === "wayfinder") {
      logArchitectAction(
        `Support Ticket ${actionType}: ${reason}`,
        'sanctuary_tickets',
        selectedTicket.id,
        reason,
        undefined,
        false,
        {
          status: { from: selectedTicket.status, to: newStatus },
          resolution_action: { to: actionType },
        }
      );
    }
    invalidateHubCommandCache();
    setSelectedTicket(null);
    fetchTickets();
  };

  const handleClaimTicket = async () => {
    if (!selectedTicket || !currentUserId) return;
    const newMetadata = {
      ...(selectedTicket.metadata || {}),
      claimed_by: currentUserId,
      ...(userRole !== "mason" ? { claimed_role: userRole } : {}),
    };
    const { error } = await supabase.from('sanctuary_tickets').update({ metadata: newMetadata }).eq('id', selectedTicket.id);
    if (!error) {
      invalidateHubCommandCache();
      setSelectedTicket({ ...selectedTicket, metadata: newMetadata });
      fetchTickets();
      useStore.getState().pushStatus(t("ticket_claim", "Claim Ticket") || "Ticket Claimed", "success");
    }
  };

  const handleReleaseTicket = async () => {
    if (!selectedTicket || !currentUserId) return;
    const newMetadata = { ...(selectedTicket.metadata || {}) };
    delete newMetadata.claimed_by;
    delete newMetadata.claimed_role;
    const { error } = await supabase.from('sanctuary_tickets').update({ metadata: newMetadata }).eq('id', selectedTicket.id);
    if (!error) {
      invalidateHubCommandCache();
      setSelectedTicket({ ...selectedTicket, metadata: newMetadata });
      fetchTickets();
      useStore.getState().pushStatus(t("ticket_release", "Release Ticket") || "Ticket Released", "success");
    }
  };

  const isClosedTicket = (tk: Ticket) => !isTicketOpenStatus(tk.status);
  const isClaimedTicket = (tk: Ticket) => {
    if (isClosedTicket(tk)) return false;
    if (userRole === "mason") {
      return ["PENDING", "INVESTIGATING"].includes(String(tk.status || "").toUpperCase());
    }
    return Boolean(currentUserId) && isTicketClaimedBy(tk) === String(currentUserId);
  };
  const isUnclaimedOpenTicket = (tk: Ticket) => !isClosedTicket(tk) && !isClaimedTicket(tk);

  const newCount = tickets.filter(isUnclaimedOpenTicket).length;
  const pendingCount = tickets.filter(isClaimedTicket).length;
  const closedCount = tickets.filter(isClosedTicket).length;

  const tabs = [
    {
      id: "overview",
      label: t("overview", "Overview") || "Overview",
      icon: t("icon_dashboard", "dashboard"),
      number: tickets.length.toString(),
    },
    {
      id: "new",
      label: t("new", "New"),
      icon: t("icon_new_releases", "new_releases"),
      number: newCount.toString(),
      colorClass: "text-[var(--danger)]",
    },
    {
      id: "pending",
      label: t("ticket_tab_claimed", "Claimed") || t("pending", "Pending") || "Pending",
      icon: t("icon_pending_actions", "pending_actions"),
      number: pendingCount.toString(),
      colorClass: "text-[var(--warning)]",
    },
    {
      id: "closed",
      label: t("filter_closed", "Closed") || "Closed",
      icon: t("icon_check_circle", "check_circle"),
      number: closedCount.toString(),
      colorClass: "text-[var(--success)]",
    },
    ...(showSettings
      ? [
          {
            id: "settings",
            label: t("settings", "Settings") || "Settings",
            icon: t("icon_settings", "settings"),
            number: settingsCount.toString(),
          },
        ]
      : [])
  ];

  const renderTicketCard = (ticket: Ticket) => {
    const rawModId = String(ticket.target_mod_id || ticket.metadata?.target_mod_id || "").trim();
    const resolvedModName = rawModId ? modNameMap[rawModId] || null : null;
    const replyCount = Array.isArray(ticket.metadata?.replies)
      ? ticket.metadata.replies.length
      : 0;

    return (
      <SupportTicketCard
        key={ticket.id}
        ticket={ticket}
        t={t}
        claimedBySelf={userRole !== "mason" && isClaimedTicket(ticket)}
        resolvedModName={resolvedModName}
        replyCount={replyCount}
        authorLabel={ticket.author_username || null}
        onClick={() => setSelectedTicket(ticket)}
        onContextMenu={(e) => {
          const menuItems: SanctuaryContextMenuItem[] = [
            {
              label: t("view_ticket", "View Ticket"),
              icon: t("icon_support_agent", "support_agent"),
              onClick: () => setSelectedTicket(ticket),
            },
            {
              label: t("copy", "Copy"),
              icon: t("icon_content_copy", "content_copy"),
              dividerBefore: true,
              onClick: () => navigator.clipboard?.writeText(String(ticket.description || ticket.title || "")),
            },
          ];
          openSanctuaryContextMenu(e, menuItems);
        }}
      />
    );
  };

  const renderLanding = () => {
    const claimedTickets = tickets.filter(isClaimedTicket);
    const newTickets = tickets.filter(isUnclaimedOpenTicket);

    return (
      <HubOverviewLanding>
        <HubOverviewSection
          title={
            userRole === "mason"
              ? t("in_progress", "In Progress")
              : t("ticket_tab_claimed", "Claimed")
          }
          icon={
            userRole === "mason"
              ? t("icon_pending_actions", "pending_actions")
              : t("icon_assignment_ind", "assignment_ind")
          }
          iconColorClass="text-[var(--warning)]"
          headerAction={
            <button
              type="button"
              onClick={() => setActiveFilter("pending")}
              className="px-3 flex items-center justify-center text-[var(--subtext)] hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_4%,transparent)] transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[16px]">
                {t("icon_arrow_forward", "arrow_forward")}
              </span>
              <HoverTooltip title={t("ticket_tab_claimed", "Claimed")} />
            </button>
          }
          isEmpty={claimedTickets.length === 0}
          emptyIcon={t("icon_done_all", "done_all")}
          emptyTitle={t("no_claimed_tickets", "No Claimed Tickets")}
        >
          {claimedTickets.slice(0, 6).map(renderTicketCard)}
        </HubOverviewSection>

        <HubOverviewSection
          title={t("recent_new_reports", "Recent New Reports") || "Recent New"}
          icon={t("icon_new_releases", "new_releases")}
          iconColorClass="text-[var(--danger)]"
          headerAction={
            <button
              type="button"
              onClick={() => setActiveFilter("new")}
              className="px-3 flex items-center justify-center text-[var(--subtext)] hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_4%,transparent)] transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[16px]">
                {t("icon_arrow_forward", "arrow_forward")}
              </span>
              <HoverTooltip title={t("recent_new_reports", "Recent New Reports")} />
            </button>
          }
          isEmpty={newTickets.length === 0}
          emptyIcon={t("icon_support_agent", "support_agent")}
          emptyTitle={
            userRole === "mason"
              ? t("no_bug_reports", "No bug reports found.")
              : t("no_tickets", "No Support Tickets")
          }
        >
          {newTickets.slice(0, 6).map(renderTicketCard)}
        </HubOverviewSection>
      </HubOverviewLanding>
    );
  };

  const filteredTickets = tickets.filter(tk => {
    if (priorityFilter === "priority" && !getTicketSupporterFlags(tk).isPriority) {
      return false;
    }
    if (activeCategory !== "all") {
      const tCat = tk.ticket_type || tk.category || "GENERAL";
      if (tCat !== activeCategory) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!(tk.title?.toLowerCase().includes(q) || tk.description?.toLowerCase().includes(q))) return false;
    }

    if (activeFilter === "new") {
      return isUnclaimedOpenTicket(tk);
    } else if (activeFilter === "pending") {
      return isClaimedTicket(tk);
    } else if (activeFilter === "closed") {
      return isClosedTicket(tk);
    }

    return true;
  });

  return (
    <ElevatedHubLayout
      search={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder={t("nav_search", "Search...") as string}
      hideSearch={activeFilter === 'overview'}
      activeTab={activeFilter}
      onTabChange={(id) => setActiveFilter(id as any)}
      tabs={tabs}
      primaryPopover={
        activeFilter === 'settings'
          ? {
              icon: t("icon_tune", "tune"),
              label: t("filters", "Filters") || "Filters",
              content: (
                <div className="flex flex-col w-[300px] p-4 text-left gap-4">
                  <div className="flex flex-col w-full gap-2">
                    <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 px-1 flex items-center gap-2">
                      {t("filter_type", "Type") || "Type"}
                    </div>
                    <CustomDropdown
                      flat={true}
                      variant="pill"
                      value={settingsTypeFilter}
                      onChange={(v: string[]) => setSettingsTypeFilter((v[0] as any) || "all")}
                      options={[
                        { id: "all", label: t("all_types", "All Types") },
                        { id: "categories", label: t("active_categories", "Categories") },
                        { id: "log_sources", label: t("active_log_sources", "Log Sources") }
                      ]}
                      disableTint={true}
                    />
                  </div>
                  <div className="flex flex-col w-full gap-2">
                    <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 px-1 flex items-center gap-2">
                      {t("status", "Status") || "Status"}
                    </div>
                    <CustomDropdown
                      flat={true}
                      variant="pill"
                      value={settingsStatusFilter}
                      onChange={(v: string[]) => setSettingsStatusFilter((v[0] as any) || "all")}
                      options={[
                        { id: "all", label: t("all", "All") },
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
                  <div className="flex flex-col w-[300px] p-4 text-left gap-4">
                    <div className="flex flex-col w-full gap-2">
                      <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 px-1 flex items-center gap-2">
                        {t("category", "Category") || "Category"}
                      </div>
                      <CustomDropdown
                        flat={true}
                        variant="pill"
                        value={activeCategory}
                        onChange={(v: string[]) => setActiveCategory(v[0])}
                        options={categoryOptions.length > 0 ? categoryOptions : [{ id: "all", label: t("all_types", "All Types") }]}
                        disableTint={true}
                      />
                    </div>
                    <div className="flex flex-col w-full gap-2">
                      <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 px-1 flex items-center gap-2">
                        {t("ticket_filter_queue", "Priority Queue")}
                      </div>
                      <InlineFilterGroup
                        value={priorityFilter}
                        onChange={(v) => setPriorityFilter(v as "all" | "priority")}
                        options={[
                          { id: "all", label: t("filter_all", "All") },
                          { id: "priority", label: t("ticket_filter_priority_only", "Priority Only") },
                        ]}
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
              ...(settingsTypeFilter !== "log_sources"
                ? [
                    {
                      id: "add_cat",
                      icon: t("icon_add", "add"),
                      label: t("support_add_cat", "Add Category"),
                      onClick: () => openCatRef.current?.()
                    }
                  ]
                : []),
              ...(settingsTypeFilter !== "categories"
                ? [
                    {
                      id: "add_source",
                      icon: t("icon_post_add", "post_add"),
                      label: t("telemetry_add_source", "Add Source"),
                      onClick: () => openSourceRef.current?.()
                    }
                  ]
                : [])
            ]
          : undefined
      }
    >
      {activeFilter === 'settings' ? (
        <SASupportSettings
          embedded={true}
          externalSearch={searchQuery}
          typeFilter={settingsTypeFilter}
          statusFilter={settingsStatusFilter}
          openCatRef={openCatRef}
          openSourceRef={openSourceRef}
          onCountsChange={setSettingsCount}
        />
      ) : isLoading ? (
        <EmptyState
          icon={t("icon_sync", "sync")}
          title={t("loading_tickets", "Loading support tickets...")}
        />
      ) : activeFilter === 'overview' ? (
        renderLanding()
      ) : (
        <HubListGrid
          isEmpty={filteredTickets.length === 0}
          emptyIcon={
            searchQuery
              ? t("icon_search_off", "search_off")
              : userRole === "mason"
                ? t("icon_celebration", "celebration")
                : t("icon_support_agent", "support_agent")
          }
          emptyTitle={
            searchQuery
              ? t("no_matches", "No matches found")
              : userRole === "mason" && activeFilter === "new"
                ? t("no_bug_reports", "No bug reports found.")
                : t("no_tickets", "No Support Tickets")
          }
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
