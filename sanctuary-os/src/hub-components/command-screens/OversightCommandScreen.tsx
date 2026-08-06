import React, { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import { useLexicon } from "../../LexiconContext";
import { useStore } from "../../store";
import { SanctuaryAlertsSidePanel } from '../../side-panels/SanctuaryAlertsSidePanel';
import { CommandScreenLayout, CommandScreenBody, CommandScreenSidebar, CommandScreenStats, CommandScreenMain, CommandScreenMetricTile, CommandScreenQuickLink, DashboardStatTile, SystemBroadcastsGrid, CommandScreenSectionHeading } from "../SharedCommandScreenLayout";

export function OversightCommandScreen({ setTab, onOpenDefcon, setComplianceFilter, setViewingPost }: any) {
  const { t } = useLexicon();
  const defconLevel = useStore((state: any) => state.defconLevel);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [stats, setStats] = useState({ masons: 0, citizens: 0, explicit: 0, malware: 0, nsfw: 0, tickets: 0, architects: 0, artifacts: 0, blacklists: 0, oversightQueue: 0, oversightQueueNew: 0, urgentBroadcast: null as any | null });
  const [broadcasts, setBroadcasts] = useState<any[]>([]);

  useEffect(() => {
    const fetchBroadcasts = async () => {
      const { data } = await supabase.from('system_broadcasts')
        .select('*')
        .or('target_audience.ilike.%All%,target_audience.eq.Oversights,target_audience.ilike."Oversights,%",target_audience.ilike."%,Oversights,%",target_audience.ilike."%,Oversights"')
        .in('category', ['Update', 'Info', 'Event'])
        .order('created_at', { ascending: false })
        .limit(3);

      if (data) setBroadcasts(data);
    };
    fetchBroadcasts();
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      const { count: masonsCount } = await supabase.from('masons').select('*', { count: 'exact', head: true });
      const { count: citizensCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'citizen');

      const { count: explicitCount } = await supabase.from('mods').select('*', { count: 'exact', head: true }).eq('compliance_tier', 2);
      const { count: malwareCount } = await supabase.from('mods').select('*', { count: 'exact', head: true }).eq('compliance_tier', 3);
      const { count: nsfwCount } = await supabase.from('mods').select('*', { count: 'exact', head: true }).eq('compliance_tier', 1);

      const { data: ticketsDataRaw } = await supabase.from('sanctuary_tickets')
        .select('created_at, ticket_type, status, metadata')
        .neq('status', 'RESOLVED')
        .neq('status', 'resolved');
      const { data: catData } = await supabase.from('sanctuary_support_categories').select('*');

      let ticketsCount = 0;
      if (ticketsDataRaw && catData) {
        const ticketsData = ticketsDataRaw.map(t => ({
          ...t,
          target_mod_id: t.metadata?.target_mod_id,
          category: t.ticket_type
        }));

        const isValidUUID = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
        const targetModIds = [...new Set(ticketsData.filter(t => t.target_mod_id).map(t => t.target_mod_id as string))].filter(Boolean).filter(isValidUUID);
        const modAuthorMap: Record<string, string> = {};
        if (targetModIds.length > 0) {
          const { data: modsData } = await supabase.from('mods').select('id, mason_id').in('id', targetModIds);
          modsData?.forEach(m => modAuthorMap[m.id] = m.mason_id);
        }

        ticketsCount = ticketsData.filter(t => {
          const typeStr = t.category;
          const cat = catData.find(c => c.category_name === typeStr || c.category_code === typeStr);
          const baseDest = cat?.ticket_destination || 'architect';
          const escalationPath = cat?.escalation_path || 'standard';

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
            const modAuthorId = t.target_mod_id ? modAuthorMap[t.target_mod_id] : null;
            if (!modAuthorId) dest = 'architect';
          }

          return dest === 'oversight';
        }).length;
      }

      const { count: architectsCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).in('role', ['architect', 'oversight']);
      const { count: blacklistsCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_banned', true);
      const { count: oversightCount } = await supabase.from('malware_reports').select('*', { count: 'exact', head: true }).eq('status', 'pending');

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { count: oversightNewCount } = await supabase.from('malware_reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
        .gte('created_at', thirtyDaysAgo.toISOString());

      const { data: urgentData } = await supabase.from('system_broadcasts')
        .select('*')
        .eq('is_active', true)
        .in('is_pinned', ["true", "True", true])
        .or('target_audience.ilike.%All%,target_audience.eq.Oversights,target_audience.ilike."Oversights,%",target_audience.ilike."%,Oversights,%",target_audience.ilike."%,Oversights"')
        .order('created_at', { ascending: false })
        .limit(1);

      let finalUrgent = null;
      if (urgentData && urgentData.length > 0) {
        if (sessionStorage.getItem('dismissedAlertId') !== urgentData[0].id) {
          finalUrgent = urgentData[0];
        }
      }

      setStats({
        masons: masonsCount || 0,
        citizens: citizensCount || 0,
        explicit: explicitCount || 0,
        malware: malwareCount || 0,
        nsfw: nsfwCount || 0,
        tickets: ticketsCount || 0,
        architects: architectsCount || 0,
        artifacts: 0,
        blacklists: blacklistsCount || 0,
        oversightQueue: oversightCount || 0,
        oversightQueueNew: oversightNewCount || 0,
        urgentBroadcast: finalUrgent
      });
    };
    fetchStats();
  }, []);

  const getDefconColor = (level: number) => {
    if (level === 5) return "border-green-500/30 text-green-500 hover:border-green-500 bg-green-500/10 hover:bg-green-500/20";
    if (level === 4) return "border-blue-500/30 text-blue-500 hover:border-blue-500 bg-blue-500/10 hover:bg-blue-500/20";
    if (level === 3) return "border-yellow-500/30 text-yellow-500 hover:border-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20";
    if (level === 2) return "border-orange-500/30 text-orange-500 hover:border-orange-500 bg-orange-500/10 hover:bg-orange-500/20";
    return "border-red-500/30 text-red-500 hover:border-red-500 bg-red-500/10 hover:bg-red-500/20";
  };

  return (
    <CommandScreenLayout>
      <CommandScreenStats>
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_warning_amber")}</span>} number={defconLevel} label={t("defcon_global")} colorClass={getDefconColor(defconLevel)} onClick={onOpenDefcon} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_18_up_rating")}</span>} number={stats.nsfw + stats.explicit} label={`${t("stat_nsfw_flags")} / ${t("stat_explicit_flags")}`} colorClass="border-orange-500/30 text-orange-500 hover:border-orange-500 bg-orange-500/10 hover:bg-orange-500/20" onClick={() => { setComplianceFilter('nsfw'); setTab("compliance"); }} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_coronavirus")}</span>} number={stats.malware} label={t("wf_stat_quarantined")} colorClass="border-red-500/30 text-red-500 hover:border-red-500 bg-red-500/10 hover:bg-red-500/20" onClick={() => { setComplianceFilter('pending'); setTab("malware_oversight"); }} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_threat_intelligence")}</span>} number={stats.oversightQueueNew} label={t("stat_malware_logs")} colorClass="border-red-500/30 text-red-500 hover:border-red-500 bg-red-500/10 hover:bg-red-500/20" onClick={() => setTab("oversight_reports")} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_local_activity")}</span>} number={stats.tickets} label={t("stat_support_tickets")} colorClass="border-purple-500/30 text-purple-500 hover:border-purple-500 bg-purple-500/10 hover:bg-purple-500/20" onClick={() => setTab("sanctuary_tickets")} />
      </CommandScreenStats>

      {stats.urgentBroadcast && localStorage.getItem("sanctuary_notify_alert_banner") !== "false" && (
        <div onClick={() => setViewingPost({ ...stats.urgentBroadcast, content: stats.urgentBroadcast.message || stats.urgentBroadcast.content, mason_id: 'system', views: 0, likes: 0, replies: 0 })} className="w-full theme-glass-panel border border-[var(--danger)]/30 bg-[var(--danger)]/10 rounded-[var(--radius)] p-6 flex flex-col md:flex-row items-center gap-6 shadow-[0_0_40px_rgba(239,68,68,0.1)] cursor-pointer hover:bg-[var(--danger)]/20 transition-all group overflow-hidden relative backdrop-blur-md">
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--danger)]/5 to-transparent z-0 pointer-events-none" />
          <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--danger)]/10 blur-[50px] rounded-full pointer-events-none" />
          <div className="w-16 h-16 rounded-full bg-[var(--danger)]/10 border border-[var(--danger)]/30 flex items-center justify-center shrink-0 z-10 group-hover:scale-110 transition-transform shadow-inner">
            <span className="material-symbols-outlined !text-4xl text-[var(--danger)] animate-pulse">{t("icon_warning_amber")}</span>
          </div>
          <div className="flex flex-col gap-2 flex-1 z-10">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 bg-[var(--danger)]/20 border border-[var(--danger)]/40 text-[var(--danger)] text-[10px] font-black uppercase tracking-widest rounded-lg shadow-inner animate-pulse flex items-center gap-1"><span className="material-symbols-outlined !text-[12px]"></span>{t("urgent_alert")}</span>
              <span className="text-[10px] font-black uppercase tracking-widest opacity-60 text-[var(--danger)]">{new Date(stats.urgentBroadcast.created_at).toLocaleDateString()}</span>
            </div>
            <h3 className="text-xl md:text-2xl font-black uppercase tracking-widest text-[var(--danger)] group-hover:text-red-400 transition-colors drop-shadow-md">{stats.urgentBroadcast.title}</h3>
          </div>
          <div className="flex items-center gap-2 z-10 ml-auto">
            <button onClick={(e) => { e.stopPropagation(); sessionStorage.setItem('dismissedAlertId', stats.urgentBroadcast.id); setStats({ ...stats, urgentBroadcast: null }); }} className="w-10 h-10 rounded-full border border-[var(--danger)]/30 bg-[var(--danger)]/10 hover:bg-[var(--danger)]/20 text-[var(--danger)] flex items-center justify-center transition-colors shadow-inner backdrop-blur-md hover:scale-110 active:scale-95 group/close" >
              <span className="material-symbols-outlined !text-[20px] group-hover/close:rotate-90 transition-transform duration-300">close</span>
            </button>
          </div>
        </div>
      )}

      <CommandScreenBody>
        <CommandScreenMain>
          <CommandScreenSectionHeading title={t("wf_comms_title")} icon="history" />

          <div className="flex flex-col gap-8 w-full">
            <SystemBroadcastsGrid broadcasts={broadcasts} setViewingPost={setViewingPost} />

            <CommandScreenSectionHeading title={t("metrics")} icon="monitoring" />
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 w-full">
              <CommandScreenMetricTile value={stats.citizens + stats.masons} label={t("stat_users")} valueColorClass="theme-text-accent" hoverBorderClass="hover:border-[var(--accent)]/30" />
              <CommandScreenMetricTile value={stats.masons} label={t("tab_linker")} valueColorClass="theme-text-accent" hoverBorderClass="hover:border-[var(--accent)]/30" />
              <CommandScreenMetricTile value={stats.architects} label={t("stat_architects")} valueColorClass="text-purple-400" hoverBorderClass="hover:border-purple-500/30" />
              <CommandScreenMetricTile value={stats.blacklists} label={t("stat_blacklists")} valueColorClass="text-red-500" hoverBorderClass="hover:border-red-500/30" />
              <CommandScreenMetricTile value={stats.oversightQueue} label={t("tab_malware_logs")} valueColorClass="text-red-700" hoverBorderClass="hover:border-emerald-500/30" />
            </div>
          </div>
        </CommandScreenMain>

        <CommandScreenSidebar title={t("wf_quick_links")} icon="rocket_launch">
          {stats.urgentBroadcast && (
            <button onClick={() => setIsAlertsOpen(true)} className="w-full p-6 theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-[var(--radius)] hover:bg-white/5 transition-all text-left group relative overflow-hidden h-24">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 group-hover:-translate-x-full duration-1000 transition-all ease-in-out" />
              <div className="flex items-center gap-5 h-full">
                <div className="w-12 h-12 rounded-xl theme-glass-inner border flex items-center justify-center shrink-0 transition-colors border-[var(--danger)]/30 group-hover:bg-[var(--danger)]/10 text-[var(--danger)] shadow-[0_0_15px_rgba(239,68,68,0.3)]">
                  <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 animate-pulse drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]">
                    priority_high
                  </span>
                </div>
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <h3 className="text-[11px] font-black uppercase tracking-widest transition-colors truncate text-[var(--danger)] group-hover:text-red-400">{t("title_sanctuary_alerts") || "Sanctuary Alerts"}</h3>
                  <span className="text-[8px] uppercase font-bold tracking-widest transition-colors flex items-center gap-2 mt-1 text-[var(--danger)]/80 group-hover:text-red-300">
                    <span className="w-1.5 h-1.5 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.8)] bg-[var(--danger)] animate-pulse"></span> URGENT ALERT ACTIVE
                  </span>
                </div>
              </div>
            </button>
          )}
          <CommandScreenQuickLink onClick={() => setTab("oversight_reports")} icon={t("icon_threat_intelligence")} title={t("stat_malware_logs")} subtitle={t("ql_sys_reports")} iconBorderHoverClass="group-hover:border-[var(--accent)]/30" iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" textColorClass="text-red-500" hoverTextColorClass="group-hover:text-red-500" dotColorClass="bg-red-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />

          <CommandScreenQuickLink onClick={() => setTab("mass_update")} icon={t("icon_dynamic_feed")} title={t("ql_mass_update")} subtitle={t("ql_bulk_actions")} iconBorderHoverClass="group-hover:border-[var(--accent)]/30" iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" textColorClass="text-rose-400" hoverTextColorClass="group-hover:text-rose-300" dotColorClass="bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.8)]" />

          <CommandScreenQuickLink onClick={() => setTab("game_versions")} icon={t("icon_settings")} title={t("ql_game_versions")} subtitle={t("ql_registry_config")} iconBorderHoverClass="group-hover:border-[var(--accent)]/30" iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" textColorClass="text-emerald-400" hoverTextColorClass="group-hover:emerald-300" dotColorClass="bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />

          <CommandScreenQuickLink onClick={() => setTab("audit_logs")} icon={t("icon_history")} title={t("audit_title")} subtitle={t("ql_system_history")} iconBorderHoverClass="group-hover:border-[var(--accent)]/30" iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" textColorClass="text-indigo-400" hoverTextColorClass="group-hover:text-indigo-300" dotColorClass="bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]" />

          {!stats.urgentBroadcast && (
            <CommandScreenQuickLink onClick={() => setIsAlertsOpen(true)} icon="warning_off" title={t("title_sanctuary_alerts") || "Sanctuary Alerts"} subtitle={t("alert_empty") || "SYSTEM BROADCASTS"} iconBorderHoverClass="group-hover:border-amber-500/30" iconShadowClass="drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]" textColorClass="text-amber-500/80" hoverTextColorClass="group-hover:text-amber-400" dotColorClass="bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
          )}
        </CommandScreenSidebar>
      </CommandScreenBody>

      <SanctuaryAlertsSidePanel
        isOpen={isAlertsOpen}
        onClose={() => setIsAlertsOpen(false)}
        audience="Oversights"
      />
    </CommandScreenLayout>
  );
}
