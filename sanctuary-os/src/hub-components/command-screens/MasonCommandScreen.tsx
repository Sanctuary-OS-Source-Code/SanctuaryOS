import React, { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import { useLexicon } from "../../LexiconContext";
import { SanctuaryAlertsSidePanel } from '../../side-panels/SanctuaryAlertsSidePanel';
import { CommandScreenLayout, CommandScreenBody, CommandScreenSidebar, CommandScreenStats, CommandScreenMain, UrgentBroadcastBanner, SystemBroadcastsGrid, CommandScreenMetricTile, CommandScreenQuickLink, DashboardStatTile, CommandScreenSectionHeading } from "../SharedCommandScreenLayout";

export function MasonCommandScreen({ onNavigate, masonId, session, onOpenRecentReplies, onOpenSupportDesk, setViewingPost }: any) {
  const { t } = useLexicon();
  const [repliesCount, setRepliesCount] = useState(0);
  const [stats, setStats] = useState({ artifacts: 0, collections: 0, posts: 0, bugs: 0, support: 0, followers: 0, blueprints: 0 });
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [urgentBroadcast, setUrgentBroadcast] = useState<any>(null);

  useEffect(() => {
    const fetchCounts = async () => {
      const { count: rc } = await supabase.from("mason_post_comments").select("*", { count: 'exact', head: true });
      if (rc !== null) setRepliesCount(rc);

      const { count: mc } = await supabase.from("mods").select("*", { count: 'exact', head: true }).eq('mason_id', masonId);
      const { count: bc } = await supabase.from("blueprints").select("*", { count: 'exact', head: true }).eq('mason_id', masonId);

      const { count: cc } = await supabase.from("collections").select("*", { count: 'exact', head: true }).eq('mason_id', masonId);

      const { count: pc } = await supabase.from("mason_posts").select("*", { count: 'exact', head: true }).eq('mason_id', masonId);

      const { count: fc } = await supabase.from("mason_followers").select("*", { count: 'exact', head: true }).eq('mason_id', masonId);

      let bugc = 0;
      let tc = 0;

      if (session?.user?.id) {
        const { count } = await supabase.from("sanctuary_tickets").select("*", { count: 'exact', head: true })
          .eq('author_id', session.user.id)
          .in('status', ['NEW', 'OPEN', 'PENDING', 'ESCALATED', 'INVESTIGATING', 'new', 'open', 'pending', 'escalated', 'investigating']);
        if (count !== null) tc = count;
      }

      if (masonId) {
        const { data: allTickets } = await supabase.from('sanctuary_tickets').select('*')
          .in('status', ['NEW', 'OPEN', 'PENDING', 'ESCALATED', 'INVESTIGATING', 'new', 'open', 'pending', 'escalated', 'investigating']);
        if (allTickets) {
          let filtered = allTickets.filter(t => {
            const typeStr = (t.ticket_type || t.category || '').toLowerCase();
            return (typeStr.includes('bug') || typeStr.includes('artifact')) && !typeStr.includes('os');
          });

          const { data: modsData } = await supabase.from('mods').select("id").eq('mason_id', masonId);
          let masonModIds: string[] = [];
          if (modsData) masonModIds = modsData.flatMap(m => [m.id]).filter(Boolean);

          const userId = session?.user?.id;
          filtered = filtered.filter(t => {
            const targetUser = t.metadata?.target_user_id;
            const targetMason = t.metadata?.target_mason;
            const ticketMasonId = t.metadata?.mason_id;
            const targetMod = t.target_mod_id || t.metadata?.target_mod_id;

            if (userId && (targetUser === userId || targetMason === userId || ticketMasonId === userId || t.author_id === userId)) return true;
            if (masonId && (targetUser === masonId || targetMason === masonId || ticketMasonId === masonId)) return true;
            if (targetMod && masonModIds.includes(targetMod)) return true;
            return false;
          });
          bugc = filtered.length;
        }
      }

      setStats({
        artifacts: mc || 0,
        collections: cc || 0,
        posts: pc || 0,
        bugs: bugc || 0,
        support: tc,
        followers: fc || 0,
        blueprints: bc || 0
      });
    };
    fetchCounts();
  }, [masonId, session]);

  const [broadcasts, setBroadcasts] = useState<any[]>([]);

  useEffect(() => {
    const fetchBroadcasts = async () => {
      const [bRes, uRes] = await Promise.all([
        supabase.from('system_broadcasts')
          .select('*')
          .or('target_audience.ilike.%All%,target_audience.eq.Masons,target_audience.ilike."Masons,%",target_audience.ilike."%,Masons,%",target_audience.ilike."%,Masons"')
          .in('category', ['Update', 'Info', 'Event'])
          .order('created_at', { ascending: false })
          .limit(3),
        supabase.from('system_broadcasts')
          .select('*')
          .eq('is_active', true)
          .in('is_pinned', ["true", "True", true])
          .or('target_audience.ilike.%All%,target_audience.eq.Masons,target_audience.ilike."Masons,%",target_audience.ilike."%,Masons,%",target_audience.ilike."%,Masons"')
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

  return (
    <CommandScreenLayout>
      <CommandScreenStats>
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_deployed_code")}</span>} number={stats.artifacts} label={t("items")} colorClass="border-blue-500/30 text-blue-500 hover:border-blue-500 bg-blue-500/10 hover:bg-blue-500/20" onClick={() => onNavigate("registry")} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_collections_bookmark")}</span>} number={stats.collections} label={t("tab_cc")} colorClass="border-amber-500/30 text-amber-500 hover:border-amber-500 bg-amber-500/10 hover:bg-amber-500/20" onClick={() => onNavigate("collections")} />

        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_bug_report")}</span>} number={stats.bugs} label={t("stat_bugs")} colorClass="border-rose-500/30 text-rose-500 hover:border-rose-500 bg-rose-500/10 hover:bg-rose-500/20" onClick={() => onNavigate("bug_reports")} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_forum")}</span>} number={repliesCount} label={t("ui.replies")} colorClass="border-indigo-500/30 text-indigo-500 hover:border-indigo-500 bg-indigo-500/10 hover:bg-indigo-500/20" onClick={onOpenRecentReplies} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_local_activity")}</span>} number={stats.support} label={t("wf_tab_tickets")} colorClass="border-pink-500/30 text-pink-500 hover:border-pink-500 bg-pink-500/10 hover:bg-pink-500/20" onClick={onOpenSupportDesk} />
      </CommandScreenStats>

      <UrgentBroadcastBanner urgentBroadcast={urgentBroadcast} setViewingPost={setViewingPost} setUrgentBroadcast={setUrgentBroadcast} />

      <CommandScreenBody>
        <CommandScreenMain>
          <CommandScreenSectionHeading title={t("wf_comms_title")} icon="history" />
          
          <div className="w-full mb-8">
            <SystemBroadcastsGrid broadcasts={broadcasts} setViewingPost={setViewingPost} />
          </div>

          <CommandScreenSectionHeading title={t("metrics")} icon="monitoring" />
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <CommandScreenMetricTile icon={t("icon_deployed_code") || "deployed_code"} value={stats.artifacts} label={t("artifacts")} valueColorClass="theme-text-accent" hoverBorderClass="hover:border-[var(--accent)]/30" />
            <CommandScreenMetricTile icon={t("icon_architecture") || "architecture"} value={stats.blueprints || 1} label={t("blueprints")} valueColorClass="text-emerald-400" hoverBorderClass="hover:border-emerald-500/30" />
            <CommandScreenMetricTile icon={t("icon_library_books") || "library_books"} value={1} label={t("lexicons")} valueColorClass="text-indigo-400" hoverBorderClass="hover:border-indigo-500/30" />
            <CommandScreenMetricTile icon={t("icon_palette") || "palette"} value={1} label={t("chameleons")} valueColorClass="text-pink-400" hoverBorderClass="hover:border-pink-500/30" />
            <CommandScreenMetricTile icon={t("icon_group") || "group"} value={stats.followers} label={t("followers")} valueColorClass="text-teal-400" hoverBorderClass="hover:border-teal-500/30" />
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

          <CommandScreenQuickLink onClick={() => onNavigate("protocols")} icon={t("icon_link")} title={t("pv_title")} subtitle={t("ql_global_rules")} iconBorderHoverClass="group-hover:border-[var(--accent)]/30" iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" textColorClass="text-blue-400" hoverTextColorClass="group-hover:text-blue-300" dotColorClass="bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]" />

          <CommandScreenQuickLink onClick={() => onNavigate("structure")} icon={t("icon_architecture")} title={t("structure_title")} subtitle={t("ql_asset_org")} iconBorderHoverClass="group-hover:border-[var(--accent)]/30" iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" textColorClass="text-amber-400" hoverTextColorClass="group-hover:text-amber-300" dotColorClass="bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />

          <CommandScreenQuickLink onClick={() => onNavigate("conflicts")} icon={t("icon_security")} title={t("ql_conflict")} subtitle={t("ql_logical_issues")} iconBorderHoverClass="group-hover:border-[var(--accent)]/30" iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" textColorClass="text-rose-400" hoverTextColorClass="group-hover:text-rose-300" dotColorClass="bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.8)]" />

          <CommandScreenQuickLink onClick={() => onNavigate("sandbox")} icon={t("icon_handyman")} title={t("sandbox_title")} subtitle={t("sandbox_sub")} iconBorderHoverClass="group-hover:border-[var(--accent)]/30" iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" textColorClass="text-emerald-400" hoverTextColorClass="group-hover:text-emerald-300" dotColorClass="bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          <CommandScreenQuickLink onClick={() => onNavigate("ide")} icon={t("icon_code")} title={t("tools_ide")} subtitle={t("ide_sub")} iconBorderHoverClass="group-hover:border-[var(--accent)]/30" iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" textColorClass="text-indigo-400" hoverTextColorClass="group-hover:text-indigo-300" dotColorClass="bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]" />
          {!urgentBroadcast && (
            <CommandScreenQuickLink onClick={() => setIsAlertsOpen(true)} icon="warning_off" title={t("title_sanctuary_alerts") || "Sanctuary Alerts"} subtitle={t("alert_empty") || "SYSTEM BROADCASTS"} iconBorderHoverClass="group-hover:border-amber-500/30" iconShadowClass="drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]" textColorClass="text-amber-500/80" hoverTextColorClass="group-hover:text-amber-400" dotColorClass="bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
          )}


        </CommandScreenSidebar>
      </CommandScreenBody>

      <SanctuaryAlertsSidePanel
        isOpen={isAlertsOpen}
        onClose={() => setIsAlertsOpen(false)}
        audience="Masons"
      />
    </CommandScreenLayout>
  );
}
