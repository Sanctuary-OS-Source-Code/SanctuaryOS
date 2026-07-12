import React, { useState, useEffect } from "react";
import { useLexicon } from "../LexiconContext";
import { useStore } from '../store';
import { supabase } from "../supabase";
import TicketDossierSidePanel from '../side-panels/TicketDossierSidePanel';
import { logArchitectAction } from "../lib/audit";
import { SidePanel, CustomDropdown, standardAccentGlassButtonClass, EmptyState } from "../shared";

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
  const [activeFilter, setActiveFilter] = useState<"new" | "pending" | "closed">("pending");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryOptions, setCategoryOptions] = useState<any[]>([]);

  const fetchTickets = async () => {
    setIsLoading(true);
    let query = supabase
      .from('sanctuary_tickets')
      .select('*')
      .order('created_at', { ascending: false });


    if (activeFilter === "new") {
      query = query.in('status', ['NEW', 'OPEN', 'new', 'open']);
    } else if (activeFilter === "pending") {
      query = query.in('status', ['PENDING', 'ESCALATED', 'INVESTIGATING', 'pending', 'escalated', 'investigating']);
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
        author_username: profileMap[t.author_id] || t.author_id.substring(0, 8).toUpperCase()
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

          return dest === userRole;
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

    useStore.getState().pushStatus(t("auto_ticket_status_updated_successfully"), "success");

    if (userRole === "architect") {
      logArchitectAction(`Support Ticket ${actionType}: ${reason}`, 'sanctuary_tickets', selectedTicket.id);
    }
    setSelectedTicket(null);
    fetchTickets();
  };

  return (
    <div className="flex flex-col gap-6 w-full pb-32 text-[var(--text)]">
      <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-white/5 w-full mb-4">
        <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("icon_local_activity")}</span>
          </div>
          <span className="truncate">{t("ql_support")}</span>
        </h2>
        <div className="flex items-center gap-3 relative flex-1 max-w-2xl ml-auto justify-end">
          <div className="relative flex-1 h-12 max-w-[400px]">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 !text-sm">{t("icon_search")}</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("ui_placeholder_search")}
              className="w-full theme-glass-panel rounded-2xl pl-10 pr-10 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] hover:text-[var(--text)] transition-colors">
                <span className="material-symbols-outlined text-sm">{t("icon_close")}</span>
              </button>
            )}
          </div>
          <div className="w-max min-w-[192px] max-w-xs shrink-0 relative z-50 h-12">
            <CustomDropdown
              value={activeCategory}
              onChange={(v: string[]) => setActiveCategory(v[0])}
              options={categoryOptions.length > 0 ? categoryOptions : [{ id: "all", label: t("ui_tab_all_types") }]}
              disableTint={true}
            />
          </div>
          <div className="flex items-stretch overflow-hidden theme-glass-panel rounded-xl divide-x divide-white/5 border border-white/5 shadow-inner h-12">
            <button
              onClick={() => setActiveFilter("pending")}
              className={`h-full px-5 rounded-none flex items-center justify-center text-[10px] font-black uppercase tracking-widest transition-all ${activeFilter === 'pending' ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5'}`}
            >
              {t("pending")}
            </button>
            <button
              onClick={() => setActiveFilter("new")}
              className={`h-full px-5 rounded-none flex items-center justify-center text-[10px] font-black uppercase tracking-widest transition-all ${activeFilter === 'new' ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5'}`}
            >
              {t("ui_tab_new")}
            </button>
            <button
              onClick={() => setActiveFilter("closed")}
              className={`h-full px-5 rounded-none flex items-center justify-center text-[10px] font-black uppercase tracking-widest transition-all ${activeFilter === 'closed' ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5'}`}
            >
              {t("ui_tab_closed")}
            </button>
          </div>
        </div>
      </div>

      <div className="w-full flex flex-col gap-4 pb-10">
        {isLoading ? (
          <div className="flex justify-center items-center h-40 opacity-50">
            <span className="text-sm font-bold animate-pulse uppercase tracking-widest">{t("ui_btn_processing")}</span>
          </div>
        ) : tickets.length === 0 ? (
          <EmptyState icon={t("icon_receipt_long") || "receipt_long"} title={t("ticket_no_tickets")} className="col-span-full py-16" />
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
            <EmptyState icon={searchQuery ? "search_off" : t("icon_celebration") || "celebration"} title={searchQuery ? t("no_matches") : (activeFilter === 'new' ? t("no_bug_reports") : t("no_tickets"))} className="col-span-full py-16" />
          );

          return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 px-6">
              {filteredTickets.map(ticket => (
                <div
                  key={ticket.id}
                  className="theme-glass-panel rounded-[var(--radius)] flex flex-col group cursor-pointer border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[var(--accent)]/50 hover:shadow-[0_0_40px_rgba(var(--accent-rgb),0.15)] transition-all duration-500 hover:-translate-y-1.5 relative overflow-hidden bg-gradient-to-br from-white/5 to-transparent min-h-[220px]"
                  onClick={() => setSelectedTicket(ticket)}
                >
                  <div className={`absolute inset-0 transition-opacity duration-500 pointer-events-none opacity-0 group-hover:opacity-100 ${ticket.status?.toLowerCase() === 'escalated' ? 'bg-gradient-to-br from-fuchsia-500/10 to-transparent' : 'bg-gradient-to-br from-[var(--accent)]/5 to-transparent'}`} />

                  <div className={`absolute top-0 left-0 w-full h-1 transition-all duration-500
                        ${ticket.status?.toLowerCase() === 'new' || ticket.status?.toLowerCase() === 'open' ? 'bg-rose-500/50 group-hover:bg-rose-500 group-hover:shadow-[0_0_20px_rgba(244,63,94,0.5)]' : ''}
                        ${ticket.status?.toLowerCase() === 'closed' || ticket.status?.toLowerCase() === 'resolved' || ticket.status?.toLowerCase() === 'rejected' ? 'bg-emerald-500/50 group-hover:bg-emerald-500 group-hover:shadow-[0_0_20px_rgba(16,185,129,0.5)]' : ''}
                        ${ticket.status?.toLowerCase() === 'investigating' || ticket.status?.toLowerCase() === 'pending' ? 'bg-amber-500/50 group-hover:bg-amber-500 group-hover:shadow-[0_0_20px_rgba(245,158,11,0.5)]' : ''}
                        ${ticket.status?.toLowerCase() === 'escalated' ? 'bg-fuchsia-500/50 group-hover:bg-fuchsia-500 group-hover:shadow-[0_0_20px_rgba(217,70,239,0.5)]' : ''}
                        ${!['new', 'open', 'closed', 'resolved', 'rejected', 'investigating', 'pending', 'escalated'].includes(ticket.status?.toLowerCase() || '') ? 'bg-[var(--accent)]/50 group-hover:bg-[var(--accent)]' : ''}
                    `} />

                  <div className="p-6 flex flex-col gap-4 flex-1 relative z-10">
                    <div className="flex justify-between items-start gap-4">
                      <div className={`w-12 h-12 rounded-[1rem] flex items-center justify-center shrink-0 border transition-all duration-500 shadow-inner bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] ${ticket.status?.toLowerCase() === 'escalated' ? 'border-fuchsia-500/30 group-hover:border-fuchsia-500/50' : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] group-hover:border-[var(--accent)]/30'}`}>
                        <span className={`material-symbols-outlined !text-[24px] transition-colors duration-500 opacity-50 group-hover:opacity-100 ${ticket.status?.toLowerCase() === 'escalated' ? 'text-fuchsia-400' : 'text-[var(--text)] group-hover:text-[var(--accent)]'}`}>
                          {ticket.status?.toLowerCase() === 'new' || ticket.status?.toLowerCase() === 'open' ? 'support_agent' : ticket.status?.toLowerCase() === 'closed' || ticket.status?.toLowerCase() === 'resolved' || ticket.status?.toLowerCase() === 'rejected' ? 'done_all' : ticket.status?.toLowerCase() === 'investigating' || ticket.status?.toLowerCase() === 'pending' ? 'warning' : ticket.status?.toLowerCase() === 'escalated' ? 'priority_high' : 'bug_report'}
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <span className={`px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest uppercase border shadow-inner transition-colors
                                    ${ticket.status?.toLowerCase() === 'new' || ticket.status?.toLowerCase() === 'open' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20 group-hover:bg-rose-500/20' : ''}
                                    ${ticket.status?.toLowerCase() === 'closed' || ticket.status?.toLowerCase() === 'resolved' || ticket.status?.toLowerCase() === 'rejected' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 group-hover:bg-emerald-500/20' : ''}
                                    ${ticket.status?.toLowerCase() === 'investigating' || ticket.status?.toLowerCase() === 'pending' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 group-hover:bg-amber-500/20' : ''}
                                    ${ticket.status?.toLowerCase() === 'escalated' ? 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20 group-hover:bg-fuchsia-500/20' : ''}
                                    ${!['new', 'open', 'closed', 'resolved', 'rejected', 'investigating', 'pending', 'escalated'].includes(ticket.status?.toLowerCase() || '') ? 'bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/20 group-hover:bg-[var(--accent)]/20' : ''}
                                `}>
                          {(ticket.status?.toLowerCase() === 'new' || ticket.status?.toLowerCase() === 'open') ? (t("ui_tab_new")) : (t(`ticket_status_${ticket.status.toLowerCase()}`) || ticket.status || "NEW")}
                        </span>
                        {(ticket.ticket_type || ticket.category) && (
                          <span className="px-2 py-1 rounded bg-[var(--text)]/5 text-[var(--text)]/60 border border-[var(--text)]/10 text-[8px] font-black uppercase tracking-widest whitespace-nowrap group-hover:bg-[var(--text)]/10 group-hover:border-[var(--text)]/20 transition-all">
                            {(ticket.ticket_type || ticket.category || "").replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                    </div>

                    <h3 className="font-black text-xl leading-tight text-[var(--text)] group-hover:theme-text-accent transition-colors uppercase tracking-widest line-clamp-2 mt-2">
                      {ticket.title}
                    </h3>

                    <p className="text-xs text-[var(--subtext)] line-clamp-3 leading-relaxed font-bold opacity-70 group-hover:opacity-100 transition-opacity flex-1">
                      {ticket.description}
                    </p>

                    <div className="flex justify-between items-center mt-auto pt-4 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] gap-4">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <span className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest flex items-center gap-1.5 opacity-60 shrink-0">
                          <span className="material-symbols-outlined !text-[14px] normal-case">{t("icon_calendar_today")}</span>
                          {new Date(ticket.created_at).toLocaleDateString()}
                        </span>
                        <span className="text-[10px] font-mono theme-text-accent uppercase tracking-widest flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity min-w-0 flex-1">
                          <span className="material-symbols-outlined !text-[14px] normal-case shrink-0">{t("icon_person")}</span>
                          <span className="truncate">{ticket.author_username || ticket.author_id.substring(0, 8)}</span>
                        </span>
                      </div>
                      <button className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 shrink-0">
                        {t("btn_view")} <span className="text-lg leading-none">&rarr;</span>
                      </button>
                    </div>
                  </div>
                </div>
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
        onReplyAdded={() => {
          fetchTickets();
        }}
      />
    </div>
  );
}

