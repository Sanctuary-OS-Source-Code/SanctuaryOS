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
      if (finalUrgent && String(finalUrgent.id) === dismissedAlertId) {
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
        <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_dns")}</span>} number={stats.networkLatency ? `${stats.networkLatency}` : "---"} label={stats.networkStatus === "ONLINE" ? "CORE OS NOMINAL" : "CORE OS DEGRADED"} colorClass={stats.networkStatus === "ONLINE" ? "border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-emerald-500 hover:border-emerald-500 bg-[color-mix(in_srgb,var(--success)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)]" : "border-[color-mix(in_srgb,var(--warning)_30%,transparent)] text-yellow-500 hover:border-yellow-500 bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--warning)_20%,transparent)]"} onClick={() => setHealthOpen(true)} />
        <DashboardStatTile icon={<span className="material-symbols-outlined ">view_quilt</span>} number={stats.activeGames} label="Active Workspaces" colorClass="text-emerald-500" onClick={() => setTab("active_games")} />

        <DashboardStatTile icon={<span className="material-symbols-outlined ">local_activity</span>} number={stats.tickets} label="Support Queue" colorClass="text-purple-500" onClick={() => setTab("support")} />
        <DashboardStatTile icon={<span className="material-symbols-outlined ">campaign</span>} number={stats.activeBroadcasts} label="Active Broadcasts" colorClass="text-amber-500" onClick={() => setIsAlertsOpen(true)} />


        <DashboardStatTile icon={<span className="material-symbols-outlined ">group</span>} number={stats.citizens} label="Citizen Oversight" colorClass="text-blue-500" onClick={() => setTab("identities")} />
      </CommandScreenStats>

      <UrgentBroadcastBanner urgentBroadcast={stats.urgentBroadcast} setViewingPost={setViewingPost} setUrgentBroadcast={(b: any) => setStats({ ...stats, urgentBroadcast: b })} />

      <CommandScreenBody>
        <CommandScreenMain>
          <CommandScreenSectionHeading title={t("wf_comms_title")} icon="history" />
          <div className="flex flex-col gap-8 w-full mb-8">
            <SystemBroadcastsGrid broadcasts={broadcasts} setViewingPost={setViewingPost} />
          </div>
        </CommandScreenMain>

        <CommandScreenSidebar title="KEEPER QUICK LINKS" icon="rocket_launch">
          {stats.urgentBroadcast && (
            <CommandScreenQuickLink 
              icon="priority_high"
              title={t("title_sanctuary_alerts")}
              subtitle={t("urgent_alert_active")}
              onClick={() => setIsAlertsOpen(true)}
              isAlert={true}
            />
          )}

          <CommandScreenQuickLink icon="dns" title="Active Workspaces" subtitle="Manage Game Servers" onClick={() => setTab("active_games")} textColorClass="text-emerald-400" hoverTextColorClass="group-hover:text-emerald-300" dotColorClass="bg-emerald-400" />
          <CommandScreenQuickLink icon="group" title="Citizen Oversight" subtitle="Manage Identities" onClick={() => setTab("identities")} textColorClass="text-blue-400" hoverTextColorClass="group-hover:text-blue-300" dotColorClass="bg-blue-400" />
          <CommandScreenQuickLink icon="local_activity" title="Support Tickets" subtitle="View Support Queue" onClick={() => setTab("support")} textColorClass="text-purple-400" hoverTextColorClass="group-hover:text-purple-300" dotColorClass="bg-purple-400" />
          <CommandScreenQuickLink onClick={() => setTab("audit_logs")} icon={t("icon_history")} title={t("audit_title")} subtitle={t("ql_system_history")} iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]" iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" textColorClass="text-indigo-400" hoverTextColorClass="group-hover:text-indigo-300" dotColorClass="bg-indigo-400 shadow-md" />

          {!stats.urgentBroadcast && (
            <CommandScreenQuickLink onClick={() => setIsAlertsOpen(true)} icon="warning_off" title={t("title_sanctuary_alerts")} subtitle={t("alert_empty")} iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--warning)_30%,transparent)]" iconShadowClass="drop-shadow-md" textColorClass="text-[color-mix(in_srgb,var(--warning)_80%,transparent)]" hoverTextColorClass="group-hover:text-amber-400" dotColorClass="bg-amber-500 shadow-md" />
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
