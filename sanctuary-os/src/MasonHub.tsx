
import { useState, useEffect } from "react";
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { isVersionMatch, deriveHumanReadableVersion, getHighestVersion, CustomComplianceDropdown } from "./shared";
import MarkdownRenderer from "./MarkdownRenderer";
import AssetPreviewSidebar from "./AssetPreviewSidebar";
import { supabase } from "./supabase";
import { ViewHeader, SidePanel, GameVersionMultiSelect, CustomDropdown, StatTile, ModSearchDropdown, CustomDatePicker, HubTabButton, standardButtonClass, standardPrimaryButtonClass, standardDangerButtonClass, standardAccentGlassButtonClass } from "./shared";
import ProtocolVisualizer from "./ProtocolVisualizer";
import StructureVisualizer from "./StructureVisualizer";
import ModStructureBuilder from "./ModStructureBuilder";
import MasonIDE from "./MasonIDE";
import { useLexicon } from "./LexiconContext";
import MasonPostViewer from "./MasonPostViewer";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import MasonConflictsManager from "./MasonConflictsManager";
import MasonBugReports from "./MasonBugReports";
import MasonNotepadSidePanel from "./MasonNotepadSidePanel";
import MasonRecentRepliesSidePanel from "./MasonRecentRepliesSidePanel";
import CitizenTicketsSidePanel from "./CitizenTicketsSidePanel";
import { useStore } from "./store";
import { ArtifactCard, CollectionCard } from "./Cards";

const fetchAllPaginated = async (queryFn: () => any) => { let allData: any[] = []; let from = 0; const step = 999; while (true) { const { data, error } = await queryFn().range(from, from + step); if (error || !data || data.length === 0) break; allData = [...allData, ...data]; if (data.length <= step) break; from += step + 1; } return { data: allData, error: null }; };

export default function MasonHub({ sandboxMod, clearSandboxMod, vaultPath, handleOpenMasonProfile }: { sandboxMod?: any, clearSandboxMod?: () => void, vaultPath?: string, handleOpenMasonProfile?: (masonId: string, postId?: string) => void }) {
  const { t } = useLexicon();
  const { session } = useStore();
  const [activeTab, setActiveTab] = useState("command_center");
  const [masonProfile, setMasonProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNotepadOpen, setIsNotepadOpen] = useState(false);
  const [isRecentRepliesOpen, setIsRecentRepliesOpen] = useState(false);
  const [isSupportDeskOpen, setIsSupportDeskOpen] = useState(false);
  const [viewingPost, setViewingPost] = useState<any>(null);
  const [activeAsset, setActiveAsset] = useState<{type: string, id: string} | null>(null);

  useEffect(() => {
    if (sandboxMod) setActiveTab("sandbox");
  }, [sandboxMod]);

  useEffect(() => {
    async function fetchMasonProfile() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data, error } = await supabase.from('masons').select('*').eq('profile_id', session.user.id).single();
        if (!error && data) setMasonProfile(data);
      }
      setLoading(false);
    }
    fetchMasonProfile();
  },[]);

  if (loading) return <div className="p-12 text-center theme-text-accent animate-pulse font-black tracking-widest uppercase">{t("mason_verifying")}</div>;

  if (!masonProfile) return (
    <div className="flex flex-col items-center justify-center h-full gap-4 opacity-50">
      <div className="w-24 h-24 rounded-[2rem] theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-2xl flex items-center justify-center mb-4">
        <span className="material-symbols-outlined !text-[48px] text-[var(--text)] opacity-50">{t("ui_icon_mason") || "construction"}</span>
      </div>
      <h2 className="text-2xl font-black uppercase tracking-widest text-[var(--text)]">{t("mason_unlinked")}</h2>
      <p className="text-sm font-bold uppercase tracking-widest text-[var(--subtext)] opacity-60">{t("mason_unlinked_desc")}</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full pb-48 relative">
      <ViewHeader 
        title={t("mason_title")} 
        subtitle={t("mason_subtitle")} 
        icon={t("ui_icon_mason") || "construction"} 
        iconColorClass="text-amber-400 border-amber-500/30" 
      >
        <div className="flex items-center theme-glass-panel rounded-2xl p-1 border border-white/10 shadow-inner">
          <button 
            onClick={() => handleOpenMasonProfile && handleOpenMasonProfile(masonProfile.id)}
            className="h-12 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 text-[var(--text)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)] border border-transparent font-black"
          >
            <span className="material-symbols-outlined text-xl normal-case">{t("ui_icon_visibility") || "visibility"}</span>
            <span className="text-[10px] font-black uppercase tracking-widest">{t("masonhub_btn_view_profile") || "VIEW PROFILE"}</span>
          </button>
          
          <div className="w-px h-6 bg-white/10 mx-2" />
          
          <button 
            onClick={() => setIsNotepadOpen(true)}
            className="h-12 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 text-[var(--text)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)] border border-transparent font-black"
          >
            <span className="material-symbols-outlined text-xl normal-case">{t("ui_icon_document") || "description"}</span>
            <span className="text-[10px] font-black uppercase tracking-widest">{t("ui_btn_notepad") || "NOTEPAD"}</span>
          </button>

          <div className="w-px h-6 bg-white/10 mx-2" />
          
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="h-12 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 text-[var(--text)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)] border border-transparent font-black"
          >
            <span className="material-symbols-outlined text-xl normal-case">{t("ui_icon_settings") || "settings"}</span>
            <span className="text-[10px] font-black uppercase tracking-widest">{t("ui_btn_settings") || "SETTINGS"}</span>
          </button>
        </div>
      </ViewHeader>
      
      <div className="flex flex-col gap-1 w-full mb-4">
        <div className="flex items-center gap-1 overflow-x-auto accent-scrollbar p-1 theme-glass-panel rounded-2xl border border-white/5 shadow-inner">
          <HubTabButton id="command_center" icon={t("ui_icon_pc") || "desktop_windows"} label={(t("mason_tab_command_screen") || "COMMAND SCREEN").replace(/^[^\w]*/, '').trim()} activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="registry" icon={t("ui_icon_artifact_card") || "deployed_code"} label={(t("mason_tab_registry") || "ARTIFACTS").replace(/^[^\w]*/, '').trim()} activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="cc_sets" icon={t("ui_icon_collections_card") || "collections_bookmark"} label={(t("mason_tab_cc") || "Collections").replace(/^[^\w]*/, '').trim()} activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="marketplace" icon={t("ui_icon_hub") || "storefront"} label={(t("mason_tab_marketplace") || "The Nexus").replace(/^[^\w]*/, '').trim()} activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="bug_reports" icon={t("ui_icon_bug") || "bug_report"} label={(t("mason_tab_bug_reports") || "BUG REPORTS").replace(/^[^\w]*/, '').trim()} activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="protocols" icon={t("ui_icon_link") || "link"} label={(t("masonhub_protocols_tab") || "PROTOCOLS").replace(/^[^\w]*/, '').trim()} activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="structure" icon={t("ui_icon_architecture") || "architecture"} label={(t("masonhub_structures_tab") || "STRUCTURE").replace(/^[^\w]*/, '').trim()} activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="conflicts" icon={t("ui_icon_security") || "security"} label={(t("masonhub_tab_conflicts") || "CONFLICTS").replace(/^[^\w]*/, '').trim()} activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="posts" icon={t("ui_icon_edit_document") || "edit_document"} label={(t("mason_tab_posts") || "POSTS").replace(/^[^\w]*/, '').trim()} activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="sandbox" icon={t("ui_icon_sandbox") || "handyman"} label={(t("mason_tab_sandbox") || "SANDBOX").replace(/^[^\w]*/, '').trim()} activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="ide" icon={t("ui_icon_code") || "code"} label={(t("masonhub_ide_tab") || "IDE").replace(/^[^\w]*/, '').trim()} activeTab={activeTab} setTab={setActiveTab} />
        </div>
      </div>

      <div className="w-full pr-4">
        {activeTab === "command_center" && <MasonCommandScreen onNavigate={setActiveTab} masonId={masonProfile.id} session={session} onOpenRecentReplies={() => setIsRecentRepliesOpen(true)} onOpenSupportDesk={() => setIsSupportDeskOpen(true)} setViewingPost={setViewingPost} />}
        {activeTab === "registry" && <MasonRegistry masonId={masonProfile.id} />}
        {activeTab === "cc_sets" && <MasonCCSetBuilder masonId={masonProfile.id} masonName={masonProfile.name} />}
        {activeTab === "bug_reports" && <MasonBugReports masonId={masonProfile?.id} />}
        {activeTab === "marketplace" && <MasonMarketplace masonProfile={masonProfile} />}
        {activeTab === "protocols" && <ProtocolVisualizer masonId={masonProfile.id} isArchitect={false} />}
        {activeTab === "structure" && <StructureVisualizer masonId={masonProfile.id} isArchitect={false} />}
        {activeTab === "posts" && <MasonPostsEditor masonId={masonProfile.id} masonProfileId={masonProfile.profile_id} handleOpenMasonProfile={handleOpenMasonProfile} />} 
        {activeTab === "sandbox" && <MasonSandbox masonId={masonProfile.id} initialSandboxMod={sandboxMod} onClear={clearSandboxMod} vaultPath={vaultPath} />}
        {activeTab === "conflicts" && <MasonConflictsManager masonId={masonProfile.id} />}
        {activeTab === "ide" && <MasonIDE vaultPath={vaultPath} />}
      </div>

      <SidePanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        title={t("masonhub_settings_title") || "MASON SETTINGS"}
        icon={t("ui_icon_settings") || "settings"}
        widthClass="w-[450px]"
      >
        <MasonSettings profile={masonProfile} onUpdate={setMasonProfile} />
      </SidePanel>

      <MasonNotepadSidePanel isOpen={isNotepadOpen} onClose={() => setIsNotepadOpen(false)} />
      <MasonRecentRepliesSidePanel 
        isOpen={isRecentRepliesOpen} 
        onClose={() => setIsRecentRepliesOpen(false)} 
        masonId={masonProfile.id} 
        userProfileId={session?.user?.id}
        onReplyClick={async (postId, replyId) => {
          const { data } = await supabase.from('mason_posts').select('*').eq('id', postId).single();
          if (data) {
             setViewingPost({ ...data, scrollToCommentId: replyId });
          }
        }}
      />
      {session?.user?.id && <CitizenTicketsSidePanel isOpen={isSupportDeskOpen} onClose={() => setIsSupportDeskOpen(false)} userId={session.user.id} />}
      {viewingPost && <MasonPostViewer post={viewingPost} onClose={() => setViewingPost(null)} userId={session?.user?.id || masonProfile.id} onOpenMasonProfile={handleOpenMasonProfile} onAssetClick={(type, id) => setActiveAsset({type, id})} />}
      {activeAsset && <AssetPreviewSidebar assetType={activeAsset.type} assetId={activeAsset.id} onClose={() => setActiveAsset(null)} />}
    </div>
  );
}

