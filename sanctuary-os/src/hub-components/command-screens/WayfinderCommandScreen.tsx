import React, { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import { useLexicon } from "../../LexiconContext";
import { useStore } from "../../store";
import { SanctuaryAlertsSidePanel } from '../../side-panels/SanctuaryAlertsSidePanel';
import { ServerHealthSidePanel } from '../../side-panels/WayfinderSidePanels';
import { DefconSidePanel } from "../SADefcon";
import MasonPostViewer from "../../side-panels/MasonPostViewer";
import WayfinderKeeperSidePanel from "../../side-panels/WayfinderKeeperSidePanel";
import { CommandScreenLayout, UrgentBroadcastBanner, CommandScreenBody, CommandScreenSidebar, CommandScreenStats, CommandScreenMain, SystemBroadcastsGrid, CommandScreenMetricTile, CommandScreenQuickLink, DashboardStatTile, AlertStatTile, CommandScreenSectionHeading } from "../SharedCommandScreenLayout";
import { UniversalCard } from "../../components/universal/UniversalCard";

export function WayfinderCommandScreen({ setTab, setComplianceFilter, onOpenMasonProfile }: any) {
  const { t } = useLexicon();
  const { session, defconLevel } = useStore();
  const workspaces = useStore((state: any) => state.workspaces);
  const activeWorkspaceId = useStore((state: any) => state.activeWorkspaceId);
  const [defconOpen, setDefconOpen] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [isKeeperSupportOpen, setIsKeeperSupportOpen] = useState(false);
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [viewingPost, setViewingPost] = useState<any>(null);
  const [currentAudience, setCurrentAudience] = useState("Wayfinders");
  const [stats, setStats] = useState({
    supportQueue: 0,
    flaggedQueue: 0,
    reportQueue: 0,
    oversightQueue: 0,
    oversightQueueNew: 0,
    quarantined: 0,
    networkLatency: null as number | null,
    networkStatus: "CONNECTING...",
    citizens: 0,
    masons: 0,
    architects: 0,
    oversights: 0,
    blacklisted: 0,
    urgentBroadcast: null as any | null
  });

  const [recentSupport, setRecentSupport] = useState<any[]>([]);
  const [recentMalware, setRecentMalware] = useState<any[]>([]);
  const [recentCompliance, setRecentCompliance] = useState<any[]>([]);

  useEffect(() => {
    const fetchStats = async () => {
      const startTime = performance.now();
      let netLatency = null;
      let netStatus = "OFFLINE";
      try {
        const networkResponse = await supabase.from('global_network_status').select("id").limit(1);
        netLatency = Math.round(performance.now() - startTime);
        netStatus = "ONLINE";
        if (!networkResponse) {
          netStatus = "ERROR";
        }
      } catch (e) {
        netStatus = "ERROR";
      }

      const { data: ticketsDataRaw } = await supabase.from('sanctuary_tickets')
        .select('*')
        .in('status', ['open', 'new', 'pending', 'escalated', 'investigating']);

      const { data: catData } = await supabase.from('sanctuary_support_categories').select('*');

      let wayfinderTickets = 0;
      if (ticketsDataRaw && catData) {
        wayfinderTickets = ticketsDataRaw.filter((t: any) => {
          const typeStr = t.ticket_type;
          const cat = catData.find((c: any) => c.category_name === typeStr || c.category_code === typeStr);
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

          return dest === 'wayfinder';
        }).length;
      }

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const isoDate = thirtyDaysAgo.toISOString();

      const { count: flaggedQueueCount } = await supabase.from('mods')
        .select('*', { count: 'exact', head: true })
        .in('compliance_tier', [1, 2, 3])
        .gte('created_at', isoDate);

      const { count: quarantinedCount } = await supabase.from('mods')
        .select('*', { count: 'exact', head: true })
        .eq('compliance_tier', 3);

      const { count: oversightQueueCount } = await supabase.from('malware_reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      const { count: oversightNewCount } = await supabase.from('malware_reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
        .gte('created_at', isoDate);

      const { count: reportQueueCount } = await supabase.from('nexus_reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
        .gte('created_at', isoDate);

      const { count: citizensCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'citizen');
      const { count: masonsCount } = await supabase.from('masons').select('*', { count: 'exact', head: true });
      const { count: architectsCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'architect');
      const { count: oversightsCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'oversight');
      const { count: blacklistedCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_banned', true);

      let audienceStr = "Wayfinders";
      if (activeWorkspaceId) {
        const ws = workspaces?.find((w: any) => w.id === activeWorkspaceId);
        if (ws && ws.schema_id) {
          const { data: gameData } = await supabase.from('sanctuary_games').select('name').eq('schema_id', ws.schema_id).maybeSingle();
          if (gameData && gameData.name) audienceStr = gameData.name;
          else audienceStr = ws.name || "Wayfinders";
        }
      }
      setCurrentAudience(audienceStr);

      const { data: broadcastsData, error: bErr } = await supabase.from('keeper_system_broadcasts')
        .select('*')
        .or(`target_audience.ilike.%All%,target_audience.ilike.%${audienceStr.replace(/ /g, '_')}%`)
        .in('category', ['Update', 'Info', 'Event', 'System'])
        .order('created_at', { ascending: false })
        .limit(3);
      if (bErr) console.error("Broadcast Fetch Error", bErr);
      if (broadcastsData) setBroadcasts(broadcastsData);

      const { data: urgentData, error: uErr } = await supabase.from('keeper_system_broadcasts')
        .select('*')
        .eq('is_active', true)
        .in('is_pinned', ["true", "True", true])
        .or(`target_audience.ilike.%All%,target_audience.ilike.%${audienceStr.replace(/ /g, '_')}%`)
        .order('created_at', { ascending: false })
        .limit(1);
      if (uErr) console.error("Urgent Fetch Error", uErr);

      let finalUrgent = null;
      if (urgentData && urgentData.length > 0) {
        if (sessionStorage.getItem('dismissedAlertId') !== String(urgentData[0].id)) {
          finalUrgent = urgentData[0];
        }
      }

      setStats({
        supportQueue: wayfinderTickets,
        flaggedQueue: flaggedQueueCount || 0,
        reportQueue: reportQueueCount || 0,
        oversightQueue: oversightQueueCount || 0,
        oversightQueueNew: oversightNewCount || 0,
        quarantined: quarantinedCount || 0,
        networkLatency: netLatency,
        networkStatus: netStatus,
        citizens: citizensCount || 0,
        masons: masonsCount || 0,
        architects: architectsCount || 0,
        oversights: oversightsCount || 0,
        blacklisted: blacklistedCount || 0,
        urgentBroadcast: finalUrgent
      });
    };

    const fetchRecentItems = async () => {
        const [supportRes, malwareRes, complianceRes] = await Promise.all([
            supabase.from('sanctuary_tickets').select('*').neq('status', 'RESOLVED').order('created_at', { ascending: false }).limit(6),
            supabase.from('malware_reports').select('*').eq('status', 'pending').order('created_at', { ascending: false }).limit(6),
            supabase.from('mods').select('id, name, created_at, description, compliance_tier').in('compliance_tier', [1,2,3,4,5]).order('created_at', { ascending: false }).limit(6)
        ]);
        if (supportRes.data) setRecentSupport(supportRes.data);
        if (malwareRes.data) setRecentMalware(malwareRes.data);
        if (complianceRes.data) setRecentCompliance(complianceRes.data);
    };

    fetchStats();
    fetchRecentItems();
  }, [activeWorkspaceId]);

  return (
    <CommandScreenLayout>
      <CommandScreenStats gridClassOverride={stats.urgentBroadcast ? "grid-cols-2 lg:grid-cols-4" : undefined}>
        {stats.urgentBroadcast && (
          <AlertStatTile className="col-span-2" number={stats.urgentBroadcast ? 1 : 0} active={!!stats.urgentBroadcast} onClick={() => setViewingPost({ ...stats.urgentBroadcast, content: stats.urgentBroadcast.message || stats.urgentBroadcast.content, mason_id: 'system', masons: { name: t("author_sanctuary_team") }, views: 0, likes: 0, replies: 0 })} />
        )}
        <DashboardStatTile className={stats.urgentBroadcast ? "col-span-2" : ""} icon={<span className="material-symbols-outlined ">{t("icon_dns")}</span>} number={stats.networkLatency ? `${stats.networkLatency}` : "---"} label={stats.networkStatus === "ONLINE" ? (t("wf_stat_server_nominal")) : (t("wf_stat_server_degraded"))} colorClass={stats.networkStatus === "ONLINE" ? "border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-emerald-500 hover:border-emerald-500 bg-[color-mix(in_srgb,var(--success)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)]" : "border-[color-mix(in_srgb,var(--warning)_30%,transparent)] text-yellow-500 hover:border-yellow-500 bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--warning)_20%,transparent)]"} onClick={() => setHealthOpen(true)} />
        <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_local_activity")}</span>} number={stats.supportQueue} label={t("ql_support")} colorClass="text-purple-500" onClick={() => setTab("sanctuary_tickets")} />
        <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_flag")}</span>} number={stats.flaggedQueue} label={t("wf_stat_flagged")} colorClass="text-orange-500" onClick={() => { if (setComplianceFilter) setComplianceFilter('flagged'); setTab("compliance"); }} />
        <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_coronavirus")}</span>} number={stats.quarantined} label={t("wf_stat_quarantined")} colorClass="text-red-500" onClick={() => { if (setComplianceFilter) setComplianceFilter('pending'); setTab("malware_oversight"); }} />
        <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_threat_intelligence")}</span>} number={stats.oversightQueueNew} label={t("stat_malware_logs")} colorClass="text-red-500" onClick={() => setTab("oversight_reports")} />
      </CommandScreenStats>


      <CommandScreenBody>
        <CommandScreenMain>
          <CommandScreenSectionHeading title={t("wf_comms_title")} icon="history" />
          <div className="w-full mb-8">
            <SystemBroadcastsGrid broadcasts={broadcasts} setViewingPost={setViewingPost} />
          </div>

          {recentSupport.length > 0 && (
            <>
              <CommandScreenSectionHeading title={t("wf_tab_tickets")} icon="local_activity" />
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full mb-8">
                  {recentSupport.map((item: any) => (
                      <UniversalCard 
                          key={`support-${item.id}`} 
                          layout="vertical" 
                          title={item.ticket_type || "Support Ticket"} 
                          icon="local_activity" 
                          onClick={() => setTab("sanctuary_tickets")}
                          className="w-full"
                          imageOverlay={
                              <div className="absolute top-3 left-3 flex flex-wrap gap-2 z-30">
                                  <span className="px-2 py-0.5 bg-[color-mix(in_srgb,var(--info)_20%,transparent)] text-[var(--info)] text-[9px] font-black capitalize tracking-widest rounded-lg backdrop-blur-md">{t("wf_tab_tickets")}</span>
                              </div>
                          }
                          footer={
                              <div className="flex items-center justify-start w-full mt-2">
                                  <span className="text-[10px] font-black capitalize tracking-widest opacity-50 text-[var(--subtext)] flex items-center gap-2">
                                      <span className="material-symbols-outlined !text-[12px]">{t("icon_calendar_today")}</span> {new Date(item.created_at).toLocaleDateString()}
                                  </span>
                              </div>
                          }
                      >
                          <p className="text-xs text-[var(--subtext)] leading-relaxed font-bold opacity-80 line-clamp-3 mt-1">
                              {item.metadata?.description || "Open ticket."}
                          </p>
                      </UniversalCard>
                  ))}
              </div>
            </>
          )}

          {recentMalware.length > 0 && (
            <>
              <CommandScreenSectionHeading title={t("rating_malware")} icon="coronavirus" />
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full mb-8">
                  {recentMalware.map((item: any) => (
                      <UniversalCard 
                          key={`malware-${item.id}`} 
                          layout="vertical" 
                          title={"Malware Report"} 
                          icon="coronavirus" 
                          onClick={() => { if (setComplianceFilter) setComplianceFilter('pending'); setTab("malware_oversight"); }}
                          className="w-full"
                          imageOverlay={
                              <div className="absolute top-3 left-3 flex flex-wrap gap-2 z-30">
                                  <span className="px-2 py-0.5 bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] text-[var(--danger)] text-[9px] font-black capitalize tracking-widest rounded-lg backdrop-blur-md">{t("rating_malware")}</span>
                              </div>
                          }
                          footer={
                              <div className="flex items-center justify-start w-full mt-2">
                                  <span className="text-[10px] font-black capitalize tracking-widest opacity-50 text-[var(--subtext)] flex items-center gap-2">
                                      <span className="material-symbols-outlined !text-[12px]">{t("icon_calendar_today")}</span> {new Date(item.created_at).toLocaleDateString()}
                                  </span>
                              </div>
                          }
                      >
                          <p className="text-xs text-[var(--subtext)] leading-relaxed font-bold opacity-80 line-clamp-3 mt-1">
                              {item.reason || "Pending oversight review."}
                          </p>
                      </UniversalCard>
                  ))}
              </div>
            </>
          )}

          {recentCompliance.length > 0 && (
            <>
              <CommandScreenSectionHeading title={t("tab_compliance")} icon="policy" />
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full mb-8">
                  {recentCompliance.map((item: any) => (
                      <UniversalCard 
                          key={`compliance-${item.id}`} 
                          layout="vertical" 
                          title={item.name || "Artifact"} 
                          icon="policy" 
                          onClick={() => { if (setComplianceFilter) setComplianceFilter('flagged'); setTab("compliance"); }}
                          className="w-full"
                          imageOverlay={
                              <div className="absolute top-3 left-3 flex flex-wrap gap-2 z-30">
                                  <span className="px-2 py-0.5 bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] text-[var(--warning)] text-[9px] font-black capitalize tracking-widest rounded-lg backdrop-blur-md">{t("tab_compliance")}</span>
                              </div>
                          }
                          footer={
                              <div className="flex items-center justify-start w-full mt-2">
                                  <span className="text-[10px] font-black capitalize tracking-widest opacity-50 text-[var(--subtext)] flex items-center gap-2">
                                      <span className="material-symbols-outlined !text-[12px]">{t("icon_calendar_today")}</span> {new Date(item.created_at).toLocaleDateString()}
                                  </span>
                              </div>
                          }
                      >
                          <p className="text-xs text-[var(--subtext)] leading-relaxed font-bold opacity-80 line-clamp-3 mt-1">
                              {item.description || "Compliance flagged artifact."}
                          </p>
                      </UniversalCard>
                  ))}
              </div>
            </>
          )}

          <CommandScreenSectionHeading title={t("metrics")} icon="monitoring" />
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <CommandScreenMetricTile value={stats.citizens} label={t("stat_users")} valueColorClass="theme-text-accent" hoverBorderClass="hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]" />
            <CommandScreenMetricTile value={stats.masons} label={t("tab_linker")} valueColorClass="theme-text-accent" hoverBorderClass="hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]" />
            <CommandScreenMetricTile value={stats.architects} label={t("stat_architects")} valueColorClass="text-purple-400" hoverBorderClass="hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]" />
            <CommandScreenMetricTile value={stats.oversights} label={t("hub_stat_oversights")} valueColorClass="text-indigo-400" hoverBorderClass="hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]" />
            <CommandScreenMetricTile value={stats.oversightQueue} label={t("tab_malware_logs")} valueColorClass="text-red-500" hoverBorderClass="hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)]" />
          </div>
        </CommandScreenMain>

        <CommandScreenSidebar title={t("wf_quick_links")} icon="rocket_launch">
          {stats.urgentBroadcast && (
            <CommandScreenQuickLink 
              icon="priority_high"
              title={t("title_sanctuary_alerts")}
              subtitle={t("urgent_alert_active")}
              onClick={() => setIsAlertsOpen(true)}
              isAlert={true}
            />
          )}
          <CommandScreenQuickLink onClick={() => setTab("oversight_reports")} icon={t("icon_threat_intelligence")} title={t("stat_malware_logs")} subtitle={t("ql_sys_reports")} iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]" iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" textColorClass="text-red-500" hoverTextColorClass="group-hover:text-red-500" dotColorClass="bg-red-500 shadow-md" />

          <CommandScreenQuickLink onClick={() => setTab("sanctuary_tickets")} icon={t("icon_local_activity")} title={t("ql_support")} subtitle={t("wf_link_tickets_sub")} iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]" iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" textColorClass="text-purple-400" hoverTextColorClass="group-hover:text-purple-300" dotColorClass="bg-purple-400 shadow-md" />

          <CommandScreenQuickLink onClick={() => setIsKeeperSupportOpen(true)} icon={t("icon_admin_panel_settings")} title={t("wf_keeper_support_title")} subtitle={t("wf_keeper_support_subtitle")} iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]" iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" textColorClass="text-teal-400" hoverTextColorClass="group-hover:text-teal-300" dotColorClass="bg-teal-400 shadow-md" />

          <CommandScreenQuickLink onClick={() => setTab("support_settings")} icon={t("icon_support_agent")} title={t("tab_support")} subtitle={t("wf_link_support_sub")} iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]" iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" textColorClass="text-amber-400" hoverTextColorClass="group-hover:text-amber-300" dotColorClass="bg-amber-400 shadow-md" />

          <CommandScreenQuickLink onClick={() => setTab("audit_logs")} icon={t("icon_history")} title={t("audit_title")} subtitle={t("link_audit_sub")} iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]" iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" textColorClass="text-blue-400" hoverTextColorClass="group-hover:text-blue-300" dotColorClass="bg-blue-400 shadow-md" />

          {!stats.urgentBroadcast && (
            <CommandScreenQuickLink onClick={() => setIsAlertsOpen(true)} icon="warning_off" title={t("title_sanctuary_alerts")} subtitle={t("alert_empty")} iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--warning)_30%,transparent)]" iconShadowClass="drop-shadow-md" textColorClass="text-[color-mix(in_srgb,var(--warning)_80%,transparent)]" hoverTextColorClass="group-hover:text-amber-400" dotColorClass="bg-amber-500 shadow-md" />
          )}
        </CommandScreenSidebar>
      </CommandScreenBody>

      <ServerHealthSidePanel isOpen={healthOpen} onClose={() => setHealthOpen(false)} stats={stats} />
      <DefconSidePanel isOpen={defconOpen} onClose={() => setDefconOpen(false)} />
      <SanctuaryAlertsSidePanel
        isOpen={isAlertsOpen}
        onClose={() => setIsAlertsOpen(false)}
        audience={currentAudience}
        tableName="keeper_system_broadcasts"
      />
      {viewingPost && (
        <MasonPostViewer
          post={viewingPost}
          onClose={() => setViewingPost(null)}
          userId={session?.user?.id || 'wayfinder'}
          onOpenMasonProfile={onOpenMasonProfile}
        />
      )}
      <WayfinderKeeperSidePanel userId={session?.user?.id || ""} isOpen={isKeeperSupportOpen} onClose={() => setIsKeeperSupportOpen(false)} />
    </CommandScreenLayout>
  );
}
