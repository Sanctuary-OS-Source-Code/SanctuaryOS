import React, { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { extractPostImage, stripMarkdown } from "../shared";
import { SanctuaryAlertsSidePanel } from '../side-panels/SanctuaryAlertsSidePanel';
import { WayfinderPostsEditor } from "./WayfinderPostsEditor";
import { ServerHealthSidePanel } from '../side-panels/WayfinderSidePanels';
import { DefconSidePanel } from "./SADefcon";
import MasonPostViewer from "../side-panels/MasonPostViewer";
import { CommandScreenLayout, CommandScreenBody, CommandScreenSidebar, CommandScreenStats, CommandScreenMain, UrgentBroadcastBanner, SystemBroadcastsGrid, CommandScreenMetricTile, CommandScreenQuickLink } from "./SharedCommandScreenLayout";

function DashboardStatTile({ icon, number, label, colorClass, onClick, setStatus }: any) {
  return (
    <div onClick={onClick} className={`flex-1 flex flex-col justify-center items-start gap-1 p-6 rounded-[var(--radius)] border border-white/10 backdrop-blur-[3px] ${colorClass} transition-all cursor-pointer shadow-lg relative overflow-hidden group hover:-translate-y-1 hover:shadow-xl`}>
      <div className="absolute inset-0 bg-current opacity-0 group-hover:opacity-[0.15] transition-opacity duration-300" />
      <div className="flex items-center gap-3 w-full relative z-10">
        <span className="text-3xl opacity-50 grayscale group-hover:opacity-100 group-hover:grayscale-0 group-hover:scale-110 transition-all drop-shadow-md">{icon}</span>
        <span className={`text-4xl lg:text-5xl font-black drop-shadow-lg tracking-tighter`}>{number}</span>
      </div>
      <span className="text-[9px] uppercase tracking-[0.2em] font-bold text-[var(--subtext)] opacity-60 mt-2">{label}</span>
    </div>
  );
}

function MasonCommandScreen({ onNavigate, masonId, session, onOpenRecentReplies, onOpenSupportDesk, setViewingPost }: any) {
  const { t } = useLexicon();
  const [repliesCount, setRepliesCount] = useState(0);
  const [stats, setStats] = useState({ artifacts: 0, collections: 0, posts: 0, bugs: 0, support: 0, followers: 0 });
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
        followers: fc || 0
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
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_edit_document")}</span>} number={stats.posts} label={t("tab_posts")} colorClass="border-emerald-500/30 text-emerald-500 hover:border-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20" onClick={() => onNavigate("posts")} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_bug_report")}</span>} number={stats.bugs} label={t("stat_bugs")} colorClass="border-rose-500/30 text-rose-500 hover:border-rose-500 bg-rose-500/10 hover:bg-rose-500/20" onClick={() => onNavigate("bug_reports")} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_forum")}</span>} number={repliesCount} label={t("ui.replies")} colorClass="border-indigo-500/30 text-indigo-500 hover:border-indigo-500 bg-indigo-500/10 hover:bg-indigo-500/20" onClick={onOpenRecentReplies} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_local_activity")}</span>} number={stats.support} label={t("wf_tab_tickets")} colorClass="border-pink-500/30 text-pink-500 hover:border-pink-500 bg-pink-500/10 hover:bg-pink-500/20" onClick={onOpenSupportDesk} />
      </CommandScreenStats>

      <UrgentBroadcastBanner urgentBroadcast={urgentBroadcast} setViewingPost={setViewingPost} setUrgentBroadcast={setUrgentBroadcast} />

      <CommandScreenBody>
        <CommandScreenMain>
          <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] mb-6 shrink-0">{t("wf_comms_title")}</h2>

          <SystemBroadcastsGrid broadcasts={broadcasts} setViewingPost={setViewingPost} />

          <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] mt-4 mb-2 shrink-0">{t("metrics")}</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 w-full">
            <CommandScreenMetricTile value={t("auto_7")} label={t("items")} valueColorClass="text-orange-500" hoverBorderClass="hover:border-orange-500/30" />
            <CommandScreenMetricTile value={t("auto_1")} label={t("playsets_title")} valueColorClass="text-blue-500" hoverBorderClass="hover:border-blue-500/30" />
            <CommandScreenMetricTile value={t("auto_1")} label={t("stat_lexicons")} valueColorClass="text-indigo-500" hoverBorderClass="hover:border-indigo-500/30" />
            <CommandScreenMetricTile value={t("auto_1")} label={t("tab_chameleons")} valueColorClass="text-pink-500" hoverBorderClass="hover:border-pink-500/30" />
            <CommandScreenMetricTile value={stats.followers} label={t("followers")} valueColorClass="text-emerald-500" hoverBorderClass="hover:border-emerald-500/30" />
          </div>
        </CommandScreenMain>

        <CommandScreenSidebar title={t("wf_quick_links")}>
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