function DashboardStatTile({ icon, number, label, colorClass, onClick }: any) {
  return (
    <div onClick={onClick} className={`flex-1 flex flex-col justify-center items-start gap-1 p-6 rounded-3xl border border-white/10 backdrop-blur-[3px] ${colorClass} transition-all cursor-pointer shadow-lg relative overflow-hidden group hover:-translate-y-1 hover:shadow-xl`}>
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
  const [stats, setStats] = useState({ artifacts: 0, ccSets: 0, posts: 0, bugs: 0, support: 0, followers: 0 });

  useEffect(() => {
    const fetchCounts = async () => {
      // Recent Replies
      const { count: rc } = await supabase.from("mason_post_comments").select("*", { count: 'exact', head: true });
      if (rc !== null) setRepliesCount(rc);
      
      // Artifacts (Mods + Blueprints)
      const { count: mc } = await supabase.from("mods").select("*", { count: 'exact', head: true }).eq('mason_id', masonId);
      const { count: bc } = await supabase.from("blueprints").select("*", { count: 'exact', head: true }).eq('mason_id', masonId);
      
      // CC Sets
      const { count: cc } = await supabase.from("cc_sets").select("*", { count: 'exact', head: true }).eq('mason_id', masonId);
      
      // Comm Posts
      const { count: pc } = await supabase.from("mason_posts").select("*", { count: 'exact', head: true }).eq('mason_id', masonId);

      // Followers
      const { count: fc } = await supabase.from("mason_followers").select("*", { count: 'exact', head: true }).eq('mason_id', masonId);
      
      // Bug Reports & Support Tickets (both use sanctuary_tickets table)
      let bugc = 0;
      let tc = 0;
      
      if (session?.user?.id) {
        const { count } = await supabase.from("sanctuary_tickets").select("*", { count: 'exact', head: true }).eq('author_id', session.user.id);
        if (count !== null) tc = count;
      }

      if (masonId) {
          const { data: allTickets } = await supabase.from('sanctuary_tickets').select('*');
          if (allTickets) {
              let filtered = allTickets.filter(t => t.ticket_type?.toLowerCase().includes('bug'));
              
              const { data: modsData } = await supabase.from('mods').select('id').eq('mason_id', masonId);
              let masonModIds: string[] = [];
              if (modsData) masonModIds = modsData.flatMap(m => [m.id]).filter(Boolean);

              filtered = filtered.filter(t => {
                  if (session?.user?.id && t.author_id === session.user.id) return true;
                  if (t.metadata?.mason_id === masonId || t.metadata?.target_mason === masonId) return true;
                  if (t.metadata?.target_mod_id && masonModIds.includes(t.metadata.target_mod_id)) return true;
                  return false;
              });
              bugc = filtered.length;
          }
      }
      
      setStats({
        artifacts: mc || 0,
        ccSets: cc || 0,
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
      const { data } = await supabase.from('system_broadcasts')
        .select('*')
        .in('target_audience', ['All', 'Mason', 'all', 'mason'])
        .order('created_at', { ascending: false })
        .limit(3);
      
      if (data) setBroadcasts(data);
    };
    fetchBroadcasts();
  }, []);

  return (
    <div className="flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full pr-4 pb-32 mt-8">
      {/* Stat Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 w-full">
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("ui_icon_artifact_card") || "inventory_2"}</span>} number={stats.artifacts} label={t("mason_stat_artifacts") || "MY ARTIFACTS"} colorClass="border-blue-500/30 text-blue-500 hover:border-blue-500 bg-blue-500/10 hover:bg-blue-500/20" onClick={() => onNavigate("registry")} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("ui_icon_collections_card") || "collections_bookmark"}</span>} number={stats.ccSets} label={t("mason_stat_cc") || "CC SETS"} colorClass="border-amber-500/30 text-amber-500 hover:border-amber-500 bg-amber-500/10 hover:bg-amber-500/20" onClick={() => onNavigate("cc_sets")} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("ui_icon_edit_document") || "edit_document"}</span>} number={stats.posts} label={t("mason_stat_posts") || "COMM POSTS"} colorClass="border-emerald-500/30 text-emerald-500 hover:border-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20" onClick={() => onNavigate("posts")} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("ui_icon_bug") || "bug_report"}</span>} number={stats.bugs} label={t("mason_stat_bugs") || "BUG REPORTS"} colorClass="border-rose-500/30 text-rose-500 hover:border-rose-500 bg-rose-500/10 hover:bg-rose-500/20" onClick={() => onNavigate("bug_reports")} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("ui_icon_forum") || "forum"}</span>} number={repliesCount} label={t("mason_stat_replies") || "RECENT REPLIES"} colorClass="border-indigo-500/30 text-indigo-500 hover:border-indigo-500 bg-indigo-500/10 hover:bg-indigo-500/20" onClick={onOpenRecentReplies} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("ui_icon_local_activity") || "local_activity"}</span>} number={stats.support} label={t("mason_stat_support") || "SUPPORT DESK"} colorClass="border-pink-500/30 text-pink-500 hover:border-pink-500 bg-pink-500/10 hover:bg-pink-500/20" onClick={onOpenSupportDesk} />
      </div>

      <div className="flex flex-col lg:flex-row gap-8 w-full">
        {/* Left Column - Wayfinder Comms */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] mb-6 shrink-0">{t("wayfinder_comms") || "WAYFINDER COMMS"}</h2>
          
             <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 w-full">
               {broadcasts.length > 0 ? broadcasts.map((post, index) => {
                 const isFeatured = index === 0;
                 return (
                 <div key={post.id} onClick={() => setViewingPost({ ...post, content: post.message, mason_id: 'system', views: 0, likes: 0, replies: 0 })} className={`group cursor-pointer w-full theme-glass-panel rounded-[2rem] overflow-hidden hover:scale-[1.01] transition-all shadow-xl hover:shadow-[0_0_30px_rgba(var(--accent-rgb),0.3)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[var(--accent)]/50 flex flex-col ${isFeatured ? 'xl:flex-row xl:col-span-2 min-h-[16rem] xl:min-h-[18rem]' : 'min-h-[10rem]'}`}>
                   {isFeatured && (
                     <div className="w-full relative overflow-hidden bg-[var(--bg)] border-b xl:w-1/2 xl:border-b-0 xl:border-r border-[color-mix(in_srgb,var(--text)_5%,transparent)] flex items-center justify-center">
                        <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/10 to-transparent" />
                        <span className="material-symbols-outlined !text-6xl grayscale opacity-30 drop-shadow-lg group-hover:scale-110 group-hover:opacity-100 transition-all duration-500 group-hover:grayscale-0">{t("ui_icon_satellite") || "satellite_alt"}</span>
                     </div>
                   )}
                   <div className="flex-1 p-8 flex flex-col min-w-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--bg)_40%,transparent)] to-transparent relative z-10">
                      <div className="flex items-center gap-2 mb-4 shrink-0 flex-wrap">
                        <span className="px-3 py-1 bg-[var(--accent)]/20 text-[var(--accent)] text-[9px] font-black uppercase tracking-widest rounded-lg">{post.category || t("wayfinder_update") || "UPDATE"}</span>
                        <span className="px-3 py-1 theme-glass-inner text-[var(--text)] text-[9px] font-black uppercase tracking-widest rounded-lg">{t("wayfinder_system") || "SYSTEM"}</span>
                      </div>
                      <h3 className="text-xl font-black uppercase tracking-widest text-[var(--text)] group-hover:text-[var(--accent)] transition-colors mb-4 leading-normal line-clamp-2">{post.title}</h3>
                      {isFeatured && <p className="text-xs text-[var(--subtext)] leading-relaxed font-bold opacity-80 mb-6 line-clamp-3">{post.message}</p>}
                      <div className="mt-auto flex items-center justify-between pt-6 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] shrink-0">
                         <span className="text-[10px] font-black uppercase tracking-widest opacity-50 text-[var(--subtext)] flex items-center gap-2"><span className="material-symbols-outlined !text-[12px]">{t("ui_icon_calendar_today") || "calendar_today"}</span> {new Date(post.created_at).toLocaleDateString()}</span>
                         <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] opacity-0 group-hover:opacity-100 transition-all flex items-center gap-2 text-[var(--accent)]">{t("wayfinder_read_more") || "READ MORE"} <span className="material-symbols-outlined !text-lg">{t('arrow_forward') || 'arrow_forward'}</span></span>
                       </div>
                    </div>
                 </div>
                 );
               }) : (
                 <div className="w-full xl:col-span-2 theme-glass-panel rounded-[2rem] p-12 text-center text-[var(--subtext)] opacity-50 uppercase font-black text-sm tracking-widest border border-dashed border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                   {t("system_no_broadcasts") || "NO RECENT BROADCASTS"}
                 </div>
               )}
             </div>

             <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] mt-4 mb-2 shrink-0">{t("hub_metrics") || "HUB METRICS"}</h2>
             <div className="grid grid-cols-2 md:grid-cols-5 gap-4 w-full">
                <div className="theme-glass-panel border border-white/5 rounded-3xl p-6 flex flex-col items-center justify-center gap-3 shadow-lg hover:bg-white/5 hover:border-orange-500/30 transition-all text-center h-32">
                   <span className="text-3xl font-black text-orange-500">7</span>
                   <span className="text-[9px] font-black uppercase tracking-widest opacity-70 text-[var(--subtext)] leading-tight">{t("hub_stat_artifacts_linked") || "ARTIFACTS LINKED"}</span>
                </div>
                <div className="theme-glass-panel border border-white/5 rounded-3xl p-6 flex flex-col items-center justify-center gap-3 shadow-lg hover:bg-white/5 hover:border-blue-500/30 transition-all text-center h-32">
                   <span className="text-3xl font-black text-blue-500">1</span>
                   <span className="text-[9px] font-black uppercase tracking-widest opacity-70 text-[var(--subtext)] leading-tight">{t("hub_stat_blueprints_uploaded") || "BLUEPRINTS UPLOADED"}</span>
                </div>
                <div className="theme-glass-panel border border-white/5 rounded-3xl p-6 flex flex-col items-center justify-center gap-3 shadow-lg hover:bg-white/5 hover:border-indigo-500/30 transition-all text-center h-32">
                   <span className="text-3xl font-black text-indigo-500">1</span>
                   <span className="text-[9px] font-black uppercase tracking-widest opacity-70 text-[var(--subtext)] leading-tight">{t("hub_stat_lexicons") || "LEXICONS"}</span>
                </div>
                <div className="theme-glass-panel border border-white/5 rounded-3xl p-6 flex flex-col items-center justify-center gap-3 shadow-lg hover:bg-white/5 hover:border-pink-500/30 transition-all text-center h-32">
                   <span className="text-3xl font-black text-pink-500">1</span>
                   <span className="text-[9px] font-black uppercase tracking-widest opacity-70 text-[var(--subtext)] leading-tight">{t("hub_stat_chameleons") || "CHAMELEONS"}</span>
                </div>
                <div className="theme-glass-panel border border-white/5 rounded-3xl p-6 flex flex-col items-center justify-center gap-3 shadow-lg hover:bg-white/5 hover:border-emerald-500/30 transition-all text-center h-32">
                   <span className="text-3xl font-black text-emerald-500">{stats.followers}</span>
                   <span className="text-[9px] font-black uppercase tracking-widest opacity-70 text-[var(--subtext)] leading-tight">{t("hub_stat_followers") || "FOLLOWER COUNT"}</span>
                </div>
             </div>
          </div>
        
        {/* Right Column - Quick Links */}
        <div className="w-[380px] shrink-0 flex flex-col">
          <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] mb-6">{t("hub_quick_links") || "QUICK LINKS"}</h2>
          <div className="flex flex-col gap-4">
             <button onClick={() => onNavigate("protocols")} className="w-full p-6 theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-[1.5rem] hover:bg-white/5 hover:border-[var(--accent)]/50 hover:shadow-[0_0_40px_rgba(var(--accent-rgb),0.1)] transition-all text-left group relative overflow-hidden h-24">
               <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 group-hover:-translate-x-full duration-1000 transition-all ease-in-out" />
               <div className="flex items-center gap-5 h-full">
                 <div className="w-12 h-12 rounded-xl theme-glass-inner border border-white/10 flex items-center justify-center shrink-0 group-hover:border-[var(--accent)]/30 transition-colors">
                   <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]">{t("ui_icon_link") || "link"}</span>
                 </div>
                 <div className="flex flex-col gap-1 flex-1 min-w-0">
                   <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--text)] group-hover:text-[var(--accent)] transition-colors truncate">{t("hub_ql_protocol") || "PROTOCOL ORCHESTRATOR"}</h3>
                   <span className="text-[8px] uppercase font-bold text-blue-400 opacity-80 group-hover:text-blue-300 tracking-widest flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]"></span> {t("hub_ql_global_rules") || "RULES & CONDITIONS"}</span>
                 </div>
               </div>
             </button>

             <button onClick={() => onNavigate("structure")} className="w-full p-6 theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-[1.5rem] hover:bg-white/5 hover:border-[var(--accent)]/50 hover:shadow-[0_0_40px_rgba(var(--accent-rgb),0.1)] transition-all text-left group relative overflow-hidden h-24">
               <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 group-hover:-translate-x-full duration-1000 transition-all ease-in-out" />
               <div className="flex items-center gap-5 h-full">
                 <div className="w-12 h-12 rounded-xl theme-glass-inner border border-white/10 flex items-center justify-center shrink-0 group-hover:border-[var(--accent)]/30 transition-colors">
                   <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]">{t("ui_icon_architecture") || "architecture"}</span>
                 </div>
                 <div className="flex flex-col gap-1 flex-1 min-w-0">
                   <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--text)] group-hover:text-[var(--accent)] transition-colors truncate">{t("structure_title") || "STRUCTURE MATRIX"}</h3>
                   <span className="text-[8px] uppercase font-bold text-amber-400 opacity-80 group-hover:text-amber-300 tracking-widest flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]"></span> {t("hub_ql_asset_org") || "METADATA MATRIX"}</span>
                 </div>
               </div>
             </button>

             <button onClick={() => onNavigate("conflicts")} className="w-full p-6 theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-[1.5rem] hover:bg-white/5 hover:border-[var(--accent)]/50 hover:shadow-[0_0_40px_rgba(var(--accent-rgb),0.1)] transition-all text-left group relative overflow-hidden h-24">
               <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 group-hover:-translate-x-full duration-1000 transition-all ease-in-out" />
               <div className="flex items-center gap-5 h-full">
                 <div className="w-12 h-12 rounded-xl theme-glass-inner border border-white/10 flex items-center justify-center shrink-0 group-hover:border-[var(--accent)]/30 transition-colors">
                   <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]">{t("ui_icon_security") || "security"}</span>
                 </div>
                 <div className="flex flex-col gap-1 flex-1 min-w-0">
                   <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--text)] group-hover:text-[var(--accent)] transition-colors truncate">{t("hub_ql_conflict") || "CONFLICT MATRIX"}</h3>
                   <span className="text-[8px] uppercase font-bold text-rose-400 opacity-80 group-hover:text-rose-300 tracking-widest flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.8)]"></span> {t("hub_ql_logical_issues") || "RESOLUTION CENTER"}</span>
                 </div>
               </div>
             </button>

             <button onClick={() => onNavigate("sandbox")} className="w-full p-6 theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-[1.5rem] hover:bg-white/5 hover:border-[var(--accent)]/50 hover:shadow-[0_0_40px_rgba(var(--accent-rgb),0.1)] transition-all text-left group relative overflow-hidden h-24">
               <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 group-hover:-translate-x-full duration-1000 transition-all ease-in-out" />
               <div className="flex items-center gap-5 h-full">
                 <div className="w-12 h-12 rounded-xl theme-glass-inner border border-white/10 flex items-center justify-center shrink-0 group-hover:border-[var(--accent)]/30 transition-colors">
                   <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]">{t("ui_icon_sandbox") || "handyman"}</span>
                 </div>
                 <div className="flex flex-col gap-1 flex-1 min-w-0">
                    <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--text)] group-hover:text-[var(--accent)] transition-colors truncate">{t("sandbox_title") || "SANDBOX SYNC"}</h3>
                    <span className="text-[8px] uppercase font-bold text-emerald-400 opacity-80 group-hover:text-emerald-300 tracking-widest flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></span> {t("masonhub_sandbox_sub") || "TESTING GROUNDS"}</span>
                 </div>
               </div>
             </button>

             <button onClick={() => onNavigate("ide")} className="w-full p-6 theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-[1.5rem] hover:bg-white/5 hover:border-[var(--accent)]/50 hover:shadow-[0_0_40px_rgba(var(--accent-rgb),0.1)] transition-all text-left group relative overflow-hidden h-24">
               <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 group-hover:-translate-x-full duration-1000 transition-all ease-in-out" />
               <div className="flex items-center gap-5 h-full">
                 <div className="w-12 h-12 rounded-xl theme-glass-inner border border-white/10 flex items-center justify-center shrink-0 group-hover:border-[var(--accent)]/30 transition-colors">
                   <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]">{t("ui_icon_code") || "code"}</span>
                 </div>
                 <div className="flex flex-col gap-1 flex-1 min-w-0">
                   <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--text)] group-hover:text-[var(--accent)] transition-colors truncate">{t("masonhub_ide_title") || "MASON IDE"}</h3>
                   <span className="text-[8px] uppercase font-bold text-indigo-400 opacity-80 group-hover:text-indigo-300 tracking-widest flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]"></span> {t("masonhub_ide_sub") || "DEVELOPMENT"}</span>
                 </div>
               </div>
             </button>
          </div>
        </div>
      </div>
    </div>
  );
}


