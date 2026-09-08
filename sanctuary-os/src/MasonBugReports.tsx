import React, { useState, useEffect } from "react";
import { ViewHeader, EmptyState, ScreenUtilityBar, FilterTabs, FilterTabButton, FilterPopover, ActionButton, formatOverviewMetric } from "./shared";
import { ElevatedHubLayout } from "./components/layouts/ElevatedHubLayout";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import TicketDossierSidePanel from './side-panels/TicketDossierSidePanel';
import { useStore } from "./store";
import { UniversalCard } from "./components/universal/UniversalCard";

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
        const statusClass = ticket.status?.toLowerCase() === 'open' || ticket.status?.toLowerCase() === 'new' ? 'border-[color-mix(in_srgb,var(--danger)_50%,transparent)]' :
            ticket.status?.toLowerCase() === 'resolved' ? 'border-[color-mix(in_srgb,var(--success)_50%,transparent)]' :
                ticket.status?.toLowerCase() === 'investigating' || ticket.status?.toLowerCase() === 'pending' ? 'border-[color-mix(in_srgb,var(--warning)_50%,transparent)]' :
                    ticket.status?.toLowerCase() === 'escalated' ? 'border-fuchsia-500/50' :
                        'border-[color-mix(in_srgb,var(--accent)_50%,transparent)]';

        const iconName = ticket.status?.toLowerCase() === 'open' || ticket.status?.toLowerCase() === 'new' ? 'support_agent' :
            ticket.status?.toLowerCase() === 'resolved' ? 'done_all' :
                ticket.status?.toLowerCase() === 'investigating' ? 'warning' :
                    ticket.status?.toLowerCase() === 'escalated' ? 'priority_high' :
                        'bug_report';

        const badgeClass = ticket.status?.toLowerCase() === 'open' || ticket.status?.toLowerCase() === 'new' ? 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-rose-400 border-[color-mix(in_srgb,var(--danger)_20%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)]' :
            ticket.status?.toLowerCase() === 'resolved' ? 'bg-[color-mix(in_srgb,var(--success)_10%,transparent)] text-emerald-400 border-[color-mix(in_srgb,var(--success)_20%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)]' :
                ticket.status?.toLowerCase() === 'investigating' || ticket.status?.toLowerCase() === 'pending' ? 'bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] text-amber-400 border-[color-mix(in_srgb,var(--warning)_20%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--warning)_20%,transparent)]' :
                    ticket.status?.toLowerCase() === 'escalated' ? 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20 group-hover:bg-fuchsia-500/20' :
                        'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_20%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]';

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
                icon={iconName}
                title={ticket.title}
                statusColor={statusClass}
                badges={[
                    <span key="status" className={`px-2 py-0.5 rounded-md text-[8px] font-black tracking-widest capitalize border shadow-inner shrink-0 transition-colors ${badgeClass}`}>
                        {(ticket.status?.toLowerCase() === 'open' || ticket.status?.toLowerCase() === 'new') ? (t("ui_tab_new")) : (t(`ticket_status_${ticket.status?.toLowerCase()}`) || ticket.status || "NEW")}
                    </span>
                ]}
                footer={
                    <div className="flex justify-start items-center w-full">
                        <span className="text-[10px] font-black text-[var(--subtext)] capitalize tracking-widest flex items-center gap-1.5 opacity-60">
                            <span className="material-symbols-outlined !text-[14px] normal-case">{t("icon_calendar_today")}</span>
                            {new Date(ticket.created_at).toLocaleDateString()}
                        </span>
                        <div className="flex items-center gap-4">
                            <div className="flex -space-x-2">
                                {ticket.author_id && (
                                    <div className="w-6 h-6 rounded-full border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] overflow-hidden">
                                        <img src={`https://api.dicebear.com/7.x/bottts/svg?seed=${ticket.author_id}`} alt="avatar" className="w-full h-full opacity-80 mix-blend-screen" />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                }
            >
                <div className="mt-2 text-[11px] font-medium text-[var(--subtext)] leading-relaxed line-clamp-2 mb-2">
                    {ticket.description}
                </div>
                {ticket.target_mod_name && (
                    <div className="mt-auto pt-2 w-full flex items-center gap-2">
                        <div className="w-5 h-5 rounded-md bg-[color-mix(in_srgb,var(--text)_5%,transparent)] flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined !text-[10px] text-[var(--subtext)]">{t("icon_extension")}</span>
                        </div>
                        <span className="text-[10px] font-bold text-[var(--text)] truncate">{ticket.target_mod_name}</span>
                    </div>
                )}
            </UniversalCard>
        );
    };

    const renderLanding = () => {
        const pendingTickets = tickets.filter(t => {
            const status = t.status?.toLowerCase() || 'open';
            return status === "investigating" || status === "pending" || status === "escalated";
        }).slice(0, 5);

        const openTickets = tickets.filter(t => {
            const status = t.status?.toLowerCase() || 'open';
            return status === "open" || status === "new";
        }).slice(0, 5);

        return (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-10 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-16">
                <div className="flex flex-col gap-6">
                    <div className="flex items-center justify-between gap-4 border-b border-black/5 dark:border-white/5 pb-4">
                        <h3 className="text-sm font-black text-[var(--text)] capitalize tracking-[0.2em] flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined !text-[24px] text-[var(--danger)] opacity-90 drop-shadow-lg">support_agent</span>
                            </div>
                            {t("ui_tab_new") || "New Tickets"}
                        </h3>
                    </div>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
                        {openTickets.length > 0 ? openTickets.map(renderTicketCard) : (
                            <EmptyState icon="celebration" title={t("no_tickets")} className="py-8" />
                        )}
                    </div>
                </div>

                <div className="flex flex-col gap-6">
                    <div className="flex items-center justify-between gap-4 border-b border-black/5 dark:border-white/5 pb-4">
                        <h3 className="text-sm font-black text-[var(--text)] capitalize tracking-[0.2em] flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined !text-[24px] text-[var(--warning)] opacity-90 drop-shadow-lg">warning</span>
                            </div>
                            {t("pending") || "Pending Action"}
                        </h3>
                    </div>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
                        {pendingTickets.length > 0 ? pendingTickets.map(renderTicketCard) : (
                            <EmptyState icon="celebration" title={t("no_tickets")} className="py-8" />
                        )}
                    </div>
                </div>
            </div>
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
            <EmptyState icon={searchQuery ? "search_off" : t("icon_celebration")} title={searchQuery ? t("no_matches") : (activeTab === 'open' ? t("no_bug_reports") : t("no_tickets"))} className="col-span-full py-16" />
        );

        return (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-16">
                {filteredTickets.map(renderTicketCard)}
            </div>
        );
    };

    return (
        <ElevatedHubLayout
            headerTitle={t("mason_hub_title")}
            headerBreadcrumb={t("stat_bugs") || "Bug Reports"}
            headerIcon="bug_report"
            search={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder={t("ui_placeholder_search") as string}
            headerActions={
                <div className="flex items-center gap-2">
                    <div className="md:hidden">
                        <FilterPopover icon="more_vert" label={t("hub_actions") || "Actions"}>
                            <div className="flex flex-col gap-4">
                                <ActionButton onClick={fetchBugReports} icon="refresh" label={t("hub_refresh") || "Refresh"} className="w-full h-10 px-6 font-black capitalize tracking-widest text-[10px] !w-auto" />
                            </div>
                        </FilterPopover>
                    </div>
                    <ActionButton onClick={fetchBugReports} iconOnly={true} icon="refresh" label={t("hub_refresh") || "Refresh"} className="hidden md:flex shrink-0 h-10 w-10 px-0" />
                </div>
            }
            activeTab={activeTab}
            onTabChange={setActiveTab as any}
            tabs={[
                { id: 'LANDING', label: t("overview_tab") || "Overview", icon: 'dashboard', number: formatOverviewMetric(tickets, 'created_at'), colorClass: 'text-[var(--accent)]' },
                { id: 'pending', label: t("pending"), icon: 'warning', number: tickets.filter(t => { const s = t.status?.toLowerCase(); return s === 'investigating' || s === 'pending' || s === 'escalated'; }).length.toString(), colorClass: 'text-[var(--warning)]' },
                { id: 'open', label: t("ui_tab_new"), icon: 'support_agent', number: tickets.filter(t => { const s = t.status?.toLowerCase(); return s === 'open' || s === 'new'; }).length.toString(), colorClass: 'text-[var(--danger)]' },
                { id: 'closed', label: t("filter_closed"), icon: 'done_all', number: tickets.filter(t => { const s = t.status?.toLowerCase(); return s === 'resolved' || s === 'rejected'; }).length.toString(), colorClass: 'text-[var(--success)]' }
            ]}
        >
            <div className="w-full flex flex-col gap-6">
                {isLoading ? (
                    <div className="flex justify-center items-center h-32 opacity-50">
                        <span className="text-sm font-bold animate-pulse capitalize tracking-widest">{t("ui_btn_processing")}</span>
                    </div>
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
