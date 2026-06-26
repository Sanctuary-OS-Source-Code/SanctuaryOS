import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { useLexicon } from './LexiconContext';
import { useStore } from './store';
import { ViewHeader, HubTabButton, SidePanel, extractPostImage, stripMarkdown } from './shared';
import ArchitectSupportTickets from './ArchitectSupportTickets';

export function DashboardStatTile({ icon, number, label, colorClass, onClick }: any) {
  return (
    <div onClick={onClick} className={`flex-1 flex flex-col justify-center items-start gap-1 p-6 rounded-3xl border border-white/10 backdrop-blur-md ${colorClass} transition-all cursor-pointer shadow-lg relative overflow-hidden group hover:-translate-y-1 hover:shadow-xl`}>
       <div className="absolute inset-0 bg-current opacity-0 group-hover:opacity-[0.15] transition-opacity duration-300" />
       <div className="flex items-center gap-3 w-full relative z-10">
           <span className="text-3xl opacity-50 grayscale group-hover:opacity-100 group-hover:grayscale-0 group-hover:scale-110 transition-all drop-shadow-md">{icon}</span>
           <span className={`text-4xl lg:text-5xl font-black drop-shadow-lg tracking-tighter`}>{number}</span>
       </div>
       <span className="text-[9px] uppercase tracking-[0.2em] font-bold text-[var(--subtext)] opacity-60 mt-2">{label}</span>
    </div>
  );
}
import GlobalFeed from './GlobalFeed';
import MasonBugReports from './MasonBugReports';
import SASupportSettings from './SASupportSettings';
import { AuditLogViewer, DefconSidePanel, ComplianceOversight, MasonLinker } from './SeniorArchitect';
import MasonPostViewer from './MasonPostViewer';
import SystemBroadcastsFeed from './SystemBroadcastsFeed';
import { IdentityMatrix } from './IdentityMatrix';
import { WayfinderPostsEditor } from './WayfinderPostsEditor';
import { MarketplaceReportsViewer, FileVerificationSidePanel } from './ArchitectHub';
import ComplianceManualFlagSidePanel from './ComplianceManualFlagSidePanel';
import SAOversightReports from './SAOversightReports';

