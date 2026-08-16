import React, { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import { useLexicon } from "../../LexiconContext";
import { useStore } from "../../store";
import { SanctuaryAlertsSidePanel } from '../../side-panels/SanctuaryAlertsSidePanel';
import { CommandScreenLayout, UrgentBroadcastBanner, CommandScreenBody, CommandScreenSidebar, CommandScreenStats, CommandScreenMain, CommandScreenMetricTile, CommandScreenQuickLink, DashboardStatTile, AlertStatTile, SystemBroadcastsGrid, CommandScreenSectionHeading } from "../SharedCommandScreenLayout";

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

      if (data) {
        const gameName = useStore.getState().activeGameSchema?.display_name || useStore.getState().activeGameSchema?.name || "Sanctuary";
        setBroadcasts(data.map((p: any) => ({
          ...p,
          masons: { name: `${gameName} Team` }
        })));
      }
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
        if (sessionStorage.getItem('dismissedAlertId') !== String(urgentData[0].id)) {
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
    if (level === 5) return "border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-green-500 hover:border-green-500 bg-[color-mix(in_srgb,var(--success)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)]";
    if (level === 4) return "border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-blue-500 hover:border-blue-500 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]";
    if (level === 3) return "border-[color-mix(in_srgb,var(--warning)_30%,transparent)] text-yellow-500 hover:border-yellow-500 bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--warning)_20%,transparent)]";
    if (level === 2) return "border-[color-mix(in_srgb,var(--warning)_30%,transparent)] text-orange-500 hover:border-orange-500 bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--warning)_20%,transparent)]";
    return "border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-red-500 hover:border-red-500 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)]";
  };

  return (
    <CommandScreenLayout>
      <CommandScreenStats gridClassOverride={stats.urgentBroadcast ? "grid-cols-2 lg:grid-cols-4" : undefined}>
        {stats.urgentBroadcast && (
          <AlertStatTile className="col-span-2" number={stats.urgentBroadcast ? 1 : 0} active={!!stats.urgentBroadcast} onClick={() => setIsAlertsOpen(true)} />
        )}
        <DashboardStatTile className={stats.urgentBroadcast ? "col-span-2" : ""} icon={<span className="material-symbols-outlined ">{t("icon_warning_amber")}</span>} number={defconLevel} label={t("defcon_global")} colorClass={getDefconColor(defconLevel)} onClick={onOpenDefcon} />
        <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_18_up_rating")}</span>} number={stats.nsfw + stats.explicit} label={`${t("stat_nsfw_flags")} / ${t("stat_explicit_flags")}`} colorClass="text-orange-500" onClick={() => { setComplianceFilter('nsfw'); setTab("compliance"); }} />
        <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_local_activity")}</span>} number={stats.tickets} label={t("stat_support_tickets")} colorClass="text-purple-500" onClick={() => setTab("sanctuary_tickets")} />
        <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_coronavirus")}</span>} number={stats.malware} label={t("wf_stat_quarantined")} colorClass="text-red-500" onClick={() => { setComplianceFilter('pending'); setTab("malware_oversight"); }} />
        <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_threat_intelligence")}</span>} number={stats.oversightQueueNew} label={t("stat_malware_logs")} colorClass="text-red-500" onClick={() => setTab("oversight_reports")} />
      </CommandScreenStats>


      <CommandScreenBody>
        <CommandScreenMain>
          <CommandScreenSectionHeading title={t("wf_comms_title")} icon="history" />
          <div className="w-full mb-8">
            <SystemBroadcastsGrid broadcasts={broadcasts} setViewingPost={setViewingPost} />
          </div>
          <CommandScreenSectionHeading title={t("metrics")} icon="monitoring" />
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <CommandScreenMetricTile value={stats.citizens + stats.masons} label={t("stat_users")} valueColorClass="theme-text-accent" hoverBorderClass="hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]" />
            <CommandScreenMetricTile value={stats.masons} label={t("tab_linker")} valueColorClass="theme-text-accent" hoverBorderClass="hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]" />
            <CommandScreenMetricTile value={stats.architects} label={t("stat_architects")} valueColorClass="text-purple-400" hoverBorderClass="hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]" />
            <CommandScreenMetricTile value={stats.blacklists} label={t("stat_blacklists")} valueColorClass="text-red-500" hoverBorderClass="hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)]" />
            <CommandScreenMetricTile value={stats.oversightQueue} label={t("tab_malware_logs")} valueColorClass="text-red-700" hoverBorderClass="hover:border-[color-mix(in_srgb,var(--success)_30%,transparent)]" />
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

          <CommandScreenQuickLink onClick={() => setTab("mass_update")} icon={t("icon_dynamic_feed")} title={t("ql_mass_update")} subtitle={t("ql_bulk_actions")} iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]" iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" textColorClass="text-rose-400" hoverTextColorClass="group-hover:text-rose-300" dotColorClass="bg-rose-400 shadow-md" />

          <CommandScreenQuickLink onClick={() => setTab("game_versions")} icon={t("icon_settings")} title={t("ql_game_versions")} subtitle={t("ql_registry_config")} iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]" iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" textColorClass="text-emerald-400" hoverTextColorClass="group-hover:emerald-300" dotColorClass="bg-emerald-400 shadow-md" />

          <CommandScreenQuickLink onClick={() => setTab("audit_logs")} icon={t("icon_history")} title={t("audit_title")} subtitle={t("ql_system_history")} iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]" iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" textColorClass="text-indigo-400" hoverTextColorClass="group-hover:text-indigo-300" dotColorClass="bg-indigo-400 shadow-md" />

          {!stats.urgentBroadcast && (
            <CommandScreenQuickLink onClick={() => setIsAlertsOpen(true)} icon="warning_off" title={t("title_sanctuary_alerts")} subtitle={t("alert_empty")} iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--warning)_30%,transparent)]" iconShadowClass="drop-shadow-md" textColorClass="text-[color-mix(in_srgb,var(--warning)_80%,transparent)]" hoverTextColorClass="group-hover:text-amber-400" dotColorClass="bg-amber-500 shadow-md" />
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
