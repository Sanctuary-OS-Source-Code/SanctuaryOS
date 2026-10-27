import { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import { useLexicon } from "../../LexiconContext";
import { useStore } from "../../store";
import { SanctuaryAlertsSidePanel } from '../../side-panels/SanctuaryAlertsSidePanel';
import { ServerHealthSidePanel, KeeperReleasePipelineSidePanel } from '../../side-panels/WayfinderSidePanels';
import MasonPostViewer from "../../side-panels/MasonPostViewer";
import { CommandScreenLayout, CommandScreenBody, CommandScreenSidebar, CommandScreenStats, CommandScreenMain, CommandScreenQuickLink, DashboardStatTile, CommandScreenSectionHeading, CommandScreenMetricTile } from "../SharedCommandScreenLayout";
import { UniversalCard } from "../../components/universal/UniversalCard";
import { ReleaseNotesShowcase } from "../../components/ReleaseNotesShowcase";

const VAULT_CHIP_CLASS = "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

export function KeeperCommandScreen({ setTab, onOpenMasonProfile }: any) {
  const { t } = useLexicon();
  const { session } = useStore();
  const [healthOpen, setHealthOpen] = useState(false);
  const [isPipelineOpen, setIsPipelineOpen] = useState(false);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [, setBroadcasts] = useState<any[]>([]);
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
    coreHeuristics: 0,
    networkLatency: 0 as number | null,
    networkStatus: "ONLINE",
    urgentBroadcast: null as any
  });

  const [recentSupport, setRecentSupport] = useState<any[]>([]);

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

      const { count: gamesCount } = await supabase.from('sanctuary_games').select('id', { count: 'exact', head: true });
      const { count: ticketsCount } = await supabase.from('keeper_tickets').select('*', { count: 'exact', head: true }).in('status', ['open', 'in_progress']);

      const { count: themesCount } = await supabase.from('sanctuary_themes').select('*', { count: 'exact', head: true });
      const { count: lexiconsCount } = await supabase.from('sanctuary_lexicons').select('*', { count: 'exact', head: true });
      const { count: broadcastsCount } = await supabase.from('keeper_system_broadcasts').select('*', { count: 'exact', head: true }).eq('is_active', true);
      const { count: heuristicsCount } = await supabase.from('keeper_heuristic_signatures').select('*', { count: 'exact', head: true }).eq('enabled', true);

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
        coreHeuristics: heuristicsCount || 0,
        networkLatency: latency,
        networkStatus: latency > 5000 ? "DEGRADED" : "ONLINE",
        urgentBroadcast: finalUrgent
      });
    };

    const fetchRecentItems = async () => {
        const { data } = await supabase.from('keeper_tickets').select('*').in('status', ['open', 'in_progress']).order('created_at', { ascending: false }).limit(6);
        if (data) setRecentSupport(data);
    };

    fetchBroadcasts();
    fetchStats();
    fetchRecentItems();
  }, []);

  return (
    <CommandScreenLayout>
      <CommandScreenStats>
        <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_dns", "dns")}</span>} number={stats.networkLatency ? `${stats.networkLatency}` : "---"} label={stats.networkStatus === "ONLINE" ? t("wf_stat_server_nominal", "Nominal") : t("wf_stat_server_degraded", "Degraded")} colorClass={stats.networkStatus === "ONLINE" ? "border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-emerald-500 hover:border-emerald-500 bg-[color-mix(in_srgb,var(--success)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)]" : "border-[color-mix(in_srgb,var(--warning)_30%,transparent)] text-yellow-500 hover:border-yellow-500 bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--warning)_20%,transparent)]"} onClick={() => setHealthOpen(true)} />
        <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_view_quilt", "view_quilt")}</span>} number={stats.activeGames} label={t("keepers_tab_partner_spokes", "Partner Spokes")} colorClass="text-emerald-500" onClick={() => setTab("active_games")} />

        <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_shield_lock", "shield_lock")}</span>} number={stats.coreHeuristics} label={t("core_heuristics_tab", "Core Heuristics")} colorClass="text-red-500" onClick={() => setTab("heuristics")} />
        <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_local_activity", "local_activity")}</span>} number={stats.tickets} label={t("ql_support", "Support Queue")} colorClass="text-purple-500" onClick={() => setTab("support")} />

        <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_group", "group")}</span>} number={stats.citizens} label={t("citizen_oversight", "{Citizen} Management")} colorClass="text-blue-500" onClick={() => setTab("identities")} />
      </CommandScreenStats>


      <CommandScreenBody>
        <CommandScreenMain>
          <div className="flex flex-col gap-4 w-full">
            <CommandScreenSectionHeading title={t("release_notes_section_title", "Current Build Release Notes")} icon={t("icon_new_releases", "new_releases")} />
            <div className="flex flex-col gap-6 w-full">
              <ReleaseNotesShowcase isKeepers={true} />
            </div>
          </div>

          {recentSupport.length > 0 && (
            <div className="flex flex-col gap-4 w-full">
              <CommandScreenSectionHeading title={t("ql_support", "Support Queue")} icon={t("icon_local_activity", "local_activity")} />
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
                  {recentSupport.map((item: any) => (
                      <UniversalCard 
                          key={`support-${item.id}`} 
                          layout="vertical" 
                          title={item.subject || t("support_tickets", "Support Tickets")} 
                          icon={t("icon_local_activity", "local_activity")} 
                          onClick={() => setTab("support")}
                          className="w-full"
                          imageOverlay={
                              <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
                                  <div className={VAULT_CHIP_CLASS}>
                                      <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">{t("icon_pending_actions", "pending_actions")}</span>
                                      <span>{t("status_open", "Open")}</span>
                                  </div>
                              </div>
                          }
                          badges={
                              <div className={VAULT_CHIP_CLASS}>
                                  <span className="material-symbols-outlined !text-[12px] text-[var(--info)]">{t("icon_local_activity", "local_activity")}</span>
                                  <span>{t("wf_tab_tickets", "Support Queue")}</span>
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
                              {item.description || t("status_open", "Open")}
                          </p>
                      </UniversalCard>
                  ))}
              </div>
            </div>
          )}
        </CommandScreenMain>

        <CommandScreenSidebar title={t("wf_quick_links", "Quick Links")} icon={t("icon_rocket_launch", "rocket_launch")}>
          {stats.urgentBroadcast && (
            <CommandScreenQuickLink 
              icon={t("icon_priority_high", "priority_high")}
              title={t("title_sanctuary_alerts", "Sanctuary Alerts")}
              subtitle={t("urgent_alert_active", "Urgent Alert Active")}
              onClick={() => setIsAlertsOpen(true)}
              isAlert={true}
            />
          )}

          <CommandScreenQuickLink icon={t("icon_dns", "dns")} title={t("keepers_tab_partner_spokes", "Partner Spokes")} subtitle={t("ql_registry_config", "Registry Config")} onClick={() => setTab("active_games")} textColorClass="text-emerald-400" hoverTextColorClass="group-hover:text-emerald-300" dotColorClass="bg-emerald-400" />
          <CommandScreenQuickLink icon={t("icon_rocket_launch", "rocket_launch")} title={t("keepers_pipeline_quicklink_title", "Release Pipeline & Donations")} subtitle={t("keepers_pipeline_quicklink_sub", "Manage Daily Dev Builds, Stable Stream & Keepers Donation Link")} onClick={() => setIsPipelineOpen(true)} textColorClass="text-cyan-400" hoverTextColorClass="group-hover:text-cyan-300" dotColorClass="bg-cyan-400" />
          <CommandScreenQuickLink icon={t("icon_shield_lock", "shield_lock")} title={t("core_heuristics_tab", "Core Heuristics")} subtitle={t("keepers_heuristics_subtitle", "System-wide malware definitions & heuristic signatures")} onClick={() => setTab("heuristics")} textColorClass="text-red-400" hoverTextColorClass="group-hover:text-red-300" dotColorClass="bg-red-400" />
          <CommandScreenQuickLink icon={t("icon_group", "group")} title={t("citizen_oversight", "{Citizen} Management")} subtitle={t("stat_users", "Users")} onClick={() => setTab("identities")} textColorClass="text-blue-400" hoverTextColorClass="group-hover:text-blue-300" dotColorClass="bg-blue-400" />
          <CommandScreenQuickLink icon={t("icon_local_activity", "local_activity")} title={t("support_tickets", "Support Tickets")} subtitle={t("ql_support", "Support Queue")} onClick={() => setTab("support")} textColorClass="text-purple-400" hoverTextColorClass="group-hover:text-purple-300" dotColorClass="bg-purple-400" />
          <CommandScreenQuickLink onClick={() => setTab("audit_logs")} icon={t("icon_history", "history")} title={t("audit_logs", "Audit Logs")} subtitle={t("ql_system_history", "System History")} iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]" iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" textColorClass="text-indigo-400" hoverTextColorClass="group-hover:text-indigo-300" dotColorClass="bg-indigo-400 shadow-md" />

          {!stats.urgentBroadcast && (
            <CommandScreenQuickLink onClick={() => setIsAlertsOpen(true)} icon={t("icon_warning_off", "warning_off")} title={t("title_sanctuary_alerts", "Sanctuary Alerts")} subtitle={t("alert_empty", "No Active Alerts")} iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--warning)_30%,transparent)]" iconShadowClass="drop-shadow-md" textColorClass="text-[color-mix(in_srgb,var(--warning)_80%,transparent)]" hoverTextColorClass="group-hover:text-amber-400" dotColorClass="bg-amber-500 shadow-md" />
          )}
        </CommandScreenSidebar>
      </CommandScreenBody>

      <div className="flex flex-col gap-4 w-full">
        <CommandScreenSectionHeading title={t("metrics", "Hub Metrics")} icon={t("icon_monitoring", "monitoring")} />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 w-full">
          <CommandScreenMetricTile icon={t("icon_group", "group")} value={stats.citizens} label={t("stat_users", "Users")} valueColorClass="theme-text-accent" hoverBorderClass="hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]" />
          <CommandScreenMetricTile icon={t("icon_explore", "explore")} value={stats.wayfinders} label={t("wayfinders", "Wayfinders")} valueColorClass="text-emerald-400" hoverBorderClass="hover:border-[color-mix(in_srgb,var(--success)_30%,transparent)]" />
          <CommandScreenMetricTile icon={t("icon_palette", "palette")} value={stats.activeThemes} label={t("tab_themes", "Chameleons")} valueColorClass="text-pink-400" hoverBorderClass="hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)]" />
          <CommandScreenMetricTile icon={t("icon_library_books", "library_books")} value={stats.lexicons} label={t("tab_lexicons", "Lexicons")} valueColorClass="text-indigo-400" hoverBorderClass="hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]" />
          <CommandScreenMetricTile icon={t("icon_satellite_alt", "satellite_alt")} value={stats.activeBroadcasts} label={t("wf_tab_dispatch", "Dispatch")} valueColorClass="text-amber-400" hoverBorderClass="hover:border-[color-mix(in_srgb,var(--warning)_30%,transparent)]" />
        </div>
      </div>

      <ServerHealthSidePanel isOpen={healthOpen} onClose={() => setHealthOpen(false)} stats={stats} isKeepers={true} />
      <KeeperReleasePipelineSidePanel isOpen={isPipelineOpen} onClose={() => setIsPipelineOpen(false)} />
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
