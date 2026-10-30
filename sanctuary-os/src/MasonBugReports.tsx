import { useState, useEffect } from "react";
import { EmptyState } from "./shared";
import { ElevatedHubLayout, HubOverviewLanding, HubOverviewSection } from "./components/layouts/ElevatedHubLayout";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import TicketDossierSidePanel from './side-panels/TicketDossierSidePanel';
import { useStore } from "./store";
import { UniversalCard } from "./components/universal/UniversalCard";

const VAULT_CHIP_CLASS = "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

export default function MasonBugReports({ masonId, onEditMetadata }: { masonId?: string, onEditMetadata?: (hash: string) => void }) {
    const { t } = useLexicon();
    const [tickets, setTickets] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [activeTab, setActiveTab] = useState<"LANDING" | "pending" | "open" | "closed">("LANDING");

    const fetchBugReports = async () => {
        setIsLoading(true);

        const { data, error } = await supabase
            .from('sanctuary_tickets')
            .select('*')
            .order('created_at', { ascending: false });

        const { data: { user } } = await supabase.auth.getUser();

        if (data && !error) {
            let filtered = data.filter(t => {
                const typeStr = (t.ticket_type || t.category || '').toLowerCase();
                return (typeStr.includes('bug') || typeStr.includes('artifact')) && !typeStr.includes('os');
            });

            if (masonId || user) {
                let masonModIds: string[] = [];
                let query = supabase.from('mods').select("id");
                if (masonId && user) {
                    query = query.or(`mason_id.eq.${masonId},mason_id.eq.${user.id}`);
                } else if (masonId) {
                    query = query.eq('mason_id', masonId);
                } else if (user) {
                    query = query.eq('mason_id', user.id);
                }
                const { data: modsData } = await query;
                if (modsData) masonModIds = modsData.flatMap(m => [m.id]).filter(Boolean);

                filtered = filtered.filter(t => {
                    const targetUser = t.metadata?.target_user_id;
                    const targetMason = t.metadata?.target_mason;
                    const ticketMasonId = t.metadata?.mason_id;
                    const targetMod = t.metadata?.target_mod_id;

                    if (user && (targetUser === user.id || targetMason === user.id || ticketMasonId === user.id || t.author_id === user.id)) return true;
                    if (masonId && (targetUser === masonId || targetMason === masonId || ticketMasonId === masonId)) return true;
                    if (targetMod && masonModIds.includes(targetMod)) return true;

                    return false;
                });
            }

            const allTargetModIds = [...new Set(filtered.map(t => t.metadata?.target_mod_id).filter(Boolean))];

            const isUUID = (uuid: string) => /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);
            const validModIds = allTargetModIds.filter(isUUID);

            let modNamesMap: Record<string, string> = {};
            if (validModIds.length > 0) {
                const { data: modsInfo } = await supabase.from('mods').select('id, name').in('id', validModIds);
                if (modsInfo) {
                    modsInfo.forEach(m => {
                        modNamesMap[m.id] = m.name;
                    });
                }
            }

            const localModList = useStore.getState().modList;

            filtered = filtered.map(t => {
                let localName = undefined;
                if (t.metadata?.target_mod_id) {
                    const m = localModList.find((lm: any) => lm.id === t.metadata.target_mod_id || lm.hash === t.metadata.target_mod_id);
                    if (m) localName = m.displayName || m.name;
                }
                return {
                    ...t,
                    target_mod_name: t.metadata?.target_mod_id ? (modNamesMap[t.metadata.target_mod_id] || localName) : undefined
                };
            });

            setTickets(filtered);
        }
        setIsLoading(false);
    };

    useEffect(() => {
        fetchBugReports();
    }, [masonId]);

    const handleTakeAction = async (actionType: "RESOLVED" | "REJECTED" | "ESCALATED" | "PENDING", reason: string) => {
        if (!selectedTicket) return;

        const newStatus = actionType.toLowerCase();

        const newMetadata = {
            ...(selectedTicket.metadata || {}),
            action_log: [
                ...(selectedTicket.metadata?.action_log || []),
                {
                    action: actionType,
                    reason,
                    timestamp: new Date().toISOString(),
                    architect: "Mason"
                }
            ]
        };

        const { error } = await supabase
            .from('sanctuary_tickets')
            .update({
                status: newStatus,
                metadata: newMetadata
            })
            .eq('id', selectedTicket.id);

        if (!error) {
            setSelectedTicket(null);
            setIsLoading(true);
            const { data } = await supabase
                .from('sanctuary_tickets')
                .select('*')
                .order('created_at', { ascending: false });

            const { data: { user } } = await supabase.auth.getUser();

            if (data) {
                let filtered = data.filter(t => (t.ticket_type?.toLowerCase().includes('bug') || t.ticket_type?.toLowerCase().includes('artifact')) && !t.ticket_type?.toLowerCase().includes('os'));

                if (masonId || user) {
                    let masonModIds: string[] = [];
                    let query = supabase.from('mods').select("id");
                    if (masonId && user) {
                        query = query.or(`mason_id.eq.${masonId},mason_id.eq.${user.id}`);
                    } else if (masonId) {
                        query = query.eq('mason_id', masonId);
                    } else if (user) {
                        query = query.eq('mason_id', user.id);
                    }
                    const { data: modsData } = await query;
                    if (modsData) masonModIds = modsData.flatMap(m => [m.id]).filter(Boolean);

                    filtered = filtered.filter(t => {
                        const targetUser = t.metadata?.target_user_id;
                        const targetMason = t.metadata?.target_mason;
                        const ticketMasonId = t.metadata?.mason_id;
                        const targetMod = t.metadata?.target_mod_id;

                        if (user && (targetUser === user.id || targetMason === user.id || ticketMasonId === user.id || t.author_id === user.id)) return true;
                        if (masonId && (targetUser === masonId || targetMason === masonId || ticketMasonId === masonId)) return true;
                        if (targetMod && masonModIds.includes(targetMod)) return true;

                        return false;
                    });
                }

                const allTargetModIds = [...new Set(filtered.map(t => t.metadata?.target_mod_id).filter(Boolean))];

                const isUUID = (uuid: string) => /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);
                const validModIds = allTargetModIds.filter(isUUID);

                let modNamesMap: Record<string, string> = {};
                if (validModIds.length > 0) {
                    const { data: modsInfo } = await supabase.from('mods').select('id, name').in('id', validModIds);
                    if (modsInfo) {
                        modsInfo.forEach(m => {
                            modNamesMap[m.id] = m.name;
                        });
                    }
                }

                const localModList = useStore.getState().modList;

                filtered = filtered.map(t => {
                    let localName = undefined;
                    if (t.metadata?.target_mod_id) {
                        const m = localModList.find((lm: any) => lm.id === t.metadata.target_mod_id || lm.hash === t.metadata.target_mod_id);
                        if (m) localName = m.displayName || m.name;
                    }
                    return {
                        ...t,
                        target_mod_name: t.metadata?.target_mod_id ? (modNamesMap[t.metadata.target_mod_id] || localName) : undefined
                    };
                });

                setTickets(filtered);
            }
            setIsLoading(false);
        }
    };

    const renderTicketCard = (ticket: any) => {
        const statusLower = ticket.status?.toLowerCase() || 'open';
        const isOpen = statusLower === 'open' || statusLower === 'new';
        const isResolved = statusLower === 'resolved' || statusLower === 'closed';
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
                        : t("icon_bug_report", "bug_report");

        const statusLabel = isOpen
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
                onClick={() => {
                    if (activeTab === "LANDING") {
                        const st = ticket.status?.toLowerCase() || 'open';
                        setActiveTab(st === 'open' || st === 'new' ? 'open' : st === 'investigating' || st === 'pending' || st === 'escalated' ? 'pending' : 'closed');
                    }
                    setSelectedTicket(ticket);
                }}
                layout="vertical"
                isGhosted={isResolved || isRejected}
                icon={t("icon_bug_report", "bug_report")}
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
                subtitle={ticket.target_mod_name ? `${ticket.target_mod_name} • #${ticket.id.slice(0, 8)}` : `#${ticket.id.slice(0, 8)}`}
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
                        {ticket.target_mod_name && (
                            <div className={VAULT_CHIP_CLASS}>
                                <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                                    {t("icon_extension", "extension")}
                                </span>
                                <span className="truncate max-w-[160px]">{ticket.target_mod_name}</span>
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
        const closedTickets = tickets.filter(t => {
            const status = t.status?.toLowerCase() || 'open';
            return status === "resolved" || status === "rejected";
        }).slice(0, 5);

        const openTickets = tickets.filter(t => {
            const status = t.status?.toLowerCase() || 'open';
            return status === "open" || status === "new";
        }).slice(0, 5);

        return (
            <HubOverviewLanding>
                <HubOverviewSection
                    title={t("badge_new", "NEW")}
                    icon={t("icon_support_agent", "support_agent")}
                    iconColorClass="text-[var(--danger)]"
                    isEmpty={openTickets.length === 0}
                    emptyIcon={t("icon_celebration", "celebration")}
                    emptyTitle={t("no_tickets", "No Support Tickets")}
                >
                    {openTickets.map(renderTicketCard)}
                </HubOverviewSection>

                <HubOverviewSection
                    title={t("filter_closed", "Closed")}
                    icon={t("icon_done_all", "done_all")}
                    iconColorClass="text-[var(--success)]"
                    isEmpty={closedTickets.length === 0}
                    emptyIcon={t("icon_celebration", "celebration")}
                    emptyTitle={t("no_tickets", "No Support Tickets")}
                >
                    {closedTickets.map(renderTicketCard)}
                </HubOverviewSection>
            </HubOverviewLanding>
        );
    };

    const renderList = () => {
        const filteredTickets = tickets.filter(t => {
            const status = t.status?.toLowerCase() || 'open';
            if (activeTab === "pending" && status !== "investigating" && status !== "pending" && status !== "escalated") return false;
            if (activeTab === "open" && status !== "open" && status !== "new") return false;
            if (activeTab === "closed" && status !== "resolved" && status !== "rejected") return false;
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                return t.title?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q);
            }
            return true;
        });

        if (filteredTickets.length === 0) return (
            <EmptyState icon={searchQuery ? t("icon_search_off", "search_off") : t("icon_celebration", "celebration")} title={searchQuery ? t("no_matches", "No matches found") : (activeTab === 'open' ? t("no_bug_reports", "NO BUG REPORTS DETECTED.\nYOUR CODE IS FLAWLESS.") : t("no_tickets", "No Support Tickets"))} className="col-span-full py-16" />
        );

        return (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-16">
                {filteredTickets.map(renderTicketCard)}
            </div>
        );
    };

    return (
        <ElevatedHubLayout
            headerTitle={t("mason_hub_title", "{Mason} Workshop")}
            headerBreadcrumb={t("stat_bugs", "Reports") || "Bug Reports"}
            headerIcon={t("icon_bug_report", "bug_report")}
            search={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder={t("nav_search", "Search...") as string}
            hideSearch={activeTab === 'LANDING'}
            actions={
                activeTab !== 'LANDING' ? [
                    {
                        id: "refresh",
                        icon: t("icon_refresh", "refresh"),
                        label: t("btn_refresh", "Refresh") || "Refresh",
                        onClick: fetchBugReports
                    }
                ] : undefined
            }
            activeTab={activeTab}
            onTabChange={setActiveTab as any}
            tabs={[
                { id: 'LANDING', label: t("overview", "Overview") || "Overview", icon: t("icon_dashboard", "dashboard"), colorClass: 'text-[var(--accent)]' },
                { id: 'open', label: t("badge_new", "NEW"), icon: t("icon_support_agent", "support_agent"), number: tickets.filter(t => { const s = t.status?.toLowerCase(); return s === 'open' || s === 'new'; }).length.toString(), colorClass: 'text-[var(--danger)]' },
                { id: 'closed', label: t("filter_closed", "Closed"), icon: t("icon_done_all", "done_all"), number: tickets.filter(t => { const s = t.status?.toLowerCase(); return s === 'resolved' || s === 'rejected'; }).length.toString(), colorClass: 'text-[var(--success)]' }
            ]}
        >
            <div className="w-full flex flex-col gap-6">
                {isLoading ? (
                    <EmptyState
                        icon={t("icon_sync", "sync")}
                        title={t("ui_btn_processing", "Processing...")}
                    />
                ) : activeTab === 'LANDING' ? renderLanding() : renderList()}
                {selectedTicket && (
                    <TicketDossierSidePanel
                        isOpen={!!selectedTicket}
                        onClose={() => setSelectedTicket(null)}
                        ticket={selectedTicket}
                        isReadOnly={false}
                        canReply={true}
                        availableActions={['RESOLVED', 'REJECTED', 'ESCALATED', 'PENDING']}
                        onTakeAction={handleTakeAction}
                        onEditMetadata={onEditMetadata}
                        onReplyAdded={(newMetadata) => {
                            setSelectedTicket({ ...selectedTicket, metadata: newMetadata });
                        }}
                    />
                )}
            </div>
        </ElevatedHubLayout>
    );
}