export default function WayfinderHub({ onOpenMasonProfile }: { onOpenMasonProfile?: (id: string) => void }) {
  const { t } = useLexicon();
  const { session } = useStore();
  const [activeTab, setActiveTab] = useState("command_center");
  const [complianceFilter, setComplianceFilter] = useState("ALL");
  const [showManualFlagModal, setShowManualFlagModal] = useState(false);
  const [initialManualFlagQuery, setInitialManualFlagQuery] = useState("");
  const [defconOpen, setDefconOpen] = useState(false);
  const [isVerifyPanelOpen, setIsVerifyPanelOpen] = useState(false);
  const [verifyPanelInitialHash, setVerifyPanelInitialHash] = useState("");
  const [initialHeuristicEdit, setInitialHeuristicEdit] = useState<any>(null);
  const [defconLevel, setDefconLevel] = useState(5);

  useEffect(() => {
    supabase.from('global_network_status').select("defcon_level").single().then(({data}) => {
      if (data) setDefconLevel(data.defcon_level);
    });
  }, []);

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full pb-48 relative">
      <ViewHeader title={t("wf_hub_title") || "Wayfinder Operations"} subtitle={t("wf_hub_subtitle") || "Network operations, broadcasts, support routing, and platform health"} icon={t("ui_icon_terminal") || "terminal"} iconColorClass="text-indigo-400 border-indigo-500/30">
        <div className="flex items-center theme-glass-panel rounded-2xl p-1 border border-white/10 shadow-inner">
           {/* Verify Hash Button */}
           <button 
             onClick={() => setIsVerifyPanelOpen(true)}
             className="h-12 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 border border-transparent text-[var(--text)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)] hover:border-[var(--accent)]/50 font-black uppercase tracking-widest text-[10px] group"
           >
             <span className="material-symbols-outlined !text-[16px] group-hover:scale-110 transition-transform">{t("ui_icon_verified") || "verified_user"}</span>
             {t("wf_hub_verify") || "VERIFY HASH"}
           </button>
           
           <div className="w-px h-6 bg-white/10 mx-2" />
           
          {/* Defcon Button */}
           <button 
             onClick={() => setDefconOpen(true)}
             className={`h-12 px-6 rounded-xl transition-all flex items-center justify-center gap-3 shrink-0 font-black uppercase tracking-widest border border-transparent ${
               defconLevel === 1
                 ? 'text-red-400 hover:text-red-300 drop-shadow-[0_0_10px_rgba(239,68,68,0.5)] bg-red-500/10 hover:bg-red-500/20 shadow-[0_0_30px_rgba(239,68,68,0.3)] animate-pulse'
                 : 'text-[var(--text)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)] hover:border-[var(--accent)]/50'
             }`}
           >
             <span className={`material-symbols-outlined !text-[24px] ${defconLevel === 1 ? 'animate-bounce' : 'opacity-70'}`}>
               {defconLevel === 1 ? 'warning' : 'security'}
             </span>
             <span className="text-[10px]">{t("sa_defcon_title") || "DEFCON OVERRIDE".replace("🚨 ", "").replace("⚠️ ", "")}</span>
           </button>
        </div>
      </ViewHeader>

      <div className="flex flex-col gap-1 w-full mb-4 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar p-1 theme-glass-panel rounded-2xl border border-white/5 shadow-inner">
           <HubTabButton id="command_center" icon={t("ui_icon_pc") || "desktop_windows"} label={t("wf_tab_command") || "COMMAND"} activeTab={activeTab} setTab={setActiveTab} />
           <HubTabButton id="wayfinder_comms" icon={t("ui_icon_satellite_alt") || "satellite_alt"} label={t("wf_tab_dispatch") || "DISPATCH"} activeTab={activeTab} setTab={setActiveTab} />
           <HubTabButton id="identities" icon={t("ui_icon_group") || "group"} label={t("sa_tab_identities") || "Identity"} activeTab={activeTab} setTab={setActiveTab} />
           <HubTabButton id="linker" icon={t("ui_icon_link") || "link"} label={t("sa_tab_linker") || "Masons"} activeTab={activeTab} setTab={setActiveTab} />
           <HubTabButton id="compliance" icon={t("ui_icon_policy") || "policy"} label={t("sa_tab_compliance") || "Compliance"} activeTab={activeTab} setTab={setActiveTab} />
           <HubTabButton id="reports" icon={t("ui_icon_report") || "flag"} label={t("mason_stat_bugs") || "REPORTS"} activeTab={activeTab} setTab={setActiveTab} />
           <HubTabButton id="oversight_reports" icon={t("ui_icon_threat_intelligence") || "threat_intelligence"} label={t("hub_tab_malware_logs") || "Manifests"} activeTab={activeTab} setTab={setActiveTab} />
           <HubTabButton id="sanctuary_tickets" icon={t("ui_icon_local_activity") || "local_activity"} label={t("wf_tab_tickets") || "SUPPORT"} activeTab={activeTab} setTab={setActiveTab} />
           <HubTabButton id="support_settings" icon={t("ui_icon_support_agent") || "support_agent"} label={t("wf_tab_support") || "SETTINGS"} activeTab={activeTab} setTab={setActiveTab} />
           <HubTabButton id="audit_logs" icon={t("ui_icon_history") || "history"} label={t("sa_tab_audit") || "Logs"} activeTab={activeTab} setTab={setActiveTab} />
        </div>
      </div>

      <div className="w-full flex-1 flex flex-col min-h-0">
        {activeTab === "command_center" && <WayfinderCommandScreen setTab={setActiveTab} setComplianceFilter={setComplianceFilter} onOpenMasonProfile={onOpenMasonProfile} />}
        {activeTab === "wayfinder_comms" && <WayfinderPostsEditor authorId={session?.user?.id || ""} authorProfileId={session?.user?.id || ""} />}
        {activeTab === "identities" && <IdentityMatrix isWayfinder={true} />}
        {activeTab === "linker" && <MasonLinker />}
        {activeTab === "compliance" && <ComplianceOversight initialFilter={complianceFilter} setInitialFilter={setComplianceFilter} onOpenManualFlag={(query: string, sig?: any) => { 
           setInitialManualFlagQuery(query); 
           if (sig) setInitialHeuristicEdit(sig);
           setShowManualFlagModal(true); 
        }} />}
        {activeTab === "reports" && <MarketplaceReportsViewer onOpenDossier={(report: any) => {}} />}
        {activeTab === "oversight_reports" && <SAOversightReports />}
        {activeTab === "sanctuary_tickets" && <ArchitectSupportTickets userRole="wayfinder" />}
        {activeTab === "support_settings" && <SASupportSettings />}
        {activeTab === "audit_logs" && <AuditLogViewer />}
        {activeTab !== "command_center" && activeTab !== "wayfinder_comms" && activeTab !== "identities" && activeTab !== "linker" && activeTab !== "compliance" && activeTab !== "reports" && activeTab !== "oversight_reports" && activeTab !== "sanctuary_tickets" && activeTab !== "support_settings" && activeTab !== "audit_logs" && (
           <div className="p-12 text-center text-[var(--subtext)] opacity-50 font-black uppercase tracking-widest text-xs">
              {t("wf_under_construction")}
           </div>
        )}
      </div>

      <DefconSidePanel isOpen={defconOpen} onClose={() => setDefconOpen(false)} />
      <FileVerificationSidePanel 
        isOpen={isVerifyPanelOpen} 
        onClose={() => setIsVerifyPanelOpen(false)} 
        isSeniorArchitect={true} 
        initialHash={verifyPanelInitialHash}
        onManualFlag={(hash: string) => {
           setInitialManualFlagQuery(hash);
           setShowManualFlagModal(true);
        }}
      />
      <ComplianceManualFlagSidePanel 
        isOpen={showManualFlagModal}
        onClose={() => { setShowManualFlagModal(false); setInitialHeuristicEdit(null); }}
        initialQuery={initialManualFlagQuery}
        initialHeuristicEdit={initialHeuristicEdit}
        sourceHub="Sanctuary OS [Wayfinder]"
      />
    </div>
  );
}