function ArchitectCommandScreen({ onNavigate, setViewingPost, setStatus }: any) {
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
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_18_up_rating")}</span>} number={stats.nsfw} label={t("stat_nsfw_flags")} colorClass="border-orange-500/30 text-orange-500 hover:border-orange-500 bg-orange-500/10 hover:bg-orange-500/20" onClick={() => onNavigate('registry', 'nsfw')} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_block")}</span>} number={stats.explicit} label={t("stat_explicit_reports")} colorClass="border-red-500/30 text-red-500 hover:border-red-500 bg-red-500/10 hover:bg-red-500/20" onClick={() => onNavigate('registry', 'explicit')} />
      </CommandScreenStats>

      <UrgentBroadcastBanner urgentBroadcast={urgentBroadcast} setViewingPost={setViewingPost} setUrgentBroadcast={setUrgentBroadcast} />

      <CommandScreenBody>
        <CommandScreenMain>
          <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] mb-6 shrink-0">{t("wf_comms_title")}</h2>

          <div className="flex flex-col gap-8 w-full">
            <SystemBroadcastsGrid broadcasts={broadcasts} setViewingPost={setViewingPost} />

            <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] mt-4 mb-2 shrink-0">{t("metrics")}</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 w-full">
              <CommandScreenMetricTile value={stats.totalArtifacts} label={t("items")} valueColorClass="text-orange-500" hoverBorderClass="hover:border-orange-500/30" />
              <CommandScreenMetricTile value={stats.unverifiedMods} label={t("unverified")} valueColorClass="text-blue-500" hoverBorderClass="hover:border-blue-500/30" />
              <CommandScreenMetricTile value={stats.tier4Conflicts} label={t("stat_tier4")} valueColorClass="text-red-500" hoverBorderClass="hover:border-red-500/30" />
              <CommandScreenMetricTile value={stats.tier3Conflicts} label={t("stat_tier3")} valueColorClass="text-orange-500" hoverBorderClass="hover:border-orange-500/30" />
              <CommandScreenMetricTile value={stats.labQueue} label={t("stat_lab_queue")} valueColorClass="text-blue-500" hoverBorderClass="hover:border-blue-500/30" />
            </div>
          </div>
        </CommandScreenMain>

        <CommandScreenSidebar title={t("wf_quick_links")}>
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