function MasonCCSetBuilder({ masonId, masonName }: { masonId: string, masonName: string }) {
  const { t } = useLexicon();
  const [sets, setSets] = useState<any[]>([]);
  const [activeSet, setActiveSet] = useState<any | null>(null);
  const [myMods, setMyMods] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [newSetName, setNewSetName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isForgePanelOpen, setIsForgePanelOpen] = useState(false);
  const [setTier, setSetTier] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [tierFilter, setTierFilter] = useState("ALL");

  const fetchSets = async () => {
    const { data } = await supabase.from('cc_sets').select('*').eq('mason_id', masonId).order('name');
    if (data) setSets(data);
  };

  const fetchMyMods = async () => {
    const { data } = await supabase.from('mods').select('id, name, image_url, category_override').eq('mason_id', masonId).order('name');
    if (data) setMyMods(data);
  };

  const fetchMembers = async (setId: string) => {
    const { data } = await supabase.from('cc_set_members').select('id, mod_id, mods(id, name, image_url, status, category_override, created_at, mason_id, master_author, file_extension)').eq('set_id', setId);
    if (data) setMembers(data);
  };

  useEffect(() => {
    fetchSets();
    fetchMyMods();
  },[]);

  const handleCreateSet = async (e?: React.FormEvent) => {
    if(e) e.preventDefault();
    if (!newSetName.trim()) return;
    const { data, error } = await supabase.from('cc_sets').insert([{ 
      name: newSetName.trim(), 
      creator_name: masonName, 
      mason_id: masonId,
      is_official: true,
      compliance_tier: setTier
    }]).select().single();
    
    if (!error && data) {
      setSets(prev => [...prev, data].sort((a,b) => a.name.localeCompare(b.name)));
      setNewSetName("");
      setSetTier(0);
      setIsForgePanelOpen(false);
    }
  };

  const handleSaveSetMeta = async () => {
    if (!activeSet) return;
    setIsSaving(true);
      await supabase.from('cc_sets').update({ 
        name: activeSet.name, 
        image_url: activeSet.image_url,
        url: activeSet.url
      }).eq('id', activeSet.id);
    fetchSets();
    setIsSaving(false);
  };

  const handleAddMod = async (modId: string) => {
    if (!activeSet) return;
    await supabase.from('cc_set_members').upsert({ set_id: activeSet.id, mod_id: modId });
    fetchMembers(activeSet.id);
  };

  const handleRemoveMod = async (memberId: string) => {
    await supabase.from('cc_set_members').delete().eq('id', memberId);
    fetchMembers(activeSet.id);
  };

  const handleDeleteSet = async () => {
    if (!activeSet) return;
    setIsSaving(true);
    await supabase.from('cc_set_members').delete().eq('set_id', activeSet.id);
    await supabase.from('cc_sets').delete().eq('id', activeSet.id);
    setActiveSet(null);
    setMembers([]);
    fetchSets();
    setIsSaving(false);
  };

  const filteredSets = sets.filter((s: any) => {
      if (tierFilter !== "ALL" && s.compliance_tier !== parseInt(tierFilter)) return false;
      return s.name?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div className="flex flex-col h-full overflow-hidden animate-in fade-in pb-20">
      
      <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-white/5">
        <h2 className="text-xl font-black text-[var(--text)] uppercase tracking-widest flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("ui_icon_collections_card") || "collections_bookmark"}</span>
          </div>
          <span className="truncate">{t("mason_title_collections") || "YOUR COLLECTIONS"}</span>
        </h2>
        <div className="flex items-center gap-3 relative flex-1 ml-auto justify-end">
          <div className="relative flex-1 max-w-[300px]">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 !text-sm">{t("ui_icon_search") || "search"}</span>
            <input 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
              placeholder={t("registry_search_placeholder") || "Search..."} 
              className="w-full theme-glass-panel rounded-2xl pl-10 pr-10 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] hover:text-[var(--text)] transition-colors">
                <span className="material-symbols-outlined text-sm">{t("ui_icon_close") || "close"}</span>
              </button>
            )}
          </div>
          <div className="w-40 shrink-0 relative z-50 h-12">
             <CustomDropdown disableTint={true}  value={tierFilter} onChange={(v: string[]) => setTierFilter(v[0])} options={[{id: "ALL", label: "ALL TIERS"}, {id: "0", label: "TIER 0"}, {id: "1", label: "TIER 1"}, {id: "2", label: "TIER 2"}]} />
          </div>
          <button onClick={() => setIsForgePanelOpen(true)} className="h-12 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-105 shadow-lg font-black uppercase tracking-widest text-[10px] group">
            <span className="material-symbols-outlined !text-[16px] group-hover:rotate-90 transition-transform duration-500">{t("ui_icon_add") || "add"}</span> {t("forge_new_set") || "CREATE NEW SET"}
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-6 content-start pr-2">
          {filteredSets.length === 0 && <div className="p-4 col-span-full text-center text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("mason_cc_no_sets") || "NO SETS FOUND"}</div>}
          {filteredSets.map(setItem => (
              <CollectionCard 
                key={setItem.id} 
                setItem={setItem} 
                activeSetId={activeSet?.id} 
                onClick={() => { setActiveSet(setItem); fetchMembers(setItem.id); }} 
                masonNameFallback={masonName} 
              />
          ))}
        </div>
      </div>

      <SidePanel
        isOpen={isForgePanelOpen}
        onClose={() => setIsForgePanelOpen(false)}
        title={t("forge_new_set") || "CREATE NEW SET"}
        subtitle={t("mason_create_subtitle") || "Organize your mods"}
        icon="add_circle"
        footer={
          <div className="flex justify-end gap-4 w-full">
            <button type="button" onClick={() => setIsForgePanelOpen(false)} className={standardButtonClass}>
              {t("shared_cancel") || "Cancel"}
            </button>
            <button type="button" onClick={handleCreateSet} disabled={!newSetName.trim()} className={standardAccentGlassButtonClass}>
              {t("forge_init_set") || "CREATE SET"}
            </button>
          </div>
        }
      >
        <div className="flex flex-col h-full gap-8">
          <div className="flex flex-col gap-2">
            <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("forge_set_name") || "Set Name"}</label>
            <input value={newSetName} onChange={e => setNewSetName(e.target.value)} placeholder={t("forge_set_name") || "Set Name"} className="theme-glass-inner rounded-xl px-5 py-4 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all" />
          </div>
          
          <div className="flex flex-col gap-2">
            <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_col_safety") || "Compliance Tier"}</label>
            <CustomComplianceDropdown value={setTier} onChange={setSetTier} includeTier3={false} />
          </div>
        </div>
      </SidePanel>

      <SidePanel
        isOpen={!!activeSet}
        onClose={() => setActiveSet(null)}
        title={activeSet?.name || "UNNAMED SET"}
        subtitle={t("masonhub_manage_collection") || "MANAGE COLLECTION"}
        icon="library_books"
        footer={
          <div className="flex justify-end gap-4 w-full">
            <button type="button" onClick={handleDeleteSet} disabled={isSaving} className={standardDangerButtonClass}>
              {t("mason_cc_btn_delete_set") || "DELETE SET"}
            </button>
            <button type="button" onClick={handleSaveSetMeta} disabled={isSaving} className={standardAccentGlassButtonClass}>
              {isSaving ? (t("mason_cc_saving") || "SAVING...") : (t("mason_cc_save_set") || "SAVE COLLECTION")}
            </button>
          </div>
        }
      >
        {activeSet && (
          <div className="flex flex-col h-full gap-8">
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("mason_cc_cover_url") || "Cover Image URL"}</label>
                  <input value={activeSet.image_url || ""} onChange={e => setActiveSet({...activeSet, image_url: e.target.value})} placeholder={t("mason_cc_cover_url") || "Cover Image URL"} className="w-full theme-glass-inner rounded-xl px-4 h-12 text-[var(--text)] text-xs font-mono focus:outline-none focus:theme-border-accent transition-all" />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_url") || "External URL"}</label>
                  <input value={activeSet.url || ""} onChange={e => setActiveSet({...activeSet, url: e.target.value})} placeholder={t("dossier_external_url_placeholder") || "External URL..."} className="w-full theme-glass-inner rounded-xl px-4 h-12 text-[var(--text)] text-xs font-mono focus:outline-none focus:theme-border-accent transition-all" />
                </div>
              </div>

              <div className="h-[1px] bg-white/5 my-2 w-full" />

              <div className="flex flex-col gap-4 pb-12">
                <h4 className="text-[11px] font-black theme-text-accent uppercase tracking-widest">{t("registry_assets_title") || "SET CONTENTS"}</h4>
                
                <div className="flex flex-col gap-2 bg-black/10 p-4 rounded-2xl border border-white/5 relative z-[6000]">
                  <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder={t("mason_cc_search_assets") || "Search your mods..."} className="w-full theme-glass-inner rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" />
                  
                  {searchQuery.length >= 2 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--sidebar)] border border-white/10 rounded-2xl shadow-2xl z-[7000] overflow-hidden flex flex-col max-h-[250px] overflow-y-auto custom-scrollbar">
                      {myMods.filter(m => !members.some(mem => mem.mod_id === m.id) && m.name.toLowerCase().includes(searchQuery.toLowerCase())).map(m => (
                        <button type="button" key={m.id} onClick={() => { handleAddMod(m.id); setSearchQuery(""); }} className="w-full text-left px-5 py-3 hover:theme-panel-accent border-b border-white/5 flex justify-between items-center group transition-all shrink-0">
                          <span className="text-[10px] font-black text-[var(--text)] uppercase truncate">{m.name}</span>
                          <span className="text-[9px] font-bold text-[var(--subtext)] opacity-0 group-hover:opacity-100 uppercase transition-all">{t("mason_cc_btn_add") || "ADD"}</span>
                        </button>
                      ))}
                      {myMods.filter(m => !members.some(mem => mem.mod_id === m.id) && m.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                        <div className="px-5 py-4 text-center text-[10px] uppercase opacity-50 font-bold">{t("mason_cc_no_assets") || "NO MATCHING MODS"}</div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 mt-2">
                  <div className="flex items-center justify-between px-2">
                    <span className="text-[9px] uppercase tracking-widest text-[var(--subtext)] opacity-60">{t("mason_cc_in_set") || "CURRENT ASSETS"}</span>
                    <span className="theme-text-accent font-black text-xs">{members.length}</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      {members.map(mem => (
                        <ArtifactCard 
                          key={mem.id} 
                          mod={mem.mods} 
                          onClick={() => {}}
                          onRemove={(e) => handleRemoveMod(mem.id)}
                          masonsList={[]}
                        />
                      ))}
                    </div>
                    {members.length === 0 && (
                      <div className="p-8 text-center border border-dashed border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-[1.5rem] opacity-50 flex flex-col items-center gap-3">
                        <span className="material-symbols-outlined !text-[24px]">{t("ui_icon_inventory_2") || "inventory_2"}</span>
                        <span className="text-[10px] font-black uppercase tracking-[0.2em]">{t("mason_cc_no_assets_in_set") || "SET IS EMPTY"}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
        )}
      </SidePanel>
    </div>
  );
}

  function MasonRegistry({ masonId }: { masonId: string }) {
  const safeDate = (d: any) => { try { if (!d) return ""; const parsed = new Date(d); if (isNaN(parsed.getTime())) return ""; return parsed.toISOString().slice(0, 10); } catch { return ""; } };
  const { t } = useLexicon();
  const [myMods, setMyMods] = useState<any[]>([]);
  const [activeMod, setActiveMod] = useState<any | null>(null);
  const [cloudMods, setCloudMods] = useState<any[]>([]);
  const [isCommitting, setIsCommitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [activeSubType, setActiveSubType] = useState("ALL");

  const fetchData = async () => {
    const { data } = await supabase.from('mods').select('*, mod_versions(id, dna_hash, version_label, game_version)').eq('mason_id', masonId).order('name');
    if (data) setMyMods(data);
    const { data: cMods } = await fetchAllPaginated(() => supabase.from('mods').select('id, name, master_author, mason_id'));
    if (cMods) setCloudMods(cMods);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCommitChanges = async () => {
    if (!activeMod) return;
    setIsCommitting(true);
    try {
      await supabase.from('mods').update({
        name: activeMod.name,
        description: activeMod.description,
        image_url: activeMod.image_url,
        url: activeMod.url,
        allow_write: activeMod.allow_write,
        category_override: activeMod.category_override,
        sub_type: activeMod.sub_type,
        file_extension: activeMod.file_extension,
        status: activeMod.status,
        created_at: activeMod.created_at,
        updated_at: activeMod.updated_at,
        compatible_versions: activeMod.compatible_versions,
        family_slug: activeMod.family_slug,
        folder_structure: activeMod.folder_structure || []
      }).eq('id', activeMod.id);
      fetchData();
      useStore.getState().pushStatus(t("mason_saved_success"), 'success');
    } catch (err: any) { useStore.getState().pushStatus(`${t("mason_saved_error")}${err.message}`, 'error'); }
    setIsCommitting(false);
  };

  const filteredMods = myMods.filter(mod => {
    if (statusFilter !== "ALL" && mod.status !== statusFilter) return false;
    
    if (activeCategory !== "ALL") {
      const modCat = mod.category_override || "Script";
      if (modCat !== activeCategory) return false;
      
      if (activeCategory === "CAS" && activeSubType !== "ALL") {
        const modSub = mod.sub_type || "";
        if (modSub.toLowerCase() !== activeSubType.toLowerCase()) return false;
      }
    }

    if (searchTerm.toLowerCase() === 'nsfw') return mod.compliance_tier === 1;
    if (searchTerm.toLowerCase() === 'explicit') return mod.compliance_tier === 2;
    return (mod.name?.toLowerCase() || "").includes(searchTerm.toLowerCase()) || 
           (mod.id || "").toLowerCase().includes(searchTerm.toLowerCase());
  });

  const displayMods = filteredMods.slice(0, 50);

  return (
    <div className="flex flex-col gap-6 pb-20">
      <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-white/5">
        <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("ui_icon_artifact_card") || "deployed_code"}</span>
          </div>
          <span className="truncate">{t("mason_title_artifacts") || "MY ARTIFACTS"}</span>
        </h2>
        <div className="flex items-center gap-3 relative flex-1 ml-auto justify-end">
          <div className="relative flex-1 max-w-[300px]">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-sm opacity-50">{t("ui_icon_search") || "search"}</span>
            <input 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
              placeholder={t("registry_search_placeholder") || "Search ID or Name..."} 
              className="w-full theme-glass-panel rounded-2xl pl-10 pr-6 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] hover:text-[var(--text)] transition-colors">
                <span className="material-symbols-outlined text-sm">{t("ui_icon_close") || "close"}</span>
              </button>
            )}
          </div>
          <div className="w-40 shrink-0 relative z-50 h-12">
             <CustomDropdown disableTint={true}  value={statusFilter} onChange={(v: string[]) => setStatusFilter(v[0])} options={[{id: "ALL", label: "ALL STATUS"}, {id: "verified", label: "VERIFIED"}, {id: "unverified", label: "UNVERIFIED"}, {id: "broken", label: "BROKEN"}, {id: "deprecated", label: "DEPRECATED"}]} />
          </div>
        </div>
      </div>
      
      <div className="w-full p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-6 pr-2">
          {displayMods.map((mod: any) => (
              <ArtifactCard 
                key={mod.id} 
                mod={mod} 
                activeModId={activeMod?.id} 
                onClick={() => setActiveMod(mod)} 
              />
          ))}
        </div>
      </div>

      <SidePanel
        isOpen={!!activeMod}
        onClose={() => setActiveMod(null)}
        title={activeMod?.name || t("mason_unnamed_artifact") || "UNNAMED ARTIFACT"}
        subtitle={t("masonhub_manage_artifact_meta") || "MANAGE ARTIFACT METADATA"}
        icon="inventory_2"
        footer={
          <div className="flex justify-end gap-4 w-full">
            <button onClick={() => setActiveMod(null)} disabled={isCommitting} className={standardButtonClass}>
              {t("shared_cancel") || "Cancel"}
            </button>
            <button onClick={handleCommitChanges} disabled={isCommitting} className={standardAccentGlassButtonClass}>
              {isCommitting ? t("mason_saving") : t("mason_save_meta")}
            </button>
          </div>
        }
      >
        {activeMod && (
          <div className="flex flex-col h-full gap-8">
            <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_class")}</label>
                <CustomClassificationDropdown value={activeMod.category_override || "Script"} onChange={(val: string) => setActiveMod({...activeMod, category_override: val})} />
              </div>
              
              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("masonhub_sub_classification")}</label>
                <input value={activeMod.sub_type || ""} onChange={e => setActiveMod({...activeMod, sub_type: e.target.value})} placeholder={t("masonhub_sub_classification_placeholder")} className="theme-glass-inner rounded-xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" />
              </div>
              
              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("sandbox_label_file_ext") || "FILE EXTENSION"}</label>
                <input value={activeMod.file_extension || ""} onChange={e => setActiveMod({...activeMod, file_extension: e.target.value})} placeholder={t("sandbox_placeholder_file_ext") || "e.g. .package, .zip"} className="theme-glass-inner rounded-xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" />
              </div>
              
              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_url")}</label>
                <input value={activeMod.url || ""} onChange={e => setActiveMod({...activeMod, url: e.target.value})} className="theme-glass-inner rounded-xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_desc")}</label>
                <textarea value={activeMod.description || ""} onChange={e => setActiveMod({...activeMod, description: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-4 text-[var(--text)] text-sm font-bold min-h-[150px] custom-scrollbar resize-none focus:outline-none focus:theme-border-accent" />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_image")}</label>
                <input value={activeMod.image_url || ""} onChange={e => setActiveMod({...activeMod, image_url: e.target.value})} className="theme-glass-inner rounded-xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("masonhub_condition_protocol") || "Condition Protocol"}</label>
                <MasonStatusDropdown value={activeMod.status || "unverified"} onChange={(newStatus: string) => setActiveMod({...activeMod, status: newStatus})} />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("masonhub_uploaded_date") || "UPLOADED DATE"}</label>
                <div className="w-full">
                  <CustomDatePicker value={activeMod.created_at || null} onChange={date => setActiveMod({...activeMod, created_at: date})} />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("masonhub_updated_date") || "LAST UPDATED"}</label>
                <div className="w-full">
                  <CustomDatePicker value={activeMod.updated_at || null} onChange={date => setActiveMod({...activeMod, updated_at: date})} />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("masonhub_game_versions") || "GAME VERSIONS"}</label>
                <GameVersionMultiSelect selectedVersions={activeMod.compatible_versions || []} onChange={(v) => setActiveMod({...activeMod, compatible_versions: v})} />
              </div>
            </div>
        )}
      </SidePanel>
    </div>
  );
}