function ServerHealthSidePanel({ isOpen, onClose, stats }: any) {
  const { t } = useLexicon();
  if (!isOpen) return null;

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("wf_health_title") || "SERVER HEALTH"}
      subtitle={t("wf_health_subtitle") || "DIAGNOSTICS & TELEMETRY"}
      icon="dns"
    >
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 custom-scrollbar">
        <div className="flex flex-col gap-4">
          <div className="theme-glass-panel border border-white/5 rounded-2xl p-6 flex items-center justify-between">
             <div className="flex flex-col gap-1">
               <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-70">{t("wf_core_node") || "CORE NODE"}</span>
               <span className={`text-xl font-black tracking-widest ${stats.networkStatus === 'ONLINE' ? 'text-emerald-400' : 'text-yellow-400'}`}>{stats.networkStatus === 'ONLINE' ? (t("wf_stat_server_nominal") || "NOMINAL") : (t("wf_stat_server_degraded") || "DEGRADED")}</span>
             </div>
             <span className="material-symbols-outlined !text-4xl opacity-20">{t("ui_icon_memory") || "memory"}</span>
          </div>

          <div className="theme-glass-panel border border-white/5 rounded-2xl p-6 flex flex-col gap-4">
             <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-70 flex items-center gap-2">
               <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_speed") || "speed"}</span> SYSTEM LOAD
             </span>
             <div className="flex flex-col gap-2">
               <div className="flex justify-between text-xs font-bold text-[var(--text)]">
                 <span>{t("wf_health_cpu_usage") || "CPU USAGE"}</span>
                 <span className="text-[var(--accent)]">42%</span>
               </div>
               <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden">
                 <div className="h-full bg-[var(--accent)] w-[42%] shadow-[0_0_10px_rgba(var(--accent-rgb),0.8)]"></div>
               </div>
             </div>
             <div className="flex flex-col gap-2 mt-2">
               <div className="flex justify-between text-xs font-bold text-[var(--text)]">
                 <span>{t("wf_health_memory_allocation") || "MEMORY ALLOCATION"}</span>
                 <span className="text-orange-400">78%</span>
               </div>
               <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden">
                 <div className="h-full bg-orange-400 w-[78%] shadow-[0_0_10px_rgba(251,146,60,0.8)]"></div>
               </div>
             </div>
          </div>

          <div className="theme-glass-panel border border-white/5 rounded-2xl p-6 flex flex-col gap-4">
             <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-70 flex items-center gap-2">
               <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_router") || "router"}</span> NETWORK DIAGNOSTICS
             </span>
             <div className="grid grid-cols-2 gap-4">
               <div className="flex flex-col gap-1">
                 <span className="text-[9px] uppercase tracking-widest font-bold opacity-50">{t("wf_latency") || "LATENCY"}</span>
                 <span className="text-lg font-black text-[var(--text)]">{stats.networkLatency || '--'} ms</span>
               </div>
               <div className="flex flex-col gap-1">
                 <span className="text-[9px] uppercase tracking-widest font-bold opacity-50">{t("wf_connections") || "CONNECTIONS"}</span>
                 <span className="text-lg font-black text-blue-400">1,204</span>
               </div>
               <div className="flex flex-col gap-1 col-span-2 mt-2">
                 <span className="text-[9px] uppercase tracking-widest font-bold opacity-50">{t("wf_db_sync") || "DB SYNC"}</span>
                 <span className="text-sm font-black text-emerald-400 flex items-center gap-2">
                   <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.8)] animate-pulse"></span>
                   SYNCHRONIZED
                 </span>
               </div>
             </div>
          </div>
        </div>
      </div>
    </SidePanel>
  );
}