function OversightCommandScreen({ setTab, onOpenDefcon, setComplianceFilter, setViewingPost }: any) {
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
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_18_up_rating")}</span>} number={stats.nsfw} label={t("stat_nsfw_flags")} colorClass="border-orange-500/30 text-orange-500 hover:border-orange-500 bg-orange-500/10 hover:bg-orange-500/20" onClick={() => { setComplianceFilter('nsfw'); setTab("compliance"); }} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_block")}</span>} number={stats.explicit} label={t("stat_explicit_flags")} colorClass="border-red-500/30 text-red-500 hover:border-red-500 bg-red-500/10 hover:bg-red-500/20" onClick={() => { setComplianceFilter('explicit'); setTab("compliance"); }} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_coronavirus")}</span>} number={stats.malware} label={t("wf_stat_quarantined")} colorClass="border-red-500/30 text-red-500 hover:border-red-500 bg-red-500/10 hover:bg-red-500/20" onClick={() => { setComplianceFilter('pending'); setTab("malware_oversight"); }} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_threat_intelligence")}</span>} number={stats.oversightQueueNew} label={t("stat_malware_logs")} colorClass="border-red-500/30 text-red-500 hover:border-red-500 bg-red-500/10 hover:bg-red-500/20" onClick={() => setTab("oversight_reports")} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("icon_local_activity")}</span>} number={stats.tickets} label={t("stat_support_tickets")} colorClass="border-purple-500/30 text-purple-500 hover:border-purple-500 bg-purple-500/10 hover:bg-purple-500/20" onClick={() => setTab("sanctuary_tickets")} />
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

          <div className="flex flex-col gap-8 w-full">
            <SystemBroadcastsGrid broadcasts={broadcasts} setViewingPost={setViewingPost} />

            <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] mt-4 mb-2 shrink-0">{t("metrics")}</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 w-full">
              <CommandScreenMetricTile value={stats.citizens + stats.masons} label={t("stat_users")} valueColorClass="theme-text-accent" hoverBorderClass="hover:border-[var(--accent)]/30" />
              <CommandScreenMetricTile value={stats.masons} label={t("tab_linker")} valueColorClass="theme-text-accent" hoverBorderClass="hover:border-[var(--accent)]/30" />
              <CommandScreenMetricTile value={stats.architects} label={t("stat_architects")} valueColorClass="text-purple-400" hoverBorderClass="hover:border-purple-500/30" />
              <CommandScreenMetricTile value={stats.blacklists} label={t("stat_blacklists")} valueColorClass="text-red-500" hoverBorderClass="hover:border-red-500/30" />
              <CommandScreenMetricTile value={stats.oversightQueue} label={t("tab_malware_logs")} valueColorClass="text-red-700" hoverBorderClass="hover:border-emerald-500/30" />
            </div>
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

function WayfinderCommandScreen({ setTab, setComplianceFilter, onOpenMasonProfile }: any) {
  const { t } = useLexicon();
  const { session, defconLevel } = useStore();
  const [defconOpen, setDefconOpen] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [viewingPost, setViewingPost] = useState<any>(null);
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

      const { data: broadcastsData } = await supabase.from('system_broadcasts')
        .select('*')
        .or('target_audience.ilike.%All%,target_audience.eq.Wayfinders,target_audience.ilike."Wayfinders,%",target_audience.ilike."%,Wayfinders,%",target_audience.ilike."%,Wayfinders"')
        .in('category', ['Update', 'Info', 'Event'])
        .order('created_at', { ascending: false })
        .limit(3);
      if (broadcastsData) setBroadcasts(broadcastsData);

      const { data: urgentData } = await supabase.from('system_broadcasts')
        .select('*')
        .eq('is_active', true)
        .in('is_pinned', ["true", "True", true])
        .or('target_audience.ilike.%All%,target_audience.eq.Wayfinders,target_audience.ilike."Wayfinders,%",target_audience.ilike."%,Wayfinders,%",target_audience.ilike."%,Wayfinders"')
        .order('created_at', { ascending: false })
        .limit(1);

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
  }, []);

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
        audience="Wayfinders"
      />
      {viewingPost && (
        <MasonPostViewer
          post={viewingPost}
          onClose={() => setViewingPost(null)}
          userId={session?.user?.id || 'wayfinder'}
          onOpenMasonProfile={onOpenMasonProfile}
        />
      )}
    </CommandScreenLayout>
  );
}

export { MasonCommandScreen, ArchitectCommandScreen, OversightCommandScreen, WayfinderCommandScreen };
