import { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import { useLexicon } from "../../LexiconContext";
import { useStore } from '../../store';
import { SanctuaryAlertsSidePanel } from '../../side-panels/SanctuaryAlertsSidePanel';
import { stripMarkdown } from "../../shared";
import { CommandScreenLayout, CommandScreenBody, CommandScreenSidebar, CommandScreenStats, CommandScreenMain, SystemBroadcastsGrid, CommandScreenMetricTile, CommandScreenQuickLink, DashboardStatTile, AlertStatTile, CommandScreenSectionHeading } from "../SharedCommandScreenLayout";
import { UniversalCard } from "../../components/universal/UniversalCard";

const VAULT_CHIP_CLASS = "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

export function MasonCommandScreen({ onNavigate, masonId, isVerifiedMason = false, session, onOpenRecentReplies, onOpenSupportDesk, setViewingPost, onOpenBugReport, onOpenMetadataEditor }: any) {
  const { t } = useLexicon();
  const [repliesCount, setRepliesCount] = useState(0);
  const [stats, setStats] = useState({ artifacts: 0, collections: 0, posts: 0, bugs: 0, support: 0, followers: 0, blueprints: 0 });
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [urgentBroadcast, setUrgentBroadcast] = useState<any>(null);
  const [recentBugs, setRecentBugs] = useState<any[]>([]);
  const [recentArtifacts, setRecentArtifacts] = useState<any[]>([]);
  const [recentReplies, setRecentReplies] = useState<any[]>([]);

  useEffect(() => {
    const fetchCounts = async () => {
      let tc = 0;
      if (session?.user?.id) {
        const { count } = await supabase.from("sanctuary_tickets").select("*", { count: 'exact', head: true })
          .eq('author_id', session.user.id)
          .in('status', ['NEW', 'OPEN', 'PENDING', 'ESCALATED', 'INVESTIGATING', 'new', 'open', 'pending', 'escalated', 'investigating']);
        if (count !== null) tc = count;
      }

      const { count: bc } = await supabase.from("blueprints").select("*", { count: 'exact', head: true }).eq('mason_id', masonId);

      if (!isVerifiedMason) {
        setStats({
          artifacts: 0,
          collections: 0,
          posts: 0,
          bugs: 0,
          support: tc,
          followers: 0,
          blueprints: bc || 0
        });
        return;
      }

      const { count: rc } = await supabase.from("mason_post_comments").select("*", { count: 'exact', head: true });
      if (rc !== null) setRepliesCount(rc);

      const { count: mc } = await supabase.from("mods").select("*", { count: 'exact', head: true }).eq('mason_id', masonId);
      const { count: cc } = await supabase.from("collections").select("*", { count: 'exact', head: true }).eq('mason_id', masonId);
      const { count: pc } = await supabase.from("mason_posts").select("*", { count: 'exact', head: true }).eq('mason_id', masonId);
      const { count: fc } = await supabase.from("mason_followers").select("*", { count: 'exact', head: true }).eq('mason_id', masonId);

      let bugc = 0;

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
  }, [masonId, session, isVerifiedMason]);

  useEffect(() => {
    const fetchRecent = async () => {
      if (!isVerifiedMason || !masonId) return;
      const { data: allTickets } = await supabase.from('sanctuary_tickets').select('*')
        .in('status', ['NEW', 'OPEN', 'PENDING', 'ESCALATED', 'INVESTIGATING', 'new', 'open', 'pending', 'escalated', 'investigating'])
        .order('created_at', { ascending: false });
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
        setRecentBugs(filtered.slice(0, 2));
      }

      const { data: artifacts } = await supabase.from('mods').select('*').eq('mason_id', masonId).order('updated_at', { ascending: false }).limit(2);
      if (artifacts) setRecentArtifacts(artifacts);

      const { data: posts } = await supabase.from('mason_posts').select('id').eq('mason_id', masonId);
      if (posts && posts.length > 0) {
        const postIds = posts.map(p => p.id);
        const { data: replies } = await supabase.from('mason_post_comments').select('*').in('post_id', postIds).order('created_at', { ascending: false }).limit(2);
        if (replies && replies.length > 0) {
          const authorIds = replies.map(r => r.author_id);
          const { data: profiles } = await supabase.from('profiles').select('id, username').in('id', authorIds);
          const repliesWithProfiles = replies.map(r => ({
            ...r,
            profiles: profiles?.find(p => p.id === r.author_id)
          }));
          setRecentReplies(repliesWithProfiles);
        }
      }
    };
    fetchRecent();
  }, [masonId, session, isVerifiedMason]);

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

      if (bRes.data) {
        const gameName = useStore.getState().activeGameSchema?.display_name || useStore.getState().activeGameSchema?.name || (t("sanctuary_default_name", "Sanctuary"));
        setBroadcasts(bRes.data.map((p: any) => ({
          ...p,
          masons: { name: `${gameName} Team` }
        })));
      }
      if (uRes.data && uRes.data.length > 0) {
        if (sessionStorage.getItem('dismissedAlertId') !== String(uRes.data[0].id)) {
          const gameName = useStore.getState().activeGameSchema?.display_name || useStore.getState().activeGameSchema?.name || (t("sanctuary_default_name", "Sanctuary"));
          setUrgentBroadcast({
            ...uRes.data[0],
            masons: { name: `${gameName} Team` }
          });
        }
      }
    };
    fetchBroadcasts();
  }, []);

  return (
    <CommandScreenLayout>
      <CommandScreenStats gridClassOverride={urgentBroadcast ? "grid-cols-2 lg:grid-cols-4" : undefined}>
        {urgentBroadcast && (
          <AlertStatTile className="col-span-2" broadcast={urgentBroadcast} number={urgentBroadcast ? 1 : 0} active={!!urgentBroadcast} onClick={() => setIsAlertsOpen(true)} />
        )}
        {isVerifiedMason && urgentBroadcast && (
          <DashboardStatTile className="col-span-2" icon={<span className="material-symbols-outlined ">{t("icon_bug_report", "bug_report")}</span>} number={stats.bugs} label={t("stat_bugs", "Bug Reports")} colorClass="text-rose-500" onClick={() => onNavigate("bug_reports")} />
        )}
        {isVerifiedMason && (
          <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_deployed_code", "deployed_code")}</span>} number={stats.artifacts} label={t("term_mods", "Artifacts")} colorClass="text-blue-500" onClick={() => onNavigate("registry")} />
        )}
        {isVerifiedMason && (
          <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_collections_bookmark", "collections_bookmark")}</span>} number={stats.collections} label={t("tab_cc", "Collections")} colorClass="text-amber-500" onClick={() => onNavigate("collections")} />
        )}
        {isVerifiedMason && !urgentBroadcast && (
          <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_bug_report", "bug_report")}</span>} number={stats.bugs} label={t("stat_bugs", "Bug Reports")} colorClass="text-rose-500" onClick={() => onNavigate("bug_reports")} />
        )}
        {isVerifiedMason && (
          <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_forum", "forum")}</span>} number={repliesCount} label={t("ui.replies", "Replies")} colorClass="text-indigo-500" onClick={onOpenRecentReplies} />
        )}
        {isVerifiedMason && (
          <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_local_activity", "local_activity")}</span>} number={stats.support} label={t("wf_tab_tickets", "Tickets")} colorClass="text-pink-500" onClick={onOpenSupportDesk} />
        )}
        {!isVerifiedMason && (
          <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_handyman", "handyman")}</span>} number={1} label={t("sandbox_title", "Sandbox")} colorClass="text-emerald-500" onClick={() => onNavigate("sandbox")} />
        )}
        {!isVerifiedMason && (
          <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_hub", "hub")}</span>} number={stats.blueprints} label={t("tab_nexus", "{Nexus}")} colorClass="text-blue-500" onClick={() => onNavigate("nexus")} />
        )}
        {!isVerifiedMason && (
          <DashboardStatTile className="hidden md:flex" icon={<span className="material-symbols-outlined ">{t("icon_palette", "palette")}</span>} number={1} label={t("tab_aesthetics", "Aesthetics")} colorClass="text-amber-500" onClick={() => onNavigate("chameleons")} />
        )}
        {!isVerifiedMason && (
          <DashboardStatTile icon={<span className="material-symbols-outlined ">{t("icon_local_activity", "local_activity")}</span>} number={stats.support} label={t("wf_tab_tickets", "Tickets")} colorClass="text-pink-500" onClick={onOpenSupportDesk} />
        )}
      </CommandScreenStats>

      <CommandScreenBody>
        <CommandScreenMain>
          <div className="flex flex-col gap-4 w-full">
            <CommandScreenSectionHeading title={t("wf_comms_title", "Broadcasts")} icon="history" />

            <div className="w-full">
              <SystemBroadcastsGrid broadcasts={broadcasts} setViewingPost={setViewingPost} />
            </div>
          </div>

          {isVerifiedMason && recentBugs.length > 0 && (
            <div className="flex flex-col gap-4 w-full">
              <CommandScreenSectionHeading title={t("stat_bugs", "Bug Reports")} icon="bug_report" />
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
                {recentBugs.map((bug: any) => (
                  <UniversalCard 
                    key={`bug-${bug.id}`} 
                    layout="vertical" 
                    title={bug.title || t("stat_bugs", "Bug Report")} 
                    icon={t("icon_bug_report", "bug_report")} 
                    onClick={() => onOpenBugReport && onOpenBugReport(bug.id)}
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
                        <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">{t("icon_bug_report", "bug_report")}</span>
                        <span>{t("stat_bugs", "Bug Reports")}</span>
                      </div>
                    }
                    footer={
                      <div className="flex items-center justify-start w-full mt-2">
                        <span className="text-[10px] font-black capitalize tracking-widest opacity-50 text-[var(--subtext)] flex items-center gap-2">
                          <span className="material-symbols-outlined !text-[12px]">{t("icon_calendar_today", "calendar_today")}</span> {new Date(bug.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    }
                  >
                    <p className="text-xs text-[var(--subtext)] leading-relaxed font-bold opacity-80 line-clamp-3 mt-1">
                      {stripMarkdown(bug.description || bug.content || t("ticket_opened_fallback", "Ticket opened."))}
                    </p>
                  </UniversalCard>
                ))}
              </div>
            </div>
          )}

          {isVerifiedMason && recentArtifacts.length > 0 && (
            <div className="flex flex-col gap-4 w-full">
              <CommandScreenSectionHeading title={t("term_mods", "Artifacts")} icon="deployed_code" />
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
                {recentArtifacts.map((art: any) => (
                  <UniversalCard 
                    key={`art-${art.id}`} 
                    layout="vertical" 
                    title={art.name || art.title} 
                    icon={t("icon_deployed_code", "deployed_code")} 
                    onClick={() => onOpenMetadataEditor && onOpenMetadataEditor(art.id)}
                    className="w-full"
                    imageOverlay={
                      <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
                        <div className={VAULT_CHIP_CLASS}>
                          <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">{t("icon_check_circle", "check_circle")}</span>
                          <span>{t("active", "Active")}</span>
                        </div>
                      </div>
                    }
                    badges={
                      <div className={VAULT_CHIP_CLASS}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{t("icon_deployed_code", "deployed_code")}</span>
                        <span>{t("term_mods", "Artifacts")}</span>
                      </div>
                    }
                    footer={
                      <div className="flex items-center justify-start w-full mt-2">
                        <span className="text-[10px] font-black capitalize tracking-widest opacity-50 text-[var(--subtext)] flex items-center gap-2">
                          <span className="material-symbols-outlined !text-[12px]">{t("icon_calendar_today", "calendar_today")}</span> {new Date(art.updated_at).toLocaleDateString()}
                        </span>
                      </div>
                    }
                  >
                    <p className="text-xs text-[var(--subtext)] leading-relaxed font-bold opacity-80 line-clamp-3 mt-1">
                      {stripMarkdown(art.description || t("artifact_updated_fallback", "Artifact metadata updated."))}
                    </p>
                  </UniversalCard>
                ))}
              </div>
            </div>
          )}

          {isVerifiedMason && recentReplies.length > 0 && (
            <div className="flex flex-col gap-4 w-full">
              <CommandScreenSectionHeading title={t("ui.replies", "Replies")} icon="forum" />
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
                {recentReplies.map((rep: any) => (
                  <UniversalCard 
                    key={`rep-${rep.id}`} 
                    layout="vertical" 
                    title={rep.profiles?.display_name || rep.profiles?.username || t("role_citizen", "{Citizen}")} 
                    icon={t("icon_forum", "forum")} 
                    onClick={onOpenRecentReplies}
                    className="w-full"
                    imageOverlay={
                      <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
                        <div className={VAULT_CHIP_CLASS}>
                          <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{t("icon_chat", "chat")}</span>
                          <span>{t("new", "New")}</span>
                        </div>
                      </div>
                    }
                    badges={
                      <div className={VAULT_CHIP_CLASS}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">{t("icon_forum", "forum")}</span>
                        <span>{t("ui.replies", "Replies")}</span>
                      </div>
                    }
                    footer={
                      <div className="flex items-center justify-start w-full mt-2">
                        <span className="text-[10px] font-black capitalize tracking-widest opacity-50 text-[var(--subtext)] flex items-center gap-2">
                          <span className="material-symbols-outlined !text-[12px]">{t("icon_calendar_today", "calendar_today")}</span> {new Date(rep.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    }
                  >
                    <p className="text-xs text-[var(--subtext)] leading-relaxed font-bold opacity-80 line-clamp-3 mt-1">
                      {stripMarkdown(rep.content || "")}
                    </p>
                  </UniversalCard>
                ))}
              </div>
            </div>
          )}
        </CommandScreenMain>

        <CommandScreenSidebar title={t("wf_quick_links", "Quick Links")} icon="rocket_launch">
          {urgentBroadcast && (
            <CommandScreenQuickLink 
              icon={t("icon_priority_high", "priority_high")}
              title={t("title_sanctuary_alerts", "Sanctuary Alerts")}
              subtitle={t("urgent_alert", "Urgent Alert")}
              onClick={() => setIsAlertsOpen(true)}
              isAlert={true}
            />
          )}

          <CommandScreenQuickLink onClick={() => onNavigate("sandbox")} icon={t("icon_deployed_code", "deployed_code")} title={isVerifiedMason ? t("term_mods", "Mods & Artifacts") : t("sandbox_title", "Sandbox")} subtitle={t("sandbox_sub", "Local & Nexus Workshop")} iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]" iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" textColorClass="text-emerald-400" hoverTextColorClass="group-hover:text-emerald-300" dotColorClass="bg-emerald-400 shadow-md" />
          <CommandScreenQuickLink onClick={() => onNavigate("nexus")} icon={t("icon_hub", "hub")} title={t("tab_nexus", "{Nexus}")} subtitle={t("playsets_title", "{Blueprints}")} iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]" iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" textColorClass="text-blue-400" hoverTextColorClass="group-hover:text-blue-300" dotColorClass="bg-blue-400 shadow-md" />
          <CommandScreenQuickLink className="hidden md:flex" onClick={() => onNavigate("chameleons")} icon={t("icon_palette", "palette")} title={t("tab_aesthetics", "Aesthetics")} subtitle={t("chameleons_unified_title", "Themes & Lexicons")} iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]" iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" textColorClass="text-indigo-400" hoverTextColorClass="group-hover:text-indigo-300" dotColorClass="bg-indigo-400 shadow-md" />
          {isVerifiedMason && (
            <>
              <CommandScreenQuickLink onClick={() => onNavigate("collections")} icon={t("icon_collections_bookmark", "collections_bookmark")} title={t("tab_cc", "Collections")} subtitle={t("studio_col_sub", "Curated Bundles")} iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]" iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" textColorClass="text-amber-400" hoverTextColorClass="group-hover:text-amber-300" dotColorClass="bg-amber-400 shadow-md" />
              <CommandScreenQuickLink onClick={() => onNavigate("posts")} icon={t("icon_edit_document", "edit_document")} title={t("tab_posts", "{Dispatches}")} subtitle={t("wf_comms_title", "Broadcasts")} iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]" iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" textColorClass="text-rose-400" hoverTextColorClass="group-hover:text-rose-300" dotColorClass="bg-rose-400 shadow-md" />
            </>
          )}
          {!urgentBroadcast && (
            <CommandScreenQuickLink onClick={() => setIsAlertsOpen(true)} icon={t("icon_warning_off", "warning_off")} title={t("title_sanctuary_alerts", "Sanctuary Alerts")} subtitle={t("alert_empty", "No Active Alerts")} iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--warning)_30%,transparent)]" iconShadowClass="drop-shadow-md" textColorClass="text-[color-mix(in_srgb,var(--warning)_80%,transparent)]" hoverTextColorClass="group-hover:text-amber-400" dotColorClass="bg-amber-500 shadow-md" />
          )}
        </CommandScreenSidebar>
      </CommandScreenBody>

      <div className="flex flex-col gap-4 w-full">
        <CommandScreenSectionHeading title={t("metrics", "Hub Metrics")} icon={t("icon_monitoring", "monitoring")} />
        <div className={`grid grid-cols-2 ${isVerifiedMason ? "lg:grid-cols-5" : "lg:grid-cols-3"} gap-4 w-full`}>
          {isVerifiedMason && (
            <CommandScreenMetricTile icon={t("icon_deployed_code", "deployed_code")} value={stats.artifacts} label={t("term_mods", "Artifacts")} valueColorClass="theme-text-accent" hoverBorderClass="hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]" />
          )}
          <CommandScreenMetricTile icon={t("icon_architecture", "architecture")} value={stats.blueprints || 1} label={t("playsets_title", "{Blueprints}")} valueColorClass="text-emerald-400" hoverBorderClass="hover:border-[color-mix(in_srgb,var(--success)_30%,transparent)]" />
          <CommandScreenMetricTile icon={t("icon_library_books", "library_books")} value={1} label={t("tab_lexicons", "Lexicons")} valueColorClass="text-indigo-400" hoverBorderClass="hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]" />
          <CommandScreenMetricTile icon={t("icon_palette", "palette")} value={1} label={t("chameleon", "Chameleon")} valueColorClass="text-pink-400" hoverBorderClass="hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)]" />
          {isVerifiedMason && (
            <CommandScreenMetricTile icon={t("icon_group", "group")} value={stats.followers} label={t("followers", "Followers")} valueColorClass="text-teal-400" hoverBorderClass="hover:border-[color-mix(in_srgb,var(--success)_30%,transparent)]" />
          )}
        </div>
      </div>

      <SanctuaryAlertsSidePanel
        isOpen={isAlertsOpen}
        onClose={() => setIsAlertsOpen(false)}
        audience="Masons"
      />
    </CommandScreenLayout>
  );
}
