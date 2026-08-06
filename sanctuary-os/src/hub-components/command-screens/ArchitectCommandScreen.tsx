import React, { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import { useLexicon } from "../../LexiconContext";
import { SanctuaryAlertsSidePanel } from '../../side-panels/SanctuaryAlertsSidePanel';
import { WayfinderPostsEditor } from "../WayfinderPostsEditor";
import { CommandScreenLayout, CommandScreenBody, CommandScreenSidebar, CommandScreenStats, CommandScreenMain, UrgentBroadcastBanner, SystemBroadcastsGrid, CommandScreenMetricTile, CommandScreenQuickLink, DashboardStatTile, CommandScreenSectionHeading } from "../SharedCommandScreenLayout";

export function ArchitectCommandScreen({ onNavigate, setViewingPost, setStatus }: any) {
  const { t } = useLexicon();
  const [stats, setStats] = useState({
    scoutQueue: 0, masonQueue: 0, nexusReports: 0,
    nsfw: 0, explicit: 0, supportTickets: 0,
    totalArtifacts: 0, unverifiedMods: 0, tier4Conflicts: 0, tier3Conflicts: 0, labQueue: 0
  });
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [isDispatchOpen, setIsDispatchOpen] = useState(false);
  const [urgentBroadcast, setUrgentBroadcast] = useState<any>(null);

  useEffect(() => {
    const fetchBroadcasts = async () => {
      const [bRes, uRes] = await Promise.all([
        supabase.from('system_broadcasts')
          .select('*')
          .or('target_audience.ilike.%All%,target_audience.eq.Architects,target_audience.ilike."Architects,%",target_audience.ilike."%,Architects,%",target_audience.ilike."%,Architects"')
          .in('category', ['Update', 'Info', 'Event'])
          .order('created_at', { ascending: false })
          .limit(3),
        supabase.from('system_broadcasts')
          .select('*')
          .eq('is_active', true)
          .in('is_pinned', ["true", "True", true])
          .or('target_audience.ilike.%All%,target_audience.eq.Architects,target_audience.ilike."Architects,%",target_audience.ilike."%,Architects,%",target_audience.ilike."%,Architects"')
          .order('created_at', { ascending: false })
          .limit(1)
      ]);

      if (bRes.data) setBroadcasts(bRes.data);
      if (uRes.data && uRes.data.length > 0) {
        if (sessionStorage.getItem('dismissedAlertId') !== uRes.data[0].id) {
          setUrgentBroadcast(uRes.data[0]);
        }
      }
    };
    fetchBroadcasts();
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      const { count: scoutQueueCount } = await supabase.from('scout_suggestions').select('*', { count: 'exact', head: true }).eq('status', 'pending');
      const { count: masonQueueCount } = await supabase.from('mods').select('*', { count: 'exact', head: true }).eq('status', 'under_review');
      const { count: nexusReportsCount } = await supabase.from('nexus_reports').select('*', { count: 'exact', head: true }).eq('status', 'pending');

      const { data: ticketsDataRaw } = await supabase.from('sanctuary_tickets')
        .select('created_at, ticket_type, status, metadata')
        .in('status', ['PENDING', 'ESCALATED', 'INVESTIGATING', 'pending', 'escalated', 'investigating']);
      const { data: catData } = await supabase.from('sanctuary_support_categories').select('*');

      let supportTicketsCount = 0;
      if (ticketsDataRaw && catData) {
        const ticketsData = ticketsDataRaw.map(t => ({
          ...t,
          target_mod_id: (t as any).target_mod_id || t.metadata?.target_mod_id,
          category: t.ticket_type
        }));

        const isValidUUID = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
        const targetModIds = [...new Set(ticketsData.filter(t => t.target_mod_id).map(t => t.target_mod_id as string))].filter(Boolean).filter(isValidUUID);
        const modAuthorMap: Record<string, string> = {};
        if (targetModIds.length > 0) {
          const { data: modsData } = await supabase.from('mods').select('id, mason_id').in('id', targetModIds);
          modsData?.forEach(m => modAuthorMap[m.id] = m.mason_id);
        }

        supportTicketsCount = ticketsData.filter(t => {
          const typeStr = t.category;
          const cat = catData.find(c => c.category_name === typeStr || c.category_code === typeStr);
          let baseDest = cat?.ticket_destination || 'architect';
          if (typeStr === 'BUG_MOD' || typeStr?.toLowerCase().includes('bug_mod') || typeStr?.toLowerCase().includes('artifact')) {
            baseDest = 'mod_author';
          }
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

          return dest === 'architect' || dest === 'oversight';
        }).length;
      }
      const { count: nsfwCount } = await supabase.from('mods').select('*', { count: 'exact', head: true }).eq('compliance_tier', 1);
      const { count: explicitCount } = await supabase.from('mods').select('*', { count: 'exact', head: true }).eq('compliance_tier', 2);

      const { count: totalArtifactsCount } = await supabase.from('mods').select('*', { count: 'exact', head: true });
      const { count: unverifiedModsCount } = await supabase.from('mods').select('*', { count: 'exact', head: true }).eq('status', 'unverified');
      const { count: tier4ConflictsCount } = await supabase.from('logical_conflicts').select('*', { count: 'exact', head: true }).eq('severity_rank', 4);
      const { count: tier3ConflictsCount } = await supabase.from('logical_conflicts').select('*', { count: 'exact', head: true }).eq('severity_rank', 3);
      const { count: labQueueCount } = await supabase.from('homestead_lab_logs').select('*', { count: 'exact', head: true });

      setStats({
        scoutQueue: scoutQueueCount || 0,
        masonQueue: masonQueueCount || 0,
        nexusReports: nexusReportsCount || 0,
        supportTickets: supportTicketsCount || 0,
        nsfw: nsfwCount || 0,
        explicit: explicitCount || 0,
        totalArtifacts: totalArtifactsCount || 0,
        unverifiedMods: unverifiedModsCount || 0,
        tier4Conflicts: tier4ConflictsCount || 0,
        tier3Conflicts: tier3ConflictsCount || 0,
        labQueue: labQueueCount || 0
      });
    };
    fetchStats();
  }, []);

  return (
    <CommandScreenLayout>
      <CommandScreenStats>
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_search")}</span>} number={stats.scoutQueue} label={t("reviewing")} colorClass="border-blue-500/30 text-blue-500 hover:border-blue-500 bg-blue-500/10 hover:bg-blue-500/20" onClick={() => onNavigate("queue")} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_handyman")}</span>} number={stats.masonQueue} label={t("stat_mason_queue")} colorClass="border-emerald-500/30 text-emerald-500 hover:border-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20" onClick={() => onNavigate("mason_queue")} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_flag")}</span>} number={stats.nexusReports} label={t("title_reports")} colorClass="border-amber-500/30 text-amber-500 hover:border-amber-500 bg-amber-500/10 hover:bg-amber-500/20" onClick={() => onNavigate("nexus_reports")} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_local_activity")}</span>} number={stats.supportTickets} label={t("ql_support")} colorClass="border-indigo-500/30 text-indigo-500 hover:border-indigo-500 bg-indigo-500/10 hover:bg-indigo-500/20" onClick={() => onNavigate("support_tickets")} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_18_up_rating")}</span>} number={stats.nsfw + stats.explicit} label={`${t("stat_nsfw_flags")} / ${t("stat_explicit_reports")}`} colorClass="border-orange-500/30 text-orange-500 hover:border-orange-500 bg-orange-500/10 hover:bg-orange-500/20" onClick={() => onNavigate('registry', 'nsfw')} />
      </CommandScreenStats>

      <UrgentBroadcastBanner urgentBroadcast={urgentBroadcast} setViewingPost={setViewingPost} setUrgentBroadcast={setUrgentBroadcast} />

      <CommandScreenBody>
        <CommandScreenMain>
          <CommandScreenSectionHeading title={t("wf_comms_title")} icon="history" />

          <div className="flex flex-col gap-8 w-full">
            <SystemBroadcastsGrid broadcasts={broadcasts} setViewingPost={setViewingPost} />

            <CommandScreenSectionHeading title={t("metrics")} icon="monitoring" />
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 w-full">
              <CommandScreenMetricTile value={stats.totalArtifacts} label={t("items")} valueColorClass="text-orange-500" hoverBorderClass="hover:border-orange-500/30" />
              <CommandScreenMetricTile value={stats.unverifiedMods} label={t("unverified")} valueColorClass="text-blue-500" hoverBorderClass="hover:border-blue-500/30" />
              <CommandScreenMetricTile value={stats.tier4Conflicts} label={t("stat_tier4")} valueColorClass="text-red-500" hoverBorderClass="hover:border-red-500/30" />
              <CommandScreenMetricTile value={stats.tier3Conflicts} label={t("stat_tier3")} valueColorClass="text-orange-500" hoverBorderClass="hover:border-orange-500/30" />
              <CommandScreenMetricTile value={stats.labQueue} label={t("stat_lab_queue")} valueColorClass="text-blue-500" hoverBorderClass="hover:border-blue-500/30" />
            </div>
          </div>
        </CommandScreenMain>

        <CommandScreenSidebar title={t("wf_quick_links")} icon="rocket_launch">
          {urgentBroadcast && (
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

          <CommandScreenQuickLink onClick={() => onNavigate("matrix")} icon={t("icon_security")} title={t("ql_conflict")} subtitle={t("ql_logical_issues")} iconBorderHoverClass="group-hover:border-[var(--accent)]/30" iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" textColorClass="text-rose-400" hoverTextColorClass="group-hover:text-rose-300" dotColorClass="bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.8)]" />

          <CommandScreenQuickLink onClick={() => onNavigate("template_oversight")} icon={t("icon_data_object") || "data_object"} title={t("ql_templates")} subtitle={t("ql_templates_desc")} iconBorderHoverClass="group-hover:border-[var(--accent)]/30" iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" textColorClass="text-fuchsia-400" hoverTextColorClass="group-hover:text-fuchsia-300" dotColorClass="bg-fuchsia-400 shadow-[0_0_8px_rgba(232,121,249,0.8)]" />

          <CommandScreenQuickLink onClick={() => onNavigate("lab")} icon={t("icon_monitor_heart")} title={t("tab_lab")} subtitle={t("ql_system_health")} iconBorderHoverClass="group-hover:border-[var(--accent)]/30" iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" textColorClass="text-emerald-400" hoverTextColorClass="group-hover:text-emerald-300" dotColorClass="bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />

          <CommandScreenQuickLink onClick={() => onNavigate("support_tickets")} icon={t("icon_local_activity")} title={t("ql_support")} subtitle={t("ql_help_requests")} iconBorderHoverClass="group-hover:border-[var(--accent)]/30" iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" textColorClass="text-indigo-400" hoverTextColorClass="group-hover:text-indigo-300" dotColorClass="bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]" />

          {!urgentBroadcast && (
            <CommandScreenQuickLink onClick={() => setIsAlertsOpen(true)} icon="warning_off" title={t("title_sanctuary_alerts") || "Sanctuary Alerts"} subtitle={t("alert_empty") || "SYSTEM BROADCASTS"} iconBorderHoverClass="group-hover:border-amber-500/30" iconShadowClass="drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]" textColorClass="text-amber-500/80" hoverTextColorClass="group-hover:text-amber-400" dotColorClass="bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
          )}
        </CommandScreenSidebar>
      </CommandScreenBody>

      <SanctuaryAlertsSidePanel
        isOpen={isAlertsOpen}
        onClose={() => setIsAlertsOpen(false)}
        audience="Architects"
      />

      <WayfinderPostsEditor
        authorId="architect"
        authorProfileId="architect"
        isSidePanel={true}
        isOpen={isDispatchOpen}
        onClose={() => setIsDispatchOpen(false)}
        isOversight={true}
      />
    </CommandScreenLayout>
  );
}