function WayfinderCommandScreen({ setTab, setComplianceFilter, onOpenMasonProfile }: any) {
  const { t } = useLexicon();
  const { session } = useStore();
  const [defconOpen, setDefconOpen] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [viewingPost, setViewingPost] = useState<any>(null);
  const [stats, setStats] = useState({ 
    defconLevel: 5,
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
    seniorArchitects: 0,
    blacklisted: 0
  });

  useEffect(() => {
    const fetchStats = async () => {
      // Network Status Ping
      const startTime = performance.now();
      let netLatency = null;
      let netStatus = "OFFLINE";
      try {
        await supabase.from('global_network_status').select("id").limit(1);
        netLatency = Math.round(performance.now() - startTime);
        netStatus = "ONLINE";
      } catch (e) {
        netStatus = "ERROR";
      }

      // DEFCON Level
      const { data: defconData } = await supabase.from('global_network_status').select("defcon_level").single();

      // Wayfinder Support Queue
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

            const tiers = ['mod_author', 'architect', 'senior_architect', 'wayfinder'];
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
                  } else if (esciArc === 'Senior Architect' || esciArc === 'Oversight') {
                      dest = 'wayfinder';
                  } else if (esciArc === 'Architect') {
                      dest = 'senior_architect';
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

      // 30 days ago
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const isoDate = thirtyDaysAgo.toISOString();

      // Flagged Queue (mods with compliance tier 1-3, updated in last 30 days)
      const { count: flaggedQueueCount } = await supabase.from('mods')
        .select('*', { count: 'exact', head: true })
        .in('compliance_tier', [1, 2, 3])
        .gte('created_at', isoDate); 

      // Quarantined (mods with compliance tier 3)
      const { count: quarantinedCount } = await supabase.from('mods')
        .select('*', { count: 'exact', head: true })
        .eq('compliance_tier', 3);
        
      // Oversight Queue
      const { count: oversightQueueCount } = await supabase.from('malware_reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      
      const { count: oversightNewCount } = await supabase.from('malware_reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
        .gte('created_at', isoDate);

      // Report Queue
      const { count: reportQueueCount } = await supabase.from('marketplace_reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
        .gte('created_at', isoDate);

      // Hub Metrics
      const { count: citizensCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'citizen');
      const { count: masonsCount } = await supabase.from('masons').select('*', { count: 'exact', head: true });
      const { count: architectsCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'architect');
      const { count: seniorArchitectsCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'senior_architect');
      const { count: blacklistedCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_banned', true);

      // LATEST DISPATCH Broadcasts
      const { data: broadcastsData } = await supabase.from('system_broadcasts')
        .select('*')
        .in('target_audience', ['All', 'all', 'Wayfinders', 'wayfinders', 'WAYFINDERS'])
        .order('created_at', { ascending: false })
        .limit(3);
      if (broadcastsData) setBroadcasts(broadcastsData);

      setStats({
        defconLevel: defconData?.defcon_level || 5,
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
        seniorArchitects: seniorArchitectsCount || 0,
        blacklisted: blacklistedCount || 0
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
    if (status !== 'ONLINE') return t("ui_icon_wifi_0") || "wifi_off";
    if (latency && latency > 500) return t("ui_icon_wifi_1") || "network_wifi_1_bar";
    if (latency && latency > 150) return t("ui_icon_wifi_2") || "network_wifi_2_bar";
    if (latency && latency > 50) return t("ui_icon_wifi_3") || "network_wifi_3_bar";
    return t("ui_icon_wifi_4") || "wifi";
  };

  return (
    <div className="flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full pr-4 pb-32 mt-8">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 w-full">
          <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("ui_icon_warning") || "warning_amber"}</span>} number={stats.defconLevel} label={t("sa_defcon_global") || "GLOBAL DEFCON"} colorClass={getDefconColor(stats.defconLevel)} onClick={() => setDefconOpen(true)} />
          <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("ui_icon_dns") || "dns"}</span>} number={stats.networkLatency ? `${stats.networkLatency}` : "---"} label={stats.networkStatus === "ONLINE" ? (t("wf_stat_server_nominal") || "NOMINAL") : (t("wf_stat_server_degraded") || "DEGRADED")} colorClass={stats.networkStatus === "ONLINE" ? "border-emerald-500/30 text-emerald-500 hover:border-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20" : "border-yellow-500/30 text-yellow-500 hover:border-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20"} onClick={() => setHealthOpen(true)} />
          <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("ui_icon_local_activity") || "local_activity"}</span>} number={stats.supportQueue} label={t("wf_stat_support_queue") || "SUPPORT QUEUE"} colorClass="border-purple-500/30 text-purple-500 hover:border-purple-500 bg-purple-500/10 hover:bg-purple-500/20" onClick={() => setTab("sanctuary_tickets")} />
          <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("ui_icon_flag") || "flag"}</span>} number={stats.flaggedQueue} label={t("wf_stat_flagged") || "FLAGGED QUEUE"} colorClass="border-orange-500/30 text-orange-500 hover:border-orange-500 bg-orange-500/10 hover:bg-orange-500/20" onClick={() => { if(setComplianceFilter) setComplianceFilter('flagged'); setTab("compliance"); }} />
          <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("ui_icon_threat_intelligence") || "threat_intelligence"}</span>} number={stats.oversightQueueNew} label={t("hub_stat_malware_logs") || "MALWARE MANIFESTS"} colorClass="border-red-500/30 text-red-500 hover:border-red-500 bg-red-500/10 hover:bg-red-500/20" onClick={() => setTab("oversight_reports")} />
          <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("ui_icon_malware_skull") || "skull"}</span>} number={stats.quarantined} label={t("wf_stat_quarantined") || "QUARANTINED"} colorClass="border-red-500/30 text-red-500 hover:border-red-500 bg-red-500/10 hover:bg-red-500/20" onClick={() => { if(setComplianceFilter) setComplianceFilter('quarantined'); setTab("compliance"); }} />
        </div>

      <div className="flex flex-col lg:flex-row gap-8 w-full">
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] mb-6 shrink-0">{t("wf_comms_title") || "Latest Dispatch"}</h2>
          <div className="flex flex-col gap-8 w-full mb-8">
             <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 w-full">
                {broadcasts.length > 0 ? broadcasts.map((post, index) => {
                  const isFeatured = index === 0;
                  return (
                  <div key={post.id} onClick={() => setViewingPost({ ...post, content: post.message || post.content, mason_id: 'system', views: 0, likes: 0, replies: 0 })} className={`group cursor-pointer w-full theme-glass-panel rounded-[2rem] overflow-hidden hover:scale-[1.01] transition-all shadow-xl hover:shadow-[0_0_30px_rgba(var(--accent-rgb),0.3)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[var(--accent)]/50 flex flex-col ${isFeatured ? 'xl:flex-row xl:col-span-2 min-h-[12rem] xl:min-h-[14rem]' : 'min-h-[10rem]'}`}>
                    {isFeatured && (
                      <div className="w-full relative overflow-hidden bg-[var(--bg)] border-b xl:w-1/2 xl:border-b-0 xl:border-r border-[color-mix(in_srgb,var(--text)_5%,transparent)] flex items-center justify-center">
                         <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/10 to-transparent z-10 pointer-events-none" />
                        {extractPostImage(post) ? (
                            <img src={extractPostImage(post)} className="w-full h-full object-cover opacity-60 mix-blend-luminosity group-hover:scale-105 transition-transform duration-1000" />
                        ) : (
                         <span className="material-symbols-outlined !text-6xl grayscale opacity-30 drop-shadow-lg group-hover:scale-110 group-hover:opacity-100 transition-all duration-500 group-hover:grayscale-0 relative z-10">{t("ui_icon_satellite") || "satellite_alt"}</span>
                        )}
                      </div>
                    )}
                    <div className="flex-1 p-8 flex flex-col min-w-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--bg)_40%,transparent)] to-transparent relative z-10">
                       <div className="flex items-center gap-2 mb-4 shrink-0 flex-wrap">
                         <span className="px-3 py-1 bg-[var(--accent)]/20 text-[var(--accent)] text-[9px] font-black uppercase tracking-widest rounded-lg">{post.category || t("wayfinder_update") || "UPDATE"}</span>
                         <span className="px-3 py-1 theme-glass-inner text-[var(--text)] text-[9px] font-black uppercase tracking-widest rounded-lg">{t("wayfinder_system") || "SYSTEM"}</span>
                       </div>
                       <h3 className="text-xl font-black uppercase tracking-widest text-[var(--text)] group-hover:text-[var(--accent)] transition-colors mb-4 leading-normal line-clamp-2">{post.title}</h3>
                       {isFeatured && <p className="text-xs text-[var(--subtext)] leading-relaxed font-bold opacity-80 mb-6 line-clamp-3">{stripMarkdown(post.message || post.content)}</p>}
                       <div className="mt-auto flex items-center justify-between pt-6 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] shrink-0">
                          <span className="text-[10px] font-black uppercase tracking-widest opacity-50 text-[var(--subtext)] flex items-center gap-2"><span className="material-symbols-outlined !text-[12px]">{t("ui_icon_calendar_today") || "calendar_today"}</span> {new Date(post.created_at).toLocaleDateString()}</span>
                          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] opacity-0 group-hover:opacity-100 transition-all flex items-center gap-2 text-[var(--accent)]">{t("wayfinder_read_more") || "READ MORE"} <span className="material-symbols-outlined !text-lg">{t("arrow_forward") || "arrow_forward"}</span></span>
                        </div>
                     </div>
                  </div>
                  );
                }) : (
                  <div className="w-full xl:col-span-2 theme-glass-panel rounded-[2rem] p-12 text-center text-[var(--subtext)] opacity-50 uppercase font-black text-sm tracking-widest border border-dashed border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                    {t("system_no_broadcasts") || "No Recent Broadcasts"}
                  </div>
                )}
             </div>
          </div>

          <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] mt-4 mb-2 shrink-0">{t("hub_metrics") || "HUB METRICS"}</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 w-full">
             <div className="theme-glass-panel border border-white/5 rounded-3xl p-6 flex flex-col items-center justify-center gap-3 shadow-lg hover:bg-white/5 hover:border-[var(--accent)]/30 transition-all text-center h-32">
                <span className="text-3xl font-black theme-text-accent">{stats.citizens}</span>
                <span className="text-[9px] font-black uppercase tracking-widest opacity-70 text-[var(--subtext)] leading-tight">{t("hub_stat_citizens") || "CITIZENS"}</span>
             </div>
             <div className="theme-glass-panel border border-white/5 rounded-3xl p-6 flex flex-col items-center justify-center gap-3 shadow-lg hover:bg-white/5 hover:border-[var(--accent)]/30 transition-all text-center h-32">
                <span className="text-3xl font-black theme-text-accent">{stats.masons}</span>
                <span className="text-[9px] font-black uppercase tracking-widest opacity-70 text-[var(--subtext)] leading-tight">{t("hub_stat_masons") || "MASONS"}</span>
             </div>
             <div className="theme-glass-panel border border-white/5 rounded-3xl p-6 flex flex-col items-center justify-center gap-3 shadow-lg hover:bg-white/5 hover:border-purple-500/30 transition-all text-center h-32">
                <span className="text-3xl font-black text-purple-400">{stats.architects}</span>
                <span className="text-[9px] font-black uppercase tracking-widest opacity-70 text-black-300/70 leading-tight">{t("hub_stat_architects") || "ARCHITECTS"}</span>
             </div>
             <div className="theme-glass-panel border border-white/5 rounded-3xl p-6 flex flex-col items-center justify-center gap-3 shadow-lg hover:bg-white/5 hover:border-indigo-500/30 transition-all text-center h-32">
                <span className="text-3xl font-black text-indigo-400">{stats.seniorArchitects}</span>
                <span className="text-[9px] font-black uppercase tracking-widest opacity-70 text-black-300/70 leading-tight">{t("hub_stat_senior_architects") || "OVERSIGHT"}</span>
             </div>
             <div className="theme-glass-panel border border-white/5 rounded-3xl p-6 flex flex-col items-center justify-center gap-3 shadow-lg hover:bg-white/5 hover:border-red-500/30 transition-all text-center h-32">
                <span className="text-3xl font-black text-red-500">{stats.oversightQueue}</span>
                <span className="text-[9px] font-black uppercase tracking-widest opacity-70 text-black-400/70 leading-tight">{t("hub_tab_malware_logs") || "MALWARE LOGS"}</span>
             </div>
          </div>
        </div>

        <div className="w-[380px] shrink-0 flex flex-col">
           <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] mb-6">{t("wf_quick_links") || "QUICK LINKS"}</h2>
           <div className="flex flex-col gap-4">
             <button onClick={() => setTab("linker")} className="w-full p-6 theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-[1.5rem] hover:bg-white/5 hover:border-[var(--accent)]/50 hover:shadow-[0_0_40px_rgba(var(--accent-rgb),0.1)] transition-all text-left group relative overflow-hidden h-24">
               <div className="flex items-center gap-5 h-full">
                 <div className="w-12 h-12 rounded-xl theme-glass-inner border border-white/10 flex items-center justify-center shrink-0 group-hover:border-[var(--accent)]/30 transition-colors">
                   <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]">{t("ui_icon_link") || "link"}</span>
                 </div>
                 <div className="flex flex-col gap-1 flex-1 min-w-0">
                   <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--text)] group-hover:text-[var(--accent)] transition-colors truncate">{t("hub_ql_mason_linker") || "MASON VERIFICATION"}</h3>
                   <span className="text-[8px] uppercase font-bold text-emerald-400 opacity-80 group-hover:text-emerald-300 tracking-widest flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></span> {t("sa_link_linker_sub") || "MANAGE LINKAGES"}</span>
                 </div>
               </div>
             </button>

             <button onClick={() => setTab("compliance")} className="w-full p-6 theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-[1.5rem] hover:bg-white/5 hover:border-[var(--accent)]/50 hover:shadow-[0_0_40px_rgba(var(--accent-rgb),0.1)] transition-all text-left group relative overflow-hidden h-24">
               <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 group-hover:-translate-x-full duration-1000 transition-all ease-in-out" />
               <div className="flex items-center gap-5 h-full relative z-10">
                 <div className="w-12 h-12 rounded-xl theme-glass-inner border border-white/10 flex items-center justify-center shrink-0 group-hover:border-[var(--accent)]/30 transition-colors">
                   <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]">{t("ui_icon_policy") || "policy"}</span>
                 </div>
                 <div className="flex flex-col gap-1 flex-1 min-w-0">
                   <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--text)] group-hover:text-[var(--accent)] transition-colors truncate">{t("sa_comp_title") || "Compliance Oversight"}</h3>
                   <span className="text-[8px] uppercase font-bold text-orange-400 opacity-80 group-hover:text-orange-300 tracking-widest flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.8)]"></span> {t("sa_link_compliance_sub") || "ENFORCE POLICIES"}</span>
                 </div>
               </div>
             </button>
             
             <button onClick={() => setTab("oversight_reports")} className="w-full p-6 theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-[1.5rem] hover:bg-white/5 hover:border-[var(--accent)]/50 hover:shadow-[0_0_40px_rgba(var(--accent-rgb),0.1)] transition-all text-left group relative overflow-hidden h-24">
               <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 group-hover:-translate-x-full duration-1000 transition-all ease-in-out" />
               <div className="flex items-center gap-5 h-full relative z-10">
                 <div className="w-12 h-12 rounded-xl theme-glass-inner border border-white/10 flex items-center justify-center shrink-0 group-hover:border-[var(--accent)]/30 transition-colors">
                   <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]">{t("ui_icon_threat_intelligence") || "threat_intelligence"}</span>
                 </div>
                 <div className="flex flex-col gap-1 flex-1 min-w-0">
                   <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--text)] group-hover:text-[var(--accent)] transition-colors truncate">{t("sa_oversight_dashboard") || "OVERSIGHT REPORTS"}</h3>
                   <span className="text-[8px] uppercase font-bold text-red-500 opacity-80 group-hover:text-red-500 tracking-widest flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-red-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"></span> {t("hub_ql_sys_reports") || "SYSTEM REPORTS"}</span>
                 </div>
               </div>
             </button>

             <button onClick={() => setTab("sanctuary_tickets")} className="w-full p-6 theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-[1.5rem] hover:bg-white/5 hover:border-[var(--accent)]/50 hover:shadow-[0_0_40px_rgba(var(--accent-rgb),0.1)] transition-all text-left group relative overflow-hidden h-24">
               <div className="flex items-center gap-5 h-full">
                 <div className="w-12 h-12 rounded-xl theme-glass-inner border border-white/10 flex items-center justify-center shrink-0 group-hover:border-[var(--accent)]/30 transition-colors">
                   <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]">{t("ui_icon_local_activity") || "local_activity"}</span>
                 </div>
                 <div className="flex flex-col gap-1 flex-1 min-w-0">
                   <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--text)] group-hover:text-[var(--accent)] transition-colors truncate">{t("hub_ql_support") || "SUPPORT QUEUE"}</h3>
                   <span className="text-[8px] uppercase font-bold text-purple-400 opacity-80 group-hover:text-purple-300 tracking-widest flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.8)]"></span> {t("wf_link_tickets_sub") || "VIEW TICKETS"}</span>
                 </div>
               </div>
             </button>
             
             <button onClick={() => setTab("support_settings")} className="w-full p-6 theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-[1.5rem] hover:bg-white/5 hover:border-[var(--accent)]/50 hover:shadow-[0_0_40px_rgba(var(--accent-rgb),0.1)] transition-all text-left group relative overflow-hidden h-24">
               <div className="flex items-center gap-5 h-full">
                 <div className="w-12 h-12 rounded-xl theme-glass-inner border border-white/10 flex items-center justify-center shrink-0 group-hover:border-[var(--accent)]/30 transition-colors">
                   <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]">{t("ui_icon_support_agent") || "support_agent"}</span>
                 </div>
                 <div className="flex flex-col gap-1 flex-1 min-w-0">
                   <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--text)] group-hover:text-[var(--accent)] transition-colors truncate">{t("sa_title_support_settings") || "SUPPORT SETTINGS"}</h3>
                   <span className="text-[8px] uppercase font-bold text-amber-400 opacity-80 group-hover:text-amber-300 tracking-widest flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]"></span> {t("wf_link_support_sub") || "MANAGE SETTINGS"}</span>
                 </div>
               </div>
             </button>
             
             <button onClick={() => setTab("audit_logs")} className="w-full p-6 theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-[1.5rem] hover:bg-white/5 hover:border-[var(--accent)]/50 hover:shadow-[0_0_40px_rgba(var(--accent-rgb),0.1)] transition-all text-left group relative overflow-hidden h-24">
               <div className="flex items-center gap-5 h-full">
                 <div className="w-12 h-12 rounded-xl theme-glass-inner border border-white/10 flex items-center justify-center shrink-0 group-hover:border-[var(--accent)]/30 transition-colors">
                   <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]">{t("ui_icon_history") || "history"}</span>
                 </div>
                 <div className="flex flex-col gap-1 flex-1 min-w-0">
                   <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--text)] group-hover:text-[var(--accent)] transition-colors truncate">{t("hub_ql_audit_logs") || "AUDIT LOGS"}</h3>
                   <span className="text-[8px] uppercase font-bold text-blue-400 opacity-80 group-hover:text-blue-300 tracking-widest flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]"></span> {t("sa_link_audit_sub") || "VIEW SYSTEM LOGS"}</span>
                 </div>
               </div>
             </button>
           </div>
        </div>
      </div>
        <ServerHealthSidePanel isOpen={healthOpen} onClose={() => setHealthOpen(false)} stats={stats} />
      <DefconSidePanel isOpen={defconOpen} onClose={() => setDefconOpen(false)} />
      {viewingPost && (
        <MasonPostViewer 
          post={viewingPost} 
          onClose={() => setViewingPost(null)} 
          userId={session?.user?.id || 'wayfinder'} 
          onOpenMasonProfile={onOpenMasonProfile}
        />
      )}
    </div>
  );
}
