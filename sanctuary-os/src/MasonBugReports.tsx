import React, { useState, useEffect } from "react";
import { ViewHeader, EmptyState } from "./shared";
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
    const [activeTab, setActiveTab] = useState<"pending" | "open" | "closed">("pending");

    useEffect(() => {
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

    return (
        <div className="flex flex-col gap-6 w-full pb-32">
            <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] w-full">
                <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl glass-panel border border-[var(--accent)]/[30%] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("icon_bug_report")}</span>
                    </div>
                    <span className="truncate">{t("title_bug_reports")}</span>
                </h2>
                <div className="flex items-center gap-3 relative flex-1 max-w-2xl ml-auto justify-end">
                    <div className="relative flex-1 h-12 max-w-[400px]">
                        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 !text-sm">{t("icon_search")}</span>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={t("ui_placeholder_search")}
                            className="w-full glass-panel rounded-2xl pl-10 pr-10 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[var(--accent)]/50 placeholder:opacity-40"
                        />
                        {searchQuery && (
                            <button onClick={() => setSearchQuery("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] hover:text-[var(--text)] transition-colors">
                                <span className="material-symbols-outlined text-sm">{t("icon_close")}</span>
                            </button>
                        )}
                    </div>
                    <div className="flex items-stretch overflow-hidden glass-panel rounded-xl divide-x divide-white/5 border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner h-12">
                        <button
                            onClick={() => setActiveTab("pending")}
                            className={`h-full px-5 rounded-none flex items-center justify-center text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'pending' ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}
                        >
                            {t("pending")}
                        </button>
                        <button
                            onClick={() => setActiveTab("open")}
                            className={`h-full px-5 rounded-none flex items-center justify-center text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'open' ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}
                        >
                            {t("ui_tab_new")}
                        </button>
                        <button
                            onClick={() => setActiveTab("closed")}
                            className={`h-full px-5 rounded-none flex items-center justify-center text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'closed' ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}
                        >
                            {t("ui_tab_closed")}
                        </button>
                    </div>
                </div>
            </div>

            <div className="w-full flex flex-col gap-6 px-6 pb-20">
                {isLoading ? (
                    <div className="flex justify-center items-center h-32 opacity-50">
                        <span className="text-sm font-bold animate-pulse uppercase tracking-widest">{t("ui_btn_processing")}</span>
                    </div>
                ) : (() => {
                    const filteredTickets = tickets.filter(t => {
                        const status = t.status?.toLowerCase() || 'open';
                        if (activeTab === "pending" && status !== "investigating" && status !== "pending" && status !== "escalated") return false;
                        if (activeTab === "open" && status !== "open") return false;
                        if (activeTab === "closed" && status !== "resolved" && status !== "rejected") return false;
                        if (searchQuery) {
                            const q = searchQuery.toLowerCase();
                            return t.title?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q);
                        }
                        return true;
                    });

                    if (filteredTickets.length === 0) return (
                        <EmptyState icon={searchQuery ? "search_off" : t("icon_celebration") || "celebration"} title={searchQuery ? t("no_matches") : (activeTab === 'open' ? t("no_bug_reports") : t("no_tickets"))} className="col-span-full py-16" />
                    );

                    return (
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6">
                            {filteredTickets.map(ticket => {
                                const statusClass = ticket.status?.toLowerCase() === 'open' || ticket.status?.toLowerCase() === 'new' ? 'border-rose-500/50' :
                                                    ticket.status?.toLowerCase() === 'resolved' ? 'border-emerald-500/50' :
                                                    ticket.status?.toLowerCase() === 'investigating' || ticket.status?.toLowerCase() === 'pending' ? 'border-amber-500/50' :
                                                    ticket.status?.toLowerCase() === 'escalated' ? 'border-fuchsia-500/50' :
                                                    'border-[var(--accent)]/50';

                                const iconName = ticket.status?.toLowerCase() === 'open' || ticket.status?.toLowerCase() === 'new' ? 'support_agent' : 
                                                 ticket.status?.toLowerCase() === 'resolved' ? 'done_all' : 
                                                 ticket.status?.toLowerCase() === 'investigating' ? 'warning' : 
                                                 ticket.status?.toLowerCase() === 'escalated' ? 'priority_high' : 
                                                 'bug_report';

                                const badgeClass = ticket.status?.toLowerCase() === 'open' || ticket.status?.toLowerCase() === 'new' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20 group-hover:bg-rose-500/20' :
                                                   ticket.status?.toLowerCase() === 'resolved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 group-hover:bg-emerald-500/20' :
                                                   ticket.status?.toLowerCase() === 'investigating' || ticket.status?.toLowerCase() === 'pending' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 group-hover:bg-amber-500/20' :
                                                   ticket.status?.toLowerCase() === 'escalated' ? 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20 group-hover:bg-fuchsia-500/20' :
                                                   'bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/20 group-hover:bg-[var(--accent)]/20';

                                return (
                                <UniversalCard
                                    key={ticket.id}
                                    onClick={() => setSelectedTicket(ticket)}
                                    layout="vertical"
                                    icon={iconName}
                                    title={ticket.title}
                                    statusColor={statusClass}
                                    badges={[
                                        <span key="status" className={`px-2 py-0.5 rounded-md text-[8px] font-black tracking-widest uppercase border shadow-inner shrink-0 transition-colors ${badgeClass}`}>
                                            {(ticket.status?.toLowerCase() === 'open' || ticket.status?.toLowerCase() === 'new') ? (t("ui_tab_new")) : (t(`ticket_status_${ticket.status?.toLowerCase()}`) || ticket.status || "NEW")}
                                        </span>
                                    ]}
                                    footer={
                                        <div className="flex justify-between items-center w-full">
                                            <span className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest flex items-center gap-1.5 opacity-60">
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
                                    <div className="mt-2 text-xs font-medium text-[var(--subtext)] leading-relaxed line-clamp-3 mb-4">
                                        {ticket.description}
                                    </div>
                                    {ticket.target_mod_name && (
                                        <div className="mt-auto pt-3 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] w-full">
                                            <div className="flex items-center gap-2">
                                                <div className="w-5 h-5 rounded-md bg-[color-mix(in_srgb,var(--text)_5%,transparent)] flex items-center justify-center shrink-0">
                                                    <span className="material-symbols-outlined !text-[10px] text-[var(--subtext)]">{t("icon_extension")}</span>
                                                </div>
                                                <span className="text-[10px] font-bold text-[var(--text)] truncate">{ticket.target_mod_name}</span>
                                            </div>
                                        </div>
                                    )}
                                </UniversalCard>
                            );
                        })}
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
                availableActions={['RESOLVED', 'REJECTED', 'ESCALATED', 'PENDING']}
                onTakeAction={handleTakeAction}
                onEditMetadata={onEditMetadata}
                onReplyAdded={(newMetadata) => {
                    setSelectedTicket({ ...selectedTicket, metadata: newMetadata });
                }}
            />
        </div>
    );
}