function CustomClassificationDropdown({ value, onChange }: any) {
  const { t } = useLexicon();
  const options =[{ id: 'Script', label: t("class_dd_script") }, { id: 'BuildBuy', label: t("class_dd_buildbuy") }, { id: 'CAS', label: t("class_dd_cas") }, { id: 'Animation', label: t("class_dd_animation") }];
  return <CustomDropdown disableTint={true}  value={value} options={options} onChange={(v: string[]) => onChange(v[0])} placeholder={t("mason_label_select") || "Select..."} />;
}

function MasonPostsEditor({ masonId, masonProfileId, handleOpenMasonProfile }: { masonId: string, masonProfileId: string, handleOpenMasonProfile?: (masonId: string, postId?: string) => void }) {
  const { t } = useLexicon();
  const [posts, setPosts] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [previewPost, setPreviewPost] = useState<any>(null);
  const [codeSnippet, setCodeSnippet] = useState("");
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [showImageInput, setShowImageInput] = useState(false);
  const [inlineImageUrl, setInlineImageUrl] = useState("");
  
  const [assets, setAssets] = useState<any[]>([]);
  const [masonName, setMasonName] = useState<string>("");
  const [isAssetPanelOpen, setIsAssetPanelOpen] = useState(false);
  const [assetSearchQuery, setAssetSearchQuery] = useState("");
  const [activeAsset, setActiveAsset] = useState<{ type: string; id: string } | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [isPinned, setIsPinned] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown,
      Image
    ],
    content: content,
    onUpdate: ({ editor }) => {
      setContent((editor.storage as any).markdown.getMarkdown());
    },
    editorProps: {
      attributes: {
        class: 'w-full flex-1 px-6 py-6 text-[var(--text)] text-sm font-sans focus:outline-none custom-scrollbar min-h-[350px] leading-relaxed [&_h1]:text-2xl [&_h1]:font-black [&_h2]:text-xl [&_h2]:font-bold [&_p]:mb-4 [&_ul]:list-disc [&_ul]:ml-6 [&_ol]:list-decimal [&_ol]:ml-6 [&_a]:text-[var(--accent)] [&_img]:rounded-xl [&_img]:max-w-full [&_code]:bg-white/10 [&_code]:px-1 [&_code]:rounded',
      },
    },
  });

  const fetchPostsAndAssets = async () => {
    const { data } = await supabase.from('mason_posts').select('*, masons(*)').eq('mason_id', masonId).order('created_at', { ascending: false });
    if (data) setPosts(data);
    
    const { data: masonData } = await supabase.from('masons').select('name').eq('id', masonId).single();
    if (masonData?.name) setMasonName(masonData.name);
    const mName = masonData?.name || '';
    
    const { data: modsData } = await supabase.from('mods').select('id, name').eq('mason_id', masonId);
    const { data: marketAssetsData } = await supabase.from('marketplace_assets').select('id, name, asset_type').eq('author', mName);
    const { data: blueprintsData } = await supabase.from('blueprints').select('id, name').eq('mason_id', masonId);
    
    let combinedAssets: any[] = [];
    if (modsData) combinedAssets.push(...modsData.map(m => ({ id: m.id, name: m.name, type: 'mod' })));
    if (blueprintsData) combinedAssets.push(...blueprintsData.map(b => ({ id: b.id, name: b.name, type: 'blueprint' })));
    if (marketAssetsData) combinedAssets.push(...marketAssetsData.map(a => ({ id: a.id, name: a.name, type: a.asset_type })));
    setAssets(combinedAssets);
  };

  useEffect(() => { fetchPostsAndAssets(); },[]);

  const handleInsertText = (prefix: string, suffix: string = "") => {
    // Legacy fallback, most buttons use editor.chain() now
    if (editor) {
      editor.chain().focus().insertContent(prefix + suffix).run();
    }
  };

  const handleLinkAsset = (asset: any) => {
    const linkStr = `asset://${asset.type}/${asset.id}`;
    
    // Safely fallback if key isn't in lexicon yet
    const typeKey = `masonhub_asset_type_${asset.type}`;
    const translatedType = t(typeKey) !== typeKey ? t(typeKey) : (asset.type === 'mod' ? 'Artifact' : asset.type === 'blueprint' ? 'Blueprint' : asset.type === 'chameleon' ? 'Theme' : 'Lexicon');
    const translatedView = t("ui_btn_view") !== "ui_btn_view" ? t("ui_btn_view") : "VIEW";
    
    const text = `${translatedType}: ${asset.name}`;
    
    if (editor) {
      editor.chain().focus()
        .insertContent({
          type: 'text',
          text: text,
          marks: [{ type: 'link', attrs: { href: linkStr } }]
        })
        .insertContent(' ')
        .run();
    }
    
    setIsAssetPanelOpen(false);
    setAssetSearchQuery("");
  };

  const filteredAssets = assets.filter(a => a.name.toLowerCase().includes(assetSearchQuery.toLowerCase()));

  const openEditor = (post?: any) => {
    setViewMode('edit');
    if (post) {
      setEditingPostId(post.id);
      setTitle(post.title);
      setCodeSnippet(post.code_snippet || "");
      setShowCodeInput(!!post.code_snippet);
      setIsPinned(!!post.is_pinned);
      let rawContent = post.content || '';
      let parsedImage = post.image_url || "";
      if (rawContent.startsWith('[IMG:')) {
        const endIdx = rawContent.indexOf(']');
        if (endIdx !== -1) {
          parsedImage = rawContent.substring(5, endIdx);
          rawContent = rawContent.substring(endIdx + 1).trim();
        }
      }
      setContent(rawContent);
      if (editor) {
        editor.commands.setContent(rawContent);
      }
      setImageUrl(parsedImage);
    } else {
      setEditingPostId(null);
      setTitle("");
      setContent("");
      if (editor) {
        editor.commands.setContent("");
      }
      setImageUrl("");
      setCodeSnippet("");
      setShowCodeInput(false);
      setIsPinned(false);
    }
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    setIsEditorOpen(false);
    setEditingPostId(null);
    setTitle("");
    setContent("");
    if (editor) {
      editor.commands.setContent("");
    }
    setImageUrl("");
    setCodeSnippet("");
    setShowCodeInput(false);
    setIsPinned(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    if (isPinned) {
      const existingPinned = posts.find(p => p.is_pinned && p.id !== editingPostId);
      if (existingPinned) {
        if (!window.confirm(t("masonhub_confirm_pin_replace") || "Another transmission is already pinned. Are you sure you want to replace it?")) {
          return;
        }
        await supabase.from('mason_posts').update({ is_pinned: false }).eq('id', existingPinned.id);
      }
    }

    setIsSubmitting(true);
    let payload: any = { mason_id: masonId, title: title.trim(), content: content.trim(), is_pinned: isPinned };
    if (imageUrl.trim()) payload.image_url = imageUrl.trim();
    if (codeSnippet.trim()) payload.code_snippet = codeSnippet.trim();

    let error = null;
    let newPostId: string | null = null;
    const performSave = async (data: any) => {
      if (editingPostId) {
        const res = await supabase.from('mason_posts').update(data).eq('id', editingPostId).select();
        return { error: res.error, data: res.data };
      } else {
        const res = await supabase.from('mason_posts').insert([data]).select();
        if (!res.error && res.data && res.data.length > 0) newPostId = res.data[0].id;
        return { error: res.error, data: res.data };
      }
    };
    
    let resObj = await performSave(payload);
    error = resObj.error;
    
    if (error && error.message && error.message.includes('image_url')) {
      if (imageUrl.trim()) payload.content = `[IMG:${imageUrl.trim()}]\n\n` + payload.content;
      delete payload.image_url;
      resObj = await performSave(payload);
      error = resObj.error;
    }

    if (!error) {
      if (!editingPostId && newPostId) {
        // Notify followers
        const { data: authUser } = await supabase.auth.getUser();
        if (authUser.user) {
          const { data: followers } = await supabase.from('mason_followers').select('user_id').eq('mason_id', masonId);
          if (followers && followers.length > 0) {
            const notifications = followers.map(f => ({
              user_id: f.user_id,
              actor_id: authUser.user!.id,
              type: 'new_post',
              reference_id: newPostId,
              message: `${masonName || 'A Mason you follow'} has broadcast a new Transmission.`
            }));
            await supabase.from('notifications').insert(notifications);
          }
        }
      }
      
      closeEditor();
      fetchPostsAndAssets();
      useStore.getState().pushStatus(editingPostId ? "Transmission Updated!" : t("mason_post_success"), 'success');
    } else {
      useStore.getState().pushStatus(`Transmission Failed: ${error.message}`, 'error');
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from('mason_posts').delete().eq('id', id);
    fetchPostsAndAssets();
  };
  
  const filteredPosts = posts.filter(p => 
    p.title?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.content?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stripMarkdown = (text: string) => {
    if (!text) return "";
    return text
      .replace(/\[IMG:.*?\]/g, '') // remove custom [IMG:] tags
      .replace(/!\[.*?\]\(.*?\)/g, '') // remove markdown images
      .replace(/\[(.*?)\]\(.*?\)/g, '$1') // replace markdown links with just the text
      .replace(/[#*`~_>-]/g, '') // strip markdown formatting characters
      .replace(/^\s*\d+\.\s/gm, '') // strip numbered lists
      .replace(/\n{3,}/g, '\n\n') // normalize spacing
      .trim();
  };

  return (
    <>
      <div className="flex items-center gap-4 px-6 py-6 shrink-0 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-[color-mix(in_srgb,var(--text)_1%,transparent)]">
        <h2 className="text-xl font-black text-[var(--text)] uppercase tracking-widest flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("ui_icon_edit_document") || "edit_document"}</span>
          </div>
          <span className="truncate">{t("mason_tab_title") || "COMM-POSTS"}</span>
        </h2>
        <div className="relative flex-1 max-w-xl ml-auto flex gap-4 items-center justify-end">
          <div className="relative flex-1 max-w-[300px]">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 !text-sm">{t("ui_icon_search") || "search"}</span>
            <input 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
              placeholder={t("mason_search_transmissions") || "Search transmissions..."} 
              className="w-full theme-glass-panel rounded-2xl pl-10 pr-10 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] hover:text-[var(--text)] transition-colors">
                <span className="material-symbols-outlined text-sm">{t("ui_icon_close") || "close"}</span>
              </button>
            )}
          </div>
          <button 
            onClick={() => openEditor()} 
            className="h-12 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-105 shadow-lg font-black uppercase tracking-widest text-[10px] group"
          >
            <span className="material-symbols-outlined !text-[16px] group-hover:scale-110 transition-transform">{t("ui_icon_cell_tower") || "cell_tower"}</span> {t("mason_post_broadcast") || "BROADCAST TRANSMISSION"}
          </button>
        </div>     
      </div>

      <div className="p-8 flex flex-col gap-10 pb-32">
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-8">
           {filteredPosts.map(post => (
             <div key={post.id} className={`theme-glass-panel p-5 rounded-3xl relative group flex flex-col gap-4 transition-all duration-500 hover:-translate-y-1 shadow-lg backdrop-blur-3xl overflow-hidden ${post.is_pinned ? 'border-[var(--accent)]/30 bg-[var(--accent)]/5 shadow-[0_10px_30px_rgba(var(--accent-rgb),0.1)]' : 'border border-white/5 hover:border-white/10 hover:shadow-[0_10px_30px_rgba(0,0,0,0.3)]'}`}>
                <div className={`absolute -top-32 -right-32 w-64 h-64 blur-[80px] rounded-full pointer-events-none transition-opacity duration-700 z-0 ${post.is_pinned ? 'bg-[var(--accent)] opacity-20' : 'bg-[var(--text)] opacity-0 group-hover:opacity-[0.03]'}`} />
                {post.image_url && (
                  <div className="-mx-5 -mt-5 rounded-t-3xl overflow-hidden h-36 bg-black/40 relative border-b border-white/5 shrink-0 z-10">
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-10 pointer-events-none" />
                    <img src={post.image_url} alt="Cover" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000" />
                  </div>
                )}
                <div className="flex flex-col gap-1 pr-4 z-10">
                  <div className="flex items-center gap-2 mb-1">
                    {post.is_pinned && (
                      <span className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30 backdrop-blur-md">
                        <span className="material-symbols-outlined !text-[10px]">{t("ui_icon_push_pin") || "push_pin"}</span>
                        {t("masonhub_pinned") || "PINNED"}
                      </span>
                    )}
                    <span className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest">{new Date(post.created_at).toLocaleDateString()}</span>
                  </div>
                  <h4 className="text-lg font-black text-[var(--text)] uppercase tracking-tighter line-clamp-1">{post.title}</h4>
                </div>
                <div className="flex-1 relative z-10 -mx-1">
                  <p className="text-[11px] font-mono text-[var(--subtext)] opacity-70 leading-relaxed whitespace-pre-wrap break-words line-clamp-5">
                    {stripMarkdown(post.content).length > 300 ? stripMarkdown(post.content).substring(0, 300) + '...' : stripMarkdown(post.content)}
                  </p>
                </div>
                <div className={`mt-auto pt-4 border-t border-white/5 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 relative z-20 ${confirmDelete === post.id ? 'justify-center w-full' : 'justify-end'}`}>
                  {confirmDelete === post.id ? (
                    <>
                      <span className="text-[10px] font-black text-[var(--danger)] uppercase tracking-widest self-center animate-pulse flex items-center gap-1.5 opacity-80 mr-2">
                        <span className="material-symbols-outlined !text-[14px]">warning</span> Confirm
                      </span>
                      <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); }} className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest text-[var(--text)] opacity-60 hover:opacity-100 hover:bg-white/5 border border-transparent hover:border-white/10 transition-all duration-300 flex items-center gap-1.5 group/btn"><span className="material-symbols-outlined !text-[14px]">close</span> {t("ui_btn_cancel") || "CANCEL"}</button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(post.id); setConfirmDelete(null); }} className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest text-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] hover:shadow-[0_0_20px_color-mix(in_srgb,var(--danger)_30%,transparent)] transition-all duration-300 flex items-center gap-1.5 group/btn"><span className="material-symbols-outlined !text-[14px]">delete_forever</span> {t("ui_btn_delete") || "DELETE"}</button>
                    </>
                  ) : (
                    <>
                      <button onClick={(e) => { e.stopPropagation(); setPreviewPost(post); }} className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] hover:shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_20%,transparent)] border border-transparent hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] transition-all duration-300 flex items-center gap-1.5 group/btn"><span className="material-symbols-outlined !text-[14px]">visibility</span> {t("masonhub_btn_view_post") || "VIEW"}</button>
                      <button onClick={(e) => { e.stopPropagation(); openEditor(post); }} className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest text-[var(--warning)] hover:bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] hover:shadow-[0_0_15px_color-mix(in_srgb,var(--warning)_20%,transparent)] border border-transparent hover:border-[color-mix(in_srgb,var(--warning)_30%,transparent)] transition-all duration-300 flex items-center gap-1.5 group/btn"><span className="material-symbols-outlined !text-[14px]">edit</span> {t("ui_btn_edit") || "EDIT"}</button>
                      <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(post.id); }} className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] hover:shadow-[0_0_15px_color-mix(in_srgb,var(--danger)_20%,transparent)] border border-transparent hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)] transition-all duration-300 flex items-center gap-1.5 group/btn"><span className="material-symbols-outlined !text-[14px]">delete</span> {t("ui_btn_delete") || "DEL"}</button>
                    </>
                  )}
                </div>
             </div>
          ))}
          {filteredPosts.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center opacity-30 mt-20">
              <span className="text-[10px] font-black text-[var(--text)] uppercase tracking-[0.2em] text-center px-8 leading-relaxed">
                {t("masonhub_no_transmissions") || "NO TRANSMISSIONS"}
              </span>
            </div>
          )}
        </div>
      </div>
      
      {/* Slide-out Panel for Editing */}
      {isEditorOpen && (
        <>
          <SidePanel
            isOpen={isEditorOpen}
            onClose={closeEditor}
            icon="cell_tower"
            widthClass="w-[800px]"
            title={editingPostId ? (t("masonhub_update_transmission") || "UPDATE TRANSMISSION") : (t("mason_new_transmission") || "NEW TRANSMISSION")}
            subtitle={editingPostId ? (t("masonhub_editing_record") || "Editing Record") : (t("masonhub_composing_broadcast") || "Composing Broadcast")}
            actions={
              <button onClick={handleSubmit} disabled={isSubmitting || !title || !content} className="h-12 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-105 shadow-lg font-black uppercase tracking-widest text-[10px] group">
                {isSubmitting ? t("mason_saving") : (editingPostId ? t("masonhub_update_transmission") : t("mason_btn_post"))}
              </button>
            }
          >
            <div className="flex flex-col gap-6">
              
              <div className="flex border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] mb-2 p-1 bg-black/40 rounded-2xl theme-glass-inner">
                <button onClick={() => setViewMode('edit')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'edit' ? 'bg-[var(--accent)]/20 border border-[var(--accent)]/50 text-[var(--accent)] shadow-[0_0_20px_rgba(var(--accent-rgb),0.3)] backdrop-blur-md' : 'bg-transparent border border-transparent text-[var(--subtext)] opacity-60 hover:text-[var(--text)] hover:bg-white/5 hover:opacity-100 backdrop-blur-md'}`}>
                  {t("masonhub_editor") || "EDITOR"}
                </button>
                <button onClick={() => setViewMode('preview')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'preview' ? 'bg-[var(--accent)]/20 border border-[var(--accent)]/50 text-[var(--accent)] shadow-[0_0_20px_rgba(var(--accent-rgb),0.3)] backdrop-blur-md' : 'bg-transparent border border-transparent text-[var(--subtext)] opacity-60 hover:text-[var(--text)] hover:bg-white/5 hover:opacity-100 backdrop-blur-md'}`}>
                  {t("masonhub_preview") || "PREVIEW"}
                </button>
                
                <label className="ml-4 pr-4 flex items-center gap-2 cursor-pointer opacity-70 hover:opacity-100 transition-opacity">
                  <input type="checkbox" checked={isPinned} onChange={(e) => setIsPinned(e.target.checked)} className="hidden" />
                  <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all shadow-inner ${isPinned ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[color-mix(in_srgb,var(--text)_20%,transparent)] bg-black/40'}`}>
                    {isPinned && <span className="material-symbols-outlined !text-[14px] text-[var(--bg)]">{t("ui_icon_check") || "check"}</span>}
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-1"><span className="material-symbols-outlined !text-[16px]">{t("ui_icon_push_pin") || "push_pin"}</span> {t("masonhub_pin_transmission") || "PIN POST"}</span>
                </label>
              </div>

              {viewMode === 'edit' ? (
                <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex flex-col gap-2">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("mason_post_title") || "Transmission Title"}</label>
                    <input required value={title} onChange={e => setTitle(e.target.value)} placeholder={t("mason_post_title")} className="theme-glass-inner bg-black/40 rounded-xl px-5 h-14 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-[var(--accent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner transition-all" />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("masonhub_header_image_placeholder") || "Header Image URL (Optional)"}</label>
                    <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder={t("masonhub_header_image_placeholder")} className="theme-glass-inner bg-black/40 rounded-xl px-5 h-14 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-[var(--accent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner transition-all" />
                  </div>
                  
                  <div className="flex flex-col gap-2 flex-1 min-h-[400px]">
                    <div className="flex items-center justify-between ml-2">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("mason_post_content") || "Transmission Body..."}</label>
                    </div>
                    <div className="flex flex-col flex-1 theme-glass-inner bg-black/40 rounded-2xl overflow-hidden border focus-within:border-[var(--accent)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner transition-all">
                      <div className="flex flex-wrap items-center gap-1.5 p-3 bg-white/5 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 relative backdrop-blur-md">
                        <button type="button" onClick={() => editor?.chain().focus().toggleBold().run()} className={`w-8 h-8 rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border ${editor?.isActive('bold') ? 'border-[var(--accent)]/50 bg-[var(--accent)]/20' : 'border-white/10 hover:border-white/20'} backdrop-blur-md font-serif font-bold text-[var(--text)] flex items-center justify-center transition-all shadow-sm`}>B</button>
                        <button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()} className={`w-8 h-8 rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border ${editor?.isActive('italic') ? 'border-[var(--accent)]/50 bg-[var(--accent)]/20' : 'border-white/10 hover:border-white/20'} backdrop-blur-md font-serif italic text-[var(--text)] flex items-center justify-center transition-all shadow-sm`}>I</button>
                        <div className="w-px h-6 bg-white/10 mx-2" />
                        <button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} className={`w-8 h-8 rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border ${editor?.isActive('heading', { level: 1 }) ? 'border-[var(--accent)]/50 bg-[var(--accent)]/20' : 'border-white/10 hover:border-white/20'} backdrop-blur-md font-black text-[var(--text)] flex items-center justify-center transition-all shadow-sm`}>H1</button>
                        <button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} className={`w-8 h-8 rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border ${editor?.isActive('heading', { level: 2 }) ? 'border-[var(--accent)]/50 bg-[var(--accent)]/20' : 'border-white/10 hover:border-white/20'} backdrop-blur-md font-black text-[var(--text)] flex items-center justify-center transition-all shadow-sm`}>H2</button>
                        <div className="w-px h-6 bg-white/10 mx-2" />
                        <button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()} className={`w-8 h-8 rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border ${editor?.isActive('bulletList') ? 'border-[var(--accent)]/50 bg-[var(--accent)]/20' : 'border-white/10 hover:border-white/20'} backdrop-blur-md font-black text-[var(--text)] flex items-center justify-center transition-all shadow-sm`}>•</button>
                        <button type="button" onClick={() => editor?.chain().focus().toggleOrderedList().run()} className={`w-8 h-8 rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border ${editor?.isActive('orderedList') ? 'border-[var(--accent)]/50 bg-[var(--accent)]/20' : 'border-white/10 hover:border-white/20'} backdrop-blur-md font-black text-[var(--text)] flex items-center justify-center transition-all shadow-sm`}>1.</button>
                        <div className="w-px h-6 bg-white/10 mx-2" />
                        <button type="button" onClick={() => setShowImageInput(!showImageInput)} className={`w-8 h-8 rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border ${showImageInput ? 'border-[var(--accent)]/50 bg-[var(--accent)]/20' : 'border-white/10 hover:border-white/20'} backdrop-blur-md font-black text-[var(--text)] flex items-center justify-center transition-all shadow-sm`}>🖼️</button>
                        <button type="button" onClick={() => editor?.chain().focus().toggleCodeBlock().run()} className={`w-8 h-8 rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border ${editor?.isActive('codeBlock') ? 'border-[var(--accent)]/50 bg-[var(--accent)]/20' : 'border-white/10 hover:border-white/20'} backdrop-blur-md font-mono text-[var(--text)] flex items-center justify-center transition-all shadow-sm`}>&lt;&gt;</button>
                        
                        <div className="ml-auto relative flex gap-3">
                          <button type="button" onClick={() => setShowCodeInput(!showCodeInput)} className={`px-4 py-2 rounded-xl theme-glass-panel border transition-all text-[9px] font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-2 shadow-sm ${showCodeInput ? 'bg-[var(--accent)]/20 border-[var(--accent)]/50 text-[var(--accent)] shadow-[0_0_15px_rgba(var(--accent-rgb),0.4)] backdrop-blur-md' : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-white/20 hover:bg-white/5 backdrop-blur-md'}`}>
                            <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_data_object") || "data_object"}</span> {showCodeInput ? (t("masonhub_hide_code") || "HIDE CODE") : (t("masonhub_add_code") || "ADD CODE")}
                          </button>
                          <button type="button" onClick={() => setIsAssetPanelOpen(true)} className="px-4 py-2 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-white/20 hover:bg-white/5 text-[9px] font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-2 transition-all shadow-sm backdrop-blur-md">
                            <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_link") || "link"}</span> {t("masonhub_link_asset") || "LINK ASSET"}
                          </button>
                        </div>
                      </div>
                      {showImageInput && (
                        <div className="border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] p-3 bg-white/5 shadow-inner animate-in slide-in-from-top-2 duration-300 flex items-center gap-3 relative z-10 backdrop-blur-xl">
                          <input 
                            value={inlineImageUrl} 
                            onChange={e => setInlineImageUrl(e.target.value)} 
                            onKeyDown={e => {
                              if (e.key === 'Enter' && inlineImageUrl) {
                                e.preventDefault();
                                editor?.chain().focus().setImage({ src: inlineImageUrl }).run();
                                setInlineImageUrl('');
                                setShowImageInput(false);
                              }
                            }}
                            placeholder={t("masonhub_image_url_placeholder") || "Paste Image URL here and press Enter..."} 
                            className="flex-1 theme-glass-inner rounded-xl px-4 py-2 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] transition-all shadow-inner" 
                            autoFocus 
                          />
                          <button 
                            type="button"
                            onClick={() => { 
                              if (inlineImageUrl) { 
                                editor?.chain().focus().setImage({ src: inlineImageUrl }).run(); 
                                setInlineImageUrl(''); 
                                setShowImageInput(false); 
                              } 
                            }} 
                            className="px-6 py-2 bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] border border-[var(--accent)]/50 text-[var(--accent)] rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.3)] hover:-translate-y-0.5 transition-all hover:bg-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
                          >
                            {t("ui_btn_insert") || "INSERT"}
                          </button>
                        </div>
                      )}
                      <div className="w-full flex-1 relative min-h-[350px]">
                        <EditorContent editor={editor} className="h-full w-full custom-scrollbar" />
                      </div>
                      {showCodeInput && (
                        <div className="border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] p-3 bg-black/40 shadow-inner animate-in slide-in-from-bottom-2 duration-300">
                          <textarea 
                            value={codeSnippet}
                            onChange={(e) => setCodeSnippet(e.target.value)}
                            placeholder="Paste code logs or error traces here..."
                            className="w-full bg-[color-mix(in_srgb,var(--text)_2%,transparent)] rounded-xl text-[var(--text)] p-4 text-xs font-mono placeholder-[var(--subtext)] outline-none h-48 custom-scrollbar focus:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all border border-[color-mix(in_srgb,var(--text)_5%,transparent)] focus:border-[var(--accent)]"
                            spellCheck={false}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-6 mt-4">
                  <h3 className="text-[10px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-2">{t("masonhub_live_preview") || "LIVE PREVIEW"}</h3>
                  
                  {imageUrl && (
                    <div className="w-full rounded-2xl overflow-hidden shadow-lg border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-black/20 shrink-0">
                       <img src={imageUrl} className="w-full h-auto object-contain max-h-[400px]" alt="Post Cover Preview" />
                    </div>
                  )}

                  <h1 className="text-3xl font-black text-[var(--text)] uppercase tracking-tight">{title || (t("masonhub_untitled") || "Untitled Transmission")}</h1>
                  
                  <div className="markdown-body p-6 theme-glass-inner rounded-3xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] shadow-inner min-h-[300px]">
                     {content ? <MarkdownRenderer content={content} onAssetClick={(type, id) => setActiveAsset({type, id})} /> : <p className="text-[var(--subtext)] opacity-50 italic">{t("masonhub_no_content_preview") || "No content to preview."}</p>}
                  </div>
                </div>
              )}
            </div>
          </SidePanel>
        </>
      )}

      {/* Asset Linking Sub-Panel */}
      <SidePanel
        isOpen={isAssetPanelOpen}
        onClose={() => setIsAssetPanelOpen(false)}
        title={t("masonhub_link_asset") || "LINK ASSET"}
        icon="link"
        backdropZ="z-[50000]"
        panelZ="z-[50001]"
      >
        <div className="flex flex-col gap-6">
          <div className="animate-in slide-in-from-top-2">
            <div className="relative w-full">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 !text-sm">{t("ui_icon_search") || "search"}</span>
              <input 
                value={assetSearchQuery} 
                onChange={(e) => setAssetSearchQuery(e.target.value)} 
                placeholder={t("masonhub_search_assets") || "Search assets..."} 
                className="w-full theme-glass-panel rounded-2xl pl-10 pr-5 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40 shadow-inner"
                autoFocus
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {filteredAssets.length === 0 && <span className="text-center text-[10px] font-black uppercase tracking-widest opacity-50 p-4">{t("masonhub_no_assets")}</span>}
            {filteredAssets.map(asset => (
              <button key={`${asset.type}-${asset.id}`} type="button" onClick={() => handleLinkAsset(asset)} className="text-left px-5 py-4 rounded-2xl theme-glass-inner hover:theme-border-accent hover:-translate-y-0.5 transition-all flex items-center gap-4 group">
                <span className="opacity-70 text-xl shrink-0 group-hover:scale-110 transition-transform">{asset.type === 'mod' ? '📦' : asset.type === 'blueprint' ? '🗺️' : asset.type === 'lexicon' ? '🗣️' : '🎨'}</span>
                <span className="text-sm font-black text-[var(--text)] uppercase tracking-tight truncate w-full group-hover:theme-text-accent transition-colors">{asset.name}</span>
              </button>
            ))}
          </div>
        </div>
      </SidePanel>

      {/* View Post Overlay */}
      {previewPost && (
        <MasonPostViewer 
          post={previewPost} 
          onClose={() => setPreviewPost(null)} 
          onOpenMasonProfile={handleOpenMasonProfile} 
          userId={masonProfileId} 
          onAssetClick={(type, id) => setActiveAsset({type, id})}
        />
      )}
      
      {activeAsset && <AssetPreviewSidebar assetType={activeAsset.type} assetId={activeAsset.id} onClose={() => setActiveAsset(null)} />}
    </>
  );
}


