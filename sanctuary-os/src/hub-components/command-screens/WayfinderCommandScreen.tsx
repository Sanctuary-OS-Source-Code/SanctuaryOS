import React, { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import { useLexicon } from "../../LexiconContext";
import { useStore } from "../../store";
import { SanctuaryAlertsSidePanel } from '../../side-panels/SanctuaryAlertsSidePanel';
import { ServerHealthSidePanel } from '../../side-panels/WayfinderSidePanels';
import { DefconSidePanel } from "../SADefcon";
import MasonPostViewer from "../../side-panels/MasonPostViewer";
import WayfinderKeeperSidePanel from "../../side-panels/WayfinderKeeperSidePanel";
import { CommandScreenLayout, CommandScreenBody, CommandScreenSidebar, CommandScreenStats, CommandScreenMain, UrgentBroadcastBanner, SystemBroadcastsGrid, CommandScreenMetricTile, CommandScreenQuickLink, DashboardStatTile } from "../SharedCommandScreenLayout";

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
        if (sessionStorage.getItem('dismissedAlertId') !== urgentData[0].id) {
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
    fetchStats();
  }, [activeWorkspaceId]);

  const getDefconColor = (level: number) => {
    if (level === 5) return "border-green-500/30 text-green-500 hover:border-green-500 bg-green-500/10 hover:bg-green-500/20";
    if (level === 4) return "border-blue-500/30 text-blue-500 hover:border-blue-500 bg-blue-500/10 hover:bg-blue-500/20";
    if (level === 3) return "border-yellow-500/30 text-yellow-500 hover:border-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20";
    if (level === 2) return "border-orange-500/30 text-orange-500 hover:border-orange-500 bg-orange-500/10 hover:bg-orange-500/20";
    return "border-red-500/30 text-red-500 hover:border-red-500 bg-red-500/10 hover:bg-red-500/20";
  };

  const getNetworkColor = (status: string, latency: number | null) => {
    if (status !== 'ONLINE') return "border-red-500/30 text-red-500 hover:border-red-500 bg-red-500/10 hover:bg-red-500/20";
    if (latency && latency > 500) return "border-orange-500/30 text-orange-500 hover:border-orange-500 bg-orange-500/10 hover:bg-orange-500/20";
    if (latency && latency > 150) return "border-yellow-500/30 text-yellow-500 hover:border-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20";
    return "border-green-500/30 text-green-500 hover:border-green-500 bg-green-500/10 hover:bg-green-500/20";
  };

  const getNetworkIcon = (status: string, latency: number | null) => {
    if (status !== 'ONLINE') return t("icon_wifi_off");
    if (latency && latency > 500) return t("icon_network_wifi_1_bar");
    if (latency && latency > 150) return t("icon_network_wifi_2_bar");
    if (latency && latency > 50) return t("icon_network_wifi_3_bar");
    return t("icon_wifi");
  };

  return (
    <CommandScreenLayout>
      <CommandScreenStats>
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_warning_amber")}</span>} number={defconLevel} label={t("defcon_global")} colorClass={getDefconColor(defconLevel)} onClick={() => setDefconOpen(true)} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_dns")}</span>} number={stats.networkLatency ? `${stats.networkLatency}` : "---"} label={stats.networkStatus === "ONLINE" ? (t("wf_stat_server_nominal")) : (t("wf_stat_server_degraded"))} colorClass={stats.networkStatus === "ONLINE" ? "border-emerald-500/30 text-emerald-500 hover:border-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20" : "border-yellow-500/30 text-yellow-500 hover:border-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20"} onClick={() => setHealthOpen(true)} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_local_activity")}</span>} number={stats.supportQueue} label={t("ql_support")} colorClass="border-purple-500/30 text-purple-500 hover:border-purple-500 bg-purple-500/10 hover:bg-purple-500/20" onClick={() => setTab("sanctuary_tickets")} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_flag")}</span>} number={stats.flaggedQueue} label={t("wf_stat_flagged")} colorClass="border-orange-500/30 text-orange-500 hover:border-orange-500 bg-orange-500/10 hover:bg-orange-500/20" onClick={() => { if (setComplianceFilter) setComplianceFilter('flagged'); setTab("compliance"); }} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_threat_intelligence")}</span>} number={stats.oversightQueueNew} label={t("stat_malware_logs")} colorClass="border-red-500/30 text-red-500 hover:border-red-500 bg-red-500/10 hover:bg-red-500/20" onClick={() => setTab("oversight_reports")} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_coronavirus")}</span>} number={stats.quarantined} label={t("wf_stat_quarantined")} colorClass="border-red-500/30 text-red-500 hover:border-red-500 bg-red-500/10 hover:bg-red-500/20" onClick={() => { if (setComplianceFilter) setComplianceFilter('pending'); setTab("malware_oversight"); }} />
      </CommandScreenStats>

      {stats.urgentBroadcast && localStorage.getItem("sanctuary_notify_alert_banner") !== "false" && (
        <div onClick={() => setViewingPost({ ...stats.urgentBroadcast, content: stats.urgentBroadcast.message || stats.urgentBroadcast.content, mason_id: 'system', views: 0, likes: 0, replies: 0 })} className="w-full theme-glass-panel border border-[var(--danger)]/30 bg-[var(--danger)]/10 rounded-[var(--radius)] p-6 flex flex-col md:flex-row items-center gap-6 shadow-[0_0_40px_rgba(239,68,68,0.1)] cursor-pointer hover:bg-[var(--danger)]/20 transition-all group overflow-hidden relative backdrop-blur-md">
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--danger)]/5 to-transparent z-0 pointer-events-none" />
          <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--danger)]/10 blur-[50px] rounded-full pointer-events-none" />
          <div className="w-16 h-16 rounded-[var(--radius)] bg-[var(--danger)]/10 border border-[var(--danger)]/30 flex items-center justify-center shrink-0 z-10 group-hover:scale-110 transition-transform shadow-inner">
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
          <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] mb-6 shrink-0">{t("wf_comms_title")}</h2>
          <div className="flex flex-col gap-8 w-full mb-8">
            <SystemBroadcastsGrid broadcasts={broadcasts} setViewingPost={setViewingPost} />
          </div>

          <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] mt-4 mb-2 shrink-0">{t("metrics")}</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 w-full">
            <CommandScreenMetricTile value={stats.citizens} label={t("stat_users")} valueColorClass="theme-text-accent" hoverBorderClass="hover:border-[var(--accent)]/30" />
            <CommandScreenMetricTile value={stats.masons} label={t("tab_linker")} valueColorClass="theme-text-accent" hoverBorderClass="hover:border-[var(--accent)]/30" />
            <CommandScreenMetricTile value={stats.architects} label={t("stat_architects")} valueColorClass="text-purple-400" hoverBorderClass="hover:border-purple-500/30" />
            <CommandScreenMetricTile value={stats.oversights} label={t("hub_stat_oversights")} valueColorClass="text-indigo-400" hoverBorderClass="hover:border-indigo-500/30" />
            <CommandScreenMetricTile value={stats.oversightQueue} label={t("tab_malware_logs")} valueColorClass="text-red-500" hoverBorderClass="hover:border-red-500/30" />
          </div>
        </CommandScreenMain>

        <CommandScreenSidebar title={t("wf_quick_links")}>
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

          <CommandScreenQuickLink onClick={() => setTab("sanctuary_tickets")} icon={t("icon_local_activity")} title={t("ql_support")} subtitle={t("wf_link_tickets_sub")} iconBorderHoverClass="group-hover:border-[var(--accent)]/30" iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" textColorClass="text-purple-400" hoverTextColorClass="group-hover:text-purple-300" dotColorClass="bg-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.8)]" />

          <CommandScreenQuickLink onClick={() => setIsKeeperSupportOpen(true)} icon={t("icon_admin_panel_settings") || "admin_panel_settings"} title={t("wf_keeper_support_title") || "Contact Keepers"} subtitle={t("wf_keeper_support_subtitle") || "Direct Line to Core OS Developers"} iconBorderHoverClass="group-hover:border-[var(--accent)]/30" iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" textColorClass="text-teal-400" hoverTextColorClass="group-hover:text-teal-300" dotColorClass="bg-teal-400 shadow-[0_0_8px_rgba(45,212,191,0.8)]" />

          <CommandScreenQuickLink onClick={() => setTab("support_settings")} icon={t("icon_support_agent")} title={t("tab_support")} subtitle={t("wf_link_support_sub")} iconBorderHoverClass="group-hover:border-[var(--accent)]/30" iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" textColorClass="text-amber-400" hoverTextColorClass="group-hover:text-amber-300" dotColorClass="bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />

          <CommandScreenQuickLink onClick={() => setTab("audit_logs")} icon={t("icon_history")} title={t("audit_title")} subtitle={t("link_audit_sub")} iconBorderHoverClass="group-hover:border-[var(--accent)]/30" iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" textColorClass="text-blue-400" hoverTextColorClass="group-hover:text-blue-300" dotColorClass="bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]" />

          {!stats.urgentBroadcast && (
            <CommandScreenQuickLink onClick={() => setIsAlertsOpen(true)} icon="warning_off" title={t("title_sanctuary_alerts") || "Sanctuary Alerts"} subtitle={t("alert_empty") || "SYSTEM BROADCASTS"} iconBorderHoverClass="group-hover:border-amber-500/30" iconShadowClass="drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]" textColorClass="text-amber-500/80" hoverTextColorClass="group-hover:text-amber-400" dotColorClass="bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
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
