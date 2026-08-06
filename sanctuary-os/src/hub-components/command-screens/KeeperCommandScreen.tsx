import React, { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import { useLexicon } from "../../LexiconContext";
import { useStore } from "../../store";
import { SanctuaryAlertsSidePanel } from '../../side-panels/SanctuaryAlertsSidePanel';
import { ServerHealthSidePanel } from '../../side-panels/WayfinderSidePanels';
import MasonPostViewer from "../../side-panels/MasonPostViewer";
import { CommandScreenLayout, CommandScreenBody, CommandScreenSidebar, CommandScreenStats, CommandScreenMain, UrgentBroadcastBanner, SystemBroadcastsGrid, CommandScreenMetricTile, CommandScreenQuickLink, DashboardStatTile, CommandScreenSectionHeading } from "../SharedCommandScreenLayout";

export function KeeperCommandScreen({ setTab, onOpenMasonProfile }: any) {
  const { t } = useLexicon();
  const { session } = useStore();
  const [healthOpen, setHealthOpen] = useState(false);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [viewingPost, setViewingPost] = useState<any>(null);
  const [stats, setStats] = useState({
    activeGames: 0,
    tickets: 0,
    citizens: 0,
    architects: 0,
    wayfinders: 0,
    activeThemes: 0,
    lexicons: 0,
    activeBroadcasts: 0,
    networkLatency: 0 as number | null,
    networkStatus: "ONLINE",
    urgentBroadcast: null as any
  });

  useEffect(() => {
    const fetchBroadcasts = async () => {
      const { data } = await supabase.from('keeper_system_broadcasts')
        .select('*')
        .in('category', ['Update', 'Info', 'Event', 'System'])
        .order('created_at', { ascending: false })
        .limit(20);
      if (data) {
        const filtered = data.filter((p: any) => !p.target_audience || p.target_audience.includes("All") || p.target_audience.includes("Keeper Core")).slice(0, 4);
        setBroadcasts(filtered);
      }
    };

    const fetchStats = async () => {
      const start = Date.now();
      const { count: citizensCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
      const { count: architectsCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'architect');
      const { count: wayfindersCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'wayfinder');
      const latency = Date.now() - start;

      const { count: gamesCount } = await supabase.from('sanctuary_games').select('*', { count: 'exact', head: true });
      const { count: ticketsCount } = await supabase.from('keeper_tickets').select('*', { count: 'exact', head: true }).in('status', ['open', 'in_progress']);

      const { count: themesCount } = await supabase.from('sanctuary_themes').select('*', { count: 'exact', head: true });
      const { count: lexiconsCount } = await supabase.from('sanctuary_lexicons').select('*', { count: 'exact', head: true });
      const { count: broadcastsCount } = await supabase.from('keeper_system_broadcasts').select('*', { count: 'exact', head: true }).eq('is_active', true);

      const { data: urgentDataRaw } = await supabase.from('keeper_system_broadcasts')
        .select('*')
        .eq('is_active', true)
        .in('is_pinned', ["true", "True", true])
        .order('created_at', { ascending: false })
        .limit(10);

      let finalUrgent = null;
      if (urgentDataRaw) {
        finalUrgent = urgentDataRaw.find((p: any) => !p.target_audience || p.target_audience.includes("All") || p.target_audience.includes("Keeper Core")) || null;
      }

      const dismissedAlertId = sessionStorage.getItem('dismissedAlertId');
      if (finalUrgent && finalUrgent.id === dismissedAlertId) {
        finalUrgent = null;
      }

      setStats({
        activeGames: gamesCount || 0,
        tickets: ticketsCount || 0,
        citizens: citizensCount || 0,
        architects: architectsCount || 0,
        wayfinders: wayfindersCount || 0,
        activeThemes: themesCount || 0,
        lexicons: lexiconsCount || 0,
        activeBroadcasts: broadcastsCount || 0,
        networkLatency: latency,
        networkStatus: latency > 5000 ? "DEGRADED" : "ONLINE",
        urgentBroadcast: finalUrgent
      });
    };

    fetchBroadcasts();
    fetchStats();
  }, []);

  return (
    <CommandScreenLayout>
      <CommandScreenStats>
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_dns")}</span>} number={stats.networkLatency ? `${stats.networkLatency}` : "---"} label={stats.networkStatus === "ONLINE" ? "CORE OS NOMINAL" : "CORE OS DEGRADED"} colorClass={stats.networkStatus === "ONLINE" ? "border-emerald-500/30 text-emerald-500 hover:border-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20" : "border-yellow-500/30 text-yellow-500 hover:border-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20"} onClick={() => setHealthOpen(true)} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">view_quilt</span>} number={stats.activeGames} label="Active Workspaces" colorClass="border-emerald-500/30 text-emerald-500 hover:border-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20" onClick={() => setTab("active_games")} />

        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">local_activity</span>} number={stats.tickets} label="Support Queue" colorClass="border-purple-500/30 text-purple-500 hover:border-purple-500 bg-purple-500/10 hover:bg-purple-500/20" onClick={() => setTab("tickets")} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">campaign</span>} number={stats.activeBroadcasts} label="Active Broadcasts" colorClass="border-amber-500/30 text-amber-500 hover:border-amber-500 bg-amber-500/10 hover:bg-amber-500/20" onClick={() => setIsAlertsOpen(true)} />


        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">group</span>} number={stats.citizens} label="Citizen Oversight" colorClass="border-blue-500/30 text-blue-500 hover:border-blue-500 bg-blue-500/10 hover:bg-blue-500/20" onClick={() => setTab("identities_citizen")} />
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
              <span className="px-3 py-1 bg-[var(--danger)]/20 border border-[var(--danger)]/40 text-[var(--danger)] text-[10px] font-black uppercase tracking-widest rounded-lg shadow-inner animate-pulse flex items-center gap-1"><span className="material-symbols-outlined !text-[12px]"></span>{t("urgent_alert") || "URGENT ALERT"}</span>
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
          <CommandScreenSectionHeading title={t("wf_comms_title") || "LATEST DISPATCH"} icon="history" />
          <div className="flex flex-col gap-8 w-full mb-8">
            <SystemBroadcastsGrid broadcasts={broadcasts} setViewingPost={setViewingPost} />
          </div>
        </CommandScreenMain>

        <CommandScreenSidebar title="KEEPER QUICK LINKS" icon="rocket_launch">
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

          <CommandScreenQuickLink icon="dns" title="Active Workspaces" subtitle="Manage Game Servers" onClick={() => setTab("active_games")} textColorClass="text-emerald-400" hoverTextColorClass="group-hover:text-emerald-300" dotColorClass="bg-emerald-400" />
          <CommandScreenQuickLink icon="group" title="Citizen Oversight" subtitle="Manage Identities" onClick={() => setTab("identities")} textColorClass="text-blue-400" hoverTextColorClass="group-hover:text-blue-300" dotColorClass="bg-blue-400" />
          <CommandScreenQuickLink icon="local_activity" title="Support Tickets" subtitle="View Support Queue" onClick={() => setTab("tickets")} textColorClass="text-purple-400" hoverTextColorClass="group-hover:text-purple-300" dotColorClass="bg-purple-400" />
          <CommandScreenQuickLink onClick={() => setTab("audit_logs")} icon={t("icon_history") || "history"} title={t("audit_title") || "Audit Logs"} subtitle={t("ql_system_history") || "System History"} iconBorderHoverClass="group-hover:border-[var(--accent)]/30" iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" textColorClass="text-indigo-400" hoverTextColorClass="group-hover:text-indigo-300" dotColorClass="bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]" />

          {!stats.urgentBroadcast && (
            <CommandScreenQuickLink onClick={() => setIsAlertsOpen(true)} icon="warning_off" title={t("title_sanctuary_alerts") || "Sanctuary Alerts"} subtitle={t("alert_empty") || "SYSTEM BROADCASTS"} iconBorderHoverClass="group-hover:border-amber-500/30" iconShadowClass="drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]" textColorClass="text-amber-500/80" hoverTextColorClass="group-hover:text-amber-400" dotColorClass="bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
          )}
        </CommandScreenSidebar>
      </CommandScreenBody>

      <ServerHealthSidePanel isOpen={healthOpen} onClose={() => setHealthOpen(false)} stats={stats} />
      <SanctuaryAlertsSidePanel
        isOpen={isAlertsOpen}
        onClose={() => setIsAlertsOpen(false)}
        audience="All"
        tableName="keeper_system_broadcasts"
      />
      {viewingPost && (
        <MasonPostViewer
          post={viewingPost}
          onClose={() => setViewingPost(null)}
          userId={session?.user?.id || 'keeper'}
          onOpenMasonProfile={onOpenMasonProfile}
        />
      )}
    </CommandScreenLayout>
  );
}