function MasonSettings({ profile, onUpdate }: { profile: any, onUpdate: (p: any) => void }) {
  const { t } = useLexicon();
  const [formData, setFormData] = useState({
    name: profile.name || "",
    bio: profile.bio || "",
    avatar_url: profile.avatar_url || "",
    patreon_url: profile.patreon_url || "",
    website_url: profile.website_url || "",
    discord_url: profile.discord_url || ""
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    const { data, error } = await supabase.from('masons').update(formData).eq('id', profile.id).select().single();
    if (!error && data) {
       onUpdate(data);
       useStore.getState().pushStatus("Profile settings saved successfully!", 'success');
    }
    setIsSaving(false);
  };

  return (
    <div className="w-full flex flex-col gap-6">
       <h2 className="text-sm font-black theme-text-accent uppercase tracking-widest mb-2">{t("masonhub_creator_identity") || "Creator Identity"}</h2>
       
       <div className="flex flex-col gap-2">
         <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("masonhub_public_name") || "Public Name"}</label>
         <input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" />
       </div>
       
       <div className="flex flex-col gap-2">
         <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("masonhub_avatar_url") || "Avatar URL (Profile Picture)"}</label>
         <input value={formData.avatar_url} onChange={e => setFormData({...formData, avatar_url: e.target.value})} className="theme-glass-inner rounded-xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" />
       </div>
       
       <div className="flex flex-col gap-2">
         <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("masonhub_biography") || "Biography"}</label>
         <textarea value={formData.bio} onChange={e => setFormData({...formData, bio: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-mono h-24 resize-none focus:outline-none focus:theme-border-accent custom-scrollbar overflow-y-auto" />
       </div>
       
       <div className="flex flex-col gap-4">
         <div className="flex flex-col gap-2">
           <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("masonhub_patreon_url") || "Patreon URL"}</label>
           <input value={formData.patreon_url} onChange={e => setFormData({...formData, patreon_url: e.target.value})} className="theme-glass-inner rounded-xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" />
         </div>
         <div className="flex flex-col gap-2">
           <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("masonhub_personal_website") || "Personal Website"}</label>
           <input value={formData.website_url} onChange={e => setFormData({...formData, website_url: e.target.value})} className="theme-glass-inner rounded-xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" />
         </div>
        </div>

       <div className="flex flex-col gap-2">
         <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("masonhub_discord_url") || "Discord URL"}</label>
         <input value={formData.discord_url} onChange={e => setFormData({...formData, discord_url: e.target.value})} className="theme-glass-inner rounded-xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" />
       </div>
       
       <button onClick={handleSave} disabled={isSaving} className="h-12 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-105 shadow-lg font-black uppercase tracking-widest text-[10px] group mt-4 w-full">
         {isSaving ? t("masonhub_saving_settings") : t("masonhub_save_configuration")}
       </button>
    </div>
  );
}
function ProtocolSearchModal({ isOpen, onClose, onSelect, cloudMods }: any) {
  const { t } = useLexicon();
  const [query, setQuery] = useState("");
  if (!isOpen) return null;
  const results = cloudMods.filter((m:any) =>
    (m.name || '').toLowerCase().includes((query || '').toLowerCase()) ||
    (m.master_author || '').toLowerCase().includes((query || '').toLowerCase())
  ).slice(0, 15);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-[3px] animate-in fade-in">
      <div className="w-full max-w-lg bg-[var(--sidebar)] border border-white/10 rounded-[2rem] shadow-2xl flex flex-col overflow-hidden">
        <div className="p-6 border-b border-white/10">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-black uppercase tracking-widest theme-text-accent">{t("masonhub_select_artifact") || "Select Artifact"}</h3>
            <button onClick={onClose} className="text-[var(--text)]/50 hover:text-[var(--text)] font-black"><span className="material-symbols-outlined">{t("ui_icon_close") || "close"}</span></button>
          </div>
          <input autoFocus placeholder="Search Global Catalog..." value={query} onChange={(e) => setQuery(e.target.value)} className="w-full theme-glass-inner rounded-xl px-4 py-3 text-[var(--text)] text-sm focus:outline-none focus:theme-border-accent" />
        </div>
        <div className="p-4 flex flex-col gap-2 max-h-96 overflow-y-auto custom-scrollbar">
          {results.length > 0 ? results.map((mod:any) => (
            <button key={mod.id} onClick={() => { onSelect(mod.id); }} className="flex justify-between items-center px-4 py-3 theme-glass-inner border border-white/5 hover:theme-border-accent hover:theme-panel-accent rounded-xl transition-all text-left group">
              <div className="flex flex-col">
                <span className="text-xs font-black text-[var(--text)] uppercase truncate">{mod.name}</span>
                <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">{mod.master_author || "Unknown Architect"}</span>
              </div>
            </button>
          )) : <div className="p-4 text-center text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("masonhub_no_matches") || "No matches found"}</div>}
        </div>
      </div>
    </div>
  );
}

