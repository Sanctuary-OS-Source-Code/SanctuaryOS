import { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import { useLexicon } from "../../LexiconContext";
import { SanctuaryAlertsSidePanel } from '../../side-panels/SanctuaryAlertsSidePanel';
import { WayfinderPostsEditor } from "../WayfinderPostsEditor";
import { useStore } from '../../store';
import { CommandScreenLayout, CommandScreenBody, CommandScreenSidebar, CommandScreenStats, CommandScreenMain, SystemBroadcastsGrid, CommandScreenMetricTile, CommandScreenQuickLink, DashboardStatTile, AlertStatTile, CommandScreenSectionHeading } from "../SharedCommandScreenLayout";
import { UniversalCard } from "../../components/universal/UniversalCard";

const VAULT_CHIP_CLASS = "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

export function ArchitectCommandScreen({ onNavigate, setViewingPost }: any) {
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
  
  const [recentScout, setRecentScout] = useState<any[]>([]);
  const [recentMason, setRecentMason] = useState<any[]>([]);
  const [recentReports, setRecentReports] = useState<any[]>([]);


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

      if (bRes.data) {
        const gameName = useStore.getState().activeGameSchema?.display_name || useStore.getState().activeGameSchema?.name || t("sanctuary_default_name", "Sanctuary");
        setBroadcasts(bRes.data.map((p: any) => ({
          ...p,
          masons: { name: `${gameName} Team` }
        })));
      }
      if (uRes.data && uRes.data.length > 0) {
        if (sessionStorage.getItem('dismissedAlertId') !== String(uRes.data[0].id)) {
          const gameName = useStore.getState().activeGameSchema?.display_name || useStore.getState().activeGameSchema?.name || t("sanctuary_default_name", "Sanctuary");
          setUrgentBroadcast({
            ...uRes.data[0],
            masons: { name: `${gameName} Team` }
          });
        }
      }
    };
    const fetchRecentItems = async () => {
        const [scoutRes, masonRes, reportRes] = await Promise.all([
            supabase.from('scout_suggestions').select('*').eq('status', 'pending').order('created_at', { ascending: false }).limit(6),
            supabase.from('mods').select('id, name, created_at, description').eq('status', 'under_review').order('created_at', { ascending: false }).limit(6),
            supabase.from('nexus_reports').select('*').eq('status', 'pending').order('created_at', { ascending: false }).limit(6)
        ]);
        if (scoutRes.data) setRecentScout(scoutRes.data);
        if (masonRes.data) setRecentMason(masonRes.data);
        if (reportRes.data) setRecentReports(reportRes.data);
    };
    fetchBroadcasts();
    fetchRecentItems();
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
              } else if (esciArc === 'Oversight') {
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
      const { count: nsfwCount } = { count: 0 };
      const { count: explicitCount } = await supabase.from('mods').select('*', { count: 'exact', head: true }).in('compliance_tier', [1,2,3,4]);

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
      <CommandScreenStats gridClassOverride={urgentBroadcast ? "grid-cols-2 lg:grid-cols-4" : undefined}>
        {urgentBroadcast && (
          <AlertStatTile className="col-span-2" broadcast={urgentBroadcast} number={urgentBroadcast ? 1 : 0} active={!!urgentBroadcast} onClick={() => setIsAlertsOpen(true)} />
        )}
        {urgentBroadcast && (
          <DashboardStatTile className="col-span-2" icon={<span className="material-symbols-outlined ">{t("icon_flag", "flag")}</span>} number={stats.nexusReports} label={t("title_reports", "Reports Queue")} colorClass="text-amber-500" onClick={() => onNavigate("nexus_reports")} />
        )}
        <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_search", "search")}</span>} number={stats.scoutQueue} label={t("reviewing", "Scanner Queue")} colorClass="text-blue-500" onClick={() => onNavigate("queue")} />
        <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_handyman", "handyman")}</span>} number={stats.masonQueue} label={t("mason_queue", "{Mason} Queue")} colorClass="text-emerald-500" onClick={() => onNavigate("mason_queue")} />
        <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_local_activity", "local_activity")}</span>} number={stats.supportTickets} label={t("ql_support", "Support Queue")} colorClass="text-indigo-500" onClick={() => onNavigate("support_tickets")} />
        <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_18_up_rating", "18_up_rating")}</span>} number={stats.nsfw + stats.explicit} label={`${t("stat_nsfw_flags", "Nsfw Flags")} / ${t("stat_explicit_reports", "Explicit Reports")}`} colorClass="text-orange-500" onClick={() => onNavigate('registry', 'nsfw')} />
        {!urgentBroadcast && (
          <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_flag", "flag")}</span>} number={stats.nexusReports} label={t("title_reports", "Reports Queue")} colorClass="text-amber-500" onClick={() => onNavigate("nexus_reports")} />
        )}
      </CommandScreenStats>


      <CommandScreenBody>
        <CommandScreenMain>
          <div className="flex flex-col gap-4 w-full">
            <CommandScreenSectionHeading title={t("wf_comms_title", "Latest Dispatch")} icon="history" />
            <div className="w-full">
              <SystemBroadcastsGrid broadcasts={broadcasts} setViewingPost={setViewingPost} />
            </div>
          </div>

          {recentScout.length > 0 && (
            <div className="flex flex-col gap-4 w-full">
              <CommandScreenSectionHeading title={t("reviewing", "Scanner Queue")} icon="search" />
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
                  {recentScout.map((item: any) => (
                      <UniversalCard 
                          key={`scout-${item.id}`} 
                          layout="vertical" 
                          title={item.suggestion_text || t("reviewing", "Scanner Queue")} 
                          icon={t("icon_search", "search")} 
                          onClick={() => onNavigate("queue")}
                          className="w-full"
                          imageOverlay={
                              <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
                                  <div className={VAULT_CHIP_CLASS}>
                                      <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">{t("icon_pending_actions", "pending_actions")}</span>
                                      <span>{t("status_pending", "Pending")}</span>
                                  </div>
                              </div>
                          }
                          badges={
                              <div className={VAULT_CHIP_CLASS}>
                                  <span className="material-symbols-outlined !text-[12px] text-[var(--info)]">{t("icon_search", "search")}</span>
                                  <span>{t("reviewing", "Scanner Queue")}</span>
                              </div>
                          }
                          footer={
                              <div className="flex items-center justify-start w-full mt-2">
                                  <span className="text-[10px] font-black capitalize tracking-widest opacity-50 text-[var(--subtext)] flex items-center gap-2">
                                      <span className="material-symbols-outlined !text-[12px]">{t("icon_calendar_today", "calendar_today")}</span> {new Date(item.created_at).toLocaleDateString()}
                                  </span>
                              </div>
                          }
                      >
                          <p className="text-xs text-[var(--subtext)] leading-relaxed font-bold opacity-80 line-clamp-3 mt-1">
                              {item.metadata?.notes || t("status_pending", "Pending")}
                          </p>
                      </UniversalCard>
                  ))}
              </div>
            </div>
          )}

          {recentMason.length > 0 && (
            <div className="flex flex-col gap-4 w-full">
              <CommandScreenSectionHeading title={t("mason_queue", "{Mason} Queue")} icon="handyman" />
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
                  {recentMason.map((item: any) => (
                      <UniversalCard 
                          key={`mason-${item.id}`} 
                          layout="vertical" 
                          title={item.name || t("term_mod", "{Mod}")} 
                          icon={t("icon_handyman", "handyman")} 
                          onClick={() => onNavigate("mason_queue")}
                          className="w-full"
                          imageOverlay={
                              <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
                                  <div className={VAULT_CHIP_CLASS}>
                                      <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">{t("icon_pending_actions", "pending_actions")}</span>
                                      <span>{t("status_pending", "Pending")}</span>
                                  </div>
                              </div>
                          }
                          badges={
                              <div className={VAULT_CHIP_CLASS}>
                                  <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">{t("icon_handyman", "handyman")}</span>
                                  <span>{t("mason_queue", "{Mason} Queue")}</span>
                              </div>
                          }
                          footer={
                              <div className="flex items-center justify-start w-full mt-2">
                                  <span className="text-[10px] font-black capitalize tracking-widest opacity-50 text-[var(--subtext)] flex items-center gap-2">
                                      <span className="material-symbols-outlined !text-[12px]">{t("icon_calendar_today", "calendar_today")}</span> {new Date(item.created_at).toLocaleDateString()}
                                  </span>
                              </div>
                          }
                      >
                          <p className="text-xs text-[var(--subtext)] leading-relaxed font-bold opacity-80 line-clamp-3 mt-1">
                              {item.description || t("status_pending", "Pending")}
                          </p>
                      </UniversalCard>
                  ))}
              </div>
            </div>
          )}

          {recentReports.length > 0 && (
            <div className="flex flex-col gap-4 w-full">
              <CommandScreenSectionHeading title={t("title_reports", "Reports Queue")} icon="flag" />
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
                  {recentReports.map((report: any) => (
                      <UniversalCard 
                          key={`rep-${report.id}`} 
                          layout="vertical" 
                          title={report.report_reason || t("title_reports", "Reports Queue")} 
                          icon={t("icon_flag", "flag")} 
                          onClick={() => onNavigate("nexus_reports")}
                          className="w-full"
                          imageOverlay={
                              <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
                                  <div className={VAULT_CHIP_CLASS}>
                                      <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">{t("icon_pending_actions", "pending_actions")}</span>
                                      <span>{t("status_pending", "Pending")}</span>
                                  </div>
                              </div>
                          }
                          badges={
                              <div className={VAULT_CHIP_CLASS}>
                                  <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">{t("icon_flag", "flag")}</span>
                                  <span>{t("title_reports", "Reports Queue")}</span>
                              </div>
                          }
                          footer={
                              <div className="flex items-center justify-start w-full mt-2">
                                  <span className="text-[10px] font-black capitalize tracking-widest opacity-50 text-[var(--subtext)] flex items-center gap-2">
                                      <span className="material-symbols-outlined !text-[12px]">{t("icon_calendar_today", "calendar_today")}</span> {new Date(report.created_at).toLocaleDateString()}
                                  </span>
                              </div>
                          }
                      >
                          <p className="text-xs text-[var(--subtext)] leading-relaxed font-bold opacity-80 line-clamp-3 mt-1">
                              {report.details || t("status_pending", "Pending")}
                          </p>
                      </UniversalCard>
                  ))}
              </div>
            </div>
          )}

        </CommandScreenMain>

        <CommandScreenSidebar title={t("wf_quick_links", "Quick Links")} icon={t("icon_rocket_launch", "rocket_launch")}>
          {urgentBroadcast && (
            <CommandScreenQuickLink 
              icon={t("icon_priority_high", "priority_high")}
              title={t("title_sanctuary_alerts", "Sanctuary Alerts")}
              subtitle={t("urgent_alert", "Urgent Alert")}
              onClick={() => setIsAlertsOpen(true)}
              isAlert={true}
            />
          )}

          <CommandScreenQuickLink onClick={() => onNavigate("registry")} icon={t("icon_inventory_2", "inventory_2")} title={t("term_mods", "Mods")} subtitle={t("ql_logical_issues", "Logical Issues")} iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]" iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" textColorClass="text-rose-400" hoverTextColorClass="group-hover:text-rose-300" dotColorClass="bg-rose-400 shadow-md" />

          <CommandScreenQuickLink onClick={() => onNavigate("template_oversight")} icon={t("icon_data_object", "data_object")} title={t("ql_templates", "Templates")} subtitle={t("ql_templates_desc", "Manage Metadata Formats")} iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]" iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" textColorClass="text-fuchsia-400" hoverTextColorClass="group-hover:text-fuchsia-300" dotColorClass="bg-fuchsia-400 shadow-md" />

          <CommandScreenQuickLink onClick={() => onNavigate("lab")} icon={t("icon_monitor_heart", "monitor_heart")} title={t("tab_lab", "Testing DIAGNOSTICS")} subtitle={t("ql_system_health", "System Health")} iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]" iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" textColorClass="text-emerald-400" hoverTextColorClass="group-hover:text-emerald-300" dotColorClass="bg-emerald-400 shadow-md" />

          <CommandScreenQuickLink onClick={() => onNavigate("support_tickets")} icon={t("icon_local_activity", "local_activity")} title={t("ql_support", "Support Queue")} subtitle={t("ql_help_requests", "Help Requests")} iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]" iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" textColorClass="text-indigo-400" hoverTextColorClass="group-hover:text-indigo-300" dotColorClass="bg-indigo-400 shadow-md" />

          {!urgentBroadcast && (
            <CommandScreenQuickLink onClick={() => setIsAlertsOpen(true)} icon={t("icon_warning_off", "warning_off")} title={t("title_sanctuary_alerts", "Sanctuary Alerts")} subtitle={t("alert_empty", "No Active Alerts")} iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--warning)_30%,transparent)]" iconShadowClass="drop-shadow-md" textColorClass="text-[color-mix(in_srgb,var(--warning)_80%,transparent)]" hoverTextColorClass="group-hover:text-amber-400" dotColorClass="bg-amber-500 shadow-md" />
          )}
        </CommandScreenSidebar>
      </CommandScreenBody>

      <div className="flex flex-col gap-4 w-full">
        <CommandScreenSectionHeading title={t("metrics", "Hub Metrics")} icon={t("icon_monitoring", "monitoring")} />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 w-full">
          <CommandScreenMetricTile icon={t("icon_deployed_code", "deployed_code")} value={stats.totalArtifacts} label={t("term_mods", "Mods")} valueColorClass="text-orange-500" hoverBorderClass="hover:border-[color-mix(in_srgb,var(--warning)_30%,transparent)]" />
          <CommandScreenMetricTile icon={t("icon_pending_actions", "pending_actions")} value={stats.unverifiedMods} label={t("unverified", "Unverified")} valueColorClass="text-blue-500" hoverBorderClass="hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]" />
          <CommandScreenMetricTile icon={t("icon_report", "report")} value={stats.tier4Conflicts} label={t("stat_tier4", "Severity 4")} valueColorClass="text-red-500" hoverBorderClass="hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)]" />
          <CommandScreenMetricTile icon={t("icon_warning", "warning")} value={stats.tier3Conflicts} label={t("stat_tier3", "Severity 3")} valueColorClass="text-orange-500" hoverBorderClass="hover:border-[color-mix(in_srgb,var(--warning)_30%,transparent)]" />
          <CommandScreenMetricTile icon={t("icon_science", "science")} value={stats.labQueue} label={t("stat_lab_queue", "Testing Queue")} valueColorClass="text-blue-500" hoverBorderClass="hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]" />
        </div>
      </div>

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