function CustomTierDropdown({ value, onChange }: { value: number, onChange: (val: number) => void }) {
  const { t } = useLexicon();
  const [isOpen, setIsOpen] = useState(false);

  const options = [
    { id: 4, label: t("nexus_tier4"), color: 'theme-text-danger', glow: 'theme-bg-danger' },
    { id: 3, label: t("nexus_tier3"), color: 'theme-text-warning', glow: 'theme-bg-warning' },
  ];

  const selected = options.find(o => o.id === value) || options[0];

  return (
    <div className="relative w-full md:w-48 shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full h-12 px-5 rounded-xl theme-glass-inner outline-none transition-all shadow-inner flex justify-between items-center text-sm font-bold focus:outline-none focus:theme-border-accent group hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] relative z-[10] ${selected.color}`}
      >
        <div className="flex items-center gap-3 truncate pr-4">
          <div className={`w-2 h-2 rounded-full ${selected.glow}`} />
          <span className="truncate">{selected.label}</span>
        </div>
        <span className="text-[var(--subtext)] opacity-60 text-[10px] group-hover:text-[var(--text)] transition-colors shrink-0">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--sidebar)] rounded-2xl border border-white/10 shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
            {options.map(opt => (
              <button
                key={opt.id}
                onClick={() => { onChange(opt.id); setIsOpen(false); }}
                className={`w-full text-left px-5 py-3 text-xs font-black uppercase tracking-widest transition-all hover:bg-white/5 flex items-center gap-3 ${opt.color}`}
              >
                <div className={`w-2 h-2 rounded-full ${opt.glow} opacity-50`} />
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MasonStatusDropdown({ value, onChange }: { value: string, onChange: (val: string) => void }) {
  const { t } = useLexicon();
  const options =[
    { id: 'under_review', label: t("status_dd_verified") + " (Queues for Approval)" },
    { id: 'broken', label: t("status_dd_broken") },
    { id: 'unverified', label: t("status_dd_unverified") },
  ];
  if (value === 'verified') {
     options.unshift({ id: 'verified', label: t("status_dd_verified") });
  }
  return <CustomDropdown disableTint={true}  value={value} options={options} onChange={(v: string[]) => onChange(v[0])} placeholder={t("mason_label_select") || "Select..."} />;
}

function MasonSandbox({ masonId, initialSandboxMod, onClear, vaultPath }: { masonId: string, initialSandboxMod: any, onClear: any, vaultPath?: string }) {
  const { t } = useLexicon();
  const [activeMod, setActiveMod] = useState<any>(initialSandboxMod || null);
  const [sandboxMods, setSandboxMods] = useState<any[]>([]);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [existingMods, setExistingMods] = useState<any[]>([]);
  const [existingHashes, setExistingHashes] = useState<Set<string>>(new Set());
  const [linkSearch, setLinkSearch] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  
  const [isEditorOpen, setIsEditorOpen] = useState(!!initialSandboxMod);

  const fetchExistingMods = async () => {
    // We fetch mods and their versions to see if a sandbox mod is already synced
    const { data } = await supabase.from('mods').select('id, name, mod_versions(dna_hash)').eq('mason_id', masonId).order('name');
    if (data) {
      setExistingMods(data);
      const hashes = new Set<string>();
      data.forEach(m => {
        if (m.mod_versions) {
          m.mod_versions.forEach((v: any) => {
            if (v.dna_hash) hashes.add(v.dna_hash);
          });
        }
      });
      setExistingHashes(hashes);
    }
  };

  useEffect(() => {
    fetchExistingMods();
  }, [masonId]);

  const handleLinkToExisting = async (modId: string) => {
    if (!activeMod || !activeMod.hash) return;
    setIsCommitting(true);
    try {
      const { error: versionError } = await supabase.from("mod_versions").upsert([
        {
          mod_id: modId,
          dna_hash: activeMod.hash,
          version_label: "New Update",
          game_version: activeMod.compatible_versions && activeMod.compatible_versions.length > 0 ? activeMod.compatible_versions[0] : null
        }
      ], { onConflict: "dna_hash" });
      
      if (versionError) throw versionError;

      await invoke('mark_mod_synced', { hash: activeMod.hash, dbId: modId });
      useStore.getState().pushStatus("Mod successfully linked to existing record!", "success");
      setIsLinkModalOpen(false);
      setIsEditorOpen(false);
      fetchExistingMods(); // refresh sync status
      if (onClear) onClear();
    } catch (err: any) {
      useStore.getState().pushStatus(`Error linking mod: ${err.message}`, 'error');
    }
    setIsCommitting(false);
  };

  const fetchSandboxMods = async () => {
    if (!vaultPath) return;
    try {
      setIsLoading(true);
      const mods = await invoke<any[]>("scan_sandbox", { vaultPath });
      setSandboxMods(mods);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (initialSandboxMod) {
       setActiveMod(initialSandboxMod);
       setIsEditorOpen(true);
    }
    fetchSandboxMods();
  }, [initialSandboxMod, vaultPath]);

  const handleImportToSandbox = async () => {
    if (!vaultPath) {
      useStore.getState().pushStatus("Vault Path not configured.", "error");
      return;
    }
    
    try {
      setIsImporting(true);
      const selected = await open({
        multiple: true,
        filters: [{ name: "Artifacts & Configs", extensions: ["package", "ts4script", "zip", "txt", "js", "ts", "xml", "json", "cfg", "ini", "html", "css"] }]
      });
      
      if (!selected || (Array.isArray(selected) && selected.length === 0)) {
        setIsImporting(false);
        return;
      }
      
      const files = Array.isArray(selected) ? selected : [selected];
      
      const importedCount = await invoke<number>("import_to_sandbox", { files, vaultPath });
      
      useStore.getState().pushStatus(`Imported ${importedCount} file(s) to Sandbox!`, "success");
      await fetchSandboxMods();
    } catch (err: any) {
      console.error(err);
      useStore.getState().pushStatus(`Failed to import to Sandbox: ${err.message || String(err)}`, "error");
    } finally {
      setIsImporting(false);
    }
  };

  const handleSyncToNetwork = async () => {
    if (!activeMod || !activeMod.hash) {
      useStore.getState().pushStatus("No valid sandbox mod selected or missing hash.", "error");
      return;
    }
    setIsCommitting(true);
    try {
      const { data: newMod, error: insertError } = await supabase.from('mods').insert([{
        name: activeMod.name || "Unknown Sandbox Mod",
        mason_id: masonId,
        description: activeMod.description || "",
        image_url: activeMod.image_url || null,
        url: activeMod.url || null,
        allow_write: activeMod.allow_write || false,
        category_override: activeMod.category_override || activeMod.type || null,
        sub_type: activeMod.sub_type || null,
        file_extension: activeMod.file_extension || null,
        status: activeMod.status || 'unverified',
        created_at: activeMod.created_at || new Date().toISOString(),
        updated_at: activeMod.updated_at || new Date().toISOString(),
        compatible_versions: activeMod.compatible_versions || [],
        folder_structure: activeMod.folder_structure || []
      }]).select().single();
      
      if (insertError) throw insertError;
      
      const { error: versionError } = await supabase.from("mod_versions").upsert([
        {
          mod_id: newMod.id,
          dna_hash: activeMod.hash,
          version_label: "v1.0",
          game_version: activeMod.compatible_versions && activeMod.compatible_versions.length > 0 ? activeMod.compatible_versions[0] : null
        }
      ], { onConflict: "dna_hash" });
      
      if (versionError) throw versionError;

      useStore.getState().pushStatus("Mod synced to network successfully!", "success");
      setIsEditorOpen(false);
      fetchExistingMods();
      if (onClear) onClear();
    } catch (err: any) {
      useStore.getState().pushStatus(`Error syncing to network: ${err.message}`, 'error');
    }
    setIsCommitting(false);
  };
  
  const searchFilter = (m: any) => !searchTerm || m.name?.toLowerCase().includes(searchTerm.toLowerCase());
  const syncedMods = sandboxMods.filter(m => existingHashes.has(m.hash) && searchFilter(m));
  const unlinkedMods = sandboxMods.filter(m => !existingHashes.has(m.hash) && searchFilter(m));

  return (
    <div className="flex flex-col w-full relative">
      <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-white/5">
        <h2 className="text-xl font-black text-[var(--text)] uppercase tracking-widest flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("ui_icon_sandbox") || "handyman"}</span>
          </div>
          <span className="truncate">{t("sandbox_title") || "Sandbox"}</span>
        </h2>
        <div className="flex items-center gap-3 relative flex-1 ml-auto justify-end">
          <div className="relative flex-1 max-w-[300px]">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 !text-sm">{t("ui_icon_search") || "search"}</span>
            <input 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
              placeholder={t("sandbox_search_placeholder") || "Search artifacts..."} 
              className="w-full theme-glass-panel rounded-2xl pl-10 pr-10 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] hover:text-[var(--text)] transition-colors">
                <span className="material-symbols-outlined text-sm">{t("ui_icon_close") || "close"}</span>
              </button>
            )}
          </div>
          <button 
            onClick={handleImportToSandbox} 
            disabled={isImporting}
            className="h-12 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-105 shadow-lg font-black uppercase tracking-widest text-[10px] group disabled:opacity-50"
          >
            {isImporting ? <span className="material-symbols-outlined !text-[16px] animate-spin">{t("ui_icon_refresh") || "refresh"}</span> : <span className="material-symbols-outlined !text-[16px] group-hover:-translate-y-0.5 transition-transform">{t("ui_icon_download") || "download"}</span>}
            {isImporting ? t("sandbox_btn_importing") || "IMPORTING..." : t("sandbox_btn_import") || "IMPORT ARTIFACT"}
          </button>
        </div>
      </div>

      <div className="p-6 flex flex-col gap-10 pb-32 overflow-y-auto custom-scrollbar">
        {isLoading ? (
          <div className="flex justify-center items-center h-40 opacity-50 uppercase font-black tracking-widest text-[var(--text)]">
            {t("sandbox_scanning") || "Scanning Sandbox..."}
          </div>
        ) : (
          <>
            {/* Unlinked Section */}
            <div className="flex flex-col gap-6">
              <h3 className="text-lg font-black theme-text-accent uppercase tracking-widest px-2 border-b border-white/10 pb-2">
                Unlinked Artifacts
              </h3>
              {unlinkedMods.length === 0 ? (
                <div className="opacity-50 text-center py-10 text-[10px] font-bold uppercase tracking-widest border border-dashed border-white/20 rounded-3xl theme-glass-panel">
                  {t("sandbox_empty") || "No unlinked artifacts found"}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                  {unlinkedMods.map(mod => (
                    <button 
                      key={mod.hash} 
                      onClick={() => { setActiveMod(mod); setIsEditorOpen(true); }} 
                      className="theme-glass-panel rounded-[1.5rem] relative group flex flex-col text-left overflow-hidden border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-orange-500/50 hover:shadow-[0_0_40px_rgba(249,115,22,0.15)] transition-all duration-500 hover:-translate-y-1.5 bg-gradient-to-br from-white/5 to-transparent min-h-[160px]"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                      <div className="absolute top-0 left-0 w-full h-1 bg-orange-500/50 transition-all duration-500 group-hover:bg-orange-500 group-hover:shadow-[0_0_20px_rgba(249,115,22,0.5)]" />
                      
                      <div className="p-6 flex flex-col gap-4 relative z-10 w-full h-full">
                        <div className="flex justify-between items-start w-full">
                          <div className="w-12 h-12 rounded-[1rem] flex items-center justify-center shrink-0 border transition-all duration-500 shadow-inner border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] group-hover:border-orange-500/30">
                            <span className="text-2xl opacity-50 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500">📦</span>
                          </div>
                          <span className="bg-orange-500/10 text-orange-400 border border-orange-500/20 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-inner shrink-0 transition-colors group-hover:bg-orange-500/20">
                            {t("sandbox_unlinked_badge")}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1 mt-auto">
                          <h4 className="text-sm font-black text-[var(--text)] uppercase tracking-tight truncate group-hover:text-orange-400 transition-colors">{mod.name.split(/[\\/]/).pop()}</h4>
                          <span className="text-[9px] font-mono text-[var(--subtext)] opacity-60 uppercase tracking-widest truncate group-hover:opacity-100 transition-opacity">{mod.hash}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Synced Section */}
            <div className="flex flex-col gap-6 mt-4">
              <h3 className="text-lg font-black text-[var(--text)] opacity-80 uppercase tracking-widest px-2 border-b border-white/10 pb-2">
                Synced Artifacts
              </h3>
              {syncedMods.length === 0 ? (
                <div className="opacity-30 text-center py-10 text-[10px] font-bold uppercase tracking-widest">
                  {t("sandbox_no_synced")}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                  {syncedMods.map(mod => (
                    <button 
                      key={mod.hash} 
                      onClick={() => { setActiveMod(mod); setIsEditorOpen(true); }} 
                      className="theme-glass-panel rounded-[1.5rem] relative group flex flex-col text-left overflow-hidden border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-emerald-500/50 hover:shadow-[0_0_40px_rgba(16,185,129,0.15)] transition-all duration-500 hover:-translate-y-1.5 bg-gradient-to-br from-white/5 to-transparent min-h-[160px] opacity-80 hover:opacity-100"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                      <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500/50 transition-all duration-500 group-hover:bg-emerald-500 group-hover:shadow-[0_0_20px_rgba(16,185,129,0.5)]" />
                      
                      <div className="p-6 flex flex-col gap-4 relative z-10 w-full h-full">
                        <div className="flex justify-between items-start w-full">
                          <div className="w-12 h-12 rounded-[1rem] flex items-center justify-center shrink-0 border transition-all duration-500 shadow-inner border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] group-hover:border-emerald-500/30">
                            <span className="text-2xl opacity-50 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500">🔗</span>
                          </div>
                          <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-inner shrink-0 transition-colors group-hover:bg-emerald-500/20">
                            {t("sandbox_synced_badge")}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1 mt-auto">
                          <h4 className="text-sm font-black text-[var(--text)] uppercase tracking-tight truncate group-hover:text-emerald-400 transition-colors">{mod.name.split(/[\\/]/).pop()}</h4>
                          <span className="text-[9px] font-mono text-[var(--subtext)] opacity-60 uppercase tracking-widest truncate group-hover:opacity-100 transition-opacity">{mod.hash}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Editor Side Panel */}
      {isEditorOpen && activeMod && (
        <>
          <SidePanel
            isOpen={isEditorOpen}
            onClose={() => setIsEditorOpen(false)}
            title={t("sandbox_artifact_config")}
            subtitle={`${t("sandbox_hash_prefix")} ${activeMod?.hash}`}
            icon="settings"
            widthClass="w-[600px]"
            backdropZ="z-[50000]"
            panelZ="z-[50001]"
            actions={
              <button onClick={handleSyncToNetwork} disabled={isCommitting} className="theme-glass-panel border-white/5 hover:border-emerald-500/50 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100 flex items-center gap-2">
                {isCommitting ? <span className="material-symbols-outlined !text-[14px] animate-spin">{t("ui_icon_refresh") || "refresh"}</span> : <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_cloud_upload") || "cloud_upload"}</span>}
                {isCommitting ? t("sandbox_btn_syncing") : (t("sandbox_btn_sync") || "SYNC & CREATE")}
              </button>
            }
          >
            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("sandbox_placeholder_name") || "MOD NAME"}</label>
                  <input value={activeMod.name || ""} onChange={e => setActiveMod({...activeMod, name: e.target.value})} className="w-full theme-glass-panel rounded-2xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all border border-white/5 hover:border-[var(--accent)]/30 shadow-inner" />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_class")}</label>
                  <CustomClassificationDropdown value={activeMod.category_override || "Script"} onChange={(val: string) => setActiveMod({...activeMod, category_override: val})} />
                </div>
                
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("sandbox_label_file_ext") || "FILE EXTENSION"}</label>
                  <input value={activeMod.file_extension || ""} onChange={e => setActiveMod({...activeMod, file_extension: e.target.value})} placeholder={t("sandbox_placeholder_file_ext") || "e.g. .package, .zip"} className="w-full theme-glass-panel rounded-2xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all border border-white/5 hover:border-[var(--accent)]/30 placeholder-[color-mix(in_srgb,var(--text)_30%,transparent)] shadow-inner" />
                </div>
                
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("sandbox_label_subclass")}</label>
                  <input value={activeMod.sub_type || ""} onChange={e => setActiveMod({...activeMod, sub_type: e.target.value})} placeholder={t("sandbox_placeholder_subclass") || "e.g. Trait, Career, Bed"} className="w-full theme-glass-panel rounded-2xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all border border-white/5 hover:border-[var(--accent)]/30 placeholder-[color-mix(in_srgb,var(--text)_30%,transparent)] shadow-inner" />
                </div>
                
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_url")}</label>
                  <input value={activeMod.url || ""} onChange={e => setActiveMod({...activeMod, url: e.target.value})} className="w-full theme-glass-panel rounded-2xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all border border-white/5 hover:border-[var(--accent)]/30 shadow-inner" />
                </div>

                <div className="flex flex-col gap-2 xl:col-span-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_desc")}</label>
                  <textarea value={activeMod.description || ""} onChange={e => setActiveMod({...activeMod, description: e.target.value})} className="w-full theme-glass-panel rounded-3xl px-6 py-5 text-[var(--text)] text-sm font-bold min-h-[150px] custom-scrollbar resize-none focus:outline-none focus:border-[var(--accent)]/50 transition-all border border-white/5 hover:border-[var(--accent)]/30 shadow-inner" />
                </div>

                <div className="flex flex-col gap-2 xl:col-span-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_image")}</label>
                  <input value={activeMod.image_url || ""} onChange={e => setActiveMod({...activeMod, image_url: e.target.value})} className="w-full theme-glass-panel rounded-2xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all border border-white/5 hover:border-[var(--accent)]/30 shadow-inner" />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("sandbox_label_condition")}</label>
                  <MasonStatusDropdown value={activeMod.status || "unverified"} onChange={(newStatus: string) => setActiveMod({...activeMod, status: newStatus})} />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("sandbox_label_uploaded")}</label>
                  <div className="w-full">
                    <CustomDatePicker value={activeMod.created_at || null} onChange={date => setActiveMod({...activeMod, created_at: date})} />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("sandbox_label_updated")}</label>
                  <div className="w-full">
                    <CustomDatePicker value={activeMod.updated_at || null} onChange={date => setActiveMod({...activeMod, updated_at: date})} />
                  </div>
                </div>

                <div className="flex flex-col gap-2 col-span-full">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("sandbox_label_game_versions")}</label>
                  <GameVersionMultiSelect selectedVersions={activeMod.compatible_versions || []} onChange={(v) => setActiveMod({...activeMod, compatible_versions: v})} />
                </div>
              </div>

              <div className="mt-auto shrink-0 pt-8 pb-4 flex flex-col gap-4">
                  {existingHashes.has(activeMod.hash) && (
                     <div className="theme-glass-panel border-green-500/20 bg-green-500/5 px-6 py-4 rounded-2xl flex flex-col items-center justify-center text-center">
                        <span className="text-sm font-black text-green-400 uppercase tracking-widest flex items-center justify-center gap-2"><span className="material-symbols-outlined !text-[16px]">check_circle</span> {t("sandbox_already_synced")}</span>
                        <p className="text-[10px] text-[var(--subtext)] mt-1 font-bold">{t("sandbox_already_synced_desc")}</p>
                     </div>
                  )}
                  <div className="flex justify-end gap-4 mt-2">
                     <button onClick={() => setIsLinkModalOpen(true)} disabled={isCommitting} className="flex-1 py-4 font-black text-xs uppercase tracking-widest rounded-2xl transition-all duration-300 theme-glass-panel border border-white/5 text-[var(--text)] hover:text-[var(--accent)] hover:border-[var(--accent)]/50 hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.1)] hover:-translate-y-0.5 disabled:opacity-50 flex items-center justify-center gap-2">
                        <span className="material-symbols-outlined !text-[16px]">link</span> {t("sandbox_btn_link_existing") || "LINK"}
                     </button>
                  </div>
              </div>
            </div>
          </SidePanel>
        </>
      )}

      {/* Link to Existing Modal Overlay */}
      <SidePanel
        isOpen={isLinkModalOpen}
        onClose={() => setIsLinkModalOpen(false)}
        title={t("sandbox_link_modal_title") || "LINK TO EXISTING"}
        icon="link"
        widthClass="w-[450px]"
        backdropZ="z-[60000]"
        panelZ="z-[60001]"
      >
        <div className="flex flex-col gap-6 h-full">
          <div className="shrink-0 relative">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 !text-sm">{t("ui_icon_search") || "search"}</span>
            <input 
              type="text" 
              placeholder={t("sandbox_link_search") || "Search your mods..."}
              value={linkSearch}
              onChange={e => setLinkSearch(e.target.value)}
              className="w-full theme-glass-panel rounded-2xl pl-10 pr-5 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40 shadow-inner"
              autoFocus
            />
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3 pb-4">
            {existingMods.filter(m => m.name.toLowerCase().includes(linkSearch.toLowerCase())).length === 0 ? (
              <div className="text-center p-8 opacity-50 text-[10px] font-black uppercase tracking-widest">{t("sandbox_link_no_results") || "No mods found"}</div>
            ) : (
              existingMods.filter(m => m.name.toLowerCase().includes(linkSearch.toLowerCase())).map(m => (
                <button 
                  key={m.id} 
                  onClick={() => handleLinkToExisting(m.id)}
                  className="w-full text-left p-5 rounded-2xl theme-glass-panel border border-white/5 hover:border-[var(--accent)]/50 hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.1)] hover:-translate-y-0.5 transition-all duration-300 group flex items-center justify-between"
                >
                  <span className="font-black text-xs text-[var(--text)] uppercase tracking-tight truncate mr-4 group-hover:text-[var(--accent)] transition-colors">{m.name}</span>
                  <span className="text-[9px] font-black uppercase tracking-widest text-[var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5"><span className="material-symbols-outlined !text-[14px]">link</span> {t("sandbox_btn_link_existing") || "LINK"}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </SidePanel>
    </div>
  );
}


function MasonMarketplace({ masonProfile }: { masonProfile: any }) {
  const { t } = useLexicon();
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [availableLanguages, setAvailableLanguages] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  
  const [activeTab, setActiveTab] = useState("published");
  const [uploadState, setUploadState] = useState({
    isOpen: false,
    editId: null as string | null,
    assetType: 'lexicon',
    fileContent: null as any,
    fileName: '',
    name: '',
    description: '',
    language: 'English',
    newLanguage: '',
    lexiconType: 'Theme',
    themeMode: 'Dark'
  });

  useEffect(() => {
    fetchAssets();
  }, [masonProfile]);

  const fetchAssets = async () => {
    setLoading(true);
    const { data } = await supabase.from('marketplace_assets').select('*').eq('author', masonProfile.name).order('created_at', { ascending: false });
    if (data) {
      setAssets(data);
      const dbLangs = data?.map(d => d.language).filter(Boolean) || [];
      const commonLangs = ["English", "Spanish", "French", "German", "Italian", "Portuguese", "Russian", "Japanese", "Korean", "Chinese"];
      setAvailableLanguages(Array.from(new Set([...commonLangs, ...dbLangs])) as string[]);
    }
    setLoading(false);
  };

  const handleEditAsset = (asset: any) => {
    setUploadState({
      isOpen: true,
      editId: asset.id,
      assetType: asset.asset_type,
      fileContent: typeof asset.json_data === 'string' ? JSON.parse(asset.json_data) : asset.json_data,
      fileName: asset.name,
      name: asset.name,
      description: asset.description || '',
      language: asset.language || (availableLanguages.length > 0 ? availableLanguages[0] : 'English'),
      newLanguage: '',
      lexiconType: asset.lexicon_type || 'Theme',
      themeMode: asset.theme_mode || 'Dark'
    });
  };

  const submitUpload = async () => {
    try {
      const finalLanguage = uploadState.language === 'add_new' ? uploadState.newLanguage : uploadState.language;
      const payload = {
        name: uploadState.name,
        description: uploadState.description,
        json_data: uploadState.fileContent,
        language: uploadState.assetType === 'lexicon' ? finalLanguage : null,
        lexicon_type: uploadState.assetType === 'lexicon' ? uploadState.lexiconType : null,
        theme_mode: uploadState.assetType === 'chameleon' ? uploadState.themeMode : null
      };
      
      if (uploadState.editId) {
        const { error } = await supabase.from('marketplace_assets').update(payload).eq('id', uploadState.editId);
        if (error) throw error;
        useStore.getState().pushStatus(`Updated listing successfully.`, "success");
        setUploadState(s => ({ ...s, isOpen: false }));
        fetchAssets();
      }
    } catch (err: any) {
      useStore.getState().pushStatus(`Error updating asset: ${err.message}`, "error");
    }
  };

  if (loading) return <div className="p-8 text-center theme-text-accent animate-pulse font-black tracking-widest uppercase">{t("mason_market_fetching")}</div>;

  const filteredAssets = assets.filter(a => {
    const matchCat = activeCategory === 'all' || a.asset_type === activeCategory;
    const matchSearch = a.name.toLowerCase().includes(searchQuery.toLowerCase()) || (a.description || "").toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className="flex flex-col w-full relative h-full pb-20">
      <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-white/5 w-full">
        <h2 className="text-xl font-black text-[var(--text)] uppercase tracking-widest flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("ui_icon_hub") || "storefront"}</span>
          </div>
          <span className="truncate">{t("mason_market_title") || "MARKETPLACE"}</span>
        </h2>
        <div className="flex items-center gap-3 relative flex-1 max-w-2xl ml-auto justify-end">
          <div className="relative flex-1 h-12 max-w-[300px]">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 !text-sm">{t("ui_icon_search") || "search"}</span>
            <input 
              value={searchQuery} 
              onChange={e => setSearchQuery(e.target.value)} 
              placeholder={t("mason_market_search") || "Search uploads..."} 
              className="w-full theme-glass-panel rounded-2xl pl-10 pr-10 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] hover:text-[var(--text)] transition-colors">
                <span className="material-symbols-outlined text-sm">{t("ui_icon_close") || "close"}</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 theme-glass-panel rounded-xl p-1 border border-white/5 shadow-inner h-12">
            <button onClick={() => setActiveCategory("all")} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeCategory === 'all' ? 'bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30 shadow-[0_0_15px_rgba(var(--accent-rgb),0.2)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5 border border-transparent'}`}>{t("mason_market_filter_all")}</button>
            <button onClick={() => setActiveCategory("lexicon")} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeCategory === 'lexicon' ? 'bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30 shadow-[0_0_15px_rgba(var(--accent-rgb),0.2)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5 border border-transparent'}`}>{t("market_filter_lexicons")}</button>
            <button onClick={() => setActiveCategory("chameleon")} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeCategory === 'chameleon' ? 'bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30 shadow-[0_0_15px_rgba(var(--accent-rgb),0.2)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5 border border-transparent'}`}>{t("market_filter_chameleons")}</button>
          </div>
        </div>
      </div>
      
      <div className="p-6 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-10">
        {filteredAssets.length === 0 ? (
          <div className="text-center p-12 theme-glass-inner rounded-3xl border border-transparent flex flex-col items-center gap-4">
            <div className="w-20 h-20 rounded-[1.5rem] theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-lg flex items-center justify-center">
              <span className="material-symbols-outlined !text-[36px] text-[var(--text)] opacity-50">{t("ui_icon_mason") || "construction"}</span>
            </div>
            <p className="text-[10px] font-bold text-[var(--subtext)] uppercase tracking-widest">{t("mason_market_no_assets") || "No assets found."}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredAssets.map(asset => (
              <div key={asset.id} onClick={() => handleEditAsset(asset)} className="theme-glass-panel rounded-[1.5rem] flex flex-col group cursor-pointer border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 overflow-hidden relative">
                
                {/* Top Side - Big Icon Block */}
                <div className="p-5 flex flex-col items-center justify-center relative bg-gradient-to-br from-[var(--accent)]/10 to-transparent group-hover:from-[var(--accent)]/15 transition-colors duration-500 h-36 shrink-0">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--accent)]/10 rounded-full blur-[30px] pointer-events-none mix-blend-screen" />
                  <span className="material-symbols-outlined !text-[72px] opacity-60 group-hover:opacity-100 theme-text-accent transition-all duration-500 drop-shadow-lg group-hover:scale-110 relative z-10">
                    {asset.asset_type === 'chameleon' ? 'palette' : 'translate'}
                  </span>
                  <div className="absolute top-4 right-4 text-[9px] font-black px-3 py-1 bg-[var(--bg)]/50 backdrop-blur-md text-[var(--accent)] rounded-lg uppercase tracking-widest border border-[var(--accent)]/20 shadow-lg z-20">
                    {asset.asset_type === 'chameleon' ? 'THEME' : 'LEXICON'}
                  </div>
                </div>
                
                {/* Divider */}
                <div className="relative h-px bg-[color-mix(in_srgb,var(--text)_5%,transparent)] w-full flex items-center justify-center z-20" />
                
                {/* Bottom Side - Content */}
                <div className="flex flex-col p-5 w-full flex-1 relative bg-gradient-to-tr from-[var(--bg)]/5 to-transparent group-hover:from-[var(--accent)]/5 transition-colors duration-500">
                  <span className="text-xl font-black text-[var(--text)] uppercase tracking-tighter truncate leading-tight group-hover:theme-text-accent transition-colors block w-full mb-2 relative z-10">
                    {asset.name || "Untitled"}
                  </span>
                  
                  <p className="text-xs font-bold text-[var(--subtext)] leading-relaxed line-clamp-2 opacity-80 group-hover:opacity-100 transition-opacity flex-1 relative z-10">
                    {asset.description || "No description provided."}
                  </p>
                </div>
                
                {/* Footer */}
                <div className="p-4 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-white/5 flex gap-2 relative z-10 items-center justify-between">
                   <span className="text-[10px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest flex items-center gap-1.5"><span className="material-symbols-outlined !text-[14px] normal-case">{t("ui_icon_download") || "download"}</span> {asset.downloads || 0}</span>
                   <button className="h-9 px-4 rounded-xl text-[10px] font-black text-[var(--accent)] border border-[var(--accent)]/30 bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20 hover:border-[var(--accent)]/50 backdrop-blur-md transition-all shadow-sm uppercase tracking-widest flex items-center justify-center gap-2">
                      <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_edit") || "edit"}</span> {t("ui_btn_edit") || "EDIT"}
                   </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <SidePanel
        isOpen={uploadState.isOpen}
        onClose={() => setUploadState(s => ({ ...s, isOpen: false }))}
        title={uploadState.assetType === 'lexicon' 
          ? (t("market_upload_lexicon_title") || "Upload Lexicon")
          : (t("market_upload_chameleon_title") || "Upload Chameleon")}
        subtitle={uploadState.name || "Draft"}
        icon="cloud_upload"
        footer={
          <div className="flex gap-4 w-full justify-end">
            <button 
              type="button" 
              onClick={() => setUploadState(s => ({ ...s, isOpen: false }))} 
              className={standardButtonClass}
            >
              {t("mason_cc_btn_cancel") || "CANCEL"}
            </button>
            <button 
              onClick={submitUpload}
              disabled={!uploadState.name || (uploadState.language === 'add_new' && !uploadState.newLanguage)}
              className={standardAccentGlassButtonClass}
            >
              <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_upload") || "upload"}</span> {t("market_upload_btn_publish") || "PUBLISH NOW"}
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2 animate-in slide-in-from-top-2">
            <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("market_upload_file") || "File Content"}</label>
            <div className="flex items-center gap-4">
              <div className="flex-1 theme-glass-inner rounded-xl px-4 py-3 text-sm font-bold text-[var(--text)] truncate opacity-70 border-l-4 border-l-[var(--accent)]">
                {uploadState.fileName || "No file selected"}
              </div>
              <button onClick={async () => {
                const selected = await open({ filters:[{ name: 'JSON', extensions: ['json'] }] });
                if (!selected) return;
                const content = await readTextFile(selected as string);
                setUploadState(s => ({ ...s, fileContent: JSON.parse(content), fileName: selected as string }));
              }} className={standardAccentGlassButtonClass}>
                {t("ui_btn_replace") || "REPLACE"}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">
              {uploadState.assetType === 'lexicon' 
                ? (t("market_upload_lexicon_name") || "Lexicon Name")
                : (t("market_upload_chameleon_name") || "Chameleon Name")}
            </label>
            <input 
              type="text" 
              value={uploadState.name}
              onChange={e => setUploadState(s => ({ ...s, name: e.target.value }))}
              className="w-full theme-glass-inner rounded-xl px-5 py-4 text-sm font-bold focus:outline-none focus:theme-border-accent transition-all text-[var(--text)]"
            />
          </div>
          
          <div className="flex flex-col gap-2">
            <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("market_upload_desc") || "Description"}</label>
            <textarea 
              value={uploadState.description}
              onChange={e => setUploadState(s => ({ ...s, description: e.target.value }))}
              className="w-full theme-glass-inner rounded-xl px-5 py-4 text-sm focus:outline-none focus:theme-border-accent transition-all min-h-[150px] text-[var(--text)] custom-scrollbar resize-none"
            />
          </div>

          {uploadState.assetType === 'lexicon' && (
            <>
              <div className="flex flex-col gap-2 relative z-[60]">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("market_upload_language") || "Language"}</label>
                <CustomDropdown disableTint={true} 
                  value={uploadState.language}
                  onChange={(val: string[]) => setUploadState(s => ({ ...s, language: val[0] }))}

                  options={[
                    ...availableLanguages.map(l => ({ id: l, label: l })),
                    { id: "add_new", label: t("market_upload_add_language") || "Add New Language..." }
                  ]}
                />
              </div>
              {uploadState.language === 'add_new' && (
                <div className="flex flex-col gap-2 animate-in slide-in-from-top-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("market_upload_new_language") || "New Language Name"}</label>
                  <input 
                    type="text" 
                    value={uploadState.newLanguage}
                    onChange={e => setUploadState(s => ({ ...s, newLanguage: e.target.value }))}
                    className="w-full theme-glass-inner rounded-xl px-5 py-4 text-sm font-bold focus:outline-none focus:theme-border-accent transition-all border-l-4 border-l-[var(--accent)] text-[var(--text)]"
                    placeholder="e.g. French"
                  />
                </div>
              )}
              <div className="flex flex-col gap-2 relative z-[50]">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("market_filter_type") || "Type"}</label>
                <CustomDropdown disableTint={true} 
                  value={uploadState.lexiconType}
                  onChange={(val: string[]) => setUploadState(s => ({ ...s, lexiconType: val[0] }))}

                  options={[
                    { id: "Theme", label: t("market_type_theme") || "Theme" },
                    { id: "Default", label: t("market_type_default") || "Default" }
                  ]}
                />
              </div>
            </>
          )}

          {uploadState.assetType === 'chameleon' && (
            <div className="flex flex-col gap-2 relative z-[60]">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("market_filter_mode") || "Theme Mode"}</label>
              <CustomDropdown disableTint={true} 
                value={uploadState.themeMode}
                onChange={(val: string[]) => setUploadState(s => ({ ...s, themeMode: val[0] }))}

                options={[
                  { id: "Dark", label: t("market_mode_dark") || "Dark" },
                  { id: "Light", label: t("market_mode_light") || "Light" }
                ]}
              />
            </div>
          )}
        </div>
      </SidePanel>
    </div>
  );
}
